Russian version: [README.md](README.md) · English below

# dsh-gosti — guest circuit of Varvara and "Ostrov"

**Version:** 3.1.3

Service software of sadik: the adapter "website chat (Chatwoot) ↔ Varvara", a 30-day retention period for visitor conversations, a reader of the
"Ostrov" staff list, a guest sandbox runner without journal access, an OMEGA gateway for guest agents and its stand.

The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`).
Paths, accounts and addresses of the sadik machine are hardcoded as defaults; keys and tokens are not part of the package — the code and units hold only
paths to them (section "External files").

**Temporary rule (Veniamin, 07.10.2026):** while new packages have no "production ↔ tag" reader, any package file
changes only together with a new package number in the same window.

The package is source without `package.json`: the directories `bin/`, `sbin/`, `lib/` mirror the paths under `/usr/local/`, units and drop-ins are
in `systemd/` (under `/etc/systemd/system/`). The number is the CHANGELOG heading and the tag `dsh-gosti-v<номер>`.
At the transfer from production (07.10.2026) the checksum of each file in the tree was equal to the production checksum. After that the tree may run ahead of production:
a change enters the tree by a commit and production by deployment in a window; which files changed and in which number is in `CHANGELOG.md`.
So production is compared with the tag of the deployed number, not with the head of the tree.

**Beyond Zarya's plan (b9822ac4 §2.8), the denominator was taken from disk on 07.10.2026:** two live drop-ins —
`omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` (the OMEGA key is supplied ONLY to the gateway; the file holds a path, not the value)
and `spisok-sotrudnikov.service.d/50-adresaty-trevog.conf`. There are no units outside the package that execute its files.

## Files

git stores only the "executable" flag, so the mode and owner on disk are in the table (taken by `stat` of production on 07.10.2026).

| file in package | path on disk | called by | mode | owner:group |
|---|---|---|---|---|
| `sbin/sajt-chat` | `/usr/local/sbin/sajt-chat` | sajt-chat.service (User=sajtchat, persistent) | 755 | root:root |
| `sbin/site-sroki.py` | `/usr/local/sbin/site-sroki.py` | site-sroki-varvara.service ← .timer 02:20 UTC | 755 | root:root |
| `sbin/spisok-sotrudnikov` | `/usr/local/sbin/spisok-sotrudnikov` | spisok-sotrudnikov.service ← .timer every 10 min | 755 | root:root |
| `bin/bwrap-bez-zhurnala` | `/usr/local/bin/bwrap-bez-zhurnala` | Varvara's guest sandbox: runnerCommand dsh-sandbox-local in /opt/varvara/.dsh/profiles/web/cordis.patch.yml; checked by sadik-watch | 755 | root:root |
| `lib/omega-shlyuz/omega-shlyuz-gostej.py` | `/usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py` | omega-shlyuz-gostej.service (User=omega-shlyuz, persistent) | 755 | root:root |
| `lib/omega-shlyuz/stend-shlyuza-omega.py` | `/usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py` | nightly stand sweep vse-stendy-boevye.sh (Iskra's improvements tree) | 755 | root:root |
| `systemd/omega-shlyuz-gostej.service` | `/etc/systemd/system/omega-shlyuz-gostej.service` | systemd: persistent service, `WantedBy=multi-user.target`, `Restart=on-failure`; no timer | 644 | root:root |
| `systemd/sajt-chat.service` | `/etc/systemd/system/sajt-chat.service` | systemd: persistent service, `WantedBy=multi-user.target`, `Restart=on-failure`; no timer | 644 | root:root |
| `systemd/site-sroki-varvara.service` | `/etc/systemd/system/site-sroki-varvara.service` | its own .timer (oneshot, `User=varvara`) | 644 | root:root |
| `systemd/site-sroki-varvara.timer` | `/etc/systemd/system/site-sroki-varvara.timer` | systemd (enabled) | 644 | root:root |
| `systemd/spisok-sotrudnikov.service` | `/etc/systemd/system/spisok-sotrudnikov.service` | its own .timer (oneshot) | 644 | root:root |
| `systemd/spisok-sotrudnikov.timer` | `/etc/systemd/system/spisok-sotrudnikov.timer` | systemd (enabled) | 644 | root:root |
| `systemd/omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` | `/etc/systemd/system/omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` | systemd: drop-in — EnvironmentFile with the OMEGA key for the gateway only (B-N-1476; beyond the plan) | 644 | root:root |
| `systemd/spisok-sotrudnikov.service.d/50-adresaty-trevog.conf` | `/etc/systemd/system/spisok-sotrudnikov.service.d/50-adresaty-trevog.conf` | systemd: drop-in — ReadWritePaths for alert recipients (B-N-1640; beyond the plan) | 644 | root:root |

`README.md`, `README.en.md`, `CHANGELOG.md` and `LICENSE` are not installed on the machine.

File purposes:
- `sajt-chat` — a narrow adapter "website chat (Chatwoot on vps-ru) ↔ Varvara" (B-N-1499). The envelope number from Varvara's reply
  (field `na`) goes into the alert or refusal text only if it has the adapter's envelope form `cw-<разговор>-<сообщение>`;
  otherwise the text says «na неверной формы (длина N)» (na of invalid form (length N)) without the value itself (1.0.7, B-N-1913). The form does not
  decide whether the reply is sent: as before, only the presence of such an envelope in the adapter's database decides.
- `site-sroki.py` — a 30-day retention period for website visitor conversations at Varvara.
- `spisok-sotrudnikov` — a reader of the "Ostrov" website staff list (B-N-1640).
- `bwrap-bez-zhurnala` — the guest sandbox runner: a read-only mask over the journald sockets and others (B-N-1679). Call:
  `bwrap-bez-zhurnala <аргументы bwrap> -- <команда>`; before the first `--` the wrapper adds `--tmpfs P --remount-ro P` for
  each existing directory from the hardcoded list: `/run/systemd/journal`, `/opt/varvara/workspace/.message-receipts`,
  `/run/ostrov-most`, `/var/lib/ostrov-most`, `/run/credentials/ostrov-most.service`,
  `/run/credentials/claude-oauth-gateway@varvara.service` and `/run/claude-oauth-gost-varvara` (subscription tokens of the guest gateway,
  B-N-1621; the gateway itself runs outside the sandbox), `/run/ostrov-most-health`, `/var/lib/varvara-guest-data`,
  `/var/lib/gost-reestr-varvara`, `/etc/ostrov-most`, `/run/varvara-handoff`, `/etc/dsh-telegram`; then `exec /usr/bin/bwrap`.
  If a directory does not exist on the machine, there is no mask for it. No `--` — code 1 and a line with the prefix `bwrap: `.
- `omega-shlyuz/omega-shlyuz-gostej.py` — the OMEGA gateway for guest agents (B-N-1476); `stend-shlyuza-omega.py` is its stand.

## Links to other packages and configuration

- `bwrap-bez-zhurnala` is called by the DSH platform (dsh-sandbox-local, `runnerCommand`) through Varvara's profile; the wrapper's muteness is checked by `sadik-watch` (**dsh-storozha-sadik**).
- `stend-shlyuza-omega.py` is run by the nightly stand sweep (`vse-stendy-boevye.sh`, Iskra's improvements tree).
- The directories from `/etc/tmpfiles.d/sajt-chat.conf`, `/etc/tmpfiles.d/adresaty-trevog.conf`, the allowlist `/etc/varvara/belyj-spisok.txt`, the key `/etc/omega/mcp-klyuch.env` are not part of the package.

## Configuration

Everything below is taken from the code and units. "Stand only" means overrides that are not set on production units. In the "default" column, "—" means the variable is not set;
words describe defaults that the code computes.

**`sajt-chat`** — no arguments; it is started by the unit `sajt-chat.service`, which has no `Environment=`.

The `SAJT_*` keys take effect only with `SAJT_STEND=1`: then the adapter prints «ПОДМЕНЕНО: …» (SUBSTITUTED: …) with the list of overridden keys. Without
`SAJT_STEND` the set keys are ignored with the line «ИГНОРИРУЮ (нет SAJT_STEND=1): …» (IGNORING (no SAJT_STEND=1): …) on stderr; any other value of
`SAJT_STEND` is a refusal, code 2. So the default in the table is the production value.

| variable / key | default | meaning |
|---|---|---|
| `SAJT_STEND` | — | `1` — stand mode; any other value — refusal, code 2 |
| `SAJT_ACCOUNT` | `1` | account number in the API path `/api/v1/accounts/<N>` |
| `SAJT_INBOX` | `1` | inbox: the `inbox_id` filter in the conversation list |
| `SAJT_SPOOL` | `/var/spool/sajt-chat` | exchange directories `vhod/`, `kopii/`, `vyhod/`, `vyhod/otkaz/` |
| `SAJT_STATE` | `/var/lib/sajt-chat/zakryto` | if the file exists, the site is closed (`/sss`); its modification time is part of the auto-reply key |
| `SAJT_DB` | `/var/lib/sajt-chat-adapter/adapter.db` | own SQLite database (WAL); the adapter creates the directory itself |
| `SAJT_ETC` | `/etc/sajt-chat` | directory of configuration files (see "External files") |
| `SAJT_ALERT` | `/usr/local/bin/agent-alert` | sender of alerts and all-clears |
| `SAJT_MAX_TEXT` | `2000` | maximum length of a visitor message, characters; longer — a copy and an auto-reply |
| `SAJT_PER_CONV_MIN` | `6` | envelopes per conversation per 60 s; more — cut off |
| `SAJT_MAX_LIVE` | `20` | limit of live conversations; a new one above it — cut off and an alert |
| `SAJT_LIVE_SEC` | `86400` | window of a "live" conversation, s |
| `SAJT_CAP_HOUR` | `60` | overall cap of envelopes to the model per hour |
| `SAJT_CAP_DAY` | `300` | the same per day |
| `SAJT_NE_ZABRANO` | `120` | an envelope in `vhod/` older than this, s, is taken back: a copy, an auto-reply, an alert |
| `SAJT_REPLY_AGE` | `3600` | a reply to an envelope older than this, s, is rejected |
| `SAJT_POLL` | `2` | pause of the polling loop, s |
| `SAJT_ALERT_PAUSE` | `3600` | pause before repeating an alert of the same kind, s |
| `SAJT_KOPII_K` | `5` | copies of cut-off messages per conversation per window |
| `SAJT_KOPII_VSEGO` | `30` | copies of cut-off messages for all conversations per window |
| `SAJT_KOPII_OKNO` | `600` | copy counting window, s; at its end — a summary «ещё N…» (N more…) |
| `SAJT_SHLYUZ_SERDCE` | `2` | heartbeat period to the widget gateway, s |
| `SAJT_STRANIC` | `10` | pages of conversation messages per pass |
| `SAJT_SVERKA_SEK` | `3600` | re-check of the last 20 messages younger than this, s (catches a late commit) |
| `SAJT_STRANIC_RAZG` | `10` | pages of the conversation list per pass |
| `SAJT_AKT_ZAPAS` | `5` | margin for `last_activity_at` and for clock skew, s |
| `SAJT_HRANIT_SEK` | `2592000` | retention period for exchange files and database rows, s (30 days) |
| `SAJT_CHISTKA_PERIOD` | `3600` | period of retention cleanup, s |

Hardcoded: a redirect (3xx) from the Chatwoot API or the widget gateway is a refusal (the token and the signature do not go to another host); API request timeout 10 s; `agent-alert` timeout 20 s; POST to the widget gateway 5 s (2 s on stop);
the «опрос» (poll) alert after 5 failures in a row; exchange file name — up to 80 characters `[A-Za-z0-9_-]`, mode 0640; a copy describes
the first 5 attachments; the envelope number `na` goes into the alert text only in the form `cw-<разговор>-<сообщение>`, otherwise —
«na неверной формы (длина N)»; the texts of auto-replies to the visitor.

**`site-sroki.py`** — no arguments. In production: `/usr/bin/python3 -B /usr/local/sbin/site-sroki.py` from `site-sroki-varvara.service`.

| variable | default | meaning |
|---|---|---|
| `SITE_DOM` | `/opt/varvara` | agent home; sessions are in `<дом>/.dsh/sessions`. The unit sets the same |
| `SITE_SROK_SUT` | `30` | period, days (fractions allowed). The unit sets the same |
| `SITE_KARTA_SHLYUZA` | `/var/lib/claude-oauth-gateway-varvara/sessii.db` | gateway map `dshId → sessionId`, opened read-only |
| `SITE_SEJCHAS` | current time | override of "now", unix seconds; not gated by the stand flag — do not set it on the production unit |

Hardcoded: only sessions with the prefixes `telegram-site-` and `telegram-gost-` are deleted; a session with a held `session.lock`
is skipped; a target outside the home is not deleted.

**`spisok-sotrudnikov`** — takes no arguments: `--help` or `-h` — help, code 0, no alert; any other argument — code 2 (as root —
with an alert, not as root — without). Shebang `/usr/bin/python3 -I`. The key is supplied by the unit through
`LoadCredential=ostrov-staff:/etc/spisok-sotrudnikov/directory-readonly.key`.

| variable | default | meaning |
|---|---|---|
| `SPISOK_URL` | `http://192.168.99.3:4214/internal/v1/staff` | the website staff list endpoint |
| `SPISOK_KLYUCH` | `$CREDENTIALS_DIRECTORY/ostrov-staff` | Bearer key file; a valid key is printable ASCII of 16 characters or more, otherwise refusal 2 |
| `SPISOK_VYHOD` | `/etc/varvara/belyj-spisok.txt` | allowlist of Varvara's PII mask; written atomically, root:`SPISOK_GRUPPA`, 0640 |
| `SPISOK_RUCHNOJ` | `/etc/varvara/belyj-spisok.ruchnoj.txt` | the owner's permanent lines; no file — an empty list |
| `SPISOK_ZAPRET` | `/etc/varvara/zapret-spisok.txt` | the owner's bans; **required** (see "External files") |
| `SPISOK_SOST` | `/var/lib/spisok-sotrudnikov` | own state: `sost.json` 0600, `adresaty-trevog.json` 0640; directory 0700 |
| `SPISOK_ALERT` | `/usr/local/bin/agent-alert` | alert sender |
| `SPISOK_GRUPPA` | `varvara` | group of the allowlist file |
| `SPISOK_TREVOGI` | `/var/lib/adresaty-trevog` | directory of the alert recipients copy (`adresaty-trevog.json`); the drop-in `50-adresaty-trevog.conf` opens it for writing |
| `SPISOK_GRUPPA_TREVOG` | `marc` | group of this copy, 0640 |

