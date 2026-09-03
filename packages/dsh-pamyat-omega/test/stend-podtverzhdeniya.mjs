/**
 * Стенд подтверждения доставки.
 *
 * ЭТАЛОНЫ СНЯТЫ С ЖИВОЙ СЛУЖБЫ 02.09.2026, omega-memory 1.5.13 — дважды и
 * двумя разными людьми, независимо. Стенд на выдуманных ответах закрепляет
 * наше представление вместо поведения службы; в соседнем пакете это уже
 * стоило зелёной пробы на несуществующем значении.
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
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};

const ID = 'mem-dfc9d0754cc9';
const NASH = 'Журнал, пишущий НАМЕРЕНИЕ в прошедшем времени, врёт при отказе';
// живой ответ: усечённый опознаватель, перенос и пустая строка СОХРАНЕНЫ, обрыв по длине
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

proba('точный ответ об отсутствии → ne-najdeno', () => {
  const r = istolkovatOtvet(NE_NAJDENO, ID, NASH);
  if (r.sostoyanie !== 'ne-najdeno') throw new Error(r.sostoyanie);
});

proba('ГЛАВНОЕ: наш текст в ПОХОЖЕЙ записи не подтверждает доставку (Source наш, содержимое чужое)', () => {
  // 🔴 Эта проба переписана после ворот: прежняя ставила в Source ЧУЖОЙ
  // опознаватель и потому падала на ветке опознавателя, не дойдя до содержимого.
  // Зелёная проба, проверявшая не то, что заявлено. Теперь опознаватель НАШ —
  // проверяется именно граница захвата содержимого.
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

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
