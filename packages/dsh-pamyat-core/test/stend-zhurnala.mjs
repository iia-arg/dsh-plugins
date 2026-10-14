// RU: Журнал различает отсутствие предложений, отказ человека и поломку установки, объясняя пустую память.
// EN: The journal distinguishes no proposals, human refusal, and installation failure to explain empty memory.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let zagruzitDrajver, zavestiZhurnal
try {
  ;({ zagruzitDrajver } = await import('../src/hranilishche.js'))
  ;({ zavestiZhurnal } = await import('../src/zhurnal.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    // RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
    // EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const katalog = vremennyj(join(tmpdir(), 'pamyat-zh-'));
const { DatabaseSync } = zagruzitDrajver();
const baza = new DatabaseSync(join(katalog, 'zh.db'));
// RU: Сводка читает знания напрямую, а не выводит их наличие из событий журнала.
// EN: The summary reads knowledge directly rather than inferring its existence from journal events.
baza.exec('CREATE TABLE zapisi (agent TEXT NOT NULL)');
baza.exec('CREATE TABLE nastrojki (kluch TEXT PRIMARY KEY, znachenie TEXT NOT NULL, postavleno INTEGER NOT NULL)');

proba('стенд годен: отметка пишется и читается', () => {
  const zh = zavestiZhurnal(baza);
  const id = zh.otmetit({ agent: 'stend', klass: 'zametka', ishod: 'zapisano', pochemu: 'класс автоматический', istochnik: 'session#7' });
  if (!(id > 0)) throw new Error('нет id');
  const p = zh.poslednie({ agent: 'stend' });
  if (p.length !== 1 || p[0].istochnik !== 'session#7') throw new Error('прочиталось не то');
});

proba('ПОРЧА: журнал без базы → отказ', () => {
  try { zavestiZhurnal(null); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_ZHURNAL_BEZ_BAZY') throw new Error('не тот код: ' + e.code); }
});

proba('ПОРЧА: неполная отметка отвергается', () => {
  const zh = zavestiZhurnal(baza);
  try { zh.otmetit({ agent: 'stend', klass: 'x', ishod: 'zapisano' }); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_NEPOLNAYA_OTMETKA') throw new Error('не тот код: ' + e.code); }
});

proba('ГЛАВНОЕ: сводка считает природы отказа РАЗДЕЛЬНО', () => {
  const zh = zavestiZhurnal(baza);
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'otkazano', pochemu: 'человек не разрешил' });
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'net-kanala', pochemu: 'канал отсутствует' });
  zh.otmetit({ agent: 'a2', klass: 'navyk', ishod: 'otkloneno', priroda: 'net-kanala', pochemu: 'канал отсутствует' });
  const s = zh.svodka('a2');
  if (s.otkloneno !== 3) throw new Error('отклонено ' + s.otkloneno);
  if (s.poPrirode['net-kanala'] !== 2) throw new Error('поломок ' + s.poPrirode['net-kanala']);
  if (s.poPrirode['otkazano'] !== 1) throw new Error('решений человека ' + s.poPrirode['otkazano']);
});

// RU: A-N-1948 №3 (№25): одна природа под разными исходами складывается, а не заменяется поздней группой.
// EN: A-N-1948 №3 (№25): one nature under different outcomes is summed, not replaced by the later group.
proba('СУММА: одна природа в двух исходах → poPrirode = сумма', () => {
  const zh = zavestiZhurnal(baza);
  zh.otmetit({ agent: 'a25', klass: 'urok', ishod: 'otkloneno', priroda: 'odna-priroda', pochemu: 'первый исход' });
  zh.otmetit({ agent: 'a25', klass: 'urok', ishod: 'ne-udalos-proverit', priroda: 'odna-priroda', pochemu: 'второй исход' });
  const s = zh.svodka('a25');
  if (s.otkloneno !== 2) throw new Error('отклонено ' + s.otkloneno);
  if (s.poPrirode['odna-priroda'] !== 2) throw new Error('по природе ' + s.poPrirode['odna-priroda'] + ', ждали 2');
});

proba('РАЗЛИЧЕНИЕ: пустой журнал агента ≠ отказ, но и не «всё записано»', () => {
  const zh = zavestiZhurnal(baza);
  const s = zh.svodka('nikogo');
  if (s.zapisano !== 0 || s.otkloneno !== 0) throw new Error('ожидались нули');
  if (Object.keys(s.poPrirode).length !== 0) throw new Error('лишние природы');
});

baza.close();
rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
