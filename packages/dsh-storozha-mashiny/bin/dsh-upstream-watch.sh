#!/bin/bash
# RU: Сторож новых версий платформы DSH. Живёт на той машине, где стоят агенты, и шлёт тревоги
# RU: в канал тревоги этой машины. Сторож должен быть ОДИН на платформу: двое дали бы две тревоги
# RU: об одном и том же и расходились бы в числах.
# EN: Watcher for new releases of the DSH platform. It runs on the machine that hosts the agents and
# EN: sends alerts to that machine's alert channel. Keep ONE watcher per platform: two of them would
# EN: raise two alerts about the same thing and drift apart in their numbers.
#
# RU: 🔴 ПРАВИЛО ТРЕВОГИ — НЕ «вышло новьё», а «вышло то, что владелец готов ставить»:
# RU:   релиз-кандидат или стабильный  -> ГРОМКАЯ тревога: это сигнал «пора обновляться»;
# RU:   альфа                          -> МОЛЧА, только журнал и состояние. Владелец альфы не ставит;
# RU:   альфа с признаком безопасности -> тревога С ОГОВОРКОЙ «ставить не предлагаю».
# EN: 🔴 ALERT RULE — not "something new appeared" but "something the owner is ready to install appeared":
# EN:   release candidate or stable    -> LOUD alert: this is the "time to upgrade" signal;
# EN:   alpha                          -> SILENT, journal and state only. The owner does not install alphas;
# EN:   alpha with a security marker   -> alert WITH A CAVEAT "not suggesting to install".
#
# RU: 🔴 ГРАНИЦА. Ловит «в реестре появилась версия, которой мы не видели». НЕ ловит:
# RU:   — что версия годна нам: ломающие правки проверяет отдельный замер по нашим плагинам;
# RU:   — молчание источника: недоступность npm или GitHub — это СЛЕПОТА, не «новья нет»;
# RU:   — переименование пакета или смену репозитория.
# RU: Молчание сторожа не значит «всё хорошо» — значит «нового среди меток не появилось».
# EN: 🔴 BOUNDARY. Catches "the registry has a version we have not seen". Does NOT catch:
# EN:   — whether the version suits us: breaking changes are checked by a separate measurement of our plugins;
# EN:   — source silence: npm or GitHub being unreachable is BLINDNESS, not "nothing new";
# EN:   — a renamed package or a moved repository.
# EN: A silent watcher does not mean "all is well" — it means "nothing new among the dist-tags".
#
# RU: Коды: 0 нового нет · 1 есть новое · 2 слепота · 3 тревога не доставлена, версия не записана, повтор.
# EN: Exit codes: 0 nothing new · 1 something new · 2 blindness · 3 alert not delivered, version not recorded, retry.
set -u
export LC_ALL=C.utf8

# RU: Пакет и репозиторий — публичные имена платформы; это предмет наблюдения, не частные значения.
# EN: Package and repository are the platform's public names; they are the watched subject, not private values.
PAKET=${DSH_PAKET:-@deepseek-ai/dsh}
REPO=${DSH_REPO:-deepseek-ai/deepseek-harness}
# RU: Файл «виденных» версий: одна версия на строку. Каталог создаётся сам.
# EN: File of "seen" versions: one version per line. The directory is created automatically.
SOST=${DSH_SOSTOYANIE:-/var/lib/dsh-upstream-watch/vidennye.txt}   # vorota-ob:dopusk=PUT
# RU: Канал тревоги принимает HTML первым доводом. Нет команды или доставка отказала — код 3;
# RU: версия не записана, следующий прогон повторит попытку.
# EN: The channel takes HTML as its first argument. Missing command or failed delivery — exit 3;
# EN: the version is not recorded, and the next run retries.
ALERT=${DSH_ALERT:-agent-alert}
# RU: Признаки безопасности в описании релиза — ДАННЫМИ, а не в коде условия.
# EN: Security markers in the release notes are DATA, not part of the condition code.
BEZOPASNOST=${DSH_BEZOPASNOST:-security|vulnerabilit|CVE-|безопасн|уязвим}
# RU: package.json приложения, в котором записана УСТАНОВЛЕННАЯ версия платформы
# RU: (dependencies["@deepseek-ai/dsh"]). Пусто — установленная версия неизвестна (см. ниже).
# EN: The application's package.json that records the INSTALLED platform version
# EN: (dependencies["@deepseek-ai/dsh"]). Empty — the installed version is unknown (see below).
PKGJSON=${DSH_PACKAGE_JSON:-}

