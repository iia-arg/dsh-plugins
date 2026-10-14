#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд «управление конфигом без перевыпуска» dsh-limity 1.0.4 r4 (B-N-1776; слово владельца 07.10 22:12 МСК).
Сети нет: SDK — заглушка fixtures/fake-sdk-usage.mjs, CLI входа — подставной скрипт (пишет вход в каталог, отмечает logout).
От root: замер через setpriv к ПОДСТАВНЫМ учёткам limity-zamer-st<pid>-p1…p4, вход — …-v5, хозяева файлов шлюза — …-g1/-g2,
группа входа — …-gr (B-N-1935: стенд сам создаёт их useradd/groupadd и снимает на выходе — finally, atexit, SIGTERM/SIGINT/SIGHUP;
пакету подаётся тот же непустой префикс, и вне него он ни учётку, ни группу не тронет). Живые nobody/daemon/bin/sys/lp/mail стенд
не трогает никогда. Префикс не вида limity-zamer-st<pid>- (в т.ч. пустой) — ОТКАЗ код 2 ДО любого вызова. Код пакета НЕ меняется
между пробами — меняется только конфиг (суммы кода сверяются до и после).
Пробы: proverit годный/негодный · негодный конфиг ⇒ служба и исполнитель в СЛЕПОТЕ · 4-я подписка + выключенная 2-я ⇒ замеры,
выдача, порядок и подписи меняются · возврат конфига ⇒ выдача возвращается · подписка шлюза — по token_shlyuza (известный путь
принят, неизвестный и у выключенной — отказ) · vojti: пустая организация ⇒ отказ ДО входа (CLI не звался, учётка не создана, конфиг цел);
чужая организация ⇒ вход снят, конфиг цел · snyat ⇒ logout и vkl=false · неизвестное действие/--dry-run ⇒ отказ, ничего не тронуто.
ЧЕГО НЕ ЛОВИТ: настоящий auth login (ссылка, код) · создание учётки useradd командой vojti (учётки заводит сам стенд) ·
SIGKILL стенда — подставные учётки останутся, искать: getent passwd | grep '^limity-zamer-st' (снять userdel/groupdel по имени) ·
страницу lim.insmat.ru: её ключи зашиты в её коде (CHEI/PORYADOK) — рисовальщик стенда лишь не должен падать на новой выдаче."""
# ZHIVAYA-MASHINA: useradd/groupadd/usermod/userdel/groupdel — пишет живые /etc/passwd, group, shadow, gshadow (подставные учётки с префиксом, снимаются на выходе)
import sys   # B-N-1929/B-N-1935 (условие Вениамина 11:1xZ): ключ --zhivaya-mashina — ПЕРВЫМ действием; без него (или с иным доводом) ОТКАЗ код 2, ничего не вызвано
if sys.argv[1:] != ['--zhivaya-mashina']:
    print('ОТКАЗ-ZHIVAYA-MASHINA: заводит и снимает учётки и группы (живые /etc/passwd, group, shadow, gshadow) — нужен ровно один довод --zhivaya-mashina. Ничего не тронуто.'); sys.exit(2)
import hashlib, json, os, pwd, shutil, sqlite3, subprocess, sys, tempfile, time
from pathlib import Path
import atexit, re, signal

PREFIKS = f'limity-zamer-st{os.getpid()}-'   # B-N-1935: подставные учётки и группа — только с этим началом; пакету подаётся он же
if not re.fullmatch(r'limity-zamer-st\d+-', PREFIKS):
    print(f'ОТКАЗ: префикс подставных учёток «{PREFIKS}» не вида limity-zamer-st<pid>- — живые учётки не трону; ничего не создано и не вызвано'); sys.exit(2)

ZDES = Path(__file__).resolve().parent.parent; TEST = Path(__file__).resolve().parent
SLUZHBA = Path(os.environ.get('DSH_LIMITY_TEST', ZDES / 'sbin/dsh-limity')); OBERTKA = Path(os.environ.get('DSH_LIMITY_ZAMER_TEST', ZDES / 'libexec/dsh-limity-zamer'))
KOMANDA = ZDES / 'sbin/dsh-limity-podpiski'
KOD = [SLUZHBA, OBERTKA, KOMANDA, ZDES / 'libexec/dsh-limity-zamer.mjs', ZDES / 'lib/dsh_limity_konfig.py']
if os.geteuid() != 0: print('СЛЕПОТА: стенд конфига требует root'); sys.exit(2)
for f in KOD:
    if not f.is_file(): print('СЛЕПОТА: нет', f); sys.exit(2)
summy = lambda: {f.name: hashlib.sha256(f.read_bytes()).hexdigest()[:8] for f in KOD}
SUMMY0 = summy()
import grp
def gruppa_zhivaya():   # r10: стенд не должен менять живую группу (19:54Z мой стенд добавил в неё nobody)
    try: return sorted(grp.getgrnam('limity-vhod').gr_mem)
    except KeyError: return None
GRUPPA0 = gruppa_zhivaya()
ZHIVYE = ('nobody', 'daemon', 'bin', 'sys', 'lp', 'mail')   # B-N-1935: прежние учётки стенда — теперь только сверяются, что не тронуты
def zhivye_snimok(): return {u: (tuple(pwd.getpwnam(u)), sorted(g.gr_name for g in grp.getgrall() if u in g.gr_mem)) for u in ZHIVYE}
ZHIVYE0 = zhivye_snimok()
GRUPPA_ST = PREFIKS + 'gr'
def ubrat():   # снять ВСЕ учётки и группы с префиксом этого прогона; вернуть, что осталось
    if not re.fullmatch(r'limity-zamer-st\d+-', PREFIKS): return ['префикс испорчен — уборку не делаю']
    for u in [x.pw_name for x in pwd.getpwall() if x.pw_name.startswith(PREFIKS)]: subprocess.run(['userdel', u], capture_output=True)
    for g in [x.gr_name for x in grp.getgrall() if x.gr_name.startswith(PREFIKS)]: subprocess.run(['groupdel', g], capture_output=True)
    return [x.pw_name for x in pwd.getpwall() if x.pw_name.startswith(PREFIKS)] + [x.gr_name for x in grp.getgrall() if x.gr_name.startswith(PREFIKS)]
atexit.register(ubrat)
PRERVAN = []
def prervat(n, f): PRERVAN.append(signal.Signals(n).name); sys.exit(128 + n)   # → finally и atexit
for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP): signal.signal(sig, prervat)
def zavesti(u):
    p = subprocess.run(['useradd', '--system', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', '--user-group', u], capture_output=True, text=True)
    if p.returncode != 0: print(f'СЛЕПОТА: useradd {u} — код {p.returncode}: {p.stderr.strip()[:200]}'); sys.exit(2)
p = subprocess.run(['groupadd', '--system', GRUPPA_ST], capture_output=True, text=True)
if p.returncode != 0: print(f'СЛЕПОТА: groupadd {GRUPPA_ST} — код {p.returncode}: {p.stderr.strip()[:200]}'); sys.exit(2)
for u in ('p1', 'p2', 'p3', 'p4', 'v5', 'g1', 'g2'): zavesti(PREFIKS + u)
r = Path(tempfile.mkdtemp(prefix='stend-konfig-')); r.chmod(0o755)
for d in ('vhod', 'sdk', 'vydacha', 'inst', 'kat', 'etc'): (r / d).mkdir()
(r / 'vhod').chmod(0o777); (r / 'sdk').chmod(0o777); (r / 'kat').chmod(0o755)
shutil.copy(TEST / 'fixtures/fake-sdk-usage.mjs', r / 'sdk'); shutil.copy(TEST / 'fixtures/usage-r5-p1.json', r / 'sdk'); shutil.copy(ZDES / 'libexec/dsh-limity-zamer.mjs', r / 'zamer.mjs')
for f in (r / 'sdk/fake-sdk-usage.mjs', r / 'sdk/usage-r5-p1.json', r / 'zamer.mjs'): f.chmod(0o644)
(r / 'sdk/zapis.log').touch(); (r / 'sdk/zapis.log').chmod(0o666)
UCH = {n: f'{PREFIKS}p{n}' for n in (1, 2, 3, 4)}; ORG = {n: f'org-{n}-aaaa' for n in range(1, 6)}
def vhod_v_katalog(n, kat=None):
    k = kat or r / 'kat' / f'p{n}'; k.mkdir(exist_ok=True); pw = pwd.getpwnam(UCH[n])
    (k / '.credentials.json').write_text(json.dumps({'claudeAiOauth': {'accessToken': 'stend-FAKE-OK-KR=40-WA=normal-0123456789abcdef',
                                                                      'refreshTokenExpiresAt': int((time.time() + 30 * 86400) * 1000)}}))
    (k / '.claude.json').write_text(json.dumps({'oauthAccount': {'organizationUuid': ORG[n]}}))
    for f in (k, k / '.credentials.json', k / '.claude.json'): os.chown(f, pw.pw_uid, pw.pw_gid)
    k.chmod(0o700)
for n in (1, 2, 3, 4): vhod_v_katalog(n)
(r / 'tok').mkdir()   # r11: настоящие файлы токенов и подставной реестр — сверка токенов (Вениамин 19:13Z п.3)
for n in range(1, 6): (r / 'tok' / f'token-{n}').write_text('токен стенда\n')
(r / 'reestr.yaml').write_text('mashina:\n  sekrety_segodnya:\n' + ''.join(f'    {r / "tok" / f"token-{n}"}: stend/token-{n}\n' for n in range(1, 6)))
def claude(n, kluch, podpis, poryadok, **dop):
    return dict({'provajder': 'claude', 'nomer': n, 'kluch': kluch, 'podpis': podpis, 'poryadok': poryadok, 'organizaciya': ORG[n],
                 'zamer': UCH[n], 'zamer_katalog': str(r / 'kat' / f'p{n}'), 'token_shlyuza': str(r / 'tok' / f'token-{n}')}, **dop)
BAZOVYJ = [claude(1, 'podpiska-1', 'Клод-1', 0), claude(2, 'podpiska-2', 'Клод-2', 1), claude(3, 'podpiska-5', 'Клод-3', 2),
           {'provajder': 'codex', 'nomer': 3, 'kluch': 'podpiska-3', 'podpis': 'Кодекс-1', 'poryadok': 3}]
KONF = r / 'etc/podpiski.json'
def konfig(spisok): KONF.write_text(json.dumps(spisok, ensure_ascii=False))
konfig(BAZOVYJ)
(r / 'cli.sh').write_text(f'''#!/bin/bash
# подставной CLI входа: auth login — пишет вход (организация из {r}/cli-org), auth logout — снимает; всё отмечает в {r}/cli.log
echo "$*" >> {r}/cli.log
if [ "$1 $2" = "auth login" ]; then
  echo '{{"claudeAiOauth":{{"accessToken":"stend-FAKE-OK-0123456789abcdef"}}}}' > "$CLAUDE_CONFIG_DIR/.credentials.json"
  echo "{{\\"oauthAccount\\":{{\\"organizationUuid\\":\\"$(cat {r}/cli-org)\\",\\"emailAddress\\":\\"vladelec@example.org\\",\\"organizationName\\":\\"Org\\"}}}}" > "$CLAUDE_CONFIG_DIR/.claude.json"
  echo "https://claude.ai/oauth/authorize?stend"; exit 0
fi
[ "$1 $2" = "auth logout" ] && rm -f "$CLAUDE_CONFIG_DIR/.credentials.json"
exit 0
''')
(r / 'cli.sh').chmod(0o755); (r / 'cli.log').touch(); (r / 'cli.log').chmod(0o666)
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'), DSH_LIMITY_PODPISKI=str(KONF),
           DSH_LIMITY_VYDACHA=str(r / 'vydacha/limity.json'), DSH_LIMITY_CODEX_SOST=str(r / 'net.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'),
           DSH_LIMITY_ZAMER_SOST=str(r / 'sost.json'), DSH_LIMITY_ZAMER_MJS=str(r / 'zamer.mjs'), DSH_LIMITY_ZAMER_SDK=str(r / 'sdk/fake-sdk-usage.mjs'),
           DSH_LIMITY_ZAMER_ALERT='/bin/true', ENABLE_CLAUDEAI_MCP_SERVERS='false', DSH_LIMITY_CLI=str(r / 'cli.sh'),
           DSH_LIMITY_ZAMER_KOREN=str(r / 'kat') + '/', DSH_LIMITY_ZAMER_PREFIKS=PREFIKS, SUDO_USER='proverka', DSH_LIMITY_REESTR=str(r / 'reestr.yaml'),
           DSH_LIMITY_VHOD_GRUPPA=GRUPPA_ST, DSH_LIMITY_SYSTEMD_DIR=str(r / 'systemd'), DSH_LIMITY_DAEMON_RELOAD='/bin/true')   # r10: живые группа и юниты НЕ трогаются   # r7: кто подтвердил — в коммит
(r / 'alert.sh').write_text(f'#!/bin/bash\necho "$1" >> {r}/alerts.log\n'); (r / 'alert.sh').chmod(0o755)
def trevogi(): f = r / 'alerts.log'; return f.read_text().splitlines() if f.exists() else []
def trevogi_konfig(): return [x for x in trevogi() if 'НЕГОДЕН' in x or 'снова годен' in x]   # r16: на 1.0.7 в тот же проход звучат и пороги окон Авроры
def git(*a): return subprocess.run(['git', '-C', str(r / 'etc'), '-c', 'user.name=stend', '-c', 'user.email=stend@stend', *a], capture_output=True, text=True)
def zafiksirovat(): git('add', '-A'); git('commit', '-q', '-m', 'стенд')
proshlo = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '| вывод:', str(vyvod)[-700:].replace('\n', ' ⏎ '))
def zvat_tty(predmet, *dovody, vvod=''):   # r15: ответ человека — через настоящий псевдотерминал (stdin — tty), без обхода проверки
    import pty; master, slave = pty.openpty(); os.write(master, vvod.encode())
    try: p = subprocess.run([sys.executable, '-B', str(predmet), *dovody], env=ENV, stdin=slave, capture_output=True, text=True, timeout=300)
    finally: os.close(slave); os.close(master)
    p.v = p.stdout + p.stderr; return p
def zvat(predmet, *dovody, vvod=''):
    p = subprocess.run([sys.executable, '-B', str(predmet), *dovody], env=ENV, input=vvod, capture_output=True, text=True, timeout=300)
    p.v = p.stdout + p.stderr; return p
def vydacha(): return json.loads((r / 'vydacha/limity.json').read_text())
def zamery(): return [json.loads(l) for l in (r / 'sdk/zapis.log').read_text().splitlines()]
def sbros_popytok():
    f = r / 'sost.json'
    if f.exists(): s = json.loads(f.read_text()); [v.update(popytki=[]) for v in s.values()]; f.write_text(json.dumps(s))
    with sqlite3.connect(r / 'limity.db') as c: c.execute('UPDATE zamer SET moment_utc = moment_utc - 7200')
def stranica():
    p = subprocess.run(['node', str(TEST / 'risuj-stranicu.js'), str(TEST / 'stranica-lim-insmat.html'), str(r / 'vydacha/limity.json')],
                       capture_output=True, text=True, timeout=30); return p
try:
    p = zvat(KOMANDA, 'proverit')
    proba('proverit: годный конфиг → код 0, «подписок 4, включено 4»', p.returncode == 0 and 'подписок 4, включено 4' in p.v, p.v)
    plohoj = BAZOVYJ + [dict(BAZOVYJ[0], kluch='podpiska-9'), dict(BAZOVYJ[1], kluch='podpiska-8', nomer=8, vkljuchena=True)]
    konfig(plohoj); p = zvat(KOMANDA, 'proverit')
    proba('proverit: дубль номера и неизвестное поле «vkljuchena» → код 2, обе ошибки названы', p.returncode == 2 and 'claude 1 уже есть' in p.v and 'vkljuchena' in p.v, p.v)
    pz = zvat(OBERTKA); ps = zvat(SLUZHBA)
    proba('негодный конфиг → исполнитель СЛЕПОТА (код 2, 0 замеров), служба СЛЕПОТА «конфиг:», выдачи нет',
          pz.returncode == 2 and 'СЛЕПОТА: конфиг:' in pz.v and not (r / 'sdk/zapis.log').read_text() and 'СЛЕПОТА: конфиг:' in ps.v
          and not (r / 'vydacha/limity.json').exists(), pz.v + ps.v)
    konfig(BAZOVYJ); zvat(OBERTKA); p = zvat(SLUZHBA); d = vydacha()
    proba('базовый конфиг: замеры 1, 2, 3; выдача в порядке конфига с podpis/poryadok, codex на месте',
          sorted(x['uid'] for x in zamery()) == sorted(pwd.getpwnam(UCH[n]).pw_uid for n in (1, 2, 3))
          and d['poryadok'] == ['podpiska-1', 'podpiska-2', 'podpiska-5', 'podpiska-3'] and d['podpiski']['podpiska-5']['podpis'] == 'Клод-3'
          and d['podpiski']['podpiska-2']['vyklyuchena'] is False, p.v + json.dumps(d.get('poryadok')))
    # 4-я подписка + выключенная 2-я: ТОЛЬКО конфиг
    n0 = len(zamery())
    konfig([BAZOVYJ[0], dict(BAZOVYJ[1], vkl=False), claude(4, 'podpiska-6', 'Клод-4 (новая)', 0), BAZOVYJ[2], BAZOVYJ[3]])
    sbros_popytok(); zvat(OBERTKA); p = zvat(SLUZHBA); d = vydacha(); nz = zamery()[n0:]
    p6, p2 = d['podpiski']['podpiska-6'], d['podpiski']['podpiska-2']
    proba('4-я подписка + выключенная 2-я (только конфиг): замеры 1, 3, 4 — по 2 НЕТ; выдача: podpiska-6 «Клод-4 (новая)» с окнами на 2-м месте, '
          'podpiska-2 «выключена» с zhdyom, не пропала',
          sorted(x['uid'] for x in nz) == sorted(pwd.getpwnam(UCH[n]).pw_uid for n in (1, 3, 4))
          and d['poryadok'][:2] == ['podpiska-1', 'podpiska-6'] and p6['podpis'] == 'Клод-4 (новая)' and (p6['nedelya'] or {}).get('izrashodovano_dolya') == 1.0
          and p2['vyklyuchena'] is True and 'выключена в конфиге' in p2['zhdyom'] and p2['nedelya'] is None, p.v + json.dumps(d, ensure_ascii=False)[:800])
    zhivaya = Path(os.environ.get('DSH_LIMITY_STRANICA_ZHIVAYA', '/nonexistent'))   # 1.0.9: снимок живой страницы — ВНЕ пакета
    if not zhivaya.is_file(): print('  · ПРОПУЩЕНО (не проба): снимок живой страницы не подан (DSH_LIMITY_STRANICA_ZHIVAYA) — цепь до живой страницы НЕ проверена')
    else:
        sz = subprocess.run(['node', str(TEST / 'risuj-stranicu.js'), str(zhivaya), str(r / 'vydacha/limity.json')],
                            capture_output=True, text=True, timeout=30)
        k2 = next((l for l in sz.stdout.splitlines() if 'Клод-2' in l), '(карточки Клод-2 нет)')
        print('  · ЖИВАЯ страница, карточка выключенной 2-й (поля vyklyuchena/zhdyom страница не читает — для Михалыча):', k2[:200])
        proba('ЦЕПЬ (+4-я, −2-я) до ЖИВОЙ страницы: исполнитель → приёмная → выдача → страница: карточка «Клод-4 (новая)» есть',
              sz.returncode == 0 and 'Клод-4 (новая)' in sz.stdout, sz.stdout[-500:] + sz.stderr[-300:])
    s = stranica()
    proba('страница (рисовальщик стенда) на новой выдаче не падает; Клод-1 есть', s.returncode == 0 and ' Клод-1' in s.stdout, s.stdout[-400:] + s.stderr[-300:])
    konfig(BAZOVYJ); sbros_popytok(); zvat(OBERTKA); zvat(SLUZHBA); d = vydacha()
    proba('r20: в корне выдачи vydano_unix — момент сборки (целое, моложе 2 мин), snyato_unix — по-прежнему самый старый замер',
          isinstance(d.get('vydano_unix'), int) and 0 <= time.time() - d['vydano_unix'] < 120 and 'snyato_unix' in d, json.dumps({k: d.get(k) for k in ('vydano_unix', 'snyato_unix')}))
    proba('возврат конфига: podpiska-6 из выдачи ушла, podpiska-2 снова включена',
          'podpiska-6' not in d['podpiski'] and d['podpiski']['podpiska-2']['vyklyuchena'] is False, json.dumps(d['poryadok']))
    # r7 (Вениамин 19:13Z): НЕГОДНЫЙ конфиг при наличии годной копии — тревога по переходу и работа на прежней редакции
    ENV['DSH_LIMITY_ZAMER_ALERT'] = str(r / 'alert.sh'); vyd0 = vydacha()
    konfig(plohoj); sbros_popytok(); pz = zvat(OBERTKA); ps = zvat(SLUZHBA); d = vydacha(); t1 = trevogi_konfig()
    proba('негодный конфиг (дубль номера) при годной копии: замер и служба — «ВНИМАНИЕ … последней годной», замеры идут; ОДНА тревога «НЕГОДЕН»; '
          'выдача — по прежней редакции (тот же порядок, podpiska-9/8 нет)',
          'ВНИМАНИЕ: конфиг' in pz.v and 'ВНИМАНИЕ: конфиг' in ps.v and pz.returncode == 0 and len(t1) == 1 and 'НЕГОДЕН' in t1[0] and 'claude 1 уже есть' in t1[0]
          and d['poryadok'] == vyd0['poryadok'] and 'podpiska-9' not in d['podpiski'] and d['snyato_unix'] is not None, pz.v + ps.v + str(t1))
    sbros_popytok(); zvat(OBERTKA)
    proba('повтор на негодном — новой тревоги нет', len(trevogi_konfig()) == 1, str(trevogi_konfig()))
    konfig(BAZOVYJ); sbros_popytok(); pz = zvat(OBERTKA); ps = zvat(SLUZHBA); t = trevogi_konfig()
    proba('возврат годного конфига: ОДНА тревога «снова годен», «ВНИМАНИЕ» больше нет', len(t) == 2 and 'снова годен' in t[1]
          and 'ВНИМАНИЕ' not in pz.v + ps.v, pz.v + ps.v + str(t))
    # r11 (Вениамин п.1): включённая подписка Claude без organizaciya — отказ конфига
    konfig(BAZOVYJ[:1] + [dict(BAZOVYJ[1], organizaciya='')] + BAZOVYJ[2:]); p = zvat(KOMANDA, 'proverit'); konfig(BAZOVYJ)
    proba('включённая подписка Claude без organizaciya → proverit код 2 «без organizaciya»', p.returncode == 2 and 'без organizaciya' in p.v, p.v)
    # r11 (Вениамин п.3): два источника правды о токене — конфиг ↔ реестр ↔ шлюзы; расхождение — тревога по переходу
    n0 = len(trevogi()); (r / 'tok/token-1').rename(r / 'tok/token-1.prochь'); sbros_popytok(); zvat(OBERTKA); t1 = trevogi()[n0:]
    sbros_popytok(); zvat(OBERTKA); t2 = trevogi()[n0:]
    (r / 'tok/token-1.prochь').rename(r / 'tok/token-1'); sbros_popytok(); zvat(OBERTKA); t3 = trevogi()[n0:]
    proba('токен подписки 1 пропал → ОДНА тревога «РАСХОЖДЕНИЕ … файла токена … нет»; повтор — тишина; вернулся → ОДНА «снова сходятся»',
          len(t1) == 1 and 'РАСХОЖДЕНИЕ' in t1[0] and 'token-1 нет' in t1[0] and 'не прочитан' not in t1[0] and len(t2) == 1 and len(t3) == 2 and 'снова сходятся' in t3[1], str(t3))
    n0 = len(trevogi()); zr = (r / 'reestr.yaml').read_text(); (r / 'reestr.yaml').write_text(zr.replace(f'    {r / "tok" / "token-3"}: stend/token-3\n', ''))
    sbros_popytok(); zvat(OBERTKA); t1 = trevogi()[n0:]; (r / 'reestr.yaml').write_text(zr)
    (r / 'inst' / 'instance-chuzhoj.env').write_text('GATEWAY_TOKEN_FILE=/stend/token-neizvestnyj\n'); sbros_popytok(); zvat(OBERTKA); t2 = trevogi()[n0:]
    (r / 'inst' / 'instance-chuzhoj.env').unlink(); sbros_popytok(); zvat(OBERTKA); t3 = trevogi()[n0:]
    proba('токен подписки 3 не в реестре → тревога «не числится в реестре»; шлюз на неизвестном токене → тревога «шлюз … не числится»; всё вернули → «снова сходятся»',
          len(t1) == 1 and 'не числится в реестре' in t1[0] and len(t2) == 2 and 'instance-chuzhoj.env' in t2[1] and 'реестре' not in t2[1]
          and len(t3) == 3 and 'снова сходятся' in t3[2], str(t3))
    ENV['DSH_LIMITY_ZAMER_ALERT'] = '/bin/true'; zvat(SLUZHBA)   # строки замеров проб токенов — разобрать, приёмная пуста
    # подписка шлюза — по token_shlyuza конфига
    G1, G2 = PREFIKS + 'g1', PREFIKS + 'g2'   # B-N-1935: хозяева файлов шлюза — подставные (были lp, mail)
    for u, put in ((G1, str(r / 'tok/token-2')), (G2, '/stend/token-neizvestnyj')):
        (r / 'inst' / f'instance-{u}.env').write_text(f'GATEWAY_TOKEN_FILE={put}\n')
    st = {'moment_utc': time.time() - 5, 'provajder': 'claude', 'podpiska': 2, 'okno': 'five_hour', 'dolya': 0.3, 'sbros_utc': time.time() + 3600,
          'status': 'allowed', 'izmereno': 1, 'prichina': None, 'istochnik': 'sdk_event', 'otkuda': 'gateway'}
    for imya, u in (('g-lp.json', G1), ('g-mail.json', G2)):
        f = r / 'vhod' / imya; f.write_text(json.dumps(st)); os.chown(f, pwd.getpwnam(u).pw_uid, -1)
    p = zvat(SLUZHBA)
    proba('шлюз по token_shlyuza: учётка с путём подписки 2 — принята; с неизвестным путём — отказ «не числится»',
          'принято 1, отказано 1' in p.v and 'не числится ни у одной подписки' in p.v, p.v)
    konfig([BAZOVYJ[0], dict(BAZOVYJ[1], vkl=False), BAZOVYJ[2], BAZOVYJ[3]])
    f = r / 'vhod' / 'g-lp2.json'; f.write_text(json.dumps(dict(st, moment_utc=time.time() - 3))); os.chown(f, pwd.getpwnam(G1).pw_uid, -1)
    p = zvat(SLUZHBA)
    proba('шлюз выключенной подписки 2 — отказ «выключена в конфиге»', 'отказано 1' in p.v and 'выключена в конфиге' in p.v, p.v)
    # КОМАНДА ВХОДА (подставной CLI): своя подставная учётка, свой каталог
    UCH[5] = PREFIKS + 'v5'
    kv = r / 'kat' / 'vhod5'
    def konf_vhoda(org):   # r13: новая подписка одной командой — строка БЕЗ организации (включённая) + vojti
        konfig(BAZOVYJ + [{'provajder': 'claude', 'nomer': 5, 'kluch': 'podpiska-7', 'podpis': 'Клод-5', 'zamer': UCH[5],
                           'zamer_katalog': str(kv), **({'organizaciya': org} if org else {})}]); zafiksirovat()
    # r7: учёт git каталога конфига — как заводит монтаж: init, .gitignore пакета, первый коммит
    git('init', '-q'); shutil.copy(ZDES / 'etc/dsh-limity.gitignore', r / 'etc/.gitignore'); zafiksirovat()
    def kommitov(): return int(git('rev-list', '--count', 'HEAD').stdout.strip() or 0)
    def chisto(): return git('status', '--porcelain', '-uall').stdout.strip() == ''
    konf_vhoda(None); (r / 'cli-org').write_text(ORG[5]); s0 = hashlib.sha256(KONF.read_bytes()).hexdigest()
    c0 = (r / 'cli.log').read_text(); k0 = kommitov()
    p = zvat(KOMANDA, 'vojti', 'podpiska-7', vvod='y\n')
    proba('vojti: организации нет и НЕТ --prichina → ОТКАЗ код 2 ДО входа: CLI не звался, каталога входа нет, конфиг и учёт не тронуты',
          p.returncode == 2 and '--prichina' in p.v and (r / 'cli.log').read_text() == c0 and not kv.exists()
          and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0 and kommitov() == k0, p.v)
    c0 = (r / 'cli.log').read_text(); s0 = hashlib.sha256(KONF.read_bytes()).hexdigest()
    p = zvat(KOMANDA, 'vojti', 'podpiska-7', '--prichina', 'новая подписка 5 стенда', vvod='y\n')   # «y» из трубы, не из терминала
    proba('vojti: «y» из трубы (stdin не терминал) → ОТКАЗ код 2 ДО входа, CLI не звался, конфиг не тронут (Вениамин 20:09Z)',
          p.returncode == 2 and 'stdin не терминал' in p.v and (r / 'cli.log').read_text() == c0 and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0, p.v)
    p = zvat_tty(KOMANDA, 'vojti', 'podpiska-7', '--prichina', 'новая подписка 5 стенда', vvod='y\n'); syroe = json.loads(KONF.read_text())
    msg = git('log', '-1', '--format=%an|%s').stdout.strip()
    proba('vojti (новая ВКЛЮЧЁННАЯ строка без организации — одной командой): --prichina, «y» → ГОДНО, организация вписана, proverit годен; КОММИТ: автор proverka, «vojti podpiska-7: <причина> … подтвердил proverka»; '
          'учёт чист (.bak вне учёта)',
          p.returncode == 0 and 'ГОДНО' in p.v and next(z for z in syroe if z['kluch'] == 'podpiska-7').get('organizaciya') == ORG[5]
          and kommitov() == k0 + 1 and msg.startswith('proverka|dsh-limity-podpiski vojti podpiska-7: новая подписка 5 стенда') and 'подтвердил proverka' in msg
          and chisto() and list(r.glob('etc/*.bak')) and 'https://claude.ai/oauth' in p.v
          and zvat(KOMANDA, 'proverit').returncode == 0
          and 'организация подтверждена: proverka, источник: вход vladelec@example.org' in git('log', '-1', '--format=%B').stdout
          and f'показано Org/{ORG[5]}' in git('log', '-1', '--format=%B').stdout and 'email vladelec@example.org' in p.v, p.v + msg)   # r13–r15: строка без организации + vojti = годный конфиг (одной командой)
    konf_vhoda(None); s0 = hashlib.sha256(KONF.read_bytes()).hexdigest(); l0 = (r / 'cli.log').read_text().count('auth logout'); k0 = kommitov()
    p = zvat_tty(KOMANDA, 'vojti', 'podpiska-7', '--prichina', 'проба отказа', vvod='\n')   # r15: пустой ответ = по умолчанию N
    proba('vojti: пустой ответ (по умолчанию N) → код 1, вход снят (auth logout), конфиг не тронут, коммита нет',
          p.returncode == 1 and (r / 'cli.log').read_text().count('auth logout') == l0 + 1 and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0
          and kommitov() == k0 and not (kv / '.credentials.json').exists(), p.v)
    konf_vhoda(ORG[4]); s0 = hashlib.sha256(KONF.read_bytes()).hexdigest(); l0 = (r / 'cli.log').read_text().count('auth logout')
    p = zvat(KOMANDA, 'vojti', 'podpiska-7')
    proba('vojti: вход ЧУЖОЙ организации (org-5 при org-4 в конфиге) → код 1 «НЕ ТОЙ организации», вход снят, конфиг не тронут',
          p.returncode == 1 and 'НЕ ТОЙ организации' in p.v and (r / 'cli.log').read_text().count('auth logout') == l0 + 1
          and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0, p.v)
    konf_vhoda(ORG[5]); zvat(KOMANDA, 'vojti', 'podpiska-7'); s0 = hashlib.sha256(KONF.read_bytes()).hexdigest(); k0 = kommitov()
    p = zvat(KOMANDA, 'snyat', 'podpiska-7')
    proba('snyat без --prichina → ОТКАЗ код 2, вход и конфиг не тронуты', p.returncode == 2 and '--prichina' in p.v and (kv / '.credentials.json').exists()
          and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0 and kommitov() == k0, p.v)
    KONF.write_text(KONF.read_text() + '\n'); p = zvat(KOMANDA, 'snyat', 'podpiska-7', '--prichina', 'x'); pv = zvat(KOMANDA, 'proverit')
    proba('ручная правка без коммита → snyat ОТКАЗ «незафиксированная правка», вход цел; proverit — «учёт git: 🔴 … незафиксированная»',
          p.returncode == 2 and 'незафиксированная правка' in p.v and (kv / '.credentials.json').exists() and 'учёт git: 🔴' in pv.v and kommitov() == k0, p.v + pv.v)
    ENV['DSH_LIMITY_ZAMER_ALERT'] = str(r / 'alert.sh'); n0 = len(trevogi()); sbros_popytok(); zvat(OBERTKA); t1 = trevogi()[n0:]   # r14: правка мимо учёта
    zafiksirovat(); sbros_popytok(); zvat(OBERTKA); t2 = trevogi()[n0:]; ENV['DSH_LIMITY_ZAMER_ALERT'] = '/bin/true'; zvat(SLUZHBA)
    proba('r17: правка руками мимо команды → замер о учёте МОЛЧИТ (тревога — nezafiksirovano-watch Искры); зафиксировали — тоже тишина',
          not [x for x in t1 if 'учёт' in x] and not [x for x in t2 if 'учёт' in x], str(t2))
    zafiksirovat(); k0 = kommitov()
    p = zvat(KOMANDA, 'snyat', 'podpiska-7', '--prichina', 'подписка 5 закрыта'); syroe = json.loads(KONF.read_text()); msg = git('log', '-1', '--format=%an|%s').stdout.strip()
    pv = zvat(KOMANDA, 'proverit')
    proba('snyat --prichina: вход снят, vkl=false; КОММИТ «snyat podpiska-7: подписка 5 закрыта · vkl=False · подтвердил proverka»; proverit — «учёт git: чисто»',
          p.returncode == 0 and 'вход снят' in p.v and next(z for z in syroe if z['kluch'] == 'podpiska-7').get('vkl') is False and kommitov() == k0 + 1
          and msg == 'proverka|dsh-limity-podpiski snyat podpiska-7: подписка 5 закрыта · vkl=False · подтвердил proverka' and 'учёт git: чисто' in pv.v, p.v + msg + pv.v)
    (r / 'etc2').mkdir(); shutil.copy(KONF, r / 'etc2/podpiski.json'); s2 = hashlib.sha256((r / 'etc2/podpiski.json').read_bytes()).hexdigest()
    ENV['DSH_LIMITY_PODPISKI'] = str(r / 'etc2/podpiski.json'); p = zvat(KOMANDA, 'snyat', 'podpiska-1', '--prichina', 'x'); ENV['DSH_LIMITY_PODPISKI'] = str(KONF)
    proba('каталог конфига без учёта git → snyat ОТКАЗ «не под учётом git», конфиг не тронут',
          p.returncode == 2 and 'не под учётом git' in p.v and hashlib.sha256((r / 'etc2/podpiski.json').read_bytes()).hexdigest() == s2, p.v)
    s0 = hashlib.sha256(KONF.read_bytes()).hexdigest()
    pp = [zvat(KOMANDA, *a) for a in (['vojti', 'podpiska-7', '--dry-run'], ['-n'], ['udalit', 'podpiska-1'], ['snyat', 'podpiska-1', '--force'],
                                       ['snyat', 'podpiska-1', '--prichina'], ['snyat', 'podpiska-1', '--prichina', 'a', '--prichina', 'b'])]
    proba('неизвестное действие/флаг (--dry-run, -n, udalit, --force, --prichina без значения, повтор --prichina) → ОТКАЗ код 2, конфиг не тронут',
          all(x.returncode == 2 and 'ОТКАЗ' in x.v for x in pp) and hashlib.sha256(KONF.read_bytes()).hexdigest() == s0, ' | '.join(x.v[:120] for x in pp))
    # r9 (Вениамин LOW): каталог входа «…/../..» или сам корень — ошибка конфига; vojti ничего не создаёт и не меняет права корня
    for plohoj_kat in (str(r / 'kat') + '/p9/../..', str(r / 'kat')):
        konfig(BAZOVYJ + [{'provajder': 'claude', 'nomer': 9, 'kluch': 'podpiska-9', 'zamer': UCH[5], 'zamer_katalog': plohoj_kat, 'organizaciya': ORG[5]}])
        zafiksirovat(); st0 = [(x.stat().st_mode, x.stat().st_uid) for x in (r, r / 'kat')]
        pp = zvat(KOMANDA, 'proverit'); pv = zvat(KOMANDA, 'vojti', 'podpiska-9')
        proba(f'zamer_katalog {plohoj_kat[len(str(r)):]!r} → proverit код 2 «не прямой подкаталог»; vojti — ОТКАЗ, права {r.name} и kat не тронуты, CLI не звался',
              pp.returncode == 2 and 'не прямой подкаталог' in pp.v and pv.returncode == 2 and 'ОТКАЗ' in pv.v
              and [(x.stat().st_mode, x.stat().st_uid) for x in (r, r / 'kat')] == st0, pp.v + pv.v)
    konfig(BAZOVYJ); zafiksirovat()
    # r10: ключ DeepSeek — LoadCredential drop-in'ом команды klyuch
    (r / 'ds-k').write_text('ключ стенда\n')
    konfig(BAZOVYJ + [{'provajder': 'deepseek', 'nomer': 1, 'kluch': 'deepseek-1', 'klyuch_fajl': str(r / 'ds-k')}]); zafiksirovat()
    p0 = zvat(KOMANDA, 'proverit'); pk = zvat(KOMANDA, 'klyuch', 'deepseek-1'); p1 = zvat(KOMANDA, 'proverit')
    di = r / 'systemd/dsh-limity-deepseek.service.d/klyuch-deepseek-1.conf'
    proba('klyuch deepseek-1: proverit до — «LoadCredential 🔴 НЕТ»; drop-in с LoadCredential=dsh-limity-deepseek-1:<klyuch_fajl>; proverit после — «есть»; '
          'значения ключа в drop-in нет',
          'LoadCredential 🔴 НЕТ' in p0.v and pk.returncode == 0 and di.is_file() and f'LoadCredential=dsh-limity-deepseek-1:{r / "ds-k"}' in di.read_text()
          and 'ключ стенда' not in di.read_text() and 'LoadCredential есть' in p1.v, p0.v + pk.v + p1.v)
    konfig(BAZOVYJ); zafiksirovat()
    proba('живая группа limity-vhod после стенда — та же, что до (стенд её не трогает)', gruppa_zhivaya() == GRUPPA0, f'{GRUPPA0} → {gruppa_zhivaya()}')
    proba('B-N-1935: vojti положил учётку входа в ПОДСТАВНУЮ группу (usermod пакета дошёл до группы стенда), не в живую',
          UCH[5] in grp.getgrnam(GRUPPA_ST).gr_mem and UCH[5] not in (GRUPPA0 or []), f'{GRUPPA_ST}: {grp.getgrnam(GRUPPA_ST).gr_mem}')
    proba('B-N-1935: живые nobody/daemon/bin/sys/lp/mail — запись passwd и членство в группах те же, что до', zhivye_snimok() == ZHIVYE0, f'{ZHIVYE0} → {zhivye_snimok()}')
    proba('код пакета между пробами НЕ менялся (суммы sbin/libexec/lib до и после)', summy() == SUMMY0, f'{SUMMY0} → {summy()}')
finally:
    shutil.rmtree(r, ignore_errors=True); ostatki = ubrat()
    proba(f'B-N-1935: уборка — учёток и групп с префиксом {PREFIKS} не осталось', not ostatki, ostatki)
    print(f'ИТОГ стенда конфига: {proshlo} из {vsego}' + (f' — ПРЕРВАН сигналом {PRERVAN[0]}, пробы не все' if PRERVAN else ''))
sys.exit(0 if proshlo == vsego and vsego else 1)
