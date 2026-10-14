
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
// RU: Политика должна различать отказ человека и отсутствие канала по исходу и объяснению; поломка установки не должна выглядеть человеческим решением.
// EN: Policy must distinguish human refusal from a missing channel by outcome and explanation; an installation failure must not look like a human decision.
let reshitPoKlassu, istolkovatPodtverzhdenie, KLASSY_SPRASHIVAT
try {
  ;({ reshitPoKlassu, istolkovatPodtverzhdenie, KLASSY_SPRASHIVAT } = await import('../src/politika.js'))
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

proba('стенд годен: обычный класс пишется сам', () => {
  const r = reshitPoKlassu('zametka');
  if (r.reshenie !== 'auto') throw new Error('ожидалось auto, получено ' + r.reshenie);
  if (!r.pochemu) throw new Error('решение без объяснения');
});

proba('общефермовые классы требуют подтверждения', () => {
  for (const k of KLASSY_SPRASHIVAT) {
    const r = reshitPoKlassu(k);
    if (r.reshenie !== 'ask') throw new Error('класс ' + k + ' должен быть ask, а он ' + r.reshenie);
  }
});

proba('настройка перекрывает умолчание', () => {
  const r = reshitPoKlassu('zametka', { sprashivat: ['zametka'] });
  if (r.reshenie !== 'ask') throw new Error('настройка не подействовала');
});

proba('ПОРЧА: класс не задан → отказ, а не молчаливое auto', () => {
  try { reshitPoKlassu(''); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'PAMYAT_NET_KLASSA') throw new Error('не тот код: ' + e.code); }
});

proba('ПОРЧА: пустой список классов НЕ отключает спрашивание', () => {
  const r = reshitPoKlassu('ogranichenie', { sprashivat: [] });
  if (r.reshenie !== 'ask') throw new Error('пустой список ослабил защиту: получено ' + r.reshenie);
});

proba('ЛИТЕРАЛЫ ЯДРА: каждый исход даёт СВОЮ природу', () => {
  const ozhidaem = {
    'rejected': 'otkazano-chelovekom',
    'cancelled': 'otmeneno',
    'unavailable': 'net-kanala',
    'not-supported': 'net-sluzhby',
    'no-agent': 'net-agenta',
  };
  for (const [ishod, priroda] of Object.entries(ozhidaem)) {
    const r = istolkovatPodtverzhdenie(ishod, true);
    if (r.zapisyvat !== false) throw new Error(ishod + ' не должен разрешать запись');
    if (r.priroda !== priroda) throw new Error(ishod + ' дал природу ' + r.priroda + ', ожидалась ' + priroda);
  }
});

proba('ГЛАВНОЕ: поломка НЕ записывается как решение человека', () => {
  const polomki = ['unavailable', 'not-supported', 'no-agent'];
  for (const p of polomki) {
    const r = istolkovatPodtverzhdenie(p, true);
    if (r.priroda === 'otkazano-chelovekom') throw new Error(p + ' присвоен человеку — схлопывание вернулось');
    if (/человек не разрешил/.test(r.pochemu)) throw new Error(p + ': текст приписывает решение человеку');
  }
  const chelovek = istolkovatPodtverzhdenie('rejected', true);
  if (chelovek.priroda !== 'otkazano-chelovekom') throw new Error('решение человека потеряно');
});

proba('«прервано» — это НЕ отказ: текст зовёт спросить снова', () => {
  const r = istolkovatPodtverzhdenie('cancelled', true);
  if (!/спросите снова/.test(r.pochemu)) throw new Error('cancelled подан как окончательный отказ');
});

proba('ПОРЧА: неизвестный исход → отказ с кодом, а НЕ «человек»', () => {
  try {
    const r = istolkovatPodtverzhdenie('denied', true);
    throw new Error('не упало, а вернуло природу ' + r.priroda + ' — выдуманный литерал принят за настоящий');
  } catch (e) {
    if (e.code !== 'PAMYAT_NEIZVESTNYJ_ISHOD') throw new Error('не тот код: ' + e.code);
    if (/человек/.test(e.message.replace('приписывать его человеку тоже нельзя',''))) {
      throw new Error('сообщение всё же валит на человека');
    }
  }
});

proba('ПОРЧА: канала нет вовсе → природа поломки, не решение', () => {
  const r = istolkovatPodtverzhdenie(null, false);
  if (r.priroda !== 'net-kanala') throw new Error('природа ' + r.priroda);
});

proba('разрешение работает', () => {
  const r = istolkovatPodtverzhdenie('allowed-once', true);
  if (r.zapisyvat !== true) throw new Error('разрешение не сработало');
});

