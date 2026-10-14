#!/bin/bash
# СТЕНД ДОСТАВКИ claudeclaw-alert при отказе разметки (A-N-1948 модуль №5, находка №9; Искра, 10.10.2026).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/bin/claudeclaw-alert. Подставные curl и logger — первыми в PATH, в своём mktemp:
#   curl пишет ТОЛЬКО текст и режим разметки, ввод с адресом и токеном читает в /dev/null; отказ разметки — как Telegram:
#   ok:false с description, а при флаге -f (как у прежней формы) — код 22 без тела. logger пишет в файл стенда. В Telegram — ничего.
# Пробы: П1 разметку приняли → один вызов HTML, код 0 · П2 разметку отвергли (текст с «<» и «&») → запасной ход без разметки
#   с тем же текстом, код 0, причина отказа в журнале · П3 отвергли оба хода → код 1, причина в журнале.
# Учётка: root (файл токена /etc/claudeclaw-alert.token). Коды: 0 — все пробы; 1 — красные; 2 — слепота.
# ЧЕГО НЕ ЛОВИТ: настоящий разбор разметки Telegram (отказ задаёт стенд); обрезку длинного текста (у предмета её нет).
set -u
P="${1:-/usr/local/bin/claudeclaw-alert}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (файл токена)"; exit 2; }
[ -s /etc/claudeclaw-alert.token ] || { echo "СЛЕПОТА: /etc/claudeclaw-alert.token пуст или нет — предмет не дойдёт до отправки"; exit 2; }
T=$(mktemp -d /tmp/stend-claudeclaw-alert.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT
mkdir "$T/bin"
cat > "$T/bin/curl" <<'SH'
#!/bin/bash
cat > /dev/null
n=$(ls "$STEND_T"/vyzov.* 2>/dev/null | wc -l); rezh=plain; txt=""; f=0
while [ "$#" -gt 0 ]; do
  case "$1" in --data-urlencode) case "$2" in text=*) txt=${2#text=} ;; parse_mode=*) rezh=${2#parse_mode=} ;; esac; shift ;;
    --*) ;; -*f*) f=1 ;; esac; shift
done
printf '%s' "$txt" > "$STEND_T/vyzov.$n.$rezh"
if { [ "$rezh" = HTML ] && [ -n "${STEND_OTKAZ_HTML:-}" ]; } || { [ "$rezh" = plain ] && [ -n "${STEND_OTKAZ_PLAIN:-}" ]; }; then
  [ "$f" = 1 ] && { echo "curl: (22) The requested URL returned error: 400" >&2; exit 22; }
  echo '{"ok":false,"error_code":400,"description":"Bad Request: stend otverg"}'; exit 0
fi
echo '{"ok":true}'
SH
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$STEND_T/logger.log"\n' > "$T/bin/logger"; chmod 755 "$T/bin/curl" "$T/bin/logger"
ok=0; bad=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1 — $3"; ok=$((ok+1)); else echo "❌ $1 — $3"; bad=$((bad+1)); fi; }
vyzov() { rm -f "$T"/vyzov.* "$T/logger.log"; env PATH="$T/bin:$PATH" STEND_T="$T" "$@" bash "$P" "$TXT" > "$T/out" 2>&1; KOD=$?; }
spisok() { (cd "$T" && ls vyzov.* 2>/dev/null | tr '\n' ' '); }
echo "== стенд доставки claudeclaw-alert: предмет $P ($(sha256sum "$P" | cut -c1-16))"
TXT='ошибка ssh: <prichina> & код 255'
vyzov env; [ "$KOD" = 0 ] && [ "$(spisok)" = "vyzov.0.HTML " ]; pr "П1 разметку приняли → один вызов, код 0" $? "код $KOD, вызовы: $(spisok)"
vyzov env STEND_OTKAZ_HTML=1; t=$(cat "$T/vyzov.1.plain" 2>/dev/null)
[ "$KOD" = 0 ] && [ "$t" = "$TXT" ] && grep -qF 'stend otverg' "$T/logger.log" 2>/dev/null
pr "П2 разметку отвергли → запасной ход тем же текстом, причина в журнале" $? "код $KOD, вызовы: $(spisok), журнал: $(tr '\n' ' ' < "$T/logger.log" 2>/dev/null | cut -c1-120)"
vyzov env STEND_OTKAZ_HTML=1 STEND_OTKAZ_PLAIN=1
[ "$KOD" = 1 ] && grep -qF 'stend otverg' "$T/logger.log" 2>/dev/null
pr "П3 отвергли оба хода → код 1, причина в журнале" $? "код $KOD, вызовы: $(spisok), журнал: $(tr '\n' ' ' < "$T/logger.log" 2>/dev/null | cut -c1-120)"
echo "итог: $ok из $((ok+bad))"; [ "$bad" = 0 ] || exit 1
