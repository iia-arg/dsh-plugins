"""Real Unix/TLS/kernel namespace regression; disposable mail database only."""
import json
import hashlib
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest

LIB=Path(__file__).resolve().parents[1]/'lib'
sys.path.insert(0,str(LIB))
from mail_client import MailClient
from mail_service import Postman


def certificate(directory,name):
    key=directory/(name+'.key');cert=directory/(name+'.pem')
    subprocess.run(['openssl','req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256',
        '-nodes','-days','1','-subj','/CN=autopilot-mail.internal',
        '-addext','subjectAltName=DNS:autopilot-mail.internal',
        '-addext','basicConstraints=critical,CA:FALSE',
        '-addext','extendedKeyUsage=serverAuth','-keyout',str(key),'-out',str(cert)],
        check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    key.chmod(0o600);cert.chmod(0o644)
    return cert,key


class MailTLSTests(unittest.TestCase):
    def setUp(self):
        self.assertEqual(os.geteuid(),0,'isolated UID fixture requires root')
        self.tmp=tempfile.TemporaryDirectory(prefix='ap-tls-');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.root.chmod(0o755)
        self.cert,self.key=certificate(self.root,'server')
        self.socket=self.root/'run/post.sock'
        # Coders UID is retained in the synthetic user namespace, as in DSH bwrap.
        import pwd
        self.actor=pwd.getpwnam('coders')
        self.users={'master':self.actor.pw_uid,'vintik':65534,'shpuntik':1,'gayka':2,'shurup':3,'sova':4,'tumbler':6}

    def client(self,request,*,namespace=False,cert=None):
        script='\n'.join([
            'import sys,json,os,socket,struct',
            'sys.path.insert(0,'+repr(str(LIB))+')',
            'from mail_client import MailClient',
            'names='+repr({uid:name for name,uid in self.users.items()}),
            'c=MailClient('+repr(str(self.socket))+',account_lookup=lambda uid:names[uid],server_uid=0,tls_cert='+repr(str(cert or self.cert))+')',
            'request=json.loads(sys.argv[1])',
            'result=c.delivery(request["id"]) if request["op"]=="delivery" else c.request(request)',
            'print(json.dumps(result))'])
        def demote():
            os.setgroups([self.actor.pw_gid]);os.setgid(self.actor.pw_gid);os.setuid(self.actor.pw_uid)
        argv=[sys.executable,'-B','-c',script,json.dumps(request)]
        if namespace:argv=['bwrap','--unshare-user','--ro-bind','/','/','--proc','/proc','--dev','/dev','--',*argv]
        # LIB is in the public /var/tmp fixture copy when the suite runs.
        return subprocess.run(argv,preexec_fn=demote,capture_output=True,text=True,timeout=10)

    def start(self):
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.minimum_version=ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(self.cert,self.key)
        self.service=Postman(self.socket,self.root/'state',self.users,self.actor.pw_gid,tls_context=ctx)
        self.addCleanup(self.service.stop);self.service.start()

    def test_namespace_inbox_and_delivery_keep_kernel_actor_and_recipient(self):
        # Break caught: relying on mapped service UID instead of authenticating TLS.
        self.start()
        sent=self.service.handle('vintik',65534,{'op':'send','to':'master','body':'synthetic 🦉','nonce':'tls-one','subject':'fixture'})
        got=self.client({'op':'inbox'},namespace=True)
        self.assertEqual(got.returncode,0,got.stderr)
        self.assertEqual(len(json.loads(got.stdout)['messages']),1)
        delivered=self.client({'op':'delivery','id':sent['id']},namespace=True)
        self.assertEqual(delivered.returncode,0,delivered.stderr)
        self.assertEqual(json.loads(delivered.stdout)['body'],'synthetic 🦉')
        self.assertEqual(json.loads(delivered.stdout)['receiver_account'],'master')
        bad=self.service.handle('shpuntik',1,{'op':'get','id':sent['id']})
        self.assertEqual(bad,{'ok':False,'reason':'WRONG_RECIPIENT'})

    def test_foreign_certificate_refuses_before_any_request_and_recovers(self):
        # Break caught: CERT_NONE, trust from the endpoint or plaintext fallback.
        self.start()
        green=self.client({'op':'inbox'},namespace=True)
        self.assertEqual(green.returncode,0,green.stderr)
        other,_=certificate(self.root,'other')
        before=hashlib.sha256(self.cert.read_bytes()).hexdigest()
        after=hashlib.sha256(other.read_bytes()).hexdigest()
        self.assertNotEqual(before,after)
        print('DAMAGE selected trust certificate count=1 SHA '+before+' -> '+after,flush=True)
        failed=self.client({'op':'send','to':'vintik','body':'MUST_NOT_STORE','nonce':'secret'},namespace=True,cert=other)
        self.assertNotEqual(failed.returncode,0)
        self.assertEqual(self.service.message_count(),0)
        good=self.client({'op':'inbox'},namespace=True)
        self.assertEqual(good.returncode,0,good.stderr)
        print('RESTORED trust certificate SHA '+before,flush=True)

    def test_plaintext_impostor_never_receives_request_body(self):
        # Break caught: sendall(request) before handshake or downgrade after TLS error.
        self.socket.parent.mkdir(mode=0o750);os.chown(self.socket.parent,0,self.actor.pw_gid)
        listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.addCleanup(listener.close)
        listener.bind(str(self.socket));self.socket.chmod(0o660);os.chown(self.socket,0,self.actor.pw_gid)
        listener.listen(1);listener.settimeout(5);seen=[]
        def fake():
            c,_=listener.accept()
            with c:
                c.settimeout(3);seen.append(c.recv(262144));c.sendall(b'{"ok":true}\n')
        thread=threading.Thread(target=fake);thread.start()
        got=self.client({'op':'send','to':'vintik','body':'REQUEST_BODY_MUST_NOT_LEAK','nonce':'n'},namespace=True)
        thread.join(5);self.assertFalse(thread.is_alive());self.assertNotEqual(got.returncode,0)
        self.assertTrue(seen)
        self.assertNotIn(b'REQUEST_BODY_MUST_NOT_LEAK',b''.join(seen))
        self.assertNotIn(b'"op"',b''.join(seen))

    def test_tls_send_retry_ack_and_durable_read(self):
        # Break caught: TLS refactor changes framing, retry identity or ACK order.
        self.start()
        request={'op':'send','to':'vintik','body':'synthetic retry 🦉','nonce':'retry','subject':'fixture'}
        first=self.client(request,namespace=True);self.assertEqual(first.returncode,0,first.stderr)
        again=self.client(request,namespace=True);self.assertEqual(again.returncode,0,again.stderr)
        self.assertEqual(json.loads(first.stdout)['id'],json.loads(again.stdout)['id'])
        self.assertEqual(self.service.message_count(),1)
        self.assertEqual(self.service.handle('vintik',65534,{'op':'get','id':json.loads(first.stdout)['id']})['body'],'synthetic retry 🦉')
        self.assertEqual(self.service.handle('shpuntik',1,{'op':'ack','id':json.loads(first.stdout)['id']})['reason'],'WRONG_RECIPIENT')
        reply=self.service.handle('vintik',65534,{'op':'send','to':'master','body':'synthetic read','nonce':'reply','subject':'fixture'})
        destination=self.root/'local';destination.mkdir(mode=0o700);os.chown(destination,self.actor.pw_uid,self.actor.pw_gid)
        code='\n'.join(['import sys,json','sys.path.insert(0,'+repr(str(LIB))+')',
            'from mail_client import MailClient',
            'names='+repr({uid:name for name,uid in self.users.items()}),
            'c=MailClient('+repr(str(self.socket))+',account_lookup=lambda uid:names[uid],server_uid=0,tls_cert='+repr(str(self.cert))+')',
            'print(json.dumps(c.read('+repr(reply['id'])+','+repr(str(destination))+')))'])
        def demote():
            os.setgroups([self.actor.pw_gid]);os.setgid(self.actor.pw_gid);os.setuid(self.actor.pw_uid)
        got=subprocess.run(['bwrap','--unshare-user','--ro-bind','/','/','--bind',str(destination),str(destination),'--proc','/proc','--dev','/dev','--',sys.executable,'-B','-c',code],preexec_fn=demote,capture_output=True,text=True,timeout=10)
        self.assertEqual(got.returncode,0,got.stderr)
        original=destination/(reply['id']+'.json')
        self.assertEqual(json.loads(original.read_text())['body'],'synthetic read')
        self.assertEqual(original.stat().st_mode&0o777,0o600)
        self.assertEqual(json.loads(self.client({'op':'inbox'},namespace=True).stdout)['messages'],[])


if __name__=='__main__':unittest.main()
