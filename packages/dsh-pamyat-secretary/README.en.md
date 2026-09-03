# dsh-pamyat-secretary

Compaction secretary: captures knowledge from what is about to become unreachable.

## Why

Compaction replaces a span of history with a single summary — what is shadowed is
no longer visible to the agent. Among the shadowed there are owner decisions,
constraints and promises. The secretary catches the summary event and stores it
**with a verbatim reference** to the shadowed range, so the knowledge can later be
checked against the session journal rather than taken on faith.

This package **fills** the memory. Until it exists, reading layers show emptiness
— and that emptiness is easy to mistake for a working memory.

## The seam: session events, not standalone hooks

Per platform types (`dsh-compaction`, `SessionEventMap`), the events
`compaction/start|summary|end` arrive as **session** events. The plan described
them as standalone hooks — an imprecision of retelling, verified by reading the
`.d.ts`. Subscription goes to `session/event` with a type filter.

🔴 **`inject` is mandatory.** On a live context (a plugin under runtime), reading
`ctx.<service>` without declaring it in `inject` **throws**: `cannot get property
"X" without inject`. On a bare context it silently yields undefined — so a probe
placed on the root Context is green for the wrong reason.

## What gets stored

| field | source |
|---|---|
| content | `summary` of the event, text blocks only |
| source reference | `<session>#<first>-<last>` from `shadowedSeqs` |

An event is **rejected** if it carries no summary text or no shadowed sequence
numbers. Rationale: knowledge without a source reference cannot be verified, and
unverifiable knowledge is worth less than its absence. Writing an empty string
instead would be the worst outcome: empty knowledge is indistinguishable from
missing knowledge.

## What the package does NOT do

* **does not write into the session** — it only reads events and takes the session id;
* performs no compaction of its own and does not touch the built-in one;
* does not distil with a separate model: it stores the platform's own summary,
  which is already written and need not be paid for twice.

## Message output

The package writes to the **plain stream**, not to the logger service. Reason,
measured: the platform's `ctx.logger` exists even without `inject`, calling
`.error` raises nothing — but the message **never appears** in the standard
stream, because the service has its own transport. "Reported" and "heard" diverge
silently. Under a service, stdout lands in the system journal, so nothing is lost.

## Configuration

| key | default | meaning |
|---|---|---|
| `klass` | `svodka-kompakcii` | class used when storing the summary |
| `vklyuchen` | `true` | switching off is legitimate — but LOUD |
| `distillyaciya` | `false` | extract KNOWLEDGE with a separate model (see below) |
| `putZhurnala` | `''` | session journal the shadowed slice is read from |
| `klyuchFajl` / `klyuchPass` | `''` | API key: a 0600 file, or a `pass` entry |
| `model` | `deepseek-v4-flash` | the cheap model used for distillation |
| `maxTokenovTem` | `32000` | budget for the topic-selection call |
| `maxTokenovStati` | `4000` | budget for one article |
| `predelTem` | `12` | how many topics per pass |
| `predelZnakov` | `200000` | transcript cap; above it the text is truncated OUT LOUD |
| `minTokenov` | `2000` | below this the slice counts as small and no call is made |

## Knowledge distillation (off by default)

The platform's own compaction summary is an **operational** record: it is stored as is
and stays local. Distillation is a different job: from the same shadowed slice a cheap
model extracts **knowledge** — decisions, lessons, constraints, mistakes, procedures,
observations, facts — and writes each as its own record with its own class. Neither
replaces the other.

Two stages, not one: first pick the topics, then write an article per topic. A merged
answer produces a "digest of the day" instead of knowledge — a decision, a lesson and a
procedure about the same thing are three separate pieces of knowledge.

🔴 **Off by default** because the mechanism calls a paid third-party API. Enabled
silently on someone else's machine, it would spend their money without asking.

🔴 **The key is never a command argument**: argv is visible in `/proc` to anyone on the
machine. Two sources, both argv-free — a file with mode 0600, or a `pass` entry.

**The shadowed slice comes from the event, it is not computed.**
`compaction/summary.data` carries `shadowedSeqs` — the exact list of records — and
`shadowedTokenCount`. A boundary computed from timestamps diverges from the real one
silently.

### What was measured here, not assumed

| measurement, 2026-09-03 | number |
|---|---|
| journal is multi-frame; `zstdDecompressSync` over the whole file | **126 bytes out of 27,922,455**, no error raised |
| manual frame-by-frame decompression | 27,922,455 bytes — byte-identical to `zstd -dc` |
| shadowed slice of a real compaction | 67 records of 67, 43,790 tokens, 168,361 chars |
| topic stage with a budget of 8,000 | `stop_reason: max_tokens`, no text block at all |
| the same at 32,000 | 9 topics, 72 s, 57,631 input tokens |
| one article | 18 s, 1,027 chars against a 1,000 limit |

🔴 The first row deserves a sentence of its own: the built-in decompression returns a
stub and **does not say so**. 126 bytes instead of 27 megabytes look like a short
journal, not like a failure. The streaming decompressor at least shouts "Unknown frame
descriptor"; the synchronous one stays quiet.

### A refusal names its cause

"Nothing to extract" and "could not finish reading" are different news and must not be
delivered the same way. The outcomes are separated by machine:

| outcome | when |
|---|---|
| `ok` | a `type: text` block arrived |
| `ne-dochitala` | no text block AND `stop_reason: max_tokens` — the budget went on reasoning |
| `pusto` | no text block with some other `stop_reason` — quoted verbatim, no cause invented |
| `ne-sprosili` | network, timeout, non-2xx HTTP — the call never happened |

Emptiness on the merits is the exact string `НЕТ РЕЛЕВАНТНОГО`, not a short answer:
without a machine-readable marker an empty answer is indistinguishable from a failed call.

## Testing

    npm test

Five stands, 45 probes. The seam stand runs on a **real** platform Context
(cordis at the stand's version, not from the registry): a stub is blind to the
platform's prohibitions — it yields any service and knows nothing of `inject`.

A subscription counts as working **only once an event has been received**, not
because subscribing raised no error.

## Assumptions

**MECHANISM proven:** the subscription receives the event, the parser extracts the
knowledge, the write reaches memory; an exception inside the handler does not tear
the event stream of other subscribers; switching off and skipping are announced aloud.

🔴 **CONTENT is not proven.** No live compaction occurred on the stand: all events
were assembled from platform types. That a real event has exactly this shape is
accepted from the `.d.ts`, not from observation.

## Limits

* The source reference points to a range; it does not guarantee anything will be
  found there — the session journal lives its own life and may be truncated.
* The package writes nothing into the session, so "does it survive a session
  reload" does not apply to it; for the memory database that check lives in the core.

## License

MIT

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1 on Node v24.19.0
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
