#!/bin/bash
# B-N-1090 · стенд имени письма v2. $1 = проверяемый a2a-v2.py, $2 = каталог пакета telegram-multiagent (читатель).
# Без аргументов (ночной обход, B-N-1092) — бой: /usr/local/libexec/a2a-v2.py и /opt/agent-plugins/dsh-telegram-multiagent.
# Всё в mktemp: спул <W>/beta, ledger <W>/led*, маршруты <W>/routes.json. Живые спулы и ledger не трогаются.
# Код: 0 — отправитель разобран и дубль пойман получателем; 1 — расхождение; 2 — слепота (прогон не состоялся).
set -u
A2A=$(readlink -f "${1:-/usr/local/libexec/a2a-v2.py}"); PKG=$(readlink -f "${2:-/opt/agent-plugins/dsh-telegram-multiagent}")
[ -r "$A2A" ] && [ -r "$PKG/src/index.js" ] && [ -r "$PKG/test/extract.mjs" ] || { echo "СЛЕПОТА: нет предмета $A2A или читателя $PKG (src/index.js, test/extract.mjs)"; exit 2; }
 HERE=$(dirname "$(readlink -f "$0")")
W=$(mktemp -d /var/tmp/b1090.XXXXXX); mkdir -m 0733 "$W/beta"; P=""
ubrat(){ [ -n "$P" ] && kill "$P" 2>/dev/null; wait 2>/dev/null; rm -rf -- "$W"; }
trap ubrat EXIT
YA=$(id -un); rc=0
# B-N-1118: все put/main идут через копию с отказом ДО записи вне W (включая симлинки).
[ "$(grep -cFx 'def put(route, metadata, body):' "$A2A")" = 1 ] || { echo "СЛЕПОТА: не найден единственный put в $A2A"; exit 2; }
sed '/^def put(route, metadata, body):$/a\    if not Path(route["spool"]).resolve().is_relative_to(Path(__file__).resolve().parent): raise ValueError("ОТКАЗ: ящик вне W: " + str(route["spool"]))' "$A2A" > "$W/a2a-v2.py" || exit 2
A2A_ISTOCHNIK="$A2A"
A2A="$W/a2a-v2.py"
echo "== a2a-v2 источник $A2A_ISTOCHNIK md5[:8] $(md5sum < "$A2A_ISTOCHNIK" | cut -c1-8) · копия $A2A md5[:8] $(md5sum < "$A2A" | cut -c1-8) · читатель $PKG ($(command grep -m1 '"version"' "$PKG/package.json" | tr -d ' ,')) · $(date -u +%H:%M:%SZ)"
put(){ python3 - "$A2A" "$W/beta" "$1" "$2" <<'PY'
import importlib.util,sys
s=importlib.util.spec_from_file_location('a2a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
meta={'kind':'decision','delivery_id':sys.argv[3],'decision_id':sys.argv[3],'recipient':{'id':'beta','ledger_uuid':'x'},
      'supersedes':{'recipient':'beta','ledger_uuid':'x','decision_id':'net'}}
print(m.put({'spool':sys.argv[2]},meta,sys.argv[4]).name)
PY
}
# S1 — имя и возраст: файл кладётся, mtime уводится на 48 ч назад; читатель по имени должен дать возраст ~0, по mtime ~48.
f=$(put s1 'тело s1') || { echo "СЛЕПОТА: put() не отработал"; exit 2; }
touch -d '48 hours ago' "$W/beta/$f"
out=$(node "$HERE/priyomnik-imeni-v2.mjs" "$PKG" "$W/beta" "$W/led1" 1500 2>&1 | command grep '^ФАЙЛ')
echo "S1 $out"
[ -z "$out" ] && { echo "СЛЕПОТА: приёмник не увидел файл"; exit 2; }
case "$out" in *"ОТПРАВИТЕЛЬ $YA · ВОЗРАСТ_Ч 0."*) echo "S1 ok: отправитель $YA, возраст по метке имени";;
  *) echo "S1 РАСХОЖДЕНИЕ: отправитель/возраст не из имени"; rc=1;; esac
# S6 (B-N-2021) — дефис проходит настоящий put → приёмник → sender в ledger без обрезки.
# Учётка ПОДСТАВНАЯ — pwd.getpwuid подменён в этом вызове, боевой pwd не трогается.
s6=$(python3 - "$A2A" "$W/beta" <<'PY'
import importlib.util,os,sys
s=importlib.util.spec_from_file_location('a2a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class U: pw_name='proba-defis'
m.pwd.getpwuid=lambda uid:U()
meta={'kind':'decision','delivery_id':'s6','decision_id':'s6','recipient':{'id':'beta'}}
try: print('ПРИНЯТО', m.put({'spool':sys.argv[2]},meta,'тело s6').name)
except ValueError as e: print('ОТКАЗ', e)
print('ФАЙЛОВ', len([f for f in os.listdir(sys.argv[2]) if not f.startswith('.')]))
PY
)
echo "S6 $(echo "$s6" | tr '\n' ' ')"
case "$s6" in *"ПРИНЯТО"*"-proba-defis-v2-"*"ФАЙЛОВ 1"*)
  s6_pr=$(node "$HERE/priyomnik-imeni-v2.mjs" "$PKG" "$W/beta" "$W/led6" 500 2>&1)
  echo "S6 $s6_pr"
  case "$s6_pr" in *"ОТПРАВИТЕЛЬ proba-defis ·"*"sender в ledger proba-defis ·"*) echo "S6 ok: полная учётка с дефисом дошла до ledger";;
    *) echo "S6 РАСХОЖДЕНИЕ: отправитель с дефисом потерялся у читателя"; rc=1;; esac ;;
  *) echo "S6 РАСХОЖДЕНИЕ: учётка с дефисом не опубликована"; rc=1;; esac
