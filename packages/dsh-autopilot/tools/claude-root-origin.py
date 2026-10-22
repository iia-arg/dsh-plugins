"""Root-mail origin for the pinned Claude reader. No model or source writes."""
import datetime,hashlib,json,math,os,pwd,re,sqlite3,stat,subprocess
from pathlib import Path

import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = (_limits_here.parent / 'lib/task_limits.py' if (_limits_here.parent / 'lib/task_limits.py').is_file() else _limits_here.parent / 'pilot/task_limits.py')
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT
MAX=128*1024*1024
class Refusal(ValueError):pass
def need(ok,code):
 if not ok:raise Refusal(code)
def protected(path,directory=False):
 p=Path(path);need(p.is_absolute() and p.resolve()==p,'ROOT_PATH_UNSAFE')
 for f in [p,*p.parents]:
  s=f.lstat();need(s.st_uid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'ROOT_PATH_UNSAFE')
 need(p.is_dir() if directory else p.is_file(),'ROOT_PATH_UNSAFE')
 return p

def read(path,limit=MAX):
 p=Path(path);need(p.resolve()==p,'SOURCE_LINK');fd=os.open(p,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size<=limit,'SOURCE_TYPE_SIZE')
  with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(limit+1)
  after=os.fstat(fd);stamp=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
  need(len(raw)<=limit and stamp(before)==stamp(after)==stamp(p.stat()),'SOURCE_CHANGED');return raw
 finally:os.close(fd)
def strict(raw):
 def pairs(items):
  out={}
  for k,v in items:need(k not in out,'JSON_DUPLICATE');out[k]=v
  return out
 return json.loads(raw,object_pairs_hook=pairs)
def utc(ms):return datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z')
def database(reader,path,query,proof):
 need(Path(path).resolve()==Path(path) and Path(path).stat().st_size<=MAX,'SOURCE_TYPE_SIZE');coverage={};result=reader.ledger_snapshot({'ledger':str(path)},coverage,query);proof[str(path)]=coverage['ledgerSnapshot'];return result

def dsh(path):
 raw=read(path)
 # File stdin avoids a compressed-input/output pipe deadlock.
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW);p=subprocess.Popen(['/usr/bin/zstd','-dc'],stdin=fd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL);os.close(fd);events=[];total=0
 try:
  while True:
   line=p.stdout.readline(USAGE_BYTE_LIMIT+1)
   if not line:break
   total+=len(line);need(len(line)<=USAGE_BYTE_LIMIT and total<=MAX,'DSH_SIZE');events.append(strict(line))
  need(p.wait(timeout=5)==0,'DSH_DECODE')
 finally:
  if p.poll() is None:p.kill();p.wait()
  p.stdout.close()
 need(read(path)==raw,'SOURCE_CHANGED');need(events and events[0].get('type')=='session','DSH_HEADER')
 return events[0],events[1:],hashlib.sha256(raw).hexdigest()

def boundary(header,events,created,turn,wanted):
 need(header.get('createdAt')==created and not header.get('isSeeded',False),'DSH_HEADER')
 queues={'next-turn':[],'next-step':[]};current=None;starts=[];ends=[];claims=[];notices=[]
 for e in events:
  typ=e.get('type');data=e.get('data',{})
  if typ=='turn/start':current=data['turn']
  if typ=='agent/inbox/spliced':
   target=data['target'];need(target in queues and type(data.get('start')) is int and type(data.get('inserted')) is list,'DSH_INBOX');n=data.get('removedCount',0);start=data['start'];need(type(n) is int and 0<=start<=len(queues[target]) and 0<=n<=len(queues[target])-start,'DSH_INBOX');removed=queues[target][start:start+n];queues[target][start:start+n]=data['inserted']
   for m in removed:
    if current==turn:
     need(data.get('outcome')!='canceled','DSH_CANCELED');claims.append(m['id'])
     if m['id'] not in wanted:
      source=m.get('source',{});need(m.get('role')=='user' and source.get('kind')=='subagent-settled' and source.get('form')=='notice' and isinstance(source.get('senderSessionId'),str),'MIXED_TURN');notices.append({'id':m['id'],'childSessionId':source['senderSessionId']})
  if data.get('turn')==turn and typ in ('turn/start','turn/end'):
   need(type(e.get('time')) is int and type(e.get('seq')) is int,'DSH_BOUNDARY');(starts if typ=='turn/start' else ends).append(e)
  if typ=='turn/end':current=None
 need(len(starts)==len(ends)==1 and starts[0]['seq']<ends[0]['seq'] and starts[0]['time']<ends[0]['time'],'DSH_BOUNDARY')
 need(ends[0]['data'].get('reason',{}).get('kind')=='completed','DSH_NOT_COMPLETE');need(len(claims)==len(set(claims)) and set(wanted)<=set(claims),'MIXED_TURN')
 return starts[0]['time'],ends[0]['time'],{'startSeq':starts[0]['seq'],'endSeq':ends[0]['seq'],'claimedIds':claims,'settledNotices':notices}

