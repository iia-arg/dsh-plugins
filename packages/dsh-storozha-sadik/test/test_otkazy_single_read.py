#!/usr/bin/env python3
"""Same journal bytes through the original and current production consumers."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
WATCH = PKG / 'sbin/sadik-watch'
BEFORE = PKG / 'test/fixtures/sadik-watch-otkazy-before.txt'


def consumer_block(source):
    start = source.index('    # B-N-2063 SINGLE-READ') if '    # B-N-2063 SINGLE-READ' in source else source.index('    vsego=$($S journalctl')
    return source[start:source.index("  done\n' 2>/dev/null)", start)]


def render(block, window='3h'):
    # Let the real shell interpret the original quote boundaries of snyat's argument.
    r = subprocess.run(['/bin/bash', '-c', 'OKNO_OTKAZA="$1"\nprintf "%s" \'' + block + "'", 'render', window],
                       text=True, capture_output=True, check=True)
    return 'S=\nu=$TEST_UNIT\n' + r.stdout


class OtkazySingleRead(unittest.TestCase):
    def compare(self, journal, code=0, unit='claude-oauth-gateway@test.service', window='3h'):
        with tempfile.TemporaryDirectory(prefix='otkazy-one-read-') as td:
            t = Path(td)
            (t/'journal').write_bytes(journal)
            shim = t/'journalctl'
            shim.write_text('''#!/bin/bash
printf '%s\n' "$*" >> "$TEST_QUERIES"
cat "$TEST_JOURNAL"
exit "$TEST_READ_CODE"
''')
            shim.chmod(0o755)
            env = dict(os.environ, PATH=str(t)+':/usr/bin:/bin', LC_ALL='C.UTF-8',
                       TEST_UNIT=unit, TEST_JOURNAL=str(t/'journal'), TEST_READ_CODE=str(code),
                       TEST_QUERIES=str(t/'queries'))
            results = []
            for block in [BEFORE.read_text(), consumer_block(WATCH.read_text())]:
                (t/'queries').write_text('')
                r = subprocess.run(['/bin/bash', '-c', render(block, window)], env=env,
                                   capture_output=True, timeout=4)
                results.append((r, (t/'queries').read_text().splitlines()))
            before, after = results
            self.assertEqual((after[0].returncode, after[0].stdout, after[0].stderr),
                             (before[0].returncode, before[0].stdout, before[0].stderr))
            expected_reads = 3 if 'gateway' in unit else 2
            self.assertEqual(len(before[1]), expected_reads)
            self.assertEqual(len(after[1]), 1, 'one journal read per UNIT required: ' + repr(after[1]))
            self.assertIn('--since -' + window, after[1][0])
            self.assertIn('-u ' + unit, after[1][0])
            self.assertIn('-o short-unix', after[1][0])
            return after[0].stdout

    def test_gateway_outcomes(self):
        cases = [
            ('empty', b'', 0),
            ('no-entries', b'-- No entries --\n', 0),
            ('denied', b'', 1),
            ('partial-error', b'1000.5 node[1]: plain message\n', 1),
            ('blank-line', b'\n', 0),
            ('healthy', '1000.1 node[1]: привет 😀\n'.encode(), 0),
            ('prompt', b'1000.1 node[1]: Prompt is too long\n1001.9 node[1]: PROMPT IS TOO LONG\n', 0),
            ('limit', ('1000.1 node[1]: [subscription-gateway x] мост подключён\n'
                       '1003.6 node[1]: [subscription-gateway x] 🔴 сбой вызова: hit your usage limit|; resets 5 😀\n').encode(), 0),
            ('spoof', '1000.1 sudo[1]: node bad [subscription-gateway x] 🔴 сбой вызова: usage limit\n'.encode(), 0),
            ('multiple', ('1000.1 node[1]: [subscription-gateway x] подсказка: start\n'
                          '1001.2 node[1]: [subscription-gateway x] 🔴 сбой вызова: usage limit\n'
                          '1002.4 node[2]: [dsh-subscription-gateway x] мост подключён\n'
                          '1004.6 node[2]: [dsh-subscription-gateway x] 🔴 сбой вызова: rate limit\n').encode(), 0),
        ]
        for name, journal, code in cases:
            with self.subTest(name=name):
                out = self.compare(journal, code)
                if name in ['empty', 'no-entries', 'denied']:
                    self.assertIn(b'OTKAZDLINA|claude-oauth-gateway@test.service|SLEPOTA\n', out)
                if name == 'prompt':
                    self.assertIn(b'OTKAZDLINA|claude-oauth-gateway@test.service|1001\n', out)
                if name == 'multiple':
                    self.assertIn(b'OTKAZLIMIT|claude-oauth-gateway@test.service|1004.6;1002.4;rate limit\n', out)

    def test_agent_outcomes(self):
        for data in [b'', b'-- No entries --\n', b'1001.9 node[1]: Prompt is too long\n']:
            with self.subTest(data=data):
                out = self.compare(data, unit='agent-test.service')
                self.assertNotIn(b'OTKAZLIMIT', out)

    def test_configurable_window(self):
        self.compare(b'1001.9 node[1]: Prompt is too long\n', window='17min')


if __name__ == '__main__':
    unittest.main(verbosity=2)
