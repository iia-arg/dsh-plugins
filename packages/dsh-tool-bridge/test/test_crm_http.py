"""Synthetic server candidate -> actual signed SDK requests and runner; no production data."""
import os,sys,json,subprocess,unittest,urllib.request
sys.dont_write_bytecode=True  # B-N-1858: импорт src/ostrov_api без -B писал src/__pycache__ в бой агента (Варвара 08.10 08:48:25Z) · importing src without -B wrote __pycache__ into the live copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from ostrov_api import Client,ClientError
class Integration(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=subprocess.Popen([sys.executable,'-B',str(ROOT/'test/api-fixture.py'),os.environ['MARK_TEST_APP']],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env={**os.environ,'OSTROV_FIXTURE_CRM':'1'})
  cls.cfg=json.loads(cls.server.stdout.readline());cls.client=Client(cls.cfg['keyFile'],cls.cfg['baseUrl'],'8868419301');cls.seq=0
 @classmethod
 def tearDownClass(cls):cls.server.terminate();cls.server.wait(timeout=8)
 def calls(self):return json.load(urllib.request.urlopen(self.cfg['baseUrl']+'/fixture/calls'))['calls']
 def update(self,id=123456):return {'update_id':1,'message':{'message_id':2,'from':{'id':id,'is_bot':False},'chat':{'id':id,'type':'private'}}}
 def profile(self,name):return {'name':name,'phone':'','email':'','notes':'','messengers':[{'type':'telegram','username':'fixture_'+name}]}
 def call(self,op,p,**kw):
  type(self).seq+=1
  return self.client.call(op,p,request_key='fixture-key-'+str(self.seq).zfill(16),**kw)
 def plan(self,name):return {'name':name,'arrival':'2027-06-01','departure':'2027-06-04','adults':1,'children':[],'housing':[{'resource':'resident','occupancy':1}],'bathVisits':0}
 def test_staff_crm_and_readbacks(self):
  kw={'telegram_update':self.update()};identity=self.call('identity',{},**kw);self.assertEqual(identity['role'],'hospitality');staff_id=identity['result']['staffId']
  listing=self.call('staff.list',{},**kw)['result'];self.assertIn(staff_id,[x['id']for x in listing['employees']]);self.assertIn('profile',self.call('staff.read',{'id':staff_id},**kw)['result'])
  card=self.call('client.create',{'profile':self.profile('one')},**kw)['result'];other=self.call('client.create',{'profile':self.profile('two')},**kw)['result']
  saved=self.call('client.save',{'id':card['id'],'version':card['version'],'profile':self.profile('edited')},**kw)['result'];self.assertEqual(saved['profile']['messengers'][0]['userId'],'')
  self.assertEqual(self.call('client.read',{'id':card['id']},**kw)['result']['profile'],saved['profile'])
  found=self.call('client.list',{'query':'edited'},**kw)['result'];self.assertIn(card['id'],[x['id']for x in found['clients']])
  version=self.call('catalog',{})['result']['version'];doc=self.call('plan.create',{'kind':'resident','plan':self.plan('edited'),'catalogVersion':version,'clientId':card['id']},**kw)['result']
  self.assertEqual(self.call('plan.connections',{'kind':'resident','id':doc['id']},**kw)['result']['client']['id'],card['id'])
  self.call('plan.link',{'kind':'resident','id':doc['id'],'documentVersion':doc['documentVersion'],'clientId':other['id'],'clientVersion':other['version']},**kw)
  self.assertEqual(self.call('plan.connections',{'kind':'resident','id':doc['id']},**kw)['result']['client']['id'],other['id'])
  fresh=self.call('client.read',{'id':other['id']},**kw)['result'];self.call('client.assign',{'id':other['id'],'version':fresh['version'],'staffId':staff_id},**kw)
  self.assertEqual(self.call('client.read',{'id':other['id']},**kw)['result']['responsible']['id'],staff_id)
  self.assertEqual(self.call('plan.connections',{'kind':'resident','id':doc['id']},**kw)['result']['responsible']['id'],staff_id)
  self.assertIn(doc['id'],[x['id']for x in self.call('plan.list',{'clientId':other['id']},**kw)['result']['plans']])
 def test_site_isolation_and_runner_transport(self):
  site={'route':'guest-site','conversationId':'fixture-source:epoch1:one','receiptId':'11111111-2222-4333-8444-555555555555'};kw={'site_context':site}
  self.assertIsNone(self.call('client.read',{},**kw)['result']);v=self.call('catalog',{})['result']['version'];params={'kind':'resident','plan':self.plan('siteguest'),'catalogVersion':v,'clientProfile':self.profile('siteguest')}
  doc=self.call('plan.create',params,**kw)['result'];card=self.call('client.read',{},**kw)['result'];self.assertEqual(card['profile']['name'],'siteguest');self.assertEqual(self.call('plan.list',{},**kw)['result']['plans'][0]['id'],doc['id'])
  other={**site,'conversationId':'fixture-source:epoch2:one'};self.assertIsNone(self.call('client.read',{},site_context=other)['result'])
  result=self.call('staff.list',{},**kw);self.assertEqual(result['role'],'guest');self.assertTrue(all('profile'not in p for p in result['result']['employees']))
  request={'operation':'client.read','params':{},'siteContext':site,'guest':True}
  r=subprocess.run([sys.executable,'-B',str(ROOT/'src/ostrov-api-runner.py'),'--key-file',self.cfg['keyFile'],'--url',self.cfg['baseUrl'],'--bot-id','8868419301'],input=json.dumps(request),text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stdout);self.assertEqual(json.loads(r.stdout)['result']['id'],card['id'])
  before=len(self.calls());request['siteContext']=None
  r=subprocess.run([sys.executable,'-B',str(ROOT/'src/ostrov-api-runner.py'),'--key-file',self.cfg['keyFile'],'--url',self.cfg['baseUrl'],'--bot-id','8868419301'],input=json.dumps(request),text=True,capture_output=True);self.assertEqual(r.returncode,1);self.assertEqual(len(self.calls()),before)
 def test_guest_staff_claim_does_not_elevate(self):
  before=len(self.calls())
  with self.assertRaises(ClientError):self.call('client.list',{},telegram_update=self.update(),guest=True)
  self.assertEqual(len(self.calls()),before)
if __name__=='__main__':unittest.main()
