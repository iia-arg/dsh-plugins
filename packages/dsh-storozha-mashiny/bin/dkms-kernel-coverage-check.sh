#!/usr/bin/env bash
# RU: Проверка: собран ли DKMS-модуль (на машине-образце — модуль VPN-туннелей) для ВСЕХ установленных ядер.
# EN: Check: is the DKMS module (on the reference machine — the VPN tunnel module) built for ALL installed kernels.
#
# RU: ЗАЧЕМ. Обновление пакета модуля (*-dkms) пересобирает модуль ТОЛЬКО под текущее ядро и
# RU: молча теряет остальные. Проверено дважды, на двух машинах: покрытие упало с двух
# RU: ядер до одного сразу после apt upgrade.
# EN: WHY. Updating the module package (*-dkms) rebuilds the module ONLY for the running kernel and
# EN: silently loses the others. Seen twice, on two machines: coverage dropped from two
# EN: kernels to one right after apt upgrade.
#
# RU: ЧЕМ ГРОЗИТ. Загрузчик выбирает ядро недетерминированно (GRUB_DEFAULT=saved).
# RU: Перезагрузка в ядро без модуля = туннели не поднимаются = весь исходящий трафик
# RU: мёртв, все агенты машины теряют связь с миром. Так однажды был потерян сервер.
# EN: WHAT IS AT STAKE. The boot loader picks the kernel non-deterministically (GRUB_DEFAULT=saved).
# EN: Rebooting into a kernel without the module = tunnels do not come up = all outbound
# EN: traffic is dead, every agent on the machine loses the outside world. A server was once lost this way.
#
# RU: ЧТО ДЕЛАЕТ. Сравнивает установленные ядра с покрытием dkms. Не хватает — ЧИНИТ САМ
# RU: (ставит заголовки ядра и делает dkms install) и сообщает. Починить не смог — тревога.
# RU: Это сознательное исключение из правила «сторож не чинит» — по решению владельца.
# EN: WHAT IT DOES. Compares installed kernels with dkms coverage. Something missing — it REPAIRS
# EN: (installs kernel headers and runs dkms install) and reports. Repair failed — alert.
# EN: This is a deliberate exception to "a watchdog does not repair" — by the owner's decision.
set -uo pipefail
# RU: 🔴 Канал тревоги ищется ПО ИМЕНИ: сначала agent-alert, затем запасное имя
# RU: (DKMS_COVERAGE_ALERT_FALLBACK — например, историческое имя отправщика на машине).
# RU: Было прибито жёстко к одному историческому имени: уберут его — строка молча
# RU: не выполнится, и тревога не уйдёт БЕЗ ЕДИНОГО СЛОВА в журнал. Отказ отправки
# RU: стал бы неотличим от «повода не было».
# RU: ⚠️ ГРАНИЦА: выбор идёт ПО ИМЕНИ в PATH, а не по сумме. Заведут когда-нибудь другой
# RU: agent-alert — эта строка подхватит его молча. Проверять суммой.
# EN: 🔴 The alert channel is found BY NAME: agent-alert first, then a fallback name
# EN: (DKMS_COVERAGE_ALERT_FALLBACK — e.g. the machine's historical sender name).
# EN: It used to be hard-wired to one historical name: remove that name and the line
# EN: silently does nothing, the alert never leaves and NOT A WORD reaches the journal. A failed
# EN: send would look exactly like "nothing to report".
# EN: ⚠️ LIMIT: the choice is BY NAME in PATH, not by checksum. If another agent-alert appears
# EN: some day, this line picks it up silently. Verify by checksum.
ALERT=$(command -v agent-alert || command -v "${DKMS_COVERAGE_ALERT_FALLBACK:-agent-alert}" || echo /nonexistent)
# RU: Имя DKMS-модуля — настройка. Пусто — проверка выключена и говорит об этом.
# EN: The DKMS module name is a setting. Empty — the check is off and says so.
MODULE="${DKMS_COVERAGE_MODULE:-}"
# RU: Без модуля — НЕ «выключено молча», а провал (2) с причиной: иначе покрытие ядра модулем не проверяется,
# RU: юнит успешен, и узел может загрузиться на ядро без модуля (например, без туннеля).
# EN: No module — NOT "silently off" but a failure (2) with the reason: otherwise kernel coverage goes
# EN: unchecked, the unit succeeds, and the host may boot into a kernel without the module (e.g. no tunnel).
[ -z "$MODULE" ] && { echo "НЕ НАСТРОЕНО: DKMS_COVERAGE_MODULE не задан — покрытие ядер модулем НЕ проверяется" >&2; exit 2; }

