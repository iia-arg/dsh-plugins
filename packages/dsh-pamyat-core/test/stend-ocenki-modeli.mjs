// RU: Проверяем pamyat_ocenit через opisanieInstrumentaOcenki и службу ocenitVydannoe без модели и платформы: execute вызывается напрямую с Agent.id как сессией. Оценка разрешена только своей, невычищенной записи, выданной в этом процессе через vydacha-agentu; один раз на poslednyaya_vydacha, сохраняющуюся в базе после подъёма. Повтор судом не выдача. kem задаёт код с #v<выдача>, вера считается otsenit. Касания имеют явный kogda, чтобы совпадение миллисекунд не сливало две выдачи. Коды: 0 — успех, 1 — расхождение, 2 — предмет не загрузился.
// EN: Test pamyat_ocenit through opisanieInstrumentaOcenki and ocenitVydannoe without a model or platform: call execute directly with Agent.id as the session. Only an owned, unpurged record delivered in this process via vydacha-agentu may be rated, once per poslednyaya_vydacha persisted across startup. A judged repeat is not delivery. Code supplies kem with #v<delivery>, and otsenit computes confidence. Touches have explicit kogda timestamps so millisecond collisions cannot merge two deliveries. Codes: 0 success, 1 mismatch, 2 subject failed to load.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const VREMENNYE = [];
const vremennyj = (...a) => { const k = mkdtempSync(...a); VREMENNYE.push(k); return k; };
process.on('exit', () => { for (const k of VREMENNYE) rmSync(k, { recursive: true, force: true }); });
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));

let apply, opisanieInstrumentaOcenki, otkrytHranilishche;
try {
  ;({ apply, opisanieInstrumentaOcenki } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
  if (typeof opisanieInstrumentaOcenki !== 'function') throw new Error('opisanieInstrumentaOcenki не экспортирован');
} catch (e) {
  console.log(`СЛЕПОТА: предмет не загрузился — ${String(e?.message ?? e).slice(0, 160)}`);
  process.exit(2);
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const v = await f();
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v));
    proshlo++; console.log('  ok   ' + imya);
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)); }
};
const otkaz = async (p) => { try { await p; return null; } catch (e) { return String(e?.message ?? e); } };

const katalog = vremennyj(join(tmpdir(), 'ocenka-modeli-'));
const PUT = join(katalog, 'b.db');
const podnyat = () => {
  const servisy = {};
  const ctx = { provide(i, o) { servisy[i] = o; }, on() {}, logger: { error() {} } };
  apply(ctx, { putBazy: PUT, agent: 'stend' });
  return { p: servisy.pamyat, instr: opisanieInstrumentaOcenki(servisy.pamyat, 'stend') };
};
const h = () => otkrytHranilishche(PUT);
const ocenki = (id) => { const z = h().poId(id); return z?.ocenki ? JSON.parse(z.ocenki) : []; };
const S1 = { agent: { id: 'sess-1' } }, S2 = { agent: { id: 'sess-2' } };
const POCHEMU = 'применила запись в разборе — вывод подтвердился замером';
const vyd = (id) => h().poId(id)?.poslednyaya_vydacha;   /* RU: kem содержит номер выдачи.
 * EN: kem includes the delivery number.
 */
const T0 = Date.UTC(2026, 8, 30, 12, 0, 0);
const pomogloKem = (id) => new Set(ocenki(id).filter((x) => x.ishod === 'helped').map((x) => x.kem));   /* RU: Используем ту же формулу, что restore.
 * EN: Use the same formula as restore.
 */

let { p, instr } = podnyat();
const zap = (t) => p.zapisat({ klass: 'urok', soderzhim: t, podtverzhdenie: 'allowed-once' });
const A = zap('урок А: проверять порог замером'), B = zap('урок Б: сторож с подставным каналом'), V = zap('урок В: вычищаемый');
const CH = h().zapisat({ agent: 'drugoj', klass: 'urok', soderzhim: 'урок чужого агента' });
const G = zap('урок Г: для правила двух выдач');

