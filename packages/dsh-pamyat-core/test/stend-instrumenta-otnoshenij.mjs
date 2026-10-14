// RU: Проверяем pamyat_otnoshenie, читателей отношений в службе и пометки prochitat по договору отношений памяти. Берём описание opisanieInstrumentaOtnosheniya, которое ядро отдаёт платформе; регистрацию проверяем настоящим defineTool из DSH_TEST_APP. Коды: 0 — успех, 1 — расхождение, 2 — предмет или платформа недоступны.
// EN: Test pamyat_otnoshenie, relation readers in the service, and prochitat annotations against the memory-relation contract. Use the opisanieInstrumentaOtnosheniya description exported to the platform; check registration with the real defineTool from DSH_TEST_APP. Codes: 0 success, 1 mismatch, 2 subject or platform unavailable.
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let apply, opisanieInstrumentaOtnosheniya, otkrytHranilishche;
try {
  ;({ apply, opisanieInstrumentaOtnosheniya } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
} catch (e) {
  console.log(`СЛЕПОТА: предмет не загрузился — ${String(e?.message ?? e).slice(0, 160)}`);
  process.exit(2);
}

let vsego = 0, proshlo = 0, slepota = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const v = await f();
    if (v === 'slepota') { slepota++; console.log('  СЛЕП ' + imya); return; }
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v));
    proshlo++; console.log('  ok   ' + imya);
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)); }
};
const otkaz = async (p) => { try { await p; return null; } catch (e) { return String(e?.message ?? e); } };

const katalog = vremennyj(join(tmpdir(), 'instrument-otn-'));
let nomer = 0;
const sobrat = (dop = {}) => {
  const put = join(katalog, `b${nomer++}.db`);
  const servisy = {};
  const ctx = { provide(i, o) { servisy[i] = o; }, on() {}, logger: { error() {} }, ...dop };
  apply(ctx, { putBazy: put, agent: 'stend' });
  const h = otkrytHranilishche(put);
  // RU: Записи создаём через ядро с отметкой журнала; читаем хранилище независимо.
  // EN: Create records through the core with journal marks; inspect storage independently.
  return { p: servisy.pamyat, h, zap: (klass, t) => {
    const id = servisy.pamyat.zapisat({ klass, soderzhim: t, podtverzhdenie: 'allowed-once' });
    if (servisy.pamyat.svodka().novayaRaznica !== 0) throw new Error('пробная запись и журнал разошлись');
    return id;
  } };
};
// RU: У Agent по договору платформы есть id типа SessionId, поля name нет.
// EN: The platform’s Agent contract has a SessionId id and no name field.
const AGENT = { agent: { id: 'sess-1' } };

