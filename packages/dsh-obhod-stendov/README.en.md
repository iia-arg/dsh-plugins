Russian version: [README.md](README.md) · English below

# dsh-obhod-stendov — nightly and weekly run of the live test stands on sadik

**Version:** 3.1.120

Each root stand needs its own `OBLAST_STENDOV` entry; a comment in the stand does not grant privileges.

Service software of sadik: a timer-driven run of test stands (nightly at 03:40 UTC and weekly on Wednesdays at 16:00 UTC), the runner
`vse-stendy-boevye.sh` with the stand lists, the stands themselves and their data. The outcome of the run is read by `chitatel-obhoda`
(package **dsh-storozha-sadik**).

The package is **not for publication without separate gates:** the lists and the runner carry the internal layout of the machine (paths, units, agent
names, stand exceptions, the ways live items are checked).

**Temporary rule (Veniamin, 07.10.2026):** until new packages have a "live ↔ tag" reader, any file of the package
changes only together with a new package number in the same window.

⚠️ The live timer runs code from the agent's working directory (`/opt/iskra/workspace/dorabotki`). Moving it into the tree does not
change that; moving it to `/usr/local` is a separate decision.

The package is sources without `package.json`: `dorabotki/` mirrors the path `/opt/iskra/workspace/dorabotki/` (owner
`iskra:iskra`), units and drop-ins are in `systemd/` (under `/etc/systemd/system/`). The number is the CHANGELOG heading and the tag
`dsh-obhod-stendov-v<номер>`. Moved from live: the checksum of every file in the tree equals the checksum in live.

The B-N-2063 nightly budget is **temporary**: `ceil100((mimo_limit+2500)*1.10)` = 4800 s at mimo=1800;
the unit limit is 5100 s. **Recalculate after the first complete 2026-10-16 03:40Z run, by 2026-10-16 12:00Z.**
This reserve enables measuring the full tail; it does not guarantee enough time for future growth.
Profiling `pravki-mimo`/`sadik-watch` is assigned separately after mounting this candidate.

The nightly wrapper calls adjacent `obhod-run-state.py` (install in the same `dorabotki/`, 644, iskra:iskra).
The walker freezes its selection before the first stand and records starts, finishes and its own scope names in a private directory.
On interruption the summary and alert name interrupted and unstarted paths. Before the selection is frozen, the declared list
is explicitly labelled as a fallback. Only registered scope names with a unique run identifier receive TERM then KILL;
cleanup is bounded to 10 s and multipart alerts to 22 s in total (2000 UTF-16 units per part, preserving all path lines).
Before reading scope state, the wrapper stops its own separate launcher process group (`setsid`), including delayed dispatch;
otherwise a not-yet-created scope could appear after cleanup. Nightly callers require a working scope0 and refuse stands
when it fails; standalone gate behavior is unchanged. Launcher and scope cleanup share the same 10 s bound.
Before each group signal, `/proc` must confirm both `pgrp=pid` and `session=pid`; otherwise cleanup logs a skip.
A reused foreign leader PID receives no individual signal either.
Failed state reads, cleanup or partial sends are reported as failures. SIGKILL of the wrapper itself or power loss cannot run
its final report; the separate run reader covers missing runs. The weekly script is unchanged.
Since 3.1.74, `notify()` logs `канал тревог <path>: код N` for each part and at most 20 combined
stdout/stderr lines prefixed with `  канал: `. Exit codes and sending deadlines are unchanged.
Iskra O9/O9б check this format; O6/O8 keep the B-N-2063 named-tail contract.
Manual regression (not run nightly): `python3 -B test/test_night_abort.py`; needs sudo/systemd, uses only private stands,
its own transient scopes, a neighbor fixture service and a stub alert sink. It does not run live agents or the owner channel.

Since 3.1.86, the caller logs `КАНАЛ НЕ ВЫЗВАН` when the channel file is absent/inaccessible or not executable. The sender was never invoked, so its diagnostic belongs in the wrapper journal. The wrapper still exits 3 without another attempt. The existing exception stand covers the refusal and receiver recovery in cases О10/О10б/О11/О11б.

Since 3.1.77, `s2_obertka` uses `--scope --collect` without `--wait`: finished failed scopes are collected;
the calling walker captures exit status and output. S2 reads the journal rather than properties of collected units.
Manual regression `sudo -n python3 -B test/test_s2_collect.py` executes the actual wrapper as `iskra`, checks exit 7
and self-SIGKILL (exit 137), preserved streams/context, forwarded `--collect` and scope collection. Exact names are cleaned in `finally`.
No memory pressure is induced: real OOM invokes the live `oom-watch` alerts. Self-SIGKILL does not reproduce OOM-failed state;
the earlier failed-to-collected observation is retained in P7 and must not be repeated without coordination.
Stands that inspect failed/OnFailure retain their units until observation and then clean only their own names.

## Contents — by calls (taken 07.10.2026)

Method: for every file, the lines of the core (run scripts, lists, runner, stands) where the file name appears NOT in a
comment; a stand is in the package only if the run calls it, or a stand called by the run calls it. The runner does not enumerate the
`stendy/` directory — only the lists. Of 54 disputed files in the root of `dorabotki`, 3 are taken — data and a helper read by
`stend-kanarejki-shlyuza.sh`: `edinstvennye-sushchnosti-shlyuza.json`, `zayavlennye-proverki-kanarejki-shlyuza.json`,
`sreda-yunita.py`; the other 51 are not in the package (below).

## Live Codex gateways: app-server mode

`test/stend-codex-app-server.py` is called nightly by its own `OBLAST_STENDOV` row with `@root` and is listed in the stand inventory. It discovers live gateways using `systemctl list-units 'coder-gateway*'` and MainPID, and identifies Codex from live `GATEWAY_POSTAVSHIK=openai` in `/proc/<MainPID>/environ`. Each must have `GATEWAY_CODEX_PUT=app-server` after trimming the same whitespace set as the gateway’s JS `.trim()`; an empty trimmed or absent value defaults to `exec`; an effective value other than `app-server` produces `КРАСНОЕ` with the unit name, exit 1. Every checked unit is named, followed by `Codex-шлюзов N · app-server M · иначе K`.

Zero Codex gateways, unreadable or ambiguous environ, a systemctl error or a changed PID/starttime is blindness, exit 2. Process identity is rechecked after the read. The complete environ and unrelated variables are neither printed nor stored. The existing dsh-storozha-sadik `chitatel-obhoda` reads the outcome.

