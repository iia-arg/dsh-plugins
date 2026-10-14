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
# ПРАВИЛО: канарейка перед ЛЮБЫМ перезапуском шлюза (B-N-1482).
# Нагрузочные и модельные проверки в эту пробу не входят.
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
# RU: Боевое окружение — как его соберёт systemd: Environment= юнита и всех drop-in плюс EnvironmentFile=
#     (sreda-yunita.py). Прежде бралось только instance-<агент>.env, и ключи из drop-in (99-gateway-runtime.conf)
#     копия не получала, а проверка «ни одно боевое значение не уцелело» их не видела. KANAREJKA_ENV — готовый
#     файл вместо юнита (стенды); KANAREJKA_UNIT — юнит явно; иначе ровно один загруженный из трёх имён.
# EN: The live environment as systemd builds it: Environment= of the unit and all drop-ins plus EnvironmentFile=
#     (sreda-yunita.py). Before, only instance-<agent>.env was read, so drop-in keys (99-gateway-runtime.conf)
#     never reached the copy and the "no live value survived" check did not see them. KANAREJKA_ENV — a ready
#     file instead of the unit (stands); KANAREJKA_UNIT — the unit explicitly; else exactly one live of three names.
# RU: «Живой» = включён или работает: экземпляр шаблона systemd числит loaded при ЛЮБОМ имени (coder-gateway@iskra
#     loaded, но disabled и inactive — такого шлюза нет).
# EN: "Live" = enabled or running: systemd reports a template instance as loaded for ANY name (coder-gateway@iskra is
#     loaded but disabled and inactive — no such gateway exists).
ENV_EKZ="${KANAREJKA_ENV:-}"
UNIT="${KANAREJKA_UNIT:-}"
if [ -z "$ENV_EKZ" ] && [ -z "$UNIT" ]; then
  for u in "claude-oauth-gateway@$AGENT.service" "coder-gateway@$AGENT.service" "coder-gateway-$AGENT.service"; do
    [ "$(systemctl show "$u" -p LoadState --value 2>/dev/null)" = loaded ] || continue
    if [ "$(systemctl show "$u" -p UnitFileState --value 2>/dev/null)" = enabled ] \
       || [ "$(systemctl show "$u" -p ActiveState --value 2>/dev/null)" = active ]; then UNIT="${UNIT:+$UNIT }$u"; fi
  done
fi
SPISOK="${KANAREJKA_SUSHCHNOSTI:-$(dirname "$0")/edinstvennye-sushchnosti-shlyuza.json}"
NODE="${KANAREJKA_NODE:-/usr/local/bin/node}"
SROK="${KANAREJKA_SROK:-25}"

ok=0; bad=0; slep=0
sud()  { if [ "$1" = 0 ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "FAIL $2: ${3:-}"; fi; }
slepo(){ slep=$((slep+1)); echo "СЛЕПОТА $1: $2"; }

echo "канарейка шлюза: предмет $PREDMET"
if [ -n "${KANAREJKA_DOM:-}" ]; then echo "  дом $DOM (задан KANAREJKA_DOM)"; else echo "  дом $DOM (взят из HOME запускающего — снаружи задавайте KANAREJKA_DOM явно)"; fi

# --- 1. можно ли вообще проверять -------------------------------------------
for f in "$PREDMET" ${ENV_EKZ:+"$ENV_EKZ"} "$SPISOK" "$NODE" "$(dirname "$0")/sreda-yunita.py"; do
  [ -e "$f" ] || { slepo "вход" "нет $f — проверять нечем"; }
done
if [ -z "$ENV_EKZ" ]; then
  case "$UNIT" in
    "") slepo "вход" "юнит шлюза агента $AGENT не найден (claude-oauth-gateway@/coder-gateway@/coder-gateway-) — задайте KANAREJKA_UNIT" ;;
    *" "*) slepo "вход" "юнитов шлюза агента $AGENT несколько: $UNIT — задайте KANAREJKA_UNIT" ;;
    *) echo "  окружение: юнит $UNIT (Environment= + EnvironmentFile=)" ;;
  esac
