#!/usr/bin/env bash
# RU: Настоящая отправка только в подставной curl; журнал, хвост и токен в /tmp.
# EN: Real send path uses a curl double; journal, tail and token live in /tmp.
# RU: Проверяет 31 исход, включая UTF-16 с эмодзи, запасной plain и режим --proverit-nastrojku. Не доказывает живую доставку,
# права другой учётной записи, конкурентные вызовы и фактическую длительность боевых пауз.
# EN: Checks 31 outcomes including emoji UTF-16, plain fallback and --proverit-nastrojku. Does not prove live delivery,
# another account's permissions, concurrent calls or actual production delay lengths.
set -uo pipefail
export DSH_PROBA=0

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2
PREDMET="${AGENT_ALERT_BIN:-$ROOT/bin/agent-alert}"
ZHDYOM_PROVEROK=31        # канарейка: точное число, не «не меньше» —
ok=0; fail=0
sud() { # sud <ожидание> <факт> <что>
  if [ "$1" = "$2" ]; then ok=$((ok+1)); echo "  ok   $3"
  else fail=$((fail+1)); echo "  FAIL $3: ждали [$1], вышло [$2]"; fi
}

[ -r "$PREDMET" ] || { echo "СЛЕПОТА: предмет $PREDMET не читается"; exit 2; }
echo "предмет: $PREDMET"

D=$(mktemp -d /tmp/stend-alert.XXXXXX) || { echo "СЛЕПОТА: не завести временный каталог"; exit 2; }
trap 'rm -rf "$D"' EXIT
mkdir -p "$D/bin" "$D/etc" || { echo "СЛЕПОТА: нет записи в $D"; exit 2; }
echo "PODSTAVNOJ" > "$D/etc/token"; chmod 640 "$D/etc/token"; echo "12345" > "$D/etc/chat"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/zhurnal"\n' "$D" > "$D/bin/logger" && chmod +x "$D/bin/logger" \
  && : > "$D/hvost" || { echo "СЛЕПОТА: подставной журнал не заведён"; exit 2; }
printf '#!/bin/sh\nexit 0\n' > "$D/bin/systemctl" && chmod +x "$D/bin/systemctl" || exit 2
mkdir -p "$D/subject/bin"
LIB="$(dirname -- "$(readlink -f -- "$PREDMET")")/../lib/dsh-trevogi"
[ -d "$LIB" ] || { echo "СЛЕПОТА: библиотека предмета $LIB отсутствует"; exit 2; }
mkdir -p "$D/subject/lib" || exit 2
cp -a "$LIB" "$D/subject/lib/dsh-trevogi" || exit 2
cp "$PREDMET" "$D/subject/bin/alert" && chmod +x "$D/subject/bin/alert" || { echo "СЛЕПОТА: предмет не копируется"; exit 2; }

printf '# fixture\n' > "$D/empty.conf"
export DSH_TREVOGI_CONFIG="$D/empty.conf"
export AGENT_ALERT_TOKEN_FILE="$D/etc/token" AGENT_ALERT_CHAT_FILE="$D/etc/chat" AGENT_ALERT_HVOST="$D/hvost"
export AGENT_ALERT_PAUZY="1 1 1 1 1 1 1 1" AGENT_ALERT_TAJMAUT=2
export PATH="$D/bin:$PATH" STEND_DIR="$D"

mk_curl() { printf '#!/bin/bash\ncat >/dev/null\n%s\n' "$1" > "$D/bin/curl"; chmod +x "$D/bin/curl"; }

echo "── 1. поведение (подставной curl)"
mk_curl 'echo "{\"ok\":true}"; exit 0'
"$D/subject/bin/alert" проба >/dev/null 2>&1; sud 0 $? "телеграм подтвердил → код 0"

mk_curl 'echo "{\"ok\":false,\"description\":\"chat not found\"}"; exit 0'
o=$("$D/subject/bin/alert" проба 2>&1); k=$?
sud 1 $k "телеграм ответил отказом → код 1"
case "$o" in *"телеграм ответил отказом"*) sud da da "назван как отказ телеграма";; *) sud da net "назван как отказ телеграма";; esac
case "$o" in *"chat not found"*) sud da da "причина отказа телеграма не потеряна";; *) sud da net "причина отказа телеграма не потеряна";; esac
sud 1 "$(printf '%s' "$o" | grep -c 'попытка')" "на отказ телеграма повтора НЕТ"

