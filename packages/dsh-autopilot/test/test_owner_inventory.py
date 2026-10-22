"""Real filesystem probes; all fixtures are inside this task's disposable tree."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import importlib.util,json,os,pwd,tempfile,unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'lib/owner_inventory.py'
class OwnerInventory(unittest.TestCase):
 def setUp(self):
  self.assertTrue(SCRIPT.is_file(),'owner-scope reader missing')
  spec=importlib.util.spec_from_file_location('owner_inventory_case',SCRIPT);self.code=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.code)
  self.tmp=tempfile.TemporaryDirectory(prefix='owner-inventory-',dir=Path(__file__).parent);self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.uid=pwd.getpwnam('master').pw_uid
 def state(self,project,*,skill=None,finished=None):
  _fixture_mkdir(project, mode=0o755, parents=True, exist_ok=True);folder=project/'.autopilot';_fixture_mkdir(folder, mode=0o755, exist_ok=True)
  meta=dict(schema=1,root=str(project),run_id='run-one',project_id='project-one',agent='master',public_root=str(self.root/'public'),release=dict(skill_dir=skill or '/opt/autopilot/releases/'+'a'*40+'-a14/skill',upstream_sha='a'*40,local_revision='a14'))
  state=dict(_sadik=meta,finishedAt=finished)
  for name,value in [('state.js','window.STATE='+json.dumps(state)),('operator.json',json.dumps(dict(pid=999999,uid=self.uid,boot='fixture',start='1')))]:
   p=folder/name;p.write_text(value);os.chown(p,self.uid,-1)
  return folder/'state.js'
 def test_outside_home_and_depth_beyond_seven_are_found(self):
  self.state(self.root/'var/tmp'/'d'/'d'/'d'/'d'/'d'/'d'/'project')
  result=self.code.scan_roots([self.root],uid=self.uid)
  self.assertTrue(result['complete'],result);self.assertEqual(len(result['files']),2)
  self.assertGreater(result['maxObservedDepth'],7)
 def test_real_depth257_is_blind_not_zero_runs(self):
  project=self.root
  for _ in range(257):project=project/'d'
  self.state(project)
  result=self.code.scan_roots([self.root],uid=self.uid,max_depth=256)
  self.assertFalse(result['complete']);self.assertTrue(any('DEPTH_LIMIT_256' in x for x in result['errors']))
 def test_bad_permission_and_symlink_are_not_followed(self):
  p=self.state(self.root/'outside');link=self.root/'alias';link.symlink_to(p.parent)
  result=self.code.scan_roots([self.root],uid=self.uid)
  self.assertTrue(result['complete']);self.assertEqual(len(result['files']),2);self.assertIn(str(link),result['symlinks'])
 def test_a_name_looking_like_stend_does_not_exclude_a_real_pin(self):
  p=self.state(self.root/'AP016-WRITER-COPY-fake')
  result=self.code.analyze([str(p),str(p.with_name('operator.json'))],uid=self.uid,public_root=self.root/'public')
  row=next(x for x in result['records'] if x['path']==str(p));self.assertEqual(row['classification'],'canonical_run');self.assertTrue(row['potentialProductionPin']);self.assertEqual(row['status'],'unfinished')
 def test_private_release_is_explicit_fixture_not_a_production_pin(self):
  private=self.root/'private-core/skill';_fixture_mkdir(private, mode=0o755, parents=True)
  p=self.state(self.root/'project',skill=str(private))
  result=self.code.analyze([str(p),str(p.with_name('operator.json'))],uid=self.uid,public_root=self.root/'public')
  row=next(x for x in result['records'] if x['path']==str(p));self.assertEqual(row['classification'],'nonproduction_release_binding');self.assertFalse(row['potentialProductionPin'])
 def test_public_card_is_matched_to_canonical_run(self):
  p=self.state(self.root/'project');public=self.root/'public/master';card=public/'project-one/run-one/state.js';_fixture_mkdir(card.parent, mode=0o755, parents=True);card.write_text('window.STATE='+json.dumps(dict(finishedAt=None,usage=dict(runId='run-one'))));os.chown(card,self.uid,-1)
  (public/'index.json').write_text(json.dumps({'project-one/run-one':dict(finished=False,rev=1)}))
  result=self.code.analyze([str(p),str(p.with_name('operator.json')),str(card)],uid=self.uid,public_root=self.root/'public')
  self.assertEqual(result['public']['matched'],1);self.assertEqual(result['public']['unmatched'],[])
 def test_deadline_between_mount_roots_is_blind(self):
  from unittest import mock
  a=self.root/'a';b=self.root/'b';_fixture_mkdir(a, mode=0o755);_fixture_mkdir(b, mode=0o755)
  with mock.patch.object(self.code.time,'monotonic',side_effect=[0,0,2]):
   result=self.code.scan_roots([a,b],uid=self.uid,timeout=1)
  self.assertFalse(result['complete']);self.assertIn('SCAN_DEADLINE_1',result['errors'])
 def test_public_root_mismatch_is_not_matched(self):
  p=self.state(self.root/'project');value=json.loads(p.read_text().split('=',1)[1]);value['_sadik']['public_root']=str(self.root/'OTHER-public');p.write_text('window.STATE='+json.dumps(value))
  public=self.root/'public/master';card=public/'project-one/run-one/state.js';_fixture_mkdir(card.parent, mode=0o755, parents=True);card.write_text('window.STATE='+json.dumps(dict(finishedAt=None)));os.chown(card,self.uid,-1)
  (public/'index.json').write_text(json.dumps({'project-one/run-one':dict(finished=False)}))
  result=self.code.analyze([str(p),str(p.with_name('operator.json')),str(card)],uid=self.uid,public_root=self.root/'public')
  self.assertEqual(result['public']['matched'],0);self.assertFalse(result['complete'])
 def test_broken_release_yields_unproven_record_not_crash(self):
  p=self.state(self.root/'project');value=json.loads(p.read_text().split('=',1)[1]);value['_sadik']['release']='broken';p.write_text('window.STATE='+json.dumps(value))
  result=self.code.analyze([str(p)],uid=self.uid,public_root=self.root/'public')
  self.assertFalse(result['complete']);self.assertTrue(any(r['classification']=='unresolved_record' for r in result['records']))
 def test_wrong_canonical_root_cannot_hide_as_copy(self):
  p=self.state(self.root/'project');value=json.loads(p.read_text().split('=',1)[1]);value['_sadik']['root']=str(self.root/'different-project');p.write_text('window.STATE='+json.dumps(value))
  result=self.code.analyze([str(p)],uid=self.uid,public_root=self.root/'public')
  self.assertFalse(result['complete']);self.assertTrue(next(x for x in result['records'] if x['path']==str(p))['potentialProductionPin'])
 def test_relative_or_bad_production_pin_is_not_fixture(self):
  for skill in ['relative/core','/opt/autopilot/releases/not-valid/skill']:
   p=self.state(self.root/'project',skill=skill)
   result=self.code.analyze([str(p)],uid=self.uid,public_root=self.root/'public')
   self.assertFalse(result['complete']);self.assertTrue(any(x['classification']=='unresolved_record' for x in result['records']))
 def test_missing_legacy_private_release_is_unproven(self):
  p=self.state(self.root/'project');p.write_text('window.STATE='+json.dumps(dict(skillDir=str(self.root/'missing/skill'),finishedAt=None)))
  result=self.code.analyze([str(p)],uid=self.uid,public_root=self.root/'public')
  self.assertFalse(result['complete'])
 def test_unindexed_real_public_card_is_unproven(self):
  public=self.root/'public/master';card=public/'orphan/run/state.js';_fixture_mkdir(card.parent, mode=0o755, parents=True);card.write_text('window.STATE='+json.dumps(dict(finishedAt=None)));os.chown(card,self.uid,-1);(public/'index.json').write_text('{}')
  result=self.code.analyze([str(card)],uid=self.uid,public_root=self.root/'public')
  self.assertFalse(result['complete']);self.assertEqual(result['public']['unindexedCards'],[str(card)])
 def test_malformed_unindexed_public_card_is_unproven(self):
  public=self.root/'public/master';card=public/'orphan/run/state.js';_fixture_mkdir(card.parent, mode=0o755, parents=True);card.write_text('window.STATE=INVALID');os.chown(card,self.uid,-1);(public/'index.json').write_text('{}')
  result=self.code.analyze([str(card)],uid=self.uid,public_root=self.root/'public')
  self.assertFalse(result['complete']);self.assertEqual(result['public']['unindexedCards'],[str(card)])
if __name__=='__main__':unittest.main(verbosity=2)
