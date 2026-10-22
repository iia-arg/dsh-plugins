"""File-only guards for a Codex writer probe. This is not an AP/DSH producer."""
import datetime,hashlib,json,os,pwd,re,stat
from pathlib import Path
MASTER=pwd.getpwnam('master')
METRICS=('modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens')
def read_regular(p,limit=8*1024*1024):
 p=Path(p)
 if p.resolve()!=p:raise ValueError('noncanonical probe file')
 fd=os.open(p,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>limit:raise ValueError('unsafe probe file type/size')
  with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read(limit+1)
  if len(data)>limit:raise ValueError('probe file exceeds bound')
  return data
 finally:os.close(fd)
def sha(p):return hashlib.sha256(read_regular(p)).hexdigest()
def source_header(p):
 p=Path(p)
 if p.resolve()!=p:raise ValueError('noncanonical source rollout')
 fd=os.open(p,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
 try:
  st=os.fstat(fd)
  if not stat.S_ISREG(st.st_mode) or st.st_size>64*1024*1024:raise ValueError('unsafe source rollout type/size')
  raw=os.read(fd,65536)
  if b'\n' not in raw:raise ValueError('source header exceeds64KiB')
  return json.loads(raw.split(b'\n',1)[0])
 finally:os.close(fd)

def json_file(p,uid,limit=8*1024*1024):
 p=Path(p);s=p.lstat()
 if not stat.S_ISREG(s.st_mode) or p.resolve()!=p or s.st_uid!=uid or s.st_mode&0o022 or s.st_size>limit:raise ValueError('unsafe probe file: '+str(p))
 return json.loads(read_regular(p,limit))

def control(p):
 p=Path(p);c=json_file(p,0,65536);parent=p.parent.lstat()
 if c.get('schema')!=1 or c.get('kind')!='ap017-writer-probe' or c.get('scope') not in {'production','copy-fixture'}:raise ValueError('probe control schema/scope differs')
 if (parent.st_uid,parent.st_gid)!=(0,MASTER.pw_gid) or stat.S_IMODE(parent.st_mode) not in (0o750,0o700):raise ValueError('probe parent must be root:master0750 or sealed0700')
 if (c['scope']=='production')!=(c.get('root')=='/'):raise ValueError('probe scope/root differs')
 if set(c.get('files',{}))!={'cli','counter','measure','template'}:raise ValueError('probe file set differs')
 if not re.fullmatch('[0-9a-f]{32}',c.get('window','')) or c['project']!=str(p.parent/'project'):raise ValueError('invalid probe window/project')
 if not re.fullmatch('[0-9a-f-]{36}',c.get('thread','')):raise ValueError('explicit source thread required')
 if Path(c['root']).resolve()!=Path(c['root']):raise ValueError('noncanonical root')
 for label,row in c['files'].items():
  f=Path(row['path']);s=f.lstat()
  if not stat.S_ISREG(s.st_mode) or f.resolve()!=f or s.st_uid!=0 or s.st_mode&0o022 or sha(f)!=row['sha256']:raise ValueError('release pin differs: '+label)
 return c

def state(p):
 p=Path(p);s=p.lstat()
 private_parent=p.parent.lstat()
 if not stat.S_ISREG(s.st_mode) or p.resolve()!=p or s.st_uid!=MASTER.pw_uid or s.st_mode&0o002 or s.st_size>8*1024*1024:raise ValueError('unsafe state file')
 if s.st_mode&0o020 and (private_parent.st_uid!=MASTER.pw_uid or stat.S_IMODE(private_parent.st_mode)!=0o700):raise ValueError('group-writable state outside private0700')
 raw=read_regular(p).decode()
 if '=' not in raw or raw.split('=',1)[0].strip()!='window.STATE':raise ValueError('state prefix differs')
 return json.loads(raw.split('=',1)[1])

def numeric(value,run):
 if not isinstance(value,dict) or set(value)!={'schemaVersion','runId','byEngine'} or type(value['schemaVersion']) is not int or value['schemaVersion']!=1 or value['runId']!=run or set(value['byEngine'])!={'codex'}:raise ValueError('snapshot schema/run/engine differs')
 b=value['byEngine']['codex']
 if not isinstance(b,dict) or set(b)!=set(METRICS)|{'status','measuredAt','windowStart','windowEnd','source','scope','coverage'}:raise ValueError('counter bucket schema differs')
 if b['source']!='codex-rollout-gateway' or b['scope']!='declared_threads' or b['coverage'] not in {'root_gateway_only','root_gateway_and_children'}:raise ValueError('counter metadata differs')
 if not timestamp(b['windowStart'])<timestamp(b['windowEnd'])<=timestamp(b['measuredAt']):raise ValueError('counter timestamps differ')
 if b.get('status')!='observed' or any(type(b.get(k)) is not int or not 0<=b[k]<=9007199254740991 for k in METRICS):raise ValueError('counter is not observed')
 if b['inputTokens']!=sum(b[k] for k in ('uncachedInputTokens','cacheReadTokens','cacheWriteTokens')):raise ValueError('counter input sum differs')
 return b

def timestamp(s):
 try:
  if not isinstance(s,str) or not s.endswith(('Z','+00:00')):raise ValueError()
  value=datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
  if value.tzinfo is None:raise ValueError()
  return value
 except (ValueError,TypeError,AttributeError):raise ValueError('invalid source timestamp') from None

def public_check(c,private,snapshot):
 meta=private['_sadik'];run=meta['run_id'];b=numeric(snapshot,run)
 if meta['release']['skill_dir']!=str(Path(c['files']['cli']['path']).parent.parent):raise ValueError('foreign physical skill')
 if any(not re.fullmatch('[0-9a-f]{32}',meta[k]) for k in ('project_id','run_id')):raise ValueError('invalid public identities')
 if Path(meta['public_root'])!=Path(c['root'])/'srv/autopilot/public':raise ValueError('foreign public root')
 dest=Path(meta['public_root'])/'master'/meta['project_id']/run;public=state(dest/'state.js')
 root=Path(meta['public_root']);gid=root.lstat().st_gid
 for d,uid,mode in [(root,0,0o2751),(root/'master',MASTER.pw_uid,0o2750),(dest.parent,MASTER.pw_uid,0o2750),(dest,MASTER.pw_uid,0o2750)]:
  st=d.lstat()
  if d.resolve()!=d or not stat.S_ISDIR(st.st_mode) or (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(uid,gid,mode):raise ValueError('public reader directory permissions differ')
 for f in (dest/'state.js',dest/'dashboard.html'):
  st=f.lstat()
  if (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))!=(MASTER.pw_uid,gid,0o640):raise ValueError('public reader file permissions differ')
 if public.get('usage')!=snapshot or '_sadik' in public or private['usage']['byEngine']['codex']!=b:raise ValueError('private/public counters differ')
 pagefile=dest/'dashboard.html';st=pagefile.lstat()
 if not stat.S_ISREG(st.st_mode) or pagefile.resolve()!=pagefile or st.st_uid!=MASTER.pw_uid or st.st_size>8*1024*1024:raise ValueError('unsafe public page')
 page=read_regular(pagefile).decode();template=read_regular(c['files']['template']['path']).decode();begin,end='/*STATE-BEGIN*/','/*STATE-END*/'
 if page.count(begin)!=1 or page.count(end)!=1:raise ValueError('unexpected embedded blocks')
 pp,pt=page.split(begin);embedded,ps=pt.split(end);tp,tt=template.split(begin);_,ts=tt.split(end)
 if (pp,ps)!=(tp,ts) or not embedded.startswith('window.STATE=') or json.loads(embedded.split('=',1)[1].removesuffix(';'))!=public:raise ValueError('embedded state/template differs')
 return {'directory':str(dest),'state_sha256':sha(dest/'state.js'),'html_sha256':sha(dest/'dashboard.html'),'engines':['codex']}

def select_turn(home,thread,expected_turn=None):
 home=Path(home);f=home/'dsh-usage-hodov.jsonl'
 if f.stat().st_size>64*1024*1024:raise ValueError('gateway exceeds64MiB')
 rows=[json.loads(l) for l in read_regular(f,64*1024*1024).decode().splitlines() if l.strip()];chosen=[r for r in rows if isinstance(r,dict) and r.get('thread')==thread and r.get('polnota')=='ok' and (expected_turn is None or r.get('turn')==expected_turn)]
 if not chosen:raise ValueError('no terminal gateway turn in the explicit thread')
 if expected_turn is not None and len(chosen)!=1:raise ValueError('ambiguous source gateway turn')
 row=chosen[-1];turn=row['turn'];matches=[];seen=0
 for path in (home/'sessions').glob('*/*/*/rollout-*.jsonl'):
  seen+=1
  if seen>4096:raise ValueError('source discovery exceeds4096files')
  if path.resolve()!=path or not stat.S_ISREG(path.lstat().st_mode):raise ValueError('unsafe source rollout')
  if path.stat().st_size>64*1024*1024:raise ValueError('rollout exceeds64MiB')
  first=source_header(path)
  if first.get('payload',{}).get('id')==thread:matches.append(path)
 if len(matches)!=1:raise ValueError('missing/ambiguous source rollout')
 starts=[];ends=[]
 for line in read_regular(matches[0],64*1024*1024).decode().splitlines():
   r=json.loads(line);p=r.get('payload',{})
   if p.get('turn_id')!=turn or r.get('type')!='event_msg':continue
   if p.get('type')=='task_started':starts.append(r['timestamp'])
   elif p.get('type')=='task_complete':ends.append(r['timestamp'])
 if len(starts)!=1 or not ends:raise ValueError('source turn is not terminal with one start')
 if not timestamp(starts[0])<timestamp(ends[-1])<=timestamp(row['ts'])<datetime.datetime.now(datetime.timezone.utc):raise ValueError('source window is not closed')
 return {'thread':thread,'turn':turn,'start':timestamp(starts[0]).isoformat(timespec='microseconds').replace('+00:00','Z'),'end':timestamp(row['ts']).isoformat(timespec='microseconds').replace('+00:00','Z')}
