# dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), written
and used in production on our own agent fleet.

The harness is a capable chassis with an unusually clean plugin model — and a few sharp edges where
a failure looks exactly like a success. Everything here was written because the product does not
ship it, and every non-obvious line carries a comment explaining what went wrong before that line
existed.

## What is here: 15 packages, two kinds

**[Platform plugins (8)](#platform-plugins-8)** — independent pieces, each solving one problem the
harness leaves open. Install any of them alone.

**[Memory family `dsh-pamyat` (7)](#memory-family-dsh-pamyat-7)** — a set built and checked
*together*: layers that give an agent memory surviving a compaction and a restart. Install the whole
set by its name, `npm i dsh-pamyat`.

Two kinds, not one list: a platform plugin is useful by itself, a memory layer is useful with its
siblings. Counting them as one number hides that difference.

## Platform plugins (8)

| Package | What it does |
|---|---|
| [`telegram-multiagent`](packages/telegram-multiagent) | Talk to your agent from Telegram. One shared module, per-agent config. Text and voice, whitelist, per-chat sessions, optional file-based agent-to-agent channel. |
| [`subscription-gateway`](packages/subscription-gateway) | Run the harness on a vendor **subscription** instead of per-token billing. One systemd service per agent: the token lives in exactly one place, the model loop runs through the vendor's own SDK, answers stream back. Not a plugin: a service. |
| [`tool-bridge`](packages/tool-bridge) | Make harness plugin tools reachable from a model driven by an outside engine rather than the harness's own loop. The harness ships an MCP client but no server — this is the server. |
| [`schedule-guard`](packages/schedule-guard) | Keep a self-scheduling agent from running away: caps consecutive and per-day self-wakeups, enforces a minimum repeat interval, deletes runaway repeats, and tells the owner why. Behavioural, not a security boundary — and it says so out loud. |
| [`voice-stack`](packages/voice-stack) | Local speech recognition on the machine's GPU — the agent hears voice messages without sending audio to anyone's cloud. Not a plugin: a service with a one-line command contract. |
| [`omega-memory`](packages/omega-memory) | Long-term memory for agents, on your machine: service account model, systemd unit, and the wiring that actually reaches the agent. |
| [`oom-watch`](packages/oom-watch) | Learn when the memory limit killed your agent. Reads the kernel journal, not the cgroup counter that resets on restart. Not a plugin: a systemd timer. |
| [`a2a-bus`](packages/a2a-bus) | Let agents on one machine write to each other directly, without giving up isolation. Each agent owns a mailbox nobody else can list; a postman running as root transfers ownership of the letter, so the sender loses access once it is delivered. Not a plugin: a spool, a service and a timer. |

## Memory family `dsh-pamyat` (7)

The harness compacts a long conversation by summarising it — and the summary is gone the moment
the process restarts. These packages give an agent memory that survives that, split into layers
that each do one thing and say out loud what they cannot do.

| Package | What it does |
|---|---|
| [`dsh-pamyat`](packages/dsh-pamyat) | The **name for the set**: no code, just the declaration of which six packages were built and checked *together*, in exactly which versions, and by what. Versions are exact, ranges are refused — a name that resolves to different sets for different people is worse than no name. |
| [`dsh-pamyat-core`](packages/dsh-pamyat-core) | Storage on `node:sqlite`, a journal of write decisions, and the policy for which classes need confirmation. A node with nobody to confirm says so out loud instead of silently writing anyway. |
| [`dsh-pamyat-secretary`](packages/dsh-pamyat-secretary) | Takes the summary *before* compaction overwrites the history. A refused write is shouted, not swallowed. |
| [`dsh-pamyat-restore`](packages/dsh-pamyat-restore) | The reading side: puts the summary back after a compaction, and a briefing at start. Trust and age are read by an explicit branch *before* any comparison — a missing number never becomes a zero. |
| [`dsh-pamyat-byudzhet`](packages/dsh-pamyat-byudzhet) | An incoming budget: how much of the past to lift back into context. Its absence is announced — "budget not applied" must not be indistinguishable from "applied and dropped nothing". |
| [`dsh-pamyat-nudzh`](packages/dsh-pamyat-nudzh) | Spend accounting: is it time to compact yet. Counts **occupancy of the window** (the last call's input), not the sum over all calls — the sum grows without bound and a compaction never reduces it. |
| [`dsh-pamyat-omega`](packages/dsh-pamyat-omega) | An optional long-term layer over external storage via MCP. Without it nothing breaks; you only lose the ability to carry knowledge off the node. |

Install the set by its name — `npm i dsh-pamyat` pulls the six in their exact versions. Each layer
also stands alone. Every package carries a stand suite; a stand that cannot check anything exits
**2** ("nothing to check"), never **0**, because "no checks ran" must not look like "checks passed".

`subscription-gateway`, `tool-bridge` and `schedule-guard` are one story, and each is useful on
its own. Run the harness on a subscription (`subscription-gateway`); let a model driven that way
still reach the harness's own tools (`tool-bridge`); and if you then let the agent schedule its
own wake-ups, put a ceiling on it (`schedule-guard`). Design notes for all three, traps included,
are in [`docs/DESIGN.md`](docs/DESIGN.md).

## Documentation

- [`docs/MEMORY-AND-A2A.md`](docs/MEMORY-AND-A2A.md) — the memory pipeline `dsh-pamyat` and
  agent-to-agent mail (A2A) as one system: seams, services, settings, refusals, the input filter,
  release and acceptance order, stands. Russian original: [`docs/MEMORY-AND-A2A.ru.md`](docs/MEMORY-AND-A2A.ru.md).
- [`docs/DESIGN.md`](docs/DESIGN.md) — design notes for the tool bridge, self-waking and the
  subscription route.

More will land here as we build them. One repository, several packages — a separate repo per plugin
is not worth the overhead.

## Install

Each package is independent:

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

MIT.
