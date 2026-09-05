/**
 * Стенд РУБЕЖА ПРОИСХОЖДЕНИЯ (Э5.3) — по воротам приёмки В1–В8.
 *
 * Предмет решён служебным каналом 04–05.09.2026: умолчание НЕЙТРАЛЬНОЕ, ноль — только для записей
 * ПОСЛЕ рубежа, «до протокола» — отдельная строка в выдаче и нейтральная сортировка,
 * статус при обновлении не меняется, рубеж — данные в базе и снимается в той же транзакции,
 * что ALTER TABLE, ввоз с сохранением чужих id запрещён.
 *
 * 🔴 В1 И В5 РАЗВЕДЕНЫ ПО РАЗНЫМ БАЗАМ НАМЕРЕННО (поправка автора предмета к воротам).
 * Прогон В1 добавляет запись — и В5, считающий записи на той же базе, дал бы 42+1 и
 * покраснел бы на ИСПРАВНОМ поведении. Признак такой пары назван им же: два критерия
 * конфликтуют, если порча одного меняет число, которое проверяет другой.
 *
 * Первая проба — на заведомо исправном: соврала она, значит сломан стенд, а не предмет.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let otkrytHranilishche;
try {
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 160)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code + ' (' + String(e.message).slice(0, 80) + ')');
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-rubezh-'));
const svezhaya = (imya) => join(katalog, imya + '.db');

/** База «как до миграции»: записи есть, полей и рубежа нет. Иначе рубеж снимется на пустой. */
function bazaSoStarymiZapisyami(put, skolko) {
  const h = otkrytHranilishche(put);
  for (let i = 0; i < skolko; i++) {
    h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'старая запись ' + i, istochnik: 'session#' + i });
  }
  // Снимаем следы миграции, оставляя записи: так выглядит база, накопленная до Э5.3.
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN proishozhdenie');
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN proverka');
  h.baza.exec("DELETE FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'");
  h.zakryt();
}

console.log('стенд рубежа происхождения (Э5.3), ворота В1–В8');

proba('стенд годен: на исправном предмете миграция проходит и рубеж читается', () => {
  const put = svezhaya('godnost');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  const r = h.rubezhProishozhdeniya();
  if (r !== 3) throw new Error('рубеж ' + r + ' вместо 3');
  h.zakryt();
});

// ─── В5: ЧИСЛА ДО И ПОСЛЕ, СПОКОЙНАЯ БАЗА (без параллельных вставок) ───────────
proba('В5 числа: 42 записи до миграции → 42 «до протокола», 0 уровня, 0 потерянных', () => {
  const put = svezhaya('v5');
  bazaSoStarymiZapisyami(put, 42);
  const h = otkrytHranilishche(put);
  const rubezh = h.rubezhProishozhdeniya();
  const vse = h.baza.prepare('SELECT * FROM zapisi ORDER BY id').all();
  if (vse.length !== 42) throw new Error('записей ' + vse.length + ' вместо 42 — потеряны при миграции');
  let doProtokola = 0, urovnej = 0, neUstanovleno = 0;
  for (const z of vse) {
    const s = h.statusProishozhdeniya(z, rubezh);
    if (s.status === 'do-protokola') doProtokola++;
    else if (s.status === 'uroven') urovnej++;
    else neUstanovleno++;
  }
  if (doProtokola !== 42) throw new Error('«до протокола» ' + doProtokola + ' вместо 42');
  if (urovnej !== 0) throw new Error('с уровнем ' + urovnej + ' вместо 0 — старым записям приписали измерение');
  if (neUstanovleno !== 0) throw new Error('«не установлено» ' + neUstanovleno + ' вместо 0');
  h.zakryt();
});

// ─── В1: АТОМАРНОСТЬ, ОТДЕЛЬНАЯ БАЗА ──────────────────────────────────────────
proba('В1 атомарность: пока миграция держит запись, вставка со стороны НЕ проходит', () => {
  const put = svezhaya('v1');
  bazaSoStarymiZapisyami(put, 5);
  const a = otkrytHranilishche(put);          // миграция уже прошла при открытии
  const b = otkrytHranilishche(put);
  a.baza.exec('BEGIN IMMEDIATE');             // воспроизводим окно миграции
  let upalo = false;
  try {
    b.baza.prepare('INSERT INTO zapisi (agent, klass, soderzhim, sozdano) VALUES (?, ?, ?, ?)')
      .run('chuzhoj', 'zametka', 'вставка во время миграции', Date.now());
  } catch { upalo = true; }
  a.baza.exec('COMMIT');
  if (!upalo) throw new Error('вставка прошла во время удерживаемой записи — окно для «до протокола» открыто');
  a.zakryt(); b.zakryt();
});

