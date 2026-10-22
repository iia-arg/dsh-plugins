import unittest,importlib.util,time
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
FILE=HERE/'key-health.py' if (HERE/'key-health.py').is_file() else HERE.parent/'candidate/libexec/key-health.py'
class Health(unittest.TestCase):
 def test_status_and_age(self):
  self.assertTrue(FILE.exists(),'nonroot health reader is missing')
  s=importlib.util.spec_from_file_location('h',FILE);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
  good={'User':'root','Group':'root','Type':'oneshot','FragmentPath':'/etc/systemd/system/dsh-autopilot-key-check.service','DropInPaths':'','ExecStart':'{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/key-check.py ; ignore_errors=no ; }','ExecMainCode':'1','ExecMainStatus':'0','ExecMainExitTimestampMonotonic':'100000000'}
  self.assertEqual(m.classify('active',good,101),0)
  self.assertEqual(m.classify('inactive',good,101),1)
  self.assertEqual(m.classify('active',dict(good,ExecMainStatus='1'),101),1)
  self.assertEqual(m.classify('active',dict(good,ExecMainExitTimestampMonotonic='0'),101),2)
  self.assertEqual(m.classify('active',good,281),2)
  self.assertEqual(m.classify('active',good,99),2)
  for k,v in [('User','iskra'),('ExecStart','{ argv[]=/bin/true ; ignore_errors=no ; }'),('ExecStart',good['ExecStart'].replace('/key-check.py','/other.py')),('ExecStart',good['ExecStart'].replace('ignore_errors=no','ignore_errors=yes')),('ExecStart',good['ExecStart']+' '+good['ExecStart']),('DropInPaths','/etc/systemd/system/dsh-autopilot-key-check.service.d/evil.conf'),('FragmentPath','/tmp/wrong.service')]:self.assertEqual(m.classify('active',dict(good,**{k:v}),101),2)
if __name__=='__main__':unittest.main(verbosity=2)
