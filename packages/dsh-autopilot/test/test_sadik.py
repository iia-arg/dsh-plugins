"""Part B acceptance: real ap.py CLI, isolated projects/releases/public roots."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import contextlib
import hashlib
import importlib.util
import io
import stat
from unittest import mock
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

SKILL = Path(os.environ['AUTOPILOT_TEST_SKILL']).resolve()


def state(project):
    return json.loads((project/'.autopilot/state.js').read_text().split('=', 1)[1])


class Sadik(unittest.TestCase):
    def test_empty_plan_is_failed_in_saved_and_public_state_before_exit(self):
        current = self.init()
        run = self.project / '.autopilot' / current['dir']
        manifest = run / 'manifest.md'
        ticket = run / 'tickets/01-main.md'
        for text, requirement, passed in [
            (None, None, False), ('', None, False),
            ('| ID | Text | Status |\n', None, False), ('', 'X01', False),
            ('| R01 | Keep item | in-ticket |\n', None, False),
            ('| R01 | Keep item | in-ticket |\n', 'R01', True),
            ('| R01 | Keep item | in-ticket |\n', None, False),
            ('| R01 | Keep item | in-ticket |\n', 'hidden:R01', False),
            ('| R01 | Keep item | in-ticket |\n', 'R01', True),
        ]:
            with self.subTest(text=text, requirement=requirement, passed=passed):
                if text is None:
                    manifest.unlink(missing_ok=True)
                else:
                    manifest.write_text(text)
                hidden_ticket = run / 'tickets/.hidden.md'
                hidden_ticket.unlink(missing_ok=True)
                if requirement == 'hidden:R01':
                    ticket.unlink(missing_ok=True)
                    hidden_ticket.write_text('# 01 Main\n**Requirements:** R01\n**Zone:** `src/`\n**Wave:** 1\n')
                elif requirement is None:
                    ticket.unlink(missing_ok=True)
                else:
                    ticket.write_text('# 01 Main\n**Requirements:** ' + requirement + '\n**Zone:** `src/`\n**Wave:** 1\n')
                reply = self.call('check-plan')
                self.assertEqual(reply.returncode, 0 if passed else 1, reply.stdout + reply.stderr)
                saved = state(self.project)
                public = json.loads((self.exported(saved) / 'state.js').read_text().split('=', 1)[1])
                self.assertIs(saved['gates']['G3']['ok'], passed)
                self.assertEqual(public['gates']['G3'], saved['gates']['G3'])
                if not passed:
                    self.assertGreater(saved['gates']['G3']['problems'], 0)
                    self.assertIn('план пуст', reply.stdout)

    def test_g3_failure_exits_after_private_and_public_gate_are_saved(self):
        current = self.init()
        run = self.project / '.autopilot' / current['dir']
        (run / 'manifest.md').write_text('| ID | Text | Status |\n| R01 | Keep item | in-ticket |\n')
        ticket = run / 'tickets/01-main.md'
        for requirement, passed in [('R99', False), ('R01', True), ('R99', False), ('R01', True)]:
            ticket.write_text('# 01 Main\n\n**Requirements:** ' + requirement + '\n**Zone:** `src/`\n**Wave:** 1\n')
            reply = self.call('check-plan')
            self.assertEqual(reply.returncode, 0 if passed else 1, reply.stdout + reply.stderr)
            saved = state(self.project)
            public = json.loads((self.exported(saved) / 'state.js').read_text().split('=', 1)[1])
            self.assertIs(saved['gates']['G3']['ok'], passed)
            self.assertEqual(public['gates']['G3'], saved['gates']['G3'])

    def test_invalid_init_dials_refuse_before_creating_state(self):
        for key in ('mode', 'depth'):
            reply = self.call('init', '--slug', 'fixture', '--' + key, 'bogus', '--skill-dir', str(self.release))
            self.assertEqual(reply.returncode, 2, reply.stdout + reply.stderr)
            self.assertFalse((self.project / '.autopilot/state.js').exists())

    def test_invalid_force_and_set_dials_preserve_state_and_publication(self):
        initial = self.init()
        before = (self.project / '.autopilot/state.js').read_bytes()
        public = self.exported(initial) / 'state.js'
        public_before = public.read_bytes()
        for args in [('init', '--slug', 'fixture', '--force', '--mode', 'bad', '--skill-dir', str(self.release)),
                     ('init', '--slug', 'fixture', '--force', '--depth', 'bad', '--skill-dir', str(self.release)),
                     ('set', 'title=must-not-stick', 'mode=bad'), ('set', 'depth=bad'),
                     ('set', 'mode=null'), ('set', 'depth=')]:
            reply = self.call(*args)
            self.assertEqual(reply.returncode, 2, reply.stdout + reply.stderr)
            self.assertEqual((self.project / '.autopilot/state.js').read_bytes(), before)
            self.assertEqual(public.read_bytes(), public_before)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ap-sadik-')
        self.root = Path(self.tmp.name)
        self.public = self.root/'public'; _fixture_mkdir(self.public, mode=0o755)
        (self.public/'gamma').mkdir(mode=0o750);(self.public/'gamma').chmod(0o2750)
        spec = json.loads((SKILL.parent/'release.json').read_text())
        name = spec['upstream_sha'] + '-' + spec['local_revision']
        self.release = self.root/'releases'/name/'skill'; _fixture_mkdir(self.release.parent, mode=0o755, parents=True)
        shutil.copytree(SKILL, self.release, ignore=shutil.ignore_patterns('__pycache__'))
        # Match installer: a project copy keeps its common-limit release pin.
        for name in ('ap.py','ap_sadik.py'):
            helper = self.release/'tools'/name
            body = helper.read_text()
            old_pin = '_DSH_RELEASE_SKILL = ' + repr(str(SKILL))
            if old_pin in body:
                body = body.replace(old_pin, '_DSH_RELEASE_SKILL = ' + repr(str(self.release)))
            else:
                body = '_DSH_RELEASE_SKILL = ' + repr(str(self.release)) + '\n' + body
            helper.write_text(body)
        (self.release.parent/'pilot').mkdir(mode=0o755)
        shutil.copyfile(SKILL.parent/'pilot/task_limits.py',self.release.parent/'pilot/task_limits.py')
        if (SKILL.parent/'release.json').is_file():
            shutil.copy(SKILL.parent/'release.json',self.release.parent/'release.json')
        self.project = self.make_project('one')
        self.env = dict(os.environ, AUTOPILOT_NO_UPDATE_CHECK='1', AUTOPILOT_PUBLIC_ROOT=str(self.public),
                        AUTOPILOT_AGENT='gamma', AUTOPILOT_OPERATOR_PID=str(os.getpid()), PYTHONDONTWRITEBYTECODE='1')

    def tearDown(self):
        self.tmp.cleanup()

    def make_project(self, name):
        p = self.root/name; _fixture_mkdir(p/'.autopilot', parents=True, mode=0o700)
        shutil.copy(self.release/'tools/ap.py', p/'.autopilot/ap.py')
        if (self.release/'tools/ap_sadik.py').exists():
            shutil.copy(self.release/'tools/ap_sadik.py', p/'.autopilot/ap_sadik.py')
            shutil.copy(self.release/'tools/run_catalog.py', p/'.autopilot/run_catalog.py')
        shutil.copy(self.release/'phases/dashboard-template.html', p/'.autopilot/dashboard.html')
        subprocess.run(['git','init','-q',str(p)],check=True,capture_output=True)
        return p

    def call(self, *args, project=None, env=None, timeout=12):
        p = project or self.project
        return subprocess.run([sys.executable,'-B',str(p/'.autopilot/ap.py'),*args,'--no-serve'],
                              cwd=p,env=env or self.env,capture_output=True,text=True,timeout=timeout)

    def init(self, project=None):
        q=self.call('init','--slug','same-slug','--skill-dir',str(self.release),project=project)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        return state(project or self.project)

    def exported(self, s):
        meta=json.loads((self.project/'.autopilot/sadik.json').read_text())
        return self.public/'gamma'/meta['project_id']/meta['run_id']

    def test_usage_snapshot_writes_only_selected_bucket_and_exports_it(self):
        initial = self.init()
        self.assertIsInstance(initial.get('usage'), dict)
        self.assertEqual(set(initial['usage']['byEngine']), {'codex','claude'})
        self.assertIsNone(initial['usage']['byEngine']['codex']['inputTokens'])
        self.assertIsNone(initial['usage']['byEngine']['claude']['inputTokens'])
        from test_usage_contract import snapshot
        value = snapshot(); value['runId'] = initial['_sadik']['run_id']
        source = self.root / 'codex.snapshot.json'
        source.write_text(json.dumps(value)); source.chmod(0o600)
        result = self.call('usage', 'codex', '--snapshot', str(source))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        saved = state(self.project)
        self.assertEqual(saved['usage']['byEngine']['codex']['inputTokens'], 35)
        self.assertIsNone(saved['usage']['byEngine']['claude']['inputTokens'])
        remote = json.loads((self.exported(saved) / 'state.js').read_text().split('=', 1)[1])
        self.assertEqual(remote['usage']['byEngine']['codex']['modelCalls'], 2)

    def test_usage_merge_repeat_stale_and_corruption_preserve_other_bucket(self):
        from test_usage_contract import snapshot
        current = self.init(); rid = current['_sadik']['run_id']
        source = self.root / 'usage.json'
        def send(value, engine):
            value['runId'] = rid; source.write_text(json.dumps(value)); source.chmod(0o600)
            return self.call('usage', engine, '--snapshot', str(source))
        self.assertEqual(send(snapshot(), 'codex').returncode, 0)
        # Master-owned Claude input now refuses; root-owned success/merge uses the privileged suite.
        before=(self.project/'.autopilot/state.js').read_bytes()
        self.assertEqual(send(snapshot('claude'), 'claude').returncode, 2)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),before)
        both = state(self.project)['usage']['byEngine']
        self.assertEqual(send(snapshot(), 'codex').returncode, 0)
        self.assertEqual(state(self.project)['usage']['byEngine'], both)
        for label, edit in [
            ('foreign run', lambda x: x.update(runId='other')),
            ('negative', lambda x: x['byEngine']['codex'].update(outputTokens=-1)),
            ('bool', lambda x: x['byEngine']['codex'].update(modelCalls=True)),
            ('float', lambda x: x['byEngine']['codex'].update(inputTokens=35.0)),
            ('unsafe integer', lambda x: x['byEngine']['codex'].update(outputTokens=9007199254740992)),
            ('sum', lambda x: x['byEngine']['codex'].update(inputTokens=36)),
            ('source', lambda x: x['byEngine']['codex'].update(source='other')),
            ('extra', lambda x: x['byEngine']['codex'].update(private='DO_NOT_EXPORT')),
            ('stale', lambda x: x['byEngine']['codex'].update(measuredAt='2026-10-16T23:59:30Z')),
        ]:
            with self.subTest(label=label):
                value = snapshot(); value['runId'] = rid; edit(value)
                source.write_text(json.dumps(value)); source.chmod(0o600)
                before = (self.project/'.autopilot/state.js').read_bytes()
                remote = (self.exported(current)/'state.js').read_bytes()
                r = self.call('usage','codex','--snapshot',str(source))
                self.assertEqual(r.returncode,2,r.stdout+r.stderr)
                self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),before)
                self.assertEqual((self.exported(current)/'state.js').read_bytes(),remote)
        value=snapshot(); bucket=value['byEngine']['codex'];bucket.update(status='incomplete',coverage='incomplete',measuredAt='2026-10-17T00:01:00Z')
        for key in ('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'):bucket[key]=None
        self.assertEqual(send(value,'codex').returncode,0)
        saved=state(self.project)['usage']['byEngine']
        self.assertIsNone(saved['codex']['inputTokens']);self.assertEqual(saved['claude'],both['claude'])

    def test_events_wait_answer_finish_and_pair(self):
        s=self.init();dest=self.exported(s)
        self.assertEqual(set(p.name for p in dest.iterdir()),{'dashboard.html','state.js'})
        for args in [('ask','briefing','--note','question'),('answered',),('finish','--result','done')]:
            q=self.call(*args);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
            current=state(self.project);remote=json.loads((dest/'state.js').read_text().split('=',1)[1])
            self.assertEqual(remote["rev"],current["rev"]);self.assertEqual(remote["waiting"],current["waiting"])
            self.assertIn('window.STATE='+json.dumps(remote,ensure_ascii=False).replace('<',r'\u003c')+';', (dest/'dashboard.html').read_text())
        self.assertTrue(remote['finishedAt']);self.assertFalse((self.project/'.autopilot/serve.pid').exists())

    def test_unknown_and_traversal_refuse_before_state_write(self):
        for args in [('init','--slug','x','--unknown','x'),('init','--slug','../escape'),('init','--slug','x','--dry-run')]:
            q=self.call(*args);self.assertNotEqual(q.returncode,0,q.stdout+q.stderr)
            self.assertFalse((self.project/'.autopilot/state.js').exists())
            self.assertFalse((self.project/'.autopilot/sadik.json').exists())

    def test_export_failure_does_not_drop_event_and_recovers(self):
        s=self.init();dest=self.exported(s);old=(dest/'state.js').read_bytes()
        os.rename(dest,dest.with_name(dest.name+'-old'));dest.symlink_to(dest.with_name(dest.name+'-old'),target_is_directory=True)
        q=self.call('ask','action','--note','kept');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('панель не обновлена',q.stdout+q.stderr);self.assertIn('последняя удачная',q.stdout+q.stderr)
        self.assertTrue(state(self.project)['waiting']);self.assertEqual((dest/'state.js').read_bytes(),old)
        dest.unlink();os.rename(dest.with_name(dest.name+'-old'),dest)
        q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertEqual(json.loads((dest/'state.js').read_text().split('=',1)[1])['rev'],state(self.project)['rev'])

    def test_two_projects_same_slug_have_different_urls(self):
        first=self.init();url1=self.exported(first);p2=self.make_project('two');self.init(p2)
        m2=json.loads((p2/'.autopilot/sadik.json').read_text());url2=self.public/'gamma'/m2['project_id']/m2['run_id']
        self.assertNotEqual(url1,url2);self.assertTrue((url1/'state.js').exists());self.assertTrue((url2/'state.js').exists())

    def test_second_operator_refuses_without_touching_files(self):
        self.init();before={p.relative_to(self.project):p.read_bytes() for p in self.project.rglob('*') if p.is_file() and '.git' not in p.parts}
        code='import os,subprocess,sys; e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid())); q=subprocess.run(sys.argv[1:],env=e,capture_output=True,text=True);print(q.stdout+q.stderr);sys.exit(q.returncode)'
        q=subprocess.run([sys.executable,'-B','-c',code,sys.executable,'-B',str(self.project/'.autopilot/ap.py'),'--no-serve','answered'],cwd=self.project,env=self.env,capture_output=True,text=True)
        self.assertNotEqual(q.returncode,0,q.stdout+q.stderr)
        after={p.relative_to(self.project):p.read_bytes() for p in self.project.rglob('*') if p.is_file() and '.git' not in p.parts}
        self.assertEqual(before,after)

    def test_direct_global_entry_creates_project_only_after_validation(self):
        p=self.root/'fresh';_fixture_mkdir(p, mode=0o755)
        q=subprocess.run([sys.executable,'-B',str(self.release/'tools/ap.py'),'--no-serve','init','--slug','fresh','--skill-dir',str(self.release)],cwd=p,env=self.env,capture_output=True,text=True)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertTrue((p/'.autopilot/state.js').is_file())
        self.assertFalse((self.release/'tools/state.js').exists())

    def test_empty_or_invalid_owner_record_refuses_and_recovers(self):
        self.init();path=self.project/'.autopilot/operator.json';original=path.read_bytes()
        ledger=(self.project/'.autopilot/state.js').read_bytes()
        path.write_text('{}\n');before=hashlib.sha256(original).hexdigest();after=hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertNotEqual(before,after);self.assertEqual(path.read_text().count('{}'),1)
        print('DAMAGE owner',before,'->',after,'fixed count=1',flush=True)
        q=self.call('answered');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
        path.write_bytes(original);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
        q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_age_does_not_release_live_operator(self):
        self.init();owner=self.project/'.autopilot/operator.json';os.utime(owner,ns=(1,1));self.assertEqual(owner.stat().st_mtime_ns,1)
        code='import os,subprocess,sys; e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid())); p=subprocess.run(sys.argv[1:],env=e,capture_output=True,text=True); print(p.stdout+p.stderr);sys.exit(p.returncode)'
        q=subprocess.run([sys.executable,'-B','-c',code,sys.executable,'-B',str(self.project/'.autopilot/ap.py'),'answered','--no-serve'],cwd=self.project,env=self.env,capture_output=True,text=True)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertIn('живой оператор',q.stdout+q.stderr)
        os.utime(owner,None)
        self.assertEqual(self.call('answered').returncode,0)

    def test_pinned_release_corruption_refuses_then_recovers(self):
        self.init();target=self.release/'SKILL.md';original=target.read_bytes();ledger=(self.project/'.autopilot/state.js').read_bytes()
        target.write_bytes(original+b'\nCORRUPTED-PIN\n');self.assertEqual(target.read_text().count('CORRUPTED-PIN'),1)
        before=hashlib.sha256(original).hexdigest();after=hashlib.sha256(target.read_bytes()).hexdigest();self.assertNotEqual(before,after)
        print('DAMAGE pinned release',before,'->',after,'fixed count=1',flush=True)
        q=self.call('resume');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('закреплённая версия',q.stdout+q.stderr)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
        target.write_bytes(original);self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),before)
        self.assertEqual(self.call('resume').returncode,0)

    def test_fifo_in_export_is_refused_without_hanging_and_recovers(self):
        s=self.init();dest=self.exported(s);target=dest/'state.js';original=target.read_bytes();page=(dest/'dashboard.html').read_bytes()
        target.unlink();os.mkfifo(target,0o600);self.assertTrue(stat.S_ISFIFO(target.lstat().st_mode))
        print('DAMAGE export FIFO',str(target),oct(target.lstat().st_mode),flush=True)
        started=time.monotonic();q=self.call('ask','action','--note','kept');self.assertLess(time.monotonic()-started,5)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('панель не обновлена',q.stdout+q.stderr)
        self.assertTrue(state(self.project)['waiting']);self.assertEqual((dest/'dashboard.html').read_bytes(),page)
        target.unlink();target.write_bytes(original)
        self.assertEqual(self.call('answered').returncode,0)
        self.assertEqual(json.loads((target).read_text().split('=',1)[1])['rev'],state(self.project)['rev'])

    def test_export_child_timeout_is_bounded_and_accounting_survives(self):
        self.init();q=self.call('ask','action','--note','recorded');self.assertEqual(q.returncode,0)
        ledger=(self.project/'.autopilot/state.js').read_bytes()
        spec=importlib.util.spec_from_file_location('sadik_timeout',self.release/'tools/ap_sadik.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        popen=subprocess.Popen;children=[]
        def stalled(*args,**kwargs):
            child=popen([sys.executable,'-c','import time;time.sleep(30)'],**kwargs);children.append(child);return child
        fd=module.open_dir(self.project/'.autopilot');out=io.StringIO();started=time.monotonic()
        try:
            with mock.patch.object(module.subprocess,'Popen',side_effect=stalled),contextlib.redirect_stdout(out):
                module.publish_bounded(str(self.project/'.autopilot'),fd)
        finally: os.close(fd)
        elapsed=time.monotonic()-started
        self.assertLess(elapsed,5.0);self.assertIn('панель не обновлена',out.getvalue());self.assertIn('последняя удачная',out.getvalue())
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger);self.assertIsNotNone(children[0].poll())
        self.assertEqual(self.call('answered').returncode,0)
        print('TIMEOUT measured seconds',elapsed,flush=True)

    def test_public_root_symlink_cannot_escape(self):
        self.init();root=self.public;other=self.root/'outside';_fixture_mkdir(other, mode=0o755);(other/'sentinel').write_text('untouched')
        saved=root.with_name('public-saved');root.rename(saved);root.symlink_to(other,target_is_directory=True)
        q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('панель не обновлена',q.stdout+q.stderr)
        self.assertEqual(sorted(p.name for p in other.iterdir()),['sentinel'])
        root.unlink();saved.rename(root);self.assertEqual(self.call('answered').returncode,0)

    def test_parallel_projects_keep_both_agent_index_entries(self):
        projects=[self.project,self.make_project('parallel')]
        jobs=[subprocess.Popen([sys.executable,'-B',str(p/'.autopilot/ap.py'),'--no-serve','init','--slug','parallel','--skill-dir',str(self.release)],cwd=p,env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for p in projects]
        for job in jobs:
            out,err=job.communicate(timeout=12);self.assertEqual(job.returncode,0,out+err);self.assertNotIn('панель не обновлена',out+err)
        index=json.loads((self.public/'gamma/index.json').read_text())
        expected=[]
        for p in projects:
            m=json.loads((p/'.autopilot/sadik.json').read_text());expected.append(m['project_id']+'/'+m['run_id'])
        self.assertEqual(sorted(index),sorted(expected))
        self.assertEqual({x.name for x in (self.public/'gamma').iterdir()},{'index.html','index.json',*(x.split('/')[0] for x in expected)})

    def test_dead_operator_can_resume_but_live_operator_cannot_be_stolen(self):
        project=self.make_project('workers')
        code="""import json,os,subprocess,sys
