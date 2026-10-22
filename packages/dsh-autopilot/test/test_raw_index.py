"""Real shared Reader/SQLite, raw codec and supplier. No live sources."""
import hashlib, importlib.util, json, os, subprocess, sys, tempfile, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def module(name):
 spec=importlib.util.spec_from_file_location('raw_test_'+name,ROOT/'runtime'/name)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class RawSchema(unittest.TestCase):
 def test_raw_schema_extends_same_db4_without_changing_r_or_policy(self):
  with tempfile.TemporaryDirectory() as d:
   info=module('runtime_incremental.py');source=Path(d)/'R';source.write_bytes(b'')
   with info.Reader(source,Path(d)/'source.sqlite',os.getuid(),'fixture') as reader:
    reader.db.execute("INSERT INTO bindings VALUES('run','key','payload')");reader.db.commit()
    raw=module('raw_index.py');raw.ensure_schema(reader)
    self.assertEqual(reader.db.execute('PRAGMA user_version').fetchone()[0],4)
    self.assertEqual(reader.db.execute('SELECT * FROM bindings').fetchall(),[('run','key','payload')])
    names={r[0] for r in reader.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    self.assertTrue({'raw_sources','raw_records','raw_views','raw_leases'}<=names)
    raw.ensure_schema(reader)
    self.assertEqual(reader.db.execute('SELECT count(*) FROM bindings').fetchone()[0],1)

class RawIngest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.home=Path(self.tmp.name)
  self.n=module('runtime_receipt_source.py');self.i=module('raw_index.py');info=module('runtime_incremental.py')
  source=self.home/'R';source.write_bytes(b'');self.reader=info.Reader(source,self.home/'state.sqlite',os.getuid(),'fixture');self.addCleanup(self.reader.__exit__)
  self.path=self.home/'sdk.jsonl';self.put([dict(type='assistant',sessionId='session',timestamp='2026-10-20T00:00:00Z',uuid='u',message=dict(id='msg_real',content=[dict(type='text',text='PRIVATE_PROMPT')],usage=dict(input_tokens=1,output_tokens=2,cache_read_input_tokens=0,cache_creation_input_tokens=0)))])
 def put(self,rows):
  self.path.write_text(''.join(json.dumps(r)+'\n' for r in rows));self.path.chmod(0o600)
 def cache(self):
  self.m=self.n.Meter(16*1024*1024,time.monotonic()+3)
  return self.i.RawIndex(self.n,self.reader,self.m,run='run',cut='2026-10-21T00:00:00Z',context='selection')
 def read(self,c=None):return (c or self.cache()).read(self.path,'claude','session',os.getuid())
 def test_cold_warm_append_and_no_prompt_in_sqlite(self):
  rows=self.read();self.assertTrue(rows);self.assertEqual(rows[0]['messageId'],'msg_real');self.assertGreater(self.m.bytes,0)
  self.assertNotIn(b'PRIVATE_PROMPT',(self.home/'state.sqlite').read_bytes())
  self.assertEqual(self.read()[0]['messageId'],'msg_real');self.assertEqual(self.m.raw_usage['rawReadBytes'],0)
  with self.path.open('a') as f:f.write(json.dumps(dict(type='user',sessionId='session',uuid='next'))+'\n')
  self.assertEqual(len(self.read()),2);self.assertLess(self.m.raw_usage['rawReadBytes'],self.path.stat().st_size*3)
 def test_partial_prompt_checkpoint_and_completion(self):
  with self.path.open('ab') as f:f.write(b'{"type":"user","sessionId":"session","uuid":"last","message":{"content":"PRIVATE_PROMPT')
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_REPLAY_PENDING'):self.read()
  self.assertNotIn(b'PRIVATE_PROMPT',(self.home/'state.sqlite').read_bytes())
  with self.path.open('ab') as f:f.write(b'"}}\n')
  self.assertEqual(len(self.read()),2)
 def test_fixed_goal_two_quanta_and_inode_return(self):
  rows=[dict(type='user',sessionId='session',uuid=str(i),message=dict(content='PRIVATE_PROMPT'*50)) for i in range(12)]
  self.put(rows);quantum=self.path.stat().st_size//2+8192+1
  with patch.object(self.i,'RAW_READ_BYTES',quantum):
   with self.assertRaisesRegex(self.n.Incomplete,'RAW_REPLAY_PENDING'):self.read()
   self.assertEqual(len(self.read()),12)
  replacement=self.path.with_suffix('.new');replacement.write_bytes(self.path.read_bytes());replacement.chmod(0o600);replacement.replace(self.path)
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_REPLAY_PENDING'):self.read()
  self.assertEqual(len(self.read()),12)
 def test_low_free_space_refuses_before_offset_and_return(self):
  fake=SimpleNamespace(f_bavail=(1<<30)-1,f_frsize=1)
  before=self.reader.db.execute('SELECT count(*) FROM cursor').fetchone()
  with patch.object(self.i.os,'statvfs',return_value=fake),self.assertRaisesRegex(self.n.Incomplete,'RAW_INDEX_DISK_LIMIT'):self.read()
  self.assertEqual(self.reader.db.execute('SELECT count(*) FROM cursor').fetchone(),before)
  with patch.object(self.i.os,'statvfs',return_value=SimpleNamespace(f_bavail=1<<30,f_frsize=1)):self.assertTrue(self.read())
 def test_old_projection_versions_are_immutable_and_cut_bounded(self):
  first=self.read();self.assertTrue(first);old=self.reader.db.execute('SELECT epoch,goal FROM raw_sources WHERE active=1').fetchone()
  with self.path.open('a') as f:f.write(json.dumps(dict(type='assistant',sessionId='session',timestamp='2026-10-22T00:00:00Z',message=dict(id='msg_real',usage=dict(input_tokens=999,output_tokens=2,cache_read_input_tokens=0,cache_creation_input_tokens=0))))+'\n')
  self.assertEqual(self.read(),first)
  self.assertEqual(json.loads(self.reader.db.execute('SELECT payload FROM raw_records WHERE epoch=? AND end<=? ORDER BY end',(old[0],old[1])).fetchone()[0])['usage']['input_tokens'],1)

class RawReviewCases(RawIngest):
 def test_profile_second_foreign_session_is_refused(self):
  self.path.write_text(json.dumps(dict(type='session_meta',payload=dict(id='allowed')))+'\n'+json.dumps(dict(type='session_meta',payload=dict(id='foreign')))+'\n')
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_SOURCE_FOREIGN'):self.cache().read(self.path,'codex',None,os.getuid(),allowed_threads={'allowed'})
 def test_warm_origin_is_rechecked_without_rereading_raw(self):
  self.path.write_text(json.dumps(dict(type='session_meta',payload=dict(id='a')))+'\n'+json.dumps(dict(type='session_meta',payload=dict(id='b')))+'\n')
  self.assertTrue(self.cache().read(self.path,'codex',None,os.getuid(),allowed_threads={'a','b'}))
  cache=self.cache()
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_SOURCE_FOREIGN'):cache.read(self.path,'codex',None,os.getuid(),allowed_threads={'a','c'})
  self.assertEqual(cache.raw_read,0)
 def test_same_size_rewrite_controls_never_exceed8192(self):
  self.put([dict(type='user',sessionId='session',uuid='a',message=dict(content='x'*12000))]);self.read()
  raw=self.path.read_bytes();self.path.write_bytes(raw.replace(b'"uuid": "a"',b'"uuid": "b"'));c=self.cache()
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_REPLAY_PENDING'):self.read(c)
  self.assertLessEqual(c.raw_read-c.new_bytes,8192)
 def test_aggregate_owner_view_not_individual_files(self):
  self.put([dict(type='user',sessionId='session',uuid=chr(97+i)*200) for i in range(3)])
  second=self.path.with_name('second.jsonl');second.write_bytes(self.path.read_bytes());second.chmod(0o600)
  with patch.object(self.i,'VIEW_BYTES',1024):
   cache=self.cache();self.assertTrue(cache.read(self.path,'claude','session',os.getuid()))
   with self.assertRaisesRegex(self.n.Incomplete,'RAW_VIEW_TOO_LARGE'):cache.read(second,'claude','session',os.getuid())
 def test_next_store_refreshes_uid_capacity_after_shared_lock_release(self):
  self.put([dict(type='user',sessionId='session',uuid=str(i).zfill(200)) for i in range(1500)])
  info=module('runtime_incremental.py');directory=self.home/'quota';directory.mkdir()
  with patch.object(self.i,'INDEX_BYTES',1<<20):
   with info.Reader(self.home/'R',directory/'first.sqlite',os.getuid(),'first') as first:
    self.assertTrue(self.i.RawIndex(self.n,first,self.n.Meter(),run='run',cut=None,context='first').read(self.path,'claude','session',os.getuid()))
   with info.Reader(self.home/'other-R',directory/'other.sqlite',os.getuid(),'other') as second:
    other_cache=self.i.RawIndex(self.n,second,self.n.Meter(),run='run',cut=None,context='other')
    with self.assertRaisesRegex(self.n.Incomplete,'RAW_INDEX_CAPACITY_EXCEEDED'):other_cache.read(self.path,'claude','session',os.getuid())
   self.assertLessEqual(sum(p.stat().st_size for p in directory.glob('*.sqlite')),1<<20)
 def test_warm_claude_profile_rechecks_all_session_ids(self):
  self.put([dict(type='user',sessionId=t,uuid=t) for t in ['a','b']])
  self.assertEqual(len(self.cache().read(self.path,'claude',None,os.getuid(),allowed_threads={'a','b'})),2)
  cache=self.cache()
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_SOURCE_FOREIGN'):cache.read(self.path,'claude',None,os.getuid(),allowed_threads={'b','c'})
  self.assertEqual(cache.raw_read,0)
  self.assertEqual(len(self.cache().read(self.path,'claude',None,os.getuid(),allowed_threads={'a','b'})),2)
 def test_warm_projection_consumes_metadata_meter(self):
  self.assertTrue(self.read())
  cache=self.cache();cache.meter.budget=1
  with self.assertRaisesRegex(self.n.Incomplete,'BUDGET_EXCEEDED'):self.read(cache)
  self.assertEqual(cache.raw_read,0)
  self.assertTrue(self.read())
 def test_initial_schema_capacity_error_is_named(self):
  info=module('runtime_incremental.py');directory=self.home/'full';directory.mkdir()
  with info.Reader(self.home/'R',directory/'full.sqlite',os.getuid(),'full') as reader:
   size=reader.db.execute('PRAGMA page_count').fetchone()[0]*reader.db.execute('PRAGMA page_size').fetchone()[0]
   with patch.object(self.i,'INDEX_BYTES',size),self.assertRaisesRegex(self.n.Incomplete,'RAW_INDEX_CAPACITY_EXCEEDED'):
    self.i.RawIndex(self.n,reader,self.n.Meter(),run='run',cut=None,context='full')
 def test_two_processes_share_quota_and_refusal_returns(self):
  self.put([dict(type='user',sessionId='session',uuid=str(i).zfill(200)) for i in range(1500)])
  info=module('runtime_incremental.py');directory=self.home/'two-process';directory.mkdir()
  code="""import sys,json,os
from pathlib import Path
sys.path.insert(0,sys.argv[1]);from test_raw_index import module
n=module('runtime_receipt_source.py');i=module('raw_index.py');r=module('runtime_incremental.py');i.INDEX_BYTES=int(sys.argv[4])
try:
 with r.Reader(Path(sys.argv[2])/'R',Path(sys.argv[2])/'second.sqlite',os.getuid(),'second') as reader:
  out=i.RawIndex(n,reader,n.Meter(),run='run',cut=None,context='second').read(sys.argv[3],'claude','session',os.getuid())
  result={'status':'OK','rows':len(out)}
except (ValueError,n.Incomplete) as e:result={'status':str(e)}
print(json.dumps(result))
"""
  def attempt(cap):
   result=subprocess.run([sys.executable,'-I','-B','-c',code,str(ROOT/'test'),str(directory),str(self.path),str(cap)],capture_output=True,text=True,timeout=10)
   self.assertEqual(result.returncode,0,result.stderr);return json.loads(result.stdout)
  with info.Reader(self.home/'R',directory/'first.sqlite',os.getuid(),'first') as first,patch.object(self.i,'INDEX_BYTES',1<<20):
   self.assertEqual(attempt(1<<20)['status'],'R_STATE_BUSY');self.assertFalse((directory/'second.sqlite').exists())
   self.assertTrue(self.i.RawIndex(self.n,first,self.n.Meter(),run='run',cut=None,context='first').read(self.path,'claude','session',os.getuid()))
  self.assertEqual(attempt(1<<20)['status'],'RAW_INDEX_CAPACITY_EXCEEDED')
  self.assertLessEqual(sum(p.stat().st_size for p in directory.glob('*.sqlite')),1<<20)
  self.assertEqual(attempt(128<<20),dict(status='OK',rows=1500))
 def test_pending_checkpoint_consumes_metadata_budget_before_raw_read(self):
  self.path.write_bytes(b'{"type":"user","sessionId":"session","uuid":"'+b'x'*20000)
  with self.assertRaisesRegex(self.n.Incomplete,'RAW_REPLAY_PENDING'):self.read()
  cache=self.cache();cache.meter.budget=1000
  with self.assertRaisesRegex(self.n.Incomplete,'BUDGET_EXCEEDED'):self.read(cache)
  self.assertEqual(cache.raw_read,0)
 def test_codex_first_identity_lookup_consumes_metadata(self):
  self.put([dict(type='session_meta',payload=dict(id='a'))])
  self.cache().read(self.path,'codex',None,os.getuid(),allowed_threads={'a'})
  payload=self.reader.db.execute('SELECT payload FROM raw_records').fetchone()[0]
  cache=self.cache();cache.meter.budget=len(payload.encode())*3
  with self.assertRaisesRegex(self.n.Incomplete,'BUDGET_EXCEEDED'):cache.read(self.path,'codex',None,os.getuid(),allowed_threads={'a'})
 def test_time_budget_commits_progress_instead_of_replaying_forever(self):
  self.put([dict(type='user',sessionId='session',uuid=str(i),message=dict(content='x'*100)) for i in range(2000)])
  clock=[0.];calls=[0];original=self.n.core.normalize
  def slow(*args):
   calls[0]+=1
   if calls[0]>=5:clock[0]=4.
   return original(*args)
  with patch.object(self.i.time,'monotonic',side_effect=lambda:clock[0]),patch.object(self.n.core,'normalize',side_effect=slow):
   with self.assertRaises(self.n.Incomplete):self.read()
  offset=self.reader.db.execute('SELECT offset FROM raw_sources WHERE active=1').fetchone()
  self.assertIsNotNone(offset,'time budget rolled back every bit of cold progress')
  self.assertGreater(offset[0],0);self.assertLess(offset[0],self.path.stat().st_size)
  self.assertEqual(len(self.read()),2000)
if __name__=='__main__':unittest.main()
