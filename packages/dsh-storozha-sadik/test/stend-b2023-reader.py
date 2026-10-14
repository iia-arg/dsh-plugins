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
import subprocess,tempfile,json,datetime,sys,os
reader=repo/'packages/dsh-storozha-sadik/bin/vladelec-tg-id';rows=[]
with tempfile.TemporaryDirectory(prefix='b2023-reader-') as td:
 t=Path(td);d=t/'config';d.mkdir();f=d/'id';f.write_text('712345678\n');subprocess.run(['sudo','-n','chown','-R','0:0',str(d)],check=True);subprocess.run(['sudo','-n','chmod','755',str(d)],check=True)
 def run(label,want,path=f,args=[]):
  p=subprocess.run(['env','VLADELEC_TG_ID_FILE='+str(path),str(reader),*args],capture_output=True,text=True,timeout=5);assert p.returncode==want,(label,p.stdout,p.stderr);assert (p.stdout=='712345678\n' and not p.stderr) if want==0 else (not p.stdout and p.stderr.strip());rows.append({'name':label,'code':p.returncode});print(label,p.returncode)
 run('healthy',0);subprocess.run(['sudo','-n','mv',str(f),str(d/'saved')],check=True);run('missing',2);subprocess.run(['sudo','-n','mv',str(d/'saved'),str(f)],check=True);run('restored',0)
 for content,label in [('', 'empty'),('712345678\n12345\n','two-lines'),('1234\n','short'),('1234567890123456\n','long'),('abcde\n','non-digit'),('712345678 \n','space')]:
  subprocess.run(['sudo','-n','python3','-c','from pathlib import Path;import sys;Path(sys.argv[1]).write_text(sys.argv[2])',str(f),content],check=True);run(label,2)
 subprocess.run(['sudo','-n','python3','-c','from pathlib import Path;import sys;Path(sys.argv[1]).write_text("712345678\\n")',str(f)],check=True);run('content-restored',0)
 subprocess.run(['sudo','-n','chmod','666',str(f)],check=True);run('mode666',2);subprocess.run(['sudo','-n','chmod','644',str(f)],check=True);run('mode-restored',0)
 subprocess.run(['sudo','-n','chown',str(os.getuid() or 65534),str(f)],check=True);run('non-root-file',2);subprocess.run(['sudo','-n','chown','0',str(f)],check=True);run('owner-restored',0)
 link=t/'link';link.symlink_to(f);run('file-symlink',2,link);link.unlink();link.symlink_to(d,target_is_directory=True);run('directory-symlink',2,link/'id');link.unlink()
 subprocess.run(['sudo','-n','chmod','777',str(d)],check=True);run('directory-writable',2);subprocess.run(['sudo','-n','chmod','755',str(d)],check=True);run('directory-restored',0);run('arguments',2,args=['--help'])
 subprocess.run(['sudo','-n','rm','-rf','--',str(d)],check=True)
(r/'evidence/READER.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':rows},indent=2)+'\n')
