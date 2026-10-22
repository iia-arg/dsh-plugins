# dsh-pamyat-obsluzhivanie

**Version:** 3.1.5

## Purpose

A maintenance service for the memory of the agents on a machine. It is not a dsh plugin: it is a set of Python modules plus systemd units. Once a day a timer starts `src/runner.py --run` under the `omega` account. The runner goes through the stages in order: a count of the agents' local memory, transfer of lessons from `UROKI-*.md` files into the agent's local memory and into OMEGA, cleanup of text in old local records (dry by default), a judge for pairs of OMEGA records, and a lesson integrity check. The result goes out as one summary line via `agent-alert`. The judge only proposes `same` / `complementary` / `contradiction` verdicts and never deletes or merges records. `heartbeat.py` lets an external watchdog check that the run took place.

## What gets installed and where

Package files (the `files` field of `package.json`: `src`, `test`, `systemd`, `docs`, `README.md`, `CHANGELOG.md`; npm puts `package.json` and `LICENSE` into the archive even without the list):

| File | What it does |
|---|---|
| `src/runner.py` | Entry point (`bin` in `package.json`). Modes `--run` and `--heartbeat`, option `--state-dir`. Runs each stage in its own process with its own time limit. Writes the report and `latest.json`, sends the summary |
| `src/memory_count.py`, `src/memory_count.mjs` | Stage 1, memory count. For each database `<home>/pamyat/pamyat.db` it starts a separate `/usr/local/bin/node` process that calls the `dsh-pamyat-core` counter |
| `src/lessons.py`, `src/local_lessons.mjs`, `src/lessons_store.py` | Stage 2, lessons. Local memory is written through the core, OMEGA through the `SQLiteStore` shipped with OMEGA. `lessons_store.integrity` holds the integrity check that runs after the stages |
| `src/chistka.py` | Stage 3, cleanup: erases the text of old local records that are already in OMEGA. The manual `vernut` command restores text from a backup |
| `src/judge.py` | Stage 4, the OMEGA pair judge. The module has no command line of its own |
| `src/prosmotreno.py` | A human's manual "pair reviewed" mark for pairs with a secret sign and for oversized pairs |
| `src/svyazat_zadnim.py` | One-off manual pass A-N-1731: backfills the `svyaz_omega` link for lessons that reached OMEGA earlier |
| `src/heartbeat.py`, `src/prepare_key.py` | Helpers for root. They use only the standard library and run from separate root copies |
| `systemd/dsh-pamyat-obsluzhivanie.service`, `systemd/dsh-pamyat-obsluzhivanie.timer` | Service and timer units |
| `test/` | Bench `stend-obsluzhivaniya.mjs`, `test_*.py` tests, helpers `fixture.py` and `fixtures/v1-store.py`, root probes `security-root.py` and `proba-root-paths.sh` |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |

Where these end up on the machine:

