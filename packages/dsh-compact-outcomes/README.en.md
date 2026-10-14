Russian version: [README.md](README.md) · English below

# dsh-compact-outcomes

**Version:** 3.1.3

## Purpose

Observer of conversation compaction outcomes for Codex coders (Alfa's plugin). The sensor `turn-sensor.mjs` runs inside the DSH platform for three Codex coders (their names are hard-coded, see “Limitations”) and on each `turn/end` writes a line with a token measurement. The service `dsh-compact-outcomes.service` runs `collector.py` once a minute. It compares adjacent turns (`turn_watch.py`) and, via `agent-alert`, sends the alert «признак „сжал Codex“» (“sign: ‘Codex compacted’”) if the token count dropped without a DSH compaction event. For Codex agents without a sensor, the service reads `codex_compacted` events from the gateway log extract file. In addition, `collector.py` with `observer.py` kept a seven-day count of confirmed compactions («наша сводка выжила» (“our summary survived”) / «Codex опередил» (“Codex got ahead”) / «причина не установлена» (“cause not established”)) with daily and weekly reports in `a2a/out`.

## What is installed and where

All sha256 sums of the package match the live files on the production machine; modes and owners match the registry (checked 08.10.2026). The plugin directory `/opt/coders/alfa/plugins/dsh-compact-outcomes/` is `0750 coders:coders`.

| file in package | path on machine | mode, owner | what it is |
|---|---|---|---|
| `plugin/collector.py` | `/opt/coders/alfa/plugins/dsh-compact-outcomes/collector.py` | 0640 coders:coders | service entry point: turn monitor, then the weekly count and reports |
| `plugin/observer.py` | `…/dsh-compact-outcomes/observer.py` | 0640 coders:coders | compaction classifier (imported by `collector.py`), read-only |
| `plugin/turn_watch.py` | `…/dsh-compact-outcomes/turn_watch.py` | 0644 coders:coders | monitor of sensor logs and gateway extract files, `agent-alert` alert queue |
| `plugin/turn-sensor.mjs` | `…/dsh-compact-outcomes/turn-sensor.mjs` | 0644 coders:coders | DSH plugin (`name: dsh-compact-outcomes-turns`): end-of-turn sensor |
| `plugin/agents.json` | `…/dsh-compact-outcomes/agents.json` | 0640 coders:coders | `collector.py --config` settings: coder paths and gateways without a sensor |
| `plugin/test_observer.py` | `…/dsh-compact-outcomes/test_observer.py` | 0640 coders:coders | tests of `observer.py` and `collector.py` |
| `plugin/test_turn_watch.py` | `…/dsh-compact-outcomes/test_turn_watch.py` | 0644 coders:coders | tests of `turn_watch.py` |
| `plugin/test_turn_sensor.mjs` | `…/dsh-compact-outcomes/test_turn_sensor.mjs` | 0644 coders:coders | sensor test with a stub context |
| `plugin/test_turn_sensor_sobytiya.mjs` | `…/dsh-compact-outcomes/test_turn_sensor_sobytiya.mjs` | 0644 coders:coders | sensor test bench with the real `dsh-pamyat-core` core |
| `plugin/mutation_probe.py` | `…/dsh-compact-outcomes/mutation_probe.py` | 0640 coders:coders | classifier mutation probe |
| `plugin/README.md` | `…/dsh-compact-outcomes/README.md` | 0640 coders:coders | the author's plugin README (history of candidate A-N-675) |
| `systemd/dsh-compact-outcomes.service` | `/etc/systemd/system/dsh-compact-outcomes.service` | 0644 root:root | oneshot under `coders`, sandbox `ProtectSystem=strict` |
| `systemd/dsh-compact-outcomes.service.d/agent-alert.conf` | `/etc/systemd/system/dsh-compact-outcomes.service.d/agent-alert.conf` | 0644 root:root | drop-in: `ReadWritePaths=-/var/log/agent-alert/poslednie.log` (with «-») |
| `systemd/dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` | `/etc/systemd/system/dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` | 0644 root:root | drop-in: `ExecStartPre=-+/usr/local/libexec/codex-compaction-vyborka` for Codex agents without a sensor |
| `systemd/dsh-compact-outcomes.timer` | `/etc/systemd/system/dsh-compact-outcomes.timer` | 0644 root:root | `OnBootSec=2min`, `OnUnitInactiveSec=60s` |

The package root `README.md`, `CHANGELOG.md` and `LICENSE` are not installed on the machine.

Directories and files created by the service (not part of the package):

| path | written by | contents |
|---|---|---|
| `/opt/coders/alfa/pamyat/compact-outcomes/` | `collector.py` | `lock`, `state.json`, `latest.md`, `DONE`, `turn-watch-state.json`, `turn-alerts.jsonl` (+ archives `.1`…`.5`); files 0600 |
| `/opt/coders/alfa/pamyat/compact-outcomes/turns/<агент>.jsonl` | `turn-sensor.mjs` in the agent process | a line per `turn/end`; 8 MiB + 5 archives; directory 0700, files 0600 |
| `/opt/coders/alfa/a2a/out/compact-outcomes-*.md` | `collector.py` | daily and weekly reports (only until `DONE`) |
| `/var/lib/codex-compaction-sobytiya/<агент>.jsonl` | `codex-compaction-vyborka` (package dsh-podpiski), root | `codex_compacted` events from the gateway log, root:coders 0640 |

## Installation

The package is sources without `package.json`, installed by copying (by hand as root; in production via `smontirovat-fajly` through the gates).

1. Plugin directory: `install -d -o coders -g coders -m 0750 /opt/coders/alfa/plugins/dsh-compact-outcomes`.
2. Files `plugin/*`: `install -o coders -g coders -m <режим из таблицы> plugin/<файл> /opt/coders/alfa/plugins/dsh-compact-outcomes/<файл>`.
3. Units: `systemd/dsh-compact-outcomes.{service,timer}` into `/etc/systemd/system/`, both drop-ins into `/etc/systemd/system/dsh-compact-outcomes.service.d/`, `0644 root:root`.
4. `systemctl daemon-reload`, `systemctl enable --now dsh-compact-outcomes.timer`. The service has no `[Install]` (state `static`); only the timer is enabled.
5. The sensor is enabled by the agent profile, not by installing a file. The `compact-outcomes-turns` block under the condition `@@ESLI COMPACT_OUTCOMES@@` in the template `/etc/agent-registry/shablony-raskladki/codex/A.tmpl` sets `name: <дом>/plugins/dsh-compact-outcomes/turn-sensor.mjs` and `config` (see “Settings”). A new profile takes effect after the agent process restart.

Before the first run the following must exist:

- the state directory `/opt/coders/alfa/pamyat/compact-outcomes` and the reports directory `/opt/coders/alfa/a2a/out`, both writable for `coders`. The unit opens them for writing with a `ReadWritePaths=` line without the «-» prefix (line 17) under `ProtectSystem=strict` (line 15) in `systemd/dsh-compact-outcomes.service`. systemd must find a path without «-» at start, otherwise the service will not start. Therefore both directories must be created in advance, even though `collector.py` itself calls `mkdir` for `--state-dir` (`plugin/collector.py`, line 133). `collector.py` does not create the `--outbox` directory: while there is no `DONE`, a run without it fails with `outbox does not exist` (line 149);
- the file `/var/log/agent-alert/poslednie.log` is NOT required since 3.1.1: the drop-in `agent-alert.conf` opens it with «-» (`ReadWritePaths=-…`, line 6). No file — the service still starts, `agent-alert` writes «хвост НЕ записан» ("tail NOT written"), and the alert goes out as before;
- `/usr/local/bin/agent-alert` and `/usr/local/libexec/codex-compaction-vyborka` (package dsh-podpiski).

The `turns/` subdirectory and the files in it are created by the sensor (`mkdirSync` with `recursive`, `plugin/turn-sensor.mjs`, line 7).

## Settings

### `collector.py` arguments (set by the unit's `ExecStart`)

| argument | default | in the unit | meaning |
|---|---|---|---|
| `--config` | required | `…/agents.json` | settings file |
| `--state-dir` | required | `/opt/coders/alfa/pamyat/compact-outcomes` | state, `lock`, `DONE`, alert log |
| `--outbox` | none | `/opt/coders/alfa/a2a/out` | where to put reports; without it no reports are written |
| `--turn-log-dir` | none | `/opt/coders/alfa/pamyat/compact-outcomes/turns` | sensor logs; without it the turn monitor does not run |
| `--alert` | `/usr/local/bin/agent-alert` | — | alert delivery program, text as the first argument |
| `--drop-ratio` | `0.5` | — | a drop counts if `после < до × ratio`; allowed `0 < ratio < 1` |

The unit sets `Environment=PYTHONDONTWRITEBYTECODE=1`, `UMask=0077`, `TimeoutStartSec=90`. The code itself reads no environment variables.

### `agents.json`

| key | read by | meaning |
|---|---|---|
| `agents[].name` | `collector.py`, `turn_watch.py` | only names from the list hard-coded in the code (`collector.py`, `turn_watch.py`), no duplicates; otherwise `ValueError` |
| `agents[].cwd` | `collector.py` | expected `cwd` in the DSH log header (a mismatch is written to problems) |
| `agents[].dsh_dir` | `collector.py` | DSH sessions directory; the newest generation `session[.vN].jsonl.zstd` is read |
| `agents[].codex_dir` | `collector.py` | Codex rollout directory (`*-<uuid>.jsonl`) |
| `agents[].gateway_db` | `collector.py` | gateway SQLite, table `sessions(kluch, sessionId)`, read-only |
| `agents[].memory_db` | `collector.py` | memory SQLite, `zapisi` with `klass='svodka-kompakcii'`, read-only |
| `shlyuzy_bez_datchika[].name` | `turn_watch.py` | `[a-z]+`; must not match an agent from `agents` (otherwise a double alert) |
| `shlyuzy_bez_datchika[].unit` | `turn_watch.py` | `coder-gateway-<имя>.service` or `coder-gateway@<имя>.service` |
| `shlyuzy_bez_datchika[].fajl` | `turn_watch.py` | absolute path of the extract file |

The name and unit for the log extract (root) are set separately, in the drop-in `codex-compaction-vyborka.conf`. A new gateway without a sensor requires editing both the drop-in and `agents.json`.

### Sensor `config` for `turn-sensor.mjs` (in the agent profile)

| key | meaning |
|---|---|
| `agent` | a name from the same hard-coded list; otherwise the plugin throws an error at installation |
| `logDir` | absolute path of the log directory (`…/pamyat/compact-outcomes/turns`) |
| `gatewayDb` | absolute path of the gateway SQLite (`/var/lib/coder-gateway-<имя>/sessii.db`) |
| `appDir` | DSH application directory; `@deepseek-ai/dsh-scope` is taken from it |

The sensor takes the threshold from the response to the event `our/compaction-status` (answered by `dsh-pamyat-kompakt-dsh`): `modelPolicies[provider, model].thresholdRatio` takes precedence over the general `thresholdRatio`. The model window comes from `llm.resolveModelInfo`, wait limit 1000 ms. There must be exactly one response.

### Constants in the code

| constant | value | where |
|---|---|---|
| observation period | 7 days from the first run, then `DONE` | `collector.py` |
| daily report | no earlier than 5 min after the end of the UTC day | `collector.py` |
| input limit | 128 MiB file, 256 MiB after decompression | `collector.py` |
| sensor and alert logs | 8 MiB + 5 archives | `turn_watch.py`, `turn-sensor.mjs` |
| `SVEZHEST` | 600 s: an older extract file is blindness | `turn_watch.py` |
| delivery | ≤ 2 alerts per run, 15 s per call, 3 attempts | `turn_watch.py` |
| `NEDOST_MAX` | 50 undelivered in the summary; beyond that, a «потеряно» (“lost”) count | `turn_watch.py` |

## Verification

The tests do not touch production: they work in temporary directories and send alerts to a stub. The only exception is `test_turn_sensor_sobytiya.mjs`: it loads the live memory core (see below). Run from the `plugin/` directory (or from the installed directory as `coders`). The `-B` flag is needed to avoid creating `__pycache__`.

| command | what it checks | exit code |
|---|---|---|
| `python3 -B -m unittest -v test_observer test_turn_watch` | classifier, collection with the UUID map, reports and `DONE`, drop threshold, «платформа» (“platform”) without an alert, repeat without resending, monitor after `DONE` | 0 — all passed, 1 — there are failures |
| `node test_turn_sensor.mjs` | measuring `totalTokens`, threshold from the general `thresholdRatio` (0.9) in the `our/compaction-status` response and the model window, UUID from SQLite, one line per `turn/end` (a repeat with the same seq is not written), `platform_seq` after `compaction/start`, rotation 8 MiB + 5. The test does not check the `modelPolicies` branch: it is absent from the stub response | 0 — PASS, otherwise an `assert` exception (≠0) |
| `node test_turn_sensor_sobytiya.mjs` | `platform_seq` on DSH 0.1.1 (`events`) and 0.2.0 (`snapshotEvents` via `ctx.pamyat`) forms, the line is written even without a log | 0 — matched, 1 — mismatch, 2 — blindness (the core did not load or it has no `sobytiyaSessii`) |
| `python3 -B mutation_probe.py` | corrupting the summary text moves the event from `ours` to `unknown`, reverting restores it | 0, on failure `AssertionError` (1) |

`test_turn_sensor_sobytiya.mjs` imports the core from `/opt/agent-plugins/node_modules/dsh-pamyat-core` by default. Another path is set by the `DSH_PAMYAT_CORE` variable. The core database is created in a temporary directory. Run `test_observer.py` only via `-m unittest`: a direct `python3 test_observer.py` runs only the `Classification` class (the `unittest.main()` call sits in the middle of the file).

In production:

- `systemctl is-active dsh-compact-outcomes.timer` — health check per the registry. Also look at `systemctl show dsh-compact-outcomes.service -p Result,ExecMainStatus`.
- The sum of each installed file equals the package sum (`sha256sum`), permissions per the table (`stat -c '%a %U:%G'`).
- Each run prints JSON `{"turn_rows_new", "turn_log_problems", "pending_alerts"}` to the service log. While there is no `DONE`, an extra line with `coverage` and `problems` is printed.
- `collector.py` codes: 0 — the run passed (per-agent problems go to `problems`, they do not change the code); 1 — exception (`lock` taken, `unexpected agent`, `agent mismatch`, `turn log exceeds bound`, invalid `shlyuzy_bez_datchika`, the `--outbox` directory does not exist); 2 — argument error.

## Limitations

- The weekly count is one-off. After 7 days `DONE` is written, and `collector.py` no longer classifies or sends reports; the turn monitor keeps running. On the production machine `DONE` has been present since 25.09.2026; only the turn monitor is running now. A new count run happens only by an explicit decision; per the code, a new period requires removing both `DONE` and `state.json`.
- The «сжал Codex» alert on a token drop is a sign, not proof. The alert text says explicitly that `compacted` is not confirmed. If the last seq of `compaction/*` events changed between turns, a «платформа» record is written to `turn-alerts.jsonl` without an alert. Exactly `ratio` (half) does not alert.
- Only adjacent turns (`turn = прежний + 1`) with the same session, `createdAt`, UUID, model and window are compared. A skipped turn, a UUID change or a measurement error breaks the comparison.
- The sensor leaves no line if the process is killed before `turn/end`. Turns before the sensor was connected are not restored retroactively.
- The channel for gateways without a sensor does not catch a compaction that the gateway did not report with `[codex-compaction]`. The first run sets the cursor to the end of the file; history does not alert. A file shorter than the cursor: the cursor goes to the end, the skipped part is not read.
- Blindness (`turn log missing`, extract file unreadable or older than 600 s) gives one alert on entry and one all-clear on exit. Not caught: an incomplete last sensor line, monitor exceptions (the whole run fails), death of the service or timer itself.
- An alert not delivered in 3 attempts goes into the undelivered summary (up to 50, beyond that only a count). A blindness alert does not accumulate: while blindness persists it is raised again. A failure between delivery and saving gives one repeat.
- Only three names are allowed in `agents`, hard-coded in `collector.py`, `turn_watch.py` and `turn-sensor.mjs`. A new agent with a sensor requires a code change.
- The package number is 1.2.2: the `CHANGELOG.md` heading and the tag `dsh-compact-outcomes-v<номер>` (no `package.json`). License: MIT, file `LICENSE`.
- The package is not for publication without separate gates: `agents.json` reveals the coder layout (session paths, `/var/lib/coder-gateway-*`).
- Dependencies: `python3`, `zstd` (decompressing DSH logs), `node` with `node:sqlite` (the sensor and its tests), `@deepseek-ai/dsh-scope` from `appDir`, `dsh-pamyat-kompakt-dsh` (response to `our/compaction-status`), optionally the `pamyat` service from `dsh-pamyat-core` (`sobytiyaSessii`, otherwise `session.events`), `/usr/local/bin/agent-alert`, `/usr/local/libexec/codex-compaction-vyborka` (dsh-podpiski), the `coders` account.
