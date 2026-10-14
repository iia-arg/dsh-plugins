#!/usr/bin/env python3
# systemd's offline consumer checks accepted hardening, never starts a host unit.
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(os.environ.get('TREVOGI_TEST_ROOT', Path(__file__).resolve().parents[1]))
if not shutil.which('systemd-analyze'):
    print('СЛЕПОТА: нужен systemd-analyze для offline unit parse')
    sys.exit(2)

def security(file):
    r = subprocess.run(['systemd-analyze', 'security', '--offline=yes', '--json=short', str(file)],
                       capture_output=True, text=True, timeout=15, env={**os.environ,'LC_ALL':'C.UTF-8'})
    assert r.returncode == 0, r.stderr
    rows = {row['json_field']: row for row in json.loads(r.stdout)}
    return (rows['NoNewPrivileges']['set'] is True and rows['PrivateTmp']['set'] is True and
            float(rows['ProtectSystem']['exposure'] or '0') <= 0.1 and
            float(rows['ProtectHome']['exposure'] or '0') <= 0.1)

with tempfile.TemporaryDirectory(prefix='trevogi-unit-') as td:
    for name in ['otkaz-klyuch-watch.service','agent-alert-hvost-obrezka.service']:
        source = ROOT/'systemd'/name
        file = Path(td)/name
        original = source.read_bytes()
        file.write_bytes(original)
        assert security(file), ('healthy unit',name)
        old='NoNewPrivileges=true';new='NoNewPrivileges=false'
        assert file.read_text().count(old)==1
        before=hashlib.sha256(file.read_bytes()).hexdigest();file.write_text(file.read_text().replace(old,new,1))
        count=subprocess.run(['grep','-cF','--',new,str(file)],capture_output=True,text=True)
        after=hashlib.sha256(file.read_bytes()).hexdigest();assert count.stdout.strip()=='1' and before!=after
        print(name,'replacements1','grep-F1','SHA',before,'->',after,flush=True)
        assert not security(file), ('damaged unit accepted',name)
        file.write_bytes(original);assert security(file);assert hashlib.sha256(file.read_bytes()).hexdigest()==before
        print(name,'states green red green; restoredSHA',before,flush=True)
