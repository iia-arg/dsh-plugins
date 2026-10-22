#!/usr/bin/python3 -B
# -*- coding: utf-8 -*-
"""Стенд dsh-limity-avtoperekl (B-N-1806, Аврора, 08.10.2026). Без root, без живых шлюзов/групп: systemctl, реестр, /proc,
читатель заслона, переключатель и канал тревог — подставные во временном каталоге (ключ DSH_LIMITY_AVTO_STEND=1).
Предмет — довод 1, по умолчанию — файл ПАКЕТА (../libexec/dsh-limity-avtoperekl от стенда, 1.0.10); бой — доводом 1 и DSH_LIMITY_LIB.
ЧЕГО НЕ ЛОВИТ: настоящий переключатель и концы ходов (их стенд — stend-pereklyuchatelya-podpiski) · живой реестр и /proc."""
import json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

PAKET = Path(__file__).resolve().parent.parent   # 1.0.10 (Заря): по умолчанию — файлы ПАКЕТА; прежде боевые /usr/local (стенд мерил бой, не кандидат)
PREDMET = Path(sys.argv[1] if len(sys.argv) > 1 else PAKET / 'libexec/dsh-limity-avtoperekl')
LIB = os.environ.get('DSH_LIMITY_LIB', str(PAKET / 'lib'))
if not PREDMET.is_file() or not (Path(LIB) / 'dsh_limity_konfig.py').is_file(): print('СЛЕПОТА: нет предмета или', LIB); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-avtoperekl-')); T = time.time()
def pishi(imya, tekst, x=False):
    f = r / imya; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(tekst)
    if x: f.chmod(0o755)
pishi('systemctl', f'''#!/usr/bin/python3
import json,sys; s=json.load(open("{r}/shlyuzy.json")); a=sys.argv[1:]
if a[0]=="list-units": [print(f"claude-oauth-gateway@{{u}}.service loaded active running x") for u in s]
elif a[0]=="show": u=a[1].split("@")[1]; print(s[u]["pid"])
''', True)
pishi('reestr', f'''#!/usr/bin/python3
import json,sys; s=json.load(open("{r}/shlyuzy.json")); u=sys.argv[2]
if s.get(u,{{}}).get("reestr") is None: sys.exit(1)
print(json.dumps(s[u]["reestr"]))
''', True)
pishi('chitatel', f'''#!/usr/bin/python3
import json,sys; s=json.load(open("{r}/chitatel.json")).get(sys.argv[1],"unknown"); print(s+"\\tстенд"); sys.exit({{"free":0,"blocked":10}}.get(s,20))
''', True)
pishi('perekl', f'''#!/bin/bash
echo "$*" >> {r}/perekl.log
[ -f {r}/perekl-itog ] && {{ printf 'RUN\\t%s\\n' "$(cat {r}/perekl-itog)" > {r}/itog.txt; }}
exit $(cat {r}/perekl-kod 2>/dev/null || echo 0)
''', True)
pishi('alert', f'#!/bin/bash\necho "$*" >> {r}/alerts.log\nexit $(cat {r}/alert-kod 2>/dev/null || echo 0)\n', True)
KONFIG = [{'provajder': 'claude', 'nomer': 1, 'kluch': 'podpiska-1', 'podpis': 'Клод-1 (Забава)', 'organizaciya': 'org-1'},
          {'provajder': 'claude', 'nomer': 2, 'kluch': 'podpiska-2', 'podpis': 'Клод-2 (MomICan)', 'organizaciya': 'org-2'},
          {'provajder': 'claude', 'nomer': 3, 'kluch': 'podpiska-5', 'podpis': 'Клод-3 (Med)', 'organizaciya': 'org-3'},
          {'provajder': 'claude', 'nomer': 4, 'kluch': 'podpiska-6', 'podpis': 'Клод-4 (выкл)', 'vkl': False},
          {'provajder': 'codex', 'nomer': 3, 'kluch': 'podpiska-3', 'podpis': 'Кодекс-1'}]
pishi('podpiski.json', json.dumps(KONFIG, ensure_ascii=False))
ENV = dict(os.environ, DSH_LIMITY_AVTO_STEND='1', DSH_LIMITY_LIB=LIB, DSH_LIMITY_PODPISKI=str(r / 'podpiski.json'),
           DSH_LIMITY_BAZA=str(r / 'limity.db'), DSH_LIMITY_VYDACHA=str(r / 'vydacha.json'), DSH_LIMITY_AVTO_SOST=str(r / 'sost.json'),
           DSH_LIMITY_AVTO_PEREKL=str(r / 'perekl'), DSH_LIMITY_AVTO_ITOG=str(r / 'itog.txt'), DSH_LIMITY_AVTO_CHITATEL=str(r / 'chitatel'),
           DSH_LIMITY_AVTO_REESTR=str(r / 'reestr'), DSH_LIMITY_AVTO_SYSTEMCTL=str(r / 'systemctl'), DSH_LIMITY_AVTO_PROC=str(r / 'proc'),
           DSH_LIMITY_AVTO_ALERT=str(r / 'alert'))

