#!/usr/bin/env python3
"""Dedicated local postman: kernel peer credentials, private SQLite, no primary mail."""
import argparse
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import ssl
import sqlite3
import stat
import struct
import sys
import threading
import time
import signal
import subprocess
from mail_registration import queue_request, capture_ancestry, prune_terminal
from mail_retention import RetentionPolicy,load_config,classify
from mail_copies import CopyQueue,COPY_ACCOUNT,load_config as load_copy_config,digest as copy_digest

TEAM={'master','vintik','shpuntik','gayka','shurup','sova','tumbler'}
SERVICE_ACCOUNT='autopilot-post'
MAX_FRAME=262144
MAX_BODY=64000
MAX_TOTAL_BODY=16*1024*1024
SENDER_PENDING_LIMIT=200
SOCKET_PATH='/run/autopilot-mail/post.sock'
STATE_PATH='/var/lib/autopilot-mail'
SERVER_CERT='/etc/autopilot-mail/server.pem'
SERVER_KEY='/var/lib/autopilot-mail/server.key'


def notify_ready():
    address=os.environ.get('NOTIFY_SOCKET')
    if not address:return  # Direct, isolated fixtures have no service manager.
    if address.startswith('@'):address='\0'+address[1:]
    with socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM) as conn:
        conn.settimeout(1);conn.connect(address);conn.sendall(b'READY=1')


