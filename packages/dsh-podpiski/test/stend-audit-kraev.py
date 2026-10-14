#!/usr/bin/env python3
# Real package code, private files, fake CLI/registry/journal. Never reaches provider or host gateways.
from pathlib import Path
import base64,contextlib,fcntl,io,json,os,runpy,shutil,signal,subprocess,sys,tempfile,time,unittest,warnings
from unittest.mock import patch
ROOT=Path(os.environ.get('PODPISKI_TEST_ROOT',Path(__file__).resolve().parents[1]))
class Edges(unittest.TestCase):
 def setUp(self):
  warnings.simplefilter('ignore',ResourceWarning)  # legacy open()/json.load readers; unrelated to these audit probes
  self.tmp=tempfile.TemporaryDirectory(prefix='m11-edge-');self.d=Path(self.tmp.name);(self.d/'bin').mkdir();self.env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
 def tearDown(self):self.tmp.cleanup()
 def exe(self,name,text):
  p=self.d/'bin'/name;p.write_text(text);p.chmod(0o755);return p
 def module(self,relative,env=None):
  with patch.dict(os.environ,env or {},clear=False),patch.object(sys,'argv',[str(ROOT/relative)]):return runpy.run_path(str(ROOT/relative))
 def test_01_buffered_notifications_do_not_hide_response(self):
  home=self.d/'home';home.mkdir();server=self.exe('app-server','''#!/usr/bin/env python3
import sys,json,os
for line in sys.stdin:
 r=json.loads(line)
 if 'id' in r:
  reply={'id':r['id'],'result':{'account':{'id':'fixture'}}}
  os.write(1,(json.dumps({'method':'notice'})+'\\n'+json.dumps(reply)+'\\n').encode())
''')
  script=self.d/'run.py';script.write_text("import runpy,json,sys;m=runpy.run_path(sys.argv[1]);f=m['app_server_refresh'];f.__globals__.update(BIN=sys.argv[2],DOM=sys.argv[3],PREDEL_S=0.2);print(json.dumps(f()))\n")
  p=subprocess.Popen([sys.executable,str(script),str(ROOT/'sbin/codex-obnovitel'),str(server),str(home)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  try:
   try:out,err=p.communicate(timeout=2)
   except subprocess.TimeoutExpired:self.fail('actual refresh missed a response written with a notification')
   self.assertEqual(p.returncode,0,err);self.assertIn('fixture',out.decode())
  finally:
   if p.poll() is None:os.killpg(p.pid,signal.SIGKILL);p.communicate(timeout=2)
 def test_03_directory_is_not_closed_site_state(self):
  m=self.module('libexec/sadik-switch-exec');state=self.d/'state';state.mkdir()
  for family in ['sss','sss-on']:
   try:text,code=m['vyklyuchatel_sajta'](family,state)
   except OSError as e:self.fail('filesystem error escaped '+type(e).__name__)
   self.assertEqual(code,2,text);self.assertIn('ОТКАЗ',text);self.assertTrue(state.is_dir())
 def test_03_create_replace_error_is_named_refusal(self):
  m=self.module('libexec/sadik-switch-exec');state=self.d/'closed';fault=[]
  def denied(src,dst):fault.append(str(dst));raise OSError('private replace failure')
  with patch.object(os,'replace',denied):
   try:text,code=m['vyklyuchatel_sajta']('sss',state)
   except OSError as e:self.fail('create error escaped '+type(e).__name__)
  self.assertEqual(code,2,text);self.assertIn('ОТКАЗ',text);self.assertTrue(fault);self.assertFalse(state.exists());self.assertFalse(list(self.d.glob('.closed.*')))
  self.assertEqual(m['vyklyuchatel_sajta']('sss',state)[1],0)
 def test_04_missing_home_preserves_known_thresholds_and_disables_auto(self):
  homes=[self.d/'homes'/n for n in ('alfa','beta','gamma','marc','anna')]
  for h in homes:h.mkdir(parents=True)
  for n in ('3','4'):
   p=self.d/('sub-'+n);p.mkdir();(p/'auth.json').write_text('{}')
  for h in homes:(h/'auth.json').symlink_to(self.d/'sub-3/auth.json')
  m=self.module('sbin/codex-limit-watch');f=m['glavnaya'];g=f.__globals__;alerts=[]
  g.update(DOMA=list(map(str,homes)),KATALOG=str(self.d/'sub-{n}'),SOST=str(self.d/'clw.json'),NASTROJKA=str(self.d/'avto.json'),PEREKL=str(self.d/'NEVER-switch'),ALERT='/bin/false',horizons=lambda *a:None,trevoga=lambda text,**kw:alerts.append(text) or True)
  (self.d/'avto.json').write_text('{"avto":true}')
  def run():
   with patch.object(sys,'argv',['candidate']),contextlib.redirect_stdout(io.StringIO()):
    try:f()
    except SystemExit as e:self.assertEqual(e.code,0)
  for usage in (.85,.99):
   g['prochest']=lambda n:dict(plan='fixture',dolya=usage if n=='3' else .1,sbros=time.time()+3600,mozhno=True,spend=False,kredity=None,okno='fake',syroe={},limit_ids=[],diagnostika={})
   for h in homes:
    (self.d/'clw.json').write_text('{}');alerts.clear();(h/'auth.json').unlink();run()
    self.assertTrue(any('85%' in a or 'выбрана' in a for a in alerts),h.name+' known threshold disappeared')
    self.assertTrue(any(h.name in a and 'ссыл' in a for a in alerts),h.name+' missing link must be named')
    self.assertFalse(any('АВТОПЕРЕКЛЮЧЕНИЕ' in a for a in alerts));count=len(alerts);run();self.assertEqual(len(alerts),count,'same link failure must deduplicate')
    (h/'auth.json').symlink_to(self.d/'sub-3/auth.json');g['avto_vkl']=lambda:False;run();self.assertTrue(any('снова' in a for a in alerts));g['avto_vkl']=lambda:True
 def test_15_overrides_require_explicit_keys(self):
  overrides={'AGENTS_REGISTRY':'/fixture/registry','KATALOG_KLYUCHEJ':'/fixture/keys','SVYAZKI_SVESTI':'/fixture/helper'}
  m=self.module('sbin/svyazki-podpisok',overrides);self.assertEqual(m['REESTR'],'/etc/agent-registry/agents.yaml');self.assertEqual(m['KATALOG'],'/etc/claude-oauth');self.assertEqual(m['SVESTI'],'/usr/local/sbin/svesti-dostup-podpisok')
  m=self.module('sbin/svyazki-podpisok',{**overrides,'SVYAZKI_STEND':'1'});self.assertEqual(m['REESTR'],overrides['AGENTS_REGISTRY']);self.assertEqual(m['SVESTI'],overrides['SVYAZKI_SVESTI'])
  with self.assertRaises(SystemExit) as ex:self.module('sbin/svyazki-podpisok',{'SVYAZKI_STEND':'oops'})
  self.assertEqual(ex.exception.code,2)
  path=ROOT/'sbin/codex-katalog-watch';prefix=path.read_text().split('REGISTRY = {}')[0]
  for key,expected in [('', '/usr/local/bin/agent-alert'),('1','/fixture/alert')]:
   with patch.dict(os.environ,{'CKW_STEND':key,'AGENT_ALERT_BIN':'/fixture/alert','CKW_PAMYAT':'/fixture/state'}),patch.object(sys,'argv',[str(path)]):
    ns={};exec(compile(prefix,str(path),'exec'),ns)
   self.assertEqual(ns['ALERT'],expected)
  with patch.dict(os.environ,{'CKW_STEND':'oops'}),patch.object(sys,'argv',[str(path)]),self.assertRaises(SystemExit) as ex:exec(compile(prefix,str(path),'exec'),{})
  self.assertEqual(ex.exception.code,2)
 def test_06_executable_has_working_python_interpreter(self):
  payload=base64.urlsafe_b64encode(json.dumps({'exp':1}).encode()).decode().rstrip('=');auth=self.d/'auth.json';auth.write_text(json.dumps({'tokens':{'access_token':'TEST_ONLY.'+payload+'.fixture'}}));env={**self.env,'CODEX_AUTH_JSON':str(auth)}
  try:p=subprocess.run([str(ROOT/'libexec/codex-limits-measure.py')],env=env,capture_output=True,text=True,timeout=3)
  except OSError as e:self.fail('executable missing interpreter: '+type(e).__name__)
  self.assertEqual(p.returncode,3,p.stdout+p.stderr);self.assertIn('истёк',p.stdout)
 def test_13_force_form_cannot_override_a_previous_target(self):
  fake=self.exe('systemctl','#!/bin/sh\nexit 0\n');env={**self.env,'SWITCH_STEND':'1','SWITCH_REGISTRY':'/bin/false','SWITCH_SVESTI':'/bin/false','SWITCH_SYSTEMCTL':str(fake),'SWITCH_ENV_DIR':str(self.d),'SWITCH_LIMIT_DIR':str(self.d),'SWITCH_ALERT':'/bin/false','SWITCH_OTMETKA':str(self.d/'mark'),'SWITCH_ITOG_FILE':str(self.d/'result'),'SWITCH_BAK_DIR':str(self.d/'backup'),'SWITCH_LIMITY_READER':'/bin/false','SWITCH_TURN_CMD':'/bin/false','SWITCH_HOD_CMD':'/bin/false','SWITCH_START_CMD':'/bin/false','SWITCH_JOURNALCTL':'/bin/false'}
  p=subprocess.run(['bash',str(ROOT/'sbin/pereklyuchatel-podpiski'),'1','2-force'],env=env,capture_output=True,text=True,timeout=3);self.assertEqual(p.returncode,2,p.stdout+p.stderr);self.assertIn('цель задана дважды',p.stdout+p.stderr);self.assertFalse((self.d/'mark').exists())
 def test_14_duplicate_gateway_env_refuses_without_write(self):
  path=self.d/'instance-fixture.env';path.write_text('GATEWAY_TOKEN_FILE=old-1\nGATEWAY_TOKEN_FILE=old-2\n');(self.d/'token-podpiska-1').write_text('TEST_ONLY');before=path.read_bytes();m=self.module('sbin/svyazki-podpisok',{'SVYAZKI_STEND':'1'});f=m['cmd_razlozhit'];g=f.__globals__;g.update(KATALOG=str(self.d),SVESTI='/bin/true',chitat_reestr=lambda:[{'imya':'fixture','podpiska':'podpiska-1','polzovatel':'fixture'}])
  with patch.dict(os.environ,{'KATALOG_KLYUCHEJ':str(self.d),'SVYAZKI_SVESTI':'/bin/true','SVYAZKI_STEND':'1'}):code=f(True)
  self.assertEqual(code,2);self.assertEqual(path.read_bytes(),before)
 def test_14_whitespace_duplicate_is_rejected_before_helper(self):
  helper=self.exe('helper','#!/bin/sh\necho called >> "'+str(self.d/'calls')+'"\n');env={'SVYAZKI_STEND':'1','KATALOG_KLYUCHEJ':str(self.d),'SVYAZKI_SVESTI':str(helper)};m=self.module('sbin/svyazki-podpisok',env);f=m['cmd_razlozhit'];f.__globals__.update(chitat_reestr=lambda:[{'imya':'fixture','podpiska':'podpiska-1'}]);(self.d/'token-podpiska-1').write_text('TEST_ONLY')
  path=self.d/'instance-fixture.env'
  for space in (' ','\t'):
   with self.subTest(space=repr(space)):
    path.write_text('GATEWAY_TOKEN_FILE=old\n'+space+'GATEWAY_TOKEN_FILE=shadow\n');before=path.read_bytes()
    with patch.dict(os.environ,env):rc=f(True)
    self.assertEqual(rc,2);self.assertEqual(path.read_bytes(),before);self.assertFalse((self.d/'calls').exists())
 def test_16_non_json_and_missing_cursor_are_named_refusals(self):
  fake=self.exe('journalctl','#!/bin/sh\ncat "$JOURNAL_FIXTURE"\n');fixture=self.d/'journal';m=self.module('libexec/codex-compaction-vyborka')
  for text in ['not json\n',json.dumps({'MESSAGE':'fixture'})+'\n']:
   fixture.write_text(text);target=self.d/'out';target.mkdir(exist_ok=True)
   with patch.dict(os.environ,{'JOURNAL_FIXTURE':str(fixture)}):
    try:code,_=m['vyborka']('fixture','coder-gateway-fixture.service',katalog=target,journalctl=str(fake),gruppa=None)
    except Exception as e:self.fail('invalid journal escaped '+type(e).__name__)
   self.assertEqual(code,2);self.assertFalse((target/'fixture.jsonl').exists())
 def test_17_lock_error_is_refusal_not_traceback(self):
  m=self.module('sbin/pereklyuchatel-codex',{'PK_STEND':'1','PK_SVESTI':'/bin/false','PK_ALERT':'/bin/false','PK_DOMA':'','PK_KATALOG':str(self.d/'sub-{n}'),'PK_ZAMOK':str(self.d)})
  with patch.object(sys,'argv',['candidate','3']):
   try:m['glavnaya']()
   except SystemExit as e:self.assertEqual(e.code,2)
   except OSError as e:self.fail('lock error escaped '+type(e).__name__)
   else:self.fail('bad lock allowed')
 def test_17_tokens_list_is_refusal_not_traceback(self):
  for tokens in ([],None,'wrong'):
   sub=self.d/'sub-3';sub.mkdir(exist_ok=True);(sub/'auth.json').write_text(json.dumps({'tokens':tokens}))
   m=self.module('sbin/pereklyuchatel-codex',{'PK_STEND':'1','PK_SVESTI':'/bin/false','PK_ALERT':'/bin/false','PK_DOMA':'','PK_KATALOG':str(self.d/'sub-{n}'),'PK_ZAMOK':str(self.d/'lock')})
   with patch.object(sys,'argv',['candidate','3']):
    try:m['glavnaya']()
    except SystemExit as e:self.assertEqual(e.code,2)
    except TypeError:self.fail('tokens type escaped')
    else:self.fail('invalid tokens allowed')
 def test_19_unreadable_login_directory_is_unknown_not_missing(self):
  source=ROOT.parent/'dsh-limity';copy=self.d/'limity';shutil.copytree(source,copy);self.d.chmod(0o755)
  for p in copy.rglob('*'):
   if p.is_dir():p.chmod(0o755)
  copy.chmod(0o755);blocked=self.d/'blocked';blocked.mkdir(mode=0o700)
  launcher=self.d/'login-probe.py';launcher.write_text("import runpy,sys,json;m=runpy.run_path(sys.argv[1]);print(json.dumps(m['vhod_v_kataloge'](sys.argv[2])))\n")
  r=subprocess.run(['sudo','-n','setpriv','--reuid=65534','--regid=65534','--clear-groups',sys.executable,str(launcher),str(copy/'sbin/dsh-limity-podpiski'),str(blocked)],capture_output=True,text=True,timeout=5)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr);self.assertIsNone(json.loads(r.stdout)[0]);self.assertNotIn('Traceback',r.stderr)
 def test_02_partial_token_transfer_records_refusal(self):
  launcher=self.d/'transfer.py';launcher.write_text("""from pathlib import Path
import json,base64,time,runpy,sys,os
r=Path(sys.argv[2]);r.mkdir();kat=r/'subscription';(kat/'polnyj').mkdir(parents=True);home=r/'home';home.mkdir()
def pair(n):
 payload=base64.urlsafe_b64encode(json.dumps({'exp':int(time.time())+(100+n)*86400}).encode()).decode().rstrip('=')
 return {'tokens':{'account_id':'TEST_ONLY_ACCOUNT','access_token':'TEST_ONLY.'+payload+'.fixture','refresh_token':'TEST_ONLY_REFRESH_'+str(n)},'last_refresh':'2030-01-0'+str(n)}
old,new=pair(1),pair(2)
for path,data in [(kat/'polnyj/auth.json',old),(kat/'auth.json',old),(home/'auth.json',new)]:path.write_text(json.dumps(data));path.chmod(0o600)
fake=r/'getfacl';fake.write_text('#!/bin/sh\\nexit 1\\n');fake.chmod(0o755)
alert=r/'alert';alert.write_text('#!/bin/sh\\necho called >> "'+str(r/'calls')+'"\\nexit 0\\n');alert.chmod(0o755)
os.environ['PATH']=str(r)+':/usr/bin:/bin'
fields={'POLNYJ':str(kat/'polnyj/auth.json'),'PROIZV':str(kat/'auth.json'),'DOM':str(home),'ZAMOK':str(r/'lock'),'SLED':str(r/'trace')}
os.environ.update({'CODEX_OBN_'+k:v for k,v in fields.items()})
m=runpy.run_path(sys.argv[1]);f=m['glavnaya'];f.__globals__.update(fields,BIN='/bin/true',ALERT=str(alert));sys.argv=['candidate']
try:f()
except SystemExit as e:
 print('PROBE_CODE',e.code);print('PROBE_FULL_NEW',json.loads((kat/'polnyj/auth.json').read_text())==new)
 print('PROBE_TRACE',json.loads((r/'trace').read_text()).get('itog') if (r/'trace').exists() else None)
else:raise AssertionError('missing outcome')
""")
  target=self.d/'root-fixture';self.d.chmod(0o755)
  try:
   p=subprocess.run(['sudo','-n',sys.executable,str(launcher),str(ROOT/'sbin/codex-obnovitel'),str(target)],capture_output=True,text=True,timeout=5)
   self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertIn('PROBE_CODE 2',p.stdout);self.assertIn('PROBE_FULL_NEW True',p.stdout);self.assertIn('PROBE_TRACE otkaz',p.stdout);self.assertIn('полный',p.stdout.lower());self.assertNotIn('Traceback',p.stderr)
  finally:subprocess.run(['sudo','-n','rm','-rf','--',str(target)],check=True)
 def test_02_all_transfer_modes_and_failed_alarm_are_named(self):
  m=self.module('sbin/codex-obnovitel');f=m['perenesti'];g=f.__globals__;full=self.d/'full';full.write_text('{"fixture":1}');alert=self.exe('alarm','#!/bin/sh\nexit "${FAKE_ALARM_CODE:-0}"\n')
  g.update(POLNYJ=str(full),SLED=str(self.d/'trace'),ALERT=str(alert));hit=[]
  def denied(d):hit.append('write');raise OSError('private transfer failure')
  g.update(zapisat_polnyj=denied,zapisat_proizvodnyj=denied,zapisat_rabochij=denied)
  for mode in ({},{'polnyj':True},{'rabochij':True}):
   for alarm_code,expected in [('0',2),('1',5)]:
    hit.clear()
    with patch.dict(os.environ,{'FAKE_ALARM_CODE':alarm_code}):
     try:f({'fixture':1},**mode)
     except SystemExit as e:self.assertEqual(e.code,expected)
     else:self.fail('missing refusal')
    self.assertEqual(hit,['write']);self.assertEqual(json.loads((self.d/'trace').read_text())['itog'],'otkaz');self.assertEqual(full.read_text(),'{"fixture":1}')
if __name__=='__main__':unittest.main(verbosity=2)
