#!/usr/bin/env python3
"""Run catalogue of a forward update window (0.1.8+): fence, bootstrap, check, compare, probe, return.

The base install.sh does not bootstrap /var/lib/dsh-autopilot; ap-run-inventory.py bootstrap needs
the rollback window's fence. A forward window therefore holds its OWN bounded fence (systemd freeze of
the operator units inside a transient holder whose stop thaws them, RuntimeMaxSec bounds it) and calls
the run_catalog.bootstrap primitive of the installed shelf with the census taken in this window.
Fence evidence is read at the moment of every bootstrap/compare with the SAME primitives the rollback
window uses (lib/operator_window.py: profile, unit_snapshot, check_binding, group_pids, operator_census).
Census acceptance = the census() criterion below; its SHA is printed into the window step log.
Unknown state is a refusal (code 2); a negative comparison is code 1.
"""
import argparse,hashlib,json,os,pwd,re,stat,subprocess,sys,time
from pathlib import Path

NAMES={'run.lock','legacy.json','bootstrap.json','applicability.json','runs'}
N_OSTATOK=120  # seconds of fence that must remain at bootstrap/compare (B04 scan ~35 s, A10, B05 ~2 min follow)
MO_STATE=Path(os.environ.get('MO_STATE_DIR','/var/lib/montazh-okna'))

def die(msg,code=2):print('ОТКАЗ: '+msg,file=sys.stderr);raise SystemExit(code)
def ctl(*a,check=True):
    q=subprocess.run(['systemctl','--system',*a],capture_output=True,text=True,timeout=30)
    if check and q.returncode:die('systemctl '+' '.join(a)+': '+q.stderr.strip())
    return q
def show(unit,prop):return ctl('show',unit,'-p',prop,'--value').stdout.strip()
def load(name,path):
    import importlib.util
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def catalog(kod):return load('okno_catalog',Path(kod)/'runtime/run_catalog.py')
def window(kod):return load('okno_operator_window',Path(kod)/'lib/operator_window.py')
def boot():return Path('/proc/sys/kernel/random/boot_id').read_text().strip()
def census(path):
    d=json.loads(Path(path).read_bytes())
    act=[r['runId'] for r in d['runs'] if r['active']];pins=[r['path'] for r in d['records'] if r.get('potentialProductionPin')]
    if d.get('complete') is not True or d.get('errors')!=[] or act or pins:
        die('census не годен: complete=%s errors=%d active=%s prodpins=%d'%(d.get('complete'),len(d.get('errors') or []),act,len(pins)))
    return d
def mode(p):s=os.lstat(p);return (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),stat.S_IFMT(s.st_mode))
def span(text):
    parts=re.findall(r'(\d+(?:\.\d+)?)(us|ms|s|min|h|d)\b',text)
    if not parts or ''.join(a+b for a,b in parts)!=text.replace(' ',''):die('предел держателя не прочитан: '+repr(text))
    return sum(float(a)*{'us':1e-6,'ms':1e-3,'s':1,'min':60,'h':3600,'d':86400}[b] for a,b in parts)

def zapis_read(path):
    s=os.lstat(path)
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600:die('квитанция ограды не root 0600: '+str(path))
    return json.loads(Path(path).read_bytes())

