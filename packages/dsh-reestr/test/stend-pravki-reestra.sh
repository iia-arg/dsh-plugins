#!/usr/bin/env bash
# stend-pravki-reestra.sh — приёмка подкоманды `agent-plugins pravka`.
#
# ЗАЧЕМ. Боевой /etc/agent-registry/plugins.yaml был сломан правкой ТРИЖДЫ
# за трое суток: отступ списка, приклеенное продолжение скаляра, чужой режим
# доступа. Запись «собирай во временном файле, проверяй, потом ставь» лежала
# в процедуре и все три раза не сработала — защищает не запись, а проба,
# встроенная в действие. Подкоманда и есть эта проба; стенд проверяет её.
#
# ЧТО ПРОВЕРЯЕТСЯ: форма ответа во всех исходах (0 сошлось, 1 отказ, 2 слепота,
# 3 неверный вызов), перенос режима и владельца, копия до правки, откат при
# несошедшейся приёмке после установки.
#
# 🔴 ГРАНИЦЫ ВОЗДЕЙСТВИЯ — что стенд НЕ трогает:
#   * боевой реестр: всё идёт на подставном файле во временном каталоге, а
#     неприкосновенность боевого доказывается его sha256 до и после прогона;
#   * машину: ни служб, ни юнитов, ни сети. Человеку не пишется ничего;
#   * сам инструмент: порча инструмента делается на ЕГО КОПИИ в том же
#     временном каталоге, установленный файл не трогается.
#
# 🔴 ГРАНИЦЫ ОХВАТА — о чём стенд молчит:
#   * он НЕ проверяет остальные подкоманды (list/check/verify/diff) — только
#     pravka. Зелёный стенд не означает, что инструмент цел целиком;
#   * он НЕ проверяет, верно ли записанное в реестре. Это вопрос verify, и
#     pravka на него не отвечает по устройству;
#   * подставной реестр здесь МАЛЕНЬКИЙ (три записи) и без комментариев.
#     Поведение на боевом файле в 228 КБ с комментариями отсюда не следует —
#     оно проверено отдельно, установкой на боевой и сверкой sha256;
#   * владелец переносится, но под непривилегированной рукой uid и gid у
#     старого и нового файла совпадают и так. Стенд видит лишь, что поле не
#     ИСПОРТИЛОСЬ; что перенос работает при РАЗНЫХ владельцах, отсюда не следует.
#     Это проверяется только рукой root, и здесь не проверяется;
#   * гонки не проверяются вовсе: если новую редакцию подменят между проверкой
#     и установкой, стенд об этом не скажет. Инструмент ловит такой случай
#     сверкой sha256 после установки — но именно на подмене файла-источника
#     это не воспроизводилось.
#
# КОДЫ: 0 всё сошлось, 1 расхождение, 2 стенд не смог проверить (слепота).
set -uo pipefail
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
export LC_ALL=C.UTF-8

INSTR="${PRAVKA_INSTRUMENT:-/usr/local/bin/agent-plugins}"
BOEVOJ="/etc/agent-registry/plugins.yaml"

ok=0; fail=0; slepota=0
say_ok()   { ok=$((ok+1));   printf '  ok    %s\n' "$1"; }
say_fail() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
say_slep() { slepota=$((slepota+1)); printf '  СЛЕПОТА %s\n' "$1"; }

[ -x "$INSTR" ] || { echo "СЛЕПОТА: инструмента нет или он не исполняем: $INSTR"; exit 2; }

BOEVOJ_DO=""
if [ -r "$BOEVOJ" ]; then BOEVOJ_DO=$(sha256sum "$BOEVOJ" | cut -c1-16); fi

