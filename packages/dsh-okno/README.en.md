Russian version: [README.md](README.md) · English below

# dsh-okno — update-window tools

**Version:** 3.1.3

Service software on sadik for update windows: the admission check for step Ш5 and the atomic name exchange when the
SDK layer is replaced, a content-based inventory of the layer, repacking of session logs before DSH 0.2, and creation
of the OMEGA service key. There are no units — these are manual tools for use during a window.

The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`).

**Temporary rule (Veniamin, 07.10.2026):** until new packages have a production ↔ tag reader, any file of the package
may change only together with a new package number in the same window.

The package is plain sources without `package.json`: the `libexec/` and `sbin/` directories mirror the paths under
`/usr/local/`. The number is the CHANGELOG heading and the tag `dsh-okno-v<номер>` (`<номер>` = number). Transfer from
production: the checksum of every file in the tree equals the checksum in production.

## Files

git stores only the "executable" flag, so the on-disk mode and owner are given in the table (taken with `stat` from
production on 07.10.2026).

| file in package | path on disk | who calls it | mode | owner:group |
|---|---|---|---|---|
| `libexec/sdk-okno/dopusk-sh5.sh` | `/usr/local/libexec/sdk-okno/dopusk-sh5.sh` | a root operator in the SDK-layer window (B-N-1501, step Ш5) | 755 | root:root |
| `libexec/sdk-okno/obmen-imyon.py` | `/usr/local/libexec/sdk-okno/obmen-imyon.py` | a root operator in the SDK-layer window (B-N-1501) | 755 | root:root |
| `libexec/sdk-okno/opis-sloya.py` | `/usr/local/libexec/sdk-okno/opis-sloya.py` | an operator in the SDK-layer window (B-N-1501) | 755 | root:root |
| `sbin/perepak-okna` | `/usr/local/sbin/perepak-okna` | a root operator in the DSH 0.2 window (B-N-738) | 755 | root:root |
| `sbin/sozdat-klyuch-omega` | `/usr/local/sbin/sozdat-klyuch-omega` | a root operator (A-N-1173-ost) | 755 | root:root |

## Invocation and exit codes

Arguments and codes were taken from the code. In all five tools an unknown argument is refused with no action.

| command | arguments | exit codes | what it changes on disk |
|---|---|---|---|
| `dopusk-sh5.sh <T1> <T2>` | `T1` — time of the Ш1 exchange, `T2` — time of the Ш2 `daemon-reload`, both in unix seconds (10 digits) | 0 — admitted; 1 — not admitted (a unit was started before the threshold, is not `active`, or its start time could not be read); 2 — invalid invocation | nothing: only `systemctl show` |
| `obmen-imyon.py <имя1> <имя2>` | two existing names in the same directory; no options | 0 — exchanged; 2 — invalid invocation, a name does not exist, the names are in different directories, or the kernel refused (`ничего не изменено`, "nothing changed") | atomically swaps the two names (`renameat2 RENAME_EXCHANGE`) |
| `opis-sloya.py <каталог> [--spisok]` | a real directory (pass a symlink as its target); `--spisok` — print the inventory as lines | 0 — inventory taken; 2 — invalid invocation, the path does not exist, or it is not a directory; 3 — no permission on a file or subdirectory | nothing: prints one line per object `путь · вид · значение · режим` (path · kind · value · mode) — kind `f` (file, value is sha256), `l` (symlink, value is the target), `o` (other, value is the type: `fifo`, `sock`, `chr`, `blk`, `inoe`; since 1.0.3, earlier such objects were silently skipped) — and the total `объектов N · опись sha256 …` (objects N · inventory sha256 …); skips the `.sostoyanie.json` file in the root |
| `perepak-okna --progon \| --v-boj \| --otkat <агент> [--agent <имя>]… [--strahovka <кат.>] [--koren <кат.>]` | exactly one mode; `--agent` narrows the list of agents from the registry; `--strahovka` — default `/var/backups/montazh/B-N-738-zhurnaly`; `--koren` — a trial run on a copy (a root that leads to production paths is refused). Root only | 0 — all agents passed; 1 — at least one agent was refused (the others proceed); 2 — invalid invocation, not root, or the registry is unusable (not read, not parsed, no `agenty` list, an agent has no `namerenie.sluzhba`) — «НИЧЕГО не сделано» ("NOTHING was done") before any `systemctl` | `--progon` — nothing, only the plan and the count; `--v-boj` — rewrites the agent's `session.jsonl.zstd` via a temporary name and `rename`, puts the previous file into the backup, moves 10 unopenable directories to `<страховка>/neotkryvaemye/<агент>/`; `--otkat` — restores from the backup byte for byte |
| `sozdat-klyuch-omega` | no arguments; root only | 0 — the key was created or already existed (left untouched); 2 — refusal | creates `/etc/omega/mcp-klyuch.env` 0600 root and the directory `/etc/omega` 0755; the value is not printed and is not passed in argv |

**Hard-wired for sadik.** `dopusk-sh5.sh` checks a named list of sadik units (`dopusk-sh5.sh:21–23`: four
`claude-oauth-gateway@…` units and five coder gateways); `perepak-okna` moves 10 unopenable sessions from the
`NEOTKRYVAEMYE` list in `perepak-okna` (agent · path · sha256). On another machine both lists are meaningless: adjust
them to your own units and logs before running, otherwise `dopusk-sh5.sh` will answer «нет» ("no") because of names
that are not yours, and `perepak-okna` will not find the unopenable sessions and will skip moving them.

## Dependencies

- Programs: bash, GNU coreutils (`date -d`, `install`, `stat`), systemd (`systemctl`), python3. `obmen-imyon.py`
  requires Linux ≥ 3.15 and glibc ≥ 2.28: the `renameat2` wrapper appeared in glibc 2.28 (`man 2 renameat2`, HISTORY
  section). On an older glibc the call fails with an `AttributeError` traceback and exit code 1, not with a refusal and
  code 2. `perepak-okna` additionally needs `zstd`, the python module `yaml` (PyYAML), and access to `/proc`. The
  utilities do not call `sudo`: a root operator runs them.
- The subjects of the windows — the platform SDK layer, DSH session logs, the OMEGA service — are not part of the package.

## Installation and removal (by root, manually)

Installing a file: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>` (mode from the
table, file in the package, path on disk); in production — via `smontirovat-fajly` after gate review. There are no
units. Removal — move the file into a backup (`mv`); nothing calls these tools except an operator in a window.

## Verification

Checksum of every package file = checksum in production (`sha256sum`), permissions = the table (`stat -c '%a %U:%G'`).
