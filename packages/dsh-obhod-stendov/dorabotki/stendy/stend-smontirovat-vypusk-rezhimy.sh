#!/bin/bash
# СТЕНД B-N-1612 (05.10.2026, Искра; находка Вениамина 03:55Z): smontirovat-vypusk кладёт в бой права ТАРБОЛА (644/755),
# а не дерева метки (git archive по умолчанию 664/775), и сверка после монтажа краснеет на чужих правах.
# Предмет — настоящий выпуск дерева: telegram-multiagent-v2.5.81 (215 файлов, тарбол 207×644 + 8×755).
# 🔴 umask 002 у прогона НАМЕРЕННО: под iskra tar -x сам режет права umask'ом 022 и прячет дефект (старый инструмент тоже дал бы 644);
#   root права сохраняет — umask 002 воспроизводит это без root. Без него проба бессильна ПО ПОСТРОЕНИЮ.
# Всё во временном каталоге (бой и страховки — SMV_MONTAZH); бой не трогается. R2 запускается от root для синтетического UID/GID.
# Предмет: единственный довод (путь монтажника), иначе SMV_TOOL/боевой путь. Порча chmod666 вносится ПОСЛЕ публикации в копию, до RR.
# ГДЕ СЛЕП: права каталогов, ACL/capabilities, монтаж мимо инструмента. Владельца проверяет новая проба4.
set -u
# Явный довод нужен обходчику: .../stand.sh /usr/local/sbin/smontirovat-vypusk.
[ "$#" -le 1 ] || { echo "СЛЕПОТА: нужен не более одного довода — путь монтажника"; exit 2; }
if [ "$#" = 1 ]; then
  [[ "$1" != -* ]] || { echo "СЛЕПОТА: неизвестный ключ $1"; exit 2; }
  [ -z "${SMV_TOOL+x}" ] || [ "$SMV_TOOL" = "$1" ] || { echo "СЛЕПОТА: довод и SMV_TOOL расходятся"; exit 2; }
  TOOL=$1
