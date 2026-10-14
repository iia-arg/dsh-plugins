#!/bin/bash
# Приёмка сборщика ссылок на скиллы bin/refresh-skill-links (другой путь — STEND_PRIBOR).
# Коды: 0 всё сошлось, 1 проверка не прошла, 2 слепота (не смогла проверить).
#
# Зачем: сборщик выбирает между двумя источниками, и раньше при совпадении имён он
# молча брал полку с кодом 0. Доставленная редакция не использовалась, и узнать об
# этом мог только тот, кто запускал скрипт руками, — а запускает его путевой юнит.
# Проверяется ИМЕННО установленный файл: источники и цель подставляются переменными,
# копию скрипта стенд не делает (копия проверяла бы себя).
#
# 🔴 Где стенд НЕ применяется: он не трогает ни настоящие каталоги скиллов, ни каталог
# ссылок движка — всё во временном каталоге, который удаляется в конце. Про то, ВИДИТ
# ли движок собранные ссылки, стенд не говорит ничего: это проверяется живой сессией.
#
# 🔴 ГРАНИЦА ОХВАТА — о чём стенд НЕ высказывается (замерено 25.08.2026, команда
# замера рядом с каждым пунктом). Зелёный означает ровно это и ничего больше.
#
#   1. БОЕВЫЕ УМОЛЧАНИЯ НЕ ПРОВЕРЯЮТСЯ. Источники и цель здесь ВСЕГДА
#      подставляются через SKILL_LINKS_SOURCES. Значит про то, что скрипт по умолчанию
#      берёт источники из ключа SKILL_LINKS_SOURCES файла настройки
#      и кладёт в $HOME/.claude/skills, стенд не говорит ничего. Сменят умолчание
#      или у путевого юнита окажется другой $HOME — стенд останется зелёным.
#
#   2. ТЕЛО СКИЛЛА НЕ ЧИТАЕТСЯ. Проверяется, КУДА ведёт ссылка (readlink), а не
#      что движок получит именно тот текст. Подмена содержимого SKILL.md при
#      целой ссылке отсюда не видна.
#
#   3. РАСХОЖДЕНИЕ КАТАЛОГА И ПОЛЯ `name` — ПОКРЫТО с 25.08.2026 (разделы 7-10).
#      Было границей: фикстуры делались совпадающими, и случай не воспроизводился ни в
#      одном из шести разделов. Проверка не может поймать то, чего нет в её данных, —
#      совпадающие поля это не нейтральный выбор, а выключенная проверка. Теперь в
#      фикстурах расхождение есть намеренно.
#      🔴 ПОПРАВКА 25.08.2026, вечер: здесь стояло «имя по каталогу берёт именно движок».
#      Это НЕВЕРНО. Платформа читает поле `name` фронтматтера — dsh-skill-filesystem/
#      lib/index.js:679, оттуда в :597 и :120; имя каталога идёт только в локатор пути.
#      A/B на живом: у трёх скиллов раздачи поменяли ТОЛЬКО поле, каталоги linux-* не
#      трогали, — и имя в наборе модели сменилось с process-management на
#      linux-process-management. Прежний вывод был сделан по имени ССЫЛКИ, без чтения
#      кода платформы: ссылка действительно зовётся по каталогу, но ссылка не скилл.
#      Чего стенд по-прежнему НЕ говорит: он проверяет только сборщик, поведение
#      платформы отсюда не измеряется вовсе.
#
#   4. ДУБЛИ НА БОЕВЫХ ИСТОЧНИКАХ — не предмет стенда. Он доказывает, что дубль
#      ловится механизмом; что на машине дублей нет сейчас, отвечает healthcheck
#      записи refresh-skill-links в реестре вмешательств, и звать его надо отдельно.
# EN: Acceptance of the skill-link builder bin/refresh-skill-links (another path — STEND_PRIBOR).
#     Codes: 0 all matched, 1 a check failed, 2 blindness (could not check).
#     Why: the builder chooses between two sources, and previously on a name match it silently took the shelf
#     with code 0. The delivered edition was not used, and only whoever ran the script by hand could find out —
#     while it is run by a path unit. EXACTLY the installed file is checked: sources and target are substituted
#     by variables, the stand makes no copy of the script (a copy would check itself).
#     🔴 Where the stand does NOT apply: it touches neither real skill directories nor the engine's link
#     directory — everything is in a temporary directory removed at the end. About whether the engine SEES the
#     built links the stand says nothing: that is checked by a live session.
#     🔴 COVERAGE LIMIT — what the stand does NOT speak about (measured 25.08.2026, the measuring command next to
#     each item). Green means exactly this and nothing more.
#     1. PRODUCTION DEFAULTS ARE NOT CHECKED. Sources and target are ALWAYS substituted here via
#     SKILL_LINKS_SOURCES. So about the script taking its sources by default from the SKILL_LINKS_SOURCES key of
#     the settings file and putting links into $HOME/.claude/skills, the stand says nothing. If the default
#     changes or the path unit gets a different $HOME — the stand stays green.
#     2. THE SKILL BODY IS NOT READ. What is checked is WHERE the link leads (readlink), not that the engine
#     gets exactly that text. Substituting SKILL.md contents with an intact link is not visible from here.
#     3. A MISMATCH BETWEEN THE DIRECTORY AND THE `name` FIELD — COVERED since 25.08.2026 (sections 7-10). It
#     was a limit: fixtures were made matching, and the case was not reproduced in any of the six sections. A
#     check cannot catch what is not in its data — matching fields are not a neutral choice but a disabled
#     check. Now the fixtures contain a mismatch on purpose.
#     🔴 CORRECTION 25.08.2026, evening: here it said "the name by directory is taken by the engine". This is
#     WRONG. The platform reads the frontmatter `name` field — dsh-skill-filesystem/lib/index.js:679, from there
#     to :597 and :120; the directory name goes only into the path locator. A/B on the live system: for three
#     skills of the distribution ONLY the field was changed, the linux-* directories were not touched — and the
#     name in the model's set changed from process-management to linux-process-management. The previous
#     conclusion was drawn from the LINK name, without reading the platform code: the link is indeed named after
#     the directory, but a link is not a skill.
#     What the stand still does NOT say: it checks only the builder, the platform's behaviour is not measured
#     from here at all.
#     4. DUPLICATES ON PRODUCTION SOURCES are not the stand's subject. It proves that a duplicate is caught by
#     the mechanism; whether there are no duplicates on the machine now is answered by the healthcheck of the
#     refresh-skill-links record in the interventions registry, and it must be called separately.
set -u
SCRIPT=${STEND_PRIBOR:-$(cd "$(dirname "$0")/../bin" && pwd)/refresh-skill-links}
ok=0; fail=0; blind=0
say(){ printf '%-58s %s\n' "$1" "$2"; }
bad(){ say "$1" "FAIL: $2"; fail=$((fail+1)); }
good(){ say "$1" "ok ($2)"; ok=$((ok+1)); }
blind_(){ say "$1" "СЛЕПОТА: $2"; blind=$((blind+1)); }

