/** Стенд счёта: арифметика расхода. Числа взяты из контракта, не из головы. */
let raskhodVyzova, zavestiSchet
try {
  ;({ raskhodVyzova, zavestiSchet } = await import('../src/schet.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// 🔴 ПЕЧАТЬ СИЛЬНЕЕ СПРАВКИ (03.09.2026). Справка в README верна на день, когда её
// писали; эта строка верна всегда, потому что снимается с дерева в момент прогона.
// Довод: «число в тексте — перечень из одного элемента, и он устаревает молча».
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 180)); } };

proba('стенд годен: простой вызов без кеша считается прямо', () => {
  const r = raskhodVyzova({ inputTokens: 100, outputTokens: 50 });
  if (r.vhod !== 100 || r.vyhod !== 50 || r.vsego !== 150) throw new Error(JSON.stringify(r));
});

proba('🔴 ВХОД — СУММА ТРЁХ: кеш прибавляется, а не теряется', () => {
  // В контракте: counts are DISJOINT, billed input = sum of the three.
  const r = raskhodVyzova({ inputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 50, outputTokens: 10 });
  if (r.vhod !== 1050) throw new Error('вход ' + r.vhod + ', а должен быть 1050 — кеш потерян');
});

proba('🔴 ЗАНИЖЕНИЕ ПОЙМАНО БЫ: счёт по одному inputTokens дал бы 100 вместо 1050', () => {
  const r = raskhodVyzova({ inputTokens: 100, cacheReadTokens: 950, outputTokens: 0 });
  if (r.vhod === 100) throw new Error('считается только inputTokens — занижение при работающем кеше');
});

proba('🔴 reasoningTokens НЕ СЛАГАЕМОЕ: это часть выхода, а не отдельная статья', () => {
  // В адаптере: reasoning = completion_tokens_details.reasoning_tokens,
  // outputTokens = completion_tokens. Сложить — двойной счёт.
  const r = raskhodVyzova({ inputTokens: 10, outputTokens: 100, reasoningTokens: 80 });
  if (r.vsego !== 110) throw new Error('итог ' + r.vsego + ' — рассуждение посчитано дважды');
  if (r.izNihRassuzhdenie !== 80) throw new Error('рассуждение не показано справочно');
});

proba('ПОРЧА: не объект → отказ словами', () => {
  let upalo = false;
  try { raskhodVyzova(42); } catch (e) { upalo = /по объекту usage/.test(e.message); }
  if (!upalo) throw new Error('принято не-объект');
});

proba('ПОРЧА: отрицательное поле → отказ с ИМЕНЕМ поля', () => {
  let s = '';
  try { raskhodVyzova({ inputTokens: -5, outputTokens: 1 }); } catch (e) { s = e.message; }
  if (!/inputTokens/.test(s)) throw new Error('поле не названо: ' + s);
});

proba('🔴 ОТСУТСТВИЕ ЧИСЛА — НЕ НОЛЬ: копилка считает такие вызовы отдельно', () => {
  const s = zavestiSchet();
  s.uchest({ inputTokens: 10, outputTokens: 10 });
  s.uchest(undefined);
  s.uchest(null);
  const i = s.itog();
  if (i.uchtenoVyzovov !== 1) throw new Error('учтено ' + i.uchtenoVyzovov);
  if (i.bezChisla !== 2) throw new Error('без числа ' + i.bezChisla);
  if (i.polnyj !== false) throw new Error('итог назван полным при пропусках');
});

proba('итог называется НИЖНЕЙ оценкой (поле neMenshe), а не «расходом»', () => {
  const s = zavestiSchet();
  s.uchest({ inputTokens: 7, outputTokens: 3 });
  const i = s.itog();
  if (i.neMenshe !== 10) throw new Error('neMenshe ' + i.neMenshe);
  if ('rashod' in i) throw new Error('появилось поле «расход» — обещает точность, которой нет');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
