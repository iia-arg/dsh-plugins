"""Real file/Unix-lock tests, root in private filesystem only."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import time
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ap-catalog-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root/'opt/master'; _fixture_mkdir(self.home, mode=0o755, parents=True)
        self.base = self.root/'var/lib/dsh-autopilot'
        scope=self.root/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(self.root)],publicRoot=str(self.root/'public'))));scope.chmod(0o600)
        spec = importlib.util.spec_from_file_location('run_catalog', PACKAGE/'runtime/run_catalog.py')
        if spec is None or not Path(spec.origin).is_file():
            self.fail('shared run catalogue implementation missing')
        self.code = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.code)
        self.master = pwd.getpwnam('master')

    def project(self, name='nested/.backup/project', *, finished=False):
        project = self.home/name
        folder = project/'.autopilot'; _fixture_mkdir(folder, mode=0o755, parents=True)
        meta = dict(schema=1, root=str(project), run_id='run-'+name.replace('/','-').replace('.',''), release=dict(
            skill_dir='/opt/autopilot/releases/'+'a'*40+'-a13/skill', upstream_sha='a'*40, local_revision='a13'))
        state = dict(_sadik=meta, finishedAt='2026-10-17T00:00:00Z' if finished else None)
        (folder/'state.js').write_text('window.STATE='+json.dumps(state)+'\n')
        (folder/'operator.json').write_text(json.dumps(dict(pid=12345,uid=self.master.pw_uid,boot='boot',start='1')))
        for p in (folder, folder/'state.js',folder/'operator.json'):
            os.chown(p, self.master.pw_uid,self.master.pw_gid)
        return project, meta

    def report(self):
        value=self.code.scan_legacy(self.root)
        path=self.root/'legacy.json'; path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
        return path,hashlib.sha256(path.read_bytes()).hexdigest(),value

    def bootstrap(self):
        path,sha,report=self.report()
        self.code.bootstrap(self.base,self.root,path,sha)
        return path,sha,report

    def test_whole_home_scan_lists_hidden_nested_state_and_finished(self):
        project,meta=self.project()
        report=self.code.scan_legacy(self.root)
        self.assertTrue(report['complete'],report)
        self.assertEqual(report['scopeRoots'],[str(self.root)])
        self.assertEqual(report['found'],1)
        row=report['runs'][0]
        self.assertEqual(row['project'],str(project));self.assertEqual(row['runId'],meta['run_id'])
        self.assertEqual(row['release'],'a'*40+'-a13'); self.assertTrue(row['active'])
        self.assertEqual(row['operatorPath'],str(project/'.autopilot/operator.json'))

    def test_symlink_and_broken_records_are_unproven_not_zero(self):
        project,_=self.project()
        path=project/'.autopilot/state.js'; original=path.read_bytes()
        path.write_bytes(b'not-json')
        bad=self.code.scan_legacy(self.root)
        self.assertFalse(bad['complete']);self.assertTrue(bad['errors'])
        path.write_bytes(original)
        path.unlink();path.symlink_to(self.root/'missing')
        bad=self.code.scan_legacy(self.root);self.assertFalse(bad['complete'])
        path.unlink();path.write_bytes(original);os.chown(path,self.master.pw_uid,self.master.pw_gid)
        self.assertTrue(self.code.scan_legacy(self.root)['complete'])
        linked=self.home/'linked/.autopilot';_fixture_mkdir(linked.parent, mode=0o755);linked.symlink_to(project/'.autopilot')
        self.assertFalse(self.code.scan_legacy(self.root)['complete'])

    def test_missing_operator_is_not_an_empty_inventory(self):
        project,_=self.project();(project/'.autopilot/operator.json').unlink()
        report=self.code.scan_legacy(self.root)
        self.assertFalse(report['complete']);self.assertEqual(report['found'],1)

    def test_root_bootstrap_requires_exact_accepted_fresh_report(self):
        path,sha,_=self.report()
        with self.assertRaisesRegex(ValueError,'SHA'):
            self.code.bootstrap(self.base,self.root,path,'f'*64)
        self.project()
        with self.assertRaisesRegex(ValueError,'inventory incomplete'):
            self.code.bootstrap(self.base,self.root,path,sha)
        self.bootstrap()
        with self.code.Catalog(self.base) as c:
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):
                c.assert_no_live_pins('a'*40+'-a13')

    def test_catalog_only_does_not_resolve_private_project_tree(self):
        project,_=self.project();self.bootstrap()
        saved=project.with_name('moved');project.rename(saved)
        project.symlink_to(self.root/'not-the-project',target_is_directory=True)
        with self.code.Catalog(self.base) as c:
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):
                c.assert_no_live_pins('a'*40+'-a13')

    def test_root_umask_077_bootstrap_has_usable_protected_modes(self):
        old=os.umask(0o077)
        try:self.bootstrap()
        finally:os.umask(old)
        self.assertEqual((self.base/'legacy.json').stat().st_mode & 0o777,0o444)
        with self.code.Catalog(self.base) as c:self.assertEqual(c.data['runs'],{})

    def test_legacy_invalidation_is_not_empty_or_applicable_and_requires_new_census(self):
        _,oldsha,_=self.bootstrap()
        with self.code.Catalog(self.base) as c:
            c.invalidate('a'*40+'-legacy', 'window-one')
        status=json.loads((self.base/'applicability.json').read_text())
        self.assertEqual(status['status'],'inapplicable')
        self.assertEqual(status['reason'],'legacy-selection-pending')
        self.assertEqual(status['selectedRuntime'],'a'*40+'-legacy')
        self.assertEqual(status['windowId'],'window-one')
        with self.assertRaisesRegex(ValueError,'RUN_INVENTORY_UNPROVEN'):
            with self.code.Catalog(self.base):pass
        # The same accepted report cannot be reused, even when pairs are unchanged.
        report=self.root/'legacy.json'
        with self.assertRaisesRegex(ValueError,'NOT_FRESH'):
            self.code.bootstrap(self.base,self.root,report,oldsha,window_id='window-two')
        report,sha,_=self.report();self.assertNotEqual(sha,oldsha)
        self.code.bootstrap(self.base,self.root,report,sha,window_id='window-two')
        with self.code.Catalog(self.base) as c:
            self.assertEqual(c.stamp['windowId'],'window-two')
            self.assertEqual(c.assert_no_live_pins('a'*40+'-legacy')['coverage'],'guarded_origins')

    def test_failed_generation_replacement_stays_explicitly_inapplicable(self):
        self.bootstrap()
        with self.code.Catalog(self.base) as c:c.invalidate('a'*40+'-legacy','window-one')
        report,sha,_=self.report()
        from unittest import mock
        original=self.code.atomic
        def failed(path,*args,**kwargs):
            if path.name=='bootstrap.json':raise OSError('COPY_BOOTSTRAP_FAILURE')
            return original(path,*args,**kwargs)
        with mock.patch.object(self.code,'atomic',side_effect=failed):
            with self.assertRaisesRegex(OSError,'COPY_BOOTSTRAP_FAILURE'):
                self.code.bootstrap(self.base,self.root,report,sha,window_id='window-two')
        self.assertEqual(json.loads((self.base/'applicability.json').read_text())['status'],'inapplicable')
        with self.assertRaisesRegex(ValueError,'RUN_INVENTORY_UNPROVEN'):
            with self.code.Catalog(self.base):pass

    def test_rebootstrap_keeps_active_guarded_pin_outside_home(self):
        self.bootstrap()
        outside=self.root/'outside-home';_fixture_mkdir(outside, mode=0o755)
        meta=dict(root=str(outside),run_id='external-guarded',release=dict(
            skill_dir='/opt/autopilot/releases/'+'a'*40+'-a13/skill',upstream_sha='a'*40,local_revision='a13'))
        with self.code.Catalog(self.base) as c:
            c.pin(meta);c.started(meta);c.invalidate('b'*40+'-legacy','old-window')
        report,sha,_=self.report();self.code.bootstrap(self.base,self.root,report,sha,window_id='new-window')
        with self.code.Catalog(self.base) as c:
            self.assertEqual(c.data['runs']['external-guarded']['project'],str(outside))
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a13')

    def test_interrupted_archive_is_not_published_and_retry_is_complete(self):
        self.bootstrap()
        with self.code.Catalog(self.base) as c:c.invalidate('b'*40+'-legacy','old-window')
        old=json.loads((self.base/'bootstrap.json').read_text())
        report,sha,_=self.report()
        from unittest import mock
        original=self.code.atomic
        def failed(path,*args,**kwargs):
            if path.name=='legacy.json' and path.parent.name.startswith('.preparing-'):
                raise OSError('COPY_ARCHIVE_FAILURE')
            return original(path,*args,**kwargs)
        with mock.patch.object(self.code,'atomic',side_effect=failed):
            with self.assertRaisesRegex(OSError,'COPY_ARCHIVE_FAILURE'):
                self.code.bootstrap(self.base,self.root,report,sha,window_id='new-window')
        archive=self.base/'previous-generations'/old['catalogId']
        self.assertFalse(archive.exists())
        self.code.bootstrap(self.base,self.root,report,sha,window_id='new-window')
        self.assertEqual({p.name for p in archive.iterdir()},
                         {'bootstrap.json','legacy.json','catalog.json','applicability.json'})
        self.code._verify_archive(archive,old['catalogId'])

    def test_rebootstrap_merges_pin_written_after_archive_before_retry(self):
        self.bootstrap()
        with self.code.Catalog(self.base) as c:c.invalidate('b'*40+'-legacy','old-window')
        report,sha,_=self.report()
        from unittest import mock
        original=self.code.atomic
        def failed(path,*args,**kwargs):
            if path==self.base/'legacy.json':raise OSError('COPY_AFTER_ARCHIVE_FAILURE')
            return original(path,*args,**kwargs)
        with mock.patch.object(self.code,'atomic',side_effect=failed):
            with self.assertRaisesRegex(OSError,'COPY_AFTER_ARCHIVE_FAILURE'):
                self.code.bootstrap(self.base,self.root,report,sha,window_id='new-window')
        live=self.base/'runs/catalog.json';value=json.loads(live.read_text())
        value['runs']['late-guarded']=dict(project=str(self.root/'outside'),release='a'*40+'-a13',status='active',origin='runtime')
        live.write_text(json.dumps(value))
        self.code.bootstrap(self.base,self.root,report,sha,window_id='new-window')
        with self.code.Catalog(self.base) as c:
            self.assertIn('late-guarded',c.data['runs'])
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a13')

    def test_no_catalog_or_acceptance_refuses(self):
        with self.assertRaisesRegex((ValueError,FileNotFoundError),'UNPROVEN|No such file'):
            with self.code.Catalog(self.base):pass
        self.bootstrap();(self.base/'bootstrap.json').unlink()
        with self.assertRaisesRegex((ValueError,FileNotFoundError),'UNPROVEN|No such file'):
            with self.code.Catalog(self.base):pass

    def test_pin_pending_before_state_and_finish_after_state(self):
        _,meta=self.project(finished=True);self.bootstrap()
        with self.code.Catalog(self.base) as c:
            c.pin(meta)
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a13')
            self.assertEqual(c.data['runs'][meta['run_id']]['status'],'pending')
        with self.code.Catalog(self.base) as c:
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a13')
            c.started(meta);self.assertEqual(c.data['runs'][meta['run_id']]['status'],'active')
            c.finished(meta)
            proof=c.assert_no_live_pins('a'*40+'-a13')
            self.assertEqual(proof['activeRuns'],0);self.assertEqual(proof['catalogRuns'],0)

    def test_force_cannot_erase_another_active_run_same_project(self):
        _,meta=self.project();self.bootstrap();new=dict(meta,run_id='new-run')
        with self.code.Catalog(self.base) as c:
            before=json.dumps(c.data,sort_keys=True)
            with self.assertRaisesRegex(ValueError,'PROJECT_ACTIVE'):c.pin(new)
            self.assertEqual(before,json.dumps(c.data,sort_keys=True))
            c.finished(meta);c.pin(new)
            self.assertEqual(set(c.data['runs']),{'new-run'})

    def test_unrelated_live_release_does_not_block_target_and_legacy_sha_is_bound(self):
        self.project();_,sha,_=self.bootstrap()
        with self.code.Catalog(self.base) as c:
            proof=c.assert_no_live_pins('b'*40+'-a12')
            self.assertEqual(proof['activeRuns'],0);self.assertEqual(proof['catalogRuns'],1)
            self.assertEqual(proof['legacySha256'],sha)
        stamp=self.base/'bootstrap.json';data=json.loads(stamp.read_text());data['legacySha256']='f'*64;stamp.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'UNPROVEN'):
            with self.code.Catalog(self.base):pass

    def test_shared_lock_excludes_real_parallel_writer_and_returns(self):
        self.bootstrap()
        child_code='import fcntl,os,sys,time;f=open(sys.argv[1],"r+");fcntl.flock(f,fcntl.LOCK_EX);print("LOCKED",flush=True);time.sleep(5)'
        child=subprocess.Popen([sys.executable,'-B','-c',child_code,str(self.base/'run.lock')],stdout=subprocess.PIPE,text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(),'LOCKED');start=time.monotonic()
            with self.assertRaisesRegex(ValueError,'RUN_CATALOG_BUSY'):
                with self.code.Catalog(self.base,timeout=.15):pass
            self.assertLess(time.monotonic()-start,1)
        finally:
            child.terminate();child.wait();child.stdout.close()
        with self.code.Catalog(self.base) as c:self.assertEqual(c.data['runs'],{})

    def test_catalog_symlink_unsafe_mode_and_unknown_schema_refuse(self):
        self.bootstrap();path=self.base/'runs/catalog.json';before=path.read_bytes()
        path.write_text('{"schemaVersion":999}')
        with self.assertRaisesRegex(ValueError,'UNPROVEN'):
            with self.code.Catalog(self.base):pass
        path.write_bytes(before);path.chmod(0o666)
        with self.assertRaisesRegex(ValueError,'UNPROVEN'):
            with self.code.Catalog(self.base):pass
        path.chmod(0o640);path.unlink();path.symlink_to(self.root/'missing')
        with self.assertRaises((ValueError,OSError)):
            with self.code.Catalog(self.base):pass

    def test_finished_legacy_not_pinned_but_dead_operator_active_still_blocks(self):
        self.project(finished=True);self.bootstrap()
        with self.code.Catalog(self.base) as c:self.assertEqual(c.data['runs'],{})
        self.project('other')
        # A distinct full accepted report in a separate base; no PID liveness shortcut.
        report,sha,_=self.report();other=self.root/'second/catalogue'
        self.code.bootstrap(other,self.root,report,sha)
        with self.code.Catalog(other) as c:
            with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a13')

if __name__=='__main__':unittest.main(verbosity=2)
