#!/usr/bin/env bash
# Стенд pereklyuchatel-podpiski (B-N-1151, Искра). ВСЁ на подставных: поддельные instance-env,
# поддельный systemctl (журнал вызовов + управляемое «поднялся/живой токен»), поддельный
# каталог otkaz-limita, поддельный dsh-alert. Боевой /etc/claude-oauth и реальные шлюзы НЕ трогаются.
# Проверяет усл. Вениамина: 1 смешанное без цели → отказ+перечень; 2 по одному, первый не поднялся →
# стоп+откат его; заслон лимита (авто отказ / force не препятствие); отметка частоты; set -u с порчей;
# итог с именами; Codex-инстанс (пустой токен) не переключается.
# B-N-1394: подмены переключателя действуют ТОЛЬКО при SWITCH_STEND=1 — стенд подаёт ключ во все вызовы;
# три пробы ключа в конце (без ключа — боевые, сухо; с ключом — «ПОДМЕНЕНО:»; ключ ≠ 1 — отказ).
# B-N-1621: помощник доступа — НАСТОЯЩИЙ (STEND_SVESTI, по умолчанию бой) в режиме SDP_STEND на подставных env/токенах,
# со своим поддельным systemctl; обёртка пишет каждый вызов и число restart к этому моменту. Пробы А1–А4 — в конце.
# Учётка iskra: сверку чтением (runuser) помощник не делает — здесь проверяется getfacl; ядром — в стенде помощника.
set -u
K="${SWITCH_BIN:-/usr/local/sbin/pereklyuchatel-podpiski}"  # по умолчанию — БОЙ; кандидата подавать SWITCH_BIN
[ -x "$K" ] || { echo "СЛЕПОТА: нет $K"; exit 2; }
SV="${STEND_SVESTI:-/usr/local/sbin/svesti-dostup-podpisok}"
[ -r "$SV" ] || { echo "СЛЕПОТА: нет помощника доступа $SV (STEND_SVESTI)"; exit 2; }
RAB=$(mktemp -d "${TMPDIR:-/tmp}/stend-switch.XXXXXX") || exit 2
# B-N-1747: страховки переключатель кладёт через sudo (install -d -m 0700 → root) и в подставной $RAB/bak — без sudo их не убрать
#   (ночи 06–07.10: 10 строк «rm: Permission denied» в хвосте обхода, код не менялся). Пути абсолютные: проба к1 подставляет sudo через PATH своего вызова.
#   Остаток судится по существованию каталога, не по тексту ошибки rm.
trap '[ ! -d "${RAB:?}/bak" ] || /usr/bin/sudo -n /usr/bin/rm -rf -- "${RAB:?}/bak" 2>/dev/null; /usr/bin/rm -rf -- "${RAB:?}" 2>/dev/null
      [ ! -e "$RAB" ] || echo "⚠️ уборка стенда: остался $RAB (страховки переключателя — root, без sudo -n не убрать)"' EXIT
ok=0; bed=0; vsego=0
sud(){ vsego=$((vsego+1)); if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bed=$((bed+1)); echo "  🔴 $1 — $3"; fi; }

ED="$RAB/etc"; LIM="$RAB/lim"; mkdir -p "$ED" "$LIM" "$RAB/bin"
# B-N-1472: и занятость — только подставная, реальный hod-sluzhby не вызывается.
cat > "$RAB/bin/turn" <<'TURN'
#!/bin/bash
a=${1%.service}
if [ -e "$RAB/state/busy-$a" ]; then
  echo 'pid=1 start=1 end=0 poslednee=turn/start zhurnal=est'; exit 1
fi
if [ -e "$RAB/state/busy-once-$a" ]; then
  rm "$RAB/state/busy-once-$a"
  echo 'pid=1 start=1 end=0 poslednee=turn/start zhurnal=est'; exit 1
fi
echo 'pid=1 start=1 end=1 poslednee=turn/end zhurnal=est'
TURN
chmod +x "$RAB/bin/turn"
cat > "$RAB/bin/journalctl" <<'JOURNAL'
#!/bin/bash
[ ! -f "$RAB/state/journal.jsonl" ] || cat "$RAB/state/journal.jsonl"
exit 0
JOURNAL
chmod +x "$RAB/bin/journalctl"
export SWITCH_JOURNALCTL="$RAB/bin/journalctl"
export SWITCH_TURN_CMD="$RAB/bin/turn" SWITCH_TURN_WAIT=0 SWITCH_TURN_POLL=1 SWITCH_TURN_PROBE=1
# B-N-1621 k2: страховки переключателя — в стенд (без подмены они ложились в БОЕВОЙ /var/backups/montazh/pereklyuchatel-podpiski)
export SWITCH_BAK_DIR="$RAB/bak"
BOEVOJ_BAK=/var/backups/montazh/pereklyuchatel-podpiski
bak_do=$(sudo -n ls -1 "$BOEVOJ_BAK" 2>&1; echo "код $?")   # стенд гоняется от iskra; каталог страховок — root
# поддельный systemctl: list-units из $RAB/units; MainPID/is-active/restart через файлы состояния $RAB/state
cat > "$RAB/bin/systemctl" <<PY
#!/usr/bin/env python3
import sys,os
RAB=os.environ["RAB"]; a=sys.argv[1:]
def units():
    try: return open(RAB+"/units").read().split()
    except: return []
if a[:1]==["list-units"]:
    for u in units(): print(f"{u} loaded active running")
    sys.exit(0)
if "show" in a:
    u=a[a.index("show")+1] if "show" in a else ""
    ag=u.split("@")[1].split(".")[0] if "@" in u else u
    # MainPID = фиктивный ненулевой, чтобы zhivoj_token пошёл читать (в тесте живой токен — через LIVE cmd)
    print("1000"); sys.exit(0)
if a[:1]==["is-active"]:
    u=a[1]; ag=u.split("@")[1].split(".")[0]
    st=RAB+f"/state/act-{ag}"
    print(open(st).read().strip() if os.path.exists(st) else "active"); sys.exit(0)
