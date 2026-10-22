# dsh-pamyat-storozha

**Version:** 3.1.8

## Purpose

A cordis plugin for the DSH platform that watches context compaction from inside the agent process and reports it to the service log: a line for every finished compaction (natural, forced, prune without a model, failure), an alarm when the fill crosses stages of the compaction threshold, and a summary with the observed scope, the denominator and what the guard did not see. The package does not interfere with the agent: it does not compact and forbids nothing, it only observes and speaks. Besides the plugin, the package ships fourteen standalone memory maintenance programs in `bin/`; the plugin neither loads nor calls them, and some of them are run by systemd timers on the machine.

## What gets installed and where

### Plugin (`src/`)

- `src/index.js` — entry point (`main`, `exports["."]`). Exports `name`, `inject` (empty), `Config` (settings schema), `apply`, `STOROZHA` (list of guards), `KOLONKI_OPISANIYA`, `dolyaPoroga`.
- `src/vidy-szhatiya.js` — compaction kind from `compaction/end` data (`vidKonca`: `error` — failure, `sourceCommandId` — forced, otherwise natural), call spend (`rashod`), context pressure (`davlenie`: input plus cache, no output), duration (`dlitelnost`), unknown `usage` fields (`neznakomyePolya`).

What `apply(ctx, config)` registers (per the code in `src/index.js`):

- two `ctx.on('session/event', …)` handlers: the first parses `compaction/start`, `/summary`, `/end`, `/prune`; the second keeps the turn count (`turn/start`), the summary cadence (`turn/end`), per-session coverage, the stage reset on `compaction/summary` and `compaction/prune`, and the fill measurement from `event.data.usage` of any event;
- cleanup via `ctx.effect` — removal of the single-mount key and cancellation of pending after-measurement timers on unload;
- no tools, commands, services or timers.

What the plugin reads and writes at run time:

- log: event lines via `ctx.logger.info` (fallback — `console.log`); startup directly to process stdout prefixed with `[dsh-pamyat-storozha <version from package.json>]`;
- external sink: the `komandaStoka` command asynchronously via `/bin/sh -c`, text on stdin; shell timeout 5 s;
- the reported-stages file `$DSH_HOME/storages/storozha-stupeni.json` (or the path in `STOROZHA_STUPENI_FAJL`), written through a temporary file and `rename`;
- the compaction threshold — via `chitatPorogD` from `dsh-pamyat-kompakt/porogi.mjs` (agent name — `KOMPAKT_AGENT`, directory — `KOMPAKT_NASTROJKI_KATALOG`, `dsh-pamyat-kompakt` default — `/etc/dsh-pamyat/agenty`);
- the context window — `session.requestContext().contextWindow`; the route — `session.requestHeader().config` or `requestContext()`.

### Tools and watchers (`bin/`)

- `chitatel-otklonennyh.mjs` — sorts files rejected by the secretary by name prefix and puts a decision `<name>.reshenie.txt` next to each; marks `znanie-*` files as "awaiting a human decision".
- `kompakt-priemka` — read-only acceptance of DSH/Codex compaction: session logs, `pamyat.db`, the service log, and for the `codex` family the outcomes and the gateway.
- `omega-kopiya-watch` — watcher of knowledge copying from `pamyat.db` to OMEGA: no copy, "copying stalled", lifetime, ownerless records, nightly trust count and weekly summary, local patch of the OMEGA distribution, embedding model files.
- `pamyat-vernut-povtor` — returns to the base an article the secretary judged a repeat, as a core record linked "refines k"; renames the file to `*.vozvrashcheno-<id>.txt`.
- `proba-sleda-podyoma.mjs` — mounts six memory packages on the core's cordis and checks that each printed a start-up line.
- `proverka-cepi-boem.mjs` — compares the id and length of the last summary injection in the agent service log with the record in the base.
- `proverka-opory.mjs` — checks whether memory records' anchors exist in session logs (old and `v4`) or with external witnesses; with `--zapisat` stores marks in the base.
- `rasshcheplenie-otmeny-watch` — watches growth of OMEGA records whose `status` is active while `metadata` says "superseded".
- `rubezh-otnoshenij-watch` — reports once that the relations boundary in `pamyat.db` was set correctly; otherwise waits or alarms.
- `session-agent-preset-watch` — reads the first log line of every session of the registry's agents and looks for headers without `agentPreset`.
- `session-writer-watch.py` — alarms when, for a live agent service process, the "already owned by an active write handle" refusal repeats for longer than 5 minutes.
- `sostav-nabora.mjs` — names the composition of the `dsh-pamyat` set by the condition "last accepted and published version" (clone git and the npm registry).
- `stendy-vseh-paketov.sh` — runs `test/stend-*.mjs` of all `dsh-pamyat-*` packages and prints the denominator and classes.
- `sverka-s-istochnikom.mjs` — checks `pamyat.db` records against all supported sources through the read-only `proverka-opory.mjs`, never writes to the base.

