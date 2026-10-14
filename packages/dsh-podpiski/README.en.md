# dsh-podpiski — subscription switching and token access on sadik

Версия · Version: 3.1.3

[Русский README](README.md). This is local service software, distributed as source files. The English documentation does not authorize external publication. There is no package.json or npm installer.

The package switches shared Claude subscriptions, switches Codex token links, verifies gateway ACL access, refreshes Codex credentials, watches quotas and model metadata, and receives the owner's private Telegram commands. Gateway services, credentials, the agent registry and alert transports are separate dependencies.

## Commands and callers

| Command | Call |
|---|---|
| Claude switch | `pereklyuchatel-podpiski [1\|2\|3] [force] [tiho]`; no target advances the shared gateways through 1→2→3→1 |
| Codex switch | `pereklyuchatel-codex <3\|4\|toggle\|toggle-force> [agent …]`; named agents are accepted only with explicit 3/4 |
| Token ACL | `svesti-dostup-podpisok --dobavit [--codex N]`, `--svesti`, `--proverit`, or `--chtenie [--bez-gruppy G]` |
| Dedicated subscription bindings | `svyazki-podpisok pokazat` or `razlozhit [--ustanovit]`; without --ustanovit it prepares a plan |
| Claude quota reader | `python3 /usr/local/libexec/pereklyuchatel-podpiski-limity.py <number> --baza <limity.db> --nastrojka <settings>` |
| Codex measurement | `python3 /usr/local/libexec/codex-limits-measure.py`; a manual network operation, not a stand |
| Compaction journal reader | `codex-compaction-vyborka <name> <gateway-unit>` |

`codex-auth-watch`, `codex-katalog-watch`, `codex-limit-watch`, and `codex-obnovitel` take no arguments. Their timers call them; compaction selection is called by the drop-in in dsh-compact-outcomes. The receiver is the long-running sadik-komandy.service. The ACL watcher runs separately after the ACL transition.

### Owner commands

| Telegram command | Exact service instance |
|---|---|
| `/switch-a` | `sadik-switch@a.service` |
| `/switch-1` | `sadik-switch@1.service` |
| `/switch-b` | `sadik-switch@b.service` |
| `/switch-2` | `sadik-switch@2.service` |
| `/sss` | `sadik-switch@sss.service` |
| `/sss_on` | `sadik-switch@sss-on.service` |

The receiver accepts the owner's private messages without arguments. The underscore in /sss_on becomes a hyphen in the instance name. /switch-1 removes the quota guard for Claude; /switch-2 uses Codex toggle-force. A force request still preserves the applicable access/turn checks. /sss and /sss_on create/remove /var/lib/sajt-chat/zakryto, which the site adapter reads.

