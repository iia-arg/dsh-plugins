#!/usr/bin/python3
"""Create/return only the directory inventory of this window; never recurse-delete."""
import argparse,fcntl,hashlib,json,os,re,runpy,stat,subprocess,sys,tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
LIMIT=256

def atomic(path,value):
    fd,tmp=tempfile.mkstemp(prefix='.directories-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:
            json.dump(value,out,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
    finally:
        Path(tmp).unlink(missing_ok=True)

def private_dir(path):
    s=path.lstat()
    if path.resolve()!=path or not stat.S_ISDIR(s.st_mode) or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(0,0,0o700):
        raise ValueError('unsafe private directory: '+str(path))

def parents(path,root):
    if path==root or not path.is_relative_to(root):raise ValueError('outside target root: '+str(path))
    for parent in path.parents:
        s=parent.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise ValueError('unsafe directory parent: '+str(parent))
        if parent==root:break

def load(save):
    if os.geteuid()!=0:raise ValueError('root operator required')
    private_dir(save)
    safe=runpy.run_path(str(HERE/'registry-inverse-decision.py'))['safe_file']
    prepared=json.loads(safe(save/'PREPARED.json'));raw=safe(save/'DIRECTORIES.plan.json')
    if hashlib.sha256(raw).hexdigest()!=prepared['directories_plan_sha256']:raise ValueError('directory plan SHA differs')
    plan=json.loads(raw);root=Path(prepared['root'])
    roots=[root/prepared['shelf'].lstrip('/'),*[root/t.lstrip('/') for t in prepared['core_new_trees']]]
    if not isinstance(plan,list) or not 0<len(plan)<=LIMIT or len(set(plan))!=len(plan):raise ValueError('invalid directory plan size/duplicates')
    for name in plan:
        p=Path(name)
        if not isinstance(name,str) or not p.is_absolute() or '..' in p.parts or str(p)!=name or not any(p==r or p.is_relative_to(r) for r in roots):raise ValueError('directory outside new trees: '+str(name))
    if plan!=sorted(plan,key=lambda n:(len(Path(n).parts),n)):raise ValueError('unordered directory plan')
    return prepared,safe,plan,root

def journal(save,safe,plan):
    path=save/'DIRECTORIES.created.json'
    data=json.loads(safe(path))
    if not isinstance(data,dict) or set(data)!={'schema','plan_sha256','created'} or data['schema']!=1 or data['plan_sha256']!=hashlib.sha256(safe(save/'DIRECTORIES.plan.json')).hexdigest():raise ValueError('invalid directory journal')
    entries=data['created']
    if not isinstance(entries,list) or len(entries)>len(plan):raise ValueError('invalid created entries')
    seen=set()
    for e in entries:
        if not isinstance(e,dict) or set(e)!={'path','dev','ino'} or e['path'] not in plan or e['path'] in seen or any(type(e[k]) is not int or e[k]<0 for k in ('dev','ino')):raise ValueError('invalid created identity')
        seen.add(e['path'])
    if [e['path'] for e in entries]!=plan[:len(entries)]:raise ValueError('journal must be a created prefix of plan')
    return data

def identity(path,entry,root):
    parents(path,root);s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_dev,s.st_ino)!=(0,0,0o755,entry['dev'],entry['ino']):raise ValueError('directory identity/owner/mode differs: '+str(path))

def guard(save,prepared,safe,plan,root,empty):
    data=journal(save,safe,plan);entries={e['path']:e for e in data['created']}
    existing=set()
    for name in plan:
        p=Path(name)
        if not os.path.lexists(p):continue
        if name not in entries:raise ValueError('unrecorded directory exists: '+name)
        identity(p,entries[name],root);existing.add(name)
    if empty:
        for name in existing:
            for child in Path(name).iterdir():
                if str(child) not in existing:raise ValueError('unexpected directory content: '+str(child))
    return data,existing

def window_task(prepared):
    # Тот же task, что --punkt групп монтажа: prepare-window пишет 'AP'+c_new в PREPARED.json.
    task=prepared.get('task')
    if not isinstance(task,str) or not re.fullmatch(r'AP[0-9]+',task):raise ValueError('PREPARED.json task missing/invalid')
    return task

def open_directories(save,state,actor):
    prepared,safe,plan,root=load(save);private_dir(state)
    if state.parent!=save.parent:raise ValueError('STATE/SAVE must share a private parent')
    if os.path.lexists(state/'forward.id') or os.path.lexists(save/'DIRECTORIES.created.json'):raise ValueError('directories already opened; inspect receipt')
    # Refuse existing targets before admitting the window; no empty-directory adoption.
    if any(os.path.lexists(p) for p in plan):raise ValueError('planned directory already exists')
    args=['/usr/local/sbin/montazh-okno','podgotovit','--rows',str(save/'native-preflight/group-0.tsv'),'--registry',prepared['registry'],'--plan',str(save/'forward.native.json'),'--task',window_task(prepared),'--actor',actor]
    ident=subprocess.check_output(args,text=True,timeout=60).strip()
    if not re.fullmatch('[0-9a-f]{32}',ident):raise ValueError('invalid admitted window ID')
    # ID survives a mkdir failure, so the normal inverse route remains available.
    fd=os.open(state/'forward.id',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(ident+'\n');f.flush();os.fsync(f.fileno())
    data={'schema':1,'plan_sha256':prepared['directories_plan_sha256'],'created':[]}
    atomic(save/'DIRECTORIES.created.json',data)
    native=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='ap017_directory_clock')['main'].__globals__
    board=Path(os.environ.get('MO_STATE_DIR','/var/lib/montazh-okna'))
    for name in plan:
        rec=native['validate'](native['read'](board,ident+'.json'),ident+'.json')
        if rec['phase']!='open' or native['close_time'](rec) is None:raise ValueError('window no longer open/unexpired')
        p=Path(name);parents(p,root)
        p.mkdir(mode=0o700)
        # Private until exact metadata has been set; capture identity after mkdir.
        os.chown(p,0,0);p.chmod(0o755);s=p.lstat()
        data['created'].append({'path':name,'dev':s.st_dev,'ino':s.st_ino})
        atomic(save/'DIRECTORIES.created.json',data)
    guard(save,prepared,safe,plan,root,True)
    print('DIRECTORIES_CREATED '+str(len(plan))+'; id='+ident)

def main():
    p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    p.add_argument('--save',type=Path,required=True);p.add_argument('--state',type=Path);p.add_argument('--actor');p.add_argument('action',choices=['open','check','check-empty','remove','removed'])
    a=p.parse_args();prepared,safe,plan,root=load(a.save)
    # Serialize helper invocations. Root-owned parents prevent unprivileged replacement.
    lock=a.save/'directories.lock'
    fd=os.open(lock,os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:
        if os.fstat(f.fileno()).st_uid!=0 or os.fstat(f.fileno()).st_mode&0o077:raise ValueError('unsafe directory lock')
        fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if a.action=='open':
            if a.state is None or a.actor is None:raise ValueError('open requires state and actor')
            open_directories(a.save,a.state,a.actor);return
        data,existing=guard(a.save,prepared,safe,plan,root,a.action!='check')
        if a.action=='removed' and existing:raise ValueError('recorded directories remain')
        if a.action=='remove':
            byname={e['path']:e for e in data['created']}
            for name in reversed(plan):
                if name not in existing:continue
                path=Path(name);identity(path,byname[name],root)
                if any(path.iterdir()):raise ValueError('directory no longer empty: '+name)
                path.rmdir()
            guard(a.save,prepared,safe,plan,root,True)
        print('DIRECTORIES_'+a.action.upper().replace('-','_')+'_PASS '+str(len(existing)))

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:
        print('DIRECTORIES_REFUSED '+type(e).__name__+': '+str(e),file=sys.stderr);raise SystemExit(2)
