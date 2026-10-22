"""Informational R: real files, durable offset and job-isolated cost."""
import importlib.util
import json
import os
import copy
import sqlite3
from pathlib import Path
import tempfile
import unittest
import test_runtime_receipt_source as fixtures


def reader():
    path=fixtures.PACKAGE/'runtime/runtime_incremental.py'
    assert path.is_file(),'incremental R reader is not implemented'
    spec=importlib.util.spec_from_file_location('r_incremental_test',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def row(rid='request-one'):
    m,rows,*_=fixtures.RuntimeSource().fixture()
    return dict(rows[0],requestId=rid)

def line(value):return (json.dumps(value)+'\n').encode()

class CursorTests(unittest.TestCase):
    def test_offset_survives_reopen_and_only_append_is_read(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-cursor-') as tmp:
            root=Path(tmp);source=root/'R';state=root/'state.sqlite';first=line(row());source.write_bytes(first)
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                stats=cursor.read();self.assertEqual((stats['offset'],stats['readBytes']),(len(first),len(first)))
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                self.assertEqual(cursor.read()['readBytes'],0)
            appended=line(row('second'));source.write_bytes(first+appended)
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                stats=cursor.read();self.assertEqual(stats['readBytes'],len(appended));self.assertEqual(stats['offset'],len(first+appended));self.assertEqual(len(cursor.requests()),2)

    def test_partial_tail_is_not_consumed_until_lf_arrives(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-tail-') as tmp:
            root=Path(tmp);source=root/'R';first=line(row());second=line(row('second'));source.write_bytes(first+second[:20])
            with module.Reader(source,root/'state.sqlite',os.getuid(),'worker') as cursor:
                self.assertEqual(cursor.read()['offset'],len(first));self.assertEqual(len(cursor.requests()),1)
                with source.open('ab') as out:out.write(second[20:])
                self.assertEqual(cursor.read()['offset'],len(first+second));self.assertEqual(len(cursor.requests()),2)

    def test_new_inode_restarts_at_zero_and_keeps_known_facts(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-inode-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row()))
            with module.Reader(source,root/'state.sqlite',os.getuid(),'worker') as cursor:
                before=cursor.read();replacement=root/'new';replacement.write_bytes(line(row('new')));replacement.replace(source)
                self.assertNotEqual(before['inode'],source.stat().st_ino)
                after=cursor.read();self.assertEqual(after['resets'],1);self.assertGreater(after['lastResetAt'],0);self.assertEqual(after['offset'],source.stat().st_size);self.assertEqual(len(cursor.requests()),2)

    def test_shrinking_same_inode_restarts_at_zero(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-truncate-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row())+line(row('second')))
            with module.Reader(source,root/'state.sqlite',os.getuid(),'worker') as cursor:
                before=cursor.read();source.write_bytes(b'{}\n');after=cursor.read()
                self.assertEqual(after['inode'],before['inode']);self.assertEqual(after['offset'],3);self.assertEqual(after['resets'],1);self.assertEqual(after['skippedLines'],1)

    def test_bad_json_between_good_lines_is_counted_and_skipped(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-bad-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row())+b'{bad json}\n'+line(row('second')))
            with module.Reader(source,root/'state.sqlite',os.getuid(),'worker') as cursor:
                stats=cursor.read();self.assertEqual(stats['skippedLines'],1);self.assertEqual(len(cursor.requests()),2);self.assertEqual(stats['offset'],source.stat().st_size)
                self.assertEqual(cursor.read()['skippedLines'],0)


