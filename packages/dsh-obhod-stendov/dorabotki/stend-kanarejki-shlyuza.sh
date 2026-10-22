#!/bin/bash
# Стенд канарейки шлюза: проверяет ИСХОДЫ инструмента, а не наличие строк.
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ: не проверяет, правильно ли шлюз обрабатывает запросы к
# модели, и не ловит медленную деградацию — это не предмет канарейки.
#
# Боевая установка задаётся снаружи; умолчания нет намеренно — у всякого другого
# агента каталоги свои, и тихий поиск чужого пути хуже внятного отказа.
# Прогон поднимает копию шлюза до восьми раз, это ~40 секунд. Коды: 0 | 1 | 2.
set -uo pipefail
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
BOEVOJ_DOM="${KANAREJKA_ISHODNYJ_DOM:-}"
[ -n "$BOEVOJ_DOM" ] || { echo "СЛЕПОТА: не задан KANAREJKA_ISHODNYJ_DOM (каталог боевой установки агента). Проверять нечем."; exit 2; }
RYADOM="$(cd "$(dirname "$0")" && pwd)"
K=${1:-$RYADOM/kanarejka-shlyuza.sh}
SHLYUZ_DIR="${KANAREJKA_SHLYUZ_DIR:-/opt/claude-oauth}"
SOSTAV="$RYADOM/zayavlennye-proverki-kanarejki-shlyuza.json"

[ -f "$K" ] || { echo "СЛЕПОТА: предмета нет: $K"; exit 2; }
[ -x "$K" ] || { echo "СЛЕПОТА: предмет есть, но не исполняемый: $K (chmod +x)"; exit 2; }
[ -r "$SHLYUZ_DIR/gateway.mjs" ] || { echo "СЛЕПОТА: не читается $SHLYUZ_DIR/gateway.mjs — не с чего готовить порчи"; exit 2; }

