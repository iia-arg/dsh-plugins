"""Bounded legacy operator window: freeze, idle and before/after UID census.

The ROOT-only controller is separate from rollback. No existing unit FILES or
accepted core bytes change. Temporary runtime services and cgroup state are
owned by this window; cleanup never guesses another owner's freezer state.
"""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import signal
import stat
import subprocess
import sys
import time
import uuid

PACKAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PACKAGE/'runtime'))
import run_catalog as C

MAX_SECONDS=180
CLEANUP_DEADLINE=None
SAFE_PATH=re.compile(r'/[A-Za-z0-9_./-]*\Z')
UNIT_ID=re.compile(r'[0-9a-f]{32}\Z')
PROPS=('Id','LoadState','ActiveState','MainPID','ControlGroup','User','InvocationID','FreezerState','CollectMode','ExecMainStartTimestampMonotonic')


def control(argv,*,timeout=5,check=True):
    if CLEANUP_DEADLINE is not None:
        timeout=min(timeout,CLEANUP_DEADLINE-time.monotonic())
        if timeout<=0:raise ValueError('WINDOW_CLEANUP_DEADLINE')
    env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8'}
    q=subprocess.run(argv,env=env,capture_output=True,text=True,timeout=timeout)
    if check and q.returncode:raise ValueError('WINDOW_CONTROL_REFUSED: '+q.stderr[:500])
    return q


def unit(name):
    q=control(['systemctl','--system','show',name,'--property='+','.join(PROPS)],timeout=3)
    value=dict(line.split('=',1) for line in q.stdout.splitlines() if '=' in line)
    if value.get('Id')!=name:raise ValueError('WINDOW_UNIT_ID_UNPROVEN')
    return value


def identity(pid):
    base=Path('/proc')/str(pid)
    raw=(base/'stat').read_text();tail=raw[raw.rfind(')')+2:].split()
    uidline=next(x for x in (base/'status').read_text().splitlines() if x.startswith('Uid:'))
    return dict(pid=pid,start=tail[19],uids=list(map(int,uidline.split()[1:])),state=tail[0],
                cgroup=next(x[3:] for x in (base/'cgroup').read_text().splitlines() if x.startswith('0::')))


def cg(path):
    if not path.startswith('/') or '..' in Path(path).parts:raise ValueError('WINDOW_CGROUP_PATH_UNPROVEN')
    result=Path('/sys/fs/cgroup')/path.lstrip('/')
    if str(result.resolve())!=str(result):raise ValueError('WINDOW_CGROUP_LINK_REFUSED')
    return result


def cg_events(path):
    return dict(line.split() for line in (cg(path)/'cgroup.events').read_text().splitlines())


def profile(root):
    account=pwd.getpwnam('master')
    if root==Path('/'):
        return dict(units=['master.service','coder-gateway-master.service'],uid=account.pw_uid,processScope='all-uid')
    value=C.unjson(C.read_file(root/'operator-window-fixture.json',uid=0,mode=0o600))
    if (not isinstance(value,dict) or set(value)-{'schemaVersion','scopeId','units','processScope','hod','logger'} or value.get('schemaVersion')!=1
            or not UNIT_ID.fullmatch(value.get('scopeId','')) or value.get('processScope')!='fixture-cgroups'
            or not isinstance(value.get('units'),list) or len(value['units'])!=2 or len(set(value['units']))!=2
            or any(not re.fullmatch('stend-ap-rollback-fixture-'+value['scopeId']+r'-[a-z0-9]+\.service',name) for name in value['units'])):
        raise ValueError('WINDOW_FIXTURE_PROFILE_INVALID')
    for key in ('hod','logger'):
        path=Path(value[key]);C.read_file(path,uid=0)
        if not path.is_relative_to(root) or not SAFE_PATH.fullmatch(str(path)):
            raise ValueError('WINDOW_FIXTURE_PATH_INVALID')
    return dict(value,uid=account.pw_uid)


