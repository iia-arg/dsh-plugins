"""Entered only inside the root test namespace; real root supplier -> owner -> consumer."""
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest
import _runtime_receipt_root as existing

class RootOwnership(unittest.TestCase):
    _source_fixed_epoch=True
    setUp=existing.ProtectedPipeline.setUp
    register=existing.ProtectedPipeline.register
    def registered_fixture(self):
        self.assertTrue(callable(getattr(self.m,'root_ownership_runs',None)),'root supplier has no ownership-context caller')
        self.register()
    def test_registered_scope_reaches_real_collector_and_receipt(self):
        self.registered_fixture()
        prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual(prepared['failed'],[],prepared)
        index=self.m.core.trusted_json(prepared['index']);record=self.m.core.trusted_json(index['runs'][0]['record'])
        self.assertEqual(record['ownershipPolicy'],'session-interval')
        self.m.core.verify_record_origin(record,self.m.LIMIT-prepared['sourceBytes'])
        receipt=self.m.core.collect_record(record,prepared['cut'],{},drop_identity=True)['receipt']
        self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals']['inputTokens'],700)
        self.assertEqual(receipt['ownershipPolicy'],'session-interval');self.assertEqual(receipt['ownershipRuleVersion'],3)
        self.m.core.public_receipt(receipt,'run1')

    def test_prepare_failure_cannot_seal_finish_past_h_then_return_seals_h(self):
        import os,pwd
        from unittest.mock import patch
        self.registered_fixture()
        pin=self.index.parent/'run-window/run1.json';value=self.m.core.trusted_json(pin)
        value['finishedAt']=self.m.iso(9000000);self.m.atomic(pin,value)
        for p in self.record['participants']:
            for file in (p['runtimeSource']['raw'],p['sources']['gateway']):
                path=Path(file);rows=self.m.lines(path.read_bytes())
                for row in rows:
                    if row.get('kind')=='watermark':row['at']=10000000 if file==p['runtimeSource']['raw'] else self.m.iso(10000000)
                path.write_text(''.join(json.dumps(row)+'\n' for row in rows))
        actor=pwd.getpwnam('master');project=Path(self.record['project']);os.chown(project,actor.pw_uid,actor.pw_gid)
        a=project/'.autopilot';a.mkdir(mode=0o700);os.chown(a,actor.pw_uid,actor.pw_gid)
        lock=a/'operator.lock';lock.touch(mode=0o600);os.chown(lock,actor.pw_uid,actor.pw_gid)
        clock=self.m.datetime
        class CutClock(clock):
            @classmethod
            def now(cls,tz=None):return clock.fromtimestamp(10000,tz)
        now=self.m.iso(10000000)
        # A real finish pin is present, but no prepared full-clock proof exists.
        registration=self.m.registration_module()
        with patch.object(registration,'resolve_run_end',side_effect=AssertionError('AP_ONLY_FALLBACK_FORBIDDEN')),patch.object(self.m,'registration_module',return_value=registration):
            refused=self.m.advance_finalizations(self.index,self.output,dict(failed=[dict(runId='run1',reason='SOURCE_UNAVAILABLE')]),now=now)
        self.assertEqual(refused['results'],[])
        self.assertEqual(refused['failed'],[dict(runId='run1',reason='RUN_OWNERSHIP_CONTEXT_UNAVAILABLE')])
        self.assertEqual(self.m.read_index(self.index)['runs'][0]['phase'],'OPEN')
        recordfile=Path(self.m.read_index(self.index)['runs'][0]['record'])
        self.assertNotIn('runtimeFinalization',self.m.core.trusted_json(recordfile))
        self.assertFalse((self.output/'run1/current.json').exists())
        with patch.object(self.m,'datetime',CutClock):prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual(prepared['failed'],[],prepared)
        self.assertEqual(prepared['resolvedEnds']['run1']['endReason'],'RUN_WINDOW_EXPIRED')
        self.assertEqual(prepared['resolvedEnds']['run1']['windowEnd'],self.m.iso(7201800))
        staged=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record'])
        self.m.core.verify_record_origin(staged)
        receipt=self.m.core.collect_record(staged,prepared['cut'],{},drop_identity=True)['receipt']
        self.assertEqual(receipt['status'],'incomplete',receipt)
        self.assertEqual(receipt['missing'],[dict(participant='master',reason='RUN_WINDOW_EXPIRED')])
        generation=hashlib.sha256(json.dumps(receipt,sort_keys=True).encode()).hexdigest()
        file=self.output/'run1/public'/generation/'receipt.json';self.m.atomic(file,receipt,mode=0o644)
        self.m.atomic(self.output/'run1/current.json',dict(generation=generation,receiptSha256=hashlib.sha256(file.read_bytes()).hexdigest()),mode=0o644)
        final=self.m.advance_finalizations(self.index,self.output,prepared,now=now)
        self.assertEqual(final['failed'],[],final);self.assertEqual(final['results'][0]['status'],'DRAINING')
        final=self.m.advance_finalizations(self.index,self.output,prepared,now=self.m.iso(10600000))
        self.assertEqual(final['failed'],[],final);self.assertEqual(final['results'][0]['status'],'FINALIZED')
        self.assertEqual(self.m.read_index(self.index)['runs'][0]['phase'],'CLOSED')
        pointer=self.m.core.trusted_json(self.output/'run1/current.json');result=self.m.core.trusted_json(self.output/'run1/public'/pointer['generation']/'receipt.json')
        self.assertEqual((result['phase'],result['endReason']),('final','RUN_WINDOW_EXPIRED'))
        print('FULLCLOCK: failed prepare + finish9000000 -> no seal; real prepare -> H7201800 final/CLOSED',flush=True)

    def test_roster_without_task_pending_then_observed_zero_and_assignment_returns_usage(self):
        self.registered_fixture()
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            message=db.execute('SELECT * FROM messages WHERE recipient="vintik"').fetchone()
            db.execute('DELETE FROM messages WHERE recipient="vintik"')
        original_clock=self.m.datetime
        class Clock(original_clock):
            @classmethod
            def now(cls,tz=None):return original_clock.fromtimestamp(1.5,tz)
        self.m.datetime=Clock
        try:pending=self.m.prepare(self.index,self.output,self.exporter)
        finally:self.m.datetime=original_clock
        self.assertEqual(pending['failed'],[],pending)
        staged=self.m.core.trusted_json(self.m.core.trusted_json(pending['index'])['runs'][0]['record'])
        self.m.core.verify_record_origin(staged)
        value=self.m.core.collect_record(staged,pending['cut'],{},drop_identity=True)['receipt']
        row=next(r for r in value['rows'] if r['participant']=='vintik')
        self.assertEqual(row['reason'],'NO_TASK_IN_RUN');self.assertEqual(row['status'],'incomplete')
        self.assertTrue(all(n is None for n in row['totals'].values()));self.assertGreaterEqual(value['pending'],1)
        for attempt in range(2):
            prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
            staged=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record']);self.m.core.verify_record_origin(staged)
            value=self.m.core.collect_record(staged,prepared['cut'],{},drop_identity=True)['receipt']
            row=next(r for r in value['rows'] if r['participant']=='vintik')
            self.assertEqual((row['status'],row['reason'],row['subscription']),('observed','NO_TASK_IN_RUN',None))
            self.assertTrue(all(n==0 for n in row['totals'].values()));self.assertTrue(all(n==0 for n in row['ofWhichSubagents'].values()))
            self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['modelCalls'],6)
            self.assertIn('vintik',value['coverage']['codex']['measured']);self.assertEqual(value['pending'],0)
            self.m.core.public_receipt(value,'run1')
            # An observed no-task zero never authorizes any positive contribution.
            bad=json.loads(json.dumps(value));badrow=next(r for r in bad['rows'] if r['participant']=='vintik')
            badrow['totals']['modelCalls']=1;bad['totals']['modelCalls']+=1;bad['byEngine']['codex']['modelCalls']+=1
            with self.assertRaisesRegex(self.m.core.Incomplete,'RECEIPT_INVALID'):self.m.core.public_receipt(bad,'run1')
            duplicate=json.loads(json.dumps(value));extra=dict(row,subscription='codex-3',reason=None);duplicate['rows'].append(extra)
            with self.assertRaisesRegex(self.m.core.Incomplete,'RECEIPT_INVALID'):self.m.core.public_receipt(duplicate,'run1')
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            db.execute('INSERT INTO messages VALUES('+','.join('?' for _ in message)+')',message)
        prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        staged=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record']);self.m.core.verify_record_origin(staged)
        value=self.m.core.collect_record(staged,prepared['cut'],{},drop_identity=True)['receipt']
        row=next(r for r in value['rows'] if r['participant']=='vintik')
        self.assertEqual(row['status'],'observed');self.assertIsNone(row['reason']);self.assertEqual(row['totals']['modelCalls'],1)
        self.assertEqual(value['totals']['modelCalls'],7);self.m.core.public_receipt(value,'run1')
        staged['runtimeNoTaskInRun']=['vintik']
        with self.assertRaisesRegex(self.m.core.Incomplete,'RUN_RECORD_INVALID'):self.m.core.collect_record(staged,prepared['cut'],{},drop_identity=True)

    def test_two_jobs_claimed_in_one_turn_keep_one_charge_and_both_provenances(self):
        self.registered_fixture();p=next(p for p in self.record['participants'] if p['name']=='vintik');did='d'*64
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            row=db.execute('SELECT id,sender,sender_uid,recipient,body,acked FROM messages WHERE recipient="vintik"').fetchone();env=json.loads(row[4].split('\n',1)[1]);env['task']['job_id']='job-second'
            db.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,acked) VALUES(?,?,?,?,?,?)',(did,row[1],row[2],row[3],'AUTOPILOT-PILOT/1\n'+json.dumps(env),1))
        native=Path(p['runtimeSource']['native'][0]);rows=self.m.lines(native.read_bytes());end=next(i for i,r in enumerate(rows) if r.get('type')=='turn/end')
        rows[end:end]=[dict(type='agent/inbox/spliced',time=1400,data=dict(target='next-step',start=0,removedCount=0,inserted=[dict(id='job-second-mail')])),dict(type='agent/inbox/spliced',time=1500,data=dict(target='next-step',start=0,removedCount=1,inserted=[]))]
        for i,r in enumerate(rows[1:]):r['seq']=i
        native.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',('second-receipt','job-second-mail','ap-notice:'+did,'s',42))
        raw=Path(p['runtimeSource']['raw']);rows=self.m.lines(raw.read_bytes());final=next(r for r in rows if r.get('kind')=='runtime_turn');final['claims'].append(dict(receiptId='second-receipt',messageId='job-second-mail',claimedAt=1500,deliveryId=did));final['deliveryIds'].append(did)
        raw.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        index=self.m.core.trusted_json(prepared['index']);record=self.m.core.trusted_json(index['runs'][0]['record'])
        self.m.core.verify_record_origin(record,self.m.LIMIT-prepared['sourceBytes'])
        owner=next(p for p in record['participants'] if p['name']=='vintik');self.assertEqual({j['jobId'] for j in owner['jobs']},{'job-vintik','job-second'});self.assertTrue(all(j['finishAt'] for j in owner['jobs']))
        value=self.m.core.collect_record(record,prepared['cut'],{},drop_identity=True)['receipt'];self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['modelCalls'],7)

    def test_run_events_are_shared_and_native_claim_damage_fails_closed_then_returns(self):
        self.registered_fixture();prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        eventfile=self.output.parent/'prepared/ownership-events.json';saved=self.m.core.trusted_json(eventfile)
        self.assertEqual({e['recipient'] for e in saved['events']},set(self.people)-{'master'})
        self.assertEqual(len(saved['events']),6)
        p=next(p for p in self.record['participants'] if p['name']=='vintik');path=Path(p['runtimeSource']['native'][0]);before=path.read_bytes();rows=self.m.lines(before)
        claims=[r for r in rows if r.get('type')=='agent/inbox/spliced' and r['data'].get('removedCount')==1]
        self.assertTrue(claims);claims[-1]['time']+=1
        path.write_text(''.join(json.dumps(r)+'\n' for r in rows));print('GLOBAL-H-CLAIM-DAMAGE',str(path),hashlib.sha256(before).hexdigest(),hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)
        damaged=self.m.prepare(self.index,self.output,self.exporter);self.assertTrue(damaged['failed']);self.assertEqual(damaged['failed'][0]['reason'],'R_NATIVE_CLAIM_CONFLICT')
        pointer=self.m.core.trusted_json(self.output/'run1/current.json');failure=self.m.core.trusted_json(self.output/'run1/public'/pointer['generation']/'receipt.json');self.assertEqual(failure.get('ownershipPolicy'),'session-interval')
        path.write_bytes(before);restored=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(restored['failed'],[],restored)
        self.assertEqual(self.m.core.trusted_json(eventfile)['events'],saved['events'])

    def test_active_native_claim_can_extend_peer_h_without_a_terminal(self):
        self.registered_fixture();p=next(p for p in self.record['participants'] if p['name']=='vintik')
        path=Path(p['runtimeSource']['native'][0]);before=path.read_bytes();rows=self.m.lines(before);rows=[r for r in rows if r.get('type')!='turn/end'];path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        raw=Path(p['runtimeSource']['raw']);rows=self.m.lines(raw.read_bytes())
        for r in rows:
            if r.get('kind')=='runtime_turn':r['finishedAt']=None
        raw.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        index=self.m.core.trusted_json(self.index);meter=self.m.Meter(self.m.LIMIT,float('inf'));runs,errors=self.m.root_ownership_runs(self.index,index['runs'],meter);self.assertEqual(errors,{})
        events,proofs,errors,contexts=self.m.run_ownership_events(self.index,index['runs'],runs,self.output,self.exporter,meter,self.m.iso(2000))
        self.assertEqual(errors,{});self.assertTrue(any(e['recipient']=='vintik' for e in events));self.assertTrue(proofs)
        old=self.root/'old-record.json';record=json.loads(json.dumps(self.record));record.pop('operator');record['runtimeOperator']=dict(jobId='old-op',sessionId='obsolete',sessionCreated=1,turn=1);record['runId']='old';record['participants']=record['participants'][:1];record['participants'][0]['runtimeSource']['ledger']=str(self.root/'missing-ledger');self.m.atomic(old,record)
        entries=index['runs']+[dict(runId='old',phase='CLOSED',record=str(old))];runs.append(dict(runs[0],runId='old'))
        events,proofs,errors,contexts=self.m.run_ownership_events(self.index,entries,runs,self.output,self.exporter,meter,self.m.iso(2000))
        self.assertIn('old',errors);self.assertNotIn('run1',errors);self.assertTrue(any(e['runId']=='run1' for e in events))

    def test_master_receiving_same_run_task_keeps_one_charge_and_both_jobs(self):
        self.registered_fixture();p=next(p for p in self.record['participants'] if p['name']=='master');did='e'*64
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            row=db.execute('SELECT id,sender,sender_uid,recipient,body,acked FROM messages LIMIT 1').fetchone();env=json.loads(row[4].split('\n',1)[1]);env['task'].update(job_id='job-master',recipient='master')
            db.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,acked) VALUES(?,?,?,?,?,?)',(did,row[1],row[2],'master','AUTOPILOT-PILOT/1\n'+json.dumps(env),1))
        native=Path(p['runtimeSource']['native'][0]);rows=self.m.lines(native.read_bytes());end=next(i for i,r in enumerate(rows) if r.get('type')=='turn/end')
        rows[end:end]=[dict(type='agent/inbox/spliced',time=1400,data=dict(target='next-step',start=0,removedCount=0,inserted=[dict(id='master-task-mail')])),dict(type='agent/inbox/spliced',time=1500,data=dict(target='next-step',start=0,removedCount=1,inserted=[]))]
        for i,r in enumerate(rows[1:]):r['seq']=i
        native.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',('master-task-receipt','master-task-mail','ap-notice:'+did,'s',42))
        raw=Path(p['runtimeSource']['raw']);rows=self.m.lines(raw.read_bytes());final=next(r for r in rows if r.get('kind')=='runtime_turn');final['claims'].append(dict(receiptId='master-task-receipt',messageId='master-task-mail',claimedAt=1500,deliveryId=did));final['deliveryIds'].append(did);raw.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        index=self.m.core.trusted_json(prepared['index']);record=self.m.core.trusted_json(index['runs'][0]['record']);self.m.core.verify_record_origin(record,self.m.LIMIT-prepared['sourceBytes'])
        master=next(p for p in record['participants'] if p['name']=='master');self.assertEqual({j['jobId'] for j in master['jobs']},{'operator-job','job-master'});self.assertTrue(all(j['finishAt'] for j in master['jobs']))
        value=self.m.core.collect_record(record,prepared['cut'],{},drop_identity=True)['receipt'];self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['modelCalls'],7)

    def cancel_message(self,at=1.5,**overrides):
        import pwd
        did='c'*64;body='AUTOPILOT-PILOT/1\n'+json.dumps(dict(route='AUTOPILOT-PILOT/1',kind='cancel',run='run1',sender='master'))
        row=dict(id=did,sender='master',sender_uid=pwd.getpwnam('master').pw_uid,recipient='vintik',body=body,acked=0,created=at);row.update(overrides)
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            db.execute('DELETE FROM messages WHERE id=?',(did,))
            db.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,acked,created) VALUES(?,?,?,?,?,?,?)',tuple(row[k] for k in ('id','sender','sender_uid','recipient','body','acked','created')))
        return row
    def resolved_end(self,**kwargs):
        fn=getattr(self.m.registration_module(),'resolve_run_end',None)
        self.assertTrue(callable(fn),'shared AP_CANCEL resolver is absent')
        return fn(self.m.SimpleNamespace(**vars(self.m)),self.index,self.record,self.m.Meter(),**kwargs)
    def test_canonical_cancel_earlier_than_finish_and_closed_pin_is_immutable(self):
        self.registered_fixture();bound=self.index.parent/'run-window/run1.json';original=bound.read_bytes();row=self.cancel_message()
        value=self.resolved_end(cut=self.m.iso(3000));self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(1500),'AP_CANCEL'));self.assertEqual(value['source']['envelopeSHA256'],hashlib.sha256(row['body'].encode()).hexdigest())
        self.cancel_message(at=1.0);pinned=bound.read_bytes();value=self.resolved_end(cut=self.m.iso(3000),closed=True)
        self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(1500),'AP_CANCEL'));self.assertEqual(bound.read_bytes(),pinned)
        bound.write_bytes(original);self.cancel_message(at=2.5);value=self.resolved_end(cut=self.m.iso(3000));self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(2000),'AP_FINISH'))
    def test_cancel_authentication_damage_then_return(self):
        import pwd
        self.registered_fixture();self.cancel_message(sender_uid=pwd.getpwnam('vintik').pw_uid)
        with self.assertRaisesRegex(self.m.Incomplete,'RUN_CANCEL_UNATTESTED'):self.resolved_end(cut=self.m.iso(3000))
        row=self.cancel_message();good=self.resolved_end(cut=self.m.iso(3000));self.assertEqual(good['endReason'],'AP_CANCEL')
        # A different RUN cancel has no authority over this RUN.
        bound=self.index.parent/'run-window/run1.json';bound.unlink();self.cancel_message(body=row['body'].replace('run1','another-run'))
        # Supply a healthy AP finish pin independently of the cancel resolver.
        self.m.atomic(bound,dict(runId='run1',startedAt=self.record['startedAt'],finishedAt=self.m.iso(2000),sourceSHA256='a'*64))
        self.assertEqual(self.resolved_end(cut=self.m.iso(3000))['endReason'],'AP_FINISH')
    def test_cancel_closes_accounting_whole_boundary_turn_through_real_prepare(self):
        self.registered_fixture();self.cancel_message(at=1.5);prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        index=self.m.core.trusted_json(prepared['index']);record=self.m.core.trusted_json(index['runs'][0]['record']);self.m.core.verify_record_origin(record,self.m.LIMIT-prepared['sourceBytes'])
        value=self.m.core.collect_record(record,prepared['cut'],{},drop_identity=True)['receipt'];self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['modelCalls'],7)
        self.assertEqual(prepared.get('resolvedEnds',{}).get('run1',{}).get('endReason'),'AP_CANCEL')

    def test_closed_published_receipt_unchanged_and_new_run_has_conflict_reference(self):
        self.registered_fixture();prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[])
        self.m.core.iteration(prepared['index'],self.output,prepared['cut'],drop_identity=True,informational=True)
        pointer=self.output/'run1/current.json';before=pointer.read_bytes();public=json.loads(before);receipt=self.output/'run1/public'/public['generation']/'receipt.json';saved=receipt.read_bytes()
        index=self.m.core.trusted_json(self.index);index['runs'][0]['phase']='CLOSED';self.m.write_index(self.index,index)
        second=json.loads(json.dumps(self.record));second['runId']='run2';second['operator']['jobId']='operator-two';second['participants']=[p for p in second['participants'] if p['name']=='master'];self.m.atomic(self.declaration,second);self.m.register(self.index,self.declaration)
        self.m.atomic(self.index.parent/'registrations/run2.json',dict(state='REGISTERED',runId='run2',projectRef=hashlib.sha256(second['project'].encode()).hexdigest(),registeredAt=self.m.iso(0)))
        self.m.atomic(self.index.parent/'run-window/run2.json',dict(runId='run2',startedAt=second['startedAt'],finishedAt=self.m.iso(2000),sourceSHA256='a'*64))
        for attempt in range(2):
            prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
            record=self.m.core.trusted_json(self.m.core.trusted_json(prepared['index'])['runs'][0]['record']);self.assertEqual(record['runtimePreparationErrors']['master'],'MIXED_RUN_TURN')
            proof=self.m.core.trusted_json(self.output.parent/'prepared/proof/run2/master.json')
            self.assertEqual(proof.get('ownershipConflicts'),[dict(relatedRunId='run1',sessionKey=[second['participants'][0]['uid'],'s',42],dshTurn=1)])
            self.assertEqual(pointer.read_bytes(),before);self.assertEqual(receipt.read_bytes(),saved)

    def test_local_cancelled_has_no_authority_and_policy_end_uses_shared_clock(self):
        import os,pwd
        self.registered_fixture();(self.index.parent/'run-window/run1.json').unlink();project=Path(self.record['project']);who=pwd.getpwnam('master');os.chown(project,who.pw_uid,who.pw_gid)
        folder=project/'.autopilot';folder.mkdir(mode=0o700);os.chown(folder,who.pw_uid,who.pw_gid)
        state=folder/'state.js';state.write_text('window.STATE='+json.dumps(dict(cancelled=True,_sadik=dict(run_id='run1',root=str(project)))));os.chown(state,who.pw_uid,who.pw_gid)
        self.assertEqual(self.resolved_end(cut=self.m.iso(3000)),dict(windowEnd=None,endReason=None,source=None))
        value=self.resolved_end(root_registered_at=0,authenticated_events=[],cut=self.m.iso(7202000));self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(7201800),'RUN_WINDOW_EXPIRED'))
        self.cancel_message(at=8000);value=self.resolved_end(root_registered_at=0,authenticated_events=[],cut=self.m.iso(8100000));self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(7201800),'RUN_WINDOW_EXPIRED'))
        bound=self.index.parent/'run-window/run1.json';before=bound.read_bytes();value=self.resolved_end(root_registered_at=0,authenticated_events=[],cut=self.m.iso(8100000),closed=True);self.assertEqual((value['windowEnd'],value['endReason']),(self.m.iso(7201800),'RUN_WINDOW_EXPIRED'));self.assertEqual(bound.read_bytes(),before)

    def test_missing_project_keeps_named_incomplete_in_shared_end_resolver(self):
        self.registered_fixture();(self.index.parent/'run-window/run1.json').unlink();Path(self.record['project']).rmdir()
        with self.assertRaises(Exception) as error:self.resolved_end(cut=self.m.iso(3000))
        self.assertIsInstance(error.exception,self.m.Incomplete);self.assertEqual(str(error.exception),'RUN_STATE_UNAVAILABLE')

    def test_closed_end_survives_unavailable_old_postman_context(self):
        self.registered_fixture();index=self.m.core.trusted_json(self.index);index['runs'][0]['phase']='CLOSED'
        file=Path(index['runs'][0]['record']);record=self.m.core.trusted_json(file);record['origin']['mailDatabase']=str(self.root/'missing-post.sqlite');self.m.atomic(file,record)
        try:runs,errors=self.m.root_ownership_runs(self.index,index['runs'],self.m.Meter(),mail_contexts={})
        except Exception as error:self.fail('one CLOSED postal error escaped its scope: '+repr(error))
        self.assertTrue(errors.get('run1'));self.assertTrue(runs);self.assertTrue(all(r['finishedAt']==2000 for r in runs),runs)

    def test_cancel_before_any_task_resolves_for_master_only_run(self):
        self.record['participants']=[p for p in self.record['participants'] if p['name']=='master'];self.m.atomic(self.declaration,self.record)
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:db.execute('DELETE FROM messages')
        self.registered_fixture();self.cancel_message(at=1.5,recipient='vintik')
        self.assertEqual(self.resolved_end(cut=self.m.iso(3000))['endReason'],'AP_CANCEL')
        prepared=self.m.prepare(self.index,self.output,self.exporter);self.assertEqual(prepared['failed'],[],prepared)
        self.assertEqual(prepared.get('resolvedEnds',{}).get('run1',{}).get('endReason'),'AP_CANCEL')

    def test_fresh_legacy_open_has_only_named_null_receipt_without_policy(self):
        self.m.register(self.index,self.declaration)
        root_index=self.m.core.trusted_json(self.index)
        scopes,errors=self.m.root_ownership_runs(self.index,root_index['runs'],self.m.Meter())
        self.assertEqual(scopes,[]);self.assertEqual(errors,{'run1':'LEGACY_UNREGISTERED_RUN'})
        prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual([r['reason'] for r in prepared['failed']],['LEGACY_UNREGISTERED_RUN'],prepared)
        self.assertIsNone(prepared['index']);self.assertFalse((self.index.parent/'runtime-readers').exists())
        pointer=self.m.core.trusted_json(self.output/'run1/current.json')
        value=self.m.core.trusted_json(self.output/'run1/public'/pointer['generation']/'receipt.json')
        self.assertEqual(value['status'],'incomplete');self.assertTrue(all(n is None for n in value['totals'].values()))
        self.assertTrue(all(all(n is None for n in row['totals'].values()) for row in value['rows']))
        self.assertEqual({item['reason'] for item in value['missing']},{'LEGACY_UNREGISTERED_RUN'})
        self.assertFalse({'ownershipPolicy','ownershipRuleVersion','ownershipNotice'}&set(value))

    def test_legacy_open_does_not_poison_registered_run_and_closed_bytes_stay_frozen(self):
        self.registered_fixture();legacy=json.loads(json.dumps(self.record));legacy['runId']='legacy'
        legacy['project']=str(self.root/'legacy-project');Path(legacy['project']).mkdir()
        legacy['operator']['jobId']='legacy-operator'
        legacy['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(legacy['project'].encode()).hexdigest()+'.json'))
        declaration=self.root/'legacy-declaration.json';self.m.atomic(declaration,legacy);self.m.register(self.index,declaration)
        def observed():
            prepared=self.m.prepare(self.index,self.output,self.exporter)
            active=self.m.core.trusted_json(prepared['index'])
            self.assertEqual([r['runId'] for r in active['runs']],['run1'])
            record=self.m.core.trusted_json(active['runs'][0]['record']);self.m.core.verify_record_origin(record)
            receipt=self.m.core.collect_record(record,prepared['cut'],{},drop_identity=True)['receipt']
            self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals']['inputTokens'],700)
            self.assertEqual(receipt['ownershipPolicy'],'session-interval')
            return prepared,receipt
        prepared,receipt=observed()
        self.assertEqual([(r['runId'],r['reason']) for r in prepared['failed']],[('legacy','LEGACY_UNREGISTERED_RUN')])
        # Valid old-schema numeric bytes are a frozen historical canary, not recalculated billing.
        old=json.loads(json.dumps(receipt));old.update(schemaVersion=3,runId='legacy',projectRef=hashlib.sha256(legacy['project'].encode()).hexdigest())
        for field in ('windowEnd','endReason','operatorActions'):old.pop(field)
        for field in ('ownershipPolicy','ownershipRuleVersion','ownershipNotice'):old.pop(field,None)
        self.m.core.public_receipt(old,'legacy')
        raw=json.dumps(old).encode();generation=hashlib.sha256(raw).hexdigest()
        file=self.output/'legacy/public'/generation/'receipt.json';self.m.atomic(file,raw,mode=0o644)
        pointer=self.output/'legacy/current.json';self.m.atomic(pointer,dict(generation=generation,receiptSha256=hashlib.sha256(raw).hexdigest()),mode=0o644)
        saved=pointer.read_bytes();inode=(pointer.stat().st_ino,file.stat().st_ino)
        index=self.m.core.trusted_json(self.index)
        for entry in index['runs']:
            if entry['runId']=='legacy':entry['phase']='CLOSED'
        self.m.atomic(self.index,index);self.m.atomic(self.index.with_name('index-origin.json'),dict(schemaVersion=1,indexSHA256=hashlib.sha256(self.index.read_bytes()).hexdigest()))
        prepared,_=observed();self.assertEqual(prepared['failed'],[])
        self.assertEqual(pointer.read_bytes(),saved);self.assertEqual(file.read_bytes(),raw)
        self.assertEqual((pointer.stat().st_ino,file.stat().st_ino),inode)

    def test_prepare_refuses_legacy_even_when_scope_discovery_returns_no_error(self):
        from unittest.mock import patch
        self.m.register(self.index,self.declaration)
        with patch.object(self.m,'root_ownership_runs',return_value=([],{})):
            prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual([r['reason'] for r in prepared['failed']],['LEGACY_UNREGISTERED_RUN'])
        self.assertIsNone(prepared['index']);self.assertFalse((self.index.parent/'runtime-readers').exists())
        pointer=self.m.core.trusted_json(self.output/'run1/current.json')
        value=self.m.core.trusted_json(self.output/'run1/public'/pointer['generation']/'receipt.json')
        self.assertTrue(all(n is None for n in value['totals'].values()))
        self.assertNotIn('ownershipPolicy',value)

    def test_prepare_owner_cut_uses_canonical_cancel_before_finish_pin(self):
        from unittest.mock import patch
        self.registered_fixture();self.cancel_message(at=1.5);seen=[];original=self.m.owner_export
        def capture(request,*args,**kwargs):
            if 'operator' in request:seen.append(request['operator'].get('runFinishedAt'))
            return original(request,*args,**kwargs)
        self.m.owner_export=capture;registration=self.m.registration_module()
        with patch.object(registration,'run_window',side_effect=self.m.Incomplete('CANCEL_BLIND_RESOLVER')),patch.object(self.m,'registration_module',return_value=registration):
            prepared=self.m.prepare(self.index,self.output,self.exporter)
        self.assertEqual(prepared['failed'],[],prepared);self.assertEqual(prepared['resolvedEnds']['run1']['endReason'],'AP_CANCEL');self.assertTrue(seen);self.assertEqual(set(seen),{self.m.iso(1500)})
        proof=self.m.core.trusted_json(self.output.parent/'prepared/proof/run1/master.json');context=proof['runContext'];self.assertEqual(context['end'],prepared['resolvedEnds']['run1']);self.assertEqual(context['registeredAt'],0);self.assertEqual(context['cut'],prepared['resolutionCut'])

    def test_new_resolver_rejects_missing_registration_while_legacy_projection_stays_none(self):
        self.registered_fixture();(self.index.parent/'run-window/run1.json').unlink();(self.index.parent/'registrations/run1.json').unlink()
        module=self.m.registration_module();n=self.m.SimpleNamespace(**vars(self.m))
        self.assertIsNone(module.run_window(n,self.index,self.record,self.m.Meter()))
        with self.assertRaisesRegex(self.m.Incomplete,'RUN_NOT_REGISTERED'):self.resolved_end(cut=self.m.iso(3000))
    def test_resolver_proof_clock_or_event_shape_error_is_named_before_pin_write(self):
        self.registered_fixture();self.cancel_message();bound=self.index.parent/'run-window/run1.json';before=bound.read_bytes()
        for clock,events in ((1,[]),(0,[{}])):
            with self.subTest(clock=clock,events=events):
                bound.write_bytes(before)
                with self.assertRaises(Exception) as error:self.resolved_end(root_registered_at=clock,authenticated_events=events,cut=self.m.iso(3000))
                self.assertIsInstance(error.exception,self.m.Incomplete);self.assertEqual(str(error.exception),'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE');self.assertEqual(bound.read_bytes(),before)

    def test_resolver_context_failure_logs_only_exception_type(self):
        self.registered_fixture();self.cancel_message();bound=self.index.parent/'run-window/run1.json';before=bound.read_bytes()
        for events,cut,kind in (([{}],self.m.iso(3000),'KeyError'),(['PRIVATE_PROOF_SENTINEL'],self.m.iso(3000),'TypeError'),([], '1970-01-01T00:00:03.'+'1'*64+'+00:00','ValueError')):
            with self.subTest(exception=kind):
                with self.assertLogs(level='WARNING') as logs:
                    with self.assertRaisesRegex(self.m.Incomplete,'RUN_OWNERSHIP_CONTEXT_UNAVAILABLE'):
                        self.resolved_end(root_registered_at=0,authenticated_events=events,cut=cut)
                self.assertEqual([r.getMessage() for r in logs.records],['RUN_OWNERSHIP_CONTEXT_UNAVAILABLE exceptionType='+kind])
                self.assertNotIn('PRIVATE_PROOF_SENTINEL','\n'.join(logs.output));self.assertEqual(bound.read_bytes(),before)

    def test_no_task_real_collector_seals_schema4_and_closed_is_immutable(self):
        import os,pwd
        self.registered_fixture();actor=pwd.getpwnam('master');project=Path(self.record['project']);os.chown(project,actor.pw_uid,actor.pw_gid);a=project/'.autopilot';a.mkdir(mode=0o700);os.chown(a,actor.pw_uid,actor.pw_gid)
        state=a/'state.js';state.write_text('window.STATE='+json.dumps(dict(_sadik=dict(run_id='run1',root=str(project)))));state.chmod(0o600);os.chown(state,actor.pw_uid,actor.pw_gid)
        lock=a/'operator.lock';lock.touch(mode=0o600);os.chown(lock,actor.pw_uid,actor.pw_gid)
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:
            message=db.execute('SELECT * FROM messages WHERE recipient="vintik"').fetchone();db.execute('DELETE FROM messages WHERE recipient="vintik"')
        reply=existing.ProtectedPipeline.cli(self);self.assertEqual(reply.returncode,0,reply.stdout+reply.stderr)
        self.assertEqual(self.m.read_index(self.index)['runs'][0]['phase'],'CLOSED');self.m.core.TEAM_USAGE_ROOT=self.output;value=self.m.core.read_public('run1',self.record['project'])
        self.assertEqual((value['schemaVersion'],value['phase'],value['status'],value['totals']['modelCalls'],value['totals']['inputTokens'],value['totals']['outputTokens']),(4,'final','observed',6,600,30))
        row=next(r for r in value['rows'] if r['participant']=='vintik');self.assertEqual((row['status'],row['reason'],row['subscription']),('observed','NO_TASK_IN_RUN',None));self.assertTrue(all(type(v) is int and v==0 for v in row['totals'].values()))
        pointer=self.output/'run1/current.json';before=pointer.read_bytes()
        with sqlite3.connect(self.record['origin']['mailDatabase']) as db:db.execute('INSERT INTO messages VALUES('+','.join('?' for _ in message)+')',message)
        again=existing.ProtectedPipeline.cli(self);self.assertEqual(again.returncode,0,again.stdout+again.stderr);self.assertEqual(pointer.read_bytes(),before);self.assertEqual(self.m.core.read_public('run1',self.record['project']),value)
        print('COMMON NO_TASK RootPostman->prepare->collector->v4final/CLOSED:6calls600/30;Vintik0;closedpointerimmutable',flush=True)
