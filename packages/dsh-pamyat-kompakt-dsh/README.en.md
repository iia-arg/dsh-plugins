# dsh-pamyat-kompakt-dsh

**Version:** 3.1.4

## Purpose

A context compaction engine for the DSH platform: the class `NashaSvodka`, a subclass of the native `BasicCompactionEngine` from `@deepseek-ai/dsh-compaction-basic`. The compaction moment, node selection and shadowing, the session journal record and returning the summary into the context stay native; the summary is written by the model of the sibling package `dsh-pamyat-kompakt` (`svodkaNashejModelyu`), and on any error the work is handed back to the platform's native summary. Beyond the summary the package caps retention at half of the surface (otherwise the native selection silently returns "nothing to compact"), waits for fresh usage after compaction on the Codex route, and after a successful compaction with an `[MODE=ACTIVE]` summary wakes the agent once with a continuation marker.

## What gets installed and where

The published contents are set by the `files` field of `package.json`; npm puts `package.json` and `LICENSE` into the archive even without the list:

| File | What it is |
|---|---|
| `index.mjs` | main module (`main`): the class `NashaSvodka` (also `default`), the fresh-usage watchdog `storozhUsage`, journal and tail helpers |
| `marker-step.mjs` | the continuation marker after compaction (`installMarker`) and the service journal audit at start-up |
| `continuation-mode.mjs` | the package settings file (paths of external commands) and the Codex marker mode file |
| `stend-*.mjs` | stands (see "Verification") |
| `LICENSE` | MIT license (the `license` field in `package.json`) |
| `CHANGELOG.md`, `README.md`, `docs/` | changelog and documentation (`docs/ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md`) |

`package.json` has no `scripts` and no `dependencies`; `dsh-pamyat-kompakt` is listed only in `devDependencies`, as the sibling's directory in the tree (`file:../dsh-pamyat-kompakt`). This is intentional: `dsh-pamyat-kompakt` is not published to the npm registry (`npm view dsh-pamyat-kompakt` — E404). The link will be removed at its first publication.

On the production machine:

- the package lives in `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (owner root, group agent-plugins);
- it reaches each agent's `web` profile through the link `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-kompakt-dsh` → `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (for every agent on the machine);
- the sibling `dsh-pamyat-kompakt` is the directory `/opt/agent-plugins/dsh-pamyat-kompakt`, linked as `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt` → `../dsh-pamyat-kompakt`; `index.mjs` resolves it by name from its own file;
- the platform packages `@deepseek-ai/dsh-compaction-basic` (index.mjs) and `@deepseek-ai/dsh-llm/message` (marker-step.mjs) are taken from the platform installation of the agent that loads the package: resolution starts from `process.argv[1]` (for agents this is `/opt/<agent>/app/node_modules/@deepseek-ai/dsh/lib/bin.js`), on any error — from the module file. `/opt/agent-plugins/node_modules/@deepseek-ai` contains no `dsh-compaction-basic`, so the engine does not load without the agent's platform installation.

At run time the package writes into the agent home (`$DSH_HOME`, otherwise `$HOME/.dsh`):

- `kompakt-dsh/usage-alerts/<sha256>.json` — alert and all-clear marks of the usage wait (directory 0700, files 0600);
- `kompakt-dsh/zhurnal-kursor-<agent>.json` — the cursor of the service journal audit (atomic write, 0700/0600).

## Installation

The package is installed by npm from the lock of the shared directory `/opt/agent-plugins`, from a shelf tarball:

1. The tarball is placed at `/opt/agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<version>.tgz`.
2. `/opt/agent-plugins/package.json` holds the dependency line `"dsh-pamyat-kompakt-dsh": "file:../agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<version>.tgz"`; next to it — `"dsh-pamyat-kompakt": "file:./dsh-pamyat-kompakt"`. `package-lock.json` pins the set.
3. `npm` in `/opt/agent-plugins` installs the package into `node_modules/dsh-pamyat-kompakt-dsh`; the links from the agent profiles already point there.
4. The code is loaded when the agent process starts, so a new version takes effect after the agent service restarts.

