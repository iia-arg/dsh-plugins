// RU: Изолированный стенд stend-imena.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-imena.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let s;
try {
  s = fs.readFileSync(SRC, 'utf-8');
} catch (e) {
  console.log(`СЛЕПОТА: не читается ${SRC} — ${e.code || e.message}`);
  process.exit(2);
}
let ok = 0, fail = 0, slep = 0;
const t = (name, cond, syrio) => { if (cond) { ok++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}\n     сырьё: ${syrio}`); } };


const decl = s.match(/const who_ = ([^;]+);/);
t('who_ объявлена из config.agentName', !!decl && /config\.agentName/.test(decl[1]),
  decl ? decl[1] : '(объявления нет)');


const YAVNYJ_SPISOK = process.argv[3] || process.env.STEND_IMENA_FILE
const FAJL_IMEN = YAVNYJ_SPISOK || path.join(path.dirname(fileURLToPath(import.meta.url)), 'chastnye-imena.json')
let SPISOK_IMEN = null
let IMENA_VNE_PREDMETA = false
try {
  const fd = fs.openSync(FAJL_IMEN, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('список должен быть обычным JSON-файлом')
    SPISOK_IMEN = JSON.parse(fs.readFileSync(fd, 'utf-8')).imena
  } finally { fs.closeSync(fd) }
  if (!Array.isArray(SPISOK_IMEN) || !SPISOK_IMEN.length
    || SPISOK_IMEN.some((im) => typeof im !== 'string' || !im.trim())) {
    throw new Error('список imena должен быть непустым массивом непустых строк')
  }
} catch (e) {
  SPISOK_IMEN = null
  // RU: Явный либо повреждённый список не подменяем. Без штатного файла используем готовый источник IMYA.
  // EN: Do not replace explicit or damaged lists. Without the default file use the ready IMYA source.
  let netShtatnogoFajla = false
  if (!YAVNYJ_SPISOK && e.code === 'ENOENT') {
    try { netShtatnogoFajla = !fs.lstatSync(FAJL_IMEN, { throwIfNoEntry: false }) } catch {}
  }
  if (!netShtatnogoFajla) {
    console.log(`СЛЕПОТА: список частных имён ${FAJL_IMEN} недоступен или негоден (${e.code || 'формат JSON/imena'}); проверка не состоялась`)
    process.exit(2)
  }
  // RU: A-N-1507 (слово владельца 09.10.2026 18:33 МСК): имена агентов, людей и машин — больше не находка; ворота
  // vorota-obezlichivaniya стали воротами секретов и класса IMYA не дают. Без штатного списка имена не проверяются вовсе —
  // это граница по решению, а не слепота: проверки ниже (who_, затенение, умолчание) идут как прежде.
  // EN: A-N-1507: names are no longer a finding; without the default list the name checks are out of scope, not blind.
  IMENA_VNE_PREDMETA = true
  console.log('---  имена не проверяются: штатного списка нет, класс имён снят словом владельца 09.10.2026 (A-N-1507)')
}
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  const svoj = fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8')


  const bezZashity = svoj.split('\n').filter((l) => !/!\/[^/]+\/\.test\(/.test(l)).join('\n')
  const najdeno = SPISOK_IMEN.filter((im) => bezZashity.includes(im))
  t(`в стенде нет частных имён как данных (проверено имён ${SPISOK_IMEN.length} из ${SPISOK_IMEN.length}, файл ${path.basename(FAJL_IMEN)})`,
    najdeno.length === 0, najdeno.length ? `найдено: ${najdeno.join(', ')}` : 'ни одного')
}


const alertLine = s.split('\n').find((l) => l.includes('Чужой написал'));
t('тревога о чужом использует who_', !!alertLine && /\$\{who_\}/.test(alertLine), String(alertLine));


const netKlichki = (line) => !SPISOK_IMEN.some((im) => line.includes(im));
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  t('тревога о чужом без клички соседа', !!alertLine && netKlichki(alertLine), String(alertLine));
} else if (!IMENA_VNE_PREDMETA) {
  console.log('---  кличка не проверена в строке тревоги: списка имён нет');
  slep += 1;
}


t('внутри ветки чужого who действительно затенена',
  /const who = msg\.from \?\? \{\};/.test(s),
  `затенений найдено: ${(s.match(/const who = msg\.from \?\? \{\};/g) ?? []).length}`);


const hi = s.split('\n').find((l) => l.includes('на связи. Пишите задачу'));
t('приветствие использует who_', !!hi && /\$\{who_\}/.test(hi), String(hi));
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  t('приветствие без клички соседа', !!hi && netKlichki(hi), String(hi));
} else if (!IMENA_VNE_PREDMETA) {
  console.log('---  кличка не проверена в приветствии: списка имён нет');
  slep += 1;
}


if (!decl || !alertLine) {
  console.log('---  подстановка и умолчание НЕ ПРОВЕРЕНЫ: нет объявления who_ или строки тревоги');
} else {


  const config = { agentName: 'агент-проба' };
  const who_ = eval(decl[1]);
  const who = { first_name: 'Чужой' };
  const alert = eval('`' + alertLine.split('`')[1] + '`');
  t('подстановка даёт имя, а не [object Object]',
    alert.includes('агент-проба') && !alert.includes('[object Object]'), alert.trim());


  const config2 = {}; const who2 = eval(decl[1].replace('config.', 'config2.'));
  t('без настройки — нейтральное слово, не пусто', who2 === 'агент', String(who2));
}