`SPISOK_*` overrides, including `SPISOK_KLYUCH`, are not gated by the stand flag: they are not set on the production unit.
Hardcoded: request timeout 5 s; response no larger than 1 MiB; redirect (3xx) — refusal; cooldown of an alert of the same kind is
one day; `agent-alert` timeout 60 s; a name is added only if it has 2 words or more; a phone number has 10 to 15 digits.

**`bwrap-bez-zhurnala <доводы bwrap> -- <команда>`** — at least one `--` is required. Reads no environment variables. The list of
13 masked directories is hardcoded (see "File purposes"); the executor is `exec /usr/bin/bwrap`; the shell is `/bin/sh` (dash),
not bash: bash would execute `$BASH_ENV` before the sandbox.

**`omega-shlyuz-gostej.py`** — no arguments. In production: `/opt/omega/venv/bin/python3 -B /usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py`.

| variable | default | meaning |
|---|---|---|
| `SHLYUZ_UPSTREAM` | `http://127.0.0.1:8377/mcp` | the OMEGA service. The unit sets the same |
| `OMEGA_MCP_API_KEY` | — | OMEGA service key; in production — from `EnvironmentFile=/etc/omega/mcp-klyuch.env` (drop-in `15-omega-mcp-klyuch.conf`). Empty — the gateway does not start, code 2 |
| `SHLYUZ_KLYUCHI` | `/etc/omega/gost-klyuchi.txt` | lines «`<sha256 ключа гостя> <корень>`» (guest key sha256, root), read on every request. The unit sets the same |
| `SHLYUZ_STATE` | `/var/lib/omega-shlyuz` | lists of own records `<корень>.ids`, appended under `flock`. The unit sets the same and `StateDirectory=omega-shlyuz` 0700 |
| `SHLYUZ_PORT` | `8379` | listening port. The unit sets the same |