proba('В1 следствие: запись, легшая ПОСЛЕ миграции, получает «не установлено», не «до протокола»', () => {
  const put = svezhaya('v1b');
  bazaSoStarymiZapisyami(put, 5);
  const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'новая после рубежа' });
  const s = h.statusProishozhdeniya(h.poId(id));
  if (s.status !== 'ne-ustanovleno') throw new Error('статус ' + s.status + ' вместо ne-ustanovleno');
  h.zakryt();
});

// ─── В2: РУБЕЖ — ДАННЫЕ, НЕ КОНСТАНТА ─────────────────────────────────────────
proba('В2 порча: подмена рубежа В БАЗЕ меняет выдачу — значит читается оттуда, а не из кода', () => {
  const put = svezhaya('v2');
  bazaSoStarymiZapisyami(put, 10);
  const h = otkrytHranilishche(put);
  const doPodmeny = h.statusProishozhdeniya(h.poId(7)).status;
  h.baza.prepare("UPDATE nastrojki SET znachenie = '3' WHERE kluch = 'rubezh_proishozhdeniya'").run();
  const posle = h.statusProishozhdeniya(h.poId(7)).status;
  if (doPodmeny !== 'do-protokola') throw new Error('до подмены статус ' + doPodmeny);
  if (posle !== 'ne-ustanovleno') throw new Error('после подмены статус ' + posle + ' — рубеж взят не из базы');
  h.zakryt();
});

proba('В2 порча: числа рубежа в исходнике нет — искать нечего', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hranilishche.js'), 'utf8');
  const podozritelnye = src.match(/rubezh\w*\s*=\s*\d+/gi) || [];
  if (podozritelnye.length) throw new Error('рубеж присвоен числом в коде: ' + podozritelnye.join(', '));
});

// ─── В3: ТРИ РАЗНЫЕ СТРОКИ И НЕЙТРАЛЬНАЯ СОРТИРОВКА ───────────────────────────
proba('В3 три состояния дают ТРИ РАЗНЫЕ строки, а не три числа', () => {
  const put = svezhaya('v3');
  bazaSoStarymiZapisyami(put, 4);
  const h = otkrytHranilishche(put);
  const staraya = h.statusProishozhdeniya(h.poId(1));
  const novayaId = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'новая' });
  const novaya = h.statusProishozhdeniya(h.poId(novayaId));
  h.otmetitProishozhdenie({ id: novayaId, uroven: 2 });
  const s_urovnem = h.statusProishozhdeniya(h.poId(novayaId));
  const stroki = new Set([staraya.stroka, novaya.stroka, s_urovnem.stroka]);
  if (stroki.size !== 3) throw new Error('строк ' + stroki.size + ' вместо 3: ' + [...stroki].join(' | '));
  if (!staraya.stroka.includes('до протокола')) throw new Error('старая запись не названа «до протокола»');
  if (staraya.uroven !== null) throw new Error('у «до протокола» появилось число — оно будет сравнено');
  h.zakryt();
});

proba('В3 порча: введение поля НЕ переставило выдачу — порядок построчно тот же', () => {
  const put = svezhaya('v3b');
  bazaSoStarymiZapisyami(put, 12);
  const h1 = otkrytHranilishche(put);
  const doM = h1.baza.prepare('SELECT id FROM zapisi WHERE agent = ? ORDER BY sozdano DESC LIMIT 20').all('stend').map((r) => r.id);
  h1.zakryt();
  const h2 = otkrytHranilishche(put);
  const posle = h2.prochitat({ agent: 'stend' }).map((z) => z.id);
  if (JSON.stringify(doM) !== JSON.stringify(posle)) throw new Error('порядок выдачи изменился: было ' + doM + ', стало ' + posle);
  h2.zakryt();
});

// ─── В4: ИДЕМПОТЕНТНОСТЬ ──────────────────────────────────────────────────────
proba('В4 идемпотентность: повторная миграция НЕ пересчитывает рубеж', () => {
  const put = svezhaya('v4');
  bazaSoStarymiZapisyami(put, 42);
  const h1 = otkrytHranilishche(put);
  const pervyj = h1.rubezhProishozhdeniya();
  h1.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'после первой миграции' });
  h1.zakryt();
  const h2 = otkrytHranilishche(put);        // второй прогон миграции
  const vtoroj = h2.rubezhProishozhdeniya();
  if (pervyj !== 42) throw new Error('первый рубеж ' + pervyj + ' вместо 42');
  if (vtoroj !== pervyj) throw new Error('рубеж пересчитан: ' + pervyj + ' → ' + vtoroj + ' — вся память ушла бы в «после протокола»');
  h2.zakryt();
});

