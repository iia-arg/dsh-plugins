// RU: СТЕНД ЛИТЕРАЛА ХВОСТА: строка STROKA_HVOSTA в index.mjs обязана совпадать с той же строкой в dsh-pamyat-restore.
//     По её началу restore выбирает текст пробуждения и вырезает её из сводки в приветствии; разойдись литералы —
//     restore перестанет узнавать хвост МОЛЧА. Прежде совпадение держалось вручную, стенда не было.
//     Наш литерал берётся настоящим импортом index.mjs, соседский — чтением текста главного файла dsh-pamyat-restore
//     (резолвер по имени пакета от этого стенда): два разных способа добычи. Соседа нет — СЛЕПОТА, код 2.
//     Платформа для импорта index.mjs — DSH_TEST_APP; не задан — СЛЕПОТА, код 2.
//     Чего не проверяет: что restore на деле узнаёт хвост в живой сводке — это его собственные стенды.
// EN: TAIL LITERAL STAND: the STROKA_HVOSTA string in index.mjs must match the same string in dsh-pamyat-restore.
//     restore uses its start to choose the wake-up text and to cut it from the summary in the welcome message; if
//     the literals diverge, restore stops recognising the tail SILENTLY. Previously the match was kept by hand, with
//     no stand.
//     Our literal comes from a real import of index.mjs, the sibling's — from reading the text of dsh-pamyat-restore's
//     main file (a resolver by package name from this stand): two different ways of obtaining it. No sibling —
//     BLINDNESS, exit 2. The platform for importing index.mjs is DSH_TEST_APP; unset — BLINDNESS, exit 2.
//     What it does not check: that restore actually recognises the tail in a live summary — that is its own stands.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
if (!process.env.DSH_TEST_APP) { console.log("СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы"); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
let nash, putSoseda;
try { ({ STROKA_HVOSTA: nash } = await import(new URL("./index.mjs", import.meta.url).href)); }
catch (e) { console.log("СЛЕПОТА стенда: index.mjs не загрузился — " + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
try { putSoseda = createRequire(import.meta.url).resolve("dsh-pamyat-restore"); }
catch (e) { console.log("СЛЕПОТА стенда: dsh-pamyat-restore не найден рядом — " + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

// RU: Литерал из текста модуля: строка «export const STROKA_HVOSTA = '…'» (одинарные или двойные кавычки).
// EN: The literal from module text: the line "export const STROKA_HVOSTA = '…'" (single or double quotes).
const izTeksta = (t) => t.match(/^export const STROKA_HVOSTA\s*=\s*(['"])(.*?)\1/m)?.[2];

let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error("тело пробы вернуло «" + String(v).slice(0, 60) + "»");
  proshlo++; console.log("  ✅ " + imya); } catch (e) { console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 200)); } };

proba("стенд годен: наш литерал экспортирован и непуст", () => {
  if (typeof nash !== "string" || nash.length < 10) throw new Error("STROKA_HVOSTA: " + JSON.stringify(nash));
});
proba("контроль зрячести: разбор текста различает другой литерал", () => {
  const podstava = "export const STROKA_HVOSTA = 'другая строка'\n";
  if (izTeksta(podstava) !== "другая строка") throw new Error("разбор не достал литерал из подставы");
  if (izTeksta(podstava) === nash) throw new Error("подстава совпала с нашим — проба бессильна");
});
proba("ЛИТЕРАЛЫ СОВПАДАЮТ: index.mjs и dsh-pamyat-restore (" + putSoseda + ")", () => {
  const ih = izTeksta(readFileSync(putSoseda, "utf8"));
  if (ih === undefined) throw new Error("в dsh-pamyat-restore нет строки «export const STROKA_HVOSTA = …» — договор разорван");
  if (ih !== nash) throw new Error("разошлись: у нас «" + nash + "», у restore «" + ih + "»");
});

const ZHDYOM = 3;
if (vsego !== ZHDYOM) { console.log("🔴 КАНАРЕЙКА: проб " + vsego + ", ЖДЁМ " + ZHDYOM); process.exit(2); }
console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
