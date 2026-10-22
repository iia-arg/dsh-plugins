# Usage flat v1 / time / root origin

Numeric schema32649d9e remains schemaVersion/runId/byEngine with exactly one selected engine. Counts are safe integers; nonobserved buckets have six null metrics. No receipt, source path, prompt or transport header is added to a bucket. Writer copies the validated numeric stdout bytes without JSON reserialization.

UTC serialization for new root snapshots and the window's selected-turn output is `YYYY-MM-DDTHH:MM:SS.ffffffZ` (six decimal places). Parsers compare timezone-aware UTC instants. Existing snapshots and rollout source strings remain valid with their original fractional precision.

AP016 A20 differed because `measure-run-codex.py:snapshot_json()` parsed a datetime then serialized with isoformat(), producing six decimal places; `writer-common.py:select_turn()` returned rollout/gateway source text with three. Writer preserved that stdout. AP017 window helpers normalize selected-turn output at select_turn(), and include observer3e2bac03 (instant comparison); no stored AP016 act is rewritten.

Claude root origin adds no numeric schema field. Root reads fixed mail→receipt→actual DSH claim/turn boundaries→all parent requests and proven recursive children. The reader compares its consumed DB/WAL snapshot SHA with the root origin snapshot. `subagent-settled` is admitted only for a proven child of this run. Foreign claims/notices, ambiguous generations/incarnations, unsupported child bindings, absent or nonterminal sources refuse observed.

Writer's Claude input must be UID0-owned; Codex preserves the existing root-or-self UID rule. Production input is `/var/lib/autopilot-usage/<runId>/public/claude.json` under root-owned protected ancestors. Code must be in the immutable root-owned physical release, invoked with `python3 -I -B` using its physical path (current is a symlink).

Root entry deadline180s, zero retries, at most4096 requests; DSH compressed/decompressed and SDK preflight file limit128MiB, DSH single line16MiB. This is not a total RSS limit: the accepted reader subsequently reads SDK files again and SQLite WAL has no aggregate size cap. The entry refuses changed ledger snapshots; it does not authenticate a malicious root/source-owner, OS ACLs or all work in a session beyond the declared run. One process/attempt only; output run directory must be absent, existing output refuses. Unsuccessful attempts must be examined before any new operator-authorized measurement.

Both public/UI Claude hide barriers remain in AP017. A successful historical/copy measurement is not live caller acceptance. Coordinator gives the root snapshot PATH in the next original Master turn; Master calls ordinary usage claude. External acceptance must read the actual call, writer result and raw-source totals before a separately gated whole-package release can remove both hide barriers. Existing runs keep their physical release pins.
