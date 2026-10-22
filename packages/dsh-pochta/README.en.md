Russian version: [README.md](README.md) · English below

# dsh-pochta — sadik agent letters, slot and receipt watchers, release of the mail stop HOLD

Версия · Version: 3.1.6

## Purpose

Letters between agents travel through slots — directories from which a collector on the other side picks them up. The sender sees «положено» (placed), not «доставлено» (delivered). A mistake in the file name silently sends the letter to the wrong recipient. If pickup stops, nobody will know. The package covers this from both ends.
- Sending checks the recipient, the slot and the permissions before the letter is placed:
  - `tell-komu` — a letter to aclaude agents; the recipient is taken from the file name;
  - `zabava-tell` — a short letter to the coordinator;
  - `zabava-v2-pismo` with the `a2a-v2.py` transport — a coordinator letter to the local `a2a/in` box of a sadik agent over protocol v2.
- Watchers check the result:
  - `zastryalo-v-shcheli` and `zastryalo-varvara` — a letter has stayed in a slot longer than the limit;
  - `receipt-watch` — a taken letter has no outcome (interrupted turn);
  - `a2a-owner-copy-watch` — the owner did not get a copy of a question from the a2a box in time.

Two manual tools of the signed mail stop also belong here. `mail-stop-hold` shows and releases the HOLD that the stop left in the agent's receipt database. `mail-stop-trust-sverka.mjs` checks the stop trust file. Separately there is `srochnoe-novye` — a counter of unread items in Iskra's urgent channel.

Who calls:
- watchers — systemd timers;
- `tell-komu` — sadik agents by hand, and also `chitatel-obhoda` (dsh-storozha-sadik) and `zadaniya-prervany-watch` (dsh-storozha-mashiny);
- `a2a-v2.py` — `zabava-v2-pismo` and `a2a-send --v2` (package a2a-bus, via `v2_with_mirror.py`);
- the rest — an agent or root by hand.

Who reads the result:
- watcher alerts — recipients of `agent-alert`;
- `receipt-watch` failure — `receipt-watch-failed.service` (package dsh-kopiya-mashiny);
- letters — the coordinator's collector on aclaude and the dsh-telegram-multiagent receiver on sadik.

## What is installed and where

Paths and permissions were checked against the `dsh-pochta` entry in `/etc/agent-registry/plugins.yaml` (section `services`, `derevo.files`) and against `stat` of the production files.

