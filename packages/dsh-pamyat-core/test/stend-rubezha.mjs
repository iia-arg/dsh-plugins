// RU: Проверяем рубеж происхождения: нейтральное умолчание для старых записей, ноль только после рубежа, отдельная строка «до протокола» и нейтральная сортировка. Обновление не меняет статус. Рубеж хранится в базе и снимается в транзакции ALTER TABLE; ввоз с чужими id запрещён. Атомарность и счёт проверяем на разных базах, чтобы вставки не меняли соседний критерий. Сначала исправный контроль.
// EN: Test the provenance boundary: neutral default for old records, zero only after the boundary, a separate “before protocol” annotation, and neutral sorting. Updates do not change status. The database stores the boundary captured in the ALTER TABLE transaction; importing external ids is forbidden. Test atomicity and counting on separate databases so inserts cannot affect the other criterion. Begin with a healthy control.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

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
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
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

const katalog = vremennyj(join(tmpdir(), 'pamyat-rubezh-'));
const svezhaya = (imya) => join(katalog, imya + '.db');

// RU: База до миграции содержит записи, но не новые поля или рубеж; пустая база не проверила бы положение рубежа.
// EN: The pre-migration database contains records but no new fields or boundary; an empty database would not test boundary placement.
function bazaSoStarymiZapisyami(put, skolko) {
  const h = otkrytHranilishche(put);
  for (let i = 0; i < skolko; i++) {
    h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'старая запись ' + i, istochnik: 'session#' + i });
  }
  // RU: Удаляем следы миграции и сохраняем старые записи.
  // EN: Remove migration traces while retaining old records.
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

// RU: Сверяем числа до и после без параллельных вставок.
// EN: Compare counts before and after without concurrent inserts.
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

// RU: Проверяем атомарность на отдельной базе.
// EN: Test atomicity on a separate database.
proba('В1 атомарность: пока миграция держит запись, вставка со стороны НЕ проходит', () => {
  const put = svezhaya('v1');
  bazaSoStarymiZapisyami(put, 5);
  const a = otkrytHranilishche(put);          /* RU: Открытие уже выполнило миграцию.
 * EN: Opening has already run migration.
 */
  const b = otkrytHranilishche(put);
  a.baza.exec('BEGIN IMMEDIATE');             /* RU: Воспроизводим окно миграции.
 * EN: Reproduce the migration window.
 */
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

// RU: Рубеж хранится как данные, а не константа.
// EN: The boundary is stored as data rather than a constant.
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

// RU: Проверяем три строки состояния и нейтральную сортировку.
// EN: Test three state annotations and neutral sorting.
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

// RU: Проверяем идемпотентность.
// EN: Test idempotency.
proba('В4 идемпотентность: повторная миграция НЕ пересчитывает рубеж', () => {
  const put = svezhaya('v4');
  bazaSoStarymiZapisyami(put, 42);
  const h1 = otkrytHranilishche(put);
  const pervyj = h1.rubezhProishozhdeniya();
  h1.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'после первой миграции' });
  h1.zakryt();
  const h2 = otkrytHranilishche(put);        /* RU: Запускаем миграцию второй раз.
 * EN: Run migration a second time.
 */
  const vtoroj = h2.rubezhProishozhdeniya();
  if (pervyj !== 42) throw new Error('первый рубеж ' + pervyj + ' вместо 42');
  if (vtoroj !== pervyj) throw new Error('рубеж пересчитан: ' + pervyj + ' → ' + vtoroj + ' — вся память ушла бы в «после протокола»');
  h2.zakryt();
});

proba('В4-бис: блок миграции вошёл из-за НЕДОСТАЮЩЕГО поля — рубеж всё равно не пересчитан', () => {
  // RU: Проверяем вход в миграционный блок при уже существующем рубеже: обычное повторное открытие пропускает блок и не ловит порчу внутри него. Частичная миграция должна сохранить рубеж.
  // EN: Test entry into the migration block when the boundary already exists: ordinary reopening skips the block and cannot detect mutations inside it. Partial migration must preserve the boundary.
  const put = svezhaya('v4bis');
  bazaSoStarymiZapisyami(put, 5);
  const h1 = otkrytHranilishche(put);
  const pervyj = h1.rubezhProishozhdeniya();
  h1.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'запись после первой миграции' });
  // RU: Создаём состояние с рубежом, но без поля proverka.
  // EN: Create a state with a boundary but no proverka field.
  h1.baza.exec('ALTER TABLE zapisi DROP COLUMN proverka');
  h1.zakryt();
  const h2 = otkrytHranilishche(put);   /* RU: Отсутствующий столбец заставляет войти в миграционный блок.
 * EN: The missing column forces entry into the migration block.
 */
  const stolbcy = h2.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  if (!stolbcy.includes('proverka')) throw new Error('столбец proverka не добавлен — блок не входил, проба ничего не проверила');
  const vtoroj = h2.rubezhProishozhdeniya();
  if (vtoroj !== pervyj) throw new Error('рубеж пересчитан при доборе поля: ' + pervyj + ' → ' + vtoroj);
  h2.zakryt();
});

