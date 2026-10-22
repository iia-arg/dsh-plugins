"""Read a root-issued digest-to-slot map. Runtime never opens credential stores."""
import json
import os
from pathlib import Path
import re
import stat

DEFAULT_MAP=Path('/var/lib/autopilot-usage/codex-account-map.json')
MAX_MAP_BYTES=65536
SLOTS=frozenset(('codex-3','codex-4'))
class AccountMapError(ValueError):pass

def pairs(items):
    out={}
    for key,value in items:
        if key in out:raise AccountMapError('ACCOUNT_MAP_INVALID')
        out[key]=value
    return out

def validate_map(value):
    if type(value) is not dict or set(value)!={'schemaVersion','accounts'} or type(value['schemaVersion']) is not int or value['schemaVersion']!=1:raise AccountMapError('ACCOUNT_MAP_INVALID')
    data=value['accounts']
    if type(data) is not dict or not 1<=len(data)<=len(SLOTS):raise AccountMapError('ACCOUNT_MAP_INVALID')
    if any(type(k) is not str or re.fullmatch('[0-9a-f]{64}',k) is None or type(v) is not str or v not in SLOTS for k,v in data.items()):raise AccountMapError('ACCOUNT_MAP_INVALID')
    if len(set(data.values()))!=len(data):raise AccountMapError('ACCOUNT_MAP_INVALID')
    return data

def identity(info):return (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns,info.st_uid,info.st_mode,info.st_nlink)

def load_map(path=DEFAULT_MAP,*,read_bytes=None):
    path=Path(path);fd=None
    try:
        if not path.is_absolute() or path.resolve()!=path:raise AccountMapError('ACCOUNT_MAP_UNSAFE')
        for parent in path.parents:
            info=parent.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise AccountMapError('ACCOUNT_MAP_UNSAFE')
        before=path.lstat()
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_nlink!=1 or stat.S_IMODE(before.st_mode)!=0o644:raise AccountMapError('ACCOUNT_MAP_UNSAFE')
        if before.st_size>MAX_MAP_BYTES:raise AccountMapError('ACCOUNT_MAP_INVALID')
        if read_bytes is not None:raw=read_bytes(path)
        else:
            fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            if identity(os.fstat(fd))!=identity(before):raise AccountMapError('ACCOUNT_MAP_CHANGED')
            raw=os.read(fd,MAX_MAP_BYTES+1)
            if identity(os.fstat(fd))!=identity(before):raise AccountMapError('ACCOUNT_MAP_CHANGED')
        if type(raw) is not bytes or len(raw)!=before.st_size or len(raw)>MAX_MAP_BYTES or identity(path.lstat())!=identity(before):raise AccountMapError('ACCOUNT_MAP_CHANGED')
        try:value=json.loads(raw,object_pairs_hook=pairs)
        except (ValueError,TypeError,UnicodeError,RecursionError):raise AccountMapError('ACCOUNT_MAP_INVALID') from None
        return validate_map(value)
    except RuntimeError:raise AccountMapError('ACCOUNT_MAP_UNSAFE') from None
    except FileNotFoundError:raise AccountMapError('ACCOUNT_MAP_UNAVAILABLE') from None
    except OSError:raise AccountMapError('ACCOUNT_MAP_UNAVAILABLE') from None
    finally:
        if fd is not None:os.close(fd)

def resolve(mapping,account_ref):
    if type(account_ref) is not str or re.fullmatch('[0-9a-f]{64}',account_ref) is None or account_ref not in mapping:raise AccountMapError('ACCOUNT_UNMAPPED')
    slot=mapping[account_ref]
    if type(slot) is not str or slot not in SLOTS:raise AccountMapError('ACCOUNT_MAP_INVALID')
    return slot