| file in package | path on machine | mode, owner | who runs / reads |
|---|---|---|---|
| `bin/tell-komu` | `/usr/local/bin/tell-komu` | 0755 root:root | sadik agents by hand; `chitatel-obhoda`, `zadaniya-prervany-watch` |
| `bin/zabava-tell` | `/usr/local/bin/zabava-tell` | 0755 root:root | agent by hand |
| `bin/zabava-v2-pismo` | `/usr/local/bin/zabava-v2-pismo` | 0755 root:root | root by hand (`sudo zabava-v2-pismo ФАЙЛ ПОЛУЧАТЕЛЬ`) |
| `bin/srochnoe-novye` | `/usr/local/bin/srochnoe-novye` | 0755 root:root | by hand |
| `libexec/a2a-v2.py` | `/usr/local/libexec/a2a-v2.py` | 0644 root:root | loaded as a module: `zabava-v2-pismo` (`HELPER_FILE`), `a2a-send --v2` (`A2A_V2_HELPER`); can be called as `python3 a2a-v2.py probe|decision …` |
| `bin/a2a-owner-copy-watch` | `/usr/local/bin/a2a-owner-copy-watch` | 0755 root:root | `a2a-owner-copy-watch.service` via `python-padenie-70` |
| `bin/receipt-watch` | `/usr/local/bin/receipt-watch` | 0755 root:root | `receipt-watch.service` |
| `sbin/zastryalo-v-shcheli` | `/usr/local/sbin/zastryalo-v-shcheli` | 0755 root:root | `zastryalo-v-shcheli.service` (User=iskra) and `zastryalo-v-shcheli@<агент>.service` (User=<agent>), except `@varvara` |
| `libexec/zastryalo-varvara` | `/usr/local/libexec/zastryalo-varvara` | 0755 root:root | `zastryalo-v-shcheli@varvara.service` (drop-in `20-two-queues.conf` replaces ExecStart) |
| `sbin/mail-stop-hold` | `/usr/local/sbin/mail-stop-hold` | 0755 root:root | root by hand; the hint for it is printed by `mail-stop-receiver.js` (dsh-telegram-multiagent) |
| `sbin/mail-stop-trust-sverka.mjs` | `/usr/local/sbin/mail-stop-trust-sverka.mjs` | 0644 root:root | root by hand: `sudo node /usr/local/sbin/mail-stop-trust-sverka.mjs` |
| `systemd/a2a-owner-copy-watch.service` | `/etc/systemd/system/a2a-owner-copy-watch.service` | 0644 root:root | own timer; oneshot, `StateDirectory=a2a-owner-copy-watch`, `SuccessExitStatus=1` |
| `systemd/a2a-owner-copy-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/a2a-owner-copy-watch.service.d/60-python-padenie-70.conf` | 0644 root:root | systemd: start via `/usr/local/bin/python-padenie-70` (package dsh-storozha-mashiny) |
| `systemd/a2a-owner-copy-watch.service.d/70-predely.conf` | `/etc/systemd/system/a2a-owner-copy-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/a2a-owner-copy-watch.timer` | `/etc/systemd/system/a2a-owner-copy-watch.timer` | 0644 root:root | systemd: once a minute (`OnBootSec=1min`, `OnUnitActiveSec=1min`); enabled |
| `systemd/receipt-watch.service` | `/etc/systemd/system/receipt-watch.service` | 0644 root:root | own timer; oneshot |
| `systemd/receipt-watch.service.d/ohvat.conf` | `/etc/systemd/system/receipt-watch.service.d/ohvat.conf` | 0644 root:root | systemd: `RECEIPT_LEDGER_PATHS` — 18 agent ledgers |
| `systemd/receipt-watch.service.d/onfailure.conf` | `/etc/systemd/system/receipt-watch.service.d/onfailure.conf` | 0644 root:root | systemd: `OnFailure=receipt-watch-failed.service` (package dsh-kopiya-mashiny) |
| `systemd/receipt-watch.service.d/70-predely.conf` | `/etc/systemd/system/receipt-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/receipt-watch.timer` | `/etc/systemd/system/receipt-watch.timer` | 0644 root:root | systemd: once an hour, first run 10 min after boot, `Persistent=true`; enabled |
| `systemd/zastryalo-v-shcheli.service` | `/etc/systemd/system/zastryalo-v-shcheli.service` | 0644 root:root | own timer; `User=iskra` |
| `systemd/zastryalo-v-shcheli.timer` | `/etc/systemd/system/zastryalo-v-shcheli.timer` | 0644 root:root | systemd: `OnCalendar=*:0/5`, `Persistent=true`; enabled |
| `systemd/zastryalo-v-shcheli@.service` | `/etc/systemd/system/zastryalo-v-shcheli@.service` | 0644 root:root | template: `User=%i`, `ZASTRYALO_SHCHEL=/opt/%i/a2a/tell` |
| `systemd/zastryalo-v-shcheli@.timer` | `/etc/systemd/system/zastryalo-v-shcheli@.timer` | 0644 root:root | systemd: `*:0/5`; instances `@avrora`, `@varvara`, `@zarya` are enabled |
| `systemd/zastryalo-v-shcheli@varvara.service.d/20-two-queues.conf` | `/etc/systemd/system/zastryalo-v-shcheli@varvara.service.d/20-two-queues.conf` | 0644 root:root | systemd: Varvara's two slots via `zastryalo-varvara`, `StateDirectory=zastryalo-varvara` |

