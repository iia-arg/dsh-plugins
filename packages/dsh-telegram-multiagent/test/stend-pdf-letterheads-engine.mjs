#!/usr/bin/env node
// B-N-1701: Iskra engine-probe method adapted to actual defineTool(pdfTool).
// Controls: two valid schemas -> 2, invalid top-level schema -> 0, real PDF tool -> 3.
// Real gateway SDK/engine, temporary HOME, synthetic token, closed API port; no model/API call.
// Checks this PDF schema, not all platform tools or the deployed live process.
// Each control has a 60-second stop; temporary files are removed in finally.
import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url';
import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const MOST = fileURLToPath(new URL('../',import.meta.url));
const SHLYUZ = process.env.STEND_SHLYUZ || '/opt/subscription-gateway-guest';
const slepo = (t) => { console.log('СЛЕПОТА: ' + t); process.exit(2); };
let Server, StreamableHTTPServerTransport, ListToolsRequestSchema, CallToolRequestSchema, query, tool;
try {
  ({ Server } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js`));
  ({ StreamableHTTPServerTransport } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js`));
  ({ ListToolsRequestSchema, CallToolRequestSchema } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js`));
  ({ query } = await import(`${SHLYUZ}/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`));
} catch (e) { slepo(`движок/MCP шлюза не загружены из ${SHLYUZ}: ${String(e?.message ?? e).slice(0, 160)}`); }
try { const m = await import(path.join(MOST, 'src/pdf-tool.js')); const req=createRequire(process.env.DSH_TEST_APP+'/package.json'); const t=req('@deepseek-ai/dsh-tools').defineTool(m.pdfTool({config:{}})); tool = { name: t.name, description: t.description, inputSchema: t.parameters }; }
catch (e) { slepo(`инструмент telegram_make_pdf не собран из ${MOST}: ${String(e?.message ?? e).slice(0, 160)}`); }
const versiyaMosta = (() => { try { return JSON.parse(fs.readFileSync(path.join(MOST, 'package.json'), 'utf8')).version; } catch { return '?'; } })();

async function sobrat(tools) {
  let sprosili = 0;
  const srv = http.createServer(async (req, res) => {
    const mcp = new Server({ name: 'dsh-most', version: '0.1.0' }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => (sprosili++, {
      tools: tools.map(t => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? { type: 'object', properties: {} } })) }));
    mcp.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'нет' }] }));
    const tr = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { tr.close(); mcp.close(); });
    await mcp.connect(tr);
    let body = ''; for await (const c of req) body += c;
    await tr.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-mcp-dvizhok-'));
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
  let out = null;
  try {
    for await (const m of query({ prompt: 'x', options: { abortController: ac, cwd: home, maxTurns: 1,
      mcpServers: { dsh: { type: 'http', url: `http://127.0.0.1:${srv.address().port}/mcp`, alwaysLoad: true } },
      env: { PATH: process.env.PATH, HOME: home, ANTHROPIC_API_KEY: 'sk-ant-poddelnyj-ne-klyuch', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', CLAUDE_CONFIG_DIR: path.join(home, '.claude') } } })) {  // vorota-ob:dopusk=TOKEN
      if (m.type === 'system' && m.subtype === 'init') {
        out = { sobrano: (m.tools ?? []).filter(x => String(x).startsWith('mcp__dsh__')).length, sprosili };
        ac.abort(); break;
      }
    }
  } catch {} finally { clearTimeout(t); srv.close(); fs.rmSync(home, { recursive: true, force: true }); }
  return out;
}

const prostye = [{ name: 'read', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'list', description: 'List', inputSchema: { type: 'object', properties: {} } }];
console.log(`стенд списка моста на движке шлюза: мост ${MOST} (${versiyaMosta}), движок ${SHLYUZ}/sdk-runtime`);
const s1 = await sobrat(prostye);
if (!s1) slepo('С1: движок не прислал system/init — прибор не видит списка');
if (s1.sobrano !== 2) slepo(`С1: контрольные 2 простых собраны ${s1.sobrano} — прибор не годен`);
console.log(`  ✅ С1 зрячесть: простые собраны 2/2`);
const s2 = await sobrat([...prostye, { name: 'bez_type', description: 'без type', inputSchema: { description: 'нет type' } }]);
if (!s2 || s2.sobrano !== 0) slepo(`С2: схема без type НЕ уронила список (собрано ${s2?.sobrano}) — движок сменил правило, прибор не различает класс`);
console.log(`  ✅ С2 различитель: схема без type роняет весь список (0 из 3; tools/list спрошен ${s2.sprosili} раз)`);
const s3 = await sobrat([...prostye, tool]);
if (!s3) slepo('С3: system/init не пришёл');
if (s3.sobrano !== 3) { console.log(`  ❌ С3 предмет: с ${tool.name} моста ${versiyaMosta} движок собрал ${s3.sobrano} из 3 (tools/list ${s3.sprosili} раз) — весь мост у модели пропадёт`); console.log('итог: 1'); process.exit(1); }
console.log(`  ✅ С3 предмет: ${tool.name} моста ${versiyaMosta} — собраны 3 из 3`);
console.log('итог: 0');
process.exit(0);
