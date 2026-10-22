"""History/recompute contract: real source files and state, no mail or SQLite."""
import copy,json,os,unittest
from unittest.mock import patch
import test_time_usage as fixture
from test_time_usage import end,ts

class HistoryContract(unittest.TestCase):
    def setUp(self):
        self.f=fixture.TimeUsage();self.f.setUp();self.addCleanup(self.f.doCleanups)
        self.f.run['closedAt']=None;self.f.run['participants']=[dict(name='master',engine='codex')]
    def tick(self,at=100,runs=None):return self.f.module().iteration(runs or [self.f.run],self.f.sources,self.f.state,ts(at))
    def test_unassigned_end_is_retained_and_late_registration_counts_without_reread(self):
        self.f.run['startedAt']=ts(50);self.f.paths['master'].write_bytes(end(10,note='PRIVATE-NOT-STORED'))
        first=self.tick();self.assertIsNone(first['receipts']['run1']['totals']['modelCalls'])
        late=dict(self.f.run,runId='late',project='/late',startedAt=ts(0),closedAt=ts(20))
        second=self.tick(101,[self.f.run,late]);self.assertEqual(second['sourceBytes'],0)
        self.assertEqual(second['receipts']['late']['totals']['modelCalls'],1)
        state=json.loads(self.f.state.read_text());self.assertEqual(len(state['ends']),1);self.assertNotIn('PRIVATE-NOT-STORED',self.f.state.read_text())
    def test_same_key_append_and_rotation_are_not_counted_twice(self):
        self.f.paths['master'].write_bytes(end(10)+end(10));self.assertEqual(self.tick()['receipts']['run1']['totals']['modelCalls'],1)
        replacement=self.f.root/'replacement';replacement.write_bytes(end(10));replacement.chmod(0o600);os.replace(replacement,self.f.paths['master'])
        receipt=self.tick(101)['receipts']['run1'];self.assertEqual(receipt['totals']['modelCalls'],1);self.assertEqual(receipt['status'],'incomplete')
    def test_conflicting_duplicate_keeps_first_and_marks_incomplete(self):
        self.f.paths['master'].write_bytes(end(10)+end(20,turn='turn-10',input=100))
        r=self.tick()['receipts']['run1'];self.assertEqual(r['totals']['modelCalls'],1);self.assertEqual(r['totals']['inputTokens'],10);self.assertEqual(r['status'],'incomplete')
    def test_late_roster_uses_already_read_end(self):
        self.f.paths['vintik'].write_bytes(end(10,participant='vintik'));self.tick()
        self.f.run['participants'].append(dict(name='vintik',engine='codex'))
        result=self.tick(101);self.assertEqual(result['sourceBytes'],0);self.assertEqual(result['receipts']['run1']['totals']['modelCalls'],1)
    def test_late_second_open_run_recomputes_both_before_freeze(self):
        self.f.paths['master'].write_bytes(end(10));self.assertEqual(self.tick()['receipts']['run1']['totals']['modelCalls'],1)
        other=dict(self.f.run,runId='other',project='/other')
        result=self.tick(101,[self.f.run,other])
        for r in result['receipts'].values():self.assertIsNone(r['totals']['modelCalls']);self.assertEqual(r['status'],'incomplete')
        self.assertEqual(result['receipts']['run1']['rows'][0]['reason'],'OVERLAPPING_RUNS')
        self.assertEqual(result['receipts']['other']['rows'][0]['reason'],'OVERLAPPING_RUNS')
    def test_open_run_at_end_has_priority_over_closed_run_grace(self):
        a=dict(self.f.run,runId='A',startedAt=ts(0),closedAt=ts(60));b=dict(self.f.run,runId='B',project='/B',startedAt=ts(120),closedAt=None)
        self.f.paths['master'].write_bytes(end(300,input=100));result=self.tick(360,[a,b])
        self.assertEqual(result['receipts']['B']['totals']['inputTokens'],100)
        saved=json.loads(self.f.state.read_text());self.assertEqual(saved['runs']['A']['people']['master']['rows'],0,'grace must not count an end owned by an open RUN')
        self.assertIsNone(result['receipts']['A']['totals']['inputTokens'],'no rows remains null, not measured zero')

    def test_open_other_participant_does_not_block_grace(self):
        a=dict(self.f.run,runId='A',closedAt=ts(60));b=dict(self.f.run,runId='B',project='/B',startedAt=ts(120),closedAt=None,participants=[dict(name='vintik',engine='codex')])
        self.f.paths['master'].write_bytes(end(300,input=100));result=self.tick(360,[a,b]);self.assertEqual(result['receipts']['A']['totals']['inputTokens'],100)

    def test_late_registration_recounts_complete_history_as_observed(self):
        a=dict(self.f.run,runId='A',closedAt=ts(60));b=dict(self.f.run,runId='B',project='/B',startedAt=ts(120),closedAt=None)
        self.f.paths['master'].write_bytes(end(180,input=100));self.tick(240,[a])
        with self.f.paths['master'].open('ab') as stream:stream.write(end(270,input=7,cached=0,cache_write=0))
        result=self.tick(300,[a,b]);receipt=result['receipts']['B'];self.assertEqual(receipt['totals']['inputTokens'],107)
        self.assertIsNone(receipt['rows'][0]['reason']);self.assertEqual(receipt['status'],'observed')
        self.assertNotIn('LATE_REGISTRATION',self.f.module().PUBLIC_REASONS)
        self.assertEqual(self.f.module().public_receipt(receipt,'B'),receipt)
        repeat=self.tick(301,[a,b]);self.assertEqual(repeat['sourceBytes'],0);self.assertIsNone(repeat['receipts']['B']['rows'][0]['reason'])

    def test_late_registration_recounts_without_changing_old_final(self):
        a=dict(self.f.run,runId='A',closedAt=ts(60));b=dict(self.f.run,runId='B',project='/B',startedAt=ts(120),closedAt=None)
        self.f.paths['master'].write_bytes(end(180,input=100));frozen=self.tick(700,[a])['receipts']['A']
        result=self.tick(701,[a,b]);self.assertEqual(result['receipts']['A'],frozen)
        self.assertIsNone(result['receipts']['B']['rows'][0]['reason']);self.assertEqual(result['receipts']['B']['status'],'observed')

    def test_invalid_line_without_any_end_is_not_late_registration(self):
        m=self.f.module();self.f.paths['master'].write_bytes(b'not-an-end\n');m.iteration([],self.f.sources,self.f.state,ts(100))
        self.assertEqual(json.loads(self.f.state.read_text())['ends'],[])
        self.f.run['startedAt']=ts(50)
        with self.f.paths['master'].open('ab') as stream:stream.write(end(110))
        receipt=m.iteration([self.f.run],self.f.sources,self.f.state,ts(120))['receipts']['run1']
        self.assertEqual(receipt['totals']['modelCalls'],1);self.assertEqual(receipt['rows'][0]['reason'],'STREAM_GAP')

    def test_evicted_actual_end_marks_new_run_stream_gap(self):
        m=self.f.module();self.f.paths['master'].write_bytes(end(100))
        with patch.object(m,'HISTORY_MAX_ROWS',0):m.iteration([],self.f.sources,self.f.state,ts(110))
        self.assertEqual(json.loads(self.f.state.read_text())['ends'],[]);self.f.run['startedAt']=ts(50)
        receipt=m.iteration([self.f.run],self.f.sources,self.f.state,ts(120))['receipts']['run1']
        self.assertEqual(receipt['rows'][0]['reason'],'STREAM_GAP')

    def test_loss_watermark_survives_missing_source_and_eviction(self):
        m=self.f.module();self.f.paths['master'].write_bytes(end(80));m.iteration([],self.f.sources,self.f.state,ts(100))
        old=json.loads(self.f.state.read_text());old['sources']['master'].pop('endThrough',None);self.f.state.write_text(json.dumps(old))
        self.f.paths['master'].unlink();self.f.paths['vintik'].write_bytes(end(90,participant='vintik'))
        with patch.object(m,'HISTORY_MAX_ROWS',1):m.iteration([],self.f.sources,self.f.state,ts(110))
        self.assertNotIn('master',[e['participant'] for e in json.loads(self.f.state.read_text())['ends']]);self.f.run['startedAt']=ts(50)
        receipt=m.iteration([self.f.run],self.f.sources,self.f.state,ts(120))['receipts']['run1']
        self.assertEqual(receipt['rows'][0]['reason'],'STREAM_GAP')

    def test_control_without_a_counts_107_as_observed(self):
        m=self.f.module();self.f.paths['master'].write_bytes(end(180,input=100,cached=0,cache_write=0))
        m.iteration([],self.f.sources,self.f.state,ts(240))
        with self.f.paths['master'].open('ab') as stream:stream.write(end(270,input=7,cached=0,cache_write=0))
        b=dict(self.f.run,runId='B',startedAt=ts(120))
        value=self.tick(300,[b])['receipts']['B']
        self.assertEqual(value['totals']['inputTokens'],107);self.assertEqual(value['status'],'observed');self.assertIsNone(value['rows'][0]['reason'])
        self.assertEqual(self.tick(301,[b])['sourceBytes'],0)

    def test_lost_through_boundary_is_inclusive_and_later_start_is_healthy(self):
        m=self.f.module();self.f.paths['master'].write_bytes(end(100,input=100,cached=0,cache_write=0)+end(101,input=7,cached=0,cache_write=0))
        with patch.object(m,'HISTORY_MAX_ROWS',1):m.iteration([],self.f.sources,self.f.state,ts(110))
        state=json.loads(self.f.state.read_text());self.assertEqual(state['lostThrough']['master'],ts(100))
        for start,reason in [(100,'STREAM_GAP'),(101,None)]:
            with self.subTest(start=start):
                self.f.state.write_text(json.dumps(state));b=dict(self.f.run,runId='B',startedAt=ts(start))
                value=self.tick(120,[b])['receipts']['B'];self.assertEqual(value['totals']['inputTokens'],7)
                self.assertEqual(value['rows'][0]['reason'],reason);self.assertEqual(value['status'],'incomplete' if reason else 'observed')

    def test_old_private_late_flag_is_removed_without_changing_frozen_numbers(self):
        self.f.run['closedAt']=ts(20);self.f.paths['master'].write_bytes(end(10));final=self.tick(621)['receipts']['run1']
        saved=json.loads(self.f.state.read_text());saved['runs']['run1']['people']['master']['issues']=['LATE_REGISTRATION']
        saved['sources']['master']['endThrough']=ts(10);self.f.state.write_text(json.dumps(saved))
        value=self.tick(622)['receipts']['run1'];self.assertEqual(value['totals'],final['totals']);self.assertEqual(value['status'],'observed')
        saved=json.loads(self.f.state.read_text());self.assertEqual(saved['runs']['run1']['people']['master']['issues'],[])
        self.assertNotIn('endThrough',saved['sources']['master']);self.f.module().public_receipt(value,'run1')

    def test_oldest_eviction_has_finite_rows_and_names_affected_participant(self):
        m=self.f.module();self.assertTrue(hasattr(m,'HISTORY_MAX_ROWS'),'history needs an explicit finite bound')
        self.f.paths['master'].write_bytes(end(10)+end(20)+end(30))
        with patch.object(m,'HISTORY_MAX_ROWS',2):result=m.iteration([self.f.run],self.f.sources,self.f.state,ts(100))
        state=json.loads(self.f.state.read_text());self.assertEqual(len(state['ends']),2);self.assertEqual(min(e['ts'] for e in state['ends']),ts(20))
        r=result['receipts']['run1'];self.assertEqual(r['totals']['modelCalls'],2);self.assertEqual(r['status'],'incomplete');self.assertEqual(result['historyDrops'][0]['participant'],'master')
    def test_expired_history_is_removed_but_frozen_record_is_unchanged(self):
        self.f.run['closedAt']=ts(20);self.f.paths['master'].write_bytes(end(10));final=self.tick(621)['receipts']['run1']
        held=self.tick(86409);self.assertEqual(len(json.loads(self.f.state.read_text())['ends']),1,'retention must cover at least24h, not just until freeze')
        result=self.tick(86411);self.assertEqual(result['receipts']['run1'],final);self.assertEqual(json.loads(self.f.state.read_text())['ends'],[])
    def test_identity_is_required_instead_of_inventing_a_dedup_key(self):
        value=json.loads(end(10));value.pop('thread');self.f.paths['master'].write_text(json.dumps(value)+'\n')
        r=self.tick()['receipts']['run1'];self.assertIsNone(r['totals']['modelCalls']);self.assertEqual(r['status'],'incomplete')
    def test_history_byte_limit_is_enforced_and_names_eviction(self):
        m=self.f.module();self.assertTrue(hasattr(m,'HISTORY_MAX_BYTES'))
        self.f.paths['master'].write_bytes(end(10,thread='a'*200)+end(20,thread='b'*200))
        with patch.object(m,'HISTORY_MAX_BYTES',650):result=m.iteration([self.f.run],self.f.sources,self.f.state,ts(100))
        state=json.loads(self.f.state.read_text());self.assertLessEqual(len(json.dumps(state['ends'],sort_keys=True).encode()),650);self.assertTrue(result['historyDrops'])
    def test_recount_is_pure_and_order_independent(self):
        self.f.paths['master'].write_bytes(end(10)+end(20));self.tick()
        state=json.loads(self.f.state.read_text());contexts={r:v['context'] for r,v in state['runs'].items()};events=state['ends'];before=copy.deepcopy((contexts,events));m=self.f.module()
        first=m.recount(contexts,events,m.timestamp(ts(100)));second=m.recount(contexts,list(reversed(events)),m.timestamp(ts(100)))
        self.assertEqual(first,second);self.assertEqual((contexts,events),before);self.assertEqual(first['run1']['people']['master']['rows'],2)

    def test_counter_overflow_is_order_independent_and_keeps_other_metrics(self):
        self.f.paths['master'].write_bytes(end(10,input=9007199254740991,cached=0,cache_write=0)+end(20,cached=0,cache_write=0));self.tick()
        state=json.loads(self.f.state.read_text());contexts={r:v['context'] for r,v in state['runs'].items()};m=self.f.module()
        a=m.recount(contexts,state['ends'],m.timestamp(ts(100)));b=m.recount(contexts,list(reversed(state['ends'])),m.timestamp(ts(100)))
        self.assertEqual(a,b);person=a['run1']['people']['master'];self.assertIsNone(person['totals']['inputTokens']);self.assertEqual(person['totals']['modelCalls'],2);self.assertIn('SOURCE_PARTIAL',person['issues'])

    def test_multiple_evictions_have_bounded_summary_by_participant(self):
        m=self.f.module();self.f.paths['master'].write_bytes(end(10)+end(20)+end(30)+end(40))
        with patch.object(m,'HISTORY_MAX_ROWS',2):result=m.iteration([self.f.run],self.f.sources,self.f.state,ts(100))
        self.assertEqual(len(result['historyDrops']),1);self.assertEqual(result['historyDrops'][0]['count'],2)

    def test_session_creation_separates_reused_session_and_turn_ids(self):
        self.f.run['participants'][0]['engine']='claude';self.f.sources['master']['engine']='claude'
        a=end(10,participant='master',thread='reused',sessionId='reused',turn=1,sessionCreated=1000)
        b=end(20,participant='master',thread='reused',sessionId='reused',turn=1,sessionCreated=2000)
        self.f.paths['master'].write_bytes(a+a+b+b)
        result=self.tick();self.assertEqual(result['receipts']['run1']['totals']['modelCalls'],2)
        saved=json.loads(self.f.state.read_text());self.assertEqual({e['sessionCreated'] for e in saved['ends']},{1000,2000});self.assertEqual(len(saved['ends']),2)
        self.assertEqual(self.tick(101)['receipts']['run1']['totals']['modelCalls'],2)

    def test_codex_missing_creation_is_unknown_not_a_fabricated_timestamp(self):
        self.f.paths['master'].write_bytes(end(10)+end(10));self.tick();saved=json.loads(self.f.state.read_text())
        self.assertIn('sessionCreated',saved['ends'][0]);self.assertIsNone(saved['ends'][0]['sessionCreated']);self.assertEqual(saved['ends'][0]['sessionId'],'ignored')

    def test_old_three_key_history_is_refused_without_reinterpreting_epochs(self):
        value=dict(schemaVersion=2,sources={},runs={},ends=[],lostThrough={},tick=0);raw=json.dumps(value)+'\n';self.f.state.write_text(raw);self.f.state.chmod(0o600)
        with self.assertRaisesRegex(ValueError,'STATE_VERSION_UNSUPPORTED'):self.tick()
        self.assertEqual(self.f.state.read_text(),raw)

    def test_thread_and_session_aliases_deduplicate_the_same_known_epoch(self):
        a=json.loads(end(10,participant='master',thread='session',sessionCreated=1000));b=dict(a);b['sessionId']=b.pop('thread');b['schemaVersion']=1;b['kind']='turn_end'
        self.f.paths['master'].write_text(json.dumps(a)+'\n'+json.dumps(b)+'\n')
        self.assertEqual(self.tick()['receipts']['run1']['totals']['modelCalls'],1)
        self.assertEqual(len(json.loads(self.f.state.read_text())['ends']),1)

    def test_invalid_creation_values_do_not_become_valid_zero_epochs(self):
        for invalid in [True,-1,'1000']:
            with self.subTest(value=invalid):
                self.f.state.unlink(missing_ok=True);self.f.paths['master'].write_bytes(end(10,sessionCreated=invalid))
                r=self.tick()['receipts']['run1'];self.assertIsNone(r['totals']['modelCalls']);self.assertEqual(r['rows'][0]['reason'],'STREAM_GAP')

    def test_old_sum_only_state_is_refused_without_changing_it(self):
        raw=json.dumps(dict(schemaVersion=1,sources={},runs={},tick=0))+'\n';self.f.state.write_text(raw);self.f.state.chmod(0o600)
        with self.assertRaisesRegex(ValueError,'STATE_VERSION_UNSUPPORTED'):self.tick()
        self.assertEqual(self.f.state.read_text(),raw)

if __name__=='__main__':unittest.main()
