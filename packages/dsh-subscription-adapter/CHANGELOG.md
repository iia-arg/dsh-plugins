# История · Changelog

## 3.1.2 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `author` — «Aleksandr Argelander» (единый автор семьи; лицензия MIT на его имя) · `author` set to "Aleksandr Argelander"
- README: имя архива · README: own release number updated
- Код не менялся; номер 3.1.1 → 3.1.2 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.1 — 13.10.2026 · A-N-1948 №12

- Переход 1.1.21 → 3.1.1 намеренный: правило владельца 10.10 — каждому модулю 3.1.1 по готовности.
- Недоступное живое давление имеет классифицированную причину и один журнал на mounted adapter; error без schema=1 читается шлюзом как missing, не stale. Код и версия proof требуют подъёма движка в том же окне.
- Сохранены code/cause ошибок NDJSON; отклонённый контрольный event получил CONTROL_EVENT_REJECTED, поток останавливается без скрытого повтора и lease закрывается. Health 503 не подтверждает provider, хвостовые slash baseURL нормализованы, remote HTTP журналирует cleartext warning.
- Пять старых стендов сами создают приватный синтетический ingress key; image-gate использует STEND_APP либо сообщает СЛЕПОТА 2. Новая audit-матрица поставляется в test/.
- Установка описана через проверенный local npm archive; названы service providers, версии и API-признаки, dev/runtime линии и пределы. LIVE-INPUT согласован с gateway provenance для Codex; legacy/v1 inputDelivery остаётся выключен.
- Шлюз, live configuration и действующие профили автором не менялись; монтаж 10 копий и подъёмы — назначенная рука.

## 1.1.21 — 12.10.2026 · B-N-2009: адрес беседы запроса к шлюзу

HTTP-запрос передаёт x-dsh-spool-conversation с key/session_id/session_created только при двух положительных признаках: канал объявил spoolConversation.version=1, health шлюза — spoolConversation:1. Адрес снимка относится к агенту текущего хода; старые шлюз/канал сохраняют прежнее поведение. Стенд stend-spool-conversation.mjs проверяет заголовок и оба признака поддержки.

Состав: **1.1.21 = 1.1.19 (B-N-1811, живой порог давления) + B-N-2009 (заголовок адреса беседы)**. **1.1.18 (B-N-1600 (а)) НЕ входит; 1.1.20 зарезервирован за B-N-1600 (а) и не выпущен**.

У alfa/beta/gamma дельта поведения — только B-N-2009. Для копий на 1.1.17 (marc, anna) монтаж 1.1.21 приносит также B-N-1811: подъём агента и движка — в том же шаге, с положительной проверкой живого давления. Без подъёма движка proof не совпадёт с кодом на диске: live-pressure-code-drift, стопы шлюза выключены до подъёма. Пятеро Claude — iskra/spartak/zarya/varvara/avrora — ждут отдельного окна B-N-1811, сохраняют fallback a2a.

## 1.1.19 — выпуск рабочей 1.1.18-b1811 кодеров: живой порог давления для шлюза (B-N-1811, Альфа; выпуск — Заря)

⚠️ Ветка от **1.1.17**, а не от 1.1.18: выпуск 1.1.18 (B-N-1600 (а), legacy /v1 читает inputDelivery) монтируется только
после «да» владельца и в бою нет ни у одного агента. 1.1.19 = 1.1.17 + B-N-1811 — ровно бой кодеров alfa/beta/gamma с
08.10 00:23:45Z (src/index.js b80dcce1, новый src/live-pressure.js 84ce2f2d). Правку 1.1.18 вносит следующий номер после слова
владельца. Меняются только номер (package.json) и этот заголовок.

Адаптер по `our/compaction-status` отдаёт шлюзу proof живой настройки движка: окно, доля, запас, PID и startticks, версия
и суммы src/index.js и src/live-pressure.js; успешное сжатие — только парное compaction/start → compaction/end сессии.
⚠️ Шлюз сверяет `version` из proof (снят при загрузке движка) с package.json на диске: смена номера без подъёма движка —
`live-pressure-code-drift`, стопы шлюза выключены до подъёма. Монтаж этого номера — вместе с подъёмом движка кодера.

Release of the coders' working 1.1.18-b1811, branched from 1.1.17 (1.1.18 awaits the owner's approval).

