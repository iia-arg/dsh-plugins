# dsh-pamyat-vyvoz

Moving an agent's memory between databases: **exporting meaning, not copying a file**.

## Why this is separate from the nightly backup

The backup already exists — it answers "restore this machine to its previous state".
Export answers a different question: **"carry knowledge to a place where the schema
differs, the ids are its own, and none of our trust rules apply"**. A backup cannot be
poured into a live database; an export can.

## 🔴 Export FILTERS, and this is not over-caution

The secret filter sits at the **input**. Everything that entered the database before it
existed has never been checked. Measured on the live database 2026-09-04: of 42 records,
**31 predate the filter**. An unfiltered export would carry all of them out, bypassing
the very defence we built.

The number here is **absolute**: unchecked records do not become fewer over time, they
are merely diluted by new ones. In a month those same thirty-one will read as "5%,
almost all clean" — and an export would still carry out exactly thirty-one.

## 🔴 There are NO filter rules in this package

It keeps no list of secret classes. It asks the core: `najti_sekret()` — what was found,
`rezhim(klass)` — what to do about it.

The reason is measured. On 2026-09-04 a consumer who wrote an export with its own list
matched the core's list in **one class out of four**: a declared uuid, hex without a
declaration and every structural secret would have gone out. A copy diverges silently;
only comparing the two files reveals it.

### Three states, not two

`rezhim()` answers `zapiraet` (locks) · `pomechaet` (marks) · **`neizvesten`** (unknown).

The third is mandatory. For the core "does not lock" means "store with a mark" — a small
loss. Here the same answer means **release it outward**. One answer, two different
prices, so the consumer decides:

| mode | core | export |
|---|---|---|
| `zapiraet` | does not store | does not export |
| `pomechaet` | stores with a mark | exports, mark travels alongside |
| `neizvesten` | stores | **holds back** |

**The price of this choice is stated:** if a new marking class appears in the core and
nobody tells us, records of that class will start being held back. That will be visible
**in the report**, not through silence. A leak is irreversible, a delay is not.

## Fail-closed on both sides

Core failed to load · the function is missing from the exports · the answer has the wrong
shape — **refusal, and no export file is produced at all**. There is no outcome "export
without the filter for now": it would look like a successful dump while being a release
of unchecked material.

## What the export does NOT carry — and why

| not carried | why |
|---|---|
| record `id` | the number belongs to **this** database. Carrying ids would open trust laundering: a foreign record with a low number would land below our origin milestone and inherit the privilege of our old memory |
| operations journal | history of **this** machine: who wrote what, when, and why something was refused. On another machine it describes nothing |
| delivery queue | delivery state of **this** machine. Carrying it would make it a source of **double** delivery: records would reach shared memory twice, from two machines |
| schema settings | the origin milestone belongs to the receiving database and is taken from **its** id range |

These are decisions, not omissions. The "why" is written down so the next person does not
go and "finish the job".

## Import

* **also filters** — the file may come from a machine that had no filter;
* **assigns its own ids**; a foreign `id` in the file → **refusal**, database untouched;
* **record identity is the pair "source + creation time"**, so a double import does not
  duplicate memory;
* **atomic**: a broken fiftieth line yields **zero** new records, not forty-nine. Half an
  import is worse than a refusal — it looks like success and nobody comes back to finish it;
* **foreign schema version → refusal.** An unknown format must not be read by guesswork:
  a field may not merely be absent, it may have changed meaning;
* **a foreign constraint lands unconfirmed.** A constraint from another machine that takes
  effect silently is more dangerous than one that is skipped.

## What this package does not do

* does not replace the nightly database backup;
* does not merge knowledge or resolve contradictions between machines — two records about
  one subject stay two records;
* does not judge whether a record is true, only whether it contains a secret;
* is not mounted into the run and does not work on a schedule: moving memory has
  consequences on **another** machine and must not happen while nobody is watching.

## What its silence means

"Held back 0" means **"the filter found nothing that locks"**, not "there are no secrets":
the filter knows its own list of forms and will let an unfamiliar form through. The report
always prints this boundary next to the zero.

## Checks

`npm test` — walks the `test/` directory; the list is taken from disk. 21 probes: the
contract with the core (four corruptions), locking classes, unknown class, report without
content, foreign `ids`, foreign schema, atomicity, identity, constraint staging, and the
export→import round trip with a character-exact comparison.

Verified on a copy of the live database: 55 records, the round trip preserved content
**exactly**; sightedness control — a planted record with a key was held back and never
reached the file.
