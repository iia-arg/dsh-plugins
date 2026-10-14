// RU: izvlech-vydacha: снять схемы из явно указанной установки платформы исполнением регистрации инструментов. Зависимости подставляются, реальные агенты и модель не запускаются; после обновления результаты сверять перед заменой JSON.
// EN: izvlech-vydacha: extract schemas by executing tool registration against an explicit platform installation. Dependencies are fixtures; no real agent or model runs. Compare results before replacing JSON after upgrades.


import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
if (process.argv.length !== 4 || process.argv.slice(2).some((a) => !a || a.startsWith('-'))) {
  console.error('ОТКАЗ: нужны два явных аргумента — корень установки платформы и каталог пакета dsh-pamyat-omega')
  process.exit(2)
}
const [platformRoot, omegaDir] = process.argv.slice(2).map((a) => resolve(a))
for (const [imya, put] of [['корень платформы', platformRoot], ['каталог модуля выдачи', omegaDir]]) {
  try {
    if (!statSync(put).isDirectory()) throw new Error('not a directory')
  } catch {
    console.error(`ОТКАЗ: ${imya} недоступен или не каталог: ${put}`)
    process.exit(2)
  }
}
const require = createRequire(pathToFileURL(resolve(platformRoot, 'package.json')))
let defineTool, opisanieInstrumentaVydachi
try {
  ;({ defineTool } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href))
} catch (e) {
  console.error(`ОТКАЗ: @deepseek-ai/dsh-tools от ${platformRoot}: ${e?.code ?? e?.name ?? 'unknown'}`)
  process.exit(2)
}
try {
  ;({ opisanieInstrumentaVydachi } = await import(pathToFileURL(resolve(omegaDir, 'src/index.js')).href))
} catch (e) {
  console.error(`ОТКАЗ: модуль выдачи ${omegaDir}/src/index.js: ${e?.code ?? e?.name ?? 'unknown'}`)
  process.exit(2)
}
if (typeof opisanieInstrumentaVydachi !== 'function') {
  console.error(`🔴 СЛЕПОТА: в ${omegaDir} нет opisanieInstrumentaVydachi — модуль выдачи старше a20?`)
  process.exit(2)
}

const t = defineTool(opisanieInstrumentaVydachi(async () => ({ otkaz: 'izvlechenie' })))
const out = [{ pkg: 'dsh-pamyat-omega', name: t.name, description: t.description, parameters: t.parameters ?? {} }]
if (out[0].name !== 'pamyat_po_smyslu' || out[0].parameters?.type !== 'object') {
  console.error(`🔴 КРАСНАЯ: снято «${out[0].name}», схема типа «${out[0].parameters?.type}» — ждали pamyat_po_smyslu и object`)
  process.exit(1)
}
console.log(JSON.stringify(out, null, 2))