Not installed into production: `README.md`, `README.en.md`, `CHANGELOG.md`, `LICENSE`, `test/`. Add `test/` to `derevo.not_installed` for this release; the other file mappings remain unchanged.

The package is sources without `package.json`: `bin/`, `sbin/`, `libexec/` repeat the paths under `/usr/local/`, `systemd/` — the paths under `/etc/systemd/system/`. The current version is in the heading of `CHANGELOG.md` and in the tag `dsh-pochta-v<номер>` of the tree `/opt/iskra/workspace/dsh-plugins`.

The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`). Slots, recipients and paths of the sadik machine are hard-coded as defaults; which of them can be overridden by the environment or a key is described in "Configuration"; the list of `tell-komu` recipients can be changed only by editing the code.

Required on the machine (not part of the package):
- programs: `bash`, `python3` (with the `yaml` module — PyYAML — for `a2a-owner-copy-watch`: without it the watcher fails on import, and `python-padenie-70` exits with code 70), `node`, `systemctl`, `journalctl`, `sudo`, `logger`;
- versions: Python 3 — the code shows no signs of needing anything newer than 3.7 (production — 3.12); Node ≥ 16.9 for `mail-stop-trust-sverka.mjs` (`Object.hasOwn`, :34; production — 24);
- `/usr/local/bin/agent-alert` (package dsh-trevogi) — watcher alerts;
- `/usr/local/bin/python-padenie-70` (dsh-storozha-mashiny);
- `/usr/local/libexec/agent-hod/hod-sluzhby` (package dsh-podyom) — `mail-stop-hold snyat` and `snyat-pauzu` call it before writing: non-zero code — refusal 2; file missing (as with `systemctl`, `ps`) — «🔴 ОТКАЗ: <исполняемое> не исполнился (<причина>) — признак слеп» (REFUSAL: <executable> did not run (<reason>) — the signal is blind), code 2, nothing is written;
- `receipt-watch-failed.service` (dsh-kopiya-mashiny);
- the slot list `/etc/a2a/tell-shcheli.list` — without it `tell-komu` refuses any letter with code 3;
- v2 routes `/etc/a2a/v2-receivers.json` and `/etc/a2a/zabava-v2-receivers.json`;
- the stop trust file `/etc/a2a/coordinator-signature.json`, stop settings in `/etc/dsh-mail-stop/`;
- the agent registry `/etc/agent-registry/agents.yaml` (format and the `agent-registry` program — package a2a-bus);
- agent receipt ledgers (`<дом>/workspace/.message-receipts/receipts.sqlite`, written by dsh-telegram-multiagent);
- the `a2a-pochtalon.service` journal (package a2a-bus) — read by `a2a-owner-copy-watch`.

## Installation

We install it like this:

1. A change goes as a candidate through the gate. Under a temporary rule (Veniamin, 07.10.2026) any file of the package changes only together with a new package number: the heading in `CHANGELOG.md` and the tag `dsh-pochta-v<номер>` in the tree `/opt/iskra/workspace/dsh-plugins`.
2. Installation is file by file, with `smontirovat-fajly` (package dsh-montazh), a separate call for each production directory. First a dry run, then production:
   ```bash
   sudo smontirovat-fajly --punkt <пункт> --progon --osnova tell-komu=<sha256 боя> \
        <дерево>/packages/dsh-pochta/bin /usr/local/bin tell-komu
   sudo smontirovat-fajly --punkt <пункт> --v-boj  --osnova tell-komu=<sha256 боя> \
        <дерево>/packages/dsh-pochta/bin /usr/local/bin tell-komu
   ```
   Units and drop-ins are installed the same way into `/etc/systemd/system/` and into their own `*.service.d/` directory. A file that is not yet in production — only with `--novyj --mode=<режим из таблицы> --owner=0:0`.
3. After a change to a unit or drop-in: `sudo systemctl daemon-reload`. `smontirovat-fajly` does not do this itself. Scripts are picked up by the next timer run.
4. New timer: `sudo systemctl enable --now <имя>.timer`. Watcher for a new agent slot: `sudo systemctl enable --now zastryalo-v-shcheli@<агент>.timer`. The template fits only if the account, the directory `/opt/<агент>` and the slot `/opt/<агент>/a2a/tell` match by name.
5. After installation, `version` (the `installed_check` fingerprint) and `derevo.ref` in the `dsh-pochta` registry entry are moved to the new tag.

Removing a unit — `systemctl mask` (farm rule 9). Our unit with a file in `/etc/systemd/system` will not accept mask, so do this: move the file to a backup copy (`mv`), `daemon-reload`, `mask`. To restore — `unmask` and put the file back.

## Configuration

Everything below is taken from the code. "Test only" marks overrides that are not set on production units. In the "default" column, "—" means the variable is not set;
words describe defaults that the code computes.

**`tell-komu <файл>`** — file name `dlya-<кому>-<тема>.<расширение>`, where `<кому>` is `veniamina`, `mihalycha`, `zabavy` or `vseh` (genitive case).

| variable / argument | default | meaning |
|---|---|---|
| `DSH_HOME` | — | if set, the agent root = `DSH_HOME` without `/.dsh`; otherwise `HOME` |
| `ZABAVA_TELL_DIR` | `<корень>/a2a/tell` | outgoing slot; must be in the list `/etc/a2a/tell-shcheli.list` |
| `A2A_ZERKALO` | `<корень>/a2a/polnye` | mirror: a full copy of the letter under the same name |
| `A2A_TELL_LIST` | `/etc/a2a/tell-shcheli.list` | override of the slot list — only together with `A2A_TELL_PROBA=1`, with a journal record |
| `A2A_TELL_PROBA` | `0` | `1` — a declared probe: without it overriding `A2A_TELL_LIST` is refusal 3 |
| `A2A_SKIP_ADRESAT=1` | off | deliberate bypass of the recipient check |
| `A2A_PROVERENO_DO` | `5560` | characters; checked delivery depth; longer — a warning, the letter is placed anyway |
| `A2A_KONFIG_IMEN` | `/opt/iskra/.dsh/profiles/web/cordis.patch.yml` | where to take full package names for the warning about shortened names |
| `--v2` | — | refusal 3: v2 is allowed only sadik→sadik |

**`zabava-tell "текст" | - | -f файл | -- "-текст"`**

| variable | default | meaning |
|---|---|---|
| `ZABAVA_TELL_DIR` | `$HOME/a2a/tell` | outgoing slot; file `tell-<наносекунды>.txt`, mode 664 |

**`zabava-v2-pismo ФАЙЛ ПОЛУЧАТЕЛЬ [--supersedes ID]`** (under sudo)

| item | value in code | meaning |
|---|---|---|
| `/etc/a2a/zabava-v2-receivers.json` | hard-coded | recipient route: `inbox`, `ledger`, `owner`, `mode` (only 0644 or 0664) |
| `/usr/local/libexec/a2a-v2.py` | hard-coded | v2 transport |
| v2 support probe | 60 s | without reader confirmation the letter is not sent |
| `--supersedes` result | 60 s of observation | cancellation outcome: `confirmed`, `too_late`, `held`, `not_confirmed` or `unknown` |

**`python3 /usr/local/libexec/a2a-v2.py probe|decision <получатель> [metadata.json]`**

| variable | default | meaning |
|---|---|---|
| `A2A_V2_ROUTES` | `/etc/a2a/v2-receivers.json` | routes; only a route with `machine: sadik` is valid |

**`srochnoe-novye [--otmetit]`**

| variable / key | default | meaning |
|---|---|---|
| `SROCHNOE` | `/opt/iskra/workspace/srochnoe` | urgent channel directory; `*.txt` files newer than the `.prochitano-do` mark count as new |
| `--otmetit` | — | update the read mark |

**`a2a-owner-copy-watch [--inspect | --baseline <APPROVED_JSON>]`**

| variable / key | default | meaning |
|---|---|---|
| `A2A_COPY_REGISTRY` | `/etc/agent-registry/agents.yaml` | agents with a telegram channel and their homes |
| `A2A_COPY_STATE` | `/var/lib/a2a-owner-copy-watch/state.sqlite` | own state: seen letters, the postman journal cursor, alert times |
| `A2A_COPY_ALERT` | `/usr/local/bin/agent-alert` | alert sender (`--plain`) |
| `A2A_COPY_NOW_MS` | current time | test only |
| `A2A_COPY_POCHTALON_LOG` | — | test only: a file instead of the `a2a-pochtalon.service` journal; do not set on the production unit |
| `--inspect` | — | look without saving anything |
| `--baseline` | — | write once the approved list of old letters, before the first alerts |
| threshold / alert | 300 s / one per agent per 6 h | hard-coded |

**`receipt-watch`** (any argument — blindness, code 2)

| variable | default | meaning |
|---|---|---|
| `RECEIPT_LEDGER_PATHS` | `/opt/iskra/workspace/.message-receipts/receipts.sqlite`, `/opt/petrovich/workspace/.message-receipts/receipts.sqlite` | absolute ledger paths, one per line; in production the drop-in `ohvat.conf` gives 17 paths |
| `RECEIPT_MAX_AGE_SECONDS` | `86400` | a taken letter without an outcome older than this is overdue |

**`zastryalo-v-shcheli`**

| variable | default | meaning |
|---|---|---|
| `ZASTRYALO_SHCHEL` | `/opt/iskra/a2a/tell` | slot; in the `@` template — `/opt/%i/a2a/tell` |
| `ZASTRYALO_PREDEL_MIN` | `5` | dwell limit, min |
| `A2A_ZERKALO` | `$HOME/a2a/polnye` | mirror for the «положено за сутки» (placed in a day) count |
| `ZASTRYALO_ALERT` | `/usr/local/bin/agent-alert` | alert sender |

**`zastryalo-varvara --shchel <путь> --shchel <путь> --state-dir <путь> [--alert-bin <путь>]`** — paths are absolute, exactly two slots. In production the drop-in passes `/opt/varvara/a2a/tell`, `/opt/varvara/workspace/a2a/tell`, `/var/lib/zastryalo-varvara` and `/usr/local/bin/agent-alert`. The 300 s threshold and the limit of at most 10 alerts per hour for both slots together are hard-coded.

**`mail-stop-hold`**
- `pokazat <агент>` — the default mode;
- `snyat <агент> <control_id> --prichina '…' [--backlog vernut|derzhat] [--sdk-sverka '…'] [--v-boj]`;
- `snyat-pauzu <агент> <control_id> --prichina '…' [--v-boj]`;
- `zakryt-kvitanciyu <агент> <control_id> --prichina '…' [--v-boj]`.

Without `--v-boj` — a dry run: all checks, nothing is written.

| variable / key | default | meaning |
|---|---|---|
| `--backlog` | `vernut` | return held letters to the normal path or keep them held |
| `--sdk-sverka` | — | proof by hand that the SDK request has finished (mandatory for an agent without a gateway) |
| `MSH_DB` | `<WorkingDirectory службы>/.message-receipts/receipts.sqlite` | test only |
| `MSH_BACKUP` | `/var/backups/montazh/mail-stop-hold` | where to put the database backup copy before writing |
| `MSH_HOD` | `/usr/local/libexec/agent-hod/hod-sluzhby` | test only; any `MSH_*` override is printed with the line «ПОДМЕНА» (OVERRIDE) |
| `MSH_SYSTEMCTL` | `systemctl` | test only |
| `MSH_NOW_MS` | current time | test only |

**`mail-stop-trust-sverka.mjs [--trust <файл>] [--stop-config <файл>]…`**

| key | default | meaning |
|---|---|---|
| `--trust` | `/etc/a2a/coordinator-signature.json` | stop trust file |
| `--stop-config` | — | agent stop settings file; can be given several times; without it check 6 (status key) is not done |

## Verification

Check against production — commands from the `dsh-pochta` registry entry:
- `installed_check`: `sha256sum` of 23 production files, folded into `sha256:<16 знаков>`; the result must match the `version` field of the entry;
- `healthcheck`: `systemctl is-active a2a-owner-copy-watch.timer receipt-watch.timer zastryalo-v-shcheli.timer`;
- timers in full: `systemctl list-timers a2a-owner-copy-watch.timer receipt-watch.timer 'zastryalo-v-shcheli*'`.

Local tests are listed under B-N-2021 below. Production stands live in `/opt/iskra/workspace/dorabotki/` and are run by the walker `vse-stendy-boevye.sh` (package dsh-obhod-stendov):
- `stendy/stend-a2a-owner-copy-watch.sh` — as iskra;
- `stendy/stend-mail-stop-hold.sh` — as iskra;
- `stendy/stend-trust-sverka.sh -- /usr/local/sbin/mail-stop-trust-sverka.mjs` — as root; without the argument the stand refuses;
- `stendy/stend-imeni-v2.sh` — the v2 letter name through the production `a2a-v2.py`;
- `stend-kurera.sh` — `tell-komu`, 12 probes on a substitute slot declared as a probe (`A2A_TELL_PROBA` and `A2A_TELL_LIST`).

Manual check without writing:
- `mail-stop-hold pokazat <агент>` — read only;
- `mail-stop-hold snyat …` without `--v-boj` — dry run;
- `sudo node /usr/local/sbin/mail-stop-trust-sverka.mjs` — read only;
- `a2a-owner-copy-watch --inspect` — saves nothing.

Exit codes:

| program | codes |
|---|---|
| `tell-komu` | 0 placed, mirror saved · 3 refusal (recipient, file, slot not in the list, permissions) · help (`--help`, `-h`, empty call) — also 3, printed even without the slot list · 4 placed, no mirror · 129/130/143 — signal |
| `zabava-tell` | 0 placed (and `--help`) · 2 wrong call or empty message · 3 slot unavailable or write failed |
| `zabava-v2-pismo` | 0 sent (JSON on stdout) · 3 refusal (including a malformed receiver response) · 2 — argument parsing error (argparse) |
| `a2a-v2.py` | 0 · 3 refusal (and argument error) |
| `srochnoe-novye` | 0 no new items (or mark updated) · 1 there are unread items · 2 blindness |
| `a2a-owner-copy-watch` | 0 clean · 1 there are overdue copies (success for the unit, `SuccessExitStatus=1`) · 2 incomplete check or error |
| `receipt-watch` | 0 clean · 1 overdue · 2 blindness; 1 and 2 give failed and `receipt-watch-failed.service` |
| `zastryalo-v-shcheli` | 0 clean · 1 stuck (alert sent, or the reason why not is named) · 2 blindness: no slot, slot not readable or `find` did not respond (blindness alert sent, or the reason why not is named) |
| `zastryalo-varvara` | 0 clean · 1 stuck · 2 blindness · 3 alert not sent |
| `mail-stop-hold` | 0 shown, dry run passed or write confirmed · 1 write failed or did not match on the check after it (single transaction; database backup copy already made) · 2 refusal (nothing written) |
| `mail-stop-trust-sverka.mjs` | 0 trust matches · 1 there is a 🔴 — do not enable the stop · 2 file not readable or unknown argument |

## Limitations

- «Положено» is not «доставлено»: `tell-komu` and `zabava-tell` put the file into the slot; the collector on the other side picks it up.
- `tell-komu` checks only WHO, not WHAT. The recipient list is hard-coded in the code; a new recipient is added by hand. Letters to an agent on this machine are sent not with it but with `a2a-send`.
- `zabava-tell` does not check the slot against the list `/etc/a2a/tell-shcheli.list`: it writes to `$HOME/a2a/tell` or `ZABAVA_TELL_DIR`. A key given as the second argument, or a plain word instead of text, is sent as a letter.
- `zabava-v2-pismo` does not resend a letter after placing it. Only a pending letter can be cancelled; a taken or executed one cannot.
- `zastryalo-v-shcheli` watches exactly one slot and counts only `.txt` and `.md`. Files with other extensions lie there forever, and this is normal: they are reported as a number. The watcher does not catch:
  - delivery and reading;
  - loss after pickup;
  - "we stopped placing letters ourselves" — an empty slot is legitimate.
- The «положено за сутки» count of `zastryalo-v-shcheli` is taken from the mirror, `*.md` and `*.txt` (`tell-komu` puts a file without an extension into the mirror as `.txt`). The count line is «за сутки: положено через tell-komu N · в щели сейчас M» (per day: placed via tell-komu N · in the slot now M); the watcher does not compute a «забрано» (picked up) difference: letters also reach the slot past the mirror (`zabava-tell`), and «в щели сейчас» counts all files. No mirror is not blindness: the watcher prints «ПРОВЕРИТЬ НЕЧЕМ — зеркала нет» (NOTHING TO CHECK — no mirror) and continues checking the slot. Blindness (code 2) — no slot, slot not readable, or `find` over the slot or over an existing mirror failed; then the watcher sends an alert via `ZASTRYALO_ALERT`, and if the sender failed or is not executable, it prints «тревога слепоты НЕ ушла / НЕ отправлена» (blindness alert NOT gone / NOT sent) and still exits with code 2. This line stays only in the unit journal: the units have no `OnFailure`.
- The `zastryalo-v-shcheli@` template does not fit coders (`/opt/coders/<имя>`).
- `zastryalo-varvara` does not prove pickup, delivery or reading, and does not notice a timer that did not start. Above 10 alerts per hour the alert is suppressed; the state stays red.
- The `receipt-watch` threshold (one day) is a margin, not a measurement. The observed maximum turn length is 20 400 s. The watcher itself sends no alerts: it is heard only through `OnFailure`, and that means an alert every hour until the cause is removed.
- `a2a-owner-copy-watch` gives at most one alert per agent per 6 h. Copies that become overdue inside the window go into the next alert. It does not read letter bodies.
- `mail-stop-hold snyat` does not release the conversation pause (there is `snyat-pauzu` for it) and does not wake the turn: the turn starts with the next letter. It does not report the status to the sender. A turn started between the `hod-sluzhby` check and the transaction is not caught — after release, run `pokazat` again. A stop thrown at `beginDispatch` in telegram 2.5.72–2.5.76 stays in `admitted`, and `snyat` does not take it until the agent process changes.
- `mail-stop-trust-sverka.mjs` does not check that the private keys are in the right hands or that the `returnRoutes` boxes are alive. The list of `new` recipients for Iskra duplicates the channel code: changing one without the other gives a mismatch.
- `srochnoe-novye` does not run by itself: someone has to call it.

## B-N-2021 — hyphenated v2 accounts

The publisher accepts complete account names under `[a-z_][a-z0-9_-]*`, matching the postman; invalid characters fail before temporary writes. Recipient/ledger and envelope checks stay strict. Deploy with dsh-telegram-multiagent >=3.1.7 and the updated S6/S7 courier-name stand: old S6 expected legitimate hyphens to fail.

This release adds local tests: `python3 -B test/stend-v2-agent-name.py`. The private transfer chain is `sudo python3 -B test/stend-chain-agent-name.py --telegram <candidate package> --postman <a2a-bus candidate>/sbin/a2a-pochtalon.py --receiver-user coders`. Root only changes temporary fixture ownership; the receiver runs unprivileged. Account lookup and notification are substituted, while file transfer and receipt storage are real. No model, Telegram or live mailbox is called. `test/` is source-only; add it to the registry entry's `derevo.not_installed` when deploying.
