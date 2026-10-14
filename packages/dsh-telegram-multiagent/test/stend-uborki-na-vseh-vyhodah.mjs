// RU: Изолированный стенд stend-uborki-na-vseh-vyhodah.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-uborki-na-vseh-vyhodah.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'
const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let t; try { t = readFileSync(SRC, 'utf8') } catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0,120)); process.exit(2) }
function srez(ot, do_) { const i = t.indexOf(ot); if (i < 0) return null; const j = t.indexOf(do_, i + ot.length); if (j < 0) return null; return t.slice(i, j) }
const nudzh = srez('function nudgeUntilClaimed(', 'async function pollA2A()')
if (!nudzh) { console.log('СЛЕПОТА: не найдено тело nudgeUntilClaimed'); process.exit(2) }

let ok = 0, bed = 0
const proba = (imya, f) => { try { const v = f(); if (v !== undefined) throw new Error('тело вернуло «' + String(v).slice(0,60) + '»'); ok++; console.log('  ✅ ' + imya) } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0,160)) } }


proba('finally есть и зовёт ubrat() на каждом выходе', () => {
  const fin = nudzh.match(/} finally \{([\s\S]*?)\n    \}\)/)
  if (!fin) return 'блока finally нет'
  if (!/ubrat\(\)/.test(fin[1])) return 'finally не зовёт ubrat()'
})

proba('ubrat() зовёт ubratPosleSnyatiya (колбэк unlink + poslannye.delete)', () => {
  const u = nudzh.match(/const ubrat = \(\) => \{([\s\S]*?)\n    \};/)
  if (!u) return 'не найден const ubrat'
  if (!/ubratPosleSnyatiya\(\)/.test(u[1])) return 'ubrat не зовёт ubratPosleSnyatiya'
})

proba('ранние return (hasPending/wakeDriver) внутри try — до finally', () => {
  const tri = nudzh.indexOf('try {')
  const fin = nudzh.indexOf('} finally {')
  if (tri < 0 || fin < 0 || tri > fin) return 'try/finally структура не та'
  const h = nudzh.indexOf('typeof agent?.inbox?.hasPending')
  const w = nudzh.indexOf('typeof agent.wakeDriver')
  if (h < 0 || w < 0) return 'не найдены ранние проверки'
  if (h > fin || w > fin) return 'ранняя проверка ВНЕ try (обходит finally)'
})

console.log(`  итог: ${ok} из ${ok + bed}`)
process.exit(bed ? 1 : 0)
