"""Asynchronous registration identities, not model-controlled source paths."""
import importlib.util
import unittest
from pathlib import Path

PACKAGE=Path(__file__).resolve().parents[1]

def load():
    source=PACKAGE/'runtime/usage_registration.py'
    if not source.exists():return None
    spec=importlib.util.spec_from_file_location('registration',source)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

class Registration(unittest.TestCase):
    def test_process_context_resolves_exact_tuple_not_latest_request(self):
        import json
        m=load();self.assertIsNotNone(m,'registration resolver missing')
        fixture=json.loads((PACKAGE/'test/fixtures/gamma-engine-process-binding.json').read_text())
        # Gamma's pinned process_requests produced this golden normalization;
        # there is no test-only join. Exercise the real R process consumer.
        rows=fixture['normalized'];who=fixture['operator'];started=fixture['startedAt']
        self.assertEqual(m.operator_tuple(rows,who,started),dict(sessionId='s',sessionCreated=42,turn=1))
        rows.append(dict(rows[0],requestId='two',sessionId='other'))
        with self.assertRaisesRegex(ValueError,'REGISTRATION_CONTEXT_AMBIGUOUS'):m.operator_tuple(rows,who,started)
    def test_missing_kernel_context_is_named_not_guessed(self):
        m=load();self.assertIsNotNone(m,'registration resolver missing')
        process=dict(pid=123,uid=1000,boot='boot-fixture',start='1234');who=dict(uid=1000,boot_id='boot-fixture',chain=[dict(pid=123,starttime='1234')])
        with self.assertRaisesRegex(ValueError,'REGISTRATION_CONTEXT_UNAVAILABLE'):
            m.operator_tuple([dict(kind='request',requestId='latest')],who,'2026-10-17T00:00:01Z')
    def test_peer_birth_identity_has_actual_uid_and_no_environment(self):
        m=load();self.assertIsNotNone(m,'kernel identity reader missing')
        import os
        who=m.process_identity(os.getpid());self.assertEqual(who['pid'],os.getpid());self.assertEqual(who['uid'],os.getuid());self.assertTrue(who['boot']);self.assertTrue(who['start'].isdecimal())

class InitSubmission(unittest.TestCase):
    def test_unavailable_cli_is_named_without_aborting_the_run(self):
        from unittest.mock import patch
        m=load();self.assertTrue(hasattr(m,'submit_from_init'),'init caller missing')
        with patch('subprocess.Popen',side_effect=FileNotFoundError()):
            result=m.submit_from_init('run1','/project','2026-10-17T00:00:01Z',m.process_identity(__import__('os').getpid()))
        self.assertEqual(result['state'],'UNBOUND');self.assertEqual(result['reason'],'REGISTRATION_CLIENT_UNAVAILABLE');self.assertEqual(result['runId'],'run1')

class RegistrationProjection(unittest.TestCase):
    def test_actual_renderer_names_unbound_registration(self):
        import json,subprocess,tempfile
        value=dict(schemaVersion=1,runId='run1',state='UNBOUND',reason='POSTMAN_CONNECT_UNAVAILABLE',startedAt='2026-10-17T00:00:01Z',acceptedAt=None,registeredAt=None,authority='client_report')
        text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();begin,end='/*STATE-BEGIN*/','/*STATE-END*/';before,tail=text.split(begin);_,after=tail.split(end)
        with tempfile.TemporaryDirectory() as tmp:
            page=Path(tmp)/'page.html';page.write_text(before+begin+'window.STATE='+json.dumps(dict(title='copy',rev=1,usageRegistration=value))+';'+end+after)
            result=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page)],capture_output=True,text=True,check=True)
        rendered=json.loads(result.stdout);self.assertEqual(rendered['errors'],[]);self.assertIn('POSTMAN_CONNECT_UNAVAILABLE',rendered['html']);self.assertIn('UNBOUND',rendered['html'])

class BestEffortCleanup(unittest.TestCase):
    def test_exited_process_group_does_not_escape_init(self):
        from unittest.mock import patch
        import subprocess,os
        m=load()
        class Child:
            pid=12345
            calls=0
            def communicate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:raise subprocess.TimeoutExpired('fixture',.75)
                return b'',b''
            def poll(self):return None
        with patch('subprocess.Popen',return_value=Child()),patch.object(m.os,'killpg',side_effect=ProcessLookupError()):
            try:result=m.submit_from_init('run1','/project','2026-10-17T00:00:01Z',m.process_identity(os.getpid()))
            except ProcessLookupError:self.fail('best-effort cleanup escaped into AP init')
        self.assertEqual(result['state'],'UNBOUND');self.assertEqual(result['reason'],'REGISTRATION_SUBMIT_TIMEOUT')

