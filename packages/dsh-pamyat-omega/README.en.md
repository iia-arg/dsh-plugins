# dsh-pamyat-omega

Long-term memory layer for DSH agents: writes knowledge to an external store over
MCP — **with delivery confirmation, not a report of dispatch**.

Complements `dsh-pamyat-core`. The layer is **optional**: memory must work without
it, which is why it ships as a separate package — not installed means no code, no
settings and no promises.

## The key property: dispatch is not delivery

The owner's requirement, verbatim: knowledge must not get stuck, it must reliably
cross over and be stored there. So after writing, the package **re-reads the
record by its identifier** and only then speaks of delivery.

| state | what happened | what to do |
|---|---|---|
| `dostavleno` | record found, content matches | nothing |
| `ne-najdeno` | we asked — the store says there is no such record | write again, no duplicate |
| `ne-otpravleno` | no link **before** the call: the send never happened | write again, no duplicate |
| `moglo-dojti-id-est` | id received, confirmation read failed | **call `proverit`**, do not write |
| `moglo-dojti-bez-id` | the call started, no id | **human review**: not decidable by machine |

🔴 **Five states, not three.** The earlier edition collapsed four different cases
into `ne-udalos-proverit`, leaving the caller unable to decide the one thing that
matters: **may this be retried by writing?** Retrying after "no link" is safe;
retrying after "the call started" creates a second copy of the knowledge — and
that duplicate is invisible, because it looks like knowledge and dissolves into
search. A missing delivery is visible in the queue; a duplicate is visible nowhere.

⚠️ **Boundary of `ne-otpravleno`.** It is set only where there was no link before
the call. Once the call has started the state is `moglo-dojti-*`, even on an
instant error: what reached the store is no longer known.

### `proverit({ id, obrazec })` — ask without writing

Returns `est` | `net` | `ne-proveryali`. The third outcome is mandatory: "could
not ask" and "no such record" have opposite cures — the first keeps the record in
the queue, the second permits a rewrite.

🔴 **The content sample is required, and this is not a formality.** Ids in replies
are truncated to eight characters, and the store may merge our record with a
similar one and return someone else's id. Without a sample the check **can never
answer `est`**, however many times it is called — so a missing sample is a named
refusal of its own, not a quiet "not checked".

## Three traps taken from the live service

1. **The endpoint needs a trailing slash.** Without it the service replies with a
   redirect and an empty body — which looks like silence from the store.
2. **The identifier comes back shortened.** The store issues twelve characters and
   returns eight. Matching the full string would report "not delivered" for a
   successful write.
3. **Another record under our identifier.** The store may return the identifier
   of a merged similar record — then "delivered" is true about knowledge that is
   not ours. Mandatory content comparison covers it.
4. **The answer is truncated by length (about a hundred characters), keeping
   line breaks.** Sample and answer are normalised before comparison.
5. **The answer also lists five similar records** with their own identifiers and
   texts. Only the `**Source:**` line is parsed — otherwise confirmation may
   match against somebody else's record.

Confirmation is a **read by identifier**, not a text search: the identifier does
not appear in the text at all, so searching for it finds nothing even after a
successful write.

## External contract: the service's markup

The parsing boundary relies on **someone else's markup**. Today the service
prints headings as `# ` and the similar-records list as `## N.` — only these
forms are parsed. A similar record under a `- ` marker would pass the boundary;
the live service does not produce that form, so the case does not reproduce —
**verified by method:** a live answer from the running OMEGA store was read by
eye on 2026-09-03 and contains no `- ` marker. A bare date would be useless
here: there would be nothing to re-check, and the next reader would simply
believe it. The method repeats — ask the store anything and read the raw answer.

🔴 **We do not own this markup.** If it changes, `SHABLON_SOURCE` must be
**re-measured against a live answer**, not patched by guesswork. The test stand
stays silent by construction: its samples keep the old markup and stay green.

## Configuration

| key | default | meaning |
|---|---|---|
| `adres` | — (required) | store endpoint, **with a trailing slash** |
| `tajmautMs` | `10000` | response timeout |

### What is deliberately NOT configurable

1. **Tool names and the "not found" marker** — someone else's protocol, read from
   its description rather than configured.
2. **The rule "unknown ≠ not delivered"** — a configurable collapse of outcomes
   means somebody will switch it on one day and receive a confident lie.

## Testing

    npm test

Four stands, 29 probes. Response samples are taken from the **live** service, not
invented: a stand built on invented answers pins down our assumptions instead of
the service's behaviour.

## Assumptions

**Verified (2026-09-02):** the service's answers when reading by identifier — an
existing record and a fabricated one differ; the shortened identifier; the
redirect on a slash-less endpoint; an event stream instead of plain JSON.

**Accepted without verification:** behaviour on a live platform node (not mounted
yet — that is the second acceptance step); behaviour on record merging (the branch
follows the store's description; no live merge was observed).

## Limits

* Confirmation travels **the same interface** as the write: it catches loss in
  transit and service failure, but not the case where the interface answers
  cheerfully over an empty store. The package has no independent cross-check —
  the database lives in another process.
* The package does not decide what to store, does not distil and does not delete.

## License

MIT

## What it was tested against

This package's test stands were run against `@deepseek-ai/cordis` 4.0.1 and `@deepseek-ai/schemastery` 3.18.1
This is a MEASUREMENT, not a compatibility promise: other versions were not run. The `peerDependencies` range uses `^` by semver contract, not by our measurement.
