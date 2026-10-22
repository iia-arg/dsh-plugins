"""Pure strict-envelope probes; real SO_PEERCRED cases are in dedicated tests."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import tempfile
import unittest

LIB=Path(__file__).resolve().parents[1]/'lib'


class TransportIdentityTests(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('transport_fixture',LIB/'pilot_transport.py')
        self.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.api)
        self.account=pwd.getpwuid(os.geteuid()).pw_name
        body='AUTOPILOT-PILOT/1'+chr(10)+json.dumps({'sender':'vintik'})
        message_id=hashlib.sha256(json.dumps(['master','fixture-nonce'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        self.frame={'ok':True,'header':{'version':2,'nonce':'fixture-nonce','subject':'','request_sha':hashlib.sha256(json.dumps([self.account,'',body],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'id':message_id,'sender':'master','sender_uid':pwd.getpwnam('master').pw_uid,
            'recipient':self.account,'recipient_uid':os.geteuid(),'created_at':1000},'body':body}
        self.source=lambda header,metadata:'master'

    def test_without_verified_source_is_refused(self):
        for source in (None,lambda *_:None,lambda *_:{'sender':'master'}):
            with self.subTest(source=source),self.assertRaisesRegex(ValueError,'SOURCE_UNVERIFIED'):
                self.api.identity_from_transport(self.frame,source=source)

    def test_verified_source_and_kernel_recipient_are_used_not_body(self):
        result=self.api.identity_from_transport(self.frame,source=self.source)
        self.assertEqual(result['sender_account'],'master')
        self.assertEqual(result['receiver_account'],self.account)
        self.assertEqual(json.loads(result['body'].split(chr(10),1)[1])['sender'],'vintik')

    def test_other_recipient_or_uid_is_refused(self):
        for key,value in (('recipient','someone-else'),('recipient_uid',65533)):
            changed=json.loads(json.dumps(self.frame));changed['header'][key]=value
            with self.assertRaisesRegex(ValueError,'WRONG_RECIPIENT'):
                self.api.identity_from_transport(changed,source=self.source)

    def test_changed_body_or_extra_header_field_is_refused(self):
        for change in ('body','header'):
            frame=json.loads(json.dumps(self.frame))
            if change=='body':frame['body']+='changed'
            else:frame['header']['claimed_role']='coordinator'
            with self.assertRaises(ValueError):
                self.api.identity_from_transport(frame,source=self.source)

    def test_source_cannot_disagree_with_header_or_sender_uid(self):
        for source in (lambda *_:'vintik',lambda *_:False):
            with self.assertRaises(ValueError):
                self.api.identity_from_transport(self.frame,source=source)
        frame=json.loads(json.dumps(self.frame));frame['header']['sender_uid']=65534
        with self.assertRaises(ValueError):
            self.api.identity_from_transport(frame,source=self.source)

    def test_new_service_does_not_accept_legacy_file_even_with_source_callback(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'20261014T000000Z-master-ownerall-1234abcd.txt'
            path.write_text('[delivery-v1 id='+'a'*64+' reply=no]'+chr(10)+'fixture')
            with self.assertRaises(ValueError):
                self.api.identity_from_transport(path,source=self.source)
            with self.assertRaises(ValueError):
                self.api.identity_from_transport(path.read_text(),source=self.source)


if __name__=='__main__':
    unittest.main()
