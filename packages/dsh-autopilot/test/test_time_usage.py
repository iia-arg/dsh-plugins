"""Owner-approved time-window counters: real files/state, no raw/R/G/Postman."""
from datetime import datetime,timezone,timedelta
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

PKG=Path(__file__).resolve().parents[1]
START=datetime(2026,10,21,tzinfo=timezone.utc)
def ts(seconds):return (START+timedelta(seconds=seconds)).isoformat()
def end(seconds,**changes):
    value=dict(ts=ts(seconds),thread='ignored',turn='turn-'+str(seconds),status='completed',vyzovov=1,input=10,cached=2,cache_write=1,output=3,reasoning=0,polnota='ok')
    value.update(changes);return (json.dumps(value,ensure_ascii=False)+'\n').encode()

class TimeUsage(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.paths={n:self.root/(n+'.jsonl') for n in ['master','vintik']}
        for p in self.paths.values():p.write_bytes(b'');p.chmod(0o600)
        self.state=self.root/'state.json'
        self.sources={n:dict(path=str(p),uid=os.getuid(),engine='codex') for n,p in self.paths.items()}
        self.run=dict(runId='run1',project='/fixture/project',startedAt=ts(0),closedAt=ts(60),participants=[dict(name=n,engine='codex') for n in self.paths])

    def module(self):
        p=PKG/'runtime/time_usage.py'
        self.assertTrue(p.is_file(),'time_usage collector is absent; accepted time-window path must exist')
        spec=importlib.util.spec_from_file_location('time_usage_candidate',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

    def tick(self,seconds=700,runs=None):
        return self.module().iteration(runs or [self.run],self.sources,self.state,ts(seconds))

    def test_two_participants_three_in_window_one_outside_and_repeat(self):
        self.paths['master'].write_bytes(end(10)+end(20))
        self.paths['vintik'].write_bytes(end(30)+end(661))
        first=self.tick();receipt=first['receipts']['run1']
        self.assertEqual(receipt['schemaVersion'],5)
        self.assertEqual(receipt['totals']['modelCalls'],3)
        self.assertEqual(receipt['totals']['inputTokens'],30)
        self.assertEqual(receipt['phase'],'final')
        self.assertEqual(receipt['accuracy'],'approximate')
        second=self.tick(701)
        self.assertEqual(second['receipts']['run1'],receipt,'final is frozen; no late end update')
        self.assertEqual(second['sourceBytes'],0)
        self.assertEqual(second['receipts']['run1']['totals']['modelCalls'],3)
        self.assertEqual(self.state.stat().st_mode&0o777,0o600)

    def test_window_edges_are_inclusive_and_no_rows_are_null(self):
        self.paths['master'].write_bytes(end(0)+end(660)+end(-1)+end(661))
        r=self.tick()['receipts']['run1']
        self.assertEqual(r['totals']['modelCalls'],2)
        row=next(x for x in r['rows'] if x['participant']=='vintik')
        self.assertTrue(all(v is None for v in row['totals'].values()))
        self.assertEqual(row['status'],'incomplete')

    def test_read_quantum_and_partial_line_survive_next_tick(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(b'x\n'*33000+end(10))
        r=self.tick(100)
        self.assertEqual(r['reads']['master']['bytes'],65536)
        self.assertEqual(json.loads(self.state.read_text())['sources']['master']['offset'],65536)
        r=self.tick(101)
        self.assertLessEqual(r['reads']['master']['bytes'],65536)
        self.assertEqual(r['receipts']['run1']['totals']['modelCalls'],1)
        self.assertEqual(self.tick(102)['sourceBytes'],0)
        line=end(40,participant='vintik',note='мастер')
        # Split an actual UTF8 sequence, not just ASCII.
        cut=line.index('мастер'.encode())+1
        with self.paths['vintik'].open('ab') as f:f.write(line[:cut])
        self.tick(103)
        with self.paths['vintik'].open('ab') as f:f.write(line[cut:])
        r=self.tick(104)
        self.assertEqual(r['receipts']['run1']['totals']['modelCalls'],2,'a valid UTF8-split end must survive the checkpoint')

    def test_active_repeat_reads_nothing_and_append_only_adds_new_end(self):
        self.run['closedAt']=None;self.paths['master'].write_bytes(end(10)+end(11))
        first=self.tick(100);self.assertEqual(first['receipts']['run1']['totals']['modelCalls'],2)
        again=self.tick(101);self.assertEqual(again['sourceBytes'],0);self.assertEqual(again['receipts']['run1']['totals']['modelCalls'],2)
        new=end(20)
        with self.paths['master'].open('ab') as f:f.write(new)
        third=self.tick(102);self.assertEqual(third['reads']['master']['bytes'],len(new));self.assertEqual(third['receipts']['run1']['totals']['modelCalls'],3)

    def test_foreign_participant_and_bad_owner_do_not_hide_other_source(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10));self.paths['vintik'].write_bytes(end(20,participant='other'))
        r=self.tick(100)['receipts']['run1'];self.assertEqual(r['totals']['modelCalls'],1)
        self.assertEqual(next(x for x in r['rows'] if x['participant']=='master')['status'],'observed')
        self.sources['vintik']['uid']=os.getuid()+1234
        with self.paths['vintik'].open('ab') as f:f.write(end(30))
        r=self.tick(101)['receipts']['run1'];self.assertEqual(r['totals']['modelCalls'],1)

    def test_malformed_end_time_isolated_from_healthy_source(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10,ts='0001-01-01T00:00:00+01:00'))
        self.paths['vintik'].write_bytes(end(20))
        try: result=self.tick(100)
        except Exception as exc:self.fail('malformed source aborted healthy participant: '+repr(exc))
        rows={r['participant']:r for r in result['receipts']['run1']['rows']}
        self.assertEqual(rows['master']['reason'],'STREAM_GAP')
        self.assertEqual(rows['vintik']['totals']['inputTokens'],10)
        self.assertEqual(rows['vintik']['status'],'observed')
        self.assertEqual(self.tick(101)['sourceBytes'],0,'bad end must still advance durable cursor')

    def test_aggregate_overflow_keeps_known_rows_and_durable_progress(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10,input=9007199254740991,cached=0,cache_write=0))
        self.paths['vintik'].write_bytes(end(20))
        try: result=self.tick(100)
        except Exception as exc:self.fail('aggregate overflow aborted whole tick: '+repr(exc))
        receipt=result['receipts']['run1'];rows={r['participant']:r for r in receipt['rows']}
        self.assertEqual(rows['master']['totals']['inputTokens'],9007199254740991)
        self.assertEqual(rows['vintik']['totals']['inputTokens'],10)
        self.assertIsNone(receipt['totals']['inputTokens'])
        self.assertEqual(receipt['status'],'incomplete')
        self.module().public_receipt(receipt,'run1')
        again=self.tick(101)
        self.assertEqual(again['sourceBytes'],0)
        self.assertEqual(again['receipts']['run1']['totals']['modelCalls'],2)

    def test_claude_parent_only_is_observed_but_missing_usage_or_failed_end_is_partial(self):
        sample=json.loads((PKG/'test/fixtures/claude-turn-end-v1.json').read_text())
        self.run.update(startedAt='2026-10-21T10:59:00Z',closedAt=None,participants=[dict(name='master',engine='claude')])
        self.sources['master']['engine']='claude'
        cases=[
            ('parent_only',{},'observed'),
            ('ok',{'polnota':'ok'},'observed'),
            ('no_notifications',{'polnota':'net_uvedomlenij','input':None,'cached':None,'cache_write':None,'output':None,'vyzovov':None},'incomplete'),
            ('contradiction',{'polnota':'protivorechie'},'incomplete'),
            ('interrupted',{'status':'interrupted'},'incomplete'),
            ('failed',{'status':'failed'},'incomplete'),
            ('unknown_input',{'input':None},'incomplete'),
        ]
        m=self.module()
        for label,changes,status in cases:
            with self.subTest(label=label):
                self.state.unlink(missing_ok=True)
                self.paths['master'].write_bytes((json.dumps(dict(sample,**changes))+'\n').encode())
                result=m.iteration([self.run],self.sources,self.state,'2026-10-21T11:05:00Z')
                receipt=result['receipts']['run1'];row=receipt['rows'][0]
                self.assertEqual(row['status'],status)
                self.assertEqual(receipt['status'],status)
                self.assertEqual(row['reason'],None if status=='observed' else 'SOURCE_PARTIAL')
                self.assertEqual(receipt['accuracy'],'approximate')
                self.assertIsNone(row['ofWhichSubagents'])
                if status=='observed':
                    self.assertEqual(row['totals'],dict(modelCalls=2,inputTokens=1150,uncachedInputTokens=1000,outputTokens=200,cacheReadTokens=100,cacheWriteTokens=50))
                if label=='unknown_input':self.assertIsNone(row['totals']['inputTokens']);self.assertIsNone(row['totals']['uncachedInputTokens'])
                if label=='no_notifications':self.assertTrue(all(v is None for v in row['totals'].values()))
                m.public_receipt(receipt,'run1')
                again=m.iteration([self.run],self.sources,self.state,'2026-10-21T11:06:00Z')
                self.assertEqual(again['sourceBytes'],0)
                self.assertEqual(again['receipts']['run1']['totals'],receipt['totals'])

    def test_missing_stream_before_first_end_recovers_without_permanent_gap(self):
        self.run['closedAt']=None;self.paths['master'].unlink()
        first=self.tick(100)['receipts']['run1'];master=next(r for r in first['rows'] if r['participant']=='master')
        self.assertIsNone(master['totals']['inputTokens'])
        self.paths['master'].write_bytes(end(10));self.paths['master'].chmod(0o600)
        second=self.tick(101)['receipts']['run1'];master=next(r for r in second['rows'] if r['participant']=='master')
        self.assertEqual(master['status'],'observed');self.assertEqual(master['totals']['inputTokens'],10)
        self.paths['master'].unlink();third=self.tick(102)['receipts']['run1'];master=next(r for r in third['rows'] if r['participant']=='master')
        self.assertEqual(master['status'],'incomplete');self.assertEqual(master['reason'],'STREAM_GAP')

    def test_deadline_rotation_commits_progress_without_starving_second_source(self):
        from unittest.mock import patch
        m=self.module();self.run['closedAt']=None
        for p in self.paths.values():p.write_bytes(end(10))
        moment=[0];pread=m.os.pread
        def costly(fd,size,offset):
            value=pread(fd,size,offset);moment[0]+=60;return value
        for i in range(2):
            moment[0]=0
            with patch.object(m.os,'pread',side_effect=costly):
                try:result=m.iteration([self.run],self.sources,self.state,ts(100+i),deadline=60,clock=lambda:moment[0])
                except TypeError as exc:self.fail('no bounded tail iteration API: '+str(exc))
            self.assertEqual(sum(r['bytes']>0 for r in result['reads'].values()),1)
        self.assertEqual(result['receipts']['run1']['totals']['modelCalls'],2)
        self.assertEqual(json.loads(self.state.read_text()).get('tick'),2)

    def test_end_after_snapshot_cut_is_deferred_without_loss_or_gap(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10)+end(110))
        first=self.tick(100)['receipts']['run1'];self.assertEqual(first['totals']['modelCalls'],1)
        checkpoint=json.loads(self.state.read_text())['sources']['master']['offset']
        self.assertEqual(checkpoint,len(end(10)),'future end must not be durably consumed')
        second=self.tick(111)['receipts']['run1'];master=next(r for r in second['rows'] if r['participant']=='master')
        self.assertEqual(master['totals']['modelCalls'],2);self.assertEqual(master['status'],'observed')
        self.assertEqual(self.tick(112)['sourceBytes'],0)

    def test_deferred_future_end_after_partial_and_discard_preserves_byte_position(self):
        self.run['closedAt']=None
        line=end(110,note='мастер');cut=line.index('мастер'.encode())+1
        self.paths['master'].write_bytes(b'x'*5000+b'\n'+line[:cut]);self.tick(100)
        with self.paths['master'].open('ab') as f:f.write(line[cut:]+end(120))
        self.tick(101)
        self.assertEqual(json.loads(self.state.read_text())['sources']['master']['offset'],5001)
        result=self.tick(121)['receipts']['run1']
        self.assertEqual(result['totals']['modelCalls'],2,'both ready ends must survive deferred checkpoint')

    def test_source_engine_must_match_roster(self):
        self.run['closedAt']=None;self.paths['master'].write_bytes(end(10));self.sources['master']['engine']='claude'
        r=self.tick(100)['receipts']['run1'];self.assertIsNone(r['totals']['modelCalls']);self.assertEqual(r['status'],'incomplete')

    def test_state_size_is_refused_before_reading_full_content(self):
        from unittest.mock import patch
        m=self.module()
        self.assertTrue(hasattr(m,'STATE_LIMIT_BYTES'),'state reader needs a finite size bound')
        with self.state.open('wb') as f:f.truncate(m.STATE_LIMIT_BYTES+1)
        self.state.chmod(0o600)
        with patch.object(m.os,'fdopen',side_effect=AssertionError('oversize state reached content read')):
            with self.assertRaisesRegex(ValueError,'STATE_TOO_LARGE'):m.load_state(self.state)

    def test_rotation_and_truncate_reset_cursor_with_incompleteness(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10)+end(11));self.tick(100)
        new=self.root/'new';new.write_bytes(end(20));new.chmod(0o600);os.replace(new,self.paths['master'])
        r=self.tick(101)['receipts']['run1'];row=next(x for x in r['rows'] if x['participant']=='master')
        self.assertEqual(r['totals']['modelCalls'],3);self.assertEqual(row['status'],'incomplete')
        self.paths['master'].write_bytes(b'')
        self.tick(102)
        self.assertEqual(json.loads(self.state.read_text())['sources']['master']['offset'],0)

    def test_two_simultaneously_open_runs_get_no_shared_end(self):
        self.run['closedAt']=None
        other=dict(self.run,runId='run2',project='/other',startedAt=ts(5))
        self.paths['master'].write_bytes(end(10))
        r=self.tick(100,[self.run,other])
        for receipt in r['receipts'].values():
            self.assertIsNone(receipt['totals']['modelCalls'])
            row=next(x for x in receipt['rows'] if x['participant']=='master')
            self.assertEqual(row['reason'],'OVERLAPPING_RUNS')

    def test_without_finish_expires_at_policy_limit_using_last_counted_end(self):
        self.run['closedAt']=None
        self.paths['master'].write_bytes(end(10))
        live=self.tick(100)['receipts']['run1'];self.assertIsNone(live['closedAt'])
        with self.paths['master'].open('ab') as f:f.write(end(7201))
        result=self.tick(7202)['receipts']['run1']
        self.assertEqual(result['closedAt'],ts(10))
        self.assertEqual(result['phase'],'final')
        self.assertEqual(result['totals']['modelCalls'],1)
        self.assertEqual(result.get('closureReason'),'finish_missing_timeout')
        self.assertIn('закрыт по сроку',result['notice'].lower())
        self.module().public_receipt(result,'run1')
        self.run['closedAt']=ts(7300)
        self.assertEqual(self.tick(7400)['receipts']['run1'],result,'late finish must not rewrite timeout final')

    def test_finish_after_deadline_cannot_bypass_timeout_on_first_late_tick(self):
        self.run['closedAt']=ts(7300)
        self.paths['master'].write_bytes(end(7100)+end(7250))
        result=self.tick(7400)['receipts']['run1']
        self.assertEqual(result.get('closureReason'),'finish_missing_timeout')
        self.assertEqual(result['closedAt'],ts(7100))
        # History is now recomputed over the fixed close+grace window. The
        # retained end7250 is inside7100+600; the invalid finish still cannot
        # move closedAt to7300 or reopen the timeout result.
        self.assertEqual(result['totals']['modelCalls'],2)
        self.module().public_receipt(result,'run1')

    def test_timeout_without_ends_closes_at_start_and_keeps_nulls(self):
        self.run['closedAt']=None
        result=self.tick(7201)['receipts']['run1']
        self.assertEqual(result['closedAt'],ts(0))
        self.assertEqual(result.get('closureReason'),'finish_missing_timeout')
        self.assertEqual(result['phase'],'final')
        self.assertTrue(all(v is None for v in result['totals'].values()))
        self.module().public_receipt(result,'run1')

    def test_grace_is_preliminary_then_final_and_late_end_is_ignored(self):
        self.paths['master'].write_bytes(end(70))
        first=self.tick(659)['receipts']['run1'];self.assertEqual(first['phase'],'live')
        final=self.tick(661)['receipts']['run1'];self.assertEqual(final['phase'],'final')
        with self.paths['master'].open('ab') as f:f.write(end(80))
        self.assertEqual(self.tick(662)['receipts']['run1'],final)

if __name__=='__main__':unittest.main()
