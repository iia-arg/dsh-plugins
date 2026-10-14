#!/usr/bin/env node
// RU: Изолированный стенд test-goal-control.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness test-goal-control.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource, extractFunction, extractConst } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const SRC_FILE = path.join(PKG, 'src', 'index.js');

let ok = 0, bad = 0, blind = 0;
const pass = (t, raw) => { ok++; console.log(`  ok   ${t}${raw !== undefined ? `   [${raw}]` : ''}`); };
const fail = (t, raw) => { bad++; console.log(`  FAIL ${t}${raw !== undefined ? `   [${raw}]` : ''}`); };
const blin = (t, raw) => { blind++; console.log(`  ??   ${t} — СТЕНД НЕ СМОГ ПРОВЕРИТЬ${raw !== undefined ? `   [${raw}]` : ''}`); };
const eq = (t, got, want) => (String(got) === String(want) ? pass(t, `got=${got}`) : fail(t, `got=${got} want=${want}`));

let src;
try { src = readSource(SRC_FILE); }
catch (e) { console.error(`СТЕНД СЛЕП: не читается ${SRC_FILE}: ${e.message}`); process.exit(2); }


console.log('0. целость манифеста');
try {
  const pj = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf-8'));
  const promised = new Set([...(pj.files ?? []), pj.main, pj.dsh?.bundle?.patch].filter(Boolean)
    .map((f) => f.replace(/^\.\//, '')));
  for (const f of promised) {
    fs.existsSync(path.join(PKG, f))
      ? pass(`манифест обещает ${f} — файл на месте`)
      : fail(`манифест обещает ${f}, а его на диске НЕТ`);
  }


  // A-N-1882 F07 (класс B-N-1862): рабочая форма версии — X.Y.Z или X.Y.Z-<буква><номер пункта> (2.5.117-b1845, 2.5.118-a1881).
  /^\d+\.\d+\.\d+(-[a-z]\d+)?$/.test(String(pj.version || ''))
    ? pass('версия объявлена и имеет форму X.Y.Z[-<буква><пункт>]', `got=${pj.version}`)
    : fail('версия объявлена и имеет форму X.Y.Z[-<буква><пункт>]', `got=${pj.version}`);
} catch (e) { blin('манифест', e.message); }


console.log('1. счётчик постановок');
try {
  const MAX = Number(extractConst(src, 'GOAL_MAX_PER_HOUR'));
  eq('предел из файла', MAX, 3);
  const goalStarts = new Map();
  const goalRateOk = new Function('goalStarts', 'GOAL_MAX_PER_HOUR',
    `${extractFunction(src, 'goalRateOk')}; return goalRateOk;`)(goalStarts, MAX);
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (goalRateOk('tg')) { allowed++; goalStarts.get('tg').push(Date.now()); }
  eq(`из пяти подряд пропущено ${MAX}`, allowed, MAX);

  goalStarts.set('tg', [Date.now() - 3600001, Date.now() - 3600001, Date.now() - 3600001]);
  eq('метки старше часа не считаются', goalRateOk('tg'), true);

  goalStarts.set('tg', [Date.now(), Date.now(), Date.now()]);
  eq('канал tg исчерпан', goalRateOk('tg'), false);
  eq('канал a2a при этом свободен', goalRateOk('a2a'), true);
} catch (e) { blin('счётчик', e.message); }


console.log('2. заголовок отправителя');
try {
  const splitSender = new Function(`${extractFunction(src, 'splitSender')}; return splitSender;`)();
  let r = splitSender('From: coordinator\n/goal сделать дело');
  eq('имя разобрано', r.sender, 'coordinator');
  eq('заголовок отрезан', r.text, '/goal сделать дело');
  r = splitSender('просто текст без заголовка');
  eq('без заголовка — имени нет', r.sender, undefined);
  eq('без заголовка текст цел', r.text, 'просто текст без заголовка');
  r = splitSender('From: coordinator');
  eq('заголовок без тела — пустой текст', r.text, '');
  r = splitSender('From: two words\nтело');
  eq('имя с пробелом заголовком не считается', r.sender, undefined);
} catch (e) { blin('splitSender', e.message); }


console.log('3. ожидание сервиса');
try {
  const lines = [];
  const log = (m) => lines.push(m);
  const mk = (ctx) => new Function('ctx', 'log', `${extractFunction(src, 'waitService')}; return waitService;`)(ctx, log);

  let calls = 0;
  const late = mk({ get: () => (++calls >= 3 ? { real: true } : undefined) });
  const t0 = Date.now();
  const got = await late('goals', '[t]', 'последствие названо', 5);
  const spent = Date.now() - t0;
  got ? pass(`сервис дождались за ${spent} мс`, `попыток=${calls}`) : fail('сервис не дождались, хотя он появился');
  lines.some((l) => l.includes('ещё не активен')) ? pass('о начале ожидания сказано') : fail('ожидание молчаливое');

  lines.length = 0;
  const never = mk({ get: () => undefined });
  const none = await never('goals', '[t]', 'ПОСЛЕДСТВИЕ-МЕТКА', 2);
  eq('не дождались — undefined', none, undefined);
  lines.some((l) => l.includes('ПОСЛЕДСТВИЕ-МЕТКА'))
    ? pass('последствие названо в журнале', lines[lines.length - 1])
    : fail('последствие НЕ названо', lines.join(' | '));

  lines.length = 0;
  const now = mk({ get: () => ({ real: true }) });
  await now('goals', '[t]', 'последствие', 5);
  lines.length === 0 ? pass('сервис готов сразу — лишних строк нет') : fail('печатает, когда ждать не пришлось', lines.join(' | '));
} catch (e) { blin('waitService', e.message); }


console.log('4. команда /goal на подставных сервисах');
try {
  const lines = [];
  const log = (m) => lines.push(m);
  const goalStarts = new Map();
  const goalOrigin = new Map();
  const agent = { session: { id: 'sess-1' } };
  let created = null;
  const goals = {
    get: () => created,
    create: (_a, { objective }) => (created = { id: 'g1', revision: 1, phase: 'active', roundsStarted: 0, maxGoalRounds: 12, objective }),
    edit: (_a, _k, { objective }) => (created = { ...created, revision: created.revision + 1, objective }),
    clear: () => { created = null; },
  };
  const marker = { guidance: (id, rev, tools) => `НАСТАВЛЕНИЕ ${id}/${rev} ${tools ? tools.update : 'без-инструментов'}` };
  const bridge = { modelToolName: (n) => `mcp__srv__${n}` };
  const services = { goals, goalMarker: marker, mcpBridge: bridge };
  const ctx = { get: (n) => services[n] };

  const src4 = `${extractFunction(src, 'waitService')}\n${extractFunction(src, 'goalRateOk')}\n${extractFunction(src, 'goalCommand')}\n; return goalCommand;`;
  const goalCommand = new Function('ctx', 'log', 'goalStarts', 'goalOrigin', 'GOAL_MAX_PER_HOUR', 'GOAL_WAIT_TRIES', src4)(
    ctx, log, goalStarts, goalOrigin, Number(extractConst(src, 'GOAL_MAX_PER_HOUR')), 1);

  let r = await goalCommand('/goal', 'tg', agent);
  eq('цели нет — так и сказано', r, 'Цели нет.');

  r = await goalCommand('/goal разобрать отказы', 'tg', agent);
  r.includes('поставлена') ? pass('цель поставлена', r) : fail('цель не поставлена', r);
  created.objective.includes('НАСТАВЛЕНИЕ g1/2 mcp__srv__update_goal')
    ? pass('наставление сложено с именем инструмента ОТ МОСТА', created.objective.split('\n').pop())
    : fail('наставление без имени инструмента моста', created.objective);
  eq('происхождение цели запомнено', goalOrigin.get('sess-1')?.channel, 'tg');

  r = await goalCommand('/goal', 'tg', agent);
  r.startsWith('Цель g1: active') ? pass('состояние показано', r.split('\n')[0]) : fail('состояние не показано', r);

  r = await goalCommand('/goal stop', 'tg', agent);
  eq('цель снята', r, 'Цель g1 снята.');
  eq('происхождение забыто', goalOrigin.has('sess-1'), false);


  goalStarts.set('a2a', [Date.now(), Date.now(), Date.now()]);
  r = await goalCommand('/goal ещё одна', 'a2a', agent);
  r.includes('Предел') ? pass('четвёртая за час отвергнута', r) : fail('предел не сработал', r);


  created = { id: 'g2', revision: 1, phase: 'active', roundsStarted: 1, maxGoalRounds: 12, objective: 'x' };
  r = await goalCommand('/goal stop', 'a2a', agent);
  eq('снятие при исчерпанном пределе разрешено', r, 'Цель g2 снята.');


  const lines2 = [];
  const goalCommand2 = new Function('ctx', 'log', 'goalStarts', 'goalOrigin', 'GOAL_MAX_PER_HOUR', 'GOAL_WAIT_TRIES', src4)(
    { get: () => undefined }, (m) => lines2.push(m), new Map(), new Map(), 3, 1);
  r = await goalCommand2('/goal что-нибудь', 'tg', agent);
  r.includes('не подключён') ? pass('без сервиса целей отказ внятный', r) : fail('без сервиса целей ответ невнятный', r);
  lines2.some((l) => l.includes('невыполнима')) ? pass('и последствие названо в журнале', lines2[lines2.length - 1]) : fail('журнал молчит об отказе', lines2.join(' | '));


  const lines3 = [];
  let created3 = null;
  const goals3 = { get: () => created3,
    create: (_a, { objective }) => (created3 = { id: 'g3', revision: 1, phase: 'active', roundsStarted: 0, maxGoalRounds: 12, objective }),
    edit: () => { throw new Error('edit не должен зваться без маркера'); }, clear: () => {} };
  const goalCommand3 = new Function('ctx', 'log', 'goalStarts', 'goalOrigin', 'GOAL_MAX_PER_HOUR', 'GOAL_WAIT_TRIES', src4)(
    { get: (n) => (n === 'goals' ? goals3 : undefined) }, (m) => lines3.push(m), new Map(), new Map(), 3, 1);
  r = await goalCommand3('/goal без маркера', 'tg', agent);
  r.includes('поставлена') ? pass('без маркера цель всё равно поставлена', r) : fail('без маркера постановка сорвалась', r);
  lines3.some((l) => l.includes('goalMarker') && l.includes('предела раундов'))
    ? pass('последствие отсутствия маркера названо')
    : fail('об отсутствии маркера промолчали', lines3.join(' | '));
} catch (e) { blin('goalCommand', e.message); }


console.log('5. README, патч и код говорят одно');
try {
  const readme = fs.readFileSync(path.join(PKG, 'README.md'), 'utf-8');
  const patch = fs.readFileSync(path.join(PKG, 'cordis.patch.yml'), 'utf-8');
  for (const field of ['goalUsers', 'goalA2ASenders']) {
    const inCode = src.includes(`config.${field}`);
    const inReadme = readme.includes(`\`${field}\``);
    const inPatch = patch.includes(`${field}:`);
    (inCode && inReadme && inPatch)
      ? pass(`${field}: код+README+патч`, `код=${inCode} readme=${inReadme} патч=${inPatch}`)
      : fail(`${field} описан не везде`, `код=${inCode} readme=${inReadme} патч=${inPatch}`);
  }
  const maxInCode = extractConst(src, 'GOAL_MAX_PER_HOUR');


  // A-N-1871: смысл, а не одно слово — предел рядом с единицей времени («час», «hour», «/ч») в любом порядке.
  const edinica = '(час|hour|/ч)';
  const predelVReadme = new RegExp(`\\b${maxInCode}\\b[^.\\n]{0,60}${edinica}`, 'i').test(readme)
                     || new RegExp(`${edinica}[^.\\n]{0,60}\\b${maxInCode}\\b`, 'i').test(readme);
  predelVReadme
    ? pass('предел в README и в коде сходится', `код=${maxInCode}`)
    : fail('предел в README разошёлся с кодом', `код=${maxInCode}, в README не найден рядом со словом «час»`);
} catch (e) { blin('README', e.message); }


console.log(`\nитог: ok=${ok} FAIL=${bad} слепота=${blind}`);
process.exit(bad > 0 ? 1 : (blind > 0 ? 2 : 0));
