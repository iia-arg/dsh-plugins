"""RUN-scoped delivery coverage; actual R reader/exporter/consumer, no models."""
from pathlib import Path
import json,os,tempfile,unittest,copy
import test_binding_refusal as binding
import test_runtime_incremental as incremental
import test_runtime_receipt_source as reference
BASE=Path(__file__).resolve().parents[1]

class RunCoverage(unittest.TestCase):
 def test_readback_0112b_acked_task_has_no_r_and_keeps_sova_named(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root,participant='sova');p['engine']='claude';p['gatewaySource']='raw-v1'
   fact=json.loads((BASE/'test/fixtures/gw-canary-0112b-coverage.json').read_text());mail=fact['mail'];self.assertEqual(mail['acked'],1);self.assertEqual(fact['r']['requestMatches'],0);self.assertEqual(fact['r']['deliveryMarkers'],[])
   original=(BASE/'test/fixtures/gw-canary-0112b-R.jsonl').read_bytes();self.assertEqual(binding.hashlib.sha256(original).hexdigest(),fact['r']['sha256'])
   rows=m.lines(original)
   for r in rows:
    if 'uid' in r:r['uid']=os.getuid()
   binding.put(Path(p['runtimeSource']['raw']),rows)
   grows=json.loads((BASE/'test/fixtures/gw-canary-0112b-G.json').read_text())
   for r in grows:r['uid']=os.getuid()
   binding.put(Path(p['sources']['gateway']),grows)
   data.update(runId=mail['runId'],operator=None,cut=m.iso(1792495000000),deliveries={mail['id']:dict(kind='task',recipient='sova',runId=mail['runId'],jobId=mail['jobId'],acked=True)})
   part,errors,_=binding.stage(m,p,data,root);value=binding.receipt(m,[part],errors,data['runId'],data['cut'],root);binding.OBSERVED['0112b-coverage']=value
   self.assertEqual(value['rows'][0]['participant'],'sova');self.assertEqual(value['rows'][0]['reason'],'DELIVERY_UNBOUND',value);self.assertEqual(value['coverage']['claude']['measured'],[]);self.assertTrue(all(v is None for v in value['rows'][0]['totals'].values()))
 def test_ordinary_outside_run_does_not_break_bound_current_delivery(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=incremental.JobReceipts().with_ordinary(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True
   owner=m.export_owner(data);self.assertGreater(owner['runtimeDiagnostics']['unboundRecords'],0)
   value=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root)
   self.assertEqual(value['status'],'observed',value);self.assertEqual((value['totals']['inputTokens'],value['totals']['outputTokens']),(100,5));m.core.public_receipt(value,'run1');binding.OBSERVED['ordinary-outside-run']=value
 def test_second_acked_delivery_same_job_needs_its_own_marker_then_return(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True
   good=m.export_owner(data);self.assertEqual(len([r for r in good['rows'] if r['kind']=='request']),1)
   data['deliveries']['c'*64]=dict(data['deliveries']['a'*64],acked=True)
   with self.assertRaisesRegex(m.Incomplete,'^DELIVERY_UNBOUND$'):m.export_owner(data)
   data['deliveries']['c'*64]['acked']=False
   returned=m.export_owner(data);value=incremental.JobReceipts().receipt(m,p,returned,'run1','job1',root);self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['inputTokens'],100)
 def test_master_operator_claim_needs_exact_run_turn_then_return(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root,participant='master');data['cut']=m.iso(6000);data['operator']=dict(sessionId='s',sessionCreated=42,turn=1,jobId='job1',runStartedAt=m.iso(0))
   m.export_owner(data);data['operator']['turn']=99
   with self.assertRaisesRegex(m.Incomplete,'^DELIVERY_UNBOUND$'):m.export_owner(data)
   data['operator']['turn']=1;m.export_owner(data)

 def test_cached_binding_cannot_hide_new_mixed_run_labels(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);m.export_owner(data)
   path=Path(p['runtimeSource']['raw']);saved=path.read_bytes();rows=m.lines(saved);later=copy.deepcopy(rows[1]);later['seq']=4;later['deliveryIds'].append('c'*64);later['claims'].append(dict(receiptId='foreign',messageId='foreign',claimedAt=1100,deliveryId='c'*64))
   data['deliveries']['c'*64]=dict(kind='task',recipient='worker',runId='other-run',jobId='foreign-job',acked=True)
   with path.open('a') as out:out.write(json.dumps(later)+'\n')
   with self.assertRaisesRegex(m.Incomplete,'^MIXED_JOB_TURN$'):m.export_owner(data)
 def test_turn_marker_without_request_cannot_cover_acked_task(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True
   path=Path(p['runtimeSource']['raw']);rows=m.lines(path.read_bytes());binding.put(path,[r for r in rows if r['kind']!='runtime_request'])
   self.assertTrue(any(r['kind']=='runtime_turn' and 'a'*64 in r['deliveryIds'] for r in rows))
   with self.assertRaisesRegex(m.Incomplete,'^DELIVERY_UNBOUND$'):m.export_owner(data)
 def test_unlabelled_gateway_without_r_refuses_then_exact_r_return(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=incremental.JobReceipts().with_ordinary(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True
   path=Path(p['runtimeSource']['raw']);saved=path.read_bytes();healthy=m.export_owner(data)
   self.assertGreater(healthy['runtimeDiagnostics']['unboundRecords'],0)
   binding.put(path,[r for r in m.lines(saved) if r.get('requestId')!='ordinary-request'])
   data['runtimeCursorDir']=str(root/'cold-after-damage') # the missing request was never read here
   try:
    self.assertNotEqual(binding.hashlib.sha256(path.read_bytes()).hexdigest(),binding.hashlib.sha256(saved).hexdigest())
    self.assertEqual(sum(r.get('requestId')=='ordinary-request' for r in m.lines(path.read_bytes())),0)
    with self.assertRaisesRegex(m.Incomplete,'^R_REQUEST_UNPROVEN$'):m.export_owner(data)
   finally:
    returned=path.with_suffix('.returned');returned.write_bytes(saved);returned.chmod(0o600);returned.replace(path)
   self.assertEqual(path.read_bytes(),saved)
   owner=m.export_owner(data);value=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root);self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['inputTokens'],100)

 def test_foreign_r_key_cannot_cover_gateway_claiming_current_run_turn(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=incremental.JobReceipts().with_ordinary(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True
   path=Path(p['sources']['gateway']);rows=m.lines(path.read_bytes());target=next(r for r in rows if r.get('requestId')=='ordinary-request');target['dshTurn']=1;binding.put(path,rows)
   with self.assertRaisesRegex(m.Incomplete,'^R_REQUEST_UNPROVEN$'):m.export_owner(data)

 def test_cached_same_job_turn_marker_cannot_replace_request_claim(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);data['deliveries']['a'*64]['acked']=True;m.export_owner(data)
   data['deliveries']['c'*64]=dict(data['deliveries']['a'*64],acked=True)
   path=Path(p['runtimeSource']['raw']);rows=m.lines(path.read_bytes());turn=copy.deepcopy(rows[1]);turn['seq']=4;turn['deliveryIds'].append('c'*64);turn['claims'].append(dict(receiptId='late',messageId='late',claimedAt=1600,deliveryId='c'*64))
   with path.open('a') as out:out.write(json.dumps(turn)+'\n')
   with self.assertRaisesRegex(m.Incomplete,'^DELIVERY_UNBOUND$'):m.export_owner(data)


 def test_gateway_before_run_missing_r_is_excluded_but_boundary_is_strict(self):
  for timestamp_field in ('startedAt','observedAt'):
   with self.subTest(timestamp_field=timestamp_field),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);m,p,data=incremental.JobReceipts().with_ordinary(root);data['cut']=m.iso(6000)
    data['operator']=dict(sessionId='operator-session',sessionCreated=1,turn=1,jobId='operator-job',runStartedAt=m.iso(1000))
    data['deliveries']['a'*64]['acked']=True
    rp=Path(p['runtimeSource']['raw']);rbytes=rp.read_bytes()
    binding.put(rp,[r for r in m.lines(rbytes) if r.get('requestId')!='ordinary-request'])
    gp=Path(p['sources']['gateway']);rows=m.lines(gp.read_bytes());old=next(r for r in rows if r.get('requestId')=='ordinary-request')
    old[timestamp_field]=m.iso(999) if timestamp_field=='startedAt' else 999
    binding.put(gp,rows);oldbytes=gp.read_bytes()
    owner=m.export_owner(data);value=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root)
    self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100)
    old[timestamp_field]=m.iso(1000) if timestamp_field=='startedAt' else 1000
    binding.put(gp,rows)
    self.assertNotEqual(binding.hashlib.sha256(gp.read_bytes()).hexdigest(),binding.hashlib.sha256(oldbytes).hexdigest())
    self.assertEqual(sum(r.get('requestId')=='ordinary-request' and r[timestamp_field]==old[timestamp_field] for r in m.lines(gp.read_bytes())),1)
    with self.assertRaisesRegex(m.Incomplete,'^R_REQUEST_UNPROVEN$'):m.export_owner(data)
    binding.put(gp,m.lines(oldbytes));self.assertEqual(gp.read_bytes(),oldbytes)
    returned=m.export_owner(data);value=incremental.JobReceipts().receipt(m,p,returned,'run1','job1',root)
    self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100)


 def test_gateway_cut_microseconds_stays_inclusive_without_r(self):
  for stamp,inside in [('1970-01-01T00:00:06.000400+00:00',True),('1970-01-01T00:00:06.000500+00:00',True),('1970-01-01T00:00:06.000600+00:00',False)]:
   with self.subTest(at=stamp),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);m,p,data=incremental.JobReceipts().with_ordinary(root)
    data.update(cut='1970-01-01T00:00:06.000500+00:00',operator=dict(sessionId='operator-session',sessionCreated=1,turn=1,jobId='operator-job',runStartedAt=m.iso(1000)))
    rp=Path(p['runtimeSource']['raw']);binding.put(rp,[r for r in m.lines(rp.read_bytes()) if r.get('requestId')!='ordinary-request'])
    gp=Path(p['sources']['gateway']);rows=m.lines(gp.read_bytes());target=next(r for r in rows if r.get('requestId')=='ordinary-request');target.update(startedAt=stamp,endedAt=None);binding.put(gp,rows)
    if inside:
     with self.assertRaisesRegex(m.Incomplete,'^R_REQUEST_UNPROVEN$'):m.export_owner(data)
    else:
     owner=m.export_owner(data);value=incremental.JobReceipts().receipt(m,p,owner,'run1','job1',root);self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100)

if __name__=='__main__':unittest.main(verbosity=2)
