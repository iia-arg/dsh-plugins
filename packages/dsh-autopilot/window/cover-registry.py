"""Read-only coverage of every changed derevo.ref, using the prepared commit before tags exist."""
import json,re,subprocess,sys
from pathlib import Path,PurePosixPath
import yaml
if len(sys.argv)!=4:raise SystemExit('usage: cover-registry.py BEFORE AFTER PREPARED')
def entries(path):
    doc=yaml.safe_load(Path(path).read_text());out={}
    for section in ('plugins','services'):
        for row in doc.get(section,[]):
            if not isinstance(row,dict):continue
            ident=row.get('id')
            if not isinstance(ident,str) or not ident or ident in out:raise ValueError('missing/duplicate registry ID')
            out[ident]=row
    return out
before=entries(sys.argv[1]);after=entries(sys.argv[2]);commit=json.loads(Path(sys.argv[3]).read_text())['source_commit']
if not isinstance(commit,str) or not re.fullmatch('[0-9a-f]{40}',commit):raise ValueError('prepared commit is not full SHA')
ref=lambda row:(row.get('derevo') or {}).get('ref')
changed=sorted(i for i in before.keys()|after.keys() if ref(before.get(i,{}))!=ref(after.get(i,{})))
if not changed:raise ValueError('changed derevo.ref records: 0, wrong candidate/baseline')
bad=False
for ident in changed:
    d=after[ident]['derevo'];subdir=d['subdir'];repo=d['address']
    if not isinstance(subdir,str) or PurePosixPath(subdir).is_absolute() or '..' in PurePosixPath(subdir).parts:raise ValueError('invalid subdir '+ident)
    raw=subprocess.check_output(['git','-c','safe.directory='+repo,'-C',repo,'ls-tree','-r','--name-only','-z',commit+':'+subdir])
    tree=set(raw.decode('utf-8').removesuffix('\0').split('\0')) if raw else set()
    have={x['remote'] for x in d.get('files',[])}|set(d.get('not_installed',[]))|{x['remote'] for x in d.get('links',[])}
    if not tree or any(not isinstance(x,str) or not x for x in have):raise ValueError('empty/unreadable coverage '+ident)
    missing=sorted(tree-have);extra=sorted(have-tree);bad=bad or bool(missing or extra)
    print(f'ПОКРЫТИЕ {ident}: {len(tree&have)} из {len(tree)}, лишнего {len(extra)}, пропало {len(missing)}; commit={commit}; subdir={subdir}; ref={d["ref"]}')
    if missing or extra:print(json.dumps({'id':ident,'не_учтено':missing,'лишнее':extra},ensure_ascii=False))
raise SystemExit(1 if bad else 0)
