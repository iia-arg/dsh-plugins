# Documentation: the `dsh-pamyat` memory pipeline and agent-to-agent mail (A2A)

> **The original is Russian** — [`MEMORY-AND-A2A.ru.md`](MEMORY-AND-A2A.ru.md); this file is a
> translation from Russian. Edits are made **in pairs**: change one file, change the other in the
> same commit.
> **Document version: 2026-09-04 (rev. 3 — §5.1.6 alpha.26/alpha.27 accepted; rev. 2 — §6.1 sender side, §5.1.6 alpha.25).** Written from the repository code as of that date; package
> versions are in table §1.3. Anything that depends on the state of the npm registry (`latest` /
> `alpha` tags) is **not** treated as stable in this document — see §7 "Installing" and §8
> "Release order".

This document is about **structure**: which packages make up the pipeline, which platform seams
they hook into, which services they give each other, which settings drive them, how they refuse and
how they are checked. How to **install** each package is in the package README; here is only what
you can understand by seeing all the parts side by side.

Terminology. Names of services, settings, classes and outcomes are given **as in the code** —
transliterated Russian (`pamyat`, `nudzh`, `byudzhet`, `zapisat`, `obyavlennyj`). A glossary is in
Appendix B. "The platform" = [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness);
a "seam" is a platform event or hook a plugin attaches to; a "shout" is the line a package prints
to `stderr` on refusal or on start-up.

---

## 1. What is here and who it is for

### 1.1. Two parts

**Memory** — the `dsh-pamyat` family, seven packages. The platform compacts a long conversation
into a summary, and that summary lives only in the process: restart, and it is gone. The family
gives an agent memory that survives compaction and restart, split into layers that each do one
thing and **say out loud what they cannot do**.

**Agent-to-agent mail (A2A)** — a way for agents on one machine, living under different system
users, to write to each other without breaking isolation. Two parts: `a2a-bus` (a spool directory,
a postman running as `root`, a timer) and the reading side inside `telegram-multiagent` (polling
the mailbox, feeding the letter into the agent's turn, replying to the owner's chat).

The parts are independent: memory works without mail, mail without memory. Together they give
what all of this was written for: an agent that remembers what it was doing after a restart and
can ask its neighbour.

### 1.2. Who should read what

- Someone **installing** the pipeline on their node — §2 (map), §7 (installing), §9 (checking).
- Someone **writing a neighbouring plugin** who wants to call the memory services — §3 (seams),
  §4 (services).
- Someone **releasing** new versions — §8 (release and acceptance order).
- Someone **debugging a refusal** — the "Refusals" part of each package card (§5) and §6.

### 1.3. Versions this document was written against

Versions from `package.json` in the repository working tree on the document date. This is **not**
the same as the `latest` tag in the registry — see §7.

| Package | Version in tree | Role in one line |
|---|---|---|
| `dsh-pamyat-core` | 0.1.0-alpha.23 (alpha.24 exists in the registry, see §5.1.6) | storage on `node:sqlite`, a journal of decisions, write policy, input filter |
| `dsh-pamyat-secretary` | 0.1.0-alpha.14 | takes the summary **before** compaction overwrites the history; knowledge distillation (off by default) |
| `dsh-pamyat-restore` | 0.1.0-alpha.16 | the reading side: summary back after compaction, briefing at start |
| `dsh-pamyat-byudzhet` | 0.1.0-alpha.7 | incoming budget: how much of the past to lift into context |
| `dsh-pamyat-nudzh` | 0.1.0-alpha.10 | spend accounting: window occupancy, nudging towards compaction |
| `dsh-pamyat-omega` | 0.1.0-alpha.9 | optional long-term layer over external storage via MCP |
| `dsh-pamyat` | 0.1.0-alpha.27 | the name for the set: which six, in exactly which versions, were checked together |
| `a2a-bus` | no version (not an npm package) | mailboxes, postman, timer |
| `telegram-multiagent` (`dsh-telegram-multiagent`) | 1.4.3 (1.5.1 in the registry, accepted; §6.3 describes 1.5.x) | Telegram channel; in this document — only its A2A part and the context commands |

---

## 2. Map of the pipeline

### 2.1. The life of one session

```
 process start
   │
   ├─ plugins come up: each prints a "podyom: …" (start-up) line with version and settings
   │
   ├─ first step after start ──► restore (layer C): briefing from memory under the byudzhet
   │                              budget, no more often than welcomeInterval per session
   │                              (mark on disk)
   │
   ├─ turn after turn:
   │     assistant/message ──► nudzh: account usage, recompute window occupancy
   │     agent/pre-step   ──► nudzh: if occupancy ≥ predel×dolyaTrevogi — ONE insert
   │                          "time to compact" (source.kind = plugin)
   │     /compact-status  ──► telegram-multiagent: how many tokens and how far to the threshold
   │
   ├─ platform compaction (by its threshold or by /compact):
   │     compaction/summary ──► secretary: summary + verbatim reference to the shadowed range
   │                              → pamyat.zapisat({klass:'svodka-kompakcii', …})
   │                              → core: input filter → policy → SQLite → journal
   │                              → (if omega is mounted) queue for the long-term layer
   │                            ──► nudzh: account the summary's usage
   │     compaction/end     ──► restore (layer B): on the FIRST step after — lift the record of
   │                              class svodka-kompakcii back into context
   │
   └─ process restart ──► everything in context is gone; everything in SQLite is not.
                          The next start begins with a briefing (layer C).
```

Three things that are not visible on the map but matter more than the map itself:

1. **The core (`core`) listens to nothing.** It does not know about compaction. Its only seam is
   `dispose` (close the database). Everything that enters memory enters through a call to
   `pamyat.zapisat(...)` from another package or plugin.
2. **Layers read each other through services**, not through events: `restore` calls `pamyat` and
   `byudzhetPamyati`; `secretary` calls `pamyat`; `core` calls `pamyatDolgovremennaya` if it is
   there. Who gives what and how it is taken — §4.
3. **Refusal is out loud, not silent.** Every layer prints a start-up line with version and
   settings, and on refusal — what exactly failed. Zero start-up lines means the package is
   **not mounted**, not that "all is quiet".

### 2.2. What lives where

| What | Where | Who writes | Who reads |
|---|---|---|---|
| memory records (`zapisi`), long-term queue (`ochered_dolgovremennogo`), decision journal (`zhurnal`) | one SQLite file, path `putBazy` (`core` setting) | `core` | `core`; through the service — `restore`, `secretary` |
| marks "when the briefing was given" | JSON `{ [sid]: timestamp }`, path `welcomeOtmetki` (`restore` setting), default `~/.dsh-pamyat-welcome-otmetki.json` | `restore` | `restore` |
| platform session journal | path `putZhurnala` (`secretary` setting) | platform | `secretary` (only for distillation) |
| external knowledge store | address `adres` (`omega` setting), MCP over HTTP | `omega` | `omega` (re-reading to confirm) |
| A2A letters | `/var/spool/a2a/<user>` (default `A2A_KOREN`), or `<a2aDir>/in`, `<a2aDir>/out` | sender, postman | `telegram-multiagent` |

---

## 3. Platform seams the pipeline hooks into

Exact names are from the code; "waterfall" means the hook first calls `next()` and edits the
**result** rather than replacing it.

| Seam | Who | What it does | Where in code |
|---|---|---|---|
| `session/event` type `compaction/summary` | `secretary` | parses `summary`, `shadowedSeqs`, `shadowedTokenCount`, `compactionId`; writes the summary into `pamyat` with source `<session>#<first>-<last>`; with distillation enabled — a separate pass | `secretary/src/index.js` |
| `session/event` types `assistant/message`, `compaction/summary` | `nudzh` | takes `event.data.usage`, computes the last call's input and the running sum | `nudzh/src/index.js` |
| `session/event` type `compaction/end` | `restore` | remembers that a compaction happened (by `session.id`, `compactionId`); the insert itself is on the next `agent/pre-step` | `restore/src/index.js` |
| `agent/pre-step` (waterfall, `prepend: true`) | `restore` | layer B: first step after `compaction/end` — insert the summary; layer C: first step after process start — briefing under budget | `restore/src/index.js` |
| `agent/pre-step` (waterfall) | `nudzh` | on threshold crossing — one reminder insert; on `decision.kind === 'reject'` or an aborted signal — nothing | `nudzh/src/index.js` |
| `dispose` | `core` | close the database | `core/src/index.js` |
| `session/event` types `goal/change`, `turn/start`, `turn/end`, `assistant/message` | `telegram-multiagent` | deliver answers to chat/channel, drop the question from the queue, reason for a turn error | `telegram-multiagent/src/index.js` |
| `command/run` (via the `commands` registry) | `telegram-multiagent` | `/compact` → the platform's own compaction; `/compact-status` → occupancy summary | same file |

