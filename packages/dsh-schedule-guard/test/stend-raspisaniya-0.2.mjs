// Сторож на форме DSH 0.2 (B-N-1194, 30.09.2026) — на НАСТОЯЩЕМ apply из src/index.js: хук tools/execute и
// обработчик простоя. Подставлены только ctx (с подставной службой расписания), агент (журнал — ТОЛЬКО через
// snapshotEvents(), поля events нет, как в 0.2) и канал уведомления. Своей копии логики здесь нет.
// Пробуждение 0.2 = user/message с source.kind 'schedule' (dispatch в журнал не пишется).
// Ждём: С1 потолок в час по пробуждениям 0.2 → отказ SCHEDULE_HOURLY_CAP; С2 schedule_update шагом 600 → SCHEDULE_TOO_FREQUENT;
// С3 cron → SCHEDULE_CRON_NOT_ALLOWED; С4 журнал не читается → SCHEDULE_SOURCE_UNAVAILABLE;
// П5 простой, 7 подряд → снят только повторяющийся (через службу), одноразовый цел, письмо 1;
// П6 шаг 600 < 1800 → снят только нарушитель; П7 журнал не читается → сняты все, письмо;
// П8 служба ответила deleted:false → в снятых нет, в журнале «НЕ снято».
// П9 (условие Вениамина) слепота: снятые ЦЕЛИКОМ в файл ДО delete и в письмо; П10 файл не пишется → не снято ничего, «НЕ снимаю».
// Вызов: DSH_TEST_APP=<корень платформы> node test/stend-raspisaniya-0.2.mjs [путь-к-предмету]
// Коды: 0 — всё сошлось; 1 — расхождение (названо); 2 — СЛЕПОТА: предмет не загрузился, проверено ничего.
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

const STOL = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-raspisaniya-02-'));
// П9/П10 (условие Вениамина): файл снятых пишется в <DSH_HOME>/schedule-guard-snyatye.jsonl — стенд под dsh НЕ пишет в боевой /opt/dsh/.dsh.
process.env.DSH_HOME = STOL;
const SNYATYE = path.join(STOL, 'schedule-guard-snyatye.jsonl');
const snyatyh = () => (fs.existsSync(SNYATYE) ? fs.readFileSync(SNYATYE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
process.on('exit', () => fs.rmSync(STOL, { recursive: true, force: true }));
try {
  fs.copyFileSync(SRC, path.join(STOL, 'predmet.js'));
  fs.copyFileSync(path.join(PAKET, 'package.json'), path.join(STOL, 'package.json'));
  fs.symlinkSync(path.join(APP, 'node_modules'), path.join(STOL, 'node_modules'));
} catch (e) { slepota(`стол не собран: ${e?.code || e?.message}`); }
let apply;
try { ({ apply } = await import(pathToFileURL(path.join(STOL, 'predmet.js')).href)); }
catch (e) { slepota(`не загружается: ${e?.code || e?.message}`); }

const KANAL = path.join(STOL, 'kanal.sh');
const PISMA = path.join(STOL, 'pisma.txt');
fs.writeFileSync(KANAL, `#!/bin/sh\ncat > /dev/null\necho pismo >> "${PISMA}"\n`, { mode: 0o755 });
const pisem = () => (fs.existsSync(PISMA) ? fs.readFileSync(PISMA, 'utf8').split('\n').filter(Boolean).length : 0);

const seychas = Date.now();
const probudki = (n) => Array.from({ length: n }, (_, i) => (
  { type: 'user/message', data: { source: { kind: 'schedule' } }, time: seychas - (n - i) * 60000 }));
const sessiya02 = (sobytiya) => ({ id: 'stend-02', snapshotEvents: () => sobytiya, append() { throw new Error('на 0.2 гасить через журнал нельзя'); } });
const slepaya = { id: 'stend-02' };   // ни events, ни snapshotEvents

// Настоящий apply с подставной службой расписания: tablica — активные задачi, snyato — id снятых, otkazat — id, на которых delete ответит deleted:false.
function podnyat(sessiya, tablica = [], otkazat = []) {
  const hooks = {}; const naAgente = {}; const snyato = []; const vFajlePriSnyatii = [];
  const agent = { session: sessiya, ctx: { effect() {}, on(ev, fn) { naAgente[ev] = fn; }, tools: { register() { return () => {}; } } } };
  const schedule = {
    list: async ({ sessionId }) => (sessionId === sessiya.id ? tablica.filter((r) => !snyato.includes(r.id)) : []),
    delete: async ({ id }) => (vFajlePriSnyatii.push(snyatyh().length), otkazat.includes(id) ? { id, deleted: false, code: 'schedule_not_found' } : (snyato.push(id), { id, deleted: true })),
  };
  const zhurnal = [];
  const pisat0 = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => { zhurnal.push(String(s)); return true; };
  try {
    apply({ on(ev, fn) { hooks[ev] = fn; }, agents: { roots: () => [agent], withoutInitiator: (fn) => fn() },
      sessions: { flush: async () => {} }, schedule }, { notifyCmd: KANAL });
    hooks['agent/created']?.({ agent });
  } finally { process.stderr.write = pisat0; }
  const vyzov = (exec) => hooks['tools/execute']({ ...exec, agent }, async () => 'NEXT');
  const prostoj = async () => {
    const pisat = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s) => { zhurnal.push(String(s)); return true; };
    try { naAgente['agent/status']({ status: 'idle' }); for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }
    finally { process.stderr.write = pisat; }
  };
  return { vyzov, prostoj, snyato, zhurnal, vFajlePriSnyatii };
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++;
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); } };
const zhdu = (uslovie, chto) => { if (!uslovie) throw new Error(chto); };
const kod = (r) => r?.error?.info?.code;

