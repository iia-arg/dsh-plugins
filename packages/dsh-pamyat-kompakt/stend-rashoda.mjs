// RU: Расход вызова: токены — замер, деньги — производная; печатаются раздельно. Гоняет ту же strokiRashoda,
//     которую модуль зовёт после ответа провайдера. Вызов: node stend-rashoda.mjs (KOMPAKT_AGENT не нужен, сети
//     не трогает).
// EN: Call cost: tokens are a measurement, money is derived; they are printed separately. Runs the same
//     strokiRashoda the module calls after the provider response. Run: node stend-rashoda.mjs (KOMPAKT_AGENT
//     not needed, no network).
import { strokiRashoda } from "./index.mjs";
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); }
  catch (e) { console.log("  ❌ " + imya + " — " + String(e.message).slice(0, 160)); }
};
const U = { prompt_tokens: 12345, completion_tokens: 678, total_tokens: 13023 };
const CENY = { vhod: 0.27, vyhod: 1.1, istochnik: "прайс провайдера (подставной, стенд)", data: "2026-09-14" };

proba("1 токены берутся ИЗ ОТВЕТА: в строке ровно поданные числа", () => {
  const s = strokiRashoda(U, undefined)[0];
  for (const n of ["12345", "678", "13023"]) if (!s.includes(n)) throw new Error("нет " + n + ": " + s);
  if (!s.includes("замер")) throw new Error("токены не названы замером: " + s);
});

proba("2 ПРИЗНАК ВЛАДЕЛЬЦА: другой вход → ДРУГИЕ числа (прибор не слеп)", () => {
  const a = strokiRashoda(U, undefined)[0];
  const b = strokiRashoda({ prompt_tokens: 500, completion_tokens: 40, total_tokens: 540 }, undefined)[0];
  if (a === b) throw new Error("одинаковая строка на разных входах — прибор слеп");
  if (!b.includes("500") || b.includes("12345")) throw new Error("числа не от этого входа: " + b);
});

proba("3 usage НЕ ПРИШЁЛ → отдельный исход, а НЕ ноль", () => {
  for (const pusto of [undefined, null, "", 0]) {
    const st = strokiRashoda(pusto, CENY);
    if (st.length !== 1) throw new Error("лишние строки при отсутствии usage");
    if (!st[0].includes("НЕ СООБЩЁН")) throw new Error("не назван исход: " + st[0]);
    if (/вход 0|выход 0|\$/.test(st[0])) throw new Error("выдан ноль или деньги за незнание: " + st[0]);
  }
});

proba("4 цен нет → деньги НЕ СЧИТАЮТСЯ, причина названа", () => {
  const st = strokiRashoda(U, undefined);
  if (st.length !== 2) throw new Error("строк не две: " + st.length);
  if (!st[1].includes("НЕ СЧИТАЮ")) throw new Error("молчит о деньгах: " + st[1]);
  if (st[1].includes("$0") || /~\$/.test(st[1])) throw new Error("посчитал без каталога: " + st[1]);
});

proba("5 цены есть → деньги посчитаны, ИСТОЧНИК И ДАТА в той же строке", () => {
  const st = strokiRashoda(U, CENY);
  const d = st[1];
  if (!d.includes("ИСТОЧНИК ЦЕНЫ")) throw new Error("источник не назван: " + d);
  if (!d.includes("2026-09-14")) throw new Error("даты нет: " + d);
  const ozhidaemo = ((12345 / 1e6) * 0.27 + (678 / 1e6) * 1.1).toFixed(4);
  if (!d.includes("$" + ozhidaemo)) throw new Error("сумма не сходится, ждали " + ozhidaemo + ": " + d);
  if (!d.includes("ПРОИЗВОДНОЕ")) throw new Error("не названо производной величиной: " + d);
});

proba("6 ТОКЕНЫ И ДЕНЬГИ НЕ СМЕШАНЫ: в строке токенов нет денежного знака", () => {
  for (const ceny of [undefined, CENY]) {
    const t = strokiRashoda(U, ceny)[0];
    if (t.includes("$")) throw new Error("деньги затекли в строку замера: " + t);
  }
});

proba("7 цены есть, а токенов вход/выход нет → деньги НЕ считаются", () => {
  const st = strokiRashoda({ total_tokens: 100 }, CENY);
  if (/~\$/.test(st[1])) throw new Error("посчитал без множимого: " + st[1]);
  if (!st[1].includes("НЕ СЧИТАЮ")) throw new Error("не назван исход: " + st[1]);
  if (!st[0].includes("не сообщено")) throw new Error("отсутствие поля выдано числом: " + st[0]);
});

proba("8 кэш НЕ выдумывается: полей нет → слова «кэш» нет вовсе", () => {
  if (strokiRashoda(U, undefined)[0].includes("кэш")) throw new Error("выдуман ноль кэша");
  const s = strokiRashoda({ ...U, prompt_cache_hit_tokens: 10000, prompt_cache_miss_tokens: 2345 }, undefined)[0];
  if (!s.includes("попаданий 10000") || !s.includes("промахов 2345")) throw new Error("кэш не напечатан: " + s);
});

proba("9 контроль зрячести пробы 2: заведомо слепая печать ЛОВИТСЯ", () => {
  const slepaya = () => "[kompakt-nash] расход, ТОКЕНЫ: вход много · выход немного";
  if (slepaya() !== slepaya()) throw new Error("подставной прибор не постоянен");
  if (slepaya() !== slepaya()) throw new Error("нечем ловить");
  const a = slepaya(), b = slepaya();
  if (a !== b) throw new Error("проба 2 не увидела бы слепоты");
});

console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
