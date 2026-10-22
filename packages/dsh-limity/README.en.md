# dsh-limity — subscription measurements and quota status

**Version:** 3.1.5

[Русский README](README.md). Local service software for sadik, distributed as sources. Documentation in English is not permission to publish the software or host data. There is no npm installer.

The root service is the only writer of limity.db. It consumes gateway measurements from the intake directory and Codex quota state from dsh-podpiski, then builds limity.json. Separate collectors obtain Claude SDK usage and DeepSeek account balance. The shared Claude switcher reads that output and calls the switcher in dsh-podpiski.

## Installation manifest

This revision has19 runtime/config/unit files; its anonymized sample config is separate data:

| Source | Destination | Mode / owner |
|---|---|---|
| `etc/dsh-limity.gitignore` | `/etc/dsh-limity/.gitignore` | 0644 root:root |
| `etc/sysusers.d/dsh-limity.conf` | `/etc/sysusers.d/dsh-limity.conf` | 0644 root:root |
| `etc/tmpfiles.d/dsh-limity.conf` | `/etc/tmpfiles.d/dsh-limity.conf` | 0644 root:root |
| `lib/dsh_limity_konfig.py` | `/usr/local/lib/dsh-limity/dsh_limity_konfig.py` | 0644 root:root |
| `libexec/dsh-limity-avtoperekl` | `/usr/local/libexec/dsh-limity-avtoperekl` | 0755 root:root |
| `libexec/dsh-limity-deepseek` | `/usr/local/libexec/dsh-limity-deepseek` | 0755 root:root |
| `libexec/dsh-limity-vydat` | `/usr/local/libexec/dsh-limity-vydat` | 0755 root:root |
| `libexec/dsh-limity-zamer` | `/usr/local/libexec/dsh-limity-zamer` | 0755 root:root |
| `libexec/dsh-limity-zamer.mjs` | `/usr/local/libexec/dsh-limity-zamer.mjs` | 0644 root:root |
| `sbin/dsh-limity` | `/usr/local/sbin/dsh-limity` | 0755 root:root |
| `sbin/dsh-limity-podpiski` | `/usr/local/sbin/dsh-limity-podpiski` | 0755 root:root |
| `systemd/dsh-limity-avtoperekl.service` | `/etc/systemd/system/dsh-limity-avtoperekl.service` | 0644 root:root |
| `systemd/dsh-limity-avtoperekl.timer` | `/etc/systemd/system/dsh-limity-avtoperekl.timer` | 0644 root:root |
| `systemd/dsh-limity-deepseek.service` | `/etc/systemd/system/dsh-limity-deepseek.service` | 0644 root:root |
| `systemd/dsh-limity-deepseek.timer` | `/etc/systemd/system/dsh-limity-deepseek.timer` | 0644 root:root |
| `systemd/dsh-limity-zamer.service` | `/etc/systemd/system/dsh-limity-zamer.service` | 0644 root:root |
| `systemd/dsh-limity-zamer.timer` | `/etc/systemd/system/dsh-limity-zamer.timer` | 0644 root:root |
| `systemd/dsh-limity.service` | `/etc/systemd/system/dsh-limity.service` | 0644 root:root |
| `systemd/dsh-limity.timer` | `/etc/systemd/system/dsh-limity.timer` | 0644 root:root |

etc/podpiski.json is a machine sample, not an unconditional replacement for /etc/dsh-limity/podpiski.json. README, CHANGELOG, LICENSE and test fixtures stay in the source checkout. The existing configuration is managed as a git repository; preserve credentials and registry data during upgrades.

## Dependencies and order

- Python3, sqlite3, PyYAML (python3-yaml), systemd, git, setpriv/runuser, account-management tools and getfacl/setfacl.
- /usr/local/bin/node and the installed Anthropic SDK at /opt/subscription-gateway-guest/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs for usage. Interactive login uses the separate native CLI /opt/subscription-gateway-guest/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude (DSH_LIMITY_CLI). Node, the SDK module and that binary are external dependencies.
- dsh-trevogi supplies /usr/local/bin/agent-alert. a2a-bus supplies /usr/local/bin/agent-registry and /etc/agent-registry/agents.yaml; the automatic switcher invokes agent-registry pole, while the collector also reads registry data.
- dsh-podpiski supplies codex-limit-watch, its state /var/lib/codex-limit-watch/sostoyanie.json, pereklyuchatel-podpiski and the quota reader /usr/local/libexec/pereklyuchatel-podpiski-limity.py with /etc/default/pereklyuchatel-podpiski-limity.
- Gateway users/instance env files and the claudeoauth group come from the gateway/host layout. Measurement accounts and limity-vhod membership must exist before measurement. Optional remote display additionally needs an SSH forced command, an authorized key and the remote page.

The deployment window installs the library and executables first, then sysusers/tmpfiles definitions. Create limity-vhod and limity-ds, establish directories/ACL, initialize tracked configuration, run the authorized login process and verify account membership. The p1..p3 membership entries in sysusers are host data; do not assume those users already exist. Prepare DeepSeek LoadCredential via the management command. Install/reload units and enable selected timers after configuration and intake checks. Deployment, accounts, credentials and live services are the coordinator's work.

The intake parent is 0711 root:root; /var/spool/dsh-limity/vhod is 1730 root:claudeoauth with an additional limity-vhod write/search ACL. Readers validate the opened file descriptor, owner, regular-file type, size and the account-to-subscription binding. Plausible but false usage from the same trusted account is outside this protection.

## Measurement schedule

The Claude measurement timer invokes the wrapper every 10 minutes. The supplied service sets **DSH_LIMITY_ZAMER_SVEZHO_MIN=0**: recent gateway traffic does not suppress the SDK usage attempt. All enabled Claude subscriptions with a measurement login are eligible. Each has a 60 minute interval between attempts, including failures, and a default daily cap of 24*60/60=24 attempts. One attempt obtains SDK usage without a model prompt.

