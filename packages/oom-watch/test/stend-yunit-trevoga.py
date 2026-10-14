#!/usr/bin/env python3
"""Packaged unit -> recording channel; kernel/state/property commands are private.
--kanal is the expected absolute configured channel. It is ALWAYS replaced by a
fixture before executing the package watcher, never the installed ExecStart.
Parser covers literal single-line Environment; does not prove all systemd syntax.
"""
from pathlib import Path
import argparse,os,json,subprocess,sys,tempfile,shlex
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(allow_abbrev=False)
parser.add_argument('unit',nargs='?',type=Path,default=root/'systemd/oom-watch.service')
parser.add_argument('--kanal',default='/usr/local/bin/agent-alert')
a=parser.parse_args()
if not os.path.isabs(a.kanal):parser.error('--kanal requires an absolute path')
environment={};command=None;service=False
try:
 for raw in a.unit.read_text().splitlines():
  line=raw.strip()
  if line.startswith('['):service=line=='[Service]';continue
  if not service or not line or line.startswith(('#',';')):continue
  key,_,value=line.partition('=')
  if key=='ExecStart':command=value
  if key=='Environment':
   for item in shlex.split(value):
    name,sep,value=item.partition('=')
    if not sep:raise ValueError('Environment requires KEY=value')
    environment[name]=value
except (OSError,ValueError) as error:
 print('СЛЕПОТА: unit не прочитан или неподдержанная Environment');sys.exit(2)
errors=[]
if command!='/usr/local/bin/oom-watch':errors.append('ExecStart не /usr/local/bin/oom-watch')
if environment.get('OOM_WATCH_ALERT')!=a.kanal:errors.append('configured OOM_WATCH_ALERT differs from expected --kanal')
if errors:
 for error in errors:print('FAIL '+error)
 sys.exit(1)
with tempfile.TemporaryDirectory(prefix='oom-unit-channel-') as td:
 d=Path(td);b=d/'bin';b.mkdir();state=d/'state';state.mkdir();(state/'cursor').write_text('old')
 records=[
 {'MESSAGE':'oom-kill:constraint=CONSTRAINT_MEMCG,oom_memcg=/system.slice/proba-b1901.service,task_memcg=/system.slice/proba-b1901.service,task=probe,pid=4242,uid=0','_BOOT_ID':'a'*32,'__CURSOR':'c1'},
 {'MESSAGE':'Memory cgroup out of memory: Killed process 4242 (probe) total-vm:1000kB, anon-rss:900kB','_BOOT_ID':'a'*32,'__CURSOR':'c2'}]
 journal=b/'journalctl';journal.write_text('#!'+sys.executable+'\nimport json,sys\nfor record in '+repr(records)+':print(json.dumps(record))\n');journal.chmod(0o755)
 control=b/'systemctl';control.write_text('#!/bin/sh\nexit 0\n');control.chmod(0o755)
 sink=b/'fixture-channel';sink.write_text('#!'+sys.executable+'\nimport sys\nfrom pathlib import Path\nPath('+repr(str(d/'trace'))+').write_text(sys.stdin.read())\n');sink.chmod(0o755)
 # Never forward arbitrary unit Environment, PATH or state into the pass.
 env={'PATH':str(b)+':/usr/bin:/bin','OOM_WATCH_STATE':str(state),'OOM_WATCH_ALERT':str(sink),'OOM_WATCH_UNITS':environment.get('OOM_WATCH_UNITS',''),'PYTHONDONTWRITEBYTECODE':'1'}
 q=subprocess.run([sys.executable,str(root/'bin/oom-watch')],env=env,capture_output=True,text=True,timeout=30)
 text=(d/'trace').read_text() if (d/'trace').exists() else ''
 if q.returncode or 'proba-b1901.service' not in text:print('FAIL unit → recording channel');sys.exit(1)
 if (state/'cursor').read_text()!='c2':print('FAIL private cursor did not advance');sys.exit(1)
print('PASS unit configured channel → recording stub, private cursor')
