// RU: Сводка двух порогов: слепота названа вслух, печать безусловна. Гоняет ту же svodkaPorogov, что и модуль
//     (функция сохранена, но при подъёме больше не печатается). Вызов: node stend-svodki-porogov.mjs
//     (KOMPAKT_AGENT не нужен).
// EN: Two-threshold summary: blindness is named explicitly, printing is unconditional. Runs the same
//     svodkaPorogov as the module (the function is kept but no longer printed at start-up). Run: node
//     stend-svodki-porogov.mjs (KOMPAKT_AGENT not needed).
import { svodkaPorogov } from "./index.mjs";
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); }
  catch (e) { console.log("  ❌ " + imya + " — " + String(e.message).slice(0, 140)); }
};

proba("1 исправное: числа равны → печатает СЛЕПОТУ, а не «совпали»", () => {
  const s = svodkaPorogov(0.4, 0.4);
  if (!s.includes("НЕ ПРОВЕРЕН")) throw new Error("нет слова НЕ ПРОВЕРЕН: " + s);
  if (!s.includes("0.4")) throw new Error("величина не названа: " + s);
});

proba("2 порча: числа разные → РАСХОЖДЕНИЕ, оба значения названы", () => {
  const s = svodkaPorogov(0.4, 0.9);
  if (!s.includes("РАСХОЖДЕНИЕ")) throw new Error("не кричит: " + s);
  if (!(s.includes("0.4") && s.includes("0.9"))) throw new Error("названо не оба: " + s);
});

proba("3 снятие порчи: снова равны → та же строка, что в пробе 1", () => {
  if (svodkaPorogov(0.4, 0.4) !== svodkaPorogov(0.4, 0.4)) throw new Error("непостоянна");
  if (!svodkaPorogov(0.4, 0.4).includes("НЕ ПРОВЕРЕН")) throw new Error("слепота потеряна");
});

proba("4 НИ ПРИ КАКОМ значении не печатается «совпали» (перебор 11 пар)", () => {
  const znacheniya = [undefined, 0, 0.17, 0.4, 0.48, 0.9, 1, -1, NaN, "0.4", null];
  for (const p of znacheniya) {
    const s = svodkaPorogov(0.4, p);
    if (s.includes("совпали")) throw new Error("«совпали» при платформенном " + String(p));
  }
});

proba("5 молчания НЕТ: платформенный не объявлен → строка есть и НАЗЫВАЕТ это", () => {
  const s = svodkaPorogov(0.4, undefined);
  if (!s || s.length < 20) throw new Error("строка пуста — молчание вернулось");
  if (!s.includes("НЕ ОБЪЯВЛЕН")) throw new Error("не названо: " + s);
});

proba("6 контроль зрячести пробы 4: заведомое «совпали» ЛОВИТСЯ", () => {
  const podstavnaya = (a, b) => `[kompakt] пороги совпали: ${a} · ${b}`;
  let poymano = false;
  if (podstavnaya(0.4, 0.4).includes("совпали")) poymano = true;
  if (!poymano) throw new Error("проба 4 слепа: не видит даже заведомого");
});

proba("7 шлюзовой ПОГАШЕН + числа разные -> НЕ красное, а «НЕ ПРИМЕНЯЕТСЯ»", () => {
  const s = svodkaPorogov(0.9, 0.4, false);
  if (s.includes("РАСХОЖДЕНИЕ")) throw new Error("кричит о расхождении с мёртвым числом: " + s);
  if (!s.includes("НЕ ПРИМЕНЯЕТСЯ")) throw new Error("не назвал причину молчания: " + s);
  if (!s.includes("0.4")) throw new Error("потерял живое значение: " + s);
});

proba("8 ЖИВОСТЬ РАЗЛИЧАЕТ: те же числа при живом шлюзовом -> РАСХОЖДЕНИЕ", () => {
  const pogashen = svodkaPorogov(0.9, 0.4, false);
  const zhiv     = svodkaPorogov(0.9, 0.4, true);
  if (pogashen === zhiv) throw new Error("живость не меняет исход — проба 7 ничего не стережёт");
  if (!zhiv.includes("РАСХОЖДЕНИЕ")) throw new Error("при живом шлюзовом обязано быть красным: " + zhiv);
});

proba("9 живость НЕ ОБЪЯВЛЕНА (undefined) -> прежнее поведение, а не молчание", () => {
  const s = svodkaPorogov(0.9, 0.4, undefined);
  if (!s.includes("РАСХОЖДЕНИЕ")) throw new Error("необъявленная живость проглотила расхождение: " + s);
});

console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
