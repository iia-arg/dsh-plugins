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

Three stands, 21 probes; the first probe of each is run against a **known-good**
subject — if it is red, the stand is broken and the rest mean nothing. The very
first draft of the sound stand queried the service synchronously and failed a
healthy package (cordis applies plugins asynchronously).

The sound stand is verified **by corruption**: restoring the `ctx.logger` branch
turns three of its probes red **while the measure and selection stands stay green
at 9 of 9** — they inspect return values and cannot see muteness at all.

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
