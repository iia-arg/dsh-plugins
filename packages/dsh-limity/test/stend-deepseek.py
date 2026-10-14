#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд баланса DeepSeek dsh-limity r10 (B-N-1776; слово владельца 07.10 22:18 / 22:56 МСК; признаки Вениамина 19:56Z):
dsh-limity-deepseek (своя учётка — здесь nobody через setpriv; ключ — из подставного $CREDENTIALS_DIRECTORY) → приёмная → служба dsh-limity
(снимок — только от DSH_LIMITY_DS_UCH) → выдача; тревоги — dsh-limity-zamer (root) по таблице. Сети нет: сервер — подставной на 127.0.0.1.
От root (setpriv, chown). Предметы — из дерева пакета или окружением DSH_LIMITY_TEST / DSH_LIMITY_ZAMER_TEST / DSH_LIMITY_DS_TEST.
ЧЕГО НЕ ЛОВИТ: настоящий api.deepseek.com (живая проба) · настоящий LoadCredential systemd (здесь — каталог с файлами; признак — после монтажа) ·
то, что ключ не попал в argv (по построению: urllib, заголовок; стенд смотрит выводы, файлы, таблицу)."""
import http.server, json, os, pwd, shutil, sqlite3, subprocess, sys, tempfile, threading, time
from pathlib import Path

ZDES = Path(__file__).resolve().parent.parent
TEST = Path(__file__).resolve().parent
SLUZHBA = Path(os.environ.get('DSH_LIMITY_TEST', ZDES / 'sbin/dsh-limity'))
OBERTKA = Path(os.environ.get('DSH_LIMITY_ZAMER_TEST', ZDES / 'libexec/dsh-limity-zamer'))
DS = Path(os.environ.get('DSH_LIMITY_DS_TEST', ZDES / 'libexec/dsh-limity-deepseek'))
STRANICA = Path(os.environ.get('DSH_LIMITY_STRANICA_ZHIVAYA', '/nonexistent'))   # 1.0.9: снимок живой страницы — ВНЕ пакета, подаётся окружением
if os.geteuid() != 0: print('СЛЕПОТА: стенд DeepSeek требует root (setpriv к учётке баланса, chown)'); sys.exit(2)
for f in (SLUZHBA, OBERTKA, DS):
    if not f.is_file(): print('СЛЕПОТА: нет', f); sys.exit(2)

UCH = 'nobody'
KL = {'ok': 'sk-stendOK0123456789abcdef', 'malo': 'sk-stendMALO0123456789abcd', 'ploho': 'sk-stendPLOHO0123456789abc', 'nedost': 'sk-stendNEDOST0123456789ab'}  # vorota-ob:dopusk=TOKEN
OK = {'is_available': True, 'balance_infos': [{'currency': 'CNY', 'total_balance': '110.00', 'granted_balance': '10.00', 'topped_up_balance': '100.00'}]}
OTVET = {KL['ok']: (200, OK),
         KL['malo']: (200, {'is_available': True, 'balance_infos': [   # USD первым: порог — к валюте по ИМЕНИ (порядок меняется — живой 20:12Z)
             {'currency': 'USD', 'total_balance': '100.00', 'granted_balance': '0.00', 'topped_up_balance': '100.00'},
             {'currency': 'CNY', 'total_balance': '3.50', 'granted_balance': '0.00', 'topped_up_balance': '3.50'}]}),
         KL['nedost']: (200, dict(OK, is_available=False)),
         KL['ploho']: (401, {'error': {'message': 'Authentication Fails'}})}
zaprosy = []
class Server(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        auth = self.headers.get('Authorization', ''); kl = auth[7:] if auth.startswith('Bearer ') else None
        zaprosy.append({'put': self.path, 'kl': kl})
        kod, telo = OTVET.get(kl, (401, {})) if self.path == '/user/balance' else (404, {})
        b = json.dumps(telo).encode(); self.send_response(kod); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Server); threading.Thread(target=srv.serve_forever, daemon=True).start()

r = Path(tempfile.mkdtemp(prefix='stend-deepseek-')); r.chmod(0o755)
for d in ('vhod', 'vydacha', 'inst', 'kl', 'cred', 'ds', 'libexec', 'lib'): (r / d).mkdir()
(r / 'vhod').chmod(0o1733); (r / 'ds').chmod(0o777)   # 3.1.4: приёмная как в бою — пишущий может войти и записать, ЧИТАТЬ не может
#   (бой: /var/spool/dsh-limity/vhod drwx-wx--T, ACL limity-vhod:-wx). При 0o777 стенд не видел отказа fsync каталога (основа 3.1.3 — 19 из 19).
pw = pwd.getpwnam(UCH); os.chown(r / 'cred', pw.pw_uid, pw.pw_gid); (r / 'cred').chmod(0o700)
shutil.copy(DS, r / 'libexec/dsh-limity-deepseek'); shutil.copy(ZDES / 'lib/dsh_limity_konfig.py', r / 'lib')   # учётке баланса — копии (дерево ей не читаемо)
for f in (r / 'libexec/dsh-limity-deepseek', r / 'lib/dsh_limity_konfig.py'): f.chmod(0o644)
def kluch(kl, chto):   # подставной LoadCredential: файл dsh-limity-<ключ> в каталоге учётных данных, читает только учётка баланса
    f = r / 'cred' / f'dsh-limity-{kl}'
    if chto is None: f.unlink(missing_ok=True); return
    f.write_text(KL[chto] + '\n'); os.chown(f, pw.pw_uid, pw.pw_gid); f.chmod(0o400)
kluch('deepseek-1', 'ok'); kluch('deepseek-2', 'ok')
(r / 'kl/k1').write_text('путь для конфига\n'); (r / 'kl/k2').write_text('путь для конфига\n')
(r / 'alert.sh').write_text(f'#!/bin/bash\necho "$1" >> {r}/alerts.log\nexit 0\n'); (r / 'alert.sh').chmod(0o755)
def konfig(ds2_vkl=True, bez_valyuty=False):
    d1 = {'provajder': 'deepseek', 'nomer': 1, 'kluch': 'deepseek-1', 'podpis': 'DeepSeek (стенд)', 'klyuch_fajl': str(r / 'kl/k1'), 'porog_ostatka': 5}
    if not bez_valyuty: d1['valyuta_poroga'] = 'CNY'
    (r / 'podpiski.json').write_text(json.dumps([d1,
        {'provajder': 'deepseek', 'nomer': 2, 'kluch': 'deepseek-2', 'podpis': 'DeepSeek-2', 'klyuch_fajl': str(r / 'kl/k2'), 'vkl': ds2_vkl},
        {'provajder': 'deepseek', 'nomer': 3, 'kluch': 'deepseek-chuzhaya', 'podpis': 'DeepSeek (там)', 'mashina': 'drugaya-mashina-stend'}],
        ensure_ascii=False)); (r / 'podpiski.json').chmod(0o644)
konfig()
ENV = dict(os.environ, DSH_LIMITY_DEEPSEEK_STEND='1', DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VHOD=str(r / 'vhod'), DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'),
           DSH_LIMITY_VYDACHA=str(r / 'vydacha/limity.json'), DSH_LIMITY_CODEX_SOST=str(r / 'net.json'), DSH_LIMITY_INSTANCE_DIR=str(r / 'inst'),
           DSH_LIMITY_ZAMER_SOST=str(r / 'sost.json'), DSH_LIMITY_ZAMER_ALERT=str(r / 'alert.sh'), ENABLE_CLAUDEAI_MCP_SERVERS='false',
           DSH_LIMITY_DEEPSEEK_URL=f'http://127.0.0.1:{srv.server_address[1]}', DSH_LIMITY_DS_SOST=str(r / 'ds/sost.json'),
           CREDENTIALS_DIRECTORY=str(r / 'cred'), DSH_LIMITY_DS_UCH=UCH)
proshlo = vsego = 0
def proba(imya, uslovie, vyvod=''):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '| вывод:', str(vyvod)[-600:].replace('\n', ' ⏎ '))
zhurnal = []
def zvat(predmet):
    p = subprocess.run([sys.executable, '-B', str(predmet)], env=ENV, capture_output=True, text=True, timeout=120)
    zhurnal.append(p.stdout + p.stderr); return p.stdout + p.stderr
def ds():   # программа баланса — от учётки баланса, не root
    p = subprocess.run(['setpriv', f'--reuid={pw.pw_uid}', f'--regid={pw.pw_gid}', '--clear-groups', '--no-new-privs',
                        sys.executable, '-B', str(r / 'libexec/dsh-limity-deepseek')], env=ENV, capture_output=True, text=True, timeout=120)
    zhurnal.append(p.stdout + p.stderr); return p.stdout + p.stderr
def krug(): v = ds(); zvat(SLUZHBA); zvat(OBERTKA); return v   # баланс → служба → тревоги
def vydacha(): return json.loads((r / 'vydacha/limity.json').read_text())['podpiski']
def trevogi(): f = r / 'alerts.log'; return f.read_text().splitlines() if f.exists() else []
def sostarit(minut):
    f = r / 'ds/sost.json'; s = json.loads(f.read_text())
    for k in s: s[k]['popytki'] = [t - minut * 60 for t in s[k]['popytki']]
    f.write_text(json.dumps(s))
def v_vhod(imya, z, uch):
    f = r / 'vhod' / imya; f.write_text(json.dumps(z)); os.chown(f, pwd.getpwnam(uch).pw_uid, -1)
try:
    zvat(SLUZHBA)   # таблица создаётся службой
    v = ds(); fajly = sorted((r / 'vhod').glob('*.json'))
    proba('исправное: программа баланса от nobody (не root) — ровно 2 GET (ключи 1 и 2 из каталога учётных данных), ключ в заголовке, не в адресе; '
          'чужой машины — 0; журнал на КАЖДЫЙ вызов с остатком строкой «110.00 CNY»; 2 снимка, владелец nobody',
          len(zaprosy) == 2 and all(z['put'] == '/user/balance' and z['kl'] == KL['ok'] for z in zaprosy)
          and v.count('GET /user/balance → 200') == 2 and v.count('остаток 110.00 CNY') == 2 and 'deepseek-chuzhaya:' not in v
          and len(fajly) == 2 and all(f.stat().st_uid == pw.pw_uid for f in fajly), v + str(zaprosy))
    v = zvat(SLUZHBA); zvat(OBERTKA); d = vydacha(); d1, d3 = d.get('deepseek-1', {}), d.get('deepseek-chuzhaya', {})
    proba('служба: принято 2; deepseek-1 — balansy CNY: числа 110/10/100 (для страницы) и строки как пришли «110.00/10.00/100.00»; доступен; '
          'ниже порога 5 — нет; тревог нет',
          'принято 2, отказано 0' in v and d1.get('balansy') == [{'valyuta': 'CNY', 'ostatok': 110.0, 'podareno': 10.0, 'popolneno': 100.0,
          'kak_prishlo': {'total_balance': '110.00', 'granted_balance': '10.00', 'topped_up_balance': '100.00'}}]
          and d1.get('dostupen') is True and d1.get('nizhe_poroga') is False and not trevogi(), v + json.dumps(d1, ensure_ascii=False))
    proba('ключ на другой машине — «не измеряется», с именем машины; данных нет (не «ноль»)',
          'drugaya-mashina-stend' in (d3.get('zhdyom') or '') and d3.get('balansy') is None, json.dumps(d3, ensure_ascii=False))
    if not STRANICA.is_file(): print('  · ПРОПУЩЕНО (не проба): снимок живой страницы не подан (DSH_LIMITY_STRANICA_ZHIVAYA) — карточка DeepSeek на живой странице НЕ проверена')
    else:
        p = subprocess.run(['node', str(TEST / 'risuj-stranicu.js'), str(STRANICA), str(r / 'vydacha/limity.json')], capture_output=True, text=True, timeout=30)
        proba('ЖИВАЯ страница (снимок 20:33Z, карточка DeepSeek): «остаток, CNY» и 110.00 — числа для неё сохранены, kak_prishlo её не ломает',
              p.returncode == 0 and 'остаток, CNY' in p.stdout and '110.00' in p.stdout, p.stdout[-500:] + p.stderr[-300:])
    n0 = len(zaprosy); v = ds()
    proba('раз в час: повтор сразу → 0 запросов, «запрос был 0 мин назад»', len(zaprosy) == n0 and 'запрос был 0 мин назад' in v, v)
    # ПОРЧА: ключ 1 отвергнут
    kluch('deepseek-1', 'ploho'); sostarit(61); v = krug(); d1 = vydacha()['deepseek-1']; t = trevogi()
    proba('порча (ключ 1 отвергнут): 401 в журнале; тревога (её шлёт root-замер по таблице) ОДНА «НЕ ИЗМЕРЕН — HTTP 401»; выдача — oshibka, прежний баланс виден',
          'GET /user/balance → 401' in v and len(t) == 1 and 'НЕ ИЗМЕРЕН' in t[0] and 'HTTP 401' in t[0] and (d1.get('oshibka') or '').startswith('HTTP 401 (попытка')
          and d1.get('balansy') and d1['balansy'][0]['ostatok'] == 110.0, v + str(t) + json.dumps(d1, ensure_ascii=False))
    sostarit(61); v = krug()
    proba('повтор порчи через час: снова 401, НОВОЙ тревоги нет', 'GET /user/balance → 401' in v and len(trevogi()) == 1, v + str(trevogi()))
    kluch('deepseek-1', 'ok'); sostarit(61); krug(); d1 = vydacha()['deepseek-1']; t = trevogi()
    proba('возврат: тревога ОДНА «снова измеряется», oshibka в выдаче снята', len(t) == 2 and 'снова измеряется' in t[1] and d1.get('oshibka') is None, str(t))
    # ПОРОГ — по переходу, валюта по имени, сравнение строкой (Decimal)
    kluch('deepseek-1', 'malo'); sostarit(61); krug(); t1 = trevogi(); d1 = vydacha()['deepseek-1']
    sostarit(61); krug(); t2 = trevogi()
    kluch('deepseek-1', 'ok'); sostarit(61); krug(); t3 = trevogi()
    kluch('deepseek-1', 'malo'); sostarit(61); krug(); t4 = trevogi()
    proba('порог 5 CNY (USD 100 ПЕРВЫМ): «3.50 CNY НИЖЕ порога» ОДНА, nizhe_poroga=true; ещё час — тишина; выше — тишина; снова ниже — снова',
          len(t1) == 3 and 'НИЖЕ порога' in t1[2] and '3.50 CNY' in t1[2] and d1.get('nizhe_poroga') is True
          and len(t2) == 3 and len(t3) == 3 and len(t4) == 4 and 'НИЖЕ порога' in t4[3], str(t4) + json.dumps(d1, ensure_ascii=False))
    # НЕДОСТУПЕН (is_available=false) — тревога по переходу (признак Вениамина 19:56Z)
    kluch('deepseek-1', 'nedost'); sostarit(61); krug(); t5 = trevogi(); d1 = vydacha()['deepseek-1']
    sostarit(61); krug(); t6 = trevogi()
    kluch('deepseek-1', 'ok'); sostarit(61); krug(); t7 = trevogi()
    proba('is_available=false: ОДНА тревога «НЕДОСТУПЕН», dostupen=false в выдаче; повтор — тишина; снова true — ОДНА «снова доступен»',
          len(t5) == 5 and 'НЕДОСТУПЕН' in t5[4] and d1.get('dostupen') is False and len(t6) == 5 and len(t7) == 6 and 'снова доступен' in t7[5], str(t7))
    # 1.0.10 (условие Вениамина 22:52Z): снимок старше SVEZHEST_MIN (130 мин) — «остаток не измеряется» по переходу + отбой
    def sostarit_snimki(minut):   # порча: dsh-limity-deepseek будто не ходил — сдвигаем снимки ключа 1 в прошлое, без нового запроса
        c = sqlite3.connect(r / 'limity.db')
        try:
            n = c.execute("UPDATE usage_snimok SET moment_utc = moment_utc - ? WHERE provajder='deepseek' AND podpiska=1", (minut * 60,)).rowcount; c.commit()
        finally: c.close()
        print(f'  · порча внесена: снимков DeepSeek ключа 1 сдвинуто на {minut} мин — {n}'); return n
    n0 = len(trevogi()); sdv = sostarit_snimki(131); zvat(OBERTKA); t8 = trevogi()[n0:]
    proba('1.0.10 П1: снимок старше 130 мин → ОДНА строка «⚠️ DeepSeek (стенд): остаток не измеряется 2 ч 11 мин»',
          sdv > 0 and t8 == ['⚠️ DeepSeek (стенд): остаток не измеряется 2 ч 11 мин'], str(t8))
    zvat(OBERTKA); t9 = trevogi()[n0:]
    proba('1.0.10 П2: снимок всё ещё старый → тишина (тревога по переходу, не каждый проход)', t9 == t8, str(t9))
    sostarit(61); krug(); t10 = trevogi()[n0:]
    proba('1.0.10 П3: свежий снимок → ОДНА строка «✅ DeepSeek (стенд): остаток снова измеряется»',
          t10 == t8 + ['✅ DeepSeek (стенд): остаток снова измеряется'], str(t10))
    # НЕТ LoadCredential для ключа 2
    sn1 = vydacha()['deepseek-1'].get('snyato_unix') or 0; time.sleep(1.1)
    kluch('deepseek-2', None); sostarit(61); n0 = len(zaprosy); v = krug(); d = vydacha(); d1, d2 = d['deepseek-1'], d['deepseek-2']
    print(f'  · порча внесена: учётных данных ключа 2 нет — {not (r / "cred" / "dsh-limity-deepseek-2").exists()}')
    proba('нет учётных данных ключа 2 (LoadCredential не подключён): запроса по нему нет, «не измерено: нет учётных данных dsh-limity-deepseek-2»',
          'нет учётных данных dsh-limity-deepseek-2' in v and 'нет учётных данных dsh-limity-deepseek-2' in (d2.get('oshibka') or ''), v + json.dumps(d2, ensure_ascii=False))
    proba('1.0.12: в том же круге ключ 1 НЕ задет — ровно 1 GET (ключом 1), deepseek-1 снят заново, без ошибки',
          len(zaprosy) - n0 == 1 and zaprosy[-1]['kl'] == KL['ok'] and (d1.get('snyato_unix') or 0) > sn1 and d1.get('oshibka') is None,
          v + str(zaprosy[n0:]) + json.dumps(d1, ensure_ascii=False))
    kluch('deepseek-2', 'ok'); sostarit(61); n0 = len(zaprosy); v = krug(); d2 = vydacha()['deepseek-2']
    proba('1.0.12: учётные данные ключа 2 вернули → снова 2 GET, deepseek-2 измерен, ошибки нет',
          len(zaprosy) - n0 == 2 and 'нет учётных данных' not in v and d2.get('oshibka') is None and d2.get('balansy'), v + json.dumps(d2, ensure_ascii=False))
    # ЧУЖИЕ снимки: теперь и root — чужой
    sn = {'vid': 'deepseek_balans', 'moment_utc': time.time() - 5, 'podpiska': 1, 'dannye': OTVET[KL['malo']][1], 'oshibka': None}
    v_vhod('root.json', sn, 'root'); v_vhod('daemon.json', sn, 'daemon'); v_vhod('net-v-konfige.json', dict(sn, podpiska=9), UCH)
    v_vhod('pusto.json', dict(sn, dannye=None), UCH); v_vhod('klyuch.json', dict(sn, dannye=None, oshibka='ключ ' + KL['ok']), UCH)
    v = zvat(SLUZHBA); d1 = vydacha()['deepseek-1']
    proba('чужие: от root и от daemon · подписка 9 не в конфиге · ни dannye, ни oshibka · ключ в тексте → отказано 5, принято 0; баланс не подменён',
          'принято 0, отказано 5' in v and f'только от {UCH}' in v and 'нет среди включённых' in v and 'ровно одно из' in v and 'похоже на ключ' in v
          and d1['balansy'][0]['ostatok'] == 110.0, v)
    (r / 'otkaz' / 'klyuch.json').unlink()   # подложенный с ключом — НАШ (проба выше); ниже ищем ключ только в следах предмета
    konfig(ds2_vkl=False); sostarit(61); n0 = len([z for z in zaprosy if z['kl'] == KL['ok']]); v = ds(); zvat(SLUZHBA); d2 = vydacha()['deepseek-2']
    proba('выключенная deepseek-2: запроса нет, в выдаче — «выключена» (не пропала)',
          'deepseek-2' not in v and len([z for z in zaprosy if z['kl'] == KL['ok']]) == n0 + 1 and d2.get('vyklyuchena') is True, v + json.dumps(d2, ensure_ascii=False))
    konfig(bez_valyuty=True); v = zvat(SLUZHBA); konfig()
    proba('конфиг: porog_ostatka без valyuta_poroga → НЕГОДЕН «только вместе»; служба на последней годной редакции («ВНИМАНИЕ»)',
          'ВНИМАНИЕ: конфиг' in v and 'НЕГОДЕН' in v and 'только вместе' in v, v)
    vse = ''.join(f.read_text() for f in r.rglob('*') if f.is_file() and f.parent.name not in ('kl', 'cred') and f.suffix != '.db') + ''.join(zhurnal)
    vse += ''.join(str(x) for x in sqlite3.connect(r / 'limity.db').execute('SELECT * FROM usage_snimok'))
    proba('значений ключей нет ни в приёмной/отказах, ни в тревогах, ни в выдаче, ни в журнале, ни в состоянии, ни в таблице', not any(k in vse for k in KL.values()))
finally:
    srv.shutdown(); print(f'ИТОГ стенда DeepSeek: {proshlo} из {vsego}'); shutil.rmtree(r, ignore_errors=True)
sys.exit(0 if proshlo == vsego and vsego else 1)