**What is not in this table — and it is not an omission.** `core`, `byudzhet` and `omega` listen
to no event: they work on call. The platform has no separate `PreCompact`/`PostCompact` events —
compaction is visible only through `compaction/summary` and `compaction/end` inside
`session/event`. `telegram-multiagent` does **not** listen to compaction events at all: it merely
expands the `/compact` command into the name of the platform's own command, and executing it is
the platform's business.

**Inserting into context — only through the stock factory.** Both `restore` and `nudzh` insert a
message via `createUserMessage` from `@deepseek-ai/dsh-llm/message` with `source.kind = 'plugin'`:
`restore` puts the identifiers of the lifted records into `source.sections` under the names
`dsh-pamyat-restore#zapis-<id>`; `nudzh` uses `form: 'snapshot'`. Nobody writes to the session
directly.

---

## 4. Services: who gives what and who takes it

### 4.1. Service table

| Service (`ctx.provide`) | Given by | Methods | Taken by |
|---|---|---|---|
| `pamyat` | `core` | `dostupna()`, `pochemuNedostupna()`, `reshit(klass)`, `istolkovat(ishod, kanalEst)`, `zapisat({klass, soderzhim, istochnik?, podtverzhdenie?, vera?}) → id`, `otmetitOtkaz({klass, priroda, pochemu, istochnik?})`, `prochitat({klass?, skolko?})`, `svodka()`, `ocheredDostavki()`, `dostavitOtlozhennoe({predelPopytok = 5})` | `secretary` (via `inject`), `restore` (via `ctx.get`) |
| `pamyatDolgovremennaya` | `omega` | `dostupna()`, `pochemuNedostupna()`, `sohranit({soderzhim, tip = 'memory', metadannye = {}, kto = null}) → {sostoyanie, id, pochemu}`, `proverit({id, obrazec = null}) → {sostoyanie, pochemu}` | `core` (via `ctx.get`, optional) |
| `nudzhPamyati` | `nudzh` | `uchest(usage)`, `itog()`, `raskhodVyzova(usage)`, `hvatitLi()` | nobody in the family yet; open to neighbours |
| `byudzhetPamyati` | `byudzhet` | `edinicy()`, `ocenit(zapis)`, `sverit({nashe, platformennoe})`, `otobrat({zapisi, predel, poryadok, porogVery}) → {podnyato, otbrosheno, svodka}` | `restore` (via `ctx.get`, layer C) |

### 4.2. `inject` versus `ctx.get` — the family rule

The platform offers two ways to take a service. Declaring it in `inject` means the plugin **will
not come up** until the service exists; taking it with `ctx.get(name)` means the plugin comes up
and decides for itself what to do when the service is missing. The family uses both, and the
choice is deliberate:

- `secretary` declares `inject = ['pamyat']`: without the core the secretary has nothing to do,
  and it is better not to come up than to come up and silently lose summaries.
- `restore` and `nudzh` declare `inject = ['agents']` and take memory with `ctx.get('pamyat')`: if
  the core is missing, the layer comes up and **shouts** on every step where it should have
  inserted — more visible than a plugin absent from the list.
- `core` takes `ctx.get('pamyatDolgovremennaya')`: the long-term layer is optional by design.
- `telegram-multiagent` **deliberately does not declare** `compaction` or `tokenMeter` in
  `inject`: declaring them drove a copy of the platform into `pending: waiting for service:
  compaction`, and the link to the owner never came up at all. The services are taken with
  `ctx.get(...)`.

A trap recorded in the code: accessing `ctx.<service>` without `inject` throws `cannot get property
"…" without inject`. Read with `ctx.get('…')`.

### 4.3. What the services guarantee and what they do not

- `pamyat.zapisat` returns the `id` of a **write decision**, not proof of delivery to the long-term
  layer. What remained undelivered is answered by `ocheredDostavki()`.
- `pamyatDolgovremennaya.sohranit` confirms delivery by **re-reading** the record by identifier,
  not by an "accepted" reply. But the re-read goes through the same interface as the write: it
  does not catch an empty store fronted by a cheerful interface.
- `nudzhPamyati.hvatitLi()` **never** answers "enough" — only `porog-pereyden` (threshold crossed)
  or `neizvestno` (unknown). Silence from the nudge does not mean headroom.
- `byudzhetPamyati.otobrat` counts in **its own** measure (`оценка наша`, "our estimate", 4
  characters per unit), not in platform tokens. If the platform's estimator changes, the limits
  drift silently.

---

## 5. Memory packages — one by one

Every card follows one scheme: purpose → seams and services → settings → refusals → boundaries →
checking. Installation is in the package README; here is only structure and contract.

### 5.1. `dsh-pamyat-core` — storage, journal, policy, input filter

**Purpose.** The agent's working memory: local storage on `node:sqlite`, a journal of write
decisions (including refusals and their nature), a policy for "which record classes need
confirmation", and an input filter that keeps secrets out of memory. Zero runtime dependencies;
Node ≥ 22.

**Seams and services.** Listens only to `dispose` (close the database). Provides `pamyat` (§4.1).
Takes `ctx.get('pamyatDolgovremennaya')` if `dsh-pamyat-omega` is mounted. Inserts nothing into
context, touches no network, declares no model tools.

#### 5.1.1. Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `putBazy` | string | required | path to the SQLite file |
| `agent` | string | required | agent name (written into the journal and the records) |
| `sprashivat` | string[] | `[]` → effectively `['ogranichenie','navyk']` | classes that require confirmation. **An empty list does not switch asking off** — the policy default is used |
| `klassyZnaniy` | string[] | `['reshenie','urok','vyvod','ogranichenie','oshibka','poryadok','nablyudenie','fakt']` | classes that go to the long-term layer (if present) |
| `chtenieSkolko` | number | `20` | how many records `prochitat` returns by default |
| `zhurnalSkolko` | number | `20` | how many journal lines `svodka` returns |
| `otvechayushchegoNet` | boolean | `false` | nobody on the node can confirm: `ask` classes are written with a mark in the record instead of being refused |

What is **not** a setting (and why): table names and the database schema; the platform's literal
confirmation outcomes (`rejected`/`cancelled`/`unavailable`); the behaviour on refusal — "no
source → do not write, and shout". A configurable fail-closed would be a protection that can be
switched off.

#### 5.1.2. What is in the database

One SQLite file, three tables:

- `zapisi` — records: `klass`, `soderzhim`, `istochnik`, `vera`, `sozdano`, plus two mark fields:
  `podozrenie` (JSON `{klass, pozicia}` — the filter found something secret-like but wrote the
  record) and `ochistka` (JSON — invisible characters were cleaned out of the text). Both are
  parsed into objects on read.
- `ochered_dolgovremennogo` — what has not yet been delivered to the long-term layer; read by
  `ocheredDostavki()`, drained by `dostavitOtlozhennoe()`.
- `zhurnal` — `kogda, agent, klass, ishod, priroda, pochemu, istochnik`. Outcomes: `zapisano`,
  `otkloneno`, `ostalos-v-operativnom`, `ne-udalos-proverit`, `ne-otpravleno`,
  `moglo-dojti-bez-id`, `dostavleno`, `snyato-s-ocheredi`.

The journal records the **decision**, not the delivery. "Did it reach the long-term layer" is a
question for the queue.

#### 5.1.3. Write policy

`reshit(klass)` → `{reshenie: 'auto' | 'ask', pochemu}`. Classes in `sprashivat` require
confirmation; with `otvechayushchegoNet: true` such a record is written with the mark "nobody to
confirm", otherwise without confirmation it is refused with code `PAMYAT_TREBUET_PODTVERZHDENIYA`.
`istolkovat(ishod, kanalEst)` translates the platform's confirmation outcome into a decision
`{zapisyvat, priroda, pochemu}`; an unknown outcome is a refusal `PAMYAT_NEIZVESTNYJ_ISHOD`, not a
guess.

#### 5.1.4. The input filter: classes, modes, order

The filter (`src/filtr-vhoda.js`, function `najti_sekret(tekst)`) runs on **every** write and
returns `{klass, pozicia}` or `null`. It **never** returns the value or the fragment — so that the
finding cannot end up in the journal.

