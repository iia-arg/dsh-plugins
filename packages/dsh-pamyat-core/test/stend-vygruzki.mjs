// RU: Проверяем выгрузку настоящего Context @deepseek-ai/cordis через koren.plugin и fiber.dispose. ctx.on(dispose) не работает в cordis 4.0.1: _unload вызывает _disposables, поэтому нужен реальный путь уборки. Локальная lib 4.0.2 побайтно совпадает с 4.0.1 платформы. Закрытие базы проверяем дескрипторами /proc/self/fd; без /proc — слепота с кодом 2. Порядок apply/dispose живого загрузчика здесь задан вручную и не проверяется.
// EN: Test unloading a real @deepseek-ai/cordis Context through koren.plugin and fiber.dispose. ctx.on(dispose) does not work in cordis 4.0.1: _unload calls _disposables, so use the actual cleanup path. Local lib 4.0.2 is byte-identical to platform 4.0.1. Verify database closure via /proc/self/fd descriptors; missing /proc means an unobservable test with code 2. The live loader’s apply/dispose order is set manually here and is not tested.
import { mkdtempSync, rmSync, readdirSync, readlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply, name, Config } from '../src/index.js'

const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync(...a); VREMENNYE.push(k); return k }
const ubrat = () => { for (const k of VREMENNYE.splice(0)) { try { rmSync(k, { recursive: true, force: true }) } catch {} } }
process.on('exit', ubrat)
// RU: SIGTERM и SIGINT ведём в штатный выход, чтобы вызвать exit-хук уборки при timeout 120. SIGKILL этот путь не выполняет.
// EN: Route SIGTERM and SIGINT through normal exit so the cleanup exit hook runs under timeout 120. SIGKILL cannot run this path.
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

if (!existsSync('/proc/self/fd')) { console.log('СЛЕПОТА: нет /proc/self/fd — закрытие базы мерить нечем'); process.exit(2) }

let vsego = 0, bed = 0
const proba = async (imya, f) => {
  vsego++
  // RU: Тело пробы должно вернуть undefined; любое значение означает отказ обёртки.
  // EN: The probe body must return undefined; any value fails the wrapper.
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение'); console.log(`  ✅ ${imya}`) }
  catch (e) { bed++; console.log(`  🔴 ${imya}\n     ${e.message}`) }
}
const tik = (ms = 40) => new Promise((r) => setTimeout(r, ms))
const deskriptory = (put) => readdirSync('/proc/self/fd').filter((f) => { try { return readlinkSync('/proc/self/fd/' + f) === put } catch { return false } }).length

// RU: Перехватываем console.error для подсчёта итогов привратника.
// EN: Capture console.error to count gatekeeper summaries.
const stroki = []
const rodnoj = console.error
const lovit = () => { console.error = (...s) => stroki.push(s.join(' ')) }
const otpustit = () => { console.error = rodnoj }
const ITOG = /привратник: (выключен ключом|спросов|включён, но)/
const itogov = () => stroki.filter((s) => ITOG.test(s)).length

const koren = () => { const k = new Context(); k.provide('logger'); k.logger = { error: () => {}, info: () => {} }; return k }
const baza = () => join(vremennyj(join(tmpdir(), 'stend-vygruzki-core-')), 'p.db')
const nabor = (put) => new Config({ putBazy: put, otvechayushchegoNet: true, agent: 'proba' })

// RU: Проверяем посылки о платформе.
// EN: Check platform assumptions.
await proba('П1 посылка: cordis НЕ шлёт \'dispose\' при выгрузке волокна (уборка на ctx.on(\'dispose\') мертва)', async () => {
  const k = new Context(); let zvali = 0
  const f = k.plugin({ name: 'proba-dispose', apply: (ctx) => { ctx.on('dispose', () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 0) throw new Error(`'dispose' позвано ${zvali} раз — платформа его шлёт, выбор ctx.effect пересмотреть`)
})
await proba('П2 посылка: очистку ctx.effect выгрузка ЗОВЁТ', async () => {
  const k = new Context(); let zvali = 0
  const f = k.plugin({ name: 'proba-effect', apply: (ctx) => { ctx.effect(() => () => { zvali++ }) } }); await tik()
  await f.dispose(); await tik()
  if (zvali !== 1) throw new Error(`очистка effect позвана ${zvali} раз, ждали 1 — стенд негоден для предмета`)
})

// RU: Проверяем предмет.
// EN: Test the subject.
await proba('П3 монтаж → выгрузка: база ЗАКРЫТА (дескрипторов файла базы 1 → 0)', async () => {
  const put = baza(); const k = koren()
  lovit(); let do_, posle
  try { const f = k.plugin({ name, apply }, nabor(put)); await tik(); do_ = deskriptory(put); await f.dispose(); await tik(); posle = deskriptory(put) }
  finally { otpustit() }
  if (do_ !== 1) throw new Error(`после монтажа дескрипторов ${do_}, ждали 1 — стенд негоден (база не открылась?)`)
  if (posle !== 0) throw new Error(`после выгрузки дескрипторов ${posle}, ждали 0 — база выгруженного волокна не закрыта`)
})
await proba('П4 монтаж → выгрузка: итог привратника напечатан ровно один раз, на выгрузке', async () => {
  const put = baza(); const k = koren()
  stroki.length = 0; lovit(); let do_, posle
  try { const f = k.plugin({ name, apply }, nabor(put)); await tik(); do_ = itogov(); await f.dispose(); await tik(); posle = itogov() }
  finally { otpustit() }
  if (posle - do_ !== 1) throw new Error(`строк итога до выгрузки ${do_}, после ${posle} — на выгрузке итог не напечатан`)
})
await proba('П5 три монтажа в ОДНОМ Context: 2-й и 3-й падают на provide(\'pamyat\') — их базы закрыты СРАЗУ; соединений 1, после выгрузки 0', async () => {
  // RU: Повторный apply в том же Context может упасть на повторном provide(pamyat) после открытия базы. Уборка должна закрыть базу упавшего волокна, а не ждать GC.
  // EN: A repeated apply in the same Context can fail on duplicate provide(pamyat) after opening the database. Cleanup must close the failed fiber’s database rather than wait for GC.
  const put = baza(); const k = koren()
  lovit(); const ryad = []; let f
  try {
    f = [k.plugin({ name, apply }, nabor(put)), k.plugin({ name, apply }, nabor(put)), k.plugin({ name, apply }, nabor(put))]; await tik()
    ryad.push(deskriptory(put))
    for (const x of f) { await x.dispose(); await tik(); ryad.push(deskriptory(put)) }
  } finally { otpustit() }
  const upali = f.filter((x) => /has been registered/.test(String(x._error?.message ?? ''))).length
  if (upali !== 2) throw new Error(`упавших на provide('pamyat') ${upali}, ждали 2 — стенд мерит не тот порядок (платформа изменилась?)`)
  if (ryad.join(',') !== '1,0,0,0') throw new Error(`дескрипторы по шагам ${ryad.join(' → ')}, ждали 1 → 0 → 0 → 0 — база упавшего или выгруженного волокна не закрыта`)
})

const ZHDYOM = 5
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
