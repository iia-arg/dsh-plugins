/**
 * RU: Стенд README: описание обязано совпадать с кодом. Разошлись — виноват тот, кто правил код и не тронул
 *     README; в работе читают README.
 *     Читает README.md, README.en.md и src/index.js. Требования к README.md: названы все PORYADKI; умолчания
 *     predel и porogVery стоят в таблице как «| число |»; назван способ замера единиц (dsh-compaction, exports,
 *     дата 03.09); есть «МОЛЧА», «не измерял», SIMVOLOV_NA_EDINICU, «НЕ является»; строка со словом «стенд» и
 *     числом «N проб», где N — число строк proba( в стендах; число стендов словом («пять»). К README.en.md: те
 *     же PORYADKI, dsh-compaction, SILENTLY, never/not measured, число стендов словом («five»). Оба README
 *     обязаны называть один и тот же набор стендов, и всё, на что они ссылаются, обязано лежать в составе npm
 *     pack.
 *     Запуск: node test/stend-readme.mjs (нужен npm в PATH); код 0 — сходится, 1 — расхождение, 2 — слепота.
 * EN: README stand: the description must match the code. If they diverge, the one who edited the code and did
 *     not touch the README is at fault; in production people read the README.
 *     It reads README.md, README.en.md and src/index.js. Requirements for README.md: all PORYADKI named; the
 *     predel and porogVery defaults appear in a table as "| number |"; the units measurement method is named
 *     (dsh-compaction, exports, date 03.09); it contains "МОЛЧА", "не измерял", SIMVOLOV_NA_EDINICU, "НЕ
 *     является"; a line with the word "стенд" and "N проб", where N is the number of proba( lines in the
 *     stands; the number of stands as a word ("пять"). For README.en.md: the same PORYADKI, dsh-compaction,
 *     SILENTLY, never/not measured, the number of stands as a word ("five"). Both READMEs must name the same
 *     set of stands, and everything they reference must be in the npm pack contents.
 *     Run: node test/stend-readme.mjs (npm must be on PATH); exit 0 — consistent, 1 — mismatch, 2 — blindness.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let SIMVOLOV_NA_EDINICU, PORYADKI
try {
  ;({ SIMVOLOV_NA_EDINICU } = await import('../src/mera.js'))
  ;({ PORYADKI } = await import('../src/otbor.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}
import { execFileSync } from 'node:child_process';

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');
const kod = readFileSync(join(koren, 'src/index.js'), 'utf8');

// RU: Слепота — отдельный исход (код 2): прибор, без которого пробу не выполнить (npm), не ответил. Прежде любой
//     сбой npm шёл красным, и стенд выходил кодом 1, хотя шапка обещает 2.
// EN: Blindness is a separate outcome (exit 2): an instrument without which the probe cannot run (npm) did not
//     answer. Previously any npm failure went red, and the stand exited 1, although the header promises 2.
class Slepota extends Error {}
let vsego = 0, proshlo = 0, slepyh = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ'); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { if (e instanceof Slepota) { slepyh++; console.log('  ⚠️ СЛЕПОТА: ' + imya + ' — ' + e.message.slice(0, 160)); }
    else console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 160)); } };

proba('стенд годен: оба README прочитаны и непусты', () => {
  if (ru.length < 500 || en.length < 500) throw new Error('README подозрительно короток');
});

proba('все порядки отбора названы в обоих README', () => {
  for (const p of PORYADKI) {
    if (!ru.includes(p)) throw new Error('русский не называет порядок ' + p);
    if (!en.includes(p)) throw new Error('английский не называет порядок ' + p);
  }
});

proba('умолчания из Config совпадают с таблицей в README', () => {
  // RU: Берём числа из кода, а не из памяти о них.
  // EN: Take the numbers from the code, not from memory of them.
  const predel = kod.match(/predel:\s*z\.number\(\)\.default\((\d+)\)/)?.[1];
  const porog = kod.match(/porogVery:\s*z\.number\(\)\.default\(([\d.]+)\)/)?.[1];
  if (!predel || !porog) throw new Error('не нашёл умолчаний в Config');
  if (!ru.includes('| ' + predel + ' |')) throw new Error('предел ' + predel + ' не показан в таблице');
  if (!ru.includes('| ' + porog + ' |')) throw new Error('порог веры ' + porog + ' не показан');
});

proba('🔴 знаемое про единицы: СПОСОБ замера назван, не только дата', () => {
  if (!/dsh-compaction/.test(ru) || !/exports/.test(ru)) throw new Error('русский не называет способ');
  if (!/dsh-compaction/.test(en)) throw new Error('английский не называет способ');
  if (!/03\.09|2026-09-03/.test(ru + en)) throw new Error('нет даты замера');
});

proba('🔴 сказано, что при смене оценщика пределы поедут МОЛЧА', () => {
  if (!/МОЛЧА/.test(ru)) throw new Error('русский не предупреждает');
  if (!/SILENTLY/.test(en)) throw new Error('английский не предупреждает');
});

proba('🔴 различие «не измерялась» и «ниже порога» объяснено в обоих', () => {
  if (!/не измерял/i.test(ru)) throw new Error('русский не разводит причины');
  if (!/never measured|not measured/i.test(en)) throw new Error('английский не разводит причины');
});

proba('названа единица меры ЧИСЛОМ и она совпадает с кодом', () => {
  if (!ru.includes('SIMVOLOV_NA_EDINICU')) throw new Error('русский не называет константу');
  if (typeof SIMVOLOV_NA_EDINICU !== 'number') throw new Error('константа не число');
});

proba('раздел «что настройкой НЕ является» есть', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
});


// RU: СОСТАВ ПУБЛИКАЦИИ СПРАШИВАЕМ У npm, А НЕ ЧИТАЕМ files ГЛАЗАМИ. Однажды у трёх пакетов files перечислял
//     стенды пофайлово, новый стенд в перечень не попал — и не уехал бы в публикацию, хотя README на него
//     ссылался. Считать состав по тому же перечню — мерить предмет прибором, который и дал сбой; ответ npm
//     честнее, он и уедет к получателю.
// EN: WE ASK npm FOR THE PUBLISHED CONTENTS RATHER THAN READING files BY EYE. Once three packages listed their
//     stands file by file in files, a new stand was missed — and would not have been published although the
//     README referred to it. Counting the contents from the same list measures the subject with the very
//     instrument that failed; npm's answer is more honest — it is what reaches the recipient.
function sostavPublikacii() {
  let vyvod;
  try {
    vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(vyvod)[0].files.map((f) => f.path);
  } catch (e) { throw new Slepota('npm pack --dry-run не ответил составом: ' + String(e?.message ?? e).slice(0, 120)); }
}

proba('🔴 ВСЁ, НА ЧТО ССЫЛАЕТСЯ README, ЛЕЖИТ В СОСТАВЕ ПУБЛИКАЦИИ', () => {
  const sostav = sostavPublikacii();
  const ssylki = new Set();
  for (const t of [ru, en]) {
    for (const m of t.matchAll(/(?:src|test)\/[\w.-]+\.m?js/g)) ssylki.add(m[0]);
    for (const m of t.matchAll(/\bstend-[\w-]+/g)) ssylki.add('test/' + m[0] + '.mjs');
  }
  const poteryany = [...ssylki].filter((f) => !sostav.includes(f));
  if (poteryany.length) {
    throw new Error('README обещает, а в публикации НЕТ: ' + poteryany.join(', ') +
                    ' | состав: ' + sostav.length + ' файлов');
  }
});

proba('🔴 ОБА README НАЗЫВАЮТ ОДИН И ТОТ ЖЕ СПОСОБ ПЕРЕПРОВЕРКИ', () => {
  // RU: Однажды у соседнего пакета README.md про стенд звука говорил, а README.en.md молчал: два описания
  //     одного предмета разошлись, и проба на ссылки этого не ловит — английский просто не ссылался. Ловится
  //     только сверкой пары между собой.
  // EN: Once in a sibling package README.md mentioned the sound stand while README.en.md did not: two
  //     descriptions of one subject diverged, and the reference probe cannot catch that — the English one
  //     simply did not reference it. Only comparing the pair with each other catches it.
  const stendy = (t) => new Set([...t.matchAll(/\bstend-[\w-]+/g)].map((m) => m[0]));
  const a = stendy(ru), b = stendy(en);
  const tolkoRu = [...a].filter((x) => !b.has(x));
  const tolkoEn = [...b].filter((x) => !a.has(x));
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error('README разошлись: только в русском [' + tolkoRu.join(', ') +
                    '], только в английском [' + tolkoEn.join(', ') + ']');
  }
});

// RU: ЧИСЛО ПРОБ И СТЕНДОВ В README ПРОТИВ ФАЙЛОВ НА ДИСКЕ. Когда-то README утверждал «Три стенда, 21 проба»
//     при четырёх стендах и 36 пробах: строку не сверял никто, стенд README сверял два ОПИСАНИЯ между собой и
//     был слеп к их общему отставанию от предмета. Теперь число проб считается по исходникам стендов, а число
//     стендов — по файлам.
//     Где проба не работает: число проб она считает по строкам, начинающимся с proba( или await proba(, —
//     пробы, порождённые в цикле, и опустевший стенд она не различит.
// EN: THE NUMBER OF PROBES AND STANDS IN THE README VERSUS THE FILES ON DISK. Once the README claimed "Three
//     stands, 21 probes" with four stands and 36 probes: nobody checked the line, the README stand compared the
//     two DESCRIPTIONS with each other and was blind to their common lag behind the subject. Now the number of
//     probes is counted from the stand sources and the number of stands from the files.
//     Where the probe does not work: it counts probes by lines starting with proba( or await proba( — probes
//     generated in a loop and an emptied stand go unnoticed.
// RU: A-N-1871 (Аврора, 08.10.2026): СМЫСЛ, А НЕ БУКВЫ. Стенд не требует у README определённой фразы или числа:
//     о проверке README обязан сказать — разделом (заголовок любого уровня со словом «провер»/«verif»/«стенд»/«stand»/«test»)
//     непустым или строкой стендов; ЕСЛИ README называет число проб или стендов на строке со словом «стенд»/«stand», это число обязано
//     совпасть с фактическим счётом. Не названо — не ложь: проба зелёная и печатает «не названо».
//     ЧЕГО НЕ ЛОВИТ: число, названное на другой строке (без слова «стенд»/«stand»); число стендов словом вне словаря 1–20.
// EN: A-N-1871: MEANING, NOT LETTERS. The stand demands no particular phrase or number from the README: the README must
//     speak about verification — a non-empty section or a stands line; IF the README states a probe or stand count on a line with "стенд"/"stand",
//     that number must equal the actual count. Not stated is not false: the probe stays green and prints "not stated".
const SLOVA_CHISEL = Object.fromEntries([
  ...'один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать двадцать'.split(' ').map((s, i) => [s, i + 1]),
  ...'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ').map((s, i) => [s, i + 1]),
]);
const razdelProverki = (t) => {
  const linii = t.split('\n');
  const i = linii.findIndex((l) => /^#{2,4}\s/.test(l) && /провер|verif|стенд|stand|тест|test/i.test(l));
  if (i < 0) return null;
  const uroven = linii[i].match(/^#+/)[0].length;
  const telo = [];
  for (let j = i + 1; j < linii.length; j++) { const m = linii[j].match(/^(#+)\s/); if (m && m[1].length <= uroven) break; telo.push(linii[j]); }
  return telo.join('\n').trim();
};
const chisloSlovom = (s) => (/^\d+$/.test(s ?? '') ? Number(s) : SLOVA_CHISEL[String(s ?? '').toLowerCase().replace(/[^а-яёa-z]/g, '')]);
const chisloStendov = (stroka, slovo) => {
  const pered = stroka.match(new RegExp('(\\S+)\\s+' + slovo, 'i'))?.[1];
  const posle = stroka.match(new RegExp(slovo + '\\S*\\s+(\\S+)', 'i'))?.[1];
  return chisloSlovom(pered) ?? chisloSlovom(posle) ?? null;
};

proba('🔴 число проб в README СЧИТАЕТСЯ по стендам, а не сверяется с самим собой', () => {
  // RU: Механизм перенесён из соседнего пакета семейства. Сверять README с самим собой бесполезно: он согласен
  //     с собой всегда. A-N-1871: оба README; раздел проверки обязателен и непуст; число — только если названо.
  // EN: Checking the README against itself is useless. A-N-1871: both READMEs; a non-empty verification section is
  //     required; the number is checked only when stated.
  const stendy = readdirSync(join(koren, 'test')).filter((f) => f.endsWith('.mjs'));
  let schet = 0;
  for (const f of stendy) {
    const t = readFileSync(join(koren, 'test', f), 'utf8');
    schet += (t.match(/^\s*(await\s+)?proba\(/gm) ?? []).length;
  }
  for (const [imya, t, stend, prob] of [['README.md', ru, /стенд/i, /(\d+)\s+проб/], ['README.en.md', en, /stand/i, /(\d+)\s+probe/i]]) {
    // RU: ЧИСЛО БЕРЁТСЯ СО СТРОКИ, ГДЕ НАЗВАНЫ СТЕНДЫ, а не первое похожее: ниже могут стоять объяснения с прежними числами.
    // EN: The number comes from the line naming the stands, not the first lookalike: explanations may hold old numbers.
    const stroka = t.split('\n').find((l) => stend.test(l) && prob.test(l));
    // RU: О проверке README обязан сказать — разделом (заголовок любого уровня) ИЛИ строкой стендов (короткая страница).
    // EN: The README must say something about verification — a section (any heading level) OR a stands line (short page).
    if (!razdelProverki(t) && !stroka) throw new Error(imya + ': о проверке не сказано — ни раздела, ни строки стендов');
    if (!stroka) { console.log('    ' + imya + ': число проб не названо — сверять нечего (не ложь)'); continue; }
    const obeshchano = Number(stroka.match(prob)[1]);
    if (obeshchano !== schet) throw new Error(imya + ' обещает ' + obeshchano + ', а в стендах ' + schet);
  }
});

proba('🔴 число стендов в README сверено с диском, а не запомнено', () => {
  // RU: A-N-1871: прежде словарь знал числа до шести, и при седьмом стенде new RegExp(undefined) совпадал с ЛЮБЫМ
  //     текстом — проба зеленела вслепую; слово искалось по всему README. Теперь число — со строки стендов, цифрой или
  //     словом 1–20, до или после слова «стенд»; не названо — не ложь.
  // EN: A-N-1871: the dictionary used to stop at six, and at the seventh stand new RegExp(undefined) matched ANY text —
  //     the probe went blindly green; the word was searched over the whole README. Now the number comes from the
  //     stands line, as digits or a word 1–20, before or after "stand"; not stated is not false.
  const fajlov = readdirSync(join(koren, 'test')).filter((f) => f.endsWith('.mjs')).length;
  for (const [imya, t, stend, slovo] of [['README.md', ru, /стенд/i, 'стенд'], ['README.en.md', en, /stand/i, 'stand']]) {
    const stroka = t.split('\n').find((l) => stend.test(l) && /\d+\s+(проб|probe)/i.test(l));
    const n = stroka ? chisloStendov(stroka, slovo) : null;
    if (n === null) { console.log('    ' + imya + ': число стендов не названо — сверять нечего (не ложь)'); continue; }
    if (n !== fajlov) throw new Error(imya + ' называет ' + n + ' стендов, а на диске ' + fajlov);
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego + (slepyh ? ' (слепота: ' + slepyh + ')' : ''));
process.exit(proshlo + slepyh < vsego ? 1 : slepyh ? 2 : 0);