def dokaz(h,zap,w,p,need):
    """Fence evidence NOW: holder alive with >= need seconds left; each operator unit frozen, same identity,
    no extra process in its cgroup; operator_census finds no operator-UID process outside the units."""
    if show(h,'ActiveState')!='active':die('ограда снята: держатель '+h+' = '+show(h,'ActiveState'))
    if not os.path.lexists(zap):die('держатель жив, квитанции ограды нет: '+str(zap))
    rec=zapis_read(zap)
    if rec.get('holder')!=h or rec.get('boot')!=boot():die('квитанция не этой ограды/загрузки')
    if [r['unit'] for r in rec['units']]!=list(p['units']) or rec.get('uid')!=p['uid']:die('квитанция не того профиля оператора')
    predel=span(show(h,'RuntimeMaxUSec'))
    if predel!=rec['predel']:die('предел держателя %s != квитанции %s'%(predel,rec['predel']))
    left=predel-(time.monotonic()-int(show(h,'ExecMainStartTimestampMonotonic'))/1e6)
    if left<need:die('до предела ограды осталось %d с < %d'%(left,need))
    try:
        for r in rec['units']:
            w.check_binding(r,p['uid'],frozen=True)
            if w.group_pids(r['cgroup'])!={r['pid']}:raise ValueError('WINDOW_OPERATOR_HAS_CHILDREN: '+r['unit'])
        pids=w.operator_census(p,rec['units'])
    except (OSError,ValueError,KeyError) as exc:die('ограда не доказана: '+str(exc))
    return int(left),pids

def ograda(a,w,p):
    h=a.edinica;zap=Path(a.zapis)
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,60}\.service',h):die('имя держателя: <имя>.service')
    if a.dejstvie=='vkl':
        if show(h,'ActiveState')=='failed':ctl('reset-failed',h,check=False)  # прежний предел истёк: держатель снят, разморозка была в ExecStopPost
        if show(h,'ActiveState') not in ('inactive',''):die('держатель уже есть: '+h)
        if os.path.lexists(zap):
            if zapis_read(zap).get('holder')!=h:die('чужая квитанция: '+str(zap))
            os.unlink(zap)  # своя от истёкшей ограды
        try:
            rows=[w.unit_snapshot(u,p['uid']) for u in p['units']]
            for r in rows:
                w.check_binding(r,p['uid'],frozen=False)
                if w.group_pids(r['cgroup'])!={r['pid']}:raise ValueError('WINDOW_OPERATOR_HAS_CHILDREN: '+r['unit'])
            w.operator_census(p,rows)
        except (OSError,ValueError,KeyError) as exc:die('до ограды: '+str(exc))
        q=subprocess.run(['systemd-run','--system','--quiet','--unit='+h,'--property=Type=exec','--property=RuntimeMaxSec='+str(a.predel),
                          '--property=ExecStopPost=/usr/bin/systemctl thaw '+' '.join(p['units']),'/usr/bin/sleep','infinity'],capture_output=True,text=True,timeout=30)
        if q.returncode:die('держатель не запущен: '+q.stderr.strip())
        try:
            for r in rows:
                ctl('freeze',r['unit']);until=time.monotonic()+3
                while True:
                    try:w.check_binding(r,p['uid'],frozen=True);break
                    except ValueError:
                        if time.monotonic()>until:raise
                        time.sleep(.05)
            fd=os.open(zap,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'w') as f:json.dump(dict(schema=1,holder=h,predel=float(a.predel),boot=boot(),uid=p['uid'],units=rows),f)
            left,pids=dokaz(h,zap,w,p,0)
        except BaseException as exc:
            ctl('stop',h,check=False)
            if os.path.lexists(zap):os.unlink(zap)
            if isinstance(exc,SystemExit):raise
            die('ограда не включилась: '+str(exc))
        print('OGRADA_VKL %s predel=%ss ostalos=%ds pids=%s %s'%(h,a.predel,left,pids,' '.join(r['unit']+'=frozen' for r in rows)))
    elif a.dejstvie=='vykl':
        ctl('stop',h,check=False);bad=[u+'='+show(u,'FreezerState') for u in p['units'] if show(u,'FreezerState')!='running']
        if bad:die('после снятия ограды не running: '+' '.join(bad))
        if os.path.lexists(zap):os.unlink(zap)
        print('OGRADA_VYKL '+h+' '+' '.join(u+'=running' for u in p['units']))
    else:
        left,pids=dokaz(h,zap,w,p,a.ostatok)
        print('OGRADA_DERZHIT %s ostalos=%ds pids=%s'%(h,left,pids))

