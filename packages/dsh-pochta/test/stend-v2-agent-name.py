#!/usr/bin/env python3
"""B-N-2021: actual v2 put with a private spool and substituted kernel account lookup."""
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

PACKAGE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v2_agent_name', PACKAGE/'libexec/a2a-v2.py')
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)


class Names(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='v2-agent-name-')
        self.spool = Path(self.tmp.name)/'recipient-agent'
        self.spool.mkdir()
        self.route = {'spool': str(self.spool)}
        self.metadata = {'recipient': {'id': 'recipient-agent'}, 'delivery_id': 'hyphen-probe'}

    def tearDown(self):
        self.tmp.cleanup()

    def test_hyphen_account_publishes_full_name_and_wire(self):
        for account in ['my-agent', 'my-agent-ownerall', 'my-agent-v2', '_my-agent', 'my-agent-', 'coders']:
            with self.subTest(account=account), patch.object(v2.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name=account)):
                try:
                    target = v2.put(self.route, self.metadata, 'Частная проба 😀')
                except ValueError as error:
                    self.fail(str(error))
                suffix = '-'+account+'-v2-'+hashlib.sha256(b'hyphen-probe').hexdigest()+'.txt'
                self.assertTrue(target.name.endswith(suffix), target.name)
                header, metadata, body = target.read_bytes().split(b'\n', 2)
                self.assertEqual(header, b'[a2a-envelope version=2]')
                self.assertEqual(json.loads(metadata), self.metadata)
                self.assertEqual(body.decode('utf8'), 'Частная проба 😀')
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                self.assertFalse(list(self.spool.glob('.v2-*')))

    def test_invalid_account_refused_before_temporary_write(self):
        for account in ['', 'bad.name', 'bad/name', 'bad name', 'bad:name', 'Bad-name', '9bad-name', '-bad-name', 'имя-агента', 'bad\nname']:
            with self.subTest(account=account), patch.object(v2.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name=account)), patch.object(v2.tempfile, 'mkstemp', side_effect=AssertionError('must not write')):
                with self.assertRaises(ValueError):
                    v2.put(self.route, self.metadata, 'not published')
                self.assertEqual(list(self.spool.iterdir()), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