try {
  await proba('агент ставит через инструмент → kto = агент ядра (сессия из контекста) в журнале → читатель службы видит', async () => {
    const { p, h, zap } = sobrat();
    const a = zap('reshenie', 'старое'), b = zap('reshenie', 'новое');
    const r = await opisanieInstrumentaOtnosheniya(p, 'stend').execute({ id: b, vid: 'otmenyaet', k: a }, AGENT);
    if (r.ishod !== 'ustanovleno') return 'исход ' + r.ishod;
    const pochemu = h.baza.prepare("SELECT pochemu FROM zhurnal WHERE priroda = 'otnoshenie'").get()?.pochemu;
    if (!String(pochemu).startsWith('stend (сессия sess-1):')) return 'kto в журнале не «агент ядра (сессия …)»: ' + pochemu;
    const kto = p.ktoOtmenil(a), st = p.statusOtnosheniya(b);
    return (kto.status === 'otmenena' && kto.kem.join() === String(b) && st.status === 'est' && st.k === a)
      || `ktoOtmenil ${JSON.stringify(kto)} · status ${JSON.stringify(st)}`;
  });
  await proba('выдача prochitat ПОМЕЧАЕТ, НЕ СКРЫВАЕТ: отменённая на месте с otmenena=[B], у B sama', () => {
    const { p, zap } = sobrat();
    const a = zap('vyvod', 'X'), b = zap('vyvod', 'не X'), c = zap('fakt', 'Y'), d = zap('fakt', 'Y точнее');
    p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: 'стенд' });
    p.ustanovitOtnoshenie({ id: d, vid: 'utochnyaet', k: c, kto: 'стенд' });
    const vse = p.prochitat({ skolko: 50 });
    const po = (id) => vse.find((z) => Number(z.id) === id);
    if (!po(a)) return 'отменённая запись СКРЫТА из выдачи';
    const oa = po(a).otnosheniya, ob = po(b).otnosheniya, oc = po(c).otnosheniya;
    return (oa?.otmenena?.join() === String(b) && ob?.sama?.vid === 'otmenyaet' && ob.sama.k === a
      && oc?.utochnena?.join() === String(d) && oc.otmenena.length === 0)
      || `a ${JSON.stringify(oa)} · b ${JSON.stringify(ob)} · c ${JSON.stringify(oc)}`;
  });
  await proba('отказ договора доходит до агента ТЕКСТОМ с кодом, не тихо: otmenyaet к fakt', async () => {
    const { p, zap } = sobrat();
    const a = zap('fakt', 'случилось'), b = zap('fakt', 'иначе');
    const t = await otkaz(opisanieInstrumentaOtnosheniya(p, 'stend').execute({ id: b, vid: 'otmenyaet', k: a }, AGENT));
    return (t && t.includes('PAMYAT_OTMENA_ZAVERSHENNOGO') && t.startsWith('ОТКАЗ')) || 'текст отказа: ' + t;
  });
  await proba('вызов вне агента — отказ PAMYAT_OTNOSHENIE_BEZ_KTO; kto из аргумента НЕ берётся', async () => {
    const { p, zap } = sobrat();
    const a = zap('reshenie', 'a'), b = zap('reshenie', 'b');
    const t = await otkaz(opisanieInstrumentaOtnosheniya(p, 'stend').execute({ id: b, vid: 'otmenyaet', k: a, kto: 'подделка' }, {}));
    return (t && t.includes('PAMYAT_OTNOSHENIE_BEZ_KTO')) || 'без агента: ' + t;
  });
  await proba('читатель службы о чужой или несуществующей записи — отказ PAMYAT_ZAPIS_NE_NAJDENA', () => {
    const { p } = sobrat();
    let k1 = null, k2 = null;
    try { p.ktoOtmenil(999); } catch (e) { k1 = e.code; }
    try { p.statusOtnosheniya(999); } catch (e) { k2 = e.code; }
    return (k1 === 'PAMYAT_ZAPIS_NE_NAJDENA' && k2 === 'PAMYAT_ZAPIS_NE_NAJDENA') || `${k1} / ${k2}`;
  });
  // RU: Ядро регистрирует два инструмента; принятые описания собираем по имени, а не по последней регистрации.
  // EN: The core registers two tools; collect accepted descriptions by name rather than taking the last registration.
  await proba('регистрация настоящим defineTool платформы: pamyat_otnoshenie и pamyat_ocenit приняты службой tools', async () => {
    const app = process.env.DSH_TEST_APP;
    const bin = app && join(app, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
    if (!bin || !existsSync(bin)) { console.log('       нет платформы (DSH_TEST_APP) — проверить регистрацию нечем'); return 'slepota'; }
    const prinyatye = {};
    const staryj = process.argv[1]; process.argv[1] = bin;
    try {
      sobrat({ get: (i) => (i === 'tools' ? { register(t) { prinyatye[t?.name] = t; } } : undefined) });
      for (let i = 0; i < 50 && !(prinyatye.pamyat_otnoshenie && prinyatye.pamyat_ocenit); i++) await new Promise((r) => setTimeout(r, 100));
    } finally { process.argv[1] = staryj; }
    const godno = (t) => Boolean(t && t.parameters && typeof t.execute === 'function');
    return (godno(prinyatye.pamyat_otnoshenie) && godno(prinyatye.pamyat_ocenit))
      || 'за 5 с принято: ' + JSON.stringify(Object.keys(prinyatye)) + ' — нужны pamyat_otnoshenie и pamyat_ocenit с parameters и execute';
  });
} finally {
  rmSync(katalog, { recursive: true, force: true });
}
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}${slepota ? ` · слепота ${slepota}` : ''}`);
process.exit(proshlo === vsego ? 0 : (proshlo + slepota === vsego ? 2 : 1));