def hod(w,p):
    """Ход единиц оператора ДО ограды: в cgroup каждой (с подгруппами — operator_window.group_pids) только MainPID.
    Ребёнок (у шлюза — codex app-server на время хода) = идёт ход: ждать и повторить, не поломка."""
    busy=[]
    for u in p['units']:
        try:pids=w.group_pids(show(u,'ControlGroup'));main=int(show(u,'MainPID') or 0)
        except (OSError,ValueError) as exc:die('cgroup '+u+': '+str(exc))
        if not main or pids!={main}:busy.append('%s main=%d pids=%s'%(u,main,sorted(pids)))
    if busy:print('HOD_IDET '+'; '.join(busy));raise SystemExit(1)
    print('HOD_NET '+' '.join(u+'=1' for u in p['units']))

def okno(path,kod,*,otkryto=True):
    ident=Path(path).read_text().strip()
    if not re.fullmatch('[0-9a-f]{32}',ident):die('ID окна в '+str(path)+' не 32 hex')
    if not otkryto:return ident
    rec=json.loads((MO_STATE/(ident+'.json')).read_bytes())
    now=time.clock_gettime_ns(time.CLOCK_BOOTTIME)
    if rec.get('id')!=ident or rec.get('phase')!='open' or rec.get('boot_id')!=boot() or not rec['opened_ns']<=now<rec['deadline_ns']:
        die('окно монтажа %s не открыто сейчас (phase=%s)'%(ident,rec.get('phase')))
    shelf='file:'+str(Path(kod).resolve())+'/'
    if not any(s.startswith(shelf) for s in rec.get('subjects',[])):die('окно %s не про полку %s'%(ident,kod))
    return ident

def prava(base,kod,quiet=False):
    m=pwd.getpwnam('master');g=m.pw_gid;R=stat.S_IFREG;D=stat.S_IFDIR
    want={'.':(0,0,0o755,D),'run.lock':(0,g,0o660,R),'runs':(0,g,0o770,D),'runs/catalog.json':(m.pw_uid,g,0o640,R),
          'legacy.json':(0,0,0o444,R),'bootstrap.json':(0,0,0o644,R),'applicability.json':(0,0,0o644,R)}
    bad=[k+' '+str(mode(base/k))+' != '+str(v) for k,v in want.items() if mode(base/k)!=v]
    extra=sorted(set(os.listdir(base))-NAMES)+['runs/'+x for x in sorted(set(os.listdir(base/'runs'))-{'catalog.json'})]
    if bad or extra:die('права/состав каталога: '+'; '.join(bad+['лишнее '+x for x in extra]))
    st=json.loads((base/'applicability.json').read_text())
    if st.get('status')!='applicable':die('applicability: '+str(st.get('status')))
    code='import importlib.util,sys;s=importlib.util.spec_from_file_location("c",sys.argv[1]);c=importlib.util.module_from_spec(s);s.loader.exec_module(c)\nwith c.Catalog(c.Path(sys.argv[2])) as k:print(len(k.data["runs"]),k.data["revision"])'
    q=subprocess.run(['setpriv','--reuid='+str(m.pw_uid),'--regid='+str(g),'--init-groups','/usr/bin/python3','-I','-B','-c',code,str(Path(kod)/'runtime/run_catalog.py'),str(base)],capture_output=True,text=True,timeout=30)
    if q.returncode:die('master не открыл каталог: '+q.stderr.strip()[-300:])
    if not quiet:print('PRAVA_OK master: runs/revision '+q.stdout.strip()+'; '+' '.join(k+'='+format(v[2],'o') for k,v in want.items()))
    return q.stdout.split()

