#!/usr/bin/python3
"""Narrow updater integration: real SMF/MO/pravka, writable fixture only."""
import fcntl,hashlib,json,os,shutil,stat,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path
import yaml

BASE=Path(__file__).resolve().parent
PROGRAM=Path(os.environ.get('AP011_PROGRAM',str(BASE/'update-polka-011.py')))
ASSETS=Path(os.environ.get('AP011_ASSETS',str(BASE/'fixtures')))
MAN='/usr/local/libexec/dsh-autopilot/layout-expected.json'
digest=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
canonical=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def inventory(root):
    out={}
    for p in sorted(root.rglob('*')):
        s=p.lstat();row=[stat.S_IFMT(s.st_mode),stat.S_IMODE(s.st_mode),s.st_uid,s.st_gid]
        row.append(os.readlink(p) if p.is_symlink() else digest(p) if p.is_file() else None)
        row.append({k:os.getxattr(p,k,follow_symlinks=False).hex() for k in os.listxattr(p,follow_symlinks=False)})
        out[str(p.relative_to(root))]=row
    return out

class Updater(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid()!=0:raise RuntimeError('root fixture required')
        if not PROGRAM.exists():raise AssertionError('narrow updater entrypoint missing')

    def setUp(self):
        self.events=[]
        self.tmp=tempfile.TemporaryDirectory(prefix='ap011-updater-',dir='/var/tmp')
        self.base=Path(self.tmp.name);self.base.chmod(0o755)
        self.root=self.base/'root';self.root.mkdir(mode=0o755)
        manifest=json.loads((ASSETS/'before-manifest.json').read_text())
        # Full real baseline by manifest names, plus existing install-lock and complete old shelf.
        for row in manifest['rows']:
            src=Path(row['path']);dst=self.root/str(src).lstrip('/')
            dst.parent.mkdir(parents=True,exist_ok=True)
            if row['kind']=='dir':dst.mkdir(exist_ok=True)
            elif row['kind']=='link':dst.symlink_to(os.readlink(src))
            else:shutil.copy2(src,dst)
            if row['kind']!='link':os.chown(dst,row['uid'],row['gid']);os.chmod(dst,row['mode'])
        for p in self.root.rglob('*'):
            if p.is_dir() and not p.is_symlink():p.chmod(0o755)
        self.man=self.root/MAN.lstrip('/');shutil.copy2('/usr/local/libexec/dsh-autopilot/layout-expected.json',self.man)
        lock=self.root/'opt/autopilot/.install.lock';shutil.copy2('/opt/autopilot/.install.lock',lock)
        for n in ['group','gshadow']:
            (self.root/'etc'/n).write_text('FIXTURE-NSS-UNTOUCHED\n');(self.root/'etc'/n).chmod(0o600)
        key=self.root/'etc/dsh-autopilot/razdacha-klyuch';key.parent.mkdir(mode=0o700);key.write_text('0'*64+'\n');key.chmod(0o600)
        for path in ['srv','srv/autopilot','srv/autopilot/public','srv/autopilot/public/master']:
            p=self.root/path;p.mkdir(parents=True,exist_ok=True);s=Path('/'+path).stat();os.chown(p,s.st_uid,s.st_gid);p.chmod(stat.S_IMODE(s.st_mode))
        self.core=self.base/'core';self.core.mkdir()
        shutil.copytree(ASSETS/'core',self.core,dirs_exist_ok=True)
        self.man_new=self.base/'manifest-new.json';shutil.copy2(ASSETS/'after-manifest.json',self.man_new)
        self.repo=self.base/'repo';self.repo.mkdir()
        pkg=self.repo/'packages/dsh-autopilot';shutil.copytree(ASSETS/'package',pkg)
        self.g('init','-q');(self.repo/'.git/objects/info/alternates').write_text(str(ASSETS/'git-objects')+'\n')
        self.new_head=(ASSETS/'core-head.txt').read_text().strip()
        self.g('update-ref','HEAD',self.new_head)
        self.g('add','.');self.commit('fixture exact package')
        m=json.loads(self.man_new.read_text());source_shelf=next(x for x in m['managed'] if x.startswith('/opt/autopilot/packages/'))
        self.man_new.write_text(json.dumps(m,indent=2).replace(source_shelf,'/opt/autopilot/packages/'+self.new_head)+'\n')
        shutil.copy2(self.man_new,pkg/'checks/layout-expected.json');self.g('add','.');self.commit('fixture manifest after core')
        self.metadata_head=self.g('rev-parse','HEAD').decode().strip()
        before=json.loads((ASSETS/'before-entry.json').read_text());self.old_head=Path(before['path']).name
        before['derevo']['address']=str(self.repo)
        for f in before['derevo']['files']:f['local']=str(self.root/f['local'].lstrip('/'))
        before['path']=str(self.root/before['path'].lstrip('/'))
        check=str(self.root/'usr/local/libexec/dsh-autopilot/layout-check.py')
        before['installed_check']=f'/usr/bin/python3 -I -B {check} --manifest {self.man} --sha {digest(self.man)} --root {self.root}'
        self.registry=self.root/'etc/agent-registry/plugins.yaml';self.registry.parent.mkdir(parents=True)
        parent_stat=Path('/etc/agent-registry').stat();self.registry.parent.chmod(stat.S_IMODE(parent_stat.st_mode));os.chown(self.registry.parent,parent_stat.st_uid,parent_stat.st_gid)
        other=json.loads(json.dumps(before));other.pop('derevo');other.update(id='fixture-other',path=str(self.root/'other'),version='0.0.1',installed_check='/usr/bin/printf 0.0.1')
        self.registry.write_text(yaml.safe_dump({'services':[before,other]},sort_keys=False,allow_unicode=True))
        rs=Path('/etc/agent-registry/plugins.yaml').stat();self.registry.chmod(stat.S_IMODE(rs.st_mode));os.chown(self.registry,rs.st_uid,rs.st_gid)
        self.shelf=self.root/'opt/autopilot/packages'/self.new_head
        after=json.loads(json.dumps(before));after['version']='0.1.1';after['path']=str(self.shelf)
        after['derevo']['ref']='dsh-autopilot-v0.1.1'
        after['derevo']['files']=[f for f in after['derevo']['files'] if self.old_head not in f['local']]
        for p in sorted(self.core.rglob('*')):
            if p.is_file():after['derevo']['files'].append({'local':str(self.shelf/p.relative_to(self.core)),'remote':str(p.relative_to(self.core)),'mode':f'{stat.S_IMODE(p.stat().st_mode):04o}','owner':'root:root'})
        mapped={f['remote'] for f in after['derevo']['files']}
        after['derevo']['not_installed']=sorted(str(p.relative_to(pkg)) for p in pkg.rglob('*') if p.is_file() and str(p.relative_to(pkg)) not in mapped)
        after['installed_check']=f'/usr/bin/python3 -I -B {check} --manifest {self.man} --sha {digest(self.man_new)} --root {self.root}'
        self.save=self.root/'var/backups/montazh/AP011-test'
        self.params=self.base/'params.json'
        self.params.write_text(json.dumps({'schema':4,'root':str(self.root),'old_head':self.old_head,'new_head':self.new_head,'metadata_head':self.metadata_head,'core_file_count':len([p for p in self.core.rglob('*') if p.is_file()]),'manifest_before_sha256':digest(self.man),'manifest_after_sha256':digest(self.man_new),'core_source':str(self.core),'manifest_source':str(self.man_new),'before_entry_sha256':canonical(before),'after_entry':after,'task':'AP011-test','actor':'Zabava <zabava@aclaude>'}))
        self.bin=self.base/'bin';self.bin.mkdir();(self.bin/'logger').write_text('#!/bin/sh\nexit 0\n');(self.bin/'logger').chmod(0o755)
        for n in ['pary','manifest','nashi']:(self.base/n).write_text('')
        (self.base/'pair-source').write_text('fixture-pair');(self.base/'pair-target').write_text('fixture-pair')
        (self.base/'pary').write_text(str(self.base/'pair-source')+'|'+str(self.base/'pair-target')+'\n')
        (self.base/'backups').mkdir();(self.base/'mo').mkdir()
        self.env=dict(os.environ,PATH=str(self.bin)+':/usr/local/bin:/usr/bin:/bin',MO_STATE_DIR=str(self.base/'mo'),MO_DEREVO_REPO=str(self.repo),PLUGINS_REGISTRY=str(self.registry),AGENT_PLUGINS_STRAHOVKI=str(self.base/'backups'),AGENT_PLUGINS_RUKA='Zabava <zabava@aclaude>',SMF_REESTR_PL=str(self.registry),SMF_PARY=str(self.base/'pary'),SMF_MANIFEST=str(self.base/'manifest'),SMF_NASHI=str(self.base/'nashi'),SMF_DORABOTKI=str(self.base/'dorabotki'),SMF_ZAMOK=str(self.base/'smf.lock'),GIT_CONFIG_COUNT='1',GIT_CONFIG_KEY_0='safe.directory',GIT_CONFIG_VALUE_0=str(self.repo))
        self.before=inventory(self.root)

    def tearDown(self):
        if os.environ.get('AP011_EVIDENCE'):
            out=Path(os.environ['AP011_EVIDENCE']);out.mkdir(parents=True,exist_ok=True)
            target=out/(self._testMethodName+'.json');self.assertFalse(target.exists(),'evidence must not be overwritten')
            target.write_text(json.dumps({'test':self._testMethodName,'params':json.loads(self.params.read_text()),'before':self.before,'final':inventory(self.root),'events':self.events,'mo':[json.loads(p.read_text()) for p in (self.base/'mo').glob('*.json')]},ensure_ascii=False,indent=2)+'\n')
        self.tmp.cleanup()
    def g(self,*a,input=None):return subprocess.check_output(['git','-C',str(self.repo),*a],stderr=subprocess.STDOUT,input=input)
    def commit(self,message,parent=True):
        # Graft the staged package onto the real CORE monorepo tree. Other packages stay byte-identical.
        staged=self.g('write-tree').decode().strip()
        package=self.g('rev-parse',staged+':packages/dsh-autopilot').decode().strip()
        def graft(tree,name,oid):
            entries=self.g('ls-tree','-z',tree).split(b'\0');entries=[e for e in entries if e and e.split(b'\t',1)[1]!=name.encode()]
            entries.append(b'040000 tree '+oid.encode()+b'\t'+name.encode())
            return self.g('mktree','-z','--missing',input=b'\0'.join(entries)+b'\0').decode().strip()
        packages=graft(self.g('rev-parse','HEAD:packages').decode().strip(),'dsh-autopilot',package)
        tree=graft(self.g('rev-parse','HEAD^{tree}').decode().strip(),'packages',packages)
        args=['-p',self.g('rev-parse','HEAD').decode().strip()] if parent else []
        commit=self.g('-c','user.name=Fixture','-c','user.email=fixture@local','commit-tree',tree,*args,'-m',message).decode().strip()
        self.g('update-ref','HEAD',commit)
        return commit
    def cli(self,mode,*args):
        # Host is read-only. Actual tools may write only the explicit fixture and private /tmp/backups.
        cmd=['bwrap','--die-with-parent','--unshare-pid','--unshare-net','--ro-bind','/','/','--bind',str(self.base),str(self.base),'--bind',str(self.base/'backups'),'/var/backups','--proc','/proc','--dev','/dev','--tmpfs','/tmp']
        if getattr(self,'deny_packages',False):cmd+=['--ro-bind',str(self.shelf.parent),str(self.shelf.parent)]
        execution=[str(PROGRAM)]
        if getattr(self,'git_timeout',False):
            driver=self.base/'git-timeout.py'
            driver.write_text("import runpy,subprocess,sys\noriginal=subprocess.check_output\ndef read(cmd,*a,**kw):\n if cmd[0]=='git':raise subprocess.TimeoutExpired(cmd,kw.get('timeout',20))\n return original(cmd,*a,**kw)\nsubprocess.check_output=read\nsys.argv=sys.argv[1:]\nrunpy.run_path(sys.argv[0],run_name='__main__')\n")
            execution=[str(driver),str(PROGRAM)]
        cmd+=['--',sys.executable,'-B',*execution,'--params',str(self.params),'--save',str(self.save),mode,*args]
        p=subprocess.run(cmd,env=self.env,capture_output=True,text=True,timeout=120)
        self.events.append({'mode':mode,'args':list(args),'rc':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'inventory':self.live()})
        (self.base/('last-'+mode+'.log')).write_text(p.stdout+p.stderr)
        return p
    def ok(self,p):self.assertEqual(p.returncode,0,p.stdout+p.stderr)
    def stop(self,p):self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertIn('STOP',p.stderr+p.stdout)
    def live(self):
        # SAVE is deliberately outside the baseline comparison.
        d=inventory(self.root)
        return {k:v for k,v in d.items() if not (k=='var' or k.startswith('var/'))}

    def test_update_check_return_exact_and_repeat_nothing(self):
        before=self.live();self.ok(self.cli('apply','--v-boj'))
        self.assertTrue(self.shelf.is_dir());self.assertEqual(digest(self.man),digest(self.man_new))
        state=json.loads((self.save/'state.json').read_text());self.assertRegex(state['window_id'],'^[0-9a-f]{32}$')
        self.assertEqual(len(list((self.base/'mo').glob('*.json'))),1)
        installed=self.live();saved=inventory(self.save);mo=inventory(self.base/'mo')
        self.ok(self.cli('check-rollback'));self.assertEqual(self.live(),installed);self.assertEqual(inventory(self.save),saved);self.assertEqual(inventory(self.base/'mo'),mo)
        self.assertEqual(state['phase'],'awaiting_tag')
        self.assertEqual(subprocess.run(['git','-C',str(self.repo),'show-ref','--verify','--quiet','refs/tags/dsh-autopilot-v0.1.1']).returncode,1)
        self.g('tag','dsh-autopilot-v0.1.1',self.metadata_head)
        self.ok(self.cli('finish'));self.assertEqual(inventory(self.save),saved);self.assertEqual(inventory(self.base/'mo'),mo)
        self.ok(self.cli('finish','--v-boj'));self.assertEqual(json.loads(next((self.base/'mo').glob('*.json')).read_text())['phase'],'closed')
        self.ok(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),before)
        again=self.cli('rollback','--v-boj');self.ok(again);self.assertIn('нечего',again.stdout);self.assertEqual(self.live(),before)

    def test_foreign_manifest_refuses_before_all_rollback_actions(self):
        self.ok(self.cli('apply','--v-boj'));old=digest(self.man)
        with self.man.open('a') as f:f.write('\nFOREIGN-MANIFEST\n')
        self.assertNotEqual(old,digest(self.man));self.assertEqual(self.man.read_text().count('FOREIGN-MANIFEST'),1)
        installed=self.live();self.stop(self.cli('check-rollback'));self.stop(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),installed)
        self.assertTrue(self.shelf.exists())
        shutil.copyfile(self.man_new,self.man);self.ok(self.cli('rollback','--v-boj'))

    def test_existing_new_shelf_stops_before_save_or_window(self):
        self.shelf.mkdir();before=self.live();self.stop(self.cli('apply','--v-boj'))
        self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_bad_before_manifest_stops_without_actions(self):
        with self.man.open('a') as f:f.write('FOREIGN')
        before=self.live();self.stop(self.cli('apply','--v-boj'));self.assertEqual(self.live(),before);self.assertFalse(self.save.exists())

    def test_changed_entry_stops_without_actions(self):
        d=yaml.safe_load(self.registry.read_text());d['services'][0]['note']='foreign';self.registry.write_text(yaml.safe_dump(d))
        before=self.live();self.stop(self.cli('apply','--v-boj'));self.assertEqual(self.live(),before);self.assertFalse(self.save.exists())

    def test_dry_apply_does_not_create_save_or_lock(self):
        self.assertEqual(self.g('tag','--list','dsh-autopilot-v0.1.1'),b'')
        before=inventory(self.base);self.ok(self.cli('apply'));after=inventory(self.base)
        before.pop('last-apply.log',None);after.pop('last-apply.log',None)
        self.assertEqual(after,before);self.assertFalse(self.save.exists())

    def test_unknown_cli_and_bad_source_refuse_without_save(self):
        self.stop(self.cli('apply','--dry-run'));self.assertFalse(self.save.exists())
        with (self.core/'package.json').open('a') as f:f.write('bad-source')
        before=self.live();self.stop(self.cli('apply','--v-boj'));self.assertEqual(before,self.live());self.assertFalse(self.save.exists())

    def test_new_shelf_extra_file_blocks_rollback(self):
        self.ok(self.cli('apply','--v-boj'));(self.shelf/'FOREIGN').write_text('new data')
        installed=self.live();self.stop(self.cli('rollback','--v-boj'));self.assertEqual(installed,self.live())

    def test_other_registry_entry_survives_rollback(self):
        self.ok(self.cli('apply','--v-boj'))
        data=yaml.safe_load(self.registry.read_text());data['services'][1]['note']='other operator update';self.registry.write_text(yaml.safe_dump(data,sort_keys=False,allow_unicode=True))
        with self.registry.open('a') as f:f.write('\n# another operator comment\n')
        self.ok(self.cli('rollback','--v-boj'));self.assertIn('# another operator comment',self.registry.read_text())
        self.assertEqual(yaml.safe_load(self.registry.read_text())['services'][1]['note'],'other operator update')

    def test_manifest_metadata_change_blocks_before_any_rollback(self):
        self.ok(self.cli('apply','--v-boj'));self.man.chmod(0o600);installed=self.live()
        self.stop(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),installed)

    def test_real_smf_failure_after_registry_has_safe_partial_return(self):
        before=self.live();self.deny_packages=True;self.stop(self.cli('apply','--v-boj'));self.deny_packages=False
        self.assertNotEqual(yaml.safe_load(self.registry.read_text())['services'][0]['version'],'0.1.0')
        self.ok(self.cli('check-rollback'));self.ok(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),before)

    def test_repeat_rollback_after_mo_cleanup_is_readonly_nothing(self):
        self.ok(self.cli('apply','--v-boj'));self.ok(self.cli('rollback','--v-boj'))
        for p in (self.base/'mo').glob('*.json'):p.unlink()
        before=self.live();p=self.cli('rollback','--v-boj');self.ok(p);self.assertIn('нечего',p.stdout);self.assertEqual(self.live(),before)

    def test_busy_real_smf_lock_cleans_temporary_files_before_return(self):
        # Only the dependency's300s wait is shortened to1s; real flock and actual SMF cleanup run.
        script=self.bin/'flock';script.write_text('#!/bin/sh\nif [ "$1" = -w ] && [ "$2" = 300 ]; then shift 2; exec /usr/bin/flock -w 1 "$@"; fi\nexec /usr/bin/flock "$@"\n');script.chmod(0o755)
        before=self.live()
        with (self.base/'smf.lock').open('w') as lock:
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('замок',result.stdout)
        self.assertEqual(list((self.root/'opt/autopilot/packages').rglob('*.smf-*')),[])
        self.ok(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),before)

    def test_window_lock_blocks_check_and_rollback_without_changes(self):
        self.ok(self.cli('apply','--v-boj'));before=self.live();saved=inventory(self.save)
        with (self.save/'LOCK').open('rb') as lock:
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.stop(self.cli('check-rollback'));self.stop(self.cli('rollback','--v-boj'))
        self.assertEqual(self.live(),before);self.assertEqual(inventory(self.save),saved)

    def test_registry_commits_use_parameter_actor_over_inherited_identity(self):
        repo=self.registry.parent
        def git(*a):return subprocess.check_output(['git','-C',str(repo),*a],stderr=subprocess.STDOUT,text=True)
        git('init','-q');git('add','plugins.yaml');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','before')
        self.env['AGENT_PLUGINS_RUKA']='Foreign <foreign@local>'
        for who in ['AUTHOR','COMMITTER']:
            self.env['GIT_'+who+'_NAME']='Foreign';self.env['GIT_'+who+'_EMAIL']='foreign@local'
        self.ok(self.cli('apply','--v-boj'))
        self.assertEqual(git('log','-1','--format=%an <%ae>').strip(),'Zabava <zabava@aclaude>')
        self.assertEqual(git('log','-1','--format=%cn <%ce>').strip(),'Zabava <zabava@aclaude>')

        self.ok(self.cli('rollback','--v-boj'))
        self.assertEqual(git('log','-1','--format=%an <%ae>').strip(),'Zabava <zabava@aclaude>')
        self.assertEqual(git('log','-1','--format=%cn <%ce>').strip(),'Zabava <zabava@aclaude>')

    def test_retarget_head_manifest_and_core_count_by_data_only(self):
        baseline=self.live();old_shelf=self.shelf;pkg=self.repo/'packages/dsh-autopilot'
        (self.core/'head-parameter-probe.md').write_text('accepted extra core file\n')
        shutil.copy2(self.core/'head-parameter-probe.md',pkg/'head-parameter-probe.md')
        self.g('add','.');self.commit('next core')
        new_head=self.g('rev-parse','HEAD').decode().strip();self.assertNotEqual(new_head,self.new_head)
        new_shelf='/opt/autopilot/packages/'+new_head
        m=json.loads(self.man_new.read_text());m=json.loads(json.dumps(m).replace('/opt/autopilot/packages/'+self.new_head,new_shelf))
        m['rows'].append({'path':new_shelf+'/head-parameter-probe.md','kind':'file','mode':0o644,'uid':0,'gid':0,'sha256':digest(self.core/'head-parameter-probe.md')});m['rows'].sort(key=lambda r:r['path'])
        self.man_new.write_text(json.dumps(m,indent=2)+'\n');shutil.copy2(self.man_new,pkg/'checks/layout-expected.json')
        self.g('add','.');self.commit('next manifest')
        p=json.loads(self.params.read_text());p['new_head']=new_head;p['metadata_head']=self.g('rev-parse','HEAD').decode().strip();p['manifest_after_sha256']=digest(self.man_new);p['core_file_count']+=1
        self.shelf=self.root/new_shelf.lstrip('/');p['after_entry']=json.loads(json.dumps(p['after_entry']).replace(str(old_shelf),str(self.shelf)))
        p['after_entry']['derevo']['files'].append({'local':str(self.shelf/'head-parameter-probe.md'),'remote':'head-parameter-probe.md','mode':'0644','owner':'root:root'})
        p['after_entry']['installed_check']=f'/usr/bin/python3 -I -B {self.root}/usr/local/libexec/dsh-autopilot/layout-check.py --manifest {self.man} --sha {digest(self.man_new)} --root {self.root}'
        self.params.write_text(json.dumps(p));self.new_head=new_head
        self.ok(self.cli('apply','--v-boj'));self.assertFalse(old_shelf.exists());self.assertTrue((self.shelf/'head-parameter-probe.md').is_file())
        self.ok(self.cli('check-rollback'));self.g('tag','dsh-autopilot-v0.1.1',p['metadata_head']);self.ok(self.cli('finish','--v-boj'));self.ok(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),baseline)

    def test_missing_or_malformed_pins_refuse_before_save(self):
        original=json.loads(self.params.read_text())
        for field,value in [('new_head','../outside'),('new_head',self.old_head),('metadata_head',None),('metadata_head','HEAD'),('manifest_after_sha256',''),('manifest_after_sha256','f'*64),('manifest_before_sha256','not-a-sha'),('manifest_before_sha256','f'*64),('before_entry_sha256',''),('core_file_count',True),('core_file_count',0),('core_file_count',len([p for p in self.core.rglob('*') if p.is_file()])-1),('after_entry',None)]:
            with self.subTest(field=field,value=value):
                data=dict(original);data[field]=value;self.params.write_text(json.dumps(data));baseline=self.live();self.stop(self.cli('apply','--v-boj'));self.assertEqual(self.live(),baseline);self.assertFalse(self.save.exists())
        self.params.write_text(json.dumps(original))

    def test_pin_change_after_apply_blocks_return_before_actions(self):
        self.ok(self.cli('apply','--v-boj'));baseline=self.live()
        p=json.loads(self.params.read_text());p['manifest_after_sha256']='0'*64;self.params.write_text(json.dumps(p))
        self.stop(self.cli('check-rollback'));self.stop(self.cli('rollback','--v-boj'));self.assertEqual(self.live(),baseline)

    def test_git_read_timeout_is_stop2_before_save(self):
        baseline=self.live();self.git_timeout=True
        self.stop(self.cli('apply','--v-boj'));self.assertEqual(self.live(),baseline);self.assertFalse(self.save.exists())

    def test_metadata_head_requires_exactly_40_hex_before_any_action(self):
        original=json.loads(self.params.read_text());before=self.live()
        for value in [self.metadata_head[:39],self.metadata_head[:12],'a'*41,'g'*40,'HEAD']:
            with self.subTest(metadata_head=value):
                p=dict(original);p['metadata_head']=value;self.params.write_text(json.dumps(p))
                result=self.cli('apply','--v-boj');self.stop(result)
                self.assertIn('полная голова в параметре metadata_head',result.stderr)
                self.assertEqual(self.live(),before);self.assertFalse(self.save.exists())
                self.assertEqual(list((self.base/'mo').glob('*.json')),[])
        self.params.write_text(json.dumps(original))

    def test_unknown_metadata_head_stops_before_any_action(self):
        p=json.loads(self.params.read_text());p['metadata_head']='f'*40;self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('f'*40,result.stderr);self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_head_blob_differs_from_source_stops_before_action(self):
        path=self.repo/'packages/dsh-autopilot/checks/layout-expected.json'
        with path.open('a') as f:f.write('\n')
        self.g('add','.');self.commit('different source blob')
        p=json.loads(self.params.read_text());p['metadata_head']=self.g('rev-parse','HEAD').decode().strip();self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('коммит ≠ публикации',result.stderr);self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_core_mode_change_stops_before_any_action(self):
        path=self.repo/'packages/dsh-autopilot/README.md';path.chmod(0o755)
        self.g('add','.');head=self.commit('unexpected CORE mode change')
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('дельта metadata',result.stderr)
        self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_core_bytes_change_stops_before_any_action(self):
        path=self.repo/'packages/dsh-autopilot/README.md'
        with path.open('a') as f:f.write('\nUNEXPECTED-OWN-CORE-CHANGE\n')
        self.g('add','.');head=self.commit('unexpected own CORE bytes change')
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('packages/dsh-autopilot/README.md',result.stderr)
        self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_unpublished_file_change_stops_before_any_action(self):
        path=self.repo/'packages/dsh-autopilot/checks/README.md'
        with path.open('a') as f:f.write('\nUNEXPECTED-CHECK-DOC\n')
        self.g('add','.');head=self.commit('unexpected unpublished change')
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('дельта metadata',result.stderr)
        self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_without_core_ancestor_stops_before_any_action(self):
        head=self.commit('same tree unrelated history',parent=False)
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        result=self.cli('apply','--v-boj');self.stop(result);self.assertIn('происхождение metadata',result.stderr)
        self.assertEqual(self.live(),before);self.assertFalse(self.save.exists());self.assertEqual(list((self.base/'mo').glob('*.json')),[])

    def test_metadata_change_outside_package_is_ignored(self):
        blob=self.g('hash-object','-w','--stdin',input=b'FOREIGN-ROOT-CHANGE\n').strip()
        entries=self.g('ls-tree','-z','HEAD^{tree}')
        tree=self.g('mktree','-z','--missing',input=entries+b'100644 blob '+blob+b'\tUNRELATED-ROOT\0').decode().strip()
        head=self.g('-c','user.name=Fixture','-c','user.email=fixture@local','commit-tree',tree,'-p',self.metadata_head,'-m','unexpected monorepo root change').decode().strip()
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        self.ok(self.cli('apply','--v-boj'));self.ok(self.cli('check-rollback'));self.ok(self.cli('rollback','--v-boj'))
        self.assertEqual(self.live(),before)

    def test_metadata_change_in_other_package_is_ignored(self):
        foreign='packages/dsh-telegram-multiagent/README.md'
        original=self.g('show',self.new_head+':'+foreign);changed=original+b'\nFOREIGN-PACKAGE-CHANGE\n'
        self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(changed).hexdigest())
        self.assertEqual(changed.count(b'FOREIGN-PACKAGE-CHANGE'),1)
        blob=self.g('hash-object','-w','--stdin',input=changed).decode().strip()
        def replace(tree,name,oid,kind,mode):
            entries=[e for e in self.g('ls-tree','-z',tree).split(b'\0') if e and e.split(b'\t',1)[1]!=name.encode()]
            entries.append((mode+' '+kind+' '+oid+'\t'+name).encode())
            return self.g('mktree','-z','--missing',input=b'\0'.join(entries)+b'\0').decode().strip()
        neighbor=replace('HEAD:packages/dsh-telegram-multiagent','README.md',blob,'blob','100644')
        packages=replace('HEAD:packages','dsh-telegram-multiagent',neighbor,'tree','040000')
        tree=replace('HEAD^{tree}','packages',packages,'tree','040000')
        head=self.g('-c','user.name=Fixture','-c','user.email=fixture@local','commit-tree',tree,'-p',self.metadata_head,'-m','foreign package changed after CORE').decode().strip()
        self.assertEqual(self.g('diff','--name-only',self.new_head,head,'--','packages/dsh-telegram-multiagent').decode().splitlines(),[foreign])
        self.assertEqual(self.g('show',head+':'+foreign),changed)
        p=json.loads(self.params.read_text());p['metadata_head']=head;self.params.write_text(json.dumps(p));before=self.live()
        self.ok(self.cli('apply','--v-boj'));self.ok(self.cli('check-rollback'));self.ok(self.cli('rollback','--v-boj'))
        self.assertEqual(self.live(),before);self.assertEqual(self.g('show',head+':'+foreign),changed)

    def test_finish_without_tag_stops_readonly_and_rollback_needs_no_tag(self):
        self.ok(self.cli('apply','--v-boj'));before=self.live();saved=inventory(self.save);mo=inventory(self.base/'mo')
        result=self.cli('finish','--v-boj');self.stop(result);self.assertIn('dsh-autopilot-v0.1.1',result.stderr)
        self.assertEqual(self.live(),before);self.assertEqual(inventory(self.save),saved);self.assertEqual(inventory(self.base/'mo'),mo)
        self.ok(self.cli('check-rollback'));self.ok(self.cli('rollback','--v-boj'))

    def test_same_tree_wrong_commit_tag_cannot_close(self):
        self.ok(self.cli('apply','--v-boj'))
        self.g('tag','dsh-autopilot-v0.1.1',self.metadata_head)
        driver=self.base/'native-verify.py'
        driver.write_text("import importlib.machinery,importlib.util,json,sys\nloader=importlib.machinery.SourceFileLoader('native_mo','/usr/local/sbin/montazh-okno')\nspec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)\np=json.load(open(sys.argv[1]));m.plan_shape(p['subjects'],p['checks']);errors=m.verify(p['checks']);print(' | '.join(errors));sys.exit(1 if errors else 0)\n")
        def native():
            command=['bwrap','--die-with-parent','--unshare-pid','--unshare-net','--ro-bind','/','/','--bind',str(self.base),str(self.base),'--bind',str(self.base/'backups'),'/var/backups','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--',sys.executable,'-B',str(driver),str(self.save/'forward.json')]
            p=subprocess.run(command,env=self.env,capture_output=True,text=True,timeout=60)
            self.events.append({'mode':'native-verify','args':[],'rc':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'inventory':self.live()})
            return p
        healthy=native();self.assertEqual(healthy.returncode,0,healthy.stdout+healthy.stderr)
        tagfile=self.repo/'.git/refs/tags/dsh-autopilot-v0.1.1';before_tag=digest(tagfile)
        self.commit('same tree different commit')
        wrong=self.g('rev-parse','HEAD').decode().strip();self.assertNotEqual(wrong,self.metadata_head)
        self.g('tag','-f','dsh-autopilot-v0.1.1',wrong);self.assertNotEqual(before_tag,digest(tagfile))
        self.assertEqual(subprocess.check_output(['grep','-cF',wrong,str(tagfile)],text=True).strip(),'1')
        print('TAG-CORRUPTION one replacement; SHA before='+before_tag+' after='+digest(tagfile))
        before=self.live();saved=inventory(self.save)
        result=self.cli('finish','--v-boj');self.stop(result);self.assertIn('метка ≠ metadata_head',result.stderr)
        self.assertEqual(self.live(),before);self.assertEqual(inventory(self.save),saved)
        # Independent native reader must also reject the wrong commit, even though all bytes match.
        ident=json.loads((self.save/'state.json').read_text())['window_id']
        p=native();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertIn('tag differs',p.stdout);self.assertEqual(json.loads((self.base/'mo'/(ident+'.json')).read_text())['phase'],'open')
        self.g('tag','-f','dsh-autopilot-v0.1.1',self.metadata_head);self.assertEqual(digest(tagfile),before_tag)
        returned=native();self.assertEqual(returned.returncode,0,returned.stdout+returned.stderr)
        self.ok(self.cli('finish','--v-boj'))
        self.ok(self.cli('rollback','--v-boj'))

if __name__=='__main__':unittest.main(verbosity=2)
