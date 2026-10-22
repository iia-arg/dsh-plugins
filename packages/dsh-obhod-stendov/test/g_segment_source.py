"""Read-only transport-v1 metadata and first active timestamp; full raw/SHA/P1 are outside scope."""
import json,os,re,stat,uuid
from pathlib import Path
MAX_FILES=16384
MAX_JSON=8*1024*1024
MAX_METADATA=32*1024*1024
SAFE=2**53-1
# Operator settings. Change by a reviewed package window after the first week;
# the measured rate never changes these thresholds and no state is written.
WEEK_SECONDS=7*24*60*60
WARN_BYTES=1024**3
WARN_FILES=2*(7*24*2+2)
THRESHOLD_STAGE='стартовые'
GC_GRACE_SECONDS=60*60
ROTATION_GRACE_SECONDS=15*60
class Blind(ValueError):pass
class Unsafe(RuntimeError):pass

def integer(value,minimum=0):return type(value) is int and minimum<=value<=SAFE

def typed_equal(a,b):
 if type(a) is not type(b):return False
 if isinstance(a,dict):return a.keys()==b.keys() and all(typed_equal(a[k],b[k]) for k in a)
 if isinstance(a,list):return len(a)==len(b) and all(typed_equal(x,y) for x,y in zip(a,b))
 return a==b

def validate_policy(p):
 keys={'schemaVersion','legacyFileMaxBytes','segmentMaxBytes','segmentMaxAgeSeconds','rawRetentionSeconds','maxRecordBytes'}
 if not isinstance(p,dict) or set(p)!=keys or type(p['schemaVersion']) is not int or p['schemaVersion']!=3 or any(not integer(p[k],1) for k in keys-{'schemaVersion'}):raise Blind('policy schemaVersion3: негодные поля/типы')
 if p['segmentMaxBytes']<p['maxRecordBytes'] or p['maxRecordBytes']>65536 or p['rawRetentionSeconds']<780:raise Blind('policy schemaVersion3: негодные пределы')
 return {k:p[k] for k in keys}

def stamp(s):return s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns

def canonical_uuid(s):
 try:return isinstance(s,str) and str(uuid.UUID(s))==s
 except (ValueError,AttributeError):return False

