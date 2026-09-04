/**
 * Стенд README: описание обязано совпадать с кодом. Разошлись — виноват тот,
 * кто правил код и не тронул README; в бою читают README.
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

let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 160)); } };

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
  // Берём числа из кода, а не из памяти о них.
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

// 🔴 ЧИСЛО СТЕНДОВ В README ПРОТИВ ФАЙЛОВ НА ДИСКЕ.
// До 04.09.2026 README утверждал «Три стенда, 21 проба» — стендов было четыре, проб 36.
// Строка простояла ложной, потому что её не сверял никто: стенд README сверял два
// ОПИСАНИЯ между собой и был слеп к их общему отставанию от предмета.
// Число ПРОБ намеренно убрано из README (оно менялось трижды за сутки), а число СТЕНДОВ
// оставлено — оно снимается счётом файлов и потому проверяемо.
// ⚠️ Где проба НЕ работает: она не считает пробы и не заметит, если стенд опустеет.
proba('🔴 число проб в README СЧИТАЕТСЯ по стендам, а не сверяется с самим собой', () => {
  // Механизм перенесён 04.09.2026 из соседнего пакета семейства, где стоял с 03.09.
  // Здесь его не было — и «Три стенда, 21 проба» простояло ложным при четырёх стендах
  // и 36 пробах. Сверять README с самим собой бесполезно: он согласен с собой всегда.
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
  if (obeshchano !== schet) throw new Error('README обещает ' + obeshchano + ', а в стендах ' + schet);
});

proba('🔴 число стендов в README сверено с диском, а не запомнено', () => {
  const fajlov = readdirSync(join(koren, 'test')).filter((f) => f.endsWith('.mjs')).length;
  const slova = { 1: 'один', 2: 'два', 3: 'три', 4: 'четыре', 5: 'пять', 6: 'шесть' };
  const slovaEn = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
  const ozhid = new RegExp(slova[fajlov], 'i');
  const ozhidEn = new RegExp(slovaEn[fajlov], 'i');
  if (!ozhid.test(ru))
    throw new Error(`README.md не называет ${slova[fajlov]} стендов, а на диске их ${fajlov}`);
  if (!ozhidEn.test(en))
    throw new Error(`README.en.md не называет ${slovaEn[fajlov]} stands, а на диске их ${fajlov}`);
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
