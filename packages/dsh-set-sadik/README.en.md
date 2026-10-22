Russian version: [README.md](README.md) · English below

# dsh-set-sadik — network of the sadik machine: RU split, reply routing, VPN switching, killswitch and network check

Версия · Version: 3.1.5

## Purpose

The package holds the sadik network rules that belong neither to the tunnel configs nor to NetworkManager. It does five things. It builds a set of Russian Federation addresses and sends traffic to them into the `awg-ru` tunnel (RU split). It makes sure that the reply to a connection that arrived on the external card `wan0` goes back out through `wan0`, not into a tunnel. It switches internet egress from US (`awg3`) to NL (`awg0`) and back. Through the killswitch it lets out only the tunnels, the corporate network, the tunnel endpoints and a few named exceptions (external SSH replies, Novofon, DHCP, neighbours in the /28), and on `wan0` it lets in from outside only replies to its own connections and SSH on port 38888. And it checks the network by property: what matters is not that the applying script returned 0, but that a route to each tunnel endpoint exists and goes through `wan0`.

The package itself calls nothing: it is invoked by systemd and NetworkManager. At boot `ru-split.service`, `sadik-set.service` and `sadik-vpn-only-killswitch.service` start. The timer `sadik-vpn-failover.timer` fires every 30 s, `ru-cidr-update.timer` on Sundays at 04:17 UTC. A drop-in on four `awg-quick@` tunnels (`awg0`, `awg3`, `awg9`, `awg-ru`) re-applies the policy rules after each tunnel starts. The hook `50-sadik-set` does the same when NetworkManager brings `wan0` up again. One more drop-in, on the `awg-quick@` template, makes all tunnels wait for NetworkManager to be ready.

The result is read as follows. `sadik-set.service` checks itself through `sadik-set-proverka.sh` (ExecStartPost): if the check does not match, the unit fails. `sadik-watch`, using the list `/etc/agent-registry/storozha-sutochnye.txt`, makes sure that `sadik-vpn-failover.service` runs at least once an hour and `ru-cidr-update.service` at least once every 170 h. Everything else goes to the system journal (tags below, in the "Check" section), and these lines have no separate designated reader.

## What is installed and where

The package has no `package.json`. Current version — see package.json/CHANGELOG; for this package the number is the heading in `CHANGELOG.md` and in the tag `dsh-set-sadik-v<номер>`. The table below has been reconciled with `derevo.files` of the `dsh-set-sadik` entry in `/etc/agent-registry/plugins.yaml`. Modes and owners were taken with `sudo stat` on 2026-10-08 around 18:50Z: all 20 match the registry.