RAB=$(mktemp -d /tmp/stend-pravki.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'chmod -R u+rwX "$RAB" 2>/dev/null; rm -rf "$RAB"' EXIT

R="$RAB/reestr.yaml"
export PLUGINS_REGISTRY="$R"
# B-N-985: копия до правки — в <корень страховок>/<пункт>/ (B-N-898); корень подставной, боевой /var/backups/montazh не трогается
export AGENT_PLUGINS_STRAHOVKI="$RAB/montazh"

cel() {   # вернуть подставной реестр в исходное состояние
  printf 'plugins:\n  - id: alpha\n    version: "1"\n  - id: beta\n    version: "2"\nservices:\n  - id: gamma\n    version: "3"\n' > "$R"
}
sha() { sha256sum "$1" | cut -c1-16; }

# прогон: имя, ожидаемый код, аргументы...
progon() {
  local imya="$1" zhdyom="$2"; shift 2
  local vyvod kod
  # B-N-898/B-N-985: установка требует --punkt и --osnova (сумма реестра ДО установки); у вызова, где их нет, — дописываем.
  case " $* " in *" --ustanovit "*) case " $* " in *" --punkt "*) ;; *) set -- "$@" --punkt STEND --osnova "$(sha "$PLUGINS_REGISTRY")" ;; esac ;; esac
  vyvod=$("$INSTR" pravka "$@" 2>&1); kod=$?
  if [ "$kod" = "$zhdyom" ]; then
    say_ok "$imya: код $kod"
  else
    say_fail "$imya: код $kod, ждали $zhdyom"
    printf '        сырьё: %s\n' "$(printf '%s' "$vyvod" | grep -vE 'ВНИМАНИЕ: реестр взят|это НЕ боевой путь' | head -2 | tr '\n' ' ')"
  fi
  PROGON_VYVOD="$vyvod"
}

echo "== приёмка agent-plugins pravka =="
echo "инструмент: $INSTR"
echo "подставной реестр: $R"
echo

echo "-- сухой прогон ничего не ставит --"
cel; cp "$R" "$RAB/etalon.yaml"
printf 'plugins:\n  - id: alpha\n    version: "1"\n  - id: beta\n    version: "2"\nservices:\n  - id: gamma\n    version: "3"\n  - id: delta\n    version: "4"\n' > "$RAB/novaya.yaml"
progon "сухой прогон" 0 "$RAB/novaya.yaml"
if cmp -s "$R" "$RAB/etalon.yaml"; then say_ok "сухой прогон: реестр не тронут"
else say_fail "сухой прогон: реестр ИЗМЕНЁН, а не должен"; fi
case "$PROGON_VYVOD" in *"Ничего не установлено"*) say_ok "сухой прогон: сказано, что не установлено";;
  *) say_fail "сухой прогон: не сказано, что ничего не установлено";; esac

echo "-- установка --"
progon "установка" 0 "$RAB/novaya.yaml" --ustanovit
if cmp -s "$R" "$RAB/novaya.yaml"; then say_ok "установка: реестр побайтно равен проверенной редакции"
else say_fail "установка: реестр НЕ равен новой редакции побайтно"; fi
n=$(python3 -c "import yaml,sys;d=yaml.safe_load(open('$R'));print(sum(len(v) for v in d.values()))" 2>/dev/null)
if [ "$n" = 4 ]; then say_ok "установка: записей стало 4"
else say_fail "установка: записей $n, ждали 4"; fi
kop=$(ls "$RAB"/montazh/STEND/reestr.yaml.bak-pre-pravka-* 2>/dev/null | head -1)
if [ -n "$kop" ] && cmp -s "$kop" "$RAB/etalon.yaml"; then say_ok "установка: копия до правки побайтно равна прежнему реестру"
else say_fail "установка: копии до правки нет или она не равна прежнему (${kop:-нет})"; fi
case "$PROGON_VYVOD" in *"проверено отдельным чтением"*) say_ok "установка: приёмка сделана отдельным чтением";;
  *) say_fail "установка: нет следа отдельного чтения после установки";; esac

echo "-- режим со СТАРОГО файла, а не с новой редакции --"
cel; chmod 0640 "$R"; chmod 0666 "$RAB/novaya.yaml"
vlad_do=$(stat -c '%u:%g' "$R")
progon "перенос режима" 0 "$RAB/novaya.yaml" --ustanovit
rezhim=$(stat -c '%a' "$R"); vlad=$(stat -c '%u:%g' "$R")
if [ "$rezhim" = 640 ]; then say_ok "режим остался 640, хотя у новой редакции 666"
else say_fail "режим стал $rezhim, ждали 640"; fi
if [ "$vlad" = "$vlad_do" ]; then say_ok "владелец не изменился ($vlad)"
else say_fail "владелец стал $vlad, был $vlad_do"; fi
chmod 0644 "$RAB/novaya.yaml"

