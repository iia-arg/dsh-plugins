#!/usr/bin/env python3
"""Real callers and npm; parser faults only at the helper boundary, never an npm PATH shim."""
from pathlib import Path
import hashlib,importlib.machinery,importlib.util,json,os,re,subprocess,tempfile,unittest
from unittest import mock
PKG=Path(__file__).resolve().parents[1]
import sys;sys.dont_write_bytecode=True  # ИП 3.1.111 (18.10, Искра): SourceFileLoader ниже иначе пишет sbin/__pycache__/montazh-oknocpython-312.pyc в дерево пакета

class NpmCallers(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='npm-callers-');self.root=Path(self.tmp.name);self.pkg=self.root/'pkg';(self.pkg/'src').mkdir(parents=True);self.bin=self.root/'bin';self.bin.mkdir()
  (self.pkg/'package.json').write_text(json.dumps(dict(name='fixture-npm-shape',version='1.0.0',files=['src'],scripts={'prepack':'touch NEVER_RUN'}))+'\n')
  for name,text in [('a.js','one\n'),('space x.js','two\n'),('я.js','три\n')]: (self.pkg/'src'/name).write_text(text)
  (self.pkg/'outside.txt').write_text('not published')
  self.paths=['package.json','src/a.js','src/space x.js','src/я.js'];self.env={**os.environ,'npm_config_cache':str(self.root/'cache')}
  loader=importlib.machinery.SourceFileLoader('actual_caller',str(PKG/'sbin/montazh-okno'));spec=importlib.util.spec_from_loader(loader.name,loader);self.m=importlib.util.module_from_spec(spec);loader.exec_module(self.m)
 def tearDown(self):self.tmp.cleanup()
 def helper_fault(self,body):
  f=self.bin/'npm-sostav';before=Path('/usr/local/bin/npm-sostav').read_bytes();f.write_bytes(before);old=hashlib.sha256(f.read_bytes()).hexdigest();f.write_text('#!/bin/sh\ncat >/dev/null\n'+body+'\n');f.chmod(0o755)
  literal=body.splitlines()[0];count=subprocess.check_output(['grep','-cF',literal,str(f)],text=True).strip();self.assertEqual(count,'1');new=hashlib.sha256(f.read_bytes()).hexdigest();self.assertNotEqual(old,new)
  print('CORRUPTION helper replacements=1 literal_count='+count+' SHA256='+old+'->'+new,flush=True);self.env['PATH']=str(self.bin)+':'+os.environ['PATH']
  self.assertEqual(subprocess.check_output(['npm','--version'],env=self.env,text=True).strip(),subprocess.check_output(['npm','--version'],text=True).strip())
 def summa(self):return subprocess.run(['bash',str(PKG/'bin/summa-predmeta-rezhim'),'--po-publikacii',str(self.pkg)],env=self.env,capture_output=True,text=True,timeout=20)
 def expected(self):
  rows=''.join(name+' '+hashlib.sha256((self.pkg/name).read_bytes()).hexdigest()+'\n' for name in sorted(self.paths,key=os.fsencode));return hashlib.sha256(rows.encode()).hexdigest()[:16]
 def assert_good_sum(self):
  q=self.summa();self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertRegex(q.stdout,self.expected()+r'  файлов 4  \[режим po-publikacii\]');self.assertFalse((self.pkg/'NEVER_RUN').exists());return q.stdout
 def test_sum_matches_independent_publication_bytes(self):self.assert_good_sum()
 def test_publication_matches_independent_names_and_hashes(self):
  with mock.patch.dict(os.environ,self.env):
   try:rows=self.m.publication_from_source(self.pkg)
   except Exception as e:self.fail('actual publication refused: '+str(e))
  self.assertEqual([r['path'] for r in rows],sorted(self.paths));self.assertEqual({r['path']:r['sha256'] for r in rows},{n:hashlib.sha256((self.pkg/n).read_bytes()).hexdigest() for n in self.paths});self.assertFalse((self.pkg/'NEVER_RUN').exists())
 def test_sum_refuses_partial_helper_failure_then_returns_green(self):
  self.assert_good_sum();self.helper_fault('printf "package.json\\n"; echo "forced parser error: object keys=error" >&2; exit 2');q=self.summa();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.assertIn('forced parser error',q.stderr);self.env['PATH']=os.environ['PATH'];self.assert_good_sum()
 def test_sum_refuses_empty_helper_success_then_returns_green(self):
  self.assert_good_sum();self.helper_fault('exit 0');q=self.summa();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.env['PATH']=os.environ['PATH'];self.assert_good_sum()
 def test_sum_refuses_helper_missing_file_then_returns_green(self):
  self.assert_good_sum();self.helper_fault('printf "missing-file\\n"');q=self.summa();self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.env['PATH']=os.environ['PATH'];self.assert_good_sum()
 def test_filename_parent_traversal_refuses_then_returns_green(self):
  self.helper_fault('printf "../x.tgz\\n"')
  with mock.patch.dict(os.environ,self.env):
   with self.assertRaisesRegex(ValueError,'publication archive name invalid'):self.m.publication_from_source(self.pkg)
  self.env['PATH']=os.environ['PATH']
  with mock.patch.dict(os.environ,self.env):self.assertEqual(len(self.m.publication_from_source(self.pkg)),4)
 def test_filename_helper_reason_is_preserved_then_returns_green(self):
  self.helper_fault('echo "не один состав: object keys=error" >&2; exit 2')
  with mock.patch.dict(os.environ,self.env):
   with self.assertRaisesRegex(ValueError,'не один состав: object keys=error'):self.m.publication_from_source(self.pkg)
  self.env['PATH']=os.environ['PATH']
  with mock.patch.dict(os.environ,self.env):self.assertEqual(len(self.m.publication_from_source(self.pkg)),4)
 def test_control_refuses_helper_failure(self):
  self.helper_fault('echo "forced parser refusal" >&2; exit 2');scratch=self.root/'scratch';scratch.mkdir();self.env['TMPDIR']=str(scratch);self.env['NODE_COMPILE_CACHE']=str(self.root/'node-cache')
  q=subprocess.run(['bash',str(PKG/'bin/summa-predmeta-rezhim'),'--kontrol'],env=self.env,capture_output=True,text=True,timeout=20);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.assertIn('forced parser refusal',q.stderr);self.assertEqual(list(scratch.iterdir()),[])
 def test_missing_helper_has_exact_refusal(self):
  # This empty PATH tests only the dependency preflight; npm is never invoked.
  env=dict(self.env,PATH=str(self.bin));message='npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2'
  q=subprocess.run(['/bin/bash',str(PKG/'bin/summa-predmeta-rezhim'),'--po-publikacii',str(self.pkg)],env=env,capture_output=True,text=True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.assertIn(message,q.stderr)
  with mock.patch.dict(os.environ,env):
   with self.assertRaisesRegex(ValueError,message):self.m.publication_from_source(self.pkg)
 def test_common_helper_rejects_empty_error_and_two_documents(self):
  for payload in ['',json.dumps({'error':{'code':'PROBE'}}),'{}\n{}']:
   for flag in ['--files','--filename']:
    with self.subTest(payload=payload,flag=flag):
     q=subprocess.run(['npm-sostav',flag],input=payload,env=self.env,capture_output=True,text=True);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(q.stdout,'');self.assertIn('ОТКАЗ',q.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
