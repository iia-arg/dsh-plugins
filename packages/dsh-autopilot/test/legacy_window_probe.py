"""Public legacy window on OWN physical copy+stend units. No production mutation."""
import grp,hashlib,importlib.util,json,os,pwd,shlex,shutil,subprocess,sys,tempfile,time,uuid,yaml
from pathlib import Path
assert len(sys.argv)==2 and not sys.argv[1].startswith('-'),'fixture accepts only PACKAGE path'
PACKAGE=Path(sys.argv[1]).resolve()
def sha(b):return hashlib.sha256(b).hexdigest()
def fixture_dir(path):
 # parents=True does not apply mode to intermediate fixture directories.
 if not path.parent.is_dir():fixture_dir(path.parent)
 path.mkdir(mode=0o755,exist_ok=True)
def call(args,**kw):
 q=subprocess.run(args,capture_output=True,text=True,timeout=90,**kw)
 return dict(rc=q.returncode,out=q.stdout,err=q.stderr)
def require(q):assert q['rc']==0,q

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
sys.path.insert(0,str(PACKAGE/'lib'));sys.path.insert(0,str(PACKAGE/'runtime'))
C=load('window_catalog_fixture',PACKAGE/'runtime/run_catalog.py')
# No catalogue014 registry/current supplies fixture authority. All retained code is SHA-pinned.
sys.path.insert(0,str(PACKAGE/'test'))
from _legacy_window_fixture import seed_layout,relocate_registry
master=pwd.getpwnam('master');top=Path(tempfile.mkdtemp(prefix='stend-ap-window-',dir='/var/lib'))
mode='catalogue'
root=top/'root';source=top/'package';units=[];children=[];results=[]
try:
 top.chmod(0o755);fixture_dir(root);shutil.copytree(PACKAGE,source,ignore=shutil.ignore_patterns('__pycache__'))
 manifest,contents,catalogue014=seed_layout(PACKAGE,root)
 current=catalogue014 if mode=='catalogue' else next(Path(p).name for p in manifest['managed'] if p.endswith('-a15-b7-c2'))
 target=next(Path(p).name for p in manifest['managed'] if p.endswith('-a13-b5-c2'))
 next(row for row in manifest['rows'] if row['path']=='/opt/autopilot/current')['target']='releases/'+current
 raw=(json.dumps(manifest,indent=2)+'\n').encode()
 mf0=Path('/usr/local/libexec/dsh-autopilot/layout.json')
 # A deliberately wrapped scalar exercises the original regression in every full run.
 original=('plugins:\n  - id: neighbour\n    note: untouched # KEEP_NEIGHBOUR\n  - id: dsh-autopilot\n    version: 0.1.14\n    installed_check: /usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/layout-check.py --manifest\n      '+str(mf0)+' --sha '+sha(raw)+'\n').encode()
 doc=yaml.safe_load(original);entry=doc['plugins'][1];argv=shlex.split(entry['installed_check'])
 for row in sorted(manifest['rows'],key=lambda row:len(Path(row['path']).parts)):
  p=root/row['path'].lstrip('/');fixture_dir(p.parent)
  if row['kind']=='dir':fixture_dir(p)
  elif row['kind']=='link':p.symlink_to(row['target'])
  else:
   content=contents[row['path']] if row['path'] in contents else Path(row['path']).read_bytes();assert sha(content)==row['sha256'],row['path'];p.write_bytes(content)
  os.lchown(p,row['uid'],row['gid'])
  if not p.is_symlink():p.chmod(row['mode'])
 reader=grp.getgrnam(manifest['public']['group'])
 for name,file_mode,uid,gid in [('srv',0o755,0,0),('srv/autopilot',0o755,0,0),('srv/autopilot/public',0o2751,0,reader.gr_gid),('srv/autopilot/public/master',0o2750,master.pw_uid,reader.gr_gid)]:
  path=root/name;fixture_dir(path);os.chown(path,uid,gid);path.chmod(file_mode)
 mf=root/mf0.relative_to('/');fixture_dir(mf.parent);mf.write_bytes(raw);mf.chmod(0o644)
 registry=root/'etc/agent-registry/plugins.yaml';fixture_dir(registry.parent)
 argv[3]=str(root/Path(argv[3]).relative_to('/'));argv[5]=str(mf);argv+=['--root',str(root)]
 relocated=relocate_registry(original,shlex.join(argv));registry.write_bytes(relocated);registry.chmod(0o644)
 relocationProof=dict(beforeSHA256=sha(original),afterSHA256=sha(relocated),decodedNeedleInRaw=original.count(entry['installed_check'].encode()),newCommandCount=relocated.count(shlex.join(argv).encode()),fieldCount=1)
 assert relocationProof['beforeSHA256']!=relocationProof['afterSHA256'] and relocationProof['newCommandCount']==1
 for args in [['git','init','-q'],['git','add','plugins.yaml'],['git','-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','accepted COPY base']]:require(call(args,cwd=registry.parent))
 home=root/'opt/master';fixture_dir(home);project=home/'project';fixture_dir(project);os.chown(project,master.pw_uid,master.pw_gid)
 public=top/'public';fixture_dir(public);public.chmod(0o2751);os.chown(public,0,master.pw_gid);agent=public/'master';fixture_dir(agent);os.chown(agent,master.pw_uid,master.pw_gid);agent.chmod(0o2750)
 hod=root/'fixture-systemctl';hod.write_text('#!/usr/bin/python3\nprint(0)\n');hod.chmod(0o755)
 logger=root/'fixture-logger';logger.write_text('#!/bin/sh\nexit 0\n');logger.chmod(0o755)
 scope=uuid.uuid4().hex
 for label in ('a','b'):
  name='stend-ap-rollback-fixture-'+scope+'-'+label+'.service';units.append(name)
  require(call(['systemd-run','--quiet','--unit='+name,'--property=User=master','--property=Type=exec','--property=RuntimeMaxSec=300','--property=KillMode=control-group','/usr/bin/sleep','280']))
 profile=dict(schemaVersion=1,scopeId=scope,units=units,processScope='fixture-cgroups',hod=str(hod),logger=str(logger))
 (root/'operator-window-fixture.json').write_text(json.dumps(profile));(root/'operator-window-fixture.json').chmod(0o600)
 scope_file=root/'inventory-scope.json';scope_file.write_text(json.dumps(dict(schemaVersion=1,roots=[str(top)],publicRoot=str(public))));scope_file.chmod(0o600)
 helper=source/'tools/ap-rollback-window.py'
 def rollback(dest,report=None):
  args=['python3','-I','-B',str(helper),'rollback',dest,'--root',str(root)]
  if report:args+=['--report',str(report),'--accepted-sha256',sha(report.read_bytes())]
  return args
 def scan():
  report=top/('report-'+uuid.uuid4().hex+'.json');report.write_text(json.dumps(C.scan_legacy(root))+'\n');return report
 def runtime(*args,rel=None):
  rel=rel or os.readlink(root/'opt/autopilot/current').split('/')[-1]
  # Exact immutable old entrypoint, private /opt/autopilot mapping, private project.
  wrapper='import os,subprocess,sys;e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));sys.exit(subprocess.run(sys.argv[1:],env=e).returncode)'
  if rel==catalogue014:
   return ['setpriv','--reuid='+str(master.pw_uid),'--regid='+str(master.pw_gid),'--clear-groups','/usr/bin/env','AUTOPILOT_USAGE_MAIL_SOCKET='+str(top/'no-registration-endpoint/post.sock'),'AUTOPILOT_PUBLIC_ROOT='+str(public),'AUTOPILOT_AGENT=master','python3','-B','-c',wrapper,'python3','-B',str(root/'opt/autopilot/releases'/rel/'skill/tools/ap.py'),'--no-serve',*args]
  return ['setpriv','--reuid='+str(master.pw_uid),'--regid='+str(master.pw_gid),'--clear-groups','python3','-B','-c',wrapper,'bwrap','--ro-bind','/','/','--ro-bind',str(root/'opt/autopilot'),'/opt/autopilot','--bind',str(home),str(home),'--bind',str(public),str(public),'--proc','/proc','--dev','/dev','--chdir',str(project),'--setenv','AUTOPILOT_PUBLIC_ROOT',str(public),'--setenv','AUTOPILOT_AGENT','master','python3','-B','/opt/autopilot/releases/'+rel+'/skill/tools/ap.py','--no-serve',*args]
 def execute_runtime(*args,rel=None):return call(runtime(*args,rel=rel),cwd=project)
 if mode=='catalogue':
  report=scan();C.bootstrap(root/'var/lib/dsh-autopilot',root,report,sha(report.read_bytes()))
 if mode=='catalogue':
  # Both guarded versions: exercise the genuine 0.1.14 -> 0.1.13 selector path too.
  old013=next(Path(p).name for p in manifest['managed'] if p.endswith('-release-013'))
  for dest in (old013,current):
   q=call(['bash',str(source/'install.sh'),'--rollback',dest],env=dict(os.environ,DESTDIR=str(root),HOD_SYSTEMCTL=str(hod)));require(q)
   assert os.readlink(root/'opt/autopilot/current')=='releases/'+dest
   results.append(dict(case='PUBLIC-catalogue014-release013-cycle',target=dest,result=q))
 expected_selector=os.readlink(root/'opt/autopilot/current');expected_registry=registry.read_bytes()
 for dest,reason in [(current,'RELEASE_ALREADY_CURRENT'),('f'*40+'-unknown','RELEASE_NOT_RECORDED')]:
  q=call(rollback(dest));assert q['rc']==2 and reason in q['err'],q
 damaged=root/'opt/autopilot/releases'/target/'skill/tools/ap.py';before_damage=damaged.read_bytes()
 damaged.write_bytes(before_damage+b'\nCOPY_LEGACY_RELEASE_CORRUPTION\n')
 count=call(['grep','-cF','COPY_LEGACY_RELEASE_CORRUPTION',str(damaged)]);assert count['out'].strip()=='1'
 bad_sha=sha(damaged.read_bytes());assert bad_sha!=sha(before_damage)
 q=call(rollback(target));assert q['rc']==2 and 'RELEASE_INTEGRITY' in q['err'],q
 damaged.write_bytes(before_damage);assert sha(damaged.read_bytes())==sha(before_damage)
 assert os.readlink(root/'opt/autopilot/current')==expected_selector and registry.read_bytes()==expected_registry
 results.append(dict(case='preflight-current-unknown-corruption-return',before=sha(before_damage),mutant=bad_sha,returned=sha(damaged.read_bytes()),markerCount=1))
 # The actual selected core executes; generated014 or immutable historical code.
 require(execute_runtime('init','--slug','private-window-probe'))
 q=call(rollback(target,scan()));assert q['rc']!=0,q
 records=[json.loads(p.read_text()) for p in (root/'var/lib/dsh-autopilot/rollback').glob('*/record.json')]
 assert any('LIVE_RUN_PINNED' in x.get('reason','') for x in records) or 'LIVE_RUN_PINNED' in q['err'],q
 assert os.readlink(root/'opt/autopilot/current')=='releases/'+current
 status=json.loads((root/'var/lib/dsh-autopilot/applicability.json').read_text());assert status['status'] in ('applicable','inapplicable'),status
 results.append(dict(case='active-run-refused-without-selection',status=status))
 require(execute_runtime('finish','--result','done'))
 results.append(dict(case='actual-selected-init-finish',status='pass'))
 report=scan();blocked_marker=top/'hook-entered';release_hook=top/'hook-release'
 hook=registry.parent/'.git/hooks/pre-commit';hook.write_text('#!/bin/sh\ntouch '+str(blocked_marker)+'\ni=0\nwhile [ ! -f '+str(release_hook)+' ] && [ "$i" -lt 200 ]; do sleep .05; i=$((i+1)); done\n');hook.chmod(0o755)
 child=subprocess.Popen(rollback(target,report),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);children.append(child)
 until=time.monotonic()+30
 while not blocked_marker.exists():
  assert child.poll() is None,child.communicate();assert time.monotonic()<until,'hook not reached';time.sleep(.05)
 receipt=json.loads((root/'var/lib/dsh-autopilot/operator-window-active.json').read_text());record=json.loads((root/'var/lib/dsh-autopilot/operator-windows'/(receipt['id']+'.json')).read_text())
 assert record['phase']=='fenced',record
 units_read=[call(['systemctl','show',u,'-p','FreezerState','--value'])['out'].strip() for u in units];assert units_read==['frozen','frozen'],units_read
 keeper=call(['systemctl','show',record['job'],'-p','NFileDescriptorStore','--value'])['out'].strip();assert keeper=='0',keeper
 before=(project/'.autopilot/state.js').read_bytes()
 release_hook.touch();out,err=child.communicate(timeout=40);assert child.returncode==0,(out,err)
 closed=json.loads((root/'var/lib/dsh-autopilot/operator-windows'/(receipt['id']+'.json')).read_text());assert closed['phase']=='closed' and closed['processesAfterCleanup']==closed['processesBefore'] and closed['transactionStatus']=='confirmed',closed
 assert os.readlink(root/'opt/autopilot/current')=='releases/'+target
 applicability=json.loads((root/'var/lib/dsh-autopilot/applicability.json').read_text());assert applicability['status']=='inapplicable',applicability
 results.append(dict(case='PUBLIC-'+current+'-to-'+target,rc=0,processesBefore=record['processesBefore'],processesAfter=closed['processesAfter'],mainIdentity=record['pid'],frozen=units_read,fdStore=int(keeper),catalogue=applicability))
 q=call(['bash',str(source/'install.sh'),'--rollback',current],env=dict(os.environ,DESTDIR=str(root),HOD_SYSTEMCTL=str(hod)));assert q['rc']==2 and 'RUN_INVENTORY_UNPROVEN' in q['err'],q
 results.append(dict(case='inapplicable-next-public-rollback-refused',result=q))
 q=call(rollback(current,report));assert q['rc']!=0 and 'LEGACY_REPORT_NOT_FRESH' in q['err'],q
 results.append(dict(case='old-census-refused',result=q))
 hook.unlink()
 a12=next(Path(x).name for x in manifest['managed'] if x.endswith('-a12-b4-c2'))
 for dest in (a12,target):
  q=call(rollback(dest,scan()));require(q)
  assert os.readlink(root/'opt/autopilot/current')=='releases/'+dest
  results.append(dict(case='PUBLIC-legacy-cycle-to-'+dest,result=q))
 fresh=scan();q=call(rollback(current,fresh));require(q)
 assert os.readlink(root/'opt/autopilot/current')=='releases/'+current
 results.append(dict(case='PUBLIC-'+target+'-to-'+current+'-fresh-window',result=q))
 # A real crash in the durable intent -> observed ownership gap must thaw.
 window_code=source/'lib/operator_window.py';before_window=window_code.read_bytes()
 anchor=b"            control(['systemctl','--system','freeze',row['unit']])"
 assert before_window.count(anchor)==1
 window_code.write_bytes(before_window.replace(anchor,anchor+b"\n            os._exit(77)  # COPY_CRASH_AFTER_FREEZE"))
 mutant_sha=sha(window_code.read_bytes());assert mutant_sha!=sha(before_window)
 count=call(['grep','-cF','COPY_CRASH_AFTER_FREEZE',str(window_code)]);assert count['out'].strip()=='1'
 q=call(rollback(target,scan()));assert q['rc']!=0,q
 crash_receipts=[json.loads(p.read_text()) for p in (root/'var/lib/dsh-autopilot/operator-windows').glob('*.json')]
 crash=next(x for x in crash_receipts if x.get('target')==target and x.get('units',[{}])[0].get('freezeIntent') and not x['units'][0].get('owned'))
 assert crash['phase']=='closed' and crash['transactionStatus']=='unproven' and len(crash['processesAfterCleanup'])==2,crash
 assert all(call(['systemctl','show',u,'-p','FreezerState','--value'])['out'].strip()=='running' for u in units)
 assert call(['systemctl','show',crash['job'],'-p','NFileDescriptorStore','--value'])['out'].strip() in ('','0')
 window_code.write_bytes(before_window);assert sha(window_code.read_bytes())==sha(before_window)
 results.append(dict(case='REAL-exit-after-freeze-before-owned',result=q,phase=crash['phase'],markerCount=1,beforeSha=sha(before_window),mutantSha=mutant_sha,returnSha=sha(window_code.read_bytes())))
 # Root-created new UID process is outside the normal premise; detect it.
 def actor_in_group():
  actor=subprocess.Popen(['setpriv','--reuid='+str(master.pw_uid),'--regid='+str(master.pw_gid),'--clear-groups','/usr/bin/sleep','60']);children.append(actor)
  until=time.monotonic()+2
  while True:
   uids=next(x for x in Path('/proc/'+str(actor.pid)+'/status').read_text().splitlines() if x.startswith('Uid:')).split()[1:]
   if uids==[str(master.pw_uid)]*4:break
   assert time.monotonic()<until,'injected actor UID transition not observed';time.sleep(.005)
  group=call(['systemctl','show',units[0],'-p','ControlGroup','--value'])['out'].strip()
  Path('/sys/fs/cgroup'+group+'/cgroup.procs').write_text(str(actor.pid))
  return actor
 actor=actor_in_group()
 q=call(rollback(target,scan()));assert q['rc']!=0 and 'WINDOW_OPERATOR_HAS_CHILDREN' in q['err'],q
 actor.kill();actor.wait(timeout=3)
 results.append(dict(case='new-master-process-before-window-refused',result=q))
 blocked_marker.unlink();release_hook.unlink()
 hook.write_text('#!/bin/sh\ntouch '+str(blocked_marker)+'\ni=0\nwhile [ ! -f '+str(release_hook)+' ] && [ "$i" -lt 200 ]; do sleep .05; i=$((i+1)); done\n');hook.chmod(0o755)
 child=subprocess.Popen(rollback(target,scan()),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);children.append(child)
 until=time.monotonic()+30
 while not blocked_marker.exists():
  assert child.poll() is None,child.communicate();assert time.monotonic()<until;time.sleep(.02)
 key=json.loads((root/'var/lib/dsh-autopilot/operator-window-active.json').read_text())['id']
 actor=actor_in_group();release_hook.touch()
 out,err=child.communicate(timeout=80);assert child.returncode!=0 and 'WINDOW_OPERATOR_CHILD_OR_EXTERNAL_PID' in err,(out,err)
 actor.kill();actor.wait(timeout=3)
 ended=json.loads((root/'var/lib/dsh-autopilot/operator-windows'/(key+'.json')).read_text())
 assert ended['phase']=='closed' and ended['transactionStatus']=='unproven' and 'WINDOW_OPERATOR_CHILD_OR_EXTERNAL_PID' in ended['processError'] and ended.get('cleanupCensusError'),ended
 hook.unlink()
 results.append(dict(case='new-master-process-after-selection-refused',rc=child.returncode,reason=ended['processError'],scope='root injection outside normal no-new-UID premise; transaction not certified'))
 # Restore the copied selector only after the injected process has gone.
 require(call(rollback(current,scan())))
 print(json.dumps(dict(scope='OWN release-copy/real-master-UID/stend-only units; no production freeze/mark/write',fixture=str(top),fixtureCurrent014=catalogue014,copyStart=current,results=results,registryIndependent=True,relocationProof=relocationProof,registrySource='private-generated-wrapped-YAML',mode=mode,receipts=[json.loads(p.read_text()) for p in (root/'var/lib/dsh-autopilot/operator-windows').glob('*.json')]),ensure_ascii=False,indent=2))
