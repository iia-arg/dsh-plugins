# dsh-socseti

Версия · Version: 3.1.8

A local MCP service for social-media drafts, human approval and explicitly enabled Telegram/VK writers. The model creates or revises a draft; it cannot approve it, choose an arbitrary recipient, call raw provider APIs or read other drafts. One human decision on an authenticated Telegram card authorizes a specific version and hash.

The same package supports two independent installations: Varvara at /opt/socseti and Anna at /opt/socseti-anna. Their configuration, credentials and SQLite state remain separate. The version in the startup record and MCP initialization comes from package.json. Instagram/Threads intake is opt-in through the meta configuration; their writers are not provided. See META-ANNA.md.

## Build and install

Use Node24+, npm, Python3 and passwordless sudo for root-owned test fixtures. On a build copy:

```sh
npm ci --ignore-scripts
npm test
```

The source archive excludes node_modules. Build dependencies from the locked versions outside either live installation, then deploy the accepted runtime as a complete artifact. Do not run npm inside a live service directory or copy private configuration/state from one profile to the other. See INSTALL.md for the host installation procedure and PAKET.md for the complete source inventory.

Tests prepare synthetic owner/approver files and keys in /tmp. The external socseti-watch reader is located in the neighbouring repository package automatically. If it is absent from a standalone archive, only named external-reader/channel integration checks are skipped; the service's own worker assertions still run. An explicit SOCSETI_WATCH_SOURCE must be an existing absolute path. A green package suite does not prove the external watcher/Telegram channel package, a live API or a real human delivery.

The Varvara unit requires /usr/local/bin/node and the mandatory read-only /opt/nodejs bind. A host with another Node layout needs a checked local unit. The Anna template uses Type=simple and its own account/state; do not inherit Varvara's namespace/notify setup blindly. Start/restart and live acceptance belong to the designated deployment operator after review.

Use the complete source.tar.gz or Git checkout for reproducible npm ci: npm pack excludes package-lock.json, so its tarball alone is not that build source.

## Configuration

Configuration is private JSON, at most4096bytes, owned by root or the service account, with no symlink/hardlink, execute bits, group writes or access for others. Unknown fields and type coercion are rejected.

| key | contract |
|---|---|
| port | integer1024–65535; bind127.0.0.1 only |
| stateDir | absolute path, own0700 directory, SQLite0600 |
| targets | vk/instagram/threads digit strings; telegram negative safe-integer string; declarations do not enable providers |
| keyFiles | Varvara:varvara/monitor; Anna:anna/monitor/channel. Absolute paths, distinct64hex keys |
| telegram | optional; if present, enabled,tokenFile,approvalChatId are all required even when disabled |
| profile | absent for Varvara; exactly anna for Anna |

Anna also requires telegram.externalPoll=true and telegram.writerEnabled:boolean. Its approval group is the configured Marketing policy; it does not start a second getUpdates poller. Optional VK reception uses enabled/armed=true, the fixed admitted idleAt,apiVersion and private token references. A disabled VK writer means the entire vk.writer section is absent. A present writer with enabled=false is rejected. Audit deployment must preserve that absence; it must not enable a writer from an example configuration.

The full field constraints, endpoint shapes and diagnostics are in REFERENCE.md. Existing VK reception, posts, replies and notices are described in docs/ANNA-VK-FIRST.md, docs/ANNA-VK-TEXT-POSTS.md, VK-REPLIES.md and docs/ANNA-NOTICES.md. Provider-specific readback and legacy-unknown barriers remain required.

## MCP and Anna's channel

POST /mcp uses JSON-RPC and a private Bearer credential. Host must be127.0.0.1:port, Origin must be absent, Content-Type application/json, body≤65536bytes. Credentials stay out of command lines and logs. The draft client has no monitor/channel permission.

| tool | arguments | result |
|---|---|---|
| draft_post | request_id,platform,text | private draft capability, version/hash,pending_approval,published=false |
| revise_draft | request_id,draft_id,draft_token,expected_version,text | new version/hash only before a human decision; otherwise create a new draft |
| draft_reply | request_id,event_token,text | recipient comes from an owned, unexpired event |
| status | empty object; monitor only | technical status without material/credentials |