class GatewayTail(unittest.TestCase):
    def read_tail(self,root,raw,*,budget=None,runtime=None):
        import os
        from test_runtime_receipt_source import module
        n=runtime or module();r=load();self.assertTrue(callable(getattr(r,'gateway_tail',None)),'bounded G tail reader missing')
        path=root/'gateway.jsonl';path.write_bytes(raw);path.chmod(0o600)
        p=dict(uid=os.getuid(),home=str(root),sources=dict(gateway=str(path)))
        meter=n.Meter(n.LIMIT if budget is None else budget)
        return r.gateway_tail(n,meter,p,n.iso(1000000)),meter
    def test_unproven_large_prefix_refuses_instead_of_hiding_ambiguity(self):
        import tempfile,json
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old=(json.dumps(dict(observedAt=0,padding='x'*1024))+'\n').encode()
            recent=dict(observedAt=999999,kind='recent')
            from test_runtime_receipt_source import module
            n=module()
            raw=old*(n.LIMIT//len(old)+1)+(json.dumps(recent)+'\n').encode()
            self.assertGreater(len(raw),n.LIMIT)
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED'):
                self.read_tail(root,raw,runtime=n)
    def test_exact_window_boundary_is_included(self):
        import tempfile,json
        rows=[dict(generation='old',observedAt=399999),dict(generation='boundary',observedAt=399999),dict(generation='boundary',observedAt=400000),dict(generation='current',observedAt=1000000)]
        with tempfile.TemporaryDirectory() as tmp:
            result,_=self.read_tail(Path(tmp),''.join(json.dumps(r)+'\n' for r in rows).encode())
        self.assertEqual(result,rows[1:])
    def test_partial_last_record_refuses(self):
        import tempfile
        from test_runtime_receipt_source import module
        n=module()
        with tempfile.TemporaryDirectory() as tmp,self.assertRaisesRegex(n.Incomplete,'REGISTRATION_CONTEXT_UNAVAILABLE'):
            self.read_tail(Path(tmp),b'{"observedAt":1000000}',runtime=n)
    def test_full_recent_window_over_budget_refuses_instead_of_partial_zero(self):
        import tempfile,json
        from test_runtime_receipt_source import module
        data=((json.dumps(dict(observedAt=999999,padding='x'*512))+'\n')*20).encode()
        n=module()
        with tempfile.TemporaryDirectory() as tmp,self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED'):
            self.read_tail(Path(tmp),data,budget=1024,runtime=n)

    def test_recent_heartbeat_keeps_the_complete_long_generation(self):
        import copy,json,tempfile
        from test_gateway_receipt_source import fixture,GatewaySource
        fx=fixture();GatewaySource().process_binding(fx);rows=copy.deepcopy(fx[1])
        heartbeat=dict(rows[-1],kind='watermark',observedAt=1000000,at=1000000,seq=len(rows)+1);rows.append(heartbeat)
        self.assertTrue(all(r['observedAt']<400000 for r in rows[:-1]))
        with tempfile.TemporaryDirectory() as tmp:
            selected,_=self.read_tail(Path(tmp),''.join(json.dumps(r)+'\n' for r in rows).encode())
        self.assertEqual(selected,rows,'fresh heartbeat must retain seq1 and the early binding')
        self.assertEqual(fx[0].process_requests(selected,fx[2])[0]['requestId'],'request-one')

    def test_wholly_old_generation_is_discarded_whole_despite_interleaving(self):
        import copy,json,tempfile
        from test_gateway_receipt_source import fixture,GatewaySource
        fx=fixture();GatewaySource().process_binding(fx);old=copy.deepcopy(fx[1]);recent=copy.deepcopy(fx[1])
        for r in old:
            r.update(generation='wholly-old',requestId='old-request')
            if 'request_id' in r:r['request_id']='old-request'
        recent.append(dict(recent[-1],kind='watermark',observedAt=1000000,at=1000000,seq=len(recent)+1))
        encode=lambda rows:''.join(json.dumps(r)+'\n' for r in rows).encode()
        with tempfile.TemporaryDirectory() as tmp:
            for mixed in (old+recent,recent+old,recent[:2]+old+recent[2:]):
                selected,_=self.read_tail(Path(tmp),encode(mixed));self.assertEqual(selected,recent)
                self.assertEqual(fx[0].process_requests(selected,fx[2])[0]['requestId'],'request-one')

    def test_old_late_duplicate_binding_and_recent_heartbeat_still_ambiguous(self):
        import copy,json,tempfile,hashlib
        from test_gateway_receipt_source import fixture,GatewaySource
        fx=fixture();GatewaySource().process_binding(fx);healthy=copy.deepcopy(fx[1]);healthy.append(dict(healthy[-1],kind='watermark',observedAt=1000000,at=1000000,seq=len(healthy)+1))
        broken=copy.deepcopy(healthy);binding=next(r for r in broken if r['kind']=='engine_process_binding');broken.insert(broken.index(binding)+1,dict(binding))
        for i,r in enumerate(broken):r['seq']=i+1
        encode=lambda rows:''.join(json.dumps(r)+'\n' for r in rows).encode()
        before,after=encode(healthy),encode(broken);self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest());self.assertEqual(sum(r['kind']=='engine_process_binding' for r in broken),2)
        print('GENERATION-DAMAGE old late binding count1->2 SHA',hashlib.sha256(before).hexdigest(),'->',hashlib.sha256(after).hexdigest(),flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            selected,_=self.read_tail(Path(tmp),before)
            # Old row filtering leaves only a heartbeat, even on this healthy input.
            # The negative assertion below distinguishes UNAVAILABLE from AMBIGUOUS.
            damaged,_=self.read_tail(Path(tmp),after)
            with self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_AMBIGUOUS'):fx[0].process_requests(damaged,fx[2])
            restored,_=self.read_tail(Path(tmp),before);self.assertEqual(restored,selected)
            self.assertEqual(fx[0].process_requests(restored,fx[2])[0]['requestId'],'request-one')

    def test_unidentifiable_generation_cannot_be_silently_discarded(self):
        import json,tempfile
        from test_runtime_receipt_source import module
        n=module()
        with tempfile.TemporaryDirectory() as tmp:
            for generation in (None,1,[],{},'', 'x'*257):
                with self.assertRaisesRegex(n.Incomplete,'REGISTRATION_CONTEXT_UNAVAILABLE'):
                    self.read_tail(Path(tmp),(json.dumps(dict(generation=generation,observedAt=0))+'\n').encode(),runtime=n)

    def test_interleaved_old_observer_cannot_hide_a_recent_conflict(self):
        import copy,json,tempfile,hashlib
        from test_gateway_receipt_source import fixture,GatewaySource
        fx=fixture();GatewaySource().process_binding(fx);recent=copy.deepcopy(fx[1])
        for row in recent:row['observedAt']+=500000
        old=copy.deepcopy(fx[1]);other=copy.deepcopy(recent)
        for rows,generation,rid in [(old,'old-observer','old-request'),(other,'other-observer','other-request')]:
            for row in rows:
                row.update(generation=generation,requestId=rid)
                if 'request_id' in row:row['request_id']=rid
        encode=lambda rows:''.join(json.dumps(row)+'\n' for row in rows).encode()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);healthy=encode(recent);damaged=encode(other+old+recent)
            self.assertNotEqual(hashlib.sha256(healthy).hexdigest(),hashlib.sha256(damaged).hexdigest())
            before,_=self.read_tail(root,healthy);self.assertEqual(fx[0].process_requests(before,fx[2])[0]['requestId'],'request-one')
            rows,_=self.read_tail(root,damaged)
            self.assertEqual(len(rows),len(recent)+len(other))
            with self.assertRaisesRegex(fx[0].Incomplete,'REGISTRATION_CONTEXT_AMBIGUOUS'):fx[0].process_requests(rows,fx[2])
            restored,_=self.read_tail(root,healthy);self.assertEqual(restored,before)

    def test_interleaved_old_observer_cannot_cut_a_recent_sequence(self):
        import copy,json,tempfile
        from test_gateway_receipt_source import fixture,GatewaySource
        fx=fixture();GatewaySource().process_binding(fx);recent=copy.deepcopy(fx[1])
        for row in recent:row['observedAt']+=500000
        old=copy.deepcopy(fx[1])
        for row in old:
            row.update(generation='old-observer',requestId='old-request')
            if 'request_id' in row:row['request_id']='old-request'
        encode=lambda rows:''.join(json.dumps(row)+'\n' for row in rows).encode()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);before,_=self.read_tail(root,encode(recent))
            rows,_=self.read_tail(root,encode(recent[:2]+old+recent[2:]));self.assertEqual(rows,before)
            self.assertEqual(fx[0].process_requests(rows,fx[2]),fx[0].process_requests(before,fx[2]))
            restored,_=self.read_tail(root,encode(recent));self.assertEqual(restored,before)

