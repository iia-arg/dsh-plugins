// dsh-schedule-guard — a behavioral guard over dsh-schedule self-wakeups.
//
// What it is NOT: a security boundary. It caps a cooperative mechanism — the
// reminders a model sets for itself through the schedule tools — and stops
// ACCIDENTAL runaway loops (a model that keeps re-scheduling itself). An agent
// with full privileges can read and rewrite its own session journal (where the
// counter lives), drop the guard, or schedule through another path. Read the
// limits below as a governor for a well-behaved loop, never as enforcement.
//
// Counter is FOLDED FROM THE SESSION JOURNAL (schedule/change dispatch = one
// autonomous wakeup, user/message with source.kind === "user" = a human word and
// a reset). There is no separate state file, so a platform restart structurally
// cannot zero the counter: it survives exactly as reliably as the reminders
// themselves do (i.e. as long as the session is resumed from disk).
//
// Reentrancy: the platform publishes session events SYNCHRONOUSLY and holds a
// lock while doing so ("session append cannot reenter while another append is
// being published"). The shutdown (append delete) is therefore deferred through
// ctx.agents.withoutInitiator, the same trick dsh-schedule's own requestDrive
// uses. NOTE: this is a PRECAUTION here, not a fix for an observed failure — the
// guard's hook is agent/status idle, which is NOT a session event, so the lock
// does not hold it. (The sibling case where the lock DID bite was a hook on a
// session event, proven by a separate harness. Don't merge the two cases: same
// code change, different grounds.)
import { execFileSync } from 'node:child_process'
import z from '@deepseek-ai/schemastery'

// @deepseek-ai/dsh-schedule is the SUBJECT of this guard: without it there is
// nothing to guard. Import it lazily so its absence degrades the guard to INERT
// (one loud log line) instead of crashing the whole composition — a plugin whose
// module fails to load kills the entire tree.
let foldScheduleEvents = null
try {
  const scheduleModule = await import('@deepseek-ai/dsh-schedule')
  foldScheduleEvents = scheduleModule.foldScheduleEvents
} catch {
  foldScheduleEvents = null
}

export const name = 'dsh-schedule-guard'
export const inject = ['agents', 'sessions', 'tools']

// No .default(): a missing field stays undefined, so the startup line honestly
// distinguishes "configured" from "defaulted". Behavior that looks identical for
// a lost field and for a correct setting is blindness.
export const Config = z.object({
  maxConsecutiveWakeups: z.number(),
  maxPerDay: z.number(),
  minRepeatingIntervalSeconds: z.number(),
  dayBoundaryOffsetMinutes: z.number(),
  notifyCmd: z.string(),
})

const DEFAULTS = {
  maxConsecutiveWakeups: 6,
  maxPerDay: 48,
  minRepeatingIntervalSeconds: 1800,
  dayBoundaryOffsetMinutes: 0,
}

function log(tag, text) {
  process.stderr.write(`schedule-guard [${tag}]: ${text}\n`)
}

/** Start of the local calendar day for a given timestamp. */
function dayBoundaryStart(tsMs, offsetMinutes) {
  const shifted = new Date(tsMs + offsetMinutes * 60000)
  shifted.setUTCHours(0, 0, 0, 0)
  return shifted.getTime() - offsetMinutes * 60000
}

/** Wakeup counters, folded from the session journal. */
function countWakeups(events) {
  let consecutive = 0
  let maxConsecutive = 0
  const dispatchTimes = []
  for (const e of events) {
    if (e.type === 'user/message' && e.data?.source?.kind === 'user') {
      consecutive = 0
    } else if (e.type === 'schedule/change' && e.data?.operation === 'dispatch') {
      consecutive += 1
      if (consecutive > maxConsecutive) maxConsecutive = consecutive
      dispatchTimes.push(e.time)
    }
  }
  return { consecutive, maxConsecutive, dispatchTimes }
}

function buildStopMessage(config, reason, deleted, done, now) {
  const lines = ['🔴 schedule-guard: stopped by the autonomous-wakeup limit.']
  lines.push(`Reason (in numbers): ${reason}`)
  if (deleted.length > 0) {
    lines.push('Deleted repeating reminders:')
    for (const r of deleted) {
      lines.push(`  - id ${r.id}, interval ${r.everySeconds}s, text: ${JSON.stringify(r.prompt)}`)
    }
  } else {
    lines.push('No repeating reminders to delete (the loop used one-shots).')
  }
  lines.push(`Accomplished during the autonomous stretch: ${done}`)
  lines.push('Resume: only by a human word (any message resets the counter).')
  lines.push(`Time: ${new Date(now).toISOString()}`)
  return lines.join('\n')
}