def unit_snapshot(name,uid):
    value=unit(name)
    if value.get('LoadState')!='loaded' or value.get('ActiveState')!='active' or not value.get('ControlGroup'):
        raise ValueError('WINDOW_OPERATOR_UNIT_UNAVAILABLE: '+name)
    if pwd.getpwnam(value['User']).pw_uid!=uid:raise ValueError('WINDOW_OPERATOR_UID_UNPROVEN')
    process=identity(int(value['MainPID']));directory=cg(value['ControlGroup']);s=directory.stat()
    if process['uids']!=[uid]*4 or process['cgroup']!=value['ControlGroup']:
        raise ValueError('WINDOW_OPERATOR_PROCESS_UNPROVEN')
    return dict(unit=name,pid=process['pid'],start=process['start'],invocation=value['InvocationID'],
                cgroup=value['ControlGroup'],device=s.st_dev,inode=s.st_ino,mountNamespace=os.readlink('/proc/'+str(process['pid'])+'/ns/mnt'),owned=False)


def check_binding(row,uid,*,frozen):
    fresh=unit_snapshot(row['unit'],uid)
    if any(fresh[k]!=row[k] for k in ('pid','start','invocation','cgroup','device','inode','mountNamespace')):
        raise ValueError('WINDOW_OPERATOR_IDENTITY_CHANGED: '+row['unit'])
    actual=unit(row['unit'])
    expected='frozen' if frozen else 'running'
    if actual['FreezerState']!=expected or cg_events(row['cgroup']).get('frozen')!=('1' if frozen else '0'):
        raise ValueError('WINDOW_FREEZER_NOT_OBSERVED: '+row['unit'])


def operator_census(p,rows):
    expected={row['pid']:row for row in rows};groups=[r['cgroup'] for r in rows];found={}
    for path in Path('/proc').iterdir():
        if not path.name.isdecimal():continue
        try:
            value=identity(int(path.name))
        except (FileNotFoundError, ProcessLookupError):continue
        if p['uid'] not in value['uids']:continue
        if p['processScope']=='fixture-cgroups' and not any(value['cgroup']==g or value['cgroup'].startswith(g+'/') for g in groups):continue
        found[value['pid']]=value
    if set(found)!=set(expected) or any(found[k]['start']!=expected[k]['start'] for k in found):
        raise ValueError('WINDOW_OPERATOR_CHILD_OR_EXTERNAL_PID: '+json.dumps(found,sort_keys=True))
    return sorted(found)


def base(root):return root/'var/lib/dsh-autopilot'


def receipt_path(root,key):return base(root)/'operator-windows'/(key+'.json')


def read_receipt(root):
    pointer=C.unjson(C.read_file(base(root)/'operator-window-active.json',uid=0,mode=0o600))
    key=pointer.get('id','') if isinstance(pointer,dict) else ''
    if not UNIT_ID.fullmatch(key):raise ValueError('OPERATOR_WINDOW_UNPROVEN: no active owner')
    value=C.unjson(C.read_file(receipt_path(root,key),uid=0,mode=0o600))
    if not isinstance(value,dict) or value.get('id')!=key or value.get('root')!=str(root):raise ValueError('OPERATOR_WINDOW_UNPROVEN: wrong owner/root')
    return value


def assert_fenced(root):
    """Read physical evidence; receipt words alone never admit a rollback."""
    root=Path(root)
    try:
        value=read_receipt(root);p=profile(root)
        if (value.get('phase')!='fenced' or value['boot']!=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
                or not 0<=time.monotonic()-value['started']<MAX_SECONDS):
            raise ValueError('window not fenced/current')
        job=unit(value['job'])
        main=identity(value['pid'])
        if (job['MainPID']!=str(value['pid']) or job['ActiveState']!='active'
                or job['CollectMode']!='inactive'
                or main['start']!=value['start'] or main['uids']!=[0]*4 or main['state'] in ('Z','X','T')):
            raise ValueError('window supervisor not observed')
        caller=identity(os.getpid())['cgroup'];group=job['ControlGroup']
        if caller!=group and not caller.startswith(group+'/'):raise ValueError('caller outside owned window job')
        for row in value['units']:
            check_binding(row,p['uid'],frozen=True)
            if group_pids(row['cgroup'])!={row['pid']}:raise ValueError('operator cgroup has an extra process')
        process_ids=operator_census(p,value['units'])
        return dict(id=value['id'],job=value['job'],operatorPids=process_ids,permissionGate='freeze-and-sampled-uid-census',root=str(root))
    except (OSError,ValueError,KeyError,TypeError,StopIteration) as exc:
        raise ValueError('OPERATOR_WINDOW_UNPROVEN: '+str(exc)) from exc


