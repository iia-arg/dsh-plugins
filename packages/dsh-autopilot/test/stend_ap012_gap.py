"""Actual decoder + registrar: a failed previous observer cannot poison a new one."""
import copy,importlib.util,json,pathlib,unittest
P=pathlib.Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
g=module('g',P/'runtime/gateway_receipt_source.py');u=module('u',P/'runtime/usage_registration.py');fix=P/'test/fixtures/ap012';record=json.loads((fix/'original-record.json').read_text());participant=next(p for p in record['participants'] if p['name']=='master');good=json.loads((fix/'master-G-bound.json').read_text());bindings=list(json.loads((fix/'master-bindings.json').read_text()).values());raw=next(r['rows'] for r in map(json.loads,(fix/'native-projections.jsonl').read_text().splitlines()) if r['name']=='master')
def make(scope='request'):
 old=copy.deepcopy(good[:2]);old_id='failed-previous-request'
 for r in old:r['requestId']=old_id;r['generation']='failed-previous-generation';r['requestGeneration']='failed-previous-runtime';r['observedAt']-=100000
 old[1]['request_id']=old_id;old[1]['enginePid']+=100;old[1]['sourceProcess']['pid']+=100
 gap=dict(old[-1],kind='source_gap',seq=3,scope=scope,reason='CLAUDE_STREAM_INTERRUPTED');old.append(gap)
 return old+copy.deepcopy(good),old_id
class Gap(unittest.TestCase):
 def test_decoder_ignores_proven_excluded_request_gap(self):
  rows,old=make()
  try:result=g.normalize_gateway(rows,participant,[raw],None,bindings,{old:'AUTHENTICATED_OTHER_RUN'},'2026-10-19T04:35:00+00:00',account_map_load=lambda:None)
  except g.Incomplete as e:self.fail('healthy current request refused: '+str(e))
  self.assertEqual(result[0]['totals']['inputTokens'],1558466)
 def test_selected_failed_request_still_refuses(self):
  rows,old=make();binding=dict(bindings[0],requestId=old)
  with self.assertRaisesRegex(g.Incomplete,'^SOURCE_GAP$'):g.normalize_gateway(rows,participant,[raw],None,[binding],{bindings[0]['requestId']:'AUTHENTICATED_OTHER_RUN'},'2026-10-19T04:35:00+00:00')
 def test_process_and_unknown_gap_still_poison_snapshot(self):
  for scope in ('process','unknown'):
   rows,old=make(scope)
   with self.assertRaisesRegex(g.Incomplete,'^SOURCE_GAP$'):g.groups(rows,participant,None)
 def test_registration_keeps_failed_identity_for_current_guard(self):
  rows,old=make()
  try:projected=g.process_requests(rows,participant)
  except g.Incomplete as e:self.fail('registration metadata refused: '+str(e))
  healthy=next(r for r in projected if r.get('requestId')==bindings[0]['requestId']);bad=next(r for r in projected if r.get('requestId')==old)
  def who(r):
   x=r['sourceProcess'];return dict(uid=participant['uid'],boot_id=x['boot'],chain=[dict(pid=x['pid'],starttime=x['start'])])
  expected=dict(sessionId=healthy['sessionId'],sessionCreated=healthy['sessionCreated'],turn=healthy['dshTurn']);self.assertEqual(u.operator_tuple(projected,who(healthy),healthy['startedAt']),expected)
  with self.assertRaisesRegex(ValueError,'^SOURCE_GAP$'):u.operator_tuple(projected,who(bad),bad['startedAt'])
if __name__=='__main__':unittest.main(verbosity=2)
