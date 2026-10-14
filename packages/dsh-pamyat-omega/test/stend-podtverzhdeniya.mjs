/**
 * RU: Эталоны подтверждения основаны на ответах OMEGA 1.5.13 и 1.5.19. Они сохраняют внешнюю форму, которую должен понимать parser; зелёный стенд сам не доказывает, что живая служба всё ещё использует эту форму.
 * EN: Confirmation fixtures come from OMEGA 1.5.13 and 1.5.19 responses. They retain the external shape the parser must understand; passing tests alone do not prove that a live service still uses that shape.
 */
let istolkovatOtvet
try {
  ;({ istolkovatOtvet } = await import('../src/podtverzhdenie.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};

const ID = 'mem-dfc9d0754cc9';
const NASH = 'Журнал, пишущий НАМЕРЕНИЕ в прошедшем времени, врёт при отказе';
// RU: Эталон сохраняет усечённый id, перенос, пустую строку и обрыв Source по длине.
// EN: The fixture retains a truncated id, a line break, a blank line, and a length-truncated Source.
const NAJDENO = '# Similar Memories (5)\n\n**Source:** `mem-dfc9d075` — Журнал, пишущий НАМЕРЕНИЕ в прошедшем времени, врёт при отказе.\n\nПрецедент 25.08.2026 (детектор сиро';
const NE_NAJDENO = 'Memory `mem-be7f5026` not found.';

proba('стенд годен: живой ответ + наше содержимое = доставка', () => {
  const r = istolkovatOtvet(NAJDENO, ID, NASH);
  if (r.sostoyanie !== 'dostavleno') throw new Error(r.sostoyanie + ': ' + r.pochemu);
});

proba('усечённый опознаватель (8 из 12) не ломает подтверждение', () => {
  if (NAJDENO.includes(ID)) throw new Error('эталон перестал быть усечённым — пересними живой');
  const r = istolkovatOtvet(NAJDENO, ID, NASH);
  if (r.sostoyanie !== 'dostavleno') throw new Error('полное вхождение искалось там, где его нет');
});

proba('ПЕРЕНОСЫ В ОТВЕТЕ СОХРАНЕНЫ — сверка их переживает', () => {
  if (!NAJDENO.includes('\n\n')) throw new Error('эталон потерял перенос — обоснование правки было бы ложным');
  const r = istolkovatOtvet(NAJDENO, ID, 'Журнал, пишущий НАМЕРЕНИЕ\n   в прошедшем времени, врёт при отказе');
  if (r.sostoyanie !== 'dostavleno') throw new Error('перенос в образце сломал сверку: ' + r.sostoyanie);
});

proba('ГЛАВНОЕ: «not found» ВНУТРИ нашего знания не считается отсутствием', () => {
  const s = '# Similar Memories (2)\n\n**Source:** `mem-dfc9d075` — Разбор случая: команда вернула not found, и это приняли за отказ';
  const r = istolkovatOtvet(s, ID, 'Разбор случая: команда вернула not found');
  if (r.sostoyanie !== 'dostavleno') throw new Error('слова из содержимого приняты за ответ службы: ' + r.sostoyanie);
});

// RU: A-N-1948 №3 (№2): образец из одних пробелов после rovno() пуст, а includes('') истинно для любой строки — ложная доставка.
// EN: A-N-1948 №3 (№2): a whitespace-only sample is empty after rovno(), and includes('') is true for any text.
proba('образец из одних пробелов → ne-udalos-proverit, а не доставка', () => {
  const r = istolkovatOtvet(NAJDENO, ID, '   \n\t ');
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error('пустой образец дал ' + r.sostoyanie);
});

proba('точный ответ об отсутствии → ne-najdeno', () => {
  const r = istolkovatOtvet(NE_NAJDENO, ID, NASH);
  if (r.sostoyanie !== 'ne-najdeno') throw new Error(r.sostoyanie);
});

proba('ГЛАВНОЕ: наш текст в ПОХОЖЕЙ записи не подтверждает доставку (Source наш, содержимое чужое)', () => {
  // RU: Source содержит наш id, чтобы проба дошла до границы содержимого. Чужой id остановил бы проверку раньше и не проверил бы захват похожего текста.
  // EN: Source contains our id so the test reaches the content boundary. A foreign id would stop the check earlier and leave similar-text capture untested.
  const s = '# Similar Memories (3)\n\n**Source:** `mem-dfc9d075` — совершенно чужое содержимое\n\n1. `mem-bbbbbbbb` — ' + NASH + '\n2. `mem-cccccccc` — ещё чужое';
  const r = istolkovatOtvet(s, ID, NASH);
  if (r.sostoyanie === 'dostavleno') throw new Error('подтвердились по тексту из ПОХОЖЕЙ записи');
});

proba('ГРАНИЦА ЗАХВАТА: содержимое Source многострочно — фрагмент из второй строки находится', () => {
  const s = '# Similar Memories (2)\n\n**Source:** `mem-dfc9d075` — первая строка знания.\n\nвторая строка знания тут\n\n1. `mem-dddddddd` — чужое';
  const r = istolkovatOtvet(s, ID, 'вторая строка знания тут');
  if (r.sostoyanie !== 'dostavleno') throw new Error('многострочный Source обрезан слишком рано: ' + r.sostoyanie);
});

proba('Source с ЧУЖИМ опознавателем → «не знаю» (ветка опознавателя цела)', () => {
  const s = '# Similar Memories (1)\n\n**Source:** `mem-aaaaaaaa` — чужое';
  const r = istolkovatOtvet(s, ID, NASH);
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error(r.sostoyanie);
});

proba('нет строки Source → «не знаю», а не подтверждение', () => {
  const r = istolkovatOtvet('# Similar Memories (0)\n\nничего похожего', ID, NASH);
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error(r.sostoyanie);
});

proba('ГЛАВНОЕ: пустой ответ → «не знаю», а НЕ «не доставлено»', () => {
  const r = istolkovatOtvet('', ID, NASH);
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error(r.sostoyanie);
  if (/НЕ доставлено/.test(r.pochemu)) throw new Error('незнание подано как отрицательный факт');
});

proba('ДЕДУП: опознаватель тот, содержимое чужое → не доставлено', () => {
  const r = istolkovatOtvet(NAJDENO, ID, 'совершенно другое знание про другое дело');
  if (r.sostoyanie !== 'ne-najdeno') throw new Error(r.sostoyanie);
  if (!/ЧУЖОЙ/.test(r.pochemu)) throw new Error('причина не объясняет подмену');
});

proba('ПОРЧА: без образца содержимого → «не знаю», причина не лжёт про сверку', () => {
  const r = istolkovatOtvet(NAJDENO, ID, null);
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error(r.sostoyanie);
  if (/сходится/.test(r.pochemu)) throw new Error('причина утверждает сверку, которой не было');
});

proba('РАЗЛИЧЕНИЕ: три исхода не схлопываются', () => {
  const a = istolkovatOtvet(NE_NAJDENO, ID, NASH).sostoyanie;
  const b = istolkovatOtvet('', ID, NASH).sostoyanie;
  const c = istolkovatOtvet(NAJDENO, ID, NASH).sostoyanie;
  if (new Set([a, b, c]).size !== 3) throw new Error('исходы слиплись: ' + [a, b, c].join('/'));
});

// RU: Эталон ответа OMEGA 1.5.19 включает вторую похожую запись с заголовком ## N. [тип] `mem-…`; граница должна сохранить заголовки внутри знания и отсечь этот список.
// EN: The OMEGA 1.5.19 fixture includes a second similar record headed ## N. [type] `mem-…`; the boundary must preserve headings inside knowledge and exclude this list.
const ID_1364 = 'mem-11124e46078e';
const ZHIVOJ_0110 = '# Similar Memories (5)\n\n**Source:** `mem-11124e46` — # Возраст записи выдачу не отсекает\n\n## Было — стало\n\n**Было (черновик замысла выдачи, §5).** Правил\n\n## 1. [decision] `mem-ac5366b1` (similarity: 0.90)\n# Возраст записи не отсекает её при выдаче знаний по задаче\n\n**Было — стало.** В замысле выдачи знаний по смыслу задачи было заложено правило плугина restore: запись старше 7 суток (порог `ignoreAfter\n\n## 2. [decision] `mem-f3cb3df9` (similarity: 0.78)\n# Снимки состояния в выдаче знаний отсекать по давности, а не всем классом\n\n## Откуда правило\n\n';

proba('source-readback ГЛАВНОЕ: короткий первый заголовок и «## Раздел» следом — запись находит сама себя (живой 01.10)', () => {
  const r = istolkovatOtvet(ZHIVOJ_0110, ID_1364, '# Возраст записи выдачу не отсекает\n\n## Было — стало\n\n**Было (черновик замысла выдачи, §5).** Правила');
  if (r.sostoyanie !== 'dostavleno') throw new Error('Source оборван на заголовке внутри знания: ' + r.sostoyanie);
});

proba('source-readback ГЛАВНОЕ: наш текст только в ПОХОЖЕЙ записи живой формы «## N. [тип]» → не доставка', () => {
  const r = istolkovatOtvet(ZHIVOJ_0110, ID_1364, '# Возраст записи не отсекает её при выдаче знаний по задаче');
  if (r.sostoyanie === 'dostavleno') throw new Error('захват Source ушёл в список похожих — подтвердились по ЧУЖОЙ записи');
});

proba('source-readback: обычное знание без заголовков в живой форме списка → доставка', () => {
  const s = '# Similar Memories (2)\n\n**Source:** `mem-dfc9d075` — ' + NASH + '.\n\n## 1. [lesson_learned] `mem-eeeeeeee` (similarity: 0.71)\nчужое';
  const r = istolkovatOtvet(s, ID, NASH);
  if (r.sostoyanie !== 'dostavleno') throw new Error(r.sostoyanie);
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
