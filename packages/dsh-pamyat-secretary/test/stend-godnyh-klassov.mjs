#!/usr/bin/env node
// RU: Проверяем список классов модели: он строится из константы и сужается решением ядра, чтобы не предлагать заведомо незаписываемые классы. Вторая копия списка в промпте запрещена. Объявление сужения в живом журнале здесь не проверяется. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test the model’s class list: build it from the constant and narrow it using the core’s decision so unwritable classes are not offered. A second list copy in the prompt is forbidden. Reporting the narrowing in a live journal is not tested here. Codes: 0 success, 1 mismatch, 2 unobservable.
let vyborTem, KLASSY;
try {
  ;({ vyborTem, KLASSY } = await import('../src/promty.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ'); };
const proba = (imya, f) => {
  try { sud(f()); ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

proba('стенд годен: без довода промпт несёт ВЕСЬ список классов', () => {
  const t = vyborTem();
  for (const k of KLASSY) if (!t.includes(k)) throw new Error('класса нет в промпте: ' + k);
});

proba('🔴 ГЛАВНОЕ: сужённый список — в промпте только годные, исключённого НЕТ', () => {
  const godnye = KLASSY.filter((k) => k !== 'ogranichenie');
  const t = vyborTem(godnye);
  if (t.includes('ogranichenie')) throw new Error('исключённый класс остался в тексте промпта');
  for (const k of godnye) if (!t.includes(k)) throw new Error('годный класс пропал: ' + k);
});

proba('копии списка в тексте нет: строка классов СТРОИТСЯ из довода', () => {
  const t = vyborTem(['vydumannyj-klass']);
  if (!t.includes('vydumannyj-klass')) throw new Error('довод не попал в текст — список зашит второй копией');
  // RU: В промпте не должно остаться настоящих классов вне подстановки: это была бы вторая копия списка.
  // EN: No actual class names may remain outside prompt substitution; that would be a second list copy.
  const ostalis = KLASSY.filter((k) => t.includes(k));
  if (ostalis.length) throw new Error('в тексте остались классы помимо довода: ' + ostalis.join(', '));
});

proba('пустой список годных НЕ выдаётся за полный', () => {
  const t = vyborTem([]);
  const ostalis = KLASSY.filter((k) => t.includes(k));
  if (ostalis.length) throw new Error('при пустом списке в промпте всё равно есть классы: ' + ostalis.join(', '));
});

console.log(`  итог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
