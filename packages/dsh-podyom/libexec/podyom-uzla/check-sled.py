#!/usr/bin/python3 -ISB
"""Compare an artifact with the last service/phase record; this is not journal authentication."""
import argparse,fcntl,hashlib,os,re,stat,sys
def read(path,limit):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):raise ValueError('не обычный файл')
        value=f.read(limit+1)
    if len(value)>limit:raise ValueError(f'{path}: превышен предел чтения {limit} байт ({limit//1048576} МиБ)')
    return value
def check(file,journal,service,phase,manifest,allow_new=False):
    field='kanon_md5' if phase=='ДО' else 'snimok_md5'
    try:rows=read(journal,16*1024*1024).decode().splitlines()
    except FileNotFoundError:rows=[]
    matches=[];pending=[];modern=False
    for number,line in enumerate(rows):
        cols=[x.strip() for x in line.split('|')]
        if len(cols)<3:continue
        actual_row=(cols[1]==phase and cols[2]==service) or (cols[1]=='БАЗИС-'+phase and cols[2]=='артефакт '+service)
        intent_row=cols[1]=='ГОТОВ-'+phase and cols[2]=='артефакт '+service
        if not (actual_row or intent_row):continue
        values=[x.split(None,1)[1] if len(x.split(None,1))==2 else '' for x in cols[3:] if x.split(None,1)[:1]==[field]]
        if actual_row:modern=modern or bool(values);matches.append((number,values))
        else:pending.append((number,values))
    valid=lambda v:len(v)==1 and re.fullmatch('[0-9a-f]{32}',v[0])
    expected=None;source='legacy';boundary=matches[-1][0] if matches else -1
    if matches and valid(matches[-1][1]):expected=matches[-1][1][0];source='journal'
    elif matches and matches[-1][1]==['НЕ-СНЯТ'] and allow_new:
        previous=[x for x in matches[:-1] if valid(x[1])]
        if previous:boundary=previous[-1][0];expected=previous[-1][1][0];source='recovery'
        else:boundary=-1
    elif modern:raise ValueError(f'{journal}: {service}/{phase}: последняя строка без годного {field}')
    intents=[v[0] for n,v in pending if n>boundary and valid(v)] if allow_new else []
    if expected is None:
        try:lines=read(manifest,16*1024*1024).decode().splitlines()
        except FileNotFoundError:lines=[]
        refs=[p[2] for l in lines if len(p:=l.split('|'))>=3 and p[0]=='Q' and p[1]==file]
        if len(refs)>1:raise ValueError(f'{manifest}: неоднозначная опора {file}')
        if refs and re.fullmatch('[0-9a-f]{32}',refs[0]):expected=refs[0]
    try:actual=hashlib.md5(read(file,8*1024*1024)).hexdigest()
    except FileNotFoundError:
        if allow_new and expected is None:return 0,'new'
        raise ValueError(f'{file}: файл отсутствует, expected={expected or "нет"}')
    if actual in intents:return 0,'recovery '+actual
    if expected is None:raise ValueError(f'{file}: нет суммы ни в последней строке, ни в манифесте')
    if expected!=actual:return 1,f'РАСХОЖДЕНИЕ {file}: expected={expected} ({source}) actual={actual}'
    return 0,source+' '+actual
def lock_action():
    mode=sys.argv[1]
    try:
        if mode=='--lock-run':
            if len(sys.argv)<5 or sys.argv[3]!='--':raise ValueError('lock-run path -- command')
            path=sys.argv[2]
            try:
                fd=os.open(path,os.O_RDONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NONBLOCK,0o644)
                os.fchmod(fd,0o644)
            except FileExistsError:
                fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        else:
            if len(sys.argv)!=4:raise ValueError('lock-held fd path')
            fd=int(sys.argv[2]);path=sys.argv[3]
        st=os.fstat(fd);named=os.stat(path,follow_symlinks=False)
        if not stat.S_ISREG(st.st_mode) or not stat.S_ISREG(named.st_mode) or (st.st_dev,st.st_ino)!=(named.st_dev,named.st_ino) or st.st_uid not in (0,os.stat(os.path.dirname(os.path.abspath(path))).st_uid) or st.st_mode & 0o022:raise ValueError('не свой обычный lock-файл')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if mode=='--lock-held':return 0
        os.set_inheritable(fd,True)
        env={**os.environ,'PODYOM_LOCK_FD':str(fd),'PODYOM_LOCK_PATH':path}
        os.execvpe(sys.argv[4],sys.argv[4:],env)
    except (OSError,ValueError) as e:
        print(f'ОТКАЗ блокировки подъёма: {type(e).__name__}: {e}',file=sys.stderr);return 1

def main():
    if len(sys.argv)>1 and sys.argv[1] in ('--lock-run','--lock-held'):return lock_action()
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['file','journal','service','manifest']:p.add_argument('--'+name,required=True)
    p.add_argument('--phase',choices=['ДО','ПОСЛЕ'],required=True);p.add_argument('--allow-new',action='store_true');a=p.parse_args()
    try:code,text=check(a.file,a.journal,a.service,a.phase,a.manifest,a.allow_new)
    except (OSError,ValueError,UnicodeError) as e:code,text=2,f'СЛЕПОТА {a.file}: {e}'
    print(text);return code
if __name__=='__main__':sys.exit(main())
