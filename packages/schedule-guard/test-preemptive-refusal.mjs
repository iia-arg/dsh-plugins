// Стенд упреждающего отказа: импортирует ПРЕДМЕТ (guard) и дёргает его РЕАЛЬНЫЙ хук
// tools/execute, а не свою копию. Порча src:141 (every >= -> every >) обязана дать код 1
// с именем разошедшегося случая.
import { pathToFileURL } from 'node:url';

const SRC = process.argv[2] || new URL('./src/index.js', import.meta.url).pathname;

let apply;
try {
  ({ apply } = await import(pathToFileURL(SRC).href));
} catch (e) {
  console.log(`СЛЕПОТА: не загружается предмет ${SRC} — ${e?.code || e?.message}`);
  process.exit(2);
}

// подставной ctx: ловим хук tools/execute из apply()
const handlers = {};
const ctx = {
  on(ev, h) { handlers[ev] = h; return () => {}; },
  agents: { roots: () => [], withoutInitiator: (fn) => fn() },
  sessions: { flush: async () => true },
};

apply(ctx, {
  minRepeatingIntervalSeconds: 1800,
  maxConsecutiveWakeups: 6,
  maxPerDay: 48,
  dayBoundaryOffsetMinutes: 0,
});

const hook = handlers['tools/execute'];
if (!hook) {
  console.log('СЛЕПОТА: хук tools/execute не зарегистрирован — guard INERT?');
  process.exit(2);
}

let ok = 0, fail = 0;
const t = (n, c, s) => {
  if (c) { ok++; console.log(`ok   ${n}`); }
  else { fail++; console.log(`FAIL ${n}\n     ${s ?? ''}`); }
};
const next = async () => 'NEXT';

// 1. ниже порога — отказ с причиной и кодом
const r1 = await hook({ name: 'schedule_create', arguments: { every_seconds: 600 } }, next);
t('ниже порога: отказ (isError)', r1?.isError === true, JSON.stringify(r1));
t('ниже порога: код SCHEDULE_TOO_FREQUENT', r1?.error?.info?.code === 'SCHEDULE_TOO_FREQUENT', JSON.stringify(r1?.error));

// 2. на пороге — пропуск (ровно тут ловится порча every >= -> every >)
const r2 = await hook({ name: 'schedule_create', arguments: { every_seconds: 1800 } }, next);
t('на пороге: пропуск', r2 === 'NEXT', JSON.stringify(r2));

// 3. чужой инструмент — пропуск
const r3 = await hook({ name: 'schedule_list', arguments: {} }, next);
t('чужой инструмент: пропуск', r3 === 'NEXT', JSON.stringify(r3));

// 4. без every_seconds — пропуск
const r4 = await hook({ name: 'schedule_create', arguments: {} }, next);
t('без every_seconds: пропуск', r4 === 'NEXT', JSON.stringify(r4));

console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}`);
const ZHDYOM = 5;
if (ok + fail !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проверок ${ok + fail}, а стенд состоит из ${ZHDYOM}`);
  process.exit(2);
}
process.exit(fail ? 1 : 0);