| What | Where |
|---|---|
| The whole package | `/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie`. The runner is started from here: `OBSL_RUNNER` in the machine drop-in sets the path |
| Root copies of `src/heartbeat.py` and `src/prepare_key.py` | `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, files 0644). The unit names this path (`ExecStartPre`/`ExecStopPost`). The external watchdog calls `heartbeat.py` from here too |
| Units from `systemd/` | `/usr/local/lib/systemd/system/` |
| Machine drop-ins (not part of the package) | `/etc/systemd/system/dsh-pamyat-obsluzhivanie.service.d/`: `20-ferma.conf` (machine data), `40-ort-telemetriya-vykl.conf` (`ORT_DISABLE_TELEMETRY=1`), `agent-alert.conf` (`SupplementaryGroups=agent-button`) |
| State directory | `/var/lib/dsh-pamyat-obsluzhivanie` (`StateDirectory`, 0700). It holds `run.lock`, `latest.json`, `runs/<run_id>*.json`, `lessons.json`, `chistka.json` (if created), `chistka/` (backups), `judge/` (`state.json`, `prosmotreno.json`, `lock`, `reports/`, `vydacha-<day>.json`) |
| Model key for the duration of a run | `/run/dsh-pamyat-obsluzhivanie-key/deepseek` (directory `root:omega` 0750, file 0440). `prepare_key.py remove` deletes it after the run |
| Lesson writer lock | `uroki-exact-writer.lock` next to the OMEGA database `/var/lib/omega/.omega/omega.db` |

## Installation

The package is published to npm as `dsh-pamyat-obsluzhivanie`, like every package with a `package.json`; until then it is installed from the local shelf as described below. The license is MIT, Aleksandr Argelander: the `license` field in `package.json` and the `LICENSE` file. `/opt/agent-plugins/package.json` lists it as `file:../agent-plugins-tarbally/dsh-pamyat-obsluzhivanie-<version>.tgz`, and npm installs it into `/opt/agent-plugins/node_modules/` according to `/opt/agent-plugins/package-lock.json`. The version comes from the package's `package.json` and the lock entry. The only npm script in the package is `test`, so npm runs nothing during installation, and the units and root copies are installed separately, by hand:

1. Copy `src/heartbeat.py` and `src/prepare_key.py` to `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, 0644). Only root can write to this directory.
2. Copy `systemd/dsh-pamyat-obsluzhivanie.service` and `.timer` to `/usr/local/lib/systemd/system/`.
3. Add a machine drop-in with `Environment=AGENTS_REGISTRY=…`, `OBSL_KLYUCH_HOME=…`, `OBSL_KLYUCH_HRANILISHCHE=…`, `OBSL_RUNNER=<path to src/runner.py>` and service access to the `agent-alert` spool (on sadik — `SupplementaryGroups=agent-button`). The alert bot token is not given to the service (no `LoadCredential`): `agent-alert` running as `omega` cannot read the token and drops the alert into the spool; the root sender delivers it (the `agent-alert` client path, B-N-2055).
4. Run `systemctl daemon-reload` and enable the timer (`systemctl enable --now dsh-pamyat-obsluzhivanie.timer`).

How the units are set up on the machine (per `systemctl cat`):

- `dsh-pamyat-obsluzhivanie.service` — `static`, `Type=oneshot`, `User=omega`, `Group=omega`.
  - `ExecStartPre=+/usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/prepare_key.py prepare`; `ExecStopPost=+… prepare_key.py remove`. Both run as root.
  - `ExecStart=/opt/omega/venv/bin/python3 -B ${OBSL_RUNNER} --run`. `OBSL_RUNNER=/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/runner.py` comes from `20-ferma.conf`.
  - The unit sets `DEEPSEEK_CREDENTIAL_FILE=/run/dsh-pamyat-obsluzhivanie-key/deepseek`, `HOME=/var/lib/omega`, `OMEGA_HOME=/var/lib/omega/.omega`, `OMEGA_EMBEDDING_*` (model `bge-m3`, dimension 1024), `HF_HUB_OFFLINE=1`, `OMEGA_RERANKER_AUTODOWNLOAD=0`, `PYTHONDONTWRITEBYTECODE=1`, `OPENBLAS_NUM_THREADS=1`.
  - Limits and hardening: `TimeoutStartSec=60min`, `TimeoutStopSec=90s`, `MemoryMax=4G`, `Nice=10`, `KillMode=control-group`, `Restart=no`, `UMask=0077`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `StateDirectoryMode=0700`.
  - The file `/usr/local/lib/systemd/system/dsh-pamyat-obsluzhivanie.service` is byte-identical to `systemd/dsh-pamyat-obsluzhivanie.service`. Machine data comes only from drop-ins.
- `dsh-pamyat-obsluzhivanie.timer` — `enabled`, `OnCalendar=*-*-* 04:00:00 Europe/Moscow`, `Persistent=true`, `AccuracySec=1min`, `WantedBy=timers.target`. Identical to `systemd/dsh-pamyat-obsluzhivanie.timer`.

The only way to stop the service is to mask the timer: `systemctl mask dsh-pamyat-obsluzhivanie.timer`. With a mask, `prepare_key.py` does not prepare the key, and the runner ends the run with status `disabled` and sends no message. `heartbeat.py` reports a mask older than 3 days as red.

## Configuration

Environment variables the code reads:

