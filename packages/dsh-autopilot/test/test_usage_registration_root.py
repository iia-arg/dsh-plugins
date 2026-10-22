"""Root queue proofs are confined to private filesystem/PID/network namespaces."""
import os
from pathlib import Path
import subprocess
import sys
import unittest
import tempfile
import shutil
class RootRegistration(unittest.TestCase):
 def test_private_registration_proofs(self):
  self.assertEqual(os.geteuid(),0,'declared root fixture required')
  code="""import os,sys,unittest
from pathlib import Path
os.chmod('/tmp',0o1777)
Path('/run/r-normalizer-private').touch()
os.environ['R_NORMALIZER_PRIVATE']='1'
sys.path.insert(0,sys.argv[1])
from _runtime_sources_private import setup
setup()
s=unittest.defaultTestLoader.loadTestsFromName('_usage_registration_root.RegistrationPipeline')
r=unittest.TextTestRunner(verbosity=2).run(s)
print('ROOT_CASES registration minimum=58 executed=%d expected=%d' % (r.testsRun,s.countTestCases()),flush=True)
assert r.testsRun >= 58, 'root registration suite executed fewer than 58 cases'
sys.exit(not(r.wasSuccessful() and not r.skipped and r.testsRun==s.countTestCases()))
"""
  from _runtime_sources_private import namespace
  args=namespace(Path(__file__).resolve().parents[1])+['--tmpfs','/usr/local/bin']
  with tempfile.TemporaryDirectory(prefix='ap-mail-entry-copy-') as tmp:
   entry=Path(tmp)/'autopilot-mail'
   entry.write_text("#!/usr/bin/python3\nimport os,sys\nsys.path.insert(0,os.environ['AP_REGISTRATION_LIB'])\nimport mail_client\noriginal=mail_client.MailClient\nclass CopyClient(original):\n def __init__(self,*args,**kwargs):\n  kwargs.update(server_uid=0,tls_cert=None)\n  super().__init__(*args,**kwargs)\nmail_client.MailClient=CopyClient\nsys.exit(mail_client.main())\n")
   entry.chmod(0o755)
   result=subprocess.run(args+['--ro-bind',str(Path(shutil.which('node')).resolve()),'/usr/local/bin/node','--ro-bind',str(entry),'/usr/local/bin/autopilot-mail','--',sys.executable,'-I','-B','-c',code,str(Path(__file__).resolve().parent)],capture_output=True,text=True,timeout=120)
  print(result.stdout+result.stderr,flush=True);self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertIn('ROOT_CASES registration minimum=58',result.stdout)
