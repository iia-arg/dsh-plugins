#!/bin/bash
# Приёмка сторожа покрытия копии и рамки покрытия в реестре.
# Заведён 24.08.2026 Искрой при установке сторожа (автор сторожа — Михалыч).
#
# ЧТО ПРОВЕРЯЕТ: что сторож видит непокрытое, молчит о размеченном, и что у
# него не осталось СВОИХ списков — ни общемашинного, ни корней обхода, ни
# порога по времени. Тексты берутся из УСТАНОВЛЕННЫХ файлов, не из копий.
#
# КОДЫ: 0 сошлось | 1 расхождение | 2 СЛЕПОТА (проверить не удалось)
#
# 🔴 ГРАНИЦЫ.
#  * Живую машину стенд НЕ портит (B-N-1023, 26.09.2026): порча шага 8 кладётся в
#    подставной корень обхода в $VREM, а не в /opt. Прежде — sudo mkdir /opt/…
#    на ~1 с при каждом прогоне (54 за 38 ч); совпав с часовым прогоном службы,
#    он дал бы настоящую тревогу людям. Порча одна за раз, возврат немедленный.
#  * Людям НЕ пишет: отправщик подменяется заглушкой через AGENT_ALERT_BIN.
#    Без этого прогон приёмки означал бы десяток тревог владельцу.
#  * Проверяет РАМКУ и ПОВЕДЕНИЕ, а не то, верна ли сама разметка. «Всё
#    размечено» и «размечено правильно» — разные вопросы; второй решает человек.
#  * Ожидание вместо отказа проверяется только тем, что вызов не висит.
#    Что именно ответит sudo чужой руке, зависит от sudoers, а не от сторожа.
set -u
export LC_ALL=C.UTF-8          # порядок сравнения не должен зависеть от руки

STOROZH=/usr/local/sbin/backup-coverage-watch
CHITATEL=/usr/local/bin/agent-registry
REESTR=/etc/agent-registry/agents.yaml
UNIT=/etc/systemd/system/backup-coverage-watch.service
TIMER=/etc/systemd/system/backup-coverage-watch.timer

VREM=$(mktemp -d /tmp/stend-pokrytiya.XXXXXX)
ZAGLUSHKA="$VREM/alert-zaglushka.sh"
printf '#!/bin/bash\nprintf "%%s\\n" "$1" > "%s/poslednyaya-trevoga.txt"\nexit 0\n' "$VREM" > "$ZAGLUSHKA"
chmod 755 "$ZAGLUSHKA"
# 🔴 ПОДМЕНА СОСТОЯНИЯ ГЛУШЕНИЯ (B-N-944, 26.09.2026). Без неё каждый прогон сторожа
# отсюда писал БОЕВОЙ /var/lib/backup-coverage-watch/otpechatok: чистый прогон его
# удалял, прогон с порчей клал отпечаток ПОРЧИ (последний, F15-obe, оставался лежать
# до часового прогона службы). Стенд гоняет проверка здоровья — 54 раза за 38 ч по
# журналу sudo, — и защита от повтора тревог у живого сторожа не держалась.
# export, а не только в progon: исполняет сторожа и блок «свойства» (exec модуля).
export COVERAGE_SOSTOYANIE="$VREM/otpechatok"
echo "ПОДМЕНА: COVERAGE_SOSTOYANIE=$COVERAGE_SOSTOYANIE — боевое состояние сторожа стенд не трогает"

PORCHA_PUT=""
uborka() {
  rm -rf "$VREM"          # порча шага 8 живёт внутри $VREM — уходит вместе с ним
}
trap uborka EXIT