echo "-- отказы: форма новой редакции --"
cel; sha_do=$(sha "$R")
printf 'plugins:\n  - id: a\n   version: bitaya\n' > "$RAB/bitaya.yaml"
progon "новая не разбирается" 1 "$RAB/bitaya.yaml" --ustanovit
# Состав тот же, что у текущего (3 записи) — нарочно: иначе повтор ключа
# отказал бы ЗАОДНО по убыли, и снятие проверки повторов осталось бы
# незамеченным. Проверка должна отличать свою причину от соседней.
printf 'plugins:\n  - id: alpha\n    version: "1"\n    version: "2"\n  - id: beta\n    version: "2"\nservices:\n  - id: gamma\n    version: "3"\n' > "$RAB/dubl.yaml"
progon "повторённый ключ" 1 "$RAB/dubl.yaml" --ustanovit
case "$PROGON_VYVOD" in *"строка 3 и строка 4"*) say_ok "повтор назван строками, а не общими словами";;
  *) say_fail "повтор не назван строками";; esac
: > "$RAB/pusto.yaml"
progon "пустая редакция" 1 "$RAB/pusto.yaml" --ustanovit
printf 'plugins: []\nservices: []\n' > "$RAB/nol.yaml"
progon "ноль записей" 1 "$RAB/nol.yaml" --ustanovit
if [ "$(sha "$R")" = "$sha_do" ]; then say_ok "после четырёх отказов реестр не тронут"
else say_fail "реестр изменился, хотя все четыре вызова отказали"; fi

echo "-- отказы: состав --"
printf 'plugins:\n  - id: alpha\n    version: "1"\n' > "$RAB/bez-razdela.yaml"
progon "пропал корневой раздел" 1 "$RAB/bez-razdela.yaml" --ustanovit
printf 'plugins:\n  - id: alpha\n    version: "1"\nservices:\n  - id: gamma\n    version: "3"\n' > "$RAB/ubyl.yaml"
progon "убыль записи без объявления" 1 "$RAB/ubyl.yaml" --ustanovit
case "$PROGON_VYVOD" in *"− beta"*) say_ok "убывшая запись названа поимённо (beta)";;
  *) say_fail "убывшая запись не названа поимённо";; esac
progon "убыль объявлена — проходит" 0 "$RAB/ubyl.yaml" --ustanovit --razreshit-ubyl

echo "-- слепота отделена от отказа --"
cel
progon "новой редакции нет по пути" 2 "$RAB/net-takogo.yaml" --ustanovit
printf 'plugins:\n  - id: a\n   sloman\n' > "$R"
sha_sloman=$(sha "$R")
progon "текущий сломан, молча не ставим" 2 "$RAB/novaya.yaml" --ustanovit
if [ "$(sha "$R")" = "$sha_sloman" ]; then say_ok "сломанный реестр не тронут без объявления"
else say_fail "сломанный реестр изменён без --tekushchij-sloman"; fi
progon "сломанный чинится по объявлению" 0 "$RAB/novaya.yaml" --ustanovit --tekushchij-sloman
python3 -c "import yaml;yaml.safe_load(open('$R'))" 2>/dev/null && say_ok "после починки реестр разбирается" || say_fail "после починки реестр не разбирается"

