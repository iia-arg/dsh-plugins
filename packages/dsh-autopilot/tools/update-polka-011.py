#!/usr/bin/python3
"""AP011: only a new CORE directory, manifest and dsh-autopilot registry entry.
No installer, runtime, service, NSS, credential, or install-lock operations.
"""
import argparse,contextlib,fcntl,hashlib,json,os,re,signal,stat,subprocess,sys,tempfile
from pathlib import Path
import yaml

MAN='/usr/local/libexec/dsh-autopilot/layout-expected.json'
MO='/usr/local/sbin/montazh-okno'
SMF='/usr/local/sbin/smontirovat-fajly'
REG='/usr/local/bin/agent-plugins'
ID='dsh-autopilot'

class Stop(Exception):pass
class Parser(argparse.ArgumentParser):
    def error(self,message):raise Stop(message)
def need(test,message):
    if not test:raise Stop(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def canon(value):return sha(json.dumps(value,sort_keys=True,separators=(',',':')).encode())
def read(path,registry=False):
    st=path.lstat();need(stat.S_ISREG(st.st_mode) and st.st_nlink==1,'не обычный одиночный файл: '+str(path))
    need(st.st_uid==0 and not st.st_mode&(0o002 if registry else 0o022),'небезопасный владелец/режим: '+str(path))
    with path.open('rb') as f:
        before=os.fstat(f.fileno());data=f.read();after=os.fstat(f.fileno())
    identity=lambda s:(s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    need(identity(st)==identity(before)==identity(after)==identity(path.lstat()),'файл изменился при чтении: '+str(path))
    return data
def physical(path,registry=False):
    need(path.is_absolute() and '..' not in path.parts and str(path)==os.path.normpath(path),'неканонический путь: '+str(path))
    for parent in [path,*path.parents]:
        if os.path.lexists(parent):
            s=parent.lstat();need(not stat.S_ISLNK(s.st_mode),'ссылка в пути: '+str(parent))
            if stat.S_ISDIR(s.st_mode):
                mask=0o002 if registry and parent==path.parent else 0o022
                need(s.st_uid==0 and (not s.st_mode&mask or s.st_mode&stat.S_ISVTX),'небезопасный родитель: '+str(parent))
def entry(raw):
    doc=yaml.safe_load(raw);tree=yaml.compose(raw.decode());hits=[]
    need(isinstance(doc,dict),'реестр не mapping')
    for key,node in tree.value:
        if isinstance(node,yaml.SequenceNode):
            for item in node.value:
                if isinstance(item,yaml.MappingNode) and any(k.value=='id' and v.value==ID for k,v in item.value):
                    hits.append((key.value,item))
    need(len(hits)==1,'неоднозначная запись '+ID)
    key,node=hits[0];items=[x for x in doc[key] if isinstance(x,dict) and x.get('id')==ID]
    need(len(items)==1,'дубль '+ID)
    return doc,items[0],node
def content_end(node):
    if isinstance(node,yaml.ScalarNode) or node.flow_style or not node.value:return node.end_mark.index
    children=[x for pair in node.value for x in pair] if isinstance(node,yaml.MappingNode) else node.value
    return max(content_end(child) for child in children)
def replace_entry(raw,value,original=None):
    text=raw.decode();doc,old,node=entry(raw);start,end=node.start_mark.index,content_end(node)
    if original is None:
        lines=yaml.safe_dump(value,sort_keys=False,allow_unicode=True).splitlines()
        replacement=lines[0]+''.join('\n'+' '*node.start_mark.column+x for x in lines[1:])
    else:replacement=original
    result=(text[:start]+replacement+text[end:]).encode()
    expected=json.loads(json.dumps(doc))
    for group in expected.values():
        if isinstance(group,list):
            for i,x in enumerate(group):
                if isinstance(x,dict) and x.get('id')==ID:group[i]=value
    need(yaml.safe_load(result)==expected,'замена записи затронула структуру реестра')
    return result
def atomic(path,data,mode=0o600,uid=0,gid=0):
    fd,name=tempfile.mkstemp(prefix='.ap011-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:
            f.write(data);f.flush();os.fsync(f.fileno());os.fchown(f.fileno(),uid,gid);os.fchmod(f.fileno(),mode)
        os.replace(name,path)
    finally:
        if os.path.lexists(name):os.unlink(name)
def write_json(path,value):atomic(path,(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
def run(argv,allowed=(0,),env=None):
    p=subprocess.Popen(list(map(str,argv)),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True,env=env)
    # SMF waits for its own lock up to300s after creating temporary leaves.
    # Give it time to clean them up rather than SIGKILL at the old120s deadline.
    limit=360 if str(argv[0])==SMF and '--v-boj' in argv else 120
    try:output,_=p.communicate(timeout=limit)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError):os.killpg(p.pid,signal.SIGKILL)
        p.communicate();raise Stop('предел'+str(limit)+'с: '+str(argv[0]))
    print(output,end='')
    need(p.returncode in allowed,'команда rc'+str(p.returncode)+': '+str(argv[0]))
    return output

class Window:
    def __init__(self,params,save):
        self.params=params;self.param_bytes=read(params);self.p=json.loads(self.param_bytes)
        need(set(self.p)=={'schema','root','old_head','new_head','metadata_head','core_file_count','manifest_before_sha256','manifest_after_sha256','core_source','manifest_source','before_entry_sha256','after_entry','task','actor'} and self.p['schema']==4,'schema параметров')
        for key in ['old_head','new_head','metadata_head']:
            need(isinstance(self.p[key],str) and re.fullmatch('[0-9a-f]{40}',self.p[key]),'нужна полная голова в параметре '+key)
        for key in ['manifest_before_sha256','manifest_after_sha256','before_entry_sha256']:
            need(isinstance(self.p[key],str) and re.fullmatch('[0-9a-f]{64}',self.p[key]),'нужен полный SHA256 в параметре '+key)
        need(self.p['old_head']!=self.p['new_head'],'старая и новая полки совпадают')
        need(type(self.p['core_file_count']) is int and 0<self.p['core_file_count']<=1024,'core_file_count должен быть1..1024')
        need(isinstance(self.p['after_entry'],dict) and isinstance(self.p['after_entry'].get('derevo'),dict),'after_entry/derevo должны быть объектами')
        self.old_head=self.p['old_head'];self.new_head=self.p['new_head'];self.metadata_head=self.p['metadata_head']
        self.before_sha=self.p['manifest_before_sha256'];self.after_sha=self.p['manifest_after_sha256']
        self.root=Path(self.p['root']);physical(self.root)
        self.save=save;physical(save)
        need(save.is_relative_to(self.root/'var/backups/montazh') and save!=self.root/'var/backups/montazh','SAVE должен быть внутри постоянного var/backups/montazh')
        need(re.fullmatch('[A-Za-z0-9-]+',self.p['task']) and re.fullmatch(r'[^<>]+ <[^<> ]+@[^<> ]+>',self.p['actor']),'task/actor')
        self.shelf=self.root/'opt/autopilot/packages'/self.new_head
        self.man=self.root/MAN.lstrip('/');self.registry=self.root/'etc/agent-registry/plugins.yaml'
        for path in [self.shelf,self.man,params]:physical(path)
        physical(self.registry,registry=True)
        if self.root==Path('/'):
            need(not any(k.startswith(('SMF_','MO_')) or k in {'PLUGINS_REGISTRY','AGENT_PLUGINS_STRAHOVKI','MONTAZH_OKNO_BIN'} for k in os.environ),'подмены инструментов запрещены на живом root')
        self.after=self.p['after_entry']

    def registry_bytes(self):return read(self.registry,registry=True)
    def actor_env(self):
        name,email=self.p['actor'].rsplit(' <',1);email=email[:-1]
        env=dict(os.environ,AGENT_PLUGINS_RUKA=self.p['actor'])
        for who in ['AUTHOR','COMMITTER']:
            env['GIT_'+who+'_NAME']=name;env['GIT_'+who+'_EMAIL']=email
        return env
    def manifest_sha(self):
        data=read(self.man);s=self.man.stat()
        need((stat.S_IMODE(s.st_mode),s.st_uid,s.st_gid)==(0o644,0,0),'чужая правка metadata manifest')
        need(not os.listxattr(self.man),'чужая правка xattr manifest')
        return sha(data)

    def rows(self,manifest):
        need(sha(read(manifest))==self.after_sha,'новый manifest ≠ пину manifest_after_sha256')
        m=json.loads(read(manifest));prefix='/opt/autopilot/packages/'+self.new_head+'/'
        rows=[r for r in m['rows'] if r['path'].startswith(prefix)]
        need(len(rows)==self.p['core_file_count'] and len({r['path'] for r in rows})==len(rows),'число CORE-файлов ≠ core_file_count')
        need(m['version']=='0.1.1' and '/opt/autopilot/packages/'+self.new_head in m['managed'],'manifest не от новой полки0.1.1')
        for r in rows:need(r['kind']=='file' and r['uid']==r['gid']==0 and r['mode'] in (0o644,0o755),'CORE kind/owner/mode')
        return rows

    def preflight(self):
        need(not os.path.lexists(self.shelf),'полка0.1.1 уже есть: '+str(self.shelf))
        need(not os.path.lexists(self.save),'SAVE уже есть; повтор apply запрещён, проверь возврат')
        need(self.manifest_sha()==self.before_sha,'manifest до ≠ пину manifest_before_sha256: '+str(self.man))
        raw=self.registry_bytes();_,before,node=entry(raw)
        need(canon(before)==self.p['before_entry_sha256'],'запись реестра ≠ ожидаемой')
        need(before.get('path')==str(self.root/'opt/autopilot/packages'/self.old_head) and before.get('version')=='0.1.0','исходная запись не от old_head/0.1.0')
        need(self.after.get('id')==ID and self.after.get('version')=='0.1.1' and self.after.get('path')==str(self.shelf),'не та новая запись')
        for k in set(before)|set(self.after):
            if k not in {'version','path','installed_check','derevo','note'}:need(before.get(k)==self.after.get(k),'чужая дельта поля записи: '+k)
        rows=self.rows(Path(self.p['manifest_source']));source=Path(self.p['core_source']);physical(source)
        names={r['path'].split('/'+self.new_head+'/',1)[1] for r in rows}
        actual={str(p.relative_to(source)) for p in source.rglob('*') if not p.is_dir() or p.is_symlink()}
        need(actual==names,'состав CORE source не равен принятым именам manifest')
        for r in rows:
            p=source/r['path'].split('/'+self.new_head+'/',1)[1];physical(p)
            need(sha(read(p))==r['sha256'] and stat.S_IMODE(p.stat().st_mode)==r['mode'],'source отличается: '+str(p))
        dv=self.after['derevo'];need(dv.get('address')==before['derevo']['address'] and dv.get('subdir')==before['derevo']['subdir'] and dv.get('ref')=='dsh-autopilot-v0.1.1','происхождение новой записи')
        expected_core={str(self.root/r['path'].lstrip('/')) for r in rows}
        old_external={f['local']:f for f in before['derevo']['files'] if not Path(f['local']).is_relative_to(self.root/'opt/autopilot/packages'/self.old_head)}
        new_external={f['local']:f for f in dv['files'] if f['local'] not in expected_core}
        need(new_external==old_external and {f['local'] for f in dv['files']}==expected_core|set(old_external),'новая запись меняет цели вне трёх объектов')
        need(not dv.get('expected_diff_files'),'исключения expected_diff_files не разрешены')
        checker=self.root/'usr/local/libexec/dsh-autopilot/layout-check.py'
        expected_check=f'/usr/bin/python3 -I -B {checker} --manifest {self.man} --sha {self.after_sha}'+('' if self.root==Path('/') else f' --root {self.root}')
        need(self.after['installed_check']==expected_check,'installed_check не от нового manifest')
        # Verify publication against the pinned metadata commit; the tag is created AFTER publication.
        repo=dv['address']
        git=['git','--no-optional-locks','-c','safe.directory='+repo,'-C',repo]
        need(subprocess.check_output(git+['cat-file','-t',self.new_head],stderr=subprocess.PIPE,timeout=20).strip()==b'commit','new_head не коммит CORE')
        need(subprocess.check_output(git+['cat-file','-t',self.metadata_head],stderr=subprocess.PIPE,timeout=20).strip()==b'commit','metadata_head не коммит')
        ancestry=subprocess.run(git+['merge-base','--is-ancestor',self.new_head,self.metadata_head],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
        need(ancestry.returncode==0,'не доказано происхождение metadata_head от new_head')
        changed=subprocess.check_output(git+['diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',self.new_head,self.metadata_head,'--',dv['subdir']],stderr=subprocess.PIPE,timeout=20).decode().split('\0')
        forbidden=[p for p in changed if p and p!=dv['subdir']+'/checks/layout-expected.json' and not p.startswith(dv['subdir']+'/tools/')]
        need(not forbidden,'недопустимая дельта metadata: '+', '.join(forbidden))
        for f in dv['files']:
            src=Path(self.p['manifest_source']) if f['local']==str(self.man) else source/Path(f['local']).relative_to(self.shelf) if f['local'] in expected_core else Path(f['local'])
            need(re.fullmatch(r'[A-Za-z0-9_./-]+',f['remote']) and '..' not in Path(f['remote']).parts,'remote путь')
            blob=subprocess.check_output(git+['show',self.metadata_head+':'+dv['subdir']+'/'+f['remote']],stderr=subprocess.PIPE,timeout=20)
            need(sha(blob)==sha(read(src)),'коммит ≠ публикации: '+f['remote'])
            if f['local'] in expected_core:
                core_blob=subprocess.check_output(git+['show',self.new_head+':'+dv['subdir']+'/'+f['remote']],stderr=subprocess.PIPE,timeout=20)
                need(sha(core_blob)==sha(blob),'CORE new_head ≠ metadata_head: '+f['remote'])
                r=next(r for r in rows if str(self.root/r['path'].lstrip('/'))==f['local'])
                need(f.get('owner')=='root:root' and f.get('mode')==f"{r['mode']:04o}",'метаданные новой CORE-записи')
        replace_entry(raw,self.after)  # Prove the single-entry splice parses before SAVE/MO/targets.
        return raw,before,rows

    @contextlib.contextmanager
    def lock(self):
        p=self.save/'LOCK';fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            need(stat.S_ISREG(os.fstat(fd).st_mode),'необычный LOCK')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise Stop('LOCK окна занят')
            yield
        finally:os.close(fd)

    def state(self):return json.loads(read(self.save/'state.json'))
    def put(self,s):write_json(self.save/'state.json',s)
    def plans(self,rows):
        checks=[dict(kind='file',path=str(self.root/r['path'].lstrip('/')),sha256=r['sha256'],uid=0,gid=0,mode=r['mode']) for r in rows]
        checks.append(dict(kind='file',path=str(self.man),sha256=self.after_sha,uid=0,gid=0,mode=0o644))
        dv=self.after['derevo']
        checks.append(dict(kind='registry',path=str(self.registry),id=ID,expected={'id':ID,'derevo.address':dv['address'],'derevo.subdir':dv['subdir']},owned_files=[{'local':f['local'],'remote':f['remote']} for f in dv['files']],derevo_consistency=True))
        checks.append(dict(kind='registry',path=str(self.registry),id=ID,expected={'id':ID},snapshot_sha256=canon(self.after)))
        # Read-only closure dependency, NOT a modified subject: rollback never removes somebody else's tag.
        checks.append(dict(kind='tag',repo=dv['address'],ref=dv['ref'],commit=self.metadata_head))
        subjects=['file:'+c['path'] for c in checks if c['kind']=='file']+['entry:'+ID]
        inverse=[dict(kind='absent',path=c['path']) for c in checks if c['kind']=='file' and c['path']!=str(self.man)]
        inverse += [dict(kind='absent',path=str(self.shelf)),dict(kind='file',path=str(self.man),sha256=self.before_sha,uid=0,gid=0,mode=0o644),dict(kind='registry',path=str(self.registry),id=ID,expected={'id':ID},snapshot_sha256=self.p['before_entry_sha256'])]
        return {'subjects':subjects,'checks':checks},{'subjects':subjects,'checks':inverse}

    def apply(self,write):
        raw,before,rows=self.preflight()
        if not write:print('ПРОГОН: полка, manifest, одна запись; ничего не записано');return
        self.save.mkdir(parents=True,mode=0o700);self.save.chmod(0o700)
        (self.save/'LOCK').write_bytes(b'');(self.save/'LOCK').chmod(0o600)
        with self.lock():
            # Recheck all three live bases after taking the window lock, before opening MO or writing a target.
            need(not os.path.lexists(self.shelf) and self.manifest_sha()==self.before_sha and self.registry_bytes()==raw,'основа ушла до действия')
            atomic(self.save/'manifest.before',read(self.man));atomic(self.save/'manifest.after',read(Path(self.p['manifest_source'])))
            atomic(self.save/'registry.before',raw)
            stage=self.save/'stage';stage.mkdir(mode=0o700)
            for r in rows:
                rel=Path(r['path'].lstrip('/'));p=stage/rel;p.parent.mkdir(parents=True,exist_ok=True)
                atomic(p,read(Path(self.p['core_source'])/str(rel).split('/'+self.new_head+'/',1)[1]),r['mode'])
            p=stage/MAN.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True);atomic(p,read(self.save/'manifest.after'),0o644)
            plan,inverse=self.plans(rows);write_json(self.save/'forward.json',plan);write_json(self.save/'inverse.json',inverse)
            s={'schema':1,'params_sha256':sha(self.param_bytes),'before_entry':before,'phase':'prepared','window_id':None}
            self.put(s)
            result=run([MO,'otkryt','--plan',self.save/'forward.json','--task',self.p['task'],'--actor',self.p['actor'],'--ttl','1800'])
            need(re.fullmatch('[0-9a-f]{32}',result.strip()),'ID окна не разобран; искать по точному forward/task')
            s['window_id']=result.strip();s['phase']='active';self.put(s)
            self.registry_write(replace_entry(raw,self.after),sha(raw),'forward')
            # New registry ownership is now fixed: every producer joins exactly the same plan/window.
            for mode in (0o644,0o755):
                selected=[c for c in plan['checks'] if c['kind']=='file' and c['mode']==mode]
                if not selected:continue
                argv=[SMF,'--punkt',self.p['task'],'--ruka',self.p['actor'],'--novyj',f'--mode={mode:o}','--owner=0:0','--okno-id',s['window_id']]
                for c in selected:
                    rel=str(Path(c['path']).relative_to(self.root));argv+=['--osnova',rel+'='+(self.before_sha if c['path']==str(self.man) else 'net')]
                argv += [stage,self.root]+[str(Path(c['path']).relative_to(self.root)) for c in selected]
                run([*argv[:1],'--progon',*argv[1:]],env=self.actor_env())
                run([*argv[:1],'--v-boj',*argv[1:]],env=self.actor_env())
            self.verify_return(s)
            s['phase']='awaiting_tag';self.put(s)
            print('PUBLISHED: окно '+s['window_id']+' открыто; метка '+self.after['derevo']['ref']+' должна указывать на '+self.metadata_head+'; затем finish --v-boj')

    def finish(self,write):
        need(self.save.is_dir(),'нет SAVE для finish')
        with self.lock():
            s=self.state();need(s['phase'] in ('active','awaiting_tag','closed'),'finish недопустим в фазе '+str(s['phase']))
            ident=self.verify_return(s);need(ident is not None,'нет исходного MO для finish')
            for c in json.loads(read(self.save/'forward.json'))['checks']:
                if c['kind']!='file':continue
                p=Path(c['path']);data=read(p);st=p.stat()
                need(sha(data)==c['sha256'] and (stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid)==(c['mode'],c['uid'],c['gid']),'публикация не завершена: '+str(p))
            need(entry(self.registry_bytes())[1]==self.after,'запись не равна публикации')
            dv=self.after['derevo'];git=['git','--no-optional-locks','-c','safe.directory='+dv['address'],'-C',dv['address']]
            commit=subprocess.check_output(git+['rev-parse','--verify','refs/tags/'+dv['ref']+'^{commit}'],stderr=subprocess.PIPE,timeout=20).decode().strip()
            need(commit==self.metadata_head,'метка ≠ metadata_head: '+dv['ref'])
            if not write:print('finish: публикация и метка сходятся; только чтение');return
            run([MO,'zakryt',ident]);s['phase']='closed';self.put(s)
            print('UPDATE-OK: одно окно '+ident+' закрыто')

    def registry_write(self,data,base,label):
        p=self.save/('registry-'+label+'.yaml');atomic(p,data,0o644)
        need(sha(self.registry_bytes())==base,'реестр ушёл перед pravka')
        argv=[REG,'pravka',p,'--osnova',base,'--punkt',self.p['task']+'-'+label]
        env=self.actor_env()
        run(argv,env=env);run([*argv,'--ustanovit'],env=env)
        need(self.registry_bytes()==data,'реестр после pravka не равен кандидату')

    def window_id(self,s):
        root=Path(os.environ.get('MO_STATE_DIR','/var/lib/montazh-okna'))
        plan=json.loads(read(self.save/'forward.json'));ident=s['window_id']
        if ident is None:
            matches=[]
            for p in root.glob('*.json'):
                d=json.loads(read(p))
                if d.get('task')==self.p['task'] and d.get('checks')==plan['checks'] and d.get('subjects')==plan['subjects']:matches.append(d['id'])
            need(len(matches)<=1,'неоднозначное окно после обрыва');ident=matches[0] if matches else None
        if ident:
            d=json.loads(read(root/(ident+'.json')))
            need(d['checks']==plan['checks'] and d['subjects']==plan['subjects'] and d['task']==self.p['task'],'не то окно')
        for p in root.glob('*.json'):
            d=json.loads(read(p))
            if d['id']!=ident and d['phase'] in ('open','failed'):need(not set(d['subjects'])&set(plan['subjects']),'другое незавершённое пересекающееся окно')
        return ident

    def verify_return(self,s):
        need(s.get('schema')==1 and s['params_sha256']==sha(self.param_bytes),'STATE/PARAMS не от этого окна')
        need(sha(read(self.save/'manifest.before'))==self.before_sha and sha(read(self.save/'manifest.after'))==self.after_sha,'страховка manifest повреждена')
        _,original,_=entry(read(self.save/'registry.before'))
        need(canon(original)==self.p['before_entry_sha256'] and original==s['before_entry'],'страховка записи повреждена')
        rows=self.rows(self.save/'manifest.after');plan,inverse=self.plans(rows)
        need(json.loads(read(self.save/'forward.json'))==plan and json.loads(read(self.save/'inverse.json'))==inverse,'планы расходятся с принятым составом')
        need(self.manifest_sha() in (self.before_sha,self.after_sha),'чужая правка manifest: '+str(self.man))
        _,live,_=entry(self.registry_bytes());need(live in (original,self.after),'чужая правка записи реестра')
        allowed={str(Path(r['path']).relative_to('/opt/autopilot/packages/'+self.new_head)):r for r in rows}
        for tree in [self.shelf,self.save/'quarantine']:
            if not os.path.lexists(tree):continue
            need(tree.is_dir() and not tree.is_symlink(),'полка/карантин не каталог')
            dirs={str(x) for n in allowed for x in Path(n).parents if str(x)!='.'}
            for p in [tree,*tree.rglob('*')]:
                st=p.lstat();rel=str(p.relative_to(tree))
                need(st.st_uid==st.st_gid==0,'чужой владелец полки: '+str(p))
                if stat.S_ISDIR(st.st_mode):need((p==tree or rel in dirs) and stat.S_IMODE(st.st_mode)==0o755,'чужой каталог полки: '+str(p))
                else:need(rel in allowed and sha(read(p))==allowed[rel]['sha256'] and stat.S_IMODE(st.st_mode)==allowed[rel]['mode'],'чужой файл полки: '+str(p))
        return None if s['phase']=='rolled_back' else self.window_id(s)

    def rollback(self,write):
        need(self.save.is_dir(),'нет SAVE для возврата')
        with self.lock():
            s=self.state();ident=self.verify_return(s)
            if s['phase']=='rolled_back':
                need(not os.path.lexists(self.shelf) and self.manifest_sha()==self.before_sha and entry(self.registry_bytes())[1]==s['before_entry'],'после возврата состояние ушло')
                print('нечего: возврат уже принят');return
            if not write:print('возврат: сходится; только чтение');return
            raw=self.registry_bytes();before=read(self.save/'registry.before')
            _,live,_=entry(raw)
            if live!=s['before_entry']:
                _,_,node=entry(before);old_slice=before.decode()[node.start_mark.index:content_end(node)]
                target=before if raw==replace_entry(before,self.after) else replace_entry(raw,s['before_entry'],old_slice)
                self.registry_write(target,sha(raw),'rollback')
            # Existing-target recovery authorized by coordinator09:05Z. MO inverse admits the result; no reverse immutable join.
            need(self.manifest_sha() in (self.before_sha,self.after_sha),'чужая правка manifest перед возвратом')
            if self.manifest_sha()!=self.before_sha:atomic(self.man,read(self.save/'manifest.before'),0o644)
            self.verify_return(s)
            if os.path.lexists(self.shelf):
                need(not os.path.lexists(self.save/'quarantine'),'карантин уже есть, а полка ещё на месте')
                os.rename(self.shelf,self.save/'quarantine')
            if ident:run([MO,'otkat-proveren','--plan',self.save/'inverse.json',ident])
            s['phase']='rolled_back';s['window_id']=ident;self.put(s)
            print('ROLLBACK-OK')

def main():
    p=Parser(allow_abbrev=False);p.add_argument('--params',required=True,type=Path);p.add_argument('--save',required=True,type=Path)
    p.add_argument('mode',choices=['apply','finish','check-rollback','rollback']);p.add_argument('--v-boj',action='store_true')
    a=p.parse_args();need(os.geteuid()==0,'нужен root')
    need(not(a.mode=='check-rollback' and a.v_boj),'check-rollback не принимает ключ записи')
    w=Window(a.params,a.save)
    if a.mode=='apply':w.apply(a.v_boj)
    elif a.mode=='finish':w.finish(a.v_boj)
    else:w.rollback(a.v_boj)
    return 0
if __name__=='__main__':
    try:sys.exit(main())
    except (Stop,OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError,yaml.YAMLError) as e:
        print('STOP: '+str(e),file=sys.stderr);sys.exit(2)