One pass: at most 128 discovered units, 3 seconds per systemctl call and a 30-second overall timer; environ is limited to 1 MiB. No retries, state writes or restarts. Stopped gateways and non-openai providers are outside scope; a missing provider causes blindness rather than silent exclusion. This check does not prove a G binding, AP receipt completeness or app-server health. A process changing mode after startup, and changes after the final snapshot, remain outside its guarantee.

Veniamin LOW for 3.1.103: versions 3.1.103–3.1.104 required exact bytes and falsely reported surrounding whitespace as red. Since 3.1.105 the stand follows the gateway’s `String(...).trim() || 'exec'`: a wrapped `app-server` is green; empty, whitespace-only and missing values are red `exec`. The JS trim set is shared with provider normalization; unrestricted Python `.strip()` is not used.

## G: segments, size, rate, rotation and GC

**3.1.120 — night 22.10: stend-atsiklichnosti names the real cause, stend-pokrytiya no longer asserts completeness of live marking (Gamma e2a27940).**
**3.1.119 — g-source-contract: on Node failure the first 300 stderr bytes go into the reason text (Alfa 7059dc7e).**
**3.1.118 — night 22.10: stand list +2 TG stands (stend-claude-turn-native/usage, AP 0.1.16 window debt); g-source-contract binds initializer files instead of the directory (Alfa 4ba93632).**
**3.1.117 — gateway 3.1.10: 1 new gateway stand in the stand list (tree path; gateway 3.1.10 in master since 21.10 04:50Z).**

**3.1.116 — for window 0.1.12 (gateway 3.1.9): 7 new gateway stands in the stand list (tree path; gateway 3.1.9 in master since 20.10 08:15Z).**

**3.1.115 — stend-atsiklichnosti prints the subject under the second-ledger FAIL; two obhod stands no longer leave a root-owned `__pycache__` in the tree; SREDA_STENDOV environment for 5 dsh-tool-bridge stands of Iskra's copy.**

**3.1.114 — for window Ш (gateway 3.1.8): 4 gateway stands in the stand list (tree path; goes live only in window Ш after the gateway merge), and the nightly canary stand parses an environment passed as an `env:` object property.**

