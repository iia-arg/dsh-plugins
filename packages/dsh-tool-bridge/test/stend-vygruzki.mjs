// RU: Проверка stend-vygruzki: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-vygruzki verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createServer } from 'node:net'
// Аудит №3 (1.3.44): без зависимостей пакета — СЛЕПОТА 2 с причиной, а не падение кодом 1.
let Context, most
try { ({ Context } = await import('@deepseek-ai/cordis')); most = await import('../src/index.js') }
catch (e) { console.log('СЛЕПОТА: зависимости пакета не поставлены (npm install): ' + String(e?.message ?? e).slice(0, 160)); process.exit(2) }

let vsego = 0, bed = 0
const proba = async (imya, f) => {
  vsego++

  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение'); console.log(`  ✅ ${imya}`) }
  catch (e) { bed++; console.log(`  🔴 ${imya}\n     ${e.message}`) }
}
const tik = (ms = 150) => new Promise((r) => setTimeout(r, ms))

const stroki = []
const lovit = async (f) => { const a = console.log, b = console.error; console.log = (...s) => stroki.push(s.join(' ')); console.error = (...s) => stroki.push(s.join(' ')); try { return await f() } finally { console.log = a; console.error = b } }
const skolko = (re) => stroki.filter((s) => re.test(s)).length
const porty = () => stroki.map((s) => s.match(/точка входа 127\.0\.0\.1:(\d+)/)?.[1]).filter(Boolean).map(Number)
const svoboden = (p) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))) })
// B-N-1829 (Заря, 08.10): с 1.3.32 (B-N-1695) мост объявляет inject 'tools' (реестр инструментов, ctx.get('tools')); без него
// cordis молча НЕ зовёт apply — П2–П5 мерили «монтажа не было». Пустой реестр: предмет стенда — монтаж/выгрузка, не инструменты.
const koren = () => {
  const k = new Context(); k.provide('logger'); k.logger = { error: () => {}, info: () => {}, warn: () => {} }
  for (const [n, v] of Object.entries({ agents: { roots: () => [], get: () => undefined, currentInitiator: () => undefined }, goals: {}, typertGateway: {}, jobs: {}, tools: { get: () => undefined, wireSchemas: () => ({ schemas: [] }) } })) { k.provide(n); k[n] = v }
  return k
}
const PROPUSK = /повторное монтирование при живой точке входа/

await proba('П1 посылка: cordis НЕ шлёт \'dispose\' при выгрузке волокна', async () => {
  const k = new Context(); let zvali = 0
  const f = k.plugin({ name: 'proba-dispose', apply: (ctx) => { ctx.on('dispose', () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 0) throw new Error(`'dispose' позвано ${zvali} раз — платформа его шлёт`)
})
await proba('П2 монтаж → порт занят, mcpBridge есть; выгрузка → порт СВОБОДЕН, mcpBridge нет', async () => {
  const k = koren(); stroki.length = 0
  const r = await lovit(async () => {
    const f = k.plugin(most, {}); await tik(); const p = porty()[0]; const zanyat = p ? !(await svoboden(p)) : null; const est = !!k.mcpBridge
    await f.dispose(); await tik(); return { p, zanyat, est, svob: p ? await svoboden(p) : null, estPosle: !!k.mcpBridge }
  })
  if (!r.p || !r.zanyat || !r.est) throw new Error(`стенд негоден: порт ${r.p}, занят ${r.zanyat}, mcpBridge ${r.est}`)
  if (!r.svob) throw new Error(`после выгрузки порт ${r.p} ЗАНЯТ — сервер мёртвого волокна слушает дальше`)
  if (r.estPosle) throw new Error('после выгрузки mcpBridge жив')
})
await proba('П3 монтаж → выгрузка → монтаж: второй ВСТАЁТ (не «пропускаю»), mcpBridge есть', async () => {
  const k = koren(); stroki.length = 0

  const est = await lovit(async () => {
    const f = k.plugin(most, {}); await tik(); await f.dispose(); await tik()
    const f2 = k.plugin(most, {}); await tik(); const e = !!k.mcpBridge; await f2.dispose(); await tik(); return e
  })
  const tochek = skolko(/точка входа 127/), propusk = skolko(PROPUSK)
  if (propusk !== 0 || tochek !== 2 || !est) throw new Error(`«пропускаю» ${propusk} (ждали 0), точек входа ${tochek} (ждали 2), mcpBridge ${est} — флаг не снят при выгрузке`)
})
await proba('П4 apply упал ПОСЛЕ захвата флага (mcpBridge занят) → сироты нет, после ухода заслона мост встаёт', async () => {
  const k = koren(); stroki.length = 0
  const r = await lovit(async () => {
    const zaslon = k.plugin({ name: 'zaslon', apply: (ctx) => { ctx.provide('mcpBridge', { chuzhoj: true }) } }); await tik()
    const f1 = k.plugin(most, {}); await tik(); const upal = /has been registered/.test(String(f1._error?.message ?? ''))
    const pSirota = porty()[0]; const sirotaSlushaet = pSirota ? !(await svoboden(pSirota)) : false
    await f1.dispose(); await zaslon.dispose(); await tik()
    const f2 = k.plugin(most, {}); await tik(300)
    const mostEst = !!k.mcpBridge && k.mcpBridge.chuzhoj === undefined
    await f2.dispose(); await tik()
    return { upal, sirotaSlushaet, pSirota, mostEst }
  })
  if (!r.upal) throw new Error('первый монтаж не упал на provide — стенд мерит не тот порядок (флаг поднят предыдущей пробой?)')
  if (r.sirotaSlushaet) throw new Error(`упавшее волокно оставило слушающий сервер на ${r.pSirota} — сирота`)
  if (skolko(PROPUSK) !== 0 || !r.mostEst) throw new Error(`после ухода заслона: «пропускаю» ${skolko(PROPUSK)}, служба моста ${r.mostEst ? 'есть' : 'нет'} — флаг упавшего волокна не снят`)
})
await proba('П5 три монтажа в ОДНОМ Context: одна точка входа, двое «пропускаю»; выгрузка всех → порт свободен', async () => {
  const k = koren(); stroki.length = 0
  const r = await lovit(async () => {
    const f = [k.plugin(most, {}), k.plugin(most, {}), k.plugin(most, {})]; await tik()
    const p = porty()[0]; for (const x of f) await x.dispose(); await tik()
    return { p, svob: p ? await svoboden(p) : null }
  })
  const tochek = skolko(/точка входа 127/), propusk = skolko(PROPUSK)
  if (tochek !== 1 || propusk !== 2) throw new Error(`точек входа ${tochek} (ждали 1), «пропускаю» ${propusk} (ждали 2)`)
  if (!r.svob) throw new Error(`после выгрузки всех порт ${r.p} занят`)
})

const ZHDYOM = 5
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