def task_envelope(env):
 # Historical admission checks structure, never today's filesystem/deadline policy.
 need(type(env) is dict and set(env)=={'route','kind','run','sender','task'},'MAIL_INVALID')
 need(env['route']=='AUTOPILOT-PILOT/1' and env['kind']=='task' and env['sender']=='master','MAIL_INVALID')
 t=env['task'];fields={'job_id','ticket','recipient','role','cwd','zone','requirements','brief','deadline','context_request','parent_job_id','context_ref'}
 need(type(t) is dict and set(t)==fields,'MAIL_INVALID')
 identifier=lambda x:isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}',x) is not None
 need(all(identifier(t[k]) for k in ('job_id','ticket')) and t['recipient']=='sova' and t['role'] in ('executor','reviewer','acceptance','researcher'),'MAIL_INVALID')
 need(t['context_request'] in ('fresh','resume') and isinstance(t['brief'],str) and 0<len(t['brief'])<=16000,'MAIL_INVALID')
 need(type(t['deadline']) in (int,float) and (type(t['deadline']) is int or math.isfinite(t['deadline'])) and t['deadline']>0,'MAIL_INVALID')
 need(isinstance(t['cwd'],str) and Path(t['cwd']).is_absolute(),'MAIL_INVALID')
 need(type(t['requirements']) is list and t['requirements'] and all(isinstance(x,str) and re.fullmatch(r'R[0-9]+(?:\.[0-9]+)?',x) for x in t['requirements']),'MAIL_INVALID')
 need(type(t['zone']) is list and t['zone'] and all(isinstance(x,str) and x and '\\' not in x and '\x00' not in x and not Path(x).is_absolute() and all(part not in ('','.','..') for part in x.split('/')) for x in t['zone']),'MAIL_INVALID')
 need(all(t[k] is None or identifier(t[k]) for k in ('parent_job_id','context_ref')),'MAIL_INVALID')
 need(t['context_request']!='resume' or (t['parent_job_id'] and t['context_ref']),'MAIL_INVALID')

