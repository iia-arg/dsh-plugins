Russian version: [README.md](README.md) · English below

# a2a-bus — let agents on one machine talk to each other, without giving up isolation

**Version:** 3.1.2

Several agents live on one machine. Isolation follows **system accounts**. The bus does not isolate agents sharing one UID from each other.

Now they need to write to each other directly, on this machine, and the owner needs to see both
sides of every exchange in his own chat with each agent.

This is **not a harness plugin**. It is a machine service: a spool directory per agent, a postman
that runs from `root`, and one command to enroll a new agent.

## The problem, stated honestly

The obvious design is a shared directory everyone can write to. It fails in a way that is not
obvious: to *deliver* a letter the receiver must read a file the sender owns, and file permissions
are granted by the **owner** of the file, not by the directory. So either the sender keeps the
letter readable — and then every member of the group can read it — or the receiver cannot open it
at all.

Our answer: **each agent owns a mailbox nobody else can list.** Senders may drop a file in
(`--wx`, write and traverse, no read), and cannot see what else is there. A postman running as
`root` then does the one thing that requires root and nothing else: it **changes the owner** of the
letter to the receiver. After that the letter is the receiver's own file, and the sender has lost
access to it.

```
/var/spool/a2a/<agent>     drwx-wx--T   <agent>:a2a-pochta
                           owner: read+write     sender: drop only, no listing
```

## What is here

| File | What it is |
|---|---|
| `sbin/a2a-pochtalon.py` | the postman: transfers ownership, enforces size and count limits, notifies the owner |
| `sbin/a2a-zavesti` | enroll an agent into the bus in one command — mailbox and group in a single step, with verification |
| `sbin/a2a-proba-novichka` | acceptance probe: does a letter arrive, is a foreign mailbox refused, does the round trip work |
| `systemd/` | the service and a timer that runs it every 5 seconds, plus drop-ins in `systemd/a2a-pochtalon.service.d/` (`60-python-padenie-70.conf` runs the postman through `python-padenie-70` from dsh-storozha-mashiny; `70-predel-v-chat.conf` sets `A2A_PREDEL_V_CHAT=3800`) |
| `lib/a2a-bus/` | `outgoing_mirror.py` (full sender record for owner-all) and `v2_with_mirror.py` (wrapper for `a2a-send --v2`); `a2a-send` looks for them in `$(dirname "$0")/../lib/a2a-bus/` |
| `share/agent-registry/shablony-raskladki/` | layout templates A/B/C/M for `agent-registry sobrat`/`verify` (see "Layout templates" below) |
| `bin/` | `a2a-send`, `tell-owner`, `agent-registry` — sender, owner notification and registry tools |
| `test/` | sender-copy, common ACL/generator and root-postman regressions; requirements and commands are below |
| `LICENSE` | MIT license (not installed) |

Runtime paths and limits have environment overrides; see the table below. Registry/layout templates and some service paths belong to the sadik deployment. Inspect and configure these files before using them on another machine.

Hyphens in system-account names are not supported by the whole bus: the postman resolves the split through the owning UID, but current dsh-telegram-multiagent spool parsing and dsh-pochta v2 still truncate/refuse them. This is a client boundary, not support for every route.

## What this does NOT do

- **It does not deliver the letter into the agent's turn.** That is your channel module's job; the
  bus only puts the file where the receiver can read it.
- **It does not interpret the letter as instructions.** The postman reads and copies it, checks the envelope and includes text in the notification.
- **It does not make the mailbox a private place.** Permissions on a *file* are granted by its
  owner: any file the owner himself makes world-readable will be readable by everyone in the group.
  The bus protects you from other people's curiosity, not from your own carelessness.
- **The sender name in the filename is a hint, not a credential.** Forging it is trivial. Real
  provenance is what the postman saw — the file's owner before transfer. Never grant rights based
  on that name.
- It is not a security boundary against a hostile local root.

## Install

### Prerequisites

Use Linux, Bash, Python 3 with PyYAML, `sudo`, `curl`, `logger`, `timeout`, `install`, `id`, `getent`, `groupadd`, `usermod`, `stat` and systemd. On Debian/Ubuntu the PyYAML module is provided by `python3-yaml`. Install `python-padenie-70` from dsh-storozha-mashiny before its `60-python-padenie-70.conf` drop-in; `agent-alert` from dsh-trevogi handles machine alerts. Node is needed only for the sender-copy reader test.

