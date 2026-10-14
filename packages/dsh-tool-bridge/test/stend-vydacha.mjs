// RU: Проверка stend-vydacha: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-vydacha verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOST = resolve(process.env.MOST_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'))
const najtiModul = () => {
  const dom = process.env.DSH_HOME || join(homedir(), '.dsh')
  let profili = []
  try { profili = readdirSync(join(dom, 'profiles')).sort() } catch { return undefined }
  for (const p of profili) {
    const d = join(dom, 'profiles', p, 'node_modules', 'dsh-pamyat-omega')
    if (existsSync(join(d, 'src', 'index.js'))) return d
  }
  return undefined
}
const OMEGA_RAW = process.env.OMEGA_DIR || najtiModul()
const OMEGA = OMEGA_RAW ? resolve(OMEGA_RAW) : undefined
const APP = process.env.DSH_TEST_APP
const slep = (why) => { console.log('СЛЕПОТА: ' + why); process.exit(2) }
console.log(`предмет: мост ${MOST} · модуль выдачи ${OMEGA} · платформа ${APP ?? '(не задана)'}`)
if (!APP) slep('не задан DSH_TEST_APP — defineTool платформы взять неоткуда')
if (!OMEGA) slep('не задан OMEGA_DIR и в профилях DSH_HOME (или ~/.dsh) нет dsh-pamyat-omega')

let defineTool, opisanie
try {
  const req = createRequire(pathToFileURL(resolve(APP, 'package.json')))
  ;({ defineTool } = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tools')).href))
  ;({ opisanieInstrumentaVydachi: opisanie } = await import(pathToFileURL(join(OMEGA, 'src/index.js')).href))
} catch (e) { slep('не загрузились платформа или модуль выдачи: ' + String(e?.message ?? e).slice(0, 160)) }
if (typeof opisanie !== 'function') slep('в модуле выдачи нет opisanieInstrumentaVydachi — модуль старше a20')

let vsego = 0, proshlo = 0
const proba = async (imya, f) => {
  vsego++
  try {
    const v = await f()
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v))
    proshlo++; console.log('  ok   ' + imya)
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)) }
}

const iskali = []
const ZAPIS = { tip: 'reshenie', id: 'mem-stend00000001', sozdano: '2026-09-30T00:00', pometka: 'svezhee', prevyu: 'известная запись стенда про порог сжатия' }
const najti = async (zadacha, opcii) => { iskali.push([zadacha, opcii?.rezhim]); return { vydano: [ZAPIS], otseyano: {} } }
const telo = defineTool(opisanie(najti))