ok=0; bad=0; slep=0; ISPOLNENO=""
sud() { ISPOLNENO="$ISPOLNENO$2"$'\n'
        if [ "$1" = да ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "FAIL $2: ${3:-}"; fi; }
# Имя проверки одно на обе ветки: разное написание при успехе и неуспехе делало бы
# покрытие ложным ровно тогда, когда предмет плох (поймано на стенде платформы 02.09).
prov() { # ждём_код имя команда...
  local zhdem="$1" imya="$2"; shift 2
  local vyv kod
  vyv=$("$@" 2>&1); kod=$?
  # B-N-1042: лог отказа канарейка сохраняет в /tmp под СВОИМ pid и печатает путь — запоминаем ровно его, уборка — только своё
  printf '%s\n' "$vyv" | grep -oE '/tmp/kanarejka-shlyuza-otkaz-[0-9]+(-[A-Za-z0-9]+)?\.log' >> "$TD/spasennye" 2>/dev/null
  if [ "$kod" = "$zhdem" ]; then sud да "$imya"; else sud нет "$imya" "ждали код $zhdem, дано $kod"; fi
  POSLEDNIJ_VYVOD="$vyv"
}

echo "предмет: $K (sha256-16 $(sha256sum "$K" | cut -c1-16))"

# B-N-1059 (26.09.2026, находка Авроры N5): канарейка держит ОБЩИЙ замок на прогон (B-N-1052). Идёт чужой прогон — каждый
# вызов ниже честно получит «ЗАНЯТА», код 2, а пробы ждут 0/1 ⇒ ложные FAIL, обходчик прочёл бы «поломку канарейки».
# Поэтому ДО первой пробы — пробный захват и сразу отпуск: занят ⇒ СЛЕПОТА, ни одной пробы. Держать замок весь прогон
# стенд не может — его же вызовы канарейки получили бы «ЗАНЯТА». ЧЕГО НЕ ЛОВИТ: чужой прогон, начавшийся в окно между
# этой пробой и первым вызовом (секунды) — тогда FAIL вернутся, и это будет видно по «ЗАНЯТА» в выводе проб.
ZAMOK_OBSHCHIJ="${KANAREJKA_ZAMOK:-/run/lock/kanarejka-shlyuza.lock}"
if [ -e "$ZAMOK_OBSHCHIJ" ] && exec 8<"$ZAMOK_OBSHCHIJ" && ! flock -n 8; then
  echo "СЛЕПОТА замок: канарейка ЗАНЯТА другим прогоном (pid по $ZAMOK_OBSHCHIJ.pid: $(cat "$ZAMOK_OBSHCHIJ.pid" 2>/dev/null || echo '?'); держатель может быть и не канарейкой) — стенд не проверял ничего"
  echo "ИТОГО: сошлось 0, расхождений 0, слепот 1"
  exit 2
fi
exec 8<&- 2>/dev/null

# --- порченые копии шлюза: соседние файлы и node_modules обязаны быть рядом ---
# Иначе копия падает не от порчи, а от неразрешённых зависимостей, и стенд
# проверяет собственную фикстуру вместо предмета (поймано 02.09).
TD=$(mktemp -d /tmp/stend-kan-shl-XXXXXX)
# B-N-1042 (26.09.2026, Аврора; находка Зари 11:22Z): прежде уборка шла МАСКОЙ /tmp/kanarejka-shlyuza-otkaz-*.log —
# сносила логи отказа соседнего прогона стенда и ручного прогона канарейки (её единственный след разбора). Теперь —
# только пути, которые назвали НАШИ прогоны канарейки («полный вывод копии сохранён: <путь>»).
uborka() { [ -f "$TD/spasennye" ] && while IFS= read -r f; do rm -f -- "$f"; done < "$TD/spasennye"; rm -rf "$TD"; }
trap uborka EXIT
# B-N-1088 (26.09.2026, Аврора; находка Искры: самоссылка /opt/agent-plugins/node_modules/node_modules, 13:31:45Z): стол — только
# СВЕЖИЙ каталог вне шлюза. Пустой TD — копии шлюза в «/»; стол = каталог шлюза или внутри его node_modules — ссылка легла бы
# ВНУТРЬ настоящего node_modules сама на себя, а уборка стёрла бы боевое. И -T: ln не входит в существующий каталог.
# ЧЕГО НЕ ЛОВИТ: чужие сценарии и стенды со своим ln (класс шире этого файла).
mesto=$(readlink -f -- "${TD:-/}"); shl=$(readlink -f -- "$SHLYUZ_DIR"); nm=$(readlink -f -- "$SHLYUZ_DIR/node_modules")
if [ -z "$TD" ] || [ ! -d "$TD" ] || [ "$mesto" = / ] || [ "$mesto" = "$shl" ] || [ "$mesto" = "$nm" ] \
   || case "$mesto/" in "$nm/"*|"$shl/"*) true;; *) false;; esac; then
  echo "СЛЕПОТА стол: «${TD}» (${mesto}) не свежий каталог вне шлюза ${shl} и его node_modules ${nm} — ссылку не ставлю, стенд не проверял ничего"
  trap - EXIT; echo "ИТОГО: сошлось 0, расхождений 0, слепот 1"; exit 2
