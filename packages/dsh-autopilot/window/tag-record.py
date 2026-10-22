#!/usr/bin/python3
import argparse,json,re,subprocess,os,runpy
from pathlib import Path
p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit(2)
api=runpy.run_path(str(Path(__file__).with_name('registry-inverse-decision.py')));info=json.loads(api['safe_file'](a.save/'PREPARED.json'));repo=info['repo'];git=['git','-c','safe.directory='+repo,'-C',repo]
version=json.loads(subprocess.check_output(git+['show',info['source_commit']+':packages/dsh-autopilot/package.json'],text=True))['version']   # номер — из выпущенного исходника, не литералом
if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise SystemExit('invalid release number in source package.json')
raw=subprocess.check_output(git+['rev-parse','--verify','refs/tags/dsh-autopilot-v'+version],text=True).strip();commit=subprocess.check_output(git+['rev-parse',raw+'^{commit}'],text=True).strip();kind=subprocess.check_output(git+['cat-file','-t',raw],text=True).strip()
if not re.fullmatch('[0-9a-f]{40}',raw) or commit!=info['source_commit'] or kind!='tag':raise SystemExit('tag differs from source/annotation')
f=a.save/'tag.oid'
if f.exists():raise SystemExit('tag already recorded')
f.write_text(raw+'\n');f.chmod(0o600);f=Path(info['public'])/'tag.oid';f.write_text(raw+'\n');f.chmod(0o644);print('TAG_CAPTURED '+raw)
