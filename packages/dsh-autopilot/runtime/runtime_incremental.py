"""Informational R tail: durable cursor, facts and successful run bindings."""
import json
import re
import hashlib
import importlib.util
import fcntl
import os
from pathlib import Path
import sqlite3
import stat
import time

POLICY=Path('/etc/dsh-telegram-multiagent/usage-runtime-policy.json')

NOTICE='Журнал R заменён или обрезан; часть строк могла быть потеряна.'

def integer(value):return type(value) is int and 0<=value<=9007199254740991

def load_policy(path):
    """The writer's single root policy; no alternate limits on failure."""
    if not path.is_absolute() or path.resolve()!=path:raise ValueError('небезопасный путь')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_nlink!=1 or before.st_mode&0o022:raise ValueError('владелец, права или тип файла')
        if before.st_size>16384:raise ValueError('размер больше 16384 байт')
        encoded=os.read(fd,16385);after=os.fstat(fd)
        if len(encoded)!=before.st_size or (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('файл изменился при чтении')
    finally:os.close(fd)
    def unique(pairs):
        result={}
        for key,value in pairs:
            if key in result:raise ValueError('повторное поле')
            result[key]=value
        return result
    def invalid(_):raise ValueError('нечисловое значение')
    policy=json.loads(encoded.decode('utf-8'),object_pairs_hook=unique,parse_constant=invalid)
    if type(policy) is not dict or set(policy)!={'schemaVersion','fileMaxBytes','recordMaxBytes'}:raise ValueError('состав полей')
    # JS Number.isSafeInteger also accepts JSON 1.0 / integer exponents, never bool.
    if any(type(v) not in {int,float} or not 0<=v<=9007199254740991 or int(v)!=v for v in policy.values()):raise ValueError('ожидалось безопасное целое число')
    if policy['schemaVersion']!=1 or not 0<policy['recordMaxBytes']<=policy['fileMaxBytes']:raise ValueError('версия или соотношение пределов')
    return {key:int(value) for key,value in policy.items()},hashlib.sha256(encoded).hexdigest()

def usable(row,uid,recipient):
    if type(row) is not dict:return False
    if row.get('kind') in {'watermark','source_gap'}:return True
    if row.get('kind') not in {'runtime_request','runtime_turn'}:return False
    if row.get('uid')!=uid or row.get('recipient')!=recipient:return False
    if not isinstance(row.get('sessionId'),str) or not row['sessionId']:return False
    if not all(integer(row.get(k)) for k in ['sessionCreated','turn','turnStartedAt']):return False
    if not isinstance(row.get('claims'),list) or not isinstance(row.get('deliveryIds'),list):return False
    if not all(isinstance(x,str) for x in row['deliveryIds']):return False
    if not all(type(c) is dict and isinstance(c.get('receiptId'),str) and isinstance(c.get('messageId'),str) and integer(c.get('claimedAt')) and 'deliveryId' in c and (c['deliveryId'] is None or isinstance(c['deliveryId'],str)) for c in row['claims']):return False
    if set(row['deliveryIds'])!={c['deliveryId'] for c in row['claims'] if c['deliveryId'] is not None}:return False
    if row.get('finishedAt') is not None and not integer(row['finishedAt']):return False
    if row['kind']=='runtime_request':return isinstance(row.get('requestId'),str) and bool(row['requestId']) and isinstance(row.get('requestGeneration'),str) and integer(row.get('registeredAt'))
    return True

def request_key(row):
    # uid/recipient are fixed by the private per-source Reader and usable().
    return json.dumps([row['requestGeneration'],row['requestId']],separators=(',',':'))

class Reader:
    def __init__(self,source,state,uid,recipient,*,policy=POLICY):
        self.policy=Path(policy);self.source=Path(source);self.uid=uid;self.recipient=recipient;state=Path(state)
        state.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
        self._lock_fd=os.open(state.parent/'.reader.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        lock_stat=os.fstat(self._lock_fd)
        if not stat.S_ISREG(lock_stat.st_mode) or lock_stat.st_uid!=os.getuid() or lock_stat.st_nlink!=1 or lock_stat.st_mode&0o077:
            os.close(self._lock_fd);raise ValueError('R_STATE_UNSAFE')
        stop=time.monotonic()+.25
        while True:
            try:fcntl.flock(self._lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                if time.monotonic()>=stop:os.close(self._lock_fd);raise ValueError('R_STATE_BUSY')
                time.sleep(.01)
        self.db=None
        try:
            fd=os.open(state,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
            try:
                st=os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_nlink!=1 or st.st_mode&0o077:raise ValueError('R_STATE_UNSAFE')
            finally:os.close(fd)
            self.db=sqlite3.connect(state)
            version=self.db.execute('PRAGMA user_version').fetchone()[0]
            if version>4:raise ValueError('R_STATE_SCHEMA_UNSUPPORTED')
            if version==3:
                backup=Path(str(state)+'.schema3');staged=Path(str(backup)+'.new')
                for artifact in (backup,staged):
                    if os.path.lexists(artifact):
                        st=artifact.lstat()
                        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o600:raise ValueError('R_STATE_UNSAFE')
                # One fixed temporary file. An interrupted private temp is never
                # a usable backup; the old final survives until replacement.
                if staged.exists():staged.unlink()
                fd=os.open(staged,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.close(fd)
                try:
                    target=sqlite3.connect(staged)
                    try:
                        self.db.backup(target)
                        if target.execute('PRAGMA quick_check').fetchone()[0]!='ok' or target.execute('PRAGMA user_version').fetchone()[0]!=3:raise ValueError('R_STATE_BACKUP_INVALID')
                        target.execute('PRAGMA journal_mode=DELETE');target.commit()
                    finally:target.close()
                    fd=os.open(staged,os.O_RDONLY|os.O_NOFOLLOW)
                    try:os.fsync(fd)
                    finally:os.close(fd)
                    os.replace(staged,backup)
                    fd=os.open(state.parent,os.O_RDONLY|os.O_DIRECTORY)
                    try:os.fsync(fd)
                    finally:os.close(fd)
                finally:
                    if staged.exists():staged.unlink()
            self.db.executescript('''CREATE TABLE IF NOT EXISTS cursor(dev TEXT,inode TEXT,offset INTEGER,skipped INTEGER,resets INTEGER,lastResetAt INTEGER);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,session TEXT,created INTEGER,turn INTEGER,payload TEXT);
    CREATE INDEX IF NOT EXISTS request_turn ON requests(session,created,turn);
    CREATE TABLE IF NOT EXISTS deliveries(delivery TEXT,request TEXT,PRIMARY KEY(delivery,request));
    CREATE TABLE IF NOT EXISTS turns(session TEXT,created INTEGER,turn INTEGER,payload TEXT,PRIMARY KEY(session,created,turn));
    CREATE TABLE IF NOT EXISTS turn_deliveries(session TEXT,created INTEGER,turn INTEGER,delivery TEXT,PRIMARY KEY(session,created,turn,delivery));
    CREATE TABLE IF NOT EXISTS bindings(run TEXT,request TEXT,payload TEXT,PRIMARY KEY(run,request));
    CREATE TABLE IF NOT EXISTS source_status(id INTEGER PRIMARY KEY CHECK(id=1),generation TEXT,reason TEXT,replay_until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ownership_native(id INTEGER PRIMARY KEY CHECK(id=1),signature TEXT,payload TEXT);''')
            with self.db:
                self.db.execute('BEGIN IMMEDIATE')
                if self.db.execute('PRAGMA user_version').fetchone()[0]<1:
                    rows=self.db.execute('SELECT id,session,created,turn,payload FROM requests').fetchall()
                    links=self.db.execute('SELECT delivery,request FROM deliveries').fetchall()
                    bindings=self.db.execute('SELECT run,request,payload FROM bindings').fetchall()
                    keys={old:request_key(json.loads(payload)) for old,session,created,turn,payload in rows}
                    for table in ('requests','deliveries','bindings'):self.db.execute('DELETE FROM '+table)
                    self.db.executemany('INSERT INTO requests VALUES(?,?,?,?,?)',[(keys[old],session,created,turn,payload) for old,session,created,turn,payload in rows])
                    self.db.executemany('INSERT INTO deliveries VALUES(?,?)',[(delivery,keys.get(old,old)) for delivery,old in links])
                    self.db.executemany('INSERT INTO bindings VALUES(?,?,?)',[(run,keys.get(old,old),payload) for run,old,payload in bindings])
                    self.db.execute('PRAGMA user_version=1')
                if self.db.execute('SELECT 1 FROM cursor').fetchone() is None:
                    self.db.execute('INSERT INTO cursor VALUES(NULL,NULL,0,0,0,0)')
                if self.db.execute('PRAGMA user_version').fetchone()[0]<2:
                    # b35 could retain labels from a contradictory last turn snapshot.
                    self.db.execute('DELETE FROM turn_deliveries');bad=0
                    for table,key_columns in [('requests','id'),('turns','session,created,turn')]:
                        for row in self.db.execute('SELECT '+key_columns+',payload FROM '+table).fetchall():
                            value=json.loads(row[-1])
                            if not usable(value,self.uid,self.recipient):
                                columns=key_columns.split(',');self.db.execute('DELETE FROM '+table+' WHERE '+' AND '.join(c+'=?' for c in columns),row[:-1]);bad+=1
                                continue
                            self.db.executemany('INSERT OR IGNORE INTO turn_deliveries VALUES(?,?,?,?)',[(value['sessionId'],value['sessionCreated'],value['turn'],d) for d in value['deliveryIds']])
                    self.db.execute('UPDATE cursor SET skipped=skipped+?',(bad,));self.db.execute('PRAGMA user_version=2')
                self.db.execute('INSERT OR IGNORE INTO source_status VALUES(1,NULL,NULL,0)')
                if self.db.execute('PRAGMA user_version').fetchone()[0]<3:
                    # Earlier cursors discarded source_gap. Replay once within the normal R window.
                    self.db.execute('UPDATE source_status SET replay_until=(SELECT offset FROM cursor) WHERE id=1')
                    self.db.execute('UPDATE cursor SET offset=0');self.db.execute('PRAGMA user_version=3')
                if self.db.execute('PRAGMA user_version').fetchone()[0]<4:
                    self.db.execute('DELETE FROM bindings')
                    self.db.execute('CREATE TABLE IF NOT EXISTS ownership_state(id INTEGER PRIMARY KEY CHECK(id=1),policy TEXT,rule_version INTEGER,session_key TEXT,context TEXT)')
                    self.db.execute('PRAGMA user_version=4')

        except BaseException:
            if self.db is not None:self.db.close()
            fcntl.flock(self._lock_fd,fcntl.LOCK_UN);os.close(self._lock_fd)
            raise
    def __enter__(self):return self
    def __exit__(self,*args):
        try:self.db.close()
        finally:fcntl.flock(self._lock_fd,fcntl.LOCK_UN);os.close(self._lock_fd)
    def read(self):
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            return self._read()
    def _read(self):
        dev,inode,offset,skipped,resets,last_reset=self.db.execute('SELECT * FROM cursor').fetchone()
        generation,gap,replay_until=self.db.execute('SELECT generation,reason,replay_until FROM source_status WHERE id=1').fetchone()
        stats=dict(inode=int(inode) if inode is not None else None,offset=offset,readBytes=0,newLines=0,skippedLines=0,totalSkippedLines=skipped,resets=resets,lastResetAt=last_reset,readError=None)
        try:
            policy,digest=load_policy(self.policy)
        except FileNotFoundError:
            stats.update(policySHA256=None,readError='R_POLICY_MISSING',notice='R не читается: policy отсутствует');return stats
        except (OSError,ValueError,TypeError,RuntimeError) as error:
            stats.update(policySHA256=None,readError='R_POLICY_INVALID',notice='R не читается: policy негодна ('+(str(error)[:160] if isinstance(error,ValueError) else type(error).__name__)+')');return stats
        limit=policy['recordMaxBytes'];file_max=policy['fileMaxBytes'];stats.update(policySHA256=digest,fileMaxBytes=file_max,recordMaxBytes=limit)
        try:fd=os.open(self.source,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        except OSError:stats['readError']='R_SOURCE_UNAVAILABLE';return stats
        with os.fdopen(fd,'rb') as stream, self.db:
            st=os.fstat(stream.fileno())
            if not stat.S_ISREG(st.st_mode) or st.st_uid!=self.uid:
                stats['readError']='R_SOURCE_UNSAFE';return stats
            if inode is not None and ((dev,inode)!=(str(st.st_dev),str(st.st_ino)) or st.st_size<max(offset,replay_until)):
                offset=0;resets+=1;last_reset=int(time.time()*1000);generation=gap=None;replay_until=0
            stream.seek(offset);end=min(st.st_size,offset+file_max) if file_max is not None else st.st_size
            while stream.tell()<end:
                start=stream.tell();raw=stream.readline(min(end-start,limit+1) if limit else end-start);stats['readBytes']+=len(raw)
                if len(raw)==limit and not raw.endswith(b'\n') and stream.tell()<st.st_size:
                    raw+=stream.read(1);stats['readBytes']+=1
                oversized=limit is not None and len(raw)>limit
                if oversized and not raw.endswith(b'\n'):
                    # A corrupt complete line may exceed the normal pass window.
                    # Drain it in bounded chunks; an unterminated EOF still waits.
                    while stream.tell()<st.st_size:
                        part=stream.readline(min(st.st_size-stream.tell(),limit+1));stats['readBytes']+=len(part)
                        if not part:break
                        if part.endswith(b'\n'):break
                    else:break
                    if not part.endswith(b'\n'):break
                elif not raw.endswith(b'\n'):break
                offset=stream.tell();replayed=start<replay_until
                if not replayed:stats['newLines']+=1
                if oversized:
                    if not replayed:stats['skippedLines']+=1
                    continue
                try:
                    def invalid(_):raise ValueError('non-JSON number')
                    value=json.loads(raw,parse_constant=invalid)
                    if not usable(value,self.uid,self.recipient):raise ValueError('not an R fact')
                    json.dumps(value,ensure_ascii=False).encode('utf-8')
                except (ValueError,UnicodeError,TypeError,RecursionError):
                    if not replayed:stats['skippedLines']+=1
                    continue
                kind=value['kind'];next_generation=value.get('generation')
                if kind=='source_gap':
                    reason=value.get('reason');generation=next_generation if type(next_generation) is str and len(next_generation)<=256 else None
                    gap=reason if type(reason) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,79}',reason) else 'R_SOURCE_GAP'
                    continue
                verified=type(next_generation) is str and 0<len(next_generation)<=256 and type(value.get('schemaVersion')) is int and value.get('schemaVersion')==1 and type(value.get('uid')) is int and value.get('uid')==self.uid and value.get('recipient')==self.recipient and integer(value.get('seq')) and (kind!='watermark' or integer(value.get('at')))
                if verified and (next_generation!=generation or gap=='R_POLICY_INVALID'):
                    generation=next_generation;gap=None
                if kind=='watermark':continue
                payload=json.dumps(value,ensure_ascii=False)
                self.db.executemany('INSERT OR IGNORE INTO turn_deliveries VALUES(?,?,?,?)',[(value['sessionId'],value['sessionCreated'],value['turn'],d) for d in value['deliveryIds']])
                if kind=='runtime_request':
                    rid=request_key(value)
                    self.db.execute('INSERT OR IGNORE INTO requests VALUES(?,?,?,?,?)',(rid,value['sessionId'],value['sessionCreated'],value['turn'],payload))
                    self.db.executemany('INSERT OR IGNORE INTO deliveries VALUES(?,?)',[(d,rid) for d in value['deliveryIds']])
                elif kind=='runtime_turn':self.db.execute('INSERT OR REPLACE INTO turns VALUES(?,?,?,?)',(value['sessionId'],value['sessionCreated'],value['turn'],payload))
            skipped+=stats['skippedLines']
            self.db.execute('UPDATE source_status SET generation=?,reason=?,replay_until=? WHERE id=1',(generation,gap,replay_until if offset<replay_until else 0))
            self.db.execute('UPDATE cursor SET dev=?,inode=?,offset=?,skipped=?,resets=?,lastResetAt=?',(str(st.st_dev),str(st.st_ino),offset,skipped,resets,last_reset))
        stats.update(inode=st.st_ino,offset=offset,totalSkippedLines=skipped,resets=resets,lastResetAt=last_reset)
        return stats
    def source_gap(self):
        reason,pending=self.db.execute('SELECT reason,replay_until FROM source_status WHERE id=1').fetchone()
        return reason or ('R_SOURCE_REPLAY_PENDING' if pending else None)
    def requests(self):return {r[0]:json.loads(r[1]) for r in self.db.execute('SELECT id,payload FROM requests')}
    def candidates(self,deliveries,run,operator=None,registrations=(),*,ownership=None,cut=None,verified_turns=None,authenticated_events=None):
        if ownership is not None:
            here=Path(__file__).resolve().parent
            spec=importlib.util.spec_from_file_location('interval_ownership',here/'session_ownership.py')
            policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
            turns=verified_turns
            if turns is None:
                turns=[json.loads(r[0]) for r in self.db.execute('SELECT payload FROM turns')]
                known={policy.key(t) for t in turns}
                turns.extend(r for r in self.requests().values() if policy.key(r) not in known)
            self.ownership=policy.select(ownership,deliveries,turns,self.uid,self.recipient,cut,authenticated_events=authenticated_events)
            self.ownership_context=self.ownership['fingerprint']
            self.ownership_labels=self.ownership['turns'].get(run,{})
            self.ownership_issues=self.ownership['issues'].get(run,['OWNERSHIP_CONTEXT_INVALID'])
            self.conflicted='MIXED_RUN_TURN' in self.ownership_issues
            self.run_turns=set(self.ownership_labels)
            requests={rid:r for rid,r in self.requests().items() if (r['sessionId'],r['sessionCreated'],r['turn']) in self.run_turns and r['registeredAt']<=cut}
            self.unbound=0
            with self.db:
                self.db.execute('INSERT OR REPLACE INTO ownership_state VALUES(1,?,?,?,?)',
                    (policy.POLICY,policy.VERSION,json.dumps(['UID','sessionId','sessionCreated']),self.ownership_context))
            return requests
        # Ownership comes from explicit authenticated delivery/registration keys.
        labels={};keys={rid:(session,created,turn) for rid,session,created,turn in self.db.execute('SELECT id,session,created,turn FROM requests')}
        for session,created,turn,delivery in self.db.execute('SELECT session,created,turn,delivery FROM turn_deliveries'):
            entry=deliveries.get(delivery,{})
            if entry.get('kind')=='task' and entry.get('recipient')==self.recipient:
                labels.setdefault((session,created,turn),set()).add((entry['runId'],entry['jobId']))
        if self.recipient=='master':
            claims=list(registrations)
            if operator:claims.append(dict(operator,runId=run))
            for r in claims:labels.setdefault((r['sessionId'],r['sessionCreated'],r['turn']),set()).add((r['runId'],r['jobId']))
        self.unbound=sum(len(labels.get(key,()))!=1 for key in keys.values())
        self.run_turns={key for key,owners in labels.items() if any(owner[0]==run for owner in owners)}
        self.conflicted=any(len(labels[key])>1 for key in self.run_turns)
        rows={}
        for rid,key in keys.items():
            owners=labels.get(key,set())
            if any(owner[0]==run for owner in owners):
                rows[rid]=json.loads(self.db.execute('SELECT payload FROM requests WHERE id=?',(rid,)).fetchone()[0])
        return rows
    def turn(self,request):
        row=self.db.execute('SELECT payload FROM turns WHERE session=? AND created=? AND turn=?',(request['sessionId'],request['sessionCreated'],request['turn'])).fetchone()
        return json.loads(row[0]) if row else None
    def binding(self,run,rid):
        row=self.db.execute('SELECT payload FROM bindings WHERE run=? AND request=?',(run,rid)).fetchone()
        value=json.loads(row[0]) if row else None
        if value is not None and hasattr(self,'ownership_context'):
            if (value.get('ownershipPolicy')!='session-interval' or value.get('ownershipRuleVersion')!=3
                or value.get('ownershipContextFingerprint')!=self.ownership_context
                or value.get('ownershipNativeFingerprint')!=getattr(self,'native_context',None)):return None
        return value
    def save_binding(self,run,rid,value):
        if hasattr(self,'ownership_context'):
            value=dict(value,ownershipPolicy='session-interval',ownershipRuleVersion=3,
                ownershipContextFingerprint=self.ownership_context,ownershipNativeFingerprint=getattr(self,'native_context',None),
                sessionKey=[self.uid,value['sessionId'],value['sessionCreated']],
                ownershipProvenance=self.ownership_labels.get((value['sessionId'],value['sessionCreated'],value['turn']),{}))
        with self.db:self.db.execute('INSERT OR REPLACE INTO bindings VALUES(?,?,?)',(run,rid,json.dumps(value)))
        return value

def verified_ownership_turns(n,reader,data,home,meter,*,facts_only=False):
    """Native facts define the scope; authenticate the complete selected SDK set.

    The private index contains only identities, queue/claim events and terminal
    times. Neither prompts nor arbitrary native event payloads are cached.
    """
    participant=data['participant'];uid=participant['uid'];name=participant['name'];source=participant['runtimeSource']
    requests=reader.requests();snapshots=[json.loads(r[0]) for r in reader.db.execute('SELECT payload FROM turns')]
    def vector(paths):
        result=[]
        for raw in paths:
            path=Path(raw);n.require(path.is_absolute() and path.resolve()==path and path.is_relative_to(home),'SOURCE_OUTSIDE_HOME')
            try:
                st=path.lstat();n.require(stat.S_ISREG(st.st_mode) and st.st_uid==uid and st.st_nlink==1 and not st.st_mode&0o022,'SOURCE_OWNER_INVALID')
                result.append([str(path),st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns])
            except FileNotFoundError:result.append([str(path),None])
        return result
    old=reader.db.execute('SELECT payload FROM ownership_native WHERE id=1').fetchone()
    saved=json.loads(old[0]) if old else {}
    if saved.get('format')!=2:saved={}
    db_vector=vector([source['ledger'],str(source['ledger'])+'-wal'])
    if saved.get('dbVector')==db_vector:
        receipts=saved['receipts'];sdk=saved['sdk'];db_proofs=saved['dbProofs'];meter.proofs.extend(db_proofs)
    else:
        before=len(meter.proofs);db=n.database(source['ledger'],uid,meter,home)
        receipts=[{k:r.get(k) for k in ('id','dsh_id','logical_key','session_id','session_created')} for r in db['receipts']]
        sdk=[]
        for r in db['mail_sdk_requests']:
            value={k:r.get(k) for k in ('request_id','generation','session_id','session_created','turn','started_at')}
            try:
                raw=n.core.strict_json(r['binding_json'])
                value['binding']={k:raw.get(k) for k in ('session_id','session_created','turn','request_id','generation')} if type(raw) is dict else None
            except (n.Incomplete,ValueError,TypeError,KeyError):value['binding']=None
            sdk.append(value)
        db_proofs=meter.proofs[before:]
    own_tasks={did for did,d in data['deliveries'].items() if d.get('kind')=='task' and d.get('runId')==data['runId'] and d.get('recipient')==name}
    sessions={(r['operator']['sessionId'],r['operator']['sessionCreated']) for r in data['ownership'] if r['uid']==uid and r['participant']==name and r['runId']==data['runId'] and r.get('operator')}
    for r in [*requests.values(),*snapshots]:
        if any(c.get('deliveryId') in own_tasks for c in r['claims']):sessions.add((r['sessionId'],r['sessionCreated']))
    for r in receipts:
        if (r.get('logical_key') or '').startswith('ap-notice:') and r['logical_key'][10:] in own_tasks:
            n.require(type(r['session_id']) is str and type(r['session_created']) is int,'R_SOURCE_SCHEMA_INVALID')
            sessions.add((r['session_id'],r['session_created']))
    layout=source['native']
    paths=[n.native_path(layout,sid) for sid in sorted({sid for sid,created in sessions})] if type(layout) is dict else layout
    if not sessions:paths=[]
    native_vector=vector(paths);wanted=[list(k) for k in sorted(sessions)]
    if saved.get('dbVector')==db_vector and saved.get('nativeVector')==native_vector and saved.get('sessions')==wanted:
        native=saved['native'];proofs=saved['nativeProofs'];meter.proofs.extend(proofs)
    else:
        before=len(meter.proofs);native=[]
        event_types={'turn/start','turn/end','agent/inbox/spliced','subagent/catalog','subagent/descriptor','tool-workflow/agent-start'}
        for path in paths:
            try:header,events=n.checked_native(path,uid,home,meter)
            except FileNotFoundError:continue
            if header['id'] in {sid for sid,created in sessions}:n.require((header['id'],header['createdAt']) in sessions,'RUN_SESSION_CONTINUITY_LOST')
            if (header['id'],header['createdAt']) not in sessions:continue
            projected=[]
            for e in events:
                if e['type'] not in event_types:continue
                d=e['data'];body={k:d[k] for k in ('turn','target','start','removedCount','outcome') if k in d}
                if e['type']=='agent/inbox/spliced':
                    body['inserted']=[dict(id=x['id'],**({'source':dict(senderSessionId='autopilot:notice')} if type(x.get('source')) is dict and x['source'].get('senderSessionId')=='autopilot:notice' else {})) for x in d['inserted']]
                projected.append(dict(type=e['type'],time=e['time'],seq=e['seq'],data=body))
            h=dict(id=header['id'],createdAt=header['createdAt'])
            rec=[r for r in receipts if (r['session_id'],r['session_created'])==(h['id'],h['createdAt']) and r['dsh_id']]
            facts=[]
            for number in sorted({e['data']['turn'] for e in projected if e['type']=='turn/start'}):
                meter.check();fact=n.native_claims(h,projected,rec,number,allow_child=True)
                facts.append(dict(sessionId=h['id'],sessionCreated=h['createdAt'],turn=number,turnStartedAt=fact['start'],finishedAt=fact['end'],claims=fact['claims']))
            native.append(dict(header=h,events=projected,facts=facts))
        proofs=meter.proofs[before:]
    present={(item['header']['id'],item['header']['createdAt']) for item in native}
    n.require(not any(sid in {k[0] for k in present} for sid,created in sessions-present),'RUN_SESSION_CONTINUITY_LOST')
    payload=dict(format=2,dbVector=db_vector,nativeVector=native_vector,sessions=wanted,receipts=receipts,sdk=sdk,dbProofs=db_proofs,nativeProofs=proofs,native=native)
    signature=hashlib.sha256(json.dumps([db_vector,native_vector,wanted],sort_keys=True,separators=(',',':')).encode()).hexdigest();reader.native_context=signature
    with reader.db:reader.db.execute('INSERT OR REPLACE INTO ownership_native VALUES(1,?,?)',(signature,json.dumps(payload)))
    turns=[fact for item in native for fact in item['facts']]
    if facts_only:
        n.require(set(sessions)<=present,'R_NATIVE_UNAVAILABLE')
        events=[];cut=n.millis(data['cut'])
        for fact in turns:
            k=(fact['sessionId'],fact['sessionCreated'],fact['turn'])
            for claim in fact['claims']:
                did=claim['deliveryId'];d=data['deliveries'].get(did,{})
                if d.get('kind')!='task' or d.get('runId')!=data['runId'] or d.get('recipient')!=name:continue
                at=claim['claimedAt'];created=d.get('createdAt');deadline=d.get('deadline')
                if type(created) is not int or type(deadline) is not int or not created<=at<=min(deadline,cut):continue
                witnesses=[row for row in [*requests.values(),*snapshots] if (row['sessionId'],row['sessionCreated'],row['turn'])==k]
                corroborated=any(claim in row['claims'] for row in witnesses)
                events.append(dict(corroborated=corroborated,runId=data['runId'],deliveryId=did,uid=uid,recipient=name,sessionId=k[0],sessionCreated=k[1],turn=k[2],claimedAt=at))
        return events
    facts={(t['sessionId'],t['sessionCreated'],t['turn']):t for t in turns}
    spec=importlib.util.spec_from_file_location('native_scope_policy',Path(__file__).with_name('session_ownership.py'))
    policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
    plan=policy.select(data['ownership'],data['deliveries'],turns,uid,name,n.millis(data['cut']),authenticated_events=data.get('authenticatedEvents'))
    reasons=plan['issues'].get(data['runId'],['OWNERSHIP_CONTEXT_INVALID'])
    if reasons:
        error=n.Incomplete('MIXED_RUN_TURN' if 'MIXED_RUN_TURN' in reasons else reasons[0]);error.ownershipConflicts=plan['conflicts'].get(data['runId'],[]);raise error
    selected=set(plan['turns'].get(data['runId'],{}));cut=n.millis(data['cut'])
    n.require(all(facts[k]['finishedAt'] is not None and facts[k]['finishedAt']<=cut for k in selected),'TURN_TERMINAL_PENDING')
    native_map={(item['header']['id'],item['header']['createdAt']):item for item in native}
    # Authority covers the entire selected native turn, including claims after
    # the last SDK request. Historical claims outside this scope are irrelevant.
    for k in selected:
        for claim in facts[k]['claims']:
            did=claim['deliveryId']
            if did is not None:
                n.require(did in data['deliveries'] and data['deliveries'][did].get('recipient')==name,'R_DELIVERY_UNPROVEN')
                delivery=data['deliveries'][did]
                if delivery.get('kind')=='task' and delivery.get('runId')!=data['runId']:
                    error=n.Incomplete('MIXED_RUN_TURN');error.ownershipConflicts=[dict(relatedRunId=delivery['runId'],sessionKey=[uid,k[0],k[1]],dshTurn=k[2])];raise error
        item=native_map[k[:2]];rec=[r for r in receipts if (r['session_id'],r['session_created'])==k[:2] and r['dsh_id']]
        n.native_claims(item['header'],item['events'],rec,k[2]) # retained child/source refusal
    sdk_map={}
    for r in sdk:
        k=(r['session_id'],r['session_created'],r['turn'])
        if k not in selected:continue
        n.require(facts[k]['turnStartedAt']<=n.integer(r['started_at'])<=facts[k]['finishedAt']<=cut,'R_REQUEST_UNPROVEN')
        rid=json.dumps([r['generation'],r['request_id']],separators=(',',':'))
        n.require(rid not in sdk_map and rid in requests,'R_REQUEST_UNPROVEN');sdk_map[rid]=r
        row=requests[rid]
        n.require((row['sessionId'],row['sessionCreated'],row['turn'])==k and n.integer(r['started_at'])<=row['registeredAt']<=facts[k]['finishedAt']<=cut,'R_REQUEST_UNPROVEN')
    for rid,row in requests.items():
        k=(row['sessionId'],row['sessionCreated'],row['turn'])
        if k not in selected:continue
        meter.check();n.require(rid in sdk_map,'R_REQUEST_UNPROVEN');registered=sdk_map[rid];binding=registered['binding']
        expected=dict(session_id=k[0],session_created=k[1],turn=k[2],request_id=row['requestId'],generation=row['requestGeneration'])
        n.require(binding is not None and all(binding.get(field)==value for field,value in expected.items()),'R_REQUEST_UNPROVEN')
        n.require(n.integer(registered['started_at'])<=row['registeredAt'],'R_REQUEST_UNPROVEN')
        item=native_map[k[:2]];fact=facts[k];rec=[r for r in receipts if (r['session_id'],r['session_created'])==k[:2] and r['dsh_id']]
        at=n.native_claims(item['header'],[e for e in item['events'] if e['time']<=row['registeredAt']],rec,k[2])
        n.same_claims(at['claims'],row['claims'])
        n.require(fact['turnStartedAt']==row['turnStartedAt'] and row['registeredAt']>=fact['turnStartedAt'],'R_NATIVE_BOUNDARY_UNPROVEN')
        n.require(row.get('claimedAt')==(min(c['claimedAt'] for c in at['claims']) if at['claims'] else None),'R_NATIVE_CLAIM_CONFLICT')
        n.require(sorted(row['deliveryIds'])==sorted(c['deliveryId'] for c in at['claims'] if c['deliveryId'] is not None),'R_DELIVERY_UNPROVEN')
    for row in snapshots:
        k=(row['sessionId'],row['sessionCreated'],row['turn'])
        if k not in selected:continue
        fact=facts[k];n.same_claims(fact['claims'],row['claims'])
        n.require((row['turnStartedAt'],row.get('finishedAt'))==(fact['turnStartedAt'],fact['finishedAt']),'R_NATIVE_BOUNDARY_UNPROVEN')
    reader.verified_turn_facts=facts
    return turns

def bind_requests(n,reader,data,requests,home,cut):
    """Resolve each new request separately; cache successful job attribution only."""
    bound=[];pending={};participant=data['participant']
    if hasattr(reader,'verified_turn_facts'):
        reader.binding_stats=dict(bindingBytes=0,bindingSeconds=0,bindingError=None)
        private={'ownershipPolicy','ownershipRuleVersion','ownershipContextFingerprint','ownershipNativeFingerprint','sessionKey','ownershipProvenance'}
        for rid,row in requests.items():
            cached=reader.binding(data['runId'],rid)
            if cached and cached.get('finishedAt') and all(cached.get(k)==row.get(k) for k in ('sessionId','sessionCreated','turn')):value=cached
            else:
                k=(row['sessionId'],row['sessionCreated'],row['turn']);fact=reader.verified_turn_facts[k];label=reader.ownership_labels[k]
                value=dict(kind='request',requestId=row['requestId'],requestGeneration=row['requestGeneration'],jobId=label['jobId'],jobRefs=label['jobRefs'],sessionId=k[0],sessionCreated=k[1],turn=k[2],claimedAt=n.iso(min(label['claimAt'],fact['turnStartedAt'])),finishedAt=n.iso(fact['finishedAt']))
                value=reader.save_binding(data['runId'],rid,value)
            bound.append({k:v for k,v in value.items() if k not in private})
        return bound

    for key,row in requests.items():
        cached=reader.binding(data['runId'],key)
        if cached and cached.get('finishedAt') and all(cached.get(k)==row.get(k) for k in ('sessionId','sessionCreated','turn')):bound.append(dict(cached,requestGeneration=row['requestGeneration']))
        else:pending[key]=row
    reader.binding_stats=dict(bindingBytes=0,bindingSeconds=0,bindingError=None)
    if pending:
        began=n.time.monotonic();meter=n.Meter(n.LIMIT,began+3)
        try:
            db=getattr(reader,'verified_db',None)
            native=getattr(reader,'verified_native',None)
            if db is None:db=n.database(participant['runtimeSource']['ledger'],participant['uid'],meter,home)
            meter.check();layout=participant['runtimeSource']['native']
            sessions={r['sessionId'] for r in pending.values()}
            paths=[n.native_path(layout,sid) for sid in sessions] if type(layout) is dict else layout
            if native is None:native={}
            for path in ([] if getattr(reader,'verified_native',None) is not None else paths):
                try:
                    header,events=n.checked_native(path,participant['uid'],home,meter);meter.check()
                    if header['id'] in sessions:native[(header['id'],header['createdAt'])]=(header,events)
                except n.Incomplete as error:
                    if str(error)=='BUDGET_EXCEEDED':raise
                except (OSError,ValueError,TypeError,KeyError):continue
            sdk={r['request_id']:r for r in db['mail_sdk_requests']}
            for key,row in pending.items():
                meter.check()
                rid=row['requestId']
                try:
                    own_db=dict(db,mail_sdk_requests=[sdk[rid]] if rid in sdk else [])
                    result=n.bind_runtime(dict(requests={rid:row},turns={}),own_db,native,data['deliveries'],data.get('operator'),participant['name'],data['runId'],cut,{},informational=True,interval_binding=getattr(reader,'ownership_labels',{}).get((row['sessionId'],row['sessionCreated'],row['turn'])))
                    meter.check();selected=[r for r in result if r['kind']=='request']
                    if selected:
                        value=dict(selected[0],requestGeneration=row['requestGeneration'])
                        if value.get('finishedAt') is not None:value=reader.save_binding(data['runId'],key,value)
                        bound.append(value)
                except n.Incomplete:raise
                except (OSError,ValueError,TypeError,KeyError):raise n.Incomplete('R_BIND_UNAVAILABLE') from None
        except n.Incomplete:raise
        except (OSError,ValueError,TypeError,KeyError):raise n.Incomplete('R_BIND_UNAVAILABLE') from None
        finally:reader.binding_stats.update(bindingBytes=meter.bytes,bindingSeconds=max(0,n.time.monotonic()-began))
    private={'ownershipPolicy','ownershipRuleVersion','ownershipContextFingerprint','ownershipNativeFingerprint','sessionKey','ownershipProvenance'}
    return [{k:v for k,v in row.items() if k not in private} for row in bound]


def require_run_coverage(n,reader,data,requests):
    participant=data['participant']['name'];run=data['runId']
    if getattr(reader,'ownership_issues',None):n.require(False,('MIXED_RUN_TURN' if reader.conflicted else reader.ownership_issues[0]))
    expected={did for did,d in data['deliveries'].items() if d.get('kind')=='task' and d.get('runId')==run and d.get('recipient')==participant and d.get('acked') is True}
    marked=set()
    for row in requests.values():
        marked.update(row['deliveryIds'])
        if hasattr(reader,'ownership_labels'):marked.update(reader.ownership_labels.get((row['sessionId'],row['sessionCreated'],row['turn']),{}).get('deliveryIds',[]))
    n.require(expected<=marked,'DELIVERY_UNBOUND')
    if participant=='master':
        operator=data.get('operator')
        n.require(operator is not None and any((r['sessionId'],r['sessionCreated'],r['turn'])==(operator['sessionId'],operator['sessionCreated'],operator['turn']) for r in requests.values()),'DELIVERY_UNBOUND')
    n.require(not reader.conflicted,'MIXED_RUN_TURN' if hasattr(reader,'ownership_context') else 'MIXED_JOB_TURN')

def require_gateway_requests(n,rows,reader,cut,started_at=None):
    lower=n.core.timestamp(started_at).timestamp()*1000 if started_at is not None else None
    upper=n.core.timestamp(cut).timestamp()*1000
    known=reader.requests();by_id={}
    for key,row in known.items():by_id.setdefault(row['requestId'],set()).add(key)
    for row in rows:
        rid=row.get('requestId')
        if rid is None:continue
        at=row.get('observedAt')
        if at is None:at=n.core.timestamp(row['startedAt']).timestamp()*1000 if row.get('startedAt') else None
        if at is not None and (at>upper or lower is not None and at<lower):continue
        choices=[request_key(row)] if 'requestGeneration' in row else list(by_id.get(rid,()))
        n.require(len(choices)==1 and choices[0] in known,'R_REQUEST_UNPROVEN')
        r=known[choices[0]]
        n.require((r['sessionId'],r['sessionCreated'],r['turn'])==(row.get('sessionId'),row.get('sessionCreated'),row.get('dshTurn')),'R_REQUEST_UNPROVEN')

def select_gateway(rows,requests,bound):
    """Request IDs are joined with their session/turn, never a latest-job guess."""
    selected={request_key(r):r for r in bound};bad=set();present=set();by_id={};all_ids={}
    for key,r in selected.items():by_id.setdefault(r['requestId'],[]).append(key)
    for key,r in requests.items():all_ids.setdefault(r['requestId'],set()).add(key)
    for row in rows:
        rid=row.get('requestId')
        if 'requestGeneration' not in row and len(all_ids.get(rid,()))!=1:continue
        choices=[key for key in by_id.get(rid,()) if 'requestGeneration' not in row or selected[key]['requestGeneration']==row['requestGeneration']]
        if len(choices)!=1:continue
        key=choices[0];r=requests[key]
        if any(row.get(k)!=r.get(v) for k,v in [('sessionId','sessionId'),('sessionCreated','sessionCreated'),('dshTurn','turn')]):bad.add(key)
        present.add(key)
    selected={key:r for key,r in selected.items() if key in present and key not in bad}
    ids={r['requestId'] for r in selected.values()}
    excluded={r['requestId']:'NATIVE_ORDINARY_INPUT' for r in rows if r.get('requestId') not in ids and r.get('requestId') is not None}
    return list(selected.values()),excluded


def finish(n,bound,gateway,raw_files,cut,*,requests=None):
    selected={request_key(r):dict(r) for r in bound};joined=[];by_id={};all_ids={}
    for key,r in selected.items():by_id.setdefault(r['requestId'],[]).append(key)
    for key,r in (selected if requests is None else requests).items():all_ids.setdefault(r['requestId'],set()).add(key)
    for g in gateway:
        if g.get('kind')!='request':continue
        if 'requestGeneration' not in g and len(all_ids.get(g.get('requestId'),()))!=1:continue
        matches=[key for key in by_id.get(g.get('requestId'),()) if 'requestGeneration' not in g or selected[key]['requestGeneration']==g['requestGeneration']]
        if len(matches)!=1:continue
        key=matches[0]
        if g.get('endedAt') and not selected[key].get('finishedAt'):selected[key]['finishedAt']=g['endedAt']
        joined.append((key,g))
    roots=list(joined)
    for g in gateway:
        if g.get('kind')!='request' or not g.get('originRequestId'):continue
        origins=[(key,r) for key,r in roots if r['requestId']==g['originRequestId'] and r.get('requestGeneration')==g.get('requestGeneration')]
        n.require(len(origins)==1,'CHILD_GRAPH_INVALID')
        origin,_=origins[0]
        key=json.dumps(['child',origin,g.get('sourceVersionKey'),g['threadId'],g['turnId']],separators=(',',':'))
        n.require(key not in selected,'CHILD_GRAPH_INVALID')
        selected[key]=dict(selected[origin],_recordKey=origin)
        joined.append((key,g));by_id.setdefault(g['requestId'],[]).append(key)
    present={key for key,g in joined};selected={key:r for key,r in selected.items() if key in present}
    # An injective private namespace carries the full SDK key to the consumer.
    # All packet IDs are qualified, so a literal SDK ID cannot alias another key.
    names={key:('sdk-child-'+hashlib.sha256(key.encode()).hexdigest() if '_recordKey' in row else 'sdk-'+key) for key,row in selected.items()}
    n.require(len(set(names.values()))==len(names),'CHILD_GRAPH_INVALID')
    gateway=[]
    for key,g in joined:
        row=dict(g,requestId=names[key])
        if 'request_id' in row:row['request_id']=names[key]
        if row.get('parentRequestId'):
            parents=[k for k in by_id.get(row['parentRequestId'],()) if k in selected]
            same=[k for k in parents if selected[k]['requestGeneration']==selected[key]['requestGeneration']]
            if len(same)==1:parents=same
            if len(parents)==1:row['parentRequestId']=names[parents[0]]
        if row.get('originRequestId'):
            origins=[k for k in by_id.get(row['originRequestId'],()) if k in selected and selected[k]['requestGeneration']==selected[key]['requestGeneration']]
            n.require(len(origins)==1,'CHILD_GRAPH_INVALID');row['originRequestId']=names[origins[0]]
        gateway.append(row)
    selected={key:dict(r,requestId=names[key],_recordKey=r.get('_recordKey',key)) for key,r in selected.items()}
    windows={}
    for g in gateway:windows.setdefault(g['threadId'],[]).append(g)
    filtered=[]
    for records in raw_files:
        output=[];thread=None
        for r in records:
            if r['type']=='meta':
                thread=r['threadId']
                if thread in windows:output.append(r)
                continue
            owner=r.get('threadId',thread);allowed=windows.get(owner,[])
            if not allowed:continue
            if r['type']=='ancestry':keep=True
            elif r['type']=='assistant':keep=any(n.millis(g['startedAt'])<=n.millis(r['at'])<=n.millis(g.get('endedAt') or cut) for g in allowed)
            elif 'turnId' in r:keep=any(r['turnId']==g['turnId'] for g in allowed)
            else:keep=r.get('at') is not None and any(n.millis(g['startedAt'])<=n.millis(r['at'])<=n.millis(g.get('endedAt') or cut) for g in allowed)
            if keep:output.append(r)
        if output:filtered.append(output)
    return [*selected.values(),dict(kind='watermark',at=cut)],[*gateway,dict(kind='watermark',at=cut)],filtered
