Russian version: [README.md](README.md) · English below

# dsh-podyom — restarting an agent service through the gates, with instruments before and after the restart

Версия · Version: 3.1.4

## Purpose

Restarting an agent service breaks whatever is running in it: a compaction, a turn, intake of a voice message, the secretary's distillation. A bare `systemctl restart` does not see this, and the memory migration on bring-up is irreversible. Therefore an agent restart on sadik goes through `podyom-uzla`. It restarts the service only when none of this is running and the MainPID matches the one the decision was made on. Before the restart it takes a snapshot of the memory database and records the package canon. After the restart it verifies that the process has changed and the packages have announced themselves, and writes a trace to the restart log. Who restarted, what went live and why a restart was refused is visible from the log, not from correspondence.

It is called by root manually: `sudo podyom-uzla <служба>`. The watcher `podyom-mimo-vorot-watch` (package dsh-storozha-mashiny) takes its scope from it by calling `podyom-uzla --oblast`. The other files of the package are instruments around the restart. `pered-podyomom.mjs` checks the composition (what will go live and what is live) against the plugin registry. `kvitanciya-podyoma`, based on the outcome of that instrument, issues Iskra the receipt «подъём разобран» ("restart analysed"). `proverit-podyom-kodera` is the "may it be restarted" check for coders, which are not in the `podyom-uzla` scope. `hod-sluzhby` is the shared indicator of "is a turn running": it is called by `podyom-uzla`, `proverit-podyom-kodera`, `smontirovat-fajly` (dsh-montazh), `pereklyuchatel-podpiski` (dsh-podpiski) and `mail-stop-hold` (dsh-pochta).

The results are read by:
- the log `/var/log/podyom-uzla/zhurnal-podyomov.txt` — `kto-podnimal`, the memory core (dsh-pamyat-core, load witness) and `podyom-mimo-vorot-watch`;
- the canon snapshot — `pered-podyomom.mjs --posle`;
- the receipt in `SOSTOYANIE-ISKRY.txt` — `sadik-watch`.

## What is installed and where

Paths and permissions were checked against the `dsh-podyom` entry in `/etc/agent-registry/plugins.yaml` (section `services`, `derevo.files`) and against `stat` of the live files.

| file in the package | path on the machine | mode, owner | who executes / reads |
|---|---|---|---|
| `bin/podyom-uzla` | `/usr/local/bin/podyom-uzla` | 0755 root:root | root manually; `podyom-mimo-vorot-watch` (`--oblast`) |
| `bin/pered-podyomom.mjs` | `/usr/local/bin/pered-podyomom.mjs` | 0755 root:root | `podyom-uzla` (variable `PRIBOR`) before and after the restart; `kvitanciya-podyoma`; manually |
| `bin/kvitanciya-podyoma` | `/usr/local/bin/kvitanciya-podyoma` | 0755 root:root | `podyom-uzla` after a successful restart of `iskra.service` (`sudo -n -u iskra`) |
| `bin/proverit-podyom-kodera` | `/usr/local/bin/proverit-podyom-kodera` | 0755 root:root | root manually (`sudo -n`) right before `systemctl restart` of coder alfa/beta/gamma/marc/anna/master/vintik/shpuntik/gayka/shurup/tumbler |
| `libexec/agent-hod/hod-sluzhby` | `/usr/local/libexec/agent-hod/hod-sluzhby` | 0755 root:root | `podyom-uzla`, `proverit-podyom-kodera`, `smontirovat-fajly`, `pereklyuchatel-podpiski`, `mail-stop-hold` |
| `libexec/podyom-uzla/check-sled.py` | `/usr/local/libexec/podyom-uzla/check-sled.py` | 0644 root:root | `podyom-uzla` via `/usr/bin/python3 -I -S -B` (restart lock and trace check); it loads nothing from the package itself — `baseline.py` loads it as a module |
| `libexec/podyom-uzla/snapshot.cjs` | `/usr/local/libexec/podyom-uzla/snapshot.cjs` | 0755 root:root | `podyom-uzla`: `sudo -n node snapshot.cjs <база> <снимок>` (snapshot by `VACUUM INTO`) |
| `libexec/podyom-uzla/boundary.cjs` | `/usr/local/libexec/podyom-uzla/boundary.cjs` | 0755 root:root | `podyom-uzla` after the restart: memory database boundary, record count, `MAX(id)` |
| `libexec/podyom-uzla/baseline.py` | `/usr/local/libexec/podyom-uzla/baseline.py` | 0644 root:root | root manually, one-off (trace baseline); a normal restart does not call it. Loads `check-sled.py` from its own directory (`importlib`) |