| Name | Read by | Default in code | If unset |
|---|---|---|---|
| `AGENTS_REGISTRY` | `lessons.py` (`REGISTRY`), and through it `runner.py`, `chistka.py`, `svyazat_zadnim.py` | none | refusal `registry_not_set` before the count stage: the run ends with status `error` and no other stage runs |
| `DEEPSEEK_CREDENTIAL_FILE` | `judge.DeepSeek` | none (the unit sets a path under `/run/dsh-pamyat-obsluzhivanie-key/`) | `KeyError` on the first model call. File format: one line of at most 4096 bytes, no NUL |
| `OBSL_KLYUCH_HOME` | `prepare_key.py` | none; must be an absolute path | `credential_source_not_set`, no key is prepared. `GNUPGHOME` = `<OBSL_KLYUCH_HOME>/.gnupg` |
| `OBSL_KLYUCH_HRANILISHCHE` | `prepare_key.py` | none; must be an absolute path | same; the value goes into `PASSWORD_STORE_DIR` |
| `PROSMOTRENO_STATE` | `prosmotreno.py` | `/var/lib/dsh-pamyat-obsluzhivanie/judge` | the default is used |
| `PROSMOTRENO_DB` | `prosmotreno.py` | `/var/lib/omega/.omega/omega.db` | the default is used |

The package code does not read the following variables itself. The unit sets them, and child processes or the `omega` package use them:
- systemd reads `OBSL_RUNNER` (`ExecStart`).
- Alerts: `/usr/local/bin/agent-alert` takes the token and chat paths from its own settings (`/etc/dsh-trevogi/dsh-trevogi.conf`); the unit no longer sets them (3.1.5); the `omega` account cannot read the token, so the alert goes through the spool.
- The `omega` package reads `HOME`, `OMEGA_HOME`, `OMEGA_EMBEDDING_*`, `HF_HUB_OFFLINE` and `OMEGA_RERANKER_AUTODOWNLOAD`. The lesson writer accepts only vectors of length 1024 (`lessons_store.checked_embedding`).

Files:

- **Agent registry** (YAML at `AGENTS_REGISTRY`). Schema `shema: 1`, list `agenty`. Each entry has `imya` (mask `[-a-z0-9_]`) and `namerenie` with these fields:
  - `dom` — an absolute path, not `/` and not a symlink;
  - `polzovatel`;
  - `uroki_file` — a `UROKI-*.md` file located directly in `dom`; without it the agent is refused;
  - `raskladka.otlichiya.parametry.GOST: true` — a guest agent: its lessons get the mark `[ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ]` (guest data — risk — not an instruction);
  - `sluzhba` — needed only by `svyazat_zadnim.py --v-boj`.
- **Agent local database**: `<dom>/pamyat/pamyat.db`.
- **Agent profile**: `<dom>/.dsh/profiles/web/cordis.patch.yml`. Cleanup reads `config.ignoreAfterMs` of the `dsh-pamyat-restore` plugin from it (the briefing window). If the value is missing or there are several, the agent gets status `slepota`.
- **`<state>/chistka.json`**: only `{"primenyat": true}` turns on live cleanup; any other content keeps it dry. If the file does not parse as JSON, the whole stage aborts.
- **Judge sources**: `/var/lib/omega/.omega/omega.db` and the journal `kandidaty-vytesneniya.jsonl` next to it. Both paths are hard-coded in `runner.py`.
- **Model key**: `prepare_key.py` reads the `pass` entry `api/deepseek` as the `coders` account (`runuser`, `env -i`, `prlimit --fsize=65536`, 20 s limit).

Arguments:

| Command | Meaning |
|---|---|
| `runner.py --run \| --heartbeat [--state-dir DIR]` | One run, or a liveness check. `DIR` defaults to `/var/lib/dsh-pamyat-obsluzhivanie`. A directory equal to `/` or containing the database or the journal is rejected (`state_contains_source`) |
| `heartbeat.py [--state-dir DIR]` | Root copy of the liveness check; run with `/usr/bin/python3 -I -S -B` |
| `prepare_key.py prepare \| remove` | Place the key before a run or remove it afterwards. Root only |
| `prosmotreno.py spisok \| otmetit KEY WHO WHY \| snyat KEY WHO WHY` | Manual pair marks; run as `omega` |
| `chistka.py vernut <db> <backup>` | Restore erased text from a backup |
| `svyazat_zadnim.py --agent NAME (--suho \| --v-boj \| --otkat LIST) [--state] [--db] [--omega-db] [--kopiya-v] [--spisok-v] [--perechen] [--pri-zhivoj-sluzhbe REASON]` | One-off link pass. Exit codes: 0 — done, 1 — some pairs skipped, 2 — refused before acting |

