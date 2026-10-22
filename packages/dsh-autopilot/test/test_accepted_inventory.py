"""Accepted owner census, complete private scope, no production writes."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib,importlib.util,json,os,pwd,sys,tempfile,unittest
from pathlib import Path
PACKAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PACKAGE/'lib'));sys.path.insert(0,str(PACKAGE/'runtime'))
class AcceptedInventory(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='accepted-owner-');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.base=self.root/'var/lib/dsh-autopilot';self.uid=pwd.getpwnam('master').pw_uid
  config=dict(schemaVersion=1,roots=[str(self.root)],publicRoot=str(self.root/'public'))
  p=self.root/'inventory-scope.json';p.write_text(json.dumps(config));p.chmod(0o600)
  spec=importlib.util.spec_from_file_location('owner_catalog_case',PACKAGE/'runtime/run_catalog.py');self.C=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.C)
 def project(self,name):
  project=self.root/name;folder=project/'.autopilot';_fixture_mkdir(folder, mode=0o755, parents=True)
  meta=dict(schema=1,root=str(project),run_id=name.replace('/','-'),project_id=name.replace('/','-'),public_root=str(self.root/'public'),release=dict(upstream_sha='a'*40,local_revision='a14',skill_dir='/opt/autopilot/releases/'+'a'*40+'-a14/skill'))
  for n,value in [('state.js','window.STATE='+json.dumps(dict(_sadik=meta,finishedAt=None))),('operator.json',json.dumps(dict(pid=12345,uid=self.uid,boot='fixture',start='1')))]:
   p=folder/n;p.write_text(value);os.chown(p,self.uid,-1)
  return meta
 def report(self):
  v=self.C.scan_legacy(self.root);self.assertEqual(v['schemaVersion'],2,'old HOME scanner still supplies v1')
  p=self.root/'accepted.json';p.write_text(json.dumps(v));return p,hashlib.sha256(p.read_bytes()).hexdigest()
 def test_outside_home_run_enters_catalogue(self):
  meta=self.project('var/tmp/real');p,sha=self.report();self.C.bootstrap(self.base,self.root,p,sha)
  with self.C.Catalog(self.base) as c:
   self.assertIn(meta['run_id'],c.data['runs'])
   with self.assertRaisesRegex(ValueError,'LIVE_RUN_PINNED'):c.assert_no_live_pins('a'*40+'-a14')
 def test_new_project_after_accepted_census_is_incomplete(self):
  p,sha=self.report();self.project('tmp/new')
  with self.assertRaisesRegex(ValueError,'RUN_INVENTORY_UNPROVEN.*inventory incomplete'):self.C.bootstrap(self.base,self.root,p,sha)
  self.assertFalse((self.base/'bootstrap.json').exists())
 def test_dropped_root_and_old_home_report_refuse(self):
  p,sha=self.report();v=json.loads(p.read_text());v['scopeRoots']=[];p.write_text(json.dumps(v));sha=hashlib.sha256(p.read_bytes()).hexdigest()
  with self.assertRaisesRegex(ValueError,'RUN_INVENTORY_UNPROVEN'):self.C.bootstrap(self.base,self.root,p,sha)
  p.write_text(json.dumps(dict(schemaVersion=1,scope=str(self.root),complete=True,errors=[],operator='master',operatorUid=self.uid,runs=[],found=0)))
  with self.assertRaisesRegex(ValueError,'RUN_INVENTORY_UNPROVEN'):self.C.bootstrap(self.base,self.root,p,hashlib.sha256(p.read_bytes()).hexdigest())
 def test_new_empty_owner_autopilot_dir_is_incomplete(self):
  p,sha=self.report();folder=self.root/'outside/.autopilot';_fixture_mkdir(folder, mode=0o755, parents=True);os.chown(folder,self.uid,-1)
  with self.assertRaisesRegex(ValueError,'inventory incomplete'):self.C.bootstrap(self.base,self.root,p,sha)
  self.assertFalse((self.base/'bootstrap.json').exists())
 def test_duplicate_run_ids_never_overwrite_a_pin(self):
  self.project('one');self.project('two');p2=self.root/'two/.autopilot/state.js';v=json.loads(p2.read_text().split('=',1)[1]);v['_sadik']['run_id']='one';p2.write_text('window.STATE='+json.dumps(v));p,sha=self.report()
  with self.assertRaisesRegex(ValueError,'duplicate run/project'):self.C.bootstrap(self.base,self.root,p,sha)
  self.assertFalse((self.base/'bootstrap.json').exists())
 def test_old_valid_home_catalogue_is_scope_unproven(self):
  p,sha=self.report();self.C.bootstrap(self.base,self.root,p,sha)
  legacy=self.base/'legacy.json';v=json.loads(legacy.read_text());v['schemaVersion']=1;v['scope']=str(self.root/'HOME');legacy.write_text(json.dumps(v));newsha=hashlib.sha256(legacy.read_bytes()).hexdigest()
  for name in ['bootstrap.json','applicability.json','runs/catalog.json']:
   file=self.base/name;value=json.loads(file.read_text());value['legacySha256']=newsha
   if name=='bootstrap.json':value['scope']=v['scope']
   file.write_text(json.dumps(value))
  with self.assertRaisesRegex(ValueError,'inventory scope unproven'):
   with self.C.Catalog(self.base):pass
 def test_changed_classification_evidence_is_unproven(self):
  self.project('one');p,sha=self.report();v=json.loads(p.read_text());e=self.root/'proof';e.write_text('COPY-PROOF');st=e.stat()
  row=next(x for x in v['records'] if x.get('runId')=='one');row.update(classification='attested_isolated_fixture',potentialProductionPin=False,classificationEvidence=[dict(path=str(e),sha256=hashlib.sha256(e.read_bytes()).hexdigest(),uid=st.st_uid,mode=st.st_mode&0o777,device=st.st_dev,inode=st.st_ino)])
  p.write_text(json.dumps(v));sha=hashlib.sha256(p.read_bytes()).hexdigest();e.write_text('CHANGED')
  with self.assertRaisesRegex(ValueError,'classification evidence changed'):self.C.bootstrap(self.base,self.root,p,sha)
 def test_retained_runtime_binding_conflict_refuses(self):
  p,sha=self.report();self.C.bootstrap(self.base,self.root,p,sha)
  meta=dict(root=str(self.root/'pending-outside'),run_id='same',release=dict(upstream_sha='a'*40,local_revision='a14',skill_dir='/opt/autopilot/releases/'+'a'*40+'-a14/skill'))
  with self.C.Catalog(self.base) as c:c.pin(meta);c.invalidate('a'*40+'-a14','old-window')
  self.project('same');p,sha=self.report()
  with self.assertRaisesRegex(ValueError,'retained runtime pin conflicts'):self.C.bootstrap(self.base,self.root,p,sha,window_id='new-window')
 def test_fixture_cannot_target_production_catalogue(self):
  p,sha=self.report()
  from unittest import mock
  with mock.patch.object(self.C,'_root_dir',side_effect=AssertionError('would write production')) as writer:
   with self.assertRaisesRegex(ValueError,'deployment scope mismatch'):self.C.bootstrap(Path('/var/lib/dsh-autopilot'),self.root,p,sha)
   self.assertEqual(writer.call_count,0)
if __name__=='__main__':unittest.main(verbosity=2)
