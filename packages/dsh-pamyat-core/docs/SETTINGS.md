# Все настройки · Complete settings reference

Настройки объявлены в `src/index.js:Config`; часть исторических полей оставлена для совместимости. Ниже показано фактическое действие, а не обещание, выведенное из имени ключа. Проверка схемы не гарантирует права на файл, существование отвечающего или читателя очереди.

Settings are declared by `Config` in `src/index.js`; some historical fields remain for compatibility. The table describes actual behavior, rather than inferring a promise from a field name. Schema validation does not guarantee file permissions, an approver, or a queue reader.

| Ключ · Key | Тип · Type | Умолчание · Default | Действие и пример · Effect and example | Ошибка и граница · Failure and boundary |
|---|---|---|---|---|
| `putBazy` | string | Явного пути нет · No path default | `/var/lib/example-memory/core.db`: путь SQLite · SQLite path | Нечитаемый/незаписываемый путь делает службу недоступной · An inaccessible path makes the service unavailable |
| `agent` | string | Явного имени нет · No name default | `example-agent`: владелец записей и логическая область · Record owner and logical scope | Неверное имя смешивает интеграционную адресацию; это не UID · A wrong name breaks addressing; this is not a UID |
| `sprashivat` | string[] | `[]` в схеме; эффективно `ogranichenie, navyk` · Schema `[]`; effective approval classes | `[ogranichenie, navyk]`: классы с подтверждением · Classes requiring approval | `[]` не отключает спрашивание; непустой список заменяет умолчание · `[]` does not disable approval; a nonempty list replaces the default |
| `klassyZnaniy` | string[] | Не задано через `.default(null)`; восемь классов · Absent via `.default(null)`; eight classes | `[reshenie, urok, vyvod, ogranichenie, oshibka, poryadok, nablyudenie, fakt]` | Явный `[]` отличается от отсутствия и исключит знания из отбора · Explicit `[]` differs from absence and excludes knowledge from selection |
| `chtenieSkolko` | number | `20` | Предел обычного `prochitat`, если вызов не задаёт свой · Default `prochitat` count unless overridden | Это не общий размер памяти и не предел контекста · Not a database-size or context limit |
| `sledPodyomov` | string | Отсутствует · Absent | `/var/lib/example-memory/startup.log`: внешний след загрузки · External startup trace | Нет пути/файла — «не проверено», не доказанный обход · Missing path/file means unverified, not proven bypass |
| `predelZnakov` | any | Отсутствует · Absent | Старый ключ распознаётся для диагностики · Legacy field retained for diagnostics | Фильтр длины удалён; не рассчитывай на обрезку · The length filter was removed; do not rely on truncation |
| `predelyZnakovPoKlassam` | any | Отсутствует · Absent | Историческая таблица пределов классов · Historical class-length limits | Не действует как ограничение сохранения · Not an active storage limit |
| `maskirovatObrazcy` | boolean | `true` | Маска образцов секретов на пути записи знаний и сводок · Secret-sample masking on the knowledge/summary write path | `false` выключает маску: запись с образцом секрета отвергает фильтр, а не сохраняет открытой · `false` disables masking: the filter refuses a record with a secret sample rather than storing it in the clear |
| `zhurnalSkolko` | — | — | Снят из Config (A-N-1870) · Removed from Config | Не читался ни в одной редакции; журнал берёт `skolko = 20` сам; ключ в профиле игнорируется · Never read; the journal uses its own `skolko = 20`; a profile key is ignored |
| `otvechayushchegoNet` | boolean | `false` | `true`: на узле отсутствует канал согласования, запись получает отметку · Node lacks an approval channel; accepted records are annotated | Это не подключение отвечающего и не семантическое подтверждение · Does not add an approver or confirm semantic truth |
| `otvechatNaSprosRazresheniya` | boolean | `false` | `true`: обработчик `approval/request` даёт разрешение, ведёт счёт · Handler grants approval requests and records counts | Ветки отказа у обработчика нет; затрагивает запросы платформы, не только память · No refusal branch; affects platform requests, not only memory |
| `isklyuchitSessii` | string[] | `[]` | `[public-session-]`: сопоставление начала id сессии · Session-ID prefix match | Пустой префикс нельзя принимать за безопасное правило; сервис сообщает ошибку · An empty prefix is not a safe rule; the service diagnoses it |

Классы `svodka-kompakcii` и произвольные рабочие записи могут сохраняться локально, но не входят в стандартный набор знаний для долговременной подачи. Добавление класса требует согласовать секретаря, ядро и потребителя; один расширенный список не создаёт нового производителя данных.

`svodka-kompakcii` and arbitrary working records may be stored locally but are not part of the default knowledge set for long-term injection. Adding a class requires agreement among the secretary, core, and reader; expanding one list does not create a producer.

`config.koren` больше не читается (A-N-1870): корень долговременной доставки — всегда `agent`. Прежде override применялся только к записи и поиску по телу, а проверка видимости (`aktivnye`) смотрела в `agent`, поэтому заданный `koren` разводил запись и проверку; ни в одном профиле он не был задан.

`config.koren` is no longer read (A-N-1870): the long-term delivery root is always `agent`. The override used to apply only to writes and body search while the visibility check (`aktivnye`) used `agent`, so a set `koren` split writes from checks; no profile set it.

## Настройки и параметры вызова · Configuration versus call arguments

`maskirovatObrazcy` объявлен в Config (A-N-1870): отсутствие означает включённую маску, явное false выключает её. `otvechayushchegoNetVVyzove` и предел повтора относятся к конкретному вызову. Очередь `dostavitOtlozhennoe({predelPopytok:5})` вызывается интеграцией; изменение параметра не создаёт таймер.

`maskirovatObrazcy` is declared in Config (A-N-1870): absence enables masking and explicit false disables it. `otvechayushchegoNetVVyzove` and retry limits apply to individual calls. An integration calls `dostavitOtlozhennoe({predelPopytok:5})`; changing the argument does not create a timer.

Часть входов ограничена только схемой типа, поэтому нельзя обещать диапазон, которого Config не задаёт. Эксплуатационный пример использует положительные числа и стабильные имена; дополнительные проверки находятся в конкретных методах хранилища.

Some inputs are constrained only by their schema type, so no undocumented numeric range should be promised. Operational examples use positive numbers and stable names; additional validation lives in individual storage methods.

Предел очереди5 — накопленный бюджет попыток, а не пять сетевых повторов за вызов. Один проход делает максимум одну допустимую попытку на запись; недоступный слой или неисполненная проверка не должны расходовать этот бюджет.

A queue limit of 5 is a cumulative attempt budget, not five network retries per call. A pass makes at most one eligible write attempt per record; an unavailable provider or an unperformed check must not consume that budget.
