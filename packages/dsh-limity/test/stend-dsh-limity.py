#!/usr/bin/env python3
"""Стенд службы лимитов dsh-limity (B-N-1776, такт 1). Предмет — DSH_LIMITY_TEST (по умолчанию ../sbin/dsh-limity).
Всё во временном каталоге: подставное состояние codex-limit-watch, база, приёмная, выдача, перечень подписок.
Совместимость с переключателем проверяется НАСТОЯЩИМ его читателем такта 4 на базе стенда (--baza, --nastrojka — подставное правило
с числами Вениамина 07.10 19:24 МСК); читатель без --baza (старый, --file) — СЛЕПОТА код 2, а не краснота:
читатель — довод 1 или DSH_LIMITY_CHITATEL, по умолчанию боевой /usr/local/libexec/pereklyuchatel-podpiski-limity.py;
правило — копия /etc/default/pereklyuchatel-podpiski-limity такта 4 (fixtures/, ecb66189).
Пробы: исправное · повтор без нового замера не освежает метку · приёмная → читатель «free», podpiska-5 = Claude 3 ·
порча приёмной (4 вида) → отказ, строк не прибавилось · порча состояния Codex → СЛЕПОТА, возврат → 0 · консервативная
метка (старый Claude + свежий Codex → вверху выдачи старый; читатель подписки 2 — free, подписки 1 — «не измерено» по возрасту) · прошедший сброс → null · выдача: команда → отказ ·
страница lim.insmat.ru: НАСТОЯЩИЙ её скрипт (снимок рядом, node) на выдаче — Claude без замера «ещё не измеряется», Codex с возрастом.
1.0.3 (root): подлог чужой подписки · codex в приёмной · FIFO · ссылка → отказ; otkuda по владельцу файла.
1.0.2: замер был, окно сброшено → zhdyom «последний замер»; строки кандидата шлюза (fixtures/stroki-shlyuza.json) → приёмная → страница.
ЧЕГО НЕ ПРОВЕРЯЕТ: успешную отдачу dsh-limity-vydat (путь выдачи боевой, появится после монтажа) · живой codex-limit-watch.
Код: 0 — все пробы, 1 — красная проба, 2 — стенд слеп.
"""
import json, os, pwd, sqlite3, subprocess, sys, tempfile, time
from pathlib import Path

ZDES = Path(__file__).resolve().parent.parent
PREDMET = Path(os.environ.get('DSH_LIMITY_TEST', ZDES / 'sbin/dsh-limity'))
VYDAT = Path(os.environ.get('DSH_LIMITY_VYDAT', ZDES / 'libexec/dsh-limity-vydat'))   # 1.0.4: копия стенда вне дерева (обход) — путь боевой выдачи доводом окружения
if not VYDAT.is_file(): print(f'СЛЕПОТА: выдача {VYDAT} не найдена — вне дерева задайте DSH_LIMITY_VYDAT'); sys.exit(2)
# Читатель — довод 1 (до окна: кандидат такта 4 из каталога Авроры), иначе DSH_LIMITY_CHITATEL, иначе боевой.
CHITATEL = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('DSH_LIMITY_CHITATEL', '/usr/local/libexec/pereklyuchatel-podpiski-limity.py'))
# 1.0.3: приёмная верит ВЛАДЕЛЬЦУ файла — подлог «чужой подписки» требует файлов разных учёток ⇒ стенд от root (chown).
if os.geteuid() != 0: print('СЛЕПОТА: стенд 1.0.3 требует root — файлы приёмной раскладываются по учёткам daemon/bin/sys (chown)'); sys.exit(2)
UCH = {1: 'daemon', 2: 'bin', 3: 'sys'}   # подставные «агенты»: учётка → её подписка через instance-<учётка>.env
for f in (PREDMET, CHITATEL):
    if not f.is_file(): print('СЛЕПОТА: нет', f); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-dsh-limity-')); (r / 'vhod').mkdir(); (r / 'inst').mkdir()
for n, u in UCH.items(): (r / 'inst' / f'instance-{u}.env').write_text(f'X=1\nGATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podpiska-{n}\n')
proshlo = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '| вывод:', str(vyvod)[-500:].replace('\n', ' ⏎ '))
T = time.time()
def codex(at, d3=0.14, d4=0.39, sbros=None):
    sbros = sbros or int(T + 6 * 86400)
    (r / 'codex.json').write_text(json.dumps({'zamer': {'3': {'at': at, 'dolya': d3, 'okno': ['codex', 'primary', 10080, sbros]},
                                                        '4': {'at': at, 'dolya': d4, 'okno': ['codex', 'primary', 10080, sbros + 100]}}}))
