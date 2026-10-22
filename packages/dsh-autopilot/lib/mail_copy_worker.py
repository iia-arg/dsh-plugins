#!/usr/bin/env python3
"""Non-thinking copy worker. No update polling, commands or model access."""
import argparse
import grp
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import sys
import threading
import time
from mail_copies import COPY_ACCOUNT,TEAM,load_config,validate,digest


def load_tokens(config):
    expected_gid=grp.getgrnam(COPY_ACCOUNT).gr_gid
    tokens={}
    for actor,b in config['bots'].items():
        try:
            p=Path(b['token_file']);s=p.parent.lstat()
            if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_gid!=expected_gid or stat.S_IMODE(s.st_mode)!=0o750 or p.parent.resolve()!=p.parent.absolute():raise ValueError()
            fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
            try:
                s=os.fstat(fd)
                if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=expected_gid or stat.S_IMODE(s.st_mode)!=0o640 or s.st_nlink!=1 or s.st_size>256:raise ValueError()
                raw=os.read(fd,257).decode('ascii')
            finally:os.close(fd)
            token=raw[:-1] if raw.endswith('\n') else raw
            match=re.fullmatch(r'([1-9][0-9]*):[A-Za-z0-9_-]{20,200}',token)
            if not match or match[1]!=b['bot_user_id']:raise ValueError()
            tokens[actor]=token
        except (ValueError,OSError,UnicodeError):
            # No exception/token/URL is interpolated, including on startup.
            raise ValueError('COPY_KEY_INVALID '+actor) from None
    return tokens


def telegram_request(token,method,payload):
    connection=http.client.HTTPSConnection('api.telegram.org',timeout=10)
    def expire():
        sock=connection.sock
        if sock:
            try:sock.shutdown(socket.SHUT_RDWR)
            except OSError:pass
    timer=threading.Timer(10,expire);timer.daemon=True;timer.start()
    try:
        data=json.dumps(payload,ensure_ascii=False).encode()
        connection.request('POST','/bot'+token+'/'+method,data,{'Content-Type':'application/json'})
        response=connection.getresponse()
        # No redirects followed; no URL, token or raw server description logged.
        body=response.read(65537)
        if len(body)>65536 or 300<=response.status<400:return {'ok':False}
        value=json.loads(body)
        return value if isinstance(value,dict) else {'ok':False}
    finally:timer.cancel();connection.close()


class TelegramTransport:
    def __init__(self,config,tokens,network=None):
        self.config=validate(config);self.tokens=tokens;self.network=network or telegram_request
        self.chats={t['chat_id'] for t in self.config['targets']};self.denied_count=0
    def deny(self,reason,method,chat_id):
        self.denied_count+=1
        known=('sendMessage','getUpdates','getMe','setWebhook','deleteWebhook','forwardMessage','editMessageText','deleteMessage')
        print(json.dumps({'event':'autopilot_copy_denied','reason':reason,'method':method if method in known else 'other',
            'target':'accepted' if isinstance(chat_id,str) and chat_id in self.chats else 'unlisted','count':self.denied_count}),file=sys.stderr)
        raise ValueError(reason)
    def publish(self,actor,method,chat_id,text):
        if method!='sendMessage':self.deny('COPY_METHOD_DENIED',method,chat_id)
        if not isinstance(chat_id,str) or chat_id not in self.chats:self.deny('COPY_CHAT_DENIED',method,chat_id)
        if actor not in self.tokens:self.deny('COPY_ACTOR_DENIED',method,chat_id)
        if not isinstance(text,str) or not text or len(text.encode('utf-16-le'))//2>3500:self.deny('COPY_TEXT_DENIED',method,chat_id)
        payload={'chat_id':chat_id,'text':text,'link_preview_options':{'is_disabled':True}}
        try:
            response=self.network(self.tokens[actor],method,payload)
            if not isinstance(response,dict):raise ValueError()
            mid=response.get('result',{}).get('message_id') if isinstance(response.get('result'),dict) else None
            if response.get('ok') is True and type(mid)==int and mid>0:return {'outcome':'sent','retry_after':None,'message_id':mid}
            if response.get('ok') is True:raise ValueError()
            retry=response.get('parameters',{}).get('retry_after') if isinstance(response.get('parameters'),dict) else None
            if response.get('error_code')==429 and (type(retry)!=int or not 0<=retry<=2147483647):print('COPY_INVALID_RETRY_AFTER',file=sys.stderr)
            if response.get('error_code')!=429 or type(retry)!=int or not 0<=retry<=2147483647:retry=None
            return {'outcome':'failed','retry_after':retry,'message_id':None}
        except (OSError,ValueError,TypeError,http.client.HTTPException):
            return {'outcome':'unknown','retry_after':None,'message_id':None}


class CopyWorker:
    def __init__(self,client,transport):self.client=client;self.transport=transport
    def request(self,request):
        from mail_client import MailConnectUnavailable
        deadline=time.monotonic()+10
        while True:
            try:return self.client.request(request)
            except MailConnectUnavailable:
                remaining=deadline-time.monotonic()
                if remaining<=0:raise
                time.sleep(min(.2,remaining))
                if time.monotonic()>=deadline:raise

    def step(self):
        claim=self.request({'op':'copy_claim','config_sha':digest(self.transport.config)})
        if not claim.get('ok'):raise ValueError('COPY_CLAIM_REFUSED')
        row=claim.get('publication')
        if row is None:return False
        try:result=self.transport.publish(row['actor'],'sendMessage',row['chat_id'],row['body'])
        except ValueError:
            # Guard refusal is visible, consumes only the already claimed bounded
            # attempt; it must never retry via an unguarded transport.
            print('COPY_PUBLICATION_GUARD_DENIED',file=sys.stderr)
            result={'outcome':'failed','retry_after':None,'message_id':None}
        answer=self.request(dict(op='copy_result',claim=row['claim'],**result))
        if not answer.get('ok'):raise ValueError('COPY_RESULT_REFUSED')
        print(json.dumps({'event':'autopilot_copy','event_id':row.get('event'),'target':row.get('target'),'outcome':result['outcome']},ensure_ascii=False),flush=True)
        return True


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',default='/etc/autopilot-mail/copy.json');parser.add_argument('--socket',default='/run/autopilot-mail/post.sock');args=parser.parse_args()
    try:
        if os.geteuid()==0 or pwd.getpwuid(os.geteuid()).pw_name!=COPY_ACCOUNT:raise ValueError('COPY_ACCOUNT_REQUIRED')
        config=load_config(args.config)
        tokens=load_tokens(config)  # All seven, before claim/network.
        from mail_client import MailClient
        worker=CopyWorker(MailClient(args.socket),TelegramTransport(config,tokens))
        print(json.dumps({'event':'autopilot_copy_loaded','runtime_version':Path(__file__).resolve().parents[1].name,'source_module':str(Path(__file__).resolve())}),flush=True)
        while True:
            if not worker.step():time.sleep(.2)
    except KeyboardInterrupt:return 0
    except (ValueError,KeyError,OSError,UnicodeError):
        # Narrow public reason; key validator messages contain only actor name.
        error=sys.exc_info()[1]
        reason=str(error) if isinstance(error,ValueError) and str(error).startswith(('COPY_KEY_INVALID ','COPY_CONFIG_','COPY_ACCOUNT_REQUIRED')) else 'COPY_UNAVAILABLE'
        print(reason,file=sys.stderr);return 2

if __name__=='__main__':sys.exit(main())