The limits are hard-coded. They can be changed only by editing the code; the full list is in `docs/SETTINGS.md`.

| Stage and file | Limits |
|---|---|
| Memory count (`memory_count.py`) | 5 s per database, 60 s per stage |
| Lessons (`lessons.py`) | `MAX_NEW` 400 blocks per pass, `MAX_FILE` 8 MiB per lesson file, 900 s per stage |
| Cleanup (`chistka.py`) | `POROG`: the latest 1000 records with text are never touched; `PREDEL`: 500 erasures per pass per agent; `KEEP`: 3 backups per agent; 900 s per stage |
| Judge (`judge.py`) | `MAX_CALLS` 500 model calls per UTC day; `MAX_INPUT_BYTES` 16000; `MAX_OUTPUT_TOKENS` 512; `MODEL` `deepseek-flash`; journal pairs: distance ≤ `V1_MAX_DIST` 0.10; vector neighbours: up to 8 per record with similarity ≥ `SOSED_MIN_SIM` 0.92; `NEDELYA_DNEJ` 7; `SBOI_NOCHEJ` 3; 1800 s per stage |
| Summary (`runner.py`) | `OSHIBOK_MODELI_DOLYA` 0.10: at this share of failed model calls the run is `error` rather than `finding` |
| Heartbeat (`heartbeat.py`) | `MASK_LIMIT_DAYS` 3; run window 01:00–02:05 UTC |

## Verification

`npm test` runs `node test/stend-obsluzhivaniya.mjs`. The bench:

1. checks `/opt/omega/venv/bin/python3 -B -c 'import numpy, sqlite_vec'` (10 s limit);
2. runs `/opt/omega/venv/bin/python3 -B -m unittest discover -s test -p 'test_*.py' -v` with `PYTHONDONTWRITEBYTECODE=1` and `OPENBLAS_NUM_THREADS=1` (110 s limit).

Bench exit codes:

| Code | Meaning |
|---|---|
| 0 | all tests passed |
| 1 | a test failed or the bench failed to run, including hitting the 110 s limit |
| 2 | СЛЕПОТА (blindness): OMEGA Python, `numpy` or `sqlite_vec` missing |

The Python tests can also run without npm, using the same `unittest discover` command with `/opt/omega/venv/bin/python3 -B`. `test/` holds 19 `test_*.py` files with 142 `test_*` methods (counted in the code). The model, delivery, databases and keys are stubs in the tests. Notes:

- The memory count and `local_lessons` tests need the `dsh-pamyat-core` core, resolvable by Node by package name. The package does not declare it as a dependency, so outside a shared `node_modules` (for example, in the working tree) these tests do not pass. Details: `docs/TROUBLESHOOTING.md`.
- The mask test in `test_runner.py` needs `systemctl` on the host.
- The bench does not run `test/security-root.py` or `test/proba-root-paths.sh`. They need root and a separate mount namespace: `proba-root-paths.sh <package dir> <evidence dir>` must be started through `unshare --mount --net`; otherwise it refuses with exit 2.

On-machine checks, read-only:

- `sudo /usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py` (or `runner.py --heartbeat`). Exit codes:
  - 0 — the run completed and the summary was delivered, a run is in progress within its limit, or the timer has been masked for less than 3 days;
  - 1 — red: the mask is older than the limit, the run is overdue or missing, the status is not `ok`/`finding`, or delivery is not `accepted`;
  - 2 — not measured.
- `runner.py --run` exit codes:
  - 0 — `ok`, `finding` or `disabled`;
  - 1 — `error` or `timeout`;
  - 2 — the delivery outcome of the summary, the weekly listing or the "lessons without link" line is unknown;
  - 3 — `busy`, another run holds the lock.
