# dsh-pamyat-byudzhet

## Purpose

The incoming memory budget of a DSH agent: it decides how much stored knowledge to raise back into the conversation so that memory does not crowd out the conversation itself. The package is a cordis plugin; on mount it publishes the `byudzhetPamyati` service, which selects the candidate records passed to it under a limit in units of its own measure ("оценка наша", our estimate, not platform tokens) and prints to stderr what was raised, what was dropped and why (`src/index.js`, `src/otbor.js`). The package refuses rather than advises: an incomplete raise is announced aloud with named reasons, so that "not everything was raised" is not indistinguishable from "there is no memory". Context spend is not its business — that is the sibling package `dsh-pamyat-nudzh`. The service is called by `dsh-pamyat-restore` when building the welcome briefing (layer C).

## What gets installed and where

The package contents are set by the `files` field in `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; npm adds `package.json` and `LICENSE` to the archive by itself, without a mention in `files`. The entry point is `src/index.js` (`main` and `exports["."]`).

| File | Contents |
|---|---|
| `src/index.js` | the cordis plugin: `name`, the `Config` schema, `apply` — settings checks, the start-up line, the `byudzhetPamyati` service, `krik` output to stderr |
| `src/otbor.js` | `PORYADKI`, `otobrat` (sorting and greedy pass), the drop summary with reasons and properties |
| `src/mera.js` | `SIMVOLOV_NA_EDINICU`, `ocenit` (record cost), `sverit` (reconciliation with the platform number) |
| `src/teplo.js` | `teplo`, `raspredelenie` (warmth and touch instrument), constants `POLURASPAD_MS`, `POROG_HOLODNOJ`, `VES_KASANIYA` |
| `test/` | five stands (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `LICENSE` | the MIT license text (the `license` field in `package.json`) |

Dependencies are `peerDependencies` only: `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` (ranges — in `package.json`). There are no own `dependencies`.

On the machine the package lives in `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`; next to it, in `/opt/agent-plugins/node_modules/@deepseek-ai/`, are `cordis` and `schemastery`. It reaches an agent profile through the link `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-byudzhet` → `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`.

## Installation

**Where to install from.** The package is published to npm with release 3.1.2 (order and window — by the owner's decision). Until then the npm registry holds an old `0.1.0-alpha.*` edition (measured 10.10.2026, `npm view dsh-pamyat-byudzhet version`): `npm install dsh-pamyat-byudzhet` installs that one, not the one described here. Until the release, install from the source tree: `npm pack <дерево>/packages/dsh-pamyat-byudzhet`, then `npm install ./dsh-pamyat-byudzhet-<версия>.tgz`.

On the machine the package is installed by npm from the lock file in `/opt/agent-plugins`, out of a tarball on the shelf. The dependency in `/opt/agent-plugins/package.json` (and in `package-lock.json`) looks like:

```json
"dsh-pamyat-byudzhet": "file:../agent-plugins-tarbally/dsh-pamyat-byudzhet-<версия>.tgz"
```

The tarball is `/opt/agent-plugins-tarbally/dsh-pamyat-byudzhet-<version>.tgz`, where `<version>` is the version from the package's `package.json`. A new version: put the tarball on the shelf, change the reference in `/opt/agent-plugins/package.json`, reinstall from the lock, then restart the agent services (on a settings edit the loader does not re-read the module — comment in `src/index.js`, at `vzyatChislo`).

It is connected in the agent profile `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`, in an `- insert:` section (this is how it is connected in the machine's live profiles):

```yaml
- insert:
    - name: dsh-pamyat-byudzhet
      id: dsh-pamyat-byudzhet
      config:
        predel: 2000        # в одном из профилей — 5000 · one profile has 5000
        poryadok: svezhest
        porogVery: 0.5
