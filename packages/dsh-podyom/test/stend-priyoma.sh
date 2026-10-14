#!/bin/bash
# СТЕНД ПРИЁМА ВХОДЯЩЕГО в podyom-uzla (B-N-1815, Искра, 08.10.2026). Подставная receipts.sqlite (PRIYOM_BAZA) с тремя полями
# признака; podyom-uzla зовётся в СУХОМ режиме по iskra.service — бой не трогается, подъёма нет. Прочие ворота (ход, компакт,
# состав) идут по живой службе и могут отказывать — стенд судит ТОЛЬКО строки своего признака и счёт причин относительно П1.
# ЧЕГО НЕ ЛОВИТ: настоящий канал (квитанции пишет telegram-multiagent; поля сверены по src/message-receipts.js:231–235);
# бой без sudo -n (стенду нужен sudo -n python3/test).
# Счёт причин сравнивается с основой, снятой ПРЯМО ПЕРЕД пробой (прогон 01:48Z дал 4/5 при общей основе П1 — причина не
# установлена; подозрение — живая служба сменила состояние между пробами).
# В каждой базе есть удержание channel_interrupted (условие Вениамина) — П1/П5 зелены, только если оно не считается приёмом.
# Пробы: П1 нет незаконченных → «незаконченных 0» · П2 приём идёт и не кончается → ОТКАЗ с id, причин +1 · П3 приём кончается
# во время ожидания → «дождалась», причин как в П1 · П4 базы нет → СЛЕПОТА · П6 удержание mail_stop_intake → ждёт, ОТКАЗ · П5 после порч снова П1.
set -u
SKRIPT=${1:-$(dirname "$(readlink -f "$0")")/../bin/podyom-uzla}
B=$(mktemp -d "${TMPDIR:-/tmp}/stend-priyoma.XXXXXX") || exit 2; trap 'rm -rf "$B"' EXIT
baza() { rm -f "$B/r.sqlite"*; python3 - "$B/r.sqlite" "$@" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1]); c.execute('CREATE TABLE receipts(id TEXT PRIMARY KEY, channel_started INTEGER, message_json TEXT, finished_at INTEGER, blocked TEXT)')
c.execute("INSERT INTO receipts VALUES('gotovaya',1,'{}',1,NULL)"); c.execute("INSERT INTO receipts VALUES('ne-nachata',0,NULL,NULL,NULL)")
c.execute("INSERT INTO receipts VALUES('uderzhana',1,NULL,NULL,'channel_interrupted')")   # условие Вениамина: удержание — не приём
for i in sys.argv[2:]: c.execute("INSERT INTO receipts VALUES(?,1,NULL,NULL,NULL)", (i,))
c.commit()
PY
}
progon() { PRIYOM_BAZA="${BAZA:-$B/r.sqlite}" PRIYOM_PREDEL=4 PRIYOM_SHAG=1 timeout 300 bash "$SKRIPT" iskra.service --suhoj > "$B/o.txt" 2>&1
  PRICHIN=$(sed -n 's/.*ОТКАЗ, причин \([0-9]*\).*/\1/p' "$B/o.txt" | tail -1); PRICHIN=${PRICHIN:-0}
  # A-N-1948 №10 (№24): предмет отказал РАНЬШЕ раздела приёма (вне области, нет реестра…) — пробы не судимы: это слепота, не красное.
  grep -qE 'при(ём|ёму) входящего' "$B/o.txt" || { NE_DOSHLO=$((NE_DOSHLO+1)); NE_DOSHLO_PRICHINA=$(grep -m1 -E 'ОТКАЗ|СЛЕПОТА' "$B/o.txt" | cut -c1-160); }; }
