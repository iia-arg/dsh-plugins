// RU: Проверяем формулу веры и события оценки. Решения применять/проверять/пропустить и согласование порогов с формулой проверяются в слое восстановления. Успех не доказывает наличие живых вызовов оценки: это обязанность потребителя.
// EN: Test the confidence formula and rating events. Apply/check/skip decisions and threshold agreement with the formula are tested in the restore layer. Success does not prove that live rating calls exist; that is the consumer’s responsibility.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let otkrytHranilishche, veraPoOcenkam, VES_OCENKI, OCENKI_DOPUSTIMYE;
try {
  ;({ otkrytHranilishche, veraPoOcenkam, VES_OCENKI, OCENKI_DOPUSTIMYE } = await import('../src/hranilishche.js'))
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
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};
const dolzhnoUpast = (kod, f) => {
  try { f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code + ' (' + String(e.message).slice(0, 80) + ')');
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = vremennyj(join(tmpdir(), 'pamyat-vera-'));
const svezhaya = (imya) => join(katalog, imya + '.db');
const nadpisi = (h, skolko = 1) => {
  const ids = [];
  for (let i = 0; i < skolko; i++) ids.push(h.zapisat({ agent: 'stend', klass: 'urok', soderzhim: 'знание ' + i }));
  return ids;
};

console.log('ФОРМУЛА (чистая функция, без базы)');

proba('нет оценок — вера ПУСТА, а не ноль', () => {
  if (veraPoOcenkam([]) !== null) return 'пустой список дал ' + veraPoOcenkam([]) + ', а должен null';
  if (veraPoOcenkam(null) !== null) return 'отсутствие списка дало не null';
});

proba('одна оценка «навредило» опускает веру ниже 0.7 (порог применения выдачи)', () => {
  const v = veraPoOcenkam([{ ishod: 'harmful' }]);
  if (!(v < 0.7)) return 'вера после одного harmful = ' + v + ', порог применения не пройден вниз';
});

proba('две оценки «навредило» опускают веру ниже 0.3 (порог отбрасывания)', () => {
  const v = veraPoOcenkam([{ ishod: 'harmful' }, { ishod: 'harmful' }]);
  if (!(v < 0.3)) return 'вера после двух harmful = ' + v + ', ниже 0.3 не ушла';
});

proba('«помогло» держит веру на потолке, а не выше него', () => {
  const v = veraPoOcenkam(Array.from({ length: 5 }, () => ({ ishod: 'helped' })));
  if (v !== 1) return 'пять helped дали ' + v + ', а потолок 1';
});

proba('незнакомый исход НЕ проходит нулевым весом — веры по такому списку нет', () => {
  const v = veraPoOcenkam([{ ishod: 'helped' }, { ishod: 'ponravilos' }]);
  if (v !== null) return 'список с чужим исходом дал ' + v + ', а должен null (иначе порча отметки неотличима от её отсутствия)';
});

proba('вес объявлен экспортом, а не спрятан (его читает проба чужого пакета)', () => {
  if (typeof VES_OCENKI?.baza !== 'number' || typeof VES_OCENKI?.harmful !== 'number') return 'веса не вывезены наружу';
  if (Object.isFrozen(VES_OCENKI) !== true) return 'веса не заморожены — чужой пакет сможет их подменить в памяти';
  if (!Array.isArray(OCENKI_DOPUSTIMYE) || OCENKI_DOPUSTIMYE.length !== 3) return 'словарь исходов не вывезен';
});

console.log('ЗАПИСЬ СОБЫТИЙ');

proba('до первой оценки — «не измеряли», а не «ноль»', () => {
  const h = otkrytHranilishche(svezhaya('chisto'));
  const [id] = nadpisi(h);
  const st = h.statusVery(h.poId(id));
  const vera = h.poId(id).vera;
  h.zakryt();
  if (st.status !== 'ne-ocenivalos') return 'статус ' + st.status;
  if (vera !== null) return 'вера ' + vera + ', а должна быть пуста';
});

proba('оценка пишет СОБЫТИЕ с именем оценившего и временем, а не только число', () => {
  const h = otkrytHranilishche(svezhaya('sobytie'));
  const [id] = nadpisi(h);
  h.otsenit({ id, ishod: 'harmful', kem: 'ocenshchik-a', pochemu: 'увело не туда', kogda: 1700000000000 });
  const spisok = JSON.parse(h.poId(id).ocenki);
  h.zakryt();
  if (spisok.length !== 1) return 'событий ' + spisok.length;
  const s = spisok[0];
  if (s.kem !== 'ocenshchik-a') return 'имя оценившего не сохранено';
  if (s.kogda !== 1700000000000) return 'время не сохранено';
  if (s.pochemu !== 'увело не туда') return 'причина не сохранена';
});

proba('вторая оценка ДОПИСЫВАЕТСЯ, а не заменяет первую', () => {
  const h = otkrytHranilishche(svezhaya('dopis'));
  const [id] = nadpisi(h);
  h.otsenit({ id, ishod: 'helped', kem: 'a' });
  const r = h.otsenit({ id, ishod: 'harmful', kem: 'b' });
  const spisok = JSON.parse(h.poId(id).ocenki);
  h.zakryt();
  if (r.ocenok !== 2 || spisok.length !== 2) return 'событий ' + spisok.length;
  if (spisok[0].kem !== 'a' || spisok[1].kem !== 'b') return 'порядок событий потерян';
});

proba('вера в базе пересчитана по событиям, а не прибавлена вслепую', () => {
  const h = otkrytHranilishche(svezhaya('perescht'));
  const [id] = nadpisi(h);
  h.otsenit({ id, ishod: 'harmful', kem: 'ocenshchik-a' });
  const iz_bazy = h.poId(id).vera;
  const po_formule = veraPoOcenkam([{ ishod: 'harmful' }]);
  h.zakryt();
  if (iz_bazy !== po_formule) return 'в базе ' + iz_bazy + ', по формуле ' + po_formule;
});

proba('оценка одной записи НЕ задевает соседние', () => {
  const h = otkrytHranilishche(svezhaya('sosedi'));
  const ids = nadpisi(h, 3);
  h.otsenit({ id: ids[1], ishod: 'harmful', kem: 'ocenshchik-a' });
  const chuzhie = [ids[0], ids[2]].map((i) => h.poId(i)).filter((z) => z.vera !== null || z.ocenki !== null);
  h.zakryt();
  if (chuzhie.length) return 'задето соседних записей: ' + chuzhie.length;
});

proba('оценка НЕ трогает происхождение, сверку и касания (ворота В9)', () => {
  const h = otkrytHranilishche(svezhaya('vorota'));
  const [id] = nadpisi(h);
  h.otmetitProverku({ id, ishod: 'est', chem: 'stend' });
  h.otmetitKasanie({ ids: [id], povod: 'vydacha-agentu' });
  const do_ = h.poId(id);
  h.otsenit({ id, ishod: 'harmful', kem: 'ocenshchik-a' });
  const posle = h.poId(id);
  h.zakryt();
  for (const pole of ['proishozhdenie', 'proverka', 'kasanij', 'poslednee_kasanie', 'soderzhim', 'klass']) {
    if (String(do_[pole]) !== String(posle[pole])) return 'поле ' + pole + ' изменилось: ' + do_[pole] + ' → ' + posle[pole];
  }
});

console.log('ОТКАЗЫ');

proba('чужой исход — отказ со словарём в тексте', () => {
  const h = otkrytHranilishche(svezhaya('chuzhoj'));
  const [id] = nadpisi(h);
  const e = dolzhnoUpast('PAMYAT_OCENKA_NE_TOT_ISHOD', () => h.otsenit({ id, ishod: 'ponravilos', kem: 'ocenshchik-a' }));
  h.zakryt();
  if (!/helped/.test(e.message)) return 'отказ не называет допустимые исходы';
});

proba('оценка без имени оценившего — отказ, а не умолчание', () => {
  const h = otkrytHranilishche(svezhaya('bezimeni'));
  const [id] = nadpisi(h);
  dolzhnoUpast('PAMYAT_OCENKA_BEZ_OCENIVAYUSHCHEGO', () => h.otsenit({ id, ishod: 'helped', kem: '   ' }));
  h.zakryt();
});

proba('оценка несуществующей записи — отказ, а не тихое ничего', () => {
  const h = otkrytHranilishche(svezhaya('netzapisi'));
  nadpisi(h);
  dolzhnoUpast('PAMYAT_OCENKA_ZAPIS_NE_NAJDENA', () => h.otsenit({ id: 999999, ishod: 'helped', kem: 'ocenshchik-a' }));
  h.zakryt();
});

proba('негодный список НЕ затирается: отказ, и прежнее содержимое поля цело', () => {
  const h = otkrytHranilishche(svezhaya('negodnyj'));
  const [id] = nadpisi(h);
  h.baza.prepare('UPDATE zapisi SET ocenki = ? WHERE id = ?').run('не json вовсе', id);
  dolzhnoUpast('PAMYAT_OCENKA_SPISOK_NEGODEN', () => h.otsenit({ id, ishod: 'helped', kem: 'ocenshchik-a' }));
  const posle = h.poId(id).ocenki;
  const st = h.statusVery(h.poId(id));
  h.zakryt();
  if (posle !== 'не json вовсе') return 'негодная отметка переписана: теперь ' + JSON.stringify(posle);
  if (st.status !== 'otmetka-negodna') return 'статус ' + st.status + ', а негодная отметка обязана называться';
});

console.log('МИГРАЦИЯ');

proba('на базе без столбца оценок он появляется, старым записям ничего не приписано', () => {
  const put = svezhaya('migraciya');
  const h1 = otkrytHranilishche(put);
  nadpisi(h1, 4);
  h1.baza.exec('ALTER TABLE zapisi DROP COLUMN ocenki');
  h1.zakryt();
  const h2 = otkrytHranilishche(put);
  const stolbcy = h2.baza.prepare('PRAGMA table_info(zapisi)').all().map((r) => r.name);
  const n = h2.baza.prepare('SELECT COUNT(*) n, SUM(ocenki IS NULL) nul FROM zapisi').get();
  h2.zakryt();
  if (!stolbcy.includes('ocenki')) return 'столбец не добавлен';
  if (Number(n.n) !== 4) return 'записей стало ' + n.n + ' вместо 4 — миграция тронула данные';
  if (Number(n.nul) !== 4) return 'кому-то приписан пустой список: не NULL у ' + (n.n - n.nul);
});

proba('повторное открытие ничего не делает второй раз (идемпотентность)', () => {
  const put = svezhaya('idem');
  const h1 = otkrytHranilishche(put); nadpisi(h1, 2); const [id] = nadpisi(h1);
  h1.otsenit({ id, ishod: 'helped', kem: 'ocenshchik-a' }); h1.zakryt();
  const h2 = otkrytHranilishche(put);
  const st = h2.statusVery(h2.poId(id));
  const stolbcov = h2.baza.prepare('PRAGMA table_info(zapisi)').all().length;
  h2.zakryt();
  const h3 = otkrytHranilishche(put);
  const stolbcov3 = h3.baza.prepare('PRAGMA table_info(zapisi)').all().length;
  h3.zakryt();
  if (st.status !== 'ocenivalos') return 'оценка не пережила переоткрытие';
  if (stolbcov !== stolbcov3) return 'столбцов ' + stolbcov + ' → ' + stolbcov3;
});

console.log(`\nИТОГО: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