```

The sign of mounting is a line in the agent process stderr (the service log), printed on every `apply` call (the platform calls it several times per start-up):

```text
[dsh-pamyat-byudzhet <версия>] подъём: предел 2000 ед., порядок «svezhest», порог веры 0.5. Тепло считается и печатается, но на отбор НЕ ВЛИЯЕТ (прибор, не правило).
```

`<version>` is read from the package's own `package.json`; if unreadable — "версия неизвестна" (version unknown) (`src/index.js`, `versiya`).

## Configuration

The schema is `Config` in `src/index.js` (schemastery). Bounds are checked not by the schema but in `apply` (`vzyatChislo`, `vzyatPoryadok`) — both at start-up and on a hot settings reload.

| Key | Type | Default | Valid | Meaning |
|---|---|---|---|---|
| `predel` | number | 2000 | finite, ≥ 0 | raise limit in units of our measure; `0` — raise nothing (a separate line "предел равен нулю …" is printed) |
| `poryadok` | string | svezhest | `svezhest`, `vera` (`PORYADKI`) | importance order: `svezhest` — newest first (time from `sozdano`, otherwise `kogda`; no time — key 0, to the end); `vera` — high confidence first, unmeasured (`null`) after high and before low |
| `porogVery` | number | 0.5 | [0, 1] | the "low" confidence threshold — only to explain drops, does not affect selection |

An invalid value is rejected with a line "ОТКЛОНЕНО: <key> = <value> — …; действует …" (REJECTED … in force …): the previous valid value stays in force, or the default if there is none. The previous valid value is kept at module level — one per process.

The same three fields can be passed to an `otobrat({ zapisi, predel, poryadok, porogVery })` call — they override the settings for that call only. An invalid `predel` or unknown `poryadok` in a call is an exception from `src/otbor.js`, not an "ОТКЛОНЕНО" line.

### What is NOT a setting

Code constants, changed only by editing the code: `SIMVOLOV_NA_EDINICU` = 4 characters per unit (`src/mera.js`); `PORYADKI` (`src/otbor.js`); `POLURASPAD_MS` = 14 days, `POROG_HOLODNOJ` = 0.25, `VES_KASANIYA` = 0 (`src/teplo.js`; the half-life and the cold threshold are hypotheses and do not affect selection).

The package reads no environment variables (no `process.env` in `src/`).

### Service

The package provides (`ctx.provide`) the `byudzhetPamyati` service; it declares no `inject` and consumes no other services.

| Function | What it does |
|---|---|
| `edinicy()` | `{ imya: 'оценка наша', simvolovNaEdinicu, pochemuNeTokeny }` — what the package counts in and why not tokens |
| `ocenit(zapis)` | record cost: length of `soderzhim` + `klass` + `istochnik` divided by `SIMVOLOV_NA_EDINICU`, rounded up, at least 1; not an object — exception |
| `sverit({ nashe, platformennoe })` | ratio and discrepancy in percent; zero from the platform — explained in words; never adjusts our measure |
| `otobrat(vopros)` | selection under the limit; returns `{ podnyato, otbrosheno, svodka }`; on any drop — a line "поднято НЕ ВСЁ … ПРИЧИНЫ … Из них …"; on every call — the touch and warmth lines |

There are two drop reasons, printed separately from the properties of the dropped records: "НЕ ВЛЕЗАЮТ ЦЕЛИКОМ" (does not fit at all: one record costs more than the whole limit — it will not be raised under any order) and "не поместились в остаток предела по порядку …" (did not fit the remainder). Properties ("Из них: …", of them) — confidence below threshold, confidence never measured (not zero), cold, warmth never measured — rejected nothing. In detail — [docs/SETTINGS.md](docs/SETTINGS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verification

There are five stands, 61 probes in total (the number is counted by `test/stend-readme.mjs` from lines starting with `proba(` in the stand sources). Run all — `npm test` in the package directory; one — `node test/<stand>.mjs`.

| Stand | Probes | What it checks |
|---|---|---|
| `test/stend-granic-chisel.mjs` | 10 | invalid `predel`, `porogVery` and an unknown `poryadok` are rejected at start-up and on `fiber.update` on a real Context; the previous valid value applies in selection; `predel 0` is legal |
| `test/stend-krik-zvuchit.mjs` | 9 | the refusal is audible in a separate process's stderr; `ctx.logger` exists and is mute; the version in the line comes from the manifest; the touch line names scope and moment |
| `test/stend-mery.mjs` | 7 | record cost (`ocenit`) and reconciliation with the platform number (`sverit`) |
| `test/stend-otbora.mjs` | 23 | reasons versus properties, two reasons, `null` confidence, warmth does not affect selection, the `kogda` key, cold threshold = `POROG_HOLODNOJ`, three touch inputs |
| `test/stend-readme.mjs` | 12 | both READMEs agree with the code, the `npm pack` contents and each other |

Exit codes of each stand: 0 — all probes green, 1 — some red, 2 — blindness (the subject or an instrument did not load: dependencies missing from `node_modules`, or, for the README stand, `npm pack --dry-run` did not answer). The `npm test` result (script in `package.json`): 1 if any stand returned 1; otherwise the non-zero code of the last failing stand (usually 2); otherwise 0.

Conditions: `stend-granic-chisel` and `stend-krik-zvuchit` need `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` (devDependencies) in the package's `node_modules`; the README stand needs `npm` on PATH. In a clone without `npm install` these stands return 2.

What `stend-readme` (`test/stend-readme.mjs`) requires: both READMEs name all `PORYADKI` orders, the units measurement method (`dsh-compaction`; the Russian one also `exports`; the date 03.09 in at least one), the МОЛЧА / SILENTLY warning and the «не измерял…» / never measured distinction; in the Russian one the `predel` and `porogVery` defaults appear in a table as "| number |", and `SIMVOLOV_NA_EDINICU` and «НЕ является» are named; everything the READMEs name in `src/` and `test/`, and every `stend-…`, is in the `npm pack` contents; both READMEs name the same set of stands. Each README must say something about verification — a non-empty section (a heading with "verif…", "stand", "test" and the like) or a stands line. Numbers are checked only when stated: on the first line containing "stand" (in Russian — «стенд») and "N probes" («N проб»), N must equal the number of `proba(` lines across all `test/*.mjs`, and the stand count on the same line — digits or a word from one to twenty, before or after "stand" — must equal the number of `test/*.mjs` files. Not stated is not an error: the probe stays green and prints "not stated".

Checking on a live agent: in the agent service log look for the line "подъём: предел …" (mounted) and, on a welcome briefing, the lines "касания …" and "тепло (прибор, на отбор НЕ влияет): …" (a selection happened). The list of lines and their meaning — [docs/GUARDS.md](docs/GUARDS.md), common failures — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Limitations

- It does not count context spend (that is `dsh-pamyat-nudzh`), does not read the memory database and does not choose candidates: it works only with the list the caller passes. On the machine the caller is `dsh-pamyat-restore`, only in layer C (welcome briefing) and through an optional `ctx.get('byudzhetPamyati')`; if the service is missing or throws, restore builds the briefing without a limit and says so in a line. In layer B (restore after compaction) the budget is not called.
- Selection is greedy: it walks the order and takes what fits; it does not search for the best fill of the limit. A record costlier than the whole limit will never be raised.
- The measure is our own, not platform tokens: one unit is `SIMVOLOV_NA_EDINICU` characters. A measurement on 03.09 (method — a search of the `@deepseek-ai/dsh-compaction` package itself, version 0.1.1-rc.2: no counter in `lib/` nor among `exports`) showed that the platform estimator is not exported. If the platform changes its estimator, our limits will drift SILENTLY: the only sign is a discrepancy in `sverit`, and one has to look at it oneself.
- `ocenit` counts `soderzhim`, `klass`, `istochnik`. `dsh-pamyat-restore` passes records in its own shape (`vid`, `avtor` instead of `klass`, `istochnik` — `packages/dsh-pamyat-restore/src/index.js`, `perevesti`), so in production the cost is made of `soderzhim` only.
- Confidence: "never measured" (`null`) and "below threshold" are different properties; NULL is not treated as zero. `porogVery` only explains drops.
- Warmth and touches are an instrument: they do not affect order or selection (`VES_KASANIYA` = 0, `vliyaet_na_otbor: false`). The touch line describes only the candidates of this selection and is taken before delivery; memory-wide numbers cannot be derived from it. The revision condition is in the header of `src/teplo.js`.
- Output is `console.error` to the process stderr only. `ctx.logger` is not used: in cordis 4.0.1 (measured 03.09) its built-in sink keeps messages in an in-process ring buffer. The package listens to no events, writes no files and runs no external commands.
- The "previous valid" setting value is one per process: if different nodes of one process set different numbers, the last accepted one applies.
- A `porogVery` passed to an `otobrat` call is not range-checked (only the list, `predel` and `poryadok` are — `src/otbor.js`); it affects only the properties text.
- Requires the DSH platform with cordis and schemastery (`peerDependencies`); without them loading fails with `ERR_MODULE_NOT_FOUND`.

## License

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
