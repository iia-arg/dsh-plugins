// RU: Изолированный стенд stend-pobudki.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-pobudki.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import fs from 'node:fs';


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname;
console.log(`  предмет: ${SRC}`);
let s;
try { s = fs.readFileSync(SRC, 'utf-8'); }
catch (e) { console.log(`СЛЕПОТА: не читается ${SRC} — ${e.code || e.message}`); process.exit(2); }

let ok = 0, fail = 0, slep = 0;
const t = (n, c, syr) => { if (c) { ok++; console.log(`ok   ${n}`); }
  else { fail++; console.log(`FAIL ${n}\n     сырьё: ${syr ?? '(не задано)'}`); } };
const sl = (n, p) => { slep++; console.log(`СЛЕПОТА ${n}: ${p}`); };


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


const iPending = txt.indexOf('!agent.inbox.hasPending');
const iRunning = txt.indexOf("agent.status === 'running'");
t('проверка «забрано ли» стоит ДО проверки занятости',
  iPending > 0 && iRunning > 0 && iPending < iRunning,
  `hasPending@${iPending} running@${iRunning}`);


for (const im of ['proverok', 'zanyat']) {
  t(`счётчик ${im} объявлен`, new RegExp(`let ${im} = 0`).test(txt), `в тексте: ${txt.includes(im)}`);
}


const mk = () => new Function('log', `${txt}\n return nudgeUntilClaimed;`);
const BUDGET = 1600;
const ZHDAT = BUDGET + 900;

async function progon(agent) {
  const stroki = [];
  let fn;
  try { fn = mk()((m) => stroki.push(String(m))); }
  catch (e) { return { stroki: [], oshibka: e.message }; }
  fn(agent, '[проба]', BUDGET, null, null, () => {agent.wakeDriver();return true;});
  await new Promise((r) => setTimeout(r, ZHDAT));
  return { stroki, oshibka: null };
}


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


t('занят весь срок: строка есть и она НЕ беда',
  R.zanyat.stroki.length === 1 && !/🔴/.test(odna(R.zanyat)), odna(R.zanyat));
t('занят весь срок: названо ЧИСЛО проверок',
  /занят все \d+ проверок из \d+/.test(odna(R.zanyat)), odna(R.zanyat));
t('занят весь срок: сказано, что состояние штатное',
  /штатн/.test(odna(R.zanyat)), odna(R.zanyat));


t('забрано: строка есть и она НЕ беда',
  R.zabrano.stroki.length === 1 && !/🔴/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано: названо время и число проверок',
  /забрано за [\d.]+ с: побудок \d+, проверок \d+/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано после побудок: побудок больше нуля',
  /побудок [1-9]/.test(odna(R.zabrano)), odna(R.zabrano));
t('забрано после побудок: пометки про первую проверку НЕТ',
  !/пуста уже на первой/.test(odna(R.zabrano)), odna(R.zabrano));


t('пусто с первой проверки: случай помечен вслух',
  /пуста уже на первой проверке/.test(odna(R.srazu)), odna(R.srazu));
t('пусто с первой проверки: это НЕ беда',
  !/🔴/.test(odna(R.srazu)), odna(R.srazu));


t('свободен и висит: строка помечена бедой',
  /🔴/.test(odna(R.svoboden)), odna(R.svoboden));
t('свободен и висит: названо, сколько проверок агент был свободен',
  /свободен \d+ проверок из \d+/.test(odna(R.svoboden)), odna(R.svoboden));
t('свободен и висит: побудки реально делались', vzyato > 0, `вызовов wakeDriver: ${vzyato}`);


t('очередь недоступна: беда с причиной',
  /🔴/.test(odna(R.netOch)) && /очередь агента недоступна/.test(odna(R.netOch)), odna(R.netOch));
t('wakeDriver недоступен: беда с причиной',
  /🔴/.test(odna(R.netWake)) && /wakeDriver недоступен/.test(odna(R.netWake)), odna(R.netWake));


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


const pobudki = async (otmetka) => {
  const a = { status: 'idle', n: 0, inbox: { get hasPending() { return true; } },
              wakeDriver() { this.n++; } };
  const stroki = [];
  mk()((m) => stroki.push(String(m)))(a, '[стоп]', BUDGET, otmetka, null, () => {a.wakeDriver();return true;});
  await new Promise((r) => setTimeout(r, ZHDAT));
  return { n: a.n, stroki };
};
const svezhij = await pobudki(() => ({ kogda: Date.now() + 10, why: 'session limit' }));
t('свежий обрыв → побудки ОСТАНОВЛЕНЫ', svezhij.n === 0, `побудок ${svezhij.n}`);
t('стоп назван ОДНОЙ внятной строкой, с причиной',
  svezhij.stroki.some((x) => x.includes('СТОП ПОБУДОК') && x.includes('session limit')),
  svezhij.stroki[0] ?? '(молчит)');
const bezObryva = await pobudki(() => null);
t('обрыва нет → будит как прежде', bezObryva.n >= 2, `побудок ${bezObryva.n}`);
const staryj = await pobudki(() => ({ kogda: Date.now() - 60000, why: 'старая ошибка' }));
t('СТАРЫЙ обрыв не запирает побудки', staryj.n >= 2, `побудок ${staryj.n}`);


t('функция не тянет внешних имён (самодостаточна)',
  !/oborvalsyaOshibkoj/.test(txt), 'в тексте функции есть ссылка на карту модуля');


console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`);
const ZHDYOM = 24;
if (ok + fail + slep !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проверок ${ok + fail + slep}, а стенд состоит из ${ZHDYOM}`);
  process.exit(2);
}
process.exit(fail ? 1 : (slep ? 2 : 0));