Other: `test/` — stands (see "Verification"), `docs/` — `ARCHITECTURE.md`, `BIN.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`; `CHANGELOG.md`, `LICENSE`.

### On the machine

- Production path: `/opt/agent-plugins/node_modules/dsh-pamyat-storozha`, installed from the tarball `/opt/agent-plugins-tarbally/dsh-pamyat-storozha-<version>.tgz` per `/opt/agent-plugins/package.json` and `package-lock.json`.
- An agent profile references it with `"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"` in the profile's `package.json`; the profile's `node_modules` holds a symlink to the production path.
- systemd units that use `bin/`. They call copies of the files in `/usr/local/sbin`, not `node_modules`:

| Unit | Cadence (timer) | ExecStart | User | Success codes |
|---|---|---|---|---|
| `omega-kopiya-watch.service` | `OnCalendar=*:07/10` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/omega-kopiya-watch` (drop-in `60-python-padenie-70.conf`) | root | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch.service` | `OnCalendar=*-*-* *:17:00` | `/usr/local/sbin/rasshcheplenie-otmeny-watch` | root (default) | 0, 2, 3 |
| `rubezh-otnoshenij-watch.service` | `OnCalendar=hourly` | `/usr/local/sbin/rubezh-otnoshenij-watch` | the account of the machine's coordinator agent (`User=` in the unit) | 0 |
| `session-writer-watch.service` | `OnBootSec=60`, `OnUnitInactiveSec=60` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/session-writer-watch.py` (drop-in) | root | 0, 1 |
| `session-agent-preset-watch.service` | `OnCalendar=*-*-* *:00/5:00 UTC` | `/usr/bin/python3 -I -B /usr/local/sbin/session-agent-preset-watch --watch` | root | 0 |

The first four units live in `/etc/systemd/system`, `session-agent-preset-watch` in `/usr/local/lib/systemd/system`. `kompakt-priemka` and `pamyat-vernut-povtor` are copied to `/usr/local/bin` and have no units. The other `bin/` programs are not called by units.

## Installation

The plugin is installed by npm in `/opt/agent-plugins` from the lock file; `/opt/agent-plugins/package.json` lists it as `"dsh-pamyat-storozha": "file:../agent-plugins-tarbally/dsh-pamyat-storozha-<version>.tgz"`. What must be next to it:

- `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` — `peerDependencies`, located in `/opt/agent-plugins/node_modules/@deepseek-ai/`;
- `dsh-pamyat-kompakt` version `^3.1.1` — a mandatory peer: the `porogi.mjs` function is imported at load time. `file:../dsh-pamyat-kompakt` in devDependencies serves the local stands. For a working installation, supply the sibling's archive together with the guard's archive, as well as compatible cordis/schemastery peers. Example of a local installation: `npm install --offline ./dsh-pamyat-kompakt-3.1.2.tgz ./dsh-pamyat-storozha-3.1.6.tgz`; the other peers must already be available locally. `--legacy-peer-deps`/`--force` bypass the dependency check and do not prove a successful import.

Node: the plugin needs Node 18+; the tools and full suite using `node:sqlite` need Node 22.13+ (on Node 22 an ExperimentalWarning is expected; that is not an import failure). Use 22.13+ for the complete package.

Connecting it in a profile: a line in the profile's `package.json` (`"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"`) and an `insert` section in `<agent home>/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-pamyat-storozha
      id: dsh-pamyat-storozha
      config:
        ispolnenieInstrumentov: sdk
        agent: <агент>
        predel: 1000000
        stupeni: [0.85, 0.9]
        komandaStoka: 'agent-alert'