else
  echo "  окружение: файл $ENV_EKZ (задан KANAREJKA_ENV)"
fi
[ "$slep" = 0 ] || { echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."; exit 2; }

# --- 1б. один прогон за раз (B-N-1052, 26.09.2026) ---------------------------
# Порт копии выбирается снимком ss, а занимается позже, при подъёме: две канарейки разом брали
# ОДИН порт, и вторая копия не вставала — ложное красное на исправном шлюзе (12:04Z, Забава и
# Аврора на /opt/avrora). Замок держится весь прогон; копия наследует его и держит, пока жива.
# ЧЕГО НЕ ЛОВИТ: чужой процесс (не канарейку), занявший порт между снимком и подъёмом.
ZAMOK="${KANAREJKA_ZAMOK:-/run/lock/kanarejka-shlyuza.lock}"
if ! exec 9>>"$ZAMOK"; then
  slepo "замок" "не открыть $ZAMOK (канарейка ходит от root)"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."; exit 2
fi
if ! flock -n 9; then
  slepo "замок" "канарейка ЗАНЯТА — идёт прогон pid $(cat "$ZAMOK.pid" 2>/dev/null || echo '?'); второй разом дал бы ложное красное"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."; exit 2
fi
echo "$$" > "$ZAMOK.pid"

# --- 2. свой временный дом ---------------------------------------------------
VREM="$(mktemp -d /tmp/kanarejka-shlyuza-XXXXXX)" || { slepo "вход" "не завести временный каталог"; exit 2; }
uborka() { [ -n "${VREM:-}" ] && rm -rf "$VREM"; }
trap uborka EXIT
if [ -z "$ENV_EKZ" ]; then
  ENV_EKZ="$VREM/boevaya-sreda.env"
  python3 "$(dirname "$0")/sreda-yunita.py" "$UNIT" "$ENV_EKZ" \
    || { slepo "окружение" "окружение юнита $UNIT не собрано — проверять нечем"; echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."; exit 2; }
fi

# --- 3. свободный порт: замером, а не по удаче -------------------------------
PORT_KOPII=""
for p in $(seq 18800 18860); do
  if ! ss -ltn 2>/dev/null | grep -q ":$p "; then PORT_KOPII="$p"; break; fi
done
[ -n "$PORT_KOPII" ] || { slepo "порт" "свободного порта в 18800-18860 нет"; echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; exit 2; }

# B-N-1049: порт моста Codex копии — тоже замером. Прежде GATEWAY_MCP_PORT подменялся пустым, и копия
# брала умолчание кода «свой порт + 100», которого никто не мерил: занятый 18900 ронял мост копии
# (EADDRINUSE), а канарейка оставалась зелёной. Мост поднимается только у поставщика openai.
PORT_MOSTA=""
for p in $(seq 18900 18960); do
  if ! ss -ltn 2>/dev/null | grep -q ":$p "; then PORT_MOSTA="$p"; break; fi
done
[ -n "$PORT_MOSTA" ] || { slepo "порт" "свободного порта моста в 18900-18960 нет"; echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; exit 2; }

# --- 4. подставной токен -----------------------------------------------------
TOKEN_KOPII="$VREM/token-podstavnoj"
printf 'podstavnoj-token-kanarejki-%s\n' "$$" > "$TOKEN_KOPII"
chmod 600 "$TOKEN_KOPII"

# B-N-1482: отдельный синтетический ingress-ключ; значения не попадают в argv/журнал.
INGRESS_KOPII="$(mktemp "$VREM/ingress-XXXXXX")" || exit 2
chmod 600 "$INGRESS_KOPII" || exit 2
if ! python3 - "$INGRESS_KOPII" "$VREM" <<'PYKEY'
import os, secrets, sys
key = secrets.token_hex(32)
with open(sys.argv[1], 'w', encoding='ascii') as f: f.write(key+'\n')
for name, value in [('auth-own', key), ('auth-other', secrets.token_hex(32))]:
    fd = os.open(os.path.join(sys.argv[2], name), os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f: f.write('Authorization: Bearer '+value+'\n')
PYKEY
then slepo "ingress" "не создан синтетический ключ"; exit 2; fi
# Версия берётся с диска, а не из health: пропавшее поле health не должно отключать пробу.
if ! INGRESS_NUZHEN="$(python3 - "$(dirname "$PREDMET")/package.json" <<'PYVERSION'
import json, re, sys
v=json.load(open(sys.argv[1], encoding='utf-8'))['version']
m=re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:[-+].*)?',v)
if not m: raise ValueError('не разобрана версия шлюза')
print('yes' if tuple(map(int,m.groups())) >= (0,4,29) else 'no')
PYVERSION
)"; then slepo "версия" "не определён договор ingress у $PREDMET"; exit 2; fi

# --- 5. боевые значения — чтобы потом искать их у копии ----------------------
BOEVOJ_PORT="$(grep -E '^GATEWAY_PORT=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_TOKEN="$(grep -E '^GATEWAY_TOKEN_FILE=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_DIR="$(grep -E '^GATEWAY_WORK_DIR=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2)"
BOEVOJ_MCP="$(grep -E '^GATEWAY_MCP=' "$ENV_EKZ" 2>/dev/null | cut -d= -f2-)"

# --- 6. окружение копии: подмены СТРОЯТСЯ ИЗ СПИСКА -------------------------
SREDA="$VREM/sreda.env"
grep -E '^[A-Z_]+=' "$ENV_EKZ" > "$SREDA" 2>/dev/null
if ! python3 "$(dirname "$0")/podmeny-shlyuza.py" "$SPISOK" "$PORT_KOPII" "$TOKEN_KOPII" "$VREM" "$SREDA" "$PORT_MOSTA" "$INGRESS_KOPII"; then
  slepo "список" "список сущностей не разобран или содержит неизвестный вид подмены: $SPISOK"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
  echo "РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ."
  exit 2
fi

# --- 7. ПРОВЕРКА РЕЗУЛЬТАТА: по ВСЕМ значениям env, а не по списку ----------
# Итоговое окружение собирается так же, как его соберёт запуск (последнее значение
# ключа побеждает). Требование: ни одно боевое значение не уцелело.
# RU: Сборка — Python, значение берётся как есть: `IFS='=' read` срезал конечный «=» (значение «abc=» давало «abc»),
#     и такое боевое значение и у копии искажалось, и проверкой считалось подменённым.
# EN: Built in Python, the value taken as is: `IFS='=' read` dropped a trailing "=" ("abc=" became "abc"), so such a
#     live value was both corrupted in the copy and counted as substituted by the check.
ITOG="$VREM/itog.env"
python3 - "$SREDA" "$ITOG" <<'PYITOG' || { slepo "окружение" "итог окружения копии не собран"; exit 2; }
import sys
d = {}
for l in open(sys.argv[1], encoding='utf-8'):
    k, sep, v = l.rstrip('\n').partition('=')
    if k and sep: d.pop(k, None); d[k] = v
open(sys.argv[2], 'w', encoding='utf-8').write(''.join(f'{k}={v}\n' for k, v in d.items()))
PYITOG

OSTATKI="$VREM/ostatki.txt"
# 🔴 КОД РАЗБОРЩИКА СНИМАЕТСЯ ОТДЕЛЬНО, А ФАЙЛ ПРОВЕРЯЕТСЯ НА СУЩЕСТВОВАНИЕ (07.09.2026).
# Прежде было: запустили python, прочитали файл через `cat … 2>/dev/null`, пусто → ЗЕЛЁНОЕ
# «боевых значений у копии не осталось». Упади разборщик (нет прав, ошибка, не тот путь) —
# файла нет, вывод пуст, и отказ ИНСТРУМЕНТА печатался бы как чистый результат ПРОВЕРКИ.
# Это третья форма класса «отказ инструмента неотличим от отрицательного ответа о предмете»
# (первые две: `2>/dev/null` и код конвейера). Здесь цена высокая: проверка стережёт, чтобы
# копия шлюза не отняла у боевого настоящие значения.
if ! python3 "$(dirname "$0")/ostatki-shlyuza.py" "$ENV_EKZ" "$ITOG" "$SPISOK" "$OSTATKI"; then
  sud 2 "проверка результата: РАЗБОРЩИК ОТКАЗАЛ" "это про прибор, а не про копию: чисто ли у неё — НЕ ПРОВЕРЕНО"
  exit 1
elif [ ! -f "$OSTATKI" ]; then
  sud 2 "проверка результата: разборщик не создал файл ответа" "пустота здесь значила бы «чисто», а значит «не смотрели»"
  exit 1
else
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
fi

# --- 8. запуск ОТДЕЛЬНЫМ ПРОЦЕССОМ (не импортом) ----------------------------
LOG="$VREM/kopiya.log"
# RU: Окружение копии — без разбора оболочкой: `. "$ITOG"` снимал кавычки в значениях (JSON-список
#     GATEWAY_CONTINUATION_ALLOWLIST из drop-in приходил бы как [alfa,beta]). Значения подаются execve как есть.
# EN: The copy's environment is not parsed by the shell: `. "$ITOG"` stripped quotes inside values (the JSON list
#     GATEWAY_CONTINUATION_ALLOWLIST from a drop-in would arrive as [alfa,beta]). Values go to execve as is.
python3 -c 'import os, sys
e = dict(os.environ)
for l in open(sys.argv[1], encoding="utf-8"):
    k, sep, v = l.rstrip("\n").partition("=")
    if k and sep: e[k] = v
os.execve(sys.argv[2], [sys.argv[2], sys.argv[3]], e)' "$ITOG" "$NODE" "$PREDMET" >"$LOG" 2>&1 &
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
  # B-N-1575: имя через mktemp (O_EXCL, 600), а не предсказуемое «-$$.log»: заранее положенное на предсказуемом
  # имени срывало сохранение лога молча; на машине без protected_symlinks — ещё и запись по ссылке.
  SPASENO=$(mktemp "/tmp/kanarejka-shlyuza-otkaz-$$-XXXXXX.log" 2>/dev/null) \
    && cp "$LOG" "$SPASENO" 2>/dev/null && echo "      полный вывод копии сохранён: $SPASENO" \
    || { [ -n "${SPASENO:-}" ] && rm -f -- "$SPASENO"; echo "      лог отказа НЕ сохранён" >&2; }
elif [ "$gotova" != 0 ]; then
  sud 1 "копия поднялась" "за ${SROK} с не ответила на /health"
else
  sud 0 "копия поднялась"

  # --- 9. готовность ПО СУЩЕСТВУ, а не «порт принял соединение» -------------
  telo="$(cat "$VREM/health.json" 2>/dev/null)"
  case "$telo" in *'"ok":true'*) sud 0 "health отвечает по существу (ok:true, токен читается)";;
    *) sud 1 "health отвечает по существу" "тело: ${telo:-пусто}";; esac

  if [ "$INGRESS_NUZHEN" = yes ]; then
    if python3 - "$VREM/health.json" <<'PYHEALTH'
