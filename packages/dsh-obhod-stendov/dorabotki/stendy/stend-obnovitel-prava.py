#!/usr/bin/env python3
# Стенд прав производного у codex-obnovitel (B-N-1621, Искра). Зовёт НАСТОЯЩУЮ zapisat_proizvodnyj предмета на подставном
# каталоге подписки в /var/tmp (фиктивные токены). Признак: новый производный НАСЛЕДУЕТ группу, режим и ACL заменяемого;
# прежнего нет — root:root 0600 без ACL. Чтение — ядром (runuser с группами юнита: coders и spartak с 986).
# Учётка ROOT (chown, runuser) — строка обхода «@root». Предмет по умолчанию — БОЙ (/usr/local/sbin/codex-obnovitel);
# кандидата подавать STEND_PREDMET. Коды: 0 все пробы зелёные · 1 красные · 2 слепота.
# ЧЕГО НЕ ЛОВИТ: сам refresh (app-server) и полный носитель — их стенды у Зари (B-N-800/807); только права производного.
import base64, hashlib, importlib.machinery, json, os, shutil, subprocess, sys, tempfile, time

P = os.environ.get('STEND_PREDMET', '/usr/local/sbin/codex-obnovitel')
if os.geteuid() != 0:
    print('СЛЕПОТА: нужен root (chown, runuser) — строка обхода «@root»'); sys.exit(2)
if not os.path.isfile(P):
    print(f'СЛЕПОТА: нет предмета {P}'); sys.exit(2)
for u in ('coders', 'spartak'):
    if subprocess.run(['id', u], capture_output=True).returncode != 0:
        print(f'СЛЕПОТА: нет учётки {u}'); sys.exit(2)

ok = bed = 0
def sud(tekst, uslovie, podrobno=''):
    global ok, bed
    if uslovie: ok += 1; print(f'  ✅ {tekst}')
    else: bed += 1; print(f'  🔴 {tekst} — {podrobno}')

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
def para(akk, metka, refresh='rt-polnyj'):
    exp = int(time.time()) + 200 * 3600
    cl = {'https://api.openai.com/auth': {'chatgpt_account_id': akk}, 'exp': exp, 'metka': metka}
    j = b64({'alg': 'none'}) + '.' + b64(cl) + '.fiktiv'
    return {'tokens': {'id_token': j, 'access_token': j, 'refresh_token': refresh, 'account_id': akk}}
def sh(*a): subprocess.run(a, check=True, capture_output=True)
def acl(put): return subprocess.run(['getfacl', '--omit-header', '--absolute-names', '--', put], capture_output=True, text=True).stdout
def chit(kto, put): return subprocess.run(['runuser', '-u', kto, '-g', kto, '-G', 'claudeoauth', '--', 'test', '-r', put]).returncode == 0
def h8(put): return hashlib.sha256(open(put, 'rb').read()).hexdigest()[:8]

