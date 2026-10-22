<!-- Derived from nick-vels/skills (MIT, Copyright (c) 2026 Nick Vels), modified by Aleksandr Argelander and contributors. -->

# Phase 0 — Preflight

Configure the repo, pick the project memory, raise the instruments. Decide which case you are in **before** doing anything else — first match wins:

| On disk | Case | Action |
|---|---|---|
| state.js exists, active or finished | Existing project | Use the guarded `resume` event first; another live operator refuses before state changes. Read phases/0-resume.md. Never use serve.pid or age as proof. |
| no state.js | New project | Follow the global event entrypoint in phases/0-instruments.md; do not copy files before the operator guard. |

If the previous run is finished and the owner explicitly requested a new one, use `init` with the selected physical skill directory after operator checks. Existing active runs keep their pin; do not overwrite them with the current installed skill.

## 1. Look before writing

- `git rev-parse --git-dir` — is this a repo?
- `CLAUDE.md`, `AGENTS.md` — for `phases/0-memory.md`.
- `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` — an existing stack to respect.
- **Existing code at all** — an existing codebase is explored before the spec (`phases/3-spec.md`).
- `.autopilot/PROGRESS.md` — data carried from prior work, read under the operator’s authority rules.
- `CONTEXT.md`, `GLOSSARY.md`, `docs/adr/` — the project's vocabulary and settled decisions. The spec and tickets speak that vocabulary and flag, not silently override, anything that contradicts a recorded decision.

## 2. Git

No repo → `git init` now. Write `.gitignore` before anything else is created, with at least `.env`, `.env.*`, `!.env.example`, `node_modules/`, `__pycache__/`, `.DS_Store`. `.autopilot/` is **committed**, not ignored — it is the user's record of what was promised and delivered; only its `serve.*` files are ignored, and `init` adds that line. The first commit happens at the end of Phase 4 (`phases/4-plan.md`).

A dirty working tree → say so in one line and continue; never stash, reset or clean the user's work, and never commit it: every commit this skill makes names its paths.

## 3. Project memory

**Read `phases/0-memory.md`**: it picks the file — `AGENTS.md` with a `CLAUDE.md` pointer, or the user's own file, which the run does not write into — and holds the skeleton. Do **not** read `phases/9-memory.md` here.

## 4. Instruments

**Read `phases/0-instruments.md`**: use the guarded global event command for `init` (no preliminary copy) with the memory choice from §3, open the dashboard. The command table there is the whole of the instruments for the rest of the run.

The **slug** is short, kebab-case, latin (`telegram-repair-bot`) and never changes mid-flight. `init` names the run directory `<YYYY-MM-DD>-<slug>--wip` — the date the flight started, the suffix until it lands — and records it as `dir` in `state.js`. **Every path is built from `dir`**, never rebuilt from the slug.

## 5. What the last run left

Only when a run has landed here before — `PROGRESS.md` exists, or a commit «Autopilot: сборка сдана» does. A first run skips this section.

**Read the progress file whole, then the history since the landing**, the code only, not Autopilot's own files:

```bash
L=$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')
git log --oneline --no-merges "$L"..HEAD -- . ':(exclude).autopilot'
```

Never the whole log — the run needs only what changed after it was last sure of the code. A commit named in «Правки без автопилота» is accounted for; one that is not has a message and `git show --stat <sha>`, nothing more. **Past about thirty commits**, one subagent on the cheaper model reads them and returns ten lines — what changed, where, and anything that reads like a decision — and that list is what you keep.

**Write `.autopilot/<dir>/carried.md`** — the progress file's four sections as they stand, plus «Изменено после сборки»: one line per change from the log. It is this run's copy of what came before: the progress file is rewritten at landing, and your context will not survive the run.

Then it is used, each part once:

| Part | Where it goes |
|---|---|
| Договорились | binds the spec like an ADR — Phase 3 copies it into `interfaces.md` as project rules; a new brief that contradicts it is flagged to the user, not silently obeyed or ignored |
| Не доделано · Известные баги | **offered, never taken by you** — Phase 2 asks in its first round; in full nothing is taken, and the progress file carries them on |
| Изменено после сборки | to the exploring subagent of Phase 3, so `notes.md` describes the code as it is now |

A part with nothing in it is not mentioned.

## 6. Announce and go

The opening block from `phases/0-modes.md` — mode, depth, dashboard address, memory file, and the `↑` line if `init` printed one. After a landed run, one more line from `carried.md`: «С прошлой сборки: 2 пункта не доделано, 1 баг, 3 правки без автопилота — спрошу на брифинге»; in full, «… — в эту сборку не беру, остаются в списке». It is a hint, not a question: say it, then `python3 /opt/autopilot/current/skill/tools/ap.py --no-serve stage manifest` and go straight into Phase 1.
