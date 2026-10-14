// Процессный стенд B-N-1776 такт 2: НАСТОЯЩИЙ шлюз (KAT0/gateway.mjs, развёрнутый каталог со слоем sdk-runtime) + настоящий
// SDK/CLI, подставной API на 127.0.0.1 отдаёт заголовки anthropic-ratelimit-unified-* → CLI выпускает rate_limit_event →
// шлюз пишет строки в приёмную (GATEWAY_LIMITY_VHOD — временный каталог). Токен синтетический, сети нет.
// Вызов: node stend-limity-process.mjs <развёрнутый каталог шлюза>. Код: 0 — все пробы, 1 — красная, 2 — слепота.
// ЧЕГО НЕ ЛОВИТ: настоящие заголовки Anthropic (их форма снята пробой А 07.10) · права боевой приёмной (tmpfiles.d dsh-limity).
import http from 'node:http'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import crypto from 'node:crypto';
const KAT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
if (!fs.existsSync(path.join(KAT, 'gateway.mjs')) || !fs.existsSync(path.join(KAT, 'sdk-runtime'))) { console.log(`СЛЕПОТА: ${KAT} — нет gateway.mjs или sdk-runtime`); process.exit(2); }
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-limity-proc-'));
const HOME = path.join(T, 'home'), VHOD = path.join(T, 'vhod'), TOKEN_FILE = path.join(T, 'token-podpiska-7'), INGRESS_FILE = path.join(T, 'ingress');
for (const d of [HOME, VHOD, path.join(T, 'work'), path.join(T, 'yashchik')]) fs.mkdirSync(d);
const INGRESS_KEY = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(INGRESS_FILE, INGRESS_KEY, { mode: 0o600 });
fs.writeFileSync(TOKEN_FILE, 'sk-ant-oat01-poddelnyj-proba', { mode: 0o600 }); // синтетический токен только для локального API · vorota-ob:dopusk=TOKEN
const SBROS5 = Math.floor(Date.now() / 1000) + 3600, SBROS7 = Math.floor(Date.now() / 1000) + 86400;
const ZAGOLOVKI = { 'anthropic-ratelimit-unified-status': 'allowed_warning', 'anthropic-ratelimit-unified-reset': String(SBROS7),
  'anthropic-ratelimit-unified-representative-claim': 'seven_day', 'anthropic-ratelimit-unified-5h-utilization': '0.42',
  'anthropic-ratelimit-unified-5h-reset': String(SBROS5), 'anthropic-ratelimit-unified-7d-utilization': '0.81', 'anthropic-ratelimit-unified-7d-reset': String(SBROS7) };
let zaprosovApi = 0;
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => ok(b)); });
const api = http.createServer(async (req, res) => { const raw = await body(req);
  if (!(req.method === 'POST' && req.url.startsWith('/v1/messages')) || req.url.includes('count_tokens')) {
    res.writeHead(req.url.includes('count_tokens') ? 200 : 404, { 'content-type': 'application/json' }); res.end(req.url.includes('count_tokens') ? '{"input_tokens":10}' : '{}'); return }
  zaprosovApi++; const b = JSON.parse(raw || '{}');
  const ev = [{ type: 'message_start', message: { id: 'msg_l', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'да' } },
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }, { type: 'message_stop' }];
  if (b.stream) { res.writeHead(200, { 'content-type': 'text/event-stream', ...ZAGOLOVKI }); for (const e of ev) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); res.end(); }
  else { res.writeHead(200, { 'content-type': 'application/json', ...ZAGOLOVKI }); res.end(JSON.stringify({ id: 'msg_l', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'да' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })); } });
