#!/bin/bash
# СТЕНД ПРИЗНАКА 6 omega-kopiya-watch — «локальная правка поставки OMEGA» (B-N-982). Аврора, 26.09.2026; переносимая редакция.
# ЗОВУЩИЙ — ворота правки omega-kopiya-watch (автор + Вениамин). В СУТОЧНЫЙ ОБХОД НЕ СТАВИТЬ: sudo + копия боевой OMEGA (~1–2 мин).
# Доводы: $1 — путь к сторожу. Переменные: STEND_PRAVKA — патч правки поставки (умолч. dorabotki/omega-b-n-982/pravka.diff);
#   STEND_PAMYAT — база pamyat.db любого агента для копии (умолч. — подставная пустая: признаку 6 содержимое не нужно);
#   OSNOVA — сторож без признака 6 для такта «осн» (необязательно; нет — такта нет).
# Боевые база и поставка — только чтение (копии в своём /tmp). Основа _search.py для порчи «стёрта» — обратное наложение STEND_PRAVKA
#   на копию боевых файлов; не снимается — СЛЕПОТА, код 2. Поставка без правки (метки ≠ 1/2) — СЛЕПОТА, код 2: стенд меряет СТОРОЖА
#   на раскладке с правкой, а не саму поставку (её меряет сам признак 6).
# B-N-1080 (Заря): STEND_PRAVKI — перечень правок поставки (умолч. боевой /etc/agent-registry/omega-pravki-postavki.txt); копия поставки берёт
#   ВСЕ файлы перечня; такты tD–tK: снять метку B-N-1069 / B-N-1072 → «стёрта» ровно она; перечень негоден / нет → слепота; «B-N-98» ≠ B-N-982.
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
W=${1:?путь к сторожу}; PRAVKA=${STEND_PRAVKA:-/opt/iskra/workspace/dorabotki/omega-b-n-982/pravka.diff}
PRAVKI_B=${STEND_PRAVKI:-/etc/agent-registry/omega-pravki-postavki.txt}; PR=$PRAVKI_B
# Вердикт — автоматом: каждый такт сверяется с ожиданием PLAN.md (тревог признака 6 новых · слово в выводе · отметок pravka:);
# код выхода 1 при любом расхождении. Свой /tmp и указатель .put убираются при ЛЮБОМ выходе (trap).
T=$(mktemp -d /tmp/stend-pravki-postavki-XXXX); RASH=0; VSEGO=0
trap 'rm -rf -- "$T"' EXIT; echo "T=$T · сторож $(sha256sum < "$W" | cut -c1-16)"
M='ЛОКАЛЬНАЯ ПРАВКА ПОСТАВКИ B-N-982'; LIVE=/opt/omega/venv/lib/python3.12/site-packages
SP=$T/sp; mkdir -p $SP/omega/sqlite_store $SP/omega_memory-1.5.13.dist-info
cp $LIVE/omega/sqlite_store/_search.py $LIVE/omega/sqlite_store/_query.py $SP/omega/sqlite_store/
[ -r "$PRAVKI_B" ] || { echo "СЛЕПОТА: перечня правок нет: $PRAVKI_B"; exit 2; }
for f in $(grep -vE '^[[:space:]]*(#|$)' "$PRAVKI_B" | awk '{print $2}' | sort -u); do mkdir -p "$SP/$(dirname "$f")"; cp "$LIVE/$f" "$SP/$f" || { echo "СЛЕПОТА: нет $LIVE/$f"; exit 2; }; done
[ "$(grep -cF "$M" $SP/omega/sqlite_store/_search.py)/$(grep -cF "$M" $SP/omega/sqlite_store/_query.py)" = 1/2 ] || {
  echo "СЛЕПОТА: боевая поставка без правки B-N-982 (метки ≠ 1/2) — стенду не на чем мерить сторожа"; exit 2; }
