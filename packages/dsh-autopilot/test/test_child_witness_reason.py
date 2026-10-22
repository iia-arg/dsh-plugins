"""Missing witness is a reason, never proof of no children or of a healthy observer."""
import copy, unittest
from test_gateway_receipt_source import fixture
from test_child_usage import wire_version,wire_key
class Witness(unittest.TestCase):
 def case(self):
  fx=fixture('codex');events=fx[1];common=copy.deepcopy(events[0]);v=wire_version('codex');key=wire_key(v)
  events.append(dict(common,kind='source_version',observedAt=1151,sourceVersion=v,sourceVersionKey=key,versionProof='codex_initialize_user_agent'))
  events.append(dict(common,kind='child_capture_end',observedAt=1989,sourceVersionKey=key,startedRuns=0,terminalRuns=0))
  self.order(fx);return fx
 def order(self,fx):
  fx[1].sort(key=lambda r:r['observedAt'])
  for i,r in enumerate(fx[1],1):r['seq']=i
 def call(self,fx):
  m,events,p,raw,requests,bindings=fx
  return m.normalize_gateway(events,p,raw,requests,bindings,{},m.iso(2000))[0]
 def missing(self,fx):
  version=next(r for r in fx[1] if r['kind']=='source_version');fx[1].remove(version)
  gap=dict(fx[1][0],kind='child_capture_gap',observedAt=1151,detail='VERSION_WITNESS_UNAVAILABLE');fx[1].append(gap);self.order(fx);return version,gap
 def test_zero_children_after_failed_capture_stays_witness_incomplete_and_return(self):
  fx=self.case();self.assertFalse(self.call(fx).get('childIncomplete',False));v,gap=self.missing(fx)
  row=self.call(fx);self.assertTrue(row['childIncomplete']);self.assertEqual(row['childDiagnostics'],['CHILD_VERSION_WITNESS_UNAVAILABLE']);self.assertEqual(row['totals']['inputTokens'],100)
  fx[1].remove(gap);fx[1].append(v);self.order(fx);self.assertFalse(self.call(fx).get('childIncomplete',False))
 def test_missing_end_and_other_gap_do_not_hide_behind_witness(self):
  for damage in ['end','unknown-gap','bad-count','late-child']:
   fx=self.case();self.missing(fx)
   if damage=='end':fx[1][:]=[r for r in fx[1] if r['kind']!='child_capture_end']
   if damage=='unknown-gap':next(r for r in fx[1] if r['kind']=='child_capture_gap')['detail']='SOMETHING_UNKNOWN'
   if damage=='bad-count':next(r for r in fx[1] if r['kind']=='child_capture_end')['startedRuns']=1
   if damage=='late-child':fx[1].append(dict(fx[1][0],kind='thread',observedAt=1999,threadId='unseen-child',parentThreadId='thread'));self.order(fx)
   row=self.call(fx)
   with self.subTest(damage=damage):self.assertIn('CHILD_CAPTURE_INCOMPLETE',row['childDiagnostics'])
if __name__=='__main__':unittest.main()
