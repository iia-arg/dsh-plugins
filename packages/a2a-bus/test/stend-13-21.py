#!/usr/bin/env python3
"""Run: python3 -B test/stend-13-21.py; source is the containing package.
Needs python3-yaml and packaged generator/templates. Private files only.
M08_PACKAGE optionally selects an explicit source copy; missing prerequisites exit 2.
"""
import os,sys,tempfile,pathlib,copy,json,importlib.util,importlib.machinery,unittest,subprocess
sys.dont_write_bytecode=True
PACKAGE=pathlib.Path(os.environ.get('M08_PACKAGE', pathlib.Path(__file__).resolve().parents[1])).resolve()
# B-N-2071: agent-registry и шаблоны раскладки — в соседнем пакете dsh-reestr (реестр агентов отделён от почты).
REESTR_PKG=pathlib.Path(os.environ.get('M08_REESTR_PACKAGE', PACKAGE.parent/'dsh-reestr')).resolve()
def blind(reason):
 print('СЛЕПОТА: '+reason,file=sys.stderr);raise SystemExit(2)
if importlib.util.find_spec('yaml') is None:blind('нужен python3-yaml')
for source in [REESTR_PKG/'bin/agent-registry', PACKAGE/'sbin/a2a-pochtalon.py', *[REESTR_PKG/'share/agent-registry/shablony-raskladki'/family/'A.tmpl' for family in ['codex','sdk-claude']]]:
 if not source.is_file() or not os.access(source,os.R_OK):blind('источник не читается: '+str(source))
def load(path,name):
 loader=importlib.machinery.SourceFileLoader(name,str(path));spec=importlib.util.spec_from_loader(name,loader);module=importlib.util.module_from_spec(spec);loader.exec_module(module);return module