class ReceiverAncestry(unittest.TestCase):
    def test_receiver_captures_kernel_peer_birth_and_parent(self):
        import os
        m=load();self.assertTrue(hasattr(m.shared,'capture_ancestry'),'receiver ancestry capture missing')
        value=m.shared.capture_ancestry(os.getpid(),os.getuid())
        self.assertEqual(value['chain'][0]['pid'],os.getpid());self.assertEqual(value['chain'][0]['starttime'],m.process_identity(os.getpid())['start'])
        self.assertTrue(any(p['pid']==os.getppid() for p in value['chain']));self.assertTrue(value['boot_id'])
    def test_pid_reuse_and_boot_mismatch_cannot_bind(self):
        m=load();self.assertTrue(hasattr(m.shared,'capture_ancestry'),'chain tuple interface missing');who=dict(uid=1000,boot_id='this-boot',chain=[dict(pid=12,starttime='345')])
        row=dict(kind='request',requestId='r',uid=1000,sessionId='s',sessionCreated=42,dshTurn=1,startedAt='2026-10-17T00:00:00Z',endedAt=None,sourceProcess=dict(pid=12,start='346',boot='this-boot'))
        with self.assertRaisesRegex(ValueError,'REGISTRATION_CONTEXT_UNAVAILABLE'):m.operator_tuple([row],who,'2026-10-17T00:00:01Z')
        row['sourceProcess'].update(start='345',boot='previous-boot')
        with self.assertRaisesRegex(ValueError,'REGISTRATION_CONTEXT_UNAVAILABLE'):m.operator_tuple([row],who,'2026-10-17T00:00:01Z')
        row['sourceProcess']['boot']='this-boot';self.assertEqual(m.operator_tuple([row],who,'2026-10-17T00:00:01Z'),dict(sessionId='s',sessionCreated=42,turn=1))
    def test_unavailable_proc_is_a_named_capture_error_not_a_mail_failure(self):
        from unittest.mock import patch
        m=load()
        with patch.object(m.shared.Path,'read_text',side_effect=PermissionError()):
            try:value=m.shared.capture_ancestry(123,1000)
            except OSError:self.fail('accounting proc failure escaped into mail accept')
        self.assertEqual(value['error'],'REGISTRATION_CHAIN_UNAVAILABLE');self.assertEqual(value['chain'],[])

