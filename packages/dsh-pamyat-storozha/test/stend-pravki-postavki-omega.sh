#!/bin/bash
# СТЕНД ПРИЗНАКА 6 omega-kopiya-watch — «локальная правка поставки OMEGA». 26.09.2026; переносимая редакция.
# ЗОВУЩИЕ — ворота правки omega-kopiya-watch (автор + приёмщик) и НОЧНОЙ ОБХОД: строка perechen-boevyh-stendov.txt, доводы — таблица
#   vse-stendy-boevye.sh (A-N-1711, 07.10.2026). Прежнее «в суточный обход не ставить» (26.09) снято: sudo в среде обхода есть,
#   ночью ~20 с (замер 17.10). Последний такт читает БОЕВУЮ поставку OMEGA и БОЕВОЙ systemctl: красное там ночью — живое
#   состояние машины (правка стёрта или новее старта omega-memory), а не дефект стенда; поставка без правки — СЛЕПОТА, код 2.
# Доводы: $1 — путь к сторожу. Переменные: STEND_PRAVKA — патч правки поставки (умолч. — путь из строки перечня пункта STEND_PUNKT_SEARCH для _search.py);
#   STEND_PAMYAT — база pamyat.db любого агента для копии (умолч. — подставная пустая: признаку 6 содержимое не нужно);
#   OSNOVA — сторож без признака 6 для такта «осн» (необязательно; нет — такта нет).
# Боевые база и поставка — только чтение (копии в своём /tmp). Основа _search.py для порчи «стёрта» — обратное наложение STEND_PRAVKA
#   на копию боевых файлов; не снимается — СЛЕПОТА, код 2. Поставка без правки (метки ≠ 1/2) — СЛЕПОТА, код 2: стенд меряет СТОРОЖА
#   на раскладке с правкой, а не саму поставку (её меряет сам признак 6).
# STEND_PRAVKI — перечень правок поставки (умолч. — ключ OKW_PRAVKI файла STEND_KONF; нет — СЛЕПОТА); копия поставки берёт
#   ВСЕ файлы перечня; такты tD–tK: снять метку STEND_PUNKT_BRIDGE / STEND_PUNKT_HANDLERS → «стёрта» ровно она; перечень негоден / нет → слепота;
#   пункт без последней цифры ≠ пункт.
# STEND_PUNKT_SEARCH (правка _search.py/_query.py, меток 1/2), STEND_PUNKT_BRIDGE (omega/bridge.py), STEND_PUNKT_HANDLERS
#   (omega/server/handlers.py) — пункты перечня, ДАННЫЕ; обязательны, нет — СЛЕПОТА стенда, код 2.
# STEND_KONF — файл настройки пакета для сторожа (DSH_PAMYAT_STOROZHA_CONF); умолч. — пустой.
# EN: STAND FOR SIGN 6 of omega-kopiya-watch — "local patch of the OMEGA distribution". 26.09.2026; portable
#     edition.
#     CALLERS: the omega-kopiya-watch edit gate (author + acceptor) and the NIGHTLY ROUND (perechen-boevyh-stendov.txt line,
#     arguments from the vse-stendy-boevye.sh table; A-N-1711, 07.10.2026). The former "not for the daily round" (26.09) is
#     withdrawn: sudo is available there, ~20 s at night (measured 17.10). The last step reads the PRODUCTION OMEGA install and
#     PRODUCTION systemctl: red there at night is live machine state (patch wiped or newer than omega-memory start), not a stand
#     defect; an install without the patch is BLINDNESS, code 2.
#     Arguments: $1 — path to the watcher. Variables: STEND_PRAVKA — the distribution patch (default — the path
#     from the list line of item STEND_PUNKT_SEARCH for _search.py); STEND_PAMYAT — any agent's pamyat.db base
#     for the copy (default — an empty stand-in: sign 6 does not need contents); OSNOVA — the watcher without
#     sign 6 for the "осн" cycle (optional; absent — no such cycle).
#     The production base and distribution are read-only (copies in its own /tmp). The _search.py base for the
#     "wiped" corruption is the reverse application of STEND_PRAVKA to a copy of the production files; if it
#     cannot be taken — BLINDNESS, code 2. A distribution without the patch (labels ≠ 1/2) — BLINDNESS, code 2:
#     the stand measures the WATCHER on a layout with the patch, not the distribution itself (sign 6 measures
#     that).
#     STEND_PRAVKI — the list of distribution patches (default — the OKW_PRAVKI key of the STEND_KONF file;
#     absent — BLINDNESS); the distribution copy takes ALL files in the list; cycles tD–tK: remove the label
#     STEND_PUNKT_BRIDGE / STEND_PUNKT_HANDLERS → exactly it is "wiped"; the list invalid / absent → blindness;
#     an item without its last digit ≠ the item.
#     STEND_PUNKT_SEARCH (the _search.py/_query.py patch, labels 1/2), STEND_PUNKT_BRIDGE (omega/bridge.py),
#     STEND_PUNKT_HANDLERS (omega/server/handlers.py) — list items, DATA; mandatory, absent — stand BLINDNESS,
#     code 2.
#     STEND_KONF — the package settings file for the watcher (DSH_PAMYAT_STOROZHA_CONF); default — empty.
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
W=${1:?путь к сторожу}; PRAVKA=${STEND_PRAVKA:-}
PRAVKI_B=${STEND_PRAVKI:-$(sed -n 's/^[[:space:]]*OKW_PRAVKI[[:space:]]*=[[:space:]]*//p' "${STEND_KONF:-/dev/null}" 2>/dev/null | tail -n 1)}; PR=$PRAVKI_B
P_S=${STEND_PUNKT_SEARCH:-}; P_B=${STEND_PUNKT_BRIDGE:-}; P_H=${STEND_PUNKT_HANDLERS:-}
[ -n "$P_S" ] && [ -n "$P_B" ] && [ -n "$P_H" ] || { echo "СЛЕПОТА стенда: не заданы STEND_PUNKT_SEARCH / STEND_PUNKT_BRIDGE / STEND_PUNKT_HANDLERS"; exit 2; }
P_98=${P_S%?}   # пункт без последней цифры: его метка не должна засчитываться за метку пункта · EN: an item without its last digit: its label must not count as the item's label
# Вердикт — автоматом: каждый такт сверяется с ожиданием PLAN.md (тревог признака 6 новых · слово в выводе · отметок pravka:);
# код выхода 1 при любом расхождении. Свой /tmp и указатель .put убираются при ЛЮБОМ выходе (trap).
# EN: The verdict is automatic: each cycle is compared with the PLAN.md expectation (new sign 6 alarms · word in
#     the output · pravka: marks); exit code 1 on any divergence. Its own /tmp and the .put pointer are removed
#     on ANY exit (trap).
T=$(mktemp -d /tmp/stend-pravki-postavki-XXXX); RASH=0; VSEGO=0
trap 'rm -rf -- "$T"' EXIT; echo "T=$T · сторож $(sha256sum < "$W" | cut -c1-16)"
M="ЛОКАЛЬНАЯ ПРАВКА ПОСТАВКИ $P_S"; LIVE=/opt/omega/venv/lib/python3.12/site-packages
# RU: Версию поставки берём с живой поставки, а не числом в стенде: зашитая версия отстала при обновлении OMEGA,
#     и стенд краснел «СВЕРИТЬ ПРАВКУ» на исправном стороже в каждом такте.
# EN: The distribution version is taken from the live install, not a number in the test: a hard-coded version fell behind
#     an OMEGA upgrade, and the test went red with "СВЕРИТЬ ПРАВКУ" on a healthy watch in every step.
DI=$(cd $LIVE && ls -d omega_memory-*.dist-info 2>/dev/null); [ "$(printf '%s\n' $DI | grep -c .)" = 1 ] || {
  echo "СЛЕПОТА: в $LIVE не ровно одна omega_memory-*.dist-info: ${DI:-нет}"; exit 2; }
