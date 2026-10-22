"""Queue identity/state predicates; real root-status ownership is covered by root fixtures."""
import hashlib,importlib.util,json,sqlite3,unittest
from pathlib import Path
from unittest.mock import patch
PACKAGE=Path(__file__).resolve().parents[1]
def load():
 spec=importlib.util.spec_from_file_location('queue_predicate_fixture',PACKAGE/'lib/mail_registration.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class QueueCompletion(unittest.TestCase):
 def setUp(self):
  self.m=load();self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close);self.db.execute('CREATE TABLE usage_registrations(run_id TEXT PRIMARY KEY,request_sha TEXT,request_json TEXT,peer_uid INTEGER,peer_pid INTEGER,accepted_at REAL,operator_json TEXT)');self.status={}
 def seed(self,state='UNBOUND',terminal=True):
  for i in range(self.m.QUEUE_LIMIT):
   run='old-'+str(i);sha=hashlib.sha256(run.encode()).hexdigest();self.db.execute('INSERT INTO usage_registrations VALUES(?,?,?,?,?,?,?)',(run,sha,'{}',1006,123,1.,'{}'));self.status[run]=dict(runId=run,requestSHA256=sha,state=state,terminal=terminal)
 def submit(self,run='new-run'):
  request=dict(op='usage_register',runId=run,project='/private-project',startedAt='2026-10-18T00:00:00Z',operator={})
  def trusted(path):
   if Path(path).stem not in self.status:raise FileNotFoundError(path)
   return self.status[Path(path).stem]
  with patch.object(self.m,'trusted_status',side_effect=trusted):return self.m.queue_request(self.db,'master',1006,123,request,lambda:self.m.utc(request['startedAt']).timestamp(),peer_chain=dict(uid=1006,chain=[]))
 def test_128_final_unbound_free_capacity_for_new_request(self):
  self.seed();answer=self.submit();self.assertTrue(answer.get('ok'),answer);self.assertEqual(answer['state'],'QUEUED');self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
 def test_pending_unbound_is_not_deleted(self):
  self.seed(terminal=False);answer=self.submit();self.assertEqual(answer,dict(ok=False,reason='REGISTRATION_QUEUE_FULL'));self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],128)
 def test_terminal_bool_must_be_exact_and_both_identities_must_match(self):
  self.seed()
  for i,value in enumerate(self.status.values()):
   if i%3==0:value['terminal']=1
   elif i%3==1:value['requestSHA256']='0'*64
   else:value['runId']='different-run'
  self.assertEqual(self.submit(),dict(ok=False,reason='REGISTRATION_QUEUE_FULL'));self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],128)
 def test_registered_pruning_is_preserved(self):
  self.seed(state='REGISTERED');answer=self.submit();self.assertTrue(answer.get('ok'),answer);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
 def test_pending_rows_survive_beside_final_rows(self):
  self.seed();self.status['old-0']['terminal']=False;answer=self.submit();self.assertTrue(answer.get('ok'),answer);self.assertEqual({r[0] for r in self.db.execute('SELECT run_id FROM usage_registrations')},{'old-0','new-run'})
 def test_terminal_run_id_cannot_be_reused_after_queue_prune(self):
  self.seed();self.assertTrue(self.submit().get('ok'));self.assertEqual(self.submit('old-0'),dict(ok=False,reason='RUN_ALREADY_EXISTS'))
