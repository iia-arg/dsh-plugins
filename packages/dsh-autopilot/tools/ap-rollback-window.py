#!/usr/bin/env python3
"""Explicit root legacy rollback window. Never call from a Master tool/model.
Source/old core files and existing unit files are unchanged. Runtime freezer and
freeze lives only in the own bounded transient unit; stop-post cleans it.
"""
import argparse
import os
from pathlib import Path
import sys
PACKAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PACKAGE/'lib'))
import operator_window as W


def main():
    p=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    p.add_argument('action',choices=['rollback','_execute','_cleanup'])
    p.add_argument('release',nargs='?')
    p.add_argument('--root',type=Path,default=Path('/'))
    p.add_argument('--id')
    p.add_argument('--report')
    p.add_argument('--accepted-sha256')
    a=p.parse_args()
    if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
    if a.action!='_cleanup' and not a.release:p.error('release required')
    if bool(a.report)!=bool(a.accepted_sha256):p.error('report and accepted SHA required together')
    if a.action=='rollback':
        if a.id:p.error('id is private to the owned service')
        return W.launch(a.root,a.release,a.report,a.accepted_sha256)
    if not a.id or not W.UNIT_ID.fullmatch(a.id):p.error('valid owned id required')
    if a.action=='_execute':return W.execute(a.root,a.id,a.release,a.report,a.accepted_sha256)
    if a.release or a.report:p.error('cleanup takes no release/report')
    return W.cleanup(a.root,a.id)


if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError,KeyError,TypeError) as exc:
        print('REFUSED: '+str(exc),file=sys.stderr);sys.exit(2)
