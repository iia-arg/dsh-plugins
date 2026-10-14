#!/bin/bash
# СТЕНД СЛЕПОТЫ НАСТРОЙКИ: omega-kopiya-watch и session-agent-preset-watch при незаданном ключе ГОВОРЯТ в свой канал.
# Что проверяет (решение координатора к возврату r2):
#   · файла настройки нет → строка в ПОДМЕНЁННОМ канале с причиной «файла нет»; omega — код 3 (коды 1 и 2 юнит считает
#     успехом), preset-watch --watch — код 2;
#   · файл есть, но не читается (режим 000) → своя причина «есть, но не читается», а не «ключа нет»;
#   · файл читается, ключа нет → причина «ключа нет»;
#   · возврат (ключ задан) → тревоги о настройке нет;
#   · preset-watch: та же слепота повторно — тишина (подпись в last.json); без --watch — канал не зовётся.
# Канал подменяется ПЕРЕМЕННОЙ САМОГО МОДУЛЯ (OKW_ALERT, PRESET_WATCH_ALERT); живой agent-alert сверх того уведён
# в пустоту (AGENT_ALERT_TOKEN_FILE/CHAT_FILE). Всё во временном каталоге. Каталог модулей — STEND_BIN.
# Чего НЕ проверяет: доставку живым каналом; повтор тревоги omega каждый такт (памяти отданного без файла состояния нет).
# Запуск от root бессмыслен: root читает файл 000 — проба «не читается» бессильна по построению, поэтому СЛЕПОТА стенда.
# EN: SETTINGS-BLINDNESS STAND: omega-kopiya-watch and session-agent-preset-watch SPEAK to their channel when a key is unset.
#     What it checks (the coordinator's decision for return r2):
#     · no settings file → a line in the SUBSTITUTED channel with the cause "no file"; omega — code 3 (the unit counts
#     codes 1 and 2 as success), preset-watch --watch — code 2;
#     · the file exists but is unreadable (mode 000) → its own cause "exists but unreadable", not "no key";
#     · the file is readable, no key → the cause "no key";
#     · return (key set) → no settings alarm;
#     · preset-watch: the same blindness again — silence (signature in last.json); without --watch the channel is not called.
#     The channel is substituted by THE MODULE'S OWN VARIABLE (OKW_ALERT, PRESET_WATCH_ALERT); the live agent-alert is
#     also led nowhere (AGENT_ALERT_TOKEN_FILE/CHAT_FILE). Everything in a temporary directory. The modules directory is STEND_BIN.
#     What it does NOT check: delivery by the live channel; omega repeating the alarm every cycle (without the state file
#     there is no memory of what was sent). Running as root is pointless: root reads a mode-000 file — the "unreadable"
#     probe is powerless by construction, hence stand BLINDNESS.
set -u
BIN="${STEND_BIN:-$(cd "$(dirname "$0")/../bin" && pwd)}"
[ "$(id -u)" != 0 ] || { echo "СЛЕПОТА стенда: запуск от root — файл 000 читается, проба «не читается» бессильна"; exit 2; }
T=$(mktemp -d /tmp/stend-slepoty-nastrojki.XXXXXX); trap 'chmod -R u+rwX "$T" 2>/dev/null; rm -rf "$T"' EXIT
VSEGO=0; OK=0
proba() { VSEGO=$((VSEGO+1)); if [ "$2" = da ]; then OK=$((OK+1)); echo "  ✅ $1"; else echo "  ❌ $1 — $3"; fi; }
cat > "$T/alert" <<'ALERT'
#!/bin/bash
printf '%s\n' "$*" >> "$(dirname "$0")/alert.log"
[ "${1:-}" = --plain ] && cat >> "$(dirname "$0")/alert.log"
exit 0
ALERT
chmod +x "$T/alert"; : > "$T/alert.log"
strok() { wc -l < "$T/alert.log"; }
novoe() { tail -n +"$(( $1 + 1 ))" "$T/alert.log"; }   # строки канала после отметки · EN: channel lines after the mark
printf 'OKW_STATE=%s\nAGENT_REGISTRY=%s\n' "$T/net" "$T/net" > "$T/zakryt.conf"; chmod 000 "$T/zakryt.conf"
printf '# ключей нет\n' > "$T/pust.conf"
NET="AGENT_ALERT_TOKEN_FILE=$T/net AGENT_ALERT_CHAT_FILE=$T/net"
omega() {  # omega <файл настройки> [переменные…] — сторож с подменённым каналом · EN: watcher with a substituted channel
  local k=$1; shift
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$k" OKW_ALERT="$T/alert" $NET "$@" \
    timeout 60 python3 "$BIN/omega-kopiya-watch" > "$T/out" 2>&1
}
preset() {  # preset <файл настройки> [ключ режима] — preset-watch с подменённым каналом и своим каталогом состояния
  # EN: preset <settings file> [mode flag] — preset-watch with a substituted channel and its own state directory
  local k=$1; shift
  env -i DSH_PROBA=1 PATH=/usr/bin:/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$k" PRESET_WATCH_PROBA=1 \
    PRESET_WATCH_STATE="$T/pst" PRESET_WATCH_ALERT="$T/alert" $NET timeout 60 python3 "$BIN/session-agent-preset-watch" "$@" > "$T/out" 2>&1
}