class JobReceipts(unittest.TestCase):
    def two_runs(self, root):
        m, participant, data = fixtures.RuntimeSource().files(root)
        rpath = Path(participant['runtimeSource']['raw'])
        rows = m.lines(rpath.read_bytes())
        base = {key: rows[0][key] for key in
                ('schemaVersion', 'generation', 'uid', 'recipient')}
        claim = dict(receiptId='receipt-two', messageId='ap-two', claimedAt=3100,
                     deliveryId='b' * 64)
        facts = dict(sessionId='s', sessionCreated=42, turn=2, turnStartedAt=3000,
                     claimedAt=3100, finishedAt=None, deliveryIds=['b' * 64],
                     claims=[claim])
        rows = rows[:2] + [dict(base, seq=3, kind='runtime_request',
                               requestId='request-two', requestGeneration='ledger-one',
                               registeredAt=3200, **facts),
                          dict(base, seq=4, kind='runtime_turn',
                               **dict(facts, finishedAt=3800, turnOutcome='completed')),
                          dict(base, seq=5, kind='watermark', at=4000)]
        def put(path, values):
            Path(path).write_text(''.join(json.dumps(v) + '\n' for v in values))
        put(rpath, rows)
        native = Path(participant['runtimeSource']['native'][0])
        native_rows = m.lines(native.read_bytes())
        events = native_rows[1:]
        for kind, stamp, value in [
            ('agent/inbox/spliced', 2900, dict(target='next-turn', start=0,
                removedCount=0, inserted=[dict(id='ap-two')])),
            ('turn/start', 3000, dict(turn=2)),
            ('agent/inbox/spliced', 3100, dict(target='next-turn', start=0,
                removedCount=1, inserted=[])),
            ('turn/end', 3800, dict(turn=2, reason=dict(kind='completed'))),
        ]:
            events.append(dict(type=kind, time=stamp, data=value, seq=len(events)))
        put(native,[native_rows[0],*events])
        with sqlite3.connect(participant['runtimeSource']['ledger']) as con:
            con.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',
                        ('receipt-two', 'ap-two', 'ap-notice:' + 'b' * 64, 's', 42))
            con.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?)',
                        ('request-two', 'ledger-one', 's', 42, 2, 3199,
                         json.dumps(dict(request_id='request-two',
                             generation='ledger-one', session_id='s',
                             session_created=42, turn=2))))
        gpath = Path(participant['sources']['gateway'])
        g = m.lines(gpath.read_bytes())
        second = dict(g[0], requestId='request-two', sessionId='s', dshTurn=2, turnId='turn-two',
                      startedAt=m.iso(3200), endedAt=m.iso(3700))
        put(gpath, [g[0], second, dict(kind='watermark', at=m.iso(4000))])
        epath = Path(participant['sources']['raw'][0])
        engine = m.lines(epath.read_bytes())
        later = copy.deepcopy(engine[1:])
        for row in later:
            row['timestamp'] = m.iso(m.millis(row['timestamp']) + 2000)
            row['payload']['turn_id'] = 'turn-two'
            if 'response_id' in row['payload']:
                row['payload']['response_id'] = 'response-two'
        put(epath, engine + later)
        data['deliveries']['b' * 64] = dict(kind='task', recipient='worker',
                                          runId='run2', jobId='job2')
        return m, participant, data


    def with_ordinary(self,root):
        m,p,data=self.two_runs(root)
        rpath=Path(p['runtimeSource']['raw']);rows=m.lines(rpath.read_bytes());base=rows[0]
        claims=[dict(receiptId='receipt-ordinary',messageId='ordinary-three',claimedAt=5100,deliveryId=None)]
        request=dict(base,seq=6,requestId='ordinary-request',turn=3,turnStartedAt=5000,claimedAt=5100,registeredAt=5200,claims=claims,deliveryIds=[])
        terminal=dict(rows[1],seq=7,turn=3,turnStartedAt=5000,claimedAt=5100,finishedAt=5800,claims=claims,deliveryIds=[])
        rows.extend([request,terminal,dict(rows[-1],seq=8,at=6000)])
        rpath.write_text(''.join(json.dumps(x)+'\n' for x in rows))
        with sqlite3.connect(p['runtimeSource']['ledger']) as db:
            db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',('receipt-ordinary','ordinary-three','mail:ordinary','s',42))
            binding=dict(request_id='ordinary-request',generation='ledger-one',session_id='s',session_created=42,turn=3)
            db.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?)',('ordinary-request','ledger-one','s',42,3,5199,json.dumps(binding)))
        path=Path(p['runtimeSource']['native'][0]);native=m.lines(path.read_bytes())
        for kind,stamp,value in [('agent/inbox/spliced',4900,dict(target='next-turn',start=0,removedCount=0,inserted=[dict(id='ordinary-three')])),('turn/start',5000,dict(turn=3)),('agent/inbox/spliced',5100,dict(target='next-turn',start=0,removedCount=1,inserted=[])),('turn/end',5800,dict(turn=3,reason=dict(kind='completed')))]:
            native.append(dict(type=kind,time=stamp,data=value,seq=len(native)-1))
        path.write_text(''.join(json.dumps(x)+'\n' for x in native))
        path=Path(p['sources']['gateway']);g=m.lines(path.read_bytes());g[1]['totals'].update(inputTokens=200,uncachedInputTokens=130,outputTokens=20)
        ordinary=dict(g[0],requestId='ordinary-request',dshTurn=3,turnId='turn-three',startedAt=m.iso(5200),endedAt=m.iso(5700),totals=dict(modelCalls=1,inputTokens=7000,uncachedInputTokens=6930,outputTokens=70,cacheReadTokens=60,cacheWriteTokens=10))
        g.insert(-1,ordinary);g[-1]['at']=m.iso(6000);path.write_text(''.join(json.dumps(x)+'\n' for x in g))
        path=Path(p['sources']['raw'][0]);engine=m.lines(path.read_bytes())
        for value in engine:
            if value.get('type')=='token_usage_record' and value['payload'].get('turn_id')=='turn-two':value['payload']['usage'].update(input_tokens=200,output_tokens=20)
        extra=copy.deepcopy(engine[1:5])
        for value in extra:
            value['timestamp']=m.iso(m.millis(value['timestamp'])+4000);value['payload']['turn_id']='turn-three'
            if 'response_id' in value['payload']:value['payload'].update(response_id='response-three');value['payload']['usage'].update(input_tokens=7000,output_tokens=70)
        path.write_text(''.join(json.dumps(x)+'\n' for x in [*engine,*extra]))
        return m,p,data

    def receipt(self,m,p,owner,run,job,root):
        runtime,gateway,raw=m.cut_snapshot(owner,m.iso(6000))
        target=root/run;target.mkdir(exist_ok=True)
        def put(name,rows):
            path=target/name;path.write_text(''.join(json.dumps(x)+'\n' for x in rows));return str(path)
        participant=copy.deepcopy(p);participant.pop('runtimeSource');participant['sources']=dict(runtime=put('R',runtime),gateway=put('G',gateway),raw=[put('engine-'+str(i),rows) for i,rows in enumerate(raw)]);participant['jobs']=[dict(jobId=job,claimAt=m.iso(1100 if run=='run1' else 3100),finishAt=None)]
        record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId=run,startedAt=m.iso(0),project=str(root/'project'),participants=[participant],runtimeInformational=True,runtimeDiagnostics=[owner['runtimeDiagnostics']] if 'runtimeDiagnostics' in owner else [])
        if owner.get('runtimeCursor',{}).get('resets'):record['runtimeNotice']=reader().NOTICE
        value=m.core.collect_record(record,m.iso(6000),{},drop_identity=False)['receipt']
        diags={d['source']:d['unboundRecords'] for d in value.get('runtimeDiagnostics',[])}
        for coverage in value['coverage'].values():
            for name in coverage['measured']:self.assertEqual(owner['runtimeCursor']['unresolvedRequests'],0,'measured requires unresolved(RUN)=0')
        return value

    def refusal(self,m,p,data,reason):
        with self.assertRaisesRegex(m.Incomplete,'^'+reason+'$'):m.export_owner(data)
        record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId=data['runId'],project=str(Path(p['home'])/'project'),startedAt=m.iso(0),runtimeInformational=True,participants=[p],runtimePreparationErrors={p['name']:reason})
        value=m.core.collect_record(record,m.iso(6000),{},drop_identity=False)['receipt'];value=m.core.public_receipt(value,data['runId'])
        self.assertEqual(value['status'],'incomplete');self.assertEqual(value['rows'][0]['reason'],reason)
        self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()));self.assertEqual(value['coverage'][p['engine']]['measured'],[])

    def test_two_parallel_jobs_get_distinct_receipts_and_foreign_work_is_ignored(self):
        with tempfile.TemporaryDirectory(prefix='r-two-jobs-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root)
            gp=Path(p['sources']['gateway']);g=m.lines(gp.read_bytes());g[1]['totals'].update(inputTokens=200,uncachedInputTokens=130,outputTokens=20);gp.write_bytes(b''.join(line(r) for r in g))
            ep=Path(p['sources']['raw'][0]);engine=m.lines(ep.read_bytes())
            for r in engine:
                if r.get('type')=='token_usage_record' and r['payload'].get('turn_id')=='turn-two':r['payload']['usage'].update(input_tokens=200,output_tokens=20)
            ep.write_bytes(b''.join(line(r) for r in engine))
            try:
                first=m.export_owner(data);data['runId']='run2';second=m.export_owner(data)
            except m.Incomplete as error:self.fail('unrelated work refused the task receipt: '+str(error))
            a=self.receipt(m,p,first,'run1','job1',root);b=self.receipt(m,p,second,'run2','job2',root)
            self.assertEqual(a['status'],'observed',a);self.assertEqual(b['status'],'observed',b)
            self.assertEqual((a['totals']['inputTokens'],a['totals']['outputTokens']),(100,5))
            self.assertEqual((b['totals']['inputTokens'],b['totals']['outputTokens']),(200,20))
            self.assertEqual((a['totals']['modelCalls'],b['totals']['modelCalls']),(1,1))

    def test_exporter_reuses_cursor_and_binding_on_unchanged_r(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='r-export-offset-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);first=m.export_owner(data)
            self.assertTrue('runtimeCursor' in first,'exporter did not use the incremental reader')
            with patch.object(m,'bind_runtime',side_effect=AssertionError('already-bound request was checked again')):
                second=m.export_owner(data)
            self.assertEqual(second['runtimeCursor']['readBytes'],0);self.assertEqual([r for r in first['rows'] if r['kind']=='request'],[r for r in second['rows'] if r['kind']=='request'])

    def test_bad_r_line_does_not_invalidate_bound_task_receipt(self):
        with tempfile.TemporaryDirectory(prefix='r-job-bad-line-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root)
            source=Path(p['runtimeSource']['raw']);raw=source.read_bytes();source.write_bytes(raw+b'{broken}\n')
            owner=m.export_owner(data);receipt=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(owner['runtimeCursor']['skippedLines'],1)
            self.assertEqual(receipt['status'],'observed');self.assertEqual(receipt['totals']['inputTokens'],100)

    def test_outside_run_work_exports_no_run_charges(self):
        with tempfile.TemporaryDirectory(prefix='r-unbound-refuse-') as tmp:
            root=Path(tmp);m,p,data=self.with_ordinary(root);data['runId']='unrelated'
            owner=m.export_owner(data)
            self.assertEqual([r for r in owner['rows'] if r['kind']=='request'],[])
            self.assertEqual([r for r in owner['gateway'] if r['kind']=='request'],[])
            self.assertGreater(owner['runtimeDiagnostics']['unboundRecords'],0)

    def test_later_unrelated_master_turn_is_not_bound_by_time(self):
        with tempfile.TemporaryDirectory(prefix='r-master-exact-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);p['name']='master';data['deliveries']={}
            source=Path(p['runtimeSource']['raw']);rows=m.lines(source.read_bytes())
            for r in rows:
                r['recipient']='master'
                if 'claims' in r:
                    r['deliveryIds']=[]
                    for c in r['claims']:c['deliveryId']=None
            source.write_text(''.join(json.dumps(r)+'\n' for r in rows))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute("UPDATE receipts SET logical_key='mail:operator' WHERE logical_key LIKE 'ap-notice:%'")
            data['operator']=dict(jobId='operator-A',sessionId='s',sessionCreated=42,turn=1,runStartedAt=m.iso(0))
            owner=m.export_owner(data);requests=[r for r in owner['rows'] if r['kind']=='request']
            self.assertEqual([(r['requestId'],r['turn'],r['jobId']) for r in requests],[('sdk-["ledger-one","request-one"]',1,'operator-A')])


class CorrectnessTests(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt
    # Each assertion checks actual durable state or a task receipt, not parser internals.
    def test_repeated_request_is_charged_once(self):
        with tempfile.TemporaryDirectory(prefix='r-repeat-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root)
            source=Path(p['runtimeSource']['raw']);source.write_bytes(source.read_bytes()+line(m.lines(source.read_bytes())[0]))
            owner=m.export_owner(data);receipt=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(receipt['totals']['inputTokens'],100);self.assertEqual(receipt['totals']['modelCalls'],1)

    def test_cursor_and_facts_rollback_together(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-atomic-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row()))
            with module.Reader(source,root/'state.sqlite',os.getuid(),'worker') as cursor:
                cursor.db.execute("CREATE TRIGGER fail_cursor BEFORE UPDATE ON cursor BEGIN SELECT RAISE(ABORT,'injected interruption'); END")
                with self.assertRaises(sqlite3.IntegrityError):cursor.read()
                self.assertEqual(cursor.db.execute('SELECT offset FROM cursor').fetchone()[0],0)
                self.assertEqual(len(cursor.requests()),0)
                cursor.db.execute('DROP TRIGGER fail_cursor');cursor.read()
                self.assertEqual(len(cursor.requests()),1);self.assertEqual(cursor.db.execute('SELECT offset FROM cursor').fetchone()[0],source.stat().st_size)

    def test_unbound_source_counts_are_diagnostic_for_bound_run(self):
        with tempfile.TemporaryDirectory(prefix='r-counts-') as tmp:
            root=Path(tmp);m,p,data=self.with_ordinary(root);source=Path(p['runtimeSource']['raw']);source.write_bytes(source.read_bytes()+b'{broken}\n')
            owner=m.export_owner(data);value=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['inputTokens'],100)
            self.assertGreater(owner['runtimeDiagnostics']['unboundRecords'],0);self.assertEqual(owner['runtimeCursor']['skippedLines'],1)

    def test_two_jobs_claiming_one_turn_refuse_even_after_cached_bind(self):
        with tempfile.TemporaryDirectory(prefix='r-mixed-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);m.export_owner(data)
            source=Path(p['runtimeSource']['raw']);rows=m.lines(source.read_bytes());extra=copy.deepcopy(rows[1]);extra['deliveryIds'].append('b'*64);extra['claims'].append(dict(receiptId='new',messageId='other-task',deliveryId='b'*64,claimedAt=1100));source.write_bytes(source.read_bytes()+line(extra))
            JobReceipts().refusal(m,p,data,'MIXED_JOB_TURN')
            data['runId']='run2';JobReceipts().refusal(m,p,data,'MIXED_JOB_TURN')

    def test_same_registered_operator_turn_in_two_runs_is_not_charged(self):
        with tempfile.TemporaryDirectory(prefix='r-operator-conflict-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);p['name']='master';data['deliveries']={}
            source=Path(p['runtimeSource']['raw']);rows=m.lines(source.read_bytes())
            for r in rows:
                r['recipient']='master'
                if 'claims' in r:
                    r['deliveryIds']=[]
                    for c in r['claims']:c['deliveryId']=None
            source.write_text(''.join(json.dumps(r)+'\n' for r in rows))
            data['operator']=dict(jobId='operator-A',sessionId='s',sessionCreated=42,turn=1,runStartedAt=m.iso(0))
            data['runtimeClaims']=[dict(runId=run,jobId='operator-'+run,sessionId='s',sessionCreated=42,turn=1) for run in ('run1','run2')]
            JobReceipts().refusal(m,p,data,'MIXED_JOB_TURN')


class DisplayAndRecovery(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt

    def test_bad_unicode_does_not_starve_following_good_record(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-utf8-') as tmp:
            root=Path(tmp);source=root/'R';bad=line(dict(row(),requestId=chr(0xd800)))
            source.write_bytes(bad+line(row()))
            with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                stats=cursor.read();self.assertEqual(stats['skippedLines'],1);self.assertEqual(len(cursor.requests()),1)

    def test_rotation_keeps_cost_with_one_public_notice(self):
        with tempfile.TemporaryDirectory(prefix='r-notice-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);m.export_owner(data)
            source=Path(p['runtimeSource']['raw']);new=root/'new';new.write_bytes(b'');new.replace(source)
            owner=m.export_owner(data);receipt=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(receipt['status'],'observed');self.assertEqual(receipt['totals']['inputTokens'],100)
            self.assertEqual(receipt.get('notice'),reader().NOTICE)
            self.assertEqual(m.core.public_receipt(receipt,'run1').get('notice'),reader().NOTICE)

    def test_public_dashboard_displays_escaped_notice_and_both_counters(self):
        import subprocess
        import re
        html=(fixtures.PACKAGE/'overlay/phases/dashboard-template.html').read_text()
        js=html[html.index('function renderTeamUsage('):html.index('function renderUsage(')]
        data=dict(schemaVersion=3,rows=[],coverage=dict(codex=dict(expected=[],measured=[]),claude=dict(expected=[],measured=[])),asOf='2026-01-01',pending=0,status='observed',totals={},notice='<lost>',informational=True,runtimeDiagnostics=[dict(source='worker',skippedLines=2,unboundRecords=3)])
        code="const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');"+js+";process.stdout.write(renderTeamUsage("+json.dumps(data)+",'ru'));"
        out=subprocess.run(['node','-e',code],capture_output=True,text=True,check=True).stdout
        self.assertIn('&lt;lost&gt;',out);self.assertNotIn('<lost>',out);self.assertIn('worker',out);self.assertIn('2',out);self.assertIn('3',out)


class TurnAttribution(unittest.TestCase):
    def test_two_different_registered_turns_of_same_session_are_separate(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-session-conflict-') as tmp:
            root=Path(tmp);source=root/'R';a=row();b=dict(row('second'),turn=2,deliveryIds=['b'*64])
            b['claims'][-1]['deliveryId']='b'*64;source.write_bytes(line(a)+line(b))
            deliveries={'a'*64:dict(kind='task',runId='one',jobId='job1',recipient='worker'),'b'*64:dict(kind='task',runId='two',jobId='job2',recipient='worker')}
            with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                cursor.read();self.assertEqual({r['requestId'] for r in cursor.candidates(deliveries,'one').values()},{'request-one'});self.assertEqual({r['requestId'] for r in cursor.candidates(deliveries,'two').values()},{'second'});self.assertEqual(cursor.unbound,0)

class SharedPolicy(unittest.TestCase):
    def test_single_policy_change_changes_accepted_record_size(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-policy-') as tmp:
            root=Path(tmp);source=root/'R';policy=root/'policy.json';source.write_bytes(line(row()))
            policy.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=33554432,recordMaxBytes=128)))
            with module.Reader(source,root/'state',os.getuid(),'worker',policy=policy) as cursor:
                low=cursor.read();self.assertEqual(low['skippedLines'],1);self.assertEqual(len(cursor.requests()),0)
                policy.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=33554432,recordMaxBytes=65536)))
                with source.open('ab') as out:out.write(line(row('next')))
                high=cursor.read();self.assertEqual(high['skippedLines'],0);self.assertEqual(len(cursor.requests()),1);self.assertNotEqual(low['policySHA256'],high['policySHA256'])

    def test_oversized_partial_waits_then_is_skipped_once_before_good_row(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-big-tail-') as tmp:
            root=Path(tmp);source=root/'R';policy=root/'policy.json';policy.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=33554432,recordMaxBytes=1024)))
            source.write_bytes(b'x'*3000)
            with module.Reader(source,root/'state',os.getuid(),'worker',policy=policy) as cursor:
                first=cursor.read();self.assertEqual(first['offset'],0);self.assertEqual(first['skippedLines'],0)
                with source.open('ab') as out:out.write(b'\n'+line(row()))
                second=cursor.read();self.assertEqual(second['offset'],source.stat().st_size);self.assertEqual(second['skippedLines'],1);self.assertEqual(len(cursor.requests()),1)
                self.assertEqual(cursor.read()['skippedLines'],0)


class CommitRecovery(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt
    def test_failure_after_cursor_commit_before_receipt_does_not_lose_or_double_cost(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='r-after-commit-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root)
            with patch.object(m,'_export_incremental',side_effect=RuntimeError('injected after R commit')):
                with self.assertRaisesRegex(RuntimeError,'injected after R commit'):m.export_owner(data)
            recovered=m.export_owner(data);self.assertEqual(recovered['runtimeCursor']['readBytes'],0)
            receipt=self.receipt(m,p,recovered,'run1','job1',root);self.assertEqual(receipt['totals']['inputTokens'],100);self.assertEqual(receipt['totals']['modelCalls'],1)

class StableWriterFacts(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt

    def test_repeated_request_and_turn_across_r_generation_charge_once(self):
        import hashlib
        with tempfile.TemporaryDirectory(prefix='r-generation-repeat-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);source=Path(p['runtimeSource']['raw']);original=source.read_bytes();rows=m.lines(original)
            first=m.export_owner(data);before=self.receipt(m,p,first,'run1','job1',root)
            request=copy.deepcopy(rows[0]);turn=copy.deepcopy(rows[1]);open_turn=dict(turn,finishedAt=None)
            repeats=[request,open_turn,turn,dict(request,generation='new-r-process',seq=1),dict(turn,generation='new-r-process',seq=2)]
            with source.open('ab') as out:out.write(b''.join(line(r) for r in repeats))
            changed=source.read_bytes();self.assertNotEqual(hashlib.sha256(original).hexdigest(),hashlib.sha256(changed).hexdigest());self.assertEqual(changed.count(b'new-r-process'),2)
            print('DAMAGE repeat5 newRGeneration2 SHA256',hashlib.sha256(original).hexdigest(),'->',hashlib.sha256(changed).hexdigest(),flush=True)
            owner=m.export_owner(data);after=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(owner['runtimeCursor']['newLines'],5);self.assertEqual(after['status'],'observed');self.assertEqual(after['totals'],before['totals']);self.assertEqual(after['totals']['modelCalls'],1)
            self.assertEqual((after['totals']['inputTokens'],after['totals']['outputTokens']),(100,5))
            state=next((root/'.usage-reader').glob('*.sqlite'))
            with reader().Reader(source,state,os.getuid(),'worker') as cursor:
                self.assertEqual({r['requestId'] for r in cursor.requests().values()},{'request-one','request-two'});self.assertEqual(cursor.turn(request)['finishedAt'],1800)
            source.write_bytes(original);returned=self.receipt(m,p,m.export_owner(data),'run1','job1',root)
            self.assertEqual(returned['totals'],before['totals']);print('RETURN original R SHA256',hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)

    def test_different_sdk_generations_keep_distinct_request_facts(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-sdk-generation-') as tmp:
            root=Path(tmp);source=root/'R';a=row();b=dict(a,requestGeneration='different-sdk-generation',generation='different-r-generation')
            source.write_bytes(line(a)+line(b))
            with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                cursor.read();self.assertEqual(len(cursor.requests()),2)

    def test_gateway_uses_matching_sdk_generation_after_cached_binding(self):
        with tempfile.TemporaryDirectory(prefix='r-sdk-bind-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);m.export_owner(data);source=Path(p['runtimeSource']['raw']);new=dict(m.lines(source.read_bytes())[0],requestGeneration='new-sdk-generation',generation='new-r-generation')
            with source.open('ab') as out:out.write(line(new))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:
                binding=json.loads(db.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='request-one'").fetchone()[0]);binding['generation']='new-sdk-generation';db.execute("UPDATE mail_sdk_requests SET generation=?,binding_json=? WHERE request_id='request-one'",('new-sdk-generation',json.dumps(binding)))
            path=Path(p['sources']['gateway']);rows=m.lines(path.read_bytes());rows[0]['requestGeneration']='new-sdk-generation';path.write_bytes(b''.join(line(r) for r in rows))
            JobReceipts().refusal(m,p,data,'R_UNRESOLVED_REQUESTS')

class SdkHistory(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt
    def test_same_request_id_in_two_sdk_generations_keeps_both_usage_units(self):
        with tempfile.TemporaryDirectory(prefix='r-sdk-history-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);gp=Path(p['sources']['gateway']);g=m.lines(gp.read_bytes());g[0]['requestGeneration']='ledger-one';gp.write_bytes(b''.join(line(r) for r in g));m.export_owner(data)
            rp=Path(p['runtimeSource']['raw']);new=dict(m.lines(rp.read_bytes())[0],requestGeneration='sdk-next',generation='r-next')
            with rp.open('ab') as out:out.write(line(new))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:
                b=json.loads(db.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='request-one'").fetchone()[0]);b['generation']='sdk-next';db.execute("UPDATE mail_sdk_requests SET generation=?,binding_json=? WHERE request_id='request-one'",('sdk-next',json.dumps(b)))
            later=copy.deepcopy(g[0]);later.update(requestGeneration='sdk-next',turnId='turn-next');later['totals'].update(inputTokens=200,uncachedInputTokens=130,outputTokens=20);g.insert(1,later);gp.write_bytes(b''.join(line(r) for r in g))
            path=Path(p['sources']['raw'][0]);native=m.lines(path.read_bytes());extra=copy.deepcopy(native[1:4])
            for r in extra:
                r['payload']['turn_id']='turn-next'
                if 'response_id' in r['payload']:r['payload']['response_id']='response-next';r['payload']['usage'].update(input_tokens=200,output_tokens=20)
            path.write_bytes(b''.join(line(r) for r in [*native,*extra]))
            owner=m.export_owner(data);result=self.receipt(m,p,owner,'run1','job1',root)
            self.assertEqual(result['status'],'observed',result);self.assertEqual((result['totals']['modelCalls'],result['totals']['inputTokens'],result['totals']['outputTokens']),(2,300,25))

class PreviousStateMigration(unittest.TestCase):
    def test_b31_state_keeps_offset_fact_and_cached_binding(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-b31-state-') as tmp:
            root=Path(tmp);source=root/'R';fact=row();source.write_bytes(line(fact));st=source.stat();state=root/'state'
            bound=dict(kind='request',requestId='request-one',jobId='job1',sessionId='s',sessionCreated=42,turn=1,claimedAt='1970-01-01T00:00:01.100000+00:00',finishedAt=None)
            with sqlite3.connect(state) as db:
                db.executescript('CREATE TABLE cursor(dev TEXT,inode TEXT,offset INTEGER,skipped INTEGER,resets INTEGER,lastResetAt INTEGER);CREATE TABLE requests(id TEXT PRIMARY KEY,session TEXT,created INTEGER,turn INTEGER,payload TEXT);CREATE TABLE bindings(run TEXT,request TEXT,payload TEXT,PRIMARY KEY(run,request));')
                db.execute('INSERT INTO cursor VALUES(?,?,?,0,0,0)',(str(st.st_dev),str(st.st_ino),st.st_size));db.execute('INSERT INTO requests VALUES(?,?,?,?,?)',('request-one','s',42,1,json.dumps(fact)));db.execute('INSERT INTO bindings VALUES(?,?,?)',('run1','request-one',json.dumps(bound)))
            state.chmod(0o600)
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                self.assertEqual(cursor.read()['readBytes'],len(source.read_bytes()));self.assertEqual(cursor.read()['readBytes'],0);self.assertEqual(len(cursor.requests()),1);self.assertIsNone(cursor.binding('run1',module.request_key(fact))) # Policy3 cannot inherit an unversioned legacy binding.
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                self.assertEqual(cursor.read()['readBytes'],0);self.assertEqual(len(cursor.requests()),1)

class MigrationKeyCollision(unittest.TestCase):
    def test_rekey_does_not_overwrite_an_old_id_equal_to_an_encoded_key(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-migration-keys-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(b'');state=root/'state';a=dict(row(),requestId='a',requestGeneration='g');b=dict(row(),requestId='["g","a"]',requestGeneration='g2')
            with sqlite3.connect(state) as db:
                db.execute('CREATE TABLE requests(id TEXT PRIMARY KEY,session TEXT,created INTEGER,turn INTEGER,payload TEXT)')
                for r in [a,b]:db.execute('INSERT INTO requests VALUES(?,?,?,?,?)',(r['requestId'],'s',42,1,json.dumps(r)))
            state.chmod(0o600)
            with module.Reader(source,state,os.getuid(),'worker') as cursor:
                self.assertEqual({r['requestGeneration'] for r in cursor.requests().values()},{'g','g2'});self.assertEqual(len(cursor.requests()),2)

class QualifiedIdentity(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt
    def test_internal_sdk_names_cannot_collide_with_a_literal_request_id(self):
        from types import SimpleNamespace
        module=reader();literal='sdk-b1592ccb20c4b3c3859b8358752886f5f59d218b0b14b1ffa6a3b88e92692700';bound=[];gateway=[]
        for i,(rid,generation) in enumerate([('same','g1'),('same','g2'),(literal,'g3')]):
            bound.append(dict(kind='request',requestId=rid,requestGeneration=generation,jobId='job1',sessionId='s',sessionCreated=42,turn=i,finishedAt=None))
            gateway.append(dict(kind='request',requestId=rid,requestGeneration=generation,threadId='thread-'+str(i)))
        rows,g,raw=module.finish(SimpleNamespace(require=fixtures.module().require),bound,gateway,[],'2026-10-18T00:00:00Z')
        self.assertEqual(len({r['requestId'] for r in rows if r['kind']=='request'}),3)

    def test_generationless_gateway_does_not_guess_between_two_sdk_facts(self):
        with tempfile.TemporaryDirectory(prefix='r-g-no-sdk-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);rp=Path(p['runtimeSource']['raw']);new=dict(m.lines(rp.read_bytes())[0],requestGeneration='sdk-next')
            with rp.open('ab') as out:out.write(line(new))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:
                binding=json.loads(db.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='request-one'").fetchone()[0]);binding['generation']='sdk-next';db.execute("UPDATE mail_sdk_requests SET generation=?,binding_json=? WHERE request_id='request-one'",('sdk-next',json.dumps(binding)))
            JobReceipts().refusal(m,p,data,'R_REQUEST_UNPROVEN')

class QualifiedParent(unittest.TestCase):
    def test_private_parent_link_survives_different_sdk_generations(self):
        from types import SimpleNamespace
        module=reader();bound=[dict(kind='request',requestId=rid,requestGeneration=gen,finishedAt=None) for rid,gen in [('parent','sdk-parent'),('child','sdk-child')]]
        gateway=[dict(kind='request',requestId=rid,requestGeneration=gen,threadId=rid,**({'parentRequestId':'parent'} if rid=='child' else {})) for rid,gen in [('parent','sdk-parent'),('child','sdk-child')]]
        rows,g,raw=module.finish(SimpleNamespace(require=fixtures.module().require),bound,gateway,[],'2026-10-18T00:00:00Z')
        parent=next(r for r in g if r.get('threadId')=='parent');child=next(r for r in g if r.get('threadId')=='child');self.assertEqual(child['parentRequestId'],parent['requestId'])

class MixedGenerationGateway(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt
    def test_one_exact_gateway_row_does_not_admit_another_ambiguous_row(self):
        with tempfile.TemporaryDirectory(prefix='r-g-mixed-sdk-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);rp=Path(p['runtimeSource']['raw']);new=dict(m.lines(rp.read_bytes())[0],requestGeneration='sdk-next')
            with rp.open('ab') as out:out.write(line(new))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:
                binding=json.loads(db.execute("SELECT binding_json FROM mail_sdk_requests WHERE request_id='request-one'").fetchone()[0]);binding['generation']='sdk-next';db.execute("UPDATE mail_sdk_requests SET generation=?,binding_json=? WHERE request_id='request-one'",('sdk-next',json.dumps(binding)))
            gp=Path(p['sources']['gateway']);g=m.lines(gp.read_bytes());exact=dict(g[0],requestGeneration='sdk-next');g[0]['threadId']='unknown-thread';g.insert(0,exact);gp.write_bytes(b''.join(line(r) for r in g))
            JobReceipts().refusal(m,p,data,'R_REQUEST_UNPROVEN')

class FilePolicyReadWindow(unittest.TestCase):
    def test_shared_file_max_bounds_each_tail_pass_without_losing_a_partial_record(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-file-policy-') as tmp:
            root=Path(tmp);source=root/'R';policy=root/'policy.json';first=line(row());second=line(row('second-request'));maximum=max(len(first),len(second))+1
            source.write_bytes(first+second);policy.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=maximum,recordMaxBytes=max(len(first),len(second)))))
            with module.Reader(source,root/'state',os.getuid(),'worker',policy=policy) as cursor:
                a=cursor.read();self.assertEqual(a['offset'],len(first));self.assertLessEqual(a['readBytes'],maximum);self.assertEqual(len(cursor.requests()),1);self.assertEqual(a['skippedLines'],0)
                b=cursor.read();self.assertEqual(b['offset'],source.stat().st_size);self.assertLessEqual(b['readBytes'],maximum);self.assertEqual(len(cursor.requests()),2);self.assertEqual(b['skippedLines'],0)
                self.assertEqual(cursor.read()['readBytes'],0)

class B35Findings(unittest.TestCase):
    two_runs=JobReceipts.two_runs
    with_ordinary=JobReceipts.with_ordinary
    receipt=JobReceipts.receipt

    def test_first_bind_ledger_time_has_its_own_finite_limit(self):
        from unittest.mock import patch
        for delay,want in [(0,1),(4,0),(0,1)]:
            with self.subTest(delay=delay), tempfile.TemporaryDirectory(prefix='r-bind-time-') as tmp:
                m,p,data=fixtures.RuntimeSource().files(Path(tmp));clock=[0.0];injections=[0];original=m.Meter.read
                def delayed(meter,path,*args,**kwargs):
                    result=original(meter,path,*args,**kwargs)
                    if str(path)==p['runtimeSource']['ledger']:clock[0]+=delay;injections[0]+=1
                    return result
                with patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.Meter,'read',new=delayed):
                    if delay:
                        with self.assertRaisesRegex(m.Incomplete,'^BUDGET_EXCEEDED$'):m.export_owner(data)
                    else:
                        out=m.export_owner(data);self.assertEqual(len([r for r in out['rows'] if r['kind']=='request']),1)
                self.assertEqual(injections[0],1)

    def test_first_bind_ledger_bytes_have_their_own_finite_limit(self):
        from unittest.mock import patch
        for maximum,want in [(16*1024*1024,1),(4096,0),(16*1024*1024,1)]:
            with self.subTest(maximum=maximum),tempfile.TemporaryDirectory(prefix='r-bind-bytes-') as tmp:
                m,p,data=fixtures.RuntimeSource().files(Path(tmp));data['budget']=maximum
                with patch.object(m,'LIMIT',maximum):
                    if not want:
                        with self.assertRaisesRegex(m.Incomplete,'^BUDGET_EXCEEDED$'):m.export_owner(data)
                    else:
                        out=m.export_owner(data);self.assertEqual(len([r for r in out['rows'] if r['kind']=='request']),1)

    def test_complete_868_byte_bad_line_passes_window_and_next_request_is_read(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-over-window-') as tmp:
            root=Path(tmp);source=root/'R';policy=root/'policy';good=line(row())
            policy.write_text(json.dumps(dict(schemaVersion=1,fileMaxBytes=767,recordMaxBytes=668)))
            source.write_bytes(good)
            with module.Reader(source,root/'state',os.getuid(),'worker',policy=policy) as cursor:
                cursor.read();self.assertEqual(len(cursor.requests()),1)
                saved=source.read_bytes();bad=b'x'*867+b'\n';source.write_bytes(saved+bad+line(row('second')))
                import hashlib
                print('DAMAGE overlong bytes',len(bad),'fixedCount',source.read_bytes().count(bad),'SHA256',hashlib.sha256(saved).hexdigest(),'->',hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
                for _ in range(3):last=cursor.read()
                self.assertEqual(len(cursor.requests()),2);self.assertEqual(last['totalSkippedLines'],1)
                self.assertEqual(last['offset'],source.stat().st_size)
                source.write_bytes(saved+line(row('second')));cursor.read();returned=cursor.read()
                self.assertEqual(len(cursor.requests()),2);self.assertEqual(returned['offset'],source.stat().st_size)

    def test_overlong_line_also_drains_when_record_limit_equals_pass_limit(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-equal-limits-') as tmp:
            root=Path(tmp);policy=root/'policy';source=root/'R'
            policy.write_text('{"schemaVersion":1,"fileMaxBytes":668,"recordMaxBytes":668}')
            source.write_bytes(b'x'*867+b'\n'+line(row()))
            with module.Reader(source,root/'state',os.getuid(),'worker',policy=policy) as cursor:
                for _ in range(3):out=cursor.read()
                self.assertEqual(len(cursor.requests()),1);self.assertEqual(out['totalSkippedLines'],1)

    def test_in_place_shrink_during_overlong_drain_waits_without_spinning(self):
        import signal
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='r-drain-shrink-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(b'x'*100000+b'\n'+line(row()))
            pid=os.fork()
            if pid==0:
                signal.alarm(2)
                try:
                    module=reader();original=module.os.fdopen
                    class ShrinkAfterFirstRead:
                        def __init__(self,stream):self.stream=stream;self.first=True
                        def __getattr__(self,key):return getattr(self.stream,key)
                        def __enter__(self):return self
                        def __exit__(self,*args):return self.stream.__exit__(*args)
                        def readline(self,*args):
                            chunk=self.stream.readline(*args)
                            if self.first:
                                import hashlib
                                saved=source.read_bytes();source.write_bytes(b'');self.first=False
                                print('DAMAGE in-place shrink1 SHA256',hashlib.sha256(saved).hexdigest(),'->',hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
                            return chunk
                    with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                        with patch.object(module.os,'fdopen',side_effect=lambda *a,**kw:ShrinkAfterFirstRead(original(*a,**kw))):out=cursor.read()
                        assert out['offset']==0 and out['skippedLines']==0,out
                        source.write_bytes(line(row()));cursor.read();assert len(cursor.requests())==1
                    os._exit(0)
                except BaseException:
                    import traceback
                    traceback.print_exc();os._exit(1)
            _,status=os.waitpid(pid,0)
            self.assertEqual(os.waitstatus_to_exitcode(status),0,'reader did not return before the 2s copy-only watchdog')

    def test_contradictory_delivery_without_claim_cannot_erase_bound_cost(self):
        with tempfile.TemporaryDirectory(prefix='r-unsuitable-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root)
            before=self.receipt(m,p,m.export_owner(data),'run1','job1',root)
            self.assertEqual(before['totals']['inputTokens'],100)
            source=Path(p['runtimeSource']['raw']);saved=source.read_bytes()
            bad=copy.deepcopy(m.lines(saved)[1]);bad.update(deliveryIds=['b'*64],claims=[])
            encoded=line(bad);source.write_bytes(saved+encoded)
            import hashlib
            print('DAMAGE contradictory claim count',source.read_bytes().count(encoded),'SHA256',hashlib.sha256(saved).hexdigest(),'->',hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
            damaged=self.receipt(m,p,m.export_owner(data),'run1','job1',root)
            self.assertEqual(damaged['totals']['inputTokens'],100)
            self.assertEqual(damaged['runtimeDiagnostics'],[dict(source='worker',skippedLines=1,unboundRecords=0)])
            source.write_bytes(saved)
            returned=self.receipt(m,p,m.export_owner(data),'run1','job1',root)
            self.assertEqual(returned['totals']['inputTokens'],100)

    def test_upgrade_removes_previously_saved_unsuitable_labels(self):
        with tempfile.TemporaryDirectory(prefix='r-old-bad-label-') as tmp:
            root=Path(tmp);m,p,data=self.two_runs(root);owner=m.export_owner(data)
            self.assertEqual(self.receipt(m,p,owner,'run1','job1',root)['totals']['inputTokens'],100)
            import hashlib
            state=root/'.usage-reader'/(hashlib.sha256(p['runtimeSource']['raw'].encode()).hexdigest()+'.sqlite')
            bad=copy.deepcopy(m.lines(Path(p['runtimeSource']['raw']).read_bytes())[1]);bad.update(deliveryIds=['b'*64],claims=[])
            with sqlite3.connect(state) as db:
                db.execute('INSERT OR REPLACE INTO turns VALUES(?,?,?,?)',('s',42,1,json.dumps(bad)))
                db.execute('INSERT OR IGNORE INTO turn_deliveries VALUES(?,?,?,?)',('s',42,1,'b'*64))
                db.execute('PRAGMA user_version=1')
            out=m.export_owner(data)
            self.assertEqual(self.receipt(m,p,out,'run1','job1',root)['totals']['inputTokens'],100)
            self.assertGreaterEqual(out['runtimeDiagnostics']['skippedLines'],1)

    def test_missing_claim_field_is_unsuitable_and_never_aborts_read_or_migration(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-missing-claim-field-') as tmp:
            root=Path(tmp);source=root/'R';bad=row('bad');bad['claims'][0].pop('deliveryId')
            source.write_bytes(line(bad)+line(row()))
            with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                out=cursor.read();self.assertEqual(len(cursor.requests()),1);self.assertEqual(out['skippedLines'],1)
                cursor.db.execute('INSERT OR REPLACE INTO turns VALUES(?,?,?,?)',('s',42,1,json.dumps(dict(bad,kind='runtime_turn'))))
                cursor.db.execute('PRAGMA user_version=1');cursor.db.commit()
            with module.Reader(source,root/'state',os.getuid(),'worker') as cursor:
                self.assertEqual(len(cursor.requests()),1);self.assertEqual(cursor.read()['totalSkippedLines'],2)

    def test_r_index_initialization_does_not_spend_metadata_deadline(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='r-index-time-') as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));module=m.incremental_module();clock=[0.0];original=module.Reader.__init__
            def slow_init(self,*args,**kwargs):
                original(self,*args,**kwargs);clock[0]+=4
            with patch.object(m,'incremental_module',return_value=module),patch.object(module.Reader,'__init__',new=slow_init),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]):
                out=m.export_owner(data)
            self.assertEqual(len([r for r in out['rows'] if r['kind']=='request']),1)

    def test_policy_missing_invalid_and_return_never_read_r_without_valid_policy(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-policy-grammar-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row()));policy=root/'policy'
            valid='{"schemaVersion":1,"fileMaxBytes":4096,"recordMaxBytes":2048}'
            cases=[('missing',None),('broken','{bad'),('boolean','{"schemaVersion":true,"fileMaxBytes":4096,"recordMaxBytes":2048}'),('duplicate','{"schemaVersion":1,"fileMaxBytes":4096,"recordMaxBytes":128,"recordMaxBytes":2048}'),('unsafe-int','{"schemaVersion":1,"fileMaxBytes":9007199254740992,"recordMaxBytes":2048}'),('extra','{"schemaVersion":1,"fileMaxBytes":4096,"recordMaxBytes":2048,"extra":0}'),('BOM','\ufeff'+valid),('UTF16',valid.encode('utf-16'))]
            for name,content in cases:
                with self.subTest(name=name):
                    if content is None:policy.unlink(missing_ok=True)
                    else:
                        policy.write_bytes(content if isinstance(content,bytes) else content.encode('utf8'));policy.chmod(0o644)
                    with module.Reader(source,root/('state-'+name),os.getuid(),'worker',policy=policy) as cursor:
                        out=cursor.read();self.assertEqual(out['readBytes'],0);self.assertEqual(out['offset'],0);self.assertEqual(cursor.requests(),{})
                        self.assertEqual(out.get('readError'),'R_POLICY_MISSING' if content is None else 'R_POLICY_INVALID')
                        self.assertIn('policy отсутствует' if content is None else 'policy негодна',out.get('notice',''))
                        policy.write_text(valid);policy.chmod(0o644)
                        self.assertEqual(cursor.read()['readBytes'],source.stat().st_size);self.assertEqual(len(cursor.requests()),1)

    def test_policy_unsafe_file_and_return(self):
        module=reader()
        with tempfile.TemporaryDirectory(prefix='r-policy-unsafe-') as tmp:
            root=Path(tmp);source=root/'R';source.write_bytes(line(row()));policy=root/'policy'
            policy.write_text('{"schemaVersion":1,"fileMaxBytes":4096,"recordMaxBytes":2048}')
            for kind in ('mode','owner','link','symlink','directory'):
                with self.subTest(kind=kind):
                    original=root/'saved';original.unlink(missing_ok=True)
                    if kind=='mode':policy.chmod(0o666)
                    elif kind=='owner':os.chown(policy,12345,12345)
                    elif kind=='link':os.link(policy,original)
                    elif kind=='symlink':policy.rename(original);policy.symlink_to(original)
                    else:policy.rename(original);policy.mkdir()
                    with module.Reader(source,root/('state-'+kind),os.getuid(),'worker',policy=policy) as cursor:
                        out=cursor.read();self.assertEqual(out['readBytes'],0);self.assertEqual(out.get('readError'),'R_POLICY_INVALID')
                        if kind=='mode':policy.chmod(0o644)
                        elif kind=='owner':os.chown(policy,0,0)
                        elif kind=='link':original.unlink()
                        elif kind=='symlink':policy.unlink();original.rename(policy)
                        else:policy.rmdir();original.rename(policy)
                        self.assertEqual(len(cursor.requests()),0);cursor.read();self.assertEqual(len(cursor.requests()),1)

if __name__=='__main__':unittest.main()
