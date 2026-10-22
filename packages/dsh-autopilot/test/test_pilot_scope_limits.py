"""Regression boundaries P1/P2/P3/P4; only disposable Git projects, no courier."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import fcntl
import contextlib
import io
import json
import runpy
import subprocess
import sys
import unittest
from unittest import mock

import test_mail_pilot as fixture

git, LIB = fixture.git, fixture.LIB


class ScopeLimitsTests(unittest.TestCase):
    def setUp(self):
        self.case = fixture.PilotTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)

    def test_checked_rejects_protected_or_outside_first_commit(self):
        c = self.case
        for path in ('AGENTS.md', 'CLAUDE.md', '.autopilot/PROGRESS.md', '.env', 'outside.txt'):
            with self.subTest(path=path):
                git(c.project, 'reset', '--hard', c.base)
                job = 'j' + str(len(c.calls))
                c.wire(c.task(job=job))
                c.accept(c.result(job=job))
                (c.project / path).write_text('first outside zone\n')
                git(c.project, 'add', path)
                git(c.project, 'commit', '-qm', 'first protected/outside')
                (c.project / 'src/code.txt').write_text('second inside zone\n')
                git(c.project, 'add', 'src/code.txt')
                git(c.project, 'commit', '-qm', 'second\n\nAutopilot-Run: run-one\nRequirements: R01')
                out = c.operator.checked(job, git(c.project, 'rev-parse', 'HEAD'))
                self.assertEqual(out, {'status': 'BLOCKED', 'reason': 'ZONE_MISMATCH'})

    def test_checked_accepts_two_commits_within_zone(self):
        c = self.case
        c.wire(); c.accept(c.result())
        for n in (1, 2):
            (c.project / 'src/code.txt').write_text(str(n))
            git(c.project, 'add', 'src')
            git(c.project, 'commit', '-qm', 'inside\n\nAutopilot-Run: run-one\nRequirements: R01')
        self.assertEqual(c.operator.checked('j1', git(c.project, 'rev-parse', 'HEAD'))['status'], 'CHECKED')

    def test_checked_rejects_protected_rename_into_zone(self):
        c = self.case
        c.wire(); c.accept(c.result())
        git(c.project, 'mv', 'AGENTS.md', 'src/notes.txt')
        git(c.project, 'commit', '-qm', 'move protected instructions into zone')
        (c.project / 'src/code.txt').write_text('second inside zone\n')
        git(c.project, 'add', 'src/code.txt')
        git(c.project, 'commit', '-qm', 'second\n\nAutopilot-Run: run-one\nRequirements: R01')
        out = c.operator.checked('j1', git(c.project, 'rev-parse', 'HEAD'))
        self.assertEqual(out, {'status': 'BLOCKED', 'reason': 'ZONE_MISMATCH'})

    def test_archive_outside_project_is_blocked_without_files(self):
        c = self.case
        archive = c.load('pilot_archive')
        out = c.root / 'outside-copy'
        with self.assertRaisesRegex(ValueError, 'outside'):
            archive.acceptance_copy(c.project, c.base, out)
        self.assertFalse(out.exists())

    def test_archive_higher_ancestor_link_outside_is_blocked(self):
        c = self.case
        external = c.root / 'external'
        _fixture_mkdir(external / 'middle', mode=0o755, parents=True)
        (c.project / 'link').symlink_to(external, target_is_directory=True)
        out = c.project / 'link/middle/copy'
        with self.assertRaisesRegex(ValueError, 'outside'):
            c.load('pilot_archive').acceptance_copy(c.project, c.base, out)
        self.assertFalse((external / 'middle/copy').exists())

    def test_archive_cli_outside_project_reports_blocked(self):
        c = self.case
        out = c.root / 'outside-cli'
        args = ['pilot_archive.py', '--project', str(c.project), '--commit', c.base,
                '--out', str(out), '--memory', 'CLAUDE.md']
        stdout = io.StringIO()
        # Stub only NSS actor name; the real nonroot fixture process runs the CLI.
        with mock.patch('sys.argv', args), mock.patch('pwd.getpwuid',
                return_value=type('User', (), {'pw_name': 'master'})()), contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(LIB / 'pilot_archive.py'), run_name='__main__')
        self.assertEqual(stopped.exception.code, 2)
        self.assertIn('BLOCKED: acceptance destination outside project', stdout.getvalue())
        self.assertFalse(out.exists())

    def test_archive_cli_refuses_control_destination_and_returns_inside(self):
        c = self.case
        for directory in ('.autopilot', '.git'):
            with self.subTest(directory=directory):
                out = c.project / directory / 'x'
                args = ['pilot_archive.py', '--project', str(c.project), '--commit', c.base,
                        '--out', str(out), '--memory', 'CLAUDE.md']
                stdout = io.StringIO()
                with mock.patch('sys.argv', args), mock.patch('pwd.getpwuid',
                        return_value=type('User', (), {'pw_name': 'master'})()), contextlib.redirect_stdout(stdout):
                    with self.assertRaises(SystemExit) as stopped:
                        runpy.run_path(str(LIB / 'pilot_archive.py'), run_name='__main__')
                self.assertEqual(stopped.exception.code, 2)
                self.assertIn('BLOCKED:', stdout.getvalue())
                self.assertFalse(out.exists())
        out = c.project / 'acceptance-copy'
        c.load('pilot_archive').acceptance_copy(c.project, c.base, out)
        self.assertEqual((out / 'src/code.txt').read_text(), 'before\n')

    def test_archive_inside_new_parent_and_skill_exclusion(self):
        c = self.case
        (c.project / 'SKILL.md').write_text('project instructions')
        (c.project / 'src/SKILL.md').write_text('nested instructions')
        git(c.project, 'add', '.')
        git(c.project, 'commit', '-qm', 'skills')
        out = c.project / 'acceptance/new/copy'
        result = c.load('pilot_archive').acceptance_copy(c.project, git(c.project, 'rev-parse', 'HEAD'), out)
        self.assertEqual(set(result['files']), {'src/code.txt'})
        self.assertFalse((out / 'SKILL.md').exists())
        self.assertFalse((out / 'src/SKILL.md').exists())
        self.assertEqual((out / 'src/code.txt').read_text(), 'before\n')

    def test_archive_hash_works_without_python311_file_digest(self):
        c = self.case
        original = hashlib.__dict__.pop('file_digest', None)
        try:
            result = c.load('pilot_archive').acceptance_copy(c.project, c.base, c.project / 'copy')
            self.assertEqual(result['files']['src/code.txt'], hashlib.sha256(b'before\n').hexdigest())
        finally:
            if original is not None:
                hashlib.file_digest = original

    def test_archive_100_mib_refused_below_70_mib_python_peak(self):
        c = self.case
        with (c.project / 'large.bin').open('wb') as f:
            f.truncate(100 * 1024 * 1024)
        git(c.project, 'add', 'large.bin')
        git(c.project, 'commit', '-qm', '100 MiB blob')
        worker = '''import importlib.util,json,resource,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('archive',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=Path(sys.argv[4])
try:
 m.acceptance_copy(sys.argv[2],sys.argv[3],out)
 reason='ACCEPTED'
except ValueError as e: reason=str(e)
print(json.dumps({'reason':reason,'created':out.exists(),'self_peak_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'child_peak_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}))
'''
        proc = subprocess.run([sys.executable, '-B', '-c', worker, str(LIB / 'pilot_archive.py'),
                               str(c.project), git(c.project, 'rev-parse', 'HEAD'), str(c.project / 'copy')],
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        measured = json.loads(proc.stdout)
        print('ARCHIVE-100MIB ' + json.dumps(measured), flush=True)
        self.assertIn('64 MiB', measured['reason'])
        self.assertFalse(measured['created'])
        self.assertLess(measured['self_peak_kib'], 70 * 1024, measured)
        self.assertLess(measured['child_peak_kib'], 70 * 1024, measured)

    def test_archive_too_many_members_never_creates_copy(self):
        c = self.case
        directory = c.project / 'many'
        _fixture_mkdir(directory, mode=0o755)
        for n in range(10001):
            (directory / str(n)).touch()
        git(c.project, 'add', 'many')
        git(c.project, 'commit', '-qm', 'too many objects')
        with self.assertRaisesRegex(ValueError, '10000 members'):
            c.load('pilot_archive').acceptance_copy(c.project, git(c.project, 'rev-parse', 'HEAD'), c.project / 'copy')
        self.assertFalse((c.project / 'copy').exists())

    def test_locked_state_returns_bounded_clear_refusal(self):
        c = self.case
        with c.operator.file.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            worker = '''import importlib.util,json,sys,time
spec=importlib.util.spec_from_file_location('pilot',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
start=time.monotonic()
try:
 m.Operator(sys.argv[2],sys.argv[3],'run-one','CLAUDE.md').public()
 reason='ACCEPTED'
except ValueError as e: reason=str(e)
print(json.dumps({'reason':reason,'elapsed':time.monotonic()-start}))
'''
            try:
                result = subprocess.run([sys.executable, '-B', '-c', worker, str(LIB / 'pilot_mail.py'),
                                         str(c.operator.file), str(c.project)], timeout=8,
                                        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except subprocess.TimeoutExpired:
                self.fail('state lock did not return bounded refusal within 8 seconds')
            self.assertEqual(result.returncode, 0, result.stderr)
            outcome = json.loads(result.stdout)
            self.assertIn('STATE_LOCK_TIMEOUT', outcome['reason'])
            self.assertLess(outcome['elapsed'], 7)
        self.assertEqual(c.operator.public()['jobs'], [])

    def test_locked_state_cli_reports_timeout_code(self):
        c = self.case
        worker = '''import importlib.util,sys
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('pilot',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.pwd.getpwuid=lambda _:SimpleNamespace(pw_name='master')
sys.argv=['pilot','--state',sys.argv[2],'--project',sys.argv[3],'--run','run-one','public']
raise SystemExit(m.main())
'''
        with c.operator.file.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            result = subprocess.run([sys.executable, '-B', '-c', worker, str(LIB / 'pilot_mail.py'),
                                     str(c.operator.file), str(c.project)], timeout=8,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('BLOCKED: STATE_LOCK_TIMEOUT', result.stderr)

    def test_memory_intermediate_link_never_reads_external_content(self):
        c = self.case
        external = c.root / 'external'
        _fixture_mkdir(external, mode=0o755)
        (external / 'note.md').write_text('synthetic public A')
        (c.project / 'link').symlink_to(external, target_is_directory=True)
        for value in ('synthetic public A', 'synthetic public B', 'synthetic public A'):
            (external / 'note.md').write_text(value)
            snapshot = c.api.control_snapshot(c.project, 'link/note.md')
            self.assertEqual(snapshot['link/note.md'], 'outside')
            self.assertNotEqual(snapshot['link/note.md'], hashlib.sha256(value.encode()).hexdigest())
        (c.project / 'link').unlink()
        _fixture_mkdir(c.project / 'link', mode=0o755)
        (c.project / 'link/note.md').write_text('inside')
        self.assertEqual(c.api.control_snapshot(c.project, 'link/note.md')['link/note.md'],
                         hashlib.sha256(b'inside').hexdigest())


if __name__ == '__main__':
    unittest.main()