[ -x "$SCRIPT" ] || { echo "СЛЕПОТА: нет исполняемого $SCRIPT"; exit 2; }

W=$(mktemp -d) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$W"' EXIT
# RU/EN: Registry data is a private fixture, never the machine's ACL.
mkdir -p "$W/bin"
cat > "$W/bin/agent-registry" <<'REGISTRY'
#!/bin/sh
echo 'agent-registry-error: field-not-found' >&2
exit 3
REGISTRY
chmod 755 "$W/bin/agent-registry"
export PATH="$W/bin:$PATH"
A="$W/src-polka"; B="$W/src-razdacha"; T="$W/target"
mkdir -p "$A/skill-svoj" "$B/skill-chuzhoj" "$T"
printf -- '---\nname: skill-svoj\n---\nтело полки\n'      > "$A/skill-svoj/SKILL.md"
printf -- '---\nname: skill-chuzhoj\n---\nтело раздачи\n' > "$B/skill-chuzhoj/SKILL.md"
# 🔴 Каталог и поле name РАЗВЕДЕНЫ намеренно: совпадай они — раздел 7 не воспроизвёлся бы,
# а стенд выглядел бы полным. Четвёртый скилл вовсе без поля name — второй исход той же ветки.
# EN: 🔴 The directory and the name field are DELIBERATELY different: were they the same, section 7 would not
#     reproduce, and the stand would look complete. A fourth skill without a name field at all is the second
#     outcome of the same branch.
mkdir -p "$A/katalog-imya"
printf -- '---\nname: pole-imya\n---\nтело\n'          > "$A/katalog-imya/SKILL.md"
# 🔴 Скилл без поля name и дубль поля лежат в ОТДЕЛЬНЫХ источниках, а не в общем наборе.
# Оба дают код 1 законно, и, оставь я их в $A, каждый раздел, ждущий кода 0, краснел бы
# по чужой причине. Проверка, краснеющая по нескольким причинам сразу, не доказывает ни
# одной — поймано прогоном 25.08.2026: четыре FAIL, все от одной лишней фикстуры.
# EN: 🔴 A skill without a name field and a duplicate field lie in SEPARATE sources, not in the shared set. Both
#     legitimately give code 1, and had I left them in $A, every section expecting code 0 would go red for
#     someone else's reason. A check that goes red for several reasons at once proves none of them — caught by a
#     run on 25.08.2026: four FAILs, all from one extra fixture.
C="$W/src-bez-polya"; D="$W/src-dubl-polya"
mkdir -p "$C/bez-polya" "$D/kat-odin" "$D/kat-dva" "$W/t8" "$W/t9"
printf -- '---\ndescription: x\n---\nname: v-tele\n'   > "$C/bez-polya/SKILL.md"
printf -- '---\nname: odno-pole\ndescription: x\n---\nт\n' > "$D/kat-odin/SKILL.md"
printf -- '---\nname: odno-pole\ndescription: x\n---\nт\n' > "$D/kat-dva/SKILL.md"