def bootstrap(a,base,w,p):
    if os.path.lexists(base):die('каталог уже есть: '+str(base)+' — окно вперёд кладёт его с нуля')
    raw=Path(a.census).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=a.sha:die('сумма census не та')
    d=census(a.census);ident=okno(a.okno_fajl,a.kod)
    left,pids=dokaz(a.edinica,a.zapis,w,p,N_OSTATOK)
    print('CENSUS_PRINYAT sha256=%s runs=%d records=%d (критерий katalog-okno.census)'%(a.sha,len(d['runs']),len(d['records'])))
    print('OGRADA_DO ostalos=%ds pids=%s'%(left,pids))
    stamp=catalog(a.kod).bootstrap(base,Path(a.root),Path(a.census),a.sha,window_id=ident)
    left2,pids2=dokaz(a.edinica,a.zapis,w,p,0)
    runs,rev=prava(base,a.kod,quiet=True)
    if int(runs)!=0:die('строк каталога %s при census без закреплений'%runs)
    print('BOOTSTRAP_OK catalogId=%s windowId=%s runs=%s ograda_posle ostalos=%ds pids=%s'%(stamp['catalogId'],stamp['windowId'],runs,left2,pids2))

def key(d):
    return dict(runs=sorted((r['runId'],bool(r['active'])) for r in d['runs']),records=sorted(r['path'] for r in d['records']),
                pins=sorted(r['path'] for r in d['records'] if r.get('potentialProductionPin')),dirs=d.get('ownerAutopilotDirs'))
def sravnit(a,w,p):
    left,pids=dokaz(a.edinica,a.zapis,w,p,N_OSTATOK)
    x=census(a.census);y=json.loads(Path(a.scan).read_bytes())
    if y.get('complete') is not True or y.get('errors')!=[]:die('повторный scan не полон: complete=%s'%y.get('complete'))
    kx,ky=key(x),key(y);diff=[k for k in kx if kx[k]!=ky[k]]
    print('ograda ostalos=%ds pids=%s · runs %d/%d records %d/%d pins %d/%d'%(left,pids,len(kx['runs']),len(ky['runs']),len(kx['records']),len(ky['records']),len(kx['pins']),len(ky['pins'])))
    if diff:
        for k in diff:
            for v in (sorted(set(map(str,kx[k] or []))^set(map(str,ky[k] or []))) if isinstance(kx[k],list) else [str(kx[k])+' -> '+str(ky[k])])[:10]:print('  РАЗНИЦА '+k+': '+v)
        print('CENSUS_RAZOSHLIS '+','.join(diff));raise SystemExit(1)
    print('CENSUS_SOVPAL')

def proba(a,base):
    m=pwd.getpwnam('master');before=json.loads((base/'runs/catalog.json').read_bytes())
    if before['runs']:die('в каталоге уже есть закрепления — проба не идёт')
    proj=Path(a.proekt)
    if not proj.is_dir() or mode(proj)[:2]!=(m.pw_uid,m.pw_gid) or os.path.lexists(proj/'.autopilot'):die('проект пробы: пустой каталог master')
    worker='import os,subprocess,sys;e=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));sys.exit(subprocess.run(sys.argv[1:],env=e).returncode)'
    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':str(proj),'AUTOPILOT_AGENT':'master','AUTOPILOT_PUBLIC_ROOT':a.public,'AUTOPILOT_NO_UPDATE_CHECK':'1','PYTHONDONTWRITEBYTECODE':'1'}
    def call(*args):
        return subprocess.run(['setpriv','--reuid='+str(m.pw_uid),'--regid='+str(m.pw_gid),'--clear-groups','/usr/bin/python3','-B','-c',worker,'/usr/bin/python3','-B',a.ap,'--no-serve',*args],cwd=proj,env=env,capture_output=True,text=True,timeout=60)
    q=call('init','--slug',a.metka)
    if q.returncode:die('init: '+(q.stdout+q.stderr).strip()[-400:])
    mid=json.loads((base/'runs/catalog.json').read_bytes())['runs']
    if len(mid)!=1 or list(mid.values())[0]['status']!='active':die('после init закрепление не одно active: '+json.dumps(mid))
    run,row=list(mid.items())[0]
    q=call('finish','--result','okno-proba')
    after=json.loads((base/'runs/catalog.json').read_bytes())
    if q.returncode or after['runs']:die('finish не снял закрепление: rc=%d runs=%s %s'%(q.returncode,after['runs'],(q.stdout+q.stderr).strip()[-300:]))
    print('PROBA_INIT_OK run=%s release=%s pin=active->снят revision %d->%d'%(run,row['release'],before['revision'],after['revision']))