kernels=$(dpkg-query -W -f='${Package}\n' 'linux-image-[0-9]*' 2>/dev/null \
          | sed 's/^linux-image-//' | grep -E '^[0-9]' | sort -u)
# RU: 1.0.1: пустой ответ — СЛЕПОТА (код 2), а не «всё покрыто» (было: код 0 молча).
# EN: 1.0.1: an empty answer is BLINDNESS (exit 2), not "all covered" (was: silent exit 0).
[ -z "$kernels" ] && { echo "СЛЕПОТА: dpkg-query не назвал ни одного установленного ядра linux-image-* — покрытие НЕ проверено" >&2; exit 2; }
version=$(dkms status 2>/dev/null | awk -F, -v p="${MODULE}/" 'index($1,p)==1 {print substr($1,length(p)+1); exit}' | head -1)
[ -z "$version" ] && { echo "СЛЕПОТА: dkms status не знает модуля ${MODULE} (dkms не установлен, модуль удалён или опечатка в DKMS_COVERAGE_MODULE) — покрытие НЕ проверено" >&2; exit 2; }

missing=()
for k in $kernels; do
  dkms status 2>/dev/null | awk -F', *' -v p="${MODULE}/${version}" -v k="$k" '$1==p && $2==k && $3 ~ /: installed$/ {yes=1} END {exit !yes}' || missing+=("$k")
done
[ ${#missing[@]} -eq 0 ] && exit 0

fixed=(); failed=()
for k in "${missing[@]}"; do
  dpkg -l "linux-headers-$k" 2>/dev/null | grep -q '^ii' || \
    DEBIAN_FRONTEND=noninteractive apt-get -y install "linux-headers-$k" >/dev/null 2>&1
  if dkms install "${MODULE}/${version}" -k "$k" >/dev/null 2>&1; then fixed+=("$k"); else failed+=("$k"); fi
done

host=$(hostname)
# RU: 1.0.1: настоящий перевод строки — agent-alert кодирует текст сам (было %0A, человек видел «%0A»).
# EN: 1.0.1: a real newline — agent-alert encodes the text itself (was %0A, shown literally).
NL=$'\n'
if [ ${#failed[@]} -gt 0 ]; then
  m="🔴 <b>$host: модуль туннелей НЕ собран для ядра</b>${NL}Не удалось: ${failed[*]}${NL}ПЕРЕЗАГРУЖАТЬ НЕЛЬЗЯ — загрузка в это ядро оставит сервер без VPN."
  if [ ! -x "$ALERT" ] || ! "$ALERT" "$m"; then echo "🔴 тревога DKMS НЕ доставлена ($ALERT)" >&2; fi
  logger -t dkms-coverage "FAILED: ${failed[*]}"; exit 1
fi
m="⚠️ <b>$host: восстановлено покрытие ядер</b>${NL}Модуль туннелей собран заново для: ${fixed[*]}${NL}Причина — обновление amneziawg-dkms пересобирает только текущее ядро."
if [ ! -x "$ALERT" ] || ! "$ALERT" "$m"; then echo "🔴 тревога DKMS НЕ доставлена ($ALERT)" >&2; fi
logger -t dkms-coverage "auto-fixed: ${fixed[*]}"
