#!/usr/bin/env node
// RU: B-N-1695 (Искра, 06.10.2026): стенд СПИСКА ИНСТРУМЕНТОВ МОСТА НА ТОМ ЖЕ ДВИЖКЕ, ЧТО В ШЛЮЗЕ — не парсером SDK.
//     Почему так: движок Claude (бинарь claude-agent-sdk-linux-x64, Claude Code 2.1.289 в SDK 0.3.289) бракует ВЕСЬ ответ
//     tools/list, если хоть у одного инструмента inputSchema без верхнего «type: object» (замер 06.10: 1.3.32 ostrov_api
//     с oneOf на верхнем уровне → 48 прислано · 0 собрано, tools/list спрошен 4 раза). Стенд поднимает MCP-сервер так же,
//     как gateway.mjs:1097–1102 (Streamable HTTP, только name/description/inputSchema), и читает system/init движка.
//     Инструмент берётся из КОДА моста (ostrovApiTool() из src/ostrov-api.js), а не из переписанной схемы.
//     К модели не ходит: ключ поддельный, ANTHROPIC_BASE_URL — закрытый порт, HOME — временный; секреты не читаются.
//     Пробы: С1 зрячесть — два простых инструмента собраны 2/2; С2 различитель — те же + схема без type → 0 (иначе прибор
//     больше не видит класс: слепота); С3 предмет — простые + ostrov_api моста → собраны все.
//     Среда: STEND_MOST (каталог моста, умолчание /opt/varvara/plugins/dsh-tool-bridge), STEND_SHLYUZ (каталог шлюза с
//     sdk-runtime и @modelcontextprotocol/sdk, умолчание /opt/subscription-gateway-guest — шлюз Варвары).
//     Коды: 0 — всё собрано; 1 — движок отбросил список с инструментом моста ИЛИ во временном каталоге остался след (уборка);
//     2 — слепота (нет движка/инструмента, init не пришёл, различитель не сработал).
//     УБОРКА (B-N-1799, 07.10.2026): движок дописывал .claude/.cache в HOME уже ПОСЛЕ rmSync — abort не ждёт выхода процесса
//     CLI (замер 07.10: 3 прогона → 9 каталогов, по одному на запрос). Лечение: q.close() (SDK: «terminate the underlying process»)
//     и повторная уборка, пока каталог не пропадёт на 1 с подряд (предел 15 с). Проверка — отдельно, в конце: через 2 с после
//     трёх запросов каталоги не существуют; остался хоть один — строка «❌ уборка» и код 1 (на путях слепоты — не проверяется).
//     ЧЕГО НЕ ЛОВИТ: остальные ~47 инструментов платформы (их схемы рождает платформа, не мост; в стенде их нет), правила
//     самой модели/API к схеме (сюда запросы не идут), что живой процесс загрузил ту же версию моста (это — строка
//     «[dsh-tool-bridge X]» в журнале службы после подъёма).
// EN: B-N-1695 stand: the bridge tool list checked by the gateway's own engine, not the SDK parser.
import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const MOST = process.env.STEND_MOST || '/opt/varvara/plugins/dsh-tool-bridge';
const SHLYUZ = process.env.STEND_SHLYUZ || '/opt/subscription-gateway-guest';
const slepo = (t) => { console.log('СЛЕПОТА: ' + t); process.exit(2); };
const vse = [];
const pauza = (ms) => new Promise(r => setTimeout(r, ms));
async function ubrat(dir) {
  const do_ = Date.now() + 15000; let tiho = 0;
  while (Date.now() < do_) {
    fs.rmSync(dir, { recursive: true, force: true });
    await pauza(250);
    if (fs.existsSync(dir)) { tiho = 0; continue; }
    if (++tiho >= 4) return;
  }
}
let Server, StreamableHTTPServerTransport, ListToolsRequestSchema, CallToolRequestSchema, query, tool;
try {
  ({ Server } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js`));
  ({ StreamableHTTPServerTransport } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js`));
  ({ ListToolsRequestSchema, CallToolRequestSchema } = await import(`${SHLYUZ}/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js`));
  ({ query } = await import(`${SHLYUZ}/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`));
} catch (e) { slepo(`движок/MCP шлюза не загружены из ${SHLYUZ}: ${String(e?.message ?? e).slice(0, 160)}`); }
try { const m = await import(path.join(MOST, 'src/ostrov-api.js')); const t = m.ostrovApiTool({}, {}); tool = { name: t.name, description: t.description, inputSchema: t.parameters }; }
catch (e) { slepo(`инструмент ostrov_api не собран из ${MOST}: ${String(e?.message ?? e).slice(0, 160)}`); }
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-mcp-dvizhok-')); vse.push(home);
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
  let out = null; let q = null;
  try {
    q = query({ prompt: 'x', options: { abortController: ac, cwd: home, maxTurns: 1,
      mcpServers: { dsh: { type: 'http', url: `http://127.0.0.1:${srv.address().port}/mcp`, alwaysLoad: true } },
      env: { PATH: process.env.PATH, HOME: home, ANTHROPIC_API_KEY: 'sk-ant-poddelnyj-ne-klyuch', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', CLAUDE_CONFIG_DIR: path.join(home, '.claude') } } });  // vorota-ob:dopusk=TOKEN
    for await (const m of q) {
      if (m.type === 'system' && m.subtype === 'init') {
        out = { sobrano: (m.tools ?? []).filter(x => String(x).startsWith('mcp__dsh__')).length, sprosili };
        ac.abort(); break;
      }
    }
  } catch {} finally { clearTimeout(t); try { q?.close(); } catch {} srv.close(); await ubrat(home); }
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
await pauza(2000); const ostatki = vse.filter(d => fs.existsSync(d));
if (ostatki.length) { console.log(`  ❌ уборка: временных каталогов осталось ${ostatki.length} из 3: ${ostatki.join(' ')}`); console.log('итог: 1'); process.exit(1); }
console.log('  ✅ уборка: временных каталогов осталось 0 из 3');
console.log('итог: 0');
process.exit(0);