if a[:1]==["restart"]:
    u=a[1]; ag=u.split("@")[1].split(".")[0]
    open(RAB+"/restart.log","a").write(ag+"\n")
    # применяем «желаемый» токен, записанный в env-файле, в live-состояние (эмуляция поднятия)
    ef=RAB+f"/etc/instance-{ag}.env"
    import re
    try:
        m=re.search(r"token-podpiska-([123])", open(ef).read());   # 07.10: и подписка 3 (своя Варвары, круг 2→3)
        if m and not os.path.exists(RAB+f"/state/badtoken-{ag}"): open(RAB+f"/state/live-{ag}","w").write(m.group(1))
    except: pass
    # управляемый отказ поднятия
    if os.path.exists(RAB+f"/state/failstart-{ag}"):
        open(RAB+f"/state/act-{ag}","w").write("failed"); sys.exit(1)
    sys.exit(0)
sys.exit(0)
PY
chmod +x "$RAB/bin/systemctl"
# живой токен: из $RAB/state/live-<agent> (эмуляция /proc)
cat > "$RAB/bin/live" <<PY
#!/usr/bin/env python3
import sys,os; RAB=os.environ["RAB"]; a=sys.argv[1]
f=RAB+f"/state/live-{a}"
print(open(f).read().strip() if os.path.exists(f) else "")
PY
chmod +x "$RAB/bin/live"
cat > "$RAB/bin/start" <<PY
#!/usr/bin/env python3
import sys,os; RAB=os.environ["RAB"]; a=sys.argv[1]
f=RAB+f"/state/start-{a}"
print(open(f).read().strip() if os.path.exists(f) else "1")  # v6: по умолчанию старт ИЗВЕСТЕН (1 = давно); «не узнан» — пробы ниже
PY
chmod +x "$RAB/bin/start"
cat > "$RAB/bin/hodil" <<PY
#!/usr/bin/env python3
import sys,os; RAB=os.environ["RAB"]; a=sys.argv[1]
print("" if os.path.exists(RAB+f"/state/nehod-{a}") else "ходил")
PY
chmod +x "$RAB/bin/hodil"
cat > "$RAB/bin/alert" <<PY
#!/usr/bin/env python3
import sys,os; open(os.environ["RAB"]+"/alert.log","a").write(" ".join(sys.argv[1:])+"\n")
PY
chmod +x "$RAB/bin/alert"
# reader лимитов (B-N-1390; B-N-1776 такт 4 — таблица dsh-limity): настоящий helper с явными --baza $RAB/state/limity.db
# и --nastrojka (SWITCH_READER_NASTROJKA, по умолчанию боевая). Базы нет (rasklad чистит state/) → «unknown»;
# пробы r2 кладут подставную базу blocked/free (B-N-1394 r2).
# Без этой обёртки стенд звал боевой reader → SSH на aclaude, исход зависел от живой квоты (02.10: 19 из 23).
RDR="${SWITCH_READER_BIN:-/usr/local/libexec/pereklyuchatel-podpiski-limity.py}"
printf '#!/usr/bin/python3 -B\nimport os,sys\nos.execv("/usr/bin/python3",["/usr/bin/python3","-B",%s,*sys.argv[1:],"--baza",%s,"--nastrojka",%s])\n' \
  "\"$RDR\"" "\"$RAB/state/limity.db\"" "\"${SWITCH_READER_NASTROJKA:-/etc/default/pereklyuchatel-podpiski-limity}\"" > "$RAB/bin/reader"
chmod +x "$RAB/bin/reader"
# B-N-1621: поддельный systemctl ПОМОЩНИКА (его формат show: учётка = имя агента, если она есть, иначе nobody)
cat > "$RAB/bin/sdp-systemctl" <<'__SDP_SYSTEMCTL__'
#!/usr/bin/env python3
import os, pwd, sys
a = sys.argv[1:]; u = a[1] if len(a) > 1 else ''
units = open(os.environ['SDP_UNITS']).read().split()
if a[:1] != ['show'] or u not in units:
    print('LoadState=not-found\nUnitFileState=\nActiveState=inactive\nUser=\nEnvironmentFiles=\nExecStart='); sys.exit(0)
ag = u.split('@')[1].split('.')[0]
try: pwd.getpwnam(ag); kto = ag
except KeyError: kto = 'nobody'
print(f'LoadState=loaded\nUnitFileState=enabled\nActiveState=active\nUser={kto}\nGroup=\nSupplementaryGroups=\n'
      f'EnvironmentFiles=/etc/claude-oauth/instance-{ag}.env (ignore_errors=no)\nExecStart={{ path=/usr/local/bin/node ; }}')
__SDP_SYSTEMCTL__
cat > "$RAB/bin/svesti" <<__SDP_OBYORTKA__
#!/bin/bash
echo "\$* restartov=\$(cat "$RAB/restart.log" 2>/dev/null | wc -l)" >> "$RAB/svesti.log"
SDP_STEND=1 SDP_ENV_DIR="$ED" SDP_KATALOG_TOKENOV="$ED" SDP_KATALOG_CODEX="$RAB/net-codex-{n}" SDP_SYSTEMCTL="$RAB/bin/sdp-systemctl" SDP_ZAMOK="$RAB/sdp.lock" SDP_UNITS="$RAB/units" exec python3 -B "$SV" "\$@"
__SDP_OBYORTKA__
cat > "$RAB/bin/svesti-otkaz" <<__SDP_OTKAZ__
#!/bin/bash
echo "\$* ОТКАЗ" >> "$RAB/svesti.log"; echo "ОТКАЗ: подставной отказ помощника" >&2; exit 3
__SDP_OTKAZ__
chmod +x "$RAB/bin/sdp-systemctl" "$RAB/bin/svesti" "$RAB/bin/svesti-otkaz"
export SWITCH_SVESTI="$RAB/bin/svesti"
# 07.10 (своя подписка по реестру): подставной agent-registry. state/reestr-<a> — точное значение вывода (--json);
#   файла нет — "obshchaya-claude"; state/reestr-net-<a> — «поля нет» (код 3), как настоящий agent-registry.
cat > "$RAB/bin/reestr" <<'REESTR'
#!/bin/bash
[ "$1" = pole ] && [ "$3" = podpiska ] && [ "$4" = --json ] || { echo "reestr: неожиданный вызов $*" >&2; exit 9; }
[ ! -e "$RAB/state/reestr-net-$2" ] || { echo "agent-registry: у агента '$2' нет поля 'podpiska'" >&2; exit 3; }
if [ -e "$RAB/state/reestr-$2" ]; then cat "$RAB/state/reestr-$2"; else echo '"obshchaya-claude"'; fi
REESTR
chmod +x "$RAB/bin/reestr"
export SWITCH_REGISTRY="$RAB/bin/reestr"

