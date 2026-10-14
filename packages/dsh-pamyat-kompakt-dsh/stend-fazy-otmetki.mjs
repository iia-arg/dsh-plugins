// RU: СТЕНД ФАЗ И ОТКАЗОВ ОТМЕТКИ ПРОДОЛЖЕНИЯ (04.10.2026). Четыре правки marker-step.mjs и continuation-mode.mjs:
//     (1) вытеснение новым эпизодом сжатия пишется своей фазой superseded, а не canceled;
//     (2) отказ без отметки печатает и код, и ТЕКСТ ошибки («refused: Error: …», прежде — только «Error»);
//     (3) сообщения платформы marker-step берёт у ТОЙ установки, что в process.argv[1] (как движок в index.mjs), а не
//         голым импортом от своих node_modules — проверяется подставной установкой с меткой загрузки;
//     (4) файл режима Codex: имя агента проверяется по форме [a-z][a-z0-9_-]{0,31}, перечня имён в коде нет.
//     Подставные ctx, сессия, журнал, канал тревог (alert — функция стенда). Живая платформа не нужна.
//     Чего не проверяет: живой маршрут платформы; что шлюз подписки читает тот же файл режима так же.
// EN: STAND FOR PHASES AND REFUSALS OF THE CONTINUATION MARKER (04.10.2026). Four edits of marker-step.mjs and
//     continuation-mode.mjs: (1) displacement by a new compaction episode is written as its own phase superseded, not
//     canceled; (2) a refusal without a marker prints both the code and the error TEXT ("refused: Error: …",
//     previously only "Error"); (3) marker-step takes platform messages from THE installation in process.argv[1] (like
//     the engine in index.mjs), not by a bare import from its own node_modules — checked with a stand-in installation
//     carrying a load mark; (4) the Codex mode file: the agent name is checked by the form [a-z][a-z0-9_-]{0,31}, there
//     is no name list in code. Stand-in ctx, session, journal, alarm channel (alert is a stand function). No live
//     platform is needed. What it does not check: the live platform route; that the subscription gateway reads the
//     same mode file the same way.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
const KAT = fs.mkdtempSync(path.join(os.tmpdir(), "stend-fazy-otmetki-"));
process.on("exit", () => fs.rmSync(KAT, { recursive: true, force: true }));
process.on("SIGTERM", () => process.exit(143)); process.on("SIGINT", () => process.exit(130));

