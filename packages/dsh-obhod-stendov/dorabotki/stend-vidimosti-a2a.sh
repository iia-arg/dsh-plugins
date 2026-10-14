#!/usr/bin/env bash
# СТЕНД: видимость переписки A2A владельцу (шаг 3 шины).
#
# ЧТО ПРОВЕРЯЕТ. Что при письме от агента к агенту владелец видит ОБЕ стороны:
# «→ кому» в чате отправителя и «← от кого» в чате получателя. И что видимость
# не отменяет доставку, не гасится отправителем и не врёт числами при обрезке.
#
# 🔴 ГДЕ СТЕНД НЕ ПРИМЕНЯЕТСЯ (границы охвата)
# — не проверяет, что сообщение ДОШЛО до Телеграма: tell-owner подменяется
#   заглушкой, иначе каждый прогон тревожил бы человека. Доказательство
#   доставки в телеграм — только боевая проба рукой, она разовая;
# — не проверяет, что письмо попало в ХОД получателя: это дело модуля связи,
#   а он новый ящик пока не читает;
# — не проверяет боевые ящики: работает на своём корне во временном каталоге;
# — не проверяет поведение при нескольких получателях сразу: у нас их два;
# — не судит о содержимом письма: шина не читает смысл.
#
# 🔴 ЧЕЛОВЕКУ НЕ ПИШЕТ НИ РАЗУ. Заглушка вместо tell-owner — обязательна,
# иначе приёмка означала бы полтора десятка сообщений владельцу за прогон.
#
# КОДЫ: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось)
set -uo pipefail
export LC_ALL=C.UTF-8   # чтобы порядок и счёт не зависели от локали вызвавшего

ZHDYOM_PROVEROK=19      # канарейка: столько случаев в этом стенде

SEND="${STEND_SEND:-/usr/local/bin/a2a-send}"
PCHT="${STEND_PCHT:-/usr/local/sbin/a2a-pochtalon.py}"
# 🔴 ИМЯ АГЕНТА И СИСТЕМНЫЙ ПОЛЬЗОВАТЕЛЬ — РАЗНЫЕ ВЕЩИ, и стенд их не путает:
# a2a-send принимает имя агента, ящик зовётся по пользователю. Пользователь
# берётся ИЗ РЕЕСТРА, а не зашивается: свой перечень разошёлся бы с реестром.
POLUCHATEL="${STEND_POLUCHATEL:-petrovich}"
REESTR_BIN="${STEND_REESTR:-/usr/local/bin/agent-registry}"

ok=0; fail=0; slep=0
sud() {
  case "$1" in
    ok)   ok=$((ok+1));   printf '  ok   %s\n' "$2" ;;
    fail) fail=$((fail+1)); printf '  FAIL %s\n' "$2"; [ $# -ge 3 ] && printf '       сырьё: %s\n' "$3" ;;
    slep) slep=$((slep+1)); printf '  СЛЕПОТА %s\n' "$2" ;;
  esac
}

for f in "$SEND" "$PCHT"; do
  [ -r "$f" ] || { echo "СЛЕПОТА: не читается $f — стенд смотрит не туда"; exit 2; }
done
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нужен sudo без пароля (почтальон меняет владельца)"; exit 2; }
POLUCHATEL_POLZ="$("$REESTR_BIN" pole "$POLUCHATEL" polzovatel --json 2>/dev/null | tr -d '"')"
[ -n "$POLUCHATEL_POLZ" ] || { echo "СЛЕПОТА: в реестре нет агента $POLUCHATEL или у него нет пользователя"; exit 2; }
id -u "$POLUCHATEL_POLZ" >/dev/null 2>&1 || { echo "СЛЕПОТА: нет системного пользователя $POLUCHATEL_POLZ"; exit 2; }

RAB="$(mktemp -d /tmp/stend-vid.XXXXXX)" || { echo "СЛЕПОТА: mktemp не удался"; exit 2; }
# 🔴 mktemp даёт 700: отправитель не войдёт в ПУТЬ к ящику, и стенд покраснеет
# на исправном предмете. Каталог открыт по пути, ящики закрыты по правам.
chmod 755 "$RAB"
trap 'sudo -n rm -rf "$RAB" 2>/dev/null; rm -rf "$RAB" 2>/dev/null' EXIT