class GatewaySnapshotBudget(unittest.TestCase):
    def test_exact_byte_budget_is_not_spent_twice_on_lf(self):
        import tempfile,json
        from test_runtime_receipt_source import module
        n=module();r=load();raw=b'{"generation":"g","observedAt":1000000}\n'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'g';path.write_bytes(raw);path.chmod(0o600)
            p=dict(uid=__import__('os').getuid(),home=tmp,sources=dict(gateway=str(path)))
            meter=n.Meter(len(raw));rows=r.gateway_tail(n,meter,p,n.iso(1000000))
        self.assertEqual(rows,[dict(generation='g',observedAt=1000000)]);self.assertEqual(meter.bytes,len(raw))
    def test_size_and_elapsed_survive_budget_failure(self):
        import tempfile,os
        from test_runtime_receipt_source import module
        n=module();r=load()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'g';path.write_bytes(b'x'*2049);path.chmod(0o600)
            p=dict(uid=os.getuid(),home=tmp,sources=dict(gateway=str(path)))
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:r.gateway_tail(n,n.Meter(2048),p,n.iso(1000000))
        detail=error.exception.gatewaySnapshot
        self.assertEqual(detail['sizeBytes'],2049);self.assertEqual(detail['byteLimit'],134283264);self.assertEqual(detail['secondsLimit'],r.G_READ_SECONDS)
        self.assertGreaterEqual(detail['elapsedSeconds'],0);self.assertEqual(detail['readBytes'],0)
    def test_time_budget_names_elapsed_and_size_before_parsing(self):
        import tempfile,os,time
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        n=module();r=load();pread=r.os.pread
        def slow(fd,size,offset):
            time.sleep(.03);return pread(fd,size,offset)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'g';path.write_bytes(b'{"observedAt":1000000}\n');path.chmod(0o600)
            p=dict(uid=os.getuid(),home=tmp,sources=dict(gateway=str(path)))
            with patch.object(r.os,'pread',side_effect=slow),self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:
                r.gateway_tail(n,n.Meter(deadline=time.monotonic()+.01),p,n.iso(1000000))
        self.assertEqual(error.exception.gatewaySnapshot['sizeBytes'],23);self.assertGreaterEqual(error.exception.gatewaySnapshot['elapsedSeconds'],.03)

    def test_shared_sdk_budget_retains_the_already_read_gateway_snapshot(self):
        import json,tempfile,os
        from test_runtime_receipt_source import RuntimeSource
        from test_gateway_receipt_source import fixture,GatewaySource
        r=load()
        with tempfile.TemporaryDirectory() as tmp:
            n,p,_=RuntimeSource().files(Path(tmp));fx=fixture();binding=GatewaySource().process_binding(fx)
            raw=''.join(json.dumps(row)+'\n' for row in fx[1]).encode();Path(p['sources']['gateway']).write_bytes(raw)
            who=dict(uid=os.getuid(),boot_id=binding['boot_id'],chain=[dict(pid=binding['enginePid'],starttime=binding['engineStart'])])
            request=dict(participant=p,registrationContext=dict(operator=who,startedAt=n.iso(1200),acceptedAt=n.iso(2000)),budget=n.LIMIT,seconds=3)
            healthy=r.owner_context(n,request);self.assertEqual(healthy['operator'],dict(sessionId='s',sessionCreated=42,turn=1))
            request['budget']=len(raw)+100
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:r.owner_context(n,request)
            self.assertEqual(error.exception.gatewaySnapshot['sizeBytes'],len(raw));self.assertEqual(error.exception.gatewaySnapshot['readBytes'],len(raw));self.assertGreaterEqual(error.exception.gatewaySnapshot['elapsedSeconds'],0)
            request['budget']=n.LIMIT;self.assertEqual(r.owner_context(n,request)['operator'],healthy['operator'])


