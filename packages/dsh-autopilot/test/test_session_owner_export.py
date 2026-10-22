"""A+B must reach the actual owner, ledger/native validation and warm cursor."""
import copy
import hashlib
import json
import tempfile
from pathlib import Path
import unittest
import test_runtime_incremental as existing

def changed(path,data,label):
    before=path.read_bytes();path.write_bytes(data)
    if before==path.read_bytes():raise AssertionError('damage was not applied: '+label)
    print(label,str(path),'SHA256',hashlib.sha256(before).hexdigest(),'->',hashlib.sha256(path.read_bytes()).hexdigest(),flush=True)

class IntervalOwner(unittest.TestCase):
    def fixture(self,root):
        m,p,data=existing.JobReceipts().with_ordinary(root)
        data['cut']=m.iso(6000)
        for d in data['deliveries'].values():d.update(runId='run1',createdAt=100,deadline=20000,resultAt=6000)
        data['ownership']=[dict(runId='run1',registeredAt=0,finishedAt=None,uid=p['uid'],participant=p['name'],operator=None)]
        return m,p,data
    def test_continuations_reach_owner_and_warm_cache_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));first=m.export_owner(data)
            rows=[r for r in first['rows'] if r['kind']=='request']
            self.assertEqual({r['turn'] for r in rows},{1,2,3})
            second=m.export_owner(data);self.assertEqual(first['rows'],second['rows'])
            self.assertEqual(second['runtimeCursor']['bindingBytes'],0)
            self.assertEqual(second['runtimeDiagnostics']['unboundRecords'],0)
    def test_warm_conflict_refuses_both_runs_and_exact_return_recovers(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));first=m.export_owner(data);original=copy.deepcopy(data)
            data['deliveries']['b'*64]['runId']='run2';data['ownership'].append(dict(data['ownership'][0],runId='run2'))
            print('CONTEXT MUTATION',hashlib.sha256(json.dumps(original,sort_keys=True).encode()).hexdigest(),hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest(),flush=True)
            for run in ('run1','run2'):
                data['runId']=run
                with self.assertRaisesRegex(m.Incomplete,'^MIXED_RUN_TURN$'):m.export_owner(data)
            restored=m.export_owner(original);self.assertEqual(restored['rows'],first['rows'])
    def test_warm_cache_cannot_hide_changed_native_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));m.export_owner(data)
            path=Path(p['runtimeSource']['native'][0]);original=path.read_bytes();values=m.lines(original);values[0]['createdAt']=43
            changed(path,''.join(json.dumps(v)+'\n' for v in values).encode(),'NATIVE-IDENTITY')
            with self.assertRaisesRegex(m.Incomplete,'RUN_SESSION_CONTINUITY_LOST'):m.export_owner(data)
    def test_forged_terminal_claim_cannot_admit_a_new_interval(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));m.export_owner(data)
            data['deliveries']['fake']=dict(data['deliveries']['a'*64],jobId='forged')
            path=Path(p['runtimeSource']['raw']);rows=m.lines(path.read_bytes());bad=copy.deepcopy(next(r for r in rows if r.get('kind')=='runtime_turn' and r['turn']==3))
            bad['claims'].append(dict(receiptId='invented',messageId='invented',claimedAt=5100,deliveryId='fake'));bad['deliveryIds'].append('fake');bad['seq']=99
            changed(path,path.read_bytes()+(json.dumps(bad)+'\n').encode(),'R-FINAL-CLAIM')
            with self.assertRaisesRegex(m.Incomplete,'TASK_UNCLAIMED'):m.export_owner(data)
            data['deliveries'].pop('fake')
            with self.assertRaisesRegex(m.Incomplete,'R_NATIVE_CLAIM_CONFLICT'):m.export_owner(data)
            good=next(r for r in rows if r.get('kind')=='runtime_turn' and r['turn']==3)
            changed(path,path.read_bytes()+(json.dumps(good)+'\n').encode(),'R-FINAL-RETURN')
            self.assertEqual(len([r for r in m.export_owner(data)['rows'] if r['kind']=='request']),3)
    def test_future_or_missing_native_terminal_cannot_be_replaced_by_gateway(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));data['cut']=m.iso(5750)
            with self.assertRaisesRegex(m.Incomplete,'TURN_TERMINAL_PENDING'):m.export_owner(data)
            data['cut']=m.iso(6000);native=Path(p['runtimeSource']['native'][0]);original=native.read_bytes()
            rows=m.lines(original);rows=[r for r in rows if not (r.get('type')=='turn/end' and r['data'].get('turn')==3)]
            for i,r in enumerate(rows[1:]):r['seq']=i
            changed(native,''.join(json.dumps(r)+'\n' for r in rows).encode(),'NATIVE-DAMAGE')
            raw=Path(p['runtimeSource']['raw']);saved=raw.read_bytes();r=m.lines(saved)
            for x in r:
                if x.get('kind')=='runtime_turn' and x['turn']==3:x['finishedAt']=None
            raw.write_text(''.join(json.dumps(x)+'\n' for x in r))
            # Fresh cursor measures the changed source, not a previously consumed prefix.
            data['runtimeCursorDir']=str(Path(tmp)/'missing-terminal-cursor')
            with self.assertRaisesRegex(m.Incomplete,'TURN_TERMINAL_PENDING'):m.export_owner(data)
            native.write_bytes(original);raw.write_bytes(saved)
            data['runtimeCursorDir']=str(Path(tmp)/'restored-terminal-cursor');self.assertEqual(len([r for r in m.export_owner(data)['rows'] if r['kind']=='request']),3)
    def test_late_foreign_recipient_claim_refuses_before_interval_filter(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));m.export_owner(data);did='f'*64
            data['deliveries'][did]=dict(data['deliveries']['a'*64],recipient='another-worker',jobId='foreign')
            native=Path(p['runtimeSource']['native'][0]);saved=native.read_bytes();rows=m.lines(saved);end=next(i for i,r in enumerate(rows) if r.get('type')=='turn/end' and r['data'].get('turn')==1)
            rows[end:end]=[dict(type='agent/inbox/spliced',time=1300,data=dict(target='next-step',start=0,removedCount=0,inserted=[dict(id='late-foreign')])),dict(type='agent/inbox/spliced',time=1400,data=dict(target='next-step',start=0,removedCount=1,inserted=[]))]
            for i,r in enumerate(rows[1:]):r['seq']=i
            changed(native,''.join(json.dumps(r)+'\n' for r in rows).encode(),'NATIVE-DAMAGE')
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)',('foreign-receipt','late-foreign','ap-notice:'+did,'s',42))
            raw=Path(p['runtimeSource']['raw']);saved_r=raw.read_bytes();rows=m.lines(saved_r);bad=copy.deepcopy(next(r for r in rows if r.get('kind')=='runtime_turn' and r['turn']==1));bad['claims'].append(dict(receiptId='foreign-receipt',messageId='late-foreign',claimedAt=1400,deliveryId=did));bad['deliveryIds'].append(did);bad['seq']=100
            changed(raw,raw.read_bytes()+(json.dumps(bad)+'\n').encode(),'R-FOREIGN-CLAIM')
            with self.assertRaisesRegex(m.Incomplete,'R_DELIVERY_UNPROVEN'):m.export_owner(data)
            native.write_bytes(saved);raw.write_bytes(saved_r);data['deliveries'].pop(did)
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('DELETE FROM receipts WHERE id=?',('foreign-receipt',))
            data['runtimeCursorDir']=str(Path(tmp)/'foreign-return-cursor');self.assertEqual(len([r for r in m.export_owner(data)['rows'] if r['kind']=='request']),3)
    def test_request_before_claim_in_boundary_turn_is_still_charged_whole(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));raw=Path(p['runtimeSource']['raw']);r=m.lines(raw.read_bytes())
            first=r[0];first['registeredAt']=1055;first['deliveryIds']=[];first['claims']=[c for c in first['claims'] if c['claimedAt']<=1055];first['claimedAt']=1050
            raw.write_text(''.join(json.dumps(x)+'\n' for x in r))
            with sqlite3.connect(p['runtimeSource']['ledger']) as db:db.execute('UPDATE mail_sdk_requests SET started_at=1054 WHERE request_id=?',(first['requestId'],))
            gpath=Path(p['sources']['gateway']);g=m.lines(gpath.read_bytes());g[0]['startedAt']=m.iso(1060);gpath.write_text(''.join(json.dumps(x)+'\n' for x in g))
            engine=Path(p['sources']['raw'][0]);sdk=m.lines(engine.read_bytes());sdk[1]['timestamp']=m.iso(1060);engine.write_text(''.join(json.dumps(x)+'\n' for x in sdk))
            owner=m.export_owner(data);runtime,gateway,raws=m.cut_snapshot(owner,m.iso(6000))
            def put(name,rows):
                file=Path(tmp)/name;file.write_text(''.join(json.dumps(r)+'\n' for r in rows));return str(file)
            participant=copy.deepcopy(p);participant.pop('runtimeSource');participant['sources']=dict(runtime=put('normalized-R',runtime),gateway=put('normalized-G',gateway),raw=[put('normalized-raw-'+str(i),rows) for i,rows in enumerate(raws)])
            participant['jobs']=[dict(jobId='job1',claimAt=m.iso(1000),finishAt=None)]
            record=dict(schemaVersion=1,runId='run1',project=str(Path(tmp)/'project'),startedAt=m.iso(0),participants=[participant],runtimeInformational=True,ownershipPolicy='session-interval',ownershipRuleVersion=3)
            receipt=m.core.collect_record(record,m.iso(6000),{},drop_identity=False)['receipt']
            self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals']['inputTokens'],7300)
            self.assertTrue(any(set(x['jobRefs'])=={'job1','job2'} for x in owner['ownershipProvenance']))
    def test_pending_cut_advance_converges_without_any_source_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp))
            for d in data['deliveries'].values():d['resultAt']=5500
            data['cut']=m.iso(5750)
            with self.assertRaisesRegex(m.Incomplete,'TURN_TERMINAL_PENDING'):m.export_owner(data)
            data['cut']=m.iso(6000);first=m.export_owner(data);second=m.export_owner(data)
            self.assertEqual({r['turn'] for r in first['rows'] if r['kind']=='request'},{1,2,3})
            self.assertEqual(first['rows'],second['rows']);self.assertEqual(second['runtimeCursor']['bindingBytes'],0)
    def test_native_cache_rechecks_current_delivery_authority_and_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));first=m.export_owner(data);data['deliveries']['b'*64]['recipient']='another-worker'
            with self.assertRaisesRegex(m.Incomplete,'R_DELIVERY_UNPROVEN'):m.export_owner(data)
            data['runtimeCursorDir']=str(Path(tmp)/'cold-authority')
            with self.assertRaisesRegex(m.Incomplete,'R_DELIVERY_UNPROVEN'):m.export_owner(data)
            data['deliveries']['b'*64]['recipient']=p['name'];data.pop('runtimeCursorDir')
            self.assertEqual(m.export_owner(data)['rows'],first['rows'])
    def test_cached_terminal_from_later_cut_cannot_close_an_earlier_view(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp))
            for d in data['deliveries'].values():d['resultAt']=5500
            first=m.export_owner(data);data['cut']=m.iso(5750)
            with self.assertRaisesRegex(m.Incomplete,'TURN_TERMINAL_PENDING'):m.export_owner(data)
            data['cut']=m.iso(6000);self.assertEqual(m.export_owner(data)['rows'],first['rows'])
    def test_unrelated_old_tuple_cannot_poison_current_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));data['ownership'].append(dict(data['ownership'][0],runId='old',finishedAt=1000))
            did='e'*64;data['deliveries'][did]=dict(data['deliveries']['a'*64],runId='old',jobId='old-job',createdAt=100,deadline=2000,resultAt=800)
            raw=Path(p['runtimeSource']['raw']);rows=m.lines(raw.read_bytes());old=copy.deepcopy(rows[0]);old.update(seq=200,sessionId='obsolete',sessionCreated=1,turn=1,turnStartedAt=400,registeredAt=600,claimedAt=500,requestId='old-request',claims=[dict(receiptId='old',messageId='old',claimedAt=500,deliveryId=did)],deliveryIds=[did])
            with raw.open('a') as f:f.write(json.dumps(old)+'\n')
            result=m.export_owner(data);self.assertEqual({r['turn'] for r in result['rows'] if r['kind']=='request'},{1,2,3})
            self.assertEqual(result['runtimeDiagnostics']['unboundRecords'],0)
    def test_old_same_tuple_postman_and_sdk_pruning_do_not_poison_new_run(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));data['ownership'][0]['registeredAt']=2500;data['ownership'].append(dict(data['ownership'][0],runId='old',registeredAt=0,finishedAt=1800))
            old=copy.deepcopy(data['deliveries']['a'*64]);data['deliveries']['a'*64].update(runId='old',resultAt=1800,deadline=2000)
            data['deliveries']['b'*64]['createdAt']=2600
            original=copy.deepcopy(data['deliveries']['a'*64]);first=m.export_owner(data);self.assertEqual({r['turn'] for r in first['rows'] if r['kind']=='request'},{2,3})
            data['deliveries'].pop('a'*64);self.assertEqual(m.export_owner(data)['rows'],first['rows'])
            data['runtimeCursorDir']=str(Path(tmp)/'cold-pruned-post');self.assertEqual(m.export_owner(data)['rows'],first['rows']);data['deliveries']['a'*64]=original
            ledger=Path(p['runtimeSource']['ledger']);before=ledger.read_bytes()
            with sqlite3.connect(ledger) as db:removed=db.execute('DELETE FROM mail_sdk_requests WHERE request_id="request-one"').rowcount
            self.assertEqual(removed,1);print('SDK-PRUNE',removed,hashlib.sha256(before).hexdigest(),hashlib.sha256(ledger.read_bytes()).hexdigest(),flush=True)
            data.pop('runtimeCursorDir');self.assertEqual(m.export_owner(data)['rows'],first['rows']);data['runtimeCursorDir']=str(Path(tmp)/'cold-pruned-sdk');self.assertEqual(m.export_owner(data)['rows'],first['rows'])
            ledger.write_bytes(before);data.pop('runtimeCursorDir');self.assertEqual(m.export_owner(data)['rows'],first['rows'])
    def test_selected_sdk_missing_from_both_r_and_g_is_not_hidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));raw=Path(p['runtimeSource']['raw']);rows=m.lines(raw.read_bytes())
            changed(raw,''.join(json.dumps(r)+'\n' for r in rows if r.get('turn')!=3).encode(),'REMOVE-OWN-R')
            gpath=Path(p['sources']['gateway']);g=m.lines(gpath.read_bytes());changed(gpath,''.join(json.dumps(r)+'\n' for r in g if r.get('dshTurn')!=3).encode(),'REMOVE-OWN-G')
            with self.assertRaisesRegex(m.Incomplete,'R_REQUEST_UNPROVEN'):m.export_owner(data)
    def test_foreign_run_claim_inside_scope_refuses_without_peer_root_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));first=m.export_owner(data)
            data['deliveries']['b'*64]['runId']='foreign'
            with self.assertRaisesRegex(m.Incomplete,'MIXED_RUN_TURN'):m.export_owner(data)
            data['deliveries']['b'*64]['runId']='run1';self.assertEqual(m.export_owner(data)['rows'],first['rows'])
    def test_native_identity_damage_is_still_rejected_with_interval_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=self.fixture(Path(tmp));first=m.export_owner(data)
            path=Path(p['runtimeSource']['native'][0]);original=path.read_bytes();values=m.lines(original);values[0]['createdAt']=43
            changed(path,''.join(json.dumps(v)+'\n' for v in values).encode(),'NATIVE-IDENTITY')
            # Force a cold bind; valid cached provenance cannot authorize new native bytes.
            for f in (Path(p['runtimeSource']['home'])/'.usage-reader').glob('*.sqlite*'):
                if f.is_file():f.unlink()
            with self.assertRaisesRegex(m.Incomplete,'RUN_SESSION_CONTINUITY_LOST'):m.export_owner(data)
            path.write_bytes(original)
            for f in (Path(p['runtimeSource']['home'])/'.usage-reader').glob('*.sqlite*'):
                if f.is_file():f.unlink()
            self.assertEqual(m.export_owner(data)['rows'],first['rows'])

