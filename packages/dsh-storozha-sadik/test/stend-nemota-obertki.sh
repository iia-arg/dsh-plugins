#!/bin/bash
# СТЕНД «ПРИНЯТАЯ СУММА ОБЁРТКИ» блока NEMOTA сторожа sadik-watch (A-N-1948 модуль №5, находка №2; Искра, 10.10.2026).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/sadik-watch. Из НАСТОЯЩЕГО файла вынимается блок среза от «_nw="${SADIK_NEMOTA_OBERTKA»
#   до «printf "NEMOTA|» и гоняется в обвязке. Подстава в своём mktemp: копия обёртки (как в бою), профиль с runnerCommand (старый mtime),
#   пустой журнал, свой реестр с ОДНОЙ записью derevo, которая ставит копию и указывает метку dsh-gosti в дереве.
# Пробы: П1 копия = файл метки → «ok» · П2 порча копии (+1 строка) → красное с обеими суммами · П3 порча снята → «ok» ·
#   П4 в реестре нет записи → «не мерено» (nemer:), не красное и не ok · П5 метки нет → «не мерено» · П6 после порч реестра — снова «ok» · П7 адрес записи не корень дерева → «не мерено» (safe.directory — адрес, не «*»).
# Учётка: root (setpriv под varvara — проба песочницы блока). Коды: 0 — все пробы; 1 — красные; 2 — слепота.
# ЧЕГО НЕ ЛОВИТ: вызов блока юнитом (срез через snyat); MESTNO=0 (срез по ssh); прочие части блока (права, профиль, ledger) — только фоном.
set -u
# Доверие git к дереву чужой учётки — только то, что даёт сам предмет (-c safe.directory): без SUDO_* (git под sudo доверяет по SUDO_UID),
# такт — с GIT_CONFIG_NOSYSTEM=1 и HOME стенда (на sadik /etc/gitconfig уже доверяет дереву и скрыл бы разницу «*» ↔ адрес).
unset SUDO_UID SUDO_GID SUDO_USER SUDO_COMMAND
P="${1:-/usr/local/sbin/sadik-watch}"
REPO="${STEND_REPO:-/opt/iskra/workspace/dsh-plugins}"; METKA="${STEND_METKA:-dsh-gosti-v1.0.7}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (setpriv под varvara)"; exit 2; }
git -c safe.directory="$REPO" -C "$REPO" cat-file -e "$METKA:packages/dsh-gosti/bin/bwrap-bez-zhurnala" 2>/dev/null || { echo "СЛЕПОТА: в $REPO нет $METKA:packages/dsh-gosti/bin/bwrap-bez-zhurnala"; exit 2; }
T=$(mktemp -d /tmp/stend-nemota.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT; chmod 755 "$T"
blok=$(awk '/^  _nw="\$\{SADIK_NEMOTA_OBERTKA/{f=1} f{print} f && /^  printf "NEMOTA\|/{exit}' "$P")
printf '%s\n' "$blok" | grep -q '^  printf "NEMOTA|' || { echo "СЛЕПОТА: блока NEMOTA (от _nw= до printf NEMOTA) в $P нет"; exit 2; }
printf '%s\n' "$blok" > "$T/blok.sh"
git -c safe.directory="$REPO" -C "$REPO" show "$METKA:packages/dsh-gosti/bin/bwrap-bez-zhurnala" > "$T/obertka"; chmod 755 "$T/obertka"
printf 'runnerCommand: [/usr/local/bin/bwrap-bez-zhurnala]\n' > "$T/profil"; touch -d '2000-01-01' "$T/profil"; : > "$T/zhurnal"
reestr() { printf 'plugins:\n  - id: stend-gosti\n    derevo:\n      address: "%s"\n      ref: "%s"\n      subdir: packages/dsh-gosti\n      files:\n        - {local: "%s", remote: bin/bwrap-bez-zhurnala}\n' "${2:-$REPO}" "$1" "$T/obertka" > "$T/reestr.yaml"; }
takt() { ( S=; export GIT_CONFIG_NOSYSTEM=1 HOME="$T"; SADIK_NEMOTA_OBERTKA="$T/obertka" SADIK_NEMOTA_PROFIL="$T/profil" SADIK_NEMOTA_ZHURNAL="$T/zhurnal" SADIK_NEMOTA_REESTR="$T/reestr.yaml"
  export SADIK_NEMOTA_OBERTKA SADIK_NEMOTA_PROFIL SADIK_NEMOTA_ZHURNAL SADIK_NEMOTA_REESTR; . "$T/blok.sh" ) 2>&1 | grep '^NEMOTA|'; }
ok=0; bad=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1 — $3"; ok=$((ok+1)); else echo "❌ $1 — $3"; bad=$((bad+1)); fi; }
summa() { sha256sum "$1" | cut -c1-16; }
echo "== стенд принятой суммы обёртки: предмет $P ($(summa "$P")), метка $METKA, обёртка метки $(summa "$T/obertka")"
reestr "$METKA"
v=$(takt); case "$v" in "NEMOTA|ok|"*) r=0 ;; *) r=1 ;; esac; pr "П1 обёртка = файлу метки → ok" $r "$v"
d=$(summa "$T/obertka"); echo '# порча стенда' >> "$T/obertka"; echo "   порча внесена: обёртка $d → $(summa "$T/obertka")"
v=$(takt); case "$v" in *"сумма обёртки $(summa "$T/obertka") ≠ принятой ${d}"*) r=0 ;; *) r=1 ;; esac; pr "П2 порча обёртки → красное с обеими суммами" $r "$v"
git -c safe.directory="$REPO" -C "$REPO" show "$METKA:packages/dsh-gosti/bin/bwrap-bez-zhurnala" > "$T/obertka"; echo "   порча снята: обёртка $(summa "$T/obertka")"
v=$(takt); case "$v" in "NEMOTA|ok|"*) r=0 ;; *) r=1 ;; esac; pr "П3 порча снята → ok" $r "$v"
printf 'plugins: []\n' > "$T/reestr.yaml"; echo "   порча реестра: записей $(grep -c 'local:' "$T/reestr.yaml")"
v=$(takt); case "$v" in "NEMOTA|nemer:"*"записей реестра"*) r=0 ;; *) r=1 ;; esac; pr "П4 записи нет → не мерено" $r "$v"
reestr "${METKA}-net-takoj"; echo "   порча реестра: метка ${METKA}-net-takoj"
v=$(takt); case "$v" in "NEMOTA|nemer:"*"не прочитан"*) r=0 ;; *) r=1 ;; esac; pr "П5 метки нет → не мерено" $r "$v"
reestr "$METKA"
v=$(takt); case "$v" in "NEMOTA|ok|"*) r=0 ;; *) r=1 ;; esac; pr "П6 реестр восстановлен → ok" $r "$v"
# П7 (LOW Вениамина): адрес записи — не корень дерева (подкаталог packages) → git не доверяет найденному родительскому дереву → не мерено
reestr "$METKA" "$REPO/packages"; echo "   порча реестра: address = $REPO/packages (не корень дерева)"
v=$(takt); case "$v" in "NEMOTA|nemer:"*"не прочитан"*) r=0 ;; *) r=1 ;; esac; pr "П7 адрес не корень дерева → не мерено (доверие только адресу)" $r "$v"
echo "итог: $ok из $((ok+bad))"; [ "$bad" = 0 ] || exit 1