RAB = tempfile.mkdtemp(prefix='stend-obn.', dir='/var/tmp')
os.chmod(RAB, 0o711)
try:
    K = os.path.join(RAB, 'codex-podpiska-3'); PROIZV = os.path.join(K, 'auth.json'); POLNYJ = os.path.join(K, 'polnyj', 'auth.json')
    os.environ.update({'CODEX_OBN_PROIZV': PROIZV, 'CODEX_OBN_POLNYJ': POLNYJ, 'CODEX_OBN_DOM': os.path.join(RAB, 'dom'),
                       'CODEX_OBN_ZAMOK': os.path.join(RAB, 'zamok'), 'CODEX_OBN_SLED': os.path.join(RAB, 'sled.json'),
                       'CODEX_OBN_ALERT': '/bin/false'})
    m = importlib.machinery.SourceFileLoader('obn_stend', P).load_module()

    def sbros(rezhim):
        shutil.rmtree(K, ignore_errors=True); os.makedirs(os.path.join(K, 'polnyj'))
        if rezhim == 'do':        # как сейчас на бою: группа 986, ACL по умолчанию u:coders
            sh('chown', 'root:claudeoauth', K); os.chmod(K, 0o750)
            sh('setfacl', '-m', 'u:coders:--x', K); sh('setfacl', '-d', '-m', 'u:coders:r', K)
            json.dump(m.proizvodnyj_iz(para('akk-3', 'staryj')), open(PROIZV, 'w'))
            sh('chown', 'root:claudeoauth', PROIZV); os.chmod(PROIZV, 0o640)
        elif rezhim == 'posle':   # после перехода: root:root, только ACL «своя подписка»
            sh('chown', 'root:root', K); os.chmod(K, 0o700); sh('setfacl', '-m', 'u:coders:--x,u:marc:--x', K)
            json.dump(m.proizvodnyj_iz(para('akk-3', 'staryj')), open(PROIZV, 'w'))
            sh('chown', 'root:root', PROIZV); os.chmod(PROIZV, 0o600); sh('setfacl', '-m', 'u:coders:r,u:marc:r', PROIZV)
        else:                     # прежнего нет
            sh('chown', 'root:root', K); os.chmod(K, 0o700)

    def zapis():
        try:
            m.zapisat_proizvodnyj(para('akk-3', 'novyj')); return 'ok'
        except RuntimeError as e:
            return f'RuntimeError: {e}'

    print('О1: до перехода (root:claudeoauth 0640, u:coders из ACL по умолчанию)')
    sbros('do'); a0 = acl(PROIZV); g0 = os.stat(PROIZV).st_gid
    r = zapis(); z = json.load(open(PROIZV))
    sud('О1 запись прошла, права и группа = прежним, refresh пуст, содержимое новое',
        r == 'ok' and acl(PROIZV) == a0 and os.stat(PROIZV).st_gid == g0 and z['tokens']['refresh_token'] == ''
        and 'novyj' in base64.urlsafe_b64decode(z['tokens']['access_token'].split('.')[1] + '==').decode(), f'{r} | {acl(PROIZV)!r}')
    sud('О1 шлюзы читают как прежде (spartak с 986 — да, coders — да): групповая схема не сломана',
        chit('spartak', PROIZV) and chit('coders', PROIZV), f'{chit("spartak", PROIZV)} {chit("coders", PROIZV)}')

    print('О2: после перехода (root:root 0600 + ACL coders, marc)')
    sbros('posle'); a0 = acl(PROIZV)
    r = zapis()
    sud('О2 запись прошла, ACL = прежнему, группа root, group::---',
        r == 'ok' and acl(PROIZV) == a0 and os.stat(PROIZV).st_gid == 0 and 'group::---' in acl(PROIZV), f'{r} | {acl(PROIZV)!r}')
    sud('О2 ядро: coders читает, spartak (с 986!) — НЕТ', chit('coders', PROIZV) and not chit('spartak', PROIZV),
        f'coders {chit("coders", PROIZV)} spartak {chit("spartak", PROIZV)}')

    print('О3: прежнего производного нет')
    sbros('net'); r = zapis(); st = os.stat(PROIZV)
    sud('О3 новый закрыт: root:root 0600, именованных ACL нет', r == 'ok' and st.st_uid == 0 and st.st_gid == 0
        and (st.st_mode & 0o777) == 0o600 and 'user:' not in acl(PROIZV).replace('user::', ''), f'{r} {oct(st.st_mode)} {acl(PROIZV)!r}')

    print('О4: порча — setfacl отказывает')
    sbros('posle'); s0 = h8(PROIZV); a0 = acl(PROIZV)
    lzh = os.path.join(RAB, 'lzhebin'); os.makedirs(lzh, exist_ok=True)
    open(os.path.join(lzh, 'setfacl'), 'w').write('#!/bin/sh\nexit 1\n'); os.chmod(os.path.join(lzh, 'setfacl'), 0o755)
    put_ = os.environ['PATH']; os.environ['PATH'] = lzh + ':' + put_
    print(f'    порча внесена: setfacl в PATH → {subprocess.run(["sh", "-c", "command -v setfacl"], capture_output=True, text=True).stdout.strip()}')
    r = zapis(); os.environ['PATH'] = put_
    sud('О4 замена отменена: RuntimeError «не перенесены», прежний цел (сумма и ACL), временного нет',
        r.startswith('RuntimeError') and 'не перенесены' in r and h8(PROIZV) == s0 and acl(PROIZV) == a0
        and not os.path.exists(PROIZV + '.novyj'), f'{r} {h8(PROIZV)}≠{s0}?')
    r = zapis()
    sud('О4 возврат (настоящий setfacl): запись прошла, ACL = прежнему', r == 'ok' and acl(PROIZV) == a0, r)
finally:
    shutil.rmtree(RAB, ignore_errors=True)

print(f'\nитог: {ok} из {ok + bed}')
ZHDYOM = 7
if ok + bed != ZHDYOM:
    print(f'🔴 КАНАРЕЙКА: проб {ok + bed}, ждём {ZHDYOM}'); sys.exit(2)
sys.exit(1 if bed else 0)
