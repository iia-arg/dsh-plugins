"""Black-box wrapper boundaries; miniature real unittest modules, no fake runner."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
FILES = ('test_composition.py', 'test_g4.py', 'test_install.py', 'test_mail_pilot.py',
         'test_part_b_layout.py', 'test_pilot_scope_limits.py', 'test_privileged.py', 'test_sadik.py')
GOOD = "import unittest\nclass Probe(unittest.TestCase):\n    def test_probe(self): self.assertTrue(True)\n"

@unittest.skipUnless(os.geteuid() == 0, 'root fixture and operator UID required')
class WrapperBoundary(unittest.TestCase):
    def fixture(self):
        tmp = tempfile.TemporaryDirectory(prefix='ap-wrapper-probe-')
        self.addCleanup(tmp.cleanup)
        package = Path(tmp.name) / 'package'
        shutil.copytree(PACKAGE, package, ignore=shutil.ignore_patterns('__pycache__'))
        for name in FILES:
            (package / 'test' / name).write_text(GOOD)
        return package

    def run_wrapper(self, package):
        q = subprocess.run(['bash', str(package / 'test/stend-dsh-autopilot.sh')],
                           capture_output=True, text=True, timeout=90)
        return q.returncode, q.stdout + q.stderr

    def test_all_declared_modules_are_run_and_denominator_is_declared(self):
        code, text = self.run_wrapper(self.fixture())
        self.assertEqual(code, 0, text)
        self.assertIn('стендов 8 · зелёных 8 · провалов 0 · слепых 0', text)
        self.assertIn('покрытие: 8 из 8', text)

    def test_missing_declared_module_is_blind_not_smaller_green_denominator(self):
        package = self.fixture(); (package / 'test/test_g4.py').unlink()
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text); self.assertIn('test_g4.py', text)
        self.assertIn('из 8', text)

    def test_failed_test_is_named_and_red(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text(GOOD.replace('test_probe', 'test_broken_2069').replace('assertTrue(True)', 'fail("damage2069")'))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 1, text); self.assertIn('test_broken_2069', text)
        self.assertIn('провалов 1', text)

    def test_runtime_fixture_has_release_manifest(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text("import os, unittest\nfrom pathlib import Path\nclass Probe(unittest.TestCase):\n    def test_manifest(self): self.assertTrue((Path(os.environ['AUTOPILOT_TEST_SKILL']).parent / 'release.json').is_file())\n")
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 0, text)

    def test_worker_gets_required_node(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text("import shutil, unittest\nclass Probe(unittest.TestCase):\n    def test_node(self): self.assertIsNotNone(shutil.which('node'))\n")
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 0, text)

    def test_silent_exit_zero_is_not_counted_as_executed(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text('import os; os._exit(0)\n')
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text)
        self.assertIn('test_g4.py', text)

    def test_missing_socket_tool_is_blind_before_test_execution(self):
        package = self.fixture(); bins = package / 'no-ss-bin'; _fixture_mkdir(bins, mode=0o755)
        for command in ('sudo', 'git', 'node', 'groupadd', 'usermod', 'setpriv', 'bash', 'getent'):
            (bins / command).symlink_to(shutil.which(command))
        script = package / 'test/stend-dsh-autopilot.sh'
        rows = script.read_text().splitlines(True)
        rows = ["SEARCH_PATH = " + repr(str(bins)) + "\n" if row.startswith('SEARCH_PATH = ') else row for row in rows]
        script.write_text(''.join(rows))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text)
        self.assertIn('нет команды ss', text)

    def test_expected_failure_is_blind(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text(GOOD.replace('    def test_probe', '    @unittest.expectedFailure\n    def test_probe').replace('assertTrue(True)', 'fail("expected failure probe")'))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text)
        self.assertIn('слепых 1', text)

    def test_unexpected_success_is_blind(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text(GOOD.replace('    def test_probe', '    @unittest.expectedFailure\n    def test_probe'))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text)
        self.assertIn('слепых 1', text)

    def test_one_shared_deadline_stops_current_and_remaining_files(self):
        package = self.fixture()
        script = package / 'test/stend-dsh-autopilot.sh'
        rows = script.read_text().splitlines(True)
        self.assertEqual(sum(row.startswith('LIMIT = ') for row in rows), 1)
        script.write_text(''.join('LIMIT = 2\n' if row.startswith('LIMIT = ') else row for row in rows))
        for name, seconds in [('test_composition.py', 0.6), ('test_g4.py', 1.6)]:
            (package / 'test' / name).write_text(GOOD.replace('import unittest', 'import time, unittest').replace('self.assertTrue(True)', 'time.sleep('+str(seconds)+'); print("SECOND_TEST_FINISHED", flush=True)' if name == 'test_g4.py' else 'time.sleep('+str(seconds)+')'))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text)
        self.assertIn('общий предел', text)
        self.assertIn('test_g4.py', text)
        self.assertNotIn('СТЕНД test_install.py', text)
        self.assertNotIn('SECOND_TEST_FINISHED', text)
        self.assertIn('покрытие: 1 из 8', text)

    def test_skip_is_blind(self):
        package = self.fixture()
        (package / 'test/test_g4.py').write_text(GOOD.replace('assertTrue(True)', 'skipTest("missing prerequisite")'))
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text); self.assertIn('test_g4.py', text)

    def test_empty_declared_list_is_blind(self):
        package = self.fixture()
        script = package / 'test/stend-dsh-autopilot.sh'
        text = script.read_text()
        self.assertEqual(text.count('DECLARED = ('), 1)
        script.write_text(text.replace('DECLARED = (', 'DECLARED = ()\nUNUSED = (', 1))
        code, output = self.run_wrapper(package)
        self.assertEqual(code, 2, output)
        self.assertIn('объявленный список тестов пуст', output)

    def test_empty_test_module_is_blind(self):
        package = self.fixture(); (package / 'test/test_g4.py').write_text('# no tests\n')
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text); self.assertIn('test_g4.py', text)

    def test_new_undeclared_module_is_not_silently_omitted(self):
        package = self.fixture(); (package / 'test/test_new_2069.py').write_text(GOOD)
        code, text = self.run_wrapper(package)
        self.assertEqual(code, 2, text); self.assertIn('test_new_2069.py', text)

if __name__ == '__main__':
    unittest.main(verbosity=2)
