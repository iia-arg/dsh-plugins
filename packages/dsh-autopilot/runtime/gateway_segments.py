"""Owner-only, no-cache physical G snapshots. Gamma owns raw event semantics."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
ENTRY={'schemaVersion','sourceId','sourceEpoch','segmentNo','file','closedAt','byteLength','sha256','generations'}
GENERATION={'generation','firstSeq','finalSeq','finalObservedAt','maxObservedAt','firstSegmentNo'}
MANIFEST={'schemaVersion','sourceId','sourceEpoch','active','segments','deletedMaxObservedAt','retainedFrom'}
TRANSPORT={'version','policyCli','node','nodeSha256'}

def segmented(p):return 'gatewayTransport' in p

def transport(n,p):
 t=p.get('gatewayTransport');n.require(type(t) is dict and set(t)==TRANSPORT,'G_SEGMENT_INVALID')
 n.require(type(t['version']) is int and t['version']==1,'G_SEGMENT_INVALID')
 n.require(type(t['nodeSha256']) is str and re.fullmatch('[0-9a-f]{64}',t['nodeSha256']),'NODE_PIN_MISMATCH')
 for k in ('policyCli','node'):n.require(type(t[k]) is str and Path(t[k]).is_absolute() and str(Path(t[k]).resolve())==t[k],'NODE_PIN_MISMATCH' if k=='node' else 'G_POLICY_INVALID')
 return t

def integer(n,value,minimum=0):
 n.require(type(value) is int and minimum<=value<=n.core.SAFE,'G_SEGMENT_INVALID');return value

def text(n,value):n.require(type(value) is str and 0<len(value)<=256,'G_SEGMENT_INVALID');return value

def identity(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,stat.S_IMODE(s.st_mode),s.st_nlink)

class Snapshot:
 def __init__(self,n,meter):self.n=n;self.meter=meter;self.files=[];self.metadata=0
 def directory(self,path,uid):
  n=self.n;path=Path(path)
  try:s=path.lstat()
  except FileNotFoundError:raise n.Incomplete('RETENTION_GAP') from None
  n.require(path.resolve()==path and stat.S_ISDIR(s.st_mode) and s.st_uid==uid and stat.S_IMODE(s.st_mode)==0o700,'G_SOURCE_UNSAFE')
  self.files.append((path,identity(s)))
 def read(self,path,uid,mode,limit,*,metadata=False):
  n=self.n;path=Path(path);n.require(path.resolve()==path,'G_SOURCE_UNSAFE');fd=None
  try:
   try:fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
   except FileNotFoundError:raise n.Incomplete('RETENTION_GAP') from None
   before=os.fstat(fd);n.require(stat.S_ISREG(before.st_mode) and before.st_uid==uid and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==mode,'G_SOURCE_UNSAFE')
   self.meter.check();n.require(before.st_size<=limit and before.st_size<=self.meter.budget-self.meter.bytes,'BUDGET_EXCEEDED')
   if metadata:n.require(self.metadata+before.st_size<=n.LIMIT,'BUDGET_EXCEEDED')
   chunks=[];offset=0
   while offset<before.st_size:
    self.meter.check();b=os.pread(fd,min(65536,before.st_size-offset),offset);self.meter.bytes+=len(b);n.require(bool(b),'G_SNAPSHOT_CHANGED');chunks.append(b);offset+=len(b)
   self.meter.check()
   try:after=path.lstat()
   except FileNotFoundError:raise n.Incomplete('G_SNAPSHOT_CHANGED') from None
   n.require(identity(before)==identity(os.fstat(fd))==identity(after),'G_SNAPSHOT_CHANGED')
   if metadata:self.metadata+=offset
   self.files.append((path,identity(after)));body=b''.join(chunks)
   self.meter.proofs.append(dict(kind='g-segment-input',path=str(path),uid=uid,bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),identity=list(identity(after))))
   return body
  finally:
   if fd is not None:os.close(fd)
 def recheck(self):
  for path,before in self.files:
   self.meter.check()
   try:after=path.lstat()
   except FileNotFoundError:raise self.n.Incomplete('G_SNAPSHOT_CHANGED') from None
   self.n.require(identity(after)==before and path.resolve()==path,'G_SNAPSHOT_CHANGED')

def verify_node(n,t,meter):
 """Hash and identity before/after reading; hash-to-exec race is outside the model."""
 fd=None
 try:
  path=Path(t['node']);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);before=os.fstat(fd)
  n.require(stat.S_ISREG(before.st_mode) and before.st_mode&0o111,'NODE_PIN_MISMATCH');digest=hashlib.sha256();offset=0
  while offset<before.st_size:
   meter.check();chunk=os.pread(fd,min(65536,before.st_size-offset),offset);n.require(bool(chunk),'NODE_PIN_MISMATCH');digest.update(chunk);offset+=len(chunk)
  meter.check();n.require(path.resolve()==path and identity(before)==identity(os.fstat(fd))==identity(path.lstat()) and digest.hexdigest()==t['nodeSha256'],'NODE_PIN_MISMATCH')
 except (OSError,ValueError):raise n.Incomplete('NODE_PIN_MISMATCH') from None
 finally:
  if fd is not None:os.close(fd)

def policy(n,p,snapshot):
 """Use the supplier's validator, not a second copy of its policy schema."""
 t=transport(n,p);cli=Path(t['policyCli']);data=cli.with_name('usage-limits.json')
 try:
  uid=data.lstat().st_uid;mode=stat.S_IMODE(data.lstat().st_mode);n.require(not mode&0o022,'G_POLICY_INVALID')
  raw=snapshot.read(data,uid,mode,65536,metadata=True)
  left=snapshot.meter.deadline-time.monotonic();n.require(left>0,'BUDGET_EXCEEDED')
  verify_node(n,t,snapshot.meter)
  left=snapshot.meter.deadline-time.monotonic();n.require(left>0,'BUDGET_EXCEEDED')
  q=subprocess.run([t['node'],str(cli)],capture_output=True,timeout=min(3,left),env={'PATH':'/usr/bin:/bin'})
  # One owner read above plus one read by the supplier's JSON import.
  snapshot.meter.bytes+=len(raw);snapshot.metadata+=len(raw);snapshot.meter.check();n.require(snapshot.meter.bytes<=snapshot.meter.budget and snapshot.metadata<=n.LIMIT,'BUDGET_EXCEEDED')
  if q.returncode!=0:
   error=n.Incomplete('G_POLICY_INVALID');error.unknownGatewayRead=True;raise error
  n.require(len(q.stdout)<=65536,'G_POLICY_INVALID');out=n.core.strict_json(q.stdout)
  n.require(type(out) is dict and out.get('schemaVersion')==3,'G_POLICY_INVALID')
  for key in ('legacyFileMaxBytes','segmentMaxBytes','maxRecordBytes'):n.require(type(out.get(key)) is int and 0<out[key]<=n.core.SAFE,'G_POLICY_INVALID')
  own=n.registration_module()
  n.require(out['legacyFileMaxBytes']==own.G_WRITER_LIMIT,'G_WRITER_LIMIT_MISMATCH')
  n.require(out['maxRecordBytes']==own.G_RECORD_ALLOWANCE,'G_RECORD_ALLOWANCE_MISMATCH')
  snapshot.recheck();return out
 except subprocess.TimeoutExpired:
  error=n.Incomplete('BUDGET_EXCEEDED');error.unknownGatewayRead=True;raise error from None
 except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):raise n.Incomplete('G_POLICY_INVALID') from None

