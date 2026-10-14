import {installFixtureIngress} from './fixture-ingress.mjs';
installFixtureIngress();
// RU: stend-povtora: проверяет соответствующий контракт настоящего адаптера на контролируемом HTTP/платформенном входе. При недоступной платформе результат не подтверждает работоспособность; live credentials не используются.
// EN: stend-povtora: tests the actual adapter contract against controlled HTTP/platform inputs. Missing platform prerequisites cannot certify functionality; no live credentials are used.


import http from 'node:http'
import net from 'node:net'
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
const tmp = vremennyj(join(tmpdir(), 'stend-povtora-'))
symlinkSync(join(APP, 'node_modules'), join(tmp, 'node_modules'))
const LLM = join(APP, 'node_modules/@deepseek-ai/dsh-llm/lib/index.js')
mkdirSync(join(tmp, 'lib'))
writeFileSync(join(tmp, 'package.json'), readFileSync(join(APP, 'node_modules/@deepseek-ai/dsh-llm/package.json')))
writeFileSync(join(tmp, 'lib', 'dsh-llm-kopiya.mjs'), readFileSync(LLM, 'utf8') + '\nexport { adapterFailureChunk };\n')
const { adapterFailureChunk, resolveRetryPolicy } = await import(pathToFileURL(join(tmp, 'lib', 'dsh-llm-kopiya.mjs')))
const retry = await import(pathToFileURL(join(APP, 'node_modules/@deepseek-ai/dsh-llm-retry/lib/index.js')))
const { apply } = await import(pathToFileURL(SRC))

