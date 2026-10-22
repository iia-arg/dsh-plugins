#!/usr/bin/env python3
"""Read-only census of AP state/operator records in every visible local mount.

No HOME restriction, no AP execution, no JS evaluation, no changes to sources.
This is a separately reviewed inventory instrument, NOT a bootstrap command.
"""
import argparse,hashlib,json,os,pwd,re,stat,sys,time
from datetime import datetime,timezone
from pathlib import Path
MAX_DEPTH=256
MAX_SECONDS=180

import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = _limits_here / 'task_limits.py'
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT
MAX_FILE=USAGE_BYTE_LIMIT
LOCAL={'ext2','ext3','ext4','xfs','btrfs','zfs','f2fs','vfat','exfat','ntfs3','squashfs','overlay','tmpfs','ramfs','devtmpfs','hugetlbfs'}
CONTROL={'proc','sysfs','devpts','cgroup','cgroup2','securityfs','tracefs','debugfs','configfs','pstore','efivarfs','bpf','fusectl','mqueue','nsfs','binfmt_misc','autofs'}
REMOTE={'nfs','nfs4','cifs','smb3','9p','ceph','afs','fuse.sshfs'}
IDENT=re.compile(r'[A-Za-z0-9_-]{1,128}\Z')
PIN=re.compile(r'/opt/autopilot/releases/([0-9a-f]{40}-[A-Za-z0-9._-]+)/skill\Z')
def now():return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def digest(raw):return hashlib.sha256(raw).hexdigest()
def unjson(raw):
 def pairs(rows):
  result={}
  for key,value in rows:
   if key in result:raise ValueError('DUPLICATE_KEY')
   result[key]=value
  return result
 return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE')))
def read(path):
 path=Path(path);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_size>MAX_FILE:raise ValueError('UNSAFE_OR_OVERSIZE_RECORD')
  chunks=[];size=0
  while chunk:=os.read(fd,65536):
   chunks.append(chunk);size+=len(chunk)
   if size>MAX_FILE:raise ValueError('OVERSIZE_RECORD')
  ident=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  if ident(s)!=ident(os.fstat(fd)) or ident(s)!=ident(path.lstat()):raise ValueError('RECORD_CHANGED')
  return b''.join(chunks),s
 finally:os.close(fd)
def state(raw):
 text=raw.decode().strip()
 if text.startswith('window.STATE='):text=text[len('window.STATE='):]
 elif text.startswith('window.STATE ='):text=text[len('window.STATE ='):]
 value=unjson(text.rstrip(';'))
 if not isinstance(value,dict):raise ValueError('STATE_NOT_OBJECT')
 return value

def scan_roots(roots,*,uid,max_depth=MAX_DEPTH,timeout=MAX_SECONDS,mount_points=()):
 deadline=time.monotonic()+timeout;result=dict(complete=False,files=[],errors=[],symlinks=[],ownerAutopilotDirs=[],directories=0,entries=0,maxDepth=max_depth,maxObservedDepth=0)
 boundaries=set(map(str,mount_points));seen_paths=set()
 for initial in map(Path,roots):
  stack=[(initial,0)]
  while stack:
   folder,depth=stack.pop()
   if time.monotonic()>deadline:result['errors'].append('SCAN_DEADLINE_'+str(timeout));stack.clear();break
   if str(folder) in seen_paths:continue
   seen_paths.add(str(folder));result['directories']+=1
   if folder.name=='.autopilot' and folder.stat().st_uid==uid:result['ownerAutopilotDirs'].append(str(folder))
   try:
    with os.scandir(folder) as stream:
     for item in stream:
      if result['entries']%1024==0 and time.monotonic()>deadline:
       result['errors'].append('SCAN_DEADLINE_'+str(timeout));stack.clear();break
      path=Path(item.path);d=depth+1;result['entries']+=1;result['maxObservedDepth']=max(result['maxObservedDepth'],d)
      if str(path) in boundaries and path!=initial:continue
      if d>max_depth:
       result['errors'].append('DEPTH_LIMIT_'+str(max_depth)+': '+str(path));continue
      if item.is_symlink():
       result['symlinks'].append(str(path))
       if item.name=='.autopilot':
        try:
         if item.stat(follow_symlinks=False).st_uid==uid or (path/'state.js').stat().st_uid==uid:result['errors'].append('SYMLINK_AUTOPILOT: '+str(path))
        except FileNotFoundError:pass
       if item.name in ('state.js','operator.json') and (item.stat(follow_symlinks=False).st_uid==uid or '.autopilot' in path.parts or path.is_relative_to('/srv/autopilot/public/master')):result['errors'].append('SYMLINK_RECORD: '+str(path))
      elif item.is_dir(follow_symlinks=False):stack.append((path,d))
      elif item.name in ('state.js','operator.json'):
       if item.is_file(follow_symlinks=False):result['files'].append(str(path))
       elif item.stat(follow_symlinks=False).st_uid==uid:result['errors'].append('NONREGULAR_OWNER_RECORD: '+str(path))
   except OSError as exc:result['errors'].append(type(exc).__name__+': '+str(folder))
  if time.monotonic()>deadline:
   result['errors'].append('SCAN_DEADLINE_'+str(timeout));break
 result['files']=sorted(set(result['files']));result['symlinks']=sorted(set(result['symlinks']));result['complete']=not result['errors'];return result

