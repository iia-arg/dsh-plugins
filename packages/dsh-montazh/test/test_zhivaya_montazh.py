"""Real watcher CLI, fake systemctl/journalctl only at external boundary."""
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


class LiveVersion(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='b2025-live-'))
        self.commands = self.root / 'commands'
        self.commands.mkdir()
        self.state = self.root / 'windows'
        self.state.mkdir(mode=0o755)
        self.journal = self.root / 'journal'
        self.journal.write_text('[dsh-tool-bridge 1.0.0] подъём\n')
        self.units = self.root / 'units'
        self.units.write_text('fixture.service loaded active running fixture\n')
        self.home = self.root / 'home'
        package = self.home / 'plugins/dsh-tool-bridge'
        package.mkdir(parents=True)
        (package / 'package.json').write_text('{"version":"2.0.0"}')
        systemctl = self.commands / 'systemctl'
        systemctl.write_text('#!/bin/sh\ncase "$1" in\n'
            + 'list-units) cat ' + str(self.units) + ';;\n'
            + 'show) case "$*" in\n'
            + '*ExecStart*) echo "/fixture/@deepseek-ai/dsh/lib/bin.js web";;\n'
            + '*Environment*) echo "HOME=' + str(self.home) + '";;\n'
            + '*MainPID*) echo 12345;;\n'
            + '*ActiveEnterTimestamp*) echo "2026-10-13 00:00:00 UTC";;\n'
            + 'esac;;\nesac\n')
        systemctl.chmod(0o755)
        self.make_command('journalctl', '#!/bin/sh\ncat ' + str(self.journal) + '\n')
        self.make_command('logger', '#!/bin/sh\nexit 0\n')
        self.trace = self.root / 'alerts'
        self.alert = self.make_command('alert', '#!/bin/sh\nprintf called >> ' + str(self.trace) + '\n')
        self.snapshot = self.root / 'snapshot.json'
        self.ident = '3' * 32
        self.window = self.state / (self.ident + '.json')
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record = {'schema':1,'id':self.ident,'task':'B-N-2025','actor':'fixture',
            'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'opened_ns':now,'deadline_ns':now+1800*10**9,
            'expires_utc':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=1800)).isoformat(),
            'phase':'open','subjects':['unit:fixture.service:dsh-tool-bridge'],
            'checks':[{'kind':'unit','unit':'fixture.service','package':'dsh-tool-bridge','version':'2.0.0'}]}
        self.window.write_text(json.dumps(self.record))
        self.env = {**os.environ,'PATH':str(self.commands)+':'+os.environ['PATH'],
            'MO_STATE_DIR':str(self.state),'MONTAZH_OKNO_BIN':str(PKG/'sbin/montazh-okno'),
            'MO_SYSTEMCTL':str(systemctl),'MO_JOURNALCTL':str(self.commands/'journalctl')}

    def make_command(self, name, body):
        p = self.commands / name
        p.write_text(body)
        p.chmod(0o755)
        return p

    def tearDown(self):
        shutil.rmtree(self.root)

    def cli(self, *args):
        return subprocess.run(['python3',str(PKG/'sbin/zhivaya-versiya-watch'),
            '--sost',str(self.snapshot),'--kanal',str(self.alert),*args],
            env=self.env,capture_output=True,text=True,timeout=8)

    def test_healthy_and_manual_active_window_are_strict(self):
        self.journal.write_text('[dsh-tool-bridge 2.0.0] подъём\n')
        self.assertEqual(self.cli('--tolko-pechat').returncode,0)
        self.journal.write_text('[dsh-tool-bridge 1.0.0] подъём\n')
        p = self.cli('--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def test_auto_defer_preserves_problem_snapshot_and_does_not_alert(self):
        prior = '{"kartina":["prior problem"],"kogda":1}'
        self.snapshot.write_text(prior)
        p = self.cli('--avto-montazh')
        self.assertEqual(p.returncode,4,p.stdout+p.stderr)
        self.assertIn(self.ident,p.stdout)
        self.assertNotIn('снова в порядке',p.stdout)
        self.assertFalse(self.trace.exists())
        self.assertEqual(self.snapshot.read_text(),prior)

    def test_outside_unit_remains_red_with_scoped_defer(self):
        self.units.write_text(self.units.read_text()+'outside.service loaded active running outside\n')
        p = self.cli('--avto-montazh')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertIn('outside.service',p.stdout)
        self.assertIn('ОТЛОЖЕНО',p.stdout)
        self.assertTrue(self.trace.exists())

    def test_missing_live_version_remains_blind(self):
        self.journal.write_text('no version\n')
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,2,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def test_instrument_failure_is_not_deferred(self):
        self.journal.write_text('[dsh-tool-bridge] ostrovApi НЕ установлен: baseUrl обязателен\n'
                               '[dsh-tool-bridge 2.0.0] подъём\n')
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertIn('ИНСТРУМЕНТ',p.stdout)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def test_invalid_or_expired_window_is_strict(self):
        self.window.chmod(0o666)
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)
        self.window.chmod(0o644)
        now = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        self.record.update(opened_ns=now-1800*10**9-1,deadline_ns=now-1)
        self.window.write_text(json.dumps(self.record))
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,1,p.stdout+p.stderr)
        self.assertNotIn('ОТЛОЖЕНО',p.stdout)

    def test_late_close_rereads_live_pair(self):
        once = self.root / 'once'
        source = ('#!/usr/bin/python3\nfrom pathlib import Path\nimport subprocess\n'
            + 'journal=Path(' + repr(str(self.journal)) + ')\n'
            + 'once=Path(' + repr(str(once)) + ')\n'
            + 'if not once.exists():\n'
            + ' once.write_text("closed")\n stale=journal.read_text()\n'
            + ' journal.write_text("[dsh-tool-bridge 2.0.0] подъём\\n")\n'
            + ' subprocess.run(' + repr([str(PKG/'sbin/montazh-okno'),'zakryt',self.ident])
            + ',check=True,capture_output=True)\n print(stale,end="")\n'
            + 'else:\n print(journal.read_text(),end="")\n')
        self.make_command('journalctl',source)
        p = self.cli('--avto-montazh','--tolko-pechat')
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertNotIn('РАЗОШЛОСЬ',p.stdout)
        self.assertEqual(json.loads(self.window.read_text())['phase'],'closed')

    def test_final_expiry_cannot_return_four(self):
        wrapper=self.root/'expiry-helper';counter=self.root/'calls'
        real=PKG/'sbin/montazh-okno'
        wrapper.write_text('#!/usr/bin/python3\nimport subprocess,sys,json,time\nfrom pathlib import Path\na=sys.argv[1:]\n'
            +'p=subprocess.run('+repr([str(real)])+'+a,capture_output=True,text=True)\n'
            +'if a[0]=="otlozheno" and p.returncode==4:\n c=Path('+repr(str(counter))+');n=int(c.read_text())+1 if c.exists() else 1;c.write_text(str(n))\n'
            +' if n==1:\n  f=Path('+repr(str(self.window))+');d=json.loads(f.read_text());d["deadline_ns"]=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;d["opened_ns"]=d["deadline_ns"]-1800*10**9;f.write_text(json.dumps(d))\n'
            +'print(p.stdout,end="");sys.exit(p.returncode)\n')
        wrapper.chmod(0o755);self.env['MONTAZH_OKNO_BIN']=str(wrapper)
        p=self.cli('--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertTrue(self.trace.exists());self.assertEqual(counter.read_text(),'1')


if __name__=='__main__':
    assert os.getuid()==0,'root-owned metadata fixture'
    unittest.main()
