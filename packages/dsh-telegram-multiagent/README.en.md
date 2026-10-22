# dsh-telegram-multiagent — Telegram, A2A file mail and website chat channel for DSH agents, with durable receipts


Local edition 3.1.9: the “опрос жив … ПРОСТОЙ/НЕ БЫЛО” log line is **human-readable diagnostics**, not an automatic idle watchdog. No automated consumer reads the `ПРОСТОЙ`/`НЕ БЫЛО` fields; `dsh-compact-watch` checks only for the “опрос жив” substring and does not parse those fields.

Here “idle” means that the process has completed **no turns of any kind** for 30 minutes, including A2A, managed, headless and internal turns. It does not mean that the owner has received no answers. Every `turn/end` records completion before receipt/chat routing exits. Every 20 successful polling cycles the log reports completion age rounded to minutes, with `🔴 ПРОСТОЙ` at ≥30; the next completed turn updates the timestamp. Before the first completion after startup it reports `НЕ БЫЛО`, meaning there is no measurement yet. These diagnostics do not detect a stalled poll or send a separate alert. Run `node test/stend-prostoya.mjs` for nine isolated handler/loop scenarios.

## Purpose

The `dsh-telegram-multiagent` module is a DSH platform plugin (`main: src/index.js`, `inject: ['agents']`). It collects incoming messages from Telegram (private chats, working groups, guests of an open bot), from file mail (`<a2aDir>/in` and the mail-carrier spool `spoolDir`) and, when enabled, from the website chat spool. It records each message as an SQLite receipt (`<workspace>/.message-receipts/receipts.sqlite`), binds it to the agent's session generation, queues it into DSH, and sends the answer back to where the question came from. Input is persisted before the Telegram offset advances, and the session log is flushed to disk before wakeup. If the outcome of a turn is unknown, the receipt is held for the operator; model work is never blindly repeated.

Who calls it: on sadik the module is loaded by the DSH process of every agent — `avrora`, `iskra`, `zarya`, `spartak`, `marc`, `petrovich`, `varvara`, `anna`, `alfa`, `beta`, `gamma`. Each `<agent>.service` starts `dsh web`, the profile declares the module in its `cordis.patch.yml`, and Node finds it through the symlink `node_modules/dsh-telegram-multiagent → /opt/agent-plugins/dsh-telegram-multiagent`. All agents run the same code and differ only in settings. Separately from the agents, `mail-stop-arrival.service` (root) runs the arrival observer for signed stop letters.

Who reads the result: people in Telegram (answers, owner copies in `owner-all` mode, alarms); the coordinator machine's courier (on sadik — `sadik-tell-poll` from aclaude over ssh: `out/` of an ordinary slot — via sudo as root, of a guest slot — `sudo -u` the slot owner; a slot owned by root is not taken) — picks up `<a2aDir>/out/*.txt` and moves them to `out/polnye`; receipt replies `receipt-<sha>.txt` are written with mode `0600`, older records by umask; `a2a-pochtalon` serves the `/var/spool/a2a` mailboxes, not `out/`; return receipts; the external website adapter — via `vyhod/` in the website spool; the operator — via receipts and `src/receipt-admin.mjs`; the stop sender — via a signed status in its own mailbox. The module gives the agent's model the tools `telegram_send_file`, `telegram_make_pdf` (only with `openBot: true`) and `pismo_rukovoditelyu` (only when `supervisor` is set), plus Telegram commands — the list with rights is below, in "Telegram commands".

More on the design — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); guards and their readers — [docs/GUARDS.md](docs/GUARDS.md); stop and `/new` by mail — [MAIL-STOP.md](MAIL-STOP.md), [MAIL-NEW.md](MAIL-NEW.md); live input in the middle of a turn — [LIVE-INPUT.md](LIVE-INPUT.md); PDFs for guests — [GUEST-PDF.md](GUEST-PDF.md).

### Telegram commands

Commands are handled by the module and never reach the model. Rights are checked on every message.

