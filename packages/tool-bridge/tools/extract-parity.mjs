/**
 * Extract the goal and job tool definitions by EXECUTING the platform packages,
 * rather than by copying them out by hand. That is what makes "character for
 * character" provable: descriptions and schemas come from the same code that
 * runs on the native route.
 *
 * 🔴 THE PATH TO THE PLATFORM INSTALLATION IS AN ARGUMENT, NOT A CONSTANT. This
 * generator must be run AFTER EVERY platform upgrade: the platform will change a
 * description or a schema at home while our file stays as it was — and they will
 * diverge SILENTLY, because nothing crashes. A hard-coded path would mean that
 * on a second installation the script reads the wrong platform and answers a
 * different question.
 *
 * Usage:  node tools/extract-parity.mjs <platform installation root>
 *     or  DSH_APP=<root> node tools/extract-parity.mjs
 */
import { createRequire } from 'node:module'
const APP = process.argv[2] ?? process.env.DSH_APP
if (!APP) {
  console.error('a platform installation root is required: node tools/extract-parity.mjs <path> (it contains node_modules/@deepseek-ai)')
  process.exit(2)
}
const require = createRequire(`${APP}/package.json`)
const root = `${APP}/node_modules/@deepseek-ai`

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