mk_curl 'echo "curl: (6) Could not resolve host" >&2; exit 6'
o=$("$D/subject/bin/alert" проба 2>&1); k=$?
sud 1 $k "сеть не пустила → код 1"
case "$o" in *"сеть не пустила"*) sud da da "названо как недостижимость сети, а не отказ телеграма";; *) sud da net "названо как недостижимость сети, а не отказ телеграма";; esac
case "$o" in *"curl код 6"*) sud da da "код возврата curl назван";; *) sud da net "код возврата curl назван";; esac
sud 3 "$(printf '%s' "$o" | grep -c 'сеть не пустила')" "попыток ровно 3 (предел соблюдён)"

rm -f "$D/schet"
cat > "$D/bin/curl" <<'EOF'
#!/bin/bash
cat >/dev/null
n=$(cat "$STEND_DIR/schet" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$STEND_DIR/schet"
if [ "$n" -lt 2 ]; then echo "curl: (7) Failed to connect" >&2; exit 7; fi
echo '{"ok":true}'; exit 0
EOF
chmod +x "$D/bin/curl"
"$D/subject/bin/alert" проба >/dev/null 2>&1
sud 0 $? "сеть встала со второй попытки → код 0"
sud 2 "$(cat "$D/schet" 2>/dev/null)" "повтор состоялся ровно один раз"

echo "── 1б. журнал и хвост тревог — подставные (regression)"
sud 4 "$(grep -c 'исход=' "$D/zhurnal" 2>/dev/null)" "журнал тревог подставной: 4 строки исхода в стенде, не в бою"
sud 4 "$(grep -c 'проба' "$D/hvost" 2>/dev/null)" "хвост тревог подставной: 4 записи в стенде, не в /var/log/agent-alert"

echo "── 2. устройство (подставной curl этого НЕ воспроизводит)"
sud 1 "$(grep -c -- 'curl -sS' "$PREDMET")" "curl зовётся с -sS (иначе причина глушится)"
sud 0 "$(grep -vE '^\s*#' "$PREDMET" | grep -cE 'curl -s [^S]')" "голого -s в исполняемых строках не осталось"
mk_curl 'echo "{\"ok\":false,\"metadata\":{\"ok\":true}}"; exit 0'
"$D/subject/bin/alert" проба >/dev/null 2>&1; sud 1 $? "вложенный ok:true не подменяет отказ верхнего уровня"

echo "── 4. длина — счётом телеграма (30.09.2026, regression: 400 «message is too long» у позванного рукой)"
cat > "$D/bin/curl" <<'PYCURL'
#!/usr/bin/env python3
import sys, re, html, os
sys.stdin.read(); a = sys.argv[1:]; t = ''; h = False
for i, x in enumerate(a):
    if x == '--data-urlencode' and i + 1 < len(a):
        if a[i+1].startswith('text='): t = a[i+1][5:]
        if a[i+1] == 'parse_mode=HTML': h = True
v = html.unescape(re.sub(r'<[^>]*>', '', t)) if h else t
open(os.environ['STEND_DIR'] + '/poslano', 'w').write(t)
print('{"ok":false,"error_code":400,"description":"Bad Request: message is too long"}' if len(v.encode('utf-16-le')) // 2 > 4096 else '{"ok":true}')
PYCURL
chmod +x "$D/bin/curl"
dlinnoe=$(python3 -c "print('\n'.join(f'🔴🟠 копия {i} /srv/example/{i}/plugins/dsh-tool-bridge: совпало 20 из 28, бой=0.3.18' for i in range(90)))")
"$D/subject/bin/alert" "$dlinnoe" >/dev/null 2>&1; sud 0 $? "длинное HTML с эмодзи доходит (≤ 4096 единиц UTF-16 с префиксом и подписью)"
sud 1 "$(grep -c 'ОБРЕЗАНО каналом' "$D/poslano" 2>/dev/null)" "потеря объявлена подписью в самом сообщении"

echo "── 5. запасной путь: сбой подготовки HTML → plain с пометкой (30.09.2026, правка review к regression)"
cp "$D/subject/bin/alert" "$D/subject/bin/alert-porcha"
n=$(grep -cF '    def vlezaet(t):' "$D/subject/bin/alert-porcha")
sed -i "s/^    def vlezaet(t):/    raise ValueError('порча стенда: html')\n    def vlezaet(t):/" "$D/subject/bin/alert-porcha"
echo "  порча внесена: замен $n, сумма $(sha256sum "$D/subject/bin/alert" | cut -c1-8) → $(sha256sum "$D/subject/bin/alert-porcha" | cut -c1-8)"
[ "$n" = 1 ] || { echo "СЛЕПОТА: порча ветки HTML не внесена (замен $n) — предмет изменился"; exit 2; }
rm -f "$D/poslano"
"$D/subject/bin/alert-porcha" '<b>проба</b> запасного пути' >/dev/null 2>&1; sud 0 $? "html не подготовлен → ушло веткой plain (код 0)"
sud 1 "$(grep -c 'html не подготовлен, отправлено текстом' "$D/poslano" 2>/dev/null)" "пометка запасного пути — в самом сообщении"
o=$(AGENT_ALERT_PREDEL=abc "$D/subject/bin/alert-porcha" проба 2>&1); k=$?
sud "1 1" "$k $(printf '%s' "$o" | grep -c 'ни html, ни plain')" "обе ветки не подготовлены → код 1 и «ни html, ни plain» (НЕ отправлено)"

echo "── 6. --proverit-nastrojku: настройка без отправки (сеть, журнал, хвост не трогаются, значения не печатаются)"
mk_curl 'echo zvan >> "$STEND_DIR/curl-zvan"; echo "{\"ok\":true}"; exit 0'
rm -f "$D/curl-zvan"; zh0=$(wc -l < "$D/zhurnal"); hv0=$(wc -l < "$D/hvost")
o=$("$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
sud "0 1" "$k $(printf '%s' "$o" | grep -c 'НАСТРОЙКА ГОДНА')" "годная настройка → код 0 и «НАСТРОЙКА ГОДНА»"
sud "0 0" "$(printf '%s' "$o" | grep -c 'PODSTAVNOJ') $(printf '%s' "$o" | grep -c '12345')" "значения токена и чата не напечатаны"
sud "0 $zh0 $hv0" "$(cat "$D/curl-zvan" 2>/dev/null | wc -l) $(wc -l < "$D/zhurnal") $(wc -l < "$D/hvost")" "сеть не звана, журнал и хвост не тронуты"
o=$(AGENT_ALERT_TOKEN_FILE="$D/etc/net-takogo" "$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
sud "2 1" "$k $(printf '%s' "$o" | grep -c 'токен — нет обычного файла')" "токена нет → код 2, причина названа"
o=$(AGENT_ALERT_CHAT_FILE="$D/etc/net-chata" "$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
sud "2 1 0" "$k $(printf '%s' "$o" | grep -c 'чат — нет обычного файла') $(printf '%s' "$o" | grep -c '^ОТКАЗ НАСТРОЙКИ: токен')" "чата нет → код 2, причина названа, токен годен"
: > "$D/etc/chat-pust"
o=$(AGENT_ALERT_TOKEN_FILE="$D/etc" AGENT_ALERT_CHAT_FILE="$D/etc/chat-pust" "$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
sud "2 2" "$k $(printf '%s' "$o" | grep -c '^ОТКАЗ НАСТРОЙКИ')" "каталог вместо токена И пустой чат → код 2, названы обе причины"
if [ "$(id -u)" = 0 ]; then
  echo "  ПРОПУСК: от root нечитаемость файла не воспроизводится — проверка «не читается учёткой» не проведена"
  ZHDYOM_PROVEROK=$((ZHDYOM_PROVEROK - 1))
else
  cp "$D/etc/token" "$D/etc/token-zakryt" && chmod 000 "$D/etc/token-zakryt"
  o=$(AGENT_ALERT_TOKEN_FILE="$D/etc/token-zakryt" "$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
  sud "2 1" "$k $(printf '%s' "$o" | grep -c 'токен — файл не читается учёткой')" "токен не читается учёткой → код 2, учётка названа"
fi
printf 'NEIZVESTNYJ_KLYUCH=1\n' > "$D/bad.conf"
o=$(DSH_TREVOGI_CONFIG="$D/bad.conf" "$D/subject/bin/alert" --proverit-nastrojku 2>&1); k=$?
sud "2 1" "$k $(printf '%s' "$o" | grep -c 'настройка не разрешена')" "негодная настройка → код 2, «настройка не разрешена»"
o=$("$D/subject/bin/alert" --proverit-nastrojku лишнее 2>&1); k=$?
sud "2 1" "$k $(printf '%s' "$o" | grep -c 'лишний довод')" "лишний довод → код 2, не отправка"
sud 0 "$(cat "$D/curl-zvan" 2>/dev/null | wc -l)" "ни один вызов проверки не звал сеть"

echo "── итог: ok=$ok fail=$fail (ждали проверок: $ZHDYOM_PROVEROK)"
vsego=$((ok+fail))
if [ "$vsego" -ne "$ZHDYOM_PROVEROK" ]; then
  echo "СЛЕПОТА: проведено $vsego проверок из $ZHDYOM_PROVEROK — часть не состоялась"; exit 2
fi
[ "$fail" -eq 0 ] || exit 1
exit 0
