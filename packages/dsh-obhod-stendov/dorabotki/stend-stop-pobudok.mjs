// Стенд «стоп побудок»: три пробы, названные Забавой дословно.
// 🔴 Функция берётся ИЗ БОЕВОГО ФАЙЛА: проба про предмет, а не про копию.
import { readFileSync } from 'node:fs'
const B = process.env.STEND_FAJL || '/opt/agent-plugins/dsh-telegram-multiagent/src/index.js'
const src = readFileSync(B, 'utf8').split('\n')
const n1 = src.findIndex((l) => l.startsWith('  function nudgeUntilClaimed'))
const n2 = src.findIndex((l, i) => i > n1 && l === '    })();')
if (n1 < 0 || n2 < 0) { console.log('🔴 СЛЕПОТА: функция не вырезалась — стенд недействителен'); process.exit(2) }
const telo = src.slice(n1, n2 + 2).join('\n')

let zhurnal = []
const sdelat = new Function('log', `${telo}; return nudgeUntilClaimed;`)((s) => zhurnal.push(s))
const zhdat = (ms) => new Promise((r) => setTimeout(r, ms))
let bed = 0, vsego = 0

async function progon(otmetka) {
  zhurnal = []
  let budili = 0
  // B-N-949: с 1.5.24 (35cca1b, 19.09) побудка идёт только через шестой довод pobudit — «единую точку
  // допуска»; без него предмет бросает «Нет единой точки допуска побудки», и побудок 0 при любом исходе.
  sdelat({ inbox: { hasPending: true }, status: 'idle', wakeDriver() {} },
    '[проба]', 2000, otmetka, () => {}, async () => { budili++; return true })
  await zhdat(3000)
  const stopov = zhurnal.filter((s) => s.includes('СТОП ПОБУДОК')).length
  return { stopov, budili }
}
function sudit(imya, uslovie, chto) {
  vsego++
  if (uslovie) console.log(`  ✅ ${imya} (${chto})`)
  else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) }
}

console.log('── ТРИ ПРОБЫ, НАЗВАННЫЕ ЗАБАВОЙ ──')

// (1) исправное молчит
let r = await progon(null)
sudit('исправное молчит: стопа нет, побудки идут', r.stopov === 0 && r.budili > 0, `стопов ${r.stopov}, побудок ${r.budili}`)

// (2) обрыв В ОКНЕ → стоп взводится, строка ОДИН раз
r = await progon(() => ({ kogda: Date.now() - 3000, why: 'обрыв 3 с назад' }))
sudit('обрыв в окне: стоп взведён РОВНО один раз', r.stopov === 1, `стопов ${r.stopov}, побудок ${r.budili}`)
sudit('обрыв в окне: после стопа не будим', r.budili === 0, `побудок ${r.budili}`)

// (3) обрыв СТАРШЕ окна → зелёное, побудка возобновляется
r = await progon(() => ({ kogda: Date.now() - 600000, why: 'старая ошибка 10 минут назад' }))
sudit('обрыв старше окна: стоп НЕ взведён', r.stopov === 0, `стопов ${r.stopov}`)
sudit('обрыв старше окна: побудка возобновилась', r.budili > 0, `побудок ${r.budili}`)

// граница окна: ровно на краю не взводит (10 с)
r = await progon(() => ({ kogda: Date.now() - 11000, why: 'за краем окна' }))
sudit('за краем окна (11 с) стоп НЕ взведён', r.stopov === 0, `стопов ${r.stopov}`)

const ZHDYOM = 6
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
