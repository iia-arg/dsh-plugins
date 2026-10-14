// RU: Внутренний счёт занятости шлюза (zanjatoPoslednee). Гоняет polnayaZanyatost — ту же функцию, что шлюз
//     использует для порога. Не про отдачу наружу: наружу идут три поля отдельно.
//     Занятость считается по ИМЕНИ поставщика. Проба 5 сверяет обе нормализации (anthropic и openai) на одном
//     входе: раньше одна жила в модуле, другая в шлюзе (другой пакет), и расхождения между ними не увидел бы
//     никто. Вызов: node stend-polnoy-zanyatosti.mjs
// EN: The gateway's internal occupancy count (zanjatoPoslednee). Runs polnayaZanyatost — the same function the
//     gateway uses for the threshold. Not about external reporting: three fields go out separately.
//     Occupancy is computed by provider NAME. Probe 5 checks both normalisations (anthropic and openai) on the
//     same input: previously one lived in the module and the other in the gateway (another package), and nobody
//     would have seen a divergence. Run: node stend-polnoy-zanyatosti.mjs
import { polnayaZanyatost, vedraPoImeni, VEDRA_POSTAVSHCHIKA } from "./index.mjs";
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error("тело ВЕРНУЛО «" + String(v).slice(0, 40) + "»");
    proshlo++; console.log("  ✅ " + imya);
  } catch (e) { console.log("  ❌ " + imya + " — " + e.message.slice(0, 160)); }
};
const otkaz = (f) => { try { f(); return null; } catch (e) { return e.message; } };

const sdkUsage = { input_tokens: 2, cache_read_input_tokens: 25249, cache_creation_input_tokens: 702 };

proba("1 РЕГРЕССИИ НЕТ: anthropic на прежнем usage даёт прежние 25953", () => {
  const v = polnayaZanyatost(sdkUsage, "anthropic");
  if (v !== 25953) throw new Error("ожидали 25953, получили " + v);
});
proba("2 порча (только некэш) → 2, занижает занятость → краснеет", () => {
  const nek = ({ input_tokens }) => input_tokens ?? 0;
  if (nek(sdkUsage) >= 1000) throw new Error("порча не отловилась");
});
proba("3 вернуть: снова полная сумма (25953)", () => {
  if (polnayaZanyatost(sdkUsage, "anthropic") !== 25953) throw new Error("после возврата не 25953");
});
proba("4 openai: input ВКЛЮЧАЕТ кэш ⇒ некэш вычитается, занятость не задваивается", () => {
  // RU: 25953 всего: некэш 2, чтение кэша 25249, запись кэша 702. У Codex input = 2 + 25249.
  // EN: 25953 total: non-cached 2, cache read 25249, cache write 702. For Codex input = 2 + 25249.
  const v = polnayaZanyatost({ input_tokens: 25251, cached_input_tokens: 25249, cache_write_input_tokens: 702 }, "openai");
  if (v !== 25953) throw new Error("ожидали 25953, получили " + v);
});
proba("5 🔴 ГЛАВНАЯ: ОДИН расход, ДВА поставщика — занятость совпадает знак в знак", () => {
  const a = polnayaZanyatost(sdkUsage, "anthropic");
  const o = polnayaZanyatost({ input_tokens: 25251, cached_input_tokens: 25249, cache_write_input_tokens: 702 }, "openai");
  if (a !== o) throw new Error(`РАСХОЖДЕНИЕ ПАКЕТОВ: anthropic ${a} ≠ openai ${o}`);
});
proba("5б контроль зрячести пробы 5: подменённая нормализация обязана расходиться", () => {
  const a = polnayaZanyatost(sdkUsage, "anthropic");
  const krivaya = (u) => u.input_tokens + u.cached_input_tokens; // RU: задваивает кэш · EN: counts the cache twice
  if (a === krivaya({ input_tokens: 25251, cached_input_tokens: 25249 })) throw new Error("проба 5 СЛЕПА: не различает");
});
proba("6 неизвестный поставщик → ИМЕНОВАННЫЙ отказ, а не число", () => {
  const m = otkaz(() => polnayaZanyatost(sdkUsage, "gemini"));
  if (!m) throw new Error("вернул число вместо отказа — тихая подстановка");
  if (!m.includes("gemini") || !m.includes("НЕИЗВЕСТЕН")) throw new Error("отказ безымянный: " + m);
});
proba("7 имя НЕ ЗАДАНО → отказ, а не тихий anthropic", () => {
  for (const bez of [undefined, null, ""]) {
    const m = otkaz(() => polnayaZanyatost(sdkUsage, bez));
    if (!m) throw new Error("прошло молча при имени «" + String(bez) + "»");
    if (!m.includes("НЕ ЗАДАНО")) throw new Error("отказ не про имя: " + m);
  }
});
proba("7б имя из ПРОБЕЛОВ → отказ говорит ПРО ПРОБЕЛЫ, а не «не задано»", () => {
  // RU: Отказ с ложным объяснением хуже отказа без объяснения: чинить пойдут по нему.
  // EN: A refusal with a false explanation is worse than one without: people will fix what it says.
  for (const probely of ["   ", "\t", "\n "]) {
    const m = otkaz(() => polnayaZanyatost(sdkUsage, probely));
    if (!m) throw new Error("прошло молча при «" + JSON.stringify(probely) + "»");
    if (!m.includes("ПРОБЕЛАМИ")) throw new Error("объяснение ложное (сказал «не задано» про заданное): " + m);
  }
});
proba("8 третий поставщик заводится ТОЛЬКО в модуле и сразу работает", () => {
  VEDRA_POSTAVSHCHIKA.proba_tretij = (u) => ({ inputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 3 });
  const v = polnayaZanyatost({}, "proba_tretij");
  delete VEDRA_POSTAVSHCHIKA.proba_tretij;
  if (v !== 123) throw new Error("ожидали 123, получили " + v);
  if (otkaz(() => polnayaZanyatost({}, "proba_tretij")) === null) throw new Error("после снятия всё ещё известен");
});
proba("9 чужая СТРОКА в поле не склеивается: 7 и «7» дают одно", () => {
  const chislom = polnayaZanyatost({ input_tokens: 7, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 }, "anthropic");
  const strokoj = polnayaZanyatost({ input_tokens: "7", cache_read_input_tokens: "700", cache_creation_input_tokens: 0 }, "anthropic");
  if (chislom !== 707) throw new Error("числом дало " + chislom);
  if (strokoj !== 707) throw new Error("строкой дало " + strokoj + " (склейка вместо сложения)");
});
proba("10 мусор в поле → 0 за ведро, а не NaN на всю занятость", () => {
  const v = polnayaZanyatost({ input_tokens: "abc", cache_read_input_tokens: 5, cache_creation_input_tokens: 0 }, "anthropic");
  if (!Number.isFinite(v)) throw new Error("занятость стала " + v);
  if (v !== 5) throw new Error("ожидали 5, получили " + v);
});
proba("11 вёдра отдаются раздельно (для отдачи наружу), не суммой", () => {
  const v = vedraPoImeni(sdkUsage, "anthropic");
  if (v.inputTokens !== 2 || v.cacheReadTokens !== 25249 || v.cacheWriteTokens !== 702)
    throw new Error("вёдра: " + JSON.stringify(v));
});
console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