The system account must already exist. The machine owner creates `/etc/agent-registry/agents.yaml` before enrollment; the bus does not edit it. This minimal mail example uses the nickname `demo` and a different system account, `demosvc`:

```yaml
agenty:
  - imya: demo
    namerenie:
      polzovatel: demosvc
      dom: /srv/demosvc
      kanal:
        tip: telegram
        rezhim_dostavki: personal
        yashchik: /var/spool/a2a/demosvc
```

This is not a complete registry for `verify`/`sobrat`. `a2a-zavesti demo` creates the account mailbox, `demosvc`; `kanal.yashchik` names the same path. `agent-registry pole demo polzovatel --json` must print `"demosvc"`. Record both sender and recipient; an owner-all sender also needs matching `dom`, `polzovatel` and `kanal`. A shared system account needs explicit separate agent mailboxes and a check of their readers: an account mailbox does not establish a route to one agent.

Check dependencies before installing the service/drop-ins; these commands install nothing:

```sh
python3 -c 'import yaml' &&
test -x /usr/local/bin/python-padenie-70 &&
test -r /etc/agent-registry/agents.yaml
```

If this check returns nonzero, resolve its cause before installing the service.

### Copying files

There is nothing to `npm install` here: this lives in the system, and a package manager would put
it where it cannot run — while looking like a successful install. Copy it by hand:

Install `bin/agent-registry` first, both `lib/a2a-bus/*` helpers next, and `bin/a2a-send` last. A new mirror with an old registry cannot recognize an unknown sender without the machine marker: it returns code 4 after placement. Do not resend automatically: Roll back the mirror helpers before the registry; do not leave a new mirror with an old registry.

```sh
install -m 0755 bin/agent-registry /usr/local/bin/
install -d -m 0755 /usr/local/lib/a2a-bus
install -m 0644 lib/a2a-bus/outgoing_mirror.py lib/a2a-bus/v2_with_mirror.py /usr/local/lib/a2a-bus/
install -m 0755 bin/a2a-send bin/tell-owner /usr/local/bin/
install -m 0755 sbin/a2a-pochtalon.py sbin/a2a-zavesti sbin/a2a-proba-novichka /usr/local/sbin/
install -m 0644 systemd/a2a-pochtalon.service systemd/a2a-pochtalon.timer /etc/systemd/system/
install -d -m 0755 /etc/systemd/system/a2a-pochtalon.service.d
install -m 0644 systemd/a2a-pochtalon.service.d/*.conf /etc/systemd/system/a2a-pochtalon.service.d/
systemctl daemon-reload
systemctl enable --now a2a-pochtalon.timer
a2a-zavesti <nickname>          # per agent: group a2a-pochta, membership, mailbox 1730 <account>:a2a-pochta
a2a-proba-novichka <nickname>   # prove it, don't assume it; letters go to a stand-in root
```

For `sobrat`/`verify`, install all seven templates at the registry's configured directory (on sadik: `/etc/agent-registry/shablony-raskladki`). This does not start services:

```sh
install -d -m 0755 /etc/agent-registry/shablony-raskladki/codex /etc/agent-registry/shablony-raskladki/sdk-claude
install -m 0644 share/agent-registry/shablony-raskladki/codex/*.tmpl /etc/agent-registry/shablony-raskladki/codex/
install -m 0644 share/agent-registry/shablony-raskladki/sdk-claude/*.tmpl /etc/agent-registry/shablony-raskladki/sdk-claude/
```

The argument is the agent's **nickname from the registry**, not its system account. `a2a-zavesti` does not create the
account, edit the registry, set up a bot or restart the agent's platform; a running agent picks up the new group only
after its platform restarts — until then it receives letters but cannot send. The drop-in `60-python-padenie-70.conf`
needs `/usr/local/bin/python-padenie-70` (dsh-storozha-mashiny): without it the postman does not start.

## Three traps we walked into, so you don't have to

