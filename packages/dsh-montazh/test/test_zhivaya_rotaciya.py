"""Rotation must be counted silently; a startup within retained history stays blind.
Run the real watcher, replacing only systemctl/journalctl and the alert channel.
"""
import json
import datetime
import time
from pathlib import Path
import unittest
import test_zhivaya_obshchij as F


class Rotaciya(unittest.TestCase):
    def setUp(self):
        self.f = F.ObshchijNositel()
        self.f.setUp()
        self.addCleanup(self.f.tearDown)
        self.home = self.f.root / 'home'
        self.disk = self.home / 'plugins/dsh-tool-bridge/package.json'
        self.disk.parent.mkdir(parents=True)
        self.disk.write_text('{"version":"3.1.9"}')
        self.u = self.f.agent('обычная строка без версии', pid='12345', dom=self.home)
        self.clock = int(time.time())+3600
        self.u['ExecMainStartTimestamp'] = datetime.datetime.fromtimestamp(self.clock,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip().replace('-', '')
        self.u['_boots'] = [{'boot_id':boot, 'first_entry':(self.clock+3600)*1000000}]
        journals = self.f.root / 'journal-files/machine'
        journals.mkdir(parents=True)
        for name in ('user-1011.journal', 'user-10110.journal', 'system.journal'):
            (journals/name).touch()
        self.f.cmd('ps', 'import json\nprint(json.load(open(%r))["fixture.service"].get("_uid","1011"))\n' % str(self.f.konf))
        self.f.cmd('journalctl', 'import sys,json\nk=json.load(open(%r));u=next(iter(k.values()))\n'
                   'if "--list-boots" in sys.argv:\n'
                   ' print(u.get("_boots_raw",json.dumps(u["_boots"])));sys.exit(u.get("_boots_rc",0))\n'
                   'if any(a.startswith("--file=") for a in sys.argv):\n'
                   ' expected="system" if int(u.get("_uid",1011))<1000 else "user-"+str(u.get("_uid",1011))\n'
                   ' if not all(__import__("pathlib").Path(a[7:]).name in (expected+".journal",expected+"@archive.journal") for a in sys.argv if a.startswith("--file=")):sys.exit(9)\n'
                   ' print(u.get("_family_raw",json.dumps({"__REALTIME_TIMESTAMP":str(u["_boots"][0]["first_entry"])})));sys.exit(u.get("_family_rc",0))\n'
                   'pid=next(x[5:] for x in sys.argv if x.startswith("_PID="))\n'
                   '[print(v.get("_zhurnal","")) for v in k.values() if v.get("MainPID")==pid]\n'
                   'sys.exit(u.get("_journal_rc",0))\n' % str(self.f.konf))

    def run_watch(self):
        return self.f.progon('3.1.14', {'fixture.service': self.u})

    def test_uid_family_lost_start_despite_older_global_boot_boundary(self):
        self.u['_family_raw'] = json.dumps({'__REALTIME_TIMESTAMP':str((self.clock+3600)*1000000)})
        self.u['_boots'][0]['first_entry'] = (self.clock-3600)*1000000
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertIn('ВРЕМЯ',p.stdout)
        self.assertEqual(alerts,[])

    def test_young_process_without_version_stays_blind_in_own_family(self):
        self.u['_family_raw'] = json.dumps({'__REALTIME_TIMESTAMP':str((self.clock-3600)*1000000)})
        # Another family/global boundary cannot mask the missing startup line.
        self.u['_boots'][0]['first_entry'] = (self.clock+3600)*1000000
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertIn('СЛЕПОТА',p.stdout)
        self.assertEqual(len(alerts),1)

    def test_system_uid_uses_system_family(self):
        self.u['_uid'] = '996'
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertIn('ВРЕМЯ',p.stdout)
        self.assertEqual(alerts,[])

    def test_unknown_uid_and_missing_family_stay_blind(self):
        for uid in ('', 'bad', '1012'):
            with self.subTest(uid=uid):
                self.u['_uid'] = uid
                self.f.sost.unlink(missing_ok=True)
                p,alerts=self.run_watch()
                self.assertEqual(p.returncode,2,p.stdout+p.stderr)
                self.assertEqual(len(alerts),1)

    def test_healthy_rotation_true_blindness_return(self):
        self.u['_zhurnal'] = '[dsh-tool-bridge 3.1.9] подъём'
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(alerts, [])
        self.u['_zhurnal'] = 'строка после ротации'
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertIn('сошлось по времени запуска', p.stdout)
        self.assertIn('сошлось 0', p.stdout)
        self.assertIn('по времени 1', p.stdout)
        self.assertEqual(alerts, [])
        self.u['ExecMainStartTimestamp'] = datetime.datetime.fromtimestamp(self.clock+7200,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)
        self.assertIn('СЛЕПОТА', alerts[0])
        self.u['_zhurnal'] = '[dsh-tool-bridge 3.1.9] подъём'
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)
        self.assertIn('снова в порядке', alerts[0])

    def test_old_false_alarm_clears_silently_without_claiming_live_version(self):
        self.f.sost.write_text(json.dumps({'kartina':['СЛЕПОТА fixture.service · dsh-tool-bridge · в журнале живого pid 12345 нет строки версии'], 'kogda':1}))
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(alerts, [])
        self.assertEqual(json.loads(self.f.sost.read_text())['kartina'], [])

    def test_unknown_history_keeps_blindness(self):
        for raw in ['', 'bad json', '[]', '{}', '{"__REALTIME_TIMESTAMP":true}', '{"__REALTIME_TIMESTAMP":"0"}']:
            with self.subTest(raw=raw):
                self.u['_family_raw'] = raw
                self.f.sost.unlink(missing_ok=True)
                p, alerts = self.run_watch()
                self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
                self.assertEqual(len(alerts), 1)

    def test_failed_metadata_command_cannot_silence_alert(self):
        self.u['_family_rc'] = 1
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)

    def test_failed_pid_journal_stays_blind_with_valid_boot_metadata(self):
        self.u['_journal_rc'] = 1
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)

    def test_same_second_is_unknown_not_proof_of_rotation(self):
        self.u['ExecMainStartTimestamp'] = '2026-10-20 00:00:00 UTC'
        self.u['_boots'][0]['first_entry'] = 1792454400600000
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)

    def test_lost_mismatch_is_not_announced_recovered(self):
        self.f.sost.write_text(json.dumps({'kartina':['РАЗОШЛОСЬ fixture.service · dsh-tool-bridge · живая 3.1.8 ≠ диск 3.1.9'], 'kogda':1}))
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(alerts, [], 'unknown live version cannot prove recovery')

    def test_pid_change_during_metadata_read_stays_blind(self):
        changed = self.f.root / 'pid-changed'
        self.f.cmd('systemctl', 'import sys,json\nfrom pathlib import Path\n'
                   'k=json.load(open(%r));a=sys.argv[1:];flag=Path(%r)\n'
                   'if a[0]=="list-units":\n [print(u+" loaded active running stend") for u in k]\n'
                   'elif a[0]=="show":\n p=a[a.index("-p")+1];u=k.get(a[-1],{})\n'
                   ' if p=="ExecMainStartTimestamp":flag.write_text("changed")\n'
                   ' print("99999" if p=="MainPID" and flag.exists() else u.get(p,""))\n'
                   % (str(self.f.konf), str(changed)))
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)

    def test_missing_process_start_cannot_silence_alert(self):
        self.u['ExecMainStartTimestamp'] = ''
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertEqual(len(alerts), 1)

    def test_disk_unreadable_stays_blind_despite_old_process(self):
        self.disk.write_text('bad json')
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 2, p.stdout+p.stderr)
        self.assertIn('диск не читается', p.stdout)
        self.assertEqual(len(alerts), 1)

    def test_retained_wrong_version_still_alerts_even_if_start_is_old(self):
        self.u['_zhurnal'] = '[dsh-tool-bridge 3.1.8] подъём'
        p, alerts = self.run_watch()
        self.assertEqual(p.returncode, 1, p.stdout+p.stderr)
        self.assertIn('РАЗОШЛОСЬ', p.stdout)
        self.assertEqual(len(alerts), 1)


if __name__ == '__main__':
    unittest.main()
