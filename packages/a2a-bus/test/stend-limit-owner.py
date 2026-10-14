#!/usr/bin/env python3
"""Run as root: python3 -B test/stend-limit-owner.py.
Seven R3 checks, no inherited-suite expansion. Imports both packaged stands;
requires their prerequisites and explicit STEND_A2A_V2_SOURCE in deployment.
Private fixtures only; missing prerequisites exit 2 before running methods.
"""
import importlib.util,importlib.machinery,pathlib,sys,os,unittest,argparse
sys.dont_write_bytecode=True
root=pathlib.Path(__file__).resolve().parent
for helper in ['stend-alpha.py','stend-13-21.py']:
 path=root/helper
 if not path.is_file() or not os.access(path,os.R_OK):
  print('СЛЕПОТА: пакетный helper не читается: '+str(path),file=sys.stderr);raise SystemExit(2)
loader=importlib.machinery.SourceFileLoader('alpha_helpers',str(root/'stend-alpha.py'));spec=importlib.util.spec_from_loader(loader.name,loader);helpers=importlib.util.module_from_spec(spec);loader.exec_module(helpers)
loader2=importlib.machinery.SourceFileLoader('contract_helpers',str(root/'stend-13-21.py'));spec2=importlib.util.spec_from_loader(loader2.name,loader2);contract=importlib.util.module_from_spec(spec2);loader2.exec_module(contract)
class Limit(helpers.Audit):
 def test_raised_env_cannot_publish_unreceivable_letter(self):
  self.env['A2A_PREDEL_BAJT']='2097152';result=self.send('x'*1048576)
  # Independently characterize the base failure on its actual published file.
  for file in self.visible():
   m=self.module();self.assertEqual(m.PREDEL_BAJT,1048576);fd=os.open(self.box,os.O_RDONLY|os.O_DIRECTORY)
   try:
    for attempt in range(2):
     moved,why=m.perenesti(fd,file.name,self.uid,file.stat().st_gid,'fixture/'+file.name);print('BASE_TRANSPORT sender='+str(result.returncode)+' wireBytes='+str(file.stat().st_size)+' postman='+str(moved)+' attempt='+str(attempt+1)+' reason='+why,flush=True);self.assertFalse(moved);self.assertIn('крупнее предела',why);self.assertTrue(file.exists())
   finally:os.close(fd)
  self.assertEqual(result.returncode,3,result.stderr);self.assertIn('A2A_PREDEL_BAJT',result.stderr);self.assertEqual(list(self.box.iterdir()),[]);self.assertEqual(self.notices(),[])
 def test_v2_raised_env_cannot_publish_unreceivable_letter(self):
  self.save();helper=self.root/'v2-real-limit-functions.py';publisher=helpers.V2_SOURCE
  self.assertTrue(publisher.is_file(),'real v2 publisher missing from fixture')
  helper.write_text("import os,sys,runpy\nns=runpy.run_path("+repr(str(publisher))+");wire=ns['wire'];put=ns['put']\ndef main():\n body=sys.stdin.read();meta={'recipient':{'id':'target'},'delivery_id':'size-probe'};put({'spool':os.environ['M08_V2_SPOOL']},meta,body)\n")
  self.env.update({'A2A_V2_HELPER':str(helper),'M08_V2_SPOOL':str(self.box),'A2A_PREDEL_BAJT':'1048576'})
  positive=helpers.subprocess.run(['bash',str(helpers.PACKAGE/'bin/a2a-send'),'--v2'],input='hello',text=True,capture_output=True,env=self.env,cwd=self.home/'workspace',timeout=10)
  self.assertEqual(positive.returncode,0,positive.stderr);self.assertEqual(len(self.visible()),1);self.assertEqual(self.visible()[0].stat().st_size,87);self.assertTrue(self.visible()[0].read_bytes().endswith(b'hello'))
  for file in self.box.iterdir():file.unlink()
  self.env['A2A_PREDEL_BAJT']='2097152'
  result=helpers.subprocess.run(['bash',str(helpers.PACKAGE/'bin/a2a-send'),'--v2'],input='x'*1048576,text=True,capture_output=True,env=self.env,cwd=self.home/'workspace',timeout=10)
  for file in self.visible():
   print('BASE_V2 sender='+str(result.returncode)+' wireBytes='+str(file.stat().st_size),flush=True);self.assertGreater(file.stat().st_size,1048576)
  self.assertEqual(result.returncode,3,result.stderr);self.assertIn('A2A_PREDEL_BAJT',result.stderr);self.assertEqual(list(self.box.iterdir()),[])
 def test_above_default_setting_refused_even_for_small_body(self):
  for bound in ['1048577','2097152','999999999999999999999999']:
   with self.subTest(bound=bound):
    before={p.name for p in self.box.iterdir()};notices_before=len(self.notices());self.env['A2A_PREDEL_BAJT']=bound;r=self.send('body');self.assertEqual(r.returncode,3,r.stderr);self.assertEqual({p.name for p in self.box.iterdir()},before);self.assertEqual(len(self.notices()),notices_before)
 def test_exact_default_wire_is_publishable(self):
  self.env['A2A_PREDEL_BAJT']='1048576';r=self.send('x'*1048484);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(self.visible()),1);self.assertEqual(self.visible()[0].stat().st_size,1048576)
 def test_lower_limit_and_one_byte_over_still_work(self):
  self.env['A2A_PREDEL_BAJT']='512';r=self.send('x'*420);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(self.visible()[0].stat().st_size,512);before={p.name for p in self.box.iterdir()};r=self.send('x'*421);self.assertEqual(r.returncode,3,r.stderr);self.assertEqual({p.name for p in self.box.iterdir()},before)
 def test_invalid_limits_refuse_before_placement(self):
  for bound in ['0','-1','text','1.5']:
   with self.subTest(bound=bound):self.env['A2A_PREDEL_BAJT']=bound;r=self.send('body');self.assertEqual(r.returncode,3,r.stderr);self.assertEqual(list(self.box.iterdir()),[])
class Owner(contract.Contract):
 def test_owner_is_integer_parameter_in_both_families(self):
  for family in ['codex','sdk-claude']:
   with self.subTest(family=family):
    sem,p=self.params(family);self.assertEqual(sem,family,p);self.assertIs(type(p['VLADELEC_TELEGRAM']),int);self.assertEqual(p['VLADELEC_TELEGRAM'],987654321);self.assertIs(type(p['GOAL_A2A_SENDERS']),str);rendered,why=contract.R._f_otrisovat('owner: @@VLADELEC_TELEGRAM@@\ngoalA2ASenders: @@GOAL_A2A_SENDERS@@',p);self.assertIsNone(why);parsed=contract.R._yaml_terpimyj(rendered);self.assertIs(type(parsed['owner']),int);self.assertEqual(parsed['owner'],987654321);self.assertEqual(parsed['goalA2ASenders'],['coord/session','second/session'])
names=['Limit.test_v2_raised_env_cannot_publish_unreceivable_letter','Limit.test_raised_env_cannot_publish_unreceivable_letter','Limit.test_above_default_setting_refused_even_for_small_body','Limit.test_exact_default_wire_is_publishable','Limit.test_lower_limit_and_one_byte_over_still_work','Limit.test_invalid_limits_refuse_before_placement','Owner.test_owner_is_integer_parameter_in_both_families']
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('-v','--verbose',action='store_true');parser.parse_args()
 suite=unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromName(n,sys.modules[__name__]) for n in names);result=unittest.TextTestRunner(verbosity=2).run(suite);sys.exit(0 if result.wasSuccessful() else 1)
