// RU: Стенд B-N-1857 (Аврора, 08.10.2026): несходимость «свидетель (история доставок) > журнал сессии» — отставание не останавливает
// RU: агента в пределах RASHOZHDENIE_TERPENIE_MS, держащаяся дольше — останавливает (слепота журнала). Случай Зари 08.10 14:51:32Z:
// RU: история 5, журнал 4, схождение через 96 с — прежний код снял 4 напоминания. Запуск: node stend-b1857-terpenie.mjs
// RU: (предмет — ../src/index.js или MOST_SRC). Код 2 — предмета/функции/порога нет (слепота, не успех).
// EN: Stand B-N-1857: a "witness > session journal" divergence — a lag does not stop the agent within RASHOZHDENIE_TERPENIE_MS, a lasting
// EN: one does (journal blindness). Zarya 08.10 14:51:32Z: history 5, journal 4, converged after 96 s — the old code removed 4 reminders.
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

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
const kod = vyrezat('reshenieSvidetelya')
if (kod === null) { console.log('СЛЕПОТА: в предмете нет функции reshenieSvidetelya'); process.exit(2) }
const mt = /const RASHOZHDENIE_TERPENIE_MS = (\d+) \* 60000/.exec(TEKST)
if (!mt) { console.log('СЛЕПОТА: в предмете нет константы RASHOZHDENIE_TERPENIE_MS = N * 60000'); process.exit(2) }
const TERP = Number(mt[1]) * 60000
console.log(`порог из предмета: ${TERP / 1000} с`)
const reshenie = new Function(`${kod}\nreturn reshenieSvidetelya`)()

let oshibok = 0
const proba = (imya, poluchili, zhdali) => {
  const ok = JSON.stringify(poluchili) === JSON.stringify(zhdali)
  if (!ok) oshibok += 1
  console.log(`${ok ? '✅' : '❌'} ${imya}: ${JSON.stringify(poluchili)}${ok ? '' : ` — ждали ${JSON.stringify(zhdali)}`}`)
}
const T0 = Date.parse('2026-10-08T14:51:32Z')
const slep = (z) => ({ zaSutki: z, slep: true, prichina: `по истории подсистемы доставок за сутки ${z}, журнал сессии видит 4` })
const shod = { zaSutki: 5, slep: false, prichina: 'сошлось' }

// Б1–Б3: случай Зари — отставание 96 с, затем схождение
let n = new Map()
const b1 = reshenie(n, 'S', slep(5), 4, T0, TERP)
proba('Б1 свидетель 5 > журнал 4, первый замер — не остановка, сутки по большему', [b1.stop, b1.perDayEff], [false, 5])
const b2 = reshenie(n, 'S', slep(5), 4, T0 + 96000, TERP)
proba('Б2 через 96 с (как у Зари) — всё ещё не остановка', b2.stop, false)
const b3 = reshenie(n, 'S', shod, 5, T0 + 96000 + 11000, TERP)
proba('Б3 сошлось — не остановка, отметка начала снята', [b3.stop, n.has('S')], [false, false])
// Б4: настоящая слепота — держится порог и дольше
n = new Map()
const t1 = T0 + 3600000
reshenie(n, 'S', slep(7), 4, t1, TERP)
const b4a = reshenie(n, 'S', slep(7), 4, t1 + TERP - 1000, TERP)
const b4b = reshenie(n, 'S', slep(7), 4, t1 + TERP, TERP)
proba('Б4 держится: за 1 с до порога — нет, на пороге — остановка', [b4a.stop, b4b.stop], [false, true])
// Б5: возврат — после схождения новое расхождение считается заново
reshenie(n, 'S', shod, 7, t1 + TERP + 1000, TERP)
const b5 = reshenie(n, 'S', slep(8), 7, t1 + TERP + 2000, TERP)
proba('Б5 новое расхождение после схождения — с нуля, не остановка', b5.stop, false)
// Б6: свидетель не прочитан — остановка сразу (как прежде)
const b6 = reshenie(new Map(), 'S', { zaSutki: undefined, slep: true, prichina: 'свидетель не прочитан: x' }, 4, T0, TERP)
proba('Б6 свидетель не прочитан — остановка сразу', b6.stop, true)
// Б7: суточный предел по большему — защита не теряется в окне ожидания
const b7 = reshenie(new Map(), 'S', slep(48), 47, T0, TERP)
proba('Б7 журнал 47, свидетель 48 — сутки 48 (≥ предела 48 сработает)', [b7.stop, b7.perDayEff >= 48], [false, true])
// Б8: сессии раздельны
n = new Map()
reshenie(n, 'A', slep(5), 4, T0, TERP)
const b8 = reshenie(n, 'B', slep(5), 4, T0 + TERP, TERP)
proba('Б8 отметка одной сессии не старит другую', b8.stop, false)
// Б9: checkHeartbeat зовёт решение и берёт сутки по большему
const obrazcy = ['reshenieSvidetelya(rashozhdenieS, sid, svid, c.perDay, now, RASHOZHDENIE_TERPENIE_MS)',
  'const overDay = resh.perDayEff >= limits.heartbeatMaxPerDay', 'if (svid?.slep && resh.stop) {',
  'trevogaSchyotNeViden(sid, svid.prichina, limits.alertCommand)']
const net = obrazcy.filter((o) => !TEKST.includes(o))
proba('Б9 в checkHeartbeat: решение, сутки по большему, остановка только по resh.stop', net, [])

console.log(oshibok === 0 ? 'ИТОГ: сошлось' : `ИТОГ: расхождений ${oshibok}`)
process.exit(oshibok === 0 ? 0 : 1)