mkdir -p "$RAB/state"
# сброс раскладки: agenty с подписками; codex — пустой живой токен
rasklad(){ # $1.. пары agent:podpiska (или agent: для codex/пусто)
  rm -f "$RAB"/state/* "$LIM"/* "$RAB/restart.log" "$RAB/alert.log" "$RAB/otm" "$RAB/svesti.log" 2>/dev/null; : > "$RAB/units"
  setfacl -b "$ED"/token-podpiska-* 2>/dev/null || true
  for p in "$@"; do a="${p%%:*}"; n="${p#*:}"
    echo "claude-oauth-gateway@$a.service" >> "$RAB/units"
    printf 'GATEWAY_POSTAVSHIK=anthropic\nGATEWAY_TOKEN_FILE=%s/token-podpiska-%s\nDUMMY=x\n' "$ED" "${n:-1}" > "$ED/instance-$a.env"
    [ -n "$n" ] && echo "$n" > "$RAB/state/live-$a" || echo "" > "$RAB/state/live-$a"
    echo "active" > "$RAB/state/act-$a"
  done
}
: > "$ED/token-podpiska-1"; : > "$ED/token-podpiska-2"; : > "$ED/token-podpiska-3"
run(){ SWITCH_ENV_DIR="$ED" SWITCH_SYSTEMCTL="$RAB/bin/systemctl" SWITCH_LIMIT_DIR="$LIM" \
  SWITCH_ALERT="$RAB/bin/alert" SWITCH_LIVE_TOKEN_CMD="$RAB/bin/live" SWITCH_OTMETKA="$RAB/otm" SWITCH_STEND=1 SWITCH_ITOG_FILE="$RAB/itog" SWITCH_LIMITY_READER="$RAB/bin/reader" \
  SWITCH_MIN_INTERVAL=0 SWITCH_SLEEP=0 SWITCH_HOD_CMD="$RAB/bin/hodil" SWITCH_START_CMD="$RAB/bin/start" RAB="$RAB" "$K" "$@" > "$RAB/out" 2>&1; echo $?; }

echo "== стенд pereklyuchatel-podpiski $(date -u +%H:%M:%SZ)"
envtok(){ sed -n 's#^GATEWAY_TOKEN_FILE=.*/token-podpiska-##p' "$ED/instance-$1.env"; }
# снимок <цель> <доля недели>: подставная таблица dsh-limity (схема zamer), свежие замеры 5ч 0.1 и недели у всех трёх
snimok(){ python3 -B -c 'import sqlite3,sys,time
cel,ned,b=sys.argv[1],float(sys.argv[2]),sys.argv[3]; t=time.time(); db=sqlite3.connect(b)
db.execute("CREATE TABLE zamer (id INTEGER PRIMARY KEY, moment_utc REAL, prinyato_utc REAL, provajder TEXT, podpiska INTEGER, okno TEXT, dolya REAL, sbros_utc REAL, status TEXT, izmereno INTEGER, prichina TEXT, istochnik TEXT, otkuda TEXT)")
for n in (1,2,3):
  for okno,d,s in (("five_hour",0.1,3600),("seven_day",ned if str(n)==cel else 0.2,86400)):
    db.execute("INSERT INTO zamer VALUES (NULL,?,?,?,?,?,?,?,?,1,NULL,?,?)",(t-60,t,"claude",n,okno,d,t+s,"allowed","sdk_event","stend"))
db.commit()' "$1" "$2" "$RAB/state/limity.db"; }
# codex-инстанс среди живых: пустой токен, НЕ должен переключаться и попадать в перечень
# 07.10 (условие Вениамина 08:38Z): прежняя проба «смешанное без цели → отказ (код 2)» устарела словом владельца 05.10 23:45 МСК
#   («без вопросов переключать по очереди 1→2→3→1») и краснела в обходе 06.10 и 07.10. Теперь: смешанное среди ОБЩИХ без цели —
#   круг от подписки первого общего (iskra 2 → 3), все общие сводятся, перечень печатается; своя (Варвара 3) не тронута.
rasklad iskra:2 zarya:1 avrora:1 spartak:1 varvara:3 alfa:; echo '"podpiska-3"' > "$RAB/state/reestr-varvara"; snimok 3 0.3
K1=$(run); sud "смешанное среди общих без цели → круг от первого общего (2→3), код 0, все общие на 3, Варвара не тронута" \
  "$([ "$K1" = 0 ] && [ "$(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak)" = 3333 ] && ! grep -qx varvara "$RAB/restart.log" 2>/dev/null && echo 1)" \
  "код $K1, env $(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak), рестарты: $(tr '\n' ' ' < "$RAB/restart.log" 2>/dev/null)"
sud "перечень «кто на какой» среди общих напечатан, своей в нём нет" "$(grep 'СМЕШАННОЕ' "$RAB/out" | grep -q 'zarya=1' && grep 'СМЕШАННОЕ' "$RAB/out" | grep -q 'iskra=2' && ! grep 'СМЕШАННОЕ' "$RAB/out" | grep -q 'varvara' && echo 1)" "$(tr '\n' ' ' <"$RAB/out"|cut -c1-160)"
sud "codex alfa (пустой токен) НЕ в перечне" "$(! grep -q 'alfa=' "$RAB/out" && echo 1)" "alfa попал"

rasklad iskra:2 zarya:1 avrora:1 spartak:1 alfa:
K2=$(run 2); r=$(cat "$RAB/restart.log" 2>/dev/null|tr '\n' ' ')
sud "цель 2: переключены ровно zarya avrora spartak (не iskra, не alfa)" "$([ "$K2" = 0 ] && echo "$r"|grep -q zarya && echo "$r"|grep -q avrora && echo "$r"|grep -q spartak && ! echo "$r"|grep -q iskra && ! echo "$r"|grep -q alfa && echo 1)" "restart: $r код $K2"
sud "итог владельцу с именами (alert)" "$(grep -q 'переключено 3 шлюзов на подписку 2' "$RAB/alert.log" 2>/dev/null && echo 1)" "$(cat "$RAB/alert.log" 2>/dev/null)"
sud "все живые токены = 2 после" "$([ "$(cat "$RAB/state/live-zarya")" = 2 ] && [ "$(cat "$RAB/state/live-iskra")" = 2 ] && echo 1)" "zarya=$(cat "$RAB/state/live-zarya") iskra=$(cat "$RAB/state/live-iskra")"

# усл.2: первый переключаемый не поднялся → стоп + откат ЕГО, остальных не трогать
rasklad iskra:1 zarya:1 avrora:1 spartak:1
echo x > "$RAB/state/failstart-zarya"   # zarya не поднимется
K3=$(run 2); r=$(cat "$RAB/restart.log" 2>/dev/null|tr '\n' ' ')
sud "первый не поднялся → код 1, откат его (live zarya назад 1), avrora/spartak не тронуты" \
  "$([ "$K3" != 0 ] && [ "$(cat "$RAB/state/live-zarya")" = 1 ] && [ "$(cat "$RAB/state/live-avrora")" = 1 ] && echo 1)" "код $K3 · zarya live=$(cat "$RAB/state/live-zarya") · avrora live=$(cat "$RAB/state/live-avrora")"
sud "env-файл zarya откачен на 1" "$(grep -q 'token-podpiska-1$' "$ED/instance-zarya.env" && echo 1)" "$(grep GATEWAY "$ED/instance-zarya.env")"

# заслон лимита: цель 2, шлюз на 2 (iskra) ловил лимит только что → авто отказ, force проходит
rasklad iskra:2 zarya:1
echo $(( $(date +%s) - 3600 )) > "$RAB/state/start-iskra"    # шлюз стартовал час назад
date +%s > "$LIM/otkaz-limita-claude-oauth-gateway-iskra-service.txt"   # лимит МОЛОЖЕ старта → засчитать
K4=$(run 2); sud "дефект2: метка лимита МОЛОЖЕ старта → ОТКАЗ код 5 «лимит выбран»" "$([ "$K4" = 5 ] && grep -q "лимит выбран" "$RAB/out" && echo 1)" "код $K4: $(tail -1 "$RAB/out")"
# метка лимита СТАРШЕ старта (лимит пойман до переключения, на прошлой подписке) → НЕ отказ «лимит выбран»
rasklad iskra:2 zarya:1
echo $(date +%s) > "$RAB/state/start-iskra"                  # шлюз стартовал ТОЛЬКО что
echo $(( $(date +%s) - 3600 )) > "$LIM/otkaz-limita-claude-oauth-gateway-iskra-service.txt"  # лимит час назад, СТАРШЕ старта
echo x > "$RAB/state/nehod-iskra"                            # и не ходил → должно быть «расход неизвестен», НЕ «лимит выбран»
K4b=$(run 2); sud "дефект2: метка лимита СТАРШЕ старта → НЕ «лимит выбран» (расход неизвестен)" "$([ "$K4b" = 5 ] && ! grep -q "лимит выбран" "$RAB/out" && grep -q "НЕИЗВЕСТЕН" "$RAB/out" && echo 1)" "код $K4b: $(tail -1 "$RAB/out")"
K5=$(run 2 force); sud "force снимает заслон → переключение идёт (код 0)" "$([ "$K5" = 0 ] && echo 1)" "код $K5: $(tail -1 "$RAB/out")"

# отметка частоты
rasklad iskra:1 zarya:1
SWITCH_ENV_DIR="$ED" SWITCH_SYSTEMCTL="$RAB/bin/systemctl" SWITCH_LIMIT_DIR="$LIM" SWITCH_ALERT="$RAB/bin/alert" \
  SWITCH_LIVE_TOKEN_CMD="$RAB/bin/live" SWITCH_HOD_CMD="$RAB/bin/hodil" SWITCH_STEND=1 SWITCH_ITOG_FILE="$RAB/itog" SWITCH_LIMITY_READER="$RAB/bin/reader" SWITCH_OTMETKA="$RAB/otm" SWITCH_MIN_INTERVAL=999 SWITCH_SLEEP=0 RAB="$RAB" "$K" 2 force >/dev/null 2>&1
K6=$(SWITCH_ENV_DIR="$ED" SWITCH_SYSTEMCTL="$RAB/bin/systemctl" SWITCH_LIMIT_DIR="$LIM" SWITCH_ALERT="$RAB/bin/alert" SWITCH_LIVE_TOKEN_CMD="$RAB/bin/live" SWITCH_HOD_CMD="$RAB/bin/hodil" SWITCH_STEND=1 SWITCH_ITOG_FILE="$RAB/itog" SWITCH_LIMITY_READER="$RAB/bin/reader" SWITCH_OTMETKA="$RAB/otm" SWITCH_MIN_INTERVAL=999 SWITCH_SLEEP=0 RAB="$RAB" "$K" 1 force >/dev/null 2>&1; echo $?)
sud "отметка частоты: второй зов в окне → отказ (код 3)" "$([ "$K6" = 3 ] && echo 1)" "код $K6"

# однородное без цели → инверсия (все на 1 → 2)
rasklad iskra:1 zarya:1
K7=$(run force); sud "однородное без цели → инверсия на 2 (force; код 0, iskra=2)" "$([ "$K7" = 0 ] && [ "$(cat "$RAB/state/live-iskra")" = 2 ] && echo 1)" "код $K7 iskra=$(cat "$RAB/state/live-iskra")"

# set -u: порча — убрать инициализацию N_OK → падение (unbound); на исправном не падает
G=$(grep -c 'N_OK=0' "$K"); sud "N_OK инициализирован (set -u, урок C-N-1150)" "$([ "$G" -ge 1 ] && echo 1)" "N_OK=0 вхождений $G"

rasklad iskra:1 zarya:1 avrora:1 spartak:1
echo x > "$RAB/state/badtoken-zarya"
K8=$(run 2); sud "поднялся, но токен не сменился -> код 1, откат его, avrora не тронут" "$([ "$K8" != 0 ] && [ "$(cat "$RAB/state/live-avrora")" = 1 ] && grep -q "token-podpiska-1$" "$ED/instance-zarya.env" && echo 1)" "код $K8 avrora=$(cat "$RAB/state/live-avrora")"

# усл.3 ЗАСЛОН-ПОВЕДЕНИЕ: расход неизвестен — на цели никто не ходил без лимита → отказ, force снимает
rasklad iskra:2 zarya:1
echo x > "$RAB/state/nehod-iskra"   # единственный на цели(2) НЕ ходил, лимита нет
K9=$(run 2); sud "расход неизвестен (нет следа хождения на цели) → авто ОТКАЗ код 5, текст «НЕИЗВЕСТЕН»" "$([ "$K9" = 5 ] && grep -q "НЕИЗВЕСТЕН" "$RAB/out" && echo 1)" "код $K9: $(tail -1 "$RAB/out")"
K10=$(run 2 force); sud "force снимает «расход неизвестен» → переключение (код 0)" "$([ "$K10" = 0 ] && echo 1)" "код $K10"
rasklad iskra:2 zarya:1   # на цели(2) iskra ХОДИЛ без лимита → проход разрешён
K11=$(run 2); sud "есть шлюз на цели, ходил без лимита → заслон пропускает (код 0)" "$([ "$K11" = 0 ] && echo 1)" "код $K11: $(tail -1 "$RAB/out")"

# усл.2 Вениамина (v3): отметка НЕ записалась → громкий отказ код 6, БЕЗ «|| true»
rasklad iskra:1 zarya:1
printf x > "$RAB/blockfile"   # файл на месте каталога-родителя: mkdir -p упадёт, отметку не записать
K12=$(SWITCH_ENV_DIR="$ED" SWITCH_SYSTEMCTL="$RAB/bin/systemctl" SWITCH_LIMIT_DIR="$LIM" SWITCH_ALERT="$RAB/bin/alert" SWITCH_LIVE_TOKEN_CMD="$RAB/bin/live" SWITCH_HOD_CMD="$RAB/bin/hodil" SWITCH_STEND=1 SWITCH_ITOG_FILE="$RAB/itog" SWITCH_LIMITY_READER="$RAB/bin/reader" SWITCH_OTMETKA="$RAB/blockfile/otm" SWITCH_MIN_INTERVAL=0 SWITCH_SLEEP=0 RAB="$RAB" "$K" 2 force >"$RAB/out" 2>&1; echo $?)
sud "отметка не записалась (путь закрыт) → ОТКАЗ код 6, без молчания" "$([ "$K12" = 6 ] && grep -q "отметку частоты не записать" "$RAB/out" && [ -z "$(cat "$RAB/restart.log" 2>/dev/null)" ] && echo 1)" "код $K12: $(tail -1 "$RAB/out")"

# форма 1-force одним аргументом (как из @-единицы)
rasklad iskra:2 zarya:2
date +%s > "$LIM/otkaz-limita-claude-oauth-gateway-iskra-service.txt"; date +%s > "$LIM/otkaz-limita-claude-oauth-gateway-zarya-service.txt"
K13=$(run 1-force); sud "форма «1-force» = цель 1 + force (обходит лимит), код 0" "$([ "$K13" = 0 ] && echo 1)" "код $K13: $(tail -1 "$RAB/out")"

# ДЕФЕКТ 1 (проба владельца 19:09Z): все уже на цели + свежий лимит на цели → «менять нечего» код 0, ДО заслона
rasklad iskra:2 zarya:2
echo $(( $(date +%s) - 3600 )) > "$RAB/state/start-iskra"; echo $(( $(date +%s) - 3600 )) > "$RAB/state/start-zarya"
date +%s > "$LIM/otkaz-limita-claude-oauth-gateway-iskra-service.txt"   # лимит есть — но менять некого
Kd=$(run 2); sud "дефект1: все на цели (даже при свежем лимите) → «менять нечего» код 0, restart пуст, не «лимит выбран»" \
  "$([ "$Kd" = 0 ] && grep -q "менять нечего" "$RAB/out" && ! grep -q "лимит выбран" "$RAB/out" && [ -z "$(cat "$RAB/restart.log" 2>/dev/null)" ] && echo 1)" "код $Kd: $(tail -1 "$RAB/out") · restart[$(cat "$RAB/restart.log" 2>/dev/null|tr '\n' ' ')]"

# v6 (low Вениамина 20:29Z): старт шлюза НЕ УЗНАН → не засчитывать ни «ходил», ни «лимит выбран»
rasklad iskra:2 zarya:1
echo 0 > "$RAB/state/start-iskra"                            # старт не узнан; шлюз «ходил» (журнал с @0 — весь)
K6a=$(run 2); sud "v6: старт не узнан (0) + «ходил» → ОТКАЗ код 5 «НЕИЗВЕСТЕН» с именем, restart пуст" \
  "$([ "$K6a" = 5 ] && grep -q "НЕИЗВЕСТЕН" "$RAB/out" && grep -q "старт процесса не узнан: iskra" "$RAB/out" && [ -z "$(cat "$RAB/restart.log" 2>/dev/null)" ] && echo 1)" "код $K6a: $(tail -1 "$RAB/out")"
rasklad iskra:2 zarya:1
: > "$RAB/state/start-iskra"                                 # старт пуст; свежая метка лимита
date +%s > "$LIM/otkaz-limita-claude-oauth-gateway-iskra-service.txt"
K6b=$(run 2); sud "v6: старт пуст + свежая метка → «НЕИЗВЕСТЕН», не «лимит выбран» (граница пропала)" \
  "$([ "$K6b" = 5 ] && grep -q "НЕИЗВЕСТЕН" "$RAB/out" && ! grep -q "лимит выбран" "$RAB/out" && echo 1)" "код $K6b: $(tail -1 "$RAB/out")"

# ── B-N-1394 r2 (условие Вениамина 03:04Z): главное поведение B-N-1390 — reader на ПОДСТАВНЫХ снимках ──────
# снимок <цель> <доля недели> (стр. 180): подставная таблица dsh-limity, свежие замеры; нецелевые — свободны
# (r2-b) цель 2 в недельном лимите по таблице dsh-limity; локально шлюз на цели ХОДИЛ без лимита — без reader был бы проход
rasklad iskra:2 zarya:1; snimok 2 1.0
Kb=$(run 2); sud "r2: таблица dsh-limity blocked (неделя 1.0) → ОТКАЗ (заслон) код 5, restart пуст" \
  "$([ "$Kb" = 5 ] && grep -q 'ОТКАЗ: у подписки 2 лимит выбран' "$RAB/out" && grep -q 'dsh-limity: исчерпана' "$RAB/out" && [ -z "$(cat "$RAB/restart.log" 2>/dev/null)" ] && echo 1)" \
  "код $Kb: $(tail -1 "$RAB/out"|cut -c1-200)"
# (r2-f) цель 2 свободна по таблице dsh-limity; локально на цели НЕ ходили (расход неизвестен) — без reader был бы отказ
rasklad iskra:2 zarya:1; echo x > "$RAB/state/nehod-iskra"; snimok 2 0.3
Kf=$(run 2); r=$(cat "$RAB/restart.log" 2>/dev/null|tr '\n' ' ')
sud "r2: таблица dsh-limity free (5ч 0.1, неделя 0.3) + локально неизвестно → проход, переключена zarya (код 0)" \
  "$([ "$Kf" = 0 ] && [ "$r" = "zarya " ] && grep -q 'dsh-limity: свободна' "$RAB/out" && echo 1)" \
  "код $Kf restart[$r]: $(tail -1 "$RAB/out"|cut -c1-200)"
# B-N-1806: «tiho» — переключение как обычно, итог в ITOG_FILE, а тревоги владельцу НЕТ (её шлёт зовущий dsh-limity-avtoperekl)
rasklad iskra:2 zarya:1; echo x > "$RAB/state/nehod-iskra"; snimok 2 0.3; : > "$RAB/alert.log"
Kt=$(run 2 tiho); r=$(cat "$RAB/restart.log" 2>/dev/null|tr '\n' ' ')
sud "tiho: переключена zarya (код 0), итог в файле, тревоги нет" \
  "$([ "$Kt" = 0 ] && [ "$r" = "zarya " ] && grep -q 'переключены: zarya' "$RAB/itog" && [ ! -s "$RAB/alert.log" ] && echo 1)" \
  "код $Kt restart[$r] тревог $(wc -l < "$RAB/alert.log" 2>/dev/null): $(tail -1 "$RAB/out"|cut -c1-160)"

# ── B-N-1394: ключ SWITCH_STEND ────────────────────────────────────────────────
# (к1) КЛЮЧА НЕТ: все 20 SWITCH_* отравлены (B-N-1621: и SWITCH_SVESTI; k2: и экспортный SWITCH_BAK_DIR) (SWITCH_SYSTEMCTL=/bin/false, остальные — метки-ловушки).
# Боевой systemctl/sudo ищутся по PATH — там подставные, пишущие журнал. Шлюзы уже на цели → «менять нечего»,
# до заслона и записи не доходит. Подмена взята → /bin/false → «живых не найдено» код 4 (так ведёт себя основа bb002230).
# 🔴 СУХОСТЬ: без ключа ITOG_FILE и OTMETKA — БОЕВЫЕ пути; от iskra каталог закрыт (750 root:agent-switch),
# запись итога откажет. Если каталог ПИШЕТСЯ этой учёткой — проба НЕ гоняется и краснеет (не трогаем бой).
mkdir -p "$RAB/pathbin" "$RAB/yad"
cat > "$RAB/pathbin/systemctl" <<PY
#!/usr/bin/env python3
import sys,os; RAB=os.environ["RAB"]; a=sys.argv[1:]
open(RAB+"/pathbin.log","a").write("systemctl "+" ".join(a)+"\n")
if a[:1]==["list-units"]:
    for u in open(RAB+"/units").read().split(): print(f"{u} loaded active running")
elif "show" in a: print("1000")
sys.exit(0)
PY
cat > "$RAB/pathbin/sudo" <<PY
#!/usr/bin/env python3
import sys,os; RAB=os.environ["RAB"]; a=sys.argv[1:]
open(RAB+"/pathbin.log","a").write("sudo "+" ".join(a)+"\n")
if a[:1]==["cat"] and a[1].startswith("/proc/") and a[1].endswith("/environ"):
    sys.stdout.write("X=1\0GATEWAY_TOKEN_FILE=/net/token-podpiska-1\0"); sys.exit(0)
sys.exit(1)   # всё прочее — отказ, настоящий sudo не зовётся никогда
PY
printf '#!/bin/sh\necho "$0" >> "%s/yad.log"\n' "$RAB" > "$RAB/yad/lovushka"
chmod +x "$RAB/pathbin/systemctl" "$RAB/pathbin/sudo" "$RAB/yad/lovushka"
rasklad iskra:1 zarya:1; : > "$RAB/pathbin.log"; : > "$RAB/yad.log"
BITOG=/var/lib/pereklyuchatel-podpiski
if [ -w "$BITOG" ]; then
  sud "к1: без ключа подмены ИГНОРИРУЮТСЯ (сухо)" 0 "каталог $BITOG пишется этой учёткой ($(id -un)) — проба тронула бы боевой итог; гонять от iskra"
else
  Kk1=$(PATH="$RAB/pathbin:$PATH" RAB="$RAB" SWITCH_SYSTEMCTL=/bin/false SWITCH_ENV_DIR="$RAB/yad" SWITCH_LIMIT_DIR="$RAB/yad" \
    SWITCH_ALERT="$RAB/yad/lovushka" SWITCH_LIVE_TOKEN_CMD="$RAB/yad/lovushka" SWITCH_OKNO_LIMITA=1 SWITCH_OTMETKA="$RAB/yad/otm" \
    SWITCH_ITOG_FILE="$RAB/yad/itog" SWITCH_HOD_CMD="$RAB/yad/lovushka" SWITCH_START_CMD="$RAB/yad/lovushka" \
    SWITCH_LIMITY_READER="$RAB/yad/lovushka" SWITCH_MIN_INTERVAL=0 SWITCH_SLEEP=0 SWITCH_TURN_CMD="$RAB/yad/lovushka" SWITCH_TURN_WAIT=0 SWITCH_TURN_POLL=1 SWITCH_TURN_PROBE=1 SWITCH_SVESTI="$RAB/yad/lovushka" SWITCH_REGISTRY="$RAB/yad/lovushka" "$K" 1 > "$RAB/out" 2>&1; echo $?)
  sud "к1: без ключа подмены ИГНОРИРУЮТСЯ — взят systemctl из PATH, «менять нечего» код 0, ловушки молчат" \
    "$([ "$Kk1" = 0 ] && grep -q 'менять нечего' "$RAB/out" && grep -q '^systemctl list-units' "$RAB/pathbin.log" && [ ! -s "$RAB/yad.log" ] && [ ! -e "$RAB/yad/itog" ] && [ ! -e "$RAB/yad/otm" ] && echo 1)" \
    "код $Kk1: $(tr '\n' ' ' <"$RAB/out"|cut -c1-200) · PATH-вызовов $(grep -c . "$RAB/pathbin.log") · ловушек $(grep -c . "$RAB/yad.log")"
  sud "к1: без ключа — строка «ИГНОРИРУЮ» со всеми 21 именами (07.10: +REGISTRY), «ПОДМЕНЕНО» нет" \
    "$([ "$(grep '^ИГНОРИРУЮ' "$RAB/out" | sed 's/.*боевые://' | grep -o 'SWITCH_[A-Z_]*' | wc -l)" = 21 ] && ! grep -q '^ПОДМЕНЕНО' "$RAB/out" && echo 1)" \
    "$(grep -E '^(ИГНОРИРУЮ|ПОДМЕНЕНО)' "$RAB/out" | cut -c1-200)"
fi
# (к2) КЛЮЧ ЕСТЬ: первая строка вывода — «ПОДМЕНЕНО:» ровно с поданными именами (run подаёт 18, без OKNO_LIMITA; B-N-1621: +SVESTI; k2: +BAK_DIR экспортом = 19)
rasklad iskra:2 zarya:1
Kk2=$(run 2)
sud "к2: с ключом первая строка «ПОДМЕНЕНО:» ровно с 20 поданными именами (07.10: +REGISTRY)" \
  "$([ "$(head -1 "$RAB/out")" = "ПОДМЕНЕНО: REGISTRY ENV_DIR SYSTEMCTL LIMIT_DIR ALERT LIVE_TOKEN_CMD OTMETKA ITOG_FILE HOD_CMD START_CMD LIMITY_READER MIN_INTERVAL SLEEP TURN_CMD TURN_WAIT TURN_POLL TURN_PROBE JOURNALCTL BAK_DIR SVESTI" ] && echo 1)" \
  "код $Kk2, первая строка: $(head -1 "$RAB/out")"
# (к3) КЛЮЧ ≠ 1 → ОТКАЗ код 2, никого не трогаем
rasklad iskra:2 zarya:1
Kk3=$(SWITCH_STEND=yes SWITCH_ENV_DIR="$ED" SWITCH_SYSTEMCTL="$RAB/bin/systemctl" SWITCH_LIVE_TOKEN_CMD="$RAB/bin/live" \
  SWITCH_ITOG_FILE="$RAB/itog" SWITCH_OTMETKA="$RAB/otm" SWITCH_MIN_INTERVAL=0 SWITCH_SLEEP=0 RAB="$RAB" "$K" 2 force > "$RAB/out" 2>&1; echo $?)
sud "к3: SWITCH_STEND=yes → ОТКАЗ код 2 «допустимо только 1», restart пуст" \
  "$([ "$Kk3" = 2 ] && grep -q 'допустимо только 1' "$RAB/out" && [ -z "$(cat "$RAB/restart.log" 2>/dev/null)" ] && echo 1)" \
  "код $Kk3: $(tail -1 "$RAB/out")"

# Новые пробы проверяют и состояние env, и факт restart, не только сообщение.
rasklad iskra:1 zarya:1
cp "$ED/instance-iskra.env" "$RAB/before-busy"
touch "$RAB/state/busy-iskra"
Kbusy=$(run 2 force)
sud "ход идёт → занят не переключён, свободный переключён, частично7" \
  "$([ "$Kbusy" = 7 ] && cmp -s "$ED/instance-iskra.env" "$RAB/before-busy" && [ "$(cat "$RAB/restart.log")" = zarya ] && grep -qF 'iskra занят — не переключён' "$RAB/out" && echo 1)" "код $Kbusy"
sud "частичный итог несёт фактические имена владельцу" \
  "$(grep -qF 'переключены: zarya' "$RAB/itog" && grep -qF 'заняты и не переключены: iskra' "$RAB/itog" && echo 1)" "итог не совпал"
rasklad iskra:1 zarya:1
touch "$RAB/state/busy-once-iskra"
Kfree=$(SWITCH_TURN_WAIT=3 run 2 force)
sud "занятый освободился в пределе → оба переключены" \
  "$([ "$Kfree" = 0 ] && [ "$(wc -l < "$RAB/restart.log")" = 2 ] && echo 1)" "код $Kfree"
rasklad iskra:2 zarya:1
printf '{"MESSAGE":"[subscription-gateway fixture] 🔴 сбой вызова: HTTP 429 hit your usage limit; resets 7am (Europe/Moscow)","_PID":"1000","SYSLOG_IDENTIFIER":"node","__REALTIME_TIMESTAMP":"%s000000"}\n' "$(date +%s)" > "$RAB/state/journal.jsonl"
Kjournal=$(run 2)
sud "журнал 429 → лимит выбран со сбросом, без рестартов" \
  "$([ "$Kjournal" = 5 ] && grep -qF 'у подписки 2 лимит выбран' "$RAB/out" && grep -qF '7am (Europe/Moscow)' "$RAB/out" && [ ! -s "$RAB/restart.log" ] && echo 1)" "код $Kjournal"
rasklad iskra:2 zarya:1
touch "$RAB/state/nehod-iskra"
Kempty=$(run 2)
sud "пустой журнал и нет другого замера → неизвестен" \
  "$([ "$Kempty" = 5 ] && grep -qF 'НЕИЗВЕСТЕН' "$RAB/out" && ! grep -qF 'лимит выбран' "$RAB/out" && echo 1)" "код $Kempty"
# ── B-N-1621: доступ к токенам (ACL) — цель без ACL → выдан ДО restart → переключено → старая отозвана ─────
kto(){ getfacl -c "$ED/token-podpiska-$1" 2>/dev/null | sed -n 's/^user:\([a-z]*\):r--.*/\1/p' | sort | tr '\n' ' '; }
rasklad iskra:1 zarya:1; "$RAB/bin/svesti" --svesti >/dev/null 2>&1; : > "$RAB/svesti.log"
do1=$(kto 1); do2=$(kto 2)
KA1=$(run 2 force)
sud "А1: до (1: ${do1}| 2: ${do2:-никто}) → код $KA1 → после (1: $(kto 1)| 2: $(kto 2)); выдача ДО первого restart, свод в конце" \
  "$([ "$KA1" = 0 ] && [ "$do1" = 'iskra zarya ' ] && [ -z "$do2" ] && [ -z "$(kto 1)" ] && [ "$(kto 2)" = 'iskra zarya ' ] \
     && [ "$(head -1 "$RAB/svesti.log")" = '--dobavit restartov=0' ] && [ "$(tail -1 "$RAB/svesti.log" | cut -d' ' -f1)" = --svesti ] \
     && grep -qF 'Доступ к токенам сведён' "$RAB/itog" && echo 1)" "журнал помощника: $(tr '\n' ';' < "$RAB/svesti.log")"
rasklad iskra:1 zarya:1; cp "$ED/instance-iskra.env" "$RAB/before-a2"
KA2=$(SWITCH_SVESTI="$RAB/bin/svesti-otkaz" run 2 force)
sud "А2: помощник не выдал → код 1, настройка iskra возвращена, restart не было" \
  "$([ "$KA2" = 1 ] && cmp -s "$ED/instance-iskra.env" "$RAB/before-a2" && [ ! -s "$RAB/restart.log" ] && grep -qF 'доступ к token-podpiska-2 не выдан' "$RAB/out" && echo 1)" \
  "код $KA2, restart: $(cat "$RAB/restart.log" 2>/dev/null | tr '\n' ' ')"
rasklad iskra:1 zarya:1; "$RAB/bin/svesti" --svesti >/dev/null 2>&1; touch "$RAB/state/failstart-iskra"
KA3=$(run 2 force)
sud "А3: шлюз не поднялся → откат настройки → выданное под цель отозвано (2: никто, 1: iskra zarya)" \
  "$([ "$KA3" = 1 ] && [ -z "$(kto 2)" ] && [ "$(kto 1)" = 'iskra zarya ' ] && echo 1)" "код $KA3, 1: $(kto 1)| 2: $(kto 2)"
rasklad iskra:1 zarya:1
KA4=$(SWITCH_SVESTI= run 2 force)
sud "А4: SWITCH_STEND=1 без SWITCH_SVESTI → ОТКАЗ код 2, restart пуст" \
  "$([ "$KA4" = 2 ] && grep -qF 'без SWITCH_SVESTI' "$RAB/out" && [ ! -s "$RAB/restart.log" ] && echo 1)" "код $KA4: $(tail -1 "$RAB/out")"
bak_posle=$(sudo -n ls -1 "$BOEVOJ_BAK" 2>&1; echo "код $?"); nb=$(find "$RAB/bak" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
sud "Б1 (k2): страховки легли в подставной каталог ($nb), боевой $BOEVOJ_BAK не тронут" \
  "$([ "$nb" -gt 0 ] && [ "$bak_do" = "$bak_posle" ] && [ "${bak_do##*код }" = 0 ] && echo 1)" "подставных $nb; боевой до/после равны: $([ "$bak_do" = "$bak_posle" ] && echo да || echo НЕТ); чтение: ${bak_do##*код }"
# ── 07.10: своя подписка по реестру (слово владельца 02:19 МСК: все Claude на 2, КРОМЕ Варвары — на 3; наряд Забавы).
# Р1: общие 2,2,2,2 + Варвара 3 (своя по реестру), цель 1 → меняются четверо, Варвара нет.
rasklad iskra:2 zarya:2 avrora:2 spartak:2 varvara:3; echo '"podpiska-3"' > "$RAB/state/reestr-varvara"; snimok 1 0.3
KR=$(run 1)
sud "Р1 цель 1 при 2,2,2,2+своя 3: код 0" "$([ "$KR" = 0 ] && echo 1)" "код $KR · $(tail -2 "$RAB/out" | tr '\n' ' ' | cut -c1-160)"
sud "Р1 четверо общих на 1 (env и живой), Варвара — 3 и не перезапущена" "$([ "$(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak)" = 1111 ] && [ "$(envtok varvara)" = 3 ] && [ "$(cat "$RAB/state/live-varvara")" = 3 ] && ! grep -qx varvara "$RAB/restart.log" 2>/dev/null && echo 1)" "env $(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak)/$(envtok varvara), рестарты: $(tr '\n' ' ' < "$RAB/restart.log" 2>/dev/null)"
sud "Р1 печать «varvara: своя подписка 3 по реестру — не трогаю» и итог о своей" "$(grep -qF 'varvara: своя подписка 3 по реестру — не трогаю' "$RAB/out" && grep -qF 'Своя подписка по реестру — не тронута: varvara=3' "$RAB/itog" && echo 1)" "$(grep -c своя "$RAB/out") строк"
# Р2: без цели; Варвара ПЕРВОЙ в списке (3), общие 2,2,2,2 → круг считается от общих: 2→3, не от Варвары (3→1), и не «смешанное».
rasklad varvara:3 iskra:2 zarya:2 avrora:2 spartak:2; echo '"podpiska-3"' > "$RAB/state/reestr-varvara"; snimok 3 0.3
KR=$(run)
sud "Р2 без цели: код 0, общие 2→3, Варвара не перезапущена, «СМЕШАННОЕ» нет" "$([ "$KR" = 0 ] && [ "$(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak)" = 3333 ] && ! grep -qx varvara "$RAB/restart.log" 2>/dev/null && ! grep -q СМЕШАННОЕ "$RAB/out" && echo 1)" "код $KR, env $(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak), $(grep -o 'СМЕШАННОЕ.\{0,40\}' "$RAB/out" | head -1)"
# Р3: у агента нет поля podpiska → ОТКАЗ (код 4) с причиной в итоге; никто не перезапущен, env не тронуты.
rasklad iskra:2 zarya:2 avrora:2 spartak:2 varvara:3; touch "$RAB/state/reestr-net-zarya"; snimok 1 0.3
KR=$(run 1)
sud "Р3 нет поля у zarya → отказ код 4, никто не перезапущен, env прежние" "$([ "$KR" = 4 ] && [ ! -s "$RAB/restart.log" ] && [ "$(envtok iskra)$(envtok zarya)$(envtok avrora)$(envtok spartak)$(envtok varvara)" = 22223 ] && echo 1)" "код $KR, рестартов $(wc -l < "$RAB/restart.log" 2>/dev/null || echo 0)"
sud "Р3 причина — в итоге прогона (не «без сообщения»)" "$(grep -qF 'реестр не дал подписку агента zarya' "$RAB/itog" && echo 1)" "$(cut -c1-140 "$RAB/itog" 2>/dev/null)"
# Р3б: podpiska = null (не общая и не своя) → тот же отказ.
rasklad iskra:2 zarya:2 avrora:2 spartak:2; echo 'null' > "$RAB/state/reestr-avrora"; snimok 1 0.3
KR=$(run 1)
sud "Р3б podpiska=null у avrora → отказ код 4, никто не перезапущен" "$([ "$KR" = 4 ] && [ ! -s "$RAB/restart.log" ] && grep -qF 'avrora в реестре podpiska=null' "$RAB/itog" && echo 1)" "код $KR · $(cut -c1-120 "$RAB/itog" 2>/dev/null)"

echo; echo "итог: $ok из $vsego"
ZHDYOM=47   # 07.10: +7 проб своей подписки (Р1×3, Р2, Р3×2, Р3б); 08.10 B-N-1806: +1 «tiho»
[ "$vsego" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $vsego, ждём $ZHDYOM"; exit 2; }
[ "$bed" = 0 ]
