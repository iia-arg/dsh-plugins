// RU: Проверка stend-p13-novyj-raspisatel: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-p13-novyj-raspisatel verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')
if (!existsSync(SRC)) { console.log(`предмет: ${SRC} — ФАЙЛА НЕТ`); process.exit(2) }
const TEKST = readFileSync(SRC, 'utf8')
console.log(`предмет: ${SRC} (sha256-16 ${createHash('sha256').update(TEKST).digest('hex').slice(0, 16)})`)

function vyrezat(imya) {
  const m = new RegExp(`(^|\\n)((?:async )?function ${imya}\\()`).exec(TEKST)
  if (!m) return null
  const start = m.index + m[1].length
  let i = TEKST.indexOf('{', TEKST.indexOf(')', start))
  let glub = 0
  for (; i < TEKST.length; i += 1) {
    if (TEKST[i] === '{') glub += 1
    else if (TEKST[i] === '}') { glub -= 1; if (glub === 0) return TEKST.slice(start, i + 1) }
  }
  return null
}

const NUZHNY = ['sobytiyaSessii', 'dostavkaNovoj', 'turnLedger', 'dayKeyFactory', 'heartbeatCounters',
  'udarovVOkne', 'svidetelDostavok', 'trevogaSchyotNeViden', 'openTurn']
const kuski = {}
const net = []
for (const n of NUZHNY) { const k = vyrezat(n); if (k === null) net.push(n); else kuski[n] = k }
if (net.length) { console.log(`СЛЕПОТА: в предмете нет функций: ${net.join(', ')}`); process.exit(2) }

const zhurnalLog = []
const f = new Function('log', 'existsSync', 'execFile', 'TREVOGA_POVTOR_MS', `
  const schyotNeVidenSkazano = new Map()
  ${Object.values(kuski).join('\n')}
  return { sobytiyaSessii, dostavkaNovoj, turnLedger, heartbeatCounters, udarovVOkne, svidetelDostavok, trevogaSchyotNeViden, openTurn }
`)
const { execFileSync } = await import('node:child_process')
// Аудит №7 (1.3.44): мост зовёт execFile с callback; синхронная подмена — стенд судит логику, а не асинхронность.
const execFile = (put, argv, opt, cb) => { try { execFileSync(put, argv, opt); cb?.(null) } catch (e) { cb?.(e) } }
const M = f((s) => zhurnalLog.push(s), existsSync, execFile, 86400000)

let oshibok = 0
const proba = (imya, poluchili, zhdali) => {
  const ok = JSON.stringify(poluchili) === JSON.stringify(zhdali)
  if (!ok) oshibok += 1
  console.log(`${ok ? 'ок ' : 'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(poluchili)}, ждали ${JSON.stringify(zhdali)}`)
}

const ZONE = 'Europe/Moscow'
const NOW = Date.parse('2026-09-29T12:00:00Z')
const t = (min) => NOW - min * 60000
const HUMAN = new Set(['user', 'a2a'])
const ev = (type, min, data = {}) => ({ type, time: t(min), data })

const staraya = [
  ev('schedule/change', 50, { version: 1, operation: 'dispatch', id: 'a' }), ev('turn/start', 50, { turn: 1 }),
  ev('user/message', 50, { source: { kind: 'plugin', plugin: 'schedule' } }), ev('turn/end', 49),
  ev('schedule/change', 20, { version: 1, operation: 'dispatch', id: 'b' }), ev('turn/start', 20, { turn: 2 }),
  ev('user/message', 20, { source: { kind: 'plugin', plugin: 'schedule' } }), ev('turn/end', 19),
]
const c1 = M.heartbeatCounters(M.sobytiyaSessii({ session: { events: staraya } }), ZONE, NOW, HUMAN)
proba('Р1 0.1.1: подряд/за сутки', [c1.streak, c1.perDay], [2, 2])
proba('Р1 0.1.1: в окне часа', M.udarovVOkne(staraya, 3600000, NOW).chislo, 2)

const novayaVnutri = [ev('turn/start', 30, { turn: 1 }), ev('user/message', 30, { source: { kind: 'schedule' } }), ev('turn/end', 29)]
const sess020 = (evs) => ({ id: 'S1', snapshotEvents: () => Object.freeze([...evs]) })
const e2 = M.sobytiyaSessii({ session: sess020(novayaVnutri) })
proba('Р2 0.2.0: журнал читается через snapshotEvents()', Array.isArray(e2), true)
const c2 = M.heartbeatCounters(e2 ?? [], ZONE, NOW, HUMAN)
proba('Р2 0.2.0 (внутри хода): подряд/за сутки — «1/6»', [c2.streak, c2.perDay], [1, 1])
proba('Р2 0.2.0: в окне часа', M.udarovVOkne(e2 ?? [], 3600000, NOW).chislo, 1)

const novayaDo = [ev('user/message', 30, { source: { kind: 'schedule' } }), ev('turn/start', 30, { turn: 1 }), ev('turn/end', 29)]
const c3 = M.heartbeatCounters(novayaDo, ZONE, NOW, HUMAN)
proba('Р3 0.2.0 (до хода): подряд/за сутки', [c3.streak, c3.perDay], [1, 1])