Not installed into live: `README.md`, `CHANGELOG.md`, `test/stend-priyoma.sh`.

The package has no units. The package is sources without a `package.json`: the `bin/` and `libexec/` directories mirror the paths under `/usr/local/`. The current version is in the heading of `CHANGELOG.md` and in the tag `dsh-podyom-v<номер>` of the tree `/opt/iskra/workspace/dsh-plugins`.

What `podyom-uzla` writes on the machine (not part of the package):
- `/var/log/podyom-uzla/` (root:root 0755, files 0644): the log `zhurnal-podyomov.txt`, the canon `kanon-podyoma-<агент>.txt`, the canon snapshot `snimok-kanonov-<агент>.txt`, the check manifest `manifest.txt`, the locks `.podyom-<агент>.lock`;
- the memory database snapshot before the restart: `<каталог базы>/pamyat-do-podyoma-<агент>-<UTC>.db`; the five newest are kept, the rest are deleted, and this is written to the log as a `СРОК` ("retention") line;
- lines in the system journal with the tag `podyom-uzla` (for a stub restart — `podyom-uzla-zaglushka`).

What is needed on the machine (where it comes from is in parentheses):
- `bash`, `python3`, `node` with `node:sqlite`, `systemctl`, `journalctl`, `sudo`;
- `jq` (OS package `jq`) — `podyom-uzla` parses the `agent-registry pole … --json` response with it; without it the scope is empty, exit 2;
- `logger` (util-linux; on Debian and Ubuntu — package `bsdutils`) — the `podyom-uzla` and `hod-sluzhby` lines in the system journal;
- the python module `yaml` (PyYAML; OS package `python3-yaml`) — `pered-podyomom.mjs` reads `/etc/agent-registry/plugins.yaml` with it;
- `/usr/local/bin/agent-registry` (package a2a-bus) — `podyom-uzla` takes the scope from it; without it the scope is empty, exit 2;
- `/etc/agent-registry/plugins.yaml` — the source of what was accepted, for `pered-podyomom.mjs`;
- `/usr/local/bin/summa-predmeta-rezhim` (package dsh-montazh) — the canon snapshot;
- `/usr/local/bin/summa-predmeta-2` (package dsh-pamyat) — the sum canon for `pered-podyomom.mjs` by default (`--kanon`).

## Installation

This is how we install it:

1. A file change goes as a candidate through the gates. Under a temporary rule (Veniamin, 07.10.2026) any file of the package changes only together with a new package number: the heading in `CHANGELOG.md` and the tag `dsh-podyom-v<номер>` in the tree `/opt/iskra/workspace/dsh-plugins`.
2. Installation is file by file, with `smontirovat-fajly` (package dsh-montazh), a separate call for each live directory. First a dry run, then into live:
   ```bash
   sudo smontirovat-fajly --punkt <пункт> --progon --osnova podyom-uzla=<sha256 боя> \
        <дерево>/packages/dsh-podyom/bin /usr/local/bin podyom-uzla
   sudo smontirovat-fajly --punkt <пункт> --v-boj  --osnova podyom-uzla=<sha256 боя> \
        <дерево>/packages/dsh-podyom/bin /usr/local/bin podyom-uzla
   ```
   The `libexec/` files are installed the same way into `/usr/local/libexec/podyom-uzla` and `/usr/local/libexec/agent-hod`. A file that is not yet in live — only with `--novyj --mode=<режим из таблицы> --owner=0:0`.
3. There are no units: `daemon-reload` and `enable` are not needed. The new `podyom-uzla` takes effect from the next call.
4. After installation, `version` (the `installed_check` fingerprint) and `derevo.ref` in the `dsh-podyom` registry entry are moved to the new tag.

Removal: the file goes into a backup copy (`mv`), but before that all its callers must be checked (table above).

## Configuration

Environment variables and flags are taken from the code. Override variables accept not «да» ("yes") but **a reason in words**: it goes into the output and, for `PODNYAT_VSLEPUYU`, into the `ДО` ("BEFORE") line of the log.

**`podyom-uzla <служба> [ожидаемый MainPID] [ключи]`**

