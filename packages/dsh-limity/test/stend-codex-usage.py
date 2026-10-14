#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд r5: Codex «всё, как у Claude» (B-N-1776; слово владельца 22:12 МСК «и тоже самое с подписками»). Сети и root не нужно:
служба dsh-limity читает ПОДСТАВНОЕ состояние codex-limit-watch с сырым ответом app-server (форма снята с живого журнала
RATE_LIMITS 07.10 19:43Z: подписка 3 — кредиты 11689.87, подписка 4 — кредитов нет) + rateLimitResetCredits, rateLimitsByLimitId
и неизвестное поле. Проверяет выдачу Codex (поля, которые страница УЖЕ рисует) и поле usage; без сырого ответа — как раньше.
ЧЕГО НЕ ЛОВИТ: настоящий app-server (сторож — отдельный кандидат, его стенд обхода) · живую страницу на vps-ru."""
import json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ZDES = Path(__file__).resolve().parent.parent; TEST = Path(__file__).resolve().parent
SLUZHBA = Path(os.environ.get('DSH_LIMITY_TEST', ZDES / 'sbin/dsh-limity'))
r = Path(tempfile.mkdtemp(prefix='stend-codex-usage-'))
T = time.time()
def otv(u, kr, est, sbrosy=None):
    return {'ordinaryUsageAllowed': True, 'rateLimits': {'primary': {'usedPercent': u, 'windowDurationMins': 10080, 'resetsAt': int(T + 6 * 86400)},
            'secondary': None, 'credits': {'hasCredits': est, 'balance': kr, 'unlimited': False}, 'spendControlReached': False,
            'planType': 'pro', 'limitId': 'codex', 'rateLimitReachedType': None},
            'rateLimitsByLimitId': {'codex': {'primary': {'usedPercent': u, 'windowDurationMins': 10080}},
                                    'codex_spark': {'primary': {'usedPercent': 7, 'windowDurationMins': 300, 'resetsAt': int(T + 3600)}}},
            'rateLimitResetCredits': {'availableCount': sbrosy}, 'novoePole': {'x': 1}, '_otbrosheno': ['accountId']}
def sostoyanie(syroe=True):
    z = {'3': {'at': T - 60, 'dolya': 0.24, 'okno': ['codex', 'primary', 10080, int(T + 6 * 86400)]},
         '4': {'at': T - 60, 'dolya': 0.86, 'okno': ['codex', 'primary', 10080, int(T + 6 * 86400)]}}
    if syroe: z['3']['syroe'] = otv(24, '11689.8730500000', True, 1); z['4']['syroe'] = otv(86, '0', False, 0)
    (r / 'codex.json').write_text(json.dumps({'zamer': z}))
(r / 'podpiski.json').write_text(json.dumps([{'provajder': 'claude', 'nomer': 1, 'kluch': 'podpiska-1', 'podpis': 'Клод-1', 'poryadok': 0, 'organizaciya': 'o1'},
    {'provajder': 'codex', 'nomer': 3, 'kluch': 'podpiska-3', 'podpis': 'Кодекс-1 (MomICan)', 'poryadok': 1},
    {'provajder': 'codex', 'nomer': 4, 'kluch': 'podpiska-4', 'podpis': 'Кодекс-2 (Med)', 'poryadok': 2}], ensure_ascii=False))
(r / 'vhod').mkdir(); (r / 'inst').mkdir()
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'), DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'),
           DSH_LIMITY_VYDACHA=str(r / 'limity.json'), DSH_LIMITY_CODEX_SOST=str(r / 'codex.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'))
proshlo = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '| вывод:', str(vyvod)[-700:].replace('\n', ' ⏎ '))
def zapusk():
    p = subprocess.run([sys.executable, '-B', str(SLUZHBA)], env=ENV, capture_output=True, text=True, timeout=60); return p.stdout + p.stderr
def stranica():
    return subprocess.run(['node', str(TEST / 'risuj-stranicu.js'), str(TEST / 'stranica-lim-insmat.html'), str(r / 'limity.json')],
                          capture_output=True, text=True, timeout=30).stdout
try:
    sostoyanie(syroe=False); v = zapusk(); d = json.loads((r / 'limity.json').read_text())['podpiski']
    proba('состояние БЕЗ сырого ответа (нынешний бой): выдача как раньше — доля 0.24, кредиты null, chego_net прежний, usage нет',
          (d['podpiska-3']['nedelya'] or {}).get('izrashodovano_dolya') == 0.24 and d['podpiska-3'].get('kredity') is None
          and 'не несёт' in d['podpiska-3']['chego_net'] and 'usage' not in d['podpiska-3'], v + json.dumps(d['podpiska-3'], ensure_ascii=False))
    sostoyanie(syroe=True); (r / 'codex.json').write_text((r / 'codex.json').read_text().replace(f'"at": {T - 60}', f'"at": {T - 30}'))
    v = zapusk(); d = json.loads((r / 'limity.json').read_text())['podpiski']; p3, p4 = d['podpiska-3'], d['podpiska-4']
    proba('Кодекс-1: окно 7 сут (okno_sekund 604800), кредиты есть — остаток 11689.87, не исчерпаны; предел не достигнут; сбросов досрочных 1; план pro',
          (p3.get('nedelya') or {}).get('okno_sekund') == 604800 and p3.get('kredity') == {'est': True, 'bezlimit': False, 'ostatok': 11689.87, 'pererashod_ischerpan': False}
          and p3.get('predel_dostignut') is False and p3.get('limit_rashodov_dostignut') is False and (p3.get('sbrosy_kvoty') or {}).get('dostupno') == 1 and p3.get('plan') == 'pro',
          v + json.dumps(p3, ensure_ascii=False)[:900])
    proba('Кодекс-2: кредитов нет (hasCredits false, остаток 0) ⇒ pererashod_ischerpan true',
          (p4.get('kredity') or {}).get('est') is False and (p4.get('kredity') or {}).get('ostatok') == 0 and (p4.get('kredity') or {}).get('pererashod_ischerpan') is True, json.dumps(p4.get('kredity')))
    u = p3.get('usage') or {'okna': [], 'kredity': {}, 'prochee': None}; okna = {o['imya']: o for o in u['okna']}
    proba('usage Кодекс-1: окна по имени — codex/primary 0.24, codex_spark/primary 0.07 (5 ч); кредиты, план, досрочные сбросы; «прочее»: novoePole и _otbrosheno сырыми',
          set(okna) == {'codex/primary', 'codex_spark/primary'} and okna['codex_spark/primary']['dolya'] == 0.07 and okna['codex_spark/primary']['okno_minut'] == 300
          and (u.get('kredity') or {}).get('balans') == '11689.8730500000' and u.get('plan') == 'pro' and u.get('dosrochnye_sbrosy') == {'availableCount': 1}
          and u.get('prochee') == {'novoePole': {'x': 1}, '_otbrosheno': ['accountId']}, json.dumps(u, ensure_ascii=False)[:900])
    s = stranica(); k = [x for x in s.split('\n') if 'Кодекс-1' in x or 'остаток' in x or 'предел' in x]
    proba('страница (её нынешний код, без правки) рисует Кодекс-1: «окно 7 сут», «предел не достигнут», «остаток 11689.87»; Кодекс-2 — кредиты красным',
          'окно 7 сут' in s and 'предел не достигнут' in s and 'остаток 11689.87' in s, s[-1500:])
    proba('в таблице снимков: provajder codex для 3 и 4, claude-снимков 0', 
          __import__('sqlite3').connect(r / 'limity.db').execute("SELECT provajder, COUNT(*) FROM usage_snimok GROUP BY 1").fetchall() == [('codex', 2)])
finally:
    print(f'ИТОГ стенда Codex usage: {proshlo} из {vsego}'); shutil.rmtree(r, ignore_errors=True)
sys.exit(0 if proshlo == vsego and vsego else 1)