// RU: Парно проверяем zapishet на собранном ядре с временной базой, а не на копиях метода. reshit отвечает о политике: ask одинаков на узлах с отвечающим и без него, хотя без отвечающего запись проходит с пометкой. Здесь проверяем решение о возможности записи; запись в рабочую память проверяется отдельно.
// EN: Test zapishet in pairs on the assembled core with a temporary database, not on copied methods. reshit answers a policy question: ask is identical with or without a confirmer, although without one the record passes with a mark. This tests the write-eligibility decision; actual working-memory writes are tested separately.
const { apply } = await import('../src/index.js');
const { mkdtempSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');
const katalogSluzhebnyj = vremennyj(join(tmpdir(), 'politika-'));
let schyotBaz = 0;
const sobratYadro = (cfg) => {
  const servisy = {};
  const ctx = { provide(imya, obj) { servisy[imya] = obj; }, on() {}, logger: { error() {} } };
  apply(ctx, { putBazy: join(katalogSluzhebnyj, `b${schyotBaz++}.db`), agent: 'stend', ...cfg });
  if (!servisy.pamyat) throw new Error('стенд негоден: сервис pamyat не объявлен');
  return servisy.pamyat;
};
const zapishet = (klass, cfg) =>
  sobratYadro({ sprashivat: cfg.sprashivat, otvechayushchegoNet: cfg.otvechayushchegoNet })
    .zapishet(klass);
proba('«запишет ли» РАЗЛИЧАЕТ узлы: без отвечающего пишет, с отвечающим — нет', () => {
  const sprashivat = ['ogranichenie', 'navyk'];
  const bez = zapishet('ogranichenie', { sprashivat, otvechayushchegoNet: true });
  const s   = zapishet('ogranichenie', { sprashivat, otvechayushchegoNet: false });
  if (bez !== true)  throw new Error('на узле БЕЗ отвечающего класс обязан записываться');
  if (s   !== false) throw new Error('на узле С отвечающим класс без подтверждения писать нельзя');
  // RU: Обычный класс пишется при обеих настройках; это контроль против прибора, всегда возвращающего разные ответы.
  // EN: An ordinary class is writable under both configurations; this guards against a detector that always returns different answers.
  if (!zapishet('urok', { sprashivat, otvechayushchegoNet: true })) throw new Error('обычный класс не пишется');
  if (!zapishet('urok', { sprashivat, otvechayushchegoNet: false })) throw new Error('обычный класс не пишется');
});

proba('ПОРЧА-ПОКАЗАТЕЛЬ: «спросит ли» на этих же данных НЕ различает узлы', () => {
  const sprashivat = ['ogranichenie', 'navyk'];
  const a = reshitPoKlassu('ogranichenie', { sprashivat })?.reshenie;
  const b = reshitPoKlassu('ogranichenie', { sprashivat })?.reshenie;
  if (a !== 'ask' || b !== 'ask') throw new Error('ожидалось ask на обоих');
  // RU: reshit описывает политику, а не возможность записи; проба не даёт снова использовать его для сужения классов.
  // EN: reshit describes policy, not write eligibility; this probe prevents using it again to narrow classes.
});

// RU: Три пробы различают ручной и автоматический вызовы: ослабляющий признак действует только на свой вызов и не меняет соседний путь.
// EN: Three probes distinguish manual and automatic calls: the relaxation flag applies only to its own call and does not change the other path.
const zapishetV = (klass, cfg, vyzov = {}) =>
  sobratYadro({ sprashivat: cfg.sprashivat, otvechayushchegoNet: cfg.otvechayushchegoNet })
    .zapishet(klass, vyzov);
proba('(а1) на узле С отвечающим: вызов дистилляции пишет, РУЧНОЙ — по-прежнему нет', () => {
  const cfg = { sprashivat: ['ogranichenie', 'navyk'], otvechayushchegoNet: false };
  if (zapishetV('ogranichenie', cfg) !== false) {
    throw new Error('ручной вызов на узле с человеком обязан требовать подтверждения');
  }
  if (zapishetV('ogranichenie', cfg, { otvechayushchegoNetVVyzove: true }) !== true) {
    throw new Error('вызов, объявивший отсутствие отвечающего, обязан писать');
  }
});
proba('(а1) признак вызова НЕ отменяет политику для обычных классов', () => {
  const cfg = { sprashivat: ['ogranichenie', 'navyk'], otvechayushchegoNet: false };
  // RU: Обычный класс пишется без признака: контроль против безусловного true при непустом втором аргументе.
  // EN: An ordinary class is writable without the flag: a control against unconditional true for a nonempty second argument.
  if (!zapishetV('urok', cfg)) throw new Error('обычный класс обязан писаться и так');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
