#!/usr/bin/env bash
# КАНАРЕЙКА ШЛЮЗА ПОДПИСКИ — проба перед перезапуском живого шлюза.
#
# ЗАЧЕМ. Перезапуск шлюза опаснее перезапуска платформы: заход агента живёт в его
# cgroup и умирает вместе с ним. Если правленый gateway.mjs сломан, агент не
# вернётся вовсе, и чинить будет некому изнутри — только рукой снаружи. До
# 02.09.2026 у самого опасного файла контура не было пробы, кроме грамматики.
#
# ЧТО ДЕЛАЕТ. Поднимает ОТДЕЛЬНЫМ ПРОЦЕССОМ копию шлюза со всеми подменёнными
# единственными сущностями, спрашивает у неё ответ ПО СУЩЕСТВУ и гасит.
#
# 🔴 ЧЕГО НЕ ДЕЛАЕТ НИКОГДА: не перезапускает ничего. Зелёная — это РАЗРЕШЕНИЕ
# человеку, а не команда машине. Решение о рестарте принимает человек.
#
# 🔴 ПОЧЕМУ НЕ ИМПОРТОМ. gateway.mjs есть ТОЧКА ВХОДА службы: его импорт
# ЗАПУСКАЕТ сервер. 02.09.2026 проверка «цел ли файл» через import подняла второй
# шлюз на живой машине; не поднялся он лишь потому, что порт был занят боевым —
# помешала среда, а не осторожность. Здесь предмет запускается только отдельным
# процессом и только с подменёнными сущностями.
#
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: перезапуск ради освобождения памяти и перезапуск по тревоге
# сторожа — там предмет не менялся, и проба ничего не добавит, кроме задержки.
#
# ЧЕГО ЭТОТ КЛАСС НЕ ЛОВИТ: порчу данных, медленную деградацию, ошибки, живущие
# в обработке запроса к модели. Канарейка отвечает на «поднимется ли и отвечает ли
# осмысленно», а не на «работает ли правильно» — последнее закрывают стенды.
#
# ЗАПУСК СНАРУЖИ: только с явным KANAREJKA_DOM=/opt/<агент> — иначе дом берётся от
# $HOME запускающего, и проба ищет предмет в чужом каталоге.
set -uo pipefail

DOM="${KANAREJKA_DOM:-$HOME}"
AGENT="$(basename "$DOM")"
PREDMET="${KANAREJKA_PREDMET:-/opt/claude-oauth/gateway.mjs}"
ENV_EKZ="${KANAREJKA_ENV:-/etc/claude-oauth/instance-${AGENT}.env}"
SPISOK="${KANAREJKA_SUSHCHNOSTI:-$(dirname "$0")/edinstvennye-sushchnosti-shlyuza.json}"
NODE="${KANAREJKA_NODE:-/usr/local/bin/node}"
SROK="${KANAREJKA_SROK:-25}"

