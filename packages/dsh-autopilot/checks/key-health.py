#!/usr/bin/python3
"""Read-only, nonroot health reader for ROOT key-check result; never opens key.
Timer60s; max accepted age180s. Reader: registry list--health / registry-watchdog.
0 last real check healthy,1 failed/inactive,2 missing/stale/unreadable.
No side effects or alerts; systemctl queries bounded5s each.
"""
import subprocess,time,sys,re

def classify(timer,props,now):
 if timer!='active':return 1
 expected={'User':'root','Group':'root','Type':'oneshot','FragmentPath':'/etc/systemd/system/dsh-autopilot-key-check.service','DropInPaths':''}
 if any(props.get(k)!=v for k,v in expected.items()):return 2
 start=props.get('ExecStart','')
 if start.count('{')!=1 or start.count('}')!=1 or not re.search(r'\{\s*path=/usr/bin/python3\s*;',start) or not re.search(r';\s*ignore_errors=no\s*;',start):return 2
 if 'argv[]=' not in start or '; ignore_errors=' not in start:return 2
 argv=start.split('argv[]=',1)[1].split('; ignore_errors=',1)[0].strip()
 if argv!='/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/key-check.py':return 2
 try:
  finished=int(props['ExecMainExitTimestampMonotonic'])/1e6
  if finished<=0 or not 0<=now-finished<=180:return 2
  if props['ExecMainCode']!='1':return 2
  return 0 if props['ExecMainStatus']=='0' else 1
 except (KeyError,ValueError):return 2

def main():
 if len(sys.argv)!=1:print('BLIND: no arguments supported',file=sys.stderr);return 2
 try:
  p=subprocess.run(['systemctl','is-active','dsh-autopilot-key-check.timer'],capture_output=True,text=True,timeout=5)
  q=subprocess.run(['systemctl','show','dsh-autopilot-key-check.service','-p','ExecMainCode','-p','ExecMainStatus','-p','ExecMainExitTimestampMonotonic','-p','User','-p','Group','-p','Type','-p','FragmentPath','-p','DropInPaths','-p','ExecStart'],capture_output=True,text=True,timeout=5)
  if q.returncode or p.returncode not in (0,3):return 2
  code=classify(p.stdout.strip(),dict(x.split('=',1) for x in q.stdout.splitlines() if '=' in x),time.clock_gettime(time.CLOCK_MONOTONIC))
 except (OSError,subprocess.TimeoutExpired):code=2
 print({0:'KEY CHECK healthy, fresh',1:'KEY CHECK failed/inactive',2:'KEY CHECK not proven/stale'}[code]);return code
if __name__=='__main__':sys.exit(main())
