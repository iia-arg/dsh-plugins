#!/usr/bin/env bash
# Приёмка svyazki-podpisok — раскладчика связок «агент → ключ подписки».
#
# Гоняет УСТАНОВЛЕННЫЙ /usr/local/sbin/svyazki-podpisok на подставном реестре и
# подставном каталоге ключей: боевые /etc/agent-registry и /etc/claude-oauth не
# трогаются ни на одном шаге.
#
# Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ:
#   * не проверяет ПРАВА боевых файлов ключей — это отдельная проба чужой рукой
#     (пользователь A не читает ключ B), её делает человек временными юнитами;
#   * не судит, рабочий ли ключ: файл есть и читается — этого стенду довольно;
#   * не проверяет «покажи применённое» на ЖИВОМ процессе: там нужен настоящий
#     экземпляр шлюза, а стенд не имеет права его поднимать;
#   * фикстур два агента, поведение на десяти не мерилось.
set -uo pipefail
export LC_ALL=C.UTF-8

INSTR="${SVYAZKI_BIN:-/usr/local/sbin/svyazki-podpisok}"
ZHDYOM_PROVEROK=23   # 13 + 10 проб доступа (B-N-1621 k2)
ok=0; bad=0; slep=0
sud(){
  case "$1" in
    ok)   ok=$((ok+1));   printf '  ok      %-50s %s\n' "$2" "${3-}" ;;
    fail) bad=$((bad+1)); printf '  FAIL    %-50s %s\n' "$2" "${3-}" ;;
    *)    slep=$((slep+1)); printf '  СЛЕПОТА %-50s %s\n' "$2" "${3-}" ;;
  esac
}
[ -x "$INSTR" ] || { echo "СЛЕПОТА: нет исполняемого $INSTR"; exit 2; }
python3 -c 'import yaml' 2>/dev/null || { echo "СЛЕПОТА: нет модуля yaml — разбор реестра невозможен"; exit 2; }

D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
mkdir -p "$D/klyuchi"
export SVYAZKI_STEND=1
export AGENTS_REGISTRY="$D/agents.yaml"
export KATALOG_KLYUCHEJ="$D/klyuchi"
# B-N-1621 k2: подставной помощник доступа — пишет каждый вызов в журнал, отвечает кодом из $D/svesti.kod
mkdir -p "$D/bin"; printf '0\n' > "$D/svesti.kod"
cat > "$D/bin/svesti" <<'SV'
#!/usr/bin/env bash
echo "$*" >> "$(dirname "$0")/../svesti.log"; echo "подставной svesti $*"; exit "$(cat "$(dirname "$0")/../svesti.kod")"
SV
chmod 755 "$D/bin/svesti"; export SVYAZKI_SVESTI="$D/bin/svesti"
zov(){ local n; n=$(grep -c -- "^$1\$" "$D/svesti.log" 2>/dev/null); echo "${n:-0}"; }   # не «|| echo 0»: grep -c при нуле печатает 0 И код 1
sbros(){ : > "$D/svesti.log"; }

reestr(){ cat > "$D/agents.yaml" <<EOF
agenty:
  - imya: agent-a
    namerenie:
      polzovatel: agent-a
      podpiska: $1
  - imya: agent-b
    namerenie:
      polzovatel: agent-b
      podpiska: ~
EOF
}

echo "предмет: $INSTR ($(sha256sum "$INSTR" | cut -c1-16))"
echo "подставной реестр: $AGENTS_REGISTRY | подставной каталог ключей: $KATALOG_KLYUCHEJ"
echo

# ── раздел 1: ключ есть, env есть ────────────────────────────────────────────
reestr kl-1
: > "$D/klyuchi/token-kl-1"
printf 'GATEWAY_PORT=9001\n' > "$D/klyuchi/instance-agent-a.env"

sbros; v=$("$INSTR" razlozhit 2>&1); k=$?
[ "$k" = 0 ] && sud ok "сухой прогон: код 0" || sud fail "сухой прогон: код $k"
[ ! -s "$D/svesti.log" ] && sud ok "сухой прогон помощника не звал" || sud fail "сухой прогон звал помощника" "$(cat "$D/svesti.log")"
grep -q 'будет записано' <<<"$v" && sud ok "сухой прогон объявляет, что БУДЕТ" || sud fail "сухой прогон молчит о намерении"
grep -q 'GATEWAY_TOKEN_FILE' "$D/klyuchi/instance-agent-a.env" && sud fail "сухой прогон ЗАПИСАЛ (не должен)" || sud ok "сухой прогон ничего не записал"

sbros; v=$("$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" = 0 ] && sud ok "установка: код 0" || sud fail "установка: код $k"
[ "$(zov --dobavit)" = 1 ] && sud ok "установка: помощник позван ровно раз --dobavit" || sud fail "установка: --dobavit вызовов $(zov --dobavit)" "$(cat "$D/svesti.log")"
[ "$(zov --svesti)" = 0 ] && sud ok "установка: --svesti НЕ позван (живой читает прежний)" || sud fail "установка: --svesti позван до перезапуска"
grep -q 'После перезапуска экземпляра: sudo .* --svesti' <<<"$v" && sud ok "сказано вслух: --svesti после перезапуска" || sud fail "молчит про --svesti после перезапуска"
grep -q "GATEWAY_TOKEN_FILE=$D/klyuchi/token-kl-1" "$D/klyuchi/instance-agent-a.env" \
  && sud ok "строка записана и указывает на файл ключа" || sud fail "строки нет или путь не тот"