echo "-- неверный вызов --"
cel
progon "тот же путь, что у реестра" 3 "$R" --ustanovit
progon "неизвестный ключ" 3 "$RAB/novaya.yaml" --ustanovit-vsyo
progon "без аргумента" 3
# B-N-985: сверка основы — без --osnova отказ 3, с чужой основой отказ 1; реестр цел в обоих
cel; printf 'plugins:\n  - id: alpha\n    version: "1"\n  - id: beta\n    version: "2"\nservices:\n  - id: gamma\n    version: "3"\n  - id: delta\n    version: "4"\n' > "$RAB/novaya.yaml"; sha_do=$(sha "$R")
progon "установка без --osnova" 3 "$RAB/novaya.yaml" --ustanovit --punkt STEND
if [ "$(sha "$R")" = "$sha_do" ]; then say_ok "без --osnova: реестр не тронут"
else say_fail "без --osnova: реестр изменился"; fi
# реестр — заново: если прошлая проба всё же поставила редакцию, «чужая основа» отказала бы по «побайтно равна», а не по основе
cel; sha_do=$(sha "$R")
progon "чужая основа" 1 "$RAB/novaya.yaml" --ustanovit --punkt STEND --osnova 0000000000000000
case "$PROGON_VYVOD" in *"реестр ушёл от основы кандидата"*) say_ok "чужая основа: отказ называет основу";; *) say_fail "чужая основа: отказ не по основе";; esac
if [ "$(sha "$R")" = "$sha_do" ]; then say_ok "чужая основа: реестр не тронут"
else say_fail "чужая основа: реестр изменился"; fi

echo "-- нет прав: установка не начинается --"
mkdir -p "$RAB/zakryt"; cp "$RAB/etalon.yaml" "$RAB/zakryt/r.yaml"; chmod 500 "$RAB/zakryt"
if [ "$(id -u)" = 0 ]; then
  # Непроверяемо ПО УСТРОЙСТВУ: root пишет в каталог 500, отказа не воспроизвести.
  # Замерено 25.08.2026: под root оба случая давали FAIL на ИСПРАВНОМ инструменте.
  say_slep "нет права записи: рукой root отказ не воспроизвести"
  say_slep "нет права записи (файл не тронут): рукой root отказ не воспроизвести"
else
  vyvod=$(PLUGINS_REGISTRY="$RAB/zakryt/r.yaml" "$INSTR" pravka "$RAB/novaya.yaml" --ustanovit --punkt STEND --osnova "$(sha "$RAB/zakryt/r.yaml")" 2>&1); kod=$?
  if [ "$kod" = 2 ]; then say_ok "нет права записи: код 2 (слепота), а не отказ и не успех"
  else say_fail "нет права записи: код $kod, ждали 2"; fi
  if cmp -s "$RAB/zakryt/r.yaml" "$RAB/etalon.yaml"; then say_ok "нет права записи: файл не тронут"
  else say_fail "нет права записи: файл всё же изменён"; fi
fi
chmod 700 "$RAB/zakryt"

echo "-- приёмка ПОСЛЕ установки ловит подмену: порча самого инструмента --"
cel; sha_cel=$(sha "$R")
cp "$INSTR" "$RAB/porchenyj"
python3 - "$RAB/porchenyj" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="            shutil.copyfileobj(src, dst)"
sys.exit(3) if s.count(old)!=1 else None
open(p,'w',encoding='utf-8').write(s.replace(old,"            dst.write(src.read()[:40])"))
PY
if [ $? -ne 0 ]; then
  say_slep "порча инструмента не внесена — якорь в коде не найден, ветку отката не проверяли"
else
  if cmp -s "$INSTR" "$RAB/porchenyj"; then
    say_slep "порча инструмента не изменила файл — ветку отката не проверяли"
  else
    say_ok "факт порчи инструмента подтверждён (копия отличается от установленного)"
    vyvod=$("$RAB/porchenyj" pravka "$RAB/novaya.yaml" --ustanovit --punkt STEND --osnova "$(sha "$R")" 2>&1); kod=$?
    if [ "$kod" = 1 ]; then say_ok "испорченный инструмент отказал кодом 1"
    else say_fail "испорченный инструмент вернул код $kod, ждали 1"; fi
    case "$vyvod" in *"не совпал с проверенным побайтно"*) say_ok "названа причина: установленный не совпал с проверенным";;
      *) say_fail "причина несовпадения не названа";; esac
    if [ "$(sha "$R")" = "$sha_cel" ]; then say_ok "реестр возвращён из копии побайтно"
    else say_fail "реестр остался испорченным — откат не сработал"; fi
  fi
fi

echo "-- подмена пути не молчит --"
cel
vyvod=$("$INSTR" pravka "$RAB/novaya.yaml" 2>&1 >/dev/null)
case "$vyvod" in *"PLUGINS_REGISTRY"*) say_ok "о подставном реестре сказано в stderr";;
  *) say_fail "подмена пути реестра прошла молча";; esac

