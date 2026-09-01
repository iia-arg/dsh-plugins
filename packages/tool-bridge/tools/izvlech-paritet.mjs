/**
 * Извлечь определения инструментов целей и заданий ИСПОЛНЕНИЕМ пакетов
 * платформы, а не переписыванием руками. Так «знак в знак» доказуемо:
 * описания и схемы берутся из того же кода, что работает у соседнего агента.
 */
import { createRequire } from 'node:module'
const require = createRequire(process.argv[2] ? process.argv[2] + '/package.json' : process.cwd() + '/package.json')
// Корень установки платформы — первым доводом при запуске: у каждого он свой.
const root = (process.argv[2] || process.cwd()) + '/node_modules/@deepseek-ai'

const out = []
for (const pkg of ['dsh-tool-goal', 'dsh-tool-jobs']) {
  const mod = await import(`${root}/${pkg}/lib/index.js`)
  const ctx = {
    tools: { register: (t) => out.push({ pkg, name: t.name, description: t.description, parameters: t.parameters ?? {} }) },
    systemPrompt: { section: () => {} },
    jobs: new Proxy({}, { get: () => () => {} }),
    goals: new Proxy({}, { get: () => () => {} }),
    agents: new Proxy({}, { get: () => () => {} }),
    get: () => ({}),
    on: () => {},
  }
  mod.apply(ctx, mod.Config ? {} : {})
}
console.log(JSON.stringify(out, null, 2))
