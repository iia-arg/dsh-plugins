// RU: Проверяем источник перечня классов: строка подъёма различает заданный список и умолчание, даже при одинаковых восьми именах. Пустой заданный список отличается от отсутствующего ключа. Config разбирается схемой пакета на подставном ctx; использование той же схемы настоящей платформой здесь не проверяется.
// EN: Test the class-list source: the startup line distinguishes a supplied list from the default, even with the same eight names. An explicitly empty list differs from an absent key. The package schema parses config on a fake ctx; this does not verify that the real platform uses that schema.
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
let apply, Config, KLASSY_ZNANIY_UMOLCHANIE;
try { ({ apply, Config, KLASSY_ZNANIY_UMOLCHANIE } = await import('../src/index.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ — прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело ВЕРНУЛО «' + String(v).slice(0, 50) + '»');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 150)); }
};

const katalog = vremennyj(join(tmpdir(), 'istochnik-perechnya-'));
let nomer = 0;

// RU: Поднимаем службу и возвращаем { stroki, pamyat }. Разбираем config схемой пакета, чтобы проверить путь доставки настройки и её умолчание.
// EN: Start the service and return { stroki, pamyat }. Parse config through the package schema to test configuration delivery and default handling.
const podnyat = (syroj) => {
  const stroki = [];
  const bylo = console.error;
  const ctx = { logger: null, provide() {}, get() { return undefined }, on() {} };
  let vydano = null;
  ctx.provide = (imya, obj) => { if (imya === 'pamyat') vydano = obj; };
  console.error = (...a) => stroki.push(a.join(' '));
  try {
    apply(ctx, new Config({ putBazy: join(katalog, 'p' + (++nomer) + '.db'), agent: 'proba', ...syroj }));
  } finally { console.error = bylo; }
  const podyom = stroki.find((s) => s.includes('подъём: база'));
  if (!podyom) throw new Error('строки подъёма нет вовсе — стенд негоден, судить не о чем');
  return { podyom, pamyat: vydano };
};

proba('стенд годен: служба поднимается и говорит строку подъёма', () => {
  const { podyom, pamyat } = podnyat({});
  if (!pamyat) throw new Error('служба не отдала «pamyat»');
  if (!podyom.includes('классы знаний')) throw new Error('строка подъёма не про перечень: ' + podyom.slice(0, 90));
});

proba('🔴 ГЛАВНОЕ: перечень ИЗ НАСТРОЙКИ назван настройкой', () => {
  const { podyom } = podnyat({ klassyZnaniy: ['urok', 'reshenie'] });
  if (!podyom.includes('urok, reshenie')) throw new Error('перечень не тот: ' + podyom.slice(0, 120));
  if (!podyom.includes('(настройка)')) throw new Error('источник НЕ назван настройкой: ' + podyom.slice(0, 140));
});

proba('🔴 ГЛАВНОЕ: перечень НЕ ЗАДАН — назван умолчанием модуля', () => {
  const { podyom } = podnyat({});
  if (!podyom.includes('(умолчание модуля)')) throw new Error('источник НЕ назван умолчанием: ' + podyom.slice(0, 140));
  if (!podyom.includes(KLASSY_ZNANIY_UMOLCHANIE.join(', '))) throw new Error('умолчание не то: ' + podyom.slice(0, 140));
});

// RU: Главная пара: явно заданные восемь имён и отсутствующий ключ должны давать разные строки источника при одинаковом перечне.
// EN: Main pair: eight explicitly supplied names and an absent key must produce different source lines despite identical lists.
proba('🔴 ГЛАВНОЕ: «задано теми же восемью» ≠ «не задано вовсе»', () => {
  const zadano = podnyat({ klassyZnaniy: [...KLASSY_ZNANIY_UMOLCHANIE] }).podyom;
  const netKlyucha = podnyat({}).podyom;
  const bezBazy = (s) => s.replace(/база [^,]+,/, 'база —,');
  if (bezBazy(zadano) === bezBazy(netKlyucha)) {
    throw new Error('строки СОВПАЛИ при одинаковых значениях — различителя нет, ради чего правка и делалась');
  }
  if (!zadano.includes('(настройка)')) throw new Error('заданный перечень не назван настройкой');
  if (!netKlyucha.includes('(умолчание модуля)')) throw new Error('незаданный не назван умолчанием');
});

proba('«задано пустым» назван настройкой, а не умолчанием', () => {
  const pusto = podnyat({ klassyZnaniy: [] }).podyom;
  if (!pusto.includes('ни одного')) throw new Error('пустой перечень назван не «ни одного»: ' + pusto.slice(0, 120));
  if (!pusto.includes('(настройка)')) throw new Error('пустой перечень обязан быть назван НАСТРОЙКОЙ: ' + pusto.slice(0, 140));
});

proba('ПОВЕДЕНИЕ НЕ ИЗМЕНИЛОСЬ: без ключа отбор идёт по умолчанию, а не отключён', () => {
  const { pamyat } = podnyat({});
  pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 'session#1' });
  pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'служебное', istochnik: 'session#1' });
  const vydacha = pamyat.prochitat().map((r) => r.klass);
  if (vydacha.includes('svodka-kompakcii')) throw new Error('служебное выпало в выдачу — отбор отключён');
  if (!vydacha.includes('urok')) throw new Error('знание не выдано вовсе — отбор лишний');
});

proba('ЗЕРКАЛЬНО: перечень из настройки ДЕЙСТВУЕТ, а не только печатается', () => {
  const { pamyat } = podnyat({ klassyZnaniy: ['svodka-kompakcii'] });
  pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 'session#1' });
  pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'служебное', istochnik: 'session#1' });
  const vydacha = pamyat.prochitat().map((r) => r.klass);
  if (!vydacha.includes('svodka-kompakcii')) throw new Error('перечень из настройки не подействовал на выдачу');
  if (vydacha.includes('urok')) throw new Error('в выдачу попало то, чего в перечне нет');
});

proba('ГРАНИЦА СХЕМЫ: негодный тип по-прежнему отвергается', () => {
  let otverg = false;
  try { new Config({ putBazy: join(katalog, 'x.db'), agent: 'proba', klassyZnaniy: 'не массив' }); }
  catch { otverg = true; }
  if (!otverg) throw new Error('схема приняла строку вместо массива — проверка типа потеряна');
});

console.log('итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
