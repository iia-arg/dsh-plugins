"""Known native synthetic error is ancestry, not a provider charge."""
import copy, importlib.util, unittest
from test_raw_index import module
from test_gateway_receipt_source import fixture
def native():
 return dict(type='assistant',sessionId='thread',timestamp='1970-01-01T00:00:01.500000+00:00',uuid='synthetic-node',parentUuid='user',version='2.1.299',isApiErrorMessage=True,error='rate_limit',message=dict(id='ec159c11-bf26-4457-b7eb-b78d51cb2078',model='<synthetic>',usage=dict(input_tokens=0,output_tokens=0,cache_read_input_tokens=0,cache_creation_input_tokens=0),content=[dict(type='text',text='PRIVATE_ERROR')]))
class Synthetic(unittest.TestCase):
 def setUp(self):self.n=module('runtime_receipt_source.py')
 def case(self,row):
  g,rows,p,raw,requests,bindings=fixture('claude')
  raw[0].append(g.core.normalize(row,'raw'))
  return g,rows,p,raw,requests,bindings
 def run_case(self,c):
  g,rows,p,raw,requests,bindings=c
  return g.normalize_gateway(rows,p,raw,requests,bindings,{},g.iso(2000))
 def test_known_error_excluded_from_ids_and_calls_but_roundtrip_and_ancestry_kept(self):
  projected=self.n.core.normalize(native(),'raw')
  result=self.run_case(self.case(native()))
  self.assertEqual(result[0]['totals']['modelCalls'],1)
  self.assertEqual(result[0]['totals']['inputTokens'],100)
  self.assertTrue(projected.get('synthetic'))
  self.assertEqual(self.n.core.normalize(self.n.raw_record(projected),'raw'),projected)
  self.assertEqual(projected['parentUuid'],'user')
  self.assertNotIn('PRIVATE_ERROR',str(projected))
 def test_each_unknown_or_positive_shape_still_mismatches(self):
  for change in ['flag','error','model','usage','provider','version','tool','role','unknown-cost','nested-counter']:
   r=native()
   if change=='flag':r.pop('isApiErrorMessage')
   if change=='error':r['error']='overloaded_error'
   if change=='model':r['message']['model']='actual-model'
   if change=='usage':r['message']['usage']['input_tokens']=1
   if change=='provider':r['message']['id']='msg_provider'
   if change=='version':r['version']='unknown'
   if change=='role':r['message']['role']='user'
   if change=='unknown-cost':r['message']['usage']['new_counter']=0
   if change=='nested-counter':r['message']['usage']['server_tool_use']=dict(web_search_requests={},web_fetch_requests=0)
   if change=='tool':r['message']['content']=[dict(type='tool_use',id='x',name='Agent')]
   c=self.case(r)
   with self.subTest(change=change),self.assertRaisesRegex(c[0].Incomplete,'GATEWAY_USAGE_MISMATCH'):self.run_case(c)
 def test_actual_sdk_null_metadata_is_not_mistaken_for_cost(self):
  r=native();r['message']['usage'].update(output_tokens_details=None,service_tier=None,inference_geo=None,iterations=None,speed=None,fallback_credit=None,server_tool_use=dict(web_search_requests=0,web_fetch_requests=0),cache_creation=dict(ephemeral_1h_input_tokens=0,ephemeral_5m_input_tokens=0))
  self.assertEqual(self.run_case(self.case(r))[0]['totals']['inputTokens'],100)
  r['message']['usage']['server_tool_use']['web_fetch_requests']=1
  c=self.case(r)
  with self.assertRaisesRegex(c[0].Incomplete,'GATEWAY_USAGE_MISMATCH'):self.run_case(c)
 def test_real_zero_provider_is_still_one_call(self):
  c=self.case(native());g,rows,p,raw,requests,bindings=c
  actual=next(r for r in raw[0] if r.get('messageId')=='response');actual['usage']=dict(native()['message']['usage'])
  next(r for r in rows if r['kind']=='assistant_usage')['usage']=dict(actual['usage'])
  self.assertEqual(self.run_case(c)[0]['totals']['modelCalls'],1)
 def test_child_ancestry_through_synthetic_and_unknown_shape(self):
  from test_child_usage import claude_fixture
  c=claude_fixture();g,rows,p,raw,requests,bindings=c;child=raw[1][0]['threadId']
  for flag in [True,False,True]:
   r=native();r.update(sessionId=child,parentUuid='child-user',timestamp=g.iso(1590))
   if not flag:r.pop('isApiErrorMessage')
   projected=g.core.normalize(r,'raw');raw[1]=raw[1][:2]+[projected,dict(raw[1][-1],parentUuid='synthetic-node')]
   result=self.run_case(c);derived=[r for r in result if r.get('parentRequestId')]
   if flag:self.assertEqual(derived[0]['totals']['modelCalls'],1);self.assertFalse(result[0].get('childIncomplete',False))
   else:self.assertTrue(result[0].get('childIncomplete',False));self.assertEqual(derived,[])
 def test_confirmed_synthetic_in_g_zero_only(self):
  c=self.case(native());g,rows,p,raw,requests,bindings=c
  event=copy.deepcopy(next(r for r in rows if r['kind']=='assistant_usage'));event['messageId']=native()['message']['id'];event['usage']=native()['message']['usage']
  pos=rows.index(next(r for r in rows if r['kind']=='assistant_usage'));rows.insert(pos+1,event)
  for i,r in enumerate(rows):r['seq']=i+1
  self.assertEqual(self.run_case(c)[0]['totals']['modelCalls'],1)
  event['usage']=dict(event['usage'],output_tokens=1)
  with self.assertRaisesRegex(g.Incomplete,'GATEWAY_USAGE_MISMATCH'):self.run_case(c)
if __name__=='__main__':unittest.main()
