// RU: СТЕНД СТЫКА СО СЛУЖБОЙ «СОБЫТИЯ СЕССИИ» ядра памяти: zhdyomUsage, сторож свежего usage, poslednijEpizod и
//     хвост — на формах журнала DSH 0.1.1 (events) и 0.2.0 (snapshotEvents). Служба ядра — настоящий apply()
//     соседнего пакета dsh-pamyat-core (путь по каталогу, не имя пакета). Коды: 0 — сошлось, 1 — расхождение, 2
//     — слепота (нет соседнего ядра или помощника).
// EN: STAND FOR THE JOINT WITH THE "SESSION EVENTS" SERVICE of the memory core: zhdyomUsage, the fresh-usage
//     watchdog, poslednijEpizod and the tail — on DSH 0.1.1 (events) and 0.2.0 (snapshotEvents) journal shapes.
//     The core service is the real apply() of the sibling package dsh-pamyat-core (path by directory, not by
//     package name). Codes: 0 — passed, 1 — mismatch, 2 — blindness (no sibling core or helper).
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// RU: Платформа для резолвера: DSH_TEST_APP или путь установки, заданный в коде стенда.
// EN: Platform for the resolver: DSH_TEST_APP or an installation path hard-coded in the stand.
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const zagruzit = async (u) => { try { return await import(u) } catch (e) { console.log(`СЛЕПОТА: предмет не загрузился (${e?.code ?? 'ошибка'}: ${String(e?.message ?? e).slice(0, 120)})`); process.exit(2) } }
const VREM = []; process.on('exit', () => { for (const k of VREM) rmSync(k, { recursive: true, force: true }) })
const vremennyj = (p) => { const k = mkdtempSync(join(tmpdir(), p)); VREM.push(k); return k }
// RU: Служба ядра памяти из соседнего каталога ../dsh-pamyat-core (база — во временном каталоге). Нет ядра или
//     помощника событий — слепота, код 2.
// EN: The memory core service from the sibling directory ../dsh-pamyat-core (database in a temporary
//     directory). No core or events helper — blindness, code 2.
async function sluzhbaYadra() {
  const yadro = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dsh-pamyat-core', 'src', 'index.js')
  if (!existsSync(yadro)) { console.log(`СЛЕПОТА: соседнего ядра нет (${yadro})`); process.exit(2) }
  const { apply } = await zagruzit(pathToFileURL(yadro).href)
  const s = {}; apply({ provide(i, o) { s[i] = o }, on() {}, logger: { error() {} } }, { putBazy: join(vremennyj('styk-kompakt-'), 's.db'), agent: 'stend' })
  if (typeof s.pamyat?.sobytiyaSessii !== 'function') { console.log('СЛЕПОТА: в соседнем ядре нет помощника событий (ядро старше помощника событий sobytiyaSessii) — ядро и потребитель ставятся одним окном'); process.exit(2) }
  return s.pamyat
}
let ok = 0, bad = 0
const proba = (imya, poluchili, zhdali) => { const r = JSON.stringify(poluchili) === JSON.stringify(zhdali); r ? ok++ : bad++
  console.log(`${r ? 'ок ' : 'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(poluchili)}, ждали ${JSON.stringify(zhdali)}`) }
