"""Privileged fixture stand: actual source code, real SQLite/zstd/UID, no model calls."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy,hashlib,importlib.util,json,os,pwd,shutil,sqlite3,subprocess,sys,tempfile,unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1];TOOL=P/'tools/measure-run-claude-root.py';RUN='a'*32;THREAD='11111111-1111-4111-8111-111111111111';MASTER=pwd.getpwnam('master')

def fact(label,path,needle=None):
 # SHA reads bytes; native stat/grep independently identify metadata and payload.
 path=Path(path);data=path.read_bytes();value={'probe':label,'path':str(path),'sha256':hashlib.sha256(data).hexdigest(),'nativeSha256':subprocess.check_output(['sha256sum',str(path)],text=True).split()[0],'stat':subprocess.check_output(['stat','--printf=%u:%g:%a:%F:%i',str(path)],text=True)}
 if needle is not None:
  result=subprocess.run(['grep','-cF',needle,str(path)],capture_output=True,text=True);assert result.returncode in (0,1);value['fixedCount']=int(result.stdout)
 print(json.dumps(value,ensure_ascii=False),flush=True);return value

def snapshot(engine):
 return {'schemaVersion':1,'runId':RUN,'byEngine':{engine:{'status':'observed','measuredAt':'2026-01-02T00:00:00Z','windowStart':'2026-01-01T00:00:01Z','windowEnd':'2026-01-01T00:00:06Z','source':'claude-sdk-jsonl' if engine=='claude' else 'codex-rollout-gateway','scope':'declared_requests' if engine=='claude' else 'declared_threads','coverage':'declared_parent_and_children' if engine=='claude' else 'root_gateway_only','modelCalls':1,'inputTokens':8,'uncachedInputTokens':1,'outputTokens':2,'cacheReadTokens':3,'cacheWriteTokens':4}}}

@unittest.skipUnless(os.geteuid()==0,'root UID fixture stand required')
class RootUsage(unittest.TestCase):
 def setUp(self):
  self.assertTrue(TOOL.is_file(),'thin root entry is absent')
  # The stand is copied below /root before execution. Every code/data ancestor is protected.
  self.temp=tempfile.TemporaryDirectory(prefix='root-usage-',dir=P.parent);self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name);self.root=self.base/'root';_fixture_mkdir(self.root, mode=0o755);self.run=RUN;self.session='telegram-autopilot-team';self.created=123;self.turn=1;self.rid='parent-request';self.mailid='1'*64;self.receipt='receipt';self.mid='message';self.gen='generation';self.rows=[]
  self.mail=self.at('/var/lib/autopilot-mail/mail.sqlite');self.receipts=self.at('/opt/sova/workspace/.message-receipts/receipts.sqlite');self.sdk=self.at('/opt/sova/.claude/projects/-opt-sova');_fixture_mkdir(self.sdk, mode=0o755, parents=True)
  _fixture_mkdir(self.mail.parent, mode=0o755, parents=True);_fixture_mkdir(self.receipts.parent, mode=0o755, parents=True)
  with sqlite3.connect(self.mail) as db:db.execute('CREATE TABLE messages(id TEXT,sender TEXT,sender_uid INTEGER,recipient TEXT,body TEXT,subject TEXT)')
  with sqlite3.connect(self.receipts) as db:
   db.execute('CREATE TABLE receipts(id TEXT,logical_key TEXT,dsh_id TEXT,session_id TEXT,session_created INTEGER,claimed_turn INTEGER,claimed_at INTEGER,finished_at INTEGER,outcome TEXT,blocked TEXT,execution_owner TEXT)')
   db.execute('CREATE TABLE mail_sdk_requests(request_id TEXT PRIMARY KEY,generation TEXT,session_id TEXT,session_created INTEGER,turn INTEGER,binding_json TEXT,state TEXT,started_at INTEGER,terminal_at INTEGER,reason TEXT)')
   db.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)',(self.receipt,'ap-notice:'+self.mailid,self.mid,self.session,self.created,1,1767225601100,1767225606000,'turn_completed',None,self.gen))
   binding={'request_id':self.rid,'generation':self.gen,'recipient':'sova','ledger_uuid':'ledger','session_id':self.session,'session_created':self.created,'turn':1,'sdk_thread_id':THREAD,'sdk_turn_id':'sdk-turn','sdk_generation':'sdk-generation'}
   db.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)',(self.rid,self.gen,self.session,self.created,1,json.dumps(binding),'terminal',1767225601500,1767225605000,'completed'))
  self.body='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'task','run':RUN,'sender':'master','task':{'job_id':'job','ticket':'T1','recipient':'sova','role':'executor','cwd':str(self.base),'zone':['result.txt'],'requirements':['R1'],'brief':'candidate only','deadline':1767229200,'context_request':'fresh','parent_job_id':None,'context_ref':None}});self.set_mail(self.body)
  self.events=[{'type':'session','version':4,'id':self.session,'createdAt':self.created},self.ev('agent/inbox/spliced',0,500,{'target':'next-turn','start':0,'removedCount':0,'inserted':[{'id':self.mid}]}),self.ev('turn/start',1,1000,{'turn':1}),self.ev('agent/inbox/spliced',2,1100,{'target':'next-turn','start':0,'removedCount':1,'inserted':[]}),self.ev('turn/end',3,6000,{'turn':1,'reason':{'kind':'completed'}})];self.write_dsh()
  (self.sdk/(THREAD+'.jsonl')).write_text(json.dumps({'type':'assistant','sessionId':THREAD,'timestamp':'2026-01-01T00:00:03Z','message':{'id':'sdk-message','usage':{'input_tokens':1,'output_tokens':2,'cache_read_input_tokens':3,'cache_creation_input_tokens':4},'content':[]}})+'\n');(self.sdk/(THREAD+'.jsonl')).chmod(0o600)
  self.mail.chmod(0o600);self.receipts.chmod(0o600)
 def at(self,p):return self.root/p.lstrip('/')
 def ev(self,typ,seq,ms,data):return {'type':typ,'seq':seq,'time':1767225600000+ms,'data':data}
 def set_mail(self,body):
  with sqlite3.connect(self.mail) as db:db.execute('DELETE FROM messages');db.execute('INSERT INTO messages VALUES(?,?,?,?,?,?)',(self.mailid,'master',MASTER.pw_uid,'sova',body,'task'))
 def write_dsh(self):
  f=self.at('/opt/sova/.dsh/sessions/--opt-sova-workspace--/'+self.session+'/session.v4.jsonl.zstd');_fixture_mkdir(f.parent, mode=0o755, parents=True, exist_ok=True);r=subprocess.run(['zstd','-q','-c'],input=(''.join(json.dumps(x)+'\n' for x in self.events)).encode(),capture_output=True,check=True);f.write_bytes(r.stdout);(f).chmod(0o600);self.dsh_file=f;self.dsh_raw=f.with_suffix('.fixture.jsonl');self.dsh_raw.write_text(''.join(json.dumps(x)+'\n' for x in self.events));(self.dsh_raw).chmod(0o600)
 def call(self,want=0,extra=()):
  r=subprocess.run([sys.executable,'-I','-B',str(TOOL),'--run-id',self.run,'--root',str(self.root),*extra],capture_output=True,text=True,timeout=30);self.assertEqual(r.returncode,want,r.stdout+r.stderr)
  print(json.dumps({'rootEntryRc':r.returncode,'diagnostic':r.stderr.strip()}),flush=True)
  if want:self.assertNotIn('"status": "observed"',r.stdout)
  return r
 def reset_output(self):
  p=self.at('/var/lib/autopilot-usage')
  if p.exists():shutil.rmtree(p)
 def add_child(self):
  child='22222222-2222-4222-8222-222222222222';parent=self.sdk/(THREAD+'.jsonl');base=json.loads(parent.read_text());use=copy.deepcopy(base);use['timestamp']='2026-01-01T00:00:02Z';use['message']['content']=[{'type':'tool_use','id':'spawn','name':'mcp__sovadsh__subagent','input':{'run_in_background':True}}];result={'type':'user','sessionId':THREAD,'timestamp':'2026-01-01T00:00:02.500Z','message':{'content':[{'type':'tool_result','tool_use_id':'spawn','content':[{'type':'text','text':json.dumps({'isError':False,'value':{'kind':'continuable','subagentId':'child-session'}})}]}]}};parent.write_text(''.join(json.dumps(x)+'\n' for x in [base,use,result]));(parent).chmod(0o600);record=copy.deepcopy(base);record['sessionId']=child;record['timestamp']='2026-01-01T00:00:03.500Z';record['message']['usage']={'input_tokens':2,'output_tokens':4,'cache_read_input_tokens':6,'cache_creation_input_tokens':8};(self.sdk/(child+'.jsonl')).write_text(json.dumps(record)+'\n');(self.sdk/(child+'.jsonl')).chmod(0o600)
  with sqlite3.connect(self.receipts) as db:
   binding={'request_id':'child-request','generation':self.gen,'recipient':'sova','ledger_uuid':'ledger','session_id':'child-session','session_created':124,'turn':1,'sdk_thread_id':child,'sdk_turn_id':'sdk-child','sdk_generation':'sdk-generation'};db.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)',('child-request',self.gen,'child-session',124,1,json.dumps(binding),'terminal',1767225602800,1767225604500,'completed'))
  return child
 def test_root_snapshot_to_actual_master_cli_private_public(self):
  sys.path.insert(0,str(P/'lib'));spec=importlib.util.spec_from_file_location('root_usage_installer',P/'lib/install.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer);lock,raw=installer.source()
  with tempfile.TemporaryDirectory(prefix='root-to-cli-',dir='/var/tmp') as directory:
   base=Path(directory);base.chmod(0o755);root=base/'root';_fixture_mkdir(root, mode=0o755);expected,(_,release)=installer.layout(root,lock,raw)
   for path,(kind,mode,data) in sorted(expected.items(),key=lambda x:len(x[0].parts)):
    _fixture_mkdir(path.parent, mode=0o755, parents=True, exist_ok=True)
    if kind=='dir':_fixture_mkdir(path, mode=0o755, exist_ok=True);path.chmod(mode)
    elif kind=='link':path.symlink_to(data)
    else:path.write_bytes(data);(path).chmod(0o600);path.chmod(mode)
   project=base/'project';project.mkdir(mode=0o700);os.chown(project,MASTER.pw_uid,MASTER.pw_gid);public=base/'public';_fixture_mkdir(public, mode=0o755);os.chown(public,0,MASTER.pw_gid);public.chmod(0o2751);agent=public/'master';_fixture_mkdir(agent, mode=0o755);os.chown(agent,MASTER.pw_uid,MASTER.pw_gid);agent.chmod(0o2750)
   # Explicit empty private catalogue; no production sources/permissions change.
   scope=root/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(base)],publicRoot=str(public))));(scope).chmod(0o600);(scope).chmod(0o600)
   spec=importlib.util.spec_from_file_location('root_cli_catalog_fixture',P/'runtime/run_catalog.py');catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog);report=base/'accepted-owner.json';report.write_text(json.dumps(catalog.scan_legacy(root)));(report).chmod(0o600);catalog.bootstrap(root/'var/lib/dsh-autopilot',root,report,hashlib.sha256(report.read_bytes()).hexdigest())
   worker=base/'worker.py';worker.write_text("import json,os,subprocess,sys\nfrom pathlib import Path\nproject,public,skill=map(Path,sys.argv[1:4]);env=dict({k:v for k,v in os.environ.items() if not k.startswith('PYTHON')},AUTOPILOT_PUBLIC_ROOT=str(public),AUTOPILOT_AGENT='master',AUTOPILOT_OPERATOR_PID=str(os.getpid()),AUTOPILOT_NO_UPDATE_CHECK='1',PYTHONDONTWRITEBYTECODE='1');r=subprocess.run([sys.executable,'-E','-s','-B',str(skill/'tools/ap.py'),'--no-serve',*sys.argv[4:]],cwd=project,env=env,capture_output=True,text=True);print(r.stdout+r.stderr,file=sys.stderr);assert r.returncode==0;(print(json.dumps(json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1])['_sadik'])))\n");(worker).chmod(0o600);worker.chmod(0o644)
   def invoke(*args):
    r=subprocess.run(['sudo','-n','-u','master','env','AUTOPILOT_USAGE_MAIL_SOCKET='+str(base/'no-registration-endpoint/post.sock'),sys.executable,'-I','-B',str(worker),str(project),str(public),str(release/'skill'),*args],capture_output=True,text=True,timeout=30);self.assertEqual(r.returncode,0,r.stdout+r.stderr);print(r.stderr,flush=True);return json.loads(r.stdout)
   meta=invoke('init','--slug','root-claude-copy','--skill-dir',str(release/'skill'))
   registration=json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1])['usageRegistration']
   self.assertEqual(registration['state'],'UNBOUND','INIT_REGISTRATION_ESCAPED_FIXTURE')
   print('TEST_MAIL_ISOLATED '+json.dumps(dict(probe='root-to-cli',socket=str(base/'no-registration-endpoint/post.sock'),registration=registration)),flush=True)
   self.run=meta['run_id'];env=json.loads(self.body.split('\n',1)[1]);env['run']=self.run;self.set_mail('AUTOPILOT-PILOT/1\n'+json.dumps(env));measured=json.loads(self.call().stdout);source=self.at('/var/lib/autopilot-usage');view=base/'root-snapshot-view';_fixture_mkdir(view, mode=0o755);subprocess.run(['mount','--bind',str(source),str(view)],check=True)
   try:
    snapshot_path=view/self.run/'public/claude.json';invoke('usage','claude','--snapshot',str(snapshot_path));saved=json.loads((project/'.autopilot/state.js').read_text().split('=',1)[1]);bucket=json.loads(snapshot_path.read_text())['byEngine']['claude'];self.assertEqual(saved['usage']['byEngine']['claude'],bucket);dest=public/'master'/meta['project_id']/self.run;public_state=json.loads((dest/'state.js').read_text().split('=',1)[1]);self.assertEqual(set(public_state['usage']['byEngine']),{'codex','claude'});self.assertEqual(public_state['usage']['byEngine']['claude'],bucket);render=subprocess.run(['node',str(P/'test/render-dashboard.cjs'),str(dest/'dashboard.html')],capture_output=True,text=True,check=True);self.assertIn('data-engine="claude"',json.loads(render.stdout)['html']);print(json.dumps({'actualMasterCli':True,'runId':self.run,'rootSnapshotSha256':measured['sha256'],'privateClaudeEqualsSnapshot':True,'publicEngines':['codex','claude'],'renderClaudePresent':True,'scope':'synthetic copy only; real Master UID, no live model call'}),flush=True)
   finally:subprocess.run(['umount',str(view)],check=True)
 def test_whole_root_entry_refuses_master_before_source_access(self):
  with tempfile.TemporaryDirectory(prefix='public-root-entry-',dir='/var/tmp') as directory:
   base=Path(directory);base.chmod(0o755);tool=base/TOOL.name;tool.write_bytes(TOOL.read_bytes());(tool).chmod(0o600);tool.chmod(0o644)
   result=subprocess.run(['sudo','-n','-u','master',sys.executable,'-I','-B',str(tool),'--run-id',RUN,'--progon'],capture_output=True,text=True,timeout=10)
   self.assertEqual(result.returncode,2,result.stderr);self.assertIn('ROOT_REQUIRED',result.stderr)
 def test_ledger_change_after_origin_is_not_observed(self):
  spec=importlib.util.spec_from_file_location('root_entry_race',TOOL);entry=importlib.util.module_from_spec(spec);spec.loader.exec_module(entry);original=entry.load
  def load(name,label):
   module=original(name,label)
   if name=='claude-root-origin.py':
    collect=module.collect
    def changed(*args):
     result=collect(*args)
     with sqlite3.connect(self.receipts) as db:
      binding=json.loads(db.execute('SELECT binding_json FROM mail_sdk_requests').fetchone()[0]);binding['generation']='replaced'
      db.execute('UPDATE mail_sdk_requests SET generation=?,binding_json=?',('replaced',json.dumps(binding)))
     return result
    module.collect=changed
   return module
  entry.load=load;old=sys.argv;sys.argv=[str(TOOL),'--run-id',self.run,'--root',str(self.root),'--progon']
  try:
   with self.assertRaisesRegex(ValueError,'LEDGER_SOURCE_CHANGED'):entry.main()
  finally:sys.argv=old
 def test_child_and_parent_continuation(self):
  self.add_child()
  with sqlite3.connect(self.receipts) as db:
   row=list(db.execute('SELECT * FROM mail_sdk_requests WHERE request_id=?',(self.rid,)).fetchone());row[0]='parent-next';row[5]=json.dumps({**json.loads(row[5]),'request_id':'parent-next','sdk_turn_id':'sdk-next'});row[7]=1767225605001;row[8]=1767225605500;db.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)',row)
  f=self.sdk/(THREAD+'.jsonl');last=json.loads(f.read_text().splitlines()[0]);last['timestamp']='2026-01-01T00:00:05.200Z';last['message']['id']='next-message'
  with f.open('a') as out:out.write(json.dumps(last)+'\n')
  value=json.loads(self.call(extra=('--progon',)).stdout)['byEngine']['claude'];self.assertEqual((value['modelCalls'],value['inputTokens']),(3,32))
 def test_settled_notice_requires_proven_child(self):
  self.add_child();self.events[1]['data']['inserted'].append({'id':'settled','role':'user','source':{'kind':'subagent-settled','form':'notice','senderSessionId':'child-session'}});self.events[3]['data']['removedCount']=2;self.write_dsh();self.call(extra=('--progon',));old=copy.deepcopy(self.events);self.events[1]['data']['inserted'][1]['source']['senderSessionId']='foreign-child';self.write_dsh();self.call(2,('--progon',));self.events=old;self.write_dsh();self.call(extra=('--progon',))
 def test_late_child_is_not_clipped(self):
  self.add_child();self.call(extra=('--progon',))
  with sqlite3.connect(self.receipts) as db:
   row=list(db.execute('SELECT * FROM mail_sdk_requests WHERE request_id=?',('child-request',)).fetchone());row[0]='late-child';row[5]=json.dumps({**json.loads(row[5]),'request_id':'late-child','sdk_turn_id':'sdk-late'});row[7]=1767225607000;row[8]=1767225608000;db.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)',row)
  self.call(2,('--progon',))
  with sqlite3.connect(self.receipts) as db:db.execute('DELETE FROM mail_sdk_requests WHERE request_id=?',('late-child',))
  self.call(extra=('--progon',))
 def test_private_umask_still_publishes_readable_snapshot(self):
  old=os.umask(0o077)
  try:r=self.call()
  finally:os.umask(old)
  value=json.loads(r.stdout);source=self.at('/var/lib/autopilot-usage');view=Path(tempfile.mkdtemp(prefix='ap-public-view-',dir='/var/tmp'));view.chmod(0o755)
  try:
   self.assertNotEqual(os.readlink('/proc/self/ns/mnt'),os.readlink('/proc/1/ns/mnt'),'mount test requires private namespace');subprocess.run(['mount','--bind',str(source),str(view)],check=True)
   r=subprocess.run(['sudo','-n','-u','master','python3','-I','-B','-c','import json,sys;assert json.load(open(sys.argv[1]))["byEngine"]["claude"]["status"]=="observed"',str(view/RUN/'public/claude.json')],capture_output=True,text=True,timeout=10);self.assertEqual(r.returncode,0,r.stderr)
  finally:
   subprocess.run(['umount',str(view)],check=False,capture_output=True);view.rmdir()
 def test_normal_ap_and_readonly_progon(self):
  r=self.call(extra=('--progon',));value=json.loads(r.stdout);self.assertEqual(value['byEngine']['claude']['inputTokens'],8);self.assertFalse(self.at('/var/lib/autopilot-usage').exists())
  r=self.call();result=json.loads(r.stdout);f=Path(result['snapshot']);self.assertEqual(json.loads(f.read_text())['byEngine']['claude']['modelCalls'],1);self.assertEqual(f.stat().st_uid,0);self.assertEqual(f.stat().st_mode&0o777,0o644);self.assertEqual(f.parent.stat().st_mode&0o777,0o755)
 def test_mixed_turn_cycle(self):
  for mode in ('normal','g0'):
   with self.subTest(mode=mode):
    extra=('--progon',)
    if mode=='g0':
     record=self.base/'mixed-g0';_fixture_mkdir(record, mode=0o755);body='G0 '+RUN;self.set_mail(body);(record/'pusk.json').write_text(json.dumps({'run_id':RUN,'letter_sha256':hashlib.sha256(body.encode()).hexdigest()}));(record/'pusk.json').chmod(0o600);(record/'g0-book.json').write_text(json.dumps({'parent_before':{'request':{'request_id':self.rid,'session_id':self.session,'session_created':self.created,'turn':1}}}));(record/'g0-book.json').chmod(0o600);extra+=('--g0-record',str(record))
    self.call(extra=extra);before=copy.deepcopy(self.events);healthy=fact(mode+'-mixed-healthy',self.dsh_raw,'foreign');self.events[1]['data']['inserted'].append({'id':'foreign'});self.events[3]['data']['removedCount']=2;self.write_dsh();damaged=fact(mode+'-mixed-damaged',self.dsh_raw,'foreign');self.assertEqual(damaged['fixedCount'],1);self.assertNotEqual(healthy['sha256'],damaged['sha256']);r=self.call(2,extra);self.assertIn('MIXED_TURN',r.stderr);self.events=before;self.write_dsh();returned=fact(mode+'-mixed-returned',self.dsh_raw,'foreign');self.assertEqual(healthy['sha256'],returned['sha256']);self.call(extra=extra)
 def test_g0_mail_origin(self):
  record=self.base/'g0';_fixture_mkdir(record, mode=0o755);body='G0 '+RUN;self.set_mail(body);(record/'pusk.json').write_text(json.dumps({'run_id':RUN,'t0':'2026-01-01T00:00:00Z','end':'2026-01-01T00:01:00Z','letter_sha256':hashlib.sha256(body.encode()).hexdigest()}));(record/'pusk.json').chmod(0o600);(record/'g0-book.json').write_text(json.dumps({'parent_before':{'request':{'request_id':self.rid,'session_id':self.session,'session_created':self.created,'turn':1}}}));(record/'g0-book.json').chmod(0o600);self.call(extra=('--progon','--g0-record',str(record)))
 def test_invalid_mail_database_is_fixed_refusal(self):
  self.call(extra=('--progon',));old=self.mail.read_bytes();self.mail.write_bytes(b'not a SQLite database');(self.mail).chmod(0o600);r=self.call(2,('--progon',));self.assertNotIn('Traceback',r.stderr);self.mail.write_bytes(old);(self.mail).chmod(0o600);self.call(extra=('--progon',))
 def test_invalid_sdk_is_fixed_refusal(self):
  self.call(extra=('--progon',));f=self.sdk/(THREAD+'.jsonl');old=f.read_bytes();f.write_text('[]\n');(f).chmod(0o600);r=self.call(2,('--progon',));self.assertNotIn('Traceback',r.stderr);f.write_bytes(old);(f).chmod(0o600);self.call(extra=('--progon',))
 def test_malformed_ap_envelope_is_not_attributed(self):
  self.call(extra=('--progon',))
  for key,value in [('sender',[]),('zone',['.']),('zone',['./a']),('zone',['a//b']),('zone',['a/']),('zone',['a\\b']),('zone',['a\0b'])]:
   with self.subTest(field=key,value=value):
    env=json.loads(self.body.split('\n',1)[1]);(env if key=='sender' else env['task'])[key]=value;self.set_mail('AUTOPILOT-PILOT/1\n'+json.dumps(env));self.call(2,('--progon',))
  self.set_mail(self.body);self.call(extra=('--progon',))
 def test_unknown_flags_and_missing_claim_refuse(self):
  for flag in ['--dry-run','-n','--check']:self.call(2,('--progon',flag))
  saved=copy.deepcopy(self.events);self.events[3]['data']['outcome']='canceled';self.write_dsh();self.call(2,('--progon',));self.events=saved;self.write_dsh();self.call(extra=('--progon',))

@unittest.skipUnless(os.geteuid()==0,'actual Master UID stand required')
class WriterOwner(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('usage_runtime',P/'runtime/ap_sadik.py');self.ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.ap);self.temp=tempfile.TemporaryDirectory(prefix='ap-owner-',dir='/var/tmp');self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name);self.base.chmod(0o755);self.file=self.base/'snapshot.json'
 def call(self,engine,want):
  read,write=os.pipe();pid=os.fork()
  if pid==0:
   os.close(read)
   try:
    os.setgroups([]);os.setgid(MASTER.pw_gid);os.setuid(MASTER.pw_uid);s={'_sadik':{'run_id':RUN}};self.ap.usage_event(s,engine,str(self.file));out={'rc':0,'state':s}
   except self.ap.Refusal:out={'rc':2}
   except BaseException as e:out={'rc':3,'type':type(e).__name__}
   os.write(write,json.dumps(out).encode());os.close(write);os._exit(0)
  os.close(write);raw=os.read(read,65536);os.close(read);os.waitpid(pid,0);result=json.loads(raw);print(json.dumps({'writerEngine':engine,'writerRc':result['rc'],'snapshotPath':str(self.file)}),flush=True);self.assertEqual(result['rc'],want,result);return result
 def test_root_claude_master_forgery_cycle_and_codex_self(self):
  self.file.write_text(json.dumps(snapshot('claude')));(self.file).chmod(0o600);self.file.chmod(0o644);fact('owner-healthy',self.file);self.call('claude',0);os.chown(self.file,MASTER.pw_uid,MASTER.pw_gid);fact('owner-damaged-Master',self.file);self.call('claude',2);os.chown(self.file,0,0);fact('owner-returned-root',self.file);self.call('claude',0)
  self.file.write_text(json.dumps(snapshot('codex')));(self.file).chmod(0o600);os.chown(self.file,MASTER.pw_uid,MASTER.pw_gid);self.call('codex',0)
 def test_symlink_cycle(self):
  self.file.write_text(json.dumps(snapshot('claude')));(self.file).chmod(0o600);self.file.chmod(0o644);fact('link-healthy',self.file);self.call('claude',0);target=self.base/'real.json';self.file.rename(target);self.file.symlink_to(target);fact('link-damaged-symlink',self.file);self.call('claude',2);self.file.unlink();target.rename(self.file);fact('link-returned-regular',self.file);self.call('claude',0)
if __name__=='__main__':unittest.main(verbosity=2)
