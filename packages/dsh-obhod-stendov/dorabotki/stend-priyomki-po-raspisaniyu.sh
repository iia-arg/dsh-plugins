#!/bin/bash
# 🔴 B-N-906 (25.09.2026, Михалыч; стенд Искры): БЫЛО «⛔ НЕ ЗАПУСКАТЬ БЕЗ ПОДМЕН — подменить BACKUP_VERIFY_STATE
#    до прогона». Совет был НЕИСПОЛНИМ: сторож зовётся через `sudo -n env <явный список>`, а sudo на sadik
#    с env_reset — внешняя переменная до сторожа НЕ ДОХОДИТ (замер 25.09: и от claude, и от root). Проба
#    «зелено» писала БОЕВУЮ /var/lib/sadik-backup/proverena.json при ЛЮБОМ запуске; 25.09 15:08Z так
#    затёрта боевая отметка. Теперь: (1) стенд САМ передаёт BACKUP_VERIFY_STATE=$RAB/proverena.json в
#    каждой пробе; (2) ОТКАЗ до проб, если сторож не знает хоть одной обещанной подмены (BACKUP_VERIFY_STATE,
#    BACKUP_STATE, BACKUP_BIN, PRIYOMKA_BIN, AGENT_ALERT_BIN); (3) самопроверка: отметка по умолчанию
#    (путь из текста сторожа) до = после, и подменённая отметка получила след.
# Приёмка приёмки: проверяет сторожа /usr/local/sbin/proverka-svezhesti-kopii.sh —
# того, кто ежедневно скачивает уехавшую копию и убеждается, что она открывается.
#
# Текст и поведение берутся ИЗ УСТАНОВЛЕННОГО файла, а не из копии рядом: копия
# расходится с боевым молча, мы это ловили на двух копиях модуля связи.
#
# 🔴 ГДЕ СТЕНД НЕ ПРИМЕНЯЕТСЯ (границы охвата, а не воздействия):
#   • НЕ проверяет транспорт: скачивание подменяется заглушкой, чтобы прогон не зависел
#     от сети и не тянул 32 МБ восемь раз. Настоящее скачивание доказывается боевым
#     прогоном юнита, и только им;
#   • НЕ проверяет саму приёмку копии (proverka-kopii.sh) — у неё свой стенд;
#   • НЕ проверяет, что тревога дошла ДО ЧЕЛОВЕКА: отправщик подменяется заглушкой,
#     иначе каждый прогон стенда будил бы владельца. Доставка доказана боевым прогоном;
#   • НЕ трогает боевую отметку, боевые архивы и боевой Drive: все данные подставные,
#     во временном каталоге, который убирается в trap.
#
#   • 🔴 B-N-1465 (03.10.2026, Заря): НЕ зависит от ЖИВОЙ сборки копии. Раздел «1б» сторожа сверяет отметку с
#     последним запуском sadik-backup.service/.timer; 03.10 03:47Z случай «протухла» шёл, пока ночная сборка была
#     activating (03:02:14–03:50:08Z) — сторож законно дал «НЕ ГОТОВО» 2 вместо 1. Теперь случаи раздела 3 судятся
#     по ПОДСТАВНОЙ сборке (systemd-run, запуск в начале стенда, раньше подставных отметок) и несуществующему таймеру;
#     живая — только в случае «нет отметки, а таймер срабатывал» (там нужен именно сработавший боевой таймер).
#     Подставные юниты — stend-priyomki-sborka-*: гасятся в trap по имени, без trap — сами через 900 с (sleep 900).
#     B-N-1466: свежесть у сторожа стоит ДО 1б — «протухла» проверяется на ШТАТНЫХ порогах (отметка −99 ч, без PREDEL_*);
#     случаи 1б («не дала копии», «сборка идёт») — на вчерашней отметке (−24 ч < 30), как в настоящую ночь.
#
# КОДЫ: 0 — сошлось | 1 — расхождение | 2 — часть проверок не состоялась
set -uo pipefail
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
STOROZH="${STOROZH:-/usr/local/sbin/proverka-svezhesti-kopii.sh}"
SERVICE=/etc/systemd/system/backup-verify.service
# B-N-1429 (02.10.2026, Аврора): политика успеха — ЖИВАЯ (systemctl show), а не строка в файле юнита. С B-N-918 (26.09) строки
#   «SuccessExitStatus=1 2» в юните нет: успех решает drop-in zz-itogi-priyomki.conf (пустой SuccessExitStatus ⇒ успех только код 0,
#   прочие — failed, голос — OnFailure → kopiya-upala). Прежняя проба искала снятую строку и краснела на исправном бою (27/28).
# PRIYOMKA_UNIT — подмена ТОЛЬКО для стенда стенда (подставной юнит systemd-run); обход её не задаёт. Порча так видна на подставном
#   юните, а не на боевом. ⚠️ ЧЕГО НЕ ЛОВИТ: drop-in, лежащий на диске без daemon-reload (живое значение — старое; это класс «на диске,
#   не в памяти», его ловит не этот стенд).
PRIYOMKA_UNIT="${PRIYOMKA_UNIT:-backup-verify.service}"
TIMER=/etc/systemd/system/backup-verify.timer
WDCONF=/etc/agent-watchdog/watchdog.conf
ZHDYOM_PROVEROK=37   # B-N-2101 r2: +2 (отказ по составу → «неполна», тревога без НЕГОДНА); B-N-2101: +2 (неполна по составу → код 9; тревога без «НЕГОДНА»). B-N-1465: +3 (подставные сборки подняты; «не дала копии» 1; «сборка идёт» 2). B-N-1435 (3): +2 (потоковая × S → качает; прежняя × S → отказ по месту). B-H-1427: +2 (нехватка места → код 2; скачивание не звали). B-N-906: +2 (боевая отметка не тронута; след в подменённой). Канарейка точным числом: порог «не меньше» слеп к убыли, что
                     # умещается в запас — проверено порчей 23.08 (33 против 42 прошло)

