# Диагностика и восстановление · Troubleshooting and recovery

Начни с адреса предмета: версия из manifest, фактический процесс платформы, база из `putBazy`, logical `agent` и время последней загрузки. Скопированный README другого агента не доказывает, что его путь или scope применим здесь.

Start with the actual subject: manifest version, platform process, database from `putBazy`, logical `agent`, and last-load time. Another agent's README does not establish that its path or scope applies here.

| Признак · Symptom | Что проверить · Evidence | Действие · Action |
|---|---|---|
| `dostupna()=false` | `pochemuNedostupna()`, Node SQLite import, владельца пути · Reason, SQLite import and path owner | Исправить Node/путь/права, затем перезагрузить профиль и отдельно проверить запись · Fix runtime/path/permissions, reload and verify a write |
| Память пуста · Empty memory | `svodka()` и природы отказов, agent и классы · Summary, refusal reasons, agent and classes | Отличить отсутствие данных от отказов, не отключать политику наугад · Distinguish no data from refusal; do not disable policy blindly |
| «Нет канала» · Missing approval channel | Наличие approval service и policy сессии · Approval service and session policy | Подключить отвечающего либо явно описать узел без него · Provide an approver or explicitly describe an approver-less node |
| `sprashivat: []` всё ещё спрашивает · Empty list still requests approval | Умолчание `ogranichenie/navyk` · Effective default | Это предусмотрено; пустой массив не является выключателем · Expected behavior; an empty array is not a disable switch |
| Секрет распознан · Secret detected | Код причины и синтетический пример · Reason code and synthetic reproduction | Удалить значение секрета, сохранить путь/назначение, не печатать оригинал в отчёт · Remove the value and retain its purpose/path; do not log it |
| Отказ «поле...» · Field validation refusal | Тип полей и нормализацию · Field types and normalization | Исправить конкретное поле; не копировать исполняемые куски вместо знания · Fix the specific field; do not store executable fragments as knowledge |
| Локальный id есть, внешнего нет · Local ID without external ID | Журнал доставки и очередь · Delivery journal and queue | Локальная запись успешна отдельно; изучить подтверждение провайдера · Treat local success separately and inspect provider confirmation |
| `moglo-dojti-bez-id` | Исход вызова и внешний поиск без повторной записи · Call outcome and external read-only search | Ручная сверка; автоматический повтор может создать дубль · Reconcile manually; retry may duplicate |
| Очередь не уменьшается · Queue does not shrink | Вызывается ли `dostavitOtlozhennoe`, доступен ли провайдер · Queue caller and provider availability | Назначить вызывающего/читателя; не считать один метод таймером · Assign caller/reader; a method is not a timer |
| «Исчерпано» · Exhausted retries | Число реальных попыток и причины · Actual attempts and reasons | Исправить причину и восстановить доставку по принятому операторскому порядку · Fix cause and resume under an explicit operational procedure |
| `PAMYAT_OCENKA_NE_VYDAVALOS` | Текущий процесс и запись приветствия · Current process and welcome issuance | Сначала получить и применить запись; не оценивать произвольный id · Receive and apply the record first; do not rate an arbitrary ID |
| `PAMYAT_OCENKA_UZHE_PO_VYDACHE` | Момент `poslednyaya_vydacha` и оценки · Issuance timestamp and ratings | Один раз на выдачу; ждать новой реальной выдачи · One rating per issuance; wait for a new issuance |
| «Новая разница неизвестна» · New discrepancy unknown | Наличие и корректность диагностической отсечки · Presence and validity of baseline | Снять основание вручную; не устанавливать ноль без измерения · Establish a measured baseline; do not assume zero |
| Включён привратник, регистрация не удалась · Handler enabled but not registered | Возвращена ли функция удаления · Returned disposer | Проверить контракт платформы; отсутствие исключения не доказывает регистрацию · Check platform contract; no exception does not prove registration |
| Сессия исключена · Session excluded | `isklyuchitSessii`, id и его префикс · Exclusion list and session prefix | Исправить классификацию у вызывающего; не обходить отказ другим id · Fix caller classification; do not bypass with another ID |

## Отдельное подтверждение знания · Explicit knowledge confirmation

`src/podtverdit-znanie.mjs` — операторский CLI, который требует базу, id и автора подтверждения. Он сохраняет факт и руку вызова; прежняя отметка «принято без подтверждения» остаётся как история. Сначала прочти `--pomoshch` выбранной редакции; не выдавай команду подтверждения за простой read-only просмотр. Даже `--status` открывает обычное хранилище и может применить миграции схемы; для строгого read-only используй явно read-only SQLite-соединение.

`src/podtverdit-znanie.mjs` is an operator CLI requiring the database, record ID, and confirmation author. It retains the confirmation and caller identity; the old accepted-without-approval flag remains as history. Read that version's `--pomoshch` first; confirmation is a write, not a read-only inspection. Even `--status` opens normal storage and may apply schema migrations; use an explicitly read-only SQLite connection for strict inspection.

## Что сохранять в отчёте · What to retain in an incident report

Сохрани версию, путь базы, код отказа, число записей/событий с единицами и scope, список исполненных стендов и непокрытые проверки. Текст ключей и приватную переписку в отчёт не включай. Перед исправлением базы сделай проверенную страховку и разберись, какая служба держит её открытой.

Retain the version, database path, refusal code, record/event counts with units and scope, executed stand list, and untested checks. Exclude secret values and private correspondence. Before repairing a database, create and verify a backup and determine which service has it open.

`svodka().poPrirode`: если одна `priroda` встречается у нескольких разных `ishod`, числа групп одной природы складываются (A-N-1948 №3, находка 25; прежде присваивалось последнее сгруппированное число). Распределение по исходам — в строках журнала по `(ishod, priroda)`; общий `otkloneno` суммируется отдельно.

`svodka().poPrirode`: if the same `priroda` appears under several `ishod` values, the counts of groups of one nature are summed (A-N-1948 №3, finding 25; previously the last grouped count was assigned). The distribution by outcome is in journal rows grouped by `(ishod, priroda)`; total `otkloneno` is accumulated separately.
