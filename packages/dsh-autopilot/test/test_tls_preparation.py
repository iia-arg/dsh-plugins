"""Preparation creates a private pair, never overwrites or guesses options."""
from _fixture_dirs import fixture_mkdir as _fixture_mkdir
import hashlib
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import unittest

TOOL=Path(__file__).resolve().parents[1]/'tools/prepare-mail-tls.py'


class PreparationTests(unittest.TestCase):
    def test_new_pair_is_private_and_repeat_preserves_original(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination=Path(temporary)/'pair'
            args=[sys.executable,'-B',str(TOOL),'--directory',str(destination)]
            first=subprocess.run(args,capture_output=True,text=True,timeout=20)
            self.assertEqual(first.returncode,0,first.stderr)
            self.assertEqual(destination.stat().st_mode&0o777,0o700)
            key=destination/'server.key';cert=destination/'server.pem'
            self.assertEqual(key.stat().st_mode&0o777,0o600)
            self.assertEqual(cert.stat().st_mode&0o777,0o644)
            ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(cert,key)
            key_before=key.read_bytes();cert_before=cert.read_bytes()
            self.assertNotIn('PRIVATE KEY',first.stdout+first.stderr)
            pin=hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert.read_text())).hexdigest()
            self.assertIn(pin,first.stdout)
            second=subprocess.run(args,capture_output=True,text=True,timeout=20)
            self.assertEqual(second.returncode,2)
            self.assertEqual(key.read_bytes(),key_before)
            self.assertEqual(cert.read_bytes(),cert_before)

    def test_unknown_options_and_symlink_refuse_without_output(self):
        self.assertTrue(TOOL.is_file(),'missing tool is not an option-refusal proof')
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);output=root/'output'
            for option in ['--dry-run','-n','--check','--dir']:
                result=subprocess.run([sys.executable,'-B',str(TOOL),'--directory',str(output),option],capture_output=True,text=True,timeout=5)
                self.assertEqual(result.returncode,2)
                self.assertFalse(output.exists())
            target=root/'target';_fixture_mkdir(target, mode=0o755);link=root/'link';link.symlink_to(target)
            result=subprocess.run([sys.executable,'-B',str(TOOL),'--directory',str(link/'pair')],capture_output=True,text=True,timeout=5)
            self.assertEqual(result.returncode,2);self.assertFalse((target/'pair').exists())


if __name__=='__main__':unittest.main()
