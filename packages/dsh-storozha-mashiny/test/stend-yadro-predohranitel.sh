#!/usr/bin/env bash
# RU: Стенд предохранителя первой загрузки yadro-predohranitel: исправное (сеть поднялась) —
# RU: зелено и метка снята; порча (сеть не поднялась) — красно с именем ядра и адреса, без
# RU: перезагрузки; порча снята — снова зелено. Плюс проба «без настройки».
# EN: Stand for the first-boot fuse yadro-predohranitel: healthy (network up) — green and the
# EN: marker removed; fault (network down) — red naming the kernel and address, no reboot;
# EN: fault removed — green again. Plus a "no settings" probe.
#
# RU: 🔴 ВОЗДЕЙСТВИЕ: предмет умеет перезагружать машину, а путь его метки прибит
# RU: (/var/lib/yadro-predohranitel/armed). Поэтому каждая проба идёт ВНУТРИ отдельного
# RU: пространства монтирования (sudo unshare -m), где:
# RU:   • на /var/lib/yadro-predohranitel смонтирован временный каталог — настоящая метка
# RU:     не создаётся и не удаляется;
# RU:   • на /usr/bin/systemctl смонтирована заглушка — даже вызов по абсолютному пути не
# RU:     дойдёт до настоящего systemctl; uname, lsmod, ping, sleep — заглушки первыми в PATH;
# RU:   • YP_DRY=1 во всех пробах — второй, независимый запрет перезагрузки.
# RU: Перед каждой пробой внутри пространства проверяется, что /usr/bin/systemctl и все имена
# RU: в PATH — заглушки; нет — ОТКАЗ, предмет не запускается.
# RU: Требует sudo без пароля и util-linux unshare. Нет — СЛЕПОТА (код 2), не «чисто».
# EN: 🔴 IMPACT: the subject can reboot the machine, and its marker path is hard-wired
# EN: (/var/lib/yadro-predohranitel/armed). So every probe runs INSIDE a separate mount
# EN: namespace (sudo unshare -m), where:
# EN:   • a temp directory is mounted over /var/lib/yadro-predohranitel — the real marker is
# EN:     never created or removed;
# EN:   • a stub is mounted over /usr/bin/systemctl — even an absolute-path call cannot reach the
# EN:     real systemctl; uname, lsmod, ping, sleep are stubs first in PATH;
# EN:   • YP_DRY=1 in every probe — a second, independent ban on rebooting.
# EN: Before each probe the stand verifies inside the namespace that /usr/bin/systemctl and every
# EN: PATH name are stubs; otherwise it REFUSES and the subject is not started.
# EN: Needs passwordless sudo and util-linux unshare. Without them — BLINDNESS (exit 2), not "clean".
#
# RU: ОХВАТ: логика решения. НЕ проверяет: настоящую перезагрузку в saved_entry GRUB, порядок
# RU: юнита при загрузке, настоящий модуль и настоящую сеть.
# EN: COVERAGE: the decision logic. Does NOT check: a real reboot into GRUB saved_entry, unit
# EN: ordering at boot, the real module and the real network.
set -uo pipefail
export LC_ALL=C.UTF-8
HERE="$(cd "$(dirname "$0")" && pwd)"
CEL="${CEL:-$HERE/../bin/yadro-predohranitel}"
MDIR=/var/lib/yadro-predohranitel
[ -r "$CEL" ] || { echo "СЛЕПОТА: нет $CEL"; exit 2; }
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нужен sudo без пароля для unshare -m"; exit 2; }
[ -d "$MDIR" ] || { echo "СЛЕПОТА: нет каталога $MDIR — смонтировать подмену некуда (создавать его стенд не будет)"; exit 2; }
T="$(mktemp -d)"; chmod 755 "$T"; trap 'rm -rf "$T"' EXIT
S="$T/stub"; mkdir -p "$S" "$T/m"
ok=0; bad=0
p() { echo "ok   $1"; ok=$((ok+1)); }
f() { echo "FAIL $1"; bad=$((bad+1)); }

