Russian version: [README.md](README.md) · English below

# dsh-storozha-sadik — watchers of the sadik machine that did not go into dsh-storozha-mashiny, and their alert channels

Версия · Version: 3.1.10

Current version — see the heading of `CHANGELOG.md` (the package has no `package.json`) and the tag `dsh-storozha-sadik-v<номер>` in the tree.

## Purpose

The package collects sadik service software that is tied to this machine: its agents, tunnels, registries and bots.
Generic watchers live in the neighbouring package `dsh-storozha-mashiny`; this one holds what makes no sense without
sadik. The package is published as source only and is not on npm: it is tied to sadik — `agent-button-daemon.sh`
executes commands from a dropped file, the alert channels write to the owner's private messages, and the watchers
have our machines, addresses and agents hard-coded.

What is inside and who calls it:

- `sadik-watch` — a snapshot of the machine independent of the agents. `sadik-watch.timer` calls it every 10 minutes.
  It looks at agent and gateway services from the registry (`agent-registry`): whether the service is alive, whether
  journal events are fresh, whether there is a prompt-length refusal or a limit cut-off, whether a turn is stuck,
  whether memory is growing. It also checks free space on `/`, the mesh tunnel `awg9` to vps-ru, rule 72 and RU split,
  Varvara's whitelist and sandbox, Varvara's guest rules, the "watchers over watchers" (the list
  `/etc/agent-registry/storozha-sutochnye.txt`), memory maintenance, the configuration of the `agent-alert` channel,
  edits of the plugin registry that bypass `agent-plugins pravka`, root-owned voice directories in `/var/tmp`, and the
  membership of the permission gateway groups (the «группы прав» (permission groups) step calls `gruppy-prav-watch`,
  see below). Once every 7 days it says «жив» (alive) on its own. Alerts go through `dsh-alert`; if that fails, as an
  a2a letter to the agent `iskra`.
- `gruppy-prav-watch` + the reference `gruppy-prav.conf` — members of the permission gateway groups (`limity-vhod`,
  `agent-button`, `claudeoauth`) against the reference: `m` lines in `sysusers.d` or an explicit list with a
  justification for each member (B-N-1913). It checks both supplementary members (`/etc/group`) and members by
  primary group (`/etc/passwd`). It writes nothing outward and changes nothing: `sadik-watch` calls it every cycle,
  and an extra or missing member is an alert naming the account and the group.
- `dsh-alert` — the alert channel «предмет sadik» (subject: sadik) (bot @arg_dsh_alert_bot). It is called by
  `sadik-watch`, `dsh-compact-watch`, and from other packages by `pereklyuchatel-podpiski` and
  `sadik-komandy-priyomnik` (dsh-podpiski).
- `claudeclaw-alert` — the alert channel «предмет aclaude» (subject: aclaude) (bot @idomik_bot); its token is on the
  sadik disk. It is called by `aclaude-snaruzhi-watch`; `dkms-kernel-coverage` uses it as a fallback channel (drop-in
  `50-mashina.conf`); `inet6-poyavlenie-watch` would call it only if `agent-alert` is not in `PATH`.
- `dsh-compact-watch` — the compaction watcher, `dsh-compact-watch.timer` every 5 minutes. It reads the journals of
  agent and gateway services from the registry: compaction events, compaction silence, gateway pressure, series of
  cut-offs, kompakt-dsh summary failures, secretary failures, tools dropped by the gateway. It takes the window
  occupancy thresholds (85/90 % of the compaction threshold) from the instrument `kontekst-zamer`
  (dsh-storozha-mashiny); it also watches the substitution of compaction roles. Alerts go to `dsh-alert`. Since 08.10
  it says nothing to the owner about context filling and platform compaction: `dsh-pamyat-storozha` reports that
  (`DSH_COMPACT_WATCH_MOLCHAT`).
- `aclaude-snaruzhi-watch` — the external «aclaude лежит» (aclaude is down) instrument. `sh1` (every minute) does a TCP
  handshake with the aclaude sshd over two paths; `sh2` (every 2 minutes) logs in over ssh with the forced command
  `proba-snaruzhi` and checks the instances, their webhook servers, the disk and the internal aclaude watchers. The
  alert goes to `claudeclaw-alert`, the fallback is `agent-alert`.
- `chitatel-obhoda` — the reader of the nightly stand run (`vse-stendy-boevye`, 03:40 UTC). Its timer calls it once an
  hour from 04:50 to 10:50 UTC. It puts one letter for the coordinator through `tell-komu` (dsh-pochta): unexpected
  red, «N-я ночь подряд» (Nth night in a row), «снято» (cleared), «прогона нет» (no run).
- `model-podmena-watch` — the model substitution watcher, every 5 minutes. In the gateway journals it looks for an
  answer from the wrong model and for `model/rerouted` from Codex; it also checks that `~/.claude/remote-settings.json`
  is empty for the Claude gateway accounts. Channel — `agent-alert`.
- `sessiya-uderzhana-watch` — the held-session watcher, every 2 minutes. An unfinished `/new` longer than 10 minutes is
  an alert to `agent-alert`, one per episode.
- `socseti-watch` — once a minute asks the status of the `socseti` service (MCP on 127.0.0.1:8381). Telegram stopped or
  no answer — an alert to `agent-alert`, once a day per reason.
- `ostrov-kopiya-watch` — once an hour compares the release of the Ostrov API copy for stands
  (`/opt/agent-plugins-stend/ostrov-api`) with `release` from the site health. Mismatch — an alert to `agent-alert` with
  ready commands to update the copy; it does not update the copy itself.
- `pamyat-fill-watch.py` — once a day (02:00 UTC) checks over 14 days whether the memory of the registry agents is being
  filled: turns, new `pamyat.db` records, secretary completions, OMEGA merges into another agent's root. Read-only; an
  alert to `agent-alert` when the set of findings changes and once a week.
- `pamyat-seam/` — a daily (06:20 UTC) stand of the "secretary → core → restore" chain on the production packages
  `/opt/agent-plugins/node_modules`. If it fails, `pamyat-seam-failed@` sends an alert to `agent-alert`.
- `agent-button-daemon.sh` — the "button": a permanent service that executes commands from the list
  `/etc/agent-button/allowed.conf` on a request file in `/var/lib/agent-button/pending/`. It exists so an agent can
  restart itself: a process outside the agent's process tree does it.

The results are read by the owner (Telegram), the coordinator (letters from `chitatel-obhoda`) and `sadik-watch`
itself: it sees a failed service of any watcher in the daily list as «failed» or «просрочен» (overdue).

## What is installed and where

All 45 files are checked against the `dsh-storozha-sadik` record in `/etc/agent-registry/plugins.yaml` (section
`services`, `derevo.files`). Permissions are not stored in git (only the "executable" bit), so mode and owner are given
as found in production. The `bin/`, `sbin/`, `libexec/` directories mirror paths under `/usr/local/`, `systemd/` —
under `/etc/systemd/system/`, and `etc/` (the group reference `gruppy-prav.conf`) — under `/etc/agent-registry/`.

