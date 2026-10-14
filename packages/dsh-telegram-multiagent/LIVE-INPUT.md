# Обычные письма внутри SDK-хода · Ordinary inbox during an SDK turn

Шаг 0 B-N-1600 (2.5.90): обычное письмо без метки в активный ход не подаётся — `SdkInbox.dopusk` по умолчанию закрыт, письмо идёт в `next-turn` одинаково для Claude-hook и Codex-steer. Механизм ниже сохранён для уточнений этапа 1 (метка `refines`).

Step 0 of B-N-1600 (2.5.90): unmarked ordinary mail is not offered to an active turn — `SdkInbox.dopusk` is closed by default and mail stays `next-turn` for both Claude hook and Codex steer. The mechanism below is kept for stage-1 refinements.

## Сохранённый механизм, сейчас без производственного допуска · Retained mechanism, currently no production admission

Обычный файловый A2A-вход может попасть в активный ход после `input-status:ready`, если gateway объявил `health.inputDelivery=1`. Вызывающий — `ReceiptRuntime`/`SdkInbox`; adapter читает NDJSON `input-status` и передаёт его только своему lease. Письма без активного совместимого lease остаются в штатном `next-turn`. Новых боевых ключей для этой функции нет; три пакета обновляются согласованно.

Ordinary file A2A input can reach an active SDK turn after `input-status:ready` when gateway advertises `health.inputDelivery=1`. `ReceiptRuntime`/`SdkInbox` dispatch it; the adapter reads NDJSON input status through its own lease. Without a compatible active lease, mail stays in ordinary `next-turn`. No new production configuration keys are required; upgrade all three packages together.

## Привязка и состояния · Binding and states

Операция `message` отделена от `cancel`/`stop`. Проверяются поколение процесса, получатель, UUID ledger, сессия и её время создания, platform turn, HTTP request UUID, SDK thread/turn и receipt. CAS `dispatching` и блокировка native claim записываются до сетевого await. `accepted` — приём транспорта, `offered` — предъявление входа движку, `admitted` — отдельный durable `user/message` в исходном platform turn. `sdk_input_response` связывает ответ хода с входом; не доказывает исполнение поручения из письма.

The `message` operation is separate from cancel/stop. Process generation, recipient, ledger UUID, session identity/creation time, platform turn, HTTP request UUID, SDK thread/turn, and receipt must match. Dispatch intent and native-claim hold are stored before network await. Transport acceptance, engine input offer, durable admission, and directive execution are different stages. `sdk_input_response` links a turn response to the input; it does not prove execution of the letter's directive.

HTTP ожидание ACK — 4000 ms. Ожидание предъявления — 300000 ms; затем `unknown`, без автоповтора. При обрыве после отправки, изменении поколения, неясном ACK или неуспешной durable-подаче письмо удерживается. Known `not-offered` до доказанного предъявления снимает только собственный hold, позволяя обычный следующий ход. Поздний exact ACK `offered` сохраняется даже после перехода в unknown; последующее not-offered его не отменяет. Требуется разбор конкретного receipt, а не массовый повтор.

ACK deadline is 4000 ms; offer deadline is 300000 ms, followed by `unknown` with no automatic retry. Disconnect after dispatch, generation change, ambiguous ACK, or failed durable admission holds the letter. Known not-offered before any proven offer releases only its own hold for native next-turn delivery. A late exact offered ACK is preserved even after unknown and cannot be cleared by later not-offered. Resolve the exact receipt rather than replaying the task wholesale.

## SDK и пределы · SDK paths and limits

Codex app-server использует сериализованную steer-очередь с pressure/cancel, сохраняя исходный expectedTurnId. До RPC смена хода, stop, закрытие HTTP или pressure-closing дают known not-offered; RPC без точного ACK — unknown. Legacy Codex exec не объявляет эту возможность. Native admission использует runtime ABI установленной DSH rc.2 (`inbox.mutate`, `session.dispatch`), private в типах: проверка версии/формы отключает эту функцию на несовместимом ABI. Vendor-файлы не меняются.

Codex app-server serializes message steer with pressure/cancel and retains the original expectedTurnId. Turn change, stop, HTTP close, or pressure-closing before RPC yields known not-offered; a sent RPC without exact ACK is unknown. Legacy Codex exec does not advertise this capability. Native admission uses the installed DSH rc.2 runtime ABI, private in its types; version/shape checks disable the capability when incompatible. Vendor files are unchanged.