def vozvrat(a,base):
    if not os.path.lexists(base):print('VOZVRAT_NECHEGO каталога нет');return
    ident=okno(a.okno_fajl,None,otkryto=False)
    top=set(os.listdir(base));sub=set(os.listdir(base/'runs')) if os.path.isdir(base/'runs') else set()
    if top-NAMES or sub-{'catalog.json'}:die('в каталоге чужое: '+' '.join(sorted(top-NAMES)+['runs/'+x for x in sorted(sub-{'catalog.json'})]))
    st=json.loads((base/'bootstrap.json').read_bytes())
    if st.get('windowId')!=ident:die('каталог положен не этим окном: windowId '+str(st.get('windowId')))
    import fcntl
    fd=os.open(base/'run.lock',os.O_RDWR|os.O_NOFOLLOW)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:die('каталог занят (RUN_CATALOG_BUSY)')
        runs=json.loads((base/'runs/catalog.json').read_bytes())['runs']
        if runs:die('в каталоге закрепления a17: '+','.join(sorted(runs))+' — возврат окна обновления не годен, это окно отката',2)
        gone=[]
        for n in ['applicability.json','runs/catalog.json','legacy.json','bootstrap.json']:
            if os.path.lexists(base/n):os.unlink(base/n);gone.append(n)
        os.rmdir(base/'runs');gone.append('runs/');os.unlink(base/'run.lock');gone.append('run.lock')
    finally:os.close(fd)
    os.rmdir(base);gone.append(str(base))
    print('VOZVRAT_UDALEN '+' '.join(gone))

def main():
    p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);p.add_argument('--root',default='/')
    s=p.add_subparsers(dest='cmd',required=True)
    def fence(x):x.add_argument('--kod',required=True);x.add_argument('--edinica',required=True);x.add_argument('--zapis',required=True)
    o=s.add_parser('ograda');o.add_argument('dejstvie',choices=['vkl','vykl','proverit']);fence(o);o.add_argument('--predel',type=int,default=900);o.add_argument('--ostatok',type=int,default=N_OSTATOK)
    b=s.add_parser('bootstrap');fence(b);[b.add_argument(x,required=True) for x in ('--census','--sha','--okno-fajl')]
    r=s.add_parser('prava');r.add_argument('--kod',required=True)
    c=s.add_parser('sravnit');fence(c);c.add_argument('--census',required=True);c.add_argument('--scan',required=True)
    t=s.add_parser('proba-init');[t.add_argument(x,required=True) for x in ('--ap','--proekt','--public','--metka')]
    v=s.add_parser('vozvrat');v.add_argument('--okno-fajl',required=True)
    hd=s.add_parser('hod');hd.add_argument('--kod',required=True)
    a=p.parse_args()
    if os.geteuid()!=0:die('нужен root')
    base=Path(a.root)/'var/lib/dsh-autopilot'
    if a.cmd in ('ograda','bootstrap','sravnit','hod'):
        w=window(a.kod)
        try:prof=w.profile(Path(a.root))
        except (OSError,ValueError,KeyError) as exc:die('профиль оператора: '+str(exc))
    if a.cmd=='ograda':
        if a.predel<5 or a.predel>1800:die('предел ограды 5..1800 с')
        ograda(a,w,prof)
    elif a.cmd=='bootstrap':bootstrap(a,base,w,prof)
    elif a.cmd=='prava':prava(base,a.kod)
    elif a.cmd=='sravnit':sravnit(a,w,prof)
    elif a.cmd=='hod':hod(w,prof)
    elif a.cmd=='proba-init':proba(a,base)
    else:vozvrat(a,base)

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as exc:die(type(exc).__name__+': '+str(exc))
