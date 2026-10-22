// RU: Сверяем перечни двух README, чтобы языковые версии росли вместе. Совпадение имён не доказывает совпадение смысла: его читает человек.
// EN: Compare both README lists so the language versions grow together. Matching names do not prove matching meaning; a person reviews that.
import { readFileSync } from 'node:fs';
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

// RU: B-N-2048 (LOW Вениамина): нет состава публикации — npm не ответил или помощник npm-sostav отказал — это слепота (код 2), не «упало».
// EN: B-N-2048 (Veniamin LOW): no publication contents — npm did not answer or the npm-sostav helper refused — is blindness (exit 2), not a failure.
class Slepota extends Error {}
let vsego = 0, proshlo = 0, slepyh = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    // RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
    // EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. ' +
                      'Бросай ошибку либо ничего не возвращай');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { if (e instanceof Slepota) { slepyh++; console.log('  ⚠️ СЛЕПОТА: ' + imya + ' — ' + e.message.slice(0, 130)); } else console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const PRIRODY = ['otkazano-chelovekom', 'otmeneno', 'net-kanala', 'net-sluzhby', 'net-agenta', 'ne-predyavleno'];
// RU: A-N-1871: ключи — ИЗ СХЕМЫ Config (src/index.js), а не жёстким списком: список держал снятый zhurnalSkolko и не
//     знал новых ключей. Разбор — по тексту схемы, как в соседних стендах семейства; не разобралось — красное с причиной.
// EN: A-N-1871: keys come FROM THE Config SCHEMA (src/index.js), not a hard-coded list: the list kept the removed
//     zhurnalSkolko and missed new keys. Parsed from the schema text like sibling stands; parse failure is red with a reason.
const KLYUCHI = (() => {
  const t = readFileSync(join(koren, 'src', 'index.js'), 'utf8');
  const i = t.indexOf('export const Config = z.object({');
  if (i < 0) return [];
  return [...t.slice(i, t.indexOf('\n});', i)).matchAll(/^  (\w+):\s*z\./gm)].map((m) => m[1]);
})();

proba('🔴 ЧЕТЫРЕ ПРИРОДЫ ОЧЕРЕДИ НАЗВАНЫ В ОБОИХ README', () => {
  // RU: Причины доставки определяют допустимость повторной записи; пропущенная причина может привести к дублю знания.
  // EN: Delivery causes determine whether rewriting is safe; an omitted cause may produce duplicate knowledge.
  for (const n of ['ne-otpravleno', 'ne-najdeno', 'moglo-dojti-id-est', 'moglo-dojti-bez-id']) {
    if (!ru.includes(n)) throw new Error('в русском нет ' + n);
    if (!en.includes(n)) throw new Error('в английском нет ' + n);
  }
});

proba('неразрешимость «без опознавателя» ОБЪЯСНЕНА, а не просто объявлена', () => {
  // RU: Объяснение отказа от автоповтора защищает от дублей при неопределённой доставке. Склеиваем строки README перед поиском фразы, чтобы перенос по ширине не создавал ложный отказ.
  // EN: Explaining why automatic retries are avoided prevents duplicates after uncertain delivery. Join README lines before phrase searches so wrapping cannot cause a false failure.
  const slitno = (x) => x.replace(/\s+/g, ' ');
  if (!/неразрешим/.test(slitno(ru))) throw new Error('в русском нет объяснения неразрешимости');
  if (!/not decidable by machine/.test(slitno(en))) throw new Error('в английском нет объяснения');
});

proba('стенд годен: оба README на месте и непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error('README подозрительно короткие');
});

proba('все природы отказа названы в ОБОИХ README', () => {
  for (const p of PRIRODY) {
    if (!ru.includes(p)) throw new Error('в русском нет природы ' + p);
    if (!en.includes(p)) throw new Error('в английском нет природы ' + p);
  }
});

proba('все ключи настройки описаны в ОБОИХ README', () => {
  if (KLYUCHI.length < 3) throw new Error('схема Config не разобрана (ключей ' + KLYUCHI.length + ') — сверять нечем');
  for (const k of KLYUCHI) {
    if (!ru.includes(k)) throw new Error('в русском нет ключа ' + k);
    if (!en.includes(k)) throw new Error('в английском нет ключа ' + k);
  }
});

proba('в обоих README есть ЖИВЫЕ примеры вызова, а не только описания', () => {
  const blokovRu = (ru.match(/```js/g) || []).length;
  const blokovEn = (en.match(/```js/g) || []).length;
  if (blokovRu === 0) throw new Error('в русском ни одного примера кода');
  if (blokovEn === 0) throw new Error('в английском ни одного примера кода');
  for (const f of ['zapisat', 'prochitat', 'svodka', 'reshit', 'otmetitOtkaz', 'dostupna']) {
    if (!ru.includes(f + '(')) throw new Error('в русском не показан вызов ' + f);
    if (!en.includes(f + '(')) throw new Error('в английском не показан вызов ' + f);
  }
});
proba('поле веры и различение «пусто ≠ ноль» названы в обоих README', () => {
  if (!/vera/.test(ru) || !/пустота — не ноль|пустоту намеренно/i.test(ru)) throw new Error('русский неполон');
  if (!/vera/.test(en) || !/empty is not zero|never measured/i.test(en)) throw new Error('английский неполон');
});
proba('оба README называют знаемое про логгер — и называют СПОСОБ замера', () => {
  // RU: Требуем верное объяснение: logger существует, но не даёт слышимого вывода, и документация называет способ проверки.
  // EN: Require the correct explanation: logger exists but produces no audible output, and documentation names the verification method.
  if (!/логгер ЕСТЬ|`ctx\.logger`\s*\*\*создаётся/.test(ru)) throw new Error('русский не называет');
  if (!/буфер/.test(ru)) throw new Error('русский не объясняет, почему логгер немой');
  if (!/stend-krik-zvuchit/.test(ru)) throw new Error('русский не называет способ проверки');
  if (!/is created for every Context/.test(en)) throw new Error('английский не называет');
  if (!/ring\s*\n?buffer|ring buffer/.test(en)) throw new Error('английский не объясняет немоту');
  if (!/stend-krik-zvuchit/.test(en)) throw new Error('английский не называет способ проверки');
});
proba('раздел «что настройкой не является» есть в обоих', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
  if (!/NOT configurable/i.test(en)) throw new Error('нет в английском');
});

proba('оба README предупреждают, что часть имён — НАШИ, а не ядра', () => {
  if (!ru.includes('НАШИ')) throw new Error('русский не предупреждает');
  if (!en.includes('OURS')) throw new Error('английский не предупреждает');
});


// RU: Состав публикации спрашиваем у npm, а не выводим из ручного files: новый стенд может не попасть в пакет при существующей ссылке README.
// EN: Ask npm for publication contents rather than deriving them from a manual files list: a new suite may be absent from the package despite a README link.
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
  // RU: Сверяем описание звукового стенда между языковыми версиями; проверка одних ссылок не заметит отсутствующий английский абзац.
  // EN: Compare descriptions of the output suite across language versions; checking links alone misses an absent English paragraph.
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
