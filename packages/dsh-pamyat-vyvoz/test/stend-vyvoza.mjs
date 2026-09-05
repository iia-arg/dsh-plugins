/**
 * СТЕНД ВЫВОЗА И ВВОЗА — по воротам приёмки для Э8.5.
 *
 * 🔴 ПРОГОНЩИК ЗДЕСЬ АСИНХРОННЫЙ, И ЭТО НЕ ВКУС. Предмет (вывоз) сам асинхронный:
 * он await'ит загрузку ядра. Синхронный прогонщик засчитал бы такую пробу МГНОВЕННО,
 * а брошенное внутри ушло бы в никуда — проба стала бы зелёной при любом содержимом.
 * Наш класс 04.09.2026: у прогонщика и тела пробы должна совпадать природа.
 * Обратная защита тоже стоит: проба, вернувшая не-промис, названа вслух.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const zdes = dirname(fileURLToPath(import.meta.url));
const paket = join(zdes, '..', 'src');
const { vyvezti, otchyot } = await import(join(paket, 'vyvoz.js'));
const { vvezti } = await import(join(paket, 'vvoz.js'));
const { NE_VYVOZITSYA, POLYA, VERSIYA_SHEMY } = await import(join(paket, 'shema.js'));
const { vzyat_filtr } = await import(join(paket, 'yadro.js'));

// Фильтр ядра берём ПО ПУТИ: пакет вывоза ставится рядом с ядром, а стенд гоняется
// и в рабочем каталоге, где разрешения по имени может не быть.
const YADRO = join(zdes, '..', '..', 'dsh-pamyat-core', 'src', 'filtr-vhoda.js');

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (!(v && typeof v.then === 'function')) {
      console.log('  ⚠️  ' + imya + ' — тело пробы НЕ ожидающее; прогонщик асинхронный, это допустимо, но проверьте намерение');
    }
    await v;
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};
const dolzhnoUpast = async (kod, f) => {
  try { await f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code + ' (' + String(e.message).slice(0, 90) + ')');
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-vyvoz-'));
const put = (imya) => join(katalog, imya);

const SHEMA_ZAPISEJ = `CREATE TABLE zapisi (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT, klass TEXT, soderzhim TEXT,
  istochnik TEXT, sozdano INTEGER, bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0,
  vera REAL, ochistka TEXT, podozrenie TEXT)`;

function baza(imya, zapisi = []) {
  const p = put(imya + '.db');
  const db = new DatabaseSync(p);
  db.exec(SHEMA_ZAPISEJ);
  const v = db.prepare('INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano) VALUES (?,?,?,?,?)');
  zapisi.forEach((z, i) => v.run(z.agent ?? 'stend', z.klass ?? 'zametka', z.soderzhim, z.istochnik ?? 'sess#' + i, z.sozdano ?? 1000 + i));
  db.close();
  return p;
}
const schyot = (p) => { const db = new DatabaseSync(p, { readOnly: true }); const c = db.prepare('SELECT COUNT(*) c FROM zapisi').get().c; db.close(); return c; };

console.log('\n═══ ВЫВОЗ: ФИЛЬТР ЗОВЁТСЯ, А НЕ ПОВТОРЯЕТСЯ ═══');

await proba('ГЛАВНОЕ: запись с объявленным секретом НЕ уезжает наружу', async () => {
  const b = baza('sekret', [
    { soderzhim: 'обычное знание про порядок работы' },
    { soderzhim: 'password = Xk9#mQ2$vL8p' },
  ]);
  const f = put('sekret.jsonl');
  const it = await vyvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.zaderzhano !== 1) throw new Error('задержано ' + it.zaderzhano + ', ожидалась 1');
  if (it.vyvezeno !== 1) throw new Error('вывезено ' + it.vyvezeno + ', ожидалась 1');
  const telo = readFileSync(f, 'utf8');
  if (telo.includes('Xk9#mQ2')) throw new Error('🔴 СЕКРЕТ УЕХАЛ В ФАЙЛ');
});

await proba('все ЧЕТЫРЕ запирающих класса задерживаются, а не только объявленный', async () => {
  const b = baza('chetyre', [
    { soderzhim: 'password = Xk9#mQ2$vL8p' },                                   // obyavlennyj
    { soderzhim: 'ключ: 550e8400-e29b-41d4-a716-446655440000' },                 // uuid-obyavlennyj
    { soderzhim: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk' }, // strukturnyj:JWT
    { soderzhim: 'просто заметка' },
  ]);
  const it = await vyvezti({ baza: b, fajl: put('chetyre.jsonl'), yadro: YADRO });
  if (it.zaderzhano !== 3) throw new Error('задержано ' + it.zaderzhano + ' из трёх секретных; классы: ' + it.zaderzhannye.map((z) => z.klass).join(', '));
});

await proba('НЕЗНАКОМЫЙ класс ОСТАНАВЛИВАЕТ ВЕСЬ вывоз, файла нет', async () => {
  const podstavnoe = put('podstavnoe-yadro.mjs');
  writeFileSync(podstavnoe, `
    export function najti_sekret(t) { if (t.includes('ЧУЖОЕ')) return { klass: 'klass-iz-budushchego', pozicia: 0 };
      return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { if (k === 'obyavlennyj') return 'zapiraet'; if (k === 'entropiya') return 'pomechaet'; return 'neizvesten'; }
  `);
  const b = baza('neizv', [{ soderzhim: 'тут ЧУЖОЕ слово' }, { soderzhim: 'чистая запись' }]);
  const fajl = put('neizv.jsonl');
  let upalo = null;
  try { await vyvezti({ baza: b, fajl, yadro: podstavnoe }); }
  catch (e) { upalo = e; }
  if (!upalo) throw new Error('вывоз НЕ остановился на незнакомом классе — прошёл целиком');
  if (upalo.code !== 'VYVOZ_NEZNAKOMYJ_KLASS') throw new Error('код отказа ' + upalo.code);
  if (upalo.klass !== 'klass-iz-budushchego') throw new Error('класс не назван: ' + upalo.klass);
  // Файла быть НЕ должно: остановка означает, что наружу не ушло ничего, включая чистые записи.
  if (existsSync(fajl)) throw new Error('файл вывоза создан, хотя вывоз остановлен');
});

await proba('ПОМЕЧАЮЩИЙ класс ВЫВОЗИТСЯ (пометка ≠ запрет) и пометка названа', async () => {
  const podstavnoe = put('yadro-pometka.mjs');
  writeFileSync(podstavnoe, `
    export function najti_sekret(t) { if (t.includes('ЭНТРОПИЯ')) return { klass: 'entropiya', pozicia: 0 };
      return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { if (k === 'obyavlennyj') return 'zapiraet'; if (k === 'entropiya') return 'pomechaet'; return 'neizvesten'; }
  `);
  const b = baza('pom', [{ soderzhim: 'запись, где есть ЭНТРОПИЯ' }]);
  const f = put('pom.jsonl');
  const it = await vyvezti({ baza: b, fajl: f, yadro: podstavnoe });
  if (it.vyvezeno !== 1) throw new Error('вывезено ' + it.vyvezeno);
  if (!readFileSync(f, 'utf8').includes('pometka_filtra')) throw new Error('пометка не названа в файле');
});

await proba('ОТЧЁТ НЕ ВЫНОСИТ СОДЕРЖИМОЕ задержанной записи', async () => {
  const b = baza('otch', [{ soderzhim: 'password = SuperTajnoe#42xyz' }]);
  const it = await vyvezti({ baza: b, fajl: put('otch.jsonl'), yadro: YADRO });
  const t = otchyot(it);
  if (t.includes('SuperTajnoe')) throw new Error('🔴 отчёт вынес содержимое');
  if (!t.includes('пропущена')) throw new Error('отчёт молчит о задержке');
});

await proba('числа в отчёте АБСОЛЮТНЫЕ, а не доля (условие В13)', async () => {
  const b = baza('chisla', [{ soderzhim: 'чисто' }, { soderzhim: 'password = Xk9#mQ2$vL8p' }]);
  const t = otchyot(await vyvezti({ baza: b, yadro: YADRO }));
  if (!/всего 2, вывезено 1, задержано 1/.test(t)) throw new Error('нет абсолютных чисел: ' + t.split('\n')[0]);
});

await proba('«задержано 0» НЕ выдаётся за «секретов нет»', async () => {
  const b = baza('nol', [{ soderzhim: 'чистая запись' }]);
  const t = otchyot(await vyvezti({ baza: b, yadro: YADRO }));
  if (!t.includes('а НЕ «секретов нет»')) throw new Error('ноль подан без границы');
});

console.log('\n═══ ДОГОВОР С ЯДРОМ — FAIL-CLOSED С НАШЕЙ СТОРОНЫ (условие В12) ═══');

await proba('ядро БЕЗ najti_sekret → ОТКАЗ, файла вывоза НЕТ', async () => {
  const p = put('yadro-bez-funkcii.mjs');
  writeFileSync(p, 'export function rezhim(k){ return "neizvesten"; }');
  const b = baza('bezf', [{ soderzhim: 'что угодно' }]);
  const f = put('ne-dolzhen-poyavitsya.jsonl');
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: b, fajl: f, yadro: p }));
  if (existsSync(f)) throw new Error('🔴 файл вывоза создан при несостоявшемся договоре');
});

await proba('ядро с ЧУЖОЙ ФОРМОЙ ответа (tip вместо klass) → ОТКАЗ', async () => {
  const p = put('yadro-chuzhaya-forma.mjs');
  writeFileSync(p, `
    export function najti_sekret(t) { return t.includes('password') ? { tip: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { return 'zapiraet'; }
  `);
  const b = baza('forma', [{ soderzhim: 'password = Xk9#mQ2$vL8p' }]);
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: b, yadro: p }));
});

await proba('rezhim() с чужим словом в ответе → ОТКАЗ', async () => {
  const p = put('yadro-chuzhoj-rezhim.mjs');
  writeFileSync(p, `
    export function najti_sekret(t) { return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { return 'mozhno'; }
  `);
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: baza('rezh', []), yadro: p }));
});

await proba('ядра НЕТ вовсе → ОТКАЗ, а не «вывоз пока без фильтра»', async () => {
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: baza('netyadra', []), yadro: put('takogo-fajla-net.mjs') }));
});

console.log('\n═══ ВВОЗ ═══');

await proba('ГЛАВНОЕ: чужой id → ОТКАЗ, база НЕ тронута', async () => {
  const b = baza('chuzhieid', [{ soderzhim: 'своя запись' }]);
  const do_ = schyot(b);
  const f = put('s-id.jsonl');
  writeFileSync(f, JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'чужая', kogda: 1, zapisej: 1 })
    + '\n' + JSON.stringify({ id: 3, agent: 'chuzhoj', klass: 'zametka', soderzhim: 'чужое знание', istochnik: 'ch#1', sozdano: 5 }) + '\n');
  await dolzhnoUpast('VYVOZ_CHUZHIE_ID', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== do_) throw new Error('🔴 база изменилась при отказе');
});

await proba('ЧУЖАЯ ВЕРСИЯ СХЕМЫ → ОТКАЗ, база НЕ тронута', async () => {
  const b = baza('chuzhaya-shema', [{ soderzhim: 'своя' }]);
  const do_ = schyot(b);
  const f = put('chuzhaya.jsonl');
  writeFileSync(f, JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: 999, polya: POLYA, otkuda: 'из будущего', kogda: 1, zapisej: 0 }) + '\n');
  await dolzhnoUpast('VYVOZ_CHUZHAYA_SHEMA', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== do_) throw new Error('🔴 база изменилась при отказе');
});

await proba('АТОМАРНОСТЬ (В6): битая строка → НОЛЬ новых, а не «сколько успели»', async () => {
  const b = baza('atom', []);
  const f = put('bitaya.jsonl');
  const shapka = JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 3 });
  const horoshie = [1, 2].map((i) => JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'знание ' + i, istochnik: 's#' + i, sozdano: i }));
  writeFileSync(f, [shapka, ...horoshie, '{это не json', JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'знание 4', istochnik: 's#4', sozdano: 4 })].join('\n') + '\n');
  await dolzhnoUpast('VYVOZ_BITAYA_STROKA', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== 0) throw new Error('🔴 вставлено ' + schyot(b) + ' при битом файле — половина ввоза хуже отказа');
});

await proba('ВВОЗ ТОЖЕ ФИЛЬТРУЕТ: файл с секретом (пришёл с машины без фильтра) отклонён', async () => {
  const b = baza('vvoz-filtr', []);
  const f = put('s-sekretom.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'без фильтра', kogda: 1, zapisej: 2 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'password = Xk9#mQ2$vL8p', istochnik: 's#1', sozdano: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чистое знание', istochnik: 's#2', sozdano: 2 })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.otkloneno_filtrom !== 1) throw new Error('отклонено ' + it.otkloneno_filtrom + ', ожидалось 1');
  if (it.vstavleno !== 1) throw new Error('вставлено ' + it.vstavleno);
});

await proba('ТОЖДЕСТВО по паре «источник + время»: двойной ввоз НЕ удваивает', async () => {
  const b = baza('dvazhdy', []);
  const f = put('dvazhdy.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'одно знание', istochnik: 'sess#7', sozdano: 777 })].join('\n') + '\n');
  const p1 = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  const p2 = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (p1.vstavleno !== 1) throw new Error('первый ввоз вставил ' + p1.vstavleno);
  if (p2.vstavleno !== 0 || p2.uzhe_bylo !== 1) throw new Error('второй ввоз вставил ' + p2.vstavleno + ', «уже было» ' + p2.uzhe_bylo);
  if (schyot(b) !== 1) throw new Error('в базе ' + schyot(b) + ' записей вместо одной');
});

await proba('СТЕЙДЖИНГ ЧУЖОГО (В5): ограничение с чужой машины ложится НЕПОДТВЕРЖДЁННЫМ', async () => {
  const b = baza('staging', []);
  const f = put('ogr.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 2 }),
    JSON.stringify({ agent: 'a', klass: 'ogranichenie', soderzhim: 'не трогать чужие каталоги', istochnik: 'o#1', sozdano: 1, bez_podtverzhdeniya: 0 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'обычная заметка', istochnik: 'z#1', sozdano: 2, bez_podtverzhdeniya: 0 })].join('\n') + '\n');
  await vvezti({ baza: b, fajl: f, yadro: YADRO });
  const db = new DatabaseSync(b, { readOnly: true });
  const ogr = db.prepare("SELECT bez_podtverzhdeniya b FROM zapisi WHERE klass='ogranichenie'").get();
  const zam = db.prepare("SELECT bez_podtverzhdeniya b FROM zapisi WHERE klass='zametka'").get();
  db.close();
  if (ogr.b !== 1) throw new Error('🔴 чужое ограничение вступило в силу молча (bez_podtverzhdeniya=' + ogr.b + ')');
  if (zam.b !== 0) throw new Error('заметке зря поставлена пометка — правило шире объявленного');
});

console.log('\n═══ КРУГ: ВЫВОЗ → ВВОЗ В ПУСТУЮ БАЗУ ═══');

await proba('ГЛАВНОЕ: круг сохраняет число записей и их содержимое', async () => {
  const ishod = baza('krug-ot', [
    { soderzhim: 'первое знание', istochnik: 'k#1', sozdano: 111 },
    { soderzhim: 'второе знание', istochnik: 'k#2', sozdano: 222 },
    { soderzhim: 'третье знание', istochnik: 'k#3', sozdano: 333 },
  ]);
  const f = put('krug.jsonl');
  const v = await vyvezti({ baza: ishod, fajl: f, otkuda: 'stend', yadro: YADRO });
  const pustaya = baza('krug-v', []);
  const p = await vvezti({ baza: pustaya, fajl: f, yadro: YADRO });
  if (v.vyvezeno !== 3 || p.vstavleno !== 3) throw new Error('вывезено ' + v.vyvezeno + ', вставлено ' + p.vstavleno);
  const s = (put_) => { const db = new DatabaseSync(put_, { readOnly: true }); const r = db.prepare('SELECT soderzhim, istochnik, sozdano FROM zapisi ORDER BY sozdano').all(); db.close(); return JSON.stringify(r); };
  if (s(ishod) !== s(pustaya)) throw new Error('содержимое разошлось:\n  было ' + s(ishod) + '\n  стало ' + s(pustaya));
});

await proba('номера у принимающей базы СВОИ, а не исходные', async () => {
  const ishod = baza('nom-ot', []);
  const db0 = new DatabaseSync(ishod);
  db0.exec("INSERT INTO zapisi (id, agent, klass, soderzhim, istochnik, sozdano) VALUES (500,'a','zametka','знание','n#1',9)");
  db0.close();
  const f = put('nom.jsonl');
  await vyvezti({ baza: ishod, fajl: f, yadro: YADRO });
  const pustaya = baza('nom-v', []);
  await vvezti({ baza: pustaya, fajl: f, yadro: YADRO });
  const db = new DatabaseSync(pustaya, { readOnly: true });
  const id = db.prepare('SELECT id FROM zapisi').get().id;
  db.close();
  if (id === 500) throw new Error('🔴 чужой номер перенесён — рубеж происхождения обойдён');
});

console.log('\n═══ ГРАНИЦЫ ОБЪЯВЛЕНЫ (условие В11) ═══');

await proba('«чего НЕ вывозит» объясняет ПОЧЕМУ, а не только ЧТО', async () => {
  const bez = Object.entries(NE_VYVOZITSYA).filter(([, v]) => String(v).length < 40);
  if (bez.length) throw new Error('без объяснения: ' + bez.map(([k]) => k).join(', '));
  for (const k of ['zhurnal', 'ochered_dolgovremennogo', 'id']) {
    if (!(k in NE_VYVOZITSYA)) throw new Error('не назван: ' + k);
  }
});

await proba('в перечне переносимых полей НЕТ id', async () => {
  if (POLYA.includes('id')) throw new Error('🔴 id в перечне переносимых полей');
});

await proba('отчёт и файл называют РЕДАКЦИЮ пакета, и она из манифеста', async () => {
  const { VERSIYA_PAKETA } = await import(join(paket, 'vyvoz.js'));
  const manifest = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf8'));
  if (VERSIYA_PAKETA !== manifest.version) throw new Error('в коде ' + VERSIYA_PAKETA + ', в манифесте ' + manifest.version);
  const b = baza('versiya', [{ soderzhim: 'знание' }]);
  const f = put('versiya.jsonl');
  const t = otchyot(await vyvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (!t.includes(manifest.version)) throw new Error('отчёт не называет редакцию');
  if (!readFileSync(f, 'utf8').includes('chem_vyvezeno')) throw new Error('файл вывоза не называет, чем вывезен');
});

await proba('СХЕМА УШЛА ВПЕРЁД: поле есть в базе, вывоз о нём не знает — сказано ГРОМКО', async () => {
  const b = baza('novoe-pole', [{ soderzhim: 'обычная запись' }]);
  // Поле, которого вывоз не знает НИ как вывозимое, НИ как непереносимое.
  const db = new DatabaseSync(b);
  db.exec('ALTER TABLE zapisi ADD COLUMN pole_iz_budushchego TEXT DEFAULT NULL');
  db.close();
  const fajl = put('novoe-pole.jsonl');
  const it = await vyvezti({ baza: b, fajl, yadro: YADRO });
  if (!(it.polya_neizvestnye_vyvozu ?? []).includes('pole_iz_budushchego')) {
    throw new Error('поле не названо: ' + JSON.stringify(it.polya_neizvestnye_vyvozu));
  }
  const t = otchyot(it);
  if (!t.includes('НЕ ЗНАЕТ')) throw new Error('в отчёте нет громкой строки:\n' + t);
  // Принимающая сторона обязана увидеть это ИЗ ФАЙЛА, а не из нашего отчёта.
  const shapka = JSON.parse(readFileSync(fajl, 'utf8').split('\n')[0]);
  if (!(shapka.polya_neizvestnye_vyvozu ?? []).includes('pole_iz_budushchego')) {
    throw new Error('шапка файла молчит о неизвестном поле: ' + JSON.stringify(shapka));
  }
});

await proba('🔴 путь к фильтру не строкой → отказ НАЗЫВАЕТ, что пришло', async () => {
  // Поймано своей же пробой 05.09.2026: передала готовое ядро вместо пути, и отказ
  // напечатал «ядро не загрузилось ([object Object])» — правдиво и бесполезно.
  try {
    await vzyat_filtr({ najti_sekret() {}, rezhim() {} });
    throw new Error('отказа не было — объект принят за путь');
  } catch (e) {
    if (e.code !== 'VYVOZ_DOGOVOR_YADRA') throw new Error('не тот отказ: ' + e.message);
    if (!/должен быть строкой/.test(e.message) || !/object/.test(e.message)) {
      throw new Error('отказ не называет, ЧТО пришло: ' + e.message);
    }
  }
})

console.log(`\n  итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
