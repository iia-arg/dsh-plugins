#!/usr/bin/env python3
"""Root inventory maintenance. Scan is read-only; bootstrap needs an accepted SHA.

Production scope is every visible local mounted FS; accepted census binds its
complete owner/pin roots. --root uses a separately root-owned fixture scope. An accepted report is a separate gates subject; supplying its hash
is the operator's external acceptance claim, not this tool accepting itself.
"""
import argparse
import json
import os
from pathlib import Path
import sys

# Source package and physical release each carry identical catalogue code.
local = Path(__file__).resolve().parent
sys.path.insert(0,str(local if (local/'run_catalog.py').is_file() else local.parent/'runtime'))
from run_catalog import bootstrap, scan_legacy, physical


def main():
    parser = argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('action',choices=['scan','bootstrap'])
    parser.add_argument('--root',default='/')
    parser.add_argument('--report')
    parser.add_argument('--accepted-sha256')
    args = parser.parse_args()
    if os.geteuid() != 0: raise ValueError('ROOT_REQUIRED')
    root = physical(args.root)
    info = root.stat()
    if info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('ROOT_UNSAFE')
    base = root/'var/lib/dsh-autopilot'
    if args.action == 'scan':
        if args.report or args.accepted_sha256: parser.error('scan has no report/acceptance arguments')
        value = scan_legacy(root)
        code = 0 if value['complete'] else 2
    else:
        if not args.report or not args.accepted_sha256: parser.error('bootstrap requires --report and --accepted-sha256')
        sys.path.insert(0,str(local.parent/'lib'))
        from operator_window import assert_fenced
        proof=assert_fenced(root)
        value = bootstrap(base,root,Path(args.report),args.accepted_sha256,window_id=proof['id'])
        code = 0
    print(json.dumps(value,ensure_ascii=False,indent=2,sort_keys=True))
    return code


if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError,KeyError,TypeError) as exc:
        print('REFUSED: '+str(exc),file=sys.stderr);sys.exit(2)