Claude получает JSON provenance-рамку в `PostToolBatch`/`Stop.additionalContext`. Рамка называет отправителя и пользовательскую роль; подпись подтверждает источник, не системный приоритет. В установленном SDK PostToolBatch передаёт additionalContext в system-роль, Stop — в user-роль. Рамка не заменяет изоляцию инструмента и не гарантирует защиту от любых инструкций внутри текста; модельная проверка — отдельные ворота.

Claude receives a JSON provenance frame in PostToolBatch/Stop additionalContext. It identifies sender and user-mail role; a signature proves provenance rather than system priority. In the installed SDK PostToolBatch context enters a system-role message, while Stop context enters a user-role message. The frame does not replace tool isolation or guarantee protection against every instruction in its text; live semantic verification is a separate gate.

На lease: очередь не больше 16 писем, тело до 65536 UTF-8 bytes, wire packet до 131072 bytes, вся hook-пачка с рамками до 65536 bytes. Порядок общей пачки: cancel B → pressure → обычные письма. Не вместившийся хвост остаётся в очереди; невмещаемая отдельная рамка отвергается до acceptance. Максимум 2 mail-продолжения через Stop и 30000 ms от первого такого продолжения; при любом пределе остаток переводится в known not-offered → next-turn. Пороги ограничивают mail, не число обязательных control-хуков.

Per lease: at most 16 pending letters, body at most 65536 UTF-8 bytes, wire packet at most 131072 bytes, entire hook batch including frames at most 65536 bytes. Shared batch order is cancel B, pressure, ordinary mail. Overflow remains queued; a frame that cannot fit alone is rejected before acceptance. Stop permits at most 2 mail continuations and 30000 ms from the first; either bound sends pending mail to known not-offered/native next-turn. These bounds limit mail, not mandatory control-hook calls.

Не покрываются: вложения и другие non-text блоки, прямой Telegram/site user-ввод посреди SDK-хода, отсутствие очередной hook/steer-точки, выполнение поручения моделью, неизвестный внешний RPC-исход и новый подписанный stop_replace. Последний требует отдельного замысла и общего fence на exact lease; здесь его нет.

Outside scope: attachments/non-text blocks, mid-turn direct Telegram/site user input, absence of another hook/steer point, model execution of the directive, uncertain external RPC outcomes, and a new signed stop_replace protocol. The latter needs a separate design and a common exact-lease fence; it is not implemented here.


Claude-hook и Codex user-steer: до очереди hook или RPC `turn/steer` gateway требует строго `provenance.verified === true`, вычисленное доверенным SDK-вызвавшим по `coordinator_signature_verified` receipt audit после проверки подписи. Gateway не проверяет raw signature и не выдаёт полномочия по имени/тексту. `verified=false` даёт known `not-offered/signature-unverified`; отсутствие поля или неверный тип — `not-offered/invalid-user-input`. Отказ явный и записывается в журнал без тела письма; Codex RPC не вызывается. Известный отказ позволяет штатный next-turn. При гонке разрыва вместо известного отказа может остаться unknown без автоповтора. Подтверждённый Codex-ввод сохраняет обычную роль пользователя и exact-turn binding; проверка источника не повышает его приоритет.

Both Claude hook and Codex user-steer require strictly `provenance.verified === true` before the hook queue or the `turn/steer` RPC, derived by the trusted SDK caller from the `coordinator_signature_verified` receipt audit after upstream signature verification. The gateway does not verify raw signatures or infer authority from sender names/text. `verified=false` yields known `not-offered/signature-unverified`; a missing field or invalid type yields `not-offered/invalid-user-input`. Refusal is explicit and logged without the letter body; no Codex RPC is made. Known refusal permits ordinary next-turn delivery. Disconnect races may remain unknown with no automatic retry. Verified Codex input retains user role and exact-turn binding; source verification does not raise its priority.

Это ограниченная защита границы hook/user, не доказательство безопасности любого содержимого письма и не замена ACL/проверки подписи. Модельная исправная рамка ответила SAFE и назвала fixture; голое письмо остановила защита провайдера, модельное ORANGE/возврат не измерены. Немодельный допуск назначен внешними воротами, его три состояния проверяются отдельным source/native стендом.

This protects the hook/user boundary and does not establish safety of arbitrary letter content or replace ACL/signature verification. The healthy live frame returned SAFE and named fixture; the provider blocked the bare letter, so model ORANGE/restoration was not measured. External gates prescribed the non-model admission policy, verified separately through source/native three-state tests.