> 1.1.18 в бой не ставился: правка B-N-1600 (а) снята из master до слова владельца — ветка b1600a-zhdyot-slova, вернётся как 1.1.20 (решение Забавы 06:49Z; ворота Вениамина 06:46Z, вариант (1)).

## 1.1.18

B-N-1600 (а): legacy /v1 (telegram-a2a) читает inputDelivery из того же health, что и terminal: родной ввод посреди хода больше не ограничен telegram-v2-*. Health спрашивается и при sdkInputVersion=1 без mailStopVersion; ошибка health — ввод next-turn, запрос не прерывается · legacy /v1 reads inputDelivery from the same health as terminal; health failure keeps next-turn input.

## 1.1.17

Scoped NDJSON task-status ready/terminal для подписанного stop, отдельно от ACK и закрытия HTTP.

## 1.1.16 — перенумерация (A-N-1562): прежний 0.1.16, код не менялся · renumbering, code unchanged

## 0.1.16

Согласует inputDelivery capability и request/SDK-bound input-status через scoped lease. Ready не блокирует NDJSON reader; транспортный приём не объявляется исполнением.

Negotiates inputDelivery and delivers request/SDK-bound input status through a scoped lease. Ready does not block the NDJSON reader; transport acceptance is not directive execution.

## 0.1.15

Публикационный состав повторно проверен на принятой основе: документы, комментарии и исполняемые данные обезличены. Runtime не менялся; provider/output/NDJSON договор версии0.1.14 сохранён.
Publication contents rechecked against the accepted base: documentation, comments and executable data are anonymized. Runtime remains unchanged; the0.1.14 provider/output/NDJSON contract is preserved.

## 0.1.14

Provider label берётся из gateway health без изменения route ID; pending старое health не затирает новое v2. Неисполняемый maxTokens не отправляется и не объявляется defaultMaxTokens. NDJSON разбирает EOF хвост/done без newline; битый JSON/UTF8/форма события дают видимый отказ без payload, reader и lease освобождаются.
Provider labels come from gateway health without changing route IDs; old pending health cannot overwrite newer v2 observations. Unenforced maxTokens is neither sent nor advertised as defaultMaxTokens. NDJSON parses EOF remainders/done without newline; malformed JSON/UTF8/event shapes visibly refuse without payload logging, releasing readers and leases.

## Документация, без новой версии · Documentation without a new version

Добавлены документы RU/EN, схемы, таблицы настроек и подробные комментарии границ. Исполняемые токены и AST сохранены; номер выпуска назначается отдельно.
Paired RU/EN documents, diagrams, settings tables and detailed boundary comments were added. Executable tokens and AST are preserved; release numbering is separate.

### 0.1.13

Входной bearer из приватного файла, чтение перед request.
Ingress bearer from a private file read before request.

### 0.1.12

Идентичность беседы v2 и проверка отката.
Generation-aware conversation v2 and rollback guard.

### 0.1.11

Привязка Telegram stop и модальности в метаданных модели.
Telegram stop binding and model-modalities metadata.

### 0.1.10

Привязанный к запросу lease управления вне prompt и закрытие в finally.
Request-specific control leases outside the prompt, closed in finally.

### 0.1.9

Адаптация проверки переполнения к DSH0.2.
Overflow-test adaptation to DSH0.2.

### 0.1.8

Вид reasoning-блока согласован с платформой.
Reasoning content type aligned with the platform.

### 0.1.7

Сверка окна контекста с поставщиком и каталогом.
Context-window verification against provider/catalog.

### 0.1.6

Явно названы зависимости среды разработки для стендов.
Explicit development-test runtime dependencies.

### 0.1.5

Жизненный цикл Cordis без неработавшего обработчика dispose.
Cordis lifecycle without the ineffective dispose handler.

### 0.1.4

Уточнение прогрева и очистки фикстур.
Warmup and fixture-cleanup refinements.

### 0.1.3

Обработка переполнения и ограниченных категорий повтора.
Overflow handling and restricted retry categories.

### 0.1.2

Проверка предела молчания потока.
Silent-stream ceiling verification.

### 0.1.1

Регистрация provider и NDJSON-блоки содержимого.
Provider registration and NDJSON content blocks.
