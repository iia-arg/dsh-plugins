// RU: Проверка stend-pamyat-ocenit: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-pamyat-ocenit verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


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
  ;({ apply: coreApply, opisanieInstrumentaOcenki: opisanie } = await import(pathToFileURL(join(CORE, 'src/index.js')).href))
  ;({ otkrytHranilishche } = await import(pathToFileURL(join(CORE, 'src/hranilishche.js')).href))
} catch (e) { slep('не загрузились платформа или ядро: ' + String(e?.message ?? e).slice(0, 160)) }
if (typeof opisanie !== 'function') slep('в ядре нет opisanieInstrumentaOcenki — ядро старше alpha.99')

let vsego = 0, proshlo = 0
const proba = async (imya, f) => {
  vsego++
  try {
    const v = await f()
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v))
    proshlo++; console.log('  ok   ' + imya)
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)) }
}

const katalog = mkdtempSync(join(tmpdir(), 'stend-most-ocenka-'))
const putBazy = join(katalog, 'b.db')
const servisy = {}
coreApply({ provide(i, o) { servisy[i] = o }, on() {}, logger: { error() {} } }, { putBazy, agent: 'stend' })
const sluzhba = servisy.pamyat
const h = otkrytHranilishche(putBazy)
const zap = (klass, t) => h.zapisat({ agent: 'stend', klass, soderzhim: t })
const telo = defineTool(opisanie(sluzhba, 'stend'))

const agent = { id: 'sess-1' }
const bezId = {}
const zvali = []
const uslugi = {
  agents: { get: (id) => (id === 'sess-1' ? agent : id === 'sess-bez' ? bezId : undefined), roots: () => [agent, bezId], currentInitiator: () => agent },
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
const opisDlya = async (sid) => { let o; for (let i = 0; i < 50 && !(o = uslugi.mcpBridge?.descriptor?.(sid)); i++) await new Promise((r) => setTimeout(r, 100)); return o }
const opis = await opisDlya('sess-1')
const vyzov = async (o, tool, args) => {
  const r = await fetch(o.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-ticket': o.ticket }, body: JSON.stringify({ tool, args }) })
  return r.json()
}
const ocenki = (id) => h.baza.prepare('SELECT ocenki FROM zapisi WHERE id = ?').get(id)?.ocenki ?? null
const POCHEMU = 'стенд моста: запись применена в работе и подтвердилась делом'

try {
  await proba('src/pamyat.json = живому извлечению из ядра (обе записи; схема и описание не разошлись)', () => {
    const r = spawnSync(process.execPath, [join(MOST, 'tools/izvlech-pamyat.mjs'), APP, CORE], { encoding: 'utf8' })
    if (r.status !== 0) return 'извлечение код ' + r.status + ': ' + (r.stderr || '').slice(0, 200)
    const zhivoe = JSON.parse(r.stdout), fajl = JSON.parse(readFileSync(join(MOST, 'src/pamyat.json'), 'utf8'))
    if (!zhivoe.some((x) => x.name === 'pamyat_ocenit')) return 'в живом извлечении нет pamyat_ocenit'
    return JSON.stringify(zhivoe) === JSON.stringify(fajl) || 'РАСХОЖДЕНИЕ: src/pamyat.json устарел против ядра — пересобрать tools/izvlech-pamyat.mjs'
  })
  await proba('pamyat_ocenit в перечне, который уходит модели; запись одна; схема id/ishod/pochemu', () => {
    if (!opis) return 'descriptor не выдан — мост не поднялся'
    const t = opis.tools.filter((x) => x.name === 'pamyat_ocenit')
    if (t.length !== 1) return `записей pamyat_ocenit в перечне: ${t.length} (всего ${opis.tools.length})`
    const req = t[0].inputSchema?.required ?? []
    return (['id', 'ishod', 'pochemu'].every((k) => req.includes(k)) && t[0].inputSchema.type === 'object')
      || 'схема не та: ' + JSON.stringify(t[0].inputSchema)
  })
  await proba('выданная запись → вызов через мост → оценка легла, kem = model:stend/sess-1#v<выдача> (сессия живого agent + номер выдачи, a99)', async () => {
    const a = zap('reshenie', 'решение для оценки')
    sluzhba.otmetitKasanie({ ids: [a], povod: 'vydacha-agentu' })
    const r = await vyzov(opis, 'pamyat_ocenit', { id: a, ishod: 'pomoglo', pochemu: POCHEMU })
    if (!r.ok) return 'мост ответил отказом: ' + r.error
    const o = JSON.parse(ocenki(a) || '[]')
    if (!(o.length === 1 && /^model:stend\/sess-1#v\d+$/.test(o[0].kem) && o[0].ishod === 'helped')) return 'оценки: ' + JSON.stringify(o)
    return zvali.some(([n, id]) => n === 'pamyat_ocenit' && id === 'sess-1') || 'мост не спросил реестр от имени живого агента: ' + JSON.stringify(zvali)
  })
  await proba('НЕ выдававшаяся запись → ok:false, ТЕКСТ с кодом PAMYAT_OCENKA_NE_VYDAVALOS, оценок нет', async () => {
    const b = zap('reshenie', 'не выдавалась')
    const r = await vyzov(opis, 'pamyat_ocenit', { id: b, ishod: 'pomoglo', pochemu: POCHEMU })
    if (r.ok) return 'мост ответил успехом там, где ядро обязано отказать'
    if (!String(r.error).includes('PAMYAT_OCENKA_NE_VYDAVALOS')) return 'текст отказа без кода: ' + r.error
    return ocenki(b) === null || 'оценки легли: ' + ocenki(b)
  })
  await proba('агент без личности → ТЕКСТ с кодом PAMYAT_OCENKA_BEZ_KTO (отказ ядра не глотается мостом)', async () => {
    const o2 = await opisDlya('sess-bez')
    if (!o2) return 'descriptor для агента без id не выдан — проба не дошла до ядра (СЛЕПА)'
    const c = zap('reshenie', 'для безличного'); sluzhba.otmetitKasanie({ ids: [c], povod: 'vydacha-agentu' })
    const r = await vyzov(o2, 'pamyat_ocenit', { id: c, ishod: 'pomoglo', pochemu: POCHEMU })
    if (r.ok) return 'успех без личности'
    return String(r.error).includes('PAMYAT_OCENKA_BEZ_KTO') || 'текст отказа: ' + r.error
  })
} finally {
  for (const [ev, f] of obrabotchiki) if (ev === 'dispose') { try { f() } catch {             } }
  try { h.baza.close?.() } catch {                   }
  rmSync(katalog, { recursive: true, force: true })
}
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