`package.json` declares `peerDependencies`: `dsh-pamyat-kompakt` `>=3.1.1` (required; from 3.1.1 the sibling accepts the platform cancellation signal) and the platform packages `@deepseek-ai/dsh-compaction-basic`, `@deepseek-ai/dsh-llm` `>=0.2.0-rc.2` — optional (`peerDependenciesMeta.optional`): npm does not install them, the package takes them from the agent's platform installation. So `npm install` of the archive without the sibling refuses naming `dsh-pamyat-kompakt` instead of passing silently; install the sibling of the right version before or together with this package.

The package is not mounted by a separate preset line but inside the `compaction` group of the profile `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`: the `compaction-basic` element gets `name: dsh-pamyat-kompakt-dsh` and replaces the platform's native engine. The `/compact` command sits in the same group: `command-compact` takes the `compaction` service from its own context and outside the group would see the root native engine. The shape used by the agents (`thresholdRatio` differs: 0.8 for most, 0.65 for two Codex agents):

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: dsh-pamyat-kompakt-dsh
      config:
        thresholdRatio: 0.8
        retainRatio: 0.06
        compactionRetries: 0
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

The agent service environment sets the agent name `KOMPAKT_AGENT=<agent>`. On the production machine, for most agents this is the drop-in `/etc/systemd/system/<service>.d/60-kompakt-agent.conf`, and for two Codex agents it is an `Environment=KOMPAKT_AGENT=<agent>` line in the unit itself (`/etc/systemd/system/<agent>.service`). `dsh-pamyat-kompakt` itself is configured according to its own documentation.

## Configuration

### Engine config (`config` of the `compaction-basic` element)

The package has no schema of its own: `NashaSvodka` inherits `static Config`, `static inject` and config resolution (`resolveConfig`) from `BasicCompactionEngine`. All keys go to the platform; the package itself reads only `thresholdRatio`, `retainRatio`, `retainTokens` and `modelPolicies` from the already resolved `this.config`. Defaults come from the platform code.

| Key | Type | Default | Read by | Meaning |
|---|---|---|---|---|
| `thresholdRatio` | number | 0.8 | platform; package — for the "nothing to select" line | window share at which pressure counts as the threshold |
| `retainRatio` | number | 0.16 (if `retainTokens` is not set) | platform; package — for retention R | window share for the verbatim tail; the package retains at most `⌊surface × 0.5⌋` |
| `retainTokens` | integer ≥ 0 | none | platform; package — for retention R | explicit retention in tokens instead of `window × retainRatio`; not together with `retainRatio` |
| `modelPolicies` | array of policies `{provider, model, …}` | `[]` | platform; package | for an exact provider/model pair with a policy the package does not change retention (native path) |
| `compactionRetries` | integer ≥ 0 | 1 | platform | extra passes if pressure stays above the threshold after compaction |
| `headroomTokens` | integer ≥ 0 | 65536 | platform | compaction headroom in the threshold computation |
| `maxTokens` | integer ≥ 1 | equal to `headroomTokens` | platform | output cap of the native summary |
| `maxOverflowRetries` | integer ≥ 0 | 1 | platform | recovery retries on context window overflow |
| `summarizationProvider`, `summarizationModel` | string | `""` | platform | model of the native summary; matter only when the package has handed the work to the native summary |
| `auto` | boolean | `true` | platform | `false` — the platform does not subscribe automatic pressure and overflow compaction |

Retention: `R = retainTokens ?? ⌊window × retainRatio⌋`, `M = min(R, ⌊surfaceTokens × 0.5⌋)` (`DOLYA_POVERHNOSTI = 0.5`). With `M < R` the package substitutes, for the synchronous part of the platform's `compactIfNeeded` call, a frozen config copy with `retainTokens = M`. This applies only to the `pressure` trigger, a known provider/model pair and no `modelPolicies` entry for it.

### Package settings file

Path — `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf`, changed by the variable `DSH_PAMYAT_KOMPAKT_DSH_CONF`. `KEY=value` lines; a comment is only a line starting with `#`; for a repeated key the last occurrence wins. Value order: environment variable named as the key → file → default. If the file exists but cannot be read, or a value contains " #" (a space or tab before `#`), plugin loading fails with an exception.

| Key | Default | Meaning |
|---|---|---|
| `KOMPAKT_AGENT_ALERT` | `/usr/local/bin/agent-alert` | owner alert channel |
| `KOMPAKT_AGENT_REGISTRY` | `/usr/local/bin/agent-registry` | agent registry: name of the agent's own system service for the audit |
| `KOMPAKT_JOURNALCTL` | `/usr/bin/journalctl` | service journal reader (also via `sudo -n`) |
| `KOMPAKT_REZHIM_FAJL` | `/etc/dsh-pamyat/continuation-mode.json` | Codex marker mode file |