| variable / flag | default | meaning |
|---|---|---|
| `<служба>` | — | `X.service` from the scope: in `agent-registry` agent X has `sluzhba=X.service`, `polzovatel=X`, `dom=/opt/X`. Outside the scope — exit 2 |
| `[ожидаемый MainPID]` | not set | restart only if the MainPID is the same right now; otherwise refusal 1. Not set — restart without checking the target, with a warning |
| `--suhoj` | off | dry run: restarts and writes nothing, counts all refusal reasons |
| `--prervat-hod=<причина>` | — | restart while a turn is running; the bare flag — refusal 2 |
| `--prervat-distillyaciyu=<причина>` | — | restart while a distillation is running; the bare flag — refusal 2 |
| `--oblast` | — | print the scope and exit: 0 — scope non-empty, 2 — empty |
| `OKNO` | `15min` | window of the service journal for the compaction check |
| `SLED` | `/var/log/podyom-uzla/zhurnal-podyomov.txt` | restart log; its directory is the location of the canon, the canon snapshot, the manifest and the locks |
| `SLED_PRIBOR` | `/usr/local/libexec/podyom-uzla/check-sled.py` | instrument for the lock and the trace check |
| `SLED_MANIFEST` | `<каталог SLED>/manifest.txt` | reference for the check if the log has no sum |
| `SNIMOK_KANONOV` | `<каталог SLED>/snimok-kanonov-<агент>.txt` | where to write the canon snapshot (it is also read by `pered-podyomom.mjs --posle`) |
| `PROFIL_PUTI` | `<дом>/.dsh/profiles/web`, home — `/opt/<агент>` (for `iskra.service` — `/opt/iskra`, for `petrovich.service` — `/opt/petrovich`) | profile from which the composition for the canon snapshot is taken |
| `PODYOM_BAZA` | `/opt/<агент>/pamyat/pamyat.db` | memory database for the pre-restart snapshot and for the boundary |
| `PRIYOM_BAZA` | `/opt/<агент>/workspace/.message-receipts/receipts.sqlite` | channel receipts: whether intake of incoming messages is running |
| `PRIYOM_PREDEL` / `PRIYOM_SHAG` | `120` / `5` (s) | how long to wait for intake to finish and at what step |
| `HOD_SLUZHBY` | `/usr/local/libexec/agent-hod/hod-sluzhby` | turn instrument (a substitute is printed with a «ПОДМЕНА» ("substitution") line) |
| `PRIBOR` | `/usr/local/bin/pered-podyomom.mjs` | composition instrument before and after the restart |
| `PRIBOR_SUMM` | `/usr/local/bin/summa-predmeta-rezhim` | sum instrument for the canon snapshot |
| `KVIT_CMD` | `/usr/local/bin/kvitanciya-podyoma` | receipt after Iskra's restart |
| `PREDEL_OZHIDANIYA` | `60` (s) | how long to wait after the restart for the packages to announce themselves in the journal |
| `ZHDU_PAKETOV` | `6` | how many packages must announce themselves; fewer — blindness (exit 2) |
| `PROBA` | empty (`--suhoj` sets `да`) | dry mode |
| `KOMANDA_PODYOMA` | empty | for the test stand only: a command instead of `systemctl restart`; writes `*.zaglushka.txt` files, tag `podyom-uzla-zaglushka`, does not check the PID change and does not issue a receipt |
| `KANON_DOM` | the service home (`/opt/<агент>`, for `iskra.service` — `/opt/iskra`) | for the test stand only: whose `plugins/` goes into the canon of the moment; a substitute is printed with a «ПОДМЕНА» line; set without `KOMANDA_PODYOMA` — refusal, code 2 |
| `PODNYAT_VSLEPUYU` | — | override of any blindness (journal empty, instrument blind, receipt database unreadable, etc.) |
| `PODNYAT_NESMOTRYA` | — | override of an unfinished compaction |
| `PODNYAT_NESMOTRYA_NA_PRIBOR` | — | override of outcome 1 of the composition instrument |
| `PODNYAT_BEZ_SNIMKA` | — | override of a database snapshot not taken |
| `TMPDIR` | `/tmp` | temporary file for errors of the intake check |

**`pered-podyomom.mjs`** (flags only, a positional argument — refusal 2)

