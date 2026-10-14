// RU: Рабочий путь сводки: проверяется не функция, а то, что её ЗОВУТ. Стенд заведён после проверки, в которой
//     вызов strokiRashoda закомментировали в рабочем пути — и ни один из стендов пакета не покраснел. «Функция
//     верна» ≠ «функция вызывается».
//     Сети не трогает и денег не тратит: globalThis.fetch подменён. Платный прогон не разрешён, поэтому адрес и
//     модель проверяются по ТЕЛУ запроса, а не по ответу провайдера.
//     Ключ подставной задаётся ЯВНО: иначе модуль взял бы настоящий из окружения и положил его в подставной
//     запрос — наружу он не уйдёт, но лежать ему там незачем.
// EN: The production summary path: what is checked is not the function but that it is CALLED. The stand was
//     added after a check in which the strokiRashoda call was commented out in the production path — and not a
//     single stand of the package turned red. "The function is correct" ≠ "the function is called".
//     No network and no money: globalThis.fetch is replaced. A paid run is not allowed, so the endpoint and
//     model are checked from the request BODY, not from a provider response.
//     The fake key is set EXPLICITLY: otherwise the module would take the real one from the environment and put
//     it into the fake request — it would not leave the machine, but it has no business being there.
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
import { svodkaNashejModelyu, KOMPAKT_ADRES, KOMPAKT_MODEL } from "./index.mjs";

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  return Promise.resolve().then(f).then((v) => { if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); proshlo++; console.log("  ✅ " + imya); })
    .catch((e) => console.log("  ❌ " + imya + " — " + String(e?.message ?? e).slice(0, 170)));
};

// RU: Подставной провайдер: запоминает, КУДА и С ЧЕМ ушёл запрос, и отдаёт заданное тело.
// EN: Fake provider: records WHERE and WITH WHAT the request went and returns the given body.
function podstavnoj(telo) {
  const sled = { zvali: 0, adres: null, zapros: null };
  globalThis.fetch = async (adres, opt) => {
    sled.zvali++; sled.adres = adres; sled.zapros = JSON.parse(opt.body);
    return { ok: true, status: 200, json: async () => telo, text: async () => "" };
  };
  return sled;
}
// RU: Перехват печати: судим по тому, что вышло наружу, а не по чтению кода.
// EN: Output capture: we judge by what was actually printed, not by reading the code.
async function sobratPechat(f) {
  const bylo = console.log, stroki = [];
  console.log = (...a) => stroki.push(a.join(" "));
  try { await f(); } finally { console.log = bylo; }
  return stroki;
}
// RU: Сводка обязана начинаться строкой [MODE=…] и иметь тело — иначе барьер отвергает ответ. Подставной ответ
//     раньше этого не нёс, и часть проб краснела не по своему предмету.
// EN: A summary must start with a [MODE=…] line and have a body — otherwise the barrier rejects the answer. The
//     fake answer used not to carry it, and some probes turned red for an unrelated reason.
const OTVET = (usage) => ({ choices: [{ message: { content: "[MODE=ACTIVE]\nподставная сводка" } }], ...(usage ? { usage } : {}) });

await proba("1 БОЕВОЙ ПУТЬ ПЕЧАТАЕТ РАСХОД: числа подставного ответа выходят наружу", async () => {
  const sled = podstavnoj(OTVET({ prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 }));
  const stroki = await sobratPechat(() => svodkaNashejModelyu("проза для сводки"));
  if (!sled.zvali) throw new Error("подставной провайдер не вызван — проба слепа, а не предмет цел");
  const rashod = stroki.find((s) => s.includes("расход, ТОКЕНЫ"));
  if (!rashod) throw new Error("строки расхода НЕТ: вызов из боевого пути потерян. Напечатано: " + stroki.join(" | ").slice(0, 120));
  for (const n of ["1200", "300", "1500"]) if (!rashod.includes(n)) throw new Error("нет " + n + ": " + rashod);
});

await proba("2 БОЕВОЙ ПУТЬ при ответе БЕЗ usage: «НЕ СООБЩЁН», а не молчание и не ноль", async () => {
  podstavnoj(OTVET(null));
  const stroki = await sobratPechat(() => svodkaNashejModelyu("проза"));
  const s = stroki.find((x) => x.includes("расход"));
  if (!s) throw new Error("о расходе не сказано ничего — молчание вернулось");
  if (!s.includes("НЕ СООБЩЁН")) throw new Error("исход не назван: " + s);
});

await proba("3 РАСХОД ПЕЧАТАЕТСЯ И ПРИ ПУСТОЙ СВОДКЕ: цена уплачена, отказ идёт ПОСЛЕ", async () => {
  podstavnoj({ choices: [{ message: { content: "   " } }], usage: { prompt_tokens: 900, completion_tokens: 0, total_tokens: 900 } });
  let upal = false;
  const stroki = await sobratPechat(async () => {
    try { await svodkaNashejModelyu("проза"); } catch { upal = true; }
  });
  if (!upal) throw new Error("пустая сводка принята — отдельный дефект");
  const s = stroki.find((x) => x.includes("расход, ТОКЕНЫ"));
  if (!s || !s.includes("900")) throw new Error("за уплаченный пустой ответ расход не показан");
});

