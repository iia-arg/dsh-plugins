# Стенды и зрячесть · Tests and sensitivity

Каждый стенд работает на копии с локальным HTTP и/или подставной платформой. Vendor/Telegram не вызываются. npm test — только stend-predela, остальные запускать по именам. Наличие файла и exit 0 без исполненных проверок не являются покрытием.
Run copies with local HTTP/platform fixtures, never vendor/Telegram. npm test runs only stend-predela; run the remaining files explicitly. A file or an empty exit 0 alone is not executed coverage.

| Файл test/ · Test file | Контракт · Contract | Предпосылка · Prerequisite |
|---|---|---|
| stend-predela.mjs | Body/header silence 1800000, dispatcher/fallback | Node API; ADAPTER_SRC/argv optional |
| stend-perepolneniya.mjs | Actual platform overflow/compaction; other failures remain nonretryable | STEND_APP; own generated ingress key |
| stend-povtora.mjs | Actual platform retry policy; unknown SDK effects not replayed | STEND_APP; own generated ingress key |
| stend-vygruzki.mjs | Cordis/LlmRuntime unload and provider detach | Runtime peers |
| stend-image-metadata.mjs | Modalities copy/validation and actual dsh-tool-fs route gate | Runtime peers + dsh-tool-fs, resolved from package or STEND_APP; absent => СЛЕПОТА 2 |
| stend-task-control.mjs | Lease attachment and success/error cleanup | Own generated ingress key |
| stend-telegram-stop-binding.mjs | Explicit stop independent of cancel opt-in | Own generated ingress key |
| stend-conversation-identity.mjs | v2/stateless/legacy, capability before POST | Own generated ingress key |
| stend-ingress-key.mjs | fd/UID/mode/type/hex, fail before POST | Own fixture |
| stend-provider-output-ndjson.mjs | Actual streams, EOF/newlines/UTF-8/bad records/provider metadata | Own fixture, MOST_ROOT/PROBE_ONLY optional |
| stend-provider-metadata-race.mjs | Old mount response/failure cannot overwrite newer v2 observation | Own fixture |
| stend-spool-conversation.mjs | Exact public conversation header and positive capabilities | Own fixture |
| stend-audit-contract.mjs | Health 503, URL slash, code/cause/control failure, pressure missing/log, remote warning | Own fixture; remote metadata fetch mocked |
| stend-audit-docs.mjs | Local archive instructions, prerequisites, service providers and live-input trust boundary | Only packaged documents/source, no platform or sibling gateway needed |

fixture-ingress.mjs создаёт отдельный random 64 hex regular файл с правами 0600 и подставляет его только в процесс стенда, убирает на exit. Эти пять стендов теперь не зависят от production GATEWAY_INGRESS_KEY_FILE. Ключ стыка в бою не использовать для тестовых HTTP-серверов.
The shared fixture generates its own random 64 hex regular 0600 file, overrides only the stand process and removes it on exit. The five stands do not borrow the production ingress environment. Never send the live admission key to fixture servers.

```bash
# Пакетная копия с установленными peer dependencies / package copy with peers
node test/stend-audit-contract.mjs
node test/stend-conversation-identity.mjs
node test/stend-task-control.mjs
node test/stend-telegram-stop-binding.mjs
# DSH_APP — приложение с node_modules, не home/profile / app with node_modules
STEND_APP="$DSH_APP" node test/stend-perepolneniya.mjs
STEND_APP="$DSH_APP" node test/stend-povtora.mjs
STEND_APP="$DSH_APP" node test/stend-image-metadata.mjs
```

На снимке проверяется DSH/dsh-llm 0.2.0-rc.2, cordis 4.0.4, Node 24.19.0. Manifest dev pins остаются старой линии 0.1.1-rc.2/4.0.1; её отдельный свежий прогон не обещается, а диапазон peer не доказывает все комбинации версий. STEND_APP для image даёт реальный gate модуля платформы, не копию выдуманного helper.
The checked set is DSH/dsh-llm 0.2.0-rc.2, cordis 4.0.4 and Node 24.19.0. Older dev pins are declared separately; peer ranges do not certify every version combination. The image stand resolves the actual platform gate from STEND_APP rather than a made-up copy.

| Ключ · Key | Применение · Use |
|---|---|
| ADAPTER_SRC / first argv | Silence-test source |
| STEND_SRC | Overflow/retry source |
| STEND_APP | Installed DSH app/root with node_modules; required core normalizer/retry/image gate |
| MOST_ROOT | Alternate adapter package root for provider-output-ndjson |
| PROBE_ONLY | Name substring selecting provider-output probes; not full-suite coverage |
| ADAPTER_MODEL_SETTINGS | Optional before/after JSON route modality fixtures |
| GATEWAY_INGRESS_KEY_FILE | Production admission outside tests; five affected suites override it with their own synthetic fixture |

Отсутствующая платформенная предпосылка — названная СЛЕПОТА 2, не успех и не подтверждение дефекта адаптера. Несходящийся контракт — 1; выполненные пробы — 0. В этом модуле нет model-level ACK теста, криптографической проверки receipt вместо caller или 30-минутного ожидания на каждой регрессии; silence invariant проверяется shorter fixtures + source-bound constants.
Missing platform prerequisites are named blindness 2 rather than success or an adapter defect. Contract mismatch is 1; executed success is 0. These stands do not establish live model ACK, substitute for upstream receipt signature verification or wait 30 minutes per run.

Для защиты/условия нужен полный цикл: здоровое 0 → контролируемая порча 1 → возврат 0. Каждая порча печатает число замен, fixed-string count и SHA до/после; возвращённые bytes проверяются отдельно. False/строка-причина из тела проверки обязаны делать wrapper красным.
Guard sensitivity needs healthy 0→fault 1→restored 0 with literal replacement counts, fixed-string checks and distinct before/after hashes; restore bytes are verified independently. A returned false/reason must make its wrapper fail.
