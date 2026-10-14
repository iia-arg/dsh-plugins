#!/bin/bash
# Стенд карты соответствия «секрет на месте -> ветка хранилища».
#
# ЗАЧЕМ. Раздел sekrety_segodnya в реестре агентов восемь суток объявлял себя полным
# перечнем и не имел НИ ОДНОГО читателя среди исполняемых — устаревание никем не ловилось.
# Этот стенд и есть читатель: он сверяет карту с фактом В ОБЕ СТОРОНЫ.
#
# ГРАНИЦЫ — чего стенд НЕ делает:
#   * не ищет секреты по всей файловой системе. Обратная сверка идёт только по КАТАЛОГАМ
#     KATALOGI (каждый — со своей маской) и по путям В ДОМЕ КАЖДОГО АГЕНТА реестра (AGENT_PUTI).
#     Секрет, заведённый в новом месте вне этих списков, стенд не увидит — граница названа;
#     полный обход ФС делается руками тремя срезами. Новое место секретов — строка сюда.
#   * B-N-1493 (03.10, находка Зари, Вениамин): каталог из KATALOGI, которого нет на диске, — СЛЕПОТА с именем
#     (прежде пропускался молча); пути AGENT_PUTI необязательны (у агента может не быть gws).
#   * не проверяет, что значение в файле равно значению в ветке. Это потребовало бы
#     расшифровки всех веток при каждом прогоне; сверка значений — дело приёмки копии.
#   * не судит права файлов: их судит приёмка копии и живость.
#
# ИСХОДЫ: 0 сошлось · 1 расхождение · 2 проверить нечем (слепота).
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
REESTR="${REESTR_AGENTOV:-/etc/agent-registry/agents.yaml}"
HRAN="${HRANILISHCHE:-/etc/agent-secrets}"
# Каталоги обратной сверки «каталог:маска» (маска — образец имени find -name; без «:маска» — *token*, как было до B-N-1493).
# Маска узкая там, где рядом лежат настройки (instance-*.env, *.json канала — не секреты).
KATALOGI="${KATALOGI_SEKRETOV:-/etc/claude-oauth:*token* /etc/dsh-telegram:*.token /etc/agent-alert:*token* /etc/publish-tokens:*.token /etc/fal-klyuchi:* /etc/dsh-klyuchi:* /etc/dsh-gateway/ingress:*.key /etc/omega/gost:*.env /etc/omega:*.env /etc/socseti:*.key /etc/socseti:*.token /etc/socseti:*.env /etc/sajt-chat:*.token /etc/sajt-chat:*.secret}"
# B-N-1493: пути в доме КАЖДОГО агента реестра (namerenie.dom) «подкаталог:маска»; нет каталога — не слепота.
AGENT_PUTI="${AGENT_PUTI_SEKRETOV:-.dsh:.env workspace/.gws:*.json .config/gws:*.json .config/socseti:*.env}"
ok=0; bad=0; slep=0
# B-N-867 (25.09.2026, Заря): карта ПУТЕЙ секретов — во временном файле 600, убирается на выходе. Прежде лежала
# постоянным /tmp/isk-karta.tsv 644 (видна всем; файл от 07.09 пережил прогон) — а под другой учёткой запись в чужой
# файл отказывала молча, и стенд судил по СТАРОЙ карте. mktemp даёт свой файл каждой руке и каждому прогону.
KARTA=$(mktemp /tmp/stend-karta-sekretov.XXXXXX) || { echo "  СЛЕПОТА временный файл карты не заведён"; exit 2; }
trap 'rm -f "$KARTA"' EXIT
t(){ if [ "$2" = "0" ]; then ok=$((ok+1)); echo "  ok   $1"; else bad=$((bad+1)); echo "  FAIL $1${3:+ — $3}"; fi; }
sud(){ slep=$((slep+1)); echo "  СЛЕПОТА $1${2:+ — $2}"; }

echo "СТЕНД карты секретов. предмет: $REESTR | хранилище: $HRAN"

if ! sudo test -r "$REESTR"; then
  sud "реестр не читается" "$REESTR"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; exit 2
fi

# --- разбор карты: mashina.sekrety_segodnya — соответствие «путь: ветка» (B-N-907, 25.09.2026) ---
# 🔴 ВЕТКА — ДАННЫМИ, А НЕ КОММЕНТАРИЕМ. До 31.08 ветка стояла комментарием «# -> ветка»; между 31.08 и 21.09 раздел
# переписали машинно (отступ сменился, комментарии пропали — сериализатор YAML их не хранит), и разбор по «#» стал
# давать пустую карту: стенд ослеп, а карта /tmp от 07.09 это прятала. Значение соответствия сериализатор сохраняет.
# Прежняя форма (список путей без веток) — не слепота: каждый путь называется «ветка не названа» (красное с именами).
# «НЕ: <причина>» — намеренно вне хранилища; причина обязана быть в самом значении (комментарий пропадёт так же).
sudo cat "$REESTR" | python3 -c '
import sys,yaml
razdel=((yaml.safe_load(sys.stdin) or {}).get("mashina") or {}).get("sekrety_segodnya")
if isinstance(razdel, dict):
    for put, vetka in razdel.items(): print(f"{put}\t{vetka if vetka is not None else str()}")
