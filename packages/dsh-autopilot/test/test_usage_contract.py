"""Numeric usage survives the actual public export; corrupted buckets never become zero."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import importlib.util
import copy
import contextlib
import io
from types import SimpleNamespace
import json
from pathlib import Path
import unittest
import subprocess
import tempfile
import tarfile

PACKAGE = Path(__file__).resolve().parents[1]


def module():
    spec = importlib.util.spec_from_file_location('usage_projection', PACKAGE / 'runtime/ap_sadik.py')
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def snapshot(engine='codex'):
    return {'schemaVersion': 1, 'runId': '1234567890abcdef1234567890abcdef', 'byEngine': {engine: {
        'status': 'observed', 'measuredAt': '2026-10-17T00:00:00Z',
        'windowStart': '2026-10-16T23:00:00Z', 'windowEnd': '2026-10-16T23:59:00Z',
        'source': 'codex-rollout-gateway' if engine == 'codex' else 'claude-sdk-jsonl',
        'scope': 'declared_threads' if engine == 'codex' else 'declared_requests',
        'coverage': 'root_gateway_only' if engine == 'codex' else 'declared_parent_and_children',
        'modelCalls': 2, 'inputTokens': 35, 'uncachedInputTokens': 5,
        'outputTokens': 7, 'cacheReadTokens': 20, 'cacheWriteTokens': 10}}}


class UsageContract(unittest.TestCase):
    def test_accepted_observed_claude_survives_public_projection(self):
        # Accepted Sova usage must not disappear when adding team accounting.
        ap=module(); usage=snapshot(); usage['byEngine'].update(snapshot('claude')['byEngine'])
        state={'usage':usage,'_sadik':{'run_id':usage['runId']}}
        before=copy.deepcopy(state)
        public,files=ap.public_payload(state,'<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
        self.assertEqual(set(public['usage']['byEngine']),{'codex','claude'})
        self.assertEqual(public['usage']['byEngine']['codex']['inputTokens'],35)
        self.assertEqual(public['usage']['byEngine']['claude'],usage['byEngine']['claude'])
        self.assertIn(b'"claude"',files['state.js'])
        self.assertEqual(state,before,'hiding must not erase private Claude or alter Codex')

    def test_dashboard_ignores_unproven_claude_in_legacy_embedded_state(self):
        # Renderer must not reintroduce a Claude card from old/adversarial public data.
        usage=snapshot();usage['byEngine'].update(snapshot('claude')['byEngine'])
        usage['byEngine']['claude']['inputTokens']=True
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text()
        begin,end='/*STATE-BEGIN*/','/*STATE-END*/'
        prefix,tail=text.split(begin);_,suffix=tail.split(end)
        page=prefix+begin+'window.STATE='+json.dumps({'title':'copy','usage':usage,'rev':1})+';'+end+suffix
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'dashboard.html';path.write_text(page)
            r=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(path)],capture_output=True,text=True,check=True)
        actual=json.loads(r.stdout);self.assertEqual(actual['errors'],[])
        self.assertIn('data-engine="codex"',actual['html'])
        self.assertFalse('data-engine="claude"' in actual['html'],'unproven Claude card rendered')

    def test_observed_usage_reaches_exported_state_and_embedded_dashboard(self):
        ap = module(); usage = snapshot()
        state = {'title': 'copy', 'usage': usage, '_sadik': {'run_id': usage['runId']}}
        public, files = ap.public_payload(state, '<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
        self.assertIsInstance(public.get('usage'), dict, 'numeric usage was dropped by public projection')
        basket = public['usage']['byEngine']['codex']
        self.assertEqual([basket[k] for k in ('modelCalls', 'inputTokens', 'outputTokens', 'cacheReadTokens')], [2, 35, 7, 20])
        written = json.loads(files['state.js'].decode().split('=', 1)[1])
        self.assertEqual(written['usage']['byEngine']['codex'], basket)
        self.assertIn(b'"inputTokens": 35', files['dashboard.html'])


    def test_real_dashboard_renders_codex_without_a_claude_card(self):
        ap = module(); usage = snapshot()
        state = {'title':'usage-copy','rev':1,'usage':usage,'_sadik':{'run_id':usage['runId']}}
        template = PACKAGE / 'overlay/phases/dashboard-template.html'
        if template.exists():
            text = template.read_text()
        else:
            lock = json.loads((PACKAGE/'source-lock.json').read_text())
            with tarfile.open(PACKAGE/lock['archive']) as archive:
                text = archive.extractfile('upstream/skills/autopilot/phases/dashboard-template.html').read().decode()
        public, files = ap.public_payload(state, text)
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory)/'dashboard.html'; page.write_bytes(files['dashboard.html'])
            run = subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        rendered = json.loads(run.stdout)
        self.assertEqual(rendered['errors'], [])
        self.assertTrue('class="hero' in rendered['html'], 'dashboard platform did not render')
        self.assertTrue('data-engine="codex"' in rendered['html'], 'Codex usage bucket missing')
        self.assertFalse('data-engine="claude"' in rendered['html'],'unproven Claude card rendered')
        self.assertIn('data-metric="inputTokens">35<', rendered['html'])


    def test_codex_reader_emits_snapshot_from_numeric_records_not_text_report(self):
        lock = json.loads((PACKAGE/'source-lock.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory); sessions = home/'sessions/2026/10/17'; _fixture_mkdir(sessions, mode=0o755, parents=True)
            rows = [{'type':'session_meta','payload':{'id':'thread'}},
                {'type':'event_msg','timestamp':'2026-10-17T00:00:00Z','payload':{'type':'task_started','turn_id':'t1'}}]
            for rid, stamp, inp, cache, write, output in [('r1','00:01:00',20,10,5,3),('r2','00:02:00',15,10,5,4)]:
                rows.append({'type':'token_usage_record','timestamp':'2026-10-17T'+stamp+'Z',
                    'payload':{'turn_id':'t1','response_id':rid,'usage':{'input_tokens':inp,'cached_input_tokens':cache,
                    'cache_write_input_tokens':write,'output_tokens':output,'reasoning_output_tokens':0}}})
            rows.append({'type':'event_msg','timestamp':'2026-10-17T00:02:01Z','payload':{'type':'task_complete','turn_id':'t1'}})
            (sessions/'rollout-test.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
            gateway=home/'dsh-usage-hodov.jsonl'
            good={'thread':'thread','turn':'t1','ts':'2026-10-17T00:02:02Z','polnota':'ok','vyzovov':2,'input':35,'cached':20,'output':7,'reasoning':0}
            gateway.write_text(json.dumps(good)+'\n')
            measure=home/'measure-run.py'
            with tarfile.open(PACKAGE/lock['archive']) as archive:measure.write_bytes(archive.extractfile('upstream/tools/measure-run.py').read())
            argv=['python3','-I','-B',str(PACKAGE/'tools/measure-run-codex.py'),'--measure-run',str(measure),'--codex-home',str(home),'--potok','thread',
                '--s','2026-10-17T00:00:00Z','--po','2026-10-17T00:03:00Z','--snapshot-json','--run-id',snapshot()['runId']]
            run=subprocess.run(argv,capture_output=True,text=True,check=False)
            self.assertEqual(run.returncode,0,run.stdout+run.stderr)
            value=json.loads(run.stdout); basket=value['byEngine']['codex']
            self.assertEqual([basket[k] for k in ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')],[2,35,5,7,20,10])
            # Source damage must not be reinterpreted as a measured zero.
            good['input']=36;gateway.write_text(json.dumps(good)+'\n')
            run=subprocess.run(argv,capture_output=True,text=True,check=False)
            self.assertEqual(run.returncode,2,run.stdout+run.stderr)
            bad=json.loads(run.stdout)['byEngine']['codex']
            self.assertEqual(bad['status'],'incomplete');self.assertIsNone(bad['inputTokens'])


    def test_corrupted_public_bucket_is_unknown_without_losing_healthy_engine(self):
        ap=module(); usage=snapshot();usage['byEngine'].update(snapshot('claude')['byEngine'])
        for field,bad in [('modelCalls',True),('inputTokens',-1),('outputTokens',7.5),('source','foreign'),('measuredAt','broken'),('coverage',[])]:
            with self.subTest(field=field):
                value=copy.deepcopy(usage);value['byEngine']['codex'][field]=bad
                public,_=ap.public_payload({'usage':value,'_sadik':{'run_id':usage['runId']}},'<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
                buckets=public['usage']['byEngine'];self.assertEqual(buckets['codex']['status'],'not_measured')
                self.assertIsNone(buckets['codex']['inputTokens']);self.assertEqual(buckets['claude'],usage['byEngine']['claude'])
        value=copy.deepcopy(usage);value['byEngine']['codex']['unexpected']='PRIVATE_EXTRA_FIELD_SHOULD_NOT_APPEAR'
        _,files=ap.public_payload({'usage':value},'<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
        self.assertNotIn(b'PRIVATE_EXTRA_FIELD_SHOULD_NOT_APPEAR',files['state.js'])

    def test_zero_is_measured_while_unavailable_values_stay_null(self):
        ap=module();value=snapshot();bucket=value['byEngine']['codex']
        for field in ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'):bucket[field]=0
        public,_=ap.public_payload({'usage':value},'<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
        self.assertEqual(public['usage']['byEngine']['codex']['inputTokens'],0)
        self.assertNotIn('claude',public['usage']['byEngine'])


    def test_codex_snapshot_refuses_cut_child_and_missing_selected_root_total(self):
        spec=importlib.util.spec_from_file_location('counter_snapshot',PACKAGE/'tools/measure-run-codex.py')
        reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
        def event(kind,turn,at):return {'type':'event_msg','timestamp':'2026-10-16T'+at+'Z','payload':{'type':kind,'turn_id':turn}}
        def token(turn,rid,at):return {'type':'token_usage_record','timestamp':'2026-10-16T'+at+'Z','payload':{'turn_id':turn,'response_id':rid,'usage':{'input_tokens':20,'cached_input_tokens':5,'cache_write_input_tokens':0,'output_tokens':2,'reasoning_output_tokens':0}}}
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);sessions=home/'sessions/2026/10/16';_fixture_mkdir(sessions, mode=0o755, parents=True)
            root=[{'type':'session_meta','payload':{'id':'root'}},event('task_started','t1','01:00:01'),token('t1','r1','01:01:00'),event('task_complete','t1','01:02:00'),event('task_started','t2','01:03:00'),token('t2','r2','01:04:00'),event('task_complete','t2','01:05:00')]
            child=[{'type':'session_meta','payload':{'id':'child','source':{'subagent':{'thread_spawn':{'parent_thread_id':'root','agent_path':'child'}}}}},event('task_started','tc','01:01:00'),token('tc','rc','01:03:00'),event('task_complete','tc','01:06:00')]
            gateway=[{'thread':'root','turn':t,'ts':'2026-10-16T'+at+'Z','polnota':'ok','vyzovov':1,'input':20,'cached':5,'output':2,'reasoning':0} for t,at in [('t1','01:02:01'),('t2','01:05:01')]]
            def write():
                for name,rows in [('root',root),('child',child)]:
                    (sessions/('rollout-'+name+'.jsonl')).write_text(''.join(json.dumps(r)+'\n' for r in rows))
                (home/'dsh-usage-hodov.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in gateway))
            lock=json.loads((PACKAGE/'source-lock.json').read_text());measure=home/'measure.py'
            with tarfile.open(PACKAGE/lock['archive']) as tar:measure.write_bytes(tar.extractfile('upstream/tools/measure-run.py').read())
            args=SimpleNamespace(s='2026-10-16T01:00:00Z',po='2026-10-16T01:10:00Z',run_id=snapshot()['runId'],measure_run=str(measure),codex_home=str(home),potok='root',s_shlyuza=None)
            def call(want):
                write();out=io.StringIO()
                with contextlib.redirect_stdout(out),contextlib.redirect_stderr(io.StringIO()):code=reader.snapshot_json(args)
                self.assertEqual(code,want)
                value=json.loads(out.getvalue())['byEngine']['codex']
                self.assertEqual(value['status'],'observed' if want==0 else 'incomplete')
                if want:self.assertIsNone(value['modelCalls'])
            call(0)
            child[-1]['timestamp']='2026-10-16T01:11:00Z'
            call(2)
            child[-1]['timestamp']='2026-10-16T01:06:00Z'
            call(0)
            first=gateway.pop(0)
            call(2)
            gateway.insert(0,first)
            call(0)
            late=token('t1','r1','01:11:00');late['payload']['usage']['input_tokens']=30
            root.append(late);gateway[0]['input']=30
            call(2)
            root.pop();gateway[0]['input']=20
            call(0)
            gateway[0]['input']=20.0
            call(2)
            gateway[0]['input']=20
            call(0)
            gateway.append([])
            call(2)
            gateway.pop()
            call(0)


    def test_unfinished_window_can_publish_a_null_snapshot_with_known_bounds(self):
        ap=module();value=snapshot('claude');bucket=value['byEngine']['claude']
        bucket.update(status='not_measured',coverage='unavailable',windowEnd='2099-01-01T00:00:00Z')
        for key in ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'):bucket[key]=None
        public,_=ap.public_payload({'usage':value},'<script>/*STATE-BEGIN*/window.STATE=null;/*STATE-END*/</script>')
        self.assertNotIn('claude',public['usage']['byEngine'])
        actual=ap.usage_bucket(bucket,'claude')
        self.assertEqual(actual['windowEnd'],'2099-01-01T00:00:00Z')
        self.assertEqual(actual['measuredAt'],'2026-10-17T00:00:00Z')
        self.assertIsNone(actual['inputTokens'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