class IndependentRegistrationBudgets(unittest.TestCase):
    def test_gateway_over_16mib_does_not_spend_the_sdk_native_grant(self):
        import json,tempfile,os,copy
        from test_runtime_receipt_source import RuntimeSource
        from test_gateway_receipt_source import fixture,GatewaySource
        r=load()
        with tempfile.TemporaryDirectory() as tmp:
            n,p,_=RuntimeSource().files(Path(tmp));fx=fixture();binding=GatewaySource().process_binding(fx)
            usage=next(v for v in fx[1] if v['kind']=='protocol_usage');pad=dict(usage,benchmarkPadding='x'*32768)
            rows=[]
            for row in fx[1]:
                rows.append(dict(row))
                if row['kind']=='protocol_usage':rows.extend(dict(pad) for _ in range(520))
            for i,row in enumerate(rows):row['seq']=i+1
            raw=''.join(json.dumps(row)+'\n' for row in rows).encode();self.assertGreater(len(raw),16777216);self.assertTrue(all(len(json.dumps(row).encode())<65536 for row in rows))
            Path(p['sources']['gateway']).write_bytes(raw)
            who=dict(uid=os.getuid(),boot_id=binding['boot_id'],chain=[dict(pid=binding['enginePid'],starttime=binding['engineStart'])])
            request=dict(participant=p,registrationContext=dict(operator=who,startedAt=n.iso(1200),acceptedAt=n.iso(2000)),budget=n.LIMIT,seconds=3)
            value=r.owner_context(n,request)
            self.assertEqual(value['operator'],dict(sessionId='s',sessionCreated=42,turn=1));self.assertEqual(value['gatewayBytes'],len(raw));self.assertLess(value['sourceBytes'],16777216)
            self.assertGreaterEqual(value['gatewaySeconds'],0);self.assertGreaterEqual(value['metadataSeconds'],0)
    def test_gateway_grant_is_independent_and_cannot_disable_sdk_limit(self):
        import json,tempfile,os
        from test_runtime_receipt_source import RuntimeSource
        from test_gateway_receipt_source import fixture,GatewaySource
        r=load()
        with tempfile.TemporaryDirectory() as tmp:
            n,p,_=RuntimeSource().files(Path(tmp));fx=fixture();binding=GatewaySource().process_binding(fx);raw=''.join(json.dumps(row)+'\n' for row in fx[1]).encode();Path(p['sources']['gateway']).write_bytes(raw)
            who=dict(uid=os.getuid(),boot_id=binding['boot_id'],chain=[dict(pid=binding['enginePid'],starttime=binding['engineStart'])])
            request=dict(participant=p,registrationContext=dict(operator=who,startedAt=n.iso(1200),acceptedAt=n.iso(2000)),budget=100,seconds=3,gatewayBudget=134283264,gatewaySeconds=3)
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:r.owner_context(n,request)
            self.assertEqual(error.exception.gatewayBytes,len(raw));self.assertEqual(error.exception.sourceBytes,0);self.assertEqual(error.exception.budgetScope,'metadata')
            request['budget']=n.LIMIT;request['gatewayBudget']=len(raw)-1
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:r.owner_context(n,request)
            self.assertEqual(error.exception.gatewayBytes,0);self.assertEqual(error.exception.budgetScope,'gateway')
            request['gatewayBudget']=134283264;self.assertEqual(r.owner_context(n,request)['operator'],dict(sessionId='s',sessionCreated=42,turn=1))


class SplitBudgetFailures(unittest.TestCase):
    def test_owner_timeout_exit_race_preserves_full_grants(self):
        import subprocess,os
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        n=module()
        class Child:
            pid=12345;calls=0
            def communicate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:raise subprocess.TimeoutExpired('fixture',.01)
                return b'',b''
        req=dict(participant=dict(name='root',uid=0,gid=0),budget=100,registrationContext={},gatewayBudget=200,gatewaySeconds=.01)
        with patch.object(n.os,'geteuid',return_value=0),patch.object(n.subprocess,'Popen',return_value=Child()),patch.object(n.os,'killpg',side_effect=ProcessLookupError()):
            with self.assertRaisesRegex(n.Incomplete,'BUDGET_EXCEEDED') as error:n.owner_export(req,'/usr/bin/true',.01)
        self.assertEqual(error.exception.sourceBytes,100);self.assertIsNone(error.exception.gatewayBytes);self.assertIsNone(error.exception.gatewaySeconds)
    def test_invalid_g_reply_cannot_credit_the_other_reported_count(self):
        import json
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        n=module()
        class Child:
            pid=12345;returncode=2
            def communicate(self,*args,**kwargs):return json.dumps(dict(sourceBytes=23,gatewayBytes='bad',gatewaySeconds=0,metadataSeconds=0,error='BUDGET_EXCEEDED')).encode(),b''
        req=dict(participant=dict(name='root',uid=0,gid=0),budget=100,registrationContext={},gatewayBudget=200,gatewaySeconds=.01)
        with patch.object(n.os,'geteuid',return_value=0),patch.object(n.subprocess,'Popen',return_value=Child()):
            with self.assertRaises(n.Incomplete) as error:n.owner_export(req,'/usr/bin/true',.01)
        self.assertEqual(error.exception.sourceBytes,100);self.assertIsNone(error.exception.gatewayBytes)
    def test_preparation_failure_adds_registration_metadata_and_keeps_g_separate(self):
        import contextlib,io,json,time
        from types import SimpleNamespace
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        n=module();registration=dict(sourceBytes=1000,gatewayBytes=2000,gatewaySeconds=.01,metadataSeconds=.02,failed=[],blocked=False)
        prepared=dict(idle=False,index=None,sourceBytes=200,failed=[],cut='fixture');out=io.StringIO()
        with patch.object(n,'advance_finalizations',return_value=dict(results=[],failed=[],sourceBytes=0)),patch.object(n,'retry_closed_publications',return_value=[]),patch.object(n,'prepare',return_value=prepared),patch.object(n,'publish_failed_runs',return_value=[]),contextlib.redirect_stdout(out):
            rc=n._collect_locked(SimpleNamespace(index='/fixture-index',output='/fixture-output'),time.monotonic(),registration)
        value=json.loads(out.getvalue());self.assertEqual(rc,2);self.assertEqual(value['sourceBytes'],1200);self.assertEqual(value['registration']['gatewayBytes'],2000)