class SelectedInventory(unittest.TestCase):
    fixture=IntervalOwner.fixture
    def test_future_r_registration_cannot_hide_selected_sdk_request(self):
        import sqlite3
        for sdk_future in (False,True):
            with self.subTest(sdk_future=sdk_future),tempfile.TemporaryDirectory() as tmp:
                m,p,data=self.fixture(Path(tmp))
                raw=Path(p['runtimeSource']['raw']);before=raw.read_bytes();rows=m.lines(before)
                for row in rows:
                    if row.get('kind')=='runtime_request' and row['turn']==3:row['registeredAt']=9000
                changed(raw,''.join(json.dumps(r)+'\n' for r in rows).encode(),'R-REGISTRATION-FUTURE')
                ledger=Path(p['runtimeSource']['ledger']);saved=ledger.read_bytes()
                if sdk_future:
                    with sqlite3.connect(ledger) as db:self.assertEqual(db.execute('UPDATE mail_sdk_requests SET started_at=8999 WHERE request_id=?',('ordinary-request',)).rowcount,1)
                    print('SDK-FUTURE',hashlib.sha256(saved).hexdigest(),hashlib.sha256(ledger.read_bytes()).hexdigest(),flush=True)
                for mode in ('cold','warm','repeat'):
                    with self.assertRaisesRegex(m.Incomplete,'R_REQUEST_UNPROVEN'):m.export_owner(data)
                changed(raw,before,'R-REGISTRATION-RETURN');ledger.write_bytes(saved);data['runtimeCursorDir']=str(Path(tmp)/'return-future')
                self.assertEqual({r['turn'] for r in m.export_owner(data)['rows'] if r['kind']=='request'},{1,2,3})
    def test_non_object_sdk_binding_is_named_and_old_scope_is_ignored(self):
        import sqlite3
        for body in ('[]','null','1'):
            with self.subTest(binding=body),tempfile.TemporaryDirectory() as tmp:
                m,p,data=self.fixture(Path(tmp));ledger=Path(p['runtimeSource']['ledger']);before=ledger.read_bytes()
                m.export_owner(data)
                with sqlite3.connect(ledger) as db:self.assertEqual(db.execute('UPDATE mail_sdk_requests SET binding_json=? WHERE request_id=?',(body,'request-one')).rowcount,1)
                print('SDK-BINDING-DAMAGE',body,hashlib.sha256(before).hexdigest(),hashlib.sha256(ledger.read_bytes()).hexdigest(),flush=True)
                with self.assertRaisesRegex(m.Incomplete,'R_REQUEST_UNPROVEN'):m.export_owner(data)
                data['ownership'][0]['registeredAt']=2500
                data['deliveries']['a'*64].update(runId='old',resultAt=1800,deadline=2000)
                data['deliveries']['b'*64]['createdAt']=2600
                self.assertEqual({r['turn'] for r in m.export_owner(data)['rows'] if r['kind']=='request'},{2,3})
                ledger.write_bytes(before);data['runtimeCursorDir']=str(Path(tmp)/'return-binding')
                self.assertEqual({r['turn'] for r in m.export_owner(data)['rows'] if r['kind']=='request'},{2,3})

if __name__=='__main__':unittest.main(verbosity=2)