def shlyuzy(**gde):   # агент → (подписка, реестр)
    s = {}
    for i, (a, (n, re_)) in enumerate(gde.items()):
        pid = 1000 + i; s[a] = {'pid': pid, 'reestr': re_}
        pishi(f'proc/{pid}/environ', f'X=1\0GATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podpiska-{n}\0')
    pishi('shlyuzy.json', json.dumps(s))
def vydacha(**p):    # ключ → (5ч, неделя, минут назад[, состояние недели])
    v = {k: {'snyato_unix': int(T - x[2] * 60), 'pyat_chasov': {'izrashodovano_dolya': x[0], 'sostoyanie': 'allowed', 'sbros_unix': T + 3600},
             'nedelya': {'izrashodovano_dolya': x[1], 'sostoyanie': x[3] if len(x) > 3 else 'allowed', 'sbros_unix': T + 86400}} for k, x in p.items()}
    pishi('vydacha.json', json.dumps({'podpiski': v}))
def chitatel(**s): pishi('chitatel.json', json.dumps({k[1:]: v for k, v in s.items()}))
def log(imya): f = r / imya; return f.read_text().splitlines() if f.exists() else []
def prohod():
    a0, p0 = len(log('alerts.log')), len(log('perekl.log'))
    p = subprocess.run([sys.executable, '-B', str(PREDMET)], env=ENV, capture_output=True, text=True, timeout=60)
    return p.returncode, p.stdout + p.stderr, log('alerts.log')[a0:], log('perekl.log')[p0:]
def sbros_okna(): st = json.loads((r / 'sost.json').read_text()); st.pop('popytka', None); (r / 'sost.json').write_text(json.dumps(st))
ok = vsego = 0
def proba(imya, usl, pokaz=''):
    global ok, vsego
    vsego += 1; ok += bool(usl); print(f'  {"✅" if usl else "❌"} {imya}' + ('' if usl else f' — {str(pokaz)[-400:]}'))

