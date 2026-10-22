#!/usr/bin/python3
"""Read-only acceptance of seven persistent notice workers, despite filtered PID1 logs."""
import argparse,hashlib,json,math,os,re,subprocess,sys,time
from pathlib import Path
ACCOUNTS=('master','vintik','shpuntik','gayka','shurup','sova','tumbler')
UNITS=tuple('autopilot-mail-notice@'+x+'.service' for x in ACCOUNTS)
FIELDS=('Id','ActiveState','SubState','Type','User','MainPID','InvocationID','ExecMainStartTimestampMonotonic','ExecStart')


def validate(rows,worker,after,previous=None):
    by_id={x.get('Id'):x for x in rows}
    if len(rows)!=7 or set(by_id)!=set(UNITS):raise ValueError('UNPROVEN: need exactly seven named workers')
    identities={}
    for account,unit in zip(ACCOUNTS,UNITS):
        r=by_id[unit]
        if (r.get('ActiveState'),r.get('SubState'),r.get('Type'),r.get('User'))!=('active','running','simple',account):raise ValueError('worker not running as expected: '+unit)
        pid=int(r.get('MainPID','0'));stamp=int(r.get('ExecMainStartTimestampMonotonic','0'));inv=r.get('InvocationID','')
        if pid<=0 or stamp<=after*1e6 or not re.fullmatch('[0-9a-f]{32}',inv) or worker not in r.get('ExecStart',''):raise ValueError('UNPROVEN: worker identity/source: '+unit)
        identities[unit]=(pid,stamp,inv)
    if previous is not None and identities!=previous:raise ValueError('RESTART_DETECTED: more than seven activations in acceptance interval')
    return identities


def snapshot():
    args=['systemctl','show',*UNITS]
    for field in FIELDS:args+=['-p',field]
    q=subprocess.run(args,capture_output=True,text=True,timeout=2,check=True)
    return [dict(x.split('=',1) for x in block.splitlines() if '=' in x) for block in q.stdout.strip().split('\n\n')]


def main():
    p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    p.add_argument('--worker',type=Path,required=True);p.add_argument('--after',type=float,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if os.geteuid()!=0:p.error('run as the appointed root operator')
    if not math.isfinite(a.after) or a.after<=0:p.error('need a finite positive monotonic installation mark')
    if not re.fullmatch('/opt/autopilot/notices/[0-9a-f]{64}/mail-notice-loop.py',str(a.worker)) or a.worker.resolve()!=a.worker:p.error('need physical pinned notice worker')
    if hashlib.sha256(a.worker.read_bytes()).hexdigest()!=a.worker.parent.name:p.error('worker SHA does not match its shelf')
    if not a.output.is_absolute() or a.output.exists() or a.output.is_symlink():p.error('need a new absolute evidence file')
    samples=[];started=time.monotonic();last=started;identity=None;result={'status':'UNPROVEN','requestedSeconds':600,'units':UNITS,'worker':str(a.worker),'samples':samples}
    try:
        while True:
            rows=snapshot();now=time.monotonic()
            if now-last>=4:raise ValueError('UNPROVEN: observation gap reached four seconds')
            current=validate(rows,str(a.worker),a.after,identity)
            for pid,stamp,inv in current.values():
                if str(a.worker).encode() not in (Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0'):raise ValueError('UNPROVEN: PID does not execute accepted worker')
            if identity is None:identity=current
            samples.append({'at':now,'identities':current});last=now
            if now-started>=600:break
            time.sleep(min(1,600-(now-started)))
        result.update(status='PASS',elapsedSeconds=last-started,activations=7,method='seven fresh identities, PID/start timestamp/InvocationID invariant; max gap below inactive timer5s')
    except BaseException as error:
        result.update(status='UNPROVEN',elapsedSeconds=time.monotonic()-started,reason=type(error).__name__+': '+str(error))
    with a.output.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
    print(result['status']+': notice ten-minute identity observation')
    return 0 if result['status']=='PASS' else 2


if __name__=='__main__':raise SystemExit(main())