**`chmod` with a numeric mode keeps the directory's setgid bit.** `chmod 1730` over `2730` yields
`3730` — and returns success. We stepped on this twice; anyone following a written instruction
would step on it every time. That is why enrollment is one command and not a list of steps:
**if a procedure takes more than three steps, simplify the mechanism instead of writing a longer
instruction.** A longer instruction just moves the trap onto the reader.

**An acceptance check that reads one item out of N proves nothing.** Ours took the first file it
found, got a correct one, and passed a planted broken letter. Count what you checked and say the
number out loud: "read 1 of 5" is honest, "OK" is not.

**A check can be blind in the tester's hands and healthy in production.** Our health check ran as
`root` in production — green — and as an ordinary user on the test bench — red. Name the subject
explicitly (`id -u`, then `sudo -n` when needed) instead of assuming whose hands run it.

## Sender side: `bin/a2a-send`, `bin/tell-owner`, `bin/agent-registry`

Until 2026-09-04 these three lived only on the machine and the README pointed at them as
external (`A2A_SEND_BIN`, `A2A_TELL_BIN`, `A2A_REESTR_BIN`). They are published here as they run
in production, with private names in comments replaced by `<agent>` / "one machine". A sender needs both `bin/` and `lib/` under one prefix. Install the sender files with the same prerequisites as the full installation above:

```sh
install -m 0755 bin/agent-registry /usr/local/bin/
install -d -m 0755 /usr/local/lib/a2a-bus
install -m 0644 lib/a2a-bus/outgoing_mirror.py lib/a2a-bus/v2_with_mirror.py /usr/local/lib/a2a-bus/
install -m 0755 bin/a2a-send bin/tell-owner /usr/local/bin/
```

