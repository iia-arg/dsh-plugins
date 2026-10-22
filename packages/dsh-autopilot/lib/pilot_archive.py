#!/usr/bin/env python3
"""Git archive at exact SHA, physically excluding control, memory and secrets."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
import pwd
from pathlib import Path, PurePosixPath
import re
import selectors
import shutil
import subprocess
import tarfile
import tempfile
import time


@contextmanager
def archive_stream(project, commit):
    """Spool at most 64 MiB; read one overflow byte, then kill/reap Git."""
    with tempfile.TemporaryFile() as data:
        process = subprocess.Popen(['git', '-c', 'core.bigFileThreshold=16m', '-C', str(project), 'archive', '--format=tar', commit],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            deadline, size = time.monotonic() + 30, 0
            with selectors.DefaultSelector() as ready:
                ready.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not ready.select(remaining):
                        raise TimeoutError('git archive exceeds 30 seconds')
                    chunk = os.read(process.stdout.fileno(), min(1024 * 1024, 64 * 1024 * 1024 + 1 - size))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > 64 * 1024 * 1024:
                        raise ValueError('archive exceeds 64 MiB')
                    data.write(chunk)
            if process.wait(timeout=max(0.001, deadline - time.monotonic())) != 0:
                raise ValueError('git archive failed')
            data.seek(0)
            yield data
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            process.stdout.close()


def acceptance_copy(project, commit, destination, memory='AGENTS.md'):
    project, destination = Path(project).resolve(strict=True), Path(destination)
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('exact commit SHA required')
    if not memory or PurePosixPath(memory).is_absolute() or '..' in PurePosixPath(memory).parts:
        raise ValueError('relative memory path required')
    if destination.exists() or destination.is_symlink() or destination.parent.is_symlink():
        raise ValueError('new physical destination required')
    destination = destination.parent.resolve() / destination.name
    if not destination.is_relative_to(project):
        raise ValueError('acceptance destination outside project')
    if destination.relative_to(project).parts[0] in ('.git', '.autopilot'): raise ValueError('acceptance destination in protected control directory')
    selected, excluded = [], []
    with archive_stream(project, commit) as data, tarfile.open(fileobj=data, mode='r:') as archive:
        names = set()
        for count, member in enumerate(archive, 1):
            if count > 10000:
                raise ValueError('archive exceeds 10000 members')
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or str(name) in names:
                raise ValueError('unsafe archive name')
            names.add(str(name))
            if str(name) == memory and member.isdir():
                raise ValueError('memory must name a file, not a directory')
            if name.parts[0] in ('.git', '.autopilot') or str(name) == memory or any(x in ('AGENTS.md', 'CLAUDE.md', 'SKILL.md') for x in name.parts) or any(
                    x == '.env' or (x.startswith('.env.') and x != '.env.example') for x in name.parts):
                excluded.append(str(name))
                continue
            if not (member.isdir() or member.isfile()):
                raise ValueError('non-regular acceptance object: '+str(name))
            selected.append((member, name))
        destination.mkdir(parents=True)
        try:
            for member, name in selected:
                target = destination.joinpath(*name.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output, length=1024 * 1024)
                    target.chmod(0o755 if member.mode & 0o111 else 0o644)
        except Exception:
            shutil.rmtree(destination)
            raise
    files = sorted(p for p in destination.rglob('*') if p.is_file())
    hashes = {}
    for path in files:
        with path.open('rb') as source:
            value = hashlib.sha256()
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                value.update(chunk)
            hashes[str(path.relative_to(destination))] = value.hexdigest()
    return {'commit': commit, 'files': hashes,
            'excluded': sorted(excluded), 'blindness': 'BLINDNESS_NOT_PROVEN'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--memory', required=True)
    args = parser.parse_args()
    if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != 'master':
        parser.error('acceptance preparation requires master; root runtime forbidden')
    try:
        print(json.dumps(acceptance_copy(args.project, args.commit, args.out, args.memory), ensure_ascii=False))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('BLOCKED: '+str(error))
        raise SystemExit(2)
