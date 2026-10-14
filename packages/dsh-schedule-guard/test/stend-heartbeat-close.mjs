// heartbeat_close: резюме полосы, которое агент закрывает САМ, — на НАСТОЯЩЕМ execute из src/index.js.
// Предмет грузится импортом и проходит через настоящий apply → 'agent/created' → tools.register;
// подставлены только ctx, агент и канал уведомления. Своей копии логики здесь нет (A-N-745:
// прежняя редакция «воспроизводила тело» и оставалась 5/5 при испорченном предмете).
// Числа полосы при доступном и недоступном журнале уже проверяет test-preemptive-refusal.mjs;
// здесь — текст резюме, доставка в канал и отказ канала.
// Вызов: DSH_TEST_APP=<корень платформы> node test/stend-heartbeat-close.mjs [путь-к-предмету]
// Коды: 0 — всё сошлось; 1 — расхождение (названо); 2 — СЛЕПОТА: предмет не загрузился, проверено ничего.
// ⚠️ Природа зелёного: зависимости предмета (schemastery, dsh-schedule, dsh-tools) берутся из
// node_modules платформы DSH_TEST_APP симлинком, а не свои. Разойдутся с нужными пакету — стенд соврёт.
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

// Предмет — на свой стол, рядом package.json (type: module) и node_modules платформы симлинком.
const STOL = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-heartbeat-close-'));
process.on('exit', () => fs.rmSync(STOL, { recursive: true, force: true }));
// Нет предмета или package.json рядом — это СЛЕПОТА (2), а не расхождение (1): проверено ничего (Вениамин, A-N-745).
try {
  fs.copyFileSync(SRC, path.join(STOL, 'predmet.js'));
  fs.copyFileSync(path.join(PAKET, 'package.json'), path.join(STOL, 'package.json'));
  fs.symlinkSync(path.join(APP, 'node_modules'), path.join(STOL, 'node_modules'));
} catch (e) { slepota(`стол не собран: ${e?.code || e?.message}`); }
let apply;
try { ({ apply } = await import(pathToFileURL(path.join(STOL, 'predmet.js')).href)); }
catch (e) { slepota(`не загружается: ${e?.code || e?.message}`); }

// Канал уведомления: принимает текст ТОЛЬКО из stdin и пишет, сколько получил аргументов.
const KANAL = path.join(STOL, 'kanal.sh');
const PRINYATO = path.join(STOL, 'prinyato.txt');
fs.writeFileSync(KANAL, `#!/bin/sh\necho "$#" > "${PRINYATO}.argc"\ncat > "${PRINYATO}"\n`, { mode: 0o755 });

const events = Array.from({ length: 3 }, () => ({ type: 'schedule/change', data: { operation: 'dispatch' }, time: Date.now() }));
// Настоящий apply регистрирует инструмент у живого агента; ловим то, что он отдал в tools.register.
function zaregistrirovat(config, sobytiya = events) {
  const hooks = {};
  let tool;
  const agent = { session: { id: 'stend-heartbeat-close', events: sobytiya }, ctx: {
    effect(fn) { fn(); }, on() {},
    tools: { register(t) { tool = t; return () => {}; } },
  } };
  // Строки подъёма сторожа глушим: стенду нужен журнал ВЫЗОВА, а не подъёма.
  const pisat0 = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    apply({ on(ev, fn) { hooks[ev] = fn; }, agents: { roots: () => [agent], withoutInitiator: (fn) => fn() } }, config);
    if (typeof hooks['agent/created'] !== 'function') throw new Error('apply не повесил agent/created (сторож недействующий?)');
    hooks['agent/created']({ agent });
  } finally { process.stderr.write = pisat0; }
  if (!tool || typeof tool.execute !== 'function') throw new Error('heartbeat_close не зарегистрирован');
  const vyzov = async (summary) => {
    try { fs.rmSync(PRINYATO); fs.rmSync(PRINYATO + '.argc'); } catch {}
    const zhurnal = [];
    const pisat = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s) => { zhurnal.push(String(s)); return true; };
    let otvet;
    try { otvet = await tool.execute({ summary }, { agent }); } finally { process.stderr.write = pisat; }
    const prinyato = fs.existsSync(PRINYATO) ? fs.readFileSync(PRINYATO, 'utf8') : null;
    const argc = fs.existsSync(PRINYATO + '.argc') ? fs.readFileSync(PRINYATO + '.argc', 'utf8').trim() : null;
    return { otvet, prinyato, argc, zhurnal: zhurnal.join('') };
  };
  vyzov.imya = tool.name;
  return vyzov;
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++;
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 160)); } };