| flag / variable | default | meaning |
|---|---|---|
| `--sluzhba` | `iskra.service` | whose service |
| `--profil` | `<дом User службы>/.dsh/profiles/web`; if the service owner cannot be read — `/opt/iskra/.dsh/profiles/web` | profile root |
| `--konfig` | `<профиль>/cordis.patch.yml` | what is declared for loading |
| `--reestr-plaginov` | `/etc/agent-registry/plugins.yaml` | source of what was accepted (both sections, `plugins` and `services`) |
| `--kanon` | `/usr/local/bin/summa-predmeta-2` | target sum instrument |
| `--cel пакет=версия,…` / `--cel-fajl <файл>` / `--cel-s-diska` | — | restart target; one of the three is required, without a target — blindness 2. `--cel-s-diska` cannot be combined with the other two |
| `--posle` | off | category «В БОЮ» ("LIVE"): what the process has printed about itself since start |
| `SNIMOK_KANONOV` | `/var/log/podyom-uzla/snimok-kanonov-<агент>.txt` | target of the «В БОЮ» category with `--cel-s-diska` |
| `--strogo` | — | accepted and changes nothing |
| `--reestr` | — | categories that queried npm are disabled by the owner's order; without the flag «не проверялся» ("not checked") is printed |
| `--summy` | — | removed: refusal 2 |

**`kvitanciya-podyoma [iskra|iskra.service]`** — any other argument gives refusal 2.

| variable | default | meaning |
|---|---|---|
| `KVITANCIYA_FAJL` | `/opt/iskra/workspace/SOSTOYANIE-ISKRY.txt` | file in which the `PODYOM_PODTVERZHDEN=` and `PODTVERDILA=` lines are edited |
| `KVITANCIYA_SLUZHBA` | `iskra.service` | whose start goes into the receipt |
| `KVITANCIYA_PRIBOR` | `/usr/local/bin/pered-podyomom.mjs` | instrument, called with `--posle --cel-s-diska` |

**`proverit-podyom-kodera <юнит>`** — the unit is one of `alfa.service`, `beta.service`, `gamma.service`, `marc.service`, `anna.service`, `master.service`, `vintik.service`, `shpuntik.service`, `gayka.service`, `shurup.service`, `tumbler.service`. It has no variables of its own: it sets `HOD_SYSTEMCTL` and `HOD_JOURNALCTL` for the child `hod-sluzhby` itself. Each external command is limited to 10 s and 16 MiB of output.

**`hod-sluzhby <юнит>`**

| variable | default | meaning |
|---|---|---|
| `HOD_SYSTEMCTL` | `systemctl` | substitute for the test stand |
| `HOD_JOURNALCTL` | `journalctl`; not as root — `sudo -n journalctl` | substitute for the test stand |
| `HOD_DISTILL_MIN` | `100` (min) | an analysis marker older than this is not counted as a running distillation |
| `HOD_KAT_METOK` | from `putOtklonennyh` in the service's `$DSH_HOME/profiles/web/cordis.patch.yml` | directory of the `razbor-idet-*.txt` markers |

**`check-sled.py`**: `--file`, `--journal`, `--service`, `--phase ДО|ПОСЛЕ`, `--manifest` (all required), `--allow-new`. Service modes: `--lock-run <путь> -- <команда>` and `--lock-held <fd> <путь>`.

**`baseline.py`**: `--plan` or `--apply <проверенный JSON>` (one of the two), `--directory`, `--services …`, `--operator` (required).

## Verification

Check against live — the commands from the `dsh-podyom` registry entry:
- `installed_check`: `sha256sum` of the nine live files, folded into `sha256:<16 знаков>`; the result must match the `version` field of the entry;
- `healthcheck`: `test -x /usr/local/bin/podyom-uzla && echo 'podyom-uzla исполним'`;
- the `proverit-podyom-kodera` registry entry additionally checks `sudo -n /usr/local/bin/proverit-podyom-kodera --help`: exit 0 — the instrument is in place.

The package test stand is `test/stend-priyoma.sh [путь к podyom-uzla]`, by default `../bin/podyom-uzla` next to the stand. Run it under an account with `sudo -n` (it needs `sudo -n python3` and `sudo -n test`). The stand substitutes its own `receipts.sqlite` via `PRIYOM_BAZA` and calls `podyom-uzla iskra.service --suhoj`, so there is no restart. Probes:
- П1 — no unfinished intakes;
- П2 — intake is running and does not finish → refusal with id;
- П3 — intake finishes during the wait;
- П4 — no database → blindness;
- П6 — `mail_stop_intake` hold → waits and refuses;
- П5 — again as П1.

Exit 0 — all six green, 1 — at least one red, 2 — temporary directory not created, or the target did not reach the intake section (it refused earlier — the probes cannot be judged, the reason is printed).

