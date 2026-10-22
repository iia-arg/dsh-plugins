from pathlib import Path
import hashlib,importlib.util,json,os,pwd,subprocess,sys,unittest
import test_time_usage as F

class Collector(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path('/run/time-collection-private').is_file())
        path=F.PKG/'runtime/time_collection.py';self.assertTrue(path.is_file(),'new root time collector adapter is missing')
        spec=importlib.util.spec_from_file_location('_time_collector_test',path);self.c=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.c)
        self.root=Path('/run/'+self._testMethodName);self.root.mkdir(mode=0o755)
        self.index=self.root/'index.json';self.output=self.root/'runs';self.master=pwd.getpwnam('master');self.published=[]
        self.home=self.root/'codex-home';self.home.mkdir();self.feed=self.home/'dsh-usage-hodov.jsonl';self.feed.write_bytes(F.end(10));self.feed.chmod(0o600);os.chown(self.feed,self.master.pw_uid,self.master.pw_gid)
        self.project=self.root/'project';self.project.mkdir();os.chown(self.project,self.master.pw_uid,self.master.pw_gid)
        self.declarations=self.root/'registration-requests';self.declarations.mkdir(mode=0o700)
        self.record=dict(schemaVersion=1,runId='run1',project=str(self.project),startedAt=F.ts(0),origin={'mailDatabase':'/NEVER-READ/mail.sqlite'},participants=[dict(name='master',uid=self.master.pw_uid,gid=self.master.pw_gid,engine='codex',home=str(self.home),sources={'runtime':'/NEVER-READ/runtime','gateway':'/NEVER-READ/gateway','raw':[]},runtimeSource={'raw':'/NEVER-READ/usage-runtime-v1.jsonl','ledger':'/NEVER-READ/ledger','native':[],'home':str(self.root)})])
        self.request=self.declarations/'run1.json';self.write(self.request,self.record)
        self.profile=self.root/'source-profile.json';self.write(self.profile,dict(schemaVersion=1,participants=self.record['participants']))

    def write(self,path,value,uid=0):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value)+'\n');path.chmod(0o600);os.chown(path,uid,-1)

    def finish(self,when=60,uid=None):
        path=self.project/'.autopilot/usage-finish/run1.json';self.write(path,dict(runId='run1',project=str(self.project),finishedAt=F.ts(when)),self.master.pw_uid if uid is None else uid);return path

    def tick(self,when):
        return self.c.collect_tick(self.index,self.output,F.ts(when),publisher=lambda record,receipt:self.published.append(receipt['runId']))

    def receipt(self,run_id='run1'):
        path=F.PKG/'runtime/team_usage.py';spec=importlib.util.spec_from_file_location('_collection_public',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.TEAM_USAGE_ROOT=self.output;return m.read_public(run_id,str(self.project))

    def test_late_registration_uses_an_end_already_read_outside_the_old_window(self):
        self.record['startedAt']=F.ts(50);self.write(self.request,self.record)
        self.tick(100);self.assertIsNone(self.receipt()['totals']['modelCalls'])
        late=dict(self.record,runId='late',startedAt=F.ts(0));self.write(self.declarations/'late.json',late)
        result=self.tick(101);self.assertEqual(result['sourceBytes'],0)
        self.assertEqual(self.receipt('late')['totals']['modelCalls'],1)

    def test_root_roster_expansion_recounts_history_without_source_reread(self):
        who=pwd.getpwnam('vintik');home=self.root/'vintik-home';home.mkdir();feed=home/'dsh-usage-hodov.jsonl'
        feed.write_bytes(F.end(10,participant='vintik'));feed.chmod(0o600);os.chown(feed,who.pw_uid,who.pw_gid)
        person=dict(self.record['participants'][0],name='vintik',uid=who.pw_uid,gid=who.pw_gid,home=str(home))
        other=dict(self.record,runId='other',startedAt=F.ts(50),participants=[person]);self.write(self.declarations/'other.json',other)
        self.tick(100);self.assertEqual(self.receipt()['totals']['modelCalls'],1)
        self.record['participants'].append(person);self.write(self.request,self.record)
        result=self.tick(101);self.assertEqual(result['sourceBytes'],0)
        self.assertEqual(self.receipt()['totals']['modelCalls'],2)
        stored=json.loads((self.root/'records/run1.json').read_text());self.assertEqual([p['name'] for p in stored['participants']],['master','vintik'])

    def test_roster_expansion_cannot_poison_record_size_limit(self):
        self.record['participants'][0]['padding']='a'*180000;self.write(self.request,self.record);self.tick(100)
        target=self.root/'records/run1.json';before=target.read_bytes()
        alias=dict(self.record['participants'][0],name='alias',padding='b'*180000)
        incoming=dict(self.record,participants=[alias]);self.write(self.request,incoming)
        result=self.tick(101);self.assertEqual(target.read_bytes(),before);self.assertTrue(result['ignoredRegistrations'])
        self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_timer_target_runs_the_installed_current_copy_with_default_paths(self):
        import configparser,shlex,time
        timer=configparser.ConfigParser();timer.read(F.PKG/'systemd/autopilot-usage.timer')
        self.assertEqual(timer['Timer']['Unit'],'autopilot-usage.service');self.assertEqual(timer['Timer']['OnUnitActiveSec'],'60s')
        service=configparser.ConfigParser();service.read(F.PKG/'systemd/autopilot-usage.service');argv=shlex.split(service['Service']['ExecStart'])
        sys.path.insert(0,str(F.PKG/'lib'))
        spec=importlib.util.spec_from_file_location('_time_install_composition',F.PKG/'lib/install.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
        lock,raw=installer.source();expected,(_,release)=installer.layout(Path('/fixture-only'),lock,raw)
        mounted=self.root/'installed/opt/autopilot';physical=mounted/'releases'/release.name
        for name in ['tools/collect-team-usage.py','tools/runtime_receipt_source.py','tools/time_collection.py','tools/time_usage.py','skill/tools/team_usage.py','pilot/task_limits.py']:
            kind,mode,body=expected[release/name];target=physical/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body);target.chmod(mode)
        (mounted/'current').symlink_to('releases/'+release.name)
        idle=self.root/'idle-home';idle.mkdir();empty=idle/'dsh-usage-hodov.jsonl';empty.write_bytes(b'');empty.chmod(0o600);os.chown(empty,self.master.pw_uid,self.master.pw_gid)
        profile=self.root/'installed-profile.json';self.write(profile,dict(schemaVersion=1,participants=[dict(self.record['participants'][0],home=str(idle))]))
        code="import subprocess,sys,json,os;from pathlib import Path;root=Path('/var/lib/autopilot-usage');root.mkdir();profile=root/'source-profile.json';profile.write_bytes(Path(sys.argv[1]).read_bytes());os.chmod(profile,0o600);q=subprocess.run(sys.argv[2:],capture_output=True,text=True);print(json.dumps(dict(rc=q.returncode,tick=json.loads(q.stdout),stateSchema=json.loads((root/'time-state.json').read_text())['schemaVersion'])));sys.exit(q.returncode)"
        started=time.monotonic();q=subprocess.run(['bwrap','--die-with-parent','--unshare-net','--ro-bind','/','/','--tmpfs','/opt','--ro-bind',str(mounted),'/opt/autopilot','--tmpfs','/var/lib','--tmpfs','/tmp','--',sys.executable,'-I','-B','-c',code,str(profile),*argv],capture_output=True,text=True,timeout=8)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);value=json.loads(q.stdout);self.assertEqual(value['stateSchema'],3);self.assertEqual(value['tick']['sourceBytes'],0);self.assertEqual(value['tick']['results'],[])
        print('TIME_CURRENT_TIMER '+json.dumps(dict(argv=argv,rc=value['rc'],stateSchema=value['stateSchema'],sourceBytes=value['tick']['sourceBytes'],wallSeconds=time.monotonic()-started,privateOpt=True,privateVarLib=True)),flush=True)

    def mail_database(self):
        import sqlite3
        self.request.unlink(missing_ok=True);post=pwd.getpwnam('autopilot-post');path=self.root/'mail.sqlite'
        with sqlite3.connect(path) as db:db.execute('CREATE TABLE usage_registrations(run_id TEXT PRIMARY KEY,request_sha TEXT NOT NULL,request_json TEXT NOT NULL,peer_uid INTEGER NOT NULL,peer_pid INTEGER NOT NULL,accepted_at REAL NOT NULL,operator_json TEXT NOT NULL)')
        path.chmod(0o600);os.chown(path,post.pw_uid,post.pw_gid)
        profile=json.loads(self.profile.read_text());profile.update(mailDatabase=str(path),projectRoots=[str(self.root)]);self.write(self.profile,profile)
        return path

    def mail_row(self,path,run='run1',started=None,request=None):
        import sqlite3
        value=request if request is not None else dict(op='usage_register',runId=run,project=str(self.project),startedAt=started or F.ts(0),operator={})
        raw=json.dumps(value)
        with sqlite3.connect(path) as db:db.execute('INSERT INTO usage_registrations VALUES(?,?,?,?,?,?,?)',(run,hashlib.sha256(raw.encode()).hexdigest(),raw,self.master.pw_uid,123,1.,'{}'))

    def test_mail_new_row_full_roster_first_tick_and_repeat_readonly(self):
        db=self.mail_database();who=pwd.getpwnam('vintik');home=self.root/'mail-vintik';home.mkdir();feed=home/'dsh-usage-hodov.jsonl';feed.write_bytes(F.end(20,participant='vintik'));feed.chmod(0o600);os.chown(feed,who.pw_uid,who.pw_gid)
        profile=json.loads(self.profile.read_text());profile['participants'].append(dict(self.record['participants'][0],name='vintik',uid=who.pw_uid,gid=who.pw_gid,home=str(home)));self.write(self.profile,profile)
        self.mail_row(db);before=db.read_bytes();result=self.tick(100);self.assertEqual(result['runs'],1,'SELECT input must see registration on first tick')
        self.assertEqual([x['participant'] for x in self.receipt()['rows']],['master','vintik']);self.assertEqual(self.receipt()['totals']['modelCalls'],2)
        state=json.loads((self.root/'time-state.json').read_text());self.assertEqual(state['registration']['rowid'],1)
        self.assertFalse(self.request.exists());self.assertEqual(self.tick(101)['sourceBytes'],0);self.assertEqual(db.read_bytes(),before,'collector must not write mail DB')

    def test_mail_connection_rejects_writes_even_before_query_only(self):
        from unittest.mock import patch
        import sqlite3
        db=self.mail_database();self.mail_row(db);connect=sqlite3.connect;denied=[]
        def checked(*args,**kwargs):
            connection=connect(*args,**kwargs)
            try:connection.execute('UPDATE usage_registrations SET accepted_at=accepted_at+1')
            except sqlite3.OperationalError as error:
                self.assertIn('readonly',str(error).lower());denied.append(True);connection.rollback()
            else:
                connection.rollback();connection.close();self.fail('registration connection allowed a write')
            return connection
        with patch.object(self.c.sqlite3,'connect',side_effect=checked):self.tick(100)
        self.assertEqual(denied,[True]);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_mail_rowid_reuse_after_deletion_is_not_skipped(self):
        import sqlite3
        db=self.mail_database();self.mail_row(db);self.tick(100)
        with sqlite3.connect(db) as conn:conn.execute('DELETE FROM usage_registrations')
        self.mail_row(db,run='run2',started=F.ts(50));self.tick(101)
        self.assertEqual({x['runId'] for x in json.loads(self.index.read_text())['runs']},{'run1','run2'})

    def test_mail_bad_owner_is_refused_and_return_recovers(self):
        db=self.mail_database();self.mail_row(db);os.chown(db,self.master.pw_uid,-1)
        refused=self.tick(100);self.assertEqual(refused['runs'],0);self.assertTrue(refused['failed'])
        os.chown(db,pwd.getpwnam('autopilot-post').pw_uid,-1);self.tick(101);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_mail_invalid_row_does_not_starve_next_valid_registration(self):
        db=self.mail_database();self.mail_row(db,'invalid',request={'op':'usage_register'});self.mail_row(db)
        result=self.tick(100);self.assertEqual(result['runs'],1);self.assertTrue(result['ignoredRegistrations']);self.assertEqual(json.loads((self.root/'time-state.json').read_text())['registration']['rowid'],2)

    def test_mail_conflicting_row_does_not_block_next_valid_run(self):
        self.tick(100);db=self.mail_database();other=self.root/'other-project';other.mkdir();os.chown(other,self.master.pw_uid,-1)
        self.mail_row(db,request=dict(op='usage_register',runId='run1',project=str(other),startedAt=F.ts(0),operator={}))
        self.mail_row(db,run='run2');result=self.tick(101)
        self.assertEqual({r['runId'] for r in json.loads(self.index.read_text())['runs']},{'run1','run2'});self.assertTrue(result['ignoredRegistrations'])
        self.assertEqual(json.loads((self.root/'time-state.json').read_text())['registration']['rowid'],2)

    def test_mail_crash_after_state_commit_keeps_run_in_durable_index(self):
        from unittest.mock import patch
        db=self.mail_database();self.mail_row(db);actual=self.c.store().write_index;calls=[]
        def fail_final(*args,**kwargs):
            calls.append(1)
            if len(calls)==2:raise OSError('private final index failure')
            return actual(*args,**kwargs)
        with patch.object(self.c.store(),'write_index',side_effect=fail_final):
            with self.assertRaises(OSError):self.tick(100)
        self.assertTrue(self.index.exists(),'index must be durable before rowid cursor is committed')
        self.tick(101);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_mail_row_limit_advances_without_fencing_known_sources(self):
        from unittest.mock import patch
        db=self.mail_database()
        for i in range(3):self.mail_row(db,'r'+str(i))
        rows=[]
        with patch.object(self.c,'MAIL_ROW_LIMIT',1,create=True):
            for i in range(4):
                self.tick(100+i);rows.append(json.loads((self.root/'time-state.json').read_text())['registration']['rowid'])
        self.assertEqual(rows,[1,2,3,3]);self.assertEqual(len(json.loads(self.index.read_text())['runs']),3)

    def test_mail_acknowledgment_allows_129th_real_queue_request(self):
        import sqlite3
        db=self.mail_database();spec=importlib.util.spec_from_file_location('_queue_actual',F.PKG/'lib/mail_registration.py');kernel=importlib.util.module_from_spec(spec);spec.loader.exec_module(kernel)
        def enqueue(connection,rid):
            request=dict(op='usage_register',runId=rid,project=str(self.project),startedAt=F.ts(0),operator={})
            return kernel.queue_request(connection,'master',self.master.pw_uid,123,request,lambda:self.c.usage.timestamp(F.ts(1)).timestamp(),result_root=self.root/'registrations',peer_chain=dict(uid=self.master.pw_uid))
        with sqlite3.connect(db) as conn:
            conn.row_factory=sqlite3.Row
            for i in range(128):self.assertTrue(enqueue(conn,'r'+str(i))['ok'])
        for i in range(4):
            self.tick(100+i)
            if json.loads((self.root/'time-state.json').read_text()).get('registration',{}).get('rowid')==128:break
        self.assertEqual(len(list((self.root/'registrations').glob('*.json'))),128,'durable consumption needs terminal root ACK for the existing pruner')
        with sqlite3.connect(db) as conn:
            conn.row_factory=sqlite3.Row;answer=enqueue(conn,'r128');self.assertTrue(answer['ok'],answer);self.assertEqual(conn.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0],1)
        self.tick(105);self.assertIn('r128',{r['runId'] for r in json.loads(self.index.read_text())['runs']})

    def test_mail_ack_directory_entry_is_durable_before_cursor_commit(self):
        from unittest.mock import patch
        db=self.mail_database();self.mail_row(db);events=[];actual_sync=os.fsync;actual_state=self.c.usage.atomic_state
        def sync(fd):
            name=os.readlink('/proc/self/fd/'+str(fd));events.append(name);return actual_sync(fd)
        def save(*args,**kwargs):
            self.assertIn(str(self.root/'registrations'),events)
            self.assertGreater(max(i for i,p in enumerate(events) if p==str(self.root)),max(i for i,p in enumerate(events) if p==str(self.root/'registrations')))
            return actual_state(*args,**kwargs)
        with patch.object(self.c.os,'fsync',side_effect=sync),patch.object(self.c.usage,'atomic_state',side_effect=save):self.tick(100)

    def test_mail_ack_retry_syncs_existing_ack_before_cursor(self):
        from unittest.mock import patch
        db=self.mail_database();self.mail_row(db);actual_sync=os.fsync;failed=[]
        def fail_once(fd):
            if os.readlink('/proc/self/fd/'+str(fd))==str(self.root/'registrations') and not failed:failed.append(True);raise OSError('private ACK dir fsync refusal')
            return actual_sync(fd)
        with patch.object(self.c.os,'fsync',side_effect=fail_once):
            with self.assertRaises(OSError):self.tick(100)
        self.assertTrue((self.root/'registrations/run1.json').exists());self.assertFalse((self.root/'time-state.json').exists())
        seen=[];actual_state=self.c.usage.atomic_state
        def sync(fd):seen.append(os.readlink('/proc/self/fd/'+str(fd)));return actual_sync(fd)
        def save(*args,**kwargs):self.assertIn(str(self.root/'registrations'),seen);return actual_state(*args,**kwargs)
        with patch.object(self.c.os,'fsync',side_effect=sync),patch.object(self.c.usage,'atomic_state',side_effect=save):self.tick(101)
        self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_mail_future_start_is_deferred_then_seen(self):
        db=self.mail_database();self.mail_row(db,started=F.ts(101));result=self.tick(100);self.assertEqual(result['runs'],0)
        self.assertEqual(json.loads((self.root/'time-state.json').read_text())['registration']['rowid'],0)
        self.tick(102);self.assertEqual(json.loads(self.index.read_text())['runs'][0]['runId'],'run1')

    def test_mail_registration_is_seen_after_missing_init_state_and_catalogue(self):
        db=self.mail_database();self.mail_row(db);self.assertFalse((self.project/'.autopilot/state.js').exists());self.tick(100);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_mail_finished_run_is_seen_after_private_state_replaced(self):
        db=self.mail_database();self.mail_row(db);self.finish(60)
        current=self.project/'.autopilot/state.js';current.write_text('window.STATE='+json.dumps(dict(_sadik=dict(run_id='next-run'),startedAt=F.ts(90))));current.chmod(0o600);os.chown(current,self.master.pw_uid,-1);before=current.read_bytes()
        self.tick(100);receipt=self.receipt();self.assertEqual(receipt['closedAt'],F.ts(60));self.assertEqual(receipt['totals']['modelCalls'],1);self.assertEqual(current.read_bytes(),before)

    def start_registration_postman(self):
        import time
        post=pwd.getpwnam('autopilot-post');socket=self.root/'mail-socket/post.sock';state=self.root/'post-state'
        socket.parent.mkdir();os.chown(socket.parent,post.pw_uid,self.master.pw_gid);socket.parent.chmod(0o750);state.mkdir();os.chown(state,post.pw_uid,post.pw_gid);state.chmod(0o700)
        code="import sys,pwd,signal,threading;sys.path.insert(0,sys.argv[1]);import mail_service as m;stop=threading.Event();signal.signal(signal.SIGTERM,lambda *a:stop.set());p=m.Postman(sys.argv[2],sys.argv[3],{n:pwd.getpwnam(n).pw_uid for n in m.TEAM},int(sys.argv[4]));p.start();stop.wait();p.stop()"
        log=(self.root/'post-service.log').open('w');self.addCleanup(log.close)
        proc=subprocess.Popen([sys.executable,'-I','-B','-c',code,str(F.PKG/'lib'),str(socket),str(state),str(self.master.pw_gid)],user=post.pw_uid,group=post.pw_gid,extra_groups=[self.master.pw_gid],stdout=log,stderr=subprocess.STDOUT)
        self.addCleanup(lambda:(proc.terminate(),proc.wait(timeout=8)))
        until=time.monotonic()+3
        while not socket.is_socket():
            self.assertIsNone(proc.poll(),(self.root/'post-service.log').read_text());self.assertLess(time.monotonic(),until,'private Postman did not start');time.sleep(.01)
        entry=self.root/'mail-entry';entry.write_text("#!/usr/bin/python3\nimport sys\nsys.path.insert(0,"+repr(str(F.PKG/'lib'))+")\nimport mail_client\nOriginal=mail_client.MailClient\nclass CopyClient(Original):\n def __init__(self,*a,**k):\n  k.update(server_uid="+str(post.pw_uid)+",tls_cert=None);super().__init__(*a,**k)\nmail_client.MailClient=CopyClient\nsys.exit(mail_client.main())\n");entry.chmod(0o755)
        return socket,state/'mail.sqlite',entry

    def test_actual_init_cli_register_run_is_visible_on_first_tick_through_mail(self):
        import shutil
        from datetime import datetime,timezone,timedelta
        self.request.unlink();self.feed.write_bytes(b'')
        sys.path.insert(0,str(F.PKG/'lib'))
        spec=importlib.util.spec_from_file_location('_init_fixture_installer',F.PKG/'lib/install.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
        lock,raw=installer.source();deployment=self.root/'installed';deployment.mkdir();expected,(_,release)=installer.layout(deployment,lock,raw)
        for path,entry in sorted(expected.items(),key=lambda item:(len(item[0].parts),str(item[0]))):
            self.assertTrue(path.is_relative_to(deployment));installer.apply(path,entry)
        base=deployment/'var/lib/dsh-autopilot'
        # The real installer already relocates the existing catalogue into this private deployment.
        inv=self.c.module('run_catalog');scope=self.root/'inventory-scope.json';self.write(scope,dict(schemaVersion=1,roots=[str(self.root)],publicRoot=str(self.root/'panels')))
        report=self.root/'inventory.json';self.write(report,inv.scan_legacy(self.root));inv.bootstrap(base,self.root,report,hashlib.sha256(report.read_bytes()).hexdigest())
        public=self.root/'panels';public.mkdir();os.chown(public,0,self.master.pw_gid);public.chmod(0o2751)
        agent=public/'master';agent.mkdir();os.chown(agent,self.master.pw_uid,self.master.pw_gid);agent.chmod(0o2750)
        # The outer namespace has private /run, /var/lib and no network.
        # Real client/parser/server on a private Unix socket; fixture TLS is disabled.
        socket,db,entry=self.start_registration_postman()
        init=[sys.executable,'-B',str(release/'skill/tools/ap.py'),'init','--slug','new-init','--skill-dir',str(release/'skill'),'--no-serve']
        command=['bwrap','--die-with-parent','--ro-bind','/','/','--dev-bind','/dev','/dev','--bind',str(self.root),str(self.root),'--tmpfs','/usr/local/bin','--ro-bind',str(entry),'/usr/local/bin/autopilot-mail','--','/usr/bin/setpriv','--reuid',str(self.master.pw_uid),'--regid',str(self.master.pw_gid),'--clear-groups','--',sys.executable,'-I','-B','-c',"import os,subprocess,sys;env=dict(os.environ,AUTOPILOT_OPERATOR_PID=str(os.getpid()));q=subprocess.run(sys.argv[1:],env=env);sys.exit(q.returncode)",*init]
        probe=subprocess.run(command[:-len(init)]+['/usr/local/bin/autopilot-mail','--help'],cwd=self.project,env=dict(HOME=self.master.pw_dir,PATH='/usr/bin:/bin',PYTHONDONTWRITEBYTECODE='1'),capture_output=True,text=True,timeout=3)
        self.assertEqual(probe.returncode,0,probe.stdout+probe.stderr)
        result=subprocess.run(command,cwd=self.project,env=dict(HOME=self.master.pw_dir,PATH='/usr/bin:/bin',AUTOPILOT_NO_UPDATE_CHECK='1',AUTOPILOT_AGENT='master',AUTOPILOT_PUBLIC_ROOT=str(public),AUTOPILOT_USAGE_MAIL_SOCKET=str(socket),PYTHONDONTWRITEBYTECODE='1'),capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        state=json.loads((self.project/'.autopilot/state.js').read_text().split('=',1)[1]);rid=state['_sadik']['run_id'];self.assertNotEqual(rid,'run1')
        self.assertEqual(state['usageRegistration']['state'],'SUBMITTED',state['usageRegistration'])
        import sqlite3,time
        until=time.monotonic()+2
        while True:
            with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as conn:row=conn.execute('SELECT rowid,request_json FROM usage_registrations WHERE run_id=?',(rid,)).fetchone()
            if row:break
            self.assertLess(time.monotonic(),until,'real register-run did not INSERT');time.sleep(.01)
        profile=json.loads(self.profile.read_text());profile['projectRoots']=[str(self.root)];profile['mailDatabase']=str(db)
        who=pwd.getpwnam('vintik');home=self.root/'actual-vintik';home.mkdir();feed=home/'dsh-usage-hodov.jsonl';feed.touch(mode=0o600);os.chown(feed,who.pw_uid,who.pw_gid)
        profile['participants'].append(dict(self.record['participants'][0],name='vintik',uid=who.pw_uid,gid=who.pw_gid,home=str(home)));self.write(self.profile,profile)
        now=(datetime.now(timezone.utc)+timedelta(seconds=1)).isoformat();tick=self.c.collect_tick(self.index,self.output,now,publisher=lambda record,receipt:None)
        self.assertEqual(tick['runs'],1,tick);self.assertEqual(json.loads(self.index.read_text())['runs'][0]['runId'],rid)
        record=json.loads((self.root/'records'/(rid+'.json')).read_text());self.assertEqual(record['startedAt'],self.c.usage.timestamp(json.loads(row[1])['startedAt']).isoformat());self.assertEqual([p['name'] for p in record['participants']],['master','vintik'])
        self.assertFalse(self.request.exists());self.assertEqual(json.loads((self.root/'time-state.json').read_text())['registration']['rowid'],row[0]);print('MAIL_INIT_FIRST_TICK '+json.dumps(dict(initRC=result.returncode,mailSubmission=state['usageRegistration']['state'],runs=tick['runs'],roster=[p['name'] for p in record['participants']],rootRequests=0)),flush=True)


    def test_idle_after_final_collects_end_before_rotation_and_late_registration(self):
        self.finish();self.tick(661);final=self.receipt()
        with self.feed.open('ab') as stream:stream.write(F.end(700))
        idle=self.tick(701);self.assertEqual(idle['sourceBytes'],len(F.end(700)),'known source must be polled without an OPEN RUN')
        replacement=self.home/'new';replacement.write_bytes(b'');replacement.chmod(0o600);os.chown(replacement,self.master.pw_uid,self.master.pw_gid);os.replace(replacement,self.feed)
        late=dict(self.record,runId='late',startedAt=F.ts(690));self.write(self.declarations/'late.json',late)
        self.tick(702);self.assertEqual(self.receipt('late')['totals']['modelCalls'],1);self.assertEqual(self.receipt(),final)

    def test_saved_final_prevents_roster_expansion_after_index_commit_crash(self):
        from unittest.mock import patch
        self.finish();self.tick(100)
        with patch.object(self.c.store(),'write_index',side_effect=OSError('fixture index commit failure')):
            with self.assertRaises(OSError):self.tick(661)
        final=self.receipt();before=(self.root/'records/run1.json').read_bytes()
        person=dict(self.record['participants'][0],name='late-role');self.record['participants'].append(person);self.write(self.request,self.record)
        self.tick(662);self.assertEqual((self.root/'records/run1.json').read_bytes(),before,'saved final must also fence declaration changes')
        self.assertEqual(self.receipt(),final);self.assertEqual(json.loads(self.index.read_text())['runs'][0]['phase'],'CLOSED')

    def test_saved_final_with_absent_index_keeps_old_record_and_republishes(self):
        from unittest.mock import patch
        self.finish()
        with patch.object(self.c.store(),'write_index',side_effect=OSError('fixture first index commit failure')):
            with self.assertRaises(OSError):self.tick(661)
        self.assertFalse(self.index.exists());final=self.receipt();before=(self.root/'records/run1.json').read_bytes()
        person=dict(self.record['participants'][0],name='late-role');self.record['participants'].append(person);self.write(self.request,self.record)
        self.tick(662);self.assertEqual((self.root/'records/run1.json').read_bytes(),before);self.assertEqual(self.receipt(),final)

    def test_team_profile_expands_master_only_request_and_counts_untasked_member(self):
        who=pwd.getpwnam('vintik');home=self.root/'team-vintik';home.mkdir();feed=home/'dsh-usage-hodov.jsonl'
        feed.write_bytes(F.end(20,participant='vintik'));feed.chmod(0o600);os.chown(feed,who.pw_uid,who.pw_gid)
        member=dict(self.record['participants'][0],name='vintik',uid=who.pw_uid,gid=who.pw_gid,home=str(home))
        self.write(self.profile,dict(schemaVersion=1,mailDatabase='/NEVER-READ.sqlite',participants=self.record['participants']+[member]))
        # The request names only master; no task/delivery exists for vintik.
        result=self.tick(100);receipt=self.receipt();self.assertEqual(receipt['totals']['modelCalls'],2)
        self.assertEqual([r['participant'] for r in receipt['rows']],['master','vintik']);self.assertEqual(result['sourceBytes'],len(F.end(10))+len(F.end(20,participant='vintik')))

    def test_missing_request_participants_uses_team_and_does_not_need_roster_writer(self):
        value=dict(self.record);value.pop('participants');self.write(self.request,value)
        self.tick(100);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_profile_is_polled_before_first_registration_and_recovers_late_run(self):
        self.request.unlink();first=self.tick(100);self.assertEqual(first['sourceBytes'],len(F.end(10)))
        self.assertEqual(first['runs'],0);self.write(self.request,self.record);second=self.tick(101)
        self.assertEqual(second['sourceBytes'],0);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_unsafe_team_profile_refuses_before_cursor_or_index_changes(self):
        self.tick(100);state=self.root/'time-state.json';before=state.read_bytes();self.profile.chmod(0o666)
        with self.assertRaises(ValueError):self.tick(101)
        self.assertEqual(state.read_bytes(),before);self.profile.chmod(0o600);self.assertEqual(self.tick(102)['sourceBytes'],0)

    def test_team_union_size_refuses_before_poisoning_record_and_recovers(self):
        configured=dict(self.record['participants'][0],padding='a'*180000)
        self.write(self.profile,dict(schemaVersion=1,participants=[configured]))
        extra=dict(self.record['participants'][0],name='extra',padding='b'*180000)
        self.write(self.request,dict(self.record,participants=[extra]))
        bad=self.tick(100);self.assertEqual(bad['runs'],0);self.assertTrue(bad['ignoredRegistrations']);self.assertFalse((self.root/'records/run1.json').exists())
        value=dict(self.record);value.pop('participants');self.write(self.request,value)
        self.tick(101);self.assertEqual(self.receipt()['totals']['inputTokens'],10)

    def test_current_profile_descriptor_overrides_existing_open_record(self):
        self.tick(100);home=self.root/'updated-home';home.mkdir();feed=home/'dsh-usage-hodov.jsonl';feed.write_bytes(F.end(20));feed.chmod(0o600);os.chown(feed,self.master.pw_uid,self.master.pw_gid)
        current=dict(self.record['participants'][0],home=str(home));self.write(self.profile,dict(schemaVersion=1,participants=[current]))
        result=self.tick(101);self.assertEqual(result['runs'],1);self.assertFalse(result['failed'])
        self.assertEqual(self.receipt()['totals']['modelCalls'],2);self.assertEqual(json.loads((self.root/'records/run1.json').read_text())['participants'][0]['home'],str(home))

    def test_non_object_requests_are_ignored_without_blocking_healthy_run(self):
        for i,bad in enumerate([[],None,False,3,'text']):
            with self.subTest(value=bad):
                self.write(self.declarations/'bad.json',bad);report=self.tick(100+i)
                self.assertEqual(report['runs'],1);self.assertTrue(report['ignoredRegistrations']);self.assertEqual(self.receipt()['totals']['modelCalls'],1)

    def test_supplier_refuses_non_object_request_without_modifying_spool(self):
        staged=self.root/'bad-stage.json';self.write(staged,[]);before=self.request.read_bytes()
        q=subprocess.run([sys.executable,'-I','-B',str(F.PKG/'tools/supply-team-usage-index.py'),'--index',str(self.index),'--register',str(staged)],capture_output=True,text=True,timeout=5)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual(json.loads(q.stdout),{'error':'REGISTRATION_UNTRUSTED'})
        self.assertEqual(self.request.read_bytes(),before);self.assertFalse(self.index.exists())

    def test_supplier_repeated_submission_applies_current_profile_to_old_spool(self):
        self.tick(100);home=self.root/'stager-updated-home';home.mkdir()
        configured=dict(self.record['participants'][0],home=str(home));self.write(self.profile,dict(schemaVersion=1,participants=[configured]))
        guest=dict(self.record['participants'][0],name='guest',home=str(self.root/'guest-home'))
        incoming=dict(self.record,participants=[guest]);staged=self.root/'resubmit.json';self.write(staged,incoming)
        q=subprocess.run([sys.executable,'-I','-B',str(F.PKG/'tools/supply-team-usage-index.py'),'--index',str(self.index),'--register',str(staged)],capture_output=True,text=True,timeout=5)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);value=json.loads(self.request.read_text())
        self.assertEqual([p['name'] for p in value['participants']],['master','guest']);self.assertEqual(value['participants'][0]['home'],str(home))

    def test_finish_then_grace_and_final_are_durable(self):
        self.finish();first=self.tick(100);self.assertEqual(first['sourceBytes'],len(F.end(10)))
        self.assertEqual(self.receipt()['phase'],'live');self.assertEqual(self.receipt()['totals']['inputTokens'],10)
        self.tick(661);final=self.receipt();self.assertEqual(final['phase'],'final')
        self.assertEqual(json.loads(self.index.read_text())['runs'][0]['phase'],'CLOSED')
        self.finish(700);self.tick(800);self.assertEqual(self.receipt(),final)

    def test_no_finish_closes_on_deadline_with_note(self):
        self.tick(7201);value=self.receipt()
        self.assertEqual(value['closedAt'],F.ts(10));self.assertEqual(value['phase'],'final')
        self.assertEqual(value['closureReason'],'finish_missing_timeout');self.assertIn('закрыт по сроку',value['notice'].lower())

    def test_foreign_finish_is_ignored_then_valid_owner_closes(self):
        self.finish(uid=pwd.getpwnam('nobody').pw_uid);first=self.tick(100)
        self.assertIsNone(self.receipt()['closedAt']);self.assertTrue(first['finishWarnings'])
        self.finish();self.tick(101);self.assertEqual(self.receipt()['closedAt'],F.ts(60))

    def test_non_root_registration_is_ignored_and_recovery_imports(self):
        os.chown(self.request,pwd.getpwnam('nobody').pw_uid,-1)
        bad=self.tick(100);self.assertEqual(bad['runs'],0);self.assertEqual(bad['sourceBytes'],len(F.end(10)));self.assertTrue(bad['ignoredRegistrations']);self.assertFalse((self.root/'records/run1.json').exists())
        self.assertFalse((self.root/'records/run1.json').exists())
        os.chown(self.request,0,-1);self.tick(101);self.assertEqual(self.receipt()['totals']['inputTokens'],10)

    def test_symlink_and_fifo_are_not_regular_registration(self):
        self.request.unlink();target=self.root/'outside.json';self.write(target,self.record);self.request.symlink_to(target)
        self.assertTrue(self.tick(100)['ignoredRegistrations']);self.assertFalse((self.root/'records/run1.json').exists())
        self.request.unlink();os.mkfifo(self.request,0o600)
        self.assertTrue(self.tick(101)['ignoredRegistrations'])

    def test_future_and_prestart_finish_are_ignored(self):
        for when in [-1,101]:
            self.finish(when);value=self.tick(100);self.assertTrue(value['finishWarnings']);self.assertIsNone(self.receipt()['closedAt'])

    def test_late_finish_does_not_bypass_deadline(self):
        self.finish(7300);self.tick(7400);value=self.receipt();self.assertEqual(value['closureReason'],'finish_missing_timeout');self.assertEqual(value['closedAt'],F.ts(10))

    def test_no_legacy_prepare_or_database_reader_is_called(self):
        def forbidden(*a,**kw):raise AssertionError('legacy prepare/registration/database path was called')
        old=self.c.store()
        for name in ['prepare','registration_module','database','mail_deliveries','owner_export','advance_finalizations']:
            setattr(old,name,forbidden)
        self.finish();self.tick(100);self.assertEqual(self.receipt()['totals']['inputTokens'],10)

    def test_actual_collector_entry_uses_time_path(self):
        self.finish()
        code='''import datetime,runpy,sys,sqlite3
real=datetime.datetime
class Clock(real):
 @classmethod
 def now(cls,tz=None):return cls.fromisoformat('2026-10-21T00:01:40+00:00')
datetime.datetime=Clock
def forbidden(*args,**kwargs):raise AssertionError('accounting opened a database')
sqlite3.connect=forbidden
path=sys.argv.pop(1);runpy.run_path(path,run_name='__main__')
'''
        result=subprocess.run([sys.executable,'-I','-B','-c',code,str(F.PKG/'tools/collect-team-usage.py'),'--index',str(self.index),'--output',str(self.output)],capture_output=True,text=True,timeout=15)
        self.assertTrue(result.stdout.strip(),result.stderr)
        report=json.loads(result.stdout);self.assertIn('ignoredRegistrations',report,'service caller still uses the legacy registration/prepare path')
        self.assertNotIn('registration',report);self.assertNotIn('error',report)
        self.assertEqual(self.receipt()['schemaVersion'],5)
        # Fake project has no AP pin, so actual publisher refusal is expected/named.
        self.assertEqual(result.returncode,2);self.assertEqual(report['publishFailures'],[dict(runId='run1',reason='PUBLISH_LAG')])
        self.assertTrue(json.loads(self.index.read_text())['runs'][0]['publishPending'])
        self.tick(101);self.assertNotIn('publishPending',json.loads(self.index.read_text())['runs'][0])

    def test_final_publisher_failure_retries_without_raw_io(self):
        self.finish()
        def failed(*a):raise OSError('test publisher offline')
        report=self.c.collect_tick(self.index,self.output,F.ts(661),publisher=failed)
        final=self.receipt();row=json.loads(self.index.read_text())['runs'][0]
        self.assertEqual(row['phase'],'CLOSED');self.assertTrue(row['publishPending']);self.assertTrue(report['publishFailures'])
        again=self.tick(662);self.assertEqual(again['sourceBytes'],0);self.assertEqual(self.receipt(),final)
        row=json.loads(self.index.read_text())['runs'][0];self.assertEqual(row['phase'],'CLOSED');self.assertNotIn('publishPending',row)
        self.assertEqual(self.tick(663)['runs'],0)

    def test_shared_source_quantum_is_not_multiplied_by_runs(self):
        self.feed.write_bytes(b'x\n'*33000+F.end(10))
        other=dict(self.record,runId='run2');self.write(self.declarations/'run2.json',other)
        first=self.tick(100);self.assertEqual(first['sourceBytes'],65536);self.assertEqual(first['reads']['master']['bytes'],65536)
        second=self.tick(101);self.assertEqual(second['sourceBytes'],66000+len(F.end(10))-65536)
        self.assertEqual(self.tick(102)['sourceBytes'],0)

    def test_participant_label_uses_declared_uid_not_a_second_account_name(self):
        # Whole-team master remains; the extra label uses the same UID but
        # a different physical feed, as coders' separate Codex homes do.
        idle=self.root/'master-idle';idle.mkdir();empty=idle/'dsh-usage-hodov.jsonl';empty.write_bytes(b'');empty.chmod(0o600);os.chown(empty,self.master.pw_uid,self.master.pw_gid)
        self.write(self.profile,dict(schemaVersion=1,participants=[dict(self.record['participants'][0],home=str(idle))]))
        self.record['participants'][0]['name']='account-alias';self.write(self.request,self.record)
        report=self.tick(100);self.assertEqual(report['runs'],1,'trusted uid must support participant labels sharing an OS account')
        value=self.receipt();rows={r['participant']:r for r in value['rows']};self.assertEqual(rows['account-alias']['totals']['inputTokens'],10);self.assertIsNone(rows['master']['totals']['inputTokens']);self.assertEqual(value['totals']['inputTokens'],10)

    def test_malformed_deep_registration_does_not_abort_valid_run(self):
        p=self.declarations/'bad.json';p.write_text('['*20000+'0'+']'*20000);p.chmod(0o600)
        try:report=self.tick(100)
        except Exception as exc:self.fail('invalid declaration aborted healthy RUN: '+type(exc).__name__)
        self.assertTrue(report['ignoredRegistrations']);self.assertEqual(self.receipt()['totals']['inputTokens'],10)

    def test_bad_output_one_run_does_not_block_other_run_or_index(self):
        self.finish();second=dict(self.record,runId='run2',startedAt=F.ts(100));self.write(self.declarations/'run2.json',second)
        self.feed.write_bytes(F.end(10)+F.end(110));self.output.mkdir();(self.output/'run1').symlink_to(self.root/'unrelated')
        try:report=self.tick(200)
        except Exception as exc:self.fail('bad public output aborted all RUNs: '+repr(exc))
        self.assertTrue(any(x['runId']=='run1' for x in report['failed']))
        self.assertEqual(self.receipt('run2')['totals']['inputTokens'],10)
        self.assertEqual(len(json.loads(self.index.read_text())['runs']),2)

    def test_shared_physical_feed_under_two_labels_is_not_read_twice(self):
        alias=dict(self.record['participants'][0],name='account-alias')
        self.record['participants'].append(alias);self.write(self.request,self.record);self.feed.write_bytes(F.end(10)*400)
        report=self.tick(100)
        self.assertLessEqual(report['sourceBytes'],65536)
        self.assertTrue(report['sourceWarnings']);self.assertIsNone(self.receipt()['totals']['inputTokens'])

    def test_index_admission_cannot_poison_next_tick_by_oversize(self):
        for i in range(651):self.write(self.declarations/('r'+str(i)+'.json'),dict(self.record,runId='r'+str(i)))
        first=self.tick(100)
        self.assertLessEqual(self.index.stat().st_size,65536,'writer exceeded the paired reader capacity')
        self.assertTrue(any(x['reason']=='INDEX_CAPACITY' for x in first['ignoredRegistrations']))
        self.assertEqual(self.tick(101)['sourceBytes'],0)

    def test_tick_budget_bounds_publishers_and_retries_unattempted_first(self):
        from unittest.mock import patch
        for i in range(24):self.write(self.declarations/('r'+str(i)+'.json'),dict(self.record,runId='r'+str(i)))
        moment=[0.0];attempted=[];commits=[];replace=os.replace
        def slow(record,receipt):attempted.append(record['runId']);moment[0]+=4;raise OSError('simulated slow publisher')
        def replaced(src,dst):
            if str(dst)==str(self.root/'time-state.json'):commits.append(str(dst))
            return replace(src,dst)
        with patch.object(self.c.usage.os,'replace',side_effect=replaced):
            try:first=self.c.collect_tick(self.index,self.output,F.ts(100),publisher=slow,clock=lambda:moment[0])
            except TypeError as exc:self.fail('no collector deadline/cursor contract: '+str(exc))
        self.assertLessEqual(moment[0],60);self.assertEqual(len(attempted),15);self.assertEqual(len(commits),1)
        self.assertTrue(first['publicationDeferred'])
        first_set=set(attempted);moment[0]=0;attempted.clear()
        self.c.collect_tick(self.index,self.output,F.ts(101),publisher=slow,clock=lambda:moment[0])
        self.assertEqual(len(first_set|set(attempted)),25,'pending RUNs must not stay behind the same stalled publishers')

    def test_service_has_a_finite_deadline(self):
        line=next(s for s in (F.PKG/'systemd/autopilot-usage.service').read_text().splitlines() if s.startswith('TimeoutStartSec='))
        seconds=int(line.split('=',1)[1]);self.assertGreater(seconds,0);self.assertLessEqual(seconds,70)

    def test_partial_metadata_snapshot_never_consumes_shared_feed(self):
        from unittest.mock import patch
        self.feed.write_bytes(b'');self.write(self.declarations/'run2.json',dict(self.record,runId='run2'))
        self.tick(100);state=self.root/'time-state.json';before=state.read_bytes();self.feed.write_bytes(F.end(10))
        now=[0.0];read=self.c.read_json
        def delayed(path,*args):
            value=read(path,*args)
            if str(path)==str(self.root/'records/run1.json'):now[0]=6.0
            return value
        with patch.object(self.c,'read_json',side_effect=delayed):
            result=self.c.collect_tick(self.index,self.output,F.ts(101),publisher=lambda *a:None,clock=lambda:now[0])
        self.assertTrue(result['metadataPending']);self.assertEqual(result['sourceBytes'],0)
        self.assertEqual(state.read_bytes(),before,'partial roster must not advance durable source offsets')
        self.assertEqual(self.tick(102)['sourceBytes'],len(F.end(10)))

    def test_legacy_fixture_entry_refuses_outside_legacy_namespace(self):
        result=subprocess.run([sys.executable,'-I','-B',str(F.PKG/'test/_legacy_collect_usage.py'),'--index',str(self.index),'--output',str(self.output)],capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,2)
        self.assertEqual(json.loads(result.stdout).get('error'),'LEGACY_FIXTURE_ONLY')
        self.assertFalse(self.index.exists())

    def test_supplier_only_stages_root_request_and_collector_owns_index(self):
        self.record['operator']=dict(jobId='operator',sessionId='s',sessionCreated=1,turn=1)
        reservation=self.root/'reservations'/(hashlib.sha256(str(self.project).encode()).hexdigest()+'.json')
        self.record['origin']['operatorReservation']=str(reservation)
        person=self.record['participants'][0]
        person['runtimeSource'].update(raw=str(self.root/'usage-runtime-v1.jsonl'),ledger=str(self.root/'ledger.sqlite'))
        person['sources'].update(runtime=person['runtimeSource']['raw'],gateway=str(self.home/'gateway.jsonl'))
        self.write(self.request,self.record);staged=self.root/'staged.json';self.request.rename(staged)
        cmd=[sys.executable,'-I','-B',str(F.PKG/'tools/supply-team-usage-index.py'),'--index',str(self.index),'--output',str(self.output),'--register',str(staged)]
        result=subprocess.run(cmd,capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertFalse(self.index.exists(),'supplier must not be a second index writer')
        self.assertTrue(self.request.is_file())
        self.tick(100);self.assertEqual(self.receipt()['totals']['inputTokens'],10)
        before=self.index.read_bytes()
        bad=subprocess.run([sys.executable,'-I','-B',str(F.PKG/'tools/supply-team-usage-index.py'),'--index',str(self.index),'--close','run1'],capture_output=True,text=True,timeout=5)
        self.assertEqual(bad.returncode,2);self.assertEqual(self.index.read_bytes(),before)

    def test_actual_master_publisher_accepts_v5_and_later_archived_final(self):
        import shutil
        from unittest.mock import patch
        codes=[];run=subprocess.run
        def traced(argv,*args,**kwargs):
            result=run(argv,*args,**kwargs)
            if '--publish-team' in argv:codes.append(result.returncode)
            return result
        tracer=patch.object(self.c.subprocess,'run',side_effect=traced);tracer.start();self.addCleanup(tracer.stop)
        # Private /var/lib is a tmpfs of this wrapper; no production root is writable.
        self.index=Path('/var/lib/autopilot-usage/index.json');self.output=self.index.parent/'runs'
        requests=self.index.parent/'registration-requests';requests.mkdir(parents=True);shutil.copyfile(self.request,requests/'run1.json');self.request.unlink()
        shutil.copyfile(self.profile,self.index.parent/'source-profile.json')
        self.declarations=requests;self.request=requests/'run1.json'
        skill=self.root/'release/skill';(skill/'phases').mkdir(parents=True)
        shutil.copyfile(F.PKG/'overlay/phases/dashboard-template.html',skill/'phases/dashboard-template.html')
        (skill.parent/'release.json').write_text(json.dumps(dict(upstream_sha='0'*40,local_revision='time-fixture')))
        spec=importlib.util.spec_from_file_location('_time_publisher_pin',F.PKG/'runtime/ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
        public=self.root/'panels';public.mkdir();os.chown(public,0,self.master.pw_gid);public.chmod(0o2751)
        agent=public/'master';agent.mkdir();os.chown(agent,self.master.pw_uid,self.master.pw_gid);agent.chmod(0o2750)
        meta=dict(run_id='run1',root=str(self.project),release=ap.release_pin(skill),public_root=str(public),agent='master',project_id='project')
        control=self.project/'.autopilot';control.mkdir();os.chown(control,self.master.pw_uid,self.master.pw_gid);control.chmod(0o700)
        lock=control/'operator.lock';lock.touch();os.chown(lock,self.master.pw_uid,self.master.pw_gid);lock.chmod(0o600)
        state=control/'state.js'
        state.write_text('window.STATE='+json.dumps(dict(title='RUN A',rev=0,startedAt=F.ts(0),_sadik=meta)));os.chown(state,self.master.pw_uid,self.master.pw_gid);state.chmod(0o600)
        self.finish()
        first=self.c.collect_tick(self.index,self.output,F.ts(100))
        if first['publishFailures']:
            diagnostic=subprocess.run([sys.executable,'-I','-B',str(F.PKG/'runtime/ap_sadik.py'),'--publish-team',str(self.project),'run1'],user=self.master.pw_uid,group=self.master.pw_gid,extra_groups=[],capture_output=True,text=True,timeout=5)
            self.fail('live fixture publisher failed: '+diagnostic.stderr)
        exported=agent/'project/run1/state.js';value=json.loads(exported.read_text().split('=',1)[1]);self.assertEqual(value['usageTeam']['schemaVersion'],5);self.assertEqual(value['usageTeam']['totals']['inputTokens'],10)
        # AP has moved to RUN B before the600s accounting grace of A expires.
        meta=dict(meta,run_id='runB');body='window.STATE='+json.dumps(dict(title='RUN B KEEP',rev=8,startedAt=F.ts(70),_sadik=meta));state.write_text(body)
        final=self.c.collect_tick(self.index,self.output,F.ts(661))
        self.assertFalse(final['publishFailures'],'archived final v5 was refused by publisher')
        self.assertEqual(state.read_text(),body,'final A must not overwrite private B')
        value=json.loads(exported.read_text().split('=',1)[1]);self.assertEqual(value['usageTeam']['phase'],'final');self.assertEqual(value['usageTeam']['totals']['inputTokens'],10)
        self.assertEqual(codes,[0,0]);print('PROJECT_V5_PUBLISH '+json.dumps(dict(publisherRc=codes,privateClock=True,liveInput=10,finalInput=10,privateBUnchanged=state.read_text()==body)),flush=True)

    def test_broken_source_path_is_only_one_participant_incomplete(self):
        loop=self.root/'loop';loop.symlink_to(loop)
        self.assertTrue(loop.is_symlink());self.assertEqual(os.readlink(loop),str(loop))
        alias=dict(self.record['participants'][0],name='account-alias',home=str(loop))
        self.record['participants'].append(alias);self.write(self.request,self.record)
        print('SOURCE_PATH_LOOP '+json.dumps(dict(target=os.readlink(loop),inode=loop.lstat().st_ino,requestSHA=hashlib.sha256(self.request.read_bytes()).hexdigest())),flush=True)
        try:report=self.tick(100)
        except Exception as exc:self.fail('one broken source aborted healthy participant: '+repr(exc))
        self.assertEqual(report['runs'],1);value=self.receipt();rows={r['participant']:r for r in value['rows']}
        self.assertEqual(rows['master']['status'],'observed');self.assertEqual(rows['master']['totals']['inputTokens'],10)
        self.assertEqual(rows['account-alias']['status'],'incomplete');self.assertIsNone(rows['account-alias']['totals']['inputTokens'])
