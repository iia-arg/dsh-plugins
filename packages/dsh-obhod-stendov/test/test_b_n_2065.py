"""B-N-2065: real SMV/admission and real filesystem permissions on private data.

Root, isolated mount/net namespaces required. Run with --source-bundle <bundle
containing master and historical tags>. No production files/services are changed.
The only service double supplies read-only User/LoadState for the private probe.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
STENDY = PKG / 'dorabotki/stendy'
SOURCE = Path('/opt/iskra/workspace/dsh-plugins')


class Regression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid() != 0 or os.environ.get('BN2065_PRIVATE_NS') != '1':
            raise RuntimeError('root/private namespaces required; use this file launcher')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bn2065-case-')
        self.addCleanup(self.temp.cleanup)
        self.w = Path(self.temp.name)
        self.w.chmod(0o755)

    def stand(self, name, *args):
        env = dict(os.environ, SMV_TOOL='/usr/local/sbin/smontirovat-vypusk',
                   MO_STATE_DIR=str(self.w/'windows'), SMV_ZAMOK=str(self.w/'lock'),
                   SMV_MONTAZH=str(self.w/'backups'), SMV_REESTR_PL=str(self.w/'registry.json'))
        (self.w/'windows').mkdir(exist_ok=True, mode=0o755)
        (self.w/'registry.json').write_text('{"plugins":[],"services":[]}')
        p = subprocess.run(['bash', str(STENDY/name), *args], env=env,
                           capture_output=True, text=True, timeout=120)
        print('STAND', name, 'exit', p.returncode, '\n'+p.stdout+p.stderr, flush=True)
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)

    def test_args_reaches_valid_install(self):
        self.stand('stend-smontirovat-vypusk-args.sh')

    def test_git_reaches_accounting_and_locked_index(self):
        self.stand('stend-smontirovat-vypusk-git.sh')

    def test_modes_reach_chmod_corruption_and_owner_retry(self):
        self.stand('stend-smontirovat-vypusk-rezhimy.sh')

    def test_insurance_reaches_rollback_and_corruption(self):
        self.stand('stend-smontirovat-vypusk-strahovka.sh')

    def test_atomic_healthy_and_two_syscall_failures_return(self):
        for case in ('healthy', 'copy_failure', 'publish_failure'):
            with self.subTest(case=case):
                p = subprocess.run([sys.executable, '-B', str(STENDY/'smv-atomic-probe.py'),
                                    '/usr/local/sbin/smontirovat-vypusk', case],
                                   capture_output=True, text=True, timeout=90)
                print('ATOMIC', case, p.returncode, '\n'+p.stdout+p.stderr, flush=True)
                self.assertEqual(p.returncode, 0, p.stdout+p.stderr)

    def private_install(self):
        sys.path.insert(0, str(STENDY))
        from smv_fixture import prepare
        source = self.w/'source'
        package = source/'packages/fixture'
        package.mkdir(parents=True)
        (package/'package.json').write_text('{"name":"fixture","version":"1.0.0","files":["x"]}\n')
        (package/'x').write_text('new\n')
        for command in [('init', '-q'), ('add', '.'), ('-c', 'user.name=Fixture', '-c', 'user.email=f@s', 'commit', '-qm', 'fixture')]:
            subprocess.run(['git', '-C', str(source), *command], check=True, capture_output=True)
        target = self.w/'live'
        target.mkdir()
        (target/'x').write_text('old\n')
        # setUp's root is traversable for nobody tests; SMV needs private WORK.
        self.w.chmod(0o700)
        tool, env = prepare(self.w, Path('/usr/local/sbin/smontirovat-vypusk'), 'HEAD',
                            'packages/fixture', target, source)
        self.tool, self.env, self.target = tool, env, target
        return prepare, source

    def install(self):
        self.attempt = getattr(self, 'attempt', 0)+1
        p = subprocess.run(['bash', str(self.tool), 'HEAD', 'packages/fixture',
                            str(self.target), '--v-boj', 'B-N-2065-REGRESSION-'+str(self.attempt)],
                           env=self.env, capture_output=True, text=True, timeout=30)
        print('ADMISSION', p.returncode, '\n'+p.stdout+p.stderr, flush=True)
        return p

    def test_real_admission_refuses_missing_mapping_then_returns(self):
        prepare, source = self.private_install()
        self.assertEqual(self.install().returncode, 0)
        (self.target/'x').write_text('old\n')
        self.tool,self.env = prepare(self.w, Path('/usr/local/sbin/smontirovat-vypusk'),
                                     'HEAD','packages/fixture',self.target,source)
        registry = Path(self.env['SMV_REESTR_PL'])
        original = registry.read_bytes()
        before = hashlib.sha256(original).hexdigest()
        registry.write_text('{"plugins":[],"services":[]}\n')
        after = hashlib.sha256(registry.read_bytes()).hexdigest()
        print('DAMAGE missing entry', before, '->', after, 'removed=1', flush=True)
        self.assertNotEqual(before, after)
        bad = self.install()
        self.assertEqual(bad.returncode, 2)
        self.assertIn('copy registry/root ownership is missing or ambiguous', bad.stderr)
        self.assertEqual((self.target/'x').read_text(), 'old\n')
        registry.write_bytes(original)
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual((self.target/'x').read_text(), 'new\n')

    def test_real_admission_refuses_foreign_root_then_returns(self):
        prepare, source = self.private_install()
        self.assertEqual(self.install().returncode, 0)
        (self.target/'x').write_text('old\n')
        self.tool,self.env = prepare(self.w, Path('/usr/local/sbin/smontirovat-vypusk'),
                                     'HEAD','packages/fixture',self.target,source)
        registry = Path(self.env['SMV_REESTR_PL'])
        original = registry.read_bytes()
        wrong = self.w/'wrong'
        wrong.mkdir()
        data = json.loads(original)
        data['plugins'][0]['path'] = str(wrong)
        registry.write_text(json.dumps(data))
        print('DAMAGE foreign root', hashlib.sha256(original).hexdigest(), '->',
              hashlib.sha256(registry.read_bytes()).hexdigest(), 'replaced=1', flush=True)
        bad = self.install()
        self.assertEqual(bad.returncode, 2)
        self.assertIn('copy registry/root ownership is missing or ambiguous', bad.stderr)
        self.assertEqual((self.target/'x').read_text(), 'old\n')
        registry.write_bytes(original)
        self.assertEqual(self.install().returncode, 0)

    def test_fixture_rejects_external_or_symlink_target(self):
        prepare, source = self.private_install()
        with tempfile.TemporaryDirectory(prefix='bn2065-outside-') as outside:
            marker = Path(outside)/'marker'
            marker.write_text('untouched\n')
            link = self.w/'link'
            link.symlink_to(outside, target_is_directory=True)
            for target in (Path(outside), link):
                with self.subTest(target=str(target)), self.assertRaises(ValueError):
                    prepare(self.w, Path('/usr/local/sbin/smontirovat-vypusk'), 'HEAD',
                            'packages/fixture', target, source)
            self.assertEqual(marker.read_text(), 'untouched\n')

    def test_fixture_paths_and_metadata_are_private_under_umask_002(self):
        old = os.umask(0o002)
        try:
            self.private_install()
        finally:
            os.umask(old)
        for key in ('SMV_MONTAZH', 'SMV_ZAMOK', 'MO_STATE_DIR', 'SMV_REESTR_PL', 'MO_COPY_CONFIG', 'MO_DEREVO_REPO', 'npm_config_cache'):
            self.assertTrue(Path(self.env[key]).resolve().is_relative_to(self.w))
        for key in ('SMV_REESTR_PL', 'MO_COPY_CONFIG'):
            self.assertEqual(Path(self.env[key]).stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.install().returncode, 0)

    def copy_fixture(self):
        self.m = self.w/'var/backups/montazh'
        self.m.mkdir(parents=True, mode=0o750)
        home = self.w/'home/claude'
        home.mkdir(parents=True, mode=0o750)
        # Real kernel permissions; allow legal test readers to get ENOENT.
        subprocess.run(['setfacl', '-m', 'u:iskra:rx,u:avrora:rx,u:coders:rx', str(home)], check=True)
        z = self.w/'var/lib/zadaniya-prervany-watch'
        z.mkdir(parents=True, mode=0o750)
        (z/'dlya-zabavy-zadaniya-prervany.md').write_text('fixture only\n')
        (self.w/'tmp').mkdir()
        self.bin = self.w/'bin'
        self.bin.mkdir()
        systemctl = self.bin/'systemctl'
        systemctl.write_text('#!/bin/sh\ncase "$*" in *LoadState*) echo loaded ;; *User*) echo root ;; *) exit 99 ;; esac\n')
        systemctl.chmod(0o755)
        self.sample = self.m/'current sample.db'
        self.sample.write_text('NOT-A-SECRET-FIXTURE\n')
        self.sample.chmod(0o600)

    def probe(self):
        env = dict(os.environ, PATH=str(self.bin)+os.pathsep+os.environ['PATH'])
        p = subprocess.run(['bash', str(STENDY/'proba-kopij.sh'), '--koren', str(self.w)],
                           env=env, capture_output=True, text=True, timeout=30)
        print('COPY PROBE', p.returncode, '\n'+p.stdout+p.stderr, flush=True)
        self.assertNotIn('NOT-A-SECRET-FIXTURE', p.stdout+p.stderr)
        return p

    def test_current_sample_replaces_absent_historical_snapshot(self):
        self.copy_fixture()
        p = self.probe()
        self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertIn(str(self.sample), p.stdout)

    def test_empty_root_is_blind(self):
        self.copy_fixture()
        self.sample.unlink()
        self.assertEqual(self.probe().returncode, 3)

    def test_sample_disappears_after_inventory_is_blind(self):
        self.copy_fixture()
        # Only interpose root enumeration, then remove the REAL selected file.
        sudo = self.bin/'sudo'
        sudo.write_text('#!/usr/bin/python3\nimport os,subprocess,sys\na=sys.argv[1:]\np=subprocess.run(["/usr/bin/sudo",*a])\nif a==["-n","find",'+repr(str(self.m))+',"-xdev","-type","f","-print0"]:\n os.unlink('+repr(str(self.sample))+')\nsys.exit(p.returncode)\n')
        sudo.chmod(0o755)
        self.assertEqual(self.probe().returncode, 3)
        self.assertFalse(self.sample.exists())

    def test_permission_leak_and_return(self):
        self.copy_fixture()
        healthy = self.probe()
        before = hashlib.sha256(self.sample.read_bytes()).hexdigest()
        self.m.chmod(0o755)
        self.sample.chmod(0o644)
        print('DAMAGE real permissions', str(self.sample), '0600->0644; root 0750->0755; content_sha', before, flush=True)
        bad = self.probe()
        self.assertEqual(bad.returncode, 1, bad.stdout+bad.stderr)
        self.assertIn('КРАСНОЕ dostup nobody read '+str(self.sample)+': ПРОШЁЛ', bad.stdout)
        self.m.chmod(0o750)
        self.sample.chmod(0o600)
        self.assertEqual(self.probe().returncode, 0)
        self.assertEqual(healthy.returncode, 0)

    def test_inventory_error_is_blind_even_with_partial_output(self):
        self.copy_fixture()
        sudo = self.bin/'sudo'
        sudo.write_text('#!/usr/bin/python3\nimport subprocess,sys\na=sys.argv[1:]\np=subprocess.run(["/usr/bin/sudo",*a])\nif a==["-n","find",'+repr(str(self.m))+',"-xdev","-type","f","-print0"]: sys.exit(1)\nsys.exit(p.returncode)\n')
        sudo.chmod(0o755)
        self.assertEqual(self.probe().returncode, 3)

    def test_failed_nobody_command_is_blind_not_permission_denied(self):
        self.copy_fixture()
        sudo = self.bin/'sudo'
        sudo.write_text('#!/usr/bin/python3\nimport os,sys\na=sys.argv[1:]\nif a[:4]==["-n","-u","nobody","python3"]:sys.exit(77)\nos.execv("/usr/bin/sudo",["/usr/bin/sudo",*a])\n')
        sudo.chmod(0o755)
        self.assertEqual(self.probe().returncode, 3)

    def test_filename_with_newline_is_one_inventory_item(self):
        self.copy_fixture()
        changed = self.sample.with_name('current\nобразец.db')
        self.sample.rename(changed)
        self.sample = changed
        p = self.probe()
        self.assertEqual(p.returncode, 0)
        self.assertIn('nobody читает 0 из 1', p.stdout)

    def test_mest_kopij_wrapper_real_probe_green_red_blind(self):
        self.copy_fixture()
        bridge = self.w/'probe-root.sh'
        import shlex
        bridge.write_text('#!/bin/bash\n[ "$#" = 1 ] && [ "$1" = --boj ] || exit 99\nexec bash '+
                          shlex.quote(str(STENDY/'proba-kopij.sh'))+' --koren '+shlex.quote(str(self.w))+'\n')
        env = dict(os.environ, PATH=str(self.bin)+os.pathsep+os.environ['PATH'],
                   PROBA_MEST_KOPIJ=str(bridge))
        def wrapper():
            p = subprocess.run(['bash', str(STENDY/'stend-mest-kopij.sh')], env=env,
                               capture_output=True, text=True, timeout=30)
            print('MEST WRAPPER',p.returncode,p.stdout+p.stderr,flush=True)
            return p.returncode
        self.assertEqual(wrapper(), 0)
        self.m.chmod(0o755)
        self.sample.chmod(0o644)
        self.assertEqual(wrapper(), 1)
        self.m.chmod(0o750)
        self.sample.chmod(0o600)
        self.assertEqual(wrapper(), 0)
        self.sample.unlink()
        self.assertEqual(wrapper(), 2)


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--source-bundle', type=Path)
    parser.add_argument('--inside', action='store_true')
    parser.add_argument('tests', nargs='*')
    args = parser.parse_args()
    if args.inside:
        unittest.main(argv=[sys.argv[0], *(args.tests or ['Regression'])], verbosity=2)
        return
    if os.geteuid() != 0 or args.source_bundle is None:
        parser.error('root and --source-bundle are required')
    with tempfile.TemporaryDirectory(prefix='bn2065-namespace-') as temporary:
        root = Path(temporary)
        source = root/'source'
        subprocess.run(['git', 'clone', '--quiet', str(args.source_bundle.resolve()), str(source)], check=True)
        script = root/'namespace.sh'
        import shlex
        script.write_text('set -euo pipefail\nmount --make-rprivate /\nmount --bind '+shlex.quote(str(source))+' '+str(SOURCE)+'\nmount -o remount,bind,ro '+str(SOURCE)+'\nexport BN2065_PRIVATE_NS=1\nexec '+shlex.join([sys.executable, '-B', str(Path(__file__).resolve()), '--inside', *args.tests])+'\n')
        p = subprocess.run(['unshare', '--mount', '--net', '--fork', 'bash', str(script)])
        sys.exit(p.returncode)


if __name__ == '__main__':
    main()
