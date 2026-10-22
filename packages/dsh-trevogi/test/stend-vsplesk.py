#!/usr/bin/env python3
"""RU: ЖИВОЙ стенд всплеска (B-N-2055, окно 15.10 00:36Z): 20 писем за ~2 с от 10 учёток через НАСТОЯЩИЙ systemd —
path-юнит + служба отправителя из systemd/ кандидата, переименованные (stend-vsplesk-<pid>) и с путями на временный
спул в /run. Ожидание: path жив (active), служба не упёрлась в start-limit, все 20 клиентов — код 0, отправлено 20.
Запуск: sudo python3 -B test/stend-vsplesk.py --zhivaya-mashina [--porcha]; без ключа первым доводом — «ОТКАЗ-ZHIVAYA-MASHINA», код 2,
ничего не тронуто. --porcha: строки StartLimit* из службы убраны (умолчание 5 за 10 с, как в бою до правки) → path погашен
«unit-start-limit-hit», часть клиентов — 75. Внесение порчи доказывается: StartLimitBurst живой службы печатается
(100 правка / 5 порча) и сверяется — не тот ⇒ СЛЕПОТА (2). Всплеск не дал больше 5 запусков ⇒ порча бессильна по
построению — СЛЕПОТА (2), а не «зелено».
Только root. Боевые юниты, спул /var/spool/dsh-trevogi, журнал agent-alert и Telegram не трогаются: отправка —
подставной исполняемый файл рядом со стендом, logger клиентов — подставной. После прогона юниты остановлены и удалены
(по имени), daemon-reload, reset-failed. Коды: 0 · 1 расхождение · 2 слепота. Не проверяет: застрявший файл во vhod
(предел 100 гасит круг) — только чтение юнита.
EN: Live burst stand on real systemd; --porcha drops StartLimit* from the service (default 5/10 s) and must kill the path.
"""
import grp
import os
import pwd
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# ZHIVAYA-MASHINA: daemon-reload, start/stop, reset-failed подставных юнитов stend-vsplesk-<pid>.{path,service} в /run/systemd/system (снимаются на выходе); боевые юниты, спул и журнал agent-alert не трогает
a = sys.argv[1:]
if a[:1] != ['--zhivaya-mashina'] or a[1:] not in ([], ['--porcha']):
    print('ОТКАЗ-ZHIVAYA-MASHINA: daemon-reload и подставные юниты stend-vsplesk-<pid> в /run/systemd/system — нужен первым '
          'доводом --zhivaya-mashina (затем, по желанию, --porcha). Ничего не тронуто.'); sys.exit(2)
PORCHA = a[1:] == ['--porcha']
if os.geteuid() != 0:
    print('СЛЕПОТА: живой стенд всплеска только от root (юниты systemd, учётки клиентов)'); sys.exit(2)
GR = 'agent-button'
uchetki = list(grp.getgrnam(GR).gr_mem)[:9] + ['varvara']
if len(uchetki) < 10:
    print(f'СЛЕПОТА: учёток для всплеска {len(uchetki)} из 10'); sys.exit(2)
RUNUSER = shutil.which('runuser') or '/usr/sbin/runuser'

IMYA = f'stend-vsplesk-{os.getpid()}'
B = Path(f'/run/{IMYA}')                       # спул и код — видны службе с PrivateTmp
V = Path(tempfile.mkdtemp(prefix=f'{IMYA}-', dir='/var/tmp'))   # logger клиентов (нужен exec; /run — noexec)
STUB = ROOT / 'test' / f'.{IMYA}-otpravka'     # отправка службы (exec, вне /tmp и /run)
UD = Path('/run/systemd/system')
YU = {'.path': UD / f'{IMYA}.path', '.service': UD / f'{IMYA}.service'}
ok = fail = 0


def sud(imya, uslovie, podrobno=''):
    global ok, fail
    if uslovie:
        ok += 1; print(f'  ✅ {imya}')
    else:
        fail += 1; print(f'  🔴 {imya} — {podrobno}')


def sh(*c, **k):
    return subprocess.run(list(c), capture_output=True, text=True, **k)


