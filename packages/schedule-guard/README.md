# dsh-schedule-guard

A behavioral guard for DeepSeek Harness self-wakeups: caps autonomous schedule reminders,
deletes runaway repeats, and tells the owner why.

**Not needed if** your agent loop runs through an external engine that never sees the schedule
tools, or if you don't enable the platform's `dsh-schedule` at all — with no self-wakeup there is
nothing to cap.

## What it is

The platform ships `@deepseek-ai/dsh-schedule` but does not enable it by default. Once you do, a
model can set reminders that wake itself — and a cooperative loop can accidentally run away: every
autonomous wakeup sets the next reminder, forever, at your token cost.

This guard folds a counter **from the session journal** (a `schedule/change dispatch` event is one
autonomous wakeup; a `user/message` with `source.kind === "user"` is a human word and resets the
streak). At a limit it deletes the runaway **repeating** reminders, writes the owner one message,
and stops. One-shot reminders are left alone — they expire on their own — but they still count
toward the limits, because the counter counts *wakeups*, not rule types.

It also refuses a too-frequent repeat **up front**: a `schedule_create` with an `every_seconds`
below the floor is rejected at the tool call, so the model hears "no, the floor is 1800s" and
re-schedules correctly on the spot. The reaper stays as the backstop.

## Two mechanisms, two routes — keep both

The floor is enforced in two different places, and they are NOT redundant:

- **Preemptive refusal** (a `tools/execute` hook): rejects `schedule_create` below the floor at the
  tool call. The model hears "no" and can re-schedule. This hook sees only calls that enter the
  platform's tool registry — the native loop.
- **Reaper** (on `agent/status` idle → delete): removes repeating reminders that were already
  created. It tells the journal and the owner, but not the model. It catches reminders created by
  any route that bypasses the registry — for example a bridge that invokes the tool body directly.

Delete either one and you silently disarm one route. They read like duplication and are not.

## When you do NOT need it

- You never enable `dsh-schedule`. No self-wakeup, nothing to guard.
- Your model loop is driven by an external engine (a bridge) that never reaches the schedule tools:
  the model physically cannot schedule, so the guard is inert.
- You want a **hard security boundary**. This is not one — see "What it does NOT do" below.

## Install

Requires `@deepseek-ai/dsh-schedule` in the same profile (it ships with the platform; not enabled
by default).

**Step 1 — enable the schedule plugin in your profile.**

In your profile's `cordis.patch.yml` (or the patch the platform composes for you):

```yaml
- insert:
    - name: '@deepseek-ai/dsh-schedule'
      id: schedule
```

🔴 **Success:** after restart, the agent's tool catalog lists `schedule_create`, `schedule_list`,
`schedule_delete` (3 new tools).

**Step 2 — install the guard.**

```bash
# inside your profile directory ($DSH_HOME/profiles/<name>)
pnpm add dsh-schedule-guard
```

🔴 **Success:** `pnpm add` completes and `node_modules/dsh-schedule-guard` resolves to this package.

**Step 3 — add the guard row.** `dsh plugin add` composes the bundle patch below; a manual profile
adds the same row to `cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-schedule-guard
      config:
        maxConsecutiveWakeups: 6
        maxPerDay: 48
        minRepeatingIntervalSeconds: 1800
        dayBoundaryOffsetMinutes: 0
```

🔴 **Success:** `dsh --profile <name> --dump-config` shows a `dsh-schedule-guard` entry with your
config (or, without config, the entry is present and the startup line will say `(default)`).

> ⚠️ `--dump-config` is a **writing** command: it rewrites the profile's `cordis.yml` (expected — not read-only).

**Step 4 — restart the platform.**

🔴 **Success:** the startup log shows the limits line, verbatim (see "Reference journal lines").

**Step 5 — prove the guard acts, live.** Set a repeating reminder faster than the minimum interval:

```
schedule_create(every_seconds: 600)   # 10 minutes, below the default 1800 s floor
```

🔴 **Success:** the tool call itself is refused with `Error: repeating reminder no more often
than every 1800s …` (native route); on a route that bypasses the registry, the reaper deletes it
on the next agent idle and logs the stop line.

## Configuration

| Field | Default | What it does |
|---|---|---|
| `maxConsecutiveWakeups` | `6` | Autonomous wakeups allowed in a row without a single human word. Any human message resets the streak. |
| `maxPerDay` | `48` | Autonomous wakeups allowed per local calendar day (boundary = `dayBoundaryOffsetMinutes`). |
| `minRepeatingIntervalSeconds` | `1800` | Floor for repeating (`every`) reminders. 1800 s = 30 min, deliberately tighter than the platform's own 300 s floor. |
| `dayBoundaryOffsetMinutes` | `0` | Offset from UTC of the day boundary, e.g. `180` for UTC+3. |
| `notifyCmd` | unset | Path to a command that notifies the owner. Called once per stop with the message as its single argument. Unset → the stop is only logged to stderr. |

The counter is **per session**. If one agent runs several sessions, each session gets its own
streak and its own per-day count, and the stop message prints the number that tripped it.

## Reference journal lines

Startup (de-anonymized; `(configured)` / `(default)` marks where each value came from):

```
schedule-guard [startup]: limits: maxConsecutiveWakeups=6 (configured), maxPerDay=48 (configured), minRepeatingIntervalSeconds=1800 (configured), dayBoundaryOffsetMinutes=0 (configured), notifyCmd=unset (log only) (default)
schedule-guard [startup]: not applied to: wakeups by a human message (not a dispatch); an already-running turn (the cycle is stopped, not the turn); goal rounds and background jobs (not schedule dispatchers)
schedule-guard [startup]: session under guard: <session-id> (total 1)
```