| File in package | Path on machine | Mode, owner | Who executes / reads |
|---|---|---|---|
| `sbin/sadik-watch` | `/usr/local/sbin/sadik-watch` | 0755 root:root | `sadik-watch.service`; by hand — only `--podtverdit` |
| `bin/dsh-alert` | `/usr/local/bin/dsh-alert` | 0755 root:root | sadik-watch, dsh-compact-watch, pereklyuchatel-podpiski, sadik-komandy-priyomnik |
| `bin/claudeclaw-alert` | `/usr/local/bin/claudeclaw-alert` | 0755 root:root | aclaude-snaruzhi-watch; fallback channel of dkms-kernel-coverage |
| `sbin/dsh-compact-watch` | `/usr/local/sbin/dsh-compact-watch` | 0755 root:root | `dsh-compact-watch.service` |
| `sbin/aclaude-snaruzhi-watch` | `/usr/local/sbin/aclaude-snaruzhi-watch` | 0755 root:root | `aclaude-snaruzhi-sh1.service`, `aclaude-snaruzhi-sh2.service` |
| `sbin/chitatel-obhoda` | `/usr/local/sbin/chitatel-obhoda` | 0755 root:root | `chitatel-obhoda.service` |
| `sbin/model-podmena-watch` | `/usr/local/sbin/model-podmena-watch` | 0755 root:root | `model-podmena-watch.service` |
| `sbin/sessiya-uderzhana-watch` | `/usr/local/sbin/sessiya-uderzhana-watch` | 0755 root:root | `sessiya-uderzhana-watch.service` |
| `sbin/socseti-watch` | `/usr/local/sbin/socseti-watch` | 0755 root:root | `socseti-watch.service` |
| `sbin/ostrov-kopiya-watch` | `/usr/local/sbin/ostrov-kopiya-watch` | 0755 root:root | `ostrov-kopiya-watch.service` |
| `sbin/agent-button-daemon.sh` | `/usr/local/sbin/agent-button-daemon.sh` | 0755 root:root | `agent-button.service` |
| `libexec/pamyat-fill-watch.py` | `/usr/local/libexec/pamyat-fill-watch.py` | 0644 root:root | `pamyat-fill-watch.service` (`python3 -B … --run`, `ExecStopPost … --failure`) |
| `libexec/pamyat-seam/run.sh` | `/usr/local/libexec/pamyat-seam/run.sh` | 0755 root:root | `pamyat-seam.service` (User=coders) |
| `libexec/pamyat-seam/stand.mjs` | `/usr/local/libexec/pamyat-seam/stand.mjs` | 0644 root:root | `run.sh` (via `/usr/local/bin/node`) |
| `libexec/pamyat-seam/failed-v2.sh` | `/usr/local/libexec/pamyat-seam/failed-v2.sh` | 0755 root:root | `pamyat-seam-failed@.service` |
| `libexec/gruppy-prav-watch` | `/usr/local/libexec/gruppy-prav-watch` | 0755 root:root | sadik-watch, step «группы прав» (`python3 -ISB`) |
| `etc/gruppy-prav.conf` | `/etc/agent-registry/gruppy-prav.conf` | 0644 root:agent-registry | gruppy-prav-watch (reference for the membership of the gateway groups) |
| `systemd/sadik-watch.service` | `/etc/systemd/system/sadik-watch.service` | 0644 root:root | systemd; sets the `SADIK_WATCH_*` environment |
| `systemd/sadik-watch.timer` | `/etc/systemd/system/sadik-watch.timer` | 0644 root:root | systemd, `*:2/10` (every 10 min), enabled |
| `systemd/dsh-compact-watch.service` | `/etc/systemd/system/dsh-compact-watch.service` | 0644 root:root | systemd |
| `systemd/dsh-compact-watch.service.d/70-predely.conf` | `/etc/systemd/system/dsh-compact-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/dsh-compact-watch.timer` | `/etc/systemd/system/dsh-compact-watch.timer` | 0644 root:root | systemd, `*:0/5`, enabled |
| `systemd/aclaude-snaruzhi-sh1.service` | `/etc/systemd/system/aclaude-snaruzhi-sh1.service` | 0644 root:root | systemd |
| `systemd/aclaude-snaruzhi-sh1.timer` | `/etc/systemd/system/aclaude-snaruzhi-sh1.timer` | 0644 root:root | systemd, every minute (`*:*:00`), enabled |
| `systemd/aclaude-snaruzhi-sh2.service` | `/etc/systemd/system/aclaude-snaruzhi-sh2.service` | 0644 root:root | systemd |
| `systemd/aclaude-snaruzhi-sh2.timer` | `/etc/systemd/system/aclaude-snaruzhi-sh2.timer` | 0644 root:root | systemd, `*:0/2:30`, enabled |
| `systemd/chitatel-obhoda.service` | `/etc/systemd/system/chitatel-obhoda.service` | 0644 root:root | systemd; `EnvironmentFile=-/etc/default/chitatel-obhoda` (with «-»: without the file the unit starts and the reader refuses by itself) |
| `systemd/chitatel-obhoda.timer` | `/etc/systemd/system/chitatel-obhoda.timer` | 0644 root:root | systemd, `04..10:50 UTC`, enabled |
| `systemd/model-podmena-watch.service` | `/etc/systemd/system/model-podmena-watch.service` | 0644 root:root | systemd |
| `systemd/model-podmena-watch.service.d/70-predely.conf` | `/etc/systemd/system/model-podmena-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/model-podmena-watch.timer` | `/etc/systemd/system/model-podmena-watch.timer` | 0644 root:root | systemd, `*:0/5`, enabled |
| `systemd/sessiya-uderzhana-watch.service` | `/etc/systemd/system/sessiya-uderzhana-watch.service` | 0644 root:root | systemd |
| `systemd/sessiya-uderzhana-watch.service.d/70-predely.conf` | `/etc/systemd/system/sessiya-uderzhana-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/sessiya-uderzhana-watch.timer` | `/etc/systemd/system/sessiya-uderzhana-watch.timer` | 0644 root:root | systemd, 2 min after the previous run, enabled |
| `systemd/socseti-watch.service` | `/etc/systemd/system/socseti-watch.service` | 0644 root:root | systemd; exit code 10 counts as success |
| `systemd/socseti-watch.timer` | `/etc/systemd/system/socseti-watch.timer` | 0644 root:root | systemd, 60 s after the previous run, enabled |
| `systemd/ostrov-kopiya-watch.service` | `/etc/systemd/system/ostrov-kopiya-watch.service` | 0644 root:root | systemd; limits `MemoryMax=128M`, `MemorySwapMax=0`, `TimeoutStartSec=120` in the unit itself |
| `systemd/ostrov-kopiya-watch.timer` | `/etc/systemd/system/ostrov-kopiya-watch.timer` | 0644 root:root | systemd, `*:23` (once an hour), enabled |
| `systemd/pamyat-fill-watch.service` | `/etc/systemd/system/pamyat-fill-watch.service` | 0644 root:root | systemd |
| `systemd/pamyat-fill-watch.service.d/70-predely.conf` | `/etc/systemd/system/pamyat-fill-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/pamyat-fill-watch.timer` | `/etc/systemd/system/pamyat-fill-watch.timer` | 0644 root:root | systemd, 02:00 UTC, enabled |
| `systemd/pamyat-seam.service` | `/etc/systemd/system/pamyat-seam.service` | 0644 root:root | systemd; `OnFailure=pamyat-seam-failed@%n.service` |
| `systemd/pamyat-seam.timer` | `/etc/systemd/system/pamyat-seam.timer` | 0644 root:root | systemd, 06:20 UTC, enabled |
| `systemd/pamyat-seam-failed@.service` | `/etc/systemd/system/pamyat-seam-failed@.service` | 0644 root:root | systemd via `OnFailure=` of `pamyat-seam.service` |
| `systemd/agent-button.service` | `/etc/systemd/system/agent-button.service` | 0644 root:root | systemd, `WantedBy=multi-user.target`, `Restart=always`, enabled |

