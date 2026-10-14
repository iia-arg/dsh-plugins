#!/bin/bash
# B-N-1206: compare deployment bytes, never import OMEGA or open its database.
set -euo pipefail
if (($#)); then echo 'ОТКАЗ store-pin: аргументы не поддержаны' >&2; exit 2; fi
exec /usr/bin/python3 -I -S -B - <<'PY'
import ast,hashlib,os,re,sys,stat
lessons='/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/lessons_store.py'
store='/opt/omega/venv/lib/python3.12/site-packages/omega/sqlite_store/_store.py'
if 'STORE_PIN_LESSONS' in os.environ or 'STORE_PIN_STORE' in os.environ:
    if os.environ.get('STORE_PIN_PROBA')!='1':
        print('СЛЕПОТА store-pin: подмена путей требует STORE_PIN_PROBA=1');sys.exit(2)
    lessons=os.environ.get('STORE_PIN_LESSONS',lessons);store=os.environ.get('STORE_PIN_STORE',store)
    print(f'ПРОБА store-pin: lessons={lessons}; store={store}')
def read(p):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):raise ValueError('не обычный файл')
        b=f.read(4*1024*1024+1)
    if len(b)>4*1024*1024:raise ValueError('файл больше4MiB')
    return b
try:
    values=[]
    for node in ast.parse(read(lessons),filename=lessons).body:
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REVIEW_STORE_SHA' for t in node.targets):
            values.append(ast.literal_eval(node.value))
    if len(values)!=1 or not isinstance(values[0],str) or not re.fullmatch('[0-9a-f]{64}',values[0]):
        raise ValueError('нужен один литерал REVIEW_STORE_SHA (64 hex)')
    expected=values[0];actual=hashlib.sha256(read(store)).hexdigest()
except (OSError,ValueError,SyntaxError) as e:
    print(f'СЛЕПОТА store-pin: {type(e).__name__}: {e}; lessons={lessons}; store={store}');sys.exit(2)
if actual!=expected:
    print(f'КРАСНОЕ store-pin: REVIEW_STORE_SHA={expected} ({lessons}); live_sha256={actual} ({store})');sys.exit(1)
print(f'ЗЕЛЁНОЕ store-pin: REVIEW_STORE_SHA=live_sha256={actual}; lessons={lessons}; store={store}')
PY