```

The agent service environment must have `DSH_HOME` (agent data directory) and `KOMPAKT_AGENT=<agent>`; on the machine the first is set in the agent unit itself, the second in the drop-in `60-kompakt-agent.conf`, and for two Codex agents by an `Environment=KOMPAKT_AGENT=<agent>` line in the unit itself. The plugin starts when the agent process starts; the sign of connection is the line `подъём: ступени … ОТ ПОРОГА СЖАТИЯ …` ("start-up: stages … FROM THE COMPACTION THRESHOLD …") in the service log, naming the agent and the sink state.

`bin/` watchers: the executables are copied to `/usr/local/sbin` (`omega-kopiya-watch`, `rasshcheplenie-otmeny-watch`, `rubezh-otnoshenij-watch`, `session-writer-watch.py`, `session-agent-preset-watch`) and `/usr/local/bin` (`kompakt-priemka`, `pamyat-vernut-povtor`). These are regular files, not links: updating the package in `node_modules` does not change them, the copy must be updated separately. Each watcher is run by a `<name>.service` (`Type=oneshot`) and `<name>.timer` pair; private values come from `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`. The other `bin/` programs are run by path, manually or from gates.

Limits of `session-writer-watch.service` (A-N-1963 №11): drop-in `systemd/session-writer-watch.service.d/70-predely.conf` → `/etc/systemd/system/session-writer-watch.service.d/70-predely.conf`, 0644 root:root (`MemoryMax`, `MemorySwapMax=0`; `TimeoutStartSec=60` is already in the unit). The unit and its timer are in the package too (B-N-1968): `systemd/session-writer-watch.service` → `/etc/systemd/system/session-writer-watch.service` and `systemd/session-writer-watch.timer` → `/etc/systemd/system/session-writer-watch.timer`, 0644 root:root, byte-identical to production on 2026-10-10. The unit's `60-python-padenie-70.conf` drop-in is not in the package (it exists only on the machine).

## Configuration

### Plugin `config` keys (`Config` schema in `src/index.js`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `ispolnenieInstrumentov` | `'sdk'` \| `'dsh'` \| `'unknown'` | `'unknown'` | who executes tools; determines the prune line in the summary: `sdk` — "not applicable", `dsh` — prune count, `unknown` — "not established" |
| `komandaStoka` | string | none | external sink command (`/bin/sh -c`, text on stdin, 5 s). `''` — log only; key absent — the start-up line calls it an omission. Runs with the agent process privileges |
| `stupeni` | number[] | `[0.85, 0.9]` | alarm stages — shares of the compaction threshold |
| `trevogaSzhatiya` | boolean | `true` | whether to send the short line about a finished compaction to the sink; a failure always goes to the sink |
| `predel` | number | `0` | fallback window in tokens if the platform announced none; `0` — no fallback |
| `agent` | string | `''` | agent name in lines and the single-mount guard key. Empty — the log says "агент НЕ НАЗВАН (настройка agent пуста)" (agent NOT NAMED (the agent setting is empty)). In the short line to the owner (sink) the name is taken from the built-in `IMENA` table in `src/index.js` (account name → name in Russian); for an account outside the table it is the `agent` value itself; with an empty `agent` the name in that line is empty, and "НЕ НАЗВАН" is not written there |

### Plugin environment and files

| Variable | Read at | Effect |
|---|---|---|
| `DSH_HOME` | `src/index.js:311` | directory for `storages/storozha-stupeni.json`; without it and without `STOROZHA_STUPENI_FAJL` stages live only in process memory |
| `STOROZHA_STUPENI_FAJL` | `src/index.js:311` | stage file path instead of `$DSH_HOME/…` (for stands); an empty string does not override `DSH_HOME` |
| `STOROZHA_ZHDAT_POSLE_MS` | `src/index.js:1021` | how long to wait for the "after" measurement for the compaction line; default 600 000 ms |
| `KOMPAKT_AGENT` | `src/index.js:268` | agent name for the `dsh-pamyat-kompakt` threshold file |
| `KOMPAKT_NASTROJKI_KATALOG` | `dsh-pamyat-kompakt/porogi.mjs` | threshold files directory (read by the sibling, not this package) |

Stage file format: `{ v: 1, sessii: { <session id>: { otdany: [ratios], rubezh, kogda } } }`.

### Settings file of the `bin/` programs

Path — `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`, changed by the `DSH_PAMYAT_STOROZHA_CONF` variable. `KEY=value` lines; `#` at the start of a line is a comment; if a key repeats the last occurrence wins; a value containing " #" (space or tab before `#`) is a refusal naming the key: Node and bash — code 2, Python — code 3. A required key unset — `СЛЕПОТА` (blindness) with the key name, code 2 (exceptions are in the table below).

| Key | Read by |
|---|---|
| `PAMYAT_CORE` | `pamyat-vernut-povtor`, `proba-sleda-podyoma.mjs`, `proverka-opory.mjs` (for `--zapisat`), `omega-kopiya-watch` (trust count), `test/stend-proverki-opory.mjs` |
| `PAMYAT_BAZA` | `proverka-cepi-boem.mjs`, `proverka-opory.mjs`, `sverka-s-istochnikom.mjs`, `rubezh-otnoshenij-watch` |
| `DSH_SESSII` | `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` |
| `CEP_UNIT` | `proverka-cepi-boem.mjs` |
| `SLED_PROFIL` | `proba-sleda-podyoma.mjs` |
| `OTKLONENNYE_KATALOG`, `CHITATEL_RUKA` | `chitatel-otklonennyh.mjs` |
| `DSH_PLUGINS_KLON` | `sostav-nabora.mjs`, `stendy-vseh-paketov.sh` |
| `STENDY_SPISOK_SLEPOTY` | `stendy-vseh-paketov.sh` (default — `prinyataya-slepota.txt` next to the script) |
| `AGENT_REGISTRY` | `session-agent-preset-watch`, `session-writer-watch.py` |
| `SWW_PAUZA_DIR`, `SWW_VERSIYA`, `SWW_CHITATEL` | `session-writer-watch.py` |
| `KP_ISHODY`, `KP_SHLYUZ` | `kompakt-priemka` (`codex` family only; `KP_SHLYUZ` is a template with `{agent}`) |
| `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_ISKLYUCHENIYA`, `OKW_IMYA` | `omega-kopiya-watch` |

### Arguments, variables and exit codes of the `bin/` programs