Not installed into production: `README.md`, `CHANGELOG.md`, all stands from `test/` and the sample
`etc/default/chitatel-obhoda.example`. As of 10.10 the registry record's `not_installed` names `README.md`,
`CHANGELOG.md` and `test/stend-gruppy-prav.sh`; the new 1.0.10 files (`test/stend-knopki.sh`, the six stands below
and the sample) are added there at the package-number step. `test/` holds the stands for `gruppy-prav-watch`,
`agent-button-daemon.sh`, `dsh-alert`, `claudeclaw-alert`, the guest sandbox and list completeness in `sadik-watch`, the threshold of
`dsh-compact-watch`, the budget of `sessiya-uderzhana-watch` and `ostrov-kopiya-watch`; the stands for the other files are in the
`dsh-obhod-stendov` package (see "Verification").

None of the package's 24 units has drop-ins on the machine: all configuration is in the units themselves and in the
files listed under "Configuration".

### Dependencies

The package installs only its own files. Without the items below a watcher goes blind (code 2) or its unit does not
start.

Our packages — commands the code calls:

| command | package | caller |
|---|---|---|
| `agent-registry` | `a2a-bus` | `sadik-watch` (command); `dsh-compact-watch` loads it as a module for the thresholds (`KONTEKST_REESTR_PRIBOR`). The other watchers read the registry file directly |
| `a2a-send` | `a2a-bus` | `sadik-watch` (fallback alert channel) |
| `agent-alert` | `dsh-trevogi` | the only alert channel of `model-podmena-watch`, `sessiya-uderzhana-watch`, `socseti-watch`, `ostrov-kopiya-watch`, `pamyat-fill-watch.py`, `pamyat-seam-failed@`; fallback of `aclaude-snaruzhi-watch`; `sadik-watch` checks its configuration. Without it these six watchers stay silent |
| `tell-komu` | `dsh-pochta` | `chitatel-obhoda` (the only channel) |
| `kontekst-zamer` | `dsh-storozha-mashiny` | `dsh-compact-watch` (window occupancy thresholds) |
| `/usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py` | `dsh-pamyat-obsluzhivanie` | `sadik-watch` (memory maintenance) |
| `/usr/local/bin/bwrap-bez-zhurnala` | `dsh-gosti` | `sadik-watch` (guest sandbox probe) |
| `smontirovat-fajly` | `dsh-montazh` | whoever installs (see "Installation") |

System programs:

| program | caller |
|---|---|
| `bash`, `python3`, `systemctl`, `journalctl`, `timeout`, `logger` | almost all watchers |
| python module `yaml` (PyYAML) | `dsh-compact-watch`, `model-podmena-watch`, `sessiya-uderzhana-watch`, `pamyat-fill-watch.py` |
| `jq`, `git`, `nft`, `awg`, `ip`, `runuser`, `setpriv`, `ssh` | `sadik-watch` (`ssh` — only with `SADIK_WATCH_MESTNO=0`) |
| `zstd` (`/usr/bin/zstd`) | `pamyat-fill-watch.py` (compressed session logs) |
| `node` (`/usr/local/bin/node`) | `pamyat-seam/run.sh`, `sadik-watch` |
| `curl` | `dsh-alert`, `claudeclaw-alert` |
| `ssh` | `aclaude-snaruzhi-watch` (`sh2`) |

Machine files the package reads but does not install:

- channel tokens: `/etc/dsh-alert.token` (0640 root:agent-switch), `/etc/claudeclaw-alert.token` (0600 root:root); shared owner: `/etc/vladelec/telegram-id` (0644 root:root);
- `/etc/aclaude-snaruzhi/` — `conf` (keys — under "Configuration"), the login key `id_ed25519`, `known_hosts`;
- `/etc/default/chitatel-obhoda` — `CHO_KOREN`, `CHO_ADRESAT`, `CHO_SHAPKA` (see "Configuration"); the sample is the
  package's `etc/default/chitatel-obhoda.example` (copy it, root:root 0644, fill in your own values);
- `/etc/agent-button/allowed.conf` — lines `имя = команда`;
- `/etc/socseti/monitor.key` — 64 hexadecimal characters, 0600 or 0640;
- the registries `/etc/agent-registry/agents.yaml`, `plugins.yaml`, `storozha-sutochnye.txt`;
- group declarations in `/etc/sysusers.d` and `/usr/lib/sysusers.d` (read by `gruppy-prav-watch`);
- `/etc/memory-compaction/deployment.json` (`dsh-compact-watch`), `/etc/varvara/gosti/AGENTS.md` and `.prinyato`
  next to it (`sadik-watch`), `/etc/ru-split/ru_v4.cidrs` (`sadik-watch`).

## Installation

Manual installation without our tools (root): every file from the table "What is installed and where" —
`install -D -o <владелец> -g <группа> -m <режим из таблицы> <файл в пакете> <путь на машине>` (the group
`agent-registry` of the reference `gruppy-prav.conf` must exist); then `systemctl daemon-reload`,
`systemctl enable --now` for the timers and `agent-button.service` (step 3 below), and the machine files from
"Dependencies" — without them the watchers go blind.

