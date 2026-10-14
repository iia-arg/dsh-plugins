# Все поля Config · Complete Config fields

| Ключ · Key | Тип · Type | Умолчание · Default | Пример и действие · Example and effect | Граница · Limit |
|---|---|---|---|---|
| `restoreEnabled` | boolean | `true` | Включить pending restore · Enable pending restoration | Не включает producer сводки · Does not enable a summary producer |
| `welcomeEnabled` | boolean | `true` | Включить welcome · Enable welcome | Не снимает ограничения новых сессий/интервала · Does not override new-session/frequency exclusions |
| `welcomeBudget` | number | `800` | Пример 1500; UTF-16 длина строк знаний · Example1500; knowledge-line UTF-16 length | Мягкий бюджет, первая строка/рамка/сводка/отмены вне строгого общего cap · Soft budget, not a total-message cap |
| `welcomeInterval` | number | `86400000` | Cooldown по дисковой отметке между процессами/попытками · Disk-mark cooldown across processes/attempts | Отметка до чтения/возврата, не durable-commit proof · Mark precedes retrieval/return, not durable commit proof |
| `welcomeOtmetki` | string | `homedir()/.dsh-pamyat-welcome-otmetki.json` | `/var/lib/example-memory/welcome.json` | Выбирай отдельный агентский путь: homedir может быть общим · Use a per-agent path when homedir is shared |
| `ignoreAfterMs` | number | `604800000` | Возраст строк знаний 7 суток, не целой сводки · Knowledge-line age 7 days, not whole summary | Возраст не меняет базу/истину знания; только отбор · Filters output, not storage or truth |
| `useVeraThreshold` | number | `0.7` | Верхний порог use · Upper use threshold | События/происхождение оценок также влияют · Trust events/rating provenance also apply |
| `ignoreVeraThreshold` | number | `0.3` | Нижний порог ignore · Lower ignore threshold | Должен быть ниже use; ошибка лишь диагностируется · Must be below use; bad config is only diagnosed |
| `klassSvodki` | string | `svodka-kompakcii` | Совпадает с klass секретаря · Matches secretary klass | Несовпадение читается как отсутствие нужной сводки · Mismatch appears as missing summary |

Файл welcomeOtmetki — карта session-id→timestamp. Отсутствующий или нечитаемый JSON возвращает 0 как «давно/никогда», поэтому повреждение файла может снова разрешить welcome. Запись не атомарна в той же мере, что отдельная compaction-ok отметка; она не имеет такого же fsync-протокола.

welcomeOtmetki maps session IDs to timestamps. Missing or unreadable JSON yields0 as never/long ago, so corruption can admit welcome again. Its write is not as durable as the separate compaction-ok mark and uses a different protocol without the same fsync sequence.

Связанный файл `<welcomeOtmetki>.compaction-ok.json` хранит свидетель успешного платформенного сжатия с version/scope/session/compactionId/time. Это свидетель того, что сжатие произошло в области данного файла, не свежая сводка и не её содержание. Он нужен, чтобы отличить законное отсутствие сводок от пропажи после подтверждённого сжатия.

`<welcomeOtmetki>.compaction-ok.json` stores evidence of successful platform compaction with version/scope/session/compactionId/time. It proves that a compaction occurred in this file's scope, not that a summary is fresh or semantically correct. It distinguishes legitimately absent summaries from loss after observed compaction.

Настройка не создаёт права на запись каталога и не устанавливает systemd-читалку. Проверяй actual владельца, доступность пути, подходящее имя класса и оба порога до первой выдачи. Поиск/фильтр ядра и необязательный сервис byudzhetPamyati имеют собственные настройки.

Configuration does not create directory permissions or a systemd log reader. Check actual ownership, path access, summary class and both thresholds before the first welcome. Core retrieval/filtering and the optional byudzhetPamyati service have their own configuration.

Process set не допускает второго welcome для того же sid в этом процессе, даже по истечении welcomeInterval. Прочитываются максимум 10 записей независимо от welcomeBudget; полный summary читается отдельно и не проходит эти age/trust-проверки. Ошибка чтения после отметки может оставить sid без welcome до нового процесса/позволенного повода.

The process set prevents another welcome for the same sid even after welcomeInterval expires. At most10 records are read regardless of welcomeBudget; the whole summary is read separately without those age/trust checks. Read failure after marking can leave the sid without welcome until another process or eligible trigger.
