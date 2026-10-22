# Candidate: G3 exit and mode/depth validation

Mandate: Zabava 2026-10-17 01:58:29Z. Candidate only, no installation.
Base: Alfa R2 f7e74259967aeabdb4825d19386d17d9a79dc952, not a replacement for her frozen kit.

`g3-dials-runtime.patch` records the runtime-only change against that base.
Normal source composition uses the changed runtime/ap_sadik.py via the repinned
part-b-lock.json/source-lock.json; it does not dynamically apply this review patch.
No change to overlay/tools/ap.py, usage schema, writer or renderer. The copy suffix
is a14-b7-c2-g3empty; production version/window and integration remain the coordinator's decision.
The same runtime patch applies to source c61051697014eed5c23801caa03164d0e911d60f
and has been exercised in a separate a13-b7-c2 copy of current0.1.5.

- `check-plan`: run normal computation/save/snapshot/publication, then inspect
  persisted state.gates.G3.ok. Only literal true permits rc0; failed/missing gate
  gives rc1 and a diagnostic. Existing parse/policy refusals stay rc2.
- `init --mode` accepts full/semi/interview/manual, `--depth` accepts
  strict/normal/deep. Omitted flags keep semi/normal. Explicit empty or unknown
  strings are refused before project/state creation. Same enums apply to `set`
  including multi-assignment; invalid init --force cannot archive/replace state.
- Automation must still inspect the exact saved gate and its artifacts. rc0 does
  not certify other gates, nonempty manifests, semantic quality, panel freshness,
  or completion of the whole run. The follow-up below closes empty-plan vacuity.
  Already stored invalid dials are not repaired or rejected by unrelated sync;
  explicit valid set or a permitted new run is needed.

Regression tests added to test_sadik.py are selected by the existing native runner.
The part-B layout fixture suffix follows the new b7 copy. No new test module is
silently omitted from the runner. Standalone physical-copy CLI tests and two
mutation/return traces are included in the accompanying Gamma handoff package.

This is a local overlay remedy. No upstream issue/PR/message was sent; any such
publication requires the owner's explicit instruction. No live code/units/AP run
or Alfa source files are changed by this candidate.

## Follow-up mandated 2026-10-17 02:14:48Z, over accepted 3113edf8

`g3-empty-plan.patch` adds a wrapper around the actual upstream check_plan,
without replacing its existing diagnostics. Zero parsed manifest rows OR zero
physical tickets/*.md adds the problem `план пуст` before main's set_gate/save.
G3.ok becomes false, problems remains an integer count (public schema unchanged),
and the existing post-publication check returns1. Check the same glob.glob list
as the publisher (hidden .md files excluded): upstream retains cached state.tickets
when the last visible file disappears; a hidden .md must not revive that cache.
One R01 row + one valid R01 ticket still passes; unrelated references, empty/missing
manifest and deleted last ticket cannot pass this emptiness guard.

This is combined with the prior G3/dials remedy only in a future AP release,
after the0.1.6 window and the coordinator's explicit decision. Do not mount this
standalone during0.1.6. The original runtime patch records f7e74259→3113edf8;
the empty patch records the follow-up. Normal composition uses the full current
runtime and its pins, not a dynamic double application of these review patches.
