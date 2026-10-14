"""SDK control decisions with actual Client.call; only external HTTP send is a trace double."""
import sys,unittest,tempfile,os
sys.dont_write_bytecode=True  # B-N-1858: импорт src/ostrov_api без -B писал src/__pycache__ в бой агента (Варвара 08.10 08:48:25Z) · importing src without -B wrote __pycache__ into the live copy
from pathlib import Path
sys.path.insert(0,os.environ.get('OSTROV_SDK_ROOT',str(Path(__file__).resolve().parents[1]/'src')))
from ostrov_api import Client,ClientError
UPDATE={'update_id':1,'message':{'message_id':2,'from':{'id':123,'is_bot':False},'chat':{'id':123,'type':'private'}}}
SITE={'route':'guest-site','conversationId':'fixture:conversation-1','receiptId':'11111111-2222-4333-8444-555555555555'}
PROFILE={'name':'Fixture','phone':'','email':'','notes':'','messengers':[{'type':'telegram','username':'fixture','userId':'456'}]}
KEY='fixture-request-key-0001'
class Trace(Client):
 def send(self,op,params,context=None,request_key=None):
  self.calls.append((op,params,context.copy() if context else None,request_key))
  if op=='identity':return {'role':self.role}
  if op=='client.read' and hasattr(self,'existing'):return {'profile':self.existing}
  return {'fixture':True}
class SDK(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();p=Path(self.temp.name)/'synthetic.key';p.write_bytes(b'fixture-secret-for-tests-only-00000000');self.client=Trace(p,'http://127.0.0.1:9','8868419301');self.client.calls=[];self.client.role='hospitality'
 def tearDown(self):self.temp.cleanup()
 def test_hospitality_is_confirmed_only_on_private_tg(self):
  result=self.client.call('staff.list',{},UPDATE)
  self.assertEqual(result['role'],'hospitality');self.assertEqual(result['route'],'staff-private');self.assertEqual(self.client.calls[-1][2]['route'],'staff-private')
 def test_guest_tg_never_probes_staff(self):
  r=self.client.call('staff.list',{},UPDATE,guest=True)
  self.assertEqual(r['role'],'guest');self.assertEqual([x[0]for x in self.client.calls],['staff.list']);self.assertEqual(r['route'],'guest-telegram')
 def test_site_context_never_probes_staff(self):
  r=self.client.call('client.read',{},site_context=SITE)
  self.assertEqual(r['role'],'guest');self.assertEqual(r['route'],'guest-site');self.assertEqual(self.client.calls,[('client.read',{},SITE,None)])
 def test_staff_targeted_save_does_not_rebind_guest_to_staff_sender(self):
  params={'id':'guest-card','profile':PROFILE,'version':3};self.client.call('client.save',params,UPDATE,request_key=KEY)
  self.assertEqual(self.client.calls[-1],('client.save',params,self.client.calls[-1][2],KEY));self.assertEqual(self.client.calls[-1][1]['profile']['messengers'][0]['userId'],'456')
 def test_staff_only_ops_refuse_guest_before_mutation(self):
  for op,p in [('client.list',{}),('client.create',{'profile':PROFILE}),('client.read',{'id':'guest'}),('client.assign',{'id':'guest','version':1,'staffId':'staff'}),('plan.link',{'kind':'resident','id':'doc','clientId':'guest','clientVersion':1,'documentVersion':'v1'})]:
   with self.subTest(op=op):
    self.client.calls=[]
    with self.assertRaises(ClientError):self.client.call(op,p,UPDATE,request_key=KEY,guest=True)
    self.assertEqual(self.client.calls,[])
 def test_context_refusal_never_falls_back_anonymous(self):
  for site in [{}, {**SITE,'route':'staff-private'}, {**SITE,'receiptId':'bad'}, {**SITE,'extra':'x'}]:
   with self.assertRaises(ClientError):self.client.call('plan.create',{},site_context=site,request_key=KEY)
  with self.assertRaises(ClientError):self.client.call('client.read',{},UPDATE,site_context=SITE)
  self.assertEqual(self.client.calls,[])
 def test_site_profile_is_not_rewritten_with_tg_id(self):
  profile={**PROFILE,'messengers':[{'type':'telegram','username':'fixture','userId':''}]};params={'profile':profile,'version':1}
  self.client.call('client.save',params,site_context=SITE,request_key=KEY)
  self.assertEqual(self.client.calls,[('client.save',params,SITE,KEY)])
 def test_optional_messenger_id_normalized_without_actor_substitution(self):
  profile={**PROFILE,'messengers':[{'type':'telegram','username':'unconfirmed'},{'type':'whatsapp','username':'contact'}]}
  cases=[('client.create',{'profile':profile},{'telegram_update':UPDATE}),('client.save',{'id':'other','profile':profile,'version':1},{'telegram_update':UPDATE}),('client.save',{'profile':profile,'version':None},{'site_context':SITE}),('plan.create',{'clientProfile':profile},{'telegram_update':UPDATE}),('plan.create',{'clientProfile':profile},{'site_context':SITE})]
  for op,params,context in cases:
   with self.subTest(op=op,context=context):
    self.client.calls=[];self.client.call(op,params,request_key=KEY,**context)
    body=self.client.calls[-1][1];wire=body.get('profile',body.get('clientProfile'))
    self.assertEqual([m['userId']for m in wire['messengers']],['',''])
    self.assertTrue(all('userId'not in m for m in profile['messengers']),'caller input mutated')
 def test_self_tg_save_still_binds_real_sender(self):
  profile={**PROFILE,'messengers':[{'type':'telegram','username':'self'}]}
  self.client.call('client.save',{'profile':profile,'version':None},UPDATE,request_key=KEY)
  self.assertEqual(self.client.calls[-1][1]['profile']['messengers'],[{'type':'telegram','username':'self','userId':'123'}])
  self.client.existing={**PROFILE,'messengers':[{'type':'telegram','username':'old','userId':'123'}]}
  self.client.call('client.save',{'profile':profile,'version':1},UPDATE,request_key=KEY)
  self.assertEqual(self.client.calls[-1][1]['profile']['messengers'],[{'type':'telegram','username':'self','userId':'123'}])
if __name__=='__main__':unittest.main()
