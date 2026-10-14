#!/bin/bash
# RU: Стенд проверки установки (bin/proverit-ustanovku.sh) на подставных юнитах во временном каталоге; root не нужен,
#     systemd и боевой юнит не трогаются. Пробы: юнит пакета разобран (группы omega и omega-users названы);
#     группы есть → 0; нет группы → 1, отказ называет группу и 216/GROUP; юнит не прочитан → 2; в юните нет групп → 2.
#     Проверяемый скрипт — STEND_PROVERKA (по умолчанию bin/proverit-ustanovku.sh этого пакета).
#     Не проверяет: сам systemd (что без группы он отказывает 216/GROUP — снято пробой временным юнитом, см. CHANGELOG).
# EN: Stand for the install check (bin/proverit-ustanovku.sh) on fake units in a temp directory; no root needed,
#     systemd and the live unit are not touched. Probes: the package unit is parsed (groups omega and omega-users named);
#     groups exist → 0; a missing group → 1, the refusal names the group and 216/GROUP; unreadable unit → 2; no groups → 2.
#     The script under test is STEND_PROVERKA (default: this package's bin/proverit-ustanovku.sh).
#     Does not check: systemd itself (that it refuses with 216/GROUP without the group — taken by a transient-unit probe, see CHANGELOG).
set -u
K=$(cd "$(dirname "$0")/.." && pwd); P=${STEND_PROVERKA:-$K/bin/proverit-ustanovku.sh}
T=$(mktemp -d) || { echo 'СЛЕПОТА: нет временного каталога'; exit 2; }; trap 'rm -rf -- "$T"' EXIT
moya=$(id -gn); net="net-takoj-gruppy-$$-stend"; ok=0; vsego=0
getent group "$net" >/dev/null && { echo "СЛЕПОТА: группа $net неожиданно есть"; exit 2; }
proba() { vsego=$((vsego+1)); if [ "$1" = 0 ]; then ok=$((ok+1)); echo "  ✅ $2"; else echo "  ❌ $2 — $3"; fi; }
# RU: Только директивы групп из пакета; реальные HOME/model/key пути не читаются.
# EN: Only package group directives; live HOME/model/key paths are never inspected.
awk '/^\[Service\]/{print; next} /^(Group|SupplementaryGroups)=/{print}' "$K/systemd/omega-memory.service" > "$T/package.service"
v=$(sh "$P" "$T/package.service" 2>&1); c=$?
case "$v" in *omega*omega-users*) r=0;; *) r=1;; esac; [ "$c" -le 1 ] || r=1
proba $r 'юнит пакета разобран: названы omega и omega-users' "rc=$c $v"
printf '[Service]\nGroup=%s\nSupplementaryGroups=%s\n' "$moya" "$moya" > "$T/est.service"
v=$(sh "$P" "$T/est.service" 2>&1); c=$?; [ "$c" = 0 ]; proba $? 'группы есть → код 0' "rc=$c $v"
printf '[Service]\nGroup=%s\nSupplementaryGroups=%s\n' "$moya" "$net" > "$T/net.service"
v=$(sh "$P" "$T/net.service" 2>&1); c=$?
case "$v" in *"ОТКАЗ"*"$net"*216/GROUP*) r=0;; *) r=1;; esac; [ "$c" = 1 ] || r=1
proba $r 'нет группы → код 1, отказ называет группу и 216/GROUP' "rc=$c $v"
v=$(sh "$P" "$T/netu-takogo.service" 2>&1); c=$?; [ "$c" = 2 ]; proba $? 'юнит не прочитан → код 2' "rc=$c $v"
printf '[Service]\nUser=nobody\n' > "$T/pusto.service"
v=$(sh "$P" "$T/pusto.service" 2>&1); c=$?; [ "$c" = 2 ]; proba $? 'в юните нет групп → код 2' "rc=$c $v"
# RU: Вставки: группа только во вставке и её нет → 1 (случай приёмки); пустое SupplementaryGroups= во вставке сбрасывает
#     недостающую группу основного файла → 0; нечитаемая вставка → 2 (не под root: root читает всё).
# EN: Drop-ins: a group only in a drop-in and missing → 1 (the acceptance case); an empty SupplementaryGroups= in a drop-in
#     resets the main file's missing group → 0; an unreadable drop-in → 2 (not as root: root reads everything).
printf '[Service]\nGroup=%s\n' "$moya" > "$T/v.service"; mkdir "$T/v.service.d"; printf '[Service]\nSupplementaryGroups=%s\n' "$net" > "$T/v.service.d/30.conf"
v=$(sh "$P" "$T/v.service" 2>&1); c=$?
case "$v" in *"ОТКАЗ"*"$net"*) r=0;; *) r=1;; esac; [ "$c" = 1 ] || r=1
proba $r 'группа только во вставке и её нет → код 1 с именем' "rc=$c $v"
printf '[Service]\nGroup=%s\nSupplementaryGroups=%s\n' "$moya" "$net" > "$T/s.service"; mkdir "$T/s.service.d"; printf '[Service]\nSupplementaryGroups=\n' > "$T/s.service.d/40.conf"
v=$(sh "$P" "$T/s.service" 2>&1); c=$?; [ "$c" = 0 ]; proba $? 'пустое SupplementaryGroups= во вставке сбрасывает список → код 0' "rc=$c $v"
if [ "$(id -u)" != 0 ]; then
  printf '[Service]\nGroup=%s\n' "$moya" > "$T/z.service"; mkdir "$T/z.service.d"; printf '[Service]\n' > "$T/z.service.d/50.conf"; chmod 000 "$T/z.service.d/50.conf"
  v=$(sh "$P" "$T/z.service" 2>&1); c=$?; [ "$c" = 2 ]; proba $? 'нечитаемая вставка → код 2' "rc=$c $v"
else echo "  (проба «нечитаемая вставка» пропущена: под root читается всё)"; fi
# RU: Режим имени: незагруженный юнит → 2 (итог берётся у systemd, а не из файлов).
# EN: Name mode: an unloaded unit → 2 (the result comes from systemd, not from files).
v=$(sh "$P" "net-takogo-yunita-$$-stend.service" 2>&1); c=$?; [ "$c" = 2 ]; proba $? 'имя незагруженного юнита → код 2' "rc=$c $v"
echo "  итог: $ok из $vsego"
[ "$ok" = "$vsego" ]
