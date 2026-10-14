# Signed mail /new

The host accepts task-stop/1 mode new only under receiver-owned trust. Zabava may address all recipients; Iskra has the explicit six zarya/avrora/petrovich/alfa/beta/gamma. Marc, wildcard expansion and unknown managers are denied. newSessionsEnabled must be true, signer/return trust and native lifecycle services must be present. A running turn is refused, never implicitly stopped. Stateful gateways require conversationIdentity v2; B-N-1757 adds the explicit stateless path below. The historical petrovich refusal (05.10 17:53Z, B-N-1624) can be resolved by that configuration.

Caller: MailStopReceiver.handle from signed A2A intake. It uses the same rotateCurrentConversation/rotateConversation as Telegram; receiver pins session id/createdAt/revision, checks after admitted-status and inside begin before quota/release. Counter: at most3 actual normal begin transactions per receiver in600000ms; refusals before begin do not debit, held-generation reconciliation is exempt. Rotation timeout60000ms and control lifetime120000ms remain bounded. No loop retries external cancellation, rotation or intro creation automatically.

New intro is enqueued and durably flushed through native ReceiptRuntime, then guarded WakeGate. The previous history remains archived. A bootstrap without evidence is unknown even after a committed generation; restart does not create another intro. SIGKILL before commit produces signed unknown to sender and independent owner queue. In unavailable signing/trust, polling still starts, owner receives unresolved status; one recovery attempt per pendingcontrol/startup, next startup after repair retries only notification. Queue retries remain the existing finite budget.

Sender: direct send-mail-stop --recipient <agent> --mode new [--body-file <intro-file>] since 2.5.108 (working 2.5.107-b1624; B-N-1624; up to 2.5.107 the sender refused mode new with sender_mode_denied). Courier wrappers have no --new yet. No body in argv. mode new must be in protected sender config. Unknown/dry-run/check arguments refuse before transport. Sender stage placed does not mean newconversation committed: read the signed receiver status and bindings. Iskra sender config on sadik lists five routes explicitly (zarya, avrora, alfa, beta, gamma; petrovich left out — no generation capability) and runs under sudo (MAIL-STOP.md); receiver enforces the six independently.

Outbox owner copy uses copy-tg separate worker; primary signed result does not wait for ownerTelegram. Unknown/held owner notices remain mandatory even when configurable routine copies are off. No unsigned ordinary result is generated for reply=no controls. Runtime enabled/newACL config changes are not performed by this candidate.

Schema: mail_stop_controls CHECK gains new while preserving populated columns. The active stop-fence partial index excludes new; session rotation intent is the new-specific concurrency guard. Rollback of files does not remove persisted new controls: old CHECK/software does not understand new mode; before rollback resolve/retain these rows and use an accepted migration procedure, not arbitrary dropping.

Limits of tests: native agent/ledger/persistence/wake and crypto are exercised offline; capability/presets/trust/arrival are controlled fixtures. No live credential, Telegram, provider or SSH newconversation was invoked. Missing production signer/returnroute requires repair by the mount hand. Current support/source snapshots in P7, final integration after98 is a separate required gate.

## Stateless providers / Поставщики без состояния (B-N-1757)

Только в `/etc/dsh-telegram/petrovich.json` добавить `"statelessProviders": ["deepseek-direct"]`, сохранив все прежние поля и newSessionsEnabled:true. Список берётся из settings JSON, пуст по умолчанию; plugin config.statelessProviders не используется. Нестрочный элемент, пустое имя, строка вместо массива и неизвестное неперечисленное имя не дают допуска.

Если conversationIdentity v2 есть, первым вызывается прежний check(signal), без новых условий или обхода отказа. Вариант А — только отсутствие службы плюс имя ЖИВОГО agentDefaultModel.currentSelection().provider в списке; config.provider в допуске не используется. Затем обязателен newConversationRestore v1. Без живого выбора либо restore — отказ до начала ротации. Проверенный снимок provider/model применяется при создании stateless-сессии; путь создания шлюзовой сессии прежний.

Ошибочно внесённый claude-oauth без v2 отказан; с v2 проходит прежнюю проверку. Иной переименованный stateful-поставщик без capability по имени не распознаётся: список — доверенное утверждение администратора о протоколе. Новых повторов нет, срок попытки прежний60с.

At mount, add Petrovich to Iskra's protected sender /new trust and route list, preserving existing routes; receiver support does not grant sender authorization. This is a mount-hand step from the coordinator's B-N-1757 conditions. No live trust files are modified by the candidate.

Монтажная приёмка: живой /new Петровичу → подписанный complete; затем первый ход НОВОЙ сессии с восстановленными знаниями. Стенд с подставным restore этот живой признак не заменяет. Обоих признаков без фактической пробы не объявлять.