**Two modes, and the mode is chosen by the unambiguity of the sign.** A sign that can be nothing
but a secret **locks** (the record is refused; the journal gets `otkloneno` with nature
`sekret-na-vhode`; the caller gets refusal `PAMYAT_SEKRET_NA_VHODE`). A sign that may be a secret
or something else **marks** (the record passes with a `podozrenie` field; the journal gets
`zapisano` with nature `podozrenie-na-sekret`). In both cases only the class and position are
printed.

| Class | Sign | Mode |
|---|---|---|
| `strukturnyj:PEM` | header `-----BEGIN … PRIVATE KEY-----` | locks |
| `strukturnyj:JWT` | three base64url parts joined by dots, starting with `eyJ` | locks |
| `strukturnyj:sk-`, `:github`, `:aws`, `:slack` | vendor key prefixes (`sk-`, `gh?_`, `AKIA`, `xox?-`) | locks |
| `strukturnyj:dsn` | `postgres://user:pass@`, `mysql://`, `mongodb://` with a password | locks |
| `uuid-obyavlennyj` | a UUID preceded, within a 40-character window, by a declaration word | locks |
| `obyavlennyj` | a declaration word (`password`, `token`, `secret`, `api_key`, `key`, `пароль`, `ключ`, …) immediately before `:`/`=` and a value ≥ 6 characters | locks |
| `hex-bez-obyavleniya` | a hexadecimal string of length 24…128, **except** 32/40/64 (those are hashes) | locks — a **known deviation**, see below |
| `entropiya` | ≥ 20 characters, ≥ 3 alphabet classes, entropy ≥ 3.5 bits/char | marks |

Order of checks: structural → uuid after declaration → for each candidate `[A-Za-z0-9_]{6,}`:
skip paths → declaration → hex → entropy. The order matters: since hex comes before entropy, a
hexadecimal finding cannot "drift into entropy" and get lost among the marks.

**A deviation from the principle, known on the document date.** The class `hex-bez-obyavleniya`
locks, although its own comment in the code says "a hash and a key are indistinguishable by
appearance" — i.e. the sign is ambiguous and by the principle should mark. Moving it to the marking
mode is part of the next release. On a live corpus (3,661 records) the class fired 0 times, and the
class's reachability was checked with planted probes: zero means "no subject", not "the rule does
not work".

