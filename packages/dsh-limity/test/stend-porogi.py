#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд порогов окон Claude в dsh-limity-zamer (B-N-1776, Аврора, 07.10.2026; задание Забавы 20:43Z, тексты — слово владельца 23:34 МСК).
Без root и без живых учёток: конфиг, таблица, выдача, состояние и канал тревог — подставные во временном каталоге. В таблице у каждой
подписки свежий замер шлюза ⇒ замер к SDK не ходит; работает только блок порогов. Предмет — довод 1 или DSH_LIMITY_ZAMER_TEST,
по умолчанию — замер из дерева пакета рядом.
Ожидаемые тексты считаются ИНАЧЕ, чем в предмете: МСК = UTC+3 через time.gmtime (предмет — zoneinfo Europe/Moscow).
ЧЕГО НЕ ЛОВИТ: настоящий agent-alert и Telegram · смену поясного правила МСК (стенд считает +3) · выдачу службы (её даёт стенд dsh-limity)."""
import json, os, shutil, sqlite3, subprocess, sys, tempfile, time
from pathlib import Path

ZDES = Path(__file__).resolve().parent.parent
PREDMET = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('DSH_LIMITY_ZAMER_TEST', ZDES / 'libexec/dsh-limity-zamer'))
if not PREDMET.is_file(): print('СЛЕПОТА: нет', PREDMET); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-porogi-'))
KONFIG = [{'provajder': 'claude', 'nomer': 1, 'kluch': 'podpiska-1', 'podpis': 'Клод-1 (Забава)', 'organizaciya': 'org-1'},
          {'provajder': 'claude', 'nomer': 2, 'kluch': 'podpiska-2', 'podpis': 'Клод-2 (MomICan)', 'organizaciya': 'org-2'},
          {'provajder': 'claude', 'nomer': 3, 'kluch': 'podpiska-5', 'organizaciya': 'org-3'},                       # подписи нет → ключ
          {'provajder': 'claude', 'nomer': 4, 'kluch': 'podpiska-9', 'podpis': 'Клод-4 (выкл)', 'organizaciya': 'org-4', 'vkl': False}]
(r / 'podpiski.json').write_text(json.dumps(KONFIG, ensure_ascii=False))
TEPER = time.time()
with sqlite3.connect(r / 'limity.db') as c:   # свежий замер шлюза у всех ⇒ «свежо», SDK не зовётся
    c.execute('CREATE TABLE zamer (moment_utc REAL, provajder TEXT, podpiska INTEGER, okno TEXT, izmereno INTEGER, istochnik TEXT)')
    c.executemany('INSERT INTO zamer VALUES (?,?,?,?,?,?)', [(TEPER + 3600, 'claude', n, 'five_hour', 1, 'sdk_event') for n in (1, 2, 3, 4)])
(r / 'alert.sh').write_text(f'#!/bin/bash\necho "$*" >> {r}/alerts.log\nexit $(cat {r}/alert-kod 2>/dev/null || echo 0)\n'); (r / 'alert.sh').chmod(0o755)
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'), DSH_LIMITY_VYDACHA=str(r / 'vydacha.json'),
           DSH_LIMITY_ZAMER_SOST=str(r / 'sost.json'), DSH_LIMITY_ZAMER_ALERT=str(r / 'alert.sh'), DSH_LIMITY_VHOD=str(r / 'vhod'),
           ENABLE_CLAUDEAI_MCP_SERVERS='false', DSH_LIMITY_ZAMER_MJS='/nonexistent', DSH_LIMITY_ZAMER_NODE='/nonexistent',
           DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'), DSH_LIMITY_REESTR=str(r / 'reestr.yaml'))   # r16 (Заря): сверка токенов — не живые /etc

def okno(d, sbros=None): return {'izrashodovano_dolya': d, 'sostoyanie': 'allowed', 'sbros_unix': sbros}
SOST = {1: (okno(0.10, TEPER + 3600), okno(0.30, TEPER + 86400)), 2: (okno(0.10, TEPER + 3600), okno(0.30, TEPER + 86400)),
        3: (okno(0.10, TEPER + 3600), okno(0.30, TEPER + 86400))}
SNYATO = {1: TEPER - 120, 2: TEPER - 120, 3: TEPER - 120}
VYDANO = None   # r20 (Заря): vydano_unix в корне выдачи; None — поля нет (выдача до r20 — момент файла)
def vydacha():
    p = {k: {'podpis': None, 'snyato_unix': int(SNYATO[n]), 'pyat_chasov': SOST[n][0], 'nedelya': SOST[n][1]}
         for n, k in ((1, 'podpiska-1'), (2, 'podpiska-2'), (3, 'podpiska-5'))}
    p['podpiska-9'] = {'vyklyuchena': True, 'snyato_unix': None, 'pyat_chasov': okno(1.0, TEPER + 60), 'nedelya': okno(1.0, TEPER + 60)}
    (r / 'vydacha.json').write_text(json.dumps({'snyato_unix': int(TEPER), **({'vydano_unix': VYDANO} if VYDANO is not None else {}), 'podpiski': p}, ensure_ascii=False))
def trevogi(): f = r / 'alerts.log'; return f.read_text().splitlines() if f.exists() else []
def prohod():
    vydacha(); bylo = len(trevogi())
    p = subprocess.run([sys.executable, '-B', str(PREDMET)], env=ENV, capture_output=True, text=True, timeout=60)
    return p.returncode, p.stdout + p.stderr, trevogi()[bylo:]
def msk(t):   # иначе, чем предмет: UTC+3 через gmtime
    a, b = time.gmtime(t + 3 * 3600), time.gmtime(TEPER + 3 * 3600)
    return time.strftime('%H:%M' if a[:3] == b[:3] else '%d.%m %H:%M', a) + ' МСК'
ok = vsego = 0
def proba(imya, uslovie, pokaz=''):
    global ok, vsego
    vsego += 1; ok += bool(uslovie)
    print(f'  {"✅" if uslovie else "❌"} {imya}' + ('' if uslovie else f' — {str(pokaz)[-500:]}'))

try:
    k, v, t = prohod(); proba('П1 исправное: все ниже порогов, свежо, выключенная 100% → тревог 0, код 0', k == 0 and t == [], (k, t, v))
    s5 = TEPER + 600; SOST[2] = (okno(0.85, s5), SOST[2][1])
    k, v, t = prohod(); proba('П2 5 ч 0.85 → одна строка «⚠️ Клод-2 (MomICan): 5 ч 85% · сброс <МСК>»', t == [f'⚠️ Клод-2 (MomICan): 5 ч 85% · сброс {msk(s5)}'], t)
    SOST[2] = (okno(0.90, s5), SOST[2][1])
    k, v, t = prohod(); proba('П3 повтор той же ступени (0.90 ≥ 0.85) → молчит', k == 0 and t == [], t)
    s7 = TEPER + 2 * 86400; SOST[1] = (SOST[1][0], okno(0.80, s7))
    k, v, t = prohod(); proba('П4 неделя 0.80 → «⚠️ Клод-1 (Забава): неделя 80% · сброс <дата МСК>»', t == [f'⚠️ Клод-1 (Забава): неделя 80% · сброс {msk(s7)}'], t)
    SOST[1] = (SOST[1][0], okno(1.0, s7))
    k, v, t = prohod(); proba('П5 неделя 1.0 → «🔴 Клод-1 (Забава): неделя 100% · сброс <дата МСК>» (переход ступени вверх)', t == [f'🔴 Клод-1 (Забава): неделя 100% · сброс {msk(s7)}'], t)
    proba('П5 дата в сбросе — не сегодня', msk(s7)[2] == '.' and msk(s5).count('.') <= 1, msk(s7))
    SOST[1] = (SOST[1][0], okno(0.85, s7))
    k, v, t = prohod(); proba('П6 неделя 1.0 → 0.85 → «✅ Клод-1 (Забава): неделя снова ниже 90%»', t == ['✅ Клод-1 (Забава): неделя снова ниже 90%'], t)
    SOST[1] = (SOST[1][0], okno(0.20, s7))
    k, v, t = prohod(); proba('П7 неделя 0.20 → «✅ Клод-1 (Забава): неделя снова ниже 80%»', t == ['✅ Клод-1 (Забава): неделя снова ниже 80%'], t)
    SOST[2] = (None, SOST[2][1])
    k, v, t = prohod(); proba('П8 окно 5 ч без замера, сброс ещё впереди → молчит (не 0)', k == 0 and t == [], t)
    st = json.loads((r / 'sost.json').read_text())
    if 'pyat_chasov' in ((st.get('2') or {}).get('okna_skazano') or {}):   # у предмета без порогов этой записи нет — П9 тогда красна, стенд идёт дальше
        st['2']['okna_skazano']['pyat_chasov']['sbros'] = TEPER - 60; (r / 'sost.json').write_text(json.dumps(st))
    k, v, t = prohod(); proba('П9 сброс прошёл (выдача обнулила окно) → «✅ Клод-2 (MomICan): 5 ч снова ниже 85%»', t == ['✅ Клод-2 (MomICan): 5 ч снова ниже 85%'], t)
    SNYATO[3] = TEPER - 131 * 60
    k, v, t = prohod(); proba('П10 возраст 131 мин → «⚠️ podpiska-5: нет свежего замера 2 ч 11 мин» (нет подписи — ключ)', t == ['⚠️ podpiska-5: нет свежего замера 2 ч 11 мин'], t)
    k, v, t = prohod(); proba('П11 возраст держится → молчит', t == [], t)
    SNYATO[3] = TEPER - 60
    k, v, t = prohod(); proba('П12 свежий снова → «✅ podpiska-5: замер снова свежий»', t == ['✅ podpiska-5: замер снова свежий'], t)
    SOST[1] = (SOST[1][0], {'sostoyanie': 'allowed', 'sbros_unix': s7})
    k, v, t = prohod(); proba('П13 нет поля доли → СЛЕПОТА, код 2, тревоги нет (не 0)', k == 2 and 'СЛЕПОТА' in v and 'podpiska-1.nedelya' in v and t == [], (k, v[-300:], t))
    SOST[1] = (okno(0.95, s5), okno(0.20, s7)); (r / 'alert-kod').write_text('1')
    k, v, t = prohod(); proba('П14 канал отказал → «сказано» не ставится (в журнале «НЕ доставлена»)', 'ступень 0→1 НЕ доставлена' in v, v[-300:])
    (r / 'alert-kod').write_text('0')
    k, v, t = prohod(); proba('П15 канал ожил → та же тревога доставлена один раз', t == [f'⚠️ Клод-1 (Забава): 5 ч 95% · сброс {msk(s5)}'], t)
    VYDANO = int(TEPER - 41 * 60)   # r20: служба dsh-limity молчит 41 мин (порог 40)
    k, v, t = prohod(); proba('П17 r20 vydano_unix 41 мин назад → «⚠️ dsh-limity: выдача не обновлялась 41 мин → sudo systemctl status dsh-limity»',
                             t == ['⚠️ dsh-limity: выдача не обновлялась 41 мин → sudo systemctl status dsh-limity'], t)
    k, v, t = prohod(); proba('П18 r20 молчит дальше → тишина', t == [], t)
    VYDANO = int(TEPER - 60)
    k, v, t = prohod(); proba('П19 r20 выдача свежая → «✅ dsh-limity: выдача снова обновляется»', t == ['✅ dsh-limity: выдача снова обновляется'], t)
    vse = trevogi()
    proba('П16 ни одна тревога не про выключенную, без путей/токенов/префикса, одна строка',
          vse and not any('выкл' in x or '/' in x or 'sk-ant' in x or 'лимиты подписок' in x or '\n' in x for x in vse), vse)
finally:
    shutil.rmtree(r, ignore_errors=True)
print(f'ИТОГ: {ok} из {vsego}')
sys.exit(0 if ok == vsego else 1)