run(){ SKILL_LINKS_SOURCES="$A:$B" SKILL_LINKS_TARGET="$T" "$SCRIPT" >"$W/out" 2>&1; echo $?; }

# 1. чисто: два разных имени, дублей нет
# EN: 1. clean: two different names, no duplicates
c=$(run)
[ "$c" = 0 ] && good "чисто: разные имена -> код 0" "$c" || bad "чисто: разные имена" "код $c, ждали 0"
[ -L "$T/skill-svoj" ] && [ -L "$T/skill-chuzhoj" ] && good "чисто: обе ссылки поставлены" "2 ссылки" \
  || bad "чисто: обе ссылки поставлены" "$(ls -1 "$T" | tr '\n' ' ')"

# 2. дубль имени в обоих источниках -> ОТКАЗ
# EN: 2. a name duplicated in both sources -> REFUSAL
mkdir -p "$B/skill-svoj"; printf -- '---\nname: skill-svoj\n---\nтело раздачи\n' > "$B/skill-svoj/SKILL.md"
c=$(run)
[ "$c" = 1 ] && good "дубль имени -> код 1 (а не 0)" "$c" || bad "дубль имени -> код 1" "код $c"
grep -q 'дубль имени: skill-svoj' "$W/out" && good "дубль назван поимённо" "есть строка" \
  || bad "дубль назван поимённо" "$(head -3 "$W/out")"
grep -q 'НЕ используется' "$W/out" && good "сказано, что вторая редакция не в деле" "есть" \
  || bad "сказано, что вторая редакция не в деле" "нет"
# и при этом скилл не пропал из каталога
# EN: and yet the skill did not vanish from the directory
[ "$(readlink "$T/skill-svoj")" = "$A/skill-svoj" ] && good "при дубле ссылка ведёт на полку" "полка" \
  || bad "при дубле ссылка ведёт на полку" "$(readlink "$T/skill-svoj")"
rm -rf "$B/skill-svoj"
c=$(run); [ "$c" = 0 ] && good "возврат: дубль убран -> код 0" "$c" || bad "возврат: дубль убран" "код $c"

# 3. пропал источник
# EN: 3. a source disappeared
c=$(SKILL_LINKS_SOURCES="$A:$W/net-takogo" SKILL_LINKS_TARGET="$T" "$SCRIPT" >"$W/out" 2>&1; echo $?)
[ "$c" = 1 ] && grep -q 'источник отсутствует' "$W/out" && good "нет источника -> код 1 и строка" "$c" \
  || bad "нет источника" "код $c: $(head -2 "$W/out")"

# 4. в цели настоящий каталог, а не ссылка — не удалять
# EN: 4. a real directory in the target, not a link — do not remove
mkdir -p "$T/nastoyashchij"; printf 'x\n' > "$T/nastoyashchij/file"
c=$(run)
[ "$c" = 1 ] && good "настоящий каталог в цели -> код 1" "$c" || bad "настоящий каталог в цели" "код $c"
[ -f "$T/nastoyashchij/file" ] && good "настоящий каталог НЕ удалён" "цел" || bad "настоящий каталог НЕ удалён" "пропал"
rm -rf "$T/nastoyashchij"

