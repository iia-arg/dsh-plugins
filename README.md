Russian version: [README.ru.md](README.ru.md) · English below

# dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), written
and used in production on our own agent fleet.

The harness is a capable chassis with an unusually clean plugin model — and a few sharp edges where
a failure looks exactly like a success. Everything here was written because the product does not
ship it, and every non-obvious line carries a comment explaining what went wrong before that line
existed.

## What is here: 41 packages

- **Autopilot** (1) — project work from a plan to a verified result.
- **А — Memory family `dsh-pamyat`** (12)
- **Б — Agent plugins: subscription route, tools, channels** (7)
- **В — Host watchers and tools** (6)
- **Г — Own services — not agent plugins** (2)
- **Д — Host services of sadik — source only** (13)

Group А is the *Memory family* section; groups Б–Д are subsections of *Platform plugins*.

## Autopilot (1)

Autopilot coordinates a project through requirements, tasks, implementation, review and completion. It is a separate system built from a pinned skill, a Unix-account team, a mail service and dashboards; installing an npm plugin alone does not deploy it.

| Package | Version in this tree | Delivery | What it does |
|---|---|---|---|
| [`dsh-autopilot`](packages/dsh-autopilot) | 0.1.16 | Install from this repository | Project workflow, pinned runtimes, team mail, public dashboard and approximate end-of-turn usage statistics. [Installation and dependencies](packages/dsh-autopilot/README.en.md). |

Start with the package guide: it lists the required components and explains the host configuration that must be supplied. The memory family is a separate set; the guide identifies server-profile and model-route dependencies. Current versions of all packages: [package catalogue](docs/PACKAGES.md).

## Memory family `dsh-pamyat` (12)

**Group А.** Memory layers built and checked together; `dsh-pamyat-vyvoz` and `-obsluzhivanie` sit outside the set as separate packages.