export function apply(ctx, rawConfig) {
  if (!foldScheduleEvents) {
    log('startup', '🔴 @deepseek-ai/dsh-schedule is not resolvable — the guard is INERT (no schedule fold, nothing to guard)')
    return
  }
  // Resolve config with a source marker — for the startup line.
  const config = {}
  const srcParts = []
  for (const [k, dflt] of Object.entries(DEFAULTS)) {
    const has = rawConfig?.[k] !== undefined
    config[k] = has ? rawConfig[k] : dflt
    srcParts.push(`${k}=${config[k]} (${has ? 'configured' : 'default'})`)
  }
  const notifySet = rawConfig?.notifyCmd !== undefined
  config.notifyCmd = notifySet ? rawConfig.notifyCmd : undefined
  srcParts.push(`notifyCmd=${notifySet ? 'set' : 'unset (log only)'} (${notifySet ? 'configured' : 'default'})`)

  log('startup', `limits: ${srcParts.join(', ')}`)
  log('startup', 'not applied to: wakeups by a human message (not a dispatch); an already-running turn (the cycle is stopped, not the turn); goal rounds and background jobs (not schedule dispatchers)')

  // Refuse before the fact, so the MODEL learns the floor; the idle reaper
  // below stays as the backstop. TWO ROUTES, TWO PLACES — deleting either
  // silently disarms one:
  //  - this hook sees only calls that enter the platform tool registry (the
  //    native loop); a bridge that invokes the tool body directly never reaches
  //    this waterfall, and only the reaper catches those;
  //  - the reaper sees only what was already created, and is invisible to the
  //    model; only this hook tells the model "no, the floor is X" so it can
  //    re-schedule correctly on the spot.
  // They read like duplication and are not.
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== 'schedule_create') return next()
    const every = exec.arguments?.every_seconds
    if (typeof every !== 'number' || every >= config.minRepeatingIntervalSeconds) return next()
    const message =
      `repeating reminder no more often than every ${config.minRepeatingIntervalSeconds}s ` +
      `(asked ${every}s) — this is a host limit, not an error: re-schedule at or above the floor`
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
      // `error` is mandatory: without it the registry answers "tool result must
      // be losslessly JSON-serializable" and the model is told the plumbing broke
      // instead of why it was refused.
      error: { message, info: { name: 'ScheduleGuardError', code: 'SCHEDULE_TOO_FREQUENT' } },
    }
  })

  const watched = new Set()
  const notified = new WeakSet()

  ctx.on('agent/created', ({ agent }) => {
    if (!ctx.agents.roots().includes(agent)) return
    watched.add(agent)
    log('startup', `session under guard: ${agent.session.id} (total ${watched.size})`)

    agent.ctx.on('agent/status', ({ status }) => {
      if (status !== 'idle') return
      const events = agent.session.events
      if (!events.some((e) => e.type === 'schedule/change')) return

      const { consecutive, dispatchTimes } = countWakeups(events)
      const dayStart = dayBoundaryStart(Date.now(), config.dayBoundaryOffsetMinutes)
      const perDay = dispatchTimes.filter((t) => t >= dayStart).length

      const folded = foldScheduleEvents(events)
      const repeating = folded.active.filter((r) => r.kind === 'every')
      const tooFrequent = repeating.filter((r) => r.everySeconds < config.minRepeatingIntervalSeconds)

      const overConsecutive = consecutive > config.maxConsecutiveWakeups
      const overPerDay = perDay > config.maxPerDay
      const overInterval = tooFrequent.length > 0
      if (!overConsecutive && !overPerDay && !overInterval) return

      const reason = overConsecutive
        ? `${consecutive} wakeups in a row without a human word (limit ${config.maxConsecutiveWakeups})`
        : overPerDay
          ? `${perDay} wakeups today (limit ${config.maxPerDay})`
          : `repeat faster than ${config.minRepeatingIntervalSeconds}s (intervals: ${[...new Set(tooFrequent.map((r) => r.everySeconds))].join(', ')}s)`

      // The interval limit stops only the offenders; the other two stop all repeats.
      const toDelete = overInterval ? tooFrequent : repeating

      ctx.agents.withoutInitiator(async () => {
        try {
          const deleted = []
          for (const r of toDelete) {
            agent.session.append('schedule/change', { version: 1, operation: 'delete', id: r.id })
            deleted.push(r)
          }
          if (deleted.length > 0) {
            ctx.sessions.flush(agent.session).catch(() => {})
          }
          const msg = buildStopMessage(config, reason, deleted, `${dispatchTimes.length} autonomous wakeups total`, Date.now())
          log(agent.session.id, msg.replace(/\n/g, ' | '))
          if (config.notifyCmd && !notified.has(agent)) {
            notified.add(agent)
            try {
              execFileSync(config.notifyCmd, [msg], { stdio: 'ignore' })
            } catch (e) {
              log(agent.session.id, `owner notification failed: ${e?.message ?? e}`)
            }
          }
        } catch (e) {
          log(agent.session.id, `shutdown failed: ${e?.message ?? e}`)
        }
      })
    })
  })
}
