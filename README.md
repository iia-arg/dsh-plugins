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
| [`telegram-channel`](packages/telegram-channel) | Talk to your agent from Telegram. One shared module, per-agent config. Text and voice, whitelist, per-chat sessions, optional file-based agent-to-agent channel. |
| [`voice-stack`](packages/voice-stack) | Local speech recognition on the machine's GPU — the agent hears voice messages without sending audio to anyone's cloud. Not a plugin: a service with a one-line command contract. |

More will land here as we build them. One repository, several packages — a separate repo per plugin
is not worth the overhead.

## Install

Each package is independent:

```bash
# inside your profile directory ($DSH_HOME/profiles/<name>)
pnpm add dsh-telegram-channel
```

Then add the plugin row to your **agent preset** — each package README says exactly where and why.

## Why publish this

Two reasons. The plugin ecosystem around this harness is thin, and a working messenger channel is
the piece most people need first. And the comments are worth more than the code: they name the
traps that produce green checkmarks and no working system.

If something here saves you an evening, that is the point.

MIT.
