# dsh-plugins

Community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), written
and used in production on our own agent fleet.

The harness is a capable chassis with an unusually clean plugin model — and a few sharp edges where
a failure looks exactly like a success. Everything here was written because the product does not
ship it, and every non-obvious line carries a comment explaining what went wrong before that line
existed.

## Plugins

| Package | What it does |
|---|---|
| [`telegram-multiagent`](packages/telegram-multiagent) | Talk to your agent from Telegram. One shared module, per-agent config. Text and voice, whitelist, per-chat sessions, optional file-based agent-to-agent channel. |
| [`subscription-gateway`](packages/subscription-gateway) | Run the harness on a vendor **subscription** instead of per-token billing. One systemd service per agent: the token lives in exactly one place, the model loop runs through the vendor's own SDK, answers stream back. Not a plugin: a service. |
| [`tool-bridge`](packages/tool-bridge) | Make harness plugin tools reachable from a model driven by an outside engine rather than the harness's own loop. The harness ships an MCP client but no server — this is the server. |
| [`schedule-guard`](packages/schedule-guard) | Keep a self-scheduling agent from running away: caps consecutive and per-day self-wakeups, enforces a minimum repeat interval, deletes runaway repeats, and tells the owner why. Behavioural, not a security boundary — and it says so out loud. |
| [`voice-stack`](packages/voice-stack) | Local speech recognition on the machine's GPU — the agent hears voice messages without sending audio to anyone's cloud. Not a plugin: a service with a one-line command contract. |
| [`omega-memory`](packages/omega-memory) | Long-term memory for agents, on your machine: service account model, systemd unit, and the wiring that actually reaches the agent. |
| [`oom-watch`](packages/oom-watch) | Learn when the memory limit killed your agent. Reads the kernel journal, not the cgroup counter that resets on restart. Not a plugin: a systemd timer. |

`subscription-gateway`, `tool-bridge` and `schedule-guard` are one story, and each is useful on
its own. Run the harness on a subscription (`subscription-gateway`); let a model driven that way
still reach the harness's own tools (`tool-bridge`); and if you then let the agent schedule its
own wake-ups, put a ceiling on it (`schedule-guard`). Design notes for all three, traps included,
are in [`docs/DESIGN.md`](docs/DESIGN.md).

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