def collect(reader,root,run,g0_record=None):
 need(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}',run) is not None,'RUN_ID_INVALID');root=Path(root);protected(root,True)
 at=lambda p:root/p.lstrip('/');proof={};mail=at('/var/lib/autopilot-mail/mail.sqlite');ledger=at('/opt/sova/workspace/.message-receipts/receipts.sqlite');sdk=at('/opt/sova/.claude/projects/-opt-sova');sessions=at('/opt/sova/.dsh/sessions/--opt-sova-workspace--')
 def rows(path,table):
  with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as con:
   con.row_factory=sqlite3.Row;con.execute('PRAGMA query_only=ON');need(con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone() is not None,'SOURCE_TABLE_MISSING');return [dict(r) for r in con.execute('SELECT * FROM '+table)]
 mails=database(reader,mail,lambda p:rows(p,'messages'),proof);sources=database(reader,ledger,lambda p:(rows(p,'receipts'),rows(p,'mail_sdk_requests')),proof);receipts,requests=sources;chosen=[];g0=None
 if g0_record is not None:
  g0_record=protected(g0_record,True);g0=strict(read(protected(g0_record/'pusk.json')));need(g0.get('run_id')==run,'G0_RUN_MISMATCH')
 for msg in mails:
  if msg['sender']!='master' or msg['recipient']!='sova':continue
  body=msg['body'];digest=hashlib.sha256(body.encode()).hexdigest()
  if g0 is not None:
   if digest!=g0.get('letter_sha256'):continue
   need(run in body,'G0_RUN_MISMATCH');chosen.append(msg);continue
  if not body.startswith('AUTOPILOT-PILOT/1\n'):continue
  try:env=strict(body.split('\n',1)[1])
  except (ValueError,TypeError):
   need(run not in body,'MAIL_INVALID');continue
  need(type(env) is dict,'MAIL_INVALID')
  if env.get('run')!=run:continue
  task_envelope(env);chosen.append(msg)
 need(chosen,'RUN_MAIL_MISSING');need(g0 is None or len(chosen)==1,'G0_MAIL_AMBIGUOUS');roots={};deliveries=[]
 for msg in chosen:
  need(msg['sender_uid']==pwd.getpwnam('master').pw_uid,'MAIL_SENDER');matched=[r for r in receipts if r['logical_key']=='ap-notice:'+msg['id']];need(len(matched)==1,'RECEIPT_AMBIGUOUS');r=matched[0]
  need(r['finished_at'] is not None and r['claimed_turn'] is not None and r['outcome']=='turn_completed' and not r.get('blocked'),'RECEIPT_NOT_COMPLETE');key=(r['session_id'],r['session_created'],r['claimed_turn']);roots.setdefault(key,[]).append(r);deliveries.append({'mailId':msg['id'],'bodySha256':hashlib.sha256(msg['body'].encode()).hexdigest(),'receiptId':r['id']})
 parent_rows={};bounds=[];root_proof=[]
 for (sid,created,turn),rs in roots.items():
  need(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,199}',sid) is not None,'DSH_ID');header,events,digest=dsh(sessions/sid/'session.v4.jsonl.zstd');need(header.get('id')==sid,'DSH_HEADER');start,end,ev=boundary(header,events,created,turn,[r['dsh_id'] for r in rs]);owners={r['execution_owner'] for r in rs};need(len(owners)==1 and None not in owners,'GENERATION_AMBIGUOUS');matching=[r for r in requests if (r['session_id'],r['session_created'],r['turn'])==(sid,created,turn)];need(matching,'SDK_REQUEST_MISSING')
  for r in matching:
   need(r['generation'] in owners and r['state']=='terminal' and type(r['terminal_at']) is int and start<=r['started_at']<=r['terminal_at']<=end,'SDK_REQUEST_NOT_COMPLETE');binding=strict(r['binding_json']);need(all(binding[k]==r[k] for k in ('generation','request_id','session_id','session_created','turn')) and binding['recipient']=='sova','BINDING_MISMATCH');parent_rows[r['request_id']]=r
  bounds.append((start,end));root_proof.append({'sessionId':sid,'sessionCreated':created,'turn':turn,'start':start,'end':end,'sourceSha256':digest,**ev})
 if g0 is not None:
  book=strict(read(protected(g0_record/'g0-book.json')));ref=book['parent_before']['request'];need(ref['request_id'] in parent_rows and all(parent_rows[ref['request_id']][k]==ref[k] for k in ('session_id','session_created','turn')),'G0_ROOT_MISMATCH')
 return {'runId':run,'startedAt':utc(min(x[0] for x in bounds)),'endedAt':utc(max(x[1] for x in bounds))},list(parent_rows.values()),requests,{'deliveries':deliveries,'roots':root_proof,'databases':proof},ledger,sdk

def verify(m):
 need(os.geteuid()==0,'ROOT_REQUIRED');origin=m['runRecord'];directory=protected(origin['directory'],True);record=protected(directory/'root-mail.json');raw=read(record,1024*1024);need(hashlib.sha256(raw).hexdigest()==origin['sha256'],'ROOT_RECORD_CHANGED');r=strict(raw)
 need(all(m[k]==r[k] for k in ('runId','startedAt','endedAt','ledger','sdkDirectory')) and m['requests']==r['requests'] and m['children']=='explicit','ROOT_RECORD_MISMATCH')
 return r['proof']['databases'][m['ledger']]