Hardcoded: listen address `127.0.0.1`; allowed Host headers are `127.0.0.1:<порт>` and `localhost:<порт>` (protection against
DNS-rebinding); no sessions (`stateless`); a tool allowlist; search modes `semantic`, `phrase`, `unified`;
`filter_tags` — up to 10 strings of 64 characters; `reason` is cut to 500 characters; guest root — `^[a-z][a-z0-9_-]{0,63}$`;
the default type for non-permanent records is `fakt`.

**`stend-shlyuza-omega.py [путь шлюза]`** — by default checks `/usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py`;
reads no environment variables. How to run it and its conditions are in the "Verification" section.

## Exit codes

| program | codes |
|---|---|
| `sajt-chat` | a service, does not exit · 0 — stopped by SIGTERM (before exit it sends «закрыто» (closed) to the widget gateway) · 2 — `SAJT_STEND` is not `1`, no exchange directory («🔴 СЛЕПОТА: нет каталога …» (🔴 BLINDNESS: no directory …)), no `api.token` or `chatwoot-api` · 1 — uncaught exception (Python traceback) |
| `site-sroki.py` | 0 — done (busy sessions are skipped as normal) · 1 — at least one failure: not deleted, target outside the home, or the gateway map not read · 2 — no `<дом>/.dsh/sessions` |
| `spisok-sotrudnikov` | 0 — read and merged, or help (`--help`, `-h`) without an alert · 1 — the endpoint is unavailable or failed the checks; files untouched, alert · 2 — invalid key, no bans file, or unparsed lines in it, an argument on the command line — all with an alert (an argument not as root — no alert: that is a manual call, not the service) · 1 — uncaught exception: no group `varvara`/`marc` or no directory for the alert recipients copy |
| `bwrap-bez-zhurnala` | 1 — no `--` (a line with the prefix «bwrap: ») · otherwise — the exit code of `/usr/bin/bwrap` itself (`exec`); no `/usr/bin/bwrap` — 127 |
| `omega-shlyuz-gostej.py` | a service, does not exit · 2 — `OMEGA_MCP_API_KEY` is not set · 1 — uncaught exception (for example, no `mcp` package). A refusal to a guest is a response, not a code: 401 before MCP or the text «ОТКАЗ шлюза OMEGA для гостей: …» (REFUSAL of the OMEGA guest gateway: …) |
| `stend-shlyuza-omega.py` | 0 — everything matched · 1 — there is a FAIL · 2 — there is a BLINDNESS, not run as root, or no gateway file · 143 — SIGTERM (cleanup is done) |

