"""Attestation cannot waive canonical safety pins; real files in a private root."""
import hashlib,json,os,pwd,sys,tempfile,unittest
from pathlib import Path
PACKAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PACKAGE/'lib'))
import owner_inventory as O
import accepted_inventory as A
class AttestationPin(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='attestation-pin-',dir=Path(__file__).parent)
  self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.uid=pwd.getpwnam('master').pw_uid
  self.project=self.root/'project';folder=self.project/'.autopilot';folder.mkdir(parents=True)
  self.state=folder/'state.js';self.operator=folder/'operator.json';self.evidence=self.root/'proof';self.evidence.write_text('isolated root provenance\n')
  self.release='a'*40+'-a14'
  self.meta=dict(root=str(self.project),run_id='canonical-one',project_id='project-one',public_root=str(self.root/'public'),release=dict(skill_dir='/opt/autopilot/releases/'+self.release+'/skill',upstream_sha='a'*40,local_revision='a14'))
  self.write_state(None);self.operator.write_text(json.dumps(dict(uid=self.uid,pid=999999,boot='fixture',start='1')));os.chown(self.operator,self.uid,-1)
  p=self.root/'inventory-scope.json';p.write_text(json.dumps(dict(schemaVersion=1,roots=[str(self.root)],publicRoot=str(self.root/'public'))));p.chmod(0o600)
 def write_state(self,finished):
  self.state.write_text('window.STATE='+json.dumps(dict(_sadik=self.meta,finishedAt=finished)));os.chown(self.state,self.uid,-1)
 def proof(self):
  s=self.evidence.stat()
  return dict(sha256=O.digest(self.state.read_bytes()),classification='attested_isolated_fixture',evidence=[dict(path=str(self.evidence),sha256=O.digest(self.evidence.read_bytes()),uid=s.st_uid,mode=s.st_mode&0o777,device=s.st_dev,inode=s.st_ino)])
 def analyze(self,attested):
  v=O.analyze([str(self.state),str(self.operator)],uid=self.uid,public_root=self.root/'public',attestations={str(self.state):self.proof()} if attested else {})
  self.assertTrue(v['complete'],v['errors']);return next(r for r in v['records'] if r['path']==str(self.state))
 def test_unfinished_attestation_keeps_class_pin_and_evidence(self):
  row=self.analyze(True);self.assertEqual(row['classification'],'canonical_run');self.assertTrue(row['potentialProductionPin']);self.assertEqual(row['attestation'],self.proof());self.assertEqual(row['classificationEvidence'],self.proof()['evidence'])
 def test_unfinished_without_attestation_keeps_same_safety(self):
  row=self.analyze(False);self.assertEqual(row['classification'],'canonical_run');self.assertTrue(row['potentialProductionPin']);self.assertNotIn('attestation',row)
 def test_finished_attestation_keeps_finished_pin_false(self):
  self.write_state('2026-10-17T08:00:00Z');row=self.analyze(True);self.assertEqual(row['classification'],'canonical_run');self.assertFalse(row['potentialProductionPin']);self.assertEqual(row['attestation'],self.proof())
 def accepted(self):
  report=A.capture(self.root);row=next(r for r in report['records'] if r['path']==str(self.state));row.update(attestation=self.proof(),classificationEvidence=self.proof()['evidence']);return report
 def test_recheck_retains_attestation_and_active_run(self):
  fresh=A.verify_fresh(self.accepted(),self.root);row=next(r for r in fresh['records'] if r['path']==str(self.state));self.assertEqual(row['attestation'],self.proof());self.assertTrue(row['potentialProductionPin']);self.assertEqual(len(fresh['runs']),1);self.assertTrue(fresh['runs'][0]['active']);self.assertIn('canonical-one',A.active_rows(fresh))
 def test_changed_attestation_evidence_refuses(self):
  accepted=self.accepted();self.evidence.write_text('changed\n')
  with self.assertRaisesRegex(ValueError,'classification evidence changed'):A.verify_fresh(accepted,self.root)
 def test_bad_attestation_state_digest_refuses(self):
  proof=self.proof();proof['sha256']='0'*64
  v=O.analyze([str(self.state),str(self.operator)],uid=self.uid,public_root=self.root/'public',attestations={str(self.state):proof})
  self.assertFalse(v['complete']);self.assertTrue(next(r for r in v['records'] if r['path']==str(self.state))['potentialProductionPin'])
if __name__=='__main__':unittest.main(verbosity=2)
