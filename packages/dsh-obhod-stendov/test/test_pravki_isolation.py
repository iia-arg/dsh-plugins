#!/usr/bin/env python3
"""Real nine-probe stand must not execute the full machine watcher."""
import os
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[3]
STAND = REPO / 'packages/dsh-obhod-stendov/dorabotki/stendy/stend-pravki-mimo.sh'
WATCH = REPO / 'packages/dsh-storozha-sadik/sbin/sadik-watch'
LIB = REPO / 'packages/dsh-storozha-sadik/libexec/sadik-watch-pravka.sh'

class PravkiIsolation(unittest.TestCase):
    def test_nine_probes_without_full_watcher(self):
        with tempfile.TemporaryDirectory(prefix='pravki-isolation-') as td:
            t = Path(td)
            watcher = t / 'sbin/sadik-watch'
            watcher.parent.mkdir()
            (t / 'libexec').mkdir()
            watcher.write_text('#!/bin/bash\necho FULL_WATCHER_FORBIDDEN >&2; exit 91\n' + WATCH.read_text())
            watcher.chmod(0o755)
            if LIB.exists():
                shutil.copy2(LIB, t / 'libexec' / LIB.name)
            env = dict(os.environ, SADIK_WATCH_BIN=str(watcher))
            r = subprocess.run(['/bin/bash', str(STAND)], env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn('ok=9  FAIL=0  СЛЕПОТА=0', r.stdout)
            self.assertNotIn('FULL_WATCHER_FORBIDDEN', r.stdout + r.stderr)

    def test_shared_reader_ignores_large_foreign_journal(self):
        with tempfile.TemporaryDirectory(prefix='pravki-foreign-') as td:
            t = Path(td)
            registry = t / 'plugins.yaml'
            registry.write_text('# unchanged registry\n')
            sha = hashlib.sha256(registry.read_bytes()).hexdigest()
            foreign = t / 'foreign-journal'
            foreign.write_bytes(b'foreign gateway message\n' * 500000)
            journal = t / 'journalctl'
            journal.write_text('''#!/bin/bash
printf '%s\n' "$*" >> "$TEST_QUERIES"
case " $* " in *" -u "*) cat "$TEST_FOREIGN"; exit 0;; esac
printf 'pravka: установлено %s sha256 %s пункт TEST\n' "$SADIK_REESTR_PLAGINOV" "$TEST_SHA"
''')
            journal.chmod(0o755)
            watcher_source = WATCH.read_text()
            start = watcher_source.index('\nlog() {')
            end = watcher_source.index('# ── ПОДТВЕРЖДЕНИЕ', start)
            (t/'functions').write_text(watcher_source[start:end])
            (t/'state').mkdir()
            env = dict(os.environ, PATH=str(t)+':/usr/bin:/bin', TEST_QUERIES=str(t/'queries'),
                       TEST_FOREIGN=str(foreign), TEST_SHA=sha, SADIK_REESTR_PLAGINOV=str(registry))
            command = '''set -uo pipefail
ALERT=/bin/false; SOST=$1/state; BEDY=0; SEYCHAS=1000000
. "$1/functions"
. "$2"
for i in 1 2 3 4 5; do sadik_proverit_pravku; done
echo BEDY=$BEDY
'''
            r = subprocess.run(['/bin/bash', '-c', command, 'probe', str(t), str(LIB)],
                               env=env, text=True, capture_output=True, timeout=8)
            self.assertEqual(r.returncode, 0, r.stdout+r.stderr)
            self.assertIn('BEDY=0', r.stdout)
            self.assertEqual((t/'queries').read_text().splitlines(),
                             ['-t agent-plugins _UID=0 -o cat --no-pager -q'] * 5)
            print('foreign journal bytes=' + str(foreign.stat().st_size) + '; registry-only requests=5')

class WatcherIntegration(unittest.TestCase):
    """Run the real caller; replace machine IO, never the 2г implementation."""
    def test_caller_detects_and_clears_same_shared_check(self):
        with tempfile.TemporaryDirectory(prefix='pravki-caller-') as td:
            t = Path(td)
            b = t / 'bin'
            b.mkdir()
            registry = t / 'plugins.yaml'
            registry.write_text('# registry before\n')
            journal = t / 'journal'
            original_sha = hashlib.sha256(registry.read_bytes()).hexdigest()
            journal.write_text('0\tpravka: установлено ' + str(registry) + ' sha256 ' + original_sha + ' пункт TEST\n')
            def script(name, body):
                f = b / name
                f.write_text('#!/bin/bash\n' + body)
                f.chmod(0o755)
                return str(f)
            script('journalctl', '''u=""; for a in "$@"; do case "$a" in _UID=*) u="${a#_UID=}";; esac; done
awk -F'\t' -v u="$u" 'u=="" || $1==u {sub(/^[^\t]*\t/, "");print}' "$TEST_JOURNAL"
''')
            script('systemctl', 'exit 1\n')
            script('runuser', 'exit 1\n')
            script('timeout', 'echo ISOLATED_OTHER_HELPER; exit 2\n')
            alert = script('alert', 'printf "%s\\n" "$1" >> "$TEST_ALERTS"\n')
            owner = script('owner', 'echo owner-called >> "$TEST_OWNER"\n')
            hook = t / 'hook'
            hook.write_text("""trap 'case "$BASH_COMMAND" in
SREZ=*) snyat() { printf "PROBE_SNAPSHOT|ok\\nENABLED_SCOPE|1\\nENABLED_UNIT|probe.service|active|enabled\\n"; };;
VAR_TMP=*) echo PROBE_STOP_AFTER_2G; exit 0;;
esac' DEBUG
""")
            env = dict(os.environ, PATH=str(b) + ':/usr/bin:/bin', HOME=str(t),
                       BASH_ENV=str(hook), SADIK_WATCH_MESTNO='1', SADIK_ALERT_BIN=alert,
                       SADIK_A2A_BIN='/bin/false', SADIK_VLADELEC_WATCH_BIN=owner,
                       SADIK_WATCH_SOST=str(t/'state'), SADIK_SUTOCHNYE=str(t/'empty'),
                       SADIK_GOSTI_PRAVILA=str(t/'guest'), SADIK_REESTR_PLAGINOV=str(registry),
                       TEST_JOURNAL=str(journal), TEST_ALERTS=str(t/'alerts'), TEST_OWNER=str(t/'owner'))
            (t/'empty').touch()
            watch = Path(os.environ.get('PRAVKI_TEST_WATCHER', WATCH))
            def run():
                (t/'alerts').write_text('')
                result = subprocess.run(['/bin/bash', str(watch)], env=env, capture_output=True, text=True, timeout=8)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('PROBE_STOP_AFTER_2G', result.stdout)
                return result.stdout, (t/'alerts').read_text()
            out, alerts = run()
            self.assertIn('реестр плагинов: живой ' + original_sha[:16], out)
            self.assertNotIn('реестр плагинов', alerts)
            registry.write_text('# registry corrupted\n')
            bad_sha = hashlib.sha256(registry.read_bytes()).hexdigest()
            self.assertNotEqual(original_sha, bad_sha)
            self.assertEqual(registry.read_text().count('# registry corrupted'), 1)
            print('corruption registry: count=1 sha256 ' + original_sha + ' -> ' + bad_sha)
            out, alerts = run()
            self.assertIn('ПРАВЛЕН МИМО pravka', alerts)
            self.assertIn(bad_sha[:16], (t/'state/grp-pravka').read_text())
            with journal.open('a') as f:
                f.write('0\tpravka: установлено ' + str(registry) + ' sha256 ' + bad_sha + ' пункт RESTORED\n')
            out, alerts = run()
            self.assertIn('снова в порядке: ' + bad_sha[:16], alerts)
            self.assertEqual((t/'state/grp-pravka').read_text().split('|')[0], '')
            self.assertEqual((t/'owner').read_text().splitlines(), ['owner-called'] * 3)

if __name__ == '__main__':
    unittest.main(verbosity=2)