# ── Конфликт разметки копии: один путь и «класть», и «не класть» ────────────
# Проверка живёт в pravka как ПРОФИЛАКТИКА: спорная разметка не должна попасть
# в реестр вовсе. Замер 25.08.2026, из-за которого она там: подставной реестр
# с workspace/dorabotki в обоих списках дал у измерителя 17,2 МБ -> 659,6 МБ
# при коде 0, а сторож покрытия к нему слеп по устройству.
# Здесь проверяются ОБЕ стороны: что спорное отвергается и что бесспорное
# проходит. Одна первая половина превратила бы лечение в глухоту.
cat > "$RAB/s-konfliktom.yaml" <<'YML'
agenty:
  - imya: probnyj
    namerenie:
      kopiya:
        klast:
          - workspace/dorabotki
        ne_klast_prichina:
          workspace/dorabotki: "подставной конфликт"
YML
cat > "$RAB/bez-konflikta.yaml" <<'YML'
agenty:
  - imya: probnyj
    namerenie:
      kopiya:
        klast:
          - app/package-lock.json
        ne_klast_prichina:
          app: "вложенность — это законная разметка, а не спор"
YML
cp "$RAB/bez-konflikta.yaml" "$RAB/kak-reestr-kopii.yaml"

vyvod=$(PLUGINS_REGISTRY="$RAB/kak-reestr-kopii.yaml" "$INSTR" pravka "$RAB/s-konfliktom.yaml" 2>&1); kod=$?
if [ "$kod" -eq 1 ] && printf '%s' "$vyvod" | grep -q 'И «класть», И «не класть»'; then
  say_ok "конфликт разметки отвергнут (код 1)"
else
  say_fail "конфликт разметки НЕ отвергнут: код=$kod"
fi
if printf '%s' "$vyvod" | grep -q 'workspace/dorabotki'; then
  say_ok "спорный путь назван поимённо"
else
  say_fail "спорный путь не назван — чинить нечего"
fi
if printf '%s' "$vyvod" | grep -q 'kopiya'; then
  say_ok "узел с конфликтом назван путём в дереве"
else
  say_fail "узел не назван — при двух агентах непонятно, чей конфликт"
fi

# Вложенность klast внутри ne_klast конфликтом НЕ является и обязана пройти.
# 🔴 Редакция обязана ОТЛИЧАТЬСЯ от реестра: с 31.08.2026 pravka отвергает
# побайтно равную (так выглядит несостоявшаяся подготовка). Раньше фикстура
# подавала копию самой себя — то есть проверка вложенности мерила заодно и то,
# что тождественная редакция принимается. Отличие — пустая строка в конце.
printf '\n' >> "$RAB/bez-konflikta.yaml"
vyvod=$(PLUGINS_REGISTRY="$RAB/kak-reestr-kopii.yaml" "$INSTR" pravka "$RAB/bez-konflikta.yaml" --razreshit-ubyl 2>&1); kod=$?
if [ "$kod" -eq 0 ]; then
  say_ok "законная вложенность конфликтом не считается"
else
  say_fail "вложенность принята за конфликт: код=$kod — лечение съело нужное"
fi

# 🔴 Тождественная редакция — ОТКАЗ (31.08.2026): так выглядит несостоявшаяся
# подготовка, когда сборка редакции упала, а установка пошла следом через `;`
# вместо `&&`. Лечение в ИНСТРУМЕНТЕ, а не во внимательности.
cp "$RAB/kak-reestr-kopii.yaml" "$RAB/tozhdestvennaya.yaml"
vyvod=$(PLUGINS_REGISTRY="$RAB/kak-reestr-kopii.yaml" "$INSTR" pravka "$RAB/tozhdestvennaya.yaml" 2>&1); kod=$?
if [ "$kod" -eq 1 ] && printf '%s' "$vyvod" | grep -q 'ПОБАЙТНО РАВНА'; then
  say_ok "редакция, равная реестру, отвергнута"
else
  say_fail "равная реестру редакция НЕ отвергнута: код=$kod"
fi

