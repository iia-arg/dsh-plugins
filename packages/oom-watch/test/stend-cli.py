#!/usr/bin/env python3
"""Run the actual watcher with temporary state and isolated journal/alert commands."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

p=argparse.ArgumentParser()
p.add_argument('root',type=Path)
p.add_argument('--baseline',action='store_true')
p.add_argument('--cursor-copy',type=Path)
p.add_argument('--report',type=Path)
a=p.parse_args()
seed=a.cursor_copy.read_bytes() if a.cursor_copy else b'fixture-old-cursor'
rows=[]
def digest(data):return hashlib.sha256(data).hexdigest()
with tempfile.TemporaryDirectory(prefix='oom-cli-trial-') as raw:
    d=Path(raw);bin_dir=d/'bin';bin_dir.mkdir()
    journal=bin_dir/'journalctl'
    journal.write_text('#!'+sys.executable+'''\nimport json,os,sys
from pathlib import Path
args=sys.argv[1:]
assert '_TRANSPORT=kernel' in args and '-k' not in args and '--no-pager' in args
kind='current' if '--show-cursor' in args else 'after'
if kind=='after':
    assert '--output=json' in args
    cur=[x.split('=',1)[1] for x in args if x.startswith('--after-cursor=')]
    assert len(cur)==1 and cur[0]==Path(os.environ['PROBE_EXPECTED']).read_text().strip()
with open(os.environ['PROBE_JOURNAL_TRACE'],'a') as f:f.write(kind+'\\n')
if kind=='current': print('-- cursor: fixture-current-cursor')
else: print(json.dumps({'MESSAGE':'ordinary kernel fixture','__CURSOR':'fixture-next-cursor'}))
''')
    journal.chmod(0o755)
    alert=bin_dir/'alert'
    alert.write_text('#!'+sys.executable+'''\nimport os,sys
assert not sys.argv[1:]
text=sys.stdin.read()
with open(os.environ['PROBE_ALERT_TRACE'],'a') as f:f.write(str(len(text))+'\\n')
''')
    alert.chmod(0o755)
    expected=d/'expected';expected.write_bytes(seed)
    base={'PATH':str(bin_dir)+':/usr/bin:/bin','OOM_WATCH_ALERT':str(alert),'OOM_WATCH_UNITS':'',
          'PROBE_EXPECTED':str(expected),'PYTHONDONTWRITEBYTECODE':'1'}
    def trial(name,args,want_code,scan=False,output=None,fresh=False):
        state=d/name/'state'
        cursor=state/'cursor'
        if not fresh:
            state.mkdir(parents=True);cursor.write_bytes(seed);cursor.chmod(0o600)
        before=digest(cursor.read_bytes()) if cursor.exists() else None
        trace=d/(name+'-journal');alerts=d/(name+'-alert')
        env={**base,'OOM_WATCH_STATE':str(state),'PROBE_JOURNAL_TRACE':str(trace),'PROBE_ALERT_TRACE':str(alerts)}
        q=subprocess.run([sys.executable,str(a.root/'bin/oom-watch'),*args],env=env,capture_output=True,text=True,timeout=5)
        after=digest(cursor.read_bytes()) if cursor.exists() else None
        calls=trace.read_text().splitlines() if trace.exists() else []
        ok=q.returncode==want_code and bool(calls)==scan and not alerts.exists()
        if scan:
            ok=ok and cursor.read_bytes()==(b'fixture-current-cursor' if fresh else b'fixture-next-cursor') and before!=after
        else:
            ok=ok and before==after and (not fresh or not state.exists())
        if output:ok=ok and output in q.stdout+q.stderr
        if want_code==2:ok=ok and 'неизвестный довод' in q.stderr and 'допустимые:' in q.stderr
        rows.append({'case':name,'args':args,'code':q.returncode,'expected':want_code,'pass':ok,
                     'cursor_sha_before':before,'cursor_sha_after':after,'journal_calls':calls,
                     'state_exists':state.exists(),'alert_called':alerts.exists(),
                     'stdout':q.stdout,'stderr':q.stderr.replace(raw,'<temporary>')})
        print(('PASS ' if ok else 'FAIL ')+name)
    trial('no-args-pass',[],0,scan=True)
    trial('first-run-pass',[],0,scan=True,fresh=True)
    for name,args in [('dry-run',['--dry-run']),('unknown',['--unrecognized']),('bare-value',['anything']),('empty',['']),
                      ('separator',['--']),('version-assignment',['--version=2']),('help-assignment',['--help=all'])]:
        trial(name,args,0 if a.baseline else 2,scan=a.baseline)
    trial('unknown-no-state',['--dry-run'],0 if a.baseline else 2,scan=a.baseline,fresh=True)
    # 3.1.4: номер выпуска — из CHANGELOG пакета этого стенда (первый заголовок «## X.Y.Z»), не литералом: 14.10 номер
    # поднят до 3.1.3, а литерал остался 3.1.2 — стенд краснел на исправном. Из дерева, а не из a.root: ночной обход
    # гоняет бой (/usr/local) — так он заодно ловит «бой отстал от выпуска дерева».
    import re as _re
    _vyp=_re.search(r'^## (\d+\.\d+\.\d+) ',(Path(__file__).resolve().parents[1]/'CHANGELOG.md').read_text(encoding='utf-8'),_re.M)
    if not _vyp: print('СЛЕПОТА: номер выпуска в CHANGELOG пакета не найден'); sys.exit(2)
    version='oom-watch '+('2.2.0' if a.baseline else _vyp.group(1))
    trial('version',['--version'],0,output=version)
    trial('version-no-state',['--version'],0,output=version,fresh=True)
    trial('help',['--help'],0,scan=a.baseline,output=None if a.baseline else '--version')
    trial('help-no-state',['--help'],0,scan=a.baseline,fresh=True)
    for name,args in [('unknown-before-version',['--bad','--version']),('unknown-after-version',['--version','--bad'])]:
        trial(name,args,0 if a.baseline else 2)
    trial('unknown-with-help',['--help','--bad'],0 if a.baseline else 2,scan=a.baseline)
    trial('known-combination',['--help','--version'],0,output=version)
    trial('repeated-version',['--version','--version'],0,output=version)
assert not Path(raw).exists()
report={'subject':str(a.root/'bin/oom-watch'),'baseline':a.baseline,'seed_cursor_sha256':digest(seed),'rows':rows,'temporary_removed':True,
        'boundary':'actual watcher file executed; state copied to temporary path; journal/system alert isolated; no live kernel journal'}
if a.report:a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(f'PASS {sum(x["pass"] for x in rows)}/{len(rows)}')
sys.exit(0 if all(x['pass'] for x in rows) else 1)
