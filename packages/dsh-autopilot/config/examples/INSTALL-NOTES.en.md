# E01–E05: manual configuration after install.sh

[Русский](INSTALL-NOTES.md) · [Autopilot installation guide](../../README.en.md)

These dsh-autopilot 0.1.16 examples follow the structure of deployed configurations, with addresses, UIDs, participant names and Telegram IDs replaced by placeholders. They contain no secret values. They supplement the [installer](../../install.sh); they are not a server installer. Package code stays unchanged. See [FIXED-NAMES.en.md](FIXED-NAMES.en.md) for names fixed by the code.

This translation uses the Russian notes at `06745c79`. Snapshot counts below are observations reported by Gamma in that source, not new measurements or evidence of a cold installation.

**Before install.sh:** create an unprivileged Unix account named `master` (UID >0) and keep it out of `autopilot-view`. The installer checks this through `lib/public_tree.py:54–66` and refuses without it. The remaining steps supplement an installed AP release.

## Fill in the placeholders first

| Example | Destination of the completed configuration | Owner and mode |
|---|---|---|
| E01 `source-profile.json.in` | `/var/lib/autopilot-usage/source-profile.json` | root:root, 0600 |
| E02 `tg-autopilot.fragment.json.in` | TG plugin config fields in **each** agent's profile; not a complete cordis file | Follow the private profile's rules; preserve its owner and mode |
| E03 `copy.json.in` | `/etc/autopilot-mail/copy.json` | root:root, 0644 |
| E04 `retention.json.in` | `/etc/autopilot-mail/retention.json` | root:root, 0644 |
| E05 `spool-acl.conf.in` | `/etc/tmpfiles.d/autopilot-mail-spool-acl.conf` | root:root, 0644 |

The `.in` files are templates. Replace `__...__` strings and remove the `.in` extension only from the completed result. Do not install templates over working files. JSON does not support comments, so the explanations are here.

- `__OPERATOR_UNIX__` → `master`; `__WORKER_1_UNIX__` → `vintik`; `__WORKER_2_UNIX__` → `shpuntik`; `__WORKER_3_UNIX__` → `gayka`; `__REVIEWER_UNIX__` → `sova`; `__WORKER_4_UNIX__` → `shurup`; `__WORKER_5_UNIX__` → `tumbler`. **The current code requires these names.** The placeholders identify roles; they do not make the names configurable.
- `__MEMBER_UNIX__` is one of these names; `__POSTMAN_UNIX__` is `autopilot-post`. Create seven distinct unprivileged UIDs. Obtain their values with `id -u`; do not copy them from another host.
- Replace `__..._INTEGER__` values in JSON **including their quotes** with numbers: UID >0, trafficChatId <0, publisherBotIds >0. In `copy.json`, `__..._DECIMAL_STRING__` values remain decimal strings: chat_id is negative, and bot_user_id is positive and specific to each bot. All seven TG publisherBotIds must match bots in copy.json.
- `__..._ABSOLUTE_PATH__` means an absolute physical path, with no symlink or `..`. For Codex, SOURCE_HOME is the actual CODEX_HOME where the gateway writes `dsh-usage-hodov.jsonl`. For Claude, the reader uses `ap-usage-hodov-v1.jsonl` beside `runtimeSource.raw`. `LEDGER_ROOT` is the private TG directory. E01 retains only profile fields used by v5; it omits old G/native/ledger descriptors and node fingerprints.
- `__MEMBER_DISPLAY_NAME__` / `__MEMBER_MENTION__` are your participant's display name and mention in the working Telegram group. They do not replace the Unix participant. Repeat E02 for every agent, with its own noticeDir.
- BOT_TOKEN_DIRECTORY is a private directory holding seven separately issued bot token files. JSON contains only their **paths**. Do not put token values in JSON, command arguments or the repository. The on_send/on_receive flags and retention policy follow the source configuration; explicitly choose the publications and retention periods you need before enabling them. A retention threshold is not the collector's read budget.

## Why an installed source-profile can be longer

The source's legacy-installation snapshot of 22 October 2026 reports **29 keys versus 10 in E01**. Counting method: four top-level keys plus every key in **one** participants object, recursively, including intermediate objects. Array elements are not counted again for each team member. Each of the snapshot's seven participants has 25 nested keys, versus six in the example. This describes that snapshot, not a schema limit.

The deployed profile retains fields including `gatewaySource`, `gatewayTransport` with `node`, `nodeSha256`, `policyCli`, `version`, plus gid/tgService/sources and earlier native/ledger descriptors. Collector **0.1.16 does not read** those additional fields from the old R/G path: its active participant access is limited to name/uid/engine/home and `runtimeSource.raw` (`runtime/time_collection.py:60–83`). The difference in length therefore does not make E01 incomplete. The example deliberately omits another host's paths and node fingerprints; it does not reproduce historical tools that used the old profile.

## Manual setup order

