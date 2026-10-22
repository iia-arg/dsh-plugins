"""Notice publication only; peer credentials are tested by the dedicated stand."""
import importlib.util
import os
from pathlib import Path
import pwd
import sys
import tempfile
import configparser
import contextlib
import io
import subprocess
import shlex
import unittest
from unittest.mock import patch

LIB=Path(__file__).resolve().parents[1]/'lib'


class NoticeFixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.account=pwd.getpwuid(os.geteuid()).pw_name
        self.directory=Path(self.tmp.name)/self.account
        self.directory.mkdir(mode=0o700)
        sys.path.insert(0,str(LIB));self.addCleanup(lambda:sys.path.remove(str(LIB)))
        spec=importlib.util.spec_from_file_location('mail_client_notice_fixture',LIB/'mail_client.py')
        self.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.api)
        self.client=self.api.MailClient('/unused-test-endpoint')
        # External inbox dependency only; real filesystem publisher remains intact.
        self.client.request=lambda _: {'ok':True,'messages':[{'id':'a'*64,'created':1000}]}


class NoticePublicationTests(NoticeFixture):
    def test_final_txt_not_visible_until_body_is_fully_written(self):
        visible=[]
        original=os.fdopen
        directory=self.directory
        class Observed:
            def __init__(self,fd,mode):
                self.file=original(fd,mode)
            def __enter__(self):return self
            def __exit__(self,*args):self.file.close()
            def __getattr__(self,key):return getattr(self.file,key)
            def write(self,text):
                visible.extend(p.name for p in directory.iterdir() if not p.name.startswith('.'))
                half=len(text)//2
                self.file.write(text[:half]);self.file.flush()
                visible.extend(p.name for p in directory.iterdir() if not p.name.startswith('.'))
                self.file.write(text[half:])
        with patch.object(self.api.os,'fdopen',Observed):
            self.assertEqual(self.client.notice(directory)['created'],1)
        self.assertEqual(visible,[],'channel could see empty/partial final notice')
        final=list(directory.glob('*.txt'))
        self.assertEqual(len(final),1)
        self.assertIn('NOTICE ONLY',final[0].read_text())
        self.assertTrue(final[0].read_text().endswith(chr(10)))
        self.assertEqual([p for p in directory.iterdir() if p.name.startswith('.')],[])

    def test_failed_write_leaves_no_visible_notice(self):
        original=os.fdopen
        class Failed:
            def __init__(self,fd,mode):self.file=original(fd,mode)
            def __enter__(self):return self
            def __exit__(self,*args):self.file.close()
            def write(self,text):
                self.file.write(text[:10]);self.file.flush()
                raise OSError('fixture write failure')
        with patch.object(self.api.os,'fdopen',Failed),self.assertRaises(OSError):
            self.client.notice(self.directory)
        self.assertEqual(list(self.directory.iterdir()),[])
        self.assertEqual(self.client.notice(self.directory)['created'],1)
        self.assertEqual(len(list(self.directory.glob('*.txt'))),1)


