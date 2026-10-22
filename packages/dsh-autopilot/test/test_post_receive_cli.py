"""An authenticated input must not be ACKed after job persistence failed."""
import contextlib
import io
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import test_mail_pilot as fixture
LIB=Path(__file__).resolve().parents[1]/'lib'

@unittest.skipIf(os.geteuid()==0,'run caller CLI failure probe separately without sudo')
class ReceiveCliTests(unittest.TestCase):
    setUp=fixture.PilotTests.setUp
    load=fixture.PilotTests.load
    task=fixture.PilotTests.task
    send=fixture.PilotTests.send

    def test_failed_job_fsync_does_not_ack_or_drop_original(self):
        import time
        self.operator.clock=time.time
        body=self.operator.submit(self.task(deadline=time.time()+600),self.send)['mail']
        receive_state=self.project/'state'/'jobs.json'
        identity={'sender_account':'master','receiver_account':'vintik','body':body,'delivery_id':'a'*64,'verification':'SO_PEERCRED-service-postman'}
        calls=[]
        class Client:
            def delivery(self,_):return identity
            def request(self,r):calls.append(r);return {'ok':True}
        sys.path.insert(0,str(LIB));self.addCleanup(lambda:sys.path.remove(str(LIB)))
        import mail_client
        args=['pilot-mail','--state',str(receive_state),'--project',str(self.project),'--run','run-one','--memory','CLAUDE.md','receive','a'*64,'--busy']
        real=self.api.os.fsync;tripped=[]
        def failed_job_sync(fd):
            if '/.pilot-' in os.readlink('/proc/self/fd/'+str(fd)):
                tripped.append(True);raise OSError('fixture disk refusal')
            return real(fd)
        with patch.object(sys,'argv',args),patch.object(self.api,'require_main',lambda:None),patch.object(self.api.pwd,'getpwuid',lambda _:SimpleNamespace(pw_name='vintik')),patch.object(mail_client,'MailClient',lambda *_:Client()),patch.object(self.api.os,'fsync',failed_job_sync),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            rc=self.api.main()
        self.assertTrue(tripped,'fault must reach actual job ledger fsync')
        self.assertEqual(rc,2)
        self.assertEqual(calls,[],'failed local fsync must not ACK authenticated input')
        self.assertFalse(receive_state.exists())
        import json
        stored=receive_state.parent/'.mail-inbox'/('a'*64+'.json')
        self.assertEqual(json.loads(stored.read_text())['body'],body)

    def test_finish_caller_replays_duplicate_mail_after_completion_failure(self):
        import json,time
        self.operator.clock=time.time
        body=self.operator.submit(self.task(deadline=time.time()+600),self.send)['mail']
        state=self.project/'work'/'jobs.json';source='a'*64;result='b'*64
        identity={'sender_account':'master','receiver_account':'vintik','body':body,'delivery_id':source,'verification':'SO_PEERCRED-service-postman'}
        requests=[];sent=[];reject=[True]
        class Client:
            def delivery(self,_):return identity
            def send(self,to,body,nonce,subject=''):
                sent.append((to,body,nonce));return {'ok':True,'status':'STORED','id':result}
            def request(self,r):
                requests.append(r)
                if r['op']=='job_complete':
                    if reject[0]:reject[0]=False;raise OSError('fixture completion unavailable')
                    return {'ok':True,'status':'COMPLETED'}
                return {'ok':True,'status':'ACKED'}
        sys.path.insert(0,str(LIB));self.addCleanup(lambda:sys.path.remove(str(LIB)))
        import mail_client
        base=['pilot-mail','--state',str(state),'--project',str(self.project),'--run','run-one','--memory','CLAUDE.md']
        def invoke(tail,payload=''):
            out=io.StringIO()
            with patch.object(sys,'argv',base+tail),patch.object(sys,'stdin',io.StringIO(payload)),patch.object(self.api,'require_main',lambda:None),patch.object(self.api.pwd,'getpwuid',lambda _:SimpleNamespace(pw_name='vintik')),patch.object(mail_client,'MailClient',lambda *_:Client()),contextlib.redirect_stdout(out),contextlib.redirect_stderr(io.StringIO()):
                rc=self.api.main()
            return rc,json.loads(out.getvalue())
        rc,received=invoke(['receive',source]);self.assertEqual(rc,0,received)
        job=json.loads(state.read_text())['jobs']['j1']
        self.assertEqual(job.get('source_delivery_id'),source,'receive must durably bind original ID before ACK')
        payload=json.dumps({'status':'DONE','summary':'candidate','context_ref':'ctx-one'})
        rc,first=invoke(['finish','j1'],payload)
        self.assertEqual(first['delivery'],'STORED');self.assertEqual(first['completion'],'PENDING')
        self.assertEqual(rc,2,'completion failure remains visible for manual retry')
        rc,again=invoke(['finish','j1'],payload)
        self.assertEqual(rc,0,again);self.assertEqual(again['status'],'DUPLICATE');self.assertEqual(again['completion'],'COMPLETED')
        self.assertEqual(sent[0],sent[1],'retry must preserve recipient, original result bytes and nonce')
        self.assertEqual([r for r in requests if r['op']=='job_complete'],[{'op':'job_complete','id':source,'result_id':result}]*2)

