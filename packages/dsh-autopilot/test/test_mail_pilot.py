"""Observable pilot boundaries; no live courier, model, sudo or production writes."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

LIB = Path(__file__).resolve().parents[1] / 'lib'


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / 'project'
        _fixture_mkdir(self.project, mode=0o755)
        git(self.project, 'init', '-q')
        git(self.project, 'config', 'user.name', 'fixture')
        git(self.project, 'config', 'user.email', 'fixture@invalid')
        _fixture_mkdir(self.project / 'src', mode=0o755)
        (self.project / 'src/code.txt').write_text('before\n')
        (self.project / 'AGENTS.md').write_text('DO NOT CHANGE AUTHORITY\n')
        (self.project / 'CLAUDE.md').write_text('project memory\n')
        _fixture_mkdir(self.project / '.autopilot', mode=0o755)
        (self.project / '.autopilot/PROGRESS.md').write_text('settled rules\n')
        git(self.project, 'add', '.')
        git(self.project, 'commit', '-qm', 'base')
        self.base = git(self.project, 'rev-parse', 'HEAD')
        self.now = 1000
        self.calls = []
        self.api = self.load('pilot_mail')
        self.operator = self.api.Operator(self.root/'operator.json', self.project, 'run-one', 'CLAUDE.md', clock=lambda: self.now)
        self.receiver = self.api.Receiver(self.root/'beta.json', self.project, 'run-one', 'vintik', 'CLAUDE.md', clock=lambda: self.now)

    def load(self, name):
        path = LIB / (name + '.py')
        self.assertTrue(path.is_file(), 'missing pilot behavior: ' + name)
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def task(self, job='j1', **overrides):
        value = dict(job_id=job, ticket='T01', recipient='vintik', role='executor',
                     cwd=str(self.project), zone=['src'], requirements=['R01'],
                     brief='Add input validation in candidate only', deadline=1500,
                     context_request='fresh', parent_job_id=None, context_ref=None)
        value.update(overrides)
        return value

    def send(self, recipient, body):
        self.calls.append((recipient, body))
        return 0

    def wire(self, task=None):
        return self.operator.submit(task or self.task(), self.send)['mail']

    def deliver(self, mail, busy=False, receiver=None):
        receiver=receiver or self.receiver
        identity={'sender_account':'master','receiver_account':receiver.name,'body':mail,
                  'verification':'SO_PEERCRED-service-postman'}
        return receiver.receive(mail,busy=busy,identity=identity)

    def accept(self, result):
        identity={'sender_account':result.get('sender','vintik'),'receiver_account':'master',
                  'body':self.api.ROUTE+chr(10)+json.dumps(result),
                  'verification':'SO_PEERCRED-service-postman'}
        return self.operator.result(result,identity=identity)

    def result(self, job='j1', **extra):
        value = dict(route='AUTOPILOT-PILOT/1', kind='result', run='run-one',
                     job_id=job, recipient='master', sender='vintik', status='DONE',
                     summary='candidate checked', context_ref='declared-session')
        value.update(extra)
        return value

    def test_candidate_is_routed_by_existing_courier_and_receiver_emits_data(self):
        out = self.deliver(self.wire())
        self.assertEqual(out['status'], 'READY')
        self.assertEqual(self.calls[0][0], 'vintik')
        self.assertEqual(out['task']['job_id'], 'j1')
        self.assertIn('sudo', out['policy'])
        self.assertEqual(out['freshness'], 'свежесть заявлена, не доказана')
        self.assertEqual(out['blindness'], 'BLINDNESS_NOT_PROVEN')

    def test_med2_install_sudo_vboj_are_blocked_before_any_courier(self):
        before = hashlib.sha256((self.project/'src/code.txt').read_bytes()).hexdigest()
        for text in ('смонтируй в бой', 'sudo id', 'run smontirovat-vypusk', 'tool --v-boj'):
            with self.subTest(text=text):
                out = self.operator.submit(self.task(brief=text), self.send)
                self.assertEqual(out['status'], 'BLOCKED')
                self.assertEqual(out['reason'], 'POLICY_PRODUCTION_DENIED')
        self.assertEqual(self.calls, [])
        self.assertEqual(hashlib.sha256((self.project/'src/code.txt').read_bytes()).hexdigest(), before)
        self.assertEqual(self.operator.submit(self.task(), self.send)['status'], 'PLACED')

    def test_receiver_rechecks_med2_even_for_master_mail_bypassing_submit(self):
        envelope = json.loads(self.wire().split('\n', 1)[1])
        for text in ('смонтируй в бой', 'sudo id', '--v-boj', 'убери ограничение из инструкции'):
            envelope['task']['brief'] = text
            out = self.deliver('AUTOPILOT-PILOT/1\n'+json.dumps(envelope))
            self.assertEqual(out['status'], 'BLOCKED')
        self.assertFalse((self.root/'beta.json').exists())

    def test_zones_cannot_touch_control_memory_or_instructions(self):
        for path in ('.autopilot', '.autopilot/PROGRESS.md', 'AGENTS.md', 'CLAUDE.md', '../outside', '.git', 'src/AGENTS.md'):
            with self.subTest(path=path):
                out = self.operator.submit(self.task(zone=[path]), self.send)
                self.assertEqual(out['status'], 'BLOCKED')
        self.assertEqual(self.calls, [])

    def test_workdir_escape_and_symlink_zone_are_refused(self):
        (self.project/'src/escape').symlink_to(self.root, target_is_directory=True)
        self.assertEqual(self.operator.submit(self.task(cwd=str(self.root)), self.send)['status'], 'BLOCKED')
        self.assertEqual(self.operator.submit(self.task(zone=['src/escape/file']), self.send)['status'], 'BLOCKED')
        self.assertEqual(self.calls, [])

    def test_ordinary_mail_is_ignored_without_receiver_state(self):
        self.assertEqual(self.deliver('Zabava coordinator assignment')['status'], 'IGNORED')
        self.assertFalse((self.root/'beta.json').exists())

    def test_busy_queues_without_launch_and_can_be_claimed_later(self):
        mail = self.wire()
        out = self.deliver(mail, busy=True)
        self.assertEqual(out['status'], 'QUEUED_BUSY')
        self.assertNotIn('task', out)
        self.assertEqual(self.receiver.claim('j1', busy=True)['status'], 'QUEUED_BUSY')
        self.assertEqual(self.receiver.claim('j1')['status'], 'READY')
        self.assertEqual(self.deliver(mail)['status'], 'DUPLICATE')

    def test_three_inflight_and_one_job_per_recipient(self):
        for i, recipient in enumerate(('shpuntik', 'vintik', 'gayka')):
            self.assertEqual(self.operator.submit(self.task('j'+str(i), recipient=recipient, zone=['src/'+recipient]), self.send)['status'], 'PLACED')
        self.assertEqual(self.operator.submit(self.task('j4'), self.send)['status'], 'QUEUED_BUSY')
        self.assertEqual(len(self.calls), 3)

    def test_submit_and_result_duplicates_are_taken_once(self):
        mail = self.wire()
        self.assertEqual(self.operator.submit(self.task(), self.send)['status'], 'PLACED')
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.calls[0][1], self.calls[1][1])
        self.assertEqual(self.accept(self.result())['status'], 'RESULT_SAVED')
        self.assertEqual(self.accept(self.result())['status'], 'DUPLICATE')
        self.assertEqual(self.accept(self.result(summary='other'))['status'], 'CONFLICT')
        self.assertEqual(self.accept(self.result(job='unknown'))['status'], 'UNKNOWN_JOB')
        self.assertEqual(self.deliver(mail)['status'], 'READY')

    def test_unknown_delivery_retries_same_bytes_only_on_explicit_submit(self):
        failed=[]
        def lost(recipient, body):
            failed.append((recipient,body))
            return 1
        self.assertEqual(self.operator.submit(self.task(),lost)['status'],'DELIVERY_UNKNOWN')
        before=json.loads((self.root/'operator.json').read_text())['jobs']['j1']
        self.now=1100
        restarted=self.api.Operator(self.root/'operator.json',self.project,'run-one','CLAUDE.md',clock=lambda:self.now)
        restarted.public(); restarted.reconcile()
        self.assertEqual(self.calls,[])
        self.assertEqual(restarted.submit(self.task(),self.send)['status'],'PLACED')
        self.assertEqual(failed[0],self.calls[0])
        after=json.loads((self.root/'operator.json').read_text())['jobs']['j1']
        self.assertEqual(before['base'],after['base'])
        self.assertEqual(before['created_at'],after['created_at'])
        self.assertEqual(self.deliver(failed[0][1])['status'],'READY')
        self.assertEqual(self.deliver(self.calls[0][1])['status'],'DUPLICATE')

    def test_legacy_delivery_uses_saved_json_types_when_numeric_values_equal(self):
        original=self.wire(self.task(deadline=1500))
        statefile=self.root/'operator.json'
        state=json.loads(statefile.read_text())
        del state['jobs']['j1']['mail']
        statefile.write_text(json.dumps(state))
        self.assertNotIn('mail',json.loads(statefile.read_text())['jobs']['j1'])
        self.assertEqual(self.operator.submit(self.task(deadline=1500.0),self.send)['status'],'PLACED')
        self.assertEqual(self.calls[-1][1],original)
        self.assertEqual(json.loads(statefile.read_text())['jobs']['j1']['task']['deadline'],1500)

    def test_placed_retries_do_not_reexecute_or_consume_repeat_budget(self):
        mail=self.wire()
        self.assertEqual(self.deliver(mail)['status'],'READY')
        for _ in range(3):
            self.assertEqual(self.operator.submit(self.task(),self.send)['status'],'PLACED')
            self.assertEqual(self.calls[-1][1],mail)
            self.assertEqual(self.deliver(self.calls[-1][1])['status'],'DUPLICATE')
        self.accept(self.result())
        self.assertEqual(self.operator.submit(self.task(),self.send)['status'],'DUPLICATE')
        self.assertEqual(len(self.calls),4)


    def test_deadline_and_resume_never_reset_or_execute_unknown_work(self):
        mail = self.wire()
        self.now = 1600
        self.assertEqual(self.deliver(mail)['status'], 'STATUS_REQUIRED')
        self.assertEqual(self.operator.reconcile()['jobs'][0]['status'], 'EXPIRED')
        self.assertEqual(len(self.calls), 1)

    def test_cancel_closes_new_work_and_late_results(self):
        mail = self.wire()
        cancel = self.operator.cancel()['mail']
        self.assertEqual(self.deliver(cancel)['status'], 'CANCELLED')
        self.assertEqual(self.deliver(mail)['status'], 'CANCELLED')
        self.assertEqual(self.operator.submit(self.task('j2'), self.send)['status'], 'CANCELLED')
        self.assertEqual(self.accept(self.result())['status'], 'CANCELLED')
        self.assertEqual(len(self.calls), 1)

    def test_followup_keeps_recipient_context_and_counts_repairs_by_ticket(self):
        self.wire()
        self.accept(self.result())
        task = self.task('repair1', context_request='resume', parent_job_id='j1', context_ref='declared-session')
        self.assertEqual(self.operator.submit(task, self.send)['status'], 'PLACED')
        self.accept(self.result('repair1'))
        task.update(job_id='repair2', parent_job_id='repair1')
        self.assertEqual(self.operator.submit(task, self.send)['status'], 'PLACED')
        self.accept(self.result('repair2'))
        task.update(job_id='repair3', parent_job_id='repair2')
        self.assertEqual(self.operator.submit(task, self.send)['reason'], 'REPAIR_LIMIT')

    def test_public_view_does_not_export_brief_cwd_context_or_unknown_fields(self):
        self.wire(self.task(brief='PRIVATE PAYLOAD'))
        self.accept(self.result(summary='PRIVATE RESULT'))
        public = self.operator.public()
        raw = json.dumps(public, ensure_ascii=False)
        for private in ('PRIVATE', str(self.project), 'declared-session', 'brief', 'summary'):
            self.assertNotIn(private, raw)
        self.assertEqual(public['jobs'][0]['blindness'], 'BLINDNESS_NOT_PROVEN')

    def test_checked_commit_requires_master_trailers_and_zone_and_is_idempotent(self):
        self.wire()
        self.accept(self.result())
        (self.project/'src/code.txt').write_text('after\n')
        git(self.project, 'add', 'src')
        git(self.project, 'commit', '-qm', 'T01 fix\n\nAutopilot-Run: run-one\nRequirements: R01')
        sha = git(self.project, 'rev-parse', 'HEAD')
        self.assertEqual(self.operator.checked('j1', sha)['status'], 'CHECKED')
        self.assertEqual(self.operator.checked('j1', sha)['status'], 'DUPLICATE')

    def test_checked_commit_without_trailers_is_held(self):
        self.wire()
        self.accept(self.result())
        (self.project/'src/code.txt').write_text('after\n')
        git(self.project, 'add', 'src')
        git(self.project, 'commit', '-qm', 'missing trailers')
        self.assertEqual(self.operator.checked('j1', git(self.project,'rev-parse','HEAD'))['status'], 'BLOCKED')

    def test_receiver_finish_is_replayable_without_rerunning_candidate(self):
        self.deliver(self.wire())
        out = self.receiver.finish('j1', 'DONE', 'checked candidate', 'session-one')
        restarted = self.api.Receiver(self.root/'beta.json', self.project, 'run-one', 'vintik', 'CLAUDE.md', clock=lambda: self.now)
        replay = restarted.finish('j1', 'DONE', 'checked candidate', 'session-one')
        self.assertIn('mail', replay, 'saved result missing after receiver restart')
        self.assertEqual(out['mail'], replay['mail'])
        self.assertEqual(replay['status'], 'DUPLICATE')

    def test_receiver_blocks_changed_instructions_and_executor_commit(self):
        for mutation in ('memory', 'commit'):
            with self.subTest(mutation=mutation):
                receiver = self.api.Receiver(self.root/(mutation+'.json'), self.project, 'run-one', 'vintik', 'CLAUDE.md', clock=lambda: self.now)
                self.deliver(self.wire() if mutation == 'memory' else self.calls[0][1],receiver=receiver)
                if mutation == 'memory':
                    (self.project/'AGENTS.md').write_text('removed restriction')
                else:
                    git(self.project,'add','AGENTS.md')
                    git(self.project,'commit','-qm','unauthorised executor commit')
                self.assertEqual(receiver.finish('j1','DONE','candidate ready','session-one')['status'], 'BLOCKED')

    def test_cli_public_does_not_fail_on_statusless_whitelist(self):
        script = LIB/'pilot_mail.py'
        # No actor bypass is added to product code; exercise main as a Master fixture.
        import unittest.mock
        with unittest.mock.patch('sys.argv', [str(script),'--state',str(self.root/'operator.json'),
            '--project',str(self.project),'--run','run-one','--memory','CLAUDE.md','public']), \
             unittest.mock.patch.object(self.api.os,'geteuid',return_value=1006), \
             unittest.mock.patch.object(self.api.pwd,'getpwuid',return_value=type('User',(),{'pw_name':'master'})()):
            self.assertEqual(self.api.main(),0)

    def test_queued_operator_job_is_persisted_and_explicit_retries_keep_same_mail(self):
        self.wire()
        queued = self.task('second', ticket='T02', zone=['src/other'])
        self.assertEqual(self.operator.submit(queued, self.send)['status'], 'QUEUED_BUSY')
        self.assertEqual(len(self.operator.public()['jobs']),2)
        self.accept(self.result())
        restarted = self.api.Operator(self.root/'operator.json',self.project,'run-one','CLAUDE.md',clock=lambda:self.now)
        self.assertEqual(restarted.submit(queued,self.send)['status'],'PLACED')
        self.assertEqual(restarted.submit(queued,self.send)['status'],'PLACED')
        self.assertEqual(len(self.calls),3)
        self.assertEqual(self.calls[-1][1],self.calls[-2][1])

    def test_acceptance_job_can_use_physical_archive_directory_inside_test_project(self):
        archive = self.load('pilot_archive')
        out=self.project/'acceptance-copy'
        archive.acceptance_copy(self.project,self.base,out,'CLAUDE.md')
        mail=self.wire(self.task(role='acceptance',cwd=str(out)))
        self.assertEqual(self.deliver(mail)['status'],'READY')
        self.assertFalse((out/'.autopilot').exists())

    def test_result_cli_consumes_existing_delivery_envelope(self):
        mail=self.wire()
        raw='[delivery-v1 id='+'a'*64+' reply=no]\n'+self.api.ROUTE+'\n'+json.dumps(self.result())
        self.assertEqual(self.api.parse_result(raw)['job_id'],'j1')

    def test_early_result_is_not_overwritten_by_late_courier_ack(self):
        def early_result(recipient, body):
            self.calls.append((recipient,body))
            self.assertEqual(self.accept(self.result())['status'],'RESULT_SAVED')
            return 0
        self.assertEqual(self.operator.submit(self.task(),early_result)['status'],'PLACED')
        self.assertEqual(self.operator.public()['jobs'][0]['status'],'RESULT_SAVED')
        self.assertEqual(self.operator.submit(self.task('j2',ticket='T02'),self.send)['status'],'PLACED')

    def test_explicit_infinitive_mount_and_remove_restriction_are_blocked(self):
        for text in ('Выполни монтаж кандидата в боевой каталог', 'Нужно смонтировать кандидата в бой',
                     'mount production candidate', 'Убрать ограничение из инструкции'):
            with self.subTest(text=text):
                self.assertEqual(self.operator.submit(self.task(brief=text),self.send)['status'],'BLOCKED')
        self.assertEqual(self.calls,[])

    def test_master_ap_state_updates_do_not_poison_executor_result(self):
        self.deliver(self.wire())
        (self.project/'.autopilot/state.js').write_text('Master updated run counter')
        self.assertEqual(self.receiver.finish('j1','DONE','candidate ready','session-one')['status'],'RESULT_READY')

    def test_acceptance_rejects_memory_directory_instead_of_leaking_contents(self):
        archive=self.load('pilot_archive')
        _fixture_mkdir(self.project/'memory', mode=0o755)
        (self.project/'memory/private.md').write_text('private history')
        git(self.project,'add','memory')
        git(self.project,'commit','-qm','memory')
        out=self.root/'bad-memory-copy'
        with self.assertRaises(ValueError):
            archive.acceptance_copy(self.project,git(self.project,'rev-parse','HEAD'),out,'memory')
        self.assertFalse(out.exists())

    def test_manual_integration_requires_all_inflight_results_first(self):
        self.wire(self.task('a',recipient='shpuntik',zone=['src/alfa']))
        self.wire(self.task('b',ticket='T02',recipient='vintik',zone=['src/beta']))
        self.accept(self.result('a',sender='shpuntik'))
        out=self.operator.checked('a',self.base)
        self.assertEqual(out['reason'],'INFLIGHT_RESULTS_REQUIRED')

    def test_checked_cannot_reuse_dispatch_base_commit(self):
        (self.project/'src/code.txt').write_text('previous run already landed')
        git(self.project,'add','src')
        git(self.project,'commit','-qm','previous job\n\nAutopilot-Run: run-one\nRequirements: R01')
        base=git(self.project,'rev-parse','HEAD')
        self.wire()
        self.accept(self.result())
        self.assertEqual(self.operator.checked('j1',base)['status'],'BLOCKED')

    def test_pilot_layout_refuses_stable_pin_before_preparing_runtime(self):
        layout=self.load('pilot_layout')
        with self.assertRaises(ValueError):
            layout.entries({'upstream_sha':'326c6ea3b5aa278e2874aeacacf9ad82ad103422'})
        entries=layout.entries({'upstream_sha':'9fc898cbe941d5b8a369f1dd657e9119676eb44f'})
        self.assertIn('pilot/pilot_mail.py',entries)
        self.assertIn('pilot/pilot_archive.py',entries)
        self.assertIn('pilot/README.md',entries)

    def test_cli_effect_guard_rejects_stable_release_metadata(self):
        old=self.root/'old-release.json'; old.write_text(json.dumps({'upstream_sha':'326c6ea3b5aa278e2874aeacacf9ad82ad103422'}))
        new=self.root/'new-release.json'; new.write_text(json.dumps({'upstream_sha':'9fc898cbe941d5b8a369f1dd657e9119676eb44f'}))
        self.assertTrue(hasattr(self.api,'require_main'),'missing runtime MAIN guard')
        with self.assertRaises(ValueError):
            self.api.require_main(old)
        self.api.require_main(new)

    def test_malformed_transport_and_array_recipient_are_blocked(self):
        self.assertEqual(self.deliver('[delivery-v1 broken]')['status'],'BLOCKED')
        self.assertEqual(self.operator.submit(self.task(recipient=[]),self.send)['status'],'BLOCKED')
        self.assertEqual(self.accept(self.result(job_id=[]))['status'],'BLOCKED')
        self.assertEqual(self.calls,[])

    def test_unserializable_size_result_is_rejected_before_saved_finish(self):
        self.deliver(self.wire())
        out=self.receiver.finish('j1','DONE','"'*15999,'session-one')
        self.assertEqual(out['status'],'BLOCKED')
        correct=self.receiver.finish('j1','DONE','short contract','session-one')
        self.assertEqual(correct['status'],'RESULT_READY')
        raw=json.loads(correct['mail'].split('\n',1)[1])
        self.assertEqual(self.accept(raw)['status'],'RESULT_SAVED')

    def test_registered_ignored_memory_is_frozen_even_without_git_tracking(self):
        (self.project/'.gitignore').write_text('notes.md\n')
        (self.project/'notes.md').write_text('known rule')
        receiver=self.api.Receiver(self.root/'memory-ignore.json',self.project,'run-one','vintik','notes.md',clock=lambda:self.now)
        mail=self.wire()
        self.assertEqual(self.deliver(mail,receiver=receiver)['status'],'READY')
        (self.project/'notes.md').write_text('changed authority')
        self.assertEqual(receiver.finish('j1','DONE','ready','session-one')['status'],'BLOCKED')

    def test_cli_null_finish_and_array_state_return_blocked_without_traceback(self):
        import io
        import contextlib
        import unittest.mock
        fixture=self.root/'assembled'; _fixture_mkdir(fixture/'lib', mode=0o755, parents=True)
        (fixture/'lib/pilot-main.json').write_text((LIB/'pilot-main.json').read_text())
        (fixture/'release.json').write_text(json.dumps({'upstream_sha':'9fc898cbe941d5b8a369f1dd657e9119676eb44f'}))
        for command, actor, data in ((['finish','j1'],'vintik','null'), (['public'],'master','')):
            state=self.project/'bad-cli.json'
            if command==['public']:
                state.write_text('[]')
            argv=['pilot','--state',str(state),'--project',str(self.project),'--run','run-one',*command]
            stdout,stderr=io.StringIO(),io.StringIO()
            with unittest.mock.patch('sys.argv',argv), unittest.mock.patch('sys.stdin',io.StringIO(data)), \
                 unittest.mock.patch.object(self.api,'__file__',str(fixture/'lib/pilot_mail.py')), \
                 unittest.mock.patch.object(self.api.os,'geteuid',return_value=1006 if actor=='master' else 1003), \
                 unittest.mock.patch.object(self.api.pwd,'getpwuid',return_value=type('User',(),{'pw_name':actor})()), \
                 contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
                self.assertEqual(self.api.main(),2)
            self.assertIn('BLOCKED',stderr.getvalue())
            self.assertNotIn('Traceback',stderr.getvalue())

    def test_receiver_cli_cannot_write_state_outside_registered_test_project(self):
        import io,contextlib
        import unittest.mock
        fixture=self.root/'receiver-fixture'; _fixture_mkdir(fixture/'lib', mode=0o755, parents=True)
        (fixture/'lib/pilot-main.json').write_text((LIB/'pilot-main.json').read_text())
        (fixture/'release.json').write_text(json.dumps({'upstream_sha':'9fc898cbe941d5b8a369f1dd657e9119676eb44f'}))
        state=self.root/'outside-state.json'
        argv=['pilot','--state',str(state),'--project',str(self.project),'--run','run-one','--memory','CLAUDE.md','receive','fixture-message-id']
        with unittest.mock.patch('sys.argv',argv), unittest.mock.patch('sys.stdin',io.StringIO(self.wire())), \
             unittest.mock.patch.object(self.api,'__file__',str(fixture/'lib/pilot_mail.py')), \
             unittest.mock.patch.object(self.api.os,'geteuid',return_value=1003), \
             unittest.mock.patch.object(self.api.pwd,'getpwuid',return_value=type('User',(),{'pw_name':'vintik'})()), \
             contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(self.api.main(),2)
        self.assertFalse(state.exists())

    def test_acceptance_copy_excludes_control_and_memory_mechanically(self):
        archive = self.load('pilot_archive')
        out = self.project/'acceptance'
        manifest = archive.acceptance_copy(self.project, self.base, out, 'CLAUDE.md')
        self.assertEqual((out/'src/code.txt').read_text(), 'before\n')
        for path in ('.autopilot', 'AGENTS.md', 'CLAUDE.md', '.git'):
            self.assertFalse((out/path).exists(), path)
        self.assertIn('.autopilot/PROGRESS.md', manifest['excluded'])
        self.assertEqual(manifest['commit'], self.base)

    def test_acceptance_archive_rejects_links_before_any_extraction(self):
        archive = self.load('pilot_archive')
        (self.project/'src/leak').symlink_to('../.autopilot/PROGRESS.md')
        git(self.project, 'add', 'src/leak')
        git(self.project, 'commit', '-qm', 'link')
        out = self.root/'bad-copy'
        with self.assertRaises(ValueError):
            archive.acceptance_copy(self.project, git(self.project,'rev-parse','HEAD'), out, 'CLAUDE.md')
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