| file in the package | path on the machine | mode, owner | who executes or reads it |
|---|---|---|---|
| `sbin/ru-cidr-update.sh` | `/usr/local/sbin/ru-cidr-update.sh` | 0755 root:root | `ru-cidr-update.service` (by timer); `ru-split-apply.sh`, when the `ru_v4` set is empty |
| `sbin/ru-split-apply.sh` | `/usr/local/sbin/ru-split-apply.sh` | 0755 root:root | `ru-split.service` (at boot) |
| `sbin/sadik-reply-routing.sh` | `/usr/local/sbin/sadik-reply-routing.sh` | 0755 root:root | `sadik-set.service` (ExecStart); ExecStartPost of four `awg-quick@` via drop-in; hook `50-sadik-set` |
| `sbin/sadik-set-proverka.sh` | `/usr/local/sbin/sadik-set-proverka.sh` | 0755 root:root | `sadik-set.service` (ExecStartPost); hook `50-sadik-set` (output goes to the journal); manually |
| `sbin/sadik-vpn-failover.sh` | `/usr/local/sbin/sadik-vpn-failover.sh` | 0755 root:root | `sadik-vpn-failover.service` by timer |
| `sbin/sadik-vpn-only-killswitch.sh` | `/usr/local/sbin/sadik-vpn-only-killswitch.sh` | 0755 root:root | executed by `sadik-vpn-only-killswitch.service`: installs the outbound chain `SADIK_VPN_ONLY_OUT` (in `OUTPUT`) and the inbound chain `SADIK_EXT_IN` (in `INPUT` for `-i wan0`); `sadik-set-proverka.sh` does not run it but reads it: takes the `-d` addresses from it |
| `systemd/awg-quick@.service.d/05-nm-online.conf` | `/etc/systemd/system/awg-quick@.service.d/05-nm-online.conf` | 0644 root:root | systemd: drop-in on the template, applies to all `awg-quick@` |
| `systemd/awg-quick@awg-ru.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg-ru.service.d/20-rule-order.conf` | 0644 root:root | systemd: ExecStartPost `-sadik-reply-routing.sh` |
| `systemd/awg-quick@awg0.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg0.service.d/20-rule-order.conf` | 0644 root:root | same |
| `systemd/awg-quick@awg0.service.d/transport.conf.disabled-20260821` | `/etc/systemd/system/awg-quick@awg0.service.d/transport.conf.disabled-20260821` | 0644 root:root | nobody: systemd reads only `*.conf`; the file is kept as history |
| `systemd/awg-quick@awg3.service.d/10-reply-routing.conf` | `/etc/systemd/system/awg-quick@awg3.service.d/10-reply-routing.conf` | 0644 root:root | systemd: ExecStartPost `-sadik-reply-routing.sh` |
| `systemd/awg-quick@awg9.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg9.service.d/20-rule-order.conf` | 0644 root:root | same |
| `systemd/ru-cidr-update.service` | `/etc/systemd/system/ru-cidr-update.service` | 0644 root:root | systemd; no `[Install]`, started only by the timer |
| `systemd/ru-cidr-update.timer` | `/etc/systemd/system/ru-cidr-update.timer` | 0644 root:root | systemd, `timers.target` |
| `systemd/ru-split.service` | `/etc/systemd/system/ru-split.service` | 0644 root:root | systemd, `multi-user.target` |
| `systemd/sadik-set.service` | `/etc/systemd/system/sadik-set.service` | 0644 root:root | systemd, `multi-user.target`; `PartOf=` both network managers |
| `systemd/sadik-vpn-failover.service` | `/etc/systemd/system/sadik-vpn-failover.service` | 0644 root:root | systemd; no `[Install]`, started only by the timer |
| `systemd/sadik-vpn-failover.timer` | `/etc/systemd/system/sadik-vpn-failover.timer` | 0644 root:root | systemd, `timers.target` |
| `systemd/sadik-vpn-only-killswitch.service` | `/etc/systemd/system/sadik-vpn-only-killswitch.service` | 0644 root:root | systemd, `multi-user.target` |
| `NetworkManager/dispatcher.d/50-sadik-set` | `/etc/NetworkManager/dispatcher.d/50-sadik-set` | 0755 root:root | the NetworkManager dispatcher on interface events |

`README.md` and `CHANGELOG.md` are not installed into production (the `not_installed` field of the registry entry). The package has no `test/` or `docs/` directories.

What the package does not install, although it does not work without it:
- tunnel configs and keys `/etc/amnezia/amneziawg/*.conf` and `*.key` (`*.conf` is read by `sadik-reply-routing.sh` and `sadik-set-proverka.sh`);
- the route `default dev awg-ru` in table 225, where RU split sends marked traffic. The package code does not install it: in production on 2026-10-08 it is present, but I did not check where it comes from — the tunnel config is closed;
- the directory `/etc/ru-split/`: the scripts write `ru_v4.cidrs` and `update.log` there, but do not create it;
- the programs `bash`, `nft`, `ip`, `iptables`, `python3`, `curl`, `awk`, `sed`, `paste`, `timeout`, `logger`, `awg` or `wg`, `awg-quick`, NetworkManager.

## Installation

Manual installation without our tools (root): for each file from the table "What is installed and where" —
`install -D -o root -g root -m <режим из таблицы> <файл в пакете> <путь на машине>`; then `install -d -m 0755 /etc/ru-split`,
`systemctl daemon-reload` and `systemctl enable --now` of the units from step 3 below. Before that, edit the constants for your machine
(section "What to change for another machine"): otherwise the killswitch will cut the machine off the network.

