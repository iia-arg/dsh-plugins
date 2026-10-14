// Уведомление владельцу при остановке — на НАСТОЯЩЕМ обработчике простоя из src/index.js (B-H-105, 25.09.2026).
// Предмет грузится импортом и проходит через настоящий apply → 'agent/created' → agent.ctx.on('agent/status');
// подставлены только ctx, агент (журнал сессии) и канал уведомления. Своей копии логики здесь нет.
// Ждём: П1 предел превышен — одно письмо, повторный простой при том же превышении — писем не прибавилось;
// П2 канал отказал — письма нет, на следующем простое (канал починен) — письмо пришло;
// П3 пределы больше не превышены, затем снова превышены — второе письмо (одно на эпизод остановки);
// П4–П6 (04.10.2026) канал завис дольше notifyTimeoutSeconds — обработчик продолжает, отказ назван, в том же эпизоде
// канал больше не зовут (тревога одна), в новом эпизоде при живом канале письмо приходит.
// Вызов: DSH_TEST_APP=<корень платформы> node test/stend-uvedomleniya.mjs [путь-к-предмету]
// Коды: 0 — всё сошлось; 1 — расхождение (названо); 2 — СЛЕПОТА: предмет не загрузился, проверено ничего.
// ⚠️ Природа зелёного: зависимости предмета берутся из node_modules платформы DSH_TEST_APP симлинком.
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

const STOL = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-uvedomleniya-'));
process.env.DSH_HOME = STOL;   // B-N-1194: файл снятых сторожа — в стол, не в боевой дом dsh
process.on('exit', () => fs.rmSync(STOL, { recursive: true, force: true }));
try {
  fs.copyFileSync(SRC, path.join(STOL, 'predmet.js'));
  fs.copyFileSync(path.join(PAKET, 'package.json'), path.join(STOL, 'package.json'));
  fs.symlinkSync(path.join(APP, 'node_modules'), path.join(STOL, 'node_modules'));
} catch (e) { slepota(`стол не собран: ${e?.code || e?.message}`); }
let apply;
try { ({ apply } = await import(pathToFileURL(path.join(STOL, 'predmet.js')).href)); }
catch (e) { slepota(`не загружается: ${e?.code || e?.message}`); }

// Канал: при файле OTKAZ отказывает (код 1), иначе дописывает строку в PISMA — одно письмо = одна строка.
const KANAL = path.join(STOL, 'kanal.sh');
const PISMA = path.join(STOL, 'pisma.txt');
const OTKAZ = path.join(STOL, 'otkaz');
fs.writeFileSync(KANAL, `#!/bin/sh\n[ -e "${OTKAZ}" ] && exit 1\ncat > /dev/null\necho pismo >> "${PISMA}"\n`, { mode: 0o755 });
// Зависающий канал: при файле ZAVIS спит 20 с (exec — SIGKILL достаётся самому sleep, сирот нет), иначе пишет письмо.
const ZAVIS = path.join(STOL, 'zavis');
const KANAL_ZAVIS = path.join(STOL, 'kanal-zavis.sh');
fs.writeFileSync(KANAL_ZAVIS, `#!/bin/sh\n[ -e "${ZAVIS}" ] && exec sleep 20\ncat > /dev/null\necho pismo >> "${PISMA}"\n`, { mode: 0o755 });
const pisem = () => (fs.existsSync(PISMA) ? fs.readFileSync(PISMA, 'utf8').split('\n').filter(Boolean).length : 0);

const seychas = Date.now();
// Форма событий — строгая v1 dsh-schedule (настоящий foldScheduleEvents отвергает иную): создание одноразового и его срабатывание.
const ISO = new Date(seychas).toISOString();
const para = (i) => [
  { type: 'schedule/change', data: { version: 1, operation: 'create', schedule: { id: `s${i}`, kind: 'after', prompt: 'proba', afterSeconds: 60, scheduledAt: ISO } }, time: seychas },
  { type: 'schedule/change', data: { version: 1, operation: 'dispatch', id: `s${i}` }, time: seychas },
];
const PREVYSHEN = Array.from({ length: 7 }, (_, i) => para(i)).flat();      // 7 пробуждений подряд > 6
const V_NORME = [...PREVYSHEN, { type: 'user/message', data: { source: { kind: 'user' } }, time: seychas }];