await proba('С1 потолок в час по пробуждениям 0.2 → SCHEDULE_HOURLY_CAP', async () => {
  const { vyzov } = podnyat(sessiya02(probudki(4)));
  const r = await vyzov({ name: 'schedule_create', arguments: { after_seconds: 30 } });
  zhdu(kod(r) === 'SCHEDULE_HOURLY_CAP', `ждали SCHEDULE_HOURLY_CAP, вышло ${JSON.stringify(r).slice(0, 120)}`);
});
await proba('С2 schedule_update шагом 600 → SCHEDULE_TOO_FREQUENT', async () => {
  const { vyzov } = podnyat(sessiya02([]));
  const r = await vyzov({ name: 'schedule_update', arguments: { id: 'x', every_seconds: 600 } });
  zhdu(kod(r) === 'SCHEDULE_TOO_FREQUENT', `ждали SCHEDULE_TOO_FREQUENT, вышло ${JSON.stringify(r).slice(0, 120)}`);
});
await proba('С3 cron → SCHEDULE_CRON_NOT_ALLOWED', async () => {
  const { vyzov } = podnyat(sessiya02([]));
  const r = await vyzov({ name: 'schedule_create', arguments: { cron: '* * * * *' } });
  zhdu(kod(r) === 'SCHEDULE_CRON_NOT_ALLOWED', `ждали SCHEDULE_CRON_NOT_ALLOWED, вышло ${JSON.stringify(r).slice(0, 120)}`);
});
await proba('С4 журнал не читается → SCHEDULE_SOURCE_UNAVAILABLE', async () => {
  const { vyzov } = podnyat(slepaya);
  const r = await vyzov({ name: 'schedule_create', arguments: { after_seconds: 30 } });
  zhdu(kod(r) === 'SCHEDULE_SOURCE_UNAVAILABLE', `ждали SCHEDULE_SOURCE_UNAVAILABLE, вышло ${JSON.stringify(r).slice(0, 120)}`);
});
await proba('П5 простой, 7 подряд → снят только повторяющийся, одноразовый цел, письмо 1', async () => {
  const do_ = pisem();
  const { prostoj, snyato } = podnyat(sessiya02(probudki(7)), [
    { id: 'e1', kind: 'every', everySeconds: 3600, prompt: 'p' }, { id: 'o1', kind: 'after', prompt: 'p' }]);
  await prostoj();
  zhdu(JSON.stringify(snyato) === '["e1"]', `снято ${JSON.stringify(snyato)}, ждали ["e1"]`);
  zhdu(pisem() - do_ === 1, `писем +${pisem() - do_}, ждали +1`);
});
await proba('П6 шаг 600 < 1800 → снят только нарушитель', async () => {
  const { prostoj, snyato } = podnyat(sessiya02(probudki(1)), [
    { id: 'e600', kind: 'every', everySeconds: 600, prompt: 'p' }, { id: 'e3600', kind: 'every', everySeconds: 3600, prompt: 'p' }]);
  await prostoj();
  zhdu(JSON.stringify(snyato) === '["e600"]', `снято ${JSON.stringify(snyato)}, ждали ["e600"]`);
});
await proba('П7 простой, журнал не читается → сняты все, письмо', async () => {
  const do_ = pisem();
  const { prostoj, snyato } = podnyat(slepaya, [
    { id: 'a', kind: 'after', prompt: 'p' }, { id: 'b', kind: 'every', everySeconds: 3600, prompt: 'p' }]);
  await prostoj();
  zhdu(JSON.stringify(snyato) === '["a","b"]', `снято ${JSON.stringify(snyato)}, ждали ["a","b"]`);
  zhdu(pisem() - do_ === 1, `писем +${pisem() - do_}, ждали +1`);
});
await proba('П8 служба ответила deleted:false → в снятых нет, «НЕ снято» в журнале', async () => {
  const { prostoj, snyato, zhurnal } = podnyat(sessiya02(probudki(7)), [{ id: 'e1', kind: 'every', everySeconds: 3600, prompt: 'p' }], ['e1']);
  await prostoj();
  zhdu(snyato.length === 0, `снято ${JSON.stringify(snyato)}, ждали []`);
  zhdu(zhurnal.join('').includes('e1 НЕ снято'), 'строки «НЕ снято» в журнале нет');
});

