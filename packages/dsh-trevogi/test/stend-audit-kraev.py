#!/usr/bin/env python3
"""A-N-1948 module09: real executables, private files and network/journal doubles."""
import importlib.util,json,os,pathlib,subprocess,unittest
spec=importlib.util.spec_from_file_location('fixture',pathlib.Path(__file__).with_name('stend-nastroek-proby.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Edges(unittest.TestCase):
 setUp=f.AlertTests.setUp;tearDown=f.AlertTests.tearDown;runmod=f.AlertTests.runmod;config=f.AlertTests.config
 def sent(self):
  return [dict((a.split('=',1) for a in row if a.startswith(('text=','parse_mode=')))) for row in map(json.loads,(self.d/'argv').read_text().splitlines())]
 def response_sequence(self,responses):
  (self.d/'responses').write_text(json.dumps(responses));p=self.d/'bin/curl';p.write_text('#!/usr/bin/env python3\nimport json,os,sys,pathlib\nd=pathlib.Path(os.environ["FIXTURE"]);n=int((d/"count").read_text()) if (d/"count").exists() else 0;(d/"count").write_text(str(n+1));r=json.loads((d/"responses").read_text());print(r[min(n,len(r)-1)]);sys.stdin.read()\n');p.chmod(0o755)
  p=self.d/'bin/sleep';p.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$FIXTURE/sleeps"\n');p.chmod(0o755)
 def test_01_nested_closures_in_reverse_order(self):
  self.env['AGENT_ALERT_PREDEL']='100';r=self.runmod(args=('<b><i>'+('x'*500)+'</i></b>',));self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertIn('</i></b>\n',self.sent()[0]['text']);self.assertNotIn('</b></i>',self.sent()[0]['text'])
 def test_02_telegram_extended_tags_closed(self):
  self.env['AGENT_ALERT_PREDEL']='100'
  for tag,opening in [('blockquote','<blockquote expandable>'),('tg-spoiler','<tg-spoiler>'),('span','<span class="tg-spoiler">'),('tg-emoji','<tg-emoji emoji-id="123">')]:
   with self.subTest(tag=tag):
    if (self.d/'argv').exists():(self.d/'argv').unlink()
    r=self.runmod(args=(opening+'x'*500+'</'+tag+'>',));self.assertEqual(r.returncode,0);self.assertIn('</'+tag+'>\n',self.sent()[0]['text'])
 def test_03_502_then_success_retried(self):
  self.response_sequence(['502 Bad Gateway\n502','{"ok":true}\n200']);r=self.runmod();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual((self.d/'count').read_text(),'2')
 def test_03_429_retry_after_used(self):
  self.response_sequence(['{"ok":false,"error_code":429,"parameters":{"retry_after":7}}\n429','{"ok":true}\n200']);r=self.runmod();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual((self.d/'sleeps').read_text(),'7\n')
 def test_03_exhaustion_stops_at_attempt_limit(self):
  self.response_sequence(['{"ok":false,"error_code":503}\n503']);r=self.runmod();self.assertEqual(r.returncode,1);self.assertEqual((self.d/'count').read_text(),'3')
 def test_03_retry_after_over_ceiling_refuses(self):
  self.response_sequence(['{"ok":false,"error_code":429,"parameters":{"retry_after":301}}\n429']);r=self.runmod();self.assertEqual(r.returncode,1);self.assertEqual((self.d/'count').read_text(),'1');self.assertIn('300',r.stdout+r.stderr);self.assertFalse((self.d/'sleeps').exists())
 def test_08_config_trailing_space_rejected(self):
  self.env.pop('AGENT_ALERT_HVOST');self.config('AGENT_ALERT_HVOST='+str(self.d/'tail')+' \n');r=self.runmod();self.assertEqual(r.returncode,2);self.assertFalse((self.d/'argv').exists())
 def test_09_equal_suffix_preserved(self):
  p=self.d/'tail=';p.write_text('');self.env['AGENT_ALERT_HVOST']=str(p);r=self.runmod();self.assertEqual(r.returncode,0);self.assertTrue(p.read_text());self.assertEqual((self.d/'tail').read_text(),'')
 def test_10_sender_help_is_not_option_refusal(self):
  r=self.runmod(args=('--help',));self.assertEqual(r.returncode,0);self.assertNotIn('исход=отказ-ключ',(self.d/'log').read_text())
 def test_13_trimming_preserves_blank_lines(self):
  p=self.d/'tail';p.write_text('one\ntwo\n\n\n');self.env['AGENT_ALERT_HVOST_STROK']='3';r=self.runmod('agent-alert-hvost-obrezka',());self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual(p.read_bytes(),b'two\n\n\n')
 def test_20_world_readable_token_check_refused(self):
  (self.d/'token').chmod(0o644);r=self.runmod(args=('--proverit-nastrojku',));self.assertEqual(r.returncode,2);self.assertIn('токен',r.stdout)
 def window(self):
  self.cursor=self.d/'state/cursor';self.cursor.parent.mkdir();self.cursor.write_text('old\n');(self.d/'journal').write_text(json.dumps(dict(MESSAGE='исход=отказ-ключ аргумент=--check',__CURSOR='new',__REALTIME_TIMESTAMP='1000000',_UID='123'))+'\n');self.channel=self.d/'bin/channel';self.channel.write_text('#!/bin/sh\necho called >> "$FIXTURE/channel-count"\nexit 0\n');self.channel.chmod(0o755)
 def watch(self,*args):return self.runmod('otkaz-klyuch-watch',('--kursor',str(self.cursor),'--kanal',str(self.channel),*args))
 def test_05_cursor_directory_is_blind_without_traceback(self):
  self.window();self.cursor.unlink();self.cursor.mkdir();r=self.watch();self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr);self.assertFalse((self.d/'channel-count').exists())
 def test_05_cursor_parent_file_is_blind_without_traceback(self):
  self.window();self.cursor.unlink();self.cursor.parent.rmdir();self.cursor.parent.write_text('not-directory');r=self.watch();self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr)
 def test_05_sent_but_cursor_failed_is_not_resent(self):
  self.window();self.channel.write_text('#!/bin/sh\necho called >> "$FIXTURE/channel-count"\nrm "$FIXTURE/state/cursor"\nmkdir "$FIXTURE/state/cursor"\nexit 0\n');self.channel.chmod(0o755);r=self.watch();self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr);self.assertIn('курс',r.stdout+r.stderr);r=self.watch();self.assertEqual(r.returncode,2);self.assertEqual((self.d/'channel-count').read_text().splitlines(),['called']);self.cursor.rmdir();r=self.watch();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual(self.cursor.read_text(),'new\n');self.assertEqual((self.d/'channel-count').read_text().splitlines(),['called'])
 def test_06_blind_journal_missing_channel_has_no_traceback(self):
  self.window();self.env['JOURNAL_FAIL']='1';self.channel.unlink();r=self.watch();self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr)
 def test_11_watcher_help_zero(self):
  r=self.runmod('otkaz-klyuch-watch',('--help',));self.assertEqual(r.returncode,0)
 def test_missing_library_is_blind_not_traceback(self):
  import shutil
  p=self.d/'isolated/bin';p.mkdir(parents=True);shutil.copy2(f.ROOT/'bin/otkaz-klyuch-watch',p/'otkaz-klyuch-watch');r=subprocess.run([str(p/'otkaz-klyuch-watch')],env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stderr)
 def public_copy(self):
  import shutil
  p=self.d/'subject';shutil.copytree(f.ROOT,p)
  self.d.chmod(0o755)
  for d in p.rglob('*'):
   if d.is_dir():d.chmod(0o755)
  p.chmod(0o755);return p
 def nobody(self,script,*args):
  return subprocess.run(['sudo','-n','setpriv','--reuid=65534','--regid=65534','--clear-groups','env',*[k+'='+v for k,v in self.env.items() if k.startswith(('AGENT_ALERT_','OTKAZ_KLYUCH_','DSH_TREVOGI_','FIXTURE','PATH'))],str(script),*args],capture_output=True,text=True,timeout=10)
 def test_04_unreadable_tail_is_blind_and_unchanged(self):
  p=self.public_copy();tail=self.d/'tail';tail.write_text('one\ntwo\nthree\n');tail.chmod(0o622);before=tail.read_bytes();self.env['AGENT_ALERT_HVOST_STROK']='1'
  r=self.nobody(p/'bin/agent-alert-hvost-obrezka');self.assertEqual(r.returncode,2,r.stdout+r.stderr);self.assertIn('не читается',r.stdout);self.assertEqual(tail.read_bytes(),before)
 def test_05_initial_cursor_write_fault_no_channel(self):
  import grp
  self.window();p=self.public_copy();self.cursor.unlink();self.cursor.parent.chmod(0o555)
  try:
   gid=grp.getgrnam('systemd-journal').gr_gid
   r=subprocess.run(['sudo','-n','setpriv','--reuid=65534','--regid='+str(gid),'--clear-groups','env',*[k+'='+v for k,v in self.env.items() if k.startswith(('AGENT_ALERT_','OTKAZ_KLYUCH_','DSH_TREVOGI_','FIXTURE','PATH'))],str(p/'bin/otkaz-klyuch-watch'),'--kursor',str(self.cursor),'--kanal',str(self.channel)],capture_output=True,text=True,timeout=10)
   self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr);self.assertIn('PermissionError',r.stdout);self.assertFalse((self.d/'channel-count').exists())
  finally:self.cursor.parent.chmod(0o755)
 def test_05_unknown_delivery_never_replayed(self):
  self.window();self.channel.write_text('#!/bin/sh\necho called >> "$FIXTURE/channel-count"\nexit 1\n');self.channel.chmod(0o755)
  r=self.watch();self.assertEqual(r.returncode,2);r=self.watch();self.assertEqual(r.returncode,2);self.assertIn('доставка неизвестна',r.stdout);self.assertEqual((self.d/'channel-count').read_text().splitlines(),['called'])
 def test_05_concurrent_cursor_owner_refused(self):
  import fcntl
  self.window()
  with self.cursor.with_name('cursor.lock').open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);r=self.watch();self.assertEqual(r.returncode,2);self.assertIn('другой читатель',r.stdout);self.assertFalse((self.d/'channel-count').exists())
 def test_22_unprivileged_empty_journal_not_green(self):
  self.window();(self.d/'journal').write_text('');p=self.public_copy();r=self.nobody(p/'bin/otkaz-klyuch-watch','--kursor',str(self.cursor),'--kanal',str(self.channel),'--tolko-pechat');self.assertEqual(r.returncode,2,r.stdout+r.stderr);self.assertIn('нет подтверждённых прав',r.stdout);self.assertNotIn('Traceback',r.stdout+r.stderr)
 def test_03_success_with_json_whitespace(self):
  self.response_sequence(['{ "ok": true }\n200']);r=self.runmod();self.assertEqual(r.returncode,0,r.stdout+r.stderr)
 def test_03_nested_ok_cannot_claim_delivery(self):
  self.response_sequence(['{"ok":false,"metadata":{"ok":true},"error_code":400}\n400']);r=self.runmod();self.assertEqual(r.returncode,1);self.assertEqual((self.d/'count').read_text(),'1')
 def test_09_trimmer_equal_suffix_preserved(self):
  p=self.d/'tail=';p.write_text('one\ntwo\nthree\n');self.env['AGENT_ALERT_HVOST']=str(p);self.env['AGENT_ALERT_HVOST_STROK']='2';r=self.runmod('agent-alert-hvost-obrezka',());self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual(p.read_bytes(),b'two\nthree\n')
 def test_01_attribute_angle_does_not_leave_unfinished_tag(self):
  self.env['AGENT_ALERT_PREDEL']='50';r=self.runmod(args=('<a href="https://example.test/?q=>'+('x'*100)+'">'+('z'*500)+'</a>',));self.assertEqual(r.returncode,0);self.assertNotIn('<a href=',self.sent()[0]['text'])
 def test_22_primary_journal_group_accepted(self):
  import grp,pwd
  self.window();p=self.public_copy();u=pwd.getpwuid(os.getuid() if os.geteuid()!=0 else 65534);g=grp.getgrnam('systemd-journal').gr_gid
  r=subprocess.run(['sudo','-n','setpriv','--reuid='+str(u.pw_uid),'--regid='+str(g),'--clear-groups','env',*[k+'='+v for k,v in self.env.items() if k.startswith(('AGENT_ALERT_','OTKAZ_KLYUCH_','DSH_TREVOGI_','FIXTURE','PATH'))],str(p/'bin/otkaz-klyuch-watch'),'--kursor',str(self.cursor),'--kanal',str(self.channel),'--tolko-pechat'],capture_output=True,text=True,timeout=10)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)
 def test_06_channel_nonutf8_output_does_not_erase_success(self):
  self.window();self.channel.write_text('#!/usr/bin/env python3\nimport os\nos.write(1,b"\\xff")\n');self.channel.chmod(0o755);r=self.watch();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual(self.cursor.read_text(),'new\n')
 def test_06_logger_nonutf8_output_no_traceback(self):
  self.window();(self.d/'journal').write_text('');p=self.d/'bin/logger';p.write_text('#!/usr/bin/env python3\nimport os\nos.write(1,b"\\xff")\n');p.chmod(0o755);r=self.watch();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertNotIn('Traceback',r.stdout+r.stderr)
 def test_06_journal_invalid_utf8_is_blind(self):
  self.window();p=self.d/'bin/journalctl';p.write_text('#!/usr/bin/env python3\nimport os\nos.write(1,b"\\xff")\n');p.chmod(0o755);r=self.watch();self.assertEqual(r.returncode,2);self.assertNotIn('Traceback',r.stdout+r.stderr);self.assertEqual(self.cursor.read_text(),'old\n')
 def test_03_all_5xx_body_codes_retried(self):
  self.response_sequence(['{"ok":false,"error_code":501}\n200','{"ok":true}\n200']);r=self.runmod();self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertEqual((self.d/'count').read_text(),'2')
 def test_12_incomplete_reader_cannot_activate_fallback(self):
  p=self.d/'bin/python3';p.write_text('#!/bin/sh\nprintf "AGENT_ALERT_HVOST_STROK=2\\n"\n');p.chmod(0o755);tail=self.d/'tail';tail.write_text('one\ntwo\nthree\n');before=tail.read_bytes();r=self.runmod('agent-alert-hvost-obrezka',());self.assertEqual(r.returncode,2,r.stdout+r.stderr);self.assertEqual(tail.read_bytes(),before)
if __name__=='__main__':unittest.main(verbosity=2)
