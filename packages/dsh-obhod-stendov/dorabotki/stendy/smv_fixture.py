"""B-N-2065: private SMV copy registry/config/state, with REAL admission/checker.

Four shell stends call this launcher; smv-atomic-probe imports prepare(). Only R
is rebound in a private tool copy. Foreign source Git is read as its owner.
No retries; Git operations have a 20s limit, installer 90s (outer stend: 120s).
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shlex
import stat
import subprocess
import sys

SOURCE = Path('/opt/iskra/workspace/dsh-plugins')


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          capture_output=True, text=True, timeout=20).stdout.strip()


def prepare(work, reader, ref, subdir, root, repo=SOURCE):
    work, reader, root, repo = map(Path, (work, reader, root, repo))
    for path in (work, root, repo):
        if not path.is_absolute() or path.resolve(strict=True) != path or not path.is_dir():
            raise ValueError('fixture path is not a canonical directory: '+str(path))
    if work.stat().st_uid != os.geteuid() or stat.S_IMODE(work.stat().st_mode) & 0o022:
        raise ValueError('fixture work is not private to its owner')
    relative = root.relative_to(work)
    if not relative.parts or relative.parts[0] in {'smv-fixture', 'okna', 'mont'}:
        raise ValueError('fixture target outside private target area')
    directory = work/'smv-fixture'
    if directory.exists() and (directory.is_symlink() or directory.stat().st_uid != os.geteuid()):
        raise ValueError('unsafe fixture metadata directory')
    directory.mkdir(mode=0o700, exist_ok=True)
    # Own source is already private (atomic probe). Otherwise clone through the
    # owner's upload-pack; never run Git in a foreign working tree as root.
    if not repo.is_relative_to(work):
        source = directory/'source.git'
        if not source.exists():
            owner = pwd.getpwuid(repo.stat().st_uid).pw_name
            upload = shlex.join(['/usr/bin/sudo', '-n', '-u', owner, '/usr/bin/git-upload-pack'])
            subprocess.run(['git', 'clone', '--bare', '--no-local', '--quiet',
                            '--upload-pack='+upload, str(repo), str(source)],
                           check=True, capture_output=True, timeout=20)
        repo = source
    commit = git(repo, 'rev-parse', '--verify', ref+'^{commit}')
    meta = json.loads(git(repo, 'show', commit+':'+subdir+'/package.json'))
    # Historical stends pin commits, while a later tag may describe another
    # package tree. Keep one coherent release tag IN OUR COPY, not in SOURCE.
    aliases = {subdir.split('/')[1], meta['name'], *meta.get('dsh', {}).get('prezhnie_imena', [])}
    tags = set(git(repo, 'for-each-ref', '--format=%(refname:strip=2)', 'refs/tags').splitlines())
    release_tags = {name+'-v'+meta['version'] for name in aliases}
    for tag in sorted(tags & release_tags):
        git(repo, 'tag', '-d', tag)
    fixture_tag = subdir.split('/')[1]+'-v'+meta['version']
    git(repo, 'tag', fixture_tag, commit)
    registry = directory/'registry.json'
    registry.write_text(json.dumps({'plugins': [{'id': 'smv-fixture-copy',
        'path': str(root), 'version': meta['version'],
        'installed_check': 'cat '+shlex.quote(str(root/'package.json'))}], 'services': []})+'\n')
    registry.chmod(0o644)
    exceptions = directory/'exceptions'
    exceptions.write_text('')
    exceptions.chmod(0o644)
    config = directory/'copy-config.json'
    config.write_text(json.dumps({'VYPUSK_REPO': str(repo), 'VYPUSK_REESTR': str(registry),
        'VYPUSK_SOOTVETSTVIYA': meta['name']+'='+str(root),
        'VYPUSK_ISKLYUCHENIYA': str(exceptions)})+'\n')
    config.chmod(0o644)  # mode stend deliberately runs with umask 002
    state = work/'okna'
    state.mkdir(mode=0o755, exist_ok=True)
    for record in state.glob('*.json'):
        record.unlink()
    original = reader.read_bytes()
    needle = b'R=/opt/iskra/workspace/dsh-plugins\n'
    if original.count(needle) != 1:
        raise ValueError('fixture cannot bind the source of this SMV')
    bound = original.replace(needle, ('R='+shlex.quote(str(repo))+'\n').encode())
    tool = directory/'tool-bound'
    tool.write_bytes(bound)
    (directory/'binding.json').write_text(json.dumps({'reader': str(reader),
        'source_sha256': hashlib.sha256(original).hexdigest(),
        'bound_sha256': hashlib.sha256(bound).hexdigest(), 'repo_binding_only': True,
        'repo': str(repo), 'commit': commit, 'target': str(root),
        'private_release_tag': fixture_tag, 'replaced_private_aliases': sorted(tags & release_tags)})+'\n')
    env = dict(os.environ, SMV_MONTAZH=str(work/'mont'), SMV_ZAMOK=str(work/'zamok'),
               MO_STATE_DIR=str(state), SMV_REESTR_PL=str(registry),
               MO_COPY_CONFIG=str(config), MO_DEREVO_REPO=str(repo),
               npm_config_cache=str(work/'npm-cache'), npm_config_update_notifier='false')
    return tool, env


def main():
    # WORK TOOL REF SUBDIR TARGET -- <unaltered installer arguments>
    if len(sys.argv) < 8 or sys.argv[6] != '--':
        raise ValueError('form: smv_fixture.py WORK TOOL REF SUBDIR TARGET -- SMV_ARGS')
    tool, env = prepare(*sys.argv[1:6])
    os.execvpe('timeout', ['timeout', '--kill-after=5s', '90s', 'bash', str(tool), *sys.argv[7:]], env)


if __name__ == '__main__':
    try:
        code = main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('СЛЕПОТА: SMV fixture: '+str(error), file=sys.stderr)
        code = 2
    sys.exit(code)
