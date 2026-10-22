"""Actual Root/owner/collector in explicit private fake-NSS namespace only."""
import hashlib,json,os,pwd,sqlite3,time,unittest
from pathlib import Path
from _runtime_receipt_root import ProtectedPipeline,attest_registered

class IncrementalPipeline(unittest.TestCase):
    setUp=ProtectedPipeline.setUp
    register=ProtectedPipeline.register
    prepare=ProtectedPipeline.prepare
    cli=ProtectedPipeline.cli

    def set_publisher(self):
        # Private publisher boundary: verify real UID drop and inspect passed receipt.
        who=pwd.getpwnam('master');target=self.root/'published';target.touch();os.chown(target,who.pw_uid,who.pw_gid);target.chmod(0o600)
        (self.package/'runtime/ap_sadik.py').write_text("import json,os,sys\nfrom pathlib import Path\nassert os.getuid()=="+str(who.pw_uid)+" and os.getgroups()==[]\nwith Path("+repr(str(target))+").open('a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')\n")
        return target

    def current(self):
        home=self.output/'run1';pointer=json.loads((home/'current.json').read_text())
        receipt=json.loads((home/'public'/pointer['generation']/'receipt.json').read_text());self.assertEqual(receipt['schemaVersion'],4)
        return receipt

    def state_rows(self):
        result={}
        for p in (self.output.parent/'runtime-readers').rglob('*.sqlite'):
            with sqlite3.connect(p) as db:result[str(p)]=db.execute('SELECT inode,offset,skipped,resets FROM cursor').fetchone()
        return result

    def test_real_cli_persists_offset_counts_bad_rows_and_publishes_reference(self):
        self.assertEqual(pwd.getpwnam('master').pw_uid,60001);self.register();published=self.set_publisher()
        first=self.cli();self.assertEqual(first.returncode,0,first.stdout+first.stderr)
        receipt=self.current();self.assertEqual(receipt['status'],'observed',receipt);self.assertEqual(receipt['totals']['inputTokens'],700)
        states=self.state_rows();self.assertEqual(len(states),7)
        source=Path(self.record['participants'][1]['runtimeSource']['raw']);before=source.read_bytes();source.write_bytes(before+b'{broken}\n');print('DAMAGE badJSON bytes9 SHA256',hashlib.sha256(before).hexdigest(),hashlib.sha256(source.read_bytes()).hexdigest(),flush=True)
        second=self.cli();self.assertEqual(second.returncode,0,second.stdout+second.stderr)
        receipt=self.current();self.assertEqual(receipt['status'],'observed');self.assertEqual(receipt['totals']['inputTokens'],700)
        diagnostics={d['source']:d for d in receipt['runtimeDiagnostics']};self.assertEqual(diagnostics['vintik']['skippedLines'],1)
        third=self.cli();self.assertEqual(third.returncode,0,third.stdout+third.stderr)
        self.assertEqual({k:v for k,v in self.state_rows().items() if '/60002/' not in k},{k:v for k,v in states.items() if '/60002/' not in k})
        self.assertTrue(published.read_text());self.assertIn('--publish-team',published.read_text())
        self.assertEqual({d['source']:d for d in self.current()['runtimeDiagnostics']}['vintik']['skippedLines'],1)

    def test_real_cli_inode_and_same_inode_truncate_keep_numbers_and_one_note(self):
        self.register();self.set_publisher();first=self.cli();self.assertEqual(first.returncode,0,first.stdout+first.stderr)
        source=Path(self.record['participants'][1]['runtimeSource']['raw']);old=source.stat().st_ino;replacement=source.with_name('replacement');replacement.write_bytes(b'');os.chown(replacement,source.stat().st_uid,source.stat().st_gid);replacement.chmod(0o600);replacement.replace(source);self.assertNotEqual(old,source.stat().st_ino)
        changed=self.cli();self.assertEqual(changed.returncode,0,changed.stdout+changed.stderr)
        receipt=self.current();self.assertEqual(receipt['totals']['inputTokens'],700);self.assertEqual(receipt['status'],'observed');self.assertIn('обрезан',receipt['notice'])
        source.write_bytes(b'{broken}\n');self.assertEqual(self.cli().returncode,0);inode=source.stat().st_ino;source.write_bytes(b'');self.assertEqual(self.cli().returncode,0);self.assertEqual(inode,source.stat().st_ino)
        self.assertEqual(self.current()['totals']['inputTokens'],700)

    def test_idle_never_opens_r_or_creates_cursor_state(self):
        self.m.atomic(self.index,dict(schemaVersion=1,runs=[]))
        result=self.prepare();self.assertTrue(result['idle']);self.assertFalse((self.output.parent/'runtime-readers').exists())

    def test_policy_absent_invalid_and_return_keep_cached_totals_with_public_notice(self):
        policy=Path('/etc/dsh-telegram-multiagent/usage-runtime-policy.json');saved=policy.read_bytes()
        self.register();self.set_publisher();initial=self.cli();self.assertEqual(initial.returncode,0,initial.stdout+initial.stderr)
        self.assertEqual(self.current()['totals']['inputTokens'],700)
        try:
            for kind in ('missing','invalid','restored'):
                if kind=='missing':policy.unlink()
                elif kind=='invalid':policy.write_bytes(b'{bad');policy.chmod(0o644)
                else:policy.write_bytes(saved);policy.chmod(0o644)
                print('POLICY-STAGE',kind,'SHA256',hashlib.sha256(policy.read_bytes()).hexdigest() if policy.exists() else 'ABSENT',flush=True)
                ready=self.prepare();self.assertFalse(ready['failed'],ready)
                self.assertEqual(len(ready['runtimeReads']),7)
                self.assertTrue(all(r['readBytes']==0 for r in ready['runtimeReads']),ready['runtimeReads'])
                if kind!='restored':self.assertTrue(all(r['readError']=='R_POLICY_MISSING' if kind=='missing' else r['readError']=='R_POLICY_INVALID' for r in ready['runtimeReads']))
                ran=self.cli();self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
                public=self.current();self.assertEqual(public['status'],'observed',public);self.assertEqual(public['totals']['inputTokens'],700)
                if kind!='restored':self.assertIn('policy отсутствует' if kind=='missing' else 'policy негодна',public.get('notice',''))
                else:self.assertNotIn('policy',public.get('notice',''))
        finally:policy.write_bytes(saved);policy.chmod(0o644)

    def test_native_install_from_basis_preserves_old_release_and_repeats(self):
        import tarfile,subprocess,sys
        from test_install import seed_accounts,snapshot
        base=getattr(self,'basisArchive',Path(__file__).resolve().parents[4]/'evidence/base03.tar')
        basis=self.root/'basis';basis.mkdir()
        with tarfile.open(base) as tar:tar.extractall(basis,filter='data')
        old_package=basis/'packages/dsh-autopilot';dest=self.root/'install';dest.mkdir(mode=0o755);seed_accounts(dest)
        def install(package):
            result=subprocess.run(['bash',str(package/'install.sh')],env={**os.environ,'DESTDIR':str(dest)},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr);return result
        install(old_package);old=(dest/'opt/autopilot/current').resolve();before=snapshot(old);old_inode=old.stat().st_ino
        from test_runtime_receipt_source import PACKAGE
        changed=install(PACKAGE);current=(dest/'opt/autopilot/current').resolve()
        self.assertNotEqual(old,current);self.assertEqual(old.stat().st_ino,old_inode);self.assertEqual(snapshot(old),before)
        self.assertEqual((current/'tools/runtime_incremental.py').read_bytes(),(PACKAGE/'runtime/runtime_incremental.py').read_bytes())
        code="import importlib.util,sys;s=importlib.util.spec_from_file_location('installed',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.incremental_module().__name__)"
        imported=subprocess.run([sys.executable,'-I','-B','-c',code,str(current/'tools/runtime_receipt_source.py')],capture_output=True,text=True)
        self.assertEqual(imported.returncode,0,imported.stderr);self.assertEqual(imported.stdout.strip(),'r_incremental')
        stable=snapshot(current);repeated=install(PACKAGE);self.assertIn('UNCHANGED',repeated.stdout);self.assertEqual(snapshot(current),stable);self.assertEqual(snapshot(old),before)
        print('NATIVE old='+old.name+' new='+current.name+' oldRootInode='+str(old_inode)+' oldSnapshotUnchanged=True repeat=UNCHANGED helperImported=True',flush=True)

    def test_native_install_from_b35_preserves_old_release_and_repeats(self):
        self.basisArchive=Path(__file__).resolve().parents[4]/'handoff-turn-scope/source.tar'
        self.test_native_install_from_basis_preserves_old_release_and_repeats()

    def test_native_install_from_b37_preserves_old_release_and_repeats(self):
        self.basisArchive=Path(__file__).resolve().parents[4]/'handoff-b35-fixes/source.tar'
        self.test_native_install_from_basis_preserves_old_release_and_repeats()

    def registered_operator_receipt(self,second_turn):
        import copy
        self.register();second=copy.deepcopy(self.record);second['runId']='run2';second['project']=str(self.root/'second-project');Path(second['project']).mkdir();second['operator'].update(jobId='operator-two',turn=second_turn)
        second['origin']['operatorReservation']=str(self.index.parent/'reservations'/(hashlib.sha256(second['project'].encode()).hexdigest()+'.json'));second['participants']=second['participants'][:1]
        declaration=self.root/'second.json';declaration.write_text(json.dumps(second));declaration.chmod(0o600);self.m.register(self.index,declaration);attest_registered(self,second,finished_at=4000)
        ready=self.prepare();self.assertFalse(ready['failed'],ready);self.prepared=ready
        runs=self.m.core.trusted_json(ready['index'])['runs'];first=next(r for r in runs if r['runId']=='run1');record=self.m.core.trusted_json(first['record']);self.m.core.verify_record_origin(record)
        receipt=self.m.core.collect_record(record,ready['cut'],{},drop_identity=True)['receipt']
        return receipt

    def test_actual_root_registrations_keep_different_turns_of_same_session(self):
        receipt=self.registered_operator_receipt(2);self.assertEqual(receipt['status'],'observed',receipt)
        self.assertEqual((receipt['totals']['modelCalls'],receipt['totals']['inputTokens']),(7,700))
        self.assertEqual({d['source']:d for d in receipt['runtimeDiagnostics']}['master']['unboundRecords'],0)

    def test_actual_root_registrations_refuse_same_turn_in_both_runs(self):
        receipt=self.registered_operator_receipt(1)
        self.assertEqual((receipt['totals']['modelCalls'],receipt['totals']['inputTokens']),(6,600))
        self.assertEqual(receipt['status'],'incomplete')
        self.assertEqual(receipt['missing'],[dict(participant='master',reason='MIXED_RUN_TURN')])
        entries=self.m.core.trusted_json(self.prepared['index'])['runs'];second=next(r for r in entries if r['runId']=='run2')
        record=self.m.core.trusted_json(second['record']);self.m.core.verify_record_origin(record)
        other=self.m.core.collect_record(record,self.prepared['cut'],{},drop_identity=True)['receipt']
        self.assertEqual(other['missing'],[dict(participant='master',reason='MIXED_RUN_TURN')])
        self.assertTrue(all(n is None for n in other['totals'].values()))
