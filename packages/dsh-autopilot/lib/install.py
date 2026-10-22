#!/usr/bin/env python3
"""Install pinned source and pilot public permissions; never execute Autopilot."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import public_tree
import credential
import pilot_layout

PACKAGE = Path(__file__).resolve().parents[1]


def source():
    lock = json.loads((PACKAGE / 'source-lock.json').read_text())
    if not re.fullmatch(r'[0-9a-f]{40}', lock['upstream_sha']):
        raise ValueError('invalid upstream SHA')
    if not re.fullmatch(r'[A-Za-z0-9._-]+', lock['local_revision']):
        raise ValueError('invalid local revision')
    archive = PurePosixPath(lock['archive'])
    if archive.is_absolute() or '..' in archive.parts:
        raise ValueError('invalid archive path')
    data = (PACKAGE / archive).read_bytes()
    if hashlib.sha256(data).hexdigest() != lock['archive_sha256']:
        raise ValueError('archive checksum mismatch')
    entries = {}
    with tarfile.open(PACKAGE / archive, 'r:gz') as tar:
        for member in tar:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or name.parts[0] != 'upstream':
                raise ValueError('unsafe archive member: ' + member.name)
            rel = PurePosixPath(*name.parts[1:])
            if rel.suffix.lower() in ('.pyc', '.pyo') or '__pycache__' in rel.parts:
                raise ValueError('bytecode archive member refused: ' + str(rel))
            if rel == PurePosixPath('.'):
                if not member.isdir():
                    raise ValueError('archive root is not a directory')
                continue
            if rel in entries:
                raise ValueError('duplicate archive member: ' + str(rel))
            if member.isdir():
                entry = ('dir', 0o755, None)
            elif member.isfile():
                entry = ('file', 0o755 if member.mode & 0o111 else 0o644,
                         tar.extractfile(member).read())
            elif member.issym():
                target = posixpath.normpath(posixpath.join(str(rel.parent), member.linkname))
                if member.linkname.startswith('/') or target == '..' or target.startswith('../'):
                    raise ValueError('unsafe archive symlink: ' + str(rel))
                entry = ('link', 0o777, member.linkname)
            else:
                raise ValueError('unsupported archive member: ' + str(rel))
            entries[rel] = entry
    for rel in entries:
        for parent in rel.parents:
            if parent != PurePosixPath('.') and entries.get(parent, (None,))[0] != 'dir':
                raise ValueError('archive parent is not a directory: ' + str(parent))
    if PurePosixPath('skills/autopilot/SKILL.md') not in entries:
        raise ValueError('archive lacks SKILL.md')
    return lock, entries


def layout(root, lock, entries):
    upstream = root / 'opt/autopilot/sources' / lock['upstream_sha']
    release = root / 'opt/autopilot/releases' / (lock['upstream_sha'] + '-' + lock['local_revision'])
    expected = {}
    guard = (PACKAGE / 'lib/runtime-guard.py').read_bytes()
    if hashlib.sha256(guard).hexdigest() != lock['runtime_guard_sha256']:
        raise ValueError('runtime guard checksum mismatch')

    def add(path, entry):
        for parent in path.parents:
            if parent == root:
                break
            expected.setdefault(parent, ('dir', 0o755, None))
        expected[path] = entry

    add(upstream, ('dir', 0o755, None))
    add(release / 'skill', ('dir', 0o755, None))
    sys.path.insert(0, str(PACKAGE / 'runtime'))
    from part_b_layout import overlay
    adapted = overlay(lock, dict(entries))
    for rel, entry in entries.items():
        add(upstream / rel, entry)
    for source_rel, entry in adapted.items():
        if (not isinstance(source_rel, PurePosixPath) or source_rel.is_absolute() or
                '..' in source_rel.parts or source_rel.suffix.lower() in ('.pyc', '.pyo') or
                '__pycache__' in source_rel.parts):
            raise ValueError('unsafe release overlay path')
        if source_rel.parts[:2] == ('skills', 'autopilot') and len(source_rel.parts) > 2:
            rel = PurePosixPath(*source_rel.parts[2:])
            release_entry = entry
            if str(rel) == 'tools/ap.py':
                shebang, body = entry[2].split(b'\n', 1)
                if shebang != b'#!/usr/bin/env python3':
                    raise ValueError('unexpected runtime shebang')
                stop = b'if cmd == "finish" or opt.get("stop"):'
                if body.count(stop) != 1:
                    raise ValueError('unexpected runtime stop dispatch')
                body = body.replace(stop,
                    b'if (cmd == "finish" or opt.get("stop")) and not opt.get("no-serve"):')
                pin = ('_DSH_RELEASE_SKILL = ' + repr(str(release / 'skill')) + '\n').encode()
                release_entry = (entry[0], 0o755, shebang + b'\n' + pin + guard +
                                 b'\n# DSH-AUTOPILOT-UPSTREAM-BEGIN\n' + body)
            elif str(rel) == 'tools/ap_sadik.py':
                role = guard.split(b"\nif __name__ == '__main__':\n", 1)[0]
                # The helper is also copied to project/.autopilot. Keep its
                # common accounting limit tied to this immutable release.
                limit_pin = ('_DSH_RELEASE_SKILL = ' + repr(str(release / 'skill')) + '\n').encode()
                release_entry = (entry[0], entry[1], role + b'\n' + limit_pin + entry[2])
            elif str(rel) == 'tools/run_catalog.py':
                anchor = b"BASE = Path('/var/lib/dsh-autopilot')"
                if entry[2].count(anchor) != 1: raise ValueError('catalogue root anchor differs')
                release_entry = (entry[0], entry[1], entry[2].replace(anchor,
                    ('BASE = Path(' + repr(str(root / 'var/lib/dsh-autopilot')) + ')').encode()))
            add(release / 'skill' / rel, release_entry)
    measure = entries[PurePosixPath('tools/measure-run.py')]
    shebang, body = measure[2].split(b'\n', 1)
    if shebang != b'#!/usr/bin/env python3':
        raise ValueError('unexpected measurement tool shebang')
    role = guard.split(b"\nif __name__ == '__main__':\n", 1)[0]
    args = b'''\nif __name__ == '__main__':
    import re as _dsh_measure_re
    if len(_dsh_sys.argv) not in (2, 3) or any(x.startswith('-') for x in _dsh_sys.argv[1:]):
        _dsh_refuse('measure-run requires project and optional session ID')
    if len(_dsh_sys.argv) == 3 and not _dsh_measure_re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', _dsh_sys.argv[2]):
        _dsh_refuse('invalid measurement session ID')
'''
    add(release / 'skill/tools/measure-run.py',
        ('file', 0o755, shebang + b'\n' + role + args + b'\n' + body))
    for name, mode in (('collect-team-usage.py', 0o755), ('export-runtime-source.py', 0o755), ('supply-team-usage-index.py', 0o755), ('measure-run-claude-root.py', 0o755), ('claude-root-origin.py', 0o644), ('measure-run-codex.py', 0o755), ('measure-run-claude.py', 0o755), ('build-run-manifest.py', 0o755), ('README-measure-run-codex.md', 0o644), ('README-usage-snapshot.md', 0o644)):
        add(release / 'tools' / name, ('file', mode, (PACKAGE / 'tools' / name).read_bytes()))
    # Independent postal worker survives AP current switches and legacy rollbacks.
    notice = (PACKAGE / 'tools/mail-notice-loop.py').read_bytes()
    add(root / 'opt/autopilot/notices' / hashlib.sha256(notice).hexdigest() / 'mail-notice-loop.py',
        ('file', 0o644, notice))
    add(release / 'tools/runtime_receipt_source.py', ('file', 0o644, (PACKAGE / 'runtime/runtime_receipt_source.py').read_bytes()))
    add(release / 'tools/time_usage.py', ('file', 0o644, (PACKAGE / 'runtime/time_usage.py').read_bytes()))
    add(release / 'tools/time_collection.py', ('file', 0o644, (PACKAGE / 'runtime/time_collection.py').read_bytes()))
    add(release / 'tools/runtime_incremental.py', ('file', 0o644, (PACKAGE / 'runtime/runtime_incremental.py').read_bytes()))
    add(release / 'tools/session_ownership.py', ('file', 0o644, (PACKAGE / 'runtime/session_ownership.py').read_bytes()))
    for name in ('raw_index.py','raw_decoder.py'):
        add(release/'tools'/name,('file',0o644,(PACKAGE/'runtime'/name).read_bytes()))
    add(release / 'tools/raw_supplier.py', ('file', 0o644, (PACKAGE / 'runtime/raw_supplier.py').read_bytes()))  # AP 0.1.10: supplier_module() loads it beside runtime_receipt_source
    add(release / 'tools/child_usage.py', ('file', 0o644, (PACKAGE / 'runtime/child_usage.py').read_bytes()))
    add(release / 'tools/child-source-versions.json', ('file', 0o644, (PACKAGE / 'runtime/child-source-versions.json').read_bytes()))
    add(release / 'tools/gateway_receipt_source.py', ('file', 0o644, (PACKAGE / 'runtime/gateway_receipt_source.py').read_bytes()))
    add(release / 'tools/usage_registration.py', ('file', 0o644, (PACKAGE / 'runtime/usage_registration.py').read_bytes()))
    add(release / 'tools/gateway_segments.py', ('file', 0o644, (PACKAGE / 'runtime/gateway_segments.py').read_bytes()))
    add(release / 'tools/codex_account_map.py', ('file', 0o644, (PACKAGE / 'runtime/codex_account_map.py').read_bytes()))
    add(release / 'tools/usage-reader-limits.json', ('file', 0o644, (PACKAGE / 'runtime/usage-reader-limits.json').read_bytes()))
    add(release / 'tools/mail_registration.py', ('file', 0o644, (PACKAGE / 'lib/mail_registration.py').read_bytes()))
    add(release / 'FORMAT-CONTRACT.md', ('file', 0o644, (PACKAGE / 'FORMAT-CONTRACT.md').read_bytes()))
    # Root inventory/window administration stays on the immutable package shelf,
    # beside lib/. The skill's run_catalog is runtime-only, installed by the overlay.
    contract = (PACKAGE / 'lib/pilot-main.json').read_bytes()
    if hashlib.sha256(contract).hexdigest() != lock['pilot_manifest_sha256']:
        raise ValueError('pilot MAIN contract checksum mismatch')
    for name, entry in pilot_layout.entries(lock).items():
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or rel.parts[0] != 'pilot':
            raise ValueError('unsafe pilot runtime path')
        if rel.name in ('pilot_mail.py', 'pilot_archive.py'):
            shebang, body = entry[2].split(b'\n', 1)
            if shebang != b'#!/usr/bin/env python3':
                raise ValueError('unexpected pilot shebang')
            prefix = role
            if rel.name == 'pilot_mail.py':
                if prefix.count(b".pw_name != 'master':") != 1:
                    raise ValueError("guard role anchor")
                prefix = prefix.replace(b".pw_name != 'master':", b".pw_name not in {'master', 'coders'}:")
            entry = ('file', 0o644, shebang + b'\n' + prefix + b'\n' + body)
        add(release / rel, entry)
    add(release / 'release.json', ('file', 0o644,
        (json.dumps(dict(lock, run_inventory_protocol=1), indent=2, sort_keys=True) + '\n').encode()))
    add(root / 'opt/autopilot/current', ('link', 0o777, 'releases/' + release.name))
    add(root / 'opt/agent-skills/autopilot', ('link', 0o777, '../autopilot/current/skill'))
    return expected, (upstream, release)


def same(path, entry):
    kind, mode, content = entry
    try:
        st = path.lstat()
    except FileNotFoundError:
        return False
    if st.st_uid != 0 or st.st_gid != 0 or stat.S_IMODE(st.st_mode) != mode:
        return False
    if kind == 'dir':
        return stat.S_ISDIR(st.st_mode)
    if kind == 'link':
        return stat.S_ISLNK(st.st_mode) and os.readlink(path) == content
    return stat.S_ISREG(st.st_mode) and path.read_bytes() == content


def plan(expected, managed):
    # Validate every path before writes. Never traverse a directory symlink.
    for path, entry in expected.items():
        if path.is_symlink() and entry[0] == 'dir':
            raise ValueError('directory symlink refused: ' + str(path))
        if path.exists() and not path.is_symlink():
            if path.is_dir() != (entry[0] == 'dir'):
                raise ValueError('wrong path type: ' + str(path))
            if entry[0] == 'dir':
                st = path.lstat()
                if st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
                    raise ValueError('unsafe directory owner/permissions: ' + str(path))
                owned = path.is_relative_to(managed[0].parent.parent) or path.is_relative_to(managed[1].parent.parent)
                if not owned and not same(path, entry):
                    raise ValueError('shared parent permissions mismatch: ' + str(path))
    for tree in managed:
        if tree.exists():
            for folder, dirs, files in os.walk(tree, followlinks=False):
                for name in dirs + files:
                    path = Path(folder) / name
                    if path not in expected:
                        raise ValueError('unmanaged file refused: ' + str(path))
    result = []
    for path in sorted(expected, key=lambda p: (len(p.parts), str(p))):
        if not same(path, expected[path]):
            action = 'REPAIR' if path.exists() or path.is_symlink() else 'CREATE'
            # A missing leaf inside an existing release/source is a repair.
            if any(path.is_relative_to(tree) and tree.exists() for tree in managed):
                action = 'REPAIR'
            result.append((action, path, expected[path]))
    return result


def apply(path, entry):
    kind, mode, content = entry
    if kind == 'dir':
        path.mkdir(mode=0o700,exist_ok=True)
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            st = os.fstat(fd)
            if st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
                raise ValueError('unsafe directory owner/permissions: ' + str(path))
            os.fchmod(fd, mode)
        finally:
            os.close(fd)
        return
    fd, temporary = tempfile.mkstemp(prefix='.install-', dir=path.parent)
    try:
        if kind == 'link':
            os.close(fd)
            os.unlink(temporary)
            os.symlink(content, temporary)
            os.lchown(temporary, 0, 0)
        else:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
                os.fchown(stream.fileno(), 0, 0)
                os.fchmod(stream.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--dry-run', action='store_true', help='print plan without writing')
    modes.add_argument('--check', action='store_true', help='read-only: 0 matches, 1 needs repair')
    modes.add_argument('--rollback', metavar='RELEASE', help='select an intact recorded prior core release')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('root required')
    root = Path(os.environ.get('DESTDIR', '/'))
    if not root.is_absolute() or '..' in root.parts:
        raise ValueError('DESTDIR must be an absolute directory')
    for parent in (root, *root.parents):
        if parent.is_symlink():
            raise ValueError('DESTDIR symlink refused: ' + str(parent))
    if not root.is_dir():
        raise ValueError('DESTDIR must exist')
    root = root.resolve()
    st = root.stat()
    if st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
        raise ValueError('unsafe directory owner/permissions: ' + str(root))
    if args.rollback is not None:
        from release_rollback import rollback
        return rollback(root, args.rollback)
    lock, entries = source()
    expected, managed = layout(root, lock, entries)
    changes = plan(expected, managed)
    public_changes = public_tree.inspect(root)[3]
    credential_changes = credential.inspect(root)
    if not changes and not public_changes and not credential_changes:
        print('UNCHANGED: pinned source, release and links match')
        return 0
    if args.dry_run or args.check:
        for action, path, _ in changes:
            print(action + ' ' + str(path))
        for action in public_changes:
            print(action)
        for action in credential_changes:
            print(action)
        return 1 if args.check else 0
    # Lock outside versioned trees; creating this file is part of first install.
    # The initial plan already checked these parent paths without following links.
    for path in (root / 'opt', root / 'opt/autopilot'):
        if not same(path, ('dir', 0o755, None)):
            apply(path, ('dir', 0o755, None))
    fd = os.open(root / 'opt/autopilot/.install.lock',
                 os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'r+') as mutex:
        st = os.fstat(mutex.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_nlink != 1:
            raise ValueError('unsafe installation lock')
        deadline = time.monotonic() + 10
        while True:
            try:
                fcntl.flock(mutex, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ValueError('installation lock busy after 10 seconds')
                time.sleep(0.1)
        # Another installer may have finished while this process waited.
        public_tree.prepare(root)
        credential.prepare(root)
        activation = [root / 'opt/autopilot/current', root / 'opt/agent-skills/autopilot']
        pending = plan(expected, managed)
        # Publish links only after every source/release file has been written.
        pending.sort(key=lambda item: (item[1] in activation,
                                      activation.index(item[1]) if item[1] in activation else 0))
        for action, path, entry in pending:
            print(action + ' ' + str(path))
            apply(path, entry)
        if plan(expected, managed):
            raise ValueError('post-install verification failed')
    print('INSTALLED ' + lock['upstream_sha'] + '-' + lock['local_revision'])
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, tarfile.TarError, subprocess.TimeoutExpired) as error:
        print('REFUSED: ' + str(error), file=sys.stderr)
        sys.exit(2)
