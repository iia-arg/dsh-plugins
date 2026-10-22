"""ROOT-STENDY: real gate planner + walker, real iskra/root IDs; private package only.
Run: sudo -n python3 -B test/test_root_stendy.py. No production services/config
are changed. Only --collect scopes/transient gate service are created; no OOM.
"""
import contextlib,hashlib,json,os,pwd,re,shutil,signal,subprocess,tempfile,time,unittest,uuid
from pathlib import Path
PKG=Path(__file__).resolve().parents[1]
WALKER=Path(os.environ.get('ROOT_STENDY_WALKER',PKG/'dorabotki/vse-stendy-boevye.sh'))
GATE=PKG.parent/'dsh-montazh/bin/vypusk-tegom'
TARGET='/opt/agent-plugins/node_modules/dsh-pamyat-storozha/test/stend-preset-lifecycle.mjs'
LIFECYCLE=Path('/opt/agent-plugins/node_modules/dsh-pamyat-storozha')
EVIDENCE=Path(os.environ['ROOT_STENDY_EVIDENCE']) if 'ROOT_STENDY_EVIDENCE' in os.environ else None

def function(source,name):
 start=source.index(name+'() {');return source[start:source.index('\n  PLAN_VYVOD=',start)]

def planner(walker,exact='',tail=''):
 code='OBHODCHIK=$1\n'+function(GATE.read_text(),'pometka')+'\npometka "$2" "$3"\n'
 return subprocess.run(['bash','-c',code,'_',str(walker),exact,tail],capture_output=True,text=True,check=True).stdout.strip()

def run_bounded(args,timeout=60):
 process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 try:
  out,err=process.communicate(timeout=timeout)
 except subprocess.TimeoutExpired:
  # A live unreaped child owns this PID/session; no reused PID or foreign process group.
  if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
  try:process.communicate(timeout=2)
  except subprocess.TimeoutExpired:
   if process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
   process.communicate(timeout=2)
  raise
 return subprocess.CompletedProcess(args,process.returncode,out,err)

def cleanup_units(gate_unit,progress_dirs):
 if not re.fullmatch(r'root-stendy-(?:timeout-)?[0-9a-f]{32}\.service',gate_unit):raise RuntimeError('foreign gate unit refused')
 deadline=time.monotonic()+10
 units={gate_unit}
 for folder in progress_dirs:
  owner=folder/'scope-owner';scopes=folder/'scopes'
  if not owner.exists() and not scopes.exists():continue
  identity=owner.read_text().strip()
  if not re.fullmatch(r'[0-9]+-[0-9a-f]{16}',identity):raise RuntimeError('invalid private scope owner')
  for unit in scopes.read_text().splitlines():
   if not re.fullmatch(re.escape('obhod-stend-'+identity+'-')+r'[0-9]+\.scope',unit):raise RuntimeError('foreign scope name refused')
   units.add(unit)
 if len(units)>1+3*len(progress_dirs):raise RuntimeError('scope list exceeds two fixture stands plus canary per run')
 def remaining():
  budget=deadline-time.monotonic()
  if budget<=0:raise RuntimeError('private transient cleanup exceeded 10 seconds')
  return min(3,budget)
 def alive(unit):
  r=subprocess.run(['/usr/bin/systemctl','show',unit,'-p','LoadState','-p','ActiveState'],capture_output=True,text=True,timeout=remaining())
  d=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
  if 'LoadState' not in d or 'ActiveState' not in d:raise RuntimeError('unit state unreadable: '+unit)
  return d['LoadState']!='not-found' and d['ActiveState']!='inactive'
 active=[unit for unit in sorted(units) if alive(unit)]
 if active:subprocess.run(['/usr/bin/systemctl','stop','--no-block','--',*active],check=True,capture_output=True,text=True,timeout=remaining())
 while any(alive(unit) for unit in sorted(units)):
  remaining();time.sleep(.05)
 print('CLEANUP',json.dumps({'units':sorted(units),'all_inactive_or_missing':True}),flush=True)

