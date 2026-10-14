// RU: B-N-1899 — гигиена окружения движка (НЕ защита). Поднимает ДАННЫЙ gateway.mjs (довод 2) в копии каталога шлюза (довод 1,
// RU: по умолчанию — каталог пакета, в котором лежит стенд; рядом нужен слой sdk-runtime) с НАСТОЯЩИМ движком против подставного API Anthropic, подставного OMEGA
// RU: и подставного моста. Ход: Bash (печатает имена env и ищет токен в /proc родителя) → инструмент моста → конец.
// RU: Печатает JSON итога; суд — по доводу 3: «kand» (ждём гигиену) или «osnova» (ждём прежнее поведение).
// RU: НЕ ПРОВЕРЯЕТ: живую подписку, файл токена по ACL, sudo, /proc/<шлюз>/environ — их правка и не закрывает.
import http from 'node:http'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const KAT0 = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..')); const GWF = path.resolve(process.argv[3] || path.join(KAT0, 'gateway.mjs')); const ZHDEM = process.argv[4] || 'kand';
// по умолчанию KAT0 — свой каталог пакета (как соседние Claude-стенды); слой SDK — см. ниже
const TOKEN = 'sk-ant-oat01-poddelnyj-proba-b1899'; const OMEGA_KEY = 'omega-proba-klyuch-b1899';  // vorota-ob:dopusk=TOKEN
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'b1899-')); const KAT = path.join(T, 'kat'); fs.mkdirSync(KAT);
// RU: Слой SDK: рядом с пакетом, если читается этой учёткой; иначе — раскладка гостя (читается всем, тот же слой; ссылка sdk-runtime
// RU: дерева ведёт в /opt/claude-oauth — 750, iskra его не читает). Переопределить — STEND_SDK=<каталог sdk-runtime>. Выбор печатается.
const sdkRyadom = path.join(KAT0, 'sdk-runtime'); let SDK = process.env.STEND_SDK || sdkRyadom;
if (!process.env.STEND_SDK) { try { fs.accessSync(path.join(sdkRyadom, 'node_modules'), fs.constants.R_OK | fs.constants.X_OK); } catch { SDK = '/opt/subscription-gateway-guest/sdk-runtime'; } }
console.log(`слой SDK: ${fs.realpathSync(SDK)}${SDK === sdkRyadom ? ' (рядом с пакетом)' : ' (рядом не читается — взят из раскладки гостя или STEND_SDK)'}`);
for (const e of fs.readdirSync(KAT0)) if (e !== 'gateway.mjs' && e !== 'sdk-runtime') fs.symlinkSync(path.join(KAT0, e), path.join(KAT, e));
fs.symlinkSync(SDK, path.join(KAT, 'sdk-runtime'));
fs.copyFileSync(GWF, path.join(KAT, 'gateway.mjs'));
const HOME = path.join(T, 'home'), YA = path.join(T, 'yashchik'), WORK = path.join(T, 'work'); for (const d of [HOME, YA, WORK]) fs.mkdirSync(d);
const TOKEN_FILE = path.join(T, 'token'); fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 }); // синтетический, только для подставного API
const INGRESS_FILE = path.join(T, 'ingress'); const INGRESS_KEY = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(INGRESS_FILE, INGRESS_KEY, { mode: 0o600 });
const itog = { gateway: crypto.createHash('sha256').update(fs.readFileSync(GWF)).digest('hex').slice(0, 16), apiAuth: [], omegaAuth: [], mostVyzovov: 0, dvizhok: null, bash: null, hod: null, zhurnal: [] };
const listen = (s) => new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s.address().port)));
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => ok(b)); });
const sse = (res, ev) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); for (const e of ev) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); res.end(); };
const otvet = (start, delta, stop) => [{ type: 'message_start', message: { id: 'msg_p', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: start }, { type: 'content_block_delta', index: 0, delta }, { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }, { type: 'message_stop' }];
const BASH = 'echo "ENV:$(env | cut -d= -f1 | grep -E \'^(GATEWAY_|CLAUDE_CODE_OAUTH|OMEGA_)\' | sort | tr \'\\n\' \' \')"; echo "PPID_TOKEN:$(tr \'\\0\' \'\\n\' < /proc/$PPID/environ 2>/dev/null | grep -c poddelnyj)"; echo "FD3:$( (cat <&3) 2>/dev/null | grep -c poddelnyj)"';
let gwPid = 0;
function najtiDvizhok() { // потомок шлюза = движок; читаем его environ той же учёткой
  for (const p of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
      if (ppid === gwPid) { const env = fs.readFileSync(`/proc/${p}/environ`, 'utf8').split('\0'); return { pid: Number(p), token: env.filter((x) => x.includes('poddelnyj')).length,
        fd: env.filter((x) => x.startsWith('CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR=')).length, gateway: env.map((x) => x.split('=')[0]).filter((k) => k.startsWith('GATEWAY_')).sort() }; } } catch {} }
  return null; }
