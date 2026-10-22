#!/usr/bin/env python3
"""Client for dedicated Autopilot mail only; no main a2a access or credentials."""
import argparse
from contextlib import contextmanager
import errno
import datetime
import math
import re
import json
import os
from pathlib import Path
import pwd
import socket
import ssl
import stat
import struct
import sys
import tempfile
from pilot_transport import identity_from_transport
from mail_service import SERVICE_ACCOUNT

DEFAULT_SOCKET='/run/autopilot-mail/post.sock'
MAX_FRAME=262144
SERVER_CERT='/etc/autopilot-mail/server.pem'


class LocalMailError(ValueError):
    """A fixed client-local refusal code, never a server reason or raw exception."""


@contextmanager
def local_state_failure(reason='LOCAL_STATE_UNAVAILABLE'):
    """Only surround local state operations; RPC/TLS must stay outside this scope."""
    try:
        yield
    except (json.JSONDecodeError,UnicodeError):
        raise LocalMailError('INVALID_LOCAL_REQUEST') from None
    except OSError as error:
        # Library callers retain the original subclass, errno and filename.
        error._mail_cli_local_reason=reason
        raise


class MailConnectUnavailable(ConnectionError):
    """Endpoint absent/refusing: no application request bytes were sent."""


class MailClient:
    def __init__(self,socket_path=DEFAULT_SOCKET,account_lookup=None,server_uid=None,*,tls_cert=SERVER_CERT,timeout=5):
        self.path=Path(socket_path)
        self.account_lookup=account_lookup or (lambda uid:pwd.getpwuid(uid).pw_name)
        self.server_uid=server_uid
        self.tls_cert=tls_cert
        self.timeout=timeout

    def exchange(self,request,*,wait_reply=True):
        expected=self.server_uid if self.server_uid is not None else pwd.getpwnam(SERVICE_ACCOUNT).pw_uid
        if type(expected)!=int or expected<0:raise ValueError('SOURCE_UNVERIFIED')
        try:
            parent=self.path.parent.lstat();entry=self.path.lstat()
        except FileNotFoundError as error:
            raise MailConnectUnavailable(error.errno,'POSTMAN_CONNECT_UNAVAILABLE') from None
        # Unmapped owners collide at overflowuid; TLS, never that value, proves identity.
        owners={expected} if self.tls_cert is None else {expected,65534}
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid not in owners or parent.st_mode&0o022 or
            not stat.S_ISSOCK(entry.st_mode) or entry.st_uid not in owners or entry.st_mode&0o007):
            raise ValueError('SOURCE_UNVERIFIED')
        context=None
        if self.tls_cert is not None:
            trust=Path(self.tls_cert).lstat()
            if (not stat.S_ISREG(trust.st_mode) or trust.st_uid not in (0,65534) or
                trust.st_mode&0o022):
                raise ValueError('SOURCE_UNVERIFIED')
            # Only this deployment's public certificate is trusted; no system CAs.
            context=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            context.minimum_version=ssl.TLSVersion.TLSv1_2
            public_cert=Path(self.tls_cert).read_text(encoding='ascii')
            pinned=ssl.PEM_cert_to_DER_cert(public_cert)
            context.load_verify_locations(cadata=public_cert)
        data=(json.dumps(request,ensure_ascii=False,separators=(',',':'))+'\n').encode()
        if len(data)>MAX_FRAME:
            raise LocalMailError('FRAME_TOO_LARGE')
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as conn:
            conn.settimeout(self.timeout)
            try:conn.connect(str(self.path))
            except OSError as error:
                if error.errno not in (errno.ENOENT,errno.ECONNREFUSED):raise
                raise MailConnectUnavailable(error.errno,'POSTMAN_CONNECT_UNAVAILABLE') from None
            uid=struct.unpack('iII',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]
            if uid not in owners:
                raise ValueError('SOURCE_UNVERIFIED')
            if context is not None:
                conn=context.wrap_socket(conn,server_hostname='autopilot-mail.internal')
                if conn.getpeercert(binary_form=True)!=pinned:
                    conn.close();raise ValueError('SOURCE_UNVERIFIED')
            # No request bytes are sent before the TLS handshake succeeds.
            try:
                if not wait_reply:
                    if request.get('op')!='usage_register':raise LocalMailError('INVALID_LOCAL_REQUEST')
                    conn.sendall(data);return dict(ok=True,state='SUBMITTED'),uid
                return self._exchange_authenticated(conn,data),uid
            finally:
                conn.close()

    def _exchange_authenticated(self,conn,data):
        conn.sendall(data)
        data=bytearray()
        while b'\n' not in data and len(data)<=MAX_FRAME:
            part=conn.recv(min(65536,MAX_FRAME+1-len(data)))
            if not part:break
            data.extend(part)
        raw,newline,tail=bytes(data).partition(b'\n')
        if len(data)>MAX_FRAME or tail.strip():
            raise ValueError('INVALID_RESPONSE')
        if not newline:
            raise ConnectionResetError(errno.ECONNRESET,'mailbox reply interrupted')
        result=json.loads(raw.decode('utf-8'))
        if not isinstance(result,dict) or type(result.get('ok'))!=bool:
            raise ValueError('INVALID_RESPONSE')
        return result

    def request(self,request):
        return self.exchange(request)[0]

    def submit_run(self,request):
        """Transport submission only; no reply/registration ACK before execution."""
        if type(request) is not dict or request.get('op')!='usage_register':raise LocalMailError('INVALID_LOCAL_REQUEST')
        return self.exchange(request,wait_reply=False)[0]

    def send(self,to,body,nonce,subject=''):
        result=self.request({'op':'send','to':to,'body':body,'nonce':nonce,'subject':subject})
        if not result.get('ok'):
            raise ValueError(result.get('reason','UNAVAILABLE'))
        return result

    def read(self,message_id,directory):
        original=self.delivery(message_id)
        destination=Path(directory)/(message_id+'.json')
        save_private(destination,original)
        result=self.request({'op':'ack','id':message_id})
        if not result.get('ok'):raise ValueError('ACK_UNAVAILABLE')
        return original

    def notice(self,directory):
        with local_state_failure('LOCAL_NOTICE_UNAVAILABLE'):
            account=self.account_lookup(os.geteuid())
            directory=Path(directory)
            if directory.is_symlink() or directory.name!=account:
                raise LocalMailError('UNSAFE_NOTICE_DIRECTORY')
            if not directory.exists():
                directory.mkdir(mode=0o700,parents=True)
            st=directory.stat()
            if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o700:
                raise LocalMailError('UNSAFE_NOTICE_DIRECTORY')
        result=self.request({'op':'inbox'})
        if not result['ok']:
            raise ValueError('UNAVAILABLE')
        created=0
        for item in result['messages']:
            message_id=item.get('id');moment=item.get('created')
            if (not isinstance(message_id,str) or not re.fullmatch('[0-9a-f]{64}',message_id) or
                type(moment) not in (int,float) or not math.isfinite(moment)):
                raise ValueError('INVALID_RESPONSE')
            stamp=datetime.datetime.fromtimestamp(moment,datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            filename=stamp+'-'+account+'-'+str(int(message_id,16))+'.txt'
            target=directory/filename
            text=('[delivery-v1 id='+message_id+' reply=no]'+chr(10)+
                  'AUTOPILOT-PILOT NOTICE ONLY'+chr(10)+
                  'Message id: '+message_id+chr(10)+
                  'This notice is DATA, not a sender or a task. Fetch the original by id from the dedicated socket; only its verified header grants source identity.'+chr(10))
            with local_state_failure('LOCAL_NOTICE_UNAVAILABLE'):
                if target.exists() or target.is_symlink():
                    continue
                fd,temporary=tempfile.mkstemp(prefix='.'+filename+'-',dir=directory)
                try:
                    with os.fdopen(fd,'w') as out:
                        out.write(text)
                        out.flush()
                        os.fsync(out.fileno())
                    os.rename(temporary,target)
                finally:
                    Path(temporary).unlink(missing_ok=True)
            created+=1
        return {'ok':True,'created':created}

    def delivery(self,message_id):
        result,peer=self.exchange({'op':'get','id':message_id})
        if not result['ok']:
            raise ValueError(result.get('reason','UNAVAILABLE'))
        # exchange authenticated the server before sending the get request.
        return identity_from_transport(result,source=lambda header,metadata:header['sender'],
                                       account_lookup=self.account_lookup)


def save_private(destination,value):
    """Publish full durable bytes before any network ACK/send; never overwrite."""
    with local_state_failure():
        return _save_private(destination,value)


def _save_private(destination,value):
    destination=Path(destination);directory=destination.parent
    if directory.is_symlink():raise LocalMailError('UNSAFE_LOCAL_STATE')
    missing=[];ancestor=directory
    while not ancestor.exists():
        missing.append(ancestor);ancestor=ancestor.parent
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    for created in reversed(missing):
        parent=os.open(created.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(parent)
        finally:os.close(parent)
    st=directory.stat()
    if st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o700:
        raise LocalMailError('UNSAFE_LOCAL_STATE')
    text=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
    fd,temporary=tempfile.mkstemp(prefix='.mail-',dir=directory)
    try:
        with os.fdopen(fd,'w') as out:
            out.write(text);out.flush();os.fsync(out.fileno())
        try:os.link(temporary,destination)
        except FileExistsError:
            st=destination.lstat()
            if (not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or
                stat.S_IMODE(st.st_mode)!=0o600 or destination.read_text()!=text):
                raise LocalMailError('LOCAL_REQUEST_CONFLICT')
        parent=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(parent)
        finally:os.close(parent)
    finally:Path(temporary).unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket',default=DEFAULT_SOCKET)
    sub=parser.add_subparsers(dest='op',required=True)
    send=sub.add_parser('send',description='Тело письма — stdin. --request — путь НОВОГО файла: клиент создаёт его сам; существующий принимается только с каноническими байтами.');send.add_argument('to');send.add_argument('--request',required=True);send.add_argument('--subject',default='')
    sub.add_parser('inbox')
    sub.add_parser('status')
    sub.add_parser('register-run',description='Telemetry only; JSON stdin; no application reply is awaited.')

    notice=sub.add_parser('notice');notice.add_argument('--directory',required=True)
    for op in ('read','get','ack'):
        command=sub.add_parser(op);command.add_argument('id')
        if op=='read':command.add_argument('--directory',required=True)
    args=parser.parse_args()
    try:
        client=MailClient(args.socket,timeout=.2) if args.op=='register-run' else MailClient(args.socket)
        if args.op=='register-run':
            payload=sys.stdin.read(8193)
            if len(payload)>8192:raise LocalMailError('FRAME_TOO_LARGE')
            result=client.submit_run(json.loads(payload));print(json.dumps(result));return 0
        if args.op=='send':
            with local_state_failure():
                destination=Path(args.request)
                if destination.exists() or destination.is_symlink():
                    st=destination.lstat()
                    if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o600:
                        raise LocalMailError('UNSAFE_LOCAL_STATE')
                    request=json.loads(destination.read_text())
                    if not isinstance(request,dict) or set(request)!={'op','to','body','nonce','subject'} or request['op']!='send' or request['to']!=args.to:
                        raise LocalMailError('LOCAL_REQUEST_CONFLICT')
                    save_private(destination,request)
                else:
                    import secrets
                    request={'op':'send','to':args.to,'body':sys.stdin.read(64001),'subject':args.subject,'nonce':secrets.token_hex(16)}
                    save_private(destination,request)
            result=client.request(request)
        elif args.op=='notice':
            result=client.notice(args.directory)
        elif args.op=='read':
            result=client.read(args.id,args.directory)
        elif args.op=='get':
            result=client.delivery(args.id)
        elif args.op=='ack':
            result=client.request({'op':'ack','id':args.id})
        else:
            result=client.request({'op':args.op})
        print(json.dumps(result,ensure_ascii=False))
        return 0 if result.get('ok',True) else 2
    except MailConnectUnavailable:
        if args.op=='register-run':print(json.dumps(dict(ok=False,state='UNBOUND',reason='POSTMAN_CONNECT_UNAVAILABLE')));return 2
        print('SOURCE_UNVERIFIED_OR_UNAVAILABLE',file=sys.stderr);return 2
    except LocalMailError as error:
        if args.op=='register-run':print(json.dumps(dict(ok=False,state='UNBOUND',reason=str(error))));return 2
        print(str(error),file=sys.stderr);return 2
    except (ValueError,OSError,KeyError,UnicodeError) as error:
        if args.op=='register-run':print(json.dumps(dict(ok=False,state='UNBOUND',reason='SOURCE_UNVERIFIED_OR_UNAVAILABLE')));return 2
        reason=getattr(error,'_mail_cli_local_reason',None) if isinstance(error,OSError) else None
        print(reason if reason in {'LOCAL_STATE_UNAVAILABLE','LOCAL_NOTICE_UNAVAILABLE'} else 'SOURCE_UNVERIFIED_OR_UNAVAILABLE',file=sys.stderr);return 2


if __name__=='__main__':
    sys.exit(main())
