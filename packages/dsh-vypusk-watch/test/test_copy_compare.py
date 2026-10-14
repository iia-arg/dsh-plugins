"""Shared copy checker contract: actual files, not a model of the checker."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
CHECKER = PKG / 'src/copy-compare.sh'


class CopyComparison(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='copy-comparison-')
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        (self.source / 'src').mkdir()
        (self.source / 'package.json').write_text(json.dumps(
            {'name': 'copy-fixture', 'version': '1.0.0', 'files': ['src', 'CHANGELOG.md']}))
        (self.source / 'src/main.js').write_text('const value = 1;\n')
        (self.source / 'CHANGELOG.md').write_text('## 1.0.0\n\n- Fixture release.\n')
        self.copy = self.root / 'copy'
        shutil.copytree(self.source, self.copy)
        self.exceptions = self.root / 'exceptions.json'
        self.exceptions.write_text('{}')

    def tearDown(self):
        self.tmp.cleanup()

    def compare(self, policy=0, extra=()):
        # A missing production checker is an expected RED, not a missing-file error in the test runner.
        result = subprocess.run(['bash', str(CHECKER), '--source', str(self.source),
                                 '--copy', str(self.copy), '--name', 'copy-fixture',
                                 '--version', '1.0.0', '--published-only', str(policy),
                                 '--exceptions', str(self.exceptions), *extra],
                                capture_output=True, text=True, timeout=20)
        self.assertIn(result.returncode, [0, 1, 2], result.stderr)
        if result.returncode == 127:
            self.fail('shared production copy checker is not implemented')
        return result, json.loads(result.stdout)

    def test_healthy_copy_and_changed_bytes_and_restore(self):
        result, data = self.compare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((data['matched'], data['total']), (3, 3))
        file = self.copy / 'src/main.js'
        old = file.read_bytes()
        before = hashlib.sha256(old).hexdigest()
        file.write_bytes(old + b'corruption\n')
        after = hashlib.sha256(file.read_bytes()).hexdigest()
        self.assertNotEqual(before, after)
        self.assertEqual(subprocess.check_output(['grep', '-cF', 'corruption', str(file)],
                                                text=True).strip(), '1')
        print('CORRUPTION copy', before, '->', after, 'literal_count=1')
        result, data = self.compare()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(data['different'], './src/main.js')
        self.assertEqual((data['matched'], data['total']), (2, 3))
        file.write_bytes(old)
        self.assertEqual(self.compare()[0].returncode, 0)

    def test_extra_and_missing_published_file_are_strict(self):
        extra = self.copy / 'src/extra.js'
        extra.write_text('extra\n')
        result, data = self.compare()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(data['only_copy'], './src/extra.js ')
        extra.unlink()
        (self.copy / 'src/main.js').unlink()
        result, data = self.compare()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(data['only_source'], './src/main.js ')
        shutil.copyfile(self.source / 'src/main.js', self.copy / 'src/main.js')
        self.assertEqual(self.compare()[0].returncode, 0)

    def test_optional_source_file_may_be_absent_but_present_corruption_is_found(self):
        (self.source / 'notes.txt').write_text('source notes\n')
        result, data = self.compare()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(data['outside_source'], './notes.txt ')
        (self.copy / 'notes.txt').write_text('different notes\n')
        self.assertEqual(self.compare()[0].returncode, 1)
        self.assertEqual(self.compare(policy=1)[0].returncode, 0)

    def test_backup_and_node_modules_are_excluded_but_sibling_name_is_not(self):
        (self.copy / 'node_modules').mkdir()
        (self.copy / 'node_modules/x').write_text('ignored\n')
        for name in ['a.bak-1', 'a.tar', 'a.tgz']:
            (self.copy / name).write_text('ignored\n')
        self.assertEqual(self.compare()[0].returncode, 0)
        (self.copy / 'node_modules-old').mkdir()
        (self.copy / 'node_modules-old/x').write_text('real extra\n')
        self.assertEqual(self.compare()[0].returncode, 1)

    def test_empty_changelog_is_difference_and_pardon_stays_on_stderr(self):
        for path in [self.source / 'CHANGELOG.md', self.copy / 'CHANGELOG.md']:
            path.write_text('## 1.0.0\n\n')
        result, data = self.compare()
        self.assertEqual(result.returncode, 1)
        self.assertIn('CHANGELOG', data['changelog_bad'])
        self.exceptions.write_text(json.dumps({'copy-fixture@1.0.0': {
            'reason': 'fixture exception', 'owner': 'fixture', 'date': '2026-10-14'}}))
        result, data = self.compare()
        self.assertEqual(result.returncode, 0)
        self.assertIn('ПРОЩЕНО: copy-fixture@1.0.0', result.stderr)
        self.assertEqual(data['changelog_bad'], '')

    def test_published_policy_without_declared_files_is_blind(self):
        manifest = {'name': 'copy-fixture', 'version': '1.0.0'}
        for directory in [self.source, self.copy]:
            (directory / 'package.json').write_text(json.dumps(manifest))
        self.assertEqual(self.compare(policy=1)[0].returncode, 2)

    def test_unknown_arguments_refuse_without_touching_inputs(self):
        before = (self.copy / 'package.json').read_bytes()
        for flag in ['--dry-run', '-n', '--check', '--typo']:
            result = subprocess.run(['bash', str(CHECKER), flag], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 2)
            self.assertEqual((self.copy / 'package.json').read_bytes(), before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
