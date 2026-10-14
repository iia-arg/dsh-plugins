#!/usr/bin/env python3
"""Стенд zhivaya-versiya-watch: версия с суффиксом рабочей сборки (1.3.33-b1700) в журнале живого pid.
Довод: путь к сторожу (без довода — боевой /usr/local/sbin/zhivaya-versiya-watch).
ИЗОЛЯЦИЯ: systemctl и journalctl подставные (PATH), дом агента и диск шлюза — во временном каталоге,
сторож зовётся с --tolko-pechat (канал и состояние не трогаются). Ожидания — в именах проб, записаны до прогона.
Коды: 0 — годно, 1 — расхождение, 2 — слепота стенда."""
import importlib.machinery, importlib.util, io, json, os, sys, tempfile, contextlib, shutil

PREDMET = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/usr/local/sbin/zhivaya-versiya-watch')
if len(sys.argv) > 2:
    print('отказ: стенд принимает один довод — путь к сторожу'); sys.exit(2)
if not os.path.isfile(PREDMET):
    print(f'СЛЕПОТА: предмета нет: {PREDMET}'); sys.exit(2)

T = tempfile.mkdtemp(prefix='stend-zhiv-', dir=os.environ.get('STEND_TMP') or None)
BIN = os.path.join(T, 'bin'); os.makedirs(BIN)
KONF = os.path.join(T, 'konf.json')
open(os.path.join(BIN, 'systemctl'), 'w').write(f'''#!/usr/bin/env python3
import sys, json
k = json.load(open({KONF!r})); a = sys.argv[1:]
if a[0] == 'list-units':
    for u in k: print(u + ' loaded active running stend')
elif a[0] == 'show':
    p = a[a.index('-p') + 1]; u = a[-1]
    print(k.get(u, {{}}).get(p, ''))
''')
open(os.path.join(BIN, 'journalctl'), 'w').write(f'''#!/usr/bin/env python3
import sys, json
k = json.load(open({KONF!r}))
pid = next(x[5:] for x in sys.argv[1:] if x.startswith('_PID='))
for u in k.values():
    if u.get('MainPID') == pid: print(u.get('_zhurnal', ''))
''')
for f in ('systemctl', 'journalctl'): os.chmod(os.path.join(BIN, f), 0o755)

zagr = importlib.machinery.SourceFileLoader('zhiv', PREDMET)
spec = importlib.util.spec_from_loader('zhiv', zagr)
M = importlib.util.module_from_spec(spec); zagr.exec_module(M)
DISK_SHL = os.path.join(T, 'claude-oauth-package.json'); M.SHLYUZ_DISK = DISK_SHL
os.environ['PATH'] = BIN + ':' + os.environ.get('PATH', '/usr/bin:/bin')
START = 'Wed 2026-10-07 07:00:00 UTC'


def progon(shlyuz=None, agent=None, kanal=None, sost=None, pid='202'):
    """shlyuz = (диск, строка журнала); agent = (пакет, диск, строка журнала). B-N-1979: kanal+sost — прогон с тревогой
    (без --tolko-pechat) в подставной канал и временное состояние; pid — MainPID службы агента (новый pid = подъём)."""
    k = {}
    if shlyuz:
        json.dump({'version': shlyuz[0]}, open(DISK_SHL, 'w'))
        k['gw-stend.service'] = {'ExecStart': '{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/claude-oauth/gateway.mjs }',
                                 'MainPID': '101', 'ActiveEnterTimestamp': START, '_zhurnal': shlyuz[1]}
    if agent:
        dom = os.path.join(T, 'dom'); shutil.rmtree(dom, ignore_errors=True)
        d = os.path.join(dom, 'plugins', agent[0]); os.makedirs(d)
        json.dump({'version': agent[1]}, open(os.path.join(d, 'package.json'), 'w'))
        k['agent-stend.service'] = {'ExecStart': '{ argv[]=/usr/bin/node /x/node_modules/@deepseek-ai/dsh/lib/bin.js web }',
                                    'Environment': f'HOME={dom} LANG=C', 'MainPID': pid,
                                    'ActiveEnterTimestamp': START, '_zhurnal': agent[2]}
    json.dump(k, open(KONF, 'w'))
    M.ZAVISLO.clear(); M.PROPUSHCHENO[0] = 0
    buf = io.StringIO(); sys.argv = (['zhivaya-versiya-watch', '--kanal', kanal, '--sost', sost] if kanal
                                     else ['zhivaya-versiya-watch', '--tolko-pechat'])
    with contextlib.redirect_stdout(buf):
        kod = M.main()
    return kod, buf.getvalue()