await proba("4 ЖИВОСТЬ adres и model БЕЗ СЕТИ: запрос ушёл на тот адрес и с той моделью", async () => {
  const sled = podstavnoj(OTVET({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }));
  await sobratPechat(() => svodkaNashejModelyu("проза"));
  if (sled.adres !== KOMPAKT_ADRES) throw new Error(`адрес запроса ${sled.adres} ≠ ${KOMPAKT_ADRES}`);
  if (sled.zapros.model !== KOMPAKT_MODEL) throw new Error(`модель ${sled.zapros.model} ≠ ${KOMPAKT_MODEL}`);
});

await proba("5 КОНТРОЛЬ ЗРЯЧЕСТИ ПРОБЫ 1: без подставного ответа расхода НЕ БЫВАЕТ", async () => {
  const sled = podstavnoj({ choices: [], usage: undefined });
  const stroki = await sobratPechat(async () => { try { await svodkaNashejModelyu("проза"); } catch {} });
  if (!sled.zvali) throw new Error("провайдер не звался");
  if (stroki.some((s) => /вход 1200/.test(s))) throw new Error("проба 1 видит числа, которых не подавали");
});

await proba("6 КЛЮЧ НАРУЖУ НЕ УХОДИТ ПОДЛИННЫЙ: в запросе стенда стоит подставной", async () => {
  const sled = podstavnoj(OTVET({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }));
  let zagolovki = null;
  const bylo = globalThis.fetch;
  globalThis.fetch = async (a, o) => { zagolovki = o.headers; return bylo(a, o); };
  await sobratPechat(() => svodkaNashejModelyu("проза"));
  if (!zagolovki?.authorization?.includes("podstavnoj")) throw new Error("в запросе не подставной ключ");
});

// RU: Строка о пороге печатается при ЗАГРУЗКЕ модуля — перехватом её не поймать, модуль уже импортирован выше.
//     Поэтому поднимаем дочерний процесс и читаем, что он сказал. Ожидание берётся из настройки, а не зашито:
//     иначе проба соврёт, когда настройку изменят.
//     Сверки двух порогов больше нет — доля одна, из пресета. Проба стережёт рабочий путь нового правила:
//     подъём печатает порог с источниками доли и окна (или 🔴 «НЕ ПРОЧИТАН» с причиной), а ручная копия
//     платформенного порога в настройку не вернулась.
// EN: The threshold line is printed at module LOAD — a capture cannot catch it, the module is already imported
//     above. So we start a child process and read what it said. The expectation comes from the settings, not
//     hard-coded: otherwise the probe would lie once the settings change.
//     There is no longer a reconciliation of two thresholds — there is one share, from the preset. The probe
//     guards the production path of the new rule: start-up prints the threshold with the sources of share and
//     window (or 🔴 "НЕ ПРОЧИТАН" — not read — with a reason), and the manual copy of the platform threshold has
//     not returned to the settings.
await proba("7 боевой путь порога: подъём с внешним D печатает порог ИЗ ПРЕСЕТА с источниками", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");
  const d = _mkd(_j(_tmp(), "stend-porog-D-"));
  writeFileSync(_j(d, "sample-agent.json"), "{}\n");
  let r;
  try {
    r = spawnSync(process.execPath, ["-e", 'import("./index.mjs").catch(e=>{console.error(e.message);process.exitCode=1})'], {
      cwd: new URL(".", import.meta.url).pathname,
      env: { ...process.env, KOMPAKT_AGENT: "sample-agent", KOMPAKT_NASTROJKI_KATALOG: d },
      encoding: "utf8", timeout: 20000,
    });
  } finally { _rm(d, { recursive: true, force: true }); }
  if (r.status !== 0) throw new Error("подъём с D отказал: " + r.stderr);
  const vyvod = String(r.stderr ?? "") + String(r.stdout ?? "");
  const stroka = (vyvod.match(/\[kompakt[^\]]*\] (🔴 )?порог (из пресета НЕ ПРОЧИТАН|\d+ = окно).*/) ?? [])[0] ?? "";
  if (!stroka) throw new Error("строки порога в выводе подъёма НЕТ вовсе");
  if (stroka.includes("НЕ ПРОЧИТАН")) { if (!/НЕ ПРОЧИТАН: \S/.test(stroka)) throw new Error("отказ без причины: " + stroka); return; }
  if (!stroka.includes("× доля") || !stroka.includes("(пресет ")) throw new Error("порог напечатан без источника доли: " + stroka);
  if (!/окно \d+ \((contextWindow|умолчание адаптера)/.test(stroka)) throw new Error("порог напечатан без источника окна: " + stroka);
});

console.log("  итог: " + proshlo + " из " + vsego);
process.exit(proshlo === vsego ? 0 : 1);