import json,sys
d=json.load(open(sys.argv[1]));sys.exit(0 if d.get('ok') is True and d.get('ingress')=='ready' else 1)
PYHEALTH
    then sud 0 "ingress готов в health"; else sud 1 "ingress готов в health" "нет ok:true и ingress:ready"; fi
    # Даже верный ключ получает только битый JSON: запрос к модели не начинается.
    for route in v1 v2; do
      for auth in none other own; do
        headers=(); expected=401; kind=unauthorized
        if [ "$auth" != none ]; then headers=(-H "@$VREM/auth-$auth"); fi
        if [ "$auth" = own ]; then expected=400; kind=bad_json; fi
        status="$(curl -s -o "$VREM/auth-response.json" -w '%{http_code}' -m 3 \
          -X POST "${headers[@]}" -H 'Content-Type: application/json' --data-binary '{' \
          "http://127.0.0.1:$PORT_KOPII/$route/agent-stream" 2>/dev/null)"
        if [ "$status" = "$expected" ] && python3 - "$VREM/auth-response.json" "$kind" <<'PYAUTH'
import json,sys
sys.exit(0 if json.load(open(sys.argv[1])).get('error',{}).get('type')==sys.argv[2] else 1)
PYAUTH
        then sud 0 "ingress $route/$auth: HTTP $expected"; echo "  ingress $route/$auth: HTTP $expected ($kind)"
        else sud 1 "ingress $route/$auth" "HTTP $status, ожидался $expected/$kind"; fi
      done
    done
  else
    echo "  ingress: версия до 0.4.29, проверки авторизации неприменимы"
  fi

  kod404="$(curl -s -o "$VREM/n.json" -w '%{http_code}' -m 3 "http://127.0.0.1:$PORT_KOPII/net-takogo" 2>/dev/null)"
  if [ "$kod404" = 404 ] && grep -q 'неизвестный путь' "$VREM/n.json" 2>/dev/null; then
    sud 0 "маршрутизация жива (404 со своим текстом на чужом пути)"
  else
    sud 1 "маршрутизация жива" "код $kod404, тело $(LC_ALL=C.utf8 sed -e 's/\(.\{0,80\}\).*/\1/' "$VREM/n.json" 2>/dev/null | head -1)"
  fi

  kodm="$(curl -s -o "$VREM/m.json" -w '%{http_code}' -m 3 "http://127.0.0.1:$PORT_KOPII/v1/agent-stream" 2>/dev/null)"
  if [ "$kodm" = 404 ]; then
    sud 0 "разбор метода жив (GET на поток даёт 404, а не приём)"
  else
    sud 1 "разбор метода жив" "код $kodm"
  fi
