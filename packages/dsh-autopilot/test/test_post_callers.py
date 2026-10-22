"""Logical job IDs, not mutable message text, identify transport attempts."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
import pilot_mail

class CallersTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(getattr(pilot_mail,"transport_send",None)),"missing stable job transport caller")

    def test_job_retries_share_nonce_and_changed_payload_conflicts(self):
        class Post:
            def __init__(self):self.rows={}
            def send(self,to,body,nonce,subject=''):
                if nonce in self.rows and self.rows[nonce]!=(to,body):raise ValueError('REQUEST_CONFLICT')
                self.rows[nonce]=(to,body);return {'ok':True,'status':'STORED'}
        client=Post()
        task={'route':pilot_mail.ROUTE,'kind':'task','run':'run','task':{'job_id':'job-one'}}
        body=pilot_mail.ROUTE+'\n'+json.dumps(task)
        # The real caller must derive a job identity independently from payload.
        pilot_mail.transport_send(client,'vintik',body)
        pilot_mail.transport_send(client,'vintik',body)
        self.assertEqual(len(client.rows),1)
        task['task']['brief']='changed'
        with self.assertRaisesRegex(ValueError,'REQUEST_CONFLICT'):
            pilot_mail.transport_send(client,'vintik',pilot_mail.ROUTE+'\n'+json.dumps(task))
        task['task']['job_id']='job-two'
        pilot_mail.transport_send(client,'vintik',pilot_mail.ROUTE+'\n'+json.dumps(task))
        self.assertEqual(len(client.rows),2)

    def test_result_and_cancel_have_stable_separate_ids(self):
        values=[]
        class Post:
            def send(self,to,body,nonce,subject=''):values.append(nonce)
        c=Post()
        for kind in ['result','result','cancel','cancel']:
            body={'kind':kind,'run':'run','job_id':'j'}
            pilot_mail.transport_send(c,'master',pilot_mail.ROUTE+'\n'+json.dumps(body))
        self.assertEqual(values[0],values[1]);self.assertEqual(values[2],values[3]);self.assertNotEqual(values[0],values[2])

class LocalDurabilityTests(unittest.TestCase):
    def test_new_request_parent_entries_are_synced_before_return(self):
        import os,tempfile,mail_client
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);destination=root/'new-parent'/'new-leaf'/'request.json';synced=[]
            real=mail_client.os.fsync
            def sync(fd):
                synced.append(os.readlink('/proc/self/fd/'+str(fd)));return real(fd)
            with patch.object(mail_client.os,'fsync',sync):mail_client.save_private(destination,{'nonce':'saved'})
            self.assertIn(str(root),synced,'new-parent directory entry was not made durable')
            self.assertIn(str(root/'new-parent'),synced,'new-leaf directory entry was not made durable')
            self.assertIn(str(root/'new-parent'/'new-leaf'),synced)

    def test_job_ledger_rename_and_parent_entries_are_synced(self):
        import os,tempfile,subprocess
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);project=root/'project';_fixture_mkdir(project, mode=0o755)
            subprocess.run(['git','init','-q',str(project)],check=True)
            destination=root/'state-parent'/'state-leaf'/'jobs.json';synced=[]
            real=pilot_mail.os.fsync
            def sync(fd):
                synced.append(os.readlink('/proc/self/fd/'+str(fd)));return real(fd)
            engine=pilot_mail.Ledger(destination,project,'run')
            with patch.object(pilot_mail.os,'fsync',sync):
                with engine.state() as state:state['cancelled']=True
            for directory in [root,root/'state-parent',destination.parent]:
                self.assertIn(str(directory),synced,'job payload directory must be durable before transport/ACK')

class LayoutTests(unittest.TestCase):
    def test_core_layout_has_cli_and_no_gc_or_sender(self):
        import post_layout
        lock=json.loads((Path(pilot_mail.__file__).with_name('pilot-main.json')).read_text())
        entries=post_layout.entries()
        self.assertTrue('bin/autopilot-mail' in entries,'missing no-sudo mail CLI')
        self.assertFalse(any('mirror' in name or '-gc.' in name for name in entries),'copier/GC must not ship in core layout')
        import tempfile,subprocess
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for name,(kind,mode,body) in entries.items():
                target=root/name;_fixture_mkdir(target.parent, mode=0o755, parents=True, exist_ok=True);target.write_bytes(body);target.chmod(mode)
            result=subprocess.run([sys.executable,str(root/'bin/autopilot-mail'),'--help'],capture_output=True,text=True,timeout=5)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('read',result.stdout)
            pinned=subprocess.run([sys.executable,'-B','-c','import sys;sys.path.insert(0,'+repr(str(root/'pilot'))+');from pilot_mail import require_main;require_main()'],capture_output=True,text=True,timeout=5)
            self.assertEqual(pinned.returncode,0,pinned.stderr)

if __name__=='__main__':unittest.main()
