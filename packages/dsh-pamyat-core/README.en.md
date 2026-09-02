# dsh-pamyat-core

Working memory for DSH agents: local storage, a decision journal, and a
class-based write policy. **Zero external dependencies.**

This is the base of the `dsh-pamyat-*` family. It occupies no core seam of its
own — it provides the `pamyat` service that the other packages build on
(summarizer, post-compaction restore, hygiene, budget, nightly pass, search).

## Why

DSH core has no memory: there is a session journal and compaction, but nothing
that stores knowledge or serves it at session start. This package fills the base.

## Parts

| Part | Role |
|---|---|
| storage | local SQLite on the built-in `node:sqlite` |
| journal | every write **decision**, refusals and their nature included |
| policy | which classes are written automatically, which need confirmation |

## The key property: a failure never masquerades as emptiness

"Memory stored nothing" can mean different things, and they need different fixes:

| nature | what happened | decision or breakage |
|---|---|---|
| — | there was nothing to store | normal |
| `otkazano-chelovekom` | a human declined | decision |
| `otmeneno` | approval was interrupted before an answer | neither: ask again |
| `net-kanala` | no approval channel exists | broken install |
| `net-sluzhby` | approval unsupported by this build | broken install |
| `net-agenta` | the call runs outside an agent, nobody to ask | broken install |
| `ne-predyavleno` | the caller never asked for approval | fix the caller |

The first four natures come **verbatim from the core source** (`dsh-tools`,
`lib/index.js`): the core itself refuses differently "so the model can tell a
human 'no' from an absent approval channel". This layer **carries that
distinction forward** instead of collapsing it. Collapse it, and a broken install
looks like a cautious human.

🔴 **Three names are OURS, not the core's.** `not-supported`, `no-agent` and
`ne-predyavleno` are never returned by the platform — the caller supplies them to
describe a situation that never reached the approval service. Do not expect them
from the core.

**An unknown outcome is a failure with a code, not "a human".** If the core ever
adds a new outcome, the package says so instead of silently blaming a person.

## The gate lives inside the service

The policy is not an advisory the caller may skip: `zapisat` applies it itself.
A class requiring confirmation is **not written** without one, and the refusal
goes to the journal with its nature. A guard you can forget to call rests on the
caller's discipline, not on the design.

The same holds for storage: if `node:sqlite` is unavailable or the database fails
to open, the service still exists, but **every** call fails with a clear message,
and the reason is logged loudly once.

## Configuration

Everything a user might reasonably want to change is exposed as configuration;
the code keeps defaults as schema values, not literals scattered around.

| key | default | meaning |
|---|---|---|
| `putBazy` | — (required) | path to the database file |
| `agent` | — (required) | agent name: one machine hosts several |
| `sprashivat` | `ogranichenie`, `navyk` | classes requiring confirmation |
| `chtenieSkolko` | `20` | how many records a read returns |
| `zhurnalSkolko` | `20` | how many journal rows a read returns |

`putBazy` and `agent` are required on purpose: published code knows nothing about
the machines it will run on. A missing key must be distinguishable from a
deliberately different value.

ℹ️ The long-term layer's settings live in its own package, not here: a key
belongs to the package that *executes* it. A key described where nobody reads it
is a silent zero — "the setting never arrived" becomes indistinguishable from
"switched off".

### What is deliberately NOT configurable

Configurable is what a user might want done differently. What protects them from
a silent failure must not be configurable: one day someone will switch it off.

1. **Table names and schema.** No real use case, while a configurable name is a
   way to silently divorce schema from data: the old database simply stops being
   found, and that looks exactly like empty memory.
2. **Literal approval outcomes of the core.** Someone else's protocol, not our
   decision — it can only be read from the platform source. A configurable
   protocol literal is a way to drift from the platform unnoticed.
3. **Failure behaviour** ("no source → do not write, and shout"). A configurable
   fail-closed means the guard can be switched off by configuration.

## Testing

    npm test

Four stands, 31 probes. In every stand the first probe runs against a **known-good**
subject: if it is red, the stand itself is broken and the remaining probes mean
nothing. Every guard is verified **by corruption**: missing module, unopenable
database, missing path, incomplete record, incomplete journal entry, missing class.

## Assumptions

**Verified on the development stand (2026-09-02):** `node:sqlite` works on Node 24.19;
all 23 probes green; plugin shape (`name` / `Config` / `apply`, `ctx.provide`)
taken from the live `dsh-tool-bridge` reference; approval behaviour read from the
types of `@deepseek-ai/dsh-tools@0.1.1-rc.2`, fetched from the registry at exactly
the version installed on the stand.

**Accepted without verification:** behaviour on a live DSH node (not mounted yet —
that is the second acceptance step); `ctx.logger` behaviour (stubbed in the fake
ctx); that `ctx.provide` in 0.1.1-rc.2 behaves as in the reference.

## Limits

* Requires **Node >= 22**: `node:sqlite` is marked experimental.
* No distillation, no context injection, no model tools, no network — those are
  other packages of the family.
* The journal records a **decision**, not delivery: it does not prove that
  knowledge reached the long-term layer.

## License

MIT
