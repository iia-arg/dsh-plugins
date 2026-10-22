"""Private raw namespaces in the existing DB4. Caller holds the shared Reader lock."""
SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_sources(
 source TEXT NOT NULL, epoch TEXT NOT NULL, engine TEXT NOT NULL, thread TEXT NOT NULL,
 decoder TEXT NOT NULL, source_version TEXT NOT NULL, active INTEGER NOT NULL,
 dev TEXT NOT NULL, inode TEXT NOT NULL, size INTEGER NOT NULL, mtime INTEGER NOT NULL,
 ctime INTEGER NOT NULL, goal INTEGER NOT NULL, offset INTEGER NOT NULL,
 checkpoint TEXT NOT NULL, header TEXT NOT NULL, control TEXT NOT NULL,
 control_at INTEGER NOT NULL, PRIMARY KEY(source,epoch));
CREATE TABLE IF NOT EXISTS raw_records(
 source TEXT NOT NULL, epoch TEXT NOT NULL, end INTEGER NOT NULL,
 at TEXT, payload TEXT NOT NULL, PRIMARY KEY(source,epoch,end));
CREATE TABLE IF NOT EXISTS raw_views(
 id TEXT PRIMARY KEY, run TEXT NOT NULL, cut TEXT NOT NULL,
 vector TEXT NOT NULL, context TEXT NOT NULL, proof TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS raw_leases(
 run TEXT NOT NULL, source TEXT NOT NULL, epoch TEXT NOT NULL,
 PRIMARY KEY(run,source,epoch));
"""
def ensure_schema(reader):
    # DDL does not change user_version, R/ownership tables or their transactions.
    # No second connection, database or lock is created.
    for statement in SCHEMA.split(';'):
        if statement.strip():reader.db.execute(statement)


import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import time

RAW_READ_BYTES=4*1024*1024
RAW_INDEX_MIN_FREE_BYTES=1<<30
INDEX_BYTES=128*1024*1024
DIRECTORY_BYTES=1<<30
VIEW_BYTES=8*1024*1024
METADATA_BYTES=4*1024*1024
DECODER_REVISION='raw-projection-3-synthetic'
CONTROL=4096

def dump(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)
def digest(value):return hashlib.sha256(value).hexdigest()
def decoder_module():
 spec=importlib.util.spec_from_file_location('index_raw_decoder',Path(__file__).with_name('raw_decoder.py'))
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class RawIndex:
 def __init__(self,n,reader,meter,*,run,cut,context):
  self.n=n;self.reader=reader;self.db=reader.db;self.meter=meter
  self.directory=Path(self.db.execute('PRAGMA database_list').fetchone()[2]).parent
  self.run=run;self.cut=cut;self.context=context;self.raw_read=0;self.new_bytes=0
  self.codec=decoder_module();self.vector=[];self.view_bytes=0
  try:
   self._space(reserve=True)
   self._capacity()
   self.db.execute('PRAGMA journal_mode=DELETE');self.db.execute('PRAGMA synchronous=FULL')
   ensure_schema(reader)
  except (sqlite3.Error,OSError) as error:self._storage_error(error)
 def _storage_error(self,error):
  if isinstance(error,sqlite3.Error):
   if getattr(error,'sqlite_errorcode',None)==sqlite3.SQLITE_FULL:
    free=os.statvfs(self.directory)
    reason='RAW_INDEX_DISK_LIMIT' if free.f_bavail*free.f_frsize<RAW_INDEX_MIN_FREE_BYTES else 'RAW_INDEX_CAPACITY_EXCEEDED'
    raise self.n.Incomplete(reason) from None
   raise self.n.Incomplete('RAW_INDEX_STATE_INVALID') from None
  if error.errno in (errno.ENOSPC,errno.EDQUOT):raise self.n.Incomplete('RAW_INDEX_DISK_LIMIT') from None
  raise error
 def _metadata(self,size):
  if self.meter.bytes+size>self.meter.budget or self.meter.bytes-self.raw_read+size>METADATA_BYTES:
   error=self.n.Incomplete('BUDGET_EXCEEDED');error.budgetScope='metadata';raise error
  self.meter.bytes+=size
 def _payloads(self,query,args):
  for at,payload in self.db.execute(query,args):
   self._metadata(len(payload.encode()))
   yield at,payload
 def _capacity(self):
  pagesize=self.db.execute('PRAGMA page_size').fetchone()[0]
  main=Path(self.db.execute('PRAGMA database_list').fetchone()[2])
  other=sum(f.stat().st_size for f in self.directory.glob('*.sqlite') if f!=main)
  self.n.require(other<INDEX_BYTES,'RAW_INDEX_CAPACITY_EXCEEDED')
  maximum=max(1,(INDEX_BYTES-other)//pagesize)
  self.n.require(self.db.execute('PRAGMA page_count').fetchone()[0]<=maximum,'RAW_INDEX_CAPACITY_EXCEEDED')
  self.db.execute('PRAGMA max_page_count='+str(maximum))
 def _space(self,*,reserve=False):
  info=os.statvfs(self.directory)
  self.n.require(info.f_bavail*info.f_frsize>=RAW_INDEX_MIN_FREE_BYTES,'RAW_INDEX_DISK_LIMIT')
  size=0
  for root,dirs,files in os.walk(self.directory,followlinks=False):
   for name in dirs+files:
    st=(Path(root)/name).lstat()
    self.n.require(not stat.S_ISLNK(st.st_mode) and st.st_uid==os.getuid(),'R_STATE_UNSAFE')
    if stat.S_ISREG(st.st_mode):
     self.n.require(st.st_nlink==1,'R_STATE_UNSAFE');size+=st.st_size
  reserve_bytes=2*INDEX_BYTES+VIEW_BYTES+self.codec.CHECKPOINT if reserve else 0
  self.n.require(size+reserve_bytes<=DIRECTORY_BYTES,'RAW_INDEX_DISK_LIMIT')
 def _read(self,fd,size,offset):
  if size<=0:return b''
  self.meter.check()
  self.n.require(self.raw_read+size<=RAW_READ_BYTES and self.meter.bytes+size<=self.meter.budget,'RAW_REPLAY_PENDING')
  data=os.pread(fd,size,offset)
  self.n.require(len(data)==size,'RAW_SOURCE_TRUNCATED')
  self.meter.bytes+=len(data);self.raw_read+=len(data);return data
 def _active(self,source):
  cur=self.db.execute('SELECT * FROM raw_sources WHERE source=? AND active=1',(source,))
  row=cur.fetchone()
  if row is None:return None
  state=dict(zip([x[0] for x in cur.description],row));self._metadata(len(dump(state).encode()));return state
 def read(self,path,engine,thread,uid,*,agent_id=None,source_version='unwitnessed-v1',allowed_threads=None):
  profile=thread is None
  path=Path(path);source=str(path);before_bytes=self.raw_read;before_new=self.new_bytes
  self._space(reserve=True);self._capacity()
  try:fd=self.n.supplier_module().confined_open(path,os.O_RDONLY|os.O_NONBLOCK)
  except FileNotFoundError:raise self.n.Incomplete('RAW_SOURCE_MISSING') from None
  try:
   st=os.fstat(fd);self.n.require(stat.S_ISREG(st.st_mode) and st.st_uid==uid and st.st_nlink==1 and not st.st_mode&0o022,'SOURCE_OWNER_INVALID')
   old=self._active(source);state=old;tail_window=b'';header_info=None;header=None
   compatible=state and (state['engine'],state['decoder'],state['source_version'])==(engine,DECODER_REVISION,source_version) and (thread is None or state['thread']==thread)
   reset=not compatible or (state['dev'],state['inode'])!=(str(st.st_dev),str(st.st_ino)) or st.st_size<max(state['offset'],state['goal'])
   if state and not reset:
    unchanged=(state['size'],state['mtime'],state['ctime'])==(st.st_size,st.st_mtime_ns,st.st_ctime_ns)
    if not unchanged:
     if st.st_size==state['size'] and st.st_size>CONTROL:reset=True
     else:
      header_info=json.loads(state['header'])
      header=self._read(fd,header_info['end'],0)
      tail=self._read(fd,min(CONTROL,state['control_at']),max(0,state['control_at']-CONTROL))
      tail_window=tail
      reset=digest(header)!=header_info['sha256'] or digest(tail)!=state['control']
   if reset:
    epoch=digest(dump([source,engine,thread,DECODER_REVISION,source_version,st.st_dev,st.st_ino,st.st_mtime_ns,st.st_ctime_ns,time.monotonic_ns()]).encode())
    state=dict(source=source,epoch=epoch,engine=engine,thread=thread or '',decoder=DECODER_REVISION,source_version=source_version,active=1,dev=str(st.st_dev),inode=str(st.st_ino),size=st.st_size,mtime=st.st_mtime_ns,ctime=st.st_ctime_ns,goal=st.st_size,offset=0,checkpoint=self.codec.Decoder().checkpoint(),header='',control='',control_at=0)
   elif state['offset']>=state['goal']:state['goal']=st.st_size
   if reset:
    if header is None:header=self._read(fd,min(CONTROL,st.st_size),0)
    state['header']=dump(dict(end=len(header),sha256=digest(header)));tail_window=b''
   elif state['offset']<state['goal'] and not tail_window:
    tail_window=self._read(fd,min(CONTROL,state['offset']),max(0,state['offset']-CONTROL))
   if thread is None and state['thread']:thread=state['thread']
   decoder=self.codec.Decoder(state['checkpoint'])
   begin=state['offset'];goal=state['goal']
   available=min(RAW_READ_BYTES-self.raw_read,self.meter.budget-self.meter.bytes)
   stop=min(goal,begin+max(0,available))
   with self.db:
    self.db.execute('BEGIN IMMEDIATE')
    if reset:self.db.execute('UPDATE raw_sources SET active=0 WHERE source=?',(source,))
    offset=begin;paused=False;profile_threads=set(allowed_threads or ())
    for at,payload in self._payloads('SELECT at,payload FROM raw_records WHERE source=? AND epoch=? AND at IS NULL',(source,state['epoch'])):
     meta=json.loads(payload)
     if meta.get('type')=='meta' and meta.get('parentThreadId') in profile_threads:profile_threads.add(meta['threadId'])
    while offset<stop and not paused:
     if time.monotonic()>=self.meter.deadline-.05:break
     block=offset
     try:part=self._read(fd,min(65536,stop-offset),offset)
     except self.n.Incomplete as error:
      if str(error)!='BUDGET_EXCEEDED':raise
      break
     position=0
     for end in [i+1 for i,b in enumerate(part) if b==10]+([len(part)] if not part.endswith(b'\n') else []):
      if time.monotonic()>=self.meter.deadline-.05:paused=True;break
      piece=part[position:end];projected=decoder.feed(piece);position=end
      for row in projected:
       if profile:
        if engine=='codex' and row.get('type')=='session_meta':
         new_thread=(row.get('payload') or {}).get('id')
         first=not self.db.execute('SELECT 1 FROM raw_records WHERE source=? AND epoch=? LIMIT 1',(source,state['epoch'])).fetchone()
         parent=self.n.core.normalize(row,'raw').get('parentThreadId')
         self.n.require(type(new_thread) is str and bool(new_thread) and (new_thread in profile_threads or not first and parent in profile_threads),'RAW_SOURCE_FOREIGN')
         profile_threads.add(new_thread)
         thread=new_thread;state['thread']=thread
        elif engine=='claude':
         thread=row.get('sessionId')
         self.n.require(type(thread) is str and allowed_threads is not None and thread in allowed_threads,'RAW_SOURCE_FOREIGN');state['thread']=thread
        self.n.require(type(thread) is str and bool(thread),'RAW_SOURCE_FOREIGN')
       if engine=='codex':
        if not self.db.execute('SELECT 1 FROM raw_records WHERE source=? AND epoch=? LIMIT 1',(source,state['epoch'])).fetchone():
         self.n.require(row.get('type')=='session_meta' and (row.get('payload') or {}).get('id')==thread,'RAW_SOURCE_FOREIGN')
       else:self.n.require(row.get('sessionId')==thread and (agent_id is None or row.get('agentId')==agent_id),'RAW_SOURCE_FOREIGN')
       value=self.n.core.normalize(row,'raw')
       if value is not None:
        if engine=='codex' and value.get('type')!='meta' or agent_id is not None:value['threadId']=agent_id or thread
        self.n.require(len(dump(value).encode())<=self.codec.PROJECTION,'RAW_DECODER_LIMIT_EXCEEDED')
        self.db.execute('INSERT INTO raw_records VALUES(?,?,?,?,?)',(source,state['epoch'],block+end,value.get('at'),dump(value)))
      self.new_bytes+=len(piece);tail_window=(tail_window+piece)[-CONTROL:];offset=block+end
      if end==len(part):break
    current=os.fstat(fd)
    try:named=path.lstat()
    except FileNotFoundError:raise self.n.Incomplete('RAW_SOURCE_REPLACED') from None
    self.n.require((current.st_dev,current.st_ino)==(st.st_dev,st.st_ino)==(named.st_dev,named.st_ino),'RAW_SOURCE_REPLACED')
    self.n.require(current.st_size>=st.st_size,'RAW_SOURCE_TRUNCATED')
    self.n.require(current.st_size!=st.st_size or (current.st_mtime_ns,current.st_ctime_ns)==(st.st_mtime_ns,st.st_ctime_ns),'RAW_SOURCE_CONFLICT')
    if reset or offset!=begin:state.update(control=digest(tail_window),control_at=offset)
    state.update(size=st.st_size,mtime=st.st_mtime_ns,ctime=st.st_ctime_ns,offset=offset,checkpoint=decoder.checkpoint())
    columns=list(state)
    self.db.execute('INSERT OR REPLACE INTO raw_sources('+','.join(columns)+') VALUES('+','.join('?' for _ in columns)+')',[state[k] for k in columns])
    self.db.execute('INSERT OR IGNORE INTO raw_leases VALUES(?,?,?)',(self.run,source,state['epoch']))
    self._space()
   proof=dict(kind='raw-index',path=source,uid=uid,identity=[st.st_dev,st.st_ino],epoch=state['epoch'],end=goal,offset=state['offset'],bytes=goal,readBytes=self.raw_read-before_bytes,newRawBytes=self.new_bytes-before_new,decoder=DECODER_REVISION,sourceVersion=source_version)
   self.meter.proofs.append(proof);self.vector.append([source,state['epoch'],goal])
   self.meter.raw_usage=dict(rawReadBytes=self.raw_read,newRawBytes=self.new_bytes)
   if state['offset']<goal or not decoder.complete() or old and reset:raise self.n.Incomplete('RAW_REPLAY_PENDING')
   if profile and engine=='codex':
    first=next(self._payloads('SELECT at,payload FROM raw_records WHERE source=? AND epoch=? ORDER BY end LIMIT 1',(source,state['epoch'])),None)
    self.n.require(first is None or json.loads(first[1]).get('threadId') in (allowed_threads or ()),'RAW_SOURCE_FOREIGN')
    admitted=set(allowed_threads or ())
    for _,payload in self._payloads('SELECT at,payload FROM raw_records WHERE source=? AND epoch=? AND at IS NULL ORDER BY end',(source,state['epoch'])):
     meta=json.loads(payload)
     if meta.get('type')=='meta':
      self.n.require(meta.get('threadId') in admitted or meta.get('parentThreadId') in admitted,'RAW_SOURCE_FOREIGN')
      admitted.add(meta['threadId'])
   else:self.n.require(allowed_threads is None or state['thread'] in allowed_threads,'RAW_SOURCE_FOREIGN')
   out=[]
   for at,payload in self._payloads('SELECT at,payload FROM raw_records WHERE source=? AND epoch=? AND end<=? ORDER BY end',(source,state['epoch'],goal)):
    self.meter.check()
    value=json.loads(payload)
    if profile and engine=='claude':self.n.require(value.get('threadId') in (allowed_threads or ()),'RAW_SOURCE_FOREIGN')
    if at is None or self.cut is None or self.n.millis(at)<=self.n.millis(self.cut):out.append(value)
   self.view_bytes+=len(dump(out).encode())
   self.n.require(self.view_bytes<=VIEW_BYTES,'RAW_VIEW_TOO_LARGE')
   key=digest(dump([self.cut,self.vector,self.context,DECODER_REVISION]).encode())
   self._space()
   with self.db:self.db.execute('INSERT OR IGNORE INTO raw_views VALUES(?,?,?,?,?,?)',(key,self.run,self.cut or '',dump(self.vector),self.context,dump(proof)))
   return out
  except self.n.Incomplete as e:
   if str(e) in {'RAW_REPLAY_PENDING','BUDGET_EXCEEDED'} and not hasattr(e,'budgetScope'):e.budgetScope='raw'
   raise
  except self.codec.DecodeError as e:raise self.n.Incomplete(str(e)) from None
  except (sqlite3.Error,OSError) as error:self._storage_error(error)
  finally:os.close(fd)