def packed(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def peer_uid(connection):
    return struct.unpack('iII',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]


def owned_directory(path,gid,mode):
    path=Path(path)
    if path.is_symlink():
        raise ValueError('UNSAFE_DIRECTORY')
    if not path.exists():
        path.mkdir(mode=mode)
        os.chown(path,-1,gid);path.chmod(mode)
    st=path.stat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=mode:
        raise ValueError('UNSAFE_DIRECTORY')
    if st.st_gid!=gid:
        os.chown(path,-1,gid)


def production_accounts():
    group=grp.getgrnam('autopilot-mail')
    if not set(group.gr_mem)<=TEAM|{SERVICE_ACCOUNT,COPY_ACCOUNT}:
        raise ValueError('FOREIGN_GROUP_MEMBER')
    try:
        primary=grp.getgrnam('a2a-pochta').gr_gid
    except KeyError:
        primary=None
    users={}
    for name in sorted(TEAM):
        user=pwd.getpwnam(name)
        groups=os.getgrouplist(name,user.pw_gid)
        if user.pw_uid==0 or group.gr_gid not in groups or (name!='master' and primary in groups):
            raise ValueError('ACCOUNT_OR_GROUP_PRECONDITION')
        users[name]=user.pw_uid
    if len(set(users.values()))!=len(TEAM):
        raise ValueError('SHARED_UID')
    return users,group.gr_gid


def send_capacity_alert(text):
    # Existing non-root spool path; no Telegram credentials or text in argv.
    env=dict(os.environ,AGENT_ALERT_CHEREZ_SPUL='1',AGENT_ALERT_ITOG_ZHDAT='10')
    try:
        process=subprocess.Popen(['/usr/local/bin/agent-alert','--plain'],stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,text=True,env=env,start_new_session=True)
        try:process.communicate(text,timeout=15)
        except subprocess.TimeoutExpired:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.communicate()
            return 'unknown'
        return 'sent' if process.returncode==0 else 'unknown' if process.returncode==75 else 'failed'
    except OSError:
        return 'failed'


def notify_unit_failure(unit,sender=send_capacity_alert):
    if unit=='autopilot-copy.service':
        state=sender('Почта Автопилота: autopilot-copy.service отказала, показ недоступен; работа продолжается. Оператор Забава: проверить copy config/ключи/status.')
        return 0 if state=='sent' else 1
    if unit!='autopilot-mail.service':return 2
    state=sender('Почта Автопилота: autopilot-mail.service отказала. Оператор Забава: проверить службу/GC; новые задания не выдавать до STORED/ACK.')
    return 0 if state=='sent' else 1


class Postman:
    def __init__(self,socket_path,state_path,users,group_gid,*,retention=None,clock=time.time,copies=None,copy_uid=None,copy_config_path=None,tls_context=None):
        if set(users)!=TEAM or any(type(uid)!=int or uid<=0 for uid in users.values()) or len(set(users.values()))!=len(users):
            raise ValueError('INVALID_ACCOUNTS')
        self.path=Path(socket_path);self.state=Path(state_path)
        self.users=dict(users);self.names={uid:name for name,uid in users.items()}
        if copy_uid is not None and (type(copy_uid)!=int or copy_uid<=0 or copy_uid in self.names or copy_uid==os.geteuid()):
            raise ValueError('INVALID_COPY_UID')
        self.copy_config_path=copy_config_path
        self.copy_uid=copy_uid;self.copies=CopyQueue(copies)
        self.gid=group_gid;self.read_timeout=5
        self.policy=RetentionPolicy(retention);self.clock=clock;self.started_at=clock()
        self.uid=os.geteuid()
        self.tls_context=tls_context
        if self.uid in self.names:
            raise ValueError('SERVICE_UID_OVERLAP')
        self.stopping=threading.Event();self.guard=threading.Lock()
        self.listener=None;self.thread=None;self.db=None;self.lock=None;self.socket_inode=None

    def start(self):
        owned_directory(self.path.parent,self.gid,0o750)
        owned_directory(self.state,os.getegid(),0o700)
        lockpath=self.state/'postman.lock'
        if lockpath.is_symlink():
            raise ValueError('UNSAFE_LOCK')
        self.lock=os.open(lockpath,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        try:
            fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            os.close(self.lock);self.lock=None
            raise ValueError('POSTMAN_ALREADY_RUNNING')
        dbpath=self.state/'mail.sqlite'
        if dbpath.exists() or dbpath.is_symlink():
            st=dbpath.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_uid!=self.uid or stat.S_IMODE(st.st_mode)!=0o600 or st.st_nlink!=1:
                raise ValueError('UNSAFE_DATABASE')
        self.db=sqlite3.connect(dbpath,check_same_thread=False,timeout=5)
        dbpath.chmod(0o600)
        self.db.row_factory=sqlite3.Row
        # No implicit reinterpretation of old content-derived IDs.
        exists=self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages'").fetchone()
        if exists:
            columns={r[1] for r in self.db.execute('PRAGMA table_info(messages)')}
            if 'nonce' not in columns:
                if self.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]:
                    raise ValueError('LEGACY_LEDGER_REQUIRES_REVIEW')
                self.db.execute('DROP TABLE messages')
        self.db.execute('CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,sender TEXT NOT NULL,sender_uid INTEGER NOT NULL,recipient TEXT NOT NULL,body TEXT NOT NULL,created REAL NOT NULL,acked INTEGER NOT NULL DEFAULT 0,acked_at REAL,nonce TEXT NOT NULL,subject TEXT NOT NULL,request_sha TEXT NOT NULL,UNIQUE(sender,nonce))')
        self.db.execute('CREATE TABLE IF NOT EXISTS usage_registrations(run_id TEXT PRIMARY KEY,request_sha TEXT NOT NULL,request_json TEXT NOT NULL,peer_uid INTEGER NOT NULL,peer_pid INTEGER NOT NULL,accepted_at REAL NOT NULL,operator_json TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS copy_outbox(event TEXT NOT NULL,target TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT "pending",PRIMARY KEY(event,target,part))')
        self.db.execute('CREATE TABLE IF NOT EXISTS capacity_alert(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL)')
        if 'episode' not in {r[1] for r in self.db.execute('PRAGMA table_info(capacity_alert)')}:
            self.db.execute("ALTER TABLE capacity_alert ADD COLUMN episode TEXT NOT NULL DEFAULT ''")
        self.db.execute("UPDATE capacity_alert SET episode=lower(hex(randomblob(16))) WHERE episode=''")
        self.db.execute("UPDATE capacity_alert SET state='unknown' WHERE state='claimed'")
        self.policy.initialize(self.db)
        self.copies.initialize(self.db)
        self.queue_capacity_warning(*self.usage())
        self.db.execute('CREATE INDEX IF NOT EXISTS pending_sender ON messages(acked,sender)')
        self.db.commit()
        if self.path.exists() or self.path.is_symlink():
            st=self.path.lstat()
            if not stat.S_ISSOCK(st.st_mode) or st.st_uid!=self.uid:
                raise ValueError('UNSAFE_SOCKET')
            self.path.unlink()
        self.listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.listener.bind(str(self.path));self.socket_inode=self.path.stat().st_ino;os.chown(self.path,-1,self.gid);self.path.chmod(0o660)
        self.listener.listen(16);self.listener.settimeout(0.2)
        self.stopping.clear()
        self.thread=threading.Thread(target=self.serve,daemon=True);self.thread.start()

    def stop(self):
        self.stopping.set()
        if self.listener:
            self.listener.close()
        if self.thread:
            self.thread.join(6)
        if self.db:
            self.db.close();self.db=None
        if self.socket_inode is not None and self.path.exists() and self.path.is_socket() and self.path.stat().st_ino==self.socket_inode:
            self.path.unlink()
        self.socket_inode=None
        if self.lock is not None:
            os.close(self.lock);self.lock=None

    def serve(self):
        while not self.stopping.is_set():
            try:
                conn,_=self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            with conn:
                end=time.monotonic()+self.read_timeout
                conn.settimeout(self.read_timeout)
                try:
                    uid=peer_uid(conn)
                    pid=struct.unpack('iII',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[0]
                    actor=self.names.get(uid)
                    ancestry=capture_ancestry(pid,uid) if actor=='master' else None
                    if self.tls_context is not None:
                        conn=self.tls_context.wrap_socket(conn,server_side=True)
                    if not actor and uid not in (self.uid,self.copy_uid):
                        # Do not read/interpret unregistered user's body.
                        answer={'ok':False,'reason':'UNREGISTERED_SENDER'}
                    else:
                        data=bytearray()
                        while b'\n' not in data and len(data)<=MAX_FRAME:
                            remaining=end-time.monotonic()
                            if remaining<=0:raise socket.timeout()
                            conn.settimeout(remaining)
                            part=conn.recv(min(65536,MAX_FRAME+1-len(data)))
                            if not part:
                                break
                            data.extend(part)
                        if len(data)>MAX_FRAME:
                            answer={'ok':False,'reason':'FRAME_TOO_LARGE'}
                        else:
                            raw,newline,tail=bytes(data).partition(b'\n')
                            if not newline or tail.strip():
                                raise ValueError('INVALID_REQUEST')
                            answer=self.handle(actor,uid,json.loads(raw.decode('utf-8')),peer_pid=pid,peer_chain=ancestry)
                    conn.sendall((packed(answer)+'\n').encode())
                except (ValueError,TypeError,KeyError,UnicodeError,RecursionError):
                    try:conn.sendall(b'{"ok":false,"reason":"INVALID_REQUEST"}\n')
                    except OSError:pass
                except socket.timeout:
                    try:conn.sendall(b'{"ok":false,"reason":"READ_TIMEOUT"}\n')
                    except OSError:pass
                except (OSError,sqlite3.Error):
                    # Never include request/body or SQLite paths in a public error.
                    try:conn.sendall(b'{"ok":false,"reason":"UNAVAILABLE"}\n')
                    except OSError:pass
                finally:
                    conn.close()

    def handle(self,actor,uid,request,*,peer_pid=None,peer_chain=None):
        if not isinstance(request,dict):
            return {'ok':False,'reason':'INVALID_REQUEST'}
        op=request.get('op')
        with self.guard,self.db:
            if op=='usage_register':
                if actor!='master' or uid!=self.users['master']:return dict(ok=False,reason='REGISTRATION_ROLE_DENIED')
                return queue_request(self.db,actor,uid,peer_pid,request,self.clock,peer_chain=peer_chain)
            if actor is None:
                if uid!=self.copy_uid:return {'ok':False,'reason':'INVALID_REQUEST'}
                if op=='copy_claim' and set(request)=={'op','config_sha'}:
                    if not self.copies.config or request['config_sha']!=copy_digest(self.copies.config):
                        # Only an authenticated worker restart asks to accept a new
                        # root-owned config. No polling, arbitrary path or JSON config.
                        try:new=load_copy_config(self.copy_config_path) if self.copy_config_path else None
                        except (ValueError,OSError,TypeError):new=None
                        if new is None or request['config_sha']!=copy_digest(new):return {'ok':False,'reason':'COPY_CONFIG_MISMATCH'}
                        self.copies.config=new
                        print(packed({'event':'autopilot_copy_config','sha256':request['config_sha']}),flush=True)
                    return self.copies.claim(self.db,self.clock())
                if op=='copy_result':return self.copies.result(self.db,request,self.clock())
                if op=='copy_status' and set(request)=={'op'}:return self.copies.status(self.db)
                return {'ok':False,'reason':'COPY_ROLE_DENIED'}
            if op=='status' and set(request)=={'op'}:
                count,total=self.usage()
                alert=self.db.execute('SELECT state FROM capacity_alert WHERE id=1').fetchone()
                pending=self.db.execute('SELECT COUNT(*) FROM messages WHERE sender=? AND acked=0',(actor,)).fetchone()[0]
                limits=self.policy.limits
                return {'ok':True,'messages':count,'body_bytes':total,'body_limit':limits['max_live_body_bytes'],
                        'body_warning_at':(limits['max_live_body_bytes']*limits['warn_percent']+99)//100,
                        'db_live_bytes':self.policy.db_bytes(self.db),'db_limit':limits['max_live_db_bytes'],
                        'sender_pending':pending,'sender_limit':limits['max_pending_per_sender'],'alert':alert['state'] if alert else 'none',
                        'copies':self.copies.status(self.db),'gc':self._retention_health(),'retention':self.policy.counts(self.db,actor),'completion_pending':self.policy.pending_completion(self.db,actor)}
            if op=='send':
                return self._send_unlocked(actor,uid,request)
            if op=='inbox' and set(request)=={'op'}:
                rows=self.db.execute('SELECT id,created FROM messages WHERE recipient=? AND acked=0 ORDER BY created,id',(actor,)).fetchall()
                return {'ok':True,'messages':[dict(r) for r in rows]}
            if (op=='job_complete' and set(request)=={'op','id','result_id'} and all(isinstance(request[k],str) and re.fullmatch('[0-9a-f]{64}',request[k]) for k in ('id','result_id'))):
                return self.policy.completion(self.db,actor,request['id'],request['result_id'],self.clock())
            if op in ('get','ack') and set(request)=={'op','id'} and isinstance(request['id'],str) and re.fullmatch('[0-9a-f]{64}',request['id']):
                row,pruned=self.policy.lookup(self.db,request['id'])
                if not row or row['recipient']!=actor:
                    return {'ok':False,'reason':'WRONG_RECIPIENT'}
                if op=='ack':
                    if not pruned and not row['acked']:
                        now=self.clock()
                        eligible=now if row['kind'] in ('ordinary','result') else None
                        self.db.execute('UPDATE messages SET acked=1,acked_at=?,retention_at=? WHERE id=?',(now,eligible,row['id']))
                        self.copies.event(self.db,row,'receive',now)
                        if self.copies.config is None:self.copy_event(row,'receipt','DELIVERED')
                    return {'ok':True,'status':'ACKED'}
                if pruned or row['in_released']:return {'ok':False,'reason':'BODY_PRUNED','id':request['id']}
                return self.envelope(row,uid)
            return {'ok':False,'reason':'INVALID_REQUEST'}

    def _send_unlocked(self,actor,uid,request,allow_gc=True):
        fields={'op','to','body','nonce','subject'}
        if set(request) not in (fields,fields|{'sender'}):
            return {'ok':False,'reason':'INVALID_REQUEST'}
        if 'sender' in request and request['sender']!=actor:
            return {'ok':False,'reason':'SENDER_MISMATCH'}
        if (not isinstance(request['to'],str) or request['to'] not in self.users or
            not isinstance(request['body'],str) or not isinstance(request['subject'],str) or
            len(request['subject'])>200 or not isinstance(request['nonce'],str) or
            not re.fullmatch('[A-Za-z0-9_-]{1,128}',request['nonce'])):
            return {'ok':False,'reason':'INVALID_REQUEST'}
        body=request['body'];body.encode('utf-8');request['subject'].encode('utf-8')
        if not body or len(body)>MAX_BODY:
            return {'ok':False,'reason':'MESSAGE_TOO_LARGE'}
        message_id=hashlib.sha256(packed([actor,request['nonce']]).encode()).hexdigest()
        request_sha=hashlib.sha256(packed([request['to'],request['subject'],body]).encode()).hexdigest()
        old,pruned=self.policy.lookup(self.db,message_id)
        if old:
            if old['request_sha']!=request_sha:
                return {'ok':False,'reason':'REQUEST_CONFLICT'}
            return dict(ok=True,status='STORED',id=message_id,**({'body_pruned':True} if pruned else {}))
        count,total=self.usage()
        if total+len(body.encode())>self.policy.limits['max_live_body_bytes']:
            if not allow_gc:return {'ok':False,'reason':'STOP_LIVE_BODY'}
            swept=self.policy.sweep(self.db,self.clock())
            self.db.commit()
            print(packed(dict(event='autopilot_mail_gc',**swept)),flush=True)
            count,total=self.usage()
            if total+len(body.encode())>self.policy.limits['max_live_body_bytes']:
                return {'ok':False,'reason':'STOP_LIVE_BODY'}
        if self.db.execute('SELECT COUNT(*) FROM messages WHERE sender=? AND acked=0',(actor,)).fetchone()[0]>=self.policy.limits['max_pending_per_sender']:
            return {'ok':False,'reason':'SENDER_QUOTA_FULL'}
        candidate={'id':message_id,'sender':actor,'sender_uid':uid,'recipient':request['to'],
                   'body':body,'created':self.clock(),'nonce':request['nonce'],'subject':request['subject'],'request_sha':request_sha}
        if len((packed(self.envelope(candidate,self.users[request['to']]))+chr(10)).encode())>MAX_FRAME:
            return {'ok':False,'reason':'MESSAGE_TOO_LARGE'}
        self.db.execute('INSERT INTO messages(id,sender,sender_uid,recipient,body,created,nonce,subject,request_sha) VALUES(?,?,?,?,?,?,?,?,?)',
            tuple(candidate[k] for k in ('id','sender','sender_uid','recipient','body','created','nonce','subject','request_sha')))
        kind,ref=classify(actor,request['to'],body)
        self.db.execute('UPDATE messages SET kind=?,job_ref=? WHERE id=?',(kind,ref,message_id))
        self.copies.event(self.db,candidate,'send',self.clock())
        if self.copies.config is None:
            self.copy_event(candidate,'letter','STORED')
            self.copy_event(candidate,'receipt','STORED')
        if self.policy.db_bytes(self.db)>self.policy.limits['max_live_db_bytes']:
            self.db.rollback()
            if allow_gc:
                with self.db:swept=self.policy.sweep(self.db,self.clock())
                print(packed(dict(event='autopilot_mail_gc',**swept)),flush=True)
                return self._send_unlocked(actor,uid,request,allow_gc=False)
            return {'ok':False,'reason':'STOP_LIVE_DB'}
        self.queue_capacity_warning(count+1,total+len(body.encode()))
        return {'ok':True,'status':'STORED','id':message_id}

    @staticmethod
    def envelope(row,recipient_uid):
        header={'version':2,'id':row['id'],'sender':row['sender'],'sender_uid':row['sender_uid'],
                'recipient':row['recipient'],'recipient_uid':recipient_uid,'created_at':row['created'],
                'nonce':row['nonce'],'subject':row['subject'],'request_sha':row['request_sha']}
        return {'ok':True,'header':header,'body':row['body']}

    def usage(self):
        return self.db.execute('SELECT COUNT(*),COALESCE(SUM(length(CAST(body AS BLOB))),0) FROM messages').fetchone()

    def queue_capacity_warning(self,count,total):
        limits=self.policy.limits;db_bytes=self.policy.db_bytes(self.db)
        if total*100>=limits['max_live_body_bytes']*limits['warn_percent'] or db_bytes*100>=limits['max_live_db_bytes']*limits['warn_percent']:
            self.db.execute("INSERT OR IGNORE INTO capacity_alert(id,state,episode) VALUES(1,'pending',lower(hex(randomblob(16))))")
        elif total*100<limits['max_live_body_bytes']*limits['recover_percent'] and db_bytes*100<limits['max_live_db_bytes']*limits['recover_percent']:
            self.db.execute('DELETE FROM capacity_alert WHERE id=1')

    def notify_capacity(self,sender=send_capacity_alert):
        with self.guard,self.db:
            row=self.db.execute("SELECT episode FROM capacity_alert WHERE id=1 AND state='pending'").fetchone()
            if not row:return
            episode=row['episode']
            changed=self.db.execute("UPDATE capacity_alert SET state='claimed' WHERE id=1 AND state='pending' AND episode=?",(episode,)).rowcount
            if not changed:return
            count,total=self.usage()
            db_bytes=self.policy.db_bytes(self.db)
        text=(f'Почта Автопилота: живые тела {total}/{self.policy.limits["max_live_body_bytes"]} байт, '
              f'занятая БД {db_bytes}/{self.policy.limits["max_live_db_bytes"]} байт. '
              'Порог ресурса достигнут. Оператор Забава: проверить GC и назначить расширение; защищённое не удалять.')
        print(packed({'event':'autopilot_mail_capacity','state':'claimed','messages':count,'body_limit':self.policy.limits['max_live_body_bytes']}),flush=True)
        state=sender(text)
        if state not in ('sent','failed','unknown'):state='unknown'
        with self.guard,self.db:self.db.execute("UPDATE capacity_alert SET state=? WHERE id=1 AND state='claimed' AND episode=?",(state,episode))
        print(packed({'event':'autopilot_mail_capacity','state':state}),flush=True)

    def retention_tick(self,force=False):
        now=self.clock()
        with self.guard:
            state=self.db.execute('SELECT * FROM retention_state WHERE id=1').fetchone()
            if not force and state['last_run'] is not None and now-state['last_run']<self.policy.config['sweep_interval_seconds']:
                return {'ok':True,'ran':False}
            try:
                with self.db:
                    result=self.policy.sweep(self.db,now)
                    result['registrationPruned']=prune_terminal(self.db)
                    self.queue_capacity_warning(*self.usage())
            except sqlite3.Error:
                with self.db:self.db.execute("UPDATE retention_state SET run_seq=run_seq+1,last_run=?,error='GC_FAILED',alert_state=CASE WHEN error IS NULL THEN 'pending' ELSE alert_state END WHERE id=1",(now,))
                result={'ok':False,'ran':True,'reason':'GC_FAILED'}
        print(packed(dict(event='autopilot_mail_gc',**result)),flush=True)
        return result

    def _retention_health(self):
        state=self.db.execute('SELECT * FROM retention_state WHERE id=1').fetchone()
        if state['error']:return {'ok':False,'reason':state['error'],'last_success':state['last_success']}
        lag=max(0,self.clock()-(state['last_success'] if state['last_success'] is not None else self.started_at))
        return {'ok':lag<=3*self.policy.config['sweep_interval_seconds'],'reason':'GC_LAG' if lag>3*self.policy.config['sweep_interval_seconds'] else 'OK','lag_seconds':lag,'last_success':state['last_success']}

    def retention_health(self):
        with self.guard:return self._retention_health()

    def notify_gc(self,sender=send_capacity_alert):
        with self.guard,self.db:
            health=self._retention_health()
            if not health['ok']:
                self.db.execute("UPDATE retention_state SET error=?,alert_state=CASE WHEN error IS NULL THEN 'pending' ELSE alert_state END WHERE id=1",(health['reason'],))
            changed=self.db.execute("UPDATE retention_state SET alert_state='claimed' WHERE id=1 AND alert_state='pending'").rowcount
        if changed:
            state=sender('Почта Автопилота: сбой/незов GC; оператор Забава, проверить status. Защищённые письма сохранены.')
            with self.guard,self.db:self.db.execute('UPDATE retention_state SET alert_state=? WHERE id=1',(state if state in ('sent','unknown','failed') else 'unknown',))

    def notify_copies(self,sender=send_capacity_alert):
        with self.guard,self.db:
            row=self.db.execute("SELECT * FROM copy_alerts WHERE state='pending' ORDER BY seq LIMIT 1").fetchone()
            if row is None:return
            self.db.execute("UPDATE copy_alerts SET state='claimed' WHERE seq=? AND state='pending'",(row['seq'],))
        text=('Почта Автопилота: возможно не дошла Telegram-квитанция; работа продолжается. '
              'Оператор Забава: copy status, один эпизод '+row['id']) if row['kind']=='lost' else ('Почта Автопилота: показ восстановлен, первая успешная квитанция. Эпизод '+row['id']+'; прежние possibly_lost не переотправлялись.')
        state=sender(text)
        with self.guard,self.db:self.db.execute("UPDATE copy_alerts SET state=? WHERE seq=? AND state='claimed'",(state if state in ('sent','unknown','failed') else 'unknown',row['seq']))

    def message_count(self):
        with self.guard:
            return self.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]

    def copy_event(self,row,kind,outcome):
        # One inert pilot destination; no selection policy or Telegram sender here.
        event=row['id']+':'+kind+':'+outcome
        pointer='\nполный текст: autopilot-mail get '+row['id']
        head=f"[AP {event}] {row['sender']} → {row['recipient']} | {row['subject']} | {kind} | {outcome}\n"
        raw=(head+(row['body'] if kind=='letter' else '')).encode('utf-16-le')
        budget=3500-len(pointer.encode('utf-16-le'))//2
        suffix='\n[усечено]' if len(raw)>budget*2 else ''
        budget-=len(suffix.encode('utf-16-le'))//2
        text=raw[:budget*2].decode('utf-16-le',errors='ignore')+suffix+pointer
        self.db.execute('INSERT INTO copy_outbox(event,target,part,body) VALUES(?,?,1,?)',(event,'pilot',text))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--retention',default='/etc/autopilot-mail/retention.json')
    parser.add_argument('--copies',default='/etc/autopilot-mail/copy.json')
    args=parser.parse_args()
    try:
        if os.geteuid()==0 or pwd.getpwuid(os.geteuid()).pw_name!=SERVICE_ACCOUNT:
            raise ValueError('POSTMAN_REQUIRES_SERVICE_ACCOUNT')
        users,gid=production_accounts()
        key=Path(SERVER_KEY).lstat();cert=Path(SERVER_CERT).lstat()
        if (not stat.S_ISREG(key.st_mode) or key.st_uid!=os.geteuid() or
            stat.S_IMODE(key.st_mode)!=0o600 or key.st_nlink!=1 or
            not stat.S_ISREG(cert.st_mode) or cert.st_uid!=0 or cert.st_mode&0o022):
            raise ValueError('UNSAFE_TLS_IDENTITY')
        tls_context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls_context.minimum_version=ssl.TLSVersion.TLSv1_2
        tls_context.load_cert_chain(SERVER_CERT,SERVER_KEY)
        try:primary=grp.getgrnam('a2a-pochta').gr_gid
        except KeyError:primary=None
        if primary==os.getegid() or primary in os.getgroups():raise ValueError('SERVICE_IN_PRIMARY_GROUP')
        copies=None;copy_uid=None;copy_error=False
        try:
            copies=load_copy_config(args.copies);copy_uid=pwd.getpwnam(COPY_ACCOUNT).pw_uid
            if type(copy_uid)!=int or copy_uid<=0 or copy_uid in users.values() or copy_uid==os.geteuid():raise ValueError('INVALID_COPY_UID')
        except (ValueError,OSError,KeyError):
            copies=None;copy_uid=None;copy_error=True
            print('COPY_CONFIG_OR_ACCOUNT_UNAVAILABLE: postal work continues; legacy outbox held for review',file=sys.stderr)
        postman=Postman(SOCKET_PATH,STATE_PATH,users,gid,retention=load_config(args.retention),copies=copies,copy_uid=copy_uid,copy_config_path=args.copies,tls_context=tls_context)
        try:postman.start()
        except ValueError as error:
            if str(error)!='LEGACY_COPY_OUTBOX_REQUIRES_REVIEW':raise
            postman.stop();postman=Postman(SOCKET_PATH,STATE_PATH,users,gid,retention=load_config(args.retention),tls_context=tls_context);postman.start();copy_error=True
        try:
            notify_ready()  # Both start paths completed bind/listen before READY.
            print(packed({'event':'autopilot_mail_loaded','runtime_version':Path(__file__).resolve().parents[1].name,'source_module':str(Path(__file__).resolve())}),flush=True)
            if copy_error:send_capacity_alert('Почта Автопилота: показ не настроен/нужен разбор legacy outbox, работа продолжается. Оператор Забава: проверить copy config/status.')
            while postman.thread.is_alive():
                postman.retention_tick()
                postman.notify_gc()
                postman.notify_capacity()
                postman.notify_copies()
                time.sleep(0.2)
            raise RuntimeError('POSTMAN_THREAD_FAILED')
        except KeyboardInterrupt:
            pass
        finally:
            postman.stop()
        return 0
    except (KeyError,ValueError,RuntimeError,OSError,sqlite3.Error) as error:
        reason=error.args[0] if isinstance(error,ValueError) and error.args and isinstance(error.args[0],str) and error.args[0].startswith('RETENTION_CONFIG') else type(error).__name__
        print('PRECONDITION_MISSING: '+reason,file=sys.stderr);return 2


if __name__=='__main__':
    sys.exit(main())
