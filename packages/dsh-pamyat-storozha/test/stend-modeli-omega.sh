#!/bin/bash
# СТЕНД ПРИЗНАКА 7 omega-kopiya-watch — «модель эмбеддинга службы OMEGA на месте», 26.09.2026.
# ЗОВУЩИЙ — ворота правки omega-kopiya-watch (автор + приёмщик) и ночной обход. База OMEGA (с таблицами векторов vec0) и
#   pamyat — подставные; каталог модели, systemctl, journalctl, канал — подставные; боевые каталог модели/systemctl/journalctl
#   и КОПИЯ боевой базы OMEGA (sudo, чтение) — в такте «бой». Нет sudo — такт «бой» СЛЕП, код 2.
#   С 18.10.2026 (журнал 2G) признак 7 берёт факт из БАЗЫ (записи без вектора / с хэш-вектором), журнал — вторичный с покрытием.
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
# База: 3 записи после старта с «настоящими» (случайными) векторами в чанке vec0 (4 места × 16 float32) — как схема omega.db.
# EN: Base: 3 records after the start with "real" (random) vectors in a vec0 chunk (4 slots × 16 float32) — as in omega.db.
python3 - $T/omega.db <<'PY2'
import random, sqlite3, struct, sys, time
d = sqlite3.connect(sys.argv[1]); t = time.strftime('%Y-%m-%dT%H:%M:%S.000000+00:00', time.gmtime(time.time() + 3600))   # позже любого старта стенда (v5: +60 с)
d.executescript('CREATE TABLE memories (id INTEGER PRIMARY KEY, node_id TEXT, content TEXT, created_at TEXT, ttl_seconds INTEGER, project TEXT, metadata TEXT, entity_id TEXT, status TEXT);'
  'CREATE TABLE memories_vec_rowids (rowid INTEGER PRIMARY KEY, id, chunk_id INTEGER, chunk_offset INTEGER);'
  'CREATE TABLE memories_vec_chunks (chunk_id INTEGER PRIMARY KEY, size INTEGER, validity BLOB, rowids BLOB);'
  'CREATE TABLE memories_vec_vector_chunks00 (rowid PRIMARY KEY, vectors BLOB NOT NULL);')
r = random.Random(7); v = []
for i, txt in enumerate(['запись один', 'запись два 🙂', 'third record'], 1):
    d.execute('INSERT INTO memories (id, node_id, content, created_at, entity_id, status) VALUES (?,?,?,?,?,?)', (i, f'mem-{i}', txt, t, 'stend', 'active'))
    d.execute('INSERT INTO memories_vec_rowids VALUES (?,NULL,1,?)', (i, i - 1)); x = [r.gauss(0, 1) for _ in range(16)]; m = sum(a * a for a in x) ** .5; v += [a / m for a in x]
