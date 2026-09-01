// Стенд замыкания выхода шины A2A: чтение ящика модулем связи.
// Текст функций берётся ИЗ файла предмета и ИСПОЛНЯЕТСЯ на подставном ящике.
// Боевой ящик не трогается ни на одном шаге.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SRC = process.argv[2] || new URL('../src/index.js', import.meta.url).pathname;
let s;
try { s = fs.readFileSync(SRC, 'utf-8'); }
catch (e) { console.log(`СЛЕПОТА: не читается ${SRC} — ${e.code || e.message}`); process.exit(2); }

let ok = 0, fail = 0, slep = 0;
const t = (n, c, syr) => { if (c) { ok++; console.log(`ok   ${n}`); }
  else { fail++; console.log(`FAIL ${n}\n     сырьё: ${syr}`); } };
const sl = (n, p) => { slep++; console.log(`СЛЕПОТА ${n}: ${p}`); };

// ── извлечение функций ИЗ предмета ───────────────────────────────────────────
function vynut(imya) {
  const i = s.indexOf(`  function ${imya}(`) >= 0
    ? s.indexOf(`  function ${imya}(`) : s.indexOf(`  async function ${imya}(`);
  if (i < 0) return null;
  const j = s.indexOf('\n  }\n', i);
  return j < 0 ? null : s.slice(i, j + 5);
}
const tSender = vynut('spoolSender');
const tAge = vynut('spoolAgeHours');
const tPoll = vynut('pollSpool');
if (!tSender || !tAge || !tPoll) {
  sl('извлечение', `spoolSender=${!!tSender} spoolAgeHours=${!!tAge} pollSpool=${!!tPoll}`);
  console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`);
  process.exit(2);
}

// ── 1. настройка, а не константа ─────────────────────────────────────────────
const declIn = s.match(/const SPOOL_IN = ([^;]+);/);
t('путь ящика — настройка config.spoolDir, не константа',
  !!declIn && /config\.spoolDir/.test(declIn[1]) && !/\/var\/spool/.test(declIn[1]),
  declIn ? declIn[1] : '(объявления нет)');
const declB = s.match(/const SPOOL_BATCH = ([^;]+);/);
t('порог пачки — настройка', !!declB && /config\.spoolBatchCount/.test(declB[1]),
  declB ? declB[1] : '(нет)');
const declS = s.match(/const SPOOL_STALE_HOURS = ([^;]+);/);
t('порог возраста — настройка', !!declS && /config\.spoolStaleHours/.test(declS[1]),
  declS ? declS[1] : '(нет)');

// ── 2. вызов в цикле опроса ──────────────────────────────────────────────────
t('pollSpool зовётся из цикла опроса', /await pollSpool\(\);/.test(s),
  `вхождений: ${(s.match(/await pollSpool\(\)/g) ?? []).length}`);

// ── 3. удаление ПОСЛЕ передачи, а не до ──────────────────────────────────────
const posle = tPoll.indexOf('handle.agent.send');
const unl = tPoll.indexOf('unlinkSync(p.full)');
t('удаление письма стоит ПОСЛЕ передачи агенту', posle > 0 && unl > posle,
  `send@${posle} unlink@${unl}`);
t('команды /goal из ящика НЕ принимаются', !/\/goal/.test(tPoll),
  `вхождений /goal в pollSpool: ${(tPoll.match(/\/goal/g) ?? []).length}`);

// ── исполнение: разбор имени и возраст ───────────────────────────────────────
const mkFn = (txt, args) => new Function(...args, `${txt}\n return arguments.callee;`);
const sender = new Function('fs', `${tSender}\n return spoolSender;`)(fs);
t('отправитель из имени: dsh', sender('20260829T205711Z-dsh-af8b9699.txt') === 'dsh',
  sender('20260829T205711Z-dsh-af8b9699.txt'));
t('имя не по форме — сказано прямо, а не пусто',
  sender('pismo.txt') === '(имя не разобрано)', sender('pismo.txt'));

const ageFn = new Function('fs', `${tAge}\n return spoolAgeHours;`)(fs);
const svezh = new Date(Date.now() - 3600000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const a1 = ageFn(`${svezh}-dsh-x.txt`, '/nonexistent');
t('возраст свежего письма около 1 часа', a1 > 0.5 && a1 < 1.5, String(a1));
const a2 = ageFn('20260829T205711Z-dsh-x.txt', '/nonexistent');
t('возраст письма от 29.08 больше 12 часов', a2 > 12, String(a2));

// ── исполнение pollSpool на подставном ящике ─────────────────────────────────
function progon(pisma, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-spool-'));
  for (const [name, body] of pisma) fs.writeFileSync(path.join(dir, name), body);
  const zhurnal = [];
  const podano = [];
  const env = {
    fs, path,
    SPOOL_IN: opts.brokenDir ? path.join(dir, 'net-takogo') : dir,
    SPOOL_BATCH: opts.batch ?? 5,
    SPOOL_STALE_HOURS: opts.stale ?? 12,
    A2A_EXT: ['.txt', '.md'],
    A2A_CHAT: 'a2a',
    a2aReported: opts.reported ?? new Set(),
    log: (m) => zhurnal.push(String(m)),
    stripMark: (x) => x,
    lastOrigin: new Map(),
    pushAsk: () => {},
    copyAsk: () => {},
    nudgeUntilClaimed: () => {},
    platform: { createUserMessage: (m) => m },
    agentFor: async () => {
      if (opts.otkazPeredachi) throw new Error('фабрика агентов не поднялась');
      return { handle: { agent: { send: (m) => podano.push(m.content[0].text) } }, sessionId: 's1' };
    },
    spoolSender: sender,
    spoolAgeHours: ageFn,
  };
  const argsN = Object.keys(env);
  const fn = new Function(...argsN, `${tPoll}\n return pollSpool;`)(...argsN.map((k) => env[k]));
  // 🔴 УБИРАЕМ ЗА СОБОЙ. Первая редакция оставила 89 каталогов в /tmp за один
  // заход: стенд создавал mkdtemp и не удалял. Механизм, копящий в ОБЩЕМ
  // каталоге, — наш известный класс (долг 40), и завести его в приёмке,
  // которая гоняется ежедневно, значит копить молча.
  return fn().then(() => {
    const itog = {
      dir, zhurnal, podano,
      ostalos: fs.existsSync(dir) ? fs.readdirSync(dir) : [],
    };
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* уже нет */ }
    return itog;
  });
}

const R = {};
// 🔴 Метка времени СВЕЖЕГО письма вычисляется, а не зашивается: с зашитой датой
// стенд протухает через 12 часов и краснеет на исправном предмете —
// «свежее письмо несёт пометку возраста». Проверено 01.09.2026: зашитая
// вчерашняя дата дала возраст 28 ч.
const svezhaya = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
R.odno = await progon([[`${svezhaya}-dsh-aaa.txt`, 'привет из ящика']]);
t('письмо из ящика подано агенту', R.odno.podano.length === 1, JSON.stringify(R.odno.podano));
t('в тексте метка отправителя', /от агента dsh/.test(R.odno.podano[0] ?? ''), R.odno.podano[0]);
t('прочитанное удалено из ящика', R.odno.ostalos.length === 0, JSON.stringify(R.odno.ostalos));
t('в журнале сказано о принятии', R.odno.zhurnal.some((l) => /\[ящик\] принято/.test(l)),
  JSON.stringify(R.odno.zhurnal));

R.povtor = await progon([]);
t('пустой ящик — ни одной строки в журнале', R.povtor.zhurnal.length === 0,
  JSON.stringify(R.povtor.zhurnal));

R.staroe = await progon([['20260829T205711Z-dsh-bbb.txt', 'старое письмо']]);
t('старое письмо несёт пометку возраста',
  /пролежало в ящике \d+ ч/.test(R.staroe.podano[0] ?? ''), R.staroe.podano[0]);
t('свежее письмо пометки возраста НЕ несёт (зрячесть)',
  !/пролежало в ящике/.test(R.odno.podano[0] ?? ''), R.odno.podano[0]);

R.pachka = await progon(Array.from({ length: 6 }, (_, i) =>
  [`2026083109000${i}Z-dsh-c${i}.txt`, `письмо ${i}`]));
t('шесть писем поданы ОДНИМ ходом', R.pachka.podano.length === 1,
  `подач: ${R.pachka.podano.length}`);
t('в пачке названо число писем', /6 писем из ящика одной пачкой/.test(R.pachka.podano[0] ?? ''),
  (R.pachka.podano[0] ?? '').slice(0, 80));
t('пачка убрана из ящика целиком', R.pachka.ostalos.length === 0, JSON.stringify(R.pachka.ostalos));

R.pyat = await progon(Array.from({ length: 5 }, (_, i) =>
  [`2026083109000${i}Z-dsh-d${i}.txt`, `письмо ${i}`]));
t('пять писем поданы ПО ОДНОМУ (зрячесть порога пачки)', R.pyat.podano.length === 5,
  `подач: ${R.pyat.podano.length}`);

R.otkaz = await progon([[`${svezhaya}-dsh-eee.txt`, 'письмо']], { otkazPeredachi: true });
t('при отказе передачи письмо ОСТАВЛЕНО', R.otkaz.ostalos.length === 1,
  JSON.stringify(R.otkaz.ostalos));
t('при отказе передачи сказано вслух',
  R.otkaz.zhurnal.some((l) => /ОСТАВЛЕНЫ/.test(l)), JSON.stringify(R.otkaz.zhurnal));

R.pusto = await progon([[`${svezhaya}-dsh-fff.txt`, '   ']]);
t('пустое письмо убрано без подачи',
  R.pusto.podano.length === 0 && R.pusto.ostalos.length === 0,
  `подано ${R.pusto.podano.length}, осталось ${JSON.stringify(R.pusto.ostalos)}`);

R.chuzhoe = await progon([[`${svezhaya}-dsh-ggg.pdf`, 'бинарь']]);
t('чужое расширение не подано, имя названо',
  R.chuzhoe.podano.length === 0 && R.chuzhoe.zhurnal.some((l) => /НЕ ВЗЯТ/.test(l)),
  JSON.stringify(R.chuzhoe.zhurnal));
t('чужое расширение оставлено в ящике, а не стёрто', R.chuzhoe.ostalos.length === 1,
  JSON.stringify(R.chuzhoe.ostalos));

R.nedostup = await progon([], { brokenDir: true });
t('недоступный ящик — громкая строка один раз',
  R.nedostup.zhurnal.filter((l) => /недоступен/.test(l)).length === 1,
  JSON.stringify(R.nedostup.zhurnal));

// ── канарейка точного числа ──────────────────────────────────────────────────
const ZHDYOM = 27;
console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`);
if (ok + fail !== ZHDYOM) {
  console.log(`СЛЕПОТА: проведено ${ok + fail} проверок, ждали ${ZHDYOM} — часть не состоялась`);
  process.exit(2);
}
process.exit(fail ? 1 : 0);
