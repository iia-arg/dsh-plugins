// RU: Три исхода переключателя шлюзового компакта. Гоняет тот же reshitKompakt, что и шлюз. Вызов: node
//     stend-pereklyuchatelej.mjs (из каталога модуля, KOMPAKT_AGENT не нужен).
// EN: Three outcomes of the gateway compaction switch. Runs the same reshitKompakt as the gateway. Run: node
//     stend-pereklyuchatelej.mjs (from the module directory, KOMPAKT_AGENT not needed).
import { reshitKompakt } from "./index.mjs";
const POROG = 500;
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error("тело ВЕРНУЛО «" + String(v).slice(0, 40) + "»");
    proshlo++; console.log("  ✅ " + imya);
  } catch (e) { console.log("  ❌ " + imya + " — " + e.message.slice(0, 120)); }
};
proba("1 исправное: шлюзовой вкл, выше порога → СЖИМАЕТ (zhat)", () => {
  if (reshitKompakt(1000, POROG, true) !== "zhat") throw new Error("ожидали zhat");
});
proba("2 выключено: шлюзовой выкл, выше порога → НЕ сжимает (vyklyuchen)", () => {
  if (reshitKompakt(1000, POROG, false) !== "vyklyuchen") throw new Error("ожидали vyklyuchen");
});
proba("3 вернуть: шлюзовой вкл → СНОВА сжимает (zhat)", () => {
  if (reshitKompakt(1000, POROG, true) !== "zhat") throw new Error("ожидали zhat после возврата");
});
proba("не объявлено: выше порога → СЖИМАЕТ по безопасному умолчанию (zhat)", () => {
  if (reshitKompakt(1000, POROG, undefined) !== "zhat") throw new Error("ожидали zhat (тихий паралич хуже лишнего сжатия)");
});
proba("ниже порога → zdyot (ждёт)", () => {
  if (reshitKompakt(100, POROG, true) !== "zdyot") throw new Error("ожидали zdyot");
});
console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
