#!/usr/bin/python3 -I
"""Root-only AP mail/receipt/DSH origin -> Claude snapshot. No model or panel calls."""
import argparse,datetime,hashlib,importlib.util,json,os,signal,sqlite3,stat,sys,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent

def protected(path):
 p=Path(path)
 if p.resolve()!=p:raise ValueError('ROOT_CODE_UNSAFE')
 for f in [p,*p.parents]:
  s=f.lstat()
  if s.st_uid!=0 or s.st_mode&0o022 or stat.S_ISLNK(s.st_mode):raise ValueError('ROOT_CODE_UNSAFE')
def load(name,label):
 p=HERE/name;protected(p);spec=importlib.util.spec_from_file_location(label,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def main():
 p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);p.add_argument('--run-id',required=True);p.add_argument('--root',type=Path,default=Path('/'));p.add_argument('--g0-record',type=Path);p.add_argument('--progon',action='store_true');a=p.parse_args()
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
 protected(Path(__file__).absolute());origin=load('claude-root-origin.py','root_origin');protected(HERE/'measure-run-claude.py');builder=load('build-run-manifest.py','root_builder');reader=builder.reader
 def timeout(sig,frame):raise ValueError('ROOT_USAGE_TIMEOUT')
 signal.signal(signal.SIGALRM,timeout);signal.alarm(180)
 try:
  scope,parents,available,proof,ledger,sdk=origin.collect(reader,a.root,a.run_id,a.g0_record)
  m=dict(schemaVersion=1,**scope,ledger=str(ledger),sdkDirectory=str(sdk),children='explicit',requests=[])
  selected={r['request_id']:r for r in parents};parent_ids=set(selected);parent_sessions={r['session_id'] for r in parents};start,end=reader.utc_ms(scope['startedAt']),reader.utc_ms(scope['endedAt'])
  while True:
   if len(selected)>4096:raise ValueError('REQUEST_LIMIT')
   for row in selected.values():
    binding=origin.strict(row['binding_json']);thread=binding.get('sdk_thread_id');origin.need(isinstance(thread,str) and reader.THREAD_ID.fullmatch(thread),'BINDING_MISMATCH');origin.read(sdk/(thread+'.jsonl'))
   edges=builder.discover(m,list(selected.values()));prior=set(selected)
   for child in {e['childId'] for e in edges}:
    origin.need(child not in parent_sessions,'CHILD_GRAPH_INVALID');children=[r for r in available if r['session_id']==child];origin.need(children and len({r['session_created'] for r in children})==1,'CHILD_LEDGER_AMBIGUOUS');selected.update({r['request_id']:r for r in children})
   if set(selected)==prior:break
  child_sessions={r['session_id'] for rid,r in selected.items() if rid not in parent_ids}
  for root_proof in proof['roots']:
   origin.need(all(n['childSessionId'] in child_sessions for n in root_proof['settledNotices']),'MIXED_TURN')
  for row in sorted(selected.values(),key=lambda r:(r['started_at'],r['request_id'])):
   m['requests'].append(dict(requestId=row['request_id'],sessionId=row['session_id'],sessionCreated=row['session_created'],turn=row['turn'],role='parent' if row['request_id'] in parent_ids else 'child'))
  # Protected transient origin is enough for --progon; only the final branch publishes.
  with tempfile.TemporaryDirectory(prefix='ap-claude-root-',dir='/root') as temporary:
   directory=Path(temporary);directory.chmod(0o700);record=directory/'root-mail.json';raw=(json.dumps({**m,'proof':proof},ensure_ascii=False,sort_keys=True)+'\n').encode();record.write_bytes(raw);record.chmod(0o600)
   m['runRecord']={'kind':'root-mail-v1','directory':str(directory),'sha256':hashlib.sha256(raw).hexdigest()};manifest=directory/'manifest.json';manifest.write_text(json.dumps(m));manifest.chmod(0o600);details=reader.measure(manifest);value=reader.writer_snapshot(details)
   if value['byEngine']['claude']['status']!='observed':
    missing=details['usage']['byEngine']['claude']['coverage']['missing'];raise ValueError(missing[0]['code'] if missing else 'ROOT_USAGE_INCOMPLETE')
   if a.progon:print(json.dumps(value,ensure_ascii=False,allow_nan=False));return 0
   base=a.root/'var/lib/autopilot-usage';origin.protected(a.root,True)
   for d in [a.root/'var',a.root/'var/lib',base]:
    if not d.exists():d.mkdir(mode=0o755);d.chmod(0o755)
    origin.protected(d,True)
    origin.need(stat.S_IMODE(d.stat().st_mode)==0o755,'OUTPUT_ROOT_MODE')
   target=base/a.run_id
   if os.path.lexists(target):raise ValueError('OUTPUT_EXISTS')
   target.mkdir(mode=0o755);target.chmod(0o755);private=target/'private';private.mkdir(mode=0o700);public=target/'public';public.mkdir(mode=0o755);public.chmod(0o755)
   for name,data in [('root-mail.json',raw),('manifest.json',(json.dumps(m,ensure_ascii=False)+'\n').encode()),('reader-details.json',(json.dumps(details,ensure_ascii=False)+'\n').encode())]:
    f=private/name
    with f.open('xb') as out:out.write(data);out.flush();os.fsync(out.fileno())
    f.chmod(0o600)
   # The persisted manifest points to the persisted root record, not deleted temp.
   m['runRecord']['directory']=str(private);(private/'manifest.json').write_text(json.dumps(m,ensure_ascii=False)+'\n');snapshot=(json.dumps(value,ensure_ascii=False,allow_nan=False)+'\n').encode();temp=public/'claude.json.new'
   with temp.open('xb') as out:out.write(snapshot);out.flush();os.fsync(out.fileno())
   temp.chmod(0o644);os.replace(temp,public/'claude.json');print(json.dumps({'status':'observed','runId':a.run_id,'snapshot':str(public/'claude.json'),'sha256':hashlib.sha256(snapshot).hexdigest(),'scope':'copy' if a.root!=Path('/') else 'production'},ensure_ascii=False));return 0
 except reader.Incomplete as error:raise ValueError(error.code) from None
 finally:signal.alarm(0)
if __name__=='__main__':
 try:raise SystemExit(main())
 except (OSError,ValueError,KeyError,TypeError,RuntimeError,sqlite3.Error) as error:
  # Fixed reason codes only. Never echo source SQL/SDK/prompt data.
  code=str(error)
  if not code or not all(c.isupper() or c.isdigit() or c=='_' for c in code):code='ROOT_USAGE_REFUSED'
  print(json.dumps({'status':'not_measured','reason':code}),file=sys.stderr);raise SystemExit(2)