finally:
 job=None
 active=root/'var/lib/dsh-autopilot/operator-window-active.json'
 if active.exists():
  key=json.loads(active.read_text()).get('id')
  if key:
   job='stend-ap-rollback-window-'+key+'.service'
   subprocess.run(['systemctl','stop',job],capture_output=True,timeout=25)
   # Fixture teardown ONLY, AFTER native stop killed all mutation children.
   subprocess.run(['systemctl','reset-failed',job],capture_output=True,timeout=5)
 for child in children:
  if child.poll() is None:child.kill();child.communicate(timeout=5)
 for u in units:
  subprocess.run(['systemctl','thaw',u],capture_output=True,timeout=5);subprocess.run(['systemctl','stop',u],capture_output=True,timeout=5);subprocess.run(['systemctl','reset-failed',u],capture_output=True,timeout=5)
 # A failed stop must retain the fixture; diagnostics must not retain a stopped one.
 for u in units+([job] if job else []):
  q=subprocess.run(['systemctl','show',u,'-p','ActiveState','-p','MainPID'],capture_output=True,text=True,timeout=5)
  state=dict(line.split('=',1) for line in q.stdout.splitlines() if '=' in line)
  assert q.returncode in (0,1) and state.get('ActiveState')=='inactive' and state.get('MainPID')=='0',('FIXTURE_NOT_STOPPED',str(top),u,q.returncode,state,q.stderr)
 try:
  print('LEGACY_WINDOW_RECEIPTS '+json.dumps([json.loads(p.read_text()) for p in (root/'var/lib/dsh-autopilot/operator-windows').glob('*.json')]),file=sys.stderr,flush=True)
  (top/'PROBE-FINISHED').touch()
 finally:
  shutil.rmtree(top)  # own fixture only, after owned services/processes stopped
