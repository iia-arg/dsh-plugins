# dsh-subscription-adapter — адаптер DSH к подписочному шлюзу · DSH subscription gateway adapter

Адаптер регистрирует provider `claude-oauth`, передаёт историю и доверенные descriptors шлюзу, превращает NDJSON в блоки, usage и ошибки LlmRuntime. Vendor-токен остаётся у шлюза; здесь читается отдельный ingress key. Пакет ESM для Unix-подобной системы, без собственного daemon и БД.
The adapter registers `claude-oauth`, sends history and trusted descriptors to a gateway, and converts NDJSON into LlmRuntime blocks, usage and failures. Vendor credentials stay in the gateway; this package reads a separate ingress key. It is an ESM plugin for a Unix-like system, with no daemon or database.

## Имена · Names

| Интерфейс · Interface | Значение · Value |
|---|---|
| Пакет · Package | `dsh-subscription-adapter` |
| Export plugin name | `subscription-gateway` |
| Provider ID | `claude-oauth` |
| Серверный пакет · Server package | `dsh-subscription-gateway` |

Provider ID сохраняется. Friendly label показывает Anthropic/OpenAI только после успешного health; HTTP 503 не подтверждает поставщика. Это наблюдение ветки шлюза, а не успешный ответ модели.
The provider ID is unchanged. Its friendly label shows Anthropic/OpenAI only after successful health; HTTP 503 cannot confirm it. This identifies the gateway branch, not a successful model response.

## Установка из локального архива · Install a local archive

Публикация в npm этим нарядом не поручена. Не устанавливать по голому имени из registry: аудит обнаружил там заглушку 0.0.0 без src. Устанавливают проверенный архив конкретной версии, подготовленный из исходникового дерева.
This task does not authorize npm publication. Do not install the bare registry name: the audit found a reserved 0.0.0 placeholder without src. Install the verified archive of the chosen source revision.

```bash
# ADAPTER_SOURCE — корень исходников пакета / package source root
# ADAPTER_ARTIFACTS — существующий каталог архивов / existing artifact directory
cd "$ADAPTER_SOURCE"
npm pack --ignore-scripts --pack-destination "$ADAPTER_ARTIFACTS"
# DSH_APP — каталог приложения, а не домашний профиль / application directory
cd "$DSH_APP"
npm install --ignore-scripts "/absolute/path/dsh-subscription-adapter-3.1.2.tgz"
```

Сверить SHA архива, package.json.version и наличие src/index.js. Установка npm не монтирует plugin в нужную Cordis scope: профиль и provider/model включаются назначенной рукой. Секрет ingress key не хранится в профиле или argv — только приватный путь.
Verify the archive SHA, package.json.version and src/index.js. npm installation does not mount the plugin in the correct Cordis scope; the deployment operator enables the profile/provider/model. The profile and argv contain only the private key path, never its value.

Требования: Node >=22 с fetch, TextDecoder, AbortSignal.timeout/any, Unix getuid/permissions; текущие пробы — Node 24.19.0. Peer диапазоны dsh-llm: ^0.1.1-rc.2 либо ^0.2.0-rc.2. Dev pins остаются dsh-llm 0.1.1-rc.2/cordis 4.0.1; текущий проверенный комплект — DSH 0.2.0-rc.2, dsh-llm 0.2.0-rc.2, cordis 4.0.4. Не выдавать npm test старой dev-линии за новый прогон другой линии.
Requirements: Node >=22 with fetch, TextDecoder, AbortSignal.timeout/any and Unix getuid/permissions; current probes use Node 24.19.0. The peer ranges are ^0.1.1-rc.2 or ^0.2.0-rc.2. Dev pins remain dsh-llm 0.1.1-rc.2/cordis 4.0.1; the currently checked set is DSH 0.2.0-rc.2, dsh-llm 0.2.0-rc.2 and cordis 4.0.4. Testing one dependency line does not certify the other.

```yaml
- insert:
    - name: dsh-subscription-adapter
      id: dsh-subscription-adapter
      config:
        baseURL: http://127.0.0.1:8788
        ingressKeyFile: /absolute/private/ingress.key
        contextWindow: 1000000
        taskControlCodex: false
        models:
          - id: claude-opus-5
            name: Claude Opus 5
            contextWindow: 1000000
            inputModalities: [text]
```

Это пример формы: заменить порт, путь и модель своими. Gateway читает тот же ingress key, но свой vendor credential. Подменять живые настройки этим примером нельзя.
This illustrates the shape; replace the port, path and model for the instance. The gateway uses the same ingress key and its own vendor credential. Do not replace live settings with the example.

## Зависимости и поток · Dependencies and request flow

[Таблица сервис → пакет → API/версия → отказ](docs/SERVICES.md) перечисляет agents, restore, taskControlCodex, spoolConversation, mcpBridge, dsh-scope и ответчик our/compaction-status. Сервис должен быть в области инициатора, не просто установлен где-то на машине.
The [service/provider/API/version table](docs/SERVICES.md) lists agents, restore, taskControlCodex, spoolConversation, mcpBridge, dsh-scope and the compaction-status responder. A service must be visible in the initiator's scope, not merely installed on the host.

