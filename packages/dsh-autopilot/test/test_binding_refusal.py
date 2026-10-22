"""Real exporter -> existing preparation-error contract -> receipt v3.
Removing exception propagation must produce the old measured zero and fail assertions.
"""
from pathlib import Path
import copy,datetime,hashlib,importlib.util,json,os,sqlite3,tempfile,unittest
import test_runtime_receipt_source as reference
BASE=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('AP_BINDING_TEST_OUT') or tempfile.mkdtemp(prefix='ap013-binding-'))
OUT.mkdir(parents=True,exist_ok=True)
reference.PACKAGE=BASE
FACTS=json.loads((BASE/'test/fixtures/gw-canary-0112-binding.json').read_text())
OBSERVED={}
DIAGNOSTICS={}
RUN_UNRESOLVED={}

def put(path,rows):
 path.write_text(''.join(json.dumps(x)+'\n' for x in rows));path.chmod(0o600);return str(path)

def canary(root):
 m=reference.module();facts=copy.deepcopy(FACTS)
 rows=[r for r in facts['rows'] if r['sessionId']=='telegram-autopilot-team' and r['turn']<=35 or r['sessionId']=='d3e3a7b0-da44-4ff2-8585-f0102d7ae739']
 for r in rows:r['uid']=os.getuid()
 raw=put(root/'R.jsonl',rows);native=put(root/'native.jsonl',facts['native']);grows=sorted(facts['gateway'],key=lambda r:(r['observedAt'],r['requestId'],r['seq']))
 for r in grows:r['uid']=os.getuid()
 gateway=put(root/'G.jsonl',grows)
 ledger=root/'ledger.sqlite';db=facts['database']
 with sqlite3.connect(ledger) as c:
  c.execute('CREATE TABLE receipts(id TEXT,dsh_id TEXT,logical_key TEXT,session_id TEXT,session_created INTEGER)')
  c.execute('CREATE TABLE mail_sdk_requests(request_id TEXT,generation TEXT,session_id TEXT,session_created INTEGER,turn INTEGER,started_at INTEGER,binding_json TEXT)')
  for x in db['receipts']:c.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',tuple(x[k] for k in ('id','dsh_id','logical_key','session_id','session_created')))
  for x in db['mail_sdk_requests']:c.execute('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?)',tuple(x[k] for k in ('request_id','generation','session_id','session_created','turn','started_at','binding_json')))
 ledger.chmod(0o600)
 p=dict(name='sova',uid=os.getuid(),gid=os.getgid(),home=str(root),engine='claude',gatewaySource='raw-v1',sources=dict(runtime=raw,gateway=gateway,raw=[]),runtimeSource=dict(home=str(root),raw=raw,ledger=str(ledger),native=[native]))
 data=dict(participant=p,runId=facts['runId'],deliveries=facts['deliveries'],operator=facts['operator'],budget=m.LIMIT,seconds=3,cut=m.iso(1792488000000))
 return m,p,data

def stage(m,p,data,root):
 """Uses the unchanged prepare() contract runtimePreparationErrors (source :751-755/:771).
 No exporter/decoder functions are replaced. Only staging paths are fixture-owned.
 """
 out=copy.deepcopy(p);out.pop('runtimeSource',None);out['jobs']=[dict(jobId='gw-child-canary' if p['name']=='sova' else 'job1',claimAt=m.iso(1100),finishAt=None)]
 DIAGNOSTICS[p['name']]=None;RUN_UNRESOLVED[p['name']]=None
 try:owner=m.export_owner(data)
 except m.Incomplete as error:return out,{p['name']:str(error)},None
 DIAGNOSTICS[p['name']]=owner['runtimeDiagnostics'];RUN_UNRESOLVED[p['name']]=owner['runtimeCursor']['unresolvedRequests']
 runtime,gateway,raw=m.cut_snapshot(owner,data.get('cut',m.iso(6000)))
 target=root/'prepared';target.mkdir()
 out['sources']=dict(runtime=put(target/'R',runtime),gateway=put(target/'G',gateway),raw=[put(target/('raw'+str(i)),r) for i,r in enumerate(raw)])
 return out,{},owner

