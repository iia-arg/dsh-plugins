// RU: Барьер [MODE=…] и перенос метки в первую строку. Судим РАБОЧИЙ путь — svodkaNashejModelyu с подставным
//     провайдером, а не функцию переноса отдельно.
//     Сети не трогает: globalThis.fetch подменён, ключ подставной задан явно. Формы ответов взяты из повтора
//     реального входа (16 ответов модели, 6 из них барьер отвергал).
// EN: The [MODE=…] barrier and moving the tag to the first line. We judge the PRODUCTION path —
//     svodkaNashejModelyu with a fake provider — not the relocation function alone.
//     No network: globalThis.fetch is replaced, the fake key is set explicitly. Answer shapes are taken from a
//     replay of a real input (16 model answers, 6 of them rejected by the barrier).
process.env.KOMPAKT_API_KEY = "podstavnoj-klyuch-stenda-naruzhu-ne-uhodit"; // vorota-ob:dopusk=TOKEN
// RU: След сводок (отказы и удачи) пишется во временный каталог стенда, а НЕ в $HOME того, кто гоняет стенд:
//     иначе подставные «отказы» попадали бы в дом рабочего агента, а подставные удачи вытесняли бы настоящие
//     пары.
// EN: The summary trace (refusals and successes) goes to the stand's temporary directory, NOT to the $HOME of
//     whoever runs the stand: otherwise fake "refusals" would land in a working agent's home and fake successes
//     would push out real pairs.
import { mkdtempSync as _mkd, rmSync as _rm } from "node:fs"; import { tmpdir as _tmp } from "node:os"; import { join as _j } from "node:path";
{ const _k = _mkd(_j(_tmp(), "stend-sled-")); process.env.KOMPAKT_OTKAZY = _j(_k, "otkazy"); process.env.KOMPAKT_UDACHI = _j(_k, "udachi");
  process.on("exit", () => _rm(_k, { recursive: true, force: true })); }
// RU: Сигнал переводится в штатный выход, иначе exit-хук выше не вызывается (стенды гоняют через timeout 120).
// EN: A signal is turned into a normal exit, otherwise the exit hook above is not called (stands are run under
//     timeout 120).
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const { svodkaNashejModelyu } = await import("./index.mjs");

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  return Promise.resolve().then(f).then((v) => { if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); })
    .catch((e) => console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 200)));
};
let zvali = 0;
const otvet = (content) => {
  globalThis.fetch = async () => { zvali++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" }; };
};
async function vyzov(content) {
  otvet(content); const bylo = zvali, stroki = [], log = console.log;
  console.log = (...a) => stroki.push(a.join(" "));
  try {
    try { return { tekst: await svodkaNashejModelyu("проза"), stroki }; }
    catch (e) { return { oshibka: String(e?.message ?? e), stroki }; }
  } finally { console.log = log; if (zvali === bylo) throw new Error("подставной провайдер не вызван — проба слепа"); }
}

await proba("1 ИСПРАВНЫЙ ответ проходит без изменений и без строки переноса", async () => {
  const s = "[MODE=ACTIVE]\n\n## TL;DR\nтело";
  const r = await vyzov(s);
  if (r.oshibka) throw new Error("отвергнут: " + r.oshibka);
  if (r.tekst !== s) throw new Error("текст изменён");
  if (r.stroki.some((x) => x.includes("перенесена"))) throw new Error("строка переноса там, где переноса не было");
});
await proba("2 ЗАГОЛОВОК ПЕРЕД МЕТКОЙ: метка переносится наверх, заголовок цел, строка в журнале", async () => {
  const r = await vyzov("# Сводка рабочего периода\n\n[MODE=ACTIVE]\n\n## TL;DR\nтело");
  if (r.oshibka) throw new Error("отвергнут: " + r.oshibka);
  if (!r.tekst.startsWith("[MODE=ACTIVE]\n\n# Сводка рабочего периода")) throw new Error("не то: " + JSON.stringify(r.tekst.slice(0, 80)));
  if ((r.tekst.match(/\[MODE=/g) || []).length !== 1) throw new Error("метка задвоена");
  if (!r.stroki.some((x) => x.includes("перенесена") && x.includes("строке 3"))) throw new Error("строки переноса нет: " + r.stroki.join(" | ").slice(0, 150));
});
await proba("3 МЕТКА ВНУТРИ ЗАГОЛОВКА и ЖИРНАЯ: вынимается, остаток строки цел", async () => {
  const a = await vyzov("# [MODE=DIALOG] Сводка за период\n\nтело");
  if (a.oshibka || !a.tekst.startsWith("[MODE=DIALOG]\n\n# Сводка за период")) throw new Error("заголовок: " + (a.oshibka ?? JSON.stringify(a.tekst.slice(0, 60))));
  const b = await vyzov("# Сводка\n\n**[MODE=ACTIVE]** — идёт проба\n\nтело");
  if (b.oshibka || !b.tekst.includes("\nидёт проба") || !b.tekst.startsWith("[MODE=ACTIVE]\n")) throw new Error("жирная: " + (b.oshibka ?? JSON.stringify(b.tekst.slice(0, 80))));
});
await proba("4 МЕТКИ НЕТ (ответ на задачу): отвергнут, в причине — первая строка ответа", async () => {
  const r = await vyzov("шаг1");
  if (!r.oshibka) throw new Error("ответ без метки ПРИНЯТ — барьер проверка формата режима снят");
  if (!r.oshibka.includes("договор промта") || !r.oshibka.includes("«шаг1»")) throw new Error("причина не та: " + r.oshibka);
});
await proba("5 МЕТКА ГЛУБЖЕ ПЯТОЙ СТРОКИ: отвергнут (перенос только из начала ответа)", async () => {
  const r = await vyzov("ответ\n1\n2\n3\n4\n5\n[MODE=ACTIVE]\nтело");
  if (!r.oshibka) throw new Error("метка из глубины ответа принята");
});
// RU: Граница: после переноса заголовок становится телом и считается непустым.
// EN: Boundary: after relocation the heading becomes the body and counts as non-empty.
await proba("6 МЕТКА БЕЗ ТЕЛА: отвергнут", async () => {
  const r = await vyzov("\n\n**[MODE=ACTIVE]**\n\n");
  if (!r.oshibka) throw new Error("пустая сводка с одной меткой принята");
});

console.log(`стенд метки режима: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