// Зависающий канал (04.10.2026): exec — SIGKILL достаётся самому sleep, сирот нет.
const KANAL_ZAVIS = path.join(STOL, 'kanal-zavis.sh');
fs.writeFileSync(KANAL_ZAVIS, '#!/bin/sh\nexec sleep 20\n', { mode: 0o755 });
let zvat, bezKanala, slomannyj, zavisshij;
try {
  zvat = zaregistrirovat({ notifyCmd: KANAL });
  bezKanala = zaregistrirovat({}, null);   // null, не undefined: undefined подставил бы умолчание параметра
  slomannyj = zaregistrirovat({ notifyCmd: path.join(STOL, 'net-takogo-kanala') });
  zavisshij = zaregistrirovat({ notifyCmd: KANAL_ZAVIS, notifyTimeoutSeconds: 1 });
} catch (e) { slepota(`регистрация через настоящий apply не удалась: ${e.message}`); }

// Имя — договор с моделью: переименованный инструмент регистрируется и исполняется, но агент зовёт его
// по старому имени и получает «нет такого». Порча переименованием проходила 6/6 (Вениамин, A-N-745).
await proba('0 инструмент зарегистрирован под именем heartbeat_close', async () => {
  if (zvat.imya !== 'heartbeat_close') throw new Error('зарегистрирован под именем ' + JSON.stringify(zvat.imya));
});
await proba('1 резюме в канале: числа полосы и текст агента, текст — через stdin, не аргументом', async () => {
  const { otvet, prinyato, argc } = await zvat('полоса закрыта: мост починен, дальше ждём слова');
  if (prinyato === null) throw new Error('канал ничего не получил');
  if (!prinyato.startsWith('полоса автономных пробуждений закрыта агентом: подряд 3, за сутки 3, всего 3\n'))
    throw new Error('первая строка резюме не та: ' + JSON.stringify(prinyato.split('\n')[0]));
  if (!prinyato.includes('мост починен')) throw new Error('нет текста агента');
  if (argc !== '0') throw new Error(`канал получил ${argc} аргументов — текст ушёл в командную строку`);
  if (otvet?.ok !== true || otvet?.otpravleno !== true) throw new Error('ответ не говорит об отправке: ' + JSON.stringify(otvet));
});
await proba('2 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ: без канала — не отправлено и сказано; журнал недоступен — сказано', async () => {
  const { otvet, prinyato, zhurnal } = await bezKanala('итог');
  if (prinyato !== null) throw new Error('канал получил текст, хотя notifyCmd не задан');
  if (otvet?.otpravleno !== false) throw new Error('обещал отправку без канала');
  if (!/числа полосы недоступны/.test(zhurnal)) throw new Error('журнал сторожа молчит о недоступности чисел');
});
// Нестроковые и отсутствующие summary отвергает настоящий defineTool ДО execute (required: true) —
// до тела они не доходят, поэтому здесь только строки.
await proba('3 краевые строки: пусто · пробелы · табуляция и перевод строки — вторая строка не пуста', async () => {
  for (const s of ['', '   ', '\t\n']) {
    const { prinyato } = await zvat(s);
    if (!/подряд 3/.test(prinyato ?? '')) throw new Error('числа пропали при входе ' + JSON.stringify(s));
    if (!/\S/.test((prinyato ?? '').split('\n')[1] ?? '')) throw new Error('вторая строка пуста при входе ' + JSON.stringify(s));
  }
});
await proba('4 пустой текст заменяется честной пометкой, а не молчанием', async () => {
  const { prinyato } = await zvat('   ');
  if (!/\(агент не назвал итог\)/.test(prinyato ?? '')) throw new Error('пустота прошла молча');
});
await proba('5 длинный текст (5000 знаков) доходит до канала целиком', async () => {
  const dlinno = 'я'.repeat(5000);
  const { prinyato } = await zvat(dlinno);
  if (!(prinyato ?? '').includes(dlinno)) throw new Error('текст обрезан без предупреждения');
});
await proba('6 канал отказал → инструмент не падает, отказ назван в журнале', async () => {
  const { otvet, zhurnal } = await slomannyj('итог');
  if (otvet?.ok !== true) throw new Error('ответ не ok: ' + JSON.stringify(otvet));
  if (!/резюме полосы не отправлено/.test(zhurnal)) throw new Error('отказ канала не назван');
});

await proba('7 канал завис дольше предела → инструмент вернулся за < 5 с, otpravleno: false, отказ назван', async () => {
  const t = Date.now(); const { otvet, zhurnal } = await zavisshij('итог'); const ms = Date.now() - t;
  if (ms >= 5000) throw new Error(`инструмент держался ${ms} мс — зависший канал держит вызов`);
  if (otvet?.ok !== true || otvet?.otpravleno !== false) throw new Error('ответ не тот: ' + JSON.stringify(otvet));
  if (!/канал уведомления ЗАВИС дольше 1 с[^\n]*ETIMEDOUT/.test(zhurnal)) throw new Error('отказ по пределу не назван');
});

console.log(`  итог: ${proshlo} из ${vsego} · предмет ${SRC} · зависимости платформы ${APP}/node_modules`);
process.exit(proshlo === vsego ? 0 : 1);
