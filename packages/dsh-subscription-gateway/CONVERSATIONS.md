# Идентичность беседы v2 · Conversation identity v2

`GET /health` объявляет `conversationIdentity:2`; новый caller затем отправляет `/v2/agent-stream`. Health — capability hint, а required envelope проверяется на каждом запросе. Между health и POST downgrade старого gateway не должен тихо перейти на legacy history.
`GET /health` advertises `conversationIdentity:2`; a new caller then sends `/v2/agent-stream`. Health is a capability hint, while the required envelope is validated per request. An older gateway appearing between health and POST must not silently switch to legacy history.

```json
{"version":2,"id":"telegram-v2-00000000-0000-0000-0000-000000000001","createdAt":1700000000000,"cwd":"/<absolute-workspace>"}
```

Ключ — namespaced SHA256(provider, canonical cwd, session ID, createdAt). Он не равен Telegram chat ID или content hash. CreatedAt различает поколения одинакового ID. SQLite хранит все identity columns и unique index; stateless `{version:2,mode:stateless}` не использует общую cache identity.
The key is a namespaced SHA256(provider, canonical cwd, session ID, createdAt). It is not a Telegram chat ID or content hash. CreatedAt distinguishes generations of the same ID. SQLite retains all identity columns and a unique index; stateless `{version:2,mode:stateless}` avoids a shared cache identity.

Legacy `/v1` может не передавать envelope; тогда остаётся старый key derivation по истории. Это compatibility path, не такая же изоляция. Переход/откат должен сохранять v2 channel mapper и gateway вместе; нельзя поставить old gateway поверх новых routingVersion 2 данных и ожидать прежнюю приватность.
Legacy `/v1` can omit the envelope and retain history-derived keys. This is a compatibility path, not equivalent isolation. Migration/rollback must preserve the v2 channel mapper and gateway together; replacing them with an old gateway cannot preserve the same privacy for routingVersion 2 data.

Контракт request/bearer — [SETTINGS](docs/SETTINGS.md); исполнение и состояния — [ARCHITECTURE](docs/ARCHITECTURE.md); поимённые isolation/HTTP tests — [GUARDS](docs/GUARDS.md).
See [SETTINGS](docs/SETTINGS.md) for request/bearer contracts, [ARCHITECTURE](docs/ARCHITECTURE.md) for execution/states, and [GUARDS](docs/GUARDS.md) for named isolation/HTTP tests.

Canonical cwd здесь означает lexical path.resolve: без fs.realpath и проверки существования каталога. Разные alias/symlink пути могут получать разные identity keys; не приписывайте этому host filesystem isolation.
Canonical cwd here means lexical path.resolve, without fs.realpath or directory-existence checks. Different alias/symlink paths can produce different identity keys; this is not host filesystem isolation.
