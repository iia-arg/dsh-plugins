#!/usr/bin/python3
"""Read-only before/after preservation of old public layout and live service identities."""
import argparse,hashlib,json,os,stat,subprocess,runpy
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('action',choices=['before','after']);a=p.parse_args()
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));info=json.loads(api['safe_file'](a.save/'PREPARED.json'));root=Path(info['root']);old=json.loads(api['safe_file'](Path(info['layout_before_manifest'])))
changed={r['logical'] for r in json.loads(api['safe_file'](a.save/'INVENTORY.json'))};changed|={r['logical'] for r in info['core_links'] if r['before']!=r['after']}
files={}
for row in old['rows']:
 if row['path'] in changed or row['kind']!='file':continue
 f=root/row['path'].lstrip('/');s=f.lstat();files[row['path']]={'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'inode':s.st_ino}
services={}
if root==Path('/'):
 for unit in ['autopilot-mail.service','autopilot-copy.service','dsh-autopilot-razdacha.service','coder-gateway-master.service']:
  body=subprocess.check_output(['systemctl','show',unit,'-p','MainPID','-p','InvocationID','-p','ActiveState'],text=True);services[unit]=body
result={'files':files,'services':services,'excluded_changed_paths':sorted(changed),'root':str(root)};dest=a.save/'preserve.before.json'
if a.action=='before':
 if dest.exists():raise SystemExit('snapshot exists')
 dest.write_text(json.dumps(result,indent=2)+'\n');dest.chmod(0o600)
else:
 previous=json.loads(api['safe_file'](dest))
 if previous!=result:raise SystemExit('PRESERVATION_FAILED')
print('PRESERVATION_'+a.action.upper()+'_PASS files='+str(len(files))+' services='+str(len(services)))
