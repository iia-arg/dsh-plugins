#!/bin/bash
# RU: Проба прав каталога состояния zadaniya-prervany-watch (перенесена из пробы мест копий фермы — взята только часть
# RU:   про этот модуль). ТОЛЬКО ЧТЕНИЕ. В каталоге состояния лежит письмо dlya-<адресат>-zadaniya-prervany.md с путями
# RU:   и сведениями о заданиях — посторонние читать его не должны.
# RU: Проверяет: rezhim — other=--- на каталоге состояния; dostup — учётка nobody НЕ читает письмо и НЕ листает каталог;
# RU:   sluzhba — служба ходит root (User= пуст или root): сменят на не-root — после закрытия каталога потеряет доступ.
# RU: Откуда служба: --boj — загруженный юнит (systemctl show, только чтение); --koren DIR — файл юнита
# RU:   DIR/etc/systemd/system/zadaniya-prervany-watch.service (+ .d/*.conf), состояние — DIR/var/lib/zadaniya-prervany-watch.
# RU: Чего НЕ ловит: открытие и закрытие между прогонами; копии письма вне каталога состояния; чтение через sudo.
# RU: Почему режим держится: юнит пакета задаёт StateDirectoryMode=0750 (без него systemd на каждом старте открывал 0755).
# EN: Permission probe for the zadaniya-prervany-watch state directory (ported from the farm's backup-locations probe —
# EN:   only the part about this module). READ ONLY. The state directory holds the letter dlya-<recipient>-zadaniya-prervany.md
# EN:   with paths and task details — outsiders must not read it.
# EN: Checks: rezhim — other=--- on the state directory; dostup — user nobody can NOT read the letter nor list the directory;
# EN:   sluzhba — the service runs as root (User= empty or root): switched to non-root it loses access once the directory is closed.
# EN: Service source: --boj — the loaded unit (systemctl show, read-only); --koren DIR — the unit file
# EN:   DIR/etc/systemd/system/zadaniya-prervany-watch.service (+ .d/*.conf), state — DIR/var/lib/zadaniya-prervany-watch.
# EN: Does NOT catch: opening and re-closing between runs; copies of the letter outside the state directory; reading via sudo.
# EN: Why the mode holds: the package unit sets StateDirectoryMode=0750 (without it systemd reopened to 0755 on every start).
# RU: Вызов: --boj | --koren DIR ; прочий ввод — отказ (код 2). Исход: 0 ЗЕЛЁНОЕ; 1 КРАСНОЕ; 3 СЛЕПОТА (нет sudo/предмета).
# EN: Usage: --boj | --koren DIR ; anything else — refusal (exit 2). Result: 0 GREEN; 1 RED; 3 BLIND (no sudo / no subject).
set -u
case "${1:-}" in
  --boj)   [ $# -eq 1 ] || { echo "отказ: лишние доводы" >&2; exit 2; }; R="" ;;
  --koren) [ $# -eq 2 ] && [ -d "$2" ] && [ "$2" != / ] || { echo "отказ: --koren DIR (DIR есть и не /)" >&2; exit 2; }; R="${2%/}" ;;
  *) echo "отказ: вызов --boj | --koren DIR" >&2; exit 2 ;;
esac
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo -n у $(id -un)" >&2; exit 3; }
red=0; slep=0
z() { echo "ЗЕЛЁНОЕ $*"; }; k() { echo "КРАСНОЕ $*"; red=1; }; s() { echo "СЛЕПОТА $*"; slep=1; }
est() { sudo -n test -e "$1"; }
ne_dolzhen() { local kto=$1 chto=$2 p=$3 rc
  est "$p" || { s "dostup $kto $chto $p: предмета нет"; return; }
  case $chto in read) sudo -n -u "$kto" head -c1 -- "$p" >/dev/null 2>&1; rc=$? ;; list) sudo -n -u "$kto" ls -- "$p" >/dev/null 2>&1; rc=$? ;; esac
  [ $rc -ne 0 ] && z "dostup $kto $chto $p: отказ (ждали отказ)" || k "dostup $kto $chto $p: ПРОШЁЛ (ждали отказ)"; }
rezhim() { local p=$1 o; est "$p" || { s "rezhim $p: предмета нет"; return; }
  o=$(sudo -n stat -c %A -- "$p" | cut -c8-10); [ "$o" = "---" ] && z "rezhim $p: other=---" || k "rezhim $p: other=$o (ждали ---)"; }

Z=$R/var/lib/zadaniya-prervany-watch
# RU: письмо — любое dlya-*-zadaniya-prervany.md (адресат — настройка ZPW_ADRESAT)
# EN: the letter — any dlya-*-zadaniya-prervany.md (the recipient is the ZPW_ADRESAT setting)
P=$(sudo -n find "$Z" -maxdepth 1 -type f -name 'dlya-*-zadaniya-prervany.md' 2>/dev/null | head -1)
ne_dolzhen nobody list "$Z"
if [ -n "$P" ]; then ne_dolzhen nobody read "$P"; else s "dostup nobody read $Z/dlya-*-zadaniya-prervany.md: письма нет (наряда ещё не было?)"; fi
if [ -z "$R" ]; then
  us=$(systemctl show -p User --value zadaniya-prervany-watch.service 2>/dev/null); ld=$(systemctl show -p LoadState --value zadaniya-prervany-watch.service 2>/dev/null)
else
  U=$R/etc/systemd/system/zadaniya-prervany-watch.service
  if [ -r "$U" ]; then ld=loaded; us=$(cat "$U" "$U".d/*.conf 2>/dev/null | sed -n 's/^User=//p' | tail -1); else ld="нет файла $U"; fi
fi
if [ "$ld" = loaded ]; then
  [ -z "$us" ] || [ "$us" = root ] && z "sluzhba zadaniya-prervany-watch: User=${us:-root}" || k "sluzhba zadaniya-prervany-watch: User=$us — не root, после закрытия потеряет доступ"
else s "sluzhba zadaniya-prervany-watch: LoadState=$ld"; fi
rezhim "$Z"
[ $slep -ne 0 ] && { echo "ИТОГ: СЛЕПОТА"; exit 3; }
[ $red -ne 0 ] && { echo "ИТОГ: КРАСНОЕ"; exit 1; }
echo "ИТОГ: ЗЕЛЁНОЕ"; exit 0
