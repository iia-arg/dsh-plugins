// Стенд упреждающего отказа: импортирует ПРЕДМЕТ (guard) и дёргает его РЕАЛЬНЫЙ хук
// tools/execute, а не свою копию. Порча src:141 (every >= -> every >) и порча потолка
// (>= на >) обязаны дать код 1 с именем разошедшегося случая.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
// Проверяет полное описание из предмета настоящим defineTool, без запуска агента.
// DSH_TOOLS_MODULE — явный путь к установленному dsh-tools, если peer не доступен.
import assert from 'node:assert/strict';
import vm from 'node:vm';
let defineTool;
try { ({ defineTool } = await import(process.env.DSH_TOOLS_MODULE
  ? pathToFileURL(process.env.DSH_TOOLS_MODULE).href : '@deepseek-ai/dsh-tools')); }
catch (e) { console.log(`СЛЕПОТА: dsh-tools для defineTool не загружается — ${e?.code || 'import failed'}; задайте DSH_TOOLS_MODULE`); process.exit(2); }
const sourcePath = process.argv[2] || new URL('./src/index.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
const startMarker = 'const opisanie = ';
const endMarker = '// defineTool оборачивает описание';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert(start >= 0 && end > start, 'описание heartbeat_close не найдено');
assert.equal(source.indexOf(startMarker, start + 1), -1, 'описание неоднозначно');
const description = vm.runInNewContext('(' + source.slice(start + startMarker.length, end).trim() + ')');
assert.equal(description.name, 'heartbeat_close');
let tool;
try {
  tool = defineTool(description);
} catch (e) {
  // Голый стек TypeError не называет ПРЕДМЕТ: видно символ, но не чей он. Именно на этом
  // мы 15.09 потеряли два круга — «reading render» увело к схеме параметров, а render
  // был полем ВЫВОДА. Отказ обязан назвать, ЧТО не принято, ОТКУДА взято и ЧТО проверить.
  console.error(`\u{1F534} описание heartbeat_close НЕ ПРИНЯТО настоящим defineTool`);
  console.error(`   предмет: ${sourcePath}`);
  console.error(`   причина: ${e?.message}`);
  console.error('   проверь: поле output обязательно (options.output.render читается БЕЗ проверки),');
  console.error('   а parameters — плоская карта ИМЯ → ОПИСАНИЕ, не JSON Schema.');
  process.exit(1);
}
assert.equal(tool.name, 'heartbeat_close');
console.log('defineTool(heartbeat_close): PASS — полное описание из ' + sourcePath);
const schema = tool.output.schema;
assert.equal(schema.type, 'object');
assert.deepEqual([...schema.required].sort(), ['chisla', 'ok', 'otpravleno']);
for (const [name, type] of Object.entries({ ok: 'boolean', chisla: 'string', otpravleno: 'boolean' })) {
  assert.equal(schema.properties[name].type, type);
}
const checkContent = (content, expected) => {
  assert(Array.isArray(content), 'render должен возвращать массив блоков');
  assert(content.length > 0, 'render вернул пустой массив');
  assert(content.every(block => block.type === 'text' && typeof block.text === 'string'));
  assert(content.some(block => block.type === 'text' && block.text === expected), 'текст ответа потерян');
};
for (const [value, expected] of [
  [{ chisla: 'подряд 3, за сутки 5, всего 12' }, 'подряд 3, за сутки 5, всего 12'],
  [{ chisla: 'числа полосы недоступны: журнал сессии не читается' }, 'числа полосы недоступны: журнал сессии не читается'],
  [undefined, ''], [{}, ''], [{ chisla: '' }, ''],
]) checkContent(tool.output.render({ summary: 'проверка' }, value), expected);
console.log('output schema + render: PASS');


const SRC = process.argv[2] || new URL('./src/index.js', import.meta.url).pathname;

let apply;
try {
  ({ apply } = await import(pathToFileURL(SRC).href));
} catch (e) {
  console.log(`СЛЕПОТА: не загружается предмет ${SRC} — ${e?.code || e?.message}`);
  // Лечится без записи в чужие каталоги: положить копию предмета на свой стол и дать ей
  // node_modules платформы симлинком — тогда peer резолвится и стенд перестаёт быть слепым:
  //   D=$(mktemp -d); cp src/index.js $D/predmet.js; ln -s <платформа>/node_modules $D/node_modules
  //   DSH_TOOLS_MODULE=<платформа>/node_modules/@deepseek-ai/dsh-tools/lib/index.js node <стенд> $D/predmet.js
  process.exit(2);
}

// Регистрируем инструмент через настоящий apply: execute берётся из модуля,
// включая его счётчик. Подставлены только контекст и журнал; уведомлений нет.
for (const [events, expected] of [
  [Array.from({ length: 3 }, () => ({ type: 'schedule/change', data: { operation: 'dispatch' }, time: Date.now() })), 'подряд 3, за сутки 3, всего 3'],
  [undefined, 'числа полосы недоступны: журнал сессии не читается'],
]) {
  const hooks = {};
  let registered;
  const agent = { session: { id: 'heartbeat-test', events }, ctx: {
    effect(fn) { fn(); }, on() {},
    tools: { register(t) { registered = t; return () => {}; } },
  } };
  apply({ on(event, fn) { hooks[event] = fn; }, agents: { roots: () => [agent] } }, {});
  hooks['agent/created']({ agent });
  assert(registered, 'heartbeat_close не зарегистрирован');
  const args = { summary: 'проба вызова' };
  const value = await registered.execute(args, { agent });
  assert.equal(value.ok, true);
  assert.equal(value.otpravleno, false);
  assert.equal(value.chisla, expected);
  checkContent(registered.output.render(args, value), expected);
}
console.log('execute → render → content.some: PASS; журнал доступен/недоступен; края render: PASS');

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
// B-N-1194: настоящий вызов ВСЕГДА несёт exec.agent (dsh-tools 0.2 :3330 — носитель области); без журнала сторож теперь отказывает
// (SCHEDULE_SOURCE_UNAVAILABLE) — поэтому пробы шага идут с агентом и ПУСТЫМ журналом, как настоящий первый вызов.
const bezPobudok = { session: { events: [] } };

// ── 1. шаг повтора ───────────────────────────────────────────────────────────
const r1 = await hook({ name: 'schedule_create', arguments: { every_seconds: 600 }, agent: bezPobudok }, next);
t('ниже порога: отказ (isError)', r1?.isError === true, JSON.stringify(r1));
t('ниже порога: код SCHEDULE_TOO_FREQUENT', r1?.error?.info?.code === 'SCHEDULE_TOO_FREQUENT', JSON.stringify(r1?.error));
const r2 = await hook({ name: 'schedule_create', arguments: { every_seconds: 1800 }, agent: bezPobudok }, next);
t('на пороге: пропуск', r2 === 'NEXT', JSON.stringify(r2));
const r3 = await hook({ name: 'schedule_list', arguments: {} }, next);
t('чужой инструмент: пропуск', r3 === 'NEXT', JSON.stringify(r3));
const r4 = await hook({ name: 'schedule_create', arguments: {}, agent: bezPobudok }, next);
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