def mounts():
 raw=Path('/proc/self/mountinfo').read_bytes();rows=[]
 def decode(s):return re.sub(r'\\([0-7]{3})',lambda m:chr(int(m[1],8)),s)
 for line in raw.decode().splitlines():
  left,right=line.split(' - ',1);a=left.split();b=right.split();kind=b[0]
  classification='local' if kind in LOCAL else 'control' if kind in CONTROL else 'remote' if kind in REMOTE else 'unproven'
  rows.append(dict(id=int(a[0]),parentId=int(a[1]),device=a[2],root=decode(a[3]),target=decode(a[4]),fstype=kind,classification=classification))
 return raw,rows

def scoped_skill(skill,production_root):
    resolved=Path(skill).resolve()
    if production_root!=Path('/opt/autopilot') and resolved.is_relative_to(production_root):
        return str(Path('/opt/autopilot')/resolved.relative_to(production_root))
    return str(resolved)

def analyze(files,*,uid,public_root,attestations=None,production_root=Path('/opt/autopilot')):
 result=dict(records=[],errors=[],public=dict(matched=0,unmatched=[],entries=[]));rows=result['records'];states={};operators={};attestations=attestations or {}
 for name in sorted(set(files)):
  path=Path(name);info=None
  try:
   raw,s=read(path);info=dict(path=name,sha256=digest(raw),uid=s.st_uid,device=s.st_dev,inode=s.st_ino)
   if path.name=='operator.json':
    value=unjson(raw)
    if s.st_uid==uid or isinstance(value,dict) and value.get('uid')==uid:
     operators[str(path)]=info|dict(operator=value,classification='operator_record',potentialProductionPin=False)
    continue
   try:value=state(raw)
   except (ValueError,UnicodeError):
    if s.st_uid==uid:
     is_public=path.is_relative_to(Path(public_root)/'master') and len(path.relative_to(Path(public_root)/'master').parts)==3
     info.update(classification='unresolved_record' if '.autopilot' in path.parts or is_public else 'non_AP_payload',potentialProductionPin=('.autopilot' in path.parts or is_public),status='unproven',reason='INVALID_AP_ENVELOPE');rows.append(info)
    continue
   meta=value.get('_sadik')
   if isinstance(meta,dict) and not isinstance(meta.get('release'),dict):raise ValueError('STATE_RELEASE_NOT_OBJECT')
   skill=meta['release'].get('skill_dir') if isinstance(meta,dict) else value.get('skillDir')
   # Non-owner source JS objects are outside the owner census unless carrying a pin.
   if s.st_uid!=uid and not (isinstance(skill,str) and '/opt/autopilot/releases/' in skill):continue
   if value.get('finishedAt') is not None and (not isinstance(value['finishedAt'],str) or not value['finishedAt']):raise ValueError('INVALID_FINISHED_MARKER')
   info.update(status='finished' if value.get('finishedAt') else 'unfinished',potentialProductionPin=False)
   if isinstance(meta,dict):
    run=meta.get('run_id');project=meta.get('root');project_id=meta.get('project_id')
    if not isinstance(run,str) or not IDENT.fullmatch(run) or not isinstance(project,str) or not Path(project).is_absolute():raise ValueError('INVALID_RUN_BINDING')
    info.update(runId=run,project=project,projectId=project_id,skillDir=skill,publicRoot=meta.get('public_root'))
    canonical=Path(project)/'.autopilot/state.js'
    if str(canonical)!=name and path.parent.name=='.autopilot':raise ValueError('CANONICAL_ROOT_MISMATCH')
    if str(canonical)!=name:
     info.update(classification='state_copy_or_archive',reason='NOT_CANONICAL_RUNTIME_STATE',canonicalPath=str(canonical))
    elif not isinstance(skill,str) or not Path(skill).is_absolute():raise ValueError('MISSING_OR_RELATIVE_RELEASE_PIN')
    elif Path(skill).is_relative_to('/opt/autopilot/releases') and not PIN.fullmatch(scoped_skill(skill,production_root)):raise ValueError('MALFORMED_PRODUCTION_PIN')
    elif not PIN.fullmatch(scoped_skill(skill,production_root)):
     info.update(classification='nonproduction_release_binding',reason='RELEASE_PIN_OUTSIDE_PRODUCTION_ROOT',resolvedSkillDir=str(Path(skill).resolve()))
     if not Path(skill).is_dir():raise ValueError('NONPRODUCTION_PIN_NOT_PRESENT')
    else:
     selected=PIN.fullmatch(scoped_skill(skill,production_root))[1]
     if meta['release'].get('upstream_sha','')+'-'+meta['release'].get('local_revision','')!=selected:raise ValueError('RELEASE_TUPLE_MISMATCH')
     info.update(classification='canonical_run',release=selected,potentialProductionPin=not bool(value.get('finishedAt')))
     if s.st_uid!=uid:info.update(classification='unresolved_record',potentialProductionPin=True,reason='STATE_OWNER_MISMATCH')
    states[name]=(info,value)
   elif isinstance(skill,str):
    if not Path(skill).is_absolute() or (Path(skill).is_relative_to('/opt/autopilot/releases') and not PIN.fullmatch(scoped_skill(skill,production_root))):raise ValueError('INVALID_LEGACY_RELEASE_PIN')
    if not PIN.fullmatch(scoped_skill(skill,production_root)) and not Path(skill).is_dir():raise ValueError('NONPRODUCTION_LEGACY_PIN_NOT_PRESENT')
    info.update(classification='legacy_unidentified_run' if PIN.fullmatch(scoped_skill(skill,production_root)) else 'nonproduction_legacy_binding',skillDir=skill,potentialProductionPin=bool(PIN.fullmatch(scoped_skill(skill,production_root))),reason='LEGACY_STATE_WITHOUT_SADIK_BINDING');states[name]=(info,value)
   else:
    info.update(classification='public_or_unpinned_state',reason='NO_PRIVATE_RELEASE_BINDING');states[name]=(info,value)
   if name in attestations:
    proof=attestations[name]
    if proof.get('sha256')!=info['sha256'] or proof.get('classification') not in ('attested_isolated_fixture','attested_non_run_fixture') or not proof.get('evidence'):raise ValueError('CLASSIFICATION_ATTESTATION_MISMATCH')
    info.update(classificationEvidence=proof['evidence'],attestation=proof)
   rows.append(info)
  except (OSError,ValueError,TypeError,KeyError) as exc:
   result['errors'].append(type(exc).__name__+': '+name+': '+str(exc))
   states.pop(name,None)
   row=info or dict(path=name,uid=None)
   row.update(classification='unresolved_record',potentialProductionPin=True,status='unproven',reason=type(exc).__name__)
   if not any(x['path']==name for x in rows):rows.append(row)
 # Pair each canonical private record; PID liveness is diagnostic, NEVER finish.
 for name,(info,value) in states.items():
  if 'project' not in info:continue
  if info['classification'] not in ('canonical_run','nonproduction_release_binding','attested_isolated_fixture','unresolved_record'):continue
  expected=str(Path(name).with_name('operator.json'));op=operators.get(expected)
  if op is None:result['errors'].append('MISSING_OWNER_OPERATOR: '+name);info['status']='unproven';info['potentialProductionPin']=True
  else:
   info['operatorPath']=expected;info['operatorSha256']=op['sha256'];op['statePath']=name
   if op['uid']!=uid or not isinstance(op['operator'],dict) or op['operator'].get('uid')!=uid:result['errors'].append('OPERATOR_OWNER_MISMATCH: '+expected);info['potentialProductionPin']=True
 for name,row in operators.items():
  if 'statePath' not in row:row['classification']='orphan_operator_record';result['errors'].append('ORPHAN_OPERATOR: '+name)
  row.pop('operator',None);rows.append(row)
 # Public projections of every declared private public_root, including fixture roots.
 projected={}
 for name,(info,value) in states.items():
  pub=info.get('publicRoot');pid=info.get('projectId');run=info.get('runId')
  if isinstance(pub,str) and Path(pub).is_absolute() and isinstance(pid,str) and IDENT.fullmatch(pid) and run:
   projected[str(Path(pub)/'master'/pid/run/'state.js')]=name
 for name,(info,value) in states.items():
  if name in projected and info['classification']=='public_or_unpinned_state':info.update(classification='public_projection',privateStatePath=projected[name])
 # The real public index must account for its published cards and canonical states.
 index=Path(public_root)/'master/index.json'
 if index.exists():
  try:
   raw,_=read(index);data=unjson(raw);result['public']['indexPath']=str(index);result['public']['indexSha256']=digest(raw)
   if not isinstance(data,dict):raise ValueError('PUBLIC_INDEX_NOT_OBJECT')
   real_cards=[name for name in files if Path(name).is_relative_to(index.parent) and len(Path(name).relative_to(index.parent).parts)==3]
   result['public']['unindexedCards']=sorted(name for name in real_cards if str(Path(name).parent.relative_to(index.parent)) not in data)
   if result['public']['unindexedCards']:result['errors'].append('PUBLIC_CARD_NOT_INDEXED')
   for key,item in sorted(data.items()):
    bits=key.split('/')
    if len(bits)!=2 or not all(IDENT.fullmatch(x) for x in bits):raise ValueError('PUBLIC_INDEX_KEY_INVALID')
    card=str(index.parent/key/'state.js');matches=[row for row in rows if row.get('projectId')==bits[0] and row.get('runId')==bits[1] and row.get('classification')=='canonical_run' and row.get('publicRoot')==str(Path(public_root)) and projected.get(card)==row.get('path')]
    projection=states.get(card)
    if len(matches)!=1 or projection is None:result['public']['unmatched'].append(key);continue
    private=matches[0];published=projection[1]
    if bool(item.get('finished'))!=(private['status']=='finished') or bool(published.get('finishedAt'))!=(private['status']=='finished'):result['errors'].append('PUBLIC_COMPLETION_MISMATCH: '+key)
    result['public']['matched']+=1;result['public']['entries'].append(dict(key=key,privateStatePath=private['path'],publicStatePath=card,privateSha256=private['sha256'],publicSha256=projection[0]['sha256']))
  except (OSError,ValueError,TypeError,AttributeError) as exc:result['errors'].append('PUBLIC_INDEX: '+str(exc))
  if result['public']['unmatched']:result['errors'].append('PUBLIC_INDEX_UNMATCHED')
 else:result['public']['indexMissing']=True
 for row in rows:
  if row['classification'] in ('unresolved_record','legacy_unidentified_run'):result['errors'].append('UNCLASSIFIED_PIN: '+row['path'])
 result['records'].sort(key=lambda r:r['path']);result['complete']=not result['errors'];return result

