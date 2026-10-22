"""Core contract: real kernel peers/socket/SQLite; only temporary fixture UIDs."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import unittest
import test_dedicated_mail as fixture
USERS=fixture.USERS


class PostCoreTests(unittest.TestCase):
    setUp=fixture.DedicatedMailTests.setUp
    call=fixture.DedicatedMailTests.call

    def send(self,account='master',to='vintik',body='hello 🦉',nonce='n-one',subject='fixture',**extra):
        return self.call(account,{'op':'send','to':to,'body':body,'nonce':nonce,'subject':subject,**extra})

    def test_nonce_identifies_delivery_not_body_and_preserves_ack_across_restart(self):
        first=self.send();self.assertTrue(first['ok'],first)
        self.assertEqual(first['id'],hashlib.sha256(b'["master","n-one"]').hexdigest())
        self.assertTrue(self.call('vintik',{'op':'ack','id':first['id']})['ok'])
        self.service.stop();self.service=self.api.Postman(self.socket,self.state,USERS,65534);self.service.start()
        self.assertEqual(self.send()['id'],first['id'])
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])
        second=self.send(nonce='n-two');self.assertTrue(second['ok'])
        self.assertNotEqual(second['id'],first['id'])
        self.assertEqual(self.service.message_count(),2)

    def test_nonce_conflict_rejects_body_subject_or_recipient(self):
        self.assertTrue(self.send()['ok'])
        for change in [{'body':'other'},{'subject':'other'},{'to':'gayka'}]:
            result=self.send(**change)
            self.assertEqual(result,{'ok':False,'reason':'REQUEST_CONFLICT'})
        self.assertEqual(self.service.message_count(),1)

    def test_peer_cannot_claim_master_or_touch_another_box(self):
        self.assertEqual(self.send(account='shpuntik',sender='master')['reason'],'SENDER_MISMATCH')
        sent=self.send();self.assertTrue(sent['ok'])
        for op in ['get','ack']:
            self.assertEqual(self.call('shpuntik',{'op':op,'id':sent['id']})['reason'],'WRONG_RECIPIENT')
        self.assertEqual(self.call('shpuntik',{'op':'inbox'})['messages'],[])
        self.assertEqual(self.send(account='outsider')['reason'],'UNREGISTERED_SENDER')

    def test_envelope_roundtrip_validates_nonce_and_subject(self):
        sent=self.send();self.assertTrue(sent['ok'])
        original=self.call('vintik',{'id':sent['id']},mode='delivery')
        self.assertEqual(original['body'],'hello 🦉')
        self.assertEqual(original['subject'],'fixture')
        self.assertEqual(original['delivery_id'],sent['id'])
        self.assertEqual(original['sender_account'],'master')

    def test_events_outbox_is_transactional_unique_and_not_a_sender(self):
        sent=self.send();self.assertTrue(sent['ok'])
        self.call('vintik',{'op':'ack','id':sent['id']})
        self.call('vintik',{'op':'ack','id':sent['id']})
        self.send()
        db=sqlite3.connect(self.state/'mail.sqlite')
        try:
            rows=db.execute('SELECT event,target,part,body FROM copy_outbox ORDER BY event').fetchall()
            self.assertEqual(len(rows),3,'one letter, STORED receipt, DELIVERED receipt')
            self.assertEqual({(t,p) for _,t,p,_ in rows},{('pilot',1)})
            self.assertTrue(all('autopilot-mail get '+sent['id'] in body for *_,body in rows))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO copy_outbox(event,target,part,body) VALUES(?,?,?,?)',rows[0])
        finally:db.close()
        for op in ['mirror_claim','gc']:
            self.assertEqual(self.call('master',{'op':op})['reason'],'INVALID_REQUEST')
        self.assertEqual(os.stat(self.state/'mail.sqlite').st_mode&0o777,0o600)

    def test_total_cap_is_stop_even_after_ack_but_retry_is_allowed(self):
        self.service.policy.limits['max_live_body_bytes']=10
        first=self.send();self.assertTrue(first['ok'])
        self.call('vintik',{'op':'ack','id':first['id']})
        self.assertTrue(self.send()['ok'])
        self.assertEqual(self.send(nonce='n-two')['reason'],'STOP_LIVE_BODY')
        self.assertEqual(self.service.message_count(),1)

    def test_read_is_durable_before_ack_and_repeat_does_not_reopen(self):
        sent=self.send();self.assertTrue(sent['ok'])
        directory=self.root/'read-vintik';_fixture_mkdir(directory, mode=0o755);os.chown(directory,USERS['vintik'],65534);directory.chmod(0o700)
        def demote():os.setgroups([]);os.setgid(65534);os.setuid(USERS['vintik'])
        import subprocess
        script='\n'.join(['import sys,json','sys.path.insert(0,'+repr(str(self.code))+')','from mail_client import MailClient',
            'names='+repr({v:k for k,v in USERS.items()}),
            'c=MailClient('+repr(str(self.socket))+',account_lookup=lambda uid:names[uid],server_uid=0,tls_cert=None)',
            'print(json.dumps(c.read('+repr(sent['id'])+','+repr(str(directory))+')))'])
        got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=8)
        self.assertEqual(got.returncode,0,got.stderr)
        files=list(directory.glob('*.json'));self.assertEqual(len(files),1)
        self.assertEqual(json.loads(files[0].read_text())['body'],'hello 🦉')
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])
        self.send();self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])

    def test_pilot_rejects_cap_that_cannot_fit_one_inbox_frame(self):
        config=self.api.RetentionPolicy().config;config['limits']['max_pending_per_sender']=3000
        with self.assertRaisesRegex(ValueError,'RETENTION_CONFIG_PENDING'):
            self.api.Postman(self.socket,self.state,USERS,65534,retention=config)

    def test_full_pilot_inbox_fits_real_socket_frame(self):
        for i in range(1000):
            actor=['master','shpuntik','gayka','sova','tumbler'][i//200]
            got=self.service.handle(actor,USERS[actor],{'op':'send','to':'vintik','body':'x','nonce':str(i),'subject':''})
            self.assertTrue(got['ok'])
        result=self.call('vintik',{'op':'inbox'})
        self.assertEqual(len(result['messages']),1000)
        self.assertEqual(self.send(nonce='overflow')['reason'],'SENDER_QUOTA_FULL')
        self.assertTrue(self.send(account='shurup',nonce='extra')['ok'])
        self.assertEqual(len(self.call('vintik',{'op':'inbox'})['messages']),1001)

    def test_failed_local_read_does_not_ack(self):
        sent=self.send();self.assertTrue(sent['ok'])
        directory=self.root/'unsafe';directory.mkdir(mode=0o755)
        # The recipient cannot publish into this root-owned directory.
        def demote():os.setgroups([]);os.setgid(65534);os.setuid(USERS['vintik'])
        import subprocess
        script='\n'.join(['import sys','sys.path.insert(0,'+repr(str(self.code))+')','from mail_client import MailClient',
          'names='+repr({v:k for k,v in USERS.items()}),
          'c=MailClient('+repr(str(self.socket))+',account_lookup=lambda uid:names[uid],server_uid=0,tls_cert=None)',
          'try:c.read('+repr(sent['id'])+','+repr(str(directory))+')',
          'except ValueError:raise SystemExit(0)', 'raise SystemExit(1)'])
        got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=8)
        self.assertEqual(got.returncode,0,got.stderr)
        self.assertEqual(len(self.call('vintik',{'op':'inbox'})['messages']),1)

    def test_outbox_failure_rolls_back_mail_and_receipt(self):
        with self.service.guard,self.service.db:
            self.service.db.execute("CREATE TRIGGER no_copy BEFORE INSERT ON copy_outbox BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.assertEqual(self.send()['reason'],'UNAVAILABLE')
        self.assertEqual(self.service.message_count(),0)
        with self.service.guard,self.service.db:self.service.db.execute('DROP TRIGGER no_copy')
        self.assertTrue(self.send()['ok'])

    def test_all_six_are_denied_primary_while_master_passes_kernel_dac(self):
        import grp,pwd,subprocess
        primary=grp.getgrnam('a2a-pochta').gr_gid
        directory=self.root/'primary-shadow';_fixture_mkdir(directory, mode=0o755);os.chown(directory,0,primary);directory.chmod(0o2770)
        for name in sorted(self.api.TEAM):
            account=pwd.getpwnam(name);groups=os.getgrouplist(name,account.pw_gid)
            if name!='master':self.assertNotIn(primary,groups,name+' has live primary membership')
            def demote():os.setgroups(groups);os.setgid(account.pw_gid);os.setuid(account.pw_uid)
            script='from pathlib import Path\np=Path('+repr(str(directory/name))+')\ntry:p.write_text("fixture")\nexcept PermissionError:raise SystemExit(13)\n'
            got=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=5)
            self.assertEqual(got.returncode,0 if name=='master' else 13,name+': shadow primary access')
        self.assertEqual([p.name for p in directory.iterdir()],['master'])

    def test_cli_durable_request_retries_saved_nonce_without_duplicate(self):
        directory=self.root/'master-draft';_fixture_mkdir(directory, mode=0o755);os.chown(directory,USERS['master'],65534);directory.chmod(0o700)
        request=directory/'request.json'
        def run(body):
            import subprocess
            def demote():os.setgroups([]);os.setgid(65534);os.setuid(USERS['master'])
            script='\n'.join(['import sys','sys.path.insert(0,'+repr(str(self.code))+')','import mail_client',
               'original=mail_client.MailClient',
               'mail_client.MailClient=lambda sock:original(sock,server_uid=0,tls_cert=None)',
               'sys.argv=["autopilot-mail","--socket",'+repr(str(self.socket))+',"send","vintik","--request",'+repr(str(request))+']',
               'raise SystemExit(mail_client.main())'])
            return subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,input=body,capture_output=True,text=True,timeout=8)
        one=run('durable original');self.assertEqual(one.returncode,0,one.stderr)
        first=json.loads(one.stdout);saved=json.loads(request.read_text());self.assertEqual(saved['body'],'durable original')
        self.call('vintik',{'op':'ack','id':first['id']})
        two=run('ignored new stdin on explicit same request');self.assertEqual(two.returncode,0,two.stderr)
        self.assertEqual(json.loads(two.stdout)['id'],first['id']);self.assertEqual(self.service.message_count(),1)
        self.assertEqual(self.call('vintik',{'op':'inbox'})['messages'],[])
        saved['body']='tampered saved payload';request.write_text(json.dumps(saved,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
        conflict=run('');self.assertEqual(conflict.returncode,2)
        self.assertEqual(json.loads(conflict.stdout)['reason'],'REQUEST_CONFLICT')

    def test_copy_preview_is_one_unicode_safe_part_with_pointer(self):
        sent=self.send(body='🦉'*4000);self.assertTrue(sent['ok'])
        db=sqlite3.connect(self.state/'mail.sqlite')
        try:
            previews=[row[0] for row in db.execute('SELECT body FROM copy_outbox')]
            self.assertTrue(previews)
            for body in previews:
                self.assertLessEqual(len(body.encode('utf-16-le'))//2,3500)
                self.assertIn('полный текст: autopilot-mail get '+sent['id'],body)
            self.assertIn('[усечено]',previews[0])
            self.assertEqual(db.execute('SELECT body FROM messages').fetchone()[0],'🦉'*4000)
        finally:db.close()

if __name__=='__main__':unittest.main()