ok=0; fail=0; slep=0
p()  { echo "  ok   $1"; ok=$((ok+1)); }
f()  { echo "  FAIL $1"; fail=$((fail+1)); }
s()  { echo "  ?    $1"; slep=$((slep+1)); }
proba() { # ожидаемый_код описание env...
  local ozh="$1" opis="$2"; shift 2
  local out rc
  out=$(sudo -n env "BACKUP_VERIFY_STATE=$RAB/proverena.json" "${SBORKA[@]}" "$@" bash "$STOROZH" 2>&1); rc=$?
  if [ "$rc" = "$ozh" ]; then p "$opis (код $rc)"
  else f "$opis: ждали $ozh, получили $rc | $(echo "$out" | tail -1)"; fi
}
# B-N-1429 (возражение Искры 02.10): код 2 у сторожа — и «ОТКАЗ ПО МЕСТУ», и две слепоты (отметка не разбирается; место не
#   измерено). Где код не различает исход, проба требует ещё и текст исхода — во ВСЁМ выводе (после vyhod печатает итог).
proba_tekst() { # ожидаемый_код обязательный_текст описание env...
  local ozh="$1" tekst="$2" opis="$3"; shift 3
  local out rc
  out=$(sudo -n env "BACKUP_VERIFY_STATE=$RAB/proverena.json" "${SBORKA[@]}" "$@" bash "$STOROZH" 2>&1); rc=$?
  if [ "$rc" = "$ozh" ] && grep -qF -- "$tekst" <<< "$out"; then p "$opis (код $rc, «$tekst»)"
  else f "$opis: ждали $ozh и «$tekst», получили $rc | $(echo "$out" | tail -1)"; fi
}

[ -x "$STOROZH" ] || { echo "СЛЕПОТА: нет $STOROZH"; exit 2; }
for v in BACKUP_VERIFY_STATE BACKUP_STATE BACKUP_BIN PRIYOMKA_BIN AGENT_ALERT_BIN; do
  grep -q "\${$v:-" "$STOROZH" || { echo "ОТКАЗ: сторож $STOROZH не даёт подменить $v — прогон писал бы/звал бы в бой. Пробы не начаты."; exit 2; }
