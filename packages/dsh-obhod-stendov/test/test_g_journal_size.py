"""Real sparse journals/proc files; systemctl and focused clock samples are fixtures."""
import contextlib,hashlib,importlib.util,io,json,os,shutil,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest import mock
STAND=Path(__file__).with_name('stend-g-journal-size.py')
class GSize(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('gsize',STAND);self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.writer=self.root/'usage-producer.mjs';self.writer_text('128*1024*1024');self.m.gateway.PROC=self.root/'proc';self.units={};self.calls={};self.race=False
  self.home=self.root/'home';self.home.mkdir();self.file=self.home/'.usage-meter/gateway-v1.jsonl';self.file.parent.mkdir(mode=0o700);self.unit='coder-gateway-master.service';self.add(self.unit,101,b'openai',self.home)
 def writer_text(self,expression):
  value=int(expression.split('*')[0])*1024*1024 if '*' in expression else int(expression)
  self.writer.with_name('usage-limits.json').write_text(json.dumps(dict(schemaVersion=1,gatewayV1FileMaxBytes=value)))
  self.writer.write_text("export class GatewayUsage {\n enqueue(raw,info){\n  if(info.size+Buffer.byteLength(raw)>"+expression+")throw Error('SOURCE_GAP');await f.writeFile(raw);await f.sync();\n }\n}\n")
 def add(self,unit,pid,provider,home,code_dir=None):
  self.units[unit]=pid
  if not pid:return
  p=self.m.gateway.PROC/str(pid);p.mkdir(parents=True,exist_ok=True)
  code=self.root if code_dir is None else code_dir;code.mkdir(parents=True,exist_ok=True);(code/'gateway.mjs').write_text('// fixture entrypoint, never executed by unit tests\n')
  (p/'cmdline').write_bytes(b'/usr/local/bin/node\0'+os.fsencode(code/'gateway.mjs')+b'\0')
  for name,target in [('root','/'),('cwd',str(code)),('exe','/usr/local/bin/node')]:
   link=p/name
   if link.is_symlink():link.unlink()
   link.symlink_to(target)
  fields=[b'PRIVATE_FIXTURE=not-for-output',b'GATEWAY_POSTAVSHIK='+provider]
  if home is not None:fields.append((b'CODEX_HOME' if provider.strip()==b'openai' else b'HOME')+b'='+os.fsencode(home))
  (p/'status').write_text('Uid:\t'+('\t'.join([str(os.getuid())]*4))+'\n')
  (p/'environ').write_bytes(b'\0'.join(fields)+b'\0');(p/'stat').write_text(str(pid)+' (fixture) S '+' '.join(['0']*18+['12345']+['0']*5)+'\n')
 def ctl(self,args,**kw):
  self.assertEqual(args[0],'systemctl');self.assertLessEqual(kw['timeout'],3)
  if args[1]=='list-units':
   self.assertIn('coder-gateway*',args);self.assertIn('claude-oauth-gateway*',args);out=''.join(u+' loaded active running fixture\n' for u in self.units)
  elif args[1]=='show':
   u=args[2];self.calls[u]=self.calls.get(u,0)+1;out='Id='+u+'\nMainPID='+str(self.units[u]+(1 if self.race and (self.race is True or self.race==u) and self.calls[u]>1 else 0))+'\n'
  else:self.fail('unexpected '+str(args))
  return subprocess.CompletedProcess(args,0,out,'')
 def run_stand(self,args=()):
  out=io.StringIO();err=io.StringIO()
  with mock.patch.object(self.m.gateway.subprocess,'run',side_effect=self.ctl),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
   try:rc=self.m.main(list(args))
   except SystemExit as e:rc=e.code
  return rc,out.getvalue()+err.getvalue()
 def size(self,n):
  with self.file.open('wb') as f:f.truncate(n)
  self.file.chmod(0o600)
 def legacy316(self):
  fixture=STAND.parent/'fixtures/g-producer-316';source=fixture/'usage-producer.mjs';self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),'a8183a3530a3a37453aff2d8c641842436df5951ef4e3c4eb70686ffa2f7547c');self.writer.write_bytes(source.read_bytes());self.writer.with_name('usage-limits.json').unlink()
 def test_legacy316_real_inline_limit_green_overflow_red_return(self):
  self.legacy316();self.size(1048576);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('МиБ из 128 · ЗЕЛЁНОЕ',out)
  def digest():
   h=hashlib.sha256()
   with self.file.open('rb') as stream:
    for block in iter(lambda:stream.read(1048576),b''):h.update(block)
   return h.hexdigest()
  before=digest()
  with self.file.open('r+b') as stream:stream.seek(134217728);self.assertEqual(stream.write(b'X'),1)
  after=digest();self.assertNotEqual(before,after);self.assertEqual(self.file.stat().st_size,134217729)
  with self.file.open('rb') as stream:stream.seek(134217728);self.assertEqual(stream.read(1),b'X')
  print('LEGACY-G-SIZE-PORCHA bytes=1048576->134217729 sentinel=X SHA='+before+'->'+after,flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ',out);self.assertIn(self.unit,out);self.assertIn('134217729 байт',out)
  self.size(1048576);self.assertEqual(digest(),before);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_legacy316_missing_lazy_journal_is_neutral(self):
  self.legacy316();rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('первом запросе',out);self.assertNotIn('ЖЁЛТОЕ',out)
 def test_legacy316_changed_code_without_policy_is_named_blind_then_return(self):
  self.legacy316();self.size(1048576);good=self.writer.read_bytes();self.assertEqual(self.run_stand()[0],0);self.writer.write_bytes(good+b'\n// different build\n');self.assertNotEqual(hashlib.sha256(good).digest(),hashlib.sha256(self.writer.read_bytes()).digest());print('LEGACY-CODE-PORCHA append=1 SHA='+hashlib.sha256(good).hexdigest()+'->'+hashlib.sha256(self.writer.read_bytes()).hexdigest(),flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('usage-limits.json',out);self.assertIn(self.unit,out);self.writer.write_bytes(good);self.assertEqual(self.run_stand()[0],0)
 def test_guest_build_without_producer_is_neutral_with_its_path(self):
  guest=self.root/'guest';self.units.clear();unit='claude-oauth-gateway@varvara.service';self.add(unit,102,b'anthropic',self.home,guest)
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G не ведётся (сборка без G)',out);self.assertIn(str(guest/'usage-producer.mjs'),out);self.assertNotIn('G ожидается',out);self.assertNotIn('ЖЁЛТОЕ',out)
 def test_nonstandard_producer_drives_its_own_limit(self):
  self.size(67108864);other=self.root/'nonstandard code';home=self.root/'other-home';(home/'.usage-meter').mkdir(parents=True,mode=0o700)
  with (home/'.usage-meter/gateway-v1.jsonl').open('wb') as f:f.truncate(67108864)
  (home/'.usage-meter/gateway-v1.jsonl').chmod(0o600)
  self.add('coder-gateway-other.service',102,b'openai',home,other)
  (other/'usage-limits.json').write_text(json.dumps(dict(schemaVersion=1,gatewayV1FileMaxBytes=67108864)))
  (other/'usage-producer.mjs').write_text("if(info.size+Buffer.byteLength(raw)>64*1024*1024)throw Error('SOURCE_GAP');")
  rc,out=self.run_stand();self.assertEqual(rc,1,out)
  main=next(line for line in out.splitlines() if '['+self.unit+']' in line);custom=next(line for line in out.splitlines() if '[coder-gateway-other.service]' in line)
  self.assertIn('МиБ из 128 · ЗЕЛЁНОЕ',main);self.assertIn('МиБ из 64 · КРАСНОЕ',custom)
 def test_relative_entrypoint_uses_process_cwd(self):
  p=self.m.gateway.PROC/'101';(p/'cmdline').write_bytes(b'node\0gateway.mjs\0');self.size(1048576)
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_unidentified_entrypoint_is_blind_instead_of_main_fallback(self):
  (self.m.gateway.PROC/'101/cmdline').write_bytes(b'node\0--eval\0private-fixture-not-for-output\0');self.size(1048576)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out);self.assertNotIn('private-fixture-not-for-output',out)
 def test_entrypoint_symlink_is_blind_instead_of_wrong_adjacent_producer(self):
  entry=self.root/'gateway.mjs';entry.unlink();target=self.root/'other/gateway.mjs';target.parent.mkdir();target.write_text('fixture');entry.symlink_to(target);self.size(1048576)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out)
 def test_changed_cmdline_at_same_pid_is_blind(self):
  self.size(1048576);p=self.m.gateway.PROC/'101/cmdline';before=p.read_bytes();other=self.root/'new-code';other.mkdir();(other/'gateway.mjs').write_text('// fixture')
  original=self.m.writer_limit;native_run=subprocess.run
  def changed(source):
   result=original(source);p.write_bytes(b'node\0'+os.fsencode(other/'gateway.mjs')+b'\0')
   self.assertNotEqual(hashlib.sha256(before).digest(),hashlib.sha256(p.read_bytes()).digest())
   count=native_run(['grep','-a','-cF',str(other/'gateway.mjs'),str(p)],capture_output=True,text=True);self.assertEqual(count.stdout.strip(),'1')
   print('CMDLINE-PORCHA replacements=1 grep-cF=1 sha256='+hashlib.sha256(before).hexdigest()+'->'+hashlib.sha256(p.read_bytes()).hexdigest())
   return result
  with mock.patch.object(self.m,'writer_limit',side_effect=changed):
   rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out)
 def test_cli_real_processes_use_guest_main_and_nonstandard_sources(self):
  node=shutil.which('node');self.assertIsNotNone(node,'Node is required for the process-path CLI fixture')
  b=self.root/'bin';b.mkdir();config=self.root/'cli-units.json';children=[]
  tool=b/'systemctl';tool.write_text("#!/usr/bin/python3\nimport json,sys\nk=json.load(open("+repr(str(config))+"))\na=sys.argv[1:]\nif a[0]=='list-units':\n for u in k:print(u+' loaded active running fixture')\nelif a[0]=='show':print('Id='+a[1]+'\\nMainPID='+str(k[a[1]]))\nelse:sys.exit(3)\n");tool.chmod(0o755)
  cases=[('coder-gateway-main.service','main code','openai',128,1048576),('claude-oauth-gateway@guest.service','guest code','anthropic',None,None),('coder-gateway-custom.service','custom code','openai',64,67108864)]
  try:
   for unit,name,provider,limit,size in cases:
    code=self.root/name;code.mkdir();entry=code/'gateway.mjs';entry.write_text('setInterval(()=>{},1000);\n');home=code/'home';home.mkdir()
    if limit is not None:
     (code/'usage-limits.json').write_text(json.dumps(dict(schemaVersion=1,gatewayV1FileMaxBytes=limit*1048576)))
     (code/'usage-producer.mjs').write_text("if(info.size+Buffer.byteLength(raw)>"+str(limit)+"*1024*1024)throw Error('SOURCE_GAP');")
    if size is not None:
     (home/'.usage-meter').mkdir(mode=0o700)
     with (home/'.usage-meter/gateway-v1.jsonl').open('wb') as f:f.truncate(size)
     (home/'.usage-meter/gateway-v1.jsonl').chmod(0o600)
    time.sleep(0.03)  # Separate producer creation from starttime's clock tick.
    env={'PATH':os.defpath,'GATEWAY_POSTAVSHIK':provider,'HOME':str(home),'CODEX_HOME':str(home),'PRIVATE_FIXTURE':'not-for-output'}
    children.append(subprocess.Popen([node,'gateway.mjs' if name=='custom code' else str(entry)],cwd=code,env=env))
   def invoke(index,expected):
    before=hashlib.sha256(config.read_bytes()).hexdigest() if config.exists() else None;config.write_text(json.dumps({cases[index][0]:children[index].pid}));after=hashlib.sha256(config.read_bytes()).hexdigest()
    if before is not None:self.assertNotEqual(before,after)
    raw=(Path('/proc')/str(children[index].pid)/'cmdline').read_bytes();self.assertIn(b'gateway.mjs',raw)
    print('CLI-PATH control index='+str(index)+' pid='+str(children[index].pid)+' configSHA='+str(before)+'->'+after,flush=True)
    q=subprocess.run([sys.executable,'-B',str(STAND)],env={**os.environ,'PATH':str(b)+':'+os.defpath},capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,expected,q.stdout+q.stderr);self.assertNotIn('not-for-output',q.stdout+q.stderr);print(q.stdout.strip(),flush=True);return q.stdout
   out=invoke(0,0);self.assertIn('МиБ из 128 · ЗЕЛЁНОЕ',out)
   out=invoke(1,0);self.assertIn('G не ведётся (сборка без G)',out);self.assertIn(str(self.root/'guest code/usage-producer.mjs'),out);self.assertNotIn('ЖЁЛТОЕ',out)
   out=invoke(2,1);self.assertIn('МиБ из 64 · КРАСНОЕ',out)
   out=invoke(0,0);self.assertIn('ЗЕЛЁНОЕ',out)
   file=self.root/'main code/home/.usage-meter/gateway-v1.jsonl'
   def check_metadata(expected,text):
    q=subprocess.run([sys.executable,'-B',str(STAND)],env={**os.environ,'PATH':str(b)+':'+os.defpath},capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,expected,q.stdout+q.stderr);self.assertIn(text,q.stdout);print(q.stdout.strip(),flush=True)
   file.chmod(0o644);self.assertEqual(subprocess.check_output(['stat','-c','%a',str(file)],text=True).strip(),'644');print('CLI-MODE-PORCHA mode=0644',flush=True)
   check_metadata(1,'G выключен шлюзом:');file.chmod(0o600);check_metadata(0,'ЗЕЛЁНОЕ')
   file.unlink();self.assertFalse(os.path.lexists(file));print('CLI-MISSING-PORCHA file removed',flush=True);check_metadata(1,'G ожидается, файла нет')
   file.write_bytes(b'');file.chmod(0o600);check_metadata(0,'ЗЕЛЁНОЕ')
  finally:
   for child in children:
    child.terminate()
    try:child.wait(timeout=2)
    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=2)
 def test_process_root_and_cwd_views_choose_namespace_producer(self):
  ns=self.root/'namespace';code=ns/'srv/gateway';code.mkdir(parents=True);(code/'gateway.mjs').write_text('// fixture');(code/'usage-producer.mjs').write_text("if(info.size+Buffer.byteLength(raw)>64*1024*1024)throw Error('SOURCE_GAP');")
  (code/'usage-limits.json').write_text(json.dumps(dict(schemaVersion=1,gatewayV1FileMaxBytes=67108864)))
  proc=self.m.gateway.PROC/'101';(proc/'root').unlink();(proc/'root').symlink_to(ns);(proc/'cwd').unlink();(proc/'cwd').symlink_to(code);self.size(67108864)
  for entry in [b'/srv/gateway/gateway.mjs',b'gateway.mjs']:
   with self.subTest(entry=entry):
    (proc/'cmdline').write_bytes(b'node\0'+entry+b'\0');rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('МиБ из 64 · КРАСНОЕ',out)
 def test_absolute_parent_symlink_cannot_escape_process_root(self):
  shadow=self.root/'host-shadow';shadow.mkdir();(shadow/'gateway.mjs').write_text('// host shadow');(shadow/'usage-producer.mjs').write_text("if(info.size+Buffer.byteLength(raw)>128*1024*1024)throw Error('SOURCE_GAP');")
  ns=self.root/'namespace';inside=ns/str(shadow).lstrip('/');inside.mkdir(parents=True);(inside/'gateway.mjs').write_text('// namespace');(inside/'usage-producer.mjs').write_text("if(info.size+Buffer.byteLength(raw)>64*1024*1024)throw Error('SOURCE_GAP');")
  (ns/'entry').symlink_to(shadow);proc=self.m.gateway.PROC/'101';(proc/'root').unlink();(proc/'root').symlink_to(ns);(proc/'cmdline').write_bytes(b'node\0/entry/gateway.mjs\0');self.size(67108864)
  self.assertEqual(os.readlink(ns/'entry'),str(shadow));rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out);self.assertNotIn('ЗЕЛЁНОЕ',out)
 def test_parent_traversal_in_entrypoint_is_blind(self):
  (self.root/'sub').mkdir();entry=self.root/'sub/../gateway.mjs';(self.m.gateway.PROC/'101/cmdline').write_bytes(b'node\0'+os.fsencode(entry)+b'\0');self.size(1048576)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out)
 def test_non_utf8_cwd_is_named_blindness(self):
  code=Path(os.fsdecode(os.fsencode(self.root)+b'/invalid-\xff'));code.mkdir();(code/'gateway.mjs').write_text('// fixture');(code/'usage-producer.mjs').write_bytes(self.writer.read_bytes());proc=self.m.gateway.PROC/'101';(proc/'cwd').unlink();(proc/'cwd').symlink_to(code);(proc/'cmdline').write_bytes(b'node\0gateway.mjs\0')
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out)
 def test_limit_json_missing_and_invalid_are_named_blindness(self):
  self.size(1048576);limits=self.writer.with_name('usage-limits.json');good=limits.read_bytes()
  variants=[b'['*10000+b']'*10000,None,b'not json',b'{}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":1e100}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":65537.5}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":9007199254740992}',b'{"schemaVersion":1,"schemaVersion":1,"gatewayV1FileMaxBytes":134217728}',b'{"schemaVersion":2,"gatewayV1FileMaxBytes":134217728}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":true}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":65536}',b'{"schemaVersion":1,"gatewayV1FileMaxBytes":134217728,"extra":1}']
  for raw in variants:
   with self.subTest(raw=raw):
    if raw is None:limits.unlink(missing_ok=True)
    else:limits.write_bytes(raw)
    rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out);self.assertIn('usage-limits.json',out)
  limits.write_bytes(good);self.assertEqual(self.run_stand()[0],0)
 def test_missing_limits_is_blind_even_when_g_is_missing(self):
  self.writer.with_name('usage-limits.json').unlink();rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('usage-limits.json',out);self.assertIn(self.unit,out)
 def test_oversized_integer_limit_is_blind_without_traceback_then_return(self):
  self.size(1048576);file=self.writer.with_name('usage-limits.json');good=file.read_bytes();file.write_bytes(b'{"schemaVersion":1,"gatewayV1FileMaxBytes":'+b'9'*400+b'}');before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(file.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('JSON-INT-PORCHA digits=400 SHA='+before+'->'+after,flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('usage-limits.json',out);self.assertNotIn('Traceback',out);file.write_bytes(good);self.assertEqual(self.run_stand()[0],0)
 def test_uid_unreadable_or_ambiguous_is_blind(self):
  self.size(1048576);status=self.m.gateway.PROC/'101/status'
  for raw in ['', 'Uid: 1 1 1 1\nUid: 1 1 1 1\n', 'Uid: 4294967296 1 1 1\n']:
   status.write_text(raw);rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn(self.unit,out)
 def test_json_limit_is_used_instead_of_guard_literal(self):
  self.size(67108864);self.writer.with_name('usage-limits.json').write_text('{"schemaVersion":1,"gatewayV1FileMaxBytes":67108864}')
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('МиБ из 64 · КРАСНОЕ',out)
 def test_bad_file_mode_is_yellow_then_restore_is_green(self):
  self.size(1048576);self.assertEqual(self.run_stand()[0],0);before=self.file.stat();self.file.chmod(0o644)
  mode=subprocess.check_output(['stat','-c','%a',str(self.file)],text=True).strip();self.assertEqual(mode,'644');self.assertEqual(self.file.stat().st_ino,before.st_ino);print('MODE-PORCHA replacements=1 mode=600->'+mode+' inode='+str(before.st_ino),flush=True)
  rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('ЖЁЛТОЕ',out);self.assertIn('G выключен шлюзом:',out)
  self.file.chmod(0o600);self.assertEqual(subprocess.check_output(['stat','-c','%a',str(self.file)],text=True).strip(),'600');self.assertEqual(self.run_stand()[0],0)
 def test_gateway_uid_is_real_uid_from_status(self):
  self.size(1048576);uid=os.getuid();other=1 if uid==0 else 0;(self.m.gateway.PROC/'101/status').write_text('Uid:\t'+str(uid)+'\t'+str(other)+'\t'+str(other)+'\t'+str(other)+'\n')
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_below_warning_is_green_and_named(self):
  self.size(1048576);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out);self.assertIn('G master',out);self.assertIn('1.000000 МиБ из 128',out)
 def test_exact_warning_and_100_mib_are_visible_nonzero(self):
  for n in [100663296,104857600]:
   self.size(n);rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('ЖЁЛТОЕ',out);self.assertIn(self.unit,out)
 def test_exact_limit_and_129_mib_are_red(self):
  for n in [134217728,135266304]:
   self.size(n);rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ',out);self.assertIn(self.unit,out)
 def test_one_byte_below_boundaries(self):
  for n,color in [(100663295,'ЗЕЛЁНОЕ'),(134217727,'ЖЁЛТОЕ')]:
   self.size(n);rc,out=self.run_stand();self.assertEqual(rc,0 if n==100663295 else 1,out);self.assertIn(color,out)
 def test_old_13_17_mib_thresholds_are_cancelled(self):
  for size in [13631488,17825792]:
   self.size(size);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_absent_file_is_neutral_and_counted(self):
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G не ведётся',out);self.assertNotIn('ЗЕЛЁНОЕ',out);self.assertNotIn('КРАСНОЕ',out);self.assertIn('шлюзов 1 · с G 0 · без G 1',out)
 def test_missing_g_new_process_is_yellow_then_created_file_is_green(self):
  stamp=max(self.writer.stat().st_mtime_ns,self.writer.stat().st_ctime_ns)
  with mock.patch.object(self.m,'process_start_bounds',create=True,return_value=(stamp+1000000000,stamp+1010000000)):
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('FAIL',out);self.assertIn('ЖЁЛТОЕ',out);self.assertIn('G ожидается, файла нет',out);self.assertIn(self.unit,out)
   self.size(1048576);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_missing_g_old_process_has_install_hint(self):
  rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('процесс до монтажа G',out)
 def test_missing_g_uses_ctime_even_when_mtime_preserved(self):
  os.utime(self.writer,ns=(1,1));stamp=self.writer.stat().st_ctime_ns
  with mock.patch.object(self.m,'process_start_bounds',create=True,return_value=(stamp-2000000000,stamp-1000000000)):
   rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('процесс до монтажа G',out)
 def test_missing_g_ambiguous_time_is_blind(self):
  stamp=max(self.writer.stat().st_mtime_ns,self.writer.stat().st_ctime_ns)
  with mock.patch.object(self.m,'process_start_bounds',create=True,return_value=(stamp-1,stamp+1)):
   rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out)
 def test_missing_g_future_producer_timestamp_is_blind(self):
  future=self.m.time.time_ns()+60000000000;os.utime(self.writer,ns=(future,future));rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('будущем',out)
 def test_start_bounds_keep_tick_and_sampling_uncertainty(self):
  with mock.patch.object(self.m.os,'sysconf',return_value=100),mock.patch.object(self.m.time,'time_ns',side_effect=[10000000000,10000000020]),mock.patch.object(self.m.time,'clock_gettime_ns',return_value=5000000000) as clock:
   self.assertEqual(self.m.process_start_bounds(200),(7000000000,7010000020));clock.assert_called_once_with(self.m.time.CLOCK_BOOTTIME)
 def test_bad_clock_or_future_start_is_blind(self):
  for hz,values,start in [(0,[10000000000,10000000020],200),(100,[10000000020,10000000000],200),(100,[10000000000,10000000020],600)]:
   with mock.patch.object(self.m.os,'sysconf',return_value=hz),mock.patch.object(self.m.time,'time_ns',side_effect=values),mock.patch.object(self.m.time,'clock_gettime_ns',return_value=5000000000):
    with self.assertRaises(self.m.gateway.Blind):self.m.process_start_bounds(start)
 def test_missing_meter_directory_is_also_not_producing(self):
  self.file.parent.rmdir();rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G не ведётся',out)
 def test_claude_uses_home_instead_of_codex_home(self):
  self.size(1048576);self.units.clear();self.add('claude-oauth-gateway@iskra.service',102,b'anthropic',self.home);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G iskra',out);self.assertIn('шлюзов 1 · с G 1 · без G 0',out)
 def test_two_providers_and_absent_are_all_in_denominator(self):
  self.size(1048576);second=self.root/'second';second.mkdir();self.add('claude-oauth-gateway@iskra.service',102,b'anthropic',second);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('шлюзов 2 · с G 1 · без G 1',out)
 def test_missing_home_is_blind_not_missing_g(self):
  self.add(self.unit,101,b'openai',None);rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out);self.assertNotIn('G не ведётся',out)
 def test_missing_provider_is_blind(self):
  (self.m.gateway.PROC/'101/environ').write_bytes(b'HOME=/tmp\0');rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out)
 def test_unicode_trim_cannot_hide_provider(self):
  self.size(135266304);p=self.m.gateway.PROC/'101/environ';p.write_bytes(b'GATEWAY_POSTAVSHIK='+('\ufeffopenai\xa0').encode()+b'\0CODEX_HOME='+os.fsencode(self.home)+b'\0');rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ',out)
 def test_symlink_and_nonregular_disable_g_with_yellow(self):
  target=self.root/'target';target.write_text('do not read');self.file.symlink_to(target)
  for kind in ['symlink','directory']:
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('G выключен шлюзом:',out);self.assertIn('ЖЁЛТОЕ',out)
   self.file.unlink() if kind=='symlink' else self.file.rmdir()
   if kind=='symlink':self.file.mkdir()
 def test_pid_race_is_blind(self):
  self.race=True;self.size(1048576);rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out)
 def test_zero_units_is_blind(self):
  self.units.clear();rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('шлюзов 0',out)
 def test_outside_provider_is_not_excluded_before_pid_recheck(self):
  self.size(1048576);unit='coder-gateway-other.service';self.add(unit,102,b'other',None);self.race=unit
  rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+unit,out)
 def test_missing_writer_limit_is_named_blind(self):
  self.writer.unlink();self.size(1048576);rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА '+self.unit,out);self.assertIn('G-файл есть, предел не прочитать: producer не найден в '+str(self.writer.parent),out);self.assertNotIn('G не ведётся',out)
 def test_thresholds_follow_changed_writer_limit_not_cached_96_128(self):
  for limit,size,code,color in [(67108864,50331648,1,'ЖЁЛТОЕ'),(268435456,104857600,0,'ЗЕЛЁНОЕ'),(268435456,268435456,1,'КРАСНОЕ')]:
   self.writer_text(str(limit));self.size(size);rc,out=self.run_stand();self.assertEqual(rc,code,out);self.assertIn(color,out)
 def test_size_alert_names_source_gap_risk(self):
  self.size(104857600);rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('SOURCE_GAP',out)
 def test_fractional_warning_starts_at_or_above_75_percent(self):
  for limit,size,code,color in [(65537,49152,0,'ЗЕЛЁНОЕ'),(65537,49153,1,'ЖЁЛТОЕ'),(65537,65537,1,'КРАСНОЕ')]:
   self.writer_text(str(limit));self.size(size);rc,out=self.run_stand();self.assertEqual(rc,code,out);self.assertIn(color,out)
 def test_reads_128_64_and_return_from_writer_source(self):
  for expr,size,code,color in [('128*1024*1024',100663296,1,'ЖЁЛТОЕ'),('64 * 1024 * 1024',50331648,1,'ЖЁЛТОЕ'),('64*1024*1024',67108864,1,'КРАСНОЕ'),('128*1024*1024',67108864,0,'ЗЕЛЁНОЕ')]:
   self.writer_text(expr);self.size(size);rc,out=self.run_stand();self.assertEqual(rc,code,out);self.assertIn(color,out)
 def test_javascript_guard_is_no_longer_the_limit_source(self):
  self.size(1048576)
  for text in ['',"throw Error('unrelated');",'const limit=not_a_literal;']:
   self.writer.write_text(text);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
 def test_missing_writer_is_not_needed_when_no_g(self):
  self.writer.unlink();rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G не ведётся',out)
 def test_writer_source_is_read_not_executed(self):
  self.size(1048576);marker=self.root/'must-not-exist';self.writer.write_text('import fs from "node:fs";fs.writeFileSync('+json.dumps(str(marker))+',"BAD");\n'+self.writer.read_text());rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertFalse(marker.exists())
 def test_prepare_gateway_usage_contract(self):
  spec=importlib.util.spec_from_file_location('g_contract',STAND.with_name('g-source-contract.py'));contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
  self.assertEqual(contract.run(),0)
 def test_contract_detects_actual_stand_corruption_then_return(self):
  spec=importlib.util.spec_from_file_location('g_contract',STAND.with_name('g-source-contract.py'));contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
  path=self.root/'stend-g-journal-size.py';good=STAND.read_bytes();path.write_bytes(good);shutil.copyfile(STAND.with_name('stend-codex-app-server.py'),path.with_name('stend-codex-app-server.py'))
  self.assertEqual(contract.run(path),0)
  old=b'if info.st_mode&0o777!=0o600:';new=b'if info.st_mode&0o777 not in {0o600,0o644}:';self.assertEqual(good.count(old),1);path.write_bytes(good.replace(old,new));before=hashlib.sha256(good).hexdigest();after=hashlib.sha256(path.read_bytes()).hexdigest();self.assertNotEqual(before,after)
  count=subprocess.check_output(['grep','-cF',new.decode(),str(path)],text=True).strip();self.assertEqual(count,'1');print('CONTRACT-PORCHA replacements=1 grep-cF='+count+' SHA='+before+'->'+after,flush=True)
  out=io.StringIO()
  with contextlib.redirect_stdout(out):rc=contract.run(path)
  print(out.getvalue(),end='');self.assertEqual(rc,1,out.getvalue());self.assertIn('КРАСНОЕ openai/0700/0644',out.getvalue());self.assertIn('КРАСНОЕ anthropic/0700/0644',out.getvalue())
  path.write_bytes(good);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before);self.assertEqual(contract.run(path),0)
 def test_unknown_flags_refuse(self):
  for flag in ['--dry-run','--check','-n']:
   rc,out=self.run_stand([flag]);self.assertEqual(rc,2,out)
 def test_corruption_is_real_and_return_is_green(self):
  self.size(1048576);good=self.file.read_bytes();before=hashlib.sha256(good).hexdigest();rc,out=self.run_stand();self.assertEqual(rc,0,out)
  for n,color in [(104857600,'ЖЁЛТОЕ'),(135266304,'КРАСНОЕ')]:
   self.size(n);self.assertEqual(self.file.stat().st_size,n);after=hashlib.sha256(self.file.read_bytes()).hexdigest();self.assertNotEqual(before,after);print('SIZE-PORCHA replacements=1 bytes='+str(n)+' SHA='+after+' before='+before)
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn(color,out)
  self.file.unlink();self.assertFalse(os.path.lexists(self.file));rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('G не ведётся',out)
  self.file.write_bytes(good);self.file.chmod(0o600);self.assertEqual(hashlib.sha256(self.file.read_bytes()).hexdigest(),before);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('ЗЕЛЁНОЕ',out)
if __name__=='__main__':unittest.main()
