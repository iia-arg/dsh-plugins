#!/usr/bin/python3
"""CAS publication/inverse of core links only; explicit operator actions, no service calls."""
import argparse,json,os,stat,tempfile,hashlib,runpy
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('action',choices=['before','after','apply','check-restore','restore']);a=p.parse_args()
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));info=json.loads(api['safe_file'](a.save/'PREPARED.json'));root=Path(info['root']);rows=info['core_links'];allowed=info['core_new_trees']
if os.geteuid()!=0:raise SystemExit('root operator required')
if not rows or len({r['path'] for r in rows})!=len(rows):raise SystemExit('invalid core links')
for r in rows:
 name=r['logical'];dest=Path(r['path'])
 if dest!=root/name.lstrip('/') or not (name in {'/opt/autopilot/current','/opt/agent-skills/autopilot'} or any(name.startswith(t+'/') for t in allowed)):raise SystemExit('link outside core')
 value=os.readlink(dest) if dest.is_symlink() else None
 if value is None and dest.exists():raise SystemExit('foreign regular link target')
 accepted=[r['before']] if a.action=='before' else [r['after']] if a.action=='after' else [r['before'],r['after']]
 if value not in accepted:raise SystemExit('foreign link: '+name)
 for parent in dest.parents:
  if parent==root:break
  if parent.exists() and (parent.is_symlink() or not parent.is_dir() or parent.stat().st_uid!=0 or parent.stat().st_mode&0o022):raise SystemExit('unsafe link parent')
if a.action=='apply':
 # Publish only when all producer files have their accepted contents/metadata.
 for r in json.loads(api['safe_file'](a.save/'INVENTORY.json')):
  f=Path(r['path']);st=f.lstat()
  if not stat.S_ISREG(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(r['uid'],r['gid'],r['mode']) or hashlib.sha256(f.read_bytes()).hexdigest()!=r['sha256']:raise SystemExit('producer not installed: '+str(f))
if a.action in {'apply','restore'}:
 # Immutable raw-source links first; current is the final publication point.
 for r in sorted(rows,key=lambda r:r['logical']=='/opt/autopilot/current'):
  dest=Path(r['path']);value=r['after' if a.action=='apply' else 'before']
  if (os.readlink(dest) if dest.is_symlink() else None)==value:continue
  if value is None:dest.unlink();continue
  dest.parent.mkdir(parents=True,exist_ok=True)
  fd,new=tempfile.mkstemp(prefix='.ap015-link-',dir=dest.parent);os.close(fd);os.unlink(new)
  try:os.symlink(value,new);os.replace(new,dest)
  finally:Path(new).unlink(missing_ok=True)
print('CORE_LINKS_'+a.action.upper()+'_PASS')
