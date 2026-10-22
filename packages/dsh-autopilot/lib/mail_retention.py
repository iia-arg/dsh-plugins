"""Configured server-body retention; ordinary ACK and completed task are distinct."""
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import time
from pilot_mail import valid_result

TEAM=frozenset({'master','vintik','shpuntik','gayka','shurup','sova','tumbler'})
ROUTE='AUTOPILOT-PILOT/1'


def default_config():
    return {'schema_version':1,'sweep_interval_seconds':60,'batch_refs':100,'budget_ms':2000,
      'limits':{'max_live_body_bytes':16777216,'max_pending_per_sender':200,'max_live_db_bytes':134217728,'warn_percent':80,'recover_percent':70},
      'agents':{a:{'incoming':{'keep_count':100,'older_than_hours':48},'outgoing':{'keep_count':100,'older_than_hours':96}} for a in TEAM}}


def load_config(path):
    parent=Path(path).parent
    st=parent.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o755 or parent.resolve()!=parent.absolute():
        raise ValueError('RETENTION_CONFIG_PARENT')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o644 or s.st_nlink!=1 or s.st_size>65536:
            raise ValueError('RETENTION_CONFIG_FILE')
        def unique(pairs):
            value={}
            for k,v in pairs:
                if k in value:raise ValueError('RETENTION_CONFIG_DUPLICATE')
                value[k]=v
            return value
        with os.fdopen(fd,'r',closefd=False) as f:config=json.load(f,object_pairs_hook=unique)
        return RetentionPolicy(config).config
    finally:os.close(fd)


