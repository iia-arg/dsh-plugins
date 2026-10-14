#!/bin/bash
# СТЕНД ПРИЗНАКА 7 omega-kopiya-watch — «модель эмбеддинга службы OMEGA на месте», 26.09.2026.
# ЗОВУЩИЙ — ворота правки omega-kopiya-watch (автор + приёмщик). Без sudo: база OMEGA и pamyat — пустые подставные,
#   каталог модели, systemctl, journalctl, канал — подставные; боевые каталог модели/systemctl/journalctl — только чтение в такте «бой».
# Доводы: $1 — путь к сторожу. Переменные: OSNOVA — сторож без признака 7 для такта «осн» (необязательно);
#   STEND_KONF — файл настройки пакета для сторожа (DSH_PAMYAT_STOROZHA_CONF); умолч. — пустой.
# Вердикт — автоматом по PLAN-stenda.md; код 1 при любом расхождении. Свой каталог в /var/tmp убирается при ЛЮБОМ выходе.
# EN: STAND FOR SIGN 7 of omega-kopiya-watch — "the OMEGA service embedding model is in place", 26.09.2026.
#     THE CALLER is the omega-kopiya-watch edit gate (author + acceptor). No sudo: the OMEGA and pamyat bases
#     are empty stand-ins; the model directory, systemctl, journalctl and the channel are stand-ins; the
#     production model directory/systemctl/journalctl are read-only in the "бой" cycle.
#     Arguments: $1 — path to the watcher. Variables: OSNOVA — the watcher without sign 7 for the "осн" cycle
#     (optional); STEND_KONF — the package settings file for the watcher (DSH_PAMYAT_STOROZHA_CONF); default —
#     empty.
#     The verdict is automatic per PLAN-stenda.md; code 1 on any divergence. Its own directory in /var/tmp is
#     removed on ANY exit.
set -u
W=${1:?путь к сторожу}
T=$(mktemp -d /var/tmp/stend-modeli-omega-XXXX); RASH=0; VSEGO=0
trap 'rm -rf -- "$T"' EXIT; echo "T=$T · сторож $(sha256sum < "$W" | cut -c1-16)"
python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE memories (node_id TEXT, content TEXT, ttl_seconds INTEGER, project TEXT, metadata TEXT, entity_id TEXT, status TEXT)')" $T/omega.db
mkdir -p $T/pam/stend/pamyat $T/model
python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE zapisi (id INTEGER, soderzhim TEXT, sozdano INTEGER, klass TEXT)')" $T/pam/stend/pamyat/pamyat.db
for f in model.onnx model.onnx_data tokenizer.json; do printf x > $T/model/$f; done
date +%s > $T/sc-start
printf '#!/bin/bash\necho "ActiveState=active"; echo "ExecMainStartTimestamp=@$(cat %s/sc-start)"\n' $T > $T/systemctl
printf '#!/bin/bash\ncat %s/zhurnal; exit $(cat %s/j-kod)\n' $T $T > $T/journalctl
printf '#!/bin/bash\nprintf "%%s\\t%%s\\n" "$(cat %s/kanal)" "$1" >> %s/kanal.log; [ "$(cat %s/kanal)" = ok ]\n' $T $T $T > $T/alert
chmod +x $T/systemctl $T/journalctl $T/alert; echo ok > $T/kanal; : > $T/kanal.log; echo 0 > $T/j-kod
ZH_OK='WARNING:omega.server:Startup RSS: 81.3 MB, PID: 1, transport: http
WARNING:omega.server:Memory pressure relief: RSS 5210.9 MB -> 5210.9 MB'
printf '%s\n' "$ZH_OK" > $T/zhurnal
obrez() { python3 -c 'import sys; [print(l.rstrip("\n")[:int(sys.argv[1])]) for l in sys.stdin]' "$1"; }   # по ЗНАКАМ · EN: by CHARACTERS
fajly() { echo "$(for f in model.onnx model.onnx_data tokenizer.json; do [ -e $T/model/$f ] && echo -n "$f=$(stat -c %s $T/model/$f) " || echo -n "$f=НЕТ "; done)"; }
otm() { python3 -c "import json;print(sum(k.startswith('model:') for k in json.load(open('$T/state.json'))['ids']))" 2>/dev/null || echo ?; }
takt() {   # $1 такт, $2 ожид. новых тревог, $3 ожид. слово («-» — строки признака 7 нет), $4 ожид. отметок, $5 сторож · EN: $1 cycle, $2 expected new alarms, $3 expected word ("-" — no sign 7 line), $4 expected marks, $5 watcher
  local ozn=$2 ozs=$3 ozo=$4; local w=${5:-$W} do_=$(grep -c 'МОДЕЛЬ ЭМБЕДДИНГА' $T/kanal.log)
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin DSH_PAMYAT_STOROZHA_CONF="${STEND_KONF:-$T/net.conf}" OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
    OKW_CORE=$T/net-yadra OKW_SYSTEMCTL=$T/systemctl OKW_JOURNALCTL=$T/journalctl OKW_OMEGA_MODEL_DIR=$T/model python3 "$w" > $T/out-$1.txt 2>&1; local kod=$?
  local stroka=$(grep -F 'модель эмбеддинга OMEGA (признак 7)' $T/out-$1.txt | head -1 | obrez 260)
  local novye=$(( $(grep -c 'МОДЕЛЬ ЭМБЕДДИНГА' $T/kanal.log) - do_ )) o=$(otm)
  echo "== $1 · код $kod · новых тревог признака 7 $novye · отметок model: $o"
  echo "   вывод: ${stroka:-— строки признака 7 нет}"
  [ $novye -gt 0 ] && grep 'МОДЕЛЬ ЭМБЕДДИНГА' $T/kanal.log | tail -$novye | obrez 400 | sed 's/^/   канал: /'
  grep -F 'СЛЕПОТА' $T/out-$1.txt | obrez 220 | sed 's/^/   /'
  local slovo_ok=; if [ "$ozs" = - ]; then [ -z "$stroka" ] && slovo_ok=1; else grep -qF -- "$ozs" $T/out-$1.txt && slovo_ok=1; fi
  VSEGO=$((VSEGO+1))
  if [ "$novye" = "$ozn" ] && [ -n "$slovo_ok" ] && [ "$o" = "$ozo" ]; then echo "   ✅ ожидание: новых $ozn · «$ozs» · отметок $ozo"
  else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: ждала новых $ozn · «$ozs» · отметок $ozo — есть новых $novye · слово $([ -n "$slovo_ok" ] && echo есть || echo НЕТ) · отметок $o"; fi
}
porcha_A() { echo "   порча А до: $(fajly)"; rm $T/model/model.onnx_data; echo "   порча А после: $(fajly)"; }
vozvrat_A() { printf x > $T/model/model.onnx_data; echo "   возврат А: $(fajly)"; }
porcha_B() { echo "   порча Б до: $(fajly)"; : > $T/model/model.onnx; echo "   порча Б после: $(fajly)"; }
vozvrat_B() { printf x > $T/model/model.onnx; echo "   возврат Б: $(fajly)"; }
porcha_V() { echo 'CRITICAL:omega.embedding:No embedding model loaded (attempt 1/3). Falling back to hash-based pseudo-embeddings' >> $T/zhurnal; echo "   порча В: строк «No embedding model loaded» в журнале $(grep -c 'No embedding model loaded' $T/zhurnal)"; }
vozvrat_zh() { printf '%s\n' "$ZH_OK" > $T/zhurnal; echo 0 > $T/j-kod; echo "   возврат журнала: строк $(wc -l < $T/zhurnal), «Startup RSS» $(grep -c 'Startup RSS' $T/zhurnal), код $(cat $T/j-kod)"; }
takt m0 0 'НА МЕСТЕ' 0
porcha_A; takt m1 1 'МОДЕЛИ НЕТ: '"$T"'/model/model.onnx_data отсутствует' 1; takt m2 0 'МОДЕЛИ НЕТ' 1
vozvrat_A; takt m3 0 'НА МЕСТЕ' 0
porcha_B; takt m4 1 'model.onnx пуст' 1; vozvrat_B; takt m5 0 'НА МЕСТЕ' 0
porcha_V; takt m6 1 'ВЕКТОР = ХЭШ' 1; vozvrat_zh; takt m7 0 'НА МЕСТЕ' 0
porcha_A; echo fail > $T/kanal; takt m8 1 'тревога о модели эмбеддинга НЕ ушла' 0
echo ok > $T/kanal; takt m9 1 'МОДЕЛИ НЕТ' 1; vozvrat_A; takt m10 0 'НА МЕСТЕ' 0
grep -v 'Startup RSS' $T/zhurnal > $T/zh2; mv $T/zh2 $T/zhurnal; echo "   порча Г: «Startup RSS» в журнале $(grep -c 'Startup RSS' $T/zhurnal)"
takt m11 0 'СЛЕПОТА: модель эмбеддинга OMEGA: журнал omega-memory с её старта без строки' 0
vozvrat_zh; echo 1 > $T/j-kod; echo "   порча Д: код journalctl $(cat $T/j-kod)"
takt m12 0 'СЛЕПОТА: модель эмбеддинга OMEGA: журнал omega-memory не прочитан' 0
vozvrat_zh; takt m13 0 'НА МЕСТЕ' 0
# Условие приёмки: ключ тревоги — по ВИДУ, без числа строк журнала; число растёт с каждой попыткой загрузки.
# EN: Acceptance condition: the alarm key is by KIND, without the number of journal lines; the number grows with
#     every load attempt.
dobav() { echo "$1" >> $T/zhurnal; echo "   журнал +1: строк про хэш $(grep -cE 'No embedding model loaded|hash-fallback' $T/zhurnal)"; }
dobav 'CRITICAL:omega.embedding:No embedding model loaded (attempt 1/3). Falling back to hash-based pseudo-embeddings'
takt v1 1 'ВЕКТОР = ХЭШ' 1; takt v2 0 'ВЕКТОР = ХЭШ' 1
dobav 'WARNING:omega.embedding:Using hash-fallback embeddings for 3 texts'; takt v3 0 'hash-fallback» 2' 1
dobav 'CRITICAL:omega.embedding:No embedding model loaded (attempt 2/3). Falling back to hash-based pseudo-embeddings'; takt v4 0 'hash-fallback» 3' 1
echo $(( $(cat $T/sc-start) + 60 )) > $T/sc-start; echo "   новый старт службы: @$(cat $T/sc-start)"; takt v5 1 'ВЕКТОР = ХЭШ' 2
vozvrat_zh; takt v6 0 'НА МЕСТЕ' 0
if [ -n "${OSNOVA:-}" ]; then
  echo "--- основа сторожа (OSNOVA) на порче А (свой STATE)"; porcha_A; cp $T/state.json $T/state-k.json; rm -f $T/state.json
  takt osn 0 - 0 "$OSNOVA"; vozvrat_A; mv $T/state-k.json $T/state.json
fi
echo "--- кандидат на БОЕВОМ каталоге модели, боевых systemctl/journalctl (только чтение), STATE свой"; rm -f $T/state.json
env -i DSH_PROBA=1 PATH=/usr/bin:/bin DSH_PAMYAT_STOROZHA_CONF="${STEND_KONF:-$T/net.conf}" OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
  OKW_CORE=$T/net-yadra python3 "$W" > $T/out-boj.txt 2>&1; echo "== бой · код $?"; grep -F 'модель эмбеддинга OMEGA' $T/out-boj.txt | obrez 300 | sed 's/^/   /'
VSEGO=$((VSEGO+1)); if grep -F 'модель эмбеддинга OMEGA (признак 7)' $T/out-boj.txt | grep -qF 'НА МЕСТЕ'; then echo "   ✅ ожидание: «НА МЕСТЕ»"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: на бою не «НА МЕСТЕ»"; fi
echo "ВЕРДИКТ: тактов $VSEGO · расхождений с PLAN $RASH"; [ $RASH -eq 0 ]
