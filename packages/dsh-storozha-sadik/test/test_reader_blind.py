"""B-N-2108: actual reader, recorded timer output, private history and courier.

No journal/service/live courier calls. Run python3 -B test/test_reader_blind.py.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
READER = Path(os.environ.get('CHO_TEST_READER', PKG / 'sbin/chitatel-obhoda'))


class ReaderBlind(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bn2108-reader-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.nights = self.root / 'nights'
        self.nights.mkdir()
        self.state = self.root / 'state'
        self.mail = self.root / 'mail'
        self.mail.mkdir()
        self.tell = self.root / 'tell'
        self.tell.write_text('#!/usr/bin/python3\nimport shutil,sys\nfrom pathlib import Path\n'
                            f'p=Path({str(self.mail)!r});dst=p/(str(len(list(p.iterdir())))+".md")\n'
                            'shutil.copyfile(sys.argv[1],dst);print("положено: "+str(dst))\n')
        self.tell.chmod(0o755)

    def night(self, day, *, red=(), blind=()):
        lines = [f'🔴 НЕОЖИДАННО: {k} (выпуск -, код 1) — FAIL old fault' for k in red]
        lines += [f'⚠️ НЕОЖИДАННО: {k} (выпуск -, код 2) — СЛЕПОТА: source not available' for k in blind]
        lines += [f'ИТОГ ТАЙМЕРА: обходчик код {1 if red or blind else 0} · стендов {len(red)+len(blind)+1} · '
                  f'расхождений {len(red)} · слепот {len(blind)} (ожидаемых 0, неожиданных {len(red)+len(blind)})']
        path = self.nights / (day + '.txt')
        path.write_text('\n'.join(lines) + '\n')
        return path

    def run_reader(self):
        env = {**os.environ, 'CHO_ISTOCHNIK': str(self.nights), 'CHO_SOST': str(self.state),
               'CHO_TELL_BIN': str(self.tell), 'CHO_KOREN': '/nonexistent-fixture',
               'CHO_ADRESAT': 'zabavy', 'CHO_SHAPKA': 'PRIVATE READER FIXTURE',
               'CHO_JOURNALCTL': '/bin/false', 'CHO_SYSTEMCTL': '/bin/false'}
        r = subprocess.run([sys.executable, '-I', str(READER)], env=env, capture_output=True,
                           text=True, timeout=8)
        print('READER', r.returncode, r.stdout.strip(), flush=True)
        return r

    def letter(self):
        return max(self.mail.iterdir(), key=lambda p: int(p.stem)).read_text()

    def test_recorded_timer_blind_is_a_separate_named_outcome(self):
        raw = (PKG / 'test/fixtures/obhod-blind-3199.txt').read_bytes()
        (self.nights / '2026-10-01.txt').write_bytes(raw)
        r = self.run_reader()
        body = self.letter()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr + body)
        self.assertIn('СЛЕПОТА — 1', body)
        self.assertIn('pkg/stend-result.sh', body)
        self.assertNotIn('НЕОЖИДАННО —', body)
        self.assertNotIn('РАЗБОР РАЗОШЁЛСЯ', body)
        self.assertNotIn('СНЯТО —', body)

    def test_red_to_blind_keeps_history_and_does_not_claim_cleared(self):
        key = 'pkg/stend-same.sh'
        self.night('2026-10-01', red=[key])
        self.assertEqual(self.run_reader().returncode, 0)
        before = self.letter()
        self.night('2026-10-02', blind=[key])
        r = self.run_reader(); body = self.letter()
        self.assertEqual(r.returncode, 0, body)
        self.assertIn('СЛЕПОТА — 1', body)
        self.assertIn('2-я ночь подряд (с 2026-10-01)', body)
        self.assertNotIn('СНЯТО —', body)
        self.assertNotIn('РАЗБОР РАЗОШЁЛСЯ', body)
        self.assertIn('НЕОЖИДАННО — 1', before)

    def test_blind_to_red_keeps_history(self):
        key = 'pkg/stend-same.sh'
        self.night('2026-10-01', blind=[key]); self.assertEqual(self.run_reader().returncode, 0)
        self.night('2026-10-02', red=[key]); self.assertEqual(self.run_reader().returncode, 0)
        body = self.letter()
        self.assertIn('НЕОЖИДАННО — 1', body)
        self.assertIn('2-я ночь подряд', body)
        self.assertNotIn('СНЯТО —', body)

    def test_green_blind_green_then_silent(self):
        key = 'pkg/stend-result.sh'
        self.night('2026-10-01'); self.assertEqual(self.run_reader().returncode, 0)
        self.assertEqual(list(self.mail.iterdir()), [])
        path = self.night('2026-10-02', blind=[key]); raw = path.read_bytes()
        self.assertEqual(raw.count('⚠️ НЕОЖИДАННО:'.encode()), 1)
        print('DAMAGE', path, 'warning_count=1', hashlib.sha256(raw).hexdigest(), flush=True)
        self.assertEqual(self.run_reader().returncode, 0)
        self.assertIn('СЛЕПОТА — 1', self.letter())
        self.night('2026-10-03'); self.assertEqual(self.run_reader().returncode, 0)
        self.assertIn('СНЯТО — 1', self.letter())
        self.assertIn(key, self.letter())
        count = len(list(self.mail.iterdir()))
        self.night('2026-10-04'); self.assertEqual(self.run_reader().returncode, 0)
        self.assertEqual(len(list(self.mail.iterdir())), count)

    def test_mixed_red_and_blind_are_both_named(self):
        self.night('2026-10-01', red=['pkg/stend-red.sh'], blind=['pkg/stend-blind.sh'])
        r = self.run_reader(); body = self.letter()
        self.assertEqual(r.returncode, 0, body)
        self.assertIn('НЕОЖИДАННО — 1', body)
        self.assertIn('СЛЕПОТА — 1', body)
        self.assertIn('pkg/stend-red.sh', body)
        self.assertIn('pkg/stend-blind.sh', body)
        self.assertNotIn('РАЗБОР РАЗОШЁЛСЯ', body)

    def test_many_blind_stands_keep_existing_letter_bound(self):
        keys = [f'pkg/stend-long-blind-{i:02d}-' + 'x'*70 + '.sh' for i in range(40)]
        self.night('2026-10-01', blind=keys)
        self.assertEqual(self.run_reader().returncode, 0)
        self.assertLessEqual(len(self.letter()), 5000)
        body = (self.state / 'noch-2026-10-01.md').read_text()
        self.assertIn('СЛЕПОТА — 40', body)
        for key in keys:
            self.assertIn(key, body)

    def test_quoted_warning_is_not_a_judgment_line(self):
        path = self.night('2026-10-01')
        path.write_text('      stend-output.sh: ⚠️ НЕОЖИДАННО: pkg/quoted.sh (выпуск -, код 2) — СЛЕПОТА: quote\n' + path.read_text())
        r = self.run_reader()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(list(self.mail.iterdir()), [])

    def test_warning_with_wrong_code_is_not_accepted_as_blind(self):
        path = self.night('2026-10-01', blind=['pkg/stend-blind.sh'])
        raw = path.read_bytes(); path.write_bytes(raw.replace('код 2)'.encode(), 'код 1)'.encode()))
        self.assertEqual(raw.count('код 2)'.encode()), 1)
        self.assertEqual(path.read_bytes().count('код 1)'.encode()), 1)
        self.assertNotEqual(hashlib.sha256(raw).hexdigest(), hashlib.sha256(path.read_bytes()).hexdigest())
        print('DAMAGE wrong-code literal count=1', hashlib.sha256(raw).hexdigest(), '->',
              hashlib.sha256(path.read_bytes()).hexdigest(), flush=True)
        r = self.run_reader()
        self.assertEqual(r.returncode, 2)
        self.assertIn('РАЗБОР РАЗОШЁЛСЯ', self.letter())


if __name__ == '__main__':
    unittest.main(verbosity=2)