The `sudo` path for the fallback journal read on a permission failure is `/usr/bin/sudo`. It is hard-coded in `marker-step.mjs`; there is no key or variable for it.

Mode file: `{"version":1,"codex_marker":[<agents>]}`, at most 4096 bytes, names of the form `[a-z][a-z0-9_-]{0,31}`, extra keys forbidden. No file — the Codex marker is off; an invalid file — an exception, and the marker is refused for Codex. On the Claude route (`claude-oauth` + `claude-*`) the marker works regardless of the file.

### Environment variables

| Variable | Where | Meaning |
|---|---|---|
| `KOMPAKT_AGENT` | marker-step.mjs | agent name: marker key, name for the registry in the audit; must match `^[a-z][a-z0-9_-]*$` |
| `DSH_PAMYAT_KOMPAKT_DSH_CONF` | continuation-mode.mjs | path of the package settings file |
| `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY`, `KOMPAKT_JOURNALCTL`, `KOMPAKT_REZHIM_FAJL` | continuation-mode.mjs | same as the settings file keys, and stronger than the file |
| `DSH_HOME`, `HOME` | index.mjs, marker-step.mjs | root for alert marks and the audit cursor (`$DSH_HOME`, otherwise `$HOME/.dsh`) |
| `INVOCATION_ID` | marker-step.mjs | run id (set by systemd; otherwise a random UUID) |

The package passes `AGENT_ALERT_POPYTOK=3`, `AGENT_ALERT_TAJMAUT=20`, `AGENT_ALERT_PAUZY="5 15"` to the child `agent-alert` (the process is limited to 100 s), and `LC_ALL=C` to `journalctl`. The package does not read `KOMPAKT_MODEL`: the `model` label in the answer to the platform comes from the sibling's `KOMPAKT_MODEL` export.

### Services, events, hooks

- Service: the engine registers as the `compaction` service (the platform base class). The platform's `static inject` requires `llm`, `tokenMeter`, `sessions`.
- Through `ctx.get` the package uses, when present: `pamyat` with `sobytiyaSessii` (memory core `dsh-pamyat-core`, session journal reading; without it — `session.events`/`snapshotEvents()`), `sessions` (`flush` for the marker), `agents` (the session's live agent).
- Platform methods overridden: `summarize` (our summary with the tail) and `compactIfNeeded` (waiting for fresh usage on Codex). Added: `compactSUderzhaniem` (retention ≤ ½ of the surface); `compactRegion` is replaced for a single call only.
- `summarize` answer: `summary` — the summary plus, if the tail was supplied, the `STROKA_HVOSTA` line ("Дальше — дословный хвост журнала до сжатия (N сообщ.): …", "the verbatim tail follows"); `rawOutput` — the summary without it; `provider: "dsh-pamyat-kompakt"`; `llmStreamCall: false`; `maxTokens: 0`. The platform cancellation signal (`summarize(input, agent, signal)`) is passed to the sibling and aborts the summary model call; a cancellation, like any error, gives a log line and the platform's native summary.
- Subscriptions: `session/event` (usage watchdog; continuation marker), `agent/status`, `agent/pre-step` (marker insertion after `next()`), `dispose`, `our/compaction-status` (the engine pushes its `this.config` into the reply).

In detail, with examples — `docs/SETTINGS.md`; design — `docs/ARCHITECTURE.md`.

## Verification

`package.json` has no `scripts`: each stand is a separate file, run as `node stend-<name>.mjs` from the package directory. Stands expect neighbours in a shared `node_modules` (`dsh-pamyat-kompakt`, `dsh-pamyat-core`, `dsh-pamyat-restore`, `@deepseek-ai/*`), i.e. they run in `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh`, not in the git tree. Stands that load `marker-step.mjs` need `@deepseek-ai/dsh-llm` to resolve from the stand file or the module.

The audit and alert stands compare external-command calls against the default paths hard-coded in the stands themselves: `/usr/local/bin/agent-registry` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`, `stend-yakorya-audita`, `stend-identifikatora-audita`), `/usr/bin/journalctl` and `/usr/bin/sudo` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`), `/usr/bin/systemctl` (the same four audit stands and `stend-identifikatora-audita`; the path is set in code, it has no settings key), `/usr/local/bin/agent-alert` (`stend-predela-usage`). If `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY` or `KOMPAKT_JOURNALCTL` in the environment or in the package settings file point to another path, these stands exit with code 1 on correct code. Run them without these keys. Only `stend-nastrojki-i-rezolva` removes the keys from its child process environment by itself.

