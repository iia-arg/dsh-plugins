<!-- Derived from nick-vels/skills (MIT, Copyright (c) 2026 Nick Vels), modified by Aleksandr Argelander and contributors. -->

# Sadik — resume the pinned run

Do not copy current `ap.py`, modules, phase files or templates into an existing run. Do not infer activity from `serve.pid`, timestamps or whether the panel answers.

1. From the physical project root run exactly:

   ```bash
   python3 /opt/autopilot/current/skill/tools/ap.py --no-serve resume
   ```

   The loader reads `_sadik` from the atomically committed `state.js`, checks the recorded physical skill tree/schema, and executes that version. Switching `current` only selects the version for a new init. Missing, changed or incompatible pinned files refuse instead of silently upgrading. A legacy run without a pin needs an explicit migration; it does not borrow today's installed version.
2. If a different operator is still alive or its status cannot be proven, report the refusal and stop. Never remove a lock by age or by hand. If its recorded process identity is proven gone, the command claims the project before writing anything.
3. Read the recorded memory file, `state.js`, the run's manifest/interfaces/briefs, carried.md if present, and the phase document from **the recorded physical `skillDir`**. Do not reread or repeat completed phases. State's `dir` remains the source of run paths.
4. Check completed ticket commits with `python3 /opt/autopilot/current/skill/tools/ap.py --no-serve commits`. A `!` diagnostic means its recorded commit is not in HEAD; report it, reset only the affected ticket and resume through the configured executor adapter. Never rebuild/reset Git history to bring a recorded commit back.
5. Tell the user the frontier in one line. For incomplete tickets use the ordinary `ticket <id> reset` event and relaunch via the configured executor adapter. Preserve the existing requirement/ticket IDs.
6. Re-ask a pending user question or record `answered` only when its answer is actually known. Run the project's checks before continuing execution.

All events use the same command prefix with `--no-serve`, including ask, answered, finish and reopen. It attempts the protected static export after accounting. A failed export is reported separately and does not justify repeating completed development work. There is no local pane/server to restart. Operator, pin and export boundaries are specified in `phases/0-instruments.md` from the pinned release.
