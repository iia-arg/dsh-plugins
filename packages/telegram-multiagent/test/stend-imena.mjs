// Стенд правки «имена из настройки». Строки берутся ИЗ файла, не пишутся заново.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 🔴 Путь по умолчанию — УСТАНОВЛЕННЫЙ файл рядом со стендом. Без него стенд,
// запущенный без довода (а в приёмке списком его запускают именно так), падал
// сырым TypeError и читался кодом 1 — то есть слепота проверки выглядела отказом
// предмета. Аргументом по-прежнему можно указать другую копию.
const SRC = process.argv[2]
  || new URL('../src/index.js', import.meta.url).pathname;
let s;
try {
  s = fs.readFileSync(SRC, 'utf-8');
} catch (e) {
  console.log(`СЛЕПОТА: не читается ${SRC} — ${e.code || e.message}`);
  process.exit(2);          // 2 = не смогла проверить. Это НЕ «сошлось» и НЕ отказ.
}
let ok = 0, fail = 0, slep = 0;
const t = (name, cond, syrio) => { if (cond) { ok++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}\n     сырьё: ${syrio}`); } };

// 1. Объявление who_ есть и берёт значение из настройки.
const decl = s.match(/const who_ = ([^;]+);/);
t('who_ объявлена из config.agentName', !!decl && /config\.agentName/.test(decl[1]),
  decl ? decl[1] : '(объявления нет)');

// 🔴 СПИСОК ЧАСТНЫХ ИМЁН ЖИВЁТ ФАЙЛОМ РЯДОМ, А НЕ В ГОЛОВЕ ПРОВЕРЯЮЩЕГО.
// Прецедент 01.09.2026: три обхода одного файла дали 0, 2 и 4 находки. Причём
// второй обход был ХУЖЕ первого не по списку, а по его СУЖЕНИЮ: первый шёл по
// полному списку латиницей и дал ноль; после провала проверяющий перезапросил ОДНО
// имя — то, что уже видел, — нашёл ожидаемое и счёл поиск законченным.
// 🔴 Список схлопнулся при первой находке. Это опаснее забытого имени: там дыра
// видна при перечитывании, здесь список БЫЛ полным и стал неполным незаметно.
// Поэтому: список в файле, прогоняется ВЕСЬ ВСЕГДА, и покрытие по нему печатается —
// без числа «имён N из N» сужение снова стало бы невидимым.
const FAJL_IMEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'chastnye-imena.json')
let SPISOK_IMEN = null
try {
  SPISOK_IMEN = JSON.parse(fs.readFileSync(FAJL_IMEN, 'utf-8')).imena
} catch (e) {
  // У постороннего установившего файла нет и быть не должно: список наших имён —
  // частные данные, он не входит в состав пакета. Это СЛЕПОТА, а не беда.
  console.log(`---  список частных имён не прочитан (${FAJL_IMEN}): ${e.code ?? e.message}`)
  console.log('---  проверка обезличенности НЕ СОСТОЯЛАСЬ; у стороннего установившего это норма')
  slep += 1
}
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  const svoj = fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8')
  // Из обхода исключаются строки, где имя И ЕСТЬ предмет проверки: отрицания вида
  // !/Имя/.test(...) — там оно обязано присутствовать, иначе проверять нечего.
  const bezZashity = svoj.split('\n').filter((l) => !/!\/[^/]+\/\.test\(/.test(l)).join('\n')
  const najdeno = SPISOK_IMEN.filter((im) => bezZashity.includes(im))
  t(`в стенде нет частных имён как данных (проверено имён ${SPISOK_IMEN.length} из ${SPISOK_IMEN.length}, файл ${path.basename(FAJL_IMEN)})`,
    najdeno.length === 0, najdeno.length ? `найдено: ${najdeno.join(', ')}` : 'ни одного')
}

// 🔴 НИЖЕ ДВАЖДЫ ВСТРЕЧАЕТСЯ ЧАСТНОЕ ИМЯ — И ЭТО НЕ ГРЯЗЬ, А ЗАЩИТА.
// Стенд проверяет, что кличка конкретного агента НЕ попала в код: имя стоит
// внутри отрицания (!/.../.test(...)), то есть проверка краснеет, если имя
// появится в предмете. Уберёшь эти два вхождения «чтобы обезличить файл» —
// снимешь единственную проверку от возврата клички. Защита, выглядящая как
// грязь, вычищается из лучших побуждений; поэтому объяснение стоит здесь, а не
// в отчёте, который читатель файла не увидит.
// 2. Ветка отказа чужому: используется who_, а НЕ who (та затенена msg.from).
const alertLine = s.split('\n').find((l) => l.includes('Чужой написал'));
t('тревога о чужом использует who_', !!alertLine && /\$\{who_\}/.test(alertLine), String(alertLine));
// 🔴 ИСКОМОЕ ИМЯ — ДАННЫМИ, А НЕ ЛИТЕРАЛОМ. Прежняя редакция несла кличку
// соседа прямо здесь: проверка была верной, но сама публиковала то, что искала —
// файл уезжает в пакет. Теперь кличка берётся из списка вне пакета; нет списка —
// СЛЕПОТА, а не молчаливое «чисто» (у постороннего проверять нечем по построению).
const netKlichki = (line) => !SPISOK_IMEN.some((im) => line.includes(im));
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  t('тревога о чужом без клички соседа', !!alertLine && netKlichki(alertLine), String(alertLine));
} else {
  console.log('---  кличка не проверена в строке тревоги: списка имён нет');
  slep += 1;
}

// 3. Затенение существует — значит who_ не блажь: проверяем фактом по файлу.
t('внутри ветки чужого who действительно затенена',
  /const who = msg\.from \?\? \{\};/.test(s),
  `затенений найдено: ${(s.match(/const who = msg\.from \?\? \{\};/g) ?? []).length}`);

// 4. Приветствие /start.
const hi = s.split('\n').find((l) => l.includes('на связи. Пишите задачу'));
t('приветствие использует who_', !!hi && /\$\{who_\}/.test(hi), String(hi));
if (Array.isArray(SPISOK_IMEN) && SPISOK_IMEN.length) {
  t('приветствие без клички соседа', !!hi && netKlichki(hi), String(hi));
} else {
  console.log('---  кличка не проверена в приветствии: списка имён нет');
  slep += 1;
}

// 5. Поведение подстановки — проверяем ИСПОЛНЕНИЕМ, а не глазом.
// 🔴 Проверки 5-6 требуют объявления who_ и строки тревоги. Нет их — стенд обязан
// СКАЗАТЬ, что не смог измерить, а не упасть сырым TypeError: падение читается
// как «стенд сломан», хотя сломан предмет. Отделяем слепоту от отказа.
if (!decl || !alertLine) {
  console.log('---  подстановка и умолчание НЕ ПРОВЕРЕНЫ: нет объявления who_ или строки тревоги');
} else {
  // Фикстура НЕЙТРАЛЬНАЯ: годится любое имя, и частное было выбрано по привычке.
  // Файл едет в пакет — частное имя увидел бы каждый установивший.
  const config = { agentName: 'агент-проба' };
  const who_ = eval(decl[1]);
  const who = { first_name: 'Чужой' };            // то самое затенение
  const alert = eval('`' + alertLine.split('`')[1] + '`');
  t('подстановка даёт имя, а не [object Object]',
    alert.includes('агент-проба') && !alert.includes('[object Object]'), alert.trim());

  // 6. Умолчание, когда agentName не задан.
  const config2 = {}; const who2 = eval(decl[1].replace('config.', 'config2.'));
  t('без настройки — нейтральное слово, не пусто', who2 === 'агент', String(who2));
}

