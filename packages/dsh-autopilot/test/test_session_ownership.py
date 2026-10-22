"""Whole native turns, expiry and conflicts in the real A+B selector."""
import copy
import importlib.util
from pathlib import Path
import unittest

PACKAGE=Path(__file__).resolve().parents[1]
def module():
    path=PACKAGE/'runtime/session_ownership.py'
    if not path.exists():raise AssertionError('A+B ownership selector is missing')
    spec=importlib.util.spec_from_file_location('session_ownership_test',path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def turn(number,start,end,claims=(),session='s'):
    return dict(sessionId=session,sessionCreated=42,turn=number,turnStartedAt=start,finishedAt=end,
                claims=[dict(deliveryId=d,claimedAt=t) for d,t in claims])

class Intervals(unittest.TestCase):
    def fixture(self):
        runs=[dict(runId='r1',registeredAt=0,finishedAt=None,uid=101,participant='worker',operator=None)]
        deliveries={'d1':dict(kind='task',runId='r1',recipient='worker',jobId='j1',createdAt=100,deadline=10000,resultAt=8000)}
        turns=[turn(1,900,2000,[('d1',1000)]),turn(2,3000,4000),turn(3,7000,9000),turn(4,9001,9500),turn(5,3000,4000,session='a2a')]
        return runs,deliveries,turns
    def select(self,m,runs,d,turns,cut=12000):return m.select(runs,d,turns,101,'worker',cut)
    def test_claim_continuation_whole_result_and_other_session(self):
        m=module();r,d,t=self.fixture();result=self.select(m,r,d,t)
        self.assertEqual(set(result['turns']['r1']),{('s',42,1),('s',42,2),('s',42,3)})
        self.assertEqual(result['issues']['r1'],[])
    def test_conflicting_run_then_exact_return_recalculates(self):
        m=module();r,d,t=self.fixture();old=copy.deepcopy((r,d,t));self.assertFalse(self.select(m,r,d,t)['issues']['r1'])
        r.append(dict(r[0],runId='r2'));d['d2']=dict(d['d1'],runId='r2',jobId='j2');t[0]['claims'].append(dict(deliveryId='d2',claimedAt=1100))
        result=self.select(m,r,d,t);self.assertIn('MIXED_RUN_TURN',result['issues']['r1']);self.assertIn('MIXED_RUN_TURN',result['issues']['r2'])
        self.assertFalse(self.select(m,*old)['issues']['r1'])
    def test_closed_first_run_is_unchanged_and_only_second_gets_turn_reference(self):
        m=module();r,d,t=self.fixture();r[0]['phase']='CLOSED';first=self.select(m,r,d,t)
        r.append(dict(r[0],runId='r2',phase='OPEN'));d['d2']=dict(d['d1'],runId='r2',jobId='j2');t[0]['claims'].append(dict(deliveryId='d2',claimedAt=1100))
        result=self.select(m,r,d,t)
        self.assertEqual(result['issues']['r1'],first['issues']['r1']);self.assertEqual(result['turns']['r1'],first['turns']['r1'])
        self.assertIn('MIXED_RUN_TURN',result['issues']['r2'])
        self.assertEqual(result.get('conflicts',{}).get('r2'),[dict(relatedRunId='r1',sessionKey=[101,'s',42],dshTurn=1),dict(relatedRunId='r1',sessionKey=[101,'s',42],dshTurn=2),dict(relatedRunId='r1',sessionKey=[101,'s',42],dshTurn=3)])
        d.pop('d2');t[0]['claims'].pop();restored=self.select(m,r,d,t)
        self.assertEqual(restored['issues']['r1'],first['issues']['r1']);self.assertNotIn('MIXED_RUN_TURN',restored['issues']['r2'])

    def test_nonoverlapping_clock_intervals_inside_same_turn_conflict(self):
        m=module();r,d,t=self.fixture();d['d1']['resultAt']=1100
        r.append(dict(r[0],runId='r2'));d['d2']=dict(d['d1'],runId='r2',jobId='j2',createdAt=1200,resultAt=1800)
        t[0]['claims'].append(dict(deliveryId='d2',claimedAt=1300))
        self.assertIn('MIXED_RUN_TURN',self.select(m,r,d,t)['issues']['r1'])
    def test_two_jobs_same_run_are_one_turn_with_provenance(self):
        m=module();r,d,t=self.fixture();d['d2']=dict(d['d1'],jobId='j2');t[0]['claims'].append(dict(deliveryId='d2',claimedAt=1100))
        result=self.select(m,r,d,t);self.assertEqual(result['issues']['r1'],[])
        self.assertEqual(result['turns']['r1'][('s',42,1)]['jobRefs'],['j1','j2'])
    def test_second_job_after_5400_seconds_is_included(self):
        m=module();r,d,t=self.fixture();d['d2']=dict(d['d1'],jobId='j2',createdAt=5400000,deadline=12600000,resultAt=10000000)
        t.append(turn(6,9000000,10000100,[('d2',9000100)]))
        self.assertIn(('s',42,6),self.select(m,r,d,t,11000000)['turns']['r1'])
    def test_expiry_is_final_even_after_late_authenticated_task(self):
        m=module();r,d,t=self.fixture();d['d1']['resultAt']=None;d['d1'].update(createdAt=1000,deadline=7201000)
        d['late']=dict(d['d1'],jobId='late',createdAt=8000000,deadline=10000000)
        t.append(turn(6,8000000,8001000,[('late',8000100)]))
        result=m.select(r,d,t,101,'worker',8100000,authenticated_events=[dict(runId='r1',deliveryId='late',recipient='worker',claimedAt=8000100,corroborated=False)])
        self.assertIn('RUN_WINDOW_EXPIRED',result['issues']['r1']);self.assertNotIn(('s',42,6),result['turns']['r1'])
    def test_run_horizon_uses_other_participant_postman_and_verified_claim_events(self):
        m=module();r,d,t=self.fixture();r[0].update(participant='master',operator=dict(sessionId='s',sessionCreated=42,turn=1,jobId='operator'))
        d['other']=dict(kind='task',runId='r1',recipient='worker',jobId='second',createdAt=5400000,deadline=12600000,resultAt=None)
        t.append(turn(8,9000000,9001000))
        result=m.select(r,d,t,101,'master',9002000)
        self.assertIn(('s',42,8),result['turns']['r1']);self.assertEqual(result['issues']['r1'],[])
        late=turn(9,15000000,15001000);t.append(late)
        event=dict(runId='r1',deliveryId='other',uid=102,recipient='worker',sessionId='w',sessionCreated=1,turn=2,claimedAt=11000000)
        result=m.select(r,d,t,101,'master',15002000,authenticated_events=[event])
        self.assertIn(('s',42,9),result['turns']['r1']);self.assertEqual(result['issues']['r1'],[])
        local=turn(10,11000000,11001000,[('other',11000001)])
        t.append(local)
        without=m.select(r,d,t,101,'master',15002000,authenticated_events=[])
        self.assertIn('RUN_WINDOW_EXPIRED',without['issues']['r1'])
        event['claimedAt']=13000000
        result=m.select(r,d,t,101,'master',15002000,authenticated_events=[event])
        self.assertIn('RUN_WINDOW_EXPIRED',result['issues']['r1']);self.assertNotIn(('s',42,9),result['turns']['r1'])

    def test_hard_ceiling_cannot_be_extended(self):
        m=module();r,d,t=self.fixture();d={};t=[]
        for i,at in enumerate(range(100,86400100,6000000)):
            key='d'+str(i);d[key]=dict(kind='task',runId='r1',recipient='worker',jobId=key,createdAt=at,deadline=at+7200000,resultAt=None)
            t.append(turn(i+1,at,at+100,[(key,at)]))
        result=self.select(m,r,d,t,87000000);self.assertIn('RUN_HARD_CEILING',result['issues']['r1'])
    def test_unclaimed_task_pending_then_incomplete_never_empty_measured(self):
        m=module();r,d,t=self.fixture();t=[]
        self.assertIn('TASK_CLAIM_PENDING',self.select(m,r,d,t,5000)['issues']['r1'])
        self.assertIn('TASK_UNCLAIMED',self.select(m,r,d,t,12000)['issues']['r1'])
    def test_delivered_task_without_deadline_refuses(self):
        m=module();r,d,t=self.fixture();del d['d1']['deadline']
        self.assertIn('TASK_DEADLINE_REQUIRED',self.select(m,r,d,t)['issues']['r1'])
    def test_operator_registration_turn_continuations_and_finish(self):
        m=module();r,d,t=self.fixture();r[0].update(participant='master',operator=dict(sessionId='s',sessionCreated=42,turn=1,jobId='operator'),registeredAt=1500,finishedAt=3500)
        result=m.select(r,{},t,101,'master',12000)
        self.assertEqual(set(result['turns']['r1']),{('s',42,1),('s',42,2)})
    def test_roster_without_task_pending_then_empty_after_run_end(self):
        m=module();r,d,t=self.fixture();r[0]['finishedAt']=12000
        before=self.select(m,r,{},t,11000)
        self.assertEqual(before['issues']['r1'],['NO_TASK_IN_RUN'])
        after=self.select(m,r,{},t,12000)
        self.assertEqual(after['issues']['r1'],[]);self.assertEqual(after['turns']['r1'],{})
        assigned=self.select(m,r,d,t,12000)
        self.assertEqual(assigned['issues']['r1'],[])
        self.assertEqual(set(assigned['turns']['r1']),{('s',42,1),('s',42,2),('s',42,3)})

    def test_unproven_peer_horizon_only_blocks_an_overlapping_whole_turn(self):
        m=module();r,d,t=self.fixture();r.append(dict(r[0],runId='old',horizonUnproven=True));d['old']=dict(d['d1'],runId='old',jobId='old-job')
        self.assertEqual(self.select(m,r,d,t)['issues']['r1'],[])
        t[0]['claims'].append(dict(deliveryId='old',claimedAt=1100))
        self.assertIn('RUN_OWNERSHIP_CONTEXT_UNAVAILABLE',self.select(m,r,d,t)['issues']['r1'])
    def test_rotation_does_not_transfer_ownership(self):
        m=module();r,d,t=self.fixture();d['d2']=dict(d['d1'],jobId='j2');t.append(turn(7,5000,6000,[('d2',5100)],session='rotated'))
        self.assertIn('RUN_SESSION_CONTINUITY_LOST',self.select(m,r,d,t)['issues']['r1'])

if __name__=='__main__':unittest.main(verbosity=2)
