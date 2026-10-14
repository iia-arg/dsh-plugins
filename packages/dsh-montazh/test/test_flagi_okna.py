"""Effective-command observer on copied systemctl responses; never starts a unit."""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile,unittest
PKG=Path(__file__).resolve().parents[1]
UNITS={'vypusk-okno-watch':'bash','registry-watchdog':'bash','dve-kopii-watch':'python','zhivaya-versiya-watch':'python'}
class Flags(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='flags-okna-');self.root=Path(self.tmp.name);self.fixture=self.root/'show.json'
  self.commands={}
  for name,lang in UNITS.items():
   script='/usr/local/sbin/'+name+('.sh' if lang=='bash' else '')
   self.commands[name+'.service']='Id='+name+'.service\nLoadState=loaded\nExecStart={ path=/usr/local/bin/'+lang+'-padenie-70 ; argv[]=/usr/local/bin/'+lang+'-padenie-70 '+script+' --avto-montazh ; ignore_errors=no ; }\nEnvironment=\nEnvironmentFiles=\n'
  # B-N-2037: читатель registry-watchdog — исходник дерева (его строки умолчаний), conf — исправная форма боя 01:22Z (с $MONTAZH_KEY).
  self.conf_ok=('VERIFY_CMD="sudo -n /usr/local/bin/agent-plugins verify $MONTAZH_KEY"\n'
   'DORABOTKI_CMD="/opt/iskra/workspace/dorabotki/nashi-dorabotki.sh --check $MONTAZH_KEY"\n'
   'HEALTH_CMD="/usr/local/bin/agent-plugins list --health $MONTAZH_KEY"\nHEALTH_ENABLED=1\n')
  self.files={'/usr/local/sbin/registry-watchdog.sh':(PKG.parent/'dsh-reestr/bin/registry-watchdog.sh').read_text(),
              '/etc/registry-watchdog/registry-watchdog.conf':self.conf_ok}
 def tearDown(self):self.tmp.cleanup()
 def run_observer(self):
  self.fixture.write_text(json.dumps({'commands':self.commands,'files':self.files}))
  return subprocess.run(['python3','-B',str(PKG/'test/stend-flagi-okna.py'),'--proba',str(self.fixture)],capture_output=True,text=True,timeout=25)
 def test_healthy_remove_each_flag_restore(self):
  self.assertEqual(self.run_observer().returncode,0)
  for name in UNITS:
   unit=name+'.service';healthy=self.commands[unit]
   self.assertEqual(healthy.count('--avto-montazh'),1)
   before=hashlib.sha256(healthy.encode()).hexdigest();bad=healthy.replace(' --avto-montazh','',1);after=hashlib.sha256(bad.encode()).hexdigest()
   self.assertNotEqual(before,after);self.commands[unit]=bad
   q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('КРАСНОЕ '+unit,q.stdout)
   control=self.root/'response';control.write_text(bad)
   count=subprocess.run(['grep','-cF','--','--avto-montazh',str(control)],capture_output=True,text=True).stdout.strip();self.assertEqual(count,'0')
   print('PORCHA',unit,before,'->',after,'grepF='+count,flush=True)
   self.commands[unit]=healthy;self.assertEqual(self.run_observer().returncode,0)
 def test_substring_flag_and_wrong_reader_are_red(self):
  unit='registry-watchdog.service';healthy=self.commands[unit]
  for changed in [healthy.replace('--avto-montazh','--avto-montazh-extra'),healthy.replace('/usr/local/sbin/registry-watchdog.sh','/usr/local/sbin/other.sh')]:
   self.commands[unit]=changed;q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
 def test_unloaded_missing_or_malformed_is_blind(self):
  unit='dve-kopii-watch.service';healthy=self.commands[unit]
  for changed in [healthy.replace('LoadState=loaded','LoadState=not-found'),healthy.replace('Id=dve-kopii-watch.service','Id=other.service'),'Id='+unit+'\nLoadState=loaded\nExecStart=\n']:
   self.commands[unit]=changed;q=self.run_observer();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА '+unit,q.stdout)
 def test_unknown_arguments_refused(self):
  for option in ['--dry-run','--check','-n']:
   q=subprocess.run(['python3','-B',str(PKG/'test/stend-flagi-okna.py'),option],capture_output=True,text=True)
   self.assertEqual(q.returncode,2,q.stdout+q.stderr)
   self.assertIn('unrecognized arguments:',q.stderr)

 def test_executable_path_cannot_be_spoofed_by_argv(self):
  unit='registry-watchdog.service';self.commands[unit]=self.commands[unit].replace('path=/usr/local/bin/bash-padenie-70','path=/bin/false')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
 def test_bad_fixture_shape_is_named_blindness(self):
  self.fixture.write_text('[]')
  q=subprocess.run(['python3','-B',str(PKG/'test/stend-flagi-okna.py'),'--proba',str(self.fixture)],capture_output=True,text=True)
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('СЛЕПОТА',q.stdout);self.assertNotIn('Traceback',q.stderr)

 # B-N-2037: действующие команды registry-watchdog после conf и действующий помощник окна.
 def test_conf_drops_key_red_restore_green(self):
  conf='/etc/registry-watchdog/registry-watchdog.conf'
  for k in ['VERIFY_CMD','DORABOTKI_CMD','HEALTH_CMD']:
   bad='\n'.join(l.replace(' $MONTAZH_KEY','') if l.startswith(k+'=') else l for l in self.conf_ok.split('\n'))
   before=hashlib.sha256(self.conf_ok.encode()).hexdigest()[:16];after=hashlib.sha256(bad.encode()).hexdigest()[:16];self.assertNotEqual(before,after)
   self.files[conf]=bad;q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr)
   self.assertIn('КРАСНОЕ registry-watchdog.service: действующая '+k+' (avto режим',q.stdout)
   self.assertEqual(q.stdout.count('КРАСНОЕ'),1,q.stdout)
   print('PORCHA conf',k,before,'->',after,flush=True)
   self.files[conf]=self.conf_ok;self.assertEqual(self.run_observer().returncode,0)
 def test_conf_literal_key_red_in_manual_mode(self):
  self.files['/etc/registry-watchdog/registry-watchdog.conf']=self.conf_ok.replace('verify $MONTAZH_KEY','verify --avto-montazh')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('действующая VERIFY_CMD (ruchnoj режим',q.stdout)
 def test_conf_absent_defaults_green(self):
  del self.files['/etc/registry-watchdog/registry-watchdog.conf'];self.assertEqual(self.run_observer().returncode,0)
 def test_unit_environment_overrides_default_red(self):
  u='registry-watchdog.service';del self.files['/etc/registry-watchdog/registry-watchdog.conf']
  self.commands[u]=self.commands[u].replace('Environment=\n','Environment="HEALTH_CMD=/usr/local/bin/agent-plugins list --health"\n')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('действующая HEALTH_CMD (avto режим',q.stdout)
 def test_reader_defaults_missing_is_blind(self):
  self.files['/usr/local/sbin/registry-watchdog.sh']='#!/bin/bash\n';q=self.run_observer();self.assertEqual(q.returncode,2,q.stdout+q.stderr)
  self.assertIn('СЛЕПОТА registry-watchdog.service',q.stdout);self.assertIn('found 0 times, need 3',q.stdout)

 # B-N-2037 r2 (№16 сменил читателя 05:01Z): формы читателя — хвостовой комментарий, две формы чтения conf, пустое умолчание.
 def reader(self):return self.files['/usr/local/sbin/registry-watchdog.sh']
 def test_reader_forms_r2(self):
  r=self.reader();self.assertEqual(r.count('\n    . "$CONF"\n'),1);self.assertIn('HEALTH_CMD="${HEALTH_CMD:-agent-plugins list --health $MONTAZH_KEY}"   #',r)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r.replace('\n    . "$CONF"\n','\n    [ -r "$CONF" ] && . "$CONF"\n')
  q=self.run_observer();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r.replace('\n    . "$CONF"\n','\n    . "$CONF"\n    . "$CONF"\n')
  q=self.run_observer();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('conf sourcing line found 2 times, need 1',q.stdout)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r;self.assertEqual(self.run_observer().returncode,0)
 def test_empty_default_not_judged_only_where_reader_skips(self):
  conf='/etc/registry-watchdog/registry-watchdog.conf';self.files[conf]='\n'.join(l for l in self.conf_ok.split('\n') if not l.startswith('DORABOTKI_CMD='))
  q=self.run_observer();self.assertEqual(q.returncode,0,q.stdout+q.stderr)
  self.assertEqual(q.stdout.count('НЕ СУДИТСЯ registry-watchdog.service: действующая DORABOTKI_CMD'),2,q.stdout)
  r=self.reader();self.assertEqual(r.count('if [ -z "$DORABOTKI_CMD" ]'),1)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r.replace('if [ -z "$DORABOTKI_CMD" ]','if false')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('действующая DORABOTKI_CMD (avto режим',q.stdout)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r;self.files[conf]=self.conf_ok;q=self.run_observer();self.assertEqual(q.returncode,0);self.assertNotIn('НЕ СУДИТСЯ',q.stdout)
 # B-N-2037 r3 (LOW Вениамина 06:3xZ): признак пропуска в КОММЕНТАРИИ читателя не делает пустую команду «не судимой».
 def test_skip_marker_in_comment_does_not_count(self):
  conf='/etc/registry-watchdog/registry-watchdog.conf';r=self.reader();self.assertNotIn('if [ -z "$HEALTH_CMD" ]',r)
  self.files[conf]=self.conf_ok.replace('HEALTH_CMD="/usr/local/bin/agent-plugins list --health $MONTAZH_KEY"','HEALTH_CMD=""')
  self.files['/usr/local/sbin/registry-watchdog.sh']=r.replace('\nCONF_BEDA=""\n','\n# прежде было: if [ -z "$HEALTH_CMD" ]; then — блок пропускался\n    #if [ -z "$HEALTH_CMD" ]; then\nCONF_BEDA=""\n',1)
  self.assertEqual(self.files['/usr/local/sbin/registry-watchdog.sh'].count('if [ -z "$HEALTH_CMD" ]'),2)
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('действующая HEALTH_CMD (avto режим',q.stdout);self.assertNotIn('НЕ СУДИТСЯ',q.stdout)
  self.files['/usr/local/sbin/registry-watchdog.sh']=r;q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertNotIn('НЕ СУДИТСЯ',q.stdout)
  self.files[conf]=self.conf_ok;self.assertEqual(self.run_observer().returncode,0)
 def test_window_helper_override_red(self):
  u='vypusk-okno-watch.service';self.files['/etc/vypusk-okno-watch.env']='VYPUSK_REPO=/x\nMONTAZH_OKNO_BIN=/bin/true\n'
  self.commands[u]=self.commands[u].replace('EnvironmentFiles=\n','EnvironmentFiles=/etc/vypusk-okno-watch.env (ignore_errors=yes)\n')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('КРАСНОЕ '+u+': действующий помощник окна MONTAZH_OKNO_BIN=/bin/true',q.stdout)
  self.files['/etc/vypusk-okno-watch.env']='VYPUSK_REPO=/x\nMONTAZH_OKNO_BIN=/usr/local/sbin/montazh-okno\n';self.assertEqual(self.run_observer().returncode,0)
  u='dve-kopii-watch.service';self.commands[u]=self.commands[u].replace('Environment=\n','Environment=DKW_OSNOVA=/x MONTAZH_OKNO_BIN=/tmp/zlo\n')
  q=self.run_observer();self.assertEqual(q.returncode,1,q.stdout+q.stderr);self.assertIn('КРАСНОЕ '+u+': действующий помощник окна',q.stdout)
if __name__=='__main__':unittest.main(verbosity=2)
