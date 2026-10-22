#!/usr/bin/python3
"""CAS inverse of this window's files only; directory cleanup is the next explicit inverse step."""
import argparse,hashlib,json,os,stat,tempfile,runpy
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('action',choices=['check','restore']);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit(2)
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));safe=api['safe_file'];rows=json.loads(safe(a.save/'INVENTORY.json'));info=json.loads(safe(a.save/'PREPARED.json'));root=Path(info['root']);sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();actions=[]
allowed=[info['shelf'],*info['core_new_trees']];layout=[r['logical'] for r in rows if r['group']==4]   # public layout manifest of THIS window (prepare-window: the only group-4 row)
if len(layout)!=1 or not layout[0].startswith('/usr/local/libexec/dsh-autopilot/postal-layout-'):raise SystemExit('REFUSE layout row')
external={'/usr/local/libexec/dsh-autopilot/measure-run-codex.py','/usr/local/share/doc/dsh-autopilot/README-measure-run-codex.md',layout[0]}
for r in rows:
 name=r['logical'];dest=Path(r['path'])
 if dest!=root/name.lstrip('/') or not(name in external or any(name.startswith(t+'/') for t in allowed)):raise SystemExit('REFUSE non-core target')
 for parent in dest.parents:
  if parent==root:break
  if parent.exists() and (parent.is_symlink() or not parent.is_dir() or parent.stat().st_uid!=0 or parent.stat().st_mode&0o022):raise SystemExit('REFUSE unsafe parent')
 if dest.is_symlink() or (dest.exists() and (not dest.is_file() or dest.resolve()!=dest)):raise SystemExit('REFUSE target type')
 accepted={r['sha256']}|({r['before']['sha256']} if r['before'] else set())
 if dest.exists() and sha(dest) not in accepted:raise SystemExit('REFUSE foreign target bytes '+str(dest))
 backup=a.save/'before'/name.lstrip('/')
 if r['before'] and hashlib.sha256(safe(backup)).hexdigest()!=r['before']['sha256']:raise SystemExit('REFUSE backup differs')
 actions.append((r,dest,backup))
if a.action=='restore':
 for r,dest,backup in actions:
  if r['before'] is None:dest.unlink(missing_ok=True);continue
  fd,tmp=tempfile.mkstemp(prefix='.ap015-return-',dir=dest.parent)
  try:
   with os.fdopen(fd,'wb') as out:
    out.write(backup.read_bytes());out.flush();os.fsync(out.fileno());os.fchown(out.fileno(),r['before']['uid'],r['before']['gid']);os.fchmod(out.fileno(),r['before']['mode'])
   os.replace(tmp,dest)
  finally:Path(tmp).unlink(missing_ok=True)
 for r,dest,_ in actions:
  if r['before'] is None:
   if dest.exists() or dest.is_symlink():raise SystemExit('RESTORE leftover')
  else:
   st=dest.stat();b=r['before']
   if sha(dest)!=b['sha256'] or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(b['uid'],b['gid'],b['mode']):raise SystemExit('RESTORE differs')
print('FILES_'+a.action.upper()+'_PASS')
