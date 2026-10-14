"""Frozen vendor fixture identity and actual imported writer's refusal; private data only."""
import ast,hashlib,tempfile,unittest,sys
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
class StoreFixtureTests(unittest.TestCase):
 def test_fixture_is_exact_pinned_store_revision(self):
  tree=ast.parse((ROOT/'src/lessons_store.py').read_text())
  pin=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REVIEW_STORE_SHA' for t in n.targets))
  self.assertEqual(hashlib.sha256((ROOT/'test/fixtures/v1-store.py').read_bytes()).hexdigest(),pin)
 def test_writer_rejects_actual_imported_store_hash_before_opening_database(self):
  import lessons_store
  with tempfile.TemporaryDirectory(prefix='obsl-store-hash-') as td:
   path=Path(td)/'never-open.db'
   with mock.patch.object(lessons_store,'assert_omega'):
    with self.assertRaisesRegex(lessons_store.Refused,'omega_store_hash_mismatch'):
     lessons_store.Writer(path,expected_sha='0'*64)
   self.assertFalse(path.exists())
if __name__=='__main__':unittest.main(verbosity=2)