**3.1.113 — R watchdog for the simplified 0.1.10 accounting (Zabava's policy decision 18.10, Veniamin 18:01 MSK; Zarya's hand).** `test/stend-r-journal-size.py` is called by an `OBLAST_STENDOV` row `@root /opt/iskra/app` and a `SREDA_STENDOV` row; `chitatel-obhoda` reads the verdict. Until the accounting window the argument is `--otlozheno` ("not kept", code 0); the window replaces it with `--istochniki <Gamma's reader sources config>`. The limit comes only from ONE policy file shared by writer and reader, `/etc/dsh-telegram-multiagent/usage-runtime-policy.json` (root, no group/other write; exactly `{schemaVersion:1, fileMaxBytes, recordMaxBytes}`); the watchdog has no limits of its own, `--policy` is for probes only. Only `lstat` of R and `systemctl is-active` of the source's TG service; contents are not read. RED in exactly three cases, each naming its subject: (a) policy missing / unreadable / unprotected / wrong shape; (b) R larger than `fileMaxBytes` — truncation failed (exactly the limit is legal); (c) the service is active but R is missing or its mtime is older than 300 s — "writer silent" (writer heartbeat 15 s). No YELLOW. Unsafe R directory/file, unqueried service, missing sources config — BLIND (code 2); service not active and no R — "not judged". The sources config is Gamma's reader profile `/var/lib/autopilot-usage/source-profile.json` (`participants[]` → `name`, `uid`, `runtimeSource.raw`; the service is field `tgService`, a `POLE_SLUZHBY` placeholder until Gamma's P7); a defective profile or a missing service field is BLIND naming the participant; no own list. Not caught: a foreign `touch` of R (false green by mtime), events between nightly runs, R contents. Probes: `sudo -n python3 -I test/test_r_journal_size.py [probe]` — 32.

**3.1.108 is a candidate for the combined AP0.1.10 window only: Gamma's segmented gateway3.1.8, Beta's reader/budget and this stand. Install after AP0.1.9 and only in that combined window.**

The existing `OBLAST_STENDOV` root row calls `test/stend-g-journal-size.py`; `chitatel-obhoda` reads its verdict. Live Codex/Claude units are discovered via systemctl/MainPID and environ. Node exe/cmdline gateway.mjs selects each producer: absolute entrypoints through `/proc/PID/root`, relative ones through cwd. Producer and policy must be adjacent. Unknown wrappers/flags, parent links, traversal or unreadable identity give blindness2, without a main-build fallback. Segmented G uses CODEX_HOME/HOME through the same process root; parent identities are rechecked. Legacy schema1 retains the previous host G path.

Strict policy JSON is bounded to256KiB: the two-key schema1 or writer3.1.8 schema3: schemaVersion plus legacyFileMaxBytes, segmentMaxBytes, segmentMaxAgeSeconds, rawRetentionSeconds and maxRecordBytes. Old schema2 and any additional directoryWarnBytes/closedCountWarn fields are rejected as unsupported; warning thresholds belong only to the stand settings. Bad schema/numbers, duplicate keys or missing file mean named blindness2, with no fallback128MiB. The size stand never imports JavaScript. On-disk policy can differ from the writer's in-memory value until restart.

Schema3 uses `g_segment_source.py` for metadata/stat and observedAt in the first active line:0400 source anchor with required safe integer UTC epoch-ms sourceCreatedAt;0600 manifest/lock/active;0400 closed raw/seals;0700 directories. Known files must be regular, owned by gateway uid, nlink1 and not links. `g_safety` enforces the initializer's early guards, followed by segment metadata guards. Unsafe objects produce yellow G-disabled; invalid schema, missing required data, intent or unstable snapshot produce blindness2. Chmod alone cannot re-enable a writer disabled at startup: restart is a separate coordinated action. Green does not prove the writer is enabled. No manual UUID profile is maintained.

All entries in `segments/` are counted. Expected count is `2*ceil(rawRetentionSeconds/segmentMaxAgeSeconds)+2`,338 for7days/1hour. Startup count WARN is strictly `>2*(7*24*2+2)` (>676), not policy.closedCountWarn512. Total bytes cover the whole source: active, anchor, raw/seals/metadata and extra regular files; filesystem allocated bytes are separate. Startup size WARN is strictly>1073741824bytes (1GiB). Orphans warn separately. The GC line reports the oldest closed segment; older than retention+3600seconds means “GC отстаёт”. Each measured schema3 source has three separate rows: GC, Growth and Reference. GC and growth have independent verdicts. The reference row has no FAIL/color and places actual whole-source file count (plus segments count) next to hourly expectation344, `2(N+1)+4+2`. This is an hourly reference, not an alarm threshold: size rotation can legitimately produce more files. These three rows use the existing STEND-G-METRIC transport; rotation below adds a fourth row, and maximum remains separate. These are soft warnings, not quotas or early-deletion instructions.

The separate `РОТАЦИЯ` row warns for a **nonempty** active when `now-firstObservedAt > (policy.segmentMaxAgeSeconds+15*60)*1000`: `ротация стоит: <gateway>, первая запись <UTC>`. firstObservedAt comes from observedAt in the first active line, not manifest.active.openedAt or mtime. An old empty active receiving a fresh record remains green before the writer seals it. Metrics include both openedAtMs and firstObservedAtMs. Read at most maxRecordBytes+1 bytes (≤65537), with regular-file/uid/0600/nlink1/O_NOFOLLOW and before/after stat guards. Invalid JSON, duplicate keys, invalid/future timestamps and incomplete/oversized first lines produce blindness2. Full raw validation is outside scope. Equality at the age boundary is healthy. Empty active is neutral with firstObservedAtMs=None. No new state is written; GC/growth/reference verdicts stay independent.

Stateless rate is the sum of validated seal byteLength with `now−604800000 < closedAt <= now`, divided by604800seconds. Active and older seals are excluded. This is a sliding seven-day closed-raw average, not a difference between total sizes across GC. Young sources still use the seven-day denominator, not elapsed lifetime.

Operator settings are together at the top of `test/g_segment_source.py`: WARN_BYTES, WARN_FILES and THRESHOLD_STAGE. Thresholds stay fixed and explicitly labelled startup (“стартовые”). There is no learning, root measurement state or new reader. Each night `STEND-G-METRIC:` emits measuredAtMs, unit/participant, totalBytes, segmentFiles, closedBytes7d, bytes/second and thresholds. The existing collector forwards these rows to its stdout/journal even on exit0. A separate `STEND-G-METRIC: МАКСИМУМ` row names the fastest measured gateway and its rate; each gateway keeps its individual row. The maximum compares exact closedBytes7d, not summed or rounded rates. Incomplete coverage/blindness is labelled partial; no measured sources is unmeasured, not numeric zero. After a week, people inspect that series, calculate `2*(fastest gateway rate*7days)` and change constants/label in a normal reviewed window. The stand never recalibrates itself.

Schema3 retires the old75%/100%128MiB active-file alarms. The AP contract now compares legacyFileMaxBytes ↔ G_WRITER_LIMIT and maxRecordBytes ↔ G_RECORD_ALLOWANCE separately; neither is a whole-source segmented limit.128MiB remains only the legacyS0 schema bound (+maxRecordBytes); normal segments use segmentMaxBytes. Volume warnings concern the whole source. They do not attest AP reader budget, P1/sequence/freshness, binding/completeness, raw SHA or coordinated rewriting by the same uid. The all-history inspectGatewaySegments helper has no P1/I/O budget and is not used; Beta owns the AP reader.

Legacy schema1 preserves safe integer gatewayV1FileMaxBytes>65536, yellow `(limit*3+3)//4`, red limit, FAIL/source-size-gap warnings and the AP equality contract. Isolated `python3 -I -B -c` imports usage_registration from `/opt/autopilot/current/skill/tools`; module origin/release and symlink containment are checked before import. AP<producer and AP>producer are distinct red reasons with both values/paths. Missing module/import/limit gives blindness2. Beta confirmed the import is clean; author probes use a copy of the future layout. AP import is limited to3seconds/64KiB stdout/stderr, without pyc. Schema3 checks both pairs above; either mismatch is red with the pair, values and paths, while a missing G_RECORD_ALLOWANCE is blindness2. The AP usage-reader-limits.json is stamped before/after import and the initializer table. Import receives PATH and the existing unchanged parent HOME; other environment entries are filtered. This verifies the numeric contract, not a whole-source AP budget.

Neither G nor producer means neutral “build without G” with path; G without producer is named blindness2. Policy is required whenever producer exists, even without G. Missing G in a process definitely newer than max(producer mtime,ctime) is yellow G-expected; an older process is neutral before-installation. Clock ambiguity/future timestamps are blindness2. Counts distinguish total/withG/withoutG/disabled; zero scope is blindness. Exit0 means no alert, not existence of G.

The other existing root row calls stend-g-source-contract.py → live g-source-contract.py. Every process-discovered producer directory is checked once by dev/inode with all unit names, never a build-fixture fallback. Actual prepareGatewayUsage runs in temporary HOME: two providers × four directory states × seven file states,56cases. Schema3 also checks full metadata after initialization. Mismatch is red with case/source; errors give blindness2. Explicit --producer accepts an absolute usage-producer.mjs path.

Pinned fixtures g-producer-359a/25d8 are for deterministic builds only (SOURCE.json/commit/SHA); the nightly row is the live contract.All four files of Gamma writer candidate25d8092059192ee3a456d99fd7e91123955d21cb from AP010-G-WRITER-LIMITS-ONLY-20261018 match their Git blobs; its external acceptance is not attested here. Actual prepare obtains sourceCreatedAt with the real clock in a scratch HOME, and the CLI runs through a temporary MainPID. Handcrafted metadata remains unit-level input, not a substitute for that owner probe. Forced seals invoke the writer method to test count/reference geometry, not production load. Fixture ap-limits-0516 contains Beta0516b410 actual usage_registration.py, mail_registration.py and usage-reader-limits.json in the future skill/tools layout, with hashes/origins in SOURCE.json. The old2 adaptation from r3 is removed: builds and the live contract use the actual schema3 writer. Recheck the joint candidate if the final writer changes; installation is not attested here.

Size pass limits:128units, systemctl3seconds/call,30seconds overall, environ1MiB, cmdline/status64KiB;16384objects/source,8MiB/JSON and32MiB total metadata. Contract:90seconds overall, Node15seconds/build,256KiB stdout/stderr. bwrap exposes imports read-only, only scratch HOME/tmpfs writable, no external network/PID and no capabilities. Process and static initializer files (producer, engine-process, policy, plus usage-segments for3) are checked before/after. No retries/state/cleanup/restarts. Arbitrary future imports and deliberate file/mount alternation are not atomically covered; loaded memory code is not checked. Production HOME/gateway.mjs/services are not executed.

## Files

git stores only the "executable" bit, so the mode and owner on disk are in the table (taken with `stat` of live, 07.10.2026).

| file in the package | path on disk | called by | mode | owner:group |
|---|---|---|---|---|
| `libexec/stend-varvara-fs-deny.mjs` (since 3.1.15) | `/usr/local/libexec/stend-varvara-fs-deny.mjs` | nightly runner, `@varvara /opt/varvara/app`; 15 s, caller 30 s | 644 | root:root |
| `dorabotki/omega-b-p-060/stend-b-p-060.sh` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/omega-b-p-060/stend-b-p-060.py` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.py` | stand stend-b-p-060.sh (run by the OMEGA python `/opt/omega/venv/bin/python3 -B`) | 755 | iskra:iskra |
| `dorabotki/perechen-boevyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt` | runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/perechen-nedelnyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-nedelnyh-stendov.txt` | vse-stendy-nedelnye.sh | 644 | iskra:iskra |
| `dorabotki/stend-373-svodki-vne-vydachi.mjs` | `/opt/iskra/workspace/dorabotki/stend-373-svodki-vne-vydachi.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-agent-limits.sh` | `/opt/iskra/workspace/dorabotki/stend-agent-limits.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-apt-notify.sh` | `/opt/iskra/workspace/dorabotki/stend-apt-notify.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-B14-snimok.sh` | `/opt/iskra/workspace/dorabotki/stend-B14-snimok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-atsiklichnosti.sh` | `/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stend-cepi-pamyati.mjs` | `/opt/iskra/workspace/dorabotki/stend-cepi-pamyati.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-compaction-zaveden.mjs` | `/opt/iskra/workspace/dorabotki/stend-compaction-zaveden.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-izmeritelya.sh` | `/opt/iskra/workspace/dorabotki/stend-izmeritelya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kanarejki-shlyuza.sh` | `/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kurera.sh` | `/opt/iskra/workspace/dorabotki/stend-kurera.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-needrestart.sh` | `/opt/iskra/workspace/dorabotki/stend-needrestart.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh with the key `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stend-obyavlenij-profilej.sh` | `/opt/iskra/workspace/dorabotki/stend-obyavlenij-profilej.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-ohvat-i-sverka.mjs` | `/opt/iskra/workspace/dorabotki/stend-ohvat-i-sverka.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-otmetki-priyomki.sh` | `/opt/iskra/workspace/dorabotki/stend-otmetki-priyomki.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pochtalona.sh` | `/opt/iskra/workspace/dorabotki/stend-pochtalona.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pokrytiya.sh` | `/opt/iskra/workspace/dorabotki/stend-pokrytiya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-poteri-pisem.mjs` | `/opt/iskra/workspace/dorabotki/stend-poteri-pisem.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-hranilishcha-sekretov.sh` | `/opt/iskra/workspace/dorabotki/stend-hranilishcha-sekretov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vozrast-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-vozrast-pisma.mjs` | nightly run (perechen-boevyh-stendov.txt) — exception ОЖИДАЕМО ("expected"); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-pravki-reestra.sh` | `/opt/iskra/workspace/dorabotki/stend-pravki-reestra.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-kopii.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-kopii.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-po-raspisaniyu.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-po-raspisaniyu.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priznaka-oblasti.sh` | `/opt/iskra/workspace/dorabotki/stend-priznaka-oblasti.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-proverki-opory.mjs` | `/opt/iskra/workspace/dorabotki/stend-proverki-opory.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-razmer-kopii-watch.sh` | `/opt/iskra/workspace/dorabotki/stend-razmer-kopii-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-reestra-agentov.sh` | `/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-registry-json.sh` | `/opt/iskra/workspace/dorabotki/stend-registry-json.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-sekretov-na-mestah.sh` | `/opt/iskra/workspace/dorabotki/stend-sekretov-na-mestah.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-skill-links.sh` | `/opt/iskra/workspace/dorabotki/stend-skill-links.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-snyatie-ogranichitelej.mjs` | `/opt/iskra/workspace/dorabotki/stend-snyatie-ogranichitelej.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-soglasie-sloev.sh` | `/opt/iskra/workspace/dorabotki/stend-soglasie-sloev.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-stop-pobudok.mjs` | `/opt/iskra/workspace/dorabotki/stend-stop-pobudok.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-storozha-reestrov.sh` | `/opt/iskra/workspace/dorabotki/stend-storozha-reestrov.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svershchika.sh` | `/opt/iskra/workspace/dorabotki/stend-svershchika.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svyazok-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stend-svyazok-podpisok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-U0-istochnik.mjs` | `/opt/iskra/workspace/dorabotki/stend-U0-istochnik.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-uborki-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-uborki-pisma.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-verdiktov-istochniki.mjs` | `/opt/iskra/workspace/dorabotki/stend-verdiktov-istochniki.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vidimosti-a2a.sh` | `/opt/iskra/workspace/dorabotki/stend-vidimosti-a2a.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vtoroj-vhod-svodki.mjs` | `/opt/iskra/workspace/dorabotki/stend-vtoroj-vhod-svodki.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vzaimnogo-nabludeniya.sh` | `/opt/iskra/workspace/dorabotki/stend-vzaimnogo-nabludeniya.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh with the key `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stendy/clw-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/clw-sluchai.sh` | stand stend-codex-limit-watch.sh | 755 | iskra:iskra |
| `dorabotki/stendy/fake-codex.py` | `/opt/iskra/workspace/dorabotki/stendy/fake-codex.py` | stand clw-sluchai.sh | 755 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-proverit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-proverit.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-tg.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-tg.mjs` | stand mail-stop-hold-napominaniya.mjs | 644 | iskra:iskra |
| `dorabotki/stendy/pk-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/pk-sluchai.sh` | stand stend-pereklyuchatelya-codex.sh | 755 | iskra:iskra |
| `dorabotki/stendy/poll-fixture.mjs` | `/opt/iskra/workspace/dorabotki/stendy/poll-fixture.mjs` | stand stend-a2a-owner-copy-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/priyomnik-imeni-v2.mjs` | `/opt/iskra/workspace/dorabotki/stendy/priyomnik-imeni-v2.mjs` | stand stend-imeni-v2.sh | 644 | iskra:iskra |
| `dorabotki/stendy/proba-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-kopij.sh` | stand stend-mest-kopij.sh | 755 | iskra:iskra |
| `dorabotki/stendy/proba-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-prav-domov.sh` | stand stend-prav-domov.sh | 755 | iskra:iskra |
| `dorabotki/stendy/smv-atomic-probe.py` | `/opt/iskra/workspace/dorabotki/stendy/smv-atomic-probe.py` | stand stend-smontirovat-vypusk-rezhimy.sh | 644 | iskra:iskra |
| `dorabotki/stendy/smv_fixture.py` | `/opt/iskra/workspace/dorabotki/stendy/smv_fixture.py` | four stend-smontirovat-vypusk-*.sh and smv-atomic-probe.py; private fixtures only | 644 | iskra:iskra |
| `dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-aclaude-snaruzhi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-aclaude-snaruzhi.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-chitatelya-obhoda.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-chitatelya-obhoda.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.etalon` | stand stend-codex-limit-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-compact-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-compact-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-doli-preseta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-doli-preseta.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-dogovora-trevogi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-dogovora-trevogi.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-hvostov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-hvostov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-imeni-v2.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-imeni-v2.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnovy-versii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnovy-versii.py` | nightly run; po_osnove: its own bare/suffix base passes, a foreign one is refused; without arguments it checks the neighbouring vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mashinnoj-redakcii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-mashinnoj-redakcii.py` | nightly run; systemd units of three packages, tree↔live, by working lines minus the data of /etc/agent-registry/ozhidaemye-razlichiya.yaml; does not see live drop-ins outside the tree | 644 | iskra:iskra |
| `dorabotki/stendy/stend-limity-pereklyuchatelya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-limity-pereklyuchatelya.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mail-stop-hold.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mail-stop-hold.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mest-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mest-kopij.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mihalycha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-modeli-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-modeli-omega.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-model-podmena.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-model-podmena.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-montazha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-montazha.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-oblasti-fajlom.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-oblasti-fajlom.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.py` | stand stend-obnovitel-prava.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-opisat-kartinku.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-opisat-kartinku.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnova.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnova.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-otbros-shlyuza.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-otbros-shlyuza.py` | nightly run (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pered-podyomom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | stand stend-pereklyuchatelya-codex.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-prav-domov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-mimo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh; vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.py` | stand stend-priyomnik-itog.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-profil.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, HODPRIBOR, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.py` | stand stend-razbora-env.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rezhim-novogo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rolej-shlyuza.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-rolej-shlyuza.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-voice-root.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-voice-root.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-zastryal.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-zastryal.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.py` | stand stend-sajt-chat.sh | 444 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 555 | iskra:iskra |
| `dorabotki/stendy/stend-sborshchika-kopii.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sborshchika-kopii.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya-profilya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sobrat-kuda.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sobrat-kuda.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-storozha-nad-storozhami.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-storozha-nad-storozhami.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svodki-doveriya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svodki-doveriya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.py` | stand stend-switch-1.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-trust-sverka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/mail-stop-trust-sverka.mjs) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-perenosa.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-perenosa.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-vypuska.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-zhivaya-versiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-zhivaya-versiya.py` | nightly run (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/skaner-zhivoj-mashiny.py` | `/opt/iskra/workspace/dorabotki/skaner-zhivoj-mashiny.py` | runner vse-stendy-boevye.sh (С1 before every stand, rules for the С2 judgement); taken from the runner's directory — install next to it | 755 | iskra:iskra |
| `dorabotki/vse-stendy-boevye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh` | vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/vse-stendy-nedelnye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-nedelnye.sh` | vse-stendy-nedelnye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/vse-stendy-po-tajmeru.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-po-tajmeru.sh` | vse-stendy-boevye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/edinstvennye-sushchnosti-shlyuza.json` | `/opt/iskra/workspace/dorabotki/edinstvennye-sushchnosti-shlyuza.json` | stand stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | `/opt/iskra/workspace/dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | stand stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/sreda-yunita.py` | `/opt/iskra/workspace/dorabotki/sreda-yunita.py` | stand stend-kanarejki-shlyuza.sh | 755 | iskra:iskra |
| `systemd/vse-stendy-boevye.service` | `/etc/systemd/system/vse-stendy-boevye.service` | its own .timer, 03:40 UTC | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/30-stend-nabora.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/30-stend-nabora.conf` | drop-in: STEND_POLKA, STEND_PLAGINY for the set stand | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | drop-in: run through bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-boevye.timer` | `/etc/systemd/system/vse-stendy-boevye.timer` | systemd (enabled) | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service` | `/etc/systemd/system/vse-stendy-nedelnye.service` | its own .timer, Wed 16:00 UTC | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | drop-in: run through bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-nedelnye.timer` | `/etc/systemd/system/vse-stendy-nedelnye.timer` | systemd (enabled) | 644 | root:root |

## Outside the run — stands in `dorabotki` that the run does not call (not taken into the package)

- root: stend-kanarejki.sh — «РУЧНОЙ НАМЕРЕННО» ("manual on purpose"; so in the list, 1.0.12: the copy inherits the identity of the live agent);
  stend-needrestart.sh is in the package since 3.1.1 (table above), the weekly run calls it;
  stend-hranilishcha-sekretov.sh and stend-vozrast-pisma.mjs — since 1.0.12 in the package and in the nightly run (vozrast-pisma — with the exception ОЖИДАЕМО);
- stendy/CHITAT-PERED-PROGONOM-nabor-vorot.txt, stendy/stend-podyoma.sh — `stendy/stend-podyoma.sh` is «вне обхода намеренно» ("outside the run on purpose"; so in the list); `CHITAT-PERED-PROGONOM-nabor-vorot.txt` is a note for the operator.
- the manual `stend-krug-samoproverki.sh` — «ИСКЛЮЧЁН, ручной» ("excluded, manual"; so in the list); its source is the dsh-reestr tree
  (`/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-krug-samoproverki.sh`), the copy in `dorabotki` was removed in 1.0.50.

## Not in the package — items under check and the rest (the coordinator decides separately)

- Items that the package's stands check (tools of other areas): `montazh-iz-tega`,
  `ozhidaemyj-razmer.py`, `priznak-oblasti-podklyucheniya.sh`, `proverit-publikacii.py` (+ its settings `karta-publikacij.yaml`),
  `proverka-opory.mjs`, `verdikty-priyomki.sh`; sources of live tools that have a pair in `/usr/local` (already in their own packages).
- Other files in the root of `dorabotki` that the core mentions only in comments, files `*.SNYATO*`, backups `*.bak*`, the bookkeeping `nashi-dorabotki.sh`/`manifest.txt`.

## Dependencies

- P-row canon: `/usr/local/bin/summa-predmeta-2` (dsh-pamyat), installed before this consumer. nashi passes one directory and reads one 16-character hex digest from the second output field; the hashing method is preserved. Missing canon, failed calls and empty/malformed digests cause named blindness and exit 2 before manifest checks or writes. Covers `/opt/iskra/plugins/*/` and `/opt/dsh-package-manager/*/package/`, not other roots or semantic package correctness; failures are not retried.
- `stendy/stend-nashi-montazh.py` copies the real installed canon into its private `/usr/local/bin`; use `KANON_BIN` for a candidate. It checks healthy → empty-success → recovery and refuses --save without changing the manifest.
- **dsh-pribory ≥ 3.1.2**: `nashi-dorabotki.sh --check` (§3 coverage) finds `npm-sostav --files` through PATH; the helper needs jq. Install `/usr/local/bin/npm-sostav` BEFORE this consumer, while npm 11 is still active. A missing helper returns 2 with the required dependency named. Parsing failure on npm 11/12 names the directory and reports coverage as unmeasured, code 2. A directory without `package.json` is skipped.
- `stendy/stend-nashi-montazh.py` copies the real `npm-sostav` from PATH into its private `/usr/local`; use `NPM_SOSTAV_BIN` for a candidate.
- Coverage uses `npm pack --ignore-scripts --dry-run --json`: package lifecycle scripts, including prepack/prepare, are not executed. The manual regression `--scenario hooks` requires both fixture hook markers to remain absent. This protects this pack invocation only; it does not audit npm or package contents and does not build missing outputs.
- Manual §3 regression: `sudo python3 test/test_nashi_ohvat.py --helper <npm-sostav candidate> --npm-dir <npm library directory> --output <JSON>`; private mount/net namespaces, no npm PATH shim. Each case has a 120 s limit and temporary fixtures are removed on exit. Covers parsing and coverage only, not npm content correctness or other `--check` sections; the nightly runner does not call this manual test.
- Programs: bash, python3, node, systemctl, journalctl, sudo, `systemd-run` (a scope for every stand), `setpriv` (the stand's account
  in the scope with the same groups), `setfacl` from the acl package (the guest agent's journal), `timeout` (the stand's time limit); `bash-padenie-70` from the package
  **dsh-storozha-mashiny** (drop-in of both units).
- The weekly `stend-needrestart.sh` checks `/opt/iskra/workspace/dorabotki/proverka-needrestart.pl` and the live
  `/etc/needrestart/conf.d/50-agent-services.conf` — they are not in the packages; either missing — BLINDNESS, code 2. Under the key
  `--zhivaya-mashina` it takes the dpkg/apt locks for the run and writes and removes `99-STEND-*.conf` in the live `/etc/needrestart/conf.d`.
- `stendy/stend-vorot-perenosa.sh` checks the installed gates `/usr/local/bin/perenos-v-derevo` (package dsh-montazh), another path — `PERENOS_BIN`.
- The python module `yaml` (PyYAML; OS package `python3-yaml`): the runner reads `/etc/agent-registry/stend-exceptions.yaml` with it. Without the module
  the exceptions file is «не разобран» ("not parsed"), and the outcome of the run is not below 2. 18 stands of the package import it too.
- The run's account (iskra) needs passwordless `sudo -n`: the scope unit of every stand, the `journalctl` judgement after
  the run and the stands of other accounts go through it. Without it С2 goes blind, and the run ends with code 2 (unless there is a reason for 1).
- The directory `/opt/iskra/workspace/tmp-stendov` (iskra:iskra 0750) is created by the installation, not by the package: it is the `TMPDIR` of the gates stand
  `stend-vorot-vypuska.sh` and of `/usr/local/libexec/stend-metki-vorot.sh` (lines `SREDA_STENDOV` of the runner). In the run's unit
  `/tmp` and `/var/tmp` are private, and both stands call separate `systemd-run` services (gates — the runner, probe 6б — the tag watcher)
  that cannot see a private directory. No directory — both stands go blind.
- `/etc/agent-registry/stend-exceptions.yaml` (stand exceptions), the registry and the live items of the stands are not in the package.

## Installation and removal (by root)

Files of `dorabotki/` go to `/opt/iskra/workspace/dorabotki/` with owner `iskra:iskra` and the mode from the table; units and drop-ins go to
`/etc/systemd/system/`, then `systemctl daemon-reload`, `systemctl enable --now vse-stendy-boevye.timer vse-stendy-nedelnye.timer`.

Removing a unit is `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file into a backup (`mv`), `daemon-reload`, `mask`; to bring it back — `unmask` and the file back.