fi
cp -a "$SHLYUZ_DIR"/*.mjs "$SHLYUZ_DIR"/*.json "$TD/" 2>/dev/null
ln -sfnT "$SHLYUZ_DIR/node_modules" "$TD/node_modules"
printf 'GATEWAY_PORT=8789\nGATEWAY_WORK_DIR=%s\nGATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podstavnoj\n' "$BOEVOJ_DOM" > "$TD/env-obrazec.env"

# 1. исправный предмет
prov 0 "исправный шлюз -> зелёная" env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SROK=15 bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ' \
  && sud да "зелёная объявляет, что рестарта не делает" \
  || sud нет "зелёная объявляет, что рестарта не делает" "строки нет в выводе"

# 2. порча синтаксиса
cp "$TD/gateway.mjs" "$TD/gw-sintaksis.mjs"; printf '\nconst oborvano = {\n' >> "$TD/gw-sintaksis.mjs"
prov 1 "шлюз сломан синтаксисом -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-sintaksis.mjs" KANAREJKA_SROK=8 bash "$K"

# 3. порча, которую грамматика НЕ ловит — главный довод существования канарейки
python3 -c "
import io
p='$TD/gateway.mjs'; s=io.open(p,encoding='utf-8').read()
y='const server = http.createServer'
assert s.count(y)==1
io.open('$TD/gw-padaet.mjs','w',encoding='utf-8').write(s.replace(y,'netTakojFunkcii();\n'+y,1))"
node --check "$TD/gw-padaet.mjs" 2>/dev/null \
  && sud да "порча проходит грамматику (иначе она проверяла бы node --check)" \
  || sud нет "порча проходит грамматику (иначе она проверяла бы node --check)" "node --check её видит"
prov 1 "шлюз падает при старте, грамматика чиста -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-padaet.mjs" KANAREJKA_SROK=8 bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'netTakojFunkcii' \
  && sud да "отказ называет ПРИЧИНУ падения, а не хвост стека" \
  || sud нет "отказ называет ПРИЧИНУ падения, а не хвост стека" "причины нет в выводе"

# 4. порт отвечает, а по существу плохо
python3 -c "
import io
p='$TD/gateway.mjs'; s=io.open(p,encoding='utf-8').read()
y='const g = POSTAVSHCHIK.gotov();'  # B-N-1045: с 0.4.x готовность — свойство поставщика
assert s.count(y)==1
io.open('$TD/gw-health.mjs','w',encoding='utf-8').write(s.replace(y,'const g = { ok: false, chego: \"порча стенда\" };',1))"
prov 1 "порт отвечает, health не по существу -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-health.mjs" KANAREJKA_SROK=12 bash "$K"

# 5. сущность убрана из списка -> ловит проверка РЕЗУЛЬТАТА, а не список
python3 -c "
import json
d=json.load(open('$RYADOM/edinstvennye-sushchnosti-shlyuza.json',encoding='utf-8'))
d['sushchnosti']=[x for x in d['sushchnosti'] if x['klyuch']!='GATEWAY_PORT']
json.dump(d,open('$TD/bez-porta.json','w',encoding='utf-8'),ensure_ascii=False)"
prov 1 "сущность убрана из списка -> отказ по РЕЗУЛЬТАТУ" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/bez-porta.json" bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'GATEWAY_PORT' \
  && sud да "отказ называет уцелевший ключ поимённо" \
  || sud нет "отказ называет уцелевший ключ поимённо" "имени ключа в отказе нет"

# 6. незнакомая настройка спотыкает механизм, а не человека
sudo cat /etc/claude-oauth/instance-"$(basename "$BOEVOJ_DOM")".env > "$TD/env-novaya.env" 2>/dev/null \
  || cp "$TD/env-obrazec.env" "$TD/env-novaya.env"
echo 'GATEWAY_NOVYJ_SOKET=/var/run/chuzhoj.sock' >> "$TD/env-novaya.env"
prov 1 "незнакомая настройка -> отказ" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ENV="$TD/env-novaya.env" bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'GATEWAY_NOVYJ_SOKET' \
  && sud да "отказ называет незнакомую настройку поимённо" \
  || sud нет "отказ называет незнакомую настройку поимённо" "имени настройки нет в отказе"

# 7. слепоты: проверять нечем
echo 'не json' > "$TD/musor.json"
prov 2 "списка сущностей нет -> слепота"   env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/net.json" bash "$K"
prov 2 "список негоден -> слепота"          env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/musor.json" bash "$K"
prov 2 "предмета нет -> слепота"            env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/net.mjs" bash "$K"
prov 2 "настроек экземпляра нет -> слепота" env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ENV="$TD/net.env" bash "$K"

# 7б. B-N-1052: второй прогон разом — «ЗАНЯТА», слепота, копия НЕ поднимается (прежде: общий порт, ложное красное)
IMYA_Z="идёт другой прогон -> «ЗАНЯТА», слепота, копия не поднята"
: > "$TD/zamok"
vyv=$(flock "$TD/zamok" env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ZAMOK="$TD/zamok" bash "$K" 2>&1); kod=$?
if [ "$kod" = 2 ] && printf '%s' "$vyv" | grep -q 'ЗАНЯТА' && ! printf '%s' "$vyv" | grep -q 'копия поднялась'; then
  sud да "$IMYA_Z"; else sud нет "$IMYA_Z" "код $kod, ждали 2 с «ЗАНЯТА» и без подъёма"; fi

# 7в. B-N-1049: у openai порт моста копии — замером; занятый 18900 не роняет мост копии
IMYA_M="порт моста занят -> копия берёт другой, мост слушает"
sudo cat /etc/claude-oauth/instance-"$(basename "$BOEVOJ_DOM")".env > "$TD/env-openai.env" 2>/dev/null \
  || cp "$TD/env-obrazec.env" "$TD/env-openai.env"
sed -i '/^GATEWAY_POSTAVSHIK=/d' "$TD/env-openai.env"; echo 'GATEWAY_POSTAVSHIK=openai' >> "$TD/env-openai.env"
grep -q '^CODEX_HOME=' "$TD/env-openai.env" || echo 'CODEX_HOME=/nesushchestvuet-boevoj-codex' >> "$TD/env-openai.env"
python3 -c "import socket,time;s=socket.socket();s.bind(('127.0.0.1',18900));s.listen();time.sleep(120)" 2>/dev/null & ZANYAT=$!
sleep 1
vyv=$(env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ENV="$TD/env-openai.env" bash "$K" 2>&1); kod=$?
kill "$ZANYAT" 2>/dev/null; wait "$ZANYAT" 2>/dev/null
if [ "$kod" = 0 ] && printf '%s' "$vyv" | grep -qE 'мост копии: порт 189(0[1-9]|[1-5][0-9]|60) \(замером\), слушает=да'; then
  sud да "$IMYA_M"; else sud нет "$IMYA_M" "код $kod; $(printf '%s' "$vyv" | grep -E 'мост|ИТОГО' | tr '\n' ' ')"; fi

# RU: 9–11. Окружение юнита (B-N-1550): ключи drop-in видны проверке результата, значения доходят до копии как есть,
#     отказ не печатает значения. Юнит — шлюз агента BOEVOJ_DOM (угадывает сама канарейка). ЧЕГО НЕ ЛОВИТ: того, что
#     меняет обёртка ExecStart (гостевой guest-launch.sh), и ключей, которых нет ни в одном источнике systemd.
# EN: 9–11. Unit environment (B-N-1550): drop-in keys are visible to the result check, values reach the copy as is,
#     a refusal prints no values. The unit is the gateway of the BOEVOJ_DOM agent (the canary guesses it). NOT CAUGHT:
#     what an ExecStart wrapper changes (the guest guest-launch.sh) and keys present in no systemd source.
DROPIN_KLYUCH=GATEWAY_COMPACTION_MODULE
python3 -c "
import json
d=json.load(open('$RYADOM/edinstvennye-sushchnosti-shlyuza.json',encoding='utf-8'))
d['sushchnosti']=[x for x in d['sushchnosti'] if x['klyuch']!='$DROPIN_KLYUCH']
d.get('bezvrednye',{}).pop('$DROPIN_KLYUCH',None)
json.dump(d,open('$TD/bez-dropin.json','w',encoding='utf-8'),ensure_ascii=False)"
prov 1 "ключ из drop-in убран из списка -> отказ по РЕЗУЛЬТАТУ" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/bez-dropin.json" bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q "$DROPIN_KLYUCH" \
  && sud да "отказ называет ключ из drop-in поимённо" \
  || sud нет "отказ называет ключ из drop-in поимённо" "имени $DROPIN_KLYUCH в отказе нет"

# 10. значение с кавычками (JSON-список из drop-in) доходит до копии байт в байт
IMYA_J="JSON-значение из drop-in доходит до копии байт в байт"
python3 -c "
import io
s=io.open('$TD/gateway.mjs',encoding='utf-8').read()
io.open('$TD/gw-sreda.mjs','w',encoding='utf-8').write(
  \"import { writeFileSync as __stendW } from 'node:fs'; __stendW('$TD/sreda-kopii.txt', process.env.GATEWAY_CONTINUATION_ALLOWLIST ?? '<нет ключа>');\n\" + s)"
prov 0 "копия с записью окружения -> зелёная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-sreda.mjs" KANAREJKA_SROK=15 bash "$K"
UNIT_J=$(echo "$POSLEDNIJ_VYVOD" | sed -n 's/^  окружение: юнит \([^ ]*\) .*/\1/p')
if [ -n "$UNIT_J" ] && python3 "$RYADOM/sreda-yunita.py" "$UNIT_J" "$TD/sreda-yunita.env" >/dev/null \
   && python3 -c "
