"""Receipt contracts, real SQLite/peer roles; HTTP and tokens are private fakes."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy
import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import unittest
import test_dedicated_mail as fixture

COPY_UID=1003

def config():
    return {'schema_version':2,'bots':{a:{'bot_user_id':str(900000101+i),'token_file':'/etc/autopilot-mail/telegram/'+a+'.token'} for i,a in enumerate(sorted(fixture.USERS))},
      'targets':[{'id':'traffic','chat_id':'-5388098055','text_chars':100,'agents':{a:{'on_send':True,'on_receive':True} for a in fixture.USERS}}]}

class CopyTests(unittest.TestCase):
    call=fixture.DedicatedMailTests.call
    def setUp(self):
        fixture.DedicatedMailTests.setUp(self)
        self.assertTrue((fixture.LIB/'mail_copies.py').exists(),'missing receipt producer/queue')
        self.c=importlib.import_module('mail_copies')
        self.cfg=config();self.now=1000000.
        self.restart()
    def restart(self):
        self.service.stop()
        self.service=self.api.Postman(self.socket,self.state,fixture.USERS,65534,copies=self.cfg,copy_uid=COPY_UID,clock=lambda:self.now)
        self.service.start()
    def rpc(self,request):return self.service.handle(None,COPY_UID,request)
    def claim(self):return self.rpc({'op':'copy_claim','config_sha':self.c.digest(self.cfg)})
    def send(self,nonce='n',sender='vintik',to='gayka',body='original'):
        got=self.service.handle(sender,fixture.USERS[sender],{'op':'send','to':to,'body':body,'subject':'subject','nonce':nonce})
        self.assertTrue(got['ok'],got);return got['id']
    def ack(self,d,actor='gayka'):
        r=self.call(actor,{'op':'ack','id':d});self.assertTrue(r['ok'],r)
    def finish(self,row,outcome='failed',retry_after=None):
        req={'op':'copy_result','claim':row['claim'],'outcome':outcome,'retry_after':retry_after,'message_id':17 if outcome=='sent' else None}
        return self.rpc(req)
    def rows(self):return [dict(r) for r in self.service.db.execute('SELECT * FROM copy_publications ORDER BY event,target,part')]

    def test_four_flag_combinations_are_independent_and_received_waits_for_ack(self):
        for i,(s,r,n) in enumerate([(False,False,0),(True,False,1),(False,True,1),(True,True,2)]):
            self.cfg['targets'][0]['agents']['vintik']['on_send']=s;self.cfg['targets'][0]['agents']['gayka']['on_receive']=r;self.restart()
            before=len(self.rows());d=self.send(str(i));self.assertEqual(len(self.rows())-before,int(s))
            self.ack(d);self.assertEqual(len(self.rows())-before,n)
            rows=[x for x in self.rows() if x['event'].startswith(d)]
            self.assertEqual({x['actor'] for x in rows},({ 'vintik'} if s else set())|({'gayka'} if r else set()))
    def test_reply_and_self_mail_have_correct_subject_and_two_phases(self):
        d=self.send(sender='gayka',to='vintik');self.ack(d,'vintik')
        own=self.send('self',sender='vintik',to='vintik');self.ack(own,'vintik')
        self.assertEqual([(r['phase'],r['actor']) for r in self.rows() if r['event'].startswith(d)],[('receive','vintik'),('send','gayka')])
        self.assertEqual({r['phase'] for r in self.rows() if r['event'].startswith(own)},{'send','receive'})
    def test_replayed_stored_ack_and_restart_do_not_recreate_facts(self):
        d=self.send();self.ack(d);self.restart();self.assertEqual(self.send(),d);self.ack(d)
        self.assertEqual(len(self.rows()),2)
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM copy_facts').fetchone()[0],2)
    def test_copy_write_error_rolls_back_send_and_ack(self):
        with self.service.db:self.service.db.execute("CREATE TRIGGER rejectcopy BEFORE INSERT ON copy_publications BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.assertFalse(self.call('vintik',{'op':'send','to':'gayka','body':'x','subject':'','nonce':'a'})['ok'])
        self.assertEqual(self.service.message_count(),0)
        with self.service.db:self.service.db.execute('DROP TRIGGER rejectcopy')
        d=self.send()
        with self.service.db:self.service.db.execute("CREATE TRIGGER rejectcopy BEFORE INSERT ON copy_publications BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.assertFalse(self.call('gayka',{'op':'ack','id':d})['ok'])
        self.assertEqual(self.service.db.execute('SELECT acked FROM messages WHERE id=?',(d,)).fetchone()[0],0)
    def test_team_cannot_claim_and_copy_role_cannot_read_or_send(self):
        d=self.send();self.assertFalse(self.call('vintik',{'op':'copy_claim','config_sha':self.c.digest(self.cfg)})['ok'])
        for op in [{'op':'get','id':d},{'op':'inbox'},{'op':'ack','id':d},{'op':'send','to':'gayka','body':'x','nonce':'x','subject':''}]:self.assertFalse(self.rpc(op)['ok'])
        # Actual kernel UID, not actor argument, obtains this role.
        script='import sys,json;sys.path.insert(0,'+repr(str(self.code))+');from mail_client import MailClient;print(json.dumps(MailClient('+repr(str(self.socket))+',server_uid=0,tls_cert=None).request({"op":"copy_claim","config_sha":'+repr(self.c.digest(self.cfg))+'})))'
        def demote():os.setgroups([]);os.setgid(65534);os.setuid(COPY_UID)
        r=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=8)
        self.assertEqual(r.returncode,0,r.stderr);self.assertTrue(json.loads(r.stdout)['publication'])
    def test_stale_worker_configuration_refuses_before_claim_or_attempt(self):
        self.send();changed=copy.deepcopy(self.cfg);changed['targets'][0]['agents']['vintik']['on_send']=False
        before=self.rows()[0]
        got=self.rpc({'op':'copy_claim','config_sha':self.c.digest(changed)})
        self.assertFalse(got['ok']);self.assertEqual(got['reason'],'COPY_CONFIG_MISMATCH')
        self.assertEqual(self.rows()[0]['attempts'],0);self.assertEqual(self.rows()[0]['state'],'pending')

    def test_copy_config_restart_accepts_root_file_without_restarting_postman(self):
        settings=self.root/'copy.json';settings.write_text(json.dumps(self.cfg));settings.chmod(0o644)
        self.service.copy_config_path=settings;thread=self.service.thread
        self.send('old',body='x'*101)
        changed=copy.deepcopy(self.cfg);changed['targets'][0]['agents']['vintik']['on_send']=False
        settings.write_text(json.dumps(changed))
        got=self.rpc({'op':'copy_claim','config_sha':self.c.digest(changed)})
        self.assertTrue(got['ok'],got);self.assertIsNone(got['publication']);self.assertEqual(self.rows()[0]['state'],'suppressed')
        self.assertIs(self.service.thread,thread);self.assertTrue(thread.is_alive())
        self.cfg=changed;self.send('disabled');self.assertEqual(len(self.rows()),1)
        changed=copy.deepcopy(changed);changed['targets'][0]['agents']['vintik']['on_send']=True;changed['targets'][0]['text_chars']=3000
        settings.write_text(json.dumps(changed));self.assertTrue(self.rpc({'op':'copy_claim','config_sha':self.c.digest(changed)})['ok'])
        long_id=self.send('long',body='x'*101);self.assertNotIn('Текст обрезан',next(r for r in self.rows() if r['event']==long_id+':send')['body'])
        settings.chmod(0o666);self.assertFalse(self.rpc({'op':'copy_claim','config_sha':'0'*64})['ok'])
        self.assertIs(self.service.thread,thread)

    def test_episode_alert_reader_once_restart_and_recovery(self):
        self.send()
        for i in range(5):self.finish(self.claim()['publication']);self.now+=10
        signals=[]
        def sender(text):signals.append(text);return 'sent'
        self.service.notify_copies(sender);self.service.notify_copies(sender);self.assertEqual(len(signals),1)
        self.restart();self.service.notify_copies(sender);self.assertEqual(len(signals),1)
        self.send('next');self.finish(self.claim()['publication'],'sent');self.service.notify_copies(sender);self.assertEqual(len(signals),2)
        self.assertIn('восстановлен',signals[-1]);self.assertEqual(len(self.rows()),2)

    def test_legacy_raw_outbox_cutover_refused_without_history_replay(self):
        self.service.stop()
        old=self.api.Postman(self.socket,self.state,fixture.USERS,65534,clock=lambda:self.now);self.service=old;old.start()
        self.send('legacy')
        self.service.stop()
        self.service=self.api.Postman(self.socket,self.state,fixture.USERS,65534,copies=self.cfg,copy_uid=COPY_UID)
        with self.assertRaisesRegex(ValueError,'LEGACY_COPY_OUTBOX_REQUIRES_REVIEW'):self.service.start()

    def test_real_worker_main_under_nonroot_uid_publishes_and_persists_result(self):
        import signal,time
        keys=self.root/'keys';_fixture_mkdir(keys, mode=0o755);keys.chmod(0o750);os.chown(keys,-1,61012)
        for actor,b in self.cfg['bots'].items():
            f=keys/(actor+'.token');f.write_text(b['bot_user_id']+':'+'Z'*35);os.chown(f,-1,61012);f.chmod(0o640);b['token_file']=str(f)
        settings=self.root/'copy.json';settings.write_text(json.dumps(self.cfg));settings.chmod(0o644)
        self.restart();self.send()
        script=chr(10).join(['import sys,os','from types import SimpleNamespace','sys.path.insert(0,'+repr(str(self.code))+')',
          'import mail_copy_worker as w','import mail_client as c',
          'w.pwd.getpwuid=lambda uid:SimpleNamespace(pw_name="autopilot-copy")',
          'w.grp.getgrnam=lambda name:SimpleNamespace(gr_gid=61012)',
          'c.pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=0)',
          'fixture_client=c.MailClient',
          'c.MailClient=lambda sock:fixture_client(sock,tls_cert=None)',
          'w.telegram_request=lambda token,method,payload: {"ok":True,"result":{"message_id":72}}',
          'w.http.client.HTTPSConnection=lambda *a,**k: (_ for _ in ()).throw(AssertionError("live HTTPS forbidden"))',
          'sys.argv=["copy","--config",'+repr(str(settings))+',"--socket",'+repr(str(self.socket))+']','raise SystemExit(w.main())'])
        def demote():os.setgroups([65534]);os.setgid(61012);os.setuid(COPY_UID)
        def team_uid():os.setgroups([]);os.setgid(65534);os.setuid(fixture.USERS['gayka'])
        denied_read=subprocess.run([sys.executable,'-B','-c','import os,sys;print(os.access(sys.argv[1],os.R_OK))',str(keys/'vintik.token')],preexec_fn=team_uid,capture_output=True,text=True,timeout=5)
        self.assertEqual(denied_read.stdout.strip(),'False')
        bad=keys/'vintik.token';original=bad.read_bytes();bad.write_bytes((keys/'gayka.token').read_bytes())
        denied=subprocess.run([sys.executable,'-B','-c',script],preexec_fn=demote,capture_output=True,text=True,timeout=5)
        self.assertEqual(denied.returncode,2);self.assertIn('COPY_KEY_INVALID vintik',denied.stderr)
        self.assertEqual(self.rows()[0]['attempts'],0)
        for token in [original.decode(),(keys/'gayka.token').read_text()]:
            for secret in [token,*token.split(':')]:self.assertNotIn(secret,denied.stderr+denied.stdout)
        bad.write_bytes(original)
        expected=self.rows()[0]
        trace={'event':'autopilot_copy','event_id':expected['event'],'target':expected['target'],'outcome':'sent'}
        process=subprocess.Popen([sys.executable,'-B','-c',script],preexec_fn=demote,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        captured=bytearray();pending=b'';seen=False
        try:
            import select
            deadline=time.monotonic()+5
            while not seen:
                remaining=deadline-time.monotonic()
                if remaining<=0:break
                ready,_,_=select.select([process.stdout],[],[],remaining)
                if not ready:break
                chunk=os.read(process.stdout.fileno(),65536)
                if not chunk:break
                captured.extend(chunk);pending+=chunk
                while b'\n' in pending:
                    line,pending=pending.split(b'\n',1);event=json.loads(line)
                    if isinstance(event,dict) and all(event.get(k)==v for k,v in trace.items()):seen=True
        finally:
            if process.poll() is None:process.send_signal(signal.SIGINT)
            try:tail,err=process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill();process.communicate(timeout=5)
                self.fail('copy worker did not stop within5s after SIGINT')
            out=(bytes(captured)+tail).decode('utf-8');err=err.decode('utf-8')
        self.assertEqual(process.returncode,0,err)
        self.assertTrue(seen,'expected copy outcome within5s: '+json.dumps(trace))
        self.assertEqual(self.rows()[0]['state'],'sent')
        self.assertIn('"outcome": "sent"',out)

    def test_five_failed_or_ambiguous_attempts_survive_restart_and_never_six(self):
        self.send()
        for i in range(5):
            row=self.claim()['publication'];self.assertIsNotNone(row);self.assertEqual(row['attempts'],i+1)
            self.finish(row,'unknown' if i%2 else 'failed');self.assertIsNone(self.claim()['publication'])
            self.restart();self.assertIsNone(self.claim()['publication']);self.now+=10
        self.assertEqual(self.rows()[0]['state'],'possibly_lost');self.assertIsNone(self.claim()['publication'])
        d=self.send('work-continues');self.ack(d)
    def test_429_cooldown_applies_to_other_receipts_same_bot_chat_after_restart(self):
        self.send('a');row=self.claim()['publication'];self.finish(row,'failed',60)
        self.send('b');self.restart();self.now+=10;self.assertIsNone(self.claim()['publication'])
        self.send('other',sender='shpuntik');self.assertEqual(self.claim()['publication']['actor'],'shpuntik')
        self.now+=50;self.assertEqual(self.claim()['publication']['actor'],'vintik')
    def test_expired_claim_is_spent_and_old_result_cannot_finish_new_claim(self):
        self.send();row=self.claim()['publication'];self.now+=31;self.assertIsNone(self.claim()['publication'])
        self.now+=10;new=self.claim()['publication'];self.assertEqual(new['attempts'],2)
        self.assertFalse(self.finish(row,'sent')['ok']);self.assertTrue(self.finish(new,'sent')['ok'])
    def test_episode_counts_losses_once_and_first_success_recovers_then_new_episode(self):
        for n in ['one','two','three']:
            self.send(n)
            for i in range(5):
                row=self.claim()['publication'];self.finish(row);self.now+=10
        state=self.rpc({'op':'copy_status'})['episode'];self.assertEqual(state['lost_count'],3);self.assertTrue(state['active'])
        self.assertEqual((state['first_at'],state['last_at']),(1000040.,1000140.))
        events=self.service.db.execute('SELECT kind FROM copy_alerts ORDER BY seq').fetchall();self.assertEqual([r[0] for r in events],['lost'])
        self.assertFalse(self.finish(row)['ok']);self.send('ok');self.finish(self.claim()['publication'],'sent')
        self.assertFalse(self.rpc({'op':'copy_status'})['episode']['active'])
        self.assertEqual([r[0] for r in self.service.db.execute('SELECT kind FROM copy_alerts ORDER BY seq')],['lost','recovery'])
        self.send('new')
        for i in range(5):self.finish(self.claim()['publication']);self.now+=10
        self.assertNotEqual(state['id'],self.rpc({'op':'copy_status'})['episode']['id'])
    def test_disabled_pending_is_suppressed_and_mode_changes_only_new_snapshots(self):
        self.send(body='x'*101);frozen=self.rows()[0]['body'];self.cfg['targets'][0]['text_chars']=3000;self.restart()
        self.assertEqual(self.claim()['publication']['body'],frozen)
        self.cfg['targets'][0]['agents']['vintik']['on_send']=False;self.restart();self.now+=41
        self.assertIsNone(self.claim()['publication']);self.assertEqual(self.rows()[0]['state'],'suppressed')
    def test_frozen_retry_survives_server_body_gc_without_replaying_sent(self):
        from mail_retention import default_config
        self.service.stop();ret=default_config()
        for a in ret['agents'].values():
            for d in a.values():d.update(keep_count=1,older_than_hours=1)
        self.service=self.api.Postman(self.socket,self.state,fixture.USERS,65534,copies=self.cfg,copy_uid=COPY_UID,clock=lambda:self.now,retention=ret);self.service.start()
        d=self.send('old',body='must survive in frozen receipt');self.ack(d)
        row=self.claim()['publication'];self.finish(row,'sent');sent=row['event']
        retry=self.claim()['publication'];self.finish(retry,'unknown')
        self.now+=1;d2=self.send('new');self.ack(d2);self.now+=3601;self.service.retention_tick(force=True)
        self.assertIsNone(self.service.db.execute('SELECT id FROM messages WHERE id=?',(d,)).fetchone())
        self.assertEqual(next(r for r in self.rows() if r['event']==sent)['state'],'sent')
        remaining=[r for r in self.rows() if r['event'].startswith(d) and r['state']=='retry'];self.assertEqual(len(remaining),1)
        self.assertIn('must survive in frozen receipt',remaining[0]['body']);self.assertEqual(remaining[0]['attempts'],1)
        self.restart()
        seen=None
        for _ in range(3):
            attempt=self.claim()['publication'];self.assertIsNotNone(attempt)
            if attempt['event']==retry['event']:
                seen=attempt;self.assertEqual(attempt['attempts'],2);self.assertEqual(attempt['body'],retry['body']);self.finish(attempt,'unknown');break
            self.finish(attempt,'sent')
        self.assertIsNotNone(seen,'frozen retry must actually run after GC and restart')
        self.assertEqual(self.send('old',body='must survive in frozen receipt'),d);self.assertEqual(len(self.rows()),4)

class CopyFormatTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((fixture.LIB/'mail_copies.py').exists(),'missing receipt formatter')
        self.c=importlib.import_module('mail_copies')
    def test_codepoint_boundaries_and_utf16_envelope(self):
        for limit in [100,3000]:
            for count in [limit-1,limit,limit+1]:
                for ch in ['A','😀']:
                    text=self.c.render('a'*64,'send','vintik','gayka','subject',ch*count,limit)
                    self.assertLessEqual(len(text.encode('utf-16-le'))//2,3500)
                    if count>limit or ch=='😀' and count>1600:self.assertIn('Текст обрезан. Полный текст: autopilot-mail get '+'a'*64,text);self.assertIn('…',text)
                    else:self.assertIn(ch*count,text);self.assertNotIn('Текст обрезан',text)
        text=self.c.render('a'*64,'receive','gayka','vintik','S\n'*100,'',100)
        self.assertIn('получил письмо от vintik',text);self.assertLess(len(text),500)
    def test_invalid_configuration_refused_without_coercing_types(self):
        self.c.validate(config())
        for value in ['100',True,100.0,999]:
            bad=config();bad['targets'][0]['text_chars']=value
            with self.assertRaises(ValueError):self.c.validate(bad)
        for change in ['agent','chat','bots','version','target']:
            bad=config()
            if change=='agent':bad['targets'][0]['agents']['intruder']={'on_send':True,'on_receive':True}
            if change=='chat':bad['targets'][0]['chat_id']='@someone'
            if change=='bots':bad['bots']['master']['bot_user_id']=bad['bots']['vintik']['bot_user_id']
            if change=='version':bad['schema_version']=True
            if change=='target':bad['targets']*=2
            with self.assertRaises(ValueError):self.c.validate(bad)

if __name__=='__main__':unittest.main()
