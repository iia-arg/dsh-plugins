"""Run as an ordinary account: real non-root socket server, no UID mocking."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
import subprocess
import json

LIB=Path(__file__).resolve().parents[1]/'lib'
sys.path.insert(0,str(LIB))


@unittest.skipIf(os.geteuid()==0,'this probe must also run separately as coders')
class NonrootPostmanTests(unittest.TestCase):
    def test_nonroot_service_owns_private_state_and_authenticates_maintenance(self):
        spec=importlib.util.spec_from_file_location('nonroot_postman',LIB/'mail_service.py')
        api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            users={name:10000+i for i,name in enumerate(sorted(api.TEAM))}
            try:postman=api.Postman(root/'run/post.sock',root/'state',users,os.getegid())
            except ValueError as error:self.fail('non-root postman refused: '+str(error))
            postman.start()
            try:
                sys.path.insert(0,str(LIB))
                try:
                    from mail_client import MailClient
                    client=MailClient(root/'run/post.sock',server_uid=os.geteuid(),tls_cert=None)
                    self.assertEqual(client.request({'op':'gc'}),{'ok':False,'reason':'INVALID_REQUEST'})
                finally:sys.path.remove(str(LIB))
                self.assertEqual((root/'state/mail.sqlite').stat().st_uid,os.geteuid())
                self.assertEqual((root/'state/mail.sqlite').stat().st_mode&0o777,0o600)
            finally:postman.stop()

    def test_real_team_uids_cannot_impersonate_master_on_nonroot_service(self):
        spec=importlib.util.spec_from_file_location('nonroot_uid_postman',LIB/'mail_service.py')
        api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
        users={'master':1006,'vintik':65534,'shpuntik':1,'gayka':2,'shurup':3,'sova':4,'tumbler':6}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);root.chmod(0o755)
            service=api.Postman(root/'run/post.sock',root/'state',users,os.getegid());service.start()
            def call(name,request):
                uid=users[name];gid=os.getegid();server_uid=os.geteuid()
                script=('import os,sys,json;os.setgroups([]);os.setgid('+str(gid)+');os.setuid('+str(uid)+');'
                        'sys.path.insert(0,'+repr(str(LIB))+');from mail_client import MailClient;'
                        'c=MailClient('+repr(str(root/'run/post.sock'))+',server_uid='+str(server_uid)+',tls_cert=None);'
                        'print(json.dumps(c.request(json.load(sys.stdin))))')
                got=subprocess.run(['sudo','-n',sys.executable,'-B','-c',script],input=json.dumps(request),capture_output=True,text=True,timeout=8)
                self.assertEqual(got.returncode,0,got.stderr)
                return json.loads(got.stdout)
            try:
                wrong=call('shpuntik',{'op':'send','nonce':'fixture-nonce','subject':'','sender':'master','to':'vintik','body':'candidate'})
                self.assertEqual(wrong.get('reason'),'SENDER_MISMATCH')
                sent=call('master',{'op':'send','nonce':'fixture-nonce','subject':'','sender':'master','to':'tumbler','body':'candidate'})
                self.assertTrue(sent['ok'])
                self.assertEqual(call('tumbler',{'op':'get','id':sent['id']})['header']['sender_uid'],1006)
                self.assertEqual(call('shpuntik',{'op':'get','id':sent['id']}).get('reason'),'WRONG_RECIPIENT')
            finally:service.stop()


if __name__=='__main__':unittest.main()