const s1 = { id: 'sess-1' }, s2 = { id: 'sess-2' }
const uslugi = {
  agents: { get: (id) => (id === s1.id ? s1 : id === s2.id ? s2 : undefined), roots: () => [s1, s2], currentInitiator: () => s1 },
  tools: { get: (name, scope) => (name === telo.name && scope === s1 ? telo : undefined) },
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
const opisDlya = async (id) => { let o; for (let i = 0; i < 50 && !(o = uslugi.mcpBridge?.descriptor?.(id)); i++) await new Promise((r) => setTimeout(r, 100)); return o }
const vyzov = async (opis, tool, args) => {
  const r = await fetch(opis.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-ticket': opis.ticket }, body: JSON.stringify({ tool, args }) })
  return r.json()
}

try {
  await proba('src/vydacha.json = живому извлечению из модуля выдачи (схема и описание не разошлись)', () => {
    const r = spawnSync(process.execPath, [join(MOST, 'tools/izvlech-vydacha.mjs'), APP, OMEGA], { encoding: 'utf8' })
    if (r.status !== 0) return 'извлечение код ' + r.status + ': ' + (r.stderr || '').slice(0, 200)
    const zhivoe = JSON.stringify(JSON.parse(r.stdout)), fajl = JSON.stringify(JSON.parse(readFileSync(join(MOST, 'src/vydacha.json'), 'utf8')))
    return zhivoe === fajl || 'РАСХОЖДЕНИЕ: src/vydacha.json устарел против модуля — пересобрать tools/izvlech-vydacha.mjs'
  })
  await proba('агенту С выдачей — pamyat_po_smyslu в перечне, схема = извлечению; агенту БЕЗ — нет, прочий набор тот же', async () => {
    const o1 = await opisDlya('sess-1'), o2 = await opisDlya('sess-2')
    if (!o1 || !o2) return 'descriptor не выдан — мост не поднялся'
    const n1 = o1.tools.map((t) => t.name), n2 = o2.tools.map((t) => t.name)
    const t = o1.tools.filter((x) => x.name === 'pamyat_po_smyslu')
    if (t.length !== 1) return `у sess-1 записей pamyat_po_smyslu: ${t.length}`
    if (n2.includes('pamyat_po_smyslu')) return 'sess-2 без выдачи получил pamyat_po_smyslu'
    const snimok = JSON.parse(readFileSync(join(MOST, 'src/vydacha.json'), 'utf8'))[0]
    if (JSON.stringify(t[0].inputSchema) !== JSON.stringify(snimok.parameters)) return 'схема в перечне ≠ снимку'
    const raznica = n1.filter((x) => !n2.includes(x))
    return (raznica.length === 1 && raznica[0] === 'pamyat_po_smyslu' && n2.every((x) => n1.includes(x))) || `наборы разошлись не только выдачей: ${JSON.stringify(raznica)}`
  })
  await proba('вызов через мост → текст с записями поиска; поиск получил задачу и режим po-zaprosu', async () => {
    const r = await vyzov(await opisDlya('sess-1'), 'pamyat_po_smyslu', { zadacha: 'порог сжатия кодеров', skolko: 3 })
    if (!r.ok) return 'мост ответил отказом: ' + r.error
    const tekst = JSON.stringify(r)
    if (!tekst.includes(ZAPIS.id) || !tekst.includes('ПАМЯТЬ ПО СМЫСЛУ')) return 'в ответе нет записи/шапки: ' + tekst.slice(0, 200)
    return (iskali.some(([z, rez]) => z === 'порог сжатия кодеров' && rez === 'po-zaprosu')) || 'поиск не получил задачу: ' + JSON.stringify(iskali)
  })
  await proba('пустая задача → отказ ТЕКСТОМ с кодом PAMYAT_VYDACHA_BEZ_ZADACHI', async () => {
    const r = await vyzov(await opisDlya('sess-1'), 'pamyat_po_smyslu', { zadacha: '   ' })
    if (r.ok) return 'мост ответил успехом на пустую задачу'
    return String(r.error).includes('PAMYAT_VYDACHA_BEZ_ZADACHI') || 'текст отказа без кода: ' + r.error
  })
  await proba('агент БЕЗ выдачи зовёт мимо перечня → громкий отказ, тело не вызвано', async () => {
    const do_ = iskali.length
    const r = await vyzov(await opisDlya('sess-2'), 'pamyat_po_smyslu', { zadacha: 'что-нибудь' })
    if (r.ok) return 'мост исполнил инструмент у агента без выдачи'
    if (iskali.length !== do_) return 'тело вызвано у агента без выдачи'

    return /"pamyat_po_smyslu" не выдан этому агенту/.test(String(r.error)) || 'отказ не называет причину: ' + r.error
  })
  await proba('расписание в перечне: у schedule_create и schedule_update нет cron, описание называет это', async () => {
    const o = await opisDlya('sess-1')
    const bedy = ['schedule_create', 'schedule_update'].filter((n) => {
      const t = o.tools.find((x) => x.name === n)
      return !t || 'cron' in (t.inputSchema?.properties ?? {}) || !/cron не принимается/.test(t.description)
    })
    return bedy.length === 0 || 'cron виден или не назван у: ' + bedy.join(', ')
  })
} finally {
  for (const [ev, f] of obrabotchiki) if (ev === 'dispose') { try { f() } catch {             } }
}
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