# S7 — недопустимый символ имени, отказ ДО записи (а не запрет законного дефиса).
s7=$(python3 - "$A2A" "$W/beta" <<'PY_S7'
import importlib.util,os,sys
s=importlib.util.spec_from_file_location('a2a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class U: pw_name='bad.name'
m.pwd.getpwuid=lambda uid:U()
meta={'kind':'decision','delivery_id':'s7','decision_id':'s7','recipient':{'id':'beta'}}
try: print('ПРИНЯТО', m.put({'spool':sys.argv[2]},meta,'тело s7').name)
except ValueError as e: print('ОТКАЗ', e)
print('ФАЙЛОВ', len([f for f in os.listdir(sys.argv[2]) if not f.startswith('.')]))
PY_S7
)
echo "S7 $(echo "$s7" | tr '\n' ' ')"
case "$s7" in *"ОТКАЗ"*"ФАЙЛОВ 0"*) echo "S7 ok: недопустимое имя отвергнуто до записи";;
  *) echo "S7 РАСХОЖДЕНИЕ: недопустимое имя не отвергнуто до записи"; rc=1;; esac
rm -f -- "$W"/beta/*-proba-defis-v2-*.txt
# S4 — полный путь main(): probe, затем decision, через подставные маршруты; приёмник — фоном, гасится по pid.
node "$HERE/priyomnik-imeni-v2.mjs" "$PKG" "$W/beta" "$W/led2" 60000 > "$W/pri.log" 2>&1 & P=$!
for i in $(seq 50); do command grep -q '^ГОТОВ' "$W/pri.log" && break; sleep 0.1; done
printf '{"beta":{"machine":"sadik","spool":"%s","ledger":"%s"}}' "$W/beta" "$W/led2/receipts.sqlite" > "$W/routes.json"
pr=$(A2A_V2_ROUTES="$W/routes.json" python3 "$A2A" probe beta 2>&1); prc=$?
echo "S4 probe rc=$prc: $(echo "$pr" | cut -c1-140)"
uuid=$(echo "$pr" | python3 -c 'import json,sys;print(json.load(sys.stdin)["ledger_uuid"])' 2>/dev/null)
[ "$prc" = 0 ] && [ -n "$uuid" ] || { echo "S4 РАСХОЖДЕНИЕ: проба-капабилити не прошла"; rc=1; }
printf '{"kind":"decision","delivery_id":"s4","decision_id":"s4","recipient":{"id":"beta","ledger_uuid":"%s"},"supersedes":{"recipient":"beta","ledger_uuid":"%s","decision_id":"net-takogo"}}' "$uuid" "$uuid" > "$W/meta.json"
dr=$(echo 'тело s4' | A2A_V2_ROUTES="$W/routes.json" python3 "$A2A" decision beta "$W/meta.json" 2>&1); drc=$?
echo "S4 decision rc=$drc: $(echo "$dr" | cut -c1-140)"
[ "$drc" = 0 ] || { echo "S4 РАСХОЖДЕНИЕ: решение не отправлено"; rc=1; }
# S5 — повтор delivery_id s5: те же байты в разные секунды → у получателя ОДИН receipt; другие байты → отказ получателя.
put s5 'тело s5' >/dev/null; sleep 1.1; put s5 'тело s5' >/dev/null; sleep 1.1; put s5 'ДРУГОЕ тело s5' >/dev/null
sleep 1
kill "$P" 2>/dev/null; wait "$P" 2>/dev/null; P=""
command grep '^ФАЙЛ' "$W/pri.log" | sed 's/^/   /'
n_probe=$(command grep -c "^ФАЙЛ .*ОТПРАВИТЕЛЬ $YA .*ПРИЁМ terminal/" "$W/pri.log")
n_dec=$(command grep -c "^ФАЙЛ .*ОТПРАВИТЕЛЬ $YA .*sender в ledger $YA · ПРИЁМ held/awaiting_cancellation" "$W/pri.log")
s5_uniq=$(command grep -o 'RECEIPT [0-9a-f-]*' "$W/pri.log" | sort | uniq -c | awk '$1>1' | wc -l)
s5_otkaz=$(command grep -c 'ОТКАЗ ПРИЁМА: .*identity conflict' "$W/pri.log")
echo "S4 проба разобрана с отправителем: $n_probe · решение с отправителем в ledger: $n_dec"
echo "S5 receipt, встреченный дважды: $s5_uniq · отказов «identity conflict» (logical — разные имена; источник — одно имя): $s5_otkaz"
[ "$n_probe" -ge 1 ] && [ "$n_dec" = 1 ] || { echo "S4 РАСХОЖДЕНИЕ: отправитель у получателя не разобран"; rc=1; }
[ "$s5_uniq" = 1 ] && [ "$s5_otkaz" = 1 ] || { echo "S5 РАСХОЖДЕНИЕ: дубль не пойман получателем"; rc=1; }
echo "ИТОГ rc=$rc"; exit $rc