cp $SP/omega/sqlite_store/_search.py $T/boj-search.py   # возврат А — из этой копии, не из живого файла
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
obrez() { python3 -c 'import sys; [print(l.rstrip("\n")[:int(sys.argv[1])]) for l in sys.stdin]' "$1"; }   # по ЗНАКАМ: cut -c режет байты посреди буквы
mt() { stat -c %Y $SP/omega/sqlite_store/_search.py $SP/omega/sqlite_store/_query.py | sort -n | tail -1; }
start_posle() { echo $(( $(mt) + 5 )) > $T/sc-start; }
metki() { echo "метки _search $(grep -cF "$M" $SP/omega/sqlite_store/_search.py) _query $(grep -cF "$M" $SP/omega/sqlite_store/_query.py) · sha _search $(sha256sum < $SP/omega/sqlite_store/_search.py | cut -c1-8)"; }
start_posle; N=0
takt() {   # $1 имя такта, $2 ожид. новых тревог, $3 ожид. слово в выводе («-» = строки признака нет), $4 ожид. отметок, $5 сторож
  local ozn=$2 ozs=$3 ozo=$4; local w=${5:-$W} do_=$(grep -c 'ПРАВКА ПОСТАВКИ' $T/kanal.log)
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
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
porcha_B() { mv $SP/omega_memory-1.5.13.dist-info $SP/omega_memory-1.5.14.dist-info; echo "   порча Б: $(ls -d $SP/omega_memory-*)"; }
vozvrat_B() { mv $SP/omega_memory-1.5.14.dist-info $SP/omega_memory-1.5.13.dist-info; echo "   возврат Б: $(ls -d $SP/omega_memory-*)"; }
porcha_V() { echo $(( $(mt) - 100 )) > $T/sc-start; echo "   порча В: старт $(cat $T/sc-start) < mtime $(mt)"; }
vozvrat_V() { start_posle; echo "   возврат В: старт $(cat $T/sc-start) > mtime $(mt)"; }
takt t0 0 ЦЕЛА 0
porcha_A; takt t1 1 'СТЁРТА: _search.py меток 0 из 1' 1; takt t2 0 СТЁРТА 1
vozvrat_A; takt t3 0 ЦЕЛА 0
porcha_A; takt t4 1 СТЁРТА 1; vozvrat_A; takt t5 0 ЦЕЛА 0
porcha_B; takt t6 1 'СВЕРИТЬ ПРАВКУ: omega-memory 1.5.14' 1; vozvrat_B; takt t7 0 ЦЕЛА 0
porcha_V; takt t8 1 'НА ДИСКЕ, НЕ В ПАМЯТИ' 1; vozvrat_V; takt t9 0 ЦЕЛА 0
porcha_A; porcha_B; porcha_V; echo fail > $T/kanal; takt t10 1 'тревога о правке поставки НЕ ушла' 0
# B-N-1080: у «СТЁРТА» теперь порядок восстановления — t11 судит стык двух причин («…перезапуск omega-memory); СВЕРИТЬ ПРАВКУ»)
echo ok > $T/kanal; takt t11 1 'перезапуск omega-memory); СВЕРИТЬ ПРАВКУ' 1; takt t12 0 СТЁРТА 1
vozvrat_A; vozvrat_B; takt t13 0 ЦЕЛА 0
echo inactive > $T/sc-state; echo "   порча Г: ActiveState=$(cat $T/sc-state)"; takt t14 0 'СЛЕПОТА: правка поставки OMEGA' 0
echo active > $T/sc-state; takt t15 0 ЦЕЛА 0
# ── B-N-1080: метки каждой правки отдельно; перечень — данные
snyat() {   # $1 файл от SP, $2 пункт: первую строку с меткой ЭТОЙ правки обезметить; печать числа до/после
  python3 - "$SP/$1" "ЛОКАЛЬНАЯ ПРАВКА ПОСТАВКИ $2" <<'PYS'
import sys, re; p, m = sys.argv[1:]; s = open(p, encoding='utf-8').read().split('\n'); rx = re.compile(re.escape(m) + r'(?!\d)')
do = sum(bool(rx.search(l)) for l in s); i = next(i for i, l in enumerate(s) if rx.search(l)); s[i] = rx.sub('СНЯТО-СТЕНДОМ', s[i], count=1)
open(p, 'w', encoding='utf-8').write('\n'.join(s)); print(f'   порча: {p.split("/sp/")[-1]} меток «{m}» {do} → {sum(bool(rx.search(l)) for l in s)}')
PYS
  start_posle; }
tolko() {   # $1 — есть в последней тревоге, $2 — нет в ней
  local t=$(grep 'ПРАВКА ПОСТАВКИ' $T/kanal.log | tail -1); VSEGO=$((VSEGO+1))
  if printf '%s' "$t" | grep -qF -- "$1" && ! printf '%s' "$t" | grep -qF -- "$2"; then echo "   ✅ тревога называет «$1», не называет «$2»"
  else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ: в тревоге ждала «$1» без «$2»: $(printf '%s' "$t" | obrez 300)"; fi; }
cp $SP/omega/bridge.py $T/boj-bridge.py; cp $SP/omega/server/handlers.py $T/boj-handlers.py
snyat omega/bridge.py B-N-1069; takt tD 1 'СТЁРТА: bridge.py меток 1 из 2 (правка B-N-1069' 1; tolko '(правка B-N-1069' '(правка B-N-1072'
cp $T/boj-bridge.py $SP/omega/bridge.py; start_posle; takt tD2 0 ЦЕЛА 0
snyat omega/server/handlers.py B-N-1072; takt tE 1 'СТЁРТА: handlers.py меток 2 из 3 (правка B-N-1072' 1; tolko '(правка B-N-1072' '(правка B-N-1069'
cp $T/boj-handlers.py $SP/omega/server/handlers.py; start_posle; takt tE2 0 ЦЕЛА 0
PR=$T/pravki-negodnye; sed '0,/^B-N-1069 /s/^\(B-N-1069 [^ ]*\) *2 /\1 два /' "$PRAVKI_B" > $PR; echo "   порча перечня Ж: строк «два» $(grep -c ' два ' $PR)"
takt tZh 0 'негодна' 0
PR=$T/pravok-net; echo "   порча перечня З: $PR есть? $([ -e $PR ] && echo да || echo нет)"; takt tZ 0 'СЛЕПОТА: правка поставки OMEGA' 0
PR=$T/pravki-98; sed 's/^B-N-982 \( *omega\/sqlite_store\/_search.py\)/B-N-98 \1/' "$PRAVKI_B" > $PR; echo "   порча перечня И: строк «B-N-98 » $(grep -c '^B-N-98 ' $PR)"
takt tI 1 'СТЁРТА: _search.py меток 0 из 1 (правка B-N-98 ' 1
PR=$PRAVKI_B; takt tK 0 ЦЕЛА 0
if [ -n "${OSNOVA:-}" ]; then
  echo "--- основа сторожа (OSNOVA) на порче А (свой STATE)"; porcha_A; cp $T/state.json $T/state-k.json; rm -f $T/state.json
  takt osn 0 - 0 "$OSNOVA"; vozvrat_A; mv $T/state-k.json $T/state.json
fi
echo "--- кандидат на БОЕВОЙ поставке и БОЕВОМ systemctl (только чтение), STATE свой"; rm -f $T/state.json
env -i DSH_PROBA=1 PATH=/usr/bin:/bin OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
  OKW_CORE=$T/net-yadra OKW_PRAVKI="$PRAVKI_B" PYTHONDONTWRITEBYTECODE=1 python3 "$W" > $T/out-boj.txt 2>&1; echo "== бой · код $?"; grep -F 'правка поставки OMEGA' $T/out-boj.txt | sed 's/^/   /'
VSEGO=$((VSEGO+1)); if grep -F 'правка поставки OMEGA' $T/out-boj.txt | grep -qF 'ЦЕЛА'; then echo "   ✅ ожидание: «ЦЕЛА»"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: на бою не «ЦЕЛА»"; fi
echo "ВЕРДИКТ: тактов $VSEGO · расхождений с PLAN $RASH"; [ $RASH -eq 0 ]