- Where to read the result: `/var/lib/dsh-pamyat-obsluzhivanie/latest.json` (fields `status` and `delivery`) and `journalctl -u dsh-pamyat-obsluzhivanie.service`.
- Root copies against the package: `cmp /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py /opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/heartbeat.py`, and the same for `prepare_key.py`.

## Limitations

- The judge only proposes: verdicts are not applied, and records are not merged or deleted. The meaning of a verdict is not checked, only the shape of the answer.
- The judge does not catch:
  - secrets without a recognisable prefix: the `SECRET` filter is limited, and such texts go to the model;
  - pairs across roots;
  - pairs beyond 8 neighbours or with similarity below 0.92;
  - journal rows with distance above 0.10;
  - records without vectors: they are only counted.
- The 0.10 and 0.92 thresholds cut far pairs blindly: the share of contradictions among the cut pairs has not been measured.
- Pairs with a secret sign and pairs over 16000 bytes are never sent to the model. They wait for a human mark through `prosmotreno.py`.
- A mask does not cancel model requests already sent and does not return their reservation in the daily limit.
- Summary delivery is tried once. Exit 0 from `agent-alert` only means the channel accepted the call, not that anyone read the summary.
- The memory count checks the shape of the core's numbers, not their meaning. It does not see database changes after the transaction snapshot.
- The lessons stage does not catch:
  - a lesson file edit that changed neither size nor `mtime_ns`;
  - an edit made after the pass: the next pass sees it as `source_rewritten`.
- OMEGA writers that do not take `uroki-exact-writer.lock` can create a duplicate. `integrity` finds only duplicates with the same `source_key` and does not merge them.
- Cleanup does not catch:
  - deletion of a record in OMEGA after its text was erased: the text then survives only in a backup, and only the latest 3 backups per agent are kept;
  - a change of meaning in OMEGA under the same node.
- The state directory is never rotated.
- The 01:00–02:05 UTC window in `heartbeat.py` is literal numbers and is not checked against the timer's `OnCalendar`.
- Paths are hard-coded in the code and the unit for this machine's layout:
  - `/opt/omega/venv/bin/python3`, `/var/lib/omega/.omega/omega.db`, `/var/lib/dsh-pamyat-obsluzhivanie`;
  - `/usr/local/bin/node`, `/usr/local/bin/agent-alert`, `/usr/local/lib/dsh-pamyat-obsluzhivanie/`;
  - the `omega` and `coders` accounts, the `pass` entry `api/deepseek`;
  - the URL `https://api.deepseek.com/chat/completions`.
- Dependencies:
  - systemd;
  - the system `/usr/bin/python3`, standard library only (root helpers);
  - the OMEGA Python 3.12+ env with `numpy`, `sqlite_vec`, `PyYAML` and the `omega` package. The lesson writer compares the sha256 of OMEGA's shipped `_store.py` with a pinned value (`REVIEW_STORE_SHA`) and refuses on a mismatch (`omega_store_hash_mismatch`);
  - Node with `node:sqlite`, and the `dsh-pamyat-core` core in the same `node_modules`. For cleanup the core must create the `zapisi.vychishcheno` field;
  - `agent-alert`, `pass` and `gpg` for the `coders` account, a DeepSeek API key, network access to the API.

Python 3.12 is the minimum version for this release: judge.py uses the new f-string grammar. Before installation, check the version of the OMEGA venv interpreter itself, on a copy.

The V1 journal next to omega.db is a mandatory prerequisite. It is written by the local record_supersession_candidate patch in the OMEGA store (not this package); without it an ordinary installation may not create kandidaty-vytesneniya.jsonl. Absence/corruption means error:journal with 0 model calls, not an empty queue. The writer setup is agreed by the owner of the OMEGA deployment; creating an empty journal just to get green is not allowed.

The fixture test/fixtures/v1-store.py is the exact pinned revision of _store.py c587490f…; test_store_fixture.py checks that it matches REVIEW_STORE_SHA and that Writer refuses, before opening the DB, when the imported module has a different sum. OMEGA code keeps its upstream license (fixtures/LICENSE-OMEGA.txt); the package's own code is MIT.

The current mask of the nightly timer stays in place: installing this release does not permit removing it or starting a manual live run. Such a change of mode needs a separate direct instruction from the owner; the stands use copies, with model networking turned off.