def main():
 p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);p.add_argument('--attestations',type=Path);a=p.parse_args()
 if os.geteuid()!=0:p.error('ROOT_REQUIRED')
 uid=pwd.getpwnam('master').pw_uid;before,table=mounts();selected=[row['target'] for row in table if row['classification']=='local'];started=now()
 collected=scan_roots(selected,uid=uid,mount_points=[r['target'] for r in table]);proof_raw=read(a.attestations)[0] if a.attestations else None;proof=unjson(proof_raw) if proof_raw else {}
 parsed=analyze(collected['files'],uid=uid,public_root=Path('/srv/autopilot/public'),attestations=proof)
 after,_=mounts();errors=collected['errors']+parsed['errors']
 if parsed['public'].get('indexMissing'):errors.append('PUBLIC_INDEX_MISSING')
 if before!=after:errors.append('MOUNT_TABLE_CHANGED')
 if any(r['classification']=='unproven' for r in table):errors.append('MOUNT_KIND_UNPROVEN')
 report=dict(schemaVersion=2,scope='master-owner-or-release-pin/all-visible-local-mounts',operator='master',operatorUid=uid,startedAt=started,endedAt=now(),mountNamespace=os.readlink('/proc/self/ns/mnt'),mountTableSha256=digest(before),mounts=table,limits=dict(maxDepth=MAX_DEPTH,seconds=MAX_SECONDS,fileBytes=MAX_FILE),traversal={k:v for k,v in collected.items() if k!='files'},**parsed)
 report['attestationsSha256']=digest(proof_raw) if proof_raw else None;report['errors']=errors;report['complete']=not errors;report['allCandidatePaths']=collected['files'];print(json.dumps(report,ensure_ascii=False,sort_keys=True,indent=2));return 0 if report['complete'] else 2
if __name__=='__main__':sys.exit(main())
