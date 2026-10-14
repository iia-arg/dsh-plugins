// RU: Проверяем счётчик касаний. Миграция и идемпотентность используют разные базы: вставки первой не должны менять счёт второй. Отвергаем чужой повод; честность всех вызывающих и факт касания при выдаче проверяются у потребителя.
// EN: Test the touch counter. Migration and idempotency use separate databases so inserts in one do not change the other’s count. Reject invalid reasons; caller honesty and touches on delivery are tested in the consumer.
import { mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

let vsego = 0, proshlo = 0, slepyh = 0;
// RU: A-N-1948 №3 (№9): проба, чьё условие на этой машине не выполнимо, объявляет СЛЕПОТУ (код 2 стенда), а не красное и не зелёное.
// EN: A-N-1948 №3 (№9): a probe whose precondition cannot hold here declares BLINDNESS (stand exit 2), neither red nor green.
const slepaya = (pochemu) => Object.assign(new Error(pochemu), { slepota: true });
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
  } catch (e) {
    if (e?.slepota) { slepyh++; console.log('  ⚠️  СЛЕПОТА ' + imya + ' — ' + String(e.message).slice(0, 160)); return; }
    console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 160));
  }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code + ' (' + String(e.message).slice(0, 80) + ')');
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = vremennyj(join(tmpdir(), 'pamyat-kasaniya-'));
const svezhaya = (imya) => join(katalog, imya + '.db');

// RU: База до миграции касаний: записи есть, полей касаний нет.
// EN: Database before touch migration: records exist, touch fields do not.
function bazaBezKasanij(put, skolko) {
  const h = otkrytHranilishche(put);
  for (let i = 0; i < skolko; i++) {
    h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'запись ' + i, istochnik: 'session#' + i });
  }
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN kasanij');
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN poslednee_kasanie');
  h.baza.exec('ALTER TABLE zapisi DROP COLUMN poslednyaya_vydacha');   /* RU: Поле выдачи добавляется той же миграцией.
 * EN: The same migration adds the delivery field.
 */
  h.zakryt();
}

console.log('СТЕНД СЧЁТЧИКА КАСАНИЙ');

// RU: Проверяем миграцию.
// EN: Test migration.
proba('В1 миграция добавила ВСЕ поля касаний (kasanij, poslednee_kasanie, poslednyaya_vydacha)', () => {
  const put = svezhaya('v1'); bazaBezKasanij(put, 5);
  const h = otkrytHranilishche(put);
  const stolbcy = h.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  const net = ['kasanij', 'poslednee_kasanie', 'poslednyaya_vydacha'].filter((k) => !stolbcy.includes(k));
  h.zakryt();
  if (net.length) return 'после миграции нет полей: ' + net.join(', ');
});

proba('В1 старые записи: касаний 0, последнее касание NULL', () => {
  const put = svezhaya('v1b'); bazaBezKasanij(put, 4);
  const h = otkrytHranilishche(put);
  const r = h.baza.prepare('SELECT COUNT(*) n, SUM(kasanij) s, SUM(poslednee_kasanie IS NULL) nul, SUM(poslednyaya_vydacha IS NULL) vnul FROM zapisi').get();
  h.zakryt();
  if (Number(r.n) !== 4) return 'записей стало ' + r.n + ', а было 4 — миграция тронула данные';
  if (Number(r.s) !== 0) return 'сумма касаний ' + r.s + ', ожидалось 0';
  if (Number(r.nul) !== 4) return 'poslednee_kasanie не NULL у ' + (4 - Number(r.nul)) + ' записей';
  if (Number(r.vnul) !== 4) return 'poslednyaya_vydacha не NULL у ' + (4 - Number(r.vnul)) + ' записей — выданными до миграции их считать нельзя';
});

proba('В1 повторное открытие НЕ обнуляет накопленное (идемпотентность)', () => {
  const put = svezhaya('v1c'); bazaBezKasanij(put, 3);
  const h1 = otkrytHranilishche(put);
  const ids = h1.baza.prepare('SELECT id FROM zapisi ORDER BY id').all().map((r) => Number(r.id));
  h1.otmetitKasanie({ ids, povod: 'vydacha-agentu' });
  h1.otmetitKasanie({ ids: [ids[0]], povod: 'vydacha-agentu' });
  const do_ = h1.baza.prepare('SELECT SUM(kasanij) s FROM zapisi').get().s;
  const vdo = h1.baza.prepare('SELECT SUM(poslednyaya_vydacha IS NOT NULL) v FROM zapisi').get().v;
  h1.zakryt();
  const h2 = otkrytHranilishche(put);   /* RU: Повторяем миграцию на той же базе.
 * EN: Repeat migration on the same database.
 */
  const posle = h2.baza.prepare('SELECT SUM(kasanij) s FROM zapisi').get().s;
  const vposle = h2.baza.prepare('SELECT SUM(poslednyaya_vydacha IS NOT NULL) v FROM zapisi').get().v;
  h2.zakryt();
  if (Number(vdo) !== 3 || Number(vposle) !== 3) return 'момент выдачи: до повторной миграции у ' + vdo + ', после у ' + vposle + ' записей, ожидалось 3 и 3';
  if (Number(do_) !== 4) return 'до повторного открытия сумма касаний ' + do_ + ', ожидалось 4';
  if (Number(posle) !== Number(do_)) return 'повторная миграция изменила касания: было ' + do_ + ', стало ' + posle;
});

