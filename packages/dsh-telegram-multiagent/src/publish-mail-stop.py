#!/usr/bin/env python3
"""Publish bounded transport bytes once; never open a mailbox-supplied destination for writing."""
import ctypes,hashlib,os,re,secrets,stat,sys

def otkryt_yashchik(put,sozdat=False):
    # B-N-1615: ящик — проходом openat от «/» по звеньям, O_DIRECTORY|O_NOFOLLOW на КАЖДОМ (прежде — только на последнем:
    # промежуточное звено агентского дома можно было увести ссылкой). Звенья root (/, /opt) — без записи группе/прочим (sticky
    # допустим — /tmp стендов); первое не-root звено (/opt/<дом>) задаёт владельца, все глубже — только его. Нет ПОСЛЕДНЕГО
    # звена и sozdat — mkdir через дескриптор родителя, владелец родителя, 755 (прежде «mkdir -p … chown» по путям).
    chasti=put.split('/')[1:]
    if not put.startswith('/') or not chasti or any(c in ('','.','..') for c in chasti):raise ValueError('mailbox_path')
    fl=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
    fd=os.open('/',fl);st=os.fstat(fd);vlad=None
    try:
        if st.st_uid!=0 or (st.st_mode&0o022 and not st.st_mode&0o1000):raise ValueError('mailbox_link_untrusted')
        for i,c in enumerate(chasti):
            try:nfd=os.open(c,fl,dir_fd=fd)
            except FileNotFoundError:
                if not sozdat or i!=len(chasti)-1 or vlad is None:raise
                os.mkdir(c,0o755,dir_fd=fd);nfd=os.open(c,fl,dir_fd=fd)
                if os.geteuid()==0 and os.fstat(nfd).st_uid==0:os.fchown(nfd,st.st_uid,st.st_gid)
                os.fchmod(nfd,0o755)
            os.close(fd);fd=nfd;st=os.fstat(fd)
            if vlad is not None:
                if st.st_uid!=vlad:raise ValueError('mailbox_link_untrusted')
            elif st.st_uid!=0:vlad=st.st_uid
            elif st.st_mode&0o022 and not st.st_mode&0o1000:raise ValueError('mailbox_link_untrusted')
        if vlad is None:raise ValueError('mailbox_link_untrusted')
        return fd
    except BaseException:
        os.close(fd);raise

def publish(directory,source,leaf,expected):
    if not os.path.isabs(directory) or not re.fullmatch(r'stop-[a-f0-9-]{36}\.txt',leaf) or source!='/tmp/signed-'+leaf or not re.fullmatch(r'[a-f0-9]{64}',expected):
        raise ValueError('invalid publication arguments')
    read_flags=os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK
    fd=os.open(source,read_flags)
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size>98304:raise ValueError('untrusted upload')
        raw=os.read(fd,98305)
        if len(raw)>98304 or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('upload bytes mismatch')
    finally:os.close(fd)
    dfd=otkryt_yashchik(directory)
    tmp=None;tfd=None;wirefd=None
    try:
        owner=os.fstat(dfd)
        # B-N-1615: временный каталог — через дескриптор ящика, а не mkdtemp(dir=путь): путь заново прошёл бы все звенья.
        name='.mail-stop-'+secrets.token_hex(8);os.mkdir(name,0o700,dir_fd=dfd);tmp=name
        tfd=os.open(tmp,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=dfd)
        private=os.fstat(tfd)
        if private.st_uid!=os.geteuid() or private.st_mode&0o077:raise ValueError('temporary directory changed')
        wirefd=os.open('wire',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=tfd)
        view=memoryview(raw)
        while view:view=view[os.write(wirefd,view):]
        if os.geteuid()==0:os.fchown(wirefd,owner.st_uid,owner.st_gid)
        os.fchmod(wirefd,0o644);os.fsync(wirefd)
        # Atomic no-replace rename preserves a single stable publication object.
        libc=ctypes.CDLL(None,use_errno=True)
        rename=libc.renameat2
        rename.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
        rename.restype=ctypes.c_int
        if rename(tfd,b'wire',dfd,os.fsencode(leaf),1)!=0:raise OSError(ctypes.get_errno(),'publication refused')
        final=os.stat(leaf,dir_fd=dfd,follow_symlinks=False);written=os.fstat(wirefd)
        if not stat.S_ISREG(final.st_mode) or (final.st_dev,final.st_ino)!=(written.st_dev,written.st_ino):raise ValueError('publication changed')
        os.fsync(dfd)
        current=os.stat(source,follow_symlinks=False)
        if (current.st_dev,current.st_ino)==(st.st_dev,st.st_ino):os.unlink(source)
        print('положено: '+os.path.join(directory,leaf))
    finally:
        if wirefd is not None:os.close(wirefd)
        if tfd is not None:
            try:os.unlink('wire',dir_fd=tfd)
            except OSError:pass
            os.close(tfd)
        if tmp is not None:
            try:os.rmdir(tmp,dir_fd=dfd)
            except OSError:pass
        os.close(dfd)

if __name__=='__main__':
    try:
        if len(sys.argv)!=5:raise ValueError('expected four publication arguments')
        publish(*sys.argv[1:])
    except (OSError,ValueError,AttributeError):
        print('ОТКАЗ/UNKNOWN публикации; повтор автоматически запрещён',file=sys.stderr)
        sys.exit(2)
