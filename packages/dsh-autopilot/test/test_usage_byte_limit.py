"""Accounting readers share one byte limit; postal storage remains independent."""
import ast
import hashlib
import json
import os
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

PACKAGE=Path(__file__).resolve().parents[1]
POSTAL_EXCEPTIONS={'lib/mail_service.py':'ёмкость почты, не бюджет учёта','lib/mail_retention.py':'ёмкость почты, не бюджет учёта'}

def load(path):
 spec=importlib.util.spec_from_file_location('test_limit_'+path.stem,path)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def numeric(node):
 if isinstance(node,ast.Constant) and type(node.value)is int:return node.value
 if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Mult):
  a,b=numeric(node.left),numeric(node.right)
  if a is not None and b is not None:return a*b
 return None

class UsageByteLimit(unittest.TestCase):
 def test_no_old_accounting_literals_except_two_postal_capacities(self):
  found=[];excepted=set()
  for p in PACKAGE.rglob('*.py'):
   rel=p.relative_to(PACKAGE).as_posix()
   if rel.startswith('test/'):continue # historical fixtures/test vectors are not production readers
   tree=ast.parse(p.read_text(),filename=str(p))
   for node in ast.walk(tree):
    if numeric(node)==2**24:
     if rel in POSTAL_EXCEPTIONS:excepted.add(rel)
     else:found.append((rel,node.lineno))
  self.assertEqual(excepted,set(POSTAL_EXCEPTIONS))
  self.assertEqual(found,[],f'old accounting byte limits: {found}')
 def test_public_layout_accepts_patch_release_number_and_refuses_malformed(self):
  self.assertEqual(os.geteuid(),0,'declared root fixture required')
  m=load(PACKAGE/'checks/layout-check.py')
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'manifest.json'
   value=dict(version='0.1.15',rows=[dict(path='/opt/autopilot',kind='dir',mode=493,uid=0,gid=0)])
   for version in ['0.1.15','0.1.15.1']:
    value['version']=version;p.write_text(json.dumps(value));p.chmod(0o644)
    self.assertEqual(m.manifest(p,hashlib.sha256(p.read_bytes()).hexdigest())['version'],version)
   value['version']='0.1.15.1.1';p.write_text(json.dumps(value))
   with self.assertRaisesRegex(ValueError,'manifest shape'):m.manifest(p,hashlib.sha256(p.read_bytes()).hexdigest())
 def test_all_callers_follow_the_same_physical_constant(self):
  # A drift in any reader, even to a new literal, must fail this check.
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'package';shutil.copytree(PACKAGE,root)
   limits=root/'lib/task_limits.py';m=load(limits)
   self.assertTrue(hasattr(m,'USAGE_BYTE_LIMIT'),'missing common accounting byte limit')
   for delta in [0,12345]:
    source=limits.read_text();tree=ast.parse(source)
    assignment=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='USAGE_BYTE_LIMIT' for t in n.targets))
    lines=source.splitlines();lines[assignment.lineno-1]='USAGE_BYTE_LIMIT = '+str(m.USAGE_BYTE_LIMIT+delta);limits.write_text('\n'.join(lines)+'\n')
    expected=m.USAGE_BYTE_LIMIT+delta
    for filename,names in [('runtime/runtime_receipt_source.py',['LIMIT']),('runtime/team_usage.py',['BYTES','CACHE_BYTES']),('runtime/ap_sadik.py',['LIMIT']),('runtime/run_catalog.py',['LIMIT']),('lib/pilot_mail.py',['USAGE_BYTE_LIMIT']),('lib/owner_inventory.py',['MAX_FILE'])]:
     module=load(root/filename)
     for name in names:self.assertEqual(getattr(module,name),expected,(filename,name))
    limits.write_text(source)
if __name__=='__main__':unittest.main()
