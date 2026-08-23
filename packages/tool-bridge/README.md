# dsh-tool-bridge — platform tools on a subscription route

A plugin for DeepSeek Harness. It makes the tools of platform plugins visible to
a model that is driven not by the platform's own loop but by a third-party
vendor's engine.

> The package name and the MCP server name are working names. They are changed
> in two places: the `name` field in `package.json` and the `serverName` setting.
> The log-line prefix is derived from the package name, not from the agent name.

---

## What it gives you

One thing: **platform tools reach the model**. Goals, background jobs, schedule —
everything registered by platform plugins — become tools the model can see and
call, with the same names, descriptions and schemas as on the native route.

---

## When you do NOT need this

**If your agent runs on the platform's native loop, you do not need the bridge at
all.** There the tools reach the model by themselves, that is the supported path,
and an extra layer will only add places for things to fail.

The bridge is needed in exactly one case: the loop is driven by a **foreign
engine**, its tool registry is its own, and it knows nothing about platform
plugins.

A one-minute test to recognise your case: ask the agent to call any platform tool
and look in the platform log for `tool/*` events. Zero events while the model
still answers — that is your case. Events present — you do not need the bridge.

**Three more cases where the bridge will not help:**

- the tool you are looking for is not mounted in the platform at all. The bridge
  delivers what is registered; it does not raise what is absent;
- you need a call time limit, a queue, or cancellation by the turn signal — see
  "What does not work";
- you want to constrain an agent that has `sudo`. The bridge is not a guard, see
  the same section.

---

## How it is built

Three parts in three processes:

| part | where it lives | what it does |
|---|---|---|
| **this plugin** | platform process | owns the loopback entry point, executes calls |
| provider adapter | platform process | tells the gateway the live agent's identity and the entry-point address |
| subscription gateway | its own process | assembles an MCP server and hands it to the engine |

The gateway knows nothing about goals: it receives the tool **description** from
here and proxies calls back. The next agent, with a different tool set, connects
without editing the gateway.

**The door uses a one-time ticket, not a shared secret.** The ticket is born in
the plugin for a pair (identity, turn), travels to the gateway in the adapter's
response body and dies on `turn/end` of its own turn. 🔴 Identity is **never sent**
over the gateway→bridge wire: the bridge looks it up in its own table by ticket.
The caller has nothing to assert somebody else's identity with.

---

## Installation

### 1. Install the package and mount it in the platform

Two ways, and they differ only in who writes the row.

**One command** (needs `pnpm` on PATH — the platform forwards to it):

```bash
dsh plugin --profile <profile> add dsh-tool-bridge
```

The package manifest declares `dsh.bundle.patch`, so the installed dependency
joins the profile's layer stack and brings `cordis.patch.yml` with it — the whole
settings block, comments included.

**By hand**, if you would rather see the row in your own layer:

```bash
npm install dsh-tool-bridge
```

then copy the `insert:` block out of the package's `cordis.patch.yml` into your
profile's own patch file, `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. Values
in your own layer are applied after the bundle layers, so this is also how you
override a single field without editing anything inside `node_modules`.

**Sign of success, before the platform is even started:**

```bash
dsh --profile <profile> --dump-config | grep dsh-tool-bridge
```

The row must be in the composed tree. Absent means the layer did not join, and no
later step will help.

**Sign of success after start-up:** `[tool-bridge]` lines appear in the platform
log — the full reference set is below.

**The second sign, the one people skip:** the startup line prints
`server name: "changeme"` if you never edited it. A placeholder or generic name is
not a cosmetic problem — on a collision with another MCP server it is ours that
gets silently shadowed.

#### Why the composed block spells out values that equal the code defaults

Because the schema does not enforce them, and that is easy to misread. The
config fields here are declared **without** a default value, which looks like
"the platform will refuse to start until I supply them". It will not: the
platform's config validator drops a missing key silently rather than raising
(checked against its own schema library — a required string simply disappears
from the resolved config). A mount with no config block therefore starts, works,
and runs on numbers nobody chose.

So the protection is not the schema — it is the written-out block plus the
source mark in the startup line: every number is printed as `(configured)` or
`(default)`. That pair is what tells "my configuration arrived" from "the field
was lost while editing the plugin set". Leave a field out and the mechanism
keeps working, just not on your numbers, and it will not say so.

The three copies of that list — the schema, the block in this README and
`cordis.patch.yml` — drift apart silently for the same reason, so
`test-startup-lines.mjs` compares all three and fails if any field is missing
from one of them or documented without existing.

### 2. Regenerate the tool descriptions for your own platform installation

```bash
node tools/extract-parity.mjs   <platform installation root> > src/parity.json
node tools/extract-schedule.mjs <platform installation root> > src/schedule.json
```