# Предмет без узла kopiya (plugins.yaml) проверка обязана не трогать вовсе.
vyvod=$(PLUGINS_REGISTRY="$R" "$INSTR" pravka "$RAB/novaya.yaml" 2>&1); kod=$?
if printf '%s' "$vyvod" | grep -q 'И «класть», И «не класть»'; then
  say_fail "проверка разметки сработала там, где узла kopiya нет"
else
  say_ok "без узла kopiya проверка молчит"
fi

echo
if [ -n "$BOEVOJ_DO" ]; then
  BOEVOJ_POSLE=$(sha256sum "$BOEVOJ" | cut -c1-16)
  if [ "$BOEVOJ_DO" = "$BOEVOJ_POSLE" ]; then say_ok "боевой реестр за весь прогон не тронут ($BOEVOJ_POSLE)"
  else say_fail "🔴 БОЕВОЙ РЕЕСТР ИЗМЕНИЛСЯ: было $BOEVOJ_DO, стало $BOEVOJ_POSLE"; fi
else
  say_slep "боевой реестр не читается этой рукой — его неприкосновенность не проверена"
fi

echo "-- отказ копии не оставляет ложного следа --"
# 🔴 25.08: pravka рукой в группе agent-registry отказывала верно (реестр цел),
# но на диске оставался файл `.bak-pre-pravka-<время>` — copy2 успевает создать
# файл, EPERM даёт уже os.chown. След говорил «здесь была правка» там, где
# правки не было, и говорил это ровно тому, кто разбирает беду.
mkdir -p "$RAB/chuzhoj"; cp "$RAB/etalon.yaml" "$RAB/chuzhoj/r.yaml"
if [ "$(id -u)" = 0 ]; then
  # Тот же класс: файл root:root не «чужой» для root, EPERM не воспроизвести.
  say_slep "чужой владелец: рукой root отказ не воспроизвести"
  say_slep "чужой владелец (лишних файлов нет): рукой root отказ не воспроизвести"
  say_slep "чужой владелец (отказ называет руку): рукой root отказ не воспроизвести"
elif ! sudo -n chown root:root "$RAB/chuzhoj/r.yaml" 2>/dev/null; then
  say_slep "нечем сделать файл чужим (sudo -n chown) — ветка EPERM не проверялась"
