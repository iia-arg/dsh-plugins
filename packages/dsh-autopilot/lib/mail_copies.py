"""Durable service receipts: two facts, independent subject flags, bounded attempts."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import stat

TEAM=frozenset({'master','vintik','shpuntik','gayka','shurup','sova','tumbler'})
COPY_ACCOUNT='autopilot-copy'


def validate(value):
    c=copy.deepcopy(value)
    def keys(v,want):
        if not isinstance(v,dict) or set(v)!=set(want):raise ValueError('COPY_CONFIG_FIELDS')
    def decimal(v,negative=False):
        return isinstance(v,str) and bool(re.fullmatch('-[1-9][0-9]{0,18}' if negative else '[1-9][0-9]{0,18}',v))
    keys(c,('schema_version','bots','targets'))
    if type(c['schema_version'])!=int or c['schema_version']!=2:raise ValueError('COPY_CONFIG_VERSION')
    keys(c['bots'],TEAM);ids=set()
    for actor,b in c['bots'].items():
        keys(b,('bot_user_id','token_file'))
        if not decimal(b['bot_user_id']) or b['bot_user_id'] in ids:raise ValueError('COPY_CONFIG_BOT_ID '+actor)
        ids.add(b['bot_user_id'])
        f=b['token_file']
        if not isinstance(f,str) or not f.startswith('/') or str(Path(f))!=f or '..' in Path(f).parts:raise ValueError('COPY_CONFIG_KEY_PATH '+actor)
    if not isinstance(c['targets'],list) or len(c['targets'])!=1:raise ValueError('COPY_CONFIG_PILOT_ONE_TARGET')
    for t in c['targets']:
        keys(t,('id','chat_id','agents','text_chars'))
        if not isinstance(t['id'],str) or not re.fullmatch('[a-z][a-z0-9_-]{0,31}',t['id']):raise ValueError('COPY_CONFIG_TARGET')
        if not decimal(t['chat_id'],True):raise ValueError('COPY_CONFIG_CHAT_ID '+t['id'])
        if type(t['text_chars'])!=int or t['text_chars'] not in (100,3000):raise ValueError('COPY_CONFIG_TEXT_CHARS '+t['id'])
        keys(t['agents'],TEAM)
        for a,flags in t['agents'].items():
            keys(flags,('on_send','on_receive'))
            if any(type(v)!=bool for v in flags.values()):raise ValueError('COPY_CONFIG_FLAGS '+a)
    return c


def digest(config):
    return hashlib.sha256(json.dumps(validate(config),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()


def load_config(path):
    p=Path(path);s=p.parent.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o755 or p.parent.resolve()!=p.parent.absolute():raise ValueError('COPY_CONFIG_PARENT')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o644 or s.st_nlink!=1 or s.st_size>65536:raise ValueError('COPY_CONFIG_FILE')
        def unique(pairs):
            d={}
            for k,v in pairs:
                if k in d:raise ValueError('COPY_CONFIG_DUPLICATE')
                d[k]=v
            return d
        with os.fdopen(fd,'r',closefd=False) as f:return validate(json.load(f,object_pairs_hook=unique))
    finally:os.close(fd)


def render(delivery,phase,actor,other,subject,body,limit):
    subject=' '.join(subject.splitlines())
    if len(subject)>128:subject=subject[:128]+'…'
    action='отправляю письмо '+other if phase=='send' else 'получил письмо от '+other
    head=f'{actor}: {action}\nТема: {subject}\n[AP {delivery} {phase}]\n'
    suffix='…\nТекст обрезан. Полный текст: autopilot-mail get '+delivery
    def units(s):return len(s.encode('utf-16-le'))//2
    prefix=body[:limit]
    while units(head+prefix+(suffix if len(prefix)<len(body) else ''))>3500:
        if not prefix:raise ValueError('COPY_FORMAT_ENVELOPE')
        prefix=prefix[:-1]
    return head+prefix+(suffix if len(prefix)<len(body) else '')


class CopyQueue:
    """All methods run under the postman's existing guard/SQLite transaction."""
    def __init__(self,config=None):self.config=validate(config) if config is not None else None
    def initialize(self,db):
        db.executescript('''
CREATE TABLE IF NOT EXISTS copy_facts(event TEXT PRIMARY KEY,delivery_id TEXT NOT NULL,phase TEXT NOT NULL,actor TEXT NOT NULL,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS copy_publications(event TEXT NOT NULL,target TEXT NOT NULL,part INTEGER NOT NULL DEFAULT 1,phase TEXT NOT NULL,actor TEXT NOT NULL,bot_id TEXT NOT NULL,chat_id TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at REAL NOT NULL DEFAULT 0,claim TEXT,lease_until REAL,reason TEXT,message_id INTEGER,PRIMARY KEY(event,target,part));
CREATE TABLE IF NOT EXISTS copy_cooldowns(bot_id TEXT NOT NULL,chat_id TEXT NOT NULL,until REAL NOT NULL,PRIMARY KEY(bot_id,chat_id));
CREATE TABLE IF NOT EXISTS copy_episode(singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL,active INTEGER NOT NULL,lost_count INTEGER NOT NULL,first_event TEXT NOT NULL,last_event TEXT NOT NULL,first_at REAL NOT NULL,last_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS copy_alerts(seq INTEGER PRIMARY KEY,id TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',UNIQUE(id,kind));
''')
        # Do not replay old raw observations into a live chat at cutover.
        if self.config and db.execute('SELECT COUNT(*) FROM copy_outbox WHERE state!=?',('held_legacy',)).fetchone()[0]:
            raise ValueError('LEGACY_COPY_OUTBOX_REQUIRES_REVIEW')
        db.execute("UPDATE copy_alerts SET state='unknown' WHERE state='claimed'")
    def event(self,db,row,phase,now):
        actor=row['sender'] if phase=='send' else row['recipient'];other=row['recipient'] if phase=='send' else row['sender']
        event=row['id']+':'+phase
        changed=db.execute('INSERT OR IGNORE INTO copy_facts VALUES(?,?,?,?,?)',(event,row['id'],phase,actor,now)).rowcount
        if not changed or self.config is None:return
        for t in self.config['targets']:
            if not t['agents'][actor]['on_'+phase]:continue
            text=render(row['id'],phase,actor,other,row['subject'],row['body'],t['text_chars'])
            db.execute('INSERT INTO copy_publications(event,target,part,phase,actor,bot_id,chat_id,body) VALUES(?,?,1,?,?,?,?,?)',
              (event,t['id'],phase,actor,self.config['bots'][actor]['bot_user_id'],t['chat_id'],text))
    def _terminal(self,db,row,state,now,reason=None,message_id=None):
        db.execute('UPDATE copy_publications SET state=?,reason=?,message_id=?,body=?,claim=NULL,lease_until=NULL WHERE event=? AND target=? AND part=?',
          (state,reason,message_id,'',row['event'],row['target'],row['part']))
        ep=db.execute('SELECT * FROM copy_episode WHERE singleton=1').fetchone()
        if state=='possibly_lost':
            if ep and ep['active']:
                db.execute('UPDATE copy_episode SET lost_count=lost_count+1,last_event=?,last_at=? WHERE singleton=1',(row['event'],now))
            else:
                eid=secrets.token_hex(16)
                db.execute('INSERT OR REPLACE INTO copy_episode VALUES(1,?,1,1,?,?,?,?)',(eid,row['event'],row['event'],now,now))
                db.execute("INSERT INTO copy_alerts(id,kind) VALUES(?,'lost')",(eid,))
        elif state=='sent' and ep and ep['active']:
            db.execute('UPDATE copy_episode SET active=0 WHERE singleton=1')
            db.execute("INSERT OR IGNORE INTO copy_alerts(id,kind) VALUES(?,'recovery')",(ep['id'],))
    def _allowed(self,row):
        if self.config is None:return False
        return any(t['id']==row['target'] and t['chat_id']==row['chat_id'] and t['agents'][row['actor']]['on_'+row['phase']]
          and self.config['bots'][row['actor']]['bot_user_id']==row['bot_id'] for t in self.config['targets'])
    def claim(self,db,now):
        for row in db.execute("SELECT * FROM copy_publications WHERE state IN ('pending','retry','claimed')").fetchall():
            if not self._allowed(row):self._terminal(db,row,'suppressed',now,'CONFIG_DISABLED_OR_CHANGED');continue
            if row['state']=='claimed' and row['lease_until']<=now:
                if row['attempts']>=5:self._terminal(db,row,'possibly_lost',now,'LEASE_EXPIRED')
                else:db.execute("UPDATE copy_publications SET state='retry',next_at=?,claim=NULL,lease_until=NULL WHERE claim=?",(now+10,row['claim']))
        row=db.execute("SELECT p.* FROM copy_publications p LEFT JOIN copy_cooldowns c ON p.bot_id=c.bot_id AND p.chat_id=c.chat_id WHERE p.state IN ('pending','retry') AND p.attempts<5 AND p.next_at<=? AND COALESCE(c.until,0)<=? ORDER BY p.next_at,p.event,p.target LIMIT 1",(now,now)).fetchone()
        if not row:return {'ok':True,'publication':None}
        token=secrets.token_hex(16)
        db.execute("UPDATE copy_publications SET state='claimed',attempts=attempts+1,claim=?,lease_until=? WHERE event=? AND target=? AND part=?",(token,now+30,row['event'],row['target'],row['part']))
        return {'ok':True,'publication':dict(event=row['event'],target=row['target'],part=row['part'],actor=row['actor'],chat_id=row['chat_id'],body=row['body'],claim=token,attempts=row['attempts']+1)}
    def result(self,db,req,now):
        if (set(req)!={'op','claim','outcome','retry_after','message_id'} or not isinstance(req['claim'],str) or not re.fullmatch('[0-9a-f]{32}',req['claim']) or req['outcome'] not in ('sent','failed','unknown')
            or (req['retry_after'] is not None and (type(req['retry_after'])!=int or not 0<=req['retry_after']<=2147483647))
            or (req['message_id'] is not None and (type(req['message_id'])!=int or req['message_id']<=0))
            or (req['outcome']=='sent' and req['message_id'] is None)):
            return {'ok':False,'reason':'INVALID_COPY_RESULT'}
        row=db.execute("SELECT * FROM copy_publications WHERE claim=? AND state='claimed'",(req['claim'],)).fetchone()
        if not row or row['lease_until']<=now:return {'ok':False,'reason':'STALE_COPY_CLAIM'}
        if req['outcome']=='sent':self._terminal(db,row,'sent',now,message_id=req['message_id'])
        else:
            delay=max(10,req['retry_after'] or 0)
            if req['retry_after'] is not None:
                db.execute('INSERT INTO copy_cooldowns VALUES(?,?,?) ON CONFLICT(bot_id,chat_id) DO UPDATE SET until=MAX(until,excluded.until)',(row['bot_id'],row['chat_id'],now+delay))
            if row['attempts']>=5:self._terminal(db,row,'possibly_lost',now,req['outcome'])
            else:db.execute("UPDATE copy_publications SET state='retry',next_at=?,claim=NULL,lease_until=NULL,reason=? WHERE claim=?",(now+delay,req['outcome'],req['claim']))
        return {'ok':True}
    def status(self,db):
        ep=db.execute('SELECT * FROM copy_episode WHERE singleton=1').fetchone()
        return {'ok':True,'configured':self.config is not None,'episode':dict(ep) if ep else None,
          'states':{r[0]:r[1] for r in db.execute('SELECT state,COUNT(*) FROM copy_publications GROUP BY state')},
          'alerts':[dict(r) for r in db.execute('SELECT id,kind,state FROM copy_alerts ORDER BY seq')],
          'unprojected_facts':db.execute('SELECT COUNT(*) FROM copy_facts f WHERE NOT EXISTS(SELECT 1 FROM copy_publications p WHERE p.event=f.event)').fetchone()[0]}
