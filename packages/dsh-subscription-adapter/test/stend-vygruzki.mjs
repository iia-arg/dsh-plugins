// RU: stend-vygruzki: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-vygruzki: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.


import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as adapter from '../src/index.js'

let vsego = 0, bed = 0
const proba = async (imya, f) => {
  vsego++

  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение'); console.log(`  ✅ ${imya}`) }
  catch (e) { bed++; console.log(`  🔴 ${imya}\n     ${e.message}`) }
}
const tik = (ms = 50) => new Promise((r) => setTimeout(r, ms))
const MARSHRUT = 'claude-oauth'

const tiho = async (f) => { const a = console.log, b = console.error; console.log = () => {}; console.error = () => {}; try { return await f() } finally { console.log = a; console.error = b } }
const koren = async () => {
  const k = new Context(); k.provide('logger'); k.logger = { error: () => {}, info: () => {}, warn: () => {} }
  k.plugin(LlmRuntime); k.provide('agents'); k.agents = { currentInitiator: () => undefined }
  await tik(); if (!k.llm) throw new Error('стенд негоден: служба llm не поднялась')
  return k
}
const est = (k) => k.llm.adapters.has(MARSHRUT)

await proba('П1 посылка: cordis НЕ шлёт \'dispose\' при выгрузке волокна', async () => {
  const k = new Context(); let zvali = 0
  const f = k.plugin({ name: 'proba-dispose', apply: (ctx) => { ctx.on('dispose', () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 0) throw new Error(`'dispose' позвано ${zvali} раз — платформа его шлёт`)
})
await proba('П2 монтаж → маршрут есть; выгрузка → маршрута НЕТ (регистрация привязана к волокну адаптера)', async () => {
  const k = await koren()
  const [do_, posle] = await tiho(async () => {
    const f = k.plugin(adapter, {}); await tik(); const a = est(k)
    await f.dispose(); await tik(); return [a, est(k)]
  })
  if (!do_) throw new Error('после монтажа маршрута нет — стенд негоден (адаптер не встал?)')
  if (posle) throw new Error(`после выгрузки маршрут «${MARSHRUT}» ЖИВ — регистрация пережила волокно`)
})
await proba('П3 три монтажа в ОДНОМ Context: 2-й и 3-й — DUPLICATE_ADAPTER, маршрут у первого; выгрузка всех — маршрута нет', async () => {
  const k = await koren()
  const { upali, posleVseh, posleNe1 } = await tiho(async () => {
    const f = [k.plugin(adapter, {}), k.plugin(adapter, {}), k.plugin(adapter, {})]; await tik()
    const upali = f.filter((x) => /already registered/.test(String(x._error?.message ?? ''))).length
    await f[1].dispose(); await f[2].dispose(); await tik(); const posleNe1 = est(k)
    await f[0].dispose(); await tik()
    return { upali, posleVseh: est(k), posleNe1 }
  })
  if (upali !== 2) throw new Error(`упавших на DUPLICATE_ADAPTER ${upali}, ждали 2 — стенд мерит не тот порядок`)
  if (!posleNe1) throw new Error('выгрузка упавших 2-го и 3-го сняла маршрут первого — чужая уборка')
  if (posleVseh) throw new Error('после выгрузки всех маршрут жив')
})

const ZHDYOM = 3
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
