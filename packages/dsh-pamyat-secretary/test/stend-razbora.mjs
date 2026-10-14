// RU: Проверяем разбор события компакции по SessionEventMap dsh-compaction 0.1.1-rc.2. Поля summary, shadowedRange, shadowedSeqs, shadowedTokenCount, provider и model взяты из типов платформы.
// EN: Test compaction-event parsing against dsh-compaction 0.1.1-rc.2 SessionEventMap. summary, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, and model fields come from platform types.
let razobratSvodku, tekstIzBlokov
try {
  ;({ razobratSvodku, tekstIzBlokov } = await import('../src/razbor-sobytiya.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: Состав снимаем с дерева в момент прогона, чтобы число не зависело от устаревшей справки.
// EN: Read contents from the tree during the run so the count does not depend on stale documentation.
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы (правка 06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};

const SOBYTIE = {
  compactionId: 'c-1',
  summary: [{ type: 'text', text: 'Владелец решил: копии проверять действием, а не отметкой.' }],
  shadowedRange: { start: 10, end: 42 },
  shadowedSeqs: [10, 11, 12, 40, 41, 42],
  shadowedTokenCount: 8123,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
};

proba('стенд годен: полное событие разбирается', () => {
  const r = razobratSvodku(SOBYTIE, { seansId: 'session' });
  if (!r.godno) throw new Error('не разобралось: ' + r.pochemu);
  if (!r.znanie.soderzhim.includes('копии проверять действием')) throw new Error('текст потерян');
});

proba('ГЛАВНОЕ: verbatim-ссылка указывает точный диапазон затенённого', () => {
  const r = razobratSvodku(SOBYTIE, { seansId: 'session' });
  if (r.znanie.istochnik !== 'session#10-42') throw new Error('ссылка ' + r.znanie.istochnik);
});

proba('одна затенённая запись — ссылка без диапазона', () => {
  const r = razobratSvodku({ ...SOBYTIE, shadowedSeqs: [7] });
  if (r.znanie.istochnik !== 'session#7') throw new Error('ссылка ' + r.znanie.istochnik);
});

proba('кто написал сводку — сохраняется (провайдер и модель)', () => {
  const r = razobratSvodku(SOBYTIE);
  if (r.znanie.postavshchik !== 'deepseek') throw new Error('провайдер потерян');
  if (r.znanie.model !== 'deepseek-v4-flash') throw new Error('модель потеряна');
});

proba('ПОРЧА: нет текста сводки → НЕ годно, и пустая строка не пишется', () => {
  const r = razobratSvodku({ ...SOBYTIE, summary: [] });
  if (r.godno) throw new Error('пустая сводка принята');
  if (r.znanie !== null) throw new Error('знание собрано из пустоты');
  if (!/пустое знание неотличимо/.test(r.pochemu)) throw new Error('причина не объясняет отказ');
});

proba('ПОРЧА: нет номеров затенённого → НЕ годно (знание без источника непроверяемо)', () => {
  const r = razobratSvodku({ ...SOBYTIE, shadowedSeqs: [] });
  if (r.godno) throw new Error('знание без ссылки принято');
  if (!/проверить нельзя/.test(r.pochemu)) throw new Error('причина не названа');
});

proba('ПОРЧА: событие без нагрузки → ответ, а НЕ исключение', () => {
  let brosilo = false;
  let r;
  try { r = razobratSvodku(undefined); } catch { brosilo = true; }
  if (brosilo) throw new Error('разбор бросил в чужом потоке событий — оборвёт обработку остальных');
  if (r.godno) throw new Error('пустое событие принято');
});

proba('ПОРЧА: мусор в номерах отбрасывается, а не ломает ссылку', () => {
  const r = razobratSvodku({ ...SOBYTIE, shadowedSeqs: [5, 'x', null, 9] });
  if (r.znanie.istochnik !== 'session#5-9') throw new Error('ссылка ' + r.znanie.istochnik);
});

proba('неизвестные провайдер и модель остаются ПУСТЫМИ, а не выдуманными', () => {
  const r = razobratSvodku({ ...SOBYTIE, provider: undefined, model: undefined });
  if (r.znanie.postavshchik !== null || r.znanie.model !== null) throw new Error('подставлено значение');
});

proba('текст собирается только из текстовых блоков', () => {
  const t = tekstIzBlokov([{ type: 'image' }, { type: 'text', text: 'первый' }, { type: 'text', text: 'второй' }]);
  if (t !== 'первый\nвторой') throw new Error('собрано: ' + JSON.stringify(t));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