const api = http.createServer(async (req, res) => { const raw = await body(req);
  if (!(req.method === 'POST' && req.url.startsWith('/v1/messages')) || req.url.includes('count_tokens')) { res.writeHead(req.url.includes('count_tokens') ? 200 : 404, { 'content-type': 'application/json' }); res.end(req.url.includes('count_tokens') ? '{"input_tokens":10}' : '{}'); return; }
  itog.apiAuth.push(String(req.headers.authorization || req.headers['x-api-key'] || '').includes(TOKEN));
  const b = JSON.parse(raw || '{}'); const tekst = JSON.stringify(b.messages ?? []);
  if (!itog.dvizhok) itog.dvizhok = najtiDvizhok();
  const most = (b.tools ?? []).find((t) => String(t.name).endsWith('rabota_proba')); const estBash = (b.tools ?? []).some((t) => t.name === 'Bash');
  let ev;
  if (!tekst.includes('ENV:') && estBash) ev = otvet({ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: {} }, { type: 'input_json_delta', partial_json: JSON.stringify({ command: BASH, description: 'проба B-N-1899' }) }, 'tool_use');
  else if (most && !tekst.includes('сделано')) ev = otvet({ type: 'tool_use', id: 'toolu_most', name: most.name, input: {} }, { type: 'input_json_delta', partial_json: '{}' }, 'tool_use');
  else ev = otvet({ type: 'text', text: '' }, { type: 'text_delta', text: 'готово' }, 'end_turn');
  if (tekst.includes('ENV:') && !itog.bash) { const m = tekst.match(/ENV:([^"\\]*)\\n?PPID_TOKEN:(\d+)\\n?FD3:(\d+)/) || tekst.match(/ENV:(.*?)PPID_TOKEN:(\d+).*?FD3:(\d+)/);
    itog.bash = m ? { env: m[1].trim().split(/\s+/).filter(Boolean), ppidToken: Number(m[2]), fd3: Number(m[3]) } : { razbor: 'не разобран', kusok: tekst.slice(tekst.indexOf('ENV:'), tekst.indexOf('ENV:') + 300) }; }
  if (b.stream) sse(res, ev); else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); } });
const omega = http.createServer(async (req, res) => { await body(req); itog.omegaAuth.push(req.headers.authorization === 'Bearer ' + OMEGA_KEY); res.writeHead(404); res.end(); });
const most = http.createServer(async (req, res) => { await body(req); itog.mostVyzovov++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"value":"сделано"}'); });
const [pApi, pOmega, pMost] = [await listen(api), await listen(omega), await listen(most)];
const PORT = 20000 + Math.floor(Math.random() * 20000);
const env = { PATH: process.env.PATH, HOME, GATEWAY_POSTAVSHIK: 'anthropic', GATEWAY_PORT: String(PORT), GATEWAY_MCP_PORT: String(PORT + 1), GATEWAY_COMPACTION_MODULE: path.join(KAT, 'test/fixtures/compaction-module.mjs'),
  GATEWAY_TOKEN_FILE: TOKEN_FILE, GATEWAY_INGRESS_KEY_FILE: INGRESS_FILE, GATEWAY_WORK_DIR: WORK, GATEWAY_BAZA_SESSIJ: path.join(T, 'sessii.db'), GATEWAY_MAX_TURNS: '8', GATEWAY_YASHCHIK: YA,
  GATEWAY_MCP: JSON.stringify({ omega: { type: 'http', url: `http://127.0.0.1:${pOmega}/mcp`, headers: { Authorization: 'Bearer ${OMEGA_MCP_API_KEY}' } } }), OMEGA_MCP_API_KEY: OMEGA_KEY,
  KOMPAKT_AGENT: 'fixture-agent', ANTHROPIC_BASE_URL: `http://127.0.0.1:${pApi}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' };
const gw = spawn(process.execPath, [path.join(KAT, 'gateway.mjs')], { env, cwd: T, stdio: ['ignore', 'pipe', 'pipe'] }); gwPid = gw.pid;
const zh = (d) => { for (const s of String(d).split('\n')) if (s.trim()) itog.zhurnal.push(s.replace(/\[subscription-gateway [^\]]*\] /, '')); }; gw.stdout.on('data', zh); gw.stderr.on('data', zh);
const zhdatMs = (ms) => new Promise((r) => setTimeout(r, ms));
for (let t = Date.now(); Date.now() - t < 15000 && !itog.zhurnal.some((s) => s.includes('слушаю')); ) await zhdatMs(100);
const otv = await new Promise((ok) => { const r = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/agent-stream', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + INGRESS_KEY } },
  (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => ok(b)); }); r.on('error', (e) => ok('ОШИБКА ' + e.message)); r.setTimeout(120000, () => r.destroy(new Error('таймаут')));
  r.end(JSON.stringify({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'проба B-N-1899' }],
    bridge: { url: `http://127.0.0.1:${pMost}/invoke`, ticket: 'propusk-b1899', name: 'probadsh', tools: [{ name: 'rabota_proba', description: 'работа', inputSchema: { type: 'object', properties: {} } }] } })); });
const ev = otv.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
itog.hod = { sobytiya: ev.map((e) => e.type).join(','), oshibka: ev.find((e) => e.type === 'error')?.message?.slice(0, 200) ?? null };
gw.kill('SIGTERM'); for (let t = Date.now(); Date.now() - t < 5000 && gw.exitCode === null; ) await zhdatMs(100); api.close(); omega.close(); most.close(); fs.rmSync(T, { recursive: true, force: true });
itog.zhurnal = itog.zhurnal.filter((s) => /🔴|движок|ошибк/i.test(s)).map((s) => s.slice(0, 200)).slice(0, 6);
const d = itog.dvizhok ?? {}, bs = itog.bash ?? {}; const gwBash = (bs.env ?? []).filter((k) => k.startsWith('GATEWAY_'));
const svoistva = {
  'ход завершён': /done$/.test(itog.hod.sobytiya) && !itog.hod.oshibka,
  'движок взял токен (дошёл до API)': itog.apiAuth.length > 0 && itog.apiAuth.every(Boolean),
  'заголовок OMEGA дошёл': itog.omegaAuth.some(Boolean),
  'мост вызван': itog.mostVyzovov >= 1,
  'Bash: в env есть OMEGA_MCP_API_KEY': (bs.env ?? []).includes('OMEGA_MCP_API_KEY'),
  'Bash: из GATEWAY_* только GATEWAY_MOST_PROPUSK': gwBash.length === 1 && gwBash[0] === 'GATEWAY_MOST_PROPUSK',
  'Bash: нет CLAUDE_CODE_OAUTH_TOKEN в env': !(bs.env ?? []).includes('CLAUDE_CODE_OAUTH_TOKEN'),
  'токена нет в /proc/<движок>/environ': d.token === 0,
  'токена нет в /proc родителя Bash': bs.ppidToken === 0,
  'fd 3 в Bash пуст/закрыт': bs.fd3 === 0 };
const zhdat = ZHDEM === 'kand' ? Object.fromEntries(Object.keys(svoistva).map((k) => [k, true]))
  : { 'ход завершён': true, 'движок взял токен (дошёл до API)': true, 'заголовок OMEGA дошёл': true, 'мост вызван': true, 'Bash: в env есть OMEGA_MCP_API_KEY': true,
      'Bash: из GATEWAY_* только GATEWAY_MOST_PROPUSK': false, 'Bash: нет CLAUDE_CODE_OAUTH_TOKEN в env': true, 'токена нет в /proc/<движок>/environ': false, 'токена нет в /proc родителя Bash': false, 'fd 3 в Bash пуст/закрыт': true };
let plohih = 0; for (const [k, v] of Object.entries(svoistva)) { const ok = v === zhdat[k]; if (!ok) plohih++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k}: ${v} (ждали ${zhdat[k]})`); }
console.log('итог:', JSON.stringify({ gateway: itog.gateway, dvizhok: d, bash: bs, apiAuth: itog.apiAuth, omegaAuth: itog.omegaAuth.length, most: itog.mostVyzovov, hod: itog.hod, zhurnal: itog.zhurnal }).slice(0, 1200));
console.log(`ИТОГ [${ZHDEM}]: ${Object.keys(svoistva).length - plohih} из ${Object.keys(svoistva).length}`); process.exit(plohih ? 1 : 0);