An administrator installs the external /etc/sudoers.d/sadik-switch file as root:root 0440. The six commands require exact `/usr/bin/systemctl start --wait <instance>` entries; the complete sudoers line and `visudo -cf <file>` check are in the [RU command section](README.md#команды-владельца-и-sudoers). Brace notation in prose is not sudoers syntax. Existing legacy template permissions must be retained where their callers remain.

## Installation manifest

The 32 runtime/config/unit files in this source revision are:

| Source | Destination | Mode / owner |
|---|---|---|
| `etc/default/pereklyuchatel-podpiski-limity` | `/etc/default/pereklyuchatel-podpiski-limity` | 0644 root:root |
| `libexec/codex-compaction-vyborka` | `/usr/local/libexec/codex-compaction-vyborka` | 0755 root:root |
| `libexec/codex-limits-measure.py` | `/usr/local/libexec/codex-limits-measure.py` | 0755 root:root |
| `libexec/pereklyuchatel-podpiski-limity.py` | `/usr/local/libexec/pereklyuchatel-podpiski-limity.py` | 0755 root:root |
| `libexec/sadik-switch-exec` | `/usr/local/libexec/sadik-switch-exec` | 0755 root:root |
| `sbin/codex-auth-watch` | `/usr/local/sbin/codex-auth-watch` | 0755 root:root |
| `sbin/codex-katalog-watch` | `/usr/local/sbin/codex-katalog-watch` | 0755 root:root |
| `sbin/codex-limit-watch` | `/usr/local/sbin/codex-limit-watch` | 0755 root:root |
| `sbin/codex-obnovitel` | `/usr/local/sbin/codex-obnovitel` | 0755 root:root |
| `sbin/pereklyuchatel-codex` | `/usr/local/sbin/pereklyuchatel-codex` | 0755 root:root |
| `sbin/pereklyuchatel-podpiski` | `/usr/local/sbin/pereklyuchatel-podpiski` | 0755 root:root |
| `sbin/sadik-komandy-priyomnik` | `/usr/local/sbin/sadik-komandy-priyomnik` | 0755 root:root |
| `sbin/svesti-dostup-podpisok` | `/usr/local/sbin/svesti-dostup-podpisok` | 0755 root:root |
| `sbin/svesti-dostup-watch` | `/usr/local/sbin/svesti-dostup-watch` | 0755 root:root |
| `sbin/svyazki-podpisok` | `/usr/local/sbin/svyazki-podpisok` | 0755 root:root |
| `systemd/codex-auth-watch.service` | `/etc/systemd/system/codex-auth-watch.service` | 0644 root:root |
| `systemd/codex-auth-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/codex-auth-watch.service.d/60-python-padenie-70.conf` | 0644 root:root |
| `systemd/codex-auth-watch.timer` | `/etc/systemd/system/codex-auth-watch.timer` | 0644 root:root |
| `systemd/codex-katalog-watch.service` | `/etc/systemd/system/codex-katalog-watch.service` | 0644 root:root |
| `systemd/codex-katalog-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/codex-katalog-watch.service.d/60-python-padenie-70.conf` | 0644 root:root |
| `systemd/codex-katalog-watch.timer` | `/etc/systemd/system/codex-katalog-watch.timer` | 0644 root:root |
| `systemd/codex-limit-watch.service` | `/etc/systemd/system/codex-limit-watch.service` | 0644 root:root |
| `systemd/codex-limit-watch.timer` | `/etc/systemd/system/codex-limit-watch.timer` | 0644 root:root |
| `systemd/codex-obnovitel-4.service` | `/etc/systemd/system/codex-obnovitel-4.service` | 0644 root:root |
| `systemd/codex-obnovitel-4.timer` | `/etc/systemd/system/codex-obnovitel-4.timer` | 0644 root:root |
| `systemd/codex-obnovitel.service` | `/etc/systemd/system/codex-obnovitel.service` | 0644 root:root |
| `systemd/codex-obnovitel.timer` | `/etc/systemd/system/codex-obnovitel.timer` | 0644 root:root |
| `systemd/pereklyuchatel-podpiski@.service` | `/etc/systemd/system/pereklyuchatel-podpiski@.service` | 0644 root:root |
| `systemd/sadik-komandy.service` | `/etc/systemd/system/sadik-komandy.service` | 0644 root:root |
| `systemd/sadik-switch@.service` | `/etc/systemd/system/sadik-switch@.service` | 0644 root:root |
| `systemd/svesti-dostup-watch.service` | `/etc/systemd/system/svesti-dostup-watch.service` | 0644 root:root |
| `systemd/svesti-dostup-watch.timer` | `/etc/systemd/system/svesti-dostup-watch.timer` | 0644 root:root |

README, CHANGELOG and test fixtures stay in the source checkout. They are not copied into /usr/local as services. The package includes test/stend-audit-kraev.py and test/stend-b2023-receiver.py with its fixtures; older switching/ACL stands live in dsh-obhod-stendov.

Install through the designated deployment window using the full manifest, backups and separate readback. Install the quota reader together with its /etc/default settings. Install services/drop-ins, reload systemd and verify the deployment before enabling their timers. **Keep svesti-dostup-watch.timer disabled until phase2 of B-N-1621 (“ПЕРЕШЛО”) is confirmed and svesti-dostup-podpisok --proverit succeeds.** Its early failure is expected before the ACL transition. Token copies and chmod/chgrp operations require an ACL reconciliation afterward.

## External dependencies

- Python3 with sqlite3 and PyYAML (python3-yaml), Bash/coreutils, systemd/journalctl, sudo, timeout, setpriv/runuser (util-linux), getfacl/setfacl (acl).
- a2a-bus: /usr/local/bin/agent-registry and /etc/agent-registry/agents.yaml; shared/dedicated subscription intent comes from the registry.
- dsh-trevogi: /usr/local/bin/agent-alert. dsh-storozha-sadik: dsh-alert, sadik-watch quota-refusal files at /var/lib/sadik-watch/otkaz-limita-* and vladelec-tg-id. dsh-storozha-mashiny: python-padenie-70 for watcher drop-ins. dsh-podyom: /usr/local/libexec/agent-hod/hod-sluzhby.
- dsh-limity: /var/lib/dsh-limity/limity.db. This package supplies the reader and /etc/default/pereklyuchatel-podpiski-limity.
- dsh-subscription-gateway and the host layout: gateway services/users, instance env files, token paths under /etc/claude-oauth, Codex homes and the installed Codex app-server /opt/claude-oauth/sdk-runtime/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex (CODEX_OBN_BIN for the refresher).
- The receiver needs agent-switch, sudoers, /etc/dsh-alert.token, /usr/local/bin/vladelec-tg-id and trusted /etc/vladelec/telegram-id. No owner ID is substituted when that setting is unavailable.

These external files are provisioned by the deployment administrator. Secrets are read from files; their values must not be placed in argv, logs or README examples.

## Configuration and limits

- /etc/codex-limit/nastrojka.json with {"avto":true} enables quota-driven Codex switching; a missing file disables it.
- /etc/default/pereklyuchatel-podpiski-limity defines the Claude freshness rule: exhaustion fraction 1.0; free five-hour fraction <0.80 and age ≤130 minutes; free weekly fraction <0.90 and age ≤6*60 minutes. Missing/invalid settings mean unknown, not free.
- codex-limit-watch: selected quota at 95%, warning at 80%, hysteresis 2 percentage points; automatic switching no more than once per 3600 seconds and3 times per 24 hours. Missing measurements are not zeros.
- codex-auth-watch: at least48 hours of access validity, refresh-run trace no older than26 hours. codex-obnovitel refreshes below CODEX_OBN_POROG_CH=72 hours; app-server timeout CODEX_OBN_PREDEL_S=240 seconds; out-of-band attempts are throttled by CODEX_OBN_VNEOCH_MIN=60 minutes.
- Each refresher service sets its own five CODEX_OBN_POLNYJ/PROIZV/DOM/ZAMOK/SLED paths. The root-only full credential contains refresh; the derived gateway credential has an empty refresh_token and inherits the target ACL/mode.
- Claude switching waits for turn completion within a 600 second total budget, polling every 5 seconds. Codex changes an auth.json symlink atomically; an existing turn continues on its old credentials, the next turn reads the new link.

Stand-only overrides are not production configuration. See the RU settings table for each *_STEND guard and environment family. PATH remains outside that guard. Source code defines the gateway lists and additional thresholds; modifying them requires a new deployment.

## Exit status and verification

| Program | Documented status |
|---|---|
| Claude switch | 0 complete/already selected;1 switch/rollback error;2 input/stand settings;3 too frequent;4 unknown gateway/registry;5 quota guard;6 frequency-marker write refused;7 busy/unmeasured gateways skipped |
| Codex switch | 0 complete/already selected;1 verification failed and rollback attempted;2 refused before change;3 rollback failed |
| ACL helper | 0 verified/done;1 mismatch;2 refused/blind;3 getfacl/setfacl failed |
| ACL watcher | 0 clear;1 mismatch reported/suppressed;2 helper blind;3 alert not delivered |
| Binding tool | 0 output/plan/applied;1 mismatch/write error;2 invalid call/helper refusal with rollback |
| Auth watcher | 0 clear;1 problem;2 blind;3 alert not delivered |
| Catalog watcher | 0 clear or previously reported blindness (read stdout);1 reported change/blindness/recovery;2 refused;3 delivery failed, state unchanged |
| Refresher | 0 refreshed/recovered copy;10 unnecessary;2 refresh failure;3 invalid credential/home/binary;4 already running;5 delivery failure over2/3 |
| Quota reader | 0 free;10 blocked;20 unknown; reason follows TAB |

The status tables describe the intended interfaces; the stdout/stderr reason and unit outcome remain necessary, including for unhandled I/O failures in the source revision. A 0 does not prove a message arrived or that a quota is zero.

Run only isolated stands for pre-deployment checks. Some legacy stands default to live paths and need explicit fixture inputs. The B-N-2023 receiver stand uses a fake transport. Live token refresh, service switching and owner Telegram commands are separate deployment actions. See [RU verification](README.md#проверка) and the [two-package design](../../docs/SUBSCRIPTIONS-AND-LIMITS.md).

## Code contract for module 11

The RPC reader buffers raw bytes; a notification immediately before a reply cannot hide the reply. full/derived/work transfer failure records otkaz and returns 2 after an alert (5 if delivery fails). A confirmed partial update may leave the full file new while the derived file is unconfirmed; verify/restore it. Success 0 and unnecessary 10 remain.

/sss state must be a regular file; a directory, symlink or filesystem error produces a named refusal 2. Missing Codex-home links form an incomplete/split map: thresholds 95%/80%, 3600 seconds and 3/day remain, known subscriptions are monitored, automatic switching is disabled. A named-agent manual switch still requires all registered homes to be valid first.

N-force cannot override a previous target: refusal 2. Binding rejects duplicate GATEWAY_TOKEN_FILE entries, including leading whitespace. Preflight duplicate returns 2 without writes; a late duplicate restores only its own changes without calling the helper, returning 2 after successful rollback or 1 if rollback fails. This does not synchronize intentional concurrent writers.

AGENTS_REGISTRY/KATALOG_KLYUCHEJ/SVYAZKI_SVESTI require SVYAZKI_STEND=1; CKW_RUNTIME/CKW_SHLYUZY/CKW_PAMYAT/AGENT_ALERT_BIN/CKW_REESTR require CKW_STEND=1. Missing key ignores the named overrides; an invalid key returns 2 before actions. A fixture key directory still requires the fixture ACL helper. PATH remains outside these guards.

Invalid journal JSON or a non-string/missing __CURSOR returns 2 before append. Inaccessible Codex switch lock or non-object tokens returns 2; other 0/1/3 codes remain. codex-limits-measure.py now has a Python3 -B shebang and supports direct execution.