request_id is8–80ASCII characters using the admitted identifier syntax; same key/id/request replays, changed input conflicts. Text≤4096codepoints and16384UTF8bytes, nonblank and valid Unicode. Draft text is preserved. Limit100unfinished drafts per key and20versions; legacy events are limited to1000stored rows, while Anna permits30000pending events. Her in-process event text limit is65536codepoints/262144UTF8bytes; the entire /channel JSON body still has a65536byte ceiling. historical records are not automatically deleted. Anna cards follow hourly09–23Moscow batches and a three-second spacing; delivered cards have a24hour decision lifetime. Varvara's draft TTL is seven days.

Anna's separate channel credential can use /channel/cursor,/ingress,/pending,/ack,/callback, all POST. Those routes are absent from the model's MCP catalog. Anna's external poller owns Telegram offset; the local service validates stored receipts and human decisions. Events are not routed through shared memory. HTTP409 is a conflict requiring the channel owner's investigation, not a request to rewrite history.

## Delivery and uncertainty

An action is durably sending before HTTP. Only a valid receipt can become sent/published. Lost or malformed replies,5xx, reset, general timeout and a crash before receipt commit remain unknown; restart does not resend them. Unknown is resolved by the designated operator, never by deleting a database row to try again.

A proven connection/DNS refusal before HTTP is not_sent. It returns to queued with at least a one-second delay, within the same three-attempt budget as429. Retry-After must be1–60seconds. The third unsuccessful attempt becomes failed, without a fourth send. The limit applies to cards, publications and notices. Once a response exists, a later read error cannot be reclassified as an unsent connection attempt.

A transport failure stops that tick from draining more actions. Degraded local polling must recover before a new send. Anna keeps external poll ownership and card timing. send_unavailable/telegram_send_recovered describe transport health; a successful HTTP response still requires a valid receipt before publication is confirmed.

Only trailing ASCII space/tab/CR/LF may differ in an echoed message. Leading/internal text and Unicode whitespace are not normalized. The draft's payload/hash remain unchanged; the actual returned text/caption is stored, and the callback must match that receipt exactly. This tolerance does not claim a live Telegram normalization measurement. Publication failures cannot overwrite the delivered approval card's outbox state.

## Status and operations

stage=2 is the Store status shape, not the semantic package version. publishing/external_io describe ready writers, not VK reception coverage. telegram has halted,reason and state counts; vk,vk_post,vk_reply have independent reasons/readback/coverage. drafts includes history; outbox counts held_* rows only. Read their specific contracts instead of treating a single flag as proof of all delivery.

Temporary polling failure is poll_failed with halted=false, intervals1/2/4/8/16seconds and automatic recovery. Fatal401/403, a third consecutive getUpdates409 (since3.1.10: telegram_poll_conflict, 30s pause, count reset only by a successful poll), invalid_update_batch or worker_failed halt; telegram_halted/telegram_poll_degraded carry the Telegram error_code and description (≤200 chars) or the transport failure kind. Missing owner/approvers holds API calls and reports owner_id_unavailable. Preflight failure leaves MCP alive but requires the designated operator to fix/restart the subsystem. All named reasons/log events are listed in REFERENCE.md.

`node src/main.mjs /absolute/config.json` accepts one absolute path. Invalid/extra arguments give usage/exit2 before startup. Core startup rejection gives exit1 and an enumerated safe reason; private error text/paths are not printed. The pilot is an explicit live Varvara test at port8381, not part of npm test and not Anna acceptance.

Raw capabilities are trusted local state in SQLite0600; encryption is not claimed. Rollback preserves compatible SQLite/WAL,approvals,receipts,offsets and unknown outcomes. A conflicting saved update refuses without changing history or lowering its offset; a permanent restart loop was not demonstrated. Live credentials, provider permissions,systemd READY attribution and human approval are outside substitute test evidence.

Historical queue migration tests carry a checksum-pinned fixture and need no Git history. Telegram channel integration tests use the neighbouring dsh-telegram-multiagent package when present and report named skips without it; the local owner recovery test still runs.
