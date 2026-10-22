"""Pure release overlay for Alpha's installer. Raw upstream entries stay unchanged."""
import hashlib
import json
from pathlib import Path, PurePosixPath

PACKAGE = Path(__file__).resolve().parents[1]


def release_entries(lock, source_entries):
    raw = (PACKAGE/'part-b-lock.json').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=lock.get('part_b_manifest_sha256'):
        raise ValueError('part B manifest checksum differs')
    spec = json.loads(raw)
    if lock.get('upstream_sha') != spec['upstream_sha']:
        raise ValueError('part B requires the pinned upstream SHA')
    if spec['local_suffix'].lstrip('-') not in str(lock.get('local_revision','')).split('-'):
        raise ValueError('part B needs a new immutable local_revision including its pinned B component')
    prefix = PurePosixPath('skills/autopilot')
    result = {PurePosixPath(*p.parts[2:]): entry for p,entry in source_entries.items()
              if p.parts[:2] == prefix.parts and len(p.parts)>2}
    for item in spec['files']:
        name = PurePosixPath(item['path']);file = PurePosixPath(item['source'])
        if name.is_absolute() or file.is_absolute() or '..' in name.parts or '..' in file.parts:
            raise ValueError('unsafe overlay path')
        before=result.get(name)
        if item['before_sha256'] is None:
            if before is not None: raise ValueError('overlay expected a new file: '+str(name))
        elif before is None or before[0]!='file' or hashlib.sha256(before[2]).hexdigest()!=item['before_sha256']:
            raise ValueError('overlay base differs: '+str(name))
        path=PACKAGE/file
        if path.is_symlink() or not path.is_file(): raise ValueError('overlay is not a regular file')
        content=path.read_bytes()
        if hashlib.sha256(content).hexdigest()!=item['sha256']: raise ValueError('overlay digest differs: '+str(name))
        result[name]=('file',item['mode'],content)
    return result


def overlay(lock, source_entries):
    """Alpha layout contract: full raw map in, full copied map out; source untouched."""
    result = dict(source_entries)
    prefix = PurePosixPath('skills/autopilot')
    for path, entry in release_entries(lock,source_entries).items():
        result[prefix / path] = entry
    return result
