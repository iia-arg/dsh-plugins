// RU: Свидетель загрузки различает горячую загрузку, объявленный подъём и подъём мимо ворот; горячая загрузка не требует объявления старта. Слепота с причиной не считается обходом. Проверяем существующую запись вне окна, чтобы одно присутствие имени не означало объявление. Возраст процесса подаётся извне: передачу process.uptime() из apply этот стенд не доказывает.
// EN: The load witness distinguishes hot loading, declared startup, and startup outside the gate; hot loading requires no startup declaration. An unobservable result with a cause is not a bypass. Test an existing trace outside the time window so a name alone cannot prove declaration. Process age is supplied externally; this suite does not prove that apply forwards process.uptime().
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let svidetelZagruzki, POROG_SVEZHESTI_SEK, OKNO_OBYAVLENIYA_SEK, apply, Config;
try { ({ svidetelZagruzki, POROG_SVEZHESTI_SEK, OKNO_OBYAVLENIYA_SEK, apply, Config } = await import('../src/index.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error('тело ВЕРНУЛО «' + String(v).slice(0, 50) + '»');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 170)); }
};

const katalog = vremennyj(join(tmpdir(), 'svidetel-zagruzki-'));
const SLUZHBA = 'proba.service';
// RU: След обёртки: строка ДО со сдвигом в секундах от старта процесса.
// EN: Wrapper trace: a ДО row with an offset in seconds from process start.
const sled = (imya, sdvigSek, vozrastSek) => {
  const nachalo = Date.now() - vozrastSek * 1000 + sdvigSek * 1000;
  const t = new Date(nachalo).toISOString().replace('T', ' ').slice(0, 19);
  const put = join(katalog, imya);
  writeFileSync(put, t + ' UTC | ДО   | ' + SLUZHBA + ' | рука проба | MainPID 1 | прибор исход 0\n');
  return put;
};

console.log('СТЕНД СВИДЕТЕЛЯ ЗАГРУЗКИ');
console.log('  порог свежести ' + POROG_SVEZHESTI_SEK + ' с · окно объявления ' + OKNO_OBYAVLENIYA_SEK + ' с');

proba('1. старый процесс ⇒ ГОРЯЧАЯ, про объявление ни слова', () => {
  const s = svidetelZagruzki({ vozrastSek: 3600, sled: sled('a.txt', 0, 3600), sluzhba: SLUZHBA, chitat: () => '' });
  if (!s.includes('ГОРЯЧАЯ')) throw new Error('не названа горячей: ' + s.slice(0, 90));
  if (s.includes('МИМО ВОРОТ') || s.includes('ОБЪЯВЛЕН')) throw new Error('у горячей спрошено объявление: ' + s.slice(0, 90));
});

proba('2. свежий + запись В ОКНЕ ⇒ ОБЪЯВЛЕН', () => {
  const put = sled('b.txt', 0, 5);
  const s = svidetelZagruzki({ vozrastSek: 5, sled: put, sluzhba: SLUZHBA, chitat: (p) => readFileSync(p, 'utf8') });
  if (!s.includes('подъём ОБЪЯВЛЕН')) throw new Error(s.slice(0, 120));
});

proba('3. свежий + записи нет ⇒ ⚠️ МИМО ВОРОТ', () => {
  const put = join(katalog, 'pusto.txt'); writeFileSync(put, '');
  const s = svidetelZagruzki({ vozrastSek: 5, sled: put, sluzhba: SLUZHBA, chitat: (p) => readFileSync(p, 'utf8') });
  if (!s.includes('МИМО ВОРОТ')) throw new Error(s.slice(0, 120));
});

proba('4. ГЛАВНАЯ: запись ЕСТЬ, но вне окна ⇒ МИМО ВОРОТ (различает ВРЕМЯ, не имя)', () => {
  // RU: Фиксированный сдвиг 180 секунд должен быть вне окна 120. Выражение от размера окна осталось бы вне при любой порче и не проверило бы порог.
  // EN: A fixed 180-second offset must lie outside the 120-second window. An offset derived from window size would remain outside under any mutation and could not test the threshold.
  const put = sled('c.txt', -180, 5);
  const s = svidetelZagruzki({ vozrastSek: 5, sled: put, sluzhba: SLUZHBA, chitat: (p) => readFileSync(p, 'utf8') });
  if (s.includes('ОБЪЯВЛЕН')) throw new Error('старая запись зачтена как объявление: ' + s.slice(0, 110));
  if (!s.includes('МИМО ВОРОТ')) throw new Error(s.slice(0, 120));
});

proba('4б. ЗАЖИМ СНИЗУ: запись за 60 с ⇒ ОБЪЯВЛЕН (уменьшат окно — покраснеет)', () => {
  // RU: Два фиксированных сдвига зажимают окно 120 секунд: 60 внутри, 180 снаружи. Они отдельно ловят уменьшение и увеличение порога.
  // EN: Two fixed offsets bound the 120-second window: 60 inside, 180 outside. They separately detect a reduced or increased threshold.
  const put = sled('d.txt', -60, 5);
  const s = svidetelZagruzki({ vozrastSek: 5, sled: put, sluzhba: SLUZHBA, chitat: (p) => readFileSync(p, 'utf8') });
  if (!s.includes('подъём ОБЪЯВЛЕН')) throw new Error('запись за 60 с не зачтена при окне ' + OKNO_OBYAVLENIYA_SEK + ': ' + s.slice(0, 110));
});

proba('5. след НЕ ЗАДАН ⇒ слепота с причиной, НЕ обход', () => {
  const s = svidetelZagruzki({ vozrastSek: 5, sled: null, sluzhba: SLUZHBA, chitat: () => '' });
  if (!s.includes('НЕ ПРОВЕРЕНО')) throw new Error(s.slice(0, 120));
  if (s.includes('МИМО ВОРОТ')) throw new Error('слепота выдана за обход: ' + s.slice(0, 110));
});

proba('6. след НЕ ЧИТАЕТСЯ ⇒ слепота с причиной, НЕ обход', () => {
  const s = svidetelZagruzki({
    vozrastSek: 5, sled: '/net/takogo/puti', sluzhba: SLUZHBA,
    chitat: () => { throw new Error('ENOENT'); },
  });
  if (!s.includes('НЕ ПРОВЕРЕНО')) throw new Error(s.slice(0, 120));
  if (s.includes('МИМО ВОРОТ')) throw new Error('слепота выдана за обход: ' + s.slice(0, 110));
});

proba('7. возраст НЕ ИЗМЕРЕН ⇒ род не установлен, а не «горячая»', () => {
  const s = svidetelZagruzki({ vozrastSek: undefined, sled: null, sluzhba: SLUZHBA, chitat: () => '' });
  if (!s.includes('РОД НЕ УСТАНОВЛЕН')) throw new Error(s.slice(0, 120));
  if (s.includes('ГОРЯЧАЯ')) throw new Error('неизмеренное названо горячей: ' + s.slice(0, 110));
});

// RU: Засчитываем только строки «время | ДО/ПОСЛЕ | <точное имя службы> | …» формата podyom-uzla; строки ОТКАЗ не объявляют подъём.
// EN: Count only podyom-uzla rows shaped “time | ДО/ПОСЛЕ | <exact service name> | …”; ОТКАЗ rows do not declare startup.
const zhurnal = (imya, vozrastSek, stroki) => {
  const put = join(katalog, imya);
  writeFileSync(put, stroki.map(([sdvig, vid, pole3]) => {
    const t = new Date(Date.now() - vozrastSek * 1000 + sdvig * 1000).toISOString().replace('T', ' ').slice(0, 19);
    return vid === 'ОТКАЗ'
      ? t + ' UTC | ОТКАЗ| служба ' + pole3 + ' | рука проба | код 1 | ход агента ИДЁТ'
      : t + ' UTC | ' + vid.padEnd(5) + '| ' + pole3 + ' | рука проба | MainPID 1 | прибор исход 0';
  }).join('\n') + '\n');
  return put;
};
const svid = (put, sluzhba = SLUZHBA) =>
  svidetelZagruzki({ vozrastSek: 5, sled: put, sluzhba, chitat: (p) => readFileSync(p, 'utf8') });

proba('9. ГЛАВНАЯ activation-policy: ОТКАЗ в окне, ДО нет ⇒ МИМО ВОРОТ (отказ — не объявление)', () => {
  const s = svid(zhurnal('otkaz.txt', 5, [[0, 'ОТКАЗ', SLUZHBA]]));
  if (s.includes('ОБЪЯВЛЕН')) throw new Error('строка ОТКАЗ зачтена объявлением: ' + s.slice(0, 110));
  if (!s.includes('МИМО ВОРОТ')) throw new Error(s.slice(0, 120));
});

proba('10. ОТКАЗ + ДО в окне ⇒ ОБЪЯВЛЕН (отказ не глушит настоящую запись)', () => {
  const s = svid(zhurnal('otkaz-do.txt', 5, [[-30, 'ОТКАЗ', SLUZHBA], [0, 'ДО', SLUZHBA]]));
  if (!s.includes('подъём ОБЪЯВЛЕН')) throw new Error(s.slice(0, 120));
});

proba('11. ПОСЛЕ в окне ⇒ ОБЪЯВЛЕН (вид ПОСЛЕ тоже законен)', () => {
  const s = svid(zhurnal('posle.txt', 5, [[1, 'ПОСЛЕ', SLUZHBA]]));
  if (!s.includes('подъём ОБЪЯВЛЕН')) throw new Error(s.slice(0, 120));
});

proba('12. ДО ДРУГОЙ службы, содержащей имя подстрокой (x-' + SLUZHBA + ') ⇒ МИМО ВОРОТ', () => {
  const s = svid(zhurnal('chuzhaya.txt', 5, [[0, 'ДО', 'x-' + SLUZHBA]]));
  if (s.includes('ОБЪЯВЛЕН')) throw new Error('чужая служба зачтена по подстроке: ' + s.slice(0, 110));
});

proba('13. имя службы ПУСТОЕ (agent не задан) + чужое ДО в окне ⇒ НЕ ПРОВЕРЕНО: имя службы не задано', () => {
  // RU: Пустое имя не сверяется: includes('') совпадает с любой строкой. Это слепота с причиной, а не доказанный обход ворот.
  // EN: An empty name cannot be compared: includes('') matches any row. This is an unobservable result with a cause, not a proven gate bypass.
  const s = svid(zhurnal('pustoe-imya.txt', 5, [[0, 'ДО', 'drugaya.service']]), '');
  if (s.includes('ОБЪЯВЛЕН')) throw new Error('пустое имя совпало с чужой строкой: ' + s.slice(0, 110));
  if (s.includes('МИМО ВОРОТ')) throw new Error('слепота выдана за обход: ' + s.slice(0, 110));
  if (!s.includes('НЕ ПРОВЕРЕНО: имя службы не задано')) throw new Error(s.slice(0, 120));
});

proba('14. ВИД строки, а не только поле: «ОТКАЗ | <служба ровно>» (другой формат отказа) ⇒ НЕ ОБЪЯВЛЕН', () => {
  // RU: Проверяем вид ДО/ПОСЛЕ отдельно от поля службы: даже ОТКАЗ с точным именем не должен стать объявлением.
  // EN: Check ДО/ПОСЛЕ independently of the service field: even an ОТКАЗ row with the exact name must not count as a declaration.
  const put = join(katalog, 'otkaz-drugoj-format.txt');
  const t = new Date(Date.now() - 5000).toISOString().replace('T', ' ').slice(0, 19);
  writeFileSync(put, t + ' UTC | ОТКАЗ | ' + SLUZHBA + ' | рука проба | код 1\n');
  const s = svid(put);
  if (s.includes('ОБЪЯВЛЕН')) throw new Error('ОТКАЗ с именем в поле 3 зачтён: ' + s.slice(0, 110));
});

proba('8. БОЕВОЙ ПУТЬ: apply печатает строку свидетеля', () => {
  const stroki = [];
  const bylo = console.error;
  const ctx = { logger: null, provide() {}, get() { return undefined }, on() {} };
  console.error = (...a) => stroki.push(a.join(' '));
  try { apply(ctx, new Config({ putBazy: join(katalog, 'boj.db'), agent: 'proba' })); }
  finally { console.error = bylo; }
  const est = stroki.some((s) => s.includes('загрузка:') || s.includes('подъём СЛУЖБЫ'));
  if (!est) throw new Error('строки свидетеля НЕТ — вызов не состоялся; строк всего ' + stroki.length);
});

console.log('ИТОГ: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
