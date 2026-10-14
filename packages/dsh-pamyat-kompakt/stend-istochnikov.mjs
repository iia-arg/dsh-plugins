// RU: Источники значений: откуда модуль взял каждое и доезжает ли настройка до расчёта.
//     Зачем отдельный стенд: model и hvostStrok в файле настройки равны умолчаниям кода — проба по ЗНАЧЕНИЮ
//     зелена при обоих исходах, и когда настройка доехала, и когда файл не открылся. Различитель живёт в
//     ИСТОЧНИКЕ, поэтому проверяется он.
//     Модуль читает окружение один раз при импорте, поэтому каждый исход гоняется ПОДПРОЦЕССОМ. Вызов: node
//     stend-istochnikov.mjs
// EN: Value sources: where the module took each value from and whether the settings reach the computation.
//     Why a separate stand: model and hvostStrok in the settings file equal the code defaults — a VALUE-based
//     probe is green in both outcomes, whether the settings arrived or the file never opened. The distinguisher
//     lives in the SOURCE, so that is what is checked.
//     The module reads the environment once at import, so each outcome runs in a SUBPROCESS. Run: node
//     stend-istochnikov.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pathS from "node:path";
import fsS from "node:fs";
import osS from "node:os";
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT (стенды
//     обычно гоняют через timeout 120). Каждый mkdtemp стенда — через vremennyjKatalog(). От SIGKILL не спасает
//     ничто; временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temporary files are removed on ANY exit — normal, failed probe, process.exit, SIGTERM/SIGINT
//     (stands are usually run under timeout 120). Every mkdtemp of the stand goes through vremennyjKatalog().
//     Nothing protects against SIGKILL; temporary files created by a CHILD process are that process's
//     responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyjKatalog = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const KATALOG = pathS.dirname(fileURLToPath(import.meta.url));
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); }
  catch (e) { console.log("  ❌ " + imya + " — " + String(e.message).slice(0, 200)); }
};

// RU: Стенд пишет собственный файл D; копии настройки внутри пакета больше нет.
// EN: The stand writes its own D file; there is no settings copy inside the package any more.
const VNESHNIJ_TEST = vremennyjKatalog(pathS.join(osS.tmpdir(), "stend-istochnikov-D-"));
const OBRAZEC_D = { model: "deepseek-flash", hvostStrok: 30, oknoSvodki: 1000000,
  adres: "https://api.deepseek.com/v1/chat/completions", imenaKlyucha: ["KOMPAKT_API_KEY", "DEEPSEEK_API_KEY", "GATEWAY_API_KEY"] };
fsS.writeFileSync(pathS.join(VNESHNIJ_TEST, "sample-agent.json"), JSON.stringify(OBRAZEC_D));
fsS.writeFileSync(pathS.join(VNESHNIJ_TEST, "sample-peer.json"), JSON.stringify({ ...OBRAZEC_D, oknoSvodki: null }));
// RU: Поднимает модуль подпроцессом и возвращает то, что он ВЫДАЛ наружу (экспорт), а не то, что напечатал.
// EN: Starts the module in a subprocess and returns what it HANDED OUT (exports), not what it printed.
function podnyat(okruzhenie, katalog = KATALOG) {
  const kod = `import('${pathS.join(katalog, "index.mjs")}').then(m => {
    process.stdout.write(JSON.stringify({ ist: m.ISTOCHNIKI, okno: m.OKNO_MODELI,
      model: m.KOMPAKT_MODEL, hvost: m.KOMPAKT_HVOST, adres: m.KOMPAKT_ADRES, imena: m.IMENA_KLYUCHA }));
  })`;
  const env = { ...process.env, KOMPAKT_NASTROJKI_KATALOG: VNESHNIJ_TEST, ...okruzhenie };
  for (const k of Object.keys(okruzhenie)) if (okruzhenie[k] === undefined) delete env[k];
  const out = execFileSync(process.execPath, ["-e", kod], { env, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

proba("1 исправное: настройка агента прочтена → ИСТОЧНИК «настройка» у всех пяти", () => {
  const r = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_MODEL: undefined, KOMPAKT_HVOST: undefined,
                      KOMPAKT_OKNO_MODELI: undefined, KOMPAKT_ADRES: undefined });
  for (const k of ["model", "hvost", "okno", "adres", "imena"]) {
    // RU: Окно модели сводки в рабочей настройке ещё может лежать под старым именем oknoModeli — тогда источник
    //     «настройка — oknoModeli, устарело».
    // EN: The summary-model window may still sit under the old name oknoModeli in production settings — then
    //     the source reads "настройка — oknoModeli, устарело" (settings — oknoModeli, obsolete).
    if (k === "okno" ? !String(r.ist[k]).startsWith("настройка") : r.ist[k] !== "настройка") throw new Error(k + " взят не из настройки: " + r.ist[k]);
  }
});

proba("2 порча: имя агента НЕ ЗАДАНО → те же ЗНАЧЕНИЯ, но источник «умолчание модуля»", () => {
  const bez = podnyat({ KOMPAKT_AGENT: undefined, KOMPAKT_MODEL: undefined, KOMPAKT_HVOST: undefined,
                        KOMPAKT_OKNO_MODELI: undefined, KOMPAKT_ADRES: undefined });
  const s = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_MODEL: undefined, KOMPAKT_HVOST: undefined,
                      KOMPAKT_OKNO_MODELI: undefined, KOMPAKT_ADRES: undefined });
  // RU: Половина, ради которой стенд и написан: значения СОВПАДАЮТ, а исходы РАЗНЫЕ.
  // EN: The half the stand exists for: the values are EQUAL, the outcomes DIFFER.
  if (bez.model !== s.model || bez.hvost !== s.hvost) throw new Error("значения разошлись — проба ниже потеряет смысл");
  if (bez.ist.model !== "умолчание модуля") throw new Error("источник не назван: " + bez.ist.model);
  if (bez.ist.hvost !== "умолчание модуля") throw new Error("источник хвоста: " + bez.ist.hvost);
});

