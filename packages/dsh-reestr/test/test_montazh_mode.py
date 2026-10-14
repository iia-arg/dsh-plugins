"""Real reader/caller boundary; fixture commands replace only external checks."""
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

PKG = Path(__file__).resolve().parents[1]
HELPER = PKG.parent / 'dsh-montazh/sbin/montazh-okno'


class Automatic(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='real-registry-montazh-'))
        self.state = self.root / 'windows'
        self.state.mkdir(mode=0o755)
        self.value = self.root / 'version'
        self.value.write_text('2\n')
        self.registry = self.root / 'plugins.yaml'
        self.agents = self.root / 'agents.yaml'
        self.agents.write_text('agenty:\n  - imya: fixture\n    namerenie:\n      dom: ' + str(self.root / 'home') + '\n')
        self.write_registry()
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.ident = '2' * 32
        self.window = self.state / (self.ident + '.json')
        self.window.write_text(json.dumps({'schema': 1, 'id': self.ident, 'task': 'B-N-2025',
            'actor': 'fixture', 'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'opened_ns': now, 'deadline_ns': now + 1800 * 10**9,
            'expires_utc': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=1800)).isoformat(),
            'phase': 'open', 'subjects': ['entry:a'], 'checks': [{'kind': 'registry',
                'path': str(self.registry), 'id': 'a', 'expected': {'version': '2'}}]}))
        self.env = {**os.environ, 'PLUGINS_REGISTRY': str(self.registry), 'AGENTS_REGISTRY': str(self.agents),
                    'MO_STATE_DIR': str(self.state), 'MONTAZH_OKNO_BIN': str(HELPER)}

    def tearDown(self):
        shutil.rmtree(self.root)

    def write_registry(self, healthy=False, outside=False, health=False):
        rows = [{'id': 'a', 'version': '2' if healthy else '1', 'path': str(self.value),
                 'installed_check': 'cat ' + str(self.value)}]
        if outside:
            rows.append({'id': 'b', 'version': '1', 'installed_check': 'printf 3'})
        if health:
            rows[0].update(healthcheck='printf "РАСХОЖДЕНИЕ fixture"; exit 1', montazh_consistency=True)
        self.registry.write_text('plugins: ' + json.dumps(rows, ensure_ascii=False) + '\n')

    def cli(self, *args):
        return subprocess.run(['python3', str(PKG / 'bin/agent-plugins'), *args],
                              env=self.env, capture_output=True, text=True, timeout=8)

    def test_healthy_baseline_and_manual_red_with_active_window(self):
        self.write_registry(healthy=True)
        self.assertEqual(self.cli('verify').returncode, 0)
        self.write_registry()
        p = self.cli('verify')
        self.assertEqual(p.returncode, 1)
        self.assertIn('РАСХОЖДЕНИЙ:', p.stdout)
        self.assertNotIn('ОТЛОЖЕНО', p.stdout)

    def test_auto_live_window_returns_four_not_green(self):
        p = self.cli('verify', '--avto-montazh')
        self.assertEqual(p.returncode, 4, p.stdout + p.stderr)
        self.assertIn(self.ident, p.stdout)
        self.assertIn('ОТЛОЖЕНО', p.stdout)
        self.assertNotIn('реестр совпадает', p.stdout)

    def test_outside_mismatch_wins_over_scoped_defer(self):
        self.write_registry(outside=True)
        p = self.cli('verify', '--avto-montazh')
        self.assertEqual(p.returncode, 1)
        self.assertIn('РАСХОЖДЕНИЙ: 1', p.stdout)
        self.assertIn('ОТЛОЖЕНО', p.stdout)
        self.assertIn('b (версия)', p.stdout)

    def test_bad_window_permissions_leave_auto_strict(self):
        self.window.chmod(0o666)
        p = self.cli('verify', '--avto-montazh')
        self.assertEqual(p.returncode, 1)
        self.assertNotIn('ОТЛОЖЕНО', p.stdout)

    def test_invalid_uid_link_boot_and_expiry_are_strict(self):
        original = self.window.read_bytes()
        cases = ['uid', 'link', 'directory_mode', 'boot', 'expired']
        for kind in cases:
            with self.subTest(kind=kind):
                if kind == 'uid':
                    os.chown(self.window, 65534, 65534)
                elif kind == 'link':
                    target = self.root / 'record'
                    target.write_bytes(original)
                    self.window.unlink()
                    self.window.symlink_to(target)
                elif kind == 'directory_mode':
                    self.state.chmod(0o777)
                else:
                    record = json.loads(original)
                    if kind == 'boot':
                        record['boot_id'] = '00000000-0000-0000-0000-000000000000'
                    else:
                        record['deadline_ns'] = time.clock_gettime_ns(time.CLOCK_BOOTTIME) - 1
                        record['opened_ns'] = record['deadline_ns'] - 1800 * 10**9
                    self.window.write_text(json.dumps(record))
                p = self.cli('verify', '--avto-montazh')
                self.assertEqual(p.returncode, 1, p.stdout + p.stderr)
                self.assertNotIn('ОТЛОЖЕНО', p.stdout)
                self.window.unlink()
                self.window.write_bytes(original)
                self.state.chmod(0o755)
        self.assertEqual(self.cli('verify', '--avto-montazh').returncode, 4)

    def test_blind_check_is_not_deferred(self):
        self.write_registry()
        self.registry.write_text(self.registry.read_text().replace('cat ' + str(self.value), 'exit 2'))
        p = self.cli('verify', '--avto-montazh')
        self.assertEqual(p.returncode, 2)
        self.assertNotIn('ОТЛОЖЕНО', p.stdout)

    def test_late_closed_window_rereads_fresh_registry(self):
        # Внешняя установленная проверка завершает монтаж во время scan.
        closer = self.root / 'close.py'
        new = [{'id': 'a', 'version': '2', 'path': str(self.value),
                'installed_check': 'cat ' + str(self.value)}]
        closer.write_text('from pathlib import Path\nimport subprocess\n'
            + 'Path(' + repr(str(self.registry)) + ').write_text(' + repr('plugins: ' + json.dumps(new) + '\n') + ')\n'
            + 'subprocess.run(' + repr([str(HELPER), 'zakryt', self.ident]) + ',check=True,capture_output=True)\n'
            + 'print(2)\n')
        self.registry.write_text('plugins: ' + json.dumps([{'id': 'a', 'version': '1',
            'installed_check': 'python3 ' + str(closer)}]) + '\n')
        p = self.cli('verify', '--avto-montazh')
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn('ПЕРЕСНЯТО', p.stdout)
        self.assertNotIn('РАСХОЖДЕНИЙ:', p.stdout)
        self.assertEqual(json.loads(self.window.read_text())['phase'], 'closed')

    def test_only_consistency_health_is_eligible_not_liveness(self):
        self.write_registry(health=True)
        p = self.cli('list', '--health', '--avto-montazh')
        self.assertEqual(p.returncode, 4, p.stdout + p.stderr)
        self.assertIn('ОТЛОЖЕНО', p.stdout)
        self.registry.write_text(self.registry.read_text().replace('"montazh_consistency": true', '"montazh_consistency": false'))
        p = self.cli('list', '--health', '--avto-montazh')
        self.assertEqual(p.returncode, 1)
        self.assertNotIn('ОТЛОЖЕНО', p.stdout)

    def test_manual_health_does_not_defer(self):
        self.write_registry(health=True)
        p = self.cli('list', '--health')
        self.assertEqual(p.returncode, 1)
        self.assertNotIn('ОТЛОЖЕНО', p.stdout)

    def test_late_health_reread_discards_previous_rows(self):
        closer = self.root / 'health-close.py'
        fresh = [{'id':'a','version':'2','healthcheck':'echo healthy','montazh_consistency':True}]
        closer.write_text('from pathlib import Path\nimport subprocess\n'
            + 'Path(' + repr(str(self.registry)) + ').write_text(' + repr('plugins: ' + json.dumps(fresh) + '\n') + ')\n'
            + 'subprocess.run(' + repr([str(HELPER),'zakryt',self.ident]) + ',check=True,capture_output=True)\n'
            + 'raise SystemExit(1)\n')
        self.registry.write_text('plugins: ' + json.dumps([{'id':'a','version':'1',
            'healthcheck':'python3 ' + str(closer),'montazh_consistency':True}]) + '\n')
        p = self.cli('list', '--health', '--avto-montazh')
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        rows = [line for line in p.stdout.splitlines() if line.startswith('  a ')]
        self.assertEqual(len(rows), 1, p.stdout)

    def test_second_closed_generation_is_blind_in_verify_and_health(self):
        helper = self.root / 'helper-six'
        trace = self.root / 'helper-calls'
        helper.write_text('#!/usr/bin/python3\nimport sys\n'
            + 'with open(' + repr(str(trace)) + ',"a") as f:f.write("1\\n")\n'
            + 'print("ПЕРЕСНЯТО: fixture generation closed");sys.exit(6)\n')
        helper.chmod(0o755)
        self.env['MONTAZH_OKNO_BIN'] = str(helper)
        for args in (('verify','--avto-montazh'),('list','--health','--avto-montazh')):
            with self.subTest(args=args):
                self.write_registry(health=args[0]=='list');trace.unlink(missing_ok=True)
                p=self.cli(*args)
                self.assertEqual(p.returncode,2,p.stdout+p.stderr)
                self.assertIn('СЛЕПОТА: повторная смена',p.stdout+p.stderr)
                self.assertEqual(len(trace.read_text().splitlines()),2)

    def test_expiry_while_other_entry_is_measured_cannot_return_four(self):
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);d=json.loads(self.window.read_text());d['opened_ns']=now;d['deadline_ns']=now+10**9;self.window.write_text(json.dumps(d))
        with self.registry.open('w') as f:
            f.write('plugins: '+json.dumps([{'id':'a','version':'1','installed_check':'printf 2'},{'id':'b','version':'2','installed_check':'sleep 1.2; printf 2'}])+'\n')
        p=self.cli('verify','--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr)

    def test_health_expiry_during_other_check_is_not_deferred(self):
        now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);d=json.loads(self.window.read_text());d['opened_ns']=now;d['deadline_ns']=now+10**9;self.window.write_text(json.dumps(d))
        self.registry.write_text('plugins: '+json.dumps([{'id':'a','version':'1','healthcheck':'exit 1','montazh_consistency':True},{'id':'b','version':'2','healthcheck':'sleep 1.2; echo healthy'}])+'\n')
        p=self.cli('list','--health','--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr)

    def test_unknown_deferred_marker_is_blind_including_mixed_valid_marker(self):
        for body in ('ОТЛОЖЕНО not-a-window', 'ОТЛОЖЕНО '+self.ident+'\nОТЛОЖЕНО not-a-window'):
            for name in ('caller-state','commands'):
                path=self.root/name
                if path.exists():shutil.rmtree(path)
            p,_=self.caller(verify=(4,body));self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertNotIn('сторож реестров: ОТЛОЖЕНО',p.stdout)

    def caller(self, verify=(4, None), nashi=(0, ''), health=None, automatic=True):
        state = self.root / 'caller-state'
        state.mkdir()
        for name in ['last-run.stamp', 'last-spoke.stamp']:
            (state / name).write_text(str(int(time.time())))
        conf = self.root / 'caller.conf'
        conf.write_text('')
        trace = self.root / 'alerts'
        alert = self.root / 'alert'
        alert.write_text('#!/bin/sh\nprintf called >> ' + str(trace) + '\n')
        alert.chmod(0o755)
        def command(name, result):
            code, body = result
            if body is None:
                body = 'ОТЛОЖЕНО ' + self.ident
            fixture = self.root / name
            fixture.write_text('#!/bin/sh\ncat <<\'RESULT\'\n' + body + '\nRESULT\nexit ' + str(code) + '\n')
            fixture.chmod(0o755)
            return str(fixture)
        reader = command('verify-result', verify)
        # Весь caller скопирован, но journal logger — внешний эффект.
        commands = self.root / 'commands'
        commands.mkdir()
        logger = commands / 'logger'
        logger.write_text('#!/bin/sh\nexit 0\n')
        logger.chmod(0o755)
        env = {**self.env, 'REGWD_CONF': str(conf), 'REGWD_STATE': str(state), 'REGWD_ALERT': str(alert),
            'PATH': str(commands) + ':' + os.environ['PATH'],
            'VERIFY_CMD': reader, 'AGENTS_VERIFY_CMD': '/bin/true', 'DORABOTKI_CMD': command('nashi-result', nashi),
            'HEALTH_ENABLED': '1' if health else '0', 'HEALTH_CMD': command('health-result', health or (0,'')),
            'PEER_ENABLED': '0', 'DPKG_LOG': str(self.root / 'none')}
        p = subprocess.run(['bash', str(PKG / 'bin/registry-watchdog.sh'), *(['--avto-montazh'] if automatic else [])], env=env,
                           capture_output=True, text=True, timeout=8)
        return p, trace

    def test_registry_caller_handles_four_without_blind_green_or_alert(self):
        p, trace = self.caller()
        self.assertEqual(p.returncode, 4, p.stdout + p.stderr)
        self.assertIn('ОТЛОЖЕНО', p.stdout)
        self.assertNotIn('СЛЕПОТА', p.stdout)
        self.assertNotIn('ЗЕЛЕНО', p.stdout)
        self.assertFalse(trace.exists(), 'defer became an owner alert')

    def test_manual_caller_cannot_return_four(self):
        p, _ = self.caller(automatic=False)
        self.assertIn(p.returncode, (1, 2), p.stdout + p.stderr)
        self.assertNotIn('сторож реестров: ОТЛОЖЕНО', p.stdout)

    def test_manual_marker_cannot_create_automatic_verdict(self):
        p, _ = self.caller(verify=(0, 'ОТЛОЖЕНО ' + self.ident), automatic=False)
        self.assertNotEqual(p.returncode, 4, p.stdout + p.stderr)

    def test_nashi_caller_handles_four(self):
        p, trace = self.caller(verify=(0,''), nashi=(4,None))
        self.assertEqual(p.returncode, 4, p.stdout + p.stderr)
        self.assertFalse(trace.exists())

    def test_caller_four_without_marker_is_blind(self):
        p, trace = self.caller(verify=(4,''))
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        self.assertTrue(trace.exists())

    def test_caller_real_outside_error_wins(self):
        p, trace = self.caller(nashi=(1,'РАСХОЖДЕНИЙ НАЙДЕНО 1'))
        self.assertEqual(p.returncode, 1, p.stdout + p.stderr)
        self.assertIn('ОТЛОЖЕНО', p.stdout)
        self.assertTrue(trace.exists())

    def test_health_caller_four_is_not_blind(self):
        body = '  a   2\n     ОТЛОЖЕНО ' + self.ident + '\nвсего записей: 1   файл: fixture\n'
        p, trace = self.caller(verify=(0,''), health=(4,body))
        self.assertEqual(p.returncode, 4, p.stdout + p.stderr)
        self.assertNotIn('СЛЕПОТА', p.stdout)
        self.assertFalse(trace.exists())


if __name__ == '__main__':
    assert os.getuid() == 0, 'root-owned fixture metadata'
    unittest.main()