## How the runner drives the stands

Before the run the runner takes the journal of the guest agent's service (the unit name is hard-coded in the runner) since its start into a file of its run: an `mktemp` directory in
`TMPDIR` with mode 711, the file 600 and an ACL granting read to that agent's account (`setfacl`). The first line is the header `#MOST_ZHURNAL_YUNITA <юнит> <старт>`.
The path is given to that agent's stand `stend-cel-mosta.mjs` in the variable `MOST_ZHURNAL_YUNITA` (line `SREDA_STENDOV`). If it could not be taken,
there is no file, and the stand goes blind instead of turning green.

**С1 — a warning before the start, not red.** Before every stand `skaner-zhivoj-mashiny.py` reads its text and looks for commands
that change the live machine: `systemctl` with a changing verb, `useradd` and its kin, writes into `/etc`, dpkg/apt locks, tools with an action
key. A stand of another account is read by that account and fed to the scanner via stdin. Markers in the stand text: `# ZHIVAYA-MASHINA: <what it
changes>` (a manual stand that changes the live machine) and `# ZHIVAYA-MASHINA-NET: <what replaces it>` (does not touch the live machine). The run summary has the lines
«⚠️ С1: <стенд>» with the first findings, «С1 (предупреждение, не красное): …» ("warning, not red"), «NET без проверки С2 (@root): N» ("NET without a С2 check"; a NET declaration of an
@root stand cannot be checked by С2). С1 does not change the run's exit code.