(r / 'podpiski.json').write_text(json.dumps([
    {'provajder': 'claude', 'nomer': 1, 'kluch': 'podpiska-1', 'organizaciya': 'org-1-stend', 'token_shlyuza': '/etc/claude-oauth/token-podpiska-1'},   # r4: подписка шлюза — по token_shlyuza
    {'provajder': 'claude', 'nomer': 2, 'kluch': 'podpiska-2', 'organizaciya': 'org-2-stend', 'token_shlyuza': '/etc/claude-oauth/token-podpiska-2'},
    {'provajder': 'claude', 'nomer': 3, 'kluch': 'podpiska-5', 'organizaciya': 'org-3-stend', 'token_shlyuza': '/etc/claude-oauth/token-podpiska-3'},
    {'provajder': 'codex', 'nomer': 3, 'kluch': 'podpiska-3'}, {'provajder': 'codex', 'nomer': 4, 'kluch': 'podpiska-4'}]))
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'),
           DSH_LIMITY_VYDACHA=str(r / 'vydacha/limity.json'), DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'),
           DSH_LIMITY_CODEX_SOST=str(r / 'codex.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'))
def zapusk():
    p = subprocess.run([sys.executable, '-B', str(PREDMET)], env=ENV, capture_output=True, text=True, timeout=60)
    p.v = p.stdout + p.stderr
    try: p.doc = json.loads((r / 'vydacha/limity.json').read_text())
    except (OSError, ValueError): p.doc = None
    return p
def strok(): return sqlite3.connect(r / 'limity.db').execute('SELECT COUNT(*) FROM zamer').fetchone()[0]
NASTR = Path(__file__).resolve().parent / 'fixtures' / 'pereklyuchatel-podpiski-limity.default'   # копия /etc/default такта 4 (Аврора, ecb66189)
if '--baza' not in subprocess.run([sys.executable, '-B', str(CHITATEL), '--help'], capture_output=True, text=True).stdout:
    print(f'СЛЕПОТА: читатель {CHITATEL} без --baza (интерфейс до такта 4, --file) — стенд 1.0.3 судит читателя такта 4'); subprocess.run(['rm', '-rf', str(r)]); sys.exit(2)
def chitatel(n):
    p = subprocess.run([sys.executable, '-B', str(CHITATEL), str(n), '--baza', str(r / 'limity.db'), '--nastrojka', str(NASTR)], capture_output=True, text=True)
    return p.stdout.strip()
STRANICA = Path(__file__).resolve().parent / 'stranica-lim-insmat.html'   # снимок https://lim.insmat.ru/ 07.10 17:42Z (79ef49fb, правка Михалыча: «неизвестно»)
def stranica():
    p = subprocess.run(['node', str(Path(__file__).resolve().parent / 'risuj-stranicu.js'), str(STRANICA), str(r / 'vydacha/limity.json')],
                       capture_output=True, text=True, timeout=30)
    return p.stdout + p.stderr
def vhod(imya, z, uch=None):
    f = r / 'vhod' / imya; f.write_text(z if isinstance(z, str) else json.dumps(z))
    uch = uch or UCH.get(z.get('podpiska') if isinstance(z, dict) else None, 'daemon'); os.chown(f, pwd.getpwnam(uch).pw_uid, -1)
def claude(n, okno, dolya, moment, sbros, status='allowed'):
    return {'moment_utc': moment, 'provajder': 'claude', 'podpiska': n, 'okno': okno, 'dolya': dolya, 'sbros_utc': sbros,
            'status': status, 'izmereno': 1, 'prichina': None, 'istochnik': 'sdk_event', 'otkuda': 'gateway@stend'}