from pathlib import Path
project=Path(sys.argv[1]);env=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()))
for line in sys.stdin:
 args=json.loads(line);p=subprocess.run([sys.executable,'-B',str(project/'.autopilot/ap.py'),'--no-serve',*args],cwd=project,env=env,capture_output=True,text=True)
 print(json.dumps(dict(code=p.returncode,output=p.stdout+p.stderr)),flush=True)
"""
        workers=[subprocess.Popen([sys.executable,'-u','-c',code,str(project)],env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True) for _ in range(2)]
        def command(worker,args):
            worker.stdin.write(json.dumps(args)+'\n');worker.stdin.flush();return json.loads(worker.stdout.readline())
        try:
            first=command(workers[0],['init','--slug','workers','--skill-dir',str(self.release)]);self.assertEqual(first['code'],0,first)
            ledger=(project/'.autopilot/state.js').read_bytes()
            denied=command(workers[1],['resume']);self.assertEqual(denied['code'],2,denied);self.assertIn('живой оператор',denied['output'])
            self.assertEqual((project/'.autopilot/state.js').read_bytes(),ledger)
            workers[0].kill();workers[0].wait(timeout=3);self.assertIsNotNone(workers[0].returncode)
            print('DAMAGE operator terminated pid',workers[0].pid,'returncode',workers[0].returncode,flush=True)
            recovered=command(workers[1],['resume']);self.assertEqual(recovered['code'],0,recovered)
            owner=json.loads((project/'.autopilot/operator.json').read_text());self.assertEqual(owner['pid'],workers[1].pid)
            self.assertEqual(command(workers[1],['answered'])['code'],0)
        finally:
            for worker in workers:
                if worker.poll() is None: worker.terminate()
                worker.wait(timeout=3)
                worker.stdin.close();worker.stdout.close()

    def test_device_is_refused_before_read(self):
        spec=importlib.util.spec_from_file_location('sadik_devices',self.release/'tools/ap_sadik.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        fd=module.open_dir('/dev')
        try:
            self.assertTrue(stat.S_ISCHR(os.stat('null',dir_fd=fd,follow_symlinks=False).st_mode))
            with self.assertRaises(module.Refusal): module.read_at(fd,'null')
        finally: os.close(fd)

    def test_init_run_directory_symlink_is_refused(self):
        import datetime
        outside=self.root/'outside-run';_fixture_mkdir(outside, mode=0o755);(outside/'sentinel').write_text('unchanged')
        name=datetime.datetime.now().astimezone().date().isoformat()+'-same-slug--wip'
        target=self.project/'.autopilot'/name;target.symlink_to(outside,target_is_directory=True)
        self.assertTrue(target.is_symlink());print('DAMAGE init run symlink',str(target),'->',os.readlink(target),flush=True)
        q=self.call('init','--slug','same-slug','--skill-dir',str(self.release));self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual({p.name for p in outside.iterdir()},{'sentinel'})
        target.unlink()
        abandoned=self.call('abandon');self.assertEqual(abandoned.returncode,0,abandoned.stdout+abandoned.stderr)
        self.init();self.assertEqual(self.call('resume').returncode,0)

    def test_null_owner_is_not_missing_owner(self):
        self.init();target=self.project/'.autopilot/operator.json';original=target.read_bytes();ledger=(self.project/'.autopilot/state.js').read_bytes()
        target.write_text('null\n');q=self.call('answered');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
        target.write_bytes(original);self.assertEqual(self.call('answered').returncode,0)

    def test_slug_boundary_is_resumable_and_overflow_refused(self):
        q=self.call('init','--slug','a'*64,'--skill-dir',str(self.release));self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertEqual(self.call('resume').returncode,0)
        other=self.make_project('long-slug');q=self.call('init','--slug','a'*65,'--skill-dir',str(self.release),project=other)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertFalse((other/'.autopilot/state.js').exists())

    def test_failed_init_does_not_switch_pin(self):
        self.init();ledger=(self.project/'.autopilot/state.js').read_bytes();pin=(self.project/'.autopilot/sadik.json').read_bytes()
        newer=self.root/'releases/incomplete/skill';shutil.copytree(self.release,newer)
        (newer/'phases/dashboard-template.html').unlink()
        q=self.call('init','--force','--slug','new','--skill-dir',str(newer));self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
        self.assertEqual((self.project/'.autopilot/sadik.json').read_bytes(),pin)
        self.assertEqual(self.call('resume').returncode,0)

    def test_bad_snapshot_keeps_accounting_and_old_export(self):
        current=self.init();dest=self.exported(current);exported=(dest/'state.js').read_bytes();page=self.project/'.autopilot/dashboard.html';old=page.read_bytes();page.write_bytes(b'\xff')
        before=current['rev'];q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertGreater(state(self.project)['rev'],before);self.assertIn('панель не обновлена',q.stdout+q.stderr)
        self.assertEqual((dest/'state.js').read_bytes(),exported)
        page.write_bytes(old);q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertEqual(json.loads((dest/'state.js').read_text().split('=',1)[1])['rev'],state(self.project)['rev'])

    def test_http_view_wait_answer_finish_and_server_restart(self):
        import functools,http.server,threading,urllib.request
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self,*args): pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(self.public)))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            current=self.init();dest=self.exported(current);url='http://127.0.0.1:'+str(server.server_port)+'/'+dest.relative_to(self.public).as_posix()
            for args,waiting,finished in [(('sync',),False,False),(('ask','action','--note','approval'),True,False),(('answered',),False,False),(('finish','--result','ready'),False,True)]:
                result=self.call(*args);self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                with urllib.request.urlopen(url+'/state.js') as response: remote=json.loads(response.read().decode().split('=',1)[1])
                self.assertEqual(bool(remote['waiting']),waiting);self.assertEqual(bool(remote['finishedAt']),finished)
                with urllib.request.urlopen(url+'/dashboard.html') as response: page=response.read().decode()
                self.assertIn('window.STATE='+json.dumps(remote,ensure_ascii=False).replace('<',r'\u003c')+';',page)
            old_port=server.server_port;server.shutdown();server.server_close();thread.join(timeout=2)
            result=self.call('sync');self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            server=http.server.ThreadingHTTPServer(('127.0.0.1',old_port),functools.partial(Quiet,directory=str(self.public)))
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            with urllib.request.urlopen(url+'/state.js') as response: self.assertTrue(json.loads(response.read().decode().split('=',1)[1])['finishedAt'])
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)


    def test_public_whitelist_blocks_unknown_fields_at_every_level(self):
        initial=self.init();dest=self.exported(initial)
        private=state(self.project)
        private['unknownPrivate']='NOT-PUBLIC-TOP'
        private['stages'][0]['commandOutput']='NOT-PUBLIC-NESTED'
        private['requirements']['external']='NOT-PUBLIC-COUNTS'
        private['title']={'unexpected':'NOT-PUBLIC-WRONG-TYPE'}
        (self.project/'.autopilot/state.js').write_text('window.STATE='+json.dumps(private,ensure_ascii=False))
        q=self.call('sync');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        remote=json.loads((dest/'state.js').read_text().split('=',1)[1])
        self.assertNotIn('_sadik',remote);self.assertNotIn('skillDir',remote);self.assertNotIn('dir',remote)
        self.assertNotIn('unknownPrivate',remote);self.assertNotIn('commandOutput',remote['stages'][0])
        self.assertNotIn('external',remote['requirements']);self.assertNotIn('title',remote)
        combined=(dest/'state.js').read_text()+(dest/'dashboard.html').read_text()
        self.assertNotIn('NOT-PUBLIC',combined)
        self.assertIn('unknownPrivate',state(self.project))

    def test_secret_filter_executor_answer_damage_and_return(self):
        # Synthetic canaries only. A missing call to redact_text must expose them.
        canaries=['sk-FAKE_CANARY_1234567890','ghp_FAKE_CANARY_1234567890',  # vorota-ob:dopusk=TOKEN (synthetic canary)
                  '-----BEGIN FAKE PRIVATE KEY-----\nFAKE-BODY\n-----END FAKE PRIVATE KEY-----',  # vorota-ob:dopusk=TOKEN (synthetic canary)
                  '/opt/example/pass/FAKE_CANARY','pass://FAKE_CANARY',
                  'DEEPSEEK_API_KEY=FAKE_CANARY_ONE','ANTHROPIC_AUTH_TOKEN = "FAKE_CANARY_TWO"']
        answers=['executor answer: '+canary for canary in canaries]
        initial=self.init();dest=self.exported(initial)
        for answer in answers:
            q=self.call('add','report',answer);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
            self.assertIn(answer,state(self.project)['report'])
        q=self.call('set','title='+canaries[0]);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertNotIn(canaries[0],(self.public/'gamma/index.json').read_text())
        self.assertNotIn(canaries[0],(self.public/'gamma/index.html').read_text())
        for name in ('state.js','dashboard.html'):
            content=(dest/name).read_text()
            for canary in canaries:self.assertNotIn(canary,content,name)
            self.assertIn('[скрыто]',content)
        # A private local page addition must never be copied outside the pinned template.
        page=self.project/'.autopilot/dashboard.html';page.write_text(page.read_text()+'<!-- PRIVATE-PAGE-CANARY -->')
        self.assertEqual(self.call('sync').returncode,0)
        self.assertNotIn('PRIVATE-PAGE-CANARY',(dest/'dashboard.html').read_text())
        target=self.release/'tools/ap_sadik.py';original=target.read_bytes()
        needle=b'def redact_text(value):\n';self.assertEqual(original.count(needle),1)
        damaged=original.replace(needle,needle+b'    return value  # DAMAGE-FILTER-BYPASS\n',1)
        target.write_bytes(damaged)
        self.assertEqual(target.read_text().count('DAMAGE-FILTER-BYPASS'),1)
        self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(damaged).hexdigest())
        print('DAMAGE filter count=1 SHA',hashlib.sha256(original).hexdigest(),'->',hashlib.sha256(damaged).hexdigest(),flush=True)
        other=self.make_project('filter-damaged');s=self.init(other)
        for answer in answers:
            q=self.call('add','report',answer,project=other);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        meta=state(other)['_sadik'];leak=self.public/'gamma'/meta['project_id']/meta['run_id']/'state.js'
        leaked=json.loads(leak.read_text().split('=',1)[1])['report']
        for answer in answers:self.assertIn(answer,leaked)
        target.write_bytes(original);self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),hashlib.sha256(original).hexdigest())
        self.assertEqual(self.call('sync').returncode,0)
        for canary in canaries:self.assertNotIn(canary,(dest/'state.js').read_text())
        print('RESTORED filter SHA',hashlib.sha256(original).hexdigest(),'canaries absent in public state and HTML',flush=True)


    def test_force_init_failure_preserves_previous_live_ledger(self):
        import datetime
        self.init();ledger=self.project/'.autopilot/state.js';original=ledger.read_bytes()
        outside=self.root/'force-outside';_fixture_mkdir(outside, mode=0o755);(outside/'sentinel').write_text('unchanged')
        name=datetime.datetime.now().astimezone().date().isoformat()+'-new--wip'
        link=self.project/'.autopilot'/name;link.symlink_to(outside,target_is_directory=True)
        print('DAMAGE force-init new directory link',str(link),'->',os.readlink(link),flush=True)
        q=self.call('init','--force','--slug','new','--skill-dir',str(self.release))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertTrue(ledger.exists(),'refused init must retain active ledger')
        self.assertEqual(ledger.read_bytes(),original)
        self.assertEqual({p.name for p in outside.iterdir()},{'sentinel'})
        link.unlink();self.assertEqual(self.call('resume').returncode,0)

    def test_missing_owner_refuses_second_operator_and_restores(self):
        self.init();owner=self.project/'.autopilot/operator.json';original=owner.read_bytes()
        ledger=(self.project/'.autopilot/state.js').read_bytes();owner.unlink();self.assertFalse(owner.exists())
        print('DAMAGE owner removed original SHA',hashlib.sha256(original).hexdigest(),flush=True)
        code='import os,subprocess,sys;e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));q=subprocess.run(sys.argv[1:],env=e,capture_output=True,text=True);print(q.stdout+q.stderr);sys.exit(q.returncode)'
        q=subprocess.run([sys.executable,'-B','-c',code,sys.executable,'-B',str(self.project/'.autopilot/ap.py'),'--no-serve','resume'],cwd=self.project,env=self.env,capture_output=True,text=True)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual((self.project/'.autopilot/state.js').read_bytes(),ledger)
        self.assertFalse(owner.exists())
        owner.write_bytes(original);self.assertEqual(hashlib.sha256(owner.read_bytes()).hexdigest(),hashlib.sha256(original).hexdigest())
        self.assertEqual(self.call('resume').returncode,0)

    def test_export_reader_permissions_survive_restrictive_umask(self):
        prior=os.umask(0o077)
        try:
            initial=self.init();dest=self.exported(initial)
        finally: os.umask(prior)
        for path in (dest.parent,dest):
            self.assertEqual(path.stat().st_mode & 0o777,0o750,str(path))
        for path in (dest/'state.js',dest/'dashboard.html',self.public/'gamma/index.json',self.public/'gamma/index.html'):
            self.assertEqual(path.stat().st_mode & 0o777,0o640,str(path))
        self.assertEqual(self.call('sync').returncode,0)


    def test_temp_file_has_reader_mode_before_atomic_rename(self):
        spec=importlib.util.spec_from_file_location('sadik_tempmode',self.release/'tools/ap_sadik.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        directory=self.root/'write-mode';_fixture_mkdir(directory, mode=0o755);fd=module.open_dir(directory)
        replace=os.replace;seen=[]
        def checked(source,dest,**kwargs):
            info=os.stat(source,dir_fd=kwargs['src_dir_fd'],follow_symlinks=False)
            seen.append(info.st_mode&0o777)
            self.assertEqual(info.st_mode&0o777,0o640)
            self.assertTrue(source.startswith('.new-'))
            return replace(source,dest,**kwargs)
        prior=os.umask(0o077)
        try:
            with mock.patch.object(module.os,'replace',side_effect=checked):module.write_at(fd,'state.js',b'public')
        finally:os.umask(prior);os.close(fd)
        self.assertEqual(seen,[0o640]);self.assertEqual((directory/'state.js').read_bytes(),b'public')

    def test_lost_sgid_refuses_export_and_recovers(self):
        initial=self.init();dest=self.exported(initial);old=(dest/'state.js').read_bytes();project=dest.parent
        project.chmod(0o750);self.assertEqual(project.stat().st_mode&0o7777,0o750)
        print('DAMAGE public project SGID removed mode0750',str(project),flush=True)
        q=self.call('ask','action','--note','kept');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('2750',q.stdout);self.assertIn('панель не обновлена',q.stdout)
        self.assertTrue(state(self.project)['waiting']);self.assertEqual((dest/'state.js').read_bytes(),old)
        project.chmod(0o2750);self.assertEqual(project.stat().st_mode&0o7777,0o2750)
        q=self.call('answered');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertNotIn('панель не обновлена',q.stdout)
        self.assertEqual(json.loads((dest/'state.js').read_text().split('=',1)[1])['rev'],state(self.project)['rev'])

    def test_resume_uses_pinned_release_after_current_switch(self):
        self.init();before=json.loads((self.project/'.autopilot/sadik.json').read_text())
        newer=self.root/'releases/r2/skill';shutil.copytree(self.release,newer)
        code=(newer/'tools/ap.py').read_text().replace('def main():\n','def main():\n    raise RuntimeError("wrong release")\n',1)
        (newer/'tools/ap.py').write_text(code)
        current=self.root/'current';current.symlink_to(newer.parent,target_is_directory=True)
        q=subprocess.run([sys.executable,'-B',str(current/'skill/tools/ap.py'),'--no-serve','resume'],cwd=self.project,env=self.env,capture_output=True,text=True)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        after=json.loads((self.project/'.autopilot/sadik.json').read_text());self.assertEqual(before['release'],after['release'])
        self.assertEqual(state(self.project)['skillDir'],str(self.release))


    def test_commits_history_damage_and_return(self):
        self.init()
        def git(*args,check=True):
            q=subprocess.run(['git','-C',str(self.project),*args],env=self.env,capture_output=True,text=True)
            if check:self.assertEqual(q.returncode,0,q.stdout+q.stderr)
            return q
        def commit(title):
            git('-c','user.name=Gamma','-c','user.email=gamma@sadik','-c','commit.gpgsign=false','commit','--allow-empty','-m',title)
            return git('rev-parse','HEAD').stdout.strip()
        first=commit('controlled fixture: ticket done')
        original_branch=git('branch','--show-current').stdout.strip()
        s=state(self.project);s['tickets']=[dict(id='01',title='fixture ticket',status='done',commit=first)]
        (self.project/'.autopilot/state.js').write_text('window.STATE='+json.dumps(s,ensure_ascii=False))
        healthy=self.call('commits');self.assertEqual(healthy.returncode,0,healthy.stdout+healthy.stderr)
        self.assertIn('коммиты сданных тасков на месте',healthy.stdout)
        git('checkout','--orphan','fixture-history-replaced');second=commit('controlled fixture: unrelated history')
        self.assertNotEqual(first,second);self.assertIn('fixture-history-replaced',(self.project/'.git/HEAD').read_text())
        self.assertEqual(git('merge-base','--is-ancestor',first,'HEAD',check=False).returncode,1)
        print('DAMAGE own fixture HEAD',first,'->',second,'old ticket commit not ancestor',flush=True)
        damaged=self.call('commits');self.assertEqual(damaged.returncode,0,damaged.stdout+damaged.stderr)
        self.assertIn('! таск 01',damaged.stdout);self.assertIn('нет в истории',damaged.stdout)
        self.assertEqual(state(self.project)['tickets'][0]['status'],'done','diagnostic must not reset a ticket automatically')
        git('checkout',original_branch);self.assertEqual(git('merge-base','--is-ancestor',first,'HEAD').returncode,0)
        restored=self.call('commits');self.assertEqual(restored.returncode,0,restored.stdout+restored.stderr)
        self.assertIn('коммиты сданных тасков на месте',restored.stdout)
        print('RESTORED own fixture HEAD',git('rev-parse','HEAD').stdout.strip(),flush=True)


if __name__=='__main__': unittest.main(verbosity=2)