def lock_window(root):
    C._root_dir(base(root));fd=os.open(base(root)/'operator-window.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    s=os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600:
        os.close(fd);raise ValueError('WINDOW_LOCK_UNSAFE')
    try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BaseException:os.close(fd);raise
    return fd


def save(root,value):C.atomic(receipt_path(root,value['id']),value,0o600,(0,0))


def group_pids(group):
    directory=cg(group);result=set()
    for path in [directory,*[p for p in directory.rglob('*') if p.is_dir()]]:
        result.update(int(x) for x in (path/'cgroup.procs').read_text().split())
    return result


def prepare(root,key,release):
    import release_rollback as R
    p=profile(root)
    if root!=Path('/'):os.environ['HOD_SYSTEMCTL']=p['hod']
    plan=R.inspect_selection(root,release)
    folder=base(root)/'operator-windows';C._root_dir(folder,0o700)
    pointer=base(root)/'operator-window-active.json'
    if pointer.exists():
        prior=C.unjson(C.read_file(pointer,uid=0,mode=0o600))
        if prior.get('id'):raise ValueError('WINDOW_ALREADY_OWNED: '+prior['id'])
    rows=[unit_snapshot(name,p['uid']) for name in p['units']]
    if root==Path('/') and any(row['mountNamespace']!=os.readlink('/proc/self/ns/mnt') for row in rows):raise ValueError('RUN_INVENTORY_UNPROVEN: operator filesystem namespace outside census')
    for row in rows:
        check_binding(row,p['uid'],frozen=False)
        if group_pids(row['cgroup'])!={row['pid']}:raise ValueError('WINDOW_OPERATOR_HAS_CHILDREN')
    operator_census(p,rows)
    R.master_idle(root)
    if root==Path('/'):
        cron=control(['crontab','-u','master','-l'],check=False)
        if cron.returncode!=1 or 'no crontab for master' not in cron.stderr:raise ValueError('WINDOW_OPERATOR_CRONTAB_UNPROVEN')
    own=identity(os.getpid());job=('ap-rollback-window-' if root==Path('/') else 'stend-ap-rollback-window-')+key+'.service'
    if unit(job).get('MainPID')!=str(os.getpid()) or own['uids']!=[0]*4 or own['cgroup']!=unit(job)['ControlGroup']:
        raise ValueError('WINDOW_EXECUTOR_NOT_OWN_UNIT')
    value=dict(schemaVersion=1,id=key,root=str(root),job=job,pid=os.getpid(),start=own['start'],
               boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),started=int(unit(job)['ExecMainStartTimestampMonotonic'])/1000000,
               phase='prepared',units=rows,target=release,manifestSha256=plan['manifest_sha'])
    if not 0<value['started']<=time.monotonic():raise ValueError('WINDOW_START_TIME_UNPROVEN')
    save(root,value);C.atomic(pointer,dict(id=key),0o600,(0,0))
    return value,plan,p