// 7. Команда расшифровки — настройкой, с громким отказом.
t('расшифровка берётся из config.transcribeCommand',
  /execFileSync\(config\.transcribeCommand,/.test(s), 'execFileSync(config.transcribeCommand,');
t('зашитого пути расшифровки не осталось',
  !/execFileSync\('\/usr\/local\/bin\//.test(s),
  `зашитых вызовов: ${(s.match(/execFileSync\('\/usr\/local\/bin\/[^']*'/g) ?? []).join(', ') || 'нет'}`);
t('не задана — говорит в журнал и возвращает null',
  /не задан config\.transcribeCommand/.test(s),
  `вхождений строки отказа: ${(s.match(/не задан config\.transcribeCommand/g) ?? []).length}`);

// 8. sayTo: каталог обмена не задан — сказать, а не падать в mkdirSync(undefined).
const sayTo = s.slice(s.indexOf('async function sayTo'), s.indexOf('async function sayTo') + 600);
t('sayTo проверяет A2A_OUT ДО mkdirSync',
  sayTo.indexOf('if (!A2A_OUT)') > -1 && sayTo.indexOf('if (!A2A_OUT)') < sayTo.indexOf('mkdirSync'),
  sayTo.split('\n').slice(1, 4).join(' | '));

// 9. НАШ вид источника не потерян (его отсутствие сняло бы право в мосте).
t('source kind a2a сохранён', /source: \{ kind: 'a2a' \}/.test(s),
  `видов источника в файле: ${(s.match(/source: \{ kind: '[^']+' \}/g) ?? []).join(', ') || 'ни одного'}`);

// 10. Подсказка о правах не адресует чужой дом.
t('подсказка о правах не называет чужого владельца',
  !/chown dsh:dsh/.test(s), `вхождений «chown dsh:dsh»: ${(s.match(/chown dsh:dsh/g) ?? []).length}`);

// 11. Устаревшее про «общий модуль» вычищено.
t('нет утверждения «модуль общий для машины»',
  !/модуль общий для машины/.test(s),
  `вхождений: ${(s.match(/модуль общий для машины/g) ?? []).length}`);

console.log(`\nИТОГ: ok=${ok} fail=${fail} слепота=${slep}`);
// 🔴 Код 0 ТОЛЬКО когда всё состоялось и сошлось. Слепота — код 2: «проверить
// нечем» и «проверил, всё хорошо» это разные новости, и машина, читающая код,
// не должна принимать первое за второе.
process.exit(fail ? 1 : slep ? 2 : 0);
