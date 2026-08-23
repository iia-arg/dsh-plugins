// Bench: does a `tools/execute` hook refuse a tool call before it runs?
//
// Needs three platform packages resolvable from the CURRENT directory (they are
// test-only, not plugin runtime, and are declared in devDependencies):
//   @deepseek-ai/cordis, @deepseek-ai/dsh-tools, @deepseek-ai/dsh-system-prompt
// `npm install` in the package directory fetches them; NODE_PATH does not work for
// ES modules, so a node_modules symlink to the platform's own copy is the alternative.
//
// The registry service is silent about its own dependency: ToolRuntime declares
// `static inject = ["systemPrompt"]`, and mounted alone it leaves ctx.tools
// undefined with no throw and no log. Mount both, or read the silence as "not
// reproducible" and be wrong.
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

const FLOOR = 1800
let ok = 0, bad = 0
const check = (label, actual, expected) => {
  if (String(actual).includes(expected)) { ok++; console.log(`  ok   ${label}`) }
  else { bad++; console.log(`  FAIL ${label}\n       expected to contain: ${expected}\n       got: ${actual}`) }
}

function tool() {
  return defineContentToolFixture({
    name: 'schedule_create',
    description: 'stand-in for the real schedule_create',
    parameters: { every_seconds: { type: 'number' } },
    async execute(args) { return [{ type: 'text', text: `CREATED every_seconds=${args.every_seconds}` }] },
  })
}

async function registry() {
  const ctx = new Context()
  ctx.plugin(SystemPrompt, {})
  ctx.plugin(ToolRuntime, {})
  // The service appears when the provider's fiber goes active, not when plugin()
  // returns. Waiting is the difference between a bench and a wrong conclusion.
  for (let i = 0; i < 50 && !ctx.tools; i++) await new Promise((r) => setTimeout(r, 20))
  if (!ctx.tools) throw new Error('tools service never became available')
  ctx.tools.register(tool())
  return ctx
}

const call = (ctx, every, callId) => ctx.tools.execute({
  name: 'schedule_create',
  arguments: { every_seconds: every },
  callId,
  signal: new AbortController().signal,
}).then((r) => r?.content?.[0]?.text ?? JSON.stringify(r))

const guarded = await registry()
guarded.on('tools/execute', async (exec, next) => {
  if (exec.name !== 'schedule_create') return next()
  const every = exec.arguments?.every_seconds
  if (typeof every !== 'number' || every >= FLOOR) return next()
  const message = `repeating reminder no more often than every ${FLOOR}s (asked ${every}s)`
  // `error` is mandatory: without it the registry answers "tool result must be
  // losslessly JSON-serializable" and the model is told the plumbing broke
  // instead of why it was refused.
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    error: { message, info: { name: 'ScheduleGuardError', code: 'SCHEDULE_TOO_FREQUENT' } },
  }
})

check('below the floor is refused, with the reason', await call(guarded, 300, 'a'), 'no more often than every 1800s')
check('at the floor passes through', await call(guarded, FLOOR, 'b'), 'CREATED every_seconds=1800')

// Control: the same call without the guard must succeed. A bench that refuses
// everything proves its own breakage, not a guard.
check('control, no guard: below the floor passes', await call(await registry(), 300, 'c'), 'CREATED every_seconds=300')

console.log(`\n${ok} ok, ${bad} failed`)
process.exit(bad === 0 ? 0 : 1)
