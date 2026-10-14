// RU: Стенд выгрузки на НАСТОЯЩЕМ cordis: снимается ли ключ стража одиночного монтажа при выгрузке плагина.
//     Зачем настоящий cordis, а не подставной ctx. Прежде снятие ключа висело на ctx.on('dispose'), а
//     stend-opoveshcheniya.mjs сам звал обработчики 'dispose' — «как платформа при выгрузке». Платформа этого
//     не делает: в cordis 4.0.1 события 'dispose' нет, выгрузка (_unload) зовёт только _disposables волокна.
//     Подставной ctx стерёг нашу модель платформы и покраснеть на этом дефекте не мог по построению.
//     Здесь — Context из @deepseek-ai/cordis (devDependency пакета; та же библиотека, что у платформы), монтаж
//     и выгрузка — root.plugin(...) и fiber.dispose(), как у загрузчика платформы.
//     Живой экземпляр считается по ответу на событие: на compaction/prune каждый смонтированный обработчик
//     печатает «ОБРЕЗКА без модели». Строки «подъём» считают монтажи, строки «пропущен» — отсечённые стражем.
//     Чего стенд не видит: порядок, в котором загрузчик платформы зовёт apply в работе (cordis-plugin-loader),
//     — здесь он задан руками. Зелёный стенд значит «страж верен при этих порядках», а не «в работе порядок
//     такой».
//     Запуск: node test/stend-vygruzki.mjs; код 0 — всё зелёное, 1 — красные, 2 — канарейка.
// EN: Unload stand on REAL cordis: is the single-mount guard key removed when the plugin is unloaded.
//     Why real cordis and not a fake ctx. Previously key removal hung on ctx.on('dispose'), and
//     stend-opoveshcheniya.mjs itself called the 'dispose' handlers — "like the platform on unload". The
//     platform does not do that: cordis 4.0.1 has no 'dispose' event, unloading (_unload) calls only the
//     fiber's _disposables. The fake ctx guarded our model of the platform and by construction could not turn
//     red on this defect.
//     Here — Context from @deepseek-ai/cordis (a devDependency of the package; the same library the platform
//     uses), mounting and unloading via root.plugin(...) and fiber.dispose(), like the platform loader.
//     A live instance is counted by its response to an event: on compaction/prune every mounted handler prints
//     "ОБРЕЗКА без модели" (prune without a model). "подъём" (start-up) lines count mounts, "пропущен"
//     (skipped) lines count those cut off by the guard.
//     What the stand does not see: the order in which the platform loader calls apply in production
//     (cordis-plugin-loader) — here it is set by hand. A green stand means "the guard is correct for these
//     orders", not "this is the order in production".
//     Run: node test/stend-vygruzki.mjs; exit 0 — all green, 1 — red, 2 — canary.
import { Context } from '@deepseek-ai/cordis'
import * as storozha from '../src/index.js'

let vsego = 0, bed = 0
const proba = async (imya, f) => {
  vsego++
  // RU: Тело обязано вернуть undefined: вернувшее значение — не проверка, а молча зелёная проба.
  // EN: The body must return undefined: a returned value is not a check but a silently green probe.
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение'); console.log(`  ✅ ${imya}`) }
  catch (e) { bed++; console.log(`  🔴 ${imya}\n     ${e.message}`) }
}
const tik = () => new Promise((r) => setTimeout(r, 20))

// RU: Читаем настоящий logger exporter cordis и console fallback; отсутствие stdout не означает отсутствие строки.
// EN: Read the actual cordis logger exporter and console fallback; no stdout is not a missing record.
const stroki = []
const context = () => {
  const root = new Context()
  root.logger.exporter({ export: message => stroki.push(message.args.map(String).join(' ')) })
  return root
}
const rodnoj = console.log
const lovit = () => { console.log = (...s) => stroki.push(s.join(' ')) }
const otpustit = () => { console.log = rodnoj }
const schyot = (obrazec) => stroki.filter((s) => s.includes(obrazec)).length
const nabor = (agent) => ({ stupeni: [0.85, 0.9], agent })
const sessiya = { id: 's1', requestContext: () => undefined }
const obrezka = (root) => root.emit('session/event', sessiya, { type: 'compaction/prune', data: { shadowedTokenCount: 1 }, time: 1788000000000 })

