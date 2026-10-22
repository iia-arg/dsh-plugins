#!/usr/bin/python3 -B
"""Actual VOW, private Git tags/references/copies/window and sender; no live objects."""
from pathlib import Path
import datetime,hashlib,json,os,pwd,shutil,subprocess,tempfile,time,unittest,sys
PKG=Path(__file__).resolve().parents[1];HELPER=Path(os.environ.get('MONTAZH_OKNO_BIN',PKG.parent/'dsh-montazh/sbin/montazh-okno')).resolve()
REGISTRY_READER=Path(os.environ.get('MO_REESTR_PRIBOR','/usr/local/bin/agent-plugins')).resolve()
class Vow(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='vow-montazh-');self.r=Path(self.tmp.name);self.repo=self.r/'repo';self.pkg=self.repo/'packages/fixture';self.pkg.mkdir(parents=True);(self.pkg/'src').mkdir();self.live=self.r/'copies/fixture';self.live.parent.mkdir()
  (self.pkg/'package.json').write_text('{"name":"fixture","version":"1.0.0","files":["src","CHANGELOG.md"]}\n');(self.pkg/'src/x').write_text('old');(self.pkg/'CHANGELOG.md').write_text('## 1.0.0 — fixture\n')
  self.git('init','-q');self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','old');self.git('tag','fixture-v1.0.0');shutil.copytree(self.pkg,self.live)
  self.state=self.r/'windows';self.state.mkdir(mode=0o755);self.ident='4'*32;self.alert=self.r/'alert';self.alert.write_text('#!/bin/sh\necho called >> "'+str(self.r/'alerts')+'"\n');self.alert.chmod(0o755);(self.r/'empty').mkdir();(self.r/'exceptions').write_text('')
  self.env={**os.environ,'VYPUSK_REPO':str(self.repo),'VYPUSK_KORNI':str(self.r/'copies'),'VYPUSK_AGENT_KORNI':'','VYPUSK_INFO_KORNI':'','VYPUSK_SOOTVETSTVIYA':'','VYPUSK_SSYLKI':'','VYPUSK_RASKLADKA':'','VYPUSK_REESTR':'','VYPUSK_ALERT':str(self.alert),'VYPUSK_SOSTOYANIE':str(self.r/'sost'),'VYPUSK_ISKLYUCHENIYA':str(self.r/'exceptions'),'MONTAZH_OKNO_BIN':str(HELPER),'MO_STATE_DIR':str(self.state),'MO_DEREVO_REPO':str(self.repo),'MO_DEREVO_PRIBOR':str(PKG/'src/vypusk-okno-watch.sh'),'MO_REESTR_PRIBOR':str(REGISTRY_READER)}
 def tearDown(self):self.tmp.cleanup()
 def git(self,*args):return subprocess.run(['git',*args],cwd=self.repo,capture_output=True,text=True,check=True).stdout.strip()
 def invoke(self,automatic=False):return subprocess.run(['bash',str(PKG/'src/vypusk-okno-watch.sh'),*(['--avto-montazh'] if automatic else [])],env=self.env,capture_output=True,text=True,timeout=10)
 def window(self,subjects,checks):
  now=time.clock_gettime_ns(time.CLOCK_BOOTTIME);r=dict(schema=1,id=self.ident,task='B-N-2025',actor='fixture',boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),opened_ns=now,deadline_ns=now+1800*10**9,expires_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),phase='open',subjects=subjects,checks=checks);p=self.state/(self.ident+'.json');p.write_text(json.dumps(r));p.chmod(0o644);return p
 def unpublished(self):
  (self.live/'package.json').write_text('{"name":"fixture","version":"1.0.1","files":["src","CHANGELOG.md"]}\n');(self.live/'CHANGELOG.md').write_text('## 1.0.1 — fixture\n')
  shutil.copyfile(self.live/'package.json',self.pkg/'package.json');shutil.copyfile(self.live/'CHANGELOG.md',self.pkg/'CHANGELOG.md');self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','new')
  tag='fixture-v1.0.1';commit=self.git('rev-parse','HEAD')
  self.reg=self.r/'copy-registry'
  self.reg.write_text(json.dumps({'plugins':[dict(id='copy-fixture',path=str(self.live),version='1.0.1',installed_check='python3 -c '+repr('import json;print(json.load(open("'+str(self.live/'package.json')+'"))["version"])'))],'services':[]}))
  config=self.r/'copy-config.json';config.write_text(json.dumps({'VYPUSK_REPO':str(self.repo),'VYPUSK_SOOTVETSTVIYA':''}))
  self.env.update(MO_COPY_CONFIG=str(config),MO_COPY_PRIBOR=str(PKG/'src/copy-compare.sh'),VYPUSK_REESTR=str(self.reg))
  rows=self.r/'rows';rows.write_text(''.join(str(self.live/name)+'\t'+hashlib.sha256((self.live/name).read_bytes()).hexdigest()+'\t'+str(os.getuid())+'\t'+str(os.getgid())+'\t0644\n' for name in ('package.json','src/x','CHANGELOG.md')))
  descriptor=self.r/'release.json';descriptor.write_text(json.dumps(dict(repo=str(self.repo),commit=commit,subdir='packages/fixture',manifest=str(self.live/'package.json'))))
  q=self.helper('podgotovit','--rows',str(rows),'--registry',str(self.reg),'--release',str(descriptor),'--task','B-N-2043')
  self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.ident=q.stdout.strip()
 def derevo(self):
  self.env['VYPUSK_KORNI']=str(self.r/'empty');self.reg=self.r/'registry';p=self.live/'src/x';user=pwd.getpwuid(os.getuid()).pw_name
  d=dict(id='fixture-entry',derevo=dict(address=str(self.repo),ref='fixture-v1.0.0',subdir='packages/fixture',files=[dict(local=str(p),remote='src/x',mode='0644',owner=user+':'+user),dict(local=str(self.live/'package.json'),remote='package.json',mode='0644',owner=user+':'+user)],not_installed=['CHANGELOG.md'],expected_diff_files=[],links=[]))
  self.reg.write_text('services: '+json.dumps([d])+'\n');self.env['VYPUSK_REESTR']=str(self.reg);p.write_text('new');self.window(['file:'+str(p),'entry:fixture-entry'],[dict(kind='file',path=str(p),sha256=hashlib.sha256(b'new').hexdigest()),dict(kind='registry',path=str(self.reg),id='fixture-entry',expected={'derevo.ref':'fixture-v1.0.1'})]);return p
 def helper(self,*args):
  return subprocess.run([str(HELPER),*args],env=self.env,capture_output=True,text=True,timeout=25)
 def produced_derevo(self):
  p=self.derevo();(self.state/(self.ident+'.json')).unlink()
  self.entry=json.loads(self.reg.read_text().removeprefix('services: '))[0]
  self.entry.update(version='1.0.0',installed_check="printf '1.0.0\\n'")
  self.write_registry()
  st=p.stat();rows=self.r/'rows';rows.write_text(str(p)+'\t'+hashlib.sha256(p.read_bytes()).hexdigest()+'\t'+str(st.st_uid)+'\t'+str(st.st_gid)+'\t0644\n')
  q=self.helper('podgotovit','--rows',str(rows),'--registry',str(self.reg),'--task','B-N-2032-stand')
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.ident=q.stdout.strip();self.assertRegex(self.ident,r'^[0-9a-f]{32}$')
  record=json.loads((self.state/(self.ident+'.json')).read_text())
  self.assertEqual(set(record['subjects']),{'file:'+str(p),'entry:fixture-entry'})
  check=next(c for c in record['checks'] if c['kind']=='registry')
  self.assertIs(check['derevo_consistency'],True);self.assertEqual(check['owned_files'],[{'local':f['local'],'remote':f['remote']} for f in self.entry['derevo']['files']])  # dsh-montazh 3.1.9 (B-N-2034): все файлы записи, не цели вызова
  return p
 def write_registry(self):
  self.reg.write_text('services: '+json.dumps([self.entry])+'\n')
 def complete_derevo_reference(self):
  (self.pkg/'src/x').write_bytes((self.live/'src/x').read_bytes());self.git('add','.');self.git('-c','user.name=Fixture','-c','user.email=fixture@sadik','commit','-qm','completed private derevo')
  self.git('tag','fixture-next');self.entry['derevo']['ref']='fixture-next';self.write_registry()
 def phase(self):
  return json.loads((self.state/(self.ident+'.json')).read_text())['phase']
 def test_produced_entry_defers_and_closes_only_after_registry_reference(self):
  self.produced_derevo();q=self.invoke(True);self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertIn('entry:fixture-entry',q.stdout);self.assertFalse((self.r/'alerts').exists())
  q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('derevo not accepted',q.stderr);self.assertEqual(self.phase(),'open')
  self.complete_derevo_reference();q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.phase(),'closed');q=self.invoke(True);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse((self.r/'alerts').exists())
 def test_produced_entry_rejects_reassigned_target_then_recovers(self):
  self.produced_derevo();self.complete_derevo_reference();original=self.entry['derevo']['files'][0]['local'];replacement=self.r/'other-target';replacement.write_text('new');self.entry['derevo']['files'][0]['local']=str(replacement);self.write_registry()
  q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('derevo ownership changed',q.stderr);self.assertEqual(self.phase(),'open')
  self.entry['derevo']['files'][0]['local']=original;self.write_registry();q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.phase(),'closed')
 def test_produced_entry_rejects_failed_registry_reader_then_recovers(self):
  self.produced_derevo();self.complete_derevo_reference();correct=self.entry['installed_check'];self.entry['installed_check']='printf "1.0.0\\n" "$(false)"';self.write_registry()
  q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('registry value not accepted',q.stderr);self.assertEqual(self.phase(),'open')
  self.entry['installed_check']=correct;self.write_registry();q=self.helper('zakryt',self.ident);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(self.phase(),'closed')
 def test_manual_unpublished_stays_red_with_window(self):
  p=self.invoke();self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.unpublished();p=self.invoke();self.assertEqual(p.returncode,1,p.stdout+p.stderr);self.assertNotIn('ОТЛОЖЕНО',p.stdout)
 def test_auto_unpublished_is_four_and_does_not_advance_delivery(self):
  self.assertEqual(self.invoke().returncode,0);self.unpublished();(self.r/'sost').write_text('previous 123\n');p=self.invoke(True);self.assertEqual(p.returncode,4,p.stdout+p.stderr);self.assertIn(self.ident,p.stdout);self.assertFalse((self.r/'alerts').exists());self.assertEqual((self.r/'sost').read_text(),'previous 123\n')
 def test_derevo_hash_only_deferred_but_bad_permissions_strict(self):
  p=self.derevo();q=self.invoke();self.assertEqual(q.returncode,1,q.stdout+q.stderr);(self.r/'alerts').unlink(missing_ok=True);q=self.invoke(True);self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertFalse((self.r/'alerts').exists());p.chmod(0o600);q=self.invoke(True);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('режим:',q.stdout)
 def test_other_copy_of_same_package_is_not_hidden(self):
  other=self.r/'copies2/fixture';shutil.copytree(self.live,other);self.env['VYPUSK_KORNI']+=':'+str(other.parent);self.unpublished();shutil.copyfile(self.live/'package.json',other/'package.json');q=self.invoke(True);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn(str(other),q.stdout)
 def test_invalid_record_stays_strict_then_restore(self):
  self.unpublished();f=self.state/(self.ident+'.json');f.chmod(0o666);q=self.invoke(True);self.assertEqual(q.returncode,1,q.stdout+q.stderr);f.chmod(0o644);q=self.invoke(True);self.assertEqual(q.returncode,4,q.stdout+q.stderr)
 def test_late_close_resamples_once_without_old_owner_alert(self):
  self.unpublished();wrapper=self.r/'helper';marker=self.r/'closed'
  wrapper.write_text('#!/usr/bin/python3\nimport subprocess,sys\nfrom pathlib import Path\na=sys.argv[1:]\n'
   +'m=Path('+repr(str(marker))+')\n'
   +'if a[0]=="otlozheno" and not m.exists():\n'
   +' subprocess.run('+repr(['git','-C',str(self.repo),'tag','fixture-v1.0.1'])+',check=True,capture_output=True)\n'
   +' subprocess.run('+repr([str(HELPER),'zakryt',self.ident])+',check=True,capture_output=True)\n m.write_text("1")\n'
   +'p=subprocess.run('+repr([str(HELPER)])+'+a,capture_output=True,text=True);print(p.stdout,end="");sys.exit(p.returncode)\n');wrapper.chmod(0o755);self.env['MONTAZH_OKNO_BIN']=str(wrapper)
  q=self.invoke(True);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('ПЕРЕСНИМАЮ',q.stdout);self.assertTrue(marker.exists());self.assertFalse((self.r/'alerts').exists())
 def test_expiry_after_measurement_cannot_return_four(self):
  self.unpublished();wrapper=self.r/'helper';counter=self.r/'count';record=self.state/(self.ident+'.json')
  wrapper.write_text('#!/usr/bin/python3\nimport subprocess,sys,json,time\nfrom pathlib import Path\na=sys.argv[1:]\n'
   +'p=subprocess.run('+repr([str(HELPER)])+'+a,capture_output=True,text=True)\n'
   +'if a[0]=="otlozheno" and p.returncode==4:\n c=Path('+repr(str(counter))+');n=int(c.read_text())+1 if c.exists() else 1;c.write_text(str(n))\n'
   +' if n==1:\n  f=Path('+repr(str(record))+');d=json.loads(f.read_text());d["deadline_ns"]=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;d["opened_ns"]=d["deadline_ns"]-1800*10**9;f.write_text(json.dumps(d))\n'
   +'print(p.stdout,end="");sys.exit(p.returncode)\n');wrapper.chmod(0o755);self.env['MONTAZH_OKNO_BIN']=str(wrapper)
  # The linked query is one call now; expire after its measurement, before the final generation check.
  q=self.invoke(True);self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertTrue((self.r/'alerts').exists());self.assertEqual(counter.read_text(),'1')
 def test_informational_copy_is_not_deferred_or_counted_twice(self):
  self.unpublished();self.env['VYPUSK_INFO_KORNI']=str(self.r/'copies');q=self.invoke(True)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertNotIn('ОТЛОЖЕНО',q.stdout);self.assertNotIn('распределены дважды',q.stdout);self.assertNotIn('ОХВАТ НЕ СОШЁЛСЯ',q.stdout+q.stderr)
 # B-N-1978: слепота записи derevo (not_installed нет в метке — вид ложных 14.10 dsh-pochta/dsh-montazh) в окне монтажа
 def slepaya_zapis(self,vid='razryv'):
  # vid: razryv — not_installed нет в метке (:657) · metki-net — ref на метку, которой нет (:624) · dubl — структурная, дубль remote (:648) ·
  #      smes — razryv + структурная expected_diff_files (:659)
  self.env['VYPUSK_KORNI']=str(self.r/'empty');self.reg=self.r/'registry';user=pwd.getpwuid(os.getuid()).pw_name
  f1=dict(local=str(self.live/'src/x'),remote='src/x',mode='0644',owner=user+':'+user);f2=dict(local=str(self.live/'package.json'),remote='package.json',mode='0644',owner=user+':'+user)
  if vid=='dubl': f2=dict(f2,remote='src/x')
  d=dict(id='fixture-entry',derevo=dict(address=str(self.repo),ref='fixture-v9.9.9' if vid=='metki-net' else 'fixture-v1.0.0',subdir='packages/fixture',files=[f1,f2],not_installed=['CHANGELOG.md']+(['net-v-metke.txt'] if vid in ('razryv','smes') else []),expected_diff_files=['net-v-files'] if vid=='smes' else [],links=[]))
  self.reg.write_text('services: '+json.dumps([d])+'\n');self.env['VYPUSK_REESTR']=str(self.reg)
 def okno_zapisi(self,entry,istekshee=False):
  p=self.window(['entry:'+entry],[dict(kind='registry',path=str(self.reg),id=entry,expected={'derevo.ref':'fixture-v1.0.0'})])
  if istekshee:
   d=json.loads(p.read_text());d['deadline_ns']=time.clock_gettime_ns(time.CLOCK_BOOTTIME)-1;d['opened_ns']=d['deadline_ns']-1800*10**9;p.write_text(json.dumps(d))
 def test_b1978_entry_blindness_deferred_only_in_window_naming_entry(self):
  self.slepaya_zapis();q=self.invoke(True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('net-v-metke.txt',q.stdout+q.stderr);self.assertTrue((self.r/'alerts').exists())
  (self.r/'alerts').unlink();(self.r/'sost.slepota').unlink(missing_ok=True)
  self.okno_zapisi('fixture-entry');q=self.invoke(True);self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertIn('entry:fixture-entry',q.stdout);self.assertNotIn('поздняя слепота',q.stdout+q.stderr);self.assertFalse((self.r/'alerts').exists())
 def test_b1978_entry_blindness_not_hidden_by_other_entry_window(self):
  self.slepaya_zapis();self.okno_zapisi('drugaya-zapis');q=self.invoke(True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('ОТЛОЖЕНО',q.stdout);self.assertTrue((self.r/'alerts').exists())
 def test_b1978_structural_blindness_red_in_own_window(self):
  self.slepaya_zapis('dubl');self.okno_zapisi('fixture-entry');q=self.invoke(True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('повторён',q.stdout+q.stderr);self.assertNotIn('ОТЛОЖЕНО',q.stdout);self.assertTrue((self.r/'alerts').exists())
 def test_b1978_missing_tag_deferred_in_own_window(self):
  self.slepaya_zapis('metki-net');self.okno_zapisi('fixture-entry');q=self.invoke(True);self.assertEqual(q.returncode,4,q.stdout+q.stderr);self.assertIn('entry:fixture-entry',q.stdout);self.assertFalse((self.r/'alerts').exists())
 def test_b1978_mixed_blindness_red_in_own_window(self):
  self.slepaya_zapis('smes');self.okno_zapisi('fixture-entry');q=self.invoke(True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('expected_diff_files',q.stdout+q.stderr);self.assertNotIn('ОТЛОЖЕНО',q.stdout);self.assertTrue((self.r/'alerts').exists())
 def test_b1978_entry_blindness_expired_window_strict(self):
  self.slepaya_zapis();self.okno_zapisi('fixture-entry',istekshee=True);q=self.invoke(True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('ОТЛОЖЕНО',q.stdout);self.assertTrue((self.r/'alerts').exists())
if __name__=='__main__':
 if os.geteuid()!=0:print('СЛЕПОТА: стенд окна требует root для root-owned подставных записей');sys.exit(2)
 if not HELPER.is_file() or not os.access(HELPER,os.X_OK):print('СЛЕПОТА: helper montazh-okno недоступен: '+str(HELPER));sys.exit(2)
 if not REGISTRY_READER.is_file() or not os.access(REGISTRY_READER,os.R_OK):print('СЛЕПОТА: reader agent-plugins недоступен: '+str(REGISTRY_READER));sys.exit(2)
 unittest.main(verbosity=2)
