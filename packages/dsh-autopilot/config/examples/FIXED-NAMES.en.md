# Unix names fixed by the code

[Русский](FIXED-NAMES.md) · [Configuration notes](INSTALL-NOTES.en.md)

Code baseline: `32c91d0b`, dsh-autopilot 0.1.16. Configuration placeholders do not make the current runtime independent of names. This kit changes no code. This is a translation of the Russian document at `06745c79`; code references retain its baseline and line numbers.

The operator is `master`; executors are `vintik`, `shpuntik`, `gayka`, `sova`, `shurup`, `tumbler`; services are `autopilot-post`, `autopilot-copy`. These names are not secrets. UIDs, private paths, chat/bot IDs and display names or mentions may vary within the validation rules.

Main constraints:

- `lib/mail_service.py:26,68–83` defines TEAM and Unix groups for all seven accounts; `lib/mail_copies.py:12,24,37` and `lib/mail_retention.py:11,79` require exactly the same configuration keys.
- `lib/pilot_mail.py:35,535,673` fixes sender/recipient roles; `lib/mail_registration.py:85` permits only the operator to register a RUN.
- `lib/runtime-guard.py:11`, `runtime/ap_sadik.py:1269` restrict runtime/publisher to the operator; `lib/public_tree.py:8,70` fixes the operator and public path.
- `runtime/time_collection.py:83,110,133,173,197` covers the operator in the roster, postal database owner, finish UID and publisher UID checks.
- `lib/operator_window.py:68–70` fixes `master.service` and `coder-gateway-master.service`; `runtime/run_catalog.py:150,193,299,353` fixes the Unix operator/catalogue group. The forward helper uses this through `window/katalog-okno.py:236–239`.
- In the adjacent package, `dsh-telegram-multiagent/src/autopilot-notice.js:3–19` fixes TEAM and has a separate operator branch. `src/claude-turn-usage.js:10–12` uses the **Unix account**, not the TG display name.
- `systemd/autopilot-mail.service` / `autopilot-copy.service` / `autopilot-mail-failed@.service` fix service-account names; the notice template fixes `/opt/%i/...`; the usage unit fixes the public/operator path. Adapt unit files before starting them with a different layout.

## Fixed spool path

`spool-acl.conf.in` retains `/var/spool/dsh-trevogi` literally: it is the layout shared by the current services, not a private address of the source server. AP fixes it in ExecStartPre and ReadWritePaths in `systemd/autopilot-mail.service:20,32`, and in ReadWritePaths in `systemd/autopilot-mail-failed@.service:14`. In the adjacent package, `dsh-trevogi/systemd/agent-alert-otpravitel.path:7` monitors it through DirectoryNotEmpty; `systemd/dsh-trevogi-spul.tmpfiles:4–8` creates its directories.

The client itself does not require an immutable path: `dsh-trevogi/lib/dsh-trevogi/nastrojki.py:32` sets the `AGENT_ALERT_SPUL` default, and `lib/dsh-trevogi/klient.py:62–64` reads it. Changing one environment variable is insufficient for AP: another root requires coordinated adaptation of alert configuration, the path unit, tmpfiles, AP service sandbox and ACL fragment. This kit changes no code or units; keep E05's path for the layout described here.

## Python literal references in this package

The table groups AST string literals containing these names as `file:lines`, relative to the dsh-autopilot root. The search covers lib/runtime/tools/window/checks, excluding test/stend files and multiline text. It includes auxiliary/historical readers and diagnostic strings: **not every literal is a separate restriction in active v5**. This is an index for future adaptation, not a guarantee that computed names, shell/JS literals or names in the vendor archive are absent.

| File | Lines |
|---|---|
| `lib/accepted_inventory.py` | 6, 28, 98, 105 |
| `lib/mail_copies.py` | 12, 13 |
| `lib/mail_registration.py` | 85 |
| `lib/mail_retention.py` | 11, 49, 51, 56, 57, 58, 123, 132 |
| `lib/mail_service.py` | 26, 27, 80, 106, 107, 214, 257 |
| `lib/operator_window.py` | 68, 70, 199, 200 |
| `lib/owner_inventory.py` | 83, 122, 185, 189, 216, 223 |
| `lib/pilot_archive.py` | 115, 116 |
| `lib/pilot_mail.py` | 35, 199, 208, 242, 307, 466, 535, 591, 673, 674, 717 |
| `lib/post_layout.py` | 47, 52, 54, 55, 56, 57 |
| `lib/public_tree.py` | 8, 58, 66, 70 |
| `lib/release_rollback.py` | 307 |
| `lib/runtime-guard.py` | 6, 11, 12 |
| `runtime/ap_sadik.py` | 1269, 1270 |
| `runtime/run_catalog.py` | 24, 150, 193, 299, 353 |
| `runtime/runtime_incremental.py` | 270, 515 |
| `runtime/runtime_receipt_source.py` | 187, 217, 229, 282, 289, 430, 457, 514, 555, 560, 570, 574, 698, 839, 952, 966, 977, 1030, 1224, 1345, 1355, 1379, 1420, 1448, 1554 |
| `runtime/session_ownership.py` | 78, 81 |
| `runtime/team_usage.py` | 495, 511, 514, 693, 772, 795, 801, 870 |
| `runtime/time_collection.py` | 83, 110, 133, 173, 197 |
| `runtime/usage_registration.py` | 266, 285, 416, 462, 476, 477, 522 |
| `tools/claude-root-origin.py` | 80, 84, 95, 103, 117, 123 |
| `window/katalog-okno.py` | 138, 148, 149, 182, 185, 187 |
| `window/notice-10min.py` | 5 |
| `window/pdry-server.py` | 2 |
| `window/preserve.py` | 14 |
| `window/receipt/judge-receipt.py` | 5, 51 |
| `window/receipt/probe-receipt.py` | 24, 27, 28, 29, 39, 43, 45, 46 |
| `window/receipt/usage-reference.py` | 42, 62 |
| `window/writer-common.py` | 4, 81, 83 |