## External files and dependencies

Programs and versions:
- `/usr/bin/python3` — `sajt-chat`, `spisok-sotrudnikov`, `site-sroki.py`; standard modules only. The code has no features newer than
  Python 3.8 (production runs 3.12);
- `/opt/omega/venv/bin/python3` — the gateway and its stand. The gateway needs the packages `mcp`, `starlette`, `uvicorn` and the module
  `omega.types` of the OMEGA package: without `omega.types` the gateway does not know the permanent types and refuses every `omega_store`. The stand needs
  `mcp`, `omega.server.*` and `omega_platform.*`. Current `mcp`, `starlette` and `uvicorn` require Python ≥ 3.10
  (`Requires-Python` in their METADATA; measured on 10.10.2026 in `/opt/omega/venv`: Python 3.12.3);
- `/usr/bin/bwrap` (bubblewrap) and `/bin/sh` — `bwrap-bez-zhurnala`;
- `/usr/local/bin/agent-alert` (package dsh-trevogi) — alerts of `sajt-chat` and `spisok-sotrudnikov`. In `sajt-chat` a send failure
  is only written to the journal; in `spisok-sotrudnikov` an unsent alert is retried on the next tick;
- the gateway stand calls `systemctl`, `systemd-run`, `sudo`, `journalctl`, `ps` and the `sqlite3` CLI.

