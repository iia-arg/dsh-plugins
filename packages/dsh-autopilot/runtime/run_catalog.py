"""Shared AP run pins. Missing trust/coverage is a refusal, never zero runs.

The root-owned bootstrap binds a complete accepted owner-census on all local FS.
Future guarded runtime events and rollback hold the SAME root-owned flock.
Legacy runtimes do not implement this protocol; they need a separately accepted
compatibility/admission policy before a production selector may choose them.
"""
from contextlib import AbstractContextManager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import tempfile
import time
import uuid

BASE = Path('/var/lib/dsh-autopilot')
PRODUCTION_STORE = Path('/var/lib/dsh-autopilot')
OWNER_SCOPE = 'master-owner-or-release-pin/all-visible-local-mounts'
RELEASE = re.compile(r'[0-9a-f]{40}-[A-Za-z0-9][A-Za-z0-9._-]{0,100}\Z')

import importlib.util as _limits_import
_limits_here = Path(__file__).resolve().parent
_limits_path = (_limits_here.parent / 'lib/task_limits.py' if _limits_here.name == 'runtime' else _limits_here.parents[1] / 'pilot/task_limits.py')
_limits_spec = _limits_import.spec_from_file_location('_ap_usage_limits', _limits_path)
_usage_limits = _limits_import.module_from_spec(_limits_spec)
_limits_spec.loader.exec_module(_usage_limits)
USAGE_BYTE_LIMIT = _usage_limits.USAGE_BYTE_LIMIT
LIMIT = USAGE_BYTE_LIMIT


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def physical(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or str(path.resolve()) != str(path):
        raise ValueError('RUN_INVENTORY_UNPROVEN: nonphysical path ' + str(path))
    return path


def read_file(path, *, uid=None, mode=None):
    path = physical(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > LIMIT
                or before.st_mode & 0o002 or (uid is not None and before.st_uid != uid)
                or (mode is not None and stat.S_IMODE(before.st_mode) != mode)):
            raise ValueError('RUN_INVENTORY_UNPROVEN: unsafe file ' + str(path))
        data = bytearray()
        while chunk := os.read(fd, min(65536, LIMIT + 1 - len(data))):
            data.extend(chunk)
            if len(data) > LIMIT:
                raise ValueError('RUN_INVENTORY_UNPROVEN: oversize file ' + str(path))
        identity = lambda s: (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        if identity(before) != identity(os.fstat(fd)) or identity(before) != identity(path.lstat()):
            raise ValueError('RUN_INVENTORY_UNPROVEN: file changed ' + str(path))
        return bytes(data)
    finally:
        os.close(fd)


def unjson(raw):
    def unique(pairs):
        result = {}
        for k,v in pairs:
            if k in result: raise ValueError('duplicate JSON key ' + k)
            result[k] = v
        return result
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)


def atomic(path, value, mode, owner=None):
    raw = value if isinstance(value, bytes) else (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()
    if len(raw) > LIMIT: raise ValueError('RUN_INVENTORY_UNPROVEN: oversized catalogue')
    fd, temp = tempfile.mkstemp(prefix='.catalog-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            os.fchmod(stream.fileno(),mode)
            if owner is not None: os.fchown(stream.fileno(),*owner)
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(temp,path)
        sync_dir(path.parent)
    finally:
        if os.path.lexists(temp): os.unlink(temp)


def run_binding(meta):
    if (not isinstance(meta,dict) or not isinstance(meta.get('run_id'),str)
            or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',meta['run_id'])):
        raise ValueError('RUN_INVENTORY_UNPROVEN: invalid run binding')
    project = str(physical(meta['root']))
    pin = meta['release']
    release = pin['upstream_sha'] + '-' + pin['local_revision']
    if not RELEASE.fullmatch(release) or Path(pin['skill_dir']).parts[-2:] != (release,'skill'):
        raise ValueError('RUN_INVENTORY_UNPROVEN: invalid release binding')
    return meta['run_id'],project,release


def inventory_module():
    import sys
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
    import accepted_inventory
    return accepted_inventory


def scan_legacy(root, *, timeout=60):
    """Whole owner scope; roots come from complete mount discovery/fixture contract."""
    if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
    return inventory_module().capture(physical(root),timeout=timeout)


def _root_dir(path, mode=0o755):
    if not path.exists():
        _root_dir(path.parent)
        path.mkdir(mode=mode)
        path.chmod(mode)  # Newly created root parents must not inherit root's umask.
    physical(path)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('RUN_INVENTORY_UNPROVEN: unsafe root directory '+str(path))


def _lock(base, timeout=3):
    physical(base)
    info = base.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('RUN_INVENTORY_UNPROVEN: unsafe catalogue parent')
    path = base/'run.lock'
    fd = os.open(path,os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd);master = pwd.getpwnam('master')
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != master.pw_gid
                or stat.S_IMODE(info.st_mode) != 0o660 or info.st_nlink != 1):
            raise ValueError('RUN_INVENTORY_UNPROVEN: unsafe shared lock')
        deadline = time.monotonic()+min(3,timeout)
        while True:
            try: fcntl.flock(fd,fcntl.LOCK_EX | fcntl.LOCK_NB);return fd
            except BlockingIOError:
                if time.monotonic() >= deadline: raise ValueError('RUN_CATALOG_BUSY')
                time.sleep(.025)
    except BaseException:
        os.close(fd);raise


def _verify_archive(folder,catalog_id):
    values={name:unjson(read_file(folder/name,uid=0,mode=0o600))
            for name in ('bootstrap.json','catalog.json','applicability.json')}
    raw=read_file(folder/'legacy.json',uid=0,mode=0o600)
    if (any(value.get('catalogId')!=catalog_id for value in values.values())
            or any(value.get('legacySha256')!=sha(raw) for value in values.values())):
        raise ValueError('RUN_INVENTORY_UNPROVEN: previous generation archive incomplete or inconsistent')


def scope_binding(base,root):
    base=physical(base);root=physical(root)
    if (base==PRODUCTION_STORE and root!=Path('/')) or not base.is_relative_to(root):
        raise ValueError('RUN_INVENTORY_UNPROVEN: catalogue deployment scope mismatch')
    return root


def bootstrap(base, root, report_path, accepted_sha, *, window_id=None):
    """Root primitive; public callers attest the physical window separately.

    Replacement after a legacy selection needs a NEW externally accepted report.
    Readiness is published LAST; any interrupted replacement stays inapplicable.
    """
    if os.geteuid() != 0: raise ValueError('ROOT_REQUIRED')
    raw = read_file(report_path)
    if not re.fullmatch(r'[0-9a-f]{64}',accepted_sha) or sha(raw) != accepted_sha:
        raise ValueError('LEGACY_REPORT_SHA_MISMATCH')
    report = unjson(raw)
    root=scope_binding(base,root);I=inventory_module();I.accepted_scope(report,root)
    base = Path(base);_root_dir(base)
    master = pwd.getpwnam('master')
    try:
        fd = os.open(base/'run.lock',os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,0o660)
    except FileExistsError: pass
    else:
        try: os.fchown(fd,0,master.pw_gid);os.fchmod(fd,0o660);os.fsync(fd)
        finally: os.close(fd)
        sync_dir(base)
    fd = _lock(base)
    try:
        existing = any(os.path.lexists(base/name) for name in ('bootstrap.json','legacy.json','runs'))
        previous = None
        retained_runtime = {}
        if existing:
            previous = unjson(read_file(base/'applicability.json',uid=0,mode=0o644))
            # An applicable generation may also need a new window-bound census
            # before selecting legacy. The public caller must supply that window.
            if not window_id:
                raise ValueError('CATALOG_ALREADY_BOOTSTRAPPED')
            if accepted_sha == previous.get('legacySha256'):
                raise ValueError('LEGACY_REPORT_NOT_FRESH: accepted SHA already consumed')
            if previous.get('invalidatedAt'):
                def timestamp(value):
                    parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
                    if parsed.tzinfo is None: raise ValueError('LEGACY_REPORT_NOT_FRESH: timezone missing')
                    return parsed
                if timestamp(report['scannedAt']) <= timestamp(previous['invalidatedAt']):
                    raise ValueError('LEGACY_REPORT_NOT_FRESH: census predates invalidation')
        fresh=I.verify_fresh(report,root)
        owner_rows=I.active_rows(fresh)
        if existing:
            # Invalid BEFORE any old generation bytes are replaced. Root receipts
            # remain authoritative if a later file write fails or the job dies.
            unavailable=dict(previous,status='inapplicable',reason='bootstrap-in-progress')
            atomic(base/'applicability.json',unavailable,0o644,(0,0))
            archive=base/'previous-generations';_root_dir(archive,0o700)
            generation=archive/previous['catalogId']
            if not generation.exists():
                # Publish the archive directory only after every old file is
                # durable. A killed partial archive is never mistaken for ready.
                staging=Path(tempfile.mkdtemp(prefix='.preparing-',dir=archive))
                try:
                    for name in ('bootstrap.json','legacy.json'):
                        atomic(staging/name,read_file(base/name,uid=0),0o600,(0,0))
                    atomic(staging/'catalog.json',read_file(base/'runs/catalog.json',uid=master.pw_uid),0o600,(0,0))
                    atomic(staging/'applicability.json',previous,0o600,(0,0))
                    _verify_archive(staging,previous['catalogId'])
                    sync_dir(staging);os.rename(staging,generation);sync_dir(archive)
                finally:
                    if staging.exists():
                        for file in staging.iterdir():file.unlink()
                        staging.rmdir()
            _verify_archive(generation,previous['catalogId'])
            old_data=unjson(read_file(generation/'catalog.json',uid=0,mode=0o600))
            # HOME census cannot prove completion of guarded runs outside HOME.
            # Never lose their event-backed pins on generation replacement.
            live_data=unjson(read_file(base/'runs/catalog.json',uid=master.pw_uid,mode=0o640))
            live_stamp=unjson(read_file(base/'bootstrap.json',uid=0,mode=0o644))
            if live_data.get('catalogId') not in {previous['catalogId'],live_stamp.get('catalogId')}:
                raise ValueError('RUN_INVENTORY_UNPROVEN: interrupted generation has no root binding')
            for source in (old_data,live_data):
                if not isinstance(source.get('runs'),dict):raise ValueError('RUN_INVENTORY_UNPROVEN: malformed retained pins')
                for key,row in source['runs'].items():
                    if not isinstance(row,dict) or set(row)!={'project','release','status','origin'}:
                        raise ValueError('RUN_INVENTORY_UNPROVEN: malformed retained pin')
                    if row['origin'] not in ('runtime','legacy'):
                        raise ValueError('RUN_INVENTORY_UNPROVEN: unknown retained pin origin')
                    # Validate with the same lexical policy as catalogue load.
                    if (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',key)
                            or row['status'] not in ('pending','active') or not isinstance(row['release'],str) or not RELEASE.fullmatch(row['release'])
                            or not isinstance(row['project'],str) or not row['project'].startswith('/')
                            or '\x00' in row['project'] or os.path.normpath(row['project'])!=row['project']):
                        raise ValueError('RUN_INVENTORY_UNPROVEN: malformed retained runtime pin')
                    if row['origin']!='runtime':continue
                    if key in retained_runtime and any(retained_runtime[key][field]!=row[field] for field in ('project','release')):
                        raise ValueError('RUN_INVENTORY_UNPROVEN: retained runtime bindings conflict')
                    retained_runtime[key]=row
        else:
            folder=base/'runs';folder.mkdir(mode=0o770);os.chown(folder,0,master.pw_gid);folder.chmod(0o770)
        stamp = dict(schemaVersion=1,catalogId=uuid.uuid4().hex,legacySha256=accepted_sha,
                     scope=report['scope'],scopeRoots=fresh['scopeRoots'],scopeRoot=str(root),catalogueBase=str(base),operatorUid=master.pw_uid,bootstrappedAt=now(),windowId=window_id,
                     coverage='guarded_origins')
        data = dict(schemaVersion=1,catalogId=stamp['catalogId'],legacySha256=accepted_sha,revision=0,runs=owner_rows)
        for key,row in retained_runtime.items():
            if key in data['runs'] and any(data['runs'][key][field]!=row[field] for field in ('project','release')):
                raise ValueError('RUN_INVENTORY_UNPROVEN: retained runtime pin conflicts with census')
            data['runs'][key]=row
        projects=[row['project'] for row in data['runs'].values()]
        if len(projects)!=len(set(projects)):
            raise ValueError('RUN_INVENTORY_UNPROVEN: retained runtime projects conflict')
        atomic(base/'legacy.json',raw,0o444,(0,0))
        atomic(base/'runs/catalog.json',data,0o640,(master.pw_uid,master.pw_gid))
        atomic(base/'bootstrap.json',stamp,0o644,(0,0))
        status=dict(schemaVersion=1,status='applicable',catalogId=stamp['catalogId'],
                    legacySha256=accepted_sha,coverage='guarded_origins',invalidatedAt=None,
                    reason=None,selectedRuntime=None,windowId=window_id)
        atomic(base/'applicability.json',status,0o644,(0,0))  # readiness LAST
        return stamp
    finally: os.close(fd)


class Catalog(AbstractContextManager):
    def __init__(self,base=BASE,*,timeout=3):
        self.base = Path(base);self.timeout=timeout;self.fd=None

    def __enter__(self):
        master = pwd.getpwnam('master')
        if os.geteuid() not in (0,master.pw_uid): raise ValueError('OPERATOR_MASTER_REQUIRED')
        try:
            self.fd = _lock(self.base,self.timeout)
            status=unjson(read_file(self.base/'applicability.json',uid=0,mode=0o644))
            if not isinstance(status,dict) or status.get('status') != 'applicable':
                raise ValueError('catalogue explicitly inapplicable; fresh accepted bootstrap required')
            stamp = unjson(read_file(self.base/'bootstrap.json',uid=0,mode=0o644))
            self.stamp=stamp
            if status.get('catalogId') != stamp.get('catalogId') or status.get('legacySha256') != stamp.get('legacySha256'):
                raise ValueError('applicability generation differs')
            legacy = read_file(self.base/'legacy.json',uid=0,mode=0o444)
            doc=unjson(legacy)
            deployment=scope_binding(self.base,Path(stamp.get('scopeRoot','INVALID')))
            if stamp.get('catalogueBase')!=str(self.base) or (deployment==Path('/') and doc.get('fixtureRoot') is not None) or (deployment!=Path('/') and doc.get('fixtureRoot')!=str(deployment)):
                raise ValueError('inventory scope unproven: production/fixture binding differs')
            roots=doc.get('scopeRoots')
            if (doc.get('schemaVersion')!=2 or doc.get('scope')!=OWNER_SCOPE or doc.get('complete') is not True or doc.get('errors')!=[] or not isinstance(roots,list) or not roots or roots!=stamp.get('scopeRoots')):
                raise ValueError('inventory scope unproven; full owner census required')
            if (stamp.get('schemaVersion') != 1 or stamp.get('operatorUid') != master.pw_uid
                    or stamp.get('legacySha256') != sha(legacy)
                    or unjson(legacy).get('scope') != stamp.get('scope')):
                raise ValueError('bootstrap binding differs')
            folder = self.base/'runs';physical(folder);info=folder.lstat()
            if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != master.pw_gid
                    or stat.S_IMODE(info.st_mode) != 0o770): raise ValueError('unsafe runs directory')
            self.data = unjson(read_file(folder/'catalog.json',uid=master.pw_uid,mode=0o640))
            data = self.data
            if (set(data) != {'schemaVersion','catalogId','legacySha256','revision','runs'}
                    or data['schemaVersion'] != 1 or data['catalogId'] != stamp['catalogId']
                    or data['legacySha256'] != stamp['legacySha256'] or type(data['revision']) is not int
                    or data['revision'] < 0 or not isinstance(data['runs'],dict)):
                raise ValueError('catalogue schema/binding differs')
            projects = []
            for run,row in data['runs'].items():
                if (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}',run) or not isinstance(row,dict)
                        or set(row) != {'project','release','status','origin'}
                        or row['status'] not in ('pending','active') or row['origin'] not in ('legacy','runtime')
                        or not isinstance(row['release'],str) or not RELEASE.fullmatch(row['release'])
                        or not isinstance(row['project'],str) or not row['project'].startswith('/')
                        or '\x00' in row['project'] or os.path.normpath(row['project']) != row['project']):
                    raise ValueError('invalid catalogue row '+run)
                projects.append(row['project'])
            if len(projects) != len(set(projects)): raise ValueError('duplicate active project')
            return self
        except (OSError,ValueError,KeyError,TypeError) as exc:
            self.__exit__(None,None,None)
            raise ValueError('RUN_INVENTORY_UNPROVEN: '+str(exc)) from exc

    def __exit__(self,*_):
        if self.fd is not None: os.close(self.fd);self.fd=None

    def save(self):
        self.data['revision'] += 1
        owner=pwd.getpwnam('master')
        atomic(self.base/'runs/catalog.json',self.data,0o640,
               (owner.pw_uid,owner.pw_gid) if os.geteuid()==0 else None)

    def pin(self,meta):
        run,project,release = run_binding(meta)
        rows=self.data['runs']
        if any(row['project']==project and key != run for key,row in rows.items()):
            raise ValueError('PROJECT_ACTIVE: explicit finish/abandon required')
        expected=dict(project=project,release=release,status='pending',origin='runtime')
        if run in rows:
            if any(rows[run][key] != expected[key] for key in ('project','release')):
                raise ValueError('RUN_BINDING_CONFLICT')
            return
        rows[run]=expected;self.save()

    def started(self,meta):
        run,project,release = run_binding(meta)
        row=self.data['runs'].get(run)
        if row is None or row['project'] != project or row['release'] != release:
            raise ValueError('RUN_BINDING_MISSING')
        if row['status'] != 'active': row['status']='active';self.save()

    def finished(self,meta):
        run,project,release = run_binding(meta)
        row=self.data['runs'].get(run)
        if row is None: return
        if row['project'] != project or row['release'] != release: raise ValueError('RUN_BINDING_CONFLICT')
        del self.data['runs'][run];self.save()

    def invalidate(self,selected,window_id,*,selected_already=False):
        if os.geteuid()!=0: raise ValueError('ROOT_REQUIRED')
        if not RELEASE.fullmatch(selected) or not isinstance(window_id,str) or not window_id:
            raise ValueError('LEGACY_WINDOW_REQUIRED')
        status=dict(schemaVersion=1,status='inapplicable',catalogId=self.data['catalogId'],
                    legacySha256=self.data['legacySha256'],coverage='guarded_origins',
                    invalidatedAt=now(),reason='legacy-selected' if selected_already else 'legacy-selection-pending',
                    selectedRuntime=selected,windowId=window_id)
        atomic(self.base/'applicability.json',status,0o644,(0,0))
        return status

    def pending_for(self,project):
        rows=[dict(runId=run,**row) for run,row in self.data['runs'].items()
              if row['project']==project and row['status']=='pending' and row['origin']=='runtime']
        return rows[0] if rows else None

    def clear_pending(self,pending):
        run=pending['runId']
        actual=self.data['runs'].get(run)
        if (actual != {k:v for k,v in pending.items() if k!='runId'} or
                actual['status'] != 'pending' or actual['origin'] != 'runtime'):
            raise ValueError('PENDING_BINDING_CONFLICT')
        del self.data['runs'][run];self.save()

    def assert_no_live_pins(self,release):
        matches=[dict(runId=key,**row) for key,row in self.data['runs'].items() if row['release']==release]
        if matches: raise ValueError('LIVE_RUN_PINNED: '+json.dumps(matches,ensure_ascii=False,sort_keys=True))
        return dict(source='root-accepted-legacy-plus-guarded-runtime-catalogue',
                    catalogId=self.data['catalogId'],revision=self.data['revision'],coverage='guarded_origins',
                    legacySha256=self.data['legacySha256'],catalogRuns=len(self.data['runs']),activeRuns=0)