else
  do_kopij=$(ls "$RAB/chuzhoj" | wc -l)
  vyvod=$(PLUGINS_REGISTRY="$RAB/chuzhoj/r.yaml" "$INSTR" pravka "$RAB/novaya.yaml" --ustanovit --punkt STEND --osnova "$(sha "$RAB/chuzhoj/r.yaml")" 2>&1); kod=$?
  posle_kopij=$(ls "$RAB/chuzhoj" | wc -l)
  if [ "$kod" != 0 ]; then say_ok "чужой владелец: отказ (код $kod), а не тихая установка"
  else say_fail "чужой владелец: правка прошла, владелец реестра сменился молча"; fi
  if [ "$posle_kopij" = "$do_kopij" ]; then say_ok "после отказа лишних файлов не осталось ($posle_kopij)"
  else say_fail "после отказа в каталоге стало $posle_kopij файлов вместо $do_kopij — ложный след"; fi
  case "$vyvod" in
    *"sudo"*) say_ok "отказ называет, чьей рукой это делается";;
    *) say_fail "отказ не называет выхода: '$(printf '%s' "$vyvod" | tail -1)'";;
  esac
  # 🔴 Границу уборки проверяем СТРУКТУРНО, а не поведением. Поведенческая
  # проверка тут невозможна: инструмент трогает единственный путь, который сам
  # создал секунду назад, и подложить под это имя чужой файл нельзя. Первая
  # редакция такую проверку всё же завела — она была зелёной всегда и не
  # краснела даже на порче, снявшей условие. Проверка, которая не может
  # покраснеть, не отличается от отсутствующей.
  CEL_UBORKI=$(python3 - "$INSTR" <<'PYEOF' 2>/dev/null
import ast, sys
d = ast.parse(open(sys.argv[1], encoding="utf-8").read())
plohie = []
# 🔴 B-N-866 (25.09.2026): ротация страховок (B-H-380, agent-plugins _rotaciya_strahovok)
# удаляет os.path.join(katalog, f) — ЗАКОННО, но только пока стоят ДВЕ охраны. Проверяем
# их СТРУКТУРНО, а не верим имени функции: (1) выбор файлов — fullmatch по форме
# «…bak-pre-pravka-\d{8}-\d{6}»; (2) в том же цикле ДО удаления — `if h not in istoriya:
# continue` (удаляется только редакция, которая есть в git). Снята любая — стенд краснеет.
def ohrana_rotacii(fn):
    txt = ast.unparse(fn)
    forma = r"bak-pre-pravka-\\d{8}-\\d{6}" in txt and ".fullmatch(" in txt
    for cikl in ast.walk(fn):
        if not isinstance(cikl, ast.For):
            continue
        propusk = False
        for st in cikl.body:
            if (isinstance(st, ast.If) and isinstance(st.test, ast.Compare)
                    and any(isinstance(o, ast.NotIn) for o in st.test.ops)
                    and ast.unparse(st.test.comparators[0]) == "istoriya"
                    and any(isinstance(b, ast.Continue) for b in st.body)):
                propusk = True
            # B-N-898 (25.09): кандидаты — уже полные пути, удаление стало os.unlink(f); охраны те же
            if propusk and ("os.path.join(katalog, f)" in ast.unparse(st) or "os.unlink(f)" in ast.unparse(st)) and "unlink" in ast.unparse(st):
                return forma
    return False
rotaciya = {id(u) for fn in ast.walk(d) if isinstance(fn, ast.FunctionDef) and fn.name == "_rotaciya_strahovok"
            and ohrana_rotacii(fn) for u in ast.walk(fn)}
for u in ast.walk(d):
    if isinstance(u, ast.Call) and ast.unparse(u.func).endswith(("os.unlink", "os.remove", "shutil.rmtree")):
        arg = ast.unparse(u.args[0]) if u.args else "?"
        # Три имени — это все временные пути инструмента: копия до правки,
        # временный файл установки и каталог сверки с публикацией. Список
        # имён, а не свойство: переименуют переменную — проверка покраснеет,
        # а не промолчит, и это правильная сторона ошибки.
        if arg in ("kopiya", "vremenno", "workdir"):
            continue
        if arg in ("os.path.join(katalog, f)", "f") and id(u) in rotaciya:
            continue
        plohie.append(arg)
print("|".join(plohie) if plohie else "CHISTO")
PYEOF
)
  if [ -z "$CEL_UBORKI" ]; then say_slep "не разобрать вызовы удаления в $INSTR"
  elif [ "$CEL_UBORKI" = CHISTO ]; then say_ok "удаление зовётся только для своего временного пути и охраняемой ротации (форма + git)"
  else say_fail "инструмент удаляет по чужой цели: $CEL_UBORKI"; fi
  sudo -n rm -f "$RAB/chuzhoj/r.yaml" 2>/dev/null
fi


echo
echo "ok=$ok fail=$fail слепота=$slepota"
if [ "$fail" -gt 0 ]; then echo "РАСХОЖДЕНИЕ"; exit 1; fi
if [ "$slepota" -gt 0 ]; then echo "СЛЕПОТА: часть проверок не состоялась — это не успех"; exit 2; fi
# 🔴 Число ТОЧНОЕ, а не «не меньше». 23.08 такая же канарейка стояла нижней
# границей — и вырезанный раздел проверок её не задел: проверок осталось
# больше порога, стенд сказал «всё сошлось». Нижняя граница отвечает на
# вопрос «много ли проверок», а спрашивать надо «все ли они на месте».
# 47-я — отказ на редакции, побайтно равной реестру (31.08.2026): лечение
# разрыва между упавшей подготовкой и установкой, сделанное в инструменте.
# 48–52-я — сверка основы (B-N-985, 26.09.2026): без --osnova код 3 и реестр цел; чужая основа код 1, отказ по основе, реестр цел.
ZHDYOM_PROVEROK=52
if [ "$ok" -ne "$ZHDYOM_PROVEROK" ]; then
  echo "СЛЕПОТА: проверок $ok, а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
echo "всё сошлось"
