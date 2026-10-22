# dsh-pamyat-nudzh

## Purpose

A cordis plugin for the DSH agent platform — the spending side of context accounting: from the session journal it counts the model window occupancy and the total spend of tokens. When occupancy crosses the threshold, the package inserts, once per cycle, a reminder telling the model to write what matters into memory before compaction (summarising the conversation), and prints a line about it to stderr. What to bring back into the conversation is not its business: that is the sibling package `dsh-pamyat-byudzhet`. The provider does not always send a usage number, so the package only ever states "already at least the threshold" and never "there is room" (`src/index.js`, the header and `hvatitLi`). The nudge's silence does not mean headroom: it only means "the threshold is not crossed by the counted part".

## What gets installed and where

The package contents are defined by the `files` field of `package.json`; npm adds `package.json` and `LICENSE` to the archive by itself:

| path in the package | what it is |
|---|---|
| `src/index.js` | the plugin: `name`, `Config` (schemastery schema), `apply`; entry point (`main`/`exports`), `"type": "module"` |
| `src/schet.js` | spend arithmetic: `raskhodVyzova`, `zavestiSchet` |
| `test/` | eight stands `stend-*.mjs` (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `README.md`, `README.en.md`, `CHANGELOG.md` | description and release history |
| `LICENSE` | the MIT license text (the `license` field in `package.json`) |

The package has no `dependencies` of its own. `@deepseek-ai/cordis`, `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-llm` are declared in `peerDependencies` (ranges are in `package.json`) and come from the environment: `src/index.js` imports `@deepseek-ai/schemastery` and `createUserMessage` from `@deepseek-ai/dsh-llm/message`.

On the machine the package is installed once, in the shared plugins directory: `agent-plugins/node_modules/dsh-pamyat-nudzh` (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-llm` sit next to it in the same `node_modules`). An agent profile sees it through the link `<agent home directory>/.dsh/profiles/web/node_modules/dsh-pamyat-nudzh` pointing to that directory. The package writes nothing to disk: the only file it reads is its own `package.json`, for the version number in log lines.

## Installation

**Where to install from.** npm provides `3.1.2` (checked on 2026-10-15 with `npm view dsh-pamyat-nudzh version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. For the current local edition, pack the selected source revision with `npm pack <tree>/packages/dsh-pamyat-nudzh`, then run `npm install ./dsh-pamyat-nudzh-<version>.tgz`.

1. The tarball `dsh-pamyat-nudzh-<version>.tgz` sits on the `agent-plugins-tarbally/` shelf — a sibling directory of `agent-plugins/`.
2. `agent-plugins/package.json` lists the package as a dependency on that tarball; the version is pinned in `package-lock.json`:

   ```json
   "dsh-pamyat-nudzh": "file:../agent-plugins-tarbally/dsh-pamyat-nudzh-<version>.tgz"
   ```

   npm installs it from the lock file in the `agent-plugins/` directory.
3. The agent profile (`<agent home directory>/.dsh/profiles/web/node_modules/`) has a link `dsh-pamyat-nudzh` to the installed directory.
4. Mounting in `<agent home directory>/.dsh/profiles/web/cordis.patch.yml`, section `- insert:` (shape as in the live profiles, comments removed):

   ```yaml
   - insert:
       - name: dsh-pamyat-nudzh
         id: dsh-pamyat-nudzh
         config:
           predel: 1000000
           dolyaTrevogi: 0.7
           otmetkiPuti: [0.5, 0.6, 0.7, 0.85, 0.9, 0.95]
   ```

5. Restart the agent. The sign it is mounted is the start-up line in the process stderr (the service log):

   ```text
   [dsh-pamyat-nudzh <version>] подъём: предел 1000000 ток., доля тревоги 0.7 (порог 700000 ток.). Числитель — занятость ПОСЛЕДНЕГО вызова, не сумма за сессию.
   ```

   The platform calls `apply` several times per start-up (the code records a measurement: 3), so the start-up line may repeat (`src/index.js`, the comment before `apply`).

## Configuration

Keys of the `config` block (the `Config` schema in `src/index.js`). The schema only knows types; bounds are checked by `apply` on every call — both at start-up and on a hot reload of the settings.

| key | type | default | range | meaning |
|---|---|---|---|---|
| `predel` | number | 0 | [0, ∞), finite | the model window in provider tokens; 0 — limit unknown: spend is counted, but there is no alarm, no marks and no insertions; at start-up it prints "предел контекста НЕ ЗАДАН (predel: 0) …" |
| `dolyaTrevogi` | number | 0.8 | (0, 1] | the fraction of the limit from which to nudge towards compaction; threshold = `predel × dolyaTrevogi` |
| `otmetkiPuti` | array of numbers | `[]` | each strictly between 0 and 1 | marks on the way to the threshold: one observation line per crossed mark per cycle; they do not affect the alarm |

An invalid `predel` or `dolyaTrevogi` (out of range, infinity) is rejected with a line "ОТКЛОНЕНО: <key> = … — вне допуска …; действует …": the previous valid value stays in force, or the default if there is none. `null` or a missing key gives the default. Invalid marks are dropped with a line "ОТКЛОНЕНО: otmetkiPuti — … отброшены …; действуют …"; valid ones are sorted ascending. Details — `docs/SETTINGS.md`.

The package reads no environment variables (there is no `process.env` in the code) and has no settings files.

### Two quantities

- **Window occupancy** is the input of the model's last call that had a provider number (`inputTokens + cacheReadTokens + cacheWriteTokens`). The threshold is computed from it; it drops after compaction. The alarm line: "пора подтолкнуть к компакту: занято … из … (порог …%)".
- **Total spend** is how many tokens went through the API over all counted calls (`neMenshe`). Every call resends the whole context, so the sum grows without bound and compaction does not reduce it. It is a lower bound: the sum can only be LARGER, because calls without a number (`bezChisla`) cannot be counted.

### Service and events

The package publishes the `nudzhPamyati` service (`ctx.provide`):

| method | what it does and returns |
|---|---|
| `uchest(usage, session?)` | count one call's spend; with a session — only catch up with its journal, the given `usage` is not added (otherwise the same event would be counted twice) |
| `itog(session?)` | `{ neMenshe, zanyato, vhod, vyhod, izNihRassuzhdenie, uchtenoVyzovov, bezChisla, polnyj }`; without a session — the sum over all known states, `zanyato` from the last one touched; a blind session gives `zanyato: null` |
| `hvatitLi(session?)` | never "enough": `sostoyanie` = `porog-pereyden` (with `zanyato`, `neMenshe`, `predel`, `uchtenoVyzovov`, `bezChisla`) or `neizvestno` (with `pochemu` and completeness numbers; with `predel: 0` — only `uchtenoVyzovov`, `bezChisla`; for a blind session — only `pochemu`) |
| `raskhodVyzova(usage)` | `{ vhod, vyhod, vsego, izNihRassuzhdenie }` of one call, without accumulation; an invalid field throws, naming the field |

Subscriptions (`ctx.on`):

- `session/event` — catches the session state up with its journal. The journal comes from the `pamyat` service (`ctx.get('pamyat').sobytiyaSessii(session)`, optional), else `session.snapshotEvents()`, else `session.events`; the part inherited from the parent (`inheritedEventCount`/`seedLength`) is cut off. Counted are `assistant/message` (`data.usage`), `compaction/summary` (into the sum only, not into occupancy), `compaction/end` (a successful compaction with a known `compactionId` makes occupancy unknown until a fresh `usage`), and `user/message` from the package itself (the reminder is already in the journal — do not repeat it).
- `agent/pre-step` — first the decision of the other handlers (`next()`); on `reject`, an aborted step or a blind session the decision is left alone; if the insertion is armed, one user message built with `createUserMessage` and `source.kind: 'plugin:dsh-pamyat-nudzh'` is appended to `messages`, and the decision gets `kind: 'enter'`.

All output goes through `console.error` with the prefix `[dsh-pamyat-nudzh <version>]`, the version taken from its own `package.json` ("версия неизвестна" if it could not be read). `ctx.logger` is not used.

### What is NOT a setting

- **The composition of the sum.** Three arithmetic rules are taken from the platform's code (measured 03.09; method — reading the `TokenUsage` type in `@deepseek-ai/dsh-llm` and the `mapUsage` function of the `dsh-llm-deepseek` adapter; see the header of `src/schet.js`): the counters are DISJOINT — input = `inputTokens + cacheReadTokens + cacheWriteTokens`; `reasoningTokens` do not go into the sum (they are part of output, shown for reference in the `izNihRassuzhdenie` field); a call without `usage` is not zero but `bezChisla`.
- **The non-credibility margin.** The constant `NEVOZMOZHNO = 1.5`: occupancy above `1.5 × predel` is declared non-credible — the line "СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН", no marks, no alarm.
- **Once per cycle.** One alarm per cycle, one reminder to the model per cycle; a cycle ends when occupancy is back below the threshold or after a successful compaction.
- **The asymmetry of the answer.** `hvatitLi` has no "enough" value under any setting.

## Verification

Eight stands, 98 probes; both numbers are checked by `stend-readme` against the files in `test/`, so when probes are added they must be updated here and in `README.md`.

Run from the package directory: all at once with `npm test`, one at a time with `node test/<stand>.mjs`. Stands that load `src/index.js` need installed dependencies (`npm install` in the package directory: cordis and schemastery from `devDependencies`, dsh-llm as a peer). The stands run the cordis next to the package, not the live platform's instance.

| stand | probes | what it checks |
|---|---|---|
| `stend-granic-porogov` | 10 | an invalid threshold is rejected at start-up and on hot reload (`fiber.update` on a real Context), the previous valid value acts; marks `[50]` and `[0.5, 1.5]` |
| `stend-krik-zvuchit` | 6 | the package's lines reach the stderr of a separate process; `ctx.logger` exists and is mute; the version in the start-up line comes from `package.json` |
| `stend-nedostovernogo-schyota` | 11 | occupancy above one and a half windows: the "НЕДОСТОВЕРЕН" line is there, "пора подтолкнуть" is not; the 1–1.5 window band |
| `stend-porogov` | 24 | the alarm from occupancy, not from the sum; once per cycle; `hvatitLi` without "enough"; the live event shape; path marks |
| `stend-posle-kompakta` | 18 | the unknown state after compaction, independent sessions, restore from the journal, blindness; a fake ctx |
| `stend-readme` | 12 | the README agrees with the code, with the `npm pack` contents and between the two languages |
| `stend-scheta` | 8 | the arithmetic of `src/schet.js`: three counters, `reasoningTokens`, a missing number |
| `stend-vstavki` | 8 | the reminder reaches `decision.messages`, exactly one per cycle, a new cycle after the return below the threshold |

Exit codes of a single stand: 0 — all probes green; 1 — some are red; 2 — BLINDNESS: the subject did not load (usually dependencies are not installed). Special cases: `stend-posle-kompakta` also returns 2 on a wrong number of probes (canary, expects 18); `stend-vstavki` returns 2 if the `agent/pre-step` hook is not registered; `stend-readme` returns only 0 or 1 and needs `npm` and a writable `HOME` (the contents probe calls `npm pack --dry-run`). `npm test` runs every `test/stend-*.mjs` in turn and combines the codes (the `test` script in `package.json`): 1 if any stand returned 1; otherwise the non-zero code of the LAST failed stand, whether 2 or another (codes have no precedence: 2 then 3 give 3; 3 then 2 give 2); otherwise 0.

Signs in live operation and failure analysis — `docs/GUARDS.md` and `docs/TROUBLESHOOTING.md`; design — `docs/ARCHITECTURE.md`.

## Limitations

- **Does not measure the actual request.** Occupancy is known only AFTER a call; a length rejection happens at the call itself, and a large increase can jump from below the threshold straight into a rejection. The window fill the platform compares against is a different number (`tokenMeter.measure(session).totalTokens`); the package does not read it.
- **Does not control the engine's compaction.** The platform compacts by its own threshold, independently of the package. The alarm arrives inside a step, while the insertion waits for the next `agent/pre-step`; if compaction comes first, the reminder is not delivered (the code records a live measurement: zero turns between the alarm and compaction). The step count in the "занятость вернулась под порог" line is a lower bound: steps cut off before the handler are not counted.
- **Incomplete data.** Calls without a provider number are not counted; after them occupancy may be stale (the alarm says so aloud).
- **The non-credible count guard DOES NOT CATCH** under-counting, any wrong number within the window, or cumulative `usage` until it outgrows one and a half windows: between 1 and 1.5 windows the alarm is raised with the mark "ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА" and may be false.
- **Blindness.** If the session journal is unavailable, shortened or has an invalid inheritance boundary — the line "СЛЕПОТА nudzh: …", insertion into that session is forbidden, `hvatitLi` answers `neizvestno`. There are no retries and no timers.
- **Cold process.** A session's history is read on first access to it, so `itog()` without a session is incomplete until all sessions have been touched.
- **The previous valid threshold value is one per process** (kept at module level): if different nodes of one process set different thresholds, the last one accepted from any of them applies.
- **The insertion replaces the step decision** with `{ kind: 'enter', messages }`; other fields of the original decision are not carried over. Whether the platform accepts such a message is not proven by the stands — only by a live run.
- **Dependencies:** the cordis platform (the `session/event` and `agent/pre-step` events, `ctx.provide`), `@deepseek-ai/dsh-llm` (`createUserMessage`, the journal format with `source.kind: 'plugin:<name>'`), `@deepseek-ai/schemastery`; the memory core's `pamyat` service is optional. Bringing recorded memory back into the conversation is the job of `dsh-pamyat-byudzhet`, not of this package.

## License

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