| Program | Arguments | Environment variables (default) | Writes | Codes |
|---|---|---|---|---|
| `chitatel-otklonennyh.mjs` | `[directory] [--suho]` | — | `<file>.reshenie.txt` alongside (except `--suho`) | 0, 2 |
| `kompakt-priemka` | `<agent> [--since ISO8601] [--json]` | — | nothing; calls `/usr/local/bin/agent-registry`, `journalctl`, `zstd` | 0, 1, 2 |
| `omega-kopiya-watch` | — | `OKW_N_MIN` (10), `OKW_OKNO_MIN` (60), `OKW_OMEGA_DB` (`/var/lib/omega/.omega/omega.db`), `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_CORE`, `OKW_ALERT` (`/usr/local/bin/agent-alert`), `OKW_NODE` (`/usr/local/bin/node`), `OKW_OMEGA_SP` (`/opt/omega/venv/lib/python3.12/site-packages`), `OKW_OMEGA_UNIT` (`omega-memory`), `OKW_OMEGA_MODEL_DIR` (`/var/lib/omega/.cache/omega/models/bge-m3-onnx`), `OKW_SYSTEMCTL`, `OKW_JOURNALCTL` | the `OKW_STATE` file; alarms to the channel | 0, 1, 2; 3 — `OKW_STATE` unset |
| `pamyat-vernut-povtor` | `<povtoryaet-*.txt> <pamyat.db>` | `PAMYAT_VERNUT_CORE` (stand only) | a record in the base, file rename | 0, 2 |
| `proba-sleda-podyoma.mjs` (no shebang, `node …`) | `[packages root]` | `PROBA_PROFIL` | a temporary directory | 0, 1, 2 |
| `proverka-cepi-boem.mjs` | `[--kontrol]` | `CEP_BAZA`, `CEP_OKNO` (`-7 days`), `CEP_ZHURNAL`, `CEP_START` | nothing; `--kontrol` — a temporary directory in `$HOME/workspace/vremennoe/` | 0, 1, 2 |
| `proverka-opory.mjs` | `[<base>.db] [--kontrol] [--zapisat]` | — | only with `--zapisat`: check marks in the base | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch` | — | `RASSHCH_BAZA` (`/var/lib/omega/.omega/omega.db`), `RASSHCH_SOST` (`/var/lib/rasshcheplenie-otmeny-watch/proshloe.json`), `RASSHCH_ITOG` (`…/last.json`), `RASSHCH_ALERT` (`/usr/local/bin/agent-alert`) | `SOST`, `ITOG`; alarms | 0, 2, 3 (growth) |
| `rubezh-otnoshenij-watch` | — | `RUBEZH_BAZA`, `RUBEZH_SOST` (`/var/lib/rubezh-otnoshenij-watch/skazano`), `RUBEZH_ALERT` (`agent-alert` from `PATH`), `RUBEZH_MONTAZH_MAXID` (2912), `RUBEZH_MONTAZH_TS` (1790004368), `RUBEZH_PREDEL_SUTOK` (7) | `SOST`; alarms | 0, 1, 2 |
| `session-agent-preset-watch` | `[--json \| --watch]` | `PRESET_WATCH_REGISTRY`, `PRESET_WATCH_STATE`, `PRESET_WATCH_ALERT` — only together with `PRESET_WATCH_PROBA=1` | `--watch`: `/var/lib/session-agent-preset-watch/last.json`, alarm via `agent-alert --plain` | 0, 1, 2, 3 |
| `session-writer-watch.py` | `[--check] [--version]` | `SESSION_WRITER_PAUZA_DIR` (stand) | without `--check`: `/var/lib/session-writer-watch/state.json`, alarm via `/usr/local/bin/agent-alert` | 0, 1, 2 |
| `sostav-nabora.mjs` | — | `KLON_TEGOV` | `git fetch origin` in the clone; request to `registry.npmjs.org` | 0, 1, 2 |
| `stendy-vseh-paketov.sh` | — | `STENDY_PKG_DIR`, `STENDY_OBRAZEC` (`dsh-pamyat-*`), `STENDY_PREDEL` (120 s), `STENDY_SPISOK_SLEPOTY` | nothing, but runs other packages' stands | 0, 1, 2 |
| `sverka-s-istochnikom.mjs` | `[pamyat.db]` | — | nothing | 0, 1, 2 |

External dependencies of the programs: Node with `node:sqlite` (`proverka-*`, `sverka-s-istochnikom.mjs`), `zstd`, `sqlite3` (`rubezh-otnoshenij-watch`), Python 3 with PyYAML (`session-*`), the OMEGA service Python `/opt/omega/venv/bin/python3` (shebang of `rasshcheplenie-otmeny-watch`), `git` and network (`sostav-nabora.mjs`).

## Verification

Composition of entries: 15 `test/stend-*.mjs` in `npm test` and 5 separate `.sh`; `audit-bin.py` is the body of an mjs wrapper. Without local peers, zstd or the memory core for STEND_CORE/PAMYAT_CORE a full run may yield 2 — blindness, not acceptance of the package. npm code: 1 takes precedence; if there was none, the last nonzero code in traversal order remains.

`npm test` (per `scripts.test` in `package.json`) runs only `test/stend-*.mjs` one by one and combines the codes: any code 1 — result 1; otherwise the last non-zero code (2 — blindness); all 0 — result 0. The `*.sh` stands are not part of `npm test` and are run separately.

Run `npm test` without `DSH_HOME` and `STOROZHA_STUPENI_FAJL` in the environment: `env -u DSH_HOME -u STOROZHA_STUPENI_FAJL npm test`. The stands `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs` and `stend-primenimosti-prune.mjs` mount the real `apply()` and send compaction events without unsetting `DSH_HOME`; with `DSH_HOME` set they write a session key into its `storages/storozha-stupeni.json`, i.e. into the agent's stage file.

| Stand | What it checks | Codes |
|---|---|---|
| `stend-audit-plugin.mjs` | logger, D without window, async sink, unload, session cap, units | 0, 1, 2 |
| `stend-audit-install.mjs` | actual offline local-archive npm install and mandatory sibling import | 0, 1, 2 |
| `stend-audit-bin.mjs` | CLI probes on temporary SQLite/zstd/git fixtures; the Python body audit-bin.py | 0, 1, 2 |
| `stend-vidov.mjs` | compaction kinds, spend, pressure | 0, 1 |
| `stend-opoveshcheniya.mjs` | compaction, prune, failure and stage lines; window from the platform (unsets `DSH_HOME`, own threshold directory) | 0, 1 |
| `stend-poroga-i-hraneniya.mjs` | stages from the threshold, stage storage on disk (own `DSH_HOME`) | 0, 1 |
| `stend-tekstov-vladelcu.mjs` | short sink lines (own `DSH_HOME`) | 0, 1 |
| `stend-istochnika-rashoda.mjs` | the compaction line names the spend source | 0, 1 |
| `stend-odinochnogo-montazha.mjs` | single-mount guard | 0, 1, 2 (canary) |
| `stend-vygruzki.mjs` | mount key removal on unload with real cordis | 0, 1, 2 (canary) |
| `stend-primenimosti-prune.mjs` | prune line for `sdk`/`dsh`/`unknown`, schema refusal of a foreign value | 0, 1 |
| `stend-svodki-po-taktu.mjs` | summary cadence rule (a copy of the rule, not the module code) | 0, 1, 2 (canary) |
| `stend-opisaniya.mjs` | README against the `STOROZHA` list | 0, 1, 2 |
| `stend-proverki-opory.mjs` | `proverka-opory.mjs` on a stand-in base: no writes without `--zapisat`, blindness never stored | 0, 1, 2 |
| `stend-opory-1563.mjs` | `proverka-opory.mjs` on a hermetic stand-in of logs (old and `v4`) | 0, 1, 2 |

`stend-opisaniya.mjs` requires in `README.md` a section for every guard in `STOROZHA` (`Сторож 1 — оповещение о сжатии`, `Сторож 2 — вторая ступень заполнения`, `Охват: какие сессии сторож видел`) with the mandatory columns from `KOLONKI_OPISANIYA`. A section is a level 2–4 heading (`##`–`####`); the heading text is compared with the list ignoring case, extra spaces and the dash kind. The second side of the pair: a section whose own text contains the first column from `KOLONKI_OPISANIYA` (what the guard does not catch) counts as a claim of a guard and must be in the code list. So that column itself must not be written verbatim in any other section, including this one. The number of claims must equal the number of guards. This README has nine second-level sections, three of them guards. On it the stand returns code 0. The stand checks the presence and coverage of the sections, not the correctness of their text.

