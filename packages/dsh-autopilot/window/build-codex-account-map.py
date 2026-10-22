#!/usr/bin/python3
"""Root window provisioning only; stdout contains a digest map, never source identities."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
spec=importlib.util.spec_from_file_location('account_map',Path(__file__).resolve().parents[1]/'runtime/codex_account_map.py');maps=importlib.util.module_from_spec(spec);spec.loader.exec_module(maps)

def read_identity(path):
    fd=None
    try:
        path=Path(path)
        if path.resolve()!=path:raise ValueError('ACCOUNT_SOURCE_UNSAFE')
        for parent in path.parents:
            info=parent.lstat()
            if info.st_uid!=0 or not stat.S_ISDIR(info.st_mode) or info.st_mode&0o022:raise ValueError('ACCOUNT_SOURCE_UNSAFE')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);before=os.fstat(fd)
        if before.st_uid!=0 or not stat.S_ISREG(before.st_mode) or before.st_mode&0o022 or before.st_nlink!=1:raise ValueError('ACCOUNT_SOURCE_UNSAFE')
        if before.st_size>1048576:raise ValueError('ACCOUNT_SOURCE_INVALID')
        raw=os.read(fd,1048577)
        if len(raw)!=before.st_size or maps.identity(os.fstat(fd))!=maps.identity(before) or maps.identity(path.lstat())!=maps.identity(before):raise ValueError('ACCOUNT_SOURCE_CHANGED')
        try:value=json.loads(raw,object_pairs_hook=maps.pairs)
        except (ValueError,TypeError,UnicodeError,RecursionError):raise ValueError('ACCOUNT_SOURCE_INVALID') from None
        tokens=value.get('tokens') if type(value) is dict else None
        selected=tokens.get('account_id') if type(tokens) is dict else None
        if type(selected) is not str or not 0<len(selected)<=4096:raise ValueError('ACCOUNT_ID_UNAVAILABLE')
        return hashlib.sha256(selected.encode('utf-8')).hexdigest()
    except RuntimeError:raise ValueError('ACCOUNT_SOURCE_UNSAFE') from None
    except OSError:raise ValueError('ACCOUNT_SOURCE_UNAVAILABLE') from None
    finally:
        if fd is not None:os.close(fd)

def main(argv=None):
    try:
        if os.geteuid()!=0:raise ValueError('ACCOUNT_MAP_ROOT_REQUIRED')
        parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);parser.add_argument('--auth-root',default='/etc/claude-oauth');args=parser.parse_args(argv)
        root=Path(args.auth_root)
        if not root.is_absolute():raise ValueError('ACCOUNT_SOURCE_UNSAFE')
        accounts={}
        for number in (3,4):
            digest=read_identity(root/('codex-podpiska-'+str(number))/'auth.json')
            if digest in accounts:raise ValueError('ACCOUNT_MAP_AMBIGUOUS')
            accounts[digest]='codex-'+str(number)
        value=dict(schemaVersion=1,accounts=accounts);maps.validate_map(value);print(json.dumps(value,sort_keys=True));return 0
    except ValueError as error:
        reason=str(error) if str(error).isupper() and str(error).replace('_','').isalpha() else 'ACCOUNT_MAP_BUILD_FAILED'
        print(json.dumps(dict(error=reason)));return 2
if __name__=='__main__':raise SystemExit(main())
