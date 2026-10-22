#!/usr/bin/python3
"""Read-only public certificate/consumer checks. The existing watchdog owns alerts."""
import argparse,json,os
from pathlib import Path
import ssl,stat,subprocess,time

MAIL='autopilot-mail.service'
COPY='autopilot-copy.service'


def inspect(certificate,warn_days,startup_grace):
    out={'certificate_state':'','certificate_detail':'','copy_state':'','copy_detail':''}
    try:
        st=certificate.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022 or st.st_size>16384:
            raise ValueError('certificate metadata')
        result=subprocess.run(['/usr/bin/openssl','x509','-enddate','-noout','-in',str(certificate)],capture_output=True,text=True,timeout=3,env=dict(os.environ,LC_ALL='C'))
        if result.returncode or not result.stdout.startswith('notAfter=') or len(result.stdout)>256:
            raise ValueError('not_after unavailable')
        stamp=result.stdout.strip().removeprefix('notAfter=')
        seconds=ssl.cert_time_to_seconds(stamp)-time.time()
        out['certificate_detail']=str(certificate)+': not_after='+stamp+'; warn_days='+str(warn_days)
        if seconds<=0:out['certificate_state']='cert_expired'
        elif seconds<=warn_days*86400:out['certificate_state']='cert_expiring'
    except (OSError,ValueError,subprocess.SubprocessError):
        out['certificate_state']='cert_unmeasured'
        out['certificate_detail']=str(certificate)+': certificate/not_after not measured'
    try:
        result=subprocess.run(['/usr/bin/systemctl','show','--property=Id','--property=LoadState','--property=ActiveState','--property=ActiveEnterTimestampMonotonic','--',MAIL,COPY],capture_output=True,text=True,timeout=3)
        if result.returncode or len(result.stdout)>8192:raise ValueError('unit source')
        units={}
        for block in result.stdout.strip().split('\n\n'):
            fields={}
            for line in block.splitlines():
                key,sep,value=line.partition('=')
                if not sep or key in fields:raise ValueError('unit fields')
                fields[key]=value
            if set(fields)!={'Id','LoadState','ActiveState','ActiveEnterTimestampMonotonic'} or fields['Id'] in units:
                raise ValueError('unit identity')
            units[fields['Id']]=fields
        if set(units)!={MAIL,COPY}:raise ValueError('unit scope')
        mail=units[MAIL];copy=units[COPY]
        known={'active','inactive','activating','deactivating','failed','reloading','maintenance','refreshing'}
        if mail['ActiveState'] not in known or copy['ActiveState'] not in known:raise ValueError('unknown unit state')
        if mail['LoadState']!='loaded' or copy['LoadState']!='loaded':
            out['copy_state']='copy_unit_missing'
            out['copy_detail']=MAIL+' / '+COPY+': required unit not loaded'
        elif mail['ActiveState']=='active' and copy['ActiveState']!='active':
            since=int(mail['ActiveEnterTimestampMonotonic'])/1000000
            age=time.monotonic()-since
            if since<=0 or age<0:raise ValueError('unit time')
            if age>startup_grace:
                out['copy_state']='copy_not_active'
                out['copy_detail']=MAIL+' active but '+COPY+' '+copy['ActiveState']+'; startup_grace_seconds='+str(startup_grace)
            else:out['copy_detail']=COPY+': bounded startup grace '+str(startup_grace)+' seconds'
        else:out['copy_detail']=MAIL+'='+mail['ActiveState']+'; '+COPY+'='+copy['ActiveState']
    except (OSError,ValueError,subprocess.SubprocessError):
        out['copy_state']='copy_unmeasured';out['copy_detail']=MAIL+' / '+COPY+': live unit state not measured'
    return out


def main():
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--certificate',type=Path,default=Path('/etc/autopilot-mail/server.pem'))
    parser.add_argument('--warn-days',type=int,default=14)
    parser.add_argument('--startup-grace-seconds',type=int,default=30)
    args=parser.parse_args()
    if not 1<=args.warn_days<=365 or not 0<=args.startup_grace_seconds<=300:parser.error('invalid numeric threshold')
    out=inspect(args.certificate,args.warn_days,args.startup_grace_seconds)
    print(json.dumps(out,ensure_ascii=False))
    if 'unmeasured' in (out['certificate_state']+out['copy_state']):return 2
    return int(bool(out['certificate_state'] or out['copy_state']))


if __name__=='__main__':raise SystemExit(main())
