"""Manual root regression: actual walker and AP0.1.1 stand in a private mount/net namespace.
Run with AP_STEND_SOURCE=<accepted df251 package> AP_ROUTE_EVIDENCE=<fresh dir>
sudo -n python3 -B test/test_autopilot_route.py. Only unique --collect scopes.
"""
import hashlib,json,os,pwd,shutil,subprocess,sys,tempfile,time,unittest,uuid
from pathlib import Path
from test_root_stendy import planner,run_bounded,cleanup_units
PKG=Path(__file__).resolve().parents[1]
WALKER=PKG/'dorabotki/vse-stendy-boevye.sh'
AP='/opt/iskra/workspace/dsh-plugins/packages/dsh-autopilot'
TARGET=AP+'/test/stend-dsh-autopilot.sh'
SOURCE=Path(os.environ.get('AP_STEND_SOURCE',AP)).resolve()
OUT=Path(os.environ['AP_ROUTE_EVIDENCE']).resolve()

def enter_namespace():
 root=Path(sys.argv[2]).resolve();expected=sys.argv[3]
 assert os.geteuid()==0 and root.parent==OUT and root.name.startswith('fixture-')
 assert os.readlink('/proc/self/ns/mnt')!=expected, 'requires separate mount namespace'
 def mount(*args):subprocess.run(['/usr/bin/mount',*args],check=True,capture_output=True,text=True)
 mount('--make-rprivate','/')
 subprocess.run(['/usr/sbin/ip','link','set','lo','up'],check=True,capture_output=True,text=True)
 mount('--rbind','/','/')
 mount('--bind',str(root/'tmp'),'/tmp')
 mount('--bind',str(root/'var-tmp'),'/var/tmp')
 local='/var/tmp/ap-obhod';Path(local).mkdir(exist_ok=True);assert Path(local).is_dir() and not Path(local).is_symlink()
 mount('--bind',str(root/'work'),local)
 mount('-t','tmpfs','-o','mode=755','tmpfs','/opt/iskra/workspace/dsh-plugins/packages')
 Path(AP).mkdir();mount('--bind',local+'/ap',AP);mount('-o','remount,bind,ro',AP)
 mount('-o','remount,bind,ro','/')
 # Confirm read-only host source without changing a byte.
 try:
  fd=os.open(str(WALKER),os.O_WRONLY);os.close(fd)
 except OSError as e:
  import errno
  assert e.errno==errno.EROFS,e
 else:raise RuntimeError('host source is writable in fixture')
 print('NAMESPACE host-root-ro; mount distinct; no_new_privs='+next(x.split(':')[1].strip() for x in Path('/proc/self/status').read_text().splitlines() if x.startswith('NoNewPrivs:')),flush=True)
 os.execvp(sys.argv[4],sys.argv[4:])

if len(sys.argv)>1 and sys.argv[1]=='--namespace':enter_namespace()

