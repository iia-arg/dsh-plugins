#!/bin/bash
# RU: stend-metki-vorot.sh — пробы B-N-1923: след ворот (vypusk-tegom + libexec/vypusk-tegom/zhurnal-zapis) и сторож metki-mimo-vorot-watch.
# RU: Всё на копии: временное дерево git, временный журнал (root, как в бою), подставной реестр и подставной канал тревог
# RU: (заглушка пишет текст в файл) — боевой журнал /var/lib/vypusk-tegom и боевой agent-alert НЕ трогаются.
# RU: Зовущий нужен с sudo -n (помощник журнала и сторож — под root, как в бою). Ожидание каждой пробы — в её строке до запуска.
# RU: Пробы (Вениамин, п.6): метка воротами → молчит · ручная метка → красное по имени · перенос исторической → красное ·
# RU: грязный каталог → отказ код 2 · помощник не записал → нет «✅», код 2 · индекс дерева не тронут; к каждой порче — возврат.
# RU: Доводы: $1 — ворота (по умолчанию ../bin/vypusk-tegom рядом), $2 — помощник, $3 — сторож. Коды: 0 все сошлись · 1 нет · 2 слепота.
set -u
K=$(cd "$(dirname "$0")/.." && pwd)
VOROTA="${1:-$K/bin/vypusk-tegom}"; ZAPIS="${2:-$K/libexec/vypusk-tegom/zhurnal-zapis}"; STOROZH="${3:-$K/sbin/metki-mimo-vorot-watch}"
for f in "$VOROTA" "$ZAPIS" "$STOROZH"; do [ -x "$f" ] || { echo "СЛЕПОТА: не исполняется $f"; exit 2; }; done
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нужен sudo -n (помощник и сторож — под root)"; exit 2; }
# находка Искры 10:5xZ: в юните обхода PrivateTmp=yes — /var/tmp частный, systemd-run пробы 6б его не видит (226); обход подаёт TMPDIR
B=$(mktemp -d "${TMPDIR:-/var/tmp}/stend-metki-vorot.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'sudo -n rm -rf -- "$B"' EXIT
OK=0; FAIL=0
proba() { # имя · ожидаемый код · ожидаемая строка (пусто — не проверять) · НЕ должно быть строки (пусто — нет) · вывод · код
  local imya="$1" zhdem="$2" est="$3" net="$4" out="$5" kod="$6" beda=""
  [ "$kod" = "$zhdem" ] || beda="код $kod ≠ $zhdem"
  [ -z "$est" ] || grep -qF -- "$est" <<< "$out" || beda="$beda; нет «$est»"
  [ -z "$net" ] || ! grep -qF -- "$net" <<< "$out" || beda="$beda; есть «$net»"
  if [ -z "$beda" ]; then OK=$((OK+1)); echo "ok   $imya"; else FAIL=$((FAIL+1)); echo "FAIL $imya — ${beda#; }"; printf '%s\n' "$out" | tail -6 | sed 's/^/       /'; fi
}
# --- подставной мир ---
R="$B/repo"; P="$R/packages/proba-paket"; ZD="$B/zh"; BOJ="$B/boj"; REG="$B/reestr.yaml"; ALOG="$B/alert.log"; SD="$B/sost"
mkdir -p "$P" "$BOJ" "$SD"; sudo -n install -d -o root -g root -m 0755 "$ZD"
printf '#!/bin/sh\nprintf "%%s\\n---\\n" "$*" >> %s\n' "$ALOG" > "$B/alert"; chmod 755 "$B/alert"
git -C "$B" init -q repo; G() { git -C "$R" -c user.name=stend -c user.email=stend@localhost "$@"; }
printf 'a\n' > "$P/a.txt"; cp "$P/a.txt" "$BOJ/a.txt"
printf '# Изменения\n\n## 0.0.1 — проба\n' > "$P/CHANGELOG.md"
G add -A && G commit -qm init && G tag -a staraya-v0.0.0 -m историческая
cat > "$REG" <<Y
plugins: []
services:
  - id: proba-paket
    derevo: {address: "$R", subdir: packages/proba-paket, files: [{remote: a.txt, local: "$BOJ/a.txt"}], not_installed: [CHANGELOG.md]}
Y
vorota() { VYPUSK_REPO="$R" VYPUSK_REESTR="$REG" STENDY_INACHE="стенд B-N-1923" VYPUSK_ZHURNAL_DIR="${ZDV:-$ZD}" VYPUSK_ZHURNAL_ZAPIS="$ZAPIS" "$VOROTA" "$P" 2>&1; }
storozh() { sudo -n env MMV_REESTR="$REG" MMV_ZHURNAL_DIR="$ZD" MMV_ALERT="$B/alert" MMV_STATE="$SD" "$STOROZH" "$@" 2>&1; }
indeks() { stat -c '%U %s %Y' "$R/.git/index"; sha256sum "$R/.git/index" | cut -c1-16; }
otv=$(storozh --snimok); kod=$?; proba "снимок исторических (1 метка)" 0 "СНИМОК исторических: 1" "" "$otv" "$kod"
# индекс: снимок ДО всех прогонов под root; файл трогаем (mtime), чтобы обычный git status ЗАХОТЕЛ переписать индекс
touch -d '2001-01-01' "$P/a.txt"; IDX0=$(indeks)
# 1. исправное: ворота → след, метка рукой на HEAD → сторож молчит
otv=$(vorota); kod=$?; proba "1 ворота на чистом каталоге: «✅» и след" 0 "СЛЕД ЗАПИСАН: proba-paket-v0.0.1" "" "$otv" "$kod"
G tag -a proba-paket-v0.0.1 -m "по воротам"
otv=$(storozh); kod=$?; proba "1 метка по воротам → молчит" 0 "чисто" "🔴" "$otv" "$kod"
# 6б. сторож в юните с защитой как у боевого (ProtectSystem=strict, ProtectHome=read-only, NoNewPrivileges; писать — только своё
#     состояние): прогон проходит ⇒ вне состояния он не пишет (п.4 Вениамина). PrivateTmp=no — иначе подставной мир в /var/tmp не виден
#     (боевому дереву в /opt PrivateTmp не мешает). Контроль зрячести: в таком же юните запись в .git дерева ОТКАЗЫВАЕТ.
ZASHCHITA=(-p ProtectSystem=strict -p ProtectHome=read-only -p NoNewPrivileges=yes -p ReadWritePaths="$SD" -p PrivateTmp=no)
otv=$(sudo -n systemd-run --quiet --wait --pipe --collect "${ZASHCHITA[@]}" -E MMV_REESTR="$REG" -E MMV_ZHURNAL_DIR="$ZD" -E MMV_ALERT="$B/alert" -E MMV_STATE="$SD" "$STOROZH" 2>&1); kod=$?
proba "6б сторож под ProtectSystem=strict → 0" 0 "чисто" "" "$otv" "$kod"
otv=$(sudo -n systemd-run --quiet --wait --pipe --collect "${ZASHCHITA[@]}" touch "$R/.git/zapis-pod-zashchitoj" 2>&1); kod=$?
proba "6б контроль: запись в .git в том же юните отказывает" 0 "" "" "" "$([ "$kod" -ne 0 ] && [ ! -e "$R/.git/zapis-pod-zashchitoj" ] && echo 0 || echo 1)"
echo "     контроль: touch под защитой — код $kod, $(grep -o "Read-only file system" <<< "$otv" | head -1)"
# 6. индекс дерева не тронут помощником и сторожем (под root)
IDX1=$(indeks); proba "6 индекс: хозяин, размер, mtime, сумма — те же" 0 "" "" "" "$([ "$IDX0" = "$IDX1" ] && echo 0 || echo 1)"
echo "     индекс до: $(tr '\n' ' ' <<< "$IDX0")· после: $(tr '\n' ' ' <<< "$IDX1")"
#    контроль зрячести пробы 6: обычный `sudo git status` (без --no-optional-locks) индекс ПЕРЕПИСЫВАЕТ — хозяином становится root
sudo -n git -c safe.directory='*' -C "$R" status --porcelain >/dev/null 2>&1; IDX2=$(indeks)
proba "6 контроль: обычный sudo git status индекс переписал (хозяин root)" 0 "" "" "" "$([ "${IDX2%% *}" = root ] && echo 0 || echo 1)"
echo "     после обычного sudo git status: $(tr '\n' ' ' <<< "$IDX2")"; sudo -n chown "$(id -un)" "$R/.git/index"
# 2. ручная метка мимо ворот → красное по имени; 3. снять → зелёное
printf '# Изменения\n\n## 0.0.2 — проба\n' > "$P/CHANGELOG.md"; G commit -qam 0.0.2; G tag -a proba-paket-v0.0.2 -m рукой
otv=$(storozh); kod=$?; proba "2 ручная метка → красное по имени" 3 "МИМО ВОРОТ: метка proba-paket-v0.0.2" "" "$otv" "$kod"
proba "2 тревога ушла в канал (заглушка) с именем метки" 0 "proba-paket-v0.0.2" "" "$(cat "$ALOG" 2>/dev/null)" 0
otv=$(storozh); kod=$?; proba "2 повтор не кричит" 1 "все уже сказаны" "" "$otv" "$kod"
G tag -d proba-paket-v0.0.2 >/dev/null
otv=$(storozh); kod=$?; proba "3 метку сняли → зелёное" 0 "чисто" "🔴" "$otv" "$kod"
# перенос исторической → красное; вернуть → зелёное
STARAYA=$(git -C "$R" rev-parse staraya-v0.0.0^{commit}); G tag -f -a staraya-v0.0.0 -m перенос HEAD >/dev/null
echo "     порча: staraya-v0.0.0 ${STARAYA:0:12} → $(git -C "$R" rev-parse staraya-v0.0.0^{commit} | cut -c1-12)"
otv=$(storozh); kod=$?; proba "перенос исторической → красное" 3 "ПЕРЕНЕСЕНА историческая метка staraya-v0.0.0" "" "$otv" "$kod"
G tag -d staraya-v0.0.0 >/dev/null; G tag -a staraya-v0.0.0 -m "пересоздана на тот же коммит" "$STARAYA" >/dev/null
otv=$(storozh); kod=$?
#   аннотированная метка пересоздана (другой текст ⇒ объект НОВЫЙ; тот же текст в ту же секунду дал бы ТОТ ЖЕ объект — это не перенос), возврат — только прежний объект
proba "перенос: пересозданная тем же коммитом — всё равно красное (объект метки другой)" 3 "ПЕРЕНЕСЕНА" "" "$otv" "$kod"
G tag -d staraya-v0.0.0 >/dev/null; git -C "$R" update-ref refs/tags/staraya-v0.0.0 "$(cut -f3 <(sudo -n cat "$ZD/istoricheskie-metki.tsv") | head -1)"
otv=$(storozh); kod=$?; proba "перенос: возврат прежнего объекта → зелёное" 0 "чисто" "🔴" "$otv" "$kod"
# 4. грязный каталог → отказ код 2, без «✅»; возврат → «✅»
printf 'b\n' > "$P/a.txt"; cp "$P/a.txt" "$BOJ/a.txt"; printf '# Изменения\n\n## 0.0.3 — проба\n' > "$P/CHANGELOG.md"
echo "     порча: a.txt в рабочем каталоге ≠ HEAD ($(git -C "$R" status --porcelain -- packages/proba-paket | wc -l) пути)"
otv=$(vorota); kod=$?; proba "4 грязный каталог → отказ 2" 2 "Закоммить и повтори" "✅ можно ставить" "$otv" "$kod"
G commit -qam 0.0.3
otv=$(vorota); kod=$?; proba "4 закоммитили → «✅» и след" 0 "СЛЕД ЗАПИСАН: proba-paket-v0.0.3" "" "$otv" "$kod"
# метка не на том, что судили: докоммит после ворот, метка на новый HEAD → красное; на судимый коммит → зелёное
SUDIMYJ=$(git -C "$R" rev-parse HEAD); printf 'c\n' > "$P/a.txt"; G commit -qam "после ворот"; G tag -a proba-paket-v0.0.3 -m рукой
otv=$(storozh); kod=$?; proba "метка на коммите после ворот → красное" 3 "НЕ ТО, ЧТО СУДИЛИ: метка proba-paket-v0.0.3" "" "$otv" "$kod"
G tag -f -a proba-paket-v0.0.3 -m "на судимый" "$SUDIMYJ" >/dev/null
otv=$(storozh); kod=$?; proba "метка на судимом коммите → зелёное" 0 "чисто" "🔴" "$otv" "$kod"
# 5. помощник не записал → нет «✅», код 2; возврат — см. 4 (тот же каталог с журналом)
printf '# Изменения\n\n## 0.0.4 — проба\n' > "$P/CHANGELOG.md"; cp "$P/a.txt" "$BOJ/a.txt"; G commit -qam 0.0.4
otv=$(ZDV="$B/net-takogo" vorota); kod=$?; proba "5 помощник не записал (журнала нет) → нет «✅», код 2" 2 "СЛЕПОТА: след ворот не записан" "✅ можно ставить" "$otv" "$kod"
otv=$(vorota); kod=$?; proba "5 возврат: журнал на месте → «✅»" 0 "СЛЕД ЗАПИСАН: proba-paket-v0.0.4" "" "$otv" "$kod"
# журнал пишется группой → сторож слепнет; вернуть права → зелёное
sudo -n chmod 0664 "$ZD/zhurnal.tsv"; echo "     порча: права журнала $(stat -c %a "$ZD/zhurnal.tsv")"
otv=$(storozh); kod=$?; proba "журнал пишется группой → СЛЕПОТА 2" 2 "пишется группой/всеми" "" "$otv" "$kod"
sudo -n chmod 0644 "$ZD/zhurnal.tsv"
otv=$(storozh); kod=$?; proba "права вернули → зелёное" 0 "чисто" "" "$otv" "$kod"
# каталог вне git: «✅» с пометкой БЕЗ СЛЕДА, журнал не растёт
N0=$(sudo -n wc -l < "$ZD/zhurnal.tsv"); cp -a "$P" "$B/vne-git"
otv=$(sudo -n "$ZAPIS" --metka proba-paket-v9.9.9 --paket proba-paket --rezhim derevo --katalog "$B/vne-git" --vyvod "$REG" --zhurnal-dir "$ZD" 2>&1); kod=$?
proba "вне git: помощник — код 4 БЕЗ СЛЕДА" 4 "БЕЗ СЛЕДА" "" "$otv" "$kod"
N1=$(sudo -n wc -l < "$ZD/zhurnal.tsv")
proba "вне git: журнал не вырос ($N0 → $N1)" 0 "" "" "" "$([ "$N0" = "$N1" ] && echo 0 || echo 1)"
# 7. git помощника — от ВЛАДЕЛЬЦА .git (условие Вениамина 09:46Z п.2): хук core.fsmonitor репозитория исполняется НЕ от root.
#    Помощник — напрямую (через ворота хук раньше исполнил бы сам зовущий, и владелец файла пробы был бы не о помощнике).
printf '#!/bin/sh\ntouch "%s"\nexit 1\n' "$B/fsm-proba" > "$B/fsm-hook.sh"; chmod 755 "$B/fsm-hook.sh"; git -C "$R" config core.fsmonitor "$B/fsm-hook.sh"
echo "     порча: core.fsmonitor = $(git -C "$R" config core.fsmonitor)"
otv=$(sudo -n "$ZAPIS" --metka=proba-paket-v7.7.7 --paket=proba-paket --rezhim=derevo --katalog="$P" --vyvod="$REG" --zhurnal-dir="$ZD" 2>&1); kod=$?
proba "7 помощник на репозитории с core.fsmonitor → след" 0 "СЛЕД ЗАПИСАН: proba-paket-v7.7.7" "" "$otv" "$kod"
KTO=$(stat -c %U "$B/fsm-proba" 2>/dev/null || echo нет)
proba "7 хук fsmonitor НЕ от root (файл пробы: $KTO)" 0 "" "" "" "$([ "$KTO" != root ] && echo 0 || echo 1)"
sudo -n rm -f "$B/fsm-proba"; sudo -n git -c safe.directory='*' -C "$R" status --porcelain >/dev/null 2>&1; KTO2=$(stat -c %U "$B/fsm-proba" 2>/dev/null || echo нет)
proba "7 контроль: sudo git c safe.directory=* — хук ОТ ROOT (файл пробы: $KTO2)" 0 "" "" "" "$([ "$KTO2" = root ] && echo 0 || echo 1)"
sudo -n chown "$(id -un)" "$R/.git/index"; git -C "$R" config --unset core.fsmonitor; sudo -n rm -f "$B/fsm-proba"
# B-N-2029 (14.10, Аврора): номер с дефисом внутри pre-release — сквозь ВСЕ три места одного образца: ворота (номер дерева и верх
#   CHANGELOG), помощник журнала (форма метки) и сторож (RE_VER). Порча любого из трёх краснит свою пробу ниже.
printf '# Изменения\n\n## 0.0.5-b2027-notices2 — проба (B-N-2029)\n' > "$P/CHANGELOG.md"; G commit -qam 0.0.5-b2027-notices2
otv=$(vorota); kod=$?; proba "2029 дефис в pre-release: ворота → «✅» и след с полным номером" 0 "СЛЕД ЗАПИСАН: proba-paket-v0.0.5-b2027-notices2" "" "$otv" "$kod"
G tag -a proba-paket-v0.0.5-b2027-notices2 -m "по воротам"
otv=$(storozh); kod=$?; proba "2029 метка с дефисом по воротам → сторож молчит" 0 "чисто" "🔴" "$otv" "$kod"
echo "ИТОГО: сошлось $OK, расхождений $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
