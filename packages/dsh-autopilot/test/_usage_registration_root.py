"""Historical postal/kernel admission fixture; uses explicit legacy collector shim."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import stat
from _runtime_receipt_root import ProtectedPipeline
from test_runtime_receipt_source import *

@unittest.skipUnless(os.geteuid()==0 and os.environ.get('R_NORMALIZER_PRIVATE')=='1' and Path('/run/r-normalizer-private').exists(),'requires explicit private namespace')
class RegistrationPipeline(unittest.TestCase):
 # Postal/kernel admission fixtures deliberately share the original logical epoch.
 _source_fixed_epoch=True
 # Old producer fixtures lack both child witness and capture completion.
 def assert_legacy_capture_partial(self,receipt):
  self.assertEqual(receipt['status'],'incomplete',receipt)
  record=self.m.core.trusted_json(self.index.parent/'prepared/records'/(receipt['runId']+'.json'))
  participant=next(p for p in record['participants'] if p['name']==receipt['rows'][0]['participant'])
  gateway=self.m.lines(Path(participant['sources']['gateway']).read_bytes())
  incomplete=[g for g in gateway if g.get('kind')=='request' and g.get('childIncomplete')]
  self.assertTrue(incomplete)
  for g in incomplete:self.assertEqual(set(g['childDiagnostics']),{'CHILD_CAPTURE_INCOMPLETE','CHILD_VERSION_WITNESS_UNAVAILABLE'})
  self.assertEqual(receipt['rows'][0]['reason'],'CHILD_INCOMPLETE',receipt)
  self.assertTrue(all(value is not None for value in receipt['totals'].values()),receipt)
 setUpBase=ProtectedPipeline.setUp
 def setUp(self):
  self.assertTrue(os.statvfs('/').f_flag & os.ST_RDONLY);self.assertTrue(any(line.split()[1:3]==['/var/lib','tmpfs'] for line in Path('/proc/mounts').read_text().splitlines()))
  shutil.rmtree('/var/lib/autopilot-usage',ignore_errors=True)
  self.setUpBase();self.index=Path('/var/lib/autopilot-usage/index.json');self.output=self.index.parent/'runs';shutil.copyfile(PACKAGE/'runtime/usage_registration.py',self.package/'runtime/usage_registration.py');self.lib=self.root/'mail-lib';shutil.copytree(PACKAGE/'lib',self.lib);shutil.copyfile(PACKAGE/'runtime/usage_registration.py',self.lib/'usage_registration.py');shutil.copyfile(PACKAGE/'runtime/usage-reader-limits.json',self.lib/'usage-reader-limits.json')
  sys.path.insert(0,str(self.lib));self.addCleanup(lambda:sys.path.remove(str(self.lib)))
  spec=importlib.util.spec_from_file_location('registration_post_fixture',self.lib/'mail_service.py');self.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.api)
  self.socket=self.root/'socket/post.sock';self.post=self.root/'post-live';users={name:pwd.getpwnam(name).pw_uid for name in self.people}
  self.service=self.api.Postman(self.socket,self.post,users,65534,clock=lambda:1.3);self.service.start();self.addCleanup(self.service.stop)
  project=Path(self.record['project']);master=pwd.getpwnam('master');control=project/'.autopilot';control.mkdir(mode=0o700)
  for folder in (project,control):
   fd=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
   try:os.fchown(fd,master.pw_uid,master.pw_gid);os.fchmod(fd,0o700)
   finally:os.close(fd)
  self.raw_master_gateway()
  state=control/'state.js';state.write_text('window.STATE='+json.dumps(dict(_sadik=dict(run_id='run1',root=str(project)),finishedAt=None)));state.chmod(0o600);os.chown(state,master.pw_uid,master.pw_gid)
 def raw_master_gateway(self):
  from test_gateway_receipt_source import fixture,GatewaySource
  p=self.record['participants'][0];path=Path(p['sources']['gateway']);old=self.m.lines(path.read_bytes())[0]
  fx=fixture();GatewaySource().process_binding(fx);rows=fx[1]
  for r in rows:
   r.update(uid=p['uid'],recipient=p['name'],requestId=old['requestId'],sessionId=old['sessionId'],sessionCreated=old['sessionCreated'],dshTurn=old['dshTurn'])
   if 'request_id' in r:r['request_id']=old['requestId']
   if 'turn' in r:r['turn']=old['dshTurn']
   if 'threadId' in r:r['threadId']=old['threadId']
   if 'turnId' in r:r['turnId']=old['turnId']
  p['gatewaySource']='raw-v1';self.put_gateway(rows)
 def put_gateway(self,rows):
  path=Path(self.record['participants'][0]['sources']['gateway']);path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
 def bind_process(self,who):
  path=Path(self.record['participants'][0]['sources']['gateway']);rows=self.m.lines(path.read_bytes())
  binding=next(r for r in rows if r['kind']=='engine_process_binding');binding.update(enginePid=who['pid'],engineStart=who['start'],boot_id=who['boot']);self.put_gateway(rows)
 def profile_participants(self):return [dict(p,tgService='fixture-tg-'+p['name']+'.service') for p in self.record['participants']]
 def registration(self):
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  spec=importlib.util.spec_from_file_location('early_g_registration',self.package/'runtime/usage_registration.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  return module,profile
 def fresh_tick(self,module,profile,want,reason=None):
  self.assertTrue(Path('/run/r-normalizer-private').exists());self.assertEqual(self.index.parent,Path('/var/lib/autopilot-usage'))
  shutil.rmtree(self.index.parent,ignore_errors=True) # Only private tmpfs; force the resolver, not the REGISTERED shortcut.
  result=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  status=json.loads((self.index.parent/'registrations/run1.json').read_text());self.assertEqual(status['state'],want,(result,status))
  if reason:self.assertEqual(status['reason'],reason,(result,status))
  else:self.assertEqual(result['registered'],['run1'],result)
  print('G-REG-TICK '+json.dumps(dict(state=status['state'],reason=status['reason'],sourceBytes=result['sourceBytes'])),flush=True)
  return result
 def gateway_damage(self,before,after,name):
  self.assertNotEqual(before,after);path=Path(self.record['participants'][0]['sources']['gateway']);path.write_bytes(after)
  print('G-REG-DAMAGE '+json.dumps(dict(name=name,beforeSha256=hashlib.sha256(before).hexdigest(),afterSha256=hashlib.sha256(path.read_bytes()).hexdigest())),flush=True)

 def call(self,account='master',repeat=False,send_only=False,started_at=None,run_id='run1'):
  who=pwd.getpwnam(account)
  code='''import sys,os,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from mail_client import MailClient
p=os.getpid();tail=Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()
op=dict(pid=p,uid=os.getuid(),boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),start=tail[19])
request=dict(op='usage_register',runId=sys.argv[7],project=sys.argv[3],startedAt=sys.argv[6],operator=op)
c=MailClient(sys.argv[2],server_uid=0,tls_cert=None)
result=[c.submit_run(request) if sys.argv[5]=='send' else c.request(request)]
if sys.argv[4]=='yes':result.append(c.request(request))
print(json.dumps(dict(results=result,request=request)))
'''
  result=subprocess.run([sys.executable,'-B','-c',code,str(self.lib),str(self.socket),self.record['project'],'yes' if repeat else 'no','send' if send_only else 'request',started_at or self.m.iso(1200),run_id],user=who.pw_uid,group=65534,extra_groups=[],capture_output=True,text=True,timeout=5)
  self.assertEqual(result.returncode,0,result.stderr);return json.loads(result.stdout)
 def test_master_request_is_durable_and_duplicate_is_rejected(self):
  result=self.call(repeat=True)
  self.assertTrue(result['results'][0]['ok'],result);self.assertEqual(result['results'][1],dict(ok=False,reason='RUN_ALREADY_EXISTS'))
  self.assertEqual(result['results'][0]['state'],'QUEUED')
  with sqlite3.connect(self.post/'mail.sqlite') as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  self.assertFalse(self.index.exists(),'mail queue must not pretend root REGISTERED')
 def test_foreign_kernel_uid_cannot_register(self):
  result=self.call('vintik');self.assertEqual(result['results'][0],dict(ok=False,reason='REGISTRATION_ROLE_DENIED'))
  with sqlite3.connect(self.post/'mail.sqlite') as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0)

 def test_root_tick_registers_retroactive_start_and_then_counts_facts(self):
  result=self.call(repeat=True);self.assertTrue(result['results'][0]['ok'],result)
  who=result['request']['operator'];master=self.record['participants'][0];self.bind_process(who)
  os.chown(Path(self.record['project']),pwd.getpwnam('master').pw_uid,pwd.getpwnam('master').pw_gid)
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  spec=importlib.util.spec_from_file_location('root_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  self.assertTrue(hasattr(registration,'drain'),'root registration caller missing')
  self.assertFalse(self.index.exists());report=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(report['registered'],['run1'],report)
  rootrecord=json.loads((self.index.parent/'records/run1.json').read_text());self.assertEqual(rootrecord['startedAt'],result['request']['startedAt']);self.assertEqual(rootrecord['participants'][0]['name'],'master');self.assertTrue(all('tgService' not in p for p in rootrecord['participants']))
  ready=self.m.prepare(self.index,self.output,self.exporter);self.assertFalse(ready['failed'],ready);record=self.m.core.trusted_json(self.m.core.trusted_json(ready['index'])['runs'][0]['record']);self.m.core.verify_record_origin(record)
  receipt=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt'];self.assertEqual(receipt['schemaVersion'],4);self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['modelCalls'],1);self.assertEqual(receipt['totals']['inputTokens'],100)
  revised=json.loads(profile.read_text());revised['participants'][0]['tgService']='renamed-tg-master.service';profile.write_text(json.dumps(revised))
  duplicate=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertNotEqual(duplicate.get('reason'),'REGISTRATION_PROFILE_CHANGED',duplicate);self.assertFalse(duplicate['failed'],duplicate);self.assertEqual(len(json.loads(self.index.read_text())['runs']),1)
  before=self.index.read_bytes();answer=self.m.register(self.index,self.index.parent/'registration-requests/run1.json');self.assertEqual(answer['status'],'REGISTERED');self.assertEqual(self.index.read_bytes(),before) # exact recovery retry never creates another RUN
 def test_real_collector_drains_queue_before_idle(self):
  result=self.call();self.assertTrue(result['results'][0]['ok']);who=result['request']['operator'];master=self.record['participants'][0]
  self.bind_process(who)
  os.chown(Path(self.record['project']),pwd.getpwnam('master').pw_uid,pwd.getpwnam('master').pw_gid)
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  code='import runpy,sys;from unittest.mock import patch;path=sys.argv.pop(1)\nwith patch("time.time",return_value=1.3):runpy.run_path(path,run_name="__main__")'
  q=subprocess.run([sys.executable,'-I','-B','-c',code,str(self.package/'tools/collect-team-usage.py'),'--index',str(self.index),'--output',str(self.output),'--profile',str(profile)],capture_output=True,text=True,timeout=35)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertTrue(self.index.exists());report=json.loads(q.stdout);self.assertIn('run1',report['registration']['registered']);pointer=json.loads((self.output/'run1/current.json').read_text());receipt=json.loads((self.output/'run1/public'/pointer['generation']/'receipt.json').read_text());self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['modelCalls'],1)

 def test_submission_returns_without_waiting_for_server_reply(self):
  original=self.service.handle
  def slow(*args,**kwargs):
   answer=original(*args,**kwargs);time.sleep(1);return answer
  self.service.handle=slow;started=time.monotonic();result=self.call(send_only=True)
  self.assertLess(time.monotonic()-started,.5);self.assertEqual(result['results'][0],dict(ok=True,state='SUBMITTED'))

 def test_actual_init_continues_when_mail_is_down(self):
  from test_install import InstallTests
  fixture=InstallTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
  project,ap=fixture.operator_project()
  account=pwd.getpwnam('master');os.chown(project/'.autopilot/dashboard.html',account.pw_uid,account.pw_gid)
  saved={k:os.environ.get(k) for k in ['AP_REGISTRATION_LIB','AUTOPILOT_USAGE_MAIL_SOCKET']}
  def restore():
   for k,v in saved.items():
    if v is None:os.environ.pop(k,None)
    else:os.environ[k]=v
  self.addCleanup(restore)
  os.environ['AP_REGISTRATION_LIB']=str(self.lib);os.environ['AUTOPILOT_USAGE_MAIL_SOCKET']=str(self.root/'unavailable/post.sock')
  q=fixture.operator_call(ap,'init','--slug','mail-down','--skill-dir',str(fixture.release/'skill'))
  self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  state=json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1]);self.assertIn('usageRegistration',state,'real init has no registration caller');self.assertEqual(state['usageRegistration']['state'],'UNBOUND');self.assertEqual(state['usageRegistration']['reason'],'POSTMAN_CONNECT_UNAVAILABLE');self.assertEqual(state['usageRegistration']['runId'],state['_sadik']['run_id'])
  return fixture,project,ap,state
 def test_one_way_sender_may_exit_before_queue_processing(self):
  original=self.service.handle
  def delayed(*args,**kwargs):
   time.sleep(.4);return original(*args,**kwargs)
  self.service.handle=delayed;result=self.call(send_only=True);self.assertEqual(result['results'][0]['state'],'SUBMITTED')
  until=time.monotonic()+1
  while time.monotonic()<until:
   with sqlite3.connect(self.post/'mail.sqlite') as con:
    if con.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0]:return
   time.sleep(.05)
  self.fail('SO_PEERCRED UID master lost authorization when its transient client exited')
 def nine_intents_profile(self):
  first=self.call();self.assertTrue(first['results'][0]['ok']);hint=first['request']['operator']
  with sqlite3.connect(self.post/'mail.sqlite') as con:captured=json.loads(con.execute('SELECT operator_json FROM usage_registrations WHERE run_id=?',('run1',)).fetchone()[0])
  os.chown(Path(self.record['project']),pwd.getpwnam('master').pw_uid,pwd.getpwnam('master').pw_gid)
  for i in range(2,10):
   project=self.root/('queue-project-'+str(i));_fixture_mkdir(project, mode=0o755);os.chown(project,pwd.getpwnam('master').pw_uid,pwd.getpwnam('master').pw_gid)
   request=dict(first['request'],runId='run'+str(i),project=str(project),startedAt=self.m.iso(1200+i));self.assertTrue(self.service.handle('master',hint['uid'],request,peer_pid=hint['pid'],peer_chain=captured)['ok'])
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  return profile
 def test_bounded_queue_does_not_starve_ninth_intent(self):
  profile=self.nine_intents_profile()
  # Scheduler-only boundary: actual native/SDK owner proof is exercised above.
  count=[0]
  def proven_context(*args,**kwargs):
   count[0]+=1;return dict(operator=dict(sessionId='fixture-context-'+str(count[0]),sessionCreated=42,turn=1),sourceBytes=0,gatewayBytes=0,gatewaySeconds=0,metadataSeconds=0,proof=[])
  self.m.owner_export=proven_context
  spec=importlib.util.spec_from_file_location('fair_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  first_tick=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);second_tick=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  self.assertEqual(len(json.loads(self.index.read_text())['runs']),9,(first_tick,second_tick));self.assertIn('run9',second_tick['registered'])

 def test_permanent_failures_do_not_starve_later_intents(self):
  profile=self.nine_intents_profile()
  def proof(request,*args,**kwargs):
   if self.m.millis(request['registrationContext']['startedAt'])!=1209:raise self.m.Incomplete('REGISTRATION_CONTEXT_UNAVAILABLE')
   return dict(operator=dict(sessionId='ninth-context',sessionCreated=42,turn=1),sourceBytes=0,gatewayBytes=0,gatewaySeconds=0,metadataSeconds=0,proof=[])
  self.m.owner_export=proof
  spec=importlib.util.spec_from_file_location('retry_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  first=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);second=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  self.assertEqual(first['registered'],[]);self.assertIn('run9',second['registered'],(first,second))

 def test_actual_init_return_then_root_tick_counts_first_facts_and_publishes(self):
  fixture,old_project,old_ap,old_state=self.test_actual_init_continues_when_mail_is_down()
  # Restore the same transport; old never-received intent is not silently declared complete.
  self.service.clock=time.time;who=pwd.getpwnam('master');os.chown(self.socket,-1,who.pw_gid);os.chown(self.socket.parent,-1,who.pw_gid)
  os.environ['AUTOPILOT_USAGE_MAIL_SOCKET']=str(self.socket)
  project=Path(fixture.tmp.name)/'restored-project';control=project/'.autopilot';project.mkdir(mode=0o700);control.mkdir(mode=0o700)
  for folder in (project,control):
   fd=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
   try:os.fchown(fd,who.pw_uid,who.pw_gid);os.fchmod(fd,0o700)
   finally:os.close(fd)
  for name in ('ap.py','ap_sadik.py'):
   shutil.copyfile(fixture.release/'skill/tools'/name,control/name);(control/name).chmod(0o755 if name=='ap.py' else 0o644)
  shutil.copyfile(fixture.release/'skill/phases/dashboard-template.html',control/'dashboard.html')
  os.chown(control/'dashboard.html',who.pw_uid,who.pw_gid);(control/'dashboard.html').chmod(0o644)
  q=fixture.operator_call(control/'ap.py','init','--slug','returned','--skill-dir',str(fixture.release/'skill'));self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  info=(control/'state.js').lstat();print('ACTUAL_INIT_STATE '+json.dumps(dict(uid=info.st_uid,mode=oct(stat.S_IMODE(info.st_mode)))),flush=True);self.assertEqual(info.st_uid,who.pw_uid);self.assertEqual(stat.S_IMODE(info.st_mode),0o600,'actual init produced a group-writable accounting source')
  state=json.loads((control/'state.js').read_text().split('=',1)[1]);self.assertEqual(state['usageRegistration']['state'],'SUBMITTED',state['usageRegistration']);run=state['_sadik']['run_id']
  for folder in (control/state['dir'],control/state['dir']/'tickets'):
   info=folder.lstat();print('ACTUAL_INIT_DIRECTORY '+json.dumps(dict(path=str(folder),uid=info.st_uid,mode=oct(stat.S_IMODE(info.st_mode)))),flush=True);self.assertEqual(info.st_uid,who.pw_uid);self.assertEqual(stat.S_IMODE(info.st_mode)&0o022,0,'actual init produced a group/other-writable run directory')
  until=time.monotonic()+1
  while True:
   with sqlite3.connect(self.post/'mail.sqlite') as con:row=con.execute('SELECT request_json,operator_json FROM usage_registrations WHERE run_id=?',(run,)).fetchone()
   if row:break
   self.assertLess(time.monotonic(),until,'submission was not durably queued');time.sleep(.01)
  request=json.loads(row[0]);captured=json.loads(row[1]);self.assertEqual(request['runId'],run);operator=request['operator'];offset=self.m.millis(request['startedAt'])-1200;master=self.record['participants'][0]
  # The real UI clock truncates seconds. A G request starting just after its
  # displayed time must still bind to this actual init's more precise instant.
  from datetime import datetime,timedelta
  coarse=datetime.fromisoformat(state['startedAt']);g_start=(coarse+timedelta(microseconds=1)).isoformat()
  spec=importlib.util.spec_from_file_location('precise_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  same_second=dict(kind='request',requestId='same-second',uid=operator['uid'],sessionId='s',sessionCreated=42,dshTurn=1,startedAt=g_start,endedAt=None,sourceProcess={k:operator[k] for k in ('pid','boot','start')})
  try:context=registration.operator_tuple([same_second],captured,request['startedAt'])
  except ValueError as error:self.fail('actual init truncated registration time: '+str(error))
  self.assertEqual(context,dict(sessionId='s',sessionCreated=42,turn=1))
  # Engine/R events are synthetic; kernel caller, exact runtime tuple, DB and files are real.
  rawpath=Path(master['runtimeSource']['raw']);rows=self.m.lines(rawpath.read_bytes())
  for r in rows:
   for key in ('registeredAt','turnStartedAt','claimedAt','finishedAt','at'):
    if r.get(key) is not None:r[key]+=offset
   for claim in r.get('claims',[]):claim['claimedAt']+=offset
  rawpath.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  native=Path(master['runtimeSource']['native'][0]);rows=self.m.lines(native.read_bytes())
  for r in rows[1:]:r['time']+=offset
  native.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  with sqlite3.connect(master['runtimeSource']['ledger']) as con:con.execute('UPDATE mail_sdk_requests SET started_at=started_at+?',(offset,))
  self.bind_process(operator);gateway=Path(master['sources']['gateway']);rows=self.m.lines(gateway.read_bytes())
  for r in rows:
   r['observedAt']+=offset
   if r.get('at') is not None:r['at']+=offset
  gateway.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  engine=Path(master['sources']['raw'][0]);rows=self.m.lines(engine.read_bytes())
  for r in rows:
   if r.get('timestamp'):r['timestamp']=self.m.iso(self.m.millis(r['timestamp'])+offset)
  engine.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  profile=self.index.parent/'source-profile.json';_fixture_mkdir(profile.parent, mode=0o700, parents=True, exist_ok=True)
  fd=os.open(profile.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fchmod(fd,0o755)
  finally:os.close(fd)
  profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(Path(fixture.tmp.name))],participants=self.profile_participants())));profile.chmod(0o600)
  remaining=(offset+2050)/1000-time.time()
  if remaining>0:time.sleep(remaining)
  # Historical root registration CLI is isolated in the legacy fixture package.
  q=subprocess.run([sys.executable,'-I','-B',str(self.package/'tools/collect-team-usage.py')],capture_output=True,text=True,timeout=35);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn(run,json.loads(q.stdout)['registration']['registered'])
  record=json.loads((self.index.parent/'records'/(run+'.json')).read_text());self.assertEqual(record['startedAt'],request['startedAt'])
  pointer=json.loads((self.output/run/'current.json').read_text());receipt=json.loads((self.output/run/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(receipt['schemaVersion'],4);self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['modelCalls'],1);self.assertEqual(receipt['totals']['inputTokens'],100)
  self.assertEqual((control/'state.js').stat().st_uid,who.pw_uid);self.assertEqual((control/'dashboard.html').stat().st_uid,who.pw_uid)
  pub=subprocess.run([sys.executable,'-I','-B',str(fixture.release/'skill/tools/ap_sadik.py'),'--publish-team',str(project),run],user=who.pw_uid,group=who.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=6);self.assertEqual(pub.returncode,0,pub.stdout+pub.stderr)
  page=fixture.root/'srv/autopilot/public'/json.loads(pub.stdout)['url'];rendered=json.loads(subprocess.check_output(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],text=True));self.assertEqual(rendered['errors'],[]);self.assertNotIn('ROOT_REGISTRATION_PENDING',rendered['html']);self.assertIn('Codex 1 из 1',rendered['html'])
  print('ACTUAL INIT return -> QUEUED -> root next tick REGISTERED same runId/start -> observed 1 call/100 input -> actual publisher/render green; G/raw synthetic',flush=True)
  done=fixture.operator_call(control/'ap.py','abandon');self.assertEqual(done.returncode,0,done.stdout+done.stderr)
  final_state=json.loads((control/'state.js').read_text().split('=',1)[1]);self.assertIn('usageFinishedAt',final_state,'precise AP finish boundary missing')
  marker=control/'usage-finish'/(run+'.json');original=marker.read_bytes();damaged=json.loads(original);damaged.pop('finishedAt');damaged=json.dumps(damaged).encode();self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(damaged).hexdigest());marker.write_bytes(damaged)
  print('DAMAGE finish marker count=1 SHA',hashlib.sha256(original).hexdigest(),'->',hashlib.sha256(damaged).hexdigest(),flush=True)
  failed=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(failed['failed'][0]['reason'],'RUN_FINISH_UNATTESTED')
  marker.write_bytes(original)
  # A new init can overwrite current state BEFORE the first root observation.
  rollover=dict(final_state);rollover['_sadik']=dict(final_state['_sadik'],run_id='next-project-run');rollover['finishedAt']=None;rollover.pop('usageFinishedAt');(control/'state.js').write_text('window.STATE='+json.dumps(rollover))
  ready=self.m.prepare(self.index,self.output,self.exporter);self.assertFalse(ready['failed'],ready)
  bound=json.loads((self.index.parent/'run-window'/(run+'.json')).read_text());self.assertEqual(bound['finishedAt'],final_state['usageFinishedAt'])
  # Once root-bound, even removal of actor evidence cannot extend the old run.
  marker.unlink();returned=self.m.prepare(self.index,self.output,self.exporter);self.assertFalse(returned['failed'],returned)
  status=self.index.parent/'registrations'/(run+'.json');saved_status=status.read_bytes();saved_mode=stat.S_IMODE(status.lstat().st_mode);status.unlink();missing=self.m.prepare(self.index,self.output,self.exporter);self.assertTrue(missing['failed'],'missing REGISTERED silently became legacy');self.assertEqual(missing['failed'][0]['reason'],'RUN_NOT_REGISTERED');status.write_bytes(saved_status);status.chmod(saved_mode);self.assertFalse(self.m.prepare(self.index,self.output,self.exporter)['failed'])

 def test_idle_queue_does_not_validate_or_read_participant_homes(self):
  self.m.write_index(self.index,dict(schemaVersion=1,runs=[]));profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  calls=[];original=self.m.validate_record
  def observe(*a,**kw):calls.append(True);return original(*a,**kw)
  self.m.validate_record=observe
  spec=importlib.util.spec_from_file_location('idle_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  result=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertFalse(result['failed']);self.assertEqual(calls,[],'idle performed participant HOME/path validation')
 def test_old_mail_protocol_is_named_not_successful_idle(self):
  # A postal window can lag behind the AP window. Use the actual pre-intent
  # CLI/server bytes, not a mock success/error for submit_from_init.
  self.service.stop()
  patch=PACKAGE/'test/fixtures/mail-before-registration-e3287bac.patch'
  applied=subprocess.run(['patch','--batch','--forward','-p4','-d',str(self.lib),'-i',str(patch)],capture_output=True,text=True)
  self.assertEqual(applied.returncode,0,applied.stdout+applied.stderr)
  for name,expected in {'mail_client.py':'7775600d589c716ee4efa5412b05e0048c9ee394d5049307cfb98e0e0cf6918e','mail_service.py':'54cbb38fbadf0ade3fc9aa5eedcc05463619de5e401bd854e8f2821eeef05941'}.items():
   self.assertEqual(hashlib.sha256((self.lib/name).read_bytes()).hexdigest(),expected,'not the pinned pre-intent mail')
  self.m.write_index(self.index,dict(schemaVersion=1,runs=[]))
  with sqlite3.connect(self.post/'mail.sqlite') as con:con.execute('DROP TABLE usage_registrations')
  spec=importlib.util.spec_from_file_location('pre_intent_postman',self.lib/'mail_service.py');old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
  service=old.Postman(self.socket,self.post,{name:pwd.getpwnam(name).pw_uid for name in self.people},pwd.getpwnam('master').pw_gid,clock=lambda:1.3);service.start();self.addCleanup(service.stop)
  self.assertTrue(self.socket.is_socket(),'old mail socket missing')
  with sqlite3.connect(self.post/'mail.sqlite') as con:
   self.assertIsNone(con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_registrations'").fetchone(),'old mail unexpectedly has intents')
  from test_install import InstallTests
  fixture=InstallTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
  project,ap=fixture.operator_project();account=pwd.getpwnam('master');os.chown(project/'.autopilot/dashboard.html',account.pw_uid,account.pw_gid)
  saved={k:os.environ.get(k) for k in ('AP_REGISTRATION_LIB','AUTOPILOT_USAGE_MAIL_SOCKET')}
  def restore():
   for k,v in saved.items():
    if v is None:os.environ.pop(k,None)
    else:os.environ[k]=v
  self.addCleanup(restore)
  os.environ.update(AP_REGISTRATION_LIB=str(self.lib),AUTOPILOT_USAGE_MAIL_SOCKET=str(self.socket))
  command=['/usr/local/bin/autopilot-mail','--socket',str(self.socket)]
  help=subprocess.run(command+['--help'],user=account.pw_uid,group=account.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=2)
  self.assertEqual(help.returncode,0,help.stderr);self.assertNotIn('register-run',help.stdout)
  status=subprocess.run(command+['status'],user=account.pw_uid,group=account.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=2)
  self.assertEqual(status.returncode,0,status.stdout+status.stderr);self.assertTrue(json.loads(status.stdout)['ok'],'old mail is down, not merely missing intents')
  unsupported=subprocess.run(command+['register-run'],user=account.pw_uid,group=account.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=2)
  self.assertEqual(unsupported.returncode,2,unsupported.stdout+unsupported.stderr);self.assertIn('invalid choice',unsupported.stderr);self.assertIn('register-run',unsupported.stderr)
  q=fixture.operator_call(ap,'init','--slug','old-mail','--skill-dir',str(fixture.release/'skill'))
  self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  state=json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1]);run=state['_sadik']['run_id']
  self.assertTrue((project/'.autopilot'/state['dir']).is_dir(),'run directory missing')
  catalog=json.loads((fixture.root/'var/lib/dsh-autopilot/runs/catalog.json').read_text());self.assertEqual(catalog['runs'][run]['status'],'active');self.assertEqual(catalog['runs'][run]['project'],str(project))
  self.assertEqual(state['usageRegistration']['runId'],run);self.assertEqual(state['usageRegistration']['state'],'UNBOUND');self.assertEqual(state['usageRegistration']['reason'],'REGISTRATION_CLIENT_UNAVAILABLE')
  self.assertIsNone(state.get('finishedAt'),'init silently finished the run')
  print('OLD MAIL pinned e328/no register-run/no intent table: actual master init rc0, active catalog run + directory created, registration UNBOUND/REGISTRATION_CLIENT_UNAVAILABLE',flush=True)
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  code='import runpy,sys;from unittest.mock import patch;path=sys.argv.pop(1)\nwith patch("time.time",return_value=1.3):runpy.run_path(path,run_name="__main__")'
  q=subprocess.run([sys.executable,'-I','-B','-c',code,str(self.package/'tools/collect-team-usage.py'),'--index',str(self.index),'--output',str(self.output),'--profile',str(profile)],capture_output=True,text=True,timeout=35)
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);report=json.loads(q.stdout);self.assertIsInstance(report.get('registration'),dict,q.stdout+q.stderr);self.assertEqual(report['registration']['reason'],'REGISTRATION_PROTOCOL_UNAVAILABLE')

 def test_new_authenticated_task_extends_registered_roster(self):
  result=self.call();self.assertTrue(result['results'][0]['ok']);hint=result['request']['operator'];master=self.record['participants'][0];self.bind_process(hint)
  os.chown(Path(self.record['project']),pwd.getpwnam('master').pw_uid,pwd.getpwnam('master').pw_gid)
  profile=self.root/'source-profile.json';profile.write_text(json.dumps(dict(schemaVersion=1,mailDatabase=str(self.post/'mail.sqlite'),projectRoots=[str(self.root)],participants=self.profile_participants())));profile.chmod(0o600)
  spec=importlib.util.spec_from_file_location('roster_registration',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  first=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(first['registered'],['run1'],first)
  path=self.index.parent/'records/run1.json';before=json.loads(path.read_text());self.assertEqual([p['name'] for p in before['participants']],['master'])
  body='AUTOPILOT-PILOT/1\n'+json.dumps(dict(route='AUTOPILOT-PILOT/1',kind='task',run='run1',sender='master',task=dict(job_id='late-vintik',recipient='vintik')))
  answer=self.service.handle('master',hint['uid'],dict(op='send',to='vintik',body=body,nonce='late-vintik',subject='fixture'));self.assertTrue(answer['ok'],answer)
  second=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertFalse(second['failed'],second);self.assertNotIn('reason',second,second)
  after=json.loads(path.read_text());self.assertEqual([p['name'] for p in after['participants']],['master','vintik']);self.assertEqual(after['startedAt'],before['startedAt'])

 def test_queue_contains_receiver_chain_not_the_client_hint(self):
  result=self.call();self.assertTrue(result['results'][0]['ok'],result)
  with sqlite3.connect(self.post/'mail.sqlite') as con:row=con.execute('SELECT operator_json,peer_pid FROM usage_registrations').fetchone()
  captured=json.loads(row[0]);self.assertIn('chain',captured,'queue stores caller hint instead of receiver ancestry');self.assertEqual(captured['chain'][0]['pid'],row[1]);self.assertTrue(captured['boot_id'])

 def test_raw_binding_missing_then_return_registers(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration()
  self.fresh_tick(module,profile,'REGISTERED');path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes()
  rows=[r for r in self.m.lines(before) if r['kind']!='engine_process_binding']
  self.assertEqual(sum(r['kind']=='engine_process_binding' for r in self.m.lines(before)),1);self.assertEqual(sum(r['kind']=='engine_process_binding' for r in rows),0)
  for i,r in enumerate(rows):r['seq']=i+1
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'missingBinding count1->0')
  self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE');path.write_bytes(before);self.fresh_tick(module,profile,'REGISTERED')
 def test_raw_same_pid_wrong_birth_then_return_registers(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration();self.fresh_tick(module,profile,'REGISTERED')
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);b=next(r for r in rows if r['kind']=='engine_process_binding');pid=b['enginePid'];old=b['engineStart'];b['engineStart']=str(int(old)+1);self.assertEqual(b['enginePid'],pid);self.assertNotEqual(b['engineStart'],old)
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'samePID start '+old+'->'+b['engineStart'])
  self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE');path.write_bytes(before);self.fresh_tick(module,profile,'REGISTERED')
 def test_raw_second_binding_is_ambiguous_then_returns(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration();self.fresh_tick(module,profile,'REGISTERED')
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);binding=next(r for r in rows if r['kind']=='engine_process_binding');i=rows.index(binding);rows.insert(i+1,dict(binding,observedAt=binding['observedAt']+1))
  for i,r in enumerate(rows):r['seq']=i+1
  self.assertEqual(sum(r['kind']=='engine_process_binding' for r in rows),2);self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'binding count1->2')
  self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_AMBIGUOUS');path.write_bytes(before);self.fresh_tick(module,profile,'REGISTERED')
 def test_long_process_with_recent_heartbeat_registers_whole_generation(self):
  self.service.clock=lambda:1001.3;answer=self.call(started_at=self.m.iso(1001200));self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator'])
  p=self.record['participants'][0];native=Path(p['runtimeSource']['native'][0]);n=self.m.lines(native.read_bytes());n=[r for r in n if r.get('type')!='turn/end']
  for i,r in enumerate(n[1:]):r['seq']=i
  native.write_text(''.join(json.dumps(r)+'\n' for r in n)) # A still-open operator turn can span >10 minutes.
  path=Path(p['sources']['gateway']);rows=[r for r in self.m.lines(path.read_bytes()) if r['kind'] not in {'engine_terminal','engine_process_closed','turn_terminal'}]
  for r in rows:r['observedAt']+=1000000
  rows.append(dict(rows[0],kind='watermark',observedAt=1002000,at=1002000))
  for i,r in enumerate(rows):r['seq']=i+1
  self.put_gateway(rows);before=path.read_bytes();module,profile=self.registration();self.fresh_tick(module,profile,'REGISTERED')
  for r in rows:
   if r['kind']!='watermark':r['observedAt']-=1000000
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'process times inside600s->older600s; heartbeat remains recent')
  from test_gateway_receipt_source import load
  g=load();norm=g.process_requests(rows,p)
  with sqlite3.connect(self.post/'mail.sqlite') as con:who=json.loads(con.execute('SELECT operator_json FROM usage_registrations WHERE run_id=?',('run1',)).fetchone()[0])
  self.assertEqual(module.operator_tuple(norm,who,answer['request']['startedAt']),dict(sessionId='s',sessionCreated=42,turn=1),'full long-running generation must survive its recent heartbeat')
  self.fresh_tick(module,profile,'REGISTERED');long_history=path.read_bytes()
  for r in rows:
   if r['kind']=='watermark':r['observedAt']=3000+r['seq'];r['at']=r['observedAt']
  self.gateway_damage(long_history,''.join(json.dumps(r)+'\n' for r in rows).encode(),'whole generation old: last recent heartbeat removed')
  self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE')
  path.write_bytes(long_history);self.assertEqual(path.read_bytes(),long_history);self.fresh_tick(module,profile,'REGISTERED')

 def test_whole_gateway_over_budget_is_unbound_with_metrics_then_returns(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration()
  self.fresh_tick(module,profile,'REGISTERED');path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes()
  with path.open('r+b') as stream:stream.truncate(module.G_READ_LIMIT+1)
  damaged=path.read_bytes();self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(damaged).hexdigest());self.assertEqual(path.stat().st_size,134283265)
  print('G-BUDGET-DAMAGE '+json.dumps(dict(beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(damaged).hexdigest(),sizeBytes=len(damaged),beforeBytes=len(before))),flush=True)
  result=self.fresh_tick(module,profile,'UNBOUND','BUDGET_EXCEEDED');detail=result['unbound'][0]['gatewaySnapshot']
  self.assertEqual(detail['sizeBytes'],134283265);self.assertEqual(detail['byteLimit'],134283264);self.assertEqual(detail['secondsLimit'],module.G_READ_SECONDS);self.assertGreaterEqual(detail['elapsedSeconds'],0)
  stored=json.loads((self.index.parent/'registration-budget/run1.json').read_text());self.assertEqual(stored['gatewaySnapshot'],detail);self.assertEqual(stored['reason'],'BUDGET_EXCEEDED')
  self.assertEqual(module.public_registration('run1',self.record['project'],None,self.index.parent/'registrations')['reason'],'BUDGET_EXCEEDED')
  print('G-BUDGET-UNBOUND '+json.dumps(stored),flush=True)
  path.write_bytes(before);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),hashlib.sha256(before).hexdigest());self.fresh_tick(module,profile,'REGISTERED');self.assertFalse((self.index.parent/'registration-budget/run1.json').exists())

 def test_gateway_17mib_registers_without_spending_metadata_budget(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration()
  p=self.record['participants'][0];path=Path(p['sources']['gateway']);original=self.m.lines(path.read_bytes());rows=[]
  for row in original:
   rows.append(dict(row))
   if row['kind']=='protocol_usage':rows.extend(dict(row,benchmarkPadding='x'*32768) for _ in range(520))
  for i,row in enumerate(rows):row['seq']=i+1
  self.put_gateway(rows);size=path.stat().st_size;self.assertGreater(size,16777216)
  result=self.fresh_tick(module,profile,'REGISTERED');self.assertEqual(result['gatewayBytes'],size);self.assertLess(result['sourceBytes'],16777216)
  self.assertGreaterEqual(result['gatewaySeconds'],0);self.assertGreaterEqual(result['metadataSeconds'],0);self.assertEqual(result['metadataByteLimit'],self.m.LIMIT)
  print('G-SPLIT-REGISTERED '+json.dumps(result),flush=True)

 def test_exhausted_gateway_quantum_names_gateway_and_resets_next_tick(self):
  profile=self.nine_intents_profile();calls=[]
  def proof(request,*args,**kwargs):
   calls.append(request);return dict(operator=dict(sessionId='bounded-'+str(len(calls)),sessionCreated=42,turn=1),sourceBytes=0,gatewayBytes=request['gatewayBudget'],gatewaySeconds=0,metadataSeconds=0,proof=[])
  self.m.owner_export=proof
  spec=importlib.util.spec_from_file_location('g_quantum_scope',self.package/'runtime/usage_registration.py');registration=importlib.util.module_from_spec(spec);spec.loader.exec_module(registration)
  first=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(len(calls),1);self.assertEqual(len(first['registered']),1);self.assertTrue(first['unbound']);self.assertTrue(all(v['budgetScope']=='gateway' for v in first['unbound']),first)
  second=registration.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(len(calls),2);self.assertEqual(calls[0]['gatewayBudget'],calls[1]['gatewayBudget']);self.assertEqual(second['gatewayBytesCharged'],registration.G_READ_LIMIT)

 def test_gateway_time_grant_failure_then_return_names_scope(self):
  answer=self.call();self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);module,profile=self.registration()
  self.fresh_tick(module,profile,'REGISTERED');original=self.m.owner_export
  def expired(grant,*args):
   changed=dict(grant,gatewaySeconds=1e-9);before=json.dumps(grant,sort_keys=True).encode();after=json.dumps(changed,sort_keys=True).encode()
   self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest());self.assertEqual(sum(grant[k]!=changed[k] for k in grant),1)
   print('G-TIME-DAMAGE '+json.dumps(dict(replacements=1,field='gatewaySeconds',before=grant['gatewaySeconds'],after=changed['gatewaySeconds'],beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(after).hexdigest())),flush=True)
   return original(changed,*args)
  self.m.owner_export=expired
  try:
   failed=self.fresh_tick(module,profile,'UNBOUND','BUDGET_EXCEEDED');self.assertEqual(failed['unbound'][0]['budgetScope'],'gateway')
  finally:self.m.owner_export=original
  self.fresh_tick(module,profile,'REGISTERED')

 def retry_ticks(self,module,profile,at,reads):
  original=self.m.owner_export
  def observed(*args,**kwargs):
   try:
    out=original(*args,**kwargs)
   except self.m.Incomplete as error:
    if getattr(error,'gatewayBytes',0):reads.append(error.gatewayBytes)
    raise
   if out.get('gatewayBytes'):reads.append(out['gatewayBytes'])
   return out
  self.m.owner_export=observed
  self.service.clock=lambda:at
  try:report=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  finally:self.m.owner_export=original
  status=json.loads((self.index.parent/'registrations/run1.json').read_text())
  print('G-RETRY-TICK '+json.dumps(dict(at=at,reads=len(reads),state=status['state'],reason=status['reason'],terminal=status.get('terminal'))),flush=True)
  return report,status

 def test_ambiguous_is_final_one_actual_g_read_across_three_ticks(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);b=next(r for r in rows if r['kind']=='engine_process_binding');rows.insert(rows.index(b)+1,dict(b))
  for i,r in enumerate(rows):r['seq']=i+1
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'duplicate binding 1->2');reads=[]
  for at in (1.3,61.3,121.3):
   report,status=self.retry_ticks(module,profile,at,reads);self.assertEqual(status['reason'],'REGISTRATION_CONTEXT_AMBIGUOUS')
  self.assertEqual(len(reads),1,'terminal AMBIGUOUS rereads G every tick');self.assertTrue(status['terminal'])
  path.write_bytes(before);self.retry_ticks(module,profile,130,reads);self.assertEqual(len(reads),1,'restored source must not revive a final run')
  self.fresh_tick(module,profile,'REGISTERED') # separate private fixture reset; no automatic production reset

 def test_async_prefix_then_appended_binding_registers_inside_window(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);prefix=rows[:next(i for i,r in enumerate(rows) if r['kind']=='engine_process_binding')]
  self.assertTrue(prefix);self.assertFalse(any(r['kind']=='engine_process_binding' for r in prefix));self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in prefix).encode(),'not-yet-appended binding 1->0 prefix');reads=[]
  report,status=self.retry_ticks(module,profile,1.3,reads);self.assertEqual(status['state'],'UNBOUND');self.assertEqual(status.get('terminal'),False)
  path.write_bytes(before);report,status=self.retry_ticks(module,profile,61.3,reads);self.assertEqual(status['state'],'REGISTERED');self.assertEqual(len(reads),2)
  self.retry_ticks(module,profile,121.3,reads);self.assertEqual(len(reads),2)

 def test_async_prefix_expires_without_another_g_read_or_late_revival(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);prefix=rows[:next(i for i,r in enumerate(rows) if r['kind']=='engine_process_binding')]
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in prefix).encode(),'missing binding until deadline');reads=[]
  self.retry_ticks(module,profile,1.3,reads)
  path.write_bytes(before);report,status=self.retry_ticks(module,profile,181.3,reads)
  self.assertEqual(status['state'],'UNBOUND','late binding registered after retry deadline');self.assertEqual(status['reason'],'REGISTRATION_RETRY_EXPIRED');self.assertTrue(status['terminal']);self.assertEqual(len(reads),1)
  self.retry_ticks(module,profile,241.3,reads);self.assertEqual(len(reads),1)

 def test_budget_refusal_is_final_even_after_source_restoration(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes()
  with path.open('wb') as out:out.truncate(module.G_READ_LIMIT+1)
  print('G-RETRY-DAMAGE '+json.dumps(dict(name='size exceeds grant',size=path.stat().st_size,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(path.read_bytes()).hexdigest())),flush=True)
  original=self.m.owner_export;calls=[]
  def observed(*args,**kwargs):calls.append(True);return original(*args,**kwargs)
  self.m.owner_export=observed
  try:
   for at in (1.3,61.3,121.3):
    self.service.clock=lambda:at
    result=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
    status=json.loads((self.index.parent/'registrations/run1.json').read_text());self.assertEqual(status['reason'],'BUDGET_EXCEEDED');self.assertTrue(status['terminal'])
    path.write_bytes(before)
   self.assertEqual(len(calls),1,'BUDGET_EXCEEDED must not retry after repair')
   public=module.public_registration('run1',self.record['project'],None,self.index.parent/'registrations');self.assertEqual(public['reason'],'BUDGET_EXCEEDED');self.assertNotIn('terminal',public)
  finally:self.m.owner_export=original

 def test_known_peer_pid_with_wrong_birth_is_not_transient(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);binding=next(r for r in rows if r['kind']=='engine_process_binding');binding['engineStart']=str(int(binding['engineStart'])+1)
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in rows).encode(),'known peer PID wrong birth');reads=[]
  for at in (1.3,61.3,121.3):
   result,status=self.retry_ticks(module,profile,at,reads);self.assertEqual(status['reason'],'REGISTRATION_CONTEXT_UNAVAILABLE');self.assertTrue(status['terminal'])
  self.assertEqual(len(reads),1)

 def test_first_late_tick_expires_without_entering_owner_reader(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();reads=[]
  original=self.m.owner_export
  def forbidden(*a,**k):self.fail('expired queued intent entered owner reader')
  self.m.owner_export=forbidden
  try:report,status=self.retry_ticks(module,profile,181.3,reads)
  finally:self.m.owner_export=original
  self.assertEqual(status['reason'],'REGISTRATION_RETRY_EXPIRED');self.assertTrue(status['terminal']);self.assertFalse(self.index.exists());self.assertEqual(reads,[])

 def test_interrupted_owner_attempt_keeps_a_durable_terminal_stop(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();original=self.m.owner_export
  def interrupted(*args,**kwargs):raise KeyboardInterrupt('simulate collector interruption after persisted intent')
  self.m.owner_export=interrupted
  try:
   with self.assertRaises(KeyboardInterrupt):module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  finally:self.m.owner_export=original
  reads=[]
  for at in (61.3,121.3):
   report,status=self.retry_ticks(module,profile,at,reads);self.assertEqual(status['reason'],'REGISTRATION_ATTEMPT_INTERRUPTED');self.assertTrue(status['terminal'])
  self.assertEqual(reads,[])

 def test_legacy_unbound_without_retry_proof_never_enters_owner_reader(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  with sqlite3.connect(self.post/'mail.sqlite') as con:sha=con.execute('SELECT request_sha FROM usage_registrations WHERE run_id=?',('run1',)).fetchone()[0]
  legacy=module.status_value(answer['request'],sha,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE',1.3);legacy.pop('terminal');legacy.pop('retryUntil')
  self.m.atomic(self.index.parent/'registrations/run1.json',legacy,mode=0o644)
  original=self.m.owner_export
  def forbidden(*a,**k):self.fail('legacy UNBOUND granted an unauthenticated retry')
  self.m.owner_export=forbidden
  try:
   for at in (1.3,61.3,121.3):
    report,status=self.retry_ticks(module,profile,at,[]);self.assertEqual(report['unbound'],[dict(runId='run1',reason='REGISTRATION_CONTEXT_UNAVAILABLE',terminal=True)]);self.assertFalse(report['failed'])
  finally:self.m.owner_export=original

 def segmented_registration(self,parts=None,actual_writer=False,late_clock=False):
  from test_gateway_segments import write_store
  if late_clock:self.service.clock=lambda:1001.3
  answer=self.call(started_at=self.m.iso(1001200) if late_clock else None);self.assertTrue(answer['results'][0]['ok']);self.bind_process(answer['request']['operator']);p=self.record['participants'][0];original=self.m.lines(Path(p['sources']['gateway']).read_bytes())
  if late_clock:
   path=Path(p['runtimeSource']['native'][0]);native=[r for r in self.m.lines(path.read_bytes()) if r.get('type')!='turn/end']
   for i,r in enumerate(native[1:]):r['seq']=i
   path.write_text(''.join(json.dumps(r)+'\n' for r in native))
   original=[r for r in original if r['kind'] not in {'engine_terminal','engine_process_closed','turn_terminal'}]
   for i,r in enumerate(original):r['observedAt']+=1000000;r['seq']=i+1
  code=self.root/'supplier';shutil.copytree(PACKAGE/'test/fixtures/g-segment-writer',code);code.chmod(0o755)
  for f in code.rglob('*'):
   if f.is_file():f.chmod(0o644)
  shutil.copyfile('/usr/local/bin/node',code/'node');(code/'node').chmod(0o755)
  if actual_writer:
   meter_root=Path(p['home'])/'.usage-meter';meter_root.mkdir(mode=0o700);os.chown(meter_root,p['uid'],p['gid']);file=meter_root/'gateway-v1.jsonl'
   script=code/'writer-fixture.mjs'
   request=dict(module=(code/'usage-segments.mjs').as_uri(),file=str(file),parts=[original[:3],original[3:6],original[6:]])
   q=subprocess.run([str(code/'node'),str(script)],input=json.dumps(request),capture_output=True,text=True,timeout=10,user=p['uid'],group=p['gid'],extra_groups=[],env={'PATH':'/usr/bin:/bin'});self.assertEqual(q.returncode,0,q.stderr);view=json.loads(q.stdout)
   p['sources']['gateway']=str(file);p['gatewayTransport']=dict(version=1,policyCli=str(code/'usage-limits.mjs'),node=str(code/'node'),nodeSha256=hashlib.sha256((code/'node').read_bytes()).hexdigest())
   self.assertEqual(view['rows'],len(original));print('ACTUAL WRITER25d -> '+str(view['rows'])+' retained raw rows /2closed+active; no engine/model',flush=True)
  else:write_store(p['home'],p,[original[:3],original[3:6],original[6:]],code/'usage-limits.mjs',str(code/'node'))
  root=Path(p['sources']['gateway']).parent
  for f in [root,*root.rglob('*')]:os.chown(f,p['uid'],p['gid'])
  module,profile=self.registration();return module,profile,root,original

 def test_segmented_cross_boundary_registers_and_expense_consumer_observes(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED')
  ready=self.m.prepare(self.index,self.output,self.exporter);self.assertFalse(ready['failed'],ready)
  record=self.m.core.trusted_json(self.m.core.trusted_json(ready['index'])['runs'][0]['record']);self.m.core.verify_record_origin(record,self.m.LIMIT-ready['sourceBytes']);receipt=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt']
  self.assertEqual(receipt['schemaVersion'],4);self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['modelCalls'],1);self.assertGreater(ready['gatewayBytes'],0)

 def test_segmented_missing_middle_retention_gap_before_groups_is_final(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED');manifest=json.loads((root/'segments/manifest.json').read_text());path=root/'segments'/manifest['segments'][1]['file'];backup=path.with_suffix('.saved');path.rename(backup)
  decoder=self.package/'runtime/gateway_receipt_source.py';original=decoder.read_bytes();needle=b'def groups(rows,participant,requests):';self.assertEqual(original.count(needle),1);decoder.write_bytes(original.replace(needle,needle+b'\n    raise RuntimeError("groups called before missing-segment gate")'))
  try:
   result=self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP');status=json.loads((self.index.parent/'registrations/run1.json').read_text());self.assertTrue(status['terminal']);again=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(again['gatewayBytes'],0)
  finally:decoder.write_bytes(original);backup.rename(path)
  self.fresh_tick(module,profile,'REGISTERED')

 def test_actual_writer_segments_then_real_reader_registers(self):
  module,profile,root,rows=self.segmented_registration(actual_writer=True);self.fresh_tick(module,profile,'REGISTERED')

 def segment_replace(self,path,body,label):
  before=path.read_bytes();self.assertNotEqual(before,body);mode=stat.S_IMODE(path.stat().st_mode);path.chmod(0o600);path.write_bytes(body);path.chmod(mode)
  print('SEGMENT-ROOT-DAMAGE '+json.dumps(dict(label=label,replacements=1,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(path.read_bytes()).hexdigest())),flush=True);return before
 def segment_reset(self,p,parts):
  from test_gateway_segments import write_store
  transport=dict(p['gatewayTransport']);write_store(p['home'],p,parts,transport['policyCli'],transport['node']);root=Path(p['sources']['gateway']).parent
  for f in [root,*root.rglob('*')]:os.chown(f,p['uid'],p['gid'])
 def test_segmented_raw_and_seal_corruption_name_then_restore(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED');entry=json.loads((root/'segments/manifest.json').read_text())['segments'][0];path=root/'segments'/entry['file'];raw=path.read_bytes();self.assertEqual(raw.count(b'engine_process_start'),1)
  before=self.segment_replace(path,raw.replace(b'engine_process_start',b'engine_process_starb',1),'closed raw1token');self.fresh_tick(module,profile,'UNBOUND','G_SEGMENT_CORRUPT');path.chmod(0o600);path.write_bytes(before);path.chmod(0o400);self.fresh_tick(module,profile,'REGISTERED')
  seal=path.with_name(path.name.replace('.jsonl','.seal.json'));obj=json.loads(seal.read_bytes());obj['sha256']='0'*64;before=self.segment_replace(seal,json.dumps(obj).encode(),'seal1SHAfield');self.fresh_tick(module,profile,'UNBOUND','G_SEGMENT_INVALID');seal.chmod(0o600);seal.write_bytes(before);seal.chmod(0o400);self.fresh_tick(module,profile,'REGISTERED')
 def test_segmented_late_old_observer_keeps_current_ambiguity(self):
  import copy
  module,profile,root,a=self.segmented_registration(late_clock=True);p=self.record['participants'][0];b=copy.deepcopy(a);c=copy.deepcopy(a)
  for vector,suffix in [(b,'old-observer'),(c,'other-observer')]:
   for r in vector:
    r.update(generation=suffix,requestId=suffix)
    if 'request_id' in r:r['request_id']=suffix
  for r in b:r['observedAt']-=1000000
  self.segment_reset(p,[a,b,[]]);self.fresh_tick(module,profile,'REGISTERED')
  before=(root/'gateway-v1.jsonl').read_bytes();self.segment_reset(p,[a,b,c]);after=(root/'gateway-v1.jsonl').read_bytes();self.assertEqual(len(before),0);self.assertGreater(len(after),0);print('SEGMENT-ROOT-DAMAGE activeObserver0->1 SHA',hashlib.sha256(before).hexdigest(),'->',hashlib.sha256(after).hexdigest(),flush=True)
  self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_AMBIGUOUS');self.segment_reset(p,[a,b,[]]);self.fresh_tick(module,profile,'REGISTERED')
 def test_segmented_seq_and_source_gap_stay_source_gap(self):
  import copy
  module,profile,root,rows=self.segmented_registration();p=self.record['participants'][0];self.fresh_tick(module,profile,'REGISTERED')
  damaged=copy.deepcopy(rows);missing=damaged.pop(3);self.assertEqual(len(rows)-len(damaged),1);self.segment_reset(p,[damaged[:3],damaged[3:6],damaged[6:]]);print('SEGMENT-ROOT-DAMAGE missing raw seq='+str(missing['seq'])+' allphysicalfilespresent',flush=True);self.fresh_tick(module,profile,'UNBOUND','SOURCE_GAP')
  self.segment_reset(p,[rows[:3],rows[3:6],rows[6:]]);self.fresh_tick(module,profile,'REGISTERED')
  marked=copy.deepcopy(rows);marked.append(dict(marked[-1],kind='source_gap',scope='request',reason='SOURCE_GAP',seq=len(marked)+1));self.segment_reset(p,[marked[:3],marked[3:6],marked[6:]]);self.fresh_tick(module,profile,'UNBOUND','SOURCE_GAP');self.segment_reset(p,[rows[:3],rows[3:6],rows[6:]]);self.fresh_tick(module,profile,'REGISTERED')
 def test_segmented_deleted_max_frontier_blocks_at_cutoff_before_groups(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED');path=root/'segments/manifest.json';before=path.read_bytes();m=json.loads(before);m['deletedMaxObservedAt']=0;self.segment_replace(path,json.dumps(m).encode(),'deletedMax null->0 equals cutoff');self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP');path.write_bytes(before);self.fresh_tick(module,profile,'REGISTERED')
 def prepared_expense(self):
  ready=self.m.prepare(self.index,self.output,self.exporter);self.assertFalse(ready['failed'],ready);self.assertIsNotNone(ready['index'])
  report=self.m.core.iteration(ready['index'],self.output,ready['cut'],informational=True);self.assertEqual(report['runs'],1,report)
  receipt=self.m.core.read_public('run1',self.record['project']);self.assertIsNotNone(receipt)
  print('SEGMENT-EXPENSE '+json.dumps(dict(status=receipt['status'],missing=receipt['missing'],totals=receipt['totals'])),flush=True)
  return ready,receipt
 def test_segmented_expense_retention_failure_publishes_null_not_zero(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED')
  _,healthy=self.prepared_expense();self.assert_legacy_capture_partial(healthy);self.assertEqual(healthy['totals']['inputTokens'],100)
  entry=json.loads((root/'segments/manifest.json').read_text())['segments'][1];path=root/'segments'/entry['file'];pin=hashlib.sha256(path.read_bytes()).hexdigest();hold=path.with_suffix('.saved');path.rename(hold)
  self.assertFalse(path.exists());self.assertEqual(hashlib.sha256(hold.read_bytes()).hexdigest(),pin);print('RETENTION-EXPENSE-DAMAGE '+json.dumps(dict(missing=str(path),removed=1,beforeSHA256=pin,heldSHA256=hashlib.sha256(hold.read_bytes()).hexdigest())),flush=True)
  try:
   ready,receipt=self.prepared_expense();self.assertEqual(ready['runtimeReads'],[dict(source='master',error='RETENTION_GAP')])
   self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'],[dict(participant='master',reason='RETENTION_GAP')]);self.assertTrue(all(x is None for x in receipt['totals'].values()))
  finally:hold.rename(path)
  self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),pin);_,returned=self.prepared_expense();self.assert_legacy_capture_partial(returned);self.assertEqual(returned['totals']['inputTokens'],100)

 def test_segmented_owner_owned_node_uses_hash_not_ownership_then_returns(self):
  module,profile,root,rows=self.segmented_registration();p=self.record['participants'][0];node=Path(p['gatewayTransport']['node']);os.chown(node,p['uid'],p['gid']);self.assertNotEqual(node.stat().st_uid,0);self.fresh_tick(module,profile,'REGISTERED')
  _,healthy=self.prepared_expense();self.assert_legacy_capture_partial(healthy);self.assertEqual(healthy['totals']['inputTokens'],100)
  before=node.stat().st_size;pin=hashlib.sha256(node.read_bytes()).hexdigest();marker=b'NODE-PIN-ROOT-ONE\n';backup=node.with_name('node.saved');node.rename(backup);shutil.copyfile(backup,node);node.chmod(0o755);os.chown(node,p['uid'],p['gid'])
  with node.open('ab') as f:f.write(marker)
  with node.open('rb') as f:f.seek(before);self.assertEqual(f.read().count(marker),1)
  after=hashlib.sha256(node.read_bytes()).hexdigest();self.assertNotEqual(pin,after);print('NODE-PIN-ROOT-DAMAGE '+json.dumps(dict(uid=node.stat().st_uid,appendedBytes=len(marker),fixedMarkerCount=1,beforeSHA256=pin,afterSHA256=after)),flush=True)
  ready,receipt=self.prepared_expense();self.assertEqual(ready['runtimeReads'],[dict(source='master',error='NODE_PIN_MISMATCH')])
  self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'],[dict(participant='master',reason='NODE_PIN_MISMATCH')]);self.assertTrue(all(x is None for x in receipt['totals'].values()))
  self.fresh_tick(module,profile,'UNBOUND','NODE_PIN_MISMATCH')
  status=json.loads((self.index.parent/'registrations/run1.json').read_text());self.assertTrue(status['terminal']);again=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(again['gatewayBytes'],0)
  node.unlink();backup.rename(node)
  self.assertEqual(hashlib.sha256(node.read_bytes()).hexdigest(),pin);self.fresh_tick(module,profile,'REGISTERED')
  _,returned=self.prepared_expense();self.assert_legacy_capture_partial(returned);self.assertEqual(returned['totals']['inputTokens'],100)

 def seed_registration_queue(self,terminal=True):
  with self.service.guard,self.service.db:
   for i in range(128):
    run='seed-'+str(i);sha=hashlib.sha256(run.encode()).hexdigest();self.service.db.execute('INSERT INTO usage_registrations VALUES(?,?,?,?,?,?,?)',(run,sha,'{}',self.people_uid('master'),123,1.,'{}'))
    self.m.atomic(self.index.parent/'registrations'/(run+'.json'),dict(runId=run,requestSHA256=sha,state='UNBOUND',terminal=terminal,reason='REGISTRATION_CONTEXT_UNAVAILABLE'),mode=0o644)
 def people_uid(self,name):return pwd.getpwnam(name).pw_uid
 def test_128_terminal_root_statuses_release_queue_for_new_authenticated_request(self):
  self.seed_registration_queue();answer=self.call();self.assertEqual(answer['results'][0]['state'],'QUEUED',answer)
  with self.service.guard:self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  self.assertEqual(len(list((self.index.parent/'registrations').glob('seed-*.json'))),128,'root tombstones deleted')
 def test_128_pending_root_statuses_keep_queue_rows(self):
  self.seed_registration_queue(terminal=False);answer=self.call();self.assertEqual(answer['results'][0],dict(ok=False,reason='REGISTRATION_QUEUE_FULL'))
  with self.service.guard:self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],128)
 def test_actor_owned_completion_files_cannot_release_queue(self):
  self.seed_registration_queue();master=pwd.getpwnam('master')
  for file in (self.index.parent/'registrations').glob('seed-*.json'):os.chown(file,master.pw_uid,master.pw_gid)
  self.assertEqual(self.call()['results'][0],dict(ok=False,reason='REGISTRATION_QUEUE_FULL'))
 def test_queue_pruning_cannot_ack_live_owner_attempt(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();original=self.m.owner_export;seen=[]
  def pending(*args,**kw):
   status=self.m.core.trusted_json(self.index.parent/'registrations/run1.json');self.assertIs(status['terminal'],False,'live owner attempt exposed terminal status to mail prune');self.assertEqual(status['reason'],'REGISTRATION_IN_PROGRESS')
   public=module.public_registration('run1',self.record['project'],None,self.index.parent/'registrations');self.assertEqual(public['reason'],'REGISTRATION_IN_PROGRESS');self.assertEqual(public['authority'],'root')
   with self.service.guard,self.service.db:self.assertEqual(module.shared.prune_terminal(self.service.db,self.index.parent/'registrations'),[])
   with self.assertRaisesRegex(self.m.Incomplete,'REGISTRATION_DRAIN_BUSY'):module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
   seen.append(1);error=self.m.Incomplete('REGISTRATION_CONTEXT_UNAVAILABLE');error.retryable=True;raise error
  self.m.owner_export=pending
  try:module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  finally:self.m.owner_export=original
  self.assertEqual(seen,[1]);status=self.m.core.trusted_json(self.index.parent/'registrations/run1.json');self.assertIs(status['terminal'],False)
  with self.service.guard:self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)

 def test_oneoff_queue_cleanup_runs_as_post_owner_on_private_database(self):
  self.seed_registration_queue();self.service.stop();post=pwd.getpwnam('autopilot-post');state=Path('/var/lib/autopilot-mail');shutil.rmtree(state,ignore_errors=True);shutil.copytree(self.post,state)
  for item in [state,*state.rglob('*')]:os.chown(item,post.pw_uid,post.pw_gid)
  command=[sys.executable,'-I','-B',str(self.lib/'prune_registration_queue.py')]
  denied_root=subprocess.run(command,capture_output=True,text=True,timeout=5);self.assertEqual(denied_root.returncode,2);self.assertEqual(json.loads(denied_root.stdout)['error'],'REGISTRATION_PRUNE_ROLE_DENIED')
  import fcntl
  lock=os.open(state/'postman.lock',os.O_RDWR);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  try:
   busy=subprocess.run(command,user=post.pw_uid,group=post.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5);self.assertEqual(busy.returncode,2);self.assertEqual(json.loads(busy.stdout)['error'],'REGISTRATION_PRUNE_BUSY')
  finally:os.close(lock)
  q=subprocess.run(command,user=post.pw_uid,group=post.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,0,q.stdout+q.stderr);out=json.loads(q.stdout);self.assertEqual(out['deletedCount'],128);self.assertEqual(out['remaining'],0)
  with sqlite3.connect('file:'+str(state/'mail.sqlite')+'?mode=ro',uri=True) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0)
  self.assertEqual((state/'mail.sqlite').stat().st_uid,post.pw_uid);self.assertEqual(len(list((self.index.parent/'registrations').glob('seed-*.json'))),128)
  again=subprocess.run(command,user=post.pw_uid,group=post.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5);self.assertEqual(again.returncode,0,again.stdout+again.stderr);self.assertEqual(json.loads(again.stdout)['deletedCount'],0)
  denied=subprocess.run(command+['--dry-run'],user=post.pw_uid,group=post.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5);self.assertEqual(denied.returncode,2);self.assertEqual(json.loads(denied.stdout)['error'],'REGISTRATION_PRUNE_ARGUMENTS')

 def test_actual_source_loss_birth_gate_two_new_authenticated_requests(self):
  p=self.record['participants'][0];master=pwd.getpwnam('master');clock=[1001.3];self.service.clock=lambda:clock[0]
  native=Path(p['runtimeSource']['native'][0]);events=[e for e in self.m.lines(native.read_bytes()) if e.get('type')!='turn/end']
  for i,e in enumerate(events[1:]):e['seq']=i
  native.write_text(''.join(json.dumps(e)+'\n' for e in events))
  code=self.root/'birth-supplier';shutil.copytree(PACKAGE/'test/fixtures/g-segment-writer',code);code.chmod(0o755)
  for f in code.rglob('*'):
   if f.is_file():f.chmod(0o644)
  node=str(Path(shutil.which('node')).resolve());meter=Path(p['home'])/'.usage-meter';file=meter/'gateway-v1.jsonl';oldrows=self.m.lines(Path(p['sources']['gateway']).read_bytes());rows=[r for r in oldrows if r['kind'] not in {'engine_terminal','engine_process_closed','turn_terminal'}]
  client_code="""import sys,os,json
