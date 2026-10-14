// RU: izvlech-paritet: снять схемы из явно указанной установки платформы исполнением регистрации инструментов. Зависимости подставляются, реальные агенты и модель не запускаются; после обновления результаты сверять перед заменой JSON.
// EN: izvlech-paritet: extract schemas by executing tool registration against an explicit platform installation. Dependencies are fixtures; no real agent or model runs. Compare results before replacing JSON after upgrades.


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

const out = []

const gluboko = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : gluboko), apply: () => gluboko })
for (const pkg of ['dsh-tool-goal', 'dsh-tool-jobs']) {
  const mod = await loadPackage(`@deepseek-ai/${pkg}`)
  const ctx = {
    tools: { register: (t) => out.push({ pkg, name: t.name, description: t.description, parameters: t.parameters ?? {} }) },
    systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
    jobs: gluboko,
    goals: gluboko,
    agents: gluboko,
    get: () => ({}),
    on: () => {},
  }
  mod.apply(ctx, mod.Config ? {} : {})
}
console.log(JSON.stringify(out, null, 2))