Here the package is installed file by file, through the gates: an edit in the tree `/opt/iskra/workspace/dsh-plugins`
gets a new package number (Veniamin's temporary rule), passes the gates, and is then deployed with
`smontirovat-fajly`. Without a flag the tool only does a dry run; only `--v-boj` writes to production, and only under
root. It makes the backup of the replaced files itself (`/var/backups/montazh/<пункт>/`) and after writing checks the
checksums, mode and owner.

1. Dry run, then deployment of the executables. The candidate directory is the package root, the production one is
   `/usr/local`. Name the files EXPLICITLY: without a list the tool takes all files of the candidate, that is, also
   `README.md` and `systemd/`.

   ```bash
   P=/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik
   sudo smontirovat-fajly --punkt <пункт> --progon "$P" /usr/local sbin/sadik-watch
   sudo smontirovat-fajly --punkt <пункт> --v-boj  "$P" /usr/local sbin/sadik-watch
   ```

2. Units — the same way, candidate directory `"$P/systemd"`, production `/etc/systemd/system`:

   ```bash
   sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/systemd" /etc/systemd/system sadik-watch.service sadik-watch.timer
   sudo systemctl daemon-reload
   ```

   A new file that is not in production yet is accepted by the tool only with `--novyj` (mode and owner — from the
   neighbours in the directory or explicitly via `--mode=` / `--owner=`).

   The group reference — the same way, candidate directory `"$P/etc"`, production `/etc/agent-registry` (0644
   root:agent-registry):

   ```bash
   sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/etc" /etc/agent-registry gruppy-prav.conf
   ```

   Order for «группы прав»: reference → `libexec/gruppy-prav-watch` → live run of the check (expect code 0) →
   `sbin/sadik-watch`. The reverse order makes the first cycle raise the «слепота» (blindness) alert.

3. Enable a new timer: `sudo systemctl enable --now <имя>.timer`; the button — `sudo systemctl enable --now
   agent-button.service`. The watcher services do not restart by themselves: the next timer cycle picks up the new
   file. The button must be restarted after `agent-button-daemon.sh` is replaced: `sudo systemctl restart agent-button.service`.
4. Add a new watcher with a timer as a line in `/etc/agent-registry/storozha-sutochnye.txt` (`<служба> <срок_часов>`)
   or as a line `!<служба> <причина>`. Otherwise `sadik-watch` turns red: «таймер наш, строки в перечне НЕТ» (the timer
   is ours, there is NO line in the list).
   A masked timer (`systemctl mask`) needs no line: it goes into the count «замаскировано N: <имена>» (masked N: <names>)
   of the completeness line, not red. A timer whose service is «-» in `list-timers --all` without a mask is a red line
   «служба не определена: <таймер>» (service not defined: <timer>).
5. In the `dsh-storozha-sadik` registry record, move `version` (the `installed_check` fingerprint) and `ref` to the
   new tag. The registry is edited only through `agent-plugins pravka`: `sadik-watch` itself catches edits that bypass
   it.

Removing a file — `smontirovat-fajly --punkt <пункт> --snyat [--progon | --v-boj] <боевой каталог> <файлы…>`. A unit
is removed with `systemctl mask`. But our unit, which has a file in `/etc/systemd/system`, will not accept mask: the
file is first moved to the backup (`mv`), then `daemon-reload` and `mask`. To restore — `unmask` and the file back in
place.

## Configuration

Below is everything the code takes from the environment, arguments and configuration files. Numbers not named here
are hard-coded.

**sadik-watch** (environment; in production it is set by `sadik-watch.service`)

| Setting | Code default | Meaning |
|---|---|---|
| `SADIK_WATCH_MESTNO` | `0` (snapshot over ssh) | `1` — the snapshot is taken on the machine itself (production). Not set at all — refusal, code 2 |
| `SADIK_ALERT_BIN` | `/usr/local/bin/sadik-alert` | main alert channel; in production `/usr/local/bin/dsh-alert`. Not set at all — refusal, code 2 |
| `SADIK_WATCH_SOST` | `$HOME/.local/state/sadik-watch` | state directory; in production `/var/lib/sadik-watch`. Neither it nor `HOME` present — refusal, code 2 with a reason |
| `SADIK_HOST` | `sadik` | host for ssh (only with `MESTNO=0`) |
| `POROG_TISHINY_MIN` | `120` | this many minutes without service journal lines — «молчит» (silent) |
| `POROG_MESTA_PROC` | `90` | usage of `/` in percent from which an alert is raised |
| `OKNO_OTKAZA` | `3h` | search window for prompt-length refusals and limit cut-offs |
| `SADIK_ZAPASNOJ_ADRESAT` | `iskra` | agent that gets the a2a letter when the main channel fails |
| `SADIK_A2A_BIN` | `/usr/local/bin/a2a-send` | sender of the fallback channel |
| `SADIK_AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | whose configuration to check (`--proverit-nastrojku`, without sending) |
| `SADIK_GRUPPY_PRAV_BIN` | `/usr/local/libexec/gruppy-prav-watch` | permission-group check (called as `python3 -ISB`, 20 s limit) |
| `SADIK_SUTOCHNYE` | `/etc/agent-registry/storozha-sutochnye.txt` | list of watchers as «юнит срок_часов» (unit deadline_hours) and `!юнит причина` |
| `SADIK_REESTR_PLAGINOV` | `/etc/agent-registry/plugins.yaml` | registry whose edits bypassing `pravka` are caught |
| `SADIK_GOLOS_SUTOK` | `7` | every how many days to say «жив» |
| `SADIK_VAR_TMP` | `/var/tmp` | where to look for root-owned `dsh-voice-*` |
| `SADIK_WATCH_PAUZA_DIR` | `/var/lib/dsh-pauza` | agents' pause files from `/stop` (the variable is for the stand) |
| `SADIK_GOSTI_PRAVILA` | `/etc/varvara/gosti/AGENTS.md` | Varvara's guest rules; next to it `.prinyato` with the accepted checksum |
| `SADIK_BELYJ_SPISOK` | from `GATEWAY_GOST_BELYJ_SPISOK` of the `claude-oauth-gateway@varvara` service | Varvara's whitelist |
| `SADIK_BELYJ_MODUL` | `/opt/subscription-gateway-guest/pdn-maska.mjs` | whitelist parser |
| `SADIK_NEMOTA_OBERTKA` | `/usr/local/bin/bwrap-bez-zhurnala` | Varvara's sandbox wrapper. The accepted checksum is the checksum of the wrapper file in the release tag (`derevo.ref`) of the registry record whose `derevo.files` installs this path; more than one such record, or the registry or the tag not read — «не мерено» (not measured), not red. git reads the tree at the entry's address trusting only that address (`safe.directory=<адрес>`, not `*`); an address that is not the tree root — also «не мерено» |
| `SADIK_NEMOTA_REESTR` | `/etc/agent-registry/plugins.yaml` | registry from which the accepted wrapper checksum is taken |
| `SADIK_NEMOTA_PROFIL` | `/opt/varvara/.dsh/profiles/web/cordis.patch.yml` | profile that must call the wrapper |
| `SADIK_NEMOTA_LEDGER` | `/opt/varvara/workspace/.message-receipts/receipts.sqlite` | ledger whose invisibility the probe checks |
| `SADIK_NEMOTA_ZHURNAL` | empty (the `varvara.service` journal is read) | a file instead of the journal (for the stand) |
| `RU_SPLIT_SPISOK` | `/etc/ru-split/ru_v4.cidrs` | list of RU networks; older than 15 days — trouble |
| argument `--podtverdit` | — | record the current start of `iskra.service` as expected (after a manual start-up) |

State besides the directory itself: `kvota-kursory.txt` (journal cursors for the Codex quota), `grp-<ключ>` (group
alerts), `posledniy-golos`, `ozhidaemyj-start-iskra.txt`, `moya-kvitanciya.txt`. Iskra's receipt is the line
`PODYOM_PODTVERZHDEN=` in `/opt/iskra/workspace/SOSTOYANIE-ISKRY.txt`.

The «группы прав» step: exit code 0 of the check — the journal gets «группы прав: N групп сходятся с эталоном»
(permission groups: N groups match the reference); any other code — trouble and the group alert `gruppy-prav` keyed
by the `СОСТАВ:` line (alert on a change of composition, reminder every 6 h, «снова в порядке» (back in order) when it
clears). Code 2 (blindness) is an alert too.

**gruppy-prav-watch** (environment — only for probes; in production the variables are not set)

| Setting | Code default | Meaning |
|---|---|---|
| `GRUPPY_PRAV_CONF` | `/etc/agent-registry/gruppy-prav.conf` | reference |
| `GRUPPY_PRAV_GROUP` | `/etc/group` | supplementary group members |
| `GRUPPY_PRAV_PASSWD` | `/etc/passwd` | members by primary group (except the same-named owner account) |
| `GRUPPY_PRAV_SYSUSERS` | `/etc/sysusers.d:/run/sysusers.d:/usr/local/lib/sysusers.d:/usr/lib/sysusers.d` | directories of sysusers `*.conf` files, separated by «:» |

The reference `gruppy-prav.conf` has one line per group, `#` starts a comment:

- `<группа> sysusers` — members = the lines `m <учётка> <группа>` in `sysusers.d`; the group must be declared there
  (`g` or `m`), otherwise blindness;
- `<группа> spisok a b c` — an explicit list (the group has no declaration in sysusers; an `m` line is not added
  there: `systemd-sysusers` creates the missing account at boot);
- `<группа> spisok -` — there must be no members.

A malformed line, an empty reference or a repeated group (blindness with the numbers of both lines) — blindness. The
group owner (the same-named account) is not counted as extra either by primary group or among supplementary members.
In production: `limity-vhod sysusers`, `agent-button spisok` (8 accounts, a justification for each — in the file's
comments), `claudeoauth spisok -`. Group membership is changed by editing the reference line (the deploying hand),
otherwise an alert. Output: the lines `ok <группа>: …`, `ЛИШНИЙ <учётка> в <группа> (…)`,
`НЕДОСТАЁТ <учётка> в <группа> (…)`, `СЛЕПОТА: …`; the last line is `СОСТАВ: <ключи>` (empty — clean).

**dsh-alert, claudeclaw-alert**

| Setting | Default | Meaning |
|---|---|---|
| argument 1 | required | alert text |
| `/etc/dsh-alert.token`, `/etc/vladelec/telegram-id` | — / required owner setting | token of the bot @arg_dsh_alert_bot and the chat |
| `DSH_ALERT_BOEVOJ` | empty | without `INVOCATION_ID` (a call not from a unit) the text is marked «ПРОБА…» (TEST…); `1` removes the mark |
| `/etc/claudeclaw-alert.token`, `/etc/vladelec/telegram-id` | — / required owner setting | token of the bot @idomik_bot and the chat |

**dsh-compact-watch** (environment)

| Setting | Default | Meaning |
|---|---|---|
| `DSH_COMPACT_WATCH_KANAL` | `/usr/local/bin/dsh-alert` | alert channel |
| `DSH_COMPACT_WATCH_KATALOG` | `/var/lib/dsh-compact-watch` | state: `sostoyanie.json`, `istoriya.jsonl`, `padenie.json` |
| `DSH_COMPACT_WATCH_PRIBOR` | `/usr/local/sbin/kontekst-zamer` | occupancy instrument (called with `--mashinno`) |
| `DSH_COMPACT_WATCH_RAZMESCHENIE` | `/etc/memory-compaction/deployment.json` | file in which `promptSubstitutions.roleClarification` is watched |
| `DSH_COMPACT_WATCH_MOLCHAT` | `zapolnenie,szhatie-platformy` | which event kinds to keep silent about in the channel (the journal gets everything); empty — reports everything |
| `DSH_COMPACT_WATCH_OTBROS_SNYATO_S` | `21600` | how many seconds without tool drops until «✅ снято» (✅ cleared) |
| `AGENTS_REGISTRY` | `/etc/agent-registry/agents.yaml` | agent registry: services, gateways, names |
| `KONTEKST_REESTR_PRIBOR` | `/usr/local/bin/agent-registry` | module for reading the D thresholds |
| `KOMPAKT_NASTROJKI_KATALOG` | not set | directory of compaction settings for reading the D threshold |

Hard-coded: thresholds of 85 and 90 % of the compaction threshold, a cooldown of 3600 s, a cut-off series of 5 events
in 30 minutes. The cooldown mark and the threshold flag are set only after delivery to the channel: an alert that did
not reach the channel is repeated on the next cycle. journald log suppression is looked up by the registry's observed
services, not by a hard-coded list.

**aclaude-snaruzhi-watch** (argument `sh1` or `sh2`; the file `SNARUZHI_KONF`, by default `/etc/aclaude-snaruzhi/conf`, is read as bash)

| File key | Default | Meaning |
|---|---|---|
| `PUTI` | `10.240.49.1:38888 192.168.99.4:38888` | aclaude sshd addresses (LAN and awg9) |
| `POLZOVATEL` | empty | the `proba-snaruzhi` account on aclaude; empty — `sh2` does not run, code 4 |
| `KLYUCH`, `ZNAKOMYE` | `/etc/aclaude-snaruzhi/id_ed25519`, `…/known_hosts` | login key and known hosts |
| `KARTA` | `claudeclaw:3100 … veniamin:3109` | instances and webhook-server ports |
| `STOROZHA` | `mesto-aclaude-watch.timer claudeclaw-stuck-watch.timer` | internal aclaude watchers |
| `SVEZHEST_MIN`, `VOZRAST_MIN_S`, `DISK_KRIT` | `15`, `120`, `97` | watcher freshness (min), minimum process age (s), critical disk usage (%) |
| `SH1_PROMAHOV`, `SH2_KRASNYH`, `ZELENYH_OTBOJ`, `POVTOR_S` | `3`, `2`, `2`, `3600` | how many misses or reds in a row before an alert, greens before the all-clear, repeat |
| `TCP_TAJMAUT`, `SSH_TAJMAUT` | `5`, `20` | timeouts, s |
| `SOST` | `/var/lib/aclaude-snaruzhi` | state |
| `ALERT_IDOMIK`, `ALERT_ZAPAS` | `/usr/local/bin/claudeclaw-alert`, `/usr/local/bin/agent-alert` | main and fallback channels |
| `POPYTOK`, `PAUZY` | `3`, `5 15` | attempts on the main channel and pauses between them |
| `SSH_KOMANDA`, `ZHURNAL` | empty, `logger -t aclaude-snaruzhi` | substitutes for ssh and the journal — only for the stand (with production paths — refusal, code 2) |

In production only `POLZOVATEL` is set in `conf`.

**chitatel-obhoda** (environment; in production `/etc/default/chitatel-obhoda` sets `CHO_KOREN`, `CHO_ADRESAT`, `CHO_SHAPKA`; the unit
reads the file with «-», so without the file the reader refuses with code 2 «СЛЕПОТА: не настроено» (BLINDNESS: not configured), rather than systemd failing without a reason)

| Setting | Default | Meaning |
|---|---|---|
| `CHO_KOREN` | empty — blindness, code 2 | home of the agent through whose slot the letter goes out |
| `CHO_ADRESAT` | empty — blindness, code 2 | addressee (genitive case, part of the name `dlya-<адресат>-…`) |
| `CHO_SHAPKA` | `<узел> · chitatel-obhoda (root, щель …) → координатору · НОЧНОЙ ОБХОД СТЕНДОВ` | first line of the letter |
| `CHO_SOST` | `/var/lib/chitatel-obhoda` | state |
| `CHO_TELL_BIN`, `CHO_JOURNALCTL`, `CHO_SYSTEMCTL` | `/usr/local/bin/tell-komu`, `journalctl`, `systemctl` | tools (substitution — for the stand) |
| `CHO_ISTOCHNIK`, `CHO_SEYCHAS` | empty | stand only: a directory of nights instead of the journal, "now" |
| `A2A_PROVERENO_DO` | `5560` | verified letter length; the letter limit is 560 characters less |

**model-podmena-watch** (environment): `MPW_REESTR` (`/etc/agent-registry/agents.yaml`), `MPW_KATALOG`
(`/var/lib/model-podmena-watch`), `MPW_KANAL` (`/usr/local/bin/agent-alert`), `MPW_JOURNALCTL` (`journalctl`),
`MPW_SYSTEMCTL` (`systemctl`), `MPW_DOMA` (`{}`, stand only: account → home). Cooldown of the blindness alert — 3600 s.

**sessiya-uderzhana-watch** (environment only, arguments — refusal, code 2): `SUW_REGISTRY`
(`/etc/agent-registry/agents.yaml`), `SUW_STATE` (`/var/lib/sessiya-uderzhana-watch/state.json`), `SUW_ALERT`
(`/usr/local/bin/agent-alert`), `SUW_PREDEL_MIN` (`10`, hold threshold in minutes).

**socseti-watch** (arguments; the unit does not pass them): `--port` (`8381`), `--key-file` (`/etc/socseti/monitor.key`,
0600 or 0640, 64 hex), `--state-dir` (`/var/lib/socseti-watch`), `--kanal` (`/usr/local/bin/agent-alert`), `--timeout`
(`5`, no more than 10 s). Cooldown — one day per reason.

**ostrov-kopiya-watch** (environment only): `OKW_KOPIYA` (`/opt/agent-plugins-stend/ostrov-api`), `OKW_HEALTH`
(`http://192.168.99.3:4215/internal/v1/assistant/health`), `OKW_KATALOG` (`/var/lib/ostrov-kopiya-watch`), `OKW_KANAL`
(`/usr/local/bin/agent-alert`), `OKW_RELIZY` (Marc's release manifests, separated by ":",
`/opt/marc/workspace/*/deployment/manifest.json:/opt/marc/workspace/*/*/deployment/manifest.json`), `OKW_ARHIVY`
(`/var/backups/montazh/*/ostrov-api-{rel}-raskladka.tar.gz`), `OKW_POLKA` (`/var/backups/montazh/ostrov-api-kopiya` — where
the alert's command puts a new archive). The same trouble is repeated once a day; blindness — once a day per class (copy /
health), the error text only in the body. When blindness clears — one "sees again" alert.

**pamyat-fill-watch.py** (arguments): exactly one of `--check` (report without state and alerts), `--run`
(production), `--failure` (systemd hook, reads `SERVICE_RESULT`); `--registry` (`/etc/agent-registry/agents.yaml`),
`--state-dir` (`/var/lib/pamyat-fill-watch`; with `--run` only this one is allowed), `--days` (`14`, from 1 to 90). The
channel is hard-coded: `/usr/local/bin/agent-alert --plain`. Reminder about the same findings — once every 7 days.

**pamyat-seam**: `SEAM_STAND` (`/usr/local/libexec/pamyat-seam/stand.mjs`) — for `run.sh`; `CEP_PLAGINY`
(`/opt/agent-plugins/node_modules`, set in the unit) — for `stand.mjs`; `SEAM_ALERT_BIN` (`/usr/local/bin/agent-alert`)
and the argument "unit name" — for `failed-v2.sh`. The stand run limit is 30 s.

**agent-button-daemon.sh**: `AGENT_BUTTON_ROOT` (`/var/lib/agent-button`), `AGENT_BUTTON_CONF`
(`/etc/agent-button/allowed.conf`, lines `имя = команда`). A request is a REGULAR file `pending/<имя>.cmd` with one
hard link; the name may contain only `A-Z a-z 0-9 . _ @ + -` (anything else is refused without reading: a journal line
with the escaped name, the request goes to `processed/nedopustimoe-imya-…`, no answer in `done/`), the first line is
the command name (the first 4096 bytes are read). The daemon first moves the request (`mv`) into the closed `work/`
(0700, only root writes) and only there checks and reads it. The answer is `done/<имя>.out` and `done/<имя>.rc`: 0 and
the command output — executed; 64 — the command is not in the list; 65 — the request is not a regular file (symbolic
link, FIFO, socket, device, directory) or the file has more than one hard link. On refusal the request text is NOT
repeated either in `done/` or in the journal — only the request name; the text reaches the journal only when it
matched a name from the list. After `agent-button-daemon.sh` is replaced, `sudo systemctl restart agent-button.service`
is needed: the daemon is a permanent loop and does not re-read the new file by itself.

## Verification

Registry record (`agent-plugins list --health` calls the healthcheck):

- `installed_check` — the fingerprint of the 45 production files
  (`sha256sum … | LC_ALL=C sort -k2 | sha256sum | cut -c1-16`) must equal `version` of the `dsh-storozha-sadik` record.
- `healthcheck` — `systemctl is-active sadik-watch.timer dsh-compact-watch.timer chitatel-obhoda.timer`, expect three
  `active`.

By hand: the `sha256sum` of each package file equals the production one, `stat -c '%a %U:%G'` equals the table above;
`systemctl list-timers 'aclaude-snaruzhi-*' sadik-watch.timer dsh-compact-watch.timer chitatel-obhoda.timer`.

The stands are in the `dsh-obhod-stendov` package, on the machine — `/opt/iskra/workspace/dorabotki/stendy/`. They all
share one contract: 0 — all probes passed, 1 — a mismatch, 2 — blindness (the stand could not check). Without an
argument a stand takes the PRODUCTION file; the candidate path is given as the first argument (or in the variable
named in the stand's header). The alert channel, journal and state are substituted in the stands.

| Stand | Subject | Where it runs |
|---|---|---|
| `stend-compact-watch.sh` | dsh-compact-watch: journal as bytes, re-initialisation, cut-offs, etc. | nightly run |
| `stend-nemoty-posle-szhatiya.py` | dsh-compact-watch: silence after compaction | nightly run |
| `stend-otbros-shlyuza.py` | dsh-compact-watch: tool drops by the gateway | nightly run |
| `stend-doli-preseta.sh` | share and D threshold in kontekst-zamer and dsh-compact-watch | nightly run |
| `stend-pravki-mimo.sh` | sadik-watch, the "registry edited bypassing pravka" branch | nightly run |
| `stend-sadik-watch-voice-root.sh` | sadik-watch, root-owned voice directory in `/var/tmp` (root) | nightly run |
| `stend-sadik-watch-zastryal.sh` | sadik-watch, a watcher stuck in activating (root, `systemd-run`) | nightly run |
| `stend-sadik-watch-bez-sredy.sh` | sadik-watch without the unit environment — refusal 2 | weekly run |
| `stend-storozha-nad-storozhami.sh` | sadik-watch, "watchers over watchers" (~10 min) | weekly run |
| `stend-model-podmena.sh` | model-podmena-watch, 13 probes (`MPW_PREDMET`) | nightly run |
| `stend-aclaude-snaruzhi.sh` | aclaude-snaruzhi-watch: sh1/sh2, channels, refusal on an argument | nightly run |
| `stend-chitatelya-obhoda.py` | chitatel-obhoda: parsing nights, the "in a row" count, the letter rule | nightly run |
| `test/stend-ostrov-kopiya-watch.py` (in this package) | ostrov-kopiya-watch, 17 probes: healthy, mismatch, repeat, recovery, blindness per class, "sees again", channel failure, shelf, quoting | nightly run (from the tree, without root) |

The exception is the `gruppy-prav-watch` stand: it lives in the package itself, `test/stend-gruppy-prav.sh`, and the
nightly run takes it from the tree (`/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/`, without
root). Without arguments it judges the NEIGHBOURING tree files `../libexec/gruppy-prav-watch` and
`../etc/gruppy-prav.conf`, not the production ones; production is checked with the arguments `<проверка> <эталон>`.
It does not touch the live `/etc/group`, `/etc/passwd`, `/etc/sysusers.d`: it works on copies of them.
10 probes: healthy 0 · extra member in a sysusers group 1 · guest with a primary group 1 · a regular member dropped
out 1 · extra member in a list group 1 · declaration missing 2 (blindness) · revert 0 · owner as a supplementary member
of its own group 0 · repeated group in the reference 2 · the default sysusers directories include `/run` and
`/usr/local/lib`. Stand exit codes: 0 — all expectations met, 1 — a mismatch, 2 — the stand is not assembled: no check
or reference, or the machine lacks what the fault injections target. The stand is for sadik only: it needs the groups
`limity-vhod`, `agent-button`, `claudeoauth`, the accounts `varvara` and `limity-ds` (as the first member of
`limity-vhod`) and the declaration `dsh-limity.conf` in `/etc/sysusers.d`. On a machine without them it exits with
code 2 and lists what is missing, instead of going red with seven false mismatches.

Live run of the group check (read-only): `sudo /usr/bin/python3 -ISB /usr/local/libexec/gruppy-prav-watch`.

Six more 1.0.10 stands in the package's `test/`: `stend-polnoty-maski.sh` (list completeness in `sadik-watch`: a masked timer and a «-» service without a mask, under root), `stend-nemota-obertki.sh` (the guest sandbox probe in `sadik-watch`,
under root), `stend-dsh-alert.sh` (under root), `stend-claudeclaw-alert.sh` (under root), `stend-porogov-kanal.py`
(threshold of `dsh-compact-watch` and delivery), `stend-byudzhet-trevog.py` (alert budget of
`sessiya-uderzhana-watch`). The runs do not call them yet.

The button stand is `test/stend-knopki.sh` (since 1.0.10), also in the package itself: a substitute
`AGENT_BUTTON_ROOT` and list in a temporary directory, the production daemon and `/var/lib/agent-button` are not
touched; it runs as the account or under `sudo` (then the mark is in a root 0600 file, as in production); without an
argument it judges the neighbouring `../sbin/agent-button-daemon.sh`. 6 probes: healthy request executed · a symbolic
link to someone else's file — 65, no text · a hard link — 65 · a FIFO does not hang the button, the neighbouring
request is executed · the text of a refused request is not repeated · a newline in the request name does not forge a
journal line.
Stand exit codes: 0, 1 — a mismatch, 2 — not assembled. The nightly and weekly runs do not call it yet: it is not in
the list of stands.

There are no stands for `sessiya-uderzhana-watch`, `socseti-watch`, `pamyat-fill-watch.py` (it has a `--check` mode:
read-only, code 1 if there are findings), `dsh-alert`, `claudeclaw-alert`. `pamyat-seam` itself is a stand: 0 — the
chain passed, 1 — a mismatch, 2 — nothing to check with or the time ran out.

Trial run of `sadik-watch` without production state and channel (from the script header, under root):

```bash
sudo SADIK_WATCH_MESTNO=1 SADIK_WATCH_SOST=/tmp/proba-sost SADIK_ALERT_BIN=/bin/true SADIK_VLADELEC_WATCH_BIN=/bin/true /usr/local/sbin/sadik-watch
```

Exit codes: `sadik-watch` — 0 the cycle passed (troubles go to the journal and the channel), 2 the snapshot was not
obtained or is empty, there is no unit environment, or neither `SADIK_WATCH_SOST` nor `HOME`; `--podtverdit` — 1 if
the start was not captured. `dsh-compact-watch` — 0, 1 (not delivered or the cycle crashed), 2 (blindness).
`aclaude-snaruzhi-watch` — 0 the run took place (red aclaude is not an instrument error), 2 an argument or an ssh
substitute with production paths, 3 the alert was not delivered, 4 no account or key. `chitatel-obhoda` — 0, 1 the
channel failed, 2 blindness. `sessiya-uderzhana-watch` — 0, 1 the alert did not go out, 2 blindness. `socseti-watch` —
0 ready, 10 telegram halted (the unit counts it as success), 2 blindness, 3 the alert was not confirmed or the state
was not written. `pamyat-fill-watch.py --run` — 0 or 2. `dsh-alert`, `claudeclaw-alert` — 0 delivered, 1 not.
`gruppy-prav-watch` — 0 everything matches, 1 findings (listed as lines), 2 blindness (the reference or a file was
not read, a reference line is malformed, a group does not exist, a group is marked "sysusers" but has no
declaration); blindness is not "clean".

Journals: `journalctl -u <служба>`; the result of a `dsh-alert` send is a `SENT …` line under the `dsh-alert` tag;
`claudeclaw-alert` failures — under its own tag; `aclaude-snaruzhi-watch` writes under the `aclaude-snaruzhi` tag.

## Limitations

- `sadik-watch` lives on the machine it watches: if sadik goes down, the watcher goes silent with it. The
  «машина недоступна» (machine unreachable) probe is not run in local mode, and it says so every cycle. It shows its
  own death only by the absence of the «жив» voice (up to 7 days of silence). It does not check itself in the daily
  list (`!sadik-watch.service`).
- `sadik-watch` judges "the process exists" by journal freshness, not "the work is progressing". It measures memory
  by growth in the number of records without judging their meaning, and free space only on `/`. It sees a stuck
  watcher no earlier than that watcher's deadline from entering activating (for a daily one — up to ~52 h). It does
  not see timers outside `/etc/systemd/system` or services without a timer. It does not judge the mask: a masked timer is a person's decision; unmasked without a list line, it turns red again. Hard-coded: the vps-ru address
  `46.19.64.6`, the interface `awg9`, table 225 and mark `0xa2c9` (the accepted checksum of the wrapper
  `bwrap-bez-zhurnala` is taken from the registry and the release tag, see "Configuration"); the start-up receipt is
  kept only for `iskra.service`.
- Channels. The `dsh-alert` token (0640 root:agent-switch) is readable only by root, so a call from an agent account
  says «нет доступа» (no access). A call not from a unit is marked «ПРОБА» in the sent text itself. Text longer than
  4000 characters is truncated on the original text, before escaping (with a note); the same piece also goes out by
  the fallback route without markup. `claudeclaw-alert` parses the Telegram response: the failure reason goes to the
  journal, the text goes by the fallback route without markup; it does not escape markup (callers send tags on
  purpose). It has no retry.
- On its first run `dsh-compact-watch` sends no alerts from the journal history: it says a single «заведён заново»
  (initialised anew). A gateway not recorded for the agent in `zavisit_ot` is invisible to it. It does not read
  gateway line formats older than required (without «модель запрошена» (model requested), without «отброшено шлюзом»
  (dropped by the gateway)). It keeps silent in the channel about filling and platform compaction
  (`DSH_COMPACT_WATCH_MOLCHAT`).
- `aclaude-snaruzhi-watch` does not see a runner stuck on the model while the webhook server is alive; a bot's
  Telegram disconnect; the end of the Claude subscription; disk growth below `DISK_KRIT`. "The webhook server answers"
  does not mean "the agent is alive".
- `chitatel-obhoda` does not read manual stand runs or the weekly run, and does not judge who is right, the stand or
  the subject. After the run's `OnCalendar` changes, the "in a row" count starts over.
- `model-podmena-watch` does not see a substitution the gateway does not know about (Codex without `model/rerouted`),
  nor the DeepSeek path. A model alias instead of the full name gives a false alert.
- `sessiya-uderzhana-watch` catches only holding by an unfinished `/new`. After an alert is sent there is no repeat:
  from then on the hold is visible only in the unit journal. All alerts of a cycle share a budget of 100 s: whatever
  did not fit is «не ушло» (not sent) and goes out on the next run.
- `socseti-watch` knows only what the `socseti` status returns. An alert for the same reason — no more than once a day.
- `ostrov-kopiya-watch` links the copy to the site only by the release number: that the archive is byte-for-byte what
  runs on the site is checked by the installer against the manifest. It does not see a lag within the hour; a site
  rollback is also a "mismatch", and the command would install the older release (read it). It looks for the release
  directory two levels deep in `/opt/marc/workspace`; deeper — "not found".
- `pamyat-fill-watch.py` does not judge the quality of records. Until the history cache has 14 days, it calls
  secretary completions «не измерено» (not measured), not trouble.
- `pamyat-seam` feeds the compaction event by hand: it does not prove that the live platform will emit it in this form.
- `gruppy-prav-watch` does not see membership through NSS outside `/etc/group` and `/etc/passwd` (LDAP/sssd — not
  present on sadik); membership granted by a unit (`SupplementaryGroups=`, this is how the `sajt-chat` unit gets the
  `agent-button` group) — it is not in `/etc/group`; rights granted outside groups (ACL `u:<учётка>`, file ownership,
  sudoers); groups outside the reference; joining and leaving between two cycles (10 min). It does not judge whether
  the reference itself is right: a person writes the `spisok` list.
- `agent-button-daemon.sh`: whoever can write to `pending/` (the `agent-button` group) can run ANY command from the
  list. Do not add guest agents to the group. List commands run as root as they are (`bash -c`).
  🔴 Precondition: `/proc/sys/fs/protected_hardlinks` = 1 is mandatory (1 on sadik, measured 10.10.2026). The daemon
  refuses by link count (more than one — code 65), but the count does not catch everything: without this setting an
  account can make a hard link to someone else's file it does not own and, if the file's original name is in a
  directory where it may delete, remove that name — the link remains the only one, and the daemon accepts the file as
  a request. The kernel setting forbids creating such a link at all. Substitution of the entry between the move to
  `work/` and the read is closed by the closed `work/`, not by the stand.
- The package is published as source only, without npm: the files are tied to sadik (agent names, addresses, bots,
  paths) and do not work as they are on another machine.

## B-N-2023: one owner setting

`bin/vladelec-tg-id` installs as `/usr/local/bin/vladelec-tg-id` (root:root 0755), reading `/etc/vladelec/telegram-id` (root:root 0644, parent root:root 0755). One line of 5..15 ASCII digits; no arguments or fallback ID. Invalid/missing/link/non-root/group-or-other-writable settings fail with code 2 and stderr. VLADELEC_TG_ID_FILE is a test path only. Accepted aclaude reader checks file/directory metadata before reading. stat/awk/head are separate steps; replacing the protected file/directory between them requires root.

`libexec/vladelec-tg-id-watch` installs under `/usr/local/libexec` (root:root 0755). Local sadik-watch calls it every 10-minute tick: reader failure causes one A2A letter to Zabava through Iskra's existing tell-komu queue, independently of Telegram and the owner file. Deadlines: read 3 s, mail 5 s plus 1 s to kill; retry for the same reason no sooner than 6 hours; changed reasons immediately; one recovery notice. Delivery failure is logged.

dsh-alert and claudeclaw-alert read the owner before token/network and refuse with code 2 if unavailable. Old owner/chat files are not deleted by the author; owner defaults of agent-alert/agent-tell/profile settings need a coordinated migration preserving explicitly configured group targets. Hardlinks would retain old inodes after atomic replacement and are not a lasting alias strategy.

B-N-2023: manual probes must also set SADIK_VLADELEC_WATCH_BIN=/bin/true or isolate the helper/courier in a private namespace. Muting the Telegram alert alone does not mute independent A2A. The unit has no override, so the normal helper is called every local tick. An explicitly empty override refuses before state writes.

B-N-2023 R3: the package ships only `etc/vladelec/telegram-id.example`, never a real owner ID. The deployment operator creates the root-owned 0644 setting separately. The helper has a nonblocking lock, reads for up to 3 seconds, and makes one bounded courier attempt (5 seconds plus 1 second to kill). Its test-only state override is `VLADELEC_WATCH_STATE_DIR`. Tests under `test/stend-b2023-*.py` use private settings and fake external IO, requiring sudo for mount namespaces and root fixtures.

Reason and attempt time are stored atomically in `/var/lib/sadik-watch/vladelec-tg-id.json` before the courier. Attempts, including failed delivery, for the same reason are limited to one per 6 hours; changed reasons notify immediately; recovery notifies once. Invalid JSON is kept in one `.invalid` file and monitoring resumes. State filesystem errors return 2 and remain visible in the journal; they require the operator.