Thresholds that are constants in the code, not settings: `DLINA_ENTROPIJNOJ = 20` (marked "do not
raise": a live key is exactly 20 characters), `ENTROPIYA_PORog = 3.5`, `DLINA_OBYAVLENNOGO = 6`,
`OKNO_OBYAVLENIYA = 40`. Canary: on every write the filter runs a known secret and known invisible
characters through itself; if it does not catch its own canary — refusal `PAMYAT_FILTR_NEISPRAVEN`,
the write does not proceed.

#### 5.1.5. The word boundary in the declaration list — a lookbehind, not `\b`

The declaration list is one regular expression with flags `iu`, ending in `\s*[:=]\s*["']?$`
(the declaration must stand **immediately** before the value). A boundary is needed to the left of
the word, otherwise `monkey=` and `hotkey=` read as `key=`, and `отключ=` as `ключ=`.

**Why not `\b`.** In JavaScript `\b` is defined through `\w = [A-Za-z0-9_]`. Before a Cyrillic word
there is never a "boundary" — `\b` silently switches off the four Russian words of the list
(`пароль`, `ключ`, `токен`, `секрет`), and a stand with Latin probes will not show it. So the
boundary is a negative lookbehind over Unicode classes:

```js
// alpha.24 (registry):        (?<![\p{L}\p{N}])   — a letter or digit of any alphabet
// alpha.22–alpha.23 (in tree): (?<![\p{L}\p{N}_])  — the same plus underscore — a DEFECT
```

An example of why the underscore in the exclusion class is a defect: the name `OPENAI_API_KEY=`
contains `API_KEY`, but before `API` stands `_`; if `_` is forbidden, there is no match, and every
name of the form `NAME_API_KEY=`, `NAME_TOKEN=`, `NAME_SECRET=` passes into memory without a
trace. An example of why the boundary is still needed: in live tunnel configs `PublicKey =` (public,
must not be caught) and `PresharedKey =` (a shared key, must be caught) differ only in the word
inside; without a boundary a bare `key` locks both.

**The second consequence of the boundary — a word glued to a prefix.** A boundary before the whole
list also cuts live names where the word is glued on without a separator: `cftoken=`,
`authtoken=`, `dbpassword=` — with a weak value they go into memory **silently** (`null`), with a
strong value they are only marked. A separator saves (`CF_TOKEN=` is caught), gluing kills. Hence
the composition of the next release: the boundary **selectively** — only before
`key`/`api-key`/`apikey`/`pin`/`psk` and the four Russian words (these have live homonyms); no
boundary before `token`/`secret`/`password`/`passwd`/`pwd`/`credential` (no homonyms were found in
live names, but prefixes exist) — plus `preshared[-_ ]?key` in the list. This reasoning must live
**in the code, next to the list**: the next reader will "fix" an asymmetric list for uniformity if
it is not explained.

**A rule for anyone writing about the filter.** An explanation of a defect is indistinguishable
from the defect: a memory record or a letter containing a sample of the form "declaration word =
plausible value" will be rejected by the filter. In samples — only an explicit placeholder such as
`<value>`.

#### 5.1.6. Filter history for 2026-09-04 and the state on the document date

Nine core versions came out in one day (alpha.16 → alpha.24), almost all about the filter. Briefly,
so that a reader understands how the versions differ and does not install by tag:

| Version | What changed | Known defect |
|---|---|---|
| alpha.17 | the form `word=value` was not caught at all (`pwd: X` was refused, `pwd=X` passed) | — |
| alpha.19 | candidate alphabet narrowed to `[A-Za-z0-9_]` (18 false positives → 0) | — |
| alpha.20 | modes assigned by class: structural/declared/hex → lock, entropy → mark | bare `key` was not in the list: `key=<secret>` went into memory |
| alpha.21 | `key` in the list | no left boundary: `monkey=`, `hotkey=`, `отключ=` — false refusals |
| alpha.22, alpha.23 | left boundary; all nine stands in `npm test` | **the exclusion class includes `_`** — every `NAME_API_KEY=`, `NAME_TOKEN=`, `NAME_SECRET=` is lost |
| alpha.24 | boundary without `_` | no `preshared` in the list (`PresharedKey=` → mark/miss); words glued to a prefix (`cftoken=`, `authtoken=`, `dbpassword=`) → miss |
| alpha.25 | `preshared[-_ ]?key` in the list; the boundary **selectively** (only before `key`/`api-key`/`apikey`/`privkey`/`private-key`/`preshared-key` and the four Russian words; no boundary before `token`/`secret`/`password`/…); quote after the word (JSON); a table of three boundary editions with numbers — in the code comment. **Accepted for the `latest` tag** | the variable name (`BITRIX24_CLIENT_SECRET=`) itself becomes an entropy candidate before the declaration rule → mark instead of lock; hex still locks |
| alpha.26 | `pin` and `psk` got the boundary (in alpha.25 they had none: `spin=`, `dropin=`, `sitepin=`, `whitelistpsk=` — 4 false refusals out of 4); the reasoning for the asymmetric list — in the code | **accepted** 2026-09-04 20:1x (subject sum `6c8cf7370443b31c`); published under the `neprinyato` tag — the first release where `latest` did not move |
| alpha.27 | `hex-bez-obyavleniya` **marks instead of locking** (only `obyavlennyj`/`uuid-obyavlennyj`/`strukturnyj:*` lock; the reasoning sits in the code next to `strogo`); the storage refusal reason is non-empty even with an empty `message` (debt 100); the filter file is byte-identical to alpha.26 | **accepted for deployment** 2026-09-04 21:0x as a frozen copy from the sadik disk, subject sum `70c8fb7ee297a7f0` (not in the registry at that moment; the release must produce the same sum); sighted 3/3 (corruption "hex back into the lock set" → the stand turns red), controls 6/6. **Live at Iskra since 18:25:06Z.** Debts for alpha.28: a declared secret whose value contains `-`, `.` or symbols passes silently (`api_key=sk-…`, `password = Xk9#…` → `null`, while `password=Qwerty123` is locked) — first; three stands crash at the recipient without the platform instead of declaring blindness; the three marking-mode rules |

On the document date (rev. 3, 21:3x MSK) the core's `latest` tag points at alpha.25; alpha.26 sits under `neprinyato`, alpha.27 is accepted for
deployment by its on-disk sum and is live at Iskra — the tag moves to it after a registry release with the same sum. Alpha.25 was the first version
that day whose tag was set **after** acceptance rather than before. The `dsh-pamyat` set alpha.28 pulls alpha.24.
Observed on the same date: the `latest` tag moves **by itself** on publish — the rule "the tag is set
by acceptance" works only after the publish wrapper is changed (publish under a separate tag).
**A tag is not fitness** — see §7.

#### 5.1.7. Refusals

Format: `[dsh-pamyat-core <version>] <message>` to `stderr`. The start-up line is always printed:
`подъём: база <path>, классы знаний в долговременную память: <list or «ни одного»>` ("start-up:
database …, knowledge classes to long-term memory: …"); if the database did not open — the suffix
`— НО ХРАНИЛИЩЕ НЕ ОТКРЫТО, см. строку ниже` ("BUT THE STORE IS NOT OPEN, see the line below") and
the reason. Codes `e.code`: `PAMYAT_NEDOSTUPNA`, `PAMYAT_NET_PUTI`, `PAMYAT_BAZA_NE_OTKRYLAS`,
`PAMYAT_NEPOLNAYA_ZAPIS`, `PAMYAT_VERA_NEGODNA`, `PAMYAT_NET_KLASSA`,
`PAMYAT_TREBUET_PODTVERZHDENIYA`, `PAMYAT_ZAPIS_NE_RAZRESHENA`, `PAMYAT_SEKRET_NA_VHODE`,
`PAMYAT_NEVIDIMOE_V_SLUZHEBNOM` (invisible characters in `klass`/`istochnik` — locks),
`PAMYAT_FILTR_NEISPRAVEN`, `PAMYAT_NEIZVESTNYJ_ISHOD`.

**Checking.** `npm test` → `node test/vse-stendy.mjs`: the runner walks `test/stend-*.mjs` itself
(nine stands), exit codes `0` / `1` mismatch / `2` blindness or no stands found. Caveat from
CHANGELOG alpha.23: an empty `stend-*.mjs` file would be counted green by the runner.

---

### 5.2. `dsh-pamyat-secretary` — the summary before it is overwritten

**Purpose.** Catches `compaction/summary` and puts the summary into memory with a verbatim
reference to the shadowed range — `<session>#<first seq>-<last seq>` — so the knowledge can be
checked against the session journal. Additionally (off by default) it distils **knowledge** from
the same slice with a separate cheap model and writes each item under its own class.

**Seams and services.** `session/event` filtered by `event.type === 'compaction/summary'`; reads
`summary`, `shadowedSeqs`, `shadowedTokenCount`, `provider`, `model`, `compactionId` from the
event. `inject = ['pamyat']` — does not come up without the core. Provides nothing. For
distillation it reads the session journal file (`putZhurnala`) and goes over the network to the
model API (`POST …/v1/messages`).

#### Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `klass` | string | `'svodka-kompakcii'` | class of the summary record; `restore` looks the summary up by the same name (`klassSvodki`) |
| `vklyuchen` | boolean | `true` | `false` is legal, but shouts on start-up |
| `distillyaciya` | boolean | `false` | whether to extract knowledge with a separate model |
| `putZhurnala` | string | `''` | session journal file (needed only for distillation) |
| `klyuchFajl` / `klyuchPass` / `klyuchOkruzhenie` | string | `''` | API key source: a 0600 file / a `pass` entry / the **name** of an environment variable. Order when several are set: file → pass → environment; a source that is set but unreadable is **not** replaced by the next one |
| `model` | string | `'deepseek-v4-flash'` | distillation model |
| `maxTokenovTem` | number | `32000` | budget of the topic-selection stage |
| `maxTokenovStati` | number | `8000` (README says 4000 — outdated) | budget of one article |
| `predelTem` | number | `12` | topics per pass |
| `predelZnakov` | number | `200000` | transcript limit |
| `minTokenov` | number | `2000` | below — the slice is small, no call |

Not a setting: the limit of consecutive non-final failures (`PREDEL_PODRYAD = 3` in the code — "a
setting is born together with its consumer"), the depth of slice memory (`20`), the API address
(one default in the code).

#### Refusals

Format `[dsh-pamyat-secretary <version>] …`. The start-up line names the class and the state of
distillation: `ВЫКЛЮЧЕНА настройкой` (disabled by setting) / `взведена: модель …, журнал задан,
ключ из …` (armed: model, journal set, key from …) / `ВКЛЮЧЕНА, НО НЕ ГОТОВА — заход не начнётся:
<what is missing>` (enabled but not ready). No `e.code` of its own: the whole event handler is in
`try/catch`, a failure is a shout, not an exception. Machine outcomes of a distillation pass:
`zahod-uzhe-byl`, `net-diapazona`, `srez-mal`, `net-zhurnala`, `net-rechi`, `net-klyucha`,
`temy-ne-razobrany`, `temy-pusty`, `podryad-otkazov`, `ok`.

Known and recorded in CHANGELOG: the package is mounted in one process **several times** (three
times on one node), and the event is handled once regardless — why is not established; since
alpha.14 there is a per-slice pass counter so that duplication would be visible. The production
defect of alpha.10 (`Cannot access 'rashod' before initialization` on the HTTP 402 branch) slept
while the provider had money: the probes checked a link, not the joint between links.

**Boundaries.** Does not write to the session; does not do its own compaction; the source reference
names a range but does not guarantee that anything will be found under it. **Checking:** `npm test`
— a loop over `test/stend-*.mjs` (seven stands), code aggregation: `1` outranks `2`.

---

### 5.3. `dsh-pamyat-restore` — the summary back, and a briefing at start

**Purpose.** The reading side. Layer B: on the first step after `compaction/end`, lift the record
of class `klassSvodki` back into context. Layer C: on the first step after process start — a
briefing from memory under the `byudzhetPamyati` budget, no more often than `welcomeInterval` per
session (a mark on disk).

**Seams and services.** `session/event` (`compaction/end`) and `agent/pre-step` (waterfall,
`prepend: true`). `inject = ['agents']`; memory — `ctx.get('pamyat')`, budget —
`ctx.get('byudzhetPamyati')` (both optional at start-up; their absence is a shout on every step
where an insert should have happened). Protection against double mounting:
`globalThis.__pamyatRestore`.

#### The decision per record

`decide(record, config, now)` → `{decision: 'use' | 'verify' | 'ignore', reason}`. Trust and time
are read **by an explicit branch before any comparison**: a missing number never becomes zero.
Order: record time unknown → `verify`; older than `ignoreAfterMs` → `ignore`; trust not measured →
`verify` (not "below threshold" — `null < 0.7` would be `true`, and the number would lie); trust
below `useVeraThreshold` → `verify`; otherwise `use`. The reason is always printed and cannot be
disabled.

#### Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `restoreEnabled` | boolean | `true` | layer B |
| `welcomeEnabled` | boolean | `true` | layer C |
| `welcomeBudget` | number | `800` | briefing budget in characters |
| `welcomeInterval` | number, ms | `86400000` | no more than once a day per session |
| `welcomeOtmetki` | string | `~/.dsh-pamyat-welcome-otmetki.json` | where to remember when the briefing was given |
| `ignoreAfterMs` | number, ms | `604800000` (7 days) | older — `ignore` |
| `useVeraThreshold` | number | `0.7` | below — `verify` |
| `klassSvodki` | string | `'svodka-kompakcii'` | the class under which the summary is looked up (= the secretary's `klass`) |

On the document date the package README names five keys out of eight (`welcomeInterval`,
`welcomeOtmetki`, `klassSvodki` are missing) — a known discrepancy.

#### Refusals

The only output path is `stderr`, format `[dsh-pamyat-restore <version>] …`. Start-up line:
`подъём: restore=… welcome=… бюджет=… ignoreAfterMs=… useVera=…`. No exceptions or `e.code` of its
own — every failure becomes a shout and a `return`. Key ones: `🔴 служба памяти недоступна … —
инъекция пропущена` (memory service unavailable — insert skipped); `компакт был, но записи класса
«…» в памяти нет — вставлять нечего` (there was a compaction, but no record of class … in memory —
nothing to insert); `🔴 бюджет отказал (…) — брифинг строится БЕЗ предела` (budget failed — the
briefing is built WITHOUT a limit); `отметка о брифинге НЕ сохранена … — следующий подъём даст
брифинг снова` (briefing mark NOT saved — the next start will brief again).

From CHANGELOG: before alpha.14 the welcome hook (`turn === 1 && step === 1`) fired once in the
lifetime of a live session that survives restarts — the briefing was **never** given; the cure is
a time limit and a mark on disk. alpha.16: identifiers of lifted records moved into
`source.sections` (`dsh-pamyat-restore#zapis-<id>`), because `data.id` is the message id, not the
record id, and an extra field in `source` may be silently stripped.

**Boundaries.** Neither performs nor cancels compaction; does not guarantee that the model will
heed the insert; in layer B the budget is deliberately not called (the summary is lifted whole).
**Checking:** `npm test` — three stands (`stend-restore`, `stend-readme`, `stend-krik-zvuchit`);
the first needs the environment variables `DSH_PERSIST` and `DSH_SESSION` with paths to the
platform modules, without them — blindness, code `2`.

---

### 5.4. `dsh-pamyat-byudzhet` — the incoming budget

**Purpose.** Selects records under a limit and says what the caller lost. Counts in **its own**
measure — "our estimate", 4 characters per unit (`Math.max(1, ceil(len/4))` over
`soderzhim + klass + istochnik`) — not in platform tokens. Context spend is not its business.

**Seams and services.** Listens to nothing, works on call. Provides `byudzhetPamyati` (§4.1).
Called by `restore` in layer C.

#### Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `predel` | number | `2000` | lift limit in units of its own measure; `0` — lift nothing (legal, but shouts) |
| `poryadok` | string | `'svezhest'` | importance: `svezhest` (freshness) or `vera` (trust); an unknown value is a refusal with the list, not a silent fallback |
| `porogVery` | number | `0.5` | below — trust is considered low; **only for explaining** a drop, not for selecting |

Not a setting: the measure itself (constant `SIMVOLOV_NA_EDINICU = 4`); the set of orders; the
record's "warmth".

#### Warmth — an instrument, not a rule

The package computes a record's "warmth" (half-life 14 days, cold threshold 0.25) and prints the
distribution on every selection, but **it does not affect selection**. This is declared a
hypothesis: two measurements showed that ordering by warmth is identical to freshness, and the
threshold cuts nothing. The numbers are printed so that the hypothesis can one day be tested on a
live corpus, not so that decisions are made on them.

#### What `otobrat` returns

`{podnyato, otbrosheno, svodka}`, where `svodka` contains `prosili`, `podnyato`, `otbrosheno`,
`cena`, `predel`, `poryadok`, `edinicy: 'оценка наша'`, `prichiny[]` (why dropped: "does not fit
whole" — the price of one record exceeds the limit; "did not fit into the remainder by order"),
`svoystva[]` (with low trust; with unmeasured trust — **this is not zero**; cold; with unmeasured
warmth — **this is not cold**) and `teplo{…}`. Reason is separated from property on purpose:
"dropped for trust" and "among the dropped there are some with low trust" are different claims.

#### Refusals

Format `[dsh-pamyat-byudzhet <version>] …`. Start-up: `подъём: предел <N> ед., порядок «<P>», порог
веры <V>. Тепло считается и печатается, но на отбор НЕ ВЛИЯЕТ (прибор, не правило).` ("start-up:
limit N units, order P, trust threshold V. Warmth is computed and printed but does NOT affect
selection (an instrument, not a rule)"). On a drop: `поднято НЕ ВСЁ: просили <A>, подняли <B>,
отброшено <C> — ПРИЧИНЫ: … Цена подъёма <cena> из <predel> — единицы «оценка наша», НЕ токены
платформы.` ("NOT everything lifted: asked A, lifted B, dropped C — REASONS: … Lift price cena of
predel — units 'our estimate', NOT platform tokens"). No `e.code` of its own — bare `Error`s with
text. A measurement on a live database (2026-09-04): 7 of 23 dropped records were compaction
summaries priced 4008…4841 against a limit of 2000, i.e. a whole summary does not fit into the
briefing by construction.

**Boundaries.** `sverit({nashe, platformennoe})` returns the discrepancy and **does not correct**
the measure. If the platform's estimator changes, the limits drift silently. **Checking:**
`npm test` — four stands (`stend-mery`, `stend-otbora`, `stend-readme`, `stend-krik-zvuchit`),
39 probes.

---

### 5.5. `dsh-pamyat-nudzh` — spend accounting and nudging

**Purpose.** Counts **window occupancy** (the last call's input) and the running sum of spend per
session; on crossing the threshold — one reminder insert into context. What to lift back is not
its business.

**Seams and services.** `session/event` (`assistant/message`, `compaction/summary` —
`event.data.usage` is taken from both); `agent/pre-step` (waterfall). Provides `nudzhPamyati`. The
insert is `createUserMessage` with `source: {kind: 'plugin', plugin, form: 'snapshot', sections}`.

#### Arithmetic — why occupancy, not the sum

`input = inputTokens + cacheReadTokens + cacheWriteTokens`; `reasoningTokens` is not a summand (kept
for reference as `izNihRassuzhdenie`). The threshold is compared with the **last call's input**,
not the session sum: the sum grows without bound and compaction does not reduce it — on a
production case this gave "NOT LESS THAN 1,255,120 of 1,000,000" after two calls (CHANGELOG
alpha.7). A `usage` without a number (`undefined`/`null`) is counted separately (`bezChisla`), not
as zero.

Caveat from the code: right after compaction the occupancy shows the **old high** number — the
input of `compaction/summary` is taken before the squeeze. Nothing to cure it with; one needs to
know.

#### Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `predel` | number | `0` | context limit in provider tokens; `0` — limit unknown: spend is counted, there is **no** alarm and no insert |
| `dolyaTrevogi` | number | `0.8` | fraction of the limit after which it is time to nudge |

Not a setting: the composition of the sum; the asymmetry of the answer (`hvatitLi()` will never
say "enough"); the one-time nature of the nudge.

#### Refusals

Format `[dsh-pamyat-nudzh <version>] …`. Start-up: `подъём: предел <N> ток., доля тревоги <D>
(порог <…> ток.). Числитель — занятость ПОСЛЕДНЕГО вызова, не сумма за сессию.` ("start-up: limit
N tokens, alarm fraction D (threshold … tokens). The numerator is the occupancy of the LAST call,
not the session sum"). With `predel: 0` — a separate line "context limit NOT SET … This is a
setting, not a breakage". The alarm names the unit next to the number; clearing the alarm —
"occupancy is back under the threshold … looks like a compaction went through". No `e.code` of its
own.

**Boundaries.** Silence from the nudge does not mean headroom. One counter per plugin — sessions
are not distinguished: the reminder goes to whichever session steps first (right by number, wrong
by address). **Checking:** `npm test` — four stands; the fifth, `stend-vstavki.mjs` (6 probes about
the insert), exists on disk but is not in `scripts.test` — a known discrepancy.
`@deepseek-ai/dsh-llm` is in `peerDependencies` but not in `devDependencies`: without a manual
install the stands exit with code 2.

---

### 5.6. `dsh-pamyat-omega` — a long-term layer over MCP (optional)

**Purpose.** Writes knowledge to an external store reachable over MCP and **confirms delivery by
re-reading** the record by identifier, not by a send report. Not installed — no code, no settings,
no promises: the core works without it.

**Seams and services.** Listens to nothing. Provides `pamyatDolgovremennaya` (§4.1); taken by
`core`. Network: `POST config.adres`, JSON-RPC 2.0 `tools/call`, the reply is an event stream
(`data: {…}`), timeout `AbortSignal.timeout(tajmautMs)`. Two store tools: write, and read similar
by identifier; the tool names are someone else's protocol, not a setting.

#### Five delivery states

`sohranit()` returns `sostoyanie ∈ dostavleno | ne-najdeno | ne-otpravleno | moglo-dojti-bez-id |
moglo-dojti-id-est` (delivered / not found / not sent / may have arrived, no id / may have arrived,
id present). The rule: **"don't know" ≠ "not delivered"** — if a reply came but the identifier could
not be parsed, the state is "may have arrived", and the record stays in the core's queue until it
is resolved, rather than being lost or blindly duplicated. `proverit({id, obrazec})` compares the
first 40 characters of the normalised content; **without `obrazec` it can never answer `est`**
(present) — a named limitation, not a defect.

#### Settings

| Key | Type | Default | Meaning |
|---|---|---|---|
| `adres` | string | required | address of the store endpoint; **the trailing slash is mandatory** (otherwise `OMEGA_ADRES_BEZ_SLESHA`) |
| `tajmautMs` | number | `10000` | reply wait limit, ms |

Not a setting: the store's tool names; the "record not found" marker in the reply; the rule "don't
know ≠ not delivered"; content comparison on confirmation (with it `false`, confirmation answered
"delivered" for someone else's record).

#### Refusals

Format `[dsh-pamyat-omega <version>] …`. Start-up: `подъём: адрес <adres|НЕ ЗАДАН>, предел ожидания
<N> мс` ("start-up: address … | NOT SET, wait limit N ms") (+ ` — связь НЕ создана, см. строку
выше`, "link NOT created, see the line above"). Codes: `OMEGA_NET_ADRESA`, `OMEGA_ADRES_BEZ_SLESHA`
(both put the service into `dostupna() === false`, `sohranit` answers `ne-otpravleno`),
`OMEGA_PUSTOE_ZNANIE` (the only `throw` to the outside).

**Boundaries.** Confirmation goes through the same interface as the write: it catches loss in
transit and a failed service, but not the case where the interface answers cheerfully over an empty
store. The external reply-markup contract — if it changes, the parsing pattern must be re-measured
against a live reply; **the stand is silent about this by construction**. **Checking:** `npm test`
— five stands, 40 probes; no network needed, the transport is substituted by a parameter.

---

### 5.7. `dsh-pamyat` — the name for the set

**Purpose.** No code. Declares which **six** packages were built and checked together, in exactly
which versions, and by what. Installed by one name, it pulls six exact versions.

**Exact versions, no ranges.** Verbatim from the README: "A name behind which different people get
different sets is worse than no name: such sets diverge silently." In `dependencies` — bare
versions without `^`, `~`, `>=`, `*`; a dedicated stand probe turns red on any range.

**How the composition is checked.** The tool `summa-predmeta` (bash, shipped inside the
metapackage) computes the subject sum: `composition = npm pack --dry-run --json → files[].path`;
order `LC_ALL=C sort`; one line per file `"<path> <sha256>\n"`; the total — sha256 of all lines,
first 16 characters. Mode `--kontrol` is a sightedness check: the sum must change on a one-byte
edit and on a file rename. `sostav.json` holds, per member, `paket`, `versiya`, `predmet` (sum),
`faylov`, `prob`, plus the sum of the tool itself (`summa_instrumenta`) and the method
(`kak_schitano`). The stand `test/stend-sostava.mjs` checks: the tool's sum; `dependencies`
versions = `sostav.json`; absence of ranges; **subject sums against what lies in the registry**
under the declared version (`npm pack` → unpack → `summa-predmeta`); neighbours' versions on disk;
README.md and README.en.md against the composition by name and version in both directions.

**What "matches" means and what it does not.** "The accounting matches" — the declared coincides
with the actual. The **fitness** of each member the stand does not check and cannot check: a set
declaring an unfit core matches just as well as one with a fit core. Change the tool only under a
**new file name**, never in place: the tool's sum is part of the check.

**Checking.** `npm test` = `node test/stend-sostava.mjs`; codes `0` / `1` a substantive mismatch /
`2` blindness (family tree not found — "a failure of the CHECK, not of the package"). The registry
probe needs network; without it — blindness with a named reason, not "matches". The run must pass
in three layouts: the workshop (repository), a flat delivery box, and installed at the consumer's.

---

## 6. Agent-to-agent mail (A2A)

Two parts with different responsibilities: `a2a-bus` moves a letter between the mailboxes of
system users and **does not read** it; `telegram-multiagent` takes the letter out of the mailbox
and feeds it into the agent's turn. Neither delivers a letter "to the model" on its own — only
the pair does.

### 6.1. `a2a-bus` — mailboxes, postman, timer

**What it is.** Not an npm package and not a plugin: a spool directory per agent, a postman running
as `root`, and a systemd timer. Nine files: `sbin/a2a-pochtalon.py`, `sbin/a2a-zavesti`,
`sbin/a2a-proba-novichka`, `bin/a2a-send`, `bin/tell-owner`, `bin/agent-registry`,
`systemd/a2a-pochtalon.service`, `systemd/a2a-pochtalon.timer`, README.
Installed by hand (`install -m 0755 …`). Strictly one machine: the bus has no transport between
hosts.

**Mailbox.** One per agent: `/var/spool/a2a/<system-user>`, mode `1730`, owner `<user>:<bus
group>`. The meaning of the mode: a sender (a group member) has `w`+`x` — can drop a file and
traverse — but not `r` — cannot list someone else's mailbox. The group default in the code is
`a2a-pochta`; the README says `a2a-post` — a known discrepancy, trust the code.

**Letter.** Raw text without headers. File name: `YYYYMMDDTHHMMSSZ-<sender>-<tail>.txt`; the
mailbox is read in lexicographic order, which with this timestamp equals chronological. Dotfiles
are skipped (the postman's own temporaries). There is deliberately no `From:` header in the
mailbox.

**Postman.** Not `chown` but a **copy into a new inode**: changing the owner would leave the sender
an open descriptor and the ability to replace the content after the check. Sequence:
`open(O_RDONLY|O_NOFOLLOW)` → `fstat` (regular files only) → read in 65,536-byte chunks → a
temporary `.<name>.perenos-<pid>` with `O_EXCL|O_NOFOLLOW` and `0600` → `fchown`/`fchmod`/`fsync`
**by descriptor** → atomic `os.replace` → a **separate check after the replace** (uid and size).
The letter's group is set to the recipient's personal group, not the bus group. The owner
notification is a line `← от <name>: <text>` ("← from <name>: …") where the name is taken **from
the file owner**, not from the text, and translated to a nickname through the registry; the text
goes through `stdin`, not as an argument (otherwise visible in `/proc/<pid>/cmdline` and the sudo
log).

**Settings** (environment variables):

| Key | Default | Meaning |
|---|---|---|
| `A2A_KOREN` | `/var/spool/a2a` | mailbox root |
| `A2A_GRUPPA` | `a2a-pochta` | bus group (membership is needed by the sender) |
| `A2A_TELL_BIN` | `/usr/local/bin/tell-owner` | how to tell the owner in chat |
| `A2A_REESTR_BIN` | `/usr/local/bin/agent-registry` | the "user ↔ nickname" registry |
| `A2A_PREDEL_V_CHAT` | `900` | how many characters of the letter to show in chat; beyond — truncation with an explicit note |
| `A2A_PREDEL_UVEDOMLENIYA_S` | `15` | notification timeout, s |
| `A2A_PREDEL_BAJT` | `1048576` | letter size limit; larger — not transferred, not deleted, shouted |
| `A2A_PREDEL_PISEM` | `100` | letters per run |

Timer: `OnUnitInactiveSec=5s`, `OnBootSec=30s` — one unit per machine. Service: `Type=oneshot`,
`User=root`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true`,
`ReadWritePaths=/var/spool/a2a`.

**Postman exit codes.** `0` — no refusals; `1` — there were refusals, letters **left in place**;
`2` — blindness: not root, root dir unreadable, no mailboxes at all. A transfer refusal is printed
as `🔴 <mailbox>/<name>: <reason> — письмо ОСТАВЛЕНО, не потеряно` ("letter LEFT, not lost"); a
notification failure — `письмо ДОСТАВЛЕНО, но копия владельцу НЕ ушла` ("letter DELIVERED, but the
owner's copy did NOT go out"). `a2a-zavesti` (create a mailbox, idempotent): `0` / `1` refusals /
`2` arguments / `3` not in registry or not in the system / `4` not root. `a2a-proba-novichka`
(acceptance): 10 checks + a canary on the number of checks; with a neighbour 11 are expected,
otherwise 7 — a mismatch → `2`. The acceptance never writes to a human: it substitutes a stub for
`A2A_TELL_BIN`.

**What the bus does not do.** Does not deliver the letter into the agent's turn; does not read the
content; does not filter; does not protect against a group member dropping a letter (that is the
design); handles regular files only; does not follow symlinks and does not leave the root; does not
delete or rotate; gives no "quiet" flag — the recipient notification always goes out; is not a
boundary against a hostile local root.

**Security.** The sender name in the file name is a hint, not a credential: forging it is trivial;
the real origin is the file owner before the transfer; **rights must not be granted by that name**.
A binary letter is not shown in chat (`(двоичное вложение, N Б)`, "binary attachment, N B"). The
bus protects you from other people's curiosity, not from your own carelessness: a file the owner
makes world-readable will be read by the whole group.

**The sender side — `bin/a2a-send`, `bin/tell-owner`, `bin/agent-registry`** (published
2026-09-04 as they run in production; before that the README pointed at them as external).
`a2a-send <recipient> ["text"]` puts the letter into the mailbox under a dot-name and renames it
atomically (the postman skips dot-files, so it never picks up a half-written letter), sets
`umask 077` only around the write, and shows the owner a "→ to whom" line through `tell-owner`.
**Private text goes on stdin, not as an argument:** an argument is visible to every user of the
machine in `/proc/<pid>/cmdline`; text longer than `A2A_PREDEL_ARGV` (500) as an argument is
refused; there is no `-f` flag on purpose. **If your instructions mention `-f` or a 3,500-character
limit — that is a different courier under the same name** (a fleet's own tool on another machine):
same name, same path, different machines, different interfaces. Name and path do not identify the
tool — the content does (size, checksum, presence of the flag). Exit codes: `0` delivered and the owner saw it · `1`
not delivered · `3` bad call/recipient · `4` delivered, visibility did not go out; `--bez-kopii`
— no owner copy. `tell-owner` writes to the owner from the agent's **own** bot: the bot is chosen
by the calling system user (`/etc/agent-tell/<user>.conf`: `TOKEN_FILE`, `CHAT_ID`), so writing in
someone else's name is impossible even by accident; no config — exit `1` and a loud line.
`agent-registry` is a read-only reader of the machine's agent registry; it changes nothing and
guesses nothing (a missing field is a loud refusal, not a default); sub-commands `list`,
`sluzhby`, `pole`, `mashina` (paths only, never secret values), `obshchee`, `pokrytie`, `fakt`,
`verify` (mismatch → `1`, blindness → `2`).

### 6.2. The reading side in `telegram-multiagent`

Two independent sources of incoming mail with different rules:

| | `a2aDir` channel | bus mailbox `spoolDir` |
|---|---|---|
| where | `<a2aDir>/in/*.txt`, reply in `<a2aDir>/out/*.txt` | a flat directory, usually `/var/spool/a2a/<agent>` |
| sender | first line `From: <instance>/<folder>` | from the **file name** `…-<sender>-…` |
| `/goal` from a letter | accepted per the `goalA2ASenders` list | **not accepted at all** |
| prefix in the dialogue | `[служебный канал, от координатора <sender>]` ("service channel, from coordinator …") | `[служебный канал, от агента <who>]` ("service channel, from agent …") (+ age note); a batch — `[служебный канал, N писем из ящика одной пачкой]` ("N letters from the mailbox in one batch") |

A `From:` header in a mailbox letter **does not work**: the sender is taken from the file name,
with no error and no refusal. Only `.txt` and `.md` are taken; anything else is not swallowed — the
name is logged exactly once.

**Delivery into the turn.** `agentFor(a2aSession)` → queue the question →
`agent.send(createUserMessage({…, source: {kind: 'a2a'}}), 'next-turn', true)` → wake-ups until
claimed (budget 120 s in 0.5 s steps) → **only then** `unlink`. The channel mark is set by the
delivery code, not by the sender, and anything resembling it is stripped from the text beforehand
(`stripMark`).

`source.kind: 'a2a'`, not `'user'` — a deliberate trade-off, consequences listed in the code:
`hasDirectHumanInput → false`; the wake-up budget is not reset; the skill body is not pulled in; the
session title is not built. The owner's private chat remains `source.kind: 'user'`.

**Polling.** Not an event and not a timer: `loop()` calls `pollA2A()`, `pollSpool()` in turn, then a
long Telegram poll of 25 s — that sets the period (~25 s). Batching: more than `spoolBatchCount`
letters — one turn; older than `spoolStaleHours` — the note "the letter sat in the mailbox for N h
— it may be stale".

**Settings related to A2A.**

| Key | Default | Meaning |
|---|---|---|
| `a2aDir` | `null` | exchange directory; `in/` and `out/` are created automatically; unset — no channel |
| `a2aSession` | `'a2a'` | identifier of the service session |
| `spoolDir` | `null` | bus mailbox; unset — not read |
| `spoolBatchCount` | `5` | more — deliver as a batch in one turn |
| `spoolStaleHours` | `12` | older — age note |
| `mergeChatIntoA2A` | `null` | merge the owner's private chat and the service channel into one memory |
| `goalA2ASenders` | `[]` (refuse everyone) | who may `/goal` from the `a2aDir` channel |
| `settingsFile` | `<tokenFile>.json` | delivery mode of owner copies: `personal` (default) / `broadcast` / `owner-all`; re-read by `mtime` |

Where the agent's reply goes is decided by the **origin of the turn**, not by the last message:
`turnAsk.origin ?? lastOrigin ?? (chatId === a2aSession ? 'a2a' : 'tg')`. The goal-setting limit
is 3 per sliding hour per channel.

### 6.3. Context commands: `/compact` and `/compact-status`

| Command | Alias | What |
|---|---|---|
| `/compact` | `/ccc` | the platform's own compaction (`dsh-command-compact`) |
| `/compact-status` | `/cs` | ours: how many tokens are used and how far to the threshold |

Aliases are expanded **into the name of the stock command**, not into an own implementation — for
the sake of the `command/run` event. The trailing anchor `(\s|$)` in the pattern is mandatory:
without it `/compactstatus` would match `/compact` and silently compact the history.

`/compact-status` prints: `Контекст: занято <N> токенов.` ("Context: N tokens used"; the source is
`tokenMeter.measure` — the same number the platform uses to decide whether to compact); the
measurement basis in **three** states (since 1.5.0): basis fresh — `(числа провайдера)` ("provider
numbers"), the distance to the threshold is printed; basis stale — `🔴 ЧИСЛА СНЯТЫ ДО КОМПАКТА`
("NUMBERS TAKEN BEFORE THE COMPACTION"), the distance is **not** printed at all (the cut-out part was
subtracted by the heuristic "4 characters = 1 token", which underestimates Cyrillic several-fold — the
distance is not "approximate" but unknown); freshness could not be determined — `⚠️ свежесть снять НЕ
МОГУ (причина)`. Freshness is determined from the session journal events (`session.events` or
`eventAt()` + `seq` — whichever the installed platform has; an unknown signature → "don't know"), not
from `baseline.kind`: that one speaks about the **source** of the basis, not its currency. The window comes
from `llm.resolveModelInfo(provider, model).context.contextWindow`; if there is no window, **no
default is substituted** — it prints `🔴 Окно контекста недоступно (<reason>) — расстояние до
порога сказать НЕ МОГУ` ("context window unavailable — CANNOT say the distance to the threshold").
The `0.8` multiplier is the platform default; if compaction is mounted with its own
`thresholdRatio`, the number in the reply is wrong, and the stand will not catch it — the caveat is
recorded in the README.

---

## 7. Installing: explicit numbers, not tags

The state of the `latest`/`alpha` tags in the registry **is not treated as stable**: on the document
date the core was released nine times in one day, and the tag twice pointed at a version with a
known filter defect (§5.1.6). Therefore:

1. Install **by explicit number**, not by tag. The set — one line with a number:
   `npm i dsh-pamyat@0.1.0-alpha.29` (core alpha.25 — accepted; what remains is a mark instead of a
   lock on names like `NAME_SECRET=`, see §5.1.6). Older sets, if needed for comparison: alpha.26
   (core alpha.21: false refusals on `key` homonyms), alpha.28 (core alpha.24: misses on
   `PresharedKey=` and glued names). What is fit **for you** — by §5.1.6 and by your own live name
   forms.
2. Check the tag state yourselves, by command, not by this document:
   `npm view dsh-pamyat-core dist-tags --json` and `npm view dsh-pamyat dist-tags --json`.
   **A tag is not fitness.** A tag is moved by acceptance, not by release (§8), but between a
   release and its acceptance it may point anywhere.
3. Check that the registry serves **that** composition: `npm pack dsh-pamyat-core@<version>` from
   a clean directory, unpack, compare `summa-predmeta` with the set's `sostav.json`. The sum is the
   name of the composition; the version number is only its address.
4. After installing — `npm test` in every package (§9) and the start-up lines in the process log:
   zero start-up lines = the package is not mounted.

A freshly published version is **not served instantly** by the registry: a 404 on the tarball in
the first minutes after publishing is unfinished propagation, not a failure. Re-measure after 15
minutes; a 404 after fifteen minutes is real.

---

## 8. Release and acceptance order

Rules that cost a day of work, and are therefore written here and not only in correspondence.

1. **Publishing to the registry and moving the tag are different actions.** A version without a
   tag harms nobody: publish freely, under any numbers. The `latest`/`alpha` tag is a hand-out to
   everyone who did not name a number, and it is moved by **acceptance**, not by release.
2. **A version number is not the name of a composition.** Two people who agreed "we release
   alpha.N" may build different compositions under it. The name of a composition is the subject sum
   (`summa-predmeta`) recorded in `sostav.json`. Before bringing a node up, compare the version
   **at the moment** of the upgrade, not from memory: "the disk overtook the registry" happened four
   times in one day.
3. **Acceptance — by numbers, on someone else's probe set.** The author's probe set is always
   fitted to the finding; acceptance runs its own set, including forms the author did not have, and
   a live corpus broken down by class (§5.1.4). "Zero misses" says nothing until the composition of
   the set is named. Zero hits for a class count only together with a reachability check of the
   class by planted probes.
4. **The tarball — by someone else's hand.** Before moving a tag, make sure `npm pack
   <package>@<version>` is obtainable from a clean directory on another machine.
5. **The reasoning behind a rule — into the code, next to the rule.** An asymmetric list (a
   boundary before `key` but not before `token`) without an explanation in a comment will be
   "fixed" for uniformity by the next reader. Correspondence is unavailable a month later; a comment
   is available.
6. **A stand that cannot check exits with `2`, not `0`.** Across the whole family: `0` — matches,
   `1` — mismatch, `2` — "nothing to check with". Zero checks must not look like "checks passed".
   The stand runner walks the directory rather than a hand-written list of names: three stands out
   of nine once did not run under a green `npm test`.

---

## 9. Checking: the stands in one table

| Package | Command | Stands | Needs |
|---|---|---|---|
| `dsh-pamyat-core` | `npm test` → `node test/vse-stendy.mjs` | 9 (directory walk) | `@deepseek-ai/cordis` 4.0.1, `@deepseek-ai/schemastery` 3.18.1; Node ≥ 22 |
| `dsh-pamyat-secretary` | `npm test` (loop over `test/stend-*.mjs`) | 7 | the same; no network needed |
| `dsh-pamyat-restore` | `npm test` (three stands in a row) | 3 | `DSH_PERSIST=…/dsh-session-persistence/lib/index.js`, `DSH_SESSION=…/dsh-session/lib/index.js`; without them — code 2 |
| `dsh-pamyat-byudzhet` | `npm test` | 4 (39 probes) | cordis, schemastery |
| `dsh-pamyat-nudzh` | `npm test` | 4 of 5 on disk | + `@deepseek-ai/dsh-llm` (peer, by hand) |
| `dsh-pamyat-omega` | `npm test` | 5 (40 probes) | cordis, schemastery; no network needed |
| `dsh-pamyat` | `npm test` → `node test/stend-sostava.mjs` | 1 | `npm`, `tar`, `sha256sum`, **network to the registry**; the family tree or a delivery box |
| `a2a-bus` | `sbin/a2a-proba-novichka <nickname>` | 10 + canary | root; a neighbour for the "someone else's — refused" probes |
| `telegram-multiagent` | `node test/stend-komand-konteksta.mjs`, `node test/stend-yashchika-shiny.mjs`, … | 6 | — |

Exit codes everywhere: `0` matches · `1` mismatch · `2` blindness ("nothing to check with"). Code
`2` does not mean "all good".

---

## 10. Known README ↔ code discrepancies on the document date

Listed so that a README reader does not mistake an outdated line for the structure. All are in the
package READMEs, not in the code; cured at each package's next release.

- `core`: "Four stands, 31 probes" (nine stands on disk); the settings table lacks `klassyZnaniy`;
  the line about secrets being fail-closed for entropy findings contradicts the code (entropy
  marks).
- `secretary`: `maxTokenovStati` 4000 (8000 in the code); "does not distil with a separate model"
  in the "does not do" section contradicts its own distillation section; "two sources" (three in
  the code); "Five stands, 45 probes" (seven on disk).
- `restore`: five keys out of eight; "class `svodka`" (`svodka-kompakcii` in the code); "first step
  of the session" for layer C (in the code — the first step after process start, with a time
  limit); "currently a stub" in the "Assumptions" with the stub removed.
- `nudzh`: `stend-vstavki.mjs` not in `scripts.test`; the English README lacks the settings table
  and the "not a setting" section.
- `byudzhet`: the English README lacks the settings table; the refusal example is shortened.
- `omega`: "Four stands, 29 probes" (five and 40 on disk); "Three traps" with five items.
- `dsh-pamyat`: "Eight probes" (ten are executed); the CHANGELOG skips the alpha.25 entry.
- `a2a-bus`: group `a2a-post` in the README versus `a2a-pochta` in the code.

---

## 11. How to maintain this document

- Two files — one document. Edits **in pairs**, in one commit; the version date in the header of
  both.
- What to re-check at every release of a family package: table §1.3 (versions), table §3 (seams —
  if the package started listening to a new event), table §4.1 (service methods), the settings
  table in the package card, §5.1.6 (filter history), §9 (number of stands), §10 (discrepancies —
  remove the closed ones, add the new ones).
- Numbers go into the document only by substitution from a run's output, not from memory. Secret
  samples — only with an explicit placeholder `<value>`: otherwise the document itself becomes a
  subject for the filter.
- Nothing private: names of people, machines, paths outside package defaults, names of secret-store
  entries. The repository is public.

---

## Appendix A. Codes and outcomes on one page

**Stand exit codes:** `0` matches · `1` mismatch · `2` blindness. **Postman:** `0` · `1` refusals
(letters in place) · `2` blindness. **`a2a-zavesti`:** `0` · `1` · `2` arguments · `3` not in
registry/system · `4` not root. **`summa-predmeta`:** `0` · `1` control failed · `64` help.

**Core `e.code`:** `PAMYAT_NEDOSTUPNA`, `PAMYAT_NET_PUTI`, `PAMYAT_BAZA_NE_OTKRYLAS`,
`PAMYAT_NET_HRANILISHCHA`, `PAMYAT_NEPOLNAYA_ZAPIS`, `PAMYAT_VERA_NEGODNA`, `PAMYAT_NET_KLASSA`,
`PAMYAT_TREBUET_PODTVERZHDENIYA`, `PAMYAT_ZAPIS_NE_RAZRESHENA`, `PAMYAT_SEKRET_NA_VHODE`,
`PAMYAT_NEVIDIMOE_V_SLUZHEBNOM`, `PAMYAT_FILTR_NEISPRAVEN`, `PAMYAT_ZHURNAL_BEZ_BAZY`,
`PAMYAT_NEPOLNAYA_OTMETKA`, `PAMYAT_NEIZVESTNYJ_ISHOD`. **Omega `e.code`:** `OMEGA_NET_ADRESA`,
`OMEGA_ADRES_BEZ_SLESHA`, `OMEGA_PUSTOE_ZNANIE`. The other packages define no codes of their own —
their refusal is a shout, not an exception.

**Core journal outcomes:** `zapisano`, `otkloneno`, `ostalos-v-operativnom`, `ne-udalos-proverit`,
`ne-otpravleno`, `moglo-dojti-bez-id`, `dostavleno`, `snyato-s-ocheredi`.
**Natures:** `sekret-na-vhode`, `podozrenie-na-sekret`, and the confirmation natures from the
platform core. **Omega delivery states:** `dostavleno`, `ne-najdeno`, `ne-otpravleno`,
`moglo-dojti-bez-id`, `moglo-dojti-id-est`. **Restore decisions:** `use`, `verify`, `ignore`.
**Nudzh answers:** `porog-pereyden`, `neizvestno` (and never "enough").

## Appendix B. Glossary of names from the code

| In code | Meaning |
|---|---|
| `pamyat` | memory (the core's service) |
| `pamyatDolgovremennaya` | long-term memory (omega's service) |
| `nudzh` / `nudzhPamyati` | nudge (towards compaction) |
| `byudzhet` / `byudzhetPamyati` | budget (incoming) |
| `zapisat` / `prochitat` / `otobrat` | write / read / select |
| `zapis`, `zapisi` | record, records |
| `klass` | record class (`svodka-kompakcii`, `reshenie`, `urok`, …) |
| `soderzhim` / `istochnik` / `vera` | content / source / trust (0…1) |
| `obyavlennyj` | declared (a secret named by a declaration word) |
| `entropiya` | entropy (a finding class by the look of the string) |
| `podozrenie` / `ochistka` | suspicion (secret mark) / cleaning (invisible-characters mark) |
| `zhurnal` / `ishod` / `priroda` | journal / outcome / nature (of a refusal or decision) |
| `svodka` | summary |
| `predel` / `dolyaTrevogi` / `porogVery` | limit / alarm fraction / trust threshold |
| `sostav` / `summa-predmeta` | composition / subject sum (checksum of the composition) |
| `stend` / `proba` | stand (test run) / probe (one check) |
| `krik` | shout (a refusal line on stderr) |
| `podyom` | start-up (of a plugin) |
| `pochtalon` / `yashchik` / `pismo` | postman / mailbox / letter |
| `zavesti` / `proba-novichka` | create (a mailbox) / newcomer acceptance |
