// RU: izvlech-pamyat: снять схемы из явно указанной установки платформы исполнением регистрации инструментов. Зависимости подставляются, реальные агенты и модель не запускаются; после обновления результаты сверять перед заменой JSON.
// EN: izvlech-pamyat: extract schemas by executing tool registration against an explicit platform installation. Dependencies are fixtures; no real agent or model runs. Compare results before replacing JSON after upgrades.


import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (process.argv.length !== 4 || process.argv.slice(2).some((a) => !a || a.startsWith('-'))) {
  console.error('ОТКАЗ: нужны два явных аргумента — корень установки платформы и каталог пакета dsh-pamyat-core')
  process.exit(2)
}
const [platformRoot, coreDir] = process.argv.slice(2).map((a) => resolve(a))
for (const [imya, put] of [['корень платформы', platformRoot], ['каталог ядра', coreDir]]) {
  try {
    if (!statSync(put).isDirectory()) throw new Error('not a directory')
  } catch {
    console.error(`ОТКАЗ: ${imya} недоступен или не каталог: ${put}`)
    process.exit(2)
  }
}

const require = createRequire(pathToFileURL(resolve(platformRoot, 'package.json')))
let defineTool, opisanieInstrumentaOtnosheniya, opisanieInstrumentaOcenki
try {
  ;({ defineTool } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href))
} catch (e) {
  console.error(`ОТКАЗ: @deepseek-ai/dsh-tools от ${platformRoot}: ${e?.code ?? e?.name ?? 'unknown'}`)
  process.exit(2)
}
try {
  ;({ opisanieInstrumentaOtnosheniya, opisanieInstrumentaOcenki } = await import(pathToFileURL(resolve(coreDir, 'src/index.js')).href))
} catch (e) {
  console.error(`ОТКАЗ: ядро ${coreDir}/src/index.js: ${e?.code ?? e?.name ?? 'unknown'}`)
  process.exit(2)
}
if (typeof opisanieInstrumentaOtnosheniya !== 'function') {
  console.error(`🔴 СЛЕПОТА: в ядре ${coreDir} нет opisanieInstrumentaOtnosheniya — ядро старше alpha.78?`)
  process.exit(2)
}

if (typeof opisanieInstrumentaOcenki !== 'function') {
  console.error(`🔴 СЛЕПОТА: в ядре ${coreDir} нет opisanieInstrumentaOcenki — ядро старше alpha.99?`)
  process.exit(2)
}

const ZHDALI = ['pamyat_otnoshenie', 'pamyat_ocenit']
const out = [opisanieInstrumentaOtnosheniya, opisanieInstrumentaOcenki].map((f) => {
  const t = defineTool(f(null, 'izvlechenie'))
  return { pkg: 'dsh-pamyat-core', name: t.name, description: t.description, parameters: t.parameters ?? {} }
})
for (let i = 0; i < ZHDALI.length; i++) {
  if (out[i].name !== ZHDALI[i] || out[i].parameters?.type !== 'object') {
    console.error(`🔴 КРАСНАЯ: снято «${out[i].name}», схема типа «${out[i].parameters?.type}» — ждали ${ZHDALI[i]} и object`)
    process.exit(1)
  }
}
console.log(JSON.stringify(out, null, 2))
