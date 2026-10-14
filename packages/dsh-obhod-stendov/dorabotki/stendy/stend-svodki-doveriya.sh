#!/bin/bash
# СТЕНД НЕДЕЛЬНОЙ СВОДКИ ДОВЕРИЯ omega-kopiya-watch (признак 5б; B-N-983, B-N-990). Аврора, 26.09.2026; переносимая редакция.
# ЗОВУЩИЙ — ворота правки omega-kopiya-watch (автор + Вениамин). В СУТОЧНЫЙ ОБХОД НЕ СТАВИТЬ: sudo + копия боевой OMEGA (~1–2 мин).
# Всё в своём /tmp (trap убирает при любом выходе); боевая OMEGA — копия (чтение); признак 6 читает боевую поставку и systemctl (чтение).
# Счётчик ядра — подставной node (строки счёта из файла); «прошли сутки» — сдвиг ВСЕХ дат в своём STATE. Вердикт автоматом: rc 1 при расхождении.
# Доводы: $1 сторож; $2 (необяз.) сторож-основа для такта «осн». STEND_PAMYAT — база pamyat.db любого агента для копии
#   (умолч. — подставная пустая: счёт подаёт подставной node, содержимое базы сводке не нужно).
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
W=${1:?путь к сторожу}; OSN=${2:-}
T=$(mktemp -d /tmp/stend-svodki-doveriya-XXXX); RASH=0; VSEGO=0
trap 'rm -rf -- "$T"' EXIT
echo "T=$T · сторож $(sha256sum < "$W" | cut -c1-16)"
sudo /opt/omega/venv/bin/python3 -c "
import sqlite3,sys; s=sqlite3.connect('file:/var/lib/omega/.omega/omega.db?mode=ro',uri=True); d=sqlite3.connect(sys.argv[1]); s.backup(d); d.close()" $T/omega.db
sudo chown "$(id -un):" $T/omega.db; mkdir -p $T/pam/stend/pamyat $T/core/src; : > $T/core/src/schet-doveriya.mjs
if [ -n "${STEND_PAMYAT:-}" ]; then sudo python3 -c "
import sqlite3,sys; s=sqlite3.connect(f'file:{sys.argv[1]}?mode=ro',uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close()" "$STEND_PAMYAT" $T/pam/stend/pamyat/pamyat.db
  sudo chown "$(id -un):" $T/pam/stend/pamyat/pamyat.db
else python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('CREATE TABLE zapisi (id INTEGER, soderzhim TEXT, sozdano INTEGER, klass TEXT)')" $T/pam/stend/pamyat/pamyat.db; fi
printf '#!/bin/bash\ncat %s/schet.txt; exit $(cat %s/node-kod)\n' $T $T > $T/node
printf '#!/bin/bash\nprintf "%%s\\t%%s\\n" "$(cat %s/kanal)" "$1" >> %s/kanal.log; [ "$(cat %s/kanal)" = ok ]\n' $T $T $T > $T/alert
chmod +x $T/node $T/alert; echo ok > $T/kanal; echo 0 > $T/node-kod; : > $T/kanal.log
s() { printf 'доверие %s: знаний %s · otmenena %s · oprovergnuta 0 · otmetka-negodna 0 · utochnena %s · podtverzhdena 0 · bez-podtverzhdeniya %s · obychnaya 0 · otmenena_id [%s]\n' "$@"; }
schet_A() { { s avrora 201 0 17 11 ''; s alfa 0 0 0 0 ''; s dsh 322 0 0 21 ''; s iskra 3460 0 31 237 ''; s zarya 284 1 13 15 65; } > $T/schet.txt; }
schet_B() { { s avrora 210 0 19 11 ''; s alfa 0 0 0 0 ''; s dsh 322 0 0 21 ''; s iskra 3460 0 31 237 ''; s nova 5 0 0 1 ''; s zarya 284 2 13 15 65,70; } > $T/schet.txt; }
DEN=$(date -u +%F)
stp() { python3 - "$T/state.json" "$@" <<'PY'
import json, sys, time
p, op = sys.argv[1], sys.argv[2]; d = json.load(open(p))
if op == 'sdvig':
    n = int(sys.argv[3]); t = time.strftime('%Y-%m-%d', time.gmtime(time.time() - n * 86400))
    d['doverie_svodka']['den'] = d['doverie_svodka']['schet_den'] = t
    print(f"   сдвиг: дата сводки и её счёта → {t} ({n} сут назад)")
elif op == 'neizm':
    n = int(sys.argv[3]); d['doverie_neizm_den'] = time.strftime('%Y-%m-%d', time.gmtime(time.time() - n * 86400))
    print(f"   «НЕ ИЗМЕРЕНО» сказано → {d['doverie_neizm_den']} ({n} сут назад)")
elif op == 'posl':
    n = int(sys.argv[3]); d['doverie_poslednij']['den'] = time.strftime('%Y-%m-%d', time.gmtime(time.time() - n * 86400))
    print(f"   последний удачный счёт → {d['doverie_poslednij']['den']} ({n} сут назад)")
elif op == 'pereschet':
    d['doverie_den'] = '2000-01-01'; print('   пересчёт: doverie_den → 2000-01-01')
elif op == 'den':
    print((d.get('doverie_svodka') or {}).get('den')); sys.exit()
json.dump(d, open(p, 'w'))
PY
}
takt() {   # $1 имя, $2 ожид. новых писем сводки, $3 слово (в выводе или новых письмах; «-» — не проверять), $4 сторож (необяз.)
  local w=${4:-$W} do_=$(wc -l < $T/kanal.log)
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin OKW_OMEGA_DB=$T/omega.db OKW_PAMYAT="$T/pam/*/pamyat/pamyat.db" OKW_STATE=$T/state.json OKW_ALERT=$T/alert \
    OKW_CORE=$T/core OKW_NODE=$T/node python3 "$w" > $T/out-$1.txt 2>&1; local kod=$?
  tail -n +$((do_+1)) $T/kanal.log > $T/nov-$1.txt
  local n=$(grep -c 'недельная сводка' $T/nov-$1.txt); local ok=1
  [ "$n" = "$2" ] || ok=
  [ "$3" = - ] || cat $T/out-$1.txt $T/nov-$1.txt | grep -qF -- "$3" || ok=
  VSEGO=$((VSEGO+1)); echo "== $1 · код $kod · писем сводки новых $n · дата сводки в STATE $(stp den)"
  python3 -c 'import sys; [print("   канал:", l.rstrip()[:300]) for l in open(sys.argv[1], encoding="utf-8")]' $T/nov-$1.txt
  grep -F -e 'РУБЕЖ недельной' -e 'рубеж недельной' -e 'сводка доверия НЕ ушла' $T/out-$1.txt | sed 's/^/   /'
  if [ -n "$ok" ]; then echo "   ✅ ожидание: писем $2 · «$3»"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: ждала писем $2 · «$3»"; fi
}
dop() { VSEGO=$((VSEGO+1)); if eval "$2"; then echo "   ✅ $1"; else RASH=$((RASH+1)); echo "   ❌ РАСХОЖДЕНИЕ с PLAN: $1"; fi; }
schet_A; takt s0 0 'РУБЕЖ недельной сводки'
dop 'с0: тревог в канале 0 (рубеж отменённых zarya:65 без тревоги)' '[ ! -s $T/nov-s0.txt ]'
takt s1 0 -
stp sdvig 6; takt s2 0 -
stp sdvig 7; stp pereschet; schet_B; takt s3 1 'avrora: знаний 210 (+9)'
dop 'с3: nova помечен «(в прошлой сводке не было)»' 'grep -qF "(в прошлой сводке не было)" $T/nov-s3.txt'
dop 'с3: alfa (знаний 0) в сводке НЕТ' '! grep "недельная сводка" $T/nov-s3.txt | grep -qF "alfa:"'
dop 'с3: признак 5 цел — 1 тревога «НОВЫЕ ОТМЕНЁННЫЕ … zarya:70»' '[ "$(grep -F "НОВЫЕ ОТМЕНЁННЫЕ" $T/nov-s3.txt | grep -cF "zarya:70")" = 1 ]'
dop 's3: своевременная сводка — «ОПОЗДАЛА» 0 раз (условие Вениамина к B-N-990)' '[ "$(grep -c ОПОЗДАЛА $T/nov-s3.txt)" = 0 ]'
takt s4 0 -
stp sdvig 7; echo fail > $T/kanal; takt s5 1 'недельная сводка доверия НЕ ушла'
dop 'с5: дата сводки в STATE ≠ сегодня' '[ "$(stp den)" != "$DEN" ]'
dop 's5: своевременная сводка — «ОПОЗДАЛА» 0 раз (условие Вениамина к B-N-990)' '[ "$(grep -c ОПОЗДАЛА $T/nov-s5.txt)" = 0 ]'
echo ok > $T/kanal; takt s6 1 'недельная сводка'
dop 'с6: дата сводки в STATE = сегодня' '[ "$(stp den)" = "$DEN" ]'
dop 's6: своевременная сводка — «ОПОЗДАЛА» 0 раз (условие Вениамина к B-N-990)' '[ "$(grep -c ОПОЗДАЛА $T/nov-s6.txt)" = 0 ]'
stp sdvig 7; stp pereschet; stp posl 2; echo 1 > $T/node-kod; takt s7 1 "НЕ ИЗМЕРЕНО — счёта за $DEN нет"
dop 'с7 (B-N-990): «НЕ ИЗМЕРЕНО» день сводки НЕ двигает (дата ≠ сегодня)' '[ "$(stp den)" != "$DEN" ]'
dop 'с7: письмо говорит «сводка ОТЛОЖЕНА»' 'grep -qF "сводка ОТЛОЖЕНА до первого удачного счёта" $T/nov-s7.txt'
takt s7b 0 'недельная сводка ОТЛОЖЕНА'
dop 'с7б: «НЕ ИЗМЕРЕНО» не чаще раза в сутки — второе письмо не ушло' '[ ! -s $T/nov-s7b.txt ]'
echo 0 > $T/node-kod
echo "   «следующие сутки»: все даты в STATE — на сутки назад"; stp sdvig 8; stp neizm 1; stp pereschet
takt s8 1 'ОПОЗДАЛА на 1 сут.'
dop 'с8: сдвиг — от прошлой сводки (дата её счёта 8 сут назад), дата сводки = сегодня' "grep -qF \"сдвиг с $(date -u -d '8 days ago' +%F)\" \$T/nov-s8.txt && [ \"\$(stp den)\" = \"\$DEN\" ]"
takt s9 0 -
dop 's9: своевременная сводка — «ОПОЗДАЛА» 0 раз (условие Вениамина к B-N-990)' '[ "$(grep -c ОПОЗДАЛА $T/nov-s9.txt)" = 0 ]'
if [ -n "$OSN" ]; then
  echo "--- основа на состоянии с3 (свой STATE)"; mv $T/state.json $T/state-k.json; schet_A
  takt osn-0 0 - "$OSN"; python3 -c "import json,sys,time; p=sys.argv[1]; d=json.load(open(p)); d['doverie_den']='2000-01-01'; json.dump(d,open(p,'w'))" $T/state.json
  schet_B; takt osn 0 - "$OSN"
fi
echo "ВЕРДИКТ: проверок $VSEGO · расхождений с PLAN $RASH"; [ $RASH -eq 0 ]
