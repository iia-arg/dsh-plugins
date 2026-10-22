#!/usr/bin/python3 -B
"""Real sadik-watch daily block and alert/state functions, fully local command fixtures.

No sudo, live manager, real journals, network or real alerts. One subprocess has
20 seconds, six tests have finite invocations. The mounted caller is not tested.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
ACTORS = ('master', 'vintik', 'shpuntik', 'gayka', 'sova', 'shurup', 'tumbler')
UNITS = tuple('autopilot-mail-notice@' + a + '.service' for a in ACTORS)
FRAGMENT = PKG / 'etc/storozha-sutochnye-autopilot.fragment'
# Legacy scenarios keep numeric inputs after the shipped fragment moves to active.
NUMERIC_FRAGMENT = ''.join(u + ' 1\n' for u in UNITS)
NOW = 1800000000


def entries(text):
    return [line.split() for line in text.splitlines()
            if line.strip() and not line.lstrip().startswith(('#', '!'))]


def function(src, name):
    lines = src.splitlines(keepends=True)
    start = next(i for i, line in enumerate(lines)
                 if re.match(r'^' + name + r'\(\)\s*\{', line))
    if lines[start].rstrip().endswith('}'):
        return lines[start]
    end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith('}'))
    return ''.join(lines[start:end + 1])


class NoticeSutochnye(unittest.TestCase):
    def setUp(self):
        self.assertTrue(FRAGMENT.is_file(), 'seven explicit notice records are missing')
        self.tmp = tempfile.TemporaryDirectory(prefix='notice-sutochnye-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.state = self.root / 'state'
        self.state.mkdir()
        self.config = self.root / 'list'
        self.model = self.root / 'model.json'
        self.calls = self.root / 'calls.jsonl'
        self.alerts = self.root / 'alerts.jsonl'
        self.data = {'failed': [], 'age': {}, 'missing': [], 'file_state': 'enabled'}
        self.config.write_text(NUMERIC_FRAGMENT)
        self.save_model()
        src = (PKG / 'sbin/sadik-watch').read_text()
        begin = src.index('# ── 2в. СТОРОЖ НАД СТОРОЖАМИ')
        end = src.index('\n', src.index('gruppa sutochnye ', begin))
        funcs = ''.join(function(src, n) for n in ('log', 'kanal', 'trevoga', 'gruppa'))
        self.script = self.root / 'reader.sh'
        self.script.write_text('set -uo pipefail\n' + funcs + src[begin:end]
                               + '\nprintf "RESULT %s\\n" "$BEDY"\n')
        shim = '''#!/usr/bin/python3
import os,json,sys,pathlib
args=sys.argv[1:];kind=pathlib.Path(sys.argv[0]).name
r=pathlib.Path(os.environ['FIXTURE_ROOT']);d=json.loads((r/'model.json').read_text())
with (r/'calls.jsonl').open('a')as f:f.write(json.dumps([kind,*args])+'\\n')
if kind=='alert':
 with (r/'alerts.jsonl').open('a')as f:f.write(json.dumps(args,ensure_ascii=False)+'\\n')
 sys.exit(0)
if kind=='systemctl':
 if args[0]=='is-failed':sys.exit(0 if args[-1]in d['failed']else 1)
 if args[0]=='list-timers':
  for a in ACTORS:print('- - - - autopilot-mail-notice@'+a+'.timer autopilot-mail-notice@'+a+'.service')
  sys.exit(0)
 if args[0]=='show' and 'Id'in args:
  for a in ACTORS:print('Id=autopilot-mail-notice@'+a+'.timer\\nFragmentPath=/etc/systemd/system/autopilot-mail-notice@.timer\\nLoadState=loaded\\nUnitFileState='+d['file_state']+'\\n')
  sys.exit(0)
 if args[0]=='show':print('inactive');sys.exit(0)
elif kind=='journalctl':
 u=next(a[5:]for a in args if a.startswith('UNIT='))
 if u not in d['missing']:print(json.dumps({'__REALTIME_TIMESTAMP':str((NOW-d['age'].get(u,5))*1000000)}))
 sys.exit(0)
raise SystemExit('unexpected fixture call: '+repr([kind,*args]))
'''
        shim = shim.replace('ACTORS', repr(ACTORS)).replace('NOW', str(NOW))
        for name in ('systemctl', 'journalctl', 'alert'):
            f = self.bin / name
            f.write_text(shim)
            f.chmod(0o755)

    def save_model(self):
        self.model.write_text(json.dumps(self.data, separators=(',', ':'), sort_keys=True))

    def run_reader(self):
        old = self.alerts.read_text() if self.alerts.exists() else ''
        env = {'PATH': str(self.bin) + ':/usr/bin:/bin', 'FIXTURE_ROOT': str(self.root),
               'ALERT': str(self.bin / 'alert'), 'A2A': '/bin/false',
               'ZAPASNOJ_ADRESAT': 'fixture', 'SOST': str(self.state),
               'SEYCHAS': str(NOW), 'BEDY': '0', 'SADIK_SUTOCHNYE': str(self.config)}
        p = subprocess.run(['bash', str(self.script)], env=env, capture_output=True,
                           text=True, timeout=20)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        new = self.alerts.read_text() if self.alerts.exists() else ''
        self.assertTrue(new.startswith(old))
        return p.stdout, new[len(old):]

    def test_fragment_has_exact_seven_instances(self):
        rows = entries(FRAGMENT.read_text())
        self.assertEqual(rows, [[u, 'active'] for u in UNITS])
        self.assertNotIn('!', FRAGMENT.read_text())
        self.assertNotIn('@.service', FRAGMENT.read_text())

    def test_healthy_failed_repeat_restored_quiet(self):
        out, alert = self.run_reader()
        self.assertIn('RESULT 0', out)
        self.assertEqual(alert, '')
        before = hashlib.sha256(self.model.read_bytes()).hexdigest()
        self.data['failed'] = [UNITS[2]]
        self.save_model()
        after = hashlib.sha256(self.model.read_bytes()).hexdigest()
        probe = subprocess.run(['grep', '-cF', '"failed":["' + UNITS[2] + '"]', str(self.model)],
                               capture_output=True, text=True, check=True)
        self.assertNotEqual(before, after)
        self.assertEqual(probe.stdout.strip(), '1')
        print('DAMAGE failed=1 grep-F=1 SHA before=' + before + ' after=' + after, flush=True)
        out, alert = self.run_reader()
        self.assertIn('RESULT 1', out)
        self.assertIn(UNITS[2] + ' — FAILED', alert)
        for u in UNITS:
            if u != UNITS[2]:
                self.assertNotIn(u + ' — FAILED', alert)
        calls = [json.loads(l) for l in self.calls.read_text().splitlines()]
        self.assertIn(['systemctl', 'is-failed', '--quiet', UNITS[2]], calls)
        out, alert = self.run_reader()
        self.assertIn(UNITS[2] + ' — FAILED', out)
        self.assertEqual(alert, '')
        self.data['failed'] = []
        self.save_model()
        self.assertEqual(hashlib.sha256(self.model.read_bytes()).hexdigest(), before)
        out, alert = self.run_reader()
        self.assertIn('RESULT 0', out)
        self.assertIn('снова в порядке: ' + UNITS[2] + ':failed', alert)
        out, alert = self.run_reader()
        self.assertIn('RESULT 0', out)
        self.assertEqual(alert, '')
        print('RETURN SHA=' + before + ' recovered once, then quiet', flush=True)

    def test_missing_record_names_all_seven_and_disabled_is_still_watched(self):
        self.config.write_text('unrelated.service 26\n')
        out, alert = self.run_reader()
        self.assertIn('RESULT 7', out)
        for u in UNITS:
            self.assertIn(u + ' — таймер ', alert)
        self.config.write_text('unrelated.service 26\n' + NUMERIC_FRAGMENT)
        self.data['file_state'] = 'disabled'
        self.save_model()
        out, _ = self.run_reader()
        self.assertIn('RESULT 0', out)
        out, alert = self.run_reader()
        self.assertEqual(alert, '')

    def test_template_and_exemption_do_not_watch_failed_instance(self):
        target = UNITS[2]
        self.data['failed'] = [target]
        self.save_model()
        good = NUMERIC_FRAGMENT
        self.config.write_text(good.replace(target + ' 1', 'autopilot-mail-notice@.service 1'))
        out, _ = self.run_reader()
        self.assertIn(target + ':net-stroki', (self.state / 'grp-sutochnye').read_text())
        self.assertNotIn(target + ' — FAILED', out)
        self.config.write_text(good.replace(target + ' 1', '!' + target + ' explicit fixture exemption'))
        out, _ = self.run_reader()
        self.assertIn('RESULT 0', out)
        self.assertNotIn(target + ' — FAILED', out)

    def test_append_preserves_existing_config_and_reader_consumes_after(self):
        base_path = os.environ.get('NOTICE_SUTOCHNYE_BASE')
        base = Path(base_path).read_text() if base_path else '# unchanged configuration\nexisting.service 26\n'
        self.assertTrue(base.endswith('\n'))
        existing = {r[0] for r in entries(base)}
        self.assertFalse(existing.intersection(UNITS), 'BEFORE already has notice records')
        after = base + '\n' + NUMERIC_FRAGMENT
        self.assertEqual(after[:len(base)], base)
        self.assertEqual(entries(after), entries(base) + [[u, '1'] for u in UNITS])
        self.config.write_text(after)
        out, alert = self.run_reader()
        self.assertIn('RESULT 0', out)
        self.assertEqual(alert, '')
        print('AFTER reader healthy: existing=' + str(len(entries(base))) + ' added=7; prefix unchanged', flush=True)

    def test_stale_and_missing_history_remain_named(self):
        self.data['age'] = {UNITS[0]: 3601}
        self.data['missing'] = [UNITS[1]]
        self.save_model()
        out, alert = self.run_reader()
        self.assertIn('RESULT 2', out)
        self.assertIn(UNITS[0] + ' — последний прогон состоялся', alert)
        self.assertIn(UNITS[1] + ' — состоявшегося прогона в журнале НЕТ', alert)


if __name__ == '__main__':
    unittest.main(verbosity=2)
