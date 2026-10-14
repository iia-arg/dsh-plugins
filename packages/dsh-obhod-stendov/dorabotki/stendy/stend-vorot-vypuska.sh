#!/bin/bash
# СТЕНД ВОРОТ ВЫПУСКА (vypusk-tegom). Искра, 07.09.2026.
#
# 🔴 ЗАЧЕМ. Ворота выпуска — единственное место, где частные имена ловятся ДО коммита,
# и до сегодня у них не было НИ ОДНОЙ пробы: сплошной поиск по dorabotki дал только
# сам файл, учёт и журнал долгов (контроль зрячести: у соседнего предмета
# `pered-podyomom` тот же поиск находит пять мест). Механизм без проб ломается молча,
# а ломается он в ту сторону, где отказ ПРОПАДАЕТ, — то есть утечка проходит.
#
# НАПРАВЛЕНИЕ, КОТОРОГО ЖДЁМ (называю заранее, иначе «не уронило» — три диагноза):
# ждём ПРОПУСК отказа, а не ложный отказ. Ложный отказ громок и виден на первом же
# выпуске; пропуск тих и вскроется публикацией.
#
# ЧЕГО СТЕНД НЕ ПРОВЕРЯЕТ — назвать обязан:
#   · верность прибора obyortka-krasneet по формам возврата — это предмет его самого; здесь (П27–П29) только
#     то, что ворота ЧИТАЮТ его вывод и ведут себя по правилу «тронут/наследие»;
#   · ветку «пробы частных имён нет на машине» (exit 2): путь пробы в воротах ЗАШИТ
#     абсолютным, подменить его нечем, а копия ворот проверяла бы копию, не предмет;
#   · верность самих находок — это предмет стенда пробы, не ворот;
#   · что тег действительно не поставлен: ворота его и не ставят, они только говорят.
#
# 🔴 ДВЕ ЦЕЛИ (A-N-676, 23.09.2026). Боевые ворота — root-файл /usr/local/bin/vypusk-tegom, исходник
# пары — packages/dsh-montazh/bin/vypusk-tegom (B-N-1864). До перевода бой был ссылкой на разработку и стенд, звавший рабочий
# путь, проверял заодно и бой. После перевода это ДВА файла: стенд обязан проверять оба и называть,
# какой проверил, — иначе зелёный про разработку прочтут как зелёный про бой.
# Если обе цели ведут в один файл (ссылка) — набор гоняется ОДИН раз, и это сказано вслух.
set -u
TSELI=("бой=/usr/local/bin/vypusk-tegom" "разработка=/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/bin/vypusk-tegom")
# B-H-060: цели подменяются ТОЛЬКО объявленно (кандидат до монтажа): STEND_TSELI="имя=путь[ имя=путь…]". Обходчик —
# STEND_OBHODCHIK, по умолчанию боевой. Без переменных стенд проверяет прежние две цели прежним обходчиком.
[ -n "${STEND_TSELI:-}" ] && read -r -a TSELI <<< "$STEND_TSELI"
OBH_STENDA="${STEND_OBHODCHIK:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
# A-N-956: прибор обёрток, через который ворота судят глухих, — НАСТОЯЩИЙ (по умолчанию боевой); кандидат — объявленно.
OBYORTKA_STENDA="${STEND_OBYORTKA:-/usr/local/bin/obyortka-krasneet}"
PROVAL_VSEGO=0; SLEPOTA=0
B=$(mktemp -d "${TMPDIR:-/tmp}/stend-vorot.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$B"' EXIT INT TERM
# B-N-1933 (09.10, Искра; наряд Забавы 11:12Z): ворота 1.0.17 пишут след помощником root в журнал; пробы стенда гоняют НАСТОЯЩИЕ ворота,
#   и без подмены их подставные пакеты ложились в БОЕВОЙ /var/lib/vypusk-tegom/zhurnal.tsv (56 строк proba-vorot-vypuska до 10:5xZ, ~16 за прогон).
#   Свой каталог журнала: помощник требует root-владельца и запрет записи группе/всем — создаём через sudo, убираем в trap.
#   ЧЕГО НЕ ЛОВИТ: ворота, звавшие помощник мимо VYPUSK_ZHURNAL_DIR, — их след ушёл бы в боевой журнал; проба — wc -l журнала до/после.
export VYPUSK_ZHURNAL_DIR="$B/zhurnal-sleda"
sudo -n install -d -o root -g root -m 0755 "$VYPUSK_ZHURNAL_DIR" || { echo "СЛЕПОТА: свой каталог журнала следа не создан (sudo -n install)"; exit 2; }
trap 'sudo -n rm -rf -- "$VYPUSK_ZHURNAL_DIR"; rm -rf "$B"' EXIT INT TERM
# B-H-203: обходчик читает файл исключений; стенд ворот даёт СВОЙ (пустой по умолчанию), боевой /etc не читается.
export ISKLYUCHENIYA_STENDOV="$B/isk.yaml"; echo 'exceptions: []' > "$ISKLYUCHENIYA_STENDOV"
isk_na() {   # isk_na <каталог> <стенд> <признак> — действующее исключение на стенд подставного пакета, код 2
  printf 'exceptions:\n  - stend: "%s.boj/%s"\n    vypusk: "0.0.1"\n    kod: 2\n    priznak: "%s"\n    prichina: "замер 2026-09-26 чем: проба стенда ворот (форма B-N-932)"\n    otvetstvennyj: "Искра"\n    peresmotr: "2099-01-01T00:00:00Z"\n' \
    "$(basename "$1")" "$2" "$3" > "$ISKLYUCHENIYA_STENDOV"; }

svezhij_paket() {           # чистый подставной пакет; боевого не трогаем
  local d="$1"; rm -rf "$d"; mkdir -p "$d/src"
  printf '{ "name": "proba-vorot-vypuska", "version": "0.0.1", "private": true, "files": ["src"] }\n' > "$d/package.json"
  printf 'export const a = 1; // обычный текст\n' > "$d/src/index.js"
  mkdir -p "$d/test"; printf "console.log('PASS подставной стенд');\n" > "$d/test/stend-zelenyj.mjs"
  # B-N-1038: ворота требуют верхний заголовок CHANGELOG = версии из package.json, без «не выпущено».
  printf '# Изменения\n\n## 0.0.1 — подставной выпуск стенда\n' > "$d/CHANGELOG.md"
}
# B-H-060: ворота зовут боевой обходчик по имени пакета и сверяют дерево с боем. Подставному пакету нужен
# «бой»: двойник <каталог>.boj, в который обходчик смотрит через СВОИ переменные области и перечня.
# Двойник снимается В МОМЕНТ пробы (правки пакета после svezhij_paket в него попадают); BEZ_ZERKALA=1 — не снимать.
dvojnik() { local d="$1"; [ -n "${BEZ_ZERKALA:-}" ] && return 0; rm -rf "$d.boj"; cp -a "$d" "$d.boj"
  ls -1 "$d.boj"/test/stend-* "$d.boj"/stend-* 2>/dev/null > "$d.perechen"; }   # A-N-963: и корневые стенды (П38)

proba() {                   # имя · ожидаемый код · ожидаемая строка (пусто = не проверять)
  local imya="$1" zhdem="$2" stroka="$3" kat="$4"
  VSEGO=$((VSEGO+1))
  dvojnik "$kat"
  # B-N-1823: подставной бой зарегистрирован независимо от id и версии.
  # Пакеты дерева ниже передают собственный VYPUSK_REESTR с services.
  if [ -z "${VYPUSK_REESTR+x}" ]; then
    python3 - "$kat" "$B/kopii.yaml" <<'PYK'
import sys,json
from pathlib import Path
Path(sys.argv[2]).write_text(json.dumps({'plugins':[{'id':'fixture-copy','path':sys.argv[1]+'.boj'}]}))
PYK
  fi
  local reestr_proby="${VYPUSK_REESTR-$B/kopii.yaml}"
  local bez=(); [ -n "${BEZ_DSH:-}" ] && bez=(env -u DSH_TEST_APP)   # зовущий БЕЗ DSH_TEST_APP (решение 15:02)
  # B-N-779: PROBA_ARG — путь, как его набрал бы человек (относительный), зов из РОДИТЕЛЯ каталога.
  local kuda="$kat" arg=.; [ -n "${PROBA_ARG:-}" ] && { kuda=$(dirname "$kat"); arg=$PROBA_ARG; }
  local out; out=$(cd "$kuda" && VYPUSK_REESTR="$reestr_proby" OBHODCHIK="${PODMENA_OBH:-$OBH_STENDA}" OBLAST_STENDOV="$kat.boj/" PERECHEN_STENDOV="$kat.perechen" \
    "${bez[@]}" "$VOROTA" "$arg" 2>&1); local kod=$?
  local beda=""
  [ "$kod" = "$zhdem" ] || beda="код $kod, ждали $zhdem"
  if [ -n "$stroka" ] && ! printf '%s' "$out" | grep -qF "$stroka"; then
    beda="${beda:+$beda; }нет строки «$stroka»"
  fi
  # B-N-784: NET_STROKI — строка, которой в выводе быть НЕ должно (разведение двух причин слепоты).
  if [ -n "${NET_STROKI:-}" ] && printf '%s' "$out" | grep -qF "$NET_STROKI"; then
    beda="${beda:+$beda; }есть лишняя строка «$NET_STROKI»"
  fi
  if [ -n "$beda" ]; then PROVAL=$((PROVAL+1)); echo "🔴 $imya: $beda"; printf '%s\n' "$out"; else echo "  ✅ $imya"; fi
}

progon() {                  # весь набор проб против ворот $VOROTA
VSEGO=0; PROVAL=0
echo "── КОНТРОЛЬ ЗРЯЧЕСТИ ПЕРВЫМ: на чистом ворота обязаны молчать ──"
svezhij_paket "$B/p1"
proba "П1 чистый пакет → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p1"

echo "── ПОРЧИ ──"
# ⚠️ П2/П3 ПЕРЕПИСАНЫ 14.09.2026: разряд частных имён ВЫКЛЮЧЕН (отменён распоряжением
# владельца 06.09 17:55). Прежние пробы ждали ОТКАЗА и стали вечно-красными — стенд
# давал 5 из 7 навсегда. Теперь они стерегут ДРУГОЕ и не менее важное: чтобы прибор
# при выключенном разряде говорил «НЕ ПРОВЕРЯЛИСЬ», а НЕ «чисто». Молчание о
# невыполненной проверке опаснее отказа: его уносят как замер.
# 🔴 ВЕРНУТСЯ ЛИ: вернут публикацию — вернуть и разряд, и ПРЕЖНИЕ П2/П3 (ждать кода 1
# и строки «найдены частные имена»). Обе редакции здесь рядом, менять одну строку.
svezhij_paket "$B/p2"; printf 'const put = "/opt/agent-plugins/x";\n' >> "$B/p2/src/index.js"
proba "П2 имя в тарболе при ВЫКЛЮЧЕННОМ разряде → не «чисто», а «НЕ ПРОВЕРЯЛИСЬ»" 0 "НЕ ПРОВЕРЯЛИСЬ" "$B/p2"

svezhij_paket "$B/p3"; printf 'адрес 10.240.49.1\n' >> "$B/p3/src/index.js"
proba "П3 адрес при ВЫКЛЮЧЕННОМ разряде → причина названа, не молчание" 0 "разряд выключен" "$B/p3"

svezhij_paket "$B/p4"; : > "$B/p4/.obyortka-porcha-99999.mjs"
proba "П4 остаток прибора в каталоге → отказ" 1 "остатки приборов" "$B/p4"

mkdir -p "$B/p5"          # каталог без package.json
proba "П5 не пакет → слепота, не «можно»" 2 "использование" "$B/p5"

echo "── СТЕНДЫ ПАКЕТА (B-H-060): метку на красное не ставим ──"
svezhij_paket "$B/p8"; printf "console.log('FAIL подставная порча');process.exit(1);\n" > "$B/p8/test/stend-krasnyj.mjs"
proba "П8 красный стенд в пакете и в бою → отказ с именем стенда" 1 "stend-krasnyj.mjs" "$B/p8"
svezhij_paket "$B/p9"; dvojnik "$B/p9"; printf "console.log('FAIL');process.exit(1);\n" > "$B/p9/test/stend-krasnyj.mjs"
BEZ_ZERKALA=1 proba "П9 красный стенд только в дереве → отказ «выпуск ≠ бой» с именем" 1 "test/stend-krasnyj.mjs" "$B/p9"
svezhij_paket "$B/p10"; rm -rf "$B/p10.boj"; : > "$B/p10.perechen"
BEZ_ZERKALA=1 proba "П10 пакета нет в бою → слепота, не «можно»" 2 "не вынес суждения" "$B/p10"
svezhij_paket "$B/p11"; rm -rf "$B/p11.boj"; : > "$B/p11.perechen"
BEZ_ZERKALA=1 STENDY_INACHE="стенд ворот: объявленный обход" proba "П11 объявленный обход без копии → слепота, сверка не обходится" 2 "нет зарегистрированных копий" "$B/p11"
BEZ_ZERKALA=1 STENDY_INACHE="стенд ворот: объявленный обход" NET_STROKI="можно ставить" proba "П11б объявленный обход без копии → совета тега нет" 2 "СЛЕПОТА" "$B/p11"
# Решение Забавы 15:02: окружение обходчика — ТАЙМЕРА, формулой из юнита, не из окружения зовущего. Стенд
# подставного пакета зелёный ТОЛЬКО при DSH_TEST_APP, равном значению юнита; зовём ворота без переменной
# и с чужой — оба раза ждём «можно». Снять подстановку в воротах — обе пробы краснеют.
TAJMER_APP=$(systemctl show vse-stendy-boevye.service -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^DSH_TEST_APP=//p' | head -1)
svezhij_paket "$B/p14"; printf "process.exit(process.env.DSH_TEST_APP===%s?0:1);\n" "'${TAJMER_APP}'" > "$B/p14/test/stend-zelenyj.mjs"
BEZ_DSH=1 proba "П14 зовущий БЕЗ DSH_TEST_APP → обходчик в окружении таймера → можно" 0 "DSH_TEST_APP=${TAJMER_APP:-НЕТ}" "$B/p14"
DSH_TEST_APP=/nepravilnyj/put proba "П14б зовущий с ЧУЖИМ DSH_TEST_APP → всё равно окружение таймера → можно" 0 "можно ставить" "$B/p14"
# 25.09 (поправка Вениамина 14:48): ворота передают обходчику ВСЮ среду юнита. Подставной systemctl (в PATH стенда) отдаёт
# среду юнита с лишней переменной PROBA_SREDY; стенд пакета зелёный, только если она дошла. Ворота с одной DSH_TEST_APP — красная.
# 🔴 СВОЙ каталог подставок (25.09, стенд краснел на ВТОРОЙ цели): в общем $B/shim проба П19 кладёт node, отказывающий на -p;
# он переживал первую цель, и во второй П24–П26 ловили «имя пакета не прочитано». Подставки одной пробы с чужими не смешивать.
mkdir -p "$B/shim-sreda"
printf '#!/bin/bash\nif [[ " $* " == *" show "* && " $* " == *" Environment "* ]]; then echo "DSH_TEST_APP=%s PROBA_SREDY=doshla${SREDA_HVOST:-}"; exit 0; fi\nexec /usr/bin/systemctl "$@"\n' "$TAJMER_APP" > "$B/shim-sreda/systemctl"; chmod +x "$B/shim-sreda/systemctl"
svezhij_paket "$B/p24"; printf "process.exit(process.env.PROBA_SREDY==='doshla'?0:1);\n" > "$B/p24/test/stend-zelenyj.mjs"
PATH="$B/shim-sreda:$PATH" proba "П24 вся среда юнита доходит до стенда внутри ворот → можно" 0 "PROBA_SREDY=doshla" "$B/p24"
svezhij_paket "$B/p25"
SREDA_HVOST=" кривой-элемент" PATH="$B/shim-sreda:$PATH" proba "П25 элемент среды юнита не вида ИМЯ=значение → слепота, не догадка" 2 "не разобрана" "$B/p25"
# INFO Вениамина: разбор среды — read -ra, без раскрытия шаблонов. «*» в значении при for без кавычек раскрылся бы по файлам
# каталога пакета (ворота зовут из него). Кладём файл-приманку, стенд зелёный, только если значение дошло БУКВАЛЬНО.
svezhij_paket "$B/p26"; printf "process.exit(process.env.ZVEZDA==='a*'?0:1);\n" > "$B/p26/test/stend-zelenyj.mjs"; : > "$B/p26/ZVEZDA=a-raskryto"
SREDA_HVOST=" ZVEZDA=a*" PATH="$B/shim-sreda:$PATH" proba "П26 «*» в значении среды юнита не раскрывается по файлам каталога → можно" 0 "ZVEZDA=a*" "$B/p26"

# Условие Искры 3 (14:41): слепота обходчика в воротах = ОТКАЗ, не зелёное.
svezhij_paket "$B/p12"
OBHODCHIK_SLUZHBA=net-takoj-sluzhby.service proba "П12 нет DSH_TEST_APP (источник-таймер не найден) → слепота" 2 "DSH_TEST_APP таймера" "$B/p12"
svezhij_paket "$B/p13"; printf "console.log('СЛЕПОТА подставная');process.exit(2);\n" > "$B/p13/test/stend-zelenyj.mjs"
# B-H-203: слепота с действующим исключением — код 3 обходчика; но «зелёных 0» суждения не даёт — слепота, как была.
isk_na "$B/p13" stend-zelenyj.mjs "СЛЕПОТА подставная"
proba "П13 все стенды пакета слепы (зелёных 0, слепота ожидаемая) → слепота, не «можно»" 2 "зелёных 0" "$B/p13"
echo 'exceptions: []' > "$ISKLYUCHENIYA_STENDOV"
svezhij_paket "$B/p23"; printf "console.log('СЛЕПОТА подставная');process.exit(2);\n" > "$B/p23/test/stend-slepoj.mjs"
proba "П23 B-H-203 слепой стенд БЕЗ исключения (дефект Беты) → ОТКАЗ с именем, не «можно»" 1 "НЕОЖИДАННО: p23.boj/stend-slepoj.mjs" "$B/p23"
svezhij_paket "$B/p22"; printf "console.log('СЛЕПОТА подставная');process.exit(2);\n" > "$B/p22/test/stend-slepoj.mjs"
isk_na "$B/p22" stend-slepoj.mjs "СЛЕПОТА подставная"
proba "П22 B-H-203 только ОЖИДАЕМОЕ (код 3) → можно, перечень напечатан" 0 "ОЖИДАЕМОЕ по исключениям" "$B/p22"
isk_na "$B/p22" stend-slepoj.mjs "СЛЕПОТА подставная"
proba "П22б перечень ожидаемого — в совете АННОТИРОВАННОГО тега" 0 "ожидаемое по исключениям: p22.boj/stend-slepoj.mjs" "$B/p22"
echo 'exceptions: []' > "$ISKLYUCHENIYA_STENDOV"

# MED Вениамина 15:44: обходчик зелёный, но БЕЗ строк «КАТАЛОГ ПАКЕТА:» (так отвечает обходчик без PAKET_IMYA) —
# сверка дерева с боем не выполнена, «можно» здесь ложное. На воротах fb6bf17c эта проба красная.
svezhij_paket "$B/p15"
printf '#!/bin/sh\necho "итог: стендов 1 · зелёных 1 · слепот 0 · код 0"\nexit 0\n' > "$B/obh-bez-katalogov.sh"; chmod +x "$B/obh-bez-katalogov.sh"
PODMENA_OBH="$B/obh-bez-katalogov.sh" proba "П15 обходчик зелёный без строк КАТАЛОГ ПАКЕТА → слепота, не «можно»" 2 "не назвал каталог пакета" "$B/p15"

# B-N-779: относительный путь без «./» — как набирает человек из каталога репозитория. На воротах bee4f3d9
# require искал его в node_modules → «имя пакета не прочитано», СЛЕПОТА 2 на исправном пакете.
svezhij_paket "$B/p16"
PROBA_ARG=p16 proba "П16 относительный путь без ./ → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p16"

# B-N-784: две причины слепоты — две строки, каждая ветка своей пробой.
svezhij_paket "$B/p18"
NET_STROKI="имя пакета" PODMENA_OBH=/net/takogo/obhodchika proba "П18 обходчика нет → слепота «обходчика нет», без «имя пакета»" 2 "обходчика нет или он не исполняется: /net/takogo/obhodchika" "$B/p18"
# Имя пакета содержимым не сломать (npm pack отказывает раньше) — ломаем окружение: node, отказывающий только на -p.
mkdir -p "$B/shim"; printf '#!/bin/sh\n[ "$1" = "-p" ] && exit 1\nexec %s "$@"\n' "$(command -v node)" > "$B/shim/node"; chmod +x "$B/shim/node"
svezhij_paket "$B/p19"
NET_STROKI="обходчика нет" PATH="$B/shim:$PATH" proba "П19 node не прочёл имя → слепота «имя пакета не прочитано», без «обходчика нет»" 2 "имя пакета не прочитано (node -p из" "$B/p19"
# low Вениамина: CDPATH — ловушка с тем же именем; «--» — каталог с именем на «-».
svezhij_paket "$B/p20"; mkdir -p "$B/lovushka/p20"; printf '{ "name": "lovushka", "version": "0.0.1" }\n' > "$B/lovushka/p20/package.json"
CDPATH="$B/lovushka" PROBA_ARG=p20 proba "П20 CDPATH с одноимённым каталогом → берётся p20 рядом, можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p20"
svezhij_paket "$B/-p21"
PROBA_ARG=-p21 proba "П21 каталог с именем на «-» → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/-p21"

# A-N-956 (находка Зари 25.09): ворота искали глухих по фразе, которой прибор obyortka-krasneet не печатал —
# отказ «глухая тронутая» не наступал никогда. Пробы СКВОЗНЫЕ: настоящий прибор, настоящий разбор его вывода
# воротами, без подставного вывода. Разойдутся тексты прибора и ворот — П27 краснеет (это и есть проба на разрыв).
# Подставной пакет в репозитории меток не значится ⇒ по правилу ворот его стенд ТРОНУТ.
gluhoj() { printf "const proba = (imya, f) => { try { f(); console.log('PASS ' + imya); } catch (e) { console.log('FAIL ' + imya); process.exitCode = 1; } };\nproba('подставная', () => {});\n" > "$1/test/stend-zelenyj.mjs"; }
zdorovyj() { printf "const proba = (imya, f) => { try { const r = f(); if (r !== undefined) throw new Error('вернуло'); console.log('PASS ' + imya); } catch (e) { console.log('FAIL ' + imya); process.exitCode = 1; } };\nproba('подставная', () => {});\n" > "$1/test/stend-zelenyj.mjs"; }
svezhij_paket "$B/p27"; gluhoj "$B/p27"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П27 глухая обёртка в ТРОНУТОМ стенде → ОТКАЗ с именем (разрыв прибор↔ворота)" 1 "глухая обёртка в стенде, ТРОНУТОМ" "$B/p27"
svezhij_paket "$B/p28"; zdorovyj "$B/p28"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="глухая обёртка" proba "П28 та же обёртка, краснеющая на возврате → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p28"
# Наследие: метка пакета в СВОЁМ репозитории (VYPUSK_REPO) новее файла стенда ⇒ не тронут ⇒ назван, не отказ.
# B-N-1774: «тронут» — по СОДЕРЖИМОМУ против метки-рубежа (git show <метка>:<путь>), не по mtime. Пакет лежит ВНУТРИ своего
# репозитория меток, стенд закоммичен под меткой ⇒ не тронут. v_repo <репозиторий> <каталог пакета в нём> — коммит + метка.
# Коммит датирован 2021-01-01: прежний признак (mtime > времени метки) на П49 давал бы ОТКАЗ, на П50 — наследие; без даты
# время метки и файла совпадали до секунды, и П49 не различал признаки (замер 08.10 01:0xZ: основа прошла П49).
v_repo() { [ -d "$1/.git" ] || git init -q "$1"; git -C "$1" add -- "$2" && GIT_COMMITTER_DATE=2021-01-01T00:00:00Z git -C "$1" -c user.name=stend -c user.email=stend@sadik commit -q --date=2021-01-01T00:00:00Z -m proba \
  && git -C "$1" tag -f proba-vorot-vypuska-v0.0.1 >/dev/null; }
svezhij_paket "$B/r29/p29"; gluhoj "$B/r29/p29"; v_repo "$B/r29" p29
VYPUSK_REPO="$B/r29" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П29 глухая обёртка в НЕТРОНУТОМ стенде → наследие названо, не отказ" 0 "наследие" "$B/r29/p29"
# П49 (B-N-1774, ложный отказ по mtime): содержимое = метке, время файла новое (checkout/копия) → наследие, не отказ.
svezhij_paket "$B/r49/p49"; gluhoj "$B/r49/p49"; v_repo "$B/r49" p49; touch "$B/r49/p49/test/stend-zelenyj.mjs"
VYPUSK_REPO="$B/r49" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П49 глухой стенд = метке, время новое (checkout) → наследие, не отказ" 0 "наследие" "$B/r49/p49"
# П50 (B-N-1774, пропуск по mtime): содержимое ИЗМЕНЕНО после метки, время отодвинуто touch -d → ОТКАЗ (тронут).
svezhij_paket "$B/r50/p50"; gluhoj "$B/r50/p50"; v_repo "$B/r50" p50; echo "// правка после метки" >> "$B/r50/p50/test/stend-zelenyj.mjs"; touch -d '2020-01-01' "$B/r50/p50/test/stend-zelenyj.mjs"
VYPUSK_REPO="$B/r50" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П50 глухой стенд изменён после метки, время отодвинуто (touch -d) → ОТКАЗ" 1 "глухая обёртка в" "$B/r50/p50"
# B-N-1824: метка-рубеж — самая свежая ПО ДАТЕ КОММИТА из меток «<name>-v*» и «<каталог>-v*» (у 6 пакетов имя ≠ каталогу).
# v_repo_t <репозиторий> <каталог> <метка> <дата> — коммит с датой и метка с заданным именем.
v_repo_t() { [ -d "$1/.git" ] || git init -q "$1"; git -C "$1" add -- "$2" && GIT_COMMITTER_DATE="$4" git -C "$1" -c user.name=stend -c user.email=stend@sadik commit -q --date="$4" -m proba \
  && git -C "$1" tag -f "$3" >/dev/null; }
# П57: метка ТОЛЬКО под каталогом (k57-v0.0.1), стенд = метке → наследие (прежний поиск по name меток не находил → «тронут», ОТКАЗ).
svezhij_paket "$B/r57/k57"; gluhoj "$B/r57/k57"; v_repo_t "$B/r57" k57 k57-v0.0.1 2021-01-01T00:00:00Z
VYPUSK_REPO="$B/r57" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П57 имя ≠ каталогу, метка под каталогом, стенд = метке → наследие, не отказ" 0 "наследие" "$B/r57/k57"
# П58: метка под каталогом СТАРЕЕ (2021, стенд X), метка по имени СВЕЖЕЕ (2022, стенд Y); в дереве Y → рубеж — метка по имени → наследие.
#   Выбор «каталог первым» дал бы рубеж 2021 и X ≠ Y → ложный ОТКАЗ.
svezhij_paket "$B/r58/k58"; gluhoj "$B/r58/k58"; v_repo_t "$B/r58" k58 k58-v0.0.1 2021-01-01T00:00:00Z
echo "// редакция Y" >> "$B/r58/k58/test/stend-zelenyj.mjs"; v_repo_t "$B/r58" k58 proba-vorot-vypuska-v0.0.2 2022-01-01T00:00:00Z
VYPUSK_REPO="$B/r58" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П58 метка по имени свежее метки по каталогу, стенд = свежей → наследие" 0 "наследие" "$B/r58/k58"
# П59: то же, но стенд изменён после свежей метки → ОТКАЗ (правка не приводит к «наследие всегда»).
svezhij_paket "$B/r59/k59"; gluhoj "$B/r59/k59"; v_repo_t "$B/r59" k59 k59-v0.0.1 2021-01-01T00:00:00Z
echo "// редакция Y" >> "$B/r59/k59/test/stend-zelenyj.mjs"; v_repo_t "$B/r59" k59 proba-vorot-vypuska-v0.0.2 2022-01-01T00:00:00Z
echo "// правка после свежей метки" >> "$B/r59/k59/test/stend-zelenyj.mjs"
VYPUSK_REPO="$B/r59" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П59 стенд изменён после самой свежей метки (имя ≠ каталогу) → ОТКАЗ" 1 "глухая обёртка в" "$B/r59/k59"
# П60 (Вениамин 07:03Z, п.2): метка по ИМЕНИ старее (2021, стенд X), по КАТАЛОГУ свежее (2022, стенд Y); в дереве Y → рубеж — каталожная → наследие.
svezhij_paket "$B/r60/k60"; gluhoj "$B/r60/k60"; v_repo_t "$B/r60" k60 proba-vorot-vypuska-v0.0.1 2021-01-01T00:00:00Z
echo "// редакция Y" >> "$B/r60/k60/test/stend-zelenyj.mjs"; v_repo_t "$B/r60" k60 k60-v0.0.2 2022-01-01T00:00:00Z
VYPUSK_REPO="$B/r60" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П60 метка по каталогу свежее метки по имени, стенд = свежей → наследие" 0 "наследие" "$B/r60/k60"
# П61 (образец «-v» + цифра): соседний каталог «k61-extra» с меткой k61-extra-v0.0.9 СВЕЖЕЕ (2023, стенд Z) не рубеж для «k61»;
#   рубеж — k61-v0.0.1 (2021, стенд = дереву) → наследие. Маска «k61-v*» без цифры поймала бы и «k61-vyvoz-v…».
svezhij_paket "$B/r61/k61"; gluhoj "$B/r61/k61"; v_repo_t "$B/r61" k61 k61-v0.0.1 2021-01-01T00:00:00Z
cp "$B/r61/k61/test/stend-zelenyj.mjs" "$B/r61/k61/test/stend-zelenyj.mjs.keep"; echo "// редакция Z соседа" >> "$B/r61/k61/test/stend-zelenyj.mjs"
v_repo_t "$B/r61" k61 k61-vyvoz-v0.0.9 2023-01-01T00:00:00Z; mv "$B/r61/k61/test/stend-zelenyj.mjs.keep" "$B/r61/k61/test/stend-zelenyj.mjs"
# B-N-1923 (dsh-montazh 1.0.17, решение (б)): ворота отказывают на грязном каталоге — возврат стенда к k61-v0.0.1 коммитом,
#   иначе дерево r61 ≠ HEAD и П61 кончается отказом «ГРЯЗНО», а не судом рубежа. Ставить ВМЕСТЕ с воротами 1.0.17.
git -C "$B/r61" -c user.name=stend -c user.email=stend@sadik commit -qam "возврат стенда к k61-v0.0.1"
VYPUSK_REPO="$B/r61" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П61 метка соседнего каталога k61-vyvoz-v… свежее — не рубеж (образец «-v» + цифра) → наследие" 0 "наследие" "$B/r61/k61"
# A-N-1948 шаг 0: прежние имена пакета (package.json "dsh":{"prezhnie_imena":[…]}). После git mv каталога свежая метка лежит
#   под ПРЕЖНИМ префиксом, а файл в ней — под прежним каталогом. pereim <репо> <каталог> <поле dsh или пусто> — git mv stara→каталог,
#   package.json с полем, коммит 2022 без метки (метка stara-v0.0.1 2021 уже стоит). Ставить ВМЕСТЕ с воротами dsh-montazh 1.0.21.
# B-N-1950 (Заря): стенд гоняет набор по КАЖДОЙ цели (бой, разработка) в одном $B. git mv в pereim не повторяем: на второй цели
#   каталог k6N уже есть — git mv кладёт stara6N ВНУТРЬ него, метка-рубеж находит нынешний каталог, П65 без строки рубежа, П66 «наследие».
#   Поэтому П65–П68 начинают с rm -rf своего r6N: каждая цель — с чистой историей переименования.
pereim() { git -C "$1" mv "stara${2#k}" "$2" && printf '{ "name": "proba-vorot-vypuska", "version": "0.0.1", "private": true, "files": ["src"]%s }\n' "${3:+, \"dsh\": $3}" > "$1/$2/package.json" \
  && GIT_COMMITTER_DATE=2022-01-01T00:00:00Z git -C "$1" -c user.name=stend -c user.email=stend@sadik commit -qam pereim --date=2022-01-01T00:00:00Z; }
# П65: каталог переименован, поле называет прежний, стенд = прежней метке → рубеж по прежнему имени, наследие (без поля — ложный ОТКАЗ).
rm -rf "$B/r65"; svezhij_paket "$B/r65/stara65"; gluhoj "$B/r65/stara65"; v_repo_t "$B/r65" stara65 stara65-v0.0.1 2021-01-01T00:00:00Z
pereim "$B/r65" k65 '{"prezhnie_imena": ["stara65"]}'
VYPUSK_REPO="$B/r65" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П65 каталог переименован, prezhnie_imena → рубеж по прежнему имени, наследие" 0 "рубеж по прежнему имени: метка stara65-v0.0.1" "$B/r65/k65"
# П66: то же, но стенд изменён после прежней метки → ОТКАЗ (поле не делает «наследие всегда»).
rm -rf "$B/r66"; svezhij_paket "$B/r66/stara66"; gluhoj "$B/r66/stara66"; v_repo_t "$B/r66" stara66 stara66-v0.0.1 2021-01-01T00:00:00Z
echo "// правка после прежней метки" >> "$B/r66/stara66/test/stend-zelenyj.mjs"; pereim "$B/r66" k66 '{"prezhnie_imena": ["stara66"]}'
VYPUSK_REPO="$B/r66" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П66 каталог переименован, стенд изменён после прежней метки → ОТКАЗ" 1 "глухая обёртка в" "$B/r66/k66"
# П67/П68: кривое поле — СЛЕПОТА, а не молчаливое «прежних нет»: строка вместо списка; маска в имени (ушла бы в tag --list).
rm -rf "$B/r67"; svezhij_paket "$B/r67/stara67"; v_repo_t "$B/r67" stara67 stara67-v0.0.1 2021-01-01T00:00:00Z; pereim "$B/r67" k67 '{"prezhnie_imena": "stara67"}'
VYPUSK_REPO="$B/r67" proba "П67 prezhnie_imena строкой, не списком → СЛЕПОТА" 2 "dsh.prezhnie_imena" "$B/r67/k67"
rm -rf "$B/r68"; svezhij_paket "$B/r68/stara68"; v_repo_t "$B/r68" stara68 stara68-v0.0.1 2021-01-01T00:00:00Z; pereim "$B/r68" k68 '{"bundle": {}, "prezhnie_imena": ["stara*"]}'
VYPUSK_REPO="$B/r68" proba "П68 маска в prezhnie_imena → СЛЕПОТА" 2 "dsh.prezhnie_imena" "$B/r68/k68"
# П62/П63 (A-N-1888 Q2/Q4, условие Вениамина 09.10): сводка обёрток — по строке «ОБЁРТКИ СТЕНДОВ:», не первой строкой вывода.
#   Прежде ворота печатали `head -1` вывода прибора: шум stderr («grep: write error: Broken pipe» под IgnoreSIGPIPE) вставал первым,
#   а прибор, упавший молча, проходил как «глухота не измерена». Теперь: нет ни сводки, ни «СЛЕПОТА…» прибора — СЛЕПОТА ворот, код 2.
printf '#!/bin/bash\necho "grep: write error: Broken pipe"\nexit 0\n' > "$B/pribor-shum"; chmod 755 "$B/pribor-shum"
printf '#!/bin/bash\nexit 1\n' > "$B/pribor-upal"; chmod 755 "$B/pribor-upal"
svezhij_paket "$B/p62"
OBYORTKA_KRASNEET="$B/pribor-shum" proba "П62 (Q2) прибор обёрток дал только шум, код 0 → СЛЕПОТА ворот, не «можно»" 2 "не дал сводки «ОБЁРТКИ СТЕНДОВ:»" "$B/p62"
svezhij_paket "$B/p63"
OBYORTKA_KRASNEET="$B/pribor-upal" proba "П63 (Q4) прибор обёрток упал молча (код 1, вывода нет) → СЛЕПОТА ворот, не «можно»" 2 "не дал сводки «ОБЁРТКИ СТЕНДОВ:»" "$B/p63"
# П64 (A-N-1888 Q1, сверх условия Вениамина — Искра): шум stderr ПЕРВЫМ, сводка следом → ворота обязаны напечатать сводку и идти дальше.
#   Это единственная проба, которая краснеет на откате самой правки (SVODKA=$(… | head -1), порча Михалыча 6ca0d64e): П62/П63 на порче остаются зелёными.
printf '#!/bin/bash\necho "grep: write error: Broken pipe" >&2\necho "ОБЁРТКИ СТЕНДОВ: краснеют 1 · ГЛУХИХ 0 · условие-обёрток без ловушки 0 (подставной П64)"\nexit 0\n' > "$B/pribor-shum-pervym"; chmod 755 "$B/pribor-shum-pervym"
svezhij_paket "$B/p64"
OBYORTKA_KRASNEET="$B/pribor-shum-pervym" proba "П64 (Q1) шум прибора первым, сводка следом → сводка напечатана, можно" 0 "ОБЁРТКИ СТЕНДОВ: краснеют 1 · ГЛУХИХ 0 · условие-обёрток без ловушки 0 (подставной П64)" "$B/p64"
# Код 2 прибора — «не измерено», не «зелено» (находка Авроры A-N-955; вариант Вениамина 18:40Z): НЕ отказ, а строка ворот.
# test/ закрыт на запись — прибор не кладёт копию рядом, код 2 «нет прав». Юнит обходчика — iskra; под root запрет не
# действует, и проба это называет, а не проходит зелёной.
svezhij_paket "$B/p30"; zdorovyj "$B/p30"; chmod 555 "$B/p30/test"   # стенду нужен вызов пробы, иначе прибор отложит его до проверки прав
if [ -w "$B/p30/test" ]; then
  VSEGO=$((VSEGO+1)); PROVAL=$((PROVAL+1)); echo "🔴 П30: запрет записи на test/ не действует (uid $(id -u)) — проверить нечем"
else
  OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ:" proba "П30 test/ без записи (код 2 прибора) → «глухота не измерена», не молчание и не отказ" 0 "глухота не измерена" "$B/p30"
fi
chmod 755 "$B/p30/test" "$B/p30.boj/test" 2>/dev/null
# Рекурсия (A-N-955 Авроры): стенд зовёт сам себя. Предел глубины 60 ВНУТРИ подставы — безопасна по устройству и без сторожа;
# сторож прибора (40 процессов) обязан сорвать раньше, и ворота — отказать.
svezhij_paket "$B/p31"
printf "import { execFileSync } from 'node:child_process';\nimport { fileURLToPath } from 'node:url';\nconst g = Number(process.env.GLUBINA ?? 0);\nconst proba = (i, f) => { try { const v = f(); if (v !== undefined) throw new Error('возврат'); } catch (e) { process.exitCode = 1; } };\nproba('рекурсия', () => { if (g < 60) execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'ignore', env: { ...process.env, GLUBINA: String(g + 1) } }); });\n" > "$B/p31/test/stend-zelenyj.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П31 рекурсивный стенд → ОТКАЗ по сторожу прибора" 1 "сорван сторожем прибора" "$B/p31"

# A-N-958: разряд прибора «УСЛОВИЕ-ФУНКЦИЯ» (зеркальная ловушка) — ворота обязаны его читать (маркер «ЛОВУШКА:»).
# Обёртка-условие t(имя, УСЛОВИЕ, текст): функция условием истинна всегда. П32 — ловушка в тронутом → ОТКАЗ; П33 — та же обёртка
# с настоящим условием → можно (ложного отказа нет).
svezhij_paket "$B/p32"; printf "const t = (imya, uslovie, chto) => { if (uslovie) console.log('PASS ' + imya); else { console.log('FAIL ' + imya + ': ' + chto); process.exitCode = 1; } };\nt('подставная', () => false, 'ложь');\n" > "$B/p32/test/stend-zelenyj.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П32 условие-функция (ловушка) в ТРОНУТОМ стенде → ОТКАЗ с именем" 1 "stend-zelenyj.mjs" "$B/p32"
svezhij_paket "$B/p33"; printf "const t = (imya, uslovie, chto) => { if (uslovie) console.log('PASS ' + imya); else { console.log('FAIL ' + imya + ': ' + chto); process.exitCode = 1; } };\nt('подставная', 1 === 1, 'ложь');\n" > "$B/p33/test/stend-zelenyj.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ:" proba "П33 та же обёртка-условие с настоящим условием → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p33"

# A-N-959 (находка Вениамина): ворота обходили список глухих «for g in $СПИСОК» — путь с пробелом резался, [ -f ] не находил
# обломков, и отказ молча становился «наследием». П35: глухой стенд с пробелом в имени, ТРОНУТЫЙ → ОТКАЗ с ПОЛНЫМ именем.
svezhij_paket "$B/p35"; printf "const proba = (imya, f) => { try { f(); console.log('PASS ' + imya); } catch (e) { console.log('FAIL ' + imya); process.exitCode = 1; } };\nproba('подставная', () => {});\n" > "$B/p35/test/stend-glu hoj.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П35 глухой стенд с ПРОБЕЛОМ в имени, тронутый → ОТКАЗ с полным именем" 1 "test/stend-glu hoj.mjs" "$B/p35"

# A-N-960: имя пакета ворота читали node -p "require('$KATALOG/…')" — путь внутри JS-литерала; апостроф в пути ломал его →
# «имя пакета не прочитано» → слепота. П36: пакет в каталоге с апострофом → имя прочитано, вердикт как у обычного («можно»).
# Обходчик — ПОДСТАВНОЙ (PODMENA_OBH): боевой vse-stendy-boevye.sh :103–104 читает имя тем же приёмом (require('${d}…')) и на апострофе
# слепнет сам — это его дефект, не ворот. Подставной отвечает «можно» ТОЛЬКО на верно переданное воротами имя пакета.
# B-N-1923 (09.10, Искра): $B общий для обеих целей (:36, цикл :393) — П37 делает $B/o'brien git-репозиторием, и на ВТОРОЙ цели П36
#   судил p36 незакоммиченным в чужом репозитории: ворота 1.0.17 → ОТКАЗ «ГРЯЗНО», 68/69 (первая цель 69/69). Каталог П36 — заново на каждой цели.
rm -rf "$B/o'brien"; mkdir -p "$B/o'brien"; svezhij_paket "$B/o'brien/p36"
printf '#!/bin/bash\n[ "$PAKET_IMYA" = proba-vorot-vypuska ] || { echo "СЛЕПОТА: имя пакета «$PAKET_IMYA»"; exit 2; }\nprintf "КАТАЛОГ ПАКЕТА: %%s/\\t\\n" "${OBLAST_STENDOV%%/}"\necho "итог: зелёных 1 · красных 0"\n' > "$B/obh-imya"; chmod +x "$B/obh-imya"
PODMENA_OBH="$B/obh-imya" NET_STROKI="имя пакета не прочитано" proba "П36 пакет в каталоге с АПОСТРОФОМ → имя прочитано, можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/o'brien/p36"
# A-N-962 / замечание Вениамина к A-N-960: рубеж глухих (:157, IMYA_PAKETA) П36 не держит — на апострофе без правки имя пусто →
# рубежа нет → любой глухой «тронут» → лишний ОТКАЗ. П37: пакет в каталоге с апострофом, глухой стенд НЕ тронутый (метка пакета в
# — содержимое = метке своего репозитория $B/o'brien) → «наследие», не ОТКАЗ. Обходчик подставной (как П36).
svezhij_paket "$B/o'brien/p37"; gluhoj "$B/o'brien/p37"; v_repo "$B/o'brien" p37   # B-N-1774: не тронут = закоммичен под меткой
VYPUSK_REPO="$B/o'brien" PODMENA_OBH="$B/obh-imya" OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ: глухая" proba "П37 АПОСТРОФ в пути + глухой НЕтронутый стенд → наследие, не отказ" 0 "наследие" "$B/o'brien/p37"

# A-N-963: три места, где прибор глухоту не мерил. П38 — пакет БЕЗ test/, глухой стенд в КОРНЕ, тронутый → ОТКАЗ с именем (прибор узнаёт
# пакет по package.json и берёт корневые stend-*.mjs). П39 — только .sh-стенд → «вне области» с именем, не «ни одного стенда».
# П40 — все стенды без обёртки с телом → «НЕ ПРИМЕНИМО», не «НЕ ИЗМЕРЕНО». П41 — ИСПРАВНАЯ тело-обёртка через .then(f) → можно
# (прежде признак знал только «f()», обёртка уходила в «условие», её стрелки-тела давали ЛОЖНУЮ ловушку и ложный ОТКАЗ).
svezhij_paket "$B/p38"; rm -rf "$B/p38/test"; printf "const proba = (imya, f) => { try { f(); console.log('PASS ' + imya); } catch (e) { console.log('FAIL ' + imya); process.exitCode = 1; } };\nproba('подставная', () => {});\n" > "$B/p38/stend-koren.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" proba "П38 пакет без test/, глухой стенд в КОРНЕ, тронутый → ОТКАЗ по глухоте" 1 "ОТКАЗ: глухая обёртка" "$B/p38"
svezhij_paket "$B/p39"; rm -f "$B/p39/test/stend-zelenyj.mjs"; printf '#!/bin/bash\necho PASS\n' > "$B/p39/test/stend-sh.sh"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ни одного стенда" proba "П39 только .sh-стенд → «вне области» с именем, не «ни одного стенда»" 0 "вне области 1" "$B/p39"
svezhij_paket "$B/p40"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="НЕ ИЗМЕРЕНО" proba "П40 стенд без обёртки с телом → «НЕ ПРИМЕНИМО», не «НЕ ИЗМЕРЕНО»" 0 "НЕ ПРИМЕНИМО" "$B/p40"
svezhij_paket "$B/p41"; printf "const proba = (imya, f) => Promise.resolve().then(f).then((r) => { if (r !== undefined) throw new Error('вернуло'); console.log('PASS ' + imya); }).catch(() => { console.log('FAIL ' + imya); process.exitCode = 1; });\nawait proba('подставная', () => {});\n" > "$B/p41/test/stend-zelenyj.mjs"
OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="ОТКАЗ:" proba "П41 исправная тело-обёртка через .then(f) → можно (не «ловушка»)" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p41"

# A-N-980: прибор обёрток — в СРЕДЕ ЮНИТА обходчика, не в оболочке зовущего. П42: стенд, которому нужна платформа (DSH_TEST_APP),
# ворота зовут БЕЗ неё (BEZ_DSH) → прибор всё равно мерит («краснеют 1»), а не «не на чем мерить» (прежде исход плавал по руке).
svezhij_paket "$B/p42"; printf "if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА: нет платформы (DSH_TEST_APP)'); process.exit(2); }\nconst proba = (imya, f) => { try { const r = f(); if (r !== undefined) throw new Error('вернуло'); console.log('PASS ' + imya); } catch (e) { console.log('FAIL ' + imya); process.exitCode = 1; } };\nproba('подставная', () => {});\n" > "$B/p42/test/stend-zelenyj.mjs"
BEZ_DSH=1 OBYORTKA_KRASNEET="$OBYORTKA_STENDA" NET_STROKI="не на чем мерить 1" proba "П42 стенду нужна платформа, зовущий без DSH_TEST_APP → прибор мерит в среде юнита" 0 "краснеют 1" "$B/p42"

# B-N-1038: метка только на ВЫПУЩЕННОЕ — верхний заголовок CHANGELOG = версии, без «не выпущено».
# Возврат для всех трёх — П6 ниже (снова чистый → можно).
svezhij_paket "$B/p43"; rm -f "$B/p43/CHANGELOG.md"
proba "П43 нет CHANGELOG.md → отказ" 1 "нет CHANGELOG.md" "$B/p43"
svezhij_paket "$B/p44"; printf '# Изменения\n\n## 0.0.1 — 2026-09-26 (не выпущено; проба)\n' > "$B/p44/CHANGELOG.md"
proba "П44 верхний заголовок «не выпущено» → отказ" 1 "не годится для метки" "$B/p44"
svezhij_paket "$B/p45"; printf '# Изменения\n\n## 0.0.0 — прошлый выпуск\n' > "$B/p45/CHANGELOG.md"
proba "П45 версия ≠ верхнему заголовку → отказ" 1 "не годится для метки" "$B/p45"
# B-N-1204: заголовок кандидата «номер — при монтаже» / «кандидат к …» → отказ; законные в выпущенных «кандидат Авроры»
# и «… при монтаже» без «номер» → НЕ отказ (замер 30.09: так написаны kompakt-dsh a18 и nudzh a10). Под LC_ALL=C ворота слепнут раньше (контроль зрячести пробы
# частных имён, код 2) — пробой заголовка это не мерится; независимость образца от локали проверена отдельно (B-N-1204 proba-lokal.out).
svezhij_paket "$B/p47"; printf '# Изменения\n\n## 0.0.1 — 2026-09-29 (проба; кандидат к обновлению, номер — при монтаже)\n' > "$B/p47/CHANGELOG.md"
proba "П47 верхний заголовок «номер — при монтаже» → отказ" 1 "не годится для метки" "$B/p47"
svezhij_paket "$B/p47b"; printf '# Изменения\n\n## 0.0.1 — 2026-09-29 (проба; номер при монтаже)\n' > "$B/p47b/CHANGELOG.md"
proba "П47б «номер при монтаже» без тире → отказ" 1 "не годится для метки" "$B/p47b"
svezhij_paket "$B/p48"; printf '# Изменения\n\n## 0.0.1 — 2026-09-30 (проба: разбор и кандидат Авроры; имя и версия при монтаже)\n' > "$B/p48/CHANGELOG.md"
proba "П48 выпущенный с «кандидат Авроры» и «… при монтаже» без «номер» → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p48"
# B-N-1774, условие Вениамина 01:10Z: образец версии обрывается на кириллице — «## 0.0.1-кандидат r20» давал «0.0.1» и проходил.
# После номера допустимы только пробел, «—», «(» или конец строки. П55 — пакет npm (версия 0.0.1 = отрезанному номеру),
# П56 — законный «(» сразу после номера → можно (правило не отвергает выпущенные заголовки).
svezhij_paket "$B/p55"; printf '# Изменения\n\n## 0.0.1-кандидат r20 (Заря)\n' > "$B/p55/CHANGELOG.md"
proba "П55 заголовок «0.0.1-кандидат r20» (кириллица после дефиса) → отказ" 1 "допустимы только пробел" "$B/p55"
svezhij_paket "$B/p56"; printf '# Изменения\n\n## 0.0.1 (выпуск; проба)\n' > "$B/p56/CHANGELOG.md"
proba "П56 «## 0.0.1 (…)» — скобка сразу после номера → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p56"

# B-N-1269: subscription-gateway судится обычным обходом, как остальные пакеты.
svezhij_paket "$B/p46"; sed -i 's/"name": "proba-vorot-vypuska"/"name": "subscription-gateway"/' "$B/p46/package.json"
# B-N-1289: двойник П46б/П46г от ПРЕДЫДУЩЕЙ цели ([бой]) переживал svezhij_paket, и П46 цели [разработка] видела устаревший
# p46.boj — «выпуск ≠ бой», код 1 вместо слепоты. Убрать двойник и перечень, как у П10/П11.
rm -rf "$B/p46.boj"; : > "$B/p46.perechen"
BEZ_ZERKALA=1 proba "П46 шлюз без предмета в области → слепота, не автоматический обход" 2 "СЛЕПОТА" "$B/p46"
NET_STROKI="стенды пакета НЕ ПРОГНАНЫ" proba "П46б шлюз в области → стенд прогнан" 0 "стенды пакета subscription-gateway" "$B/p46"
printf "console.log('FAIL B-N-1269');process.exit(1);\n" > "$B/p46/test/stend-zelenyj.mjs"
proba "П46в красный стенд шлюза → отказ" 1 "НЕОЖИДАННО" "$B/p46"
printf "console.log('PASS restored');\n" > "$B/p46/test/stend-zelenyj.mjs"
proba "П46г восстановленный стенд шлюза → можно" 0 "стенды пакета subscription-gateway" "$B/p46"

# B-N-1774 (2): пакет ДЕРЕВА без package.json (13 служебных пакетов) — прежде «использование», код 2 (ворота неприменимы).
# Режим дерева: имя — каталог, версия — заголовок CHANGELOG, состав и бой — запись реестра (подставной VYPUSK_REESTR).
derevo_paket() {   # derevo_paket <repo> <имя> <бой-каталог>
  rm -rf "$1" "$3"; mkdir -p "$1/$2/sbin" "$3"; printf '# Изменения\n\n## 0.0.1 — подставной выпуск дерева\n' > "$1/$2/CHANGELOG.md"
  printf '#!/bin/sh\necho x\n' > "$1/$2/sbin/x"; cp "$1/$2/sbin/x" "$3/x"; git init -q "$1"; git -C "$1" add -- "$2"
  git -C "$1" -c user.name=stend -c user.email=stend@sadik commit -q -m proba
  printf 'services:\n  - id: %s\n    derevo:\n      subdir: %s\n      files:\n        - {local: "%s", remote: "sbin/x"}\n      not_installed: ["CHANGELOG.md"]\n' "$2" "$2" "$3/x" > "$1.reestr.yaml"; }
derevo_paket "$B/r51" d51 "$B/boj51"
VYPUSK_REPO="$B/r51" VYPUSK_REESTR="$B/r51.reestr.yaml" STENDY_INACHE="стенд ворот: пакет дерева" NET_STROKI="использование" \
  proba "П51 пакет дерева без package.json, бой = метке → можно (режим дерева)" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/r51/d51"
echo "# порча" >> "$B/boj51/x"
VYPUSK_REPO="$B/r51" VYPUSK_REESTR="$B/r51.reestr.yaml" STENDY_INACHE="стенд ворот: пакет дерева" \
  proba "П52 пакет дерева, бой ≠ метке → ОТКАЗ с именем файла" 1 "sbin/x" "$B/r51/d51"
cp "$B/r51/d51/sbin/x" "$B/boj51/x"
VYPUSK_REPO="$B/r51" VYPUSK_REESTR="$B/r51.reestr.yaml" NET_STROKI="можно ставить" \
  proba "П53 пакет дерева без объявленного обхода → СЛЕПОТА (стенды не гоняются), не «можно»" 2 "стенды пакета дерева" "$B/r51/d51"
# П54 (условие Вениамина 01:10Z) — пакет ДЕРЕВА: версия берётся из самого заголовка, сверить её не с чем, кроме хвоста.
derevo_paket "$B/r54" d54 "$B/boj54"; printf '# Изменения\n\n## 0.0.1-кандидат r20 (Заря)\n' > "$B/r54/d54/CHANGELOG.md"
git -C "$B/r54" -c user.name=stend -c user.email=stend@sadik commit -qam "кандидат r20"
VYPUSK_REPO="$B/r54" VYPUSK_REESTR="$B/r54.reestr.yaml" STENDY_INACHE="стенд ворот: пакет дерева" NET_STROKI="можно ставить" \
  proba "П54 пакет дерева, заголовок «0.0.1-кандидат r20» → отказ, не версия 0.0.1" 1 "допустимы только пробел" "$B/r54/d54"

echo "── ЗРЯЧЕСТЬ ПОСЛЕ ПОРЧ: ворота не залипли в отказе ──"
svezhij_paket "$B/p6"
proba "П6 снова чистый → можно" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "$B/p6"

echo "── ОТДЕЛЬНО: совет не зовёт в запрещённое ──"
VSEGO=$((VSEGO+1))
if (cd "$B/p6" && VYPUSK_REESTR="$B/kopii.yaml" OBHODCHIK="$OBH_STENDA" OBLAST_STENDOV="$B/p6.boj/" PERECHEN_STENDOV="$B/p6.perechen" "$VOROTA" . 2>&1) | grep -qE 'git push'; then
  PROVAL=$((PROVAL+1)); echo "🔴 П7: ворота советуют push при действующем запрете владельца"
else
  echo "  ✅ П7 совет зовёт только к ЛОКАЛЬНОМУ тегу"
fi

echo "итог [$1]: $((VSEGO-PROVAL)) из $VSEGO"
PROVAL_VSEGO=$((PROVAL_VSEGO+PROVAL))
}

PROVERENO=""
for t in "${TSELI[@]}"; do
  imya=${t%%=*}; put=${t#*=}
  if [ ! -x "$put" ]; then
    SLEPOTA=$((SLEPOTA+1)); echo "СЛЕПОТА [$imya]: ворот нет или не исполняются ($put)"; continue
  fi
  real=$(readlink -f "$put"); summa=$(sha256sum < "$real" | cut -c1-16)
  echo "══ цель [$imya]: $put → $real · sha256 $summa ══"
  prezhnij=$(printf '%s\n' "$PROVERENO" | awk -F'|' -v r="$real" '$1==r{print $2}')
  if [ -n "$prezhnij" ]; then
    echo "  [$imya] — ТОТ ЖЕ ФАЙЛ, что [$prezhnij] (ссылка): набор уже прогнан, не повторяю"; continue
  fi
  VOROTA=$put; progon "$imya"
  # B-N-1823: общий стенд зовёт пробы копий теми же воротами.
  STEND_KOPII_PUT="${STEND_KOPII-/usr/local/libexec/stend-vypusk-kopii.py}"
  if [ ! -r "$STEND_KOPII_PUT" ]; then
    SLEPOTA=$((SLEPOTA+1)); echo "СЛЕПОТА [$imya]: нет стенда копий $STEND_KOPII_PUT"
  elif ! python3 "$STEND_KOPII_PUT" "$VOROTA"; then
    PROVAL_VSEGO=$((PROVAL_VSEGO+1)); echo "🔴 [$imya]: пробы копий отказали"
  fi
  PROVERENO="$PROVERENO"$'\n'"$real|$imya"
done
echo "ИТОГ: провалов $PROVAL_VSEGO · слепых целей $SLEPOTA"
[ "$PROVAL_VSEGO" -gt 0 ] && exit 1
[ "$SLEPOTA" -gt 0 ] && exit 2
exit 0
