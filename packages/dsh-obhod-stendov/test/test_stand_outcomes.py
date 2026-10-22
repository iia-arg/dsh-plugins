"""B-N-2108: real walker and timer reader, private stands and alert sink.

No live stands or owner notifications. The walker uses its own transient scopes.
Run python3 -B test/test_stand_outcomes.py (sudo -n for those scopes required).
"""
import hashlib
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]


class StandOutcomes(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bn2108-', dir='/var/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pkg = self.root / 'pkg'
        (self.pkg / 'test').mkdir(parents=True)
        (self.pkg / 'package.json').write_text('{"name":"pkg","version":"1.0.0"}\n')
        self.stand = self.pkg / 'test/stend-result.sh'
        self.inventory = self.root / 'inventory'
        self.inventory.write_text(str(self.stand) + '\n')
        self.exceptions = self.root / 'exceptions.yaml'
        self.exceptions.write_text('exceptions: []\n')
        self.alerts = self.root / 'alerts'
        alert = self.root / 'alert'
        alert.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\n'
                         f'with Path({str(self.alerts)!r}).open("a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
        alert.chmod(0o755)
        self.walker = Path(os.environ.get('OUTCOMES_WALKER', PKG / 'dorabotki/vse-stendy-boevye.sh'))
        self.wrapper = Path(os.environ.get('OUTCOMES_WRAPPER', PKG / 'dorabotki/vse-stendy-po-tajmeru.sh'))
        self.env = {**os.environ, 'OBHODCHIK': str(self.walker), 'VSE_STENDY_ALERT': str(alert),
                    'OBLAST_STENDOV': str(self.pkg), 'PERECHEN_STENDOV': str(self.inventory),
                    'ISKLYUCHENIYA_STENDOV': str(self.exceptions), 'SREDA_STENDOV': '',
                    'TMPDIR': str(self.root), 'VSE_STENDY_PREDEL': '20', 'PYTHONDONTWRITEBYTECODE': '1'}
        self.env.pop('PAKET_IMYA', None)

    def result(self, code):
        text = {0: 'OK fixture', 1: 'FAIL fixture fault', 2: 'СЛЕПОТА: fixture input absent',
                124: 'fixture deadline'}[code]
        self.stand.write_text('#!/bin/bash\nprintf "%s\\n" ' + repr(text) + '\nexit ' + str(code) + '\n')

    def run_caller(self, wrapper=False):
        r = subprocess.run(['bash', str(self.wrapper if wrapper else self.walker)],
                           env=self.env, capture_output=True, text=True, timeout=35)
        self.assertIn('ПОКРЫТИЕ: прошло 1 из 1', r.stdout, r.stdout + r.stderr)
        self.assertIn('С2: стендов в своих юнитах 1', r.stdout, r.stdout + r.stderr)
        self.assertNotIn('СЛЕПОТА С2', r.stdout, r.stdout + r.stderr)
        return r

    def test_walker_codes_zero_one_two_124(self):
        for code in [0, 1, 2, 124]:
            with self.subTest(code=code):
                self.result(code)
                r = self.run_caller()
                print('CASE', code, 'aggregate', r.returncode, '\n' + r.stdout, flush=True)
                self.assertEqual(r.returncode, 0 if code == 0 else 1)
                if code == 0:
                    self.assertNotIn('НЕОЖИДАННО:', r.stdout)
                elif code == 2:
                    self.assertIn('⚠️ НЕОЖИДАННО: pkg/stend-result.sh (выпуск 1.0.0, код 2) — СЛЕПОТА:', r.stdout)
                    self.assertNotIn('🔴 НЕОЖИДАННО: pkg/stend-result.sh', r.stdout)
                    self.assertRegex(r.stdout, r'расхождений 0\s+слепот 1')
                else:
                    self.assertIn('🔴 НЕОЖИДАННО: pkg/stend-result.sh', r.stdout)
                    if code == 124:
                        self.assertIn('— ПРЕДЕЛ:', r.stdout)

    def test_return_after_blind_stand_is_green(self):
        self.result(0)
        before = self.stand.read_bytes()
        self.assertEqual(self.run_caller().returncode, 0)
        self.result(2)
        after = self.stand.read_bytes()
        self.assertNotEqual(hashlib.sha256(before).hexdigest(), hashlib.sha256(after).hexdigest())
        self.assertEqual(after.count(b'exit 2\n'), 1)
        print('DAMAGE', str(self.stand), 'literal exit 2 count=1',
              hashlib.sha256(before).hexdigest(), '->', hashlib.sha256(after).hexdigest(), flush=True)
        red = self.run_caller()
        self.assertEqual(red.returncode, 1)
        self.assertIn('— СЛЕПОТА:', red.stdout)
        self.stand.write_bytes(before)
        self.assertEqual(self.run_caller().returncode, 0)

    def test_timer_keeps_blind_name_without_false_format_alarm(self):
        self.result(2)
        r = self.run_caller(wrapper=True)
        print('TIMER BLIND\n' + r.stdout, flush=True)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn('РАЗБОР ИМЁН РАЗОШЁЛСЯ', r.stdout)
        self.assertIn('⚠️ ИТОГ ТАЙМЕРА:', r.stdout)
        body = '\n'.join(' '.join(json.loads(x)) for x in self.alerts.read_text().splitlines())
        self.assertIn('pkg/stend-result.sh', body)
        self.assertIn('слепот 1', body)
        self.assertNotIn('имена не разобраны', body)

    def test_timer_red_stays_red(self):
        self.result(1)
        r = self.run_caller(wrapper=True)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn('🔴 ИТОГ ТАЙМЕРА:', r.stdout)
        self.assertIn('тревога отправлена', r.stdout)

    def test_blind_exception_keeps_existing_fail_closed_contract(self):
        self.result(2)
        expiry = (datetime.now(timezone.utc) + timedelta(days=3)).strftime('%Y-%m-%dT%H:%M:%SZ')
        self.exceptions.write_text(f'''exceptions:
  - stend: pkg/stend-result.sh
    vypusk: 1.0.0
    kod: 2
    priznak: 'СЛЕПОТА: fixture input absent'
    prichina: 'замер 2026-10-17 чем: private outcome fixture'
    otvetstvennyj: Забава
    peresmotr: '{expiry}'
''')
        r = self.run_caller()
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertIn('ОЖИДАЕМО: pkg/stend-result.sh', r.stdout)
        self.assertNotIn('НЕОЖИДАННО:', r.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