// RU: Проверяем определение касания.
// EN: Test what counts as a touch.
proba('В2 касание с поводом «выдача агенту» растит счётчик и ставит время', () => {
  const put = svezhaya('v2'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  const kogda = 1757000000000;
  const itog = h.otmetitKasanie({ ids: [id], povod: 'vydacha-agentu', kogda });
  const r = h.baza.prepare('SELECT kasanij k, poslednee_kasanie p, poslednyaya_vydacha v FROM zapisi WHERE id = ?').get(id);
  h.zakryt();
  if (itog.otmecheno !== 1) return 'отмечено ' + itog.otmecheno + ', ожидалась 1';
  if (Number(r.k) !== 1) return 'касаний ' + r.k + ', ожидалось 1';
  if (Number(r.p) !== kogda) return 'время касания ' + r.p + ', ожидалось ' + kogda;
  if (Number(r.v) !== kogda) return 'момент выдачи ' + r.v + ', ожидалось ' + kogda + ' (touch-policy: выдача пишет poslednyaya_vydacha)';
});

// RU: Законный повод povtor-sudom принимается самим ядром: секретарь признал статью повтором записи. Проверка не ограничивается стендом потребителя.
// EN: The core itself accepts the valid povtor-sudom reason: the secretary judged an article to repeat a record. The check is not confined to the consumer’s suite.
proba('В2а касание с поводом «povtor-sudom» (repeat-policy) растит счётчик и ставит время', () => {
  const put = svezhaya('v2p'); const h = otkrytHranilishche(put);
  const id = h.zapisat({ agent: 'stend', klass: 'zametka', soderzhim: 'предмет' });
  const kogda = 1757000000123;
  const itog = h.otmetitKasanie({ ids: [id], povod: 'povtor-sudom', kogda });
  const r = h.baza.prepare('SELECT kasanij k, poslednee_kasanie p, poslednyaya_vydacha v FROM zapisi WHERE id = ?').get(id);
  h.zakryt();
  if (itog.otmecheno !== 1) return 'отмечено ' + itog.otmecheno + ', ожидалась 1';
  if (Number(r.k) !== 1) return 'касаний ' + r.k + ', ожидалось 1';
  if (Number(r.p) !== kogda) return 'время касания ' + r.p + ', ожидалось ' + kogda;
  // RU: Повтор судом не считается выдачей: иначе use можно засчитать без повторной выдачи.
  // EN: A judged repeat is not a delivery; otherwise use could be counted without another delivery.
  if (r.v !== null) return 'повтор судом записал момент выдачи ' + r.v + ' — должен оставить NULL';
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
  // RU: Компактная сводка может дублировать выбранную запись: список содержит дубль, ход остаётся один.
  // EN: A compact summary can duplicate a selected record: the list contains a duplicate, but there is still one turn.
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

// RU: Отказ записи касания не должен ломать выдачу.
// EN: A failed touch write must not break delivery.
proba('В3 база только на чтение: метод НЕ бросает, называет отказ', () => {
  // RU: Под root chmod 0444 запись не запрещает — отказа не будет, и проба мерила бы не то. EN: under root chmod 0444 does not forbid writing.
  if (process.getuid?.() === 0) throw slepaya('под root chmod 0444 не запрещает запись — отказ записи этой пробой не вызвать; гоняйте от обычной учётки');
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
  } finally { try { ro.zakryt(); } catch { /* RU: Закрытие базы не является предметом этой пробы.
 * EN: Database closing is outside this probe’s subject.
 */ } }
  chmodSync(put, 0o644);
  if (itog.otkaz === null) return 'запись в базу только для чтения прошла — проба меряет не то';
  if (itog.otkaz.code !== 'PAMYAT_KASANIE_NE_ZAPISANO') return 'код отказа ' + itog.otkaz.code;
  if (!itog.otkaz.pochemu) return 'отказ без причины: молчаливый отказ неотличим от «касаний не было»';
});

// RU: Рубеж и сверка остаются неизменными.
// EN: The provenance boundary and verification remain unchanged.
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

console.log(`итог: ${proshlo} из ${vsego}` + (slepyh ? `, слепых ${slepyh}` : ''));
process.exit(proshlo === vsego ? 0 : (proshlo + slepyh === vsego ? 2 : 1));
