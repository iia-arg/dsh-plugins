#!/usr/bin/python3
"""Read-only AP-entry inverse candidate; preserve unrelated current YAML bytes."""
import argparse,copy,hashlib,json,re
from pathlib import Path
import yaml

p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--save',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
info=json.loads((a.save/'PREPARED.json').read_text());current=Path(info['registry']).read_text();doc=yaml.safe_load(current)
before=yaml.safe_load((a.save/'plugins.BEFORE.yaml').read_text());after=yaml.safe_load((a.save/'plugins.AFTER.yaml').read_text())
def entries(d):return {e['id']:e for group in d.values() if isinstance(group,list) for e in group if isinstance(e,dict) and 'id' in e}
b=entries(before);f=entries(after);live=entries(doc);ids=['dsh-autopilot']
for eid in ids:
    if live[eid] not in [b[eid],f[eid]]:raise SystemExit('REFUSE foreign owned registry entry '+eid)
out=current
for eid in ids:
    pattern=re.compile(r'(?ms)^  - id: '+re.escape(eid)+r'\s*\n.*?(?=^  - id:|^\S|\Z)');matches=list(pattern.finditer(out))
    if len(matches)!=1:raise SystemExit('REFUSE ambiguous owned registry block')
    block='\n'.join('  '+line for line in yaml.safe_dump([b[eid]],allow_unicode=True,sort_keys=False,width=100000).rstrip().splitlines())+'\n';m=matches[0];suffix=re.search(r'(?:^[ \t]*(?:#[^\n]*)?\n)*\Z',m.group(),re.M).group();out=out[:m.start()]+block+suffix+out[m.end():]
result=yaml.safe_load(out)
expected=copy.deepcopy(doc)
for group in expected.values():
    if isinstance(group,list):
        for i,e in enumerate(group):
            if isinstance(e,dict) and e.get('id') in ids:group[i]=b[e['id']]
if result!=expected:raise SystemExit('REFUSE inverse escaped owned entries or top-level data')
with a.out.open('x') as output:output.write(out)
print('OSNOVA='+hashlib.sha256(current.encode()).hexdigest());print('INVERSE='+str(a.out))
