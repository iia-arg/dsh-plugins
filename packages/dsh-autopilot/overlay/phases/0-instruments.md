<!-- Derived from nick-vels/skills (MIT, Copyright (c) 2026 Nick Vels), modified by Aleksandr Argelander and contributors. -->

# Sadik — one command per event

This installed adaptation replaces upstream's local HTTP server. The only event command is:

```bash
python3 /opt/autopilot/current/skill/tools/ap.py --no-serve EVENT ...
```

Run it from the project's physical root. No preliminary copying into an existing `.autopilot/` is allowed: the command checks the operator before it writes project state. Do not run `http.server`, create `serve.pid`, start a second publisher, or edit `state.js` by hand.

## Start

The installer provisions `/srv/autopilot/public/<agent>/` for the operator UID and read-only web service. `AUTOPILOT_AGENT` selects the registered label (default Unix login); `AUTOPILOT_PUBLIC_ROOT` defaults to `/srv/autopilot/public`. Set these consistently before the first run. A shared Unix UID is not an isolation boundary between logical agents.

```bash
python3 /opt/autopilot/current/skill/tools/ap.py --no-serve init \
  --slug telegram-repair-bot --title "Telegram repair bot" \
  --mode semi --depth normal --memory-file AGENTS.md --memory-owner autopilot \
  --skill-dir /opt/autopilot/current/skill
```

The command creates `.autopilot/` only after argument/owner checks, selects the physical release, copies its template under the project lock, and records the release fingerprint and state schema in `state.js` as `_sadik`. `.autopilot/sadik.json` is a readable mirror, not the authority. Project/run IDs are independent UUIDs, not the slug/date. A second project or a new run cannot overwrite the first URL.

The operator is the nearest live `codex`/`claude` ancestor, or the live same-UID ancestor explicitly named by `AUTOPILOT_OPERATOR_PID`. The value must identify the long-lived orchestrator, not the one-shot event Python or a disposable shell. Unknown ownership refuses. PID, process start, UID and boot are checked; file age never unlocks a project. If another operator is alive, stop without changing state. If that identity is proven gone, the next resume can take ownership. Executors send their results to the orchestrator and do not invoke this command themselves.

## Events

Every row below uses the same prefix `python3 /opt/autopilot/current/skill/tools/ap.py --no-serve`:

| Event | Arguments |
|---|---|
| enter/close a stage | `stage <id>`, `stage <id> done`, `stage <id> skip --note "reason"` |
| set tier/base commit | `set tier=T2 baseCommit=<sha>` |
| publish/check tickets | `tickets`, `check-plan` |
| ticket lifecycle | `ticket <id> start`, `review`, `repair --note "reason"`, `done --tests 4/0 --commit <sha>`, `fail --note "reason"`, `retry`, `reset` |
| coverage/blind acceptance | `coverage found=2 fixed=1 deferred=1 --item "reason"`, `blind checked=4 matched=3 --mismatch "reason"` |
| test result | `tests 4/0` |
| debt/report | `add concerns "reason"`, `add report "result"`, `add debt.emptyEnv VARIABLE_NAME` |
| ask the owner | `ask briefing\|spec\|plan\|action\|stop --note "question"` |
| answer received | `answered` |
| resume | `resume` |
| finish/reopen | `finish --result "result"`, `reopen` |
| refresh | `sync` |
| numeric usage snapshot | `usage ENGINE --snapshot <private-file>` |

Do not place secret values in arguments, notes, state or the panel. Unknown flags (including `--dry-run`, `-n`, `--check`) refuse before an event is written; this command has no pretend-write mode.

Each successful event saves accounting, refreshes the local snapshot and attempts one export. Only `dashboard.html` and `state.js` are published under `<agent>/<project-id>/<run-id>/`, with a minimal agent index. The run-directory entry is exchanged atomically; the index is a separate atomic update under the agent directory lock. This does not promise one transaction across two HTTP requests or across the index and run directory.

An export failure prints `панель не обновлена`, a reason and the last confirmed successful time. The event remains recorded; the next ordinary event makes the next attempt. The export worker is stopped at 4.8 seconds, with at most 0.1 seconds for cancellation. No infinite retry. A busy agent index gets at most 0.25 seconds. The static service is independent of this command; no HTTP request to it is needed for accounting.

Use the URL printed by the command through the protected common host configured by the administrator. The service must refuse hidden/staging paths and serve only the registered static routes. Finish retains the published panel. Local-server recovery and localhost links from upstream do not apply on sadik.

On resume, run `commits` before relaunching work; read each `!` diagnostic and the pinned phase0-resume procedure. One event, one message: group its accounting command with the associated work and report.

### Usage snapshots

Master records Codex after a completed wave and at final acceptance; Claude collection remains diagnostic until the accepted caller exists. The source owner runs its reader only after the selected requests/turns are terminal; the operator supplies the run ID, time window and explicit request scope. The collector does not discover a whole run from a long session. Master receives only the numeric file and calls `usage ENGINE --snapshot FILE` through the same pinned `ap.py --no-serve` prefix. Snapshot files are private run artifacts; the exporter copies only typed state and the dashboard.

Codex: use the physical release's `tools/measure-run-codex.py --snapshot-json --run-id <_sadik.run_id>` with explicit thread/start/end and the pinned upstream measurement file. Claude: the owner of the SDK/ledger calls the same release's `tools/measure-run-claude.py --manifest FILE`; Master supplies the manifest's run binding. This grants no access to another agent's HOME. See `tools/README-usage-snapshot.md` in the physical release for the commands.

A reader exit2 with a valid matching incomplete/not_measured snapshot may explicitly replace the selected bucket with nulls. Other errors do not become zeros or a fabricated snapshot. No reader, timer or mail receipt calls the writer automatically. Unknown engines/fields, unsafe numbers, a different run and stale/conflicting snapshots refuse. A repeat replaces rather than adds; the other engine keeps its own measurement time. Old pinned runs do not silently migrate to this writer.

Claude visibility gate: this release publishes and renders Codex only. Claude snapshots are private diagnostics, even when observed. The accepted childproof reader/builder does not supply live AP→DSH provenance, an export caller, or original-thread ingestion. Do not launch export tasks from these phase instructions. A later accepted change must implement T1 exact-byte envelope verification, T2 actual runtime export-turn exclusion and T3 original Master-thread binding, then prove a live observed run and independent same-run recount before enabling the Claude card. Project/pilot policy remains in force.
