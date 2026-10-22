#!/usr/bin/env python3
"""Run as root: python3 -B test/stend-alpha.py. Source is this package.
Needs python3-yaml and a readable v2 publisher: neighbouring dsh-pochta or
STEND_A2A_V2_SOURCE (deployment: /usr/local/libexec/a2a-v2.py).
All writes/transport/logger use private fixtures; missing prerequisites exit 2.
"""
import os,sys,pathlib,tempfile,subprocess,json,pwd,hashlib,importlib.util,unittest,shutil
sys.dont_write_bytecode=True
PACKAGE=pathlib.Path(os.environ.get('M08_PACKAGE', pathlib.Path(__file__).resolve().parents[1])).resolve()
# B-N-2071: agent-registry и шаблоны раскладки — в соседнем пакете dsh-reestr (реестр агентов отделён от почты).
REESTR_PKG=pathlib.Path(os.environ.get('M08_REESTR_PACKAGE', PACKAGE.parent/'dsh-reestr')).resolve()
def blind(reason):
 print('СЛЕПОТА: '+reason,file=sys.stderr);raise SystemExit(2)
if importlib.util.find_spec('yaml') is None:blind('нужен python3-yaml')
if os.geteuid()!=0:blind('нужен root для проверки root-почтальона в частном каталоге')
V2_SOURCE=pathlib.Path(os.environ.get('STEND_A2A_V2_SOURCE', PACKAGE.parent/'dsh-pochta/libexec/a2a-v2.py')).resolve()
for source in [REESTR_PKG/'bin/agent-registry', PACKAGE/'bin/a2a-send', PACKAGE/'sbin/a2a-pochtalon.py', PACKAGE/'lib/a2a-bus/outgoing_mirror.py', PACKAGE/'lib/a2a-bus/v2_with_mirror.py', V2_SOURCE]:
 if not source.is_file() or not os.access(source,os.R_OK):blind('источник не читается: '+str(source))

