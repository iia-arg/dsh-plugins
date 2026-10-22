"""Guard before the network boundary; fixture tokens never reach Telegram."""
import contextlib
import importlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import test_post_copies as fixtures

class CopyTransportTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((fixtures.fixture.LIB/'mail_copy_worker.py').exists(),'missing guarded copy worker')
        self.w=importlib.import_module('mail_copy_worker');self.cfg=fixtures.config();self.calls=[]
        self.tokens={a:b['bot_user_id']+':'+('X'*35) for a,b in self.cfg['bots'].items()}
        def network(token,method,payload):self.calls.append((method,payload));return {'ok':True,'result':{'message_id':42}}
        self.addCleanup(lambda:print('NETWORK_WITNESS '+json.dumps(self.calls,ensure_ascii=False)))
        self.transport=self.w.TelegramTransport(self.cfg,self.tokens,network=network)
    def test_only_send_message_and_configured_chat_reach_network(self):
        for method in ['getUpdates','getMe','setWebhook','deleteWebhook','forwardMessage','editMessageText','deleteMessage','SendMessage','sendMessage?x=1','../getUpdates']:
            with self.assertRaises(ValueError):self.transport.publish('vintik',method,'-5388098055','test')
        for chat in ['42','@channel','-05388098055',True,{},'-5388098055/other']:
            with self.assertRaises(ValueError):self.transport.publish('vintik','sendMessage',chat,'test')
        self.assertEqual(self.calls,[],'denial must happen before network')
        self.assertEqual(self.transport.denied_count,16)
        self.assertEqual(self.transport.publish('vintik','sendMessage','-5388098055','test')['outcome'],'sent')
        self.assertEqual(len(self.calls),1)
        self.assertNotIn('parse_mode',self.calls[0][1]);self.assertIs(self.calls[0][1]['link_preview_options']['is_disabled'],True)
    def test_text_envelope_refuses_empty_or_over_3500_without_network(self):
        for text in ['', '😀'*1751, 'A'*3501]:
            with self.assertRaises(ValueError):self.transport.publish('vintik','sendMessage','-5388098055',text)
        self.assertEqual(self.calls,[])
        self.assertEqual(self.transport.publish('vintik','sendMessage','-5388098055','A'*3500)['outcome'],'sent')

    def test_ambiguous_network_and_429_are_normalized_without_exception_secrets(self):
        def fail(*args):raise OSError(self.tokens['vintik'])
        self.transport.network=fail
        self.assertEqual(self.transport.publish('vintik','sendMessage','-5388098055','test')['outcome'],'unknown')
        self.transport.network=lambda *args:{'ok':False,'error_code':429,'parameters':{'retry_after':60}}
        self.assertEqual(self.transport.publish('vintik','sendMessage','-5388098055','test'),{'outcome':'failed','retry_after':60,'message_id':None})
    def test_malformed_429_is_named_and_uses_default_bounded_retry(self):
        self.transport.network=lambda *args:{'ok':False,'error_code':429,'parameters':{'retry_after':'60'}}
        log=io.StringIO()
        with contextlib.redirect_stderr(log):result=self.transport.publish('vintik','sendMessage','-5388098055','test')
        self.assertEqual(result,{'outcome':'failed','retry_after':None,'message_id':None});self.assertIn('COPY_INVALID_RETRY_AFTER',log.getvalue())

    @unittest.skipUnless(os.geteuid()==0,'isolated root-owned token fixture')
    def test_startup_rejects_foreign_bot_key_and_never_prints_key_or_parts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);root.chmod(0o750)
            self.enterContext(patch.object(self.w.grp,'getgrnam',return_value=SimpleNamespace(gr_gid=os.getegid())))
            for actor,token in self.tokens.items():
                path=root/(actor+'.token');path.write_text(token+'\n');path.chmod(0o640);self.cfg['bots'][actor]['token_file']=str(path)
            self.assertEqual(self.w.load_tokens(self.cfg),self.tokens)
            bad=root/'vintik.token';bad.write_text(self.tokens['gayka'])
            output=io.StringIO()
            with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
                with self.assertRaisesRegex(ValueError,'vintik') as caught:self.w.load_tokens(self.cfg)
            log=output.getvalue()+str(caught.exception)
            for token in self.tokens.values():
                self.assertNotIn(token,log);self.assertNotIn(token.split(':')[0],log);self.assertNotIn(token.split(':')[1],log)
            bad.write_text(self.tokens['vintik']);os.chown(bad,-1,65534)
            with self.assertRaises(ValueError):self.w.load_tokens(self.cfg)
            os.chown(bad,-1,os.getegid());bad.chmod(0o644)
            with self.assertRaises(ValueError):self.w.load_tokens(self.cfg)
    def test_worker_consumes_queue_claim_and_persists_normalized_result(self):
        # Network-only fake. The queue integration is exercised in CopyTests separately.
        class Client:
            def __init__(self):self.saved=[]
            def request(self,req):
                if req['op']=='copy_claim':return {'ok':True,'publication':{'claim':'a'*32,'actor':'vintik','chat_id':'-5388098055','body':'frozen'}}
                self.saved.append(req);return {'ok':True}
        client=Client();worker=self.w.CopyWorker(client,self.transport)
        self.assertTrue(worker.step());self.assertEqual(client.saved,[{'op':'copy_result','claim':'a'*32,'outcome':'sent','retry_after':None,'message_id':42}])

if __name__=='__main__':unittest.main()