| Command | Who may | What it does |
|---|---|---|
| `/start`, `/help` | anyone the bot admits (with `openBot`, guests too) | a short help text |
| `/stop` | a person from `allowedUsers` | interrupts the agent's current turn, keeping the context, and pauses the conversation; stop by mail — [MAIL-STOP.md](MAIL-STOP.md) |
| `/new` | a person from `allowedUsers`; only with `newSessionsEnabled: true` | starts the conversation anew (a new session generation) |
| `/goal <текст>` | `goalUsers` (with `openBot` — `allowedUsers`) | sets a goal for the agent; from the service channel — only by a signed letter (see "Limitations") |
| `/compact` (`/ccc`), `/compact-status` (`/cs`) | a person from `allowedUsers` | platform commands: conversation compaction and its status; go to the platform command registry; not there — refusal |
| `/switch-a`, `/switch-b` | a person from `allowedUsers` | a platform command if the registry knows it; otherwise it goes to the model as plain text (the old route) |
| `/sss`, `/sss_on` | only the owner (`ownerChatId`), in a private chat with the bot; with `site` enabled | close / open website intake. `/sss` writes the `site.stateFile` switch and interrupts website conversations; copies keep going out. Without `ownerChatId` the website and `/sss` are off |
| any other `/<имя>` | only the owner (`ownerChatId`) | a command from the platform registry; if there is none — refusal «Неизвестная команда» (unknown command), not passed to the model |

## What gets installed and where

The package is deployed as a whole directory, by the publication composition (all files listed by `npm pack --dry-run --ignore-scripts`, including `test/` and `docs/`; `README.en.md` is not named in `files`, but npm adds `README*` to the archive itself). Current version — see `package.json`/`CHANGELOG.md`.