elif isinstance(razdel, list):
    for put in razdel: print(f"{put}\t")
' > "$KARTA" 2>/dev/null

N=$(wc -l < "$KARTA")
if [ "$N" -eq 0 ]; then
  sud "карта пуста — раздел sekrety_segodnya не разобран" "изменилась форма раздела?"
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"; exit 2
fi
echo "  записей в карте: $N"

# --- прямая сверка: файл существует, ветка существует ---
while IFS=$'\t' read -r put vetka; do
  if sudo test -e "$put"; then t "файл на месте: $put" 0
  else t "файл на месте: $put" 1 "в карте есть, на диске НЕТ"; fi
  if [ -z "$vetka" ]; then
    t "ветка названа: $put" 1 "в mashina.sekrety_segodnya нет ветки для пути (форма «путь: ветка»)"
  elif [ "${vetka#НЕ}" != "$vetka" ]; then
    # Намеренно вне хранилища. Законно, но ТОЛЬКО с причиной в самом значении «НЕ: <причина>».
    # Иначе «НЕ» станет способом спрятать настоящую пропажу.
    prichina=$(printf '%s' "${vetka#НЕ}" | sed 's/^[:[:space:]]*//')
    if [ "${#prichina}" -ge 10 ]; then
      t "намеренно вне хранилища, причина названа: $put" 0
    else
      t "намеренно вне хранилища: $put" 1 "причина не названа — 'НЕ' без довода"
    fi
  elif sudo test -f "$HRAN/$vetka.gpg"; then
    t "ветка в хранилище: $vetka" 0
  else
    t "ветка в хранилище: $vetka" 1 "названа в карте, записи нет"
  fi
done < "$KARTA"

# --- обратная сверка: что на дисках, но не в карте ---
propushcheno=0
set -f   # маски — образцы find, а не глоб оболочки
# Каталоги домов агентов — из того же реестра (dom каждой записи).
DOMA=$(sudo cat "$REESTR" | python3 -c 'import sys,yaml; d=yaml.safe_load(sys.stdin) or {}; print(" ".join(sorted({(a.get("namerenie") or {}).get("dom") for a in d.get("agenty") or [] if (a.get("namerenie") or {}).get("dom")})))' 2>/dev/null)
[ -n "$DOMA" ] || sud "обратная сверка домов агентов: список dom из реестра пуст" "AGENT_PUTI не проверены"
SPISOK=""
for e in $KATALOGI; do case "$e" in *:*) SPISOK="$SPISOK $e|obyaz";; *) SPISOK="$SPISOK $e:*token*|obyaz";; esac; done
for dm in $DOMA; do for e in $AGENT_PUTI; do SPISOK="$SPISOK $dm/$e|neobyaz"; done; done
for zap in $SPISOK; do
  vid=${zap##*|}; zap=${zap%|*}; d=${zap%%:*}; maska=${zap#*:}
  if ! sudo test -d "$d"; then
    [ "$vid" = obyaz ] && sud "обратная сверка: каталога $d нет на диске" "убран или переименован — KATALOGI отстал"
    continue
  fi
  naydeno_v_d=0
  while read -r f; do
    [ -z "$f" ] && continue
    naydeno_v_d=$((naydeno_v_d+1))
    case "$f" in *.md|*.bak-*|*.do|*.new) continue;; esac   # B-N-1493: *.env/*.json больше не исключаются — их отбирает маска каталога
    if ! cut -f1 "$KARTA" | grep -qxF "$f"; then
      echo "     не в карте: $f"; propushcheno=$((propushcheno+1))
    fi
  # B-N-1095 (26.09): chat-id — НЕ секрет (решение Забавы), из обратной сверки снят; токены ищутся, как прежде.
  done < <(sudo find "$d" -maxdepth 1 -type f -name "$maska" 2>/dev/null | sort)
  # B-N-1102 (26.09, находка Вениамина): каталог, где КАРТА обещает секреты, а образец поиска не нашёл ни одного файла, — это
  # слепота образца (сменилось имя/права/каталог), а не «секретов вне карты нет». Список «где заведомо есть» — из самой карты.
  obeshchano=$(cut -f1 "$KARTA" | grep -c "^$d/[^/]*$")
  [ "$obeshchano" -gt 0 ] && [ "$naydeno_v_d" -eq 0 ] && sud "обратная сверка слепа в $d: карта обещает $obeshchano, образец поиска нашёл 0" "образец find ослеп?"
done
set +f
t "обратная сверка: секретов вне карты нет (найдено $propushcheno)" "$([ $propushcheno -eq 0 ] && echo 0 || echo 1)" "карта отстала от дисков"

# --- канарейка точного числа ---
ZHDYOM=$((N*2+1))
VSEGO=$((ok+bad))
if [ "$VSEGO" -ne "$ZHDYOM" ]; then
  echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
  sud "канарейка: проверок $VSEGO, а по карте ждали $ZHDYOM (2 на запись + обратная сверка)"
  exit 2
fi
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep (проверок $VSEGO из $ZHDYOM)"
[ $bad -gt 0 ] && exit 1
[ $slep -gt 0 ] && exit 2
exit 0