🔴 These files are **not written by hand**. They are generated by executing the
platform's own packages: a stand-in context collects whatever those packages
register on the native route. That is what makes "character for character"
provable here rather than merely asserted.

**Sign of success:** both files are non-empty, and the tool count in the startup
line matches the number of entries in them.

🔴 **Run this after every platform upgrade.** The platform will change a
description or a schema at home — your file will stay as it was and diverge
SILENTLY: nothing crashes, the model simply receives a description that no longer
exists.

### 3. Check the duplicated constant

```bash
tools/check-blocked-threshold.sh <bridge file> <platform installation root>
```

**Sign of success:** `blocked threshold: matches (N), dsh-tool-goal <version>`,
exit code 0. Exit code 1 means a divergence, or blindness of the script itself,
and it will say which. This is the second item on the "run after a platform
upgrade" list.

### 4. Confirm that the model sees the tools

Ask the model for its tool list. Yours must be visible with the protocol prefix:
`mcp__<serverName>__<tool name>`.

**The sign of success you cannot fake:** ask it to call a tool and find the line
`[tool-bridge] call <name> for <session>: success` in the log. The model's answer
is not a sign — it can describe a call that never happened.

---

## Settings

| field | what it sets | default |
|---|---|---|
| `port` | loopback entry-point port | 0 (a free one) |
| `serverName` | the MCP server name at the model | **no default** |
| `createLimit` / `createWindowMinutes` | goal-creation ceiling in a sliding window | 3 / 60 |
| `blockedAfterRounds` | threshold for the `blocked` action | 3 |
| `ticketTtlMinutes` | upper ticket lifetime | 360 |
| `heartbeatMinIntervalSeconds` | minimum interval allowed for a recurring reminder | 1800 |
| `heartbeatMaxConsecutive` | autonomous wake-ups in a row without a word from a human | 6 |
| `heartbeatMaxPerDay` | wake-ups per day **per session** | 48 |
| `heartbeatDayZone` | the zone the day is counted in | Europe/Moscow |
| `heartbeatHumanKinds` | source kinds that count as a word from a human | `['user']` |
| `heartbeatNoticeDir` | directory for the stop notice | empty = log only |

### Why some fields deliberately have no default

For every number the startup line prints where it came from: `(configured)` or
`(default)`. That is the only way to tell "the configuration arrived" from "the
field was lost while editing the plugin set": in the second case the mechanism
works, but not on your numbers, and it says nothing about it.

### 🔴 `heartbeatHumanKinds` — the field that is easy to overlook

The kind `user` exists everywhere. Any other source kind is introduced by
whichever module receives messages on **your** build: a service channel between
agents, a web form, anything.

If you do not list your kind, messages through it will not count as a word from a
human, and the streak of autonomous wake-ups will not break when somebody talks to
the agent. Verified on the bench against this code: one and the same log yields a
streak of **1** with the correct list and **3** with an incomplete one. The error
is silent: superfluous wake-ups are indistinguishable from honest ones.

---

## Reference log lines

Compare yours against these by eye, not by faith.

**Start-up:**

```
[tool-bridge] entry point 127.0.0.1:<port>; tools 9 (parity with the native route 6: get_goal, create_goal, update_goal, job_output, job_list, job_kill; platform schedule 3: schedule_create, schedule_list, schedule_delete)
[tool-bridge] goal-creation ceiling: 3 (configured) per 60 min (configured); under the ceiling: create_goal
[tool-bridge] blocked threshold: 3 (configured) autonomous rounds
[tool-bridge] ticket: per (identity, turn), dies on turn/end; upper lifetime 360 min (default); issued to root agents only
[tool-bridge] server name: "<name>" (configured); the model sees the tools as mcp__<name>__<tool name>
[tool-bridge] self-wake limit: no more often than 1800 s (configured); no more than 6 in a row without a word from a human (configured); no more than 48 per day PER SESSION, not per agent (configured), in zone Europe/Moscow (configured); the agent's total ceiling = number of live root sessions × 48 (two sessions already make 96 a day); counted from the session log — a restart does not reset it; a word from a human = source kinds [user] (default); stop notice to the log only: no directory configured (default)
[tool-bridge] self-wake limit DOES NOT APPLY: to goal rounds (they have their own defaultMaxGoalRounds), to wake-ups from background jobs (they have their own maxConsecutiveWakes), to an agent without the bridge (on the native route the schedule runs on the native platform loop — it needs a guard of its own) and against anyone who has sudo: the isolation here is behavioural, and the counter is read from the log of my own process
```

The last two lines — the numbers and the **boundaries** — are printed separately
on purpose. A protection that does not name where it does not apply will sooner
or later produce exactly the harm it was protecting against.

**Per turn:**