try:
    print('предмет:', PREDMET); print('читатель:', CHITATEL)
    at = T - 30; codex(at)
    p = zapusk(); d = p.doc or {}
    p3 = (d.get('podpiski') or {}).get('podpiska-3') or {}
    proba('исправное: код 0, «codex новых 2», podpiska-3 доля 0.14 и снята = замер, Claude-окна null',
          p.returncode == 0 and 'codex новых 2' in p.v and (p3.get('nedelya') or {}).get('izrashodovano_dolya') == 0.14
          and p3.get('snyato_unix') == int(at) and d['podpiski']['podpiska-2']['pyat_chasov'] is None, p.v)
    metka = d.get('snyato_unix')
    s = stranica(); kart = s.split('\n')
    klod = [k for k in kart if k.startswith(' Клод-')]; kodeks = [k for k in kart if k.startswith(' Кодекс-')]
    proba('страница lim.insmat.ru (настоящий скрипт): 3 карточки Claude без замера — «ещё не измеряется», без «ОСТАНОВИТСЯ»; '
          '2 карточки Codex — «снято 0 мин назад»',
          len(klod) == 3 and all('ещё не измеряется' in k and 'ОСТАНОВИТСЯ' not in k for k in klod)
          and len(kodeks) == 2 and all('снято 0 мин назад' in k for k in kodeks), s)
    p = zapusk()
    proba('повтор без нового замера: «codex новых 0», строк 2, верхняя метка та же (выдача не освежает)',
          'codex новых 0' in p.v and strok() == 2 and (p.doc or {}).get('snyato_unix') == metka, p.v)
    vhod('a.json', claude(2, 'five_hour', 0.5, T - 20, T + 3600)); vhod('b.json', claude(2, 'seven_day', 0.2, T - 20, T + 86400))
    vhod('c.json', claude(3, 'five_hour', 0.1, T - 20, T + 3600))
    p = zapusk(); d = p.doc or {}
    proba('приёмная: принято 3, файлы удалены; читатель переключателя на подписке 2 → free',
          'принято 3' in p.v and not list((r / 'vhod').glob('*.json')) and chitatel(2).startswith('free'), p.v + chitatel(2))
    proba('Claude 3 выдана под ключом podpiska-5 (5ч=0.1); читатель на подписке 3 без недели → unknown «неделя — замеров нет»',
          (d['podpiski']['podpiska-5']['pyat_chasov'] or {}).get('izrashodovano_dolya') == 0.1 and chitatel(3).startswith('unknown') and 'неделя — замеров нет' in chitatel(3), chitatel(3))
    n0 = strok()
    vhod('p1.json', dict(claude(1, 'five_hour', 0.3, T - 10, T + 3600), lishnee=1))
    vhod('p2.json', dict(claude(1, 'five_hour', 0.3, T - 10, T + 3600), otkuda='sk-ant-oat01-AAAAAAAAAA'))  # vorota-ob:dopusk=TOKEN
    vhod('p3.json', dict(claude(1, 'five_hour', 0.3, T - 10, T + 3600), izmereno=0, prichina='нет трафика'))
    vhod('p4.json', '{битый')
    p = zapusk()
    proba('порча приёмной (чужое поле, токеноподобное, доля при izmereno=0, битый JSON) → отказано 4, строк не прибавилось, файлы в otkaz/',
          'отказано 4' in p.v and strok() == n0 and len(list((r / 'otkaz').glob('*.json'))) == 4
          and all(s in p.v for s in ('чужие поля', 'похоже на токен', 'обязана быть null', 'не JSON')), p.v)
    (r / 'codex.json').write_text('{битый')
    p = zapusk()
    proba('порча состояния Codex → код 2, «СЛЕПОТА: codex: состояние не разобрано», выдача построена из базы',
          p.returncode == 2 and 'СЛЕПОТА: codex: состояние не разобрано' in p.v and p.doc is not None, p.v)
    codex(at); p = zapusk()
    proba('возврат состояния Codex → код 0, слепоты нет', p.returncode == 0 and 'СЛЕПОТА' not in p.v, p.v)
    vhod('s.json', claude(1, 'five_hour', 0.2, T - 3600, T + 3600))
    p = zapusk(); d = p.doc or {}
    proba('консервативная метка выдачи: старый замер Claude 1 (−3600 с) → вверху старый; читатель НЕ отравлен ею: подписка 2 → free, подписка 1 → unknown по возрасту (≤30 мин)',
          d.get('snyato_unix') == int(T - 3600) and chitatel(2).startswith('free') and chitatel(1).startswith('unknown') and 'возрасте ≤30' in chitatel(1),
          str(d.get('snyato_unix')) + ' | ' + chitatel(2) + ' | ' + chitatel(1))
    vhod('x.json', claude(1, 'seven_day', 0.9, T - 7200, T - 60))
    p = zapusk(); d = p.doc or {}
    proba('сброс прошёл после замера → окно nedelya подписки 1 = null', d['podpiski']['podpiska-1']['nedelya'] is None, json.dumps(d['podpiski']['podpiska-1']))
    vhod('z.json', claude(3, 'five_hour', 0.4, T - 5, T - 1))
    p = zapusk(); d = p.doc or {}; zh = d['podpiski']['podpiska-5'].get('zhdyom', '')
    s = stranica(); k3 = [k for k in s.split('\n') if k.startswith(' Клод-3')]
    proba('замер был, но окно уже сброшено → zhdyom «последний замер … сброс уже был», не «ни одного замера»; страница — «ещё не измеряется»',
          zh.startswith('не измерено: последний замер') and 'сброс уже был' in zh and len(k3) == 1 and 'ещё не измеряется' in k3[0], zh + ' | ' + str(k3))
    for i, z in enumerate(json.loads((Path(__file__).resolve().parent / 'fixtures' / 'stroki-shlyuza.json').read_text())):
        z['moment_utc'] = T - 3; z['sbros_utc'] = T + (3600 if z['okno'] == 'five_hour' else 86400); vhod(f'g{i}.json', z)
    p = zapusk(); d = p.doc or {}; p2 = d['podpiski']['podpiska-2']
    s = stranica(); k2 = [k for k in s.split('\n') if k.startswith(' Клод-2')]
    proba('строки кандидата шлюза (фикстура пробы А) → принято 2; выдача 5ч 0.33 и неделя 0.37 allowed_warning; страница: 33 %, перерасход «неизвестно», без «ОСТАНОВИТСЯ»',
          'принято 2' in p.v and (p2['pyat_chasov'] or {}).get('izrashodovano_dolya') == 0.33 and (p2['nedelya'] or {}).get('sostoyanie') == 'allowed_warning'
          and len(k2) == 1 and 'израсходовано 33%' in k2[0] and 'перерасход: неизвестно' in k2[0] and 'ОСТАНОВИТСЯ' not in k2[0], p.v + str(k2))
    n0 = strok(); otk = r / 'otkaz'
    vhod('podlog.json', claude(3, 'five_hour', 0.05, T - 2, T + 3600), uch='daemon')
    p = zapusk(); d = p.doc or {}
    proba('1.0.3 подлог: учётка daemon (её подписка 1) кладёт «подписка 3, 0.05» → отказ «подписка 3 ≠ подписке учётки daemon (1)», строк не прибавилось, Claude 3 не 0.05',
          'отказано 1' in p.v and 'подписка 3 ≠ подписке учётки daemon (1)' in p.v and strok() == n0 and (otk / 'podlog.json').exists()
          and (d['podpiski']['podpiska-5'].get('pyat_chasov') or {}).get('izrashodovano_dolya') != 0.05, p.v)
    vhod('codex.json', dict(claude(3, 'five_hour', 0.1, T - 2, T + 3600), provajder='codex', okno='codex_primary', istochnik='codex_app_server'), uch='sys')
    p = zapusk()
    proba('1.0.3 provajder codex в приёмной (от своей учётки, своя подписка) → отказ «только claude/sdk_event», строк не прибавилось',
          'отказано 1' in p.v and 'только claude/sdk_event' in p.v and strok() == n0, p.v)
    os.mkfifo(r / 'vhod' / 'fifo.json'); os.chown(r / 'vhod' / 'fifo.json', pwd.getpwnam('daemon').pw_uid, -1)
    t0 = time.time(); p = zapusk(); dt = time.time() - t0
    proba(f'1.0.3 FIFO вместо файла → отказ «не обычный файл» без зависания ({dt:.1f} с < 20), FIFO унесён в otkaz/',
          dt < 20 and 'не обычный файл' in p.v and 'отказано 1' in p.v and (otk / 'fifo.json').is_fifo() and not (r / 'vhod' / 'fifo.json').exists(), p.v)
    cel = r / 'chuzhoj.json'; cel.write_text(json.dumps(claude(2, 'five_hour', 0.6, T - 2, T + 3600))); os.symlink(cel, r / 'vhod' / 'ssylka.json')
    p = zapusk()
    proba('1.0.3 ссылка в приёмной → отказ «ссылка», цель не прочитана (строк не прибавилось)', 'отказано 1' in p.v and 'ссылка' in p.v and strok() == n0, p.v)
    vhod('spoof.json', dict(claude(2, 'five_hour', 0.5, T - 1, T + 3600), otkuda='gateway@iskra'), uch='bin')
    p = zapusk(); ot = sqlite3.connect(r / 'limity.db').execute('SELECT otkuda FROM zamer WHERE moment_utc=? AND podpiska=2', (T - 1,)).fetchone()
    proba('1.0.3 возврат: своя подписка от своей учётки → принято 1, код 0, без СЛЕПОТЫ; otkuda в таблице — по владельцу (gateway@bin), не из JSON (gateway@iskra)',
          'принято 1' in p.v and p.returncode == 0 and 'СЛЕПОТА' not in p.v and ot == ('gateway@bin',), p.v + str(ot))
    pv = subprocess.run([sys.executable, '-B', str(VYDAT)], env=dict(os.environ, SSH_ORIGINAL_COMMAND='cat /etc/shadow'), capture_output=True, text=True)
    proba('выдача: команда клиента → отказ, код 3, ничего не отдано', pv.returncode == 3 and pv.stdout == '' and 'ОТКАЗ' in pv.stderr, pv.stderr)
    proba('в выдаче нет токеноподобного текста', 'sk-ant' not in (r / 'vydacha/limity.json').read_text())
finally:
    subprocess.run(['rm', '-rf', str(r)])
print(f'итог: {proshlo} из {vsego}')
sys.exit(0 if proshlo == vsego else 1)
