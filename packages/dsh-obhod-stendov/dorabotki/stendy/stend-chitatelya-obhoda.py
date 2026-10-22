#!/usr/bin/python3 -I
# stend-chitatelya-obhoda.py — стенд читателя ночного обхода (B-N-1741, Аврора, 07.10.2026).
# Предмет: довод 1, без довода — боевой /usr/local/sbin/chitatel-obhoda. Ночи подставные (CHO_ISTOCHNIK), канал —
# подставной tell (копирует письмо в свой каталог), состояние — во временном каталоге. Журнал, таймер и настоящая щель
# не трогаются. Путь журнала (nochi_iz_zhurnala) этим стендом НЕ проверяется — только разбор, счёт ночей и правило писем.
import os, re, shutil, subprocess, sys, tempfile

PREDMET = sys.argv[1] if len(sys.argv) > 1 else '/usr/local/sbin/chitatel-obhoda'
if not os.path.isfile(PREDMET):
    print(f'СЛЕПОТА: предмета нет: {PREDMET}'); sys.exit(2)
T = tempfile.mkdtemp(prefix='stend-chitatelya-obhoda.')
NOCHI, SOST, PISMA = (os.path.join(T, x) for x in ('nochi', 'sost', 'pisma'))
for d in (NOCHI, SOST, PISMA): os.makedirs(d)
TELL = os.path.join(T, 'tell')
with open(TELL, 'w') as f:
    f.write('#!/bin/sh\n[ -n "${PODSTAVA_OTKAZ:-}" ] && { echo "ОТКАЗ: подстава"; exit 3; }\n'
            'n=$(ls "$PODSTAVA_KUDA" | wc -l); cp "$1" "$PODSTAVA_KUDA/pismo-$n.md" && echo "положено: pismo-$n.md"\n')
os.chmod(TELL, 0o755)

def noch(den, krasnye, itog_neozh=None, poyasn=()):
    """вывод ночи в формате обёртки: krasnye — имена неожиданно красных стендов; один ожидаемый всегда;
    poyasn — строки-пояснения провала (обходчик метит их «↳ », B-N-1754) у каждого красного"""
    s = []
    for k in krasnye:
        s += [f'    РАСХОЖДЕНИЕ:{k}(код 1)'] + [f'      {k}: ↳      {x}' for x in poyasn] + [f'      {k}:   FAIL  П1 проба {k} не прошла',
              f'      🔴 НЕОЖИДАННО: stendy/{k} (выпуск -, код 1) — исключения нет']
    s += ['      ОЖИДАЕМО: paket/stend-o.sh (выпуск 1.0) · код 1 · замер 2026-10-01, рука Аврора, sadik; чем: стенд']
    n = len(krasnye) if itog_neozh is None else itog_neozh
    kod = 1 if n else 3
    s += [f'{"🔴 " if n else ""}ИТОГ ТАЙМЕРА: обходчик код {kod} · стендов 10 · расхождений {len(krasnye)} · слепот 0 '
          f'(ожидаемых 1, неожиданных {n})']
    with open(os.path.join(NOCHI, den + '.txt'), 'w', encoding='utf-8') as f: f.write('\n'.join(s) + '\n')

def zapusk(*dovody, otkaz=False):
    env = dict(os.environ, CHO_ISTOCHNIK=NOCHI, CHO_SOST=SOST, CHO_TELL_BIN=TELL, PODSTAVA_KUDA=PISMA,
               CHO_KOREN='/nonexistent-koren', CHO_ADRESAT='zabavy')
    env.pop('PODSTAVA_OTKAZ', None)
    if otkaz: env['PODSTAVA_OTKAZ'] = '1'
    p = subprocess.run(['python3', '-I', PREDMET, *dovody], capture_output=True, text=True, env=env, timeout=60)
    return p.returncode, p.stdout + p.stderr