| Package | Version in this tree | npm | What it does |
|---|---|---|
| [`dsh-pamyat`](packages/dsh-pamyat) | 3.1.11 | `dsh-pamyat` | The **name for the set**: no code, just the declaration of which nine packages were built and checked *together*, in exactly which versions, and by what. Versions are exact, ranges are refused — a name that resolves to different sets for different people is worse than no name. |
| [`dsh-pamyat-core`](packages/dsh-pamyat-core) | 3.1.4 | `dsh-pamyat-core` | Storage on `node:sqlite`, a journal of write decisions, and the policy for which classes need confirmation. A node with nobody to confirm says so out loud instead of silently writing anyway. |
| [`dsh-pamyat-omega`](packages/dsh-pamyat-omega) | 3.1.4 | `dsh-pamyat-omega` | An optional long-term layer over external storage via MCP. Without it nothing breaks; you only lose the ability to carry knowledge off the node. |
| [`dsh-pamyat-secretary`](packages/dsh-pamyat-secretary) | 3.1.4 | `dsh-pamyat-secretary` | Takes the summary *before* compaction overwrites the history. A refused write is shouted, not swallowed. |
| [`dsh-pamyat-restore`](packages/dsh-pamyat-restore) | 3.1.4 | `dsh-pamyat-restore` | The reading side: puts the summary back after a compaction, and a briefing at start. Trust and age are read by an explicit branch *before* any comparison — a missing number never becomes a zero. |
| [`dsh-pamyat-byudzhet`](packages/dsh-pamyat-byudzhet) | 3.1.4 | `dsh-pamyat-byudzhet` | An incoming budget: how much of the past to lift back into context. Its absence is announced — "budget not applied" must not be indistinguishable from "applied and dropped nothing". |
| [`dsh-pamyat-nudzh`](packages/dsh-pamyat-nudzh) | 3.1.4 | `dsh-pamyat-nudzh` | Spend accounting: is it time to compact yet. Counts **occupancy of the window** (the last call's input), not the sum over all calls — the sum grows without bound and a compaction never reduces it. |
| [`dsh-pamyat-storozha`](packages/dsh-pamyat-storozha) | 3.1.8 | `dsh-pamyat-storozha` | Memory watchers inside the agent: compaction notices, fill stages, session coverage; memory maintenance programs. |
| [`dsh-pamyat-kompakt`](packages/dsh-pamyat-kompakt) | 3.1.2 | `dsh-pamyat-kompakt` | Shared compaction library: window occupancy, the agent's threshold, a summary by our own model, atomic rewrite of the session journal. |
| [`dsh-pamyat-kompakt-dsh`](packages/dsh-pamyat-kompakt-dsh) | 3.1.4 | `dsh-pamyat-kompakt-dsh` | Summary engine inside the platform's native compaction: the summary is written by the `dsh-pamyat-kompakt` model, the native one on refusal. |
| [`dsh-pamyat-vyvoz`](packages/dsh-pamyat-vyvoz) | 3.1.4 | `dsh-pamyat-vyvoz` | Memory export and import: moving meaning between databases. Not part of the `dsh-pamyat` set. |
| [`dsh-pamyat-obsluzhivanie`](packages/dsh-pamyat-obsluzhivanie) | 3.1.5 | `dsh-pamyat-obsluzhivanie` | Nightly agent memory maintenance: lesson transfer, cleanup, OMEGA pair judge, consistency check; the result as one alert line. |

## Platform plugins (28)

Groups Б–Д.

### Б — Agent plugins: subscription route, tools, channels (7)

Each is useful on its own and installs alone.

| Package | Version in this tree | npm | What it does |
|---|---|---|
| [`dsh-subscription-gateway`](packages/dsh-subscription-gateway) | 3.1.10 | `dsh-subscription-gateway` | Run the harness on a vendor **subscription** instead of per-token billing. One systemd service per agent: the token lives in exactly one place, the model loop runs through the vendor's own SDK, answers stream back. Not a plugin: a service. |
| [`dsh-subscription-adapter`](packages/dsh-subscription-adapter) | 3.1.3 | `dsh-subscription-adapter` | The DSH side of the subscription route: an adapter that lets the harness talk to a subscription gateway. |
| [`dsh-tool-bridge`](packages/dsh-tool-bridge) | 3.1.9 | `dsh-tool-bridge` | Make harness plugin tools reachable from a model driven by an outside engine rather than the harness's own loop. The harness ships an MCP client but no server — this is the server. |
| [`dsh-telegram-multiagent`](packages/dsh-telegram-multiagent) | 3.1.15 | `dsh-telegram-multiagent` | Talk to your agent from Telegram. One shared module, per-agent config. Text and voice, whitelist, per-chat sessions, optional file-based agent-to-agent channel. |
| [`dsh-schedule-guard`](packages/dsh-schedule-guard) | 3.1.3 | `dsh-schedule-guard` | Keep a self-scheduling agent from running away: caps consecutive and per-day self-wakeups, enforces a minimum repeat interval, deletes runaway repeats, and tells the owner why. Behavioural, not a security boundary — and it says so out loud. |
| [`a2a-bus`](packages/a2a-bus) | 3.1.7 | source only | Let agents on one machine write to each other directly, without giving up isolation. Each agent owns a mailbox nobody else can list; a postman running as root transfers ownership of the letter, so the sender loses access once it is delivered. Not a plugin: a spool, a service and a timer. |
| [`voice-stack`](packages/voice-stack) | 3.1.1 | source only | Local speech recognition on the machine's GPU — the agent hears voice messages without sending audio to anyone's cloud. Not a plugin: a service with a one-line command contract. |

`dsh-subscription-gateway`, `dsh-tool-bridge` and `dsh-schedule-guard` are one story, and each is useful on
its own. Run the harness on a subscription (`dsh-subscription-gateway`); let a model driven that way
still reach the harness's own tools (`dsh-tool-bridge`); and if you then let the agent schedule its
own wake-ups, put a ceiling on it (`dsh-schedule-guard`). Design notes for all three, traps included,
are in [`docs/DESIGN.md`](docs/DESIGN.md).

### В — Host watchers and tools (6)

Programs for the host the agents live on and for the agent's own shell.

| Package | Version in this tree | npm | What it does |
|---|---|---|
| [`dsh-pribory`](packages/dsh-pribory) | 3.1.4 | `dsh-pribory` | Shell tools against an agent's self-deception: an exit code without a pipeline, stopping by unit, `PATH` namesakes, who started a service, atomic placement with a grammar check. |
| [`dsh-reestr`](packages/dsh-reestr) | 3.1.10 | `dsh-reestr` | A registry of host interventions: what was installed on top of the platform and where, intent-versus-disk checks, registry edits with a backup, and watchers for uncommitted changes, package seams and lock files; installed from the tree — tree = production, there is no portable edition. |
| [`dsh-storozha-mashiny`](packages/dsh-storozha-mashiny) | 3.1.6 | `dsh-storozha-mashiny` | Watchdogs for a host running several AI agents: units and timers, kernel and DKMS, updates, IPv6, package copies, temp-dir leftovers, context overflow; alerts through a single command. |
| [`dsh-trevogi`](packages/dsh-trevogi) | 3.1.10 | `dsh-trevogi` | A shared alert sender and journal watchers: one alert command for all watchdogs; a probe carries a mark and does not wake the owner with a false alarm. |
| [`oom-watch`](packages/oom-watch) | 3.1.4 | source only | Learn when the memory limit killed your agent. Reads the kernel journal, not the cgroup counter that resets on restart. Not a plugin: a systemd timer. |
| [`omega-memory`](packages/omega-memory) | 3.1.1 | source only | Long-term memory for agents, on your machine: service account model, systemd unit, and the wiring that actually reaches the agent. |

### Г — Own services — not agent plugins (2)

Standalone services with a `package.json`: they install as npm packages but run as a host service, not as a plugin in an agent's profile.

| Package | Version in this tree | npm | What it does |
|---|---|---|
| [`dsh-socseti`](packages/dsh-socseti) | 3.1.10 | `dsh-socseti` | Social media app: Telegram, drafts and approvals (the `socseti` service). Not a plugin: a service. |
| [`dsh-vypusk-watch`](packages/dsh-vypusk-watch) | 3.1.8 | `dsh-vypusk-watch` | Release-window watcher: checks installed packages against the git tag of their version and alerts when production drifts from the release. |

### Д — Host services of sadik — source only (13)

No `package.json`: files are laid out on the host by its registry entry. Published as source, as an example of the setup, not as an installable package.

| Package | Version in this tree | npm | What it does |
|---|---|---|
| [`dsh-compact-outcomes`](packages/dsh-compact-outcomes) | 3.1.3 | source only | Compaction-outcome observer for the Codex coding agents: alerts when tokens dropped without a DSH compaction event. Not a plugin: a sensor inside those agents' platform plus a systemd timer. |
| [`dsh-gateway-ingress`](packages/dsh-gateway-ingress) | 3.1.2 | source only | Gateway ingress: at boot builds an nft table from the agent registry that lets only root, the agent's account and allowed callers reach each gateway port. |
| [`dsh-gosti`](packages/dsh-gosti) | 3.1.3 | source only | Guest circuit: website chat adapter, guest session expiry, staff list into the PII-mask allowlist, guest sandbox, guest OMEGA gateway. |
| [`dsh-kopiya-mashiny`](packages/dsh-kopiya-mashiny) | 3.1.8 | source only | Nightly host backup and its acceptance by action; coverage, size and space watchers; OMEGA database backup. |
| [`dsh-limity`](packages/dsh-limity) | 3.1.8 | source only | Subscription limits service: Claude, Codex and DeepSeek measurements in one table, `limity.json` output, threshold alerts, automatic switching of shared gateways. [EN](packages/dsh-limity/README.en.md) |
| [`dsh-montazh`](packages/dsh-montazh) | 3.1.46 | source only | Deployment into production with backup and verification, a local release-tag gate that leaves a gate trace (a root journal outside the tree), transfer into the tree, subject checksum, deployment watchers and a watchdog for tags placed past the gate. |
| [`dsh-obhod-stendov`](packages/dsh-obhod-stendov) | 3.1.120 | source only | Nightly and weekly run of the host's stands in the production layout: runner, lists, exceptions, and the stands themselves. |
| [`dsh-okno`](packages/dsh-okno) | 3.1.6 | source only | Manual root tools for upgrade windows: admission, SDK-layer inventory, session-journal repacking, OMEGA service key. |
| [`dsh-pochta`](packages/dsh-pochta) | 3.1.6 | source only | Coordinator letters and slots: `tell-komu`, receipt and stuck-letter watchers, mail stop. |
| [`dsh-podpiski`](packages/dsh-podpiski) | 3.1.6 | source only | Claude and Codex subscriptions: switchers, token access, Codex watchers and refresher, the `/switch` receiver. [EN](packages/dsh-podpiski/README.en.md) |
| [`dsh-podyom`](packages/dsh-podyom) | 3.1.4 | source only | Agent service bring-up (`podyom-uzla`) and the checks before and after it. |
| [`dsh-set-sadik`](packages/dsh-set-sadik) | 3.1.5 | source only | Host networking: split routing, reply routing, VPN failover, killswitch, network check. |
| [`dsh-storozha-sadik`](packages/dsh-storozha-sadik) | 3.1.28 | source only | Host watchers outside the shared set: `sadik-watch`, alert channels, compaction watcher, permission-group watcher, outside observation, stand-run reader. |

## Documentation

- [`docs/MEMORY-AND-A2A.md`](docs/MEMORY-AND-A2A.md) — the memory pipeline `dsh-pamyat` and
  agent-to-agent mail (A2A) as one system: seams, services, settings, refusals, the input filter,
  release and acceptance order, stands. Russian original: [`docs/MEMORY-AND-A2A.ru.md`](docs/MEMORY-AND-A2A.ru.md).
- [`docs/DESIGN.md`](docs/DESIGN.md) — design notes for the tool bridge, self-waking and the
  subscription route.
- [`docs/SAMOPROBUZHDENIE.md`](docs/SAMOPROBUZHDENIE.md) (Russian) — how agent self-wakeup is built here: what the
  platform already has, what we added, and what changes when several agents share one machine.
- [`docs/SVERSHCHIK-PUBLIKACIJ.md`](docs/SVERSHCHIK-PUBLIKACIJ.md) (Russian) — the publication reconciler: live system ↔
  repository ↔ registry.
- Two acceptance-verdict records (`docs/OT-*-verdikty-0607-0709.md`, `docs/OT-*-verdikty-0909-1409.md`, Russian) — the
  auditor's verdicts of 06.09–07.09 and 09.09–14.09.2026, kept as history; whether they are published is the owner's decision.
- [`DOGOVOR-OTNOSHENIJ-PAMYATI.md`](DOGOVOR-OTNOSHENIJ-PAMYATI.md) (Russian) — the contract for relations between memory
  records (`otnoshenie` / `otnositsya_k` fields of `dsh-pamyat-core`).
- [`SUMMY-PAKETOV-20260911.md`](SUMMY-PAKETOV-20260911.md) (Russian) — accepted package checksums of 11.09.2026.
- `tools/` — repository checks and canaries: [`check-readme-index.sh`](tools/check-readme-index.sh) (every package
  directory is named in this README and every link leads to one), [`check-readme-count.sh`](tools/check-readme-count.sh)
  (the counts in the headings match the tables and `packages/`); canaries — in `packages/dsh-obhod-stendov/dorabotki/` (B-N-1964, B-N-1995): [`kanarejka-restarta`](packages/dsh-obhod-stendov/dorabotki/kanarejka-restarta.README.md)
  (will the agent come back after a restart — checked before the restart) and [`kanarejka-shlyuza`](packages/dsh-obhod-stendov/dorabotki/kanarejka-shlyuza.README.md)
  (the same for a gateway).

More will land here as we build them. One repository, several packages — a separate repo per plugin
is not worth the overhead.

## Checks

Every package has stands. A stand with nothing to check exits with code **2** ("blind"), not **0**: "the checks did not run" must not look like "the checks passed". Some stands of the host-service packages touch the live machine — the package README says so in its section on checks.

## Install

For an individual agent plugin, follow its package guide. Autopilot has a separate [installation procedure](packages/dsh-autopilot/README.en.md). A plugin installation example:

```bash
# inside your profile directory ($DSH_HOME/profiles/<name>)
pnpm add dsh-telegram-multiagent
```

Then add the plugin row to your **agent preset** — each package README says exactly where and why.

## Why publish this

Two reasons. The plugin ecosystem around this harness is thin, and a working messenger channel is
the piece most people need first. And the comments are worth more than the code: they name the
traps that produce green checkmarks and no working system.

If something here saves you an evening, that is the point.

MIT: the [`LICENSE`](LICENSE) file at the root of the tree; packages that carry their own `LICENSE` have the same text.
