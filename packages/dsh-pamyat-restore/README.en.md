# dsh-pamyat-restore

Post-compaction context restore and a welcome briefing at session start. One package — one kernel seam: `agent/pre-step`.

## Place in the dsh-pamyat family

This package is the **reading side** of memory. Writing and storage live separately:

| layer | package | what it does |
|---|---|---|
| A | `dsh-pamyat-secretary` | takes a summary before compaction overwrites the history |
| — | `dsh-pamyat-core` | storage, decision journal, write policy |
| — | `dsh-pamyat-omega` | long-term layer over external storage |
| **B, C** | **this package** | **returns knowledge to the context: the summary after compaction and the briefing at start** |
| E | `dsh-pamyat-byudzhet` | limit on how much is lifted back |
| F | `dsh-pamyat-nudzh` | spending count: is it time to compact |

🔴 **Why this is here.** A set without the reading side is memory that writes and never
gives back. Completeness cannot be checked by machine today: every metapackage probe
verifies the consistency of what is declared, and a missing layer is invisible to them —
what is declared agrees perfectly. So the set is named in words, so that at least a human
can see the gap.

## What it does

- **Layer B (restore after compaction).** On the first `agent/pre-step` after a `compaction/end` event (delivered through the `session/event` hook, not a hook of its own — see Assumptions), injects a durable message with the summary (a record of class `svodka`): TL;DR, LAST USER DIRECTION, etc., saved by the secretary before compaction.
- **Layer C (welcome briefing).** At session start (first step), injects a memory sample with a per-record `use` / `verify` / `ignore` decision.

The injection is only a durable message with `source.kind=plugin` (like `dsh-time-context`). No decisions during the turn: restore adds context and leaves.

## use/verify/ignore decision

A deterministic rule that prints its REASON:

| decision | condition | printed reason |
|---|---|---|
| `ignore` | record older than `ignoreAfterMs` | `старше N сут` |
| `verify` | record TIME unknown (absent or not a number) | `время записи неизвестно — применять с проверкой` |
| `verify` | confidence NOT MEASURED (absent or not a number) | `вера не измерялась — применять с проверкой` |
| `verify` | fresh but `vera` below `useVeraThreshold` | `вера X ниже порога Y` |
| `use` | fresh and `vera` above the threshold | `свежая, вера X` |

The reason is mandatory: without it, correct work and degradation are indistinguishable a month later.

### 🔴 Confidence is currently not measured for any record

The `useVeraThreshold` limit is in force, but there is nothing to compare yet: **nobody
sets confidence**. The core accepts it as a write parameter for any class — and none of
today's writers passes it. In the live database confidence is empty on every record.

So the "confidence was not measured" branch is not a rare case but the **normal state**,
and it is kept apart from "below threshold" on purpose:

    confidence absent  ->  verify, reason "not measured" — WITHOUT a number
    confidence 0       ->  verify, reason "0 below threshold" — a measured zero
    confidence 0.5     ->  verify, reason with the number
    confidence 0.9     ->  use

Without that branch the comparison collapsed both states back together, and did so in
opposite directions: `null < 0.7` is true and produced verify with a false number in the
reason, while `undefined < 0.7` is false — so an unmeasured record went to `use` as
trustworthy.

The rule will start working once a measurer appears. Until then it is declared dormant
here, so that nobody builds a conclusion on it.

## Configuration

| key | default | meaning |
|---|---|---|
| `restoreEnabled` | `true` | enable layer B |
| `welcomeEnabled` | `true` | enable layer C |
| `welcomeBudget` | `800` | briefing budget in characters |
| `ignoreAfterMs` | `604800000` | older than this -> `ignore` (7 days) |
| `useVeraThreshold` | `0.7` | `vera` not below this -> `use`, else `verify` |

## Read contract (with core)

There is one source — the core's `pamyat` service, taken via `ctx.get('pamyat')`:

```
pamyat.prochitat({ klass?, skolko? }) -> array of core table rows
pamyat.dostupna() / pamyat.pochemuNedostupna()
```

The shapes differ, and a single place translates them — `perevesti()`:

| core | here | note |
|---|---|---|
| `klass` | `vid` | |
| `sozdano` | `kogda` | |
| `istochnik` | `avtor` | empty falls back to the knowledge owner; nothing is invented |
| `vera` | `vera` | **passed through as is, including `null`** |
| `bez_podtverzhdeniya` | `bezPodtverzhdeniya` | the trust mark travels with the record |

🔴 **There is no stub.** There was one — and for a whole evening it fed the live context
with plausible fiction: the layer honestly injected a record into the session, the log
printed "restoration injected", and telling that apart from real work required comparing
the text against the source. A fallback path to the same data is a second source of
truth, and one day it wins silently.

🔴 **The service is taken with `ctx.get`, not declared in `inject`** — by proportionality,
not by loudness.