mkdir -p "$(dirname "$SOST")" 2>/dev/null
[ -f "$SOST" ] || : > "$SOST"

# RU: метки источника: ВСЕ, а не одна. Однажды новая версия сидела в метке «alpha», которую никто не назвал.
# EN: source dist-tags: ALL of them, not one. Once a new version sat under the "alpha" tag nobody had named.
METKI=$(timeout 60 npm view "$PAKET" dist-tags --json --silent 2>/dev/null)
if [ -z "$METKI" ]; then
  echo "СЛЕПОТА: реестр не ответил про $PAKET — это НЕ «новья нет»"
  exit 2
fi
VERSII=$(printf '%s' "$METKI" | jq -r 'to_entries[] | .key + "=" + .value' 2>/dev/null | sort -u)
[ -n "$VERSII" ] || { echo "СЛЕПОТА: метки не разобраны"; exit 2; }

# RU: Установленная версия — тоже «виденная»: тревожить о том, что у нас уже стоит, значит слать шум.
# RU: Поймано первым же боевым прогоном: при чистом состоянии сторож объявил новьём ровно нашу версию.
# EN: The installed version also counts as "seen": alerting about what is already installed is noise.
# EN: Caught on the very first live run: with an empty state the watcher announced our own version as new.
# RU: Без DSH_PACKAGE_JSON сторож об этом говорит: наша версия будет объявлена новой (один раз).
# EN: Without DSH_PACKAGE_JSON the watcher says so: our own version will be announced as new (once).
[ -n "$PKGJSON" ] || echo "НЕ НАСТРОЕНО: DSH_PACKAGE_JSON пуст — установленная версия неизвестна, она будет объявлена новой"
NASHA=$(node -e "try{console.log((require(process.argv[1]).dependencies['@deepseek-ai/dsh']||'').replace(/^[\^~]/,''))}catch(e){console.log('')}" "$PKGJSON" 2>/dev/null)

