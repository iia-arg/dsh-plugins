"""Observable CLI contract: real state files and verification, no live services."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest import mock

HELPER = Path(__file__).resolve().parents[1] / 'sbin/montazh-okno'


class Windows(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='montazh-okno-test-'))
        self.state = self.root / 'state'
        self.state.mkdir(mode=0o755)
        self.live = self.root / 'live'
        self.live.write_text('before')
        self.registry = self.root / 'registry.yaml'
        self.registry.write_text('plugins:\n  - id: a\n    version: "1"\n')
        self.ident = '1' * 32
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record = {'schema': 1, 'id': self.ident, 'task': 'B-N-2025',
            'actor': 'fixture', 'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'opened_ns': now, 'deadline_ns': now + 1800 * 10**9,
            'expires_utc': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=1800)).isoformat(),
            'phase': 'open', 'subjects': ['file:' + str(self.live), 'entry:a'],
            'checks': [{'kind': 'file', 'path': str(self.live),
                        'sha256': hashlib.sha256(b'after').hexdigest()},
                       {'kind': 'registry', 'path': str(self.registry), 'id': 'a', 'expected': {'version': '2'}}]}
        self.file = self.state / (self.ident + '.json')
        self.write()

    def tearDown(self):
        shutil.rmtree(self.root)

    def write(self):
        self.file.write_text(json.dumps(self.record))
        self.file.chmod(0o644)

    def command(self, *args):
        return subprocess.run(['python3', str(HELPER), '--state-dir', str(self.state), *args],
            capture_output=True, text=True, timeout=5)

    def matching(self):
        self.live.write_text('after')
        self.registry.write_text('plugins:\n  - id: a\n    version: "2"\n')

    def expired(self):
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now - 1801 * 10**9, deadline_ns=now - 10**9)
        self.write()

    def test_expired_matching_close_keeps_record_and_cannot_hide_watch_alert(self):
        self.matching(); self.expired()
        before = self.file.read_bytes()
        p = self.command('zakryt', self.ident)
        self.assertEqual(p.returncode, 1, p.stdout + p.stderr)
        self.assertIn(self.ident, p.stderr); self.assertIn('срок истёк', p.stderr)
        self.assertEqual(self.file.read_bytes(), before)
        self.assertEqual(self.command('aktivno-id', '--avto-montazh', self.ident).returncode, 0)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)
        sender, wire = self.root / 'sender', self.root / 'wire'
        sender.write_text('#!/bin/sh\ncat >> ' + str(wire) + '\n'); sender.chmod(0o755)
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        text = wire.read_text()
        self.assertIn(self.ident, text); self.assertIn('не закрыто за', text)
        self.assertNotIn('закрыто после', text); self.assertNotIn('ПЕРЕСНЯТО', text)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'open')
        self.assertIn('notified_at', json.loads(self.file.read_text()))
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        self.assertEqual(wire.read_text(), text)
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now, deadline_ns=now + 1800 * 10**9); self.write()
        self.assertEqual(self.command('zakryt', self.ident).returncode, 0)

    def test_expired_close_never_calls_owner_channel(self):
        self.matching(); self.expired(); before = self.file.read_bytes()
        ns = runpy.run_path(str(HELPER), run_name='fixture')
        real_run = ns['subprocess'].run; channel = []
        def capture(command, *args, **kwargs):
            if command[0] == '/usr/local/bin/agent-alert':
                channel.append((command, kwargs.get('input', '')))
                return subprocess.CompletedProcess(command, 0, '', '')
            return real_run(command, *args, **kwargs)
        with mock.patch.object(ns['subprocess'], 'run', side_effect=capture):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertEqual(channel, [], 'late zakryt called owner channel')
        self.assertEqual(self.file.read_bytes(), before)

    def test_expired_matching_tag_close_is_not_accepted(self):
        repo = self.root / 'tag-repo'; repo.mkdir()
        (repo / 'x').write_text('fixture')
        for args in [('init', '-q'), ('add', '.'), ('-c', 'user.name=Fixture', '-c', 'user.email=fixture@sadik', 'commit', '-qm', 'fixture'), ('tag', 'fixture-v1.0.0')]:
            subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
        commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
        self.record.update(subjects=['tag:' + str(repo) + ':fixture-v1.0.0'], checks=[dict(kind='tag', repo=str(repo), ref='fixture-v1.0.0', commit=commit)])
        self.expired(); before = self.file.read_bytes()
        p = self.command('zakryt', self.ident)
        self.assertEqual(p.returncode, 1, p.stdout + p.stderr); self.assertEqual(self.file.read_bytes(), before)

    def test_close_foreign_boot_is_blind_and_does_not_write(self):
        self.matching(); self.record['boot_id'] = '0' * 36; self.write()
        before = self.file.read_bytes(); p = self.command('zakryt', self.ident)
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr); self.assertIn(self.ident, p.stderr)
        self.assertEqual(self.file.read_bytes(), before)

    def invoke_main(self, ns):
        with mock.patch.object(ns['sys'], 'argv', ['montazh-okno', '--state-dir', str(self.state), 'zakryt', self.ident]):
            return ns['main']()

    def test_expired_close_skips_verification(self):
        self.matching(); self.expired(); before = self.file.read_bytes()
        ns = runpy.run_path(str(HELPER), run_name='fixture')
        def forbidden(*args):
            self.fail('expired close invoked strict verification')
        with mock.patch.dict(ns['main'].__globals__, verify=forbidden):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertEqual(self.file.read_bytes(), before)

    def test_close_deadline_crossed_in_real_verification_is_refused(self):
        self.matching(); before = self.file.read_bytes()
        ns = runpy.run_path(str(HELPER), run_name='fixture'); real_verify = ns['verify']; crossed = []
        def verify_then_expire(*args):
            result = real_verify(*args); crossed.append(True); return result
        def clock():
            return self.record['deadline_ns'] if crossed else self.record['opened_ns'] + 1
        with mock.patch.dict(ns['main'].__globals__, verify=verify_then_expire, clock=clock):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertTrue(crossed); self.assertEqual(self.file.read_bytes(), before)

    def test_close_deadline_crossed_while_acquiring_lock_is_refused(self):
        self.matching(); before = self.file.read_bytes()
        ns = runpy.run_path(str(HELPER), run_name='fixture'); real_locked = ns['locked']; acquired = []
        import contextlib
        @contextlib.contextmanager
        def lock_then_expire(root):
            with real_locked(root):
                acquired.append(True); yield
        def clock():
            return self.record['deadline_ns'] if acquired else self.record['opened_ns'] + 1
        with mock.patch.dict(ns['main'].__globals__, locked=lock_then_expire, clock=clock):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertTrue(acquired); self.assertEqual(self.file.read_bytes(), before)

    def test_close_deadline_crossed_inside_generation_recheck_is_refused(self):
        self.matching(); before = self.file.read_bytes()
        ns = runpy.run_path(str(HELPER), run_name='fixture'); real_unchanged = ns['unchanged']; crossed = []
        def unchanged_then_expire(*args):
            result = real_unchanged(*args); crossed.append(True); return result
        def clock():
            return self.record['deadline_ns'] if crossed else self.record['opened_ns'] + 1
        with mock.patch.dict(ns['main'].__globals__, unchanged=unchanged_then_expire, clock=clock):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertTrue(crossed); self.assertEqual(self.file.read_bytes(), before)

    def test_closed_receipt_uses_the_final_admission_clock(self):
        self.matching(); ns = runpy.run_path(str(HELPER), run_name='fixture')
        early = self.record['opened_ns'] + 1; final = early + 1
        with mock.patch.dict(ns['main'].__globals__, clock=mock.Mock(side_effect=[early, final])):
            self.assertEqual(self.invoke_main(ns), 0)
        self.assertEqual(json.loads(self.file.read_text())['closed_ns'], final)

    def test_close_at_deadline_is_refused_without_changing_record(self):
        self.matching(); before = self.file.read_bytes(); ns = runpy.run_path(str(HELPER), run_name='fixture')
        with mock.patch.dict(ns['main'].__globals__, clock=lambda: self.record['deadline_ns']):
            self.assertEqual(self.invoke_main(ns), 1)
        self.assertEqual(self.file.read_bytes(), before)

    def test_repeated_closed_verifies_but_never_refreshes_receipt(self):
        self.matching(); self.assertEqual(self.command('zakryt', self.ident).returncode, 0)
        before = self.file.read_bytes(); record = json.loads(before); ns = runpy.run_path(str(HELPER), run_name='fixture')
        with mock.patch.dict(ns['main'].__globals__, clock=lambda: record['deadline_ns'] + 1):
            self.assertEqual(self.invoke_main(ns), 0)
        self.assertEqual(self.file.read_bytes(), before)
        self.live.write_text('genuine error')
        self.assertEqual(self.command('zakryt', self.ident).returncode, 1)
        self.assertEqual(self.file.read_bytes(), before)

    def test_expired_window_can_be_failed_and_verified_rollback_allows_new_window(self):
        self.matching(); self.expired()
        self.assertEqual(self.command('otkaz', self.ident).returncode, 0)
        self.live.write_text('before')
        rollback = self.root / 'rollback.json'
        rollback.write_text(json.dumps(dict(subjects=self.record['subjects'], checks=[dict(kind='file', path=str(self.live), sha256=hashlib.sha256(b'before').hexdigest()), dict(kind='registry', path=str(self.registry), id='a', expected={'version':'2'})])))
        p = self.command('otkat-proveren', '--plan', str(rollback), self.ident)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'rolled_back')
        p = self.command('otkryt', '--plan', str(rollback), '--task', 'recovery')
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)

    def tree_tag(self):
        repo = self.root / 'tree-repo'; pkg = repo / 'packages/fixture'; pkg.mkdir(parents=True)
        (pkg / 'x').write_text('same package')
        def git(*args):
            return subprocess.run(['git','-C',str(repo),*args],check=True,capture_output=True,text=True).stdout.strip()
        git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','base')
        commit = git('rev-parse','HEAD'); tree = git('rev-parse',commit+':packages/fixture')
        git('tag','fixture-v1.0.0',commit)
        self.record.update(subjects=['tag:'+str(repo)+':fixture-v1.0.0'],checks=[dict(kind='tag',repo=str(repo),ref='fixture-v1.0.0',commit=commit,subdir='packages/fixture',tree=tree)])
        self.write();return repo,pkg,git

    def test_package_tree_equal_at_different_commit_closes_and_recovers(self):
        repo,pkg,git = self.tree_tag()
        (repo / 'elsewhere').write_text('unrelated merge');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','unrelated')
        head=git('rev-parse','HEAD');self.assertNotEqual(head,self.record['checks'][0]['commit']);git('tag','-f','fixture-v1.0.0',head)
        q=self.command('zakryt',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.write();plan=self.root/'rollback.json';plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=self.record['checks'])))
        q=self.command('otkat-proveren','--plan',str(plan),self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_package_tree_difference_refuses_then_original_tag_restores(self):
        repo,pkg,git=self.tree_tag();before=self.file.read_bytes()
        (pkg/'x').write_text('different package');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','bad tree');git('tag','-f','fixture-v1.0.0','HEAD')
        q=self.command('zakryt',self.ident);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('tree',q.stderr);self.assertEqual(self.file.read_bytes(),before)
        git('tag','-f','fixture-v1.0.0',self.record['checks'][0]['commit']);self.assertEqual(self.command('zakryt',self.ident).returncode,0)

    def test_tree_check_schema_rejects_missing_fields_bad_path_and_non_tree(self):
        repo,pkg,git=self.tree_tag();check=self.record['checks'][0];ns=runpy.run_path(str(HELPER),run_name='fixture')
        for bad in [dict(check,subdir='../fixture'),dict(check,subdir='packages//fixture'),dict(check,tree='x'*40),{k:v for k,v in check.items() if k!='tree'},{k:v for k,v in check.items() if k!='subdir'}]:
            with self.subTest(check=bad),self.assertRaises(ValueError):ns['check_shape'](bad)
        self.record['checks'][0]=dict(check,subdir='packages/fixture/x');self.write();self.assertEqual(self.command('zakryt',self.ident).returncode,1)

    def test_legacy_tag_check_retains_exact_commit_semantics(self):
        repo,pkg,git=self.tree_tag();check=self.record['checks'][0];check.pop('subdir');check.pop('tree');self.write()
        self.assertEqual(self.command('zakryt',self.ident).returncode,0)
        self.write();(repo/'other').write_text('unrelated');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','other');git('tag','-f','fixture-v1.0.0','HEAD')
        self.assertEqual(self.command('zakryt',self.ident).returncode,1)

    def test_tree_equal_tag_moving_during_verification_is_still_a_race(self):
        repo,pkg,git=self.tree_tag();original=self.record['checks'][0]['commit']
        (repo/'other').write_text('other');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','other');head=git('rev-parse','HEAD')
        ns=runpy.run_path(str(HELPER),run_name='fixture');identities=[];self.assertEqual(ns['verify'](self.record['checks'],identities),[])
        git('tag','-f','fixture-v1.0.0',head);self.assertFalse(ns['unchanged'](identities));git('tag','-f','fixture-v1.0.0',original);self.assertTrue(ns['unchanged'](identities))

    def test_vosstanovit_expired_failed_strictly_closes_without_extending_window(self):
        self.matching();self.expired();self.assertEqual(self.command('otkaz',self.ident).returncode,0)
        before=json.loads(self.file.read_text());q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        after=json.loads(self.file.read_text());self.assertEqual(after['phase'],'closed');self.assertIs(after['closed_late'],True)
        for key in ('opened_ns','deadline_ns','expires_utc','checks','subjects','boot_id'):self.assertEqual(after[key],before[key])
        self.assertGreaterEqual(after['closed_ns'],before['deadline_ns']);self.assertNotIn('rollback_checks',after)
        raw=self.file.read_bytes();self.assertEqual(self.command('vosstanovit',self.ident).returncode,0);self.assertEqual(self.file.read_bytes(),raw)
        self.assertEqual(self.command('watch','--kanal','/bin/false').returncode,0)
        plan=self.root/'next.json';plan.write_text(json.dumps({k:self.record[k] for k in ('subjects','checks')}));self.assertEqual(self.command('otkryt','--plan',str(plan),'--task','next').returncode,0)

    def test_vosstanovit_wrong_files_refuses_then_repaired_files_close(self):
        self.expired();before=self.file.read_bytes();q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.file.read_bytes(),before)
        self.matching();q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_vosstanovit_fresh_has_no_late_marker_and_old_boot_uses_closure_epoch(self):
        self.matching();q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertNotIn('closed_late',json.loads(self.file.read_text()))
        self.expired();self.record['boot_id']='0'*36;self.write();q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr);after=json.loads(self.file.read_text());self.assertEqual(after['boot_id'],'0'*36);self.assertEqual(after['closed_boot_id'],Path('/proc/sys/kernel/random/boot_id').read_text().strip());self.assertIs(after['closed_late'],True);self.assertEqual(self.command('otlozheno','--avto-montazh','--since-ns',str(after['closed_ns']),'entry:a').returncode,6)

    def test_vosstanovit_late_receipt_still_supports_strict_reread(self):
        self.matching();self.expired();started=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        q=self.command('otlozheno','--avto-montazh','--since-ns',str(started),'entry:a');self.assertEqual(q.returncode,6,q.stdout+q.stderr)
        self.live.write_text('real new failure');self.assertEqual(self.command('otlozheno','--avto-montazh','--since-ns',str(started),'entry:a').returncode,0)

    def test_late_marker_is_typed_and_removed_on_failure_or_rollback(self):
        self.matching();self.expired();q=self.command('vosstanovit',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        ns=runpy.run_path(str(HELPER),run_name='fixture');record=json.loads(self.file.read_text())
        for field in [False,1,'true']:
            with self.subTest(field=field),self.assertRaises(ValueError):ns['validate'](dict(record,closed_late=field),self.file.name)
        self.assertEqual(self.command('otkaz',self.ident).returncode,0);self.assertNotIn('closed_late',json.loads(self.file.read_text()))
        self.assertEqual(self.command('vosstanovit',self.ident).returncode,0)
        plan=self.root/'rollback-marker.json';plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=self.record['checks'])))
        self.assertEqual(self.command('otkat-proveren','--plan',str(plan),self.ident).returncode,0)
        after=json.loads(self.file.read_text());self.assertEqual(after['phase'],'rolled_back');self.assertNotIn('closed_late',after);self.assertNotIn('closed_boot_id',after)

    def test_close_missing_shared_tag_names_each_registry_entry(self):
        repo = self.root / 'git'
        package = repo / 'packages/shared'
        package.mkdir(parents=True)
        (package / 'x').write_text('fixture\n')
        for args in [('init', '-q'), ('add', '.'),
                     ('-c', 'user.name=Fixture', '-c', 'user.email=fixture@sadik', 'commit', '-qm', 'fixture')]:
            subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
        ref = 'fixture-v9.9.9'
        entries = []
        for ident in ['fixture-alpha', 'fixture-beta']:
            copy = self.root / ident / 'x'
            copy.parent.mkdir()
            copy.write_text('fixture\n')
            copy.chmod(0o644)
            entries.append({'id': ident, 'version': '1.0.0', 'installed_check': "printf '1.0.0\\n'",
                            'derevo': {'address': str(repo), 'ref': ref, 'subdir': 'packages/shared',
                                       'files': [{'local': str(copy), 'remote': 'x', 'mode': '0644', 'owner': 'root:root'}],
                                       'not_installed': [], 'expected_diff_files': [], 'links': []}})
        self.registry.write_text(json.dumps({'services': entries}))
        self.record['subjects'] = ['entry:' + entry['id'] for entry in entries]
        self.record['checks'] = [{'kind': 'registry', 'path': str(self.registry), 'id': entry['id'],
                                 'expected': {'id': entry['id']}, 'derevo_consistency': True,
                                 'owned_files': [{'local': entry['derevo']['files'][0]['local'], 'remote': 'x'}]}
                                for entry in entries]
        self.write()
        pkg = HELPER.parent.parent
        env = {**os.environ, 'MO_DEREVO_REPO': str(repo),
               'MO_DEREVO_PRIBOR': str(pkg.parent / 'dsh-vypusk-watch/src/vypusk-okno-watch.sh'),
               'MO_REESTR_PRIBOR': str(pkg.parent / 'dsh-reestr/bin/agent-plugins')}
        def close():
            return subprocess.run(['python3', '-B', str(HELPER), '--state-dir', str(self.state),
                                   'zakryt', self.ident], env=env, capture_output=True, text=True, timeout=5)
        result = close()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        reasons = result.stderr.strip().removeprefix('НЕ ЗАКРЫТО: ').split('; ')
        self.assertEqual(len(reasons), 2, result.stderr)
        for entry, reason in zip(entries, reasons):
            self.assertIn('entry:' + entry['id'], reason)
            self.assertIn(ref + '^{commit}', reason)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'open')
        subprocess.run(['git', '-C', str(repo), 'tag', ref], check=True, capture_output=True)
        result = close()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'closed')

    def test_live_window_defers_only_automatic_exact_subject(self):
        p = self.command('otlozheno', '--avto-montazh', 'file:' + str(self.live))
        self.assertEqual(p.returncode, 4, p.stderr)
        self.assertIn(self.ident, p.stdout)
        self.assertIn('ОТЛОЖЕНО', p.stdout)

    def test_producer_join_cannot_expand_or_extend_existing_window(self):
        rows = self.root / 'rows'
        rows.write_text(str(self.live) + '\t' + hashlib.sha256(b'after').hexdigest() + '\t0\t0\t644\n')
        self.record['checks'][0].update(uid=0,gid=0,mode=0o644)
        self.write(); before = self.file.read_bytes()
        p = self.command('podgotovit','--rows',str(rows),'--task','B-N-2025','--id',self.ident)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertEqual(p.stdout.strip(),self.ident)
        self.assertEqual(self.file.read_bytes(),before)
        rows.write_text(str(self.root/'outside') + '\t' + hashlib.sha256(b'after').hexdigest() + '\t0\t0\t644\n')
        p = self.command('podgotovit','--rows',str(rows),'--task','B-N-2025','--id',self.ident)
        self.assertEqual(p.returncode,2);self.assertEqual(self.file.read_bytes(),before)

    def test_unit_caller_four_needs_current_window_and_real_invocation_marker(self):
        control=self.root/'systemctl';journal=self.root/'journalctl'
        control.write_text('#!/bin/sh\ncase "$4" in ExecMainStatus) echo 4;; InvocationID) printf "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\n";; esac\n');control.chmod(0o755)
        journal.write_text('#!/bin/sh\nprintf "%s\\n" \'ОТЛОЖЕНО '+self.ident+' B-N-2025 до fixture file:'+str(self.live)+'\'\n');journal.chmod(0o755)
        env={**os.environ,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)}
        def ask():return subprocess.run([str(HELPER),'--state-dir',str(self.state),'yunit-otlozheno','--avto-montazh','registry-watchdog.service'],env=env,capture_output=True,text=True,timeout=5)
        q=ask();self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertIn(self.ident,q.stdout)
        self.record['deadline_ns']=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;self.record['opened_ns']=self.record['deadline_ns']-1800*10**9;self.write();q=ask();self.assertEqual(q.returncode,0)
        self.record['phase']='failed';self.write();self.assertEqual(ask().returncode,0)

    def test_active_id_foreign_boot_never_defers_with_current_deadline(self):
        self.assertEqual(self.command('aktivno-id','--avto-montazh',self.ident).returncode,4)
        original_boot = self.record['boot_id']
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(phase='open',boot_id='0'*36,opened_ns=now-10**9,deadline_ns=now+1800*10**9-10**9);self.write()
        p=self.command('aktivno-id','--avto-montazh',self.ident)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertNotIn('ОТЛОЖЕНО',p.stdout)
        self.record['boot_id']=original_boot;self.write()
        self.assertEqual(self.command('aktivno-id','--avto-montazh',self.ident).returncode,4)

    def test_unit_caller_foreign_boot_never_defers_with_current_deadline(self):
        control=self.root/'systemctl';journal=self.root/'journalctl'
        control.write_text('#!/bin/sh\ncase "$4" in ExecMainStatus) echo 4;; InvocationID) printf "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\n";; esac\n');control.chmod(0o755)
        journal.write_text('#!/bin/sh\nprintf "%s\\n" \'ОТЛОЖЕНО '+self.ident+' B-N-2025 до fixture file:'+str(self.live)+'\'\n');journal.chmod(0o755)
        env={**os.environ,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)}
        def ask():return subprocess.run([str(HELPER),'--state-dir',str(self.state),'yunit-otlozheno','--avto-montazh','registry-watchdog.service'],env=env,capture_output=True,text=True,timeout=5)
        p=ask();self.assertEqual(p.returncode,4,p.stdout+p.stderr)
        original_boot=self.record['boot_id'];now=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(phase='open',boot_id='0'*36,opened_ns=now-10**9,deadline_ns=now+1800*10**9-10**9);self.write()
        p=ask();self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertNotIn('ОТЛОЖЕНО',p.stdout)
        self.record['boot_id']=original_boot;self.write();p=ask();self.assertEqual(p.returncode,4,p.stdout+p.stderr)

    def test_close_refuses_changed_generation_of_an_earlier_checked_file(self):
        self.live.write_text('after');self.record['subjects']=['file:'+str(self.live),'unit:fixture.service:gateway'];self.record['checks']=[self.record['checks'][0],dict(kind='unit',unit='fixture.service',package='gateway',version='1.0.0')];self.write()
        control=self.root/'systemctl';journal=self.root/'journalctl';marker=self.root/'mutated'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nimport sys\n'
            +'m=Path('+repr(str(marker))+')\n'
            +'if not m.exists():\n Path('+repr(str(self.live))+').write_text("changed during strict close");m.write_text("1")\n'
            +'print("123" if "MainPID" in sys.argv else "fixture-start")\n');control.chmod(0o755)
        journal.write_text('#!/bin/sh\necho "[dsh-subscription-gateway 1.0.0] fixture"\n');journal.chmod(0o755)
        p=subprocess.run([str(HELPER),'--state-dir',str(self.state),'zakryt',self.ident],env={**os.environ,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)},capture_output=True,text=True,timeout=5)
        self.assertNotEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(json.loads(self.file.read_text())['phase'],'open');self.assertTrue(marker.exists());self.assertNotEqual(hashlib.sha256(self.live.read_bytes()).hexdigest(),self.record['checks'][0]['sha256'])

    def test_mixed_unit_query_expires_open_record_during_closed_verification(self):
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record['opened_ns']=now;self.record['deadline_ns']=now+10**9;self.write()
        other=dict(self.record,id='2'*32,phase='closed',closed_ns=now,subjects=['unit:fixture.service:gateway'],checks=[dict(kind='unit',unit='fixture.service',package='gateway',version='1.0.0')])
        (self.state/(other['id']+'.json')).write_text(json.dumps(other))
        control=self.root/'systemctl';journal=self.root/'journalctl';counter=self.root/'once'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nimport sys,time\n'
            +'if "fixture.service" in sys.argv:\n p=Path('+repr(str(counter))+')\n if not p.exists():p.write_text("1");time.sleep(1.2)\n'
            +'print("4" if "ExecMainStatus" in sys.argv else "a"*32 if "InvocationID" in sys.argv else "123" if "MainPID" in sys.argv else "fixture-start")\n');control.chmod(0o755)
        journal.write_text('#!/bin/sh\ncase "$*" in *_SYSTEMD_INVOCATION_ID*) printf \'ОТЛОЖЕНО '+self.ident+' B-N-2025 до fixture file:'+str(self.live)+'\\nОТЛОЖЕНО '+other['id']+' B-N-2025 до fixture unit:fixture.service:gateway\\n\';; *) echo "[dsh-subscription-gateway 1.0.0] fixture";; esac\n');journal.chmod(0o755)
        p=subprocess.run([str(HELPER),'--state-dir',str(self.state),'yunit-otlozheno','--avto-montazh','registry-watchdog.service'],env={**os.environ,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)},capture_output=True,text=True,timeout=5)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertTrue(counter.exists())

    def test_final_generation_sweep_follows_external_rechecks(self):
        self.live.write_text('after');self.record['subjects']=['file:'+str(self.live),'unit:fixture.service:gateway'];self.record['checks']=[self.record['checks'][0],dict(kind='unit',unit='fixture.service',package='gateway',version='1.0.0')];self.write()
        control=self.root/'systemctl';journal=self.root/'journalctl';counter=self.root/'count'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nimport sys\np=Path('+repr(str(counter))+');n=int(p.read_text())+1 if p.exists() else 1;p.write_text(str(n))\n'
            +'if n==4:Path('+repr(str(self.live))+').write_text("changed at final recheck")\n'
            +'print("123" if "MainPID" in sys.argv else "fixture-start")\n');control.chmod(0o755)
        journal.write_text('#!/bin/sh\necho "[dsh-subscription-gateway 1.0.0] fixture"\n');journal.chmod(0o755)
        p=subprocess.run([str(HELPER),'--state-dir',str(self.state),'zakryt',self.ident],env={**os.environ,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)},capture_output=True,text=True,timeout=5)
        self.assertNotEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(json.loads(self.file.read_text())['phase'],'open');self.assertGreaterEqual(int(counter.read_text()),4)

    def test_verified_rollback_unblocks_future_window_but_wrong_or_incomplete_plan_does_not(self):
        self.assertEqual(self.command('otkaz',self.ident).returncode,0)
        plan=self.root/'rollback.json';old_checks=[dict(kind='file',path=str(self.live),sha256=hashlib.sha256(b'before').hexdigest()),dict(kind='registry',path=str(self.registry),id='a',expected={'version':'1'})]
        plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=old_checks[:1])))
        self.assertEqual(self.command('otkat-proveren','--plan',str(plan),self.ident).returncode,2)
        old_checks[0]['sha256']=hashlib.sha256(b'wrong').hexdigest();plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=old_checks)))
        self.assertEqual(self.command('otkat-proveren','--plan',str(plan),self.ident).returncode,1)
        self.assertEqual(json.loads(self.file.read_text())['phase'],'failed')
        old_checks[0]['sha256']=hashlib.sha256(b'before').hexdigest();plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=old_checks)))
        p=self.command('otkat-proveren','--plan',str(plan),self.ident);self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(json.loads(self.file.read_text())['phase'],'rolled_back')
        target=self.root/'target-plan';target.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=self.record['checks'])))
        p=self.command('otkryt','--plan',str(target),'--task','B-N-2025');self.assertEqual(p.returncode,0,p.stdout+p.stderr)

    def test_rollback_can_prove_original_absence_of_a_new_file(self):
        self.record['subjects']=['file:'+str(self.live)];self.record['checks']=self.record['checks'][:1];self.write();self.command('otkaz',self.ident)
        plan=self.root/'rollback.json';plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=[dict(kind='absent',path=str(self.live))])))
        self.assertEqual(self.command('otkat-proveren','--plan',str(plan),self.ident).returncode,1)
        self.live.unlink();p=self.command('otkat-proveren','--plan',str(plan),self.ident);self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(json.loads(self.file.read_text())['phase'],'rolled_back')

    def test_watch_prunes_only_old_terminal_records(self):
        self.record['phase']='closed';self.record['closed_ns']=time.clock_gettime_ns(time.CLOCK_BOOTTIME);self.write();os.utime(self.file,(time.time()-86401,time.time()-86401))
        failed=dict(self.record,id='2'*32,phase='failed',notified_at=int(time.time()));f=self.state/(failed['id']+'.json');f.write_text(json.dumps(failed));os.utime(f,(time.time()-86401,time.time()-86401))
        self.assertEqual(self.command('watch','--kanal','/bin/false').returncode,0);self.assertFalse(self.file.exists());self.assertTrue(f.exists())

    def test_active_id_needs_explicit_key_and_current_safe_record(self):
        self.assertEqual(self.command('aktivno-id',self.ident).returncode,0)
        self.assertEqual(self.command('aktivno-id','--avto-montazh',self.ident).returncode,4)
        self.file.chmod(0o666)
        self.assertEqual(self.command('aktivno-id','--avto-montazh',self.ident).returncode,0)
        self.file.chmod(0o644)
        self.assertEqual(self.command('aktivno-id','--avto-montazh',self.ident).returncode,4)

    def test_expired_overlap_blocks_new_window_but_disjoint_window_is_independent(self):
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now-1801*10**9,deadline_ns=now-10**9);self.write()
        plan=self.root/'plan';plan.write_text(json.dumps(dict(subjects=self.record['subjects'],checks=self.record['checks'])))
        self.assertEqual(self.command('otkryt','--plan',str(plan),'--task','B-N-2025').returncode,2)
        other=self.root/'independent';other.write_text('fixed')
        plan.write_text(json.dumps(dict(subjects=['file:'+str(other)],checks=[dict(kind='file',path=str(other),sha256=hashlib.sha256(b'fixed').hexdigest())])))
        q=self.command('otkryt','--plan',str(plan),'--task','B-N-2025');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertEqual(self.command('otlozheno','--avto-montazh','file:'+str(other)).returncode,4)
        self.assertEqual(self.command('otlozheno','--avto-montazh','entry:a').returncode,0)

    def test_empty_run_and_wall_clock_rewind_do_not_extend_boottime_window(self):
        q=subprocess.run(['unshare','-m','--propagation','private','sh','-c',
            'mount -t tmpfs tmpfs /run && exec "$@"','fixture',str(HELPER),'--state-dir',str(self.state),'otlozheno','--avto-montazh','entry:a'],capture_output=True,text=True,timeout=5)
        self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertTrue(self.file.exists())
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);self.record.update(opened_ns=now-1801*10**9,deadline_ns=now-10**9,expires_utc='2099-01-01T00:00:00Z');self.write()
        mod=runpy.run_path(str(HELPER),run_name='fixture')
        with mock.patch.object(mod['sys'],'argv',[str(HELPER),'--state-dir',str(self.state),'otlozheno','--avto-montazh','entry:a']),mock.patch.object(mod['time'],'time',return_value=-10**9):
            self.assertEqual(mod['main'](),0)

    def test_large_unicode_actor_does_not_starve_expiry_notification(self):
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);self.record.update(actor='рука🙂'*10000,opened_ns=now-1801*10**9,deadline_ns=now-10**9);self.write()
        wire=self.root/'wire';sender=self.root/'sender';sender.write_text('#!/usr/bin/python3\nimport sys\nopen('+repr(str(wire))+',"w").write(sys.stdin.read())\n');sender.chmod(0o755)
        p=self.command('watch','--kanal',str(sender));self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        text=wire.read_text();self.assertIn(self.ident,text);self.assertIn('рука рука🙂',text);self.assertIn('entry:a',text);self.assertLessEqual(len(text.encode('utf-16-le'))//2,2800);self.assertIn('notified_at',json.loads(self.file.read_text()))

    def test_manual_query_cannot_enable_deferral(self):
        self.assertEqual(self.command('otlozheno', 'file:' + str(self.live)).returncode, 0)

    def test_outside_subject_does_not_get_package_wide_silence(self):
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'file:' + str(self.root / 'outside')).returncode, 0)

    def test_expired_window_is_strict_without_timer(self):
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now - 1801 * 10**9, deadline_ns=now - 10**9)
        self.write()
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_other_boot_is_strict(self):
        self.record['boot_id'] = '0' * 36
        self.write()
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_writable_record_is_not_a_window(self):
        self.file.chmod(0o666)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_writable_directory_is_not_a_window(self):
        self.state.chmod(0o777)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_symlink_record_is_not_a_window(self):
        real = self.root / 'real.json'
        self.file.rename(real)
        self.file.symlink_to(real)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_foreign_owner_is_not_a_window(self):
        os.chown(self.file, 65534, 65534)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_upper_ttl_limit_cannot_be_bypassed_in_record(self):
        self.record['deadline_ns'] = self.record['opened_ns'] + 1810 * 10**9
        self.write()
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_close_cannot_approve_files_or_registry_that_do_not_match(self):
        p = self.command('zakryt', self.ident)
        self.assertEqual(p.returncode, 1, p.stderr)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'open')

    def test_close_checks_actual_files_and_registry_then_disables_deferral(self):
        self.live.write_text('after')
        self.registry.write_text('plugins:\n  - id: a\n    version: "2"\n')
        p = self.command('zakryt', self.ident)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'closed')
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_open_publishes_complete_root_record_and_refuses_overlap(self):
        self.file.unlink()
        plan = self.root / 'plan.json'
        plan.write_text(json.dumps({key: self.record[key] for key in ['subjects', 'checks']}))
        p = self.command('otkryt', '--plan', str(plan), '--task', 'B-N-2025')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertRegex(p.stdout.strip(), r'^[0-9a-f]{32}$')
        file = self.state / (p.stdout.strip() + '.json')
        self.assertEqual(file.stat().st_uid, 0)
        self.assertEqual(file.stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 4)
        second = self.command('otkryt', '--plan', str(plan), '--task', 'B-N-2025')
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(len(list(self.state.glob('*.json'))), 1)

    def test_open_bad_plan_or_ttl_makes_no_record(self):
        self.file.unlink()
        plan = self.root / 'plan.json'
        plan.write_text(json.dumps({key: self.record[key] for key in ['subjects', 'checks']}))
        p = self.command('otkryt', '--plan', str(plan), '--task', 'B-N-2025', '--ttl', '1810')
        self.assertNotEqual(p.returncode, 0)
        self.assertFalse(list(self.state.glob('*.json')))
        plan.write_text('{"subjects":["entry:a"],"checks":[]}')
        self.assertNotEqual(self.command('otkryt', '--plan', str(plan), '--task', 'B-N-2025').returncode, 0)
        self.assertFalse(list(self.state.glob('*.json')))

    def test_writer_lock_wait_is_bounded_to_five_seconds(self):
        with (self.state / '.lock').open('w') as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            started = time.monotonic()
            try:
                p = subprocess.run(['python3', str(HELPER), '--state-dir', str(self.state),
                    'otkaz', self.ident], capture_output=True, text=True, timeout=7)
            except subprocess.TimeoutExpired:
                self.fail('writer ignored the five-second lock deadline')
            self.assertEqual(p.returncode, 2)
            self.assertLess(time.monotonic() - started, 6.5)

    def test_late_closed_window_remeasures_actual_subject(self):
        before = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.live.write_text('after')
        self.registry.write_text('plugins:\n  - id: a\n    version: "2"\n')
        self.assertEqual(self.command('zakryt', self.ident).returncode, 0)
        p = self.command('otlozheno', '--avto-montazh', '--since-ns', str(before), 'entry:a')
        self.assertEqual(p.returncode, 6, p.stderr)
        self.assertIn('ПЕРЕСНЯТО', p.stdout)
        self.live.write_text('new genuine error')
        self.assertEqual(self.command('otlozheno', '--avto-montazh', '--since-ns', str(before), 'entry:a').returncode, 0)

    def test_expiry_notifies_once_and_failed_channel_does_not_acknowledge(self):
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now - 1801 * 10**9, deadline_ns=now - 10**9)
        self.write()
        trace = self.root / 'alert.jsonl'
        sender = self.root / 'sender'
        sender.write_text('#!/usr/bin/python3\nimport sys,json,fcntl\n'
            'lock=open(' + repr(str(self.state / '.lock')) + ',"a")\nfcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)\n'
            'with open(' + repr(str(trace)) + ',"a") as f:f.write(json.dumps({"argv":sys.argv[1:],"text":sys.stdin.read()})+"\\n")\n')
        sender.chmod(0o755)
        p = self.command('watch', '--kanal', str(sender))
        self.assertEqual(p.returncode, 0, p.stderr)
        messages = [json.loads(line) for line in trace.read_text().splitlines()]
        self.assertEqual(len(messages), 1)
        self.assertIn(self.ident, messages[0]['text'])
        self.assertIn('30 мин', messages[0]['text'])
        self.assertIn('рука fixture', messages[0]['text'])
        self.assertIn('file:' + str(self.live), messages[0]['text'])
        self.assertIn('entry:a', messages[0]['text'])
        self.assertEqual(messages[0]['argv'], ['--plain'])
        self.assertIn('notified_at', json.loads(self.file.read_text()))
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        self.assertEqual(len(trace.read_text().splitlines()), 1)
        self.write()
        healthy_sender = sender.read_text()
        sender.write_text('#!/bin/sh\nexit 1\n')
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 2)
        self.assertNotIn('notified_at', json.loads(self.file.read_text()))
        sender.write_text(healthy_sender)
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        self.assertEqual(len(trace.read_text().splitlines()), 2)
        self.assertIn('notified_at', json.loads(self.file.read_text()))
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        self.assertEqual(len(trace.read_text().splitlines()), 2)

    def test_invalid_duplicate_json_never_defers(self):
        text = self.file.read_text()
        self.file.write_text(text[:-1] + ',"schema":1}')
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)

    def test_watch_acknowledges_only_full_lines_in_delivered_batch(self):
        self.file.unlink()
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        for i in range(40):
            target = self.root / ('target-' + str(i))
            target.write_text('before')
            data = dict(self.record, id=f'{i:032x}', task='B-N-' + 'X' * 120,
                opened_ns=now - 1801 * 10**9, deadline_ns=now - 10**9,
                subjects=['file:' + str(target)], checks=[{'kind': 'file', 'path': str(target),
                    'sha256': hashlib.sha256(b'after').hexdigest()}])
            (self.state / (data['id'] + '.json')).write_text(json.dumps(data))
        trace = self.root / 'wire'
        sender = self.root / 'sender'
        sender.write_text('#!/usr/bin/python3\nimport sys\nopen(' + repr(str(trace)) + ',"w").write(sys.stdin.read())\n')
        sender.chmod(0o755)
        self.assertEqual(self.command('watch', '--kanal', str(sender)).returncode, 0)
        wire = trace.read_text()
        acknowledged = [f.stem for f in self.state.glob('*.json') if 'notified_at' in json.loads(f.read_text())]
        self.assertTrue(acknowledged)
        self.assertLess(len(acknowledged), 40)
        self.assertTrue(all('/' + ident + ':' in wire for ident in acknowledged), 'acknowledged unseen/truncated window')

    def test_closed_record_of_previous_boot_cannot_satisfy_late_reread(self):
        self.live.write_text('after')
        self.registry.write_text('plugins:\n  - id: a\n    version: "2"\n')
        self.record.update(phase='closed', closed_ns=time.clock_gettime_ns(time.CLOCK_BOOTTIME),
            boot_id='00000000-0000-0000-0000-000000000000')
        self.write()
        p = self.command('otlozheno', '--avto-montazh', '--since-ns', '1', 'entry:a')
        self.assertEqual(p.returncode, 0)

    def test_file_check_reads_one_nofollow_fd_under_name_swap(self):
        module = runpy.run_path(str(HELPER), run_name='fixture_reader')
        self.live.write_text('after')
        self.live.chmod(0o600)
        check = {'kind': 'file', 'path': str(self.live), 'sha256': hashlib.sha256(b'after').hexdigest(), 'mode': 0o600}
        self.assertEqual(module['verify']([check]), [])
        alternate = self.root / 'alternate'
        alternate.write_text('after')
        alternate.chmod(0o644)
        original = os.lstat
        replacements = []
        def swap(path, *args, **kwargs):
            result = original(path, *args, **kwargs)
            if str(path) == str(self.live) and not replacements:
                self.live.unlink()
                self.live.symlink_to(alternate)
                replacements.append(1)
            return result
        with mock.patch.object(os, 'lstat', side_effect=swap):
            errors = module['verify']([check])
        self.assertEqual(replacements, [1], 'fault was not inserted')
        self.assertTrue(self.live.is_symlink())
        self.assertTrue(errors, 'old inode metadata approved bytes opened through replacement symlink')
        self.live.unlink()
        self.live.write_text('after')
        self.live.chmod(0o600)
        self.assertEqual(module['verify']([check]), [])

    def test_close_duplicate_registry_keys_is_not_strict_acceptance(self):
        self.live.write_text('after')
        self.registry.write_text('plugins:\n  - id: a\n    version: "wrong"\n    version: "2"\n')
        self.assertEqual(self.command('zakryt', self.ident).returncode, 1)
        self.assertEqual(json.loads(self.file.read_text())['phase'], 'open')

    def test_boolean_uid_check_is_unknown_schema_and_never_defers(self):
        self.record['checks'][0]['uid'] = False
        self.write()
        self.assertEqual(self.command('otlozheno', '--avto-montazh', 'entry:a').returncode, 0)


if __name__ == '__main__':
    assert os.getuid() == 0, 'root required only for ownership fixtures'
    unittest.main()