KOREN="$RAB/koren"
sudo -n mkdir -p "$KOREN/$POLUCHATEL_POLZ" || { echo "СЛЕПОТА: ящик не создан"; exit 2; }
sudo -n chown "$POLUCHATEL_POLZ:a2a-pochta" "$KOREN/$POLUCHATEL_POLZ"
sudo -n chmod 1730 "$KOREN/$POLUCHATEL_POLZ"
sudo -n chmod 755 "$KOREN"

CHAT="$RAB/chat"; mkdir -p "$CHAT"; chmod 777 "$CHAT"
TELL="$RAB/tell"
# B-N-863 (25.09.2026, Заря): журнал курьера — ПОДСТАВНОЙ. a2a-send пишет каждый вызов в системный журнал
# (logger -t a2a-send, зовёт по имени через timeout) — прогон стенда клал туда ложные «доставки» и «отказы».
# Подставной logger в $RAB/bin первым в PATH; почтальон (через sudo, PATH сбрасывается) в журнал не пишет.
# ⚠️ НЕ ЛОВИТ: если курьер начнёт звать /usr/bin/logger по полному пути — это поймает проверка «журнал подставной».
mkdir -p "$RAB/bin" && printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/zhurnal-kurera"\n' "$RAB" > "$RAB/bin/logger" \
  && chmod 755 "$RAB/bin" "$RAB/bin/logger" && : > "$RAB/zhurnal-kurera" && chmod 666 "$RAB/zhurnal-kurera" \
  || { echo "СЛЕПОТА: подставной журнал курьера не заведён"; exit 2; }
export PATH="$RAB/bin:$PATH"
cat > "$TELL" <<T
#!/bin/bash
# Заглушка ПАДАЕТ, если не смогла записать: заглушка с единственным исходом
# «успех» врёт ровно там, где стенд ищет правду.
zhurnal="$CHAT/\$(id -un).log"
msg="\$*"; [ -z "\$msg" ] && msg="\$(cat)"
if ! printf '%s\n---\n' "\$msg" >> "\$zhurnal" 2>/dev/null; then
  echo "заглушка: не записала в \$zhurnal" >&2; exit 9
fi
[ -n "\${TELL_KOD:-}" ] && exit "\$TELL_KOD"
exit 0
T
chmod 755 "$TELL"

# 🔴 B-N-1113 (27.09.2026, Искра): ПОДСТАВНОЙ РЕЕСТР — ИЗОЛЯЦИЯ ОТ БОЕВЫХ ЯЩИКОВ. a2a-send берёт ящик ИЗ РЕЕСТРА
# ПЕРВЫМ (kanal.yashchik), A2A_KOREN — только запасной путь. У petrovich с 26.09 16:25Z kanal.yashchik =
# /var/spool/a2a/dsh — БОЕВОЙ спул: прогон 27.09 01:0xZ положил туда 3 письма стенда, боевой почтальон отдал их
# Петровичу. Теперь курьер и почтальон стенда зовут ОБЁРТКУ: kanal.yashchik → $KOREN/<имя ящика>, прочее — боевой реестр.
# ⚠️ НЕ ЛОВИТ: курьер, который начнёт искать ящик НЕ через A2A_REESTR_BIN (свой разбор agents.yaml, другой ключ) —
# это ловит ПРЕДОХРАНИТЕЛЬ ниже (ящик вне $KOREN — ни одного письма) и остановка после первого письма.
# B-N-1492: этот стенд сохраняет старую sender-copy ветку; owner-all проверяется отдельно.
printf '%s\n' '{"deliveryMode":"personal"}' > "$RAB/mode-personal.json"
cat > "$RAB/bin/reestr-stend" <<R
#!/bin/bash
if [ "\${1:-}" = pole ] && [ "\${3:-}" = kanal ]; then
  "$REESTR_BIN" "\$@" | python3 -c 'import json,os,sys