def inspect_source(directory,uid,policy,now_ms):
 p=validate_policy(policy);directory=Path(directory);segments=directory/'segments';seen={};metadata=0
 def info(path,mode=None,is_dir=False,missing='G_SEGMENT_MISSING'):
  try:s=path.lstat()
  except FileNotFoundError:raise Blind(missing+': '+str(path)) from None
  valid_type=stat.S_ISDIR(s.st_mode) if is_dir else stat.S_ISREG(s.st_mode)
  if not valid_type or s.st_uid!=uid or mode is not None and s.st_mode&0o777!=mode or not is_dir and s.st_nlink!=1:raise Unsafe('тип/uid/mode/nlink: '+str(path))
  seen[path]=stamp(s);return s
 def object_pairs(pairs):
  if len({k for k,v in pairs})!=len(pairs):raise Blind('повтор ключа JSON')
  return dict(pairs)
 def constant(value):raise Blind('не JSON-число')
 def read(path,mode):
  nonlocal metadata
  before=info(path,mode)
  if before.st_size>MAX_JSON or metadata+before.st_size>MAX_METADATA:raise Blind('metadata вне бюджета чтения: '+str(path))
  fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   if stamp(os.fstat(fd))!=stamp(before):raise Blind('metadata изменилась: '+str(path))
   with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(MAX_JSON+1)
   if len(raw)>MAX_JSON or len(raw)!=before.st_size:raise Blind('metadata размер изменился: '+str(path))
   if stamp(os.fstat(fd))!=stamp(before):raise Blind('metadata изменилась: '+str(path))
  finally:os.close(fd)
  metadata+=len(raw)
  try:return json.loads(raw,object_pairs_hook=object_pairs,parse_constant=constant)
  except (UnicodeError,ValueError,RecursionError):raise Blind('негодный JSON: '+str(path)) from None
 def exact(obj,keys,label):
  if not isinstance(obj,dict) or set(obj)!=set(keys.split()):raise Blind('негодная схема '+label)
 def at(value,label):
  if not integer(value) or value>now_ms:raise Blind('негодное/будущее время '+label)
 info(directory,0o700,True);info(segments,0o700,True)
 # These unsafe active guards are also the initializer's early refusal path.
 active_info=info(directory/'gateway-v1.jsonl',0o600)
 anchor=read(directory/'gateway-v1.jsonl.source.json',0o400)
 exact(anchor,'schemaVersion sourceId sourceEpoch sourceCreatedAt','source.json')
 if type(anchor['schemaVersion']) is not int or anchor['schemaVersion']!=1 or not canonical_uuid(anchor['sourceId']) or not canonical_uuid(anchor['sourceEpoch']):raise Blind('негодная source.json identity/schema')
 at(anchor['sourceCreatedAt'],'sourceCreatedAt')
 manifest=read(segments/'manifest.json',0o600)
 exact(manifest,'schemaVersion sourceId sourceEpoch active segments deletedMaxObservedAt retainedFrom','manifest')
 if type(manifest['schemaVersion']) is not int or manifest['schemaVersion']!=1 or any(manifest[k]!=anchor[k] for k in ['sourceId','sourceEpoch']):raise Blind('manifest/source.json identity mismatch')
 active=manifest['active'];exact(active,'segmentNo openedAt origins','manifest.active')
 if not integer(active['segmentNo']) or not isinstance(active['origins'],dict) or not integer(manifest['retainedFrom']):raise Blind('негодный active/retainedFrom')
 at(active['openedAt'],'active.openedAt')
 for generation,no in active['origins'].items():
  if not generation or len(generation.encode('utf-16-le','surrogatepass'))//2>256 or not integer(no) or no>active['segmentNo']:raise Blind('негодный active.origins')
 if manifest['deletedMaxObservedAt'] is not None:at(manifest['deletedMaxObservedAt'],'deletedMaxObservedAt')
 if not isinstance(manifest['segments'],list) or len(manifest['segments'])>MAX_FILES//2:raise Blind('негодный/слишком большой manifest.segments')
 info(segments/'writer.lock',0o600)
 expected={'manifest.json','writer.lock'};last=manifest['retainedFrom']-1;closed=[];raw_sizes={}
 for entry in manifest['segments']:
  exact(entry,'schemaVersion sourceId sourceEpoch segmentNo file closedAt byteLength sha256 generations','seal')
  no=entry['segmentNo'];filename=entry['file']
  if (type(entry['schemaVersion']) is not int or entry['schemaVersion']!=1 or any(entry[k]!=anchor[k] for k in ['sourceId','sourceEpoch']) or not integer(no)
      or no!=last+1 or no>=active['segmentNo'] or filename!=anchor['sourceEpoch']+'-'+str(no)+'.jsonl'):raise Blind('негодная цепочка seal/segmentNo/file')
  at(entry['closedAt'],'closedAt')
  maximum=p['legacyFileMaxBytes']+p['maxRecordBytes'] if no==0 else p['segmentMaxBytes']
  if not integer(entry['byteLength'],1) or entry['byteLength']>maximum or not isinstance(entry['sha256'],str) or not re.fullmatch('[0-9a-f]{64}',entry['sha256']):raise Blind('негодные byteLength/sha256 seal')
  if not isinstance(entry['generations'],list) or not entry['generations']:raise Blind('негодные generations seal')
  generations=set()
  for g in entry['generations']:
   exact(g,'generation firstSeq finalSeq finalObservedAt maxObservedAt firstSegmentNo','generation')
   name=g['generation']
   if (not isinstance(name,str) or not name or len(name.encode('utf-16-le','surrogatepass'))//2>256 or name in generations or not integer(g['firstSeq'],1)
       or not integer(g['finalSeq'],g['firstSeq']) or not integer(g['firstSegmentNo']) or g['firstSegmentNo']>no):raise Blind('негодные generation/seq/origin')
   at(g['finalObservedAt'],'finalObservedAt');at(g['maxObservedAt'],'maxObservedAt')
   if g['maxObservedAt']<g['finalObservedAt']:raise Blind('негодный maxObservedAt')
   generations.add(name)
  raw=segments/filename;seal=raw.with_suffix('.seal.json');raw_info=info(raw,0o400)
  if raw_info.st_size!=entry['byteLength']:raise Blind('raw byteLength не совпал: '+str(raw))
  if not typed_equal(read(seal,0o400),entry):raise Blind('manifest/seal не совпали (значения/типы): '+str(seal))
  expected.update([raw.name,seal.name]);raw_sizes[no]=raw_info.st_size;closed.append(entry);last=no
 if last+1!=active['segmentNo']:raise Blind('неполная цепочка retainedFrom/active')
 maximum=p['legacyFileMaxBytes']+p['maxRecordBytes'] if active['segmentNo']==0 else p['segmentMaxBytes']
 if active_info.st_size>maximum:raise Blind('active превышает предел своего сегмента')
 first_observed=None
 if active_info.st_size:
  path=directory/'gateway-v1.jsonl';fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   if stamp(os.fstat(fd))!=stamp(active_info):raise Blind('active изменился: '+str(path))
   with os.fdopen(fd,'rb',buffering=0,closefd=False) as stream:raw=stream.readline(p['maxRecordBytes']+1)
   if stamp(os.fstat(fd))!=stamp(active_info):raise Blind('active изменился: '+str(path))
  finally:os.close(fd)
  if len(raw)>p['maxRecordBytes'] or not raw.endswith(b'\n'):raise Blind('active первая строка незавершена/вне maxRecordBytes: '+str(path))
  try:first=json.loads(raw,object_pairs_hook=object_pairs,parse_constant=constant)
  except (UnicodeError,ValueError,RecursionError):raise Blind('негодный JSON первой строки active: '+str(path)) from None
  if not isinstance(first,dict):raise Blind('негодная первая строка active: '+str(path))
  first_observed=first.get('observedAt');at(first_observed,'active.firstObservedAt')
 names=[];sizes={};allocated=active_info.st_blocks*512
 with os.scandir(segments) as iterator:
  for item in iterator:
   if len(names)>=MAX_FILES:raise Blind('перечень segments больше '+str(MAX_FILES))
   names.append(item.name);path=segments/item.name
   if item.name in expected:s=path.lstat()
   else:
    # Unknown regular files are measured as orphans, not read as trusted metadata.
    try:s=info(path)
    except Unsafe as error:raise Blind('небезопасный лишний объект: '+str(path)) from error
    if s.st_mode&0o777 not in {0o400,0o600}:raise Blind('негодный режим лишнего объекта: '+str(path))
   sizes[item.name]=s.st_size;allocated+=s.st_blocks*512
 if not expected.issubset(names):raise Blind('G_SEGMENT_MISSING: набор файлов изменился')
 intent='intent.json' in names
 if intent:
  # Either a transaction or its failed recovery: no stable validated snapshot yet.
  raise Blind('intent.json: незавершённая транзакция seal/GC, срез не подтверждён')
 orphans=sorted(set(names)-expected-{'intent.json'})
 root_bytes=0;root_names=[]
 with os.scandir(directory) as iterator:
  for item in iterator:
   if len(root_names)+len(names)>=MAX_FILES:raise Blind('перечень источника больше '+str(MAX_FILES))
   root_names.append(item.name)
   if item.name in {'gateway-v1.jsonl','gateway-v1.jsonl.source.json','segments'}:continue
   path=directory/item.name
   try:s=info(path)
   except Unsafe as error:raise Blind('небезопасный лишний объект: '+str(path)) from error
   if s.st_mode&0o777 not in {0o400,0o600}:raise Blind('негодный режим лишнего объекта: '+str(path))
   root_bytes+=s.st_size;allocated+=s.st_blocks*512;orphans.append('../'+item.name)
 anchor_info=(directory/'gateway-v1.jsonl.source.json').lstat();allocated+=anchor_info.st_blocks*512+directory.lstat().st_blocks*512+segments.lstat().st_blocks*512
 for path,before in seen.items():
  try:after=path.lstat()
  except FileNotFoundError:raise Blind('срез изменился: '+str(path)) from None
  if stamp(after)!=before:raise Blind('срез изменился: '+str(path))
 recent=[e for e in closed if now_ms-WEEK_SECONDS*1000<e['closedAt']<=now_ms];closed_bytes=sum(e['byteLength'] for e in recent)
 return dict(sourceId=anchor['sourceId'],sourceEpoch=anchor['sourceEpoch'],sourceCreatedAt=anchor['sourceCreatedAt'],bytes=active_info.st_size+anchor_info.st_size+sum(sizes.values())+root_bytes,allocated=allocated,
             segmentFiles=len(names),closedSegments=len(closed),oldestClosedAt=min((e['closedAt'] for e in closed),default=None),activeNo=active['segmentNo'],activeOpenedAt=active['openedAt'],firstObservedAt=first_observed,activeBytes=active_info.st_size,rawSizes=raw_sizes,
             intent=intent,orphans=orphans,files=sorted(names),metadataBytesRead=metadata,closedBytes7d=closed_bytes,closedCount7d=len(recent),rateBytesPerSecond=closed_bytes/WEEK_SECONDS,sourceFiles=len(names)+len(root_names)-1)

