#!/usr/bin/env bash
# Стенд svesti-dostup-watch (B-N-1621 k2 r2, Искра; W12–W14 — ворота Вениамина 07:34Z): сторож --proverit по таймеру — читатель правила 1в.
# Подставные помощник и канал тревог (пишут каждый вызов в журнал), подставной каталог состояния; боевые не зовутся.
# Предмет: SDW_BIN (по умолчанию — БОЙ /usr/local/sbin/svesti-dostup-watch). Учётка любая (root не нужен).
# Коды: 0 все пробы зелёные · 1 есть красные · 2 слепота (нет предмета) / канарейка (проб не столько, сколько ждём).
# НЕ ПРОВЕРЯЕТ: настоящий помощник (его стенд — stend-svesti-dostup-podpisok.sh), доставку agent-alert, сам таймер.
set -uo pipefail
P="${SDW_BIN:-/usr/local/sbin/svesti-dostup-watch}"
[ -x "$P" ] || { echo "СЛЕПОТА: нет исполняемого $P"; exit 2; }
R=$(mktemp -d "${TMPDIR:-/tmp}/stend-sdw.XXXXXX") || exit 2; trap 'rm -rf "$R"' EXIT
mkdir -p "$R/bin"
cat > "$R/bin/svesti" <<'SV'
#!/usr/bin/env bash
d=$(dirname "$0")/..; echo "$*" >> "$d/svesti.log"; cat "$d/vyvod" 2>/dev/null; exit "$(cat "$d/kod")"
SV
cat > "$R/bin/alert" <<'AL'
#!/usr/bin/env bash
d=$(dirname "$0")/..; printf '%s\n' "$*" >> "$d/alert.log"; exit "$(cat "$d/alert.kod")"
AL
chmod 755 "$R/bin/svesti" "$R/bin/alert"; echo 0 > "$R/alert.kod"
ok=0; bed=0; vsego=0
sud(){ vsego=$((vsego+1)); if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bed=$((bed+1)); echo "  🔴 $1 — ${3-}"; fi; }
W(){ : > "$R/svesti.log"; : > "$R/alert.log"; SDW_STEND=1 SDW_SVESTI="$R/bin/svesti" SDW_ALERT="$R/bin/alert" SDW_SOSTOYANIE="$R/sost" "$P" > "$R/out" 2>&1; echo $?; }
pomoshchnik(){ echo "$1" > "$R/kod"; printf '%b' "$2" > "$R/vyvod"; }
nalert(){ grep -c . "$R/alert.log"; }
KRASNOE='🔴 gateway@spartak(spartak): ЯДРО читает чужое token-podpiska-2\n🔴 instance-spartak.env: spartak:spartak 640 — нужно root:root 0600\nРАСХОЖДЕНИЙ 2 · шлюзов 8\n'
echo "предмет: $P ($(sha256sum "$P" | cut -c1-16))"

