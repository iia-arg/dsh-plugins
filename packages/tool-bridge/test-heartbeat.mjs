// The bench takes the text of the functions FROM THE PACKAGE FILE instead of
// rewriting them: what is checked is the code that will ship, not a retelling.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const SRC = `${dirname(fileURLToPath(import.meta.url))}/src/index.js`
const lines = readFileSync(SRC, 'utf8').split('\n')

// 🔴 Cut BY NAME, not by line numbers. Numbers shift on any edit higher up in
// the file, and the bench then silently checks the wrong thing — or fails to
// parse, which is the lucky case. A name survives a function being moved.
const cut = (name, kind = 'function') => {
  const head = headOf(name, kind)
  const i = lines.findIndex((l) => l.startsWith(head))
  if (i < 0) throw new Error(`the package file has no ${kind} ${name} — the bench is checking the wrong file`)
  if (kind === 'const') return lines[i]
  const j = lines.findIndex((l, k) => k > i && l === '}')
  if (j < 0) throw new Error(`could not find the end of ${name}`)
  return lines.slice(i, j + 1).join('\n')
}
const headOf = (name, kind) => (kind === 'const' ? `const ${name} = ` : `function ${name}(`)

const blob = [
  cut('HEARTBEAT_HUMAN_KINDS_DEFAULT', 'const'),
  cut('turnLedger'),
  cut('dayKeyFactory'),
  cut('heartbeatCounters'),
  cut('heartbeatGuard'),
  'export { HEARTBEAT_HUMAN_KINDS_DEFAULT, turnLedger, heartbeatCounters, heartbeatGuard }',
].join('\n')
const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(blob))
const { HEARTBEAT_HUMAN_KINDS_DEFAULT: DEF, turnLedger, heartbeatCounters, heartbeatGuard } = mod

let ok = 0, bad = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { ok++; console.log(`  ok   ${name}`) }
  else { bad++; console.log(`  FAIL ${name}\n       expected ${w}\n       got      ${g}`) }
}
const D = (h, m, s = 0) => Date.UTC(2026, 7, 22, h, m, s)   // 2026-08-22 UTC
const ev = (type, data, time) => ({ type, data, time })
const dispatch = (time) => ev('schedule/change', { operation: 'dispatch' }, time)
const start = (turn, time) => ev('turn/start', { turn }, time)
const end = (turn, time) => ev('turn/end', { turn }, time)
const msg = (kind, time) => ev('user/message', { source: { kind } }, time)
const ZONE = 'Europe/Moscow'

console.log('\n=== A. Default kinds: user only ===')
{
  const kinds = new Set(DEF)
  // turn 1 — a human (user), turn 2 — a self-wake, turn 3 — a service kind
  const events = [
    start(1, D(9, 0)), msg('user', D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 30)), start(2, D(9, 30)), end(2, D(9, 31)),
    start(3, D(10, 0)), msg('service', D(10, 0)), end(3, D(10, 1)),
  ]
  t('the default list', DEF, ['user'])
  const l = turnLedger(events, kinds)
  t('turn 1 is human', [l[0].autonomous, l[0].human], [false, true])
  t('turn 2 is autonomous', [l[1].autonomous, l[1].human], [true, false])
  t('turn 3: a service kind is NOT a human under the default', [l[2].autonomous, l[2].human], [false, false])
}

console.log('\n=== B. Extended list: a service kind breaks the streak ===')
{
  const kinds = new Set(['user', 'service'])
  const events = []
  for (let i = 1; i <= 5; i++) { events.push(dispatch(D(9, i)), start(i, D(9, i)), end(i, D(9, i, 30))) }
  events.push(start(6, D(10, 0)), msg('service', D(10, 0)), end(6, D(10, 1)))
  const narrow = heartbeatCounters(events, ZONE, D(10, 5), new Set(['user']))
  const wide = heartbeatCounters(events, ZONE, D(10, 5), kinds)
  t('narrow list: turn 6 does not break the streak (not autonomous — but not a human either)', narrow.streak, 0)
  t('wide list: the streak is 0 as well, turn 6 is human', wide.streak, 0)
  // the decisive check: the streak is LIVE, the last turn is autonomous
  const ev2 = events.slice(0, 15)   // without turn 6
  t('five autonomous in a row', heartbeatCounters(ev2, ZONE, D(10, 5), kinds).streak, 5)
  t('five dispatches counted for the day', heartbeatCounters(ev2, ZONE, D(10, 5), kinds).perDay, 5)
}

console.log('\n=== C. The streak is broken by a word from a live human in the middle ===')
{
  const kinds = new Set(['user', 'service'])
  const e = [
    dispatch(D(9, 0)), start(1, D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 30)), start(2, D(9, 30)), msg('service', D(9, 30)), end(2, D(9, 31)),
    dispatch(D(10, 0)), start(3, D(10, 0)), end(3, D(10, 1)),
  ]
  t('the streak after a word from a human is 1, not 3', heartbeatCounters(e, ZONE, D(10, 5), kinds).streak, 1)
  t('three wake-ups for the day all the same', heartbeatCounters(e, ZONE, D(10, 5), kinds).perDay, 3)
  t('the same log with the narrow list: streak 3 — the kind was not recognised', heartbeatCounters(e, ZONE, D(10, 5), new Set(['user'])).streak, 3)
}

console.log('\n=== D. The interval guard ===')
{
  const limits = { heartbeatMinIntervalSeconds: 1800 }
  // 🔴 The expected prefix is a named constant, and the comparison is cut to ITS
  // length. The first version cut to a hard-coded 47 characters — that number
  // was the length of the message at the time, so any edit to the wording would
  // have made an intact guard look broken.
  const PREFIX = 'a recurring reminder may run no more often than once every 1800 s'
  const refuse = (a) => { try { heartbeatGuard(a, limits); return null } catch (e) { return e.message.slice(0, PREFIX.length) } }
  t('a one-shot after_seconds is left alone', refuse({ after_seconds: 60 }), null)
  t('a one-shot at is left alone', refuse({ at: '2026-08-23T10:00:00Z' }), null)
  t('exactly the limit passes', refuse({ every_seconds: 1800 }), null)
  t('more than the limit passes', refuse({ every_seconds: 3600 }), null)
  t('less than the limit — refused', refuse({ every_seconds: 300 }), PREFIX)
  t('not a number — refused', refuse({ every_seconds: '1800' }), PREFIX)
}

console.log(`\nTOTAL: passed ${ok}, failed ${bad}`)
process.exit(bad ? 1 : 0)