// RU: Подставная установка платформы: её dsh-llm/message переотдаёт настоящий модуль и ставит метку загрузки.
// EN: A stand-in platform installation: its dsh-llm/message re-exports the real module and sets a load mark.
let nastoyashchij;
try { nastoyashchij = createRequire(import.meta.url).resolve("@deepseek-ai/dsh-llm/message"); }
catch (e) { console.log("СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не найден рядом — " + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
const APP = path.join(KAT, "app"), LLM = path.join(APP, "node_modules/@deepseek-ai/dsh-llm");
fs.mkdirSync(path.join(APP, "node_modules/@deepseek-ai/dsh/lib"), { recursive: true }); fs.mkdirSync(LLM, { recursive: true });
fs.writeFileSync(path.join(APP, "node_modules/@deepseek-ai/dsh/lib/bin.js"), "");
fs.writeFileSync(path.join(LLM, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh-llm", type: "module", exports: { "./message": "./message.js" } }));
fs.writeFileSync(path.join(LLM, "message.js"), `globalThis.__dshLlmIzZovushchego = true;\nexport * from ${JSON.stringify(pathToFileURL(nastoyashchij).href)};\n`);
process.argv[1] = path.join(APP, "node_modules/@deepseek-ai/dsh/lib/bin.js");
let installMarker, codexMarkerEnabled;
try {
  ({ installMarker } = await import(new URL("./marker-step.mjs", import.meta.url).href));
  ({ codexMarkerEnabled } = await import(new URL("./continuation-mode.mjs", import.meta.url).href));
} catch (e) { console.log("СЛЕПОТА стенда: предмет не загрузился — " + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

let n = 0;
function fixture(name = "agent-proba") {
  const handlers = {}, events = [], logs = [], alerts = [];
  const session = { id: "s" + (++n), header: { createdAt: n }, snapshotEvents: () => events, requestHeader: () => ({ config: { provider: "claude-oauth", model: "claude-m" } }) };
  const agent = { id: session.id, session, status: "running", inbox: { nextTurn: [], nextStep: [] }, wakeDriver() {} };
  const ctx = { on(k, f) { (handlers[k] ??= []).push(f); return () => {}; },
    get(k) { return k === "sessions" ? { flush: async () => true } : k === "agents" ? { get: () => agent } : k === "pamyat" ? { sobytiyaSessii: () => events } : undefined; } };
  installMarker(ctx, { name, log: (s) => logs.push(s), alert: async (s) => alerts.push(s), audit: async () => [], mode: () => false, waitMs: 1000 });
  async function event(type, data = {}, meta = {}) { const e = { type, seq: events.length, time: Date.now(), data, ...meta }; events.push(e); for (const fn of handlers["session/event"] ?? []) await fn(session, e); return e; }
  async function epizod(cid) {
    const sm = await event("compaction/summary", { compactionId: cid, summary: [{ type: "text", text: "[MODE=ACTIVE]\ncheckpoint" }] });
    await event("user/message", { id: "cp-" + cid, source: { kind: "compact-checkpoint" } }, { sourceEventSeqs: [sm.seq] });
    return event("compaction/end", { compactionId: cid });
  }
  return { logs, alerts, epizod };
}
const fazy = (logs) => logs.filter((l) => l.startsWith("[continuation-marker] ")).map((l) => JSON.parse(l.slice(22)));

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error("тело пробы вернуло «" + String(v).slice(0, 60) + "»");
  proshlo++; console.log("  ✅ " + imya); } catch (e) { console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 220)); } };

await proba("стенд годен: эпизод сжатия даёт отметку (фаза ready)", async () => {
  const f = fixture(); await f.epizod("c1");
  if (!fazy(f.logs).some((r) => r.phase === "ready")) throw new Error("фазы ready нет: " + f.logs.join(" | ").slice(0, 200));
});
await proba("(1) новый эпизод вытесняет прежнюю отметку фазой superseded, а не canceled", async () => {
  const f = fixture(); await f.epizod("c1"); await f.epizod("c2");
  const r = fazy(f.logs).filter((x) => x.compactionId === "c1" && x.phase !== "ready");
  if (!r.some((x) => x.phase === "superseded" && x.reason === "superseded by next compaction")) throw new Error("фазы superseded нет: " + JSON.stringify(r));
  if (r.some((x) => x.phase === "canceled")) throw new Error("вытеснение записано canceled");
});
await proba("(2) отказ без отметки печатает код И текст ошибки", async () => {
  const f = fixture("Негодное Имя"); await f.epizod("c1");
  if (!f.logs.some((l) => l === "continuation marker refused: Error: marker identity absent")) throw new Error("строки отказа с текстом нет: " + f.logs.join(" | ").slice(0, 200));
});
await proba("(3) сообщения платформы взяты у установки из process.argv[1]", async () => {
  if (globalThis.__dshLlmIzZovushchego !== true) throw new Error("подставная установка не загружена — marker-step взял dsh-llm мимо зовущего");
});
const rezhim = (obj) => { const p = path.join(KAT, "mode-" + (++n) + ".json"); fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj)); return p; };
await proba("(4) имя правильной формы вне прежнего перечня — включено", async () => {
  if (codexMarkerEnabled("agent-x", rezhim({ version: 1, codex_marker: ["agent-x"] })) !== true) throw new Error("не включено");
});
await proba("(4) негодное по форме имя — отказ (исключение), а не включение", async () => {
  let brosil = false; try { codexMarkerEnabled("x", rezhim({ version: 1, codex_marker: ["Agent X"] })); } catch { brosil = true; }
  if (!brosil) throw new Error("негодное имя принято");
});
await proba("(4) лишний ключ — отказ; файла нет — выключено", async () => {
  let brosil = false; try { codexMarkerEnabled("a", rezhim({ version: 1, codex_marker: [], lishnij: 1 })); } catch { brosil = true; }
  if (!brosil) throw new Error("лишний ключ принят");
  if (codexMarkerEnabled("a", path.join(KAT, "net.json")) !== false) throw new Error("без файла не false");
});

const ZHDYOM = 7;
if (vsego !== ZHDYOM) { console.log("🔴 КАНАРЕЙКА: проб " + vsego + ", ЖДЁМ " + ZHDYOM); process.exit(2); }
console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