import sys
d=dict(l.rstrip('\n').split('=',1) for l in open('$TD/sreda-yunita.env',encoding='utf-8') if '=' in l)
z=d.get('GATEWAY_CONTINUATION_ALLOWLIST')
k=open('$TD/sreda-kopii.txt',encoding='utf-8').read()
sys.exit(0 if z and '\"' in z and k==z else 1)"; then sud да "$IMYA_J"
else sud нет "$IMYA_J" "юнит «${UNIT_J:-не назван}»: значение у копии не равно значению systemd (или ключа без кавычек нет)"; fi

# 11. отказ по уцелевшему значению не печатает само значение (в полном окружении есть секреты)
IMYA_S="отказ называет ключ, но не печатает значение"
python3 -c "
import json
d=json.load(open('$RYADOM/edinstvennye-sushchnosti-shlyuza.json',encoding='utf-8'))
d['sushchnosti']=[x for x in d['sushchnosti'] if x['klyuch']!='GATEWAY_WORK_DIR']
json.dump(d,open('$TD/bez-work-dir.json','w',encoding='utf-8'),ensure_ascii=False)"
vyv=$(env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/bez-work-dir.json" bash "$K" 2>&1); kod=$?
printf '%s' "$vyv" > "$TD/vyvod-11.txt"
if [ "$kod" = 1 ] && grep -q 'GATEWAY_WORK_DIR' "$TD/vyvod-11.txt" \
   && ! grep -qE 'GATEWAY_WORK_DIR=/' "$TD/vyvod-11.txt"; then sud да "$IMYA_S"
else sud нет "$IMYA_S" "код $kod; ключ назван: $(grep -c GATEWAY_WORK_DIR "$TD/vyvod-11.txt"), значение напечатано: $(grep -cE 'GATEWAY_WORK_DIR=/' "$TD/vyvod-11.txt")"; fi

# 8. структурное: канарейка НЕ смеет импортировать предмет
grep -qE "(^|[^a-z])(import|require)\(.*gateway\.mjs" "$K" \
  && sud нет "канарейка не импортирует предмет" "в предмете есть импорт gateway.mjs" \
  || sud да "канарейка не импортирует предмет"

# 8б. B-N-1048: каждый ключ окружения, который читает КОД шлюза, назван в списке. Проверка результата канарейки видит
# только ключи, записанные в instance-*.env; умолчание в коде без ключа в env она не видит (так у iskra копия открыла бы
# живую базу сессий, B-N-1045). Множество — gateway.mjs и его относительные импорты. ЧЕГО НЕ ЛОВИТ: что читает ребёнок SDK
# из {...process.env}; модули, подгружаемые не относительным путём; решение «единственная или безвредная» — за человеком.
# Выражения сбора ключей — во вставке Python ниже (python3 - … <<'PY', строки «kod |= …»), не в отдельном файле.
IMYA_SV="каждый ключ окружения, который читает код шлюза, назван в списке"
vyv=$(python3 - "$SHLYUZ_DIR" "$RYADOM/edinstvennye-sushchnosti-shlyuza.json" <<'PY'
import json, os, re, sys
kat, spisok = sys.argv[1:3]
try:
    d = json.load(open(spisok, encoding='utf-8'))
    nazvany = {s['klyuch'] for s in d['sushchnosti']} | set(d.get('bezvrednye', {})) | {k for k in d.get('tolko_nalichie', {}) if not k.startswith('_')}
except Exception as e:
    print(f'список не разобран: {e}'); sys.exit(2)
IMYA = r'([A-Za-z_][A-Za-z0-9_]*)'
kod, slepo, ochered, vidano = set(), [], ['gateway.mjs'], []
while ochered:
    f = ochered.pop()
    if f in vidano: continue
    vidano.append(f)
    try: s = open(os.path.join(kat, f), encoding='utf-8').read()
    except OSError as e: print(f'модуль не прочитан: {f}: {e}'); sys.exit(2)
    ochered += re.findall(r"""(?:\bfrom\s*|\bimport\s*\(\s*)['"]\./([^'"]+\.mjs)['"]""", s)
    kod |= set(re.findall(r'process\.env\.' + IMYA, s))
    kod |= set(re.findall(r"""process\.env\[\s*['"]""" + IMYA + r"""['"]\s*\]""", s))
    psevdonim = re.search(r'\benv\s*=\s*process\.env\b', s)
    if psevdonim: kod |= set(re.findall(r'\benv\.' + IMYA, s))
    # B-N-1674 (05.10, Искра): env, переданный ПАРАМЕТРОМ (codex-app-server.mjs:85 «env?.GATEWAY_STOP_WATCH_ALERT»), прежде
    # засчитывался только при псевдониме env = process.env — ключ кодеров прошёл мимо списка (стенд 26/26, канарейка Codex-домов красная).
    # Теперь env.X и env?.X с именем окружения (заглавные) засчитываются в любом модуле. ЧЕГО НЕ ЛОВИТ: объект окружения под другим
    # именем (sreda?.X), env?.['X'], строчные имена без псевдонима.
    kod |= set(re.findall(r'\benv\s*\?\.\s*([A-Z_][A-Z0-9_]*)', s)) | set(re.findall(r'\benv\.([A-Z_][A-Z0-9_]*)', s))
    # B-N-1288 (01.10, Заря): распад «...(<выражение> ?? process.env)» — всё окружение ребёнку, та же граница, что «...process.env»
    # (шлюз 0.4.17, A-N-721 Б: const envA = { ...(mcpNastrojka.env ?? process.env) }). Переменная, собранная таким распадом, —
    # псевдоним: её чтения NAME.KLYUCH — ключи окружения, как env.KLYUCH (иначе envA.PATH прошёл бы мимо списка).
    raspad = list(re.finditer(r'\.\.\.\(\s*[\w.?]+\s*\?\?\s*process\.env\s*\)', s))
    # B-N-2124/ИП 3.1.111 (18.10, Искра): шлюз 3.1.6 отдаёт окружение ЦЕЛИКОМ аргументом наблюдателю учёта —
    # usage('codexSpawn', X ?? process.env) gateway.mjs:769, codex-app-server.mjs:100; beforeSpawn?.(env ?? process.env, args) :50.
    # Это граница, как распад: что приёмник читает из этого окружения, ловят правила env.X/env?.X и hasOwn ниже (приёмник
    # usage-producer.mjs codexSpawn(env) — параметр env). ЧЕГО НЕ ЛОВИТ: приёмник, назвавший параметр иначе (sreda.X) — его чтения мимо.
    raspad += list(re.finditer(r'[\w.?]+\s*\?\?\s*process\.env(?=\s*[,)])', s))
    # 18.10 (Искра, находка Зари П4): шлюз 3.1.8 gateway.mjs:1989 — prepareGatewayUsage({provider:…, env:process.env, log}):
    # окружение отдано СВОЙСТВОМ объекта с ключом ровно env — приёмник берёт его параметром env (usage-producer.mjs:7
    # {provider, env=process.env, log}), его чтения ловят env.X/env?.X/hasOwn. Граница, как довод вызова. ЧЕГО НЕ ЛОВИТ:
    # свойство под другим ключом (sreda:process.env) — остаётся слепотой; приёмник, переименовавший env внутри, — его чтения мимо.
    raspad += list(re.finditer(r'(?<![\w.$])env\s*:\s*process\.env(?=\s*[,}])', s))
    # Проверка НАЛИЧИЯ ключа — тоже чтение имени (usage-producer.mjs codexSpawn: overrides=[...].some(k=>Object.hasOwn(env,k))).
    # ЧЕГО НЕ ЛОВИТ: массив, собранный не литералом, «k in env», Object.keys(env).includes(...).
    kod |= set(re.findall(r'''Object\.hasOwn\(\s*env\s*,\s*['"]([A-Z_][A-Z0-9_]*)['"]''', s))
    for mas, per in re.findall(r'\b(\w+)\.some\(\s*(\w+)\s*=>\s*Object\.hasOwn\(\s*env\s*,\s*\2\s*\)\s*\)', s):
        for lit in re.findall(r'\b' + re.escape(mas) + r'\s*=\s*\[([^\]]*)\]', s):
            kod |= set(re.findall(r'''['"]([A-Z_][A-Z0-9_]*)['"]''', lit))
    for n_ in re.findall(r'\b(?:const|let|var)\s+' + IMYA + r'\s*=\s*\{\s*\.\.\.\(\s*[\w.?]+\s*\?\?\s*process\.env\s*\)\s*\}', s):
        kod |= set(re.findall(r'\b' + re.escape(n_) + r'\.' + IMYA, s))
    for m in re.finditer(r"""process\.env\b(?!\s*\.|\s*\[\s*['"])""", s):
        if s[max(0, m.start() - 3):m.start()] == '...': continue          # всё окружение ребёнку SDK — граница
        # B-N-1919 (09.10, Михалыч): перебор всего окружения Object.entries(process.env) — та же граница, что «...process.env»
        # (шлюз 1.4.55, envDvizhka: всё окружение движку, кроме служебных GATEWAY_*). ЧЕГО НЕ ЛОВИТ: ключ, выбранный внутри перебора
        # сравнением имени (if (k === 'X')); Object.keys/values(process.env) — по-прежнему слепота.
        if re.search(r'Object\.entries\(\s*$', s[max(0, m.start() - 20):m.start()]): continue
        if psevdonim and m.start() >= psevdonim.start() and m.end() <= psevdonim.end(): continue
        if any(r_.start() <= m.start() and m.end() <= r_.end() for r_ in raspad): continue   # B-N-1288: распад с запасным — граница
        slepo.append(f'{f}:{s.count(chr(10), 0, m.start()) + 1}')
print(f'модули: {", ".join(vidano)} · ключей в коде {len(kod)}, названо в списке {len(kod & nazvany)}')
if slepo: print('форма обращения не разобрана: ' + ' '.join(slepo)); sys.exit(2)
if kod - nazvany: print('НЕ названы в списке: ' + ' '.join(sorted(kod - nazvany))); sys.exit(1)
PY
); kod_sv=$?
printf '%s\n' "$vyv" | sed 's/^/     /'
case "$kod_sv" in
  0) sud да "$IMYA_SV" ;;
  1) sud нет "$IMYA_SV" "$(printf '%s\n' "$vyv" | tail -1) — впишите в sushchnosti (чем подменять) или в bezvrednye (почему)" ;;
  *) ISPOLNENO="$ISPOLNENO$IMYA_SV"$'\n'; slep=$((slep+1)); echo "СЛЕПОТА $IMYA_SV: $(printf '%s\n' "$vyv" | tail -1)" ;;