done
BOEVAYA_OTMETKA=$(sed -n 's/.*\${BACKUP_VERIFY_STATE:-\([^}"]*\)}.*/\1/p' "$STOROZH" | head -1)
[ -n "$BOEVAYA_OTMETKA" ] || { echo "ОТКАЗ: путь боевой отметки не извлечён из $STOROZH — самопроверку не на чем строить"; exit 2; }
otm_summa() { sudo -n sha256sum -- "$1" 2>/dev/null | cut -c1-64 || true; }
OTM_DO=$(otm_summa "$BOEVAYA_OTMETKA"); OTM_DO=${OTM_DO:-net}
RAB=$(mktemp -d /tmp/stend-priyomki.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
# B-N-1465: подставные сборки (см. шапку). SBORKA — подмены по умолчанию для всех проб; явная подмена случая стоит
#   позже в env и побеждает. Скачивание и приёмка по умолчанию тоже подставные: случай, проскочивший отказ на порче
#   сторожа, не должен тянуть настоящий архив с Drive.
SB_GOTOVA="stend-priyomki-sborka-$$-$RANDOM.service"; SB_IDET="stend-priyomki-sborka-idet-$$-$RANDOM.service"
SBORKA=("BACKUP_SERVICE=$SB_GOTOVA" "BACKUP_TIMER=xyzzy-net-takogo.timer" "BACKUP_BIN=$RAB/skach-net.sh" "PRIYOMKA_BIN=$RAB/priyomka-slep.sh")
trap 'rm -rf "$RAB"; sudo -n systemctl stop "$SB_GOTOVA" "$SB_IDET" >/dev/null 2>&1' EXIT
chmod 755 "$RAB"

echo "== 1. Устройство =="
bash -n "$STOROZH" && p "синтаксис" || f "синтаксис"
# B-N-911: с B-N-846 уборка — в общем обработчике выхода (`trap itog_priyomki EXIT`, внутри `rm -rf -- "$RAB"`), а не
# строкой `trap 'rm -rf …'`. Засчитываются обе формы; поведение (каталог убран) судит проба раздела 4.
trap_fn=$(sed -n 's/^trap \([A-Za-z_][A-Za-z0-9_]*\) EXIT.*/\1/p' "$STOROZH" | head -1)
if grep -q "trap .*rm -rf" "$STOROZH" \
   || { [ -n "$trap_fn" ] && sed -n "/^${trap_fn}() {/,/^}/p" "$STOROZH" | grep -q 'rm -rf'; }; then
  p "временный каталог убирается в trap${trap_fn:+ (обработчик $trap_fn)}"
else f "уборки в trap НЕТ — архив с ключом останется на диске"; fi
grep -q 'chmod 700' "$STOROZH" && p "временный каталог закрывается 0700" || f "каталог не закрывается: в архиве закрытый ключ"
grep -q 'AGENT_ALERT_BIN' "$STOROZH" && p "отправщик берётся из переменной (стенд можно прогнать, не будя человека)" || f "отправщик зашит — стенд неотличим от боевой тревоги"
grep -q 'LastTriggerUSec' "$STOROZH" && p "разделитель «сборки ещё не было» / «сборка встала» на месте" || f "разделителя нет: отсутствие копии неотличимо от аварии"

echo "== 2. Юниты =="
[ -f "$SERVICE" ] && p "юнит службы на месте" || f "юнита службы нет"
[ -f "$TIMER" ]   && p "таймер на месте"      || f "таймера нет"
ZHIVOJ_SES=$(systemctl show "$PRIYOMKA_UNIT" -p SuccessExitStatus --value 2>/dev/null); ZHIVOJ_LOAD=$(systemctl show "$PRIYOMKA_UNIT" -p LoadState --value 2>/dev/null)
if [ "$ZHIVOJ_LOAD" != loaded ]; then s "политика успеха $PRIYOMKA_UNIT не снята (LoadState=«$ZHIVOJ_LOAD»)"
elif [ -z "$ZHIVOJ_SES" ]; then p "живая политика $PRIYOMKA_UNIT: SuccessExitStatus пуст — успех только код 0 (zz-itogi-priyomki.conf), прочие коды — failed"
else f "живой SuccessExitStatus $PRIYOMKA_UNIT = «$ZHIVOJ_SES» — ненулевой код станет успехом молча (политика zz-itogi-priyomki.conf: пусто)"; fi
# B-N-911: с B-N-846 «тревога не доставлена» — коды 5/6/7 (отказ/слепота/годно-без-отметки + недоставка); 3 зарезервирован.
if grep -qwE '5|6|7' <<< "$ZHIVOJ_SES"; then
  f "в SuccessExitStatus внесён код 5/6/7 — недоставленная тревога перестанет быть видна в --failed"
else p "коды 5, 6, 7 (тревога не доставлена) остаются падением"; fi
systemctl is-enabled backup-verify.timer >/dev/null 2>&1 && p "таймер включён" || f "таймер не включён"
systemctl is-active  backup-verify.timer >/dev/null 2>&1 && p "таймер активен"  || f "таймер не активен"
if sudo -n grep -q 'backup-verify.timer' "$WDCONF"; then p "таймер под наблюдением сторожа машины (смерть ловится СНАРУЖИ)"
else f "таймера нет в SERVICES: его смерть не заметит никто"; fi

echo "== 3. Исходы на подставных данных =="
# Заглушки: отправщик молчит в файл, «скачивание» кладёт непустой файл.
cat > "$RAB/alert.sh" <<'EOF'
#!/bin/bash
echo "$*" >> "$(dirname "$0")/alert.log"
EOF
cat > "$RAB/skach-ok.sh" <<'EOF'
#!/bin/bash
# подставной транспорт: sadik-backup.py --skachat <id> <куда>
head -c 4096 /dev/urandom > "$3"; chmod 600 "$3"; echo "скачано (подстава)"
EOF
printf '#!/bin/bash\nexit 1\n' > "$RAB/skach-net.sh"
# B-H-1427: скачивание с меткой «звали» — при нехватке места его звать нельзя
printf '#!/bin/bash\n: > "%s/skach-zvali"; head -c 4096 /dev/zero > "$3"\n' "$RAB" > "$RAB/skach-metka.sh"
printf '#!/bin/bash\nexit 0\n' > "$RAB/priyomka-ok.sh"
printf '#!/bin/bash\nexit 1\n' > "$RAB/priyomka-net.sh"
printf '#!/bin/bash\nexit 2\n' > "$RAB/priyomka-slep.sh"
# B-N-2101: приёмка «неполна по составу» (код 3) — вывод в форме proverka-kopii.sh: заголовок 🟠 и перечень с отступом 4+.
printf '#!/bin/bash\necho "🟠 НЕПОЛНА ПО СОСТАВУ: в разметке реестра есть, на машине нет — 1 из 9 (копия их взять не могла):" >&2\necho "     /net-takogo-puti-stend-b2101" >&2\necho "   Либо путь в реестре лишний." >&2\nexit 3\n' > "$RAB/priyomka-nepoln.sh"
# B-N-2101 r2: отказ по СОСТАВУ (код 1) — слово «НЕПОЛНА», не «НЕГОДНА / не восстановима».
printf '#!/bin/bash\necho "🔴 КОПИЯ НЕПОЛНА: данных, которые есть на машине, в копии нет — 1 путей:" >&2\necho "     /net-takogo-puti-stend-b2101" >&2\nexit 1\n' > "$RAB/priyomka-nepoln1.sh"
mkdir -p "$RAB/a1"; printf '#!/bin/bash\necho "$*" >> "$(dirname "$0")/alert.log"\n' > "$RAB/a1/alert.sh"; chmod 755 "$RAB/a1/alert.sh"
mkdir -p "$RAB/a9"; printf '#!/bin/bash\necho "$*" >> "$(dirname "$0")/alert.log"\n' > "$RAB/a9/alert.sh"; chmod 755 "$RAB/a9/alert.sh"
chmod 755 "$RAB"/*.sh; : > "$RAB/alert.log"
# B-N-1465: сборки поднимаются ДО подставных отметок — запуск не позже completed_at свежей отметки.
sudo -n systemd-run -q --collect --unit="$SB_GOTOVA" /bin/sleep 900 >/dev/null 2>&1
sudo -n systemd-run -q --collect --unit="$SB_IDET" -p Type=oneshot --no-block /bin/sleep 900 >/dev/null 2>&1
SG=$(systemctl show "$SB_GOTOVA" -p ActiveState --value 2>/dev/null); SI=$(systemctl show "$SB_IDET" -p ActiveState --value 2>/dev/null)
if [ "$SG" = active ] && [ "$SI" = activating ]; then p "подставные сборки подняты: пущенная ($SG), идущая ($SI)"
else s "подставные сборки не поднялись: «$SG»/«$SI» — исходы ниже судятся не по ним"; fi

python3 - "$RAB" <<'PY'
import json,sys
from datetime import datetime,timezone,timedelta
r=sys.argv[1]
svezh={"stamp":"proba","name":"proba.tar.gz","size_bytes":4096,"drive_id":"PROBA-ID",
       "completed_at":datetime.now(timezone.utc).isoformat()}
json.dump(svezh,open(f"{r}/svezhaya.json","w"))
staraya=dict(svezh, completed_at=(datetime.now(timezone.utc)-timedelta(hours=99)).isoformat())
json.dump(staraya,open(f"{r}/staraya.json","w"))
# B-N-1466: отметка прошлой ночи — моложе PREDEL_CHASOV (30), старше подставной сборки: судит 1б, а не свежесть
json.dump(dict(svezh, completed_at=(datetime.now(timezone.utc)-timedelta(hours=24)).isoformat()),open(f"{r}/vcherashnyaya.json","w"))
open(f"{r}/bityj.json","w").write("{не json")
json.dump(dict(svezh, size_bytes=10**14),open(f"{r}/ogromnaya.json","w"))  # B-H-1427: 100 ТБ — места заведомо нет
PY

A="AGENT_ALERT_BIN=$RAB/alert.sh"
# Временные каталоги сторожа ДО проб: судим только появившиеся в этом прогоне (чужой остаток — не наш предмет).
KAT_DO=$(ls -d /tmp/priyomka-kopii.* 2>/dev/null | sort)
proba 2 "нет отметки и таймер ни разу не срабатывал -> слепота" \
      "$A" "BACKUP_STATE=$RAB/netu.json" "BACKUP_TIMER=xyzzy-net-takogo.timer"
# B-N-911: коды ниже — договор B-N-846 (сторож :39–41): годность копии НЕ установлена → 2 (с тревогой), а не 1.
proba 2 "нет отметки, а таймер срабатывал -> слепота с тревогой" \
      "$A" "BACKUP_STATE=$RAB/netu.json" "BACKUP_TIMER=sadik-backup.timer"
proba 2 "отметка не разбирается -> слепота" \
      "$A" "BACKUP_STATE=$RAB/bityj.json"
proba_tekst 1 "копия протухла" "копия протухла (−99 ч, штатные пороги) -> отказ" \
      "$A" "BACKUP_STATE=$RAB/staraya.json"
proba_tekst 1 "не дала копии" "сборка пущена позже вчерашней отметки и не идёт -> отказ" \
      "$A" "BACKUP_STATE=$RAB/vcherashnyaya.json"
proba_tekst 2 "НЕ ГОТОВО" "сборка пущена позже вчерашней отметки и ещё идёт (ночная картина) -> не готово кодом 2" \
      "$A" "BACKUP_STATE=$RAB/vcherashnyaya.json" "BACKUP_SERVICE=$SB_IDET"
proba 2 "архив не скачивается -> слепота с тревогой (годность неизвестна)" \
      "$A" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-net.sh"
proba 0 "скачалось и открылось -> зелено" \
      "$A" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-ok.sh" "PRIYOMKA_BIN=$RAB/priyomka-ok.sh"
proba_tekst 1 "копия не восстановима" "приёмка отказала (не по составу) -> отказ «не восстановима»" \
      "$A" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-ok.sh" "PRIYOMKA_BIN=$RAB/priyomka-net.sh"
proba 2 "приёмка не состоялась -> слепота" \
      "$A" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-ok.sh" "PRIYOMKA_BIN=$RAB/priyomka-slep.sh"
proba_tekst 1 "ОТКАЗ: копия неполна" "приёмка: отказ по составу -> код 1 «неполна», не «не восстановима»" \
      "AGENT_ALERT_BIN=$RAB/a1/alert.sh" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-ok.sh" "PRIYOMKA_BIN=$RAB/priyomka-nepoln1.sh"
if grep -qF 'копия sadik НЕПОЛНА' "$RAB/a1/alert.log" 2>/dev/null && ! grep -qiF 'негодна' "$RAB/a1/alert.log"; then p "тревога отказа по составу — «НЕПОЛНА», не «НЕГОДНА»"
else f "тревога отказа по составу: «$(head -c 300 "$RAB/a1/alert.log" 2>/dev/null)»"; fi
# B-N-2101: путь из реестра, которого нет на машине, — код 9 «неполна по составу», тревога «ВОССТАНОВИМА», не «НЕГОДНА / не восстановима».
proba_tekst 9 "НЕПОЛНА ПО СОСТАВУ: копия восстановима" "приёмка: неполна по составу -> код 9, не «не восстановима»" \
      "AGENT_ALERT_BIN=$RAB/a9/alert.sh" "BACKUP_STATE=$RAB/svezhaya.json" "BACKUP_BIN=$RAB/skach-ok.sh" "PRIYOMKA_BIN=$RAB/priyomka-nepoln.sh"
if grep -qF 'ВОССТАНОВИМА, но НЕПОЛНА ПО СОСТАВУ' "$RAB/a9/alert.log" 2>/dev/null && grep -qF 'net-takogo-puti-stend-b2101' "$RAB/a9/alert.log" \
   && ! grep -qiF 'негодна' "$RAB/a9/alert.log"; then p "тревога «неполна по составу» называет путь и не говорит «НЕГОДНА»"
else f "тревога «неполна по составу»: «$(head -c 300 "$RAB/a9/alert.log" 2>/dev/null)»"; fi
# B-H-1427: место проверяется ДО скачивания; не хватает — код 2 с тревогой, ни байта не качаем.
proba_tekst 2 "ОТКАЗ ПО МЕСТУ" "места не хватает (отметка 100 ТБ) -> отказ кодом 2 до скачивания" \
      "$A" "BACKUP_STATE=$RAB/ogromnaya.json" "BACKUP_BIN=$RAB/skach-metka.sh" "PRIYOMKA_BIN=$RAB/priyomka-ok.sh"
[ -e "$RAB/skach-zvali" ] && f "при нехватке места скачивание ЗВАЛИ — корень зальёт" || p "при нехватке места скачивание не звали (0 Б)"
# B-N-1435 (3) (02.10.2026, Аврора; C2 Зари B-H-1427): сторож выбирает формулу места по устройству приёмки — метка <<'PYPOTOK':
#   потоковая S + max(S/20, 1 ГБ) + 5 % ФС, прежняя S + 1,5·S + 5 %. S берётся от ЖИВОГО df /tmp: S = (свободно − 5 % объёма)/2 —
#   потоковой хватает, прежней не хватает при ЛЮБОМ свободном месте. Зашитое 27,4 ГБ делало бы исход функцией диска (ниже ~41 ГБ
#   свободных — ложно красная потоковая, выше ~81 ГБ — ложно зелёная прежняя). S < 2 ГБ ⇒ обе пробы — слепота.
#   ⚠️ НЕ ЛОВИТ: ветку «TMPDIR на другой ФС, чем /tmp» (на sadik обе на корне); верность самих долей (1,5 и 1/20) — их довод замером у Зари.
printf '#!/bin/bash\n# <<'"'"'PYPOTOK'"'"' — заглушка потоковой приёмки: сторож выбирает формулу места по этой метке\nexit 0\n' > "$RAB/priyomka-potok.sh"
chmod 755 "$RAB/priyomka-potok.sh"
read -r SVOB OBEM < <(df -P -B1 /tmp 2>/dev/null | awk 'NR==2{print $4, $2}')
S_MESTO=0; [[ "${SVOB:-}" =~ ^[0-9]+$ && "${OBEM:-}" =~ ^[0-9]+$ ]] && S_MESTO=$(( (SVOB - OBEM / 20) / 2 ))
if [ "$S_MESTO" -ge 2000000000 ] && grep -qF "<<'PYPOTOK'" "$RAB/priyomka-potok.sh"; then
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d['size_bytes']=int(sys.argv[2]); json.dump(d,open(sys.argv[3],'w'))" \
    "$RAB/svezhaya.json" "$S_MESTO" "$RAB/mesto-s.json"
  echo "  (место на /tmp: свободно $SVOB Б, объём $OBEM Б ⇒ S = $S_MESTO Б)"
  proba_tekst 0 "потоковая проверка S/20" "потоковая приёмка × S -> качает (формула S/20)" \
      "$A" "BACKUP_STATE=$RAB/mesto-s.json" "BACKUP_BIN=$RAB/skach-metka.sh" "PRIYOMKA_BIN=$RAB/priyomka-potok.sh"
  proba_tekst 2 "ОТКАЗ ПО МЕСТУ" "прежняя приёмка × тот же S -> отказ по месту (формула 1,5·S)" \
      "$A" "BACKUP_STATE=$RAB/mesto-s.json" "BACKUP_BIN=$RAB/skach-metka.sh" "PRIYOMKA_BIN=$RAB/priyomka-ok.sh"
else
  s "потоковая приёмка × S -> качает: S не установлен (свободно «${SVOB:-}», объём «${OBEM:-}», S=$S_MESTO; или нет метки в заглушке)"
  s "прежняя приёмка × S -> отказ по месту: то же"
fi
proba_tekst 5 "копия протухла" "тревога не доставлена -> код 5 (отказ + недоставка), падение, а не молчание" \
      "AGENT_ALERT_BIN=/bin/false" "BACKUP_STATE=$RAB/staraya.json"

echo "== 4. Побочное =="
n=$(grep -c . "$RAB/alert.log")
[ "$n" -gt 0 ] && p "тревоги уходили в заглушку, не человеку (строк: $n)" || f "заглушка пуста — проверить, куда шли тревоги"
KAT_NOVYE=$(comm -13 <(printf '%s\n' "$KAT_DO") <(ls -d /tmp/priyomka-kopii.* 2>/dev/null | sort) | grep -c .)
[ "$KAT_NOVYE" = "0" ] && p "временные каталоги сторожа этого прогона убраны" || f "остались временные каталоги сторожа этого прогона: $KAT_NOVYE"
OTM_POSLE=$(otm_summa "$BOEVAYA_OTMETKA"); OTM_POSLE=${OTM_POSLE:-net}
[ "$OTM_DO" = "$OTM_POSLE" ] && p "боевая отметка приёмки $BOEVAYA_OTMETKA не тронута (сумма до = после)" \
  || f "БОЕВАЯ ОТМЕТКА ПРИЁМКИ $BOEVAYA_OTMETKA ТРОНУТА СТЕНДОМ: ${OTM_DO:0:16} → ${OTM_POSLE:0:16} — восстановить по журналу backup-verify"
sudo -n test -s "$RAB/proverena.json" && p "отметка легла в ПОДМЕНЁННУЮ ($RAB/proverena.json) — подмена дошла до сторожа" \
  || f "в подменённой отметке следа нет — подмена до сторожа не дошла или проба «зелено» не писала"
sudo -n test -r /var/lib/sadik-backup/last.json && p "боевая отметка на месте (стенд её не трогал)" || s "боевой отметки нет — стенд её не создаёт"

echo
vsego=$((ok+fail+slep))
echo "ИТОГ: ok=$ok fail=$fail слепота=$slep | проверок $vsego из $ZHDYOM_PROVEROK"
if [ "$vsego" -ne "$ZHDYOM_PROVEROK" ]; then
  echo "🔴 СЛЕПОТА: часть проверок не состоялась (ждали $ZHDYOM_PROVEROK) — стенд урезан"; exit 2; fi
[ "$slep" -gt 0 ] && exit 2
[ "$fail" -gt 0 ] && exit 1
exit 0
