/** Стенд отбора: что поднято, что отброшено и НАЗВАНЫ ли причины. */
let otobrat
try {
  ;({ otobrat } = await import('../src/otbor.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); } };

const z = (soderzhim, extra = {}) => ({ soderzhim, sozdano: 1000, vera: null, ...extra });

proba('стенд годен: всё влезает → поднято всё, отброшено ноль', () => {
  const r = otobrat({ zapisi: [z('коротко'), z('тоже')], predel: 1000 });
  if (r.podnyato.length !== 2 || r.otbrosheno.length !== 0) throw new Error('подняли ' + r.podnyato.length);
  if (r.svodka.prichiny.length !== 0) throw new Error('причины при пустом отбросе');
});

proba('ГЛАВНОЕ: не влезло → отброшенное НАЗВАНО, а не только сосчитано', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(200)), z('б'.repeat(200))], predel: 55 });
  if (r.otbrosheno.length === 0) throw new Error('предел не сработал');
  if (r.svodka.prichiny.length === 0) throw new Error('отброшено молча, без причин');
  if (!r.svodka.prichiny.join(' ').match(/\d/)) throw new Error('в причинах нет чисел');
});

proba('РАЗЛИЧЕНИЕ: «вера не измерялась» и «вера ниже порога» — РАЗНЫЕ причины', () => {
  const r = otobrat({
    zapisi: [z('а'.repeat(200), { vera: 0.9 }), z('б'.repeat(200), { vera: 0.1 }), z('в'.repeat(200), { vera: null })],
    predel: 55, poryadok: 'vera',
  });
  const text = r.svodka.prichiny.join('; ');
  if (!/НЕИЗМЕРЕННОЙ/.test(text)) throw new Error('неизмеренная вера не названа отдельно: ' + text);
  if (!/ниже/.test(text)) throw new Error('низкая вера не названа отдельно: ' + text);
});

proba('🔴 ПУСТОТА НЕ НОЛЬ: запись без веры НЕ выбрасывается раньше доказанно плохой', () => {
  // порядок 'vera': 0.9 поднимется, затем спор между null и 0.1 — null должен быть впереди
  const r = otobrat({
    zapisi: [z('а'.repeat(100), { vera: 0.9 }), z('б'.repeat(100), { vera: 0.1 }), z('в'.repeat(100), { vera: null })],
    predel: 60, poryadok: 'vera',
  });
  const podnyatyeVery = r.podnyato.map((x) => x.vera);
  if (!podnyatyeVery.includes(null)) throw new Error('неизмеренная выброшена раньше веры 0.1 — пустоту сочли нулём');
});

proba('единицы названы СВОИМИ, слова «токены» в сводке нет', () => {
  const r = otobrat({ zapisi: [z('текст')], predel: 100 });
  if (r.svodka.edinicy !== 'оценка наша') throw new Error('единицы: ' + r.svodka.edinicy);
  if (/токен/i.test(JSON.stringify(r.svodka))) throw new Error('в сводке появилось слово «токены»');
});

proba('ПОРЧА: предел не число → отказ с кодом, а не молчаливый ноль', () => {
  let upalo = false;
  try { otobrat({ zapisi: [], predel: 'много' }); } catch (e) { upalo = /предел должен быть/.test(e.message); }
  if (!upalo) throw new Error('строковый предел принят');
});

proba('ПОРЧА: неизвестный порядок → отказ и ПЕРЕЧЕНЬ существующих', () => {
  let soobshchenie = '';
  try { otobrat({ zapisi: [], predel: 10, poryadok: 'важность' }); } catch (e) { soobshchenie = e.message; }
  if (!/svezhest/.test(soobshchenie)) throw new Error('не назвал, какие порядки есть: ' + soobshchenie);
});

proba('ПОРЧА: не список записей → отказ', () => {
  let upalo = false;
  try { otobrat({ zapisi: 'запись', predel: 10 }); } catch (e) { upalo = /список записей/.test(e.message); }
  if (!upalo) throw new Error('приняло не-список');
});

proba('предел ноль: поднято ничего, и это ОБЪЯСНЕНО, а не пусто', () => {
  const r = otobrat({ zapisi: [z('текст')], predel: 0 });
  if (r.podnyato.length !== 0) throw new Error('при нулевом пределе что-то поднялось');
  if (r.svodka.prichiny.length === 0) throw new Error('нулевой предел не объяснён');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
