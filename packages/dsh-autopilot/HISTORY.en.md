# dsh-autopilot

> **0.1.16 release candidate:** approximate end-time accounting, a read-only mail registration queue with root ACK, and persistent notice workers. This source version does not establish deployment. Older dated candidate notes below are historical. The accepted release KIT/DOCUMENT/LIST-P-0.1.16.md governs installation. Downtime, manual INDEX_CAPACITY handling, unknown Codex epochs and undetected restart loops are documented in README-CORE.md and CHANGELOG.md.


> Release candidate **0.1.12**, based on `4d79ce48`: schemaVersion 3, proven Codex/Claude child usage at depth=1, and mandatory observer end. See [CHANGELOG](CHANGELOG.md) and [installation order](window/LIST-P-0.1.12.md). Install AP before the separate gateway; this candidate has not been deployed. Dated deployment snapshots and earlier candidate notes below are historical.

> P8: `engine-account-read` preserves the writer's raw `authEpoch`. The root-issued `/var/lib/autopilot-usage/codex-account-map.json` maps accountRef digests to codex-3/4; unknown values produce ACCOUNT_UNMAPPED and incomplete usage. Provisioning and limits: [ONLINE-USAGE.md](ONLINE-USAGE.md#engine-account-read).

> Node is not root-owned (`arg:arg`, the owner account); trust rests on the source-profile SHA256 pin, not ownership. The resolved binary is checked before the policy CLI runs; a mismatch is `NODE_PIN_MISMATCH`, with no alternate node. Update Node and its pin in the same window.

