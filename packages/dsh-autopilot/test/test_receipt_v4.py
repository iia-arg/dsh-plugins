"""One public v4: end semantics, conservative partials and private conflict refs."""
import copy,json,unittest,subprocess
import test_team_usage as fixture
class Schema4Tests(unittest.TestCase):
 def setUp(self):
  self.c=fixture.TeamUsage();self.c.setUp();self.addCleanup(self.c.doCleanups);self.c.record.update(ownershipPolicy='session-interval',ownershipRuleVersion=3)
 def test_writer_v4_live_and_exact_ownership(self):
  r=self.c.collect()['receipt'];self.assertEqual(r['schemaVersion'],4);self.assertEqual((r['phase'],r['windowEnd'],r['endReason'],r['operatorActions']),('live',None,None,[]));self.assertEqual(r['ownershipRuleVersion'],3);fixture.load().public_receipt(r,'run1')
 def test_final_context_retains_numbers_and_validates_end(self):
  self.c.record['runtimeReceiptContext']=dict(phase='final',windowEnd=fixture.END,endReason='AP_FINISH',operatorActions=[])
  r=self.c.collect()['receipt'];self.assertEqual((r['phase'],r['endReason'],r['totals']['inputTokens']),('final','AP_FINISH',100));m=fixture.load();m.public_receipt(r,'run1')
  healthy=copy.deepcopy(r);r['windowEnd']=None
  with self.assertRaises(m.Incomplete):m.public_receipt(r,'run1')
  m.public_receipt(healthy,'run1')
 def test_witness_only_partial_preserves_parent_numbers(self):
  self.c.g[0].update(childIncomplete=True,childDiagnostics=['CHILD_VERSION_WITNESS_UNAVAILABLE']);self.c.write();r=self.c.collect()['receipt']
  self.assertEqual(r['rows'][0]['reason'],'CHILD_VERSION_WITNESS_UNAVAILABLE');self.assertEqual(r['totals']['inputTokens'],100);fixture.load().public_receipt(r,'run1')
 def test_mixed_diagnostics_remain_general_child_incomplete(self):
  self.c.g[0].update(childIncomplete=True,childDiagnostics=['CHILD_VERSION_WITNESS_UNAVAILABLE','CHILD_LINK_UNPROVEN']);self.c.write();self.assertEqual(self.c.collect()['receipt']['rows'][0]['reason'],'CHILD_INCOMPLETE')
 def test_conflict_reference_published_without_session_identity(self):
  self.c.record.update(runtimeConflictPhases={'first-run':'CLOSED'},runtimeInformational=True,runtimePreparationErrors={'master':'MIXED_RUN_TURN'},runtimeOwnershipConflicts={'master':[dict(relatedRunId='first-run',sessionKey=[self.c.participant['uid'],'ap-session',42],dshTurn=7)]})
  r=self.c.collect()['receipt'];self.assertEqual(r['missing'][0]['relatedRunId'],'first-run');text=json.dumps(r);self.assertNotIn('sessionKey',text);self.assertNotIn('dshTurn',text);fixture.load().public_receipt(r,'run1')
 def test_unknown_phase_refuses(self):
  self.c.record['runtimeReceiptContext']=dict(phase='invented',windowEnd=None,endReason=None,operatorActions=[])
  m=fixture.load()
  with self.assertRaises(m.Incomplete):m.collect_record(self.c.record,fixture.CUT,{},drop_identity=False)

 def test_actual_renderer_final_is_not_live_or_stale(self):
  self.c.record['runtimeReceiptContext']=dict(phase='final',windowEnd=fixture.END,endReason='AP_FINISH',operatorActions=[])
  r=self.c.collect()['receipt'];text=(fixture.PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/')
  page=self.c.root/'page.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=r))+';/*STATE-END*/'+after)
  out=subprocess.check_output(['node',str(fixture.PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],text=True);value=json.loads(out);self.assertEqual(value['errors'],[]);self.assertIn('Итоговый снимок',value['html']);self.assertNotIn('прогон идёт; по закрытым ходам',value['html']);self.assertNotIn('Снимок устарел',value['html'])

 def test_window_formatter_guard_accepts_actual_v4_template(self):
  release=self.c.root/'release';target=release/'skill/phases';target.mkdir(parents=True);(target/'dashboard-template.html').write_bytes((fixture.PACKAGE/'overlay/phases/dashboard-template.html').read_bytes())
  r=subprocess.run(['python3','-I','-B',str(fixture.PACKAGE/'window/receipt/check-format.py'),str(release)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stdout+r.stderr)

 def test_numeric_v4_requires_all_three_ownership_fields(self):
  r=self.c.collect()['receipt'];m=fixture.load()
  for key in ('ownershipPolicy','ownershipRuleVersion','ownershipNotice'):
   bad=copy.deepcopy(r);bad.pop(key)
   with self.assertRaises(m.Incomplete):m.public_receipt(bad,'run1')
  bad=copy.deepcopy(r)
  for key in ('ownershipPolicy','ownershipRuleVersion','ownershipNotice'):bad.pop(key)
  with self.assertRaises(m.Incomplete):m.public_receipt(bad,'run1')
  m.public_receipt(r,'run1')
 def test_unregistered_writer_emits_named_null_not_legacy_numbers(self):
  self.c.record.pop('ownershipPolicy');self.c.record.pop('ownershipRuleVersion');r=self.c.collect()['receipt']
  self.assertEqual(r['missing'],[dict(participant='master',reason='LEGACY_UNREGISTERED_RUN')]);self.assertTrue(all(x is None for x in r['totals'].values()));fixture.load().public_receipt(r,'run1')
 def test_renderer_refuses_numeric_v4_without_ownership_then_returns(self):
  r=self.c.collect()['receipt'];template=(fixture.PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=template.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/');page=self.c.root/'numeric.html'
  def render(value):
   page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=value))+';/*STATE-END*/'+after)
   out=subprocess.check_output(['node',str(fixture.PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],text=True);data=json.loads(out);self.assertEqual(data['errors'],[]);return data['html']
  self.assertIn('session',json.dumps(r));healthy=render(r);self.assertIn('включает непомеченную работу',healthy)
  bad=copy.deepcopy(r)
  for key in ('ownershipPolicy','ownershipRuleVersion','ownershipNotice'):bad.pop(key)
  self.assertNotIn('usage-table',render(bad));self.assertIn('политика',render(bad));self.assertEqual(render(r),healthy)
 def test_window_judge_refuses_numeric_receipt_without_ownership(self):
  import importlib.util
  path=fixture.PACKAGE/'window/receipt/judge-receipt.py';spec=importlib.util.spec_from_file_location('judge_v4',path);judge=importlib.util.module_from_spec(spec);spec.loader.exec_module(judge)
  r=self.c.collect()['receipt'];project=self.c.record['project'];judge.inspect(r,'run1',project,'codex-3',{})
  bad=copy.deepcopy(r)
  for key in ('ownershipPolicy','ownershipRuleVersion','ownershipNotice'):bad.pop(key)
  with self.assertRaisesRegex(ValueError,'OWNERSHIP'):judge.inspect(bad,'run1',project,'codex-3',{})
  judge.inspect(r,'run1',project,'codex-3',{})

 def test_primary_prefers_frozen_closed_then_lexmin_open(self):
  m=fixture.load();p=self.c.participant;refs=[dict(relatedRunId=rid,sessionKey=[p['uid'],'s',42],dshTurn=7) for rid in ('a_open','z_closed')]
  r=dict(self.c.record,runtimeOwnershipConflicts={'master':refs},runtimeConflictPhases={'a_open':'OPEN','z_closed':'CLOSED'})
  self.assertEqual(m.conflict_reference(r,p),'z_closed')
  r['runtimeConflictPhases']['z_closed']='OPEN';self.assertEqual(m.conflict_reference(r,p),'a_open')
  r['runtimeConflictPhases']['z_closed']='CLOSED';self.assertEqual(m.conflict_reference(r,p),'z_closed')

 def test_final_source_failure_projects_numbers_and_reason_to_actual_renderer(self):
  import importlib.util
  value=self.c.collect()['receipt'];value.update(phase='final',windowEnd=fixture.END,endReason='AP_FINISH',status='incomplete')
  value['missing']=[dict(participant='master',reason='RUN_STATE_UNAVAILABLE')];value['coverage']['codex']['missing']=['master'];value['rows'][0].update(status='incomplete',reason='RUN_STATE_UNAVAILABLE')
  m=fixture.load();accepted=m.public_receipt(value,'run1');path=fixture.PACKAGE/'runtime/ap_sadik.py';spec=importlib.util.spec_from_file_location('ap_project_final',path);ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
  projected=ap.public_value(accepted,ap.PUBLIC_TEAM_RECEIPT);self.assertEqual(projected['totals']['inputTokens'],100)
  text=(fixture.PACKAGE/'overlay/phases/dashboard-template.html').read_text();before,tail=text.split('/*STATE-BEGIN*/');_,after=tail.split('/*STATE-END*/');page=self.c.root/'source-final.html';page.write_text(before+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=projected))+';/*STATE-END*/'+after)
  result=json.loads(subprocess.check_output(['node',str(fixture.PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],text=True));self.assertEqual(result['errors'],[])
  for text in ('Итоговый снимок','RUN_STATE_UNAVAILABLE','100'):self.assertIn(text,result['html'])
  value.update(phase='live',windowEnd=None,endReason=None)
  with self.assertRaises(m.Incomplete):m.public_receipt(value,'run1')


import re
PACKAGE=fixture.PACKAGE
ZERO=dict(modelCalls=0,inputTokens=0,uncachedInputTokens=0,outputTokens=0,cacheReadTokens=0,cacheWriteTokens=0)
class NoTaskSchema4Tests(unittest.TestCase):
 def setUp(self):
  self.c=fixture.TeamUsage();self.c.setUp();self.addCleanup(self.c.doCleanups);self.c.participant['name']='vintik';self.m=fixture.load()
 def empty_receipt(self):
  value=self.c.collect()['receipt'];value.update(pending=0,status='observed',missing=[],totals=copy.deepcopy(ZERO),byEngine={'codex':copy.deepcopy(ZERO),'claude':dict.fromkeys(ZERO,None)},bySubscription={});value['rows'][0].update(status='observed',reason='NO_TASK_IN_RUN',subscription=None,totals=copy.deepcopy(ZERO),ofWhichSubagents=copy.deepcopy(ZERO));value['rows'][0].pop('subscriptionSource',None);return value
 def test_billed_control_is_observed100(self):
  value=self.c.collect()['receipt'];self.m.public_receipt(value,'run1');self.assertEqual(value['totals']['inputTokens'],100)
 def test_final_source_failure_keeps_proven_empty_row_but_live_rejects_it(self):
  value=self.empty_receipt();value.update(phase='final',windowEnd=value['asOf'],endReason='AP_FINISH',status='incomplete')
  value['missing']=[dict(participant='vintik',reason='RUN_STATE_UNAVAILABLE')];value['coverage']['codex']['missing']=['vintik'];value['rows'][0].update(status='incomplete',reason='RUN_STATE_UNAVAILABLE')
  accepted=self.m.public_receipt(value,'run1');self.assertEqual(accepted['totals'],ZERO);self.assertIsNone(accepted['rows'][0]['subscription'])
  value.update(phase='live',windowEnd=None,endReason=None)
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_final_snapshot_does_not_relax_billing_verdicts(self):
  value=self.empty_receipt();value.update(phase='final',windowEnd=value['asOf'],endReason='AP_FINISH',status='incomplete');value['coverage']['codex']['missing']=['vintik']
  for reason in ('RAW_REPLAY_PENDING','LEGACY_UNREGISTERED_RUN','NO_TASK_IN_RUN'):
   value['missing']=[dict(participant='vintik',reason=reason)];value['rows'][0].update(status='incomplete',reason=reason)
   with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_public_no_task_zero_accepts_without_fake_subscription(self):
  try:value=self.m.public_receipt(self.empty_receipt(),'run1')
  except self.m.Incomplete as error:self.fail('healthy no-task row refused: '+str(error))
  self.assertEqual(value['rows'][0]['reason'],'NO_TASK_IN_RUN');self.assertEqual(value['bySubscription'],{})
 def test_nonzero_no_task_refuses(self):
  value=self.empty_receipt();value['rows'][0]['totals']['outputTokens']=1
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_zero_no_task_requires_all_ownership_fields(self):
  value=self.empty_receipt();value.pop('ownershipRuleVersion')
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_master_cannot_be_declared_no_task(self):
  value=self.empty_receipt();value['rows'][0]['participant']='master';value['coverage']['codex'].update(expected=['master'],measured=['master'])
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_before_end_no_task_is_pending1_null(self):
  self.c.record.update(runtimeInformational=True,runtimePreparationErrors={'vintik':'NO_TASK_IN_RUN'});value=self.c.collect()['receipt'];self.assertEqual(value['rows'][0]['status'],'incomplete');self.assertTrue(all(v is None for v in value['totals'].values()));self.assertEqual(value['pending'],1)
 def test_after_end_trusted_no_task_scope_is_zero(self):
  # Explicit synthetic trusted prepared precondition, not an assertion that absence is proven here.
  self.c.participant['jobs']=[];self.c.record.update(runtimeInformational=True,_jobsetVerified=True,runtimeNoTaskInRun=['vintik']);value=self.c.collect()['receipt'];self.assertEqual(len(value['rows']),1,'explicit no-task row missing');row=value['rows'][0];self.assertEqual((row['status'],row['reason'],row['subscription']),('observed','NO_TASK_IN_RUN',None));self.assertEqual(row['totals'],ZERO);self.assertEqual(row['ofWhichSubagents'],ZERO)
 def test_delivered_without_claim_is_not_zero(self):
  self.c.r=[dict(kind='watermark',at=fixture.CUT)];self.c.write();value=self.c.collect()['receipt'];self.assertEqual(value['status'],'incomplete');self.assertTrue(all(v is None for v in value['totals'].values()));self.assertNotEqual(value['rows'][0]['reason'],'NO_TASK_IN_RUN')
 def test_actual_renderer_explains_no_task_zero(self):
  value=self.empty_receipt();text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();prefix,tail=text.split('/*STATE-BEGIN*/');_,suffix=tail.split('/*STATE-END*/');page=self.c.root/'empty.html';page.write_text(prefix+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=value))+';/*STATE-END*/'+suffix);r=subprocess.run(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],capture_output=True,text=True,check=True);v=json.loads(r.stdout);self.assertEqual(v['errors'],[]);self.assertTrue(re.search(r'NO_TASK_IN_RUN|[Зз]адач[^<]*RUN[^<]*не было',v['html']),'explicit no-task explanation missing')

 def test_duplicate_zero_with_positive_row_refuses(self):
  value=self.empty_receipt();positive=self.c.collect()['receipt'];value['rows'].append(positive['rows'][0]);value.update(totals=positive['totals'],byEngine=positive['byEngine'],bySubscription=positive['bySubscription'])
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_nonzero_no_task_with_consistent_aggregates_refuses(self):
  value=self.empty_receipt();data=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=100,outputTokens=5,cacheReadTokens=0,cacheWriteTokens=0);value['rows'][0]['totals']=copy.deepcopy(data);value['totals']=copy.deepcopy(data);value['byEngine']['codex']=copy.deepcopy(data)
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
 def test_private_no_task_marker_cannot_hide_a_job(self):
  self.c.record.update(runtimeInformational=True,_jobsetVerified=True,runtimeNoTaskInRun=['vintik'])
  with self.assertRaisesRegex(self.m.Incomplete,'RUN_RECORD_INVALID'):self.m.collect_record(self.c.record,fixture.CUT,{},drop_identity=False)
 def test_private_no_task_marker_requires_verified_jobset(self):
  self.c.participant['jobs']=[];self.c.record.update(runtimeInformational=True,runtimeNoTaskInRun=['vintik'])
  with self.assertRaisesRegex(self.m.Incomplete,'RUN_RECORD_INVALID'):self.m.collect_record(self.c.record,fixture.CUT,{},drop_identity=False)
 def test_public_projection_preserves_no_task_shape(self):
  import importlib.util
  spec=importlib.util.spec_from_file_location('no_task_projection',PACKAGE/'runtime/ap_sadik.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);value=self.empty_receipt();projected=m.public_value(value,m.PUBLIC_TEAM_RECEIPT);self.assertEqual(projected['rows'][0]['reason'],'NO_TASK_IN_RUN');self.assertEqual(projected['bySubscription'],{});self.m.public_receipt(projected,'run1')

 def test_no_task_zero_and_billed_master_sum_without_fake_slot(self):
  value=self.empty_receipt();positive=self.c.collect()['receipt'];row=copy.deepcopy(positive['rows'][0]);row['participant']='master';value['rows'].append(row);value['coverage']['codex'].update(expected=['master','vintik'],measured=['master','vintik']);value.update(totals=positive['totals'],byEngine=positive['byEngine'],bySubscription=positive['bySubscription'])
  self.m.public_receipt(value,'run1');self.assertEqual(value['totals']['inputTokens'],100);self.assertEqual(set(value['bySubscription']),{'codex-3'})

 def test_pending_no_task_does_not_claim_whole_run_absence(self):
  self.c.participant['jobs']=[];self.c.record.update(runtimeInformational=True,runtimePreparationErrors={'vintik':'NO_TASK_IN_RUN'});value=self.c.collect()['receipt'];self.m.public_receipt(value,'run1')
  text=(PACKAGE/'overlay/phases/dashboard-template.html').read_text();prefix,tail=text.split('/*STATE-BEGIN*/');_,suffix=tail.split('/*STATE-END*/');page=self.c.root/'pending.html';page.write_text(prefix+'/*STATE-BEGIN*/window.STATE='+json.dumps(dict(title='fixture',usageTeam=value))+';/*STATE-END*/'+suffix);v=json.loads(subprocess.check_output(['node',str(PACKAGE/'test/render-dashboard.cjs'),str(page),'ru'],text=True))
  self.assertEqual(v['errors'],[]);self.assertTrue('Задач в этом RUN не было' not in v['html'],'pending falsely claims whole-run absence');self.assertTrue('Ожидают подтверждения: 1' in v['html'])
 def test_historical_v3_does_not_accept_new_empty_reason(self):
  value=self.empty_receipt();value['schemaVersion']=3
  for key in ('windowEnd','endReason','operatorActions'):value.pop(key)
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')

 def judge_no_task(self,own,value=None):
  import importlib.util
  spec=importlib.util.spec_from_file_location('judge_no_task',PACKAGE/'window/receipt/judge-receipt.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  return m.inspect(self.empty_receipt() if value is None else value,'run1',self.c.record['project'],'codex-3',{'vintik':own})
 def test_canary_no_task_without_reference_is_named_not_slot_failure(self):
  lines=self.judge_no_task(dict(bySlot={},frames=0,unique=0));self.assertIn('неполно у vintik: NO_TASK_IN_RUN',lines)
 def test_canary_no_task_contradicts_positive_reference(self):
  data=dict(modelCalls=1,inputTokens=100,uncachedInputTokens=30,outputTokens=5,cacheReadTokens=60,cacheWriteTokens=10)
  with self.assertRaisesRegex(ValueError,'USAGE_REFERENCE_MISMATCH'):self.judge_no_task(dict(bySlot={'codex-3':data},frames=1,unique=1))
 def test_canary_no_task_preserves_required_job_missing(self):
  self.assertIn('неполно у vintik: JOB_NOT_MEASURED',self.judge_no_task(dict(error='JOB_NOT_MEASURED')))

 def test_canary_null_observed_no_task_cannot_confirm_zero(self):
  value=self.empty_receipt();value['rows'][0]['totals']=dict.fromkeys(ZERO,None)
  with self.assertRaises(self.m.Incomplete):self.m.public_receipt(value,'run1')
  with self.assertRaisesRegex(ValueError,'RECEIPT_INVALID'):self.judge_no_task(dict(bySlot={}),value)

 def test_empty_jobset_without_after_end_marker_is_pending_not_zero(self):
  self.c.participant['jobs']=[];self.c.record.update(runtimeInformational=True,_jobsetVerified=True);value=self.c.collect()['receipt']
  self.assertEqual(value['status'],'incomplete');self.assertEqual(value['pending'],1);self.assertEqual(value['rows'][0]['reason'],'NO_TASK_IN_RUN');self.assertTrue(all(v is None for v in value['totals'].values()))