Here it is installed through the gates, file by file, with the tool `/usr/local/sbin/smontirovat-fajly`. This is what the `update` field of the registry entry prescribes: «новый номер пакета в дереве → ворота → монтаж smontirovat-fajly → перевести version/ref здесь» (new package number in the tree → gates → mount with smontirovat-fajly → move version/ref here). `smontirovat-vypusk` does not fit here: it assembles the file set by running `npm pack`, and the package has no `package.json`. While Veniamin's temporary rule is in force, any file of the package changes only together with a new package number in the same window.

1. The candidate is the package directory from the tree at the tag, `<П>` below. By default the tool does a dry run and writes to production only with `--v-boj`. One call covers one production directory, so there are three calls (files are given as paths relative to the candidate):

   ```
   sudo smontirovat-fajly --punkt <пункт> --progon <П> /usr/local sbin/ru-split-apply.sh …
   sudo smontirovat-fajly --punkt <пункт> --progon <П>/systemd /etc/systemd/system sadik-set.service awg-quick@awg0.service.d/20-rule-order.conf …
   sudo smontirovat-fajly --punkt <пункт> --progon <П>/NetworkManager /etc/NetworkManager dispatcher.d/50-sadik-set
   ```

   When the dry run is clean, the same call is repeated with `--v-boj` instead of `--progon`. If the file is not yet in production, `--novyj` is needed. The mode and owner of the new file are then taken from its neighbours in the directory, or else set explicitly: `--mode=755 --owner=0:0` for `sbin/` and the hook, `--mode=644 --owner=0:0` for units. No file list means all regular files of the candidate.

   Tool exit codes: 0 — installed and verified; 1 — failure on write or verification mismatch (the tool rolls back by itself); 2 — refusal before writing; 3 — nothing to mount, everything already equals production; 4 — installed, but the letter to the owner of dorabotki was not delivered; 5 — installed, but the git accounting commit was not made. `/usr/local` and `/etc/systemd/system` are under git, and the tool commits them itself. If the account is not in its table, the hand is named with the key `--ruka 'Имя <имя@машина>'`. There is no git under `/etc/NetworkManager`. The backup goes to `/var/backups/montazh/<пункт>/`.

2. After units and drop-ins: `sudo systemctl daemon-reload`. On first installation, create the directory for the RF address set —
   the package scripts write to it but do not create it: `sudo install -d -m 0755 -o root -g root /etc/ru-split`. Without
   the directory, `ru-cidr-update.sh` (since 1.0.2) loads the `ru_v4` set into `nft` but fails when writing `ru_v4.cidrs`: code 1,
   `ru-cidr-update.service` failed, `update.log` is not written, and `sadik-watch` sees the list as stale.

3. First installation — enable the units:

   ```
   sudo systemctl enable --now ru-split.service sadik-set.service sadik-vpn-only-killswitch.service ru-cidr-update.timer sadik-vpn-failover.timer
   ```

4. When scripts changed on a machine where everything is already installed. `sadik-vpn-failover.sh` and `ru-cidr-update.sh` are picked up by themselves at the next timer firing. `ru-split-apply.sh`, `sadik-reply-routing.sh` and `sadik-vpn-only-killswitch.sh` take effect only when their unit starts again (`sudo systemctl restart ru-split.service`, `sadik-set.service`, `sadik-vpn-only-killswitch.service`). A new tunnel drop-in starts working only after the tunnel restarts, and a restart breaks connectivity through that tunnel. The NetworkManager dispatcher takes the hook `50-sadik-set` from the directory on every event. This follows from how NetworkManager works; I did not verify it on the machine.

