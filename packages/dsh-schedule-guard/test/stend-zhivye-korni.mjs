// Живые корни под надзором — на НАСТОЯЩЕМ apply из src/index.js (04.10.2026).
// Платформа испускает agent/created один раз, при создании агента; плагин, поднятый на живом узле, обязан
// сам обойти ctx.agents.roots(). Подставлены только ctx, агенты (журнал сессии) и канал уведомления.
// Ждём: К1 корень, живший до apply (agent/created не было) — обработчик простоя повешен и предел срабатывает;
// К2 тот же корень и затем его agent/created — обработчик повешен ровно один раз;
// К3 apply дважды (cordis пересобирает) с тем же живым корнем — ровно один раз;
// К4 дочерний агент (не корень) пришёл через agent/created — не взят (страж фильтра корней).
// Вызов: DSH_TEST_APP=<корень платформы> node test/stend-zhivye-korni.mjs [путь-к-предмету]
// Коды: 0 — всё сошлось; 1 — расхождение (названо); 2 — СЛЕПОТА: предмет не загрузился, проверено ничего.
// ⚠️ Каждый вызов предмета грузит его заново (свой стол): защита от повтора живёт на уровне модуля,
// и общий модуль между пробами перенёс бы её состояние из пробы в пробу.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAKET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(PAKET, 'src/index.js'));
const APP = process.env.DSH_TEST_APP;
const slepota = (prichina) => { console.log(`СЛЕПОТА: ${prichina} — предмет ${SRC} не проверен`); process.exit(2); };
if (!APP) slepota('не задан DSH_TEST_APP (корень платформы с node_modules)');
if (!fs.existsSync(path.join(APP, 'node_modules'))) slepota(`нет ${APP}/node_modules`);

const STOL = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-zhivye-korni-'));
process.env.DSH_HOME = STOL;   // файл снятых сторожа — в стол, не в боевой дом dsh
process.on('exit', () => fs.rmSync(STOL, { recursive: true, force: true }));
let nomer = 0;
async function zagruzit() {
  const d = path.join(STOL, `m${++nomer}`);
  try {
    fs.mkdirSync(d);
    fs.copyFileSync(SRC, path.join(d, 'predmet.js'));
    fs.copyFileSync(path.join(PAKET, 'package.json'), path.join(d, 'package.json'));
    fs.symlinkSync(path.join(APP, 'node_modules'), path.join(d, 'node_modules'));
    return (await import(pathToFileURL(path.join(d, 'predmet.js')).href)).apply;
  } catch (e) { slepota(`не загружается: ${e?.code || e?.message}`); }
}

const KANAL = path.join(STOL, 'kanal.sh');
const PISMA = path.join(STOL, 'pisma.txt');
fs.writeFileSync(KANAL, `#!/bin/sh\ncat > /dev/null\necho pismo >> "${PISMA}"\n`, { mode: 0o755 });
const pisem = () => (fs.existsSync(PISMA) ? fs.readFileSync(PISMA, 'utf8').split('\n').filter(Boolean).length : 0);

const seychas = Date.now();
const ISO = new Date(seychas).toISOString();
const para = (i) => [
  { type: 'schedule/change', data: { version: 1, operation: 'create', schedule: { id: `s${i}`, kind: 'after', prompt: 'proba', afterSeconds: 60, scheduledAt: ISO } }, time: seychas },
  { type: 'schedule/change', data: { version: 1, operation: 'dispatch', id: `s${i}` }, time: seychas },
];
const PREVYSHEN = Array.from({ length: 7 }, (_, i) => para(i)).flat();      // 7 пробуждений подряд > 6

// Агент считает, сколько раз ему повесили обработчик простоя: перезапись в словарь прятала бы второй.
function agentNovyj(id) {
  const agent = { session: { id, events: PREVYSHEN, append() {} }, statusov: [], ctx: null };
  agent.ctx = { effect() {}, on(ev, fn) { if (ev === 'agent/status') agent.statusov.push(fn); }, tools: { register() { return () => {}; } } };
  return agent;
}
function ctxNovyj(korni) {
  const hooks = {};
  return { hooks, ctx: { on(ev, fn) { hooks[ev] = fn; }, agents: { roots: () => korni, withoutInitiator: (fn) => fn() },
    sessions: { flush: async () => {} }, schedule: { list: async () => [], delete: async () => ({ deleted: true }) } } };
}
const tiho = (f) => { const w = process.stderr.write.bind(process.stderr); const z = [];
  process.stderr.write = (s) => { z.push(String(s)); return true; };
  try { f(); } finally { process.stderr.write = w; } return z.join(''); };

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++;
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло значение — пробы говорят только исключением'); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 160)); } };

try {
  await proba('К1 корень жил до apply, agent/created не было — обработчик простоя повешен, предел срабатывает', async () => {
    const apply = await zagruzit(); const a = agentNovyj('k1'); const { ctx } = ctxNovyj([a]);
    const z = tiho(() => apply(ctx, { notifyCmd: KANAL }));
    if (a.statusov.length !== 1) throw new Error(`обработчиков простоя ${a.statusov.length}, ждали 1 — живой корень без надзора`);
    if (!z.includes('жила до подъёма плагина')) throw new Error('подъём не назвал взятую живую сессию');
    fs.rmSync(PISMA, { force: true });
    const zh = []; const w = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s) => { zh.push(String(s)); return true; };
    try { a.statusov[0]({ status: 'idle' }); await new Promise((r) => setImmediate(r)); } finally { process.stderr.write = w; }
    if (!zh.join('').includes('предел автономных пробуждений')) throw new Error('предел не сработал на взятом корне');
    if (pisem() !== 1) throw new Error(`писем ${pisem()}, ждали 1`);
  });
  await proba('К2 живой корень, затем его agent/created — обработчик повешен ровно один раз', async () => {
    const apply = await zagruzit(); const a = agentNovyj('k2'); const { ctx, hooks } = ctxNovyj([a]);
    tiho(() => { apply(ctx, {}); if (typeof hooks['agent/created'] !== 'function') throw new Error('apply не повесил agent/created'); hooks['agent/created']({ agent: a }); });
    if (a.statusov.length !== 1) throw new Error(`обработчиков простоя ${a.statusov.length}, ждали 1`);
  });
  await proba('К3 apply дважды (пересборка cordis) с тем же живым корнем — ровно один раз', async () => {
    const apply = await zagruzit(); const a = agentNovyj('k3');
    tiho(() => { apply(ctxNovyj([a]).ctx, {}); apply(ctxNovyj([a]).ctx, {}); });
    if (a.statusov.length !== 1) throw new Error(`обработчиков простоя ${a.statusov.length}, ждали 1`);
  });
  await proba('К4 дочерний агент (не корень) пришёл через agent/created — не взят', async () => {
    const apply = await zagruzit(); const koren = agentNovyj('k4'); const doch = agentNovyj('k4-doch');
    const { ctx, hooks } = ctxNovyj([koren]);
    tiho(() => { apply(ctx, {}); hooks['agent/created']?.({ agent: koren }); hooks['agent/created']?.({ agent: doch }); });
    if (doch.statusov.length !== 0) throw new Error(`дочернему повешено ${doch.statusov.length}`);
    if (koren.statusov.length !== 1) throw new Error(`корню повешено ${koren.statusov.length}, ждали 1 (проба слепа без корня)`);
  });
} catch (e) { slepota(`стенд упал: ${e?.message}`); }
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
