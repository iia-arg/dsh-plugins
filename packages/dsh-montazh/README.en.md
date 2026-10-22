Russian version: [README.md](README.md) · English below

# dsh-montazh — installation, backups, release by tags, package checksums, acceptance summaries

**Version:** 3.1.46

B-N-2111 item 31(c): after creating a backup, every nonzero `smontirovat-fajly` exit reports its final disk state on stderr: “ОТКАЗ: страховка СНЯТА/УДАЛЕНА: path” or “ОТКАЗ: страховка ОСТАЛАСЬ: path · sha256 …” (full disk hash). A nonregular file or unreadable hash reports blindness. The existing removal message on stdout is retained; the caller reads the final state with the refusal. This runs once at exit for the current backup only, preserving exit codes and cleanup. It does not prove rollback completeness, recover earlier backups, or track deletion after exit.

B-N-2060: an external file joins a release-copy window only through the unchanged `derevo` record and its `owned_files`. If `release_copy` pinned `path`, `source.type`, or `source.address`, the file producer reads missing fields from the current registry, then compares the complete check; a subset alone is insufficient. Existing checks and the original 1..1800-second deadline remain intact. The protected rollback plan gains the file snapshot BEFORE replacement, or an absence check for a new file. Unowned files and any mismatch still fail. This reconciles producers; it neither authorizes root nor proves copy health.


Parsing `npm pack --json` requires `npm-sostav` in PATH from installed dsh-pribory 3.1.2 or newer, installed before this version. The helper is located through PATH; absence returns code 2 with the reason “npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2”. Callers retain npm flags, cwd and sudo; the helper only parses stdin. Publication checksums and copy admission support npm 11 and 12. Archive name and content checks remain in `montazh-okno`.

Service software of the sadik machine: what installs releases and files into live, backs up the previous state, puts release
tags, computes the checksum of a package, assembles the state summary and the acceptance verdicts, checks what is published
before it goes out. Watchers: backup retention, backup-before-install of modules, live version of shared carriers, tags past the release
gates.

**Temporary rule (Veniamin, 07.10.2026):** until new packages have a "live ↔ tag" reader, any file of the package
changes only together with a new package number in the same window.

The package is sources without `package.json`: the directories `bin/`, `sbin/`, `libexec/` mirror the paths under `/usr/local/`,
units and drop-ins are in `systemd/` (paths under `/etc/systemd/system/`). The number is the CHANGELOG heading and the tag
`dsh-montazh-v<номер>`. Moved from live: the checksum of every file in the tree equals the checksum in live.

