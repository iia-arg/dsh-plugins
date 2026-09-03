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

## Belief in a record: empty is not zero

A record carries an optional `vera` field (0..1) — the gating of retrieved
knowledge rests on it (use / verify / ignore).

🔴 **The field allows emptiness on purpose.** `null` means "belief was never
measured", which is **not** the same as `0` — measured distrust. Collapse them,
and a record nobody assessed becomes indistinguishable from one judged worthless,
while the "verify" branch loses its meaning.

An invalid value (outside 0..1, not a number) is **rejected with a code** rather
than silently coerced to zero: coercion would turn a caller's mistake into quiet
data corruption.

Old databases migrate by adding a column; rows written before the field existed
are **not** given a belief value — they never had one.

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
| `otvechayushchegoNet` | `false` | nobody to ask on this node: `ask` classes are stored with an in-record mark |

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

## How to call — one live example per function

```js
const pamyat = ctx.get('pamyat');

const id = pamyat.zapisat({
  klass: 'zametka',
  soderzhim: 'a thought that must outlive the session',
  istochnik: 'session#42',
});

pamyat.zapisat({
  klass: 'navyk',
  soderzhim: 'a technique useful to other agents',
  podtverzhdenie: 'allowed-once',            // 'rejected' | 'cancelled' | 'unavailable' | …
});

const poslednie = pamyat.prochitat({ klass: 'zametka', skolko: 5 });
const vse = pamyat.prochitat({});            // object argument, not positional

const { reshenie, pochemu } = pamyat.reshit('navyk');   // 'ask' | 'auto'

pamyat.otmetitOtkaz({ klass: 'navyk', priroda: 'otkazano-chelovekom', pochemu: 'declined' });

const { zapisano, otkloneno, poPrirode } = pamyat.svodka();

if (!pamyat.dostupna()) console.error(pamyat.pochemuNedostupna());
```

⚠️ Common first-call mistakes (seen during review): the field is `soderzhim`, not
`soderzhanie`; `prochitat` takes an OBJECT, not positional arguments; the agent
name comes from configuration and is not passed per call. All three fail loudly
with a code — but each costs an attempt.

## Known about output

The package shouts through **`console.error` only** — there is no branch. The
reason matters, and the previous wording of this section was **wrong**: it said
"the platform does not give plugins `ctx.logger` (verified 2026-09-02)".

What actually happens, measured at the gate on 2026-09-03 against cordis 4.0.1:
`ctx.logger` **is created for every Context** (`cordis/lib/index.js:1687`), so it
exists and calling `.error()` succeeds. But the only built-in exporter
(`LoggerService`, lines 582–605) pushes the message into a 1000-entry ring
buffer, and DSH installs no exporter of its own — **nothing reaches any stream**.

Two consequences worth coming back here for:

1. **Checking that an output channel exists proves nothing.** The function is
   there, the call succeeds, and no one hears it. Only a path traced all the way
   to where a human reads it counts. Under a service `stderr` goes to the system
   journal; that is verified by a probe, not by reasoning.
2. **A platform upgrade may give the logger a voice** — and then output would be
   printed twice. If DSH ever installs an exporter, rewrite this section together
   with `krik()`, not on top of it.

⚠️ On the word "verified" in our documents: it must name the **method**, not just
a date. "Verified 2026-09-02" cannot be re-checked, and the next reader simply
believes it. The method here: call `krik` under a real `Context` and wait for the
line on the process `stderr` — that is exactly what `stend-krik-zvuchit` does.

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

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