`stend-proverki-opory.mjs` takes the core from `STEND_CORE` or the `PAMYAT_CORE` key of the production settings file and imports the real core; its base and sessions directory are temporary.

`*.sh` stands (the first argument is the watcher path where needed):

| Stand | Run | Codes | Environment |
|---|---|---|---|
| `stend-nastrojki.sh` | `bash test/stend-nastrojki.sh` (`STEND_BIN` — programs directory) | 0, 1 | alarm channels substituted, `agent-alert` led nowhere |
| `stend-slepoty-nastrojki.sh` | `bash test/stend-slepoty-nastrojki.sh` | 0, 1, 2 | substituted channel; as root — stand blindness |
| `stend-modeli-omega.sh` | `bash test/stend-modeli-omega.sh <watcher>` | 0, 1 | no sudo; in the "бой" (production) cycle reads the production model directory, `systemctl`, `journalctl` |
| `stend-pravki-postavki-omega.sh` | `bash test/stend-pravki-postavki-omega.sh <watcher>` + `STEND_PUNKT_SEARCH`, `STEND_PUNKT_BRIDGE`, `STEND_PUNKT_HANDLERS` | 0, 1, 2 | sudo, copy of the production OMEGA base, reads the production distribution and `systemctl` |
| `stend-svodki-doveriya.sh` | `bash test/stend-svodki-doveriya.sh <watcher> [base]` | 0, 1, 2 | sudo, copy of the production OMEGA base, reads the production distribution and `systemctl` |

