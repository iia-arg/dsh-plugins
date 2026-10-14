// RU: Стенд применимости обрезки (prune) по настройке ispolnenieInstrumentov. Подмена неизвестности нулём
//     («обрезок без модели 0» при 'sdk' или незаданном исполнителе) и чтение незаданного как 'sdk' обязаны
//     краснеть; Config обязан отвергать значения вне 'sdk' | 'dsh' | 'unknown'.
//     Импортируется настоящий модуль; обработчики зовутся напрямую, без сети и без команды стока. Запуск: node
//     test/stend-primenimosti-prune.mjs; код 0 — 6 из 6.
// EN: Stand for prune applicability by the ispolnenieInstrumentov setting. Replacing the unknown with zero ("0
//     prunes without a model" for 'sdk' or an unset executor) and reading an unset value as 'sdk' must turn
//     red; Config must reject values outside 'sdk' | 'dsh' | 'unknown'.
//     The real module is imported; handlers are called directly, with no network and no sink command. Run: node
//     test/stend-primenimosti-prune.mjs; exit 0 — 6 of 6.
import assert from 'node:assert/strict'
import { apply, Config } from '../src/index.js'
let failed = 0
for (const [name, mode, prune, want] of [
  ['SDK', 'sdk', false, 'обрезка: неприменимо (инструменты в SDK)'],
  ['DSH с prune', 'dsh', true, 'обрезок без модели 1'],
  ['DSH без prune', 'dsh', false, 'обрезок без модели 0'],
  ['признак отсутствует', undefined, false, 'обрезка: не установлено'],
]) {
  const callbacks = [], output = []
  const ctx = { on: (event, cb) => { if (event === 'session/event') callbacks.push(cb) },
    logger: { info: x => output.push(x), warn: x => output.push(x) } }
  const session = { id: name }
  const emit = e => callbacks.forEach(cb => cb(session, e))
  try {
    const parsed = mode === undefined ? Config({}) : Config({ ispolnenieInstrumentov: mode })
    apply(ctx, { ...parsed, agent: name, komandaStoka: '' })
    if (prune) emit({ type: 'compaction/prune', data: {} })
    emit({ type: 'turn/end', data: {} })
    const text = output.join('\n')
    assert.ok(text.includes(want), `ждали «${want}», получили ${text}`)
    if (mode !== 'dsh') {
      assert.ok(!text.includes('обрезок без модели 0'), 'неприменимость/неизвестность подменена нулём')
      assert.ok(!text.includes('порог не пробивался'), 'объяснение нуля вне области')
    }
    console.log(`OK ${name}`)
  } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) }
}
for (const value of ['other', 'SDK']) {
  try {
    assert.throws(() => Config({ ispolnenieInstrumentov: value }))
    console.log(`OK Config отказал: ${value}`)
  } catch (e) { failed++; console.error(`FAIL Config принял ${value}: ${e.message}`) }
}
console.log(`итог: ${6-failed} из 6`)
process.exitCode = failed ? 1 : 0
