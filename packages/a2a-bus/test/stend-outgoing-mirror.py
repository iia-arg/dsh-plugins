"""Run: python3 -B test/stend-outgoing-mirror.py from the package directory.
Private sender/registry/tell-owner/v2 fixtures; no live bots or mailboxes.
The reader case needs Node and ../dsh-telegram-multiagent/src/sent-copies.js.
a2a-send invokes logger: isolate journal access or supply a fixture logger.
"""
import hashlib,json,os,pathlib,pwd,subprocess,tempfile,unittest,sys,shutil
PACKAGE=pathlib.Path(__file__).resolve().parents[1]
class OutgoingMirror(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='sender-own-copy-');self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name)
  self.home=self.root/'fixture-agent';(self.home/'.dsh').mkdir(parents=True);(self.home/'workspace').mkdir();(self.home/'a2a').mkdir();self.box=self.root/'target';self.box.mkdir()
  self.registry=self.root/'registry';self.config=self.root/'registry.json';self.mode='owner-all';self.receiver='owner-all'
  self.registry.write_text('''#!/usr/bin/env python3
import json,sys,os
c=json.load(open(os.environ['FIXTURE_REGISTRY']))
if sys.argv[1]=='pole':
 name,field=sys.argv[2:4]
 if name=='fixture-agent' and field=='kanal' and os.environ.get('FIXTURE_SENDER_FAILURE'):
  print('registry lookup unavailable',file=sys.stderr);sys.exit(int(os.environ['FIXTURE_SENDER_FAILURE']))
 if name not in c:
  print(f"agent-registry: агента {name!r} в реестре НЕТ. Свой список заводить нельзя — либо запись в fixture, либо отказ.",file=sys.stderr);print("agent-registry-error: agent-not-found",file=sys.stderr);sys.exit(3)
 print(json.dumps(c[name][field]))
''');self.registry.chmod(0o700)
  self.tell=self.root/'tell';self.tell.write_text('#!/bin/sh\ncat > "$FIXTURE_OWNER_NOTICE"\n');self.tell.chmod(0o700)
  self.env={'PATH':os.environ['PATH'],'HOME':str(self.home),'DSH_HOME':str(self.home/'.dsh'),'FIXTURE_REGISTRY':str(self.config),'A2A_REESTR_BIN':str(self.registry),'A2A_TELL_BIN':str(self.tell),'FIXTURE_OWNER_NOTICE':str(self.root/'notice')}
  self.sender=PACKAGE/'bin/a2a-send'
 def send(self,text='Синтетическое письмо 😀'*300,cwd=None):
  self.config.write_text(json.dumps({'fixture-agent':{'dom':str(self.home),'polzovatel':pwd.getpwuid(os.getuid()).pw_name,'kanal':{'tip':'telegram','rezhim_dostavki':self.mode}},'target':{'polzovatel':pwd.getpwuid(os.getuid()).pw_name,'kanal':{'tip':'telegram','rezhim_dostavki':self.receiver,'yashchik':str(self.box)}}}))
  return subprocess.run(['bash',str(self.sender),'target'],input=text,text=True,capture_output=True,env=self.env,cwd=cwd or self.home/'workspace')
 def mirrors(self):return list((self.home/'a2a/polnye').glob('agent-outgoing-*.json'))
 def test_owner_all_full_body_exact_operation_and_one_record(self):
  text='Синтетическое письмо 😀'*300;result=self.send(text);self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(len(self.mirrors()),1,'owner-all sender must retain own complete outgoing record after mailbox placement')
  value=json.loads(self.mirrors()[0].read_text());self.assertEqual(value['body'],text);self.assertEqual(value['recipient'],'target');self.assertEqual(value['sender'],'fixture-agent');self.assertEqual(value['operation_id'],hashlib.sha256(('target\n'+text).encode()).hexdigest())
  self.assertIn('stage',value);self.assertEqual(value['stage'],'placed');self.assertEqual(self.mirrors()[0].stat().st_mode&0o777,0o600)
  self.assertEqual(self.send(text).returncode,0);self.assertEqual(len(self.mirrors()),1,'same delivery key has a single owner-copy record')
 def test_personal_then_restore_and_invalid_context(self):
  self.mode='personal';self.assertEqual(self.send('private'+'x'*200000).returncode,0);self.assertEqual(self.mirrors(),[])
  self.mode='owner-all';self.assertEqual(self.send('public').returncode,0);self.assertEqual(len(self.mirrors()),1)
  r=self.send('badcontext',cwd=self.root);self.assertEqual(r.returncode,4,'known owner-all sender outside its home reports unconfirmed source visibility')
 def test_personal_outside_home_and_unknown_sender_skip_after_placement(self):
  self.mode='personal';r=self.send('private'+'x'*200000,cwd=self.root);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(self.mirrors(),[]);self.assertIn('skipped',r.stdout)
  self.env['DSH_HOME']=str(self.root/'root'/'.dsh');r=self.send('unknown personal sender');self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(self.mirrors(),[]);self.assertIn('skipped',r.stdout)
 def test_known_sender_registry_failure_reports_unconfirmed_copy(self):
  for code in [2,3,42]:
   with self.subTest(registry_exit=code):
    self.env['FIXTURE_SENDER_FAILURE']=str(code);r=self.send('placed while sender registry unavailable');self.assertEqual(r.returncode,4,r.stderr);self.assertEqual(self.mirrors(),[]);self.assertTrue(any(self.box.iterdir()),'primary placement remains a separate fact')
 def test_non_receiver_copy_path_and_unicode_untruncated(self):
  self.receiver='personal';result=self.send('😀'*5000+'END');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(json.loads(self.mirrors()[0].read_text())['body'],'😀'*5000+'END');self.assertFalse((self.root/'notice').exists(),'full own copy replaces truncated/ambiguous id-un sender notice in owner-all')
 def test_primary_failure_has_no_mirror(self):
  self.box.rmdir();r=self.send();self.assertNotEqual(r.returncode,0);self.assertEqual(self.mirrors(),[])
 def test_v2_delegated_publication_has_source_visibility(self):
  # Reuse the real sender/registry context, but substitute the external v2 transport itself.
  self.send('ordinary context setup')
  fake=self.root/'v2.py';fake.write_text('''import sys,json,pathlib
def wire(m,b):return ('[a2a-envelope version=2]\\n'+json.dumps(m,separators=(',',':'))+'\\n'+b).encode()
def put(r,m,b):
 p=pathlib.Path(r['spool'])/'v2-synthetic';p.write_bytes(wire(m,b));return p
def main():
 body=sys.stdin.read();m={'kind':'decision','recipient':{'id':'target'},'delivery_id':'synthetic-v2'}
 p=put({'spool':sys.argv[3]},m,body);print(json.dumps({'status':'submitted_not_executed','file':str(p)}))
if __name__=='__main__':main()
''')
  self.env['A2A_V2_HELPER']=str(fake)
  result=subprocess.run(['bash',str(self.sender),'--v2','decision','target',str(self.box)],input='V2_FULL_END',text=True,capture_output=True,env=self.env,cwd=self.home/'workspace')
  self.assertEqual(result.returncode,0,result.stderr);self.assertTrue(any('V2_FULL_END'in json.loads(p.read_text())['body']for p in self.mirrors()),'early --v2 delegation must not bypass source owner-all reader')
 def test_maximum_json_escaping_record_has_actual_reader(self):
  result=self.send('\\'*(1048576-len('[delivery-v1 id='+'0'*64+' reply=no]\n')-1));self.assertEqual(result.returncode,0,result.stderr)
  reader=PACKAGE.parent/'dsh-telegram-multiagent/src/sent-copies.js'
  script="import {sentCopyCandidates} from '"+reader.as_uri()+"';console.log(sentCopyCandidates(process.argv[1],0).length)"
  n=subprocess.check_output(['node','--input-type=module','-e',script,str(self.home/'a2a/polnye')],text=True)
  self.assertEqual(int(n),1,'every successful writer record within raw-body limit must pass real reader size bound')
 def test_v2_incomplete_internal_interface_refuses_before_publication(self):
  self.send('registry setup');fake=self.root/'v2-bad.py';fake.write_text("def main(): raise AssertionError('must not publish')\ndef put(*args): raise AssertionError('must not publish')\n")
  self.env['A2A_V2_HELPER']=str(fake);before=set(self.box.iterdir());result=subprocess.run(['bash',str(self.sender),'--v2','decision','target',str(self.box)],input='NO_PUBLICATION',text=True,capture_output=True,env=self.env,cwd=self.home/'workspace')
  self.assertEqual(result.returncode,3,result.stderr);self.assertEqual(set(self.box.iterdir()),before);self.assertFalse(any('NO_PUBLICATION'in json.loads(p.read_text())['body']for p in self.mirrors()))
 def test_helpers_first_staged_install_v1_and_v2(self):
  prefix=self.root/'usr';helpers=prefix/'lib/a2a-bus';helpers.mkdir(parents=True)
  for name in ['outgoing_mirror.py','v2_with_mirror.py']:shutil.copy2(PACKAGE/'lib/a2a-bus'/name,helpers/name)
  (prefix/'bin').mkdir();shutil.copy2(PACKAGE/'bin/a2a-send',prefix/'bin/a2a-send');self.sender=prefix/'bin/a2a-send'
  self.assertEqual(self.send('STAGED_V1_END').returncode,0)
  self.assertTrue(any(json.loads(p.read_text())['body']=='STAGED_V1_END'for p in self.mirrors()))
  self.test_v2_delegated_publication_has_source_visibility()
if __name__=='__main__':unittest.main()