const potok = (res, ...sob) => { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); for (const o of sob) res.write(JSON.stringify(o) + '\n') }
const srv = http.createServer((req, res) => {
  if(req.url.endsWith('/health')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai'}));return;}
  const rezhim = req.url.split('/')[1]
  if (rezhim === 'limit') { res.writeHead(429); return res.end('rate limited') }
  if (rezhim === 'tokena-net') { res.writeHead(503); return res.end('{"error":{"type":"no_credential","message":"нет подписочного токена"}}') }
  if (rezhim === 'avtorizaciya') { res.writeHead(401); return res.end('{"error":"мост: неверный пропуск"}') }
  if (rezhim === 'http-400') { res.writeHead(400); return res.end('{"error":"тело не разобрано"}') }
  if (rezhim === 'sbros') return req.socket.destroy()
  if (rezhim === 'potok-529') { potok(res, { type: 'usage', inputTokens: 1, outputTokens: 1 }, { type: 'error', message: 'Claude Code returned an error result: API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.' }); return res.end() }
  if (rezhim === 'potok-kvota') { potok(res, { type: 'error', message: "Claude Code returned an error result: You've hit your session limit · resets 3am (UTC)" }); return res.end() }
  if (rezhim === 'potok-perepolnenie') { potok(res, { type: 'error', message: 'Prompt is too long: 1012345 tokens > 1000000 maximum' }); return res.end() }
  if (rezhim === 'obryv') { potok(res, { type: 'text', text: 'нача' }); return setTimeout(() => req.socket.destroy(), 20) }
  if (rezhim === 'bez-gotovo') { potok(res, { type: 'text', text: 'ok' }); return res.end() }
  potok(res, { type: 'text', text: 'ok' }, { type: 'usage', inputTokens: 5, outputTokens: 1 }, { type: 'done' }); res.end()
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const port = srv.address().port

const zakrytyj = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })

let adapter
async function zapros(baseURL, signal) {
  const ctx = { llm: { registerAdapter: (_p, a) => { adapter = a; return () => {} } }, get: () => undefined, on: () => () => {}, logger: { info() {}, warn() {} } }
  const err0 = console.error; console.error = () => {}
  try { apply(ctx, { baseURL }) } finally { console.error = err0 }
  try { for await (const _ of adapter.stream({ model: 'm', messages: [], signal })) {} ; return { finish: 'ok' } }
  catch (e) { return { thrown: e, chunk: adapterFailureChunk(e, signal) } }
}

const H = {}

const PROEKCII = {}
const sessionProjections = {
  register: (d) => { PROEKCII[d.key] = d; return () => {} },
  stateOf: (session, key) => (session?.events ?? []).reduce((st, e) => PROEKCII[key].apply(st, e), PROEKCII[key].init()),
}
retry.apply({ on: (n, f) => { H[n] = f; return () => {} }, effect: () => {}, logger: { warn() {} }, sessionProjections }, {})
async function povtor(failure) {
  const policy = adapter.providerRetryPolicy('claude-oauth') ?? resolveRetryPolicy(undefined, 'stend')
  const agent = { session: { events: [], append(type, data) { this.events.push({ type, data }) } } }
  const itog = await H['agent/request-error']({ agent, turn: 1, step: 1, provider: 'claude-oauth', failure, retryPolicy: policy, signal: new AbortController().signal }, () => 'NEXT')
  return { itog: itog?.kind ?? itog, sobytiya: agent.session.events.map((e) => e.type), policy }
}

let vsego = 0, bed = 0
const proba = (imya, ok, pochemu) => { vsego++; if (ok) console.log(`✅ ${imya}`); else { bed++; console.log(`❌ ${imya}: ${pochemu}`) } }

{ const z = await zapros(`http://127.0.0.1:${port}/uspeh`); const p = adapter.providerRetryPolicy('claude-oauth') ?? resolveRetryPolicy(undefined, 'stend')
  proba('успех: без ошибки; политика маршрута — умолчание платформы (RATE_LIMIT и TRANSPORT в числе повторяемых)', z.finish === 'ok' && p.mode === 'normal' && p.retryableCodes.includes('RATE_LIMIT') && p.retryableCodes.includes('TRANSPORT'), JSON.stringify({ z, p })) }

for (const [imya, url, kod] of [['закрытый порт (ECONNREFUSED)', `http://127.0.0.1:${zakrytyj}/x`, 'TRANSPORT'], ['HTTP 429 до потока', `http://127.0.0.1:${port}/limit`, 'RATE_LIMIT']]) {
  const z = await zapros(url); const f = z.chunk?.reason?.failure; const v = await povtor(f)
  proba(`${imya}: платформа видит ${kod}`, f?.code === kod, JSON.stringify(f))
  proba(`${imya}: dsh-llm-retry повторяет (llm/retry, retry)`, v.itog === 'retry' && v.sobytiya.join() === 'llm/retry,llm/retry-started', JSON.stringify({ itog: v.itog, s: v.sobytiya }))
}

for (const [imya, rezhim, staryjKod] of [
  ['сброс ПОСЛЕ доставки, до заголовков', 'sbros', 'REQUEST_FAILED'],
  ['529 внутри хода (в потоке)', 'potok-529', 'GATEWAY_ERROR'],
  ['лимит подписки (в потоке)', 'potok-kvota', 'GATEWAY_ERROR'],
  ['обрыв в потоке', 'obryv', 'REQUEST_FAILED'],
  ['поток без «готово»', 'bez-gotovo', 'INCOMPLETE_STREAM'],
  ['503 нет токена', 'tokena-net', 'GATEWAY_NO_CREDENTIAL'],
  ['401', 'avtorizaciya', 'INVALID_CREDENTIAL'],
  ['400', 'http-400', 'REQUEST_FAILED'],
]) {
  const z = await zapros(`http://127.0.0.1:${port}/${rezhim}`); const f = z.chunk?.reason?.failure; const v = await povtor(f)
  proba(`${imya}: прежний Error ${staryjKod}, платформа — ${f?.code}, повтора нет`, z.thrown?.constructor === Error && z.thrown.code === staryjKod && !['TRANSPORT', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'EMPTY_RESPONSE'].includes(f?.code) && v.itog === 'NEXT' && v.sobytiya.length === 0,
    JSON.stringify({ cls: z.thrown?.constructor?.name, code: z.thrown?.code, f, v: v.itog }))
}
{ const z = await zapros(`http://127.0.0.1:${port}/potok-perepolnenie`); const f = z.chunk?.reason?.failure; const v = await povtor(f)
  proba('переполнение: по-прежнему CONTEXT_WINDOW_EXCEEDED (0.1.2), повтором не берётся', f?.code === 'CONTEXT_WINDOW_EXCEEDED' && v.itog === 'NEXT', JSON.stringify({ f, v: v.itog })) }
{ const ac = new AbortController(); ac.abort(); const z = await zapros(`http://127.0.0.1:${zakrytyj}/x`, ac.signal)
  proba('остановка (signal) — не TRANSPORT: прежний Error ABORTED, исход aborted', z.thrown?.constructor === Error && z.thrown.code === 'ABORTED' && z.chunk?.reason?.kind === 'aborted', JSON.stringify({ cls: z.thrown?.constructor?.name, code: z.thrown?.code, k: z.chunk?.reason?.kind })) }
srv.close(); rmSync(tmp, { recursive: true, force: true })
console.log(`итог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
