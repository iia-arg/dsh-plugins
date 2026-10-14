"""VOW must use its shared comparator, and must not fall back when it is missing."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import unittest

WATCH = Path(__file__).resolve().parents[1] / 'src/vypusk-okno-watch.sh'


class Wiring(unittest.TestCase):
    def test_missing_shared_checker_is_blind_and_restoring_it_is_green(self):
        with tempfile.TemporaryDirectory(prefix='copy-wiring-') as temporary:
            root = Path(temporary)
            repo = root / 'repo'
            package = repo / 'packages/fixture'
            package.mkdir(parents=True)
            (package / 'package.json').write_text(json.dumps(
                {'name': 'fixture', 'version': '1.0.0', 'files': ['x', 'CHANGELOG.md']}))
            (package / 'x').write_text('fixture\n')
            (package / 'CHANGELOG.md').write_text('## 1.0.0 — fixture\n')
            for args in [('init', '-q'), ('add', '.'),
                         ('-c', 'user.name=Fixture', '-c', 'user.email=fixture@sadik',
                          'commit', '-qm', 'fixture'), ('tag', 'fixture-v1.0.0')]:
                subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
            copy = root / 'live/fixture'
            copy.parent.mkdir()
            shutil.copytree(package, copy)
            exceptions = root / 'exceptions'
            exceptions.write_text('')
            environment = {k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}
            environment.update(VYPUSK_REPO=str(repo), VYPUSK_KORNI=str(copy.parent),
                               VYPUSK_AGENT_KORNI='', VYPUSK_INFO_KORNI='',
                               VYPUSK_SOOTVETSTVIYA='', VYPUSK_SSYLKI='',
                               VYPUSK_RASKLADKA='', VYPUSK_REESTR='', VYPUSK_TIHO='1',
                               VYPUSK_ISKLYUCHENIYA=str(exceptions),
                               VYPUSK_SOSTOYANIE=str(root / 'private-state'))

            def run():
                return subprocess.run(['bash', str(WATCH)], env=environment,
                                      capture_output=True, text=True, timeout=20)

            healthy = run()
            self.assertEqual(healthy.returncode, 0, healthy.stdout + healthy.stderr)
            environment['VYPUSK_COPY_PRIBOR'] = str(root / 'missing-checker')
            bad = run()
            self.assertEqual(bad.returncode, 2, bad.stdout + bad.stderr)
            self.assertIn('прибор', bad.stdout + bad.stderr)
            del environment['VYPUSK_COPY_PRIBOR']
            restored = run()
            self.assertEqual(restored.returncode, 0, restored.stdout + restored.stderr)
            # Actual comparator mutation: a count becomes text. VOW must report blindness,
            # not turn protocol damage into a deferrable ordinary mismatch.
            checker = WATCH.parent / 'copy-compare.sh'
            broken = root / 'broken-checker.sh'
            original = checker.read_text()
            self.assertEqual(original.count('matched=int(matched)'), 1)
            broken.write_text(original.replace('matched=int(matched)', "matched='bogus'"))
            broken.chmod(0o755)
            environment['VYPUSK_COPY_PRIBOR'] = str(broken)
            damaged = run()
            self.assertEqual(damaged.returncode, 2, damaged.stdout + damaged.stderr)
            del environment['VYPUSK_COPY_PRIBOR']
            self.assertEqual(run().returncode, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
