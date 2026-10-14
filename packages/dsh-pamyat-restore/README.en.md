# dsh-pamyat-restore

## Purpose

A dsh (cordis) plugin: the reading side of agent memory. Layer B: after a successful session compaction it inserts the compaction summary from memory into context (or only a continuation prompt, when a summary from the `dsh-pamyat-kompakt` engine is already in the compacted surface). Layer C: on the first eligible step of a session after process start it delivers a welcome briefing — the latest memory records with a `use/verify/ignore` decision and its reason, plus the latest compaction summary in full, unless the same summary already stands in this session's surface (`telegram-v2-*` sessions get knowledge only, without the summary). The plugin only adds a context message at `agent/pre-step`: it does not decide the turn, does not guard tool calls, and never substitutes stub records for memory.

## What gets installed and where

Package files (`files` in `package.json`): `src/index.js` (all plugin code), `test/stend-*.mjs` (test stands), `README.md`, `README.en.md`, `CHANGELOG.md`, `docs/` (`ARCHITECTURE.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`). Besides these, npm adds `package.json` and `LICENSE` (the MIT license text; the `license` field in `package.json`) to the archive by itself.

Deployed path on the machine: `/opt/agent-plugins/node_modules/dsh-pamyat-restore`. An agent profile sees it through the symlink `<DSH_HOME>/profiles/web/node_modules/dsh-pamyat-restore` → `/opt/agent-plugins/node_modules/dsh-pamyat-restore`.

What `src/index.js` registers:

- `inject = ['agents']` — the plugin waits for the `agents` service and does not start without it.
- `ctx.provide('newConversationRestore', { version: 1 })` — a flag that a new conversation generation will be restored. Two readers, both refuse a new generation without it: the `dsh-telegram-multiagent` channel before a `/new` transition and the subscription adapter `dsh-subscription-adapter` (the new-generation request and the `conversationIdentity.check` service) — via `ctx.get('newConversationRestore')?.version === 1`.
- `ctx.on('session/event', …)` — catches `compaction/start`, `compaction/summary`, `compaction/end` from the session journal (there is no separate `compaction/*` hook). A successful `compaction/end` arms restoration for that session.
- `ctx.on('agent/pre-step', …, { prepend: true })` — calls `next()` first, then, when needed, appends one `createUserMessage` message with `source.kind = 'plugin:dsh-pamyat-restore'`, `form: 'snapshot'` and sections `dsh-pamyat-restore#zapis-<id>` for the delivered records. A `reject` decision or an aborted step is left untouched.
- No tools are registered.
- Latch `globalThis.__pamyatRestore`: a second `apply` in the same process returns immediately.

Other services are obtained through `ctx.get`, not `inject` (their absence does not stop the agent):

- `pamyat` (core, `dsh-pamyat-core`): `prochitat` (reads records: 10 knowledge records, and separately 1 summary of class `klassSvodki`), `dostupna`/`pochemuNedostupna`, `sessiyaIsklyuchena` (session exclusion policy), `otmetitKasanie` (touches delivered records, `povod: 'vydacha-agentu'`), `sobytiyaSessii`/`eSvodkaSzhatiya` (session journal reading; without them it falls back to `session.events`).
- `byudzhetPamyati` (`dsh-pamyat-byudzhet`): `otobrat({ zapisi })` — knowledge selection for layer C. Layer B never calls the budget.

Files written by the code:

- `welcomeOtmetki` (default `~/.dsh-pamyat-welcome-otmetki.json`) — JSON mapping session id to the last briefing time in ms; written with `writeFileSync`, the directory is created if needed.
- `<welcomeOtmetki>.compaction-ok.json` — evidence of a successful platform compaction `{version:1, scope, session, compactionId, time}`; written atomically: temporary `<…>.<uuid>.tmp` with mode 0600, `fsync`, `rename`, directory `fsync`.

All plugin logging is stderr lines prefixed `[dsh-pamyat-restore <version from package.json>]`.

## Installation