⚠️ Editing the killswitch or routing without a ready rollback can cut the machine off the network. Keep the rollback path before applying. A unit is taken down with `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask, so the file is moved to the backup (`mv`), `daemon-reload` is run, then `mask`. To restore — `unmask` and put the file back.

## Configuration

No unit of the package sets `Environment=`: in production on 2026-10-08, `sadik-set`, `ru-split`, `sadik-vpn-only-killswitch`, `sadik-vpn-failover` and `ru-cidr-update` have an empty `Environment`. So in production the defaults always apply.

| what | default | meaning |
|---|---|---|
| variable `RU_SPLIT_PRIO_FILE` (`ru-split-apply.sh`, `sadik-reply-routing.sh`) | `/etc/ru-split/prio` | path to the RU split rule priority file; since 1.0.2 BOTH scripts read it. There is one source of truth — the file itself; the validity check is duplicated identically in both scripts: changing the check rule in one requires the same change in the other |
| variable `RU_SPLIT_MIN` (`ru-split-apply.sh`) | 5000 | how many networks must be in the `ru_v4` set after applying; fewer — refusal, code 1 |
| contents of `/etc/ru-split/prio`: one number (`ru-split-apply.sh`, `sadik-reply-routing.sh`) | no file → 60 (on sadik there is none) | priority of the rule `ip rule fwmark 0xa2c9 lookup 225`. Leading zeros are read as a decimal number. Not a number, longer than 5 digits or outside 1..32765: `ru-split-apply.sh` — refusal, code 2, rules untouched; `sadik-reply-routing.sh` — the line «ОТКАЗ: … правило пометки RU-split не трогаю» (REFUSAL: … not touching the RU-split mark rule) to stderr and the journal (tag `sadik-reply-routing`), leaves the mark rule untouched, installs the remaining rules and exits with code 0 |
| variable `THRESH` (`sadik-vpn-failover.sh`) | 200 | age of the last handshake in seconds; older — the tunnel is considered dead |
| variable `SET_CONF_DIR` (`sadik-set-proverka.sh`, `sadik-vpn-failover.sh`) | `/etc/amnezia/amneziawg` | where to read `Endpoint` from `*.conf`; since 1.0.2 the switcher uses it to know whose handshake to count |
| variable `SET_EXT_IF` (`sadik-set-proverka.sh`, `50-sadik-set`) | `wan0` | external interface: the check expects the route through it, the hook reacts only to it |
| variable `SET_KILLSWITCH` (`sadik-set-proverka.sh`) | `/usr/local/sbin/sadik-vpn-only-killswitch.sh` | file from which the check takes the `-d` addresses to compare them with the connection points |
| arguments `$1`, `$2` of the hook `50-sadik-set` | given by NetworkManager | interface and event. Acts only on `up`, `dhcp4-change`, `dhcp6-change` of `SET_EXT_IF`, anything else — exit 0 |
| `OnCalendar`, `RandomizedDelaySec`, `Persistent` in `ru-cidr-update.timer` | `Sun *-*-* 04:17:00`, 600, `true` | when to update the RF address set |
| `OnBootSec`, `OnUnitActiveSec` in `sadik-vpn-failover.timer` | 90, 30 | first run after boot and the period |
| `Restart`, `RestartSec`, `StartLimitIntervalSec`, `StartLimitBurst`, `TimeoutStartSec` in `sadik-set.service` | `on-failure`, 10, 600, 3, 150 | retry when applying or the check fails: no more than 3 starts in 600 s |

Everything else is a constant in the code and cannot be changed by variables. This is the external interface `wan0` and its gateway; tables 100, 224, 225, 51820; marks `0x100` (replies), `0xa2c9` (RU split), `0xca6c` (the tunnel's own packets); rule priorities 40, 50, 75, 78, 79, 32764, 32765 in `sadik-reply-routing.sh` (the RU split mark priority comes from `/etc/ru-split/prio`, see above); the tunnel config directory in `sadik-reply-routing.sh`; the RIPE source, the directory `/etc/ru-split` and the 500 CIDR threshold in `ru-cidr-update.sh`; the exception address lists in `ru-split-apply.sh` and `sadik-vpn-only-killswitch.sh`; SSH port 38888; tunnel names `awg3`/`awg0` in the switcher.

### What to change for another machine

🔴 The package is written for sadik: the addresses, interfaces and ports below are hard-coded, not taken from settings. Installed
as is on another machine, it will apply foreign addresses, and the killswitch will cut that machine off the network: egress is allowed only to sadik's
tunnel endpoints. Before installing on another machine, each place is edited in the code. A place is named by file and constant, not
by line number: line numbers shift from edit to edit.

| what | where in the code | on sadik |
|---|---|---|
| external interface and its gateway | `sadik-reply-routing.sh`, `EXT_IF=` and `EXT_GW=`; the interface also in `sadik-vpn-only-killswitch.sh` (`-i wan0`, `-o wan0`) | `wan0`, the provider's gateway |
| own external /28 network | `sadik-reply-routing.sh`, rule `to <сеть> lookup main priority 50` | sadik's /28 |
| tunnel endpoints (address and UDP port) | `sadik-vpn-only-killswitch.sh`, lines `-p udp -d <адрес> --dport <порт>`; `ru-split-apply.sh`, rule `ip daddr { … } return`; configs `/etc/amnezia/amneziawg/*.conf` | `awg3`, `awg0`, `awg9`, `awg-ru` |
| tunnel names | killswitch (`-o awg3` … `-o awg-ru`), `sadik-vpn-failover.sh` (`awg3` primary, `awg0` backup), `sadik-reply-routing.sh` (`awg3` in table 51820) | `awg3`, `awg0`, `awg9`, `awg-ru` |
| corporate network (management channel) | killswitch, `-d 10.240.0.0/16` on `lan0` and `wan0` | `10.240.0.0/16` via `lan0` |
| external SSH port | killswitch: inbound `--dport 38888`, replies `--sport 38888` | `38888` |
| Novofon network | killswitch `-d 37.139.38.0/24`; `ru-split-apply.sh` (`return` before marking); `sadik-reply-routing.sh` (`lookup 224 priority 75`) | `37.139.38.0/24` |
| neighbours in the /28 | killswitch, two rules `-d <адрес> -o wan0` | two neighbouring servers |
| source of the RF address set and directory | `ru-cidr-update.sh`, `SRC=` and `DIR=` | RIPE, `/etc/ru-split` |
| tables, marks and rule priorities | `sadik-reply-routing.sh`, `ru-split-apply.sh` | tables 100, 224, 225, 51820; marks `0x100`, `0xa2c9`, `0xca6c`; priorities in "Configuration" above |

The complete list of what the outbound killswitch filter `SADIK_VPN_ONLY_OUT` lets out; everything else — REJECT:

- `-o lo`;
- replies to external SSH: `-o wan0 -p tcp --sport 38888`;
- all egress into tunnels: `-o awg3`, `-o awg0`, `-o awg9`, `-o awg-ru`;
- corporate network: `-o lan0 -d 10.240.0.0/16` and `-o wan0 -d 10.240.0.0/16`;
- tunnel endpoints via `wan0`: four UDP "address · port" rules (US `awg3`, NL `awg0`, RU mesh `awg9`, RU split `awg-ru`);
- Novofon: `-d 37.139.38.0/24 -o wan0`, any protocol;
- DHCP: `-p udp --dport 67` on `wan0` and on `lan0`;
- two neighbours in the /28: `-d <адрес> -o wan0`, any protocol.

The inbound filter `SADIK_EXT_IN` (only `-i wan0`) passes `RELATED,ESTABLISHED` and `tcp --dport 38888`, everything else —
DROP with an entry in the kernel log.

## Check

There are no test stands in the package: there is no `test/` directory.

The installation check is `installed_check` from the registry entry, verbatim:

```
set -o pipefail; sha256sum /etc/NetworkManager/dispatcher.d/50-sadik-set /etc/systemd/system/awg-quick@.service.d/05-nm-online.conf /etc/systemd/system/awg-quick@awg-ru.service.d/20-rule-order.conf /etc/systemd/system/awg-quick@awg0.service.d/20-rule-order.conf /etc/systemd/system/awg-quick@awg0.service.d/transport.conf.disabled-20260821 /etc/systemd/system/awg-quick@awg3.service.d/10-reply-routing.conf /etc/systemd/system/awg-quick@awg9.service.d/20-rule-order.conf /etc/systemd/system/ru-cidr-update.service /etc/systemd/system/ru-cidr-update.timer /etc/systemd/system/ru-split.service /etc/systemd/system/sadik-set.service /etc/systemd/system/sadik-vpn-failover.service /etc/systemd/system/sadik-vpn-failover.timer /etc/systemd/system/sadik-vpn-only-killswitch.service /usr/local/sbin/ru-cidr-update.sh /usr/local/sbin/ru-split-apply.sh /usr/local/sbin/sadik-reply-routing.sh /usr/local/sbin/sadik-set-proverka.sh /usr/local/sbin/sadik-vpn-failover.sh /usr/local/sbin/sadik-vpn-only-killswitch.sh | LC_ALL=C sort -k2 | sha256sum | cut -c1-16 | sed 's/^/sha256:/'
```

Run it as root (`sudo bash -c '…'`): without privileges some files will not be readable, and the fingerprint will not cover them. Expect code 0 and output equal to the `version` field of the entry. On 2026-10-08 around 18:50Z both were equal to `sha256:22ad6aa999d7b43c`.

`healthcheck` from the registry entry: `systemctl is-active sadik-vpn-failover.timer`. Expect `active` and code 0. It covers only the switcher's timer.

Exit codes of the package's services that fail the unit (since 1.0.2):
- `ru-split-apply.sh` — 1 if after applying the `ru_v4` set has fewer than `RU_SPLIT_MIN` networks (default 5000) or there is no
  rule `fwmark 0xa2c9 lookup 225`; the line «ОТКАЗ: RU split НЕ работает: …» (REFUSAL: RU split is NOT working: …), `ru-split.service` becomes failed. 2 —
  invalid `/etc/ru-split/prio`;
- `sadik-vpn-only-killswitch.sh` — 3 if IPv6 is not disabled (the IPv4 rules are already in place); 4 — BEFORE any change: the chain
  `SADIK_VPN_ONLY_OUT_NEW` or `SADIK_EXT_IN_NEW` already exists and is referenced
  («цепь …_NEW живая (ссылок N) — прежняя подстановка не завершилась; правила не трогаю» (chain …_NEW is live (N references) — the previous substitution did not complete; not touching the rules)). It is sorted out by hand: `sudo iptables -S | grep _NEW`. Total codes 0 / 3 / 4;
- `ru-cidr-update.sh` — 2 if fewer than 500 CIDR arrived (the set is untouched); 1 if there is no directory `/etc/ru-split` (the set
  is already loaded, the list is not written). The list `/etc/ru-split/ru_v4.cidrs` is written
  only AFTER the set has been loaded into `nft` successfully: a load failure no longer leaves a fresh file with an old set.

Network by property — `sudo /usr/local/sbin/sadik-set-proverka.sh`. Under an ordinary account the tunnel configs are not readable, and the result is "blindness" with code 2. Codes: 0 — matched; 1 — there is a mismatch (no route to a connection point, it does not go through `wan0`, there is no `lookup 100`, `suppress_prefixlength` or `lookup 51820` rule, or the point is not in the killswitch); 2 — nothing to check with (connection points not read or killswitch not read). The last output line is `ИТОГО: сошлось N, расхождений M, слепот K (точек подключения: P)` (TOTAL: matched N, mismatches M, blind K (connection points: P)).

What else to look at:
- `systemctl list-timers ru-cidr-update.timer sadik-vpn-failover.timer` — both timers are scheduled;
- `systemctl is-active ru-split.service sadik-set.service sadik-vpn-only-killswitch.service` — each is `active` (oneshot with `RemainAfterExit`);
- the journal by tags: `journalctl -t sadik-vpn-failover` (switchovers), `-t sadik-reply-routing` (warning about priority order), `-t sadik-nm-hook` (hook firings and check output), `-u ru-cidr-update.service`; the kernel log with prefixes `[SADIK EXT DROP]` and `[SADIK NO-VPN OUT]` (killswitch rejections, no more than 6 per minute);
- `/etc/ru-split/update.log` — one line per set update;
- the killswitch is checked by counters (`sudo iptables -L SADIK_VPN_ONLY_OUT -v -n`, inbound filter — `sudo iptables -L SADIK_EXT_IN -v -n`), not by ping: only UDP to their ports is open towards the tunnel endpoints, ICMP will go to REJECT and give a false failure;
- the checksum of each package file equals the production checksum (`sudo sha256sum`), permissions match the table above (`sudo stat -c '%a %U:%G'`).

## Limitations

- `sadik-set-proverka.sh` catches only "rules and routes were wiped". It does not see that the connection point changed on the far side while the config stayed the same. It does not see channel quality (loss, latency, MTU) and does not check whether there is internet access at all. It checks the presence of rules by substring, without checking their priorities, and does not check the RU split rules (60 by default), Novofon (75), neighbours in the /28 (50) or the table 225 route at all.
- If the check in ExecStartPost returns 1 or 2, `sadik-set.service` fails. Blindness (2) also fails the unit. Systemd restarts it no more than three times in 600 s, after which the unit stays `failed`.
- The hook `50-sadik-set` fires only on `up`, `dhcp4-change` and `dhcp6-change` of `wan0`. It does not catch the case where NetworkManager is not running at all. Silence of the hook does not mean the network is healthy.
- The tunnel drop-ins call `sadik-reply-routing.sh` with the `-` prefix, so a script failure does not bring the tunnel down and is not visible from outside. The script waits for the gateway up to 79 s (20 attempts) and, if it does not get it, exits with 1 without changing rules.
- Tunnel endpoint addresses are recorded in three places: the tunnel configs (from where `sadik-reply-routing.sh` and the check take them), constants in `sadik-vpn-only-killswitch.sh` and constants in `ru-split-apply.sh`. The check compares the configs only with the killswitch. If an address changes, the killswitch will silently block the new one, and the RU split exception list will stay outdated, and nobody will notice. The lists are not synchronised: this is a deliberate decision.
- The priority of the RU split mark rule (`fwmark 0xa2c9 lookup 225`) since 1.0.2 is taken from `/etc/ru-split/prio` by both scripts, `ru-split-apply.sh` and `sadik-reply-routing.sh`. Previously `sadik-reply-routing.sh` set it to 60 as a constant, and on a machine with a different number in the file every tunnel start, hook firing and restart of `sadik-set` put the rule back to 60.
- `sadik-reply-routing.sh` puts `default dev awg3` into table 51820 only if it has no default route yet (since 1.0.2). The choice between US (`awg3`), NL (`awg0`) and `unreachable` belongs entirely to `sadik-vpn-failover.sh`: a start of `sadik-set`, of a tunnel, or the hook no longer overrides it. Previously any of these events returned egress to US until the next switcher run.
- `sadik-vpn-failover.sh` considers a tunnel alive by the freshness of the handshake (younger than `THRESH`) with THE peer whose connection point is written in `Endpoint` of the config `SET_CONF_DIR/<туннель>.conf` (since 1.0.2; previously the first line of `latest-handshakes` was taken). With one peer, that peer is taken. With several peers and the point not recognised, the tunnel is considered dead, and the reason is written to the journal (tag `sadik-vpn-failover`). It knows only `awg3` and `awg0`. When both are dead, it sets `unreachable` (fail-closed). If there is neither `awg` nor `wg`, the script fails without switching anything. I did not check whether the tunnel configs have `PersistentKeepalive`: without it a tunnel with no traffic does not refresh its handshake.
- The killswitch is two filters. The outbound `SADIK_VPN_ONLY_OUT` (first rule of `OUTPUT`) lets out only the tunnels, the corporate network, the tunnel endpoints and named exceptions, everything else — REJECT. The inbound `SADIK_EXT_IN` (first rule of `INPUT` for `-i wan0`) passes only `RELATED,ESTABLISHED` and `tcp --dport 38888`, everything else — DROP with a `[SADIK EXT DROP]` entry; the internal `lan0` and the tunnels are not affected by it. A new inbound port on `wan0` other than 38888 will be silently dropped until it is added to the code.
- The killswitch is built on `iptables` only (IPv4); the code installs no `ip6tables` rules. Since 1.0.2 it builds the chains under temporary names `SADIK_VPN_ONLY_OUT_NEW` and `SADIK_EXT_IN_NEW`, adds a jump to the new chain, removes the jumps to the old one and renames the new one: there is no empty chain on the path and no window of open egress on re-application. After installing the IPv4 rules it checks `net.ipv6.conf.all.disable_ipv6`: not 1 — refusal, code 3, «IPv6 не выключен…» (IPv6 is not disabled…), and the service `sadik-vpn-only-killswitch` becomes failed. By that moment the IPv4 rules are already in place. On sadik IPv6 is disabled by machine settings — this is part of the policy.
- `ru-cidr-update.sh` collects only IPv4 (`ru_v4`). If fewer than 500 CIDR arrived, it refuses with code 2 and leaves the set untouched. Without access to `ftp.ripe.net` the set will not be updated.
- The package does not install the tunnel configs and keys, the table 225 route and the directory `/etc/ru-split` (see section "What is installed and where"). The rule `72: to 46.19.64.6 iif lo ipproto tcp lookup 225`, which exists in production, is not installed by this package.
- The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`).
