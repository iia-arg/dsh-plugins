#!/usr/bin/env python3
# B-N-2023: actual candidate sources, private root settings, fake external IO only.
import atexit,os,subprocess,sys,tempfile,shutil
from pathlib import Path
if subprocess.run(['sudo','-n','true'],capture_output=True).returncode != 0:
 print('СЛЕПОТА: нужен sudo для приватного root-файла и mount namespace');sys.exit(2)
repo=Path(os.environ.get('B2023_REPO',Path(__file__).resolve().parents[3]))
r=Path(tempfile.mkdtemp(prefix='b2023-evidence-'));(r/'evidence').mkdir()
atexit.register(lambda: subprocess.run(['sudo','-n','rm','-rf','--',str(r)],check=False))
from pathlib import Path
import tempfile,subprocess,shutil,os,json,datetime
pkg=repo/'packages/dsh-storozha-sadik';rows=[]
with tempfile.TemporaryDirectory(prefix='b2023-watch-',dir='/var/tmp') as td:
 t=Path(td);t.chmod(0o755);b=t/'bin';b.mkdir();lib=t/'libexec';lib.mkdir();cfg=t/'config';cfg.mkdir();f=cfg/'id';f.write_text('712345678\n');subprocess.run(['sudo','-n','chown','-R','0:0',str(cfg)],check=True);subprocess.run(['sudo','-n','chmod','755',str(cfg)],check=True)
 shutil.copy2(pkg/'bin/vladelec-tg-id',b/'vladelec-tg-id');shutil.copy2(pkg/'libexec/vladelec-tg-id-watch',lib/'vladelec-tg-id-watch');shutil.copy2(pkg/'sbin/sadik-watch',t/'caller.sh')
 (b/'tell-komu').write_text('#!/usr/bin/python3\nFAIL_MARKER='+repr(str(t/'mail-failure'))+'\nimport os,sys,json\nfrom pathlib import Path\np=Path(sys.argv[1]);assert p.name.startswith("dlya-zabavy-");print("A2A_PROOF "+json.dumps({"uid":os.getuid(),"body":p.read_text(),"home":os.environ.get("DSH_HOME")}));sys.exit(int(Path(FAIL_MARKER).read_text()) if Path(FAIL_MARKER).exists() else 0)\n');(b/'tell-komu').chmod(0o755)
 (b/'logger').write_text('#!/bin/bash\nprintf "JOURNAL_PROOF %s\\n" "$*"\n');(b/'logger').chmod(0o755)
 # Execute actual candidate caller up to next independent subsystem; no host snapshot/alerts.
 hook=t/'breakpoint';hook.write_text("trap 'case \"$BASH_COMMAND\" in ZAPASNOJ_ADRESAT=*) echo PROBE_STOP_BEFORE_SNAPSHOT; exit 0;; esac' DEBUG\n")
 (t/'ns.py').write_text("import subprocess,os,sys,json\nfrom pathlib import Path\nt=Path(sys.argv[1]);c=json.loads((t/'run.json').read_text());subprocess.run(['mount','--bind',str(t/'bin'),'/usr/local/bin'],check=True);subprocess.run(['mount','--bind',str(t/'libexec'),'/usr/local/libexec'],check=True);p=subprocess.run(['env',*[k+'='+v for k,v in c.items()],'bash',str(t/'caller.sh')]);sys.exit(p.returncode)\n")
 for phase in ['healthy','missing','restored','mail-failed','muted','empty-override']:
  if phase in ['missing','mail-failed']:subprocess.run(['sudo','-n','mv',str(f),str(cfg/'saved')],check=True)
  if phase=='mail-failed':(t/'mail-failure').write_text('3')
  if phase=='restored':subprocess.run(['sudo','-n','mv',str(cfg/'saved'),str(f)],check=True)
  env={'PATH':str(b)+':/usr/bin:/bin','HOME':str(t),'LC_ALL':'C.UTF-8','BASH_ENV':str(hook),'SADIK_WATCH_MESTNO':'1','SADIK_ALERT_BIN':'/bin/false','SADIK_WATCH_SOST':str(t/'state'),'VLADELEC_TG_ID_FILE':str(f),'PROBE_MAIL_FAILURE':'3' if phase=='mail-failed' else '0','VLADELEC_WATCH_STATE_DIR':str(t/'state')};
  if phase=='muted':env['SADIK_VLADELEC_WATCH_BIN']='/bin/true'
  if phase=='empty-override':env['SADIK_VLADELEC_WATCH_BIN']=''
  (t/'run.json').write_text(json.dumps(env));p=subprocess.run(['sudo','-n','unshare','-m','--propagation','private','python3',str(t/'ns.py'),str(t)],capture_output=True,text=True,timeout=15);out=p.stdout+p.stderr;(r/'evidence'/f'WATCH-{phase}.log').write_text(out);assert (p.returncode==2 and 'пустой SADIK_VLADELEC_WATCH_BIN' in out) if phase=='empty-override' else (p.returncode==0 and 'PROBE_STOP_BEFORE_SNAPSHOT' in out),out;proofs=[json.loads(l.split('A2A_PROOF ',1)[1]) for l in out.splitlines() if l.startswith('A2A_PROOF ')];assert len(proofs)==(1 if phase in ['missing','mail-failed','restored'] else 0),out
  if proofs:assert proofs[0]['uid']==996 and proofs[0]['home']=='/opt/iskra/.dsh' and ('восстановлено' if phase=='restored' else 'vladelec-tg-id отказал') in proofs[0]['body']
  if phase=='mail-failed':assert 'письмо Забаве НЕ положено' in out
  rows.append({'phase':phase,'callerCode':p.returncode,'a2aCopies':len(proofs),'actualSenderUid':proofs[0]['uid'] if proofs else None,'scope':'actual copied caller prefix, DEBUG breakpoint before snapshot; mock tell boundary, no external mail/TG'});print(rows[-1])
 subprocess.run(['sudo','-n','rm','-rf','--',str(cfg),str(t/'state')],check=True)
(r/'evidence/WATCH.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':rows},ensure_ascii=False,indent=2)+'\n')
