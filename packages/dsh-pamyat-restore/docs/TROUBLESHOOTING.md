# Частые неисправности · Troubleshooting

| Признак · Symptom | Причина/проверка · Cause/evidence | Действие · Action |
|---|---|---|
| restore/welcome не появились · No context | core unavailable, array error, pre-step reject, excluded sid | Читать stderr и решение next, не фабриковать память · Inspect stderr/next, never fabricate memory |
| Ноль сводок · No summaries | klass mismatch или ещё не было успешного compaction · Class mismatch or no successful compaction | Сверить `klassSvodki` с секретарём и .compaction-ok · Reconcile class and success evidence |
| Старая сводка вставлена · Old summary inserted | Источник старше текущего рубежа · Source predates boundary | Pending-restore предупреждает; у welcome полной сводки такой проверки нет · Pending restore warns; whole-summary welcome lacks this check |
| Брифинг повторяется · Repeated welcome | File corrupt/unreadable/write failure, shared path | Проверить mark-файл и агентскую адресацию · Check mark file and per-agent path |
| welcome не повторяется после старта · No repeat | Process set, `welcomeInterval` (на сессию; `telegram-v2-*` тоже получает welcome — знания без сводки компакта) · Process set, per-session `welcomeInterval` (`telegram-v2-*` also gets welcome — knowledge without the compaction summary) | Это разные ограничения; читать причину · Inspect actual exclusion reason |
| verify вместо use · verify, not use | Время/вера не измерены, ratings invalid, one issuance, trust event | Не заменять null порогом, получить фактическую проверку · Preserve null, obtain real evidence |
| ignore много записей · Many ignored | Age > 7 days / confidence < 0.3 / dead event | Сверить единицы ms, порог и фактический timestamp · Check ms units, thresholds and timestamps |
| Отмена видна без текста · Cancellation notice | decide ignore + vidimo, not contents | Это intentional notice, не касание знания · Notice is not content issuance |
| Сообщение длиннее `welcomeBudget` · Oversized message | First line, framing, summary, cancellation notices | Не объявлять budget строгим cap; смотреть весь инжектированный текст · Inspect total message, soft budget |
| Касаний 0 после выдачи · No accesses | Old core / method missing / refusal, returns before inject | Сверить core method/log/DB; не считать знание невыданным · Reconcile method/log/DB, not assume no issuance |
| Исключённая сессия получает контекст · Excluded session receives context | Missing core method / wrong prefix | Проверить core и consumer до admission · Verify before source admission |

Process latch `globalThis.__pamyatRestore` ограничивает повторный apply. При изменении настроек не считай второйapply доказательством новой конфигурации: в этой реализации он сразу выходит. Сопоставь фактический процесс/версию с файлом; необходимое обновление выполняет назначенная рука по установленному порядку.

The process latch `globalThis.__pamyatRestore` limits repeated apply. A second apply is not proof of updated configuration: this implementation returns immediately. Compare actual process/version with disk; the designated operator applies updates under the deployment's procedure.

Файл частоты не является журналом всех состоявшихся welcome: отметка ставится раньше чтения/возврата. Для доказательства модели нужны событие с sections, возвращённое сообщение и соответствующие ids ядра. Поданный текст не равен проверенному или применённому знанию.

The frequency file is not a journal of every completed welcome: its mark precedes retrieval/return. Model-facing evidence needs the sections event, returned message and matching core IDs. Shown text is not necessarily verified or applied knowledge.

Нет welcome после временного отказа чтения: sid/диск уже отмечены, попытка не повторяется автоматически. Проверь actual отказ и наблюдаемую выдачу, а не только timestamp-файл. Ошибка не является доказательством того, что модель получила брифинг.

No welcome after a temporary read failure: the sid/disk was already marked and the attempt is not automatically retried. Check actual refusal and observed issuance rather than only timestamps. Failure does not prove that the model received a briefing.

## PAMYAT_POLITIKA_NEDOSTUPNA

Метод исключения ядра отсутствует либо служба недоступна: память не читается/не подаётся; omega также не отправляет новые записи. Проверить поднятое ядро и его sessiyaIsklyuchena. Восстановление метода разрешает повторный вызов без снятия защиты.

The core exclusion method or service is unavailable: memory is neither read nor delivered; omega also refuses new writes. Check the loaded core and its sessiyaIsklyuchena. Restoring the method permits another call without disabling protection.