The earlier rationale here was false, and a test run showed it: booting a copy of the
platform with the core removed from the profile proved that `inject` is **not quiet but
catastrophic** — the platform refuses to start at all and names the cause explicitly:

    dsh: 1 entry did not activate
    dsh-pamyat-secretary: pending (waiting for service: pamyat)

`inject` gives excellent diagnostics at the price of the whole agent. The real argument
for `ctx.get` is that **a missing briefing is not worth stopping the agent**: the layer
must keep its voice, say there is no memory, and step aside. The secretary makes the
opposite choice, and rightly so — without memory it has nowhere to write, and failing is
more honest than doing empty work.

## How to re-check

The test benches ship with the code: a check that stays with its author is not a check.

    node test/stend-restore.mjs
    node test/stend-krik-zvuchit.mjs
    node test/stend-readme.mjs

🔴 The first one needs two platform packages, and without them it honestly goes blind
(exit 2) rather than lying green. The package lives outside the platform tree, so the
paths are given explicitly:

    DSH_PERSIST=<platform>/node_modules/@deepseek-ai/dsh-session-persistence/lib/index.js
    DSH_SESSION=<platform>/node_modules/@deepseek-ai/dsh-session/lib/index.js

All three share the same exit codes: 0 agreed, 1 mismatch, 2 could not check.
"Nothing to check with" and "checked, all good" are different news, and the exit code
tells them apart.

### Incoming budget

If `dsh-pamyat-byudzhet` is mounted, the briefing is selected under its limit — the
`byudzhetPamyati.otobrat` service decides what to lift and shouts with named reasons when
something is dropped. There is deliberately no second selection here: another way of
deciding the same thing would silently drift from the first.

The service is **optional**: without it the briefing is built in full. But its absence is
**said out loud** — otherwise "budget not applied" is indistinguishable from "applied and
dropped nothing", and a month later nobody can tell whether the limit works.

🔴 **Layer B does not call the budget, and that is a decision, not an omission.** There the
record is exactly one — the compaction summary the layer exists for; dropping it under a
budget would cancel the layer rather than save anything.

A budget failure does not cancel the briefing: it is about cost, not about permission.

## Boundaries

- **What it protects:** against context loss after compaction (B) and a "cold start" without memory (C).
- **Where it does NOT apply:** steps that are not the first after `compaction/end` (B) and not the first step of the session (C); steps with `decision.kind === "reject"` or an aborted signal.
- **What it does NOT catch:** it does not compact and does not cancel compaction; it does not guarantee the model USES the injection.
- **Stop condition:** layers are disabled via `restoreEnabled`/`welcomeEnabled`.

## What is NOT configurable (and why)

- **A briefing-refresh key** — deliberately absent: a key lives in the version that EXECUTES it. A schema-accepted key that does nothing is indistinguishable from a ready capability.

- **The essence of the `use/verify/ignore` decision** — the meaning of the classes; only the THRESHOLDS (`ignoreAfterMs`, `useVeraThreshold`) are configurable, not the rule itself.
- **Reason printing** — "why this decision" cannot be disabled.
- **Foreign-protocol literals** (`agent/pre-step`, `session/event`, the `compaction/end` event type, `source.kind=plugin`) — read from the kernel source, not configured.

## Assumptions

- **Verified against platform sources:** the `agent/pre-step` hook and durable-injection format — `dsh-time-context/lib/index.js:363`.
- **🔴 Verified and FIXED on 2026-09-02:** there is NO hook named `compaction/*` in the platform at all (pattern `'compaction[^']*'(` across every `.d.ts` in the tree → 0, with a positive control: the same pattern finds `'session/event'(` in `dsh-session/lib/types/index.d.ts:66`). `compaction/end` is a session-log event type (`SessionEventMap`); every platform consumer reads it as `event.type === 'compaction/end'` (`dsh-compaction/lib/invariant.js:60,101`, `dsh-client-ui-trajectory/lib/client.js:416`). The first edition subscribed via `ctx.on('compaction/end')` — a subscription to a hook that does not exist registers silently and never fires, and from the outside that is indistinguishable from "no compaction happened". It now subscribes to `session/event` and filters by type.
- **Verified in practice (session log, 8 events):** the `compaction/end` payload is `{ compactionId, turn }`; none carried `error` (the field is declared in the type and marks a FAILED compaction — those are skipped: history was not truncated, so there is nothing to restore).
- **Per-function canary: 15 checks**, each proven by a deliberate break — welcome, use/verify/ignore, ignore-exclusion, reason, C without start, restore after compaction, B without compaction, bad input (both halves), correct subscription hook, foreign event type, failed compaction, compaction of another session. Plus an exact-count canary: a removed section exits 2 rather than green.
- **Accepted without verification:** the real core contract (currently a `storage.poslednie/prochitat` stub); layer B firing on a LIVE node — the event is fed by the stand exactly as the platform feeds it, but a real compaction was not observed under instrumentation.
