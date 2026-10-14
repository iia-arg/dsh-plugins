// RU: Изолированный стенд stend-otkaza-soobshcheniya-obryva.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-otkaza-soobshcheniya-obryva.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'

const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

const METKA = 'Не смог выполнить ход'
const vhozhdeniya = text.split(METKA).length - 1
if (vhozhdeniya !== 1) {
  console.log(`СЛЕПОТА: «${METKA}» в предмете ${vhozhdeniya} раз, ожидался 1 — какой оператор судить, неясно`)
  process.exit(2)
}


function vyrezatOperator(src, at) {
  let i = src.lastIndexOf('\n', at) + 1
  const start = i
  let depth = 0, q = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === '\\') { i++; continue } if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (c === ';' && depth === 0) return src.slice(start, i + 1)
  }
  return null
}
const operator = vyrezatOperator(text, text.indexOf(METKA))
if (!operator || !operator.includes('tg.send(')) {
  console.log(`СЛЕПОТА: оператор с меткой не вырезан или не зовёт tg.send: ${JSON.stringify(operator)}`)
  process.exit(2)
}
console.log(`  оператор: ${operator.trim().replace(/\s+/g, ' ')}`)

const AsyncFunction = (async () => {}).constructor
let zvat
try { zvat = new AsyncFunction('tg', 'chatId', 'why', 'log', operator) }
catch (e) { console.log(`СЛЕПОТА: вырезанное не собирается: ${e?.message ?? e}`); process.exit(2) }

let neobrabotano = 0
process.on('unhandledRejection', () => { neobrabotano++ })
const pauza = () => new Promise((r) => setTimeout(r, 50))

async function progon(otkaz) {
  const zhurnal = []
  let vyzovov = 0
  const tg = { send: async () => { vyzovov++; if (otkaz) throw new Error('Telegram 429: Too Many Requests') } }
  const do_ = neobrabotano
  await zvat(tg, 4242, 'проба обрыва', (s) => zhurnal.push(String(s)))
  await pauza()
  return { vyzovov, zhurnal, neobrabotano: neobrabotano - do_ }
}

let ok = 0, bed = 0
const t = (imya, uslovie, podrobno) => {
  if (uslovie) { ok++; console.log(`  ok   ${imya}`) } else { bed++; console.log(`  FAIL ${imya} — ${podrobno}`) }
}

const plohoj = await progon(true)
t('отказ tg.send не становится unhandled rejection', plohoj.neobrabotano === 0,
  `unhandled rejection ${plohoj.neobrabotano} — на бою платформа уронит службу (fatal load failure, exit 1)`)
t('отказ назван строкой журнала с chatId и причиной', plohoj.zhurnal.some((s) => s.includes('4242') && s.includes('429')),
  `строк журнала ${plohoj.zhurnal.length}: ${JSON.stringify(plohoj.zhurnal)}`)
t('сообщение отправлялось ровно раз', plohoj.vyzovov === 1, `вызовов tg.send ${plohoj.vyzovov}`)

const horoshij = await progon(false)
t('при удачной отправке журнал молчит', horoshij.zhurnal.length === 0 && horoshij.neobrabotano === 0,
  `строк ${horoshij.zhurnal.length}, unhandled ${horoshij.neobrabotano}`)

console.log(`итог: сошлось ${ok}, расхождений ${bed}`)
process.exit(bed ? 1 : 0)
