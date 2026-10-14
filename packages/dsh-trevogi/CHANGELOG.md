# История · Changelog

## 3.1.2 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `engines.node` ">=18" — кода на Node в пакете нет (bash/python), это граница установки через npm, а не проверенная среда кода · `engines.node` ">=18" — no Node code in the package (bash/python); the bound is for npm installation, not a tested code runtime
- README: строка «Версия · Version: 3.1.2» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.1 → 3.1.2 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.1 — 13.10.2026 · A-N-1948, модуль №9

HTML закрывается стеком, включая расширенные теги. Сетевые ошибки, 5xx/429 и
не-JSON повторяются ограниченно; retry_after 0..300 с, default3/max10 попыток.
Обрезка проверяет чтение/счёт и сохраняет пустые строки/inode; '=' в пути сохраняется.
Сторож пишет курсор атомарно, фиксирует попытку до канала, не повторяет неизвестную
доставку; подтверждённую отправку завершает восстановлением курсора без отправки.
Ошибки дают СЛЕПОТА2 без трассировки; help0 отдельно, journal доступ только root/adm/
systemd-journal. Проверка настройки отвергает world-readable token. Юниты явно root
с минимальными ограничениями. RU/EN договор, исходы, установка и пробы обновлены.

Результат подготовки на копиях; монтаж и живые признаки — назначенной рукой.

## 2.0.2 — agent-alert: метка источника по положительному признаку (B-N-1830; перенос боя в дерево B-N-1872, Аврора) · source tag by positive sign

Метка источника тревоги — по положительному признаку (B-N-1830, Михалыч; в бою sadik с 08.10 09:29:24Z, в дерево перенесено побайтно, B-N-1872): таймер — без метки; служба без таймера — «служба <юнит>»; `cron.service` — «по cron»; «ПОЗВАНО РУКОЙ» — только `session-*.scope`; прочее — «источник не установлен (<хвост cgroup>)». Было: всё, что не таймер, — «ПОЗВАНО РУКОЙ», и служба агента получала ложную метку. Отправка, настройка и ключи не изменились. Стенды пакета метку не проверяют.

Alert source tag is based on a positive sign (B-N-1830): timer — no tag; service without a timer — “служба <unit>”; `cron.service` — “по cron”; “ПОЗВАНО РУКОЙ” (called by hand) — only `session-*.scope`; anything else — “источник не установлен (<cgroup tail>)”. Previously everything that was not a timer was tagged as called by hand, so an agent service got a false tag. Sending, settings and options are unchanged. Package tests do not check the tag.

## 2.0.1 — перенумерация (A-N-1562): прежний 1.0.1, код не менялся · renumbering, code unchanged

## 1.0.1

Новый режим `agent-alert --proverit-nastrojku`: настройка разрешается тем же читателем, файлы токена и чата проверяются на наличие, читаемость текущей учёткой и непустую первую строку; все причины разом, код 0 — годна, 2 — нет. Сеть, журнал и хвост не трогаются, значения не печатаются. Отправка и прочие ключи не изменились. Стенд отправщика: 31 проверка вместо 21.

Проба с меткой `DSH_PROBA=1` пишет в журнал и первые 120 знаков текста (`исход=проба, не отправлено текст[0:120]=…`, перевод строки → ⏎): видно, что именно не отправлено. Молчание — только по явной метке 1, без метки отправка прежняя. Новые пробы: текст пробы в журнале (с порчей) и «нет файла чата» в проверке настройки.

New `agent-alert --proverit-nastrojku` mode: settings are resolved by the same reader; token and chat files are checked for existence, readability by the current account and a non-empty first line; every reason is reported, exit 0 — usable, 2 — not. Network, journal and tail stay untouched and values are not printed. Sending and other options are unchanged. Sender test: 31 checks instead of 21.

A probe with `DSH_PROBA=1` also writes the first 120 characters of the text to the journal (`исход=проба, не отправлено текст[0:120]=…`, newline → ⏎), showing what was not sent. Silence only with the explicit mark 1; without it sending is unchanged. New tests: probe text in the journal (with a mutation) and “missing chat file” in the configuration check.

## 1.0.0

Первый состав исходников: общий отправщик, обрезка хвоста, читатель отказов и их юниты/стенды. Добавлены метка пробы отправщика, общий config путей с приоритетом env, нейтральные умолчания и очистка ответа curl от прочитанного токена. Исполняемое поведение прежнего отправщика сохранено без метки и при сохранённых путях; неизвестный ввод обрезки теперь даёт отказ.

First source package: shared sender, tail trimmer, refusal reader and their units/tests. Adds the sender probe mark, shared path configuration with environment precedence, neutral defaults and curl-response redaction of the loaded token. Existing sender behavior is retained without the mark and with preserved paths; unexpected trimmer input now fails.

Комментарии и документация обезличены, ключевые якоря HTML сохранены. Стенды включают config, курсор, обрезку, подставной канал и различающие порчи. Живую доставку они не проверяют.

Comments and documentation are anonymized; key HTML anchors remain. Tests cover configuration, cursor, trimming, a substituted channel and distinguishing mutations. They do not test live delivery.
