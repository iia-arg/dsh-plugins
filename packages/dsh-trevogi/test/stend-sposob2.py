#!/usr/bin/env python3
"""RU: Стенд способа 2 (B-N-2055): клиент agent-alert → спул → root-отправитель agent-alert-otpravitel. Только от root:
запросы кладутся ОТ учёток через runuser (master — участник agent-button; nobody — вне группы; varvara — по ACL),
учётку отправитель берёт fstat. Подставные curl/logger/systemctl/journalctl в PATH; токен, спул, хвост — во временном
каталоге; боевые файлы и сеть не трогаются. Порчи 1–6 замысла (§6) и 7–17 по LOW Вениамина, 18–19 по info 3.1.6, 20–21 по 3.1.8 (хвост клиента) — ключом --porcha N: вносятся в КОПИЮ предмета,
число замен печатается, ноль замен — слепота (2). Ожидание: без порчи все пробы зелёные; порча N краснит свою пробу.
Коды: 0 · 1 расхождение · 2 слепота. Не проверяет: живой Telegram, настоящие path-юнит и журнал, песочницы юнитов
(это шаги 2–3 окна), заполнение диска.
EN: Method 2 stand, root only; corruptions 1–21 via --porcha N applied to a copy with a replacement count.
"""
import grp
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
a = sys.argv[1:]
PORCHA = 0
if a[:1] == ['--porcha'] and len(a) == 2 and a[1] in [str(i) for i in range(1, 22)]:
    PORCHA = int(a[1])
elif a:
    print('ОТКАЗ: stend-sposob2.py [--porcha 1..21]'); sys.exit(2)
if os.geteuid() != 0:
    print('СЛЕПОТА: стенд способа 2 только от root (запросы от разных учёток, fstat, chown итога)'); sys.exit(2)
for u in ('master', 'nobody', 'varvara'):
    try:
        import pwd; pwd.getpwnam(u)
    except KeyError:
        print(f'СЛЕПОТА: нет учётки {u}'); sys.exit(2)
GR = 'agent-button'
try:
    chleny = grp.getgrnam(GR).gr_mem
except KeyError:
    print(f'СЛЕПОТА: нет группы {GR}'); sys.exit(2)
if 'master' not in chleny or 'nobody' in chleny or 'varvara' in chleny:
    print(f'СЛЕПОТА: подстава учёток не та — master должен быть в {GR}, nobody и varvara нет: {chleny}'); sys.exit(2)
RUNUSER = shutil.which('runuser') or '/usr/sbin/runuser'
if shutil.which('setfacl') is None or not os.access(RUNUSER, os.X_OK):
    print('СЛЕПОТА: нет setfacl или runuser'); sys.exit(2)

T = Path(tempfile.mkdtemp(prefix='stend-sposob2-', dir='/var/tmp'))
T.chmod(0o755)
ok = fail = 0


def sud(imya, uslovie, podrobno=''):
    global ok, fail
    if uslovie:
        ok += 1; print(f'  ✅ {imya}')
    else:
        fail += 1; print(f'  🔴 {imya} — {podrobno}')


def w(p, s, mode=0o644):
    Path(p).write_text(s); os.chmod(p, mode)


