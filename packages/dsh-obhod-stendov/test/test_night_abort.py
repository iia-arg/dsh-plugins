"""B-N-2063: real walker/wrapper and systemd scopes, private stands and alert sink.

Run with python3 -B; sudo is used only for own transient fixture scopes.
No live stand, service, owner channel, registry or installed file is changed.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import signal
import runpy
import subprocess
import tempfile
import time
import unittest
from unittest import mock

PKG = Path(__file__).resolve().parents[1]
WALKER = PKG / 'dorabotki/vse-stendy-boevye.sh'
WRAPPER = PKG / 'dorabotki/vse-stendy-po-tajmeru.sh'


class NightAbort(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='B-N-2063-')
        self.root = Path(self.temp.name)
        self.alerts = self.root / 'alerts'
        alert = self.root / 'alert'
        alert.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\n'
                         f'p=Path({str(self.alerts)!r})\n'
                         'with p.open("a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
        alert.chmod(0o755)
        self.a = self.root / 'stend-a.sh'
        self.b = self.root / 'stend-b.sh'
        self.c = self.root / 'stend-c-😀.sh'
        for p in [self.a, self.b, self.c]:
            p.write_text('#!/bin/bash\nexit 0\n')
        self.paths = [self.a, self.b, self.c]
        inventory = self.root / 'inventory'
        inventory.write_text(''.join(str(p)+'\n' for p in self.paths))
        exceptions = self.root / 'exceptions'
        exceptions.write_text('exceptions: []\n')
        self.env = {**os.environ, 'OBHODCHIK': str(WALKER),
                    'VSE_STENDY_ALERT': str(alert), 'OBLAST_STENDOV': '\n'.join(map(str, self.paths)),
                    'PERECHEN_STENDOV': str(inventory), 'ISKLYUCHENIYA_STENDOV': str(exceptions),
                    'SREDA_STENDOV': '', 'TMPDIR': str(self.root), 'VSE_STENDY_PREDEL': '20',
                    'PYTHONDONTWRITEBYTECODE': '1'}
        self.env.pop('PAKET_IMYA', None)
        self.foreign = None

    def tearDown(self):
        # Fixture safety net, not an assertion: deliberately broken candidates can leak scopes.
        for name in self.root.glob('scope-*'):
            unit = name.read_text().strip()
            subprocess.run(['sudo', '-n', 'systemctl', 'kill', '--signal=KILL', '--', unit],
                           capture_output=True, timeout=3)
        if self.foreign:
            subprocess.run(['sudo', '-n', 'systemctl', 'stop', self.foreign],
                           capture_output=True, timeout=3)
        self.temp.cleanup()

    def run_wrapper(self, **changes):
        log = self.root / 'output'
        with log.open('w') as stream:
            r = subprocess.run(['bash', str(WRAPPER)], env={**self.env, **changes},
                               stdout=stream, stderr=subprocess.STDOUT, text=True, timeout=38)
        r.stdout = log.read_text(); r.stderr = ''
        return r

    def hang(self):
        # Child escapes the process group and ignores TERM, but remains in the real stand cgroup.
        self.b.write_text('#!/bin/bash\npython3 - <<\'PY\'\n'
            'import os,signal,time\nfrom pathlib import Path\n'
            'os.setsid()\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\n'
            f'r=Path({str(self.root)!r})\n'
            '(r/"child-pid").write_text(str(os.getpid()))\n'
            'unit=Path("/proc/self/cgroup").read_text().strip().split("/")[-1]\n'
            '(r/"scope-hung").write_text(unit)\n'
            'while True:\n (r/"heartbeat").write_text(str(time.monotonic_ns()))\n time.sleep(.05)\nPY\n')

    def messages(self):
        return '\n'.join(' '.join(json.loads(x)) for x in self.alerts.read_text().splitlines()) if self.alerts.exists() else ''

    def test_complete_healthy_run_is_not_an_alert(self):
        r = self.run_wrapper()
        self.assertEqual(r.returncode, 0, r.stdout+r.stderr)
        self.assertIn('ПОКРЫТИЕ: прошло 3 из 3', r.stdout)
        self.assertFalse(self.alerts.exists(), self.messages())

    def test_timeout_names_tail_and_kills_only_its_scope_then_return_is_green(self):
        self.foreign = 'B-N-2063-neighbor-' + str(os.getpid()) + '.service'
        subprocess.run(['sudo', '-n', 'systemd-run', '--quiet', '--unit='+self.foreign,
                        '/usr/bin/sleep', '90'], check=True, capture_output=True, timeout=3)
        self.hang()
        started = time.monotonic()
        r = self.run_wrapper(VSE_STENDY_PREDEL='3')
        self.assertEqual(r.returncode, 3, r.stdout+r.stderr)
        self.assertLess(time.monotonic()-started, 26, r.stdout+r.stderr)
        self.assertTrue((self.root/'child-pid').exists(), 'damage stand never entered')
        pid = int((self.root/'child-pid').read_text())
        status = Path(f'/proc/{pid}/status')
        self.assertTrue(not status.exists() or '\nState:\tZ' in status.read_text(), 'escaped child still alive')
        self.assertIn('НЕ ПРОГНАН: '+str(self.c), r.stdout)
        self.assertIn('НЕ ПРОГНАН: '+str(self.c), self.messages())
        self.assertIn('ПРЕРВАН: '+str(self.b), self.messages())
        self.assertNotIn('НЕ ПРОГНАН: '+str(self.a), self.messages())
        neighbor = subprocess.run(['systemctl', 'is-active', self.foreign], capture_output=True, text=True)
        self.assertEqual(neighbor.stdout.strip(), 'active')
        self.b.write_text('#!/bin/bash\nexit 0\n')
        self.alerts.unlink()
        r = self.run_wrapper()
        self.assertEqual(r.returncode, 0, r.stdout+r.stderr)
        self.assertIn('ПОКРЫТИЕ: прошло 3 из 3', r.stdout)
        self.assertFalse(self.alerts.exists())

    def test_term_of_wrapper_reports_tail_and_leaves_no_child(self):
        self.hang()
        p = subprocess.Popen(['bash', str(WRAPPER)], env=self.env, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True)
        try:
            deadline = time.monotonic()+8
            while not (self.root/'child-pid').exists() and time.monotonic()<deadline:
                time.sleep(.05)
            self.assertTrue((self.root/'child-pid').exists(), 'fixture did not start')
            p.send_signal(signal.SIGTERM)
            output = p.communicate(timeout=18)[0]
            self.assertNotEqual(p.returncode, 0, output)
            self.assertIn('НЕ ПРОГНАН: '+str(self.c), output)
            self.assertIn('НЕ ПРОГНАН: '+str(self.c), self.messages())
            pid = int((self.root/'child-pid').read_text())
            status = Path(f'/proc/{pid}/status')
            self.assertTrue(not status.exists() or '\nState:\tZ' in status.read_text(), output)
        finally:
            if p.poll() is None:
                p.kill(); p.communicate(timeout=3)

    def test_large_unicode_tail_survives_alert_partition_without_lost_names(self):
        # Exercise the real bounded notifier, not the real owner channel.
        helper = PKG / 'dorabotki/obhod-run-state.py'
        text = '\n'.join('НЕ ПРОГНАН: /fixture/'+str(i)+'-😀'+'я'*100 for i in range(100))
        r = subprocess.run(['python3', '-B', str(helper), 'notify', str(self.root), self.env['VSE_STENDY_ALERT']],
                           input=text, capture_output=True, text=True, timeout=25)
        self.assertEqual(r.returncode, 0, r.stdout+r.stderr)
        messages = [json.loads(line)[0] for line in self.alerts.read_text().splitlines()]
        self.assertGreater(len(messages), 1)
        for line in text.splitlines():
            self.assertEqual(sum(line in m.splitlines() for m in messages), 1, line)
        self.assertTrue(all(len(m.encode('utf-16-le'))//2 <= 2000 for m in messages))

    def test_default_budget_reaches_timeout_as_4800(self):
        shim = self.root / 'bin'
        shim.mkdir()
        trace = self.root / 'timeout-args'
        command = shim / 'timeout'
        command.write_text('#!/usr/bin/python3\nimport json,os,sys\n'
                           f'with open({str(trace)!r},"a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n'
                           'os.execv("/usr/bin/timeout",["timeout",*sys.argv[1:]])\n')
        command.chmod(0o755)
        self.env.pop('VSE_STENDY_PREDEL')
        r = self.run_wrapper(PATH=str(shim)+':'+os.environ['PATH'])
        self.assertEqual(r.returncode, 0, r.stdout)
        calls = [json.loads(line) for line in trace.read_text().splitlines()]
        self.assertTrue(any(args[:3] == ['-k', '10', '4800'] for args in calls), calls)

    def test_killed_walker_still_reports_every_unstarted_name(self):
        self.b.write_text('#!/bin/bash\npython3 - <<\'PY\'\n'
                          'from pathlib import Path\nimport os,signal,time\n'
                          f'r=Path({str(self.root)!r})\n'
                          'owner=next(r.glob("vse-stendy.*/scope-owner"))\n'
                          'os.kill(int(owner.read_text().split("-")[0]),signal.SIGKILL)\ntime.sleep(30)\nPY\n')
        r = self.run_wrapper()
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn('НЕ ПРОГНАН: '+str(self.c), r.stdout)
        self.assertIn('НЕ ПРОГНАН: '+str(self.c), self.messages())

    def test_forged_scope_manifest_refuses_action_on_another_run(self):
        helper = PKG / 'dorabotki/obhod-run-state.py'
        (self.root/'scope-owner').write_text('123-0123456789abcdef')
        (self.root/'scopes').write_text('obhod-stend-999-1.scope\n')
        r = subprocess.run(['python3', '-B', str(helper), 'cleanup', str(self.root)],
                           capture_output=True, text=True, timeout=3)
        self.assertEqual(r.returncode, 2)
        self.assertIn('scope outside this run', r.stderr)

    def test_abort_before_selection_names_declared_fallback_and_is_failed(self):
        r = self.run_wrapper(OBLAST_STENDOV=str(self.a)+' @root')
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn('объявленный перечень, не план исполнения', r.stdout)
        for path in self.paths:
            self.assertIn('НЕ ПРОГНАН: '+str(path), self.messages())

    def test_failed_limit_api_reports_fallback_without_starting_walker(self):
        query = self.root / 'bad-query.sh'
        query.write_text('#!/bin/bash\n# VSE_STENDY_PREDEL_API=1\nexit 2\n')
        r = self.run_wrapper(OBHODCHIK=str(query))
        self.assertEqual(r.returncode, 3, r.stdout)
        for path in self.paths:
            self.assertIn('НЕ ПРОГНАН: '+str(path), r.stdout)
            self.assertIn('НЕ ПРОГНАН: '+str(path), self.messages())

    def test_failed_alert_part_is_not_reported_as_full_delivery(self):
        alert = Path(self.env['VSE_STENDY_ALERT'])
        alert.write_text('#!/bin/bash\nexit 7\n')
        r = self.run_wrapper(OBLAST_STENDOV=str(self.a)+' @root')
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn('ТРЕВОГА НЕ ДОСТАВЛЕНА ПОЛНОСТЬЮ', r.stdout)
        self.assertNotIn('тревога отправлена', r.stdout)

    def test_notification_deadline_kills_stalled_sender(self):
        helper = PKG / 'dorabotki/obhod-run-state.py'
        pidfile = self.root / 'sender-pid'
        alert = Path(self.env['VSE_STENDY_ALERT'])
        alert.write_text('#!/usr/bin/python3\nimport os,time\n'
                         f'open({str(pidfile)!r},"w").write(str(os.getpid()))\ntime.sleep(60)\n')
        start = time.monotonic()
        r = subprocess.run(['python3', '-B', str(helper), 'notify', str(self.root), str(alert)],
                           input='НЕ ПРОГНАН: /fixture/stand', capture_output=True, text=True, timeout=24)
        self.assertEqual(r.returncode, 2, r.stdout+r.stderr)
        self.assertLess(time.monotonic()-start, 22, r.stderr)
        self.assertIn('not confirmed', r.stderr)
        self.assertFalse(Path('/proc/'+pidfile.read_text()).exists(), 'sender still alive')

    def test_killed_walker_cannot_dispatch_registered_scope_after_cleanup(self):
        shim = self.root / 'bin'; shim.mkdir()
        sudo = shim / 'sudo'
        gate = self.root / 'scope-delayed'
        entered = self.root / 'late-stand-entered'
        sudo.write_text('#!/usr/bin/python3\nimport os,sys,time\nfrom pathlib import Path\n'
                        'args=sys.argv[1:]\n'
                        'unit=next((a.split("=",1)[1] for a in args if a.startswith("--unit=")),"")\n'
                        'if "systemd-run" in args and unit.endswith("-1"):\n'
                        f' Path({str(gate)!r}).write_text(unit+".scope")\n time.sleep(2)\n'
                        'os.execv("/usr/bin/sudo",["sudo",*args])\n')
        sudo.chmod(0o755)
        self.a.write_text('#!/bin/bash\nprintf x > '+str(entered)+'\nsleep 25\n')
        Path(self.env['VSE_STENDY_ALERT']).write_text('#!/bin/bash\nsleep 6\nexit 0\n')
        log = self.root / 'output'
        with log.open('w') as stream:
            p = subprocess.Popen(['bash', str(WRAPPER)],
                                 env={**self.env,'PATH':str(shim)+':'+os.environ['PATH']},
                                 stdout=stream, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic()+8
                while not gate.exists() and time.monotonic()<deadline:
                    time.sleep(.02)
                self.assertTrue(gate.exists(), 'delayed dispatch fixture never entered')
                owner = next(self.root.glob('vse-stendy.*/scope-owner'))
                os.kill(int(owner.read_text().split('-')[0]), signal.SIGKILL)
                p.wait(timeout=18)
                self.assertEqual(p.returncode, 3, log.read_text())
                self.assertFalse(entered.exists(), 'stand dispatched after walker died and cleanup returned')
                state = subprocess.run(['systemctl','show','-p','ActiveState','--value',gate.read_text()],
                                       capture_output=True,text=True,timeout=3)
                self.assertNotIn(state.stdout.strip(), ['active','activating','deactivating'])
            finally:
                if p.poll() is None:
                    p.kill(); p.wait(timeout=3)


class NotifyDiagnostics(unittest.TestCase):
    """B-N-2064 (2) composition: each actual part exposes channel code/output."""

    def run_notify(self, script, text='НЕ ПРОГНАН: /fixture/a'):
        with tempfile.TemporaryDirectory(prefix='B-N-2064-notify-') as name:
            root = Path(name); alert = root/'alert'
            alert.write_text('#!/usr/bin/python3\n'+script.replace('FIXTURE_ROOT', repr(name)))
            alert.chmod(0o755)
            r = subprocess.run(['python3', '-B', str(PKG/'dorabotki/obhod-run-state.py'),
                                'notify', str(root), str(alert)], input=text,
                               capture_output=True, text=True, timeout=24)
            return r, str(alert)

    def test_each_successful_part_reports_code_stdout_and_stderr(self):
        script = ('import pathlib,sys\np=pathlib.Path(FIXTURE_ROOT)/"count"\n'
                  'n=int(p.read_text())+1 if p.exists() else 1\np.write_text(str(n))\n'
                  'print("stdout-"+str(n),flush=True)\n'
                  'print("stderr-"+str(n),file=sys.stderr,flush=True)\n')
        r, alert = self.run_notify(script, 'НЕ ПРОГНАН: /fixture/a\n'*100)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.splitlines().count(f'канал тревог {alert}: код 0'), 2)
        for line in ['stdout-1','stderr-1','stdout-2','stderr-2']:
            self.assertIn('  канал: '+line, r.stdout)

    def test_failed_channel_reports_actual_code_and_preserves_notify_failure(self):
        r, alert = self.run_notify('import sys\nprint("stdout-diagnostic",flush=True)\n'
                                  'print("stderr-diagnostic",file=sys.stderr,flush=True)\nsys.exit(7)\n')
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertIn(f'канал тревог {alert}: код 7', r.stdout)
        self.assertIn('  канал: stdout-diagnostic', r.stdout)
        self.assertIn('  канал: stderr-diagnostic', r.stdout)

    def test_combined_stdout_stderr_is_limited_to_twenty_lines(self):
        r, alert = self.run_notify('import sys\nfor n in range(1,25):\n'
                                  ' print("line-"+str(n),file=sys.stdout if n<=8 else sys.stderr,flush=True)\n')
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = [l for l in r.stdout.splitlines() if l.startswith('  канал: ')]
        self.assertEqual(lines, ['  канал: line-'+str(n) for n in range(1,21)])
        self.assertIn(f'канал тревог {alert}: код 0', r.stdout)


class LauncherIdentity(unittest.TestCase):
    """Real cleanup reader; private proc files, signal boundary captured instead of sent."""

    def exercise(self, kind):
        module = runpy.run_path(str(PKG/'dorabotki/obhod-run-state.py'))
        cleanup = module['cleanup']; globals_ = cleanup.__globals__
        pid, wrapper, foreign = 424242, 414141, 434343
        group_calls = []; pid_calls = []; output = io.StringIO()
        with tempfile.TemporaryDirectory(prefix='B-N-2063-proc-') as name:
            root = Path(name); proc = root/'proc'; proc.mkdir()
            state = root/'state'; state.mkdir()
            (state/'launcher').write_text(f'{pid} {wrapper}\n')
            def stat(number, parent, pgrp, session):
                d = proc/str(number); d.mkdir(exist_ok=True)
                (d/'stat').write_text(f'{number} (fixture leader) S {parent} {pgrp} {session} 0 0\n')
                print(f'PROC FIXTURE pid={number} parent={parent} pgrp={pgrp} session={session}')
            if kind in ('own', 'reuse-after-term'):
                stat(pid, wrapper, pid, pid)
                stat(pid+1, pid, pid, pid)
            elif kind == 'foreign-leader':
                stat(pid, foreign, pid, foreign)
            elif kind == 'foreign-member':
                stat(pid+1, foreign, pid, foreign)
            else:
                raise AssertionError(kind)
            def mapped_path(value):
                p = Path(value)
                return proc/p.relative_to('/proc') if p == Path('/proc') or Path('/proc') in p.parents else p
            def command(args, **kwargs):
                self.assertEqual(args[:3], ['sudo', '-n', '/bin/kill'])
                group_calls.append(args[3])
                if args[3] == '-TERM' and kind == 'reuse-after-term':
                    for p in proc.glob('*/stat'): p.unlink()
                    stat(pid, foreign, pid, foreign)
                if args[3] == '-KILL':
                    for p in proc.glob('*/stat'): p.unlink()
                return subprocess.CompletedProcess(args, 0, '', '')
            def kill(number, sig):
                pid_calls.append(number)
                (proc/str(number)/'stat').unlink(missing_ok=True)
            with mock.patch.dict(globals_, {'Path': mapped_path}), \
                 mock.patch.object(globals_['subprocess'], 'run', side_effect=command), \
                 mock.patch.object(globals_['os'], 'kill', side_effect=kill), \
                 contextlib.redirect_stdout(output):
                try:
                    code = cleanup(state)
                except Exception as error:
                    code = 2; print(type(error).__name__+': '+str(error))
        return code, group_calls, pid_calls, output.getvalue()

    def test_own_pgrp_and_session_receive_term_then_kill(self):
        code, groups, pids, output = self.exercise('own')
        self.assertEqual(code, 0, output)
        self.assertEqual(groups, ['-TERM', '-KILL'])

    def test_reused_pid_or_foreign_group_is_skipped_without_any_signal(self):
        for kind in ['foreign-leader', 'foreign-member']:
            with self.subTest(kind=kind):
                code, groups, pids, output = self.exercise(kind)
                self.assertEqual(code, 0, output)
                self.assertEqual(groups, [], output)
                self.assertEqual(pids, [], output)
                self.assertIn('ПРОПУСК', output)
                self.assertIn('424242', output)

    def test_identity_is_checked_again_before_kill(self):
        code, groups, pids, output = self.exercise('reuse-after-term')
        self.assertEqual(code, 0, output)
        self.assertEqual(groups, ['-TERM'], output)
        self.assertEqual(pids, [], output)
        self.assertIn('ПРОПУСК', output)


if __name__ == '__main__':
    unittest.main(verbosity=2)