**`a2a-send [--bez-kopii] <recipient> [--text "text"]`** (without `--text` the text is read from stdin; `a2a-send --v2 …` passes the arguments to `a2a-v2.py`; any other argument, including bare text, is refused with code `3`) — puts a letter into the recipient's mailbox. Only the legacy sender-notification branch calls `tell-owner` directly; owner-all uses a sender record or the recipient's reader. Writes under a dot-name and renames
atomically (the postman skips dot-files, so it never picks up a half-written letter); sets
`umask 077` only around the write — this is the one place where the pre-transfer window is
closed. **Give private text on stdin, not as an argument**: an argument is visible to every user
of the machine in `/proc/<pid>/cmdline` (measured 2 of 2); text longer than `A2A_PREDEL_ARGV`
(default 500) as an argument is refused outright. There is no `-f` flag on purpose.
**If you arrived with instructions that mention `-f` or a 3 500-character limit — that is a
different courier under the same name** (a fleet's own tool on another machine). Same name, same
path, different machine, different interface: the name does not identify the tool; the
content does (size, checksum, presence of the flag). The code carries the same warning at the
place where someone once called it with `-f`. Exit codes:
`0` placed locally; this does not establish agent consumption or necessarily Telegram delivery. Depending on the mode it means sender notification, an expected recipient owner-all copy, retained sender record, or `--bez-kopii` · `1` not placed · `3` bad call or recipient (refused before
placement) · `4` placed, but the owner copy or the full sender record was not confirmed — do not resend. In the current v1 branch `--bez-kopii` suppresses only the legacy direct tell-owner call; it does not disable the full owner-all record or its reader. Environment: `A2A_KOREN` (`/var/spool/a2a`), `A2A_PREDEL_V_CHAT` (900),
`A2A_PREDEL_ARGV` (500), `A2A_TELL_BIN`, `A2A_REESTR_BIN`.

**`tell-owner "text"` / `echo text | tell-owner`** — a message to the owner's private chat from
the calling agent's **own** bot. Which bot is decided by the calling system user:
`/etc/agent-tell/<user>.conf` (passively parsed keys `TOKEN_FILE`, `CHAT_ID`), so an agent cannot write in
someone else's name even by accident. No config or empty message — exit `1` and a loud line,
never silence: an unsent report looks like "the agent did not report".

**`agent-registry`** — registry queries, verification and layout assembly (Python). It does not edit the registry.
Sub-commands: `kto <user>` — the nickname for a system user (the postman uses this for the owner notification); `list`, `sluzhby` (services and dependencies per agent), `pole <agent>
<field> [--json]`, `mashina [--json]` (machine-wide paths — paths only, never secret values),
`obshchee [--json]`, `pokrytie [--json]` (the whole backup-coverage frame in one call), `pokrytie --json --s-nepolnymi`,
`fakt`, `verify` (intent vs fact), `sobrat [--kuda <new-dir>]` (assemble the layout from templates into a new
directory; directories under `/etc`, `/opt`, `/usr`, `/var/spool`, `/var/lib` are refused). Codes: `0` ok · `1`
`verify`: mismatch · `2` registry unavailable, no `python3-yaml`, `verify`: not checked, `sobrat`: something not
assembled · `3` refusal: no agent or field, bad arguments · `4` `pokrytie --s-nepolnymi`: incomplete frame. The query commands do not write files. `sobrat --kuda` creates the requested new output directory; it does not apply the files or restart services. A missing required field is a refusal, not a guessed default. In a pipeline
take its exit code via `PIPESTATUS` or `set -o pipefail` — `... --json | jq` returns jq's code.

Environment of `agent-registry`: `AGENTS_REGISTRY` (`/etc/agent-registry/agents.yaml`), `WATCHDOG_CONF`
(`/etc/agent-watchdog/watchdog.conf`), and two overrides meant only for the registry stand:
`AGENT_REGISTRY_KATALOG_C` (`/etc/claude-oauth`, the directory of gateway `instance-<agent>.env` files) and
`AGENT_REGISTRY_YUNIT_C` (`claude-oauth-gateway@{}.service`, `{}` = agent name). If either is set, `verify` prints a
line "подстановка <name>=<value>": a forgotten override would otherwise give a false green. The "живое-C" check
(`GATEWAY_TOKEN_FILE` in the gateway env = in the live process environment) compares the full path; for a guest
(`GOST: true`) it compares the token file name (the subscription number) and requires the directory to be
`/run/credentials/<unit>` or the unit's `RuntimeDirectory` — the guest gets a copy of one subscription there.

Registry fields checked by `sobrat`:
- `mashina.imya` — required nonempty string naming the shared system root for assembly. `SISTEMNYE_KORNI` includes it with non-guest agent names; a missing, blank or non-string value refuses assembly with a reason, without a `sadik` default. The guest-root list is unchanged.
- `mashina.raskladka_obshchee.vladelec_telegram` — required positive integer Telegram owner ID, not a string or bool. `_f_parametry` supplies an integer `VLADELEC_TELEGRAM` for `@@VLADELEC_TELEGRAM@@`. Missing, non-integer, zero or negative values refuse assembly with a reason; no former owner ID is inserted as a default.
- `mashina.raskladka_obshchee.postanovshchiki_celey` — required list of nonempty goal-sender names. `[]` is an explicit empty list and is allowed; a missing field is refused. The generator supplies `GOAL_A2A_SENDERS` for `@@GOAL_A2A_SENDERS@@`. Both fields belong to the machine-wide settings; update the templates and generator together. `_f_json_yaml` encodes the list for inline `goalA2ASenders: @@GOAL_A2A_SENDERS@@`: printable and astral Unicode are preserved, while YAML-sensitive DEL/C1/LS/PS are escaped. Insert the owner ID without quotes; per-agent differences cannot override the common ACL fields. Update registry data, the generator and both A templates in one coordinated window.
- `OSTROV_API` (agent difference) — only for `GOST: true` of the `sdk-claude` family: `false` or an object `baseUrl`,
  `keyFile`, `botId` and optional `requestKeyDir`. `baseUrl` is `http://` only (the bridge client speaks HTTP; `https`
  is refused), no userinfo, path or query; `botId` is 1..16 digits; `keyFile` and `requestKeyDir` are absolute paths
  without "..".
- `PDF_BLANKI` (difference) — the channel's PDF letterhead directory (`pdfTemplatesDir`), also only for `GOST: true`
  of `sdk-claude`.
- `namerenie.podpiska: podpiska-N` — the agent's own subscription; `verify` gives it a "подписка-своя" line that
  expects `/etc/claude-oauth/token-podpiska-N` in the gateway env and the file itself. The shared-subscription check
  does not count such an agent.
- `mashina.raskladka_obshchee.sled_podyomov` — the restart-trace path; it lands in profile A as `sledPodyomov`, and
  only for agents in the `podyom-uzla` area (service `<name>.service`, account `<name>`, home `/opt/<name>`), never
  for a guest.
- `ceny` is carried into D only for the model the prices were taken for (`ceny.model` = the summary model); otherwise
  the price catalogue is not carried and the reason goes to stderr.
- `sobrat` refuses if the assembled profile A has no `thresholdRatio`, or a `retainRatio` next to it is not below
  `thresholdRatio` (the rule the platform applies at start-up).

**Layout templates** (`share/agent-registry/shablony-raskladki/`):
- `codex/M.tmpl` (Codex profile): the `omega` MCP server takes its Bearer from the gateway environment variable
  `OMEGA_MCP_API_KEY` (`bearer_token_env_var`; the gateway drop-in supplies it via `EnvironmentFile=/etc/omega/mcp-klyuch.env`);
  the template holds no value. Without the variable only this server fails ("MCP startup failed: Environment variable
  OMEGA_MCP_API_KEY … is not set"). The same variable is excluded from Codex shell commands
  (`shell_environment_policy.exclude`) — it is not hidden from the gateway process.
- `codex/B.tmpl`: the `@deepseek-ai/dsh-command-compact` plugin (manual compaction through the same engine).
- `codex/A.tmpl` and `sdk-claude/A.tmpl`: a `sledPodyomov` block — only when `sobrat` derived it (see above).
- `sdk-claude/A.tmpl` for a guest (`GOST: true`): the `fs-sandbox` plugin — paths and session prefixes closed to the
  model's tools (mailboxes, sessions, keys, API state); service I/O is unchanged.
- `sdk-claude/C.tmpl` for a guest: an empty `GATEWAY_LIMITY_VHOD=` — a guest lacks the group that grants writing
  limits into the dsh-limity intake.

## Environment

| Variable | Reader | Default | Meaning |
|---|---|---|---|
| `A2A_KOREN` | postman, `a2a-send`, `a2a-zavesti`, `a2a-proba-novichka` | `/var/spool/a2a` | mailbox root |
| `A2A_TELL_BIN` | postman, `a2a-send` | `/usr/local/bin/tell-owner` | owner notification command |
| `A2A_REESTR_BIN` | postman, `a2a-send`, `a2a-zavesti`, `a2a-proba-novichka`, `outgoing_mirror.py` | `/usr/local/bin/agent-registry` | registry reader |
| `A2A_ALERT_BIN` | postman | `/usr/local/bin/agent-alert` | machine alert for a non-letter |
| `A2A_PREDEL_V_CHAT` | postman (UTF-16 units), `a2a-send` (characters) | `900` | visible text limit; the postman also limits the complete message to 4096 UTF-16 units |
| `A2A_PREDEL_UVEDOMLENIYA_S` | postman | `15` | owner notification timeout, seconds |
| `A2A_PREDEL_BAJT` | postman, v1 `a2a-send`, `v2_with_mirror.py` | `1048576` | full file: v1 envelope, UTF-8 body and final LF; v2 actual wire. Sender/v2 refuse before publication, postman leaves oversized files in place. Native sender and `--v2` accept 1…1048576 bytes; a value above 1048576 is refused with code 3 before publication. The environment may only lower the limit. Configure consistently |
| `A2A_PREDEL_PISEM` | postman | `100` | letters per mailbox per invocation |
| `A2A_PREDEL_ARGV` | `a2a-send` | `500` | character limit for --text |
| `A2A_GRUPPA` | `a2a-zavesti`, `a2a-proba-novichka` | `a2a-pochta` | bus group |
| `A2A_POCHTALON_BIN` | `a2a-proba-novichka` | `/usr/local/sbin/a2a-pochtalon.py` | postman used by the enrollment probe |
| `A2A_SOSED` | `a2a-proba-novichka` | first mailbox matching its owner, other than the new agent, with owner in the bus group | peer account for refusal/round-trip probes |
| `A2A_V2_HELPER` | `v2_with_mirror.py` | `/usr/local/libexec/a2a-v2.py` | external v2 publisher |
| `HOME`, `DSH_HOME` | `outgoing_mirror.py` | — | sender context; DSH_HOME must be an absolute …/.dsh path |
| `AGENTS_REGISTRY` | `agent-registry` | `/etc/agent-registry/agents.yaml` | registry file |
| `WATCHDOG_CONF` | `agent-registry verify` | `/etc/agent-watchdog/watchdog.conf` | watchdog SERVICES definition |
| `AGENT_REGISTRY_KATALOG_C` | `agent-registry verify` | `/etc/claude-oauth` | gateway environment directory for live-C verification; test override only |
| `AGENT_REGISTRY_YUNIT_C` | `agent-registry verify` | `claude-oauth-gateway@{}.service` | gateway unit pattern ({} = agent name), test override only |


`agent-registry pole` returns code 3, empty stdout and a separate stderr line `agent-registry-error: agent-not-found` or `agent-registry-error: field-not-found` for the two absence cases. The human diagnostic remains but is not the protocol. Loader/registry failure returns 2, without those markers. Current v1 `a2a-send` converts an initial recipient-registry failure to code 3 before placement, preserving the refusal reason on stderr; source-copy failure after placement is code 4. `a2a-zavesti` and `a2a-proba-novichka` do not parse these stderr markers: both registry-code-3 cases are refused before changes, solely by exit code (enrollment returns 3, the probe returns 1); unavailable registry/loader returns 2. The markers remain human-visible diagnostics.

## Complete sender records and delivery stages

A sender in owner-all retains `~/a2a/polnye/agent-outgoing-<sha256>.json`, mode 0600, after confirmed mailbox placement. The record includes the full body, recipient and SHA256(recipient + newline + body) operation key. The `prepareSentCopies` reader belongs to dsh-telegram-multiagent and queues the owner's copy independently. These records have no automatic rotation in a2a-bus; retained records are not automatically resent. Record creation is not a Telegram delivery receipt.

Personal skips the full record. An unknown sender, an absent `kanal` field or JSON null produces a named skip of the optional source copy. Modes other than literal owner-all do not require dom/UID/cwd for this copy; the legacy owner notification may still fail separately. The sender is basename(parent(DSH_HOME)) when set, otherwise basename(HOME), not `kto` by UID. A known owner-all sender requires matching imya/dom/account and valid HOME/DSH_HOME/cwd. The demo/demosvc example is personal; owner-all demo needs a home named demo owned by demosvc. Failed mandatory scope or registry checks return code 4 after placement; do not resend automatically. A loader/registry failure without an exact marker never becomes a normal skip.

`a2a-send --v2 …` uses `/usr/local/libexec/a2a-v2.py` from dsh-pochta, outside this package. It depends on that publisher's callable `main`, `put`, `wire` interface; recheck the integration when upgrading the publisher. A2A_KOREN does not configure the external v2 publisher. The raw mirror body limit is 1048576 bytes; a serialized JSON record is limited to 8388608 bytes. Maximum v1 body = `A2A_PREDEL_BAJT − delivery-v1 envelope bytes − 1 final LF byte`, 1048484 bytes with defaults. This is derived, not a separate setting; v2 counts its actual wire. An invalid A2A_PREDEL_BAJT or one above 1048576 is refused before publication; the environment cannot raise the limit. Stdin keeps private letter text out of argv.

## tell-owner

Use stdin for private text: `printf '%s' 'message' | tell-owner`. For short text beginning with a dash use `tell-owner -- '-message'`. `-h`/`--help` exit 0 with usage on stdout; an unknown first option exits 2 on stderr. Empty text, configuration/token/CHAT_ID, transport or Telegram failure exits 1 on stderr. Success exits 0 with no output. Options after the first argument remain text; check the code, not just the output.

`/etc/agent-tell/<account>.conf` is parsed passively: a UTF-8 regular file (not a symlink/FIFO), owned by UID 0, with no group/other write permission, at most 16384 bytes. The opened fd and its metadata are checked before reading that same fd. For example, use 0644 or 0640 with the required read-only group. Both pairs are required exactly once: `TOKEN_FILE=<absolute path>` and `CHAT_ID=<nonzero integer ID>` (optional minus, no leading zeros). Quotes, spaces around `=`, blank lines and `#` comments are allowed. `export`, unknown keys and repeated keys are refused. There is no `source`/`eval` or command execution: shell substitutions are not expanded; characters in an otherwise valid absolute path are literal data. Errors go to stderr.

The administrator creates the configuration; the package does not. `a2a-zavesti` only reports its presence. Use root:root 0755 for `/etc/agent-tell`, and root:root 0644 or root:<agent group> 0640 for the file, with actual read access checked as the agent.

The token stays in a separate file named by `TOKEN_FILE`; never put its value in argv or the README. `ProtectHome=true` remains enabled: keep both configuration and token outside `/home`, `/root` and `/run/user`, normally configuration in `/etc/agent-tell` and token in `/etc/dsh-telegram`, readable only by the required account. The administrator grants token-file access only to the required account, for example root:<agent group> 0640 without group/other write, in a traversable directory. Parent directories must prevent unprivileged replacement of the file. `tell-owner` checks that the token is accessible and nonempty; it does not validate token-file ownership or mode. This is a deployment contract, not a new runtime protection or a measurement of live paths.

## Tests

Module 08 adds `python3 -B test/stend-13-21.py`: it reads the packaged generator and templates to check mandatory owner/goals, refusal of per-agent common ACL overrides, the shared machine root and alert prefix. It needs `python3-yaml`, not root. Run `sudo python3 -B test/stend-alpha.py` for the sender, registry and root postman against private mailboxes with fixture transport/logger. It needs root, `python3-yaml` and the adjacent `../dsh-pochta/libexec/a2a-v2.py` publisher or explicit `STEND_A2A_V2_SOURCE` (deployment: `/usr/local/libexec/a2a-v2.py`). Optional `M08_PACKAGE` selects a source copy; by default both stands read their own package. `sudo python3 -B test/stend-limit-owner.py` runs exactly seven R3 checks for the native/v2 environment limit and integer owner; it needs both packaged sibling stands and their prerequisites, including root and the v2 source. Importing the file does not start its suite. Exit codes: 0 — checks executed and passed, 1 — failed, 2 — missing prerequisites/blindness. None of these stands sends live mail, calls a model or restarts services. Register all three names in the stand traversal; `stend-alpha.py` and `stend-limit-owner.py` need root and an explicit v2 source.

Run `python3 -B test/stend-outgoing-mirror.py` from the package directory. It runs unittest assertions against private mailboxes, a fixture registry, fixture tell-owner and a fixture v2 publisher. No live bots, mailbox delivery or service restart is tested. One reader case requires Node and the adjacent `../dsh-telegram-multiagent/src/sent-copies.js`: retain this repository layout for that case. The sender invokes `logger`; use an isolated test environment or a fixture logger when production journal writes are not permitted.

The unknown-sender fixture emits the ASCII registry marker. The maximum v1 body fixture subtracts the envelope and final LF, then calls the real channel reader.

## Other exit codes

| Utility | Codes |
|---|---|
| a2a-pochtalon.py | 0 processed or nothing to process; 1 some letters refused/left in place (service SuccessExitStatus=1); 2 measurement unavailable: not root, unreadable root or no mailbox directories |
| a2a-zavesti | 0 ready; 1 failed steps; 2 wrong invocation, unavailable reader/python, loader failure or malformed JSON before changes; 3 missing agent/account; 4 not root |
| a2a-proba-novichka | 0 checks match; 1 mismatch; 2 unavailable/incomplete checks; expected 8 checks without a peer and 11 with a peer |
| tell-owner | 0 silent success or help on stdout; 1 text/config/token/chat, transport or API failure on stderr; 2 unknown first option on stderr |

## Output glossary

- `письмо положено` — placed in the local mailbox; not agent consumption or a Telegram receipt.
- `ЯЩИК ЧУЖОЙ` — the selected mailbox does not belong to this recipient; refused before placement.
- `СЛЕПОТА` — the measurement could not establish the result; it is not a successful test.
- `ОСТАВЛЕНО` — the postman left a refused letter in place.
- `полная копия ... не подтверждена` — publication succeeded but the sender-copy stage was not confirmed; do not resend the original letter automatically.

## License

MIT, same as the rest of this repository.