class NoticeLoopTests(NoticeFixture):
    def load_loop(self):
        path=LIB.parent/'tools/mail-notice-loop.py'
        self.assertTrue(path.is_file(),'persistent notice worker is not shipped')
        spec=importlib.util.spec_from_file_location('notice_loop_fixture',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    def test_letter_arriving_between_polls_is_published_within_five_seconds(self):
        loop=self.load_loop();clock=[0];pending=[];arrived=[];seen=[]
        def inbox(request):
            self.assertEqual(request,{'op':'inbox'})
            if pending:seen.append(clock[0])
            return {'ok':True,'messages':list(pending)}
        self.client.request=inbox
        class Stop:
            count=0
            def is_set(self):return self.count>=3
            def wait(self,seconds):
                clock[0]+=seconds;self.count+=1
                if self.count==1:
                    arrived.append(.01);pending.append({'id':'b'*64,'created':1001})
        with patch('time.monotonic',lambda:clock[0]):
            loop.run_loop(self.client,self.directory,Stop())
        self.assertTrue(seen,'new letter never polled')
        self.assertLessEqual(seen[0]-arrived[0],5,'notice latency exceeded five-second polling bound')
        final=list(self.directory.glob('*.txt'));self.assertEqual(len(final),1)
        self.assertIn('id='+'b'*64,final[0].read_text())
        self.assertNotIn('body',final[0].read_text())

    def test_failed_publish_recovers_in_same_activation(self):
        loop=self.load_loop();clock=[0];waits=[];first=[True]
        class Stop:
            def is_set(self):return len(waits)>=2
            def wait(self,seconds):waits.append(seconds);clock[0]+=seconds
        original=self.api.os.fdopen
        class FailedOnce:
            def __init__(self,fd,mode):self.file=original(fd,mode)
            def __enter__(self):return self
            def __exit__(self,*args):self.file.close()
            def write(self,text):
                if first[0]:first[0]=False;raise OSError('fixture publication failure')
                self.file.write(text)
            def __getattr__(self,key):return getattr(self.file,key)
        errors=io.StringIO()
        with patch.object(self.api.os,'fdopen',FailedOnce),patch('time.monotonic',lambda:clock[0]),contextlib.redirect_stderr(errors):
            try:loop.run_loop(self.client,self.directory,Stop())
            except OSError as error:self.fail('recoverable publication error terminated worker: '+str(error))
        self.assertEqual(len(list(self.directory.glob('*.txt'))),1)
        self.assertEqual(waits,[5,5])
        self.assertEqual(len(errors.getvalue().splitlines()),1)

    def test_missing_socket_for_ten_minutes_logs_once_and_caps_backoff(self):
        loop=self.load_loop();clock=[0];waits=[]
        client=self.api.MailClient(Path(self.tmp.name)/'missing/post.sock',server_uid=os.geteuid(),tls_cert=None)
        class Stop:
            def is_set(self):return clock[0]>=600
            def wait(self,seconds):waits.append(seconds);clock[0]+=seconds
        errors=io.StringIO()
        with patch('time.monotonic',lambda:clock[0]),contextlib.redirect_stderr(errors):
            try:loop.run_loop(client,self.directory,Stop())
            except OSError as error:self.fail('missing socket terminated worker: '+type(error).__name__)
        self.assertEqual(waits[:6],[5,10,20,40,60,60])
        self.assertLessEqual(max(waits),60)
        self.assertEqual(len(errors.getvalue().splitlines()),1)
        self.assertIn('MailConnectUnavailable',errors.getvalue())

    def test_error_changes_are_logged_and_success_resets_backoff(self):
        loop=self.load_loop();clock=[0];waits=[];calls=[0]
        events=[OSError('A'),OSError('A'),ValueError('B'),ValueError('B'),None,None,OSError('A'),None]
        def inbox(request):
            self.assertEqual(request,{'op':'inbox'})
            event=events[calls[0]];calls[0]+=1
            if event is not None:raise event
            return {'ok':True,'messages':[{'id':'c'*64,'created':1002}]}
        self.client.request=inbox
        class Stop:
            def is_set(self):return len(waits)>=len(events)
            def wait(self,seconds):waits.append(seconds);clock[0]+=seconds
        errors=io.StringIO()
        with patch('time.monotonic',lambda:clock[0]),contextlib.redirect_stderr(errors):
            try:loop.run_loop(self.client,self.directory,Stop())
            except (ValueError,OSError) as error:self.fail('expected inbox error escaped: '+str(error))
        self.assertEqual(waits,[5,10,20,40,5,5,5,5])
        lines=errors.getvalue().splitlines();self.assertEqual(len(lines),3)
        self.assertIn('OSError: A',lines[0]);self.assertIn('ValueError: B',lines[1]);self.assertIn('OSError: A',lines[2])
        self.assertEqual(len(list(self.directory.glob('*.txt'))),1)

    def test_diagnostic_is_single_line_bounded_and_deduplicated(self):
        loop=self.load_loop();waits=[];text='first\nsecond\r'+'Z'*300
        def inbox(request):raise ValueError(text)
        self.client.request=inbox
        class Stop:
            def is_set(self):return len(waits)>=2
            def wait(self,seconds):waits.append(seconds)
        errors=io.StringIO()
        with contextlib.redirect_stderr(errors):
            try:loop.run_loop(self.client,self.directory,Stop())
            except ValueError:self.fail('expected diagnostic error escaped')
        lines=errors.getvalue().splitlines();self.assertEqual(len(lines),1)
        self.assertIn('SOURCE_UNVERIFIED_OR_UNAVAILABLE',lines[0]);self.assertIn('ValueError',lines[0])
        self.assertIn(text[:200].replace('\n','\\n').replace('\r','\\r'),lines[0]);self.assertNotIn('Z'*201,lines[0])

    def test_unexpected_exception_still_terminates_worker(self):
        loop=self.load_loop()
        class Stop:
            def is_set(self):return False
        self.client.request=lambda _: (_ for _ in ()).throw(RuntimeError('unexpected fixture bug'))
        with self.assertRaises(RuntimeError):loop.run_loop(self.client,self.directory,Stop())

    def test_slow_rpc_does_not_add_another_five_seconds_to_poll_period(self):
        loop=self.load_loop();clock=[0];starts=[]
        def inbox(request):
            starts.append(clock[0]);clock[0]+=4
            return {'ok':True,'messages':[]}
        self.client.request=inbox
        class Stop:
            def is_set(self):return len(starts)>=3
            def wait(self,seconds):clock[0]+=seconds
        with patch('time.monotonic',lambda:clock[0]):
            loop.run_loop(self.client,self.directory,Stop())
        self.assertEqual(starts,[0,5,10],'slow successful RPC delayed next poll')

    def test_stop_prevents_another_inbox_request(self):
        loop=self.load_loop()
        class Stop:
            def is_set(self):return True
        self.client.request=lambda _: self.fail('mail queried after stop')
        loop.run_loop(self.client,self.directory,Stop())
        self.assertEqual(list(self.directory.iterdir()),[])

    def test_installed_worker_remains_executable_after_core_rollback(self):
        import install
        root=Path(self.tmp.name)/'installed'
        expected,(_,release)=install.layout(root,*install.source())
        unit=configparser.ConfigParser(interpolation=None)
        unit.read(LIB.parent/'systemd/autopilot-mail-notice@.service')
        executable=shlex.split(unit['Service']['ExecStart'])[3]
        worker=root/executable.lstrip('/')
        self.assertIn(worker,expected,'unit points to worker absent from installer layout')
        kind,mode,body=expected[worker]
        self.assertEqual((kind,mode),('file',0o644))
        import hashlib
        self.assertEqual(worker.parent.name,hashlib.sha256(body).hexdigest())
        worker.parent.mkdir(parents=True);worker.write_bytes(body)
        selector=root/'opt/autopilot/current';selector.symlink_to(release)
        old=root/'opt/autopilot/releases/legacy';old.mkdir(parents=True)
        selector.unlink();selector.symlink_to(old)
        self.assertFalse((selector/'tools/mail-notice-loop.py').exists())
        result=subprocess.run([sys.executable,'-s','-B',str(worker),'--help'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('--directory',result.stdout)

    def test_systemd_worker_stays_active_and_is_rearmed_only_after_exit(self):
        service=configparser.ConfigParser(interpolation=None)
        service.read(LIB.parent/'systemd/autopilot-mail-notice@.service')
        timer=configparser.ConfigParser(interpolation=None)
        timer.read(LIB.parent/'systemd/autopilot-mail-notice@.timer')
        self.assertEqual(service['Service']['Type'],'simple','oneshot restarts PID1 for every empty poll')
        self.assertIn('/opt/autopilot/notices/',service['Service']['ExecStart'])
        self.assertNotIn('/current/',service['Service']['ExecStart'],'AP rollback must not remove notice executable')
        self.assertIn('OnUnitInactiveSec',timer['Timer'],'exit must re-arm delivery after transient errors')
        self.assertNotIn('OnUnitActiveSec',timer['Timer'])


class NoticeObserverTests(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('notice_observer_fixture',LIB.parent/'window/notice-10min.py')
        self.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.api)
        self.worker='/opt/autopilot/notices/'+'a'*64+'/mail-notice-loop.py'
        self.rows=[]
        for i,name in enumerate(['master','vintik','shpuntik','gayka','shurup','sova','tumbler']):
            self.rows.append(dict(Id='autopilot-mail-notice@'+name+'.service',ActiveState='active',SubState='running',Type='simple',User=name,MainPID=str(10001+i),InvocationID=str(i+1)*32,ExecMainStartTimestampMonotonic='2000000',ExecStart='/usr/bin/python3 '+self.worker))

    def test_seven_fresh_stable_identities_pass(self):
        initial=self.api.validate(self.rows,self.worker,1)
        self.assertEqual(len(initial),7)
        self.assertEqual(self.api.validate(self.rows,self.worker,1,initial),initial)

    def test_restart_is_visible_without_any_journal_start_line(self):
        initial=self.api.validate(self.rows,self.worker,1)
        self.rows[0]['InvocationID']='f'*32
        with self.assertRaisesRegex(ValueError,'RESTART_DETECTED'):
            self.api.validate(self.rows,self.worker,1,initial)

    def test_missing_stale_or_nonrunning_worker_is_not_zero_starts(self):
        with self.assertRaises(ValueError):self.api.validate(self.rows[:-1],self.worker,1)
        for field,value in [('MainPID','0'),('InvocationID',''),('User','wrong'),('ActiveState','failed'),('Type','oneshot'),('ExecMainStartTimestampMonotonic','1000000'),('ExecStart','old-worker')]:
            changed=[dict(x) for x in self.rows];changed[0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                self.api.validate(changed,self.worker,1)


if __name__=='__main__':
    unittest.main()
