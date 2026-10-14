// RU: СТЕНД ХВОСТА. Хвост — то, что остаётся у агента дословно, — подаётся модели сводки ВТОРЫМ блоком. Судим
//     НАСТОЯЩИЙ summarize (прототип NashaSvodka без конструктора движка: тот требует ctx платформы) на
//     ПОДСТАВНОЙ сессии: surface.nodes + events + deriveEventMessage; голова строится тем же правилом, что
//     buildSummarizationInput платформы (префикс surface, пустые отброшены). Провайдер подставной, сети нет;
//     след сводок — во временный каталог.
//     ⚠️ Подстановка: что живая сессия платформы устроена так же, доказывает только живое сжатие под
//     наблюдением.
// EN: TAIL STAND. The tail — what stays verbatim with the agent — is passed to the summary model as a SECOND
//     block. We judge the REAL summarize (the NashaSvodka prototype without the engine constructor: it needs a
//     platform ctx) on a FAKE session: surface.nodes + events + deriveEventMessage; the head is built by the
//     same rule as the platform's buildSummarizationInput (surface prefix, empty ones dropped). Fake provider,
//     no network; the summary trace goes to a temporary directory.
//     ⚠️ Substitution: that a live platform session is built the same way is proven only by a live compaction
//     under observation.
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
// RU: Имитация запуска платформой: пакет сжатия ищется от этого пути (см. index.mjs). ⚠️ Путь установки
//     платформы задан в коде стенда.
// EN: Simulates a platform start: the compaction package is resolved from this path (see index.mjs). ⚠️ The
//     platform installation path is hard-coded in the stand.
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
// RU: Ключ подставной задаётся явно: иначе модуль взял бы настоящий из окружения.
// EN: The fake key is set explicitly: otherwise the module would take the real one from the environment.
process.env.KOMPAKT_API_KEY = "podstavnoj-klyuch-stenda-naruzhu-ne-uhodit";
// RU: След отказов и удач — во временный каталог стенда, а не в дом того, кто гоняет стенд.
// EN: The refusal/success trace goes to the stand's temporary directory, not to the home of whoever runs it.
const KAT = mkdtempSync(join(tmpdir(), "stend-hvosta-"));
process.env.KOMPAKT_OTKAZY = join(KAT, "otkazy"); process.env.KOMPAKT_UDACHI = join(KAT, "udachi");
process.on("exit", () => rmSync(KAT, { recursive: true, force: true }));
// RU: Сигнал переводится в штатный выход, иначе exit-хук выше не вызывается (стенды гоняют через timeout 120).
// EN: A signal is turned into a normal exit, otherwise the exit hook above is not called (stands are run under
//     timeout 120).
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const { NashaSvodka } = await import(new URL("./index.mjs", import.meta.url).href);

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); } catch (e) { console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 200)); } };
let zapros = null;
// RU: Подставной провайдер: запоминает тело запроса и отвечает готовой сводкой с меткой режима.
// EN: Fake provider: records the request body and answers with a ready summary carrying the mode marker.
globalThis.fetch = async (a, o) => { zapros = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "[MODE=ACTIVE]\n\nсводка" } }] }), text: async () => "" }; };

// RU: Подставная сессия: seq 0..N-1; события 2 и 7 — не сообщения (deriveEventMessage → null).
// EN: Fake session: seq 0..N-1; events 2 and 7 are not messages (deriveEventMessage → null).
function sessiya(teksty, pustye = [2, 7]) {
  const events = teksty.map((t, seq) => ({ seq, t }));
  const derive = (e) => (pustye.includes(e.seq) ? null : { role: e.seq % 2 ? "assistant" : "user", content: [{ type: "text", text: e.t }] });
  return { surface: { nodes: events.map((e) => e.seq) }, events, deriveEventMessage: derive };
}
const TEKSTY = Array.from({ length: 12 }, (_, i) => `сообщение-${i}`);
const golovaDo = (s, k) => ({ messages: s.surface.nodes.slice(0, k).map((q) => s.deriveEventMessage(s.events[q])).filter((m) => m !== null) });
// RU: Вызов настоящего summarize с подставным ctx; возвращает ответ, строки журнала и текст запроса к модели.
// EN: Calls the real summarize with a fake ctx; returns the answer, the log lines and the model request text.
async function vyzov(input, agent) {
  zapros = null; const stroki = [];
  const fake = { ctx: { logger: { info: (m) => stroki.push(m) } } };
  const r = await NashaSvodka.prototype.summarize.call(fake, input, agent);
  return { r, stroki, u: zapros?.messages?.[1]?.content ?? "" };
}

