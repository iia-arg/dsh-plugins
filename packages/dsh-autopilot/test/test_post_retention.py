"""GC contracts: real postman SQLite/socket, no live services or Telegram."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import json
import os
import copy
import sqlite3
import unittest
import test_dedicated_mail as fixture

USERS=fixture.USERS

class RetentionTests(unittest.TestCase):
    call=fixture.DedicatedMailTests.call

    def setUp(self):
        fixture.DedicatedMailTests.setUp(self)
        self.assertTrue(hasattr(self.api,'RetentionPolicy'),'postman has no configured retention policy')
        self.now=1000000.0
        self.config={'schema_version':1,'sweep_interval_seconds':60,'batch_refs':100,'budget_ms':2000,
          'limits':{'max_live_body_bytes':16777216,'max_pending_per_sender':200,'max_live_db_bytes':134217728,'warn_percent':80,'recover_percent':70},
          'agents':{a:{'incoming':{'keep_count':1,'older_than_hours':48},'outgoing':{'keep_count':1,'older_than_hours':96}} for a in USERS}}
        self.restart()

    def restart(self):
        self.service.stop()
        self.service=self.api.Postman(self.socket,self.state,USERS,65534,retention=self.config,clock=lambda:self.now)
        self.service.start()

    def send(self,nonce,body='retained original',sender='master',to='vintik'):
        return self.service.handle(sender,USERS[sender],{'op':'send','to':to,'body':body,'nonce':nonce,'subject':'fixture'})

    def ack(self,d,actor='vintik'):
        self.assertTrue(self.call(actor,{'op':'ack','id':d})['ok'])

    def sweep(self):
        return self.service.retention_tick(force=True)

    def test_both_directions_and_age_must_release_before_body_pruning(self):
        a=self.send('old')['id'];self.ack(a)
        self.now+=1;b=self.send('new')['id'];self.ack(b)
        self.now+=48*3600
        self.sweep()
        self.assertEqual(self.call('vintik',{'op':'get','id':a})['reason'],'BODY_PRUNED')
        row=self.service.db.execute('SELECT out_released,in_released,body FROM messages WHERE id=?',(a,)).fetchone()
        self.assertEqual(tuple(row),(0,1,'retained original'))
        self.now+=48*3600+1;self.sweep()
        self.assertIsNone(self.service.db.execute('SELECT id FROM messages WHERE id=?',(a,)).fetchone())
        self.assertEqual(self.service.db.execute('SELECT request_sha FROM tombstones WHERE id=?',(a,)).fetchone()[0],
          __import__('hashlib').sha256(b'["vintik","fixture","retained original"]').hexdigest())
        before=self.service.db.execute('SELECT COUNT(*) FROM copy_outbox').fetchone()[0]
        self.restart();again=self.send('old')
        self.assertEqual(again['id'],a);self.assertTrue(again['body_pruned'])
        conflict=self.send('old',body='changed');self.assertFalse(conflict['ok'],conflict)
        self.assertEqual(conflict.get('reason'),'REQUEST_CONFLICT')
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM copy_outbox').fetchone()[0],before)
        self.assertTrue(self.call('vintik',{'op':'get','id':b})['ok'])

    def test_plain_json_kind_task_from_vintik_is_ordinary_not_a_master_job(self):
        # A body field must not grant the service type or task retention policy.
        run='ordinary-json';job='not-a-master-job'
        plain=json.dumps({'kind':'task','sender':'master','run':run,
            'task':{'job_id':job,'recipient':'gayka'}})
        def post(actor,to,nonce,body):
            got=self.call(actor,{'op':'send','to':to,'nonce':nonce,'subject':'type-boundary','body':body})
            self.assertEqual(got.get('status'),'STORED',got);return got['id']
        d=post('vintik','gayka','plain-json-kind-task',plain)
        original=self.call('gayka',{'op':'get','id':d})
        self.assertEqual(original['header']['sender'],'vintik')
        self.assertEqual(original['header']['sender_uid'],USERS['vintik'])
        self.assertEqual(original['body'],plain)
        self.assertEqual(self.service.db.execute('SELECT kind,job_ref FROM messages WHERE id=?',(d,)).fetchone()[:],('ordinary',None))
        self.ack(d,'gayka')
        row=self.service.db.execute('SELECT retention_at,acked_at,completed_at FROM messages WHERE id=?',(d,)).fetchone()
        self.assertEqual(tuple(row),(self.now,self.now,None))
        result='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'result','run':run,
            'job_id':job,'sender':'gayka','recipient':'master','status':'DONE','summary':'fixture','context_ref':'ctx'})
        rid=post('gayka','master','valid-result-for-boundary',result)
        self.assertEqual(self.service.db.execute('SELECT kind FROM messages WHERE id=?',(rid,)).fetchone()[0],'result')
        refused=self.call('gayka',{'op':'job_complete','id':d,'result_id':rid})
        self.assertEqual(refused,{'ok':False,'reason':'JOB_RESULT_UNVERIFIED'})
        # Same run/job/result, but now the kernel-authenticated Master envelope:
        # this positive control prevents an always-deny completion probe.
        task='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'task','sender':'master',
            'run':run,'task':{'job_id':job,'recipient':'gayka'}})
        # Same test, second variant: valid envelope cannot borrow Master's UID.
        forged=post('vintik','gayka','wrapped-json-kind-task',task);self.ack(forged,'gayka')
        self.assertEqual(self.call('gayka',{'op':'job_complete','id':forged,'result_id':rid}),
            {'ok':False,'reason':'JOB_RESULT_UNVERIFIED'})
        row=self.service.db.execute('SELECT kind,retention_at FROM messages WHERE id=?',(forged,)).fetchone()
        self.assertEqual(tuple(row),('unknown',None),'invalid service envelope stays protected, unlike ordinary JSON')
        master_task=post('master','gayka','real-master-task',task);self.ack(master_task,'gayka')
        self.assertEqual(self.call('gayka',{'op':'job_complete','id':master_task,'result_id':rid}),{'ok':True,'status':'COMPLETED'})
        self.now+=1
        tail=post('vintik','gayka','ordinary-newer-tail','ordinary newer letter');self.ack(tail,'gayka')
        self.sweep();self.assertTrue(self.call('gayka',{'op':'get','id':d})['ok'],'age still protects the ordinary body')
        self.now+=97*3600;self.sweep()
        self.assertIsNone(self.service.db.execute('SELECT id FROM messages WHERE id=?',(d,)).fetchone())
        tomb=self.service.db.execute('SELECT kind,completed_at FROM tombstones WHERE id=?',(d,)).fetchone()
        self.assertEqual(tuple(tomb),('ordinary',None),'ordinary ACK+age needs no job completion')
        self.assertEqual(self.call('gayka',{'op':'get','id':d})['reason'],'BODY_PRUNED')
        self.assertEqual(self.call('gayka',{'op':'job_complete','id':d,'result_id':rid}),{'ok':False,'reason':'JOB_RESULT_UNVERIFIED'})
        self.assertTrue(self.call('gayka',{'op':'get','id':forged})['ok'],'unknown envelope remains protected after age threshold')

    def test_task_envelope_from_vintik_cannot_impersonate_master_to_shpuntik(self):
        run='peer-boundary';job='forged-master-task'
        task='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'task','sender':'master',
            'run':run,'task':{'job_id':job,'recipient':'shpuntik'}})
        def post(actor,to,nonce,body):
            got=self.call(actor,{'op':'send','to':to,'nonce':nonce,'subject':'peer-boundary','body':body})
            self.assertEqual(got.get('status'),'STORED',got);return got['id']
        d=post('vintik','shpuntik','forged-envelope',task)
        original=self.call('shpuntik',{'op':'get','id':d})
        self.assertEqual(original['header']['sender'],'vintik')
        self.assertEqual(original['header']['sender_uid'],USERS['vintik'])
        self.assertEqual(original['body'],task)
        recorded_kind=self.service.db.execute('SELECT kind FROM messages WHERE id=?',(d,)).fetchone()[0]
        self.ack(d,'shpuntik')
        result='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'result','run':run,
            'job_id':job,'sender':'shpuntik','recipient':'master','status':'DONE','summary':'fixture','context_ref':'ctx'})
        rid=post('shpuntik','master','valid-result-peer-boundary',result)
        self.assertEqual(self.service.db.execute('SELECT kind FROM messages WHERE id=?',(rid,)).fetchone()[0],'result')
        self.assertEqual(self.call('shpuntik',{'op':'job_complete','id':d,'result_id':rid}),
            {'ok':False,'reason':'JOB_RESULT_UNVERIFIED'})
        self.assertNotEqual(recorded_kind,'task')
        self.assertIsNone(self.service.db.execute('SELECT completed_at FROM messages WHERE id=?',(d,)).fetchone()[0])
        # Same exact body, recipient and result; only the kernel peer is Master.
        genuine=post('master','shpuntik','genuine-envelope',task);self.ack(genuine,'shpuntik')
        self.assertEqual(self.service.db.execute('SELECT kind FROM messages WHERE id=?',(genuine,)).fetchone()[0],'task')
        self.assertEqual(self.call('shpuntik',{'op':'job_complete','id':genuine,'result_id':rid}),{'ok':True,'status':'COMPLETED'})

    def test_unacked_and_unfinished_job_survive_any_age_or_excess(self):
        body='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'task','sender':'master','run':'r1','task':{'job_id':'j1','recipient':'vintik'}})
        task=self.send('task',body)['id'];self.ack(task)
        raw=self.send('unread')['id'];self.now+=200*3600;self.sweep()
        self.assertTrue(self.call('vintik',{'op':'get','id':task})['ok'])
        self.assertTrue(self.call('vintik',{'op':'get','id':raw})['ok'])
        self.assertIsNone(self.service.db.execute('SELECT completed_at FROM messages WHERE id=?',(task,)).fetchone()[0])
        result='AUTOPILOT-PILOT/1\n'+json.dumps({'route':'AUTOPILOT-PILOT/1','kind':'result','run':'r1','job_id':'j1','sender':'vintik','recipient':'master','status':'DONE','summary':'fixture','context_ref':'ctx1'})
        rid=self.send('result',result,'vintik','master')['id']
        bad=self.call('shpuntik',{'op':'job_complete','id':task,'result_id':rid});self.assertFalse(bad['ok'])
        self.assertTrue(self.call('vintik',{'op':'job_complete','id':task,'result_id':rid})['ok'])
        stamp=self.service.db.execute('SELECT completed_at FROM messages WHERE id=?',(task,)).fetchone()[0]
        self.now+=10;self.call('vintik',{'op':'job_complete','id':task,'result_id':rid})
        self.assertEqual(self.service.db.execute('SELECT completed_at FROM messages WHERE id=?',(task,)).fetchone()[0],stamp)

    def test_ordinary_ack_suffices_and_local_saved_original_is_not_cleaned(self):
        a=self.send('old')['id'];saved=self.root/'local.json';original=self.call('vintik',{'op':'get','id':a});saved.write_text(json.dumps(original))
        self.ack(a);b=self.send('young')['id'];self.ack(b)
        before=saved.read_bytes();self.now+=97*3600;self.sweep()
        self.assertEqual(saved.read_bytes(),before)
        self.assertEqual(self.call('vintik',{'op':'get','id':a})['reason'],'BODY_PRUNED')
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],1)

    def test_self_mail_has_two_references_but_one_tombstone(self):
        a=self.send('self-old',to='master')['id'];self.ack(a,'master')
        b=self.send('self-new',to='master')['id'];self.ack(b,'master')
        self.now+=97*3600;r=self.sweep()
        self.assertEqual(r['bodies_pruned'],1);self.assertEqual(r['removed_refs'],2)
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],1)

    def test_tombstone_write_failure_rolls_back_reference_releases(self):
        a=self.send('old')['id'];self.ack(a);b=self.send('new')['id'];self.ack(b);self.now+=97*3600
        with self.service.db:self.service.db.execute("CREATE TRIGGER refuse_tomb BEFORE INSERT ON tombstones BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.assertFalse(self.sweep()['ok'])
        self.assertEqual(tuple(self.service.db.execute('SELECT out_released,in_released FROM messages WHERE id=?',(a,)).fetchone()),(0,0))
        with self.service.db:self.service.db.execute('DROP TRIGGER refuse_tomb')
        self.assertTrue(self.sweep()['ok']);self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],1)

    def test_more_than_1000_acked_letters_are_allowed_without_lifetime_stop(self):
        for i in range(1001):
            sent=self.send('n'+str(i),body='x');self.assertTrue(sent['ok'],(i,sent))
            self.service.handle('vintik',USERS['vintik'],{'op':'ack','id':sent['id']})
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0],1001)

    def test_live_resource_stop_does_not_stop_existing_ack_or_replay(self):
        sent=self.send('original')['id'];self.config['limits']['max_live_body_bytes']=1;self.restart()
        self.assertEqual(self.send('extra')['reason'],'STOP_LIVE_BODY')
        self.assertTrue(self.send('original')['ok']);self.ack(sent)
        status=self.call('vintik',{'op':'status'});self.assertGreater(status['db_live_bytes'],0)

    def test_config_rejects_unknown_agents_and_inverted_warning_hysteresis(self):
        for mutate in [lambda c:c['agents'].pop('sova'),lambda c:c['limits'].update(recover_percent=90),lambda c:c['agents']['master']['incoming'].update(older_than_hours=0)]:
            bad=copy.deepcopy(self.config);mutate(bad)
            with self.assertRaisesRegex(ValueError,'RETENTION_CONFIG'):
                self.api.RetentionPolicy(bad)

    def test_scheduler_is_called_and_reports_lag_without_false_empty_success(self):
        first=self.service.retention_tick();self.assertTrue(first['ran'])
        self.assertFalse(self.service.retention_tick()['ran'])
        self.now+=181;self.assertEqual(self.service.retention_health()['reason'],'GC_LAG')
        self.service.retention_tick();self.assertTrue(self.service.retention_health()['ok'])

    def test_send_reclaims_eligible_bodies_before_live_body_refusal(self):
        self.config['limits']['max_live_body_bytes']=40;self.restart()
        a=self.send('a')['id'];self.ack(a);self.now+=1;b=self.send('b')['id'];self.ack(b)
        self.now+=97*3600
        sent=self.send('c');self.assertTrue(sent['ok'],sent)
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],1)

    def test_db_limit_rolls_back_new_mail_and_all_its_copy_events(self):
        self.config['limits']['max_live_db_bytes']=self.service.policy.db_bytes(self.service.db)+4096;self.restart()
        result=self.send('big',body='x'*60000)
        self.assertEqual(result['reason'],'STOP_LIVE_DB')
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0],0)
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM copy_outbox').fetchone()[0],0)
        self.assertTrue(self.send('small')['ok'])

    def test_root_configuration_requires_safe_parent_and_regular_file(self):
        from mail_retention import load_config
        path=self.root/'retention.json';path.write_text(json.dumps(self.config));path.chmod(0o644)
        self.assertEqual(load_config(path),self.config)
        unsafe=self.root/'unsafe';_fixture_mkdir(unsafe, mode=0o755);unsafe.chmod(0o777)
        target=unsafe/'retention.json';target.write_text(json.dumps(self.config));target.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'RETENTION_CONFIG'):load_config(target)
        alias=self.root/'alias';alias.symlink_to(path)
        with self.assertRaises((ValueError,OSError)):load_config(alias)

    def test_gc_error_has_one_signal_per_episode_and_recovers(self):
        a=self.send('a')['id'];self.ack(a);b=self.send('b')['id'];self.ack(b);self.now+=97*3600
        with self.service.db:self.service.db.execute("CREATE TRIGGER broken_gc BEFORE INSERT ON tombstones BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.assertFalse(self.sweep()['ok']);self.assertEqual(self.service.retention_health()['reason'],'GC_FAILED')
        signals=[]
        for _ in range(2):self.service.notify_gc(lambda text:signals.append(text) or 'sent')
        self.assertEqual(len(signals),1)
        with self.service.db:self.service.db.execute('DROP TRIGGER broken_gc')
        result=self.sweep();self.assertTrue(result['ok']);self.assertTrue(self.service.retention_health()['ok'])
        self.assertIn('gc_run_id',result)
        self.assertTrue(all('protected' in d and 'reason' in d for d in result['directions']))

    def test_malformed_service_envelopes_do_not_kill_postman_or_become_completed(self):
        invalid=[{'route':'AUTOPILOT-PILOT/1','kind':'task','run':'r','job_id':'j','task':[]},
          {'route':'AUTOPILOT-PILOT/1','kind':'cancel'},
          {'route':'AUTOPILOT-PILOT/1','kind':'result','run':'r','job_id':'j','sender':'vintik','recipient':'master','status':'DONE'}]
        for i,value in enumerate(invalid):
            sender='vintik' if value['kind']=='result' else 'master'
            to='master' if sender=='vintik' else 'vintik'
            body='AUTOPILOT-PILOT/1\n'+json.dumps(value)
            sent=self.call(sender,{'op':'send','to':to,'body':body,'nonce':'bad'+str(i),'subject':''})
            self.assertTrue(sent['ok'],sent)
            self.assertEqual(self.service.db.execute('SELECT kind FROM messages WHERE id=?',(sent['id'],)).fetchone()[0],'unknown')
            self.assertTrue(self.service.thread.is_alive())
            self.assertTrue(self.call('master',{'op':'status'})['ok'])

    def test_db_admission_uses_bounded_gc_before_a_final_refusal(self):
        a=self.send('big-a',body='x'*60000)['id'];self.ack(a);self.now+=1
        b=self.send('big-b',body='x'*60000)['id'];self.ack(b)
        self.config['limits']['max_live_db_bytes']=self.service.policy.db_bytes(self.service.db)+4*4096
        self.restart();self.now+=97*3600
        result=self.send('big-c',body='x'*60000)
        self.assertTrue(result['ok'],result)
        self.assertEqual(self.service.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],1)

    def test_status_reads_own_retention_counts_and_protected_remainder(self):
        a=self.send('acked')['id'];self.ack(a);self.send('unread')
        status=self.call('vintik',{'op':'status'})
        self.assertIn('retention',status)
        self.assertEqual(status['retention']['incoming'],{'retained_refs':2,'protected_refs':1})
        self.assertEqual(status['retention']['outgoing'],{'retained_refs':0,'protected_refs':0})
        self.now+=97*3600;self.sweep()
        self.assertEqual(self.call('vintik',{'op':'status'})['retention']['incoming'],{'retained_refs':1,'protected_refs':1})

    def test_exact_age_boundary_keeps_body_until_strictly_older(self):
        first=self.now;a=self.send('boundary-a')['id'];self.ack(a);self.now+=1;b=self.send('boundary-b')['id'];self.ack(b)
        self.now=first+48*3600;self.sweep()
        self.assertEqual(self.service.db.execute('SELECT in_released FROM messages WHERE id=?',(a,)).fetchone()[0],0)
        self.now+=.01;self.sweep()
        self.assertEqual(self.service.db.execute('SELECT in_released FROM messages WHERE id=?',(a,)).fetchone()[0],1)
        self.now=first+96*3600;self.sweep()
        self.assertEqual(self.service.db.execute('SELECT out_released FROM messages WHERE id=?',(a,)).fetchone()[0],0)
        self.now+=.01;self.sweep()
        self.assertEqual(self.call('vintik',{'op':'get','id':a})['reason'],'BODY_PRUNED')

    def test_sigkill_between_references_and_tombstone_recovers_atomically(self):
        import subprocess,sys
        run=self.root/'crash';_fixture_mkdir(run, mode=0o755)
        script="\n".join([
          'import sys,json,os,signal','from pathlib import Path','sys.path.insert(0,'+repr(str(self.code))+')',
          'from mail_service import Postman','root=Path('+repr(str(run))+')','users='+repr(USERS),'config='+repr(self.config),
          'clock=[1000000.]','s=Postman(root/"run/post.sock",root/"state",users,65534,retention=config,clock=lambda:clock[0]);s.start()',
          'for n in ["a","b"]:',
          ' r=s.handle("master",users["master"],{"op":"send","to":"vintik","body":"original","nonce":n,"subject":"fixture"})',
          ' s.handle("vintik",users["vintik"],{"op":"ack","id":r["id"]})',
          'clock[0]+=97*3600',
          'def interrupt(sql):',
          ' if sql.startswith("INSERT INTO tombstones"):os.kill(os.getpid(),signal.SIGKILL)',
          's.db.set_trace_callback(interrupt)','s.retention_tick(force=True)'])
        killed=subprocess.run([sys.executable,'-B','-c',script],capture_output=True,text=True,timeout=10)
        self.assertEqual(killed.returncode,-9,killed.stderr)
        recovered=self.api.Postman(run/'run/post.sock',run/'state',USERS,65534,retention=self.config,clock=lambda:1000000.+97*3600);recovered.start()
        try:
            self.assertEqual(recovered.db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0],0)
            self.assertEqual([tuple(r) for r in recovered.db.execute('SELECT out_released,in_released FROM messages')],[(0,0),(0,0)])
            result=recovered.retention_tick(force=True);self.assertEqual(result['bodies_pruned'],1)
        finally:recovered.stop()

    def test_real_nonroot_main_calls_periodic_gc_and_persists_its_success(self):
        import subprocess,sys,select,time,signal
        run=self.root/'main';_fixture_mkdir(run, mode=0o755);os.chown(run,61011,65534);run.chmod(0o750)
        from test_mail_tls import certificate
        cert,key=certificate(run,'gc-main')
        os.chown(key,61011,65534)
        config=dict(self.config,sweep_interval_seconds=1)
        settings=self.root/'main-config.json';settings.write_text(json.dumps(config));settings.chmod(0o644)
        script="\n".join(['import os,sys','from types import SimpleNamespace','sys.path.insert(0,'+repr(str(self.code))+')',
          'import mail_service as m','m.send_capacity_alert=lambda text:"sent"','m.production_accounts=lambda:('+repr(USERS)+',65534)',
          'm.pwd.getpwuid=lambda uid:SimpleNamespace(pw_name="autopilot-post")',
          'm.SOCKET_PATH='+repr(str(run/'run/post.sock')),'m.STATE_PATH='+repr(str(run/'state')),
          'm.SERVER_CERT='+repr(str(cert)),'m.SERVER_KEY='+repr(str(key)),
          'os.setgroups([]);os.setgid(65534);os.setuid(61011)',
          'sys.argv=["postman","--retention",'+repr(str(settings))+']','raise SystemExit(m.main())'])
        process=subprocess.Popen([sys.executable,'-B','-c',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        seen=[];deadline=time.monotonic()+6
        try:
            while len(seen)<2 and time.monotonic()<deadline:
                if select.select([process.stdout],[],[],.2)[0]:
                    line=process.stdout.readline()
                    if not line:break
                    value=json.loads(line)
                    if value.get('event')=='autopilot_mail_gc':seen.append(value)
            self.assertEqual(len(seen),2,'main must invoke real GC periodically')
        finally:
            if process.poll() is None:process.send_signal(signal.SIGINT)
            try:out,err=process.communicate(timeout=8)
            except subprocess.TimeoutExpired:process.kill();out,err=process.communicate();self.fail('private postman did not stop')
        self.assertEqual(process.returncode,0,err)
        db=sqlite3.connect(run/'state/mail.sqlite')
        try:self.assertGreaterEqual(db.execute('SELECT run_seq FROM retention_state').fetchone()[0],2)
        finally:db.close()

if __name__=='__main__':unittest.main()
