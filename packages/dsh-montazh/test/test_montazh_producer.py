"""Real installers, private Git/files/state; all system/notification commands are fixtures."""
import hashlib, json, os, shutil, subprocess, tempfile, unittest
from unittest import mock
from pathlib import Path
PKG=Path(__file__).resolve().parents[1]

class Producers(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='montazh-producer-');self.r=Path(self.tmp.name);self.b=self.r/'bin';self.b.mkdir();self.source=self.r/'candidate';self.source.mkdir();self.live=self.r/'live';self.live.mkdir();self.state=self.r/'windows';self.state.mkdir(mode=0o755)
  self.target=self.live/'x';self.target.write_text('old');(self.source/'x').write_text('new')
  (self.r/'registry.yaml').write_text('plugins: []\nservices: []\n');(self.r/'manifest').write_text('');(self.r/'nashi').write_text('');(self.r/'pairs').write_text(str(self.r/'unrelated-src')+'|'+str(self.r/'unrelated-boj')+'\n')  # B-N-2036: пустой учёт пар — отказ, а не «пар нет»
  for cmd in ('systemctl','journalctl','logger'):
   p=self.b/cmd;p.write_text('#!/bin/sh\nexit 0\n');p.chmod(0o755)
  # The real mv is intercepted at its external command boundary to verify BEFORE replacement.
  p=self.b/'mv';p.write_text('''#!/usr/bin/env python3
import json,os,sys,subprocess
from pathlib import Path
target=Path(sys.argv[-1]);expected=Path(os.environ['FIXTURE_TARGET'])
if target==expected or target.is_relative_to(Path(os.environ['FIXTURE_LIVE'])):
 rows=[json.loads(p.read_text()) for p in Path(os.environ['MO_STATE_DIR']).glob('*.json')]
 good=any(x['phase']=='open' and 'file:'+str(target) in x['subjects'] for x in rows)
 with open(os.environ['FIXTURE_MV_TRACE'],'a') as f:f.write(json.dumps({'active_before_mv':good,'target':str(target),'subjects':rows[0]['subjects'] if rows else []})+'\\n')
 if os.environ.get('FAIL_TARGET_MV')=='1':sys.exit(1)
sys.exit(subprocess.run(['/usr/bin/mv',*sys.argv[1:]]).returncode)
''');p.chmod(0o755)
  self.env={**os.environ,'PATH':str(self.b)+':'+os.environ['PATH'],'MO_STATE_DIR':str(self.state),'MONTAZH_OKNO_BIN':str(PKG/'sbin/montazh-okno'),'FIXTURE_TARGET':str(self.target),'FIXTURE_LIVE':str(self.live),'FIXTURE_MV_TRACE':str(self.r/'mv.log'),'SMF_SYSTEMCTL':str(self.b/'systemctl'),'SMF_JOURNALCTL':str(self.b/'journalctl'),'SMF_HOD':'/bin/true','SMF_PARY':str(self.r/'pairs'),'SMF_DORABOTKI':str(self.r/'unrelated'),'SMF_ISKRA_IN':str(self.r/'mail'),'SMF_REESTR_PL':str(self.r/'registry.yaml'),'SMF_MANIFEST':str(self.r/'manifest'),'SMF_NASHI':str(self.r/'nashi'),'SMF_ZAMOK':str(self.r/'install.lock'),'SMF_PROC':str(self.r/'proc'),'SMF_UNIT_DIRS':str(self.r/'units'),'SMF_RUKA':'Fixture <fixture@sadik>','SMV_MONTAZH':str(self.r/'backups'),'SMV_REESTR_PL':str(self.r/'registry.yaml'),'SMV_ZAMOK':str(self.r/'install.lock')}
  # Backup roots are data substitutions in the actual copied installer, not a replacement algorithm.
  self.smf=self.r/'smontirovat-fajly';s=(PKG/'sbin/smontirovat-fajly').read_text();s=s.replace('MONTAZH=/var/backups/montazh\n','MONTAZH='+str(self.r/'backups')+'\n').replace('MONTAZH_KLYUCH=/var/backups/montazh-s-klyuchom\n','MONTAZH_KLYUCH='+str(self.r/'private-backups')+'\n');self.smf.write_text(s)
  self.repo=self.r/'git';self.repo.mkdir();p=self.repo/'packages/fixture';p.mkdir(parents=True);(p/'x').write_text('new');(p/'package.json').write_text('{"name":"fixture","version":"1.0.0","files":["x"]}')
  for args in [('init','-q'),('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','fixture'),('tag','fixture-v1.0.0')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.env['MO_DEREVO_REPO']=str(self.repo)
  self.env['npm_config_cache']=str(self.r/'npm-cache')
  self.env['MO_COPY_PRIBOR']=str(PKG.parent/'dsh-vypusk-watch/src/copy-compare.sh')
  self.env['MO_REESTR_PRIBOR']=str(PKG.parent/'dsh-reestr/bin/agent-plugins')
  self.env['VYPUSK_SOOTVETSTVIYA']='fixture='+str(self.live)
  (self.r/'registry.yaml').write_text(json.dumps({'plugins':[{'id':'fixture-copy','path':str(self.live),'version':'1.0.0','installed_check':'cat '+str(self.live/'package.json')}],'services':[]}))
  self.smv=self.r/'smontirovat-vypusk';s=(PKG/'sbin/smontirovat-vypusk').read_text();s=s.replace('R=/opt/iskra/workspace/dsh-plugins\n','R='+str(self.repo)+'\n');self.smv.write_text(s)
 def tearDown(self):self.tmp.cleanup()
 def invoke(self,kind,mode='--v-boj',extra=()):
  if kind=='files':args=['bash',str(self.smf),str(self.source),str(self.live),'x','--punkt','B-N-2025-PROBE',mode,*extra];cwd=self.r
  else:args=['bash',str(self.smv),'fixture-v1.0.0','packages/fixture',str(self.live),mode,*(['B-N-2025-PROBE'] if mode=='--v-boj' else []),*extra];cwd=self.repo
  return subprocess.run(args,cwd=cwd,env=self.env,capture_output=True,text=True,timeout=15)
 def records(self):return [json.loads(p.read_text()) for p in self.state.glob('*.json')]
 def test_window_precedes_first_replace_and_success_leaves_it_open(self):
  for kind in ('files','release'):
   with self.subTest(kind=kind):
    for p in self.state.glob('*.json'):p.unlink()
    (self.r/'mv.log').unlink(missing_ok=True);self.target.write_text('old');p=self.invoke(kind)
    self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(self.target.read_text(),'new');self.assertTrue(self.records());self.assertTrue(all(x['phase']=='open' for x in self.records()))
    rows=[json.loads(x) for x in (self.r/'mv.log').read_text().splitlines()];self.assertTrue(rows);self.assertTrue(all(x['active_before_mv'] for x in rows))
 def test_preflight_refusals_never_publish_window(self):
  (self.source/'x').unlink();p=self.invoke('files');self.assertNotEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old');self.assertFalse((self.r/'mv.log').exists())
  subprocess.run(['git','-C',str(self.repo),'tag','-d','fixture-v1.0.0'],check=True,capture_output=True)
  self.assertNotEqual(subprocess.run(['git','-C',str(self.repo),'rev-parse','--verify','refs/tags/fixture-v1.0.0'],capture_output=True).returncode,0)
  p=self.invoke('release');self.assertNotEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old');self.assertFalse((self.r/'mv.log').exists())
 def test_progon_and_no_changes_never_publish_window(self):
  for kind in ('files','release'):
   with self.subTest(kind=kind):
    p=self.invoke(kind,'--progon');self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old')
  self.target.write_text('new');p=self.invoke('files');self.assertEqual(p.returncode,3,p.stdout+p.stderr);self.assertEqual(self.records(),[])
 def test_release_no_changes_does_not_publish_or_replace(self):
  shutil.copyfile(self.repo/'packages/fixture/package.json',self.live/'package.json');self.target.write_text('new');before=self.target.stat().st_ino
  p=self.invoke('release');self.assertEqual(p.returncode,3,p.stdout+p.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.stat().st_ino,before);self.assertFalse((self.r/'mv.log').exists())
 # B-N-2046 (а): код 5 (индекс git заперт, файлы в бою) → повтор «БЕЗ ИЗМЕНЕНИЙ» догоняет коммит учёта (0) → ещё повтор — 3, пустого коммита нет.
 def test_release_repeat_catches_up_git_after_code5_without_empty_commit(self):
  g=self.r/'gitboj';live=g/'pkg';live.mkdir(parents=True);(live/'x').write_text('old')
  self.env['VYPUSK_SOOTVETSTVIYA']='fixture='+str(live)
  (self.r/'registry.yaml').write_text(json.dumps({'plugins':[{'id':'fixture-copy','path':str(live),'version':'1.0.0','installed_check':'cat '+str(live/'package.json')}],'services':[]}))
  for a in [('init','-q'),('add','.'),('-c','user.name=S','-c','user.email=s@s','commit','-qm','init')]:subprocess.run(['git',*a],cwd=g,check=True,capture_output=True)
  run=lambda punkt:subprocess.run(['bash',str(self.smv),'fixture-v1.0.0','packages/fixture',str(live),'--v-boj',punkt],cwd=self.repo,env=self.env,capture_output=True,text=True,timeout=60)
  head=lambda:subprocess.run(['git','rev-parse','HEAD'],cwd=g,capture_output=True,text=True).stdout.strip()
  h0=head();(g/'.git/index.lock').write_text('')
  p=run('B-N-2046a-A');self.assertEqual(p.returncode,5,p.stdout+p.stderr);self.assertEqual((live/'x').read_text(),'new');self.assertEqual(head(),h0)
  (g/'.git/index.lock').unlink()
  # условие Вениамина 05:05Z: прогон после кода 5 учёт НЕ догоняет — код 3, HEAD прежний
  p=subprocess.run(['bash',str(self.smv),'fixture-v1.0.0','packages/fixture',str(live),'--progon'],cwd=self.repo,env=self.env,capture_output=True,text=True,timeout=60)
  self.assertEqual(p.returncode,3,p.stdout+p.stderr);self.assertEqual(head(),h0)
  self.assertIn('⚠️ ПОДМЕНА: SMV_ZAMOK=',p.stdout);self.assertIn('⚠️ ПОДМЕНА: MO_STATE_DIR=',p.stdout)
  p=run('B-N-2046a-B');self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertIn('БЕЗ ИЗМЕНЕНИЙ',p.stdout);h1=head();self.assertNotEqual(h1,h0)
  self.assertIn('(B-N-2046a-B) · smontirovat-vypusk',subprocess.run(['git','log','-1','--format=%s'],cwd=g,capture_output=True,text=True).stdout)
  self.assertEqual(subprocess.run(['git','status','--porcelain','--','pkg'],cwd=g,capture_output=True,text=True).stdout,'')
  p=run('B-N-2046a-C');self.assertEqual(p.returncode,3,p.stdout+p.stderr);self.assertEqual(head(),h1)
 def test_refused_publication_prevents_any_replace(self):
  self.state.chmod(0o777)
  for kind in ('files','release'):
   with self.subTest(kind=kind):
    p=self.invoke(kind);self.assertNotEqual(p.returncode,0);self.assertEqual(self.target.read_text(),'old');self.assertFalse((self.r/'mv.log').exists())
 def test_failed_replace_removes_deferral_immediately(self):
  self.env['FAIL_TARGET_MV']='1'
  for kind in ('files','release'):
   with self.subTest(kind=kind):
    for f in self.state.glob('*.json'):f.unlink()
    p=self.invoke(kind);self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertEqual(self.target.read_text(),'old');self.assertTrue(self.records());self.assertTrue(all(x['phase']=='failed' for x in self.records()))
    q=subprocess.run([str(PKG/'sbin/montazh-okno'),'otlozheno','--avto-montazh','file:'+str(self.target)],env=self.env,capture_output=True,text=True,timeout=5);self.assertEqual(q.returncode,0)

 def owned_registry(self):
  import pwd,grp
  user=pwd.getpwuid(os.getuid()).pw_name;group=grp.getgrgid(os.getgid()).gr_name
  (self.repo/'packages/fixture/x').write_text('old')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','old source'),('tag','-f','fixture-v1.0.0')]:
   subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  entry={'id':'fixture-entry','version':'old','installed_check':'cat '+str(self.target),'derevo':{'address':str(self.repo),'ref':'fixture-v1.0.0','subdir':'packages/fixture','files':[{'local':str(self.target),'remote':'x','mode':'0644','owner':user+':'+group}],'not_installed':['package.json'],'links':[],'expected_diff_files':[]}}
  registry=self.r/'registry.yaml';registry.write_text(json.dumps({'plugins':[],'services':[entry]}))
  self.env['MO_DEREVO_PRIBOR']=str(PKG.parent/'dsh-vypusk-watch/src/vypusk-okno-watch.sh')
  self.env['MO_DEREVO_REPO']=str(self.repo)
  self.env['npm_config_cache']=str(self.r/'npm-cache')
  self.env['MO_REESTR_PRIBOR']=str(PKG.parent/'dsh-reestr/bin/agent-plugins')
  self.entry=entry;return registry
 def vow(self):
  alert=self.b/'vow-alert';alert.write_text('#!/bin/sh\necho called >> "'+str(self.r/'vow-alerts')+'"\n');alert.chmod(0o755)
  empty=self.r/'empty';empty.mkdir(exist_ok=True);exceptions=self.r/'exceptions';exceptions.write_text('')
  env={**self.env,'VYPUSK_REPO':str(self.repo),'VYPUSK_REESTR':str(self.r/'registry.yaml'),'VYPUSK_KORNI':str(empty),'VYPUSK_AGENT_KORNI':'','VYPUSK_INFO_KORNI':'','VYPUSK_SOOTVETSTVIYA':'','VYPUSK_SSYLKI':'','VYPUSK_RASKLADKA':'','VYPUSK_ALERT':str(alert),'VYPUSK_SOSTOYANIE':str(self.r/'vow-state'),'VYPUSK_ISKLYUCHENIYA':str(exceptions)}
  return subprocess.run(['bash',str(PKG.parent/'dsh-vypusk-watch/src/vypusk-okno-watch.sh'),'--avto-montazh'],env=env,capture_output=True,text=True,timeout=15)
 def test_derevo_owned_file_defers_vow_and_close_requires_current_ref(self):
  registry=self.owned_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  record=self.records()[0];self.assertIn('entry:fixture-entry',record['subjects']);self.assertIn('file:'+str(self.target),record['subjects'])
  q=self.vow();self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertIn('ОТЛОЖЕНО',q.stdout);self.assertFalse((self.r/'vow-alerts').exists())
  self.entry['version']='new';registry.write_text(json.dumps({'services':[self.entry]}))
  close=lambda:subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True,timeout=15)
  q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
  (self.repo/'packages/fixture/x').write_text('new')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new source'),('tag','fixture-v1.0.1')]:
   subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.assertEqual(close().returncode,1,'new tag alone must not close with old ref')
  self.entry['derevo']['ref']='fixture-v1.0.1';self.entry['version']='new';registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
  q=close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')
  q=self.vow();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse((self.r/'vow-alerts').exists())
 def test_derevo_no_window_and_bad_permissions_stay_red(self):
  self.owned_registry();self.assertEqual(self.invoke('files').returncode,0)
  record=self.records()[0];f=self.state/(record['id']+'.json')
  f.chmod(0o666);q=self.vow();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertTrue((self.r/'vow-alerts').exists())
  f.chmod(0o644);(self.r/'vow-alerts').unlink();q=self.vow();self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertFalse((self.r/'vow-alerts').exists())
  f.unlink();(self.r/'vow-state').unlink(missing_ok=True);q=self.vow();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertTrue((self.r/'vow-alerts').exists())
 def test_derevo_duplicate_identity_refuses_before_replace(self):
  registry=self.owned_registry();registry.write_text(json.dumps({'services':[self.entry,self.entry]}))
  q=self.invoke('files');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'old');self.assertFalse((self.r/'mv.log').exists())

 def test_derevo_foreign_repo_never_closes_real_vow_mismatch(self):
  registry=self.owned_registry()
  foreign=self.r/'foreign';shutil.copytree(self.repo,foreign)
  (foreign/'packages/fixture/x').write_text('new')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','different tree'),('tag','-f','fixture-v1.0.0')]:
   subprocess.run(['git',*args],cwd=foreign,check=True,capture_output=True)
  self.entry['derevo']['address']=str(foreign);self.entry['version']='new';registry.write_text(json.dumps({'services':[self.entry]}))
  self.assertEqual(self.invoke('files').returncode,0);record=self.records()[0]
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
 def test_derevo_target_cannot_disappear_from_owner_before_close(self):
  registry=self.owned_registry();self.assertEqual(self.invoke('files').returncode,0);record=self.records()[0]
  self.entry['version']='new';self.entry['derevo']['files']=[];self.entry['derevo']['not_installed']=['package.json','x']
  registry.write_text(json.dumps({'services':[self.entry]}))
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
 # B-N-2082: перенос в derevo ДРУГОЙ записи той же pravka (B-N-2071) — закрывается, только если под новым владельцем живой
 #   файл = blob его ref (условие Вениамина 14:05Z) и реестр = HEAD своего учёта git (LOW); два владельца / чужой ref — нет.
 def test_derevo_target_moved_to_one_other_entry_closes_two_owners_refuse(self):
  registry=self.owned_registry();self.assertEqual(self.invoke('files').returncode,0);record=self.records()[0]
  git=lambda *a,cwd=self.r:subprocess.run(['git','-C',str(cwd),*a],check=True,capture_output=True,text=True)
  (self.repo/'packages/fixture/x').write_text('new');git('add','.',cwd=self.repo);git('-c','user.name=F','-c','user.email=f@s','commit','-qm','new',cwd=self.repo);git('tag','fixture-v1.0.1',cwd=self.repo)
  row=dict(self.entry['derevo']['files'][0])
  self.entry['version']='new';self.entry['derevo']['files']=[];self.entry['derevo']['not_installed']=['package.json','x']
  receiver=json.loads(json.dumps(self.entry));receiver['id']='receiver-entry';receiver['derevo']['files']=[row];receiver['derevo']['not_installed']=['package.json'];receiver['derevo']['ref']='fixture-v1.0.1'
  second=json.loads(json.dumps(receiver));second['id']='second-entry'
  git('init','-q')
  def close(services):
   registry.write_text(json.dumps({'services':services}));git('add','registry.yaml');git('-c','user.name=F','-c','user.email=f@s','commit','-qm','r','--allow-empty')
   return subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  q=close([self.entry,receiver,second]);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('ownership changed',q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
  stale=dict(receiver,derevo=dict(receiver['derevo'],ref='fixture-v1.0.0'))
  q=close([self.entry,stale]);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('differs from receiver-entry',q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
  registry.write_text(json.dumps({'services':[self.entry,receiver]})+' ')
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('not HEAD of its git record',q.stderr)
  q=close([self.entry,receiver]);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')
 # B-N-2082 (Вениамин 19:20 МСК, окно e19cdc88): файл покидает derevo, только если это снятие --snyat пункта ОКНА — по старому
 #   имени его нет, страховка пункта держит его прежние байты ровно раз, рядом ровно один .SNYATO-* с той же суммой. Иное — отказ.
 def test_derevo_target_removed_by_snyat_of_window_task_closes_only_with_trace(self):
  import pwd,grp
  registry=self.owned_registry();owner=pwd.getpwuid(os.getuid()).pw_name+':'+grp.getgrgid(os.getgid()).gr_name
  git=lambda *a:subprocess.run(['git','-C',str(self.repo),*a],check=True,capture_output=True,text=True)
  dup=self.live/'y';dup.write_text('dup');(self.repo/'packages/fixture/y').write_text('dup')
  git('add','.');git('-c','user.name=F','-c','user.email=f@s','commit','-qm','dup');git('tag','-f','fixture-v1.0.0')
  self.entry['derevo']['files'].append({'local':str(dup),'remote':'y','mode':'0644','owner':owner})
  registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
  self.env['MO_STRAHOVKI']=str(self.r/'backups')+':'+str(self.r/'private-backups')
  q=subprocess.run(['bash',str(self.smf),'--punkt','B-N-2025-PROBE','--snyat','--v-boj',str(self.live),'y'],cwd=self.r,env=self.env,capture_output=True,text=True,timeout=15)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse(dup.exists());snyato=list(self.live.glob('y.SNYATO-*'));self.assertEqual(len(snyato),1)
  self.assertEqual(self.records(),[],'--snyat окна не открывает');import time;time.sleep(1.1)  # страховка снятия и монтажа — разные секунды
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);record=self.records()[0]
  self.assertIn({'local':str(dup),'remote':'y'},[c for c in record['checks'] if c['kind']=='registry'][0]['owned_files'])
  (self.repo/'packages/fixture/x').write_text('new');git('rm','-q','packages/fixture/y');git('add','.');git('-c','user.name=F','-c','user.email=f@s','commit','-qm','dup retired');git('tag','fixture-v1.0.1')
  self.entry['version']='new';self.entry['derevo']['ref']='fixture-v1.0.1';self.entry['derevo']['files']=self.entry['derevo']['files'][:1]
  registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
  close=lambda:subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True,timeout=15)
  shutil.copy2(snyato[0],dup);q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('still on disk',q.stderr);dup.unlink()
  hidden=self.r/'hidden';snyato[0].rename(hidden);q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('.SNYATO-* with the backup sum',q.stderr)
  snyato[0].write_text('other');q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('.SNYATO-* with the backup sum',q.stderr);snyato[0].unlink();hidden.rename(snyato[0])
  self.env['MO_STRAHOVKI']=str(self.r/'nowhere');q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('found 0 times',q.stderr)
  self.assertEqual(self.records()[0]['phase'],'open')
  self.env['MO_STRAHOVKI']=str(self.r/'backups')+':'+str(self.r/'private-backups')
  q=close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')
 def test_derevo_bad_yaml_is_named_refusal_before_replace(self):
  self.owned_registry();(self.r/'registry.yaml').write_text('services: [')
  q=self.invoke('files');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('Traceback',q.stderr);self.assertEqual(self.target.read_text(),'old')

 def test_derevo_duplicate_remote_cannot_hide_owned_target(self):
  registry=self.owned_registry();self.assertEqual(self.invoke('files').returncode,0);record=self.records()[0]
  self.entry['version']='new'
  old=self.r/'old-copy';old.write_text('old');row=dict(self.entry['derevo']['files'][0]);row['local']=str(old);self.entry['derevo']['files'].append(row)
  registry.write_text(json.dumps({'services':[self.entry]}))
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')

 def test_entry_version_and_fingerprint_must_also_be_accepted(self):
  registry=self.owned_registry();self.assertEqual(self.invoke('files').returncode,0);record=self.records()[0]
  (self.repo/'packages/fixture/x').write_text('new')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new tag'),('tag','fixture-v1.0.1')]:
   subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.entry['derevo']['ref']='fixture-v1.0.1'
  def close():
   registry.write_text(json.dumps({'services':[self.entry]}))
   return subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',record['id']],env=self.env,capture_output=True,text=True)
  q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
  self.entry['version']='new';self.entry['fingerprint']='old';self.entry['fingerprint_check']='cat '+str(self.target)
  q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
  self.entry['fingerprint']='new';q=close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')

 # B-N-2034: одна запись derevo — файлы в ДВУХ каталогах; второй вызов присоединяется к окну первого.
 def two_dir_registry(self):
  registry=self.owned_registry()
  self.live2=self.r/'live2';self.live2.mkdir();self.target2=self.live2/'y';self.target2.write_text('old2')
  self.source2=self.r/'candidate2';self.source2.mkdir();(self.source2/'y').write_text('new2')
  (self.repo/'packages/fixture/y').write_text('old2')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','old y'),('tag','-f','fixture-v1.0.0')]:
   subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  row=dict(self.entry['derevo']['files'][0]);row.update(local=str(self.target2),remote='y');self.entry['derevo']['files'].append(row)
  registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}));return registry
 def invoke2(self,extra=()):
  import time;time.sleep(1.1)  # имя страховки smontirovat-fajly — по каталогу до секунды (находка 10.10): не сталкивать вызовы
  args=['bash',str(self.smf),str(self.source2),str(self.live2),'y','--punkt','B-N-2025-PROBE','--v-boj',*extra]
  return subprocess.run(args,cwd=self.r,env=self.env,capture_output=True,text=True,timeout=15)
 def new_tag(self,registry):
  if subprocess.run(['git','rev-parse','-q','--verify','refs/tags/fixture-v1.0.1'],cwd=self.repo,capture_output=True).returncode!=0:
   (self.repo/'packages/fixture/x').write_text('new');(self.repo/'packages/fixture/y').write_text('new2')
   for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new x y'),('tag','fixture-v1.0.1')]:
    subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.entry['derevo']['ref']='fixture-v1.0.1';self.entry['version']='new';registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
 # B-N-2111 (23): task join must refuse BEFORE backup/temp/window writes.
 def backup_tree(self):
  out={}
  for name in ('backups','private-backups'):
   root=self.r/name
   if not root.exists():out[name]=None;continue
   for p in [root,*sorted(root.rglob('*'))]:
    st=p.stat();out[str(p.relative_to(self.r))]=(st.st_mode,st.st_ino,st.st_mtime_ns,hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
  return out
 def join_task_case(self,case):
  self.two_dir_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  record=self.records()[0];ident=record['id'];path=self.state/(ident+'.json');original=path.read_bytes();own=record['task']
  punkt='B-N-2111-23-FOREIGN' if case=='foreign' else own
  if case!='foreign':
   if case=='missing':record.pop('task')
   else:record['task']=''
   path.write_text(json.dumps(record));actual=json.loads(path.read_text())
   self.assertTrue(('task' not in actual) if case=='missing' else actual['task']=='')
   self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(path.read_bytes()).hexdigest())
   print('TASK-PORCHA replacements=1 case='+case+' before='+hashlib.sha256(original).hexdigest()+' after='+hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
  else:
   self.assertNotEqual(punkt,own);print('TASK-PORCHA arguments=1 --punkt '+own+' -> '+punkt,flush=True)
  before_window=path.read_bytes();before_backup=self.backup_tree();before_target=self.target2.read_bytes();before_inode=self.target2.stat().st_ino
  q=self.invoke2(('--okno-id',ident,'--punkt',punkt))
  self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertEqual(self.backup_tree(),before_backup,'backup tree changed before task refusal')
  self.assertEqual(path.read_bytes(),before_window);self.assertEqual(self.target2.read_bytes(),before_target);self.assertEqual(self.target2.stat().st_ino,before_inode)
  self.assertEqual(sorted(p.name for p in self.live2.iterdir()),['y'])
  self.assertIn(punkt,q.stderr);self.assertIn('task',q.stderr);self.assertIn(own if case=='foreign' else ('<отсутствует>' if case=='missing' else "''"),q.stderr)
  if case!='foreign':
   path.write_bytes(original);self.assertEqual(json.loads(path.read_text())['task'],own);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),hashlib.sha256(original).hexdigest())
   print('TASK-VOZVRAT replacements=1 case='+case+' sha256='+hashlib.sha256(original).hexdigest(),flush=True)
  q=self.invoke2(('--okno-id',ident));self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target2.read_text(),'new2');self.assertEqual(self.records()[0]['task'],own)
 def test_join_empty_window_id_refuses_before_backup(self):
  self.two_dir_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  before=self.backup_tree();window=self.records()[0];raw=(self.state/(window['id']+'.json')).read_bytes()
  print("WINDOW-ID-PORCHA arguments=1 old="+window['id']+" new=''",flush=True)
  q=self.invoke2(('--okno-id',''));self.assertEqual(q.args[-1],'')
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(self.backup_tree(),before)
  self.assertEqual(self.target2.read_text(),'old2');self.assertEqual((self.state/(window['id']+'.json')).read_bytes(),raw);self.assertIn('--okno-id',q.stderr)
 def test_join_foreign_task_refuses_before_backup_and_return(self):self.join_task_case('foreign')
 def test_join_empty_task_refuses_before_backup_and_return(self):self.join_task_case('empty')
 def test_join_missing_task_refuses_before_backup_and_return(self):self.join_task_case('missing')
 def test_derevo_two_directories_join_one_window_closed_only_after_both(self):
  registry=self.two_dir_registry()
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);ident=self.records()[0]['id']
  q=self.invoke2();self.assertNotEqual(q.returncode,0,'second call without --okno-id must still refuse (overlap)');self.assertEqual(self.target2.read_text(),'old2')
  close=lambda:subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',ident],env=self.env,capture_output=True,text=True,timeout=15)
  self.new_tag(registry)
  q=close();self.assertEqual(q.returncode,1,'window must not close while the second directory is not mounted: '+q.stdout+q.stderr)
  self.entry['derevo']['ref']='fixture-v1.0.0';self.entry['version']='old';registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
  q=self.invoke2(('--okno-id',ident));self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target2.read_text(),'new2')
  rows=self.records();self.assertEqual(len(rows),1);record=rows[0];self.assertEqual(record['id'],ident);self.assertEqual(record['phase'],'open')
  for subj in ('file:'+str(self.target),'file:'+str(self.target2),'entry:fixture-entry'):self.assertIn(subj,record['subjects'])
  q=self.vow();self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertFalse((self.r/'vow-alerts').exists())
  self.new_tag(registry)
  q=close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')
 def test_derevo_join_cannot_add_file_outside_window_entries(self):
  registry=self.two_dir_registry()
  self.entry['derevo']['files']=self.entry['derevo']['files'][:1];registry.write_text(json.dumps({'plugins':[],'services':[self.entry]}))
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);ident=self.records()[0]['id'];before=(self.state/(ident+'.json')).read_bytes()
  q=self.invoke2(('--okno-id',ident));self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(self.target2.read_text(),'old2')
  self.assertEqual((self.state/(ident+'.json')).read_bytes(),before)

 # B-N-2036 (1): пустой учёт пар — ОТКАЗ 2 с причиной, цель не тронута (было: «unbound variable», монтаж шёл, код 0).
 def test_empty_pairs_refuses_before_any_write(self):
  (self.r/'pairs').write_text('')
  q=self.invoke('files');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('ни одной пары',q.stderr)
  self.assertNotIn('unbound variable',q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'old');self.assertEqual(self.records(),[])
  (self.r/'pairs').write_text('# только комментарий\n');q=self.invoke('files');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'old')
 # B-N-2036 (2): отказ после страховки и до первой замены снимает СВОЮ страховку — повтор в ту же секунду не падает.
 def test_refused_call_removes_own_backup_and_same_second_retry_succeeds(self):
  import time
  self.owned_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.target.write_text('old');(self.source/'x').write_text('new');time.sleep(1.1)  # страховка первого вызова — в другой секунде
  while time.time()%1>0.3:time.sleep(0.02)
  t0=int(time.time())
  q=self.invoke('files');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('окно не опубликовано',q.stderr)
  self.assertIn('страховка снята',q.stdout);self.assertEqual(self.target.read_text(),'old')
  for p in self.state.glob('*.json'):p.unlink()
  q=self.invoke('files');t1=int(time.time());self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'new')
  self.assertEqual(t0,t1,'проба не уложилась в одну секунду — повторить')
  backups=[p for p in (self.r/'backups').rglob('*.tar')];self.assertEqual(len([p for p in backups if time.strftime('%H%M%S',time.gmtime(t0)) in p.name]),1)
 # B-N-2039: подсказка --okno-id — только при entry: в окне; без записи derevo — «каждый каталог своим окном».
 def test_hint_names_join_only_when_window_has_entry(self):
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertIn('каждый каталог своим окном, без --okno-id',q.stdout);self.assertNotIn('с --okno-id',q.stdout)
  for p in self.state.glob('*.json'):p.unlink()
  import time;time.sleep(1.1)  # два успешных вызова одного каталога в одну секунду — имя страховки (граница B-N-2036)
  self.target.write_text('old');self.owned_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertIn('другие каталоги той же записи derevo — с --okno-id',q.stdout);self.assertNotIn('каждый каталог своим окном',q.stdout)
 # B-N-2042: записи реестра БЕЗ derevo — по пути, буквально стоящему в их проверке.
 def odin(self,suffix='',check=None):
  h=lambda b:hashlib.sha256(b).hexdigest()[:16]
  return {'id':'odin-x','name':'x','path':str(self.target),'version':h(b'old'),'installed_check':check or 'sha256sum '+str(self.target)+suffix+' | cut -c1-16'}
 def verify_ap(self,registry,*cmd):
  env={**self.env,'PLUGINS_REGISTRY':str(registry),'MONTAZH_OKNO_BIN':str(PKG/'sbin/montazh-okno'),'MO_REESTR_PRIBOR':str(PKG.parent/'dsh-reestr/bin/agent-plugins')}
  return subprocess.run(['python3',str(PKG.parent/'dsh-reestr/bin/agent-plugins'),*(cmd or ('verify',)),'--avto-montazh'],env=env,capture_output=True,text=True,timeout=90)
 def test_no_derevo_record_deferred_and_closed_only_after_pravka(self):
  e=self.odin();reg=self.r/'registry.yaml'
  e.update(healthcheck='[ "$(cat '+str(self.target)+')" = old ] && echo old || { echo novyj; exit 1; }',montazh_consistency=True)  # list --health откладывает только подписанные (agent-plugins:477)
  reg.write_text(json.dumps({'plugins':[],'services':[e]}))
  self.env['MO_REESTR_PRIBOR']=str(PKG.parent/'dsh-reestr/bin/agent-plugins')
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);rec=self.records()[0];self.assertIn('entry:odin-x',rec['subjects'])
  self.assertIn('pravka реестра тем же тактом, до 1800 с',q.stdout)  # У2: порядок называет сам монтаж
  v=self.verify_ap(reg);self.assertRegex(v.stdout,r'ОТЛОЖЕНО [0-9a-f]{32} .* entry:odin-x');itog=[l for l in v.stdout.splitlines() if l.startswith('РАСХОЖДЕНИЙ')];self.assertTrue(itog);self.assertNotIn('odin-x',itog[0])
  # У3: все три команды registry-watchdog — verify (выше), list --health и вызов помощника, которым откладывает nashi-dorabotki --check (:1886).
  v=self.verify_ap(reg,'list','--health');self.assertRegex(v.stdout,r'ОТЛОЖЕНО [0-9a-f]{32} .* entry:odin-x',v.stdout+v.stderr)
  import time;q=subprocess.run([str(PKG/'sbin/montazh-okno'),'otlozheno','--avto-montazh','--since-ns',str(time.clock_gettime_ns(time.CLOCK_BOOTTIME)),'file:'+str(self.target)],env=self.env,capture_output=True,text=True,timeout=30)
  self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertTrue(q.stdout.startswith('ОТЛОЖЕНО '),q.stdout)
  close=lambda:subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',rec['id']],env=self.env,capture_output=True,text=True,timeout=30)
  q=close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('registry value not accepted: odin-x',q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
  e['version']=hashlib.sha256(b'new').hexdigest()[:16];reg.write_text(json.dumps({'plugins':[],'services':[e]}))
  q=close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'closed')
 def test_file_of_package_and_single_record_carries_both_entries(self):
  reg=self.owned_registry();self.entry['version']='old';svc=[self.entry,self.odin()];reg.write_text(json.dumps({'plugins':[],'services':svc}))
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);subj=self.records()[0]['subjects']
  self.assertIn('entry:fixture-entry',subj);self.assertIn('entry:odin-x',subj)
 def test_check_path_is_exact_token_and_needs_installed_check(self):
  reg=self.r/'registry.yaml'
  reg.write_text(json.dumps({'plugins':[],'services':[self.odin('-old')]}));q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertNotIn('entry:odin-x',self.records()[0]['subjects'])
  for p in self.state.glob('*.json'):p.unlink()
  import time;time.sleep(1.1);self.target.write_text('old')
  e=self.odin();e['fingerprint_check']=e.pop('installed_check');e['fingerprint']=e.pop('version')
  reg.write_text(json.dumps({'plugins':[],'services':[e]}));q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertNotIn('entry:odin-x',self.records()[0]['subjects'])
 def test_no_derevo_record_two_directories_join_by_check_paths(self):
  self.live2=self.r/'live2';self.live2.mkdir();self.target2=self.live2/'y';self.target2.write_text('old2')
  self.source2=self.r/'candidate2';self.source2.mkdir();(self.source2/'y').write_text('new2')
  e=self.odin(check='cat '+str(self.target)+' '+str(self.target2)+' | sha256sum | cut -c1-16')
  reg=self.r/'registry.yaml';reg.write_text(json.dumps({'plugins':[],'services':[e]}))
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);ident=self.records()[0]['id']
  q=self.invoke2(('--okno-id',ident));self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target2.read_text(),'new2')
  rows=self.records();self.assertEqual(len(rows),1);self.assertIn('file:'+str(self.target2),rows[0]['subjects']);self.assertIn('entry:odin-x',rows[0]['subjects'])
 # У1 ворот: путь-инструмент, широкий/голый/общий cd — не entry; свой cd глубиной ≥3 и путь-аргумент — entry (контроль зрячести).
 def fresh(self,services):
  import time
  for p in self.state.glob('*.json'):p.unlink()
  time.sleep(1.1);self.target.write_text('old');(self.r/'registry.yaml').write_text(json.dumps({'plugins':[],'services':services}))
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);return q,self.records()[0]['subjects']
 def test_tool_path_and_broad_or_shared_cd_are_not_owned(self):
  t=str(self.target);L=str(self.live)
  for name,services,want,slepota in [
   ('инструмент',[self.odin(check=t+' --version')],False,None),
   ('инструмент под sudo',[self.odin(check='set -o pipefail; sudo -n '+t+' --version | cut -c1-16')],False,None),
   ('инструмент и аргумент',[{**self.odin(check=t+' --version'),'fingerprint_check':'sha256sum '+t}],True,None),
   ('cd /tmp',[self.odin(check='cd /tmp && sha256sum '+t[len('/tmp/'):])],False,'cd /tmp шире двух уровней'),
   ('голый /',[self.odin(check='cd / && sha256sum '+t[1:])],False,'cd / шире двух уровней'),
   ('свой cd',[self.odin(check='cd '+L+' && sha256sum x')],True,None),
   ('общий cd',[self.odin(check='cd '+L+' && sha256sum x'),{**self.odin(check='cd '+L+' && cat x'),'id':'odin-y'}],False,'cd '+L+' общий с другой записью')]:
   with self.subTest(name=name):
    q,subj=self.fresh(services);self.assertEqual('entry:odin-x' in subj,want,q.stdout+q.stderr);self.assertNotIn('entry:odin-y',subj)
    if slepota:self.assertIn('СЛЕПОТА: запись odin-x — '+slepota,q.stderr)
 # Ворота кода Вениамина 02:5xZ: K1 — путь не через cd (в т.ч. «/», «/tmp», каталог цели) не владеет по префиксу;
 # K3 — владение по пути, а не по строке («…/liv» не владеет «…/live/x»); K4 — смена путей проверки до zakryt не закрывает.
 def test_non_cd_and_top_level_paths_do_not_own(self):
  L=str(self.live)
  for name,check in [('/tmp и /','find /tmp -maxdepth 0 | wc -l; sha256sum / 2>&1 | wc -l'),('каталог цели без cd','ls '+L+' | sha256sum | cut -c1-16')]:
   with self.subTest(name=name):
    q,subj=self.fresh([self.odin(check=check)]);self.assertNotIn('entry:odin-x',subj,q.stdout+q.stderr)
 def test_path_is_not_string_prefix(self):
  liv=str(self.live)[:-1]
  q,subj=self.fresh([self.odin(check='sha256sum '+liv+' 2>/dev/null; cd '+liv+' 2>/dev/null && ls')]);self.assertNotIn('entry:odin-x',subj,q.stdout+q.stderr)
 def test_close_refused_when_check_paths_changed_after_podgotovit(self):
  e=self.odin();reg=self.r/'registry.yaml';reg.write_text(json.dumps({'plugins':[],'services':[e]}))
  self.env['MO_REESTR_PRIBOR']=str(PKG.parent/'dsh-reestr/bin/agent-plugins')
  q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);rec=self.records()[0];self.assertIn('entry:odin-x',rec['subjects'])
  drugoj=self.r/'drugoj';drugoj.write_text('d')
  e['installed_check']='cat '+str(self.target)+' '+str(drugoj)+' | sha256sum | cut -c1-16';e['version']=hashlib.sha256(b'newd').hexdigest()[:16]
  reg.write_text(json.dumps({'plugins':[],'services':[e]}))  # значение = машине, но пути проверки уже другие
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',rec['id']],env=self.env,capture_output=True,text=True,timeout=30)
  self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')
 # K1/K6/«//» (ворота Вениамина 03:1xZ): в owned_paths окна — ровно путь цели; «/opt», /dev/null, /proc/…, «//x» туда не попадают.
 def test_owned_paths_exclude_top_level_pseudo_fs_and_double_slash(self):
  t=str(self.target)
  q,subj=self.fresh([self.odin(check='sha256sum '+t+' 2>/dev/null | cut -c1-16; cat /proc/self/status /sys/kernel/x >/dev/null; ls /opt //x >/dev/null')])
  self.assertIn('entry:odin-x',subj,q.stdout+q.stderr)
  c=[c for c in self.records()[0]['checks'] if c.get('values_consistency')]
  self.assertEqual(len(c),1);self.assertEqual(c[0]['owned_paths'],[t])

 def release_registry(self,missing=False):
  pkg=self.repo/'packages/fixture'
  data={'name':'fixture','version':'0.9.0','files':['x','CHANGELOG.md']}
  (pkg/'package.json').write_text(json.dumps(data));(pkg/'x').write_text('old');(pkg/'CHANGELOG.md').write_text('## 0.9.0 — old release\n')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','old release'),('tag','fixture-v0.9.0')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.old_c=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip()
  for f in ('package.json','x','CHANGELOG.md'):shutil.copyfile(pkg/f,self.live/f)
  data['version']='1.0.0';(pkg/'package.json').write_text(json.dumps(data));(pkg/'x').write_text('new');(pkg/'CHANGELOG.md').write_text('## 1.0.0 — new release\n')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new release')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  self.new_c=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip()
  subprocess.run(['git','tag','-d','fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True)
  if not missing:subprocess.run(['git','tag','fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True)
  check=self.r/'version-pribor.py';check.write_text('import json,sys;print(json.load(open(sys.argv[1]))["version"])\n')
  self.release_entry={'id':'release-fixture','path':str(self.live),'version':'0.9.0','installed_check':'python3 '+str(check)+' '+str(self.live/'package.json')}
  self.reg=self.r/'registry.yaml';self.reg.write_text(json.dumps({'plugins':[self.release_entry],'services':[]}));self.env['MO_REESTR_PRIBOR']=str(PKG.parent/'dsh-reestr/bin/agent-plugins')
 def release_head(self,*extra):
  return subprocess.run(['bash',str(self.smv),'HEAD','packages/fixture',str(self.live),'--v-boj','B-N-2043-PROBE',*extra],cwd=self.repo,env=self.env,capture_output=True,text=True,timeout=20)
 def release_close(self,rec=None):
  return subprocess.run([str(PKG/'sbin/montazh-okno'),'zakryt',(rec or self.records()[0])['id']],env=self.env,capture_output=True,text=True,timeout=20)
 def release_pravka(self):
  self.release_entry['version']='1.0.0';self.reg.write_text(json.dumps({'plugins':[self.release_entry],'services':[]}))
 def release_vow(self,auto=True):
  alert=self.b/'release-alert';alert.write_text('#!/bin/sh\necho called >> "'+str(self.r/'release-alerts')+'"\n');alert.chmod(0o755)
  empty=self.r/'empty';empty.mkdir(exist_ok=True);exc=self.r/'exceptions';exc.write_text('')
  env={**self.env,'VYPUSK_REPO':str(self.repo),'VYPUSK_REESTR':str(self.reg),'VYPUSK_KORNI':str(empty),'VYPUSK_AGENT_KORNI':'','VYPUSK_INFO_KORNI':'','VYPUSK_SOOTVETSTVIYA':'fixture='+str(self.live),'VYPUSK_SSYLKI':'','VYPUSK_RASKLADKA':'','VYPUSK_ALERT':str(alert),'VYPUSK_SOSTOYANIE':str(self.r/'vow-state'),'VYPUSK_ISKLYUCHENIYA':str(exc)}
  return subprocess.run(['bash',str(PKG.parent/'dsh-vypusk-watch/src/vypusk-okno-watch.sh'),*(['--avto-montazh'] if auto else [])],env=env,capture_output=True,text=True,timeout=20)
 def test_release_tag_and_entry_published_before_first_manifest_replace(self):
  self.release_registry();q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr);rec=self.records()[0]
  for subj in ('entry:release-fixture','file:'+str(self.live/'package.json'),'tag:'+str(self.repo)+':fixture-v1.0.0'):self.assertIn(subj,rec['subjects'])
  trace=[json.loads(x) for x in (self.r/'mv.log').read_text().splitlines()];self.assertTrue(trace);self.assertEqual(trace[0]['target'],str(self.live/'CHANGELOG.md'))
  for row in trace:self.assertTrue(row['active_before_mv']);self.assertIn('entry:release-fixture',row['subjects']);self.assertIn('tag:'+str(self.repo)+':fixture-v1.0.0',row['subjects'])
  self.assertEqual(self.release_close().returncode,1);self.release_pravka();q=self.release_close();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
 def test_release_pins_package_tree_when_existing_tag_commit_differs(self):
  self.release_registry();(self.repo/'other-module').write_text('other')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','unrelated')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip()
  self.assertNotEqual(head,self.new_c);q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  check=next(c for c in self.records()[0]['checks'] if c['kind']=='tag')
  self.assertEqual(check['commit'],head);self.assertEqual(check['subdir'],'packages/fixture')
  self.assertEqual(check['tree'],subprocess.check_output(['git','rev-parse',head+':packages/fixture'],cwd=self.repo,text=True).strip())
  self.release_pravka();self.assertEqual(self.release_close().returncode,0)

 def test_release_tag_on_later_unrelated_merge_closes_but_package_change_does_not(self):
  self.release_registry(True);self.assertEqual(self.release_head().returncode,0);self.release_pravka()
  original=self.records()[0];(self.repo/'other-module').write_text('other')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','unrelated'),('tag','fixture-v1.0.0','HEAD')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  q=self.release_close();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  file=self.state/(original['id']+'.json');file.write_text(json.dumps(original));file.chmod(0o644)
  (self.repo/'packages/fixture/x').write_text('bad package')
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','bad'),('tag','-f','fixture-v1.0.0','HEAD')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  q=self.release_close();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'open')

 def test_release_missing_tag_defers_vow_without_notification_until_pravka_and_tag(self):
  self.release_registry(True);q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  q=self.release_vow();self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertFalse((self.r/'release-alerts').exists())
  self.release_pravka();self.assertEqual(self.release_close().returncode,1)
  subprocess.run(['git','tag','fixture-v1.0.0',self.new_c],cwd=self.repo,check=True,capture_output=True)
  q=self.release_close();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.release_vow().returncode,0)
 def test_release_branch_named_tag_does_not_close_and_wrong_commit_tag_stays_open(self):
  self.release_registry(True);self.assertEqual(self.release_head().returncode,0);self.release_pravka()
  subprocess.run(['git','branch','fixture-v1.0.0',self.new_c],cwd=self.repo,check=True,capture_output=True)
  self.assertEqual(self.release_close().returncode,1);self.assertEqual(self.records()[0]['phase'],'open')
  subprocess.run(['git','tag','fixture-v1.0.0',self.old_c],cwd=self.repo,check=True,capture_output=True)
  self.assertEqual(self.release_close().returncode,1)
  subprocess.run(['git','tag','-f','fixture-v1.0.0',self.new_c],cwd=self.repo,check=True,capture_output=True)
  self.assertEqual(self.release_close().returncode,0)
 def test_release_alias_collision_refuses_before_any_replace(self):
  self.release_registry();(self.repo/'packages/fixture/package.json').write_text(json.dumps({'name':'renamed-fixture','version':'1.0.0','files':['x','CHANGELOG.md'],'dsh':{'prezhnie_imena':['fixture']}}))
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','alias'),('tag','-f','fixture-v1.0.0'),('tag','renamed-fixture-v1.0.0')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  q=self.release_head();self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'old');self.assertEqual(self.records(),[]);self.assertFalse((self.r/'mv.log').exists())
 def test_release_foreign_effective_repo_refuses_before_replace_and_before_close(self):
  self.release_registry();foreign=self.r/'foreign';subprocess.run(['git','clone',str(self.repo),str(foreign)],check=True,capture_output=True)
  self.env['MO_DEREVO_REPO']=str(foreign);q=self.release_head();self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old')
  self.env['MO_DEREVO_REPO']=str(self.repo);self.env['SMV_MONTAZH']=str(self.r/'second-backup-root')
  q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.release_pravka();self.env['MO_DEREVO_REPO']=str(foreign);self.assertEqual(self.release_close().returncode,1)
 def test_release_archive_pins_commit_even_when_head_moves_before_archive(self):
  self.release_registry();wrapper=self.b/'git';wrapper.write_text('#!/usr/bin/env python3\nimport sys,subprocess,os\na=sys.argv[1:]\nif "archive" in a:subprocess.run(["/usr/bin/git","-C",os.environ["FIX_REPO"],"update-ref","refs/heads/master",os.environ["FIX_OLD_C"]],check=True)\nsys.exit(subprocess.run(["/usr/bin/git",*a]).returncode)\n');wrapper.chmod(0o755)
  self.env.update(FIX_REPO=str(self.repo),FIX_OLD_C=self.old_c);q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.target.read_text(),'new');self.assertEqual([c['commit'] for c in self.records()[0]['checks'] if c['kind']=='tag'],[self.new_c])
 def test_release_no_registry_fallback_and_no_missing_manifest(self):
  self.release_registry();self.reg.write_text('not: [yaml');q=self.release_head();self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old')
 def test_release_manual_plan_cannot_omit_required_tag(self):
  self.release_registry();plan=self.r/'manual.json';raw=(self.repo/'packages/fixture/package.json').read_bytes();plan.write_text(json.dumps({'subjects':['file:'+str(self.live/'package.json')],'checks':[{'kind':'file','path':str(self.live/'package.json'),'sha256':hashlib.sha256(raw).hexdigest()}]}))
  q=self.release_head('--okno-plan',str(plan));self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old')
 def test_release_expired_failed_other_boot_and_manual_modes_do_not_defer(self):
  self.release_registry(True);self.assertEqual(self.release_head().returncode,0);rec=self.records()[0];file=self.state/(rec['id']+'.json')
  q=self.release_vow(False);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertTrue((self.r/'release-alerts').exists());(self.r/'release-alerts').unlink()
  import time
  for mode in ('failed','expired','boot'):
   value=dict(rec)
   if mode=='failed':value['phase']='failed'
   elif mode=='boot':value['boot_id']='other-boot'
   else:value['deadline_ns']=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;value['opened_ns']=value['deadline_ns']-1800*10**9
   file.write_text(json.dumps(value));q=self.release_vow();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
 def test_release_unknown_flags_refuse_before_write(self):
  for flag in ('--dry-run','-n','--check'):
   q=self.invoke('release',extra=(flag,));self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(self.records(),[]);self.assertEqual(self.target.read_text(),'old')
 def test_release_rollback_can_prove_absence_of_never_created_tag(self):
  self.release_registry(True);self.assertEqual(self.release_head().returncode,0);rec=self.records()[0]
  pkg=self.repo/'packages/fixture'
  for name in ('package.json','x','CHANGELOG.md'):(self.live/name).write_bytes(subprocess.check_output(['git','show',self.old_c+':packages/fixture/'+name],cwd=self.repo))
  checks=[]
  for c in rec['checks']:
   c=dict(c)
   if c['kind']=='file':c['sha256']=hashlib.sha256(Path(c['path']).read_bytes()).hexdigest()
   elif c['kind']=='tag':c.pop('commit');c.pop('tree',None);c.pop('subdir',None);c['kind']='tag_absent'
   checks.append(c)
  plan=self.r/'rollback.json';plan.write_text(json.dumps({'subjects':rec['subjects'],'checks':checks}))
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'otkat-proveren',rec['id'],'--plan',str(plan)],env=self.env,capture_output=True,text=True,timeout=20);self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  q=subprocess.run([str(PKG/'sbin/montazh-okno'),'otkat-proveren',rec['id']],env=self.env,capture_output=True,text=True,timeout=20);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records()[0]['phase'],'rolled_back')
 def test_strict_tag_namespace_in_derevo_and_generation_recheck(self):
  import runpy
  m=runpy.run_path(str(PKG/'sbin/montazh-okno'));self.owned_registry();subprocess.run(['git','tag','-d','fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True);c=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip();subprocess.run(['git','branch','fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True)
  trace=self.r/'namespace-trace';self.env['TAG_NS_TRACE']=str(trace)
  tool=self.b/'git';tool.write_text('#!/usr/bin/env python3\nimport sys,os,json,subprocess\na=sys.argv[1:]\nif "rev-parse" in a:\n with open(os.environ["TAG_NS_TRACE"],"a") as f:f.write(json.dumps(a[-1])+"\\n")\nsys.exit(subprocess.run(["/usr/bin/git",*a]).returncode)\n');tool.chmod(0o755)
  with mock.patch.dict(os.environ,self.env):
   self.assertTrue(m['verify']([{'kind':'tag','repo':str(self.repo),'ref':'fixture-v1.0.0','commit':c}],[]))
   self.assertEqual(json.loads(trace.read_text().splitlines()[0]),'refs/tags/fixture-v1.0.0^{commit}');trace.unlink()
   with self.assertRaises((ValueError,subprocess.SubprocessError)):m['verify_derevo'](self.entry,[])
   self.assertEqual(json.loads(trace.read_text().splitlines()[0]),'refs/tags/fixture-v1.0.0^{commit}');trace.unlink()
   try:accepted=m['unchanged']([('tag',{'repo':str(self.repo),'ref':'fixture-v1.0.0'},c)])
   except (ValueError,subprocess.SubprocessError):accepted=False
   self.assertFalse(accepted)
   self.assertEqual(json.loads(trace.read_text().splitlines()[0]),'refs/tags/fixture-v1.0.0^{commit}')


 def test_release_alias_added_after_open_prevents_close(self):
  self.release_registry()
  # Different spelling of the SAME package, not an unrelated package tag.
  pkg=self.repo/'packages/fixture/package.json';meta=json.loads(pkg.read_text());meta['name']='renamed-fixture'
  # Source metadata is immutable: prepare a real alias in its source before opening.
  pkg.write_text(json.dumps(meta))
  for args in [('add','.'),('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','rename alias'),('tag','-f','fixture-v1.0.0')]:subprocess.run(['git',*args],cwd=self.repo,check=True,capture_output=True)
  q=self.release_head();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.release_pravka()
  subprocess.run(['git','tag','renamed-fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True)
  q=self.release_close();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
 def test_release_descriptor_requires_matching_manifest_and_source(self):
  self.release_registry();raw=(self.repo/'packages/fixture/package.json').read_bytes();rows=self.r/'rows';descriptor=self.r/'release.json';descriptor.write_text(json.dumps({'repo':str(self.repo),'commit':self.new_c,'subdir':'packages/fixture','manifest':str(self.live/'package.json')}))
  for sha,path in [(hashlib.sha256(b'wrong').hexdigest(),self.live/'package.json'),(hashlib.sha256(raw).hexdigest(),self.target)]:
   rows.write_text(str(path)+'\t'+sha+'\t0\t0\t644\n');q=subprocess.run([str(PKG/'sbin/montazh-okno'),'podgotovit','--rows',str(rows),'--release',str(descriptor),'--registry',str(self.reg),'--task','B-N-2043-PROBE'],env=self.env,capture_output=True,text=True,timeout=20);self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.records(),[])
 def test_release_join_cannot_add_tag_to_an_old_file_only_window(self):
  self.release_registry();q=self.invoke('files');self.assertEqual(q.returncode,0,q.stdout+q.stderr);rec=self.records()[0];self.assertNotIn('tag:'+str(self.repo)+':fixture-v1.0.0',rec['subjects'])
  before=json.dumps(rec,sort_keys=True);q=self.release_head('--okno-id',rec['id']);self.assertNotEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(json.dumps(self.records()[0],sort_keys=True),before);self.assertFalse((self.live/'package.json').read_text()==(self.repo/'packages/fixture/package.json').read_text())


 def test_tag_absence_recheck_notices_new_tag_and_qualified_branch_is_refused(self):
  import runpy
  ns=runpy.run_path(str(PKG/'sbin/montazh-okno'));c={'kind':'tag_absent','repo':str(self.repo),'ref':'not-created-v1.0.0'};identities=[]
  self.assertEqual(ns['verify']([c],identities),[]);subprocess.run(['git','tag',c['ref']],cwd=self.repo,check=True,capture_output=True);self.assertFalse(ns['unchanged'](identities))
  with self.assertRaises(ValueError):ns['check_shape']({'kind':'tag','repo':str(self.repo),'ref':'refs/heads/fixture-v1.0.0','commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip()})


 def test_release_alias_shape_matches_vow_before_publication(self):
  import runpy
  ns=runpy.run_path(str(PKG/'sbin/montazh-okno'));self.release_registry();pkg=self.repo/'packages/fixture/package.json';base=json.loads(pkg.read_text());descriptor=self.r/'descriptor';cases=[False,None,[],{'prezhnie_imena':None},{'prezhnie_imena':False},{'prezhnie_imena':''},{'prezhnie_imena':['bad/alias']},{'prezhnie_imena':['a b']},{'prezhnie_imena':['a'+str(i) for i in range(17)]}]
  for bad in cases:
   with self.subTest(dsh=bad):
    meta=dict(base,dsh=bad);pkg.write_text(json.dumps(meta));subprocess.run(['git','add','.'],cwd=self.repo,check=True,capture_output=True);subprocess.run(['git','-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','bad aliases'],cwd=self.repo,check=True,capture_output=True);c=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip();subprocess.run(['git','tag','-f','fixture-v1.0.0'],cwd=self.repo,check=True,capture_output=True)
    descriptor.write_text(json.dumps({'repo':str(self.repo),'commit':c,'subdir':'packages/fixture','manifest':str(self.live/'package.json')}));rows=[{'kind':'file','path':str(self.live/'package.json'),'sha256':hashlib.sha256(pkg.read_bytes()).hexdigest()}]
    with mock.patch.dict(os.environ,self.env):
     with self.assertRaises(ValueError):ns['release_check'](descriptor,rows)


 def test_tag_absence_invalid_ref_cannot_be_green(self):
  import runpy
  ns=runpy.run_path(str(PKG/'sbin/montazh-okno'))
  for ref in ('foo..bar','foo/','refs/tags/','foo.lock','foo//bar','foo@{bar'):
   with self.subTest(ref=ref):
    with self.assertRaises(ValueError):ns['check_shape']({'kind':'tag_absent','repo':str(self.repo),'ref':ref})
  with self.assertRaises(ValueError):ns['check_shape']({'kind':'tag','repo':str(self.repo),'ref':'fixture-v1.0.0','commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip(),'release_aliases':['fixture-v1.0.0','bad..alias']})

if __name__=='__main__':unittest.main(verbosity=2)