Do not run without substitutions or without understanding the consequences:

- `stend-pravki-postavki-omega.sh`, `stend-svodki-doveriya.sh` — in the nightly round since A-N-1711 (07.10; arguments — the vse-stendy-boevye.sh table), 10–20 s at night; need sudo, copy of the production OMEGA; the last step reads the production install and systemctl: red at night is live state, not a stand defect (the former "not for the daily round" withdrawn 17.10);
- `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs`, `stend-primenimosti-prune.mjs` and the whole `npm test` — with `DSH_HOME` set they write into the agent's stage file;
- `bin/stendy-vseh-paketov.sh` — runs the stands of all `dsh-pamyat-*` packages without reading their headers, including stands that touch production;
- `bin/proverka-opory.mjs --zapisat`, `bin/pamyat-vernut-povtor` — write to the production `pamyat.db`; `bin/chitatel-otklonennyh.mjs` without `--suho` writes decision files;
- `bin/omega-kopiya-watch`, `rubezh-otnoshenij-watch`, `rasshcheplenie-otmeny-watch`, `session-agent-preset-watch --watch`, `session-writer-watch.py` without `--check` — send alarms via `agent-alert` and write their state; a manual run shifts the production unit's marks;
- `bin/proba-sleda-podyoma.mjs` — mounts memory packages with the production profile settings (the core gets a temporary base, the others production settings);
- `bin/sostav-nabora.mjs` — runs `git fetch origin` in the clone.

## Limitations

Plugin:

- Sees only the events of its own process. Compactions of other agents and processes, events before start-up and events that did not reach the listener are not observed; its silence does not distinguish these cases.
- The summary count lives in process memory and resets on start-up: "since start-up", not "per day". With no events at all the summary is not printed, and from outside the guard is indistinguishable from a dead one; there is no separate silence watcher.
- Guard 1 (compaction notification): a compaction that started and was cut off (restart, crash) gets no finish line; it shows in the summary as "начато и НЕ завершено" (started and NOT finished) only until the process dies. Spend not reported in the platform event's `usage` is printed as "НЕ СООБЩЁН" (not reported), not zero, and raises no alarm. The secretary's distillation is not observed. Duration is between log records, not model work. The route in the line is as of reading, not necessarily the one used for compaction.
- Guard 2 (fill stages): if ready D, the platform window and `predel` are all missing, stages are not counted (one line says so). Calls without `usage.inputTokens` bypass the count. The fill is known only after a model response. A compaction that passed while the module was not loaded is caught only by the fallback reset (share below a reported stage by more than 0.10). The count is its own and is not reconciled with the nudge (`dsh-pamyat-nudzh`).
- Session coverage: these are sessions of this process, not agents of the machine. A session with no event since start-up is absent from the list. The "МОЛЧИТ" (silent) mark appears after an hour without events.
- The single-mount guard is keyed by `config.agent`: two unnamed mounts in one process collapse into one.
- A printing failure is swallowed: a broken logger yields silence. A sink failure is printed to the log as "сток не сработал" (sink failed).
- `komandaStoka` runs in a shell with the agent process privileges; external input must never be substituted into it.
- Loading requires `dsh-pamyat-kompakt` alongside, it is declared as the mandatory peer `^3.1.1`.

`bin/` programs:

- `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` check the presence of an anchor, not text agreement. `sverka-s-istochnikom.mjs` reads one session, `telegram-a2a`, and only the old log `session.jsonl.zstd`, not `v4`.
- `proverka-cepi-boem.mjs` looks only at the last injection in the log window; it compares id and length, not text.
- `omega-kopiya-watch` links records only by a text fingerprint (NFC): a record merged or altered by the store is reported as "no copy"; knowledge that never reached `pamyat.db` and other nodes are not seen; a distribution patch re-applied with an error and a substituted model file of the same size are not caught.
- `rasshcheplenie-otmeny-watch` watches only growth of `active_with_superseded_metadata`; it does not see `last_accessed`, `valid_until`, access counters, substitution of `node_id`/timestamps or rewritten provenance.
- `rubezh-otnoshenij-watch` keeps a measurement of a specific deployment in its defaults (`RUBEZH_MONTAZH_MAXID`, `RUBEZH_MONTAZH_TS`) and the provenance boundary `68`.
- `session-agent-preset-watch` does not judge subagent sessions (`origin=subagent`). `session-writer-watch.py` catches only a repeated writer refusal, not liveness in general.
- `proba-sleda-podyoma.mjs` checks the presence of a start-up line, not that the package works.
- `sostav-nabora.mjs` reads the fact of a verdict commit, not its content; it works with the clone owner's account.
- `stendy-vseh-paketov.sh` judges by exit code and probe lines; some packages take dependencies through a symlink to the production directory.
- The watchers on the machine run from copies in `/usr/local/sbin`; a package update does not touch them.

---

