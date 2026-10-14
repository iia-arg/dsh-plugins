#!/usr/bin/env python3
# Actual bounded subprocess helper: escaped child keeps output pipe after parent kill.
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import sys
import tempfile
import time

root = Path(os.environ.get('TREVOGI_TEST_ROOT', Path(__file__).resolve().parents[1]))
module = runpy.run_path(str(root / 'bin/otkaz-klyuch-watch'))
with tempfile.TemporaryDirectory(prefix='trevogi-deadline-') as td:
    directory = Path(td)
    script = directory / 'channel.py'
    marker = directory / 'child.json'
    script.write_text('''import os,json,time,sys
from pathlib import Path
if os.fork()==0:
 os.setsid();pid=os.getpid();start=Path('/proc/self/stat').read_text().rpartition(')')[2].split()[19]
 Path(sys.argv[1]).write_text(json.dumps({'pid':pid,'start':start}))
 time.sleep(2)
 os._exit(0)
time.sleep(20)
''')
    try:
        start = time.monotonic()
        try:
            module['run_bounded']([sys.executable, str(script), str(marker)], 0.1)
            raise AssertionError('unresponsive channel unexpectedly returned')
        except subprocess.TimeoutExpired:
            elapsed = time.monotonic() - start
        assert marker.is_file(), 'escaped child was not introduced'
        child = json.loads(marker.read_text())
        assert elapsed < 0.8, f'pipe drain exceeded deadline: {elapsed:.3f}s'
        print(json.dumps({'case':'timeout-with-escaped-pipe-holder','uid':os.geteuid(),'deadlineSeconds':0.1,'observedSeconds':elapsed,'maximumSeconds':0.8,'escapedChildIntroduced':True,'passed':True}))
    finally:
        if marker.is_file():
            child = json.loads(marker.read_text())
            proc = Path('/proc') / str(child['pid'])
            try:
                same = proc.joinpath('stat').read_text().rpartition(')')[2].split()[19] == child['start']
                if same and str(script).encode() in proc.joinpath('cmdline').read_bytes():
                    os.kill(child['pid'], signal.SIGKILL)
            except FileNotFoundError:
                pass
