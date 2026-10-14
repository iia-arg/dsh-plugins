#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд уборки otkaz/ приёмной dsh-limity (B-N-1776d LOW, Заря, 08.10.2026).
Зовёт НАСТОЯЩУЮ службу (довод 1, по умолчанию sbin/dsh-limity пакета рядом) во временном каталоге: таблица, приёмная, otkaz/,
выдача, конфиг — подставные; живые /var, /etc, группы и учётки не трогаются. Пределы — умолчания службы (7 сут, 200 файлов).
Три пробы: исправное молчит · порча (переполнение и старьё) — убирается и печатает, сколько сняла · после — снова тишина.
ЧЕГО НЕ ЛОВИТ: права и владельца файлов otkaz/ (стенд кладёт их своей учёткой) · уборку при отсутствии приёмной (служба тогда
слепнет раньше уборки — так и задумано)."""
import os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

PREDMET = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'sbin/dsh-limity')
LIB = Path(__file__).resolve().parent.parent / 'lib'
if not PREDMET.is_file(): print('СЛЕПОТА: нет предмета', PREDMET); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-otkaz-'))
for d in ('vhod', 'otkaz', 'vydacha', 'inst'): (r / d).mkdir()
(r / 'podpiski.json').write_text('[]\n')
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'), DSH_LIMITY_VYDACHA=str(r / 'vydacha/limity.json'),
           DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'), DSH_LIMITY_CODEX_SOST=str(r / 'net.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'),
           DSH_LIMITY_LIB=str(LIB))
for k in ('DSH_LIMITY_OTKAZ_SROK_SUT', 'DSH_LIMITY_OTKAZ_PREDEL'): ENV.pop(k, None)   # проверяем умолчания службы
ok = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global ok, vsego
    vsego += 1; ok += bool(uslovie)
    print(f'  {"✅" if uslovie else "❌"} {imya}' + ('' if uslovie else ' | вывод: ' + str(vyvod)[-500:].replace('\n', ' ⏎ ')))
def sluzhba():
    p = subprocess.run([sys.executable, '-B', str(PREDMET)], env=ENV, capture_output=True, text=True, timeout=120)
    return p.stdout + p.stderr
VOZRAST = {}
def polozhit(imya, vozrast_s):
    VOZRAST[imya] = vozrast_s; f = r / 'otkaz' / imya; f.write_text('{"podlog": 1}\n'); t = time.time() - vozrast_s; os.utime(f, (t, t)); return f
def ostalos(): return sorted(f.name for f in (r / 'otkaz').iterdir())
try:
    for i in range(5): polozhit(f'svezh-{i:03d}.json', 3600 * (i + 1))
    v = sluzhba()
    proba('П1 исправное: 5 свежих отказов (1–5 ч) → служба молчит об otkaz/, все 5 на месте', 'otkaz/:' not in v and len(ostalos()) == 5, v)
    for i in range(245): polozhit(f'mnogo-{i:03d}.json', 60 * (i + 1))           # +245 свежих: 1..245 мин — всего свежих 250
    for i in range(3): polozhit(f'staryj-{i}.json', 8 * 86400 + i)                # 3 старше 7 суток
    print(f'  · порча внесена: в otkaz/ {len(ostalos())} файлов (свежих 250, старше 7 сут 3)')
    v = sluzhba(); ost = ostalos()
    svezhie = sorted((v_, n) for n, v_ in VOZRAST.items() if v_ <= 7 * 86400)   # ожидание — по заданным возрастам, иначе чем служба (та — по mtime)
    ozhid_snyaty = {n for _, n in svezhie[200:]} | {n for n, v_ in VOZRAST.items() if v_ > 7 * 86400}
    assert len(ozhid_snyaty) == 53, len(ozhid_snyaty)
    proba('П2 порча: 253 файла → «otkaz/: снято 53 (старше 7 сут — 3, сверх 200 — 50), осталось 200»; сняты ровно 3 старых и 50 старейших свежих',
          'otkaz/: снято 53 (старше 7 сут — 3, сверх 200 — 50), осталось 200' in v and len(ost) == 200
          and not any(n.startswith('staryj-') for n in ost) and not (ozhid_snyaty & set(ost)), v + f' | осталось {len(ost)}')
    v = sluzhba()
    proba('П3 после уборки: 200 в пределе → служба снова молчит об otkaz/, ничего не снято', 'otkaz/:' not in v and len(ostalos()) == 200, v)
finally:
    shutil.rmtree(r, ignore_errors=True)
print(f'ИТОГ стенда otkaz/: {ok} из {vsego}')
sys.exit(0 if ok == vsego and vsego else 1)
