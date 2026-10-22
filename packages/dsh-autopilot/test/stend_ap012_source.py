import copy,importlib.util,json,pathlib,sys,unittest
BASE=pathlib.Path(__file__).resolve().parent/'fixtures/ap012'
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('g',ROOT/'runtime/gateway_receipt_source.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
PS={p['name']:p for p in json.loads((BASE/'original-record.json').read_text())['participants']}
RAW={d['name']:d['rows'] for d in map(json.loads,(BASE/'native-projections.jsonl').read_text().splitlines())}
def inputs(name):
 return json.loads((BASE/f'{name}-G-bound.json').read_text()),copy.deepcopy(RAW[name])
def run(name,rows,raw):
 return g.normalize_gateway(rows,PS[name],[raw],None,list(json.loads((BASE/f'{name}-bindings.json').read_text()).values()),{},'2026-10-19T04:35:00+00:00',account_map_load=lambda:None)
class History(unittest.TestCase):
 def test_master_historical_resume_usage_not_charge(self):
  rows,raw=inputs('master')
  try:got=run('master',rows,raw)[0]['totals']
  except g.Incomplete as e:self.fail('unexpected refusal: '+str(e))
  self.assertEqual(got,dict(modelCalls=7,inputTokens=1558466,uncachedInputTokens=9666,outputTokens=2422,cacheReadTokens=1548800,cacheWriteTokens=0))
 def test_vintik_child_missing_native_preserves_parent_after_history(self):
  rows=run('vintik',*inputs('vintik'));self.assertTrue(rows[0]['childIncomplete']);self.assertGreater(rows[0]['totals']['inputTokens'],0)
 def test_without_historical_completion_stays_foreign(self):
  rows,raw=inputs('master');raw=[r for r in raw if not(r.get('turnId')==rows[2]['turnId'] and r['type']=='task_complete')]
  with self.assertRaisesRegex(g.Incomplete,'^FOREIGN_TURN$'):run('master',rows,raw)
 def test_historical_turn_completed_after_start_stays_foreign(self):
  rows,raw=inputs('master')
  for r in raw:
   if r.get('turnId')==rows[2]['turnId'] and r['type']=='task_complete':r['at']='2026-10-19T03:41:38.000Z'
  with self.assertRaisesRegex(g.Incomplete,'^FOREIGN_TURN$'):run('master',rows,raw)
 def test_foreign_usage_after_ready_stays_foreign(self):
  rows,raw=inputs('master');r=rows.pop(2);rows.insert(6,r)
  for i,r in enumerate(rows):r['seq']=i+1;r['observedAt']=max(r['observedAt'],rows[i-1]['observedAt'] if i else 0)
  with self.assertRaisesRegex(g.Incomplete,'^FOREIGN_TURN$'):run('master',rows,raw)
 def test_existing_sova_G_cannot_be_repaired_from_native(self):
  with self.assertRaisesRegex(g.Incomplete,'^GATEWAY_USAGE_MISMATCH$'):run('sova',*inputs('sova'))
if __name__=='__main__':unittest.main(verbosity=2)
