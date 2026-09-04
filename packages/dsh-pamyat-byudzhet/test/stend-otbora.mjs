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

// 🔴 ЭТА ПРОБА ПЕРЕЕХАЛА 04.09.2026 ИЗ `prichiny` В `svoystva` — И ЭТО НЕ ПОСЛАБЛЕНИЕ.
// Требование то же и осталось обязательным: «вера ниже порога» и «вера не измерялась»
// обязаны различаться. Изменилось МЕСТО: вера никого не отвергала, она свойство
// отброшенных, а не причина отброса. Проба стерегла верное требование в неверном поле.
proba('РАЗЛИЧЕНИЕ: «вера не измерялась» и «вера ниже порога» — РАЗНЫЕ свойства', () => {
  const r = otobrat({
    zapisi: [z('а'.repeat(200), { vera: 0.9 }), z('б'.repeat(200), { vera: 0.1 }), z('в'.repeat(200), { vera: null })],
    predel: 55, poryadok: 'vera',
  });
  const text = r.svodka.svoystva.join('; ');
  if (!/НЕИЗМЕРЕННОЙ/.test(text)) throw new Error('неизмеренная вера не названа отдельно: ' + text);
  if (!/ниже/.test(text)) throw new Error('низкая вера не названа отдельно: ' + text);
});

// ── ПРИЧИНА ПРОТИВ СВОЙСТВА ─────────────────────────────────────────────────
proba('🔴 вера НЕ попадает в причины: она никого не отвергала', () => {
  // ⚠️ ПРЕДЕЛ 40, А НЕ 55, И ЭТО НЕ МЕЛОЧЬ. При 55 одна запись поднималась, и
  // отброшенной оказывалась ровно та, у которой вера null — то есть ветка «вера
  // ниже порога» НЕ ИСПОЛНЯЛАСЬ ВОВСЕ. Порча «вернуть веру в причины» внеслась,
  // а проба осталась зелёной: она до испорченной строки не доходила.
  // Фикстура, не создающая проверяемого состояния, даёт зелёное, неотличимое от
  // исправности. Поймано порчей, не чтением.
  const r = otobrat({
    zapisi: [z('а'.repeat(200), { vera: 0.1 }), z('б'.repeat(200), { vera: null })],
    predel: 40, poryadok: 'svezhest',
  });
  const text = r.svodka.prichiny.join('; ');
  if (/вер/i.test(text))
    throw new Error('вера названа ПРИЧИНОЙ отброса, хотя отвергал предел: ' + text);
});

// 🔴 ДВЕ ПРИЧИНЫ, И ОНИ ЛЕЧАТСЯ РАЗНЫМ. Запись дороже всего предела не поднимется
// НИКОГДА и ни при каком порядке — её лечит дробление, а не порядок. Слив этих
// двух причин заставил бы разбирающего крутить порядок за чужой дефект.
// Пара проб обязана давать РАЗНЫЕ ответы: порознь каждая зеленеет на слитой причине.
proba('причина «не влезает целиком» — своя, а не «не поместилась»', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(4000))], predel: 55 });
  const text = r.svodka.prichiny.join('; ');
  if (!/ЦЕЛИКОМ/.test(text))
    throw new Error('запись дороже всего предела не названа своей причиной: ' + text);
  if (/не поместил/.test(text))
    throw new Error('названа и чужой причиной тоже — причины слиты: ' + text);
});

proba('причина «не поместилась в остаток» — своя, а не «не влезает целиком»', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(100)), z('б'.repeat(100))], predel: 40 });
  const text = r.svodka.prichiny.join('; ');
  if (!/не поместил/.test(text))
    throw new Error('вытесненная запись не названа своей причиной: ' + text);
  if (/ЦЕЛИКОМ/.test(text))
    throw new Error('названа и чужой причиной тоже — причины слиты: ' + text);
});

// ── ТЕПЛО: ПРИБОР, А НЕ ПРАВИЛО ─────────────────────────────────────────────
// 🔴 Проба на то, что тепло НЕ ВЛИЯЕТ на отбор. Звучит странно — обычно проверяют,
// что механизм работает. Но здесь решение владельца именно такое: считать и печатать,
// не отсекать, пока история короче трёх полураспадов. Без этой пробы кто-нибудь
// «доделает» тепло до порядка, и отбор молча сменит основание.
proba('🔴 тепло НЕ влияет на отбор: порядок тот же, что без него', () => {
  const staraya = z('а'.repeat(100), { sozdano: 1 });
  const svezhaya = z('б'.repeat(100), { sozdano: Date.now() });
  const r = otobrat({ zapisi: [staraya, svezhaya], predel: 40, poryadok: 'vera' });
  // при порядке «vera» обе с verой null → порядок между ними задан НЕ теплом
  if (r.svodka.teplo.vliyaet_na_otbor !== false)
    throw new Error('сводка утверждает, что тепло влияет на отбор');
  if (typeof r.svodka.teplo.mediana !== 'number')
    throw new Error('тепло не печатается — прибора нет');
});

proba('тепло: отсутствие — ТРЕТЬЕ состояние, не холод', () => {
  // ⚠️ Вторую запись датирую ЯВНО: умолчание помощника z() — sozdano 1000, то есть
  // 1970 год, и такая запись честно холодная. Первый прогон этой пробы покраснел
  // именно на умолчании фикстуры, а не на предмете: неполная фикстура даёт ложное
  // красное, неотличимое по виду от дефекта.
  const r = otobrat({ zapisi: [z('а'.repeat(200), { sozdano: 0 }), z('б'.repeat(200), { sozdano: Date.now() })], predel: 55 });
  const t = r.svodka.teplo;
  if (t.neizmereno !== 1)
    throw new Error('запись без даты рождения не отнесена к «тепло не измерялось»: ' + JSON.stringify(t));
  if (t.holodnyh !== 0)
    throw new Error('отсутствие тепла сочтено холодом — пустоту приравняли к нулю');
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