VSEGO=0; PROVAL=0; NE_DOSHLO=0; NE_DOSHLO_PRICHINA=""
sud() { VSEGO=$((VSEGO+1)); if [ "$2" = 0 ]; then echo "  ✅ $1"; else PROVAL=$((PROVAL+1)); echo "  🔴 $1 — $3"; fi; }
echo "== стенд приёма входящего: предмет $SKRIPT ($(sha256sum "$SKRIPT" | cut -c1-16))"
baza; progon; P1=$PRICHIN
grep -qF 'приём входящего: незаконченных 0' "$B/o.txt"; sud "П1 нет незаконченных → «незаконченных 0» (причин $P1)" $? "$(grep -m1 'приём' "$B/o.txt")"
baza; progon; P1=$PRICHIN   # основа ПЕРЕД пробой: живая служба (ход, компакт) меняется между пробами
baza id-prinimaetsya; progon
grep -qF 'квитанция id-prinimaetsya' "$B/o.txt" && grep -qF 'ОТКАЗ: приём входящего не закончен' "$B/o.txt" && [ "$PRICHIN" -eq $((P1+1)) ]
sud "П2 приём идёт, не кончается за предел → ОТКАЗ с id, причин $P1→$PRICHIN" $? "$(grep -m2 'приём' "$B/o.txt" | tr '\n' ' ')"
# Приём «кончается» ровно тогда, когда предмет напечатал «жду» (а не через N с от старта: до признака предмет идёт секунды).
baza; progon; P1=$PRICHIN
rm -f "$B/o.txt"; baza id-skoro; ( for _ in $(seq 300); do grep -qF 'приём входящего идёт' "$B/o.txt" 2>/dev/null && break; sleep 0.2; done; python3 -c "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"UPDATE receipts SET message_json='{}' WHERE id='id-skoro'\");c.commit()" "$B/r.sqlite" ) & FON=$!
progon; wait "$FON"
grep -qF 'жду' "$B/o.txt" && grep -qF 'дождалась окончания' "$B/o.txt" && [ "$PRICHIN" -eq "$P1" ]
sud "П3 приём кончается во время ожидания → «дождалась», причин как в П1 ($PRICHIN)" $? "$(grep 'приём' "$B/o.txt" | tail -2 | tr '\n' ' ')"
baza; progon; P1=$PRICHIN
BAZA="$B/net-takoj.sqlite" progon
grep -qF 'СЛЕПОТА по приёму входящего' "$B/o.txt" && [ "$PRICHIN" -eq $((P1+1)) ]
sud "П4 базы нет → СЛЕПОТА, причин +1" $? "$(grep -m1 'приём' "$B/o.txt")"
# П6 (условие Вениамина 02:59Z): удержание mail_stop_intake на незаконченном приёме — НЕ закрытый приём (в отличие от
# channel_interrupted): подъём ждёт и отказывает с id. Ловит порчу «исключить любые удержания» (blocked IS NULL).
baza; progon; P1=$PRICHIN
baza; python3 -c "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"INSERT INTO receipts VALUES('id-mail-stop',1,NULL,NULL,'mail_stop_intake')\");c.commit()" "$B/r.sqlite"; progon
grep -qF 'квитанция id-mail-stop' "$B/o.txt" && grep -qF 'ОТКАЗ: приём входящего не закончен' "$B/o.txt" && [ "$PRICHIN" -eq $((P1+1)) ]
sud "П6 mail_stop_intake на незаконченном приёме → ждёт и ОТКАЗ с id, причин $P1→$PRICHIN" $? "$(grep -m2 'приём' "$B/o.txt" | tr '\n' ' ')"
baza; progon
grep -qF 'приём входящего: незаконченных 0' "$B/o.txt" && [ "$PRICHIN" -eq "$P1" ]
sud "П5 снова без незаконченных → как П1" $? "$(grep -m1 'приём' "$B/o.txt")"
if [ "$NE_DOSHLO" -gt 0 ]; then
  echo "СЛЕПОТА: предмет $NE_DOSHLO раз не дошёл до раздела приёма входящего — пробы не судимы (${NE_DOSHLO_PRICHINA:-причина не напечатана})"
  exit 2
fi
echo "итог: $((VSEGO-PROVAL)) из $VSEGO"; [ "$PROVAL" -eq 0 ]