OBSH = '"obshchaya-claude"'
try:
    shlyuzy(avrora=(2, 'obshchaya-claude'), iskra=(2, 'obshchaya-claude'), varvara=(3, 'podpiska-3'))
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.99, 0.40, 5), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    chitatel(n1='free', n2='blocked', n3='free', n4='free')
    pishi('perekl-itog', 'Claude: подписка 2 → 1; переключено 2 шлюзов на подписку 1; переключены: avrora iskra. Перед рестартом подтверждено.')
    k, v, a, p = prohod()
    proba('Р1 исчерпана (5 ч 0.99) → переключатель «1 tiho» (наименьшая неделя 0.47 из свободных)', p == ['1 tiho'], (p, v))
    proba('Р1 итог одной строкой: «🔁 Claude: Клод-2 (MomICan) 5 ч 99% → Клод-1 (Забава) · переведены: Аврора, Искра»',
          a == ['🔁 Claude: Клод-2 (MomICan) 5 ч 99% → Клод-1 (Забава) · переведены: Аврора, Искра'], (a, v))
    k, v, a, p = prohod()
    proba('Р2 повтор в окне 30 мин → переключатель не зовётся, тревоги нет', p == [] and a == [] and 'попытка была' in v, (p, a, v))
    sbros_okna(); chitatel(n1='blocked', n2='blocked', n3='unknown', n4='free')
    vydacha(**{'podpiska-1': (0.02, 1.0, 5), 'podpiska-2': (0.99, 0.40, 5), 'podpiska-5': (0.58, 0.59, 200), 'podpiska-6': (0.0, 0.0, 5)})
    k, v, a, p = prohod()
    proba('Р3 некуда → тревога с цифрами, переключатель не зовётся (выключенная Клод-4 не кандидат)',
          p == [] and a == ['🔴 Claude: Клод-2 (MomICan) 5 ч 99% — переключить некуда: Клод-1 (Забава) неделя 100%; Клод-3 (Med) — нет свежего замера (200 мин)'], (a, p, v))
    k, v, a, p = prohod()
    proba('Р4 «некуда» повтор → молчит', a == [] and p == [], (a, p))
    vydacha(**{'podpiska-1': (0.02, 1.0, 5), 'podpiska-2': (1.0, 0.40, 5), 'podpiska-5': (0.58, 0.59, 210), 'podpiska-6': (0.0, 0.0, 5)})
    k, v, a, p = prohod()
    proba('Р17 3.1.8: то же «некуда», сменились доля (99→100%) и возраст (200→210 мин) → молчит (отметка — состояние, не текст)', a == [] and p == [], (a, p, v))
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.99, 0.40, 200), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    chitatel(n1='free', n2='blocked', n3='free', n4='free')
    k, v, a, p = prohod()
    proba('Р5 исчерпание по НЕсвежему замеру (200 мин) → не переключать, тревоги нет', p == [] and a == [] and 'нечего' in v, (p, a, v))
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.98, 0.40, 5), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    k, v, a, p = prohod()
    proba('Р6 0.98 — не исчерпана → ничего', p == [] and a == [], (p, a))
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.30, 0.40, 5), 'podpiska-5': (0.99, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    k, v, a, p = prohod()
    proba('Р7 исчерпана подписка, где только СВОЯ (Варвара, podpiska-3 по реестру) → ничего', p == [] and a == [], (p, a, v))
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.50, 0.40, 5, 'rejected'), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    pishi('perekl-itog', 'ЧАСТИЧНО (код 7): Claude 2 → 1; переключены: avrora; заняты и не переключены: iskra; ход не установлен, не тронут: нет.')
    pishi('perekl-kod', '7')
    k, v, a, p = prohod()
    proba('Р8 неделя «rejected» при доле 0.40 → исчерпана; частично (код 7) → «переведены: Аврора, заняты: Искра»',
          p == ['1 tiho'] and a == ['🔁 Claude: Клод-2 (MomICan) неделя 40% → Клод-1 (Забава) · переведены: Аврора, заняты: Искра'], (p, a, v))
    sbros_okna(); pishi('perekl-itog', 'ОТКАЗ (заслон): расход целевой подписки 1 НЕИЗВЕСТЕН'); pishi('perekl-kod', '5')
    vydacha(**{'podpiska-1': (0.02, 0.47, 5), 'podpiska-2': (0.99, 0.40, 5), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    k, v, a, p = prohod()
    proba('Р9 переключатель отказал (код 5) → «🔴 … не вышло (код 5): <итог>»',
          a == ['🔴 Claude: Клод-2 (MomICan) 5 ч 99% — перевести на Клод-1 (Забава) не вышло (код 5): ОТКАЗ (заслон): расход целевой подписки 1 НЕИЗВЕСТЕН'], (a, v))
    sbros_okna(); k, v, a, p = prohod()
    proba('Р10 та же неудача через 30 мин → попытка есть, тревоги нет', p == ['1 tiho'] and a == [], (p, a))
    sbros_okna(); (r / 'perekl-itog').unlink(); (r / 'itog.txt').unlink(); os.utime(r, None)
    k, v, a, p = prohod()
    proba('Р11 переключатель не написал итог → «итога нет», не чужой итог', a and 'итога нет' in a[0], (a, v))
    shlyuzy(avrora=(2, 'obshchaya-claude'), iskra=(2, None))
    k, v, a, p = prohod()
    proba('Р12 реестр не ответил → СЛЕПОТА, код 2, переключения нет, тревога один раз', k == 2 and p == [] and len(a) == 1 and 'не видит' in a[0], (k, a, v))
    k, v, a, p = prohod()
    proba('Р13 слепота держится → молчит', k == 2 and a == [], (k, a))
    vse = log('alerts.log')
    proba('Р14 тексты владельцу — одной строкой, без путей и ключей', vse and not any('\n' in x or '/etc' in x or 'token' in x for x in vse), vse)
    e2 = dict(ENV, DSH_LIMITY_AVTO_STEND='0')
    pp = subprocess.run([sys.executable, '-B', str(PREDMET)], env=e2, capture_output=True, text=True, timeout=60)
    proba('Р15 ключ стенда не 1 → отказ код 3 (подмены не берутся)', pp.returncode == 3 and 'ОТКАЗ' in pp.stderr, (pp.returncode, pp.stderr))
    shlyuzy(avrora=(2, 'obshchaya-claude'), iskra=(2, 'obshchaya-claude'))   # 3.1.7: agent-alert шлёт HTML — «<» вердикта заслона отверг Telegram (19.10 05:37:11Z)
    vydacha(**{'podpiska-1': (0.02, 1.0, 5), 'podpiska-2': (0.99, 0.40, 5), 'podpiska-5': (0.58, 0.59, 5), 'podpiska-6': (0.0, 0.0, 5)})
    chitatel(n1='blocked', n2='blocked', n3='unknown\tсвободна при доле <0.9 & возрасте ≤360 мин', n4='free')
    k, v, a, p = prohod()
    proba('Р16 вердикт заслона с «<» и «&» → в канал «&lt;0.9 &amp;», голых «<» и «&» нет (HTML agent-alert)',
          len(a) == 1 and '&lt;0.9 &amp; возрасте' in a[0] and '<' not in a[0] and '& ' not in a[0], (a, v))
finally:
    shutil.rmtree(r, ignore_errors=True)
print(f'ИТОГ: {ok} из {vsego}')
sys.exit(0 if ok == vsego else 1)
