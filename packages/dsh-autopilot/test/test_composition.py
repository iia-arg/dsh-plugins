"""The pinned part B must have a caller in the actual offline installer."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import importlib.util
import ast
import contextlib
import hashlib
import io
import sqlite3
import subprocess
import tempfile
import json
from pathlib import Path, PurePosixPath
import sys
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE / 'lib'))
spec = importlib.util.spec_from_file_location('installer_composition', PACKAGE / 'lib/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class CompositionTests(unittest.TestCase):
    def test_base_init_creates_private_run_and_ticket_directories_under_umask0002(self):
        import os, stat
        spec=importlib.util.spec_from_file_location('actual_init_directory_fixture',PACKAGE/'overlay/tools/ap.py')
        ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        with tempfile.TemporaryDirectory(prefix='ap-init-directories-') as tmp:
            root=Path(tmp);control=root/'.autopilot';control.mkdir(mode=0o700)
            ap.ROOT=str(root);ap.A=str(control);ap.STATE=str(control/'state.js');ap.README=str(control/'README.md')
            previous=os.umask(0o002)
            try:
                self.assertIn('Umask:\t0002',(Path('/proc/self/status')).read_text())
                state,notes=ap.cmd_init({'slug':'directory-contract'})
            finally:os.umask(previous)
            for folder in (control/state['dir'],control/state['dir']/'tickets'):
                mode=stat.S_IMODE(folder.lstat().st_mode)
                print('BASE_INIT_DIRECTORY '+str(folder)+' mode='+oct(mode),flush=True)
                self.assertEqual(mode,0o700,'base init directory permissions depend on caller umask')
            self.assertTrue((control/'state.js').is_file())

    def test_early_G_projection_imports_from_the_physical_shared_tools(self):
        from test_gateway_receipt_source import fixture,GatewaySource
        lock,raw=installer.source();expected,(_,release)=installer.layout(Path('/fixture-only'),lock,raw)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);gateway=root/'tools/gateway_receipt_source.py';core=root/'skill/tools/team_usage.py'
            for target,source in [(gateway,release/'tools/gateway_receipt_source.py'),(root/'tools/codex_account_map.py',release/'tools/codex_account_map.py'),(root/'tools/child_usage.py',release/'tools/child_usage.py'),(root/'tools/child-source-versions.json',release/'tools/child-source-versions.json'),(root/'pilot/task_limits.py',release/'pilot/task_limits.py'),(core,release/'skill/tools/team_usage.py')]:
                _fixture_mkdir(target.parent, mode=0o755, parents=True, exist_ok=True);target.write_bytes(expected[source][2])
            spec=importlib.util.spec_from_file_location('physical_G_projection',gateway)
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            fx=fixture();GatewaySource().process_binding(fx)
            projected=module.process_requests(fx[1][:2],fx[2])
            self.assertEqual(projected[0]['sourceProcess'],dict(pid=100123,start='9007199254740993',boot='00000000-0000-0000-0000-000000000001'))
            self.assertNotIn('jobId',projected[0]);self.assertEqual(projected[-1]['kind'],'watermark')
            normalized=module.normalize_gateway(fx[1],fx[2],fx[3],fx[4],fx[5],{},module.iso(2000))
            self.assertEqual(normalized[0]['totals']['inputTokens'],100)

    def test_overlay_is_called_without_changing_sources_or_a7_guard(self):
        lock, raw = installer.source()
        before = dict(raw)
        root = Path('/fixture-only')
        expected, (_, release) = installer.layout(root, lock, raw)
        self.assertEqual(raw, before)
        key = PurePosixPath('skills/autopilot/tools/ap.py')
        self.assertEqual(expected[root / 'opt/autopilot/sources' / lock['upstream_sha'] / key], raw[key])
        ap = expected[release / 'skill/tools/ap.py']
        self.assertTrue(ap[2].startswith(b'#!/usr/bin/env python3\n'))
        self.assertEqual(ap[1], 0o755)
        self.assertIn((PACKAGE / 'lib/runtime-guard.py').read_bytes(), ap[2])
        self.assertTrue(b'from ap_sadik import run_event' in ap[2], 'part B caller absent')
        helper = expected[release / 'skill/tools/ap_sadik.py'][2]
        self.assertIn(b'root runtime forbidden', helper)
        self.assertLess(helper.index(b'root runtime forbidden'), helper.index(b'import ctypes'))

    def test_main_measure_tool_is_runtime_and_guarded(self):
        lock, raw = installer.source()
        expected, (_, release) = installer.layout(Path('/fixture-only'), lock, raw)
        entry = expected.get(release / 'skill/tools/measure-run.py')
        self.assertIsNotNone(entry, 'main model-call measurement tool missing from release')
        self.assertEqual(entry[1], 0o755)
        self.assertTrue(entry[2].startswith(b'#!/usr/bin/env python3\n'))
        self.assertLess(entry[2].index(b'root runtime forbidden'), entry[2].index(b'W_OUT, W_WRITE'))

    def test_claude_manifest_builder_runs_beside_reader_in_physical_release(self):
        lock,raw=installer.source()
        expected,(_,release)=installer.layout(Path('/fixture-only'),lock,raw)
        tool=expected.get(release/'tools/build-run-manifest.py')
        self.assertIsNotNone(tool,'manifest builder missing from physical release')
        with tempfile.TemporaryDirectory() as directory:
            for name in ('build-run-manifest.py','measure-run-claude.py'):
                item=expected[release/'tools'/name]
                self.assertEqual(item[1],0o755)
                (Path(directory)/name).write_bytes(item[2])
            result=subprocess.run([sys.executable,'-I','-B',str(Path(directory)/'build-run-manifest.py'),'--help'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('--record-dir',result.stdout)

    def test_r_exporter_imports_from_physical_release_without_source_runtime(self):
        lock, raw = installer.source()
        expected, (_, release) = installer.layout(Path('/fixture-only'), lock, raw)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            names = ['tools/collect-team-usage.py', 'tools/export-runtime-source.py',
                     'tools/supply-team-usage-index.py', 'tools/runtime_receipt_source.py',
                     'skill/tools/team_usage.py','pilot/task_limits.py','tools/time_usage.py','tools/time_collection.py']
            for name in names:
                item = expected[release / name]
                target = root / name
                _fixture_mkdir(target.parent, mode=0o755, parents=True, exist_ok=True)
                target.write_bytes(item[2])
                target.chmod(item[1])
            self.assertEqual((root / 'tools/runtime_receipt_source.py').read_bytes(),
                             (PACKAGE / 'runtime/runtime_receipt_source.py').read_bytes())
            self.assertFalse((root / 'runtime').exists())
            for name in names[:3]:
                result = subprocess.run([sys.executable, '-I', '-B', str(root / name), '--help'],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('usage:', result.stdout)
            self.assertFalse(list(root.rglob('__pycache__')))

    def test_raw_supplier_loads_from_physical_release(self):
        # AP 0.1.10: runtime_receipt_source.supplier_module() loads raw_supplier.py beside itself in release/tools.
        lock, raw = installer.source()
        expected, (_, release) = installer.layout(Path('/fixture-only'), lock, raw)
        self.assertIsNotNone(expected.get(release / 'tools/raw_supplier.py'), 'raw_supplier.py missing from physical release')
        for name in ('raw_index.py','raw_decoder.py'):
            self.assertIsNotNone(expected.get(release/'tools'/name),name+' missing from physical release')
        with tempfile.TemporaryDirectory() as directory:
            tools = Path(directory) / 'tools'
            for path, item in expected.items():
                if release in Path(path).parents and item[0] == 'file':
                    target = Path(directory) / Path(path).relative_to(release)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(item[2])
            code = ("import importlib.util,sys;s=importlib.util.spec_from_file_location('installed_rrs',sys.argv[1]);"
                    "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.supplier_module().__name__+':'+m.incremental_module().__name__)")
            result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(tools / 'runtime_receipt_source.py')],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), 'raw_supplier:r_incremental')
            result=subprocess.run([sys.executable,'-I','-B','-c',"import importlib.util,sys;s=importlib.util.spec_from_file_location('physical_raw',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);d=m.raw_index_module().decoder_module().Decoder();assert d.feed(bytes.fromhex('7b2274797065223a2275736572222c2273657373696f6e4964223a2266697874757265227d0a'))[0]['sessionId']=='fixture'",str(tools/'runtime_receipt_source.py')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertFalse(list(Path(directory).rglob('__pycache__')))

    def test_root_entry_and_origin_are_in_the_physical_release(self):
        lock,raw=installer.source()
        expected,(_,release)=installer.layout(Path('/fixture-only'),lock,raw)
        for name in ('measure-run-claude-root.py','claude-root-origin.py'):
            item=expected.get(release/'tools'/name)
            self.assertIsNotNone(item,'root entry/origin missing from physical release: '+name)
            self.assertEqual(item[2],(PACKAGE/'tools'/name).read_bytes())
            self.assertNotIn(b'root runtime forbidden',item[2])

    def test_codex_counter_is_usable_from_physical_release(self):
        lock, raw = installer.source()
        expected, (_, release) = installer.layout(Path('/fixture-only'), lock, raw)
        tool = expected.get(release / 'tools/measure-run-codex.py')
        self.assertIsNotNone(tool, 'Codex counter missing from physical release')
        self.assertEqual(tool[1], 0o755)
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / 'measure-run-codex.py'
            script.write_bytes(tool[2])
            result = subprocess.run([sys.executable, '-I', '-B', str(script), '--help'],
                                    capture_output=True, text=True)
        self.assertIn('--codex-home', result.stdout)
        self.assertIn('--sverka-shlyuz', result.stdout)

    def test_active_codex_turn_without_gateway_total_is_incomplete(self):
        spec = importlib.util.spec_from_file_location('counter', PACKAGE / 'tools/measure-run-codex.py')
        counter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(counter)
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            gateway = home / 'dsh-usage-hodov.jsonl'
            gateway.write_text(json.dumps({'thread': 'other', 'ts': '2026-10-16T00:00:00Z'}) + '\n')
            rollout = home / 'rollout.jsonl'
            usage = {'response_id': 'r1', 'turn_id': 'active', 'usage': {'input_tokens': 5, 'output_tokens': 2}}
            rollout.write_text(json.dumps({'type': 'token_usage_record', 'timestamp': '2026-10-17T00:00:00Z', 'payload': usage}) + '\n')
            self.assertEqual(counter.sverka(str(home), 'root', str(rollout), None, None), (0, 1))
            gateway.write_text(json.dumps({'thread': 'root', 'turn': 'active', 'ts': '2026-10-17T00:00:01Z',
                'polnota': 'ok', 'vyzovov': 1, 'input': 5, 'cached': 0, 'output': 2, 'reasoning': 0}) + '\n')
            self.assertEqual(counter.sverka(str(home), 'root', str(rollout), None, None), (0, 0))
            gateway.write_text(json.dumps({'thread': 'other', 'ts': '2026-10-16T00:00:00Z'}) + '\n')
            self.assertEqual(counter.sverka(str(home), 'root', str(rollout), None, None), (0, 1))
            # An explicit end before the active call excludes it from this report.
            self.assertEqual(counter.sverka(str(home), 'root', str(rollout), None,
                counter.vremya('2026-10-16T23:59:59Z')), (0, 0))

    def test_pilot_cli_is_delivered_without_executing_it(self):
        lock, raw = installer.source()
        expected, (_, release) = installer.layout(Path('/fixture-only'), lock, raw)
        for name in ('pilot_mail.py', 'pilot_archive.py'):
            entry = expected.get(release / 'pilot' / name)
            self.assertIsNotNone(entry, 'pilot runtime caller/delivery missing: ' + name)
            self.assertTrue(entry[2].startswith(b'#!/usr/bin/env python3\n'))
            self.assertTrue(b'root runtime forbidden' in entry[2])
        self.assertEqual(expected[release / 'pilot/pilot-main.json'][2],
                         (PACKAGE / 'lib/pilot-main.json').read_bytes())


class LiveQueueGuard(unittest.TestCase):
    def setUp(self):
        script=PACKAGE/'test/stend-dsh-autopilot.sh'
        code=script.read_text().split("<<'PY'\n",1)[1].rsplit('\nPY',1)[0]
        tree=ast.parse(code)
        names={'live_queue_snapshot','live_queue_guard'}
        functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
        self.assertEqual({n.name for n in functions},names,'stand must own the live queue guard')
        self.ns=dict(Path=Path,sqlite3=sqlite3,json=json,hashlib=hashlib,contextmanager=contextlib.contextmanager,sys=sys)
        exec(compile(ast.Module(body=functions,type_ignores=[]),str(script),'exec'),self.ns)
        self.tmp=tempfile.TemporaryDirectory(prefix='queue-guard-unit-');self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'mail.sqlite'

    def database(self):
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE usage_registrations(run_id TEXT,request_sha TEXT)')
            db.execute('INSERT INTO usage_registrations VALUES(?,?)',('a','1'*64))

    def check(self,action=lambda:None,want=0):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):
            try:
                with self.ns['live_queue_guard'](self.path):action()
            except SystemExit as error:rc=error.code
            else:rc=0
        self.assertEqual(rc,want,out.getvalue())
        return out.getvalue()

    def test_healthy_change_and_return(self):
        self.database();healthy=self.check()
        def add():
            with sqlite3.connect(self.path) as db:db.execute('INSERT INTO usage_registrations VALUES(?,?)',('b','2'*64))
        damaged=self.check(add,1);self.assertIn('LIVE_QUEUE_CHANGED',damaged)
        self.assert_delta(damaged,['b'],[])
        with sqlite3.connect(self.path) as db:db.execute('DELETE FROM usage_registrations WHERE run_id=?',('b',))
        returned=self.check();self.assertIn('LIVE_QUEUE_EQUAL',healthy);self.assertIn('LIVE_QUEUE_EQUAL',returned)
        self.assertEqual(self.ns['live_queue_snapshot'](self.path)['count'],1)

    def test_same_count_replacement_is_red(self):
        self.database()
        def replace():
            with sqlite3.connect(self.path) as db:
                db.execute('DELETE FROM usage_registrations');db.execute('INSERT INTO usage_registrations VALUES(?,?)',('b','2'*64))
        out=self.check(replace,1);self.assertIn('LIVE_QUEUE_CHANGED',out)
        self.assert_delta(out,['b'],['a'])

    def assert_delta(self,out,added,removed):
        prefix='FAIL: LIVE_QUEUE_CHANGED '
        rows=[line[len(prefix):] for line in out.splitlines() if line.startswith(prefix)]
        self.assertEqual(len(rows),1,out)
        self.assertEqual(json.loads(rows[0]),dict(addedRunIds=added,removedRunIds=removed))

    def test_removed_run_ids_are_sorted_and_named(self):
        self.database()
        with sqlite3.connect(self.path) as db:
            db.executemany('INSERT INTO usage_registrations VALUES(?,?)',[('z','2'*64),('b','3'*64)])
        def remove():
            with sqlite3.connect(self.path) as db:db.execute('DELETE FROM usage_registrations')
        self.assert_delta(self.check(remove,1),[],['a','b','z'])

    def test_changed_request_sha_with_same_run_id_keeps_identity_failure(self):
        self.database()
        def replace_sha():
            with sqlite3.connect(self.path) as db:db.execute('UPDATE usage_registrations SET request_sha=?',('2'*64,))
        self.assert_delta(self.check(replace_sha,1),[],[])

    def test_read_is_readonly_and_missing_database_is_named(self):
        self.assertIn('ABSENT',self.check())
        self.database();before=hashlib.sha256(self.path.read_bytes()).hexdigest();self.check()
        self.assertEqual(before,hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_missing_table_refuses_before_test_body(self):
        with sqlite3.connect(self.path) as db:db.execute('CREATE TABLE other(value TEXT)')
        body=[];out=self.check(lambda:body.append(True),2)
        self.assertEqual(body,[]);self.assertIn('LIVE_QUEUE_UNREADABLE',out)

    def test_existing_blind_result_is_preserved(self):
        self.database()
        def fail():
            with sqlite3.connect(self.path) as db:db.execute('INSERT INTO usage_registrations VALUES(?,?)',('b','2'*64))
            raise SystemExit(2)
        self.assertIn('LIVE_QUEUE_CHANGED',self.check(fail,2))



if __name__ == '__main__':
    unittest.main(verbosity=2)
