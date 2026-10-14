#!/bin/bash
# RU: Сторож окна выпуска: БОЕВОЙ КАТАЛОГ ПРОТИВ СВОЕГО ВЫПУСКА (метка версии боя).
# EN: Release-window guard: the LIVE directory against ITS OWN release (the tag of the live version).
# RU: Заведён 19.09.2026 по наряду координатора. Основание — дважды за три часа пакет
# RU: монтировался в бой БЕЗ метки, и оба раза находку приносила рука монтировавшего.
# RU: Прибора, который заметил бы это сам, не было вовсе.
# EN: Created 19.09.2026 on the coordinator's order. Reason: twice within three hours a package
# EN: was deployed to production WITHOUT a tag, and both times the finding came from the person who deployed it.
# EN: There was no instrument at all that would have noticed it by itself.
# RU: КОДЫ ВЫХОДА: 0 чисто · 1 расхождение · 2 слепота · 3 ошибка вызова (любой довод — доводов у сторожа нет).
# EN: EXIT CODES: 0 clean · 1 mismatch · 2 blindness · 3 invocation error (any argument — the guard takes no arguments).
#
# RU: 🔴 ПРАВИЛО ТРЕВОГИ — «бой разошёлся с меткой СВОЕЙ версии»:
# RU:   версия совпадает, суммы разные -> ТРЕВОГА. Это наш главный класс: номер не различает;
# RU:   своей метки нет при известных выпусках -> РАЗОШЛОСЬ; совсем нет меток/две свои -> СЛЕПОТА;
# RU:   более новый выпуск при своей метке -> только INFO;
# RU:   всё совпало                     -> МОЛЧА. Сторож, который говорит всегда, перестаёт читаться.
# RU: 🔴 B-N-новые-пакеты (07.10.2026, Заря): ПАКЕТЫ БЕЗ МАНИФЕСТА ПО РАСКЛАДКЕ (VYPUSK_RASKLADKA). Служебные пакеты
# RU:   (dsh-montazh и др.) — исходники без package.json: файл пакета bin|sbin|libexec|lib/<путь> стоит в /usr/local/<то же>,
# RU:   systemd/<путь> — в /etc/systemd/system/<то же>; README.md CHANGELOG.md LICENSE docs/ test/ не ставятся. Версии боя
# RU:   нет — сверка с НОВЕЙШЕЙ меткой <каталог>-vX.Y.Z: всё равно -> сошлось; бой целиком = более старой метке, а файлов,
# RU:   добавленных позже, на диске нет -> сошлось + INFO «выпуск не смонтирован»; иначе -> РАЗОШЛОСЬ с именами файлов.
# RU:   Иной верх в метке, ссылка в метке, нечитаемый файл, меток нет -> СЛЕПОТА (не знаю ≠ можно).
# RU:   ⚠️ ЧЕГО НЕ ЛОВИТ: файл на диске, которого нет в метке (юнит, поставленный мимо пакета) · права и владельца
# RU:   (git хранит только x-бит; права — признак переноса, prava.tsv) · пакет, не вписанный в VYPUSK_RASKLADKA (печатается
# RU:   «без манифеста», как прежде) · бой, случайно вернувшийся ЦЕЛИКОМ к старой метке, читается как «не смонтирован».
# RU: 🔴 B-N-1767 (07.10.2026, Заря, слово Забавы 14:20Z): ЗАПИСИ derevo РЕЕСТРА (VYPUSK_REESTR). Запись реестра с ключом
# RU:   derevo {address, ref, subdir: packages/<каталог>, files[{local, remote, mode, owner}], not_installed,
# RU:   expected_diff_files, links} — носитель «файл пакета → путь на диске». Мерило — метка ref (а не «новейшая»).
# RU:   Каталог с записью derevo сверяется ТОЛЬКО по ней: раньше манифеста и раскладки, второй раз не считается.
# RU:   B-N-2033 (14.10.2026, Аврора): записей на один каталог может быть НЕСКОЛЬКО (один пакет на двух местах) — каждая судится
# RU:   своим id отдельной строкой исхода; у каталога с одной записью вывод PY_DEREVO прежний (его исполняет и montazh-okno).
# RU:   Сверка двусторонняя: файл метки вне files и вне not_installed («x/» — поддерево) -> СЛЕПОТА «запись отстала от
# RU:   метки»; remote, которого нет в метке, -> СЛЕПОТА; сумма боя ≠ метке, режим/владелец ≠ записи, ссылка не туда,
# RU:   файла нет -> РАЗОШЛОСЬ с путём; expected_diff_files -> INFO с обеими суммами и причиной (не молчание);
# RU:   есть метка того же ряда новее ref -> INFO; нечитаемый файл, нет метки ref, кривая запись -> СЛЕПОТА.
# RU:   ⚠️ ЧЕГО НЕ ЛОВИТ: файл на диске вне files (поставленный мимо пакета) · копии пакета с записью derevo в корнях
# RU:   VYPUSK_KORNI (manifest-путь для него не идёт) · version/installed_check записи (это verify реестра) ·
# RU:   устаревшую причину прощения (срок держит текст expected_diff_reason, не сторож).
# EN: 🔴 ALERT RULE — "production diverged from the tag of ITS OWN version":
# EN:   same version, different checksums -> ALERT. This is our main class: the version number does not tell them apart;
# EN:   no own tag while releases are known -> MISMATCH; no tags at all / two own tags -> BLINDNESS;
# EN:   a newer release while the own tag exists -> INFO only;
# EN:   everything matches              -> SILENT. A guard that always talks stops being read.
#
# RU: 🔴 ГРАНИЦА — ЧЕГО ЭТОТ СТОРОЖ НЕ ЛОВИТ (перечень честный, а не «и прочее»):
# EN: 🔴 BOUNDARY — WHAT THIS GUARD DOES NOT CATCH (an honest list, not "and so on"):
# RU:   0. 🔴 НЕ ОТЛИЧАЕТ «СМОНТИРОВАЛИ И ПОМЕТИЛИ» ОТ «НЕ МОНТИРОВАЛИ ВОВСЕ». Оба состояния
# RU:      дают метка = бой, то есть ЗЕЛЁНОЕ. Он ловит несоответствие боя своему выпуску, а не
# RU:      ОТСУТСТВИЕ РАБОТЫ. 19.09 он честно сказал «51 из 51» на состоянии ПОСЛЕ аварии и
# RU:      отката — и за этим зелёным стояли состоявшийся монтаж, десять минут лежавших служб
# RU:      и откат. Читатель строки решит, что ничего не происходило.
# RU:      Более новый выпуск — только INFO в сводке; отсутствие его монтажа не тревога.
# RU:      ⇒ Различает это ТОЛЬКО живой признак: версия в журнале работающего процесса.
# EN:   0. 🔴 DOES NOT TELL "DEPLOYED AND TAGGED" FROM "NOT DEPLOYED AT ALL". Both states
# EN:      give tag = production, i.e. GREEN. It catches production not matching its own release, not
# EN:      THE ABSENCE OF WORK. On 19.09 it honestly reported "51 of 51" on the state AFTER an incident and
# EN:      a rollback — and behind that green stood a completed deployment, ten minutes of services down,
# EN:      and the rollback. A reader of the line would conclude that nothing had happened.
# EN:      A newer release is only INFO in the summary; its not being deployed is not an alert.
# EN:      ⇒ ONLY a live sign tells these apart: the version in the log of the running process.
# RU:   1. НЕ ловит правку в ПАМЯТИ процесса. Он сверяет диск с диском. «Смонтировано» и
# RU:      «работает» — разные слова; живую версию проверяет только журнал процесса.
# EN:   1. Does NOT catch a change in the process MEMORY. It compares disk with disk. "Deployed" and
# EN:      "running" are different words; only the process log verifies the live version.
# RU:   2. Пакеты без меток вообще/с неоднозначной своей меткой — СЛЕПОТА;
# RU:      при известных выпусках отсутствие своей метки — смонтировано невыпущенное (РАЗОШЛОСЬ).
# RU:      Пакеты без боевого каталога — ВНЕ ОБЛАСТИ: перечисляются отдельно,
# RU:      не увеличивают слепоту и не меняют код выхода.
# EN:   2. Packages with no tags at all / with an ambiguous own tag — BLINDNESS;
# EN:      when releases are known, a missing own tag means an unreleased build was deployed (MISMATCH).
# EN:      Packages without a live directory are OUT OF SCOPE: they are listed separately,
# EN:      do not add to blindness and do not change the exit code.
# RU:   3. НЕ ловит пакеты вне дерева (поставленные из реестра чужой рукой).
# EN:   3. Does NOT catch packages outside the tree (installed from the registry by someone else).
# RU:   4. НЕ ловит ПОДМЕНУ самой метки: переставили метку на другой коммит — сторож
# RU:      честно скажет «сошлось», потому что сверяет с тем, что метка показывает сейчас.
# EN:   4. Does NOT catch a SUBSTITUTION of the tag itself: if the tag is moved to another commit, the guard
# EN:      will honestly say "matches", because it compares against what the tag points to now.
# RU:   5. НЕ ловит ВЕРНОСТЬ кода. Только тождество. Одинаково плохой код в обоих местах
# RU:      он объявит зелёным.
# EN:   5. Does NOT check the CORRECTNESS of the code. Only identity. Equally bad code in both places
# EN:      will be declared green.
# RU:   6. НЕ ловит содержимое node_modules внутри пакета и файлы, исключённые режимом счёта.
# EN:   6. Does NOT catch the contents of node_modules inside a package or files excluded by the counting mode.
# RU:   6б. АСИММЕТРИЯ ПО СОСТАВУ (заведена 19.09): файл, который есть в МЕТКЕ, НЕТ в бою и
# RU:      НЕ входит в состав публикации ("files" манифеста), расхождением НЕ считается —
# RU:      в бою его быть не может по построению, установка кладёт только состав. Пример:
# RU:      package-lock.json у dsh-pamyat-storozha (проба npm pack: 11 файлов в составе,
# RU:      lock среди них 0). Без этого сторож кричал бы о нём ВЕЧНО и выгорел бы, как
# RU:      сторож копии 12-17.09.
# EN:   6b. ASYMMETRY BY PUBLISHED CONTENTS (introduced 19.09): a file that is in the TAG, NOT in production and
# EN:      NOT part of the published contents (the manifest "files") is NOT counted as a mismatch —
# EN:      it cannot be in production by construction, installation only lays down the published contents. Example:
# EN:      package-lock.json of dsh-pamyat-storozha (npm pack probe: 11 files in the contents,
# EN:      the lock file among them 0). Without this the guard would shout about it FOREVER and burn out, like
# EN:      the backup guard on 12-17.09.
# RU:      🔴 ЧТО ИМЕННО ПРОПУСКАЕТСЯ И НИЧЕГО СВЕРХ: только ОТСУТСТВИЕ в бою. Если такой
# RU:      файл в бою ПОЯВИТСЯ или ИЗМЕНИТСЯ — поймается, как и всякий другой. Обратная
# RU:      сторона («есть в бою, нет в метке») расхождением остаётся ВСЕГДА: значит положили
# RU:      руками. Асимметрия гасит одну сторону, не обе.
# EN:      🔴 EXACTLY WHAT IS SKIPPED AND NOTHING MORE: only ABSENCE in production. If such a
# EN:      file APPEARS or CHANGES in production, it is caught like any other. The opposite
# EN:      side ("in production, not in the tag") is ALWAYS a mismatch: it means someone put it there
# EN:      by hand. The asymmetry silences one side, not both.
# RU:   7. НЕ ловит расхождение боя с ДЕРЕВОМ, если дерево не закоммичено: предмет сверки —
# RU:      метка, а не рабочее дерево.
# EN:   7. Does NOT catch production diverging from the TREE if the tree is not committed: the subject of comparison is
# EN:      the tag, not the working tree.
#
# RU: 🔴 КОГДА ОСТАНАВЛИВАЕТСЯ (числом, не словом «подождать»): ту же самую картину расхождения
# RU:   сторож отправляет в бот ОДИН раз, дальше молчит и пишет только в журнал, пока картина
# RU:   не изменится либо не пройдёт VYPUSK_NAPOMINAT секунд (по умолчанию 86400 = сутки).
# RU:   Основание: 12–17.09 сторож копии кричал ШЕСТЬ СУТОК об одном и том же и выгорел —
# RU:   кричащий всегда неотличим от сломанного, и его перестают читать.
# EN: 🔴 WHEN IT STOPS (by a number, not by the word "wait"): the guard sends the very same mismatch picture
# EN:   to the bot ONCE, then stays silent and writes only to the log until the picture
# EN:   changes or VYPUSK_NAPOMINAT seconds pass (default 86400 = one day).
# EN:   Reason: on 12–17.09 the backup guard shouted about the same thing for SIX DAYS and burned out —
# EN:   one that always shouts is indistinguishable from a broken one, and people stop reading it.
#
# RU: РЕЖИМ СЧЁТА (назван координатором 19.09, повторяется в выводе, чтобы числа не расходились):
# RU:   всё вне node_modules, БЕЗ *.bak*, БЕЗ *.tar, БЕЗ *.tgz
# EN: COUNTING MODE (named by the coordinator on 19.09, repeated in the output so that numbers do not diverge):
# EN:   everything outside node_modules, WITHOUT *.bak*, WITHOUT *.tar, WITHOUT *.tgz
#
# RU: Коды: 0 сошлось · 1 расхождение · 2 слепота (сверять нечем) · 3 ошибка вызова (любой довод).
# EN: Codes: 0 matched · 1 mismatch · 2 blindness (nothing to compare against) · 3 invocation error (any argument).
set -u
export LC_ALL=C.utf8
# RU: 🔴 Находка 26.09.2026 07:41Z: ДОВОДОВ У СТОРОЖА НЕТ — ЛЮБОЙ ДОВОД → ОТКАЗ, код 3.
# RU: Было: `vypusk-okno-watch.sh --bez-trevogi` молча проглатывал довод и шёл БОЕВЫМ режимом (с каналом тревог и
# RU: состоянием) — рука была уверена, что тихо. Образец — такая же проверка у сторожа плагинов агентов (agent-plugins):
# RU: проверка ДО любого чтения, отказ называет правильный путь. Код 3, а НЕ 2: у этого сторожа 2 — «слепота» (канал
# RU: тревог + отметка состояния); ошибка вызывающего — не слепота к предмету, и тревога о ней ложная. Режимы — только
# RU: окружением (ниже по коду).
# EN: 🔴 Finding of 26.09.2026 07:41Z: THE GUARD TAKES NO ARGUMENTS — ANY ARGUMENT → REFUSAL, code 3.
# EN: Before: `vypusk-okno-watch.sh --bez-trevogi` silently swallowed the argument and ran in LIVE mode (with the alert
# EN: channel and state) — the caller was sure it was quiet. Model — the same check in the agent plugins guard (agent-plugins):
# EN: check BEFORE any reading, the refusal names the right way. Code 3, NOT 2: for this guard 2 means "blindness" (alert
# EN: channel + state mark); a caller error is not blindness to the subject, and an alert about it would be false. Modes are
# EN: set only through the environment (further down in the code).
# RU: ⚠️ ЧЕГО НЕ ЛОВИТ: неверное ЗНАЧЕНИЕ окружения (VYPUSK_TIHO=да — не «1», режим боевой) и опечатку в ИМЕНИ
# RU:    необязательной переменной (VYPUSK_TIH0=1 — не прочитана вовсе). Опечатка в имени ОБЯЗАТЕЛЬНОЙ настройки
# RU:    ловится ниже — это слепота «не задана настройка».
# EN: ⚠️ WHAT IT DOES NOT CATCH: a wrong environment VALUE (VYPUSK_TIHO=да is not "1", the mode stays live) and a typo in the
# EN:    NAME of an optional variable (VYPUSK_TIH0=1 is not read at all). A typo in a REQUIRED setting's name is caught
# EN:    further down — it is blindness "setting not set".
AVTO_MONTAZH=0
if [ "$#" = 1 ] && [ "$1" = --avto-montazh ]; then AVTO_MONTAZH=1; shift; fi
if [ "$#" -gt 0 ]; then
  echo "ОТКАЗ: у сторожа нет доводов, получено: $*" >&2
  echo "Режимы задаются окружением: VYPUSK_TIHO=1 (без канала тревог) · VYPUSK_REPO · VYPUSK_KORNI · VYPUSK_INFO_KORNI ·" >&2
  echo "  VYPUSK_SOOTVETSTVIYA · VYPUSK_SOSTOYANIE · VYPUSK_ISKLYUCHENIYA · VYPUSK_NAPOMINAT · VYPUSK_ALERT · VYPUSK_SSYLKI ·" >&2
  echo "  VYPUSK_AGENT_KORNI · VYPUSK_AGENT_POISK · VYPUSK_RASKLADKA · VYPUSK_REESTR" >&2
  echo "Пример: VYPUSK_TIHO=1 $0. Ничего не сверено, тревог не было, состояние не тронуто." >&2
  exit 3
