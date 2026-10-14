#!/usr/bin/env python3
"""Actual watcher on private Git/releases/copies and a recording fake alert sender.
Never start systemd or access a live registry/window/state/alert channel.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

PKG=Path(__file__).resolve().parents[1]
WATCH=Path(os.environ.get('VYPUSK_TEST_WATCH',PKG/'src/vypusk-okno-watch.sh')).resolve()


class Audit(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='vypusk-audit-');self.addCleanup(self.tmp.cleanup)
        self.d=Path(self.tmp.name);self.repo=self.d/'repo';self.pk=self.repo/'packages/demo';self.pk.mkdir(parents=True)
        (self.pk/'package.json').write_text('{"name":"demo","version":"1.0.0","files":["index.js","CHANGELOG.md","my file.txt"]}\n')
        (self.pk/'index.js').write_text('original\n');(self.pk/'my file.txt').write_text('spaced original\n')
        (self.pk/'CHANGELOG.md').write_text('## 1.0.0 — private fixture\n')
        self.git('init','-q');self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','fixture');self.git('tag','demo-v1.0.0')
        self.root=self.d/'copies';self.root.mkdir();self.live=self.root/'demo';shutil.copytree(self.pk,self.live)
        self.ex=self.d/'exceptions';self.ex.write_text('')
        self.channel=self.d/'channel';self.state=self.d/'state'
        self.bin=self.d/'bin';self.bin.mkdir()
        alert=self.bin/'alert';alert.write_text('#!/usr/bin/python3\nimport os,sys,json\nwith open(os.environ["PROBE_CHANNEL"],"a") as f:f.write(json.dumps(sys.argv[1])+"\\n")\n');alert.chmod(0o755)
        self.env={k:v for k,v in os.environ.items() if not k.startswith(('VYPUSK_','MONTAZH_','MO_'))}
        self.env.update(VYPUSK_REPO=str(self.repo),VYPUSK_KORNI=str(self.root),VYPUSK_AGENT_KORNI='',
            VYPUSK_INFO_KORNI='',VYPUSK_SOOTVETSTVIYA='',VYPUSK_SSYLKI='',VYPUSK_RASKLADKA='',VYPUSK_REESTR='',
            VYPUSK_ISKLYUCHENIYA=str(self.ex),VYPUSK_ALERT=str(alert),VYPUSK_SOSTOYANIE=str(self.state),
            VYPUSK_TIHO='0',PROBE_CHANNEL=str(self.channel),PATH=str(self.bin)+':'+os.environ['PATH'])

    def git(self,*args):
        return subprocess.run(['git','-C',str(self.repo),*args],capture_output=True,text=True,check=True)

    def invoke(self,drop=(),**over):
        self.channel.unlink(missing_ok=True);env=self.env|over
        for key in drop:env.pop(key,None)
        return subprocess.run(['bash',str(WATCH)],env=env,capture_output=True,text=True,timeout=15)

    def alerts(self):
        return [json.loads(line) for line in self.channel.read_text().splitlines()] if self.channel.exists() else []

    def mismatch(self):
        (self.live/'index.js').write_text('changed\n')

    def test_01_packaged_default_exceptions_allows_healthy_start(self):
        q=self.invoke(drop=['VYPUSK_ISKLYUCHENIYA'])
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(self.alerts())

    def test_06_git_tag_error_reason_reaches_blindness(self):
        helper=self.bin/'git';helper.write_text('#!/bin/sh\ncase " $* " in *" tag --list "*) echo GIT_TAG_CAUSE_CANARY >&2; exit 7;; esac\nexec /usr/bin/git "$@"\n');helper.chmod(0o755)
        q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('GIT_TAG_CAUSE_CANARY',q.stdout+q.stderr)
        self.assertIn('GIT_TAG_CAUSE_CANARY','\n'.join(self.alerts()))

    def test_06_git_archive_error_reason_reaches_blindness(self):
        helper=self.bin/'git';helper.write_text('#!/bin/sh\ncase " $* " in *" archive "*) echo GIT_ARCHIVE_CAUSE_CANARY >&2; exit 7;; esac\nexec /usr/bin/git "$@"\n');helper.chmod(0o755)
        q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('GIT_ARCHIVE_CAUSE_CANARY',q.stdout+q.stderr)
        self.assertIn('GIT_ARCHIVE_CAUSE_CANARY','\n'.join(self.alerts()))

    def test_04_yaml_absence_is_stand_blindness(self):
        missing=self.d/'missing-yaml';missing.mkdir();(missing/'yaml.py').write_text('raise ImportError("SYNTHETIC_MISSING_YAML")\n')
        for stand in ['stend-derevo.py','stend-prezhnih-imen.py']:
            with self.subTest(stand=stand):
                q=subprocess.run(['/usr/bin/python3','-B',str(PKG/'test'/stand)],env=self.env|{'PYTHONPATH':str(missing)},capture_output=True,text=True,timeout=10)
                self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('yaml',q.stdout+q.stderr)
                self.assertNotIn('Traceback',q.stderr)

    def test_08_expected_link_target_is_canonicalized(self):
        target=self.d/'target';target.mkdir();link=self.d/'link';link.symlink_to('target')
        for spelling in [str(target)+'/',os.path.relpath(target,link.parent)]:
            with self.subTest(spelling=spelling):
                q=self.invoke(VYPUSK_SSYLKI=str(link)+'='+spelling)
                self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_14_future_timestamp_does_not_suppress_new_alert(self):
        self.mismatch();q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        key=self.state.read_text().split()[0];self.state.write_text(key+' '+str(int(time.time())+1000000)+'\n')
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        self.assertNotIn('прошло -',q.stdout)

    def test_15_malformed_timestamp_is_not_shell_arithmetic(self):
        self.mismatch();self.invoke();key=self.state.read_text().split()[0];self.state.write_text(key+' 1.5\n')
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        self.assertNotIn('arithmetic',q.stderr);self.assertNotIn('syntax error',q.stderr)

    def test_16_changed_spaced_filename_is_reported_whole(self):
        (self.live/'my file.txt').write_text('changed\n')
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        lines=[line for line in q.stdout.splitlines() if 'иные суммы:' in line]
        self.assertTrue(lines,q.stdout);self.assertIn('./my file.txt',lines[0])

    def test_17_unreadable_live_file_is_blind_not_a_checksum_difference(self):
        # Root/passwordless sudo must not cure the injected read failure.
        # The OS chmod000 case is separately exercised in the cap-drop harness.
        sudo=self.bin/'sudo';sudo.write_text('#!/bin/sh\nexit 1\n');sudo.chmod(0o755)
        sha=self.bin/'sha256sum'
        sha.write_text('#!/bin/sh\nif [ "$1" = ./index.js ] && [ "$PWD" = "$PROBE_UNREADABLE_DIR" ]; then echo SHA_READ_REFUSAL >&2; echo SHA_READ_REFUSAL >> "$PROBE_REFUSAL_LOG"; exit 1; fi\nexec /usr/bin/sha256sum "$@"\n');sha.chmod(0o755)
        q=self.invoke(PROBE_UNREADABLE_DIR=str(self.live),PROBE_REFUSAL_LOG=str(self.d/'refusals'));self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertEqual((self.d/'refusals').read_text().splitlines(),['SHA_READ_REFUSAL'])
        self.assertNotIn('иные суммы:',q.stdout)

    def test_18_duplicate_mapping_key_is_refused(self):
        second=self.d/'copy2';shutil.copytree(self.pk,second)
        q=self.invoke(VYPUSK_SOOTVETSTVIYA='demo='+str(self.live)+'\ndemo='+str(second))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('demo',q.stdout)

    def test_18_duplicate_unmatched_mapping_key_is_early_blindness(self):
        # An unmatched key cannot be rescued by the later per-package alias check.
        key='unmatched-probe';mapping=key+'='+str(self.live)
        q=self.invoke(VYPUSK_SOOTVETSTVIYA=mapping)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(self.alerts())
        second=self.d/'copy2';shutil.copytree(self.pk,second)
        q=self.invoke(VYPUSK_SOOTVETSTVIYA=mapping+'\n'+key+'='+str(second))
        reason='VYPUSK_SOOTVETSTVIYA: повтор ключа '+key
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn(reason,q.stdout+q.stderr)
        alerts=self.alerts();self.assertEqual(len(alerts),1);self.assertIn(reason,alerts[0])
        q=self.invoke(VYPUSK_SOOTVETSTVIYA=mapping)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(self.alerts())

    def test_19_nested_node_modules_are_outside_checksum_scope(self):
        nested=self.live/'lib/node_modules/vendor';nested.mkdir(parents=True);(nested/'private.js').write_text('irrelevant\n')
        q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(self.alerts())

    def test_20_plugins_regular_file_is_not_an_agent_root(self):
        homes=self.d/'homes';(homes/'agent').mkdir(parents=True);(homes/'agent/plugins').write_text('not a directory\n')
        q=self.invoke(drop=['VYPUSK_AGENT_KORNI'],VYPUSK_AGENT_POISK=str(homes))
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_26_package_name_cannot_escape_the_copy_root(self):
        manifest=json.loads((self.pk/'package.json').read_text());manifest['name']='../unrelated';(self.pk/'package.json').write_text(json.dumps(manifest)+'\n')
        unrelated=self.d/'unrelated';shutil.copytree(self.pk,unrelated)
        q=self.invoke();self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertIn('имя',q.stdout)

    def test_17_readable_filename_is_not_a_blindness_marker(self):
        p=self.pk/'NECHITAEM file.txt';p.write_text('healthy name\n')
        shutil.copyfile(p,self.live/p.name)
        self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','name fixture')
        self.git('tag','-f','demo-v1.0.0')
        q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_18_empty_mapping_key_is_blindness_without_shell_error(self):
        q=self.invoke(VYPUSK_SOOTVETSTVIYA='='+str(self.live))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('bad array subscript',q.stderr)

    def test_montazh_stand_missing_helper_is_blindness(self):
        q=subprocess.run(['/usr/bin/python3','-B',str(PKG/'test/stend-montazh-okno.py')],env=self.env|{'MONTAZH_OKNO_BIN':str(self.d/'missing-helper')},capture_output=True,text=True,timeout=15)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout+q.stderr)
        self.assertNotIn('Traceback',q.stderr)

    def test_18_alias_mapping_cannot_hide_first_copy(self):
        manifest=json.loads((self.pk/'package.json').read_text());manifest['dsh']={'prezhnie_imena':['old-demo']};(self.pk/'package.json').write_text(json.dumps(manifest)+'\n')
        second=self.d/'copy2';shutil.copytree(self.live,second);self.mismatch()
        q=self.invoke(VYPUSK_SOOTVETSTVIYA='demo='+str(self.live)+'\nold-demo='+str(second))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('соответств',q.stdout)

    def test_15_decimal_timestamp_with_leading_zero_is_not_octal(self):
        self.mismatch();self.invoke();key=self.state.read_text().split()[0];self.state.write_text(key+' 08\n')
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        self.assertNotIn('base',q.stderr);self.assertNotIn('syntax error',q.stderr)

    def test_15_overflowing_timestamp_does_not_wrap_and_suppress(self):
        self.mismatch();self.invoke();key=self.state.read_text().split()[0];self.state.write_text(key+' '+str(2**64+int(time.time()))+'\n')
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        self.assertNotIn('syntax error',q.stderr)

    def test_correct_mismatch_repeat_and_recovery(self):
        q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(self.alerts())
        self.mismatch();q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(len(self.alerts()),1)
        q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertFalse(self.alerts())
        shutil.copyfile(self.pk/'index.js',self.live/'index.js');q=self.invoke();self.assertEqual(q.returncode,0,q.stdout+q.stderr)


if __name__=='__main__':
    if not WATCH.is_file() or not os.access(WATCH,os.R_OK):print('СЛЕПОТА: предмет не читается: '+str(WATCH));sys.exit(2)
    run=unittest.main(verbosity=2,exit=False)
    sys.exit(1 if not run.result.wasSuccessful() else 2 if run.result.skipped else 0)
