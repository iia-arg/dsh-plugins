#!/usr/bin/python3
"""OnFailure reader; no bot keys, invokes the existing bounded alert transport."""
import sys
from mail_service import notify_unit_failure
if __name__=='__main__':
    raise SystemExit(notify_unit_failure(sys.argv[1]) if len(sys.argv)==2 else 2)