| File in package | Path on machine | Mode / owner | Who executes / reads |
|---|---|---|---|
| `src/index.js` and the other modules `src/*.js`, `src/*.mjs` | `/opt/agent-plugins/dsh-telegram-multiagent/src/` | `0644 root:root`; `src/client.js` — `0755` | Node in the DSH process of every agent (11 services, see "Purpose"); entry point — `main` from `package.json` |
| `package.json` | `/opt/agent-plugins/dsh-telegram-multiagent/package.json` | `0644 root:root` | Node (name and version for the startup line `[dsh-telegram-multiagent <version> · область …] подъём`); registry `installed_check` |
| `cordis.patch.yml` | `/opt/agent-plugins/dsh-telegram-multiagent/cordis.patch.yml` | `0755 root:root` | DSH loader (`dsh.bundle.patch`). It is an example; in production the settings come from the agent profile built from the templates `/etc/agent-registry/shablony-raskladki/{sdk-claude,codex}/A.tmpl` |
| `systemd/mail-stop-arrival.service` | `/etc/systemd/system/mail-stop-arrival.service` (copy) and `…/dsh-telegram-multiagent/systemd/` | `0644 root:root` | systemd; unit `enabled`, `User=root`, runs `/usr/local/bin/node /opt/agent-plugins/dsh-telegram-multiagent/src/observe-mail-stop.mjs /etc/dsh-mail-stop/arrival-observer.json` (the node path is hard-coded in `ExecStart`: where node lives elsewhere — edit the unit), writes to `/var/lib/dsh-mail-stop-arrivals` |
| `src/observe-mail-stop.mjs`, `src/mail-stop-arrival.js` | in the package directory | `0644 root:root` | `mail-stop-arrival.service` (root) |
| `src/send-mail-stop.mjs` (+ `src/publish-mail-stop.py`) | in the package directory | `0644 root:root` | Stop sender: on sadik — Iskra, `sudo node /opt/agent-plugins/dsh-telegram-multiagent/src/send-mail-stop.mjs --recipient <agent> --mode pause\|replace\|new [--body-file <file>]`; it calls `publish-mail-stop.py` via `python3` |
| `src/read-mail-stop-status.mjs` | in the package directory | `0644 root:root` | Stop sender: verifies the signed status `node …/read-mail-stop-status.mjs <status file> <control_id> <wire_sha>` |
| `src/sign-coordinator.mjs` | in the package directory | `0644 root:root` | Coordinator signer: `node …/sign-coordinator.mjs REQUEST_JSON` |
| `src/receipt-admin.mjs` | in the package directory | `0644 root:root` | Operator: `status ROOT`, `approve-new\|discard\|release-text\|reject-envelope ROOT ID OPERATOR REFERENCE`, `rollback-v1 ROOT OPERATOR REFERENCE`; ROOT is `<workspace>/.message-receipts`; `status` is read-only; `rollback-v1` refuses while a live process holds the ledger open; errors exit with code 2 |
| `src/pdf-calculation.py` | in the package directory | `0644 root:root` | `/usr/bin/python3 -B`, started from `src/pdf-tool.js` (tool `telegram_make_pdf`); requires `reportlab`, `pypdf`, the font `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, and letterheads from `pdfTemplatesDir` |
| `courier/iskra-tell`, `courier/coder-tell` | in the package directory | `0755 root:root` | Nobody calls them on sadik: these are courier candidates for aclaude (`iskra-tell` and its links `petrovich-/marc-/zarya-/avrora-/varvara-/anna-tell`, `coder-tell`) |

Profile symlinks (created by the profile layout, not by this package): `/opt/{avrora,iskra,zarya,spartak,marc,varvara,anna}/.dsh/profiles/web/node_modules/dsh-telegram-multiagent`, `/opt/coders/{alfa,beta,gamma}/.dsh/profiles/web/node_modules/…` (relative link), `/opt/petrovich/.dsh/profiles/node_modules/…` → `/opt/agent-plugins/dsh-telegram-multiagent`.

Present in the directory but not used at runtime: `test/` (tests, helpers, fixtures), `docs/`, `CHANGELOG.md`, `README.md`, `README.en.md`, `GUEST-PDF.md`, `LIVE-INPUT.md`, `MAIL-NEW.md`, `MAIL-STOP.md`, `NEW-SESSIONS.md`, `OLD-PATHS.md`, `OUTGOING-FILES.md`, `OWNER-COPIES.md`, `RECEIPTS.md`.

External programs the package does not install but calls by absolute path:

| Program | Who calls it | Without it |
|---|---|---|
| `/usr/local/bin/a2a-send` | guest copies `{kind:"a2a"}`, folds, the supervisor letter (`pismo_rukovoditelyu`), local return receipts | refusal «Local courier failed …; delivery not confirmed»: the letter is not placed, the error stays with the caller (outbox row or tool reply) |
| `/usr/local/bin/tell-komu` | return receipts to another machine (`new-return`) | the row goes to `HOLD` — until the operator decides |
| `/usr/local/bin/agent-alert` | alarm about undelivered website copies | the alarm is not sent, a log line remains |
| `$HOME/.local/lib/dsh-coordinator-signer/prepare-coordinator.mjs` | courier `courier/iskra-tell` with `OT=zabava` (coordinator signature) | refusal «подпись не получена; ничего не отправлено» (signature not obtained; nothing sent), exit 2 |
| `/usr/bin/python3` (+ `reportlab`, `pypdf`) | `telegram_make_pdf` | the PDF is not built |

What the module creates itself at runtime:

| Path | Contents |
|---|---|
| `<workspace>/.message-receipts/receipts.sqlite`, `released/`, `return-notices/` | receipt ledger, archive of read letters, return receipts |
| `<workspace>/attachments/telegram/` (+ `index.json`) | incoming attachments, private directories |
| `<workspace>/vydacha/<chat_id>/` | the only folder a guest can receive files from |
| `<pauseStateRoot>/<agent>/pauza.json` (on sadik `/var/lib/dsh-pauza/<agent>/`) | published pause status; `<agent>` is the name of the `spoolDir` directory |
| `<voiceTempBaseDirectory>/dsh-voice-<uid>/<workspace hash>/` (default `/var/tmp`) | temporary voice files, `0700` |
| `/var/lib/dsh-mail-stop-arrivals/*.json` | stop-arrival observer records (root service) |

## Installation

npm provides `3.1.7` (checked on 2026-10-15 with `npm view dsh-telegram-multiagent version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. Deploy the current local edition from the source tree through the review gates; the author does not deploy it. Source: `/opt/iskra/workspace/dsh-plugins/packages/dsh-telegram-multiagent`.

1. Release: version number and heading in `CHANGELOG.md`, `vypusk-tegom` gate, commit and tag in the tree.
2. Dry run of the mount (writes nothing):
   `sudo smontirovat-vypusk <tag> packages/dsh-telegram-multiagent /opt/agent-plugins/dsh-telegram-multiagent --progon`
3. Mount by publication composition, with a backup in `/var/backups/montazh/<item>/`:
   `sudo smontirovat-vypusk <tag> packages/dsh-telegram-multiagent /opt/agent-plugins/dsh-telegram-multiagent --v-boj <item>`
4. Update the `telegram-multiagent` entry in `/etc/agent-registry/plugins.yaml` (`version`, `fingerprint`) via `pravka`.
5. New code is loaded only when the process starts: the assigned hand restarts every service that loads it (`avrora`, `iskra`, `zarya`, `spartak`, `marc`, `petrovich`, `varvara`, `anna`, `alfa`, `beta`, `gamma` `.service`). An agent does not restart its own service from inside.
6. The observer unit is installed separately, by a per-file mount, and only if it changed:
   `sudo smontirovat-fajly --punkt <item> --v-boj <tag copy>/packages/dsh-telegram-multiagent/systemd /etc/systemd/system mail-stop-arrival.service`,
   then `sudo systemctl daemon-reload && sudo systemctl enable --now mail-stop-arrival.service`. After `observe-mail-stop.mjs` or `mail-stop-arrival.js` change — `sudo systemctl restart mail-stop-arrival.service`. Requires a root-owned `/etc/dsh-mail-stop/arrival-observer.json` (fields exactly `root`, `mailboxes`, at most 32 mailboxes) and the directory `/var/lib/dsh-mail-stop-arrivals`: the observer creates it itself (`0755`), and an existing one must be a root directory, not a link, with no write for group and others — otherwise refusal `arrival_root_untrusted`.

A check outside the farm, in a clean directory (without our gates and without the DSH platform):

```sh
cd <дерево>/packages/dsh-telegram-multiagent && npm pack --ignore-scripts --pack-destination /tmp/proba
cd /tmp/proba && npm init -y && npm install --ignore-scripts ./dsh-telegram-multiagent-*.tgz @deepseek-ai/cordis@4.0.1
cd node_modules/dsh-telegram-multiagent && npm test
```

`@deepseek-ai/cordis` 4.0.1 is the package's devDependency and is on the public npm registry; without it the tests that load the module through cordis are blind. The DSH platform (`@deepseek-ai/dsh-session` and others) cannot be installed this way: the tests that need it stay blind until `DSH_TEST_APP` is set — the `app` directory of an installed platform. Sibling packages — `GATEWAY_CANDIDATE`, `ADAPTER_CANDIDATE`, `BRIDGE_CANDIDATE`. Blindness is not a package failure: what goes blind and why — [docs/GUARDS.md](docs/GUARDS.md), "Composition of test/".

Connecting an agent: the block `- insert: - name: dsh-telegram-multiagent` in a profile built from the registry template, plus the symlink in the profile's `node_modules`. Editing a profile by hand is forbidden — only through the registry (`agents.yaml` and templates).

## Configuration

Settings come from three places: the module `config` in the profile, the `settingsFile` JSON file, and the process environment. Production paths: token — `/etc/dsh-telegram/<agent>.token`, JSON — `/etc/dsh-telegram/<agent>.json`.

**`config` in the profile (read at startup):**

| Key | Default | Meaning |
|---|---|---|
| `tokenFile` | unset | Bot token file; read first. Empty or unreadable — the channel does not start |
| `token` | unset | Token inline in the config; used only when there is no `tokenFile` |
| `tokenEnv` | `DSH_TELEGRAM_BOT_TOKEN` | Name of the environment variable holding the token; last fallback |
| `settingsFile` | `tokenFile` with `.token` → `.json` | JSON with reloadable settings (table below) |
| `appDir` | `$DSH_APP_DIR` | This agent's DSH installation; `@deepseek-ai/dsh-*` are resolved from it. Unset or unresolvable — the channel does not start |
| `workspace` | `process.cwd()` | Working directory: ledger, attachments, `vydacha/`, session cwd |
| `agentName` | `telegram` in the log, `агент` in texts | Agent name in the log and in texts to the interlocutor; default name for addressing in groups |
| `allowedUsers` | `[]` | Numeric Telegram IDs with privileges. With `openBot: false` an empty list admits nobody |
| `openBot` | `false` | `true` — anyone may talk; commands, goals and copies stay with `allowedUsers` only; enables `telegram_make_pdf` and guest copies |
| `preset` | platform choice | Tool preset for ordinary conversations |
| `guestPreset` | `site.preset` | Preset for guest chats of the open bot |
| `provider`, `model` | platform `agentDefaultModel` | Fallback model choice if the default-model service did not come up |
| `mergeChatIntoA2A` | unset | ID of the private chat merged into the service-channel session (`a2aSession`) |
| `a2aDir` | unset (A2A off) | Exchange directory: `in/` (input), `out/` (answers), `polnye/` (outgoing mirror used for copies), `tell/` |
| `a2aSession` | `a2a` | Conversation key of the service channel |
| `spoolDir` | unset (off) | Mail-carrier box; its directory name is the agent key for pause, stop by mail, and Codex control. Without an absolute path the pause is not published and stop by mail is not applied |
| `spoolStaleHours` | `12` | How many hours a letter may wait before it is marked "possibly stale" |
| `goalUsers` | `[]` | Who may issue `/goal` from Telegram in a closed bot (with `openBot`, `allowedUsers` is used instead). The limit is in code, not a setting: at most 3 new goals per channel per rolling hour (`GOAL_MAX_PER_HOUR` in `src/index.js`); beyond it the bot refuses and asks for a human; stopping a goal is not limited |
| `goalA2ASenders` | `[]` | Only a counter in the `[goal] смонтирован` log line; does not affect admission (see "Limitations") |
| `supervisor` | unset | Target agent of the `pismo_rukovoditelyu` tool; unset — no tool |
| `transcribeCommand` | unset | Voice transcription command (`<command> <file> auto`); unset — voice messages are not transcribed |
| `transcribeTimeoutMs` | `300000` | Transcription limit; when reached, the whole process group is killed |
| `describeCommand` | unset | Image description command; unset — images are not described |
| `describeTimeoutMs` | `120000` | Image description limit |
| `telegramFileTimeoutMs` | `30000` | Overall voice download limit (metadata, headers, body) |
| `telegramFileMaxBytes` | `20971520` | Limit on actually read voice bytes |
| `voiceTempBaseDirectory` | `/var/tmp` | Where to create the temporary voice directory; it may not lie inside `workspace` |
| `pdfTemplatesDir` | unset | Absolute directory of PDF letterheads; unset — `telegram_make_pdf` refuses |
| `site` | unset | Website chat: `{preset, spoolDir, stateFile}`. Enabled only when `ownerChatId` is valid; then `openBot: true` and `site.preset` are mandatory, otherwise module startup fails with an error |

**Keys in the `settingsFile` JSON and in `config` (JSON wins when the key is present in it):**

| Key | Default | When read | Meaning |
|---|---|---|---|
| `ownerChatId` | empty | on every use | Owner; must be in `allowedUsers`. Empty, null or a JSON error disables owner commands, copies and the website |
| `newSessionsEnabled` | `false` | on every use | Allows `/new` (generation rotation) |
| `guestCopyRecipients` | `[]` | on every use | Where guest conversations are copied (at most 8): `{kind:"telegram",id}` from `allowedUsers`, `{kind:"a2a",agent}` — a letter per message, or `{kind:"a2a-svertka",agent}` — one fold letter per conversation to an observer (conditions — [docs/SETTINGS.md](docs/SETTINGS.md)) |
| `pdnMaskaSvertki` | unset | on every delivery | `{modul, reestr, belyjSpisok}` — contact mask for guest conversation summaries; unset — the summary is not delivered. `modul` must be a regular root file, not a link, with no write for group and others, otherwise it is not loaded and the summary is not delivered |
| `adresatyTrevogFile` | unset | on every alarm | JSON with `telegramUserIds` — who else gets the summary alarm (at most 1 per conversation per 30 min and 10 per day) |
| `a2aCoordinatorPrefixes` | `[]` | at startup | Coordinator name prefixes — a hint, not authority |
| `coordinatorTrustFile` | empty | at startup | Root-owned JSON with the coordinator's public keys; empty — signatures are not trusted. In production `/etc/a2a/coordinator-signature.json` |
| `mailStopConfigFile` | empty | at startup | Root-owned JSON of the stop receiver (`version, recipient, status_key_id, status_key_file, arrival_root`); empty or unreadable — stop by mail is not applied. In production `/etc/dsh-mail-stop/receiver-<agent>.json` |
| `pauseStateRoot` | `<workspace>/.pause-state` | at startup | Root of pause files; in production `/var/lib/dsh-pauza` |
| `compactSettingsRoot` | empty | at startup | Codex journal settings directory for `/compact-status`; in production `/etc/dsh-pamyat/agenty` |
| `receiptReviewer` | `координатор` | at startup | Who reviews held receipts (label in notices) |
| `remoteReturnRecipients` | `{}` | at startup | Table "agent → courier recipient" for remote return receipts; anything unknown is held |
| `coordinatorReturnRecipient` | empty | at startup | Recipient of the return receipt for signed letters |
| `remoteCourierEnvKey` | `A2A_TELL_DIR` | at startup | Variable through which the courier receives the `tell` directory; `A2A_ZERKALO` is reserved |
| `sharedSenderName` | `shared-user` | at startup | Name of the shared account that is never given a return address |
| `siteSpoolDir` | `site.spoolDir` or `<workspace>/.site-spool` | at startup | Website spool (`vhod/`, `kopii/`, `vyhod/`) |
| `siteStateFile` | `site.stateFile` or `<workspace>/.site-state/closed` | at startup | Website on/off switch file |

"At startup" keys change only with a service restart. A wrong type or a relative path in them is refused before any file action.

**JSON `settingsFile` only:**

| Key | Default | Meaning |
|---|---|---|
| `deliveryMode` | `personal` | `personal` — answer only to the source; `owner-all` — service-channel letters and their answers are copied to the owner; `broadcast` — copy to the other channel |
| `groups` | `{}` | Working groups: `{"<chat_id>": {mode:"mention", names, replyCounts, context, username}}`; `context` defaults to 20, at most 100. Voice messages from allowed users are transcribed before the addressing check (see "Limitations") |
| `mailStopOwnerCopies` | `true` | `false` — do not copy stop-by-mail outcomes to the owner |
| `statelessProviders` | `[]` | Stateless providers for which `/new` is allowed without the `conversationIdentity` capability (`claude-oauth` is not allowed; `newConversationRestore` is required) |

**Environment:**

| Variable | Default | Reader, meaning |
|---|---|---|
| `DSH_APP_DIR` | — | Fallback `appDir` |
| `DSH_TELEGRAM_BOT_TOKEN` (or the name from `tokenEnv`) | — | Fallback token |
| `KOMPAKT_AGENT` | — | `/compact-status`: file name `<compactSettingsRoot>/<name>.json` |
| `DSH_HOME` | — | Passed to `/usr/local/bin/a2a-send` — the local courier for supervisor letters and guest copies |
| `DSH_MAIL_STOP_CONFIG` | `/etc/dsh-mail-stop/sender.json` | `send-mail-stop.mjs`: sender config (`version, key_id, key_file, modes, recipients`, `transport` `ssh`/`local`; optional `host` — the ssh host or alias for `transport: ssh`, default `sadik`, name matching `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$`, otherwise `sender_config_untrusted`, exit 2; exit codes and output of the stop helpers — [MAIL-STOP.md](MAIL-STOP.md)) |
| `DSH_MAIL_STOP_STATUS_TRUST` | `/etc/dsh-mail-stop/status-trust.json` | `read-mail-stop-status.mjs`: public status keys |
| `DSH_MAIL_STOP_SENDER` | `/usr/local/lib/dsh-mail-stop/src/send-mail-stop.mjs` | `courier/iskra-tell`: path of the stop helper |
| `OT`, `A2A_TELL_REPLY` (`no`), `PREDEL_ZNAKOV` (`3500`) | — | `courier/iskra-tell`: sender name, whether to expect a reply, letter character limit |
| `VSE_STENDY_PREDEL_S` | `300` | `test/vse-stendy.mjs`: per-test limit, s |

The module passes `TMPDIR=<temporary voice directory>` to the transcriber and, when the archive is disabled, `VOICE_ARCHIVE_DISABLE=1`.

Fixed code limits (Bot API calls, chunk length, attachments, retention periods, wakeups) are collected in [docs/SETTINGS.md](docs/SETTINGS.md) ("Fixed numeric limits").

## Verification

What is in production (from the registry entry):

```sh
node -p "require('/opt/agent-plugins/dsh-telegram-multiagent/package.json').version"   # installed_check
readlink /opt/iskra/.dsh/profiles/web/node_modules/dsh-telegram-multiagent             # healthcheck → /opt/agent-plugins/dsh-telegram-multiagent
```

Composition fingerprint (the entry's `fingerprint_check`; must equal `fingerprint`):

```sh
set -o pipefail; cd /opt/agent-plugins/dsh-telegram-multiagent && npm pack --dry-run --json 2>/dev/null \
 | jq -r '.[0].files[].path' | grep -v '\.bak' | LC_ALL=C sort \
 | while read -r f; do printf '%s %s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done | sha256sum | cut -c1-16
```

Live sign: at startup the agent service log contains `[dsh-telegram-multiagent <version> · область …] подъём` and no `🔴` lines about the token, `appDir` or settings. Observer: `systemctl is-active mail-stop-arrival.service` → `active`, and `mail-stop-arrival: ready` in its log.

Tests:

```sh
cd /opt/agent-plugins/dsh-telegram-multiagent
DSH_TEST_APP=/opt/<agent>/app npm test          # = node test/vse-stendy.mjs
```

`vse-stendy.mjs` takes every `test/stend-*.mjs` from disk (currently 176) and runs each in its own process with the `VSE_STENDY_PREDEL_S` limit (300 s). Exit codes: `0` — all green; `1` — at least one diverged or hit the limit; `2` — no divergences, but some tests were blind (subject or prerequisites missing: `DSH_TEST_APP`, the neighbouring memory core, the website adapter `SITE_ADAPTER_CANDIDATE`, root for some stop-by-mail tests). Final line: `═══ стендов N · зелёных … · расхождений … · слепота …`.

Outside the common run, started separately:
- `node test/test-goal-control.mjs`, `node test/site-command-integration.mjs`, `node test/site-bridge-prestep.mjs`;
- PDF: `python3 -B test/test_pdf_calculation.py` (and `test_pdf_letterheads.py`, `test_pdf_saved_result.py`, `test_pdf_guest_proposal.py`, `test_pdf_frozen_footer.py`) — unittest, exit 0 on success; require `reportlab` and `pypdf`, and `test_pdf_letterheads.py` and `test_pdf_frozen_footer.py` also PyMuPDF (`fitz`): without it these two exit with code 2 (blindness).

The full composition of `test/` — what the common run executes, what is started separately, which files are helpers and workers rather than tests, and which environment variables make tests blind or refuse under root — is in [docs/GUARDS.md](docs/GUARDS.md), section "Composition of test/".

Passing tests does not prove live delivery: `sent_at` in a receipt is the Bot API response, not a person reading the message.

## Limitations

- Does not protect against root on the machine and is not a secret store: several accounts on sadik have full sudo and can read any key.
- The sender name in a letter, `From:`, the file name and `OT` are hints, not authority. Coordinator rights come only from a signed envelope verified against `coordinatorTrustFile`. `/goal` from the service channel is accepted only from a signed letter in `<a2aDir>/in`. `goalA2ASenders` is read but affects nothing.
- Delivery is not "exactly once": if a Bot API response is lost, retries can produce a physical duplicate. A file (`telegram_send_file`) is sent in one attempt with no recovery queue; an unknown outcome is reconciled by hand.
- Unknown execution is neither repeated nor declared a success: the receipt is held until the operator reviews it (`receipt-admin.mjs`).
- `/stop` and pause do not recall external work already done; removing a task from the schedule does not recall input already delivered.
- Releasing a pause mid-turn (A-N-1881): if owner input released the pause while the interrupted turn was still running (`owner_turn` not yet recorded), then on that turn's `turn/end` the agent is woken once, when it becomes idle (`agent.whenIdle` → `wakeGate.resumeAfterOwner`); the pause state is re-checked before the wake. If the platform agent has no `agent.whenIdle`, there is no wake, and the log gets the line «Пауза <session>: нет agent.whenIdle — побудка после хода не выполнена».
- Receipt reconciliation against session history (`observe`/`reconcile`) runs once per session per cycle (B-N-1892); again only if a row needs recovery and the session was reconciled without it. Boundary: events that reach the session mid-cycle are seen by the other receipts of that session only on the next cycle.
- "At startup" keys, and adding `ownerChatId` to enable the website, require a service restart.
- If `tokenFile` does not end in `.token` and `settingsFile` is unset, the token file itself becomes the settings file: the JSON will not parse, and the channel will run in `personal` mode without an owner and without `/new`.
- Website: with `site` and `ownerChatId` set but without `openBot: true` or `site.preset`, module startup fails with `Site requires openBot, owner and dedicated preset`. The module does not clean up website and guest session files — that is an external timer (`site-sroki-varvara.timer`).
- Working-group context lives only in process memory and is lost on restart; name inflections are not guessed.
- Attachments are not scanned for malware; voice and images are handled by external commands, and without them the module only writes a log line.
- The stop observer does not delete its records (limit 4096); the mounting hand archives them. Files that were already in a mailbox before the observer started remain "arrival unknown".
- `courier/coder-tell` passes only `-f`, `--stop-pause`, `--stop-replace`; `--new` for coders is available only through `iskra-tell --coder <alfa|beta|gamma> --new`.
- The Telegram message handler is awaited inside the polling loop (accepted risk, finding №10): while a voice message from an allowed user is being transcribed, the whole channel intake stops — Telegram, service mail, the postman mailbox, the receipt tick — for up to `transcribeTimeoutMs` (default 300 000 ms) plus about 10 s; text while the agent is busy holds intake for up to 15 s (waiting for the agent to go idle). Inputs are not lost — they are already in receipts — but stop letters and replies to other chats are delayed.
- In a working group (`groups`) a voice message from an allowed user (with `openBot` — from any participant) is downloaded and passed to the external `transcribeCommand` BEFORE the addressing check: this is how the bot's name is searched for in speech. So every such voice message in the group is transcribed, even if not addressed to the bot: transcriber time and cost, and other people's conversations handed to an external command.
- Compatibility was checked on DSH `0.2.0-rc.2` and Node.js `24.19.0` (`engines`: Node ≥ 24 is the verified environment; the built-in `node:sqlite` also exists in Node 22.13+, but with `ExperimentalWarning`, and we have not checked the package on 22).


Runtime R size reset uses the shared `/etc/dsh-telegram-multiagent/usage-runtime-policy.json`: proposed file cap 32 MiB, record cap 64 KiB. An empty temp is fsynced and renamed over the current file, followed by directory fsync; there is no archive. Restart preserves a healthy file below cap; one LF closes a partial tail before append. Install the incremental reader and watcher before the writer. On inode change the reader starts at offset zero and keeps one notice that some rows may have been lost in every receipt for the affected accumulated sum. R can repeat the same native-turn snapshot; stable keys and fixture probes are described in [USAGE-RUNTIME.md](USAGE-RUNTIME.md). This candidate does not change the release number, CHANGELOG or tag.

LOW policy boundary: if the policy is removed after the last successful check of an in-flight append, that operation may finish; the next queued append stops with R_POLICY_INVALID. Reset has its own policy check; there is no extra check before LF/write.

Records over recordMaxBytes are skipped without latching a source failure; the process log reports `[usage] R_RECORD_TOO_LARGE skipped=N`, counted per writer instance. The next normal record proceeds; the heartbeat wire shape has no new counter field. After R_POLICY_INVALID, the next append rechecks the policy and resumes without a service restart once it is repaired; missed facts are not replayed. R_RESET_FAILED remains latched because rename may have completed before directory fsync failed: after `[usage] R_RESET_FAILED`, restart the service when the agent is idle. Other source failures remain latched.
