/**
 * RU: Стенд README: описание обязано совпадать с кодом — пользователи читают README. Двенадцать проб: оба
 *     README непусты; умолчания Config стоят в таблице; занятость и сумма расхода разведены; молчание не
 *     означает запаса; три правила арифметики; способ замера (dsh-llm, mapUsage, дата) назван без абсолютных
 *     путей; раздел «что настройкой НЕ является»; число проб и число стендов в обоих README СЧИТАЮТСЯ по
 *     test/*.mjs; всё, на что ссылается README, есть в составе npm pack; оба README называют одни и те же
 *     стенды.
 *     Запуск: node test/stend-readme.mjs из каталога пакета; код 0 — все зелёные, 1 — есть красные. Нужен npm и
 *     пишущий HOME: проба состава зовёт npm pack --dry-run, и без записи в кеш npm она краснеет на исправном
 *     README.
 * EN: README stand: the description must match the code — users read the README. Twelve probes: both READMEs
 *     are non-empty; Config defaults are in the table; occupancy and total spend are kept apart; silence does
 *     not mean headroom; three arithmetic rules; the measurement method (dsh-llm, mapUsage, date) is named
 *     without absolute paths; a "what is NOT a setting" section; the number of probes and of stands in both
 *     READMEs is COUNTED from test/*.mjs; everything the README refers to is in the npm pack contents; both
 *     READMEs name the same stands.
 *     Run: node test/stend-readme.mjs from the package directory; exit 0 — all green, 1 — some red. Needs npm
 *     and a writable HOME: the contents probe calls npm pack --dry-run, and without a writable npm cache it
 *     goes red on a healthy README.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
// RU: B-N-2048: состав разбирает помощник npm-sostav (dsh-pribory ≥ 3.1.2), ищется по PATH; нет его — ОТКАЗ кодом 2, не красное и не тихий ноль.
// EN: B-N-2048: the npm-sostav helper (dsh-pribory ≥ 3.1.2) parses the contents and is looked up on PATH; without it — REFUSAL with exit 2, not red and not a silent zero.
try { execFileSync('sh', ['-c', 'command -v npm-sostav'], { stdio: 'ignore' }); } catch {
  console.log('СЛЕПОТА: npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2');
  process.exit(2);
}

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');
const kod = readFileSync(join(koren, 'src/index.js'), 'utf8');

// RU: B-N-2048 (LOW Вениамина): нет состава публикации — npm не ответил или помощник npm-sostav отказал — это слепота (код 2), не «упало».
// EN: B-N-2048 (Veniamin LOW): no publication contents — npm did not answer or the npm-sostav helper refused — is blindness (exit 2), not a failure.
class Slepota extends Error {}
let vsego = 0, proshlo = 0, slepyh = 0;
// RU: Обёртка прежде выбрасывала возврат тела; общий прибор проверки обёрток здесь «неизмерим» (стенд считает
//     пробы соседей), поэтому глухота видна только чтением и отдельной пробой. Судим по устройству, как соседи:
//     любой возврат, кроме молчания, — красное.
// EN: The wrapper used to discard the body's return value; the shared wrapper-checking instrument cannot
//     measure this file (the stand counts its neighbours' probes), so deafness is visible only by reading and a
//     separate probe. We judge by construction, like the neighbours: any return other than silence is red.
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы'); };
const proba = (imya, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { if (e instanceof Slepota) { slepyh++; console.log('  ⚠️ СЛЕПОТА: ' + imya + ' — ' + e.message.slice(0, 160)); } else console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 160)); } };

proba('стенд годен: оба README прочитаны и непусты', () => {
  if (ru.length < 500 || en.length < 500) throw new Error('README подозрительно короток');
});

proba('умолчания из Config совпадают с таблицей', () => {
  const predel = kod.match(/predel:\s*z\.number\(\)\.default\((\d+)\)/)?.[1];
  const dolya = kod.match(/dolyaTrevogi:\s*z\.number\(\)\.default\(([\d.]+)\)/)?.[1];
  if (!predel || !dolya) throw new Error('не нашёл умолчаний в Config');
  if (!ru.includes('| ' + predel + ' |')) throw new Error('предел ' + predel + ' не в таблице');
  if (!ru.includes('| ' + dolya + ' |')) throw new Error('доля ' + dolya + ' не в таблице');
});

// RU: 🔴 Имя пробы сменилось вместе с её смыслом (03.09.2026). Прежде она проверяла одно утверждение — «итог
//     есть нижняя оценка». После перевода порога на ЗАНЯТОСТЬ величин стало две, и проверять надо не одну
//     мысль, а их РАЗВЕДЕНИЕ: если описание перестанет их различать, читатель вернётся ровно к той ошибке,
//     из-за которой правка и делалась. Имя, пережившее содержание, — тот же призрак, что комментарий,
//     переживший код.
// EN: 🔴 The probe's name changed together with its meaning (03.09.2026). It used to check one statement — "the
//     total is a lower bound". After the threshold moved to OCCUPANCY there are two quantities, and what must
//     be checked is not one idea but their SEPARATION: if the description stops telling them apart, the reader
//     returns to exactly the mistake the change was made for. A name that outlived its content is the same
//     ghost as a comment that outlived its code.
proba('🔴 обе величины названы и РАЗВЕДЕНЫ — занятость окна против суммы расхода', () => {
  if (!/занято .* из /.test(ru)) throw new Error('русский не называет занятость');
  if (!/[Сс]умма расхода/.test(ru)) throw new Error('русский не называет сумму расхода');
  if (!/последнего вызова/.test(ru)) throw new Error('русский не говорит, что занятость — по ПОСЛЕДНЕМУ вызову');
  if (!/может быть только БОЛЬШЕ/.test(ru)) throw new Error('русский не называет сумму нижней оценкой');
  if (!/[Oo]ccupancy/.test(en)) throw new Error('английский не называет занятость');
  if (!/TOTAL spend|total spend/.test(en)) throw new Error('английский не называет сумму расхода');
  if (!/last call/i.test(en)) throw new Error('английский не говорит, что занятость — по последнему вызову');
  if (!/without bound/i.test(en)) throw new Error('английский не говорит, что сумма растёт без предела');
});

proba('🔴 сказано, что МОЛЧАНИЕ не означает запаса', () => {
  if (!/Молчание нуджа не означает запаса/.test(ru)) throw new Error('нет в русском');
  if (!/does not mean headroom/i.test(en)) throw new Error('нет в английском');
});

proba('🔴 все три правила арифметики названы в обоих', () => {
  for (const [t, txt] of [['русский', ru], ['английский', en]]) {
    if (!/DISJOINT/.test(txt)) throw new Error(t + ': не назван непересекающийся счёт');
    if (!/reasoningTokens/.test(txt)) throw new Error(t + ': не сказано про рассуждение');
    if (!/mapUsage/.test(txt)) throw new Error(t + ': не назван способ (адаптер)');
  }
});

proba('🔴 способ замера назван, а не только дата — и БЕЗ частных имён', () => {
  // RU: Первая редакция требовала в README путь к каталогу платформы на нашей машине, то есть ТРЕБОВАЛА
  //     публикации имени нашего узла и закрепляла утечку как обязательную. Способ должен называться пакетом и
  //     функцией, а не местом на диске.
  // EN: The first revision required the README to contain the path to the platform directory on our machine,
  //     i.e. it REQUIRED publishing our node's name and made the leak mandatory. The method must be named by
  //     package and function, not by a place on disk.
  if (!/dsh-llm/.test(ru)) throw new Error('русский не называет источник (пакет)');
  if (!/mapUsage/.test(ru)) throw new Error('русский не называет функцию замера');
  if (!/03\.09|2026-09-03/.test(ru + en)) throw new Error('нет даты замера');
  // RU: 🔴 Проверяем ПО ОБЩЕМУ ПРИЗНАКУ, а не по списку частных имён. Первая редакция держала здесь буквальный
  //     путь нашего узла — и проба частных имён справедливо краснела НА САМОМ СТРАЖЕ: запрет содержал
  //     запрещённое. Абсолютный путь в публикуемом тексте не нужен никогда, каким бы он ни был.
  // EN: 🔴 We check BY A GENERAL SIGN, not by a list of private names. The first revision kept our node's
  //     literal path here — and the private-name probe rightly went red ON THE GUARD ITSELF: the prohibition
  //     contained the prohibited. An absolute path is never needed in published text, whatever it is.
  // RU: A-N-1871: запрет — на СТРОКАХ СПОСОБА (где названы dsh-llm или mapUsage), а не во всём README: раздел
  //     «что ставится и куда» законно называет место установки, и запрет на весь текст спорил с формой README.
  // EN: A-N-1871: the ban applies to the METHOD lines (naming dsh-llm or mapUsage), not the whole README: the
  //     "what gets installed and where" section legitimately names install locations.
  const absolyutnyjPut = new RegExp('(^|[\\s(`])' + '/' + '(opt|home|srv|root)/');
  for (const [imya, t] of [['русский', ru], ['английский', en]]) {
    const sposob = t.split('\n').filter((l) => /dsh-llm|mapUsage/.test(l));
    if (!sposob.length) throw new Error(imya + ': способ замера не назван ни одной строкой');
    if (sposob.some((l) => absolyutnyjPut.test(l))) throw new Error(imya + ': в строке способа абсолютный путь — способ называется пакетом и функцией');
  }
});

proba('раздел «что настройкой НЕ является» есть', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
});

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

const schetProb = () => {
  let schet = 0;
  for (const f of readdirSync(join(koren, 'test')).filter((x) => x.endsWith('.mjs'))) {
    schet += (readFileSync(join(koren, 'test', f), 'utf8').match(/^\s*(await\s+)?proba\(/gm) ?? []).length;
  }
  return schet;
};
const proveritChisloProb = (imya, t, stend, prob) => {
  const stroka = t.split('\n').find((l) => stend.test(l) && prob.test(l));
  // RU: О проверке README обязан сказать — разделом (заголовок любого уровня) ИЛИ строкой стендов (короткая страница).
  // EN: The README must say something about verification — a section (any heading level) OR a stands line (short page).
  if (!razdelProverki(t) && !stroka) throw new Error(imya + ': о проверке не сказано — ни раздела, ни строки стендов');
  if (!stroka) { console.log('    ' + imya + ': число проб не названо — сверять нечего (не ложь)'); return; }
  const obeshchano = Number(stroka.match(prob)[1]), schet = schetProb();
  if (obeshchano !== schet) throw new Error(imya + ' обещает ' + obeshchano + ', а стендов на ' + schet);
};

proba('🔴 число проб в README СЧИТАЕТСЯ по стендам, а не сверяется с самим собой', () => {
  // RU: Первая редакция искала строку «26 проб» — README согласен САМ С СОБОЙ. Число берётся со строки, где названы
  //     стенды (ниже по README бывают объяснения с прежними числами). A-N-1871: раздел проверки обязателен и непуст,
  //     число — только если названо.
  // EN: The first revision looked for "26 проб" — the README agrees WITH ITSELF. The number comes from the line naming
  //     the stands. A-N-1871: a non-empty verification section is required; the number only when stated.
  proveritChisloProb('README.md', ru, /стенд/i, /(\d+)\s+проб/);
});

proba('🔴 АНГЛИЙСКИЙ README НАЗЫВАЕТ ТО ЖЕ ЧИСЛО ПРОБ, ЧТО СТЕНДЫ', () => {
  // RU: 25.09.2026: английский простоял с «Five stands, 52 probes» при 71 пробе, пока проба читала один русский.
  // EN: 25.09.2026: the English text stood at "Five stands, 52 probes" with 71 probes while only Russian was read.
  proveritChisloProb('README.en.md', en, /stand/i, /(\d+)\s+probe/i);
});

proba('🔴 ЧИСЛО СТЕНДОВ В ОБОИХ README СЧИТАЕТСЯ ПО ФАЙЛАМ test/stend-*.mjs', () => {
  // RU: 26.09.2026: порча «Six stands» прошла зелёной, пока сверялось одно число проб. A-N-1871: число стендов — со строки
  //     стендов, цифрой или словом 1–20, до или после слова; не названо — не ложь.
  // EN: 26.09.2026: the "Six stands" corruption passed green while only probes were compared. A-N-1871: the stand count
  //     comes from the stands line, digits or a word 1–20, before or after the word; not stated is not false.
  const fajlov = readdirSync(join(koren, 'test')).filter((f) => /^stend-.*\.mjs$/.test(f)).length;
  for (const [imya, t, stend, slovo] of [['README.md', ru, /стенд/i, 'стенд'], ['README.en.md', en, /stand/i, 'stand']]) {
    const stroka = t.split('\n').find((l) => stend.test(l) && /\d+\s+(проб|probe)/i.test(l));
    const n = stroka ? chisloStendov(stroka, slovo) : null;
    if (n === null) { console.log('    ' + imya + ': число стендов не названо — сверять нечего (не ложь)'); continue; }
    if (n !== fajlov) throw new Error(imya + ' обещает ' + n + ' стендов, а файлов test/stend-*.mjs ' + fajlov);
  }
});


// RU: ─────────────────────────────────────────────────────────────────────────────
//     🔴 СОСТАВ ПУБЛИКАЦИИ СПРАШИВАЕМ У npm, А НЕ ЧИТАЕМ `files` ГЛАЗАМИ. 03.09: у трёх пакетов `files`
//     перечислял стенды ПОФАЙЛОВО, новый стенд в перечень не попал — и не уехал бы в публикацию, хотя README на
//     него ссылался. Перечень устарел молча. Считать состав по тому же перечню — мерить предмет прибором,
//     который и дал сбой; ответ npm честнее, он и уедет к получателю.
// EN: 🔴 WE ASK npm FOR THE PUBLISHED CONTENTS INSTEAD OF READING `files` BY EYE. On 03.09 three packages listed
//     stands in `files` FILE BY FILE, a new stand was not added — and would not have been published, although
//     the README referred to it. The list went stale silently. Counting the contents by the same list means
//     measuring the subject with the instrument that failed; npm's answer is more honest, it is what reaches
//     the recipient.
function sostavPublikacii() {
  try {
    const vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    // RU: B-N-2048: npm 11 отдаёт pack --json массивом, npm 12 — объектом; разбор одним правилом у помощника npm-sostav (dsh-pribory), его ОТКАЗ — исключение с причиной.
    // EN: B-N-2048: npm 11 prints pack --json as an array, npm 12 as an object; one rule parses both in the npm-sostav helper (dsh-pribory), its REFUSAL throws with the reason.
    return execFileSync('npm-sostav', ['--files'], { input: vyvod, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
  } catch (e) { throw new Slepota('состав публикации неизвестен — ' + String(e?.message ?? e).replace(/\s+/g, ' ').trim()); }
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
  // RU: 03.09 у этого пакета README.md про стенд звука говорил, а README.en.md молчал: два описания одного
  //     предмета разошлись, и проба на ссылки этого не ловит — английский просто не ссылался. Ловится только
  //     сверкой пары между собой.
  // EN: On 03.09 this package's README.md mentioned the sound stand while README.en.md said nothing: two
  //     descriptions of one subject diverged, and the links probe does not catch that — the English simply did
  //     not refer to it. Only comparing the pair with each other catches it.
  const stendy = (t) => new Set([...t.matchAll(/\bstend-[\w-]+/g)].map((m) => m[0]));
  const a = stendy(ru), b = stendy(en);
  const tolkoRu = [...a].filter((x) => !b.has(x));
  const tolkoEn = [...b].filter((x) => !a.has(x));
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error('README разошлись: только в русском [' + tolkoRu.join(', ') +
                    '], только в английском [' + tolkoEn.join(', ') + ']');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego + (slepyh ? ' (слепота: ' + slepyh + ')' : ''));
process.exit(proshlo + slepyh < vsego ? 1 : slepyh ? 2 : 0);
