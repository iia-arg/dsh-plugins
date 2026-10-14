// RU: Рамка стенограммы и след отказа. Судим РАБОЧИЙ путь — svodkaNashejModelyu с подставным провайдером. Сети
//     не трогает: globalThis.fetch подменён, ключ подставной задан явно. Каталог следа — временный, свой.
// EN: Transcript frame and refusal trace. We judge the PRODUCTION path — svodkaNashejModelyu with a fake
//     provider. No network: globalThis.fetch is replaced, the fake key is set explicitly. The trace directory
//     is a temporary one of its own.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
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
process.env.KOMPAKT_API_KEY = "podstavnoj-klyuch-stenda-naruzhu-ne-uhodit"; // vorota-ob:dopusk=TOKEN
const KAT = vremennyj(path.join(os.tmpdir(), "stend-otkaza-"));
process.env.KOMPAKT_OTKAZY = path.join(KAT, "otkazy");
process.env.KOMPAKT_UDACHI = path.join(KAT, "udachi");
// RU: Своё размещение компакта, а не файл машины /etc/memory-compaction/deployment.json: его promptSubstitutions
//     (roleClarification и др.) подменяют умолчания, которые судят пробы (B-N-1588: п.7 краснел на sadik). Пустое = умолчания.
// EN: Own compaction placement, not the machine file /etc/memory-compaction/deployment.json: its promptSubstitutions
//     (roleClarification etc.) replace the defaults the probes judge (B-N-1588: probe 7 was red on sadik). Empty = defaults.
process.env.KOMPAKT_RAZMESCHENIE = path.join(KAT, "razmeshchenie.json"); fs.writeFileSync(process.env.KOMPAKT_RAZMESCHENIE, "{}");
const { svodkaNashejModelyu } = await import("./index.mjs");
let vsego = 0, proshlo = 0;
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); } catch (e) { console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 200)); } };
let zapros = null;
const otvet = (content) => { globalThis.fetch = async (a, o) => { zapros = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" }; }; };
const tiho = async (f) => { const l = console.log, s = []; console.log = (...a) => s.push(a.join(" ")); try { try { return { r: await f(), s }; } catch (e) { return { e: String(e?.message ?? e), s }; } } finally { console.log = l; } };
const STEN = "### Пользователь\nнаряд\n\n### Я\nБеру. Первым делом сверяю";
const faily = () => fs.existsSync(process.env.KOMPAKT_OTKAZY) ? fs.readdirSync(process.env.KOMPAKT_OTKAZY).sort() : [];

await proba("1 РАМКА: стенограмма внутри рамки, ровно один раз; в конце маркер и договор", async () => {
  otvet("[MODE=ACTIVE]\n\nсводка"); await tiho(() => svodkaNashejModelyu(STEN));
  const u = zapros?.messages?.[1]?.content ?? "";
  if (!u.startsWith("СТЕНОГРАММА ДЛЯ СВОДКИ")) throw new Error("начало рамки не то: " + JSON.stringify(u.slice(0, 40)));
  if (u.split(STEN).length !== 2) throw new Error("стенограмма не ровно один раз");
  if (!u.includes("↓↓↓ САМЫЕ ПОСЛЕДНИЕ ↓↓↓") || !/\[MODE=ACTIVE\] или \[MODE=DIALOG\]\.\s*$/.test(u)) throw new Error("конец рамки не тот: " + JSON.stringify(u.slice(-80)));
  if (u.includes("{{STENOGRAMMA}}")) throw new Error("место вставки осталось в запросе");
});
await proba("2 ОТКАЗ ОСТАВЛЯЕТ СЛЕД: вход = ушедший запрос, ответ = отвергнутый; права 700/600", async () => {
  otvet("# Ответ от лица агента\nпродолжаю работу"); const x = await tiho(() => svodkaNashejModelyu(STEN));
  if (!x.e || !x.e.includes("договор промта")) throw new Error("отвергнутый ответ принят: " + (x.e ?? "без отказа"));
  const f = faily(); if (f.length !== 2) throw new Error("файлов следа " + f.length + ", ждала 2");
  const vh = fs.readFileSync(path.join(process.env.KOMPAKT_OTKAZY, f.find((n) => n.endsWith("-vhod.txt"))), "utf8");
  const ot = fs.readFileSync(path.join(process.env.KOMPAKT_OTKAZY, f.find((n) => n.endsWith("-otvet.txt"))), "utf8");
  if (vh !== zapros.messages[1].content) throw new Error("вход в следе ≠ ушедшему запросу");
  if (ot !== "# Ответ от лица агента\nпродолжаю работу") throw new Error("ответ в следе не тот");
  const pk = (fs.statSync(process.env.KOMPAKT_OTKAZY).mode & 0o777).toString(8), pf = (fs.statSync(path.join(process.env.KOMPAKT_OTKAZY, f[0])).mode & 0o777).toString(8);
  if (pk !== "700" || pf !== "600") throw new Error(`права ${pk}/${pf}, ждала 700/600`);
  if (!x.s.some((l) => l.includes("след «отказ» сохранён"))) throw new Error("строки «след «отказ» сохранён» нет");
});
await proba("3 ПРЕДЕЛ СЛЕДА: 25 отказов → хранится 20 пар", async () => {
  for (let i = 0; i < 25; i++) { otvet("# агент " + i); await tiho(() => svodkaNashejModelyu(STEN)); await new Promise((r) => setTimeout(r, 2)); }
  const f = faily(); if (f.length !== 40) throw new Error("файлов " + f.length + ", ждала 40");
});
await proba("4 НЕТ ФАЙЛА РАМКИ — ОТКАЗ, запроса нет", async () => {
  process.env.KOMPAKT_RAMKA = path.join(KAT, "net-takoj-ramki.txt"); zapros = null; otvet("[MODE=ACTIVE]\n\nсводка");
  const x = await tiho(() => svodkaNashejModelyu(STEN)); delete process.env.KOMPAKT_RAMKA;
  if (!x.e || !x.e.includes("рамка стенограммы не найдена")) throw new Error("без рамки не отказ: " + (x.e ?? "принято"));
  if (zapros) throw new Error("запрос ушёл без рамки");
});
await proba("5 СЛЕД НЕ СОХРАНИЛСЯ — отказ прежний, строка предупреждения, сводка не падает иначе", async () => {
  const bylo = process.env.KOMPAKT_OTKAZY; process.env.KOMPAKT_OTKAZY = path.join(KAT, "fajl-a-ne-katalog"); fs.writeFileSync(process.env.KOMPAKT_OTKAZY, "x");
  otvet("# агент"); const x = await tiho(() => svodkaNashejModelyu(STEN)); process.env.KOMPAKT_OTKAZY = bylo;
  if (!x.e || !x.e.includes("договор промта")) throw new Error("причина отказа подменена: " + (x.e ?? "без отказа"));
  if (!x.s.some((l) => l.includes("след «отказ» НЕ сохранён"))) throw new Error("строки «след «отказ» НЕ сохранён» нет");
});
await proba("6 РАМКА И ПРОМТ ГОВОРЯТ ОДНО: маркер после стенограммы, последние сообщения прямо над ним — и промт велит так же", async () => {
  // RU: Собранный вход печатью, без модели: то, что реально уходит, — system и user из подставного запроса.
  // EN: The assembled input printed, without a model: what really goes out — system and user from the fake
  //     request.
  otvet("[MODE=ACTIVE]\n\nсводка"); zapros = null; await tiho(() => svodkaNashejModelyu(STEN));
  const sis = zapros?.messages?.[0]?.content ?? "", u = zapros?.messages?.[1]?.content ?? "";
  const M = "↓↓↓ САМЫЕ ПОСЛЕДНИЕ ↓↓↓";
  const iM = u.indexOf(M), iSten = u.indexOf(STEN);
  if (iM < 0 || iSten < 0) throw new Error("в запросе нет маркера или стенограммы");
  const mezhdu = u.slice(iSten + STEN.length, iM).trim();
  if (iM < iSten || mezhdu !== ">>> КОНЕЦ СТЕНОГРАММЫ") throw new Error("над маркером не последние сообщения: " + JSON.stringify(mezhdu.slice(0, 60)));
  if (!sis.includes("после ХВОСТА, если хвост передан, иначе сразу ПОСЛЕ стенограммы") || !sis.includes("непосредственно НАД ним")) throw new Error("промт не говорит «маркер в конце переданного текста, последние над ним»");
  if (sis.includes("в блоке «" + M + "»") || sis.includes("помечен маркером в конце transcript")) throw new Error("в промте осталась прежняя формулировка: маркер — заголовок блока");
  // RU: Состояние — «на конец стенограммы», «делать первым» — с оговоркой; одно и то же в рамке и в промте.
  // EN: State is "as of the end of the transcript", "do first" comes with a caveat; the same in the frame and
  //     the prompt.
  const OG = "могло устареть: после стенограммы агент продолжал работу, та часть у него несжатой";
  if (!u.includes("НА КОНЕЦ СТЕНОГРАММЫ") || !u.includes(OG)) throw new Error("рамка не говорит «на конец стенограммы» с оговоркой");
  if (!sis.includes("📌 TL;DR — состояние на конец переданного текста") || !sis.includes("иначе — на конец стенограммы") || !sis.includes("Если хвоста нет — первой строкой блока оговорка «" + OG + "»")) throw new Error("промт не говорит «на конец стенограммы» с оговоркой для случая без хвоста");
  if (sis.includes("в момент компакта")) throw new Error("в промте осталось «в момент компакта»");
});
await proba("7 РОЛИ В РАМКЕ: «Главная» — агент-координатор на узле управления; кто есть кто — только из стенограммы", async () => {
  otvet("[MODE=ACTIVE]\n\nсводка"); zapros = null; await tiho(() => svodkaNashejModelyu(STEN));
  const u = zapros?.messages?.[1]?.content ?? "";
  if (!u.includes("«Главная» в письмах — агент-координатор на узле управления (не локальный координатор и не агент рабочего узла)")) throw new Error("строки о ролях нет");
  if (!u.includes("кто есть кто — только из стенограммы, не выводи")) throw new Error("запрета выводить роли нет");
});
const udachi = () => fs.existsSync(process.env.KOMPAKT_UDACHI) ? fs.readdirSync(process.env.KOMPAKT_UDACHI).sort() : [];
await proba("8 УДАЧНАЯ СВОДКА ОСТАВЛЯЕТ ПАРУ: вход = ушедший запрос, сводка = принятая; 700/600", async () => {
  fs.rmSync(process.env.KOMPAKT_UDACHI, { recursive: true, force: true });
  otvet("# заголовок\n\n[MODE=ACTIVE]\n\nтело"); const x = await tiho(() => svodkaNashejModelyu(STEN));
  if (x.e) throw new Error("удачная сводка отвергнута: " + x.e);
  const f = udachi(); if (f.length !== 2) throw new Error("файлов удачи " + f.length + ", ждала 2");
  const vh = fs.readFileSync(path.join(process.env.KOMPAKT_UDACHI, f.find((n) => n.endsWith("-vhod.txt"))), "utf8");
  const ot = fs.readFileSync(path.join(process.env.KOMPAKT_UDACHI, f.find((n) => n.endsWith("-otvet.txt"))), "utf8");
  if (vh !== zapros.messages[1].content) throw new Error("вход в паре ≠ ушедшему запросу");
  if (ot !== x.r) throw new Error("сводка в паре ≠ принятой (после переноса метки)");
  const pk = (fs.statSync(process.env.KOMPAKT_UDACHI).mode & 0o777).toString(8), pf = (fs.statSync(path.join(process.env.KOMPAKT_UDACHI, f[0])).mode & 0o777).toString(8);
  if (pk !== "700" || pf !== "600") throw new Error(`права ${pk}/${pf}, ждала 700/600`);
  if (!x.s.some((l) => l.includes("след «удачная сводка» сохранён"))) throw new Error("строки о сохранении нет");
});
await proba("9 УДАЧИ: шестая вытесняет первую — хранится 5 пар", async () => {
  const pervaya = udachi()[0];
  // RU: Пауза ДО вызова: имя пары — штамп до миллисекунды, а флаг wx честно не перезаписывает совпавшее имя.
  // EN: Pause BEFORE the call: the pair name is a millisecond timestamp, and the wx flag honestly refuses to
  //     overwrite a colliding name.
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 2)); otvet("[MODE=ACTIVE]\n\nсводка " + i); await tiho(() => svodkaNashejModelyu(STEN)); }
  const f = udachi(); if (f.length !== 10) throw new Error("файлов " + f.length + ", ждала 10");
  if (f.includes(pervaya)) throw new Error("первая пара не вытеснена");
});
await proba("10 УДАЧА НЕ СОХРАНИЛАСЬ — сводка всё равно отдана, строка предупреждения", async () => {
  const bylo = process.env.KOMPAKT_UDACHI; process.env.KOMPAKT_UDACHI = path.join(KAT, "udachi-fajl"); fs.writeFileSync(process.env.KOMPAKT_UDACHI, "x");
  otvet("[MODE=ACTIVE]\n\nсводка"); const x = await tiho(() => svodkaNashejModelyu(STEN)); process.env.KOMPAKT_UDACHI = bylo;
  if (x.e || x.r !== "[MODE=ACTIVE]\n\nсводка") throw new Error("сводка пострадала: " + (x.e ?? JSON.stringify(x.r)));
  if (!x.s.some((l) => l.includes("след «удачная сводка» НЕ сохранён"))) throw new Error("строки предупреждения нет");
});
const HV = "### Пользователь\nхвост-письмо\n\n### Я\nхвост-ответ";
await proba("11 С ХВОСТОМ РАМКА И ПРОМТ ГОВОРЯТ ОДНО: стенограмма → хвост → маркер; «на конец хвоста»; хвост не пересказывать", async () => {
  otvet("[MODE=ACTIVE]\n\nсводка"); zapros = null; await tiho(() => svodkaNashejModelyu(STEN, HV));
  const sis = zapros?.messages?.[0]?.content ?? "", u = zapros?.messages?.[1]?.content ?? "", M = "↓↓↓ САМЫЕ ПОСЛЕДНИЕ ↓↓↓";
  const iS = u.indexOf(STEN), iH = u.indexOf(HV), iM = u.indexOf(M);
  if (iS < 0 || iH < 0 || iM < 0 || !(iS < iH && iH < iM)) throw new Error("порядок не «стенограмма → хвост → маркер»");
  if (u.slice(iH + HV.length, iM).trim() !== ">>> КОНЕЦ ХВОСТА") throw new Error("над маркером не конец хвоста");
  if (u.split(HV).length !== 2 || u.split(STEN).length !== 2) throw new Error("стенограмма или хвост не ровно один раз");
  if (!u.includes("НА КОНЕЦ ХВОСТА") || !u.includes("НЕ пересказывай его")) throw new Error("рамка хвоста не говорит «на конец хвоста» / «не пересказывай»");
  if (!sis.includes("после ХВОСТА, если хвост передан") || !sis.includes("НЕ пересказывай его") || !sis.includes("на конец хвоста, если он передан")) throw new Error("промт не говорит того же о хвосте");
  if (u.includes("{{HVOST}}") || u.includes("{{STENOGRAMMA}}")) throw new Error("место вставки осталось");
});
await proba("12 НЕТ ФАЙЛА РАМКИ ХВОСТА — ОТКАЗ, запроса нет", async () => {
  process.env.KOMPAKT_RAMKA_HVOST = path.join(KAT, "net-ramki-hvosta.txt"); zapros = null; otvet("[MODE=ACTIVE]\n\nсводка");
  const x = await tiho(() => svodkaNashejModelyu(STEN, HV)); delete process.env.KOMPAKT_RAMKA_HVOST;
  if (!x.e || !x.e.includes("рамка стенограммы не найдена")) throw new Error("без рамки хвоста не отказ: " + (x.e ?? "принято"));
  if (zapros) throw new Error("запрос ушёл");
});
await proba("13 ХВОСТ В СЧЁТЕ ОКНА: строка бюджета считает знаки с хвостом", async () => {
  otvet("[MODE=ACTIVE]\n\nсводка"); const a = await tiho(() => svodkaNashejModelyu(STEN)); const b = await tiho(() => svodkaNashejModelyu(STEN, HV));
  const zn = (x) => Number((x.s.find((l) => l.includes("бюджет вызова")) ?? "").match(/\((\d+) зн\.\)/)?.[1]);
  if (!(zn(b) - zn(a) >= HV.length)) throw new Error(`знаков без хвоста ${zn(a)}, с хвостом ${zn(b)} — хвост не в счёте`);
});
fs.rmSync(KAT, { recursive: true, force: true });
console.log(`стенд рамки и следа отказа: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
