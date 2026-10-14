// RU: Изолированный стенд stend-styka-sobytij.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-styka-sobytij.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const zagruzit = async (u) => { try { return await import(u) } catch (e) { console.log(`СЛЕПОТА: предмет не загрузился (${e?.code ?? 'ошибка'}: ${String(e?.message ?? e).slice(0, 120)})`); process.exit(2) } }
const VREM = []; process.on('exit', () => { for (const k of VREM) rmSync(k, { recursive: true, force: true }) })
async function sluzhbaYadra() {
  const zdes = fileURLToPath(new URL('.', import.meta.url))
  const yadro = [join(zdes, '..', '..', 'dsh-pamyat-core', 'src', 'index.js'), join(zdes, '..', '..', 'node_modules', 'dsh-pamyat-core', 'src', 'index.js')].find(existsSync)
  if (!yadro) { console.log('СЛЕПОТА: соседнего ядра нет ни в дереве, ни в боевой раскладке'); process.exit(2) }
  const { apply } = await zagruzit(pathToFileURL(yadro).href)
  const kat = mkdtempSync(join(tmpdir(), 'styk-telegram-')); VREM.push(kat)
  const s = {}; apply({ provide(i, o) { s[i] = o }, on() {}, logger: { error() {} } }, { putBazy: join(kat, 's.db'), agent: 'stend' })
  if (typeof s.pamyat?.sobytiyaSessii !== 'function') { console.log('СЛЕПОТА: в соседнем ядре нет помощника событий (ядро старше regression-case) — ядро и потребитель ставятся одним окном'); process.exit(2) }
  return s.pamyat
}
let ok = 0, bad = 0
const proba = (imya, poluchili, zhdali) => { const r = JSON.stringify(poluchili) === JSON.stringify(zhdali); r ? ok++ : bad++
  console.log(`${r ? 'ок ' : 'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(poluchili)}, ждали ${JSON.stringify(zhdali)}`) }
const MR = await zagruzit(new URL('../src/message-receipts.js', import.meta.url).href)
const WG = await zagruzit(new URL('../src/wake-gate.js', import.meta.url).href)
const RR = await zagruzit(new URL('../src/receipt-runtime.js', import.meta.url).href)

const E = [
  { seq: 0, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'm0' }] } },
  { seq: 1, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
  { seq: 2, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'm1' }] } },
  { seq: 3, type: 'turn/start', data: { turn: 1 } },
  { seq: 4, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
  { seq: 5, type: 'assistant/message', data: { turn: 1, message: { id: 'a1' } } },
  { seq: 6, type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { code: 'X', message: 'сбой' } } } },
]
const s011 = (seed) => ({ id: 'S', header: { createdAt: 1, seedLength: seed }, events: E })
const s020 = (seed) => ({ id: 'S', header: { createdAt: 1, inheritedEventCount: seed }, snapshotEvents: () => Object.freeze([...E]) })
const fakty = (s) => { try { return JSON.stringify([...MR.receiptFacts(s, ['m0', 'm1']).entries()]) } catch (e) { return `отказ: ${String(e.message).slice(0, 45)}` } }
const skazano = []
MR.ustanovitIstochnikPomoshchnika(() => undefined, (t) => skazano.push(t))
const f011bez = fakty(s011(0))
proba('без помощника: 0.1.1 — квитанции читаются (прежнее)', f011bez.startsWith('[["m0"'), true)
proba('без помощника: 0.2.0 = 0.1.1, журнал прочитан', fakty(s020(0)), f011bez)
proba('без помощника: строка вслух — ровно одна', skazano.length, 1)
const pm = await sluzhbaYadra()
MR.ustanovitIstochnikPomoshchnika(() => pm)
proba('со службой: 0.1.1 — то же, что без помощника (прежнее побайтно)', fakty(s011(0)), f011bez)
proba('со службой: 0.2.0 = 0.1.1 (срез 0)', fakty(s020(0)), fakty(s011(0)))
proba('со службой: 0.2.0 = 0.1.1 (срез наследования 2)', fakty(s020(2)), fakty(s011(2)))
proba('срез наследования меняет исход (контроль зрячести среза)', fakty(s011(2)) !== fakty(s011(0)), true)
let f = null; try { f = MR.receiptFacts(s020(0), ['m1']).get('m1') } catch (e) { f = { oshibka: String(e.message).slice(0, 45) } }
proba('0.2.0: m1 забран ходом 1, ответ и конец хода', [f.claims?.length, f.claims?.[0]?.turn, f.outputs?.length, f.end?.turn], [1, 1, 1, 1])
const wg = new WG.WakeGate(null)
const bez = (f) => { try { return f() } catch (e) { return `отказ: ${String(e.message).slice(0, 45)}` } }
proba('WakeGate.refusal: 0.2.0 = 0.1.1 (отказ с кодом X)', bez(() => wg.refusal(s020(0))), bez(() => wg.refusal(s011(0))))
const rr = new RR.ReceiptRuntime(null, null, () => {})
proba('ReceiptRuntime.contains: 0.2.0 = 0.1.1', [bez(() => rr.contains(s020(0), 'm1')), bez(() => rr.contains(s020(3), 'm1')), bez(() => rr.contains(s020(0), 'нет'))], [rr.contains(s011(0), 'm1'), rr.contains(s011(3), 'm1'), false])
console.log(`\nstend-styka-sobytij (telegram): ok=${ok} FAIL=${bad}`); process.exit(bad === 0 ? 0 : 1)
