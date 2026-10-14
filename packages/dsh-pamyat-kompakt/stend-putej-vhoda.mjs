// RU: Пути ответа против входа. Однажды сводка назвала каталог, которого во входе не было — модель выдумала,
//     агент поверил. Стенд держит: путь в обратных кавычках без следа во входе ПОМЕЧАЕТСЯ (не удаляется),
//     честный — нет; нормализация «:N–M» и «<…>»; и главное — что оба рабочих выхода сводки ЗОВУТ проверку.
//     Сети не трогает и денег не тратит: globalThis.fetch подменён (образец — stend-boevogo-puti.mjs).
//     Чего не держит: выдуманные имена и задачи без пути механически не ловятся; их держит только правило
//     промта.
// EN: Answer paths versus input. Once a summary named a directory that was not in the input — the model
//     invented it, the agent believed it. The stand holds: a backticked path without a trace in the input is
//     MARKED (not deleted), an honest one is not; ":N–M" and "<…>" normalisation; and above all, that both
//     production summary outputs CALL the check.
//     No network and no money: globalThis.fetch is replaced (pattern: stend-boevogo-puti.mjs).
//     Not held: invented names and tasks without a path are not caught mechanically; only the prompt rule holds
//     them.
process.env.KOMPAKT_API_KEY = "podstavnoj-klyuch-stenda-naruzhu-ne-uhodit"; // vorota-ob:dopusk=TOKEN
import { mkdtempSync as _mkd, rmSync as _rm, writeFileSync as _w } from "node:fs"; import { tmpdir as _tmp } from "node:os"; import { join as _j } from "node:path";
const _k = _mkd(_j(_tmp(), "stend-putej-")); process.env.KOMPAKT_OTKAZY = _j(_k, "otkazy"); process.env.KOMPAKT_UDACHI = _j(_k, "udachi");
process.on("exit", () => _rm(_k, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
import { putiVneVhoda, pometitPutiVneVhoda, proveritPuti, POMETKA_NET_VO_VHODE, svodkaNashejModelyu } from "./index.mjs";

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  return Promise.resolve().then(f).then((v) => { if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '»'); proshlo++; console.log("  ✅ " + imya); })
    .catch((e) => console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 170)));
};
function podstavnoj(tekst) {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: tekst } }] }), text: async () => "" });
}
async function sobratPechat(f) {
  const bylo = console.log, stroki = []; console.log = (...a) => stroki.push(a.join(" "));
  try { return { rez: await f(), stroki }; } finally { console.log = bylo; }
}
// RU: Реальная строка из такой сводки, дословно.
// EN: A real line from such a summary, verbatim.
const FANTOM = "2. Задача «сверить хвост Кобзарь» (Sverka_Kobzar) — перенесена из прошлой сессии, незавершена (см. `Yuzhnyj_gruz/`): продолжить обзор и сведение направлений.";

