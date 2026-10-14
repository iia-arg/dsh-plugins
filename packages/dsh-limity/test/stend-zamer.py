#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд источника Б dsh-limity 1.0.4 (B-N-1776): обёртка dsh-limity-zamer + замер dsh-limity-zamer.mjs (usage через вход pN)
+ приём службой dsh-limity + отрисовка страницей. Сети нет: SDK — заглушка fixtures/fake-sdk-usage.mjs (сценарий по
.credentials.json каталога; она же проверяет опции запуска). От root: замер через setpriv к учёткам замера (здесь
p1=nobody, p2=daemon, p3=bin), чужая — sys. Предметы — из дерева пакета или окружением DSH_LIMITY_TEST / DSH_LIMITY_ZAMER_TEST /
DSH_LIMITY_ZAMER_MJS_TEST.
ЧЕГО НЕ ЛОВИТ: настоящий SDK/CLI и сеть (это живая проба) · ACL боевой приёмной (монтаж) · настоящий auth logout (на стенде —
удаление .credentials.json: logout копии входа отозвал бы НАСТОЯЩИЙ вход на сервере)."""
import json, os, pwd, shutil, sqlite3, subprocess, sys, tempfile, time
from pathlib import Path

ZDES = Path(__file__).resolve().parent.parent
TEST = Path(__file__).resolve().parent
SLUZHBA = Path(os.environ.get('DSH_LIMITY_TEST', ZDES / 'sbin/dsh-limity'))
OBERTKA = Path(os.environ.get('DSH_LIMITY_ZAMER_TEST', ZDES / 'libexec/dsh-limity-zamer'))
ZAMER = Path(os.environ.get('DSH_LIMITY_ZAMER_MJS_TEST', ZDES / 'libexec/dsh-limity-zamer.mjs'))
FAKE = TEST / 'fixtures' / 'fake-sdk-usage.mjs'
if os.geteuid() != 0: print('СЛЕПОТА: стенд источника Б требует root (setpriv к учёткам замера, файлы чужих учёток)'); sys.exit(2)
for f in (SLUZHBA, OBERTKA, ZAMER, FAKE):
    if not f.is_file(): print('СЛЕПОТА: нет', f); sys.exit(2)
UCH = {1: 'nobody', 2: 'daemon', 3: 'bin'}; CHUZHOJ = 'sys'
ORG = {1: '062f0c1d-1111', 2: '12198fd9-2222', 3: '6e886f4b-3333'}
r = Path(tempfile.mkdtemp(prefix='stend-zamer-')); r.chmod(0o755)
for d in ('vhod', 'sdk', 'vydacha', 'inst', 'kat'): (r / d).mkdir()
(r / 'vhod').chmod(0o777); (r / 'sdk').chmod(0o777); (r / 'kat').chmod(0o755)   # на бою — ACL group:limity-vhod:-wx на приёмную
shutil.copy(FAKE, r / 'sdk' / 'fake-sdk-usage.mjs'); shutil.copy(ZAMER, r / 'zamer.mjs'); shutil.copy(TEST / 'fixtures' / 'usage-r5-p1.json', r / 'sdk' / 'usage-r5-p1.json')
for f in (r / 'sdk' / 'fake-sdk-usage.mjs', r / 'zamer.mjs', r / 'sdk' / 'usage-r5-p1.json'): f.chmod(0o644)   # копия несёт права исходника (0600 в дереве)
(r / 'sdk' / 'zapis.log').touch(); (r / 'sdk' / 'zapis.log').chmod(0o666)   # запись заглушки — общая для трёх учёток замера
def kat(n): return r / 'kat' / f'p{n}'
def vhod_v_katalog(n, vid='FAKE-OK', org=None, kr=70.85, refresh_dnej=30, wa='critical'):
    k = kat(n); k.mkdir(exist_ok=True)
    (k / '.credentials.json').write_text(json.dumps({'claudeAiOauth': {'accessToken': f'stend-{vid}-KR={kr}-WA={wa}-0123456789abcdef',
                                                                      'refreshTokenExpiresAt': int((time.time() + refresh_dnej * 86400) * 1000)}}))
    (k / '.claude.json').write_text(json.dumps({'oauthAccount': {'organizationUuid': org or ORG[n]}}))
    pw = pwd.getpwnam(UCH[n])
    for f in (k, k / '.credentials.json', k / '.claude.json'): os.chown(f, pw.pw_uid, pw.pw_gid)
    k.chmod(0o700); (k / '.credentials.json').chmod(0o600)
for n in (1, 2, 3): vhod_v_katalog(n)
(r / 'alert.sh').write_text(f'#!/bin/bash\necho "$1" >> {r}/alerts.log\nexit $(cat {r}/alert-kod 2>/dev/null || echo 0)\n'); (r / 'alert.sh').chmod(0o755)
(r / 'podpiski.json').write_text(json.dumps(
    [{'provajder': 'claude', 'nomer': n, 'kluch': k, 'organizaciya': ORG[n], 'zamer': UCH[n], 'zamer_katalog': str(kat(n))}
     for n, k in ((1, 'podpiska-1'), (2, 'podpiska-2'), (3, 'podpiska-5'))] + [{'provajder': 'codex', 'nomer': 3, 'kluch': 'podpiska-3'}]))
ENV = dict(os.environ, DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'), DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'),
           DSH_LIMITY_VYDACHA=str(r / 'vydacha/limity.json'), DSH_LIMITY_CODEX_SOST=str(r / 'net.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'),
           DSH_LIMITY_ZAMER_SOST=str(r / 'sost.json'), DSH_LIMITY_ZAMER_MJS=str(r / 'zamer.mjs'),
           DSH_LIMITY_ZAMER_SDK=str(r / 'sdk/fake-sdk-usage.mjs'), DSH_LIMITY_ZAMER_ALERT=str(r / 'alert.sh'),
           ENABLE_CLAUDEAI_MCP_SERVERS='false',   # как Environment= юнита
           DSH_LIMITY_ZAMER_KOREN=str(r / 'kat') + '/')   # r9: каталоги входа — прямые подкаталоги корня (konfig.py проверяет)
proshlo = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '| вывод:', str(vyvod)[-600:].replace('\n', ' ⏎ '))
def zvat(predmet):
    p = subprocess.run([sys.executable, '-B', str(predmet)], env=ENV, capture_output=True, text=True, timeout=300); return p.stdout + p.stderr
def zamery(): f = r / 'sdk/zapis.log'; return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
def trevogi(vid=None):   # vid: 'izm' — переходы измерено/не измерено, 'kred' — кредиты, 'srok' — срок входа
    f = r / 'alerts.log'; t = f.read_text().splitlines() if f.exists() else []
    slovo = {'izm': ('НЕ ИЗМЕРЕНО', 'снова измеряется'), 'kred': ('кредиты ≥',), 'srok': ('истекает',), 'ned': ('weekly_all',)}.get(vid)
    return [x for x in t if not slovo or any(w in x for w in slovo)]
def db(): return sqlite3.connect(r / 'limity.db')
def vydacha(): return json.loads((r / 'vydacha/limity.json').read_text())['podpiski']
def sost(): return json.loads((r / 'sost.json').read_text())
def sost_pishi(s): (r / 'sost.json').write_text(json.dumps(s))
def sostarit(n, minut):   # и свои попытки, и замеры подписки n — на minut минут в прошлое
    s = sost(); s[str(n)]['popytki'] = [t - minut * 60 for t in s[str(n)]['popytki']]; sost_pishi(s)
    with db() as c: c.execute('UPDATE zamer SET moment_utc = moment_utc - ? WHERE podpiska=?', (minut * 60, n))
def v_vhod(imya, z, uch):
    f = r / 'vhod' / imya; f.write_text(json.dumps(z)); os.chown(f, pwd.getpwnam(uch).pw_uid, -1)
def stranica():
    p = subprocess.run(['node', str(TEST / 'risuj-stranicu.js'), str(TEST / 'stranica-lim-insmat.html'), str(r / 'vydacha/limity.json')],
                       capture_output=True, text=True, timeout=30)
    return p.stdout + p.stderr
T = time.time()
try:
    # МИГРАЦИЯ: таблица прежнего вида (1.0.3, без predel/potracheno) с одной строкой — служба 1.0.4 добавляет столбцы, строку хранит
    with db() as c:
        c.execute("CREATE TABLE zamer (id INTEGER PRIMARY KEY, moment_utc REAL NOT NULL, prinyato_utc REAL NOT NULL, provajder TEXT NOT NULL,"
                  " podpiska INTEGER NOT NULL, okno TEXT NOT NULL, dolya REAL, sbros_utc REAL, status TEXT, izmereno INTEGER NOT NULL,"
                  " prichina TEXT, istochnik TEXT NOT NULL, otkuda TEXT NOT NULL, UNIQUE (provajder, podpiska, okno, moment_utc, otkuda))")
        c.execute("INSERT INTO zamer (moment_utc, prinyato_utc, provajder, podpiska, okno, dolya, sbros_utc, status, izmereno, prichina,"
                  " istochnik, otkuda) VALUES (?,?,'claude',2,'five_hour',0.5,?,'allowed',1,NULL,'sdk_event','gateway@stend')", (T - 300, T - 300, T + 7200))
    v = zvat(SLUZHBA); kol = {x[1] for x in db().execute('PRAGMA table_info(zamer)')}
    proba('миграция: таблица 1.0.3 → столбцы predel, potracheno добавлены; прежняя строка (подписка 2, событие шлюза 5 мин) цела',
          {'predel', 'potracheno'} <= kol and db().execute('SELECT COUNT(*) FROM zamer').fetchone()[0] == 1, v + str(kol))
    v = zvat(OBERTKA); h = zamery()
    vladelcy = {pwd.getpwuid(f.stat().st_uid).pw_name for f in (r / 'vhod').glob('*.json')}
    proba('исправное: замер по 1 и 3, по 2 (событие шлюза 5 мин) — нет; от СВОИХ учёток, в своих каталогах; опции соблюдены; 6 строк + 2 снимка',
          '1: замер → izmereno' in v and '3: замер → izmereno' in v and '2: свежо' in v and len(h) == 2
          and sorted(x['uid'] for x in h) == sorted(pwd.getpwnam(UCH[n]).pw_uid for n in (1, 3)) and not any(x['plohie'] for x in h)
          and {x['dom'] for x in h} == {str(kat(1)), str(kat(3))} and len(list((r / 'vhod').glob('*.json'))) == 8 and vladelcy == {UCH[1], UCH[3]},
          v + str(h))
    v2 = zvat(SLUZHBA); d = vydacha(); p1, p5 = d['podpiska-1'], d['podpiska-5']; per = p1.get('pererashod') or {}; kr = p1.get('kredity') or {}
    proba('служба: принято 8 (6 строк + 2 снимка), отказано 0; подписка 1: неделя 1.0, 5ч 0; pererashod allowed; kredity 14.17 из 20.00 USD (центы ÷100; 0.7085); подписка 3 — то же',
          'принято 8, отказано 0' in v2 and (p1['nedelya'] or {}).get('izrashodovano_dolya') == 1.0 and (p1['pyat_chasov'] or {}).get('izrashodovano_dolya') == 0
          and per.get('sostoyanie') == 'allowed' and kr.get('potracheno_usd') == 14.17 and kr.get('predel_usd') == 20.0 and kr.get('vklyucheny') is True
          and kr.get('predel_dostignut') is False and abs(kr.get('dolya', 0) - 0.7085) < 1e-9 and (p5.get('kredity') or {}).get('potracheno_usd') == 14.17,
          v2 + json.dumps(p1, ensure_ascii=False))
    us = p1.get('usage') or {}; okna = {o['imya']: o for o in us.get('okna', [])}; lim = {l['vid']: l for l in us.get('limits', [])}
    proba('выдача usage (ВСЁ, как страница usage клиента): окна по имени — five_hour, seven_day, iguana_necktie (предел 250 USD, сброс), НЕИЗВЕСТНОЕ novoe_okno с подполем; '
          'limits: weekly_all 100% critical, weekly_scoped Fable 4%; po_modelyam Fable 0.04; разбивка недели 4 строки (Claude Code 100); spend 14.17/20.0; '
          'прочее сырым: member_dashboard_available, neizvestnoe_pole; пустые окна (seven_day_opus …) не выдаются',
          set(okna) == {'five_hour', 'seven_day', 'iguana_necktie', 'novoe_okno'} and okna['iguana_necktie']['limit_usd'] == 250
          and okna['iguana_necktie']['sbros_unix'] and okna['novoe_okno']['prochee'] == {'novoe_pole': 1}
          and lim.get('weekly_all', {}).get('uroven') == 'critical' and lim.get('weekly_scoped', {}).get('model') == 'Fable' and lim['weekly_scoped']['procent'] == 4
          and us['po_modelyam'][0]['model'] == 'Fable' and us['po_modelyam'][0]['dolya'] == 0.04 and len(us['razbivka_nedeli']['stroki']) == 4
          and us['razbivka_nedeli']['stroki'][0] == {'kluch': 'claude_code', 'imya': 'Claude Code', 'procent': 100}
          and us['spend']['potracheno'] == 14.17 and us['spend']['predel'] == 20.0 and us['kredity']['potracheno'] == 14.17
          and us['prochee'] == {'member_dashboard_available': False, 'neizvestnoe_pole': {'a': 1}} and us['tip_podpiski'] == 'max',
          json.dumps(us, ensure_ascii=False)[:1500])
    s = stranica(); k1 = [k for k in s.split('\n') if k.startswith(' Клод-1')]
    proba('страница: Клод-1 «перерасход: разрешён — при исчерпании работа продолжится», без «ОСТАНОВИТСЯ»',
          len(k1) == 1 and 'перерасход: разрешён' in k1[0] and 'ОСТАНОВИТСЯ' not in k1[0], s[-600:])
    proba('в таблице otkuda = zamer@<учётка своей подписки>: 3 строки от p1, 3 от p3',
          db().execute("SELECT COUNT(*) FROM zamer WHERE istochnik='sdk_usage' AND podpiska=1 AND otkuda=?", (f'zamer@{UCH[1]}',)).fetchone()[0] == 3
          and db().execute("SELECT COUNT(*) FROM zamer WHERE istochnik='sdk_usage' AND podpiska=3 AND otkuda=?", (f'zamer@{UCH[3]}',)).fetchone()[0] == 3)
    proba('первое «измерено» — без тревоги перехода; кредиты 70.85% → по ОДНОЙ «≥50%» на 1 и 3; weekly_all critical → по ОДНОЙ на 1 и 3; срока — нет',
          trevogi('izm') == [] and len(trevogi('kred')) == 2 and all('≥50%' in x for x in trevogi('kred')) and trevogi('srok') == []
          and len(trevogi('ned')) == 2 and all('CRITICAL' in x for x in trevogi('ned')), trevogi())
    n0 = len(zamery()); v = zvat(OBERTKA)
    proba('повтор сразу → 0 новых замеров', len(zamery()) == n0 and 'замер →' not in v, v)
    # ПОРЧА: вход p3 отозван (на стенде — нет .credentials.json)
    (kat(3) / '.credentials.json').unlink(); sostarit(3, 61); n0 = len(zamery())
    v = zvat(OBERTKA); t = trevogi()
    t = trevogi('izm')
    proba('порча (вход p3 отозван): замер → ne_izmereno «вход отозван», SDK не звался; тревога ОДНА «НЕ ИЗМЕРЕНО»',
          '3: замер → ne_izmereno' in v and 'вход отозван' in v and len(zamery()) == n0 and len(t) == 1 and 'НЕ ИЗМЕРЕНО' in t[0], v + str(t))
    v2 = zvat(SLUZHBA); p5 = vydacha()['podpiska-5']
    proba('служба: «не измерено» принято; podpiska-5 без окон, zhdyom «вход отозван» (не «ноль»)',
          'принято 2' in v2 and p5['pyat_chasov'] is None and 'вход отозван' in p5.get('zhdyom', ''), v2 + json.dumps(p5, ensure_ascii=False))
    sostarit(3, 61); v = zvat(OBERTKA)
    proba('повтор порчи через час: снова не измерено, НОВОЙ тревоги нет', '3: замер → ne_izmereno' in v and len(trevogi('izm')) == 1, v + str(trevogi()))
    vhod_v_katalog(3); sostarit(3, 61); v = zvat(OBERTKA); t = trevogi('izm')
    proba('возврат: замер → izmereno, тревога ОДНА «снова измеряется»', '3: замер → izmereno' in v and len(t) == 2 and 'снова измеряется' in t[1], v + str(t))
    zvat(SLUZHBA)
    # ПОРЧИ сверок: чужая организация · tokenSource · rate_limits null
    for vid, org, ozhid in (('FAKE-OK', ORG[2], 'вход не той организации'), ('FAKE-TS', None, 'tokenSource'), ('FAKE-NULL', None, 'rate_limits null')):
        vhod_v_katalog(1, vid, org); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
        v = zvat(OBERTKA)
        proba(f'сверка: {vid}{" + организация подписки 2" if org else ""} → не измерено «{ozhid}»', '1: замер → ne_izmereno' in v and ozhid in v, v)
    vhod_v_katalog(1); zvat(SLUZHBA)
    # КРЕДИТЫ: пороги 50/80/95 по переходу вверх; новый месяц (доля упала) — молча; снова вверх — снова тревога
    k0 = len(trevogi('kred')); shagi = []
    for kr_ in (85, 96, 97, 10, 60):
        vhod_v_katalog(1, kr=kr_); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
        zvat(OBERTKA); shagi.append([x.split('кредиты ')[1][:5] for x in trevogi('kred')[k0:]]); k0 = len(trevogi('kred'))
    proba('кредиты подписки 1: 85% → «≥80%», 96% → «≥95%», 97% → тишина, 10% (новый месяц) → тишина, 60% → «≥50%»',
          shagi == [['≥80% '], ['≥95% '], [], [], ['≥50% ']], shagi)
    # WEEKLY_ALL: critical → (уже сказано) тишина; normal → тишина (сброс); снова critical → снова тревога
    w0 = len(trevogi('ned')); shagi = []
    for wa_ in ('critical', 'normal', 'critical'):
        vhod_v_katalog(1, wa=wa_); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
        zvat(OBERTKA); shagi.append(len(trevogi('ned')) - w0); w0 = len(trevogi('ned'))
    proba('weekly_all подписки 1: critical повторно → тишина, normal → тишина, снова critical → ОДНА тревога', shagi == [0, 0, 1], shagi)
    # СРОК ВХОДА: за 7 дней до refreshTokenExpiresAt — одна тревога; повтор — тишина
    vhod_v_katalog(1, refresh_dnej=5); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    v = zvat(OBERTKA); t1 = trevogi('srok'); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    zvat(OBERTKA); t2 = trevogi('srok')
    proba('срок входа: истекает через 5 дней → ОДНА тревога «истекает … нужен повторный вход»; следующий замер — без повтора',
          len(t1) == 1 and 'подписка 1' in t1[0] and 'повторный вход' in t1[0] and len(t2) == 1, v + str(t2))
    vhod_v_katalog(1); zvat(SLUZHBA)
    # БЕЗ ENABLE_CLAUDEAI_MCP_SERVERS=false: обёртка — ни одного замера; замер напрямую — отказ код 2
    n0 = len(zamery()); bez = {k: v for k, v in ENV.items() if k != 'ENABLE_CLAUDEAI_MCP_SERVERS'}
    sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    pw = subprocess.run([sys.executable, '-B', str(OBERTKA)], env=bez, capture_output=True, text=True, timeout=120)
    pz = subprocess.run(['node', str(r / 'zamer.mjs')], env=dict(bez, DSH_LIMITY_ZAMER_N='1', DSH_LIMITY_ZAMER_KATALOG=str(kat(1)),
                        DSH_LIMITY_ZAMER_ORG=ORG[1]), capture_output=True, text=True, timeout=60)
    proba('без ENABLE_CLAUDEAI_MCP_SERVERS=false: обёртка — СЛЕПОТА код 2 и 0 замеров; замер напрямую — slepota код 2',
          pw.returncode == 2 and 'СЛЕПОТА: ENABLE_CLAUDEAI_MCP_SERVERS' in pw.stdout and len(zamery()) == n0
          and pz.returncode == 2 and '"slepota"' in pz.stdout, pw.stdout + pz.stdout)
    # ЧУЖИЕ строки в приёмной
    st = {'moment_utc': time.time() - 5, 'provajder': 'claude', 'podpiska': 1, 'okno': 'five_hour', 'dolya': 0.05, 'sbros_utc': T + 7200,
          'status': None, 'izmereno': 1, 'prichina': None, 'istochnik': 'sdk_usage', 'otkuda': 'zamer'}
    v_vhod('chuzhoj.json', st, CHUZHOJ); v_vhod('sosed.json', st, UCH[3])
    v_vhod('predel.json', dict(st, predel=10), UCH[1]); v_vhod('kredit-event.json', dict(st, okno='extra_usage', istochnik='sdk_event'), UCH[1])
    v_vhod('snimok-chuzhoj.json', {'vid': 'usage_snimok', 'moment_utc': time.time() - 5, 'podpiska': 1, 'subscription_type': 'max',
                                   'rate_limits': {'five_hour': {'utilization': 1}}, 'okno': 'snimok'}, UCH[3])
    v2 = zvat(SLUZHBA)
    proba('чужие: sdk_usage подписки 1 от sys и от учётки p3; predel у окна five_hour; extra_usage из sdk_event; СНИМОК подписки 1 от учётки p3 → отказано 5, принято 0',
          'принято 0, отказано 5' in v2 and f'снимок подписки 1 — только от {UCH[1]}' in v2 and f'только от {UCH[1]}, а файл учётки {CHUZHOJ}' in v2 and f'а файл учётки {UCH[3]}' in v2
          and 'predel/potracheno только у окна extra_usage' in v2, v2)
    # ПОТОЛОК
    s = sost(); s['1']['popytki'] = [time.time() - 3600 * (1.1 + 0.95 * k) for k in range(24)][::-1]; sost_pishi(s)
    with db() as c: c.execute('UPDATE zamer SET moment_utc = moment_utc - 7200 WHERE podpiska=1')
    n0 = len(zamery()); v = zvat(OBERTKA)
    proba('потолок: 24 попытки за сутки по подписке 1 → замера нет, «ПОТОЛОК 24»', len(zamery()) == n0 and 'ПОТОЛОК 24' in v, v)
    # ОПЦИИ: порча копии замера — флаг, который режет usage
    kod = (r / 'zamer.mjs').read_text()
    porcha = kod.replace("ENABLE_CLAUDEAI_MCP_SERVERS: 'false',", "ENABLE_CLAUDEAI_MCP_SERVERS: 'false', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',")
    print(f'  · порча копии замера: файлы различны — {kod != porcha}')
    (r / 'zamer.mjs').write_text(porcha); s = sost(); s['1']['popytki'] = [time.time() - 7200]; sost_pishi(s)
    v = zvat(OBERTKA); h = zamery()
    proba('порча опций (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) → заглушка отвергает, «не измерено», в записи — bez_NONESSENTIAL',
          '1: замер → ne_izmereno' in v and 'bez_NONESSENTIAL' in h[-1]['plohie'], v + str(h[-1:]))
    # r8 (Вениамин, мелочь 3): валюта кредитов — из ответа; нет её в ответе ⇒ kredity.valyuta = null, а не «USD»
    (r / 'zamer.mjs').write_text(kod)   # снять порчу опций предыдущей пробы
    vhod_v_katalog(1, vid='FAKE-OK-BEZVAL'); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    zvat(OBERTKA); zvat(SLUZHBA); p1 = vydacha()['podpiska-1']
    vhod_v_katalog(1); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    zvat(OBERTKA); zvat(SLUZHBA); p1b = vydacha()['podpiska-1']
    proba('валюта кредитов: ответ без currency → kredity.valyuta = null (и usage.kredity.valyuta = null); ответ с USD → «USD»',
          (p1.get('kredity') or {}).get('valyuta', 'нет-поля') is None and ((p1.get('usage') or {}).get('kredity') or {}).get('valyuta', 'нет-поля') is None
          and (p1b.get('kredity') or {}).get('valyuta') == 'USD', json.dumps([p1.get('kredity'), p1b.get('kredity')], ensure_ascii=False))
    # r9 (Вениамин, мелочь r3): нет decimal_places / exponent — единица неизвестна ⇒ суммы null, причина названа; возврат — суммы снова
    vhod_v_katalog(1, vid='FAKE-OK-BEZDP'); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    zvat(OBERTKA); zvat(SLUZHBA); p1 = vydacha()['podpiska-1']; uk = (p1.get('usage') or {}).get('kredity') or {}; us = (p1.get('usage') or {}).get('spend') or {}
    vhod_v_katalog(1); sostarit(1, 61); s0 = sost(); s0['1']['popytki'] = s0['1']['popytki'][-1:]; sost_pishi(s0)
    zvat(OBERTKA); zvat(SLUZHBA); p1b = vydacha()['podpiska-1']
    proba('нет decimal_places/exponent → kredity.predel_usd и potracheno_usd null, usage.kredity суммы null и edinica_neizvestna=true, spend.potracheno null, '
          'причина «единица … неизвестна»; с ними — 20.0 / 14.17 снова',
          (p1.get('kredity') or {}).get('predel_usd', 0) is None and (p1.get('kredity') or {}).get('potracheno_usd', 0) is None
          and uk.get('mesyachnyj_predel', 0) is None and uk.get('edinica_neizvestna') is True and us.get('potracheno', 0) is None
          and 'единица' in ((p1.get('pererashod') or {}).get('prichina') or '')
          and (p1b.get('kredity') or {}).get('predel_usd') == 20.0 and (p1b.get('kredity') or {}).get('potracheno_usd') == 14.17,
          json.dumps([p1.get('kredity'), p1.get('pererashod'), uk, p1b.get('kredity')], ensure_ascii=False))
    # ЮНИТ (решение Забавы 19:27Z): окружение — из Environment= юнита пакета; подписка 2 при СВЕЖЕМ событии шлюза замеряется
    (r / 'zamer.mjs').write_text(kod); yunit = {}
    for l in (ZDES / 'systemd/dsh-limity-zamer.service').read_text().splitlines():
        if l.startswith('Environment='): k, _, zn = l[len('Environment='):].partition('='); yunit[k] = zn
    s = sost()
    for n in ('1', '2', '3'): s.setdefault(n, {'popytki': [], 'ishod': None, 'skazano': None})['popytki'] = [] if n == '2' else [time.time() - 60]
    sost_pishi(s)
    with db() as c:
        c.execute("INSERT INTO zamer (moment_utc, prinyato_utc, provajder, podpiska, okno, dolya, sbros_utc, status, izmereno, prichina,"
                  " istochnik, otkuda) VALUES (?,?,'claude',2,'five_hour',0.5,?,'allowed',1,NULL,'sdk_event','gateway@stend')",
                  (time.time() - 60, time.time() - 60, T + 7200))
    n0 = len(zamery())
    p = subprocess.run([sys.executable, '-B', str(OBERTKA)], env=dict(ENV, **yunit), capture_output=True, text=True, timeout=120)
    h = zamery()[n0:]
    proba(f'юнит: Environment= {yunit} → подписка 2 при событии шлюза 1 мин назад ЗАМЕРЯЕТСЯ, от своей учётки; 1 и 3 — нет (свой замер 1 мин)',
          yunit.get('DSH_LIMITY_ZAMER_SVEZHO_MIN') == '0' and '2: замер → izmereno' in p.stdout and len(h) == 1
          and h[0]['uid'] == pwd.getpwnam(UCH[2]).pw_uid, p.stdout + p.stderr)
    vse = ''.join(f.read_text() for f in (r / 'vhod').rglob('*') if f.is_file()) + (r / 'alerts.log').read_text() + (r / 'vydacha/limity.json').read_text()
    proba('значения подставного токена нет ни в приёмной, ни в тревогах, ни в выдаче', 'stend-FAKE' not in vse)
finally:
    print(f'ИТОГ стенда источника Б (usage): {proshlo} из {vsego}'); shutil.rmtree(r, ignore_errors=True)
sys.exit(0 if proshlo == vsego and vsego else 1)
