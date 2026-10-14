// RU: Стенд стыка restore и ядра проверяет pomoshchnikYadra через ctx.get без inject и svodkaNaPoverhnosti на формах DSH 0.1.1/0.2.0. Коды 0 — совпало, 1 — расхождение, 2 — проверка не состоялась.
// EN: The restore/core integration test checks pomoshchnikYadra via ctx.get without inject and svodkaNaPoverhnosti with DSH 0.1.1/0.2.0 formats. Exit codes: 0 matches, 1 mismatch, 2 the check could not run.
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
// RU: Настоящий apply соседнего ядра грузится по каталогу на подставном ctx. Нет пакета или помощника — код 2, не успешная сверка.
// EN: Load the actual neighboring core apply by directory on a fake ctx. A missing package or helper yields 2, not successful agreement.
async function sluzhbaYadra() {
  const yadro = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "dsh-pamyat-core", "src", "index.js")
  if (!existsSync(yadro)) { console.log(`СЛЕПОТА: соседнего ядра нет (${yadro})`); process.exit(2) }
  const { apply } = await zagruzit(pathToFileURL(yadro).href)
  const kat = mkdtempSync(join(tmpdir(), "styk-sobytij-")); process.on("exit", () => rmSync(kat, { recursive: true, force: true }))
  const s = {}; apply({ provide(i, o) { s[i] = o }, on() {}, logger: { error() {} } }, { putBazy: join(kat, "s.db"), agent: "stend" })
  if (typeof s.pamyat?.sobytiyaSessii !== "function") { console.log("СЛЕПОТА: в соседнем ядре нет помощника событий (ядро старше integration-note) — ядро и потребитель ставятся одним окном"); process.exit(2) }
  return s.pamyat
}
let ok = 0, bad = 0
const proba = (imya, poluchili, zhdali) => { const r = JSON.stringify(poluchili) === JSON.stringify(zhdali); r ? ok++ : bad++
  console.log(`${r ? "ок " : "КРАСНОЕ"} ${imya}: получили ${JSON.stringify(poluchili)}, ждали ${JSON.stringify(zhdali)}`) }
const s011 = (ev) => ({ id: "S", events: ev })
const s020 = (ev) => ({ id: "S", snapshotEvents: () => Object.freeze([...ev]) })
const zagruzit = async (u) => { try { return await import(u) } catch (e) { console.log(`СЛЕПОТА: предмет не загрузился (${e?.code ?? "ошибка"}: ${String(e?.message ?? e).slice(0, 120)}) — у получателя без node_modules это честная слепота`); process.exit(2) } }
const R = await zagruzit(new URL("../src/index.js", import.meta.url).href)
const svodka = (source) => [{ type: "turn/end", seq: 0, data: {} }, { type: "user/message", seq: 1, data: { source, content: [{ type: "text", text: "ИТОГ СВОДКИ" }] } }]
const s = (sess) => Object.assign(sess, { surface: { nodes: [1] }, deriveEventMessage: (e) => e.data })
const skazano = []
proba("ядра нет — null и одна строка вслух", [R.pomoshchnikYadra({ get: () => undefined }, (t) => skazano.push(t)), skazano.length], [null, 1])
R.pomoshchnikYadra({ get: () => undefined }, (t) => skazano.push(t))
proba("повтор без ядра — строка не повторяется", skazano.length, 1)
proba("без помощника: 0.1.1 {plugin, compact} — сводка на поверхности", R.svodkaNaPoverhnosti(s(s011(svodka({ kind: "plugin", plugin: "compact" }))), "ИТОГ СВОДКИ"), true)
proba("без помощника: 0.2.0 — прочитать нельзя (прежнее)", R.svodkaNaPoverhnosti(s(s020(svodka({ kind: "compact-checkpoint" }))), "ИТОГ СВОДКИ"), null)
const pm = await sluzhbaYadra()
const PODKL = "помощник событий ядра подключён (sobytiyaSessii)", podkl = (m) => m.filter((t) => t.includes(PODKL)).length
proba("без помощника: «подключён» 0 (сказано только «не найден»)", [podkl(skazano), skazano.filter((t) => t.includes("не найден")).length], [0, 1])
const skazanoPm = [], ctxPm = { get: (i) => (i === "pamyat" ? pm : undefined) }
proba("ctx.get('pamyat') со службой ядра — помощник и одна строка «подключён»", [R.pomoshchnikYadra(ctxPm, (t) => skazanoPm.push(t)) === pm, podkl(skazanoPm), skazanoPm.length], [true, 1, 1])
R.pomoshchnikYadra(ctxPm, (t) => skazanoPm.push(t))
proba("повтор со службой — «подключён» не повторяется", skazanoPm.length, 1)
proba("0.1.1 {plugin, compact} — сводка на поверхности", R.svodkaNaPoverhnosti(s(s011(svodka({ kind: "plugin", plugin: "compact" }))), "ИТОГ СВОДКИ", pm), true)
proba("0.2.0 compact-checkpoint через snapshotEvents — сводка на поверхности", R.svodkaNaPoverhnosti(s(s020(svodka({ kind: "compact-checkpoint" }))), "ИТОГ СВОДКИ", pm), true)
proba("0.2.0 чужое сообщение — сводки нет", R.svodkaNaPoverhnosti(s(s020(svodka({ kind: "user" }))), "ИТОГ СВОДКИ", pm), false)
proba("журнала нет — null (прочитать нельзя)", R.svodkaNaPoverhnosti(s({ id: "S" }), "ИТОГ СВОДКИ", pm), null)
console.log(`\nstend-styka-sobytij (restore): ok=${ok} FAIL=${bad}`); process.exit(bad === 0 ? 0 : 1)
