# dsh-telegram-multiagent

A Telegram channel for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): message
your agent from a phone, get answers back, keep one conversation per chat.

The harness ships no messenger channel — there is no channel abstraction in the product at all. This
plugin builds one out of the two ends the harness does give you:

```
in:   ctx.agents.create/resume(...) → agent.send(message)
out:  ctx.on('session/event', ...)  → send to Telegram
```

One chat = one session = one agent. Sessions live independently, the way the core intends.

## Install

```bash
# inside your profile directory ($DSH_HOME/profiles/<name>)
pnpm add dsh-telegram-multiagent
```

Then add one row to your **agent preset** (`agent.cordis.yml`), not to the profile patch layer —
see "Where to put the row" below:

```yaml
- insert:
    - name: dsh-telegram-multiagent
      config:
        agentName: my-agent            # log label only
        tokenFile: /etc/dsh/bot.token  # preferred: a file readable by this agent
        appDir: /opt/my-agent/app      # where THIS agent's harness is installed
        workspace: /opt/my-agent/work
        allowedUsers: [123456789]      # empty = everyone; you do not want that
```

## Configuration

| Field | Required | What it does |
|---|---|---|
| `tokenFile` | one of these | Path to a file holding the bot token. Preferred: the secret belongs to the machine, the config only carries a path. |
| `token` / `tokenEnv` | one of these | Literal token, or the name of an env var. For debugging. |
| `appDir` | yes | Directory where this agent's harness is installed. Platform packages are resolved from **here**, not from the plugin's own location — see "Why appDir" below. |
| `agentName` | no | Label in log lines. Useful when several bots run on one machine. |
| `allowedUsers` | no | Numeric user ids allowed to talk to the agent. **Empty means everyone** — an agent usually has real access to the machine, so set it. |
| `workspace` | no | Working directory handed to the agent session. |
| `preset` | no | Agent preset to mount for sessions created by this channel. |
| `provider` / `model` | no | Fallback if the deployment has no default model service. |
| `a2aDir` | no | Directory for a file-based agent-to-agent channel (`in/`, `out/`). Omit and no such channel exists. |
| `a2aSession` | no | Session id used for that channel. Default `a2a`. |
| `transcribeCommand` | no | External command for voice messages: `<cmd> <audio-file> auto` → transcript on stdout. Omit and voice is politely refused. |

## Four things that cost us a day

Each of these fails **while looking like success**. They are commented inline in the source; this is
the short version.

**1. Polling belongs to the bot, not to the mount.** The harness mounts a composition more than once
per process and unmounts the extra one. With a single shared `running` flag you get two pollers
fighting over one bot and Telegram cuts both with `Conflict`. With a polite "new mount asks the old
one to step aside" you get *no* poller at all — because the new mount is the one that gets unmounted.
The fix is reference counting: the first mount starts polling, the last unmount stops it.

**2. Delete the incoming message only after it reached the agent.** Reading a file and unlinking it
immediately loses the message whenever the handoff fails — and the handoff *will* fail, see (3).
From the outside that is indistinguishable from "the bot ignored me".

**3. The agent factory appears later than the channel.** The first message can arrive before the
harness has registered it, and you get `no agent factory registered`. Wait for the platform instead
of assuming it is ready.

**4. A session already on disk must be resumed, not created.** Calling `create()` with an existing
session id makes the persistence layer abort *every* turn with an id-collision error. Externally:
"accepted the message and went quiet" — the turn honestly starts and dies in milliseconds. It works
until the first restart, which is what makes it nasty. Use `resume()` when the session exists.

## Where to put the row

In the `web` profile the common-plane tools are **disabled on purpose**; the toolset comes from the
agent preset. A plugin row placed in the profile patch layer composes without a single error, is
listed as mounted — and never reaches the agent. Put the row in the agent preset.

The preset is also picked up when a **session is created**: editing the file does not affect a
running session. Restart the platform, or change the default preset in settings (hot-reloaded, takes
effect for the next created session).

## Why `appDir`

The plugin resolves `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-agent` from the directory you pass
in `appDir`, not from its own location. That is deliberate: the module is meant to live once on a
machine and serve several agents, each with its own harness installation. Hard-linking it to one
agent's `node_modules` would mean that removing *that* agent breaks the channel for everybody else.

## Security notes

- `allowedUsers` empty means anyone who finds the bot talks to an agent that usually has shell access
  to the machine. Set it.
- A rejected stranger is logged and reported to the owner. A silent refusal hides a security event.
- The token is read from a file at startup; the config carries a path, not a secret.

## Status

Written for our own fleet and running in production on several agents. The harness is young
(`0.1.0-rc`) and its plugin API moves; expect to adapt. Inline comments are currently in Russian —
they carry the reasoning behind each non-obvious line, and a translation is welcome.

MIT.

## 1.1.0 — кто спросил, кому отвечено, и кто это видит

Три возможности, выросшие из одной задачи: с агентом работают ДВОЕ — владелец из личного чата и
координатор по служебному каналу, — и они должны делить одну память, не путаясь, кто есть кто.

**Пометка отправителя, которую нельзя подделать.** Каждое входящее помечается каналом, из которого
пришло. 🔴 Ключевое: перед тем как поставить свою пометку, модуль ВЫРЕЗАЕТ из текста всё похожее на
неё. Без этого пометка была бы подписью в тексте, а подпись подделывает любой, кто умеет печатать.
Проверено нападением: сообщение из личного чата с готовой строкой «служебный канал» приходит
агенту помеченным как личный чат.

**Общая память двух собеседников.** `mergeChatIntoA2A: <идентификатор чата>` — сообщения этого чата
идут не в свою сессию, а в служебную. Один агент, одна история разговора, два различаемых лица.
Побочно лечит столкновение имён инструментов: второй экземпляр набора не монтируется вовсе.

**Адресат ответа привязан к ХОДУ, а не к последнему сообщению.** Ответ помечается `[ответ: кто]` с
цитатой вопроса. 🔴 Почему не «отвечаем последнему спросившему»: если второй вопрос пришёл, пока
первый считается, ответы разъезжаются не тем — причём с правильными на вид пометками.

**Режим доставки — в файле ВНЕ кода.** Путь берётся из `settingsFile` (по умолчанию — файл токена с
расширением `.json`). Читается на лету по времени изменения: правка действует со следующего
сообщения, перезапуск не нужен. Файл переживает обновление модуля.

```json
{ "deliveryMode": "personal" }
```
| режим | кто что видит |
|---|---|
| `personal` (умолчание) | каждый видит только свои вопросы и ответы |
| `broadcast` | оба видят весь обмен, чужое помечено «адресовано не вам» |
| `owner-all` | владелец видит всё, координатор только своё |

🔴 Умолчание выбрано самым тихим намеренно: испорченный или недоступный файл настроек НЕ должен
внезапно раскрыть переписку в чужой канал. Ошибка чтения = `personal`, и о ней говорится в журнал.

Копируются и вопросы, и ответы: половина разговора без второй половины нечитаема.
