// Стенд различения исходов побудки в модуле связи.
// Текст функции берётся ИЗ файла предмета и ИСПОЛНЯЕТСЯ на подставных агентах.
// Ни платформа, ни живая очередь не задействованы ни на одном шаге.
//
// Зачем стенд: механизм печатал беду при штатной работе — «не забрали» в 45 случаях
// из 48 за сутки, при нулевом числе побудок. Здесь проверяется, что четыре исхода
// различаются и что беда осталась только там, где механизм действительно не сработал.
import fs from 'node:fs';

const SRC = process.argv[2] || new URL('../src/index.js', import.meta.url).pathname;
let s;
try { s = fs.readFileSync(SRC, 'utf-8'); }
catch (e) { console.log(`СЛЕПОТА: не читается ${SRC} — ${e.code || e.message}`); process.exit(2); }

let ok = 0, fail = 0, slep = 0;
const t = (n, c, syr) => { if (c) { ok++; console.log(`ok   ${n}`); }
  else { fail++; console.log(`FAIL ${n}\n     сырьё: ${syr ?? '(не задано)'}`); } };
const sl = (n, p) => { slep++; console.log(`СЛЕПОТА ${n}: ${p}`); };

// ── извлечение функции ИЗ предмета ───────────────────────────────────────────
function vynut(imya) {
  const i = s.indexOf(`  function ${imya}(`);
  if (i < 0) return null;
  const j = s.indexOf('\n  }\n', i);
  return j < 0 ? null : s.slice(i, j + 5);
}
const txt = vynut('nudgeUntilClaimed');
if (!txt) {
  sl('извлечение', 'функция nudgeUntilClaimed в предмете не найдена');
  console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`);
  process.exit(2);
}

// ── 1. порядок проверок: очередь спрашивается ДО занятости ───────────────────
const iPending = txt.indexOf('!agent.inbox.hasPending');
const iRunning = txt.indexOf("agent.status === 'running'");
t('проверка «забрано ли» стоит ДО проверки занятости',
  iPending > 0 && iRunning > 0 && iPending < iRunning,
  `hasPending@${iPending} running@${iRunning}`);

// ── 2. счётчики объявлены ────────────────────────────────────────────────────
for (const im of ['proverok', 'zanyat']) {
  t(`счётчик ${im} объявлен`, new RegExp(`let ${im} = 0`).test(txt), `в тексте: ${txt.includes(im)}`);
}

// ── исполнение на подставных агентах ─────────────────────────────────────────
const mk = () => new Function('log', `${txt}\n return nudgeUntilClaimed;`);
const BUDGET = 1600;               // 3 прохода по 500 мс
const ZHDAT = BUDGET + 900;

async function progon(agent) {
  const stroki = [];
  let fn;
  try { fn = mk()((m) => stroki.push(String(m))); }
  catch (e) { return { stroki: [], oshibka: e.message }; }
  fn(agent, '[проба]', BUDGET);
  await new Promise((r) => setTimeout(r, ZHDAT));
  return { stroki, oshibka: null };
}

// счётчик обращений к очереди — им проверяем, что проверки реально шли
const agentZanyat = (pending) => {
  let n = 0;
  return { status: 'running', get inbox() { return { get hasPending() { n++; return pending; } }; },
           wakeDriver() {}, get _n() { return n; } };
};
const agentSvoboden = (pendingFn, wake) => ({
  status: 'idle', inbox: { get hasPending() { return pendingFn(); } }, wakeDriver: wake,
});

const R = {};
R.zanyat   = await progon(agentZanyat(true));
R.zabrano  = await progon(agentSvoboden(((c) => () => ++c <= 2)(0), () => {}));
R.srazu    = await progon(agentSvoboden(() => false, () => {}));
let vzyato = 0, zn = 0;
R.svoboden = await progon(agentSvoboden(() => true, () => { vzyato++; }));
R.netOch   = await progon({ status: 'idle', inbox: { hasPending: undefined }, wakeDriver: () => {} });
R.netWake  = await progon({ status: 'idle', inbox: { hasPending: true }, wakeDriver: null });

const odna = (r) => (r.stroki.length === 1 ? r.stroki[0] : `(строк ${r.stroki.length})`);

// ── 3. занят весь срок — СВЕДЕНИЕ, не беда ───────────────────────────────────
t('занят весь срок: строка есть и она НЕ беда',
  R.zanyat.stroki.length === 1 && !/🔴/.test(odna(R.zanyat)), odna(R.zanyat));
t('занят весь срок: названо ЧИСЛО проверок',
  /занят все \d+ проверок из \d+/.test(odna(R.zanyat)), odna(R.zanyat));
t('занят весь срок: сказано, что состояние штатное',
  /штатн/.test(odna(R.zanyat)), odna(R.zanyat));

// ── 4. письмо забрано ────────────────────────────────────────────────────────
t('забрано: строка есть и она НЕ беда',
  R.zabrano.stroki.length === 1 && !/🔴/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано: названо время и число проверок',
  /забрано за [\d.]+ с: побудок \d+, проверок \d+/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано после побудок: побудок больше нуля',
  /побудок [1-9]/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано после побудок: пометки про первую проверку НЕТ',
  !/пуста уже на первой/.test(odna(R.zabrano)), odna(R.zabrano));

// ── 5. очередь пуста сразу — помечается отдельно ─────────────────────────────
t('пусто с первой проверки: случай помечен вслух',
  /пуста уже на первой проверке/.test(odna(R.srazu)), odna(R.srazu));
t('пусто с первой проверки: это НЕ беда',
  !/🔴/.test(odna(R.srazu)), odna(R.srazu));

// ── 6. свободен, а письмо висит — БЕДА (контроль зрячести) ───────────────────
t('свободен и висит: строка помечена бедой',
  /🔴/.test(odna(R.svoboden)), odna(R.svoboden));
t('свободен и висит: названо, сколько проверок агент был свободен',
  /свободен \d+ проверок из \d+/.test(odna(R.svoboden)), odna(R.svoboden));
t('свободен и висит: побудки реально делались', vzyato > 0, `вызовов wakeDriver: ${vzyato}`);

// ── 7. отказы устройства — беда ──────────────────────────────────────────────
t('очередь недоступна: беда с причиной',
  /🔴/.test(odna(R.netOch)) && /очередь агента недоступна/.test(odna(R.netOch)), odna(R.netOch));
t('wakeDriver недоступен: беда с причиной',
  /🔴/.test(odna(R.netWake)) && /wakeDriver недоступен/.test(odna(R.netWake)), odna(R.netWake));

// ── 8. ни один исход не молчит ───────────────────────────────────────────────
// ── 8а. ЗАНЯТ, но очередь опустела: письмо забрано, и это видно ──────────────
// Ровно тот случай, ради которого проверка очереди вынесена вперёд: при прежнем
// порядке занятость закрывала выход, и забранное письмо объявлялось незабранным.
R.zanyatNoZabrano = await progon({
  status: 'running',
  inbox: { get hasPending() { return ++zn <= 2; } },
  wakeDriver() {},
});
t('занят, но очередь опустела: сказано ЗАБРАНО, а не «занят весь срок»',
  /забрано за/.test(odna(R.zanyatNoZabrano)) && !/занят все/.test(odna(R.zanyatNoZabrano)),
  odna(R.zanyatNoZabrano));

const molchat = Object.entries(R).filter(([, r]) => r.stroki.length === 0).map(([k]) => k);
t('ни один из семи исходов не молчит', molchat.length === 0, `молчали: ${molchat.join(', ') || '—'}`);

// ── итог ПЕРЕД канарейкой ────────────────────────────────────────────────────
console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`);
const ZHDYOM = 19;
if (ok + fail + slep !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проверок ${ok + fail + slep}, а стенд состоит из ${ZHDYOM}`);
  process.exit(2);
}
process.exit(fail ? 1 : (slep ? 2 : 0));