class Audit(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='m08-alpha-');self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name);self.home=self.root/'sender';(self.home/'workspace').mkdir(parents=True);self.box=self.root/'target';self.box.mkdir();self.uid=os.getuid();self.user=pwd.getpwuid(self.uid).pw_name
  self.data={'agenty':[{'imya':'sender','namerenie':{'dom':str(self.home),'polzovatel':self.user,'kanal':{'tip':'telegram','rezhim_dostavki':'personal'}}},{'imya':'target','namerenie':{'dom':str(self.box),'polzovatel':self.user,'kanal':{'tip':'telegram','rezhim_dostavki':'personal','yashchik':str(self.box)}}}]};self.registry=self.root/'agents.json';self.log=self.root/'notice.jsonl';shim=self.root/'bin';shim.mkdir()
  transport='''#!/usr/bin/python3
import os,json,sys
from pathlib import Path
kind=Path(sys.argv[0]).name
if kind=='sudo':
 if sys.argv[1:4]!=['-n','-u',os.environ['M08_USER']]:raise SystemExit('unexpected sudo shape')
 os.execv(sys.argv[4],sys.argv[4:])
with open(os.environ['M08_NOTICE'],'a') as f:f.write(json.dumps({'kind':kind,'body':sys.stdin.read(),'args':sys.argv[1:]})+'\\n')
'''
  for name in ['tell','alert','sudo','logger']:
   p=shim/name;p.write_text(transport);p.chmod(0o755)
  self.env={'PATH':str(shim)+':/usr/local/bin:/usr/bin:/bin','HOME':str(self.home),'DSH_HOME':str(self.home/'.dsh'),'LC_ALL':'C.UTF-8','AGENTS_REGISTRY':str(self.registry),'A2A_REESTR_BIN':str(REESTR_PKG/'bin/agent-registry'),'A2A_TELL_BIN':str(shim/'tell'),'A2A_ALERT_BIN':str(shim/'alert'),'M08_NOTICE':str(self.log),'M08_USER':self.user}
 def save(self):self.registry.write_text(json.dumps(self.data))
 def send(self,text='body',args=None,cwd=None):
  self.save();return subprocess.run(['bash',str(PACKAGE/'bin/a2a-send'),'target',*(args or [])],input=text,text=True,capture_output=True,env=self.env,cwd=cwd or self.home/'workspace',timeout=20)
 def notices(self):return [json.loads(s) for s in self.log.read_text().splitlines() if json.loads(s)['kind']=='tell'] if self.log.exists() else []
 def visible(self):return list(self.box.glob('*.txt'))
 def module(self):
  spec=importlib.util.spec_from_file_location('postman'+str(id(self)),PACKAGE/'sbin/a2a-pochtalon.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.REESTR=str(REESTR_PKG/'bin/agent-registry');return m
 def test_06_missing_channel_keeps_legacy_notice(self):
  del self.data['agenty'][0]['namerenie']['kanal'];r=self.send();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.visible()),1);self.assertEqual(len(self.notices()),1)
 def test_06_unknown_irregular_home_skips(self):
  self.env.pop('DSH_HOME');self.env['HOME']=str(self.root/'svc.dir');r=self.send();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.visible()),1);self.assertEqual(len(self.notices()),1)
 def test_06_personal_without_home_field_outside_cwd(self):
  del self.data['agenty'][0]['namerenie']['dom'];r=self.send(cwd=self.root);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.notices()),1)
 def test_06_established_owner_all_bad_context_stays_closed(self):
  self.data['agenty'][0]['namerenie']['kanal']['rezhim_dostavki']='owner-all';r=self.send(cwd=self.root);self.assertEqual(r.returncode,4);self.assertEqual(len(self.visible()),1);self.assertEqual(self.notices(),[])
 def test_06_established_owner_all_missing_home_stays_closed(self):
  self.data['agenty'][0]['namerenie']['kanal']['rezhim_dostavki']='owner-all';del self.data['agenty'][0]['namerenie']['dom'];r=self.send();self.assertEqual(r.returncode,4);self.assertEqual(len(self.visible()),1)
 def test_06_owner_all_full_record_exact(self):
  self.data['agenty'][0]['namerenie']['kanal']['rezhim_dostavki']='owner-all';text='body 😀';r=self.send(text);self.assertEqual(r.returncode,0,r.stderr);files=list((self.home/'a2a/polnye').glob('*.json'));self.assertEqual(len(files),1);self.assertEqual(json.loads(files[0].read_text())['body'],text);self.assertEqual(files[0].stat().st_mode&0o777,0o600);self.assertEqual(self.notices(),[])
 def test_07_hyphen_names_v1_owner_all_v2_and_forgery(self):
  m=self.module();wire=b'[delivery-v1 id='+b'0'*64+b' reply=no]\nbody';names=['20261013T000001Z-my-agent-01234567.txt','20261013T000001Z-my-agent-ownerall-01234567.txt','20261013T000001Z-my-agent-v2-'+('0'*64)+'.txt']
  for name in names:
   with self.subTest(name=name):self.assertTrue(m.eto_pismo(name,'my-agent',b'[a2a-envelope version=2]\n{}' if '-v2-' in name else wire)[0])
  self.assertFalse(m.eto_pismo(names[0],'my-other',wire)[0]);self.assertFalse(m.eto_pismo(names[0],'my-agent',b'no envelope')[0]);self.assertTrue(m.eto_pismo('20261013T000001Z-root-01234567.txt','root',wire)[0])
 def test_07_reserved_suffix_is_still_a_legal_account(self):
  m=self.module();wire=b'[delivery-v1 id='+b'0'*64+b' reply=no]\nbody'
  for owner in ['my-agent-ownerall','my-agent-v2']:
   for tail in ['01234567','ownerall-01234567','v2-'+('0'*64)]:
    name='20261013T000001Z-'+owner+'-'+tail
    with self.subTest(owner=owner,tail=tail):self.assertTrue(m.eto_pismo(name+'.txt',owner,b'[a2a-envelope version=2]\n{}' if tail.startswith('v2-') else wire)[0])
 def test_08_long_unletter_quarantined_three_cycles(self):
  spool=self.root/'spool';spool.mkdir();box=spool/'recipient';box.mkdir();name='x'*240;bad=box/name;bad.write_text('DO_NOT_SHOW_PRIVATE_CONTENT')
  # The root-owned receiver must see a file owned by another UID, not an already processed file.
  os.chown(bad,1,0);self.assertNotEqual(bad.stat().st_uid,box.stat().st_uid);env={**self.env,'A2A_KOREN':str(spool)};codes=[]
  for _ in range(3):
   got=subprocess.run([sys.executable,str(PACKAGE/'sbin/a2a-pochtalon.py')],capture_output=True,text=True,env=env,timeout=15);codes.append(got.returncode)
  self.assertEqual(codes,[1,0,0]);self.assertFalse(bad.exists());hidden=list(box.glob('.ne-pismo-*'));self.assertEqual(len(hidden),1);self.assertEqual(hidden[0].read_text(),'DO_NOT_SHOW_PRIVATE_CONTENT');self.assertEqual(len(self.notices()),1);rows=[json.loads(s) for s in self.log.read_text().splitlines()];self.assertEqual(sum(x['kind']=='alert' for x in rows),1);self.assertTrue(all('DO_NOT_SHOW_PRIVATE_CONTENT' not in x['body'] for x in rows))
 def test_09_wire_byte_boundary_includes_envelope_newline(self):
  self.env['A2A_PREDEL_BAJT']='512';r=self.send('x'*420);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(self.visible()[0].stat().st_size,512)
  before=set(self.box.iterdir());r=self.send('x'*421);self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(set(self.box.iterdir()),before)
 def test_09_utf8_bytes_not_character_count(self):
  self.env['A2A_PREDEL_BAJT']='512';r=self.send('😀'*106);self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(list(self.box.iterdir()),[])
 def test_09_default_large_stdin_never_published(self):
  r=self.send('x'*(1024*1024+1));self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(list(self.box.iterdir()),[])
 def test_09_v2_real_wire_and_put_refuse_before_publication(self):
  self.save();helper=self.root/'v2-real-functions.py';publisher=V2_SOURCE;helper.write_text("import os,sys,runpy\nns=runpy.run_path("+repr(str(publisher))+");wire=ns['wire'];put=ns['put']\ndef main():\n body=sys.stdin.read();meta={'recipient':{'id':'target'},'delivery_id':'size-probe'};put({'spool':os.environ['M08_V2_SPOOL']},meta,body)\n")
  self.env.update({'A2A_V2_HELPER':str(helper),'M08_V2_SPOOL':str(self.box),'A2A_PREDEL_BAJT':'512'})
  def go(body):return subprocess.run(['bash',str(PACKAGE/'bin/a2a-send'),'--v2'],input=body,text=True,capture_output=True,env=self.env,cwd=self.home/'workspace',timeout=10)
  r=go('x'*600);self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(list(self.box.iterdir()),[]);r=go('hello');self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.visible()),1)
 def test_10_shared_account_never_first_agent(self):
  self.data['agenty'].append({'imya':'second','namerenie':{'polzovatel':self.user}});self.save();r=subprocess.run([str(REESTR_PKG/'bin/agent-registry'),'kto',self.user],env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,3);self.assertEqual(r.stdout,'')
  m=self.module();old=os.environ.get('AGENTS_REGISTRY');os.environ['AGENTS_REGISTRY']=str(self.registry)
  try:self.assertEqual(m.imya_agenta(self.user),self.user)
  finally:
   if old is None:os.environ.pop('AGENTS_REGISTRY')
   else:os.environ['AGENTS_REGISTRY']=old
 def test_10_unique_account_and_unknown(self):
  self.data['agenty'][1]['namerenie']['polzovatel']='receiver-fixture';self.save();r=subprocess.run([str(REESTR_PKG/'bin/agent-registry'),'kto',self.user,'--json'],env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(json.loads(r.stdout),'sender');r=subprocess.run([str(REESTR_PKG/'bin/agent-registry'),'kto','no-such'],env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,3);self.assertEqual(r.stdout,'')
 def test_15_missing_yaml_reports_dependency_and_no_write(self):
  self.save();before=set(self.root.iterdir());r=subprocess.run(['/usr/bin/python3','-S',str(REESTR_PKG/'bin/agent-registry'),'list'],env=self.env,capture_output=True,text=True);self.assertEqual(r.returncode,2);self.assertIn('python3-yaml',r.stderr);self.assertEqual(r.stdout,'');self.assertEqual(set(self.root.iterdir()),before)
 def test_15_sender_reports_upstream_dependency_failure(self):
  shim=self.root/'no-yaml';shim.write_text('#!/bin/sh\nexec /usr/bin/python3 -S "$M08_REAL_REGISTRY" "$@"\n');shim.chmod(0o755);self.env['M08_REAL_REGISTRY']=str(REESTR_PKG/'bin/agent-registry');self.env['A2A_REESTR_BIN']=str(shim);r=self.send();self.assertEqual(r.returncode,3);self.assertIn('код 2',r.stderr);self.assertNotIn('нет агента',r.stderr);self.assertEqual(list(self.box.iterdir()),[])
 def test_22_partial_write_cleanup(self):
  hook=self.root/'bash-env';hook.write_text("printf() { local caller_pid=\"$BASHPID\"; local target; target=\"$(readlink /proc/$caller_pid/fd/1)\"; if [[ \"$target\" = \"$M08_BOX\"/.* ]]; then builtin printf '%s' partial; return 1; fi; builtin printf \"$@\"; }\n");self.env['BASH_ENV']=str(hook);self.env['M08_BOX']=str(self.box);r=self.send();self.assertEqual(r.returncode,1,r.stderr);self.assertEqual(list(self.box.iterdir()),[],'failed printf must not leave hidden partial letter')

 def test_23_failed_argv_counter_refuses_before_placement(self):
  hook=self.root/'bash-env';hook.write_text("python3() { if [ \"$1\" = -c ] && [ \"$2\" = 'import sys; print(len(sys.stdin.read()))' ]; then return 127; fi; /usr/bin/python3 \"$@\"; }\n");self.env['BASH_ENV']=str(hook);r=self.send('',args=['--text','argv']);self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(list(self.box.iterdir()),[])
 def test_23_unicode_argv_boundary(self):
  self.env['A2A_PREDEL_ARGV']='3';self.assertEqual(self.send('',args=['--text','😀яя']).returncode,0);before=set(self.box.iterdir());self.assertEqual(self.send('',args=['--text','😀яяя']).returncode,3);self.assertEqual(set(self.box.iterdir()),before)
 def test_24_localized_unknown_sender_not_registry_outage(self):
  wrap=self.root/'localized';wrap.write_text('''#!/usr/bin/python3
import os,sys,subprocess
r=subprocess.run([os.environ['M08_REAL_REGISTRY'],*sys.argv[1:]],capture_output=True)
sys.stdout.buffer.write(r.stdout)
for line in r.stderr.decode().splitlines():
 print(line if line.startswith('agent-registry-error:') else 'localized human explanation',file=sys.stderr)
sys.exit(r.returncode)
''');wrap.chmod(0o755);self.env['M08_REAL_REGISTRY']=str(REESTR_PKG/'bin/agent-registry');self.env['A2A_REESTR_BIN']=str(wrap);self.env['DSH_HOME']=str(self.root/'unregistered'/'.dsh');r=self.send();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.visible()),1);self.assertEqual(len(self.notices()),1)
 def test_24_registry_failure_stays_closed(self):
  fake=self.root/'failure';fake.write_text('#!/bin/sh\nif [ "$2" = sender ]; then echo registry-broken >&2; exit 2; fi\nexec "$M08_REAL_REGISTRY" "$@"\n');fake.chmod(0o755);self.env['M08_REAL_REGISTRY']=str(REESTR_PKG/'bin/agent-registry');self.env['A2A_REESTR_BIN']=str(fake);r=self.send();self.assertEqual(r.returncode,4);self.assertEqual(len(self.visible()),1);self.assertEqual(self.notices(),[])
if __name__=='__main__':unittest.main(verbosity=2)
