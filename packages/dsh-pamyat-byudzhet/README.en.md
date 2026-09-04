# dsh-pamyat-byudzhet

**Incoming** memory budget: how much knowledge to lift back into the conversation
so that memory does not crowd out the conversation itself.

Context spend is **not its job** — that belongs to the neighbouring layer (nudge)
and is deliberately not duplicated here.

## What it does

    ctx.byudzhetPamyati.otobrat({ zapisi, predel })
    -> { podnyato, otbrosheno, svodka }

Selects records within a limit and **fails loudly** when not everything fits.

## 🔴 The refusal names, it does not merely count

A silent "we lifted some of it" is indistinguishable from "there is no memory" —
two different troubles with different cures. So the refusal carries reasons, not
just numbers:

    поднято НЕ ВСЁ: просили 14, подняли 9, отброшено 5
    (2 не поместились по порядку «svezhest»; 1 с верой ниже 0.5;
     2 с НЕИЗМЕРЕННОЙ верой (это не ноль)).

## 🔴 Confidence: "low" and "never measured" are DIFFERENT reasons

In the core schema `vera` is `REAL DEFAULT NULL` — NULL means **not measured**,
not zero. A selection treating NULL as zero would discard first every record
written before the field existed, judged by a property they could never have had.

So under the `vera` order an unmeasured record ranks **after** high measured ones
but **ahead of** low measured ones: unknown is not worse than proven-bad.

## 🔴 Cause and property are different things

Selection rejects on ONE ground: the price did not fit the limit. Confidence rejected
nothing — it is a **property** of the rejected records, not a cause of rejection. Until
2026-09-04 both were printed in one line, and whoever read "3 with confidence below 0.5"
went to tune the confidence threshold, which under the "freshness" order took no part at
all.

Now `prichiny` is about the limit only; `svoystva` is a separate field, "of these:".

And there are **two causes, because they are cured differently**:

| cause | meaning | cure |
|---|---|---|
| does not fit at all | ONE record costs more than the WHOLE limit | splitting or distilling at write time |
| did not fit in the remainder | it would fit, but the budget is taken | order or limit |

The first is cured neither by order nor by threshold: such a record will never be raised.
Measurement 2026-09-04 on the live base: 7 of 23 rejected are compaction summaries priced
4008…4841 against a limit of 2000 — twice the whole budget each.

## 🔴 Warmth: an instrument, not a rule

Warmth measures demand: is the record used or not. It is **computed and printed on every
selection, but influences nothing**. That is a decision, not an omission, and two
measurements stand under it:

1. **Ordering by warmth is identical to ordering by freshness.** On 31 live records the
   position difference is zero — and that is by construction, not by sample: the record
   schema has no touch counter at all, so warmth here is a pure function of age. Ranking
   by a monotone function of age is ranking by age.
2. **The threshold cuts nothing.** Warmth of every record is 0.918…1.000 against a "cold"
   threshold of 0.25. The whole memory history is 1.7 days against a 14-day half-life: a
   measure cannot resolve what is shorter than its own step.

The 14-day half-life, the 0.25 threshold and the per-touch increment are **hypotheses**,
unverified on a live corpus. The increment carries zero weight on purpose: picking it
blindly would pass reasoning off as measurement.

**When this stops being true** (named in advance so the boundary does not outlive its
cause): a touch counter appears — warmth parts ways with freshness; history reaches three
half-lives (42 days) — the distribution becomes observable and the threshold can be set
from it.

Absence of warmth is a **third state**, neither cold nor an error. Same argument as for
confidence: emptiness is not zero.

## 🔴 Known about units

The package counts with **its own** measure and calls it its own: `оценка наша`.
The word "tokens" appears nowhere in its output, and that is not pedantry.

Measured 2026-09-03; method — a search through the package
`@deepseek-ai/dsh-compaction` 0.1.1-rc.2 itself, not its prose:

* in `.d.ts` the word `estimator` occurs **once**, in a field comment;
* in `lib/` (8 real js files) there is **no** token counter;
* it is absent from `exports` (`.`, `invariant`, `types`, `checkpoint`, `src/*`).

The platform hands over a **ready number** (`shadowedTokenCount`) and only for
what it compacts itself; its own contract calls it "heuristic price under the
token-meter's **fixed estimator**". Our records are never measured by it.

Hence two separate paths that must not be merged: we price our own records, and
we accept their number as a fact when an event carries it. Reconciliation is
possible **only where both numbers appear in one event** — `sverit()` reports the
divergence and deliberately **does not adjust our measure**.

⚠️ **If they change the estimator, our limits drift SILENTLY.** Nothing announces
it; the only signal is a divergence in `sverit`, and someone has to look.

## Known about output

Shouts through **`console.error` only**. `ctx.logger` exists in cordis 4.0.1 and
the call succeeds, but the built-in exporter pushes into a 1000-entry ring buffer
inside the process and never reaches a stream. Checking that the channel exists
proves nothing: the function is there, the sound is not.

How to re-check: `test/stend-krik-zvuchit.mjs` raises the package in a separate
process under a real `Context` and waits for the line on its `stderr`.

## Testing

    npm test

Four stands, 39 probes. The numbers are not rewritten by hand: a probe checks them
against the stands. Until 2026-09-04 that probe was missing here and the line "Three
stands, 21 probes" stood false against four stands and 36 probes.

The first probe of each stand is run against a **known-good**
subject — if it is red, the stand is broken and the rest mean nothing. The very
first draft of the sound stand queried the service synchronously and failed a
healthy package (cordis applies plugins asynchronously).

The sound stand is verified **by corruption**: restoring the `ctx.logger` branch
turns three of its probes red **while the measure and selection stands stay fully green** — they inspect return values and cannot see muteness at all.

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
