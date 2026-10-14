#!/usr/bin/env python3
import atexit
from pathlib import Path
import tempfile,subprocess
if subprocess.run(['sudo','-n','true'],capture_output=True).returncode != 0:
 print('СЛЕПОТА: нужен sudo для приватного mount namespace');raise SystemExit(2)
r=Path(tempfile.mkdtemp(prefix='b2023-receiver-proof-'));(r/'evidence').mkdir()
atexit.register(lambda: subprocess.run(['sudo','-n','rm','-rf','--',str(r)],check=False))
from pathlib import Path
import tempfile,subprocess,shutil,json,datetime
repo=Path(__file__).resolve().parents[3];pkg=repo/'packages/dsh-podpiski';standdir=pkg/'test';rows=[]
with tempfile.TemporaryDirectory(prefix='b2023-receiver-reg-',dir='/var/tmp') as td:
 t=Path(td);t.chmod(0o755);b=t/'bin';b.mkdir();shutil.copy2(repo/'packages/dsh-storozha-sadik/bin/vladelec-tg-id',b/'vladelec-tg-id');(b/'node').symlink_to('/opt/nodejs/node-v24.19.0-linux-x64/bin/node')
 # Exact copied candidate executors, fully guarded stand modes and private paths.
 env={'LC_ALL':'C.UTF-8','PATH':'/usr/bin:/bin','PRIYOMNIK_BIN':str(pkg/'sbin/sadik-komandy-priyomnik'),'SWITCH_BIN':str(pkg/'sbin/pereklyuchatel-podpiski'),'EXEC_BIN':str(pkg/'libexec/sadik-switch-exec'),'CODEX_BIN':str(pkg/'sbin/pereklyuchatel-codex')}
 ns=t/'ns.py';ns.write_text("import subprocess,sys,json\nfrom pathlib import Path\nt=Path(sys.argv[1]);e=json.loads((t/'env.json').read_text());subprocess.run(['mount','--bind',str(t/'bin'),'/usr/local/bin'],check=True);r=subprocess.run(['env',*[k+'='+v for k,v in e.items()],'python3',sys.argv[2]]);sys.exit(r.returncode)\n");(t/'env.json').write_text(json.dumps(env))
 for name in ['receiver-itog.py','receiver-switch.py']:
  with (r/'evidence'/('REG-'+name+'.log')).open('w') as log:p=subprocess.run(['sudo','-n','unshare','-m','--propagation','private','python3',str(ns),str(t),str(standdir/name)],stdout=log,stderr=subprocess.STDOUT,timeout=120)
  print((r/'evidence'/('REG-'+name+'.log')).read_text(),flush=True);rows.append({'name':name,'code':p.returncode});print(name,p.returncode,flush=True)
(r/'evidence/RECEIVER-REGRESSION.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':rows},indent=2)+'\n')

assert all(x['code']==0 for x in rows)
