# Настройки · Settings

Config передаётся в apply через Cordis. Полной runtime schema нет: загрузка профиля не доказывает правильность каждого числа или поддержку модели шлюзом. Для загруженных файлов/версии требуется подъём движка, не одна правка на диске.
Cordis passes config to apply. There is no complete runtime schema; loading a profile does not validate every number or gateway model. Loaded version/source changes require an engine restart rather than a disk-only edit.

| Ключ · Key | Тип/умолчание · Type/default | Значение/граница · Meaning/boundary |
|---|---|---|
| baseURL | string; http://127.0.0.1:8788 | Хвостовые slash удаляются; remote HTTP только предупреждается, host allowlist нет · Trailing slashes are removed; remote HTTP warns, no host allowlist |
| ingressKeyFile | absolute path; unset | Config первым, затем GATEWAY_INGRESS_KEY_FILE; regular <=256 байт, root/process UID, no group/other, 64 lowercase hex · Config before environment; strict private regular file, failure before POST |
| contextWindow | number; 1000000 | Общее declared окно; не измеряется у vendor, числовой диапазон полностью не валидируется · Declared fallback, no vendor discovery or full numeric validation |
| models | array; built-in claude-opus-5 | id/name/description/contextWindow/inputModalities; unknown ID использует fallback, empty list не запрещает resolve · Local catalog; unknown resolution still uses fallback |
| models[].inputModalities | optional array | Array проверяется и копируется list/resolve; объявление image не меняет конверсию · Validated array, copied metadata, not image prompt conversion |
| models[].contextWindow | number; adapter fallback | Per-model metadata выше общего; неверный тип не становится измеренным окном · Per-model declaration takes precedence, wrong types are not measurements |
| models[].name/description | optional strings; id/no description | Display metadata, не evidence фактической модели · Display only |
| maxTokens (config/model) | legacy, ignored | Нет отдельного body.maxTokens/defaultMaxTokens output cap · No separate SDK output cap |
| taskControlCodex | boolean; exact true, default false | Opt-in cancel/B при receiver; явный stop зависит от отдельного telegramStopVersion · Cancel/B opt-in; explicit stop has a separate receiver contract |

options.maxTokens запроса не становится пределом выхода SDK; он учитывается как reservedCompletionTokens в livePressure budget. services и минимальные положительные API-признаки — [SERVICES](SERVICES.md).
Request options.maxTokens does not become an SDK output limit; livePressure reserves it as completion tokens. See SERVICES for service providers and required positive API markers.

## Окружение · Environment

GATEWAY_INGRESS_KEY_FILE — fallback пути допуска. ANTHROPIC_API_KEY — только предупреждение о наличии, значение не печатается/не удаляется. Подписочный refresh/access не читается адаптером. Сервисы должны быть видны в текущей области agents.currentInitiator().
GATEWAY_INGRESS_KEY_FILE supplies the fallback admission path. ANTHROPIC_API_KEY warns about presence only; it is neither printed nor deleted. The adapter does not read subscription access/refresh credentials. Services must be visible in the current initiator scope.

## Live pressure

Ровно одна конфигурация our/compaction-status: thresholdRatio (default 0.8), headroomTokens (65536), auto (true); modelPolicies для provider claude-oauth/model хода могут перебить только ratio и headroom; auto берётся из общей конфигурации. Окно — resolve metadata. Процесс proof включает PID/startTicks, загруженную version/sourceSha/policySha и native session id/createdAt; последнее успешное compaction — только start/end одного id без error.
Exactly one scoped configuration supplies ratio (0.8), headroom (65536) and auto (true), with per-model overrides for ratio and headroom only; auto comes from the common configuration. Window comes from model metadata. The proof contains loaded process/source identity and native session identity; only a successful matching compaction pair is recorded.

Успех имеет schema=1. Ошибка имеет error/классифицированную reason без schema=1 и один журнал на mounted adapter. Шлюз проверяет возраст, процесс, маршрут, параметры и загруженные SHA/версию. Смена src/version без подъёма — code-drift и отключённые pressure stops до обновления процесса. Проверяет это назначенная рука окна; не скрывать предупреждение увеличением window.
Success uses schema=1; an outage uses error/reason without schema=1 and one adapter log. The gateway verifies age, process/route/policy and loaded code identity. A disk-only version/source change causes code-drift and disabled pressure stops until restart. Deployment must check that live signal instead of enlarging window to hide it.

## HTTP/NDJSON и пределы · HTTP/NDJSON bounds

POST и mount metadata probe запрещают redirect. Conversation capability helper проверяет HTTP ok, health.ok, conversationIdentity=2 и ветку; его GET не является полноценной origin policy и отдельно redirect:error не задаёт. Deadline health 5000 мс + caller AbortSignal. Provider label — наблюдение успешной ветки, не model turn.
POST and mount metadata probes refuse redirects. The conversation-capability GET checks HTTP success, health.ok, identity2 and provider, but does not independently set redirect:error or enforce a complete origin policy. It has a 5000 ms deadline plus caller cancellation. A provider label does not establish a model turn.

| Предмет · Subject | Предел · Bound |
|---|---|
| Body/header silence | 1800000 мс; не общий turn deadline · Silence, not total duration |
| Dispatcher | Одна попытка на процесс; при несовместимости видимый fallback · Once per process, visible fallback |
| NDJSON line/buffer | Отдельного size ceiling нет · No independent size cap |
| UTF-8/JSON | Fatal decode, newline и EOF remainder; raw content не журналируется · Strict decode without raw payload logs |
| Control events | Scoped acceptance обязательна; отказ CONTROL_EVENT_REJECTED, поток остановлен · Scoped acceptance or nonretryable failure |
| Retry | Только overflow/HTTP429/ECONNREFUSED как LlmError; лимиты повторов — платформа · Platform owns retry counts |

GATEWAY_ERROR/INCOMPLETE_STREAM/control failure сохраняют ordinary Error code и cause; это не новая retry-category HarnessError. Неизвестный исход после SDK-эффектов автоматически не повторяется. Missing usage input/output пока заменяются 0 — это не точный замер отсутствия расхода.
Those diagnostic codes/causes remain ordinary Error rather than new trusted retry categories. Unknown outcomes after possible SDK effects do not authorize replay. Missing usage input/output still becomes 0; it is not a measured absence of usage.