R=load(REESTR_PKG/'bin/agent-registry','registry1321')
class Contract(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='m08-generator-');self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name);self.home=self.root/'agent';(self.home/'.dsh').mkdir(parents=True);(self.home/'.dsh/lichnost.md').write_text('Fixture persona')
  self.agent={'imya':'agent','namerenie':{'dom':str(self.home),'polzovatel':'agent','sluzhba':'agent.service','model':'fixture-model','imya_vidimoe':'Fixture','kompakt_agent':'agent','podpiska':'obshchaya-claude','raskladka':{'semejstvo':'codex','port_shlyuza':12345,'klyuch':{'fajl':'/fixture/key-reference'}}}}
  self.ob={'dsh_pokolenie':'0.2','vladelec_telegram':987654321,'postanovshchiki_celey':['coord/session','second/session'],'osnova':{'sdk-claude':{'dolya':.8},'codex':{'predel_servera':1000,'prirost_max':100,'dolya_platformy':.65,'katalog_dolya':.8}}}
 def params(self,family='codex'):
  self.agent['namerenie']['raskladka']['semejstvo']=family;return R._f_parametry(self.agent,self.ob,'Fixture persona')
 def test_13_parameters_from_explicit_common_registry_both_families(self):
  for family in ['codex','sdk-claude']:
   with self.subTest(family=family):
    sem,p=self.params(family);self.assertEqual(sem,family,p);self.assertEqual(p.get('VLADELEC_TELEGRAM'),987654321);self.assertEqual(p.get('GOAL_A2A_SENDERS'),'["coord/session", "second/session"]')
 def test_13_bad_owner_never_uses_old_default(self):
  for value in [None,'',0,-1,'158901453',1.5,True,False]:
   with self.subTest(value=value):
    self.ob['vladelec_telegram']=value;sem,reason=self.params();self.assertIsNone(sem);self.assertIn('vladelec_telegram',reason)
  del self.ob['vladelec_telegram'];sem,reason=self.params();self.assertIsNone(sem);self.assertIn('vladelec_telegram',reason)
 def test_13_goal_list_required_and_typed(self):
  for value in [None,'coord/session',[0],[''],['   '],[False]]:
   with self.subTest(value=value):
    self.ob['postanovshchiki_celey']=value;sem,reason=self.params();self.assertIsNone(sem);self.assertIn('postanovshchiki_celey',reason)
  del self.ob['postanovshchiki_celey'];sem,reason=self.params();self.assertIsNone(sem);self.assertIn('postanovshchiki_celey',reason)
 def test_13_empty_list_is_explicit_deny_not_inherited_default(self):
  self.ob['postanovshchiki_celey']=[];sem,p=self.params();self.assertEqual(sem,'codex',p);self.assertEqual(p.get('GOAL_A2A_SENDERS'),'[]')
 def test_13_agent_override_common_acl_is_refused(self):
  for family in ['codex','sdk-claude']:
   for key,value in [('VLADELEC_TELEGRAM','158901453'),('GOAL_A2A_SENDERS','["wrong/session"]')]:
    with self.subTest(family=family,key=key):
     self.agent['namerenie']['raskladka']['otlichiya']={'prichina':'fixture reason','parametry':{key:value}};sem,reason=self.params(family);self.assertIsNone(sem);self.assertIn(key,reason)
 def test_13_real_renderer_on_proposed_templates_roundtrips_acl(self):
  # Read the packaged templates unchanged; no source-string substitutions.
  for family in ['codex','sdk-claude']:
   self.agent['namerenie']['raskladka']['semejstvo']=family;sem,p=self.params(family);self.assertEqual(sem,family,p)
   template=(REESTR_PKG/'share/agent-registry/shablony-raskladki'/family/'A.tmpl').read_text();self.assertIn('@@VLADELEC_TELEGRAM@@',template);self.assertIn('@@GOAL_A2A_SENDERS@@',template)
   p.update(SISTEMNYE_KORNI='["machine-fixture", "agent"]',GOSTEVYE_KORNI='[]',PRESET_B='thresholdRatio: 0.5\nretainRatio: 0.1',KATALOG_NAVYKOV='/fixture/skills')
   rendered,reason=R._f_otrisovat(template,p);self.assertIsNone(reason);d=R._yaml_terpimyj(rendered);found=[]
   def walk(v):
    if isinstance(v,dict):
     if 'goalA2ASenders' in v:found.append(v)
     for x in v.values():walk(x)
    elif isinstance(v,list):
     for x in v:walk(x)
   walk(d);self.assertTrue(found)
   for cfg in found:self.assertEqual(cfg['mergeChatIntoA2A'],987654321);self.assertEqual(cfg['allowedUsers'][0],987654321);self.assertEqual(cfg['goalUsers'],[987654321]);self.assertEqual(cfg['goalA2ASenders'],['coord/session','second/session'])
 def test_13_json_acl_preserves_unicode_nel_exactly(self):
  names=['coord\u0085session','код/сессия'];self.ob['postanovshchiki_celey']=names;sem,p=self.params();self.assertEqual(sem,'codex',p);rendered,err=R._f_otrisovat('goalA2ASenders: @@GOAL_A2A_SENDERS@@',p);self.assertIsNone(err);self.assertEqual(R._yaml_terpimyj(rendered)['goalA2ASenders'],names)
 def test_13_json_acl_preserves_astral_and_c1_exactly(self):
  names=['coord/😀','coord\u0080session','coord\u009fsession'];self.ob['postanovshchiki_celey']=names;sem,p=self.params();self.assertEqual(sem,'codex',p);rendered,err=R._f_otrisovat('goalA2ASenders: @@GOAL_A2A_SENDERS@@',p);self.assertIsNone(err);self.assertEqual(R._yaml_terpimyj(rendered)['goalA2ASenders'],names)
 def assembled_roots(self,machine):
  templates=self.root/'templates/codex';templates.mkdir(parents=True,exist_ok=True);(templates/'A.tmpl').write_text('roots: @@SISTEMNYE_KORNI@@\nthresholdRatio: 0.5\nretainRatio: 0.1\n');(templates/'B.tmpl').write_text('prefix: fixture\n');(templates/'C.tmpl').write_text('CODEX_HOME=@@DOM@@/codex-home\n');(templates/'M.tmpl').write_text('model_auto_compact_token_limit = @@AUTO@@\n')
  ob=copy.deepcopy(self.ob);ob['shablony']=str(templates.parent);d={'mashina':{'imya':machine,'raskladka_obshchee':ob},'agenty':[self.agent]};return R.sobrat_ab(d,self.agent)
 def test_21_shared_root_comes_from_machine_registry(self):
  rows=self.assembled_roots('other-machine');a=next(row for row in rows if row[0]=='сборка-A');self.assertIsNone(a[3],a[3]);d=R._yaml_terpimyj(a[2]);self.assertEqual(d['roots'],['agent','other-machine'])
 def test_21_machine_root_missing_is_refusal_not_sadik(self):
  rows=self.assembled_roots('');self.assertTrue(rows);self.assertTrue(all(row[2] is None for row in rows));self.assertTrue(all('mashina.imya' in row[3] for row in rows))
 def test_21_machine_root_preserves_unicode_nel_exactly(self):
  rows=self.assembled_roots('other\u0085machine');a=next(row for row in rows if row[0]=='сборка-A');self.assertIsNone(a[3],a[3]);self.assertEqual(R._yaml_terpimyj(a[2])['roots'],['agent','other\u0085machine'])
 def test_21_machine_root_preserves_astral_and_c1_exactly(self):
  for name in ['machine/😀','machine\u0080node']:
   with self.subTest(name=name):
    rows=self.assembled_roots(name);a=next(row for row in rows if row[0]=='сборка-A');self.assertIsNone(a[3],a[3]);self.assertEqual(R._yaml_terpimyj(a[2])['roots'],['agent',name])
 def test_21_alert_tool_identifies_itself_without_fixed_machine(self):
  m=load(PACKAGE/'sbin/a2a-pochtalon.py','postman21');box=self.root/'box';box.mkdir();file=box/'not-a-letter';file.write_text('PRIVATE_BODY');m.TELL='/fixture/tell';m.TREVOGA='/fixture/alert';calls=[]
  def transport(args,**kw):calls.append((args,kw));return subprocess.CompletedProcess(args,0,'','')
  old=m.subprocess.run;m.subprocess.run=transport;fd=os.open(box,os.O_RDONLY|os.O_DIRECTORY)
  try:m.otlozhit_ne_pismo(fd,file.name,file.stat(),os.getuid(),'box/not-a-letter','fixture invalid letter')
  finally:os.close(fd);m.subprocess.run=old
  alert=[kw['input'] for args,kw in calls if args[0]=='/fixture/alert'];self.assertEqual(len(alert),1);self.assertTrue(alert[0].startswith('a2a-pochtalon: '));self.assertNotIn('sadik',alert[0]);self.assertNotIn('PRIVATE_BODY',alert[0]);self.assertEqual(len(list(box.glob('.ne-pismo-*'))),1)
if __name__=='__main__':unittest.main(verbosity=2)