OK=0; FAIL=0; SLEP=0
ok()   { printf '  ok    %s\n' "$1"; OK=$((OK+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
slep() { printf '  СЛЕПОТА %s\n' "$1"; SLEP=$((SLEP+1)); }

# Прогон сторожа с заглушённой отправкой. Печатает строки тревоги в stdout,
# код возврата кладёт в KOD.
# 🔴 Вывод кладётся в ФАЙЛ, а KOD выставляется в текущей оболочке.
# Первая редакция звалась как $(progon) — то есть в ПОДоболочке, и KOD,
# выставленный внутри, наружу не доезжал вовсе: снаружи читалось значение от
# прошлого вызова. Проверка «размеченное молчит» получила чужой код 5 и честно
# сказала СЛЕПОТА — правдоподобный неверный вердикт на исправном предмете.
# Тот же класс, что «код возврата после конвейера меряет не ту команду».
VYVOD_FAJL=""
progon() {   # progon [путь-к-подставному-реестру]; результат в $VYVOD_FAJL, код в $KOD
  local reestr="${1:-}"
  VYVOD_FAJL="$VREM/progon.txt"
  if [ -n "$reestr" ]; then
    AGENTS_REGISTRY="$reestr" AGENT_ALERT_BIN="$ZAGLUSHKA" "$STOROZH" > "$VYVOD_FAJL" 2>&1
  else
    AGENT_ALERT_BIN="$ZAGLUSHKA" "$STOROZH" > "$VYVOD_FAJL" 2>&1
  fi
  KOD=$?
}

echo "── 1. У сторожа не осталось своих списков (вне пояснения в шапке)"
# 🔴 Тело = файл БЕЗ модульной строки документации. Первая редакция резала
# sed'ом по первой строке из трёх кавычек — а это ОТКРЫВАЮЩАЯ строка, и в
# «тело» попадала вся шапка вместе с пояснением, где эти имена названы нарочно.
# Стенд краснел на исправном сторо́же. Отделяет python, он знает про синтаксис.
TELO=$(python3 - "$STOROZH" <<'PYEOF' 2>/dev/null
import ast, sys
src = open(sys.argv[1], encoding="utf-8").read()
d = ast.parse(src)
telo = ast.get_docstring(d)
print(src.replace(telo, "") if telo else src)
PYEOF
)
if [ -z "$TELO" ]; then
  slep "не удалось отделить тело от шапки в $STOROZH"
else
  for obrazec in SYSTEM_SKIP SCAN_OPT VARLIB_MASK AGE_DAYS_ROOMS; do
    n=$(printf '%s' "$TELO" | command grep -c "$obrazec")
    if [ "$n" = 0 ]; then ok "в теле нет $obrazec"; else bad "в теле снова завёлся $obrazec ($n вхождений)"; fi
  done
  n=$(printf '%s' "$TELO" | command grep -c 'pokrytie')
  if [ "$n" -ge 1 ]; then ok "тело читает рамку из реестра (pokrytie, $n)"; else bad "тело не зовёт pokrytie — откуда тогда рамка?"; fi
  n=$(printf '%s' "$TELO" | command grep -c 'sudo", "-n"')
  if [ "$n" -ge 1 ]; then ok "обход идёт через sudo -n (отказ, а не ожидание пароля)"; else bad "sudo без -n: чужая рука будет ЖДАТЬ пароль, а не получит отказ"; fi
fi

echo "── 2. Читатель отдаёт рамку целиком"
KLYUCHI=$("$CHITATEL" pokrytie --json 2>/dev/null | python3 -c 'import json,sys; print(" ".join(sorted(json.load(sys.stdin))))' 2>/dev/null)
if [ -z "$KLYUCHI" ]; then
  slep "pokrytie --json не разобрался"
else
  # 🔴 РЕШЕНИЕ 28.08.2026: перечень ниже ОСТАВЛЕН РУКАМИ намеренно, это не забывчивость.
  # В тот же день у стенда цельности моста рукописная фикстура была заменена сборкой
  # ИЗ ПРЕДМЕТА — там перечень КОПИРОВАЛ источник и расходился с ним молча.
  # Здесь случай обратный: перечень задаёт ТРЕБОВАНИЕ к источнику. Возьми его из того
  # же читателя, которого проверяем, — выйдет тавтология «читатель отдаёт то, что отдаёт»,
  # и проверка перестанет проверять.
  # Цена названа: добавят в реестр новый раздел — он не попадёт в ожидание и останется
  # непокрытым молча. Разделителя между «забыли дописать» и «раздела и не должно быть»
  # у нас нет, поэтому механизма тут не будет (тот же случай, что долг 42).
  for k in doma komnaty korni_obhoda obshchee obshchee_ne_v_kopiyu; do
    case " $KLYUCHI " in *" $k "*) ok "рамка содержит $k";; *) bad "в рамке нет раздела $k";; esac
  done
fi

echo "── 3. Пустой или отсутствующий раздел рамки = ОТКАЗ, а не пустота"
for razdel in korni_obhoda obshchee obshchee_ne_v_kopiyu; do
  python3 - "$REESTR" "$VREM/bez-$razdel.yaml" "$razdel" <<'PY' 2>/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
d.pop(sys.argv[3], None)
yaml.safe_dump(d, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
PY
  if [ ! -s "$VREM/bez-$razdel.yaml" ]; then slep "не собрался подставной реестр без $razdel"; continue; fi
  progon "$VREM/bez-$razdel.yaml"
  if [ "$KOD" = 3 ]; then ok "нет $razdel -> код 3"; else bad "нет $razdel -> код $KOD, а обязан быть 3"; fi
done

echo "── 4. Реестр не читается = ОТКАЗ 3, а не работа по умолчанию"
progon "$VREM/net-takogo-fajla.yaml"
if [ "$KOD" = 3 ]; then ok "реестра нет -> код 3"; else bad "реестра нет -> код $KOD, а обязан быть 3"; fi

echo "── 5. Корень без маски пуст = проверка НЕ состоялась (код 5)"
mkdir -p "$VREM/pustoj-koren"
python3 - "$REESTR" "$VREM/pustoj-koren.yaml" "$VREM/pustoj-koren" <<'PY' 2>/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
d["korni_obhoda"] = [{"put": sys.argv[3], "maski": [], "zachem": "подставной пустой корень"}]
yaml.safe_dump(d, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
PY
progon "$VREM/pustoj-koren.yaml"
if [ "$KOD" = 5 ]; then ok "пустой корень без маски -> код 5"; else bad "пустой корень -> код $KOD, а обязан быть 5"; fi

echo "── 6. Размеченное молчит: контролируемый дом; живые находки — данные"
progon
if [ "$KOD" != 0 ] && [ "$KOD" != 1 ]; then
  slep "сторож отказал кодом $KOD — проверять молчание не на чем"
else
  # Полнота живой разметки не является константой стенда. Как и в уровне1,
  # её нарушения судит боевой сторож; здесь проверяется исправность механизма.
  n=$(command grep -cF '• iskra/' "$VYVOD_FAJL" || true)
  echo "  справка: живых непокрытых комнат координатора $n — не вердикт приёмки"
  command grep -F '• iskra/' "$VYVOD_FAJL" | sed 's/^/  справка: /' || true
  # B-N-1768 (07.10, Аврора): ЖИВЫЕ непокрытые — ДАННЫЕ, их судит часовой сторож (рамка стенда: шапка и уровень 15);
  #   прежде здесь стоял вердикт, и приёмка краснела на исправном стороже от каждого нового неразмеченного каталога.
  n=$(command grep -c '• /opt/\|• /var/lib/' "$VYVOD_FAJL")
  echo "  справка: живых непокрытых верхнего уровня сейчас $n — не вердикт приёмки"
  # Отдельный вывод сохраняет живую базу $VYVOD_FAJL для порчи шага7.
  python3 - "$REESTR" "$VREM" <<'PY6' 2>/dev/null
import sys, os, yaml
source, temp = sys.argv[1:]
d = yaml.safe_load(open(source, encoding="utf-8"))
home = os.path.join(temp, "koren6", "iskra")
for room in (".gnupg", ".config/rclone", ".spark-sekrety"):
    os.makedirs(os.path.join(home, room), exist_ok=True)
d["agenty"] = [{"imya": name, "rol": "фикстура", "namerenie": {
    "sluzhba": name + ".service", "dom": home, "polzovatel": "iskra",
    "kopiya": {"klast": [".gnupg", ".config/rclone", ".spark-sekrety"], "ne_klast_prichina": {}}}}
    for name in ("iskra", "proba")]
d["korni_obhoda"] = [{"put": os.path.join(temp, "koren6"), "maski": ["iskra"], "zachem": "полностью размеченный дом шага6"}]
yaml.safe_dump(d, open(os.path.join(temp, "p6.yaml"), "w", encoding="utf-8"), allow_unicode=True)
PY6
  if [ ! -s "$VREM/p6.yaml" ]; then
    slep "не собрался размеченный дом шага6"
  else
    AGENTS_REGISTRY="$VREM/p6.yaml" AGENT_ALERT_BIN="$ZAGLUSHKA" "$STOROZH" > "$VREM/p6.out" 2>&1
    KOD6=$?
    if [ "$KOD6" = 0 ]; then ok "размеченный дом фикстуры шага6 молчит";
    elif [ "$KOD6" = 1 ]; then bad "размеченный дом фикстуры шага6 дал тревогу: $(grep -m1 -E '^[[:space:]]*• ' "$VREM/p6.out" || head -1 "$VREM/p6.out")";
    else slep "размеченный дом фикстуры шага6 не проверен, код $KOD6"; fi
  fi
fi

echo "── 7. Снята ОДНА разметка -> появился РОВНО он"
command grep '•' "$VYVOD_FAJL" | sort > "$VREM/do.txt"
python3 - "$REESTR" "$VREM/bez-odnoj.yaml" <<'PY' 2>/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
a = [x for x in d["agenty"] if x["imya"] == "iskra"][0]["namerenie"]["kopiya"]
a["klast"].remove(".gnupg")
yaml.safe_dump(d, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
PY
if [ ! -s "$VREM/bez-odnoj.yaml" ]; then
  slep "не собрался реестр со снятой разметкой .gnupg"
else
  progon "$VREM/bez-odnoj.yaml"; command grep '•' "$VYVOD_FAJL" | sort > "$VREM/posle.txt"
  RAZN=$(diff "$VREM/do.txt" "$VREM/posle.txt" | command grep -c '^>')
  NOVOE=$(diff "$VREM/do.txt" "$VREM/posle.txt" | command grep '^>' | tr -d '> •' | tr -d ' ')
  USHLO=$(diff "$VREM/do.txt" "$VREM/posle.txt" | command grep -c '^<')
  if [ "$RAZN" = 1 ] && [ "$USHLO" = 0 ] && [ "$NOVOE" = "iskra/.gnupg" ]; then
    ok "прибавилась ровно одна строка и это iskra/.gnupg (ушло $USHLO)"
  else
    bad "снятие одной разметки дало +$RAZN/-$USHLO строк, новое: '$NOVOE'"
  fi
fi

echo "── 8. ПОРЧА ПОДСТАВНОГО /opt: новый каталог виден, снятый исчезает"
# 🔴 ПОДСТАВНОЙ КОРЕНЬ — КОПИЯ ЗАПИСИ /opt ИЗ РЕЕСТРА (те же маски, другой путь).
# Шаг 8 был единственным, кто доказывал «новый каталог в /opt будет замечен»
# (шаг 7 проверяет комнаты, а не корень). Свой корень с придуманными масками
# молча потерял бы это: доказывал бы механизм, а не рамку /opt. Записи /opt в
# реестре нет — FAIL. Жилец размечен в obshchee_ne_v_kopiyu: корень без маски
# пустым не бывает (код 5), а после снятия порчи он обязан остаться непустым.
KOREN8="$VREM/opt-podstava"
mkdir -p "$KOREN8/zhitel"
python3 - "$REESTR" "$VREM/p8.yaml" "$KOREN8" <<'PY' 2>/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
opt = [k for k in d.get("korni_obhoda") or [] if k.get("put") == "/opt"]
if not opt:
    sys.exit(3)
d["korni_obhoda"].append({"put": sys.argv[3], "maski": list(opt[0].get("maski") or []),
                          "zachem": "подставной /opt шага 8 стенда"})
d.setdefault("obshchee_ne_v_kopiyu", {})[sys.argv[3] + "/zhitel"] = {
    "prichina": "жилец подставного корня стенда: пустой корень без маски = код 5"}
yaml.safe_dump(d, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
PY
K8=$?
PORCHA_PUT="$KOREN8/proba-storozha-stend-$$"
if [ "$K8" = 3 ]; then
  bad "в реестре нет корня обхода /opt — новый каталог в /opt сторож не увидит"
elif [ ! -s "$VREM/p8.yaml" ] || ! mkdir "$PORCHA_PUT" 2>/dev/null; then
  slep "подставной корень или $PORCHA_PUT не собрались — порча не состоялась"
else
  progon "$VREM/p8.yaml"
  if command grep -q "• $PORCHA_PUT$" "$VYVOD_FAJL"; then
    ok "подложенный дом $PORCHA_PUT найден"
  else
    bad "подложенный дом $PORCHA_PUT НЕ найден — сторож слеп к новому"
  fi
  rmdir "$PORCHA_PUT"
  progon "$VREM/p8.yaml"
  if command grep -q 'proba-storozha-stend' "$VYVOD_FAJL"; then
    bad "после снятия порчи сторож всё ещё о ней говорит"
  elif [ "$KOD" != 0 ] && [ "$KOD" != 1 ]; then
    # Отказ сторожа (напр. код 5 на опустевшем корне) тоже «не говорит о порче».
    slep "после снятия порчи сторож отказал кодом $KOD — «строка ушла» не доказано"
  else
    ok "после снятия порчи строка ушла"
  fi
fi

echo "── 9. ГЛУБИНА: снята ВЛОЖЕННАЯ разметка -> появился ровно этот путь"
# 🔴 Ради этого раздела правка 25.08 и делалась. До неё один размеченный
# подкаталог гасил весь дом: `workspace/procedury` в klast — и `workspace`
# считался покрытым целиком, со всеми 168 именами внутри.
# 🔴 25.09.2026 (B-N-852б): СИНТЕТИЧЕСКИЙ МИР, А НЕ ЖИВОЙ ДИСК. Прежняя проба снимала workspace/dorabotki с живой разметки — а у
# Искры в klast стоит `workspace` ЦЕЛИКОМ, снятие ничего не открывало (FAIL с 21.09). Редакция «два прогона по живому диску» (B-N-852)
# лечила это, но добавила полный обход машины (~4,4 с): стенд вырос 13,3 → 17,8 с и перестал укладываться в 15 с проверки здоровья
# agent-plugins (run(hc, 15)) — backup-coverage-watch стал «НЕ ОТВЕЧАЕТ». Здесь мир маленький: дом с glub/a и glub/b, оба
# размечены ВЛОЖЕННО (сам glub — нет). База: покрытие полное, код 0. Проба: снята glub/b → открыта ровно glub/b, а не весь glub.
python3 - "$REESTR" "$VREM" <<'PY' 2>/dev/null
import sys, os, yaml
reestr, vrem = sys.argv[1], sys.argv[2]
dom = os.path.join(vrem, "koren9", "dom")
for p in ("glub/a", "glub/b"): os.makedirs(os.path.join(dom, p), exist_ok=True)
def mir(klast, imya):
    d = yaml.safe_load(open(reestr, encoding="utf-8"))
    # агент iskra обязан быть: разделы mashina/obshchee ссылаются на его пути (см. фикстуру F15)
    d["agenty"] = [{"imya": a, "rol": "фикстура", "namerenie": {"sluzhba": a + ".service", "dom": dom, "polzovatel": "iskra",
                    "kopiya": {"klast": list(klast), "ne_klast_prichina": {}}}} for a in ("iskra", "proba")]
    d["korni_obhoda"] = [{"put": os.path.join(vrem, "koren9"), "maski": ["dom"], "zachem": "фикстура пробы 9"}]
    yaml.safe_dump(d, open(os.path.join(vrem, imya), "w", encoding="utf-8"), allow_unicode=True)
mir(["glub/a", "glub/b"], "p9-baza.yaml")
mir(["glub/a"], "p9-proba.yaml")
PY
if [ ! -s "$VREM/p9-baza.yaml" ] || [ ! -s "$VREM/p9-proba.yaml" ]; then
  slep "не собрался синтетический мир пробы 9"
else
  progon "$VREM/p9-baza.yaml"; KOD_BAZY=$KOD
  progon "$VREM/p9-proba.yaml"
  NOVOE=$(command grep '^  • ' "$VYVOD_FAJL" | sed 's/.*• //' | tr -d ' ' | sort -u)
  if [ "$KOD_BAZY" = 0 ] && [ "$KOD" = 1 ] && [ "$NOVOE" = "dom/glub/b" ]; then
    ok "снятие вложенной разметки дало ровно glub/b (база полна, код 0)"
  else
    bad "снятие вложенной разметки: база код $KOD_BAZY, проба код $KOD, открыто '$NOVOE' (ждали ровно dom/glub/b)"
  fi
fi

echo "── 10. СОПОСТАВЛЕНИЕ: свойства функции на подставных образцах"
# 🔴 Первая редакция этого раздела проверяла ПОВЕДЕНИЕ: добавляла вложенный
# образец внутрь целиком объявленного .gnupg и ждала, что строк про .gnupg не
# появится. Порча приоритета (chastichno сильнее polno) её НЕ покрасила —
# и правильно: приоритет на вывод не влияет вовсе, он экономит обход.
# Проверка называла своим предметом приоритет, а мерила то, что от него не
# зависит. Теперь мерим само свойство, ради которого приоритет и введён.
SVOJSTVA=$(python3 - "$STOROZH" <<'PYEOF' 2>/dev/null
import sys
src = open(sys.argv[1], encoding="utf-8").read()
mod = type(sys)("p"); mod.__dict__["__name__"] = "ne_main"
exec(compile(src, "p", "exec"), mod.__dict__)
st, obr = mod.status, ["app", "app/package-lock.json"]
sluchai = [
    (["app"],                            "polno",      "объявленный целиком закрыт"),
    (["app", "node_modules"],            "polno",      "потомок закрытого тоже закрыт"),
    (["app", "nm", "glubzhe"],           "polno",      "и потомок потомка"),
    (["workspace"],                      "chastichno", "разметка уходит внутрь -> спуск"),
    (["workspace", "chego-net"],         None,         "внутри неразмеченное -> тревога"),
    (["workspace", "dorabotki"],         "polno",      "размеченное внутри молчит"),
]
obr2 = ["workspace/dorabotki"]
for seg, ozh, opis in sluchai:
    o = obr if seg[0] == "app" else obr2
    got = st(seg, o)
    print(f"{'OK' if got == ozh else 'NET'}|{'/'.join(seg)}|{got}|{ozh}|{opis}")
PYEOF
)
if [ -z "$SVOJSTVA" ]; then
  slep "не удалось выполнить функции сторожа отдельно от него"
else
  while IFS='|' read -r VERD PUT GOT OZH OPIS; do
    [ -z "$VERD" ] && continue
    if [ "$VERD" = OK ]; then ok "$PUT -> $GOT ($OPIS)"
    else bad "$PUT -> $GOT, а должно $OZH ($OPIS)"; fi
  done <<< "$SVOJSTVA"
fi

echo "── 11. Вложенное объявлено внутри ФАЙЛА — говорим, а не молчим"
python3 - "$REESTR" "$VREM/vlozh-v-fajl.yaml" <<'PY' 2>/dev/null
import sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
a = [x for x in d["agenty"] if x["imya"] == "iskra"][0]["namerenie"]["kopiya"]
a["ne_klast_prichina"].pop(".bashrc", None)
a["klast"].append(".bashrc/vlozhennoe")      # .bashrc — файл, вкладывать некуда
yaml.safe_dump(d, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
PY
if [ ! -s "$VREM/vlozh-v-fajl.yaml" ]; then
  slep "не собрался реестр с вложенным образцом внутри файла"
else
  progon "$VREM/vlozh-v-fajl.yaml"
  if command grep -q 'iskra/.bashrc — разметка объявляет вложенное' "$VYVOD_FAJL"; then
    ok "вложенное внутри файла названо, а не проглочено"
  else
    bad "образец объявляет вложенное внутри файла, а сторож промолчал"
  fi
fi

echo "── 12. Обход не спрашивает isdir своей рукой (иначе чужой дом пуст молча)"
# 🔴 Замер 25.08: os.path.isdir('/opt/dsh/workspace') рукой сторожа = False,
# при 17 детях внутри. Причина — права (drwxr-x--- dsh dsh), а не отсутствие.
# Оставь мы isdir, спуск в дом соседа тихо возвращал бы пусто = «покрыто».
NEISDIR=$(python3 - "$STOROZH" <<'PYEOF' 2>/dev/null
import ast, sys
d = ast.parse(open(sys.argv[1], encoding="utf-8").read())
n = 0
for u in ast.walk(d):
    if isinstance(u, ast.Call) and ast.unparse(u.func).endswith("path.isdir"):
        n += 1
print(n)
PYEOF
)
if [ -z "$NEISDIR" ]; then
  slep "не удалось разобрать вызовы в $STOROZH"
elif [ "$NEISDIR" = 0 ]; then
  ok "вызовов os.path.isdir в коде нет (упоминание в пояснении не в счёт)"
else
  bad "os.path.isdir зовётся $NEISDIR раз — чужой дом снова станет пустым молча"
fi

echo "── 13. Юнит: код 1 штатный, коды 3/4/5 — нет"
if [ ! -r "$UNIT" ]; then
  slep "не читается $UNIT"
else
  ZNACH=$(command grep -E '^SuccessExitStatus=' "$UNIT" | head -1 | cut -d= -f2)
  if [ "$ZNACH" = "1" ]; then ok "SuccessExitStatus=1 — находка не красит юнит в failed"
  elif [ -z "$ZNACH" ]; then bad "SuccessExitStatus нет: каждая находка станет failed"
  else bad "SuccessExitStatus='$ZNACH' — сюда нельзя вносить 3/4/5, это несостоявшаяся проверка"; fi
fi

echo "── 14. Таймер взведён и следующий запуск назначен"
if ! systemctl is-active --quiet backup-coverage-watch.timer; then
  bad "таймер не активен"
else
  SLED=$(systemctl show backup-coverage-watch.timer -p NextElapseUSecRealtime --value)
  if [ -n "$SLED" ]; then ok "таймер активен, следующий запуск $SLED"
  else
    # B-N-2028 (14.10.2026, Аврора): пока служба от таймера идёт, systemd не даёт NextElapse — пусто для любого наблюдателя,
    # а healthcheck записи зовёт этот стенд как раз в это окно. Тогда вопрос «срабатывал ли таймер» (образец — healthcheck
    # registry-watchdog). На простое — прежняя проверка.
    SS=$(systemctl show backup-coverage-watch.service -p ActiveState --value)
    case "$SS" in
      active|activating|reloading|deactivating)
        L=$(systemctl show backup-coverage-watch.timer -p LastTriggerUSec --value)
        case "$L" in ""|n/a) LS="" ;; *) LS=$(date -d "$L" +%s 2>/dev/null) || LS="" ;; esac
        if [ -z "$LS" ]; then bad "служба идёт, а таймер не срабатывал ни разу ($L) — её запустили не таймером"
        elif [ $(( $(date +%s) - LS )) -ge 172800 ]; then bad "служба идёт, но таймер не срабатывал 48 ч ($L) — запущена не таймером, а таймер мёртв"
        else ok "идёт прогон службы (таймер срабатывал $L) — следующий запуск systemd назначит по окончании"; fi ;;
      *) bad "таймер числится активным, а следующего запуска НЕТ" ;;
    esac
  fi
fi

echo "── 15. ОБРАТНАЯ СВЕРКА: образцу разметки — объект на диске"
# Уровни 1-14 спрашивают «объекту найден образец». Обратная сторона молчит по
# устройству: строка в разметке ЕСТЬ, значит выглядит работой, даже если
# предмета нет. Здесь проверяется механизм, а НЕ верность боевой разметки —
# рамка стенда (см. шапку) этого не обещает, и данные проверяет ежедневный
# сторож, а не приёмка.
SVOEJ_RUKOJ=$(python3 - "$STOROZH" <<'PYEOF' 2>/dev/null
import ast, sys
d = ast.parse(open(sys.argv[1], encoding="utf-8").read())
f = [u for u in ast.walk(d) if isinstance(u, ast.FunctionDef) and u.name == "obrazec_najden"]
if not f:
    print("NET"); raise SystemExit
n = 0
for u in ast.walk(f[0]):
    if isinstance(u, ast.Call):
        imya = ast.unparse(u.func)
        if imya.endswith(("path.exists", "path.isdir", "path.isfile")) or imya.endswith("glob.glob"):
            n += 1
print(n)
PYEOF
)
if [ -z "$SVOEJ_RUKOJ" ]; then
  slep "не удалось разобрать $STOROZH"
elif [ "$SVOEJ_RUKOJ" = "NET" ]; then
  bad "функции obrazec_najden в стороже нет — обратная сверка не заведена"
elif [ "$SVOEJ_RUKOJ" = 0 ]; then
  ok "обратная сверка спрашивает тем же обходом, а не своей рукой"
else
  bad "obrazec_najden $SVOEJ_RUKOJ раз спрашивает своей рукой: чужой дом даст ложное «в никуда»"
fi

python3 - "$REESTR" "$VREM" <<'PYEOF' 2>/dev/null
import sys, os, yaml
reestr, vrem = sys.argv[1], sys.argv[2]
d = yaml.safe_load(open(reestr, encoding="utf-8"))
dom = os.path.join(vrem, "koren", "dom")
os.makedirs(os.path.join(dom, "komnata"), exist_ok=True)
open(os.path.join(dom, "fajl.txt"), "w").close()
# 🔴 ФИКСТУРА ПОДМЕНЯЛА ТОЛЬКО agenty — и этого мало. В mashina/obshchee остаются
# пути боевых агентов (/opt/iskra/.gnupg и другие), сторож выводит агента ИЗ ПУТИ и
# спрашивает `pole iskra dom`. В фикстуре такого агента не было, и две проверки
# краснели ЛОЖНО — на исправном стороже. Замер 03.09.2026: с агентом iskra в
# фикстуре FAIL стало 1 вместо 2, и оставшийся указывает на настоящий дефект.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: подменять весь реестр целиком не нужно — хватает того, чтобы
# агенты, упомянутые путями в других разделах, в списке существовали.
d["agenty"] = [{"imya": "iskra", "rol": "фикстура-хозяин", "namerenie": {
    "sluzhba": "iskra.service", "dom": dom, "polzovatel": "iskra",
    "kopiya": {"klast": ["komnata", "fajl.txt"], "ne_klast_prichina": {}}}},
    {"imya": "proba", "rol": "фикстура", "namerenie": {
    "sluzhba": "proba.service", "dom": dom, "polzovatel": "iskra",
    "kopiya": {"klast": ["komnata", "fajl.txt"], "ne_klast_prichina": {}}}}]
d["korni_obhoda"] = [{"put": os.path.join(vrem, "koren"), "maski": ["dom"],
                      "zachem": "фикстура приёмки"}]
k = d["agenty"][0]["namerenie"]["kopiya"]["klast"]
def zapisat(imya):
    yaml.safe_dump(d, open(os.path.join(vrem, imya), "w", encoding="utf-8"),
                   allow_unicode=True)
zapisat("F15-chisto.yaml")
k.append("net-takogo-predmeta");        zapisat("F15-bukvalnyj.yaml")
k[-1] = "*.net-takogo-rasshireniya";    zapisat("F15-maska.yaml")
k.append("net-takogo-predmeta");        zapisat("F15-obe.yaml")
PYEOF
if [ ! -s "$VREM/F15-obe.yaml" ]; then
  slep "фикстуры обратной сверки не собрались"
else
  progon "$VREM/F15-chisto.yaml"
  if [ "$KOD" = 0 ] && command grep -q 'буквальных образцов в никуда 0, масок без совпадения 0' "$VYVOD_FAJL"; then
    ok "всё размечено и все образцы предметны -> код 0, обе половины названы числом"
  else bad "чистая фикстура дала код $KOD: $(head -1 "$VYVOD_FAJL")"; fi

  progon "$VREM/F15-bukvalnyj.yaml"
  if [ "$KOD" = 1 ] && command grep -q 'net-takogo-predmeta' "$VYVOD_FAJL"; then
    ok "буквальный образец в никуда -> код 1 и назван поимённо"
  else bad "буквальный образец в никуда дал код $KOD без имени в выводе"; fi

  # 🔴 Маска — признак, а не адрес: `*.log` законно не совпадает, пока журналов
  # нет. Кода она не поднимает, но и молча не исчезает: число печатается.
  progon "$VREM/F15-maska.yaml"
  if [ "$KOD" = 0 ] && command grep -q 'масок без совпадения 1' "$VYVOD_FAJL"; then
    ok "маска без совпадения не поднимает код, но названа числом"
  else bad "маска без совпадения дала код $KOD: $(head -1 "$VYVOD_FAJL")"; fi

  progon "$VREM/F15-obe.yaml"
  if [ "$KOD" = 1 ] && command grep -q 'образцов в никуда 1' "$VYVOD_FAJL" \
     && command grep -q 'масок без совпадения сегодня: 1' "$VYVOD_FAJL"; then
    ok "буквальный и маска РАЗЛИЧЕНЫ: тревога об одном, второе отдельной строкой"
  else bad "буквальный и маска не различены: код $KOD, $(command grep -c 'в никуда' "$VYVOD_FAJL") строк"; fi
fi

echo
echo "ИТОГ: ok=$OK  FAIL=$FAIL  СЛЕПОТА=$SLEP"
[ "$SLEP" -gt 0 ] && { echo "код 2: проверка не состоялась целиком"; exit 2; }
[ "$FAIL" -gt 0 ] && { echo "код 1: расхождение"; exit 1; }
# 🔴 ЧИСЛО ТОЧНОЕ, а не «не меньше». Порча Б (вырезан целый раздел проверок)
# при нижней границе 15 давала ok=18 и код 0: стенд похудел на пять проверок
# и остался зелёным. Отсутствие проверки чтением не видно — видно только
# счётом, и счёт обязан быть точным. Добавили проверку — правьте это число
# тем же движением, иначе стенд начнёт молча уменьшаться.
OZHIDAEMO=36   # B-N-1768: −1 (вердикт по живым данным шага 6 снят в справку)
[ "$OK" -ne "$OZHIDAEMO" ] && { echo "код 2: зелёных проверок $OK, а должно быть $OZHIDAEMO — стенд отработал не целиком"; exit 2; }
echo "код 0: сошлось"
exit 0
