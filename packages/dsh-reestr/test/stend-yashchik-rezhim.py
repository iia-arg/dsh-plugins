#!/usr/bin/env python3
"""Real sverit_kanal + private directories; no live paths or service changes.
Run: python3 -B test/stend-yashchik-rezhim.py [candidate/bin/agent-registry].
Unknown/changed mailbox mode must fail; no-field legacy mode stays 1730.
"""
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import pwd
import stat
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SOURCE = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'bin/agent-registry'
loader = importlib.machinery.SourceFileLoader('registry_mailbox_mode', str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
R = importlib.util.module_from_spec(spec)
loader.exec_module(R)
NAMES = ['vintik', 'shpuntik', 'gayka', 'shurup', 'sova', 'tumbler']

class MailboxMode(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='registry-mailbox-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.user = pwd.getpwuid(os.geteuid()).pw_name

    def mailbox(self, name, mode):
        p = self.root / name
        p.mkdir()
        p.chmod(mode)
        return str(p)

    def check_mailbox(self, n):
        rows = []
        result = R.sverit_kanal(n, 'fixture', lambda *args: rows.append(args))
        box = [row for row in rows if row[0] == 'ящик']
        self.assertEqual(len(box), 1, rows)
        return result, box[0]

    def test_closed_six_and_legacy_default(self):
        for name in NAMES:
            with self.subTest(name=name):
                path = self.mailbox(name, 0o700)
                result, row = self.check_mailbox({'polzovatel': self.user, 'kanal': {'yashchik': path, 'yashchik_rezhim': '0700'}})
                self.assertEqual(result, (0, 0), row)
                self.assertEqual(row[1], R.OK, row)
                self.assertEqual(row[3], '700 ' + self.user, row)
        path = self.mailbox('legacy', 0o1730)
        result, row = self.check_mailbox({'polzovatel': self.user, 'kanal': {'yashchik': path}})
        self.assertEqual(result, (0, 0), row)
        self.assertEqual(row[3], '1730 ' + self.user, row)

    def test_healthy_corrupt_unknown_restore(self):
        path = self.mailbox('cycle', 0o700)
        registry = self.root / 'agents.yaml'
        previous = R.REESTR
        self.addCleanup(setattr, R, 'REESTR', previous)
        R.REESTR = str(registry)
        phases = []
        for name, declared, want in [('healthy', '0700', R.OK), ('corrupt', '0777', R.RASH), ('restored', '0700', R.OK)]:
            registry.write_text("agenty:\n  - imya: fixture\n    namerenie:\n      polzovatel: " + self.user + "\n      kanal:\n        yashchik: " + path + "\n        yashchik_rezhim: '" + declared + "'\n")
            data = registry.read_bytes()
            sha = hashlib.sha256(data).hexdigest()
            # Fixed byte pattern is independent of YAML decoding.
            hits = data.count(("yashchik_rezhim: '" + declared + "'").encode())
            self.assertEqual(hits, 1)
            n = R.zagruzit()['agenty'][0]['namerenie']
            self.assertIsInstance(n['kanal']['yashchik_rezhim'], str)
            result, row = self.check_mailbox(n)
            print(json.dumps({'phase': name, 'path': path, 'sha256': sha, 'fixed_hits': hits, 'actual_mode': oct(stat.S_IMODE(os.stat(path).st_mode)), 'result': result, 'diagnostic': row}, ensure_ascii=False), flush=True)
            phases.append((sha, row[1]))
            self.assertEqual(row[1], want, row)
            self.assertEqual(result, (1, 0) if want == R.RASH else (0, 0), row)
            if want == R.RASH:
                self.assertIn('yashchik_rezhim неизвестен', ' '.join(row))
        self.assertEqual(phases[0][0], phases[2][0])
        self.assertNotEqual(phases[0][0], phases[1][0])

    def test_wrong_mode_chmod_and_restore(self):
        path = self.mailbox('mode-cycle', 0o700)
        n = {'polzovatel': self.user, 'kanal': {'yashchik': path, 'yashchik_rezhim': '0700'}}
        for mode, expected in [(0o700, R.OK), (0o1730, R.RASH), (0o700, R.OK)]:
            os.chmod(path, mode)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), mode)
            result, row = self.check_mailbox(n)
            print('chmod fixture:', path, oct(mode), row, flush=True)
            self.assertEqual(row[1], expected, row)

    def test_wrong_owner_stays_mismatch(self):
        path = self.mailbox('wrong-owner', 0o700)
        result, row = self.check_mailbox({'polzovatel': self.user + '-not-the-owner', 'kanal': {'yashchik': path, 'yashchik_rezhim': '0700'}})
        self.assertEqual(result, (1, 0), row)
        self.assertEqual(row[1], R.RASH, row)

    def test_unknown_values_are_mismatches(self):
        path = self.mailbox('unknowns', 0o700)
        for mode in ['700', '', None, 448, '0777', True, {}]:
            with self.subTest(mode=mode):
                result, row = self.check_mailbox({'polzovatel': self.user, 'kanal': {'yashchik': path, 'yashchik_rezhim': mode}})
                self.assertEqual(result, (1, 0), row)
                self.assertIn('yashchik_rezhim неизвестен', ' '.join(row))

if __name__ == '__main__':
    unittest.main(verbosity=2)
