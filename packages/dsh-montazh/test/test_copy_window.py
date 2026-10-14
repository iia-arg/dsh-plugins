"""Step 2 actual producer/helper/copy/VOW contracts, with private roots only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import runpy
import tarfile
import time

import test_montazh_producer as fixtures

PKG = Path(__file__).resolve().parents[1]


class CopyWindows(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.Producers()
        self.fixture.setUp()
        # Ordinary discovery uses <root>/<npm name>, not the mapping's narrower policy.
        original = self.fixture.live
        live = self.fixture.r / 'copies/fixture'
        live.parent.mkdir()
        shutil.move(original, live)
        self.fixture.live = live
        self.fixture.target = live / 'x'
        self.fixture.env.update(FIXTURE_LIVE=str(live), FIXTURE_TARGET=str(live / 'x'))
        self.fixture.release_registry()
        self.fixture.env['MO_COPY_PRIBOR'] = str(PKG.parent / 'dsh-vypusk-watch/src/copy-compare.sh')
        self.config = self.fixture.r / 'copy-config.json'
        self.config.write_text(json.dumps({'VYPUSK_REPO': str(self.fixture.repo),
                                          'VYPUSK_SOOTVETSTVIYA': ''}))
        self.fixture.env['MO_COPY_CONFIG'] = str(self.config)

    def tearDown(self):
        self.fixture.tearDown()

    def publish(self):
        result = self.fixture.release_head()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return self.fixture.records()[0]

    def test_copy_substitutions_are_printed_on_stderr_and_removing_them_is_quiet(self):
        f = self.fixture
        def clock(environment):
            return subprocess.run([str(PKG/'sbin/montazh-okno'),'vremya'], env=environment,
                                  capture_output=True,text=True,timeout=10)
        clean = {k:v for k,v in f.env.items() if k not in ('MO_COPY_PRIBOR','MO_COPY_CONFIG')}
        self.assertEqual(clock(clean).stderr,'')
        explicit = clock(f.env)
        self.assertEqual(explicit.returncode,0)
        for name in ('MO_COPY_PRIBOR','MO_COPY_CONFIG'):
            self.assertIn('⚠️ ПОДМЕНА: '+name+'='+f.env[name],explicit.stderr)
        self.assertTrue(explicit.stdout.strip().isdigit())
        self.assertEqual(clock(clean).stderr,'')

    def test_window_preserves_the_declared_copy_substitutions(self):
        f = self.fixture
        result = f.release_head()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        record = f.records()[0]
        expected = {name:f.env[name] for name in ('MO_COPY_PRIBOR','MO_COPY_CONFIG')}
        self.assertEqual(record.get('substitutions'),expected)
        for name,value in expected.items():
            self.assertIn('⚠️ ПОДМЕНА: '+name+'='+value,result.stderr)

    def test_copy_window_vosstanovit_preserves_snapshot_and_late_marker(self):
        f = self.fixture
        record = self.publish()
        f.release_pravka()
        path = f.state/(record['id']+'.json')
        expired = dict(record)
        expired['deadline_ns'] = time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1
        expired['opened_ns'] = expired['deadline_ns']-1800*10**9
        old_bytes = path.read_bytes()
        self.assertNotEqual(expired,record)
        path.write_text(json.dumps(expired))
        before_sha = hashlib.sha256(old_bytes).hexdigest()
        after_sha = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertNotEqual(before_sha,after_sha)
        needle = '"deadline_ns": '+str(expired['deadline_ns'])
        self.assertEqual(subprocess.check_output(['grep','-cF',needle,str(path)],text=True).strip(),'1')
        print('CORRUPTION expired copy window replacements=2 literal_count=1 deadline_ns='+
              str(expired['deadline_ns'])+' sha256='+before_sha+'->'+after_sha)
        before = path.read_bytes()
        self.assertEqual(f.release_close(expired).returncode,1)
        self.assertEqual(path.read_bytes(),before)
        restored = subprocess.run([str(PKG/'sbin/montazh-okno'),'vosstanovit',record['id']],
                                  env=f.env,capture_output=True,text=True,timeout=30)
        self.assertEqual(restored.returncode,0,restored.stdout+restored.stderr)
        current = f.records()[0]
        self.assertEqual(current['phase'],'closed')
        self.assertTrue(current['closed_late'])
        self.assertEqual(current['rollback_plan'],record['rollback_plan'])
        self.assertEqual(current['substitutions'],record['substitutions'])
        repeat = f.release_close(current)
        self.assertEqual(repeat.returncode,0,repeat.stdout+repeat.stderr)
        self.assertEqual(f.records()[0]['closed_ns'],current['closed_ns'])

    def vow(self, auto=True, changes=None, reader=None):
        f = self.fixture
        alert = f.b / 'copy-alert'
        alert.write_text('#!/bin/sh\nprintf "called\\n" >> "' + str(f.r / 'copy-alerts') + '"\n')
        alert.chmod(0o755)
        exceptions = f.r / 'copy-exceptions'
        exceptions.write_text('')
        env = {**f.env, 'VYPUSK_REPO': str(f.repo), 'VYPUSK_REESTR': str(f.reg),
               'VYPUSK_KORNI': str(f.live.parent), 'VYPUSK_AGENT_KORNI': '',
               'VYPUSK_INFO_KORNI': '', 'VYPUSK_AGENT_POISK': '', 'VYPUSK_SOOTVETSTVIYA': '',
               'VYPUSK_SSYLKI': '', 'VYPUSK_RASKLADKA': '', 'VYPUSK_ALERT': str(alert),
               'VYPUSK_SOSTOYANIE': str(f.r / 'copy-watch-state'),
               'VYPUSK_ISKLYUCHENIYA': str(exceptions)}
        env.update(changes or {})
        return subprocess.run(['bash', str(reader or PKG.parent / 'dsh-vypusk-watch/src/vypusk-okno-watch.sh'),
                               *(['--avto-montazh'] if auto else [])], env=env,
                              capture_output=True, text=True, timeout=20)

    def test_normal_copy_mismatch_defers_only_automatic_reader_and_returns_green(self):
        f = self.fixture
        record = self.publish()
        f.release_pravka()
        self.assertEqual(self.vow().returncode, 0)
        f.target.write_text('partial new bytes\n')
        automatic = self.vow()
        self.assertEqual(automatic.returncode, 4, automatic.stdout + automatic.stderr)
        self.assertFalse((f.r / 'copy-alerts').exists())
        strict = self.vow(auto=False)
        self.assertEqual(strict.returncode, 1, strict.stdout + strict.stderr)
        self.assertTrue((f.r / 'copy-alerts').exists())
        f.target.write_text('new')
        self.assertEqual(f.release_close(record).returncode, 0)
        self.assertEqual(self.vow().returncode, 0)

    def test_old_manifest_with_new_code_uses_expected_plan_tag_not_old_version(self):
        f = self.fixture
        record = self.publish()
        old_manifest = subprocess.check_output(['git', '-C', str(f.repo), 'show',
                                                f.old_c + ':packages/fixture/package.json'])
        (f.live / 'package.json').write_bytes(old_manifest)
        automatic = self.vow()
        self.assertEqual(automatic.returncode, 4, automatic.stdout + automatic.stderr)
        self.assertFalse((f.r / 'copy-alerts').exists())
        self.assertEqual(f.release_close(record).returncode, 1)

    def test_config_change_does_not_keep_deferral_or_close_with_old_scope(self):
        f = self.fixture
        record = self.publish()
        f.target.write_text('partial new bytes\n')
        self.assertEqual(self.vow().returncode, 4)
        original = self.config.read_bytes()
        self.config.write_text(json.dumps({'VYPUSK_REPO': str(f.repo),
                                          'VYPUSK_SOOTVETSTVIYA': 'fixture=' + str(f.live)}))
        result = self.vow()
        self.assertNotEqual(result.returncode, 4, result.stdout + result.stderr)
        f.target.write_text('new')
        f.release_pravka()
        self.assertEqual(f.release_close(record).returncode, 1)
        self.config.write_bytes(original)
        self.assertEqual(f.release_close(record).returncode, 0)

    def test_file_added_after_copy_comparison_is_caught_by_common_barrier(self):
        f = self.fixture
        record = self.publish()
        f.release_pravka()
        actual = f.env['MO_COPY_PRIBOR']
        wrapper = f.b / 'racing-copy-checker'
        wrapper.write_text('#!/bin/bash\npython3 - "$@" <<\'PY_RACE\'\nimport sys,subprocess\nfrom pathlib import Path\n'
                           'p=subprocess.run(["bash",' + repr(actual) + ',*sys.argv[1:]],capture_output=True)\n'
                           'root=Path(sys.argv[sys.argv.index("--copy")+1])\n'
                           '(root/"injected-after-compare.js").write_text("race\\n")\n'
                           'sys.stdout.buffer.write(p.stdout);sys.stderr.buffer.write(p.stderr);sys.exit(p.returncode)\nPY_RACE\n')
        wrapper.chmod(0o755)
        f.env['MO_COPY_PRIBOR'] = str(wrapper)
        result = f.release_close(record)
        self.assertEqual((f.live / 'injected-after-compare.js').read_text(), 'race\n')
        self.assertEqual(subprocess.check_output(['grep', '-cF', 'race',
                                                 str(f.live / 'injected-after-compare.js')],
                                                text=True).strip(), '1')
        print('CORRUPTION extra after compare exists literal_count=1 sha256=' +
              hashlib.sha256((f.live / 'injected-after-compare.js').read_bytes()).hexdigest())
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(f.records()[0]['phase'], 'open')
        f.env['MO_COPY_PRIBOR'] = actual
        (f.live / 'injected-after-compare.js').unlink()
        self.assertEqual(f.release_close(record).returncode, 0)

    def test_producer_publishes_copy_and_all_three_file_obligations(self):
        f = self.fixture
        record = self.publish()
        subject = 'copy:' + str(f.repo) + ':packages/fixture:' + str(f.live)
        self.assertIn(subject, record['subjects'])
        copies = [c for c in record['checks'] if c['kind'] == 'copy']
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0]['commit'], f.new_c)
        self.assertEqual({p['path'] for p in copies[0]['publication']},
                         {'x', 'package.json', 'CHANGELOG.md'})
        f.release_pravka()
        self.assertEqual(f.release_close(record).returncode, 0)

    def common_fixture(self):
        f = self.fixture
        other = f.r / 'other-copies/fixture'
        shutil.copytree(f.live, other)
        second = dict(f.release_entry, id='release-second', path=str(other),
                      installed_check=f.release_entry['installed_check'].replace(str(f.live), str(other)))
        f.reg.write_text(json.dumps({'plugins': [f.release_entry, second], 'services': []}))
        selector = f.r / 'copies.json'
        selector.write_text(json.dumps({'package': 'fixture', 'version': '1.0.0',
                                        'copies': ['release-fixture', 'release-second']}))
        return other, second, selector

    def test_common_plan_predeclares_all_roots_and_join_keeps_record_immutable(self):
        f = self.fixture
        other, second, selector = self.common_fixture()
        result = f.release_head('--okno-copies', str(selector))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        record = f.records()[0]
        self.assertEqual({c['root'] for c in record['checks'] if c['kind'] == 'copy'},
                         {str(f.live), str(other)})
        self.assertEqual((other / 'x').read_text(), 'old')
        f.release_entry['version'] = '1.0.0'
        f.reg.write_text(json.dumps({'plugins': [f.release_entry, second], 'services': []}))
        self.assertEqual(f.release_close(record).returncode, 1)
        before = (f.state / (record['id'] + '.json')).read_bytes()
        result = subprocess.run(['bash', str(f.smv), 'HEAD', 'packages/fixture', str(other),
                                 '--v-boj', 'B-N-2043-PROBE', '--okno-id', record['id']],
                                env=f.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((f.state / (record['id'] + '.json')).read_bytes(), before)
        second['version'] = '1.0.0'
        f.reg.write_text(json.dumps({'plugins': [f.release_entry, second], 'services': []}))
        self.assertEqual(f.release_close(record).returncode, 0)

    def test_partial_rollback_cannot_close_common_plan_and_full_restore_can(self):
        f = self.fixture
        other, second, selector = self.common_fixture()
        old = {name: (f.live / name).read_bytes() for name in ['package.json', 'x', 'CHANGELOG.md']}
        result = f.release_head('--okno-copies', str(selector))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        record = f.records()[0]
        (other / 'x').write_text('partial rollback damage')
        for name, data in old.items(): (f.live / name).write_bytes(data)
        def rollback():
            return subprocess.run([str(PKG / 'sbin/montazh-okno'), 'otkat-proveren', record['id']],
                                  env=f.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(rollback().returncode, 1)
        self.assertEqual(f.records()[0]['phase'], 'open')
        (other / 'x').write_bytes(old['x'])
        restored = rollback()
        self.assertEqual(restored.returncode, 0, restored.stdout + restored.stderr)
        self.assertEqual(f.records()[0]['phase'], 'rolled_back')

    def test_unknown_copy_id_refuses_before_changes(self):
        f = self.fixture
        other, second, selector = self.common_fixture()
        selector.write_text(json.dumps({'package': 'fixture', 'version': '1.0.0', 'copies': ['missing']}))
        result = f.release_head('--okno-copies', str(selector))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(f.target.read_text(), 'old')
        self.assertEqual(f.records(), [])

    def test_published_link_target_refuses_before_first_replacement(self):
        f = self.fixture
        foreign = f.r / 'foreign'
        foreign.write_text('old')
        f.target.unlink()
        f.target.symlink_to(foreign)
        result = f.release_head()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(f.target.is_symlink())
        self.assertEqual(foreign.read_text(), 'old')
        self.assertEqual(f.records(), [])

    def test_mixed_strict_and_deferred_copies_stay_red(self):
        f = self.fixture
        record = self.publish()
        f.target.write_text('partial')
        other = f.r / 'uncovered/fixture'
        shutil.copytree(f.live, other)
        result = self.vow(changes={'VYPUSK_KORNI': str(f.live.parent) + ':' + str(other.parent)})
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('ОТЛОЖЕНО', result.stdout)
        self.assertIn(str(other), result.stdout)
        self.assertTrue((f.r / 'copy-alerts').exists())

    def test_old_reader_stays_strict_on_normal_copy_while_new_reader_defers(self):
        f = self.fixture
        self.publish()
        f.target.write_text('partial')
        self.assertEqual(self.vow(reader=PKG / 'test/fixtures/vow-sh1.sh').returncode, 1)
        self.assertEqual(self.vow().returncode, 4)
        f.target.write_text('new')
        f.release_pravka()
        self.assertEqual(f.release_close().returncode, 0)
        self.assertEqual(self.vow(reader=PKG / 'test/fixtures/vow-sh1.sh').returncode, 0)

    def test_actual_vow_package_self_transfer_with_preserved_old_reader(self):
        f=self.fixture
        staging=f.r/'old-package'
        with tarfile.open(PKG/'test/fixtures/vow-package-sh1.tar.gz') as archive:
            archive.extractall(staging,filter='data')
        old=staging/'packages/dsh-vypusk-watch'
        source=f.repo/'packages/dsh-vypusk-watch'
        shutil.copytree(old,source)
        def git(*args):
            return subprocess.check_output(['git','-C',str(f.repo),*args],stderr=subprocess.PIPE,text=True).strip()
        git('add','.')
        git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','old actual VOW')
        git('tag','dsh-vypusk-watch-v3.1.3')
        live=f.r/'self-copy/node_modules/dsh-vypusk-watch'
        shutil.copytree(old,live)
        old_reader=f.r/'preserved-old-vow.sh'
        old_reader.write_bytes((live/'src/vypusk-okno-watch.sh').read_bytes())
        self.assertEqual(hashlib.sha256(old_reader.read_bytes()).hexdigest(),
                         '52b04a257029c778124205a28d564a665e3849a8f537e296a7a376faac64fe6d')
        shutil.rmtree(source)
        shutil.copytree(PKG.parent/'dsh-vypusk-watch',source,ignore=shutil.ignore_patterns('__pycache__'))
        meta=json.loads((source/'package.json').read_text());meta['version']='99.0.0-fixture'
        (source/'package.json').write_text(json.dumps(meta))
        (source/'CHANGELOG.md').write_text('## 99.0.0-fixture — private self transfer\n\n'+(source/'CHANGELOG.md').read_text())
        git('add','.')
        git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new actual VOW')
        git('tag','dsh-vypusk-watch-v99.0.0-fixture')
        row=dict(id='dsh-vypusk-watch',path=str(live),version='3.1.3',
                 source=dict(type='local-dir',address=str(source)),
                 installed_check='python3 '+str(f.r/'version-pribor.py')+' '+str(live/'package.json'))
        f.reg.write_text(json.dumps({'plugins':[row],'services':[]}))
        result=subprocess.run(['bash',str(f.smv),'HEAD','packages/dsh-vypusk-watch',str(live),
                               '--v-boj','B-N-2043-SELF'],env=f.env,capture_output=True,text=True,timeout=60)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        record=f.records()[0]
        actual_reader=live/'src/vypusk-okno-watch.sh'
        old_bytes=actual_reader.read_bytes()
        actual_reader.write_bytes(old_bytes+b'\n# partial self transfer\n')
        changes={'VYPUSK_KORNI':str(live.parent)}
        self.assertEqual(self.vow(changes=changes,reader=old_reader).returncode,1)
        self.assertEqual(self.vow(changes=changes,reader=actual_reader).returncode,4)
        actual_reader.write_bytes(old_bytes)
        row['version']='99.0.0-fixture'
        f.reg.write_text(json.dumps({'plugins':[row],'services':[]}))
        self.assertEqual(f.release_close(record).returncode,0)
        self.assertEqual(self.vow(changes=changes,reader=actual_reader).returncode,0)

    def test_reader_policy_change_cannot_borrow_the_helper_configuration(self):
        f = self.fixture
        self.publish()
        f.target.write_text('partial')
        self.assertEqual(self.vow().returncode, 4)
        result = self.vow(changes={'VYPUSK_SOOTVETSTVIYA': 'fixture=' + str(f.live)})
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(self.vow().returncode, 4)

    def test_missing_comparator_stops_admission_before_replacement(self):
        f = self.fixture
        f.env['MO_COPY_PRIBOR'] = str(f.r / 'absent-checker')
        result = f.release_head()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(f.target.read_text(), 'old')
        self.assertEqual(f.records(), [])

    def test_incomplete_checker_reply_cannot_close_a_damaged_copy(self):
        f = self.fixture
        record = self.publish()
        f.release_pravka()
        state = f.state/(record['id']+'.json')
        self.assertEqual(f.release_close(record).returncode,0)
        state.write_text(json.dumps(record))
        extra = f.live/'not-in-publication.js'
        extra.write_text('corruption')
        wrapper = f.b/'incomplete-checker'
        wrapper.write_text('#!/bin/sh\nprintf \'{"status":"match"}\\n\'\n')
        wrapper.chmod(0o755)
        actual = f.env['MO_COPY_PRIBOR']
        f.env['MO_COPY_PRIBOR'] = str(wrapper)
        result = f.release_close(record)
        self.assertEqual(result.returncode,1,result.stdout+result.stderr)
        self.assertEqual(f.records()[0]['phase'],'open')
        f.env['MO_COPY_PRIBOR'] = actual
        self.assertEqual(f.release_close(record).returncode,1)
        extra.unlink()
        self.assertEqual(f.release_close(record).returncode,0)


    def test_registry_ownership_change_removes_deferral_then_restore_recovers(self):
        f = self.fixture
        self.publish()
        f.target.write_text('partial')
        self.assertEqual(self.vow().returncode,4)
        original = f.reg.read_bytes()
        foreign = f.r/'foreign/package.json'
        foreign.parent.mkdir();foreign.write_text('{"name":"other","version":"0.9.0"}')
        data=json.loads(original)
        data['plugins'][0]['path']=str(foreign.parent)
        data['plugins'][0]['installed_check']='python3 '+str(f.r/'version-pribor.py')+' '+str(foreign)
        f.reg.write_text(json.dumps(data))
        self.assertEqual(self.vow().returncode,1)
        f.reg.write_bytes(original)
        self.assertEqual(self.vow().returncode,4)

    def test_last_copy_barrier_rechecks_after_external_tag_calls(self):
        namespace=runpy.run_path(str(PKG/'sbin/montazh-okno'))
        f=self.fixture
        c={'root':str(f.live),'policy':0}
        observed=namespace['copy_observed'](c)
        tag={'repo':str(f.repo),'ref':'fixture-v1.0.0','commit':f.new_c}
        identities=[('copy-state',c,observed),('tag',tag,f.new_c)]
        namespace['unchanged'].__globals__['run']=lambda args:f.new_c
        self.assertTrue(namespace['unchanged'](identities))
        extra=f.live/'late-added.js'
        def racing(args):
            extra.write_text('barrier corruption')
            return f.new_c
        namespace['unchanged'].__globals__['run']=racing
        self.assertFalse(namespace['unchanged'](identities))
        self.assertTrue(extra.is_file())
        namespace['unchanged'].__globals__['run']=lambda args:f.new_c
        extra.unlink()
        self.assertTrue(namespace['unchanged'](identities))

    def test_noop_target_does_not_silently_start_or_install_other_copies(self):
        f = self.fixture
        other, second, selector = self.common_fixture()
        for name in ['package.json', 'x', 'CHANGELOG.md']:
            shutil.copyfile(f.repo / 'packages/fixture' / name, f.live / name)
        result = f.release_head('--okno-copies', str(selector))
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual((other / 'x').read_text(), 'old')
        self.assertEqual(f.records(), [])

    def test_exact_rollback_of_missing_old_manifest_does_not_assert_health(self):
        f = self.fixture
        old = {name: (f.live / name).read_bytes() for name in ['x', 'CHANGELOG.md']}
        (f.live / 'package.json').unlink()
        record = self.publish()
        (f.live / 'package.json').unlink()
        for name, data in old.items(): (f.live / name).write_bytes(data)
        result = subprocess.run([str(PKG / 'sbin/montazh-okno'), 'otkat-proveren', record['id']],
                                env=f.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(f.records()[0]['phase'], 'rolled_back')
        self.assertNotEqual(self.vow(auto=False).returncode, 0)
        control = f.b / 'unit-control'
        control.write_text('#!/bin/sh\ncase "$*" in\n *ExecMainStatus*) echo 4;;\n *InvocationID*) echo '+ 'b'*32 +';;\nesac\n')
        control.chmod(0o755)
        journal = f.b / 'unit-journal'
        journal.write_text('#!/bin/sh\nprintf "%s\\n" '+repr('ОТЛОЖЕНО '+record['id']+' '+record['task']+' до '+record['expires_utc']+' copy:'+str(f.repo)+':packages/fixture:'+str(f.live))+'\n')
        journal.chmod(0o755)
        result = subprocess.run([str(PKG / 'sbin/montazh-okno'), 'yunit-otlozheno', '--avto-montazh',
                                 'vypusk-okno-watch.service'], env={**f.env,'MO_SYSTEMCTL':str(control),'MO_JOURNALCTL':str(journal)},
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('ПЕРЕСНЯТО', result.stdout)

    def test_rollback_rejects_new_registry_field_then_accepts_exact_restoration(self):
        f = self.fixture
        old = {name: (f.live / name).read_bytes() for name in ['x','package.json','CHANGELOG.md']}
        original = f.reg.read_bytes()
        record = self.publish()
        for name, data in old.items(): (f.live/name).write_bytes(data)
        changed = json.loads(original)
        changed['plugins'][0]['unexpected_new_field'] = 'corruption'
        f.reg.write_text(json.dumps(changed))
        self.assertEqual(subprocess.check_output(['grep','-cF','unexpected_new_field',str(f.reg)],text=True).strip(),'1')
        before,after = map(lambda b:hashlib.sha256(b).hexdigest(),[original,f.reg.read_bytes()])
        self.assertNotEqual(before,after)
        print('CORRUPTION registry new field count=1 sha256='+before+'->'+after)
        def rollback():
            return subprocess.run([str(PKG/'sbin/montazh-okno'),'otkat-proveren',record['id']],
                                  env=f.env,capture_output=True,text=True,timeout=30)
        self.assertEqual(rollback().returncode,1)
        f.reg.write_bytes(original)
        result = rollback()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_trusted_baseline_is_the_old_copy_before_temporary_files(self):
        f = self.fixture
        old_bytes = {name: (f.live / name).read_bytes()
                     for name in ['x', 'package.json', 'CHANGELOG.md']}
        record = self.publish()
        copy = next(c for c in record['checks'] if c['kind'] == 'copy')
        rows = {item['path']: item for item in copy['baseline']}
        self.assertEqual(set(rows), set(old_bytes))
        for name, data in old_bytes.items():
            self.assertEqual(rows[name]['sha256'], hashlib.sha256(data).hexdigest())
        self.assertFalse(any('.new-' in name for name in rows))

    def test_close_rejects_extra_file_and_then_accepts_restored_copy(self):
        f = self.fixture
        record = self.publish()
        self.assertTrue(any(c['kind'] == 'copy' for c in record['checks']))
        f.release_pravka()
        # Fixture policy is ordinary, so this file is in scope; it was never in file rows.
        extra = f.live / 'foreign.js'
        extra.write_text('proven extra\n')
        result = f.release_close(record)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(f.records()[0]['phase'], 'open')
        extra.unlink()
        result = f.release_close(record)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_copy_lookup_cannot_combine_separate_file_and_tag_windows(self):
        f = self.fixture
        record = self.publish()
        self.assertTrue(any(c['kind'] == 'copy' for c in record['checks']))
        copy_subject = 'copy:' + str(f.repo) + ':packages/fixture:' + str(f.live)
        file_subject = 'file:' + str(f.live / 'package.json')
        tag_subject = 'tag:' + str(f.repo) + ':fixture-v1.0.0'
        # Healthy linkage is one root-owned record; another window cannot substitute for its tag.
        state_file = f.state / (record['id'] + '.json')
        original = state_file.read_bytes()
        removed = dict(record)
        removed['subjects'] = [s for s in record['subjects'] if s != tag_subject]
        state_file.write_text(json.dumps(removed))
        result = subprocess.run([str(PKG / 'sbin/montazh-okno'), 'otlozheno',
                                 '--avto-montazh', '--require', file_subject,
                                 '--require', tag_subject, copy_subject], env=f.env,
                                capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 4)
        state_file.write_bytes(original)
        result = subprocess.run([str(PKG / 'sbin/montazh-okno'), 'otlozheno',
                                 '--avto-montazh', '--require', file_subject,
                                 '--require', tag_subject, copy_subject], env=f.env,
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 4, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
