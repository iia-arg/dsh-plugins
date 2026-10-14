#!/usr/bin/env python3
# RU: Курсор и обрезка через настоящий код; journalctl и канал подставные, состояние в /tmp.
# EN: Tests real cursor/trimming code; journalctl and alert channel are doubles, state lives in /tmp.
import importlib.util, json, pathlib, unittest
spec=importlib.util.spec_from_file_location('fixture',pathlib.Path(__file__).with_name('stend-nastroek-proby.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)

class WatchTests(unittest.TestCase):
    setUp=f.AlertTests.setUp
    tearDown=f.AlertTests.tearDown
    runmod=f.AlertTests.runmod
    def setup_window(self, rows):
        self.cursor=self.d/'state'/'cursor';self.cursor.parent.mkdir();self.cursor.write_text('old\n')
        (self.d/'journal').write_text(''.join(json.dumps(r)+'\n' for r in rows))
        self.channel=self.d/'bin'/'channel'
        self.channel.write_text('#!/bin/sh\nprintf "%s\\n" "$*" > "$FIXTURE/channel-call"\nexit "${CHANNEL_CODE:-0}"\n');self.channel.chmod(0o755)
    def watch(self,*extra):
        return self.runmod('otkaz-klyuch-watch',('--kursor',str(self.cursor),'--kanal',str(self.channel),*extra))
    def row(self,text='исход=отказ-ключ аргумент=--check'):
        return dict(MESSAGE=text,__CURSOR='new',__REALTIME_TIMESTAMP='1000000',_UID='123',_SYSTEMD_UNIT='worker.service')
    def test_empty_window_advances_without_alert(self):
        self.setup_window([self.row('исход=доставлено')]);r=self.watch()
        self.assertEqual(r.returncode,0);self.assertEqual(self.cursor.read_text(),'new\n');self.assertFalse((self.d/'channel-call').exists())
    def test_no_initial_cursor_starts_at_tail(self):
        self.setup_window([self.row()]);self.cursor.unlink();r=self.watch()
        self.assertEqual(r.returncode,0);self.assertEqual(self.cursor.read_text(),'new\n');self.assertFalse((self.d/'channel-call').exists())
    def test_failure_window_advances_after_alert(self):
        self.setup_window([self.row()]);r=self.watch();self.assertEqual(r.returncode,0)
        self.assertEqual(self.cursor.read_text(),'new\n');self.assertIn('worker.service',(self.d/'channel-call').read_text())
    def test_channel_failure_preserves_cursor_then_recovers(self):
        self.setup_window([self.row()]);self.env['CHANNEL_CODE']='1';r=self.watch()
        self.assertEqual(r.returncode,2);self.assertEqual(self.cursor.read_text(),'old\n')
        self.env['CHANNEL_CODE']='0';r=self.watch();self.assertEqual(r.returncode,2)
        self.assertIn('доставка неизвестна',r.stdout)
        # Here the channel was a proven no-send double. Operator resolves the ambiguous state.
        self.cursor.with_name('cursor.pending').unlink()
        r=self.watch();self.assertEqual(r.returncode,0);self.assertEqual(self.cursor.read_text(),'new\n')
    def test_journal_failure_preserves_cursor(self):
        self.setup_window([]);self.env['JOURNAL_FAIL']='1';r=self.watch()
        self.assertEqual(r.returncode,2);self.assertEqual(self.cursor.read_text(),'old\n');self.assertIn('СЛЕПОТА',r.stdout)
    def test_print_only_preserves_cursor_and_channel(self):
        self.setup_window([self.row()]);r=self.watch('--tolko-pechat')
        self.assertEqual(r.returncode,0);self.assertEqual(self.cursor.read_text(),'old\n');self.assertFalse((self.d/'channel-call').exists())
    def test_unknown_watch_flags_refuse(self):
        self.setup_window([])
        for x in ('--dry-run','-n','--check'):
            self.assertEqual(self.watch(x).returncode,2)
        self.assertEqual(self.cursor.read_text(),'old\n')
    def test_trimmer_keeps_inode_permissions(self): f.AlertTests.test_trimmer_preserves_inode_permissions(self)

if __name__=='__main__': unittest.main(verbosity=2)
