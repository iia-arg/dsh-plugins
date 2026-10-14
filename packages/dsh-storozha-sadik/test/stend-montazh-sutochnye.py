#!/usr/bin/python3 -B
"""The actual daily-watcher loop from sadik-watch, external systemctl/journal fixtures."""
from pathlib import Path
import json,os,subprocess,tempfile,time,unittest
PKG=Path(__file__).resolve().parents[1]
class Sutochnye(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='montazh-sutochnye-');self.r=Path(self.tmp.name);self.b=self.r/'bin';self.b.mkdir();self.list=self.r/'list';self.failed=False;self.age=0
  src=(PKG/'sbin/sadik-watch').read_text();start=src.index('SUTOCHNYE="');end=src.index('  # ── B-N-1068',start);body=src[start:end]+'\nfi\n'
  self.script=self.r/'loop';self.script.write_text('set -u\nBEDY=0\nSEYCHAS=$(date +%s)\nlog(){ echo "$*"; }\n'+body+'\necho "RESULT $BEDY $GR_SUT $GR_SUT_TXT"\n')
  p=self.b/'systemctl';p.write_text('#!/bin/sh\nif [ "$1" = is-failed ]; then [ "$FIXTURE_FAILED" = 1 ]; elif [ "$1" = show ]; then echo inactive; else exit 1; fi\n');p.chmod(0o755)
  p=self.b/'journalctl';p.write_text('#!/bin/sh\nprintf \'{"__REALTIME_TIMESTAMP":"%s"}\\n\' "$FIXTURE_TIME"\n');p.chmod(0o755)
 def tearDown(self):self.tmp.cleanup()
 def invoke(self,unit='montazh-okno-watch.service',limit='180s',failed=False,age=0,helper=None):
  self.list.write_text(unit+' '+limit+'\n');env={**os.environ,'PATH':str(self.b)+':'+os.environ['PATH'],'SADIK_SUTOCHNYE':str(self.list),'FIXTURE_FAILED':'1' if failed else '0','FIXTURE_TIME':str(int((time.time()-age)*1e6))}
  if helper:env['MONTAZH_OKNO_BIN']=str(helper)
  return subprocess.run(['bash',str(self.script)],env=env,capture_output=True,text=True,timeout=5)
 def test_deadline_watcher_life_is_never_deferred(self):
  p=self.invoke();self.assertEqual(p.returncode,0,p.stderr);self.assertIn('RESULT 0',p.stdout)
  p=self.invoke(failed=True);self.assertIn('RESULT 1',p.stdout);self.assertIn('FAILED',p.stdout)
  p=self.invoke(age=181);self.assertIn('RESULT 1',p.stdout);self.assertIn('prosrochen',p.stdout)
  p=self.invoke();self.assertIn('RESULT 0',p.stdout)
 def test_unit_four_is_distinct_only_while_common_helper_allows_it(self):
  helper=self.r/'helper';helper.write_text('#!/bin/sh\necho "ОТЛОЖЕНО 33333333333333333333333333333333 до fixture"\nexit 4\n');helper.chmod(0o755)
  p=self.invoke(unit='registry-watchdog.service',limit='26',failed=True,helper=helper);self.assertIn('RESULT 0',p.stdout);self.assertIn('ОТЛОЖЕНО',p.stdout);self.assertNotIn('FAILED',p.stdout)
  helper.write_text('#!/bin/sh\nexit 0\n');p=self.invoke(unit='registry-watchdog.service',limit='26',failed=True,helper=helper);self.assertIn('RESULT 1',p.stdout);self.assertIn('FAILED',p.stdout)
if __name__=='__main__':unittest.main(verbosity=2)
