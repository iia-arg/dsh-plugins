// RU: СТЕНД УДЕРЖАНИЯ: удержание не больше половины поверхности. Судим НАСТОЯЩИЕ compactIfNeeded — наш
//     (NashaSvodka) и платформы (BasicCompactionEngine той установки, что в process.argv[1]) — с их настоящим
//     выбором хвоста selectCompactableRange и проверкой пар инструментов. Экземпляры — через прототип
//     (конструктор движка требует ctx платформы); подставные: сессия, tokenMeter, окно, compactRegion
//     (записывает выбранный диапазон вместо сводки).
//     ⚠️ Что живая сессия платформы устроена так же, доказывает только живое сжатие.
// EN: RETENTION STAND: retention is at most half of the surface. We judge the REAL compactIfNeeded — ours
//     (NashaSvodka) and the platform's (BasicCompactionEngine of the installation in process.argv[1]) — with
//     their real tail selection selectCompactableRange and tool-pair check. Instances via the prototype (the
//     engine constructor needs a platform ctx); fakes: session, tokenMeter, window, compactRegion (records the
//     selected range instead of summarizing).
//     ⚠️ That a live platform session is built the same way is proven only by a live compaction.
import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const { BasicCompactionEngine } = await import(pathToFileURL(createRequire(process.argv[1]).resolve("@deepseek-ai/dsh-compaction-basic")).href);
const { NashaSvodka } = await import(new URL("./index.mjs", import.meta.url).href);
const OKNO = 1_000_000;
const stroki = []; const err0 = console.error; console.error = (m) => stroki.push(String(m));

// RU: Сессия: n узлов по t токенов; давление P до сжатия, после — ниже порога. para — узел 0 с неотвеченным
//     вызовом инструмента.
// EN: Session: n nodes of t tokens; pressure P before compaction, below the threshold after. para — node 0
//     holds an unanswered tool call.
function sessiya({ n, t, P, para = false }) {
  const events = Array.from({ length: n }, (_, seq) => (seq === 0 && para
    ? { seq, type: "assistant/message", data: { message: { content: [{ type: "tool-call" }] } } }
    : { seq, type: seq % 2 ? "assistant/message" : "user/message", data: { message: { content: [{ type: "text" }] } } }));
  const s = { events, surface: { nodes: events.map((e) => e.seq), replaceGeneration: 0 }, szhato: false,
    eventAt: (seq) => events[seq], get seq() { return events.length },   // RU: DSH 0.2: сессия отдаёт события по seq, движок зовёт eventAt. EN: DSH 0.2: the session serves events by seq, the engine calls eventAt.
    requestHeader: () => ({ config: { provider: "claude-oauth", model: "m" } }) };
  s.izmer = () => ({ totalTokens: s.szhato ? 100_000 : P, surfaceTokens: n * t, nodes: s.surface.nodes.map((seq) => ({ seq, tokens: t })) });
  return s;
}
function dvizhok(Klass, retainRatio) {
  const e = Object.create(Klass.prototype); const vybor = [];
  e.ctx = { tokenMeter: { measure: (s) => s.izmer() }, llm: { resolveModelInfo: async () => ({ context: { contextWindow: OKNO } }) },
    get: () => undefined, logger: { info() {}, warn() {} } };
  e.config = Object.freeze({ thresholdRatio: 0.89, headroomTokens: 0, retainRatio, summarizationProvider: "", summarizationModel: "", maxTokens: 8192,   // RU: DSH 0.2: бюджет давления вычитает headroomTokens; summarizationModel и maxTokens прежде стояли внутри этого комментария и в конфиг не попадали. EN: DSH 0.2: the pressure budget subtracts headroomTokens; summarizationModel and maxTokens used to sit inside this comment and did not reach the config.
    compactionRetries: 0, maxOverflowRetries: 1, modelPolicies: Object.freeze([]), auto: false });
  e.compactRegion = async (start, end, agent) => { vybor.push([start, end]); agent.session.szhato = true; return { shadowedSeqs: [start], shadowedRange: { start, end }, shadowedTokenCount: 1 } };
  return { e, vybor };
}
async function progon(Klass, retainRatio, opis) {
  const s = sessiya(opis); const { e, vybor } = dvizhok(Klass, retainRatio); stroki.length = 0;
  let oshibka = null, r = null;
  try { r = await e.compactIfNeeded({ session: s }, "pressure", new AbortController().signal); } catch (x) { oshibka = String(x?.message ?? x); }
  return { r, vybor: vybor[0] ?? null, stroki: [...stroki], oshibka, dvizhokConfig: e.config };
}
let vsego = 0, bed = 0;
const proba = (imya, ok, pochemu) => { vsego++; if (ok) err0(`✅ ${imya}`); else { bed++; err0(`❌ ${imya}: ${pochemu}`); } };
const hvost = (v, n) => (v ? n - 1 - v[1] : null);   // RU: сколько узлов осталось дословно. EN: how many nodes stay verbatim.