esac

# 9. боевое цело
ss -ltn 2>/dev/null | grep -q ':8789 ' \
  && sud да "боевой шлюз слушает как слушал" \
  || sud нет "боевой шлюз слушает как слушал" "порт 8789 не отвечает"

# 10. за собой убрано: только СВОИ каталоги, чужие прогоны не в счёт
ostatki=$(find /tmp -maxdepth 1 -type d -name 'kanarejka-shlyuza-??????' -newer "$TD" 2>/dev/null | wc -l)
[ "$ostatki" = 0 ] \
  && sud да "временные каталоги канарейки убраны" \
  || sud нет "временные каталоги канарейки убраны" "осталось $ostatki"

# --- покрытие: заявлено против исполненного ---------------------------------
if [ -r "$SOSTAV" ]; then
  ZAYAV=$(python3 -c "import json;print('\n'.join(json.load(open('$SOSTAV',encoding='utf-8'))['proverki']))")
  PROPUSK=$(comm -23 <(echo "$ZAYAV" | sort) <(echo "$ISPOLNENO" | grep -v '^$' | sort))
  LISHNIE=$(comm -13 <(echo "$ZAYAV" | sort) <(echo "$ISPOLNENO" | grep -v '^$' | sort))
  VSEGO=$(echo "$ZAYAV" | grep -cv '^$')
else
  # Нет состава — покрытие УТВЕРЖДАТЬ НЕЧЕМ, и это слепота, а не зелёное.
  # Прежде здесь был код 0 при непосчитанном покрытии: стенд отчитывался бодро,
  # не зная, все ли проверки исполнились (поймано порчей 02.09).
  PROPUSK=""; LISHNIE=""; VSEGO="?"
  echo "🔴 ПОКРЫТИЕ НЕ ПОСЧИТАНО: нет файла заявленного состава $SOSTAV"
  slep=$((slep+1))
fi

echo
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
echo "ВЫПОЛНЕНО $((ok+bad)) из $VSEGO заявленных"
[ -n "$PROPUSK" ] && { echo "🔴 ПРОПУЩЕНО:"; printf '%s\n' "$PROPUSK" | sed 's/^/     /'; }
[ -n "$LISHNIE" ] && { echo "🔴 СВЕРХ ЗАЯВЛЕННОГО (впишите в состав):"; printf '%s\n' "$LISHNIE" | sed 's/^/     /'; }
[ -z "$PROPUSK" ] && [ -z "$LISHNIE" ] || exit 2
[ "$bad" = 0 ] || exit 1
[ "$slep" = 0 ] || exit 2
exit 0