PROBY = [
    ('мост 1.3.33-b1700 = диску → сошлось', dict(agent=('dsh-tool-bridge', '1.3.33-b1700', 'x [dsh-tool-bridge 1.3.33-b1700] подъём')), 'сошлось', 0),
    ('мост живая -b1699 ≠ диск -b1700 → РАЗОШЛОСЬ', dict(agent=('dsh-tool-bridge', '1.3.33-b1700', 'x [dsh-tool-bridge 1.3.33-b1699] подъём')), 'РАЗОШЛОСЬ', 1),
    ('адаптер 1.1.17-b9 = диску → сошлось', dict(agent=('dsh-subscription-adapter', '1.1.17-b9', '[dsh-subscription-adapter 1.1.17-b9] старт')), 'сошлось', 0),
    ('шлюз 1.4.49-b1739/… = диску → сошлось', dict(shlyuz=('1.4.49-b1739', '[subscription-gateway 1.4.49-b1739/82862064] старт')), 'сошлось', 0),
    ('шлюз 1.4.44 ≠ диск 1.4.47 → РАЗОШЛОСЬ (как было)', dict(shlyuz=('1.4.47', '[subscription-gateway 1.4.44/047fd5ae] старт')), 'РАЗОШЛОСЬ', 1),
    ('мост 1.3.28 = диску → сошлось (как было)', dict(agent=('dsh-tool-bridge', '1.3.28', '[dsh-tool-bridge 1.3.28] старт')), 'сошлось', 0),
    # A-N-1948 шаг 0: обе формы приставки шлюза по договору; чужая приставка (без левой границы ловилась подстрокой) — не строка шлюза.
    ('шлюз НОВОЙ формы [dsh-subscription-gateway 1.4.57/…] = диску → сошлось', dict(shlyuz=('1.4.57', '[dsh-subscription-gateway 1.4.57/0a1b2c3d] старт')), 'сошлось', 0),
    ('чужая приставка [xsubscription-gateway 1.4.57/…] → не строка шлюза, СЛЕПОТА', dict(shlyuz=('1.4.57', '[xsubscription-gateway 1.4.57/0a1b2c3d] старт')), 'СЛЕПОТА', 2),
    ('нет строки версии → СЛЕПОТА (как было)', dict(agent=('dsh-tool-bridge', '1.3.33-b1700', 'старт без версии')), 'СЛЕПОТА', 2),
]
ok = 0
# RU: B-N-1979 — читатель «[dsh-tool-bridge] ostrovApi НЕ установлен: …». Прогон С тревогой: канал — заглушка, дописывающая
#     свой текст в файл следа (боевой agent-alert не зовётся: стенд отказывает, если заглушка совпала с ALERT модуля),
#     состояние — временный kartina.json. Ожидания — в именах проб, записаны до прогона.
# EN: B-N-1979 — the reader of "[dsh-tool-bridge] ostrovApi НЕ установлен: …". Runs WITH an alert: the channel is a stub
#     appending its text to a trace file (the live agent-alert is never called: the stand refuses if the stub equals the
#     module's ALERT), the state is a temporary kartina.json. Expectations are in the probe names, written before the run.
# RU: logger подменён (PATH): без --tolko-pechat сторож пишет итог через logger -t zhivaya-versiya-watch — настоящий logger
#     клал бы строки проб в боевой журнал под тегом боевого сторожа (так и вышло при первом прогоне, 10.10 14:04:26Z, 6 строк).
# EN: logger is replaced (PATH): without --tolko-pechat the watcher writes its summary via logger -t zhivaya-versiya-watch — the
#     real logger would put probe lines into the live journal under the live watcher's tag (it did on the first run, 10.10 14:04:26Z).
LOGGER_SLED = os.path.join(T, 'logger.txt')
open(os.path.join(BIN, 'logger'), 'w').write(f'''#!/usr/bin/env python3
import sys
open({LOGGER_SLED!r}, 'a').write(' '.join(sys.argv[1:]) + chr(10))
'''); os.chmod(os.path.join(BIN, 'logger'), 0o755)
SLED = os.path.join(T, 'sled-kanala.txt'); KANAL = os.path.join(BIN, 'kanal-zaglushka'); SOST = os.path.join(T, 'kartina.json')
open(KANAL, 'w').write(f'''#!/usr/bin/env python3
import sys
open({SLED!r}, 'a').write(' '.join(sys.argv[1:]).replace(chr(10), ' | ') + chr(10))
'''); os.chmod(KANAL, 0o755)
if os.path.realpath(KANAL) == os.path.realpath(M.ALERT):
    print('отказ: заглушка канала совпала с боевым agent-alert'); sys.exit(2)