def pisma(): return sorted(os.listdir(PISMA), key=lambda x: int(x.split('-')[1].split('.')[0]))
def posl(): return open(os.path.join(PISMA, pisma()[-1]), encoding='utf-8').read()
def neozh(p): return [x for x in p.splitlines() if x.startswith('• stendy/') and ' · ' in x]   # строки неожиданных: без ожидаемого и «снято»

ok = fail = 0
def proba(imya, uslovie, pokaz=''):
    global ok, fail
    if uslovie: ok += 1; print(f'  ✅ {imya}')
    else: fail += 1; print(f'  FAIL {imya}{" — " + pokaz[:300] if pokaz else ""}')

try:
    k, v = zapusk('--dry-run'); proba('С0 неизвестный довод → отказ 2, писем нет', k == 2 and not pisma(), v)

    noch('2026-10-01', ['stend-a.sh', 'stend-b.sh'])
    k, v = zapusk(); p = posl() if pisma() else ''
    proba('С1 ночь с 2 красными → ОДНО письмо', k == 0 and len(pisma()) == 1, v)
    proba('С1 в письме 2 строки НЕОЖИДАННО, обе «впервые»',
          len(neozh(p)) == 2 and all(x.endswith('впервые') for x in neozh(p)) and 'НЕОЖИДАННО — 2' in p, p)
    proba('С1 «что красное» — строка FAIL стенда', '«FAIL  П1 проба stend-a.sh не прошла»' in p, p)

    k, v = zapusk()
    proba('С2 повтор той же ночи → письма нет, «уже прочитана»', k == 0 and len(pisma()) == 1 and 'уже прочитана' in v, v)

    noch('2026-10-02', ['stend-a.sh', 'stend-b.sh'])
    k, v = zapusk(); p = posl()
    proba('С3 вторая ночь той же картины → письмо, «2-я ночь подряд (с 2026-10-01)» у обоих',
          k == 0 and len(pisma()) == 2 and len(neozh(p)) == 2 and all(x.endswith('2-я ночь подряд (с 2026-10-01)') for x in neozh(p)), p)

    noch('2026-10-03', [])
    k, v = zapusk(); p = posl()
    proba('С4 зелёная после красной → письмо «СНЯТО — 2» с именами',
          k == 0 and len(pisma()) == 3 and 'СНЯТО — 2' in p and '• stendy/stend-a.sh' in p and '• stendy/stend-b.sh' in p, p)

    noch('2026-10-04', [])
    k, v = zapusk()
    proba('С5 зелёная после зелёной → письма нет', k == 0 and len(pisma()) == 3 and 'письма нет' in v, v)

    noch('2026-10-05', ['stend-a.sh', 'stend-b.sh'], itog_neozh=3)
    k, v = zapusk(); p = posl() if len(pisma()) == 4 else ''
    proba('С6 итог «неожиданных 3», строк 2 → код 2 и письмо с «РАЗБОР РАЗОШЁЛСЯ»',
          k == 2 and len(pisma()) == 4 and 'РАЗБОР РАЗОШЁЛСЯ' in p, v + p)
    k, v = zapusk()   # находка Михалыча 14.10: повтор такой ночи держал читатель красным (код 2) каждый час
    proba('С6б повтор ночи с разошедшимся разбором → код 0, письма нет, «уже прочитана» с кодом первого прочтения',
          k == 0 and len(pisma()) == 4 and 'уже прочитана' in v and 'код 2' in v, v)

    noch('2026-10-06', ['stend-c.sh'])
    otm = open(os.path.join(SOST, 'prochitano')).read()
    k, v = zapusk(otkaz=True)
    proba('С7 канал отказал → код 1, письма нет, отметка прежняя',
          k == 1 and len(pisma()) == 4 and open(os.path.join(SOST, 'prochitano')).read() == otm, v)
    k, v = zapusk(); p = posl()
    proba('С7 канал ожил → письмо этой ночи', k == 0 and len(pisma()) == 5 and '• stendy/stend-c.sh' in p, v + p)

    mnogo = [f'stend-dlinnoe-imya-dlya-proby-predela-{i:02d}.sh' for i in range(40)]
    for f in ('noch-2026-09-01.md', 'noch-2026-10-06.md', 'chuzhoj.txt'): open(os.path.join(SOST, f), 'w').close()
    noch('2026-10-07', mnogo)
    k, v = zapusk(); p = posl()
    poln = open(os.path.join(SOST, 'noch-2026-10-07.md'), encoding='utf-8').read()
    proba('С8 ночь с 40 красными → письмо не длиннее 5000 знаков, с «… ещё K — в полном файле» и путём к нему',
          k == 0 and len(p) <= 5000 and re.search(r'• … ещё \d+ — в полном файле', p) and 'Полный перечень: ' in p, f'{len(p)} знаков')
    proba('С8 полный файл — все 40 стендов, письмо + «ещё K» = 40',
          len(neozh(poln)) == 40 and bool(m := re.search(r"… ещё (\d+)", p)) and len(neozh(p)) + int(m[1]) == 40,
          f"полный {len(neozh(poln))}, в письме {len(neozh(p))}, {re.search(r'… ещё \d+', p)}")
    est = set(os.listdir(SOST))
    noch('2026-10-08', ['stend-p.sh'], poyasn=['не в карте: /etc/claude-oauth/token-podpiska-3'] + [f'не в карте: /etc/dlinnyj/put-{i:02d}' + 'x' * 40 for i in range(12)])
    k, v = zapusk(); p = posl(); st = next((x for x in neozh(p) if 'stend-p.sh' in x), '')
    proba('С10 пояснения провала («↳») → в строке стенда «пояснения: не в карте: <путь>», первый путь целиком',
          k == 0 and 'пояснения: не в карте: /etc/claude-oauth/token-podpiska-3' in st, st[:300])
    proba('С10 пояснения — целыми строками в 400 знаков на стенд, счёт «(показано K из 13)» (B-N-1754 r2)',
          bool(m := re.search(r'пояснения: (.*?) \(показано (\d+) из 13\) · (впервые|\d+-я ночь)', st)) and len(m[1]) <= 400
          and int(m[2]) < 13 and m[1].count('не в карте: ') == int(m[2]) and not m[1].endswith('…'), st[-260:])
    proba('С9 полный файл старше 14 ночей убран, свежий и посторонний — на месте',
          'noch-2026-09-01.md' not in est and {'noch-2026-10-06.md', 'chuzhoj.txt', 'noch-2026-10-07.md'} <= est, str(sorted(est)))
    # B-N-1754 r2: 1 находка → имя без счёта; 30 находок (обходчик показал 10 и дописал «↳ (показано 10 из 30)») → счёт из 30
    noch('2026-10-09', ['stend-q.sh'], poyasn=['не в карте: /etc/claude-oauth/token-podpiska-1'])
    k, v = zapusk(); p = posl(); st = next((x for x in neozh(p) if 'stend-q.sh' in x), '')
    proba('С11 одна находка → в письме её имя, без «показано»',
          k == 0 and 'пояснения: не в карте: /etc/claude-oauth/token-podpiska-1' in st and 'показано' not in st, st[:300])
    noch('2026-10-10', ['stend-r.sh'], poyasn=[f'не в карте: /etc/claude-oauth/token-test-{i:02d}' for i in range(1, 11)] + ['(показано 10 из 30)'])
    k, v = zapusk(); p = posl(); st = next((x for x in neozh(p) if 'stend-r.sh' in x), '')
    proba('С12 30 находок → имена и «(показано K из 30)», K ≤ 10, строка обходчика со счётом не попала в имена',
          k == 0 and 'не в карте: /etc/claude-oauth/token-test-01' in st and bool(m := re.search(r'\(показано (\d+) из 30\)', st))
          and int(m[1]) <= 10 and st.count('показано') == 1, st[-300:])
finally:
    shutil.rmtree(T, ignore_errors=True)
print(f'итог: {ok} из {ok + fail}')
sys.exit(0 if fail == 0 else 1)
