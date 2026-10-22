"""Native collector with fake systemctl responses and real private proc-format files."""
import contextlib,hashlib,importlib.util,io,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest import mock
STAND=Path(__file__).with_name('stend-codex-app-server.py')

class CodexPut(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('codex_put_stand',STAND);self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.m.PROC=self.root;self.units={};self.show_calls={};self.timeout=False;self.changed_pid=False
  self.add('coder-gateway-fixture.service',101)
 def tearDown(self):self.tmp.cleanup()
 def add(self,unit,pid,provider=b'openai',put=b'app-server'):
  self.units[unit]=pid
  if not pid:return
  d=self.root/str(pid);d.mkdir(exist_ok=True)
  fields=[b'PRIVATE_FIXTURE=not-for-output']
  if provider is not None:fields.append(b'GATEWAY_POSTAVSHIK='+provider)
  if put is not None:fields.append(b'GATEWAY_CODEX_PUT='+put)
  (d/'environ').write_bytes(b'\0'.join(fields)+b'\0')
  (d/'stat').write_text(str(pid)+' (fixture name) S '+' '.join(['0']*18+['12345']+['0']*5)+'\n')
 def control(self,argv,**kwargs):
  self.assertEqual(argv[0],'systemctl');self.assertLessEqual(kwargs['timeout'],3)
  if self.timeout:raise subprocess.TimeoutExpired(argv,kwargs['timeout'])
  if argv[1]=='list-units':
   self.assertIn('coder-gateway*',argv);text=''.join(u+' loaded active running fixture\n' for u in self.units)
  elif argv[1]=='show':
   unit=argv[2];self.show_calls[unit]=self.show_calls.get(unit,0)+1;pid=self.units[unit]
   if self.changed_pid and self.show_calls[unit]>1:pid+=1
   text='Id='+unit+'\nMainPID='+str(pid)+'\n'
  else:self.fail('unexpected command '+repr(argv))
  return subprocess.CompletedProcess(argv,0,text,'')
 def run_stand(self,args=()):
  out=io.StringIO();err=io.StringIO()
  with mock.patch.object(self.m.subprocess,'run',side_effect=self.control),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
   try:rc=self.m.main(list(args))
   except SystemExit as e:rc=e.code
  return rc,out.getvalue()+err.getvalue()
 def test_healthy_discovers_dash_and_template_units(self):
  self.add('coder-gateway@second.service',102);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('Codex-шлюзов 2 · app-server 2 · иначе 0',out);self.assertIn('coder-gateway@second.service',out);self.assertNotIn('not-for-output',out)
 def test_missing_variable_and_exec_are_red_then_restore(self):
  p=self.root/'101/environ';healthy=p.read_bytes()
  for value in [None,b'exec']:
   bad=b'GATEWAY_POSTAVSHIK=openai\0'+(b'GATEWAY_CODEX_PUT='+value+b'\0' if value else b'')
   before=hashlib.sha256(healthy).hexdigest();p.write_bytes(bad);after=hashlib.sha256(p.read_bytes()).hexdigest();self.assertNotEqual(before,after)
   count=subprocess.run(['grep','-a','-cF',b'GATEWAY_CODEX_PUT=app-server'.decode(),str(p)],capture_output=True,text=True);self.assertEqual(count.stdout.strip(),'0')
   print('ENV-PORCHA replacements=1 value='+str(value)+' before='+before+' after='+after+' grepF=0',flush=True)
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ coder-gateway-fixture.service',out);self.assertIn('Codex-шлюзов 1 · app-server 0 · иначе 1',out)
   p.write_bytes(healthy);self.assertEqual(p.read_bytes(),healthy);rc,out=self.run_stand();self.assertEqual(rc,0,out)
 def test_js_trim_mode_accepts_wrapped_app_server(self):
  # Explicit ECMAScript WhiteSpace + LineTerminator code points, independent of the stand constant.
  points=[0x09,0x0a,0x0b,0x0c,0x0d,0x20,0xa0,0x1680,*range(0x2000,0x200b),0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]
  values=['app-server','app-server ',' app-server\n']+[chr(c)+'app-server'+chr(c) for c in points]
  for value in values:
   with self.subTest(value=repr(value)):
    self.add('coder-gateway-fixture.service',101,put=value.encode())
    rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('Codex-шлюзов 1 · app-server 1 · иначе 0',out)
 def test_empty_trimmed_empty_exec_and_missing_stay_red(self):
  for value in [None,b'',b'exec',b' exec ',b' \t\r\n','\ufeff\u00a0'.encode()]:
   with self.subTest(value=value):
    self.add('coder-gateway-fixture.service',101,put=value)
    rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ coder-gateway-fixture.service',out);self.assertIn('Codex-шлюзов 1 · app-server 0 · иначе 1',out)
 def test_non_js_whitespace_and_invalid_utf8_do_not_turn_green(self):
  for value in ['\u0085app-server','app-server\u001c','\u180eapp-server','app-server\u200b','app- server']:
   with self.subTest(value=repr(value)):
    self.add('coder-gateway-fixture.service',101,put=value.encode())
    rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ coder-gateway-fixture.service',out)
  self.add('coder-gateway-fixture.service',101,put=b'\xffapp-server\xff')
  rc,out=self.run_stand();self.assertEqual(rc,1,out)
 def test_zero_gateways_is_blind(self):
  self.units.clear();rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out);self.assertIn('Codex-шлюзов 0',out)
 def test_missing_environ_is_named_blindness(self):
  (self.root/'101/environ').unlink();rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА coder-gateway-fixture.service',out)
 def test_missing_provider_is_not_silently_excluded(self):
  self.add('coder-gateway-fixture.service',101,provider=None);rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('GATEWAY_POSTAVSHIK',out)
 def test_non_codex_is_excluded_and_dead_unit_is_not_counted(self):
  self.add('coder-gateway-other.service',102,provider=b'anthropic');self.add('coder-gateway-dead.service',0);rc,out=self.run_stand();self.assertEqual(rc,0,out);self.assertIn('Codex-шлюзов 1 · app-server 1 · иначе 0',out);self.assertIn('ВНЕ ОБЛАСТИ coder-gateway-other.service',out)
 def test_only_non_codex_is_zero_codex_blindness(self):
  self.add('coder-gateway-fixture.service',101,provider=b'anthropic');rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('Codex-шлюзов 0',out)
 def test_mainpid_changed_is_blind(self):
  self.changed_pid=True;rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('coder-gateway-fixture.service',out)
 def test_ambiguous_or_unterminated_environ_is_blind(self):
  p=self.root/'101/environ'
  for raw in [b'GATEWAY_POSTAVSHIK=openai\0GATEWAY_CODEX_PUT=app-server\0GATEWAY_CODEX_PUT=exec\0',b'GATEWAY_POSTAVSHIK=openai']:
   p.write_bytes(raw);rc,out=self.run_stand();self.assertEqual(rc,2,out)
 def test_js_unicode_trim_provider_cannot_hide_codex(self):
  for whitespace in ['\u00a0','\ufeff','\u1680','\u2007','\u2028','\u202f','\u205f','\u3000']:
   self.add('coder-gateway-unicode.service',102,provider=(whitespace+'openai'+whitespace).encode(),put=b'exec')
   rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertIn('КРАСНОЕ coder-gateway-unicode.service',out);self.assertIn('Codex-шлюзов 2 · app-server 1 · иначе 1',out)
 def test_nonexact_value_is_red_without_dumping_payload(self):
  self.add('coder-gateway-fixture.service',101,put=b'not-for-output');rc,out=self.run_stand();self.assertEqual(rc,1,out);self.assertNotIn('not-for-output',out)
 def test_systemctl_failure_is_blind(self):
  self.timeout=True;rc,out=self.run_stand();self.assertEqual(rc,2,out);self.assertIn('СЛЕПОТА',out)
 def test_bad_stat_is_blind(self):
  (self.root/'101/stat').write_text('broken');rc,out=self.run_stand();self.assertEqual(rc,2,out)
 def test_cli_real_proc_corruption_and_return(self):
  unit='coder-gateway@cli-fixture.service';children=[];b=self.root/'bin';b.mkdir();config=self.root/'units.json'
  tool=b/'systemctl';tool.write_text("#!/usr/bin/python3\nimport json,sys\nk=json.load(open("+repr(str(config))+"))\na=sys.argv[1:]\nif a[0]=='list-units':\n for u in k: print(u+' loaded active running fixture')\nelif a[0]=='show': print('Id='+a[1]+'\\nMainPID='+str(k[a[1]]))\nelse:sys.exit(3)\n");tool.chmod(0o755)
  try:
   modes=[b'app-server',b'app-server ',b' app-server\n',None,b'exec',b'',b' \t\r\n']
   for mode in modes:
    env={'PATH':os.defpath,'GATEWAY_POSTAVSHIK':'openai','PRIVATE_FIXTURE':'not-for-output'}
    if mode is not None:env['GATEWAY_CODEX_PUT']=mode.decode()
    children.append(subprocess.Popen([sys.executable,'-B','-c','import time; time.sleep(30)'],env=env))
   for index,expected in [(0,0),(1,0),(2,0),(3,1),(0,0),(4,1),(0,0),(5,1),(0,0),(6,1),(0,0)]:
    before=hashlib.sha256(config.read_bytes()).hexdigest() if config.exists() else None;config.write_text(json.dumps({unit:children[index].pid}));after=hashlib.sha256(config.read_bytes()).hexdigest()
    if before is not None:self.assertNotEqual(before,after)
    raw=(Path('/proc')/str(children[index].pid)/'environ').read_bytes()
    if modes[index] is None:self.assertNotIn(b'GATEWAY_CODEX_PUT=',raw)
    else:self.assertIn(b'GATEWAY_CODEX_PUT='+modes[index]+b'\0',raw)
    print('CLI-CONTROL replacements=1 index='+str(index)+' before='+str(before)+' after='+after,flush=True)
    q=subprocess.run([sys.executable,'-B',str(STAND)],env={**os.environ,'PATH':str(b)+':'+os.defpath},capture_output=True,text=True,timeout=5)
    self.assertEqual(q.returncode,expected,q.stdout+q.stderr);self.assertIn(unit,q.stdout);self.assertIn('Codex-шлюзов 1',q.stdout);self.assertNotIn('not-for-output',q.stdout+q.stderr)
    print(q.stdout.strip(),flush=True)
  finally:
   for child in children:
    child.terminate()
    try:child.wait(timeout=2)
    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=2)
 def test_unknown_flags_refuse(self):
  for flag in ['--dry-run','--check','-n']:
   rc,out=self.run_stand([flag]);self.assertEqual(rc,2,out)

if __name__=='__main__':unittest.main()
