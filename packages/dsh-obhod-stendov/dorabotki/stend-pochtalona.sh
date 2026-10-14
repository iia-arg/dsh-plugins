#!/usr/bin/env bash
# 🔴 B-N-1115 (27.09.2026, Искра): ПОДМЕНЫ ВНУТРИ СТЕНДА. Почтальон после удачного переноса зовёт
#    `sudo -u <получатель> $A2A_TELL_BIN` (по умолчанию НАСТОЯЩИЙ /usr/local/bin/tell-owner ⇒ сообщение
#    ВЛАДЕЛЬЦУ в Telegram) и `$A2A_REESTR_BIN kto`. Прежде стенд их не задавал (B-N-866 — только запрет в
#    шапке): ручной прогон слал владельцу «← от dsh: проба». Теперь:
#    — заглушки tell и реестра лежат в $RAB/bin, почтальон зовётся ТОЛЬКО функцией pochtalon(), которая
#      передаёт A2A_KOREN, A2A_TELL_BIN и A2A_REESTR_BIN явно в каждый вызов (и под sudo, и без);
#    — ПРЕДОХРАНИТЕЛЬ ДО ПЕРВОГО ВЫЗОВА: почтальон обязан читать подмену именно из A2A_TELL_BIN и
#      A2A_REESTR_BIN (переименованная переменная = подмена не дойдёт = настоящий tell-owner), а обе
#      заглушки — лежать внутри $RAB. Нет — СЛЕПОТА (2), почтальон не зван ни разу;
#    — ОСТАНОВ ПОСЛЕ ПЕРВОГО ПЕРЕНОСА: заглушка tell не позвана — уведомление ушло мимо неё; дальше
#      почтальон не зовётся (СЛЕПОТА 2). Граница: такой промах стоит не больше ОДНОГО настоящего сообщения.
#    ⚠️ НЕ ЛОВИТ: вызов почтальона мимо pochtalon() (новая строка, написанная рукой) и tell, который
#      почтальон начнёт брать не из окружения (свой путь в коде) — это видно только по останову.
# ПРИЁМКА ПОЧТАЛЬОНА ШИНЫ A2A.
#
# Гоняет УСТАНОВЛЕННЫЙ файл, а не копию: копия расходится с боевым молча, и тогда
# стенд отвечает про свою редакцию, а не про ту, что работает.
#
# 🔴 ГДЕ ЭТОТ СТЕНД НЕ ПРИМЕНЯЕТСЯ — назвать обязательно, иначе зелёный прочтут шире:
# — не трогает БОЕВЫЕ ящики /var/spool/a2a: всё на своём временном корне. Значит он
#   НЕ говорит, что боевая почта разносится — это показывает журнал службы;
# — не проверяет таймер и службу: только сам разносчик. Живость таймера — сторож машины;
# — не проверяет, что письмо дошло до ХОДА агента: это модуль связи, другой предмет;
# — требует sudo: почтальон меняет владельца, а это умеет только root. Рукой без права
#   на sudo стенд отвечает СЛЕПОТОЙ (код 2), а не отказом — он не измерил, а не нашёл беду;
# — не воспроизводит десять агентов: замер на двух ящиках, как на машине сегодня.
set -u

POCHTALON="${POCHTALON:-/usr/local/sbin/a2a-pochtalon.py}"
ZHDYOM_PROVEROK=22   # канарейка: точное число, не «не меньше». Порог вместо точного  # B-N-1502: +5 (раздел 6)
                     # числа слеп к убыли ровно того размера, что умещается в запас.

ok=0; fail=0; slep=0
sud() { case "$1" in ok) ok=$((ok+1)); echo "  ok    $2";; fail) fail=$((fail+1)); echo "  FAIL  $2";; slep) slep=$((slep+1)); echo "  СЛЕПОТА $2";; esac; }

if ! sudo -n true 2>/dev/null; then
  echo "СЛЕПОТА: нет права sudo — почтальону нужен root, измерить нечем"; exit 2
fi
[ -x "$POCHTALON" ] || { echo "СЛЕПОТА: нет $POCHTALON"; exit 2; }

RAB=$(mktemp -d /tmp/stend-pochta.XXXXXX)
chmod 711 "$RAB"   # иначе отправитель не ВОЙДЁТ в путь к ящику: каталог открыт,
                    # а дорога к нему закрыта — беда, которую видно только действием
