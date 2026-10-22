"""Actual dashboard projection of a receipt; malformed totals cannot advertise full coverage."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import test_team_usage as fixtures
load,PACKAGE=fixtures.load,fixtures.PACKAGE

class TeamProjection(unittest.TestCase):
    setUp=fixtures.TeamUsage.setUp
    write=fixtures.TeamUsage.write
    collect=fixtures.TeamUsage.collect
    def test_actual_renderer_names_unknown_receipt_version(self):
        receipt=self.collect()['receipt'];receipt['schemaVersion']=6
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
        page=self.root/'v6.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=receipt))+';/*STATE-END*/'+after)
        p=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        value=json.loads(p.stdout);self.assertEqual(value['errors'],[])
        self.assertTrue('квитанция формата 6 — этот рендерер её не понимает' in value['html'],'unknown receipt version is invisible')

    def test_partial_child_subset_is_visibly_proven_only(self):
        receipt=self.collect()['receipt'];receipt['status']='incomplete';receipt['missing']=[dict(participant='master',reason='CHILD_INCOMPLETE')];receipt['coverage']['codex']['missing']=['master'];receipt['rows'][0].update(status='incomplete',reason='CHILD_INCOMPLETE')
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
        page=self.root/'partial-child.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=receipt))+';/*STATE-END*/'+after)
        result=json.loads(subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True).stdout)
        self.assertEqual(result['errors'],[]);self.assertTrue('из них субагенты — доказанная часть' in result['html'],'partial child subset label absent')
        self.assertTrue('полно 0' in result['html'] and 'частично 1' in result['html'],'full and partial coverage must be separate')

    def test_partial_numbers_and_named_no_data_reach_actual_dashboard(self):
        sova=fixtures.TeamUsage.add_sova(self);Path(sova['sources']['gateway']).unlink()
        receipt=load().public_receipt(self.collect()['receipt'],'run1')
        spec=importlib.util.spec_from_file_location('partial_projection',PACKAGE/'runtime/ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        receipt=ap.public_value(receipt,ap.PUBLIC_TEAM_RECEIPT)
        self.assertEqual(receipt['totals']['inputTokens'],100)
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
        page=self.root/'partial.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=receipt))+';/*STATE-END*/'+after)
        process=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        result=json.loads(process.stdout);self.assertEqual(result['errors'],[])
        self.assertIn('неполно у sova: SOURCE_UNAVAILABLE',result['html'])
        self.assertIn('нет данных',result['html']);self.assertIn('Итог проекта (неполный)',result['html']);self.assertIn('<td>100</td>',result['html'])
    def test_switcher_and_unknown_labels_survive_public_projection_and_actual_js(self):
        spec=importlib.util.spec_from_file_location('slot_projection',PACKAGE/'runtime/ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        for known,label in [(True,'по переключателю'),(False,'подписка не определена')]:
            if not known:self.g[0].pop('subscription');self.g[0].pop('authEpoch')
            self.write();receipt=load().public_receipt(self.collect()['receipt'],'run1')
            projected=ap.public_value(receipt,ap.PUBLIC_TEAM_RECEIPT)
            self.assertEqual(projected['rows'][0]['subscriptionSource'],'switcher' if known else 'unknown')
            self.assertEqual(projected['bySubscription']['codex-3' if known else 'unknown']['inputTokens'],100)
            text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
            page=self.root/'slots.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=projected))+';/*STATE-END*/'+after)
            output=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],text=True,capture_output=True,check=True)
            rendered=json.loads(output.stdout);self.assertEqual(rendered['errors'],[]);self.assertIn(label,rendered['html']);self.assertIn('100',rendered['html'])
    def test_projector_does_not_relabel_incomplete_as_team_total(self):
        self.assertTrue(hasattr(load(),'public_receipt'),'receipt projector missing')
        receipt=self.collect()['receipt'];receipt['totals']['modelCalls']=True
        try: load().public_receipt(receipt,'run1')
        except Exception as error: self.assertEqual(str(error),'RECEIPT_INVALID')
        else: self.fail('receipt projector accepted bool as model count')
    def test_actual_js_shows_named_missing_and_null_subagent_scope(self):
        self.assertTrue(hasattr(load(),'public_receipt'),'receipt projector missing')
        self.participant['home']=str(self.root/'missing')
        receipt=self.collect()['receipt']
        receipt=load().public_receipt(receipt,'run1')
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text()
        begin,end='/*STATE-BEGIN*/','/*STATE-END*/';before,tail=text.split(begin);_,after=tail.split(end)
        page=self.root/'page.html';page.write_text(before+begin+'window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=receipt))+';'+end+after)
        proc=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],text=True,capture_output=True,check=True)
        result=json.loads(proc.stdout);self.assertEqual(result['errors'],[])
        self.assertIn('HOME_UNAVAILABLE',result['html']);self.assertIn('master',result['html']);self.assertIn('из них субагенты',result['html'])
        self.assertIn('Codex 0 из 1',result['html']);self.assertIn('не измерено',result['html'])

    def test_real_public_projector_uses_trusted_receipt_boundary_not_actor_numbers(self):
        spec=importlib.util.spec_from_file_location('sadik_projection',PACKAGE/'runtime/ap_sadik.py')
        ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        receipt=self.collect()['receipt']
        class RootReceiptBoundary:
            Incomplete=load().Incomplete
            # Authenticated IO is tested separately; only this external boundary is replaced.
            @staticmethod
            def read_public(run_id,project=None):return load().public_receipt(receipt,run_id,project=project)
        ap.team_module=lambda:RootReceiptBoundary
        state=dict(title='copy',_sadik=dict(run_id='run1'),usageTeam=dict(totals=dict(inputTokens=999)))
        public,files=ap.public_payload(state,(PACKAGE/'overlay/phases/dashboard-template.html').read_text(),project=str(self.root/'project'))
        self.assertEqual(public['usageTeam']['totals']['inputTokens'],100)
        self.assertEqual(public['usageTeam']['coverage']['codex']['measured'],['master'])
        self.assertNotIn('home',json.dumps(public['usageTeam']))
        page=self.root/'public.html';page.write_bytes(files['dashboard.html'])
        output=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        rendered=json.loads(output.stdout);self.assertEqual(rendered['errors'],[])
        self.assertTrue('Codex 1 из 1' in rendered['html'],'team coverage lost by actual projector')

    def test_observed_buckets_survive_new_unbound_team_receipt(self):
        # Catch public Claude filtering and the usageTeam/usage renderer switch.
        from test_usage_contract import snapshot
        from html.parser import HTMLParser
        ap_spec=importlib.util.spec_from_file_location('coexisting_projection',PACKAGE/'runtime/ap_sadik.py')
        ap=importlib.util.module_from_spec(ap_spec);ap_spec.loader.exec_module(ap)
        usage=snapshot();usage['runId']='run1'
        usage['byEngine'].update(snapshot('claude')['byEngine'])
        usage['byEngine']['claude'].update(modelCalls=16,inputTokens=3821626,uncachedInputTokens=32,outputTokens=9419,cacheReadTokens=3765945,cacheWriteTokens=55649)
        self.r.pop(0);self.write()
        receipt=self.collect()['receipt']
        self.assertEqual(receipt['missing'],[dict(participant='master',reason='UNBOUND')])
        class Boundary:
            Incomplete=load().Incomplete
            @staticmethod
            def read_public(run_id,project=None):return load().public_receipt(receipt,run_id,project=project)
        ap.team_module=lambda:Boundary
        state=dict(title='copy',rev=1,_sadik=dict(run_id='run1'),usage=usage)
        before=copy.deepcopy(state)
        template=(PACKAGE/'overlay/phases/dashboard-template.html').read_text()
        public,files=ap.public_payload(state,template,project=str(self.root/'project'))
        self.assertEqual(state,before)
        for engine in ('codex','claude'):
            with self.subTest(engine=engine):self.assertEqual(public['usage']['byEngine'].get(engine),usage['byEngine'][engine])
        self.assertTrue(all(v is None for v in public['usageTeam']['totals'].values()))
        class Metrics(HTMLParser):
            def __init__(self):super().__init__();self.engine=None;self.metric=None;self.metrics={}
            def handle_starttag(self,tag,attrs):
                a=dict(attrs)
                if tag=='section' and a.get('data-engine'):self.engine=a['data-engine'];self.metrics[self.engine]={}
                if tag=='dd' and a.get('data-metric'):self.metric=a['data-metric']
            def handle_endtag(self,tag):
                if tag=='section':self.engine=None
                if tag=='dd':self.metric=None
            def handle_data(self,data):
                if self.engine and self.metric:self.metrics[self.engine][self.metric]=int(data)
        for lang in ('ru','en'):
            with self.subTest(lang=lang):
                page=self.root/'coexist.html';page.write_bytes(files['dashboard.html'])
                proc=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page),lang],text=True,capture_output=True,check=True)
                result=json.loads(proc.stdout);self.assertEqual(result['errors'],[])
                parsed=Metrics();parsed.feed(result['html'])
                self.assertEqual(parsed.metrics,dict(codex=dict(modelCalls=2,inputTokens=35,uncachedInputTokens=5,outputTokens=7,cacheReadTokens=20,cacheWriteTokens=10),claude=dict(modelCalls=16,inputTokens=3821626,uncachedInputTokens=32,outputTokens=9419,cacheReadTokens=3765945,cacheWriteTokens=55649)))
                for label in ('Поток оператора','Указанные родительские и дочерние запросы','неполно: нет R/G') if lang=='ru' else ('Operator thread','Declared parent and child requests','incomplete: no R/G'):
                    self.assertIn(label,result['html'])
                self.assertIn('usage-team',result['html']);self.assertIn('UNBOUND',result['html'])

    def test_claude_legacy_scope_is_taken_from_snapshot_not_a_fixed_agent_name(self):
        from test_usage_contract import snapshot
        spec=importlib.util.spec_from_file_location('claude_caption',PACKAGE/'runtime/ap_sadik.py')
        ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        template=(PACKAGE/'overlay/phases/dashboard-template.html').read_text()
        for coverage,ru,en in [('declared_parent_only','Указанные родительские запросы','Declared parent requests'),('declared_parent_and_children','Указанные родительские и дочерние запросы','Declared parent and child requests')]:
            usage=snapshot('claude');usage['byEngine']['claude']['coverage']=coverage
            public,files=ap.public_payload(dict(title='copy',rev=1,usage=usage,_sadik=dict(run_id=usage['runId'])),template)
            self.assertEqual(public['usage']['byEngine']['claude'],usage['byEngine']['claude'])
            page=self.root/'scope.html';page.write_bytes(files['dashboard.html'])
            for lang,want in [('ru',ru),('en',en)]:
                with self.subTest(coverage=coverage,lang=lang):
                    q=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page),lang],capture_output=True,text=True,check=True)
                    result=json.loads(q.stdout);self.assertEqual(result['errors'],[])
                    self.assertTrue(want in result['html'],'snapshot child scope lost')
                    self.assertNotIn('Сова ·',result['html']);self.assertNotIn('Sova ·',result['html'])

    def test_team_claude_row_uses_snapshot_participant(self):
        # Presentation fixture only: valid typed receipt, not a new usage measurement.
        receipt=self.collect()['receipt'];meter=load()
        name='fixture-auditor';totals=receipt['totals']
        receipt['coverage']=dict(codex=dict(expected=[],measured=[],missing=[]),claude=dict(expected=[name],measured=[name],missing=[]))
        receipt['rows'][0].update(participant=name,engine='claude',subscription='claude-1')
        receipt['byEngine']=dict(codex=dict.fromkeys(totals),claude=totals)
        receipt['bySubscription']={'claude-1':totals}
        receipt=meter.public_receipt(receipt,'run1')
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
        page=self.root/'named.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='copy',rev=1,usageTeam=receipt))+';/*STATE-END*/'+after)
        q=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        result=json.loads(q.stdout);self.assertEqual(result['errors'],[]);self.assertIn('fixture-auditor / claude / claude-1',result['html'])

    def test_nonmodel_publisher_keeps_operator_and_working_state(self):
        spec=importlib.util.spec_from_file_location('sadik_writer',PACKAGE/'runtime/ap_sadik.py')
        ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        self.assertTrue(hasattr(ap,'publish_team'),'telemetry-only publisher missing')
        receipt=self.collect()['receipt']
        class Boundary:
            Incomplete=load().Incomplete
            @staticmethod
            def read_public(run_id,project=None):return load().public_receipt(receipt,run_id,project=project)
        ap.team_module=lambda:Boundary
        skill=self.root/'release/skill';_fixture_mkdir(skill/'phases', mode=0o755, parents=True)
        (skill/'phases/dashboard-template.html').write_text((PACKAGE/'overlay/phases/dashboard-template.html').read_text())
        (skill.parent/'release.json').write_text(json.dumps(dict(upstream_sha='0'*40,local_revision='fixture')))
        project=self.root/'project';a=project/'.autopilot';_fixture_mkdir(a, parents=True, mode=0o700)
        meta=dict(run_id='run1',root=str(project),release=ap.release_pin(skill))
        from test_usage_contract import snapshot
        usage=snapshot();usage['runId']='run1';usage['byEngine'].update(snapshot('claude')['byEngine'])
        state=dict(title='candidate',rev=7,gates=dict(G3=dict(ok=False)),tickets=[dict(id='T1',status='in-progress')],_sadik=meta,usage=usage)
        (a/'state.js').write_text('window.STATE='+json.dumps(state))
        operator=dict(pid=12345,identity='unchanged');(a/'operator.json').write_text(json.dumps(operator));(a/'operator.lock').touch()
        ap.publish=lambda folder:dict(stage='copy-public-boundary')
        ap.publish_team(str(project),'run1')
        actual=json.loads((a/'state.js').read_text().split('=',1)[1]);self.assertEqual(actual['rev'],8)
        self.assertEqual(actual['gates'],state['gates']);self.assertEqual(actual['tickets'],state['tickets'])
        self.assertEqual(actual['usage'],usage,'team publisher replaced the scoped snapshots')
        self.assertEqual(json.loads((a/'operator.json').read_text()),operator)
        self.assertEqual(json.loads((a/'usage/receipt.json').read_text())['totals']['inputTokens'],100)
        import fcntl
        with (a/'operator.lock').open('r+') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            before=(a/'state.js').read_bytes()
            with self.assertRaises(ap.Refusal):ap.publish_team(str(project),'run1')
            self.assertEqual((a/'state.js').read_bytes(),before)

    def test_unavailable_reservation_is_nonblocking_for_normal_init(self):
        self.assertTrue(hasattr(load(),'reserved_run_id'),'nonblocking init reservation lookup missing')
        self.assertIsNone(load().reserved_run_id(str(self.root/'never-registered'),None))

    def test_receipt_for_another_project_is_not_authoritative_for_this_one(self):
        receipt=self.collect()['receipt']
        self.assertIn('projectRef',receipt,'authoritative receipt has no project binding')
        meter=load()
        with self.assertRaisesRegex(meter.Incomplete,'RECEIPT_INVALID'):
            meter.public_receipt(receipt,'run1',project=str(self.root/'other-project'))

if __name__=='__main__':unittest.main(verbosity=2)