def metadata_json(n,raw):
 try:return n.core.strict_json(raw)
 except (ValueError,UnicodeError,n.Incomplete):raise n.Incomplete('G_SEGMENT_INVALID') from None

def entry(n,e,m,limits):
 n.require(type(e) is dict and set(e)==ENTRY and type(e['schemaVersion']) is int and e['schemaVersion']==1 and e['sourceId']==m['sourceId'] and e['sourceEpoch']==m['sourceEpoch'],'G_SEGMENT_INVALID')
 no=integer(n,e['segmentNo']);integer(n,e['closedAt']);length=integer(n,e['byteLength'],1)
 n.require(length<=(limits['legacyFileMaxBytes']+limits['maxRecordBytes'] if no==0 else limits['segmentMaxBytes']),'G_SEGMENT_INVALID')
 n.require(e['file']==m['sourceEpoch']+'-'+str(no)+'.jsonl' and type(e['sha256']) is str and re.fullmatch('[0-9a-f]{64}',e['sha256']) and type(e['generations']) is list,'G_SEGMENT_INVALID')
 seen=set()
 for g in e['generations']:
  n.require(type(g) is dict and set(g)==GENERATION,'G_SEGMENT_INVALID');name=text(n,g['generation']);n.require(name not in seen,'G_SEGMENT_INVALID');seen.add(name)
  first=integer(n,g['firstSeq'],1);n.require(integer(n,g['finalSeq'],1)>=first,'G_SEGMENT_INVALID');integer(n,g['finalObservedAt']);n.require(integer(n,g['maxObservedAt'])>=g['finalObservedAt'] and integer(n,g['firstSegmentNo'])<=no,'G_SEGMENT_INVALID')