trap 'sudo -n chattr -i "$RAB/koren/iskra" 2>/dev/null; sudo -n rm -rf "$RAB"' EXIT

# B-N-1115: заглушки. tell зовётся почтальоном ОТ ИМЕНИ ПОЛУЧАТЕЛЯ (sudo -u iskra) — поэтому bin 755,
# а журнал звонков открыт на запись всем (он внутри $RAB и уходит с ним).
mkdir -p "$RAB/bin"; chmod 755 "$RAB/bin"
TELL="$RAB/bin/tell-stend"; REESTR="$RAB/bin/reestr-stend"; ZVONKI="$RAB/tell-zvonki"
: > "$ZVONKI"; chmod 666 "$ZVONKI"
# B-N-1502: у почтальона появился второй выход наружу — тревога машины. Без подмены прогон шлёт НАСТОЯЩИЕ тревоги
# владельцу (так и случилось 03.10 19:03Z на старой редакции стенда). Подмена обязательна, как у tell.
TREVOGA="$RAB/bin/trevoga-stend"; TREVOGI="$RAB/trevogi"; : > "$TREVOGI"; chmod 666 "$TREVOGI"
printf '#!/bin/sh\ncat >> %s\nexit 0\n' "'$TREVOGI'" > "$TREVOGA"
printf '#!/bin/sh\n{ printf "ЗВАН uid=%%s: " "$(id -u)"; cat; printf "\\n"; } >> %s\nexit 0\n' "'$ZVONKI'" > "$TELL"
printf '#!/bin/sh\n[ "$1" = kto ] && { echo "stend-$2"; exit 0; }\nexit 1\n' > "$REESTR"
chmod 755 "$TELL" "$REESTR" "$TREVOGA"
pochtalon() {   # ЕДИНСТВЕННЫЙ способ позвать почтальона в этом стенде; $1 = sudo | bez-sudo
  if [ "$1" = sudo ]; then
    sudo -n env A2A_KOREN="$RAB/koren" A2A_TELL_BIN="$TELL" A2A_REESTR_BIN="$REESTR" A2A_ALERT_BIN="$TREVOGA" "$POCHTALON"
  else
    env A2A_KOREN="$RAB/koren" A2A_TELL_BIN="$TELL" A2A_REESTR_BIN="$REESTR" A2A_ALERT_BIN="$TREVOGA" "$POCHTALON"
  fi
}
# ПРЕДОХРАНИТЕЛЬ ДО ПЕРВОГО ВЫЗОВА (почтальон ещё не зван ни разу)
grep -qF 'os.environ.get("A2A_TELL_BIN"' "$POCHTALON" && grep -qF 'os.environ.get("A2A_REESTR_BIN"' "$POCHTALON" \
  || { echo "СЛЕПОТА: ПРЕДОХРАНИТЕЛЬ — почтальон не читает A2A_TELL_BIN/A2A_REESTR_BIN: подмена не дойдёт, позвался бы НАСТОЯЩИЙ tell-owner; почтальон не зван"; exit 2; }