Services and network:
- the OMEGA service (package omega-memory, `omega-memory.service`, port 8377) — for the gateway (`After=`/`Wants=`). If it does not answer,
  the guest gets «служба OMEGA не ответила (…)» (OMEGA service did not answer (…)), and `tools/list` gets an empty list;
- the Chatwoot API gateway on vps-ru — its address is in `/etc/sajt-chat/chatwoot-api`; the staff list endpoint is `SPISOK_URL`.

Accounts and groups:
- `sajtchat` — the `sajt-chat` service; the supplementary group `agent-button` is needed for `agent-alert`;
- `omega-shlyuz` — the gateway (not `omega`, with no access to `/var/lib/omega` and `/etc/omega`);
- root — `spisok-sotrudnikov.service`;
- `varvara` — `site-sroki-varvara.service`: the cleanup runs as Varvara's account, so a directory swapped for a symlink between the check and the deletion cannot reach beyond her own files;
- groups `varvara` (allowlist) and `marc` (alert recipients copy); no group — exception, code 1;
- the `omega` account — the gateway stand works through `sudo -u omega`.

External files are not part of the package; what happens without each one:

| path | read by | without it |
|---|---|---|
| `/etc/sajt-chat/api.token`, `/etc/sajt-chat/chatwoot-api` | `sajt-chat` | code 2 at start; the unit restarts every 10 s, no more than 5 times per 600 s |
| `/etc/sajt-chat/shlyuz-url`, `/etc/sajt-chat/shlyuz.secret` | `sajt-chat` | works, but the widget window gets no state (line «шлюз виджета не настроен …» (widget gateway not configured …)) |
| `/etc/sajt-chat`, `/var/lib/sajt-chat` (directories) | unit `sajt-chat`, `ReadOnlyPaths=` without "-" | the unit does not start (this is how systemd treats a required sandbox path) |
| `/var/spool/sajt-chat/{vhod,kopii,vyhod,vyhod/otkaz}` | `sajt-chat` | code 2 «СЛЕПОТА: нет каталога»; created by `/etc/tmpfiles.d/sajt-chat.conf` |
| `/opt/varvara/.dsh/sessions` | `site-sroki.py` | code 2 |
| `/var/lib/claude-oauth-gateway-varvara/sessii.db` | `site-sroki.py`, read-only | sessions and cache are deleted, the SDK transcripts of these sessions are not; a failure for each, code 1 |
| `/etc/spisok-sotrudnikov/directory-readonly.key` | unit `spisok-sotrudnikov`, `LoadCredential=` | the unit does not start; no key in the credentials — code 2 with an alert |
| `/etc/varvara/zapret-spisok.txt` | `spisok-sotrudnikov` | **required**: code 2 on every tick (every 10 min), an alert of one kind at most once a day; the allowlist is not written |
| `/etc/varvara/belyj-spisok.ruchnoj.txt` | `spisok-sotrudnikov` | optional: taken as empty |
| `/etc/varvara/belyj-spisok.txt` | written by `spisok-sotrudnikov` | created |
| `/var/lib/adresaty-trevog` | written by `spisok-sotrudnikov` | created by `/etc/tmpfiles.d/adresaty-trevog.conf`; no directory — an exception already after the allowlist is written |
| `/etc/omega/mcp-klyuch.env` | gateway unit, `EnvironmentFile=` without "-" | the unit does not start |
| `/etc/omega/gost-klyuchi.txt` | the gateway, on every request | not read or has an invalid line — lets nobody in (401). Mode per the gateway header is 640 root:omega-shlyuz; the code does not check it |
| `/var/lib/omega/.omega/{omega.db,license.json,device.json}`, `/var/lib/omega/.cache/omega/models` | the gateway stand (takes a copy) | BLINDNESS, code 2 |