class RootStands(unittest.TestCase):
 def test_foreign_cleanup_name_is_refused(self):
  with self.assertRaisesRegex(RuntimeError,'foreign gate unit'):cleanup_units('ssh.service',[])

 def test_timeout_cleanup_and_recovery(self):
  self.assertEqual(os.geteuid(),0,'manual root fixture required');unit='root-stendy-timeout-'+uuid.uuid4().hex+'.service'
  try:
   subprocess.run(['/usr/bin/systemd-run','-q','--collect','--unit='+unit,'-p','RuntimeMaxSec=15','/usr/bin/sleep','10'],check=True,capture_output=True,text=True,timeout=5)
   with self.assertRaises(subprocess.TimeoutExpired):run_bounded(['/usr/bin/sleep','2'],timeout=.1)
   cleanup_units(unit,[])
   self.assertEqual(run_bounded(['/usr/bin/true'],timeout=1).returncode,0)
  finally:cleanup_units(unit,[])

 def test_registered_root_route_and_actual_uid(self):
  self.assertEqual(os.geteuid(),0,'manual root fixture required')
  route=planner(WALKER,tail='/dsh-pamyat-storozha/test/stend-preset-lifecycle.mjs')
  self.assertEqual(route,'@root /opt/iskra/app','registered route must be visible to the actual gate planner')
  self.assertEqual(planner(WALKER,exact=TARGET),route)
  self.assertEqual(planner(WALKER,exact='/not-registered/stend-neighbor.mjs'),'','source comments never authorize root')
  with tempfile.TemporaryDirectory(prefix='root-stendy-',dir='/var/tmp') as td, contextlib.ExitStack() as cleanup:
   gate_unit='root-stendy-'+uuid.uuid4().hex+'.service';progress_dirs=[];cleanup.callback(cleanup_units,gate_unit,progress_dirs)
   r=Path(td);r.chmod(0o755);user=pwd.getpwnam('iskra');work=r/'work';work.mkdir();os.chown(work,user.pw_uid,user.pw_gid);work.chmod(0o755)
   pkg=work/'packages/dsh-pamyat-storozha';(pkg/'test').mkdir(parents=True);(pkg/'bin').mkdir()
   copied_hashes=[]
   for rel in ['test/stend-preset-lifecycle.mjs','test/test_preset_lifecycle.py','bin/session-agent-preset-watch']:
    shutil.copyfile(LIFECYCLE/rel,pkg/rel);os.chmod(pkg/rel,0o644);self.assertEqual((LIFECYCLE/rel).read_bytes(),(pkg/rel).read_bytes());copied_hashes.append({'path':rel,'sha256':hashlib.sha256((pkg/rel).read_bytes()).hexdigest()})
   (pkg/'package.json').write_text(json.dumps({'name':'dsh-pamyat-storozha','version':'3.1.6','private':True,'files':['bin','test']}))
   (pkg/'CHANGELOG.md').write_text('# Fixture\n\n## 3.1.6 — private root-route probe\n')
   witness=work/'neighbor.jsonl';neighbor=pkg/'test/stend-neighbor.mjs'
   neighbor.write_text('// @root: deliberate comment without authorization\nimport fs from "node:fs";fs.appendFileSync('+json.dumps(str(witness))+',JSON.stringify({uid:process.getuid(),groups:process.getgroups()})+"\\n");console.log("PASS plain neighbor");\n')
   for path in [pkg,*pkg.rglob('*')]:
    os.chown(path,user.pw_uid,user.pw_gid);path.chmod(0o755 if path.is_dir() else 0o644)
   obh=work/'walker';obh.mkdir();source=WALKER.read_bytes();(obh/'vse-stendy-boevye.sh').write_bytes(source);(obh/'vse-stendy-boevye.sh').chmod(0o755)
   shutil.copyfile(PKG/'dorabotki/skaner-zhivoj-mashiny.py',obh/'skaner-zhivoj-mashiny.py')
   shim=work/'shim';shim.mkdir();systemctl=shim/'systemctl'
   systemctl.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif a and a[0]=="show" and "vse-stendy-boevye.service" in a and "Environment" in a: print("DSH_TEST_APP=/opt/iskra/app PATH='+str(shim)+':/usr/local/bin:/usr/bin:/bin");sys.exit(0)\nif a and a[0]=="show" and "varvara.service" in a: sys.exit(0)\nos.execv("/usr/bin/systemctl",["systemctl",*a])\n');systemctl.chmod(0o755)
   sudo=shim/'sudo';sudo.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif len(a)>2 and a[:2]==["-n","systemd-run"] and "--wait" in a and "--scope" not in a: a=["-n","/usr/bin/systemd-run","--unit=' + gate_unit + '",*a[2:]]\nos.execv("/usr/bin/sudo",["sudo",*a])\n');sudo.chmod(0o755)
   exceptions=work/'exceptions.yaml';exceptions.write_text('exceptions: []\n');perechen=work/'stands.txt';target=pkg/'test/stend-preset-lifecycle.mjs';perechen.write_text(str(target)+'\n'+str(neighbor)+'\n')
   environment={'PATH':str(shim)+':/usr/local/bin:/usr/bin:/bin','HOME':'/opt/iskra','DSH_TEST_APP':'/opt/iskra/app','SREDA_STENDOV':'','ISKLYUCHENIYA_STENDOV':str(exceptions),'PERECHEN_STENDOV':str(perechen),'PAKET_IMYA':'dsh-pamyat-storozha'}
   logs=[]
   copied=obh/'vse-stendy-boevye.sh';line=(TARGET+' @root /opt/iskra/app\n').encode();self.assertEqual(source.count(line),1)
   for phase in ['healthy','corrupt','return']:
    if phase=='corrupt':
     copied.write_bytes(source.replace(line,b'',1));before=hashlib.sha256(source).hexdigest();after=hashlib.sha256(copied.read_bytes()).hexdigest();self.assertNotEqual(before,after)
     grep=subprocess.run(['grep','-cF',line.decode().rstrip(),str(copied)],capture_output=True,text=True);self.assertEqual(grep.returncode,1);self.assertEqual(grep.stdout.strip(),'0')
     print('MUTATION',json.dumps({'replacements':1,'before_sha256':before,'after_sha256':after,'fixed_count':0}),flush=True)
    if phase=='return':
     copied.write_bytes(source);self.assertEqual(copied.read_bytes(),source);grep=subprocess.run(['grep','-cF',line.decode().rstrip(),str(copied)],capture_output=True,text=True);self.assertEqual(grep.stdout.strip(),'1')
     print('RETURN',json.dumps({'sha256':hashlib.sha256(copied.read_bytes()).hexdigest(),'fixed_count':1}),flush=True)
    selected=planner(copied,tail='/dsh-pamyat-storozha/test/stend-preset-lifecycle.mjs')
    self.assertEqual(selected,'' if phase=='corrupt' else route)
    if witness.exists():witness.unlink()
    progress=work/('progress-'+phase);progress.mkdir();os.chown(progress,user.pw_uid,user.pw_gid);progress_dirs.append(progress)
    env=dict(environment,VSE_STENDY_PROGRESS_FILE=str(progress/'current.json'),OBLAST_STENDOV=str(pkg)+'/'+('\n'+str(target)+' '+selected if selected else ''))
    cmd=['sudo','-n','-u','iskra','env','-i',*[k+'='+v for k,v in env.items()],'bash',str(obh/'vse-stendy-boevye.sh')]
    result=run_bounded(cmd);output=result.stdout+result.stderr
    if EVIDENCE:EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/(phase+'.log')).write_text(output)
    print('PHASE',phase,'exit',result.returncode,flush=True)
    expected=0 if selected else 1;self.assertEqual(result.returncode,expected,output)
    fact='STEND-PROGNAN: '+str(target)+'\t'+('root\t0' if selected else '-\t2');self.assertIn(fact,output);self.assertEqual(output.count('STEND-PROGNAN: '+str(target)+'\t'),1,output)
    self.assertIn('ПОКРЫТИЕ: прошло 2 из 2 объявленных',output)
    actual=[json.loads(line) for line in witness.read_text().splitlines()];self.assertEqual(len(actual),1);self.assertEqual(actual[0]['uid'],user.pw_uid)
    if selected:self.assertNotIn('требует root',output)
    else:self.assertIn('требует root',output)
    logs.append({'phase':phase,'exit':result.returncode,'root_fact':fact,'neighbor_uid':actual[0]['uid']})
   # Full gate, private derevo registry/journal/cache, no STENDY_INACHE and no tag creation.
   home=work/'home';home.mkdir();os.chown(home,user.pw_uid,user.pw_gid)
   journal=r/'gate-journal';journal.mkdir(mode=0o755)
   mirror=r/'mirror-watch';shutil.copyfile(pkg/'bin/session-agent-preset-watch',mirror)
   registry=work/'copies.json';registry.write_text(json.dumps({'plugins':[],'services':[{'id':'fixture-lifecycle','derevo':{'subdir':'packages/dsh-pamyat-storozha','files':[{'remote':'bin/session-agent-preset-watch','local':str(mirror)}]}}]}))
   progress=work/'progress-gate';progress.mkdir();os.chown(progress,user.pw_uid,user.pw_gid);progress_dirs.append(progress)
   gate_env=dict(environment,VSE_STENDY_PROGRESS_FILE=str(progress/'current.json'),HOME=str(home),VYPUSK_REESTR=str(registry),VYPUSK_ZHURNAL_DIR=str(journal),OBHODCHIK=str(copied),VYPUSK_OBH_PREDEL_SEK='30',npm_config_cache=str(work/'npm-cache'))
   gate_copy=work/'vypusk-tegom';gate_copy.write_bytes(GATE.read_bytes());gate_copy.chmod(0o755);self.assertEqual(gate_copy.read_bytes(),GATE.read_bytes())
   cmd=['sudo','-n','-u','iskra','env','-i',*[k+'='+v for k,v in gate_env.items()],str(gate_copy),str(pkg)]
   gate=run_bounded(cmd);output=gate.stdout+gate.stderr
   if EVIDENCE:(EVIDENCE/'gate.log').write_text(output)
   self.assertEqual(gate.returncode,0,output);self.assertIn('можно ставить ЛОКАЛЬНЫЙ тег',output);self.assertNotIn('обход объявлен',output)
   self.assertIn('User=iskra',output);self.assertIn('stend-preset-lifecycle.mjs',output);self.assertIn('@root /opt/iskra/app',output)
   actual=[json.loads(line) for line in witness.read_text().splitlines()];self.assertEqual(len(actual),2);self.assertTrue(all(row['uid']==user.pw_uid for row in actual))
   logs.append({'phase':'full-gate','exit':gate.returncode,'scope':'private derevo registry; only declared watcher bytes; root route and ordinary neighbor'})
   if EVIDENCE:(EVIDENCE/'RESULTS.json').write_text(json.dumps({'at':time.time(),'lifecycle_copies':copied_hashes,'walker_sha256':hashlib.sha256(source).hexdigest(),'gate_sha256':hashlib.sha256(GATE.read_bytes()).hexdigest(),'results':logs},indent=2)+'\n')

if __name__=='__main__':unittest.main(verbosity=2)