**С2 — detection afterwards, not protection.** Every stand runs in its own `sudo -n systemd-run --scope --unit=obhod-stend-<pid>-<run>-<N>` through
`setpriv` with the same uid, gid, groups and umask; the environment is passed in a 0600 file in the run's working directory (on the command line
everyone would see it). After the run, one `sudo -n journalctl` query over the run window judges the sudo and shadow-utils records of every unit
by the С1 rules. A finding is «🔴 С2: стенд <путь> изменил живую машину» ("stand <path> changed the live machine"). Stopping and resetting its own temporary units (`systemd-run --unit=`
from the same stand) is not a finding. Sight is checked on every run: unit no. 0 calls `sudo -n /usr/bin/true obhod-stend-<pid>-<run>-0`; if its record is missing from the journal
or the scope did not come up — «СЛЕПОТА С2» ("С2 blind"). Since 3.1.9 the query also takes records by `SYSLOG_IDENTIFIER`: when journald
receives a record after the process has exited, it stores it without `_COMM` and `_SYSTEMD_UNIT`. The sight probe is recognised by the run tag;
other such records of the own account and of shadow-utils are counted («записей без привязки к юниту N»), a changing one among them is
«⚠️ С2 БЕЗ ПРИВЯЗКИ» ("С2 without binding"), code 2: the source cannot be named —
a stand of the walk or another process of the same account (an agent service, for instance) that ran inside the run window. The own С2 query of a nested walker (exact full form) is not a finding; any other `journalctl` stays under the scanner rules. С2 does not see the actions of @root stands (everything inside runs as root without its own sudo record, except
shadow-utils), commands inside `sudo bash <скрипт>` and actions in separate units that the stand starts itself (`systemd-run` without
`--scope`).

