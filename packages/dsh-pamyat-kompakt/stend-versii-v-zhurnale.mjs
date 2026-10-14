// RU: Версия модуля в КАЖДОЙ строке журнала. Мерит не текст кода, а поведение: поднимает модуль дочерним
//     процессом в подставном каталоге и смотрит, что он напечатал.
//     Стенд стережёт не наличие номера, а его ПРОИСХОЖДЕНИЕ: номер обязан браться из package.json рядом с этим
//     кодом. Иначе процесс со старым кодом в памяти после обновления назвал бы НОВУЮ версию — соврал бы ровно
//     там, ради чего строка заведена.
//     Граница: подставной каталог — не платформа. Что платформа поднимет модуль тем же путём, здесь не
//     доказывается; это снимается живым признаком после запуска. Вызов: node stend-versii-v-zhurnale.mjs
// EN: The module version in EVERY log line. It measures behaviour, not code text: starts the module as a child
//     process in a fake directory and looks at what it printed.
//     The stand guards not the presence of the number but its ORIGIN: the number must come from the
//     package.json next to this code. Otherwise a process holding old code in memory would report the NEW
//     version after an update — lying exactly where the line is meant to help.
//     Boundary: a fake directory is not the platform. That the platform loads the module the same way is not
//     proven here; it is checked by a live sign after start-up. Run: node stend-versii-v-zhurnale.mjs
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT (стенды
//     обычно гоняют через timeout 120). Каждый mkdtemp стенда — через vremennyj(). От SIGKILL не спасает ничто;
//     временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temporary files are removed on ANY exit — normal, failed probe, process.exit, SIGTERM/SIGINT
//     (stands are usually run under timeout 120). Every mkdtemp of the stand goes through vremennyj(). Nothing
//     protects against SIGKILL; temporary files created by a CHILD process are that process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const SVOJ = path.dirname(fileURLToPath(import.meta.url));
const VERSIYA_MANIFESTA = JSON.parse(fs.readFileSync(path.join(SVOJ, "package.json"), "utf8")).version;

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); }
  catch (e) { console.log("  ❌ " + imya + " — " + String(e.message).slice(0, 200)); }
};

// RU: Поднять модуль в подставном каталоге и вернуть ВЕСЬ вывод (оба потока).
// EN: Start the module in a fake directory and return ALL output (both streams).
function pechat({ versiya = null, bezManifesta = false, bityj = false, index = null } = {}) {
  const kat = vremennyj(path.join(os.tmpdir(), "stend-versii-"));
  fs.copyFileSync(index ?? path.join(SVOJ, "index.mjs"), path.join(kat, "index.mjs"));
  fs.copyFileSync(path.join(SVOJ, "porogi.mjs"), path.join(kat, "porogi.mjs"));
  fs.copyFileSync(path.join(SVOJ, "tekstovye-nastrojki.mjs"), path.join(kat, "tekstovye-nastrojki.mjs"));
  const promt = path.join(SVOJ, "promt-svodki.txt");
  if (fs.existsSync(promt)) fs.copyFileSync(promt, path.join(kat, "promt-svodki.txt"));
  if (!bezManifesta) {
    const m = JSON.parse(fs.readFileSync(path.join(SVOJ, "package.json"), "utf8"));
    if (versiya) m.version = versiya;
    fs.writeFileSync(path.join(kat, "package.json"), bityj ? "{ это не json" : JSON.stringify(m, null, 2));
  }
  // RU: strokiRashoda зовём здесь же: её префикс отдельный, и он тоже обязан нести версию.
  // EN: strokiRashoda is called here too: it has its own prefix, which must also carry the version.
  const kod = 'import("./index.mjs").then(m=>{for(const s of m.strokiRashoda('
    + '{prompt_tokens:10,completion_tokens:5,total_tokens:15})) console.error(s)})';
  return execFileSync("bash", ["-c",
    `cd ${JSON.stringify(kat)} && ${JSON.stringify(process.execPath)} -e ${JSON.stringify(kod)} 2>&1`],
    { encoding: "utf8" });
}

proba("1 КАЖДАЯ строка модуля несёт версию (ни одной голой)", () => {
  const stroki = pechat().split("\n").filter(s => s.includes("[kompakt"));
  if (stroki.length < 4) throw new Error("строк мало, мерить нечего: " + stroki.length);
  const golye = stroki.filter(s => /\[kompakt(-nash)?\]/.test(s));
  if (golye.length) throw new Error("без версии " + golye.length + ": " + golye[0].slice(0, 90));
  if (!stroki.every(s => s.includes(VERSIYA_MANIFESTA))) throw new Error("не все несут номер манифеста");
});

proba("2 строки РАСХОДА (префикс -nash) тоже несут версию", () => {
  const rash = pechat().split("\n").filter(s => s.includes("[kompakt-nash"));
  if (!rash.length) throw new Error("строк расхода нет — проба ничего не мерит");
  if (!rash.every(s => s.includes(VERSIYA_MANIFESTA))) throw new Error("расход без версии: " + rash[0].slice(0, 90));
});

proba("3 ЗРЯЧЕСТЬ: иной package.json рядом с кодом → ИНОЙ номер в строке", () => {
  const v = pechat({ versiya: "9.9.9-probnaya" });
  if (!v.includes("[kompakt 9.9.9-probnaya]")) throw new Error("номер не изменился: строка не из своего манифеста");
  if (v.includes(VERSIYA_MANIFESTA)) throw new Error("печатает ЧУЖОЙ номер вместе с подставным");
});

proba("4 манифеста нет → «версия неизвестна», а НЕ подставленный номер", () => {
  const v = pechat({ bezManifesta: true });
  if (!v.includes("версия неизвестна")) throw new Error("незнание не названо");
  if (v.includes(VERSIYA_MANIFESTA)) throw new Error("подставил последний известный номер — хуже молчания");
});

proba("5 манифест БИТЫЙ → «версия неизвестна», подъём НЕ падает", () => {
  const v = pechat({ bityj: true });
  if (!v.includes("версия неизвестна")) throw new Error("не назвал незнание при битом манифесте");
  if (!v.includes("[kompakt")) throw new Error("модуль не поднялся вовсе");
});

proba("6 КОНТРОЛЬ ЗРЯЧЕСТИ ПРОБЫ 1: код БЕЗ версии в префиксе — ловится", () => {
  const kod = fs.readFileSync(path.join(SVOJ, "index.mjs"), "utf8")
    .replace(/\[kompakt \$\{VERSIYA\}\]/g, "[kompakt]")
    .replace(/\[kompakt-nash \$\{VERSIYA\}\]/g, "[kompakt-nash]");
  const put = path.join(vremennyj(path.join(os.tmpdir(), "porcha-")), "index.mjs");
  fs.writeFileSync(put, kod);
  const golye = pechat({ index: put }).split("\n").filter(s => /\[kompakt(-nash)?\]/.test(s));
  if (!golye.length) throw new Error("проба 1 СЛЕПА: не видит даже заведомо голого префикса");
});

console.log(`[стенд версии в журнале] проб: ${vsego} · прошло: ${proshlo} · провалено: ${vsego - proshlo}`);
process.exit(proshlo === vsego ? 0 : 1);
