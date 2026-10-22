# Part B — operator, physical pin and public state

This is part of the DSH-server application of Nikita Veles’s Autopilot from [nick-vels/skills](https://github.com/nick-vels/skills); see [upstream credit, pin and release review](README.en.md#upstream-and-updates).

Checked on sadik, 17 October 2026: AP 0.1.7, upstream 9fc898cbe941d5b8a369f1dd657e9119676eb44f, local a15-b7-c2. The former `main 46060c3 / b4` is historical, not the installed version. Core, mail and dashboard serving have separate versions; see README.en.md for the deployment snapshot.

## Operator and events

Master runs events from an authorized physical project root, never as root:

```sh
REL=$(realpath /opt/autopilot/current)
python3 -B "$REL/skill/tools/ap.py" --no-serve init --slug example --skill-dir "$REL/skill"
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve ask action --note 'decision needed'
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve answered
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve resume
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve commits
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve finish --result 'verified outcome'
```

For existing runs, read PINNED_SKILL from private state['_sadik']['release']['skill_dir']. It is not an arbitrary current path. Unknown input, including --dry-run/-n/--check, refuses with 2. The installed guard forces no-serve and update-off; explicit update checks are refused. No per-project server-stop child is launched by finish. Installer root and operator Master are distinct roles.

The operator is a live ancestor codex/claude process or a validated long-lived same-UID ancestor selected by AUTOPILOT_OPERATOR_PID. Boot/PID/start/UID identity and persistent flock prevent a second live operator. Age alone does not prove death. Missing identity for an existing ledger refuses; never remove the lock manually. Current team members have separate Unix accounts, but shared-UID isolation is not claimed. Their write authority remains their own policy/assignment, not the pilot marker.

## Upstream and release pins

commits checks recorded done-ticket commits in HEAD history; warnings and rc 0 do not constitute acceptance. It saves state and upstream Git has no timeout here. G3 reads state.gates. Memory/PROGRESS/carried conventions and Git trailers remain; Python does not maintain agent-authored memory documents itself.

The authoritative pin is saved atomically in state['_sadik'], with physical root/run/project, skill path, tree/mode hashes and parent release metadata. State schema 2 differs from adaptation schema 1. sadik.json is a mirror. Current selects a new init; later events/resume validate the old physical release instead of overwriting project files. Failed init does not discard the prior active ledger before replacement is saved. Unpinned projects require separate migration.

## Export and permissions

Path: /srv/autopilot/public/<agent>/<projectUUID>/<runUUID>/. Public root 2751 root:autopilot-view; Master section 2750 master:autopilot-view. Master is not a reader-group member. Worker umask 027, inherited SGID/GID, no directory chmod; public directories 2750 and files 0640 before rename. O_PATH permits traversal-only roots. Unsafe existing paths fail publication rather than silently changing accounts.

A run exposes dashboard.html/state.js, published as one exchanged directory. Index HTML/JSON are intentionally public; pin/operator/receipts stay private. No-follow dirfd handling rejects unsafe links/files. Index lock: 0.25 s / 26 attempts; worker 4.8 s + 0.1 s cancellation; public file/index 8 MiB, private reads 16 MiB, pinned tree 64 MiB / 10000 files. Failed publication preserves event accounting and reports the last confirmed panel; no cross-ledger/index/pair power-loss transaction or hard realtime is promised.

## Public contract

B-README.md lists the exact typed fields: top-level progress/result, stages, tickets, requirements, tests, waits, debt, coverage, blind, gates G1–G4 and usage.schemaVersion/runId/byEngine.codex. Unknown fields or wrong types stay private. Paths, briefs, memory/control metadata, arbitrary answers/command output and ticket commit/zone data are excluded.

Allowed strings matching known token/private-key/password-store/environment-secret patterns are replaced entirely with [скрыто]. This does not recognize every encoding or secret format. One projected object supplies both JSON and HTML using the pinned template; old publications do not repair themselves without another successful export or an assigned archive audit.

G4 requires unique integer checked/matched counts with 0 < matched <= checked, equal counts and no mismatches for success. Invalid input refuses; saved state and public projection clear invalid blind and G4, as does reopen. This verifies declared-count consistency, not independent or blind review. Pilot job JSON is a different schema, not a direct AP state input.

## Assembly, retention and acceptance

part_b_layout.overlay(lock,full_raw_map) returns a new full mapping; declared replacements verify before/result hashes and modes, with the role guard added afterwards. The historical A6 commits/resume blocker is obsolete for the installed guard, which permits these commands without extra arguments. OVERLAY-INTEGRATION.md records the assembly contract; part B itself does not install credentials or change NSS.

Panel retention remains a 30-day proposal, not an implemented deletion service. A future collector needs complete project coverage, live-reference protection, a shared locking protocol, dry-run/quarantine and a bounded 30 s / 100 candidates daily pass. Private state and pinned releases are outside this policy.

This documentation check read public state and installed filters; it did not perform a new browser DOM acceptance. Optional browser_probe executes Python/AP and requires separately authorized isolation; browser routing is not a Python sandbox. Its historical runtime tests do not establish current production TLS/auth or a whole-system live acceptance.

## Current numeric usage

Master runs usage ENGINE --snapshot FILE on the pinned AP. Claude requires UID 0 ownership; Codex permits UID 0 or Master's own UID. File/path/schema/run guards do not prove arbitrary numbers correct. The root Claude reader separately binds mail/receipt/DSH/SDK sources. Refusal is not zero; repeated snapshots are not summed.

The 17 October live probe carried root Claude observed into private state; Codex in that probe is not_measured. Both 0.1.7 display filters still admit only Codex, so a private Claude basket does not imply a visible card. See README.en.md and FORMAT-CONTRACT.md. The source-lock in this source tree already targets a17-b9-c2-rollback-r2 for a later build; do not describe its new run catalog, abandon or rollback behavior as installed 0.1.7 functionality.