// RU: ── Посылки о платформе: если cordis изменится, эти пробы скажут пересмотреть выбор механизма снятия ключа
//     ──
// EN: ── Assumptions about the platform: if cordis changes, these probes will say to reconsider the key-removal
//     mechanism ──
await proba('П1 посылка: cordis НЕ шлёт \'dispose\' при выгрузке волокна (снятие на ctx.on(\'dispose\') мертво)', async () => {
  const root = context(); let zvali = 0
  const f = root.plugin({ name: 'proba-dispose', apply: (ctx) => { ctx.on('dispose', () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 0) throw new Error(`'dispose' позвано ${zvali} раз — платформа его шлёт, выбор ctx.effect пересмотреть`)
})
await proba('П2 посылка: очистку ctx.effect выгрузка ЗОВЁТ', async () => {
  const root = context(); let zvali = 0
  const f = root.plugin({ name: 'proba-effect', apply: (ctx) => { ctx.effect(() => () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 1) throw new Error(`очистка effect позвана ${zvali} раз, ждали 1 — стенд негоден для предмета`)
})

// RU: ── Предмет ──
// EN: ── Subject ──
await proba('П3 apply ×3 подряд С ВЫГРУЗКОЙ между (переподнятие): каждый встаёт, живой ровно один', async () => {
  const root = context(); stroki.length = 0; lovit()
  try {
    let f = root.plugin(storozha, nabor('probe-p3')); await tik()
    await f.dispose(); await tik()
    f = root.plugin(storozha, nabor('probe-p3')); await tik()
    await f.dispose(); await tik()
    f = root.plugin(storozha, nabor('probe-p3')); await tik()
    obrezka(root)
  } finally { otpustit() }
  const p = schyot('] подъём:'), z = schyot('второй монтаж пропущен'), zhivyh = schyot('ОБРЕЗКА без модели')
  if (p !== 3 || z !== 0 || zhivyh !== 1) throw new Error(`подъёмов ${p} (ждали 3), пропущено ${z} (ждали 0), живых ${zhivyh} (ждали 1) — ключ не снят при выгрузке`)
})
await proba('П4 apply ×3 БЕЗ выгрузки (как в бою 26.09: одна ссылка, три apply) → живой ровно один, двое пропущены', async () => {
  const root = context(); stroki.length = 0; lovit()
  try {
    root.plugin(storozha, nabor('probe-p4')); root.plugin(storozha, nabor('probe-p4')); root.plugin(storozha, nabor('probe-p4')); await tik()
    obrezka(root)
  } finally { otpustit() }
  const p = schyot('] подъём:'), z = schyot('второй монтаж пропущен'), zhivyh = schyot('ОБРЕЗКА без модели')
  if (p !== 1 || z !== 2 || zhivyh !== 1) throw new Error(`подъёмов ${p} (ждали 1), пропущено ${z} (ждали 2), живых ${zhivyh} (ждали 1) — страж одиночного монтажа не держит`)
})
await proba('П5 почему не «функция из apply»: apply пакета cordis зовёт через new — возвращённое не зовётся при выгрузке', async () => {
  // RU: Тот же вид объявления, что у apply пакета (function с prototype), возвращающий функцию очистки.
  // EN: The same declaration form as the package's apply (a function with a prototype), returning a cleanup
  //     function.
  const root = context(); let zvali = 0
  function apply() { return () => { zvali++ } }
  const f = root.plugin({ name: 'proba-vozvrat', apply }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 0) throw new Error(`возвращённая функция позвана ${zvali} раз — cordis её собирает, выбор ctx.effect можно пересмотреть`)
})
await proba('П6 после выгрузки последнего — ключ снят: следующий монтаж встаёт, а не «пропущен»', async () => {
  const root = context(); stroki.length = 0; lovit()
  try {
    const f = root.plugin(storozha, nabor('probe-p6')); await tik()
    await f.dispose(); await tik()
    root.plugin(storozha, nabor('probe-p6')); await tik()
  } finally { otpustit() }
  if (schyot('второй монтаж пропущен') !== 0 || schyot('] подъём:') !== 2) throw new Error(`подъёмов ${schyot('] подъём:')}, пропущено ${schyot('второй монтаж пропущен')} — после выгрузки сторож не встал`)
})

const ZHDYOM = 6
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
