# 0.1.0-alpha.48 · Обезличивание / Anonymization

Принятый отказ недоступной политики сохранён; нейтральные исторические подписи и сообщения. Подача, отбор, доверие и алгоритм восстановления не меняются.

Retain accepted missing-policy refusal; neutral historical labels and messages. Delivery, selection, trust and restoration logic are unchanged.

Исправлен стенд загрузки: берёт записанное событие из результата Session.append, проверяет отказ именно из-за отсутствия id и возврат исправного сообщения. SDK задаётся DSH_SESSION либо существующими DSH_TEST_APP/STEND_APP. Исполняемый код восстановителя не меняется.

Fixed the load-validation stand: use the event returned by Session.append, check refusal specifically for a missing id, and recheck the healthy message after recovery. Select the SDK through DSH_SESSION or existing DSH_TEST_APP/STEND_APP. Restoration runtime code is unchanged.

# Следующая версия · Next release

Без политики исключения сессий ядра — отказ обращения к памяти с причиной; восстановление политики разрешает следующий вызов. Версия выпуска назначается отдельно.

Without core session-exclusion policy, refuse memory access with a reason; policy recovery permits the next call. The release version is assigned separately.

# История изменений · Change history

## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- `package.json`: `engines.node >=22` (как у dsh-pamyat-omega).
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.1 — облачный аудит, модуль №3 (A-N-1948): код Зари, доки Авроры · cloud audit module 3

- №4: devDependencies cordis 4.0.1 → 4.0.4 — `npm install` в каталоге пакета без ERESOLVE.
- №23 (Заря, дельта-2 08:31Z, поправка 08:39Z): Файл отметок welcome создаётся с режимом 0o660 (writeFileSync(…, { mode: 0o660 })), который подчиняется umask и ACL по умолчанию: с ACL по умолчанию — 0660 с маской rw-, без ACL при umask 0022 — 0640. Прочим учёткам доступа нет (проба stend-klass-nol проверяет только это). Режим действует лишь при создании: существующий файл не меняется.
  The welcome marks file is created with mode 0o660 (writeFileSync(…, { mode: 0o660 })), subject to umask and default ACLs: 0660 with ACL mask rw- under a default ACL, 0640 without an ACL under umask 0022. Other accounts get no access (the stend-klass-nol probe checks only that). The mode applies only on creation: an existing file is not changed.
- Документация (Аврора): README RU/EN (№21; №16 — два читателя `newConversationRestore`), docs.

## 1.1.51 — 2026-10-09 · LICENSE в архиве / LICENSE in the archive (A-N-1887)

В архив входит LICENSE (MIT, A-N-1865 722421f). · The archive includes LICENSE (MIT, A-N-1865 722421f).

Ещё в архиве с прежнего номера · Also in the archive since the previous version: поле `"license": "MIT"` в package.json · `"license": "MIT"` field in package.json; история CHANGELOG восстановлена (A-N-1882 F04, Заря) · CHANGELOG history restored (A-N-1882 F04). Код пакета не менялся · Package code is unchanged.

## 1.1.50 — 2026-10-07 · Брифинг каждому /new / Briefing for every /new

Выпуск рабочей сборки 1.1.49-b1762 (B-N-1762), код без изменений против неё. Release of working build 1.1.49-b1762, code unchanged.

### рабочая 1.1.49-b1762

B-N-1762 (Аврора; условие Вениамина, наряд Забавы 07.10; находка Искры 12:41Z). Предел `welcomeInterval` для сессий `telegram-v2-*` считается на СЕССИЮ, как у всех, а не на агента (A-N-1719). ID `telegram-v2-<uuid>` строит только переход /new, поэтому каждая новая v2-сессия — новое поколение разговора и получает брифинг знаний независимо от 24 ч; перезапуск той же сессии в пределах 24 ч — без брифинга, как прежде. Прежде второй /new одному агенту за сутки давал сессию без знаний. Стенд `stend-welcome-v2` переписан под новое правило.

B-N-1762. `welcomeInterval` for `telegram-v2-*` sessions is per SESSION, like all others, not per agent (A-N-1719). `telegram-v2-<uuid>` ids are created only by the /new transition, so every new v2 session is a new conversation generation and receives a knowledge briefing regardless of 24 h; restarting the same session within 24 h still gets none. Previously a second /new to one agent within a day produced a session without knowledge. `stend-welcome-v2` rewritten for the new rule.

## 1.1.49 — 2026-10-07 · Брифинг знаний для сессий /new / Knowledge briefing for /new sessions

