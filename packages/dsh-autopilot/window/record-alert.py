#!/usr/bin/python3
"""Private P5 stdin recorder, bind-mounted over agent-alert in that unit only."""
import sys
sys.dont_write_bytecode = True
import json
import os
from pathlib import Path
import stat


def main():
    if sys.argv[1:] != ['--plain']:
        return 2
    path = Path(os.environ.get('PDRY_ALERT_RECORD', '/'))
    if not path.is_absolute() or path.resolve() != path or not path.is_relative_to('/var/tmp'):
        return 2
    text = sys.stdin.read(8193)
    if not text or len(text) > 8192:
        return 2
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) != 0o600):
            return 2
        body = (json.dumps({'uid': os.geteuid(), 'text': text}, ensure_ascii=False)+'\n').encode()
        if os.write(fd, body) != len(body):
            return 2
        os.fsync(fd)
    finally:
        os.close(fd)
    return 0


if __name__ == '__main__':
    sys.exit(main())