The guard descriptions below are checked by the stand `test/stend-opisaniya.mjs`. A section heading is of level 2–4, and its text matches the heading from the `STOROZHA` list in `src/index.js` ignoring case, extra spaces and the dash kind. Each section must have two columns: what the guard does not catch and what its silence means. The English title goes on a separate line under the heading. These section headings are not translated or renamed.

## Сторож 1 — оповещение о сжатии

*Guard 1 — compaction notification*

One line per finished compaction: agent, kind, displaced volume, summary length, spend, model, duration, compaction id and route. An example of a real line:

```text
[dsh-pamyat-storozha <версия>] агент <agent> · сжатие естественное · вытеснено 812000 ток. (вход) · сводка вышло 5400 зн. · дистилляция: сторож её НЕ наблюдает (…) · расход НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ (поле usage; это не ноль) — расход своего вызова печатает сам kompakt · модель <summary-model> · длительность 41.5 с — между ЗАПИСЯМИ В ЖУРНАЛ, не работа модели · id c-1 · маршрут сейчас <provider> (маршрут НА МОМЕНТ ЧТЕНИЯ, не обязательно тот, которым сжимали)
```

| | |
|---|---|
| **What it catches** | every finished compaction: natural, forced (a human command), prune without a model, and a failed attempt |
| **🔴 What it does NOT catch** | An unfinished compaction (cut off by a restart or crash) gets no completion line; its start is counted and shown in the summary as "начато и НЕ завершено" (started and NOT finished), but this count is lost if the process dies. A compaction in another session or process. Spend the provider did not report in the platform event: printed as "НЕ СООБЩЁН" (not reported), not zero. Model working time: events have no duration field, the time between journal records is measured (queueing and waiting included). The route the compaction actually used: the route at reading time is printed, and that is marked. |
| **🔴 What its silence means** | "there were no compactions" **and** "events did not reach us" **and** "the plugin is not mounted" — three different things, indistinguishable by silence. The sign of work is the start-up line at start and the summary after the first turn; without them silence means nothing. |

## Сторож 2 — вторая ступень заполнения

*Guard 2 — second fill stage*

Stages 85% and 90% **of the compaction threshold** — the same number the compaction status command shows (100% = floor(window × ratio)). The threshold is taken ready-made from the agent's threshold file for the current route at every measurement. If it cannot be read, stages are counted from the window and the line says "⚠️ порог сжатия НЕ ПРОЧИТАН (<причина>) — считаю от окна" (compaction threshold NOT READ (<reason>) — counting from the window). The numerator is input plus cache from the model response ("по ответу модели", per model response): it equals the pressure at the moment of the response and lags by the growth between responses. Example:

```text
[dsh-pamyat-storozha <версия>] агент <agent> · 🟡 ЗАПОЛНЕНИЕ 85,4% номинального порога 890 000 (request) (76,0% окна; по ответу модели) — перешагнул 85% (756 500); занято 760 000 (вход+кэш, БЕЗ выхода). окно — платформа, модель <model> · счёт СВОЙ, с нуджем не сверяется
```

To the owner (sink) — one short line: "🟠 Заря: контекст 93% порога (742 тыс. из 800 тыс.)" (Zarya: context 93% of the threshold (742k of 800k)), "🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash" (Zarya: compaction 742 → 27k · summary 9k chars · 20 s · deepseek-flash) ("after" is the first usage measurement of the session after the compaction; if there is none within 10 min — "сжатие с 742 тыс.", compaction from 742k); the full line with sources stays in the log. `<имя>` comes from the built-in `IMENA` table by `config.agent`; for an account outside the table it is the `agent` value itself, and with an empty `agent` it is empty.

🟡 — a stage below 90%, 🟠 — 90% and above. One jump over both stages gives one message ("перешагнуты 85% (…) и 90% (…) ОДНИМ скачком", crossed in ONE jump). Reported stages are stored on disk per session (`$DSH_HOME/storages/storozha-stupeni.json`) and reset on `compaction/summary` or `compaction/prune` of their session — a service restart does not cause a repeated alarm. The window is asked from the platform at every measurement; `predel` is a fallback marked "платформой не подтверждена" (not confirmed by the platform), and a mismatch between the setting and the platform is said aloud once.

| | |
|---|---|
| **What it catches** | crossing each stage of the compaction threshold — once until the next compaction of its session, also after a service restart (stages on disk) |
| **🔴 What it does NOT catch** | Fill when ready D, the platform window and predel are all missing: the share is not computed at all (a separate line says so). Calls where the provider did not report `usage` or `inputTokens`: they bypass the count. Fill between two model responses: the value is known only after a call, and a sharp jump may cross a stage and hit the limit without giving the guard a beat. A compaction that happened while the module was not loaded: only a fallback reset covers it (the share dropped below a reported stage by more than 0.10). |
| **🔴 What its silence means** | "no stage crossed" **and** "usage does not arrive". The "no D, window or predel" case is taken out of silence: it is printed as "ступени НЕ считаются" (stages NOT counted) with a reason — otherwise silence would read as "little is occupied". |
| **⚠️ Own count** | the nudge package (`dsh-pamyat-nudzh`) keeps its own count with its own ratio. The numbers are independent and may differ — this is a second pair of eyes, not "the correct number"; if they differ, look at both. |

