/**
 * Стенд СЧЁТЧИКА КАСАНИЙ (Э8.3 П1) — по воротам приёмки В1–В3, В9.
 *
 * 🔴 РАЗНЫЕ БАЗЫ НА РАЗНЫЕ ВОРОТА (поправка автора предмета, принятая на рубеже).
 * Проба миграции добавляет записи; проба идемпотентности считает их же. На одной базе
 * вторая покраснела бы на ИСПРАВНОМ поведении. Признак пары: порча одного критерия
 * меняет число, которое проверяет другой.
 *
 * ЧЕГО ЭТОТ СТЕНД НЕ ЛОВИТ: он НЕ проверяет, что касание ставит тот, кто выдаёт агенту, —
 * это свойство ВЫЗЫВАЮЩЕГО (бюджет), и проверяется у него. Здесь проверяется, что чужой
 * повод отвергается, а не что все зовущие называют повод честно.
 */
import { mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    if (typeof vernulos === 'string') throw new Error(vernulos);
    if (vernulos === false) throw new Error('тело пробы вернуло false без причины');
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

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-kasaniya-'));
const svezhaya = (imya) => join(katalog, imya + '.db');

/** База «как до миграции касаний»: записи есть, полей нет. */
function bazaBezKasanij(put, skolko) {
  const h = otkrytHranilishche(put);
  for (let i = 0; i < skolko; i++) {
    h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'запись ' + i, istochnik: 'session#' + i });
  }
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN kasanij');
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN poslednee_kasanie');
  h.zakryt();
}

console.log('СТЕНД СЧЁТЧИКА КАСАНИЙ');

// ═══ В1: миграция ═══
proba('В1 миграция добавила ОБА поля', () => {
  const put = svezhaya('v1'); bazaBezKasanij(put, 5);
  const h = otkrytHranilishche(put);
  const stolbcy = h.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  const net = ['kasanij', 'poslednee_kasanie'].filter((k) => !stolbcy.includes(k));
  h.zakryt();
  if (net.length) return 'после миграции нет полей: ' + net.join(', ');
});

proba('В1 старые записи: касаний 0, последнее касание NULL', () => {
  const put = svezhaya('v1b'); bazaBezKasanij(put, 4);
  const h = otkrytHranilishche(put);
  const r = h.baza.prepare('SELECT COUNT(*) n, SUM(kasanij) s, SUM(poslednee_kasanie IS NULL) nul FROM zapisi').get();
  h.zakryt();
  if (Number(r.n) !== 4) return 'записей стало ' + r.n + ', а было 4 — миграция тронула данные';
  if (Number(r.s) !== 0) return 'сумма касаний ' + r.s + ', ожидалось 0';
  if (Number(r.nul) !== 4) return 'poslednee_kasanie не NULL у ' + (4 - Number(r.nul)) + ' записей';
});

proba('В1 повторное открытие НЕ обнуляет накопленное (идемпотентность)', () => {
  const put = svezhaya('v1c'); bazaBezKasanij(put, 3);
  const h1 = otkrytHranilishche(put);
  const ids = h1.baza.prepare('SELECT id FROM zapisi ORDER BY id').all().map((r) => Number(r.id));
  h1.otmetitKasanie({ ids, povod: 'vydacha-agentu' });
  h1.otmetitKasanie({ ids: [ids[0]], povod: 'vydacha-agentu' });
  const do_ = h1.baza.prepare('SELECT SUM(kasanij) s FROM zapisi').get().s;
  h1.zakryt();
  const h2 = otkrytHranilishche(put);   // вторая миграция на той же базе
  const posle = h2.baza.prepare('SELECT SUM(kasanij) s FROM zapisi').get().s;
  h2.zakryt();
  if (Number(do_) !== 4) return 'до повторного открытия сумма касаний ' + do_ + ', ожидалось 4';
  if (Number(posle) !== Number(do_)) return 'повторная миграция изменила касания: было ' + do_ + ', стало ' + posle;
});