pomoshchnik 0 'СОШЛОСЬ · шлюзов 8\n'; k=$(W)
sud "W1 зелёное → код 0, тревоги нет, состояния нет" "$([ "$k" = 0 ] && [ "$(nalert)" = 0 ] && [ ! -e "$R/sost/poslednee" ] && [ "$(cat "$R/svesti.log")" = '--proverit' ] && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 1 "$KRASNOE"; k=$(W)
sud "W2 красное → код 1, ОДНА тревога с «РАСХОЖДЕНИЙ 2» и первой строкой 🔴" "$([ "$k" = 1 ] && [ "$(nalert)" = 1 ] && grep -qF 'РАСХОЖДЕНИЙ 2' "$R/alert.log" && grep -qF 'ЯДРО читает чужое' "$R/alert.log" && [ -s "$R/sost/poslednee" ] && echo 1)" "код $k, тревог $(nalert): $(cut -c1-200 "$R/alert.log")"
k=$(W)
sud "W3 то же красное сразу → код 1, тревога ПОДАВЛЕНА (сказано)" "$([ "$k" = 1 ] && [ "$(nalert)" = 0 ] && grep -qF 'подавлена (не новость)' "$R/out" && echo 1)" "код $k, тревог $(nalert)"
touch -d '25 hours ago' "$R/sost/poslednee"; k=$(W)
sud "W4 то же красное через 25 ч → тревога снова" "$([ "$k" = 1 ] && [ "$(nalert)" = 1 ] && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 1 '🔴 gateway@zarya(zarya): своё не читается token-podpiska-1\nРАСХОЖДЕНИЙ 1 · шлюзов 8\n'; k=$(W)
sud "W5 НОВОЕ красное сразу → тревога (смена состава — новость)" "$([ "$k" = 1 ] && [ "$(nalert)" = 1 ] && grep -qF 'zarya' "$R/alert.log" && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 0 'СОШЛОСЬ · шлюзов 8\n'; W >/dev/null; pomoshchnik 1 '🔴 gateway@zarya(zarya): своё не читается token-podpiska-1\nРАСХОЖДЕНИЙ 1 · шлюзов 8\n'; k=$(W)
sud "W6 красное → зелёное → то же красное → тревога (зелёное сбрасывает счёт)" "$([ "$k" = 1 ] && [ "$(nalert)" = 1 ] && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 2 'ОТКАЗ: нет каталога /etc/claude-oauth\n'; k=$(W)
sud "W7 помощник отказал (код 2) → код 2, тревога «СТОРОЖ СЛЕП»" "$([ "$k" = 2 ] && [ "$(nalert)" = 1 ] && grep -qF 'СТОРОЖ СЛЕП' "$R/alert.log" && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 1 'что-то не то\n'; k=$(W)
sud "W8 код 1 без строк 🔴 → код 2, «формат вывода разошёлся»" "$([ "$k" = 2 ] && grep -qF 'формат вывода разошёлся' "$R/alert.log" && echo 1)" "код $k: $(cut -c1-150 "$R/alert.log")"
pomoshchnik 1 "$KRASNOE"; rm -f "$R/sost/poslednee"; echo 1 > "$R/alert.kod"; k=$(W); echo 0 > "$R/alert.kod"
sud "W9 канал тревог отказал → код 3 «НЕ ДОСТАВЛЕНА», состояние НЕ записано" "$([ "$k" = 3 ] && grep -qF 'ТРЕВОГА НЕ ДОСТАВЛЕНА' "$R/out" && [ ! -e "$R/sost/poslednee" ] && echo 1)" "код $k, состояние: $(cat "$R/sost/poslednee" 2>/dev/null || echo нет)"
k=$(W)
sud "W12 (ворота 07:34Z) следующий прогон, канал исправен → тревога ушла, код 1 (не «подавлена»)" "$([ "$k" = 1 ] && [ "$(nalert)" = 1 ] && grep -qF 'тревога ушла' "$R/out" && [ -s "$R/sost/poslednee" ] && echo 1)" "код $k, тревог $(nalert): $(tail -1 "$R/out")"
pomoshchnik 2 'ОТКАЗ: нет каталога /etc/claude-oauth\n'; W >/dev/null; k=$(W)
sud "W13 та же слепота вторым прогоном → код 2, тревога ПОДАВЛЕНА" "$([ "$k" = 2 ] && [ "$(nalert)" = 0 ] && grep -qF 'подавлена' "$R/out" && echo 1)" "код $k, тревог $(nalert)"
pomoshchnik 2 'ОТКАЗ: процесс 4242 исчез в 07:51:02\n'; k=$(W)
sud "W15 (k3) та же слепота (код 2), хвост ДРУГОЙ (pid/время) → всё равно подавлена" "$([ "$k" = 2 ] && [ "$(nalert)" = 0 ] && grep -qF 'подавлена' "$R/out" && echo 1)" "код $k, тревог $(nalert)"
touch -d '25 hours ago' "$R/sost/poslednee"; k=$(W)
sud "W14 та же слепота через 25 ч → тревога снова, код 2" "$([ "$k" = 2 ] && [ "$(nalert)" = 1 ] && grep -qF 'СТОРОЖ СЛЕП' "$R/alert.log" && echo 1)" "код $k, тревог $(nalert)"
: > "$R/svesti.log"; : > "$R/alert.log"; k=$(SDW_SVESTI="$R/bin/svesti" SDW_ALERT="$R/bin/alert" SDW_SOSTOYANIE="$R/sost" "$P" > "$R/out" 2>&1; echo $?)
sud "W10 подмены без SDW_STEND=1 → ОТКАЗ код 2, ничего не позвано" "$([ "$k" = 2 ] && [ ! -s "$R/svesti.log" ] && [ ! -s "$R/alert.log" ] && grep -qF 'без SDW_STEND=1' "$R/out" && echo 1)" "код $k: $(head -1 "$R/out")"
k=$(SDW_STEND=yes SDW_SVESTI="$R/bin/svesti" SDW_ALERT="$R/bin/alert" SDW_SOSTOYANIE="$R/sost" "$P" > "$R/out" 2>&1; echo $?)
sud "W11 SDW_STEND=yes → ОТКАЗ код 2" "$([ "$k" = 2 ] && [ ! -s "$R/svesti.log" ] && echo 1)" "код $k"

echo; echo "ИТОГ: зелёных $ok, красных $bed"
ZHDYOM=15
[ "$vsego" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $vsego, ждём $ZHDYOM"; exit 2; }
[ "$bed" = 0 ]
