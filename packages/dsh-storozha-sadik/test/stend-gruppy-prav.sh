#!/bin/bash
# Стенд gruppy-prav-watch (B-N-1913, Аврора): подставные /etc/group, /etc/passwd, sysusers.d — копии живых, живые не трогаются.
# Порча печатает факт внесения (число строк-образцов). Коды стенда: 0 — все ожидания сошлись; 1 — расхождение; 2 — не собран (нет проверки/эталона или машина не sadik).
# Довод: путь к проверке (по умолчанию — соседний ../libexec/gruppy-prav-watch), путь к эталону (../etc/gruppy-prav.conf).
set -u
Z=$(cd "$(dirname "$0")/.." && pwd)
W=${1:-$Z/libexec/gruppy-prav-watch}; C=${2:-$Z/etc/gruppy-prav.conf}
[ -x "$W" ] && [ -r "$C" ] || { echo "СТЕНД НЕ СОБРАН: нет $W или $C"; exit 2; }
T=$(mktemp -d /tmp/stend-gruppy-prav.XXXXXX) || exit 2; trap 'rm -rf -- "${T:?}"' EXIT
zalozhit() { cp /etc/group "$T/group"; cp /etc/passwd "$T/passwd"; rm -rf "$T/su"; mkdir "$T/su"; cp /etc/sysusers.d/*.conf "$T/su/" 2>/dev/null; }
progon() { GRUPPY_PRAV_CONF="$C" GRUPPY_PRAV_GROUP="$T/group" GRUPPY_PRAV_PASSWD="$T/passwd" GRUPPY_PRAV_SYSUSERS="$T/su" /usr/bin/python3 -ISB "$W" > "$T/out" 2>&1; echo $?; }
# Стенд — машинный: порчи бьют по группам и учёткам sadik. Нет их в копиях живых файлов — стенд не собран (код 2 с
# перечнем), а не «расхождение» (1): на чужой машине без групп dsh-limity и учёток sadik семь проб покраснели бы ложно.
zalozhit; net=()
for g in limity-vhod agent-button claudeoauth; do grep -q "^$g:" "$T/group" || net+=("группы $g"); done
for u in varvara limity-ds; do grep -q "^$u:" "$T/passwd" || net+=("учётки $u"); done
grep -qE '^limity-vhod:x:[0-9]+:limity-ds,' "$T/group" || net+=("limity-ds первым членом limity-vhod")
[ -f "$T/su/dsh-limity.conf" ] || net+=("sysusers dsh-limity.conf")
[ ${#net[@]} -eq 0 ] || { printf -v spisok '%s; ' "${net[@]}"; echo "СТЕНД НЕ СОБРАН: на машине нет: ${spisok%; } (стенд — только для sadik с dsh-limity)"; exit 2; }
plohih=0
ozhid() { # имя ждём_код образец_строки
  local k; k=$(progon); local ok=1
  [ "$k" = "$2" ] || ok=0
  [ -z "$3" ] || grep -qF -- "$3" "$T/out" || ok=0
  if [ $ok = 1 ]; then echo "  ✅ $1: код $k${3:+ · «$3»}"; else echo "  ❌ $1: код $k (ждали $2${3:+, «$3»})"; sed 's/^/       /' "$T/out" | head -6; plohih=$((plohih+1)); fi
  echo "       состав: $(grep '^СОСТАВ:' "$T/out")"
}
zalozhit; ozhid 'исправное (копии живых)' 0 ''
zalozhit; sed -i -E 's/^(limity-vhod:x:[0-9]+:.*)$/\1,nobody/' "$T/group"; echo "     внесено: limity-vhod с nobody — строк $(grep -cE '^limity-vhod:.*nobody' "$T/group")"
ozhid 'порча: nobody в limity-vhod' 1 'ЛИШНИЙ nobody в limity-vhod'
zalozhit; G986=$(awk -F: '$1=="claudeoauth"{print $3}' "$T/group"); sed -i -E "s/^(varvara:x:[0-9]+:)[0-9]+:/\1$G986:/" "$T/passwd"; echo "     внесено: varvara с основной группой $G986 — строк $(awk -F: -v g="$G986" '$1=="varvara" && $4==g' "$T/passwd" | wc -l)"
ozhid 'порча: гость с основной группой claudeoauth' 1 'ЛИШНИЙ varvara в claudeoauth (основная группа'
zalozhit; sed -i -E 's/^(limity-vhod:x:[0-9]+:)limity-ds,/\1/' "$T/group"; echo "     внесено: limity-ds в limity-vhod — строк $(grep -cE '^limity-vhod:.*limity-ds' "$T/group") (ждали 0)"
ozhid 'порча: штатный писатель выпал' 1 'НЕДОСТАЁТ limity-ds в limity-vhod'
zalozhit; sed -i -E 's/^(agent-button:x:[0-9]+:.*)$/\1,proba-b1913/' "$T/group"; echo "     внесено: agent-button с proba-b1913 — строк $(grep -cE '^agent-button:.*proba-b1913' "$T/group")"
ozhid 'порча: лишний в agent-button (эталон spisok)' 1 'ЛИШНИЙ proba-b1913 в agent-button'
zalozhit; rm -f "$T/su/dsh-limity.conf"; echo "     внесено: dsh-limity.conf в подставном sysusers — $(ls "$T/su" | grep -c dsh-limity) (ждали 0)"
ozhid 'порча: объявление в sysusers пропало' 2 'СЛЕПОТА: limity-vhod'
# A-N-1948 №5 (№21а, №21б, №22; Искра, 10.10.2026)
zalozhit; sed -i -E 's/^(claudeoauth:x:[0-9]+:)$/\1claudeoauth/' "$T/group"; echo "     внесено: claudeoauth дополнительным членом claudeoauth — строк $(grep -cE '^claudeoauth:x:[0-9]+:claudeoauth$' "$T/group")"
if [ "$(grep -cE '^claudeoauth:x:[0-9]+:claudeoauth$' "$T/group")" = 1 ]; then ozhid '№21а хозяин дополнительным членом своей группы — не лишний' 0 ''
else echo "  ❌ №21а: порча не внесена (у claudeoauth в копии уже есть члены) — проба не судима"; plohih=$((plohih+1)); fi
zalozhit; C0=$C; C=$T/conf-dubl; { cat "$C0"; grep -m1 -E '^claudeoauth ' "$C0"; } > "$C"; echo "     внесено: повтор группы claudeoauth в эталоне — строк $(grep -cE '^claudeoauth ' "$C")"
ozhid '№21б повтор группы в эталоне — слепота с номером строки' 2 'уже задана строкой'; C=$C0
zalozhit; echo 'stend-b22:x:59999:' >> "$T/group"; C0=$C; C=$T/conf-b22; printf 'stend-b22 sysusers\n' > "$C"
k=$(GRUPPY_PRAV_CONF="$C" GRUPPY_PRAV_GROUP="$T/group" GRUPPY_PRAV_PASSWD="$T/passwd" /usr/bin/python3 -ISB "$W" 2>&1); C=$C0
if printf '%s' "$k" | grep -qF '/run/sysusers.d' && printf '%s' "$k" | grep -qF '/usr/local/lib/sysusers.d'; then echo "  ✅ №22 умолчание каталогов sysusers — /run и /usr/local/lib есть"
else echo "  ❌ №22 умолчание каталогов sysusers без /run или /usr/local/lib: $(printf '%s' "$k" | grep -m1 СЛЕПОТА)"; plohih=$((plohih+1)); fi
zalozhit; ozhid 'возврат' 0 ''
echo "ИТОГ: расхождений с ожиданием $plohih"; [ $plohih -eq 0 ]