else TOOL=${SMV_TOOL:-/usr/local/sbin/smontirovat-vypusk}; fi
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root для синтетической пробы UID/GID"; exit 2; }
MODE_TEST=$(dirname -- "$0")/smv-atomic-probe.py
FIXTURE=$(dirname -- "$0")/smv_fixture.py
[ -r "$FIXTURE" ] || { echo "СЛЕПОТА: нет fixture $FIXTURE"; exit 2; }
SOURCE_GIT=(sudo -n -u "$(stat -c %U /opt/iskra/workspace/dsh-plugins)" git -C /opt/iskra/workspace/dsh-plugins)
[ -r "$MODE_TEST" ] || { echo "СЛЕПОТА: нет helper $MODE_TEST"; exit 2; }
[ -r "$TOOL" ] || { echo "СЛЕПОТА: предмета нет: $TOOL"; exit 2; }
grep -q 'SMV_MONTAZH' "$TOOL" || { echo "СЛЕПОТА: предмет не знает SMV_MONTAZH — прогон задел бы /var/backups/montazh; не запускаю"; exit 2; }
M=telegram-multiagent-v2.5.81; P=packages/telegram-multiagent
"${SOURCE_GIT[@]}" rev-parse -q --verify "$M^{commit}" >/dev/null || { echo "СЛЕПОТА: метки $M в дереве нет"; exit 2; }
W=$(mktemp -d /tmp/stend-smv-rez-XXXXXX) || exit 2
trap 'rm -rf "$W"' EXIT
# B-N-2046: окна монтажа и замок — ЧАСТНЫЕ. С B-N-2025 smontirovat-vypusk берёт ${SMV_ZAMOK:-/run/lock/smontirovat-fajly.lock} и
# открывает окно в ${MO_STATE_DIR:-/var/lib/montazh-okna}: без этого прогон стенда писал окна в БОЕВОЙ каталог (ночь 14.10 — окно
# PORCHA failed → тревога владельцу 04:20Z, ещё 6 открытых). Каталог уходит вместе с $W; перед каждым вызовом — сброс СВОИХ окон.
export MO_STATE_DIR=$W/okna SMV_ZAMOK=$W/zamok; mkdir -m 0755 "$MO_STATE_DIR" || exit 2
zel=0; kras=0
ok(){ echo "✅ $1"; zel=$((zel+1)); }; no(){ echo "❌ $1"; kras=$((kras+1)); }
run(){ rm -f "$MO_STATE_DIR"/*.json; (umask 002; SMV_MONTAZH=$W/mont SMF_RUKA='Stend <stend@sadik>' python3 -B "$FIXTURE" "$W" "$1" "$M" "$P" "$2" -- "$M" "$P" "$2" --v-boj "$3" > "$W/out-$3" 2>&1); echo $?; }
rezhimy(){ (cd "$1" && find . -type f -printf '%m\n' | sort | uniq -c | tr -s ' ' | tr '\n' ' '); }
echo "== стенд прав smontirovat-vypusk $(date -u +%H:%M:%SZ) · предмет $(sha256sum "$TOOL" | cut -c1-8)"

# ── 1. Исправное: права боя = тарболу, сверка прав 0 ──
B=$W/boj1; mkdir -p "$B"; k=$(run "$TOOL" "$B" ISPRAVNOE)
[ "$k" = 0 ] && grep -q '✅ СМОНТИРОВАНО' "$W/out-ISPRAVNOE" && ok "исправное: код 0, СМОНТИРОВАНО" || no "исправное: код $k — $(tail -2 "$W/out-ISPRAVNOE" | tr '\n' ' ')"
R=$(rezhimy "$B"); [ "$R" = " 207 644  8 755 " ] && ok "права боя = тарболу: $R" || no "права боя: $R (ждали 207×644 + 8×755)"
grep -q '^сверка прав с тарболом: расхождений 0 из 215' "$W/out-ISPRAVNOE" && ok "сверка прав напечатана: 0 из 215" || no "строки сверки прав нет или не 0 из 215"

# ── 2. Порча после публикации в копию, перед итоговой сверкой RR ──
PORCHA=$W/smv-porcha
python3 - "$TOOL" "$PORCHA" <<'PYM'
from pathlib import Path
import sys,hashlib
source=Path(sys.argv[1]).read_text()
old='echo "положено: $N из $SOS"'
assert source.count(old)==1
new=source.replace(old,old+'\nwhile IFS= read -r f; do [ -n "$f" ] && chmod 666 -- "$B/$f"; done < "$SOSTAV"')
Path(sys.argv[2]).write_text(new)
print('порча chmod: замен 1; SHA',hashlib.sha256(source.encode()).hexdigest(),'→',hashlib.sha256(new.encode()).hexdigest())
PYM
n=$(grep -cF 'echo "положено: $N из $SOS"' "$TOOL"); n2=$(grep -cF 'chmod 666 -- "$B/$f"' "$PORCHA")
if [ "$n" != 1 ] || [ "$n2" != 1 ] || cmp -s "$TOOL" "$PORCHA"; then no "порча chmod НЕ ВНЕСЕНА"
else
  B=$W/boj2; mkdir -p "$B"; k=$(run "$PORCHA" "$B" PORCHA)
  R=$(rezhimy "$B")
  [ "$R" = " 215 666 " ] && ok "порча внесена в копию: $R" || no "порча не дошла: $R"
  [ "$k" = 1 ] && grep -qF '🔴 МОНТАЖ НЕПОЛОН' "$W/out-PORCHA" && grep -qF 'сверка прав с тарболом: расхождений 215 из 215' "$W/out-PORCHA" \
    && ok "порча chmod поймана сверкой с тарболом: код1" || no "порча не поймана: код $k"
fi

# ── 3. Возврат: предмет снова зелёный ──
B=$W/boj3; mkdir -p "$B"; k=$(run "$TOOL" "$B" VOZVRAT); R=$(rezhimy "$B")
[ "$k" = 0 ] && [ "$R" = " 207 644  8 755 " ] && ok "возврат: код 0, права $R" || no "возврат: код $k, права $R"

# Старый контроль B-N-1612 теперь обязан сам исправиться режимом РЕАЛЬНОГО тарбола.
ARCHIVE=$W/smv-archive-mode
python3 - "$TOOL" "$ARCHIVE" <<'PYA'
from pathlib import Path
import hashlib,sys
b=Path(sys.argv[1]).read_bytes(); old=b'git -c tar.umask=022 archive';assert b.count(old)==1
n=b.replace(old,b'git archive');Path(sys.argv[2]).write_bytes(n)
print('порча archive: замен1; SHA',hashlib.sha256(b).hexdigest(),'→',hashlib.sha256(n).hexdigest())
PYA
n=$(grep -cF 'git -c tar.umask=022 archive' "$TOOL"); n2=$(grep -cF 'git -c tar.umask=022 archive' "$ARCHIVE")
if [ "$n" != 1 ] || [ "$n2" != 0 ] || cmp -s "$TOOL" "$ARCHIVE"; then no "порча archive не внесена"
else
  B=$W/boj-archive; mkdir -p "$B"; k=$(run "$ARCHIVE" "$B" ARCHIVE)
  R=$(rezhimy "$B")
  [ "$k" = 0 ] && [ "$R" = " 207 644  8 755 " ] && ok "archive664/775 исправлен режимом тарбола644/755" || no "режим взят не из тарбола: код$k права$R"
fi

# ── 4. B-N-1746 r2: старый 664 -> тарбол644, прежний владелец, строка перехода ──
# Root нужен только синтетическому отличающемуся UID/GID в собственном /tmp.
if [ "$(id -u)" != 0 ]; then
  no "664→644: нужен root для проверки чужого UID/GID на копии"
else
  rm -f "$MO_STATE_DIR"/*.json
  timeout 90s python3 -B "$MODE_TEST" "$TOOL" mode_policy > "$W/mode-policy.log" 2>&1
  k=$?
  [ "$k" = 0 ] && ok "664→644: режим тарбола, прежний UID/GID, новый inode и строка прав" || { no "664→644: код $k"; tail -8 "$W/mode-policy.log"; }
fi

echo "== итог: зелёных $zel · красных $kras"
[ "$kras" = 0 ] && exit 0 || exit 1