**Live stands — only with a key** (there are two: `stend-vzaimnogo-nabludeniya.sh` and `stend-needrestart.sh`). `stend-vzaimnogo-nabludeniya.sh` without `--zhivaya-mashina` refuses with the line
«ОТКАЗ-ZHIVAYA-MASHINA», code 2, and touches nothing; with the key it stops the live `agent-watchdog.timer` for a few seconds
(turned off with `BEZ_PORCHI_PREDMETA=1`). Only the weekly run gives the key: `vse-stendy-nedelnye.sh` sets its own `OBLAST_STENDOV`,
`PERECHEN_STENDOV`, `PREDEL_STENDOV` and `SREDA_STENDOV`, and `SREDA_STENDOV` fully replaces the runner's default and gives the key
by name (the tail of the line after `--`). The nightly run and the release gates do not give the key. С2 findings of a stand under the key are printed
with the line «ЖИВОЙ ПО КЛЮЧУ: …» ("live by key") and are not counted as red.

Stands that start temporary units themselves: `stend-reestra-agentov.sh` — `sudo -n systemd-run --unit=b1890s<pid>-<агент>
-p RuntimeDirectory=…` for three guest probes (no `sudo -n` — the probes are skipped); `stendy/stend-razbora-env.sh` (@root) — through
`stend-razbora-env.py`, temporary `systemd-run --wait --pipe`. С2 does not see their actions inside these units by stand.

