"""Full root CLI on two actually generated guarded releases, private native registry."""
import hashlib,importlib.util,json,os
from pathlib import Path
import pwd,subprocess,sys,tempfile,unittest
PACKAGE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(PACKAGE/'lib'))
def fixture_dir(path):
 # parents=True does not apply mode to intermediate fixture directories.
 if not path.parent.is_dir():fixture_dir(path.parent)
 path.mkdir(mode=0o755,exist_ok=True)
class RollbackCLI(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='ap-full-catalog-');self.addCleanup(self.tmp.cleanup)
  self.top=Path(self.tmp.name);self.top.chmod(0o755);self.root=self.top/'root';fixture_dir(self.root)
  spec=importlib.util.spec_from_file_location('installer_fixture',PACKAGE/'lib/install.py');self.inst=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.inst)
  self.lock,raw=self.inst.source();self.expected={};self.releases=[]
  part_b=json.loads((PACKAGE/'part-b-lock.json').read_text())['local_suffix'].lstrip('-')
  for revision in [f'fixture-{part_b}-old',f'fixture-{part_b}-new']:
   lock=dict(self.lock,local_revision=revision);expected,(_,release)=self.inst.layout(self.root,lock,raw)
   self.releases.append(release)
   self.expected.update(expected)
  for path,row in sorted(self.expected.items(),key=lambda item:len(item[0].parts)):self.inst.apply(path,row)
  self.old,self.new=self.releases;self.current=self.root/'opt/autopilot/current'
  checker=self.root/'usr/local/libexec/dsh-autopilot/layout-check.py';fixture_dir(checker.parent);checker.write_bytes((PACKAGE/'checks/layout-check.py').read_bytes());checker.chmod(0o755)
  self.expected[checker]=('file',0o755,checker.read_bytes())
  self.mf=checker.parent/'layout.json';self.write_manifest()
  self.registry=self.root/'etc/agent-registry/plugins.yaml';fixture_dir(self.registry.parent)
  self.registry.write_text('plugins:\n  - id: neighbor\n    version: 9\n  - id: dsh-autopilot\n    version: 0.1.6\n    installed_check: /usr/bin/python3 -I -B '+str(checker)+' --manifest '+str(self.mf)+' --sha '+hashlib.sha256(self.mf.read_bytes()).hexdigest()+' --root '+str(self.root)+'\n')
  self.registry.chmod(0o644)
  for cmd in [['git','init','-q'],['git','add','plugins.yaml'],['git','-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','fixture']]:subprocess.run(cmd,cwd=self.registry.parent,check=True,capture_output=True)
  self.hod=self.top/'systemctl';self.hod.write_text('#!/usr/bin/python3\nprint(0)\n');self.hod.chmod(0o755)
  fixture_dir(self.root/'opt/master');self.base=self.root/'var/lib/dsh-autopilot'
  scope=self.root/'inventory-scope.json';scope.write_text(json.dumps(dict(schemaVersion=1,roots=[str(self.top)],publicRoot=str(self.top/'public'))));scope.chmod(0o600)
  self.sentinels=[]
  for rel in ['etc/systemd/system/untouched.service','var/lib/autopilot-mail/mail.sqlite','opt/autopilot/mail/sentinel']:
   p=self.root/rel;fixture_dir(p.parent);p.write_text('untouched');self.sentinels.append(p)
 def write_manifest(self):
  rows=[]
  for path,(kind,mode,data) in self.expected.items():
   row=dict(path='/'+str(path.relative_to(self.root)),kind=kind,mode=mode,uid=0,gid=0)
   if kind=='file':row['sha256']=hashlib.sha256(data).hexdigest()
   elif kind=='link':row['target']=data
   rows.append(row)
  self.mf.write_text(json.dumps(dict(version='0.1.6',rows=rows,managed=['/opt/autopilot/releases/'+p.name for p in self.releases])))
  self.mf.chmod(0o644)
 def bootstrap(self):
  spec=importlib.util.spec_from_file_location('catalog_fixture',PACKAGE/'runtime/run_catalog.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  report=self.top/'legacy.json';report.write_text(json.dumps(m.scan_legacy(self.root))+'\n')
  m.bootstrap(self.base,self.root,report,hashlib.sha256(report.read_bytes()).hexdigest());return m
 def call(self,target):
  return subprocess.run(['bash',str(PACKAGE/'install.sh'),'--rollback',target.name],env=dict(os.environ,DESTDIR=str(self.root),HOD_SYSTEMCTL=str(self.hod)),capture_output=True,text=True,timeout=30)
 def snapshot(self):
  return [(p.read_bytes(),p.stat().st_ino,p.stat().st_mtime_ns) for p in self.sentinels]
 def test_public_cli_without_inventory_is_fail_closed_and_guarded_cycle_is_real(self):
  before=self.registry.read_bytes();link=os.readlink(self.current)
  q=self.call(self.old);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('RUN_INVENTORY_UNPROVEN',q.stderr)
  self.assertEqual(self.registry.read_bytes(),before);self.assertEqual(os.readlink(self.current),link)
  self.bootstrap();sentinels=self.snapshot()
  for target in [self.old,self.new]:
   q=self.call(target);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
   result=json.loads(q.stdout);self.assertEqual(result['phase'],'complete')
   self.assertEqual(os.readlink(self.current),'releases/'+target.name)
   records=list((self.base/'rollback').glob('*/record.json'));self.assertTrue(records)
   record=json.loads(max(records,key=lambda p:p.stat().st_mtime_ns).read_text())
   self.assertEqual(record['admissionChecks'][-1]['activeRuns'],0)
   self.assertEqual(record['admissionChecks'][-1]['catalogRuns'],0)
   self.assertEqual(self.snapshot(),sentinels)
  self.assertEqual(len(list((self.base/'rollback').glob('*/record.json'))),2)
 def test_actual_runtime_pin_blocks_cli_until_finish(self):
  self.bootstrap();master=pwd.getpwnam('master')
  project=self.top/'project';fixture_dir(project);os.chown(project,master.pw_uid,master.pw_gid)
  public=self.top/'public';fixture_dir(public);os.chown(public,0,master.pw_gid);public.chmod(0o2751)
  agent=public/'master';fixture_dir(agent);os.chown(agent,master.pw_uid,master.pw_gid);agent.chmod(0o2750)
  worker='import os,subprocess,sys;e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));q=subprocess.run(sys.argv[1:],env=e);sys.exit(q.returncode)'
  def runtime(*args):
   q=subprocess.run(['setpriv','--reuid='+str(master.pw_uid),'--regid='+str(master.pw_gid),'--clear-groups',sys.executable,'-B','-c',worker,sys.executable,'-B',str(self.new/'skill/tools/ap.py'),'--no-serve',*args],cwd=project,env=dict(os.environ,AUTOPILOT_AGENT='master',AUTOPILOT_PUBLIC_ROOT=str(public)),capture_output=True,text=True)
   self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  runtime('init','--slug','actual-run')
  before=self.registry.read_bytes();q=self.call(self.old)
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('LIVE_RUN_PINNED',q.stderr);self.assertEqual(self.registry.read_bytes(),before)
  self.assertEqual(os.readlink(self.current),'releases/'+self.new.name)
  runtime('finish','--result','done');q=self.call(self.old);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_target_damage_refuses_and_returns_with_real_catalog_admission(self):
  self.bootstrap();p=self.old/'skill/tools/ap.py';raw=p.read_bytes();before=self.registry.read_bytes()
  p.write_bytes(raw+b'\nCATALOG_CLI_CORRUPTION\n')
  self.assertEqual(subprocess.check_output(['grep','-cF','CATALOG_CLI_CORRUPTION',str(p)],text=True).strip(),'1')
  self.assertNotEqual(hashlib.sha256(raw).hexdigest(),hashlib.sha256(p.read_bytes()).hexdigest())
  q=self.call(self.old);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('RELEASE_INTEGRITY',q.stderr)
  self.assertEqual(before,self.registry.read_bytes());p.write_bytes(raw)
  q=self.call(self.old);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
class RegistryCandidate(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('registry_candidate_under_test',PACKAGE/'lib/release_rollback.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
 def candidate(self,text):
  import yaml
  doc=yaml.safe_load(text);group='plugins';index=next(i for i,e in enumerate(doc[group]) if e.get('id')=='dsh-autopilot')
  plan=dict(root=Path('/'),registry=doc,entry_group=group,entry_index=index,registry_bytes=text.encode(),checker_path=Path('/opt/autopilot/packages/copy/checks/layout-check.py'),target='a'*40+'-old')
  return self.m.registry_candidate(plan,Path('/opt/autopilot/selection-manifests/copy.json'),'b'*64,'c'*32)
 def test_block_styles_preserve_all_unrelated_bytes_and_fields(self):
  import yaml
  for indent in ('  ',''):
   text=('# retained заголовок\nplugins:\n'+indent+'- id: neighbor\n'+indent+"  note: 'unchanged: neighbour' # keep\n"+indent+'- id: "dsh-autopilot" # quoted id\n'+indent+'  installed_check: /old/check --some\n'+indent+'    wrapped-argument\n'+indent+"  note: 'old note' # keep note comment\n"+indent+'- id: after\n'+indent+'  data: [1, 2] # tail\n')
   with self.subTest(indent=len(indent)):
    result=self.candidate(text);before=yaml.safe_load(text);after=yaml.safe_load(result)
    self.assertEqual(before['plugins'][0],after['plugins'][0]);self.assertEqual(before['plugins'][2],after['plugins'][2])
    self.assertEqual(result.split(indent+'- id: "dsh-autopilot"')[0],text.split(indent+'- id: "dsh-autopilot"')[0])
    self.assertEqual(result.split(indent+'- id: after')[1],text.split(indent+'- id: after')[1])
    self.assertIn('# quoted id',result);self.assertIn('# keep note comment',result)
    ap=after['plugins'][1];self.assertIn('--manifest',ap['installed_check']);self.assertEqual(ap['note'],'old note; core selector operation '+'c'*32)
 def test_flow_trailing_comma_and_block_scalar_remain_valid(self):
  import yaml
  for text in ('plugins: [{id: dsh-autopilot, installed_check: old,}]\n',
               'plugins: [{id: dsh-autopilot, installed_check: old, channel: {old: value}}]\n',
               'plugins:\n- id: dsh-autopilot\n  installed_check: >\n    /old/check\n    --wrapped\n'):
   with self.subTest(text=text):
    result=self.candidate(text);entry=yaml.safe_load(result)['plugins'][0]
    self.assertIn('--manifest',entry['installed_check']);self.assertIn('core selector',entry['note'])
 def test_block_container_channel_keeps_next_field_on_its_own_line(self):
  import yaml
  for value in ('    old: value\n','    - old\n'):
   text='plugins:\n  - id: dsh-autopilot\n    installed_check: old\n    channel:\n'+value.replace('    ','      ')+'    note: retained\n  - id: neighbour\n    untouched: true\n'
   result=self.candidate(text);entry=yaml.safe_load(result)['plugins'][0]
   self.assertEqual(entry['note'],'retained; core selector operation '+'c'*32)
   self.assertIn('  - id: neighbour\n    untouched: true\n',result)

 def test_empty_channel_and_comments_after_container_preserve_yaml_boundaries(self):
  import yaml
  for value in ('', ' null', ' []', ' {}', '\n      old: value'):
   with self.subTest(value=value):
    text='plugins:\n  - id: dsh-autopilot\n    installed_check: old\n    channel:'+value+'\n    # keep before note\n    note: retained\n'
    result=self.candidate(text)
    self.assertEqual(yaml.safe_load(result)['plugins'][0]['note'],'retained; core selector operation '+'c'*32)
    self.assertIn('    # keep before note\n',result)

 def test_nested_block_scalar_channel_preserves_next_field_and_comment(self):
  import yaml
  for value in ('      old: |\n        content\n','      old: >\n        content\n','      - |\n        content\n','      - >\n        content\n'):
   with self.subTest(value=value):
    text='plugins:\n  - id: dsh-autopilot\n    installed_check: old\n    channel:\n'+value+'    # keep after block\n    note: retained\n'
    result=self.candidate(text)
    self.assertEqual(yaml.safe_load(result)['plugins'][0]['note'],'retained; core selector operation '+'c'*32)
    self.assertIn('\n    # keep after block\n    note:',result)

 def test_last_empty_channel_without_note_at_eof_preserves_insert_order(self):
  import yaml
  for indent in ('','  '):
   for end in ('','\n'):
    with self.subTest(indent=indent,end=end):
     text='plugins:\n'+indent+'- id: dsh-autopilot\n'+indent+'  installed_check: old\n'+indent+'  channel:'+end
     result=self.candidate(text);entry=yaml.safe_load(result)['plugins'][0]
     self.assertEqual(entry['note'],'; core selector operation '+'c'*32)
     self.assertEqual(entry['channel'],'selected core '+'a'*40+'-old; package and postal runtime retained')

 def test_unicode_plain_scalar_data_and_yaml_line_breaks_are_not_confused(self):
  import yaml
  for trailing in ('\u00a0','\u2003'):
   with self.subTest(trailing=trailing):
    text='plugins:\n  - id: dsh-autopilot\n    installed_check: old\n    channel: old'+trailing+'\n    note: retained\n'
    result=self.candidate(text);self.assertEqual(yaml.safe_load(result)['plugins'][0]['note'],'retained; core selector operation '+'c'*32)
  for newline in ('\n','\r\n','\x85','\u2028','\u2029'):
   with self.subTest(newline=newline):
    text=newline.join(['plugins:','  - id: dsh-autopilot','    installed_check: old','  - id: neighbour','    value: kept',''])
    result=self.candidate(text)
    self.assertEqual(yaml.safe_load(result)['plugins'][1],dict(id='neighbour',value='kept'))

 def test_duplicate_ap_entry_remains_ambiguous(self):
  text='plugins:\n  - id: dsh-autopilot\n    installed_check: old\n  - id: dsh-autopilot\n    installed_check: other\n'
  with self.assertRaisesRegex(ValueError,'AMBIGUOUS'):self.candidate(text)

if __name__=='__main__':unittest.main(verbosity=2)