sled = lambda: open(SLED).read().splitlines() if os.path.exists(SLED) else []
MOST = '[dsh-tool-bridge 1.3.43] подъём'
BEDA = '[dsh-tool-bridge] ostrovApi НЕ установлен: botId обязателен при enabled — умолчаний нет'
OSTROV = []   # [имя, kw прогона, проверка(код, вывод, след до, след после) → None | причина]
def ostrov(imya, kw, prov): OSTROV.append((imya, kw, prov))
ostrov('П1 исправное (мост поднялся, беды нет) → сошлось, в следе канала 0 строк, код 0',
       dict(agent=('dsh-tool-bridge', '1.3.43', MOST)),
       lambda k, o, a, b: None if k == 0 and len(b) == len(a) == 0 and 'ИНСТРУМЕНТ' not in o else f'код {k}, след {len(a)}→{len(b)}')
ostrov('П2 строка «botId обязателен» → тревога 1 в канал, в тексте служба и поле, код 1',
       dict(agent=('dsh-tool-bridge', '1.3.43', BEDA + chr(10) + MOST)),
       lambda k, o, a, b: None if k == 1 and len(b) == len(a) + 1 and 'agent-stend.service' in b[-1] and 'botId' in b[-1]
                          and 'ostrov_api не поставлен' in b[-1] else f'код {k}, след {len(a)}→{len(b)}: {(b or [""])[-1][:160]}')
ostrov('П2б тот же журнал, второй прогон на том же состоянии → повтор заглушён (след не вырос), код 1',
       dict(agent=('dsh-tool-bridge', '1.3.43', BEDA + chr(10) + MOST)),
       lambda k, o, a, b: None if k == 1 and len(b) == len(a) else f'код {k}, след {len(a)}→{len(b)}')
ostrov('П3 подъём: новый pid 203 без строки → «снова в порядке» (+1 в следе), код 0',
       dict(agent=('dsh-tool-bridge', '1.3.43', MOST), pid='203'),
       lambda k, o, a, b: None if k == 0 and len(b) == len(a) + 1 and 'снова в порядке' in b[-1] else f'код {k}, след {len(a)}→{len(b)}: {(b or [""])[-1][:160]}')
ostrov('П4 переапликация в том же pid: беда, подъём, затем подъём без беды → сошлось, тревоги нет, код 0',
       dict(agent=('dsh-tool-bridge', '1.3.43', BEDA + chr(10) + MOST + chr(10) + MOST)),
       lambda k, o, a, b: None if k == 0 and len(b) == len(a) and 'ИНСТРУМЕНТ' not in o else f'код {k}, след {len(a)}→{len(b)}; ' + ' | '.join(l for l in o.splitlines() if 'ИНСТРУМЕНТ' in l)[:160])
ostrov('П5 причина без поля («реестр инструментов недоступен») → тревога с этой причиной, код 1',
       dict(agent=('dsh-tool-bridge', '1.3.43', '[dsh-tool-bridge] ostrovApi НЕ установлен: реестр инструментов недоступен' + chr(10) + MOST)),
       lambda k, o, a, b: None if k == 1 and len(b) == len(a) + 1 and 'реестр инструментов недоступен' in b[-1] else f'код {k}, след {len(a)}→{len(b)}: {(b or [""])[-1][:160]}')
try:
    for imya, kw, vid, kod_zhd in PROBY:
        kod, out = progon(**kw)
        stroka = next((l for l in out.splitlines() if l.startswith(('сошлось', 'РАЗОШЛОСЬ', 'СЛЕПОТА'))), '(нет строки пары)')
        da = stroka.startswith(vid) and kod == kod_zhd
        ok += da
        print(f"  {'✅' if da else '🔴'} {imya} · код {kod} · {stroka.strip()}")
    for imya, kw, prov in OSTROV:
        if imya.startswith(('П1', 'П4', 'П5')) and os.path.exists(SOST): os.remove(SOST)   # своё состояние у независимых проб
        do = sled(); kod, out = progon(kanal=KANAL, sost=SOST, **kw); posle = sled()
        prichina = prov(kod, out, do, posle); ok += prichina is None
        print(f"  {'✅' if prichina is None else '🔴'} {imya}" + ('' if prichina is None else f' — {prichina}'))
    # RU: logger подставы позван (итог прогона ушёл в заглушку, а не в журнал) и итог беды считает пару сошедшейся.
    # EN: the stand's logger was called (the summary went to the stub, not the journal) and the trouble summary counts the pair as converged.
    lg = open(LOGGER_SLED).read().splitlines() if os.path.exists(LOGGER_SLED) else []
    da = len(lg) == len(OSTROV) and any('сошлось 1' in l and 'инструмент не поставлен 1' in l for l in lg)
    ok += da; print(f"  {'✅' if da else '🔴'} logger подставы позван {len(lg)} раз из {len(OSTROV)}; итог беды: «сошлось 1 · … · инструмент не поставлен 1»")
finally:
    shutil.rmtree(T, ignore_errors=True)
print(f'итог {ok} из {len(PROBY) + len(OSTROV) + 1}')
sys.exit(0 if ok == len(PROBY) + len(OSTROV) + 1 else 1)
