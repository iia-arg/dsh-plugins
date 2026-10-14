// RU: Изолированный стенд stend-svezhesti-opory.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-svezhesti-opory.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}


const m = text.match(/const svezhest = \(\(\) => \{[\s\S]*?\n {14}\}\)\(\);/)
if (!m) {
  console.log('СЛЕПОТА: в предмете не найден блок `const svezhest = (() => {...})();` — вырезать нечего.')
  console.log('  Это НЕ «признака нет»: он мог быть переписан в другой форме. Проверить руками.')
  process.exit(2)
}


const mPr = text.match(/function prichina\(e\) \{[\s\S]*?\n  \}/)
if (!mPr) {
  console.log('СЛЕПОТА: блок свежести зовёт prichina(), а её объявления в предмете нет —')
  console.log('  вырезанное не соберётся. Проверить руками, не переименована ли она.')
  process.exit(2)
}
let svezhestOt
try {
  svezhestOt = new Function('sess', mPr[0] + '\n' + m[0].replace('const svezhest = ', 'return ').replace(/;$/, '') + ';')
} catch (e) {
  console.log(`СЛЕПОТА: вырезанный блок не собирается: ${e?.message ?? e}`); process.exit(2)
}

let ok = 0, bed = 0
const t = (imya, delo) => {
  try { const v = delo(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log(`  ok   ${imya}`) }
  catch (e) { bed++; console.log(`  FAIL ${imya} — ${e?.message ?? e}`) }
}
const ravno = (bylo, zhdali, chto) => {
  if (bylo !== zhdali) throw new Error(`${chto}: «${bylo}», а ждали «${zhdali}»`)
}


const soobshchenie = (seq) => ({ seq, type: 'assistant/message', data: { usage: { inputTokens: 1 } } })
const kompakt = (seq, tip = 'compaction/summary') => ({ seq, type: tip })
const massiv = (evs) => ({ events: evs })
const cherezEventAt = (evs) => ({
  seq: evs.length,
  eventAt: (i) => evs[i],
})


t('компакта не было → свежая', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), soobshchenie(1)])).kind, 'svezhaya', 'исход')
})

t('компакт был, ответ ПОСЛЕ него → свежая (якорь переставился)', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), kompakt(1), soobshchenie(2)])).kind, 'svezhaya', 'исход')
})


t('компакт был, ответа ПОСЛЕ нет → устарела', () => {
  const r = svezhestOt(massiv([soobshchenie(0), soobshchenie(1), kompakt(2)]))
  ravno(r.kind, 'ustarela', 'исход')
  if (r.kompakt !== 2 || r.yakor !== 1) throw new Error(`числа: компакт ${r.kompakt}, якорь ${r.yakor}, ждали 2 и 1`)
})

t('prune двигает поверхность так же, как summary', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), kompakt(1, 'compaction/prune')])).kind, 'ustarela', 'исход')
})


t('ответ без usage после компакта якорем НЕ считается', () => {
  const evs = [soobshchenie(0), kompakt(1), { seq: 2, type: 'assistant/message', data: {} }]
  ravno(svezhestOt(massiv(evs)).kind, 'ustarela', 'исход')
})


t('новый интерфейс: компакт последним → устарела', () => {
  ravno(svezhestOt(cherezEventAt([soobshchenie(0), soobshchenie(1), kompakt(2)])).kind, 'ustarela', 'исход')
})

t('новый интерфейс: ответ после компакта → свежая', () => {
  ravno(svezhestOt(cherezEventAt([soobshchenie(0), kompakt(1), soobshchenie(2)])).kind, 'svezhaya', 'исход')
})


t('нет ни events, ни eventAt → не знаю, а не «свежо»', () => {
  const r = svezhestOt({})
  ravno(r.kind, 'ne-znayu', 'исход')
  if (!/events/.test(r.pochemu)) throw new Error(`причина не названа: «${r.pochemu}»`)
})

t('eventAt есть, seq не число → не знаю', () => {
  ravno(svezhestOt({ eventAt: () => undefined, seq: 'много' }).kind, 'ne-znayu', 'исход')
})

t('eventAt вернул undefined (иная сигнатура) → не знаю', () => {
  const r = svezhestOt({ eventAt: () => undefined, seq: 3 })
  ravno(r.kind, 'ne-znayu', 'исход')
  if (!/сигнатура/.test(r.pochemu)) throw new Error(`причина не про сигнатуру: «${r.pochemu}»`)
})

t('eventAt бросил → не знаю, причина названа', () => {
  const r = svezhestOt({ eventAt: () => { throw new Error('SessionSeq требуется') }, seq: 2 })
  ravno(r.kind, 'ne-znayu', 'исход')
  if (!/отказал/.test(r.pochemu)) throw new Error(`причина не про отказ: «${r.pochemu}»`)
})


t('три исхода дают три РАЗНЫХ ответа', () => {
  const a = svezhestOt(massiv([soobshchenie(0)])).kind
  const b = svezhestOt(massiv([soobshchenie(0), kompakt(1)])).kind
  const c = svezhestOt({}).kind
  if (new Set([a, b, c]).size !== 3) throw new Error(`исходы слиплись: ${a} / ${b} / ${c}`)
})

console.log(`итог: ${ok} из ${ok + bed}`)
process.exit(bed === 0 ? 0 : 1)