await proba('П9 слепота: снятые ЦЕЛИКОМ в файл ДО снятия (id, title, prompt, расписание), в письме «запись целиком»', async () => {
  const do_ = snyatyh().length; const pisma0 = pisem();
  const { prostoj, snyato, vFajlePriSnyatii } = podnyat({ id: 'stend-02' },
    [{ id: 'z1', kind: 'every', everySeconds: 3600, title: 'Проверка', prompt: 'сделать X', scheduledAt: '2026-10-01T00:00:00.000Z' }]);
  await prostoj();
  const novye = snyatyh().slice(do_);
  zhdu(JSON.stringify(snyato) === '["z1"]', `снято ${JSON.stringify(snyato)}, ждали ["z1"]`);
  zhdu(vFajlePriSnyatii[0] === do_ + 1, `в момент delete в файле ${vFajlePriSnyatii[0]} записей, ждали ${do_ + 1} (запись ДО снятия)`);
  zhdu(novye.length === 1 && novye[0].record.title === 'Проверка' && novye[0].record.prompt === 'сделать X'
    && novye[0].record.everySeconds === 3600 && novye[0].record.scheduledAt === '2026-10-01T00:00:00.000Z', `в файле ${JSON.stringify(novye).slice(0, 160)}`);
  zhdu(pisem() - pisma0 === 1, `писем +${pisem() - pisma0}, ждали +1`);
});
await proba('П10 файл снятых не пишется → НЕ снято ничего, «НЕ снимаю» в журнале', async () => {
  const bylo = process.env.DSH_HOME; process.env.DSH_HOME = path.join(STOL, 'net-takogo-kataloga');
  try {
    const { prostoj, snyato, zhurnal } = podnyat({ id: 'stend-02' }, [{ id: 'z2', kind: 'every', everySeconds: 3600, title: 't', prompt: 'p' }]);
    await prostoj();
    zhdu(snyato.length === 0, `снято ${JSON.stringify(snyato)}, ждали []`);
    zhdu(zhurnal.join('').includes('НЕ снимаю'), 'строки «НЕ снимаю» в журнале нет');
  } finally { process.env.DSH_HOME = bylo; }
});

console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
