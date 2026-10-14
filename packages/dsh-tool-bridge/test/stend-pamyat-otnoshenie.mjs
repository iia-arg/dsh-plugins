// RU: Проверка stend-pamyat-otnoshenie: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-pamyat-otnoshenie verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOST = resolve(process.env.MOST_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'))

const najtiYadro = () => {
  const dom = process.env.DSH_HOME || join(homedir(), '.dsh')
  let profili = []
  try { profili = readdirSync(join(dom, 'profiles')).sort() } catch { return undefined }
  for (const p of profili) {
    const d = join(dom, 'profiles', p, 'node_modules', 'dsh-pamyat-core')
    if (existsSync(join(d, 'src', 'index.js'))) return d
  }
  return undefined
}
const CORE_RAW = process.env.CORE_DIR || najtiYadro()
const CORE = CORE_RAW ? resolve(CORE_RAW) : undefined
const APP = process.env.DSH_TEST_APP
const slep = (why) => { console.log('СЛЕПОТА: ' + why); process.exit(2) }
console.log(`предмет: мост ${MOST} · ядро ${CORE} · платформа ${APP ?? '(не задана)'}`)
if (!APP) slep('не задан DSH_TEST_APP — defineTool платформы взять неоткуда')
if (!CORE) slep('не задан CORE_DIR и в профилях DSH_HOME (или ~/.dsh) нет dsh-pamyat-core — ядро взять неоткуда')

let defineTool, coreApply, opisanie, otkrytHranilishche
try {
  const req = createRequire(pathToFileURL(resolve(APP, 'package.json')))
  ;({ defineTool } = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tools')).href))
  ;({ apply: coreApply, opisanieInstrumentaOtnosheniya: opisanie } = await import(pathToFileURL(join(CORE, 'src/index.js')).href))
  ;({ otkrytHranilishche } = await import(pathToFileURL(join(CORE, 'src/hranilishche.js')).href))
} catch (e) { slep('не загрузились платформа или ядро: ' + String(e?.message ?? e).slice(0, 160)) }
if (typeof opisanie !== 'function') slep('в ядре нет opisanieInstrumentaOtnosheniya — ядро старше alpha.78')

let vsego = 0, proshlo = 0
const proba = async (imya, f) => {
  vsego++
  try {
    const v = await f()
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v))
    proshlo++; console.log('  ok   ' + imya)
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)) }
}

const katalog = mkdtempSync(join(tmpdir(), 'stend-most-pamyat-'))
const putBazy = join(katalog, 'b.db')
const servisy = {}
coreApply({ provide(i, o) { servisy[i] = o }, on() {}, logger: { error() {} } }, { putBazy, agent: 'stend' })
const sluzhba = servisy.pamyat
const h = otkrytHranilishche(putBazy)
const zap = (klass, t) => h.zapisat({ agent: 'stend', klass, soderzhim: t })
const telo = defineTool(opisanie(sluzhba, 'stend'))

const agent = { id: 'sess-1' }
const zvali = []
const uslugi = {
  agents: { get: (id) => (id === agent.id ? agent : undefined), roots: () => [agent], currentInitiator: () => agent },
  tools: { get: (name, scope) => { zvali.push([name, scope?.id]); return name === telo.name ? telo : undefined } },
  goals: {}, jobs: {}, typertGateway: {},
}
const obrabotchiki = []
const ctx = {
  get: (n) => uslugi[n],
  on: (ev, f) => { obrabotchiki.push([ev, f]); return () => {} },
  provide: (n, o) => { uslugi[n] = o },
  logger: { warn() {}, info() {}, error() {} },
}
const { apply: mostApply } = await import(pathToFileURL(join(MOST, 'src/index.js')).href)
mostApply(ctx, { limitsAgent: 'fixture-agent', port: 0 })
let opis
for (let i = 0; i < 50 && !(opis = uslugi.mcpBridge?.descriptor?.('sess-1')); i++) await new Promise((r) => setTimeout(r, 100))
const vyzov = async (tool, args) => {
  const r = await fetch(opis.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-ticket': opis.ticket }, body: JSON.stringify({ tool, args }) })
  return r.json()
}

try {
  await proba('src/pamyat.json = живому извлечению из ядра (схема и описание не разошлись)', () => {
    const r = spawnSync(process.execPath, [join(MOST, 'tools/izvlech-pamyat.mjs'), APP, CORE], { encoding: 'utf8' })
    if (r.status !== 0) return 'извлечение код ' + r.status + ': ' + (r.stderr || '').slice(0, 200)
    const zhivoe = JSON.stringify(JSON.parse(r.stdout)), fajl = JSON.stringify(JSON.parse(readFileSync(join(MOST, 'src/pamyat.json'), 'utf8')))
    return zhivoe === fajl || 'РАСХОЖДЕНИЕ: src/pamyat.json устарел против ядра — пересобрать tools/izvlech-pamyat.mjs'
  })
  await proba('инструмент в перечне, который уходит модели; схема = извлечению; запись одна', () => {
    if (!opis) return 'descriptor не выдан — мост не поднялся'
    const t = opis.tools.filter((x) => x.name === 'pamyat_otnoshenie')
    if (t.length !== 1) return `записей pamyat_otnoshenie в перечне: ${t.length} (всего ${opis.tools.length})`
    const req = t[0].inputSchema?.required ?? []
    return (['id', 'vid', 'k'].every((k) => req.includes(k)) && t[0].inputSchema.type === 'object')
      || 'схема не та: ' + JSON.stringify(t[0].inputSchema)
  })
  await proba('вызов через мост → поле отношения записано, в журнале ядра «stend (сессия sess-1): …»', async () => {
    const a = zap('reshenie', 'старое'), b = zap('reshenie', 'новое')
    const r = await vyzov('pamyat_otnoshenie', { id: b, vid: 'otmenyaet', k: a })
    if (!r.ok) return 'мост ответил отказом: ' + r.error
    const pole = h.baza.prepare('SELECT otnoshenie, otnositsya_k FROM zapisi WHERE id = ?').get(b)
    const pochemu = h.baza.prepare("SELECT pochemu FROM zhurnal WHERE priroda = 'otnoshenie' ORDER BY rowid DESC").get()?.pochemu
    if (!(pole?.otnoshenie === 'otmenyaet' && Number(pole.otnositsya_k) === a)) return 'поле: ' + JSON.stringify(pole)
    if (!String(pochemu).startsWith('stend (сессия sess-1):')) return 'журнал ядра: ' + pochemu
    return zvali.some(([n, id]) => n === 'pamyat_otnoshenie' && id === 'sess-1') || 'мост не спросил реестр от имени живого агента: ' + JSON.stringify(zvali)
  })
  await proba('отказ договора доходит до модели ТЕКСТОМ с кодом, поле не тронуто', async () => {
    const a = zap('fakt', 'было'), b = zap('fakt', 'не было')
    const r = await vyzov('pamyat_otnoshenie', { id: b, vid: 'otmenyaet', k: a })
    const pole = h.baza.prepare('SELECT otnoshenie FROM zapisi WHERE id = ?').get(b)
    if (r.ok) return 'мост ответил успехом там, где договор запрещает'
    if (!String(r.error).includes('PAMYAT_OTMENA_ZAVERSHENNOGO')) return 'текст отказа без кода: ' + r.error
    return pole?.otnoshenie == null || 'поле тронуто: ' + JSON.stringify(pole)
  })
} finally {
  for (const [ev, f] of obrabotchiki) if (ev === 'dispose') { try { f() } catch {             } }
  try { h.baza.close?.() } catch {                   }
  rmSync(katalog, { recursive: true, force: true })
}
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
