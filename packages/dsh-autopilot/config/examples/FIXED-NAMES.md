# Фиксированные Unix-имена в коде

Основа: `32c91d0b`, dsh-autopilot 0.1.16. Заглушки конфигурации не делают текущий runtime независимым от имён. Код этим комплектом не меняется.

Оператор — `master`, исполнители — `vintik`, `shpuntik`, `gayka`, `sova`, `shurup`, `tumbler`; сервисы — `autopilot-post`, `autopilot-copy`. Имена не являются секретами. Свободно меняются UID, приватные пути, ID чатов/ботов и отображаемые обращения, в пределах проверок.

Главные ограничения:

- `lib/mail_service.py:26,68–83` — TEAM и Unix-группы всех семи; `lib/mail_copies.py:12,24,37` и `lib/mail_retention.py:11,79` требуют ровно те же ключи configs.
- `lib/pilot_mail.py:35,535,673` — фиксированные роли отправителя/получателя; `lib/mail_registration.py:85` — регистрацию создаёт только оператор.
- `lib/runtime-guard.py:11`, `runtime/ap_sadik.py:1269` — runtime/publisher только под оператором; `lib/public_tree.py:8,70` — оператор и public path.
- `runtime/time_collection.py:83,110,133,173,197` — оператор в roster, владелец почтовой БД, проверка UID finish и UID publisher.
- `lib/operator_window.py:68–70` — `master.service` и `coder-gateway-master.service`; `runtime/run_catalog.py:150,193,299,353` — Unix-оператор/группа каталога. Это используется forward-helper `window/katalog-okno.py:236–239`.
- В соседнем пакете `dsh-telegram-multiagent/src/autopilot-notice.js:3–19` — фиксированный TEAM и отдельная ветка оператора. `src/claude-turn-usage.js:10–12` берёт **Unix-учётку**, не отображаемое имя TG.
- `systemd/autopilot-mail.service` / `autopilot-copy.service` / `autopilot-mail-failed@.service` закрепляют сервисные имена; notice-template закрепляет `/opt/%i/...`; usage-unit — public/operator path. При другой раскладке адаптируй unit-файлы до их запуска.

## Фиксированный путь спула

В `spool-acl.conf.in` `/var/spool/dsh-trevogi` оставлен буквально: это связанная раскладка текущих служб, а не частный адрес исходного сервера. В AP `systemd/autopilot-mail.service:20,32` путь закреплён в ExecStartPre и ReadWritePaths; `systemd/autopilot-mail-failed@.service:14` — в ReadWritePaths. В соседнем пакете `dsh-trevogi/systemd/agent-alert-otpravitel.path:7` за ним следит DirectoryNotEmpty, а `systemd/dsh-trevogi-spul.tmpfiles:4–8` создаёт его каталоги.

Сам клиент не требует неизменного пути: `dsh-trevogi/lib/dsh-trevogi/nastrojki.py:32` задаёт умолчание `AGENT_ALERT_SPUL`, `lib/dsh-trevogi/klient.py:62–64` читает эту настройку. Одной замены переменной недостаточно для AP: иной корень требует согласованной адаптации конфигурации тревог, path-unit, tmpfiles, AP service sandbox и ACL-fragment. Код/юниты этим комплектом не меняются; для приведённой раскладки оставь путь из E05.

## Указатели на Python-литералы пакета

Ниже сгруппированы найденные AST строковые литералы этих имён: `файл:строки` относительно корня dsh-autopilot. Поиск охватывает lib/runtime/tools/window/checks, исключает test/stend-файлы и многострочные тексты. Он включает вспомогательные/исторические readers и диагностические строки: **не каждый найденный литерал — отдельное ограничение активного v5**. Это указатель для будущей адаптации, не гарантия отсутствия вычисляемых имён, shell/JS-литералов или имён в vendor-архиве.

| Файл | Строки |
|---|---|
| `lib/accepted_inventory.py` | 6, 28, 98, 105 |
| `lib/mail_copies.py` | 12, 13 |
| `lib/mail_registration.py` | 85 |
| `lib/mail_retention.py` | 11, 49, 51, 56, 57, 58, 123, 132 |
| `lib/mail_service.py` | 26, 27, 80, 106, 107, 214, 257 |
| `lib/operator_window.py` | 68, 70, 199, 200 |
| `lib/owner_inventory.py` | 83, 122, 185, 189, 216, 223 |
| `lib/pilot_archive.py` | 115, 116 |
| `lib/pilot_mail.py` | 35, 199, 208, 242, 307, 466, 535, 591, 673, 674, 717 |
| `lib/post_layout.py` | 47, 52, 54, 55, 56, 57 |
| `lib/public_tree.py` | 8, 58, 66, 70 |
| `lib/release_rollback.py` | 307 |
| `lib/runtime-guard.py` | 6, 11, 12 |
| `runtime/ap_sadik.py` | 1269, 1270 |
| `runtime/run_catalog.py` | 24, 150, 193, 299, 353 |
| `runtime/runtime_incremental.py` | 270, 515 |
| `runtime/runtime_receipt_source.py` | 187, 217, 229, 282, 289, 430, 457, 514, 555, 560, 570, 574, 698, 839, 952, 966, 977, 1030, 1224, 1345, 1355, 1379, 1420, 1448, 1554 |
| `runtime/session_ownership.py` | 78, 81 |
| `runtime/team_usage.py` | 495, 511, 514, 693, 772, 795, 801, 870 |
| `runtime/time_collection.py` | 83, 110, 133, 173, 197 |
| `runtime/usage_registration.py` | 266, 285, 416, 462, 476, 477, 522 |
| `tools/claude-root-origin.py` | 80, 84, 95, 103, 117, 123 |
| `window/katalog-okno.py` | 138, 148, 149, 182, 185, 187 |
| `window/notice-10min.py` | 5 |
| `window/pdry-server.py` | 2 |
| `window/preserve.py` | 14 |
| `window/receipt/judge-receipt.py` | 5, 51 |
| `window/receipt/probe-receipt.py` | 24, 27, 28, 29, 39, 43, 45, 46 |
| `window/receipt/usage-reference.py` | 42, 62 |
| `window/writer-common.py` | 4, 81, 83 |
