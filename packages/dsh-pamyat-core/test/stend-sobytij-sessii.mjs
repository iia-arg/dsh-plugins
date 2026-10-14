// RU: Проверяем src/sobytiya-sessii.js и поля ctx.pamyat: формы DSH 0.1.1 session.events/source plugin и 0.2.0 snapshotEvents()/inheritedEventCount/compact-checkpoint/plugin:<имя>. Формы взяты из кода 0.2.0-rc.2 и описания миграции; живую платформу 0.2.0 не поднимаем. Службу получаем настоящим apply на подставном ctx. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test src/sobytiya-sessii.js and ctx.pamyat fields: DSH 0.1.1 session.events/plugin source and 0.2.0 snapshotEvents()/inheritedEventCount/compact-checkpoint/plugin:<name> forms. Shapes come from 0.2.0-rc.2 code and migration documentation; no live 0.2.0 platform is started. Obtain the service through real apply on a fake ctx. Codes: 0 success, 1 mismatch, 2 unobservable.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let apply
try { ({ apply } = await import('../src/index.js')) } catch (e) {
  console.log(`СЛЕПОТА: ядро не загрузилось — ${String(e?.message ?? e).slice(0, 160)}`); process.exit(2)
}
const katalog = mkdtempSync(join(tmpdir(), 'pamyat-sobytiya-'))
process.on('exit', () => rmSync(katalog, { recursive: true, force: true }))
const servisy = {}
apply({ provide(imya, obj) { servisy[imya] = obj }, on() {}, logger: { error() {} } }, { putBazy: join(katalog, 's.db'), agent: 'stend' })
const pm = servisy.pamyat
if (!pm) { console.log('СЛЕПОТА: ядро не объявило службу pamyat'); process.exit(2) }

let ok = 0, bad = 0
const proba = (imya, poluchili, zhdali) => {
  const s = JSON.stringify(poluchili) === JSON.stringify(zhdali)
  s ? ok++ : bad++
  console.log(`${s ? 'ок ' : 'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(poluchili)}, ждали ${JSON.stringify(zhdali)}`)
}
const est = (f) => typeof pm[f] === 'function'
proba('служба отдаёт sobytiyaSessii, nasledovano, eSvodkaSzhatiya', [est('sobytiyaSessii'), est('nasledovano'), est('eSvodkaSzhatiya')], [true, true, true])
if (!est('sobytiyaSessii') || !est('nasledovano') || !est('eSvodkaSzhatiya')) {
  console.log(`\nstend-sobytij-sessii: ok=${ok} FAIL=${bad}`); process.exit(1)
}

const ev = [{ type: 'turn/start', seq: 0 }, { type: 'turn/end', seq: 1 }]
proba('0.1.1 events — тот же массив (===), поведение прежнее', pm.sobytiyaSessii({ events: ev }) === ev, true)
proba('0.2.0 snapshotEvents() — читается', pm.sobytiyaSessii({ snapshotEvents: () => Object.freeze([...ev]) }), ev)
proba('при обоих — берётся events', pm.sobytiyaSessii({ events: ev, snapshotEvents: () => [] }) === ev, true)
proba('нечем читать — undefined', pm.sobytiyaSessii({}) === undefined, true)
proba('сессии нет — undefined', pm.sobytiyaSessii(undefined) === undefined, true)
proba('пустой журнал — [] (не undefined)', pm.sobytiyaSessii({ events: [] }), [])
proba('snapshotEvents вернул не массив — undefined', pm.sobytiyaSessii({ snapshotEvents: () => 'x' }) === undefined, true)

proba('унаследовано: 0.2.0 inheritedEventCount', pm.nasledovano({ inheritedEventCount: 3 }), 3)
proba('унаследовано: 0.1.1 seedLength', pm.nasledovano({ seedLength: 2 }), 2)
proba('унаследовано: нет поля — 0', pm.nasledovano({}), 0)

const um = (source) => ({ type: 'user/message', data: { source } })
const SVOI = ['dsh-pamyat-restore']
proba('сводка 0.1.1 {plugin, compact}', pm.eSvodkaSzhatiya(um({ kind: 'plugin', plugin: 'compact' })), true)
proba('сводка 0.2.0 compact-checkpoint', pm.eSvodkaSzhatiya(um({ kind: 'compact-checkpoint' })), true)
proba('свой плагин 0.1.1 {plugin, dsh-pamyat-restore}', pm.eSvodkaSzhatiya(um({ kind: 'plugin', plugin: 'dsh-pamyat-restore' }), SVOI), true)
proba('свой плагин v4 plugin:dsh-pamyat-restore', pm.eSvodkaSzhatiya(um({ kind: 'plugin:dsh-pamyat-restore' }), SVOI), true)
proba('свой плагин без списка своих — не вставка', pm.eSvodkaSzhatiya(um({ kind: 'plugin', plugin: 'dsh-pamyat-restore' })), false)
proba('чужой плагин — не вставка', pm.eSvodkaSzhatiya(um({ kind: 'plugin', plugin: 'dsh-telegram-multiagent' }), SVOI), false)
proba('речь человека — не вставка', pm.eSvodkaSzhatiya(um({ kind: 'user' }), SVOI), false)
proba('dsh-compaction-basic / compact-basic — не сводка', [pm.eSvodkaSzhatiya(um({ kind: 'plugin', plugin: 'dsh-compaction-basic' })), pm.eSvodkaSzhatiya(um({ kind: 'compact-basic' }))], [false, false])
proba('не user/message — не сводка', pm.eSvodkaSzhatiya({ type: 'assistant/message', data: { source: { kind: 'compact-checkpoint' } } }), false)

console.log(`\nstend-sobytij-sessii: ok=${ok} FAIL=${bad}`)
process.exit(bad === 0 ? 0 : 1)