def manifest(n,value,anchor,limits):
 n.require(type(value) is dict and set(value)==MANIFEST and type(value['schemaVersion']) is int and value['schemaVersion']==1,'G_SEGMENT_INVALID')
 text(n,value['sourceId']);n.require(type(value['sourceEpoch']) is str and UUID.fullmatch(value['sourceEpoch']),'G_SEGMENT_INVALID');n.require(value['sourceId']==anchor['sourceId'] and value['sourceEpoch']==anchor['sourceEpoch'],'SOURCE_ID_MISMATCH')
 active=value['active'];n.require(type(active) is dict and set(active)=={'segmentNo','openedAt','origins'} and type(active['origins']) is dict,'G_SEGMENT_INVALID');integer(n,active['segmentNo']);integer(n,active['openedAt'])
 for name,origin in active['origins'].items():text(n,name);n.require(integer(n,origin)<=active['segmentNo'],'G_SEGMENT_INVALID')
 n.require(type(value['segments']) is list,'G_SEGMENT_INVALID');last=-1
 for e in value['segments']:
  entry(n,e,value,limits);n.require(last<e['segmentNo']<active['segmentNo'],'G_SEGMENT_INVALID');last=e['segmentNo']
 floor=integer(n,value['retainedFrom']);n.require(floor==(value['segments'][0]['segmentNo'] if value['segments'] else active['segmentNo']),'G_SEGMENT_INVALID')
 if value['deletedMaxObservedAt'] is not None:integer(n,value['deletedMaxObservedAt'])
 return value

def raw_rows(n,body,max_record,meter,*,active=False):
 n.require(not body or body.endswith(b'\n'),'G_SNAPSHOT_CHANGED' if active else 'G_SEGMENT_INVALID');rows=[]
 for line in body.splitlines():
  meter.check();n.require(0<len(line)+1<=max_record,'G_SEGMENT_INVALID');r=metadata_json(n,line);n.require(type(r) is dict,'G_SEGMENT_INVALID')
  if r.get('kind')=='source_gap' and r.get('scope')=='process' and (type(r.get('generation')) is not str or not r['generation']):raise n.Incomplete('SOURCE_GAP')
  text(n,r.get('generation'));integer(n,r.get('seq'),1);integer(n,r.get('observedAt'));rows.append(r)
 return rows

def summary(n,rows,origins,no):
 groups={}
 for r in rows:
  name=r['generation'];n.require(name in origins,'G_SEGMENT_INVALID')
  g=groups.setdefault(name,dict(generation=name,firstSeq=r['seq'],finalSeq=r['seq'],finalObservedAt=r['observedAt'],maxObservedAt=r['observedAt'],firstSegmentNo=origins[name]))
  g.update(finalSeq=r['seq'],finalObservedAt=r['observedAt'],maxObservedAt=max(g['maxObservedAt'],r['observedAt']))
 return list(groups.values())

