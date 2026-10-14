#!/usr/bin/env bash
# Кнопка — исполнитель разрешённых команд по дропу файла.
#
# ЗАЧЕМ. Агент не может перезапустить сам себя: перезапуская свою службу, он
# убивает процесс, из которого отдаёт команду, — и заказчик, и исполнитель гибнут
# на середине. Нужен кто-то ВНЕ его дерева процессов. Это он.
#
# КАК. Агент кладёт файл со строкой-командой в pending/. Демон (отдельная
# системная служба, свой cgroup) читает, сверяет со списком разрешённого,
# выполняет, кладёт вывод и код возврата в done/, запрос убирает в processed/.
#
# ГРАНИЦЫ БЕЗОПАСНОСТИ:
#   • список разрешённого — в /etc/agent-button/allowed.conf, и это ЕДИНСТВЕННОЕ,
#     что демон умеет выполнять. Произвольные строки не исполняются никогда.
#   • имя команды сверяется целиком, не по маске и не подстрокой.
#   • владелец файла-запроса пишется в журнал — видно, кто просил.
#   • 🔴 кто может писать в pending/, тот может дёрнуть ЛЮБУЮ команду из списка.
#     Поэтому в группу доступа НЕ добавлять гостевых агентов: для них это был бы
#     обход отсутствия sudo.
set -euo pipefail

ROOT="${AGENT_BUTTON_ROOT:-/var/lib/agent-button}"
CONF="${AGENT_BUTTON_CONF:-/etc/agent-button/allowed.conf}"
LOGDIR="$ROOT/logs"
# work/ — закрытый каталог разбора (700, пишет только root): запрос переносится сюда
# ПЕРЕД любой проверкой, и подменить его между проверкой и чтением некому (A-N-1948 №1).
WORK="$ROOT/work"
mkdir -p "$ROOT/pending" "$ROOT/done" "$ROOT/processed" "$LOGDIR" "$WORK"
chmod 700 "$WORK"

log() { echo "[$(date -Iseconds)] $*" >> "$LOGDIR/button-$(date +%Y-%m-%d).log"; }

# Читает список разрешённого: строки вида «имя = команда». Пустые и с # — мимо.
lookup() {
  local want="$1" name rest
  [ -r "$CONF" ] || return 1
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    name="${line%%=*}"; rest="${line#*=}"
    name="$(echo "$name" | xargs)"
    [ "$name" = "$want" ] || continue
    echo "$rest" | xargs -0 echo 2>/dev/null || echo "$rest"
    return 0
  done < "$CONF"
  return 1
}

log "кнопка запущена (pid $$), список: $CONF"

while true; do
  shopt -s nullglob
  for req in "$ROOT/pending/"*.cmd; do
    name="$(basename "$req" .cmd)"
    # A-N-1948 №5 (LOW Вениамина): имя — только A-Z a-z 0-9 . _ @ + - ; иное (перевод строки и прочие знаки подделали бы
    # строку журнала) — отказ без чтения, имя в журнал экранированным, запрос в processed/ под безопасным именем, done/ нет.
    # Счёт через wc -c: подстановка $(…) срезала бы перевод строки в конце, grep -x пропустил бы многострочное имя.
    if [ "$(printf '%s' "$name" | LC_ALL=C tr -d 'A-Za-z0-9._@+-' | wc -c)" != 0 ]; then
      log "ОТКАЗ: запрос с недопустимым именем $(printf '%q' "$name") — допустимы A-Z a-z 0-9 . _ @ + -"
      mv -f -- "$req" "$ROOT/processed/nedopustimoe-imya-$(date +%s)-$RANDOM.cmd" 2>/dev/null || rm -f -- "$req"
      continue
    fi
    # A-N-1948 №1, №7: rename не разыменовывает ссылку и не открывает FIFO — переносим саму запись
    # каталога и дальше смотрим только на неё. Принимается ОБЫЧНЫЙ файл с одной жёсткой ссылкой;
    # ссылка, FIFO, сокет, устройство, каталог, вторая жёсткая ссылка — отказ без чтения.
    w="$WORK/$name.cmd"
    mv -f -- "$req" "$w" 2>/dev/null || { log "ОТКАЗ: запрос $name — не удалось взять из pending/"; continue; }
    tip="$(stat -c '%F' -- "$w" 2>/dev/null || echo '?')"
    ssylok="$(stat -c '%h' -- "$w" 2>/dev/null || echo '?')"
    who="$(stat -c '%U' -- "$w" 2>/dev/null || echo '?')"
    cmd=""
    case "$tip" in
      'regular file'|'regular empty file')
        [ "$ssylok" = 1 ] || tip="обычный файл с жёсткими ссылками: $ssylok"
        ;;
    esac
    if [ "$tip" = 'regular file' ] || [ "$tip" = 'regular empty file' ]; then
      # timeout — страховка: обычный файл чтения не вешает, но цикл кнопки один на всех.
      cmd="$(timeout 5 head -c 4096 -- "$w" 2>/dev/null | head -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')" || true
    fi

    # В журнал и в done/ — только ИМЯ запроса, текст — лишь когда он совпал с именем из списка
    # (A-N-1948 №1: непринятый текст мог быть содержимым чужого файла).
    if [ "$tip" != 'regular file' ] && [ "$tip" != 'regular empty file' ]; then
      out="запрос $name отклонён: не обычный файл ($tip)"
      rc=65
      log "ОТКАЗ: запрос $name от $who — не обычный файл ($tip)"
    elif action="$(lookup "$cmd")"; then
      log "запрос: $name от $who → '$cmd'"
      out=""; rc=0
      # Команда из списка исполняется как есть. Список пишет человек, не агент.
      if out="$(bash -c "$action" 2>&1)"; then rc=0; else rc=$?; fi
      log "выполнено: $cmd → код $rc"
    else
      out="запрос $name: команды нет в списке разрешённого ($CONF)"
      rc=64
      log "ОТКАЗ: запрос $name от $who — команды нет в списке"
    fi
    req="$w"

    printf '%s\n' "$out" > "$ROOT/done/$name.out"
    printf '%s\n' "$rc"  > "$ROOT/done/$name.rc"
    # Результат должен быть читаем тем, кто просил.
    chmod 644 "$ROOT/done/$name.out" "$ROOT/done/$name.rc" 2>/dev/null || true
    mv -f "$req" "$ROOT/processed/$name.cmd" 2>/dev/null || rm -f "$req"
  done
  shopt -u nullglob
  sleep 3
done