> Historical candidate **0.1.10** delta, separate from r4/production: Gamma policy schema 3, source-birth retention gate, pinned Node path without memfd, final registration queue cleanup and a separate postal0.1.10 caller. Kernel tuple proof remains mandatory. Joint cutover and known limits: [ONLINE-USAGE.md](ONLINE-USAGE.md#g-segments-v1). Both a new and an existing authenticated terminal UNBOUND are outcomes without a failed tick, matching approved3a49a8e7. Postal maintenance or a new authenticated init prunes the row. Pending and infrastructure errors retain their named failure states.

> G registration selects whole generations: a recent row/heartbeat retains the early seq and binding of a long-running turn; a wholly stale generation is omitted. [Контракт / contract](ONLINE-USAGE.md).

> Registration retries stop **180 s after mail acceptance**. Only a proven pending G append may retry; AMBIGUOUS, BUDGET_EXCEEDED, expiry and unknown failures are final UNBOUND with no further G reads. No cache is added. [Policy and limits](ONLINE-USAGE.md#окно-повторов-регистрации--registration-retry-window).

> G registration uses a full snapshot and unchanged6c52. G budget: writer limit +64KiB; deadline: twice the worst cold measurement (7.505s now). The ced3d243 minimum was measured on a private child. SDK/native/post/receipt retain their separate16MiB budget. [Evidence and limits](ONLINE-USAGE.md).

> **Bearing registration check:** unchanged605 `operator_tuple` matches pid/starttime/boot_id against ancestry captured from the live kernel by AP mail at SO_PEERCRED acceptance. The6c52 projection alone accepts coordinated forged start/boot metadata. No exact match means UNBOUND; this check must not be weakened. [Probe and capture-time boundary](ONLINE-USAGE.md#несущий-рубеж-регистрации--bearing-registration-check).

> R-only size limit: the offline sample of 100 requests / 100 native turns averaged 655.86 bytes per line and 1316.76 bytes per request including terminal records. About **12.7k requests per recipient** fill 16 MiB of R alone; ledger/native/G/raw and heartbeats exhaust the shared budget earlier. The producer allows 128 MiB while prep rereads the whole file, so incomplete can persist indefinitely. See the formula and proposed **0.1.10** release (Beta normalizer increment) in [ONLINE-USAGE.md](ONLINE-USAGE.md#предел-размера-raw-r-и-план-следующего-выпуска). This is a fixture estimate, not a live operating threshold.

> The 0.1.9 candidate: online team accounting and the basic receipt are described in [ONLINE-USAGE.md](ONLINE-USAGE.md). Complete live accounting is not claimed without accepted R/G producers and startup context; this candidate has not been deployed.

Master chooses when to call `finish`. Delaying it attributes more of **his own turns in the same proven session** to the run; other users’ turns remain excluded by UID and the session/process tuple. This is an attribution boundary, not automatic detection of when work ends.

The `dsh-autopilot` plugin applies Nikita Veles’s Autopilot idea on DeepSeek Harness (DSH) servers. The original author’s repository, [nick-vels/skills](https://github.com/nick-vels/skills), supplies the `autopilot` skill: its work phases, tickets, project memory, accounting tools and dashboard template. Our package adapts that solution for a DSH server team; local changes are listed below.

The live sadik snapshot from 17 October 2026 at 17:07 UTC has **0.1.8 installed**. The combined **0.1.9** candidate, core `a20-b15-c2-team-online`, is described separately; this assembly has not been deployed. Commands are reference material for the assigned maintainer after review, not an installation order.

## What it does

Autopilot carries a project from requirements and a plan through assignments, implementation and review to final verification. Master stores project state and pins each RUN to a physical runtime. Executors receive work through mail; the operator reads stages, task cards and results on the static dashboard. Project memory, assignments and history stay with the project. Each executor's current instructions and work order define its authority.

Our layer adds server permissions and pins, a shared run catalogue, mail transport, a safe public projection and shared serving. Usage is bound to runtime/engine evidence and a receipt; model-generated text is not a numeric source.

## What is deployed on sadik

| Component | 0.1.8 snapshot |
|---|---|
| Core | Physical release `9fc898cbe941d5b8a369f1dd657e9119676eb44f-a17-b9-c2-rollback-r2`; `current` selects it |
| Run catalogue | `/var/lib/dsh-autopilot`, root bootstrap completed; applicability `applicable`, coverage `guarded_origins` |
| Upstream | Pinned `9fc898cbe941d5b8a369f1dd657e9119676eb44f`, skill metadata 2.1.0 |
| Mail and notices | Mail/copy run from postal 0.1.3; the client comes from 0.1.4. Mail/copy and notice timers are enabled. Postal and AP package versions are distinct |
| Team | `master`, `vintik`, `shpuntik`, `gayka`, `shurup`, `sova`, `tumbler` are separate Unix accounts |
| Dashboards | `/srv/autopilot/public/master/`, serving at `192.168.99.6:8787`; our profile's external address is `https://ap1.insmat.ru/master/index.html` |
| Online team accounting | The consumer and its R/G integration belong to the 0.1.9 candidate. `autopilot-usage.service`/timer are not installed in this live snapshot |

`/srv/autopilot/projects` does not yet exist on sadik. Planning that directory or placing candidate files is not a completed installation window. This check only read the live services and catalogue.

## Architecture and differences from upstream

The runtime is installed offline into root-owned `sources/releases`; Master uses a physical pin and operator lock. `current` selects the runtime for a new init; subsequent events of an existing RUN use its physical pin. Public state.js/HTML follow an allowlisted schema with secret-like text filtering and shared serving. Mail checks the Unix sender and TLS server; delivery and usage receipts refer to different stages.

Master's messages and the `AUTOPILOT-PILOT` marker do not expand executor authority. A shared UID does not provide full isolation; G4 checks declared counters, while reviewer independence requires separate evidence.

## Paths and Master commands

```text
/opt/autopilot/sources/<upstream-sha>/                 source archive
/opt/autopilot/releases/<upstream-sha>-<revision>/      physical runtime
/opt/autopilot/current -> releases/...                selection for a new init
/opt/agent-skills/autopilot -> /opt/autopilot/current/skill
/srv/autopilot/public/<agent>/<projectUUID>/<runUUID>/  dashboard.html and state.js
/var/lib/dsh-autopilot/                               shared run-pin catalogue
```

As Unix account `master`, from the physical root of an **authorized** project:

```sh
REL=$(realpath /opt/autopilot/current)
python3 -B "$REL/skill/tools/ap.py" --no-serve init --slug example --skill-dir "$REL/skill"
```

Later events use `state.js['_sadik']['release']['skill_dir']`, not a new `current`. For an existing pinned run:

```sh
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve commits
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve finish --result 'verified outcome'
```

Read `PINNED_SKILL` from the real private `.autopilot/state.js`, not from mail or an arbitrary replacement. Root is not the operator. Unknown commands/options are refused; `--dry-run`, `-n`, `--check` are not AP runtime modes. Do not remove `operator.lock` or replace the pin manually. `commits` saves state and may warn despite rc0; it is not an independent code acceptance gate.

`README-PILOT.md` documents distinct entrypoints: the operator helper in the physical core and the receiver helper in postal runtime. They are not interchangeable. Old examples using `--name alfa`, stdin mail input to `receive` or `a2a-send` instead of current postal transport are obsolete.

## Dashboard and cards

The installed 0.1.8 dashboard shows the stage, assignments, waiting states and RUN result. Read the completion heading together with `result`: a completed RUN may have a negative result. Its public legacy usage card is limited to Codex, even when a private Claude snapshot exists.

The 0.1.9 candidate retains Mark's stages for preparation, requirements, briefing, specification, planning, implementation, review and acceptance. Task cards show work, review, repair and failure. RU/EN and appearance themes are available. This describes the UI candidate, not browser acceptance of the entire unfinished assembly.

Legacy `usage` cards and the `usageTeam` receipt render independently alongside each other. Codex is labelled “Operator thread”, with discovered children when the declared coverage supports them; valid observed Claude is labelled “Sova · declared requests”. Their six values, individual windows and measurement times remain intact. Unmeasured/invalid Claude is not presented as measured. With no binding, the team row says “incomplete: no R/G” and names the participant and reason; the legacy cards are not the full team's aggregate.

## Usage and what is proven

### Legacy snapshots in 0.1.8

Codex and Claude buckets are separate. A v1 snapshot has six metrics: modelCalls, inputTokens, uncachedInputTokens, outputTokens, cacheReadTokens and cacheWriteTokens, plus source, window, measuredAt and coverage. The root Claude path and writer require a protected snapshot; for manual publication Master uses the RUN's physical pin. `null` means unmeasured; repeating a snapshot does not add it again. Contracts: [FORMAT-CONTRACT.md](FORMAT-CONTRACT.md) and [tools/README-usage-snapshot.md](tools/README-usage-snapshot.md).

### Online receipt in the 0.1.9 candidate

The consumer is designed for Claude **and** Codex. Root binds the run/project, AP-mail jobs, R runtime facts and G engine-request facts to raw sources. Parsers read them under the owner's UID/GID without supplementary groups; this does not give Master access to other HOME directories. Model text and a manually chosen current subscription slot do not replace that evidence.

A v2 team receipt has **participant × engine × subscription** rows, six metrics and an “of which subagents” subtotal. That subtotal is part of the total, not another amount to add. With `basis=closed_turns`, unfinished turns remain in `pending`; their current cost is not yet included. `asOf` is the proven source cut and `measuredAt` the measurement time; the dashboard marks a cut older than 120 seconds as stale.

A missing participant or unproven binding makes the project `incomplete`: all six project totals are `null`, the name and reason remain visible, and proven rows are retained. Missing sources do not become zero. The root receipt is bound to the physical project path; a non-model writer under UID master and operator.lock publishes it while preserving tickets, gates and operator state.

The candidate includes a root timer with a 60-second interval. Without OPEN (an open RUN in the root accounting index) it reads only the usage index, not HOME directories. This is a separate accounting index, not the `/var/lib/dsh-autopilot` run-pin catalogue. R normalization and the register CLI have copy-based tests; **the live root register caller before the first AP init and the complete G stage are not yet integrated**. This is not a claim of complete live team accounting.

### Boundaries of the 0.1.9 assembly

- **R and size.** Prep currently rereads the entire source. A copy-based sample for one recipient at 1 request/turn gives an upper R-only estimate of about **12.7 thousand requests** before 16 MiB (estimate from a copy, not a measurement of the live average). Other sources and heartbeat also consume the shared budget, so incompleteness may occur earlier. Raw R permits 128 MiB; that is not the normalizer's per-pass capacity. Persistent `BUDGET_EXCEEDED` is possible; incremental processing remains a proposal.
- **source_gap.** TG is the `dsh-telegram-multiagent` plugin hosting the R producer. In the accepted R for the combined release (TG 3.1.13), the reason latches until TG restarts; new requests do not clear it. Proven accounting requires restart and verified source recovery/reconciliation (source reconciliation is not implemented in this release). After restart, new runs may become complete when sources agree and completeness is verified. Previously affected windows do not become complete: the historical gap remains. If the source fails again, another gap occurs; restart alone does not promise to fix the cause. Restart requires a separately assigned window.
- **G and the Codex slot.** Until G proves the historical credential handle/epoch, the Codex slot remains `UNBOUND`/`SUBSCRIPTION_UNBOUND`. The current registry or symlink does not prove a past request's subscription. Complete G and the register caller remain open integration work.
- **Subagents.** The current online consumer does not support native Claude Agent/Task or native Codex spawn: detection produces named incompleteness. Complete DSH spawn coverage is not claimed either. Reasons include `CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED`, `CHILD_SOURCE_UNSUPPORTED`, `CODEX_NATIVE_SUBAGENT_UNSUPPORTED` or `UNLISTED_CHILD`; the child subtotal is `null` for such incompleteness. Supplying graph data alone does not enable support: an accepted coordinated change to the AP consumer and R/G is required.
- **Time and completeness.** The shared source budget is 16 MiB per iteration; R preparation has a cooperative 3-second deadline. The systemd service is limited to 35 seconds, which does not guarantee a fresh receipt when it is killed. Missing sources, unsupported formats and unproven turn boundaries remain named incompleteness; a job older than 7200 seconds receives JOB_OVERDUE without being cancelled. These counters are not the final drain or a provider invoice.

## Upstream and updates

**Nikita Veles** created the idea and original skill; see [nick-vels/skills](https://github.com/nick-vels/skills) and [the upstream changelog](https://github.com/nick-vels/skills/blob/main/CHANGELOG.md). The `repository`, `upstream_sha` and `upstream_ref` fields in [source-lock.json](source-lock.json) pin `refs/heads/main` to **`9fc898cbe941d5b8a369f1dd657e9119676eb44f`** (skill metadata `2.1.0`). Vendor: `vendor/autopilot-9fc898cb.tar.gz`, SHA256 `f8b0b7a456cda7053790909b863258b1e3a837acce6d8936d11f92d4e053b1ac`. This upstream pin is separate from the local runtime revision.

Read the upstream head without changing it:

```sh
git ls-remote --symref https://github.com/nick-vels/skills HEAD refs/heads/main
```

On **17 October 2026 at 11:39:06 UTC**, this command on sadik returned HEAD and `refs/heads/main` equal to the pinned SHA. That branch has no newer commits since our pin. This is a dated main-branch check, not a claim about other branches, open issues or future changes.

**Before each local release**, the assigned release preparer repeats the check and reviews upstream changes since the previous pin: the changelog, Git diff and commit history, new ideas and bug fixes. If the head changed, review it in a separate checkout: compare `CHANGELOG.md`, `skills/autopilot/` and related tools/tests from the old SHA to the verified new SHA. Record the check time, both SHAs, changes, effects on local patches/overlay and the decision “port / defer with reason” in the release sheet for the coordinator. If there are no new commits, record the matching SHAs. Do not submit the release to acceptance before this review. Repinning, rebuilding and deployment require a separate accepted step; this check does not execute remote code. This is a manual release rule; no background monitor or automatic update is introduced here.

The full upstream MIT text, “Copyright (c) 2026 Nick Vels”, and derived-file inventory are in [NOTICE](NOTICE), included in the npm archive. [LICENSE](LICENSE) retains attribution for local changes. Only license comments were added to the eight overlay files; the combined patch and its checksums were refreshed without changing runtime logic.

### Local changes by file

Complete file list for `patches/` and `overlay/` in this branch; an accepted candidate is not assumed to be deployed:

| File | Change / purpose |
|---|---|
| [patches/part-b-upstream.patch](patches/part-b-upstream.patch) | Combined diff against the pinned upstream for the eight overlay files, including server accounting, usage and dashboard changes. |
| [patches/g3-dials-runtime.patch](patches/g3-dials-runtime.patch) | Historical runtime diff: mode/depth validation and a failing check-plan exit when G3 does not pass. |
| [patches/g3-empty-plan.patch](patches/g3-empty-plan.patch) | Historical G3 addition: an empty manifest or missing physical tickets/*.md prevents success. |
| [patches/README-g3-dials.md](patches/README-g3-dials.md) | Provenance, checks and limits of the G3 diffs; this is a note, not an applied patch. |
| [overlay/phases/0-instruments.md](overlay/phases/0-instruments.md) | Server event entrypoint instead of local HTTP, public export and usage snapshot rules. |
| [overlay/phases/0-preflight.md](overlay/phases/0-preflight.md) | New/resume selection without copying files over a protected project before operator checks. |
| [overlay/phases/0-resume.md](overlay/phases/0-resume.md) | Resume through the stored physical pin and operator lock without implicit migration to current. |
| [overlay/phases/4-plan.md](overlay/phases/4-plan.md) | Planning event examples use the server entrypoint with --no-serve. |
| [overlay/phases/5-subagents.md](overlay/phases/5-subagents.md) | Ticket commit and done accounting use the server entrypoint with --no-serve. |
| [overlay/phases/8-final.md](overlay/phases/8-final.md) | Finish without a local server, static export and usage accounting procedure. |
| [overlay/phases/dashboard-template.html](overlay/phases/dashboard-template.html) | Numeric usage card with its window and snapshot time; visibility in 0.1.8 is limited to Codex. Dual-engine cards and the team receipt belong to the separately marked 0.1.9 candidate. |
| [overlay/tools/ap.py](overlay/tools/ap.py) | Usage/resume events and ap_sadik integration for guarded accounting and publication without a local server. |

`part-b-upstream.patch` records upstream → overlay. The two G3 diffs record earlier changes to local `runtime/ap_sadik.py`: composition takes the current pinned runtime rather than applying those diffs again. Other server additions also live in `runtime/`, `pilot/`, `lib/` and `tools/`; this inventory covers the requested `patches/` and `overlay/` only. The phase texts retain historical Claude visibility conditions; see the checked deployment state and evidence above. The license supplement changes only the eight overlay headers and combined patch; the two historical G3 diffs and their note remain unchanged.

## Installation and release

The base installer needs Linux, Bash and **Python 3.10+ with its stdlib**; runtime project operations also need Git. This deployment requires neither Docker nor npm lifecycle installation. Account and separate-service prerequisites follow.

### Requirements for another server and the sadik example

The preceding sections are **our example deployment on sadik**, checked on 17 October 2026, not the result of installing on an arbitrary server. Mail/copy versions, ap1 addresses, participant names and assignments to Zabava/Iskra describe this profile. Before running the installation commands, another server's administrator must prepare these prerequisites:

| Area | Required preparation |
|---|---|
| OS and tools | Linux, **Python 3.10+ with its stdlib**, including `/usr/bin/python3`, Bash, Git, `realpath`, `getent` and `groupadd`. The supplied services require systemd. Python 3.9 is outside the supported minimum; `-B` does not lower that requirement. |
| Operator | An existing unprivileged Unix account named **`master`**, its working HOME and an authorized Git project. The code checks the name `master`; it is not an arbitrary example label. The installer does not create this account. Root performs installation, not AP events. |
| Dashboard reader | The **`autopilot-view`** group; `master` must have neither primary nor supplementary membership. The applying installer creates the group if absent and prepares public directories; the administrator configures the reader service's access separately. |
| Run catalogue | A release using `/var/lib/dsh-autopilot` needs a separate accepted inventory and root bootstrap under that release's contract. An existing directory alone is insufficient. The base `install.sh` lays out runtime files but does not perform this bootstrap. |
| Mail profile | Mail needs separate `autopilot-post` and `autopilot-copy` accounts, the `autopilot-mail` group, team accounts, socket/TLS configuration, notice profiles and configured bots. The current helper fixes six names: `vintik`, `shpuntik`, `gayka`, `shurup`, `sova`, `tumbler`; a different team requires a separate adaptation and acceptance. Contracts and prerequisites are in README-CORE.md and MAIL-LAYOUT.json. |
| Serving and responsibility | Dashboard delivery needs a separately configured reader service, LoadCredential, external TLS/auth and address. `192.168.99.6:8787` and `ap1.insmat.ru` are our example, not universal settings. The other server's owner assigns its installation administrator, operator and reviewer; our agent names do not supply those roles. |

`npm install` does not configure this infrastructure. The base `install.sh` creates neither DSH agents, their sessions, mail profiles, bots nor a TLS deployment, and does not enable or restart services. README-CORE.md and README-PILOT.md describe our profile's separate mail system. Missing prerequisites prevent laid-out files from being treated as a ready external installation. The test profile also needs preparation: `test/stend-dsh-autopilot.sh` creates root/UID fixtures and sets `AUTOPILOT_TEST_SKILL`/`AUTOPILOT_TEST_UPSTREAM`; bare `unittest` or `npm test` does not replace that full stand.

### The 0.1.8 window: run catalogue, census and fence

`install.sh` alone is insufficient: the catalogue bootstrap is a separate accepted window step. On sadik it has already been created. `/var/lib/dsh-autopilot/legacy.json` holds the accepted root census; `bootstrap.json` binds its hash to a generation and window; `applicability.json` records applicability; `runs/catalog.json` tracks current pins. Root creates the trust base; Master updates the permitted part under the shared `run.lock`. A directory without these bindings is not readiness.

For initial creation of the 0.1.8 catalogue when its trust base is absent, prepare the accepted physical shelf and backups; enable the bounded fence; collect and accept a complete owner census with no active runs or records marked `potentialProductionPin`; install the runtime and bootstrap; separately verify permissions, a fresh scan and census equality; perform the prescribed probe and remove the window's own fence. The census covers all visible local filesystems and owner/pin evidence, not just `/opt/master`. The window helper refuses to recreate an existing catalogue; later updates and generation replacement follow a separately accepted contract.

Incomplete or unknown sources do not grant admission. A changed census set is reported by the window comparison as `CENSUS_RAZOSHLIS`, exit 1; failed preconditions give refusal, exit 2. The runtime catalogue uses `RUN_INVENTORY_UNPROVEN` for its trust-base check. These outcomes are not a single universal error code.

The forward-window fence freezes the two operator units and checks native idle, PID/starttime and the complete UID process set. Its transient holder has RuntimeMaxSec: the helper defaults to 900 seconds, permits 5–1800 seconds and requires at least 120 seconds remaining before bootstrap/comparison. Expiry or stopping the holder releases its freeze. These are snapshots and a restriction on the normal operator; short privileged activity between snapshots and concurrent root administration remain outside the guarantee. Fence commands belong to the accepted window leaf.

A legacy core does not implement the shared catalogue protocol. Selecting one needs separate admission and marks catalogue applicability `inapplicable`; recovery needs a fresh accepted census/bootstrap. Changing `current` neither migrates an existing run nor rewrites its pin.

### Accepted installation commands

From an **accepted package**, by the installation administrator after acceptance:


```sh
sudo bash ./install.sh --dry-run
sudo bash ./install.sh
sudo bash ./install.sh --check
```

These are installer reference commands for an accepted shelf, not an instruction to update production from master. `--dry-run` prints the plan and `--check` inspects without repair; neither creates locks/directories, generates keys or changes NSS. Check exits 1 for required repair and 2 for refusal. These switches belong to the installer, not the AP runtime. In this branch `source-lock.json` sets target `a20-b30-c2-account-map-raw-supplier` (0.1.10 candidate); installed `current` in the 17:07 UTC sadik snapshot is `a17-b9-c2-rollback-r2` (0.1.8). Attribution headers changed release bytes during the 0.1.8 assembly, so this immutable ID replaced `a16-b8-c2-rollback-r2`; the new 0.1.9 candidate bytes receive the separate ID `a20-b15-c2-team-online`. Reusing an accepted shelf name for different bytes remains forbidden. A repository version or accepted candidate is distinct from deployment. `DESTDIR` is a separate accepted root-owned fixture, not a sandbox against its owner; raw upstream sources are not executed.

0.1.5, 0.1.6 and 0.1.7 are history; 0.1.8 is installed ([CHANGELOG.md](CHANGELOG.md)). The combined 0.1.9 is a prepared candidate; full G and register-caller integration remain unfinished. `/srv/autopilot/projects` does not yet exist on sadik; creating it and enabling complete online accounting require their own accepted window. Automatic migration of pinned runs, a common executor sandbox and provider billing are outside this release.

Technical contracts: [part B](B-README.en.md), [mail](README-CORE.md), [pilot](README-PILOT.md). Iskra maintains `skill/dsh-autopilot/` (B-N-2058) and handles its older instructions separately. This document changes neither that skill nor ACLs, secrets or services.


### 0.1.14 end-of-run candidate

New billing requires REGISTERED A+B. Public schema4 requires all three ownership fields whenever numbers are present; legacy declarations produce LEGACY_UNREGISTERED_RUN with null totals. Proven AP finish/cancel or H/K triggers root finalization, with at most600s drain from first detection. The durable final pointer commits an immutable receipt; recovery completes CLOSED without re-resolving its end. Root retries computed publication debt before idle, including archived RUNs after the project starts another RUN. No finalization journal/outbox is introduced.

EXPIRED deliveries release logical capacity while retaining uncertain execution zones. An explicit operator release-expired JOB --reason TEXT records EXPIRED_EXECUTION_ABANDONED in the receipt, without stopping the receiver. Postal0.1.10 is unchanged.