| Setting | Program default | Supplied service |
|---|---:|---:|
| DSH_LIMITY_ZAMER_SVEZHO_MIN | 30 minutes | 0 |
| DSH_LIMITY_ZAMER_RAZ_V_MIN | 60 minutes | default |
| DSH_LIMITY_ZAMER_POTOLOK_SUTKI | 24*60/RAZ_V_MIN | default |

A manual wrapper invocation outside the service environment again uses 30 minutes for freshness. ENABLE_CLAUDEAI_MCP_SERVERS=false is set by the service; do not set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, which suppresses usage itself.

The main database/output timer runs every minute. Codex quota measurements come from codex-limit-watch every 10 minutes, without a model turn. DeepSeek uses its own limity-ds service and LoadCredential; its wrapper is woken every 10 minutes but rate-limits each key's balance request to60 minutes, default 24 attempts/day. The network balance request is logged; the credential value is not logged or placed in argv.

## Data and alerts

An unmeasured or expired window is null, never zero. Each snapshot's snyato_unix is the measurement time; top-level snyato_unix is the oldest included measurement, while vydano_unix is output-generation time. Consumer freshness must use the appropriate field.

Read **podpiski.<key>.kredity** for credit status. usage.kredity is diagnostic raw-usage parsing with a different shape. Claude credit keys are vklyucheny/predel_dostignut/dolya/predel_usd/potracheno_usd/valyuta/snyato_unix; Codex uses est/bezlimit/ostatok/pererashod_ischerpan. Currency comes from the response. Unknown unit or absent credits produce null amounts; a nominal dolya0 does not override that. Keep the historical *_usd field names for consumer compatibility.

Claude window alerts: five-hour85%, weekly80%/90%; stale measurement after 130 minutes. Credit alerts use 50%/80%/95% of the monthly cap. Authentication expiry warning is 7 days before expiry. Output older than 40 minutes triggers the output-stall alert. Alerts follow transitions, and “said” is recorded only after delivery. See RU tables for automatic-switch thresholds and the reader's shared freshness rule.

The service itself reads no provider credentials and makes no provider request. The collectors have distinct accounts/credential sources. The forced SSH command returns one regular output file (max 1 MiB); it does not certify the remote page or output freshness.

## Management and exit codes

`dsh-limity-podpiski proverit` validates configuration; `spisok` lists subscriptions. An inaccessible directory is shown as “вход ? — не проверить без root”, not a missing login; use root for the protected-directory check. `vojti <key> [--prichina <reason>]`, `snyat <key> --prichina <reason>` and `klyuch <key>` are changes to tracked data, accounts or credentials, not read-only probes. Unknown keys such as --dry-run are refused.

The four service programs dsh-limity/zamer/deepseek/avtoperekl take no arguments: 0 pass completed, 2 blind, 3 invalid call. The zamer/deepseek/avtoperekl units now use SuccessExitStatus=0: 2 is a unit failure. The main dsh-limity.service still accepts 0/2; that does not certify a source measurement. The forced-output command returns 0 on success, 2 on unreadable output, 3 on prohibited command. The quota reader returns 0 free,10 blocked, 20 unknown:

```text
python3 /usr/local/libexec/pereklyuchatel-podpiski-limity.py <number> --baza <limity.db> --nastrojka <settings>
```

The reader has no --file option. It reads the database; SQLite WAL may create side files even on a read-only connection. Only the main service owns application database writes.

## Verification and limits

Use isolated fixtures, including test/stend-porogi.py, whose executed count is printed at completion. test/stend-dsh-limity.sh requires root for fake file owners and an explicit candidate reader. Its page fixture is a snapshot, not a check of the live page.

Do not run test/stend-konfig.py --zhivaya-mashina as a routine pre-deployment check: it creates/deletes real system accounts/groups. Without the exact flag it refuses with 2; a SIGKILL can leave its temporary users behind. The code audit of this module does not authorize that live test.

Files must be mounted by the designated deployment operator with backup and independent readback. Code, source version and running process are separate observations. Before the full deployment/measurement gate, unused/missing sources and the remote page remain outside verification. See the [RU details](README.md) and [two-package design](../../docs/SUBSCRIPTIONS-AND-LIMITS.md).

## Ledger and failure contract for module 11

The zamer/avtoperekl/deepseek ledgers use the shared atomic writer: temporary JSON beside the target, fsync file, replace, fsync directory. Invalid JSON or consumed field types returns 2 without resetting cooldown/day caps. Recover from the operator’s valid backup and verify counters. Ledger-write failure blocks the request/switch before the external action; a failure after replace can mean the new record already exists and needs readback. Keep the library and all callers in the same deployment/rollback.

Root callers name alert delivery/failure. DeepSeek publishes an error snapshot through the existing intake; dsh-limity then root dsh-limity-zamer consume it for alert/recovery. The three updated units treat 2 as failure; the main unit retains its separate policy.

DSH_LIMITY_DEEPSEEK_URL requires DSH_LIMITY_DEEPSEEK_STEND=1. Without the key the override is ignored; invalid key returns 3. PATH, DSH_LIMITY_LIB and ordinary DSH_LIMITY paths/settings are not protected by this specific URL guard.

Automatic switching logs/skips a gateway with MainPID=0 and checks the remaining live gateways. Non-numeric PID or unknown subscription of a live process returns 2. The 30 minute cooldown and targets 1–3 remain. test/stend-audit-sostoyanie.py supplies package-level checks. The neutral sample must not overwrite live /etc/dsh-limity/podpiski.json.