def assess(snapshot,policy,now_ms):
 p=validate_policy(policy);expected=2*((p['rawRetentionSeconds']+p['segmentMaxAgeSeconds']-1)//p['segmentMaxAgeSeconds'])+2
 warnings=[]
 if snapshot['segmentFiles']>WARN_FILES:warnings.append('число файлов '+str(snapshot['segmentFiles'])+' > '+str(WARN_FILES))
 if snapshot['bytes']>WARN_BYTES:warnings.append('размер источника '+str(snapshot['bytes'])+' > '+str(WARN_BYTES)+' ('+THRESHOLD_STAGE+')')
 growth=list(warnings);gc_lagging=snapshot['oldestClosedAt'] is not None and now_ms-snapshot['oldestClosedAt']>(p['rawRetentionSeconds']+GC_GRACE_SECONDS)*1000
 if gc_lagging:warnings.append('GC отстаёт: самый старый закрытый сегмент старше retention+час')
 rotation_limit=p['segmentMaxAgeSeconds']+ROTATION_GRACE_SECONDS
 rotation_lagging=snapshot['activeBytes']>0 and now_ms-snapshot['firstObservedAt']>rotation_limit*1000
 if rotation_lagging:warnings.append('ротация стоит: непустой active старше предела+15мин')
 extra=[]
 if snapshot['orphans']:extra.append('лишние/orphan файлы: '+str(len(snapshot['orphans'])))
 if snapshot['intent']:extra.append('intent.json: незавершённая транзакция seal/GC')
 warnings+=extra;hourly_n=(p['rawRetentionSeconds']+3600-1)//3600
 return dict(expectedFiles=expected,hourlyExpectedFiles=2*(hourly_n+1)+4+2,fileWarnAbove=WARN_FILES,byteWarnAbove=WARN_BYTES,startupThreshold=THRESHOLD_STAGE=='стартовые',thresholdStage=THRESHOLD_STAGE,warnings=warnings,growthWarnings=growth,gcLagging=gc_lagging,rotationLagging=rotation_lagging,rotationWarnAfterSeconds=rotation_limit,extraWarnings=extra)