echo "== omega-kopiya-watch"
m=$(strok); omega "$T/net.conf"; kod=$?
proba "файла нет → код 3 и строка в канале «файла … нет» (код $kod)" \
  "$([ $kod = 3 ] && novoe $m | grep -qF "OKW_STATE" && novoe $m | grep -qF "файла $T/net.conf нет" && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
m=$(strok); omega "$T/zakryt.conf"; kod=$?
proba "файл 000 → код 3 и причина «есть, но не читается» (код $kod)" \
  "$([ $kod = 3 ] && novoe $m | grep -qF 'есть, но не читается' && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
m=$(strok); omega "$T/pust.conf"; kod=$?
proba "файл без ключа → код 3 и причина «ключа в нём нет» (код $kod)" \
  "$([ $kod = 3 ] && novoe $m | grep -qF 'ключа в нём нет' && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
printf 'OKW_STATE=%s\n' "$T/state/otdano.json" > "$T/okw.conf"
m=$(strok); omega "$T/okw.conf" OKW_OMEGA_DB="$T/net-omega.db" OKW_PAMYAT="$T/net/*/pamyat.db" OKW_CORE="$T/net-yadra" \
  OKW_PRAVKI="$T/net-pravki" OKW_SYSTEMCTL=/bin/false OKW_JOURNALCTL=/bin/false; kod=$?
proba "возврат: ключ задан → тревоги о файле состояния нет (код $kod)" \
  "$([ $kod != 3 ] && ! novoe $m | grep -qF 'файл состояния не задан' && echo da || echo net)" "канал: $(novoe $m | head -c 200)"

echo "== session-agent-preset-watch"
m=$(strok); preset "$T/net.conf"; kod=$?
proba "без --watch: код 2, канал не зовётся (код $kod)" "$([ $kod = 2 ] && [ "$(strok)" = "$m" ] && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
m=$(strok); preset "$T/net.conf" --watch; kod=$?
proba "файла нет → код 2 и строка в канале «файла … нет» (код $kod)" \
  "$([ $kod = 2 ] && novoe $m | grep -qF 'AGENT_REGISTRY' && novoe $m | grep -qF "файла $T/net.conf нет" && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
m=$(strok); preset "$T/net.conf" --watch; kod=$?
proba "та же слепота повторно → тишина (код $kod)" "$([ $kod = 2 ] && [ "$(strok)" = "$m" ] && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
m=$(strok); preset "$T/zakryt.conf" --watch; kod=$?
proba "файл 000 → своя причина «есть, но не читается» (код $kod)" \
  "$([ $kod = 2 ] && novoe $m | grep -qF 'есть, но не читается' && echo da || echo net)" "канал: $(novoe $m | head -c 200)"
mkdir -p "$T/agent/.dsh/sessions/p/s"
printf '{"type":"session","agentPreset":"proba"}\n' > "$T/agent/.dsh/sessions/p/s/session.jsonl"
printf 'agenty:\n  - imya: proba\n    namerenie:\n      dom: %s\n' "$T/agent" > "$T/reg.yaml"
printf 'AGENT_REGISTRY=%s\n' "$T/reg.yaml" > "$T/pr.conf"
m=$(strok); preset "$T/pr.conf" --watch; kod=$?
proba "возврат: реестр задан и исправен → код 0, тишина (код $kod)" "$([ $kod = 0 ] && [ "$(strok)" = "$m" ] && echo da || echo net)" \
  "канал: $(novoe $m | head -c 200); вывод: $(head -c 200 "$T/out")"

ZHDYOM=9
[ "$VSEGO" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $VSEGO, ЖДЁМ $ZHDYOM"; exit 2; }
echo; echo "ИТОГ: $OK из $VSEGO"
[ "$OK" = "$VSEGO" ]
