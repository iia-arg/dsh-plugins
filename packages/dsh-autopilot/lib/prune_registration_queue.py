"""One bounded AP010 window cleanup, as the existing postal SQLite owner."""
from pathlib import Path
import fcntl
import json
import os
import pwd
import sqlite3
import stat
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mail_registration import prune_terminal
from mail_service import SERVICE_ACCOUNT,STATE_PATH

def main(argv=None):
    lock=None;db=None
    try:
        if (sys.argv[1:] if argv is None else argv):raise ValueError('REGISTRATION_PRUNE_ARGUMENTS')
        uid=pwd.getpwnam(SERVICE_ACCOUNT).pw_uid
        if os.geteuid()!=uid or uid==0:raise ValueError('REGISTRATION_PRUNE_ROLE_DENIED')
        state=Path(STATE_PATH);info=state.lstat()
        if state.resolve()!=state or not stat.S_ISDIR(info.st_mode) or info.st_uid!=uid or stat.S_IMODE(info.st_mode)!=0o700:raise ValueError('REGISTRATION_PRUNE_UNSAFE')
        path=state/'mail.sqlite';info=path.lstat()
        if path.resolve()!=path or not stat.S_ISREG(info.st_mode) or info.st_uid!=uid or info.st_nlink!=1 or stat.S_IMODE(info.st_mode)!=0o600:raise ValueError('REGISTRATION_PRUNE_UNSAFE')
        lock=os.open(state/'postman.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600);info=os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=uid or info.st_nlink!=1 or stat.S_IMODE(info.st_mode)!=0o600:raise ValueError('REGISTRATION_PRUNE_UNSAFE')
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('REGISTRATION_PRUNE_BUSY') from None
        db=sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=3);db.row_factory=sqlite3.Row
        with db:
            db.execute('BEGIN IMMEDIATE');deleted=prune_terminal(db);remaining=db.execute('SELECT COUNT(*) FROM usage_registrations').fetchone()[0]
        print(json.dumps(dict(deleted=deleted,deletedCount=len(deleted),remaining=remaining)));return 0
    except (OSError,ValueError,KeyError,sqlite3.Error) as error:
        reason=str(error) if isinstance(error,ValueError) else 'REGISTRATION_PRUNE_UNAVAILABLE'
        print(json.dumps(dict(error=reason)));return 2
    finally:
        if db is not None:db.close()
        if lock is not None:os.close(lock)
if __name__=='__main__':raise SystemExit(main())