try:
    # ── предмет: копия пакета (bin + lib) ──
    S = T / 'subj'
    (S / 'bin').mkdir(parents=True); (S / 'lib' / 'dsh-trevogi').mkdir(parents=True)
    for f in ('agent-alert', 'agent-alert-otpravitel'):
        shutil.copy(ROOT / 'bin' / f, S / 'bin' / f); os.chmod(S / 'bin' / f, 0o755)
    for f in ('nastrojki.py', 'klient.py'):
        shutil.copy(ROOT / 'lib' / 'dsh-trevogi' / f, S / 'lib' / 'dsh-trevogi' / f)
    for d in (S, S / 'bin', S / 'lib', S / 'lib' / 'dsh-trevogi'):
        os.chmod(d, 0o755)
    DEM, KL = S / 'bin' / 'agent-alert-otpravitel', S / 'lib' / 'dsh-trevogi' / 'klient.py'
    AA = S / 'bin' / 'agent-alert'
    PORCHI = {
        1: [(DEM, "    imya = uchetka(uid)\n    istochnik",
             "    imya = (re.search(r'подпись=(\\w+)', telo) or [None, uchetka(uid)])[1]\n    istochnik")],
        2: [(DEM, "        prichina = kvota.proverit(uid, imya, telo.strip().split('\\n')[0])", "        prichina = None")],
        3: [(DEM, "            telo = filtr_html(telo)", "            pass")],
        4: [(DEM, "            bedy['ochered'] = f'очередь стоит:", "            pass  # bedy['ochered'] = f'очередь стоит:")],
        5: [(KL, "        logger(f'🔴 исход=нет-пути", "        (lambda *x: None)(f'🔴 исход=нет-пути")],
        6: [(DEM, "    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:", "    if False:"),
            (DEM, "os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK", "os.O_RDONLY | os.O_NONBLOCK"),
            (DEM, "(fs.st_dev, fs.st_ino) != (st.st_dev, st.st_ino) or ", "")],
        # LOW-1: повтор того же набора не подавляется
        7: [(DEM, "        if nabor != otmetka.get('nabor') or seichas - otmetka.get('kogda', 0) >= POVTOR_STOROZHA:",
             "        if True:")],
        # LOW-2: оборванный разбор не убирается
        8: [(DEM, "    prervannye(work, itog)\n", "")],
        # LOW-1: смена набора бед не замечается (только срок)
        9: [(DEM, "if nabor != otmetka.get('nabor') or seichas", "if seichas")],
        # LOW-1: отметка ставится и при недоставке — неудачная тревога молчит 6 ч
        10: [(DEM, "            if k == 0:\n                otmetka = {'nabor': nabor", "            if True:\n                otmetka = {'nabor': nabor")],
        # LOW 02:54: ключ беды журнала общий на всех отправителей — второй отказавший скрыт
        11: [(DEM, "bedy[f'zhurnal:{u}']", "bedy['zhurnal']")],
        # строки журнала — подстрокой где угодно: тревога сторожа подпитывает сама себя
        12: [(DEM, "            m = KLIENT_OTKAZ.match(s)\n            if not m:", "            m = re.search(r'исход=нет-(?:пути|итога).*?учётка=(\\S+)', s)\n            if not m:")],
        # LOW 03:08: _UID записи не сверяется с учёткой из строки — выдуманное имя даёт тревогу
        13: [(DEM, "        return pwd.getpwnam(imya).pw_uid == uid_zapisi", "        return True")],
        # неразрешимое имя принимается от любого uid, не только от динамических учёток systemd
        14: [(DEM, "        return uid_zapisi in DINAMICHESKIE_UID", "        return True")],
    }
    # самоподпитку держат два слоя (якорь строки клиента и _UID: строку доставки пишет root) — порча 15 снимает оба
    PORCHI[15] = PORCHI[12] + PORCHI[13]
    # окно 15.10: клиент не убирает свою .chk — при погашенном отправителе пробы лежат во vhod/ вечно
    PORCHI[16] = [(KL, "                os.unlink(os.path.join(vhod, imya + '.chk'))", "                pass")]
    # 3.1.4: «не вижу» (systemctl без ответа из песочницы DynamicUser) снова считается «не взведён» — ложный отказ
    PORCHI[17] = [(KL, "    if vizhu and aktiven != 'active':", "    if aktiven != 'active':")]
    # 3.1.6 (info Вениамина 05:05Z): отказ клиентского пути снова без строки журнала agent-alert
    PORCHI[18] = [(KL, "    logger(f'исход={ishod} учётка=", "    (lambda *x: None)(f'исход={ishod} учётка=")]
    # 3.1.6: сторож берёт любую строку «исход=… учётка=» — новые строки отказа клиента он счёл бы бедой «без пути/итога»
    PORCHI[19] = [(DEM, "KLIENT_OTKAZ = re.compile(r'🔴 исход=нет-(?:пути|итога) учётка=", "KLIENT_OTKAZ = re.compile(r'(?:🔴 )?исход=\\S+ учётка=")]
    # 3.1.8: клиент пишет хвост из config (общий, его пишет root-отправитель) — строка задвоится
    PORCHI[20] = [(AA, 'if [ -n "$HVOST_IZ_OKRUZHENIYA" ]; then\n    msg_polnyj="$msg"; HVOST_FAJL="$HVOST_IZ_OKRUZHENIYA"',
                   'if true; then\n    msg_polnyj="$msg"')]
    # 3.1.8: клиентский путь снова не пишет хвост учётки
    PORCHI[21] = [(AA, '    zapisat_hvost "$ishod_k"', '    : "$ishod_k"')]
    if PORCHA:
        for put, bylo, stalo in PORCHI[PORCHA]:
            t = put.read_text(); n = t.count(bylo)
            if n != 1:
                print(f'СЛЕПОТА: порча {PORCHA} не внесена в {put.name} — образец найден {n} раз'); sys.exit(2)
            put.write_text(t.replace(bylo, stalo, 1))
        print(f'     ПОРЧА {PORCHA} внесена: замен {len(PORCHI[PORCHA])}')

    # ── подставы ──
    B = T / 'bin'; B.mkdir(); os.chmod(B, 0o755)
    for f in ('curl.log', 'logger.log'):
        w(T / f, '', 0o666)
    w(B / 'curl', '#!/usr/bin/python3\nimport sys,json\nsys.stdin.read()\n'
      f'import os\nif os.path.exists({str(T / "curl-padaet")!r}): sys.exit(7)\n'
      f'open({str(T / "curl.log")!r},"a").write(json.dumps(sys.argv[1:],ensure_ascii=False)+"\\n")\n'
      'print(\'{"ok":true}\')\n', 0o755)
    # подставной logger пишет запись как journald (-o json): MESSAGE и _UID вызвавшего процесса
    w(B / 'logger', '#!/usr/bin/python3\nimport sys,os,json\na=sys.argv[3:]\nif a[:1]==["--"]: a=a[1:]\n'
      f'open({str(T / "logger.log")!r},"a").write(json.dumps({{"MESSAGE":" ".join(a),"_UID":str(os.getuid())}},'
      'ensure_ascii=False)+"\\n")\n', 0o755)
    w(B / 'systemctl', f'#!/bin/sh\ncase "$1" in is-active) [ -e {T}/path-ne-viden ] && {{ echo "Failed to retrieve unit state: Transport endpoint is not connected" >&2; exit 1; }}; [ -e {T}/path-pogashen ] && {{ echo inactive; exit 3; }}; echo active;; esac\nexit 0\n', 0o755)
    w(B / 'journalctl', '#!/usr/bin/python3\nimport sys\na=sys.argv\nk=a[a.index("--cursor-file")+1]\n'
      f'L=open({str(T / "logger.log")!r}).read().splitlines()\n'
      'try: n=int(open(k).read())\nexcept Exception: n=0\nprint("\\n".join(L[n:]))\nopen(k,"w").write(str(len(L)))\n', 0o755)
    E = T / 'etc'; E.mkdir(); os.chmod(E, 0o755)
    w(E / 'token', 'PODSTAVNOJ\n', 0o600); w(E / 'chat', '12345\n', 0o600)
    w(T / 'hvost', '', 0o666); w(T / 'pusto.conf', '# стенд\n', 0o644)
    SP = T / 'spul'; SP.mkdir(); os.chmod(SP, 0o755)
    gid = grp.getgrnam(GR).gr_gid
    for d, m, g in (('tmp', 0o1730, gid), ('vhod', 0o1730, gid), ('itog', 0o711, 0), ('work', 0o700, 0)):
        (SP / d).mkdir(); os.chown(SP / d, 0, g); os.chmod(SP / d, m)
    for d in ('tmp', 'vhod'):
        subprocess.run(['setfacl', '-m', 'u:varvara:wx', str(SP / d)], check=True)
    ENV = {'PATH': f'{B}:/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'HOME': '/', 'DSH_TREVOGI_CONFIG': str(T / 'pusto.conf'),
           'AGENT_ALERT_TOKEN_FILE': str(E / 'token'), 'AGENT_ALERT_CHAT_FILE': str(E / 'chat'),
           'AGENT_ALERT_HVOST': str(T / 'hvost'), 'AGENT_ALERT_SPUL': str(SP), 'AGENT_ALERT_ITOG_ZHDAT': '20',
           'AGENT_ALERT_KVOTA_10MIN': '3', 'AGENT_ALERT_KVOTA_SUTKI': '50', 'AGENT_ALERT_PAUZY': '1 1',
           'AGENT_ALERT_TAJMAUT': '2', 'AGENT_ALERT_OTPRAVKA_BIN': str(S / 'bin' / 'agent-alert'), 'DSH_PROBA': '0'}

    def klient(kto, *dovody, env=None):
        e = {k: v for k, v in {**ENV, **(env or {})}.items() if v is not None}  # None — ключ снять
        cmd = [str(S / 'bin' / 'agent-alert'), *dovody]
        if kto != 'root':
            cmd = [RUNUSER, '-u', kto, '--', '/usr/bin/env', '-i', *[f'{k}={v}' for k, v in e.items()], *cmd]
            return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={})
        return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=e)

    def demon(*dovody):
        return subprocess.run([sys.executable, '-I', '-B', str(DEM), *dovody], env=ENV, capture_output=True, text=True, timeout=120)

    def s_demonom(p, srok=30):
        """Клиент в фоне; отправитель разбирает очередь, пока клиент не закончит."""
        konec = time.monotonic() + srok
        while p.poll() is None and time.monotonic() < konec:
            demon(); time.sleep(0.2)
        try:
            out = p.communicate(timeout=5)[0]
        except subprocess.TimeoutExpired:
            p.kill(); out = p.communicate()[0]
        return p.returncode, out

    def otpravleno():
        res = []
        for s in (T / 'curl.log').read_text().splitlines():
            argv = json.loads(s)
            t = next((x[5:] for x in argv if x.startswith('text=')), None)
            res.append((t, argv))
        return res

    def sbros():
        w(T / 'curl.log', '', 0o666); w(T / 'logger.log', '', 0o666)

    def vhod_pust():
        return os.listdir(SP / 'vhod') == []

    # K1 исправное: master → доставлено с его именем, превью выключено
    sbros(); rc, out = s_demonom(klient('master', 'проба-1'))
    ot = otpravleno()
    sud('K1 master → спул → доставлено «✉ master», код 0, превью ссылок выключено, vhod пуст',
        rc == 0 and len(ot) == 1 and '✉ <b>master</b>' in ot[0][0] and 'проба-1' in ot[0][0]
        and 'disable_web_page_preview=true' in ot[0][1] and vhod_pust(), f'rc {rc} out {out[:200]!r} отправлено {ot}')
    # K2 (порча 1): учётка — от fstat, не из текста
    sbros(); rc, out = s_demonom(klient('master', 'подпись=iskra проба-2'))
    ot = otpravleno()
    sud('K2 текст «подпись=iskra», файл от master → «✉ master», не iskra',
        rc == 0 and len(ot) == 1 and '✉ <b>master</b>' in ot[0][0] and '✉ <b>iskra</b>' not in ot[0][0], f'{ot}')
    # K3 (порча 2): квота 3 за 10 мин → 3 доставлено, 2 отказа 69, одна сводка
    sbros()
    try:
        os.unlink(SP / 'work' / 'kvota.json')
    except FileNotFoundError:
        pass
    kody = [s_demonom(klient('master', f'kvota-{i}'))[0] for i in range(5)]
    ot = otpravleno()
    svodok = sum(1 for t, _ in ot if t and 'квота спула тревог' in t)
    sud('K3 квота 3/10 мин: коды [0,0,0,69,69], доставлено 3 + одна сводка',
        kody == [0, 0, 0, 69, 69] and len(ot) == 4 and svodok == 1, f'коды {kody} отправлено {len(ot)} сводок {svodok}')
    # K3б (3.1.6, порча 18): оба отказа квоты — строка журнала agent-alert от самого клиента (раньше — только под тегом
    #     agent-alert-otpravitel): «исход=отказ-отправителя учётка=master ЮНИТ=… путь=спул файл=…», код 69, без 🔴, _UID master
    zap = [json.loads(x) for x in (T / 'logger.log').read_text().splitlines()]
    otk = [z for z in zap if z['MESSAGE'].startswith('исход=отказ-отправителя учётка=master ЮНИТ=')]
    sud('K3б отказ квоты 69 ×2 — строка журнала клиента «исход=отказ-отправителя учётка=master ЮНИТ= путь=спул файл=»',
        len(otk) == 2 and all('путь=спул файл=' in z['MESSAGE'] and 'код 69' in z['MESSAGE']
                              and z['_UID'] == str(pwd.getpwnam('master').pw_uid) for z in otk),
        f'{[z["MESSAGE"][:140] for z in zap]}')
    (SP / 'work' / 'kvota.json').unlink(missing_ok=True)
    # K4 (порча 3): <a> учётки не-root — текстом; разрешённый <b> остаётся
    sbros(); rc, out = s_demonom(klient('master', '<a href="http://x.example">клик</a> и <b>жирно</b>'))
    ot = otpravleno()
    sud('K4 master: <a href> — экранирован, <b> — тег',
        rc == 0 and len(ot) == 1 and '&lt;a href' in ot[0][0] and '<a href' not in ot[0][0] and '<b>жирно</b>' in ot[0][0], f'{ot}')
    # K5 (порча 4): отправитель погашен → клиент 75 и 🔴 нет-итога; сторож — «очередь стоит» прямым путём; возврат
    sbros(); p = klient('master', 'proba-bez-demona', env={'AGENT_ALERT_ITOG_ZHDAT': '2'})
    out = p.communicate(timeout=30)[0]; rc = p.returncode
    starye = os.listdir(SP / 'vhod')
    for f in starye:
        os.utime(SP / 'vhod' / f, (time.time() - 400, time.time() - 400))
    st = demon('--storozh'); ot = otpravleno()
    log = (T / 'logger.log').read_text()
    sud('K5 отправитель стоит: клиент 75 + 🔴 нет-итога; сторож: код 1, прямым путём «очередь стоит»',
        rc == 75 and '🔴 исход=нет-итога' in log and len(starye) == 1 and st.returncode == 1
        and any(t and 'очередь стоит' in t for t, _ in ot), f'rc {rc} файлов {len(starye)} сторож {st.returncode} {st.stdout[-200:]!r} {ot}')
    demon(); sbros(); st2 = demon('--storozh'); ot2 = otpravleno(); st3 = demon('--storozh'); ot3 = otpravleno()
    sud('K5б беды ушли: одно «✅ восстановлено» (код 0), следующий прогон — тишина (код 0)',
        st2.returncode == 0 and len(ot2) == 1 and 'восстановлено' in (ot2[0][0] or '') and st3.returncode == 0
        and len(ot3) == 1 and vhod_pust(), f'{st2.returncode} {st3.returncode} {[t for t, _ in ot3]} {st3.stdout!r}')

    UID_M = pwd.getpwnam('master').pw_uid

    def zapis_zhurnala(msg, uid):
        with open(T / 'logger.log', 'a') as f:
            f.write(json.dumps({'MESSAGE': msg, '_UID': str(uid)}, ensure_ascii=False) + '\n')

    def otmetka_nazad(sek):
        om = SP / 'work' / 'storozh.otmetka.json'
        d = json.loads(om.read_text()); d['kogda'] -= sek; om.write_text(json.dumps(d))

    # K5в (LOW-1, порча 7): тот же набор бед — повтор подавлен; через 6 ч — снова
    w(T / 'path-pogashen', ''); sbros()
    sa = demon('--storozh'); na = len(otpravleno()); sb = demon('--storozh'); nb = len(otpravleno())
    otmetka_nazad(6 * 3600 + 60); sc = demon('--storozh'); nc = len(otpravleno())
    sud('K5в тот же набор {path}: 1-й прогон шлёт, 2-й — нет (код 1 оба), через 6 ч — снова',
        (sa.returncode, sb.returncode, sc.returncode) == (1, 1, 1) and (na, nb, nc) == (1, 1, 2),
        f'коды {(sa.returncode, sb.returncode, sc.returncode)} отправлено {(na, nb, nc)} {sb.stdout[-200:]!r}')
    # K5г (LOW-1, порча 9): смена набора — сразу; затем «восстановлено» одно
    zapis_zhurnala('🔴 исход=нет-пути учётка=master токен не читается', UID_M)
    (SP / 'work' / 'storozh.kursor').unlink(missing_ok=True); w(T / 'curl.log', '', 0o666)
    sd = demon('--storozh'); otd = otpravleno()
    os.unlink(T / 'path-pogashen')
    se = demon('--storozh'); ote = otpravleno(); sf = demon('--storozh'); otf = otpravleno()
    sud('K5г набор {path}→{path,zhurnal}: шлёт сразу; беды ушли — одно «восстановлено», затем тишина',
        sd.returncode == 1 and len(otd) == 1 and 'master без пути/итога' in (otd[0][0] or '')
        and se.returncode == 0 and len(ote) == 2 and 'восстановлено' in (ote[1][0] or '') and sf.returncode == 0 and len(otf) == 2,
        f'{sd.returncode} {se.returncode} {sf.returncode} {[t for t, _ in otf]}')
    # K5д (порча 10): тревога сторожа не доставлена — отметки нет, следующий прогон шлёт снова
    w(T / 'path-pogashen', ''); w(T / 'curl-padaet', ''); sbros()
    sg = demon('--storozh'); ng = len(otpravleno())
    os.unlink(T / 'curl-padaet'); sh = demon('--storozh'); nh = len(otpravleno())
    os.unlink(T / 'path-pogashen'); demon('--storozh')
    # K5е (LOW 02:54, порча 11): ключ беды журнала — по учётке: два разных отправителя подряд — две тревоги;
    #     тот же снова — подавлен
    sbros(); (SP / 'work' / 'storozh.kursor').unlink(missing_ok=True)

    def otkaz_v_zhurnal(u, uid=None):
        zapis_zhurnala(f'🔴 исход=нет-итога учётка={u} файл=x.msg — отправитель спула не ответил',
                       pwd.getpwnam(u).pw_uid if uid is None else uid)
        r = demon('--storozh'); return r.returncode, len(otpravleno()), r.stdout
    ra, rb, rc_ = (otkaz_v_zhurnal(u)[:2] for u in ('master', 'varvara', 'varvara'))
    ote = [t for t, _ in otpravleno()]
    rz = demon('--storozh'); otz = [t for t, _ in otpravleno()]
    sud('K5ж после тревоги о журнале новых отказов нет → одно «восстановлено» (код 0): доставка тревоги сторожа '
        'не читается им как отказ', rz.returncode == 0 and len(otz) == 3 and 'восстановлено' in (otz[2] or ''),
        f'{rz.returncode} {otz[2:]} {rz.stdout[-300:]!r}')
    sud('K5е журнал: master → тревога, varvara следом → вторая тревога, varvara снова → подавлена (коды 1)',
        (ra, rb, rc_) == ((1, 1), (1, 2), (1, 2)) and 'отправитель master' in (ote[0] or '') and 'отправитель varvara' in (ote[1] or ''),
        f'{(ra, rb, rc_)} {ote}')
    # K5з (LOW 03:08, порча 13): строка отказа под чужим именем (uid master, «учётка=varvara») — не считается,
    #     в выводе сторожа «чужой uid»; тревоги нет
    sbros(); (SP / 'work' / 'storozh.kursor').unlink(missing_ok=True)
    kz, nz, oz = otkaz_v_zhurnal('varvara', UID_M)
    sud('K5з подлог: «учётка=varvara» записана uid master → не считается, «чужой uid» в выводе, тревоги нет (код 0)',
        kz == 0 and nz == 0 and 'чужой uid' in oz, f'{kz} {nz} {oz[-300:]!r}')
    # K5и (порча 14): имя не разрешается — верим только uid из диапазона DynamicUser (61184–65519)
    ki, ni, oi = otkaz_v_zhurnal('net-takoj-uchetki', UID_M)
    kd, nd, od = otkaz_v_zhurnal('dyn-proba', 61200)
    demon('--storozh')
    sud('K5и неразрешимое имя: от uid master — не считается; от uid 61200 (DynamicUser) — тревога',
        (ki, ni) == (0, 0) and 'чужой uid' in oi and (kd, nd) == (1, 1) and 'отправитель dyn-proba' in (otpravleno()[0][0] or ''),
        f'{(ki, ni)} {(kd, nd)} {od[-200:]!r}')
    sud('K5д недоставленная тревога сторожа не ставит отметку: следующий прогон шлёт',
        sg.returncode == 1 and ng == 0 and sh.returncode == 1 and nh == 1, f'{sg.returncode} {ng} {sh.returncode} {nh} {sg.stdout[-300:]!r}')
    # K6 (порча 5): учётка без пути (вне группы, без ACL) → 1 и 🔴 нет-пути, во vhod ничего
    sbros(); rc, out = s_demonom(klient('nobody', 'bez-puti'))
    log = (T / 'logger.log').read_text()
    sud('K6 nobody (вне группы): код 1, 🔴 «исход=нет-пути» в журнале, не доставлено',
        rc == 1 and '🔴 исход=нет-пути' in log and otpravleno() == [] and vhod_pust(), f'rc {rc} {out[:150]!r} журнал {log[:150]!r}')
    # K7 (порча 6): ссылки во vhod/ на чужой файл — отказ без чтения
    METKA = f'METKA-{os.getpid()}'
    w(T / 'sekret', f'format=plain\nistochnik=\n\n{METKA}\n', 0o600)
    w(T / 'svoj', 'format=plain\nistochnik=\n\nsvoj\n', 0o644); os.chown(T / 'svoj', pwd.getpwnam('master').pw_uid, -1)
    sbros()
    subprocess.run([RUNUSER, '-u', 'master', '--', 'ln', '-s', str(T / 'sekret'), str(SP / 'vhod' / 'sim.msg')], check=True)
    subprocess.run([RUNUSER, '-u', 'master', '--', 'ln', str(T / 'svoj'), str(SP / 'vhod' / 'zhest.msg')])
    vneseno = sorted(os.listdir(SP / 'vhod'))
    demon(); ot = otpravleno()
    itogi = {}
    for b in ('sim', 'zhest'):
        try:
            itogi[b] = (SP / 'itog' / b).read_text().split('\n')[0]
        except OSError:
            itogi[b] = 'нет'
    sud('K7 символьная ссылка на файл root и жёсткая ссылка: метки нет в отправленном, итоги 65',
        not any(t and METKA in t for t, _ in ot) and itogi.get('sim') == '65' and vhod_pust(),
        f'внесено {vneseno} итоги {itogi} отправлено {[t for t, _ in ot]}')
    # K8 неизвестное значение ключа пробы → 2, ничего не отправлено
    sbros(); rc, out = s_demonom(klient('master', 'klyuch', env={'AGENT_ALERT_CHEREZ_SPUL': '2'}))
    sud('K8 AGENT_ALERT_CHEREZ_SPUL=2 → код 2, не отправлено', rc == 2 and otpravleno() == [], f'rc {rc} {out[:150]!r}')
    # K9 varvara (ACL) → доставлено с её именем
    sbros(); rc, out = s_demonom(klient('varvara', 'proba-varvara'))
    ot = otpravleno()
    sud('K9 varvara по ACL → «✉ varvara», код 0', rc == 0 and len(ot) == 1 and '✉ <b>varvara</b>' in ot[0][0], f'rc {rc} {ot}')
    # K10 root без ключа — прямой путь; root с ключом — спул, <a> не фильтруется (root доверен)
    sbros(); rc, out = s_demonom(klient('root', 'root-pryamo'))
    ot = otpravleno()
    sud('K10 root без ключа — прямой путь: без «✉», спул не тронут', rc == 0 and len(ot) == 1 and '✉' not in ot[0][0], f'{ot}')
    sbros(); rc, out = s_demonom(klient('root', '<a href="http://x.example">r</a>', env={'AGENT_ALERT_CHEREZ_SPUL': '1'}))
    ot = otpravleno()
    sud('K10б root с ключом → спул, «✉ root», <a> сохранён', rc == 0 and len(ot) == 1 and '✉ <b>root</b>' in ot[0][0]
        and '<a href' in ot[0][0], f'{ot}')
    # K11б (окно 15.10, порча 16): проба настройки не оставляет .chk во vhod/ — без запуска отправителя
    sbros(); pb = klient('master', '--proverit-nastrojku'); ob = pb.communicate(timeout=30)[0]
    ostalos = os.listdir(SP / 'vhod')
    sud('K11б proverit от master: код 0, во vhod/ после него пусто (отправитель НЕ запускался)',
        pb.returncode == 0 and ostalos == [], f'{pb.returncode} vhod {ostalos} {ob[-150:]!r}')
    demon()
    # K11в (3.1.4, порча 17): systemctl из песочницы не отвечает (DynamicUser: «Transport endpoint is not connected», код 1,
    #     stdout пуст) — проба говорит «НЕ ВИДНО», код 0, а не «не взведён»
    w(T / 'path-ne-viden', ''); pn_ = klient('master', '--proverit-nastrojku'); on_ = pn_.communicate(timeout=30)[0]
    os.unlink(T / 'path-ne-viden'); demon()
    sud('K11в systemctl без ответа: proverit код 0, «ОТСЮДА НЕ ВИДНО» с причиной, не «не взведён»',
        pn_.returncode == 0 and 'НЕ ВИДНО' in on_ and 'Transport endpoint' in on_ and 'не взведён' not in on_,
        f'{pn_.returncode} {on_[-250:]!r}')
    # K11 --proverit-nastrojku: master (без токена) — клиентский путь годен; nobody — 2; varvara с ключом — годен;
    #     path-юнит погашен — 2; .chk пробы не доставляется
    sbros()
    pm = klient('master', '--proverit-nastrojku'); om = pm.communicate(timeout=30)[0]
    pn = klient('nobody', '--proverit-nastrojku'); on = pn.communicate(timeout=30)[0]
    pv = klient('varvara', '--proverit-nastrojku', env={'AGENT_ALERT_CHEREZ_SPUL': '1'}); ov = pv.communicate(timeout=30)[0]
    w(T / 'path-pogashen', ''); pg = klient('master', '--proverit-nastrojku'); og = pg.communicate(timeout=30)[0]
    os.unlink(T / 'path-pogashen')
    demon()
    sud('K11 proverit: master 0 «КЛИЕНТСКИЙ ПУТЬ ГОДЕН», nobody 2, varvara+ключ 0, path погашен 2; пробы .chk не отправлены',
        pm.returncode == 0 and 'КЛИЕНТСКИЙ ПУТЬ ГОДЕН' in om and pn.returncode == 2 and 'спул' in on
        and pv.returncode == 0 and pg.returncode == 2 and 'не взведён' in og and otpravleno() == [] and vhod_pust(),
        f'master {pm.returncode} {om[-120:]!r} nobody {pn.returncode} {on[-120:]!r} varvara {pv.returncode} {ov[-100:]!r} '
        f'погашен {pg.returncode} {og[-100:]!r}')
    # K12 недопустимое имя во vhod — убрано без чтения, очередь пуста
    sbros()
    subprocess.run([RUNUSER, '-u', 'master', '--', 'sh', '-c', f'printf "format=plain\\nistochnik=\\n\\nx\\n" > "{SP}/vhod/plohoe imya.msg"'])
    demon()
    sud('K12 имя с пробелом во vhod/ → убрано без отправки, vhod пуст', otpravleno() == [] and vhod_pust(), f'{os.listdir(SP / "vhod")}')
    # K13 (LOW-2, порча 8): оборванный разбор — *.msg в work/ старше 1 ч → итог 75 «прерван» владельцу, файл убран;
    #     свежий (10 мин) не тронут
    sbros(); uid_m = pwd.getpwnam('master').pw_uid
    for b, vozrast in (('staryj-1', 7200), ('svezhij-1', 600)):
        f = SP / 'work' / f'{b}.msg'
        w(f, 'format=plain\nistochnik=\n\nx\n', 0o600); os.chown(f, uid_m, -1)
        os.utime(f, (time.time() - vozrast, time.time() - vozrast))
    demon()
    try:
        it = (SP / 'itog' / 'staryj-1').read_text().split('\n'); it_uid = (SP / 'itog' / 'staryj-1').stat().st_uid
    except OSError:
        it, it_uid = ['нет'], -1
    sud('K13 work/*.msg старше 1 ч: итог 75 «прерван» (владелец master), файл убран; свежий не тронут, без итога',
        it[0] == '75' and 'прерван' in it[1] and it_uid == uid_m and not (SP / 'work' / 'staryj-1.msg').exists()
        and (SP / 'work' / 'svezhij-1.msg').exists() and not (SP / 'itog' / 'svezhij-1').exists() and otpravleno() == [],
        f'итог {it} uid {it_uid} work {sorted(os.listdir(SP / "work"))}')
    # K14 (3.1.6, порча 18): итог не читается (на его месте каталог) — клиент 1, строка «исход=итог-не-читается»
    sbros(); p = klient('master', 'proba-itog', env={'AGENT_ALERT_ITOG_ZHDAT': '15'})
    imya, konec = None, time.monotonic() + 10
    while imya is None and time.monotonic() < konec:
        imya = next((f[:-4] for f in os.listdir(SP / 'vhod') if f.endswith('.msg')), None); time.sleep(0.05)
    if imya:
        os.mkdir(SP / 'itog' / imya)
    out = p.communicate(timeout=30)[0]; rc = p.returncode
    if imya:
        os.rmdir(SP / 'itog' / imya); (SP / 'vhod' / f'{imya}.msg').unlink(missing_ok=True)
    zap = [json.loads(x) for x in (T / 'logger.log').read_text().splitlines()]
    stroki = [z['MESSAGE'] for z in zap if z['MESSAGE'].startswith('исход=итог-не-читается учётка=master ЮНИТ=')]
    sud('K14 итог не читается: клиент 1, «не читается» в выводе, строка «исход=итог-не-читается … файл=<имя>.msg»',
        imya is not None and rc == 1 and 'не читается' in out and len(stroki) == 1 and f'путь=спул файл={imya}.msg' in stroki[0],
        f'имя {imya} rc {rc} out {out[:160]!r} журнал {[z["MESSAGE"][:120] for z in zap]}')
    # K14б (порча 19): сторож очереди строку отказа клиента за беду «без пути/итога» не берёт (без 🔴 — не его образец)
    (SP / 'work' / 'storozh.kursor').unlink(missing_ok=True); w(T / 'curl.log', '', 0o666)
    st = demon('--storozh'); ot = otpravleno()
    sud('K14б сторож: строка «исход=итог-не-читается» не беда — тревоги «без пути/итога» нет',
        len(stroki) == 1 and not any(t and 'без пути/итога' in t for t, _ in ot), f'rc {st.returncode} отправлено {[t[:160] for t, _ in ot]}')
    # K15 (3.1.8, порча 21): хвост, заданный окружением учётки, — строка «исход=доставлено(спул)» с текстом; хвост
    #     root-отправителя (общий) получает свою строку как прежде
    #     (учёт квоты сброшен: пробы выше съели 3/10 мин учётки master)
    sbros(); (SP / 'work' / 'kvota.json').unlink(missing_ok=True); HM, HK = T / 'hvost-master', T / 'hvost-konfig'
    w(HM, '', 0o600); os.chown(HM, pwd.getpwnam('master').pw_uid, -1); w(HK, '', 0o666)
    w(T / 'hvost-konfig.conf', f'AGENT_ALERT_HVOST={HK}\n', 0o644)
    obshchij_do = len((T / 'hvost').read_text().splitlines())
    rc, out = s_demonom(klient('master', 'proba-hvost-k15', env={'AGENT_ALERT_HVOST': str(HM)}))
    hm = HM.read_text().splitlines()
    sud('K15 хвост из окружения: одна строка «исход=доставлено(спул)» с текстом пробы; общий хвост +1 (root)',
        rc == 0 and len(hm) == 1 and 'исход=доставлено(спул) format=html' in hm[0] and hm[0].endswith('текст=proba-hvost-k15')
        and len((T / 'hvost').read_text().splitlines()) == obshchij_do + 1,
        f'rc {rc} хвост {hm} общий {len((T / "hvost").read_text().splitlines()) - obshchij_do} out {out[:120]!r}')
    # K15б (порча 20): хвост не из окружения, а из config — клиент его не пишет (его пишет root-отправитель)
    sbros(); hm_do = len(HM.read_text().splitlines())
    rc, out = s_demonom(klient('master', 'proba-hvost-k15b',
                               env={'AGENT_ALERT_HVOST': None, 'DSH_TREVOGI_CONFIG': str(T / 'hvost-konfig.conf')}))
    sud('K15б хвост только из config: клиент его не пишет (0 строк), доставлено, свой хвост не тронут',
        rc == 0 and HK.read_text() == '' and len(HM.read_text().splitlines()) == hm_do and len(otpravleno()) == 1,
        f'rc {rc} config-хвост {HK.read_text()[:160]!r} свой {HM.read_text().splitlines()} out {out[:120]!r}')
    # K15в (порча 21): отправитель не разбирает — итога нет, клиент 75; в хвосте «не-доставлено(спул,код-75)»
    sbros(); hm_do = len(HM.read_text().splitlines())
    p = klient('master', 'proba-hvost-k15v', env={'AGENT_ALERT_HVOST': str(HM), 'AGENT_ALERT_ITOG_ZHDAT': '2'})
    out = p.communicate(timeout=30)[0]; rc = p.returncode
    for f in os.listdir(SP / 'vhod'):
        (SP / 'vhod' / f).unlink()
    hm = HM.read_text().splitlines()
    sud('K15в без итога: клиент 75, в хвосте «не-доставлено(спул,код-75)» с текстом, ничего не отправлено',
        rc == 75 and len(hm) == hm_do + 1 and 'исход=не-доставлено(спул,код-75)' in hm[-1] and hm[-1].endswith('текст=proba-hvost-k15v')
        and otpravleno() == [], f'rc {rc} хвост {hm} out {out[:160]!r}')
finally:
    shutil.rmtree(T, ignore_errors=True)

ZHDYOM = 30
print(f'\nитог: {ok} из {ok + fail}' + (f' (порча {PORCHA})' if PORCHA else ''))
if ok + fail != ZHDYOM:
    print(f'🔴 КАНАРЕЙКА: проб {ok + fail}, ждём {ZHDYOM}'); sys.exit(2)
sys.exit(1 if fail else 0)
