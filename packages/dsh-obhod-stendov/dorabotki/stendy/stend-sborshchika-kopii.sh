#!/bin/bash
# Стенд сборщика копии /usr/local/sbin/sadik-backup.py — восстановимый __pycache__ (B-N-1434) и разбор чужих .pyc вне процесса
# сборки (B-N-1436). B-N-1448 (02.10.2026, Заря): прежде у сборщика стенда не было — логику кэша ночной обход не стерёг.
# Гонит НАСТОЯЩУЮ sobrat() сборщика на подставном доме во временном каталоге: ни реестра, ни Drive, ни /backups.
# Тревога сборщика — заглушка (AGENT_ALERT_BIN), боевой канал не зовётся. Root не нужен (дом свой), ~3 с.
# Дом: horosh/ — кэш = перекомпиляции (должен быть ПРОПУЩЕН); ustar/ — заголовок .pyc устарел (решение «нет» — кэш в копию,
# без строки сбоя); plokh/ — нарочная пара: .py, на котором compile бросает RecursionError, и .pyc с верным заголовком.
# До B-N-1436 plokh ронял сборку целиком (исключение мимо перехвата; со стеком поменьше — сегфолт).
# ⚠️ НЕ ЛОВИТ: сегфолт разборщика (случай не взят — на sadik core_pattern ведёт в apport, и каждый прогон клал бы ~13 МБ
#    в /var/crash, ulimit -c 0 этого не гасит — проверено 02.10); срок разбора (S4) и KILL извне (S6) — см. kandidaty/B-N-1436.
# B-N-2101 (17.10.2026, Искра): + исчезновение файла между обходом и tar.add (7–9) и «-journal» снятой базы (10).
# Коды: 0 — 10 из 10; 1 — красное; 2 — слепота (стенд не состоялся).
set -uo pipefail
SB="${SBORSHCHIK_BIN:-/usr/local/sbin/sadik-backup.py}"
[ -r "$SB" ] || { echo "СЛЕПОТА: нет сборщика $SB"; exit 2; }
command -v python3 >/dev/null || { echo "СЛЕПОТА: нет python3"; exit 2; }
T=$(mktemp -d /tmp/stend-sborshchika.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
printf '#!/bin/bash\necho "$*" >> "%s/trevoga.log"\n' "$T" > "$T/alert.sh"; chmod 755 "$T/alert.sh"
echo "== стенд сборщика копии: $SB ($(sha256sum "$SB" | cut -c1-16)) =="

# ── подставной дом ────────────────────────────────────────────────────────────
D="$T/dom"
python3 -B - "$D" <<'PY' || { echo "СЛЕПОТА: подставной дом не собран"; exit 2; }
import importlib.util, os, py_compile, struct, sys
d = sys.argv[1]
for k in ('horosh', 'ustar', 'plokh', 'ischez'):
    os.makedirs(f'{d}/{k}')
# B-N-2101: ischez/ — файл, который исчезнет между обходом и tar.add (16.10 03:32Z receipts.sqlite-journal уронил сборку
# кодом 4); baza.db с «-journal» — журнал снятой снимком базы в копию не кладётся (3.1.4).
open(f'{d}/ischez/a-pervyj', 'w').write('ostanetsya\n'); open(f'{d}/ischez/z-ischezayushchij', 'w').write('ischeznet\n')
import sqlite3; c = sqlite3.connect(f'{d}/ischez/baza.db'); c.execute('create table t(x)'); c.commit(); c.close()
open(f'{d}/ischez/baza.db-journal', 'w').write('')
for k in ('horosh', 'ustar'):
    open(f'{d}/{k}/a.py', 'w').write('print("ok")\n')
    py_compile.compile(f'{d}/{k}/a.py', doraise=True)
st = os.stat(f'{d}/ustar/a.py'); os.utime(f'{d}/ustar/a.py', (st.st_atime, st.st_mtime + 100))   # заголовок .pyc устарел
py = f'{d}/plokh/rek.py'
open(py, 'w').write('x=' + '+'.join(['a'] * 200000) + '\n')
st = os.stat(py); pyc = importlib.util.cache_from_source(py); os.makedirs(os.path.dirname(pyc))
open(pyc, 'wb').write(importlib.util.MAGIC_NUMBER + struct.pack('<III', 0, int(st.st_mtime) & 0xffffffff, st.st_size & 0xffffffff)
                      + b'\xe3NAROCHNO')
PY

# ── прогон настоящей sobrat() ─────────────────────────────────────────────────
AGENT_ALERT_BIN="$T/alert.sh" python3 -B - "$SB" "$D" "$T/kopiya.tar.gz" > "$T/vyvod" 2>&1 <<'PY'
import importlib.util, sys, tarfile
from importlib.machinery import SourceFileLoader
loader = SourceFileLoader('sborshchik', sys.argv[1])
import os
_add = tarfile.TarFile.add
def _add_s_ischeznoveniem(self, name, *a, **k):   # B-N-2101: файл был при обходе (listdir) и исчез до tar.add — гонка 16.10
    if name.endswith('/z-ischezayushchij') and os.path.exists(name):
        os.remove(name); print('ПОРЧА ВНЕСЕНА: удалён перед tar.add', name)
    return _add(self, name, *a, **k)
tarfile.TarFile.add = _add_s_ischeznoveniem
spec = importlib.util.spec_from_loader('sborshchik', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
arh = m.sobrat([sys.argv[2] + '/'], __import__('pathlib').Path(sys.argv[3]))
for n in tarfile.open(arh).getnames():
    print('ЧЛЕН', '/' + n)
print('ИТОГ_СБОРКИ дошла до конца')
PY
RC=$?
# B-N-2101: и «ОТКАЗ:» сборщика (fail → SystemExit) — прежде его «[Errno 2]» не совпадал с «Error», и падение 16.10 читалось слепотой.
grep -q '^ЧЛЕН\|^ИТОГ_СБОРКИ\|^ОТКАЗ:\|Error\|Traceback' "$T/vyvod" || { echo "СЛЕПОТА: прогон ничего не сказал (код $RC)"; sed 's/^/   /' "$T/vyvod" | head -5; exit 2; }

ok=0; bad=0
sud(){ if [ "$1" = ok ]; then ok=$((ok+1)); printf '  ok    %s\n' "$2"; else bad=$((bad+1)); printf '  FAIL  %s — %s\n' "$2" "$3"; fi; }
est(){ grep -qxF "ЧЛЕН $1" "$T/vyvod"; }
PH="$D/horosh/__pycache__/a.cpython-312.pyc"; PU="$D/ustar/__pycache__/a.cpython-312.pyc"; PP="$D/plokh/__pycache__/rek.cpython-312.pyc"
[ "$RC" = 0 ] && grep -q '^ИТОГ_СБОРКИ' "$T/vyvod" && sud ok "1 сборка дошла до конца" \
  || sud fail "1 сборка дошла до конца" "код $RC: $(grep -m1 -E 'Error|Segmentation' "$T/vyvod" | cut -c1-90)"
grep -qF "ВОССТАНОВИМЫЙ КЭШ ПРОПУЩЕН: $D/horosh/__pycache__" "$T/vyvod" && ! est "$PH" && sud ok "2 исправный кэш пропущен" \
  || sud fail "2 исправный кэш пропущен" "строки $(grep -cF "ПРОПУЩЕН: $D/horosh" "$T/vyvod"), в копии $(est "$PH" && echo да || echo нет)"
est "$PU" && ! grep -F "$D/ustar" "$T/vyvod" | grep -qF 'НЕ РАЗОБРАН' \
  && sud ok "3 устаревший кэш — в копию, без строки сбоя" \
  || sud fail "3 устаревший кэш — в копию, без строки сбоя" "в копии $(est "$PU" && echo да || echo нет), строк сбоя $(grep -F "$D/ustar" "$T/vyvod" | grep -cF 'НЕ РАЗОБРАН')"
est "$PP" && sud ok "4 нарочный .pyc лёг в копию как есть" || sud fail "4 нарочный .pyc лёг в копию как есть" "в копии нет"
grep -F "$D/plokh/__pycache__" "$T/vyvod" | grep -qF 'КЭШ НЕ РАЗОБРАН' && sud ok "5 нарочный .pyc назван строкой «КЭШ НЕ РАЗОБРАН»" \
  || sud fail "5 нарочный .pyc назван строкой «КЭШ НЕ РАЗОБРАН»" "строки нет — сбой разбора молчит"
est "$D/horosh/a.py" && est "$D/ustar/a.py" && est "$D/plokh/rek.py" && sud ok "6 исходники .py всех трёх в копии" \
  || sud fail "6 исходники .py всех трёх в копии" "нет хотя бы одного"
# 7–10 (B-N-2101): исчезнувший посреди сборки файл не роняет сборку и назван; соседи легли; «-journal» снятой базы не кладётся.
PI="$D/ischez/z-ischezayushchij"
grep -qF "ПОРЧА ВНЕСЕНА: удалён перед tar.add $PI" "$T/vyvod" || { echo "СЛЕПОТА: исчезновение не внесено — пробы 7–10 бессильны"; exit 2; }
[ "$RC" = 0 ] && grep -q '^ИТОГ_СБОРКИ' "$T/vyvod" && sud ok "7 файл исчез посреди сборки — сборка дошла до конца" \
  || sud fail "7 файл исчез посреди сборки — сборка дошла до конца" "код $RC: $(grep -m1 -E 'Error' "$T/vyvod" | cut -c1-90)"
grep -qF "исчез во время сборки: $PI" "$T/vyvod" && grep -qF 'исчезло во время сборки: 1' "$T/vyvod" \
  && sud ok "8 исчезнувший назван, итог «исчезло во время сборки: 1»" \
  || sud fail "8 исчезнувший назван, итог «исчезло во время сборки: 1»" "строк: имя $(grep -cF "исчез во время сборки: $PI" "$T/vyvod"), итог «$(grep -m1 -o 'исчезло во время сборки: [0-9]*' "$T/vyvod")»"
! est "$PI" && est "$D/ischez/a-pervyj" && sud ok "9 исчезнувшего в копии нет, сосед лёг" \
  || sud fail "9 исчезнувшего в копии нет, сосед лёг" "исчезнувший $(est "$PI" && echo есть || echo нет), сосед $(est "$D/ischez/a-pervyj" && echo есть || echo нет)"
est "$D/ischez/baza.db" && ! est "$D/ischez/baza.db-journal" && sud ok "10 «-journal» снятой снимком базы не кладётся, база легла" \
  || sud fail "10 «-journal» снятой снимком базы не кладётся, база легла" "база $(est "$D/ischez/baza.db" && echo есть || echo нет), журнал $(est "$D/ischez/baza.db-journal" && echo есть || echo нет)"
[ -s "$T/trevoga.log" ] && echo "  (сборщик звал тревогу — заглушка: $(head -c 120 "$T/trevoga.log"))"

ZHDYOM=10   # 6 + 7–10 (B-N-2101)
echo; echo "  ok=$ok  FAIL=$bad   (всего $((ok+bad)), ждём $ZHDYOM)"
[ $((ok+bad)) -ne $ZHDYOM ] && { echo "🔴 СЛЕПОТА: проверок $((ok+bad)) вместо $ZHDYOM"; exit 2; }
[ $bad -gt 0 ] && exit 1
echo "✅ сборщик копии: кэш решает верно, нарочный .pyc не роняет сборку"
exit 0