console.log("СТЕНД ПУТЕЙ ОТВЕТА ПРОТИВ ВХОДА (проверка происхождения путей)");
await proba("1 ГЛАВНАЯ: живой фантом `Yuzhnyj_gruz/` без следа во входе ⇒ помечен, число 1", () => {
  const { tekst, net } = pometitPutiVneVhoda(FANTOM, "вход без этого каталога: /tmp/example-agent/workspace/kandidaty/проверка полноты сводки/");
  if (net.length !== 1 || net[0] !== "Yuzhnyj_gruz/") throw new Error("помечено " + JSON.stringify(net));
  if (!tekst.includes("`Yuzhnyj_gruz/` (" + POMETKA_NET_VO_VHODE + ")")) throw new Error("пометки рядом нет: " + tekst.slice(0, 120));
});
await proba("2 НЕ УДАЛЯЕТ: помеченный путь остаётся в тексте, прочее не тронуто", () => {
  const { tekst } = pometitPutiVneVhoda(FANTOM, "");
  if (tekst.replace(" (" + POMETKA_NET_VO_VHODE + ")", "") !== FANTOM) throw new Error("текст изменён сверх пометки");
});
await proba("3 честный путь (последний кусок есть во входе) ⇒ не помечен", () => {
  const { net, proveryeno } = putiVneVhoda("см. `/tmp/example-agent/pamyat/udachi-kompakta/`", "каталог udachi-kompakta лежит в доме");
  if (proveryeno !== 1 || net.length) throw new Error(`проверено ${proveryeno}, помечено ${JSON.stringify(net)}`);
});
await proba("4 нормализация: хвост «:75–93» снимается — `omega/server/mcp_server.py:75–93` при mcp_server.py во входе не помечен", () => {
  const { net } = putiVneVhoda("`omega/server/mcp_server.py:75–93`", "файл mcp_server.py, строки 75–93");
  if (net.length) throw new Error("помечено " + JSON.stringify(net));
});
await proba("5 заглушка «<…>» не путь: `/tmp/example-backups/<номер-наряда>/` не проверяется", () => {
  const { net, proveryeno } = putiVneVhoda("`/tmp/example-backups/<номер-наряда>/`", "");
  if (proveryeno !== 0 || net.length) throw new Error(`проверено ${proveryeno}, помечено ${JSON.stringify(net)}`);
});
await proba("6 не путь: пробел, стрелка, «/» не в пути (`a → b/c`, `1/2 проб`) ⇒ не проверяется", () => {
  const { proveryeno } = putiVneVhoda("`a → b/c` и `1/2 проб` и `sudo wc -l <файл`", "");
  if (proveryeno !== 0) throw new Error(`проверено ${proveryeno}`);
});
await proba("7 БОЕВОЙ ВЫХОД 1 (договор MODE в промте): сводка с фантомом ⇒ пометка в возвращённом тексте и строка журнала «НЕТ ВО ВХОДЕ 1»", async () => {
  podstavnoj("[MODE=ACTIVE]\n\n" + FANTOM);
  const { rez, stroki } = await sobratPechat(() => svodkaNashejModelyu("проза без каталога"));
  if (!rez.includes(POMETKA_NET_VO_VHODE)) throw new Error("пометки в возвращённой сводке нет");
  if (!stroki.some((s) => s.includes("пути ответа против входа") && s.includes("НЕТ ВО ВХОДЕ 1"))) throw new Error("строки журнала нет: " + stroki.join(" | ").slice(0, 150));
});
await proba("8 БОЕВОЙ ВЫХОД 1: путь есть в прозе ⇒ без пометки, в журнале «НЕТ ВО ВХОДЕ 0»", async () => {
  podstavnoj("[MODE=ACTIVE]\n\nсм. `Yuzhnyj_gruz/`");
  const { rez, stroki } = await sobratPechat(() => svodkaNashejModelyu("в прозе есть каталог Yuzhnyj_gruz"));
  if (rez.includes(POMETKA_NET_VO_VHODE)) throw new Error("честный путь помечен");
  if (!stroki.some((s) => s.includes("НЕТ ВО ВХОДЕ 0"))) throw new Error("строки журнала нет");
});
await proba("9 БОЕВОЙ ВЫХОД 2 (промт без договора MODE): фантом тоже помечен", async () => {
  const p = _j(_k, "promt-bez-mode.txt"); _w(p, "Сожми стенограмму в сводку.");
  const bylo = process.env.KOMPAKT_PROMT; process.env.KOMPAKT_PROMT = p;
  try {
    podstavnoj(FANTOM);
    const { rez, stroki } = await sobratPechat(() => svodkaNashejModelyu("проза без каталога"));
    if (!rez.includes(POMETKA_NET_VO_VHODE)) throw new Error("пометки во втором выходе нет");
    if (!stroki.some((s) => s.includes("НЕТ ВО ВХОДЕ 1"))) throw new Error("строки журнала нет");
  } finally { if (bylo === undefined) delete process.env.KOMPAKT_PROMT; else process.env.KOMPAKT_PROMT = bylo; }
});
await proba("10 ПРОВЕРКА УПАЛА (подставная ошибка) ⇒ сводка передана ЦЕЛОЙ, строка журнала «проверка путей упала»", async () => {
  const { rez, stroki } = await sobratPechat(async () => proveritPuti(FANTOM, "", () => { throw new Error("подставная ошибка стенда"); }));
  if (rez !== FANTOM) throw new Error("сводка изменена или потеряна: " + String(rez).slice(0, 80));
  if (!stroki.some((s) => s.includes("проверка путей упала") && s.includes("подставная ошибка стенда"))) throw new Error("строки о падении нет: " + stroki.join(" | ").slice(0, 120));
});

console.log("ИТОГ: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