fi

# --- 9б. мост копии слушает СВОЙ порт (B-N-1049; только поставщик openai) ------------------
POSTAVSHCHIK_KOPII="$(grep -E '^GATEWAY_POSTAVSHIK=' "$ITOG" 2>/dev/null | tail -1 | cut -d= -f2)"
if [ "$POSTAVSHCHIK_KOPII" = openai ] && [ "$gotova" = 0 ]; then
  # мост встаёт в обработчике listen, ПОСЛЕ готовности /health — до пяти попыток, не одним снимком
  most=1; for _ in 1 2 3 4 5; do ss -ltn 2>/dev/null | grep -q ":$PORT_MOSTA " && { most=0; break; }; sleep 1; done
  sud "$most" \
      "мост копии слушает свой порт $PORT_MOSTA" "порт моста $PORT_MOSTA не слушается — мост копии не встал"
  echo "  мост копии: порт $PORT_MOSTA (замером), слушает=$([ "$most" = 0 ] && echo да || echo нет)"
fi

# --- 10. погасить и убедиться ------------------------------------------------
if kill -0 "$PID_KOPII" 2>/dev/null; then kill "$PID_KOPII" 2>/dev/null; sleep 2; fi
kill -0 "$PID_KOPII" 2>/dev/null && kill -9 "$PID_KOPII" 2>/dev/null && sleep 1
sud "$(kill -0 "$PID_KOPII" 2>/dev/null && echo 1 || echo 0)" "копия погашена" "процесс $PID_KOPII жив"
sud "$(ss -ltn 2>/dev/null | grep -q ":$PORT_KOPII " && echo 1 || echo 0)" "порт копии освобождён" "порт $PORT_KOPII занят"
sud "$(ss -ltn 2>/dev/null | grep -q ":$PORT_MOSTA " && echo 1 || echo 0)" "порт моста копии освобождён" "порт $PORT_MOSTA занят"

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
