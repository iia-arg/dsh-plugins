// RU: Проверяем стык настоящих функций секретаря со службой событий сессии ядра для форм DSH 0.1.1 и 0.2.0 из кода 0.2.0-rc.2. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test the boundary between real secretary functions and the core session-event service for DSH 0.1.1 and 0.2.0 shapes from 0.2.0-rc.2 code. Codes: 0 success, 1 mismatch, 2 unobservable.
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
// RU: Получаем службу настоящим apply соседнего dsh-pamyat-core на подставном ctx через путь каталога; импорт ядра по имени запрещён. Нет соседа или помощника — слепота с кодом 2.
// EN: Obtain the service through the adjacent dsh-pamyat-core’s real apply on a fake ctx using its directory path; named core imports are forbidden. A missing neighbor or helper means an unobservable test with code 2.
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
const D = await zagruzit(new URL("../src/distill-shov.js", import.meta.url).href)
const I = await zagruzit(new URL("../src/index.js", import.meta.url).href)
const um = (seq, source) => ({ type: "user/message", seq, data: { source } })
const ev011 = [um(0, { kind: "plugin", plugin: "compact" })]
// RU: Без помощника сохраняется прежнее поведение DSH 0.1.1.
// EN: Without the helper, retain previous DSH 0.1.1 behavior.
proba("без помощника: 0.1.1 events — тот же массив", D.chitatSobytiya(s011(ev011)) === ev011, true)
proba("без помощника: сводка 0.1.1 узнаётся", D.eSvodkaSzhatiya(ev011[0]), true)
proba("без помощника: 0.2.0 журнал не читается (прежнее)", D.chitatSobytiya(s020(ev011)), undefined)
proba("ctx.pamyat без полей — помощник не ставится", D.ustanovitPomoshchnikYadra({ zapisat() {} }), false)
const pm = await sluzhbaYadra()
proba("служба ядра — помощник ставится", D.ustanovitPomoshchnikYadra(pm), true)
proba("0.1.1 events — тот же массив", D.chitatSobytiya(s011(ev011)) === ev011, true)
proba("сводка 0.1.1 {plugin, compact}", D.eSvodkaSzhatiya(ev011[0]), true)
proba("сводка 0.2.0 compact-checkpoint", D.eSvodkaSzhatiya(um(1, { kind: "compact-checkpoint" })), true)
proba("вставка restore v4 plugin:dsh-pamyat-restore", D.eSvodkaSzhatiya(um(1, { kind: "plugin:dsh-pamyat-restore" })), true)
proba("речь человека — не сводка", D.eSvodkaSzhatiya(um(1, { kind: "user" })), false)
const svodki020 = [um(0, { kind: "compact-checkpoint" }), um(1, { kind: "plugin:dsh-pamyat-restore" })]
const krik = () => {}
proba("срез из сводок, сессия 0.2.0 — пропуск (integration-note)", I.propustitSrezSvodki(s020(svodki020), { shadowedSeqs: [0, 1] }, krik), true)
proba("срез из сводок, сессия 0.1.1 — пропуск", I.propustitSrezSvodki(s011(ev011), { shadowedSeqs: [0] }, krik), true)
proba("срез с речью человека, 0.2.0 — не пропуск", I.propustitSrezSvodki(s020([um(0, { kind: "user" })]), { shadowedSeqs: [0] }, krik), false)
// RU: Положительный признак подъёма читаем с console.error настоящего apply секретаря, как внешний потребитель строки.
// EN: Read the positive startup signal from real secretary apply’s console.error, as an external line consumer would.
const PODKL = "помощник событий ядра подключён (sobytiyaSessii)", NET = "помощник событий ядра не найден"
function podnyatSekretarya(pamyat) {
  const stroki = [], bylo = console.error; console.error = (...a) => stroki.push(a.join(" "))
  const kat = mkdtempSync(join(tmpdir(), "styk-podyom-"))
  try { I.apply({ pamyat, on: () => () => {}, plugin: () => {} }, { klass: "svodka-kompakcii", distillyaciya: false, putOtklonennyh: join(kat, "otkl") }) }
  finally { console.error = bylo; rmSync(kat, { recursive: true, force: true }) }
  const schet = (t) => stroki.filter((s) => s.includes(t)).length
  return [schet(PODKL), schet(NET)]
}
proba("подъём с помощником ядра: «подключён» 1, «не найден» 0", podnyatSekretarya(pm), [1, 0])
proba("подъём без помощника (ctx.pamyat старого ядра): «подключён» 0, «не найден» 1", podnyatSekretarya({ zapisat() {} }), [0, 1])
console.log(`\nstend-styka-sobytij (secretary): ok=${ok} FAIL=${bad}`); process.exit(bad === 0 ? 0 : 1)