d=json.load(sys.stdin)
if isinstance(d,dict) and d.get("yashchik"): d["yashchik"]=os.path.join(sys.argv[1], os.path.basename(d["yashchik"].rstrip("/")))
if isinstance(d,dict):
    d["nastrojka_dostavki"]=os.path.join(os.path.dirname(sys.argv[1]), "mode-personal.json")
    d["rezhim_dostavki"]="personal"
print(json.dumps(d,ensure_ascii=False))' "$KOREN"
  exit "\${PIPESTATUS[0]}"
fi
exec "$REESTR_BIN" "\$@"
R
chmod 755 "$RAB/bin/reestr-stend"
export A2A_REESTR_BIN="$RAB/bin/reestr-stend"
# ПРЕДОХРАНИТЕЛЬ ДО ПЕРВОГО ПИСЬМА: ящик получателя, как его увидит курьер, обязан лежать ВНУТРИ $KOREN.
cel="$("$A2A_REESTR_BIN" pole "$POLUCHATEL" kanal --json 2>/dev/null | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("yashchik") or "").strip())
except Exception: print("")' 2>/dev/null)"
case "$cel" in
  "") : ;;   # поля нет — курьер пойдёт по A2A_KOREN/<учётка>, это внутри корня
  "$KOREN"/*) : ;;
  *) echo "СЛЕПОТА: ПРЕДОХРАНИТЕЛЬ — ящик получателя $cel ВНЕ корня стенда $KOREN; ни одного письма не отправлено"; exit 2 ;;
esac

polozhit() {  # текст [ключ]
  # B-N-863: с 23.09 курьер отвергает голый довод («намерение не задано явно») — текст только через --text.
  sg a2a-pochta -c "PATH='$PATH' A2A_KOREN='$KOREN' A2A_REESTR_BIN='$A2A_REESTR_BIN' A2A_TELL_BIN='$TELL' '$SEND' $POLUCHATEL ${2:-} --text $(printf '%q' "$1")" 2>&1
}
raznesti() {  # [предел_в_чат]
  sudo -n A2A_KOREN="$KOREN" A2A_REESTR_BIN="$A2A_REESTR_BIN" A2A_TELL_BIN="$TELL" \
    ${1:+A2A_PREDEL_V_CHAT=$1} python3 "$PCHT" 2>&1
}
chat_ya()   { cat "$CHAT/$(id -un).log" 2>/dev/null; }
chat_ego()  { cat "$CHAT/$POLUCHATEL_POLZ.log" 2>/dev/null; }

echo "── 1. ОТПРАВКА"
out="$(polozhit 'первое письмо стенда')"
case "$out" in *"письмо"*"→ $POLUCHATEL"*) sud ok "письмо принято отправителем" ;;
  *) sud fail "письмо не отправилось" "$out" ;; esac

fajl="$(sudo -n ls -A "$KOREN/$POLUCHATEL_POLZ" | grep -v '^\.' | head -1)"
if [ -n "$fajl" ]; then
  prava="$(sudo -n stat -c '%a %U' "$KOREN/$POLUCHATEL_POLZ/$fajl")"
  case "$prava" in "600 $(id -un)") sud ok "письмо легло 600 и принадлежит отправителю (окно закрыто)" ;;
    *) sud fail "права письма до переноса" "$prava" ;; esac
else
  sud fail "письма нет в ящике" "пусто"
  # B-N-1113: первое письмо не легло в корень стенда — возможно, ушло МИМО него. Дальше не шлём ни одного.
  echo "🔴 ОСТАНОВ: первое письмо не найдено в $KOREN/$POLUCHATEL_POLZ — куда ушло, смотри строку курьера: $out"; exit 1
fi

case "$(chat_ya)" in *"→ $POLUCHATEL: первое письмо стенда"*)
    sud ok "в чате ОТПРАВИТЕЛЯ строка «→ кому»" ;;
  *) sud fail "нет строки «→ кому»" "$(chat_ya | head -2)" ;; esac

echo "── 2. ПЕРЕНОС И ВИДИМОСТЬ ПОЛУЧАТЕЛЮ"
out="$(raznesti)"
case "$out" in *"перенесено получателю"*) sud ok "почтальон перенёс письмо" ;;
  *) sud fail "перенос не состоялся" "$out" ;; esac
case "$out" in *"владельцу показано"*) sud ok "почтальон доложил о показе" ;;
  *) sud fail "нет строки о показе" "$out" ;; esac
case "$(chat_ego)" in *"← от"*"первое письмо стенда"*)
    sud ok "в чате ПОЛУЧАТЕЛЯ строка «← от кого»" ;;
  *) sud fail "нет строки «← от кого»" "$(chat_ego | head -2)" ;; esac

# 🔴 Главная проверка шага: ОДНО письмо → ОБЕ стороны. Половина видимости
# хуже её отсутствия: создаёт ложное чувство полноты.
if chat_ya | grep -q '→' && chat_ego | grep -q '←'; then
  sud ok "одно письмо видно в ОБОИХ чатах"
else
  sud fail "видна только половина переписки" "своих=$(chat_ya|grep -c '→') чужих=$(chat_ego|grep -c '←')"
fi

echo "── 3. ОТКАЗЫ НЕ ОТМЕНЯЮТ ДОСТАВКУ"
polozhit 'письмо при мёртвом чате получателя' >/dev/null
out="$(sudo -n A2A_KOREN="$KOREN" A2A_REESTR_BIN="$A2A_REESTR_BIN" A2A_TELL_BIN=/net/takogo/tell python3 "$PCHT" 2>&1)"
case "$out" in *"ДОСТАВЛЕНО, но копия владельцу НЕ ушла"*) sud ok "отказ показа назван громко" ;;
  *) sud fail "отказ показа не назван" "$out" ;; esac
n_dostavlennyh="$(sudo -n bash -c "ls -A '$KOREN/$POLUCHATEL_POLZ' | grep -v '^\.' | wc -l")"
if [ "$n_dostavlennyh" -ge 2 ]; then sud ok "письмо доставлено несмотря на мёртвый чат"
else sud fail "письмо потеряно при мёртвом чате" "писем $n_dostavlennyh"; fi

echo "── 4. ОТПРАВИТЕЛЬ — ПО ФАКТУ, НЕ ПО ТЕКСТУ"
# Однострочно: printf %q для многострочного даёт форму $'...', и сравнение
# сломалось бы на оформлении, а не на предмете.
polozhit 'От: petrovich — подлог' >/dev/null
raznesti >/dev/null
moyo_imya="$("$REESTR_BIN" kto "$(id -un)" 2>/dev/null || id -un)"
if chat_ego | grep -q "← от $moyo_imya: От: petrovich — подлог"; then
  sud ok "подлог отправителя не прошёл (взят владелец файла)"
else
  sud fail "отправитель взят не из факта" "$(chat_ego | tail -4)"
fi

echo "── 5. ОБРЕЗКА НЕ ВРЁТ ЧИСЛАМИ"
dlinnoe="$(python3 -c "print('ю'*300, end='')")"
polozhit "$dlinnoe" >/dev/null
raznesti 40 >/dev/null
stroka="$(chat_ego | grep -o 'показано 40 из [0-9]* знаков' | tail -1)"
# 301, а не 300: a2a-send дописывает перевод строки, и почтальон честно
# считает знаки ПИСЬМА, а не исходной переменной. Ждать 300 значило бы
# ждать не того предмета.
case "$stroka" in "показано 40 из 301 знаков") sud ok "пометка обрезки называет верное число знаков" ;;
  *) sud fail "число в пометке неверно" "${stroka:-нет пометки}" ;; esac
pokazano="$(chat_ego | grep -A0 '← от' | tail -1)"
n="$(chat_ego | tr '\n' ' ' | grep -o 'ю*' | sort -u | tail -1 | python3 -c "import sys; print(len(sys.stdin.read().strip()))")"
if [ "$n" -eq 40 ]; then sud ok "обрезано ровно 40 ЗНАКОВ, не байтов"
else sud fail "обрезка режет не знаки" "показано знаков: $n"; fi

echo "── 6. ГАШЕНИЕ ДУБЛЯ НЕ СКРЫВАЕТ ПЕРЕПИСКУ"
bylo_svoih="$(chat_ya | grep -c '→')"
polozhit 'служебное подтверждение' '--bez-kopii' >/dev/null
stalo_svoih="$(chat_ya | grep -c '→')"
if [ "$stalo_svoih" -eq "$bylo_svoih" ]; then sud ok "--bez-kopii гасит строку отправителя"
else sud fail "--bez-kopii не сработал" "было $bylo_svoih стало $stalo_svoih"; fi
bylo_ego="$(chat_ego | grep -c '←')"
raznesti >/dev/null
stalo_ego="$(chat_ego | grep -c '←')"
if [ "$stalo_ego" -gt "$bylo_ego" ]; then
  sud ok "получателю показано ВСЁ РАВНО: скрыть переписку от владельца нельзя"
else
  sud fail "отправитель погасил чужую видимость" "было $bylo_ego стало $stalo_ego"
fi

echo "── 7. ПРИВАТНОСТЬ ПЕРЕПИСКИ"
if grep -q 'input=soobshchenie' "$PCHT"; then
  sud ok "почтальон подаёт текст через stdin, не аргументом"
else
  sud fail "почтальон отдаёт текст письма аргументом (виден в cmdline и журнале sudo)" "нет input=soobshchenie"
fi
if grep -qE '\| *"\$TELL"' "$SEND"; then
  sud ok "a2a-send подаёт текст через stdin, не аргументом"
else
  sud fail "a2a-send отдаёт текст аргументом" "нет конвейера в TELL"
fi

echo "── 8. ГРОМКИЕ ОТКАЗЫ"
out="$(A2A_KOREN="$KOREN" A2A_TELL_BIN="$TELL" "$SEND" net-takogo-agenta --text 'текст' 2>&1)"
# Ключ agent-registry (A-N-1948 №8: a2a-zavesti/proba уже пишут «реестр отказал (код 3)» + agent-not-found) — узнаётся наравне с прежним текстом.
case "$out" in *"в реестре нет агента"*|*"agent-registry-error: agent-not-found"*) sud ok "несуществующий получатель — громкий отказ" ;;
  *) sud fail "получатель не проверен" "$out" ;; esac
out="$(printf '' | A2A_KOREN="$KOREN" A2A_TELL_BIN="$TELL" "$SEND" "$POLUCHATEL" 2>&1)"
case "$out" in *"пустое письмо"*) sud ok "пустое письмо не отправляется" ;;
  *) sud fail "пустое письмо ушло" "$out" ;; esac

echo "── 9. ЖУРНАЛ КУРЬЕРА — ПОДСТАВНОЙ (B-N-863)"
n_zh=$(grep -c 'a2a-send' "$RAB/zhurnal-kurera" 2>/dev/null); n_zh=${n_zh:-0}
if [ "$n_zh" -gt 0 ]; then sud ok "строки курьера ушли в стенд ($n_zh), не в системный журнал"
else sud fail "журнал курьера подставной" "в подставном журнале 0 строк — курьер пишет мимо (в бой?)"; fi

echo
vsego=$((ok+fail+slep))
printf 'ИТОГО: сошлось %d, расхождений %d, слепота %d\n' "$ok" "$fail" "$slep"
if [ "$vsego" -ne "$ZHDYOM_PROVEROK" ]; then
  # Канарейка: вырезанный кусок стенда не должен проходить успехом.
  printf '🔴 СЛЕПОТА: проверок прошло %d, а в стенде их %d — часть не состоялась\n' "$vsego" "$ZHDYOM_PROVEROK"
  exit 2
fi
[ "$slep" -gt 0 ] && exit 2
[ "$fail" -gt 0 ] && exit 1
exit 0
