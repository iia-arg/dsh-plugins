"""Local service credential: never print, export, rotate or execute its contents."""
import os
import stat
import tempfile


def paths(root):
    folder = root / 'etc/dsh-autopilot'
    return folder, folder / 'razdacha-klyuch'


def inspect(root):
    folder, key = paths(root)
    actions = []
    if folder.exists() or folder.is_symlink():
        st = folder.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
            raise ValueError('unsafe credential directory: ' + str(folder))
        if stat.S_IMODE(st.st_mode) != 0o700:
            actions.append('REPAIR private credential directory ' + str(folder))
    else:
        actions.append('CREATE private credential directory ' + str(folder))
    if not key.exists() and not key.is_symlink():
        actions.append('CREATE credential ' + str(key) + ' (root:root 0600)')
        return actions
    st = key.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_gid != 0 or \
            stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1:
        raise ValueError('unsafe credential file: ' + str(key))
    fd = os.open(key, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        value = stream.read(66)
        effective = value[:-1] if value.endswith(b'\n') else value
        if len(effective) != 64 or any(byte not in b'0123456789abcdef' for byte in effective):
            raise ValueError('credential must be exactly 64 lowercase hex digits with optional LF: ' + str(key))
    return actions


def prepare(root):
    actions = inspect(root)
    if not actions:
        return
    for action in actions:
        print(action)
    folder, key = paths(root)
    folder.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        if st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
            raise ValueError('credential directory changed: ' + str(folder))
        os.fchmod(fd, 0o700)
    finally:
        os.close(fd)
    # Recheck after securing the directory; retain any already-present valid key.
    if not inspect(root):
        return
    fd, temporary = tempfile.mkstemp(prefix='.credential-', dir=folder)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchown(stream.fileno(), 0, 0)
            os.fchmod(stream.fileno(), 0o600)
            stream.write(os.urandom(32).hex().encode('ascii') + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, key, follow_symlinks=False)
        except FileExistsError:
            inspect(root)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)
    if inspect(root):
        raise ValueError('credential preparation failed: ' + str(key))
