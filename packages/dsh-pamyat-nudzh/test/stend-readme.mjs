/** Стенд README: описание обязано совпадать с кодом — в бою читают README. */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');
const kod = readFileSync(join(koren, 'src/index.js'), 'utf8');

let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 160)); } };

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

// 🔴 Имя пробы сменилось вместе с её смыслом (03.09.2026). Прежде она проверяла одно
// утверждение — «итог есть нижняя оценка». После перевода порога на ЗАНЯТОСТЬ величин
// стало две, и проверять надо не одну мысль, а их РАЗВЕДЕНИЕ: если описание перестанет
// их различать, читатель вернётся ровно к той ошибке, из-за которой правка и делалась.
// Имя, пережившее содержание, — тот же призрак, что комментарий, переживший код.
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
  // Первая редакция требовала в README путь `app.rc8-…`, то есть ТРЕБОВАЛА
  // публикации имени нашего узла и закрепляла утечку как обязательную.
  // Способ должен называться пакетом и функцией, а не местом на диске.
  if (!/dsh-llm/.test(ru)) throw new Error('русский не называет источник (пакет)');
  if (!/mapUsage/.test(ru)) throw new Error('русский не называет функцию замера');
  if (!/03\.09|2026-09-03/.test(ru + en)) throw new Error('нет даты замера');
  // 🔴 Проверяем ПО ОБЩЕМУ ПРИЗНАКУ, а не по списку частных имён. Первая
  // редакция держала здесь буквальный путь нашего узла — и проба частных имён
  // справедливо краснела НА САМОМ СТРАЖЕ: запрет содержал запрещённое.
  // Абсолютный путь в публикуемом тексте не нужен никогда, каким бы он ни был.
  const absolyutnyjPut = new RegExp('(^|[\\s(`])' + '/' + '(opt|home|srv|root)/', 'm');
  for (const [imya, t] of [['русский', ru], ['английский', en]]) {
    if (absolyutnyjPut.test(t)) throw new Error(imya + ': в тексте абсолютный путь — публиковать нельзя');
  }
});

proba('раздел «что настройкой НЕ является» есть', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
});

proba('🔴 число проб в README СЧИТАЕТСЯ по стендам, а не сверяется с самим собой', () => {
  // Первая редакция этой пробы искала в README строку «26 проб» — то есть
  // проверяла, что README согласен САМ С СОБОЙ, и была зелёной при реальных 29.
  // Негодный пробник в чистом виде: ответ верный, вопрос не тот.
  const stendy = readdirSync(join(koren, 'test')).filter((f) => f.endsWith('.mjs'));
  let schet = 0;
  for (const f of stendy) {
    const t = readFileSync(join(koren, 'test', f), 'utf8');
    schet += (t.match(/^\s*(await\s+)?proba\(/gm) ?? []).length;
  }
  // 🔴 ЧИСЛО БЕРЁТСЯ СО СТРОКИ, ГДЕ НАЗВАНЫ СТЕНДЫ, А НЕ ПЕРВОЕ ПОХОЖЕЕ В ТЕКСТЕ.
  // Ниже по README стоят ОБЪЯСНЕНИЯ с прежними числами («21 проба простояла ложной»),
  // и признак, берущий первое совпадение, однажды прочтёт объяснение вместо утверждения.
  // Это наш класс за 04.09: механизм, судящий по тексту, не отличает дефект от рассказа
  // о дефекте. Привязка к слову «стенд» на той же строке разводит их.
  const stroka = ru.split('\n').find((l) => /стенд/i.test(l) && /\d+\s+проб/.test(l));
  const obeshchano = Number(stroka?.match(/(\d+)\s+проб/)?.[1]);
  if (!obeshchano) throw new Error('README не называет число проб');
  if (obeshchano !== schet) throw new Error('README обещает ' + obeshchano + ', а стендов на ' + schet);
});


// ─────────────────────────────────────────────────────────────────────────────
// 🔴 СОСТАВ ПУБЛИКАЦИИ СПРАШИВАЕМ У npm, А НЕ ЧИТАЕМ `files` ГЛАЗАМИ.
// 03.09: у трёх пакетов `files` перечислял стенды ПОФАЙЛОВО, новый стенд в
// перечень не попал — и не уехал бы в публикацию, хотя README на него ссылался.
// Перечень устарел молча. Считать состав по тому же перечню — мерить предмет
// прибором, который и дал сбой; ответ npm честнее, он и уедет к получателю.
function sostavPublikacii() {
  const vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(vyvod)[0].files.map((f) => f.path);
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
  // 03.09 у нуджа README.md про стенд звука говорил, а README.en.md молчал:
  // два описания одного предмета разошлись, и проба на ссылки этого не ловит —
  // английский просто не ссылался. Ловится только сверкой пары между собой.
  const stendy = (t) => new Set([...t.matchAll(/\bstend-[\w-]+/g)].map((m) => m[0]));
  const a = stendy(ru), b = stendy(en);
  const tolkoRu = [...a].filter((x) => !b.has(x));
  const tolkoEn = [...b].filter((x) => !a.has(x));
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error('README разошлись: только в русском [' + tolkoRu.join(', ') +
                    '], только в английском [' + tolkoEn.join(', ') + ']');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
