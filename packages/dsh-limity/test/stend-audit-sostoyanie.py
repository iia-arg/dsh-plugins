#!/usr/bin/env python3
"""Actual main functions, private ledgers/SQLite/spool; no provider or live switch."""
import contextlib, io, json, os, runpy, sqlite3, sys, tempfile, time, unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(os.environ.get('LIMITY_TEST_ROOT', Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(ROOT / 'lib'))
import dsh_limity_konfig as konfig

class State(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='m11-state-');self.d=Path(self.tmp.name);self.calls=[];self.alerts=[]
  self.db=self.d/'limity.db'
  with sqlite3.connect(self.db) as db:
   db.execute('CREATE TABLE zamer(provajder TEXT,podpiska INTEGER,moment_utc REAL)')
   db.execute('CREATE TABLE usage_snimok(provajder TEXT,podpiska INTEGER,moment_utc REAL,dannye TEXT)')
  (self.d/'vhod').mkdir()
  self.p=dict(provajder='deepseek',nomer=1,kluch='fixture-ds',podpis='Fixture',vkl=True,klyuch_fajl='/fake/key')
 def tearDown(self):self.tmp.cleanup()
 def load(self,kind):
  path=ROOT/'libexec'/('dsh-limity-'+kind)
  with patch.object(sys,'argv',[str(path)]):m=runpy.run_path(str(path))
  f=m['main'];g=f.__globals__
  g.update(SOST=self.d/(kind+'.json'),PODPISKI=self.d/'config',BAZA=self.db,VHOD=str(self.d/'vhod') if kind=='zamer' else self.d/'vhod',VYDACHA=self.d/'vyd.json')
  g['E']=lambda k,default=None: 'false' if k=='ENABLE_CLAUDEAI_MCP_SERVERS' else default
  g['trevoga']=lambda text,*a,**kw:self.alerts.append(text) or True
  if kind=='zamer':g.update(porogi_prohod=lambda *a:False,sverka_tokenov=lambda *a:[])
  if kind=='avtoperekl':g['kto_gde']=lambda:{}
  if kind=='deepseek':g['balans']=lambda k:self.calls.append(k) or (200,{'is_available':True,'balance_infos':[]},0,None)
  (self.d/'vyd.json').write_text('{"podpiski":{}}')
  return f,g
 def invoke(self,f):
  out=io.StringIO()
  with patch.object(konfig,'prochitat_rabochij',return_value=([self.p],[],False)),contextlib.redirect_stdout(out):
   try:rc=f()
   except Exception as e:self.fail('state error escaped '+type(e).__name__+': '+str(e))
  return rc,out.getvalue()
 def test_05_corrupt_ledgers_signal_without_reset_or_request(self):
  for kind in ('zamer','avtoperekl','deepseek'):
   with self.subTest(kind=kind):
    f,g=self.load(kind);self.assertEqual(self.invoke(f)[0],0);good=g['SOST'].read_bytes()
    for bad in ('{','[]','null','{"fixture-ds":{}}' if kind=='deepseek' else '{"popytka":[]}' if kind=='avtoperekl' else '{"1":{"popytki":"wrong"}}'):
     g['SOST'].write_text(bad);before=g['SOST'].read_bytes();self.alerts.clear();self.calls.clear()
     rc,out=self.invoke(f);self.assertEqual(rc,2,out);self.assertIn('состояние',out.lower());self.assertEqual(g['SOST'].read_bytes(),before);self.assertEqual(self.calls,[])
     if kind=='deepseek':
      snapshots=[json.loads(p.read_text()) for p in (self.d/'vhod').glob('*.json')];self.assertTrue(any(x.get('oshibka') and x.get('dannye') is None for x in snapshots))
     else:self.assertTrue(self.alerts,'invalid ledger must signal')
    g['SOST'].write_bytes(good);self.assertEqual(self.invoke(f)[0],0)
 def test_05_failed_replace_preserves_good_ledger(self):
  for kind in ('zamer','avtoperekl','deepseek'):
   with self.subTest(kind=kind):
    f,g=self.load(kind);self.assertEqual(self.invoke(f)[0],0);path=g['SOST'];good=path.read_bytes();faults=[]
    # DS must attempt another write, not skip due to the healthy recorded request.
    if kind=='deepseek':path.write_text('{}');good=path.read_bytes()
    real_replace=os.replace;real_write=Path.write_text
    def replace(src,dst):
     if Path(dst)==path:faults.append('replace');raise OSError('private injected replace failure')
     return real_replace(src,dst)
    def write(p,data,*a,**kw):
     if p==path:faults.append('truncate');real_write(p,data[:1],*a,**kw);raise OSError('private partial write')
     return real_write(p,data,*a,**kw)
    self.calls.clear()
    with patch.object(os,'replace',replace),patch.object(Path,'write_text',write):rc,out=self.invoke(f)
    self.assertEqual(rc,2,out);self.assertTrue(faults);self.assertEqual(path.read_bytes(),good);self.assertEqual(self.calls,[])
    self.assertFalse(list(path.parent.glob('.'+path.name+'.*')),'temporary state must be removed')
    self.assertEqual(self.invoke(f)[0],0)
 def test_05_nested_bad_types_are_refused_before_alarm_processing(self):
  f,g=self.load('zamer');g['svezhij_zamer']=lambda *a:time.time();g['E']=lambda k,default=None:'false' if k=='ENABLE_CLAUDEAI_MCP_SERVERS' else default
  self.p=dict(provajder='claude',sposob='claude_usage',nomer=1,kluch='fixture',podpis='Fixture',vkl=True,zamer='fake',zamer_katalog='/fake',organizaciya='TEST_ONLY')
  base={'popytki':[],'ishod':None,'skazano':None}
  for key,value in [('refresh_do','wrong'),('kredity',[1]),('kredity',{'dolya':'wrong'}),('weekly_all',[1]),('okna_skazano',[]),('okna_skazano',{'pyat_chasov':{'uroven':'wrong','sbros':0}}),('okna_skazano',{'pyat_chasov':{'uroven':1}})]:
   with self.subTest(key=key,value=value):
    g['SOST'].write_text(json.dumps({'1':{**base,key:value}}));before=g['SOST'].read_bytes();self.alerts.clear();rc,out=self.invoke(f)
    self.assertEqual(rc,2,out);self.assertEqual(g['SOST'].read_bytes(),before);self.assertTrue(self.alerts)
 def test_05_cleanup_failure_is_still_named_state_error(self):
  if not hasattr(konfig,'zapisat_json'):self.fail('no atomic state writer')
  p=self.d/'ledger.json';p.write_text('{}');fault=[];real_unlink=os.unlink
  def denied(path,*a,**kw):
   if Path(path).name.startswith('.ledger.json.'):
    fault.append(path);raise PermissionError('private cleanup failure')
   return real_unlink(path,*a,**kw)
  with patch.object(os,'replace',side_effect=OSError('private replace failure')),patch.object(os,'unlink',denied):
   try:konfig.zapisat_json(p,{'next':1})
   except konfig.SostoyanieError as e:self.assertIn('состояние',str(e))
   except OSError as e:self.fail('cleanup error escaped '+type(e).__name__)
   else:self.fail('fault was ignored')
  self.assertTrue(fault);self.assertEqual(p.read_text(),'{}')
  for path in fault:Path(path).unlink(missing_ok=True)
 def test_05_partial_temporary_write_keeps_old_file_and_mode(self):
  if not hasattr(konfig,'zapisat_json'):self.fail('no atomic state writer')
  p=self.d/'ledger.json';p.write_text('{"previous":1}');p.chmod(0o640);before=p.read_bytes();fault=[]
  def partial(data,f,**kwargs):
   destination=Path(os.readlink('/proc/self/fd/'+str(f.fileno())));self.assertEqual(destination.parent,p.parent);fault.append(destination);f.write('{');raise OSError('private partial temporary write')
  with patch.object(json,'dump',partial),self.assertRaises(konfig.SostoyanieError):konfig.zapisat_json(p,{'next':2})
  self.assertTrue(fault);self.assertEqual(p.read_bytes(),before);self.assertFalse(any(x.exists() for x in fault))
  konfig.zapisat_json(p,{'next':2});self.assertEqual(json.loads(p.read_text()),{'next':2});self.assertEqual(p.stat().st_mode&0o777,0o640)
 def test_08_write_only_intake_dir_is_not_a_failure(self):
  # 3.1.4: приёмная -wx без чтения (как /var/spool/dsh-limity/vhod для limity-ds): запись лежит, отказа нет, строка в stderr
  if os.geteuid()==0:self.skipTest('root обходит права каталога — проба только под учёткой')
  vhod=self.d/'wo';vhod.mkdir();p=vhod/'ds-1-fixture.json';vhod.chmod(0o300);err=io.StringIO()
  try:
   with contextlib.redirect_stderr(err):konfig.zapisat_json(p,{'vid':'deepseek_balans'})
   self.assertEqual(json.loads(p.read_text()),{'vid':'deepseek_balans'});self.assertIn('fsync каталога',err.getvalue())
  finally:vhod.chmod(0o700)
 def test_08_denied_directory_open_is_named_not_raised(self):
  # то же под любой учёткой: отказ открытия каталога (EACCES) — подменой os.open только для O_DIRECTORY
  import errno
  p=self.d/'vhod'/'ds-1-patched.json';real_open=os.open;err=io.StringIO()
  def denied(path,flags,*a,**kw):
   if flags&os.O_DIRECTORY:raise PermissionError(errno.EACCES,'fixture: no read on intake')
   return real_open(path,flags,*a,**kw)
  with patch.object(os,'open',denied),contextlib.redirect_stderr(err):konfig.zapisat_json(p,{'n':1})
  self.assertEqual(json.loads(p.read_text()),{'n':1});self.assertIn('пропущен',err.getvalue())
 def test_08_other_directory_fsync_errors_still_fail(self):
  # прочие ошибки fsync каталога — по-прежнему отказ SostoyanieError
  import errno
  p=self.d/'vhod'/'ds-1-eio.json';real_fsync=os.fsync;seen=[]
  def eio(fd):
   if os.path.isdir('/proc/self/fd/'+str(fd)):seen.append(fd);raise OSError(errno.EIO,'fixture dir fsync EIO')
   return real_fsync(fd)
  with patch.object(os,'fsync',eio),self.assertRaises(konfig.SostoyanieError):konfig.zapisat_json(p,{'n':2})
  self.assertTrue(seen)
 def test_07_sample_has_no_private_emails_or_organization_ids(self):
  import re
  data=json.loads((ROOT/'etc/podpiski.json').read_text())
  for record in data:
   if record.get('email'):self.assertTrue(record['email'].endswith('@example.invalid'),'private email in sample')
   if record.get('organizaciya'):self.assertTrue(re.fullmatch(r'00000000-0000-4000-8000-0000000000[0-9]{2}',record['organizaciya']),'private organization in sample')
 def test_05_error_snapshot_has_existing_alarm_reader_and_recovery(self):
  f,g=self.load('deepseek');zf,zg=self.load('zamer');state={};svod=[]
  with sqlite3.connect(self.db) as db:
   def ingest():
    p=max((self.d/'vhod').glob('*.json'),key=lambda p:p.stat().st_mtime_ns);x=json.loads(p.read_text());db.execute('INSERT INTO usage_snimok VALUES(?,?,?,?)',('deepseek',1,x['moment_utc'],json.dumps(x)));db.commit()
   g['SOST'].write_text('{');self.assertEqual(self.invoke(f)[0],2);ingest()
   zg['deepseek_trevogi'](db,[self.p],state,svod);self.assertEqual(len(self.alerts),1);self.assertIn('НЕ ИЗМЕРЕН',self.alerts[-1])
   zg['deepseek_trevogi'](db,[self.p],state,svod);self.assertEqual(len(self.alerts),1)
   g['SOST'].write_text('{}');self.assertEqual(self.invoke(f)[0],0);ingest()
   zg['deepseek_trevogi'](db,[self.p],state,svod);self.assertEqual(len(self.alerts),2);self.assertIn('снова измеряется',self.alerts[-1])
 def test_15_bearer_destination_requires_test_key(self):
  path=ROOT/'libexec/dsh-limity-deepseek';cred=self.d/'cred';cred.mkdir();(cred/'dsh-limity-fixture').write_text('TEST_ONLY_KEY')
  import urllib.request
  routes=[]
  class Reply:
   status=200
   def __enter__(self):return self
   def __exit__(self,*a):pass
   def read(self,n):return b'{"balance_infos":[]}'
  def capture(req,timeout):routes.append(req.host);self.assertTrue(req.has_header('Authorization'));return Reply()
  for key,host in [('', 'api.deepseek.com'),('1','fixture.invalid')]:
   with patch.dict(os.environ,{'DSH_LIMITY_DEEPSEEK_STEND':key,'DSH_LIMITY_DEEPSEEK_URL':'https://fixture.invalid','CREDENTIALS_DIRECTORY':str(cred)}),patch.object(sys,'argv',[str(path)]):
    m=runpy.run_path(str(path))
    with patch.object(urllib.request,'urlopen',capture):self.assertEqual(m['balans']('fixture')[0],200)
   self.assertEqual(routes[-1],host)
  with patch.dict(os.environ,{'DSH_LIMITY_DEEPSEEK_STEND':'oops'}),patch.object(sys,'argv',[str(path)]),self.assertRaises(SystemExit) as ex:runpy.run_path(str(path))
  self.assertEqual(ex.exception.code,3)
 def test_18_failed_gateway_is_skipped_but_live_unknown_is_refused(self):
  import subprocess
  f,g=self.load('avtoperekl');g.update(SYSTEMCTL='fake-systemctl',REESTR='fake-registry',PROC=str(self.d/'proc'));pid=['100'];env=self.d/'proc/100';env.mkdir(parents=True);(env/'environ').write_bytes(b'GATEWAY_TOKEN_FILE=/fake/token-podpiska-2\0')
  def command(argv,**kw):
   if argv[0]=='fake-registry':out='"obshchaya-claude"'
   elif argv[1]=='list-units':out='claude-oauth-gateway@fixture.service loaded failed failed fixture'
   else:out=pid[0]
   return subprocess.CompletedProcess(argv,0,out,'')
  # load() stubs kto_gde for main tests; obtain the actual function explicitly.
  path=ROOT/'libexec/dsh-limity-avtoperekl'
  with patch.object(sys,'argv',[str(path)]):m=runpy.run_path(str(path))
  actual=m['kto_gde'];actual.__globals__.update(SYSTEMCTL=g['SYSTEMCTL'],REESTR=g['REESTR'],PROC=g['PROC'])
  with patch.object(subprocess,'run',command):
   self.assertEqual(actual(),{'fixture':2});pid[0]='0';out=io.StringIO()
   with contextlib.redirect_stdout(out):self.assertEqual(actual(),{})
   self.assertIn('fixture',out.getvalue());self.assertIn('MainPID=0',out.getvalue());pid[0]='100';self.assertEqual(actual(),{'fixture':2})
   (env/'environ').write_bytes(b'GATEWAY_TOKEN_FILE=/unknown\0')
   with self.assertRaises(ValueError):actual()
   pid[0]='broken'
   with self.assertRaises(ValueError):actual()
if __name__=='__main__':unittest.main(verbosity=2)