proba('В4-бис: блок миграции вошёл из-за НЕДОСТАЮЩЕГО поля — рубеж всё равно не пересчитан', () => {
  // 🔴 Заведена 05.09.2026 после того, как первая порча идемпотентности прошла НЕЗАМЕЧЕННОЙ.
  // Проба В4 закрывает только случай «второе открытие ничего не мигрирует»: блок в него
  // не входит вовсе, и порча ВНУТРИ блока ничего не ломает — она не исполняется.
  // Ветка «блок вошёл, а рубеж уже есть» зовётся редко: при поэтапном заведении полей.
  // Класс (формулировка из служебного канала): ветка, исполняемая только при находке, не проверяется,
  // пока находок нет, — и ломается ровно тогда, когда нужна.
  const put = svezhaya('v4bis');
  bazaSoStarymiZapisyami(put, 5);
  const h1 = otkrytHranilishche(put);
  const pervyj = h1.rubezhProishozhdeniya();
  h1.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'запись после первой миграции' });
  // Возвращаем базу в состояние «поле proverka ещё не заводили, а рубеж уже стоит».
  h1.baza.exec('ALTER TABLE zapisi DROP COLUMN proverka');
  h1.zakryt();
  const h2 = otkrytHranilishche(put);   // блок миграции ВОЙДЁТ: не хватает столбца
  const stolbcy = h2.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  if (!stolbcy.includes('proverka')) throw new Error('столбец proverka не добавлен — блок не входил, проба ничего не проверила');
  const vtoroj = h2.rubezhProishozhdeniya();
  if (vtoroj !== pervyj) throw new Error('рубеж пересчитан при доборе поля: ' + pervyj + ' → ' + vtoroj);
  h2.zakryt();
});

// ─── В6: ИМЯ ПОЛЯ ─────────────────────────────────────────────────────────────
proba('В6 порча: уровень, положенный в `vera`, ломает читателя — поле именно proishozhdenie', () => {
  const put = svezhaya('v6');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  const stolbcy = h.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  if (!stolbcy.includes('proishozhdenie')) throw new Error('нет столбца proishozhdenie');
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'новая', vera: 0.9 });
  // Порча: если бы уровень происхождения писали в `vera`, статус происхождения о нём
  // не узнал бы вовсе — а читатель веры (restore) объявил бы запись измеренной.
  const s = h.statusProishozhdeniya(h.poId(id));
  if (s.status !== 'ne-ustanovleno') throw new Error('вера подменила происхождение: статус ' + s.status);
  h.zakryt();
});

// ─── В7: СТАТУС НЕ МЕНЯЕТСЯ ПРИ ОБНОВЛЕНИИ ────────────────────────────────────
proba('В7 отмывание: проставить уровень записи НИЖЕ рубежа → ОТКАЗ, а не тихий пропуск', () => {
  const put = svezhaya('v7');
  bazaSoStarymiZapisyami(put, 6);
  const h = otkrytHranilishche(put);
  const e = dolzhnoUpast('PAMYAT_ZAPIS_DO_PROTOKOLA', () => h.otmetitProishozhdenie({ id: 2, uroven: 3 }));
  if (!String(e.message).includes('ниже рубежа') && !String(e.message).includes('НИЖЕ рубежа')) {
    throw new Error('отказ не называет причину: ' + e.message);
  }
  const posle = h.statusProishozhdeniya(h.poId(2));
  if (posle.status !== 'do-protokola') throw new Error('статус после отказа ' + posle.status + ' — отмывание удалось');
  h.zakryt();
});

proba('В7 граница: записи ВЫШЕ рубежа уровень проставляется свободно', () => {
  const put = svezhaya('v7b');
  bazaSoStarymiZapisyami(put, 6);
  const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'новая' });
  if (h.otmetitProishozhdenie({ id, uroven: 1 }) !== true) throw new Error('уровень не проставился записи выше рубежа');
  if (h.statusProishozhdeniya(h.poId(id)).status !== 'uroven') throw new Error('статус не стал уровнем');
  h.zakryt();
});

// ─── В8: ОГРАНИЧЕНИЕ ВВОЗА НАЗВАНО В ФАЙЛЕ МИГРАЦИИ ───────────────────────────
proba('В8 стенд-документ: ограничение ввоза записано в самом файле миграции', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hranilishche.js'), 'utf8');
  for (const slovo of ['ВВОЗ С СОХРАНЕНИЕМ ЧУЖИХ id', 'отмывание', 'НАШИ id']) {
    if (!src.includes(slovo)) throw new Error('в шапке миграции нет слов «' + slovo + '» — ограничение стало украшением');
  }
});

// ─── ОТКАЗ ВМЕСТО ВЫДУМАННОГО НУЛЯ ────────────────────────────────────────────
proba('рубежа нет в базе → ОТКАЗ, а не «рубеж ноль» (ноль обвинил бы всю память)', () => {
  const put = svezhaya('bez-rubezha');
  bazaSoStarymiZapisyami(put, 2);
  const h = otkrytHranilishche(put);
  h.baza.prepare("DELETE FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").run();
  dolzhnoUpast('PAMYAT_NET_RUBEZHA', () => h.rubezhProishozhdeniya());
  h.zakryt();
});

rmSync(katalog, { recursive: true, force: true });
console.log(`\nитог рубежа: ${proshlo}/${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