Stop (one log line; `|` separates what the owner message contains):

```
schedule-guard [<session-id>]: 🔴 schedule-guard: stopped by the autonomous-wakeup limit. | Reason (in numbers): repeat faster than 1800s (intervals: 600s) | Deleted repeating reminders: |   - id schedule-3, interval 600s, text: "…" | Accomplished during the autonomous stretch: 2 autonomous wakeups total | Resume: only by a human word (any message resets the counter). | Time: 2026-08-22T21:30:56.303Z
```

The delete itself is a durable session event:

```json
{"type":"schedule/change","seq":636850,"time":1787434256301,"data":{"version":1,"operation":"delete","id":"schedule-3"}}
```

## What it does NOT do

**This is a behavioral governor, not a force.** It caps a *cooperative* mechanism — reminders a
model sets for itself — and stops an *accidental* runaway loop. It is **not** a security boundary
against an agent with full privileges: such an agent can read and rewrite its own session journal
(where the counter lives), remove the guard, or schedule through another path. Anyone who reads
"limit" as a security guarantee would be building on a false premise. The mechanism must not
pretend to be what it is not.

It also does **not** reject a reminder at creation time — the guard owns no tool, it observes and
deletes. So the "rejection" arrives as a delete plus a notification on the next agent idle, not as
a `schedule_create` error.

## Verify with your own hand

Run this after install, and re-run it after any platform / vendor / core update (it is a checklist,
not a one-time ritual):

1. `dsh --profile <name> --dump-config` → a `dsh-schedule-guard` entry is present.

> ⚠️ `--dump-config` is a **writing** command: it rewrites the profile's `cordis.yml` (expected — not read-only).
2. Restart, then read the startup log → the `limits:` line is present and each value is marked
   `(configured)` or `(default)`.
3. `schedule_list` → returns (possibly empty), i.e. the schedule tool itself is alive.
4. Create a repeating reminder below the floor (`every_seconds: 600`) → the tool call is refused
   immediately with `Error: repeating reminder no more often than every 1800s …`; `schedule_list`
   shows nothing new.
5. Run the shipped bench: `node test-preemptive-refusal.mjs` → `сошлось 5, расхождений 0`
   (it imports the guard's real `tools/execute` hook from `src/index.js` and checks five cases
   on a stub context — no dsh-tools, no platform: refusal below the floor with the reason and the
   code, pass-through at the floor, pass-through for another tool, pass-through without
   `every_seconds`).
6. Prove the backstop still holds: create a too-frequent repeat through a route that bypasses the
   registry, and on the next agent idle the reaper deletes it (`schedule/change delete` in the
   journal, stop line in the log, owner notified).

## Things that cost us a day

Each of these failed **while looking like success**.

**1. Syntax check passes, and answers the wrong question.** `node --check` checks grammar, not that
the APIs you call exist. A schema call that does not exist in this platform's schema library
(`z.number().optional()` — the library is not zod) passed `node --check` and killed the whole
platform at import, with no one left to roll back. The minimal honest check for a plugin is to
import the module in a separate process:

```bash
node -e "import('file:///abs/path/src/index.js').then(()=>console.log('import ok'))"
```

That catches missing methods, name typos, and broken dependencies before you ask for a restart.

**2. Reentrancy — and the two cases are NOT the same.** The platform publishes session events
synchronously under a lock ("session append cannot reenter while another append is being
published"), so appending to the journal from inside a *session event* handler always fails
silently. This guard defers its delete through `ctx.agents.withoutInitiator` as a **precaution**:
its hook is `agent/status idle`, which is *not* a session event, so the lock never held it. A
sibling case where the lock *did* bite was a hook on a session event, proven by a separate harness.
Same code change, different grounds — do not merge the two.

**4. A refusal without an `error` field degrades into gibberish.** Returning
`{content, isError: true}` from a `tools/execute` hook makes the registry answer `tool result must
be losslessly JSON-serializable` — the model is told the plumbing broke, not why it was refused.
The error branch reads `result.error`, so a refusal MUST carry `error: { message, info: { name,
code } }`. A guard whose refusal is unreadable is worse than none.

**5. The registry service is silent about its own dependency.** `ToolRuntime` declares
`static inject = ["systemPrompt"]`; mounted alone, `ctx.tools` stays `undefined` — no throw, no log.
A bench that mounts one plugin and reads the service concludes "not reproducible" when the truth is
"one dependency short". The shipped bench mounts both — that is the difference between a bench and
a wrong conclusion.

**3. Count wakeups, not rule types.** "One-shot reminders are exempt" is the obvious reading and a
one-line bypass: each wakeup sets a fresh one-shot, and the loop is eternal. The counter counts
every dispatch regardless of rule type; one-shots are merely not *deleted* (they expire on their
own).

## Measurements

Own, live, not a stand: reminder delivery deviation **54 ms on 300 s**. The preemptive refusal is
immediate — the hook returns before the tool runs. The **47 s and 12 s** figures are the REAPER's
latency (time from reminder creation to deletion on the next agent idle, two live runs on the route
that bypasses the registry). If you cite a sibling deployment's 3 ms / 1 ms figures, mark their
origin — they are a different route, not this one.
