#!/usr/bin/env python3
"""Real release installer on a disposable package/repo. Only fixed R is rebound.
No production control flow is mocked; failure cases interpose one failing syscall.
"""
import hashlib,json,os,pwd,shlex,stat,subprocess,sys,tempfile
from pathlib import Path

reader=Path(sys.argv[1]); case=sys.argv[2] if len(sys.argv)>2 else 'healthy'
assert case in ('healthy','mode_policy','copy_failure','publish_failure')
assert os.geteuid()==0,'root only: preserve a different file owner on our copy'
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(args,cwd=None):
    subprocess.run(args,cwd=cwd,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def tree(root):
    return {str(p.relative_to(root)):{'mode':stat.S_IMODE(p.lstat().st_mode),'uid':p.lstat().st_uid,'gid':p.lstat().st_gid,'sha':sha(p.read_bytes()) if p.is_file() else None} for p in sorted(root.rglob('*'))}
with tempfile.TemporaryDirectory(prefix='beta-B-N-1746-') as tmp:
    w=Path(tmp);repo=w/'repo';source=repo/'packages/proba';source.mkdir(parents=True)
    old=b'---\nname: old\ndescription: old content\n---\nOLD '+b'A'*8192+b'\n'
    new=b'---\nname: updated\ndescription: full content\n---\nNEW '+b'B'*16384+b'\n'
    manifest={'name':'beta-smv-atomic-probe','version':'1.0.0','files':['SKILL.md','a-new','zz-last.txt']}
    (source/'package.json').write_text(json.dumps(manifest)+'\n');(source/'SKILL.md').write_bytes(new)
    (source/'a-new').mkdir();(source/'a-new/first.txt').write_text('NEW-FIRST\n');(source/'zz-last.txt').write_text('NEW-LAST\n')
    run(['git','init','-q'],repo);run(['git','add','.'],repo);run(['git','-c','user.name=Beta','-c','user.email=beta@sadik','commit','-qm','B-N-1746 synthetic package'],repo)
    src=reader.read_bytes();needle=b'R=/opt/iskra/workspace/dsh-plugins\n';assert src.count(needle)==1
    bound=src.replace(needle,('R='+shlex.quote(str(repo))+'\n').encode()); tool=w/'smv-bound';tool.write_bytes(bound)
    print(json.dumps({'case':case,'reader':str(reader),'sourceSha':sha(src),'repoBindingOnly':True,'boundSha':sha(bound)}),flush=True)
    boj=w/'boj';boj.mkdir();(boj/'SKILL.md').write_bytes(old);(boj/'package.json').write_text('{"name":"old"}\n');(boj/'outside.txt').write_text('UNCHANGED\n')
    old_mode=0o664 if case=='mode_policy' else 0o640
    owner=pwd.getpwnam('varvara');os.chown(boj/'SKILL.md',owner.pw_uid,owner.pw_gid);os.chmod(boj/'SKILL.md',old_mode)
    os.chmod(boj/'package.json',0o600)
    snapshot=tree(boj); before=int(subprocess.check_output(['stat','-c','%i',str(boj/'SKILL.md')])); held=open(boj/'SKILL.md','rb')
    env=dict(os.environ,SMV_MONTAZH=str(w/'insurance'),SMF_RUKA='Beta <beta@sadik>')
    if case in ('copy_failure','publish_failure'):
        wrappers=w/'wrappers';wrappers.mkdir(); command='cp' if case=='copy_failure' else 'mv'
        if command=='cp':condition='[[ "${@: -2:1}" == */zz-last.txt ]]'
        else:condition='[[ "${@: -1}" == "$SMV_TEST_BOJ/zz-last.txt" ]]'
        body=f'#!/bin/bash\nif {condition}; then echo "INJECTED_{command.upper()}_FAILURE ${{@: -1}}" >&2; exit 77; fi\nexec /usr/bin/{command} "$@"\n'
        wrapper=wrappers/command;wrapper.write_text(body);wrapper.chmod(0o755)
        env['PATH']=str(wrappers)+os.pathsep+env['PATH'];env['SMV_TEST_BOJ']=str(boj)
        print(json.dumps({'fault':command,'wrapperSha':sha(wrapper.read_bytes()),'failures':1,'target':'zz-last.txt'}),flush=True)
    child=subprocess.run(['bash',str(tool),'HEAD','packages/proba',str(boj),'--v-boj','B-N-1746-PROBE'],env=env,capture_output=True,text=True,timeout=60)
    print(child.stdout,end='');print(child.stderr,end='')
    after=int(subprocess.check_output(['stat','-c','%i',str(boj/'SKILL.md')])); metadata=os.stat(boj/'SKILL.md');old_fd=held.read();held.close()
    errors=[]
    def require(ok,label):
        if not ok:errors.append(label)
    if case in ('healthy','mode_policy'):
        require(child.returncode==0,f'mount exit {child.returncode}')
        require(before!=after,'inode not replaced')
        require((metadata.st_uid,metadata.st_gid,stat.S_IMODE(metadata.st_mode))==(owner.pw_uid,owner.pw_gid,0o644),'old owner or tar mode lost')
        require((boj/'SKILL.md').read_bytes()==new,'new pathname has incomplete content')
        require(old_fd==old,'held old inode changed')
        require(stat.S_IMODE(os.stat(boj/'package.json').st_mode)==0o644,'second tar mode lost')
        require((boj/'a-new/first.txt').read_text()=='NEW-FIRST\n','new file absent')
        require((boj/'outside.txt').read_text()=='UNCHANGED\n','foreign changed')
        if case=='mode_policy':
            require('права SKILL.md: 664 → 644' in child.stdout,'mode transition line absent')
            require('сверка прав с тарболом: расхождений 0 из 4' in child.stdout,'RR not based on tar')
    else:
        require(child.returncode==1,f'failure exit {child.returncode}')
        require('INJECTED_' in child.stderr,'injected failure not reached')
        require(tree(boj)==snapshot,'failure left mixed files/metadata/directories')
        require(old_fd==old,'failure modified old inode')
    backups=list((w/'insurance').rglob('*.tgz'));require(len(backups)==1,'insurance not created exactly once')
    import tarfile
    if len(backups)==1:
        with tarfile.open(backups[0]) as tar:
            require(tar.extractfile('fajly/SKILL.md').read()==old,'insurance old content wrong')
            saved=tar.getmember('fajly/SKILL.md');require((saved.uid,saved.gid,saved.mode)==(owner.pw_uid,owner.pw_gid,old_mode),'insurance old metadata wrong')
    print(json.dumps({'case':case,'exit':child.returncode,'statBefore':before,'statAfter':after,'ownerAfter':f'{metadata.st_uid}:{metadata.st_gid}','modeAfter':oct(stat.S_IMODE(metadata.st_mode)),'oldFdSha':sha(old_fd),'oldExpectedSha':sha(old),'errors':errors}),flush=True)
    assert not errors,errors
    if case in ('copy_failure','publish_failure'):
        # Remove the injected syscall failure and re-run on THE SAME recovered target.
        wrapper.unlink();assert not wrapper.exists()
        clean=dict(os.environ,SMV_MONTAZH=str(w/'insurance'),SMF_RUKA='Beta <beta@sadik>')
        retried=subprocess.run(['bash',str(tool),'HEAD','packages/proba',str(boj),'--v-boj','B-N-1746-PROBE-RESTORED'],env=clean,capture_output=True,text=True,timeout=60)
        print(retried.stdout,end='');print(retried.stderr,end='')
        assert retried.returncode==0,retried.stderr
        assert (boj/'SKILL.md').read_bytes()==new
        meta=os.stat(boj/'SKILL.md');assert (meta.st_uid,meta.st_gid,stat.S_IMODE(meta.st_mode))==(owner.pw_uid,owner.pw_gid,0o644)
        assert (boj/'a-new/first.txt').read_text()=='NEW-FIRST\n'
        assert (boj/'zz-last.txt').read_text()=='NEW-LAST\n'
        assert (boj/'outside.txt').read_text()=='UNCHANGED\n'
        assert not list(boj.rglob('*.new-*'))
        print(json.dumps({'case':case,'faultRemoved':True,'retrySameTargetExit':retried.returncode,'contentAndMetadataCorrect':True}),flush=True)
print(json.dumps({'cleanup':True,'removed':tmp}),flush=True)
