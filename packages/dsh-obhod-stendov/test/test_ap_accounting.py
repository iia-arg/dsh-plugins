"""Actual readonly SQLite and process/config fixtures; no live credentials."""
from datetime import datetime,timezone
import hashlib,importlib.util,json,os,shutil,sqlite3,subprocess,tempfile,time,unittest
from pathlib import Path
from unittest import mock
import test_g_journal_size as legacy
MODULE=Path(__file__).with_name('stend-ap-accounting.py')
NOW=1792280000
class Accounting(unittest.TestCase):
 def setUp(self):
  self.assertTrue(MODULE.is_file(),'night accounting stand is missing')
  spec=importlib.util.spec_from_file_location('ap_accounting',MODULE);self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.db=self.root/'mail.sqlite'
 def database(self,count=0):
  with sqlite3.connect(self.db) as db:
   db.execute('CREATE TABLE usage_registrations(run_id TEXT PRIMARY KEY, accepted_at REAL NOT NULL)');db.executemany('INSERT INTO usage_registrations VALUES(?,?)',[(str(x),NOW-100-x) for x in range(count)])
 def queue(self):return self.m.queue_line(self.db,NOW)
 def test_missing_db_is_blind_and_no_table_is_no_subject_without_creation(self):
  rc,out=self.queue();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out);self.assertNotIn('COUNT=0',out);self.assertFalse(self.db.exists())
  with sqlite3.connect(self.db) as db:db.execute('CREATE TABLE other(x)')
  rc,out=self.queue();self.assertEqual(rc,0,out);self.assertIn('нет предмета',out);self.assertNotIn('COUNT=0',out)
 def test_empty_existing_queue_is_measured_zero(self):
  self.database();rc,out=self.queue();self.assertEqual(rc,0,out);self.assertIn('COUNT=0',out);self.assertIn('accepted_at=NULL..NULL',out)
 def test_queue_64_warns_and_return_to_63_is_green(self):
  self.database(63);rc,out=self.queue();self.assertEqual(rc,0,out)
  with sqlite3.connect(self.db) as db:db.execute('INSERT INTO usage_registrations VALUES(?,?)',('extra',NOW-1))
  actual=subprocess.check_output(['sqlite3','-readonly',str(self.db),'SELECT COUNT(*) FROM usage_registrations;'],text=True).strip();self.assertEqual(actual,'64');print('QUEUE-PORCHA SQLCOUNT=64',flush=True)
  rc,out=self.queue();self.assertEqual(rc,1,out);self.assertIn('COUNT=64',out);self.assertIn('ЖЁЛТОЕ',out);self.assertIn('MIN accepted_at='+str(NOW-162),out);self.assertIn('MAX accepted_at='+str(NOW-1),out)
  with sqlite3.connect(self.db) as db:db.execute('DELETE FROM usage_registrations WHERE run_id=?',('extra',))
  self.assertEqual(self.queue()[0],0)
 def test_corrupt_database_and_missing_column_are_blind(self):
  self.db.write_bytes(b'not a sqlite database');self.assertEqual(self.queue()[0],2);self.db.unlink()
  with sqlite3.connect(self.db) as db:db.execute('CREATE TABLE usage_registrations(x)')
  self.assertEqual(self.queue()[0],2)
 def test_nonnumeric_negative_or_future_accepted_at_is_blind(self):
  self.database(1)
  for value in ['not-time',-1,NOW+1]:
   with sqlite3.connect(self.db) as db:db.execute('UPDATE usage_registrations SET accepted_at=?',(value,))
   with self.subTest(value=value):self.assertEqual(self.queue()[0],2)
 def test_nightly_transports_accounting_rows_even_when_green(self):
  source=(MODULE.parent.parent/'dorabotki/vse-stendy-boevye.sh').read_text();a=source.index('    printf',source.index('    case "$s" in',source.index('    progress running "$s"')));b=source.index('    # B-N-2062',a)
  rows='STEND-AP-METRIC: ОЧЕРЕДЬ · ЗЕЛЁНОЕ · COUNT=0\nSTEND-AP-METRIC: КАРТА · FAIL ЖЁЛТОЕ · карта устарела\n'
  q=subprocess.run(['bash','-c','out=$1\n'+source[a:b],'_',rows],capture_output=True,text=True,check=True);self.assertEqual(q.stdout.splitlines(),rows.splitlines())
 def test_readonly_queue_does_not_change_database(self):
  self.database(2);before=self.db.read_bytes();self.assertEqual(self.queue()[0],0);self.assertEqual(self.db.read_bytes(),before)
 def test_wal_without_shm_never_writes_beside_database(self):
  live=self.root/'live.sqlite';db=sqlite3.connect(live);self.addCleanup(db.close);db.execute('PRAGMA journal_mode=WAL');db.execute('CREATE TABLE usage_registrations(run_id,accepted_at)');db.execute('INSERT INTO usage_registrations VALUES(?,?)',('wal-row',NOW-1));db.commit()
  shutil.copyfile(live,self.db);shutil.copyfile(str(live)+'-wal',str(self.db)+'-wal');before={f.name for f in self.root.iterdir()};hashes={f.name:f.read_bytes() for f in self.root.iterdir()}
  rc,out=self.queue();self.assertEqual({f.name for f in self.root.iterdir()},before);self.assertEqual({f.name:f.read_bytes() for f in self.root.iterdir()},hashes);self.assertIn(rc,[0,2],out)
  if rc==0:self.assertIn('COUNT=1',out)
 def test_no_subject_rechecks_database_identity(self):
  with sqlite3.connect(self.db) as db:db.execute('CREATE TABLE other(x)')
  replacement=self.root/'replacement.sqlite'
  with sqlite3.connect(replacement) as db:db.execute('CREATE TABLE usage_registrations(accepted_at REAL)');db.executemany('INSERT INTO usage_registrations VALUES(?)',[(NOW-1,)]*64)
  real=self.m.subprocess.run;calls=[]
  def change(*args,**kwargs):
   result=real(*args,**kwargs)
   if 'sqlite_master' in args[0][-1]:
    calls.append(True)
    if len(calls)==2:os.replace(replacement,self.db)
   return result
  with mock.patch.object(self.m.subprocess,'run',side_effect=change):self.assertEqual(self.queue()[0],2)
 def status_fixture(self):
  self.status_parent=self.root/'statuses';self.status_parent.mkdir(mode=0o700);self.status_dir=self.status_parent/'registrations';self.status_dir.mkdir(mode=0o700)
 def status(self,name,accepted=NOW-60,state='UNBOUND',terminal=True,reason='AMBIGUOUS'):
  iso=lambda seconds:datetime.fromtimestamp(seconds,timezone.utc).isoformat()
  row=dict(schemaVersion=1,runId=name,projectRef='a'*64,requestSHA256='b'*64,state=state,reason=reason if state=='UNBOUND' else None,startedAt=iso(accepted-1),acceptedAt=iso(accepted),registeredAt=iso(NOW) if state=='REGISTERED' else None,checkedAt=iso(NOW),terminal=terminal,retryUntil=None if terminal else iso(accepted+180))
  path=self.status_dir/(name+'.json');path.write_text(json.dumps(row));path.chmod(0o644);return path
 def unbound_line(self):
  script="import importlib.util,json;spec=importlib.util.spec_from_file_location('probe',"+repr(str(MODULE))+");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps(m.unbound_line(now="+str(NOW)+"),ensure_ascii=False))"
  q=subprocess.run(['bwrap','--die-with-parent','--ro-bind','/','/','--unshare-net','--ro-bind',str(self.status_parent),'/var/lib/autopilot-usage','python3','-I','-B','-c',script],capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,0,q.stderr);return json.loads(q.stdout)
 def test_unbound_groups_current_terminal_requests_by_accepted_at(self):
  self.status_fixture();self.status('amb');self.status('budget',reason='BUDGET_EXCEEDED');self.status('retry',reason='REGISTRATION_RETRY_EXPIRED');self.status('pending',terminal=False,reason='REGISTRATION_SOURCE_LAG');self.status('registered',state='REGISTERED');self.status('old',accepted=NOW-90000)
  rc,out=self.unbound_line();self.assertEqual(rc,0,out);self.assertIn('AMBIGUOUS=1',out);self.assertIn('BUDGET_EXCEEDED=1',out);self.assertIn('REGISTRATION_RETRY_EXPIRED=1',out);self.assertNotIn('REGISTRATION_SOURCE_LAG=',out);self.assertIn('по acceptedAt',out);self.assertIn('3 из 5',out)
  self.assertIn('принятые за 24 ч заявки, сейчас конечные UNBOUND (по причинам)',out)
 def test_unbound_9_of_one_reason_warns_and_restore8_is_green(self):
  self.status_fixture()
  for i in range(8):self.status('amb'+str(i))
  self.assertEqual(self.unbound_line()[0],0);file=self.status('amb8');self.assertEqual(subprocess.check_output(['grep','-cF','"reason": "AMBIGUOUS"',str(file)],text=True).strip(),'1');before=len(list(self.status_dir.glob('*.json')));self.assertEqual(before,9);print('UNBOUND-PORCHA files=9 grepF-AMBIGUOUS=1 newSHA='+hashlib.sha256(file.read_bytes()).hexdigest(),flush=True)
  rc,out=self.unbound_line();self.assertEqual(rc,1,out);self.assertIn('FAIL ЖЁЛТОЕ',out);self.assertIn('AMBIGUOUS=9',out);file.unlink();self.assertEqual(self.unbound_line()[0],0)
 def test_old_request_completed_today_is_excluded_and_boundary_is_strict(self):
  self.status_fixture();self.status('old',accepted=NOW-86401);self.status('boundary',accepted=NOW-86400);self.status('inside',accepted=NOW-86400+0.001)
  rc,out=self.unbound_line();self.assertEqual(rc,0,out);self.assertIn('AMBIGUOUS=1',out);self.assertIn('1 из 1',out);self.assertIn('старые заявки, ставшие terminal сегодня, вне окна',out)
 def test_unbound_absent_directory_is_blind_existing_empty_is_measured_zero(self):
  self.status_fixture();rc,out=self.unbound_line();self.assertEqual(rc,0,out);self.assertIn('0 из 0',out);self.status_dir.rmdir();rc,out=self.unbound_line();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out)
 def test_unbound_unknown_schema_or_unsafe_file_never_gives_partial_green(self):
  self.status_fixture();file=self.status('case');good=file.read_bytes()
  for field,value in [('schemaVersion',True),('terminal',1),('acceptedAt','not-a-date'),('acceptedAt',datetime.fromtimestamp(NOW+1,timezone.utc).isoformat()),('reason','body could contain data')]:
   row=json.loads(good);row[field]=value;file.write_text(json.dumps(row));self.assertEqual(self.unbound_line()[0],2);file.write_bytes(good)
  file.chmod(0o666);self.assertEqual(self.unbound_line()[0],2);file.chmod(0o644);self.assertEqual(self.unbound_line()[0],0)
 def test_unbound_malformed_auxiliary_dates_and_pending_form_are_blind_then_restore(self):
  self.status_fixture();file=self.status('case');good=file.read_bytes();self.assertEqual(self.unbound_line()[0],0)
  cases=[('checkedAt',dict(checkedAt='not-a-date')),('startedAt',dict(startedAt={})),('registeredAt',dict(state='REGISTERED',reason=None,registeredAt='garbage')),('pending-no-deadline',dict(terminal=False,reason='REGISTRATION_SOURCE_LAG',retryUntil=None)),('pending-wrong-reason',dict(terminal=False,reason='AMBIGUOUS',retryUntil=datetime.fromtimestamp(NOW+120,timezone.utc).isoformat()))]
  for label,fields in cases:
   row=json.loads(good);row.update(fields);file.write_text(json.dumps(row));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);field=next(iter(fields));needle=json.dumps(field)+': '+json.dumps(row[field]);self.assertEqual(subprocess.check_output(['grep','-cF',needle,str(file)],text=True).strip(),'1');print('STATUS-SCHEMA-PORCHA '+label+' grepF=1 SHA='+before+'->'+after,flush=True)
   with self.subTest(label=label):self.assertEqual(self.unbound_line()[0],2)
   file.write_bytes(good);self.assertEqual(self.unbound_line()[0],0)
 def test_unbound_legacy_without_terminal_or_broken_json_is_incomplete(self):
  self.status_fixture();file=self.status('legacy');good=file.read_bytes();self.assertEqual(self.unbound_line()[0],0)
  row=json.loads(good);del row['terminal'];del row['retryUntil'];file.write_text(json.dumps(row));self.assertEqual(self.unbound_line()[0],2)
  file.write_bytes(b'{broken json');self.assertEqual(self.unbound_line()[0],2);file.write_bytes(good);self.assertEqual(self.unbound_line()[0],0)
 def test_unbound_does_not_modify_status_files(self):
  self.status_fixture();self.status('a');before={f.name:(f.read_bytes(),f.stat().st_mode) for f in self.status_dir.iterdir()};self.assertEqual(self.unbound_line()[0],0);self.assertEqual({f.name:(f.read_bytes(),f.stat().st_mode) for f in self.status_dir.iterdir()},before)
 def map_fixture(self):
  self.mapdir=self.root/'map';self.mapdir.mkdir(mode=0o700);self.authdirs=[];self.expected={}
  for number in (3,4):
   d=self.root/('auth'+str(number));d.mkdir(mode=0o700);self.authdirs.append(d);name='fixture-account-'+str(number);self.expected[hashlib.sha256(name.encode()).hexdigest()]='codex-'+str(number)
   f=d/'auth.json';f.write_text(json.dumps(dict(tokens=dict(account_id=name,access_token='fixture-never-print-token'),email='fixture-never-print-email')));f.chmod(0o600)
  self.mapfile=self.mapdir/'codex-account-map.json';self.mapfile.write_text(json.dumps(dict(schemaVersion=1,accounts=self.expected)));self.mapfile.chmod(0o644)
 def map_line(self):
  script="import importlib.util,json;spec=importlib.util.spec_from_file_location('probe',"+repr(str(MODULE))+");m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps(m.account_line(),ensure_ascii=False))"
  command=['bwrap','--die-with-parent','--ro-bind','/','/','--unshare-net','--ro-bind',str(self.mapdir),'/var/lib/autopilot-usage']
  for number,d in zip((3,4),self.authdirs):command+=['--ro-bind',str(d),'/etc/claude-oauth/codex-podpiska-'+str(number)]
  q=subprocess.run(command+['python3','-I','-B','-c',script],capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,0,q.stderr);self.assertNotIn('fixture-account',q.stdout+q.stderr);self.assertNotIn('fixture-never-print',q.stdout+q.stderr)
  for digest in self.expected:self.assertNotIn(digest,q.stdout+q.stderr)
  return json.loads(q.stdout)
 def test_account_map_matches_both_slots_without_exposing_values(self):
  self.map_fixture();rc,out=self.map_line();self.assertEqual(rc,0,out);self.assertIn('2 из 2',out)
 def test_account_rotation_warns_then_restore(self):
  self.map_fixture();self.assertEqual(self.map_line()[0],0);p=self.authdirs[0]/'auth.json';good=p.read_bytes();p.write_text(json.dumps(dict(tokens=dict(account_id='fixture-new-account'))));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(p.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('MAP-PORCHA synthetic-auth SHA='+before+'->'+after,flush=True)
  rc,out=self.map_line();self.assertEqual(rc,1,out);self.assertIn('карта устарела',out);p.write_bytes(good);self.assertEqual(self.map_line()[0],0)
 def test_incomplete_map_or_duplicate_slot_identity_warns(self):
  self.map_fixture();good=self.mapfile.read_bytes();one={next(iter(self.expected)): 'codex-3'};self.mapfile.write_text(json.dumps(dict(schemaVersion=1,accounts=one)));self.assertEqual(self.map_line()[0],1);self.mapfile.write_bytes(good)
  (self.authdirs[1]/'auth.json').write_bytes((self.authdirs[0]/'auth.json').read_bytes());self.assertEqual(self.map_line()[0],1)
 def test_missing_map_or_unsafe_auth_or_bad_schema_is_blind(self):
  self.map_fixture();good=self.mapfile.read_bytes();self.mapfile.unlink();self.assertEqual(self.map_line()[0],2);self.mapfile.write_bytes(good);self.mapfile.chmod(0o644)
  for value in [dict(schemaVersion=True,accounts=self.expected),dict(schemaVersion=1,accounts={},extra=True)]:
   self.mapfile.write_text(json.dumps(value));self.assertEqual(self.map_line()[0],2)
  self.mapfile.write_bytes(good);p=self.authdirs[0]/'auth.json';p.chmod(0o666);self.assertEqual(self.map_line()[0],2);p.chmod(0o600);self.assertEqual(self.map_line()[0],0)
 def test_actual_nightly_cli_all_four_rows_and_unbound_warning_return(self):
  self.map_fixture();self.status_dir=self.mapdir/'registrations';self.status_dir.mkdir(mode=0o700);self.database();bin_dir=self.root/'bin';bin_dir.mkdir();units={}
  for i in range(11):
   home=self.root/('actual-home'+str(i));home.mkdir();(home/'config.toml').write_text('model="gpt-6-astra"\n')
   child=subprocess.Popen(['sleep','30'],env={**os.environ,'GATEWAY_POSTAVSHIK':'openai','CODEX_HOME':str(home)})
   def stop(process=child):
    process.terminate()
    try:process.wait(timeout=2)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=2)
   self.addCleanup(stop);units['coder-gateway-probe'+str(i)+'.service']=child.pid
  ctl=bin_dir/'systemctl';ctl.write_text('#!/usr/bin/python3\nimport sys\nu='+repr(units)+'\nif sys.argv[1]=="list-units":print("".join(k+" loaded active running fixture\\n" for k in u),end="")\nelse:print("Id="+sys.argv[2]+"\\nMainPID="+str(u[sys.argv[2]]))\n');ctl.chmod(0o755)
  command=['bwrap','--die-with-parent','--ro-bind','/','/','--unshare-net','--ro-bind',str(self.mapdir),'/var/lib/autopilot-usage','--ro-bind',str(self.db),'/var/lib/autopilot-mail/mail.sqlite']
  for number,d in zip((3,4),self.authdirs):command+=['--ro-bind',str(d),'/etc/claude-oauth/codex-podpiska-'+str(number)]
  command+=['python3','-B',str(MODULE)]
  def run(expected):
   q=subprocess.run(command,capture_output=True,text=True,timeout=10,env={**os.environ,'PATH':str(bin_dir)+':'+os.defpath});self.assertEqual(q.returncode,expected,q.stdout+q.stderr)
   for name in ('ОЧЕРЕДЬ','UNBOUND','КАРТА','ПРОВАЙДЕР'):self.assertIn('STEND-AP-METRIC: '+name,q.stdout)
   self.assertNotIn('fixture-account',q.stdout+q.stderr);self.assertNotIn('fixture-never-print',q.stdout+q.stderr);return q.stdout
  run(0)
  for i in range(9):self.status('real-cli-'+str(i),accepted=time.time()-60)
  self.assertEqual(len(list(self.status_dir.iterdir())),9);print('REAL-CLI-UNBOUND-PORCHA 9 terminal files',flush=True);out=run(1);self.assertIn('AMBIGUOUS=9',out)
  (self.status_dir/'real-cli-8.json').unlink();run(0)
 def providers(self,configs):
  self.e=legacy.GSize();self.e.setUp();self.addCleanup(self.e.doCleanups);self.e.units.clear()
  for i,config in enumerate(configs):
   home=self.root/('home'+str(i));home.mkdir();(home/'config.toml').write_text(config)
   self.e.add('coder-gateway-p'+str(i)+'.service',101+i,b'openai',home)
  self.m.gateway=self.e.m.gateway
  def ctl(deadline,*args):
   if args[0]=='list-units':return ''.join(u+' loaded active running fixture\n' for u in self.e.units)
   self.assertEqual(args[0],'show');unit=args[1];return 'Id='+unit+'\nMainPID='+str(self.e.units[unit])+'\n'
  patch=mock.patch.object(self.m.gateway,'ctl',side_effect=ctl);patch.start();self.addCleanup(patch.stop)
  # Legacy GSize supplies faithful /proc fixtures; real TOML and path checks run.
  self.m.EXPECTED_CODEX=len(configs)
  return self.m.provider_lines()
 def test_no_override_for_every_discovered_codex_gateway_is_green(self):
  rc,rows=self.providers(['model = "gpt-6-astra"\n']*11);self.assertEqual(rc,0,rows);self.assertEqual(sum('ЗЕЛЁНОЕ' in row for row in rows),11);self.assertIn('11 из 11',rows[-1])
 def test_custom_provider_is_yellow_with_name_and_path_then_restore(self):
  rc,rows=self.providers(['model_provider = "local"\n[model_providers.local]\nbase_url="https://example.invalid"\n']);self.assertEqual(rc,1,rows);self.assertIn('свой провайдер — подписка по account/read не доказывает','\n'.join(rows));self.assertIn('coder-gateway-p0.service','\n'.join(rows));self.assertIn('config.toml','\n'.join(rows))
  (self.root/'home0/config.toml').write_text('model="gpt-6-astra"\n');self.assertEqual(self.m.provider_lines()[0],0)
 def test_provider_table_without_selection_also_warns(self):
  self.assertEqual(self.providers(['[model_providers.test]\nbase_url="https://example.invalid"\n'])[0],1)
 def test_selected_and_unselected_profile_provider_warn_then_restore(self):
  rc,rows=self.providers(['[profiles.clean]\nmodel = "gpt-6-astra"\n']);self.assertEqual(rc,0,rows);file=self.root/'home0/config.toml';good=file.read_bytes();before=hashlib.sha256(good).hexdigest()
  cases=[('selected','profile = "x"\n[profiles.x]\nmodel_provider = "y"\n'),('unselected','[profiles.clean]\nmodel = "gpt-6-astra"\n[profiles.x]\nmodel_provider = "y"\n')]
  for name,text in cases:
   file.write_text(text);after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);self.assertEqual(subprocess.check_output(['grep','-cF','model_provider = "y"',str(file)],text=True).strip(),'1');print('PROFILE-PORCHA '+name+' grepF=1 SHA='+before+'->'+after,flush=True)
   with self.subTest(name=name):
    rc,rows=self.m.provider_lines();self.assertEqual(rc,1,rows);self.assertIn('свой провайдер — подписка по account/read не доказывает','\n'.join(rows));self.assertIn('coder-gateway-p0.service','\n'.join(rows));self.assertIn('config.toml','\n'.join(rows))
   file.write_bytes(good);self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),before);self.assertEqual(self.m.provider_lines()[0],0)
 def test_invalid_profile_table_is_blind_then_restore(self):
  self.providers(['']);file=self.root/'home0/config.toml';good=file.read_bytes()
  for text in ['profiles = "not-a-table"\n','[profiles]\nx = 1\n','[[profiles]]\nname = "x"\n']:
   file.write_text(text)
   with self.subTest(text=text):self.assertEqual(self.m.provider_lines()[0],2)
   file.write_bytes(good);self.assertEqual(self.m.provider_lines()[0],0)
 def test_invalid_config_or_missing_codex_home_is_blind(self):
  self.assertEqual(self.providers(['model_provider = ['])[0],2);(self.root/'home0/config.toml').write_text('')
  env=self.e.m.gateway.PROC/'101/environ';env.write_bytes(b'GATEWAY_POSTAVSHIK=openai\0');self.assertEqual(self.m.provider_lines()[0],2)
 def test_symlink_config_is_blind_without_reading_target(self):
  self.providers(['']);p=self.root/'home0/config.toml';p.unlink();p.symlink_to(self.root/'nonexistent');self.assertEqual(self.m.provider_lines()[0],2)
 def test_unexpected_gateway_count_uses_actual_coverage_denominator(self):
  self.providers(['']*12);self.m.EXPECTED_CODEX=11;rc,rows=self.m.provider_lines();self.assertEqual(rc,2,rows);self.assertIn('12 из 12',rows[-1]);self.assertIn('ожидается 11',rows[-1])
 def test_changed_process_or_missing_gateway_is_incomplete(self):
  self.assertEqual(self.providers([''])[0],0);self.m.EXPECTED_CODEX=11;self.assertEqual(self.m.provider_lines()[0],2)
  self.m.EXPECTED_CODEX=1;real=self.e.m.gateway.start_of;calls=[]
  def changed(pid):calls.append(pid);return real(pid)+int(len(calls)>1)
  with mock.patch.object(self.e.m.gateway,'start_of',side_effect=changed):self.assertEqual(self.m.provider_lines()[0],2)
 def test_excluded_gateway_cannot_turn_codex_without_detection(self):
  self.providers(['']*12);self.m.EXPECTED_CODEX=11;env=self.e.m.gateway.PROC/'112/environ';env.write_bytes(b'GATEWAY_POSTAVSHIK=anthropic\0');real=self.m.environment;changed=[]
  def change(pid):
   result=real(pid)
   if pid==112 and not changed:env.write_bytes(b'GATEWAY_POSTAVSHIK=openai\0CODEX_HOME='+os.fsencode(self.root/'home11')+b'\0');changed.append(True)
   return result
  with mock.patch.object(self.m,'environment',side_effect=change):self.assertEqual(self.m.provider_lines()[0],2)
if __name__=='__main__':unittest.main()
