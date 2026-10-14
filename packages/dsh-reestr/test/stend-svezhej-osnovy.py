#!/usr/bin/env python3
"""Fresh-base edges: real candidate commands, substitute sources and alert sink."""
import importlib.machinery
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

BIN = Path(os.environ.get('BIN', str(Path(__file__).resolve().parents[1] / 'bin')))


class FreshBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='reestr16-fresh-')
        self.root = Path(self.tmp.name)
        self.alert = self.root / 'alert'
        self.script(self.alert, 'printf "%s\\n" "$1" >> "' + str(self.root / 'alerts') + '"\n')
        self.env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(self.root),
                    'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1',
                    'REGWD_CONF': '/dev/null', 'REGWD_STATE': str(self.root / 'state'),
                    'REGWD_ALERT': str(self.alert), 'VERIFY_CMD': 'true',
                    'HEALTH_ENABLED': '0', 'AGENTS_VERIFY_CMD': 'true',
                    'DORABOTKI_CMD': 'true', 'PEER_ENABLED': '0'}

    def tearDown(self):
        self.tmp.cleanup()

    def script(self, path, body):
        path.write_text('#!/bin/sh\n' + body)
        path.chmod(0o700)

    def wd(self, *args, **env):
        return subprocess.run(['bash', str(BIN / 'registry-watchdog.sh'), *args],
                              env={**self.env, **env}, capture_output=True, timeout=15)

    def test_unknown_and_empty_arguments_refuse_before_state_or_alert(self):
        for args in [('--dry-run',), ('-n',), ('--check',), ('',), ('--help', 'extra')]:
            with self.subTest(args=args):
                p = self.wd(*args)
                self.assertEqual(p.returncode, 2)
                self.assertFalse((self.root / 'state').exists())
                self.assertFalse((self.root / 'alerts').exists())

    def test_config_precedence_and_raw_known_drift(self):
        conf = self.root / 'conf'
        conf.write_text('VERIFY_CMD=true\n')
        conf.chmod(0o600)
        self.assertEqual(self.wd(REGWD_CONF=str(conf), VERIFY_CMD='false').returncode, 0)
        ledger = self.root / 'ledger'
        self.script(ledger, 'printf "РАСХОЖДЕНИЙ НАЙДЕНО: 1\\n-X|/tmp/fixture|deadbeef\\n"; exit 1\n')
        p = self.wd(DORABOTKI_CMD=str(ledger))
        self.assertEqual(p.returncode, 1)
        self.assertIn(b'-X|/tmp/fixture|deadbeef', (self.root / 'alerts').read_bytes())

    def test_implicit_verify_and_health_resolve_candidate_from_path(self):
        # Старое абсолютное умолчание обходит PATH-подставу. Не исполняем боевой
        # agent-plugins; этот случай на основе статически доказан и пропускается.
        source = (BIN / 'registry-watchdog.sh').read_text()
        if 'sudo -n /usr/local/bin/agent-plugins verify' in source:
            self.skipTest('absolute live default bypasses fixture PATH; do not execute it')
        fake = self.root / 'bin'
        fake.mkdir()
        self.script(fake / 'sudo', '[ "$1" != -n ] || shift\nexec "$@"\n')
        self.script(fake / 'agent-plugins', 'printf "%s\\n" "$*" >> "' + str(self.root / 'called') + '"\n'
                    + 'case "$1" in verify) exit 0;; list) printf "всего записей: 0\\n";; esac\n')
        env = {**self.env, 'PATH': str(fake) + ':' + self.env['PATH'], 'HEALTH_ENABLED': '1'}
        env.pop('VERIFY_CMD')
        p = subprocess.run(['bash', str(BIN / 'registry-watchdog.sh')], env=env,
                           capture_output=True, timeout=15)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual((self.root / 'called').read_text().splitlines(), ['verify', 'list --health'])

    def test_minute_zero_does_not_apply_full_day_peer_count(self):
        fake = self.root / 'bin'
        fake.mkdir()
        now = int(time.time())
        (self.root / 'state').mkdir()
        (self.root / 'state/last-spoke.stamp').write_text(str(now))
        (self.root / 'state/last-run.stamp').write_text(str(now))
        self.script(fake / 'systemctl', 'printf "active\\n"\n')
        self.script(fake / 'uptime', 'printf "' + time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(now)) + '\\n"\n')
        self.script(fake / 'journalctl', 'case "$*" in *"short-unix"*) printf "' + str(now - 60) + '.0 fixture\\n";; esac\n')
        p = self.wd(PATH=str(fake) + ':' + self.env['PATH'], PEER_ENABLED='1', TZ='UTC')
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn('порог'.encode(), p.stdout)
        self.assertNotIn('работает рывками'.encode(), p.stdout)
        self.assertFalse((self.root / 'alerts').exists())

    def test_locale_order_with_real_russian_locale(self):
        locales = subprocess.check_output(['locale', '-a']).decode().splitlines()
        russian = next((x for x in locales if x.lower().startswith('ru_ru.')), None)
        if not russian:
            self.skipTest('ru_RU locale is not installed; no dynamic non-C measurement')
        shared = self.root / 'shared'
        nodes = self.root / 'nodes/web/node_modules'
        nodes.mkdir(parents=True)
        (shared / 'node_modules').mkdir(parents=True)
        names = ['-beta', 'Zebra', 'alpha']
        for name in names:
            target = shared / 'node_modules' / name
            target.mkdir()
            (nodes / name).symlink_to(target)
        (shared / 'package.json').write_text(json.dumps({'dependencies': dict.fromkeys(names, '1')}))
        fake = self.root / 'bin'
        fake.mkdir()
        self.script(fake / 'sudo', '[ "$1" != -n ] || shift\nexec "$@"\n')
        for locale in ('C.UTF-8', russian):
            p = subprocess.run(['bash', str(BIN / 'priznak-oblasti-podklyucheniya.sh')],
                               env={**self.env, 'PATH': str(fake) + ':' + self.env['PATH'],
                                    'LC_ALL': locale, 'OBLAST_OBSHCHIJ': str(shared),
                                    'OBLAST_UZLY': str(nodes.parents[1])}, capture_output=True, timeout=10)
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)

    def test_agents_registry_required_and_named(self):
        registry = self.root / 'plugins.yaml'
        registry.write_text('plugins:\n  - id: p\n    version: "1"\n    installed_check: "printf 1"\n')
        agents = self.root / 'agents.yaml'
        env = {**self.env, 'PLUGINS_REGISTRY': str(registry), 'AGENTS_REGISTRY': str(agents)}
        p = subprocess.run(['python3', str(BIN / 'agent-plugins'), 'verify'], env=env, capture_output=True, timeout=10)
        self.assertEqual(p.returncode, 2)
        self.assertIn('СЛЕПОТА'.encode(), p.stdout)
        agents.write_text('agenty:\n  - imya: fixture\n    namerenie:\n      dom: ' + str(self.root / 'home') + '\n')
        p = subprocess.run(['python3', str(BIN / 'agent-plugins'), 'verify'], env=env, capture_output=True, timeout=10)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)

    def test_mount_registry_readable_without_sudo(self):
        fake = self.root / 'bin'
        fake.mkdir()
        self.script(fake / 'sudo', 'exit 1\n')
        place = self.root / 'installed'
        (place / 'plugin').mkdir(parents=True)
        registry = self.root / 'plugins.yaml'
        registry.write_text('plugins:\n  - id: p\n    path: ' + str(place / 'plugin') + '\n')
        p = subprocess.run(['bash', str(BIN / 'sverka-montazha.sh')],
                           env={**self.env, 'PATH': str(fake) + ':' + self.env['PATH'],
                                'PLUGINS_REGISTRY': str(registry), 'SVERKA_MESTA': str(place)},
                           capture_output=True, timeout=10)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)

    def test_preset_custom_id_matches_and_blindness_is_two(self):
        own, vendor = self.root / 'own.yaml', self.root / 'vendor.yaml'
        def preset(ident):
            return json.dumps([{'insert': [{'id': ident, 'name': '@deepseek-ai/dsh-agent-preset',
                                           'config': {'plugins': [{'id': 'fixture'}]}}]}])
        own.write_text(preset('custom'))
        vendor.write_text(preset('preset-standard'))
        env = {**self.env, 'PRESET_SVERKA_NASH': str(own), 'PRESET_SVERKA_ZAVOD': str(vendor),
               'PRESET_SVERKA_NASH_ID': 'custom'}
        p = subprocess.run(['python3', str(BIN / 'preset-sverka')], env=env, capture_output=True, timeout=10)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        own.unlink()
        p = subprocess.run(['python3', str(BIN / 'preset-sverka')], env=env, capture_output=True, timeout=10)
        self.assertEqual(p.returncode, 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
