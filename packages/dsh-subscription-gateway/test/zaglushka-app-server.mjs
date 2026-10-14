#!/usr/bin/env node
// RU: Проверка zaglushka-app-server: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: zaglushka-app-server verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import { appendFileSync } from 'node:fs';
const Z = (process.env.STUB_ZANYATO ?? '546311,609282,651466,700000,780000,860000,910000,300000').split(',').map(Number);
const SC = process.env.STUB_SCENARIJ ?? 'rastet', ZH = process.env.STUB_ZHURNAL, PREDEL = Number(process.env.STUB_PREDEL_CODEX ?? 909118);
const SHAG = Number(process.env.STUB_SHAG_MS ?? 150);
const zap = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const zh = (s) => { if (ZH) appendFileSync(ZH, s + '\n'); };
let buf = '', steer = null, thread = 'nit-' + process.pid, turn = 'hod-1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let prervano = false;
const PODMENA = { method: 'model/rerouted', params: { threadId: thread, turnId: turn, fromModel: 'gpt-6-astra', toModel: 'gpt-6-mini', reason: 'highRiskCyberActivity' } };
const chuzhoj = (id) => zap({ method: 'item/completed', params: { threadId: thread, turnId: turn, completedAtMs: Date.now(), item: { id, type: 'agentMessage', text: 'ОТВЕТ ЧУЖОЙ МОДЕЛИ ' + id } } });
async function hod() {
  zap({ method: 'turn/started', params: { threadId: thread, turn: { id: turn, status: 'inProgress', items: [] } } });
  for (let i = 0; i < Z.length; i++) {
    if (prervano) { zap({ method: 'turn/completed', params: { threadId: thread, turn: { id: turn, status: 'interrupted', items: [] } } }); zh('turn/completed interrupted'); return; }
    if (SC.startsWith('podmena') && i === 1 && SC !== 'podmena-rano') { PODMENA.params.threadId = thread; zap(PODMENA); zh('-> model/rerouted'); await sleep(SHAG); }
    if (SC.startsWith('podmena') && i >= 1) { chuzhoj('c' + i); await sleep(SHAG); continue; }
    const z = Z[i];
    if (SC === 'task-control') {
      if (i === 0) await sleep(SHAG);
      zap({method:'item/started',params:{threadId:thread,turnId:turn,item:{id:'i'+i,type:'commandExecution',command:'fixture',status:'inProgress'}}});
    }
    zap({ method: 'thread/tokenUsage/updated', params: { threadId: thread, turnId: turn, tokenUsage: { last: { inputTokens: z, cachedInputTokens: 0, outputTokens: 100, reasoningOutputTokens: 0, totalTokens: z + 100 }, total: { inputTokens: z * 9, cachedInputTokens: 0, outputTokens: 900, reasoningOutputTokens: 0, totalTokens: z * 9 + 900 }, modelContextWindow: 921818 } } });
    if (SC === 'bez-granicy' && i === 2)
     { await sleep(Number(process.env.STUB_BEZ_GRANICY_MS ?? 2500)); }
    else await sleep(SHAG);
    if (steer && SC !== 'ne-slushaet' && SC !== 'task-control') {
      zap({ method: 'item/completed', params: { threadId: thread, turnId: turn, completedAtMs: Date.now(), item: { id: 'i-itog', type: 'agentMessage', text: 'Итог: сделано шаги 1–' + i + ', осталось: шаг ' + (i + 1) + ' и дальше. Следующий шаг — ' + (i + 1) + '.' } } });
      zap({ method: 'turn/completed', params: { threadId: thread, turn: { id: turn, status: 'completed', items: [] } } }); zh('turn/completed после steer'); return;
    }
    if (z >= PREDEL) { zap({ method: 'item/completed', params: { threadId: thread, turnId: turn, completedAtMs: Date.now(), item: { id: 'i-c' + i, type: 'contextCompaction' } } }); zh('contextCompaction'); continue; }
    zap({ method: 'item/completed', params: { threadId: thread, turnId: turn, completedAtMs: Date.now(), item: { id: 'i' + i, type: 'commandExecution', command: 'shag ' + i, commandActions: [], cwd: '/', status: 'completed' } } });
  }
  zap({ method: 'item/completed', params: { threadId: thread, turnId: turn, completedAtMs: Date.now(), item: { id: 'i-kon', type: 'agentMessage', text: 'Готово целиком.' } } });
  zap({ method: 'turn/completed', params: { threadId: thread, turn: { id: turn, status: 'completed', items: [] } } }); zh('turn/completed без steer');
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (s) => {
  buf += s; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
    const m = JSON.parse(line); zh('<- ' + m.method + (m.method === 'turn/steer' ? ' ' + JSON.stringify(m.params) : ''));
    if (m.method === 'initialize') zap({ id: m.id, result: { userAgent: 'zaglushka' } });
    else if (m.method === 'thread/start') zap({ id: m.id, result: { thread: { id: thread } } });
    else if (m.method === 'thread/resume') { thread = m.params.threadId; zap({ id: m.id, result: { thread: { id: thread } } }); }
    else if (m.method === 'turn/start') {
      if (SC === 'podmena-rano') { PODMENA.params.threadId = thread; zap(PODMENA); zh('-> model/rerouted (до ответа turn/start)'); }
      zap({ id: m.id, result: { turn: { id: turn, status: 'inProgress', items: [] } } }); hod();
    }
    else if (m.method === 'turn/steer') {
      if (SC === 'otkaz-steer') { zh('steer отказан заглушкой'); zap({ id: m.id, error: { code: -32000, message: 'заглушка: steer отказан' } }); }
      else if (m.params.expectedTurnId !== turn) zap({ id: m.id, error: { code: -32000, message: 'expectedTurnId не совпал' } });
      else { steer = m.params; zap({ id: m.id, result: { turnId: turn } }); }
    } else if (m.method === 'turn/interrupt') {
      zh('!!! INTERRUPT ' + JSON.stringify(m.params));
      if (SC === 'podmena-otkaz') zap({ id: m.id, error: { code: -32000, message: 'заглушка: interrupt отказан' } });
      else { prervano = true; zap({ id: m.id, result: {} }); }
    }
    else if (m.id !== undefined) zap({ id: m.id, error: { code: -32601, message: 'заглушка не знает ' + m.method } });
  }
});
process.stdin.on('end', () => process.exit(0));
