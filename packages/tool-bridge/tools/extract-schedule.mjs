/**
 * Extract the three schedule tool definitions by EXECUTING the platform package
 * @deepseek-ai/dsh-schedule — the same way parity.json is produced.
 *
 * 🔴 WHY A SEPARATE FILE AND NOT EXTRA LINES IN parity.json. parity.json means
 * "character for character with the native-route tool set", and that is proved
 * by checking against ITS live packages. There is no schedule in that set at
 * all — appending the schedule there would break both the meaning of the word
 * "parity" and the check that backs it. The parity here is a different one: with
 * a platform package that is mounted on our own side.
 *
 * 🔴 WHY NOT mod.apply, AS FOR GOALS. The schedule package registers its tools
 * not at load time but for EVERY created agent, through the public function
 * registerScheduleTools(rootCtx, toolCtx, agent, onDurableChange). That is why
 * the stand-in ctx here has two layers: a root one and an agent one.
 */
const APP = process.argv[2] ?? process.env.DSH_APP
if (!APP) {
  console.error('a platform installation root is required: node tools/extract-schedule.mjs <path> (it contains node_modules/@deepseek-ai)')
  process.exit(2)
}
// The path is an argument for the same reason as in the parity generator: run it
// after every platform upgrade, and on any installation — not only on ours.
const root = `${APP}/node_modules/@deepseek-ai`
const mod = await import(`${root}/dsh-schedule/lib/index.js`)

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
const agent = { id: 'extraction', session: { events: [], header: {} }, ctx: toolCtx }

mod.registerScheduleTools(rootCtx, toolCtx, agent, () => {})

// Fail loudly: a silent shortfall here would give a bridge with some of its
// tools simply gone, and from outside that would look like "the model does not
// call them". The number must be stated, not implied.
const EXPECTED = 3
if (out.length !== EXPECTED) {
  console.error(`🔴 BLINDNESS/RED: ${out.length} definitions collected, ${EXPECTED} expected`)
  process.exit(1)
}
console.log(JSON.stringify(out, null, 2))