await proba('П0 описание: имя pamyat_ocenit, параметры id/ishod/pochemu', () =>
  instr.name === 'pamyat_ocenit' && ['id', 'ishod', 'pochemu'].every((k) => instr.parameters[k]?.required) || JSON.stringify(Object.keys(instr.parameters)));
await proba('П1 НЕ выданная запись → PAMYAT_OCENKA_NE_VYDAVALOS, событий 0', async () => {
  const t = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t?.includes('PAMYAT_OCENKA_NE_VYDAVALOS') && ocenki(A).length === 0) || `отказ: ${t}; событий ${ocenki(A).length}`;
});
await proba('П2 касание «povtor-sudom» НЕ делает запись выданной', async () => {
  p.otmetitKasanie({ ids: [A], povod: 'povtor-sudom', kogda: T0 - 1000 });
  const t = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return t?.includes('PAMYAT_OCENKA_NE_VYDAVALOS') || `отказ: ${t}`;
});
p.otmetitKasanie({ ids: [A, B, V, CH], povod: 'vydacha-agentu', kogda: T0 });
await proba('П3 выданная, pomoglo, сессия 1 → событие, kem model:stend/sess-1#v<выдача>, вера не измерялась → 1', async () => {
  const r = await instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1);
  const o = ocenki(A);
  return (vyd(A) === T0 && r.vera === 1 && r.veraDo === null && o.length === 1 && o[0].kem === 'model:stend/sess-1#v' + T0 && o[0].ishod === 'helped' && o[0].pochemu === POCHEMU)
    || JSON.stringify({ vyd: vyd(A), r, o });
});
await proba('П4 повтор той же сессии → PAMYAT_OCENKA_UZHE_PO_VYDACHE, событий по-прежнему 1', async () => {
  const t = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t?.includes('PAMYAT_OCENKA_UZHE_PO_VYDACHE') && ocenki(A).length === 1) || `отказ: ${t}; событий ${ocenki(A).length}`;
});
await proba('П5 другая сессия по ТОЙ ЖЕ выдаче → PAMYAT_OCENKA_UZHE_PO_VYDACHE (одна оценка на выдачу, не на сессию)', async () => {
  const t = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S2));
  return (t?.includes('PAMYAT_OCENKA_UZHE_PO_VYDACHE') && ocenki(A).length === 1) || `отказ: ${t}; событий ${ocenki(A).length}`;
});
await proba('П6 podvelo → вера существующей формулой (0.8 − 0.35 = 0.45)', async () => {
  const r = await instr.execute({ id: B, ishod: 'podvelo', pochemu: POCHEMU }, S1);
  return r.vera === 0.45 || `вера ${r.vera}`;
});
await proba('П7 вычищенная запись → PAMYAT_OCENKA_VYCHISHCHENO, событий 0', async () => {
  const db = new DatabaseSync(PUT); db.prepare('UPDATE zapisi SET vychishcheno = 1 WHERE id = ?').run(V); db.close();
  const t = await otkaz(instr.execute({ id: V, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t?.includes('PAMYAT_OCENKA_VYCHISHCHENO') && ocenki(V).length === 0) || `отказ: ${t}`;
});
await proba('П8 запись другого агента (даже «выданная») → PAMYAT_OCENKA_CHUZHAYA', async () => {
  const t = await otkaz(instr.execute({ id: CH, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t?.includes('PAMYAT_OCENKA_CHUZHAYA') && ocenki(CH).length === 0) || `отказ: ${t}`;
});
await proba('П9 pochemu короче 20 → PAMYAT_OCENKA_POCHEMU; незнакомый исход → PAMYAT_OCENKA_NE_TOT_ISHOD', async () => {
  const t1 = await otkaz(instr.execute({ id: B, ishod: 'pomoglo', pochemu: 'коротко' }, S2));
  const t2 = await otkaz(instr.execute({ id: B, ishod: 'helped', pochemu: POCHEMU }, S2));
  return (t1?.includes('PAMYAT_OCENKA_POCHEMU') && t2?.includes('PAMYAT_OCENKA_NE_TOT_ISHOD')) || `${t1} | ${t2}`;
});
await proba('П10 вне агента (нет exec.agent) → PAMYAT_OCENKA_BEZ_KTO', async () => {
  const t = await otkaz(instr.execute({ id: B, ishod: 'pomoglo', pochemu: POCHEMU }, {}));
  return t?.includes('PAMYAT_OCENKA_BEZ_KTO') || `отказ: ${t}`;
});
await proba('П11 подъём службы: выданное забыто (NE_VYDAVALOS); запрет повтора по той же выдаче переживает подъём (по базе)', async () => {
  ;({ p, instr } = podnyat());
  const t1 = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  // RU: Процесс снова помнит выдачу, но T0 уже оценена в базе: повторная оценка отвергается.
  // EN: The process remembers delivery again, but T0 is already rated in the database: reject another rating.
  p.otmetitKasanie({ ids: [A], povod: 'vydacha-agentu', kogda: T0 });
  const t2 = await otkaz(instr.execute({ id: A, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t1?.includes('PAMYAT_OCENKA_NE_VYDAVALOS') && t2?.includes('PAMYAT_OCENKA_UZHE_PO_VYDACHE') && ocenki(A).length === 1) || `${t1} | ${t2} | ${ocenki(A).length}`;
});
await proba('П12 правило двух ВЫДАЧ: одна выдача + две оценки → одна «помогло»; повтор судом выдачей не считается; вторая выдача + оценка → две', async () => {
  const T1 = T0 + 30000;
  const k0 = pomogloKem(G).size;
  p.otmetitKasanie({ ids: [G], povod: 'vydacha-agentu', kogda: T1 });                       /* RU: Первая выдача для этого процесса.
 * EN: First delivery for this process.
 */
  const r1 = await instr.execute({ id: G, ishod: 'pomoglo', pochemu: POCHEMU }, S1);
  const t1 = await otkaz(instr.execute({ id: G, ishod: 'pomoglo', pochemu: POCHEMU }, S2));  /* RU: Та же выдача в другой сессии.
 * EN: The same delivery in another session.
 */
  p.otmetitKasanie({ ids: [G], povod: 'povtor-sudom', kogda: T1 + 60000 });                 /* RU: Знание пришло повторно, но не было выдано.
 * EN: Knowledge arrived again but was not delivered.
 */
  const t2 = await otkaz(instr.execute({ id: G, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  const k1 = pomogloKem(G).size;
  p.otmetitKasanie({ ids: [G], povod: 'vydacha-agentu', kogda: T1 + 120000 });              /* RU: Запись выдана заново.
 * EN: The record is delivered again.
 */
  const r2 = await instr.execute({ id: G, ishod: 'pomoglo', pochemu: POCHEMU }, S1);
  const k2 = pomogloKem(G).size;
  return (k0 === 0 && r1.ocenok === 1 && t1?.includes('PAMYAT_OCENKA_UZHE_PO_VYDACHE') && t2?.includes('PAMYAT_OCENKA_UZHE_PO_VYDACHE')
    && k1 === 1 && vyd(G) === T1 + 120000 && r2.ocenok === 2 && k2 === 2)
    || JSON.stringify({ k0, r1, t1, t2, k1, vyd: vyd(G), r2, k2 });
});
await proba('П13 выдано в процессе, но момент выдачи в базе пуст (выдача до миграции) → PAMYAT_OCENKA_VYDACHA_NE_ZAPISANA, событий 0', async () => {
  const D = zap('урок Д: выданный до миграции');
  p.otmetitKasanie({ ids: [D], povod: 'vydacha-agentu', kogda: T0 });
  const db = new DatabaseSync(PUT); db.prepare('UPDATE zapisi SET poslednyaya_vydacha = NULL WHERE id = ?').run(D); db.close();
  const t = await otkaz(instr.execute({ id: D, ishod: 'pomoglo', pochemu: POCHEMU }, S1));
  return (t?.includes('PAMYAT_OCENKA_VYDACHA_NE_ZAPISANA') && ocenki(D).length === 0) || `отказ: ${t}`;
});

console.log(`\nстенд оценки модели: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