novyh=0; trevog=0; slepyh=0; nedost=0
while IFS='=' read -r metka ver; do
  [ -n "$ver" ] || continue
  grep -qxF "$ver" "$SOST" && continue          # RU: уже видели — не тревожим дважды · EN: already seen — do not alert twice
  [ -n "$NASHA" ] && [ "$ver" = "$NASHA" ] && { echo "$ver" >> "$SOST"; continue; }  # RU: это наша же версия · EN: this is our own version
  novyh=$((novyh+1))
  # RU: Сорт версии: prerelease-часть semver. rc/пусто -> владелец ставит; alpha/beta -> нет.
  # EN: Version kind: the semver prerelease part. rc/none -> the owner installs; alpha/beta -> not.
  hvost=${ver#*-}
  [ "$hvost" = "$ver" ] && sort=стабильный || case "$hvost" in
      rc*|RC*) sort=релиз-кандидат ;;
      *) sort=альфа ;;
    esac
  echo "новое: $ver (метка $metka, сорт $sort)"

  # RU: Ответ источника проверяется ПО СУЩЕСТВУ: код curl, объект с точным tag_name и body типа строка/null; запросы тегов v<версия> и <версия>.
  # RU: Было: отказ curl (или ответ-объект «rate limit» при коде 0) давал пустое описание, и альфа с исправлением
  # RU: безопасности молчала. Теперь для альфы это СЛЕПОТА: версию не записываю (повторю), прогон — код 2.
  # EN: The source is checked FOR SUBSTANCE: curl exit code, an exact tag_name object with string/null body; tag requests v<version> and <version>.
  # EN: Before, a curl failure (or a "rate limit" object with exit 0) gave empty notes and a security alpha stayed
  # EN: silent. Now, for an alpha, it is BLINDNESS: the version is not recorded (retry), the run exits 2.
  opisanie=""; polucheno=0; kod_curl=0
  for tag in "v$ver" "$ver"; do
    otvet=$(timeout 40 curl -fsS "https://api.github.com/repos/$REPO/releases/tags/$tag" 2>/dev/null); kod_curl=$?
    if [ "$kod_curl" -eq 0 ] && printf '%s' "$otvet" | jq -e --arg v "$ver" 'type == "object" and (.tag_name == $v or .tag_name == ("v"+$v)) and ((.body|type) == "string" or .body == null)' >/dev/null 2>&1; then
      opisanie=$(printf '%s' "$otvet" | jq -r '.body // ""'); polucheno=1; break
    fi
  done
  if [ "$polucheno" -eq 0 ] && [ "$sort" = "альфа" ]; then
    echo "СЛЕПОТА: описание релизов $REPO для точного тега $ver не добыто (curl код $kod_curl) — про безопасность судить нечем; не записываю, повторю"
    slepyh=$((slepyh+1)); continue
  fi
  # RU: 🔴 Описание берётся ЦЕЛИКОМ, без обрезки. Было `head -c 4000`: признак безопасности искался
  # RU: по обрезанному тексту, и слово в хвосте длинного описания не нашлось бы — сторож промолчал бы
  # RU: о том, ради чего его и держим. Проверено делом: описание 4075 байт, слово «уязвимость» в конце —
  # RU: при обрезке признак НЕ найден, без обрезки найден.
  # RU: Граница: описание в тело тревоги НЕ идёт, обрезать его незачем вовсе.
  # EN: 🔴 The release notes are taken WHOLE, untruncated. It used to be `head -c 4000`: the security
  # EN: marker was searched in truncated text, and a word at the end of long notes would be missed — the
  # EN: watcher would stay silent about the very thing it exists for. Verified: 4075-byte notes with
  # EN: "vulnerability" at the end — not found when truncated, found when whole.
  # EN: Boundary: the notes do NOT go into the alert body, so there is no reason to truncate them.
  bezop=нет
  printf '%s' "$opisanie" | grep -qiE "$BEZOPASNOST" && bezop=да

  if [ "$sort" != "альфа" ]; then
    "$ALERT" "🔴 DSH: вышел <b>$ver</b> ($sort, метка $metka). У нас $(node -e "try{console.log(require(process.argv[1]).dependencies['@deepseek-ai/dsh']||'?')}catch(e){console.log('?')}" "$PKGJSON" 2>/dev/null). Это тот сорт, которого ждём для обновления." >/dev/null 2>&1 && trevog=$((trevog+1)) \
      || { nedost=$((nedost+1)); echo "🔴 тревога о $ver НЕ доставлена — в виденные не пишу, повторю в следующий заход"; continue; }
  elif [ "$bezop" = "да" ]; then
    "$ALERT" "DSH: альфа <b>$ver</b> с упоминанием безопасности в описании. Ставить не предлагаю — сообщаю из-за безопасности." >/dev/null 2>&1 && trevog=$((trevog+1)) \
      || { nedost=$((nedost+1)); echo "🔴 тревога о $ver НЕ доставлена — в виденные не пишу, повторю в следующий заход"; continue; }
  else
    logger -t dsh-upstream-watch "альфа $ver — молча по правилу владельца (тревога только на rc/стабильный)"
  fi
  echo "$ver" >> "$SOST"
done <<< "$VERSII"

echo "ИТОГО: меток $(printf '%s\n' "$VERSII" | wc -l), новых $novyh, тревог $trevog, слепых $slepyh"
# RU: 1.0.2: недоставленная тревога — код 3 (юнит failed: SuccessExitStatus его не включает), версия не записана — повтор.
# EN: 1.0.2: an undelivered alert — exit 3 (unit failed: not in SuccessExitStatus), the version is not recorded — retry.
[ "$nedost" -gt 0 ] && exit 3
[ "$slepyh" -gt 0 ] && exit 2
[ "$novyh" -gt 0 ] && exit 1
exit 0
