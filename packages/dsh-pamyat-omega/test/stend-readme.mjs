/**
 * RU: Стенд сверяет оба README между собой и с договором исходников. Он проверяет перечисленные признаки текста и состава пакета, не полноту и качество всей документации.
 * EN: Compare both READMEs with each other and the source contract. This checks listed textual and package-content signals, not completeness or quality of all documentation.
 */
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
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + imya); } catch (e) { if (e instanceof Slepota) { slepyh++; console.log('  ⚠️ СЛЕПОТА: ' + imya + ' — ' + e.message.slice(0, 120)); } else console.log('  ❌ ' + imya + ' — ' + e.message.slice(0,120)); } };

proba('стенд годен: оба README на месте и непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error('README подозрительно короткие');
});
proba('все ПЯТЬ состояний доставки названы в обоих', () => {
  // RU: Все пять состояний доставки должны быть описаны, поскольку по ним читатель выбирает безопасный повтор записи.
  // EN: Document all five delivery states because readers use them to choose a safe write retry.
  for (const s of ['dostavleno', 'ne-najdeno', 'ne-otpravleno', 'moglo-dojti-id-est', 'moglo-dojti-bez-id']) {
    if (!ru.includes(s)) throw new Error('в русском нет ' + s);
    if (!en.includes(s)) throw new Error('в английском нет ' + s);
  }
});
proba('проверка без записи названа в обоих, с её тремя исходами', () => {
  for (const t of ['proverit', 'ne-proveryali']) {
    if (!ru.includes(t)) throw new Error('в русском нет ' + t);
    if (!en.includes(t)) throw new Error('в английском нет ' + t);
  }
});

proba('🔴 обязательность образца содержимого объяснена, а не просто упомянута', () => {
  // RU: Документация должна объяснять обязательный образец proverit: без него ne-proveryali означает неверный вызов, не обязательно недоступное хранилище.
  // EN: Documentation must explain the required proverit sample: without it, ne-proveryali means an invalid call, not necessarily unavailable storage.
  if (!/образца/.test(ru) || !/никогда/.test(ru)) throw new Error('в русском нет объяснения');
  if (!/sample/.test(en) || !/never/.test(en)) throw new Error('в английском нет объяснения');
});

proba('все ключи настройки описаны в обоих', () => {
  for (const k of ['adres', 'tajmautMs']) {
    if (!ru.includes(k)) throw new Error('в русском нет ' + k);
    if (!en.includes(k)) throw new Error('в английском нет ' + k);
  }
});
proba('обе ловушки названы в обоих: слэш и укороченный опознаватель', () => {
  if (!/слэш/i.test(ru) || !/укорочен/i.test(ru)) throw new Error('русский неполон');
  if (!/trailing slash/i.test(en) || !/shortened/i.test(en)) throw new Error('английский неполон');
});
proba('внешний контракт разметки назван в обоих README', () => {
  if (!/Внешний контракт/.test(ru)) throw new Error('русский не называет контракт разметки');
  if (!/External contract/.test(en)) throw new Error('английский не называет контракт разметки');
  if (!/перемерить\s+живым|перемерить/i.test(ru)) throw new Error('русский не требует перемера живым ответом');
  if (!/re-measured/.test(en)) throw new Error('английский не требует перемера');
});
proba('раздел «что не настраивается» есть в обоих', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
  if (!/NOT configurable/i.test(en)) throw new Error('нет в английском');
});

// RU: Состав публикации берётся из npm pack, не из ручного перечня files: новый стенд может существовать в дереве и отсутствовать в архиве.
// EN: Obtain publication contents from npm pack, not a manually read files list: a new test may exist in the tree but be absent from the archive.
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
  // RU: Описание стенда звука сравнивается в обоих README: одна только проверка ссылок не поймала бы молчание одного языка.
  // EN: Compare the output-test description in both READMEs: checking links alone would not catch omission in one language.
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