Since 1.0.20 `bin/vorota-obezlichivaniya` is the SECRETS gate (owner's decision of 09.10.2026): it carries no samples of real addresses; the former line "replace the address sample before publication" was removed together with the address class.

Removed: `tri-stolbca` (the three-columns watcher) — removed 07.10.2026, B-N-1717 (the unit is removed, the script is left in live), not in the package.

## Files

git stores only the "executable" bit, so the mode and owner on disk are in the table (taken with `stat` of live, 07.10.2026).

| file in the package | path on disk | called by | mode | owner:group |
|---|---|---|---|---|
| `sbin/smontirovat-fajly` | `/usr/local/sbin/smontirovat-fajly` | root operator (the installing hand, after the gates) | 755 | root:root |
| `sbin/smontirovat-vypusk` | `/usr/local/sbin/smontirovat-vypusk` | root operator (the installing hand, after the gates) | 755 | root:root |
| `sbin/montazh-srok` | `/usr/local/sbin/montazh-srok` | montazh-srok.service ← .timer 02:30 UTC; root operator | 755 | root:root |
| `bin/strahovka` | `/usr/local/bin/strahovka` | operator (backup before an edit) | 755 | root:root |
| `bin/vypusk-tegom` | `/usr/local/bin/vypusk-tegom` | operator (release by tag) | 755 | root:root |
| `bin/perenos-v-derevo` | `/usr/local/bin/perenos-v-derevo` | operator (moving live into the tree) | 755 | root:root |
| `bin/summa-predmeta-rezhim` | `/usr/local/bin/summa-predmeta-rezhim` | podyom-uzla (dsh-podyom, PRIBOR_SUMM); operator | 755 | root:root |
| `sbin/strahovanie-modulej-watch` | `/usr/local/sbin/strahovanie-modulej-watch` | strahovanie-modulej-watch.service ← .timer 06:57 | 755 | root:root |
| `sbin/zhivaya-versiya-watch` | `/usr/local/sbin/zhivaya-versiya-watch` | zhivaya-versiya-watch.service ← .timer *:41 | 755 | root:root |
| `libexec/svodka/svodka-sostoyaniya.sh` | `/usr/local/libexec/svodka/svodka-sostoyaniya.sh` | polozhit-svodku | 755 | root:root |
| `libexec/svodka/verdikty-priyomki.sh` | `/usr/local/libexec/svodka/verdikty-priyomki.sh` | svodka-sostoyaniya.sh | 755 | root:root |
| `bin/polozhit-svodku` | `/usr/local/bin/polozhit-svodku` | operator | 755 | root:root |
| `bin/vorota-obezlichivaniya` | `/usr/local/bin/vorota-obezlichivaniya` | operator (the gate before publication) | 755 | root:root |
| `bin/proba-chastnyh-imen` | `/usr/local/bin/proba-chastnyh-imen` | operator (a manual tool; the gates `vypusk-tegom` do not call it) | 755 | root:root |
| `sbin/proverit-env-ekzemplyara` | `/usr/local/sbin/proverit-env-ekzemplyara` | root operator (before a gateway restart) | 755 | root:root |
| `libexec/vypusk-tegom/zhurnal-zapis` | `/usr/local/libexec/vypusk-tegom/zhurnal-zapis` | vypusk-tegom (`sudo -n`, before «✅»; B-N-1923) | 755 | root:root |
| `sbin/metki-mimo-vorot-watch` | `/usr/local/sbin/metki-mimo-vorot-watch` | metki-mimo-vorot-watch.service ← .timer */15 (B-N-1923) | 755 | root:root |
| `test/stend-vypusk-kopii.py` | `/usr/local/libexec/stend-vypusk-kopii.py` | `stend-vorot-vypuska.sh` (dsh-obhod-stendov); operator | 644 | root:root |
| `test/stend-metki-vorot.sh` | `/usr/local/libexec/stend-metki-vorot.sh` | nightly run `vse-stendy-boevye.sh` (dsh-obhod-stendov, with `TMPDIR`); operator | 755 | root:root |
| `systemd/montazh-srok.service` | `/etc/systemd/system/montazh-srok.service` | its own .timer | 644 | root:root |
| `systemd/montazh-srok.timer` | `/etc/systemd/system/montazh-srok.timer` | systemd (enabled) | 644 | root:root |
| `systemd/metki-mimo-vorot-watch.service` | `/etc/systemd/system/metki-mimo-vorot-watch.service` | its own .timer | 644 | root:root |
| `systemd/metki-mimo-vorot-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/metki-mimo-vorot-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/metki-mimo-vorot-watch.timer` | `/etc/systemd/system/metki-mimo-vorot-watch.timer` | systemd (enable AFTER `metki-mimo-vorot-watch --snimok`) | 644 | root:root |
| `systemd/strahovanie-modulej-watch.service` | `/etc/systemd/system/strahovanie-modulej-watch.service` | its own .timer | 644 | root:root |
| `systemd/strahovanie-modulej-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/strahovanie-modulej-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/strahovanie-modulej-watch.timer` | `/etc/systemd/system/strahovanie-modulej-watch.timer` | systemd (enabled) | 644 | root:root |
| `systemd/zhivaya-versiya-watch.service` | `/etc/systemd/system/zhivaya-versiya-watch.service` | its own .timer | 644 | root:root |
| `systemd/zhivaya-versiya-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/zhivaya-versiya-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in to the unit) | 644 | root:root |
| `systemd/zhivaya-versiya-watch.service.d/70-predely.conf` | `/etc/systemd/system/zhivaya-versiya-watch.service.d/70-predely.conf` | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) | 644 | root:root |
| `systemd/zhivaya-versiya-watch.timer` | `/etc/systemd/system/zhivaya-versiya-watch.timer` | systemd (enabled) | 644 | root:root |

Purpose of the files (from their headers):
- `smontirovat-fajly` — file-by-file installation with a backup that the tool makes itself (B-H-080); a new file — only with `--novyj`.
- `smontirovat-vypusk` — installation of a release by the publication contents of a tag (not by an archive of the tree); `--progon` — dry run, `--v-boj <пункт>` — into live.
- `montazh-srok` — cleaner of backups `/var/backups/montazh*` older than 3 days (B-N-1169; since 3.1.35 — Mikhalych's r3, owner's word 17.10.2026 19:18 MSK, formerly 14).
  Keeps: backups of an open or broken (failed) install window — by the opening time of the oldest such window and by its task number in the item name; window directory unreadable — deletes nothing (alert);
  `ISKLYUCHENIYA` exceptions — by mask: `UBORKA-VOSSTANOVLENIE-20261016`, `B-N-2096-izvlecheno`, `DISK-20261017`, `*-ulika` (evidence, not backups);
  anything marked `.HRANIT` — `<object>.HRANIT` next to it, `.HRANIT` inside, or for the whole item `<item>.HRANIT` / `<item>/.HRANIT`; lines `do: YYYY-MM-DD` (inclusive) or `do: poka <condition>`, `kto:`, `zachem:`.
  An expired mark date raises the alert "срок хранения истёк" (retention expired) instead of deleting; undated marks are listed on Mondays; missing `kto`/`zachem` — kept with "пометка неполная" (incomplete mark).
- `strahovka` — a backup copy whose age and owner do not lie.
- `vypusk-tegom` — release by tag; calls the stand runner and, before «✅», the trace helper `zhurnal-zapis`. The gates do not call the private-name probe: its category has been switched off since 06.09.2026, and since 3.1.1 the check that the tool exists and its `--kontrol` are removed too.
  A probe that a stand declares "not applicable" (`STEND-NEPRIMENIMO`) on every copy of the package is BLINDNESS 2. A narrow waiver of one such probe is `NEP_PRINYATO="<stand>:<probe>=<reason>"` (any number of lines; `<stand>` is the path from the package directory or the file name): a matching pair is printed as "не применимо по объявлению: …" and goes into every tag hint; the other stands of the package run as usual. An unmeasured probe without a pair is still BLINDNESS 2; a pair that matches no unmeasured probe (typo, probe measured, no markers, stands not run) and a malformed line are BLINDNESS 2 "объявление не применено". The gates do not judge whether the reason is true.
- `vypusk-tegom/zhurnal-zapis` — root helper: writes the gates trace into the journal `/var/lib/vypusk-tegom/zhurnal.tsv` (section "Gates trace" below).
- `metki-mimo-vorot-watch` — watcher: every tag of the registry trees must have a gates trace for the same contents (section "Watcher of tags past the gates" below).
- `perenos-v-derevo` — moving a package from the live disk into the tree; a deletion does not pass silently.
- `summa-predmeta-rezhim` — the checksum of a package by one method. (`summa-predmeta-kanon` was removed 07.10.2026, B-N-1770: «НЕ ЗВАТЬ» ("do not call"), replaced by `summa-predmeta-2`.)
- `strahovanie-modulej-watch` — watcher: an installation into a package directory without a backup in montazh (sudo journal, B-N-903).
- `zhivaya-versiya-watch` — the version in the journal of the live process against the version on disk, for shared carriers; since B-N-1979 also the «ИНСТРУМЕНТ» (tool) kind: the bridge line «[dsh-tool-bridge] ostrovApi НЕ установлен: <причина>» (ostrovApi NOT installed: <reason>) in the live pid journal (the plugin's latest apply) → an alert «ostrov_api не поставлен» (ostrov_api not installed) naming the service and the reason, repeated once a day, "back in order" after a restart or a re-apply without it. It does not see a missing `ostrovApi` block or `enabled: false` (the bridge stays silent) or tool failures at call time. Since 3.1.37 (B-N-2111 (25)) there is also the "shared directory" carrier: `/opt/agent-plugins/<package>/package.json` (for now only `dsh-telegram-multiagent`) against every agent service whose live pid journal has the startup line «[<package> X.Y.Z · …] подъём»; the service list comes from the journal, not from `used_by`. An agent service with no pair at all is named by the line «служба без пар: K — …» (service without pairs), the summary is «пар N · служб M · без пар K · …»; "without pairs" does not go into the alert. A service whose startup line was rotated out of the journal is not seen by the shared directory carrier.
- `svodka/svodka-sostoyaniya.sh`, `svodka/verdikty-priyomki.sh`, `polozhit-svodku` — a snapshot "what is in live, on disk, in the registry" and the acceptance verdicts by measurement.
  ⚠️ The summary does not only read: on every call `verdikty-priyomki.sh` runs `git fetch --quiet` of the tree `/opt/iskra/workspace/dsh-plugins`
  from its `origin`, that is, it goes to the network. If the fetch fails — the line «⚠️ свежесть НЕ обновлена» ("freshness NOT updated") and the previous data. The verdicts themselves
  are taken from the local `HEAD` by default; `origin/master` — only with the key `--origin`.
- `vorota-obezlichivaniya` — the secrets gate before publication (since 1.0.20): an exact occurrence of the machine's real secrets (and their base64) from the sources named in the tool's header, and known token prefixes; it does not check names, machines, paths, IPs, domains. Run as root.
- `proba-chastnyh-imen` — a manual tool: a search for our private names, machines, paths. Since 3.1.1 `--kontrol` checks the probe itself on a built-in stub text (made-up stems with inflection and upper case).
- `proverit-env-ekzemplyara` — a check of the env of a gateway instance before a restart.

## Dependencies

- Runtime: executable `npm-sostav` in PATH, provided by dsh-pribory 3.1.2 or newer; it needs jq. Montazh is a tree package without package.json and declares no npm dependency. The deployment hand installs the helper first. Bash uses `command -v`, Python uses the equivalent `shutil.which`; absence returns code 2 with the reason above.
- The single allowed declaration for an npm manifest is an optional peer with `^3.1.2`, never a required peer or a `>=` range. It does not replace the runtime check:

```json
{"peerDependencies":{"dsh-pribory":"^3.1.2"},"peerDependenciesMeta":{"dsh-pribory":{"optional":true}}}
```

- Programs: bash, python3, git, npm (pack/`--dry-run`), node, tar, sha256sum/md5sum, systemctl, journalctl, sudo,
  `systemd-run` (the gates run the stand runner as a separate service), `setpriv` (the trace helper and the tag watcher call git as the owner of `.git`).
- `python3` for `vorota-obezlichivaniya` — with the `filter` key of `tarfile.extractall` (PEP 706): Python 3.12 and newer, in 3.8–3.11 —
  from releases 3.8.17, 3.9.17, 3.10.12, 3.11.4. On an older Python the archive check ends with «внутренняя ошибка TypeError» ("internal error TypeError"), code 2.
- `sqlite3` (CLI, OS package `sqlite3`) — when installing into an agent profile, `smontirovat-fajly` counts the letters in the receipts database with it.
  Without it the agent's busy state cannot be established, and the installation into the profile is refused (the only bypass is the key `--profil-na-hodu='<почему>'`).
- `flock` (util-linux) — the installation lock in `smontirovat-fajly`; `rsync` (OS package `rsync`) — `perenos-v-derevo`, without it BLINDNESS, code 2.
- The list of private-name stems `/usr/local/share/chastnye-osnovy.txt` (override — `PROBA_SPISOK`; not in the package, put in place by hand) is needed only by
  the ordinary (manual) mode of `proba-chastnyh-imen`: no list or an empty one — a refusal with the reason, code 2. `--kontrol` does not read the machine's list.
- The python module `yaml` (PyYAML): read by the gates (copy comparison, tree mode), by the watcher of tags past the gates and by the copy stand.
- The account that calls `vypusk-tegom` needs passwordless `sudo -n`: the trace helper, the runner's `systemd-run`,
  the copy comparison and `stat /proc/1/root…` (visibility of inputs to the service) go through it.
- The directory `/var/lib/vypusk-tegom` (root:root, not writable by group and others; 755 in live) — the journal of the gates trace. No file of the package
  creates it: the installation does (see installation). No directory, or it is writable by group/others — the trace is not written, the gates
  go blind (code 2), and so does the tag watcher.
- `python-padenie-70` from the package `dsh-storozha-mashiny` — all three drop-ins `60-python-padenie-70.conf` call it.
- `/usr/local/bin/agent-alert` (package dsh-trevogi) — the voice of all four timer units: the cleaner `montazh-srok` and the watchers
  `strahovanie-modulej-watch`, `zhivaya-versiya-watch`, `metki-mimo-vorot-watch`.
- `/usr/local/bin/obyortka-krasneet` (package dsh-pribory) — `vypusk-tegom` checks the stand wrappers with it. No tool — the gates print
  «⚠️ обёртки стендов НЕ проверены» ("stand wrappers NOT checked") and go on: this means "not looked at", not "clean".
- The runner `/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh` and the environment of the unit `vse-stendy-boevye.service` (package dsh-obhod-stendov) —
  `vypusk-tegom` runs them as the behavioural run (overrides `OBHODCHIK`, `OBHODCHIK_SLUZHBA`).
- `/usr/local/libexec/svodka/priznak-vzyatiya.mjs` (package dsh-pribory) — `svodka-sostoyaniya.sh` takes the "taken" sign of the profile's plugins
  with it (`sudo -n node …`). No file, or the tool did not answer (code not 0 or no line «корень разрешения:») — the summary prints
  «СЛЕПОТА: признак взятия не снят — <причина>» ("BLINDNESS: taken sign not taken — <reason>") and exits with code 2; the same with the line «конфиг профиля не прочитан» ("profile config not read"). `polozhit-svodku`
  on a non-zero code writes «снимок неполон» ("snapshot incomplete"). The tool path override is `SVODKA_PRIZNAK`, for the stand only.
- `podyom-uzla` (package dsh-podyom) calls `summa-predmeta-rezhim`.
- `smontirovat-vypusk` works with the tree `/opt/iskra/workspace/dsh-plugins` (the path is hard-coded, `R=`).

## Installation and removal (by root)

Installing a file: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>` (mode from the table, file in the package, path on disk); in live — through
`smontirovat-fajly` after the gates. Units: put into `/etc/systemd/system/` (a drop-in — into its own `*.service.d/` directory),
`systemctl daemon-reload`, `systemctl enable --now <имя>.timer`.

The trace helper goes into its own directory: `install -d -o root -g root -m 0755 /usr/local/libexec/vypusk-tegom`. The watcher of tags
past the gates is enabled in this order, as root:

```
install -d -o root -g root -m 0755 /var/lib/vypusk-tegom
/usr/local/sbin/metki-mimo-vorot-watch --snimok        # ОДИН раз: снимок исторических меток
systemctl enable --now metki-mimo-vorot-watch.timer
```

(The comment in the block: ONCE — a snapshot of the historical tags.) The snapshot `--snimok` writes `/var/lib/vypusk-tegom/istoricheskie-metki.tsv` (0444) — all tags of the registry trees at that minute. Without
the snapshot the watcher goes blind. A second `--snimok` is refused (code 1): to retake it would legalise everything that came after the journal.

Removing a unit is `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file into a backup (`mv`), `daemon-reload`, `mask`; to bring it back — `unmask` and the file back.

## Check

The checksum of every package file = the checksum in live (`sha256sum`), modes = the table (`stat -c '%a %U:%G'`); timers —
`systemctl list-timers montazh-srok.timer strahovanie-modulej-watch.timer zhivaya-versiya-watch.timer metki-mimo-vorot-watch.timer`.
The outcome of the last run of the tag watcher is `/var/lib/metki-mimo-vorot-watch/itog.json` (fields `code`, `krasnyh`, `dostavleno`,
`istoricheskih`, `text`, `checked_at`); the healthcheck reads it.

The package's stands (both run the real gates on a copy and do not touch live):
- `test/stend-vypusk-kopii.py [путь ворот]` (path of the gates) — copy comparison, scope of the release stands, release by places, metapackage. Temporary directory —
  in `TMPDIR` if set, otherwise under `/var/tmp`. Needs python3 with `yaml`.
- `test/stend-metki-vorot.sh [ворота] [помощник] [сторож]` (gates, helper, watcher) — 27 probes of the gates trace and the tag watcher on a temporary git tree,
  a temporary journal and a stub alert channel; it does not touch the live journal or `agent-alert`. Needs `sudo -n` (the helper and the watcher —
  as root). Temporary directory — `${TMPDIR:-/var/tmp}`. The nightly run calls it at the path `/usr/local/libexec/stend-metki-vorot.sh`
  with `TMPDIR=<каталог временных файлов обхода>` (the run's temporary directory): in the run's unit `/var/tmp` is private.
- `test/stend-metka-do-sleda.sh [ворота] [помощник]` (gates, helper) — 4 probes of B-N-2115(b): npm mode, "tag already exists"
  checked before the trace is written (no tag → «✅» and a trace line; tag by directory / by package name exists → REFUSAL code 1,
  no line; tags removed → «✅» again). Temporary git tree and its own trace journal; the live journal is not touched. Needs `sudo -n`;
  stand runner — `STEND_OBHODCHIK`. Caller — the `vypusk-tegom` edit gate; not in the nightly run.
- `test/stend-obshchaya-kopiya.py [ворота]` (gates) — B-N-2121 probes (3.1.43): a shared copy with the `obshchaya` field, transient systemd-run
  services (direct node, a wrapper naming the root, a wrapper not naming it — found by process, a mention without execution), a root snapshot
  before/after the stands. Needs a registered agent caller with `sudo -n`; stops its own services by name. Caller — the `vypusk-tegom` edit gate.
Codes: 0 — all probes agreed, 1 — not; `stend-metki-vorot.sh`, `stend-metka-do-sleda.sh` and `stend-obshchaya-kopiya.py` also have 2 — blindness (no `sudo -n`, no temporary directory).


## Release scope of an npm package (B-N-1823)

`vypusk-tegom <каталог>` reads `plugins` and `services` from `/etc/agent-registry/plugins.yaml`
(override for a candidate: `VYPUSK_REESTR=<абсолютный путь>`). The copy directory of a `plugins` entry is
its `path`; of a `services` entry — `path`, if it is an absolute directory with `package.json`, otherwise
`source.address` with `source.type: local-dir` (an address file — its directory). A `services` entry
without such a directory is counted as a separate line "not package copies", not "not judged".
The family is all entries whose `package.json.name` in the copy directory equals the release name.
The id, the directory name and the already installed version do not define the family. A missing
`path/package.json` (including a file path or a descriptive path) and a non-absolute path
are named one by one as "not judged". An access/read error of the metadata or a damaged
JSON gives blindness, code 2. Explicitly selecting a non-judged entry also gives blindness.

By default the release applies to the whole family when the release directory has no matching `derevo` entry.
When both directory copies of the npm family and matching derevo entries exist, an explicit
`VYPUSK_KOPII` is mandatory: otherwise code2, "область не задана", with the entry IDs.
With no directory copies, all matching derevo entries are judged automatically, as in K3.
Adding a copy makes the scope ambiguous and requires an explicit choice; the gate does not
create a default scope file. A partial release without `derevo` is also explicit:

```json
{"package":"dsh-tool-bridge","version":"1.3.38-b1825","copies":["dsh-tool-bridge-varvara"]}
```

```bash
VYPUSK_KOPII=/absolute/path/copies.json vypusk-tegom /absolute/path/release
```

The list is bound to the name and the version; its SHA256 is printed in the output and in the annotation.
An unknown, repeated, foreign or non-judged id, an empty list and a wrong binding
give blindness. A copy whose directory is the release directory itself also gives blindness: comparing
with itself proves nothing. Excluded family members are named one by one. The runner's
directories do not set the scope of release equality; which stands it runs — see
"Scope of the release stands" below. After the behavioural run the tarball and the tree's stands
are compared with each selected copy. Stands are compared in both directions. A byte
mismatch is a refusal, code 1. `STENDY_INACHE` skips the behavioural run with an honest
reason, but not the copy comparison. All notes of the annotated tag contain the scope.
Readers — the releasing hand and the acceptor; the annotation is read with `git show <тег>`.

Limits: unregistered copies, the legitimacy of the selected subset, extra
live files outside the tarball and the stand samples, file modes/owners, import by the live process
and the behaviour of each environment are not checked. An entry without metadata is not considered a proven
foreign copy. The mode of a tree package without `package.json` works by the former `derevo`.
One pass, no retries; limits: 4096 `plugins` and `services` entries together, 256 selected copies,
16384 tarball files. The gates install nothing and do not put the tag themselves.

The acceptor also runs `python3 test/stend-derevo-kopii-scope.py <gate path>` from the candidate:
implicit scope, renamed source, malformed subdir, external corruption and restoration.
This is a separate source probe; the installed nightly suite does not call it automatically yet.
Copy probes: `python3 test/stend-vypusk-kopii.py <путь ворот>`. The installed path
of the stand is `/usr/local/libexec/stend-vypusk-kopii.py`; it is called by the standard
`stend-vorot-vypuska.sh` from `dsh-obhod-stendov`, the candidate override is `STEND_KOPII`.
Install the gates, the new copy stand and the adaptation of the standard stand in one window;
add the new installed path to `derevo.files` of the registry. Installation/accounting —
by the assigned installing hand after acceptance.

### Release by places (entry `derevo`, since 1.0.13)

With no directory copies, all derevo IDs matching the release `subdir` are selected automatically.
With copies present, an explicit `VYPUSK_KOPII` selects one or several matching IDs;
same-family copy metadata remains a valid binding. The gates compare every declared place of the selected IDs:
each `files.local` byte by byte with `files.remote` of the release tree; files from `expected_diff_files`
are skipped. A mismatch is a REFUSAL with the list "remote → local", code 1. If the entry names a file
that is not in the tree, or all places are skipped — BLINDNESS, code 2. Mixing derevo IDs and copy IDs
in one scope is not allowed. Excluded derevo IDs are named. No entry — the former blindness "no registered
copies". Tag annotation: `derevo=<id>; files=N; registry_sha256=…`. The mode and owner of the places are not
compared, only the bytes.

### Metapackage (since 3.1.3)

If `VYPUSK_KOPII` is not set, there are no copy directories and no `derevo` entry, and the package name is in
the gates' closed list of metapackages (currently only `dsh-pamyat`; it is extended only by editing the gates),
the release copy is the shelf archive `/opt/agent-plugins-tarbally/<имя>-<версия>.tgz` (name, version). A metapackage has no
live copies by construction: the set's umbrella is not installed on the machine. The archive is opened without
following a link and must be a regular file owned by root, not writable by group or others, no larger than
256 MB. The archive is not unpacked: its members are read in memory and compared with the gates' tarball both ways.

- Match — «МЕТАПАКЕТ <имя> <версия>: копий в бою нет по построению; копия выпуска — архив полки
  <путь> SHA256=…; файлов N из N» (metapackage: no live copies by construction; the release copy is the shelf
  archive; files N of N), then the gates continue as before.
- An archive member that is not a regular file or directory (symbolic or hard link, device, FIFO), has an
  absolute path, «..», lies outside `package/` or repeats — REFUSAL with the member names, code 1.
- The archive ≠ the gates' tarball — REFUSAL «… ≠ тарболу ворот: различаются / лишние в архиве / нет в архиве: …»
  (differ / extra in the archive / missing from the archive), code 1.
- The archive is missing, did not open without following a link, is not a regular file, is not owned by root,
  is writable by group or others, is larger than 256 MB, is unreadable or has more than 16384 files — BLINDNESS, code 2.

Tag annotation: `polka=<путь архива>; sha256=…; files=N; registry_sha256=…` (archive path) (with a shelf override, also
`podmena_polki=…`). The name is not in the list — the former blindness "no registered copies".

The shelf override `VYPUSK_POLKA_DIR` is only for the stand. Set without `VYPUSK_ZHURNAL_DIR`, or with it leading
(by `realpath`) to the live `/var/lib/vypusk-tegom` — REFUSAL at the very start of the gates, code 2: nothing
compared, no trace. Set empty — BLINDNESS on the metapackage path. With the override, «ПОДМЕНА полки: …»
(shelf override) is printed.

The gates do not catch a replacement of the archive on the shelf by a hand with `NOPASSWD ALL` before the run and
do not judge the set's member composition — that is `stend-sostava` in the same gates.

### Scope of the release stands (since 1.0.14)

Before the runner, the gates build a plan with the same copy selection:
- `VYPUSK_KOPII` is set — stands run only on the selected copies, not in the runner's live
  scope. The list is the stands of the release tree on each copy. A copy of another account — under that
  account (the directory owner), platform root `/opt/<учётка>/app`; if it is missing — BLINDNESS.
  If the plan by `VYPUSK_KOPII` is not built (unknown id etc.) — BLINDNESS at once, not a single stand
  is run.
- a package by places (entry `derevo`) — the stands of the release tree run; if there are none — BLINDNESS «в
  дереве выпуска стендов нет» ("no stands in the release tree").
- a metapackage — the runner's former scope and list (plan «OBYCHNO», the shelf archive is not read when the
  plan is built): the umbrella's stands run in the ordinary scope.
- otherwise — the runner's former scope and list.

The scope and the list go to the runner in the variables `OBLAST_STENDOV` and `PERECHEN_STENDOV`.
The account of an individual stand is taken from the runner's own scope line (`путь @учётка корень`).

### How the gates run the stand runner (since 1.0.15)

The runner does not run in the caller's process but as a separate service:

```
sudo -n systemd-run --wait --pipe --collect -p User=<зовущий> -p UMask=0022 -p RuntimeMaxSec=3000 …
```

The groups are fresh for the account (the caller's extra groups are printed in the line «среда стендов» ("stand environment") and do not
reach the stands). The environment is the whole environment of the unit `vse-stendy-boevye.service` plus the runner overrides
set by the caller; the unit's environment wins. The values go into the argv of `sudo` and are visible in `ps` and `/proc`
to all accounts while the run lasts: do not put secrets into the unit's Environment or into the overrides.

- No `sudo -n systemd-run` — BLINDNESS; the gates do not run stands in the caller's process.
- The runner returned 1 without the final line «ПОКРЫТИЕ:» ("COVERAGE:") — BLINDNESS «обходчик оборван» ("runner cut off") (this is
  how systemd-run also answers a death by limit, signal or OOM). The limit override
  `VYPUSK_OBH_PREDEL_SEK` — only for the gates stand, it is printed.
- When the scope of the release stands is set (copies or places), before the run the gates check that
  `$VREM` and the scope paths are visible to the service: device:inode at the caller must match
  `/proc/1/root<путь>`. No right for `sudo -n stat /proc/1/root`, or the input is not readable by the
  caller itself — BLINDNESS; no match — BLINDNESS «/tmp зовущего ≠ /tmp службы» ("caller's /tmp ≠ service's /tmp"; the caller is
  under PrivateTmp). Advice — set `TMPDIR` to a shared path outside `/tmp` and `/var/tmp`.

### Gates trace (since 1.0.17)

The gates do not put the tag — the hand puts it on «✅». Right before «✅» (in both modes) the gates
call through `sudo -n` the helper `/usr/local/libexec/vypusk-tegom/zhurnal-zapis`. It (as root) itself
finds the repository of the release directory, computes the commit, the tree of the directory and its cleanliness; it calls git as the
owner of `.git` through `setpriv`, without writing the index. It appends the trace line to
`/var/lib/vypusk-tegom/zhurnal.tsv` (0644), puts a copy of the full run output into
`/var/lib/vypusk-tegom/vyvod/`, and its checksum into the trace line. The helper accepts the output file only as a regular file
owned by the caller (`SUDO_UID`) and opens it without following a link; otherwise — blindness. Before the helper the gates wait
until the output is fully written: not written within 10 s — «СЛЕПОТА: вывод ворот не дописан…» ("BLINDNESS: gates output not finished"), no trace.

| helper outcome | helper code | what the gates do | gates code |
|---|---|---|---|
| trace written | 0 | «✅ можно ставить ЛОКАЛЬНЫЙ тег» ("a LOCAL tag may be put") | 0 |
| release directory ≠ HEAD (dirty) | 3 | «🔴 ОТКАЗ … Закоммить и повтори» ("REFUSAL … commit and repeat") | 2 |
| directory outside git — no `.git` in it or above (run on a copy) | 4 | «✅ ПРОБНЫЙ ПРОГОН, метку по нему сторож не примет» ("TRIAL RUN, the watcher will not accept a tag by it") | 0 |
| blindness: no journal directory, it is not root or writable by group/others, `.git` is owned by root, git did not answer — including `.git` found but git as its owner refused (dubious ownership; since 3.1.32, formerly "outside git" 4) | 2 | «СЛЕПОТА: след ворот не записан» ("BLINDNESS: gates trace not written"), no «✅» | 2 |

The gates code 2 here also happens on a refusal (dirty directory): the general "refusal = 1" does not
apply to the trace. The overrides `VYPUSK_ZHURNAL_ZAPIS` (helper path) and `VYPUSK_ZHURNAL_DIR` (journal
directory) — only for the stand. Limit: accounts with `NOPASSWD ALL` can forge the trace —
the goal is "a tag past the gates is visible", not "impossible".

`vypusk-tegom` codes overall: 0 — the tag may be put (or a trial run without a trace); 1 — refusal
(including: the runner is not green, the release ≠ copies, places or live; in tree mode — the tag already
exists); 2 — blindness, and also the refusals "directory is dirty" and "shelf override with the live journal".

## Watcher of tags past the gates (`metki-mimo-vorot-watch`, since 1.0.17)

The watcher judges every tag of the trees `derevo.address` of the registry (`plugins` and `services`) and every
tag `derevo.ref`: a tag must have a gates trace with the same version and the same package, and the tree
of the directory in the tag must equal the tree from the trace. Red is called by name:
- «МИМО ВОРОТ» ("PAST THE GATES") — there is no trace for the tag;
- «НЕ ТО, ЧТО СУДИЛИ» ("NOT WHAT WAS JUDGED") — the trace exists, but the contents of the directory in the tag differ;
- «ПЕРЕНЕСЕНА историческая метка» ("historical tag MOVED") — a tag from the snapshot now points to another object;
- «РЕЕСТР ССЫЛАЕТСЯ НА МЕТКУ, КОТОРОЙ НЕТ» ("THE REGISTRY REFERS TO A TAG THAT DOES NOT EXIST") — `derevo.ref` points to nothing. Since 3.1.28 (B-N-1978): if an
  open `montazh-okno` window names `entry:<id>` of that record, this is the files → tag → record gap — the watcher prints
  «ОТЛОЖЕНО …» and stays silent. Helper: `MMV_MONTAZH_OKNO` (default `/usr/local/sbin/montazh-okno`); no window, an expired
  window or a helper failure keeps the old red. An overdue window is reported by `montazh-okno watch`. The other three kinds
  are never deferred.

Historical tags (put before the journal) are taken from the snapshot `--snimok` (see installation): with the
same object — not red, they are counted as a number broken down by package in the summary. Without the snapshot the watcher
goes blind.

The voice is `agent-alert --plain`; what was said is remembered in `/var/lib/metki-mimo-vorot-watch/skazano.txt`
and is not shouted again; the mark is set only after delivery. The outcome is `itog.json` in the same place.
Codes: 0 — no red; 1 — there is red, all of it already said; 3 — new red (said or not —
in the output and in `itog.json`); 2 — blindness (the registry is not parsed, no snapshot, the journal or its directory is
not root or writable by group/others, the tree tags are not read). An unknown argument is a refusal, code 2.

Variables — for probes: `MMV_REESTR` (`/etc/agent-registry/plugins.yaml`), `MMV_ZHURNAL_DIR`
(`/var/lib/vypusk-tegom`), `MMV_ALERT` (`/usr/local/bin/agent-alert`), `MMV_STATE` (otherwise
`STATE_DIRECTORY` of the unit, otherwise `/var/lib/metki-mimo-vorot-watch`).

Unit: oneshot as root (agents' working trees are closed 750), `SuccessExitStatus=1 3` — only blindness counts as a
unit failure; `StateDirectory=metki-mimo-vorot-watch`, `ProtectSystem=strict`,
`ProtectHome=read-only`, `PrivateTmp=yes`, `TimeoutStartSec=5min`. Timer — `*:0/15`, spread 60 s,
`Persistent=true`. Does not catch: a forged trace by a hand with `NOPASSWD ALL`, a tag put and removed
between runs, tags outside the registry trees, the correctness of the gates themselves.


## B-N-2032: tree ownership and loaded commands

Before replacement, the files installer passes SMF_REESTR_PL to the shared helper. Exact derevo.files.local owners gain entry subjects with relational closure checks. Broken registry/PyYAML/ambiguous ownership refuses before mv. Closing requires planned file hashes/permissions and the current derevo/ref agreement, checked by the existing VOW Python consumer without running its guard or alert channel. Identity, address, subdir and each installed local-to-remote binding are pinned; duplicate local/remote paths refuse. The repository comes from VOW loaded Environment/EnvironmentFiles. The supported profile is literal Environment and one regular single-line EnvironmentFile without escapes, specifiers or multiline values. Unknown syntax refuses. Registry/configuration/ref/file generations are rechecked before closed. Existing explicit plans must include the new derevo_consistency/owned_files checks; file-only plans for owned targets refuse. Mapping changes require an explicit accepted plan.

The read-only test/stend-flagi-okna.py checks Id, LoadState and effective ExecStart executable/argv of the four named readers. Since B-N-2037 it also judges values effective after configuration: registry-watchdog VERIFY_CMD/DORABOTKI_CMD/HEALTH_CMD built like the watchdog does (unit environment → its own default lines → /etc/registry-watchdog/registry-watchdog.conf) must carry the flag in all three in automatic mode and in none in manual mode; MONTAZH_OKNO_BIN of all four must be empty or /usr/local/sbin/montazh-okno. The conf is executed by the stand's account, as by the watchdog. The direct reader or its approved crash wrapper must preserve the exact automatic flag. Healthy0 is silent, red1 names the unit, missing/ambiguous data is blindness2. Four calls,5s each. No starts, state writes or channel calls. The nightly runner reads the result. This does not inspect old running argv or the reader's flag parser. --proba explicitly reads copied JSON. The existing1800s window limit remains; actual in-scope deployment errors can also be deferred. Live acceptance remains separate.


Entry closure also runs the current installed_check/fingerprint_check through the registry consumer's actual run(...,verify=True), at most15s each, for this entry only. The authoritative registry already grants these commands to root verify; window JSON accepts no command fields. This registry must be regular, root-owned and not world-writable; trust in its authorised write group is the existing registry-watchdog boundary. Command/value failures leave the window open. MO_REESTR_PRIBOR explicitly substitutes the existing run source in fixtures. Compared values and command stderr are not printed by the closure helper.

## B-N-2082: removing a file from derevo (3.1.34)

A file that is no longer in the entry and has not moved to another entry is accepted at window close only with a `--snyat` trace: the old name is absent, its bytes are in the backups `/var/backups/montazh/<task>/*.tar` (and `…-s-klyuchom`) exactly once, and exactly one `<name>.SNYATO-*` with the same sum lies next to it.
**The `--punkt` of the removal must equal the window task; otherwise a removal from derevo does not close.** `--snyat` does not open a window itself.

## B-N-2111 items 31(a)+(b): registry shape first, release window second (3.1.40)

When a release changes the **registry entry's shape**, adding `installed_check`/`derevo` paths for files that **already exist on disk**, use this order (Veniamin's decision, Zabava's order of 17 October 2026 22:40:34 UTC):

1. **A separate registry-only step before opening the release window.** Prepare the new entry shape with values for the **current installation** (`version`/`fingerprint` from its checks), preserve the previous entry, apply `agent-plugins pravka` against the captured baseline, then run strict `verify` without `--avto-montazh`: matching, not deferred. Do not substitute future release values or change files in this step. Accept the shape change separately; protection of existing files only grows at this point.
2. **Then open the ordinary release window.** Its plan is built from the already expanded live entry. A `smontirovat-fajly --okno-id` join sees the declared path, and the check path set matches the plan at closure. The files, release tag and final entry values still pass the ordinary window checks; joining gains no right to expand the plan or extend its deadline.

**Example — `dsh-pamyat-obsluzhivanie 3.1.5`:** `/usr/local/lib/systemd/system/dsh-pamyat-obsluzhivanie.service` already existed on disk but was absent from the entry. With those starting conditions, first include the existing unit in the entry's shape, recompute values from the current files and obtain a matching `verify`; only then open the release window. This is an ordering rule, not weaker “producer is outside immutable plan” or “check paths changed” checks.

**Boundary:** when a release brings a new file into a directory covered by no entry, the absent file cannot be registered in advance and verified against the current installation. This order does not apply: return to design option (1), a plan naming the registry candidate at opening, and decide the specific case separately. That is not an implemented feature of the current CLI. Explicit expansion of an open plan, option (2), was rejected; there is no automatic workaround for this boundary.

**Forward closure and rollback use different plans:** `zakryt`/`vosstanovit` verify forward `checks`; `otkat-proveren` uses its own inverse plan (the protected `rollback_plan` for a copy window, an accepted complete inverse plan for a generic window). Do not replace them with one shared forward plan. Verified rollback proves the original snapshot, not copy health.

## B-N-2034: one derevo entry, files in several directories

The registry check now pins ALL `derevo.files` of the entry, not only the call's targets, so it is identical for calls in different directories. Order: the first `smontirovat-fajly` opens the window (prints "ОКНО МОНТАЖА: ID"); every further directory of the same entry joins with `--okno-id ID`; close with `montazh-okno zakryt ID` after the last directory, the tag and the registry write. A join adds only file checks of its own targets owned by an entry whose check is already in the window and equals the call's check; the deadline is not extended; a target already declared as a subject must match exactly; a file outside the window's entries refuses before replacement. The window cannot close before the last directory: the derevo/ref check sees unmounted files. NOT CAUGHT: a directory of the same entry mounted without any window (manual install) stays outside it and readers stay strict; files the derevo entry does not list.

## B-N-2039: a new package in several directories and entries without derevo

**3.1.40 qualification:** the earlier B-N-2039 procedure below does not authorize bypassing items 31(a)+(b): a new file in a directory covered by no entry requires a separate decision under the boundary above; several separate windows do not automatically replace that decision.

The "ОКНО МОНТАЖА" line names `--okno-id` ONLY when the window holds an `entry:` (a derevo entry already in the live registry). A new package in 2+ directories: one window per directory (no `--okno-id`), each closed right away; until the registry write nobody watches the package; strict acceptance is the release watcher's tick after the write. Single-file entries and profiles (entries without derevo) whose files are mounted are not covered by the window — either take them into the same window as the registry write or expect the registry-watchdog alert (Zarya's B-N-2039 design, option C).

**Joining under a different task is refused before writing** (B-N-2111 (23)): with `--okno-id`, `smontirovat-fajly` requires the call’s `--punkt` to exactly match the window’s `task` before backups, temporary files or the installation lock. A mismatch exits 2 and names both values. An empty or missing `task` in an old window is also a refusal; it is not inferred from the call. An empty `--okno-id` is rejected. The same rule applies to `--progon`. Backups therefore remain under the window task directory used by `verify_removed`.

The check applies only to joins with `--okno-id`: one JSON read with a 2 MiB limit, no writes or retries; it does not run without `--okno-id`. Full schema, phase, boot and deadline checks remain in `montazh-okno podgotovit`. This check does not exclude concurrent replacement of the window by another root between the early read and later installation, or installation outside the tool.

## B-N-2042: entries without derevo — in the window by the path in their check (3.1.14)

Since 3.1.14 the B-N-2039 note on entries without derevo is narrowed. `podgotovit` puts `entry:<id>` into the window for every entry WITHOUT `derevo` that has an `installed_check`, when the call's target exactly equals an absolute path standing as an ARGUMENT in its `installed_check`/`fingerprint_check`. A path in command position (`/usr/local/bin/x --version`, `sudo -n /x …`) is a tool, not a subject. A bare "/", top-level directories and `/dev`, `/proc`, `/sys` are not taken. A target UNDER an entry's directory counts only for the directory of an explicit `cd` of depth ≥3 that no other entry `cd`s into or below; otherwise a line `СЛЕПОТА: запись <id> — cd …; окно её не берёт` is printed instead of an `entry:` for everything. `agent-plugins verify --avto-montazh` defers such an entry (`list --health` only entries with `montazh_consistency: true`). A file that is both in a package's `derevo.files` and in a single-file entry puts both `entry:` subjects into the window. A second directory of the same entry joins with `--okno-id`.

**Inside the window, after the preparatory step for an entry shape change (items 31(a)+(b)): files → registry `pravka` IN THE SAME STEP, within 1800 s → `zakryt`.** The window closes only when the entry's `version`/`fingerprint` match the machine: before `pravka`, `zakryt` reports "НЕ ЗАКРЫТО". Miss the window's deadline and the deferral ends; `montazh-okno-watch` alerts the owner about the overdue window. The "ОКНО МОНТАЖА" line says so.

Coverage on the live registry, 14.10: 50 of 109 entries without derevo (45 of the 81 whose files were mounted in 7 days). Not covered: entries installed by `smontirovat-vypusk`, the platform window or npm (no registry is passed to the window); paths built through variables, substitutions and globs; a level-2 `cd` (`/opt/claude-oauth`, `/opt/subscription-gateway-guest`, `/opt/agent-skills-gws`) and omega's shared `site-packages`; entries without `installed_check` — for those the B-N-2039 rule stands (pravka in the same window or an expected alert).

## B-N-2043 step 1 — SMV registry and release tag (3.1.19)

SMV pins its source commit before archiving, sends the registry (SMV_REESTR_PL; default /etc/agent-registry/plugins.yaml) plus typed --release data to the helper, and publishes file/entry/tag before the first replacement. The manifest row must match the pinned source. A short public tag:R:T is resolved strictly via refs/tags/T; branch names cannot substitute for release tags. The effective VOW repo and unique current aliases are checked before publication and at closure. Manual plans/join must already carry the same required checks; join cannot add another tag/commit or extend the deadline. tag_absent checks current tag absence for a verified rollback without inventing a release.

Heavy gates must run BEFORE the deployment window for every package (Zabava14October06:47:51Z, option a). Run full stands, including wrapper probes, on the source/a twin of the same pinned commit C. Preserve contents, time, tool and result. After files and registry `pravka`, call `vypusk-tegom` with `STENDY_INACHE` naming that evidence/C, then publish the tag on C and close. Changed code needs a new pre-run; byte equality remains mandatory, and the evidence belongs in the annotated tag.

Window TTL is at most1800s from first publication; the gate walker3000s limit and join do not extend it. New `zakryt` checks same-boot CLOCK_BOOTTIME before verification and again under lock after generation checks: opened_ns≤close_ns<deadline_ns. Expiry returns1 with ID/reason and leaves JSON/open unchanged, without calling the owner channel. Foreign boot or failure to read boot/CLOCK_BOOTTIME returns2; existing strict verification failures retain code1. Alreadyclosed strictly rechecks without refreshing its receipt; failure and verified rollback remain available after expiry. Recovery requires an approved restoration, not deleting/extending JSON.

Measured gate-only upper bounds on sadik, Gamma14October07:04Z: exact sudo COMMAND carrying STENDY_INACHE to the same PID/boot session-close, monotonic timestamps. Historical acceptance is the earlier Zabava/Alfa evidence, not inferred from session-close. Evidence: sadik:/opt/coders/gamma/workspace/MONTAZH-late-close-code-20261014/evidence/NO-STANDS-GATE-INDIVIDUAL.json.

| Package/release | Gate without the main stand branch, seconds | Within1800s TTL? |
|---|---:|---|
| dsh-montazh 3.1.14 | ≤0.695075 | gate step yes; remaining deployment budget separate |
| dsh-obhod-stendov 3.1.39 | ≤1.537803 | gate step yes |
| dsh-socseti 3.1.1 | ≤0.740656 | gate step yes |
| dsh-telegram-multiagent 3.1.6, isolated twin | 0.679770 | measured gate step yes |
| dsh-vypusk-watch 3.1.3, isolated twin | 0.407940 | measured gate step yes |
| other/new contents | not measured | not established before an addressed measurement |

Extension of the06:47:51 mandate, authorized by Zabava07:14:58: STENDY_INACHE also skips the early obyortka-krasneet behavior stage, whose checks on the same C belong before the window. Empty/unset retains that stage. Prior proof is declared, not automatically authenticated or compared with C; the deployment hand and annotated-tag reader own that boundary. Byte equality remains mandatory.

The two new values were measured by Gamma on sadik14October07:42:57–07:42:58Z, monotonic_ns around the real candidate gate, full source package and one registered private twin, private registry and journal-writer recorder; no behavior stands or network. This does not measure real fleet multiplicity or real journal-writer cost. UTC/method evidence: sadik:/opt/coders/gamma/workspace/MONTAZH-late-close-code-20261014/evidence/GATE-TWINS-MEASURE.json. Other contents require their own measurement; these numbers do not bound the whole remaining deployment.


Historical measurement on `sadik`, read by Alfa/coders through read-only sudo on 14 October 2026 at 05:58Z, using Zabava's sources (04:56:29Z message): all seven named units checked. Zabava ran these releases; Alfa reread their traces. Command: `sudo journalctl -u <unit> --since '2026-10-13 23:15:00 UTC' --until '2026-10-14 04:57:00 UTC' -o json`. Select PID 1 events from the JSON. Boundaries: `Started` to `Deactivated successfully`; seconds from `__MONOTONIC_TIMESTAMP` within one `_BOOT_ID`. These intervals cover the release shell and its gate calls, not just the inner stand runner. Contents and gate outcomes below are attributed to Zabava; successful shell termination does not itself prove gate acceptance.

| `.service` unit | Contents / gate outcome | UTC 14 October: start → end | Seconds |
|---|---|---|---:|
| `zab-tag22` | dsh-vypusk-watch 3.1.1, refused | 02:00:11.481108 → 02:00:57.277216 | 45.796 |
| `zab-tag22b` | dsh-vypusk-watch 3.1.1, refused | 02:01:57.211310 → 02:02:44.405344 | 47.194 |
| `zab-tag312` | dsh-vypusk-watch 3.1.2 | 02:29:06.734202 → 02:29:54.069253 | 47.335 |
| `zab-tag313` | dsh-vypusk-watch 3.1.3 | 04:35:35.769183 → 04:36:24.487110 | 48.718 |
| `zab-tagsvod` | dsh-montazh + runner, STENDY_INACHE | 04:27:49.598152 → 04:27:51.871503 | 2.273 |
| `zab-tag311s` | dsh-socseti 3.1.1, STENDY_INACHE | 04:44:08.825573 → 04:44:09.784919 | 0.959 |
| `zab-tag311s2` | dsh-socseti 3.1.1, STENDY_INACHE | 04:44:25.790133 → 04:44:26.557932 | 0.768 |

The four dsh-vypusk-watch runs with npm stands span 45.796–48.718s; the three shells using STENDY_INACHE span 0.768–2.273s. Keep these scopes separate. The count of 14 stands and the selected stand mode are coordinator-supplied facts, not a fresh stand census by this hand.

Heavy `dsh-telegram-multiagent 3.1.6` (version from the tag in the final log): the final full gate call started on 14 October at 00:05:15.398665Z in sudo `COMMAND` with a separate `vypusk-tegom` token. Output `/root/zab-tag-dsh-telegram-multiagent.log` last-write mtime is 00:17:42.013601Z: **746.615s (12m26.615s)** in wall-clock time to the final output write, a historical estimate rather than an exact monotonic process-exit interval. The start was independently matched in `/var/log/auth.log` (same call, receipt timestamp difference <=0.001s). From the first call on 13 October at 23:51:39.261725Z to that output is a **1562.752s (26m2.752s)** retry episode, including the gap between calls; it is not one gate's duration. The first call's separate end and outcome were not recovered by this measurement. `/root/zab-tag32-*.log` files end around 00:28Z and do not establish this episode's start. Attribution of the 23:52/00:07Z alerts to the episode is Zabava's report; their cause was not tested here.

These named intervals and methods supply the missing historical U2 measurement. They do not guarantee that a future release, installation and registry `pravka` fit within 1800s. Outside measurement: a full npm gate for dsh-socseti, dsh-montazh 3.1.19's own gate duration and other heavy releases. The designated deployment hand uses these data to choose the order and budget before opening a window; join/watchers do not extend its deadline. Evidence with journal cursors and log hashes: `sadik:/opt/coders/alfa/workspace/B-N-2043-Sh1-20261014/evidence/U2-*.json`.

DOES NOT COVER: VOW's normal copy-content branch, full-copy obligations and automatic multi-copy plans (step2). Blindness, ambiguity, unrelated copies/repos, expired/failed/other-boot windows and manual strict checks remain strict. Existing K1/K3/K4 ownership tests and closure text are preserved; private tests do not prove live deployment or notifications.

## B-N-2046 / B-N-2047 — package tree and recovery (3.1.23)

New SMV tag checks pin subdir/tree at the source C; commit remains information. Another tag commit is accepted only for exactly the same package tree (contents, paths, modes, links). Existing VOW repo/refs-tags/alias/file/registry/generation barriers stay strict; tag movement during verification remains a race. Legacy checks without tree/subdir retain exact-commit semantics. tag_absent carries no tree fields.

montazh-okno vosstanovit ID strictly verifies the original checks, including expired open/failed, without another plan. Failure1/2 leaves JSON unchanged. Success0 writes closed, and closed_late:true when the original window stopped applying. No opened/deadline/expires/subjects/checks extension and no fictitious rolled_back. Repeated closed retains its receipt; late zakryt still refuses1. After reboot, closed_boot_id identifies the closure clock epoch while the original boot remains historical. Readers only offer strict reread6 in that closure epoch; no new deferral4. Watch skips closed and overlap is released. Failure/rollback clear closure markers.

Optional schema1 fields preserve old records without migration. A read-only candidate validate on sadik14October accepted193old records (155closed/38rolled_back), zero failures, unchanged before/after SHA; this is shape/byte validation, not replay of historical checks. The192-record mandate snapshot changed meanwhile. New-field records require the updated shared parser; old writers must not consume them.

Not caught: wrong trusted root plan/tree, runtime execution, release quality/authority, untracked files, other packages, historical timeliness/rollback, or channel delivery. Legacy exact-commit checks are not silently relaxed. Protocol and source hashes are in P7.

## B-N-2043 Step 2 — whole-copy window (3.1.24)

The exact `copy:<repo>:<subdir>:<root>` key has no version, so new JS with an old manifest keeps its identity. One protected record binds the whole copy, all published files, registry entry, manifest and tag at pinned C. VOW sends its actual policy, registry path and repo/mapping/exception signature; the final lookup repeats the full query and record-generation SHA256. Separate file and tag windows cannot combine permissions.

SMV still installs one target B. For a shared plan pass `--okno-copies /absolute/copies.json`, using the gate selector format `{"package":"npm-name","version":"X.Y.Z","copies":["registry-id-A","registry-id-B"]}`. Under the common deployment lock, the first call freezes publication rows, owners and old snapshots for every selected root before any mkdir/.new inside those roots. Later calls use `--okno-id ID`; each installs only its own B and cannot extend the copy plan or TTL. Start with a target that needs replacement: an already matching first target with a selector refuses with exit 2. A dry run publishes no window and changes no copy; it does not validate every selector ID. Closing requires all selected copies and their registry values to match.

After restoring every root from insurance, use `montazh-okno otkat-proveren ID`. The helper verifies its own protected full baseline, including SHA256, modes/owners, root identity, missing new paths and previous registry ref/version/fingerprint. A caller cannot substitute a shorter snapshot; direct manual copy plans through `otkryt` are refused. The helper verifies rollback, it does not perform it. A previously absent new tag must remain absent; a tag that already existed must not be deleted.

The pure `dsh-vypusk-watch/src/copy-compare.sh` consumer returns JSON and exits 0 match, 1 difference, 2 blindness, never 4. It preserves the previous VOW policy: exclude node_modules and backup/tar names, optional unpublished source paths may be absent, present paths are compared; mapping narrows both sides to literal files plus package.json. Closing additionally verifies the full real npm publication, modes/owners, registry and refs/tags. Closing never runs npm again. The last barrier rechecks the entire scoped name set and file/directory generations after external tag/config checks.

Deploy a compatible composition: consumer, then helper/SMV, then new VOW reader. Install consumer at `/usr/local/libexec/dsh-vypusk-watch/copy-compare.sh`, root:root 0755, and track its source/destination pair in the verified VOW runtime registry inventory. Missing consumer refuses preparation before replacement; reader reports blindness. Source VOW uses its adjacent consumer; installed VOW uses libexec. Zabava assigned dsh-montazh 3.1.24 and dsh-vypusk-watch 3.1.5 to this composition. The test-only `test/fixtures/vow-sh1.sh` stays outside production; it is the unchanged 7c057bbd reader used to distinguish old-reader behavior, never a runtime fallback.

Deferral applies only to addressed known mismatches with `--avto-montazh`, for TTL 1..1800 seconds from first publication. Join never extends the deadline. Manual runs stay strict; blindness, ambiguity, changed configuration, foreign roots, linked published targets and mismatches outside the plan remain strict. Old or already loaded readers do not gain normal-copy deferral without a new execution. This does not detect producer bypass, malicious root, release quality errors or changes after the final barrier; policy-excluded files are outside comparison. Late close remains the separate Gamma task and the Step 1 operational boundary above.

Callers are VOW, strict consumer, helper closure/rollback/linked lookup and single/common-plan SMV. Stands are `test/stend-copy-window.sh`, companion `test/stend-copy-compare.sh`, and existing producer/helper/VOW/registry tests. Acceptance and deployment remain assigned to the reviewer and coordinator.

Copy rollback proves the exact old physical snapshot and full registry-entry digest, without executing old installed_check/health callbacks. It does not establish health; unit readers cannot treat it as a healthy release. Forward close and ordinary VOW retain strict current checks.

The3.1.24 composition preserves Gamma3.1.23: source/archive/fullcopy remain pinned at C; a real refs/tags release may point to another commit only with the same package-subdirectory tree. Ordinary late zakryt refuses; explicit vosstanovit may record closed_late/closed_boot_id after strict verification, without renewing deferral.

### B-N-ZV-ROTACIYA delta from 5688f149: copy ctime

When the startup record is gone and the same PID predates the retained head of its UID journal family (`user-<uid>` for UID ≥ 1000, otherwise `system`) in the current boot, scan the entire copy including node_modules, directories, symlink inodes and targets. A later process-start second gives a separate TIME match, not a proven version. An older process gives SUSPICION and an alert. Equal seconds, unreadable metadata, failed journal reads or a replaced PID stay blind. A wholly unavailable copy has HISTORY only as an explanation inside alertable blindness. Missing history alone is never quiet success.

The isolated child scan is limited to 20s and the remaining 420s total budget. TIME/history cannot announce green version recovery. chmod/chown may cause safe false positives. This is not proof of loaded bytes and does not protect against root, loading another path, or shared carriers that discovery never paired. Existing timer/service and root-only temporary-state tests remain; the ctime module is added to that runner. Deployment/versioning requires external gates.