// Настоящий apply; ловим обработчик простоя, который сторож вешает на agent.ctx.
function podnyat(id, config = { notifyCmd: KANAL }) {
  const hooks = {}; const naAgente = {};
  const agent = { session: { id, events: PREVYSHEN, append() {} }, ctx: {
    effect() {}, on(ev, fn) { naAgente[ev] = fn; }, tools: { register() { return () => {}; } },
  } };
  const pisat0 = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    apply({ on(ev, fn) { hooks[ev] = fn; }, agents: { roots: () => [agent], withoutInitiator: (fn) => fn() },
      // DSH 0.2 (B-N-1194): задачи читаются из службы расписания — подстава с пустой таблицей (стенд про уведомление, не про гашение).
      sessions: { flush: async () => {} }, schedule: { list: async () => [], delete: async () => ({ deleted: true }) } }, config);
    if (typeof hooks['agent/created'] !== 'function') throw new Error('apply не повесил agent/created');
    hooks['agent/created']({ agent });
  } finally { process.stderr.write = pisat0; }
  if (typeof naAgente['agent/status'] !== 'function') throw new Error('обработчик простоя не повешен');
  const prostoj = async (sobytiya) => {
    agent.session.events = sobytiya;
    const zhurnal = [];
    const pisat = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s) => { zhurnal.push(String(s)); return true; };
    try { naAgente['agent/status']({ status: 'idle' }); await new Promise((r) => setImmediate(r)); }
    finally { process.stderr.write = pisat; }
    return zhurnal.join('');
  };
  return prostoj;
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++;
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 160)); } };

try {
  await proba('П1 предел превышен — одно письмо; повторный простой при том же превышении — не прибавилось', async () => {
    fs.rmSync(PISMA, { force: true }); fs.rmSync(OTKAZ, { force: true });
    const prostoj = podnyat('p1');
    const z = await prostoj(PREVYSHEN);
    if (!z.includes('предел автономных пробуждений')) throw new Error('остановки не было — предмет не дошёл до предела');
    if (pisem() !== 1) throw new Error(`после первого простоя писем ${pisem()}, ждали 1`);
    await prostoj(PREVYSHEN);
    if (pisem() !== 1) throw new Error(`после второго простоя писем ${pisem()}, ждали 1 (повтор в том же эпизоде)`);
  });
  await proba('П2 канал отказал — письма нет; следующий простой, канал починен — письмо пришло', async () => {
    fs.rmSync(PISMA, { force: true }); fs.writeFileSync(OTKAZ, '');
    const prostoj = podnyat('p2');
    const z = await prostoj(PREVYSHEN);
    if (!z.includes('уведомление владельцу не ушло')) throw new Error('отказ канала не назван в журнале (канал не звали?)');
    if (pisem() !== 0) throw new Error(`при отказе канала писем ${pisem()}`);
    fs.rmSync(OTKAZ);
    await prostoj(PREVYSHEN);
    if (pisem() !== 1) throw new Error(`после починки канала писем ${pisem()}, ждали 1 — уведомление потеряно`);
  });
  await proba('П3 пределы в норме, затем снова превышены — второе письмо (новый эпизод)', async () => {
    fs.rmSync(PISMA, { force: true }); fs.rmSync(OTKAZ, { force: true });
    const prostoj = podnyat('p3');
    await prostoj(PREVYSHEN);
    if (pisem() !== 1) throw new Error(`первый эпизод: писем ${pisem()}, ждали 1`);
    await prostoj(V_NORME);
    await prostoj(PREVYSHEN);
    if (pisem() !== 2) throw new Error(`второй эпизод: писем ${pisem()}, ждали 2 — новая остановка молча`);
  });
  const ZAVIS_CFG = { notifyCmd: KANAL_ZAVIS, notifyTimeoutSeconds: 1 };
  let prostojZ;
  await proba('П4 канал завис дольше предела — обработчик вернулся за < 5 с, отказ назван с ETIMEDOUT, письма нет', async () => {
    fs.rmSync(PISMA, { force: true }); fs.writeFileSync(ZAVIS, '');
    prostojZ = podnyat('p4', ZAVIS_CFG);
    const t = Date.now(); const z = await prostojZ(PREVYSHEN); const ms = Date.now() - t;
    if (ms >= 5000) throw new Error(`обработчик держался ${ms} мс — зависший канал держит простой`);
    if (!/канал уведомления ЗАВИС дольше 1 с[^\n]*ETIMEDOUT/.test(z)) throw new Error('отказ по пределу не назван: ' + (z.match(/schedule-guard[^\n]*(уведомл|канал)[^\n]*/) || ['нет строки'])[0].slice(0, 120));
    if (pisem() !== 0) throw new Error(`писем ${pisem()} при зависшем канале`);
  });
  await proba('П5 тот же эпизод, следующий простой — канал НЕ зовут снова (тревога одна, обработчик не ждёт)', async () => {
    if (!prostojZ) throw new Error('П4 не подняла сторожа');
    const t = Date.now(); const z = await prostojZ(PREVYSHEN); const ms = Date.now() - t;
    if (ms >= 500) throw new Error(`второй простой держался ${ms} мс — канал позван повторно`);
    if (/ЗАВИС/.test(z)) throw new Error('строка отказа повторилась в том же эпизоде');
  });
  await proba('П6 эпизод кончился, канал ожил, новая остановка — письмо пришло', async () => {
    if (!prostojZ) throw new Error('П4 не подняла сторожа');
    fs.rmSync(ZAVIS, { force: true });
    await prostojZ(V_NORME);
    await prostojZ(PREVYSHEN);
    if (pisem() !== 1) throw new Error(`писем ${pisem()}, ждали 1 — отметка зависания пережила эпизод`);
  });
} catch (e) { slepota(`стенд не собран: ${e?.message}`); }

console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
