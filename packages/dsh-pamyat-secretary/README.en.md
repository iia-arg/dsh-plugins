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

## Testing

    npm test

Three stands, 17 probes. The seam stand runs on a **real** platform Context
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

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
