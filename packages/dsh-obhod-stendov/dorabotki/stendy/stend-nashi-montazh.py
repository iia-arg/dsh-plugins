#!/usr/bin/python3 -B
"""Full copied nashi algorithm. Only table data and host roots are fixtures; mount namespace isolates host paths."""
import hashlib,json,os,pwd,re,shutil,subprocess,tempfile,time,unittest
from pathlib import Path
HERE=Path(__file__).resolve();REPO=HERE.parents[4];NASHI=HERE.parents[1]/'nashi-dorabotki.sh';HELPER=REPO/'packages/dsh-montazh/sbin/montazh-okno'
class Nashi(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='nashi-window-');self.r=Path(self.tmp.name);self.r.chmod(0o755);self.pw=pwd.getpwnam('iskra')
  for name in ('opt','usr-local','registry-dir','root-unit-dir','data','windows','q','dor','pairs','home/app','host-copies','dropins/fixture.service.d'):(self.r/name).mkdir(parents=True,exist_ok=True)
  self.live=self.r/'data/fixture';self.live.write_text('old');self.outside=self.r/'data/outside';self.outside.write_text('old')
  app=self.r/'home/app';(app/'package-lock.json').write_text('{}');(app/'package.json').write_text('{}')
  (self.r/'dropins/fixture.service.d/x.conf').write_text('[Service]\n')
  self.registry=self.r/'registry-dir/agents.yaml';self.registry.write_text('agenty:\n- imya: iskra\n  namerenie:\n    dom: '+str(self.r/'home')+'\n')
  self.manifest=self.r/'manifest';s=NASHI.read_text();s,n=re.subn(r"(?ms)^FILES='\n.*?\n'$","FILES='\nA|"+str(self.live)+'|fixture\nA|'+str(self.outside)+"|outside\n'",s);self.assertEqual(n,1);s,n=re.subn(r"(?ms)^LINKS='\n.*?\n'$","LINKS='\n'",s);self.assertEqual(n,1)
  extras=[]
  for i in range(10):
   f=self.r/'data'/('neutral-'+str(i));f.write_text('fixed');extras.append('A|'+str(f)+'|fixture')
  extras += ['A|/opt/iskra/workspace/dorabotki/zamorozka-predmeta|fixture', 'P|/opt/iskra/workspace/dsh-plugins/packages/fixture-nashi|fixture']
  s=s.replace('A|'+str(self.outside)+'|outside\n', 'A|'+str(self.outside)+'|outside\n'+'\n'.join(extras)+'\n')
  (self.r/'usr-local/libexec').mkdir();(self.r/'usr-local/libexec/fixture').write_text('fixed')
  (self.r/'host-copies/paired').write_text('fixed');(self.r/'dor/paired').write_text('fixed')
  tree=self.r/'opt/iskra/workspace/dsh-plugins';(tree/'packages/fixture-nashi').mkdir(parents=True)
  (tree/'packages/fixture-nashi/package.json').write_text('{"name":"fixture-nashi","version":"1.0.0","files":["x"]}')
  (tree/'packages/fixture-nashi/x').write_text('fixed')
  plugin=self.r/'opt/iskra/plugins/fixture-nashi';plugin.mkdir(parents=True)
  shutil.copytree(tree/'packages/fixture-nashi',plugin,dirs_exist_ok=True)
  s=s.replace("FILES='\n","FILES='\nA|/opt/iskra/plugins/fixture-nashi/package.json|fixture\nA|/opt/iskra/plugins/fixture-nashi/x|fixture\n",1)
  subprocess.run(['git','init','-q',str(tree)],check=True,capture_output=True)
  subprocess.run(['git','-C',str(tree),'add','.'],check=True,capture_output=True)
  subprocess.run(['git','-C',str(tree),'-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','fixture'],check=True,capture_output=True)
  canon=self.r/'opt/iskra/workspace/ot-mihalycha/postavka-03-09/summa-predmeta';canon.parent.mkdir(parents=True);canon.write_text('#!/usr/bin/python3\nimport hashlib,sys\nfrom pathlib import Path\np=Path(sys.argv[-1]);h=hashlib.md5()\nfor f in sorted(p.rglob("*")):\n if f.is_file():h.update(f.read_bytes())\nprint(h.hexdigest())\n');canon.chmod(0o755)
  freeze=self.r/'opt/iskra/workspace/dorabotki/zamorozka-predmeta';freeze.parent.mkdir(parents=True);freeze.write_text('#!/bin/sh\nexit 0\n');freeze.chmod(0o755)
  for name,body in [('dvojniki','exit 0'),('npm','printf \'[{"files":[{"path":"package.json"},{"path":"x"}]}]\\n\'')]:
   f=self.r/'usr-local'/name;f.write_text('#!/bin/sh\n'+body+'\n');f.chmod(0o755)
  self.copy=self.r/'nashi';self.copy.write_text(s);self.copy.chmod(0o755);shutil.copy2(HELPER,self.r/'helper');(self.r/'helper').chmod(0o755)
  self.env={**os.environ,'PATH':str(self.r/'usr-local')+':/usr/bin:/bin','MANIFEST':str(self.manifest),'PROCEDURY_Q':str(self.r/'q'),'PP_ZHURNAL':str(self.r/'none'),'PARY_BOJ':str(self.r/'pairs/list'),'PARY_DORABOTKI':str(self.r/'dor'),'PARY_BOJ_KORNI':str(self.r/'host-copies'),'NASHI_C_REESTR':str(self.registry),'HOZYAIN_KORNI':str(self.r/'data'),'MO_STATE_DIR':str(self.r/'windows'),'MONTAZH_OKNO_BIN':str(self.r/'helper'),'DROPIN_KAT':str(self.r/'dropins')}
  (self.r/'pairs/list').write_text(str(self.r/'dor/paired')+'|'+str(self.r/'host-copies/paired')+'\n')
  # Program/fixture trees under iskra; authoritative window directory and file stay root-owned.
  for p in [self.r,*self.r.rglob('*')]:
   if not str(p).startswith(str(self.r/'windows')):os.chown(p,self.pw.pw_uid,self.pw.pw_gid)
  ns=self.r/'namespace.py';ns.write_text('''import json,subprocess,sys
from pathlib import Path
r=Path(sys.argv[1])
for a,b in [('opt','/opt'),('usr-local','/usr/local'),('registry-dir','/etc/agent-registry'),('root-unit-dir','/etc/systemd/system')]:subprocess.run(['mount','--bind',str(r/a),b],check=True)
e=json.loads((r/'env.json').read_text());q=subprocess.run(['sudo','-n','-u','iskra','env',*[k+'='+v for k,v in e.items()],'bash',str(r/'nashi'),*sys.argv[2:]],capture_output=True,text=True)
print(q.stdout,end='');print(q.stderr,end='',file=sys.stderr);sys.exit(q.returncode)
''')
  self.ns=ns;self.ident='3'*32
 def tearDown(self):self.tmp.cleanup()
 def invoke(self,*args):
  (self.r/'env.json').write_text(json.dumps(self.env));return subprocess.run(['unshare','-m','--propagation','private','python3','-B',str(self.ns),str(self.r),*args],capture_output=True,text=True,timeout=15)
 def seed(self):
  p=self.invoke('--save','--izmenenij','0');self.assertEqual(p.returncode,0,p.stdout+p.stderr);p=self.invoke('--check');self.assertEqual(p.returncode,0,p.stdout+p.stderr)
 def window(self):
  now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);data=dict(schema=1,id=self.ident,task='B-N-2025',actor='fixture',boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),opened_ns=now,deadline_ns=now+1800*10**9,expires_utc='fixture',phase='open',subjects=['file:'+str(self.live),'file:'+str(self.manifest)],checks=[dict(kind='file',path=str(self.live),sha256=hashlib.sha256(b'new').hexdigest()),dict(kind='file',path=str(self.manifest),sha256=hashlib.sha256(self.manifest.read_bytes().replace(hashlib.md5(b'old').hexdigest().encode(),hashlib.md5(b'new').hexdigest().encode(),1)).hexdigest())]);p=self.r/'windows'/(self.ident+'.json');p.write_text(json.dumps(data));p.chmod(0o644);return p
 def test_healthy_manual_red_auto_deferred_restore(self):
  self.seed();self.live.write_text('new');self.window();p=self.invoke('--check');self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertNotIn('ОТЛОЖЕНО',p.stdout)
  p=self.invoke('--check','--avto-montazh');self.assertEqual(p.returncode,4,p.stdout+p.stderr);self.assertIn(self.ident,p.stdout);self.assertNotIn('СХОДИТСЯ:',p.stdout)
  self.live.write_text('old');p=self.invoke('--check','--avto-montazh');self.assertEqual(p.returncode,0,p.stdout+p.stderr)
 def test_outside_error_and_invalid_window_remain_strict(self):
  self.seed();self.live.write_text('new');f=self.window();self.outside.write_text('new');p=self.invoke('--check','--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn(str(self.outside),p.stdout)
  self.outside.write_text('old');f.chmod(0o666);p=self.invoke('--check','--avto-montazh');self.assertEqual(p.returncode,1,p.stdout+p.stderr)
 def test_second_closed_generation_is_named_blind_for_file_and_manifest(self):
  self.seed();self.live.write_text('new');self.window();self.env['NASHI_MO_REREAD']='1'
  real=self.r/'helper';wrapper=self.r/'helper-six'
  for subject in (self.live,self.manifest):
   with self.subTest(subject=str(subject)):
    wrapper.write_text('#!/usr/bin/python3\nimport os,sys\n'
      +'if sys.argv[1]=="otlozheno" and sys.argv[-1]=='+repr('file:'+str(subject))+':sys.exit(6)\n'
      +'os.execv('+repr(str(real))+',['+repr(str(real))+']+sys.argv[1:])\n');wrapper.chmod(0o755)
    self.env['MONTAZH_OKNO_BIN']=str(wrapper)
    p=self.invoke('--check','--avto-montazh');self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertIn('СЛЕПОТА: повторная смена',p.stdout+p.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
