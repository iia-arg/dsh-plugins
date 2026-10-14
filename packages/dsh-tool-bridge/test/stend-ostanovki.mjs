// RU: Проверка stend-ostanovki: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-ostanovki verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')

console.log(`предмет: ${SRC}`
  + (existsSync(SRC) ? ` (sha256-16 ${createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 16)})` : ' — ФАЙЛА НЕТ'))

const NOTICE = process.env.NOTICE_DIR
  || fs.mkdtempSync(path.join(os.tmpdir(), 'stend-ostanovki-'))
const NOTICE_SVOJ = process.env.NOTICE_DIR === undefined
process.on('exit', () => {
  if (NOTICE_SVOJ) { try { fs.rmSync(NOTICE, { recursive: true, force: true }) } catch {                 } }
})
const PORog = Number(process.env.POROG || 2)
const text = fs.readFileSync(SRC, 'utf8')

const vyrez = (imya) => {

  let i = text.indexOf(`async function ${imya}(`)
  if (i < 0) i = text.indexOf(`function ${imya}(`)
  if (i < 0) throw new Error(`СЛЕПОТА: в файле нет function ${imya} — стенд смотрит не туда`)

  const j = text.indexOf('\nfunction ', i + 1)
  const k = text.indexOf('\nasync function ', i + 1)
  const end = Math.min(...[j, k].filter((x) => x > 0))
  return text.slice(i, end > 0 ? end : undefined)
}
const kusok = ['dayKeyFactory', 'dostavkaNovoj', 'turnLedger', 'heartbeatCounters', 'stopHeartbeat']
  .map((n) => vyrez(n.startsWith('stop') ? n : n)).join('\n\n')

const zhurnalLog = []
const log = (m) => zhurnalLog.push(String(m))
let raspisanie = [
  { id: 'schedule-1', kind: 'every', everySeconds: 1800 },
  { id: 'schedule-2', kind: 'after' },
]
const nativeCall = async (ctx, agent, tool, args) => {
  if (tool === 'schedule_list') return raspisanie
  if (tool === 'schedule_delete') {
    const bylo = raspisanie.length
    raspisanie = raspisanie.filter((r) => r.id !== args.id)
    return { deleted: raspisanie.length < bylo }
  }
  throw new Error(`подставной nativeCall: неизвестный инструмент ${tool}`)
}

const sobrat = new Function('log', 'nativeCall', 'mkdirSync', 'writeFileSync', `
  ${text.slice(text.indexOf('const HEARTBEAT_HUMAN_KINDS_DEFAULT'), text.indexOf('\n', text.indexOf('const HEARTBEAT_HUMAN_KINDS_DEFAULT')))}
  ${kusok}
  return { heartbeatCounters, turnLedger, stopHeartbeat, HEARTBEAT_HUMAN_KINDS_DEFAULT }
`)
const M = sobrat(log, nativeCall, mkdirSync, writeFileSync)

let ok = 0, fail = 0, slep = 0
const OK = (m) => { ok += 1; console.log('  ok    ' + m) }
const FAIL = (m) => { fail += 1; console.log('  FAIL  ' + m) }
const SLEP = (m) => { slep += 1; console.log('  СЛЕПОТА ' + m) }
const t = (m, bylo, zhdem) => (String(bylo) === String(zhdem)
  ? OK(`${m}: ${bylo}`) : FAIL(`${m}: ${bylo}, ждали ${zhdem}`))

const D = (h, m, s = 0) => Date.UTC(2026, 7, 22, h, m, s)
const ev = (type, data, time) => ({ type, data, time })
const dispatch = (t) => ev('schedule/change', { operation: 'dispatch' }, t)
const start = (n, t) => ev('turn/start', { turn: n }, t)
const end = (n, t) => ev('turn/end', { turn: n }, t)
const msg = (kind, t) => ev('user/message', { source: { kind } }, t)
const KINDS = new Set(M.HEARTBEAT_HUMAN_KINDS_DEFAULT)
const ZONE = 'Europe/Moscow'
const limits = {
  heartbeatMaxConsecutive: PORog,
  heartbeatMaxPerDay: 48,
  heartbeatDayZone: ZONE,
  heartbeatNoticeDir: NOTICE ?? '',
  heartbeatHumanKinds: KINDS,
  heartbeatMinIntervalSeconds: 1800,
}

const uslovie = text.includes('const overStreak = c.streak >= limits.heartbeatMaxConsecutive')
if (!uslovie) {
  SLEP('условие overStreak в предмете изменилось — стенд проверял бы свою выдумку')
  process.exit(2)
}

