// RU: Проверяем закрытие пары ПОЗВАНА→ЗАКОНЧЕНА при успехе и отказе захода. Удаление ЗАКОНЧЕНА из catch должно уронить стенд.
// EN: Test closure of the ПОЗВАНА→ЗАКОНЧЕНА pair after both success and rejection. Removing ЗАКОНЧЕНА from catch must fail the suite.
import { readFileSync } from 'node:fs'
const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let t; try { t = readFileSync(SRC, 'utf8') } catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0,120)); process.exit(2) }

let ok = 0, bed = 0
const proba = (imya, f) => { try { const v = f(); if (v !== undefined) throw new Error('тело вернуло «' + String(v).slice(0,60) + '»'); ok++; console.log('  ✅ ' + imya) } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0,140)) } }

proba('успех: ЗАКОНЧЕНА печатается в .then', () => {
  const then_ = t.slice(0, t.indexOf('.catch'))
  if (!/ЗАКОНЧЕНА — исход/.test(then_)) return 'в .then нет «ЗАКОНЧЕНА — исход»'
})
proba('отказ: ЗАКОНЧЕНА печатается в .catch (с причиной)', () => {
  const catch_ = t.slice(t.indexOf('.catch'))
  if (!/ЗАКОНЧЕНА — ОТКАЗ/.test(catch_)) return 'в .catch нет «ЗАКОНЧЕНА — ОТКАЗ» — при падении будет вечное «ПОЗВАНА» без пары'
  if (!/e\?\.message/.test(catch_)) return '.catch не называет причину отказа'
})

console.log(`  итог: ${ok} из ${ok + bed}`)
process.exit(bed ? 1 : 0)
