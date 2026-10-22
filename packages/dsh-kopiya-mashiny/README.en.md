Russian version: [README.md](README.md) · English below

# dsh-kopiya-mashiny — backup of the sadik machine, its acceptance and watchers

**Version:** 3.1.5

Service software of sadik: the nightly machine backup (`sadik-backup.py`, narrow upload route via NL), scheduled
acceptance of the backup by action (download it back and check it), watchers for backup coverage and size, backup of the
OMEGA database, alert about a failed backup unit. Every backup unit has a failure reader `*-failed.service` → `kopiya-upala`.

The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`).
Addresses, paths and names of the sadik machine (narrow upload route via NL, backup directories) are hard-coded as
defaults; which of them can be overridden by the environment is described in the "Configuration" section.

**Temporary rule (Veniamin, 07.10.2026):** until new packages have a "production ↔ tag" reader, any package file
changes only together with a new package number in the same window.

The package is source without `package.json`: `sbin/` mirrors paths under `/usr/local/`, units and drop-ins are in `systemd/`
(paths under `/etc/systemd/system/`). The number is the CHANGELOG heading and the tag `dsh-kopiya-mashiny-v<номер>`.
At transfer from production (07.10.2026) the checksum of each file in the tree was equal to the production checksum. After
that the tree may run ahead of production: a change enters the tree by commit, and production by installation in a window;
which files changed in which number is listed in `CHANGELOG.md`.
Therefore production is checked against the tag of the installed number, not against the tree head.

**Beyond Zarya's plan (b9822ac4 §2.3):** four drop-ins `backup-verify.service.d/` (`pamyat.conf` MemoryHigh=2G,
`srok-potolok.conf` ceiling 3 h, `tolko-1.conf`, `zz-itogi-priyomki.conf` — resets SuccessExitStatus). The plan took
drop-ins by their reference to `/usr/local`; these do not reference it; without them the package does not reproduce the
behaviour of `backup-verify`.

## Files

git stores only the "executable" flag, so mode and owner on disk are given in the table (taken by `stat` of production on 07.10.2026).

| file in package | path on disk | who calls it | mode | owner:group |
|---|---|---|---|---|
| `sbin/sadik-backup.py` | `/usr/local/sbin/sadik-backup.py` | sadik-backup.service ← .timer 03:00 UTC; read by proverka-svezhesti-kopii.sh, razmer-kopii-watch | 755 | root:root |
| `sbin/kopiya-put-nl` | `/usr/local/sbin/kopiya-put-nl` | drop-in sadik-backup.service.d/30-put-nl.conf (ExecStartPre … up) | 755 | root:root |
| `sbin/kopiya-upala` | `/usr/local/sbin/kopiya-upala` | *-failed.service via OnFailure= (sadik-backup, backup-verify, omega-db-backup, receipt-watch) | 755 | root:root |
| `sbin/proverka-kopii.sh` | `/usr/local/sbin/proverka-kopii.sh` | proverka-svezhesti-kopii.sh (PRIYOMKA_BIN), razmer-kopii-watch; by hand | 755 | root:root |
| `sbin/proverka-otmetki-priyomki.sh` | `/usr/local/sbin/proverka-otmetki-priyomki.sh` | healthcheck of the `proverka-otmetki-priyomki` entry in `/etc/agent-registry/plugins.yaml`; no own unit or timer | 755 | root:root |
| `sbin/proverka-svezhesti-kopii.sh` | `/usr/local/sbin/proverka-svezhesti-kopii.sh` | backup-verify.service ← .timer 06:15 UTC | 755 | root:root |
| `sbin/razmer-kopii-watch` | `/usr/local/sbin/razmer-kopii-watch` | razmer-kopii-watch.service ← .timer 06:45 UTC | 755 | root:root |
| `sbin/backup-coverage-watch` | `/usr/local/sbin/backup-coverage-watch` | backup-coverage-watch.service (User=iskra) ← .timer *:35 UTC | 755 | root:root |
| `sbin/omega-db-backup.sh` | `/usr/local/sbin/omega-db-backup.sh` | omega-db-backup.service ← .timer 00,06,12,18:20 | 755 | root:root |
| `systemd/backup-coverage-watch.service` | `/etc/systemd/system/backup-coverage-watch.service` | own .timer | 644 | root:root |
| `systemd/backup-coverage-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/backup-coverage-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/backup-coverage-watch.timer` | `/etc/systemd/system/backup-coverage-watch.timer` | systemd (enabled) | 644 | root:root |
| `systemd/backup-verify-failed.service` | `/etc/systemd/system/backup-verify-failed.service` | OnFailure= of its unit | 644 | root:root |
| `systemd/backup-verify.service` | `/etc/systemd/system/backup-verify.service` | own .timer | 644 | root:root |
| `systemd/backup-verify.timer` | `/etc/systemd/system/backup-verify.timer` | systemd (enabled) | 644 | root:root |
| `systemd/omega-db-backup-failed.service` | `/etc/systemd/system/omega-db-backup-failed.service` | OnFailure= of its unit | 644 | root:root |
| `systemd/omega-db-backup.service` | `/etc/systemd/system/omega-db-backup.service` | own .timer | 644 | root:root |
| `systemd/omega-db-backup.timer` | `/etc/systemd/system/omega-db-backup.timer` | systemd (enabled) | 644 | root:root |
| `systemd/razmer-kopii-watch.service` | `/etc/systemd/system/razmer-kopii-watch.service` | own .timer | 644 | root:root |
| `systemd/razmer-kopii-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/razmer-kopii-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/razmer-kopii-watch.timer` | `/etc/systemd/system/razmer-kopii-watch.timer` | systemd (enabled) | 644 | root:root |
| `systemd/receipt-watch-failed.service` | `/etc/systemd/system/receipt-watch-failed.service` | OnFailure= of its unit | 644 | root:root |
| `systemd/sadik-backup-failed.service` | `/etc/systemd/system/sadik-backup-failed.service` | OnFailure= of its unit | 644 | root:root |
| `systemd/sadik-backup.service` | `/etc/systemd/system/sadik-backup.service` | own .timer | 644 | root:root |
| `systemd/sadik-backup.service.d/20-hranenie-2.conf` | `/etc/systemd/system/sadik-backup.service.d/20-hranenie-2.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/sadik-backup.service.d/30-put-nl.conf` | `/etc/systemd/system/sadik-backup.service.d/30-put-nl.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/sadik-backup.timer` | `/etc/systemd/system/sadik-backup.timer` | systemd (enabled) | 644 | root:root |
| `systemd/backup-verify.service.d/pamyat.conf` | `/etc/systemd/system/backup-verify.service.d/pamyat.conf` | drop-in to backup-verify.service (outside Zarya's plan — see below) | 644 | root:root |
| `systemd/backup-verify.service.d/srok-potolok.conf` | `/etc/systemd/system/backup-verify.service.d/srok-potolok.conf` | drop-in to backup-verify.service (outside Zarya's plan — see below) | 644 | root:root |
| `systemd/backup-verify.service.d/tolko-1.conf` | `/etc/systemd/system/backup-verify.service.d/tolko-1.conf` | drop-in to backup-verify.service (outside Zarya's plan — see below) | 644 | root:root |
| `systemd/backup-verify.service.d/zz-itogi-priyomki.conf` | `/etc/systemd/system/backup-verify.service.d/zz-itogi-priyomki.conf` | drop-in to backup-verify.service (outside Zarya's plan — see below) | 644 | root:root |

`README.md`, `README.en.md`, `CHANGELOG.md` and `LICENSE` are not installed on the machine.

Purpose of the files:
- `sadik-backup.py` — builder of the machine backup; retention — drop-in `20-hranenie-2.conf` (`BACKUP_RETAIN_LOCAL=1` since 3.1.7; the name «-2» is kept — rename to `-1` is a ticket for the next obhod release, where the ledger holds the path).
- `kopiya-put-nl` — narrow route for uploading the backup via awg0 (NL), B-N-762.
- `proverka-svezhesti-kopii.sh` — scheduled acceptance: download what was uploaded and check it; calls `proverka-kopii.sh`.
- `proverka-kopii.sh` — acceptance of the backup by action, not by comparing lists.
- `proverka-otmetki-priyomki.sh` — watcher of the acceptance stamp ("was the backup checked at all"): the age of the stamp
  and the firing of `backup-verify.timer`; it does not judge whether the backup is valid. It has no own timer — it is called
  by the healthcheck of the `proverka-otmetki-priyomki` entry in the registry `/etc/agent-registry/plugins.yaml`.
- `razmer-kopii-watch` — watcher of the backup size and of free space for it.
- `backup-coverage-watch` — watcher of backup coverage: homes and rooms on the machine against `agent-registry pokrytie --json`.
  It suppresses repeats of the same alert by fingerprint for 24 h. It checks the backup markup with a meter
  (`IZMERITEL_BIN`; default — the path hard-coded in `sbin/backup-coverage-watch`). Since 1.0.6 (B-N-1940) a markup problem
  is named in the alert by its cause: «измеритель разметки ослеп» (markup meter is blind) (the meter output contains
  «СЛЕПОТА» (BLINDNESS)) or «разметка копии противоречива» (backup markup is inconsistent); if the meter is missing or did
  not complete, the alert says so («не найден» (not found), «не отработал» (did not complete)). Meter lines go into the
  alert body in the order «СЛЕПОТА» → other «⚠️» → the rest, no more than four.
  The problem heading (up to the first colon) is part of the suppression fingerprint, so meter blindness with the same set
  of findings is no longer suppressed as a repeat. A change of the tail under the same heading (another blindness path) is
  still treated by the watcher as a repeat.
- `omega-db-backup.sh` — backup of the OMEGA long-term memory database.
- `kopiya-upala` — alert about a failed backup unit; systemd calls it via `OnFailure=`.

## Links to other packages

- `receipt-watch-failed.service` (here) — failure reader of the `receipt-watch` watcher from the **dsh-pochta** package
  (its drop-in `onfailure.conf`).
- `python-padenie-70` from **dsh-storozha-mashiny** — called by the drop-in `60-python-padenie-70.conf` of two watchers.
- `kopiya-upala` alerts go out via `/usr/local/bin/agent-alert` (`AGENT_ALERT_BIN`) — package **dsh-trevogi**.

## Configuration

Everything below is taken from the code. "Test only" marks overrides that are not set on production units. In the "default" column, "—" means the variable is not set;
words describe defaults that the code computes.

**`sadik-backup.py`** — build and upload · **`sadik-backup.py --sostav`** — show the backup frame (source roots) without
building · **`sadik-backup.py --skachat <drive_id> <куда>`** — download an archive from Drive · **`DRY=1 sadik-backup.py`** —
build and do not upload. Any other first argument is refused, code 2.

| variable / key | default | meaning |
|---|---|---|
| `AGENT_REGISTRY_BIN` | `/usr/local/bin/agent-registry` | registry reader: backup contents, homes of uncovered agents, folder on Drive |
| `PASSWORD_STORE_DIR` | `/etc/agent-secrets` | `pass` store with the Drive keys |
| `DRIVE_CLIENT_KEY` | `ferma/google/oauth-client-secret-json` | name of the `pass` entry with the application credentials |
| `DRIVE_REFRESH_KEY` | `ferma/google/refresh-token-iia` | name of the `pass` entry with the refresh token |
| `SECRET_KEY_OWNER` | `iskra` | from root the entry is read via `sudo -n -u <владелец>` |
| `BACKUP_LOCAL_DIR` | `/backups` | local shelf; directory 0700, archive 0600 |
| `BACKUP_STATE` | `/var/lib/sadik-backup/last.json` | stamp of the last successful backup (0644); if the directory is missing, it is created 0755 |
| `BACKUP_RETAIN` | `30` | how many own archives to keep on Drive |
| `BACKUP_RETAIN_LOCAL` | `15` | in production the drop-in `20-hranenie-2.conf` gives `1` (since 3.1.7); how many own archives to keep on the shelf; below 1 — shelf rotation does not run |
| `BACKUP_PRISTAVKA` | `own-chain-` | archive name prefix and selection of own archives during rotation |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | alert sender |
| `DRY` | — | `1` — do not upload, keep the archive, send no alerts |
| `BACKUP_SO_MARK` | — | not set — sockets are not marked; in production the drop-in `30-put-nl.conf` gives `0x740`; socket mark for the narrow upload route (`0x…` is accepted) |
| `BACKUP_ACL_SROK_SEK` | `1800` | `getfacl` timeout for the ACL snapshot, s |
| `BACKUP_PYC_SROK_SEK` | `60` | timeout of the `__pycache__` parsing subprocess, s |
| `BACKUP_SROK_SEK` | `TimeoutStartSec` of the unit − 600 s (not read — 3 h − 10 min) | total upload timeout from process start |
| `BACKUP_KUSOK_SEK` | `600` | limit of one upload network request, s |
| `MONITOR_UNIT` | — | set by systemd; length budget and link to the run in the alert |

The builder takes the Drive folder only from the registry (`agent-registry mashina --json` → `kopiya.drive_folder_id`): there
is intentionally no variable for it. Hard-coded: upload chunk 64 MiB, 5 attempts per chunk, pause `min(60, 2^n)` s; HTTP
timeouts — session 60 s, chunk 600 s, download 1800 s, rotation listing 120 s; registry, `pass` and alert — 60 s each.

**`kopiya-put-nl up | down`** — anything else is refused, code 2. Called by the drop-in `30-put-nl.conf`: `ExecStartPre=-… up`, `ExecStopPost=… down`.
`up` puts the route `default dev awg0` into table 740 and the rule `fwmark 0x740 lookup 740` at priority 39; a foreign rule
at 39 means refusal. `down` removes only its own rule and flushes table 740. Mark, table, priority and device are hard-coded.

**`kopiya-upala <юнит> <заголовок>`** — exactly two non-empty arguments. Called by four `*-failed.service` units
(`sadik-backup`, `backup-verify`, `omega-db-backup`, `receipt-watch`). Sender — `AGENT_ALERT_BIN`
(`/usr/local/bin/agent-alert`). It stays silent if the journal of the unit's last run (by `InvocationID`) contains the line
`BACKUP_RESULT … notification=sent`; otherwise it sends an alert with 6 lines of the journal tail.

**`proverka-kopii.sh [--tolko-sekrety] [--kopiya-snyata <ISO 8601 с поясом>] <архив.tar.gz>`** — keys may be anywhere,
exactly one path; any other key starting with `-` — code 2; a date without a time zone — code 2.

| variable / key | default | meaning |
|---|---|---|
| `CHITATEL` | `/usr/local/bin/agent-registry` | registry reader: key and store paths (`mashina --json`) and contents markup (`pokrytie`) |
| `AGENTS_REGISTRY` | `/etc/agent-registry/agents.yaml` | registry whose age is compared with the backup; passed to the reader |
| `TMPDIR` | `/tmp` | where the working directory of the check is created |
| `--tolko-sekrety` | — | only the decryption part: contents and connections are skipped; success is code 8, not 0 |
| `--kopiya-snyata` | — | moment the backup was taken: if the registry is newer, the markup is taken from the registry git at that moment |

**`proverka-otmetki-priyomki.sh`** — no arguments; it has no own unit, it is called by the healthcheck of the `proverka-otmetki-priyomki` entry
in `/etc/agent-registry/plugins.yaml`.

| variable | default | meaning |
|---|---|---|
| `BACKUP_VERIFY_STATE` | `/var/lib/sadik-backup/proverena.json` | acceptance stamp |
| `BACKUP_VERIFY_TIMER` | `backup-verify.timer` | acceptance timer (`LastTriggerUSec` is read) |
| `PREDEL_OTMETKI_CHASOV` | `72` | age limit for the stamp and for the last timer firing, h |

**`proverka-svezhesti-kopii.sh`** — no arguments; called by `backup-verify.service`.

| variable | default | meaning |
|---|---|---|
| `BACKUP_STATE` | `/var/lib/sadik-backup/last.json` | build stamp |
| `BACKUP_TIMER` | `sadik-backup.timer` | build timer |
| `BACKUP_SERVICE` | `sadik-backup.service` | build service |
| `BACKUP_BIN` | `/usr/local/sbin/sadik-backup.py` | what to download with (`--skachat`) |
| `PRIYOMKA_BIN` | `/usr/local/sbin/proverka-kopii.sh` | what to run acceptance with; the free-space formula is chosen by the streaming acceptance marker in it |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | alert sender |
| `PREDEL_CHASOV` | `30` | age limit of the build stamp, h; set empty or not an integer 1..999999 — «СЛЕПОТА», code 2 |
| `PREDEL_ZAPUSKA_MINUT` | `1500` | age limit of the last build run, min; same rule |
| `BACKUP_VERIFY_SERVICE` | `backup-verify.service` | whose `TimeoutStartSec` is the ceiling for timeouts |
| `BACKUP_VERIFY_STATE` | `/var/lib/sadik-backup/proverena.json` | where to write the acceptance stamp (temporary file and `mv`, 0644) |
| `TMPDIR` | `/tmp` | FS for unpacking when checking free space; passed on to `proverka-kopii.sh` |

Hard-coded: download directory `mktemp -d /tmp/priyomka-kopii.XXXXXX` (ignores `TMPDIR`); space reserve — for streaming
acceptance `S/20`, at least 1 GB, otherwise `1,5·S`, plus 5 % of the FS size; timeouts — download `120 + S/12 МБ/с`,
acceptance `120 + S/60 МБ/с`, no longer than the unit ceiling − 120 s, via `timeout --kill-after=30`. In production the
ceiling is 3 h (`TimeoutStartSec=10800`, drop-in `srok-potolok.conf`).

**`razmer-kopii-watch`** — no arguments. Any variable from the table that is set prints «⚠️ ПОДМЕНА …» (⚠️ OVERRIDE …) to stderr.

| variable | default | meaning |
|---|---|---|
| `RKW_STATE` | `/var/lib/sadik-backup/last.json` | stamp of the last backup |
| `RKW_POLKA` | `/backups` | shelf |
| `RKW_SKRIPT_KOPII` | `/usr/local/sbin/sadik-backup.py` | where to take the retention default from if `BACKUP_RETAIN_LOCAL` is not in the environment of the build unit |
| `RKW_PRIYOMKA` | `/usr/local/sbin/proverka-kopii.sh` | the reserve formula is chosen by the streaming acceptance marker in it |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | alert sender |
| `RKW_KESH` | `/var/lib/razmer-kopii-watch` | cache of the archive listing |
| `RKW_DF_AVAIL` | free space on the shelf | test only |

The watcher takes shelf retention from `systemctl show sadik-backup.service -p Environment`, otherwise from the builder's text.
Hard-coded: step threshold ±5 %; forecast no further than 60 nights; work zones (`var/backups/montazh*/`, `opt/*/workspace/`,
`opt/coders/*/workspace/`) and session journals (`opt/[coders/]*/.claude/projects/`) are counted as a separate line; alert
call timeout 150 s.

**`backup-coverage-watch`** — no arguments. In production it runs as `iskra` via `python-padenie-70`.

| variable | default | meaning |
|---|---|---|
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | alert sender |
| `COVERAGE_SOSTOYANIE` | `/var/lib/backup-coverage-watch/otpechatok` | repeat-suppression state; the directory is provided by the unit's `StateDirectory=` |
| `COVERAGE_DPKG_INFO` | `/var/lib/dpkg/info` | package lists for the `!paket` mask |
| `IZMERITEL_BIN` | `/opt/iskra/workspace/dorabotki/ozhidaemyj-razmer.py` | backup markup meter; run by the same Python |

Hard-coded: registry reader `/usr/local/bin/agent-registry`; repeat suppression 24 h; timeouts for `find`, the meter and
the alert — 120, 120 and 60 s.

**`omega-db-backup.sh`** — no arguments; the unit sets `LC_ALL=C.UTF-8`.

| variable | default | meaning |
|---|---|---|
| `OMEGA_DB` | `/var/lib/omega/.omega/omega.db` | database; must be readable and have the `memories` table |
| `OMEGA_BACKUP_DIR` | `/var/backups/omega` | where to put backups: directory 0700, backup `omega-<UTC>.db.gz` 0600 |
| `OMEGA_BACKUP_KEEP` | `28` | how many backups to keep; below 1 — rotation does not run |
| `OMEGA_BACKUP_MIN_FREE` | `15` | if free space is below this, % — the backup does not start |

## Exit codes

| program | codes |
|---|---|
| `sadik-backup.py` | build: 0 built and uploaded (completeness is in the stamp and in `backup-coverage.json` inside the archive, not in the code; a rotation failure on Drive after the upload does not change the code — see below) · 1 built but not uploaded · 3 registry unreadable or contract invalid · 4 build failed · 5 entry unreadable from the store or token not issued; an uncaught Python exception also gives 1. `--sostav`: 0 frame complete · 4 gaps or uncovered agents · 3 registry · 2 extra arguments. `--skachat`: 0 downloaded · 1 HTTP not 200 or 0 bytes · 4 permissions of the downloaded file wider than 0600 · 5 token · 2 arguments or no directory. Unit without `SuccessExitStatus`: any non-zero code — failed → `sadik-backup-failed.service` → `kopiya-upala` |
| `kopiya-put-nl` | 0 brought up or down (`down` — always 0) · 1 `up` failed (no `awg0`, route or rule not set, foreign rule at 39) · 2 unknown input. In the unit `ExecStartPre=-`: an `up` failure does not stop the build |
| `kopiya-upala` | 0 alert delivered or not needed (`notification=sent`) · 1 not delivered — the alert unit itself is failed · 2 input refused |
| `proverka-kopii.sh` | 0 full profile passed · 1 defect found (including «🔴 НЕГОДНА: в архиве члены, ведущие вне корня распаковки …» (INVALID: archive members leading outside the extraction root) — absolute path, «..», path through an archive link, link above the root; such an archive is not extracted) · 2 no conclusion · 3 profile passed, but registry patterns are missing both from the copy and from the machine, and the collector of this copy named them absent at build time — «incomplete by composition», not «not restorable» (B-N-2101; present on the machine and not taken, or absence not declared by the collector — 1 «КОПИЯ НЕПОЛНА») · 8 only the partial profile passed (`--tolko-sekrety`); last line — `VERIFY_RESULT verdict=… code=…` |
| `proverka-otmetki-priyomki.sh` | 0 acceptance is running · 1 stamp older than the limit and the timer has not fired · 2 measurement did not take place |
| `proverka-svezhesti-kopii.sh` | 0 accepted, stamp written · 1 not accepted · 2 unknown (blindness, not ready, refusal due to space or timeout) · 4 accepted, stamp not saved · 5/6/7 — same as 1/2/4, but the alert was not delivered · 8 partial profile · 1 for composition prints «НЕПОЛНА» (INCOMPLETE), other 1 — «НЕГОДНА / не восстановима» (INVALID / not restorable) · 9 restorable but incomplete by composition: registry paths are missing both from the copy and from the machine (the collector named them absent at build time) — alert «🟠 … ВОССТАНОВИМА, но НЕПОЛНА ПО СОСТАВУ» (RESTORABLE but INCOMPLETE BY COMPOSITION) with the list, stamp not written (if not delivered — still 9, `notification=failed`); last line — `BACKUP_RESULT verdict=… notification=… code=…`. In production the unit succeeds only on 0 (drop-in `zz-itogi-priyomki.conf` resets `SuccessExitStatus`); any other code — failed → `backup-verify-failed.service` → `kopiya-upala`, which stays silent on `notification=sent` |
| `razmer-kopii-watch` | 0 clean · 1 alert raised (step, lack of space, or «ступенька НЕ мерена» (step NOT measured) when the shelf has no previous archive) · 2 blindness, also goes to a human. In the unit `SuccessExitStatus=1`; a Python crash — 70 via `python-padenie-70`. The unit has no `OnFailure=` |
| `backup-coverage-watch` | 0 coverage complete · 1 uncovered found (including one suppressed as a repeat) · 3 registry unreadable or empty · 4 walk failed or dpkg lists not read · 5 walk root without a mask is empty. In the unit `SuccessExitStatus=1`; a Python crash — 70. The unit has no `OnFailure=` |
| `omega-db-backup.sh` | 0 backup made and checked · 1 no database, too little space, copying, check or compression failed. Unit without `SuccessExitStatus`: 1 — failed → `omega-db-backup-failed.service` → `kopiya-upala` |

Rotation on Drive runs after the upload with a fresh token and lists the subfolder page by page (up to 50 pages of 100). Its
failure is not a backup failure: the backup is already on Drive, the code is 0, the stamp is written, and the journal keeps the line
«⚠️ ротация не состоялась: …» (rotation did not happen: token not obtained, HTTP error, network) or «⚠️ ротация ОСТАНОВЛЕНА: …»
(rotation STOPPED: more than 50 pages or not a single own object). Old backups are not deleted, and space on Drive will grow — these
lines are read by eye, there is no alert for them.

## Dependencies

Taken from the code — what the programs actually call. Nothing from this list is part of the package.

- **`agent-registry`** (`/usr/local/bin/agent-registry`, package a2a-bus) and the registry `/etc/agent-registry/agents.yaml`. Without
  them the builder exits with code 3 and the alert «Копия sadik не сделана» (sadik backup not made), the coverage watcher — code 3, acceptance — code 2.
- **git and the repository `/etc/agent-registry`** — only for acceptance with `--kopiya-snyata` when the registry is newer than the backup; without them — code 2.
- **`agent-alert`** (`/usr/local/bin/agent-alert`, package dsh-trevogi). Without it the builder stays silent; `kopiya-upala` — code 1;
  scheduled acceptance changes codes 1/2/4 to 5/6/7; the watchers print «тревога не отправлена/не доставлена» (alert not
  sent/not delivered). The sender needs the `agent-button` group.
- **`pass` and the store `/etc/agent-secrets`** — for upload and download: from root the builder calls
  `sudo -n -u iskra env PASSWORD_STORE_DIR=… pass show <запись>`. Entry not read — code 5.
- **Python modules `requests` and `urllib3`** (not standard) — upload, download, rotation; `urllib3` is loaded at
  start when `BACKUP_SO_MARK` is set (it is set in production). `--sostav` and `DRY=1` do not touch them. Without `requests` the build
  reaches the archive and fails on getting the token with an uncaught exception — Python exits with code 1, as "not uploaded".
- **`getfacl`** (package acl) — ACL snapshot. Without it the build passes with code 0, but acceptance rejects such a backup:
  «СНИМОК ACL НЕГОДЕН» (ACL SNAPSHOT INVALID), code 1.
- **`hostname`** — length budget of the builder's alert; without it the alert is not sent («ТРЕВОГА НЕ ДОСТАВЛЕНА» (ALERT NOT DELIVERED)), the code does not change.
- **`systemctl`** — the builder (its own timeout), `kopiya-upala`, the stamp watcher, scheduled acceptance, `razmer-kopii-watch`
  (no answer — blindness, code 2).
- **`journalctl`** — `kopiya-upala` (result line and tail); without it the alert is always sent.
- **`ip`** (iproute2) and the interface **`awg0`** — `kopiya-put-nl`. Without `ip` it prints «awg0 нет» (no awg0), i.e. it names the wrong
  cause; the upload then goes the usual route.
- **`sudo`** — for the builder, for `pass`; for the coverage watcher — **passwordless right of the `iskra` account to `sudo -n find` and
  `sudo -n test`** (the sudoers rule is not part of the package). No right — walk failed, code 4.
- **`gpg`**, **`gzip`**, **`tar`** and coreutils (`mktemp find chmod cp grep wc sort date stat awk sed cut du rm`) — acceptance
  checks them before work; if any is missing — code 2. Acceptance requires `tar` although it reads the archive with a Python module; the program
  `tar` is used only by `razmer-kopii-watch` (without it the step is measured over the whole backup). `cat`, `head`, `tail`,
  `mkdir`, `dirname`, `basename` are called by acceptance outside this check.
- **`timeout`** and **`df`** — scheduled acceptance (timeouts of the stages, free space); `df` — also `omega-db-backup.sh`.
- **`python-padenie-70`** (package dsh-storozha-mashiny) — launcher of the two Python watchers in the drop-in `60-python-padenie-70.conf`.
- **Markup meter** `IZMERITEL_BIN` (default `/opt/iskra/workspace/dorabotki/ozhidaemyj-razmer.py`) — not part of the
  package; no file — alert «измеритель разметки не найден» (markup meter not found), code 1 (a repeat of the same problem is suppressed for 24 h).
- **dpkg lists** `/var/lib/dpkg/info/*.list` — the `!paket` mask of the coverage watcher; not read — code 4.
- **Network access to Google** — `oauth2.googleapis.com` and `www.googleapis.com`.

The `sqlite3` program is not needed: all databases — the OMEGA backup, database snapshots in the builder and database checks in
acceptance — are opened with the Python module `sqlite3`.

Versions: **Python ≥ 3.11** for `sadik-backup.py` (`glob(…, include_hidden=True)`); below that the build fails before upload.
`backup-coverage-watch` and `sadik-backup.py` use `X | None` in annotations — ≥ 3.10 is needed. The other programs have no
features newer than 3.8. Production — 3.12 (measured 10.10.2026).

## Installation and removal (by root)

Installing a file: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>`; in production — via
`smontirovat-fajly` through the gate. Units: put them into `/etc/systemd/system/` (drop-ins — into their own `*.service.d/` directory),
`systemctl daemon-reload`, `systemctl enable --now <имя>.timer`.

Removing a unit — `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file to a backup copy (`mv`), `daemon-reload`, `mask`; to restore — `unmask` and put the file back.

## Limitations

- `sadik-backup.py`: symlinks are stored as symlinks — a target outside the markup does not go into the backup; "built" ≠ "complete"
  (completeness is in the stamp); the ACL snapshot is taken at the end of the walk, paths with a newline stay without ACL; a `ne_klast`
  mask starting with «**» is not applied; a night that did not reach Drive and was pushed out by newer ones loses its only copy;
  `--sostav` gives source roots, not the archive listing; `--skachat` moves bytes, it is not acceptance; a file that vanished
  between the walk and packing is a "vanished during build" line in the journal, not a failure, and is not in the manifest (3.1.4);
  nobody reads the "vanished during build: N" line — loss of a WHOLE markup pattern is caught by acceptance (`proverka-kopii.sh`,
  composition section: a pattern with no items in the archive), partial loss inside a pattern is caught by nobody (3.1.5);
  an unfinished archive on the shelf is only `….tar.gz.chast`: the backup name goes to an archive that passed 0600 and
  `proverit_arhiv`; a build failure deletes `.chast`, a run killed by a signal leaves it until the next run (removed if older than an
  hour); there is no lock against a parallel run; rotation, `razmer-kopii-watch` and restore "from the shelf" take only `*.tar.gz` (3.1.5).
- `kopiya-put-nl` does not catch degradation of the tunnel itself; without `awg0` marked packets take the usual route.
- `kopiya-upala` does not catch a unit that did not start; it sees a hang only through `TimeoutStartSec`; nobody sees the death of
  the alert unit itself.
- `proverka-kopii.sh`: contents are counted by patterns, not by files; the manifest is the builder's word about itself (it catches "knew
  it skipped something", but not "did not know it had to take something"); the ACL snapshot is not compared with the disk; connections are checked by presence, not by
  operation; validity of secret values is not checked; the markup at the moment of the backup comes from git, a change made bypassing git is not caught.
- `proverka-otmetki-priyomki.sh` does not judge backup validity and does not check that the stamp is truthful.
- `proverka-svezhesti-kopii.sh` checks only the last archive; it takes the size for the space calculation from the stamp, not from
  Drive; a speed below 12 MB/s hits the timeout.
- `razmer-kopii-watch` sees growth within 5 % per night only as space usage; it does not name "what grew"; it does not see growth inside work zones,
  growth of session journals is shown as a line, not as an alert.
- `backup-coverage-watch`: the `!paket` mask does not catch our file inside a package directory; a change of the tail of a markup problem under the same
  heading is suppressed as a repeat; a change of owner of the state directory breaks suppression.
- `omega-db-backup.sh` keeps the backup on the same volume as the database: it does not protect against disk death.

## Check

The checksum of each package file at the tag `dsh-kopiya-mashiny-v<номер>` installed in production = the production checksum (`sha256sum`), permissions = the table (`stat -c '%a %U:%G'`); timers —
`systemctl list-timers sadik-backup.timer backup-verify.timer omega-db-backup.timer razmer-kopii-watch.timer backup-coverage-watch.timer`.

The package has no test stands of its own. The stands are in the package dsh-obhod-stendov (`dorabotki/`), in production — in
`/opt/iskra/workspace/dorabotki/`; they are run by the nightly walk `vse-stendy-boevye.sh` under the `iskra` account:

| stand | subject | conditions | what it checks |
|---|---|---|---|
| `stend-priyomki-kopii.sh` | `proverka-kopii.sh` | no sudo; needs `gpg`, `python3`, a readable registry | acceptance with its own key and store through a substitute registry; `--tolko-sekrety` expects 8; codes 0/1/2 |
| `stend-priyomki-po-raspisaniyu.sh` | `proverka-svezhesti-kopii.sh` | needs `sudo -n` (otherwise «СЛЕПОТА», code 2); substitute builds via `systemd-run` | 37 probes and the live unit success policy; codes 0/1/2 |
| `stend-otmetki-priyomki.sh` | `proverka-otmetki-priyomki.sh` | no sudo; substitute `systemctl` | 13 checks of codes |
| `stend-razmer-kopii-watch.sh` | `razmer-kopii-watch` | no sudo; `RKW_*` overrides | coupling of the numbers with acceptance, space on a substitute shelf, the step without work zones; codes 0/1/2 |
| `stend-pokrytiya.sh` | `backup-coverage-watch` | installed files, overrides of `COVERAGE_SOSTOYANIE`, `AGENT_ALERT_BIN`, `AGENTS_REGISTRY` | sees what is uncovered, stays silent about what is marked up; does not damage the live machine; codes 0/1/2 |
| `stendy/stend-sborshchika-kopii.sh` | `sadik-backup.py` (build) | without root, ~3 s | recoverable `__pycache__` and parsing of foreign `.pyc` in a subprocess; a file vanishing between the walk and `tar.add`, and the «-journal» of a snapshotted database |
| `stendy/stend-dogovora-trevogi.sh` | `sadik-backup.py` against `agent-alert` | no sudo | three anchors of the alert contract on the production sender and on broken copies of it; codes 0/1/2 |

`kopiya-put-nl`, `kopiya-upala` and `omega-db-backup.sh` have no stands.