from pathlib import Path
sys.path.insert(0,sys.argv[1]);from mail_client import MailClient
pid=os.getpid();tail=Path('/proc/self/stat').read_text().rsplit(')',1)[1].split();op=dict(pid=pid,uid=os.getuid(),boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),start=tail[19]);print(json.dumps(op),flush=True);client=MailClient(sys.argv[2],server_uid=0,tls_cert=None)
for line in sys.stdin:
 value=json.loads(line);request=dict(op='usage_register',runId=value['runId'],project=sys.argv[3],startedAt=value['startedAt'],operator=op);print(json.dumps(client.request(request)),flush=True)
"""
  child=subprocess.Popen([sys.executable,'-I','-B','-c',client_code,str(self.lib),str(self.socket),self.record['project']],user=master.pw_uid,group=65534,extra_groups=[],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   who=json.loads(child.stdout.readline())
   for i,row in enumerate(rows):
    row['observedAt']+=1000000;row['seq']=i+1
    if row['kind']=='watermark':row['at']+=1000000
    if row['kind']=='engine_process_binding':row.update(enginePid=who['pid'],engineStart=who['start'],boot_id=who['boot'])
   def writer(parts,birth,at):
    q=subprocess.run([node,str(code/'writer-fixture.mjs')],input=json.dumps(dict(module=(code/'usage-segments.mjs').as_uri(),file=str(file),parts=parts,sourceCreatedAt=birth,firstWriteAt=at)),user=master.pw_uid,group=master.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,0,q.stderr);return json.loads(q.stdout)
   writer([rows],0,1002000);old_source=json.loads(Path(str(file)+'.source.json').read_text());p['sources']['gateway']=str(file);p['gatewayTransport']=dict(version=1,policyCli=str(code/'usage-limits.mjs'),node=node,nodeSha256=hashlib.sha256(Path(node).read_bytes()).hexdigest());module,profile=self.registration();profile_sha=hashlib.sha256(profile.read_bytes()).hexdigest()
   shutil.rmtree(meter);self.assertFalse(meter.exists());writer([rows],1000000,1002000);new_source=json.loads(Path(str(file)+'.source.json').read_text());self.assertNotEqual(old_source['sourceId'],new_source['sourceId']);self.assertEqual(new_source['sourceCreatedAt'],1000000);self.assertEqual(hashlib.sha256(profile.read_bytes()).hexdigest(),profile_sha)
   print('BIRTH-LOSS '+json.dumps(dict(directoryRemoved=True,oldSourceSHA256=hashlib.sha256(json.dumps(old_source,sort_keys=True).encode()).hexdigest(),newSourceSHA256=hashlib.sha256(json.dumps(new_source,sort_keys=True).encode()).hexdigest(),sourceCreatedAt=new_source['sourceCreatedAt'],profileUnchanged=True)),flush=True)
   def submit(run,started):
    child.stdin.write(json.dumps(dict(runId=run,startedAt=self.m.iso(started)))+'\n');child.stdin.flush();reply=json.loads(child.stdout.readline());self.assertEqual(reply['state'],'QUEUED',reply)
   submit('birth-early',1001200);first=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);early=self.m.core.trusted_json(self.index.parent/'registrations/birth-early.json');self.assertEqual(early['reason'],'RETENTION_GAP',first);self.assertTrue(early['terminal'])
   clock[0]=1601.3;again=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(again['gatewayBytes'],0);self.assertEqual(self.m.core.trusted_json(self.index.parent/'registrations/birth-early.json')['acceptedAt'],early['acceptedAt'])
   heartbeat=dict(rows[-1],kind='watermark',seq=len(rows)+1,observedAt=1601300,at=1601300);writer([[heartbeat]],1601300,1601300);self.assertEqual(json.loads(Path(str(file)+'.source.json').read_text())['sourceCreatedAt'],1000000)
   submit('birth-late',1601200);result=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);late=self.m.core.trusted_json(self.index.parent/'registrations/birth-late.json');self.assertEqual(late['state'],'REGISTERED',result);self.assertEqual(result['registered'],['birth-late']);self.assertFalse(result['failed'],result)
   print('BIRTH-TWO-REQUESTS '+json.dumps(dict(earlyAcceptedAt=early['acceptedAt'],earlyReason=early['reason'],lateAcceptedAt=late['acceptedAt'],lateState=late['state'],elapsedSeconds=600,oldRequestDidNotHeal=True)),flush=True)
  finally:
   child.stdin.close();child.terminate();child.wait(timeout=3)
 def test_enospc_closed_partial_missing_seal_and_seal_missing_raw_refuse(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED');entry=json.loads((root/'segments/manifest.json').read_text())['segments'][1];raw=root/'segments'/entry['file'];seal=raw.with_name(raw.name.replace('.jsonl','.seal.json'));body=raw.read_bytes();held=seal.with_suffix('.held');seal.rename(held);raw.chmod(0o600);raw.write_bytes(body[:len(body)//2]);raw.chmod(0o400)
  print('ENOSPC-ROOT partial/noseal '+json.dumps(dict(beforeSHA256=hashlib.sha256(body).hexdigest(),afterSHA256=hashlib.sha256(raw.read_bytes()).hexdigest(),sealExists=seal.exists())),flush=True);self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP')
  raw.chmod(0o600);raw.write_bytes(body);raw.chmod(0o400);held.rename(seal);self.fresh_tick(module,profile,'REGISTERED');held=raw.with_suffix('.held');raw.rename(held);self.assertFalse(raw.exists());self.assertTrue(seal.is_file());self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP');held.rename(raw);self.fresh_tick(module,profile,'REGISTERED')
 def test_process_active_replacement_gap_and_unfinished_intent(self):
  module,profile,root,rows=self.segmented_registration();self.fresh_tick(module,profile,'REGISTERED');p=self.record['participants'][0];marker=dict(rows[-1],kind='source_gap',scope='process',reason='G_ACTIVE_REPLACED',seq=len(rows)+1,observedAt=rows[-1]['observedAt']+1,replacedFile='quarantine.replaced');self.segment_reset(p,[rows[:3],rows[3:]+[marker],[]]);quarantine=root/'segments/quarantine.replaced';quarantine.write_bytes(b'not canonical JSON');quarantine.chmod(0o400);os.chown(quarantine,p['uid'],p['gid']);self.fresh_tick(module,profile,'UNBOUND','SOURCE_GAP');self.segment_reset(p,[rows[:3],rows[3:6],rows[6:]]);self.fresh_tick(module,profile,'REGISTERED')
  intent=root/'segments/intent.json';intent.write_text(json.dumps(dict(op='active_gap')));intent.chmod(0o600);os.chown(intent,p['uid'],p['gid']);self.fresh_tick(module,profile,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE');status=self.m.core.trusted_json(self.index.parent/'registrations/run1.json');self.assertFalse(status['terminal']);intent.unlink();self.fresh_tick(module,profile,'REGISTERED')

 def collector_at(self,at,profile):
  code='import runpy,sys;from unittest.mock import patch;path=sys.argv.pop(1)\nwith patch("time.time",return_value='+repr(at)+'):runpy.run_path(path,run_name="__main__")'
  q=subprocess.run([sys.executable,'-I','-B','-c',code,str(self.package/'tools/collect-team-usage.py'),'--index',str(self.index),'--output',str(self.output),'--profile',str(profile)],capture_output=True,text=True,timeout=15)
  print('TERMINAL-COLLECTOR '+json.dumps(dict(at=at,rc=q.returncode,report=json.loads(q.stdout))),flush=True)
  return q,json.loads(q.stdout)

 def test_expired_request_is_completed_without_tick_failure_then_postal_prunes(self):
  self.call();module,profile=self.registration()
  q,report=self.collector_at(181.3,profile)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  status=self.m.core.trusted_json(self.index.parent/'registrations/run1.json')
  self.assertEqual(status['state'],'UNBOUND');self.assertIs(status['terminal'],True);self.assertEqual(status['reason'],'REGISTRATION_RETRY_EXPIRED')
  self.assertEqual(report['registration']['failed'],[]);self.assertEqual(report['registration']['unbound'],[dict(runId='run1',reason='REGISTRATION_RETRY_EXPIRED',terminal=True)])
  self.assertEqual(report['registration']['gatewayBytes'],0)
  q,again=self.collector_at(181.4,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(again['registration']['failed'],[]);self.assertEqual(again['registration']['unbound'],[dict(runId='run1',reason='REGISTRATION_RETRY_EXPIRED',terminal=True)])
  # Postal SQLite owner, actual existing maintenance caller; no root DB mutation.
  swept=self.service.retention_tick(force=True);self.assertEqual(swept['registrationPruned'],['run1'])
  self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0)
  self.assertTrue((self.index.parent/'registrations/run1.json').is_file())
  q,report=self.collector_at(241.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(report['registration']['failed'],[]);self.assertFalse(self.index.exists())

 def test_pending_request_inside_window_remains_on_postal_maintenance(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);prefix=rows[:next(i for i,r in enumerate(rows) if r['kind']=='engine_process_binding')]
  self.gateway_damage(before,''.join(json.dumps(r)+'\n' for r in prefix).encode(),'pending prefix without binding')
  q,report=self.collector_at(1.3,profile);self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  status=self.m.core.trusted_json(self.index.parent/'registrations/run1.json');self.assertIs(status['terminal'],False)
  swept=self.service.retention_tick(force=True);self.assertEqual(swept['registrationPruned'],[])
  self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  path.write_bytes(before);q,report=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(report['registration']['registered'],['run1'])
  self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],['run1'])

 def test_unproven_queue_origin_stays_failed_and_unpruned(self):
  self.call();module,profile=self.registration()
  with self.service.guard,self.service.db:self.service.db.execute('UPDATE usage_registrations SET peer_uid=?',(pwd.getpwnam('sova').pw_uid,))
  q,report=self.collector_at(181.3,profile);self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertEqual(report['registration']['failed'][0]['reason'],'REGISTRATION_ORIGIN_UNPROVEN')
  self.assertFalse((self.index.parent/'registrations/run1.json').exists(),'unproven request acquired pruneable root authority')
  self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],[])
  self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)

 def test_postal_prune_rolls_back_with_failed_maintenance_transaction(self):
  self.seed_registration_queue();original=self.service.queue_capacity_warning
  def fail(*args,**kwargs):raise sqlite3.OperationalError('injected after prune')
  self.service.queue_capacity_warning=fail
  try:swept=self.service.retention_tick(force=True)
  finally:self.service.queue_capacity_warning=original
  self.assertFalse(swept['ok']);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],128)
  swept=self.service.retention_tick(force=True);self.assertEqual(len(swept['registrationPruned']),128);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0)

 def test_global_profile_failure_is_not_a_completed_registration(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();before=profile.read_bytes();link=self.root/'profile-alias';link.symlink_to(self.root,target_is_directory=True);data=json.loads(before);data['projectRoots']=[str(link)];profile.write_text(json.dumps(data));profile.chmod(0o600)
  q,report=self.collector_at(1.3,profile);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(report['registration']['failed'][0]['reason'],'REGISTRATION_PROFILE_INVALID');self.assertEqual(report['registration']['unbound'],[])
  self.assertFalse((self.index.parent/'registrations/run1.json').exists());self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],[]);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  profile.write_bytes(before);q,report=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(report['registration']['registered'],['run1'])

 def test_caught_owner_io_failure_restores_pending_before_next_tick(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();original=self.m.owner_export
  def failure(*args,**kwargs):raise OSError('known owner transport failure')
  self.m.owner_export=failure
  try:report=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  finally:self.m.owner_export=original
  self.assertEqual(report['unbound'],[]);self.assertEqual(report['failed'][0]['reason'],'REGISTRATION_UNAVAILABLE');self.assertFalse((self.index.parent/'registrations/run1.json').exists());self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],[])
  self.service.clock=lambda:61.3;report=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(report['registered'],['run1']);self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],['run1'])

 def test_diagnostic_publication_failure_does_not_leave_interruption_sentinel(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();owner=self.m.owner_export;atomic=self.m.atomic
  def failure(*args,**kwargs):
   error=self.m.Incomplete('BUDGET_EXCEEDED');error.gatewaySnapshot=dict(sizeBytes=1,readBytes=0,elapsedSeconds=0,byteLimit=module.G_READ_LIMIT,secondsLimit=module.G_READ_SECONDS);raise error
  def broken(path,*args,**kwargs):
   if path.parent.name=='registration-budget':raise OSError('injected diagnostic publication failure')
   return atomic(path,*args,**kwargs)
  self.m.owner_export=failure;self.m.atomic=broken
  try:first=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock)
  finally:self.m.owner_export=owner;self.m.atomic=atomic
  self.assertTrue(first['reason']);self.assertEqual(first['unbound'],[]);self.assertFalse((self.index.parent/'registrations/run1.json').exists());self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],[])
  self.service.clock=lambda:61.3;second=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(second['registered'],['run1']);self.assertEqual(second['unbound'],[])

 def test_ambiguous_final_pruned_then_next_collector_tick_is_zero(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration()
  path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();who=json.loads(self.service.db.execute('SELECT operator_json FROM usage_registrations').fetchone()[0])
  grant=dict(participant=self.record['participants'][0],registrationContext=dict(operator=who,startedAt=answer['request']['startedAt'],acceptedAt=module.datetime.fromtimestamp(1.3,module.timezone.utc).isoformat()),budget=self.m.LIMIT,seconds=3,gatewayBudget=module.G_READ_LIMIT,gatewaySeconds=module.G_READ_SECONDS)
  healthy=self.m.owner_export(grant,self.exporter,12);self.assertIn('operator',healthy)
  rows=self.m.lines(before);binding=next(row for row in rows if row['kind']=='engine_process_binding');self.assertEqual(sum(row['kind']=='engine_process_binding' for row in rows),1)
  rows.insert(rows.index(binding)+1,dict(binding))
  for i,row in enumerate(rows):row['seq']=i+1
  damaged=''.join(json.dumps(row)+'\n' for row in rows).encode();self.assertNotEqual(before,damaged);self.assertEqual(sum(row['kind']=='engine_process_binding' for row in rows),2);self.gateway_damage(before,damaged,'AMBIGUOUS actual binding count 1->2, seq recomputed')
  q,report=self.collector_at(1.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);reg=report['registration'];self.assertEqual(reg['failed'],[]);self.assertEqual(reg['unbound'],[dict(runId='run1',reason='REGISTRATION_CONTEXT_AMBIGUOUS',terminal=True)])
  status_path=self.index.parent/'registrations/run1.json';status=self.m.core.trusted_json(status_path);self.assertEqual(status['state'],'UNBOUND');self.assertIs(status['terminal'],True);self.assertEqual(status['reason'],'REGISTRATION_CONTEXT_AMBIGUOUS');self.assertFalse(self.index.exists());self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  q,report=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(report['registration']['gatewayBytes'],0);self.assertEqual(report['registration']['failed'],[]);self.assertEqual(report['registration']['unbound'],[dict(runId='run1',reason='REGISTRATION_CONTEXT_AMBIGUOUS',terminal=True)])
  stamp=status_path.read_bytes();swept=self.service.retention_tick(force=True);self.assertEqual(swept['registrationPruned'],['run1']);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0);self.assertEqual(status_path.read_bytes(),stamp)
  path.write_bytes(before);self.assertEqual(path.read_bytes(),before);restored=self.m.owner_export(grant,self.exporter,12);self.assertEqual(restored['operator'],healthy['operator'])
  q,report=self.collector_at(121.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(report['registration']['failed'],[]);self.assertEqual(report['registration']['gatewayBytes'],0);self.assertEqual(status_path.read_bytes(),stamp);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],0)
  print('AMBIGUOUS-END-TO-END '+json.dumps(dict(healthyOwner=True,damageBindingCount=2,firstCollectorRC=0,finalReason=status['reason'],terminal=True,beforePruneNextTickRC=0,beforePruneGBytes=0,postalPruned=swept['registrationPruned'],remainingRows=0,restoredOwnerMatches=True,afterPruneNextTickRC=0,afterPruneGBytes=0,tombstonePreserved=True,automaticRevival=False)),flush=True)

 def test_actual_ced3_flat_file_then_25d_migration_crosses_s0_s1(self):
  from test_gateway_segments import encode
  p=self.record['participants'][0];oldroot=self.root/'ced3';modernroot=self.root/'writer25d';shutil.copytree(PACKAGE/'test/fixtures/g-ced3-writer',oldroot);shutil.copytree(PACKAGE/'test/fixtures/g-segment-writer',modernroot)
  for folder in [oldroot,modernroot]:
   folder.chmod(0o755)
   for f in folder.rglob('*'):
    if f.is_file():f.chmod(0o644)
  native_path=Path(p['runtimeSource']['native'][0]);native=[r for r in self.m.lines(native_path.read_bytes()) if r.get('type')!='turn/end']
  for i,r in enumerate(native[1:]):r['seq']=i
  native_path.write_bytes(encode(native))
  template=self.m.lines(Path(p['sources']['gateway']).read_bytes())[0];meter=Path(p['home'])/'.usage-meter';meter.mkdir(mode=0o700);os.chown(meter,p['uid'],p['gid']);file=meter/'gateway-v1.jsonl';p['sources']['gateway']=str(file)
  child=self.root/'peer.py';child.write_text("import sys,json,os\nfrom pathlib import Path\nc=json.loads(sys.stdin.readline());sys.path.insert(0,c['lib']);from mail_client import MailClient\nprint(json.dumps({'ready':True}),flush=True)\nfor line in sys.stdin:\n q=json.loads(line);pid=os.getpid();start=Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19];op=dict(pid=pid,uid=os.getuid(),start=start,boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip());request=dict(op='usage_register',runId=q['runId'],project=c['project'],startedAt=q['startedAt'],operator=op);post=MailClient(c['socket'],server_uid=0,tls_cert=None);print(json.dumps(post.request(request)),flush=True)\n");child.chmod(0o644)
  config=dict(old=(oldroot/'usage-producer.mjs').as_uri(),new=(modernroot/'usage-producer.mjs').as_uri(),segments=(modernroot/'usage-segments.mjs').as_uri(),file=str(file),python=sys.executable,child=str(child),lib=str(self.lib),socket=str(self.socket),project=self.record['project'],home=p['home'],descriptor=dict(request_id=template['requestId'],binding=dict(session_id=template['sessionId'],session_created=template['sessionCreated'],turn=template['dshTurn'],generation=template['requestGeneration'],recipient='master')),thread='thread-master',turn='turn-master')
  node=str(Path(shutil.which('node')).resolve());proc=subprocess.Popen([node,str(oldroot/'migration-bridge.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,user=p['uid'],group=65534,extra_groups=[],env={'PATH':'/usr/bin:/bin','HOME':p['home'],'CODEX_HOME':p['home']});proc.stdin.write(json.dumps(config)+'\n');proc.stdin.flush()
  def command(value):
   proc.stdin.write(json.dumps(value)+'\n');proc.stdin.flush();line=proc.stdout.readline()
   if not line:self.fail('writer child exited: '+proc.stderr.read())
   answer=json.loads(line);self.assertFalse(answer.get('failure'),answer);return answer
  try:
   legacy=command(dict(action='old'));self.assertFalse((meter/'segments').exists());self.assertTrue(command(dict(action='submit',runId='run1',startedAt=self.m.iso(1200)))['ok']);module,profile=self.registration();first=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(first['registered'],['run1'],first)
   self.assertEqual(self.service.retention_tick(force=True)['registrationPruned'],['run1'])
   # Separate private root registration baseline; the physical G file stays intact.
   self.assertEqual(self.index.parent,Path('/var/lib/autopilot-usage'));shutil.rmtree(self.index.parent)
   migrated=command(dict(action='migrate'));self.assertEqual(migrated['beforeSHA256'],migrated['afterSHA256']);self.assertEqual(migrated['source']['sourceCreatedAt'],1300)
   view=command(dict(action='modern'));manifest=view['manifest'];self.assertEqual(manifest['active']['segmentNo'],1);self.assertEqual(manifest['active']['origins'][view['generation']],0);self.assertTrue(any(g['generation']==view['generation'] for g in manifest['segments'][0]['generations']))
   p['gatewayTransport']=dict(version=1,policyCli=str(modernroot/'usage-limits.mjs'),node=node,nodeSha256=hashlib.sha256(Path(node).read_bytes()).hexdigest());self.service.clock=lambda:4201.3;self.assertTrue(command(dict(action='submit',runId='run2',startedAt=self.m.iso(4201200)))['ok']);module,profile=self.registration();second=module.drain(self.m,self.index,self.output,profile,self.exporter,clock=self.service.clock);self.assertEqual(second['registered'],['run2'],second)
   print('ACTUAL-CED3-25D '+json.dumps(dict(firstRegistered=first['registered'],sameFile=str(file),legacySHA256=legacy['fileSHA256'],migrationBytesUnchanged=True,sourceCreatedAt=1300,secondAcceptedAt=4201300,windowStart=3601300,generation=view['generation'],closedSegment0=True,activeSegment1=True,secondRegistered=second['registered'],kernelChild=True,privateRootBaselineReset=True,models=False)),flush=True)
  finally:
   if proc.poll() is None:
    try:command(dict(action='stop'))
    except (OSError,AssertionError):pass
   try:proc.communicate(timeout=5)
   except subprocess.TimeoutExpired:proc.kill();proc.communicate(timeout=5)

 def test_new_intent_prunes_old_ambiguous_without_failing_collector(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();path=Path(self.record['participants'][0]['sources']['gateway']);before=path.read_bytes();rows=self.m.lines(before);binding=next(row for row in rows if row['kind']=='engine_process_binding');rows.insert(rows.index(binding)+1,dict(binding))
  for i,row in enumerate(rows):row['seq']=i+1
  self.gateway_damage(before,''.join(json.dumps(row)+'\n' for row in rows).encode(),'AMBIGUOUS before independent new intent');q,first=self.collector_at(1.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(first['registration']['unbound'][0]['reason'],'REGISTRATION_CONTEXT_AMBIGUOUS')
  q,second=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(second['registration']['failed'],[]);self.assertEqual(second['registration']['unbound'][0]['reason'],'REGISTRATION_CONTEXT_AMBIGUOUS');self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
  self.service.clock=lambda:61.3;created=self.call(run_id='run2',started_at=self.m.iso(61200));self.assertEqual(created['results'][0]['state'],'QUEUED');self.assertEqual([row[0] for row in self.service.db.execute('SELECT run_id FROM usage_registrations')],['run2']);self.assertTrue((self.index.parent/'registrations/run1.json').is_file())
  print('TERMINAL-EDGE-NEW-INIT firstTick=0 nextTick=0 newRun=run2 oldQueueRowRemoved=True rootTombstoneKept=True',flush=True)

 def test_legacy_guard_hides_no_closed_generation_and_source_mutation_returns(self):
  import copy
  from test_gateway_segments import write_store
  from test_gateway_receipt_source import load
  answer=self.call();self.bind_process(answer['request']['operator']);p=self.record['participants'][0];c=self.m.lines(Path(p['sources']['gateway']).read_bytes());a=copy.deepcopy(c)
  for row in a:
   for key in ('generation','processGeneration','requestId','requestGeneration','processEpoch','sessionId'):
    if key in row:row[key]+='-closed-A'
   if 'request_id' in row:row['request_id']=row['requestId']
  g=load()
  with self.assertRaisesRegex((g.Incomplete,ValueError),'AMBIGUOUS'):g.process_requests(a+c,p)
  home=Path(p['home']);write_store(home,p,[a,c]);p.pop('gatewayTransport')
  store=home/'.usage-meter'
  for value in [store,*store.rglob('*')]:os.chown(value,p['uid'],p['gid'])
  module,profile=self.registration();self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP')
  retained=self.root/'retained-segments';source=store/'gateway-v1.jsonl.source.json';retained_source=self.root/'retained-source.json';(store/'segments').rename(retained);source.rename(retained_source)
  self.fresh_tick(module,profile,'REGISTERED')
  retained.rename(store/'segments');retained_source.rename(source);self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP')
  implementation=self.package/'runtime/runtime_receipt_source.py';before=implementation.read_bytes();target=b"require(not any(os.path.lexists(marker) for marker in markers),'RETENTION_GAP')";self.assertEqual(before.count(target),1);after=before.replace(target,b'return # injected missing legacy history guard',1);self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest());implementation.write_bytes(after)
  print('LEGACY-GUARD-DAMAGE '+json.dumps(dict(replacements=1,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(after).hexdigest(),closedGeneration='A',activeGeneration='C')),flush=True)
  try:
   self.fresh_tick(module,profile,'REGISTERED');print('FALSE_REGISTERED_WITH_CLOSED_A_WHEN_GUARD_REMOVED',flush=True)
  finally:implementation.write_bytes(before)
  self.assertEqual(hashlib.sha256(implementation.read_bytes()).hexdigest(),hashlib.sha256(before).hexdigest());self.fresh_tick(module,profile,'UNBOUND','RETENTION_GAP')

 def engine_account_fixture(self):
  answer=self.call();self.bind_process(answer['request']['operator']);module,profile=self.registration();path=Path(self.record['participants'][0]['sources']['gateway']);rows=self.m.lines(path.read_bytes());rows[0].update(authLinkTargetAtStart='/etc/claude-oauth/codex-podpiska-4/auth.json',authLinkMeaning='route-not-applied-source');auth=next(row for row in rows if row['kind']=='auth')
  for key in ['subscription','authEpoch','proof']:auth.pop(key,None)
  auth.update(accountRef='a'*64,authEpoch='c'*64,authMode='chatgpt',planType='pro',proof='engine-account-read');path.write_text(''.join(json.dumps(row)+'\n' for row in rows));mapping=Path('/var/lib/autopilot-usage/codex-account-map.json');self.m.atomic(mapping,dict(schemaVersion=1,accounts={'a'*64:'codex-3','b'*64:'codex-4'}),mode=0o644)
  return module,profile,path,rows,mapping
 def current_receipt(self):
  base=self.output/'run1';pointer=json.loads((base/'current.json').read_text());return json.loads((base/'public'/pointer['generation']/'receipt.json').read_text())
 def test_engine_account_read_known_map_then_unmapped_then_restore(self):
  module,profile,path,rows,mapping=self.engine_account_fixture();q,report=self.collector_at(1.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);first=self.current_receipt();self.assert_legacy_capture_partial(first);self.assertEqual(first['totals']['modelCalls'],1);self.assertEqual(first['bySubscription']['codex-3']['modelCalls'],1)
  prepared=self.m.prepare(self.index,self.output,self.exporter);record=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record']);normalized=self.m.lines(Path(record['participants'][0]['sources']['gateway']).read_bytes());request=next(row for row in normalized if row['kind']=='request');self.assertEqual(request['authEpoch'],'c'*64,'AP recomputed writer epoch');self.assertNotIn('accountRef',request);self.assertNotIn('account_id',request);self.assertNotIn('email',request)
  saved=mapping.read_bytes();self.m.atomic(mapping,dict(schemaVersion=1,accounts={'b'*64:'codex-3'}),mode=0o644);changed=mapping.read_bytes();self.assertEqual(saved.count(b'a'*64),1);self.assertEqual(changed.count(b'a'*64),0);self.assertNotEqual(hashlib.sha256(saved).hexdigest(),hashlib.sha256(changed).hexdigest());print('ACCOUNT-MAP-DAMAGE '+json.dumps(dict(removedAccountRefs=1,beforeSHA256=hashlib.sha256(saved).hexdigest(),afterSHA256=hashlib.sha256(changed).hexdigest())),flush=True);q,report=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);receipt=self.current_receipt();self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['inputTokens'],100);self.assertEqual(receipt['bySubscription']['codex-4']['inputTokens'],100);self.assertEqual(receipt['rows'][0]['subscriptionSource'],'switcher')
  self.m.atomic(mapping,json.loads(saved),mode=0o644);q,report=self.collector_at(121.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assert_legacy_capture_partial(self.current_receipt());self.assertEqual(self.current_receipt()['totals']['inputTokens'],100);self.assertEqual(self.current_receipt()['bySubscription']['codex-3']['inputTokens'],100);self.assertEqual(self.current_receipt()['rows'][0]['subscriptionSource'],'engine-account-read')
 def test_engine_account_negative_names_survive_real_consumer_and_restore(self):
  module,profile,path,rows,mapping=self.engine_account_fixture();q,_=self.collector_at(1.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);before=path.read_bytes()
  for reason in ['ACCOUNT_CHANGED_DURING_TURN','ACCOUNT_ROUTING_OVERRIDE','ACCOUNT_READ_ERROR','ACCOUNT_READ_TIMEOUT']:
   damaged=json.loads(json.dumps(rows));auth=next(row for row in damaged if row['kind']=='auth');auth.pop('proof');auth.update(accountRef=None,authEpoch=None,authMode=None,planType=None,reason='SUBSCRIPTION_UNBOUND',detail=reason);self.gateway_damage(before,''.join(json.dumps(row)+'\n' for row in damaged).encode(),reason);q,_=self.collector_at(61.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);receipt=self.current_receipt();self.assert_legacy_capture_partial(receipt);self.assertEqual(receipt['totals']['inputTokens'],100);self.assertEqual(receipt['bySubscription']['codex-4']['inputTokens'],100);self.assertEqual(receipt['rows'][0]['subscriptionSource'],'switcher');path.write_bytes(before);q,_=self.collector_at(121.3,profile);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assert_legacy_capture_partial(self.current_receipt());self.assertEqual(self.current_receipt()['bySubscription']['codex-3']['inputTokens'],100);self.assertEqual(self.current_receipt()['rows'][0]['subscriptionSource'],'engine-account-read')