# 5. цель — символическая ссылка -> слепота
# EN: 5. the target is a symbolic link -> blindness
ln -s "$W" "$W/target-link"
c=$(SKILL_LINKS_SOURCES="$A:$B" SKILL_LINKS_TARGET="$W/target-link" "$SCRIPT" >"$W/out" 2>&1; echo $?)
[ "$c" = 2 ] && good "цель-ссылка -> код 2 (слепота)" "$c" || bad "цель-ссылка -> код 2" "код $c"

# 6. цели нет вовсе -> слепота
# EN: 6. no target at all -> blindness
c=$(SKILL_LINKS_SOURCES="$A:$B" SKILL_LINKS_TARGET="$W/net-celi" "$SCRIPT" >"$W/out" 2>&1; echo $?)
[ "$c" = 2 ] && good "цели нет -> код 2 (слепота)" "$c" || bad "цели нет -> код 2" "код $c"

# 7. каталог против поля name: сборщик обязан СКАЗАТЬ, но не поднять код
# EN: 7. directory against the name field: the builder must SAY it, but not raise the code
c=$(run)
grep -q 'katalog-imya: каталог «katalog-imya», а поле name «pole-imya»' "$W/out" \
  && good "расхождение названо обоими именами" "есть строка" \
  || bad  "расхождение названо обоими именами" "$(grep -c '⚠️' "$W/out") строк ⚠️: $(grep -m1 '⚠️' "$W/out")"
grep -q 'разошлось каталог/поле name: 1' "$W/out" \
  && good "счётчик расхождений в итоге верен" "1" \
  || bad  "счётчик расхождений в итоге" "$(grep -m1 'разошлось каталог' "$W/out")"
# 🔴 Закрепляю РЕШЕНИЕ, а не только поведение: код при расхождении остаётся 0. Подними его
# кто-нибудь «для строгости» — боевой сборщик покраснеет из-за трёх скиллов чужой раздачи,
# и ежедневная тревога о чужом приучит не читать тревоги. Довод записан в шапке сборщика.
# EN: 🔴 I fix the DECISION, not just the behaviour: the code on a mismatch stays 0. If someone raises it "for
#     strictness", the production builder goes red because of three skills of someone else's distribution, and a
#     daily alarm about someone else's things teaches people not to read alarms. The argument is written in the
#     builder's header.
[ "$c" = 0 ] && good "расхождение НЕ поднимает код" "$c" || bad "расхождение НЕ поднимает код" "код $c, ждали 0"
# ссылка ложится по КАТАЛОГУ, а не по полю
# EN: the link is put by DIRECTORY, not by field
[ -L "$T/katalog-imya" ] && [ ! -e "$T/pole-imya" ] \
  && good "ссылка названа по каталогу, не по полю" "katalog-imya" \
  || bad  "ссылка названа по каталогу" "$(ls -1 "$T" | tr '\n' ' ')"
# и ложного срабатывания на совпадающих нет
# EN: and there is no false trigger on matching ones
grep -q 'skill-svoj: каталог' "$W/out" \
  && bad  "нет ложного срабатывания на совпадающих" "ругается на skill-svoj" \
  || good "нет ложного срабатывания на совпадающих" "молчит про skill-svoj"

# 8. нет поля name -> ОТКАЗ, а не косметика: платформа такой файл пропустит,
#    ссылка встанет впустую. Отдельная фикстура, отдельный счётчик.
# EN: 8. no name field -> REFUSAL, not cosmetics: the platform will skip such a file, the link would be put in
#     vain. A separate fixture, a separate counter.
c=$(SKILL_LINKS_SOURCES="$C" SKILL_LINKS_TARGET="$W/t8" "$SCRIPT" >"$W/out8" 2>&1; echo $?)
[ "$c" = 1 ] && good "нет поля name -> код 1" "$c" || bad "нет поля name -> код 1" "код $c"
grep -q 'bez-polya: во фронтматтере нет поля name' "$W/out8" \
  && good "отсутствие поля name названо" "есть строка" \
  || bad  "отсутствие поля name названо" "нет строки"
grep -q 'без поля name: 1' "$W/out8" \
  && good "счётчик «без поля» отдельный" "1" \
  || bad  "счётчик «без поля» отдельный" "$(grep -m1 'без поля' "$W/out8")"
grep -q 'разошлось каталог/поле name' "$W/out8" \
  && bad  "пропажа не смешана с расхождением" "считается расхождением" \
  || good "пропажа не смешана с расхождением" "своя строка"

