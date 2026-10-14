# Каждая настройка · Complete configuration

Все поля объявлены Config в `src/index.js`. Путь базы и логическое имя владельца записей принадлежат ядру, не секретарю. Пустые каталоги/пути не создают потребителя автоматически.

All fields are declared in Config in `src/index.js`. The database path and logical record owner belong to the core, not the secretary. An empty path or directory setting does not automatically create a consumer.

| Ключ · Key | Тип · Type | Умолчание · Default | Действие/пример · Effect/example | Ошибка/граница · Failure/limit |
|---|---|---|---|---|
| `klass` | string | `svodka-kompakcii` | Класс сводки · Summary class | Не превращает сводку в факт; ядро применяет политику · Does not turn a summary into fact; core policy applies |
| `vklyuchen` | boolean | `true` | Подписки/секретарь включены · Enables secretary | false отключает весь apply-путь · false disables the apply path |
| `putOtklonennyh` | string | `''` | `/var/lib/example-memory/pending`, задания/проза/метки; единственный каталог, из которого `/svodka-prinyat` читает сводку · Tasks/prose/markers; the only directory `/svodka-prinyat` reads a summary from | Пусто — нечего сохранять на диск для восстановления, и `/svodka-prinyat` отказывает · Empty gives no durable task/prose location, and `/svodka-prinyat` refuses |
| `distillyaciya` | boolean | `false` | Явно включить платный API · Explicitly enable paid API | True без исходных событий/ключа/маски не означает работоспособность · True without source events/key/mask is not operational |
| `rassuzhdeniya` | boolean | `true` | Включить thinking-блоки исходной сессии как черновик · Include source-session thinking as draft | Не настройка стоимости/режима thinking внешней модели · Not the external model's thinking/cost mode |
| `putZhurnala` | — | — | Снят из Config (A-N-1870) · Removed from Config | С A-P-056 дистилляция файл не читает, готовность от него не зависит; ключ в профиле игнорируется · Since A-P-056 distillation never reads the file and readiness ignores it; a profile key is ignored |
| `klyuchFajl` | string | `''` | Имя секретного файла · Secret-file path | Если задан, имеет приоритет; неработающий файл не должен быть заменён чужим секретом · Selected first; do not substitute another secret |
| `klyuchPass` | string | `''` | Имя записи pass · pass entry name | Требует установленного pass/доступа · Requires pass and access |
| `klyuchOkruzhenie` | string | `''` | Имя env-переменной · Env variable name | Пустое значение — нет ключа; env не изолирует процесс · Empty value lacks key; env is not isolation |
| `komandaTrevogi` | string | `/usr/local/bin/agent-alert` | Команда уведомления · Notification command | `''` выключает внешний канал с диагностикой; исполняемый путь должен существовать · Empty disables external alerts with diagnosis; executable must exist |
| `model` | string | `deepseek-flash` | Идентификатор модели API · API model ID | Неподдержанный id даст отказ провайдера · Unsupported ID causes provider refusal |
| `maxTokenovTem` | number | `32000` | Бюджет ответа выбора тем · Topic-selection response cap | Не предел входа; reasoning может занять бюджет · Not an input bound; reasoning may consume cap |
| `maxTokenovStati` | number | `0` | Выход статьи:0 снимает локальный cap · Article output:0 removes the local cap | Низкий cap может дать thinking без text · Low cap may yield thinking without text |
| `predelTem` | number | `0` |0 = все темы; положительное ограничивает КАЖДОЕ окно · 0 all topics; positive limits EACH window | Исключённые темы не считать обработанными · Excluded topics are not processed |
| `minTokenov` | number | `2000` | Минимальный объём среза · Minimum slice size | Применяется при непустом shadowedTokenCount; null обходит порог · Applies to nonempty shadowedTokenCount; null bypasses it |
| `razmerOkna` | number | `0` |0 = цельный транскрипт; положительное дробит · 0 whole transcript; positive windows | UTF-16 длина замаскированного транскрипта, не токены · UTF-16 length of masked transcript, not tokens |
| `predelOkon` | number | `0` |0 = без cap; положительное оставляет ограниченный хвост окон · 0 unlimited; positive bounds retained windows | Отброшенная часть сохраняется/именуется отдельно · Omitted material retained/reported separately |
| `hvost` | `vse/temy/net` | `vse` | Использование хвоста:весь/для тем/нет · Tail:all/topics/none | Семантику конкретных вызовов см.ARCHITECTURE · See per-call semantics in ARCHITECTURE |
| `adres` | string | `''` | Override HTTP endpoint; пусто = встроенный провайдер · Empty selects built-in provider | Протокол Anthropic Messages, не произвольный chat API · Anthropic Messages protocol, not arbitrary chat API |
| `sudPovtor.vkl` | boolean | `false` | Добавить ПОВТОРЯЕТ к обычному суду · Add ПОВТОРЯЕТ to ordinary judgment | Модельный вердикт не является человеческим подтверждением · Model verdict is not human confirmation |
| `hodovojZov.vkl` | boolean | `false` | Вызывать по turn/end объёму речи · Trigger at turn end by speech size | Требует DSH_HOME; вместо компакционного вызова дистилляции · Requires DSH_HOME; replaces compaction-driven distillation |
| `hodovojZov.porogZnakov` | number | `160000` | Порог окна речи · Speech-window threshold | Не весь размер журнала/токены; положительное значение · Not total journal size/tokens; positive value |
| `hodovojZov.neudachPodryad` | number | `3` | Неудач до паузы · Failures before pause | Неограниченный автоповтор этим не включается · Does not enable unbounded retries |
| `hodovojZov.pauzaMinut` | number | `360` | Пауза после порога неудач · Pause after repeated failure | Вызов возобновляется на следующих событиях, не отдельным таймером · Resumes on future events, not an independent timer |