const K = await zagruzit(new URL('./index.mjs', import.meta.url).href)
const ev = [{ type: 'compaction/summary', seq: 5, data: { compactionId: 'c1' } }, { type: 'compaction/end', seq: 6, data: { compactionId: 'c1' } }]
const s011 = (e) => ({ id: 'a', events: e }), s020 = (e) => ({ id: 'b', snapshotEvents: () => Object.freeze([...e]) })
const skazano = []
proba('без помощника: 0.1.1 — ждём usage (прежнее)', K.zhdyomUsage(s011(ev)), { summarySeq: 5, endSeq: 6 })
proba('без помощника: 0.2.0 — «не жду» и одна строка, не TypeError', [K.zhdyomUsage(s020(ev), null, (t) => skazano.push(t)), skazano.length], [null, 1])
K.zhdyomUsage(s020(ev), null, (t) => skazano.push(t))
proba('та же сессия — строка не повторяется', skazano.length, 1)
const pm = await sluzhbaYadra()
proba("ctx.get('pamyat') со службой — помощник", K.pomoshchnikYadra({ get: (i) => (i === 'pamyat' ? pm : undefined) }) === pm, true)
proba('ctx без get — помощника нет (null)', K.pomoshchnikYadra({ on() {} }), null)
proba('со службой: 0.1.1 — ждём usage', K.zhdyomUsage(s011(ev), pm), { summarySeq: 5, endSeq: 6 })
proba('со службой: 0.2.0 snapshotEvents — ждём usage', K.zhdyomUsage(s020(ev), pm), { summarySeq: 5, endSeq: 6 })
// RU: Сторож целиком на сессии 0.2.0: сжатие, три завершённых хода без свежего usage — ровно одна тревога.
// EN: The whole watchdog on a 0.2.0 session: compaction, three completed turns without fresh usage — exactly
//     one alert.
const sent = [], logs = [], cb = new Map()
const ctx = { on: (n, f) => cb.set(n, f), get: (i) => (i === 'pamyat' ? pm : undefined), tokenMeter: { measure: () => ({ baseline: { kind: 'usage' } }) } }
K.storozhUsage(ctx, { directory: vremennyj('styk-usage-'), send: async (t) => { sent.push(t) }, log: (s) => logs.push(s) })
const zhurnal = []
const s = { id: 'fixture020', header: { createdAt: 7 }, snapshotEvents: () => Object.freeze([...zhurnal]), requestHeader: () => ({ config: { provider: 'claude-oauth', model: 'gpt-6-astra' } }) }
const event = (type, data = {}) => { const e = { seq: zhurnal.length, type, data }; zhurnal.push(e); return cb.get('session/event')(s, e) }
let turn = 0
await event('compaction/summary', { compactionId: 'x' }); await event('compaction/end', { compactionId: 'x' })
await event('turn/end', { turn: ++turn }); await event('turn/end', { turn: ++turn })
proba('0.2.0 сторож: два хода — тревоги нет', sent.length, 0)
await event('turn/end', { turn: ++turn })
proba('0.2.0 сторож: третий ход без usage — одна тревога', sent.length, 1)
// RU: Отбой: poslednijEpizod — через службу ядра; на сессии 0.2.0 отбой ровно один.
// EN: All-clear: poslednijEpizod via the core service; exactly one all-clear on a 0.2.0 session.
proba('poslednijEpizod 0.1.1 без службы — прежний', K.poslednijEpizod(s011(ev)), { summarySeq: 5, endSeq: 6 })
const bezopasno = (f) => { try { return f() } catch (e) { return 'ИСКЛЮЧЕНИЕ ' + String(e?.message ?? e).slice(0, 60) } }
proba('poslednijEpizod 0.2.0 snapshotEvents со службой — эпизод найден', bezopasno(() => K.poslednijEpizod(s020(ev), pm)), { summarySeq: 5, endSeq: 6 })
let oshibkaOtboya = null
try { await event('assistant/message', { usage: { input: 1 } }); await event('turn/end', { turn: ++turn }); await event('turn/end', { turn: ++turn }) }
catch (e) { oshibkaOtboya = String(e?.message ?? e).slice(0, 80) }
proba('0.2.0 сторож: usage пришёл после тревоги — ровно один отбой, без исключения', [oshibkaOtboya, sent.length, sent.filter((t) => t.startsWith('✅ отбой')).length], [null, 2, 1])
// RU: Дословный хвост: голова — первые 2 непустых сообщения поверхности, хвост — остальные; стык по
//     содержимому.
// EN: Verbatim tail: the head is the first 2 non-empty surface messages, the tail is the rest; the joint is
//     checked by content.
const E4 = [0, 1, 2, 3].map((i) => ({ seq: i, type: 'user/message', data: { m: { role: 'user', content: `сообщение ${i}` } } }))
const sHv = (forma) => Object.assign(forma === '020' ? { id: 'h', snapshotEvents: () => Object.freeze([...E4]) } : { id: 'h', events: E4 },
  { surface: { nodes: [0, 1, 2, 3] }, deriveEventMessage: (e) => e?.data?.m ?? null })
const golova = { messages: [E4[0].data.m, E4[1].data.m] }
const hv = (r) => [r.hvost?.map((m) => m.content) ?? null, r.pochemu]
proba('хвост 0.1.1 без службы — прежний', hv(K.vhodSHvostom(golova, { session: sHv('011') })), [['сообщение 2', 'сообщение 3'], null])
proba('хвост 0.2.0 со службой — непустой, стык сошёлся', hv(K.vhodSHvostom(golova, { session: sHv('020') }, pm)), [['сообщение 2', 'сообщение 3'], null])
proba('хвост 0.2.0 без журнала — своя причина, не «сессия недоступна»', hv(K.vhodSHvostom(golova, { session: { id: 'x', surface: { nodes: [0] }, deriveEventMessage: () => null } }, pm)), [null, 'журнал сессии не читается (ни events, ни snapshotEvents)'])
console.log(`\nstend-styka-sobytij (kompakt-dsh): ok=${ok} FAIL=${bad}`); process.exit(bad === 0 ? 0 : 1)