class AutopilotRoute(unittest.TestCase):
 PHASES = ['healthy','uid_corrupt','uid_return','limit_corrupt','limit_return','file_absent']
 NIGHTLY = False
 def test_actual_stand_uid_budget_mutations_and_recovery(self):
  self.assertEqual(os.geteuid(),0,'manual root fixture required')
  self.assertTrue((SOURCE/'test/stend-dsh-autopilot.sh').is_file())
  OUT.mkdir(parents=True,exist_ok=True);self.assertFalse((OUT/'RESULTS.json').exists(),'fresh output required')
  uid=pwd.getpwnam('iskra').pw_uid;gid=pwd.getpwnam('iskra').pw_gid
  # Host files remain read-only; private writable roots live under this workdir.
  with tempfile.TemporaryDirectory(prefix='fixture-',dir=OUT) as td:
   root=Path(td);root.chmod(0o755)
   for name in ['work','tmp','var-tmp']:(root/name).mkdir(mode=0o777)
   (root/'tmp').chmod(0o1777);(root/'var-tmp').chmod(0o1777)
   work=root/'work';work.chmod(0o755)
   local='/var/tmp/ap-obhod'
   package=work/'ap';shutil.copytree(SOURCE,package,ignore=shutil.ignore_patterns('__pycache__'))
   obh=work/'obh';shutil.copytree(PKG/'dorabotki',obh)
   copied=obh/'vse-stendy-boevye.sh';source=copied.read_bytes()
   actual=package/'test/stend-dsh-autopilot.sh'
   self.assertEqual(actual.read_bytes(),(SOURCE/'test/stend-dsh-autopilot.sh').read_bytes())
   copied_sha=hashlib.sha256(actual.read_bytes()).hexdigest()
   shim=work/'shim';shim.mkdir()
   shimctl=shim/'systemctl';shimctl.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif a and a[0]=="show" and "vse-stendy-boevye.service" in a and "Environment" in a: print("DSH_TEST_APP=/opt/iskra/app PATH='+local+ '/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");sys.exit(0)\nif a and a[0]=="show" and "varvara.service" in a:sys.exit(0)\nos.execv("/usr/bin/systemctl",["systemctl",*a])\n');shimctl.chmod(0o755)
   bashshim=shim/'bash';bashshim.write_text('#!/usr/bin/python3\nimport os,subprocess,sys,json\na=sys.argv[1:]\nif a==['+repr(TARGET)+']:\n with open("/var/tmp/ap-obhod/stand.raw","ab",buffering=0) as f:\n  f.write(("AP-UID "+json.dumps({"uid":os.geteuid()})+"\\n").encode())\n  p=subprocess.Popen(["/usr/bin/bash",*a],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)\n  for line in p.stdout:f.write(line);sys.stdout.buffer.write(line);sys.stdout.buffer.flush()\n  sys.exit(p.wait())\nos.execv("/usr/bin/bash",["bash",*a])\n');bashshim.chmod(0o755)
   neighbor=package/'test/stend-fixture-neighbor.mjs'
   neighbor.write_text('import fs from "node:fs";fs.appendFileSync("/var/tmp/ap-obhod/neighbor.jsonl",JSON.stringify({uid:process.getuid()})+"\\n");console.log("PASS ordinary neighbor");\n')
   (work/'neighbor.jsonl').touch();(work/'neighbor.jsonl').chmod(0o666)
   (work/'exceptions.yaml').write_text('exceptions: []\n')
   # Literal accepted path in the registration/list, not an invented temp-path limit.
   (work/'stands.txt').write_text(TARGET+'\n'+AP+'/test/stend-fixture-neighbor.mjs\n')
   line=(TARGET+' @root /opt/iskra/app\n').encode()
   limit_line=(TARGET+' 600').encode()
   self.assertEqual(source.count(line),1);self.assertEqual(source.count(limit_line),1)
   default_list=(PKG/'dorabotki/perechen-boevyh-stendov.txt').read_text()
   self.assertEqual(default_list.splitlines().count(TARGET),1)
   entries=[];progress_dirs=[];cleanup_id='root-stendy-'+uuid.uuid4().hex+'.service'
   def grep_count(needle):
    r=subprocess.run(['grep','-cF',needle,str(copied)],capture_output=True,text=True)
    self.assertIn(r.returncode,[0,1]);return int(r.stdout)
   try:
    for phase in self.PHASES:
     copied.write_bytes(source)
     if phase=='uid_corrupt':copied.write_bytes(source.replace(line,b'',1))
     if phase=='limit_corrupt':copied.write_bytes(source.replace(limit_line,(TARGET+' 1').encode(),1))
     changed=hashlib.sha256(copied.read_bytes()).hexdigest()
     bad=phase.endswith('corrupt')
     if bad:self.assertNotEqual(changed,hashlib.sha256(source).hexdigest())
     else:self.assertEqual(copied.read_bytes(),source)
     route=planner(copied,exact=TARGET)
     self.assertEqual(route,'' if phase=='uid_corrupt' else '@root /opt/iskra/app')
     self.assertEqual(grep_count(TARGET+' @root /opt/iskra/app'),0 if phase=='uid_corrupt' else 1)
     q=subprocess.run(['bash',str(copied),'--predel-stenda',TARGET],capture_output=True,text=True,check=True)
     limit=int(q.stdout);self.assertEqual(limit,1 if phase=='limit_corrupt' else 600)
     progress=work/('progress-'+phase);progress.mkdir();os.chown(progress,uid,gid);progress_dirs.append(progress)
     if phase in ['file_absent','nightly_file_absent']:actual.rename(actual.with_suffix('.hidden'))
     # A package catalog fallback demonstrates removal of the address-specific UID.
     env={'PATH':local+'/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/opt/iskra','DSH_TEST_APP':'/opt/iskra/app','SREDA_STENDOV':TARGET+' PATH='+local+'/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','ISKLYUCHENIYA_STENDOV':local+'/exceptions.yaml','PERECHEN_STENDOV':local+'/stands.txt','VSE_STENDY_PROGRESS_FILE':local+'/'+progress.name+'/current.json','OBLAST_STENDOV':AP+'/\n'+(TARGET+' '+route if route else '')}
     if not self.NIGHTLY and phase!='file_absent':env['PAKET_IMYA']='dsh-autopilot'
     if self.NIGHTLY:
      env['OBLAST_STENDOV']=TARGET+' '+route
      (work/'stands.txt').write_text(TARGET+'\n')
     cmd=['unshare','--mount','--net','--fork','python3','-B',str(Path(__file__).resolve()),'--namespace',str(root),os.readlink('/proc/self/ns/mnt'),'/usr/bin/sudo','-n','-u','iskra','env','-i',*[k+'='+v for k,v in env.items()],'bash',local+'/obh/vse-stendy-boevye.sh']
     (work/'neighbor.jsonl').write_text('')
     (work/'stand.raw').write_text('');(work/'stand.raw').chmod(0o666)
     start=time.time();result=run_bounded(cmd,timeout=650);output=result.stdout+result.stderr
     (OUT/(phase+'.log')).write_text(output)
     raw=(work/'stand.raw').read_text();(OUT/(phase+'.stand.log')).write_text(raw)
     neighbor_uids=[json.loads(x)['uid'] for x in (work/'neighbor.jsonl').read_text().splitlines()];self.assertEqual(neighbor_uids,[] if self.NIGHTLY else [uid])
     row={'phase':phase,'start':start,'seconds':time.time()-start,'rc':result.returncode,'route':route,'limit_seconds':limit,'walker_sha256':changed,'original_walker_sha256':hashlib.sha256(source).hexdigest(),'route_fixed_hits':grep_count(TARGET+' @root /opt/iskra/app'),'limit_fixed_hits':grep_count(TARGET+' 600'),'wrapper_sha256':copied_sha,'command':cmd,'neighbor_uids':neighbor_uids,'stand_uid':json.loads(raw.splitlines()[0].removeprefix('AP-UID '))['uid'] if raw else None}
     entries.append(row);(OUT/'PARTIAL.json').write_text(json.dumps(entries,indent=2)+'\n')
     print('PHASE',phase,'rc',result.returncode,'route',repr(route),'limit',limit,flush=True)
     if phase=='nightly_file_absent':
      self.assertEqual(result.returncode,2,output);self.assertIn('ни одного стенда не найдено',output);self.assertEqual(raw,'')
     elif phase in ['uid_corrupt','limit_corrupt','file_absent']:
      self.assertEqual(result.returncode,1,output[-12000:])
      if phase=='uid_corrupt':self.assertEqual(row['stand_uid'],uid);self.assertIn('нужен root',output);self.assertIn('STEND-PROGNAN: '+TARGET+'\t-\t2',output)
      if phase=='limit_corrupt':self.assertIn('STEND-PROGNAN: '+TARGET+'\troot\t124',output)
      if phase=='file_absent':self.assertIn('В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ: '+TARGET,output)
     else:
      self.assertEqual(result.returncode,0,output[-18000:]);
      if not self.NIGHTLY:self.assertIn('STEND-PROGNAN: '+TARGET+'\troot\t0',output)
      self.assertEqual(row['stand_uid'],0);self.assertIn('покрытие: 8 из 8',raw);self.assertIn('ПОКРЫТИЕ: прошло '+('1 из 1' if self.NIGHTLY else '2 из 2')+' объявленных',output)
     cleanup_units(cleanup_id,progress_dirs)
    (OUT/'RESULTS.json').write_text(json.dumps({'wrapper_source':str(SOURCE),'wrapper_sha256':copied_sha,'results':entries,'scope_cleanup':True},indent=2)+'\n')
   finally:cleanup_units(cleanup_id,progress_dirs)

class NightlyRoute(AutopilotRoute):
 PHASES = ['nightly_healthy','nightly_file_absent']
 NIGHTLY = True

if __name__=='__main__':unittest.main(defaultTest='AutopilotRoute',verbosity=2)