Приоритет ключей: файл → pass → env; несколько источников диагностируются. Конфигурация задаёт имя источника, значение используется только в HTTP-заголовке. Права файла и env отдельно обеспечиваются установщиком; память процесса не является секретным хранилищем.

Key priority is file → pass → env; multiple configured sources are diagnosed. Config identifies the source, and the value is used in an HTTP header. The installer must secure files and env separately; process memory is not a secret store.

## Оперативные выключатели · Live disable switches

Файл `$HOME/pamyat/distillyaciya-vyklyuchena` выключает дистилляцию поверх `true`; путь переопределяется `PAMYAT_DISTILLYACIYA_VYKL`. Удаление файла не включит `distillyaciya=false` в профиле. Аналогичный файл `$HOME/pamyat/rassuzhdeniya-vyklyucheny` управляет включением черновых рассуждений; env-override — `PAMYAT_RASSUZHDENIYA_VYKL`. Настройка false имеет старшинство.

`$HOME/pamyat/distillyaciya-vyklyuchena` disables distillation on top of config true; `PAMYAT_DISTILLYACIYA_VYKL` overrides its path. Removing it cannot enable profile `distillyaciya=false`. `$HOME/pamyat/rassuzhdeniya-vyklyucheny` similarly disables draft reasoning; its env override is `PAMYAT_RASSUZHDENIYA_VYKL`. Config false takes precedence.

Ходовой зов хранит `DSH_HOME/pamyat-secretary/vysokaya-voda.json`. DSH_HOME — дом конкретного агента, не предполагаемый общий HOME пользователя. Каталог имеет режим 0700, файл 0600; запись делается через временный файл и rename. Это не межпроцессная база с полноценной блокировкой всех writers.

Turn-driven triggering persists `DSH_HOME/pamyat-secretary/vysokaya-voda.json`. DSH_HOME is the individual agent home, not an assumed shared account HOME. Directory/file modes are 0700/0600, with temporary-file-and-rename writes. This is not a multi-writer transactional database.

## Численные пределы реализации · Implementation bounds

Один HTTP-вызов по умолчанию ограничен 180000 мс; при временном сбое всего 3 попытки с паузами 2000/6000 мс. Повтор по признаку «не дочитала» относится к бюджету ответа и допускает повтор с удвоением положительного cap; это иной механизм, не те же 3 сетевые попытки. Нулевой cap статьи позволяет потребителю взять встроенный высокий maxTokens, не бесконечный ответ сервера.

A single HTTP call defaults to 180000 ms; transient failure allows 3 total attempts with 2000/6000 ms waits. An incomplete-read retry may double a positive output cap; it is a separate mechanism from the 3 network attempts. A zero article cap allows the consumer's built-in high maxTokens, not an infinite server response.

При maxTokenovTem <= 0 первый выбор тем и повтор передают undefined в sprosit, который выбирает собственный положительный потолок провайдера. Это не безграничный бюджет и не лимит оплаченного расхода; умолчание настройки 32000 сохранено.

For maxTokenovTem <= 0, the first topic call and retries pass undefined to sprosit, selecting its positive provider ceiling. This is neither an unlimited budget nor a billed-cost cap; the configuration default remains 32000.

`maxTokenovStati=0` преобразуется в undefined и даёт встроенный `maxTokens=393216`. `minTokenov` не срабатывает при null shadowedTokenCount; ходовой зов передаёт именно null. Это пределы разных сторон, не общий бюджет и не гарантия минимального объёма всех входов.

`maxTokenovStati=0` becomes undefined and selects the built-in `maxTokens=393216`. `minTokenov` is bypassed for null shadowedTokenCount, which is what turn-driven triggering passes. These are distinct bounds, not a total budget or a guarantee that every input meets a minimum size.