def read_snapshot(n,p,cutoff,*,seconds,meter=None):
 """One bounded physical snapshot. No retry, writer call, parsed cache or groups()."""
 began=time.monotonic();meter=meter or n.Meter(n.core.SAFE,began+seconds);snapshot=Snapshot(n,meter);planned=None;closed_read=0
 try:
  t=transport(n,p);integer(n,cutoff);limits=policy(n,p,snapshot);active=Path(p['sources']['gateway']);home=Path(p['home']);n.require(active.is_absolute() and active.resolve()==active and active.is_relative_to(home) and active.name=='gateway-v1.jsonl','G_SEGMENT_INVALID')
  snapshot.directory(active.parent,p['uid']);directory=active.parent/'segments';snapshot.directory(directory,p['uid'])
  def no_intent():
   try:(directory/'intent.json').lstat()
   except FileNotFoundError:return
   raise n.Incomplete('G_SNAPSHOT_CHANGED')
  no_intent()
  enrollment=metadata_json(n,snapshot.read(active.with_name(active.name+'.source.json'),p['uid'],0o400,65536,metadata=True))
  n.require(type(enrollment) is dict and set(enrollment)=={'schemaVersion','sourceId','sourceEpoch','sourceCreatedAt'} and type(enrollment['schemaVersion']) is int and enrollment['schemaVersion']==1,'G_SEGMENT_INVALID')
  text(n,enrollment['sourceId']);n.require(type(enrollment['sourceEpoch']) is str and UUID.fullmatch(enrollment['sourceEpoch']),'G_SEGMENT_INVALID');birth=integer(n,enrollment['sourceCreatedAt'])
  m=manifest(n,metadata_json(n,snapshot.read(directory/'manifest.json',p['uid'],0o600,n.LIMIT,metadata=True)),enrollment,limits)
  if cutoff<birth:raise n.Incomplete('RETENTION_GAP')
  if m['deletedMaxObservedAt'] is not None and cutoff<=m['deletedMaxObservedAt']:raise n.Incomplete('RETENTION_GAP')
  # All retained seals are checked before selection; one corrupt descriptor may
  # otherwise make a live generation appear old and disappear from P1.
  all_origins={};selected=set()
  for e in m['segments']:
   seal=metadata_json(n,snapshot.read(directory/e['file'].replace('.jsonl','.seal.json'),p['uid'],0o400,n.LIMIT,metadata=True));n.require(seal==e,'G_SEGMENT_INVALID')
   for g in e['generations']:
    if g['generation'] in all_origins:n.require(all_origins[g['generation']]==g['firstSegmentNo'],'G_SEGMENT_INVALID')
    all_origins[g['generation']]=g['firstSegmentNo']
    if g['maxObservedAt']>=cutoff:selected.add(g['generation'])
  active_body=snapshot.read(active,p['uid'],0o600,limits['segmentMaxBytes']);active_rows=raw_rows(n,active_body,limits['maxRecordBytes'],meter,active=True)
  for name,origin in m['active']['origins'].items():
   if name in all_origins:n.require(all_origins[name]==origin,'G_SEGMENT_INVALID')
   all_origins[name]=origin
  for r in active_rows:
   n.require(r['generation'] in m['active']['origins'],'G_SEGMENT_INVALID')
   if r['observedAt']>=cutoff:selected.add(r['generation'])
  available={e['segmentNo'] for e in m['segments']}|{m['active']['segmentNo']}
  for name in selected:
   n.require(name in all_origins,'G_SEGMENT_INVALID')
   if all_origins[name] not in available or all_origins[name]<m['retainedFrom']:raise n.Incomplete('RETENTION_GAP')
  needed=[e for e in m['segments'] if not e['generations'] or any(g['generation'] in selected for g in e['generations'])]
  # A missing interior physical range cannot be silently reclassified as producer
  # seq loss. Conservative refusal also covers a partially published GC frontier.
  if selected:
   first=min(all_origins[name] for name in selected)
   if len([no for no in available if first<=no<=m['active']['segmentNo']])!=m['active']['segmentNo']-first+1:raise n.Incomplete('RETENTION_GAP')
  planned=meter.bytes+sum(e['byteLength'] for e in needed)+limits['maxRecordBytes'];n.require(planned<=n.core.SAFE,'BUDGET_EXCEEDED');meter.budget=min(meter.budget,planned);rows=[]
  for e in needed:
   maximum=limits['legacyFileMaxBytes']+limits['maxRecordBytes'] if e['segmentNo']==0 else limits['segmentMaxBytes'];n.require(e['byteLength']<=maximum,'G_SEGMENT_INVALID')
   body=snapshot.read(directory/e['file'],p['uid'],0o400,e['byteLength']);n.require(len(body)==e['byteLength'] and hashlib.sha256(body).hexdigest()==e['sha256'],'G_SEGMENT_CORRUPT');part=raw_rows(n,body,limits['maxRecordBytes'],meter);closed_read+=1
   origins={g['generation']:g['firstSegmentNo'] for g in e['generations']};n.require(summary(n,part,origins,e['segmentNo'])==e['generations'],'G_SEGMENT_INVALID');rows.extend(r for r in part if r['generation'] in selected)
  rows.extend(r for r in active_rows if r['generation'] in selected);no_intent();snapshot.recheck();meter.check()
  return dict(rows=rows,sourceBytes=meter.bytes,sourceSeconds=max(0,time.monotonic()-began),plannedBytes=planned,metadataBytes=snapshot.metadata,closedSegmentsRead=closed_read,proof=meter.proofs,sourceId=m['sourceId'],sourceEpoch=m['sourceEpoch'],sourceCreatedAt=birth)
 except n.Incomplete as error:
  error.gatewayBytes=None if getattr(error,'unknownGatewayRead',False) else meter.bytes;error.gatewaySeconds=max(0,time.monotonic()-began);error.segmentPlannedBytes=planned;raise
 except (OSError,ValueError,KeyError,TypeError,RecursionError) as error:
  out=n.Incomplete('G_SEGMENT_INVALID');out.gatewayBytes=meter.bytes;out.gatewaySeconds=max(0,time.monotonic()-began);out.segmentPlannedBytes=planned;raise out from None