```
[tool-bridge] ticket issued: <session> turn 11; live tickets of this turn 1
[tool-bridge] call schedule_create for <session>: success
[tool-bridge] tickets of turn 11 for <session> revoked: 1 (completed)
[tool-bridge] self-wake <session>: in a row 0/6, per day 0/48 (zone Europe/Moscow)
```

The last one is printed on **every** end of turn, even when all is quiet. A
mechanism that says nothing is indistinguishable from a switched-off one.

**Lines that mean trouble** (each carries 🔴 — search for exactly those):

```
[tool-bridge] 🔴 refused at the door: ticket unknown or already revoked
[tool-bridge] 🔴 BLINDNESS: "schedule_create" is not registered on agent <id> — the layer is not mounted
[tool-bridge] 🔴 self-wake limit for <session>: 6 autonomous wake-ups in a row without a word from a human (limit 6); reminders removed 2: …
```

---

## What does not work, and will not

**The native execution path loses three things.** The bridge does not execute the
schedule tools itself; it calls their native body directly, bypassing the platform
registry. In doing so it loses the **call time limit**, the **registry's
concurrency queue** and **cancellation by the turn signal**.

Why that way and not through the registry: on our permission layout the
registry's waterfall closes and the tool would refuse **always** — and it would
look like "the schedule is broken". The direct call is more honest: it does
exactly what it promises and loses exactly what is named here.

🔴 **A consequence you need to know if you put a `tools/execute` policy alongside
it:** calls going through the bridge do **not** pass that policy — they go around
the registry. That is why the recurring-reminder interval guard lives inside the
bridge and not only outside it. This is not duplication out of carelessness: two
routes mean two places, and neither can be removed.

**The self-wake limit is behavioural, not enforced.** It protects against a
cooperative mechanism running away: an accidental loop, a forgotten recurring
reminder, a lost connection to the human. It does **not** protect against anyone
with full privileges: such a party bypasses the limit, and the counter lies in the
log of its own process, under its control. This is by design and it is announced
in the startup line. A mechanism must not pretend to be what it is not.

**The bridge does not raise what is absent.** If a tool is not registered on the
live agent, the bridge shouts `🔴 BLINDNESS` and refuses. A silent "not found"
would be read by the model as "nothing to do", and you would be hunting the defect
in the wrong place.

---

## Acceptance by your own hand

Five checks. Each answers its own question; none replaces another.

1. **The startup lines are there and the numbers in them are yours.** Checks the
   mounting and the delivery of settings.
2. **`tools/check-blocked-threshold.sh` exits 0.** Checks that the duplicated
   constant has not diverged from the platform.
3. **The generated `parity.json` is identical to the one in the package.** Checks
   that tool descriptions have not diverged from the platform:
   ```bash
   node tools/extract-parity.mjs <root> > /tmp/p.json
   node -e "const a=require('/tmp/p.json'),b=require('./src/parity.json');console.log(JSON.stringify(a)===JSON.stringify(b))"
   ```
4. **A deliberately forbidden call returns YOUR text.** Ask the model to set a
   recurring reminder more often than the limit — for example `every_seconds:
   300`. The refusal must come back in the bridge's own words: "a recurring
   reminder may run no more often than once every 1800 s — this is a host limit,
   not an error". This is the only check that works **without access to the log**:
   you recognise your code by its own text in the answer.
   🔴 Check the permitting side too — `every_seconds: 1800` must **succeed**. A
   protection whose permitting outcome has never been tested may turn out to be a
   blanket ban.
5. **The counter line at the end of a turn.** Finish a turn and find
   `self-wake <session>: in a row N/6, per day M/48` in the log. Its absence means
   the subscription did not fire.

🔴 **The first four are usable as a run-through AFTER a platform upgrade**, and
that is their main purpose. An upgrade does not break the bridge with an error —
it desynchronises it silently: tool descriptions drift, the constant diverges, the
plugin set loses a settings field. None of that crashes.

---

## Test benches

```bash
node test-heartbeat.mjs      # counters and the interval guard, taken from src/index.js
node test-startup-lines.mjs  # reference lines in this README against what the code prints,
                             # plus the settings list across schema / README / patch,
                             # plus every file package.json promises (`files`,
                             # `main`, `dsh.bundle.patch`) against the disk
```

Both take the text under test **from the shipped file**, not from a retelling of
it, and both cut by name rather than by line number.

Run `node test-startup-lines.mjs` on an unpacked tarball too, not only on a
checkout: `npm pack` drops a `files` entry that does not exist without a word, so
a package can ship one file short and still build clean. The platform is less
forgiving — a bundle whose `dsh.bundle.patch` target is missing stops the profile
from loading at all (`failed to read overlay <path>: ENOENT`). Silent where it is
made, fatal where it is used.

---

## License

MIT.
