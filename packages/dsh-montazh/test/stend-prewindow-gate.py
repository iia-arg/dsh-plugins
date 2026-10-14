#!/usr/bin/env python3
"""Real gate, private package/copy/registry, wrapper spy and byte corruption."""
from pathlib import Path
import hashlib, json, os, shlex, shutil, subprocess, tempfile, unittest

GATE = Path(os.environ.get('PREWINDOW_GATE', Path(__file__).resolve().parents[1] / 'bin/vypusk-tegom'))

class Prewindow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='prewindow-gate-')
        self.root = Path(self.tmp.name); self.pkg = self.root / 'dsh-fixture'; self.pkg.mkdir()
        (self.pkg / 'src').mkdir(); (self.pkg / 'src/x.js').write_text('export const x = 1;\n')
        (self.pkg / 'test').mkdir(); (self.pkg / 'test/stend-fixture.mjs').write_text('process.exit(0);\n')
        (self.pkg / 'package.json').write_text(json.dumps(dict(name='dsh-fixture',version='0.0.1',files=['src'])))
        (self.pkg / 'CHANGELOG.md').write_text('## 0.0.1 — fixture\n')
        self.copy = self.root / 'copy'; shutil.copytree(self.pkg, self.copy)
        self.registry = self.root / 'registry.json'
        self.registry.write_text(json.dumps(dict(plugins=[dict(id='dsh-fixture',path=str(self.copy))],services=[])))
        self.agents = self.root / 'agents.json'; self.agents.write_text('{"agenty":[]}')
        self.marker = self.root / 'wrapper-called'
        self.spy = self.root / 'wrapper'
        self.spy.write_text('#!/bin/sh\necho called >> '+shlex.quote(str(self.marker))+'\necho "🔴 СТОРОЖ ПРИБОРА fixture"\nexit 1\n'); self.spy.chmod(0o755)
        self.journal = self.root / 'journal'; self.journal.mkdir()
        self.writer = self.root / 'writer'; self.writer.write_text('#!/bin/sh\necho "СЛЕД fixture (подставной)"\n'); self.writer.chmod(0o755)
        self.env = {**os.environ,'VYPUSK_REESTR':str(self.registry),'VYPUSK_AGENTY':str(self.agents),
                    'VYPUSK_ZHURNAL_DIR':str(self.journal),'VYPUSK_ZHURNAL_ZAPIS':str(self.writer),'OBYORTKA_KRASNEET':str(self.spy)}
        self.env['OBHODCHIK'] = str(self.root / 'no-fleet-runner')
        self.env['OBHODCHIK_SLUZHBA'] = 'prewindow-fixture-no-unit.service'
        self.env.pop('VYPUSK_KOPII',None); self.env.pop('STENDY_INACHE',None)

    def tearDown(self):
        self.tmp.cleanup()

    def invoke(self, skip=True):
        env = dict(self.env)
        if skip: env['STENDY_INACHE'] = 'pre-window fixture proof, same contents'
        return subprocess.run(['bash',str(GATE),str(self.pkg)],env=env,capture_output=True,text=True,timeout=15)

    def test_skip_does_not_invoke_wrapper_and_preserves_copy_equality(self):
        q = self.invoke(); self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertFalse(self.marker.exists(),q.stdout+q.stderr)
        self.assertIn('обёртки',q.stdout); self.assertIn('НЕ',q.stdout)
        self.assertIn('КОПИЯ ВЫПУСКА СВЕРЕНА',q.stdout)

    def test_default_still_invokes_wrapper_and_refuses_its_failure(self):
        q = self.invoke(False); self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertTrue(self.marker.exists()); self.assertIn('сорван',q.stdout+q.stderr)

    def test_empty_skip_is_the_default_wrapper_path(self):
        self.env['STENDY_INACHE'] = ''
        q = self.invoke(False); self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertTrue(self.marker.exists())

    def test_skip_cannot_hide_corrupt_installed_bytes_then_restores(self):
        target = self.copy / 'src/x.js'; original = target.read_bytes()
        target.write_text('export const x = 2; // CORRUPTED\n')
        print('copy corruption replacements1 SHA',hashlib.sha256(original).hexdigest(),'→',hashlib.sha256(target.read_bytes()).hexdigest())
        self.assertEqual(subprocess.check_output(['grep','-cF','CORRUPTED',str(target)],text=True).strip(),'1')
        q = self.invoke(); self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertFalse(self.marker.exists()); self.assertIn(str(self.copy),q.stdout+q.stderr)
        target.write_bytes(original); q = self.invoke(); self.assertEqual(q.returncode,0,q.stdout+q.stderr)

    def test_real_wrapper_probe_classifies_temporary_fixture_and_cleans_it(self):
        self.env['OBYORTKA_KRASNEET'] = '/usr/local/bin/obyortka-krasneet'
        q = self.invoke(False)
        self.assertIn('ОБЁРТКИ СТЕНДОВ:',q.stdout+q.stderr)
        self.assertFalse(list(self.pkg.rglob('.obyortka-*')),q.stdout+q.stderr)
        self.assertIn('НЕ ПРИМЕНИМО', q.stdout + q.stderr)
        self.assertIn('всего файлов 1', q.stdout + q.stderr)
        self.assertNotIn('ГЛУХОЙ:', q.stdout + q.stderr)
        # This probe judges the real wrapper stage only, not later fleet gates.

if __name__ == '__main__': unittest.main(verbosity=2)
