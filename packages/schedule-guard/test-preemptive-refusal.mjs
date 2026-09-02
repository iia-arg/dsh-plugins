// Стенд упреждающего отказа: импортирует ПРЕДМЕТ (guard) и дёргает его РЕАЛЬНЫЙ хук
// tools/execute, а не свою копию. Порча src:141 (every >= -> every >) и порча потолка
// (>= на >) обязаны дать код 1 с именем разошедшегося случая.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const SRC = process.argv[2] || new URL('./src/index.js', import.meta.url).pathname;

let apply;
try {
  ({ apply } = await import(pathToFileURL(SRC).href));
} catch (e) {
  console.log(`СЛЕПОТА: не загружается предмет ${SRC} — ${e?.code || e?.message}`);
  process.exit(2);
}

// подставной ctx: ловим хук tools/execute из apply(); отдельный ctx на каждый прогон
function setup(extra) {
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
    maxPerHour: 4,
    dayBoundaryOffsetMinutes: 0,
    ...extra,
  });
  return handlers['tools/execute'];
}

let ok = 0, fail = 0;
const t = (n, c, s) => {
  if (c) { ok++; console.log(`ok   ${n}`); }
  else { fail++; console.log(`FAIL ${n}\n     ${s ?? ''}`); }
};
const next = async () => 'NEXT';

const srcText = fs.readFileSync(SRC, 'utf-8');

// ── 0. сброс полосы по ВНЕШНЕМУ слову (не жёстко по 'user') ───────────────────
t('сброс: resetKinds настраиваемо (includes, не === \'user\')',
  /resetKinds\.includes\(e\.data\?\.source\?\.kind\)/.test(srcText),
  'нет resetKinds.includes');
t('сброс: умолчание [user, a2a]',
  /resetKinds: \['user', 'a2a'\]/.test(srcText),
  'нет умолчания [user, a2a]');
t('этикетка: «без внешнего слова», не «без слова человека»',
  /без внешнего слова/.test(srcText) && !/без слова человека/.test(srcText),
  'этикетка не обновлена');


// журнал с N пробуждениями (dispatch) в последний час, разнесёнными по минутам
const now = Date.now();
const dispatches = (n) => Array.from({ length: n }, (_, i) => ({
  type: 'schedule/change',
  data: { operation: 'dispatch' },
  time: now - (n - i) * 60000,
}));
const oneShot = (nDispatches) => ({
  name: 'schedule_create',
  arguments: { after_seconds: 10 },
  agent: { session: { events: dispatches(nDispatches) } },
});

const hook = setup({});

// ── 1. шаг повтора ───────────────────────────────────────────────────────────
const r1 = await hook({ name: 'schedule_create', arguments: { every_seconds: 600 } }, next);
t('ниже порога: отказ (isError)', r1?.isError === true, JSON.stringify(r1));
t('ниже порога: код SCHEDULE_TOO_FREQUENT', r1?.error?.info?.code === 'SCHEDULE_TOO_FREQUENT', JSON.stringify(r1?.error));
const r2 = await hook({ name: 'schedule_create', arguments: { every_seconds: 1800 } }, next);
t('на пороге: пропуск', r2 === 'NEXT', JSON.stringify(r2));
const r3 = await hook({ name: 'schedule_list', arguments: {} }, next);
t('чужой инструмент: пропуск', r3 === 'NEXT', JSON.stringify(r3));
const r4 = await hook({ name: 'schedule_create', arguments: {} }, next);
t('без every_seconds: пропуск', r4 === 'NEXT', JSON.stringify(r4));

// ── 2. часовой потолок (темп одноразовых) ────────────────────────────────────
const r5 = await hook(oneShot(4), next);
t('потолок: 4 пробуждения -> одноразовый отказ (isError)', r5?.isError === true, JSON.stringify(r5));
t('потолок: код SCHEDULE_HOURLY_CAP', r5?.error?.info?.code === 'SCHEDULE_HOURLY_CAP', JSON.stringify(r5?.error));
t('потолок: назван срок освобождения', /освободится/.test(r5?.error?.message ?? ''), r5?.error?.message);
const r6 = await hook(oneShot(3), next);
t('потолок: 3 пробуждения -> пропуск', r6 === 'NEXT', JSON.stringify(r6));

// ── 3. контроль зрячести: потолок 0 = выключен, тот же прогон проходит ────────
const hookCap0 = setup({ maxPerHour: 0 });
const r7 = await hookCap0(oneShot(4), next);
t('потолок 0: 4 пробуждения -> пропуск (выключен)', r7 === 'NEXT', JSON.stringify(r7));

console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}`);
const ZHDYOM = 13;
if (ok + fail !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проверок ${ok + fail}, а стенд состоит из ${ZHDYOM}`);
  process.exit(2);
}
process.exit(fail ? 1 : 0);