## Охват: какие сессии сторож видел

*Coverage: which sessions the guard saw*

The summary always, even at zero, prints the line "ОХВАТ ПО СЕССИЯМ: видел N — <id> (событий K)" (COVERAGE BY SESSION: saw N — <id> (K events)). A session with no events for more than an hour gets the mark "МОЛЧИТ N мин" (silent N min); a previous-conversation session (after `/new`, archived by the platform) gets "прежний разговор /new" (previous conversation /new) instead.

| | |
|---|---|
| **What it catches** | a session of this process that stopped sending events: it stays in the list marked "МОЛЧИТ N мин" |
| **🔴 What it does NOT catch** | Other agents on the machine — not at all, through no event: the guard lives inside the process, and "saw 1" speaks about sessions of this process, not the number of agents on the machine. A session that sent no event since start-up: it is not in the list, and "there was none" cannot be told from "it did not arrive". |
| **🔴 What its silence means** | "the session sends events" **and** "the guard is not mounted" **and** "there were no events at all". In normal operation a process sees one session, so the category is usually silent on the merits, not because of health. |

The guard retains coverage of the last 128 sessions by most recent event; eviction is reported in the summary. The stage file retains no more than 128 sessions by the time of the last stage send/reset (kogda). Old entries are trimmed on load/write. When an evicted session returns, a stage may be reported again; this is bounded dedup, not a permanent archive. Without events, in-memory cleanup is not triggered. This cap does not bound the other unfinished-compaction maps.

## Квитанция подъёма · Startup receipt

Строка подъёма `[dsh-pamyat-storozha <version>] подъём: …` идёт один раз непосредственно в stdout процесса, независимо от exporter Cordis: его logger может принять строку только в буфер. Версия фиксируется из package.json при импорте; неизвестная версия не заменяется выдуманной. Читатель — pered-podyomom --posle, затем kvitanciya-podyoma (только rc0). Это признак загрузки, не доказательство исправности всех сторожей; ошибка stdout сохраняет прежнюю границу «печать не роняет пакет». Остальные сообщения сохраняют logger-путь. После монтажа нужен назначенный подъём; старый процесс новую строку не получит.

The startup line `[dsh-pamyat-storozha <version>] подъём: …` goes once directly to process stdout, independently of Cordis exporters, which may only buffer logger messages. The version is read at module import; an unknown version is not invented. The reader is pered-podyomom --posle, then kvitanciya-podyoma (rc0 only). This proves loading, not all guard behavior. Output failure retains the no-crash boundary. Other messages keep their logger route; an assigned restart is required after deployment.

`node test/stend-startup-journal.mjs` — настоящий Cordis без exporter: stdout/version + remount; не запуск живой службы. · Actual Cordis without exporter: stdout/version + remount; no live service.

## TEAM-003: first-start session gap / первый подъём

`session-agent-preset-watch` (root oneshot → timer) distinguishes an absent session root before a service's first observable start. The canonical unit comes from `namerenie.sluzhba`. Only a loaded, inactive unit with empty ActiveEnterTimestamp, ExecMainStartTimestamp and InvocationID AND an empty retained all-boot journal is counted as `agents_not_started`, separately from `agents_scanned`. No alarm is sent for that case; JSON, journal and state name the waiting agents. The existing registry remains the denominator; waiting agents are not counted as inspected sessions.

Ненулевой/неполный/недоступный systemd или journalctl, timeout/не-root, неизвестная unit, существующий пустой root сессий — прежняя слепота2, не разрешение пропуска. След запуска/InvocationID/журнала при отсутствующем root — тревога. Заголовки без agentPreset по-прежнему провал1. У каждого запроса предел5с в общем бюджете60с. В историю читаются только служебные поля, не MESSAGE. Отсутствие следов означает отсутствие в текущем manager и сохранённом журнале, не восстановление удалённой истории; при одновременной утрате всех прежних свидетельств прошлый запуск не доказать этой проверкой.

Зовущий — `session-agent-preset-watch.service --watch`; читатель проблем — прежний agent-alert, оператор видит ожидание первого подъёма через --json/журнал/last.json. Права, таймер и антидублирование не меняются. `test/stend-preset-lifecycle.mjs` — @root,12 temp-fixture методов, systemd/journal/alert явно подставные; никаких живых служб/сессий/моделей/тревог стенд не вызывает.

Для окна команды выбран второй вариант документации: при ещё старом стороже между записью новых агентов в agents.yaml (Z5) и их первым подъёмом (Z9/Z10) поимённые FileNotFoundError этих новых session-root являются ожидаемой стадией окна. Остальные ошибки этим не оправданы, сторож/канал не выключаются. На bclaude/spark исправленный выпуск ставится принятой рукой ДО Z5; приёмка сессий удерживается до настоящего первого хода. Это порядок будущей установки, не выполненный автором монтаж.