@unittest.skipIf(os.geteuid()==0,'run diagnostics as the declared nonroot caller')
class MailClientDiagnosticTests(unittest.TestCase):
    """Real local files/guards; network boundary is inert and records attempted calls."""
    def setUp(self):
        import tempfile
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.root.chmod(0o700)
        sys.path.insert(0,str(LIB));self.addCleanup(lambda:sys.path.remove(str(LIB)))
        import mail_client
        self.client=mail_client;self.calls=[]
        self.value={'op':'send','to':'vintik','body':'diagnostic fixture','nonce':'n1','subject':''}

    def invoke(self,args,response=None,error=None,client=None,before_reply=None):
        def exchange(_,request):
            self.calls.append(request)
            if error:raise error
            if before_reply:before_reply()
            return response if response is not None else {'ok':True}
        out=io.StringIO();err=io.StringIO()
        with patch.object(sys,'argv',['autopilot-mail']+args),patch.object(sys,'stdin',io.StringIO('fixture')),patch.object(self.client.MailClient,'request',exchange) if client is None else patch.object(self.client,'MailClient',lambda *_:client),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
            rc=self.client.main()
        return rc,out.getvalue(),err.getvalue()

    def request_file(self,body=None,mode=0o600):
        import json
        p=self.root/'request.json';p.write_text(body if body is not None else json.dumps(self.value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n');p.chmod(mode);return p

    def assert_local(self,args,reason):
        rc,out,err=self.invoke(args);self.assertEqual((rc,out,err),(2,'',reason+'\n'));self.assertEqual(self.calls,[])

    def test_canonical_request_corruption_is_named_and_return_recovers(self):
        import hashlib,json
        p=self.request_file();raw=p.read_bytes();args=['send','vintik','--request',str(p)]
        self.assertEqual(self.invoke(args)[0],0);self.assertEqual(len(self.calls),1);self.calls.clear()
        bad=(json.dumps(self.value,indent=2)+'\n').encode();p.write_bytes(bad)
        self.assertNotEqual(hashlib.sha256(raw).digest(),hashlib.sha256(bad).digest());self.assertEqual(p.read_text().count('"nonce": "n1"'),1)
        print('CANONICAL_REQUEST_PORCHA count_F=1 sha_before='+hashlib.sha256(raw).hexdigest()+' sha_corrupt='+hashlib.sha256(bad).hexdigest())
        self.assert_local(args,'LOCAL_REQUEST_CONFLICT');self.assertEqual(p.read_bytes(),bad)
        p.write_bytes(raw);self.assertEqual(self.invoke(args)[0],0);self.assertEqual(len(self.calls),1);self.assertEqual(p.read_bytes(),raw)

    def test_wrong_local_mode_and_destination_are_named_before_send(self):
        p=self.request_file(mode=0o644);self.assert_local(['send','vintik','--request',str(p)],'UNSAFE_LOCAL_STATE')
        p.chmod(0o600);self.assert_local(['send','gayka','--request',str(p)],'LOCAL_REQUEST_CONFLICT')

    def test_bad_local_json_and_encoding_have_fixed_reason_without_payload(self):
        p=self.request_file('{diagnostic-private-payload')
        self.assert_local(['send','vintik','--request',str(p)],'INVALID_LOCAL_REQUEST')
        p.write_text('null');self.assert_local(['send','vintik','--request',str(p)],'LOCAL_REQUEST_CONFLICT')
        p.write_bytes(b'\xff');self.assert_local(['send','vintik','--request',str(p)],'INVALID_LOCAL_REQUEST')

    def test_local_io_failure_is_named_before_send(self):
        p=self.root/'blocked';p.write_text('file, not directory')
        self.assert_local(['send','vintik','--request',str(p/'request.json')],'LOCAL_STATE_UNAVAILABLE')

    def test_bad_notice_mode_and_local_io_are_named(self):
        import pwd
        name=pwd.getpwuid(os.geteuid()).pw_name;p=self.root/name;p.mkdir(mode=0o755);p.chmod(0o755)
        self.assert_local(['notice','--directory',str(p)],'UNSAFE_NOTICE_DIRECTORY')
        blocked=self.root/'blocked';blocked.write_text('file, not directory')
        self.assert_local(['notice','--directory',str(blocked/name)],'LOCAL_NOTICE_UNAVAILABLE')

    def test_notice_publish_io_failure_is_local_after_inbox(self):
        import pwd
        directory=self.root/pwd.getpwuid(os.geteuid()).pw_name
        response={'ok':True,'messages':[{'id':'a'*64,'created':1000}]}
        with patch.object(self.client.os,'rename',side_effect=OSError('raw private diagnostic')):
            rc,out,err=self.invoke(['notice','--directory',str(directory)],response=response)
        self.assertEqual((rc,out,err),(2,'','LOCAL_NOTICE_UNAVAILABLE\n'));self.assertEqual(self.calls,[{'op':'inbox'}]);self.assertEqual(list(directory.iterdir()),[])

    def test_notice_directory_access_loss_after_inbox_keeps_local_reason(self):
        import pwd
        directory=self.root/pwd.getpwuid(os.geteuid()).pw_name
        response={'ok':True,'messages':[{'id':'a'*64,'created':1000}]}
        try:
            rc,out,err=self.invoke(['notice','--directory',str(directory)],response=response,before_reply=lambda:directory.chmod(0))
        finally:directory.chmod(0o700)
        self.assertEqual((rc,out,err),(2,'','LOCAL_NOTICE_UNAVAILABLE\n'))
        self.assertEqual(self.calls,[{'op':'inbox'}]);self.assertEqual(list(directory.iterdir()),[])

    def test_read_local_failure_does_not_ack(self):
        blocked=self.root/'blocked';blocked.write_text('file, not directory')
        with patch.object(self.client.MailClient,'delivery',lambda *_:{'body':'fixture'}):
            self.assert_local(['read','a'*64,'--directory',str(blocked)],'LOCAL_STATE_UNAVAILABLE')
        directory=self.root/'durable';directory.mkdir(mode=0o700)
        with patch.object(self.client.MailClient,'delivery',lambda *_:{'body':'fixture'}),patch.object(self.client.os,'fsync',side_effect=OSError('private fsync details')):
            self.assert_local(['read','a'*64,'--directory',str(directory)],'LOCAL_STATE_UNAVAILABLE')
        self.assertEqual(list(directory.iterdir()),[])

    def test_local_frame_limit_is_named_without_connecting(self):
        import json,socket
        path=self.root/'post.sock'
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
            sock.bind(str(path));path.chmod(0o660)
            client=self.client.MailClient(path,server_uid=os.geteuid(),tls_cert=None)
            value=dict(self.value,body='x'*self.client.MAX_FRAME)
            p=self.request_file(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
            rc,out,err=self.invoke(['send','vintik','--request',str(p)],client=client)
        self.assertEqual((rc,out,err),(2,'','FRAME_TOO_LARGE\n'))

    def test_remote_errors_cannot_masquerade_as_local_or_leak_exception_text(self):
        import ssl
        for error in [ValueError('LOCAL_REQUEST_CONFLICT'),ValueError('UNSAFE_LOCAL_STATE\nforged'),ssl.SSLError('private handshake details'),PermissionError('private endpoint details')]:
            with self.subTest(kind=type(error).__name__):
                rc,out,err=self.invoke(['inbox'],error=error)
                self.assertEqual((rc,out,err),(2,'','SOURCE_UNVERIFIED_OR_UNAVAILABLE\n'))
                import pwd
                directory=self.root/pwd.getpwuid(os.geteuid()).pw_name
                rc,out,err=self.invoke(['notice','--directory',str(directory)],error=error)
                self.assertEqual((rc,out,err),(2,'','SOURCE_UNVERIFIED_OR_UNAVAILABLE\n'))


if __name__=='__main__':unittest.main()