A-N-1719 (Искра; решение Забавы 07.10, находка B-N-1704). Сессии `telegram-v2-*` (/new и очереди по собеседникам) больше не исключены из welcome: они получают брифинг ЗНАНИЙ, без последней сводки компакта (она — прошлый разговор; изоляцию /new по-прежнему держит `stend-new-session`, канарейка теперь стоит только на сводке). Для v2 предел `welcomeInterval` считается на агента — по самой свежей отметке любой его сессии, чтобы новый собеседник не давал ещё один брифинг; прочие сессии — на сессию, как прежде. Стенд `test/stend-welcome-v2.mjs`.

A-N-1719. `telegram-v2-*` sessions (/new and per-interlocutor queues) are no longer excluded from welcome: they receive a KNOWLEDGE briefing without the latest compaction summary (a previous conversation; /new isolation is still held by `stend-new-session`, whose canary now sits on the summary only). For v2, `welcomeInterval` is per agent, using the latest marker of any session, so a new interlocutor does not trigger another briefing; other sessions keep the per-session limit. Stand `test/stend-welcome-v2.mjs`.

## 1.1.48 — перенумерация (A-N-1562): прежний 0.1.0-alpha.48, код не менялся · renumbering, code unchanged

## Документационный кандидат · Documentation candidate

Добавлены подробные парные RU/EN руководство,схемы событий/состояний/решений,все настройки,границы бюджетов/отметок и диагностика. Код и номер версии сохранены; комментарии объясняют фактический порядок чтения и инъекции.

Added paired RU/EN guidance,event/state/decision diagrams,complete settings,budget/mark boundaries and troubleshooting. Code and version remain unchanged; comments explain actual retrieval and injection order.

## Существующие возможности · Existing capabilities

Восстановление различает собственную и общую поверхность компакции,старую сводку и неизвестный возраст. Welcome учитывает доверие,разные строки kem модели с зависимостью от протокола ядра,видимые notices отмены,пометки неподтверждённости и фактические ids в sections. Касания и частотные отметки отделены от доказательства durable commit; исключения сессий требуют метода ядра.

Restore distinguishes custom/general compaction surfaces,old summaries and unknown age. Welcome uses trust,distinct model kem strings dependent on the core protocol,visible cancellation notices,unconfirmed annotations and actual IDs in sections. Accesses and frequency marks differ from durable commit proof; session exclusion requires the core method.

Внутренняя история поручений и адресов установок остаётся вGit. Это публичное описание возможностей и ограничений.

Internal work-item and deployment history remains inGit. This is a public description of capabilities and limits.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке. · EN: Entries restored from the git diff of the named commits on 2026-10-08; these are not release numbers or production measurements.

- `060eee4001d4` (2026-09-03) — Каждая строка restore в stderr несёт имя и версию, прочитанную из собственного package.json (`[dsh-pamyat-restore <версия>]`, при нечитаемом манифесте — «версия неизвестна»), а не одно имя (src/index.js, `say`); test/stend-krik-zvuchit.mjs сверяет строку подъёма с версией манифеста. · EN: Every restore stderr line carries the name and the version read from its own package.json, and the stderr stand checks the startup line against the manifest version.
- `38b2c32dbd3f` (2026-09-03) — В test/stend-restore.mjs добавлена межпакетная проба: умолчание `klassSvodki` должно совпадать с классом, под которым dsh-pamyat-secretary пишет сводку (`Config().klass`); расхождение даёт FAIL с обоими классами, отсутствие соседнего пакета — слепоту, а не «сошлось». Только тест, исполняемый код не менялся. · EN: Test-only cross-package probe in test/stend-restore.mjs: the `klassSvodki` default must equal the class dsh-pamyat-secretary writes summaries under; a missing secretary package is reported as blindness, not a pass.
- `653a46f84d72` (2026-09-25) — test/stend-restore.mjs убирает временное и созданные им файлы отметки restore на любом выходе — обычном, падении пробы, `process.exit`, SIGTERM/SIGINT. Исполняемый код не менялся. · EN: test/stend-restore.mjs removes its temporary data and restore mark files on any exit, including SIGTERM/SIGINT; runtime code is unchanged.
- `1603fd0bcc5b` (2026-09-25) — То же правило уборки временного в test/stend-klass-nol.mjs и test/stend-readme.mjs; test/stend-kasaniya-podannyh.mjs получил обработчик SIGINT, чтобы уборка в `exit` срабатывала и при прерывании. Исполняемый код не менялся. · EN: The same temporary cleanup is applied to two more stands, and stend-kasaniya-podannyh gains a SIGINT handler so its exit cleanup also runs on interrupt; runtime code is unchanged.
