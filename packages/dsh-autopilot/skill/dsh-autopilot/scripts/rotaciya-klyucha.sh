#!/bin/bash
# Ротация ключа раздачи — часть sadik порядка из SKILL.md, подраздел «Ротация ключа раздачи». Рука — root sadik.
#   rotaciya-klyucha.sh smenit <пункт> <полка>        п.3 (обратные зависимости — до всего), п.2, перезапуск, петля
#                                                     здоровья, sha256[:16] нового ключа ≠ старого (часть п.5)
#   rotaciya-klyucha.sh unichtozhit-staryj <пункт> --priznaki-5-6-proshli
#                                                     п.7 на sadik: shred старого ключа — только после п.5–6
# Не делает (машина входа, рука Михалыча): п.1 VYKL, п.4 perenos-klyucha.sh, п.5 сверка с vps-ru, п.6 mesh-проба,
# .bak include из п.7; п.8 — только прямой командой Александра. Иные аргументы — отказ, код 2.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
AP_KEY_FILE=/etc/dsh-autopilot/razdacha-klyuch
AP_UNIT=dsh-autopilot-razdacha.service
AP_PLAN_ODNA='CREATE credential /etc/dsh-autopilot/razdacha-klyuch (root:root 0600)'
ap_summa16() { ap_klyuch_proverit "$1" | awk '{print $NF}'; }

ap_smenit() {
  local punkt=$1 polka=$2 old old16 new16 deps plan
  test "$(id -u)" -eq 0
  test -f "$polka/install.sh" || ap_stop "нет $polka/install.sh — это не полка пакета"
  old="/var/backups/montazh/$punkt/razdacha-klyuch.old"
  test ! -e "$old" || ap_stop "$old уже есть — прежняя ротация не закрыта п.7"
  # п.3 до всего: чужая обратная зависимость — разбор ДО того, как тронуть ключ. Набор — из [Install] юнита пакета.
  deps=$(systemctl show -p RequiredBy -p WantedBy -p BoundBy -p ConsistsOf "$AP_UNIT" | sort)
  [[ "$deps" == $'BoundBy=\nConsistsOf=\nRequiredBy=\nWantedBy=multi-user.target' ]] \
    || { printf '%s\n' "$deps"; ap_stop "обратные зависимости $AP_UNIT не те, что ставит пакет — разбор до ротации"; }
  old16=$(ap_summa16 "$AP_KEY_FILE")
  # п.2 одним вызовом: между mv и установщиком ключа на месте нет (key-check, такт 60 с, может покраснеть раз).
  install -d -m 0700 -o root -g root "${old%/*}"
  mv -T -- "$AP_KEY_FILE" "$old"
  plan=$(DESTDIR=/ bash "$polka/install.sh" --dry-run) || plan="ОТКАЗ dry-run"
  if [[ "$plan" != "$AP_PLAN_ODNA" ]]; then
    printf '%s\n' "$plan"; mv -T -- "$old" "$AP_KEY_FILE"
    ap_stop "ДРЕЙФ: план установщика не ровно одна строка ключа — старый ключ возвращён, установщик не звали"
  fi
  if ! DESTDIR=/ bash "$polka/install.sh"; then
    test -e "$AP_KEY_FILE" || mv -T -- "$old" "$AP_KEY_FILE"
    ap_stop "установщик упал — старый ключ на месте, если новый не лёг; разбор"
  fi
  DESTDIR=/ bash "$polka/install.sh" --check
  new16=$(ap_summa16 "$AP_KEY_FILE")
  [[ "$new16" != "$old16" ]] || ap_stop "новый ключ равен старому ($new16)"
  systemctl restart "$AP_UNIT"   # ключ служба берёт через LoadCredential при старте
  ap_zhdat_razdachu /usr/local/bin/razdacha-zdorova
  echo "старый ключ sha256[:16] $old16 — $old; уничтожить п.7 после признаков п.5–6"
  echo "новый ключ sha256[:16] $new16 — дальше п.4 (Михалыч), п.5: на vps-ru та же сумма"
}

ap_unichtozhit() {
  local punkt=$1 old old16 live16
  test "$(id -u)" -eq 0
  old="/var/backups/montazh/$punkt/razdacha-klyuch.old"
  test -f "$old" || ap_stop "нет $old"
  # Живой ключ не трогать: если старый вернули на место, его сумма равна живой — это не ротация.
  old16=$(ap_summa16 "$old"); live16=$(ap_summa16 "$AP_KEY_FILE")
  [[ -n "$old16" && -n "$live16" && "$old16" != "$live16" ]] || ap_stop "$old равен живому ключу или не прочитан — не уничтожаю"
  shred -u -- "$old"
  test ! -e "$old"
  echo "старый ключ уничтожен: $old"
}

case "${1:-}:$#" in
  smenit:3) [[ "$2" =~ ^[A-Za-z0-9-]+$ ]] || ap_stop "пункт: латиница, цифры, дефис"; ap_smenit "$2" "$3" ;;
  unichtozhit-staryj:3)
    [[ "$2" =~ ^[A-Za-z0-9-]+$ && "$3" == --priznaki-5-6-proshli ]] || ap_stop "unichtozhit-staryj <пункт> --priznaki-5-6-proshli"
    ap_unichtozhit "$2" ;;
  *) ap_stop "rotaciya-klyucha.sh smenit <пункт> <полка> | unichtozhit-staryj <пункт> --priznaki-5-6-proshli" ;;
esac
