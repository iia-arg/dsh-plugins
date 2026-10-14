// RU: izvlech-raspisanie: снять схемы из явно указанной установки платформы исполнением регистрации инструментов. Зависимости подставляются, реальные агенты и модель не запускаются; после обновления результаты сверять перед заменой JSON.
// EN: izvlech-raspisanie: extract schemas by executing tool registration against an explicit platform installation. Dependencies are fixtures; no real agent or model runs. Compare results before replacing JSON after upgrades.


import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
if (process.argv.length !== 3 || !process.argv[2] || process.argv[2].startsWith('-')) {
  console.error('ОТКАЗ: нужен явный корень установки платформы (один аргумент)')
  process.exit(2)
}
const platformRoot = resolve(process.argv[2])
try {
  if (!statSync(platformRoot).isDirectory()) throw new Error('not a directory')
} catch {
  console.error(`ОТКАЗ: корень установки платформы недоступен или не каталог: ${platformRoot}`)
  process.exit(2)
}

const require = createRequire(pathToFileURL(resolve(platformRoot, 'package.json')))
async function loadPackage(specifier) {
  try {
    const entry = require.resolve(specifier)
    return await import(pathToFileURL(entry).href)
  } catch (e) {
    console.error(`ОТКАЗ: пакет ${specifier}, корень ${platformRoot}; resolve/import: ${e?.code ?? e?.name ?? 'unknown'}`)
    process.exit(2)
  }
}
const mod = await loadPackage('@deepseek-ai/dsh-schedule')

const out = []
const toolCtx = {
  tools: {
    register: (t) => {
      out.push({ pkg: 'dsh-schedule', name: t.name, description: t.description, parameters: t.parameters ?? {} })
      return () => {}
    },
  },
}
const rootCtx = {
  logger: { warn: () => {}, info: () => {} },
  sessions: { flush: async () => {} },
  agents: { get: () => undefined, roots: () => [] },
  get: () => ({}),
  on: () => () => {},
}
const agent = { id: 'izvlechenie', session: { events: [], header: {} }, ctx: toolCtx }

mod.registerScheduleTools(rootCtx, toolCtx, agent, () => {})

const VYSTAVLYAEM = ['schedule_create', 'schedule_list', 'schedule_delete', 'schedule_update']
const bedy = VYSTAVLYAEM.filter((n) => out.filter((t) => t.name === n).length !== 1)
if (bedy.length) {
  console.error(`🔴 СЛЕПОТА/КРАСНАЯ: снято ${out.length} определений; выставляемых не ровно по одному: ${bedy.join(', ')}`)
  process.exit(1)
}
const lishnie = out.map((t) => t.name).filter((n) => !VYSTAVLYAEM.includes(n))
if (lishnie.length) console.error(`в платформе есть, мостом НЕ выставлено (решение, не недобор): ${lishnie.join(', ')}`)
console.log(JSON.stringify(VYSTAVLYAEM.map((n) => out.find((t) => t.name === n)), null, 2))