const sChelovekom = [
  ev('turn/start', 50, { turn: 1 }), ev('user/message', 50, { source: { kind: 'schedule' } }), ev('turn/end', 49),
  ev('turn/start', 40, { turn: 2 }), ev('user/message', 40, { source: { kind: 'user' } }), ev('turn/end', 39),
  ev('turn/start', 20, { turn: 3 }), ev('user/message', 20, { source: { kind: 'schedule' } }), ev('turn/end', 19),
]
const c4 = M.heartbeatCounters(sChelovekom, ZONE, NOW, HUMAN)
proba('Р4 человек посередине: подряд/за сутки', [c4.streak, c4.perDay], [1, 2])

const den = new Date(t(30)).toISOString()
const sluzhba = (zadachi, istoriya, brosit = false) => ({
  get: (n) => n !== 'schedule' ? undefined : {
    catalog: async () => { if (brosit) throw new Error('table locked'); return zadachi },
    history: async ({ id }) => ({ records: istoriya[id] ?? [] }),
  },
})
const agent = { id: 'agent-root', session: sess020(novayaVnutri) }
proba('Р5а на 0.1.1 службы нет — свидетеля нет', await M.svidetelDostavok({ get: () => undefined }, agent, ZONE, NOW, 0), null)
const s5b = await M.svidetelDostavok(sluzhba([{ id: 'r1', sessionId: 'S1' }], { r1: [{ deliveredAt: den, messageId: 'm1' }] }), agent, ZONE, NOW, c2.perDay)
proba('Р5б журнал видит доставку — не слеп', [s5b.zaSutki, s5b.slep], [1, false])
const s5v = await M.svidetelDostavok(sluzhba([{ id: 'r1', sessionId: 'S1' }, { id: 'r2', sessionId: 'S1' }],
  { r1: [{ deliveredAt: den, messageId: 'm1' }], r2: [{ deliveredAt: den, messageId: 'm1' }] }), agent, ZONE, NOW, 1)
proba('Р5в пачка (2 задачи, 1 сообщение) — единица сообщение, не слеп', [s5v.zaSutki, s5v.slep], [1, false])
const s5g = await M.svidetelDostavok(sluzhba([{ id: 'r1', sessionId: 'S1' }, { id: 'x', sessionId: 'CHUZHAYA' }],
  { r1: [{ deliveredAt: den, messageId: 'm1' }], x: [{ deliveredAt: den, messageId: 'm9' }] }), agent, ZONE, NOW, 1)
proba('Р5г чужая сессия не считается', [s5g.zaSutki, s5g.slep], [1, false])

const slepoj = [ev('turn/start', 30, { turn: 1 }), ev('user/message', 30, { source: { kind: 'automation' } }), ev('turn/end', 29)]
const cS = M.heartbeatCounters(slepoj, ZONE, NOW, HUMAN)
const s5d = await M.svidetelDostavok(sluzhba([{ id: 'r1', sessionId: 'S1' }], { r1: [{ deliveredAt: den, messageId: 'm1' }] }), agent, ZONE, NOW, cS.perDay)
proba('Р5д неизвестный вид доставки: журнал 0, история 1 — СЛЕП', [cS.perDay, s5d.slep], [0, true])
const s5e = await M.svidetelDostavok(sluzhba([], {}, true), agent, ZONE, NOW, 0)
proba('Р5е свидетель не прочитан — слепота, не ноль', s5e.slep, true)

const tmp = mkdtempSync(path.join(os.tmpdir(), 'p13-trevoga-'))
const otpr = path.join(tmp, 'alert.sh'); const kuda = path.join(tmp, 'poslano.txt')

writeFileSync(otpr, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(kuda)}, process.argv[2] ?? '')\n`); chmodSync(otpr, 0o755)
process.env.DSH_ALERT_CMD = otpr
M.trevogaSchyotNeViden('agent-root', s5d.prichina)
const poslano = existsSync(kuda) ? readFileSync(kuda, 'utf8') : ''
proba('Р6 тревога отправлена и называет «счёт пробуждений НЕ ВИДЕН»', poslano.includes('счёт пробуждений НЕ ВИДЕН'), true)
rmSync(tmp, { recursive: true, force: true })

const obrazcy = ['const events = sobytiyaSessii(agent)', 'await svidetelDostavok(ctx, agent',
  'if (svid?.slep && resh.stop) {', 'trevogaSchyotNeViden(sid, svid.prichina, limits.alertCommand)']   // B-N-1857: остановка только по resh.stop
const netObrazcov = obrazcy.filter((o) => !TEKST.includes(o))
if (netObrazcov.length) { console.log(`СЛЕПОТА Р7: в тексте checkHeartbeat нет: ${netObrazcov.join(' | ')}`); process.exit(2) }
proba('Р7 громкая ветка checkHeartbeat в тексте предмета', netObrazcov.length, 0)

const otkrytyj = [ev('turn/start', 5, { turn: 7 }), ev('user/message', 5, { source: { kind: 'user' } })]
const r8 = (s) => { try { return M.openTurn({ session: s }).length } catch (e) { return `отказ: ${String(e.message).slice(0, 40)}` } }
proba('Р8а 0.1.1 (events): события открытого хода', r8({ events: otkrytyj }), 1)
proba('Р8б 0.2.0 (snapshotEvents): события открытого хода', r8(sess020(otkrytyj)), 1)
proba('Р8в журнала нет — громкий отказ, не TypeError', r8({}).startsWith('отказ: инструменты целей: журнал сессии'), true)

console.log(oshibok === 0 ? 'ИТОГ: сошлось' : `ИТОГ: расхождений ${oshibok}`)
process.exit(oshibok === 0 ? 0 : 1)