# 9. дубль ПОЛЯ name при разных каталогах -> отказ. Проверка дублей раньше стояла
#    на имени каталога, то есть не на том признаке, по которому судит потребитель.
# EN: 9. a duplicate name FIELD with different directories -> refusal. The duplicate check used to stand on the
#     directory name, i.e. not on the sign the consumer judges by.
c=$(SKILL_LINKS_SOURCES="$D" SKILL_LINKS_TARGET="$W/t9" "$SCRIPT" >"$W/out9" 2>&1; echo $?)
[ "$c" = 1 ] && good "дубль поля name -> код 1" "$c" || bad "дубль поля name -> код 1" "код $c"
grep -q 'дубль поля name: «odno-pole»' "$W/out9" \
  && good "дубль поля назван обоими каталогами" "есть строка" \
  || bad  "дубль поля назван обоими каталогами" "нет строки"
# обе ссылки всё равно ставятся: пропажа скилла из каталога хуже дубля имени
# EN: both links are put anyway: losing a skill from the directory is worse than a duplicate name
[ -L "$W/t9/kat-odin" ] && [ -L "$W/t9/kat-dva" ] \
  && good "при дубле поля обе ссылки на месте" "2" \
  || bad  "при дубле поля обе ссылки на месте" "$(ls -1 "$W/t9" | tr '\n' ' ')"

# 10. 🔴 Охрана исправленного утверждения. Прежняя редакция сборщика говорила «движок
#     возьмёт КАТАЛОГ» — вывод по имени ссылки, без чтения кода платформы. Правда
#     обратная (index.js:679). Ложное объяснение рядом с работающим кодом убедительнее
#     правды, поэтому возврат прежней формулировки ловится здесь, а не глазами.
# 🔴 Ищу только в ИСПОЛНЯЕМЫХ строках: цитата прежней формулировки живёт в комментарии,
#    объясняющем, почему она неверна, и поиск по всему файлу нашёл бы это объяснение.
#    Опасен не рассказ о старой ошибке, а то, что сборщик СКАЖЕТ ложное пользователю.
#    Поймано прогоном 25.08.2026: проверка покраснела на исправном предмете.
# EN: 10. 🔴 Guarding the corrected claim. The previous edition of the builder said "the engine will take the
#     DIRECTORY" — a conclusion from the link name, without reading the platform code. The truth is the opposite
#     (index.js:679). A false explanation next to working code is more convincing than the truth, so a return of
#     the old wording is caught here, not by eye.
#     🔴 I search only in EXECUTABLE lines: a quote of the old wording lives in a comment explaining why it is
#     wrong, and a search over the whole file would find that explanation. What is dangerous is not the story of
#     the old mistake but the builder TELLING the user something false. Caught by a run on 25.08.2026: the check
#     went red on a healthy subject.
grep -v '^[[:space:]]*#' "$SCRIPT" | grep -qi 'возьмёт КАТАЛОГ' \
  && bad  "нет возврата ложного «движок возьмёт каталог»" "формулировка вернулась в вывод" \
  || good "нет возврата ложного «движок возьмёт каталог»" "нет в говоримом"
grep -q 'index.js:679' "$SCRIPT" \
  && good "ссылка на код платформы названа в сборщике" "index.js:679" \
  || bad  "ссылка на код платформы названа в сборщике" "нет"

echo
echo "итог: ok=$ok fail=$fail слепота=$blind"

# Канарейка: ТОЧНОЕ число проверок, не «не меньше». Порог слеп к убыли ровно
# того размера, который умещается в запас, и выглядит строже, чем работает:
# «не меньше» звучит как требование, а действует как разрешение.
# Замерено 25.08.2026 приёмом «сверься с соседом того же вида»: канарейка была
# у 3 стендов из 13. Вырезанный раздел проходил кодом 0 — выпотрошенный стенд
# отчитывался успехом.
# EN: Canary: the EXACT number of checks, not "at least". A threshold is blind to a loss of exactly the size
#     that fits into the margin, and looks stricter than it works: "at least" sounds like a requirement but acts
#     like a permission. Measured 25.08.2026 by the technique "compare with a neighbour of the same kind": the
#     canary was in 3 stands of 13. A cut-out section passed with code 0 — a gutted stand reported success.
ZHDYOM_PROVEROK=26
if [ $((ok+fail+blind)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+fail+blind)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[ "$blind" -gt 0 ] && exit 2
[ "$fail" -gt 0 ] && exit 1
exit 0
