#!/usr/bin/env python3
"""Real candidate, fake Telegram/logger, private files; no real list/token/spool."""
import hashlib,json,os,shutil,subprocess,tempfile,unittest,runpy,pwd
from unittest.mock import patch
from pathlib import Path
ROOT=Path(os.environ.get('TREVOGI_TEST_ROOT',Path(__file__).resolve().parents[1]))
class Recipients(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='trevogi-adresaty-');self.addCleanup(self.tmp.cleanup);self.d=Path(self.tmp.name);self.d.chmod(0o755)
  (self.d/'bin').mkdir(mode=0o755);subject=self.d/'subject';(subject/'bin').mkdir(parents=True);(subject/'lib/dsh-trevogi').mkdir(parents=True)
  for p in [subject,subject/'bin',subject/'lib',subject/'lib/dsh-trevogi']:p.chmod(0o755)
  self.alert=subject/'bin/agent-alert';shutil.copyfile(ROOT/'bin/agent-alert',self.alert);self.alert.chmod(0o755);shutil.copyfile(ROOT/'bin/agent-alert-otpravitel',subject/'bin/agent-alert-otpravitel')
  for p in (ROOT/'lib/dsh-trevogi').glob('*.py'):shutil.copyfile(p,subject/'lib/dsh-trevogi'/p.name);(subject/'lib/dsh-trevogi'/p.name).chmod(0o644)
  for name,text in [('token','TEST_ONLY_RECIPIENTS'),('chat','111111\n'),('config','# own fixture\n'),('calls',''),('journal',''),('tail','')]:p=self.d/name;p.write_text(text);p.chmod(0o666 if name in('calls','journal','tail')else 0o644)
  self.list=self.d/'spisok';self.env={k:v for k,v in os.environ.items()if not k.startswith(('AGENT_ALERT_','DSH_TREVOGI_','DSH_PROBA'))};self.env.update(PATH=str(self.d/'bin')+':'+os.environ['PATH'],FIXTURE=str(self.d),DSH_PROBA='0',DSH_TREVOGI_CONFIG=str(self.d/'config'),AGENT_ALERT_TOKEN_FILE=str(self.d/'token'),AGENT_ALERT_CHAT_FILE=str(self.d/'chat'),AGENT_ALERT_OWNER_CHAT_ID='222222',AGENT_ALERT_SPISOK_FILE=str(self.list),AGENT_ALERT_HVOST=str(self.d/'tail'),AGENT_ALERT_SPUL=str(self.d/'missing-spool'),AGENT_ALERT_PAUZY='0 0',AGENT_ALERT_TAJMAUT='1')
  stubs={'logger':"import os,sys\nwith open(os.environ['FIXTURE']+'/journal','a')as f:f.write(' '.join(sys.argv[1:])+'\\n')\n",'systemctl':'pass\n','curl':"import sys,os,json\nsys.stdin.read();a=sys.argv[1:];chat=next(v[8:]for v in a if v.startswith('chat_id='))\nwith open(os.environ['FIXTURE']+'/calls','a')as f:f.write(json.dumps({'chat':chat,'text':next(v[5:]for v in a if v.startswith('text='))})+'\\n')\nseen=sum(json.loads(line)['chat']==chat for line in open(os.environ['FIXTURE']+'/calls'))\ntransient=os.environ.get('TRANSIENT_PLAN') and (chat=='-7001' or seen==1)\nprint(json.dumps({'ok':False,'error_code':500 if transient else 400,'description':'fixture refusal'})if transient or chat==os.environ.get('REFUSE_CHAT')else '{\"ok\":true}')\n"}
  for name,body in stubs.items():p=self.d/'bin'/name;p.write_text('#!/usr/bin/python3\n'+body);p.chmod(0o755)
 def run_alert(self,nobody=False):
  cmd=[str(self.alert),'--plain','Синтетическая тревога']
  if nobody and os.geteuid()==0:cmd=['setpriv','--reuid=65534','--regid=65534','--clear-groups',*cmd]
  return subprocess.run(cmd,env=self.env,capture_output=True,text=True,timeout=15)
 def sent(self):return [json.loads(line)['chat']for line in(self.d/'calls').read_text().splitlines()]
 def reset(self):
  for name in('calls','journal','tail'):(self.d/name).write_text('')
 def calls(self):return [json.loads(line)for line in(self.d/'calls').read_text().splitlines()]
 def assert_owners_only(self,q,warning=False):
  self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222']*(2 if warning else 1))
  for row in self.calls()[:2]:self.assertIn('Синтетическая тревога',row['text'])
  if warning:
   for row in self.calls()[2:]:self.assertIn('список привратника отвергнут:',row['text'])
 def test_missing_file_keeps_all_owners(self):self.assert_owners_only(self.run_alert())
 def test_empty_file_keeps_all_owners(self):self.list.write_text('');self.assert_owners_only(self.run_alert())
 def test_comments_and_blank_lines_keep_all_owners(self):self.list.write_text('# heading\n\n # comment\n');self.assert_owners_only(self.run_alert())
 def test_valid_guests_are_additional_after_both_owners(self):
  self.list.write_text('-333333\n444444\n555555\n');q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','-333333','444444','555555'])
 def test_any_bad_line_rejects_every_guest_and_alerts_owners(self):
  self.list.write_text('-333333\nBAD_ROW\n444444\n');q=self.run_alert();self.assert_owners_only(q,warning=True);self.assertIn('BAD_ROW',q.stderr+(self.d/'journal').read_text())
 def test_strict_id_boundaries_whitespace_and_plus(self):
  for bad in ['1234','1234567890123456','+12345',' 12345','12345 ','1.2345','abcde']:
   with self.subTest(bad=bad):self.reset();self.list.write_text(bad+'\n');self.assert_owners_only(self.run_alert(),warning=True)
 def test_five_and_fifteen_digit_ids_and_negative(self):
  self.list.write_text('12345\n-123456789012345\n');q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','12345','-123456789012345'])
 def test_symlink_rejected_without_guests(self):
  target=self.d/'target';target.write_text('333333\n');self.list.symlink_to(target);q=self.run_alert();self.assert_owners_only(q,warning=True);self.assertIn('ссылка',q.stderr+(self.d/'journal').read_text())
 def test_foreign_owner_rejected(self):
  self.list.write_text('333333\n')
  if os.geteuid()==0:os.chown(self.list,65534,65534)
  else:subprocess.run(['sudo','-n','chown','65534:65534',str(self.list)],check=True)
  q=self.run_alert();self.assert_owners_only(q,warning=True);self.assertIn('владелец',q.stderr+(self.d/'journal').read_text())
 def test_root_owned_file_is_allowed(self):
  self.list.write_text('333333\n')
  if os.geteuid()!=0:subprocess.run(['sudo','-n','chown','0:0',str(self.list)],check=True)
  q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333'])
 def test_unreadable_keeps_owner_alert_and_rejection_alert(self):
  self.list.write_text('333333\n');self.list.chmod(0o000);q=self.run_alert(nobody=True);self.assert_owners_only(q,warning=True);self.assertIn('PermissionError',q.stderr+(self.d/'journal').read_text())
 def test_guest_refusal_does_not_change_owner_success(self):
  self.list.write_text('333333\n444444\n');self.env['REFUSE_CHAT']='333333';q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333','444444']);j=(self.d/'journal').read_text();self.assertRegex(j,'исход=отказ-телеграма[^\n]*адресат=333333');self.assertIn('итог=доставлено',j)
 def test_owner_refusal_is_failure_even_if_all_guests_delivered(self):
  self.list.write_text('333333\n');self.env['REFUSE_CHAT']='111111';q=self.run_alert();self.assertEqual(q.returncode,1,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333']);self.assertIn('итог=не-доставлено',(self.d/'journal').read_text())
 def test_bad_list_healthy_damage_exact_return(self):
  raw=b'333333\n444444\n';self.list.write_bytes(raw);q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333','444444']);bad=raw+b'BAD_LIST_DAMAGE\n';self.list.write_bytes(bad);self.assertEqual(self.list.read_bytes().count(b'BAD_LIST_DAMAGE'),1);print('DAMAGE list count=1 before='+hashlib.sha256(raw).hexdigest()+' after='+hashlib.sha256(bad).hexdigest(),flush=True);self.reset();self.assert_owners_only(self.run_alert(),warning=True);self.list.write_bytes(raw);self.reset();q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333','444444']);print('SIGHT healthy GREEN -> rejected (owners safe) -> exact return GREEN',flush=True)
 def test_second_owner_config_then_env_precedence(self):
  self.env.pop('AGENT_ALERT_OWNER_CHAT_ID');(self.d/'config').write_text('AGENT_ALERT_OWNER_CHAT_ID=222222\n');self.assert_owners_only(self.run_alert());self.reset();self.env['AGENT_ALERT_OWNER_CHAT_ID']='999999';q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','999999'])
 def test_default_list_path_under_private_namespace(self):
  self.list.write_text('333333\n');env=dict(self.env);env.pop('AGENT_ALERT_SPISOK_FILE');cmd=['bwrap','--die-with-parent','--unshare-net','--ro-bind','/','/','--bind',str(self.d),str(self.d),'--tmpfs','/var/lib','--dir','/var/lib/alert-privratnik','--ro-bind',str(self.list),'/var/lib/alert-privratnik/spisok','--dev','/dev','--',str(self.alert),'--plain','Синтетическая тревога'];q=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=15);self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333'])
 def test_fifty_valid_rows_are_allowed(self):
  guests=[str(600000+i)for i in range(1,51)];self.list.write_text('\n'.join(guests)+'\n');q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222']+guests)
 def test_fifty_one_valid_rows_reject_whole_file(self):
  self.list.write_text(''.join(str(600000+i)+'\n'for i in range(1,52)));q=self.run_alert();self.assert_owners_only(q,warning=True);self.assertIn('больше 50 валидных строк',q.stderr+(self.d/'journal').read_text())
 def test_duplicate_rows_count_before_dedup_for_limit(self):
  self.list.write_text('333333\n'*51);q=self.run_alert();self.assert_owners_only(q,warning=True);self.assertIn('больше 50 валидных строк',q.stderr+(self.d/'journal').read_text())
 def test_guest_duplicates_send_once_in_first_seen_order(self):
  self.list.write_text('333333\n444444\n333333\n000333333\n444444\n');q=self.run_alert();self.assertEqual(q.returncode,0,q.stderr);self.assertEqual(self.sent(),['111111','222222','333333','444444'])
 def test_missing_primary_still_sends_secondary_and_worker_names_reason(self):
  (self.d/'chat').unlink();request=self.d/'missing-primary.msg';request.write_text('format=plain\nistochnik=fixture\n\nСинтетическая тревога');env=dict(self.env,AGENT_ALERT_OTPRAVKA_BIN=str(self.alert))
  with patch.dict(os.environ,env,clear=True):
   n=runpy.run_path(str(self.alert.parent/'agent-alert-otpravitel'));quota=n['Kvota'](str(self.d/'quota.json'),2,2);code,reason,_=n['obrabotat'](str(request),quota)
  self.assertEqual(code,1);self.assertEqual(self.sent(),['222222']);self.assertIn('основной хозяин',reason);self.assertIn(str(self.d/'chat'),reason);self.assertIn('основной хозяин',(self.d/'journal').read_text())
 def test_quota_counts_two_alerts_not_ten_deliveries(self):
  self.list.write_text('333333\n444444\n555555\n');request=self.d/'request.msg';request.write_text('format=plain\nistochnik=fixture\n\nСинтетическая тревога')
  if os.geteuid()==0:os.chown(request,pwd.getpwnam('coders').pw_uid,-1)
  env=dict(self.env,AGENT_ALERT_OTPRAVKA_BIN=str(self.alert))
  with patch.dict(os.environ,env,clear=True):
   n=runpy.run_path(str(self.alert.parent/'agent-alert-otpravitel'));quota=n['Kvota'](str(self.d/'quota.json'),2,2)
   for _ in range(2):
    code,_,uid=n['obrabotat'](str(request),quota);self.assertEqual(code,0);self.assertNotEqual(uid,0)
   self.assertEqual(len(json.loads((self.d/'quota.json').read_bytes())[str(uid)]['t']),2)
  self.assertEqual(self.sent(),['111111','222222','333333','444444','555555']*2)
if __name__=='__main__':unittest.main(verbosity=2)