VER=${DI#omega_memory-}; VER=${VER%.dist-info}; VER_P=0.0.0-stend; echo "   версия поставки: $VER (с живой поставки)"
SP=$T/sp; mkdir -p $SP/omega/sqlite_store $SP/$DI
cp $LIVE/omega/sqlite_store/_search.py $LIVE/omega/sqlite_store/_query.py $SP/omega/sqlite_store/
[ -r "$PRAVKI_B" ] || { echo "СЛЕПОТА: перечня правок нет: $PRAVKI_B"; exit 2; }
[ -n "$PRAVKA" ] || PRAVKA=$(awk -v p="$P_S" '$1==p && $2=="omega/sqlite_store/_search.py" {print $5; exit}' "$PRAVKI_B")
for f in $(grep -vE '^[[:space:]]*(#|$)' "$PRAVKI_B" | awk '{print $2}' | sort -u); do mkdir -p "$SP/$(dirname "$f")"; cp "$LIVE/$f" "$SP/$f" || { echo "СЛЕПОТА: нет $LIVE/$f"; exit 2; }; done
[ "$(grep -cF "$M" $SP/omega/sqlite_store/_search.py)/$(grep -cF "$M" $SP/omega/sqlite_store/_query.py)" = 1/2 ] || {
  echo "СЛЕПОТА: боевая поставка без правки $P_S (метки ≠ 1/2) — стенду не на чем мерить сторожа"; exit 2; }
cp $SP/omega/sqlite_store/_search.py $T/boj-search.py   # возврат А — из этой копии, не из живого файла · EN: return A — from this copy, not from the live file
mkdir -p $T/osn/omega/sqlite_store; cp $SP/omega/sqlite_store/_search.py $SP/omega/sqlite_store/_query.py $T/osn/omega/sqlite_store/
patch -R -p1 -s -d $T/osn < "$PRAVKA" 2>/dev/null && [ "$(grep -cF "$M" $T/osn/omega/sqlite_store/_search.py)" = 0 ] || {
  echo "СЛЕПОТА: правка $PRAVKA не снимается обратным наложением с боевых файлов — основы для порчи «стёрта» нет"; exit 2; }
echo "   основа _search.py — обратным наложением $PRAVKA: меток $(grep -cF "$M" $T/osn/omega/sqlite_store/_search.py), sha $(sha256sum < $T/osn/omega/sqlite_store/_search.py | cut -c1-8)"
sudo /opt/omega/venv/bin/python3 -c "
import sqlite3,sys; s=sqlite3.connect('file:/var/lib/omega/.omega/omega.db?mode=ro',uri=True); d=sqlite3.connect(sys.argv[1]); s.backup(d); d.close()" $T/omega.db
sudo chown "$(id -un):" $T/omega.db; mkdir -p $T/pam/stend/pamyat
if [ -n "${STEND_PAMYAT:-}" ]; then sudo python3 -c "
import sqlite3,sys; s=sqlite3.connect(f'file:{sys.argv[1]}?mode=ro',uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close()" "$STEND_PAMYAT" $T/pam/stend/pamyat/pamyat.db
  sudo chown "$(id -un):" $T/pam/stend/pamyat/pamyat.db
else python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE zapisi (id INTEGER, soderzhim TEXT, sozdano INTEGER, klass TEXT)')" $T/pam/stend/pamyat/pamyat.db; fi
printf '#!/bin/bash\necho "ActiveState=$(cat %s/sc-state)"; echo "ExecMainStartTimestamp=@$(cat %s/sc-start)"\n' $T $T > $T/systemctl
printf '#!/bin/bash\nprintf "%%s\\t%%s\\n" "$(cat %s/kanal)" "$1" >> %s/kanal.log; [ "$(cat %s/kanal)" = ok ]\n' $T $T $T > $T/alert
chmod +x $T/systemctl $T/alert; echo ok > $T/kanal; echo active > $T/sc-state; : > $T/kanal.log
obrez() { python3 -c 'import sys; [print(l.rstrip("\n")[:int(sys.argv[1])]) for l in sys.stdin]' "$1"; }   # по ЗНАКАМ: cut -c режет байты посреди буквы · EN: by CHARACTERS: cut -c cuts bytes in the middle of a letter
mt() { stat -c %Y $SP/omega/sqlite_store/_search.py $SP/omega/sqlite_store/_query.py | sort -n | tail -1; }
start_posle() { echo $(( $(mt) + 5 )) > $T/sc-start; }
metki() { echo "метки _search $(grep -cF "$M" $SP/omega/sqlite_store/_search.py) _query $(grep -cF "$M" $SP/omega/sqlite_store/_query.py) · sha _search $(sha256sum < $SP/omega/sqlite_store/_search.py | cut -c1-8)"; }
start_posle; N=0
takt() {   # $1 имя такта, $2 ожид. новых тревог, $3 ожид. слово в выводе («-» = строки признака нет), $4 ожид. отметок, $5 сторож · EN: $1 cycle name, $2 expected new alarms, $3 expected word in the output ("-" = no sign line), $4 expected marks, $5 watcher
  local ozn=$2 ozs=$3 ozo=$4; local w=${5:-$W} do_=$(grep -c 'ПРАВКА ПОСТАВКИ' $T/kanal.log)
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin DSH_PAMYAT_STOROZHA_CONF="${STEND_KONF:-$T/net.conf}" OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
    OKW_CORE=$T/net-yadra OKW_OMEGA_SP=$SP OKW_SYSTEMCTL=$T/systemctl OKW_PRAVKI="$PR" PYTHONDONTWRITEBYTECODE=1 python3 "$w" > $T/out-$1.txt 2>&1; local kod=$?
  local stroka=$(grep -F 'правка поставки OMEGA' $T/out-$1.txt | head -2 | obrez 230 | tr '\n' ' ')
  local novye=$(( $(grep -c 'ПРАВКА ПОСТАВКИ' $T/kanal.log) - do_ ))
  echo "== $1 · код $kod · тревог признака 6 новых $novye · отметок pravka: в STATE $(python3 -c "import json;print(sum(k.startswith('pravka:') for k in json.load(open('$T/state.json'))['ids']))" 2>/dev/null || echo ?)"
  echo "   вывод: ${stroka:-— строки признака 6 нет}"
  [ $novye -gt 0 ] && grep 'ПРАВКА ПОСТАВКИ' $T/kanal.log | tail -$novye | obrez 400 | sed 's/^/   канал: /'
  grep -F 'НЕ ушла' $T/out-$1.txt | grep -F 'правке поставки' | sed 's/^/   /'
  grep -F 'СЛЕПОТА' $T/out-$1.txt | obrez 200 | sed 's/^/   /'
  local otm=$(python3 -c "import json;print(sum(k.startswith('pravka:') for k in json.load(open('$T/state.json'))['ids']))" 2>/dev/null || echo ?)
  local slovo_ok; if [ "$ozs" = - ]; then [ -z "$stroka" ] && slovo_ok=1; else grep -qF -- "$ozs" $T/out-$1.txt && slovo_ok=1; fi
  VSEGO=$((VSEGO+1))
  if [ "$novye" = "$ozn" ] && [ -n "${slovo_ok:-}" ] && [ "$otm" = "$ozo" ]; then echo "   ✅ ожидание: новых $ozn · «$ozs» · отметок $ozo"
  else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: ждала новых $ozn · «$ozs» · отметок $ozo — есть новых $novye · слово ${slovo_ok:+есть}${slovo_ok:-НЕТ} · отметок $otm"; fi
}
porcha_A() { echo "   порча А до: $(metki)"; cp $T/osn/omega/sqlite_store/_search.py $SP/omega/sqlite_store/_search.py; start_posle; echo "   порча А после: $(metki)"; }
vozvrat_A() { cp $T/boj-search.py $SP/omega/sqlite_store/_search.py; start_posle; echo "   возврат А: $(metki)"; }
porcha_B() { mv $SP/$DI $SP/omega_memory-$VER_P.dist-info; echo "   порча Б: $(ls -d $SP/omega_memory-*)"; }
vozvrat_B() { mv $SP/omega_memory-$VER_P.dist-info $SP/$DI; echo "   возврат Б: $(ls -d $SP/omega_memory-*)"; }
porcha_V() { echo $(( $(mt) - 100 )) > $T/sc-start; echo "   порча В: старт $(cat $T/sc-start) < mtime $(mt)"; }
vozvrat_V() { start_posle; echo "   возврат В: старт $(cat $T/sc-start) > mtime $(mt)"; }
takt t0 0 ЦЕЛА 0
porcha_A; takt t1 1 'СТЁРТА: _search.py меток 0 из 1' 1; takt t2 0 СТЁРТА 1
vozvrat_A; takt t3 0 ЦЕЛА 0
porcha_A; takt t4 1 СТЁРТА 1; vozvrat_A; takt t5 0 ЦЕЛА 0
porcha_B; takt t6 1 "СВЕРИТЬ ПРАВКУ: omega-memory $VER_P" 1; vozvrat_B; takt t7 0 ЦЕЛА 0
porcha_V; takt t8 1 'НА ДИСКЕ, НЕ В ПАМЯТИ' 1; vozvrat_V; takt t9 0 ЦЕЛА 0
porcha_A; porcha_B; porcha_V; echo fail > $T/kanal; takt t10 1 'тревога о правке поставки НЕ ушла' 0
# У «СТЁРТА» теперь порядок восстановления — t11 судит стык двух причин («…перезапуск omega-memory); СВЕРИТЬ ПРАВКУ»)
# EN: "WIPED" now has a restore procedure — t11 judges the joint of two causes ("…restart omega-memory); CHECK
#     THE PATCH")
echo ok > $T/kanal; takt t11 1 'перезапуск omega-memory); СВЕРИТЬ ПРАВКУ' 1; takt t12 0 СТЁРТА 1
vozvrat_A; vozvrat_B; takt t13 0 ЦЕЛА 0
echo inactive > $T/sc-state; echo "   порча Г: ActiveState=$(cat $T/sc-state)"; takt t14 0 'СЛЕПОТА: правка поставки OMEGA' 0
echo active > $T/sc-state; takt t15 0 ЦЕЛА 0
# ── Метки каждой правки отдельно; перечень — данные
# EN: ── Labels of each patch separately; the list is data
snyat() {   # $1 файл от SP, $2 пункт: первую строку с меткой ЭТОЙ правки обезметить; печать числа до/после · EN: $1 file relative to SP, $2 item: unlabel the first line with THIS patch's label; print the count before/after
  python3 - "$SP/$1" "ЛОКАЛЬНАЯ ПРАВКА ПОСТАВКИ $2" <<'PYS'
import sys, re; p, m = sys.argv[1:]; s = open(p, encoding='utf-8').read().split('\n'); rx = re.compile(re.escape(m) + r'(?!\d)')
do = sum(bool(rx.search(l)) for l in s); i = next(i for i, l in enumerate(s) if rx.search(l)); s[i] = rx.sub('СНЯТО-СТЕНДОМ', s[i], count=1)
open(p, 'w', encoding='utf-8').write('\n'.join(s)); print(f'   порча: {p.split("/sp/")[-1]} меток «{m}» {do} → {sum(bool(rx.search(l)) for l in s)}')
PYS
  start_posle; }
tolko() {   # $1 — есть в последней тревоге, $2 — нет в ней · EN: $1 — present in the last alarm, $2 — absent from it
  local t=$(grep 'ПРАВКА ПОСТАВКИ' $T/kanal.log | tail -1); VSEGO=$((VSEGO+1))
  if printf '%s' "$t" | grep -qF -- "$1" && ! printf '%s' "$t" | grep -qF -- "$2"; then echo "   ✅ тревога называет «$1», не называет «$2»"
  else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ: в тревоге ждала «$1» без «$2»: $(printf '%s' "$t" | obrez 300)"; fi; }
cp $SP/omega/bridge.py $T/boj-bridge.py; cp $SP/omega/server/handlers.py $T/boj-handlers.py
snyat omega/bridge.py $P_B; takt tD 1 "СТЁРТА: bridge.py меток 1 из 2 (правка $P_B" 1; tolko "(правка $P_B" "(правка $P_H"
cp $T/boj-bridge.py $SP/omega/bridge.py; start_posle; takt tD2 0 ЦЕЛА 0
snyat omega/server/handlers.py $P_H; takt tE 1 "СТЁРТА: handlers.py меток 2 из 3 (правка $P_H" 1; tolko "(правка $P_H" "(правка $P_B"
cp $T/boj-handlers.py $SP/omega/server/handlers.py; start_posle; takt tE2 0 ЦЕЛА 0
PR=$T/pravki-negodnye; sed "0,/^$P_B /s/^\($P_B [^ ]*\) *2 /\1 два /" "$PRAVKI_B" > $PR; echo "   порча перечня Ж: строк «два» $(grep -c ' два ' $PR)"
takt tZh 0 'негодна' 0
PR=$T/pravok-net; echo "   порча перечня З: $PR есть? $([ -e $PR ] && echo да || echo нет)"; takt tZ 0 'СЛЕПОТА: правка поставки OMEGA' 0
PR=$T/pravki-98; sed "s/^$P_S \( *omega\/sqlite_store\/_search.py\)/$P_98 \1/" "$PRAVKI_B" > $PR; echo "   порча перечня И: строк «$P_98 » $(grep -c "^$P_98 " $PR)"
takt tI 1 "СТЁРТА: _search.py меток 0 из 1 (правка $P_98 " 1
PR=$PRAVKI_B; takt tK 0 ЦЕЛА 0
if [ -n "${OSNOVA:-}" ]; then
  echo "--- основа сторожа (OSNOVA) на порче А (свой STATE)"; porcha_A; cp $T/state.json $T/state-k.json; rm -f $T/state.json
  takt osn 0 - 0 "$OSNOVA"; vozvrat_A; mv $T/state-k.json $T/state.json
fi
echo "--- кандидат на БОЕВОЙ поставке и БОЕВОМ systemctl (только чтение), STATE свой"; rm -f $T/state.json
env -i DSH_PROBA=1 PATH=/usr/bin:/bin DSH_PAMYAT_STOROZHA_CONF="${STEND_KONF:-$T/net.conf}" OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
  OKW_CORE=$T/net-yadra OKW_PRAVKI="$PRAVKI_B" PYTHONDONTWRITEBYTECODE=1 python3 "$W" > $T/out-boj.txt 2>&1; echo "== бой · код $?"; grep -F 'правка поставки OMEGA' $T/out-boj.txt | sed 's/^/   /'
VSEGO=$((VSEGO+1)); if grep -F 'правка поставки OMEGA' $T/out-boj.txt | grep -qF 'ЦЕЛА'; then echo "   ✅ ожидание: «ЦЕЛА»"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: на бою не «ЦЕЛА»"; fi
echo "ВЕРДИКТ: тактов $VSEGO · расхождений с PLAN $RASH"; [ $RASH -eq 0 ]
