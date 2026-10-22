"""Manual root test: full installed vypusk-tegom, private git/DEREVO/journal.
AP_GATE_EVIDENCE=fresh dir AP_STEND_SOURCE=accepted AP package; no live registry/tag.
Set AP_GATE_BASELINE=1 to prove rejection on c73 before the package-selector fix.
"""
import hashlib,json,os,pwd,shutil,subprocess,tempfile,time,unittest,uuid
from pathlib import Path
from test_root_stendy import run_bounded,cleanup_units
PKG=Path(__file__).resolve().parents[1]
WALKER=PKG/'dorabotki/vse-stendy-boevye.sh'
GATE=PKG.parent/'dsh-montazh/bin/vypusk-tegom'
SOURCE=Path(os.environ['AP_STEND_SOURCE']).resolve()
OUT=Path(os.environ['AP_GATE_EVIDENCE']).resolve()
BASELINE=os.environ.get('AP_GATE_BASELINE')=='1'
BASE_SHA='c73e611e3415808ef7c82927fb3d796ed781d1db'
MARKER='# AP-STEND-V-OBHOD: адресный файл определяет пакет по родительскому package.json.'

class AutopilotGate(unittest.TestCase):
 PHASES = ['healthy','corrupt','return']
 def test_full_private_derevo_root_wrapper_and_recovery(self):
  self.assertEqual(os.geteuid(),0,'manual root fixture')
  self.assertTrue((SOURCE/'test/stend-dsh-autopilot.sh').is_file())
  OUT.mkdir(parents=True,exist_ok=True);self.assertFalse((OUT/'RESULTS.json').exists())
  user=pwd.getpwnam('iskra');progress_dirs=[];unit='root-stendy-'+uuid.uuid4().hex+'.service'
  # Full gate launches a host-manager service, so /tmp must be shared with PID1.
  # Payload is only the reviewed AP stand; it already uses disposable installer/NSS fixtures.
  with tempfile.TemporaryDirectory(prefix='ap-package-gate-',dir='/var/tmp') as td:
   root=Path(td);root.chmod(0o755);work=root/'work';work.mkdir();os.chown(work,user.pw_uid,user.pw_gid)
   tree=work/'tree';package=tree/'packages/dsh-autopilot';package.parent.mkdir(parents=True);shutil.copytree(SOURCE,package,ignore=shutil.ignore_patterns('__pycache__'))
   for f in [tree,*tree.rglob('*')]:
    if not f.is_symlink():os.chown(f,user.pw_uid,user.pw_gid)
   home=work/'home';home.mkdir();os.chown(home,user.pw_uid,user.pw_gid)
   shim=work/'shim';shim.mkdir();target=package/'test/stend-dsh-autopilot.sh'
   raw=work/'stand.raw';raw.touch();raw.chmod(0o666)
   path=str(shim)+':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
   ctl=shim/'systemctl';ctl.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif a and a[0]=="show" and "vse-stendy-boevye.service" in a and "Environment" in a:print('+repr('DSH_TEST_APP=/opt/iskra/app PATH='+path)+');sys.exit(0)\nif a and a[0]=="show" and "varvara.service" in a:sys.exit(0)\nos.execv("/usr/bin/systemctl",["systemctl",*a])\n');ctl.chmod(0o755)
   sudo=shim/'sudo';sudo.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif len(a)>2 and a[:2]==["-n","systemd-run"] and "--wait" in a and "--scope" not in a:a=["-n","/usr/bin/systemd-run","--unit='+unit+'",*a[2:]]\nos.execv("/usr/bin/sudo",["sudo",*a])\n');sudo.chmod(0o755)
   bash=shim/'bash';bash.write_text('#!/usr/bin/python3\nimport os,sys,json,subprocess\na=sys.argv[1:]\nif a==['+repr(str(target))+']:\n with open('+repr(str(raw))+',"ab",buffering=0) as f:\n  f.write(("AP-UID "+json.dumps({"uid":os.geteuid()})+"\\n").encode())\n  p=subprocess.Popen(["/usr/bin/bash",*a],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)\n  for line in p.stdout:f.write(line);sys.stdout.buffer.write(line);sys.stdout.buffer.flush()\n  sys.exit(p.wait())\nos.execv("/usr/bin/bash",["bash",*a])\n');bash.chmod(0o755)
   gate=work/'vypusk-tegom';gate.write_bytes(GATE.read_bytes());gate.chmod(0o755)
   self.assertEqual(gate.read_bytes(),Path('/usr/local/bin/vypusk-tegom').read_bytes(),'test the installed gate bytes')
   obh=work/'walker';shutil.copytree(PKG/'dorabotki',obh);walker=obh/'vse-stendy-boevye.sh';good=walker.read_bytes()
   old=subprocess.check_output(['git','-c','safe.directory='+str(PKG.parents[1]),'-C',str(PKG.parents[1]),'show',BASE_SHA+':packages/dsh-obhod-stendov/dorabotki/vse-stendy-boevye.sh'])
   mirror=work/'machine';shutil.copytree(package,mirror)
   # Model only an actual declared DEREVO place; all package bytes/stands stay real.
   registry=work/'registry.json';registry.write_text(json.dumps({'plugins':[],'services':[{'id':'fixture-autopilot','derevo':{'subdir':'packages/dsh-autopilot','files':[{'remote':'README.md','local':str(mirror/'README.md')}]}}]}))
   journal=work/'journal';journal.mkdir();exceptions=work/'exceptions.yaml';exceptions.write_text('exceptions: []\n')
   def git(*args):
    return subprocess.check_output(['/usr/bin/sudo','-n','-u','iskra','env','-i','HOME='+str(home),'PATH='+path,'git','-C',str(tree),*args],stderr=subprocess.STDOUT,text=True)
   git('init','-q','--initial-branch=master');git('config','user.name','Gamma fixture');git('config','user.email','gamma@sadik');git('add','.');git('commit','-qm','Private accepted AP fixture')
   initial_head=git('rev-parse','HEAD').strip();logs=[]
   try:
    for phase in (['baseline'] if BASELINE else self.PHASES):
     walker.write_bytes(old if phase in ['baseline','corrupt'] else good)
     checksum=hashlib.sha256(walker.read_bytes()).hexdigest()
     hits=subprocess.run(['grep','-cF',MARKER,str(walker)],capture_output=True,text=True)
     count=int(hits.stdout)
     if phase=='corrupt':self.assertNotEqual(good,old);self.assertEqual(count,0)
     if phase in ['healthy','return']:self.assertEqual(count,1);self.assertEqual(walker.read_bytes(),good)
     raw.write_text('');progress=work/('progress-'+phase);progress.mkdir();os.chown(progress,user.pw_uid,user.pw_gid);progress_dirs.append(progress)
     env={'PATH':path,'HOME':str(home),'DSH_TEST_APP':'/opt/iskra/app','SREDA_STENDOV':str(target)+' PATH='+path,'PREDEL_STENDOV':str(target)+' 600','ISKLYUCHENIYA_STENDOV':str(exceptions),'VSE_STENDY_PROGRESS_FILE':str(progress/'current.json'),'VYPUSK_REESTR':str(registry),'VYPUSK_ZHURNAL_DIR':str(journal),'OBHODCHIK':str(walker),'VYPUSK_OBH_PREDEL_SEK':'700','npm_config_cache':str(work/'npm-cache')}
     cmd=['sudo','-n','-u','iskra','env','-i',*[k+'='+v for k,v in env.items()],str(gate),str(package)]
     start=time.time();r=run_bounded(cmd,timeout=740);out=r.stdout+r.stderr
     (OUT/(phase+'.log')).write_text(out);(OUT/(phase+'.stand.log')).write_text(raw.read_text())
     row={'phase':phase,'rc':r.returncode,'seconds':time.time()-start,'command':cmd,'walker_sha256':checksum,'good_walker_sha256':hashlib.sha256(good).hexdigest(),'old_walker_sha256':hashlib.sha256(old).hexdigest(),'marker_fixed_count':count,'stand_uid':json.loads(raw.read_text().splitlines()[0].removeprefix('AP-UID '))['uid'] if raw.stat().st_size else None}
     logs.append(row);(OUT/'PARTIAL.json').write_text(json.dumps(logs,indent=2)+'\n');print('GATE',phase,r.returncode,row['stand_uid'],flush=True)
     if phase in ['baseline','corrupt']:
      self.assertEqual(r.returncode,2,out[-18000:]);self.assertIn('пакета «dsh-autopilot» нет',out);self.assertEqual(raw.read_text(),'');self.assertEqual(git('tag','--list').strip(),'')
     else:
      self.assertEqual(r.returncode,0,out[-18000:]);self.assertEqual(row['stand_uid'],0);self.assertIn('покрытие: 8 из 8',raw.read_text());self.assertIn('ПОКРЫТИЕ: прошло 1 из 1 объявленных',out);self.assertIn('можно ставить ЛОКАЛЬНЫЙ тег',out);self.assertIn('по строке обходчика: @root /opt/iskra/app',out);self.assertIn('User=iskra',out)
     cleanup_units(unit,progress_dirs)
    if not BASELINE:
     scope='derevo=fixture-autopilot; files=1; registry_sha256='+hashlib.sha256(registry.read_bytes()).hexdigest()
     self.assertIn('АННОТАЦИЯ ОБЛАСТИ: '+scope,out);self.assertNotIn('ПРОБНЫЙ ПРОГОН',out)
     git('tag','-a','dsh-autopilot-v0.1.1','-m','Private fixture only; '+scope)
     self.assertIn(scope,git('for-each-ref','--format=%(contents)','refs/tags/dsh-autopilot-v0.1.1'))
     self.assertEqual(git('rev-parse','dsh-autopilot-v0.1.1^{}').strip(),initial_head)
     (OUT/'PRIVATE-TAG.json').write_text(json.dumps({'tag':'dsh-autopilot-v0.1.1','commit':initial_head,'object_type':git('cat-file','-t','dsh-autopilot-v0.1.1').strip(),'scope':'private temporary git repository; no remote, no push','annotation_scope':scope},indent=2)+'\n')
    self.assertEqual(git('status','--porcelain'),'')
    (OUT/'RESULTS.json').write_text(json.dumps({'results':logs,'gate_sha256':hashlib.sha256(gate.read_bytes()).hexdigest(),'ap_wrapper_sha256':hashlib.sha256((SOURCE/'test/stend-dsh-autopilot.sh').read_bytes()).hexdigest(),'scope_cleanup':True,'private_derevo':'README.md one declared place; all actual AP stand bytes executed'},indent=2)+'\n')
   finally:cleanup_units(unit,progress_dirs)

class TagScopeOnly(AutopilotGate):
 PHASES = ['return']

if __name__=='__main__':unittest.main(defaultTest='AutopilotGate',verbosity=2)