grep -q 'вступит в силу при СЛЕДУЮЩЕМ' <<<"$v" \
  && sud ok "сказано вслух: нужен перезапуск" || sud fail "молчит про перезапуск"

# повторный прогон не должен плодить строки
sbros; "$INSTR" razlozhit --ustanovit >/dev/null 2>&1
[ ! -s "$D/svesti.log" ] && sud ok "повтор без изменений помощника не звал" || sud fail "повтор без изменений звал помощника" "$(cat "$D/svesti.log")"
n=$(grep -c '^GATEWAY_TOKEN_FILE=' "$D/klyuchi/instance-agent-a.env")
[ "$n" = 1 ] && sud ok "повторный прогон не множит строку" "строк $n" || sud fail "строк GATEWAY_TOKEN_FILE: $n"

# ── раздел 2: агент без подписки не трогается ────────────────────────────────
[ -f "$D/klyuchi/instance-agent-b.env" ] \
  && sud fail "агенту без подписки создан env" || sud ok "агент без подписки не тронут"
"$INSTR" razlozhit --ustanovit 2>&1 | grep -q 'agent-b.*подписки нет' \
  && sud ok "про агента без подписки сказано вслух" || sud fail "агент без подписки пропущен молча"

# ── раздел 3: опечатка в имени ключа ─────────────────────────────────────────
etalon=$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)
reestr kl-NETU
v=$("$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" != 0 ] && sud ok "опечатка: код $k (не ноль)" || sud fail "опечатка прошла кодом 0"
grep -q 'ОТКАЗ' <<<"$v" && sud ok "опечатка: отказ ГРОМКИЙ" || sud fail "опечатка: отказ тихий"
posle=$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)
[ "$etalon" = "$posle" ] && sud ok "опечатка: env НЕ тронут" || sud fail "опечатка испортила env"

# ── раздел 5 (B-N-1621 k2): помощник не выдал доступ → env возвращён, отказ ──
reestr kl-2; : > "$D/klyuchi/token-kl-2"
do5=$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)
printf '1\n' > "$D/svesti.kod"; echo "  ПОРЧА: подставной svesti отвечает кодом $(cat "$D/svesti.kod")"
v=$("$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" = 2 ] && grep -q 'ОТКАЗ.*--dobavit код 1' <<<"$v" && sud ok "помощник не выдал: ОТКАЗ код 2" || sud fail "помощник не выдал: код $k" "$(tail -c 200 <<<"$v")"
[ "$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)" = "$do5" ] && sud ok "помощник не выдал: env возвращён побайтно" || sud fail "помощник не выдал: env ИЗМЕНЁН"
printf '0\n' > "$D/svesti.kod"; v=$("$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" = 0 ] && grep -q "GATEWAY_TOKEN_FILE=$D/klyuchi/token-kl-2" "$D/klyuchi/instance-agent-a.env" && sud ok "возврат: помощник выдал → записано kl-2, код 0" || sud fail "возврат: код $k"
reestr kl-1; do6=$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)
v=$(SVYAZKI_SVESTI="$D/bin/netu" "$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" = 2 ] && [ "$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)" = "$do6" ] && sud ok "помощника нет: ОТКАЗ код 2, env возвращён" || sud fail "помощника нет: код $k" "$(tail -c 200 <<<"$v")"
sbros; v=$(env -u SVYAZKI_SVESTI "$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" = 2 ] && [ ! -s "$D/svesti.log" ] && [ "$(sha256sum "$D/klyuchi/instance-agent-a.env" | cut -d' ' -f1)" = "$do6" ] && sud ok "каталог подменён без помощника: ОТКАЗ до записей" || sud fail "каталог подменён без помощника: код $k" "$(tail -c 200 <<<"$v")"

# ── раздел 4: нет файла настроек экземпляра ──────────────────────────────────
reestr kl-1
rm -f "$D/klyuchi/instance-agent-a.env"
v=$("$INSTR" razlozhit --ustanovit 2>&1); k=$?
[ "$k" != 0 ] && grep -q 'ОТКАЗ' <<<"$v" \
  && sud ok "нет env экземпляра: громкий отказ, код $k" || sud fail "нет env: тихо или код 0"

echo
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
vsego=$((ok+bad+slep))
if [ "$vsego" != "$ZHDYOM_PROVEROK" ]; then
  echo "🔴 КАНАРЕЙКА: проверок $vsego, а стенд состоит из $ZHDYOM_PROVEROK — часть не исполнилась"
  exit 2
fi
[ "$bad" != 0 ] && exit 1
[ "$slep" != 0 ] && exit 2
exit 0
