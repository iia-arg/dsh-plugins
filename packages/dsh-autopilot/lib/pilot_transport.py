"""Strict dedicated-service envelope; never a local/primary-mail file.

Only a source bound to the client's kernel-authenticated service socket is allowed.
No source or a legacy file/string => refusal. Recipient is its own Unix account.
"""
import hashlib
import json
import math
import os
import pwd
import re


def identity_from_transport(message, expected_sender=None, source=None, account_lookup=None):
    if not callable(source):
        raise ValueError('SOURCE_UNVERIFIED')
    if not isinstance(message,dict):
        raise ValueError('INVALID_HEADER')
    return socket_envelope(message,expected_sender,source,account_lookup)


def socket_envelope(message, expected_sender, source, account_lookup):
    """Strict new-service envelope; source comes from authenticated socket peer."""
    if set(message) != {'ok', 'header', 'body'} or message['ok'] is not True:
        raise ValueError('INVALID_HEADER')
    header=message['header']
    fields={'version','id','sender','sender_uid','recipient','recipient_uid','created_at','nonce','subject','request_sha'}
    if not isinstance(header,dict) or set(header)!=fields or type(header['version'])!=int or header['version']!=2:
        raise ValueError('INVALID_HEADER')
    if (not isinstance(header['id'],str) or not re.fullmatch('[0-9a-f]{64}',header['id']) or
        any(not isinstance(header[k],str) or not re.fullmatch('[a-z_][a-z0-9_-]{0,63}',header[k]) for k in ('sender','recipient')) or
        any(type(header[k])!=int or header[k]<=0 for k in ('sender_uid','recipient_uid')) or
        type(header['created_at']) not in (int,float) or not math.isfinite(header['created_at']) or
        not isinstance(header['nonce'],str) or not re.fullmatch('[A-Za-z0-9_-]{1,128}',header['nonce']) or
        not isinstance(header['subject'],str) or len(header['subject'])>200 or
        not isinstance(header['request_sha'],str) or not re.fullmatch('[0-9a-f]{64}',header['request_sha']) or
        not isinstance(message['body'],str) or not 0<len(message['body'])<=64000):
        raise ValueError('INVALID_HEADER')
    try:
        sender=source(dict(header),{'format':'autopilot-mail/2'})
        lookup=account_lookup or (lambda uid:pwd.getpwuid(uid).pw_name)
        receiver=lookup(os.geteuid())
        if not isinstance(sender,str) or sender!=header['sender'] or lookup(header['sender_uid'])!=sender:
            raise ValueError('SOURCE_UNVERIFIED')
    except Exception as error:
        raise ValueError('SOURCE_UNVERIFIED') from error
    if receiver!=header['recipient'] or os.geteuid()!=header['recipient_uid']:
        raise ValueError('WRONG_RECIPIENT')
    digest=hashlib.sha256(json.dumps([sender,header['nonce']],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    request_sha=hashlib.sha256(json.dumps([receiver,header['subject'],message['body']],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if digest!=header['id'] or request_sha!=header['request_sha']:
        raise ValueError('INVALID_HEADER')
    if expected_sender is not None and sender!=expected_sender:
        raise ValueError('SENDER_MISMATCH')
    return {'sender_account':sender,'receiver_account':receiver,'body':message['body'],
            'subject':header['subject'],'delivery_id':header['id'],'verification':'SO_PEERCRED-service-postman'}
