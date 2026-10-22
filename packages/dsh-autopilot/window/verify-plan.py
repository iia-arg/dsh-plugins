#!/usr/bin/python3
import argparse,json,os,re,runpy
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('--id',required=True);a=p.parse_args()
if os.geteuid()!=0 or not re.fullmatch('[0-9a-f]{32}',a.id):raise SystemExit(2)
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));plan=json.loads(api['safe_file'](a.save/'forward.native.json'));g=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='ap017_verify')['main'].__globals__;record=g['validate'](g['read'](Path('/var/lib/montazh-okna'),a.id+'.json'),a.id+'.json')
if record['phase']!='open' or record['subjects']!=plan['subjects'] or record['checks']!=plan['checks']:raise SystemExit('record/plan differs')
errors=g['stable_verify'](plan['checks'])
if errors:raise SystemExit(str(errors))
print('NATIVE_ALL_CHECKS_PASS')