proba("3 снятие порчи: снова с именем агента → источник «настройка», как в пробе 1", () => {
  const r = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_MODEL: undefined, KOMPAKT_OKNO_MODELI: undefined });
  if (r.ist.model !== "настройка") throw new Error("не вернулось: " + r.ist.model);
});

proba("4 окружение СТАРШЕ файла и говорит об этом", () => {
  const r = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_MODEL: "proba-modeli" });
  if (r.model !== "proba-modeli") throw new Error("окружение не перебило: " + r.model);
  if (r.ist.model !== "окружение KOMPAKT_MODEL") throw new Error("источник неверен: " + r.ist.model);
});

proba("5 ПИТАНИЕ БЮДЖЕТА: oknoSvodki из настройки доезжает до OKNO_MODELI (ворота приёмщика; поле — правило внешнего бюджета)", () => {
  const vremennyj = vremennyjKatalog(pathS.join(osS.tmpdir(), "stend-istochnikov-"));
  try {
    for (const f of ["index.mjs", "porogi.mjs", "tekstovye-nastrojki.mjs", "promt-svodki.txt"]) fsS.copyFileSync(pathS.join(KATALOG, f), pathS.join(vremennyj, f));
    fsS.mkdirSync(pathS.join(vremennyj, "agenty"));
    const n = { ...OBRAZEC_D };
    delete n.oknoModeli; n.oknoSvodki = 500000;
    fsS.writeFileSync(pathS.join(vremennyj, "agenty", "sample-agent.json"), JSON.stringify(n, null, 2));
    const r = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_OKNO_MODELI: undefined, KOMPAKT_NASTROJKI_KATALOG: pathS.join(vremennyj, "agenty") }, vremennyj);
    if (r.okno !== 500000) throw new Error("окно НЕ доехало до расчёта бюджета: " + r.okno);
    if (r.ist.okno !== "настройка") throw new Error("источник окна: " + r.ist.okno);
  } finally { fsS.rmSync(vremennyj, { recursive: true, force: true }); }
});

// RU: Число умолчания из этой пробы убрано намеренно. Проба держала 1 048 576 и покраснела, когда умолчание
//     стало общим (одно поле — одно число). Предмет пробы — «null назван вслух и подставлено умолчание МОДУЛЯ»,
//     а не конкретная величина: величина живёт в index.mjs с обоснованием, и стенд, повторяющий её у себя,
//     завёл бы второе место правды. Базовое число берётся ЗАМЕРОМ — тем же модулем при полностью не заданной
//     настройке.
// EN: The default number was removed from this probe on purpose. The probe held 1,048,576 and turned red when
//     the default became shared (one field — one number). The subject of the probe is "null is named explicitly
//     and the MODULE default is used", not a specific value: the value lives in index.mjs with its rationale,
//     and a stand repeating it would create a second source of truth. The base number is obtained by
//     MEASUREMENT — from the same module with settings completely absent.
proba("6 oknoModeli: null в файле — ОСОЗНАННОЕ «у меня своего нет», а не пропуск", () => {
  const bezNastrojki = podnyat({ KOMPAKT_AGENT: undefined, KOMPAKT_OKNO_MODELI: undefined });
  const r = podnyat({ KOMPAKT_AGENT: "sample-peer", KOMPAKT_OKNO_MODELI: undefined });
  if (r.okno !== bezNastrojki.okno)
    throw new Error(`умолчание не подставлено: при null ${r.okno}, а умолчание модуля ${bezNastrojki.okno}`);
  if (!r.ist.okno.includes("null")) throw new Error("null не назван вслух: " + r.ist.okno);
});

