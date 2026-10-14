#!/usr/bin/python3 -B
"""Стенд читателя лимитов переключателя подписок Claude (B-N-1776 такт 4, Аврора, 07.10.2026).

Предмет: pereklyuchatel-podpiski-limity.py — правило свежести Вениамина (07.10 19:24 МСК) на таблице dsh-limity.
Зов: stend-limity-pereklyuchatelya.py [читатель] [настройка]; по умолчанию — БОЕВЫЕ /usr/local/libexec/… и /etc/default/…
(довод — для проб кандидата и порчи). Всё на подставной базе той же схемы во временном каталоге; боевую базу не открывает.
Коды: 0 — все пробы зелёные; 1 — есть красная; 2 — слепота (нет читателя/настройки).
ГРАНИЦА (разбор обхода 08.10, Заря; замечание Авроры): пределы возраста стенд берёт ИЗ НАСТРОЙКИ — проверяет, что читатель
её слушается, а не само значение. Связь SVOBODNA_5CH_VOZRAST_MIN=130 с частотой замера (2 × раз в час + такт 10 мин,
B-N-1806) не стережёт никто: сменится частота замера без правки настройки — стенд останется зелёным.
"""
import os, shutil, sqlite3, subprocess, sys, tempfile, time

CHITATEL = sys.argv[1] if len(sys.argv) > 1 else '/usr/local/libexec/pereklyuchatel-podpiski-limity.py'
NASTR = sys.argv[2] if len(sys.argv) > 2 else '/etc/default/pereklyuchatel-podpiski-limity'
for f in (CHITATEL, NASTR):
    if not os.path.isfile(f):
        print(f'СЛЕПОТА: нет {f}'); sys.exit(2)

SHEMA = '''CREATE TABLE zamer (
  id INTEGER PRIMARY KEY, moment_utc REAL NOT NULL, prinyato_utc REAL NOT NULL,
  provajder TEXT NOT NULL CHECK (provajder IN ('claude','codex')), podpiska INTEGER NOT NULL, okno TEXT NOT NULL,
  dolya REAL CHECK (dolya IS NULL OR (dolya >= 0 AND dolya <= 1.5)), sbros_utc REAL, status TEXT,
  izmereno INTEGER NOT NULL CHECK (izmereno IN (0,1)), prichina TEXT, istochnik TEXT NOT NULL, otkuda TEXT NOT NULL,
  CHECK (izmereno = 1 OR prichina IS NOT NULL),
  UNIQUE (provajder, podpiska, okno, moment_utc, otkuda));'''

RAB = tempfile.mkdtemp(prefix='stend-limity.')
ok = vsego = 0
NOW = time.time()
M, H = 60, 3600


def baza(stroki):
    """stroki: (podpiska, okno, минут назад, доля|None, сброс через минут|None, status, izmereno[, provajder])."""
    put = os.path.join(RAB, f'b{vsego}.db')
    db = sqlite3.connect(put); db.execute(SHEMA)
    for s in stroki:
        pod, okno, nazad, dolya, sbros, status, izm = s[:7]
        prov = s[7] if len(s) > 7 else 'claude'
        db.execute('INSERT INTO zamer (moment_utc, prinyato_utc, provajder, podpiska, okno, dolya, sbros_utc, status, izmereno,'
                   ' prichina, istochnik, otkuda) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                   (NOW - nazad * M, NOW, prov, pod, okno, dolya, None if sbros is None else NOW + sbros * M, status, izm,
                    None if izm else 'проба', 'sdk_event', 'stend'))
    db.commit(); db.close()
    return put


def zov(put, pod='1', nastr=None):
    r = subprocess.run([sys.executable, '-B', CHITATEL, pod, '--baza', put, '--nastrojka', nastr or NASTR],
                       capture_output=True, text=True, timeout=30)
    return r.returncode, r.stdout.strip()


def sud(imya, kod_zhdu, stroki=None, pod='1', nastr=None, soderzhit=None, put=None):
    global ok, vsego
    vsego += 1
    kod, vyvod = zov(put or baza(stroki or []), pod, nastr)
    hor = kod == kod_zhdu and (soderzhit is None or soderzhit in vyvod)
    ok += hor
    print(f'  {"✅" if hor else "🔴"} {imya}' + ('' if hor else f' — код {kod}: {vyvod[:220]}'))


def nastr(tekst):
    put = os.path.join(RAB, f'n{vsego}.conf')
    open(put, 'w').write(tekst)
    return put