def svojstvo(yunit, p):
    return sh('systemctl', 'show', yunit, '-p', p, '--value').stdout.strip()


try:
    B.mkdir(mode=0o755)
    for d in ('subj/bin', 'subj/lib/dsh-trevogi'):
        (B / d).mkdir(parents=True)
    for d in (B / 'subj', B / 'subj/bin', B / 'subj/lib', B / 'subj/lib/dsh-trevogi'):
        os.chmod(d, 0o755)
    for f in ('agent-alert', 'agent-alert-otpravitel'):
        shutil.copy(ROOT / 'bin' / f, B / 'subj/bin' / f); os.chmod(B / 'subj/bin' / f, 0o755)
    for f in ('nastrojki.py', 'klient.py'):
        shutil.copy(ROOT / 'lib/dsh-trevogi' / f, B / 'subj/lib/dsh-trevogi' / f)
    (B / 'pusto.conf').write_text('# стенд\n'); os.chmod(B / 'pusto.conf', 0o644)
    (B / 'otpr.log').write_text(''); os.chmod(B / 'otpr.log', 0o644)
    SP = B / 'spul'; SP.mkdir(); os.chmod(SP, 0o755)
    gid = grp.getgrnam(GR).gr_gid
    for d, m, g in (('tmp', 0o1730, gid), ('vhod', 0o1730, gid), ('itog', 0o711, 0), ('work', 0o700, 0)):
        (SP / d).mkdir(); os.chown(SP / d, 0, g); os.chmod(SP / d, m)
    for d in ('tmp', 'vhod'):
        subprocess.run(['setfacl', '-m', 'u:varvara:wx', str(SP / d)], check=True)
    os.chmod(V, 0o755); (V / 'bin').mkdir(); os.chmod(V / 'bin', 0o755)
    (V / 'logger.log').write_text(''); os.chmod(V / 'logger.log', 0o666)
    (V / 'bin/logger').write_text(f'#!/bin/sh\nprintf "%s\\n" "$*" >> {V}/logger.log\n'); os.chmod(V / 'bin/logger', 0o755)
    STUB.write_text(f'#!/bin/sh\ncat >/dev/null\necho "$(date +%s.%N) $$" >> {B}/otpr.log\necho \'{{"ok":true}}\'\n')
    os.chmod(STUB, 0o700)

    # ── юниты: текст кандидата, замены только имён и путей ──
    tp = (ROOT / 'systemd/agent-alert-otpravitel.path').read_text()
    ts = (ROOT / 'systemd/agent-alert-otpravitel.service').read_text()
    zam_p = [('/var/spool/dsh-trevogi/vhod', f'{SP}/vhod'), ('Unit=agent-alert-otpravitel.service', f'Unit={IMYA}.service')]
    zam_s = [('/usr/local/sbin/agent-alert-otpravitel', f'{B}/subj/bin/agent-alert-otpravitel'),
             ('ReadWritePaths=/var/spool/dsh-trevogi', f'ReadWritePaths={B}'),
             ('[Service]\n', f'[Service]\nEnvironment=DSH_TREVOGI_CONFIG={B}/pusto.conf AGENT_ALERT_SPUL={SP} '
              f'AGENT_ALERT_OTPRAVKA_BIN={STUB} AGENT_ALERT_KVOTA_10MIN=1000 AGENT_ALERT_KVOTA_SUTKI=1000\n')]
    if PORCHA:
        zam_s += [('StartLimitIntervalSec=10s\n', ''), ('StartLimitBurst=100\n', '')]
    for t_, zz, put in ((tp, zam_p, YU['.path']), (ts, zam_s, YU['.service'])):
        for x, y in zz:
            if t_.count(x) != 1:
                print(f'СЛЕПОТА: в {put.name} образец «{x.strip()}» найден {t_.count(x)} раз'); sys.exit(2)
            t_ = t_.replace(x, y)
        put.write_text(t_)
    if PORCHA:
        print('     ПОРЧА внесена: StartLimitIntervalSec/StartLimitBurst убраны из службы (замен 2)')
    sh('systemctl', 'daemon-reload')
    burst = svojstvo(f'{IMYA}.service', 'StartLimitBurst')
    zhdu = '5' if PORCHA else '100'
    print(f'     StartLimitBurst живой службы: {burst} (ждём {zhdu})')
    if burst != zhdu:
        print('СЛЕПОТА: предел запусков в живой службе не тот — строка не дошла до systemd'); sys.exit(2)
    r = sh('systemctl', 'start', f'{IMYA}.path')
    if svojstvo(f'{IMYA}.path', 'ActiveState') != 'active':
        print(f'СЛЕПОТА: тестовый path не взведён: {r.stderr.strip()}'); sys.exit(2)
    t0 = time.time()

    # ── всплеск: 20 писем, 10 учёток по 2, запуски через 0,1 с ──
    env = {'PATH': f'{V}/bin:/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': '/', 'DSH_TREVOGI_CONFIG': f'{B}/pusto.conf',
           'AGENT_ALERT_SPUL': str(SP), 'AGENT_ALERT_CHEREZ_SPUL': '1', 'AGENT_ALERT_ITOG_ZHDAT': '20'}
    procs = []
    for i in range(20):
        u = uchetki[i % 10]
        cmd = [RUNUSER, '-u', u, '--', '/usr/bin/env', '-i', *[f'{k}={v}' for k, v in env.items()],
               'bash', f'{B}/subj/bin/agent-alert', f'всплеск {i} от {u}']
        procs.append((u, subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={})))
        time.sleep(0.1)
    kody = []
    for u, p in procs:
        try:
            p.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill(); p.communicate()
        kody.append(p.returncode)
    time.sleep(1)
    zapuskov = sum(1 for s in sh('journalctl', '-u', f'{IMYA}.service', '--since', f'@{int(t0) - 1}', '-o', 'cat',
                                 '--no-pager').stdout.splitlines() if s.startswith('Starting '))
    otpr = len((B / 'otpr.log').read_text().splitlines())
    sost_p = svojstvo(f'{IMYA}.path', 'ActiveState'); rez_p = svojstvo(f'{IMYA}.path', 'Result')
    rez_s = svojstvo(f'{IMYA}.service', 'Result')
    print(f'     запусков службы {zapuskov} · path {sost_p}/{rez_p} · служба {rez_s} · отправлено {otpr} из 20 · '
          f'коды клиентов {sorted(set(kody))} (0: {kody.count(0)})')
    if PORCHA and zapuskov <= 5 and rez_p != 'unit-start-limit-hit':
        print('СЛЕПОТА: всплеск дал ≤5 запусков — умолчание 5 за 10 с не могло сработать, порча бессильна по построению')
        sys.exit(2)
    sud('V1 path-юнит жив после всплеска (active, не unit-start-limit-hit)', sost_p == 'active' and rez_p == 'success',
        f'{sost_p}/{rez_p}')
    sud('V2 служба не упёрлась в предел запусков', rez_s != 'start-limit-hit', rez_s)
    sud('V3 все 20 клиентов — код 0, отправлено 20, vhod пуст', kody.count(0) == 20 and otpr == 20
        and os.listdir(SP / 'vhod') == [], f'коды {kody} отправлено {otpr} vhod {os.listdir(SP / "vhod")}')
finally:
    for y in (f'{IMYA}.path', f'{IMYA}.service'):
        sh('systemctl', 'stop', y)
    for p in YU.values():
        p.unlink(missing_ok=True)
    sh('systemctl', 'daemon-reload')
    sh('systemctl', 'reset-failed', f'{IMYA}.path', f'{IMYA}.service')
    STUB.unlink(missing_ok=True)
    shutil.rmtree(B, ignore_errors=True); shutil.rmtree(V, ignore_errors=True)

print(f'\nитог: {ok} из {ok + fail}' + (' (порча)' if PORCHA else ''))
if ok + fail != 3:
    print(f'🔴 КАНАРЕЙКА: проб {ok + fail}, ждём 3'); sys.exit(2)
sys.exit(1 if fail else 0)