def classify(sender,recipient,body):
    if not body.startswith(ROUTE):return 'ordinary',None
    try:
        prefix,raw=body.split('\n',1);value=json.loads(raw)
        if prefix!=ROUTE or not isinstance(value,dict) or value.get('route')!=ROUTE:raise ValueError()
        kind=value.get('kind')
        if kind=='cancel':
            if sender=='master' and set(value)=={'route','kind','run','sender'} and value.get('sender')=='master' and isinstance(value.get('run'),str) and 0<len(value['run'])<=128:return 'ordinary',None
            raise ValueError()
        if kind=='task' and (not isinstance(value.get('task'),dict) or set(value)!={'route','kind','run','sender','task'} or value.get('sender')!='master'):raise ValueError()
        run=value.get('run')
        job=value.get('task',{}).get('job_id') if kind=='task' and isinstance(value.get('task'),dict) else value.get('job_id')
        if not all(isinstance(x,str) and 0<len(x)<=128 for x in (run,job)):raise ValueError()
        ref=hashlib.sha256(json.dumps([run,job],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if kind=='task' and sender=='master' and value['task'].get('recipient')==recipient:return 'task',ref
        if (kind=='result' and valid_result(value) and recipient=='master' and sender!='master' and value.get('sender')==sender
            and value.get('recipient')=='master' and value.get('status') in ('DONE','DONE_WITH_CONCERNS','BLOCKED','NEEDS_CONTEXT')):
            return 'result',ref
    except (ValueError,TypeError,KeyError,RecursionError):pass
    return 'unknown',None


class RetentionPolicy:
    def __init__(self,config=None):
        config=copy.deepcopy(default_config() if config is None else config)
        def keys(value,want):
            if not isinstance(value,dict) or set(value)!=set(want):raise ValueError('RETENTION_CONFIG_FIELDS')
        def positive(value):
            if type(value)!=int or value<=0:raise ValueError('RETENTION_CONFIG_NUMBER')
        keys(config,('schema_version','sweep_interval_seconds','batch_refs','budget_ms','limits','agents'))
        if type(config['schema_version'])!=int or config['schema_version']!=1:raise ValueError('RETENTION_CONFIG_VERSION')
        for k in ('sweep_interval_seconds','batch_refs','budget_ms'):positive(config[k])
        keys(config['limits'],('max_live_body_bytes','max_pending_per_sender','max_live_db_bytes','warn_percent','recover_percent'))
        for v in config['limits'].values():positive(v)
        if not 0<config['limits']['recover_percent']<config['limits']['warn_percent']<=100:raise ValueError('RETENTION_CONFIG_HYSTERESIS')
        # A complete unacked inbox of all seven senders must fit the wire frame.
        if config['limits']['max_pending_per_sender']>200:raise ValueError('RETENTION_CONFIG_PENDING')
        keys(config['agents'],TEAM)
        for agent in TEAM:
            keys(config['agents'][agent],('incoming','outgoing'))
            for value in config['agents'][agent].values():
                keys(value,('keep_count','older_than_hours'))
                for v in value.values():positive(v)
        self.config=config;self.limits=config['limits']

    def initialize(self,db):
        columns={r[1] for r in db.execute('PRAGMA table_info(messages)')}
        additions={'out_released':'INTEGER NOT NULL DEFAULT 0','in_released':'INTEGER NOT NULL DEFAULT 0',
          'kind':'TEXT NOT NULL DEFAULT "unknown"','job_ref':'TEXT','completed_at':'REAL','result_id':'TEXT','retention_at':'REAL'}
        upgraded=False
        for key,sql in additions.items():
            if key not in columns:db.execute('ALTER TABLE messages ADD COLUMN '+key+' '+sql);upgraded=True
        if upgraded:
            for row in db.execute('SELECT id,sender,recipient,body,acked,acked_at FROM messages').fetchall():
                kind,ref=classify(row['sender'],row['recipient'],row['body'])
                db.execute('UPDATE messages SET kind=?,job_ref=?,retention_at=? WHERE id=?',
                  (kind,ref,row['acked_at'] if row['acked'] and kind in ('ordinary','result') else None,row['id']))
        db.execute('CREATE TABLE IF NOT EXISTS tombstones(id TEXT PRIMARY KEY,sender TEXT NOT NULL,sender_uid INTEGER NOT NULL,recipient TEXT NOT NULL,request_sha TEXT NOT NULL,created REAL NOT NULL,acked_at REAL NOT NULL,completed_at REAL,pruned_at REAL NOT NULL,kind TEXT NOT NULL,job_ref TEXT,result_id TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS retention_state(id INTEGER PRIMARY KEY CHECK(id=1),last_success REAL,last_run REAL,error TEXT,alert_state TEXT NOT NULL DEFAULT "none")')
        if 'run_seq' not in {r[1] for r in db.execute('PRAGMA table_info(retention_state)')}:
            db.execute('ALTER TABLE retention_state ADD COLUMN run_seq INTEGER NOT NULL DEFAULT 0')
        db.execute('INSERT OR IGNORE INTO retention_state(id) VALUES(1)')
        db.execute('CREATE INDEX IF NOT EXISTS retention_out ON messages(sender,out_released,retention_at)')
        db.execute('CREATE INDEX IF NOT EXISTS retention_in ON messages(recipient,in_released,retention_at)')
        db.execute('CREATE INDEX IF NOT EXISTS task_results ON messages(job_ref,kind,sender,recipient)')

    def db_bytes(self,db):
        page=db.execute('PRAGMA page_size').fetchone()[0]
        count=db.execute('PRAGMA page_count').fetchone()[0]
        free=db.execute('PRAGMA freelist_count').fetchone()[0]
        return page*(count-free)

    def lookup(self,db,ident):
        row=db.execute('SELECT * FROM messages WHERE id=?',(ident,)).fetchone()
        return (row,False) if row else (db.execute('SELECT * FROM tombstones WHERE id=?',(ident,)).fetchone(),True)

    def completion(self,db,actor,ident,result_id,now):
        row,pruned=self.lookup(db,ident);result,_=self.lookup(db,result_id)
        if not row or row['recipient']!=actor:return {'ok':False,'reason':'WRONG_RECIPIENT'}
        acked=row['acked_at'] is not None if pruned else bool(row['acked'])
        if (row['kind']!='task' or not acked or not result or result['kind']!='result'
            or result['sender']!=actor or result['recipient']!='master' or result['job_ref']!=row['job_ref']):
            return {'ok':False,'reason':'JOB_RESULT_UNVERIFIED'}
        if row['completed_at'] is not None:
            return {'ok':True,'status':'COMPLETED'} if row['result_id']==result_id else {'ok':False,'reason':'JOB_RESULT_CONFLICT'}
        if pruned:return {'ok':False,'reason':'JOB_RESULT_UNVERIFIED'}
        db.execute('UPDATE messages SET completed_at=?,retention_at=?,result_id=? WHERE id=? AND completed_at IS NULL',(now,now,result_id,ident))
        return {'ok':True,'status':'COMPLETED'}

    def pending_completion(self,db,actor):
        return [dict(r) for r in db.execute('SELECT m.id,m.job_ref FROM messages m WHERE m.kind="task" AND m.completed_at IS NULL AND (m.sender=? OR m.recipient=?) AND EXISTS(SELECT 1 FROM messages r WHERE r.kind="result" AND r.job_ref=m.job_ref AND r.sender=m.recipient AND r.recipient="master" UNION ALL SELECT 1 FROM tombstones t WHERE t.kind="result" AND t.job_ref=m.job_ref AND t.sender=m.recipient AND t.recipient="master") ORDER BY m.created,m.id LIMIT 100',(actor,actor))]

    def counts(self,db,actor):
        values={}
        for direction,col,flag in [('incoming','recipient','in_released'),('outgoing','sender','out_released')]:
            row=db.execute('SELECT COUNT(*),COALESCE(SUM(CASE WHEN retention_at IS NULL THEN 1 ELSE 0 END),0) FROM messages WHERE '+col+'=? AND '+flag+'=0',(actor,)).fetchone()
            values[direction]={'retained_refs':row[0],'protected_refs':row[1]}
        return values

    def sweep(self,db,now):
        db.execute('UPDATE retention_state SET run_seq=run_seq+1 WHERE id=1')
        run_id=db.execute('SELECT run_seq FROM retention_state WHERE id=1').fetchone()[0]
        removed=0;pruned=0;rows=[];deadline=time.monotonic()+self.config['budget_ms']/1000
        for agent in sorted(TEAM):
            for direction,col,flag in [('incoming','recipient','in_released'),('outgoing','sender','out_released')]:
                conf=self.config['agents'][agent][direction]
                before=db.execute('SELECT COUNT(*) FROM messages WHERE '+col+'=? AND '+flag+'=0',(agent,)).fetchone()[0]
                excess=max(0,before-conf['keep_count']);n=0
                if excess and removed<self.config['batch_refs'] and time.monotonic()<deadline:
                    candidates=db.execute('SELECT id FROM messages WHERE '+col+'=? AND '+flag+'=0 AND acked=1 AND retention_at<? ORDER BY retention_at,created,id LIMIT ?',
                      (agent,now-conf['older_than_hours']*3600,min(excess,self.config['batch_refs']-removed))).fetchall()
                    for item in candidates:
                        if time.monotonic()>=deadline:break
                        db.execute('UPDATE messages SET '+flag+'=1 WHERE id=?',(item['id'],));removed+=1;n+=1
                        row=db.execute('SELECT * FROM messages WHERE id=?',(item['id'],)).fetchone()
                        if row['in_released'] and row['out_released']:
                            db.execute('INSERT INTO tombstones(id,sender,sender_uid,recipient,request_sha,created,acked_at,completed_at,pruned_at,kind,job_ref,result_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                              tuple(row[k] for k in ('id','sender','sender_uid','recipient','request_sha','created','acked_at','completed_at'))+(now,)+tuple(row[k] for k in ('kind','job_ref','result_id')))
                            db.execute('DELETE FROM messages WHERE id=?',(row['id'],));pruned+=1
                protected=db.execute('SELECT COUNT(*) FROM messages WHERE '+col+'=? AND '+flag+'=0 AND retention_at IS NULL',(agent,)).fetchone()[0]
                reason='below_threshold' if not excess else 'released' if n else 'protected_young_or_budget'
                rows.append({'agent':agent,'direction':direction,'before':before,'removed_refs':n,'retained_refs':before-n,'protected':protected,'reason':reason})
        db.execute('UPDATE retention_state SET last_success=?,last_run=?,error=NULL,alert_state="none" WHERE id=1',(now,now))
        return {'ok':True,'ran':True,'gc_run_id':run_id,'removed_refs':removed,'bodies_pruned':pruned,'directions':rows,
          'retained_bodies':db.execute('SELECT COUNT(*) FROM messages').fetchone()[0],
          'tombstones':db.execute('SELECT COUNT(*) FROM tombstones').fetchone()[0]}