1. Prepare DSH and the agent profiles, gateway/adapter and, where needed, bridge. Codex accounting needs the app-server end writer (contract introduced in gateway 3.1.5; this guide pins 3.1.10); Claude needs TG 3.1.15. Standard bootstrap requires working `master.service` and `coder-gateway-master.service` under the operator's UID. Do not rename them without adapting the code. TG memory is an optional event helper when a native fallback is available.
2. Check the operator account created before install.sh; create the other six fixed Unix accounts and service accounts `autopilot-post` / `autopilot-copy`. All belong to `autopilot-mail`. The services must not belong to ordinary mail; if `a2a-pochta` exists, the six team members other than the operator must also stay out of it. `lib/mail_service.py:68–83` checks these requirements. The installer creates the public-reader group `autopilot-view`, but the operator **must not** belong to it (`lib/public_tree.py:54–70`).
3. Prepare `/etc/autopilot-mail` as root:root 0755. Fill E03/E04. The token directory is root:autopilot-copy 0750; each token file is a regular file with one link, root:autopilot-copy 0640. Generate your own TLS pair with `tools/prepare-mail-tls.py` in a new private directory, then install it separately: certificate `/etc/autopilot-mail/server.pem` root 0644; private key `/var/lib/autopilot-mail/server.key` autopilot-post 0600. The postal state directory is autopilot-post 0700. The key and certificate must form a pair; the client uses the same public certificate.
4. Install the separate postal layout defined by `lib/post_layout.py`; the basic install.sh does not deploy it. Current `systemd/autopilot-mail.service` and the notice worker use post/0.1.10; **copy/failure units point to post/0.1.3**. Before startup, reconcile these paths with installed releases and imports. Do not enable templates whose ExecStart is missing. `/usr/local/bin/autopilot-mail` must point to the installed postal wrapper. The service creates `/run/autopilot-mail/post.sock` (group autopilot-mail, 0660).
5. Install dsh-trevogi with its spool, ACL and working sender path unit. E05 adds only postman permissions and preserves other rules. After filling it, apply this separate fragment with the commands below; the administrator performs this manually:

   ```sh
   # The current directory contains a completed spool-acl.conf, with no __...__.
   sudo install -o root -g root -m 0644 spool-acl.conf /etc/tmpfiles.d/autopilot-mail-spool-acl.conf
   sudo systemd-tmpfiles --create /etc/tmpfiles.d/autopilot-mail-spool-acl.conf
   sudo getfacl /var/spool/dsh-trevogi/tmp /var/spool/dsh-trevogi/vhod
   ```

   Check ACL `u:autopilot-post:wx`, traversal access to `itog/` and sender settings. Do not replace the whole shared `/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf`. Configure team ACLs for other tasks separately.
6. Create each participant's private notice inbox: a physical directory owned by the agent, mode 0700, with notices mode 0600. Merge E02 into the existing TG plugin's config while preserving other profile fields. Settings are read at startup, so changes require a coordinated restart. The notice unit template uses `/opt/%i/...`; a different home/workspace needs an adapted unit. A JSON fragment alone does not create a DSH profile or agent service.
7. Prepare `/var/lib/autopilot-usage` and `registrations` as root:root 0755, and E01 as root 0600. Postman needs to read the root-owned ACK, mode 0644, and traverse both directories. On a **new** installation, do not create an arbitrary `index.json`: if it is absent, the reader returns an empty index, and the collector writes its own origin-bound index/state (`runtime/runtime_receipt_source.py:1084–1104`). Do not copy another host's time-state/ACK/postal database or use this advice to clear an existing installation.
8. Before the first init, bootstrap `/var/lib/dsh-autopilot` separately with `window/katalog-okno.py`, an accepted root census, a real bounded fence over the two units and an open dsh-montazh window. Its registry must describe your host's actual releases, profiles and permissions. dsh-reestr/dsh-podyom, and for copies/publication `dsh-pribory ≥3.1.2` / dsh-vypusk-watch, belong to that deployment route; they are not Python imports of the collector. Do not substitute invented JSON for fence receipts. `ap-run-inventory.py bootstrap` requires a rollback fence; `katalog-okno.py` is the forward helper.
9. Check public directories, the installed skill/tool path and permissions against `lib/public_tree.py`; set E01 projectRoots to an existing project or project-root directory. Install the required mail/copy/notice/usage units and timers after checking configuration. install.sh does not enable them. The final observable chain is: a normal init → a new usage_registrations row → the first normal tick → RUN/full roster in the index/v5 receipt → matching REGISTERED ACK → later removal of the row by normal Postman operation. A manual SELECT or an empty queue alone does not prove this chain.

This is a manual preparation plan, not the result of a cold-install test. Before running completed JSON configurations, check their syntax with `python3 -m json.tool <file>` and the types/constraints above. That command does not check UIDs, permissions or API availability. Runtime validators must reject unfilled templates.

## E06–E09 remain outside these examples

- **E06:** generate the installed-check manifest and registry entries for the target installation's real files, paths and UIDs. Do not copy another host's deployed manifest.
- **E07:** the operator kit for an accepted window is separate material. Establish your own bootstrap/update and rollback order; a link to an earlier kit does not make it a universal installer.
- **E08:** the old manual measure-run-codex is optional diagnostics. Use the package's corresponding tool if needed; it is not part of the new v5 service.
- **E09:** configure external TLS/domain/basic-auth/reverse proxy/firewall for the remote dashboard yourself. The source server's network addresses and keys are not needed to prepare these examples.