def execute(root,key,release,report,accepted_sha):
    """Runs ONLY as the own transient root service main process."""
    import release_rollback as R
    fd=lock_window(root);value=None
    try:
        value,plan,p=prepare(root,key,release)
        for row in value['units']:
            row['freezeIntent']=True;save(root,value)  # durable BEFORE the freezer command
            control(['systemctl','--system','freeze',row['unit']])
            until=time.monotonic()+3
            while True:
                try:check_binding(row,p['uid'],frozen=True);break
                except ValueError:
                    if time.monotonic()>=until:raise
                    time.sleep(.025)
            row['owned']=True;save(root,value)
        for row in value['units']:
            if group_pids(row['cgroup'])!={row['pid']}:raise ValueError('WINDOW_OPERATOR_HAS_CHILDREN')
        value['processesBefore']=operator_census(p,value['units']);R.master_idle(root)
        value['phase']='fenced';save(root,value)
        os.close(fd);fd=None
        assert_fenced(root)
        legacy=R.legacy_runtimes(plan)
        if legacy and (not report or not accepted_sha):raise ValueError('RUN_INVENTORY_UNPROVEN: fresh accepted census required for this window')
        if report:
            C.bootstrap(base(root),root,Path(report),accepted_sha,window_id=key)
        env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8',
             'DESTDIR':str(root),'PYTHONDONTWRITEBYTECODE':'1'}
        if root!=Path('/'):env['HOD_SYSTEMCTL']=p['hod']
        if MAX_SECONDS-(time.monotonic()-value['started'])<70:raise ValueError('WINDOW_INSUFFICIENT_TIME_BEFORE_ROLLBACK')
        q=subprocess.run(['/usr/bin/bash',str(PACKAGE/'install.sh'),'--rollback',release],
                         env=env,capture_output=True,text=True,timeout=65)
        try:value['processesAfter']=operator_census(p,value['units'])
        except ValueError as exc:
            value.update(phase='execution-unproven',commandRc=q.returncode,processError=str(exc));save(root,value);raise
        value['phase']='execution-ended';value['commandRc']=q.returncode
        value['stdout']=q.stdout;value['stderr']=q.stderr;save(root,value)
        print(q.stdout,end='');print(q.stderr,end='',file=sys.stderr)
        return q.returncode
    finally:
        if fd is not None:os.close(fd)
        # Stop-post runs after the owned mutation children have stopped.


def cleanup(root,key):
    """Called by systemd after KillMode=control-group; failed evidence keeps fence."""
    global CLEANUP_DEADLINE
    CLEANUP_DEADLINE=time.monotonic()+45  # stop-post outer bound60, reserve15s
    fd=lock_window(root);owned_receipt=False
    try:
        path=receipt_path(root,key)
        if not path.exists():return 0  # preparation refused before taking ownership
        value=read_receipt(root)
        if value['id']!=key:raise ValueError('WINDOW_NOT_OWNED')
        owned_receipt=True
        job=unit(value['job']);group=job.get('ControlGroup','')
        own=identity(os.getpid())
        if not group or own['cgroup']!=group or group_pids(group)!={os.getpid()}:
            raise ValueError('WINDOW_MUTATION_CHILDREN_NOT_GONE')
        p=profile(root)
        for row in value['units']:
            intended=bool(row.get('owned') or row.get('freezeIntent'))
            actual=unit(row['unit'])
            if intended:
                check_binding(row,p['uid'],frozen=actual.get('FreezerState')=='frozen')
            else:
                check_binding(row,p['uid'],frozen=False)
        # A refused transaction may leave the ORIGINAL legacy core selected.
        # Its temporary census must not look applicable once the fence opens.
        state=base(root)/'applicability.json'
        if state.exists():
            status=C.unjson(C.read_file(state,uid=0,mode=0o644))
            if status.get('status')=='applicable':
                selected=os.readlink(root/'opt/autopilot/current')
                if not selected.startswith('releases/') or not C.RELEASE.fullmatch(selected[9:]):
                    raise ValueError('WINDOW_SELECTED_RUNTIME_UNPROVEN')
                meta=C.unjson(C.read_file(root/'opt/autopilot'/selected/'release.json',uid=0))
                if type(meta.get('run_inventory_protocol')) is not int or meta.get('run_inventory_protocol')!=1:
                    with C.Catalog(base(root),timeout=max(0,min(3,CLEANUP_DEADLINE-time.monotonic()))) as catalog:
                        catalog.invalidate(selected[9:],key,selected_already=True)
        try:value['processesAfterCleanup']=operator_census(p,value['units'])
        except ValueError as exc:value['cleanupCensusError']=str(exc)
        value['transactionStatus']='confirmed' if value.get('commandRc')==0 and value.get('processesAfter') is not None and not value.get('processError') and not value.get('cleanupCensusError') else 'unproven'
        value['phase']='releasing';save(root,value)  # no further admission during thaw
        for row in value['units']:
            if row.get('owned') or row.get('freezeIntent'):
                control(['systemctl','--system','thaw',row['unit']])
                check_binding(row,p['uid'],frozen=False)
        value['phase']='closed';value['closedAt']=C.now();save(root,value)
        C.atomic(base(root)/'operator-window-active.json',dict(id=None),0o600,(0,0))
        return 0 if value['transactionStatus']=='confirmed' else 2
    except BaseException as exc:
        try:
            if owned_receipt and read_receipt(root)['id']==key:
                value.update(phase='needs-inspection',cleanupError=str(exc));save(root,value)
        except (OSError,ValueError):pass
        raise
    finally:
        os.close(fd);CLEANUP_DEADLINE=None


