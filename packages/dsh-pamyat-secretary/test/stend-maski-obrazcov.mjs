/**
 * Стенд маски образцов (решение координатора 05.09.2026, развилка 4а).
 * Два условия сразу, одно без другого не годится:
 *   сводка о фильтре ЗАПИСЫВАЕТСЯ (не теряется) И в ней нет значений, которые ядро
 *   считает запирающими.
 */
import { zamaskirovat } from '../src/maska-obrazcov.js';

// 🔴 ЯДРО ИЩЕТСЯ ДВУМЯ ПУТЯМИ, И ОТКУДА ВЗЯТО — ПЕЧАТАЕТСЯ.
// У получателя ядро стоит соседом (peer), и первый путь верен. В нашем рабочем дереве
// соседа нет: каталог модулей принадлежит root, ссылку не поставить. Второй путь —
// ОТНОСИТЕЛЬНЫЙ от самого стенда (не машинный: машинный путь уехал бы получателю —
// обёртка публикации поймала его здесь как частное имя, 14-я утечка за трое суток).
// Без печати источника проба молча мерила бы не то, что померит получатель.
let yadro, otkuda;
for (const [put, imya] of [['dsh-pamyat-core/src/filtr-vhoda.js', 'сосед (peer)'],
                           [new URL('../../dsh-pamyat-core/src/filtr-vhoda.js', import.meta.url).href, 'сосед по каталогу пакетов']]) {
  try { yadro = await import(put); otkuda = imya; break; } catch { /* пробуем следующий */ }
}
if (!yadro) {
  console.log('СЛЕПОТА: ядро фильтра не загрузилось ни соседом, ни прямым путём.');
  console.log('  Маска берёт правила У ЯДРА; без него проверять нечего. Это не «чисто».');
  process.exit(2);
}
console.log('ядро взято: ' + otkuda);

let ok = 0, bed = 0;
const t = (imya, f) => {
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный');
    ok++; console.log('  ok   ' + imya);
  } catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

t('контроль: на заведомо ЧИСТОМ тексте замен нет', () => {
  const r = zamaskirovat('обычная запись про подъём службы', yadro);
  if (r.zameneno !== 0) throw new Error('замен ' + r.zameneno + ' там, где маскировать нечего');
});

t('🔴 ГЛАВНОЕ: после маски ядро молчит — значит запись пройдёт', () => {
  const ish = 'Разбор: образец `pwd=Hunter22xy` и `api_key=sk-abc123XYZ789`.';
  if (!yadro.najti_sekret(ish)) throw new Error('проба негодна: исходный текст ядро и так пропускает');
  const r = zamaskirovat(ish, yadro);
  const posle = yadro.najti_sekret(r.tekst);
  if (posle && yadro.zapiraet(posle.klass)) throw new Error('после маски ядро всё ещё запирает: ' + posle.klass);
});

t('🔴 ГРАНИЦА: слово-объявление и форма СОХРАНЕНЫ, заменено только значение', () => {
  const r = zamaskirovat('образец `pwd=Hunter22xy` тут', yadro);
  if (!/pwd=\*\*\*/.test(r.tekst)) throw new Error('слово или форма съедены маской: ' + r.tekst);
  if (/Hunter22/.test(r.tekst)) throw new Error('значение осталось в тексте');
});

t('текст ВОКРУГ значения не тронут', () => {
  const ish = 'до и после: `pwd=Hunter22xy` — хвост фразы цел';
  const r = zamaskirovat(ish, yadro);
  if (!r.tekst.startsWith('до и после:')) throw new Error('начало изменено');
  if (!r.tekst.endsWith('— хвост фразы цел')) throw new Error('хвост изменён: ' + r.tekst.slice(-40));
});

t('число замен и классы возвращаются наружу — подмена ОБЪЯВЛЯЕТСЯ', () => {
  const r = zamaskirovat('`pwd=Hunter22xy` и `api_key=sk-abc123XYZ789`', yadro);
  if (r.zameneno !== 2) throw new Error('замен ' + r.zameneno + ', ожидалось 2');
  if (!r.klassy.length) throw new Error('классы не названы');
});

t('🔴 без ядра — ОТКАЗ, а не «замен 0»', () => {
  let bylo = false;
  try { zamaskirovat('`pwd=Hunter22xy`', null); } catch { bylo = true; }
  if (!bylo) throw new Error('без ядра маска промолчала — «нечего маскировать» неотличимо от «нечем»');
});

t('помечающее ядро НЕ трогает: маска против того, что РВЁТ запись', () => {
  // hex без объявления ядро помечает, а не запирает — значит маскировать его не надо.
  const ish = 'сумма 0083e4a0781203aa1b2c3d4e5f607182 в отчёте';
  const r = zamaskirovat(ish, yadro);
  if (r.tekst !== ish) throw new Error('маска тронула то, что ядро не запирает');
});

console.log(`\nитог маски: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