fi

# Shared strict comparison: adjacent in a source copy, canonical libexec after installation.
COPY_PRIBOR=$(dirname -- "$0")/copy-compare.sh
[ -x "$COPY_PRIBOR" ] || COPY_PRIBOR=/usr/local/libexec/dsh-vypusk-watch/copy-compare.sh
COPY_PRIBOR=${VYPUSK_COPY_PRIBOR-$COPY_PRIBOR}
MO_HELPER=${MONTAZH_OKNO_BIN:-/usr/local/sbin/montazh-okno}
MO_STARTED=0
[ "$AVTO_MONTAZH" = 0 ] || MO_STARTED=$("$MO_HELPER" vremya 2>/dev/null) || MO_STARTED=0
OTLOZHENNYE=(); IMENA_OTLOZHENNYE=(); MO_GENERATIONS=()
# Один разбор записи — только helper; каждый предмет должен быть адресно покрыт.
montazh_otlozhit() {
  [ "$AVTO_MONTAZH" = 1 ] || return 1
  local subject=$1 out code token config; shift
  local requirements=()
  for required in "$@"; do requirements+=(--require "$required"); done
  if [[ "$subject" == copy:* ]]; then
    config=$(python3 - "$REPO" "$SOOTVETSTVIYA" "$VREM/exceptions.json" "$REESTR" <<'PY_COPY_CONFIG'
import hashlib,json,pathlib,sys
print(hashlib.sha256(json.dumps(dict(repo=sys.argv[1],mapping=sys.argv[2],exceptions=json.loads(pathlib.Path(sys.argv[3]).read_text()),registry=sys.argv[4]),sort_keys=True,separators=(',', ':')).encode()).hexdigest())
PY_COPY_CONFIG
    ) || return 1
    requirements+=(--copy-policy "$SOSTAV_TOLKO" --copy-config-sha256 "$config" --copy-registry "$REESTR")
  fi
  out=$("$MO_HELPER" otlozheno --avto-montazh --since-ns "$MO_STARTED" --with-generation "${requirements[@]}" "$subject" 2>/dev/null); code=$?
    if [ "$code" = 6 ]; then
      if [ "${VYPUSK_MO_REREAD:-0}" = 0 ]; then
        export VYPUSK_MO_REREAD=1
        echo 'ПЕРЕСНИМАЮ: окно закрыто после начала проверки'
        exec bash "$0" --avto-montazh
      fi
      echo 'СЛЕПОТА: повторная смена предмета после пересъёма' >&2; exit 2
    fi
    [ "$code" = 4 ] && [[ "$out" == ОТЛОЖЕНО\ * ]] || return 1
  token=${out##*$'\n'}
  [[ "$token" =~ ^ПОКОЛЕНИЕ\ [0-9a-f]{64}$ ]] || return 1
  out=${out%$'\n'*}
  printf '%s\0' "${requirements[@]}" "$subject" > "$VREM/mo-query-${#OTLOZHENNYE[@]}"
  printf '%s\n' "$out"
  OTLOZHENNYE+=("$out"); MO_GENERATIONS+=("${token#ПОКОЛЕНИЕ }")
  return 0
}

REPO=${VYPUSK_REPO:-}
KORNI=${VYPUSK_KORNI:-}
ALERT=${VYPUSK_ALERT:-/usr/local/bin/agent-alert}
# RU: VYPUSK_TIHO=1 — не звать отправителя (для проб).
# EN: VYPUSK_TIHO=1 — do not call the sender (for probes).
TIHO=${VYPUSK_TIHO:-0}
SOST=${VYPUSK_SOSTOYANIE:-/var/lib/vypusk-okno-watch/poslednyaya.txt}
# RU: ЧИСЛОМ, а не словом: повтор той же тревоги — раз в сутки.
# EN: As a NUMBER, not a word: the same alert is repeated once a day.
NAPOMINAT=${VYPUSK_NAPOMINAT:-86400}
ISKLYUCHENIYA=${VYPUSK_ISKLYUCHENIYA:-$(dirname "$0")/vypusk-okno-watch.exceptions.list}
# RU: Корни копий и политика ответственности — разные данные.
# RU: Пустой VYPUSK_AGENT_KORNI отключает добавочную область для изолированных проб.
# EN: Roots of copies and the responsibility policy are different data.
# EN: An empty VYPUSK_AGENT_KORNI disables the additional area for isolated probes.
INFO_KORNI=${VYPUSK_INFO_KORNI-}
# RU: 26.09: СООТВЕТСТВИЯ «каталог дерева=боевой каталог» — для пакетов, чей бой живёт НЕ в корнях по имени.
# RU: Повод: каталог шлюза подписки — его версии 0.4.7–0.4.9 ушли в бой мимо дерева и меток, сторож печатал «вне области».
# RU: Сверка у такого пакета — ТОЛЬКО по составу публикации метки (files + package.json) в обе стороны: файл состава
# RU: ≠ бою или отсутствует в бою ⇒ разошлось; всё в бою ВНЕ состава — не считается (каталог шлюза — это ещё и
# RU: <дом-учётки> его службы: .npm, .claude, старые gateway.mjs.* — без этого сужения красное было бы вечным).
# EN: 26.09: MAPPINGS "tree directory=live directory" — for packages whose live copy does NOT sit in the roots by name.
# EN: Reason: the subscription gateway directory — its versions 0.4.7–0.4.9 went live bypassing the tree and tags, and the
# EN: guard printed "out of scope".
# EN: Such a package is compared ONLY by the tag's published contents (files + package.json), in both directions: a file of
# EN: the contents ≠ production or missing in production ⇒ mismatch; anything in production OUTSIDE the contents is not
# EN: counted (the gateway directory is also <account-home> of its service: .npm, .claude, old gateway.mjs.* — without this
# EN: narrowing the red would be permanent).
# RU: ⚠️ ЧЕГО НЕ ЛОВИТ: правку файлов боя вне состава (sdk-runtime/, старые копии) · пакет без "files" в метке — СЛЕПОТА.
# RU: Пары по одной на строку; пустое значение отключает (для изолированных проб).
# EN: ⚠️ WHAT IT DOES NOT CATCH: changes to production files outside the contents (sdk-runtime/, old copies) · a package
# EN: without "files" in the tag is BLINDNESS.
# EN: Pairs one per line; an empty value disables it (for isolated probes).
SOOTVETSTVIYA=${VYPUSK_SOOTVETSTVIYA-}
# RU: B-N-новые-пакеты: каталоги дерева без package.json, сверяемые по раскладке (через «:»); пустое — выключено.
#     VYPUSK_RASKLADKA_PRISTAVKA — ТОЛЬКО для стенда: приставка к путям диска (/usr/local, /etc/systemd/system).
RASKLADKA=${VYPUSK_RASKLADKA-}
PRISTAVKA=${VYPUSK_RASKLADKA_PRISTAVKA:-}
# RU: B-N-1767: реестр с записями derevo (plugins.yaml); пустое — выключено (тогда как 1.1.12), отсутствие — слепота.
REESTR=${VYPUSK_REESTR-}
REZHIM='вне node_modules, без *.bak* *.tar *.tgz'

# RU: Слепота — отдельный предмет, не расхождение пакета с меткой.
# RU: Читатель: человек в канале agent-alert; код 0 канала — его подтверждение, не прочтение человеком.
# RU: Одна попытка вызова за прогон, максимум KANAL_PREDEL_S (+KANAL_DOBIV_S до SIGKILL); внутренние повторы — договор agent-alert.
# EN: Blindness is a separate subject, not a mismatch of a package with its tag.
# EN: Reader: a human in the agent-alert channel; channel code 0 is its confirmation, not proof that a human read it.
# EN: One call attempt per run, at most KANAL_PREDEL_S (+KANAL_DOBIV_S until SIGKILL); internal retries are agent-alert's contract.
# RU: Предел задан ОДНОЙ записью — из неё и timeout, и строки исхода. Правило приёмки: применённый
# RU: порог стоит в записи рядом с исходом, иначе при смене числа старые журналы станут несравнимы молча.
# EN: The limit is set by ONE assignment — both timeout and the outcome lines take it from there. Acceptance rule: the applied
# EN: threshold stands in the record next to the outcome, otherwise when the number changes old logs silently become incomparable.
# RU: ⚠️ 90 с — число, предложенное исполнителем, ЗАМЕРОМ НЕ ОБОСНОВАНО. По чтению agent-alert (попыток 3, паузы 5+15,
# RU:    предел попытки 20) худший случай ≈ 3×20+5+15 = 80 с — это вывод из его чисел, не замер длительности.
# EN: ⚠️ 90 s is a number proposed by the implementer, NOT JUSTIFIED BY MEASUREMENT. From reading agent-alert (3 attempts, pauses 5+15,
# EN:    per-attempt limit 20) the worst case is ≈ 3×20+5+15 = 80 s — a conclusion from its numbers, not a measured duration.
KANAL_PREDEL_S=90; KANAL_DOBIV_S=5
# RU: При той же подтверждённой картине напоминание через NAPOMINAT; восстановление снимает отметку.
# RU: Состояние отдельно от расхождений. Если сохранить его нельзя, следующий прогон повторит тревогу.
# EN: For the same confirmed picture, a reminder after NAPOMINAT; recovery removes the mark.
# EN: The state is kept separately from mismatches. If it cannot be saved, the next run will repeat the alert.
slepota() {
  local reason="$1" message result code key now previous='' stamp=0 temp
  local state="${SOST}.slepota"
  echo "СЛЕПОТА: $reason"
  message="🔴 ВЫПУСК: СЛЕПОТА — проверка не состоялась. $reason
Дерево: $REPO
Корни боя: $KORNI
Годность выпуска НЕ установлена. Проверьте доступ и настройки сторожа."
  if [ "$TIHO" = 1 ]; then
    echo "    доставка слепоты пропущена: VYPUSK_TIHO=1"
    return
  fi
  key=$(printf '%s' "$message" | sha256sum | cut -c1-32); now=$(date +%s)
  if [ -r "$state" ]; then read -r previous stamp < "$state" || true; fi
  if [[ "$stamp" =~ ^[0-9]+$ && "$NAPOMINAT" =~ ^[0-9]+$ ]] &&
     [ "$previous" = "$key" ] && [ "$((now-stamp))" -ge 0 ] && [ "$((now-stamp))" -lt "$NAPOMINAT" ]; then
    echo "    повтор слепоты подавлен: канал ранее подтвердил доставку; возраст $((now-stamp)) с из $NAPOMINAT"
    return
  fi
  if [ ! -x "$ALERT" ]; then
    echo "    доставка слепоты НЕ подтверждена: отправитель недоступен: $ALERT"
    return
  fi
  # RU: agent-alert использует HTML: пути и причина должны оставаться текстом.
  # EN: agent-alert uses HTML: paths and the reason must stay plain text.
  message=${message//&/\&amp;}; message=${message//</\&lt;}; message=${message//>/\&gt;}
  result=$(timeout -k "${KANAL_DOBIV_S}s" "${KANAL_PREDEL_S}s" "$ALERT" "$message" 2>&1); code=$?
  if [ "$code" -ne 0 ]; then
    # RU: 124 — истёк предел (TERM), 137 — добит KILL после KANAL_DOBIV_S.
    # EN: 124 — the limit expired (TERM), 137 — finished off with KILL after KANAL_DOBIV_S.
    case "$code" in 124|137) code="$code (ИСТЁК предел канала)" ;; esac
    printf '    доставка слепоты НЕ подтверждена: канал код %s; предел канала %s+%s с; %s\n' \
      "$code" "$KANAL_PREDEL_S" "$KANAL_DOBIV_S" "$result"
    return
  fi
  echo "    канал подтвердил доставку слепоты (код 0) в пределе ${KANAL_PREDEL_S}+${KANAL_DOBIV_S} с; прочтение человеком не проверено"
  if mkdir -p "$(dirname "$state")" && temp=$(mktemp "${state}.XXXXXX"); then
    if ! (umask 077; printf '%s %s\n' "$key" "$now" > "$temp") || ! mv "$temp" "$state"; then
      rm -f "$temp"
      echo "    отметка доставки слепоты не сохранена — следующий прогон может повторить тревогу"
    fi
  else
    echo "    отметка доставки слепоты не сохранена — следующий прогон может повторить тревогу"
  fi
}

[ -n "$REPO" ] || { slepota "не задана настройка VYPUSK_REPO (дерево с метками)"; exit 2; }
# RU: Период напоминания — только число секунд: иначе сравнение в ветке расхождения падало с ошибкой оболочки
#     и тревога уходила на каждом прогоне.
# EN: The reminder period must be a number of seconds: otherwise the comparison in the mismatch branch failed
#     with a shell error and the alert went out on every run.
[[ "$NAPOMINAT" =~ ^[0-9]+$ ]] || { slepota "настройка VYPUSK_NAPOMINAT не число секунд: '$NAPOMINAT'"; exit 2; }
[ -n "$KORNI" ] || { slepota "не задана настройка VYPUSK_KORNI (корни боевых каталогов)"; exit 2; }
# RU: Настройки вида «пусто = выключено» обязаны быть заданы явно: пропавшая строка в файле настроек
#     иначе молча выключила бы проверку («ссылки монтажа: живых 0 из 0», код 0). Пустое значение — выключено,
#     отсутствие переменной — слепота. Корни копий агентов: нужна хотя бы одна из двух настроек.
# EN: "Empty = off" settings must be set explicitly: otherwise a line missing from the settings file would
#     silently disable the check ("install links: alive 0 of 0", exit 0). An empty value means off, a missing
#     variable means blindness. Agent copy roots: at least one of the two settings is required.
for v in VYPUSK_INFO_KORNI VYPUSK_SOOTVETSTVIYA VYPUSK_SSYLKI VYPUSK_RASKLADKA VYPUSK_REESTR; do
  [ -n "${!v+x}" ] || { slepota "не задана настройка $v (пустое значение — выключено; отсутствие — слепота)"; exit 2; }
done
[ -n "${VYPUSK_AGENT_KORNI+x}${VYPUSK_AGENT_POISK+x}" ] || { slepota "не задана ни VYPUSK_AGENT_KORNI, ни VYPUSK_AGENT_POISK (корни копий агентов)"; exit 2; }
[ -d "$REPO/.git" ] || { slepota "дерева нет: $REPO"; exit 2; }
declare -A RASK_SET=() RASK_NAJDENY=()
IFS=':' read -r -a RASK_LIST <<< "$RASKLADKA"
for r in "${RASK_LIST[@]}"; do
  [ -n "$r" ] || continue
  [[ "$r" =~ ^[A-Za-z0-9._-]+$ ]] || { slepota "VYPUSK_RASKLADKA: негодное имя каталога «$r»"; exit 2; }
  RASK_SET[$r]=1
done
# Повтор ключа не должен молча скрыть первую названную копию.
declare -A SOOTV_KEYS=()
while IFS= read -r para; do
  [ -n "$para" ] || continue
  key=${para%%=*}
  [ -n "$key" ] || { slepota "VYPUSK_SOOTVETSTVIYA: пустой ключ соответствия"; exit 2; }
  [ -z "${SOOTV_KEYS[$key]+x}" ] || { slepota "VYPUSK_SOOTVETSTVIYA: повтор ключа $key"; exit 2; }
  SOOTV_KEYS[$key]=1
done <<< "$SOOTVETSTVIYA"
[ -z "$PRISTAVKA" ] || echo "    ПОДМЕНА корней раскладки (стенд): $PRISTAVKA"
RASK_VSEGO=0; RASK_SOSHLOS=0; RASK_RAZ=0; RASK_SLEP=0

# RU: $1 — каталог; печатает "<сумма16> <путь>" по режиму счёта.
# EN: $1 — a directory; prints "<sum16> <path>" according to the counting mode.
summy() {
  ( cd "$1" 2>/dev/null || return 1
    find . -type f -not -path '*/node_modules/*' \
         -not -name '*.bak*' -not -name '*.tar' -not -name '*.tgz' 2>/dev/null \
    | sort | while read -r f; do
        if s=$(sha256sum "$f" 2>/dev/null); then s=${s:0:16}; else s=NECHITAEM; fi
        printf '%s %s\n' "$s" "$f"
      done )
}

# RU: B-N-1738: сумма состава копии — по её package.json ("files" + package.json; нет "files" — все файлы), без node_modules,
#     *.bak*/*.tar/*.tgz, в ссылки на каталоги не заходит (sdk-runtime шлюза). Нечитаемый файл входит строкой NECHITAEM.
# EN: B-N-1738: contents sum of a copy by its own package.json; no node_modules, no symlinked dirs.
otpechatok_sostava() {
  ${SUDO:-} python3 - "$1" <<'PY_SOSTAV_KOPII'
import hashlib, json, os, sys
d = sys.argv[1]
try: files = json.load(open(os.path.join(d, 'package.json'), encoding='utf-8')).get('files') or []
except (OSError, ValueError): print('NECHITAEM'); sys.exit(0)
sostav = [f.removeprefix('./').rstrip('/') for f in files] + ['package.json'] if files else None
h = hashlib.sha256()
for root, dirs, fs in os.walk(d):
    dirs[:] = sorted(x for x in dirs if x != 'node_modules')
    for f in sorted(fs):
        p = os.path.join(root, f); rel = os.path.relpath(p, d)
        if '.bak' in f or f.endswith(('.tar', '.tgz')): continue
        if sostav is not None and not any(rel == e or rel.startswith(e + '/') for e in sostav): continue
        try: h.update(rel.encode() + b'\0' + hashlib.sha256(open(p, 'rb').read()).digest())
        except OSError: h.update(rel.encode() + b'\0NECHITAEM')
print(h.hexdigest()[:16])
PY_SOSTAV_KOPII
}

VREM=$(mktemp -d /tmp/vypusk-okno-XXXXXX) || { slepota "нет временного места"; exit 2; }
trap 'rm -rf "$VREM"' EXIT

# RU: glob скрывает недоступных родителей; обходим их явно до поиска копий.
# RU: Отсутствующий plugins законен; отказ чтения родителя — непроверенная область.
# EN: A glob hides unreadable parents; we walk them explicitly before searching for copies.
# EN: A missing plugins directory is legitimate; a read refusal on a parent is an unchecked area.
if ! python3 - "$KORNI" "$VREM" <<'PY_ROOTS'
import os, sys
from pathlib import Path
bad = set()
roots = []
def entries(path):
    try:
        with os.scandir(path) as it: return list(it)
    except FileNotFoundError: return []
    except OSError:
        bad.add(str(path)); return []
def discover(parent):
    for e in entries(parent):
        try:
            if not e.is_dir(): continue
            # Нельзя проверять plugins через is_dir(): отказ станет False.
            for child in entries(e.path):
                if child.name == 'plugins':
                    if child.is_dir(follow_symlinks=True): roots.append(child.path)
                    else: print('INFO: не каталог plugins, пропущен: ' + child.path)
        except OSError: bad.add(e.path)
if 'VYPUSK_AGENT_KORNI' in os.environ:
    roots = [p for p in os.environ['VYPUSK_AGENT_KORNI'].split(':') if p]
else:
    for parent in [p for p in os.environ.get('VYPUSK_AGENT_POISK', '').split(':') if p]:
        discover(parent)
for root in dict.fromkeys([p for p in sys.argv[1].split(':') if p] + roots):
    entries(root)
    if os.path.isdir(root) and not os.access(root, os.R_OK | os.X_OK): bad.add(root)
out = Path(sys.argv[2])
(out/'agent-roots').write_bytes(b''.join(os.fsencode(p)+b'\0' for p in dict.fromkeys(roots)))
(out/'blind-roots').write_bytes(b''.join(os.fsencode(p)+b'\0' for p in sorted(bad)))
PY_ROOTS
then
  slepota "перечень корней не получен"; exit 2
fi
mapfile -d '' -t AGENT_KORNI < "$VREM/agent-roots"
mapfile -d '' -t NECHITAEMYE_KORNI < "$VREM/blind-roots"
echo "    нечитаемых корней ${#NECHITAEMYE_KORNI[@]}"
for k in "${NECHITAEMYE_KORNI[@]}"; do printf '    нечитаемый корень: %s\n' "$k"; done
if [ "${#NECHITAEMYE_KORNI[@]}" -gt 0 ]; then
  slepota "нечитаемых корней ${#NECHITAEMYE_KORNI[@]} — область поиска копий неполна"
  exit 2
fi

# RU: Один снимок исключений на прогон; повреждённый список не превращается в прощение.
# EN: One snapshot of exceptions per run; a damaged list does not turn into forgiveness.
if ! python3 - "$ISKLYUCHENIYA" "$VREM/exceptions.json" <<'PY_EXCEPTIONS'
import pathlib, json, sys, re, datetime
try:
    rows = pathlib.Path(sys.argv[1]).read_text().splitlines()
    data = {}
    for line in rows:
        if not line.strip() or line.lstrip().startswith('#'): continue
        parts = [x.strip() for x in line.split(' · ')]
        if len(parts) != 4 or not all(parts): raise ValueError('ожидаются пакет@версия · причина · кто · дата')
        key, reason, owner, date = parts
        name, sep, version = key.rpartition('@')
        if not sep or not name or not version or key in data: raise ValueError('негодный или повторный ключ')
        datetime.date.fromisoformat(date)
        data[key] = dict(reason=reason, owner=owner, date=date)
    pathlib.Path(sys.argv[2]).write_text(json.dumps(data, ensure_ascii=False))
except (OSError, UnicodeError, ValueError) as e:
    print('Исключения CHANGELOG не прочитаны: ' + str(e), file=sys.stderr)
    sys.exit(2)
PY_EXCEPTIONS
then
  slepota "исключения CHANGELOG не прочитаны: $ISKLYUCHENIYA"
  exit 2
fi
: > "$VREM/active-versions"

# RU: строки для тревоги
# EN: lines for the alert
RAZOSHLOS=()
# RU: сырые суммы расходящихся пакетов — основа отпечатка, см. ниже
# EN: raw checksums of mismatching packages — the basis of the fingerprint, see below
OTPECH_DANNYE=''
# RU: пакеты, которые сверить нечем
# EN: packages that there is nothing to compare against
SLEPOTA=()
# RU: пакеты дерева без каталога в настроенных корнях боя
# EN: tree packages without a directory in the configured live roots
VNE_OBLASTI=()
# RU: отдельная причина: package.json не найден
# EN: a separate reason: package.json not found
BEZ_MANIFESTA=()
EXPECTED=()
IMENA_INFO=()
IMENA_SOSHLOS=()
IMENA_RAZOSHLOS=()
IMENA_SLEPOTA=()
IMENA_VNE=()
SOSHLOS=0
VSEGO=0

# RU: Снимок каталогов ДО классификации, включая скрытые; пустой glob не является каталогом.
# EN: Snapshot of directories BEFORE classification, hidden ones included; an empty glob is not a directory.
shopt -s nullglob dotglob
KATALOGI=("$REPO"/packages/*/)
shopt -u nullglob dotglob
KATALOGOV=${#KATALOGI[@]}
# RU: Пустой Git-репозиторий допустим для Git, но не доказывает тождество пакетов.
# EN: An empty Git repository is valid for Git but proves nothing about package identity.
if [ "$KATALOGOV" -eq 0 ]; then
  slepota "каталогов пакетов 0 в $REPO/packages — предмет сверки отсутствует; проверьте путь, доступ и состав дерева"
  exit 2
fi
# RU: B-N-новые-пакеты: сверка пакета без манифеста по раскладке (правило — в шапке). Исход — одной строкой ISHOD.
proverit_raskladku() {
  local IDENT="$KATALOG@raskladka" vyvod ishod vid a b c d inoe net s
  EXPECTED+=("$IDENT"); VSEGO=$((VSEGO+1)); RASK_VSEGO=$((RASK_VSEGO+1))
  if [ "$(id -u)" = 0 ]; then SUDO=; elif sudo -n true 2>/dev/null; then SUDO=sudo; else SUDO=; fi
  if ! vyvod=$($SUDO python3 - "$REPO" "$KATALOG" "$PRISTAVKA" <<'PY_RASKLADKA'
import hashlib, io, re, subprocess, sys, tarfile
repo, kat, pre = sys.argv[1:4]
MAP = {'bin': '/usr/local/bin', 'sbin': '/usr/local/sbin', 'libexec': '/usr/local/libexec', 'lib': '/usr/local/lib',
       'systemd': '/etc/systemd/system'}
NE_STAVITSYA = {'README.md', 'CHANGELOG.md', 'LICENSE', 'docs', 'test'}
def out(*a): print('\t'.join(str(x) for x in a))
def git(*a):
    p = subprocess.run(['git', '-C', repo, *a], capture_output=True)
    if p.returncode: raise RuntimeError('git ' + ' '.join(a[:2]) + ': ' + p.stderr.decode(errors='replace').strip()[:160])
    return p.stdout
def sostav(tag):
    tf = tarfile.open(fileobj=io.BytesIO(git('archive', tag, 'packages/' + kat)))
    ozh = {}
    for m in tf.getmembers():
        if m.isdir(): continue
        rel = m.name.split('/', 2)[2] if m.name.count('/') >= 2 else ''
        top = rel.split('/', 1)[0]
        if top in NE_STAVITSYA: continue
        if top not in MAP or '/' not in rel:
            raise ValueError(f'в метке {tag} файл «{rel}» — куда ставится, не знаю (верх «{top}»)')
        if not m.isfile(): raise ValueError(f'в метке {tag} «{rel}» не обычный файл (ссылка?) — по раскладке не сверяю')
        ozh[pre + MAP[top] + '/' + rel.split('/', 1)[1]] = hashlib.sha256(tf.extractfile(m).read()).hexdigest()[:16]
    if not ozh: raise ValueError(f'в метке {tag} нет устанавливаемых файлов')
    return ozh
def disk(p):
    try: return hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]
    except FileNotFoundError: return 'NET'
    except OSError: return 'NECHITAEM'
try:
    rx = re.compile(re.escape(kat) + r'-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)')
    vt = sorted(((tuple(map(int, m.groups())), t) for t in git('tag', '--list').decode().split() if (m := rx.fullmatch(t))), reverse=True)
    if not vt: out('ISHOD', 'SLEPOTA', f'меток {kat}-vX.Y.Z нет — сверять не с чем'); sys.exit(0)
    nov = vt[0][1]; ozh = sostav(nov)
except (RuntimeError, ValueError, tarfile.TarError) as e:
    out('ISHOD', 'SLEPOTA', str(e)); sys.exit(0)
boi = {p: disk(p) for p in ozh}
bad = [p for p, v in boi.items() if v == 'NECHITAEM']
if bad: out('ISHOD', 'SLEPOTA', 'не читается: ' + ' '.join(bad)); sys.exit(0)
for p in sorted(boi): out('OTP', p, boi[p])
ok = sum(boi[p] == ozh[p] for p in ozh)
if ok == len(ozh): out('ISHOD', 'SOSHLOS', nov, len(ozh), ok); sys.exit(0)
for _, t in vt[1:]:
    try: st = sostav(t)
    except (RuntimeError, ValueError, tarfile.TarError): continue
    if all(disk(p) == h for p, h in st.items()) and all(boi[p] == 'NET' for p in set(ozh) - set(st)):
        out('ISHOD', 'ZHDET', t, len(st), nov); sys.exit(0)
for p in sorted(ozh):
    if boi[p] != ozh[p]: out('DIFF', p, ozh[p], boi[p])
out('ISHOD', 'RAZOSHLOS', nov, len(ozh), ok)
PY_RASKLADKA
  ); then vyvod=$'ISHOD\tSLEPOTA\tсверка по раскладке не исполнилась'; fi
  ishod=$(printf '%s\n' "$vyvod" | grep -m1 $'^ISHOD\t')
  IFS=$'\t' read -r _ vid a b c d <<< "$ishod"
  case "$vid" in
    SOSHLOS|ZHDET)
      SOSHLOS=$((SOSHLOS+1)); RASK_SOSHLOS=$((RASK_SOSHLOS+1)); IMENA_SOSHLOS+=("$IDENT")
      if [ "$vid" = SOSHLOS ]; then echo "сошлось: $KATALOG [раскладка, без манифеста] — $c из $b файлов, метка $a"
      else echo "сошлось: $KATALOG [раскладка, без манифеста] — $b из $b файлов, метка $a"
           echo "INFO: $KATALOG [раскладка]: выпуск $c новее боя (бой = $a) — не смонтирован"; fi ;;
    RAZOSHLOS)
      inoe=$(printf '%s\n' "$vyvod" | awk -F'\t' '$1=="DIFF" && $4!="NET"{print $2}' | head -6 | tr '\n' ' ')
      net=$(printf '%s\n' "$vyvod" | awk -F'\t' '$1=="DIFF" && $4=="NET"{print $2}' | head -6 | tr '\n' ' ')
      s="🔴 $KATALOG [раскладка, без манифеста]: совпало $c из $b с меткой $a"
      [ -n "$inoe" ] && s="$s
    иные суммы: $inoe"
      [ -n "$net" ] && s="$s
    нет на диске: $net"
      RAZOSHLOS+=("$s"); IMENA_RAZOSHLOS+=("$IDENT"); RASK_RAZ=$((RASK_RAZ+1))
      OTPECH_DANNYE="$OTPECH_DANNYE$KATALOG@raskladka:$(printf '%s\n' "$vyvod" | grep $'^OTP\t')
" ;;
    *)
      IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$KATALOG: ${a:-сверка по раскладке не дала исхода}"); RASK_SLEP=$((RASK_SLEP+1)) ;;
  esac
}
# RU: B-N-1767: записи derevo реестра — разбор и сверка одним проходом (правило — в шапке). Строки:
#     ZAP кат id ref файлов · SLEP кат текст · DIFF кат текст · INFO кат текст · OTP кат путь сумма режим владелец ·
#     ZSLEP id текст (запись без годного subdir) · GLOB текст (реестр не прочитан — слепота всего прогона).
declare -A DER_ID=() DER_NAJDENY=()
DER_VYVOD=''; DER_VSEGO=0; DER_SOSHLOS=0; DER_RAZ=0; DER_SLEP=0
if [ -n "$REESTR" ]; then
  if [ "$(id -u)" = 0 ]; then SUDO=; elif sudo -n true 2>/dev/null; then SUDO=sudo; else SUDO=; fi
  DER_VYVOD=$($SUDO python3 - "$REESTR" "$REPO" <<'PY_DEREVO'
import grp, hashlib, json, os, pwd, re, stat, subprocess, sys
reestr, repo = sys.argv[1:3]
def out(*a): print('\t'.join(str(x).replace('\t', ' ').replace('\n', ' ') for x in a))
try:
    import yaml
    d = yaml.load(open(reestr, encoding='utf-8'), Loader=getattr(yaml, 'CSafeLoader', yaml.SafeLoader))
    zap = [e for sec in ('plugins', 'services') for e in ((d or {}).get(sec) or []) if isinstance(e, dict) and 'derevo' in e]
except Exception as e:
    out('GLOB', f'реестр {reestr} не прочитан: {type(e).__name__}: {str(e)[:160]}'); sys.exit(0)
def git(*a):
    p = subprocess.run(['git', '-C', repo, *a], capture_output=True)
    if p.returncode: raise RuntimeError('git ' + ' '.join(a[:2]) + ': ' + p.stderr.decode(errors='replace').strip()[:160])
    return p.stdout
def sha(b): return hashlib.sha256(b).hexdigest()[:16]
try: tegi = set(git('tag', '--list').decode().split())
except RuntimeError as e: out('GLOB', str(e)); sys.exit(0)
vid = {}
# B-N-2033 (14.10.2026, Аврора): на один каталог бывает несколько записей (socseti и socseti-anna — один пакет на двух местах).
# Единица — запись (id), не каталог: у каталога с ОДНОЙ записью ключ строк — сам каталог (вывод побайтно прежний: его читает и
# montazh-okno на реестре из одной записи), у каталога с несколькими — «каталог#id» («#» в имени каталога образец не пускает).
na_kat = {}
for e in zap:
    dv = e['derevo']; m = re.fullmatch(r'packages/([A-Za-z0-9._-]+)/?', str(dv.get('subdir') or '') if isinstance(dv, dict) else '')
    if m: na_kat[m.group(1)] = na_kat.get(m.group(1), 0) + 1
for e in zap:
    pid, dv = e.get('id', '?'), e['derevo']
    sub = str(dv.get('subdir') or '') if isinstance(dv, dict) else ''
    m = re.fullmatch(r'packages/([A-Za-z0-9._-]+)/?', sub)
    if not m: out('ZSLEP', pid, f'derevo: subdir «{sub}» не вида packages/<каталог>'); continue
    kat, sub = m.group(1), sub.rstrip('/')
    if na_kat[kat] > 1: kat = f'{kat}#{pid}'
    if kat in vid: out('SLEP', kat, f'две записи derevo на один каталог: {vid[kat]} и {pid}'); continue
    vid[kat] = pid; ref = str(dv.get('ref') or ''); files = dv.get('files') or []
    out('ZAP', kat, pid, ref, len(files))
    if ref not in tegi: out('SLEP', kat, f'метки {ref or "(ref пуст)"} в дереве нет'); continue
    try:
        v_metke = {p[len(sub) + 1:] for p in git('ls-tree', '-r', '--name-only', ref, '--', sub).decode().splitlines()}
        sub_m = sub   # A-N-1948: subdir уже новый, ref ещё старый — метка несёт пакет под прежним каталогом (dsh.prezhnie_imena дерева)
        if not v_metke:
            try:
                dd = json.load(open(os.path.join(repo, sub, 'package.json'), encoding='utf-8')).get('dsh', {})
            except FileNotFoundError: dd = {}
            except (OSError, ValueError, AttributeError) as x: out('SLEP', kat, f'package.json дерева не прочитан для prezhnie_imena ({type(x).__name__})'); continue
            pr = dd.get('prezhnie_imena', []) if isinstance(dd, dict) else None
            if not isinstance(pr, list) or len(pr) > 16 or not all(isinstance(x, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', x) for x in pr):
                out('SLEP', kat, 'поле dsh.prezhnie_imena кривое (нужен список имён [A-Za-z0-9._-], не больше 16)'); continue
            for x in pr:
                alt = 'packages/' + x
                v_metke = {p[len(alt) + 1:] for p in git('ls-tree', '-r', '--name-only', ref, '--', alt).decode().splitlines()}
                if v_metke: sub_m = alt; out('INFO', kat, f'метка {ref} несёт прежний каталог {alt} (dsh.prezhnie_imena)'); break
        if not v_metke: out('SLEP', kat, f'в метке {ref} нет {sub}/'); continue
        if not all(isinstance(f, dict) and all(k in f for k in ('local', 'remote', 'mode', 'owner')) for f in files):
            out('SLEP', kat, 'строка files без local/remote/mode/owner'); continue
        # B-N-2033 (14.10.2026, Аврора): словарь по remote молча оставлял ПОСЛЕДНЕЕ из мест с одним remote — первое выпадало из
        # сверки без слова. Ворота (vypusk-tegom) и montazh-okno такую запись отвергают; здесь — слепота записи с именем и путями.
        povt = {}
        for f in files: povt.setdefault(str(f['remote']), []).append(str(f['local']))
        dubli = sorted((r, l) for r, l in povt.items() if len(l) > 1)
        for r, l in dubli: out('SLEP', kat, f'запись {pid}: files.remote «{r}» повторён в {len(l)} местах ({", ".join(l)}) — какое сверять, не выбираю')
        if dubli: continue
        rem = {str(f['remote']): f for f in files}
        ni = [str(x) for x in dv.get('not_installed') or []]
        def pokryt(r, x): return r == x or (x.endswith('/') and r.startswith(x))
        for r in sorted(v_metke - set(rem)):
            if not any(pokryt(r, x) for x in ni): out('SLEP', kat, f'файл метки «{r}» не в files и не в not_installed — запись отстала от метки')
        for r in sorted(set(rem) - v_metke): out('SLEP', kat, f'files.remote «{r}» нет в метке {ref}')
        for x in ni:
            if not any(pokryt(r, x) for r in v_metke): out('SLEP', kat, f'not_installed «{x}» нет в метке {ref}')
        ozh = {str(x) for x in dv.get('expected_diff_files') or []}
        for r in sorted(ozh - set(rem)): out('SLEP', kat, f'expected_diff_files «{r}» нет в files')
        prich = dv.get('expected_diff_reason') or 'причина не названа'
        for r, f in sorted(rem.items()):
            if r not in v_metke: continue
            loc = str(f['local'])
            try:
                st = os.lstat(loc)
                if not stat.S_ISREG(st.st_mode): out('DIFF', kat, f'не обычный файл: {loc}'); continue
                b = sha(open(loc, 'rb').read())
            except FileNotFoundError: out('DIFF', kat, f'нет на диске: {loc}'); continue
            except OSError as x: out('SLEP', kat, f'не читается: {loc} ({x.strerror})'); continue
            a = sha(git('show', f'{ref}:{sub_m}/{r}'))
            mo = '%04o' % stat.S_IMODE(st.st_mode)
            try: ow = pwd.getpwuid(st.st_uid).pw_name + ':' + grp.getgrgid(st.st_gid).gr_name
            except KeyError: ow = f'{st.st_uid}:{st.st_gid}'
            out('OTP', kat, loc, b, mo, ow)
            if a != b:
                if r in ozh: out('INFO', kat, f'{loc}: метка {a} ≠ бой {b} — прощено expected_diff_files ({prich})')
                else: out('DIFF', kat, f'иные суммы: {loc} (метка {a}, бой {b})', 'consistency', loc)
            elif r in ozh: out('INFO', kat, f'{loc}: в expected_diff_files, но бой = метке — прощение лишнее')
            if str(f['mode']) != mo: out('DIFF', kat, f'режим: {loc} {mo}, в записи {f["mode"]}')
            if str(f['owner']) != ow: out('DIFF', kat, f'владелец: {loc} {ow}, в записи {f["owner"]}')
        for l in dv.get('links') or []:
            loc, cel = str(l.get('local')), str(l.get('target'))
            if not os.path.islink(loc): out('DIFF', kat, f'ссылки нет: {loc} (ждём → {cel})')
            elif os.readlink(loc) != cel: out('DIFF', kat, f'ссылка не туда: {loc} → {os.readlink(loc)} (ждём {cel})')
        mr = re.fullmatch(r'(.+)-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', ref)
        if mr:
            cur = tuple(map(int, mr.groups()[1:]))
            rx = re.compile(re.escape(mr.group(1)) + r'-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)')
            novee = sorted(t for t in tegi if (n := rx.fullmatch(t)) and tuple(map(int, n.groups())) > cur)
            if novee: out('INFO', kat, f'в дереве метка новее записанной {ref}: {" ".join(novee)} — запись или монтаж отстали')
    except RuntimeError as x: out('SLEP', kat, str(x))
PY_DEREVO
  ) || { slepota "VYPUSK_REESTR: сверка записей derevo не исполнилась ($REESTR)"; exit 2; }
  der_glob=$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' '$1=="GLOB"{print $2}' | head -3 | tr '\n' ' ')
  [ -z "$der_glob" ] || { slepota "VYPUSK_REESTR: $der_glob"; exit 2; }
  while IFS=$'\t' read -r t k i _; do [ "$t" = ZAP ] && DER_ID[$k]=$i; done <<< "$DER_VYVOD"
  while IFS=$'\t' read -r t i txt; do
    [ "$t" = ZSLEP ] || continue
    EXPECTED+=("derevo:$i"); IMENA_SLEPOTA+=("derevo:$i"); DER_VSEGO=$((DER_VSEGO+1)); DER_SLEP=$((DER_SLEP+1))
    SLEPOTA+=("запись реестра $i: $txt")
  done <<< "$DER_VYVOD"
fi
# RU: Исход каталога с записью derevo. Одна строка SLEPOTA на каталог (охват считает их поштучно).
proverit_derevo() {   # $1 — ключ записи: каталог либо «каталог#id» (B-N-2033)
  local K="${1:-$KATALOG}"; local IDENT="$K@derevo" t k ref n sl dif s
  EXPECTED+=("$IDENT"); VSEGO=$((VSEGO+1)); DER_VSEGO=$((DER_VSEGO+1)); DER_NAJDENY[$K]=1
  IFS=$'\t' read -r t k _ ref n <<< "$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="ZAP" && $2==k' | head -1)"
  sl=$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="SLEP" && $2==k{print $3}')
  dif=$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="DIFF" && $2==k{print $3}')
  printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="INFO" && $2==k{print "INFO: " k " [derevo]: " $3}'
  if [ -n "$sl" ]; then
    IMENA_SLEPOTA+=("$IDENT"); DER_SLEP=$((DER_SLEP+1))
    SLEPOTA+=("${K%%#*} [derevo, запись ${DER_ID[$K]}]: $(printf '%s\n' "$sl" | head -4 | paste -sd ';' -)")
  elif [ -n "$dif" ]; then
    local mo_strict mo_loc; local mo_subjects=("entry:${DER_ID[$K]}")
    mo_strict=$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="DIFF" && $2==k && $4!="consistency"{print $3}')
    while IFS= read -r mo_loc; do [ -z "$mo_loc" ] || mo_subjects+=("file:$mo_loc"); done < <(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="DIFF" && $2==k && $4=="consistency"{print $5}')
    if [ -z "$mo_strict" ] && [ "${#mo_subjects[@]}" -gt 1 ] && montazh_otlozhit "${mo_subjects[@]}"; then
      IMENA_OTLOZHENNYE+=("$IDENT"); return
    fi
    s="🔴 ${K%%#*} [derevo, запись ${DER_ID[$K]}]: метка $ref, файлов $n — расхождений $(printf '%s\n' "$dif" | wc -l)"
    while IFS= read -r t; do s="$s
    $t"; done <<< "$(printf '%s\n' "$dif" | head -8)"
    RAZOSHLOS+=("$s"); IMENA_RAZOSHLOS+=("$IDENT"); DER_RAZ=$((DER_RAZ+1))
    OTPECH_DANNYE="$OTPECH_DANNYE$K@derevo:$(printf '%s\n' "$DER_VYVOD" | awk -F'\t' -v k="$K" '$1=="OTP" && $2==k')
"
  else
    SOSHLOS=$((SOSHLOS+1)); DER_SOSHLOS=$((DER_SOSHLOS+1)); IMENA_SOSHLOS+=("$IDENT")
    echo "сошлось: ${K%%#*} [derevo, запись ${DER_ID[$K]}] — $n из $n файлов, метка $ref"
  fi
}
for PK in "${KATALOGI[@]}"; do
  PK=${PK%/}; KATALOG=$(basename "$PK")
  DER_KLYUCHI=(); [ -n "${DER_ID[$KATALOG]+x}" ] && DER_KLYUCHI+=("$KATALOG")
  while IFS= read -r dk; do [ -n "$dk" ] && DER_KLYUCHI+=("$dk"); done < <(for dk in "${!DER_ID[@]}"; do [[ "$dk" == "$KATALOG#"* ]] && printf '%s\n' "$dk"; done | LC_ALL=C sort)
  if [ "${#DER_KLYUCHI[@]}" -gt 0 ]; then
    if [ -n "${RASK_SET[$KATALOG]+x}" ]; then
      RASK_NAJDENY[$KATALOG]=1
      echo "INFO: $KATALOG: назван в VYPUSK_RASKLADKA, но сверён по записи derevo — из перечня раскладки можно убрать"
    fi
    for dk in "${DER_KLYUCHI[@]}"; do proverit_derevo "$dk"; done; continue
  fi
  if [ -n "${RASK_SET[$KATALOG]+x}" ]; then
    RASK_NAJDENY[$KATALOG]=1
    if [ -f "$PK/package.json" ]; then
      EXPECTED+=("$KATALOG@raskladka"); IMENA_SLEPOTA+=("$KATALOG@raskladka"); RASK_VSEGO=$((RASK_VSEGO+1)); RASK_SLEP=$((RASK_SLEP+1))
      SLEPOTA+=("$KATALOG: назван в VYPUSK_RASKLADKA, но у него есть package.json — по раскладке сверяются только пакеты без манифеста")
      continue
    fi
    proverit_raskladku; continue
  fi
  [ -f "$PK/package.json" ] || { EXPECTED+=("$KATALOG"); BEZ_MANIFESTA+=("$KATALOG"); continue; }
  IMYA=$(jq -r '.name // empty' "$PK/package.json" 2>/dev/null)
  [ -n "$IMYA" ] || { EXPECTED+=("$KATALOG"); IMENA_SLEPOTA+=("$KATALOG"); SLEPOTA+=("$KATALOG: имя пакета не прочиталось"); continue; }
  [[ "$IMYA" =~ ^(@[A-Za-z0-9][A-Za-z0-9._-]*/)?[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
    EXPECTED+=("$KATALOG"); IMENA_SLEPOTA+=("$KATALOG"); SLEPOTA+=("$KATALOG: негодное имя пакета — $IMYA"); continue;
  }
  # RU: A-N-1948 шаг 0 (решение Забавы Р2): прежние имена пакета — package.json "dsh":{"prezhnie_imena":[…]}. После переименования
  #     каталога/имени метка версии боя, ключ VYPUSK_SOOTVETSTVIYA и каталог в метке остаются под прежним именем до первого выпуска
  #     под новым. Поле необязательно; кривое (dsh не объект, не список, имя не [A-Za-z0-9._-], больше 16) — слепота пакета.
  # EN: A-N-1948 step 0: former package names — package.json "dsh":{"prezhnie_imena":[…]}; optional; malformed — blindness of the package.
  if ! PREZHNIE=$(jq -r 'if has("dsh")|not then empty elif (.dsh|type)!="object" then error("dsh") elif (.dsh|has("prezhnie_imena"))|not then empty
      else (.dsh.prezhnie_imena | if type=="array" and length<=16 and all(.[]; type=="string" and test("^[A-Za-z0-9][A-Za-z0-9._-]*$")) then .[] else error("prezhnie") end) end' \
      "$PK/package.json" 2>/dev/null); then
    EXPECTED+=("$KATALOG"); IMENA_SLEPOTA+=("$KATALOG"); SLEPOTA+=("$KATALOG: поле dsh.prezhnie_imena кривое (нужен список имён [A-Za-z0-9._-], не больше 16)"); continue
  fi

  BOI_LIST=(); declare -A SEEN=()
  SOSTAV_TOLKO=0; SOOTV_PUT=''; SOOTV_NAJDENO=0
  while IFS= read -r para; do
    [ -n "$para" ] || continue
    for x in "$KATALOG" "$IMYA" $PREZHNIE; do
      [ "${para%%=*}" = "$x" ] && { SOOTV_PUT=${para#*=}; SOOTV_NAJDENO=$((SOOTV_NAJDENO+1)); break; }
    done
    if [ "$SOOTV_NAJDENO" -gt 1 ]; then
      EXPECTED+=("$KATALOG"); IMENA_SLEPOTA+=("$KATALOG"); SLEPOTA+=("$KATALOG: повтор соответствия пакету через имя/прежнее имя; все пути нужны в одной паре"); continue 2
    fi
  done <<< "$SOOTVETSTVIYA"
  if [ -n "$SOOTV_PUT" ]; then
    # RU: B-N-1738: путей у пакета может быть несколько через «:» (шлюз — /opt/claude-oauth и гостевая копия); каждая копия —
    #     своя единица сверки и своя строка исхода; названный путь без каталога — слепота ЭТОЙ копии, прочие сверяются.
    # EN: B-N-1738: several ':'-separated paths per package; each copy is its own unit; a named path without a directory is
    #     blindness of THAT copy, the others are still compared.
    IFS=':' read -r -a SOOTV_PUTI <<< "$SOOTV_PUT"
    for sp in "${SOOTV_PUTI[@]}"; do
      [ -n "$sp" ] || continue
      if [ -d "$sp" ]; then BOI_LIST+=("$sp")
      else EXPECTED+=("$KATALOG@$sp"); IMENA_SLEPOTA+=("$KATALOG@$sp"); SLEPOTA+=("$KATALOG: соответствие названо ($sp), каталога нет"); fi
    done
    [ "${#BOI_LIST[@]}" -gt 0 ] || continue
    SOSTAV_TOLKO=1; KK=()
  else
    IFS=':' read -r -a KK <<< "$KORNI"
  fi
  for k in "${KK[@]}" "${AGENT_KORNI[@]}"; do
    [ "$SOSTAV_TOLKO" = 1 ] && break
    [ -n "$k" ] || continue
    if [ -d "$k/$IMYA" ]; then
      real=$(readlink -f -- "$k/$IMYA")
      [ -n "$real" ] || { slepota "не разрешён путь $k/$IMYA"; exit 2; }
      if [ ! "${SEEN[$real]+x}" ]; then BOI_LIST+=("$k/$IMYA"); SEEN[$real]=1; fi
    fi
  done
  if [ "${#BOI_LIST[@]}" -eq 0 ]; then
    EXPECTED+=("$KATALOG"); IMENA_VNE+=("$KATALOG"); VNE_OBLASTI+=("$IMYA (каталог $KATALOG)"); continue
  fi
  : > "$VREM/copies"
  proverit_kopiyu() {

  VSEGO=$((VSEGO+1))
  # RU: 25.09: под root sudo не звать — юнит User=root, а каждый sha256sum/cat/find через sudo давал ~61 тыс. вызовов/сутки.
  # EN: 25.09: do not call sudo under root — the unit is User=root, and every sha256sum/cat/find via sudo gave ~61k calls/day.
  if [ "$(id -u)" = 0 ]; then SUDO=; elif sudo -n true 2>/dev/null; then SUDO=sudo; else SUDO=; fi
  VB=$($SUDO cat "$BOI/package.json" 2>/dev/null | jq -r '.version // "?"' 2>/dev/null)
  printf '%s\n' "$IMYA@$VB" >> "$VREM/active-versions"

  # RU: Договор (а): точная версия боя, оба префикса; никакого отката к последней.
  # EN: Contract (a): the exact live version, both prefixes; no fallback to the latest one.
  if ! TAGS=$(git -C "$REPO" tag --list 2>"$VREM/git-error"); then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: перечень меток не прочитан: $(head -c 240 "$VREM/git-error" | head -1)"); return
  fi
  if [ -z "$VB" ] || [ "$VB" = '?' ]; then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: версия боя не прочитана ($BOI)"); return
  fi
  METKI=(); VERSIONS=()
  # RU: A-N-1948: префиксы — каталог, имя и прежние имена; метка учитывается один раз (break), даже если префиксы совпали.
  while IFS= read -r tag; do
    for x in "$KATALOG" "$IMYA" $PREZHNIE; do
      case "$tag" in "$x"-v[0-9]*)
        [ "$tag" = "$x-v$VB" ] && METKI+=("$tag")
        VERSIONS+=("${tag##*-v}")
        break ;;
      esac
    done
  done <<< "$TAGS"
  # RU: INFO сравнивает SemVer: prerelease не новее стабильного выпуска той же версии.
  # EN: INFO compares SemVer: a prerelease is not newer than the stable release of the same version.
  RELEASE_ORDER=$(python3 - "$VB" "${VERSIONS[@]}" <<'PY_NEWER'
import re, sys
def key(v):
    m=re.fullmatch(r'(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:[+]([0-9A-Za-z.-]+))?',v)
    if not m: return None
    pre=m[4]
    if any(not x for part in [pre,m[5]] if part is not None for x in part.split('.')): return None
    ids=[]
    for x in (pre or '').split('.') if pre else []:
        if x.isdigit() and len(x)>1 and x[0]=='0': return None
        ids.append((0,int(x)) if x.isdigit() else (1,x))
    return tuple(map(int,m.group(1,2,3)))+(pre is None,tuple(ids))
latest=sys.argv[1]; best=key(latest)
for v in sys.argv[2:]:
    k=key(v)
    if best is not None and k is not None and k>best: latest,best=v,k
known=[v for v in sys.argv[2:] if key(v) is not None]
last=max(known,key=key) if known else "не определён (не SemVer)"
print(latest+"\t"+last)
PY_NEWER
  )
  NEWEST=${RELEASE_ORDER%%$'\t'*}; LAST_RELEASE=${RELEASE_ORDER#*$'\t'}
  if [ "$NEWEST" != "$VB" ]; then echo "INFO: $IMYA [копия $BOI]: выпуск $NEWEST новее боя $VB"; fi
  # RU: Договор (в): известные выпуски есть, но установленная версия не выпущена — расхождение боя.
  # EN: Contract (c): known releases exist, but the installed version was never released — a production mismatch.
  if [ "${#METKI[@]}" -eq 0 ] && [ "${#VERSIONS[@]}" -gt 0 ]; then
    # RU: B-N-1738: в отпечаток — сумма СОСТАВА копии: новая правка той же рабочей версии (номер не сменился) — новая картина,
    #     прежде она глушилась сутки как «та же».
    # EN: B-N-1738: the fingerprint includes the copy's CONTENTS sum: a new edit under the same working version is a new picture.
    # Отсутствующая метка — отдельный предмет; copy/package.json привязывает окно к этой копии.
    for x in "$KATALOG" "$IMYA" $PREZHNIE; do
      if [ "$INFO" = 0 ] && montazh_otlozhit "copy:$REPO:packages/$KATALOG:$BOI" "file:$BOI/package.json" "tag:$REPO:$x-v$VB"; then
        IMENA_OTLOZHENNYE+=("$IDENT"); return
      fi
    done
    SOSTAV_KOPII=$(otpechatok_sostava "$BOI")
    RAZOSHLOS+=("🔴 $IMYA [копия $BOI]: смонтировано невыпущенное: бой=$VB, своей метки нет; последний выпуск $LAST_RELEASE; состав $SOSTAV_KOPII")
    IMENA_RAZOSHLOS+=("$IDENT")
    OTPECH_DANNYE="$OTPECH_DANNYE$IMYA@$BOI:unreleased:$VB:$LAST_RELEASE:$SOSTAV_KOPII
"
    return
  fi
  if [ "${#METKI[@]}" -ne 1 ]; then
    IMENA_SLEPOTA+=("$IDENT")
    SLEPOTA+=("$IMYA: меток версии боя $VB найдено ${#METKI[@]}, нужна ровно одна (${METKI[*]:-нет}); бой: $BOI")
    return
  fi
  METKA=${METKI[0]}

  rm -rf "$VREM/m"; mkdir -p "$VREM/m"
  # RU: A-N-1948: метка до переименования несёт пакет под прежним каталогом — берём первый из (каталог, имя, прежние), что в ней есть.
  KAT_M=$KATALOG
  for x in "$KATALOG" "$IMYA" $PREZHNIE; do git -C "$REPO" cat-file -e "$METKA:packages/$x" 2>/dev/null && { KAT_M=$x; break; }; done
  [ "$KAT_M" = "$KATALOG" ] || echo "INFO: $IMYA [копия $BOI]: метка $METKA несёт прежний каталог packages/$KAT_M"
  if ! git -C "$REPO" archive "$METKA" "packages/$KAT_M" >"$VREM/archive.tar" 2>"$VREM/git-error"; then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: метка $METKA не выгрузилась: $(head -c 240 "$VREM/git-error" | head -1)"); return
  fi
  tar x -C "$VREM/m" -f "$VREM/archive.tar" 2>/dev/null
  MK="$VREM/m/packages/$KAT_M"
  [ -d "$MK" ] || { IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: метка $METKA не выгрузилась"); return; }

  # Shared engine produces data only; the watcher preserves the historic diagnostics/fingerprint below.
  if [ ! -x "$COPY_PRIBOR" ]; then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: общий прибор копии недоступен (бой: $BOI)"); return
  fi
  COPY_RESULT="$VREM/copy-result.json"
  $SUDO bash -- "$COPY_PRIBOR" --source "$MK" --copy "$BOI" --name "$IMYA" --version "$VB" \
    --published-only "$SOSTAV_TOLKO" --exceptions "$VREM/exceptions.json" --tag "$METKA" > "$COPY_RESULT"
  COPY_CODE=$?
  if ! python3 - "$COPY_RESULT" "$COPY_CODE" "$VB" <<'PY_COPY_RESULT'
import hashlib,json,pathlib,sys
try:
    value=json.loads(pathlib.Path(sys.argv[1]).read_text())
    code=int(sys.argv[2])
    if value.get('status')=='blind':
        assert code==2 and isinstance(value.get('reason'),str)
    else:
        counts={'matched','total','source_count','copy_count'}
        strings={'source_version','outside_source','outside_copy_count','different','only_copy','only_source','changelog_bad','copy_sums','copy_index_sha256'}
        assert set(value)==counts|strings|{'status'}
        assert all(type(value[k]) is int and value[k]>=0 for k in counts)
        assert all(isinstance(value[k],str) for k in strings)
        assert value['copy_count']>0 and value['matched']<=value['total']
        assert value['total']==max(value['source_count'],value['copy_count'])
        assert value['copy_count']==len(value['copy_sums'].splitlines())
        assert hashlib.sha256(value['copy_sums'].encode()).hexdigest()==value['copy_index_sha256']
        matched=(value['matched']==value['total'] and value['source_count']==value['copy_count']
                 and value['source_version']==sys.argv[3] and not any(value[k] for k in ('changelog_bad','different','only_copy','only_source')))
        assert (code,value['status'])==((0,'match') if matched else (1,'diff'))
except (AssertionError,ValueError,KeyError,TypeError,OSError):
    sys.exit(1)
PY_COPY_RESULT
  then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: общий прибор копии не ответил полными согласованными данными (бой: $BOI)"); return
  fi
  COPY_STATUS=$(jq -r '.status' "$COPY_RESULT")
  if [ "$COPY_CODE" = 2 ] && [ "$COPY_STATUS" = blind ]; then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$(jq -r '.reason' "$COPY_RESULT")"); return
  fi
  if ! { [ "$COPY_CODE" = 0 ] && [ "$COPY_STATUS" = match ]; } &&
     ! { [ "$COPY_CODE" = 1 ] && [ "$COPY_STATUS" = diff ]; }; then
    IMENA_SLEPOTA+=("$IDENT"); SLEPOTA+=("$IMYA: общий прибор копии дал несогласованный исход (бой: $BOI)"); return
  fi
  SOVPALO=$(jq -r '.matched' "$COPY_RESULT"); ZNAM=$(jq -r '.total' "$COPY_RESULT")
  NM=$(jq -r '.source_count' "$COPY_RESULT"); NB=$(jq -r '.copy_count' "$COPY_RESULT")
  VM=$(jq -r '.source_version' "$COPY_RESULT"); VNE_SOSTAVA=$(jq -r '.outside_source' "$COPY_RESULT")
  VNE_SOSTAVA_BOYA=$(jq -r '.outside_copy_count' "$COPY_RESULT")
  CHANGELOG_BAD=$(jq -r '.changelog_bad' "$COPY_RESULT")
  INOE=$(jq -r '.different' "$COPY_RESULT")
  TOLKO_B=$(jq -r '.only_copy' "$COPY_RESULT"); TOLKO_M=$(jq -r '.only_source' "$COPY_RESULT")
  jq -j '.copy_sums' "$COPY_RESULT" > "$VREM/boi.txt"
  printf '%s\t%s\n' "$(jq -r '.copy_index_sha256' "$COPY_RESULT")" "$BOI" >> "$VREM/copies"

  if [ "$SOVPALO" -eq "$ZNAM" ] && [ "$NM" -eq "$NB" ] && [ -z "$CHANGELOG_BAD" ] && [ "$VM" = "$VB" ]; then
    SOSHLOS=$((SOSHLOS+1))
    IMENA_SOSHLOS+=("$IDENT")
    echo "сошлось: $IMYA [копия $BOI] — $SOVPALO из $ZNAM файлов, метка $METKA, версия $VB${VNE_SOSTAVA:+ · вне состава, в бою не ждём: $VNE_SOSTAVA}${VNE_SOSTAVA_BOYA:+ · по соответствию: сверка по составу публикации, в бою вне состава не считается $VNE_SOSTAVA_BOYA файлов}"
  else
    if [ "$INFO" = 0 ] && montazh_otlozhit "copy:$REPO:packages/$KATALOG:$BOI"; then
      IMENA_OTLOZHENNYE+=("$IDENT"); return
    fi
    S="🔴 $IMYA [копия $BOI]: совпало $SOVPALO из $ZNAM (метка $METKA=$VM · бой=$VB)"
    [ "$VM" = "$VB" ] || S="$S
    версия в архиве метки $VM не равна версии боя $VB"
    [ -n "$INOE"    ] && S="$S
    иные суммы: $INOE"
    [ -n "$TOLKO_B" ] && S="$S
    только в бою: $TOLKO_B"
    [ -n "$TOLKO_M" ] && S="$S
    только в метке: $TOLKO_M"
    [ -z "$CHANGELOG_BAD" ] || S="$S
    $CHANGELOG_BAD"
    RAZOSHLOS+=("$S")
    IMENA_RAZOSHLOS+=("$IDENT")
    # RU: 🔴 Отпечаток считается по СУММАМ, а не по тексту тревоги: текст печатает лишь
    # RU: первые шесть имён и число совпавших, и вторая правка ТОГО ЖЕ файла его не меняет.
    # RU: Поймано стендом 19.09: изменившаяся картина глушилась как повтор.
    # EN: 🔴 The fingerprint is computed from CHECKSUMS, not from the alert text: the text prints only
    # EN: the first six names and the match count, and a second edit of THE SAME file does not change it.
    # EN: Caught by the test bench on 19.09: a changed picture was being suppressed as a repeat.
    OTPECH_DANNYE="$OTPECH_DANNYE$IMYA@$BOI:$(cat "$VREM/boi.txt")
$CHANGELOG_BAD"
  fi
  }
  for BOI in "${BOI_LIST[@]}"; do
    IDENT="$KATALOG@$BOI"; EXPECTED+=("$IDENT")
    INFO=0
    IFS=':' read -r -a II <<< "$INFO_KORNI"
    for k in "${II[@]}"; do [ "$BOI" = "$k/$IMYA" ] && INFO=1; done
    before_bad=${#RAZOSHLOS[@]}; before_blind=${#SLEPOTA[@]}; before_good=$SOSHLOS
    before_fp=$OTPECH_DANNYE
    proverit_kopiyu
    if [ "$INFO" = 1 ]; then
      owner=$(basename "$(dirname "$(dirname "$BOI")")")
      if [ "${#RAZOSHLOS[@]}" -gt "$before_bad" ]; then
        detail=${RAZOSHLOS[$before_bad]//🔴 /}
        printf '%s: вне зоны, расхождение — сведение владельцу: %s\n' "$owner" "$detail"
        unset 'RAZOSHLOS[before_bad]'; unset 'IMENA_RAZOSHLOS[${#IMENA_RAZOSHLOS[@]}-1]'
      elif [ "${#SLEPOTA[@]}" -gt "$before_blind" ]; then
        printf '%s: вне зоны, не сверено — сведение владельцу: %s\n' "$owner" "${SLEPOTA[$before_blind]}"
        unset 'SLEPOTA[before_blind]'; unset 'IMENA_SLEPOTA[${#IMENA_SLEPOTA[@]}-1]'
      else
        unset 'IMENA_SOSHLOS[${#IMENA_SOSHLOS[@]}-1]'
      fi
      SOSHLOS=$before_good; OTPECH_DANNYE=$before_fp; IMENA_INFO+=("$IDENT")
    fi
  done
  if [ "$(cut -f1 "$VREM/copies" | sort -u | wc -l)" -gt 1 ]; then
    printf 'копии разошлись: %s — ' "$IMYA"
    cut -f2- "$VREM/copies" | paste -sd '|' -
  fi

done

for r in "${!RASK_SET[@]}"; do
  [ -n "${RASK_NAJDENY[$r]+x}" ] && continue
  EXPECTED+=("$r@raskladka"); IMENA_SLEPOTA+=("$r@raskladka"); RASK_VSEGO=$((RASK_VSEGO+1)); RASK_SLEP=$((RASK_SLEP+1))
  SLEPOTA+=("$r: назван в VYPUSK_RASKLADKA, каталога packages/$r в дереве нет")
done
for r in "${!DER_ID[@]}"; do
  [ -n "${DER_NAJDENY[$r]+x}" ] && continue
  EXPECTED+=("$r@derevo"); IMENA_SLEPOTA+=("$r@derevo"); DER_VSEGO=$((DER_VSEGO+1)); DER_SLEP=$((DER_SLEP+1))
  SLEPOTA+=("${r%%#*} [derevo, запись ${DER_ID[$r]}]: каталога packages/${r%%#*} в дереве нет")
done

# RU: 🔴 ССЫЛКИ МОНТАЖА (условие приёмки, 23.09.2026). Пакет dsh-pamyat-kompakt-dsh
# RU: находит соседа ПО ИМЕНИ через ссылку node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt.
# RU: Пропади она (npm install, prune, ручная уборка) — kompakt-dsh не загрузится, а сверка файлов
# RU: выше останется зелёной: ссылка не файл пакета. Поэтому проверяется отдельно: это ссылка,
# RU: и readlink -f даёт ровно цель, и цель — каталог. Пары «ссылка=цель», по одной на строку.
# EN: 🔴 DEPLOYMENT LINKS (acceptance condition, 23.09.2026). The package dsh-pamyat-kompakt-dsh
# EN: finds its neighbour BY NAME through the link node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt.
# EN: If it disappears (npm install, prune, manual cleanup), kompakt-dsh will not load, while the file comparison
# EN: above stays green: a link is not a package file. Hence it is checked separately: it is a link,
# EN: readlink -f gives exactly the target, and the target is a directory. Pairs "link=target", one per line.
# RU: ⚠️ ЧЕГО НЕ ЛОВИТ: исправность ЦЕЛИ (её файлы сверяет цикл выше) · ссылки, не названные здесь.
# EN: ⚠️ WHAT IT DOES NOT CATCH: the health of the TARGET (its files are compared by the loop above) · links not named here.
SSYLKI=${VYPUSK_SSYLKI-}
SSYLKI_BAD=(); SSYLOK=0
while IFS= read -r para; do
  [ -n "$para" ] || continue
  SSYLOK=$((SSYLOK+1)); ssylka=${para%%=*}; cel=${para#*=}
  case "$cel" in /*) ;; *) cel="$(dirname -- "$ssylka")/$cel" ;; esac
  cel=$(readlink -m -- "$cel")
  if [ ! -L "$ssylka" ]; then SSYLKI_BAD+=("ссылки нет: $ssylka (ждём ссылку на $cel)")
  elif [ "$(readlink -f -- "$ssylka")" != "$cel" ]; then SSYLKI_BAD+=("ссылка уводит не туда: $ssylka → $(readlink -f -- "$ssylka") (ждём $cel)")
  elif [ ! -d "$cel" ]; then SSYLKI_BAD+=("цель ссылки не каталог: $cel")
  fi
done <<< "$SSYLKI"
for s in "${SSYLKI_BAD[@]}"; do OTPECH_DANNYE="${OTPECH_DANNYE}ссылка:$s
"; done

# B-N-2025: срок и поколение отсрочки перепроверяются перед выводом/каналом.
for ((mo_i=0; mo_i<${#OTLOZHENNYE[@]}; mo_i++)); do
  mo_line=${OTLOZHENNYE[$mo_i]}
  IFS=' ' read -r mo_mark mo_id mo_task mo_do mo_exp mo_subject <<< "$mo_line"
  mapfile -d '' -t mo_query < "$VREM/mo-query-$mo_i"
  mo_now=$("$MO_HELPER" otlozheno --avto-montazh --since-ns "$MO_STARTED" --record-sha256 "${MO_GENERATIONS[$mo_i]}" "${mo_query[@]}" 2>/dev/null); mo_code=$?
  if [ "$mo_code" != 4 ] || [ "$mo_now" != "$mo_line" ]; then
    if [ "${VYPUSK_MO_REREAD:-0}" = 0 ]; then
      export VYPUSK_MO_REREAD=1; echo 'ПЕРЕСНИМАЮ: срок/поколение окна изменились перед итогом'; exec bash "$0" --avto-montazh
    fi
    echo 'СЛЕПОТА: предмет повторно изменился при пересъёме' >&2; exit 2
  fi
done

# RU: Устаревшие исключения остаются данными, но больше ничего не гасят.
# EN: Stale exceptions remain as data but no longer suppress anything.
python3 - "$VREM/exceptions.json" "$VREM/active-versions" <<'PY_STALE'
import pathlib, json, sys
keys = json.loads(pathlib.Path(sys.argv[1]).read_text())
active = set(pathlib.Path(sys.argv[2]).read_text().splitlines())
for key in keys:
    if key not in active: print('исключение устарело: ' + key)
PY_STALE

echo "═══ копий пакетов с боем $VSEGO · сошлось $SOSHLOS · разошлось ${#RAZOSHLOS[@]} · слепота ${#SLEPOTA[@]}"
echo "    раскладка (без манифеста, VYPUSK_RASKLADKA): пакетов $RASK_VSEGO · сошлось $RASK_SOSHLOS · разошлось $RASK_RAZ · слепота $RASK_SLEP"
echo "    derevo (записи реестра, VYPUSK_REESTR${REESTR:+=$REESTR}): записей $DER_VSEGO · сошлось $DER_SOSHLOS · разошлось $DER_RAZ · слепота $DER_SLEP"
echo "    режим счёта: $REZHIM"
echo "    ссылки монтажа: живых $((SSYLOK - ${#SSYLKI_BAD[@]})) из $SSYLOK"
for s in "${SSYLKI_BAD[@]}"; do echo "🔴 ссылка монтажа: $s"; done
echo "    вне области: ${#VNE_OBLASTI[@]} пакетов дерева — нет боевого каталога в корнях: $KORNI"
for s in "${VNE_OBLASTI[@]}"; do printf '    вне области: %s\n' "$s"; done
for s in "${SLEPOTA[@]}"; do echo "    ⚠️  слепота: $s"; done
echo "    без манифеста: ${#BEZ_MANIFESTA[@]} каталогов дерева — package.json не найден"
for s in "${BEZ_MANIFESTA[@]}"; do printf '    без манифеста: %s\n' "$s"; done
# RU: VSEGO («с боем») пересекается со слепотой; в сумму входят только непересекающиеся исходы.
# EN: VSEGO ("with a live copy") overlaps with blindness; only non-overlapping outcomes go into the sum.
RASPREDELENO=$((SOSHLOS + ${#IMENA_OTLOZHENNYE[@]} + ${#RAZOSHLOS[@]} + ${#SLEPOTA[@]} + ${#VNE_OBLASTI[@]} + ${#BEZ_MANIFESTA[@]} + ${#IMENA_INFO[@]}))
echo "    вне зоны ответственности: ${#IMENA_INFO[@]} копий (информация, не зелёное заверение)"
echo "    каталогов в дереве $KATALOGOV, единиц сверки ${#EXPECTED[@]} · распределено $RASPREDELENO (сошлось + разошлось + слепота + вне области + без манифеста + вне ответственности)"
if [ "$RASPREDELENO" -ne "${#EXPECTED[@]}" ]; then
  echo "🔴 ОХВАТ НЕ СОШЁЛСЯ: каталогов $KATALOGOV, распределено $RASPREDELENO — перечень неполон или посчитан дважды"
  exit 2
fi

# RU: Идентичность — имя каталога, НЕ package.name и НЕ текст диагностики.
# RU: NUL-разделители сохраняют пробелы и переводы строк внутри имён.
# EN: Identity is the directory name, NOT package.name and NOT the diagnostic text.
# EN: NUL separators preserve spaces and newlines inside names.
: > "$VREM/expected.names"
for pk in "${EXPECTED[@]}"; do printf '%s\0' "$pk"; done > "$VREM/expected.names"
: > "$VREM/actual.names"
for name in "${IMENA_OTLOZHENNYE[@]}" "${IMENA_SOSHLOS[@]}" "${IMENA_RAZOSHLOS[@]}" "${IMENA_SLEPOTA[@]}" "${IMENA_VNE[@]}" "${BEZ_MANIFESTA[@]}" "${IMENA_INFO[@]}"; do
  printf '%s\0' "$name"
done > "$VREM/actual.names"
sort -zu "$VREM/expected.names" > "$VREM/expected.unique"
sort -z "$VREM/actual.names" > "$VREM/actual.sorted"
uniq -z "$VREM/actual.sorted" > "$VREM/actual.unique"
# RU: Объединение множеств теряет кратность: дубли проверяются отдельно.
# EN: A set union loses multiplicity: duplicates are checked separately.
while IFS= read -r -d '' name; do printf '🔴 не распределены: %q\n' "$name"; done < <(comm -z -23 "$VREM/expected.unique" "$VREM/actual.unique")
while IFS= read -r -d '' name; do printf '🔴 распределены дважды: %q\n' "$name"; done < <(uniq -zd "$VREM/actual.sorted")
while IFS= read -r -d '' name; do printf '🔴 распределены вне перечня: %q\n' "$name"; done < <(comm -z -13 "$VREM/expected.unique" "$VREM/actual.unique")

if ! cmp -s "$VREM/expected.unique" "$VREM/actual.unique" || ! cmp -s "$VREM/actual.sorted" "$VREM/actual.unique"; then
  echo 'СЛЕПОТА ОХВАТА: множества/кратность предметов разошлись'; exit 2
fi

# RU: Отметку снимаем только после проверки и ранней, и поздней слепоты.
# EN: The mark is removed only after checking both early and late blindness.
if [ ${#SLEPOTA[@]} -eq 0 ]; then
  [ "$TIHO" = 1 ] || [ ! -e "${SOST}.slepota" ] || rm -f "${SOST}.slepota"
fi

# RU: Поздняя слепота не является успешной сверкой.
# RU: При одновременном расхождении сохраняем прежний код 1 и его канал тревоги.
# EN: Late blindness is not a successful comparison.
# EN: If there is also a mismatch, we keep the former code 1 and its alert channel.
if [ ${#RAZOSHLOS[@]} -eq 0 ] && [ ${#SSYLKI_BAD[@]} -eq 0 ]; then
  if [ ${#SLEPOTA[@]} -gt 0 ]; then
    slepota "поздняя слепота: ${#SLEPOTA[@]} копий — ${IMENA_SLEPOTA[*]}; ${SLEPOTA[*]}"
    exit 2
  fi
  [ "${#IMENA_OTLOZHENNYE[@]}" = 0 ] || { echo "отложено ${#IMENA_OTLOZHENNYE[@]}; это не сошлось"; exit 4; }
  exit 0
fi

SOOB="🔴 ВЫПУСК: проверка файлов и CHANGELOG — $SOSHLOS из $VSEGO копий пакетов сошлись, ${#RAZOSHLOS[@]} нет"
for s in "${RAZOSHLOS[@]}"; do SOOB="$SOOB
$s"; done
for s in "${SSYLKI_BAD[@]}"; do SOOB="$SOOB
🔴 ссылка монтажа: $s — пакет, который находит соседа по ней, не загрузится"; done
SOOB="$SOOB

режим счёта: $REZHIM
Проверьте названные расхождения файлов и записи о версии в CHANGELOG боя и метки.
Лечение: сверить состав и журнал изменений со своей меткой; выпуск — после ворот, метка до монтажа."
# RU: Сломана ТОЛЬКО ссылка — шапка и лечение свои: «свести состав и выпустить метку» тут неверно.
# EN: ONLY a link is broken — its own header and remedy: "reconcile contents and release a tag" is wrong here.
if [ ${#RAZOSHLOS[@]} -eq 0 ]; then
  SOOB="🔴 ВЫПУСК: сломана ссылка монтажа (файлы пакетов сошлись: $SOSHLOS из $VSEGO)"
  for s in "${SSYLKI_BAD[@]}"; do SOOB="$SOOB
$s — пакет, который находит соседа по ней, не загрузится"; done
  SOOB="$SOOB

Лечение: вернуть ссылку (ln -s ../<цель> <ссылка>, относительной) — рука монтажа. Метку и выпуск не трогать."
fi
echo "$SOOB"

# RU: --- глушение повтора: отпечаток картины + время последней отправки
# EN: --- repeat suppression: fingerprint of the picture + time of the last send
OTPECHATOK=$(printf '%s' "$OTPECH_DANNYE" | sha256sum | cut -c1-32)
TEPER=$(date +%s)
PROSHLYJ=''; KOGDA=0
if [ -f "$SOST" ]; then PROSHLYJ=$(cut -d' ' -f1 "$SOST" 2>/dev/null); KOGDA=$(cut -d' ' -f2 "$SOST" 2>/dev/null); fi
if [[ "$KOGDA" =~ ^[0-9]+$ ]] && [ "${#KOGDA}" -le 18 ]; then KOGDA=$((10#$KOGDA)); else KOGDA=0; fi
SLAT=1
if [ "$OTPECHATOK" = "$PROSHLYJ" ] && [ $((TEPER-KOGDA)) -ge 0 ] && [ $((TEPER-KOGDA)) -lt "$NAPOMINAT" ]; then
  SLAT=0
  echo "    (в бот НЕ шлю: та же картина, прошло $((TEPER-KOGDA)) с из $NAPOMINAT — повтор глушится)"
fi
if [ "$SLAT" = 1 ]; then
  # RU: Отметка «отправлено» — ТОЛЬКО по коду 0 канала. Было: канал без предела и без проверки кода,
  # RU: отметка писалась всегда ⇒ отказ канала глох на NAPOMINAT как «уже отправлено» (класс сторожа машины 06.09).
  # RU: Предел — та же запись KANAL_PREDEL_S/KANAL_DOBIV_S, что у слепоты.
  # EN: The "sent" mark is set ONLY on channel code 0. Before: the channel had no limit and no code check,
  # EN: the mark was always written ⇒ a channel failure was muted for NAPOMINAT as "already sent" (the machine guard class, 06.09).
  # EN: The limit is the same KANAL_PREDEL_S/KANAL_DOBIV_S assignment as for blindness.
  if [ "$TIHO" = 1 ]; then
    echo "    доставка расхождения пропущена: VYPUSK_TIHO=1 — отметку не ставлю"
  elif [ ! -x "$ALERT" ]; then
    echo "    доставка расхождения НЕ подтверждена: отправитель недоступен: $ALERT"
  else
    # RU: SOOB — обычный текст, не HTML; журнал и отпечаток картины остаются исходными.
    # EN: SOOB is plain text, not HTML; the log and the picture fingerprint stay unchanged.
    SOOB_KANAL=${SOOB//&/\&amp;}; SOOB_KANAL=${SOOB_KANAL//</\&lt;}; SOOB_KANAL=${SOOB_KANAL//>/\&gt;}
    result=$(timeout -k "${KANAL_DOBIV_S}s" "${KANAL_PREDEL_S}s" "$ALERT" "$SOOB_KANAL" 2>&1); code=$?
    if [ "$code" -eq 0 ]; then
      echo "    канал подтвердил доставку расхождения (код 0) в пределе ${KANAL_PREDEL_S}+${KANAL_DOBIV_S} с; прочтение человеком не проверено"
      # RU: отметка — атомарно, как у слепоты: временный файл рядом и mv; каталог создаётся только здесь.
      # EN: the mark is written atomically, as for blindness: a temp file next to it and mv; the directory is created only here.
      if mkdir -p "$(dirname "$SOST")" 2>/dev/null && temp=$(mktemp "${SOST}.XXXXXX" 2>/dev/null); then
        if ! (umask 077; printf '%s %s\n' "$OTPECHATOK" "$TEPER" > "$temp") || ! mv "$temp" "$SOST"; then
          rm -f "$temp"
          echo "    отметка доставки расхождения не сохранена — следующий прогон может повторить тревогу"
        fi
      else
        echo "    отметка доставки расхождения не сохранена — следующий прогон может повторить тревогу"
      fi
    else
      case "$code" in 124|137) code="$code (ИСТЁК предел канала)" ;; esac
      printf '    доставка расхождения НЕ подтверждена: код %s; предел канала %s+%s с; %s\n' \
        "$code" "$KANAL_PREDEL_S" "$KANAL_DOBIV_S" "$result"
    fi
  fi
fi
exit 1
