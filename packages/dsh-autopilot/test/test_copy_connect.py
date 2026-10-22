"""A missing/refusing fixture socket must be bounded; never repeat sent requests."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import errno
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch
import test_post_copies as fixture


class CopyConnectTests(unittest.TestCase):
    setUp=fixture.CopyTests.setUp
    restart=fixture.CopyTests.restart

    def child(self,timeout=15):
        script='\n'.join(['import sys,json,time','from types import SimpleNamespace',
            'sys.path.insert(0,'+repr(str(self.code))+')',
            'import mail_client as c','import mail_copy_worker as w',
            'fixture_client=c.MailClient',
            'c.MailClient=lambda path:fixture_client(path,server_uid=0,tls_cert=None)',
            'w.pwd.getpwuid=lambda uid:SimpleNamespace(pw_name="autopilot-copy")',
            'w.load_config=lambda path:'+repr(self.cfg),
            'w.load_tokens=lambda config:{name:"unused-synthetic-token" for name in config["bots"]}',
            'w.telegram_request=lambda *a:(_ for _ in ()).throw(AssertionError("network forbidden"))',
            'real_step=w.CopyWorker.step',
            'def bounded_step(self):',
            ' real_step(self);raise KeyboardInterrupt',
            'w.CopyWorker.step=bounded_step',
            'sys.argv=["copy","--socket",'+repr(str(self.socket))+']',
            'start=time.monotonic();status=w.main()',
            'print(json.dumps({"elapsed":time.monotonic()-start}));raise SystemExit(status)'])
        def demote():os.setgroups([65534]);os.setgid(65534);os.setuid(fixture.COPY_UID)
        return subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=timeout)

    def test_postman_restart_recovers_without_copy_unavailable(self):
        # Break caught: treating the first missing endpoint as a process failure.
        healthy=self.child();self.assertEqual(healthy.returncode,0,healthy.stderr)
        self.service.stop()
        timer=threading.Timer(.4,self.service.start);timer.start()
        try:got=self.child()
        finally:timer.join(5)
        self.assertEqual(got.returncode,0,got.stderr)
        self.assertNotIn('COPY_UNAVAILABLE',got.stderr)
        self.assertGreaterEqual(json.loads(got.stdout.splitlines()[-1])['elapsed'],.2)
        restored=self.child();self.assertEqual(restored.returncode,0,restored.stderr)

    def test_missing_socket_exhausts_once_then_explicit_restart_recovers(self):
        healthy=self.child();self.assertEqual(healthy.returncode,0,healthy.stderr)
        inode=self.socket.stat().st_ino
        self.service.stop();self.assertFalse(self.socket.exists())
        print('DAMAGE fixture socket absent count=1; prior inode='+str(inode),flush=True)
        before=time.monotonic();got=self.child();elapsed=time.monotonic()-before
        self.assertEqual(got.returncode,2,got.stderr)
        self.assertEqual(got.stderr.count('COPY_UNAVAILABLE'),1)
        self.assertGreaterEqual(elapsed,9.8);self.assertLess(elapsed,13)
        self.service.start()
        restored=self.child();self.assertEqual(restored.returncode,0,restored.stderr)

    def test_refusing_socket_recovers_and_sent_or_auth_errors_are_not_retried(self):
        self.service.stop()
        sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);sock.bind(str(self.socket))
        self.socket.chmod(0o660);os.chown(self.socket,0,65534)
        # It is a real AF_UNIX inode but nobody listens.
        self.assertTrue(self.socket.is_socket())
        timer=threading.Timer(.4,self.service.start);timer.start()
        try:got=self.child()
        finally:timer.join(5);sock.close()
        self.assertEqual(got.returncode,0,got.stderr)
        import mail_copy_worker
        calls=[]
        class Failed:
            def request(self,request):
                calls.append(request)
                raise ConnectionResetError(errno.ECONNRESET,'possibly sent')
        worker=mail_copy_worker.CopyWorker(Failed(),type('T',(),{'config':self.cfg})())
        with self.assertRaises(ConnectionResetError):worker.step()
        self.assertEqual(len(calls),1)
        calls.clear()
        class Untrusted:
            def request(self,request):
                calls.append(request);raise ValueError('SOURCE_UNVERIFIED')
        worker=mail_copy_worker.CopyWorker(Untrusted(),type('T',(),{'config':self.cfg})())
        with self.assertRaises(ValueError):worker.step()
        self.assertEqual(len(calls),1)

    def test_sleep_overshoot_does_not_start_request_after_deadline(self):
        import mail_copy_worker as worker
        from mail_client import MailConnectUnavailable
        from types import SimpleNamespace
        now=[0.];calls=[]
        class Client:
            def request(self,request):
                calls.append(now[0])
                if len(calls)==1:raise MailConnectUnavailable(errno.ENOENT,'fixture')
                return {'ok':True}
        def oversleep(_):now[0]=10.02
        with patch.object(worker,'time',SimpleNamespace(monotonic=lambda:now[0],sleep=oversleep)):
            with self.assertRaises(MailConnectUnavailable):
                worker.CopyWorker(Client(),None).request({'op':'copy_claim'})
        self.assertEqual(calls,[0.])

    def test_real_main_ready_only_after_authenticated_socket_is_listening(self):
        from test_mail_tls import certificate
        from mail_retention import RetentionPolicy
        from mail_client import MailClient
        import signal
        run=self.root/'notify-main';_fixture_mkdir(run, mode=0o755);os.chown(run,61011,65534);run.chmod(0o750)
        cert,key=certificate(run,'notify');os.chown(key,61011,65534)
        settings=self.root/'notify-retention.json';settings.write_text(json.dumps(RetentionPolicy().config));settings.chmod(0o644)
        notice=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM);self.addCleanup(notice.close)
        endpoint=self.root/'notify.sock';notice.bind(str(endpoint));endpoint.chmod(0o666);notice.settimeout(2)
        script='\n'.join(['import os,sys','from types import SimpleNamespace',
            'sys.path.insert(0,'+repr(str(self.code))+')','import mail_service as m',
            'm.production_accounts=lambda:('+repr(fixture.fixture.USERS)+',65534)',
            'm.pwd.getpwuid=lambda uid:SimpleNamespace(pw_name="autopilot-post")',
            'm.send_capacity_alert=lambda text:"sent"',
            'm.SOCKET_PATH='+repr(str(run/'run/post.sock')),'m.STATE_PATH='+repr(str(run/'state')),
            'm.SERVER_CERT='+repr(str(cert)),'m.SERVER_KEY='+repr(str(key)),
            'os.environ["NOTIFY_SOCKET"]='+repr(str(endpoint)),
            'os.setgroups([]);os.setgid(65534);os.setuid(61011)',
            'sys.argv=["postman","--retention",'+repr(str(settings))+',"--copies",'+repr(str(run/'missing-copy.json'))+']',
            'raise SystemExit(m.main())'])
        process=subprocess.Popen([sys.executable,'-B','-c',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            try:message=notice.recv(100)
            except socket.timeout:message=b''
            self.assertEqual(message,b'READY=1')
            self.assertTrue((run/'run/post.sock').is_socket())
            response=MailClient(run/'run/post.sock',server_uid=61011,tls_cert=cert).request({'op':'status'})
            self.assertEqual(response,{'ok':False,'reason':'UNREGISTERED_SENDER'})
        finally:
            if process.poll() is None:process.send_signal(signal.SIGINT)
            out,err=process.communicate(timeout=8)
        self.assertEqual(process.returncode,0,err)


if __name__=='__main__':unittest.main()
