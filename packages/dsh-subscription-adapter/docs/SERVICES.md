# Сервисы и состав · Services and composition

Это пакетные версии среза проверки, не обещание поддержки каждой более ранней версии. Код проверяет положительные API/capability-признаки в последней колонке; они и есть минимальный контракт. Версии прошлых пакетов не угадываются по совпадающему имени.
These are the checked source revision versions, not a promise about every earlier release. The positive API/capability markers in the final column are the required contract; matching a service name is insufficient.

| Сервис · Service | Пакет-поставщик · Provider | Версия проверенного среза · Snapshot version | Минимальный API / без него · Required API / missing behavior |
|---|---|---|---|
| `agents/currentInitiator` | `DSH core @deepseek-ai/dsh` | `0.2.0-rc.2` | Текущий доверенный инициатор; без него stateless · Current trusted initiator, otherwise stateless |
| `newConversationRestore` | `dsh-pamyat-restore` | `3.1.1` | API version=1; без него новый generation отклонён · API version=1; new generation refused without it |
| `taskControlCodex / sdk inbox / stop` | `dsh-telegram-multiagent` | `3.1.5` | attach; telegramStopVersion/sdkInputVersion/mailStopVersion=1 по функции · per-function capabilities=1 |
| `spoolConversation` | `dsh-telegram-multiagent` | `3.1.5` | version=1 + forAgent; ещё нужен health spoolConversation=1 · version=1 + forAgent plus positive gateway health |
| `mcpBridge` | `dsh-tool-bridge` | `3.1.1` | descriptor(owner); без него tools descriptor отсутствует · no bridge descriptor without provider |
| `our/compaction-status` | `dsh-pamyat-kompakt-dsh` | `3.1.1` | Ровно один ответ в живой области · Exactly one scoped configuration reply |
| `scopeTarget` | `@deepseek-ai/dsh-scope` | `0.2.0-rc.2` | Разрешение в контексте процесса DSH · Resolution in the DSH process context |

Все сервисы должны быть видны в области текущего агента. Отсутствие инструмента или контрольного lease не даёт право выбирать другой owner/session. Включение источников само по себе не доказывает живой ответ модели.
Services must be visible in the current agent scope. A missing bridge or lease never authorizes another owner/session; enabling sources alone does not prove a live model response.
