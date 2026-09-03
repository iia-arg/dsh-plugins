# dsh-pamyat-nudzh

**Spend-side** accounting: how much context has been consumed and whether it is
time to nudge towards compaction. What to lift back into the conversation is the
neighbouring layer's job (budget) and is deliberately not duplicated here.

## 🔴 TWO DIFFERENT quantities — never conflate them

The package counts both and names each one aloud.

**OCCUPANCY of the window** — the input of the **last** call (`inputTokens` +
cache read + cache write). This is what the limit is compared against: it drops
after a compaction, as it should. The "time to compact" threshold is measured
**against occupancy**.

**TOTAL spend** — how many tokens went through the API across all calls. Every
call re-sends the whole conversation, so the total grows without bound and a
compaction never reduces it. It is the size of the bill, not the fullness of the
window.

    занято 900 из 1000 (порог 80%).
    Учтено 3 вызовов, ещё 2 БЕЗ ЧИСЛА от провайдера.
    Сумма расхода по всем вызовам при этом 4200, и она может быть только БОЛЬШЕ.

🔴 **Why this is written down.** Until 2026-09-03 the threshold was measured
against the TOTAL, and in production it printed "NOT LESS THAN 1,255,120 of
1,000,000" after **two** accounted calls — with no window overflow whatsoever.
That reads as "the context is a quarter past full"; it means "two calls cost that
much together". A percentage of the total crosses 100% and keeps climbing, however
many compactions happen.

The provider's number does not always arrive: the compaction contract marks the
field «Provider-reported token usage … **when emitted**», optional. The total is
therefore incomplete by construction, and the package never says "spent X".
Occupancy is taken from the last call that HAD a number: if calls without a number
arrived after it, occupancy may be stale — and the package says so aloud.

Hence an **asymmetric** rule: "already at least the threshold" is honest and is
stated; "there is room left" is not honest on incomplete data and is **never**
stated. `hvatitLi()` returns either `porog-pereyden` or `neizvestno` with a
reason — it has no "enough" value at all.

⚠️ **Silence from the nudge does not mean headroom.** It only means the threshold
was not crossed by the accounted part.

## Seam: what it counts and who asks

The package **counts by itself** rather than waiting to be called: a service
with no named consumer is always silent, and its silence is indistinguishable
from working correctly.

    hook:  session/event
    taken: assistant/message   — spend of one model call
           compaction/summary  — spend of the SUMMARY ITSELF

🔴 **Both events, not one.** The summary is written by the same model; subscribe
only to `assistant/message` and compaction becomes free — the most expensive
operation would go invisible precisely to the thing watching spend.

⚠️ There is **no `usage` event type** in the journal — that is a provider stream
chunk type and never reaches the journal. Subscribing to it would yield a
permanent zero, indistinguishable from "no spend". Verified against a live
journal: 0 occurrences.

🔴 **The payload lives in `data`, for both events.** By contract
`SessionEvent = { type, seq, time, data }` — `usage` sits inside `data`, not
next to `type`. The first draft read `event.usage` for `assistant/message` while
the neighbouring line correctly read `event.data?.usage`; the stand stayed green
because the fixtures were written with the same guess as the code.

⚠️ An **interrupted** call (`interrupted: true`) counts the same: the answer was
interrupted, the spend was not — the tokens are already paid for.

The threshold is queried by the greeting layer (C), which also shows the number
to the human.

## Who the measurement is addressed to

    hook:  agent/pre-step (waterfall)
    when:  exactly once per alarm cycle
    what:  a reminder to the model — "write down what must survive the compaction", with numbers

🔴 **A shout to the log and an injection into the context have different
addressees.** Until 2026-09-03 the package only called `console.error` when the
threshold was crossed: the line went to the human's journal and died there, while
the model it was addressed to received nothing. The mechanism shouted correctly,
but in a direction where nobody listens — from the outside "works" and "useless"
are indistinguishable: there is a trace, there is no consequence. The shout is
kept: it is what later proves the injection happened.

🔴 **Exactly once per cycle.** The alarm lives as long as occupancy stays above
the threshold; the injection is single and its flag is cleared BEFORE the message
is built. Clearing it after would leave the flag armed on an exception during the
build, and the reminder would arrive on every step until the compaction. The cost
is asymmetric: losing one reminder is cheaper than burying the conversation in
them. A new cycle starts where a new alarm starts — after occupancy returns below
the threshold.

⚠️ **Session boundary.** The package keeps ONE count per plugin: the session is
not distinguished in accounting. So both the threshold and the injection are
shared. If the agent ever runs two sessions at once, the reminder goes to
whichever one steps first — correct by number, wrong by address.

⚠️ **`predel: 0` → no injection at all**, just as there is no alarm: injecting a
reminder under an unknown limit would assert what the package does not know.

## 🔴 Arithmetic: three rules taken from the code

Measured 2026-09-03; method — reading `@deepseek-ai/dsh-llm`
(`TokenUsage` in `lib/types/types.d.ts`) and the `dsh-llm-deepseek` adapter
(`mapUsage`), both taken from the **live platform tree**, `dsh-llm` 0.1.0-rc.8 —
`dsh-llm` is absent from our contracts entirely.

1. **Input is the sum of three.** The type says: "Counts are DISJOINT:
   `inputTokens` is uncached input only; billed input = sum of the three"; the
   adapter computes `inputTokens = prompt_tokens − cacheRead`. Counting only
   `inputTokens` understates the spend the better the cache works — quietly, and
   in the pleasant direction.
2. **`reasoningTokens` is not a summand** — it comes from
   `completion_tokens_details.reasoning_tokens` while `outputTokens` is
   `completion_tokens`. It is a breakdown of the output; adding it double-counts.
3. **A missing number is not zero** — such calls are counted separately.

## Known about output

Shouts through `console.error` only. `ctx.logger` exists in cordis 4.0.1 and the
call succeeds, but the built-in exporter pushes into a 1000-entry ring buffer
inside the process and never reaches a stream. Checking that the channel exists
proves nothing: the function is there, the sound is not.

How to re-check: `test/stend-krik-zvuchit.mjs` raises the package in a separate
process under a real `Context` and waits for the line on its `stderr`.

## Testing

    npm test

Five stands, 49 probes; the first probe of each runs against a known-good
subject — if it is red, the stand is broken, not the package.

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1, `@deepseek-ai/schemastery` 3.18.1 and `@deepseek-ai/dsh-llm` 0.1.1-rc.2
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
