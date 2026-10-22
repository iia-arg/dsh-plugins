"""Cache must be called by the actual raw supplier, not merely work on its own."""
import os, time, tempfile, unittest
from pathlib import Path
from test_raw_index import module
import test_raw_supplier as helper_module
class CachedSupplier(unittest.TestCase):
 def test_same_shared_db_supplies_warm_without_reading_raw_again(self):
  helper=helper_module.RawSupplier();helper.setUp();self.addCleanup(helper.doCleanups);case=helper.case('codex')
  info=module('runtime_incremental.py');R=helper.home/'R';R.write_bytes(b'')
  with info.Reader(R,helper.home/'cursor.sqlite',os.getuid(),'worker') as reader:
   for i in range(2):
    meter=helper.meter();cache=module('raw_index.py').RawIndex(helper.n,reader,meter,run='run',cut=case.g.iso(2000),context='selection')
    rows=helper.s.supply(helper.ns,case.p,case.rows,case.requests,meter,[],cache=cache)
    self.assertEqual(helper.verdict(case,rows)[0]['totals']['inputTokens'],100)
    if i:self.assertEqual(cache.raw_read,0,'supplier still rereads the whole raw journal')
if __name__=='__main__':unittest.main()
