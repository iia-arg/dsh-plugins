#!/usr/bin/env python3
# All *.test.mjs on a private package copy; explicit dependencies, no installed owner reader.
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

pkg = Path(__file__).resolve().parents[1]
deps = Path(os.environ.get('SOCSETI_TEST_NODE_MODULES', '/opt/socseti/node_modules'))
watch = Path(os.environ.get('SOCSETI_WATCH_SOURCE', pkg.parent / 'dsh-storozha-sadik/sbin/socseti-watch'))
node = os.environ.get('SOCSETI_TEST_NODE', '/opt/nodejs/node-v24.19.0-linux-x64/bin/node')
if not deps.is_dir() or not watch.is_file() or not os.access(node, os.X_OK):
    print('СЛЕПОТА: нужны зависимости соцсетей, Node 24 и источник socseti-watch')
    sys.exit(2)
with tempfile.TemporaryDirectory(prefix='b2023-social-') as td:
    copy = Path(td) / 'package'
    shutil.copytree(pkg, copy, ignore=shutil.ignore_patterns('node_modules', '__pycache__'))
    (copy / 'node_modules').symlink_to(deps)
    env = {**os.environ, 'SOCSETI_WATCH_SOURCE': str(watch)}
    for key in ('SOCSETI_OWNER_READER', 'SOCSETI_APPROVERS_FILE', 'VLADELEC_TG_ID_FILE'):
        env.pop(key, None)
    names = sorted(str(p.relative_to(copy)) for p in (copy / 'test').glob('*.test.mjs'))
    try:
        r = subprocess.run([node, '--test', *names], cwd=copy, env=env, timeout=120)
        sys.exit(r.returncode)
    except subprocess.TimeoutExpired:
        print('СЛЕПОТА: полный набор превысил 120 секунд')
        sys.exit(2)
