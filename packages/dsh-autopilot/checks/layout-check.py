#!/usr/bin/python3
"""Nonroot public layout check. No imports from installed package, subprocess or secret reads.
Expected manifest is pinned by SHA256 from registry. 0:version,1:defect,2:blindness.
Caller: agent-plugins installed_check; reader: verify/registry-watchdog.
Runtime public panels, key/0700 directory, nginx, current process health are separate.
"""
import argparse,hashlib,json,os,re,stat,sys,pwd,grp
from pathlib import Path

def manifest(path,digest):
 if not re.fullmatch(r'[0-9a-f]{64}',digest):raise ValueError('manifest digest invalid')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  st=os.fstat(fd)
  if not stat.S_ISREG(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),st.st_nlink)!=(0,0,0o644,1) or st.st_size>2097152:raise ValueError('manifest owner/type/mode')
  with os.fdopen(os.dup(fd),'rb') as h:data=h.read(2097153)
 finally:os.close(fd)
 if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('manifest digest mismatch')
 m=json.loads(data)
 if not isinstance(m,dict) or not {'version','rows'} <= set(m) or bool(set(m)-{'version','rows','public','managed'}) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?',m.get('version','')) or not isinstance(m['rows'],list) or not m['rows']:raise ValueError('manifest shape')
 seen=set()
 for row in m['rows']:
  if not isinstance(row,dict):raise ValueError('manifest row')
  base={'path','kind','mode','uid','gid'};kind=row.get('kind');extra={'file':{'sha256'},'link':{'target'},'dir':set()}.get(kind)
  if extra is None or set(row)!=base|extra:raise ValueError('manifest row shape')
  path=row['path']
  if not isinstance(path,str) or not path.startswith('/') or os.path.normpath(path)!=path or '..' in Path(path).parts or path in seen:raise ValueError('manifest path')
  if path.startswith('/etc/dsh-autopilot'):raise ValueError('private key is outside public check')
  if any(type(row[k])!=int or row[k]<0 for k in ['mode','uid','gid']) or row['mode']>0o7777:raise ValueError('manifest permissions')
  if kind=='file' and not re.fullmatch(r'[0-9a-f]{64}',row['sha256']):raise ValueError('manifest file digest')
  if kind=='link' and not isinstance(row['target'],str):raise ValueError('manifest link')
  seen.add(path)
 if 'public' in m and (not isinstance(m['public'],dict) or set(m['public'])!={'operator','group'} or any(not isinstance(v,str) or not re.fullmatch(r'[a-z][a-z0-9_-]*',v) for v in m['public'].values())):raise ValueError('public shape')
 if 'managed' in m and (not isinstance(m['managed'],list) or not m['managed'] or any(not isinstance(p,str) or not p.startswith('/') or os.path.normpath(p)!=p or '..' in Path(p).parts for p in m['managed'])):raise ValueError('managed shape')
 return m

def verify(root,rows,managed=()):
 errors=[]
 for row in rows:
  p=root/row['path'].lstrip('/')
  try:
   for parent in p.parents:
    if parent==root:break
    if not stat.S_ISDIR(parent.lstat().st_mode):raise ValueError('parent is not physical directory')
   st=p.lstat();kind=row['kind']
   if (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(row['mode'],row['uid'],row['gid']):raise ValueError('mode/owner differs')
   if kind=='dir':
    if not stat.S_ISDIR(st.st_mode):raise ValueError('not directory')
   elif kind=='link':
    if not stat.S_ISLNK(st.st_mode) or os.readlink(p)!=row['target']:raise ValueError('link differs')
   else:
    if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:raise ValueError('not regular single-link file')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
     fst=os.fstat(fd)
     identity=lambda v:(v.st_dev,v.st_ino,v.st_mode,v.st_uid,v.st_gid,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
     if identity(fst)!=identity(st):raise ValueError('file changed before read')
     if fst.st_size>64*1024*1024:raise ValueError('file exceeds64MiB check bound')
     digest=hashlib.sha256()
     while chunk:=os.read(fd,65536):digest.update(chunk)
     end=os.fstat(fd)
     if identity(end)!=identity(fst) or identity(p.lstat())!=identity(fst):raise ValueError('file changed during read')
     for parent in p.parents:
      if parent==root:break
      if not stat.S_ISDIR(parent.lstat().st_mode):raise ValueError('parent changed during read')
     if digest.hexdigest()!=row['sha256']:raise ValueError('content differs')
    finally:os.close(fd)
  except (OSError,ValueError) as e:errors.append(row['path']+': '+('unreadable/missing' if isinstance(e,OSError) else str(e)))
 for tree in managed:
  expected={row['path'] for row in rows if Path(row['path']).is_relative_to(tree)}
  allowed_dirs={tree}
  for path in expected:
   allowed_dirs.update(str(p) for p in Path(path).parents if p.is_relative_to(tree))
  actual=root/tree.lstrip('/')
  try:
   st=actual.lstat()
   if not stat.S_ISDIR(st.st_mode) or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(0o755,0,0):raise ValueError('managed root')
  except (OSError,ValueError):errors.append(tree+': managed root missing/different');continue
  def unreadable(error):errors.append(tree+': managed tree unreadable')
  for directory,dirs,files in os.walk(actual,followlinks=False,onerror=unreadable):
   for name in dirs+files:
    path=Path(directory)/name;logical='/'+str(path.relative_to(root))
    if path.is_dir() and not path.is_symlink():
     st=path.lstat()
     if logical not in allowed_dirs or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(0o755,0,0):errors.append(logical+': unmanaged/different directory')
    elif logical not in expected:errors.append(logical+': unmanaged file/link')
 return errors

def main():
 p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--sha',required=True);p.add_argument('--root',type=Path,default=Path('/'));a=p.parse_args()
 try:
  if not a.root.is_absolute() or '..' in a.root.parts or not a.root.is_dir() or a.root.is_symlink():raise ValueError('root invalid')
  m=manifest(a.manifest,a.sha)
 except (OSError,ValueError,TypeError,KeyError):print('BLIND: public layout manifest invalid/unreadable',file=sys.stderr);return 2
 errors=verify(a.root,m['rows'],m.get('managed',()))
 if 'public' in m:
  try:
   for name in ['srv','srv/autopilot']:
    st=(a.root/name).lstat()
    if not stat.S_ISDIR(st.st_mode) or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(0o755,0,0):raise ValueError('public parent mode/owner/type differs: /'+name)
   account=pwd.getpwnam(m['public']['operator']);group=grp.getgrnam(m['public']['group'])
   if account.pw_uid<=0 or account.pw_gid<=0:raise ValueError('operator must be nonroot/nonprivileged')
   if group.gr_gid==0 or group.gr_gid in os.getgrouplist(account.pw_name,account.pw_gid):raise ValueError('operator is reader group member')
   for name,mode,uid in [('srv/autopilot/public',0o2751,0),('srv/autopilot/public/'+account.pw_name,0o2750,account.pw_uid)]:
    st=(a.root/name).lstat()
    if not stat.S_ISDIR(st.st_mode) or (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)!=(mode,uid,group.gr_gid):raise ValueError('public directory mode/owner differs: /'+name)
  except (KeyError,OSError,ValueError) as e:errors.append('/srv/autopilot/public: '+('NSS/path missing/unreadable' if not isinstance(e,ValueError) else str(e)))

 if errors:
  for error in errors:print('LAYOUT DIFFERENT '+error,file=sys.stderr)
  return 1
 print(m['version']);return 0
if __name__=='__main__':sys.exit(main())