d.execute('INSERT INTO memories_vec_chunks VALUES (1,4,?,?)', (b'\x0f', b'')); d.execute('INSERT INTO memories_vec_vector_chunks00 VALUES (1,?)', (struct.pack('64f', *(v + [0.0] * 16)),)); d.commit()
PY2
cp $T/omega.db $T/omega-ishodnaya.db
[ "$(python3 -c "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); print(d.execute('SELECT count(*) FROM memories m JOIN memories_vec_rowids r ON r.rowid=m.id').fetchone()[0])" $T/omega.db 2>&1)" = 3 ] || { echo "СЛЕПОТА стенда: подставная база OMEGA не собрана (записей с вектором ≠ 3)"; exit 2; }
mkdir -p $T/pam/stend/pamyat $T/model
python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE zapisi (id INTEGER, soderzhim TEXT, sozdano INTEGER, klass TEXT)')" $T/pam/stend/pamyat/pamyat.db
for f in model.onnx model.onnx_data tokenizer.json; do printf x > $T/model/$f; done
date +%s > $T/sc-start
printf '#!/bin/bash\necho "ActiveState=active"; echo "ExecMainStartTimestamp=@$(cat %s/sc-start)"; exit $(cat %s/s-kod)\n' $T $T > $T/systemctl; echo 0 > $T/s-kod
printf '#!/bin/bash\ncat %s/zhurnal; exit $(cat %s/j-kod)\n' $T $T > $T/journalctl
printf '#!/bin/bash\nprintf "%%s\\t%%s\\n" "$(cat %s/kanal)" "$1" >> %s/kanal.log; [ "$(cat %s/kanal)" = ok ]\n' $T $T $T > $T/alert
chmod +x $T/systemctl $T/journalctl $T/alert; echo ok > $T/kanal; : > $T/kanal.log; echo 0 > $T/j-kod
ZH_OK="$(date +%s).000000 sadik omega[1]: WARNING:omega.server:Startup RSS: 81.3 MB, PID: 1, transport: http
$(date +%s).500000 sadik omega[1]: WARNING:omega.server:Memory pressure relief: RSS 5210.9 MB -> 5210.9 MB"
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
bd() { python3 -c "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); print('записей', d.execute('SELECT count(*) FROM memories').fetchone()[0], '· с вектором', d.execute('SELECT count(*) FROM memories_vec_rowids').fetchone()[0])" $T/omega.db 2>&1; }
porcha_E() { echo "   порча Е до: $(bd)"; python3 -c "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute('DELETE FROM memories_vec_rowids WHERE rowid=2'); d.commit()" $T/omega.db; echo "   порча Е после: $(bd)"; }
# Порча Ж — вектор записи 2 := ПОДЛИННЫЙ omega.embedding._hash_embedding её текста (поставка OMEGA, не копия сторожа).
# EN: Corruption Ж — record 2's vector := the GENUINE omega.embedding._hash_embedding of its text (OMEGA install, not the watcher's copy).
porcha_ZH() { /opt/omega/venv/bin/python3 -I - $T/omega.db <<'PY2'
import sqlite3, struct, sys
from omega.embedding import _hash_embedding
d = sqlite3.connect(sys.argv[1]); b = bytearray(d.execute('SELECT vectors FROM memories_vec_vector_chunks00 WHERE rowid=1').fetchone()[0]); do = bytes(b[64:128])
struct.pack_into('16f', b, 64, *_hash_embedding(d.execute('SELECT content FROM memories WHERE id=2').fetchone()[0], 16))
d.execute('UPDATE memories_vec_vector_chunks00 SET vectors=? WHERE rowid=1', (bytes(b),)); d.commit()
print('   порча Ж: вектор записи 2 заменён хэш-вектором OMEGA, байт изменено', sum(x != y for x, y in zip(do, b[64:128])))
PY2
}
vozvrat_bd() { cp $T/omega-ishodnaya.db $T/omega.db; echo "   возврат базы: $(bd), sha $(sha256sum < $T/omega.db | cut -c1-12) = исх $(sha256sum < $T/omega-ishodnaya.db | cut -c1-12)"; }
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
takt m11 0 'не покрыто от старта' 0   # 18.10: служба старше журнала — граница покрытия, не слепота (база мерит) · EN: not blindness
vozvrat_zh; echo 1 > $T/j-kod; echo "   порча Д: код journalctl $(cat $T/j-kod)"
takt m12 0 'журнал не прочитан (код 1)' 0
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
# База (18.10): без вектора / хэш-вектор / база нечитаема — исправное → порча → возврат.
# EN: DB (18.10): no vector / hash vector / unreadable DB — healthy → corruption → return.
porcha_E; takt b1 1 'ВЕКТОР ОТБРОШЕН' 1; takt b2 0 'без годного вектора 1' 1; vozvrat_bd; takt b3 0 'НА МЕСТЕ' 0
# Урок 02.10 (mem-1fa67236276a): строка в соединении — не вектор. Порча И — слот записи 3 обнулён (строка rowids цела);
# порча К — бит действительности слота записи 1 снят. Обе обязаны краснеть.
# EN: A row in the join is not a vector. Corruption И — record 3's slot zeroed (rowids row intact); К — slot 1 validity bit cleared.
pz() { python3 - $T/omega.db "$1" <<'PY2'
import sqlite3, sys
d = sqlite3.connect(sys.argv[1])
if sys.argv[2] == 'nul':
    b = bytearray(d.execute('SELECT vectors FROM memories_vec_vector_chunks00 WHERE rowid=1').fetchone()[0]); do = bytes(b[128:192]); b[128:192] = bytes(64)
    d.execute('UPDATE memories_vec_vector_chunks00 SET vectors=? WHERE rowid=1', (bytes(b),)); print('   порча И: слот записи 3 обнулён, байт изменено', sum(x != y for x, y in zip(do, b[128:192])), '· строк rowids', d.execute('SELECT count(*) FROM memories_vec_rowids').fetchone()[0])
else:
    v = d.execute('SELECT validity FROM memories_vec_chunks WHERE chunk_id=1').fetchone()[0]; d.execute('UPDATE memories_vec_chunks SET validity=? WHERE chunk_id=1', (bytes([v[0] & 0xFE]),))
    print('   порча К: бит действительности слота 0:', v[0] & 1, '→', d.execute('SELECT validity FROM memories_vec_chunks WHERE chunk_id=1').fetchone()[0][0] & 1)
d.commit()
PY2
}
pz nul; takt b1i 1 'без годного вектора 1' 1; vozvrat_bd; takt b1j 0 'НА МЕСТЕ' 0
pz bit; takt b1k 1 'без годного вектора 1' 1; vozvrat_bd; takt b1l 0 'НА МЕСТЕ' 0
porcha_ZH; takt b4 1 'записей с хэш-вектором 1' 1; vozvrat_bd; takt b5 0 'вектор = хэш 0' 0
python3 -c "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute('ALTER TABLE memories_vec_rowids RENAME TO x'); d.commit()" $T/omega.db; echo "   порча З: таблица memories_vec_rowids переименована"
takt b6 0 'модель эмбеддинга OMEGA: no such table: memories_vec_rowids' 0; vozvrat_bd; takt b7 0 'НА МЕСТЕ' 0
# Условие ворот 18.10 (Вениамин): причины по файлам не теряются за слепотой старта/базы. Слепота — только без них.
# EN: Gate condition 18.10: file causes are not lost behind start/DB blindness. Blindness only without them.
net() { VSEGO=$((VSEGO+1)); if grep -qF -- "$2" $T/out-$1.txt; then RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: в выводе $1 есть «$2»"; else echo "   ✅ в выводе $1 нет «$2»"; fi; }
porcha_A; echo 1 > $T/s-kod; echo "   порча С: код подставного systemctl $(cat $T/s-kod)"
takt s1 1 'старт не измерен (код 1) — база и журнал не проверены' 1; net s1 'модель эмбеддинга OMEGA: omega-memory: старт не измерить'
vozvrat_A; takt s2 0 'модель эмбеддинга OMEGA: omega-memory: старт не измерить (код 1)' 1
echo 0 > $T/s-kod; echo "   возврат С: код подставного systemctl $(cat $T/s-kod)"; takt s3 0 'НА МЕСТЕ' 0
porcha_A; python3 -c "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute('ALTER TABLE memories_vec_rowids RENAME TO x'); d.commit()" $T/omega.db; echo "   порча А+З: файла нет, таблица переименована"
takt s4 1 'база не прочитана (no such table: memories_vec_rowids)' 1; net s4 'модель эмбеддинга OMEGA: no such table'
vozvrat_A; vozvrat_bd; takt s5 0 'НА МЕСТЕ' 0
if [ -n "${OSNOVA:-}" ]; then
  echo "--- основа сторожа (OSNOVA) на порче А (свой STATE)"; porcha_A; cp $T/state.json $T/state-k.json; rm -f $T/state.json
  takt osn 0 - 0 "$OSNOVA"; vozvrat_A; mv $T/state-k.json $T/state.json
fi
echo "--- кандидат на БОЕВОМ каталоге модели, боевых systemctl/journalctl и КОПИИ боевой базы OMEGA (только чтение), STATE свой"; rm -f $T/state.json
sudo -n true 2>/dev/null || { echo "СЛЕПОТА такта «бой»: нет sudo — копию боевой базы OMEGA не снять"; echo "ВЕРДИКТ: тактов $VSEGO · расхождений с PLAN $RASH · бой СЛЕП"; exit 2; }
sudo /opt/omega/venv/bin/python3 -I -c "import sqlite3,sys; s=sqlite3.connect('file:/var/lib/omega/.omega/omega.db?mode=ro',uri=True); d=sqlite3.connect(sys.argv[1]); s.backup(d); d.close()" $T/omega-boj.db
sudo chown "$(id -un):" $T/omega-boj.db
env -i DSH_PROBA=1 PATH=/usr/bin:/bin DSH_PAMYAT_STOROZHA_CONF="${STEND_KONF:-$T/net.conf}" OKW_OMEGA_DB=$T/omega-boj.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
  OKW_CORE=$T/net-yadra python3 "$W" > $T/out-boj.txt 2>&1; echo "== бой · код $?"; grep -F 'модель эмбеддинга OMEGA' $T/out-boj.txt | obrez 300 | sed 's/^/   /'
VSEGO=$((VSEGO+1)); if grep -F 'модель эмбеддинга OMEGA (признак 7)' $T/out-boj.txt | grep -qF 'НА МЕСТЕ'; then echo "   ✅ ожидание: «НА МЕСТЕ»"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: на бою не «НА МЕСТЕ»"; fi
echo "ВЕРДИКТ: тактов $VSEGO · расхождений с PLAN $RASH"; [ $RASH -eq 0 ]
