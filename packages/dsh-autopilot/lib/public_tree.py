"""Pilot Master panel permissions; OS account tools are confined with --root in fixtures."""
import os
from pathlib import Path
import stat
import subprocess

GROUP = 'autopilot-view'
OPERATOR = 'master'


def checked_directory(path, allowed_owners=(0,)):
    if not path.exists() and not path.is_symlink():
        return
    st = path.lstat()
    if stat.S_ISLNK(st.st_mode):
        raise ValueError('public/NSS directory symlink refused: ' + str(path))
    if not stat.S_ISDIR(st.st_mode) or st.st_uid not in allowed_owners or st.st_mode & 0o022:
        raise ValueError('unsafe public/NSS directory: ' + str(path))


def database(root):
    checked_directory(root / 'etc')
    names = [name + suffix for name in ('passwd', 'group', 'shadow', 'gshadow')
             for suffix in ('', '-', '+', '.lock')]
    for name in names + ['login.defs', '.pwd.lock']:
        path = root / 'etc' / name
        if path.exists() or path.is_symlink():
            st = path.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022 or st.st_nlink != 1:
                raise ValueError('unsafe NSS file: ' + str(path))
    if not (root / 'etc/passwd').is_file() or not (root / 'etc/group').is_file():
        raise ValueError('DESTDIR needs its own etc/passwd and etc/group')


def record(root, filename, key, columns):
    if root == Path('/'):
        r = subprocess.run(['/usr/bin/getent', filename, key], capture_output=True,
                           text=True, timeout=10)
        if r.returncode not in (0, 2):
            raise ValueError('getent failed for ' + key + ': rc ' + str(r.returncode))
        if r.returncode == 2 and r.stdout:
            raise ValueError('getent error returned unexpected data for ' + key)
        lines = r.stdout.splitlines()
    else:
        lines = [line for line in (root / 'etc' / filename).read_text().splitlines()
                 if line.split(':', 1)[0] == key]
    if not lines:
        return None
    if len(lines) != 1 or len(lines[0].split(':')) != columns or lines[0].split(':')[0] != key:
        raise ValueError('missing or ambiguous NSS record: ' + key)
    return lines[0].split(':')


def inspect(root):
    database(root)
    operator = record(root, 'passwd', OPERATOR, 7)
    if operator is None or int(operator[2]) <= 0:
        raise ValueError('non-root operator master account required')
    uid = int(operator[2])
    group = record(root, 'group', GROUP, 4)
    gid = int(group[2]) if group else None
    if gid is not None and gid <= 0:
        raise ValueError('autopilot-view cannot be privileged GID 0')
    member = bool(group and (OPERATOR in group[3].split(',') or int(operator[3]) == gid))
    if member:
        raise ValueError('master must not be a member of autopilot-view')
    dirs = [(root / 'srv', 0o755, 0, 0),
            (root / 'srv/autopilot', 0o755, 0, 0),
            (root / 'srv/autopilot/public', 0o2751, 0, gid),
            (root / 'srv/autopilot/public/master', 0o2750, uid, gid)]
    actions = []
    if group is None:
        actions.append('CREATE group autopilot-view (system)')
    for path, mode, owner, target_gid in dirs:
        checked_directory(path, (0, owner))
        if not path.exists():
            actions.append('CREATE ' + str(path))
        else:
            st = path.stat()
            if (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)) != (owner, target_gid, mode):
                if path == root / 'srv':
                    raise ValueError('shared parent permissions mismatch: ' + str(path))
                actions.append('REPAIR ' + str(path))
    return group, member, dirs, actions


def account_command(root, executable, *args):
    command = ['/usr/sbin/' + executable]
    if root != Path('/'):
        command += ['--root', str(root)]
    r = subprocess.run(command + list(args), capture_output=True, text=True, timeout=10)
    if r.returncode:
        raise ValueError(executable + ' refused: rc ' + str(r.returncode) + ' ' + r.stderr.strip())


def prepare(root):
    group, member, _, actions = inspect(root)
    if not actions:
        return
    for action in actions:
        print(action)
    if group is None:
        account_command(root, 'groupadd', '--system', GROUP)
    group, member, dirs, _ = inspect(root)
    if group is None:
        raise ValueError('group not applied')
    for path, mode, uid, gid in dirs:
        if path.exists():
            st = path.stat()
            if (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)) == (uid, gid, mode):
                continue
        path.mkdir(mode=0o700,exist_ok=True)
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            st = os.fstat(fd)
            if st.st_uid not in (0, uid) or st.st_mode & 0o022:
                raise ValueError('unsafe public directory changed during preparation: ' + str(path))
            os.fchown(fd, uid, gid)
            os.fchmod(fd, mode)
        finally:
            os.close(fd)
    if inspect(root)[3]:
        raise ValueError('public group/tree postcheck failed')
