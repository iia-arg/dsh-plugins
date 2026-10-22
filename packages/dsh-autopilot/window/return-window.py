#!/usr/bin/python3
"""Explicit approved inverse route based on the actual native phase, never inferred from rc."""
import argparse,json,os,re,runpy,subprocess
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('action',choices=['begin-approved-return','finish']);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit(2)
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));safe=api['safe_file'];g=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='ap017_inverse')['main'].__globals__;ident=safe(a.state/'forward.id').decode().strip()
if not re.fullmatch('[0-9a-f]{32}',ident):raise SystemExit('invalid forward ID')
record=g['validate'](g['read'](Path('/var/lib/montazh-okna'),ident+'.json'),ident+'.json');dest=a.state/'return.json'
if a.action=='begin-approved-return':
 if dest.exists():raise SystemExit('return already selected; inspect existing state')
 if record['phase']=='open':result={'id':ident,'mode':'otkat-proveren'}
 elif record['phase']=='closed':
  recovery=subprocess.check_output(['/usr/local/sbin/montazh-okno','otkryt','--plan',str(a.save/'inverse.native.json'),'--task',json.loads(safe(a.save/'PREPARED.json'))['task']+'-RECOVERY','--actor','Забава <aclaude@sadik>'],text=True).strip()
  if not re.fullmatch('[0-9a-f]{32}',recovery):raise SystemExit('invalid recovery ID')
  result={'id':recovery,'mode':'zakryt'}
 else:raise SystemExit('unsupported native phase: '+record['phase'])
 with dest.open('x') as f:f.write(json.dumps(result)+'\n')
 dest.chmod(0o600);print('RETURN_SELECTED '+json.dumps(result));raise SystemExit(0)
subprocess.run(['python3','-I','-B',str(Path(__file__).with_name('directories.py')),'--save',str(a.save),'removed'],check=True)
result=json.loads(safe(dest));command=result['mode'];ident=result['id']
if command not in {'otkat-proveren','zakryt'} or not re.fullmatch('[0-9a-f]{32}',ident):raise SystemExit('invalid return state')
argv=['/usr/local/sbin/montazh-okno',command]+(['--plan',str(a.save/'inverse.native.json')] if command=='otkat-proveren' else [])+[ident]
subprocess.run(argv,check=True);print('RETURN_NATIVE_FINISHED '+ident)