# RU: Заглушки: ядро — 6.8.0-20-proba; модуль и ответ ping задаются файлами $T/lsmod и $T/ping-rc.
# EN: Stubs: kernel is 6.8.0-20-proba; module presence and ping result come from $T/lsmod and $T/ping-rc.
printf '#!/bin/sh\necho 6.8.0-20-proba\n' > "$S/uname"
printf '#!/bin/sh\ncat "%s/lsmod"\n' "$T" > "$S/lsmod"
printf '#!/bin/sh\necho "ping $*" >> "%s/calls"\nexit "$(cat "%s/ping-rc")"\n' "$T" "$T" > "$S/ping"
printf '#!/bin/sh\necho "sleep $*" >> "%s/calls"\n' "$T" > "$S/sleep"
# RU: 1.0.1: время загрузки — заглушка uptime -s: «час назад» на момент сборки стенда.
printf '#!/bin/sh\necho "%s"\n' "$(date -d '-1 hour' '+%F %T')" > "$S/uptime"
printf '#!/bin/sh\n# STUB-SYSTEMCTL\necho "systemctl $*" >> "%s/calls"\n' "$T" > "$S/systemctl"
chmod 755 "$S"/*

progon() { # env... — RU: прогон в пространстве монтирования · EN: run inside a mount namespace
  : > "$T/calls"
  OUT="$(sudo -n unshare -m --propagation private env -i PATH="$S:/usr/bin:/bin" LC_ALL=C.UTF-8 YP_DRY=1 "$@" bash -c '
    mount --bind "$0/m" "'"$MDIR"'" && mount --bind "$0/stub/systemctl" /usr/bin/systemctl || { echo "ОТКАЗ: подмена не смонтирована"; exit 97; }
    grep -q STUB-SYSTEMCTL /usr/bin/systemctl || { echo "ОТКАЗ: /usr/bin/systemctl не заглушка"; exit 97; }
    for c in uname lsmod ping sleep systemctl uptime; do [ "$(command -v $c)" = "$0/stub/$c" ] || { echo "ОТКАЗ: $c не заглушка"; exit 97; }; done
    bash "$1"' "$T" "$CEL" 2>&1)"; RC=$?
}
proverka_metki() { [ -z "$(ls -A "$MDIR")" ] || { echo "🔴 НАСТОЯЩИЙ $MDIR не пуст: $(ls -A "$MDIR")"; bad=$((bad+1)); }; }
DO=$(ls -A "$MDIR"); [ -z "$DO" ] || { echo "ОТКАЗ: настоящий $MDIR не пуст ($DO) — машина взведена, стенд не запускаю"; exit 2; }

echo "── 1. исправное: модуль есть, адрес отвечает · healthy: module loaded, address answers"
echo 6.8.0-20-proba > "$T/m/armed"; echo "amneziawg 1 0" > "$T/lsmod"; echo 0 > "$T/ping-rc"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 0 ] && grep -qF 'ЗЕЛЕНО: 6.8.0-20-proba' <<<"$OUT" && [ ! -e "$T/m/armed" ] && ! grep -q '^systemctl' "$T/calls" \
  && p "исправное: код 0, ЗЕЛЕНО, метка снята, systemctl не звали" || f "исправное: код $RC | $OUT"
proverka_metki

echo "── 2. порча: модуля нет · fault: module not loaded"
echo 6.8.0-20-proba > "$T/m/armed"; : > "$T/lsmod"
echo "  порча внесена · fault injected: lsmod-заглушка отдаёт $(wc -c < "$T/lsmod") байт"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 1 ] && grep -qF 'КРАСНО: 6.8.0-20-proba' <<<"$OUT" && grep -qF '192.0.2.1' <<<"$OUT" && grep -qF 'YP_DRY' <<<"$OUT" \
  && [ "$(grep -c '^sleep 10' "$T/calls")" = 60 ] && [ ! -e "$T/m/armed" ] && ! grep -q '^systemctl' "$T/calls" \
  && p "порча: код 1, КРАСНО с ядром и адресом, 60 ожиданий, перезагрузки нет" || f "порча: код $RC | $OUT | $(sort "$T/calls" | uniq -c)"
proverka_metki

echo "── 3. порча снята — снова зелено · fault removed — green again"
echo 6.8.0-20-proba > "$T/m/armed"; echo "amneziawg 1 0" > "$T/lsmod"
echo "  порча снята · fault removed: lsmod-заглушка отдаёт «$(cat "$T/lsmod")»"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 0 ] && grep -qF 'ЗЕЛЕНО' <<<"$OUT" && [ ! -e "$T/m/armed" ] \
  && p "после снятия: код 0, ЗЕЛЕНО" || f "после снятия: код $RC | $OUT"
proverka_metki

echo "── 4. без настройки: взведён, но YP_TARGET_IP не задан · no settings: armed, YP_TARGET_IP unset"
echo 6.8.0-20-proba > "$T/m/armed"; : > "$T/lsmod"
progon
[ "$RC" = 2 ] && grep -qF 'YP_TARGET_IP не задан' <<<"$OUT" && [ -e "$T/m/armed" ] && [ ! -s "$T/calls" ] \
  && p "без настройки: код 2, «не задан», метка цела, ни ping, ни systemctl" || f "без настройки: код $RC | $OUT | $(cat "$T/calls")"
proverka_metki

echo "── 5. 1.0.1: пустая метка — взвод негоден, снять и сказать"
: > "$T/m/armed"; echo "  порча: метка $(wc -c < "$T/m/armed") байт"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 2 ] && grep -qF 'метка пуста' <<<"$OUT" && [ ! -e "$T/m/armed" ] && ! grep -q '^systemctl' "$T/calls" \
  && p "пустая метка: код 2, «метка пуста», снята" || f "пустая метка: код $RC | $OUT"
proverka_metki

echo "── 6. 1.0.1: чужое ядро, метка взведена ДО загрузки — протухла"
echo 7.0.0-99-proba > "$T/m/armed"; touch -d '-2 days' "$T/m/armed"; echo "  порча: метка на 7.0.0-99-proba от $(date -r "$T/m/armed" +%F)"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 2 ] && grep -qF 'взвод протух' <<<"$OUT" && grep -qF '7.0.0-99-proba' <<<"$OUT" && [ ! -e "$T/m/armed" ] \
  && p "протухшая чужая метка: код 2, названа, снята" || f "протухшая чужая метка: код $RC | $OUT"
proverka_metki

echo "── 7. 1.0.1: чужое ядро, взведено в ЭТОЙ загрузке — не трогать (зрячесть: законный взвод цел)"
echo 7.0.0-99-proba > "$T/m/armed"
progon YP_TARGET_IP=192.0.2.1
[ "$RC" = 0 ] && grep -qF 'жду перезагрузки в 7.0.0-99-proba' <<<"$OUT" && [ -e "$T/m/armed" ] \
  && p "свежая чужая метка: код 0, «жду перезагрузки», цела" || f "свежая чужая метка: код $RC | $OUT"
rm -f "$T/m/armed"; proverka_metki

echo; echo "ИТОГ: ok=$ok fail=$bad"
[ $((ok+bad)) -eq 7 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 7"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