## Installation and removal (by hand as root)

Installing a file: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>`; in production — through
`smontirovat-fajly` after the gate. Units and drop-ins: into `/etc/systemd/system/`, `systemctl daemon-reload`, enable
`sajt-chat`, `omega-shlyuz-gostej` and the timers `site-sroki-varvara`, `spisok-sotrudnikov`.
⚠️ The website chat is live: do not stop it or test it with the production key without the coordinator's word (rule of 03.10.2026).

Removing a unit — `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file to a backup copy (`mv`), `daemon-reload`, `mask`; to restore — `unmask` and put the file back.

## Limitations

- `sajt-chat` does not judge the meaning of Varvara's replies; does not see more than `SAJT_STRANIC_RAZG`×25 conversations that came alive between two
  polls, or clock skew between sadik and vps-ru larger than `SAJT_AKT_ZAPAS`; does not download attachments. A `kill -9` stop or
  a machine crash does not send «закрыто» to the widget gateway — the window is closed by the gateway's timeout. Only the `shlyuz` alert has an all-clear.
  Retention cleanup does not touch Varvara's sessions and memory, the service journal, copies in Telegram, or Chatwoot itself.
- `site-sroki.py` does not touch the `receipts.sqlite` rows, attachments, the site spool, the agent's memory, systemd journals, or the
  map row in `sessii.db`.
