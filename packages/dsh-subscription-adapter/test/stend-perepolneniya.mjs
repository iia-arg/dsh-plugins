import {installFixtureIngress} from './fixture-ingress.mjs';
installFixtureIngress();
// RU: stend-perepolneniya: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-perepolneniya: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.


import http from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const APP = process.env.STEND_APP
if (!APP) { console.log('  СЛЕПОТА: не задан STEND_APP — каталог платформы (dsh) с node_modules'); process.exit(2) }
const SRC = process.env.STEND_SRC || join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js')
console.log('предмет:', SRC, createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 8))
const tmp = vremennyj(join(tmpdir(), 'stend-perepolneniya-'))
symlinkSync(join(APP, 'node_modules'), join(tmp, 'node_modules'))
const LLM = join(APP, 'node_modules/@deepseek-ai/dsh-llm/lib/index.js')
mkdirSync(join(tmp, 'lib'))
writeFileSync(join(tmp, 'package.json'), readFileSync(join(APP, 'node_modules/@deepseek-ai/dsh-llm/package.json')))
writeFileSync(join(tmp, 'lib', 'dsh-llm-kopiya.mjs'), readFileSync(LLM, 'utf8') + '\nexport { normalizeLlmFailure, adapterFailureChunk };\n')
const { adapterFailureChunk } = await import(pathToFileURL(join(tmp, 'lib', 'dsh-llm-kopiya.mjs')))
const { BasicCompactionEngine } = await import(pathToFileURL(join(APP, 'node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js')))
const { apply } = await import(pathToFileURL(SRC))

const PEREPOLNENIE = 'Prompt is too long: 1012345 tokens > 1000000 maximum'
const srv = http.createServer((req, res) => {
  if(req.url.endsWith('/health')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai'}));return;}
  const rezhim = req.url.split('/')[1]
  if (rezhim === 'http-perepolnenie') { res.writeHead(400); return res.end(`{"type":"error","error":{"type":"invalid_request_error","message":"${PEREPOLNENIE}"}}`) }
  if (rezhim === 'limit') { res.writeHead(429); return res.end('rate limited') }
  res.writeHead(200, { 'content-type': 'application/x-ndjson' })
  if (rezhim === 'potok-perepolnenie') res.write(JSON.stringify({ type: 'error', message: PEREPOLNENIE }) + '\n')
  else if (rezhim === 'potok-obychnaya') res.write(JSON.stringify({ type: 'error', message: 'шлюз: соединение с поставщиком оборвалось' }) + '\n')
  else { res.write(JSON.stringify({ type: 'text', text: 'ok' }) + '\n'); res.write(JSON.stringify({ type: 'usage', inputTokens: 5, outputTokens: 1 }) + '\n'); res.write(JSON.stringify({ type: 'done' }) + '\n') }
  res.end()
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const port = srv.address().port

async function zapros(rezhim) {
  let adapter
  const ctx = { llm: { registerAdapter: (_p, a) => { adapter = a; return () => {} } }, get: () => undefined, on: () => () => {}, logger: { info() {}, warn() {} } }
  const err0 = console.error; console.error = () => {}
  try { apply(ctx, { baseURL: `http://127.0.0.1:${port}/${rezhim}` }) } finally { console.error = err0 }
  try { for await (const _ of adapter.stream({ model: 'm', messages: [] })) {} ; return { finish: 'ok' } }
  catch (e) { return { thrown: e, chunk: adapterFailureChunk(e) } }
}
async function vetkaSzhatiya(failure) {
  const H = {}, vyzovy = []
  const agent = { session: { requestHeader: () => ({ config: { provider: 'claude-oauth', model: 'm' } }), surface: { replaceGeneration: 0 } } }
  const dvizhok = { ctx: { on: (n, f) => { H[n] = f }, logger: { info() {}, warn() {} } },
    config: { modelPolicies: [], thresholdRatio: 0.89, retainRatio: 0.02, compactionRetries: 0, maxOverflowRetries: 2 },
    overflowAgents: new Map(), overflowRetries: new Map(), warnedPressureConfigTargets: new Set(),
    compactIfNeeded: async (a, trigger) => { vyzovy.push(trigger); a.session.surface.replaceGeneration++; return { shadowedSeqs: [1], shadowedRange: { start: 1, end: 1 }, shadowedTokenCount: 1 } } }
  BasicCompactionEngine.prototype._registerAutomaticCompaction.call(dvizhok)
  const itog = await H['agent/request-error']({ agent, failure, signal: new AbortController().signal }, () => 'NEXT')
  return { itog: itog?.kind ?? itog, vyzovy }
}
let vsego = 0, bed = 0
const proba = (imya, ok, pochemu) => { vsego++; if (ok) console.log(`✅ ${imya}`); else { bed++; console.log(`❌ ${imya}: ${pochemu}`) } }
for (const rezhim of ['potok-perepolnenie', 'http-perepolnenie']) {
  const z = await zapros(rezhim); const f = z.chunk?.reason?.failure; const v = await vetkaSzhatiya(f)
  proba(`${rezhim}: платформа видит CONTEXT_WINDOW_EXCEEDED`, f?.code === 'CONTEXT_WINDOW_EXCEEDED', JSON.stringify(f))
  proba(`${rezhim}: ветка сжимает (context-overflow) и повторяет (retry)`, v.itog === 'retry' && v.vyzovy.join() === 'context-overflow', JSON.stringify(v))
}
{ const z = await zapros('potok-obychnaya'); const f = z.chunk?.reason?.failure; const v = await vetkaSzhatiya(f)
  proba('обычная ошибка шлюза: прежнее — не переполнение, ветка не зовёт сжатие', f?.code !== 'CONTEXT_WINDOW_EXCEEDED' && v.itog === 'NEXT' && v.vyzovy.length === 0, JSON.stringify({ f, v }))
  proba('обычная ошибка: Error GATEWAY_ERROR сохраняет причину, не становится переполнением', z.thrown?.constructor === Error && z.thrown.code === 'GATEWAY_ERROR' && z.thrown.cause?.code === 'GATEWAY_ERROR', `${z.thrown?.constructor?.name} ${z.thrown?.code}`) }
{ const z = await zapros('limit'); proba('429: платформа видит RATE_LIMIT, не переполнение', z.chunk?.reason?.failure?.code === 'RATE_LIMIT', JSON.stringify(z.chunk?.reason?.failure)) }
{ const z = await zapros('uspeh'); proba('успешный ответ: без ошибки', z.finish === 'ok', JSON.stringify(z)) }
srv.close(); rmSync(tmp, { recursive: true, force: true })
console.log(`итог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