const pApi = await new Promise((ok) => api.listen(0, '127.0.0.1', () => ok(api.address().port)));
const PORT_GW = 20000 + Math.floor(Math.random() * 20000);
const env = { PATH: process.env.PATH, HOME, GATEWAY_POSTAVSHIK: 'anthropic', GATEWAY_PORT: String(PORT_GW), GATEWAY_MCP_PORT: String(PORT_GW + 1),
  GATEWAY_COMPACTION_MODULE: path.join(KAT, 'test/fixtures/compaction-module.mjs'), GATEWAY_TOKEN_FILE: TOKEN_FILE, GATEWAY_INGRESS_KEY_FILE: INGRESS_FILE,
  GATEWAY_WORK_DIR: path.join(T, 'work'), GATEWAY_BAZA_SESSIJ: path.join(T, 'sessii.db'), GATEWAY_MAX_TURNS: '2', GATEWAY_YASHCHIK: path.join(T, 'yashchik'),
  KOMPAKT_AGENT: 'fixture-agent', GATEWAY_LIMITY_VHOD: VHOD,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${pApi}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' };
const zhurnal = [];
const gw = spawn(process.execPath, [path.join(KAT, 'gateway.mjs')], { env, cwd: T, stdio: ['ignore', 'pipe', 'pipe'] });
const zh = (d) => { for (const s of String(d).split('\n')) if (s.trim()) zhurnal.push(s.replace(/\[subscription-gateway [^\]]*\] /, '')) };
gw.stdout.on('data', zh); gw.stderr.on('data', zh);
const zhdatMs = (ms) => new Promise((r) => setTimeout(r, ms));
const zhdat = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await zhdatMs(100) } return false };
let proshlo = 0, vsego = 0;
const proba = (imya, ok, vyvod) => { vsego++; if (ok) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + ' | ' + JSON.stringify(vyvod).slice(0, 600)); };
const konec = async (kod) => { gw.kill('SIGTERM'); await zhdat(() => gw.exitCode !== null || gw.signalCode !== null, 5000); api.close(); fs.rmSync(T, { recursive: true, force: true }); process.exit(kod); };
console.log('предмет: ' + fs.realpathSync(path.join(KAT, 'gateway.mjs')));
if (!await zhdat(() => zhurnal.some((s) => s.includes('слушаю')), 20000)) { console.log('СЛЕПОТА: шлюз не поднялся: ' + zhurnal.slice(-5).join(' | ')); await konec(2); }
const otvet = await new Promise((ok) => { const r = http.request({ host: '127.0.0.1', port: PORT_GW, path: '/v1/agent-stream', method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + INGRESS_KEY } }, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => ok(b)) });
  r.on('error', (e) => ok('ОШИБКА ' + e.message)); r.end(JSON.stringify({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'ответь: да' }] })); });
await zhdat(() => zhurnal.some((s) => s.startsWith('лимиты:')), 3000);
if (zaprosovApi === 0) { console.log('СЛЕПОТА: ход не дошёл до подставного API — условие не создано: ' + otvet.slice(0, 300) + ' | ' + zhurnal.slice(-5).join(' | ')); await konec(2); }
const fajly = fs.readdirSync(VHOD), stroki = fajly.filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(VHOD, f), 'utf8')));
const po = (o) => stroki.find((s) => s.okno === o);
proba(`ход дошёл до API (запросов ${zaprosovApi}) и завершился`, /done/.test(otvet) || /"type":"text"/.test(otvet), otvet.slice(0, 300));
// CLI 0.3.289 ставит allowed_warning по порогам (surpassed-threshold), а не по заголовку unified-status: при status=allowed_warning
// без порога событие несёт «allowed» (замер стенда 07.10 17:49Z). Проверяемое свойство — status только у окна rateLimitType.
proba('в приёмной 2 файла: five_hour 0.42 (status null), seven_day 0.81 allowed; podpiska 7 из имени файла токена; .tmp нет',
  stroki.length === 2 && fajly.every((f) => !f.endsWith('.tmp')) && po('five_hour')?.dolya === 0.42 && po('five_hour')?.status === null
  && po('five_hour')?.sbros_utc === SBROS5 && po('seven_day')?.dolya === 0.81 && po('seven_day')?.status === 'allowed' && stroki.every((s) => s.podpiska === 7), { fajly, stroki });
proba('журнал шлюза: «лимиты: подписка 7 · five_hour 42% · seven_day 81% allowed → приёмная»',
  zhurnal.includes('лимиты: подписка 7 · five_hour 42% · seven_day 81% allowed → приёмная'), zhurnal.filter((s) => /лимит/.test(s)));
proba('в строках приёмной нет токена (ни синтетического значения, ни sk-ant)', !/sk-ant|poddelnyj/.test(JSON.stringify(stroki)), stroki);
console.log(`итог: ${proshlo} из ${vsego}`);
await konec(proshlo === vsego ? 0 : 1);