ok=0; bad=0; slep=0
sud()  { if [ "$1" = 0 ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "FAIL $2: ${3:-}"; fi; }
slepo(){ slep=$((slep+1)); echo "СЛЕПОТА $1: $2"; }

echo "канарейка шлюза: предмет $PREDMET"
if [ -n "${KANAREJKA_DOM:-}" ]; then echo "  дом $DOM (задан KANAREJKA_DOM)"; else echo "  дом $DOM (взят из HOME запускающего — снаружи задавайте KANAREJKA_DOM явно)"; fi

# --- 1. можно ли вообще проверять -------------------------------------------
for f in "$PREDMET" "$ENV_EKZ" "$SPISOK" "$NODE"; do
  [ -e "$f" ] || { slepo "вход" "нет $f — проверять нечем"; }
done
[ "$slep" = 0 ] || { echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."; exit 2; }

# --- 2. свой временный дом ---------------------------------------------------
VREM="$(mktemp -d /tmp/kanarejka-shlyuza-XXXXXX)" || { slepo "вход" "не завести временный каталог"; exit 2; }
uborka() { [ -n "${VREM:-}" ] && rm -rf "$VREM"; }
trap uborka EXIT

# --- 3. свободный порт: замером, а не по удаче -------------------------------
PORT_KOPII=""
for p in $(seq 18800 18860); do
  if ! ss -ltn 2>/dev/null | grep -q ":$p "; then PORT_KOPII="$p"; break; fi
done
[ -n "$PORT_KOPII" ] || { slepo "порт" "свободного порта в 18800-18860 нет"; echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; exit 2; }

# --- 4. подставной токен -----------------------------------------------------
TOKEN_KOPII="$VREM/token-podstavnoj"
printf 'podstavnoj-token-kanarejki-%s\n' "$$" > "$TOKEN_KOPII"
chmod 600 "$TOKEN_KOPII"

# --- 5. боевые значения — чтобы потом искать их у копии ----------------------
BOEVOJ_PORT="$(grep -E '^GATEWAY_PORT=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_TOKEN="$(grep -E '^GATEWAY_TOKEN_FILE=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_DIR="$(grep -E '^GATEWAY_WORK_DIR=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_MCP="$(grep -E '^GATEWAY_MCP=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2-)"

# --- 6. окружение копии: подмены СТРОЯТСЯ ИЗ СПИСКА -------------------------
SREDA="$VREM/sreda.env"
grep -E '^[A-Z_]+=' "$ENV_EKZ" > "$SREDA" 2>/dev/null
if ! python3 "$(dirname "$0")/podmeny-shlyuza.py" "$SPISOK" "$PORT_KOPII" "$TOKEN_KOPII" "$VREM" "$SREDA"; then
  slepo "список" "список сущностей не разобран или содержит неизвестный вид подмены: $SPISOK"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
  echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."
  exit 2
fi

# --- 7. ПРОВЕРКА РЕЗУЛЬТАТА: по ВСЕМ значениям env, а не по списку ----------
# Итоговое окружение собирается так же, как его соберёт запуск (последнее значение
# ключа побеждает). Требование: ни одно боевое значение не уцелело.
ITOG="$VREM/itog.env"
: > "$ITOG"
while IFS='=' read -r k v; do
  [ -n "$k" ] || continue
  grep -v "^$k=" "$ITOG" > "$ITOG.tmp" 2>/dev/null || true
  mv "$ITOG.tmp" "$ITOG"
  echo "$k=$v" >> "$ITOG"
done < "$SREDA"

OSTATKI="$VREM/ostatki.txt"
python3 "$(dirname "$0")/ostatki-shlyuza.py" "$ENV_EKZ" "$ITOG" "$SPISOK" "$OSTATKI"
ostatki="$(cat "$OSTATKI" 2>/dev/null)"
if [ -z "$ostatki" ]; then
  sud 0 "проверка результата: боевых значений у копии не осталось"
else
  sud 1 "проверка результата: боевых значений у копии не осталось" "уцелели: $(echo "$ostatki" | tr '\n' ' ')"
  echo "🔴 подъём копии ЗАПРЕЩЁН: она отняла бы у боевого."
  echo "   Впишите ключ либо в sushchnosti (чем подменять), либо в bezvrednye с причиной."
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
  echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."
  exit 1
fi

# --- 8. запуск ОТДЕЛЬНЫМ ПРОЦЕССОМ (не импортом) ----------------------------
LOG="$VREM/kopiya.log"
( set -a; . "$ITOG"; set +a; exec "$NODE" "$PREDMET" ) >"$LOG" 2>&1 &
PID_KOPII=$!

gotova=1
for _ in $(seq 1 "$SROK"); do
  sleep 1
  kill -0 "$PID_KOPII" 2>/dev/null || break
  if curl -s -m 2 "http://127.0.0.1:$PORT_KOPII/health" >"$VREM/health.json" 2>/dev/null; then gotova=0; break; fi
done

if ! kill -0 "$PID_KOPII" 2>/dev/null; then
  # Причина падения стоит в НАЧАЛЕ вывода, а хвост — стек вызовов рантайма.
  # tail показывал бы «at async …» и прятал бы саму ошибку (поймано порчей 02.09).
  sud 1 "копия поднялась" "процесс умер, причина:"
  { grep -m1 -E '^[A-Za-z]*Error' "$LOG" || head -3 "$LOG"; } | sed 's/^/      /'
  # Временный каталог уберётся при выходе — значит полный вывод надо СПАСТИ сейчас,
  # иначе разбирать отказ будет не по чему.
  SPASENO="/tmp/kanarejka-shlyuza-otkaz-$$.log"
  cp "$LOG" "$SPASENO" 2>/dev/null && echo "      полный вывод копии сохранён: $SPASENO"
elif [ "$gotova" != 0 ]; then
  sud 1 "копия поднялась" "за ${SROK} с не ответила на /health"
else
  sud 0 "копия поднялась"

  # --- 9. готовность ПО СУЩЕСТВУ, а не «порт принял соединение» -------------
  telo="$(cat "$VREM/health.json" 2>/dev/null)"
  case "$telo" in *'"ok":true'*) sud 0 "health отвечает по существу (ok:true, токен читается)";;
    *) sud 1 "health отвечает по существу" "тело: ${telo:-пусто}";; esac

  kod404="$(curl -s -o "$VREM/n.json" -w '%{http_code}' -m 3 "http://127.0.0.1:$PORT_KOPII/net-takogo" 2>/dev/null)"
  if [ "$kod404" = 404 ] && grep -q 'неизвестный путь' "$VREM/n.json" 2>/dev/null; then
    sud 0 "маршрутизация жива (404 со своим текстом на чужом пути)"
  else
    sud 1 "маршрутизация жива" "код $kod404, тело $(head -c 80 "$VREM/n.json" 2>/dev/null)"
  fi

  kodm="$(curl -s -o "$VREM/m.json" -w '%{http_code}' -m 3 "http://127.0.0.1:$PORT_KOPII/v1/agent-stream" 2>/dev/null)"
  if [ "$kodm" = 404 ]; then
    sud 0 "разбор метода жив (GET на поток даёт 404, а не приём)"
  else
    sud 1 "разбор метода жив" "код $kodm"
  fi
fi

# --- 10. погасить и убедиться ------------------------------------------------
if kill -0 "$PID_KOPII" 2>/dev/null; then kill "$PID_KOPII" 2>/dev/null; sleep 2; fi
kill -0 "$PID_KOPII" 2>/dev/null && kill -9 "$PID_KOPII" 2>/dev/null && sleep 1
sud "$(kill -0 "$PID_KOPII" 2>/dev/null && echo 1 || echo 0)" "копия погашена" "процесс $PID_KOPII жив"
sud "$(ss -ltn 2>/dev/null | grep -q ":$PORT_KOPII " && echo 1 || echo 0)" "порт копии освобождён" "порт $PORT_KOPII занят"

# --- 11. боевое не тронуто ---------------------------------------------------
sud "$(ss -ltn 2>/dev/null | grep -q ":${BOEVOJ_PORT:-8789} " && echo 0 || echo 1)" \
    "боевой шлюз слушает как слушал" "порт ${BOEVOJ_PORT:-8789} не отвечает"

echo
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
echo "🔴 РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ — зелёная канарейка есть разрешение человеку, а не действие."
echo "не проверено: правильность обработки запросов к модели; поведение под нагрузкой;"
echo "              совместимость с платформой — их закрывают стенды, а не эта проба."
[ "$bad" -gt 0 ] && exit 1
[ "$slep" -gt 0 ] && exit 2
exit 0
