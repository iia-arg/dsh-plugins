/**
 * Стенд хранилища. Проверяет ФУНКЦИЮ, а не загрузку пакета.
 *
 * Каждая проба названа тем, что она доказывает. Порядок намеренный: первой идёт
 * проба на ЗАВЕДОМО ИСПРАВНОМ предмете — если она красная, стенд негоден и
 * остальные пробы ничего не значат.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let otkrytHranilishche, zagruzitDrajver, zavestiZhurnal
try {
  ;({ otkrytHranilishche, zagruzitDrajver } = await import('../src/hranilishche.js'))
  ;({ zavestiZhurnal } = await import('../src/zhurnal.js'))
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
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 120)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code);
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-stend-'));
const put = join(katalog, 'pamyat.db');

proba('стенд годен: на исправном предмете хранилище открывается и пишет', () => {
  const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'проба пера', istochnik: 'session#1' });
  if (!(id > 0)) throw new Error('запись не вернула id');
  const zapisi = h.prochitat({ agent: 'stend' });
  if (zapisi.length !== 1) throw new Error('прочитано ' + zapisi.length + ' вместо 1');
  if (zapisi[0].soderzhim !== 'проба пера') throw new Error('содержимое не то');
  if (zapisi[0].istochnik !== 'session#1') throw new Error('ссылка на источник потеряна');
  h.zakryt();
});

proba('ПОРЧА: нет модуля хранилища → отказ с внятным текстом, а не пустая память', () => {
  const e = dolzhnoUpast('PAMYAT_NET_HRANILISHCHA', () => zagruzitDrajver('node:sqlite-takogo-net'));
  for (const slovo of ['НЕ РАБОТАЕТ', 'отказ', 'Node']) {
    if (!e.message.includes(slovo)) throw new Error('в сообщении нет слова «' + slovo + '»');
  }
});

proba('ПОРЧА: база не открывается → отказ, а не тишина', () => {
  dolzhnoUpast('PAMYAT_BAZA_NE_OTKRYLAS', () => otkrytHranilishche('/proc/net/dev/pamyat.db'));
});

proba('ПОРЧА: путь не задан → отказ', () => {
  dolzhnoUpast('PAMYAT_NET_PUTI', () => otkrytHranilishche(undefined));
});

proba('ПОРЧА: неполная запись отвергается', () => {
  const h = otkrytHranilishche(join(katalog, 'p2.db'));
  dolzhnoUpast('PAMYAT_NEPOLNAYA_ZAPIS', () => h.zapisat({ agent: 'stend', klass: 'x' }));
  h.zakryt();
});

proba('РАЗЛИЧЕНИЕ: пустая база отдаёт пустой список и НЕ считается отказом', () => {
  const h = otkrytHranilishche(join(katalog, 'p3.db'));
  const zapisi = h.prochitat({ agent: 'nikogo-net' });
  if (!Array.isArray(zapisi) || zapisi.length !== 0) throw new Error('ожидался пустой список');
  if (h.skolkoZapisej('nikogo-net') !== 0) throw new Error('счёт не ноль');
  h.zakryt();
});

proba('ВЕРА: записывается и читается', () => {
  const h = otkrytHranilishche(join(katalog, 'v1.db'));
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'проверенное знание', vera: 0.9 });
  const z = h.prochitat({ agent: 'stend' })[0];
  if (z.vera !== 0.9) throw new Error('вера ' + z.vera);
  h.zakryt();
});

proba('ГЛАВНОЕ: «веру не измеряли» ОТЛИЧАЕТСЯ от «вера ноль»', () => {
  const h = otkrytHranilishche(join(katalog, 'v2.db'));
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'неоценённое' });
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'признано негодным', vera: 0 });
  const zapisi = h.prochitat({ agent: 'stend' });
  const neizmereno = zapisi.find((z) => z.soderzhim === 'неоценённое');
  const nol = zapisi.find((z) => z.soderzhim === 'признано негодным');
  if (neizmereno.vera !== null) throw new Error('неизмеренная вера стала ' + neizmereno.vera);
  if (nol.vera !== 0) throw new Error('измеренный ноль стал ' + nol.vera);
  if (neizmereno.vera === nol.vera) throw new Error('схлопнулись — ветка verify потеряет смысл');
  h.zakryt();
});

proba('ПОРЧА: негодная вера отвергается, а не подменяется нулём', () => {
  const h = otkrytHranilishche(join(katalog, 'v3.db'));
  for (const durnoe of [1.5, -0.1, 'много', NaN]) {
    let upalo = false;
    try { h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'x', vera: durnoe }); }
    catch (e) { upalo = e.code === 'PAMYAT_VERA_NEGODNA'; }
    if (!upalo) throw new Error('принято негодное значение: ' + String(durnoe));
  }
  h.zakryt();
});

proba('МИГРАЦИЯ: база без столбца vera читается, старым строкам вера НЕ выдумывается', () => {
  const put = join(katalog, 'v4.db');
  const { DatabaseSync } = zagruzitDrajver();
  const staraya = new DatabaseSync(put);
  staraya.exec('CREATE TABLE zapisi (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, klass TEXT NOT NULL, soderzhim TEXT NOT NULL, istochnik TEXT, sozdano INTEGER NOT NULL)');
  staraya.prepare('INSERT INTO zapisi (agent, klass, soderzhim, sozdano) VALUES (?,?,?,?)').run('stend', 'zametka', 'из прошлой версии', Date.now());
  staraya.close();
  const h = otkrytHranilishche(put);
  const z = h.prochitat({ agent: 'stend' })[0];
  if (z.soderzhim !== 'из прошлой версии') throw new Error('старая строка потеряна');
  if (z.vera !== null) throw new Error('старой строке приписали веру ' + z.vera);
  h.zakryt();
});

proba('🔴 ЗАПИСЬ ПЕРЕЖИВАЕТ ПЕРЕОТКРЫТИЕ ХРАНИЛИЩА (урок инцидента 03.09)', () => {
  // «Записалось» и «прочитается» — РАЗНЫЕ утверждения. У соседнего пакета запись
  // была принята хранилищем и сломала его при следующей загрузке: отказ ждал не
  // ошибки, а СОБЫТИЯ — перезагрузки. Поэтому проверяем не факт вставки, а
  // пригодность вставленного к чтению после закрытия и повторного открытия.
  const put = join(katalog, 'perezagruzka.db');
  const h1 = otkrytHranilishche(put);
  const id = h1.zapisat({
    agent: 'stend', klass: 'navyk', soderzhim: 'знание, которое обязано пережить перезапуск',
    istochnik: 'session#7-9', vera: 0.75, bezPodtverzhdeniya: true,
  });
  h1.zakryt();

  const h2 = otkrytHranilishche(put);          // ДРУГОЙ экземпляр, как после перезапуска службы
  const zapisi = h2.prochitat({ agent: 'stend' });
  if (zapisi.length !== 1) throw new Error('после переоткрытия записей ' + zapisi.length);
  const z = zapisi[0];
  if (z.id !== id) throw new Error('опознаватель изменился');
  if (z.soderzhim !== 'знание, которое обязано пережить перезапуск') throw new Error('содержимое искажено');
  if (z.istochnik !== 'session#7-9') throw new Error('ссылка на источник потеряна');
  if (z.vera !== 0.75) throw new Error('вера потеряна: ' + z.vera);
  if (z.bez_podtverzhdeniya !== 1) throw new Error('отметка о подтверждении потеряна');
  // и журнал тоже переживает
  const zh = zavestiZhurnal(h2.baza);
  h2.zakryt();
  if (!zh) throw new Error('журнал не поднялся на переоткрытой базе');
});

// 🔴 ПРИЧИНА ОТКАЗА НЕ ДОЛЖНА БЫТЬ ПУСТОЙ, даже когда у ошибки пустой message.
// Класс (долг 100): `??` реагирует только на null и undefined, пустая строка для него —
// найденное значение. У AggregateError, которую кладёт fetch, перебрав адреса, свой message
// как раз пустой — и строка «Причина: » печаталась с пустотой. Пустое поле хуже
// отсутствующего: оно читается как «причину узнали, она пустая», и вопрос гаснет.
// Проба подсовывает ИМЕННО такую ошибку через подставной драйвер — иначе ветку не достать.
proba('причина отказа непуста даже при пустом message (AggregateError)', () => {
  const drajver_s_pustym_message = {
    DatabaseSync: function () { throw new AggregateError([new Error('соединение отвергнуто')], ''); },
  };
  let brosheno = null;
  try { otkrytHranilishche(join(katalog, 'proba.db'), { drajver: drajver_s_pustym_message }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('отказа не случилось — проба не достала ветку');
  if (brosheno.code !== 'PAMYAT_BAZA_NE_OTKRYLAS') throw new Error('чужой код: ' + brosheno.code);
  const hvost = String(brosheno.message).split('Причина:')[1] ?? '';
  if (!hvost.trim()) throw new Error('«Причина:» с пустотой — нулевое слияние вернулось');
  if (!hvost.includes('AggregateError')) throw new Error('класс ошибки потерян: ' + hvost.trim());
  if (!hvost.includes('соединение отвергнуто'))
    throw new Error('внутренняя причина потеряна: ' + hvost.trim());
});

rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