def receipt(m,parts,errors,run,cut,root):
 record=dict(ownershipPolicy='session-interval',ownershipRuleVersion=3,schemaVersion=1,runId=run,project=str(root/'project'),startedAt=m.iso(0),runtimeInformational=True,participants=parts,runtimePreparationErrors=errors,runtimeDiagnostics=[DIAGNOSTICS[p['name']] for p in parts if DIAGNOSTICS.get(p['name']) is not None])
 value=m.core.collect_record(record,cut,{},drop_identity=False)['receipt']
 value=m.core.public_receipt(value,run)
 diags={d['source']:d['unboundRecords'] for d in value['runtimeDiagnostics']}
 for coverage in value['coverage'].values():
  for name in coverage['measured']:assert RUN_UNRESOLVED.get(name)==0, ('MEASURED_WITH_RUN_UNRESOLVED',name,RUN_UNRESOLVED,value)
 return value

class BindingRefusal(unittest.TestCase):
 def test_live_canary_refusal_is_named_null_not_measured_zero(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='canary-') as tmp:
   root=Path(tmp);m,p,data=canary(root);part,errors,owner=stage(m,p,data,root);value=receipt(m,[part],errors,data['runId'],data['cut'],root);OBSERVED['canary']=value
   self.assertEqual(value['status'],'incomplete',value)
   self.assertEqual(value['coverage']['claude']['measured'],[],value)
   self.assertEqual(value['missing'],[dict(participant='sova',reason='CHILD_SOURCE_UNSUPPORTED')],value)
   self.assertEqual(len(value['rows']),1,value);row=value['rows'][0]
   self.assertEqual((row['participant'],row['status'],row['reason']),('sova','incomplete','CHILD_SOURCE_UNSUPPORTED'))
   self.assertTrue(all(v is None for v in row['totals'].values()),row)
 def test_normal_request_without_child_keeps_proven_numbers(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='ordinary-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);part,errors,owner=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['ordinary']=value
   self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100);self.assertEqual(value['totals']['outputTokens'],5);self.assertEqual(value['coverage']['codex']['measured'],['worker'])
 def test_request_identity_refusal_keeps_specific_reason(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='identity-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000)
   with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute("UPDATE mail_sdk_requests SET generation='foreign'")
   part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['identity']=value
   self.assertEqual(value['rows'][0]['reason'],'R_REQUEST_UNPROVEN',value)
   self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()))
 def test_whole_ledger_refusal_keeps_specific_reason(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='ledger-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000)
   with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('DROP TABLE mail_sdk_requests')
   part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['ledger']=value
   self.assertEqual(value['rows'][0]['reason'],'R_DATABASE_SCHEMA_UNSUPPORTED',value)
   self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()))
 def test_binding_budget_refusal_is_named_incomplete(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory(dir=OUT,prefix='budget-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000)
   with patch.object(m,'LIMIT',4096):part,errors,_=stage(m,p,data,root)
   value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['budget']=value
   self.assertEqual(value['rows'][0]['reason'],'BUDGET_EXCEEDED',value)
   self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()))
 def test_malformed_ledger_columns_become_r_bind_unavailable(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='columns-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000)
   with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('ALTER TABLE mail_sdk_requests DROP COLUMN generation')
   part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['columns']=value
   self.assertEqual(value['rows'][0]['reason'],'R_BIND_UNAVAILABLE',value)
   self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()))
 def test_unbound_cache_is_diagnostic_beside_healthy_task(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='unbound-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000)
   rpath=Path(p['runtimeSource']['raw']);rows=m.lines(rpath.read_bytes());orphan=dict(rows[0],requestId='unlabelled-request',sessionId='ordinary-session',sessionCreated=43,turn=2,seq=4,claims=[],deliveryIds=[],claimedAt=None);put(rpath,[*rows,orphan])
   part,errors,owner=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['unbound']=value
   self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100)
   self.assertGreater(owner['runtimeDiagnostics']['unboundRecords'],0)
 def test_real_oserror_in_bind_then_exact_permission_return(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='oserror-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);ledger=Path(p['runtimeSource']['ledger']);saved=ledger.stat().st_mode&0o777;original=hashlib.sha256(ledger.read_bytes()).hexdigest();states=[]
   try:
    ledger.chmod(0)
    self.assertEqual(ledger.stat().st_mode&0o777,0)
    with self.assertRaises(PermissionError):ledger.open('rb')
    part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['oserror']=value
    self.assertEqual(value['rows'][0]['reason'],'R_BIND_UNAVAILABLE',value)
    states.append(dict(mode=0,independentOpen='PermissionError',reason=value['rows'][0]['reason']))
   finally:ledger.chmod(saved)
   self.assertEqual(hashlib.sha256(ledger.read_bytes()).hexdigest(),original)
   part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['oserror-return']=value
   self.assertEqual(value['status'],'observed',value);self.assertEqual(value['totals']['inputTokens'],100);self.assertEqual(value['totals']['outputTokens'],5)
   states.append(dict(mode=ledger.stat().st_mode&0o777,sha256=original,status=value['status'],inputTokens=100,outputTokens=5))
   (OUT/'OSERROR-RETURN.json').write_text(json.dumps(states,indent=2)+'\n')
 def test_empty_bind_selection_without_exception_is_named_then_returns_measured(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='selected-empty-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(1100)
   meter=m.Meter();db=m.database(p['runtimeSource']['ledger'],p['uid'],meter,p['home']);header,events=m.checked_native(p['runtimeSource']['native'][0],p['uid'],p['home'],meter)
   parsed=reference.raw_fixture(m,m.lines(Path(p['runtimeSource']['raw']).read_bytes()),p['uid'],p['name'])
   actual=m.bind_runtime(parsed,db,{(header['id'],header['createdAt']):(header,events)},data['deliveries'],None,p['name'],data['runId'],data['cut'],{},informational=True)
   self.assertFalse(any(r['kind']=='request' for r in actual),'bind returned no request without raising')
   part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['selected-empty']=value
   self.assertEqual(value['rows'][0]['reason'],'R_UNRESOLVED_REQUESTS',value);self.assertEqual(value['coverage']['codex']['measured'],[])
   self.assertTrue(all(x is None for x in value['rows'][0]['totals'].values()))
   data['cut']=m.iso(6000);part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['selected-return']=value
   self.assertEqual(value['status'],'observed');self.assertEqual((value['totals']['inputTokens'],value['totals']['outputTokens']),(100,5))
 def test_collector_keeps_global_unbound_diagnostic_out_of_verdict(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='collect-unbound-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);part,errors,_=stage(m,p,data,root)
   DIAGNOSTICS[part['name']]['unboundRecords']=1
   value=receipt(m,[part],errors,'run1',data['cut'],root);OBSERVED['collect-unbound']=value
   self.assertEqual(value['status'],'observed');self.assertEqual(value['totals']['inputTokens'],100)
 def test_public_reader_accepts_measured_with_global_unbound_diagnostic(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='public-unbound-') as tmp:
   root=Path(tmp);m,p,data=reference.RuntimeSource().files(root);data['cut']=m.iso(6000);part,errors,_=stage(m,p,data,root);value=receipt(m,[part],errors,'run1',data['cut'],root)
   value['runtimeDiagnostics'][0]['unboundRecords']=1
   self.assertEqual(m.core.public_receipt(value,'run1')['status'],'observed')
 def test_other_participant_keeps_its_count_when_sova_is_incomplete(self):
  with tempfile.TemporaryDirectory(dir=OUT,prefix='mixed-') as tmp:
   root=Path(tmp);a=root/'sova';a.mkdir();m,p,data=canary(a);bad,errors,_=stage(m,p,data,a)
   a=root/'healthy';a.mkdir();hm,hp,hd=reference.RuntimeSource().files(a);hd['cut']=hm.iso(6000);good,he,_=stage(hm,hp,hd,a)
   value=receipt(m,[bad,good],errors|he,data['runId'],m.iso(6000),root);OBSERVED['mixed']=value
   self.assertEqual(value['status'],'incomplete',value);self.assertEqual(value['totals']['inputTokens'],100,value)
   healthy=next(r for r in value['rows'] if r['participant']=='worker');self.assertEqual(healthy['status'],'observed');self.assertEqual(healthy['totals']['outputTokens'],5)
   sov=next(r for r in value['rows'] if r['participant']=='sova');self.assertEqual(sov['reason'],'CHILD_SOURCE_UNSUPPORTED');self.assertTrue(all(x is None for x in sov['totals'].values()))

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(BindingRefusal);result=unittest.TextTestRunner(verbosity=2).run(suite)
 (OUT/'LAST-RECEIPTS.json').write_text(json.dumps(OBSERVED,indent=2)+'\n')
 raise SystemExit(0 if result.wasSuccessful() else 1)