class BearingKernelTuple(unittest.TestCase):
    def test_consistent_raw_process_forgery_stops_at_kernel_tuple(self):
        import os,json,hashlib,tempfile
        from test_gateway_receipt_source import fixture,GatewaySource
        m=load();identity=m.process_identity(os.getpid());who=m.shared.capture_ancestry(os.getpid(),os.getuid());fx=fixture();g=fx[0];binding=GatewaySource().process_binding(fx)
        binding.update(enginePid=identity['pid'],engineStart=identity['start'],boot_id=identity['boot'],sourceProcess=dict(pid=identity['pid'],start=identity['start'],boot=identity['boot']))
        expected=dict(sessionId='s',sessionCreated=42,turn=1);start=g.iso(1200)
        self.assertEqual(m.operator_tuple(g.process_requests(fx[1],fx[2]),who,start),expected)
        before=''.join(json.dumps(row)+'\n' for row in fx[1]).encode();old_start=binding['engineStart'];old_boot=binding['boot_id']
        forged_boot=('1' if old_boot[0]!='1' else '2')+old_boot[1:];binding.update(engineStart=str(int(old_start)+1),boot_id=forged_boot);binding['sourceProcess']=dict(pid=identity['pid'],start=binding['engineStart'],boot=forged_boot)
        after=''.join(json.dumps(row)+'\n' for row in fx[1]).encode();self.assertNotEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(after).hexdigest());self.assertEqual(after.count(('"engineStart": "'+binding['engineStart']+'"').encode()),1);self.assertEqual(after.count(('"boot_id": "'+forged_boot+'"').encode()),1)
        print('KERNEL-TUPLE-DAMAGE '+json.dumps(dict(fields=['engineStart','boot_id','sourceProcess.start','sourceProcess.boot'],replacements=4,beforeSHA256=hashlib.sha256(before).hexdigest(),afterSHA256=hashlib.sha256(after).hexdigest())),flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'gateway.jsonl';path.write_bytes(after);path.chmod(0o600);rows=[g.core.strict_json(row) for row in path.read_bytes().splitlines()]
            projected=g.process_requests(rows,fx[2]);self.assertEqual(projected[0]['sourceProcess']['start'],binding['engineStart']);self.assertEqual(projected[0]['sourceProcess']['boot'],forged_boot)
            self.assertEqual(m.process_identity(os.getpid()),identity,'the kernel identity was not changed with the fabricated G metadata')
            with self.assertRaisesRegex(ValueError,'REGISTRATION_CONTEXT_UNAVAILABLE'):m.operator_tuple(projected,who,start)
            path.write_bytes(before);restored=[g.core.strict_json(row) for row in path.read_bytes().splitlines()];self.assertEqual(m.operator_tuple(g.process_requests(restored,fx[2]),who,start),expected)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),hashlib.sha256(before).hexdigest())

class RegistrationRetryPublication(unittest.TestCase):
    def test_pending_and_final_root_status_keep_the_old_public_wire(self):
        from unittest.mock import patch
        m=load();request=dict(runId='one',project='/fixture',startedAt='2026-10-17T00:00:00Z')
        at=1760659200
        pending=m.status_value(request,'a'*64,'UNBOUND','REGISTRATION_CONTEXT_UNAVAILABLE',at,terminal=False)
        final=m.status_value(request,'a'*64,'UNBOUND','REGISTRATION_RETRY_EXPIRED',at)
        legacy={k:v for k,v in final.items() if k not in {'terminal','retryUntil'}}
        for status in (pending,final,legacy):
            with patch.object(m,'trusted_status',return_value=status):value=m.public_registration('one','/fixture',None)
            self.assertEqual(value['authority'],'root');self.assertEqual(value['reason'],status['reason']);self.assertNotIn('terminal',value);self.assertNotIn('retryUntil',value)
        for bad in (dict(pending,terminal=0),dict(pending,retryUntil=pending['acceptedAt']),dict(pending,reason='BUDGET_EXCEEDED'),dict(final,retryUntil=pending['retryUntil'])):
            with patch.object(m,'trusted_status',return_value=bad):self.assertIsNone(m.public_registration('one','/fixture',None))

