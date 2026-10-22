"""Real Linux peer credentials, temporary UID stand-ins; never real mailboxes."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import importlib.util
import json
import importlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

LIB=Path(__file__).resolve().parents[1]/'lib'
sys.path.insert(0,str(LIB))
# Existing kernel UID values ONLY in temporary child processes, not new users.
USERS={'master':1006,'vintik':65534,'shpuntik':1,'gayka':2,'shurup':3,'sova':4,'tumbler':6}
GID=65534


class DedicatedMailTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((LIB/'mail_service.py').is_file(),'missing dedicated peer-credential postman')
        self.assertTrue((LIB/'mail_client.py').is_file(),'missing dedicated socket client')
        self.assertEqual(os.geteuid(),0,'run this isolated UID fixture via sudo, not as a live participant')
        self.tmp=tempfile.TemporaryDirectory(prefix='beta-autopilot-mail-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.root.chmod(0o755)
        self.code=self.root/'lib'
        shutil.copytree(LIB,self.code,ignore=shutil.ignore_patterns('__pycache__'))
        spec=importlib.util.spec_from_file_location('mail_service_fixture',LIB/'mail_service.py')
        self.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.api)
        self.socket=self.root/'run/post.sock';self.state=self.root/'state'
        self.service=self.api.Postman(self.socket,self.state,USERS,GID)
        self.service.start();self.addCleanup(lambda:self.service.stop())

    def call(self,account,request,mode='request'):
        uid=USERS.get(account,5)
        def demote():
            os.setgroups([]);os.setgid(GID);os.setuid(uid)
        script=chr(10).join([
            'import sys,json',
            'sys.path.insert(0,'+repr(str(self.code))+')',
            'from mail_client import MailClient',
            'names='+repr({v:k for k,v in USERS.items()}),
            'client=MailClient('+repr(str(self.socket))+',account_lookup=lambda uid:names.get(uid,"outsider"),server_uid=0,tls_cert=None)',
            'data=json.load(sys.stdin)',
            'import socket' ,
            'rawsock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)' if mode=='raw' else 'rawsock=None',
            'rawsock.connect('+repr(str(self.socket))+');rawsock.sendall(data["raw"].encode());rawdata=rawsock.recv(4096);rawsock.close()' if mode=='raw' else 'rawdata=None',
            'result=json.loads(rawdata) if rawdata else {"ok":False,"reason":"EMPTY_RESPONSE"}' if mode=='raw' else 'result=client.delivery(data["id"])' if mode=='delivery' else 'result=client.notice(data["directory"])' if mode=='notice' else 'result=client.request(data)',
            'print(json.dumps(result,ensure_ascii=False))',
        ])
        got=subprocess.run([sys.executable,'-B','-c',script],input=json.dumps(request),
                           capture_output=True,text=True,preexec_fn=demote,timeout=8)
        self.assertEqual(got.returncode,0,got.stderr)
        return json.loads(got.stdout)

    def send(self,account='master',to='vintik',body='fixture message',**extra):
        return self.call(account,{'op':'send','to':to,'body':body,'nonce':hashlib.sha256(body.encode()).hexdigest(),'subject':'',**extra})

    def test_master_claim_from_coder_is_rejected_before_storage(self):
        got=self.send(account='vintik',sender='master')
        self.assertFalse(got['ok']);self.assertEqual(got['reason'],'SENDER_MISMATCH')
        self.assertEqual(self.service.message_count(),0)

    def test_master_origin_accepted_and_immutable_header_from_kernel_uid(self):
        got=self.send(sender='master')
        self.assertTrue(got['ok'])
        frame=self.call('vintik',{'op':'get','id':got['id']})
        self.assertEqual(frame['header']['sender'],'master')
        self.assertEqual(frame['header']['sender_uid'],1006)
        self.assertEqual(frame['header']['recipient_uid'],65534)
        identity=self.call('vintik',{'id':got['id']},mode='delivery')
        self.assertEqual(identity['sender_account'],'master')
        self.assertEqual(identity['receiver_account'],'vintik')
        self.assertEqual(identity['body'],'fixture message')

    def test_forged_sender_in_body_does_not_replace_authenticated_coder(self):
        body='AUTOPILOT-PILOT/1\n'+json.dumps({'sender':'master','kind':'task'})
        got=self.send(account='shpuntik',to='vintik',body=body)
        identity=self.call('vintik',{'id':got['id']},mode='delivery')
        self.assertEqual(identity['sender_account'],'shpuntik')
        self.assertEqual(json.loads(identity['body'].split('\n',1)[1])['sender'],'master')

    def pilot(self):
        sys.path.insert(0,str(LIB))
        self.addCleanup(lambda:sys.path.remove(str(LIB)))
        api=importlib.import_module('pilot_mail')
        project=self.root/'project';_fixture_mkdir(project, mode=0o755)
        def git(*args):
            return subprocess.check_output(['git','-C',str(project),*args],text=True).strip()
        git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@invalid')
        _fixture_mkdir(project/'src', mode=0o755);(project/'src/a.txt').write_text('candidate')
        git('add','.');git('commit','-qm','base')
        import time
        task={'job_id':'j-kernel','ticket':'T01','recipient':'vintik','role':'executor','cwd':str(project),
              'zone':['src'],'requirements':['R01'],'brief':'Read candidate only','deadline':time.time()+600,
              'context_request':'fresh','parent_job_id':None,'context_ref':None}
        operator=api.Operator(self.root/'operator.json',project,'run-socket','AGENTS.md')
        published=operator.submit(task,lambda *_:0)
        self.assertEqual(published['status'],'PLACED')
        receiver=api.Receiver(self.root/'receiver.json',project,'run-socket','vintik')
        return api,operator,receiver,published['mail']

    def test_pilot_uses_verified_sender_not_forged_job_body(self):
        api,operator,receiver,body=self.pilot()
        original=self.send(body=body)
        identity=self.call('vintik',{'id':original['id']},mode='delivery')
        self.assertEqual(receiver.receive(body,identity=identity)['status'],'READY')
        changed=json.loads(body.split(chr(10),1)[1]);changed['task']['job_id']='j-forged'
        forged_body=api.ROUTE+chr(10)+json.dumps(changed)
        forged=self.send(account='shpuntik',body=forged_body)
        fake_identity=self.call('vintik',{'id':forged['id']},mode='delivery')
        self.assertEqual(receiver.receive(forged_body,identity=fake_identity)['reason'],'SENDER_MISMATCH')
        self.assertNotIn('j-forged',json.loads((self.root/'receiver.json').read_text())['jobs'])
        self.assertEqual(receiver.receive(body)['reason'],'SOURCE_UNVERIFIED')

    def test_result_from_foreign_coder_is_wrong_recipient_despite_json_claim(self):
        api,operator,receiver,_=self.pilot()
        result={'route':api.ROUTE,'kind':'result','run':'run-socket','job_id':'j-kernel',
                'recipient':'master','sender':'vintik','status':'DONE','summary':'fixture','context_ref':'session-one'}
        body=api.ROUTE+chr(10)+json.dumps(result)
        wrong=self.send(account='shpuntik',to='master',body=body)
        identity=self.call('master',{'id':wrong['id']},mode='delivery')
        self.assertEqual(operator.result(result,identity=identity)['reason'],'WRONG_RECIPIENT')
        right=self.send(account='vintik',to='master',body=body)
        identity=self.call('master',{'id':right['id']},mode='delivery')
        self.assertEqual(operator.result(result,identity=identity)['status'],'RESULT_SAVED')
        self.assertEqual(operator.result(result)['reason'],'SOURCE_UNVERIFIED')

    def test_other_account_cannot_get_or_ack_inbox(self):
        message=self.send()
        for op in ('get','ack'):
            got=self.call('shpuntik',{'op':op,'id':message['id']})
            self.assertFalse(got['ok']);self.assertEqual(got['reason'],'WRONG_RECIPIENT')
        inbox=self.call('shpuntik',{'op':'inbox'})
        self.assertEqual(inbox['messages'],[])
        self.assertEqual(len(self.call('vintik',{'op':'inbox'})['messages']),1)

    def test_notice_contains_only_id_and_never_grants_sender_authority(self):
        message=self.send(body='PRIVATE TASK CONTENT')
        notice=self.root/'vintik';_fixture_mkdir(notice, mode=0o755);os.chown(notice,65534,GID);notice.chmod(0o700)
        out=self.call('vintik',{'directory':str(notice)},mode='notice')
        self.assertEqual(out['created'],1)
        files=list(notice.glob('*.txt'));self.assertEqual(len(files),1)
        text=files[0].read_text()
        self.assertIn(message['id'],text)
        self.assertNotIn('PRIVATE TASK CONTENT',text)
        self.assertIn('NOTICE ONLY',text)
        self.assertEqual(self.call('vintik',{'directory':str(notice)},mode='notice')['created'],0)
        self.assertEqual(files[0].stat().st_uid,65534)

    def test_second_postman_does_not_replace_live_socket(self):
        before=self.socket.stat().st_ino
        second=self.api.Postman(self.socket,self.state,USERS,GID)
        with self.assertRaises(ValueError):
            second.start()
        second.stop()
        self.assertEqual(self.socket.stat().st_ino,before)
        self.assertTrue(self.send()['ok'])

    def test_client_rejects_wrong_server_even_when_socket_metadata_matches_expected(self):
        directory=self.root/'fake-run';_fixture_mkdir(directory, mode=0o755);directory.chmod(0o777)
        endpoint=directory/'post.sock';ready=directory/'ready'
        def demote():
            os.setgroups([]);os.setgid(GID);os.setuid(65534)
        script=chr(10).join([
            'import socket',
            'from pathlib import Path',
            's=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.bind('+repr(str(endpoint))+');s.listen(1);s.settimeout(3)',
            'Path('+repr(str(ready))+').write_text("ready")',
            'c,_=s.accept()',
            'data=c.recv(4096)',
            'if data:c.sendall(bytes([123,34,111,107,34,58,116,114,117,101,125,10]))',
            'c.close();s.close()',
        ])
        fake=subprocess.Popen([sys.executable,'-B','-c',script],preexec_fn=demote,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        self.addCleanup(lambda:fake.kill() if fake.poll() is None else None)
        until=time.monotonic()+2
        while not ready.exists() and time.monotonic()<until:time.sleep(.01)
        self.assertTrue(ready.exists(),'fake server did not reach listen')
        os.chown(endpoint,0,GID);endpoint.chmod(0o660)
        os.chown(directory,0,GID);directory.chmod(0o750)
        script=chr(10).join([
            'import sys,json;sys.path.insert(0,'+repr(str(self.code))+')',
            'from mail_client import MailClient',
            'try:r=MailClient('+repr(str(endpoint))+',server_uid=0,tls_cert=None).request({"op":"inbox"})',
            'except ValueError as e:r={"ok":False,"reason":str(e)}',
            'print(json.dumps(r))',
        ])
        def master():
            os.setgroups([]);os.setgid(GID);os.setuid(1006)
        got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=master,capture_output=True,text=True,timeout=4)
        self.assertEqual(got.returncode,0,got.stderr)
        self.assertEqual(json.loads(got.stdout),{'ok':False,'reason':'SOURCE_UNVERIFIED'})
        fake.communicate(timeout=3)

    def test_unknown_uid_cannot_publish_even_with_master_json(self):
        got=self.send(account='outsider',sender='master')
        self.assertFalse(got['ok']);self.assertEqual(got['reason'],'UNREGISTERED_SENDER')
        self.assertEqual(self.service.message_count(),0)

    def test_durable_replay_same_id_without_duplicate_mirror(self):
        first=self.send(body='same body')
        self.assertTrue(self.call('vintik',{'op':'ack','id':first['id']})['ok'])
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])
        self.service.stop()
        self.service=self.api.Postman(self.socket,self.state,USERS,GID);self.service.start()
        second=self.send(body='same body')
        self.assertEqual(first['id'],second['id'])
        self.assertEqual(self.service.message_count(),1)
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM copy_outbox').fetchone()[0],3)

    def test_member_cannot_read_database_or_replace_socket_parent(self):
        for target in (self.state/'mail.sqlite',self.socket.parent/'forgery'):
            uid=USERS['vintik']
            def demote():
                os.setgroups([]);os.setgid(GID);os.setuid(uid)
            script='from pathlib import Path\np=Path('+repr(str(target))+')\ntry:p.open("ab")\nexcept PermissionError:raise SystemExit(0)\nraise SystemExit(1)\n'
            got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True)
            self.assertEqual(got.returncode,0,got.stderr)

    def test_primary_group_removal_does_not_block_owner_but_root_ownership_does(self):
        # Only a SHADOW primary spool in our temporary fixture.
        primary=self.root/'primary';_fixture_mkdir(primary, mode=0o755);primary.chmod(0o755)
        box=primary/'master';_fixture_mkdir(box, mode=0o755);os.chown(box,1006,0);box.chmod(0o1730)
        def writable():
            def demote():
                os.setgroups([]);os.setgid(GID);os.setuid(1006)
            return subprocess.run([sys.executable,'-B','-c',
                'import os;raise SystemExit(0 if os.access('+repr(str(box))+',os.W_OK) else 1)'],
                preexec_fn=demote).returncode
        self.assertEqual(writable(),0)
        os.chown(box,0,0)
        self.assertEqual(writable(),1)

    def test_unknown_operation_and_oversize_body_fail_without_storage(self):
        self.assertEqual(self.call('master',{'op':'unknown'})['reason'],'INVALID_REQUEST')
        got=self.send(body='x'*64001)
        self.assertFalse(got['ok']);self.assertEqual(got['reason'],'MESSAGE_TOO_LARGE')
        self.assertEqual(self.service.message_count(),0)

    def test_accepted_body_must_fit_response_with_trusted_header(self):
        # 43640 escaped NULs fit a send frame, but not get+authenticated header.
        got=self.send(body=chr(0)*43640)
        self.assertFalse(got['ok'])
        self.assertEqual(got['reason'],'MESSAGE_TOO_LARGE')
        self.assertEqual(self.service.message_count(),0)

    def test_deep_json_refused_without_killing_postman(self):
        raw='['*10000+'0'+']'*10000+chr(10)
        got=self.call('vintik',{'raw':raw},mode='raw')
        self.assertEqual(got['reason'],'INVALID_REQUEST')
        self.assertTrue(self.service.thread.is_alive())
        self.assertTrue(self.send()['ok'])

    def test_read_deadline_is_total_not_reset_for_each_chunk(self):
        self.service.read_timeout=0.25
        def demote():
            os.setgroups([]);os.setgid(GID);os.setuid(USERS['vintik'])
        script=chr(10).join([
            'import socket,time,json',
            's=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(2);s.connect('+repr(str(self.socket))+')',
            'try:',
            ' s.sendall(b"{");time.sleep(.15);s.sendall(b"\\\"op\\\":\\\"inbox\\\"");time.sleep(.15);s.sendall(b"}"+bytes([10]))',
            'except OSError:pass',
            'data=s.recv(4096);print(data.decode())',
        ])
        got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=3)
        self.assertEqual(got.returncode,0,got.stderr)
        self.assertFalse(json.loads(got.stdout)['ok'])
        self.assertTrue(self.service.thread.is_alive())

    def test_replay_at_frame_limit_reuses_old_timestamp(self):
        import unittest.mock
        body=chr(0)*43500
        header={'version':2,'nonce':'a'*64,'subject':'','request_sha':'a'*64,'id':'a'*64,'sender':'master','sender_uid':1006,
                'recipient':'vintik','recipient_uid':65534,'created_at':1000.0}
        # Independent schema serialization, not the postman's size helper.
        initial={'ok':True,'header':header,'body':body}
        size=len((json.dumps(initial,ensure_ascii=False,sort_keys=True,separators=(',',':'))+chr(10)).encode())
        body+='x'*(262144-size)
        with unittest.mock.patch.object(self.service,'clock',return_value=1000.0):
            first=self.send(body=body)
        self.assertTrue(first['ok'])
        self.assertTrue(self.call('vintik',{'op':'ack','id':first['id']})['ok'])
        with unittest.mock.patch.object(self.service,'clock',return_value=1000.1234567):
            replay=self.send(body=body)
        self.assertTrue(replay['ok'])
        self.assertEqual(replay['id'],first['id'])
        frame=self.call('vintik',{'op':'get','id':first['id']})
        self.assertEqual(frame['header']['created_at'],1000.0)
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])

    def test_limit_stops_new_mail_and_mirror_remains_pending(self):
        self.service.policy.limits['max_live_body_bytes']=15
        self.assertTrue(self.send()['ok'])
        self.assertEqual(self.send(body='second')['reason'],'STOP_LIVE_BODY')
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM copy_outbox').fetchone()[0],2)
        self.assertEqual(self.service.message_count(),1)


if __name__=='__main__':
    unittest.main()