// ═══ В2: что есть касание ═══
proba('В2 касание с поводом «выдача агенту» растит счётчик и ставит время', () => {
  const put = svezhaya('v2'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  const kogda = 1757000000000;
  const itog = h.otmetitKasanie({ ids: [id], povod: 'vydacha-agentu', kogda });
  const r = h.baza.prepare('SELECT kasanij k, poslednee_kasanie p FROM zapisi WHERE id = ?').get(id);
  h.zakryt();
  if (itog.otmecheno !== 1) return 'отмечено ' + itog.otmecheno + ', ожидалась 1';
  if (Number(r.k) !== 1) return 'касаний ' + r.k + ', ожидалось 1';
  if (Number(r.p) !== kogda) return 'время касания ' + r.p + ', ожидалось ' + kogda;
});

proba('В2 ЧУЖОЙ повод — ОТКАЗ, и счётчик не тронут', () => {
  const put = svezhaya('v2b'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  for (const chuzhoj of ['chtenie-priborom', 'vyvoz', 'distillyaciya', undefined, '']) {
    dolzhnoUpast('PAMYAT_KASANIE_NE_TOT_POVOD', () => h.otmetitKasanie({ ids: [id], povod: chuzhoj }));
  }
  const r = h.baza.prepare('SELECT kasanij k, poslednee_kasanie p FROM zapisi WHERE id = ?').get(id);
  h.zakryt();
  if (Number(r.k) !== 0) return 'после пяти отказов касаний ' + r.k + ', ожидалось 0';
  if (r.p !== null) return 'время касания проставлено при отказе: ' + r.p;
});

proba('В2 пустой список — НЕ отказ и не ошибка', () => {
  const put = svezhaya('v2c'); const h = otkrytHranilishche(put);
  const itog = h.otmetitKasanie({ ids: [], povod: 'vydacha-agentu' });
  h.zakryt();
  if (itog.otmecheno !== 0) return 'отмечено ' + itog.otmecheno + ', ожидался 0';
  if (itog.otkaz !== null) return 'пустой отбор объявлен отказом: ' + JSON.stringify(itog.otkaz);
});

proba('В2 повтор id В ОДНОМ ходе греет ОДИН раз, а не вдвое', () => {
  const put = svezhaya('v2d'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  // Так выглядит живой случай: сводка компакта добавляется к отобранным отдельно и может
  // совпасть с одной из них. Список приходит с дублем, ход при этом ОДИН.
  const itog = h.otmetitKasanie({ ids: [id, id, id], povod: 'vydacha-agentu' });
  const r = h.baza.prepare('SELECT kasanij k FROM zapisi WHERE id = ?').get(id);
  h.zakryt();
  if (Number(r.k) !== 1) return 'касаний ' + r.k + ' при трёх вхождениях одного id в одном ходе, ожидалось 1';
  if (itog.otmecheno !== 1) return 'отмечено ' + itog.otmecheno + ', ожидалась 1 (по числу РАЗНЫХ записей)';
});

proba('В2 разные записи в одном ходе греются каждая', () => {
  const put = svezhaya('v2e'); const h = otkrytHranilishche(put);
  const a = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'первая' });
  const b = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'вторая' });
  const itog = h.otmetitKasanie({ ids: [a, b, a], povod: 'vydacha-agentu' });
  const sum = h.baza.prepare('SELECT SUM(kasanij) s FROM zapisi').get().s;
  h.zakryt();
  if (itog.otmecheno !== 2) return 'отмечено ' + itog.otmecheno + ', ожидалось 2 разных записи';
  if (Number(sum) !== 2) return 'сумма касаний ' + sum + ', ожидалось 2 — дедупликация съела не тот дубль';
});

// ═══ В3: отказ записи не ломает выдачу ═══
proba('В3 база только на чтение: метод НЕ бросает, называет отказ', () => {
  const put = svezhaya('v3'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  h.zakryt();
  chmodSync(put, 0o444);
  const ro = otkrytHranilishche(put);
  let itog;
  try {
    itog = ro.otmetitKasanie({ ids: [id], povod: 'vydacha-agentu' });
  } catch (e) {
    chmodSync(put, 0o644);
    return 'метод БРОСИЛ при недоступной записи (' + e.code + ') — выдача агенту была бы разрушена';
  } finally { try { ro.zakryt(); } catch { /* закрытие не предмет пробы */ } }
  chmodSync(put, 0o644);
  if (itog.otkaz === null) return 'запись в базу только для чтения прошла — проба меряет не то';
  if (itog.otkaz.code !== 'PAMYAT_KASANIE_NE_ZAPISANO') return 'код отказа ' + itog.otkaz.code;
  if (!itog.otkaz.pochemu) return 'отказ без причины: молчаливый отказ неотличим от «касаний не было»';
});

// ═══ В9: рубеж и сверка не трогаются ═══
proba('В9 касание НЕ меняет происхождение и сверку', () => {
  const put = svezhaya('v9'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  h.otmetitProverku({ id, ishod: 'est', chem: 'stend-kasanij' });
  const do_ = h.baza.prepare('SELECT proishozhdenie o, proverka v FROM zapisi WHERE id = ?').get(id);
  h.otmetitKasanie({ ids: [id], povod: 'vydacha-agentu' });
  const posle = h.baza.prepare('SELECT proishozhdenie o, proverka v FROM zapisi WHERE id = ?').get(id);
  const rubezhDo = h.rubezhProishozhdeniya();
  h.zakryt();
  if (JSON.stringify(do_) !== JSON.stringify(posle)) {
    return 'касание изменило поля происхождения/сверки: было ' + JSON.stringify(do_) + ', стало ' + JSON.stringify(posle);
  }
  if (rubezhDo === null || rubezhDo === undefined) return 'рубеж пропал после касания';
});

proba('В9 статус записи НИЖЕ рубежа после касания прежний', () => {
  const put = svezhaya('v9b'); bazaBezKasanij(put, 3);
  const h = otkrytHranilishche(put);
  const z = h.baza.prepare('SELECT * FROM zapisi ORDER BY id LIMIT 1').get();
  const do_ = h.statusProishozhdeniya(z);
  h.otmetitKasanie({ ids: [Number(z.id)], povod: 'vydacha-agentu' });
  const posle = h.statusProishozhdeniya(h.poId(Number(z.id)));
  h.zakryt();
  if (JSON.stringify(do_) !== JSON.stringify(posle)) {
    return 'статус происхождения изменился касанием: ' + JSON.stringify(do_) + ' → ' + JSON.stringify(posle);
  }
});

console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
