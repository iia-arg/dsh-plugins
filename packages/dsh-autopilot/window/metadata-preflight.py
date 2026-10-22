"""Read-only metadata audit before first SMF: actual evidence policies and declared BEFORE files."""
import argparse,grp,hashlib,json,os,pwd,runpy,stat,sys
from pathlib import Path
import yaml
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('--after-snapshot',action='store_true');a=p.parse_args()
try:
 st=a.save.lstat()
 if os.geteuid()!=0 or a.save.resolve()!=a.save or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o700:raise ValueError('unsafe private SAVE')
 api=runpy.run_path(str(Path(__file__).resolve().with_name('registry-inverse-decision.py')));safe=api['safe_file'];prepared=json.loads(safe(a.save/'PREPARED.json'));inventory=json.loads(safe(a.save/'INVENTORY.json'));root=Path(prepared['root']);observed={}
 def path(name):
  value=Path(name)
  return value if root==Path('/') or value.is_relative_to(root) else root/str(value).lstrip('/')
 def record(value,policy,expected=None,allow_absent=False):
  value=Path(value)
  if allow_absent:
   if value.exists() or value.is_symlink():raise ValueError('new target appeared before SMF: '+str(value))
   observed[str(value)]={'policy':'new target must be absent','absent':True};return
  st=value.lstat();row={'uid':st.st_uid,'gid':st.st_gid,'mode':format(stat.S_IMODE(st.st_mode),'04o'),'policy':policy}
  if not stat.S_ISREG(st.st_mode) or value.resolve()!=value:raise ValueError('not canonical regular file: '+str(value))
  if expected is not None and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=expected:raise ValueError('metadata differs from BEFORE contract: '+str(value))
  observed[str(value)]=row
 private=['PREPARED.json','INVENTORY.json','plugins.BEFORE.yaml','plugins.AFTER.yaml']
 if a.after_snapshot:private+=['registry-history.before.json']
 for name in private:
  value=a.save/name;safe(value);record(value,'private evidence safe_file; root0600', (0,0,0o600))
 registry=Path(prepared['registry']);raw=safe(registry,registry=True);record(registry,'registry-specific safe_file; root:NSS-agent-registry0664',(0,grp.getgrnam('agent-registry').gr_gid,0o664))
 if hashlib.sha256(raw).hexdigest()!=prepared['registry_before_sha256']:raise ValueError('registry differs from PREPARED.before')
 history=api['history'](registry);log=Path(history['head_reflog']);safe(log);record(log,'generic safe_file; uid0 and no group/world write')
 mf=Path(prepared['layout_before_manifest']);manifest=json.loads(safe(mf));record(mf,'public manifest generic safe_file')
 for row in manifest['rows']:
  if row['kind']=='file':record(path(row['path']),'installed layout metadata; contents verified by native layout checker',(row['uid'],row['gid'],row['mode']))
 doc=yaml.safe_load(safe(a.save/'plugins.BEFORE.yaml'));entry=next(e for section in doc.values() if isinstance(section,list) for e in section if isinstance(e,dict) and e.get('id')=='dsh-autopilot')
 for f in entry['derevo']['files']:
  owner,group=f['owner'].split(':');record(path(f['local']),'BEFORE derevo metadata',(pwd.getpwnam(owner).pw_uid,grp.getgrnam(group).gr_gid,int(f['mode'],8)))
 for row in inventory:
  before=row['before'];record(Path(row['path']),'preparation inventory BEFORE', (before['uid'],before['gid'],before['mode']) if before else None,allow_absent=before is None)
 # Source worktree is trusted by pinned Git tree, not by evidence root ownership.
 source=[]
 for f in sorted((Path(prepared['repo'])/'packages/dsh-autopilot').rglob('*')):
  if f.is_file() and '__pycache__' not in f.parts:
   st=f.lstat();source.append({'path':str(f),'uid':st.st_uid,'gid':st.st_gid,'mode':format(stat.S_IMODE(st.st_mode),'04o'),'policy':'source pinned by prepare Git tree/clean check; generic safe_file not applied'})
 print(json.dumps({'status':'PASS','reader':'coordinator immediately after snapshot before first SMF','expected_paths':len(observed),'checked_paths':len(observed),'observed':observed,'source_paths':source,'boundary_required':a.after_snapshot,'scope':'evidence/default guard, live registry/Git-log, installed-layout/derevo/inventory metadata; Git source by separate content pin; no private key/token reads','production_writes':False},ensure_ascii=False,indent=2))
except (OSError,ValueError,KeyError,TypeError,StopIteration) as error:
 print('METADATA_PREFLIGHT_REFUSED: '+str(error),file=sys.stderr);raise SystemExit(2)
