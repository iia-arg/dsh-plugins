#!/bin/bash
# Стенд договора sadik-backup.py с agent-alert — читатель исхода _check_alert_contract (B-N-1836, 08.10.2026, Заря;
# находка Вениамина 10:23Z). Прежде исход писался только в журнал sadik-backup («ПРЕДУПРЕЖДЕНИЕ: договор ALERT=…
# не подтверждён») — ни тревоги, ни стенда: договор не сходился каждую ночь с 28.09 (журнал с 25.09) по 08.10 10:25Z
# (B-N-1833), и никто не узнал. Теперь его читает ночной обход.
# Гонит НАСТОЯЩУЮ _check_alert_contract() из боевого сборщика против боевого agent-alert и против копий agent-alert,
# испорченных по одному якорю. Сборщик не правится и не запускается (только импорт функции, __main__ не исполняется).
# __pycache__ исключён (правило B-N-1599): python3 -B и PYTHONDONTWRITEBYTECODE=1.
# ⚠️ НЕ ЛОВИТ: смысл обёртки (функция сверяет написание трёх якорей, не поведение shell); бюджет длины (_alert_budget);
#    доставку тревоги вообще. host-prefix по устройству функции отдельно от origin-wrapper не вызывается — П3 ждёт оба.
# Коды: 0 — всё зелёное; 1 — красное (с именами пунктов); 2 — слепота (стенд не состоялся).
set -uo pipefail
SB="${SBORSHCHIK_BIN:-/usr/local/sbin/sadik-backup.py}"
AA="${AGENT_ALERT_REAL:-/usr/local/bin/agent-alert}"
[ -r "$SB" ] || { echo "СЛЕПОТА: нет сборщика $SB"; exit 2; }
[ -r "$AA" ] || { echo "СЛЕПОТА: нет agent-alert $AA"; exit 2; }
command -v python3 >/dev/null || { echo "СЛЕПОТА: нет python3"; exit 2; }
T=$(mktemp -d /tmp/stend-dogovora-trevogi.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
echo "== стенд договора тревоги: $SB ($(sha256sum "$SB" | cut -c1-16)) × $AA ($(sha256sum "$AA" | cut -c1-16)) =="

PYTHONDONTWRITEBYTECODE=1 python3 -B - "$SB" "$AA" "$T" <<'PY'
import sys, hashlib, importlib.util
from importlib.machinery import SourceFileLoader
sys.dont_write_bytecode = True
sb, aa, t = sys.argv[1:]
try:
    loader = SourceFileLoader('sborshchik', sb)
    spec = importlib.util.spec_from_loader('sborshchik', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
    f = m._check_alert_contract
except Exception as e:
    print(f'СЛЕПОТА: функция договора не загружена — {type(e).__name__}: {e}'); sys.exit(2)
zhurnal = []
m.log = lambda x: zhurnal.append(x)

def zov(alert):
    zhurnal.clear(); m.ALERT = alert
    return f(), (zhurnal[0] if zhurnal else '')

def punkty(stroka):
    # «…не подтверждён: host-prefix, origin-wrapper; точность…» → набор названных пунктов
    if 'не подтверждён: ' not in stroka: return set()
    return {p.strip() for p in stroka.split('не подтверждён: ', 1)[1].split(';', 1)[0].split(',')}

ok = bad = 0
def sud(good, imya, prichina=''):
    global ok, bad
    if good: ok += 1; print(f'  ok    {imya}')
    else: bad += 1; print(f'  FAIL  {imya} — {prichina}')

src = open(aa, encoding='utf-8').read()
def porcha(imya, old, new):
    n = src.count(old)
    if n != 1:
        print(f'СЛЕПОТА: порча {imya} не внесена — образец встречается {n} раз (ждали 1); agent-alert изменился, стенд устарел'); sys.exit(2)
    put = f'{t}/agent-alert-{imya}'
    open(put, 'w', encoding='utf-8').write(src.replace(old, new))
    print(f'   порча {imya}: замен 1, sha {hashlib.sha256(src.encode()).hexdigest()[:16]} → {hashlib.sha256(open(put,"rb").read()).hexdigest()[:16]}')
    return put

# П1 исправное: боевые сборщик + agent-alert — договор подтверждён, журнал молчит
r, z = zov(aa)
sud(r is True and not z, 'П1 боевой agent-alert: договор подтверждён', f'исход {r}; {z[:220]}')
# П2 порча origin-wrapper: в PREFIX снят « ·» после источника
r, z = zov(porcha('origin', 'PREFIX="[${host}]${ISTOCHNIK:+ ⚠️ $ISTOCHNIK ·} "', 'PREFIX="[${host}]${ISTOCHNIK:+ ⚠️ $ISTOCHNIK} "'))
sud(r is False and punkty(z) == {'origin-wrapper'}, 'П2 порча PREFIX → красно: origin-wrapper', f'исход {r}; пункты {sorted(punkty(z))}')
# П3 порча host-prefix: текст без PREFIX
r, z = zov(porcha('host', '--data-urlencode "text=${PREFIX}${msg}"', '--data-urlencode "text=${msg}"'))
sud(r is False and punkty(z) == {'host-prefix', 'origin-wrapper'}, 'П3 порча text= → красно: host-prefix, origin-wrapper', f'исход {r}; пункты {sorted(punkty(z))}')
# П4 порча timer-empty-origin: таймер получает непустой источник
r, z = zov(porcha('timer', "[ -n \"$tb\" ] && { printf ''; return; }", "[ -n \"$tb\" ] && { printf 'x'; return; }"))
sud(r is False and punkty(z) == {'timer-empty-origin'}, 'П4 порча таймера → красно: timer-empty-origin', f'исход {r}; пункты {sorted(punkty(z))}')
# П5 agent-alert отсутствует — красно с причиной, а не тишина
r, z = zov(f'{t}/net-takogo/agent-alert')
sud(r is False and 'FileNotFoundError' in z, 'П5 нет agent-alert → красно: FileNotFoundError', f'исход {r}; {z[:160]}')
# П6 возврат: снова боевой — снова зелёное
r, z = zov(aa)
sud(r is True and not z, 'П6 возврат на боевой → снова подтверждён', f'исход {r}; {z[:220]}')
print(f'ИТОГ: {ok} из {ok+bad}')
sys.exit(0 if bad == 0 else 1)
PY
RC=$?
[ "$RC" = 0 ] || [ "$RC" = 1 ] || [ "$RC" = 2 ] || { echo "СЛЕПОТА: прогон упал (код $RC)"; exit 2; }
exit "$RC"