- `spisok-sotrudnikov` does not catch a list that is valid by schema but wrong in meaning; the death of its own timer; staleness
  when the site returns the same old revision. The `adresaty-trevog.json` copy in `SPISOK_SOST` has no reader yet.
- `bwrap-bez-zhurnala` does not close the platform's file tools (they go through dsh-fs-sandbox), the network, abstract
  sockets, and paths not on the list; it masks only directories — a path that has become a file or a socket silently gets no mask.
- `omega-shlyuz-gostej.py`: guest records are stored in the shared database; the correctness of the root filter inside OMEGA is checked by the stand,
  not by the gateway; `dsh-pamyat-obsluzhivanie` writes to the guest root bypassing the gateway, and `similar` will not confirm such records;
  when the service is unavailable, `tools/list` returns an empty list, not an error.

## Verification

The checksum of each package file at the tag `dsh-gosti-v<номер>` deployed to production = the production checksum (`sha256sum`), modes = the table (`stat -c '%a %U:%G'`).

Stands:
- **`stend-shlyuza-omega.py`** (in this package): `sudo /opt/omega/venv/bin/python3 -B /usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py [шлюз.py]` —
  after every OMEGA update and every gateway change; in the nightly sweep — as an `@root` line (package dsh-obhod-stendov). Requires root
  (otherwise code 2), `systemd-run`, the `omega` account, the `sqlite3` CLI and free ports 8396–8399 (the stand does not check them). The live
  OMEGA service is not needed: the stand brings up a copy of it as a temporary unit on a read-only copy of the production database, and
  the gateway under test as a second temporary unit with `DynamicUser=yes`. It does not catch key delivery to a guest, file modes on the
  production machine, or behaviour under load.
- **`stend-sajt-chat.sh`** (+ `stend-sajt-chat.py`, package dsh-obhod-stendov, `dorabotki/stendy/`): the subject is `SAJT_BIN`,
  by default `/usr/local/sbin/sajt-chat`; runs under a normal account; Chatwoot, the widget gateway and the alert are fakes on
  127.0.0.1. The adapter must print «ПОДМЕНЕНО» with `SAJT_SPOOL` and `SAJT_ETC`, otherwise code 2; exactly 50 probes, otherwise code 2.
  Codes 0 / 1 / 2.
- **`dsh-telegram-multiagent/test/stend-site-adapter.mjs`** — the channel stand, subject `SITE_ADAPTER_CANDIDATE=/usr/local/sbin/sajt-chat`;
  without the variable — BLINDNESS, code 2.
- **`dsh-storozha-sadik/test/stend-nemota-obertki.sh`** (root) — the stand of the `sadik-watch` watcher block, which on every tick
  checks `bwrap-bez-zhurnala`: checksum against the tag, mode `root:root 755`, `runnerCommand` in the profile, a probe as `varvara`.

`site-sroki.py` and `spisok-sotrudnikov` have no stands.
