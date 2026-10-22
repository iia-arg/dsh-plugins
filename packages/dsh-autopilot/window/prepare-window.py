#!/usr/bin/python3
"""Default: private native plan/payload. Explicit --open-directories admits the window and journals its new directories. No file mounts or services.
Release number comes from packages/dsh-autopilot/package.json (must equal RELEASE.json version); the previous accepted release, its public
layout manifest and accepted core come from the live registry entry and that manifest; release prose lives in RELEASE.json["registry"]."""
import argparse,copy,hashlib,json,os,re,runpy,shlex,shutil,stat,subprocess,sys
from pathlib import Path
import yaml

HERE=Path(__file__).resolve().parent
IDS=['dsh-autopilot']
PACKAGES={}
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def code(version):
    if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('invalid release number: '+version)
    return version.replace('.','')


def main():
    if len(sys.argv)>1 and sys.argv[1]=="--open-directories":
        sys.argv=[str(HERE/"directories.py"),*sys.argv[2:],"open"]
        runpy.run_path(str(HERE/"directories.py"),run_name="__main__");return
    p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    p.add_argument('--repo',type=Path,required=True);p.add_argument('--registry',type=Path,required=True)
    p.add_argument('--save',type=Path,required=True)
    p.add_argument('--public',type=Path,required=True);p.add_argument('--root',type=Path,default=Path('/'))
    p.add_argument('--actor',required=True)
    a=p.parse_args()
    if os.geteuid()!=0:raise ValueError('root preparer required')
    if len(a.actor)>128 or not re.fullmatch(r'[^<>\n]+ <[^<>@\s]+@[^<>\s]+>',a.actor):raise ValueError('invalid actor format')
    for path in [a.repo,a.registry,a.save,a.public,a.root]:
        if not path.is_absolute() or '..' in path.parts or path.parent.resolve()!=path.parent:raise ValueError('noncanonical preparation path')
    release=json.loads((HERE/'RELEASE.json').read_text())
    version=json.loads((a.repo/'packages/dsh-autopilot/package.json').read_text())['version'];c_new=code(version)
    if release.get('version')!=version:raise ValueError('RELEASE.json version differs from package.json')
    task='AP'+c_new   # task окна = --punkt каждой группы: smontirovat-fajly при --okno-id требует task == --punkt (B-N-2111 (23))
    text=release.get('registry')
    if not isinstance(text,dict) or set(text)!={'name','channel','note'} or not all(isinstance(v,str) and v for v in text.values()):raise ValueError('RELEASE.json registry name/channel/note required')
    PACKAGES['dsh-autopilot']=version
    git=['git','--no-optional-locks','-c','safe.directory='+str(a.repo),'-C',str(a.repo)]
    source_commit=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip()
    for package,version in PACKAGES.items():
        probe=subprocess.run(git+['show-ref','--verify','--quiet','refs/tags/'+package+'-v'+version])
        if probe.returncode!=1:raise ValueError('release tag exists or Git failed: '+package+' rc='+str(probe.returncode))
    for package,tree in release['trees'].items():
        if subprocess.check_output(git+['rev-parse','HEAD:packages/'+package],text=True).strip()!=tree:raise ValueError('source tree differs: '+package)
        prefix='packages/'+package+'/'
        tracked={x.removeprefix(prefix) for x in subprocess.check_output(git+['ls-files','--',prefix],text=True).splitlines()}
        source=a.repo/'packages'/package
        found={f.relative_to(source).as_posix() for f in source.rglob('*') if f.is_file() and '__pycache__' not in f.parts}
        if found!=tracked or any(f.is_symlink() for f in source.rglob('*')):raise ValueError('untracked or linked source file: '+package)
    if subprocess.run(git+['diff','--quiet','HEAD','--',*[str('packages/'+x) for x in PACKAGES]]).returncode:raise ValueError('source worktree dirty')
    raw=a.registry.read_bytes();doc=yaml.safe_load(raw);entries={e['id']:e for group in doc.values() if isinstance(group,list) for e in group if isinstance(e,dict) and 'id' in e}
    prev=entries['dsh-autopilot']['version'];c_prev=code(prev)
    if tuple(map(int,prev.split('.')))>=tuple(map(int,version.split('.'))):raise ValueError('requires accepted release below '+version+', registry has '+prev)
    g=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='ap'+c_new+'_precheck')['main'].__globals__
    before_checks=[]
    for eid in IDS:
        e=entries[eid];c={'kind':'registry','path':str(a.registry),'id':eid,'expected':{'id':eid,'version':e['version']}}
        if 'derevo' in e:c['derevo_consistency']=True
        else:c['values_consistency']=True;c['owned_paths']=g['check_paths'](e)
        before_checks.append(c)
    errors=g['stable_verify'](before_checks)
    if errors:raise ValueError('BEFORE registry/files do not agree: '+str(errors))
    a.save.mkdir(mode=0o700);a.public.mkdir(mode=0o755);a.public.chmod(0o755)
    payload=a.save/'payload';payload.mkdir();backup=a.save/'before';backup.mkdir(mode=0o700)
    rows=[]
    def logical_name(path):
        value=Path(path)
        return '/'+str(value.relative_to(a.root)) if a.root!=Path('/') and value.is_relative_to(a.root) else str(value)
    def target(logical):return a.root/logical_name(logical).lstrip('/')
    def add(logical,body,mode=0o644,uid=0,gid=0,phase=0,replace_existing=False):
        logical=logical_name(logical)
        path=target(logical);source=payload/logical.lstrip('/');source.parent.mkdir(parents=True,exist_ok=True);source.write_bytes(body);source.chmod(mode)
        before=None
        if not replace_existing and (path.exists() or path.is_symlink()):raise ValueError('new release target already exists: '+str(path))
        if path.exists() or path.is_symlink():
            st=path.lstat()
            if not stat.S_ISREG(st.st_mode) or path.resolve()!=path:raise ValueError('file target not physical regular: '+str(path))
            before={'sha256':sha(path),'mode':stat.S_IMODE(st.st_mode),'uid':st.st_uid,'gid':st.st_gid}
            dest=backup/logical.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest);dest.chmod(0o600)
        row={'path':str(path),'logical':logical,'source':str(source),'sha256':sha(source),'mode':mode,'uid':uid,'gid':gid,'before':before,'group':phase}
        if any(x['path']==row['path'] for x in rows):raise ValueError('duplicate target')
        rows.append(row)
    ap=a.repo/'packages/dsh-autopilot';shelf='/opt/autopilot/packages/'+release['commit']
    if not (ap/'CHANGELOG.md').read_text().startswith('## '+version+' — '):raise ValueError('CHANGELOG does not open with release '+version)
    heads=re.findall(r'^## (\d+\.\d+\.\d+) ',(ap/'CHANGELOG.md').read_text(),re.M)
    if heads[:2]!=[version,prev]:raise ValueError('registry release '+prev+' is not the direct predecessor of '+version+' in CHANGELOG')
    for treb in release.get('docs',[]):
        if treb['contains'] not in (ap/treb['file']).read_text():raise ValueError('release documentation missing: '+treb['file'])
    # The accepted public layout is the manifest the live entry's installed_check binds (019 after the core window, 019p/019u after
    # the mail/usage windows), never a guessed name: a guessed 019 would refuse after them and would drop their rows.
    bound=shlex.split(entries['dsh-autopilot']['installed_check']);bound_mf=logical_name(bound[bound.index('--manifest')+1])
    if not re.fullmatch(r'/usr/local/libexec/dsh-autopilot/postal-layout-'+c_prev+r'[a-z]?\.json',bound_mf):raise ValueError('installed_check binds no AP'+prev+' public manifest: '+bound_mf)
    old_mf=target(bound_mf);old_public=json.loads(old_mf.read_text())
    if old_public.get('version')!=prev:raise ValueError('previous public layout is not release '+prev)
    accepted_core=[r.get('target') for r in old_public['rows'] if r.get('path')=='/opt/autopilot/current' and r.get('kind')=='link']
    if len(accepted_core)!=1 or not accepted_core[0]:raise ValueError('previous public layout has no single current link')
    if target(shelf).exists() or target(shelf).is_symlink():raise ValueError('new package shelf must be absent')
    for f in sorted(ap.rglob('*')):
        if f.is_file() and '__pycache__' not in f.parts:
            mode=stat.S_IMODE(f.stat().st_mode)
            if mode not in (0o644,0o755):raise ValueError('unexpected package file mode')
            add(shelf+'/'+f.relative_to(ap).as_posix(),f.read_bytes(),mode,phase=0 if mode==0o644 else 1)
    # Pure core installer layout; never execute install.main or upstream runtime.
    sys.path.insert(0,str(ap/'lib'))
    layout_api=runpy.run_path(str(ap/'lib/install.py'))
    lock,raw_source=layout_api['source']()
    expected,(upstream,physical)=layout_api['layout'](Path('/'),lock,raw_source)
    # The immutable upstream already belongs to the previous accepted release. It is verified,
    # retained and excluded from all producers/created-directory receipts.
    new_trees=[str(physical)]
    shared=[]
    for logical,(kind,mode,body) in sorted(expected.items(),key=lambda x:str(x[0])):
        if logical!=upstream and not logical.is_relative_to(upstream):continue
        value=target(str(logical));st=value.lstat()
        if value.parent.resolve()!=value.parent or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(0,0,mode):raise ValueError('shared upstream metadata differs: '+str(value))
        if kind=='file':
            if not stat.S_ISREG(st.st_mode) or value.read_bytes()!=body:raise ValueError('shared upstream bytes differ: '+str(value))
        elif kind=='link':
            if not stat.S_ISLNK(st.st_mode) or os.readlink(value)!=body:raise ValueError('shared upstream link differs: '+str(value))
        elif kind=='dir':
            if not stat.S_ISDIR(st.st_mode):raise ValueError('shared upstream directory differs: '+str(value))
        else:raise ValueError('unsupported shared upstream entry')
        shared.append({'path':str(value),'logical':str(logical),'kind':kind,'dev':st.st_dev,'ino':st.st_ino})
    if not shared:raise ValueError('shared upstream inventory empty')
    for tree in new_trees:
        value=target(tree)
        if value.exists() or value.is_symlink():raise ValueError('new core tree must be absent: '+tree)
    core_links=[];core_directories=[]
    for logical,(kind,mode,body) in sorted(expected.items(),key=lambda x:str(x[0])):
        if logical==upstream or logical.is_relative_to(upstream):continue
        if kind=='file':add(str(logical),body,mode,phase=2 if mode==0o644 else 3)
        elif kind=='link':
            path=target(str(logical));old=None
            if path.exists() or path.is_symlink():
                if not path.is_symlink():raise ValueError('core link is not a link: '+str(path))
                old=os.readlink(path)
            if str(logical)=='/opt/autopilot/current':
                if old!=accepted_core[0]:raise ValueError('current is not the accepted core of '+prev)
            elif str(logical)=='/opt/agent-skills/autopilot':
                if old!=body:raise ValueError('skill alias differs')
            elif old is not None:raise ValueError('new source link exists')
            core_links.append({'path':str(path),'logical':str(logical),'before':old,'after':body})
        elif kind=='dir':core_directories.append({'path':str(logical),'kind':'dir','mode':mode,'uid':0,'gid':0})
        else:raise ValueError('unsupported core entry')
    new=copy.deepcopy(doc);after={e['id']:e for group in new.values() if isinstance(group,list) for e in group if isinstance(e,dict) and 'id' in e}
    ae=after['dsh-autopilot'];external=[f for f in ae['derevo']['files'] if not f['local'].startswith(ae['path']+'/') and f['remote'] not in {'tools/measure-run-codex.py','tools/README-measure-run-codex.md'}]
    excluded={f['remote'] for f in external}
    ae['name']=text['name'];ae['channel']=text['channel'];ae['note']=text['note']
    ae['path']=str(target(shelf));ae['version']=version;ae['derevo'].update(address=str(a.repo),ref='dsh-autopilot-v'+version)
    ae['derevo']['files']=[{'remote':f.relative_to(ap).as_posix(),'local':str(target(shelf+'/'+f.relative_to(ap).as_posix())),'mode':format(stat.S_IMODE(f.stat().st_mode),'04o'),'owner':'root:root'} for f in sorted(ap.rglob('*')) if f.is_file() and '__pycache__' not in f.parts and f.relative_to(ap).as_posix() not in excluded]+[{**f,'local':str(target(f['local']))} for f in external]
    ae['derevo']['not_installed']=[]
    command=shlex.split(entries['dsh-autopilot']['installed_check'])
    if command[command.index('--manifest')+1]!=str(old_mf) or command[command.index('--sha')+1]!=sha(old_mf):raise ValueError('unexpected AP'+prev+' public manifest binding')
    public=json.loads(old_mf.read_text());public['version']=version
    public['managed'] += [shelf,*new_trees]
    indexed={r['path']:r for r in public['rows']}
    for x in rows:indexed[x['logical']]={'path':x['logical'],'kind':'file',**{k:x[k] for k in ['sha256','mode','uid','gid']}}
    for row in core_directories:indexed[row['path']]=row
    for row in core_links:indexed[row['logical']]={'path':row['logical'],'kind':'link','mode':0o777,'uid':0,'gid':0,'target':row['after']}
    public['rows']=list(indexed.values())
    mf='/usr/local/libexec/dsh-autopilot/postal-layout-'+c_new+'.json';add(mf,(json.dumps(public,ensure_ascii=False,indent=2)+'\n').encode(),phase=4)
    ae['installed_check']='/usr/bin/python3 -I -B '+shlex.quote(str(target(shelf+'/checks/layout-check.py')))+' --manifest '+shlex.quote(str(target(mf)))+' --sha '+sha(payload/mf.lstrip('/'))+(' --root '+shlex.quote(str(a.root)) if a.root!=Path('/') else '')
    rendered=raw.decode()
    for eid in IDS:
        pattern=re.compile(r'(?ms)^  - id: '+re.escape(eid)+r'\s*\n.*?(?=^  - id:|^\S|\Z)')
        matches=list(pattern.finditer(rendered))
        if len(matches)!=1:raise ValueError('ambiguous registry entry '+eid)
        replacement='\n'.join('  '+line for line in yaml.safe_dump([after[eid]],allow_unicode=True,sort_keys=False,width=100000).rstrip().splitlines())+'\n'
        match=matches[0];suffix=re.search(r'(?:^[ \t]*(?:#[^\n]*)?\n)*\Z',match.group(),re.M).group();rendered=rendered[:match.start()]+replacement+suffix+rendered[match.end():]
    if yaml.safe_load(rendered)!=new:raise ValueError('registry replacement escaped AP entry')
    (a.save/'plugins.BEFORE.yaml').write_bytes(raw);(a.save/'plugins.AFTER.yaml').write_text(rendered)
    (a.public/'plugins.AFTER.yaml').write_text(rendered);(a.public/'plugins.AFTER.yaml').chmod(0o644)
    for path in [a.save/'plugins.BEFORE.yaml',a.save/'plugins.AFTER.yaml']:path.chmod(0o600)
    g=runpy.run_path('/usr/local/sbin/montazh-okno',run_name='ap'+c_new+'_plan')['main'].__globals__
    checks=[{'kind':'file',**{k:x[k] for k in ['path','sha256','mode','uid','gid']}} for x in rows]
    for eid in IDS:
        e=after[eid];c={'kind':'registry','path':str(a.registry),'id':eid,'expected':{'id':eid,'version':e['version']}}
        if 'derevo' in e:
            c['derevo_consistency']=True;c['expected']['derevo.ref']=e['derevo']['ref']
            c['expected']['derevo.address']=e['derevo']['address'];c['expected']['derevo.subdir']=e['derevo']['subdir']
            c['owned_files']=[{k:f[k] for k in ['local','remote']} for f in e['derevo']['files']]
            if eid=='dsh-autopilot':c['expected']['path']=e['path']
        else:c['values_consistency']=True;c['owned_paths']=g['check_paths'](e)
        checks.append(c)
    # File producers pin BEFORE ownership without future version/ref fields. Keep
    # these exact admission checks beside (not instead of) the strict AFTER checks.
    targets={row['path'] for row in rows}
    for eid,e in entries.items():
        dv=e.get('derevo')
        if isinstance(dv,dict):
            if not targets & {f['local'] for f in dv['files']}:continue
            c={'kind':'registry','path':str(a.registry),'id':eid,
               'expected':{'id':eid,'derevo.address':dv.get('address'),'derevo.subdir':dv.get('subdir')},
               'owned_files':[{k:f[k] for k in ('local','remote')} for f in dv['files']],
               'derevo_consistency':True}
        elif e.get('installed_check') and targets & set(g['check_paths'](e)):
            c={'kind':'registry','path':str(a.registry),'id':eid,'expected':{'id':eid},
               'owned_paths':g['check_paths'](e),'owned_dirs':[], 'values_consistency':True}
        else:continue
        if eid not in IDS:raise ValueError('producer touches entry outside accepted scope: '+eid)
        if dv and any(pair not in [{k:f[k] for k in ('local','remote')} for f in after[eid]['derevo']['files']] for pair in c['owned_files']):
            raise ValueError('producer ownership would not survive AFTER: '+eid)
        if c.get('values_consistency') and c['owned_paths']!=g['check_paths'](after[eid]):
            raise ValueError('producer paths would not survive AFTER: '+eid)
        if c not in checks:checks.append(c)
    for name,version in PACKAGES.items():checks.append({'kind':'tag','repo':str(a.repo),'ref':name+'-v'+version,'commit':source_commit,'subdir':'packages/'+name,'tree':release['trees'][name],'vow_consistency':True,'release_aliases':[name+'-v'+version]})
    subjects=['file:'+x['path'] for x in rows]+['entry:'+eid for eid in IDS]+['tag:'+str(a.repo)+':'+name+'-v'+version for name,version in PACKAGES.items()]
    forward={'subjects':subjects,'checks':checks};g['plan_shape'](**forward);inverse=g['trusted_rollback'](subjects,checks);g['plan_shape'](**inverse)
    for name,obj in [('forward.native.json',forward),('inverse.native.json',inverse),('INVENTORY.json',rows)]:
        f=a.save/name;f.write_text(json.dumps(obj,indent=2)+'\n');f.chmod(0o600)
    # Pin only missing directories under the three new immutable roots. Shared
    # ancestors must already exist; no ownership claim is made over them.
    roots=[target(shelf),*[target(t) for t in new_trees]]
    directory_names=set()
    for path in [*[Path(r['path']) for r in rows],*[Path(r['path']) for r in core_links]]:
        for parent in path.parents:
            if not any(parent==r or parent.is_relative_to(r) for r in roots):break
            directory_names.add(str(parent))
    directories=sorted(directory_names,key=lambda n:(len(Path(n).parts),n))
    if not 0<len(directories)<=256:raise ValueError('directory inventory exceeds 256 or is empty')
    for r in roots:
        if not r.parent.is_dir() or r.parent.resolve()!=r.parent:raise ValueError('shared ancestor must already exist: '+str(r.parent))
    if any(os.path.lexists(p) for p in directories):raise ValueError('planned directory already exists')
    directory_plan=a.save/'DIRECTORIES.plan.json'
    directory_plan.write_text(json.dumps(directories,indent=2)+'\n');directory_plan.chmod(0o600)
    record={'task':task,'source_commit':source_commit,'source_trees':release['trees'],'registry_before_sha256':hashlib.sha256(raw).hexdigest(),'registry_after_sha256':hashlib.sha256(rendered.encode()).hexdigest(),
        'shared_upstream':shared,'directories_plan_sha256':sha(directory_plan),'core_links':core_links,'core_new_trees':new_trees,'core_directories':core_directories,'file_targets':len(rows),'public':str(a.public),'root':str(a.root),'registry':str(a.registry),'repo':str(a.repo),'shelf':shelf,'layout_before_manifest':str(old_mf),'groups':[{ 'group':i,'files':sum(r['group']==i for r in rows)} for i in range(5)]}
    (a.save/'PREPARED.json').write_text(json.dumps(record,indent=2)+'\n');(a.save/'PREPARED.json').chmod(0o600)
    groups={i:[r for r in rows if r['group']==i] for i in range(5)}
    ordered=list(range(5))
    for index in ordered:
        selected=sorted(groups[index],key=lambda r:r['logical'])
        if not selected:raise ValueError('empty declared producer group-'+str(index))
        mode=selected[0]['mode'];uid=selected[0]['uid'];gid=selected[0]['gid']
        if any((r['mode'],r['uid'],r['gid'])!=(mode,uid,gid) for r in selected):raise ValueError('mixed metadata producer group')
        common=['/usr/local/sbin/smontirovat-fajly','--punkt',task,'--ruka',a.actor,'--novyj','--mode='+format(mode,'o'),'--owner='+str(uid)+':'+str(gid)]
        for row in selected:common+=['--osnova',row['logical'].lstrip('/')+'='+(row['before']['sha256'] if row['before'] else 'net')]
        common += [str(payload),str(a.root)]+[row['logical'].lstrip('/') for row in selected]
        run=['--okno-id','ID_AP']
        for label,options in [('progon',['--progon']),('mount',run+['--v-boj'])]:
            line=shlex.join([common[0],*options,*common[1:]])
            if label=='mount':line=line.replace('ID_AP','"$1"')
            header='#!/bin/bash\nset -euo pipefail\n'+('[ "$#" = 1 ] && [[ "$1" =~ ^[0-9a-f]{32}$ ]] || exit 2\n' if label=='mount' else '[ "$#" = 0 ] || exit 2\n')
            path=a.save/('group-'+str(index)+'.'+label+'.sh');path.write_text(header+'export SMF_REESTR_PL='+shlex.quote(str(a.registry))+'\nexec '+line+'\n');path.chmod(0o700)
    # Exercise the installed native admission parser for EVERY producer before any
    # live write. Private MO state only; rows describe intended bytes, not a mount.
    state=a.save/'native-preflight';state.mkdir(mode=0o700)
    ident=None;proof=[]
    try:
        for index,group in enumerate(ordered):
            selected=groups[group];rowfile=state/('group-'+str(index)+'.tsv')
            rowfile.write_text(''.join('\t'.join([r['path'],r['sha256'],str(r['uid']),str(r['gid']),format(r['mode'],'o')])+'\n' for r in selected));rowfile.chmod(0o600)
            args=['/usr/local/sbin/montazh-okno','--state-dir',str(state),'podgotovit',
                  '--rows',str(rowfile),'--registry',str(a.registry),'--task',task+'-PREFLIGHT','--actor',a.actor]
            args+=['--plan',str(a.save/'forward.native.json')] if ident is None else ['--id',ident]
            result=subprocess.run(args,capture_output=True,text=True,timeout=60)
            proof.append({'group':index,'exit':result.returncode,'stderr':result.stderr.strip()})
            if result.returncode:raise ValueError('native producer preflight group-'+str(index)+': '+result.stderr.strip())
            if ident is None:ident=result.stdout.strip()
    finally:
        if ident is not None:
            subprocess.run(['/usr/local/sbin/montazh-okno','--state-dir',str(state),'otkat-proveren',
                            '--plan',str(a.save/'inverse.native.json'),ident],capture_output=True,text=True,check=True,timeout=120)
    if json.loads((state/(ident+'.json')).read_text())['phase']!='rolled_back':raise ValueError('private preflight not retired')
    (a.save/'NATIVE-PREFLIGHT.json').write_text(json.dumps({'groups':proof,'private_state':str(state),'id':ident,'phase':'rolled_back'},indent=2)+'\n')
    (a.public/'PREPARED.public.json').write_text(json.dumps({k:record[k] for k in ['source_commit','source_trees','registry_after_sha256','file_targets','shelf','core_links','core_new_trees']},indent=2)+'\n');(a.public/'PREPARED.public.json').chmod(0o644)
    print('PREPARED_ONLY '+str(a.save)+'; public_registry='+str(a.public/'plugins.AFTER.yaml')+'; file_targets='+str(len(rows)))


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as error:
        print('PREPARATION_REFUSED '+type(error).__name__+': '+str(error),file=sys.stderr);raise SystemExit(2)