t('расшифровка берётся из config.transcribeCommand',
  /spawn\(config\.transcribeCommand,/.test(s), 'spawn(config.transcribeCommand,');
t('зашитого пути расшифровки не осталось',
  !/(?:execFile(?:Sync)?|spawn)\('\/usr\/local\/bin\//.test(s),
  `зашитых вызовов: ${(s.match(/(?:execFile(?:Sync)?|spawn)\('\/usr\/local\/bin\/[^']*'/g) ?? []).join(', ') || 'нет'}`);
t('не задана — говорит в журнал и возвращает null',
  /не задан config\.transcribeCommand/.test(s),
  `вхождений строки отказа: ${(s.match(/не задан config\.transcribeCommand/g) ?? []).length}`);


const sayTo = s.slice(s.indexOf('async function sayTo'), s.indexOf('async function sayTo') + 600);
t('sayTo проверяет A2A_OUT ДО mkdirSync',
  sayTo.indexOf('if (!A2A_OUT)') > -1 && sayTo.indexOf('if (!A2A_OUT)') < sayTo.indexOf('mkdirSync'),
  sayTo.split('\n').slice(1, 4).join(' | '));


t('source письма — agent-message/relay с отправителем', /source: \{ kind: 'agent-message', form: 'relay', senderSessionId: `a2a:\$\{sender\|\|channel\}` \}/.test(s),
  `видов источника в файле: ${(s.match(/source: \{ kind: '[^']+' \}/g) ?? []).join(', ') || 'ни одного'}`);


t('подсказка о правах не называет чужого владельца',
  !/chown dsh:dsh/.test(s), `вхождений «chown dsh:dsh»: ${(s.match(/chown dsh:dsh/g) ?? []).length}`);


t('нет утверждения «модуль общий для машины»',
  !/модуль общий для машины/.test(s),
  `вхождений: ${(s.match(/модуль общий для машины/g) ?? []).length}`);


if (IMENA_VNE_PREDMETA) {
  console.log('\nОБЛАСТЬ: имена НЕ проверяются — штатного списка нет, класс имён снят словом владельца 09.10.2026 (A-N-1507). Проверены подстановка who_ в тревоге и приветствии, затенение who, умолчание; кличка соседа в этих строках не проверяется.')
} else console.log(`\nОБЛАСТЬ: имена как ДАННЫЕ ищутся только в самом стенде `
  + `(${Array.isArray(SPISOK_IMEN) ? SPISOK_IMEN.length : 0} имён из списка). `
  + `В предмете ${path.basename(SRC)} кличка проверяется ТОЛЬКО в двух строках — `
  + `тревога о чужом и приветствие. Остальной файл и остальные файлы пакета `
  + `на имена НЕ проверяются НИКЕМ — стенда по всему составу у этого пакета нет.`);
console.log(`\nИТОГ: ok=${ok} fail=${fail} слепота=${slep}`);


process.exit(fail ? 1 : slep ? 2 : 0);