// RU: 1. ЛОВУШКА: 6% окна = 60 000 при поверхности 55 000 (110 × 500), давление 900 000 ≥ порога 890 000.
// EN: 1. TRAP: 6% of the window = 60 000 with a surface of 55 000 (110 × 500), pressure 900 000 ≥ threshold 890
//     000.
{ const pl = await progon(BasicCompactionEngine, 0.06, { n: 110, t: 500, P: 900_000 });
  const my = await progon(NashaSvodka, 0.06, { n: 110, t: 500, P: 900_000 });
  proba("ловушка воспроизведена на платформе: выбор null", pl.r === null && pl.vybor === null, JSON.stringify(pl));
  proba("ловушка: наш движок сжимает, хвост ≥ ½ поверхности (27 500) и < всей", my.vybor !== null && hvost(my.vybor, 110) * 500 >= 27_500 && hvost(my.vybor, 110) < 110 && !my.oshibka,
    JSON.stringify({ v: my.vybor, h: hvost(my.vybor, 110), o: my.oshibka }));
  proba("ловушка: ни строки «выбрать нечего», ни сторожа", !my.stroki.some((x) => /выбрать нечего|НЕ прочла/.test(x)), JSON.stringify(my.stroki));
  proba("подстановка снята после вызова: конфиг движка прежний (0.06, без retainTokens)", my.dvizhokConfig.retainRatio === 0.06 && my.dvizhokConfig.retainTokens === undefined, JSON.stringify(my.dvizhokConfig)); }
// RU: 2. S ≥ 2R — выбор ПОБАЙТНО как у платформы (две поверхности, 150 000 и 646 000).
// EN: 2. S ≥ 2R — selection BYTE-FOR-BYTE as the platform's (two surfaces, 150 000 and 646 000).
for (const [imya, n, t] of [["агент 1 S=150 000", 300, 500], ["агент 2 S=646 000", 1292, 500]]) {
  const pl = await progon(BasicCompactionEngine, 0.06, { n, t, P: 900_000 }), my = await progon(NashaSvodka, 0.06, { n, t, P: 900_000 });
  proba(`${imya}: выбор как у платформы`, pl.vybor !== null && JSON.stringify(pl.vybor) === JSON.stringify(my.vybor) && my.stroki.length === 0, JSON.stringify({ pl: pl.vybor, my: my.vybor, s: my.stroki })); }
// RU: 3. R < S < 2R (90 000): хвост уменьшен до ½ поверхности — намеренное изменение.
// EN: 3. R < S < 2R (90 000): the tail is reduced to ½ of the surface — an intended change.
{ const pl = await progon(BasicCompactionEngine, 0.06, { n: 180, t: 500, P: 900_000 }), my = await progon(NashaSvodka, 0.06, { n: 180, t: 500, P: 900_000 });
  proba("S=90 000: платформа держит 60 000, наш — 45 000 (½)", hvost(pl.vybor, 180) * 500 === 60_000 && hvost(my.vybor, 180) * 500 === 45_000, JSON.stringify({ pl: hvost(pl.vybor, 180), my: hvost(my.vybor, 180) })); }
// RU: 4. Ниже порога — молчание и null у обоих.
// EN: 4. Below the threshold — silence and null from both.
{ const my = await progon(NashaSvodka, 0.06, { n: 110, t: 500, P: 800_000 });
  proba("ниже порога: null, строк нет", my.r === null && my.stroki.length === 0, JSON.stringify(my)); }
// RU: 5. Баланс пар: неотвеченный вызов в узле 0 — ни одного сбалансированного среза ⇒ null + строка «по
//     балансу пар».
// EN: 5. Pair balance: an unanswered call in node 0 — no balanced cut ⇒ null + a "pair balance" line.
{ const my = await progon(NashaSvodka, 0.06, { n: 110, t: 500, P: 900_000, para: true });
  proba("баланс пар: null + строка «выбрать нечего по балансу пар инструментов»", my.r === null && my.stroki.some((x) => x.includes("выбрать нечего по балансу пар")), JSON.stringify(my.stroki)); }
// RU: 6. СТОРОЖ: платформа «вставила await» до чтения политики — подстановка не прочитана ⇒ ловушка вернулась,
//     и это СЛЫШНО.
// EN: 6. WATCHDOG: the platform "inserted an await" before reading the policy — the substitution is unread ⇒
//     the trap is back, and it is AUDIBLE.
{ const orig = BasicCompactionEngine.prototype.compactIfNeeded;
  BasicCompactionEngine.prototype.compactIfNeeded = async function (...a) { await null; return orig.apply(this, a); };
  let my; try { my = await progon(NashaSvodka, 0.06, { n: 110, t: 500, P: 900_000 }); } finally { BasicCompactionEngine.prototype.compactIfNeeded = orig; }
  proba("сторож: «платформа НЕ прочла подстановку» + «поверхность 55000 < удержания 60000»", my.r === null && my.stroki.some((x) => x.includes("НЕ прочла подстановку удержания 27500"))
    && my.stroki.some((x) => x.includes("поверхность 55000 < удержания 60000")), JSON.stringify(my.stroki)); }
console.error = err0;
console.log(`итог: ${vsego - bed} из ${vsego}`);
process.exit(bed ? 1 : 0);