def launch(root,release,report=None,accepted_sha=None):
    root=C.physical(root)
    if not SAFE_PATH.fullmatch(str(root)):raise ValueError('WINDOW_ROOT_PATH_INVALID')
    if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
    import release_rollback as R
    R.inspect_selection(root,release)  # no unit/freeze for unknown/current/corrupt selection
    p=profile(root);helper=PACKAGE/'tools/ap-rollback-window.py'
    if not SAFE_PATH.fullmatch(str(helper)):raise ValueError('WINDOW_HELPER_PATH_INVALID')
    # A root service must never execute mutable source from an agent's checkout.
    for path in [PACKAGE,*PACKAGE.parents]:
        s=path.stat()
        if s.st_uid!=0 or (s.st_mode&0o022 and not s.st_mode&stat.S_ISVTX):
            raise ValueError('WINDOW_PACKAGE_NOT_ROOT_PROTECTED')
    C.read_file(helper,uid=0)
    C._root_dir(base(root));key=uuid.uuid4().hex
    name=('ap-rollback-window-' if root==Path('/') else 'stend-ap-rollback-window-')+key+'.service'
    command=['systemd-run','--system','--quiet','--wait','--pipe','--unit='+name,
             '--property=Type=exec','--property=KillMode=control-group','--property=RuntimeMaxSec=180',
             '--property=TimeoutStopSec=60','--property=CollectMode=inactive',
             '--property=ExecStopPost=/usr/bin/python3 -I -B '+str(helper)+' _cleanup --root '+str(root)+' --id '+key]
    if root!=Path('/'):
        command+=['--property=BindReadOnlyPaths='+p['logger']+':/usr/bin/logger']
    command+=['/usr/bin/python3','-I','-B',str(helper),'_execute',release,'--root',str(root),'--id',key]
    if report:command+=['--report',str(C.physical(report)),'--accepted-sha256',accepted_sha]
    try:q=control(command,timeout=330,check=False)
    except subprocess.TimeoutExpired:
        control(['systemctl','--system','stop',name],timeout=125,check=False)
        raise ValueError('WINDOW_JOB_TIMEOUT: inspect '+name)
    print(q.stdout,end='');print(q.stderr,end='',file=sys.stderr)
    path=receipt_path(root,key)
    value=C.unjson(C.read_file(path,uid=0,mode=0o600)) if path.exists() else None
    if (isinstance(value,dict) and value.get('phase')=='closed') or value is None:
        control(['systemctl','--system','reset-failed',name],check=False)
    return q.returncode if q.returncode else (0 if value and value.get('phase')=='closed' and value.get('transactionStatus')=='confirmed' else 2)