Новая telegram-v2 сессия передаёт id/createdAt/cwd и требует restore.version=1, health conversationIdentity=2. Неизвестный caller — explicit stateless; legacy остаётся /v1. Входной ключ читается перед каждым запросом через fd с O_NOFOLLOW: regular file, UID root/процесса, без group/other access, <=256 байт и 64 lowercase hex. Bridge и lease не являются текстовыми правами из messages; lease закрывается в finally.
New telegram-v2 sessions carry id/createdAt/cwd and require restore.version=1 plus health conversationIdentity=2. Unknown callers are explicitly stateless; legacy remains /v1. Each request reads the key through an O_NOFOLLOW fd: regular file, root/process UID, no group/other access, <=256 bytes and 64 lowercase hex. Messages cannot grant bridge/lease ownership; finally closes the lease.

Адрес x-dsh-spool-conversation отправляется только при service.version=1 и health.spoolConversation=1. Он не включает live input для legacy. Граница и provenance — [LIVE-INPUT](LIVE-INPUT.md).
The x-dsh-spool-conversation address is sent only with service.version=1 and health.spoolConversation=1. It does not enable legacy live input. See [LIVE-INPUT](LIVE-INPUT.md) for provenance and delivery boundaries.

## Живое давление · Live pressure

Каждый запрос несёт livePressure от текущей сессии и ровно одной конфигурации our/compaction-status: окно/ratio, headroomTokens, reserved completion, auto; последнее успешное парное compaction/start→end; PID/startTicks и загруженные версия/SHA index.js/live-pressure.js. Суммы и версия снимаются при загрузке процесса, не выдаются за поздние байты с диска.
Each request carries livePressure from the current session and exactly one scoped compaction configuration: window/ratio, headroom, reserved completion, auto, last successful paired compaction and loaded PID/startTicks/version/source hashes. These identify loaded code, not later disk contents.

При недоступности отправляется `{error:"live-pressure-unavailable",reason}` без schema=1; первый классифицированный отказ на mounted adapter журналируется. Нынешний reader шлюза классифицирует отсутствие schema как live-pressure-missing, а не ложную stale дату. Сам шлюз выбирает fallback; адаптер не делает недоступный замер нулём и не добавляет свой retry.
Unavailable measurements send `{error:"live-pressure-unavailable",reason}` without schema=1 and log the first classified outage per mounted adapter. The current gateway reader treats missing schema as live-pressure-missing instead of a false stale timestamp. Gateway fallback remains its responsibility; the adapter supplies neither a zero measurement nor a retry loop.

**Смена версии или src требует подъёма движка тем же окном.** Шлюз сравнивает loaded proof с package.json/src на диске: без подъёма — live-pressure-code-drift, pressure stops отключены до нового процесса. Проверяющий живой признак — назначенная рука окна, не model list.
**A version/source change requires an engine restart in the same window.** The gateway compares loaded proof with disk files; otherwise live-pressure-code-drift disables pressure stops until the new process loads. The deployment operator checks that live signal; a model list does not establish it.

## Ошибки и границы · Failures and boundaries

maxTokens не отправляется как SDK output cap; modalities — metadata. NDJSON fatal UTF-8/JSON/EOF проверяются, финальный полный текст хранится в block-end. Unknown/tool types игнорируются. input-status/task-status — известные контрольные типы: scoped rejection останавливает stream с CONTROL_EVENT_REJECTED и явным журналом, не отбрасывается молча; lease закрывается. SDK мог уже сделать эффект, автоповтора нет.
maxTokens is not sent as an SDK output cap; modalities are metadata. Fatal UTF-8/JSON/EOF validation retains full final block text. Unknown/tool types are ignored. input-status/task-status are known control types: scoped rejection ends the stream with CONTROL_EVENT_REJECTED and a log instead of silent discard; the lease closes. SDK side effects may already exist; there is no automatic retry.

GATEWAY_ERROR и INCOMPLETE_STREAM сохраняют cause/code как ordinary Error. Доверенные LlmError категории только overflow, HTTP 429 и connection refused до доставки. Ordinary Error не объявляет отсутствие SDK-эффектов и не получает скрытый retry.
GATEWAY_ERROR and INCOMPLETE_STREAM preserve cause/code as ordinary Error. Trusted LlmError categories remain overflow, HTTP 429 and a refused connection before delivery. An ordinary Error does not prove no SDK side effects or grant a hidden retry.

baseURL нормализует хвостовые slash. Не-loopback HTTP даёт REMOTE_HTTP_GATEWAY warning о cleartext ingress key/history; это предупреждение, не host allowlist или sandbox. Для такого маршрута использовать HTTPS либо loopback. ANTHROPIC_API_KEY presence также только warning.
baseURL trims trailing slashes. Non-loopback HTTP logs REMOTE_HTTP_GATEWAY because ingress credentials/history travel in cleartext. This is a warning, not a host allowlist or sandbox; use HTTPS or loopback. ANTHROPIC_API_KEY presence also warns without blocking.

[SETTINGS](docs/SETTINGS.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [GUARDS](docs/GUARDS.md), [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) задают детали, пробы и границы. npm test запускает один stand, не весь комплект. Живые модели/Telegram не нужны для пакетных фикстур.
Those documents define settings, architecture, probes and diagnostics. npm test runs one stand rather than the full set. Package fixtures require no live model or Telegram.

MIT, Iia-arg team. Ссылка на [репозиторий](https://github.com/iia-arg/dsh-plugins) — адрес источников; сетевой доступ к ней этой проверкой не подтверждён. Публикация наружу и монтаж — отдельные поручения.
MIT, Iia-arg team. The repository link identifies the source location; its network availability is not certified by these checks. External publication and deployment require separate instructions.