class RetryClassification(unittest.TestCase):
    def data(self):
        import copy,json,os
        from test_gateway_receipt_source import load as gateway_load
        fixture=json.loads((PACKAGE/'test/fixtures/gamma-engine-process-binding.json').read_text())
        rows=copy.deepcopy(fixture['raw']);who=copy.deepcopy(fixture['operator']);who['uid']=os.getuid()
        for r in rows:r['uid']=os.getuid()
        return gateway_load(),rows,who,dict(uid=os.getuid(),name='master',engine='codex')
    def test_pending_prefix_cannot_hide_duplicate_complete_process(self):
        import copy
        m=load();g,rows,who,p=self.data();prefix=[copy.deepcopy(rows[0])];other=copy.deepcopy(rows)
        for vector,suffix in ((prefix,'prefix'),(other,'other')):
            for r in vector:
                for key in ('generation','processGeneration','requestId','requestGeneration','processEpoch','sessionId'):r[key]+='-'+suffix
                if 'request_id' in r:r['request_id']=r['requestId']
        with self.assertRaisesRegex(g.Incomplete,'AMBIGUOUS'):g.process_requests(rows+other,p)
        self.assertFalse(m.append_pending(g,prefix+rows+other,p))
    def test_auth_or_epoch_before_start_is_not_append_repairable(self):
        m=load();g,rows,who,p=self.data()
        for kind in ('auth','watermark'):
            self.assertFalse(m.append_pending(g,[dict(rows[0],kind=kind)],p),kind)
    def test_partial_lf_never_grants_retry_without_proof_of_append_only_prefix(self):
        import tempfile,os,json
        from test_runtime_receipt_source import module
        n=module();m=load();g,rows,who,p=self.data();rows.insert(2,dict(rows[1]))
        for i,r in enumerate(rows):r['seq']=i+1
        raw=''.join(json.dumps(r)+'\n' for r in rows).encode()+b'{'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'g';path.write_bytes(raw);path.chmod(0o600);p.update(home=tmp,sources=dict(gateway=str(path)))
            with self.assertRaises(n.Incomplete) as error:m.gateway_tail(n,n.Meter(n.LIMIT),p,n.iso(1300))
        self.assertFalse(getattr(error.exception,'retryable',False),'partial LF concealed permanent failure and granted retry')
    def test_lagging_watermark_cannot_hide_operator_ambiguity(self):
        import tempfile,os,json,copy
        from test_runtime_receipt_source import module
        n=module();m=load();g,rows,who,p=self.data();other=copy.deepcopy(rows)
        for r in other:
            for key in ('generation','processGeneration','requestId','requestGeneration','processEpoch','sessionId'):r[key]+='-other'
            if 'request_id' in r:r['request_id']=r['requestId']
            if 'enginePid' in r:r.update(enginePid=124,engineStart='1235')
        who['chain'].append(dict(pid=124,starttime='1235'))
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'g';path.write_text(''.join(json.dumps(r)+'\n' for r in rows+other));path.chmod(0o600);p.update(gid=os.getgid(),home=tmp,sources=dict(gateway=str(path)))
            request=dict(participant=p,budget=n.LIMIT,seconds=3,registrationContext=dict(operator=who,acceptedAt=n.iso(1300),startedAt=n.iso(3000)))
            with self.assertRaises(n.Incomplete) as error:m.owner_context(n,request)
        self.assertEqual(str(error.exception),'REGISTRATION_CONTEXT_AMBIGUOUS');self.assertFalse(getattr(error.exception,'retryable',False))

    def test_pending_prefix_cannot_hide_conflicting_kernel_ancestors(self):
        import copy
        m=load();g,rows,who,p=self.data();prefix=[copy.deepcopy(rows[0])];other=copy.deepcopy(rows)
        for vector,suffix in ((prefix,'prefix'),(other,'other')):
            for r in vector:
                for key in ('generation','processGeneration','requestId','requestGeneration','processEpoch','sessionId'):r[key]+='-'+suffix
                if 'request_id' in r:r['request_id']=r['requestId']
        for r in other:
            if 'enginePid' in r:r.update(enginePid=124,engineStart='1235')
        who['chain'].append(dict(pid=124,starttime='1235'))
        with self.assertRaisesRegex(ValueError,'AMBIGUOUS'):m.operator_tuple(g.process_requests(rows+other,p),who,'1970-01-01T00:00:01.200000+00:00')
        self.assertFalse(m.append_pending(g,prefix+rows+other,p,who,'1970-01-01T00:00:01.200000+00:00'))

