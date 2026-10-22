#!/usr/bin/python3
"""Root snapshot of public receipt plus the bound prepared raw/R/G cut. No collector."""
import argparse,hashlib,json,os,re,stat,sys
from pathlib import Path
import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = _limits_here.parents[1] / 'lib/task_limits.py'
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT

ROOT=Path('/var/lib/autopilot-usage');BACKUP=Path('/var/backups/montazh/AP0111-P')
def identity(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def safe(p,uid=0):
 if p.resolve()!=p:raise ValueError('SOURCE_UNSAFE')
 for q in p.parents:
  s=q.lstat()
  if s.st_uid!=0 or s.st_mode&0o022 or not stat.S_ISDIR(s.st_mode):raise ValueError('SOURCE_UNSAFE')
 st=p.lstat()
 if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_uid!=uid or st.st_mode&0o022 or st.st_size>USAGE_BYTE_LIMIT:raise ValueError('SOURCE_UNSAFE')
 with p.open('rb') as f:raw=f.read((USAGE_BYTE_LIMIT + 1))
 if len(raw)!=st.st_size or identity(p.lstat())!=identity(st):raise ValueError('SNAPSHOT_CHANGED')
 return raw

def write(p,raw,uid=0,gid=0):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:os.fchown(f.fileno(),uid,gid);f.write(raw);f.flush();os.fsync(f.fileno())
 if p.read_bytes()!=raw:raise ValueError('COPY_CHANGED')
try:
 a=argparse.ArgumentParser(allow_abbrev=False);a.add_argument('run');a.add_argument('snapshot');a.add_argument('generation');x=a.parse_args()
 if os.geteuid()!=0 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}',x.run):raise ValueError('RUN_INVALID')
 pointer=ROOT/'runs'/x.run/'current.json';before=safe(pointer);d=json.loads(before)
 if set(d)!={'generation','receiptSha256'} or any(type(d[k]) is not str or not re.fullmatch('[0-9a-f]{64}',d[k]) for k in d):raise ValueError('RECEIPT_INVALID')
 if d['generation']!=x.generation:raise ValueError('U_DIR_GENERATION_CHANGED')
 raw=safe(ROOT/'runs'/x.run/'public'/d['generation']/'receipt.json')
 if hashlib.sha256(raw).hexdigest()!=d['receiptSha256']:raise ValueError('RECEIPT_HASH_MISMATCH')
 original=ROOT/'prepared/records'/(x.run+'.json');record_bytes=safe(original);record=json.loads(record_bytes)
 if record.get('runId')!=x.run or record.get('project')!='/srv/autopilot/projects/ap-test-0110':raise ValueError('PREPARED_IDENTITY_INVALID')
 snapshot=Path(x.snapshot)
 if snapshot.parent!=BACKUP or snapshot.resolve()!=snapshot or not snapshot.is_dir() or list(snapshot.iterdir()) or snapshot.stat().st_uid!=0:raise ValueError('SNAPSHOT_TARGET_UNSAFE')
 parts=record.get('participants')
 if type(parts) is not list or not 1<=len(parts)<=10:raise ValueError('PARTICIPANTS_INVALID')
 if len({p.get('name') for p in parts})!=len(parts):raise ValueError('PARTICIPANTS_INVALID')
 for p in parts:
  if type(p.get('name')) is not str or not re.fullmatch('[A-Za-z0-9_-]{1,80}',p['name']) or any(type(p.get(k)) is not int or p[k]<=0 for k in ('uid','gid')):raise ValueError('PARTICIPANTS_INVALID')
 outdir=snapshot/'prepared';outdir.mkdir(mode=0o700);total=0
 for p in record['participants']:
  uid,gid=p['uid'],p['gid'];source_home=ROOT/'prepared/owners'/str(uid)/x.run;dest=outdir/(str(uid)+'-'+p['name']);dest.mkdir(mode=0o700)
  sources=p['sources'];copied={};source_names=[('runtime',sources['runtime']),('gateway',sources['gateway'])]+[('raw',f) for f in sources['raw']]
  if len(source_names)>128:raise ValueError('SOURCE_LIST_INVALID')
  try:
   for kind,filename in source_names:
    f=Path(filename)
    if f.parent not in {source_home,source_home/p['name']} or f.name not in {'runtime.jsonl','gateway.jsonl'} and not re.fullmatch(r'raw-[0-9]+\.jsonl',f.name):raise ValueError('SOURCE_UNSAFE')
    data=safe(f,uid);total+=len(data)
    if total>USAGE_BYTE_LIMIT:raise ValueError('REFERENCE_BUDGET_EXCEEDED')
    target=dest/f.name;write(target,data,uid,gid)
    if kind=='raw':copied.setdefault('raw',[]).append(str(target))
    else:copied[kind]=str(target)
  except OSError:copied={}
  proof=ROOT/'prepared/proof'/x.run/(p['name']+'.json')
  try:write(dest/'proof.json',safe(proof))
  except OSError:pass
  p['home']=str(dest);p['runtimeHome']=str(dest);p['sources']=copied
 if safe(pointer)!=before or safe(original)!=record_bytes:raise ValueError('SNAPSHOT_CHANGED')
 write(outdir/'record.json',(json.dumps(record,sort_keys=True)+'\n').encode())
 out=snapshot/'receipt.json';write(out,raw)
 print('КВИТАНЦИЯ:',out,'sha256',hashlib.sha256(raw).hexdigest());print('ЭТАЛОН: частная копия prepared R/G/raw',outdir/'record.json')
except (ValueError,OSError,KeyError,TypeError) as e:
 print('КВИТАНЦИЯ НЕ СКОПИРОВАНА:',str(e) if isinstance(e,ValueError) else 'SOURCE_UNAVAILABLE');sys.exit(2)