await proba("1 СТЫК СОШЁЛСЯ: хвост подан вторым блоком, после стенограммы; строка «подан, не пересказывается»", async () => {
  const s = sessiya(TEKSTY); const x = await vyzov(golovaDo(s, 8), { session: s });
  const iS = x.u.indexOf("сообщение-6"), iH = x.u.indexOf("<<< НАЧАЛО ХВОСТА"), iT = x.u.indexOf("сообщение-11");
  if (iH < 0) throw new Error("блока хвоста нет в запросе");
  if (!(iS < iH && iH < iT)) throw new Error("порядок не тот: стенограмма → хвост");
  for (const n of [8, 9, 10, 11]) if (x.u.split(`сообщение-${n}`).length !== 2) throw new Error(`сообщение-${n} не ровно один раз`);
  if (x.u.indexOf("сообщение-8") < iH) throw new Error("хвост попал в стенограмму");
  if (!x.stroki.some((l) => l.includes("хвост") && l.includes("подан, не пересказывается"))) throw new Error("строки о поданном хвосте нет");
});
await proba("2 СТЫК НЕ СОШЁЛСЯ: хвост НЕ подан, прежняя рамка, строка с причиной", async () => {
  const s = sessiya(TEKSTY); const input = golovaDo(s, 8); input.messages[input.messages.length - 1] = { role: "user", content: [{ type: "text", text: "чужое" }] };
  const x = await vyzov(input, { session: s });
  if (x.u.includes("<<< НАЧАЛО ХВОСТА") || x.u.includes("сообщение-9")) throw new Error("хвост подан при несошедшемся стыке");
  if (!x.stroki.some((l) => l.includes("хвост НЕ подан (стык не сошёлся"))) throw new Error("строки с причиной нет: " + x.stroki.join(" | ").slice(0, 120));
  if (!x.r?.summary) throw new Error("сводки нет");
});
await proba("3 RETAIN 0 (голова = вся surface): хвоста нет, прежняя рамка, без строки «НЕ подан»", async () => {
  const s = sessiya(TEKSTY); const x = await vyzov(golovaDo(s, 12), { session: s });
  if (x.u.includes("<<< НАЧАЛО ХВОСТА")) throw new Error("блок хвоста при пустом хвосте");
  if (!x.u.includes("<<< НАЧАЛО СТЕНОГРАММЫ")) throw new Error("прежней рамки нет");
  if (x.stroki.some((l) => l.includes("НЕ подан"))) throw new Error("лишняя строка «НЕ подан»");
});
await proba("4 СЕССИИ НЕТ: хвост НЕ подан, строка «сессия агента недоступна», сводка идёт", async () => {
  const s = sessiya(TEKSTY); const x = await vyzov(golovaDo(s, 8), {});
  if (x.u.includes("<<< НАЧАЛО ХВОСТА")) throw new Error("хвост без сессии");
  if (!x.stroki.some((l) => l.includes("сессия агента недоступна"))) throw new Error("строки нет");
});
await proba("5 ПУСТЫЕ СОБЫТИЯ В ХВОСТЕ И ГОЛОВЕ: счёт по непустым, стык сходится", async () => {
  const s = sessiya(TEKSTY, [2, 7, 9]); const x = await vyzov(golovaDo(s, 8), { session: s });
  if (!x.u.includes("<<< НАЧАЛО ХВОСТА") || x.u.includes("сообщение-9") || !x.u.includes("сообщение-10")) throw new Error("хвост собран неверно при пустом событии в нём");
});
// RU: ПОДПИСЬ МОДЕЛИ = МОДЕЛЬ, КОТОРУЮ ВЫБРАЛ СОСЕД (04.10.2026). Прежде model в ответе платформе бралась из KOMPAKT_MODEL
//     окружения или умолчания deepseek-flash — а dsh-pamyat-kompakt выбирает модель по СВОЕЙ настройке при загрузке. Расхождение
//     воспроизводится так: окружение меняется ПОСЛЕ загрузки соседа; модель настоящего запроса (zapros.model) — то, что выбрал сосед.
// EN: THE MODEL SIGNATURE = THE MODEL THE SIBLING CHOSE (04.10.2026). Previously model in the answer to the platform came from the
//     KOMPAKT_MODEL environment or the deepseek-flash default — while dsh-pamyat-kompakt chooses the model from ITS OWN settings at
//     load time. The divergence is reproduced by changing the environment AFTER the sibling loaded; the model of the real request
//     (zapros.model) is what the sibling chose.
await proba("6 ПОДПИСЬ МОДЕЛИ: model в ответе = модель настоящего запроса соседа, не окружение", async () => {
  const bylo = process.env.KOMPAKT_MODEL; process.env.KOMPAKT_MODEL = "model-iz-okruzheniya-posle-zagruzki";
  try {
    const s = sessiya(TEKSTY); const x = await vyzov(golovaDo(s, 8), { session: s });
    if (!zapros?.model) throw new Error("модели в запросе соседа нет — проба не достала предмет");
    if (zapros.model === process.env.KOMPAKT_MODEL) throw new Error("сосед взял окружение после загрузки — расхождение не воспроизведено");
    if (x.r?.model !== zapros.model) throw new Error("подпись «" + x.r?.model + "», а запрос ушёл к «" + zapros.model + "»");
  } finally { if (bylo === undefined) delete process.env.KOMPAKT_MODEL; else process.env.KOMPAKT_MODEL = bylo; }
});
console.log(`стенд хвоста: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