proba("8 контроль зрячести проб 1-3: подставной ответ с чужим источником ЛОВИТСЯ", () => {
  const podstavnoj = { ist: { model: "умолчание модуля" } };
  if (podstavnoj.ist.model === "настройка") throw new Error("сравнение слепо");
  const nastoyashchij = podnyat({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_MODEL: undefined });
  if (nastoyashchij.ist.model === podstavnoj.ist.model) throw new Error("проба не различает исходы");
});

// RU: ── Внешний каталог настроек ──
//     Зачем ловить stderr, а не значения: значения внешнего и встроенного файла могут СОВПАДАТЬ — тогда проба
//     по значению зелена при обоих исходах. Различитель живёт в формате строки: слово «ВНЕШНЯЯ» и путь. Тот же
//     довод, что у проб 1–3 выше.
// EN: ── External settings directory ──
//     Why capture stderr rather than values: external and built-in file values may COINCIDE — then a value
//     probe is green in both outcomes. The distinguisher lives in the line format: the word "ВНЕШНЯЯ"
//     (external) and the path. The same reasoning as for probes 1–3 above.
function stderrModulya(okruzhenie, dolzhenOtkazat = false) {
  const kod = `import('${pathS.join(KATALOG, "index.mjs")}').then(()=>{})`;
  const env = { ...process.env, ...okruzhenie };
  for (const k of Object.keys(okruzhenie)) if (okruzhenie[k] === undefined) delete env[k];
  const r = spawnSync(process.execPath, ["-e", kod], { env, encoding: "utf-8" });
  if (dolzhenOtkazat && r.status === 0) throw new Error("импорт принял отсутствующий/битый D");
  return (r.stderr || "");
}
const vremKat = vremennyjKatalog(pathS.join(osS.tmpdir(), "stend-vnesh-"));

proba("9 внешнего D НЕТ → отказ с именем и путём, не E", () => {
  const put = pathS.join(vremKat, "pusto");
  const e = stderrModulya({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: put }, true);
  if (!e.includes("sample-agent") || !e.includes(pathS.join(put, "sample-agent.json"))) throw new Error("отказ не назвал агента и D");
});

proba("10 внешний ЕСТЬ → источник «ВНЕШНЯЯ» и путь назван", () => {
  fsS.mkdirSync(pathS.join(vremKat, "agenty"), { recursive: true });
  const put = pathS.join(vremKat, "agenty", "sample-agent.json");
  fsS.writeFileSync(put, JSON.stringify({ dolyaPoroga: 0.55 }));
  const e = stderrModulya({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: pathS.join(vremKat, "agenty") });
  if (!/настройка агента sample-agent: ВНЕШНЯЯ/.test(e)) throw new Error("нет строки «ВНЕШНЯЯ»");
  if (!e.includes(put)) throw new Error("путь внешнего файла не назван");
});

proba("11 внешний УБРАН → отказ, ВОЗВРАЩЁН → снова ВНЕШНЯЯ", () => {
  const put = pathS.join(vremKat, "agenty", "sample-agent.json");
  const before = fsS.readFileSync(put);
  fsS.unlinkSync(put);
  const e = stderrModulya({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: pathS.dirname(put) }, true);
  if (!e.includes(put)) throw new Error("отказ не назвал D");
  fsS.writeFileSync(put, before);
  const ok = stderrModulya({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: pathS.dirname(put) });
  if (!ok.includes("настройка агента sample-agent: ВНЕШНЯЯ")) throw new Error("возврат D не восстановил чтение");
});

proba("12 внешний БИТЫЙ → ИМЕНОВАННЫЙ отказ с путём, а не тихий откат", () => {
  const put = pathS.join(vremKat, "agenty", "sample-agent.json");
  fsS.writeFileSync(put, "{битый");
  const e = stderrModulya({ KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: pathS.join(vremKat, "agenty") }, true);
  if (!/ВНЕШНЯЯ настройка sample-agent НЕ РАЗОБРАНА/.test(e)) throw new Error("нет именованного отказа");
  if (!e.includes(put)) throw new Error("путь в отказе не назван");
  if (/настройка агента sample-agent: В ПАКЕТЕ/.test(e)) throw new Error("ТИХИЙ ОТКАТ к пакетной — этого не должно быть");
  fsS.unlinkSync(put);
});

proba("13 имя с обходом каталога → отказ; контроль зрячести: годное имя проходит", () => {
  const plohoe = stderrModulya({ KOMPAKT_AGENT: "../../../etc/passwd", KOMPAKT_NASTROJKI_KATALOG: pathS.join(vremKat, "agenty") });
  if (!/имя агента НЕГОДНО/.test(plohoe)) throw new Error("обход каталога НЕ отклонён");
  const horoshee = stderrModulya({ KOMPAKT_AGENT: "sample-worker", KOMPAKT_NASTROJKI_KATALOG: pathS.join(vremKat, "agenty") });
  if (/имя агента НЕГОДНО/.test(horoshee)) throw new Error("проба слепа: годное имя тоже отклонено");
});

fsS.rmSync(vremKat, { recursive: true, force: true });

console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