**Where to install from.** The package is published to npm with release 3.1.2 (order and window — by the owner's decision). Until then the npm registry holds an old `0.1.0-alpha.*` edition (measured 10.10.2026, `npm view dsh-pamyat-restore version`): `npm install dsh-pamyat-restore` installs that one, not the one described here. Until the release, install from the source tree: `npm pack <дерево>/packages/dsh-pamyat-restore`, then `npm install ./dsh-pamyat-restore-<версия>.tgz`.

On the machine the package is installed once for all agents, with npm from the lock file of `/opt/agent-plugins`. In `/opt/agent-plugins/package.json` the dependency points to a tarball:

```json
"dsh-pamyat-restore": "file:../agent-plugins-tarbally/dsh-pamyat-restore-<версия>.tgz"
```

Tarballs live in `/opt/agent-plugins-tarbally/`; the exact version and `integrity` are pinned in `/opt/agent-plugins/package-lock.json`. The peer dependencies (`@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`) and, for real data, `dsh-pamyat-core` must sit next to it in the same `node_modules`.

Enabling: a symlink from the agent profile to the shared directory and an entry in the `insert` section of `<DSH_HOME>/profiles/web/cordis.patch.yml`. Example in the form of the production profiles (the marker file path is a sample; each agent has its own):

```yaml
- insert:
    - name: dsh-pamyat-restore
      id: dsh-pamyat-restore
      config:
        klassSvodki: svodka-kompakcii
        restoreEnabled: true
        welcomeEnabled: true
        welcomeBudget: 15200
        ignoreAfterMs: 604800000
        useVeraThreshold: 0.7
        welcomeInterval: 86400000
        welcomeOtmetki: /opt/<агент>/pamyat/welcome-otmetki.json
```

New settings take effect only after the agent process restarts: a repeated `apply` in the same process returns immediately (latch `globalThis.__pamyatRestore`).

## Configuration

`config` keys (Schema `Config` in `src/index.js`):

| Key | Type | Default | Effect |
|---|---|---|---|
| `restoreEnabled` | boolean | `true` | Layer B: restoration after a successful `compaction/end`. |
| `welcomeEnabled` | boolean | `true` | Layer C: welcome briefing. |
| `welcomeBudget` | number | `800` | Soft length limit for briefing knowledge lines (JS string length units). The first line always fits; the frame, cancellation lines and the compaction summary are outside the limit. |
| `welcomeInterval` | number | `86400000` | Minimum interval between briefings of the same session, ms (tracked in `welcomeOtmetki`). |
| `welcomeOtmetki` | string | `join(homedir(), '.dsh-pamyat-welcome-otmetki.json')` | Briefing marker file; the `<…>.compaction-ok.json` path is derived from it. When several agents share a home, give each its own path. |
| `ignoreAfterMs` | number | `604800000` (7 days) | Older records get `ignore`. |
| `useVeraThreshold` | number | `0.7` | Trust at or above it gets `use` (with the caveats below). |
| `ignoreVeraThreshold` | number | `0.3` | Trust below it gets `ignore`; between the thresholds — `verify`. Must be below `useVeraThreshold`; otherwise startup logs «пороги веры несовместимы» (trust thresholds are incompatible) to stderr (loading continues). |
| `klassSvodki` | string | `svodka-kompakcii` | Record class of the compaction summary. Must match the secretary `klass` (`dsh-pamyat-secretary`), otherwise summaries are "not found". |

`decide` order for a knowledge record: unknown time — `verify`; older than `ignoreAfterMs` — `ignore`; core trust state (`otmenena` — `ignore` with a visible ⛔ line without content; `oprovergnuta`/`otmetka-negodna`/`utochnena` — `verify`; `podtverzhdena` — `use`); trust not measured — `verify`; below `ignoreVeraThreshold` — `ignore`; below `useVeraThreshold` — `verify`; if all ratings are model-authored (`kem` starts with `model:`) — `use` only with "helped" from two distinct `kem` values.

The plugin code reads no environment variables (the default path depends on `homedir()`). The stands read: `DSH_SESSION`, `DSH_TEST_APP`, `STEND_APP` (`test/stend-restore.mjs`), `PREDMET` (`test/stend-krik-zvuchit.mjs`), `STEND_RESTORE` (`test/stend-welcome-v2.mjs`).

Files: writes `welcomeOtmetki` and `<welcomeOtmetki>.compaction-ok.json` (see above), reads them back, and reads the package `package.json` (version for log lines).

## Verification

The stands live in `test/`, run on fixtures and temporary directories, and call no live services. Exit codes of each stand: 0 — match, 1 — mismatch (including an uncaught `assert`), 2 — blindness: the check could not run (missing dependencies, neighbouring package or SDK); exit 2 is not success.

```sh
    npm test
    node test/stend-restore.mjs
    node test/stend-doveriya-vydachi.mjs
    node test/stend-readme.mjs
    DSH_SESSION=<платформа>/node_modules/@deepseek-ai/dsh-session/lib/index.js node test/stend-restore.mjs
```

`npm test` runs every `test/stend-*.mjs` in turn and returns: 1 if any stand returned 1; otherwise the nonzero code of the last stand that returned 2 or another nonzero code; 0 if all returned 0. It needs a POSIX shell.

| Stand | What it checks |
|---|---|
| `test/stend-restore.mjs` | Main stand: layers B and C separately — memory availability, message shape (`id`, role, `source.kind`, sections), trust and thresholds, budget, summary, touches. With an SDK (`DSH_SESSION` or `DSH_TEST_APP`/`STEND_APP`) — the event passes the platform load validator; with a neighbouring `dsh-pamyat-core` — thresholds agree with the trust formula; with a neighbouring `dsh-pamyat-secretary` — `klassSvodki` matches its `klass`. |
| `test/stend-bez-isklyucheniya.mjs` | Without core `sessiyaIsklyuchena`, without the core, or for an excluded session, memory is not read and nothing is inserted; after recovery insertion resumes. |
| `test/stend-doveriya-vydachi.mjs` | Trust states: cancellation yields an ⛔ line without content or touch; end-to-end probe through the real core on a temporary database. |
| `test/stend-kasaniya-podannyh.mjs` | Touches go exactly to records that entered the text (real core, temporary database, checked through a separate SQL connection). |
| `test/stend-klass-nol.mjs` | Zero summaries before and after successful compaction, failed `compaction/end`, pre-load history, corrupt and foreign `.compaction-ok.json`, write and read failures. |
| `test/stend-krik-zvuchit.mjs` | In a separate process with real cordis: the startup line with the version from `package.json` reaches stderr; without the `agents` service the plugin waits silently. |
| `test/stend-nastavleniya-ocenki.mjs` | The `pamyat_ocenit` instruction appears exactly once in the briefing and only with delivered knowledge. |
| `test/stend-new-session.mjs` | A `telegram-v2-*` session receives knowledge but not the old global summary (neither in welcome nor after a foreign compaction); `telegram-a2a` keeps both paths. |
| `test/stend-otmenennyh-v-konce.mjs` | Cancellations go last, outside `welcomeBudget`: first 3 by id, the rest summarized; record date DD.MM in Moscow time. |
| `test/stend-pometki-otnoshenij.mjs` | Formatting of record relationships (cancelled/refined/cancels/refines) and `#id`. |
| `test/stend-readme.mjs` | Both READMEs: settings keys, links to files in the `npm pack` archive, identical verification commands, mention of blindness; dependency version shape; runs the other stands from the unpacked archive (0 and 2 are acceptable). |
| `test/stend-sleda-vydachi.mjs` | Delivery trace line: use/verify/ignore/"did not fit" counts add up to the number of selected records. |
| `test/stend-styka-sobytij.mjs` | Core integration: `pomoshchnikYadra` via `ctx.get` and summary lookup in the surface on DSH 0.1.1 and 0.2.0 journal shapes. |
| `test/stend-use-ot-modeli.mjs` | The `use` rule for model-only ratings: "helped" from two distinct `kem` values is required. |
| `test/stend-welcome-v2.mjs` | `welcomeInterval` is per session: every new `telegram-v2-*` session gets a briefing, a restart of the same session within the interval does not. |

`stend-doveriya-vydachi`, `stend-kasaniya-podannyh`, `stend-styka-sobytij` and parts of `stend-restore` look for a neighbouring `../../dsh-pamyat-core` (and `../../dsh-pamyat-secretary`); without them the result is exit 2. `stend-kasaniya-podannyh` needs `node:sqlite`.

## Limitations

- Dependencies: peers `@deepseek-ai/dsh-llm` (subexport `@deepseek-ai/dsh-llm/message`) and `@deepseek-ai/schemastery`; ranges are in `package.json`. The only required service is `agents`. Without `pamyat` (`dsh-pamyat-core`) the plugin starts but delivers nothing and says so on stderr. Without `byudzhetPamyati` (`dsh-pamyat-byudzhet`) the briefing is built without budget selection. Summaries are written by `dsh-pamyat-secretary`; the prompt-only path (no re-insertion) works only for summaries from provider `dsh-pamyat-kompakt` (package `dsh-pamyat-kompakt-dsh`). The code has no direct link to `dsh-pamyat-omega`.
- Without core `sessiyaIsklyuchena`, memory reads and delivery are refused (`ОТКАЗ PAMYAT_POLITIKA_NEDOSTUPNA` on stderr); the normal agent turn proceeds.
- `telegram-v2-*` sessions: the global summary is not carried over after a foreign compaction; welcome delivers knowledge only, without the compaction summary.
- Layer C reads at most 10 records; the budget selects only from them. The summary in welcome is delivered in full, outside `welcomeBudget`, the budget service and `decide` checks (age and trust); the old-summary warning exists only in layer B. If its text (without the final continuation-promise paragraph) is already contained in a compaction summary message on the session surface (`svodkaNaPoverhnosti` in `src/index.js`), it is NOT raised into the briefing — stderr says «уже стоит в поверхности этой сессии — в брифинг НЕ поднята» (already in this session's surface, not raised); if the surface could not be read, the summary is raised as before with the line «поверхность сессии не прочитана — есть ли там сводка, НЕ ЗНАЕМ» (surface not read, unknown whether the summary is there).
- `welcomeBudget` is not a limit on the whole message.
- Markers (in-process and on disk) are set before memory is read: if reading fails, the session's briefing is not retried until a new process or the interval expires. Within one process a session gets at most one briefing, even after `welcomeInterval`. A corrupt or unreadable `welcomeOtmetki` reads as "no briefing yet".
- Touches are recorded before the message is returned; this does not prove the model received it.
- A `use` decision is an annotation, not proof of truth; distinct `kem` values do not prove independent deliveries (that is the core write protocol).
- No backups, no encryption, no sanitizing of prompt instructions in stored knowledge, no watchdogs: logging is stderr only, and someone outside must read it.
- The `npm test` script is written for a POSIX shell and does not work in other shells.

## License

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