SVEZH5 = (1, 'five_hour', 3, 0.12, 120, 'allowed', 1)
SVEZH7 = (1, 'seven_day', 3, 0.40, 3000, 'allowed', 1)


def predel(klyuch):
    """B-N-1806 сменил SVOBODNA_5CH_VOZRAST_MIN 30 → 130 в настройке, а Л2/Л21 держали 30 в себе — обход 08.10 красный
    (Заря, разбор обхода 08.10). Предел — из ТОЙ ЖЕ настройки, что получает читатель; форма читателя: число или произведение."""
    for l in open(NASTR).read().splitlines():
        if l.startswith(klyuch + '='):
            v = 1.0
            for ch in l.split('=', 1)[1].strip().split('*'):
                v *= float(ch)
            return v
    shutil.rmtree(RAB, ignore_errors=True); print(f'СЛЕПОТА: в {NASTR} нет {klyuch}'); sys.exit(2)


P5, P7 = int(predel('SVOBODNA_5CH_VOZRAST_MIN')), int(predel('SVOBODNA_7D_VOZRAST_MIN'))
# Доли — тоже из настройки (тот же класс, что Л2: число жило в стенде, а меняют его в настройке).
D5, D7, ISCH = predel('SVOBODNA_5CH_DOLYA_MENSHE'), predel('SVOBODNA_7D_DOLYA_MENSHE'), predel('ISCHERPANA_DOLYA_OT')
print(f'== стенд читателя лимитов {time.strftime("%H:%M:%SZ", time.gmtime())}: {CHITATEL} · {NASTR} · пределы 5ч {P5} мин, неделя {P7} мин')
try:
    sud('Л1 исправное: 5ч 0.12 и неделя 0.40, 3 мин, сбросы впереди → свободна, код 0', 0, [SVEZH5, SVEZH7], soderzhit='свободна')
    sud(f'Л2 порча «старый замер 5ч»: {P5 + 1} мин → не измерено «последнее 0.12 {P5 + 1} мин назад», код 20', 20,
        [(1, 'five_hour', P5 + 1, 0.12, 120, 'allowed', 1), SVEZH7], soderzhit=f'последнее 0.12 allowed {P5 + 1} мин назад')
    sud(f'Л3 порча «старый замер недели»: {P7 + 1} мин → не измерено, код 20', 20, [SVEZH5, (1, 'seven_day', P7 + 1, 0.40, 3000, 'allowed', 1)])
    # Л4 — на границе недели (P7−1), а не числом 300 (замечание Авроры: опустят неделю — та же беда, что у Л2).
    # Смысл пробы «пороги окон свои» требует возраста СТАРШЕ предела 5ч; не различимы — слепота, не зелёное.
    if P7 - 1 <= P5:
        print(f'СЛЕПОТА: Л4 не различает окна — предел недели {P7} мин не больше предела 5ч {P5} + 1'); sys.exit(2)
    sud(f'Л4 неделя {P7 - 1} мин (предел {P7}) при свежей 5ч → свободна: пороги возраста у окон свои, код 0', 0,
        [SVEZH5, (1, 'seven_day', P7 - 1, 0.40, 3000, 'allowed', 1)])
    sud('Л5 порча «rejected до сброса»: замер 10 ч назад, сброс впереди → исчерпана без предела возраста, код 10', 10,
        [(1, 'five_hour', 600, 0.5, 60, 'rejected', 1), SVEZH7], soderzhit='исчерпана')
    sud(f'Л6 доля {ISCH:g} при allowed, сброс впереди → исчерпана, код 10', 10, [(1, 'five_hour', 5, ISCH, 60, 'allowed', 1), SVEZH7])
    sud('Л7 порча «сброс прошёл»: rejected, сброс минуту назад → не измерено (не исчерпана), код 20', 20,
        [(1, 'five_hour', 120, 1.0, -1, 'rejected', 1), SVEZH7], soderzhit='прошёл')
    sud(f'Л8 граница доли 5ч: {D5:g} → не измерено, код 20', 20, [(1, 'five_hour', 3, D5, 120, 'allowed', 1), SVEZH7])
    sud(f'Л9 граница доли 5ч: {D5 - 0.01:g} → свободна, код 0', 0, [(1, 'five_hour', 3, D5 - 0.01, 120, 'allowed', 1), SVEZH7])
    sud(f'Л10 граница доли недели: {D7:g} → не измерено, код 20', 20, [SVEZH5, (1, 'seven_day', 3, D7, 3000, 'allowed', 1)])
    sud('Л11 строка «не измерено» новее rejected с будущим сбросом → исчерпана остаётся, код 10', 10,
        [(1, 'five_hour', 30, 1.0, 60, 'rejected', 1), (1, 'five_hour', 1, None, None, None, 0), SVEZH7])
    sud('Л12 простаивающая: замеров нет → не измерено «замеров нет», код 20', 20, [], soderzhit='замеров нет')
    sud('Л13 подписки раздельны: rejected у 2 и Codex 3 не влияют на Claude 1 → свободна, код 0', 0,
        [SVEZH5, SVEZH7, (2, 'five_hour', 3, 1.0, 60, 'rejected', 1), (1, 'five_hour', 1, 1.0, 60, None, 1, 'codex')])
    sud('Л14 Claude 3 ищется как podpiska=3 (не ключ выдачи podpiska-5) → свободна, код 0', 0,
        [(3, 'five_hour', 3, 0.12, 120, 'allowed', 1), (3, 'seven_day', 3, 0.40, 3000, 'allowed', 1)], pod='3')
    sud('Л15 одно окно без замера → не измерено, код 20', 20, [SVEZH5])
    sud('Л16 сброс неизвестен (null) → не измерено, код 20', 20, [(1, 'five_hour', 3, 0.12, None, 'allowed', 1), SVEZH7])
    sud('Л17 настройки нет → не измерено, код 20', 20, [SVEZH5, SVEZH7], nastr=os.path.join(RAB, 'net.conf'))
    base = open(NASTR).read()
    sud('Л18 в настройке нет ключа SVOBODNA_7D_VOZRAST_MIN → не измерено, код 20', 20, [SVEZH5, SVEZH7],
        nastr=nastr('\n'.join(l for l in base.splitlines() if not l.startswith('SVOBODNA_7D_VOZRAST_MIN'))))
    sud('Л19 чужой ключ в настройке → не измерено, код 20', 20, [SVEZH5, SVEZH7], nastr=nastr(base + 'MAX_AGE_S=300\n'))
    # Как Л21: порча по КЛЮЧУ при любом значении и с печатью внесения — replace(«=6*60») при другой неделе менял 0 строк.
    stroki20 = [l if not l.startswith('SVOBODNA_7D_VOZRAST_MIN=') else 'SVOBODNA_7D_VOZRAST_MIN=6 часов'
                for l in base.splitlines()]
    zamen20 = sum(x != y for x, y in zip(base.splitlines(), stroki20))
    if zamen20 != 1:
        print(f'СЛЕПОТА: порча Л20 не внесена — замен {zamen20}, ждала 1'); sys.exit(2)
    sud(f'Л20 значение не формула («6 часов», замен {zamen20}) → не измерено, код 20', 20, [SVEZH5, SVEZH7],
        nastr=nastr('\n'.join(stroki20) + '\n'))
    # Порча печатает факт внесения: прежде replace(«=30») при живом 130 менял 0 строк, а проба оставалась зелёной.
    stroki21 = [l if not l.startswith('SVOBODNA_5CH_VOZRAST_MIN=') else f'SVOBODNA_5CH_VOZRAST_MIN={P5 + 60}'
                for l in base.splitlines()]
    zamen21 = sum(a != b for a, b in zip(base.splitlines(), stroki21))
    if zamen21 != 1:
        print(f'СЛЕПОТА: порча Л21 не внесена — замен {zamen21}, ждала 1'); sys.exit(2)
    sud(f'Л21 число берётся из настройки: SVOBODNA_5CH_VOZRAST_MIN={P5 + 60} (замен {zamen21}) → замер {P5 + 1} мин свободен, код 0', 0,
        [(1, 'five_hour', P5 + 1, 0.12, 120, 'allowed', 1), SVEZH7], nastr=nastr('\n'.join(stroki21) + '\n'))
    sud('Л22 базы нет → не измерено, код 20', 20, put=os.path.join(RAB, 'net.db'))
    vsego += 1
    kod_ = open(CHITATEL).read()
    hor = '/usr/bin/ssh' not in kod_ and 'import subprocess' not in kod_ and '/etc/claude-oauth/limity-read' not in kod_
    ok += hor
    print(f'  {"✅" if hor else "🔴"} Л23 в коде читателя нет вызова ssh (/usr/bin/ssh, subprocess, limity-read/ssh_config)')
finally:
    shutil.rmtree(RAB, ignore_errors=True)
print(f'ИТОГ: {ok} из {vsego}')
sys.exit(0 if ok == vsego else 1)
