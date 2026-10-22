"""Actual v5 validator/reader/projection; private source identities never public."""
import copy
import importlib.util
import unittest
import test_time_usage as F
PKG=F.PKG
end=F.end

class ReceiptV5(unittest.TestCase):
    def setUp(self):
        self.f=F.TimeUsage();self.f.setUp();self.addCleanup(self.f.doCleanups)
        self.f.paths['master'].write_bytes(end(10))
        self.value=self.f.tick()['receipts']['run1'];self.m=self.f.module()

    def test_validator_checks_arithmetic_accuracy_and_window(self):
        self.assertTrue(callable(getattr(self.m,'public_receipt',None)),'finite v5 public validator is absent')
        self.assertEqual(self.m.public_receipt(self.value,'run1',project='/fixture/project'),self.value)
        for edit in ['total','accuracy','window','private']:
            bad=copy.deepcopy(self.value)
            if edit=='total':bad['totals']['modelCalls']=7
            if edit=='accuracy':bad['accuracy']='exact'
            if edit=='window':bad['graceSeconds']=601
            if edit=='private':bad['home']='/private/source'
            with self.subTest(edit=edit),self.assertRaises(ValueError):self.m.public_receipt(bad,'run1',project='/fixture/project')

    def test_timeout_stamp_requires_expired_deadline(self):
        bad=copy.deepcopy(self.value)
        bad.update(closureReason='finish_missing_timeout',notice=self.m.NOTICE+self.m.TIMEOUT_NOTICE,
                   closedAt=F.ts(10),windowEnd=F.ts(610),asOf=F.ts(100),measuredAt=F.ts(100),phase='live')
        with self.assertRaises(ValueError):self.m.public_receipt(bad,'run1')

    def test_public_windows_cannot_bypass_run_deadline(self):
        for closed,now in [(None,7201),(7300,7400)]:
            with self.subTest(closed=closed):
                bad=copy.deepcopy(self.value)
                bad.update(closedAt=F.ts(closed) if closed is not None else None,
                           windowEnd=F.ts(closed+600) if closed is not None else None,
                           asOf=F.ts(now),measuredAt=F.ts(now),phase='live')
                with self.assertRaises(ValueError):self.m.public_receipt(bad,'run1')

    def test_project_index_uses_v5_known_codex_numbers_with_approximation(self):
        import test_dashboard_ui as ui
        row=ui.ap.index_row('project/run1',{},ui.state(usageTeam=self.value),None,ui.NOW)
        self.assertIsNotNone(row['usage'],'project index lost known v5 numbers')
        html=ui.ap.render_index([row],ui.TEMPLATE.read_text(),'master',ui.NOW)
        self.assertIn('≈13',html);self.assertNotIn('≥',html)
        bad=copy.deepcopy(self.value);bad['byEngine']['codex']['inputTokens']=123
        invalid=ui.ap.index_row('project/run1',{},ui.state(usageTeam=bad),None,ui.NOW)
        self.assertIsNone(invalid['usage'])

    def test_index_projector_recovers_after_missing_module(self):
        import tempfile,shutil
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'runtime').mkdir();(root/'lib').mkdir()
            shutil.copyfile(PKG/'runtime/ap_sadik.py',root/'runtime/ap_sadik.py')
            shutil.copyfile(PKG/'lib/task_limits.py',root/'lib/task_limits.py')
            spec=importlib.util.spec_from_file_location('_time_index_recovery',root/'runtime/ap_sadik.py');ap=importlib.util.module_from_spec(spec);spec.loader.exec_module(ap)
            self.assertIsNone(ap.approximate_codex_usage(self.value,'run1')[0])
            shutil.copyfile(PKG/'runtime/time_usage.py',root/'runtime/time_usage.py')
            try:value,_=ap.approximate_codex_usage(self.value,'run1')
            except Exception as exc:self.fail('failed projector did not recover: '+repr(exc))
            self.assertIsNotNone(value);self.assertEqual(value['inputTokens'],10)

    def test_bool_is_not_a_subscription_counter(self):
        bad=copy.deepcopy(self.value);bad['bySubscription']['unknown']['modelCalls']=True
        with self.assertRaises(ValueError):self.m.public_receipt(bad,'run1')

    def test_observed_cache_components_must_equal_input(self):
        bad=copy.deepcopy(self.value)
        next(r for r in bad['rows'] if r['participant']=='master')['totals']['cacheReadTokens']=1
        bad['totals']['cacheReadTokens']=1;bad['byEngine']['codex']['cacheReadTokens']=1;bad['bySubscription']['unknown']['cacheReadTokens']=1
        with self.assertRaises(ValueError):self.m.public_receipt(bad,'run1')

    def test_previously_frozen_v5_notice_remains_readable(self):
        old=copy.deepcopy(self.value)
        old['notice']='≈ Приблизительно по времени окончания ходов; включает работу участника вне Автопилота в окне RUN.'
        self.assertEqual(self.m.public_receipt(old,'run1'),old,'a panel wording update must not invalidate a sealed v5 receipt')

    def test_existing_public_reader_accepts_v5_and_rejects_bad_sum(self):
        spec=importlib.util.spec_from_file_location('public_reader_v5_test',PKG/'runtime/team_usage.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
        try: accepted=core.public_receipt(self.value,'run1',project='/fixture/project')
        except core.Incomplete:self.fail('existing public reader rejects the new v5 receipt')
        self.assertEqual(accepted,self.value)
        bad=copy.deepcopy(self.value);bad['totals']['inputTokens']=123
        with self.assertRaises(core.Incomplete):core.public_receipt(bad,'run1',project='/fixture/project')

    def test_real_renderer_marks_approximate_and_preliminary_final(self):
        import test_dashboard_ui as ui
        for phase in ['final','live']:
            if phase=='live':
                self.f.run['closedAt']=None
                self.f.state.unlink();value=self.f.tick(100)['receipts']['run1']
            else:value=self.value
            html=ui.dashboard(ui.state(usageTeam=value))
            panel=html.split('<section class="card usage-team">',1)[1].split('</section>',1)[0]
            self.assertIn('≈',panel);self.assertNotIn('≥',panel)
            self.assertIn('итог' if phase=='final' else 'предварительно',panel.lower())
            self.assertIn('неполно',panel.lower())
            self.assertNotIn('доказанная',panel.lower())
            self.assertIn('не работавшего по run',panel.lower())

    def test_parent_only_has_approximate_numbers_without_incomplete_label(self):
        import json
        import test_dashboard_ui as ui
        sample=json.loads((PKG/'test/fixtures/claude-turn-end-v1.json').read_text())
        self.f.state.unlink()
        self.f.run.update(startedAt='2026-10-21T10:59:00Z',closedAt=None,participants=[dict(name='master',engine='claude')])
        self.f.sources['master']['engine']='claude'
        self.f.paths['master'].write_bytes((json.dumps(sample)+'\n').encode())
        value=self.m.iteration([self.f.run],self.f.sources,self.f.state,'2026-10-21T11:05:00Z')['receipts']['run1']
        self.assertEqual(value['status'],'observed');self.assertEqual(value['missing'],[])
        self.assertEqual(ui.ap.public_value(value,ui.ap.PUBLIC_TEAM_RECEIPT),value)
        self.m.public_receipt(value,'run1')
        html=ui.dashboard(ui.state(usageTeam=value));panel=html.split('<section class="card usage-team">',1)[1].split('</section>',1)[0]
        self.assertIn('≈',panel);self.assertNotIn('неполно',panel.lower());self.assertNotIn('доказанная',panel.lower())
        self.assertIn('1000',panel);self.assertIn('1150',panel)

    def test_complete_late_history_is_observed_on_real_panel(self):
        import test_dashboard_ui as ui
        self.f.state.unlink();self.m.iteration([],self.f.sources,self.f.state,F.ts(100))
        other=dict(self.f.run,runId='late',project='/late',closedAt=None,participants=[dict(name='master',engine='codex')])
        value=self.m.iteration([other],self.f.sources,self.f.state,F.ts(701))['receipts']['late']
        self.assertIsNone(value['rows'][0]['reason']);self.assertEqual(value['status'],'observed');self.m.public_receipt(value,'late')
        projected=ui.ap.public_value(value,ui.ap.PUBLIC_TEAM_RECEIPT);self.assertEqual(projected,value)
        panel=ui.dashboard(ui.state(usageTeam=value));self.assertNotIn('LATE_REGISTRATION',panel);self.assertIn('≈',panel)

    def test_removed_late_reason_is_not_in_public_allowlist(self):
        self.assertNotIn('LATE_REGISTRATION',self.m.PUBLIC_REASONS)
        bad=copy.deepcopy(self.value);bad['rows'][0].update(status='incomplete',reason='LATE_REGISTRATION')
        bad['missing'].append(dict(participant='master',reason='LATE_REGISTRATION'));bad['coverage']['codex']['missing'].append('master')
        with self.assertRaises(ValueError):self.m.public_receipt(bad,'run1')

    def test_public_type_projection_preserves_v5_accuracy_and_window(self):
        import test_dashboard_ui as ui
        projected=ui.ap.public_value(self.value,ui.ap.PUBLIC_TEAM_RECEIPT)
        self.assertEqual(projected,self.value)

    def test_installed_reader_loads_physical_time_module(self):
        import test_composition as c
        import tempfile
        from pathlib import Path
        lock,raw=c.installer.source();expected,(_,release)=c.installer.layout(Path('/fixture-only'),lock,raw)
        self.assertTrue(release/'tools/time_usage.py' in expected,'new v5 module is absent from installed layout')
        self.assertTrue(release/'tools/time_collection.py' in expected,'new collector module is absent from installed layout')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ['tools/time_usage.py','pilot/task_limits.py','skill/tools/team_usage.py']:
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(expected[release/name][2])
            spec=importlib.util.spec_from_file_location('physical_time_public_reader',root/'skill/tools/team_usage.py');core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
            self.assertEqual(core.public_receipt(self.value,'run1',project='/fixture/project'),self.value)

if __name__=='__main__':unittest.main()
