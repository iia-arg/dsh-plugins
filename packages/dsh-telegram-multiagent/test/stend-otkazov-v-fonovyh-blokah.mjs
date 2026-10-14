// RU: Изолированный стенд stend-otkazov-v-fonovyh-blokah.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-otkazov-v-fonovyh-blokah.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'

const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}
const slepota = (s) => { console.log(`СЛЕПОТА: ${s}`); process.exit(2) }
const AsyncFunction = (async () => {}).constructor


function vyrezat(start, konec, sobrat) {
  let i = start
  for (;;) {
    const j = text.indexOf(konec, i)
    if (j < 0) return null
    const kusok = text.slice(start, j + konec.length)
    try { return { kusok, fn: sobrat(kusok) } } catch { i = j + 1 }
  }
}
const odin = (metka) => {
  const n = text.split(metka).length - 1
  if (n !== 1) slepota(`«${metka}» в предмете ${n} раз, ожидался 1`)
  return text.indexOf(metka)
}


const aStart = odin('function nudgeUntilClaimed(')
const A = vyrezat(aStart, '\n  }', (k) => new Function('log', `${k}\nreturn nudgeUntilClaimed;`))
if (!A) slepota('nudgeUntilClaimed не вырезается')
if (!A.kusok.includes('void (async () => {')) slepota('в nudgeUntilClaimed нет фонового блока — судить нечего')


const bYakor = odin("const komandy = await waitService('commands'")
const bStart = text.lastIndexOf('void (async () => {', bYakor)
if (bStart < 0 || bYakor - bStart > 400) slepota('начало блока регистрации /compact-status не найдено рядом с якорем')
const B = vyrezat(bStart, '})();', (k) => new AsyncFunction('waitService', 'log', 'prichina', k))
if (!B || !B.kusok.includes('komandy.register(')) slepota('блок регистрации не вырезан или не зовёт register')
console.log(`  блок А: ${A.kusok.split('\n').length} строк · блок Б: ${B.kusok.split('\n').length} строк`)

let neobrabotano = 0
process.on('unhandledRejection', () => { neobrabotano++ })
const pauza = (ms) => new Promise((r) => setTimeout(r, ms))

let ok = 0, bed = 0
const t = (imya, uslovie, podrobno) => {
  if (uslovie) { ok++; console.log(`  ok   ${imya}`) } else { bed++; console.log(`  FAIL ${imya} — ${podrobno}`) }
}


{
  const zhurnal = []
  const nudge = A.fn((s) => zhurnal.push(String(s)))
  let ubrano = 0
  const agent = { inbox: { hasPending: true }, status: 'idle', wakeDriver: () => {} }
  const do_ = neobrabotano
  nudge(agent, '[проба]', 1500, () => null, () => { ubrano++ },
    async () => { throw new Error('Receipt barrier: persistence did not confirm flush') })
  await pauza(900)
  const nov = neobrabotano - do_
  t('А: отказ побудки не становится unhandled rejection', nov === 0, `unhandled ${nov} — на бою служба упадёт`)
  t('А: отказ назван строкой журнала с причиной', zhurnal.some((s) => s.includes('[проба]') && s.includes('Receipt barrier')),
    `строки: ${JSON.stringify(zhurnal)}`)
  t('А: письмо убрано на выходе (finally цел)', ubrano === 1, `уборок ${ubrano}`)
}

{
  const zhurnal = []
  const nudge = A.fn((s) => zhurnal.push(String(s)))
  const agent = { inbox: { hasPending: false }, status: 'idle', wakeDriver: () => {} }
  const do_ = neobrabotano
  nudge(agent, '[проба2]', 1500, () => null, () => {}, async () => true)
  await pauza(900)
  t('А: обычное снятие — «забрано», без отказов', neobrabotano === do_ && zhurnal.some((s) => s.includes('забрано')),
    `unhandled ${neobrabotano - do_}, строки ${JSON.stringify(zhurnal)}`)
}

{
  const zhurnal = []
  const do_ = neobrabotano
  const komandy = { register: () => { throw new Error('command "compact-status" already registered') } }
  await B.fn(async (imya) => (imya === 'commands' ? komandy : {}), (s) => zhurnal.push(String(s)), (e) => e?.message ?? String(e))
  await pauza(50)
  const nov = neobrabotano - do_
  t('Б: отказ регистрации /compact-status не становится unhandled rejection', nov === 0, `unhandled ${nov} — на бою служба упадёт`)
  t('Б: отказ назван строкой журнала с причиной', zhurnal.some((s) => s.includes('compact-status') && s.includes('already registered')),
    `строки: ${JSON.stringify(zhurnal)}`)
}

{
  const zhurnal = []
  const do_ = neobrabotano
  await B.fn(async () => { throw new Error('context disposed') }, (s) => zhurnal.push(String(s)), (e) => e?.message ?? String(e))
  await pauza(50)
  t('Б: отказ waitService не становится unhandled rejection', neobrabotano === do_, `unhandled ${neobrabotano - do_}`)
}

{
  const zhurnal = []
  const do_ = neobrabotano
  let zaregistrirovano = 0
  await B.fn(async (imya) => (imya === 'commands' ? { register: () => { zaregistrirovano++ } } : {}),
    (s) => zhurnal.push(String(s)), (e) => e?.message ?? String(e))
  await pauza(50)
  t('Б: обычная регистрация — одна, строка «зарегистрирована», без отказов',
    zaregistrirovano === 1 && neobrabotano === do_ && zhurnal.some((s) => s.includes('зарегистрирована')),
    `регистраций ${zaregistrirovano}, unhandled ${neobrabotano - do_}, строки ${JSON.stringify(zhurnal)}`)
}

console.log(`итог: сошлось ${ok}, расхождений ${bed}`)
process.exit(bed ? 1 : 0)
