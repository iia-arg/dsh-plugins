# dsh-pamyat

**A name for a set.** This metapackage carries no code — it declares which six
memory packages were built and checked TOGETHER, at which exact versions, and by
what means that was verified.

    dsh-pamyat-core      0.1.0-alpha.40   store, journal, write policy
    dsh-pamyat-omega     0.1.0-alpha.10   long-term memory provider
    dsh-pamyat-secretary 0.1.0-alpha.15    compaction summaries → records
    dsh-pamyat-byudzhet  0.1.0-alpha.8    incoming budget: what to lift back
    dsh-pamyat-nudzh     0.1.0-alpha.12    spend accounting: time to compact?
    dsh-pamyat-restore   0.1.0-alpha.18   knowledge back into context: post-compaction summary and briefing

## 🔴 Exact versions, no ranges

A name behind which different people get different sets is **worse than no name**:
such sets diverge silently. Hence exact versions, and a probe that rejects any range.

## 🔴 The composition is verified, not declared

`sostav.json` holds a version and a **subject sum** per package; the stand checks
them against the facts on disk on every run.

**"8 of 8" means the accounting adds up, NOT that the set is fit to publish.** The stand compares what is declared against what is on disk; the fitness of each member is outside what it can judge.

## How to re-check the sums

    summa-predmeta            file sum d4fc96426534a870

That is all. **There is deliberately no description of the method here.**

🔴 Any command written into documentation is a SECOND implementation of the
method. On 2026-09-03 we diverged three times in one hour on a single format:
field order inside the hashed line, the trailing newline, the sort locale. Each
fork changed the number silently, and none of them survives being described in
prose. A command in the docs drifts from the tool at its first edit — and nobody
notices, because **documentation is never executed**.

⚠️ Change the tool only under a NEW FILE NAME, never in place.

## Testing

    npm test

Eight probes; the first runs against a known-good subject.