// RU: Проверяем имя поля.
// EN: Test the field name.
proba('В5-бис: база с ДЫРАМИ в номерах — рубеж по MAX(id), а не по числу записей', () => {
  // RU: Различаем MAX(id) и COUNT(*) на базе с удалёнными записями. Непрерывные id делают величины равными и скрывают порчу; меньший COUNT(*) ошибочно поместит старые записи после рубежа и даст им ноль.
  // EN: Distinguish MAX(id) from COUNT(*) using deleted records. Consecutive ids make them equal and hide mutations; a smaller COUNT(*) wrongly places old records after the boundary and gives them zero.
  const put = svezhaya('v5bis');
  bazaSoStarymiZapisyami(put, 10);
  const db = new DatabaseSync(put);
  db.exec('DELETE FROM zapisi WHERE id <= 6');   /* RU: Остались четыре записи с id 7..10.
 * EN: Four records remain with ids 7..10.
 */
  const ostalos = db.prepare('SELECT COUNT(*) c FROM zapisi').get().c;
  const maks = db.prepare('SELECT MAX(id) m FROM zapisi').get().m;
  db.close();
  if (ostalos === maks) throw new Error('проба негодна: дыр нет, COUNT=' + ostalos + ' и MAX=' + maks + ' совпали');
  const h = otkrytHranilishche(put);
  const rubezh = h.rubezhProishozhdeniya();
  h.zakryt();
  if (rubezh !== maks) {
    throw new Error('рубеж ' + rubezh + ' при MAX(id)=' + maks + ' и записях ' + ostalos
      + ' — записи выше рубежа ушли бы в «после протокола» и получили ноль');
  }
});

proba('В6 порча: уровень, положенный в `vera`, ломает читателя — поле именно proishozhdenie', () => {
  const put = svezhaya('v6');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  const stolbcy = h.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  if (!stolbcy.includes('proishozhdenie')) throw new Error('нет столбца proishozhdenie');
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'новая', vera: 0.9 });
  // RU: Порча подменяет поле происхождения на vera: статус не увидит значение, а restore ошибочно объявит веру измеренной.
  // EN: Mutation substitutes vera for the provenance field: status misses the value while restore incorrectly treats confidence as measured.
  const s = h.statusProishozhdeniya(h.poId(id));
  if (s.status !== 'ne-ustanovleno') throw new Error('вера подменила происхождение: статус ' + s.status);
  h.zakryt();
});

// RU: Обновление не меняет статус происхождения.
// EN: Updating does not change provenance status.
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

// RU: Файл миграции должен назвать ограничение ввоза.
// EN: The migration file must state the import restriction.
proba('В8 стенд-документ: ограничение ввоза записано в самом файле миграции', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hranilishche.js'), 'utf8');
  for (const slovo of ['ВВОЗ С СОХРАНЕНИЕМ ЧУЖИХ id', 'отмывание', 'НАШИ id']) {
    if (!src.includes(slovo)) throw new Error('в шапке миграции нет слов «' + slovo + '» — ограничение стало украшением');
  }
});

// RU: Ошибка даёт отказ вместо выдуманного нуля.
// EN: An error must fail rather than invent a zero.
proba('рубежа нет в базе → ОТКАЗ, а не «рубеж ноль» (ноль обвинил бы всю память)', () => {
  const put = svezhaya('bez-rubezha');
  bazaSoStarymiZapisyami(put, 2);
  const h = otkrytHranilishche(put);
  h.baza.prepare("DELETE FROM nastrojki WHERE kluch = 'rubezh_proishozhdeniya'").run();
  dolzhnoUpast('PAMYAT_NET_RUBEZHA', () => h.rubezhProishozhdeniya());
  h.zakryt();
});

