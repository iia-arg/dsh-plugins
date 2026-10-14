# dsh-schedule-guard 3.1.3

Russian reference: [README.md](README.md). Supported platform: DSH 0.2.0-rc.2 with the `schedule` service;0.1 is unsupported since 0.6.0. The 0.6.4→3.1.1 jump is intentional under the owner's 10.10 module-release rule. No npm publication is performed. The tested snapshot is Node 24.19.0, Cordis 4.0.4, schemastery 3.18.4.

## Owner boundary and configuration

Owner instruction 30.09 02:26 «Б»: Petrovich's schedule remains unlimited. Keep the schedule plugin enabled and leave the guard unmounted, or set **guard config** `enabled: false`. This installs no guard hooks, removes no reminders and registers no heartbeat tool. It does not disable the scheduler. New `limitOneShotWakeups` defaults false and is opt-in for separately chosen bounded profiles. The package does not edit actual profiles.

Required `inject` services are agents/sessions/tools/schedule. Without schedule, apply is **not invoked**, the plugin stays inactive and no guard startup warning is emitted. A module import is not proof that the provider service is mounted. Enable the 0.2 schedule provider in the same Cordis scope; installing a peer package alone is insufficient.

Use a local verified archive: `npm pack --ignore-scripts`; in a pnpm profile add `/absolute/path/dsh-schedule-guard-3.1.3.tgz`. Until it is published to npm as `dsh-schedule-guard`, do not fetch a bare registry name or change dist-tags. Profile dump-config writes cordis.yml. Runtime changes require the deployment operator's engine restart; the guard has no own daemon/unit.

Defaults: enabled=true, limitOneShotWakeups=false, maxConsecutiveWakeups=6, maxPerDay=48, maxPerHour=4, minRepeatingIntervalSeconds=1800, resetKinds=[user,a2a], dayBoundaryOffsetMinutes=0, notifyTimeoutSeconds=90, notifyCmd unset. maxPerHour <= 0 disables the hourly cap; notifyTimeoutSeconds <= 0 falls back to 90. Empty resetKinds uses the default.0.2 has four native schedule tools, with its own every floor 60 seconds;1800 is the additional guard floor.

The native tools/execute hook handles schedule_create and schedule_update. Codes: SCHEDULE_TOO_FREQUENT, SCHEDULE_HOURLY_CAP, SCHEDULE_CRON_NOT_ALLOWED, SCHEDULE_SOURCE_UNAVAILABLE; opt-in counters add SCHEDULE_STREAK_CAP/SCHEDULE_DAILY_CAP. Counter admission uses>=, idle sweeping uses>. Content-only updates and proven interval increases can relieve an exhausted budget; shortening or unverifiable timing changes remain refused. Backend validation still owns ids/arguments.

Idle interval violations delete only offending repeats; streak/day violations delete every repeat and, with opt-in, one-shots too. All active reasons are named. No deletion does not prove a stopped schedule; the notice never falsely says it stopped. One unchanged episode is logged once. Failed notification retries the saved original notice on a later idle, success notifies once per episode; a timed-out channel is not retried until the episode clears. notifyCmd receives text through stdin without shell. Timeout SIGKILL affects only the direct child.

## Persistence, privacy and lifetime

Before delete, full records are appended to `<DSH_HOME>/schedule-guard-snyatye.jsonl` and fsync'ed; creation mode 0600, existing permissions not forced, no rotation/size limit. Without DSH_HOME, os.homedir()/.dsh is used. Archive failure means no deletion. An unreadable session journal causes an enabled guard to retire all active reminders, including one-shots; disabled guard never does so.

stderr contains reason/counts/id and text lengths (Unicode code points), never full reminder/summary text. Full data stays in the private archive and owner notice. Deletion on 0.2 uses the service and `{deleted:true}`; its evidence is stderr+archive, not a durable schedule/change event. That event is only for historical 0.1 records. The inherited prefix is passed to the legacy fold.

heartbeat_close is optional on observed roots: it reports summary/counts through the notification channel, but neither deletes reminders nor resets session events. Outside user/a2a messages reset the counted streak; no automatic summary is promised. Native registration/execution and scoped hooks are tested with actual ToolRuntime.

Effects/listeners belong to the guard plugin scope. Teardown removes them and prevents a pending sweep from starting later writes/deletes; an already-started backend delete cannot be undone. The per-agent latch admits at most one sweep and clears in finally. A hung backend list/delete has no new guard timeout, so availability while it stays pending is not guaranteed. This is cooperative protection, not a security boundary against a fully privileged agent.

## Tests and observed logs

Runtime logs are in Russian; see README.md for `schedule-guard [подъём]: пределы:` field layout and all 10 defaults. Examples are field layouts rather than a verbatim instance log. Audit installation/removal by actual source/version and deleted count, not the presence of a generic limit message.

npm test runs only test-preemptive-refusal.mjs (13 probes plus real defineTool assertions). Provide DSH_TOOLS_MODULE or normal package peers; absent tools module is blindness 2. The four original test/ stands require DSH_TEST_APP: stend-heartbeat-close.mjs (8), stend-raspisaniya-0.2.mjs (10), stend-uvedomleniya.mjs (6), stend-zhivye-korni.mjs (4). New packaged entries: stend-audit-runtime.mjs (13), stend-native-lifecycle.mjs (DSH_TEST_APP, real scoped ToolRuntime and reload), stend-audit-docs.mjs (15 ). 0=executed success,1=mismatch,2=missing prerequisites.

Tests use only synthetic records/agents/private DSH_HOME, no live models or Telegram. External acceptance is a verdict tied to immutable Git heads/checksums, not registry tags. MIT; historical latency measurements are not fresh live evidence.