case "$TELL$REESTR" in "$RAB"/bin/*"$RAB"/bin/*) ;; *) echo "СЛЕПОТА: ПРЕДОХРАНИТЕЛЬ — заглушки вне $RAB; почтальон не зван"; exit 2 ;; esac
[ -x "$TELL" ] && [ -x "$REESTR" ] || { echo "СЛЕПОТА: ПРЕДОХРАНИТЕЛЬ — заглушки не исполнимы; почтальон не зван"; exit 2; }

echo "== 1. предмет и его границы =="
grep -q 'ЧЕГО ПОЧТАЛЬОН НЕ ДЕЛАЕТ' "$POCHTALON" && sud ok "границы названы в шапке" || sud fail "границ в шапке нет"
grep -q 'O_NOFOLLOW' "$POCHTALON" && sud ok "открытие без следования симлинкам" || sud fail "O_NOFOLLOW пропал — симлинк уведёт chown"
grep -q 'os.replace' "$POCHTALON" && sud ok "замена атомарной операцией" || sud fail "os.replace пропал"
grep -q 'fchown' "$POCHTALON" && sud ok "владелец ставится по дескриптору" || sud fail "fchown пропал — правка по имени уязвима"

echo "== 2. перенос на подставном корне =="
mkdir -p "$RAB/koren/iskra"
sudo -n chown iskra:a2a-pochta "$RAB/koren/iskra"; sudo -n chmod 1730 "$RAB/koren/iskra"
PISMO="20261003T000000Z-petrovich-1a2b3c4d.txt"   # B-N-1502: формат курьера a2a-send (имя + конверт delivery-v1)
KONV="[delivery-v1 id=$(printf 'ab%.0s' $(seq 32)) reply=no]"
sudo -n -u petrovich bash -c "umask 077; printf '%s\nпроба\n' '$KONV' > $RAB/koren/iskra/$PISMO"
I_DO=$(sudo -n stat -c %i "$RAB/koren/iskra/$PISMO")
pochtalon sudo >"$RAB/vyvod" 2>&1; KOD=$?
if [ ! -e "$RAB/koren/iskra/$PISMO" ] && ! grep -qF "перенесено" "$RAB/vyvod"; then
  sud fail "письмо не легло в подставной ящик — проверять нечего, зелёное было бы пустым"
elif [ "$KOD" = 0 ]; then sud ok "прогон без отказов даёт 0"
else sud fail "прогон дал код $KOD"; fi
VLAD=$(sudo -n stat -c %U "$RAB/koren/iskra/$PISMO")
[ "$VLAD" = iskra ] && sud ok "владельцем стал получатель" || sud fail "владелец $VLAD, а нужен iskra"
REZH=$(sudo -n stat -c %a "$RAB/koren/iskra/$PISMO")
[ "$REZH" = 600 ] && sud ok "режим письма 600" || sud fail "режим $REZH, чужой прочтёт"
I_POSLE=$(sudo -n stat -c %i "$RAB/koren/iskra/$PISMO")
[ "$I_DO" != "$I_POSLE" ] && sud ok "inode сменился: копия, не смена владельца исходника" || sud fail "inode тот же — отправитель правит письмо после проверки"
SODER=$(sudo -n cat "$RAB/koren/iskra/$PISMO")
[ "$SODER" = "$KONV"$'\n'"проба" ] && sud ok "содержимое дошло целым" || sud fail "содержимое: '$SODER'"
grep -qF 'перенесено получателю' "$RAB/vyvod" && sud ok "журнал называет перенос" || sud fail "журнала о переносе нет"
# B-N-1115: уведомление владельцу ушло В ЗАГЛУШКУ, от имени получателя и с текстом письма.
if grep -qF 'ЗВАН uid=' "$ZVONKI"; then
  [ "$(grep -c 'ЗВАН uid=' "$ZVONKI")" = 1 ] && grep -qF "ЗВАН uid=$(id -u iskra): ← от stend-petrovich: проба" "$ZVONKI" \
    && sud ok "уведомление — в заглушку tell, одно, от получателя, с текстом" \
    || sud fail "заглушка tell звана не так: $(tr '\n' ' ' < "$ZVONKI")"
else
  # ОСТАНОВ: перенос был, а заглушка молчит — уведомление ушло МИМО подмены. Дальше почтальон не зовётся.
  echo "СЛЕПОТА: ОСТАНОВ — после переноса заглушка tell не звана: подмена не дошла, уведомление ушло мимо неё; пробы 3–5 не гоняю"
  exit 2
fi

echo "== 3. чего переносить нельзя =="
sudo -n -u petrovich ln -s /etc/shadow "$RAB/koren/iskra/ssylka.txt"
pochtalon sudo >"$RAB/vyvod2" 2>&1
SH=$(sudo -n stat -c %U /etc/shadow)
[ "$SH" = root ] && sud ok "симлинк не увёл владельца чужого файла" || sud fail "🔴 /etc/shadow достался $SH"
sudo -n test -L "$RAB/koren/iskra/ssylka.txt" && sud ok "симлинк оставлен как есть" || sud fail "симлинк тронут"
grep -qF 'не обычный файл' "$RAB/vyvod2" && sud ok "отказ по симлинку назван" || sud fail "симлинк пропущен молча"

echo "== 4. письмо не теряется при отказе =="
OTKAZ="20261003T000001Z-petrovich-5e6f7a8b.txt"
sudo -n -u petrovich bash -c "umask 077; printf '%s\nцело\n' '$KONV' > $RAB/koren/iskra/$OTKAZ"
sudo -n chattr +i "$RAB/koren/iskra" 2>/dev/null
pochtalon sudo >"$RAB/vyvod3" 2>&1
sudo -n chattr -i "$RAB/koren/iskra" 2>/dev/null
sudo -n test -f "$RAB/koren/iskra/$OTKAZ" && sud ok "письмо при отказе ОСТАВЛЕНО" || sud fail "🔴 письмо исчезло при отказе"
grep -qF 'ОСТАВЛЕНО, не потеряно' "$RAB/vyvod3" && sud ok "отказ назван вслух" || sud fail "отказ молчит"

echo "== 6. не-письмо: содержимое не показано и не передано (B-N-1502) =="
SEKRET="SEKRET-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
sudo -n -u petrovich bash -c "umask 077; printf '{\"token\": \"%s\"}\n' '$SEKRET' > $RAB/koren/iskra/creds.json"
IMYA_SHA=$(printf '%s' 'creds.json' | sha256sum | cut -d ' ' -f1)
NEPISMO_UID=$(sudo -n stat -c %u "$RAB/koren/iskra/creds.json")
NEPISMO_SUM=$(sudo -n sha256sum "$RAB/koren/iskra/creds.json" | cut -d ' ' -f1)
: > "$ZVONKI"
pochtalon sudo >"$RAB/vyvod6" 2>&1
grep -qF "$SEKRET" "$ZVONKI" && sud fail "🔴 значение секрета ушло в чат владельца" || sud ok "значение секрета в чат НЕ ушло (сверка по тексту заглушки tell)"
grep -qF "$SEKRET" "$TREVOGI" && sud fail "🔴 значение секрета ушло в тревогу" || sud ok "значение секрета в тревогу НЕ ушло"
grep -qF "лёг не-письмо creds.json," "$ZVONKI" && sud ok "владельцу — строка «лёг не-письмо creds.json»" || sud fail "строки владельцу нет: $(tr '\n' ' ' < "$ZVONKI")"
grep -qF "лёг не-письмо creds.json," "$TREVOGI" && sud ok "тревога машины ушла (в заглушку)" || sud fail "тревоги нет"
# A-N-1948-m08: отложенное имя содержит SHA256 ИМЕНИ, не исходное имя и не сумму содержимого.
if NEPISMO_OTVET=$(sudo -n python3 - "$RAB/koren/iskra" "$IMYA_SHA" "$NEPISMO_UID" "$NEPISMO_SUM" 2>&1 <<'PY_NE_PISMO'
import hashlib, os, pathlib, re, stat, sys
root = pathlib.Path(sys.argv[1]); expected_uid = int(sys.argv[3])
pattern = re.compile(r'\.ne-pismo-[0-9]+-[0-9]+-' + re.escape(sys.argv[2]))
files = [path for path in root.iterdir() if pattern.fullmatch(path.name)]
if len(files) != 1: sys.exit('жду один файл с SHA256 имени creds.json, найдено ' + str(len(files)))
if os.path.lexists(root / 'creds.json'): sys.exit('исходное не-письмо осталось на месте')
st = files[0].lstat()
if not stat.S_ISREG(st.st_mode): sys.exit('отложенный предмет не обычный файл')
if st.st_uid != expected_uid: sys.exit('владелец отложенного uid ' + str(st.st_uid) + ', жду прежний ' + str(expected_uid))
if hashlib.sha256(files[0].read_bytes()).hexdigest() != sys.argv[4]: sys.exit('содержимое отложенного не совпало с исходным')
PY_NE_PISMO
); then
  sud ok "не передан: отложен по SHA256 имени, содержимое и владелец прежние"
else
  sud fail "не-письмо передано или не отложено: $NEPISMO_OTVET"
fi

echo "== 5. слепота отделена от отказа =="
pochtalon bez-sudo >/dev/null 2>&1; KOD_NE_ROOT=$?
[ "$KOD_NE_ROOT" = 2 ] && sud ok "не root -> слепота (2), а не тихий успех" || sud fail "не root дал код $KOD_NE_ROOT"

VSEGO=$((ok+fail+slep))
echo
echo "ИТОГО: сошлось $ok, расхождений $fail, слепоты $slep"
if [ "$VSEGO" -ne "$ZHDYOM_PROVEROK" ]; then
  echo "🔴 КАНАРЕЙКА: проверок $VSEGO, а ждали $ZHDYOM_PROVEROK — часть не состоялась"; exit 2
fi
[ "$fail" -gt 0 ] && exit 1
[ "$slep" -gt 0 ] && exit 2
exit 0