| Stand | What it checks | What it needs |
|---|---|---|
| `stend-hvosta` | `summarize` supplies the tail as a second block, and not when the joint does not match | `DSH_TEST_APP` |
| `stend-uderzhaniya` | retention ≤ ½ of the surface on the real `compactIfNeeded` of the platform and the package | `DSH_TEST_APP` |
| `stend-svezhego-usage` | waiting for fresh usage on the real `Session`/`TokenMeter` | `DSH_TEST_APP`, sibling `dsh-pamyat-core` |
| `stend-predela-usage` | one alert after 3 completed turns without usage | `DSH_TEST_APP` |
| `stend-otboya-usage` | one all-clear after a delivered alert | `DSH_TEST_APP` |
| `stend-styka-sobytij` | session journal on DSH 0.1.1 and 0.2.0 shapes through the memory core | `DSH_TEST_APP`, sibling `dsh-pamyat-core` |
| `stend-otmetki` | phases and races of the continuation marker | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-fazy-otmetki` | phase `superseded`, failure text, `dsh-llm/message` from the caller's installation, mode file validation | — |
| `stend-stop-komandy` | only a human "/stop" in the Telegram envelope cancels the marker | optionally `MARKER_INPUT_FIXTURE`; a platform installation next to it (`@deepseek-ai/dsh-llm`), missing — BLINDNESS, exit 2 |
| `stend-pisma-prodolzheniya` | an admitted gateway continuation letter cancels the marker | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-dostupa-audita` | service name from the registry, `sudo -n` only on a permission failure | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-pustogo-audita` | an empty history on the real `journalctl` is not an alert | permission to read the journal directly or via `sudo -n`; a platform installation next to it (`@deepseek-ai/dsh-llm`), missing — BLINDNESS, exit 2 |
| `stend-kursora-audita` | audit cursor, 7-day window, retry on a rejected cursor | `DSH_TEST_APP`, `STEND_BOLSHOJ_UNIT` (a service with ≥ 72,000 entries over 7 days). The stand counts the entries itself, directly with `/usr/bin/journalctl`, without `sudo`: without permission to read that service's journal it will find fewer than 72,000 entries and exit with code 2 |
| `stend-vremeni-audita` | S1-form audit time (7-day window: search + id check) on the densest agent service from `agent-registry list`: < 20 s — GREEN (0), ≥ 20 s — YELLOW (1), audit not ok — RED (1); corruption for probes — `STEND_PORCHA=zaderzhka:<ms>` or `otkaz` | `DSH_TEST_APP`; the account needs access to agent service journals (`systemd-journal` group), otherwise all have 0 entries — code 2 |
| `stend-yakorya-audita` | the audit takes only lines of the form `[kompakt-dsh <version>] [continuation-marker] {…}` from the start | `DSH_TEST_APP` |
| `stend-identifikatora-audita` | the marker search is narrowed by the service's `SYSLOG_IDENTIFIER` field (not hard-coded); 0 markers while `[kompakt-dsh` lines are under another identifier — blindness, the cursor does not move | `DSH_TEST_APP` |
| `stend-nastrojki-i-rezolva` | settings file and two-step resolution of the platform package | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-pristavki` | every log line carries name and version | `DSH_TEST_APP` |
| `stend-literala-hvosta` | `STROKA_HVOSTA` equals the `dsh-pamyat-restore` literal | `DSH_TEST_APP`, sibling `dsh-pamyat-restore` |
| `stend-sostava` | the `files` whitelist: garbage stays out, nothing mandatory is lost | `npm`, `tar`; package path as an optional argument |

`DSH_TEST_APP` is the platform installation directory (the stand sets `process.argv[1] = $DSH_TEST_APP/node_modules/@deepseek-ai/dsh/lib/bin.js`), e.g. `/opt/<agent>/app`.

Exit codes:

- `0` — all probes passed;
- `1` — mismatch; for stands on `node:assert` (`stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita`, `stend-predela-usage`, `stend-svezhego-usage`) — an uncaught exception on a mismatch;
- `2` — stand blindness: `DSH_TEST_APP` unset, the subject or a sibling did not load, the expected probe count did not match. `stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita` and `stend-nastrojki-i-rezolva` check, before loading `marker-step.mjs`, that `@deepseek-ai/dsh-llm/message` resolves next to them; if not — BLINDNESS, exit 2 (previously a stack trace with exit 1). `stend-sostava` has no code 2. Among the `assert` stands, code 2 comes from `stend-predela-usage` and `stend-svezhego-usage`: both when `DSH_TEST_APP` is unset, and the latter also without the sibling `dsh-pamyat-core`;
- `143`/`130` — interruption by SIGTERM/SIGINT. Only `stend-hvosta`, `stend-fazy-otmetki` and `stend-sostava` turn the signal into an exit that removes the temporary directory. Six more stands create a temporary directory (`stend-kursora-audita`, `stend-nastrojki-i-rezolva`, `stend-otboya-usage`, `stend-predela-usage`, `stend-styka-sobytij`, `stend-yakorya-audita`) but have no signal handler: an interrupted stand leaves its directory in the temporary files directory (`os.tmpdir()`).

In production the sign of mounting is the line at engine creation: `[dsh-pamyat-kompakt-dsh <version>] движок создан платформой: наша сводка ПОДКЛЮЧЕНА, при отказе модели отдаём родной` ("engine created by the platform: our summary CONNECTED, on model failure we hand over to native"). The sign of operation is, at compaction, `[kompakt-dsh <version>] наша сводка: N зн. из M зн. прозы` ("our summary: N chars from M chars of prose"); the line `наша сводка НЕ СОСТОЯЛАСЬ (…) — отдаю родной` ("our summary FAILED (…) — handing over to native") means the compaction went with the native summary. What each guard and stand catches — `docs/GUARDS.md`; failure analysis — `docs/TROUBLESHOOTING.md`.

## Limitations

- The platform packages `@deepseek-ai/dsh-compaction-basic` and `@deepseek-ai/dsh-llm` are declared neither in `dependencies` nor in `peerDependencies`, and `dsh-pamyat-kompakt` only in `devDependencies`: npm will not pull them in. If any of the three does not resolve, module loading throws and the agent preset does not mount.
- The summary is written only by the sibling `dsh-pamyat-kompakt`; an error or empty prose in the input — a log line and the platform's native summary (its model is `summarizationProvider`/`summarizationModel` or the agent's model).
- The tail is not supplied if the joint does not match, the session journal cannot be read or the head is empty; a head that does not start at `surface.nodes[0]` is not caught by the check. Manual `/compact` and overflow recovery run with retention 0 — no tail.
- Retention ½ of the surface is a constant in code, not a setting. The substitution relies on the platform reading the policy before the first `await` in `compactIfNeeded`; if that changes, retention becomes native, announced by the line `🔴 платформа НЕ прочла подстановку удержания` ("the platform did NOT read the retention substitute").
- The package computes R from the full window, the platform from the window minus the response reserve; the threshold for the "nothing to select" line is `window × thresholdRatio`, without the pressure-budget cap the platform applies. The numbers of that line may differ from the platform's decision.
- Waiting for fresh usage, its alert and all-clear apply only to the Codex route (`provider` `claude-oauth`, model `gpt-*`) with a `usage` pressure baseline. If the session journal cannot be read there is no waiting, compaction goes the native way, one `🔴` line per session.
- The continuation marker lives in process memory: a restart between compaction and acceptance loses it (the audit at the next start sends an alert, the task is not restored). It needs a well-formed `KOMPAKT_AGENT` and a summary whose first line is `[MODE=ACTIVE]`; at most two wakes; "accepted" means the input reached the agent, not that the task was done. Only "/stop" at the start of a private Telegram message in the standard envelope cancels it; a quote, "/stop!", "/stop@bot", other transports are not recognised, and a forged envelope from a trusted plugin is not detected.
- The external commands `agent-alert`, `agent-registry`, `journalctl`, `sudo` are not part of the package; without them the summary and retention work, while alerts and the audit fail with a log line. The audit needs the systemd journal and permission to read its own service journal.
- Log lines, the continuation insertion text and labels are in Russian.
