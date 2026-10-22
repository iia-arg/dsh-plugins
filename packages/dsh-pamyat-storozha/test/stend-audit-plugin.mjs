// Audit regressions: candidate event handlers, real local sinks, real cordis unload. No live models/services.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as plugin from '../src/index.js'
if (!process.env.STOROZHA_AUDIT_WORKER) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, STOROZHA_ZHDAT_POSLE_MS: '80', STOROZHA_AUDIT_WORKER: '1' }, encoding: 'utf8', timeout: 20000,
  })
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '')
  process.exit(r.status ?? 2)
}
console.log('audit worker: STOROZHA_ZHDAT_POSLE_MS=' + process.env.STOROZHA_ZHDAT_POSLE_MS)
const dir = mkdtempSync(join(tmpdir(), 'storozha-audit-'))
process.env.KOMPAKT_NASTROJKI_KATALOG = dir
process.env.KOMPAKT_AGENT = 'probe'
process.env.STOROZHA_STUPENI_FAJL = join(dir, 'stages.json')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let failed = 0, total = 0
const probe = async (name, run) => {
  total++
  try { await run(); console.log('✅ ' + name) }
  catch (e) { failed++; console.log('❌ ' + name + ': ' + e.message) }
}
function mount(config = {}, logger = undefined) {
  const lines = [], callbacks = [], effects = []
  const ctx = { logger: logger ?? { info: line => { lines.push(line) } },
    on: (name, f) => { if (name === 'session/event') callbacks.push(f) },
    effect: f => { effects.push(f()) } }
  const guard = plugin.apply(ctx, new plugin.Config({ agent: 'test-' + total, ...config }))
  let seq = 0
  const session = { id: 'session-' + total, requestContext: () => ({ provider: 'p', model: 'm' }) }
  return { lines, guard, event: (type, data = {}, s = session) => {
    for (const f of callbacks) f(s, { type, seq: ++seq, time: Date.now(), data })
  }, dispose: () => effects.forEach(f => f?.()) }
}
try {
  await probe('02 logger undefined return prints each startup line once', async () => {
    const seen = [], consoleLines = [], original = console.log
    console.log = line => consoleLines.push(line)
    try { mount({}, { info: line => { seen.push(line) } }) } finally { console.log = original }
    assert.equal(seen.length, 0); assert.equal(consoleLines.length, 1); assert.match(consoleLines[0], /\[dsh-pamyat-storozha [^\]]+\] подъём:/)
  })
  await probe('02 absent logger still has console fallback', async () => {
    const lines = [], original = console.log; console.log = line => lines.push(line)
    try { mount({}, {}) } finally { console.log = original }
    assert.equal(lines.length, 1)
  })
  await probe('03 ready D threshold counts without platform window or configured limit', async () => {
    writeFileSync(join(dir, 'probe.json'), JSON.stringify({ porogi: { schema: 1, defaultRoute: { provider: 'p', model: 'm' }, routes: [{ provider: 'p', model: 'm', window: 1000000, ratio: 0.89, nominalThreshold: 890000 }] } }))
    const m = mount(); m.event('assistant/message', { usage: { inputTokens: 800000 } })
    assert.equal(m.lines.filter(x => x.includes('ЗАПОЛНЕНИЕ')).length, 1)
    assert.ok(m.lines.some(x => x.includes('89,9% номинального порога 890 000')))
    assert.ok(!m.lines.some(x => /NaN|Infinity|ступени НЕ считаются/.test(x)))
    m.dispose()
  })
  await probe('04 slow real sink leaves event loop free', async () => {
    const output = join(dir, 'slow.txt'); const m = mount({ predel: 1000000, komandaStoka: `sleep 0.3; cat > '${output}'` })
    const before = performance.now(); m.event('assistant/message', { usage: { inputTokens: 810000 } })
    assert.ok(performance.now() - before < 150, 'event blocked for ' + Math.round(performance.now() - before) + ' ms')
    await pause(500); assert.ok(existsSync(output)); assert.match(readFileSync(output, 'utf8'), /контекст/); m.dispose()
  })
  await probe('04 failed sink names refusal in log', async () => {
    const m = mount({ predel: 1000000, komandaStoka: 'exit 7' }); m.event('assistant/message', { usage: { inputTokens: 820000 } })
    await pause(100); assert.ok(m.lines.some(x => x.includes('сток не сработал'))); m.dispose()
  })
  await probe('11 cordis unload cancels delayed owner line', async () => {
    const output = join(dir, 'unloaded.txt'); const root = new Context()
    const fiber = root.plugin(plugin, { agent: 'audit-unload', komandaStoka: `cat > '${output}'` })
    await pause(30)
    const session = { id: 'unload', requestContext: () => ({ provider: 'p', model: 'm' }) }
    await root.emit('session/event', session, { type: 'compaction/end', data: { compactionId: 'unload' }, time: Date.now() })
    await fiber.dispose(); await pause(160)
    assert.ok(!existsSync(output), 'unloaded guard executed delayed sink')
  })
  await probe('27 session map and persisted stages stay bounded for 140 conversations', async () => {
    rmSync(join(dir, 'stages.json'), { force: true })
    const m = mount({ trevogaSzhatiya: false })
    for (let i = 0; i < 140; i++) m.event('assistant/message', { usage: { inputTokens: 830000 } }, { id: 'bounded-' + i, requestContext: () => ({ provider: 'p', model: 'm' }) })
    assert.ok(m.guard.sessii().length <= 128, 'unbounded session map')
    const saved = JSON.parse(readFileSync(join(dir, 'stages.json'), 'utf8')).sessii
    assert.ok(Object.keys(saved).length <= 128, 'unbounded stages file')
    assert.ok(Object.hasOwn(saved, 'bounded-139')); assert.ok(!Object.hasOwn(saved, 'bounded-0')); m.dispose()
  })
  await probe('28 million-character summary retains character unit in owner line', async () => {
    const output = join(dir, 'million.txt'); const m = mount({ komandaStoka: `cat > '${output}'` })
    m.event('compaction/start', { compactionId: 'million' })
    m.event('compaction/summary', { compactionId: 'million', summary: [{ text: 'x'.repeat(1000000) }] })
    m.event('compaction/end', { compactionId: 'million' })
    m.event('assistant/message', { usage: { inputTokens: 1 } })
    await pause(100); assert.match(readFileSync(output, 'utf8'), /сводка 1 млн зн\./); m.dispose()
  })
  await probe('27 low usage bounds the in-memory stages without a disk write', async () => {
    rmSync(join(dir, 'stages.json'), { force: true })
    const m = mount({ predel: 1000 })
    for (let i = 0; i < 140; i++) m.event('assistant/message', { usage: { inputTokens: 10 } }, { id: 'low-' + i })
    const values = Object.values; let measured = null
    Object.values = object => {
      const result = values(object)
      if (result.length && result.every(x => x && Array.isArray(x.otdany))) measured = result.length
      return result
    }
    try { m.guard.sostoyanie() } finally { Object.values = values }
    assert.ok(measured !== null, 'the observer did not receive the stages object')
    assert.ok(measured <= 128, 'unbounded low-usage stages: ' + measured)
    assert.ok(!existsSync(join(dir, 'stages.json')), 'low usage need not write a file'); m.dispose()
  })
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log(`итог: ${total - failed} из ${total}`)
process.exitCode = failed ? 1 : 0