const stopped = new Set()
async function hod(events, metka) {
  const c = M.heartbeatCounters(events, ZONE, D(12, 0), KINDS)
  const over = c.streak >= limits.heartbeatMaxConsecutive || c.perDay >= limits.heartbeatMaxPerDay
  let ostanovleno = false
  if (!over) { stopped.delete('proba') }
  else if (!stopped.has('proba')) {
    stopped.add('proba')
    ostanovleno = true

    const why = `подставная причина: ${c.streak} подряд при пределе ${limits.heartbeatMaxConsecutive}`
    await M.stopHeartbeat({}, { id: 'proba' }, why, c, limits, 2)
  }
  console.log(`${metka.padEnd(46)} подряд ${c.streak}/${limits.heartbeatMaxConsecutive}  `
    + `${ostanovleno ? '🔴 ОСТАНОВКА' : (over ? '(уже остановлено)' : 'работаем')}  напоминаний ${raspisanie.length}`)
  return { c, ostanovleno }
}

const e = []
const CH = []
for (let i = 1; i <= 3; i++) {
  e.push(dispatch(D(9, i)), start(i, D(9, i)), end(i, D(9, i, 30)))
  CH.push(await hod(e, `автономное пробуждение ${i}`))
}
e.push(start(4, D(10, 0)), msg('user', D(10, 0)), end(4, D(10, 1)))
CH.push(await hod(e, 'слово человека (user)'))

await new Promise((r) => setTimeout(r, 3))
for (let i = 5; i <= 6; i++) {
  e.push(dispatch(D(10, i)), start(i, D(10, i)), end(i, D(10, i, 30)))
  CH.push(await hod(e, `автономное пробуждение ${i}`))
}
e.push(start(7, D(11, 0)), msg('a2a', D(11, 0)), end(7, D(11, 1)))
CH.push(await hod(e, 'слово координатора (a2a)'))

const pisma = (d) => { try { return fs.readdirSync(d).filter((f) => f.endsWith('.txt')) } catch { return [] } }

console.log('\n=== ПРОВЕРКИ ===')
const BOEVOJ = PORog >= 6
if (!BOEVOJ) {
  t('счёт растёт: первое пробуждение', CH[0].c.streak, 1)
  t('счёт растёт: второе пробуждение', CH[1].c.streak, 2)
  t('на превышении ОСТАНОВКА', CH[1].ostanovleno, true)
  t('третье пробуждение: письмо НЕ повторяется', CH[2].ostanovleno, false)
  t('напоминания сняты все', raspisanie.length, 0)
  t('слово человека (user) сбрасывает полосу', CH[3].c.streak, 0)
  t('сторож ПЕРЕВЗВЁЛСЯ: вторая полоса тоже остановлена', CH[5].ostanovleno, true)
  t('слово координатора (a2a) сбрасывает полосу', CH[6].c.streak, 0)
    const pisem = NOTICE ? pisma(NOTICE).length : 0
  t('писем ровно по одному на полосу', pisem, 2)
  if (NOTICE && pisem) {

    const txt = fs.readFileSync(`${NOTICE}/${pisma(NOTICE).sort()[0]}`, 'utf8')
    txt.includes('снято') && txt.includes('предел')
      ? OK('письмо называет снятое и предел') : FAIL('в письме нет перечня снятого или предела')
    txt.includes('НА СЕССИЮ')
      ? OK('письмо предупреждает, что предел на сессию, а не на агента')
      : FAIL('письмо не различает сессию и агента')
  } else SLEP('каталог письма не задан — проверить содержимое нечем')
} else {
  t('контроль зрячести: при боевом пороге НЕ останавливает', CH.some((x) => x.ostanovleno), false)
  t('контроль зрячести: напоминания на месте', raspisanie.length, 2)
    const pisem = NOTICE ? pisma(NOTICE).length : 0
  t('контроль зрячести: писем нет', pisem, 0)
}

const ZHDYOM = BOEVOJ ? 3 : 11
const vsego = ok + fail + slep
console.log(`\nИТОГ: ok=${ok} fail=${fail} слепота=${slep} (всего ${vsego}, ждём ${ZHDYOM})`)
if (vsego !== ZHDYOM) { console.log('🔴 КАНАРЕЙКА: часть проверок не состоялась'); process.exit(2) }

process.exit(fail ? 1 : (slep ? 2 : 0))