Runner exit codes: 0 — clean; 3 — only the expected (exceptions are in force); 1 — unexpected: a red or blind stand without
an exception, an expired or unconfirmed exception, the coverage diverged from the list, **a С2 finding** (exceptions do not lift it);
2 — completeness cannot be established: no stands, no list, the exceptions file not read, **С2 blind** (unless there is a reason for 1).

## Stand duration series (3.1.100, B-N-2105)

The nightly unit sets, by the drop-in `70-ryad-stendov.conf`, `VSE_STENDY_RYAD=/var/lib/vse-stendy-boevye/ryad.tsv` (`StateDirectory`, 0700, iskra);
only a run with the run id from the nightly wrapper and without `PAKET_IMYA` writes (the gate takes the unit environment but does not write). The runner appends a line per
stand right after it — a killed run keeps the lines written before the cut. Fields: night, run, path, account, seconds, code, the stand
limit of that night, backup_running, load1 at start, iowait % over the stand. After the run the wrapper calls
`dorabotki/sud-ryada-stendov.py` (thresholds and what it does not catch — in its header) and sends the signal by its own send. The reader is
the coordinator via `chitatel-obhoda`; the action on a signal is a task to the stand owner "speed it up or justify the limit", not a
default PREDEL raise. Regression: `python3 -B test/test_ryad_stendov.py` (sudo only for the fixtures' own scopes, as `test_night_abort.py`).

## Check

The checksum of every package file = the checksum in live (`sha256sum`), modes = the table (`stat -c '%a %U:%G'`); the outcome of the run — the reader `chitatel-obhoda`.

## SMV fixtures and backup samples (3.1.70, B-N-2065)

The four `stend-smontirovat-vypusk-*` stands and `smv-atomic-probe.py` share `smv_fixture.py`.
It creates a private owner registry, copy-checker configuration, state, lock, backups and npm cache.
The source is cloned through its owner's upload-pack; only that clone's release tag is pinned
to the historical commit under test (the current tag may have a different tree).
Only `R` changes in a private copy of the real installer; `binding.json` records both hashes.
Admission and copy verification remain real. Production source, registry, windows and copies stay untouched.
Git calls are limited to 20s; installer runs to 90s plus 5s before SIGKILL; the outer stand limit is 120s.
These cover named branches, not direct file changes bypassing the installer.

`proba-kopij.sh` selects a regular sample from the current NUL-delimited backup inventory
(or the `--koren` copy). Empty/failed enumeration, a vanished/changed sample, or failure to run
the account probe means blindness, without retry or a green skip. Sample contents are not printed.
Only EACCES/EPERM prove the expected read denial. The general readable-file scan and the other
permission/legitimate-reader checks remain. This does not cover access between nightly runs,
new backup locations outside the listed roots, or reads through sudo.

Manual candidate regression: `sudo python3 -B test/test_b_n_2065.py --source-bundle <bundle-with-master-and-tags>`.
It uses private mount/net namespaces and real temporary filesystem permissions; only the
private probe's service User/LoadState responses are doubles. Host services are unchanged.

### B-N-2063: shared registry check

The normal watcher and narrow pravki-mimo stand call `libexec/sadik-watch-pravka.sh`. The stand reads the real channel/group function definitions without executing the watcher main, machine snapshot or owner helper. Its registry, state and channels are private. All nine checks and `_UID=0` filtering remain. The helper is installed as `/usr/local/libexec/sadik-watch-pravka.sh`, 0644 root:root, in derevo.files before the caller/stand. The source itself performs no IO. Run `python3 packages/dsh-obhod-stendov/test/test_pravki_isolation.py` from the tree with sudo available for A1–A4. This checks the real caller with isolated machine IO, never live delivery. The check does not cover agents.yaml, root forgery or semantic correctness of an accepted pravka.

Autopilot 0.1.1: register `dsh-autopilot/test/stend-dsh-autopilot.sh` as one explicit `@root /opt/iskra/app` file with a 600s per-stand timeout (the wrapper has 480s internally). Enable the scope/list pair when the final accepted Autopilot 0.1.1 head is merged into Iskra's working-tree master and the wrapper at that canonical path matches the accepted hash. Installing `/opt/autopilot/packages/...` does not create this working-tree file; the walk can be enabled before that installation window. `vse-stendy-boevye.sh --predel-stenda <full path>` only queries the existing timeout table. Manual integration: `sudo -n env AP_STEND_SOURCE=<accepted 0.1.1 package> AP_ROUTE_EVIDENCE=<fresh directory> python3 -B test/test_autopilot_route.py`; actual walker/wrapper, isolated mounts/network, real root/ordinary UIDs, mutations and recovery.

Run the same file with `NightlyRoute` and a separate fresh `AP_ROUTE_EVIDENCE` to check the AP-only nightly selection without `PAKET_IMYA`. With no arguments, only `AutopilotRoute` runs (six phases); the two manual runs must not share their evidence directory.

Package selection also accepts a sole explicitly addressed stand at package root or in `test/`, without running it twice; coverage includes the exact file. `test/test_autopilot_gate.py` exercises the full unchanged gate against a private DEREVO registry/journal and creates only a local fixture tag.

### Night accounting 3.1.109 — candidate for the combined0.1.10 window

The existing root nightly dispatcher calls `test/stend-ap-accounting.py`; chitatel-obhoda consumes verdicts and STEND-AP-METRIC rows survive exit0. One pass30s, subprocess3s, ≤128units, environ1MiB/config256KiB, no retries/state/restarts/cleanup.

Queue: sqlite3 -readonly on /var/lib/autopilot-mail/mail.sqlite inside a read-only filesystem namespace, so SQLite cannot create WAL-shm. One read transaction aggregates COUNT/MIN/MAX accepted_at; yellow at COUNT>=64. A missing table is no subject, not zero; a missing DB gives blindness2; an existing empty table yields COUNT0/NULL bounds. Bad schema/timestamps, read failures or inode replacement give blindness2. Missing required shm gives blindness2 rather than a write; immutable=1 is not used and WAL is not ignored.

Providers: inspect every live openai coder-gateway using MainPID/environ CODEX_HOME and process-root config.toml. Any top-level model_provider, model_providers table or model_provider in any profiles.<name> table gives yellow with unit/path; config/env values are never printed. Missing config uses defaults. Recheck PID/starttime/environ/parent identity/config, including excluded non-openai processes. Eleven Codex gateways are expected; incomplete coverage gives blindness2. Every profile in this file is checked, including unselected profiles because a launch flag can select them. Launch flags, provider environment variables, overrides in other files and account/read RPC are outside scope.

Account maps follow Beta07207242: root0644 /var/lib/autopilot-usage/codex-account-map.json, exact schemaVersion1/accounts with1–2 digest→codex-3/4 entries. Compare with tokens.account_id→SHA256UTF8 from /etc/claude-oauth/codex-podpiska-{3,4}/auth.json. No ID/token/email/digest is printed or stored. Bound map64KiB/auth1MiB each; root-owned regular single-link files, no writable group/other or unsafe parent, no-follow and before/after stat guards across all three files. Mismatch, incomplete map or identical account IDs in both slots give yellow «карта устарела». Missing/unsafe/invalid/changed input gives blindness2. Tests use synthetic auth in private namespaces, never live credentials. This is an observer, not the AP issuer or an installation.

The metric is named exactly «принятые за 24 ч заявки, сейчас конечные UNBOUND (по причинам)» (requests accepted within 24 hours that are currently terminal UNBOUND, by reason). It scans every trusted root status in /var/lib/autopilot-usage/registrations independently of SQLite. Count requests with `now-86400 < acceptedAt <= now` that are **currently** state=UNBOUND and terminal=true, grouped by exact reason. Start N=8 per reason; yellow strictly above8. The row explicitly says acceptedAt: a request accepted more than24h ago but becoming terminal today is excluded. checkedAt is not the window timestamp; the coordinator chose this definition at05:24:50.

The actual pinned Beta07207242 prune_terminal was checked before enabling green: it deletes terminal queue rows without an age minimum on a successful postal sweep (configured60s), or a new init, but retains root JSON tombstones. An isolated copy test retained1-second and2-day-old files byte-for-byte after removing their SQL rows. No age cleanup of tombstones exists in the reviewed callers. Manual root deletion or a new external cleaner remains outside that proof; changing the deployed owner/cleanup contract requires repeating it.

Code/import of Beta's copy confirms a retry cutoff of180s from acceptance, rounding `2*(60+1)+15+35=172` up to60s. This is not a live latency measurement or completion SLA under infrastructure failure. Limits:4096statuses,16KiB each/32MiB total,128reasons, the same30s overall deadline, no retry/state. Exact schema1, safe root paths/files and all UTC timestamp forms are checked; pending requires a known pending reason and UTC retryUntil>=acceptedAt, not a hardcoded180s observer condition; every file and the directory set are rechecked. Invalid/missing/changed input or exceeded budget gives blindness2. An existing empty directory gives measured0/0 existing files, which alone does not attest a complete day of history; a missing directory gives blindness2. Pending/REGISTERED/out-of-window requests are excluded. The denominator counts existing root statuses in the window, not all accepted queue requests; a queued request without its first JSON status is absent from that denominator. All four rows now determine exit0/1/2; no permanent draft blindness remains. Candidate only: external review and the combined0.1.10 installation afterAP0.1.9 are required.

The deterministic writer25d8 fixture also has a literal SHA256 pin for usage-limits.json from approved25d80920. Updating both fixture and SOURCE no longer bypasses the check. Moving an external donor HEAD while leaving the fixture unchanged is outside this package test; the author separately audits donor HEAD/blob before handoff.

Forms were compared with Beta07207242/32ae983c pinned WIRE: queue epoch-seconds, exact UTF-8 account_id without trimming, a one-slot map cannot pass both-slot coverage. Read original root JSON, not the public projection dropping terminal. Legacy statuses without terminal/retryUntil give blindness2. This order covers default contract paths; custom profile mailDatabase and --index require a separately registered scope.


### AP0.1.9 G without a policy sidecar

The two G stands recognize only the shipped3.1.6 producer bytes pinned to SHA256 a8183a3530a3a37453aff2d8c641842436df5951ef4e3c4eb70686ffa2f7547c. That writer neither imports nor creates usage-limits.json. Its limit is derived from its actual inline guard, with no generic128MiB fallback. Another build missing its JSON remains blind; an unexpected sidecar next to the pinned legacy build also reports a mixed layout. Other policy-free legacy builds are outside this pin.

Legacy G is created lazily on its first descriptor request, so a missing journal is neutral. Existing legacy size/safety thresholds remain. The live contract still compares the inline cap with AP G_WRITER_LIMIT; only the absent prepareGatewayUsage initializer is labelled not applicable, never56/56. JSON schema1/schema3 checks remain intact. The simplified R cursor does not remove the segmented G reader's policy dependency: Gamma5e9b2b7a still uses usage-limits.json/policyCli when gatewayTransport is configured. Flat legacy G and the R cursor do not need that G-sidecar; usage-runtime-policy.json is a separate R policy.
