"""Consumer evidence, not mock totals: actual R/G and engine files on private filesystem."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
MODULE = PACKAGE/'runtime/team_usage.py'

def load():
    if not MODULE.exists():
        raise AssertionError('team collector missing: idle/index and independent source verification not implemented')
    spec = importlib.util.spec_from_file_location('team_usage', MODULE)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

def put(path, value, lines=False):
    _fixture_mkdir(path.parent, mode=0o755, parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(v)+'\n' for v in value) if lines else json.dumps(value))
    path.chmod(0o600)

START='2026-10-17T00:00:00Z'
END='2026-10-17T00:01:00Z'
CUT='2026-10-17T00:02:00Z'

class TeamUsage(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='gamma-ap019-');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.home=self.root/'home';_fixture_mkdir(self.home, mode=0o755)
        self.runtime=self.home/'runtime.jsonl';self.gateway=self.home/'gateway.jsonl';self.raw=self.home/'rollout.jsonl'
        self.binding=dict(requestId='req1',jobId='job1',sessionId='ap-session',sessionCreated=42,turn=7,claimedAt=START,finishedAt=END)
        self.r=[dict(kind='request',**self.binding),dict(kind='watermark',at=CUT)]
        self.g=[dict(kind='request',requestId='req1',sessionId='ap-session',sessionCreated=42,dshTurn=7,
          uid=os.getuid(),engine='codex',threadId='thread1',turnId='turn1',startedAt=START,endedAt=END,
          status='completed',subscription='codex-3',authEpoch='auth-one',totals=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10)),dict(kind='watermark',at=CUT)]
        self.rows=[dict(type='session_meta',payload=dict(id='thread1')),
          dict(type='event_msg',timestamp=START,payload=dict(type='task_started',turn_id='turn1')),
          dict(type='token_usage_record',timestamp='2026-10-17T00:00:30Z',payload=dict(turn_id='turn1',response_id='response1',usage=dict(input_tokens=100,cached_input_tokens=60,cache_write_input_tokens=10,output_tokens=5))),
          dict(type='event_msg',timestamp=END,payload=dict(type='task_complete',turn_id='turn1'))]
        self.participant=dict(name='master',uid=os.getuid(),gid=os.getgid(),home=str(self.home),engine='codex',
          jobs=[dict(jobId='job1',claimAt=START,finishAt=END)],sources=dict(runtime=str(self.runtime),gateway=str(self.gateway),raw=[str(self.raw)]))
        self.record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId='run1',project=str(self.root/'project'),startedAt=START,participants=[self.participant])
        self.recordpath=self.root/'run.json';self.index=self.root/'index.json'
        self.write()
    def write(self):
        put(self.runtime,self.r,True);put(self.gateway,self.g,True);put(self.raw,self.rows,True)
        put(self.recordpath,self.record);put(self.index,dict(schemaVersion=1,runs=[dict(runId='run1',phase='OPEN',record=str(self.recordpath))]))
    def collect(self, cache=None):
        return load().collect_record(self.record,CUT,cache or {},drop_identity=False)
    def test_new_writer_emits_receipt_schema4(self):
        self.assertEqual(self.collect()['receipt']['schemaVersion'],4)

    def test_schema3_accepts_proven_incomplete_but_legacy2_rejects_it(self):
        receipt=self.collect()['receipt'];receipt['schemaVersion']=3
        for key in ('windowEnd','endReason','operatorActions'):receipt.pop(key)
        receipt['status']='incomplete';receipt['missing']=[dict(participant='master',reason='CHILD_INCOMPLETE')]
        receipt['coverage']['codex']['missing']=['master']
        receipt['rows'][0].update(status='incomplete',reason='CHILD_INCOMPLETE')
        self.assertEqual(load().public_receipt(receipt,'run1')['totals']['inputTokens'],100)
        receipt['schemaVersion']=2
        meter=load()
        with self.assertRaisesRegex(meter.Incomplete,'RECEIPT_INVALID'):meter.public_receipt(receipt,'run1')

    def test_schema3_incomplete_numbers_require_child_reason_and_exact_arithmetic(self):
        receipt=self.collect()['receipt'];receipt['schemaVersion']=3
        for key in ('windowEnd','endReason','operatorActions'):receipt.pop(key)
        receipt['status']='incomplete';receipt['missing']=[dict(participant='master',reason='CHILD_INCOMPLETE')]
        receipt['coverage']['codex']['missing']=['master'];receipt['rows'][0].update(status='incomplete',reason='CHILD_INCOMPLETE')
        self.assertEqual(load().public_receipt(receipt,'run1')['rows'][0]['totals']['inputTokens'],100)
        receipt['totals']['inputTokens']=101
        meter=load()
        with self.assertRaisesRegex(meter.Incomplete,'RECEIPT_INVALID'):meter.public_receipt(receipt,'run1')
        receipt['totals']['inputTokens']=100
        receipt['missing'][0]['reason']='SOURCE_UNAVAILABLE';receipt['rows'][0]['reason']='SOURCE_UNAVAILABLE'
        meter=load()
        with self.assertRaisesRegex(meter.Incomplete,'RECEIPT_INVALID'):meter.public_receipt(receipt,'run1')

    def add_sova(self):
        home=self.root/'sova-home';participant=copy.deepcopy(self.participant)
        participant.update(name='sova',engine='claude',home=str(home),sources=dict(runtime=str(home/'runtime.jsonl'),gateway=str(home/'gateway.jsonl'),raw=[str(home/'native.jsonl')]))
        gateway=copy.deepcopy(self.g);gateway[0].update(engine='claude',subscription='claude-1',threadId='sdk-sova')
        native=[dict(type='assistant',sessionId='sdk-sova',timestamp=END,message=dict(id='sova-message',usage=dict(input_tokens=30,output_tokens=5,cache_read_input_tokens=60,cache_creation_input_tokens=10),content=[]))]
        put(Path(participant['sources']['runtime']),self.r,True);put(Path(participant['sources']['gateway']),gateway,True);put(Path(participant['sources']['raw'][0]),native,True)
        self.record['participants'].append(participant)
        return participant
    def test_missing_participant_keeps_measured_team_numbers_then_returns(self):
        sova=self.add_sova();source=Path(sova['sources']['gateway']);saved=source.read_bytes()
        healthy=self.collect()['receipt'];self.assertEqual(healthy['totals']['inputTokens'],200)
        source.unlink()
        try:
            partial=self.collect()['receipt'];self.assertEqual(partial['status'],'incomplete')
            self.assertEqual(partial['missing'],[dict(participant='sova',reason='SOURCE_UNAVAILABLE')])
            self.assertEqual(partial['totals']['inputTokens'],100)
            self.assertEqual(partial['byEngine']['codex']['inputTokens'],100)
            self.assertIsNone(partial['byEngine']['claude']['inputTokens'])
            self.assertEqual(partial['bySubscription']['codex-3']['inputTokens'],100)
            self.assertIsNone(next(row for row in partial['rows'] if row['participant']=='sova')['totals']['inputTokens'])
            m=load();self.assertEqual(m.public_receipt(partial,'run1')['totals']['modelCalls'],1)
            wrong=copy.deepcopy(partial);wrong['totals']['inputTokens']+=1;wrong['totals']['uncachedInputTokens']+=1
            with self.assertRaisesRegex(m.Incomplete,'RECEIPT_INVALID'):m.public_receipt(wrong,'run1')
        finally:source.write_bytes(saved)
        restored=self.collect()['receipt'];self.assertEqual(restored['status'],'observed');self.assertEqual(restored['totals']['inputTokens'],200)
    def test_no_participant_data_is_unknown_not_zero(self):
        sova=self.add_sova();self.gateway.unlink();Path(sova['sources']['gateway']).unlink()
        receipt=load().public_receipt(self.collect()['receipt'],'run1')
        self.assertEqual({item['participant'] for item in receipt['missing']},{'master','sova'})
        self.assertTrue(all(value is None for value in receipt['totals'].values()))
        self.assertTrue(all(value is None for data in receipt['byEngine'].values() for value in data.values()))
        self.assertEqual(receipt['bySubscription'],{})
        m=load();wrong=copy.deepcopy(receipt);wrong['totals']=dict.fromkeys(m.METRICS,0)
        with self.assertRaisesRegex(m.Incomplete,'RECEIPT_INVALID'):m.public_receipt(wrong,'run1')
    def test_missing_same_engine_participant_keeps_engine_subtotal(self):
        sova=self.add_sova();Path(sova['sources']['gateway']).unlink();sova['engine']='codex'
        receipt=load().public_receipt(self.collect()['receipt'],'run1')
        self.assertEqual(receipt['byEngine']['codex']['inputTokens'],100)
        self.assertEqual(receipt['totals']['inputTokens'],100)
    def test_idle_index_does_not_touch_any_home(self):
        put(self.index,dict(schemaVersion=1,runs=[]))
        result=load().iteration(self.index,self.root/'output',CUT,drop_identity=False)
        self.assertEqual((result['runs'],result['homeReads'],result['sourceBytes']),(0,0,0))
        self.assertFalse((self.root/'output').exists(),'idle created state or read a home')
    def test_real_sources_dedup_last_usage_and_closed_scope(self):
        self.rows.insert(-1,copy.deepcopy(self.rows[2]));self.write()
        result=self.collect();receipt=result['receipt']
        self.assertEqual(receipt['status'],'observed',receipt)
        self.assertEqual(receipt['totals'],dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10))
        self.assertEqual(receipt['coverage']['codex'],dict(expected=['master'],measured=['master'],missing=[]))
        self.assertEqual(receipt['rows'][0]['subscription'],'codex-3')
    def test_codex_epoch_and_slot_are_optional_for_token_totals(self):
        saved=copy.deepcopy(self.g)
        for mode in ('healthy','no-epoch','switcher-point','unknown','return'):
            self.g=copy.deepcopy(saved)
            if mode in {'no-epoch','unknown'}:self.g[0].pop('authEpoch')
            if mode=='unknown':self.g[0].pop('subscription')
            if mode=='switcher-point':self.g[0].update(subscription='unknown',subscriptionSource='unknown',authLinkTargetAtStart='/etc/claude-oauth/codex-podpiska-4/auth.json',authLinkMeaning='route-not-applied-source')
            self.write();receipt=self.collect()['receipt']
            self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals']['inputTokens'],100)
            self.assertEqual(receipt['rows'][0]['subscription'],'unknown' if mode=='unknown' else 'codex-4' if mode=='switcher-point' else 'codex-3')
            self.assertEqual(receipt['rows'][0]['subscriptionSource'],'unknown' if mode=='unknown' else 'switcher')
            self.assertEqual(load().public_receipt(receipt,'run1')['totals']['inputTokens'],100)

    def test_home_inaccessible_is_named_incomplete_not_zero(self):
        self.participant['home']=str(self.root/'missing-home')
        result=self.collect()['receipt']
        self.assertEqual(result['status'],'incomplete')
        self.assertEqual(result['missing'],[dict(participant='master',reason='HOME_UNAVAILABLE')])
        self.assertTrue(all(v is None for v in result['totals'].values()))
    def test_foreign_uid_refuses_then_return_is_observed(self):
        self.g[0]['uid']=os.getuid()+1;self.write()
        result=self.collect()['receipt'];self.assertEqual(result['missing'][0]['reason'],'FOREIGN_TURN')
        self.g[0]['uid']=os.getuid();self.write();self.assertEqual(self.collect()['receipt']['status'],'observed')
    def test_turn_outside_job_then_return(self):
        self.participant['jobs'][0]['claimAt']='2026-10-17T00:00:01Z'
        self.assertEqual(self.collect()['receipt']['missing'][0]['reason'],'TURN_OUTSIDE_JOB')
        self.participant['jobs'][0]['claimAt']=START
        self.assertEqual(self.collect()['receipt']['status'],'observed')
    def test_unbound_job_not_invented_zero(self):
        self.r.pop(0);self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['missing'][0]['reason'],'UNBOUND')
        self.assertIsNone(receipt['totals']['modelCalls'])
    def test_incremental_second_pass_reads_no_historical_bytes(self):
        first=self.collect();second=self.collect(first['cache'])
        self.assertEqual(first['receipt']['totals'],second['receipt']['totals'])
        self.assertEqual(second['sourceBytes'],0)
    def test_active_turn_not_zero_cost_and_cut_labelled(self):
        self.g[0]['endedAt']=None;self.g[0]['status']='running';self.r[0]['finishedAt']=None;self.participant['jobs'][0]['finishAt']=None;self.rows.pop();self.write()
        receipt=self.collect()['receipt']
        self.assertEqual(receipt['pending'],1);self.assertEqual(receipt['basis'],'closed_turns');self.assertEqual(receipt['phase'],'live')
    def test_native_claude_task_subtotal_null_and_incomplete(self):
        self.participant.update(name='sova',engine='claude')
        self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1')
        self.rows=[dict(type='assistant',sessionId='sdk1',timestamp='2026-10-17T00:00:30Z',message=dict(id='message1',usage=dict(input_tokens=2,output_tokens=7,cache_read_input_tokens=10,cache_creation_input_tokens=3),content=[dict(type='tool_use',id='task1',name='Task',input={})]))]
        self.write();receipt=self.collect()['receipt']
        self.assertEqual(receipt['missing'][0]['reason'],'CHILD_INCOMPLETE')
        self.assertEqual(receipt['rows'][0]['ofWhichSubagents']['inputTokens'],0)
        self.assertEqual(receipt['totals']['inputTokens'],15)

    def test_turn_in_another_raw_thread_is_foreign(self):
        self.rows[0]['payload']['id']='foreign-thread';self.write()
        self.assertEqual(self.collect()['receipt']['missing'][0]['reason'],'FOREIGN_TURN')
    def test_claude_fourth_subscription_is_not_a_real_slot(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-4',threadId='sdk1')
        self.rows=[dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=dict(input_tokens=1,output_tokens=2,cache_read_input_tokens=3,cache_creation_input_tokens=4)))];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'SUBSCRIPTION_UNBOUND')
    def test_active_claude_task_is_already_incomplete(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1',endedAt=None,status='running');self.r[0]['finishedAt']=None;self.participant['jobs'][0]['finishAt']=None
        self.rows=[dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=dict(input_tokens=1,output_tokens=2,cache_read_input_tokens=3,cache_creation_input_tokens=4),content=[dict(type='tool_use',id='a',name='Task')]))];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'CHILD_INCOMPLETE')
    def test_missing_expected_engine_is_not_measured_zero(self):
        self.assertIsNone(self.collect()['receipt']['byEngine']['claude']['inputTokens'])

    def test_multiple_jobs_in_same_dsh_turn_are_not_a_team_total(self):
        self.participant['jobs'].append(dict(jobId='job2',claimAt=START,finishAt=END))
        r=copy.deepcopy(self.r[0]);r.update(requestId='req2',jobId='job2');self.r.insert(1,r)
        g=copy.deepcopy(self.g[0]);g.update(requestId='req2');self.g.insert(1,g);self.write()
        self.assertEqual(self.collect()['receipt']['status'],'incomplete')
        self.assertEqual(self.collect()['receipt']['missing'][0]['reason'],'MIXED_JOB_TURN')
    def test_unlisted_child_raw_header_is_incomplete(self):
        child=self.home/'child.jsonl'
        put(child,[dict(type='session_meta',payload=dict(id='child1',source=dict(subagent=dict(thread_spawn=dict(parent_thread_id='thread1')))))],True)
        self.participant['sources']['raw'].append(str(child))
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'CHILD_INCOMPLETE')
    def test_gateway_numeric_mismatch_is_incomplete(self):
        self.g[0]['totals']=dict(modelCalls=1,inputTokens=101,uncachedInputTokens=31,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10);self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'GATEWAY_USAGE_MISMATCH')

    def test_foreign_file_cannot_supply_other_threads_turn(self):
        foreign=self.home/'foreign.jsonl';foreign_rows=copy.deepcopy(self.rows);foreign_rows[0]['payload']['id']='foreign'
        put(foreign,foreign_rows,True);self.participant['sources']['raw'].append(str(foreign));self.rows=self.rows[:1];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'FOREIGN_TURN')
    def test_rebuild_budget_persists_progress_instead_of_starving(self):
        m=load();m.BYTES=1024;cache={};offsets=[]
        for _ in range(6):
            result=m.collect_record(self.record,CUT,cache,drop_identity=False);cache=result['cache']
            offsets.append(cache.get('master',{}).get(str(self.raw),{}).get('offset',0))
            if result['receipt']['status']=='observed':break
        self.assertEqual(result['receipt']['status'],'observed',result)
        self.assertGreater(max(offsets),min(offsets))
    def test_global_byte_budget_applies_to_all_open_runs(self):
        record2=self.root/'run2.json';put(record2,dict(self.record,runId='run2'))
        put(self.index,dict(schemaVersion=1,runs=[dict(runId='run1',phase='OPEN',record=str(self.recordpath)),dict(runId='run2',phase='OPEN',record=str(record2))]))
        m=load();m.BYTES=2200
        report=m.iteration(self.index,self.root/'out',CUT,drop_identity=False)
        self.assertLessEqual(report['sourceBytes'],2200)

    def test_gateway_running_to_terminal_is_not_a_duplicate_conflict(self):
        running=copy.deepcopy(self.g[0]);running.update(endedAt=None,status='running');running.pop('totals')
        self.g.insert(0,running);self.write()
        self.assertEqual(self.collect()['receipt']['status'],'observed')
    def test_changed_job_for_same_request_is_not_last_row_wins(self):
        changed=copy.deepcopy(self.r[0]);changed['jobId']='different';self.r.insert(1,changed);self.write()
        self.assertEqual(self.collect()['receipt']['missing'][0]['reason'],'BINDING_CONFLICT')

    def test_unfinished_job_overdue_has_named_incomplete(self):
        self.participant['jobs'][0]['finishAt']=None
        result=load().collect_record(self.record,'2026-10-17T03:00:00Z',{},drop_identity=False)['receipt']
        self.assertEqual(result['missing'][0]['reason'],'JOB_OVERDUE')
    def test_bool_dsh_identity_cannot_be_a_real_turn(self):
        self.r[0]['sessionCreated']=True;self.g[0]['sessionCreated']=True;self.write()
        self.assertEqual(self.collect()['receipt']['status'],'incomplete')

    def test_unbound_extra_raw_turn_is_not_silently_omitted(self):
        self.participant['jobs'][0]['finishAt']=CUT;self.r[0]['finishedAt']=CUT
        extra=copy.deepcopy(self.rows[1:]);extra[0]['timestamp']='2026-10-17T00:01:10Z';extra[1]['timestamp']='2026-10-17T00:01:20Z';extra[2]['timestamp']='2026-10-17T00:01:30Z'
        for r in extra:r['payload']['turn_id']='unbound-turn'
        extra[1]['payload']['response_id']='extra-response';self.rows.extend(extra);self.write()
        result=self.collect()['receipt'];self.assertEqual(result['status'],'incomplete');self.assertEqual(result['missing'][0]['reason'],'UNBOUND')
    def test_codex_dsh_spawn_is_not_a_measured_empty_graph(self):
        self.rows.insert(-1,dict(type='response_item',timestamp='2026-10-17T00:00:40Z',payload=dict(type='function_call',name='mcp__masterdsh__subagent',call_id='spawn1',arguments='{}')));self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'CHILD_INCOMPLETE')
    def test_active_claude_dsh_spawn_is_not_a_measured_empty_graph(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1',endedAt=None,status='running');self.r[0]['finishedAt']=None;self.participant['jobs'][0]['finishAt']=None
        self.rows=[dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=dict(input_tokens=1,output_tokens=2,cache_read_input_tokens=3,cache_creation_input_tokens=4),content=[dict(type='tool_use',id='a',name='mcp__sovadsh__subagent')]))];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'CHILD_INCOMPLETE')

    def test_claude_last_complete_message_usage_wins_over_partial_block(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1')
        self.rows=[dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=None,content=[])),dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=dict(input_tokens=2,output_tokens=7,cache_read_input_tokens=10,cache_creation_input_tokens=3),content=[]))];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'observed');self.assertEqual(receipt['totals']['inputTokens'],15)
    def test_claude_late_message_correction_outside_request_is_refused(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1')
        row=dict(type='assistant',sessionId='sdk1',timestamp=END,message=dict(id='m',usage=dict(input_tokens=2,output_tokens=7,cache_read_input_tokens=10,cache_creation_input_tokens=3),content=[]))
        late=copy.deepcopy(row);late['timestamp']=CUT;self.rows=[row,late];self.write()
        self.assertEqual(self.collect()['receipt']['status'],'incomplete')
    def test_incremental_cache_does_not_copy_unrelated_usage_keys(self):
        self.rows[2]['payload']['usage']['unrelatedText']='SENSITIVE_MARKER';self.write()
        value=self.collect();self.assertEqual(value['receipt']['status'],'observed')
        self.assertNotIn('SENSITIVE_MARKER',json.dumps(value['cache']))

    def test_old_history_is_not_retained_in_this_projects_cache(self):
        old=copy.deepcopy(self.rows[2]);old['timestamp']='2026-10-16T00:00:00Z';old['payload']['response_id']='old-project-response';old['payload']['turn_id']='old-turn'
        self.rows.insert(1,old);self.write();result=self.collect()
        self.assertEqual(result['receipt']['status'],'observed')
        self.assertNotIn('old-project-response',json.dumps(result['cache']))

    def test_extra_claude_message_inside_job_but_without_request_is_unbound(self):
        self.participant.update(name='sova',engine='claude');self.g[0].update(engine='claude',subscription='claude-1',threadId='sdk1',endedAt='2026-10-17T00:00:20Z')
        row=dict(type='assistant',sessionId='sdk1',timestamp='2026-10-17T00:00:10Z',message=dict(id='m1',usage=dict(input_tokens=1,output_tokens=2,cache_read_input_tokens=3,cache_creation_input_tokens=4),content=[]))
        second=copy.deepcopy(row);second['timestamp']='2026-10-17T00:00:40Z';second['message']['id']='m2';self.rows=[row,second];self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'UNBOUND')
    def test_engine_cannot_run_before_its_specific_dsh_claim(self):
        r2=copy.deepcopy(self.r[0]);r2.update(requestId='req2',turn=8,claimedAt='2026-10-17T00:00:30Z');self.r.insert(1,r2)
        g2=copy.deepcopy(self.g[0]);g2.update(requestId='req2',dshTurn=8,turnId='turn2',startedAt='2026-10-17T00:00:21Z',endedAt='2026-10-17T00:00:29Z');self.g.insert(1,g2)
        self.g[0]['endedAt']='2026-10-17T00:00:20Z';self.rows[-1]['timestamp']=self.g[0]['endedAt'];self.rows[2]['timestamp']='2026-10-17T00:00:10Z'
        extra=copy.deepcopy(self.rows[1:]);extra[0]['timestamp']=g2['startedAt'];extra[1]['timestamp']='2026-10-17T00:00:25Z';extra[2]['timestamp']=g2['endedAt']
        for r in extra:r['payload']['turn_id']='turn2'
        extra[1]['payload']['response_id']='response2';self.rows.extend(extra);self.write()
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'incomplete');self.assertEqual(receipt['missing'][0]['reason'],'TURN_OUTSIDE_JOB')

    def test_proved_after_end_no_task_can_report_zero_without_reading_a_home(self):
        self.record['_jobsetVerified']=True;self.record.update(runtimeInformational=True,runtimeNoTaskInRun=['gayka']);self.participant.update(name='gayka',jobs=[],home=str(self.root/'not-opened'))
        result=self.collect()['receipt'];self.assertEqual(result['status'],'observed');self.assertEqual(result['totals']['modelCalls'],0)

    def test_unix_runtime_home_can_differ_from_codex_data_home(self):
        directory=self.root/'unix-home';directory.mkdir(mode=0o700)
        path=directory/'runtime.jsonl';self.runtime.rename(path);self.runtime=path
        self.participant['runtimeHome']=str(directory);self.participant['sources']['runtime']=str(path)
        receipt=self.collect()['receipt'];self.assertEqual(receipt['status'],'observed',receipt)
        self.assertEqual(receipt['totals']['inputTokens'],100)

if __name__=='__main__': unittest.main(verbosity=2)