Dry run of the restart itself — `sudo podyom-uzla <служба> --suhoj`:
- 0 — in live it would have reached the restart;
- 3 — in live it would have been a refusal, reasons listed;
- 2 — blindness: outside the scope, unknown flag or empty scope.

Exit codes in live:

| program | codes |
|---|---|
| `podyom-uzla` | 0 — restarted, MainPID changed, packages announced themselves, trace written · 1 — refusal (compaction, turn, intake, instrument says «нельзя» ("no"), wrong MainPID, no snapshot, canon did not match the trace, no lock, the `ДО` line was not written) or restart returned 0 but the PID is the same · 2 — blindness (including fewer than `ZHDU_PAKETOV` packages announced themselves, the canon snapshot or the `ПОСЛЕ` ("AFTER") line was not written) · 5 — a distillation is running · other — exit code of `systemctl restart` |
| `pered-podyomom.mjs` | 0 allowed · 1 not allowed · 2 blindness (behaves as «нельзя») |
| `kvitanciya-podyoma` | 0 receipt issued · 2 refusal or blindness · otherwise — outcome of the instrument (1: live diverged from disk) |
| `proverit-podyom-kodera` | 0 allowed as of the snapshot · 1 busy (turn or distillation) · 2 blindness or refusal |
| `hod-sluzhby` | 0 no turn (or no process) · 1 a turn is running · 2 journal of the live process is empty · 3 invalid call · 4 `systemctl show` failure |
| `check-sled.py` | 0 matched or new file · 1 mismatch (or lock refusal) · 2 blindness |
| `baseline.py` | 0 plan printed or baseline written · 1 baseline refusal |

## Limitations

- A compaction is visible only from the service journal within the `OKNO` window (15 min). A compaction longer than the window is not visible, and if the platform stops printing `compaction/start`, the check will go blind.
- A turn and a distillation are visible from the main process's journal since its start. An end line lost by journald gives a false "running" (overridden with a flag carrying a reason). A change in the wording of the platform or the secretary gives a false "not running": only the check during an update catches this.
- An analysis marker older than `HOD_DISTILL_MIN` (100 min) is not counted as a running distillation. `hod-sluzhby` does not see an analysis without a marker. Nobody asks about a machine reboot or OOM.
- Intake of incoming messages is visible only with `channel_started=1`: a file that has just landed in the mailbox and a channel that does not write receipts are not visible. A `channel_interrupted` hold is not counted as intake.
- The scope comes from the agent registry. An agent with a different setup, mistakenly recorded with `dom=/opt/X` and `polzovatel=X`, will be restarted with checks not meant for its setup. The coders alfa/beta/gamma (account `coders`) fall out of the scope by themselves. For them — `proverit-podyom-kodera`: it is a snapshot, not a lock, and must be called immediately before the action.
- The expected MainPID is optional. Without it the restart goes without checking the target, with a warning.
- The canon of the moment is taken from `<дом>/plugins/*/` and `/opt/agent-plugins/*/`, the canon snapshot — from the profile `<дом>/.dsh/profiles/web` (or `PROFIL_PUTI`); home is `/opt/<агент>`, for Iskra `/opt/iskra`. Since 1.0.5 Petrovich goes through the common branch and is read from its own home `/opt/petrovich`; before 1.0.5 its canon and snapshot were taken from `/opt/iskra` and described Iskra's composition. The snapshot finds a package only via the link `<профиль>/node_modules/<имя>` for a name from `cordis.patch.yml`: a profile package without such a link does not get into the snapshot.
- The canon answers "what went live with this restart", not "is the composition legitimate".
- `pered-podyomom.mjs` sees only literal paths `import … from "/…"` in the package entry file. A computed path and loading from a neighbouring file are not visible. The profile's `package.json` is not read as a way of loading. The categories that compared disk and tags against the npm registry, and the category «файл сумм против дерева вердиктов» ("sums file against the verdict tree"), are disabled, not removed.
- `pered-podyomom.mjs` executes the `fingerprint_check` commands from the registry as the caller (under `podyom-uzla` — root). The trust boundary is the same as for `agent-plugins verify`.
- Only Iskra has a receipt. It means "the instrument analysed the restart and it matched", not "the restart is legitimate". It cannot be issued retroactively: after a new release the instrument legitimately gives 1. Anyone with sudo on the machine can forge it.
- `check-sled.py` checks the artifact against the last line of the log. It does not prove the log's authenticity.
- `snapshot.cjs` takes a copy with `VACUUM INTO`. The five newest snapshots per agent are kept next to the database, on the same volume.