class RetryReleaseContract(unittest.TestCase):
 def test_retry_window_comes_from_release_formula_and_tracks_timer(self):
  import json,tempfile,shutil,importlib.util
  values=json.loads((PACKAGE/'runtime/usage-reader-limits.json').read_text());self.assertIn('registrationRetry',values,'retry formula missing from release data')
  self.assertEqual(load().REGISTRATION_RETRY_SECONDS,180)
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);shutil.copyfile(PACKAGE/'runtime/usage_registration.py',root/'usage_registration.py');shutil.copyfile(PACKAGE/'lib/mail_registration.py',root/'mail_registration.py');values['registrationRetry']['timerSeconds']=120;(root/'usage-reader-limits.json').write_text(json.dumps(values))
   spec=importlib.util.spec_from_file_location('changed_retry_release',root/'usage_registration.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);self.assertEqual(m.REGISTRATION_RETRY_SECONDS,300)


class LegacySegmentGuard(unittest.TestCase):
    def test_segment_markers_refuse_before_g_open_then_restore_legacy(self):
        import os,tempfile
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'gateway-v1.jsonl';path.write_bytes(b'{"generation":"g","observedAt":1000000}\n');path.chmod(0o600)
            n=module();m=load();p=dict(uid=os.getuid(),home=tmp,sources=dict(gateway=str(path)))
            for name in ('segments','manifest','manifest.json','source.json','gateway-v1.jsonl.source.json'):
                with self.subTest(marker=name):
                    marker=root/name;marker.mkdir(mode=0o700) if name=='segments' else marker.touch(mode=0o600)
                    opened=[];original=m.os.open
                    def watch(value,*args,**kwargs):
                        if Path(value)==path:opened.append(str(value))
                        return original(value,*args,**kwargs)
                    try:
                        with patch.object(m.os,'open',side_effect=watch),self.assertRaisesRegex(n.Incomplete,'RETENTION_GAP'):
                            m.gateway_tail(n,n.Meter(),p,n.iso(1000000))
                        self.assertEqual(opened,[],'legacy file was opened despite segmented history')
                    finally:marker.rmdir() if marker.is_dir() else marker.unlink()
                    self.assertEqual(m.gateway_tail(n,n.Meter(),p,n.iso(1000000)),[dict(generation='g',observedAt=1000000)])
    def test_dangling_segment_marker_is_not_silent_legacy_fallback(self):
        import os,tempfile
        from test_runtime_receipt_source import module
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'gateway-v1.jsonl';path.write_bytes(b'{"generation":"g","observedAt":1000000}\n');path.chmod(0o600);marker=path.parent/'segments';marker.symlink_to('missing-history')
            n=module();m=load();p=dict(uid=os.getuid(),home=tmp,sources=dict(gateway=str(path)))
            with self.assertRaisesRegex(n.Incomplete,'RETENTION_GAP'):m.gateway_tail(n,n.Meter(),p,n.iso(1000000))
            marker.unlink();self.assertEqual(len(m.gateway_tail(n,n.Meter(),p,n.iso(1000000))),1)


class LegacySegmentRace(unittest.TestCase):
    def test_marker_appearing_at_open_refuses_before_rows_are_used(self):
        import os,tempfile
        from unittest.mock import patch
        from test_runtime_receipt_source import module
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'gateway-v1.jsonl';path.write_bytes(b'{"generation":"C","observedAt":1000000}\n');path.chmod(0o600);n=module();m=load();p=dict(uid=os.getuid(),home=tmp,sources=dict(gateway=str(path)));real=m.os.open
            def change(value,*args,**kwargs):
                if Path(value)==path:(path.parent/'segments').mkdir(mode=0o700)
                return real(value,*args,**kwargs)
            with patch.object(m.os,'open',side_effect=change),self.assertRaisesRegex(n.Incomplete,'RETENTION_GAP'):m.gateway_tail(n,n.Meter(),p,n.iso(1000000))
            (path.parent/'segments').rmdir();self.assertEqual(len(m.gateway_tail(n,n.Meter(),p,n.iso(1000000))),1)
class WriterServiceProfile(unittest.TestCase):
    def profile(self,participants):
        return dict(schemaVersion=1,mailDatabase='/private/mail.sqlite',projectRoots=['/private'],participants=participants)
    def test_every_source_requires_a_writer_service_even_on_idle_validation(self):
        from test_runtime_receipt_source import module
        n=module();r=load();profile=self.profile([dict(name='master',tgService='master.service'),dict(name='worker')])
        with self.assertRaisesRegex(n.Incomplete,'REGISTRATION_PROFILE_INVALID'):r.profile_record(n,profile,'/private/index.json')
    def test_service_field_accepts_unit_tokens_and_rejects_argv_or_paths(self):
        from test_runtime_receipt_source import module
        n=module();r=load()
        for unit in ['',None,True,'--all','../master.service','master.service;id','master.service\nother.service','master']:
            with self.subTest(unit=unit),self.assertRaisesRegex(n.Incomplete,'REGISTRATION_PROFILE_INVALID'):r.profile_record(n,self.profile([dict(name='master',tgService=unit)]),'/private/index.json')
        for unit in ['master.service','tg@worker.service','worker-prod.service']:
            r.profile_record(n,self.profile([dict(name='master',tgService=unit)]),'/private/index.json')
    def test_watcher_metadata_is_not_forwarded_to_billing_record_or_executed(self):
        from test_runtime_receipt_source import module
        from unittest.mock import patch
        n=module();r=load();seen=[];participant=dict(name='master',tgService='master.service',runtimeSource=dict(raw='/private/R'))
        def validate(record,reservation):seen.append(record)
        with patch.object(n,'validate_record',side_effect=validate),patch.object(n.subprocess,'run',side_effect=AssertionError('reader must not execute service name')):
            r.profile_record(n,self.profile([participant]),'/private/index.json',{'master'})
        self.assertNotIn('tgService',seen[0]['participants'][0]);self.assertEqual(seen[0]['participants'][0]['runtimeSource'],dict(raw='/private/R'))