// RU: Поле proverka имеет три состояния; отсутствие не равно утрате опоры.
// EN: proverka has three states; absence is not loss of the reference.

proba('В6 сверка: отсутствие отметки = «не проверялось», а НЕ «утрачена»', () => {
  const put = svezhaya('sv1');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  const z = h.poId(1);
  const st = h.statusProverki(z);
  h.zakryt();
  if (st.status !== 'ne-proveryalos') throw new Error('статус ' + st.status + ' — пустое поле прочитано как суждение о предмете');
  if (/утрач/i.test(st.stroka)) throw new Error('строка обвиняет запись: ' + st.stroka);
});

proba('В6 сверка: отметка «опора есть» читается своим статусом', () => {
  const put = svezhaya('sv2');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  if (!h.otmetitProverku({ id: 2, ishod: 'est', chem: 'proverka-opory.mjs/внешний zstd' })) throw new Error('отметка не легла');
  const st = h.statusProverki(h.poId(2));
  h.zakryt();
  if (st.status !== 'est') throw new Error('статус ' + st.status);
  if (st.chem !== 'proverka-opory.mjs/внешний zstd') throw new Error('прибор не сохранён: ' + st.chem);
});

proba('В6 сверка: «утрачена» отличается от «не проверялось» СТАТУСОМ, а не оттенком', () => {
  const put = svezhaya('sv3');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  h.otmetitProverku({ id: 1, ishod: 'utrachena', chem: 'proverka-opory.mjs' });
  const utr = h.statusProverki(h.poId(1));
  const net = h.statusProverki(h.poId(3));
  h.zakryt();
  if (utr.status === net.status) throw new Error('утраченная и непроверенная имеют один статус: ' + utr.status);
  if (utr.status !== 'utrachena' || net.status !== 'ne-proveryalos') throw new Error(utr.status + ' / ' + net.status);
});

proba('🔴 ОТМЕТКА БЕЗ ИМЕНИ ПРИБОРА — ОТКАЗ: иначе пропажу не отличить от негодного чтения', () => {
  const put = svezhaya('sv4');
  bazaSoStarymiZapisyami(put, 2);
  const h = otkrytHranilishche(put);
  try {
    dolzhnoUpast('PAMYAT_SVERKA_BEZ_PRIBORA', () => h.otmetitProverku({ id: 1, ishod: 'est' }));
    dolzhnoUpast('PAMYAT_SVERKA_BEZ_PRIBORA', () => h.otmetitProverku({ id: 1, ishod: 'est', chem: '   ' }));
  } finally { h.zakryt(); }
});

proba('«не проверялось» НЕ ЗАПИСЫВАЕТСЯ как исход — это отсутствие отметки', () => {
  const put = svezhaya('sv5');
  bazaSoStarymiZapisyami(put, 2);
  const h = otkrytHranilishche(put);
  try {
    dolzhnoUpast('PAMYAT_ISHOD_SVERKI_NEGODEN', () => h.otmetitProverku({ id: 1, ishod: 'ne-proveryalos', chem: 'прибор' }));
  } finally { h.zakryt(); }
});

proba('битая отметка НЕ выдаётся за «не проверялось» — у неё свой статус', () => {
  const put = svezhaya('sv6');
  bazaSoStarymiZapisyami(put, 2);
  const h = otkrytHranilishche(put);
  const st = h.statusProverki({ id: 1, proverka: 'не json вовсе' });
  h.zakryt();
  if (st.status !== 'otmetka-negodna') throw new Error('битая отметка прочитана как ' + st.status);
});

proba('сверка и происхождение — РАЗНЫЕ поля: отметка одного не трогает другое', () => {
  const put = svezhaya('sv7');
  bazaSoStarymiZapisyami(put, 3);
  const h = otkrytHranilishche(put);
  h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'после рубежа', istochnik: 's#9' });
  const nomer = h.poId(4) ? 4 : 3;
  h.otmetitProverku({ id: nomer, ishod: 'est', chem: 'прибор' });
  const z = h.poId(nomer);
  const pr = h.statusProishozhdeniya(z);
  h.zakryt();
  if (pr.status === 'uroven') throw new Error('отметка сверки проставила происхождение — поля слиты');
});

// RU: Убираем временную базу последним действием перед итогом; более поздние пробы не должны читать уже удалённый каталог.
// EN: Clean up the temporary database as the last action before the summary; later probes must not read a removed directory.
rmSync(katalog, { recursive: true, force: true });

console.log(`\nитог рубежа: ${proshlo}/${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
