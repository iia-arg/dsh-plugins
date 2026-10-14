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
import tempfile,subprocess,shutil,os,json,sys

with tempfile.TemporaryDirectory(prefix='b2023-watch-state-',dir='/var/tmp') as td:
 t=Path(td);t.chmod(0o755);b=t/'bin';b.mkdir();reason=t/'reason';reason.write_text('');
 (b/'vladelec-tg-id').write_text('#!/bin/sh\nif [ -s "$PROBE_REASON" ]; then cat "$PROBE_REASON" >&2; exit 2; fi; echo 712345678\n')
 (b/'tell-komu').write_text('#!/usr/bin/python3\nimport json,sys,os\nfrom pathlib import Path\nprint("A2A_PROOF "+json.dumps({"uid":os.getuid(),"body":Path(sys.argv[1]).read_text()}));raise SystemExit(int(os.environ.get("PROBE_MAIL_FAILURE","0")))\n')
 (b/'logger').write_text('#!/bin/sh\nprintf "JOURNAL %s\\n" "$*"\n')
 for p in b.iterdir():p.chmod(0o755)
 ns=t/'ns.py';ns.write_text("import subprocess,sys,json\nfrom pathlib import Path\nt=Path(sys.argv[1]);e=json.loads((t/'env.json').read_text());subprocess.run(['mount','--bind',str(t/'bin'),'/usr/local/bin'],check=True);r=subprocess.run(['env',*[k+'='+v for k,v in e.items()],sys.argv[2]]);sys.exit(r.returncode)\n")
 env={'PATH':str(b)+':/usr/bin:/bin','LC_ALL':'C.UTF-8','PROBE_REASON':str(reason),'VLADELEC_WATCH_STATE_DIR':str(t/'state')}
 def run(label,text,copies,code):
  reason.write_text(text);(t/'env.json').write_text(json.dumps(env));p=subprocess.run(['sudo','-n','unshare','-m','--propagation','private','python3',str(ns),str(t),str(repo/'packages/dsh-storozha-sadik/libexec/vladelec-tg-id-watch')],capture_output=True,text=True,timeout=15)
  proofs=[json.loads(l[10:]) for l in p.stdout.splitlines() if l.startswith('A2A_PROOF ')];assert (p.returncode,len(proofs))==(code,copies),(label,p.stdout,p.stderr);print('PASS',label,flush=True);return proofs
 try:
  run('healthy','',0,0);run('first missing','нет файла',1,2);run('same cause quiet','нет файла',0,2);run('cause change','права 666',1,2);proof=run('restored once','',1,0);assert 'восстановлено' in proof[0]['body'];run('healthy again','',0,0)
  run('missing again','нет файла',1,2)
  s=t/'state/vladelec-tg-id.json';old=json.loads(subprocess.check_output(['sudo','-n','cat',str(s)],text=True));old['at']-=21600;subprocess.run(['sudo','-n','python3','-c','import json,sys;from pathlib import Path;Path(sys.argv[1]).write_text(sys.argv[2])',str(s),json.dumps(old)],check=True)
  run('six hour reminder','нет файла',1,2);run('reminder not repeated','нет файла',0,2)
  subprocess.run(['sudo','-n','python3','-c','from pathlib import Path;import sys;Path(sys.argv[1]).write_text("{")',str(s)],check=True)
  run('broken state still probes owner','нет файла',1,2)
  run('repaired state stops repeat','нет файла',0,2)
  run('recovery after repaired state','',1,0)
 finally:subprocess.run(['sudo','-n','rm','-rf','--',str(t/'state')],check=True)
