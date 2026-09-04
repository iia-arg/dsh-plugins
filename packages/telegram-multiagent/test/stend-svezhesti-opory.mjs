// Стенд признака СВЕЖЕСТИ опоры замера в /compact-status.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// ЧТО ЛЕЧИТ ПРЕДМЕТ. baseline.kind различает ПРОИСХОЖДЕНИЕ опоры («числа провайдера»
// против «оценка по эвристике») и НЕ различает её СВЕЖЕСТЬ. При surface-replace
// (compaction/summary|prune) поверхность пересчитывается, а якорь остаётся прежним и
// тащит свой kind='usage'. То есть после компакта строка правдива про источник и
// обманчива про актуальность — ровно там, где на неё смотрят. Флаг не отсутствует,
// он ПРИСУТСТВУЕТ И УСПОКАИВАЕТ, и это хуже отсутствия.
//
// 🔴 ВЫРЕЗАЕМ ИЗ ПРЕДМЕТА, А НЕ ПЕРЕПИСЫВАЕМ. Копия стареет молча: перепишут предмет —
// стенд продолжит проверять прежнее и останется зелёным. То же правило, что в
// stend-komand-konteksta.mjs, и оно там уже окупилось.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ. Стенд проверяет ТОЛЬКО вычисление свежести на подставных
// сессиях. Он НЕ проверяет:
//   — что признак верен на ЖИВОМ компакте (это П1/П2 ворот, только в бою);
//   — что расстояние до порога печатается/не печатается (это текст ответа, не эта функция);
//   — цену обхода на большом журнале.
// «Стенд зелёный» здесь означает «логика различает три состояния», а не «команда не врёт».

import { readFileSync } from 'node:fs'

const SRC = process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

// Вырезаем тело признака ровно так, как оно стоит в предмете.
const m = text.match(/const svezhest = \(\(\) => \{[\s\S]*?\n {14}\}\)\(\);/)
if (!m) {
  console.log('СЛЕПОТА: в предмете не найден блок `const svezhest = (() => {...})();` — вырезать нечего.')
  console.log('  Это НЕ «признака нет»: он мог быть переписан в другой форме. Проверить руками.')
  process.exit(2)
}
// Оборачиваем вырезанное в функцию от sess: внутри блок обращается только к `sess`.
// 🔴 ВЫРЕЗАЕМ ВМЕСТЕ С ЗАВИСИМОСТЬЮ. Блок свежести зовёт `prichina(e)` — функцию,
// объявленную рядом, но ВНЕ блока. Вырезав один блок, стенд получал «prichina is not
// defined» и краснел на исправном предмете.
// Это не оговорка к приёму «вырезать из предмета», а его цена: вырезанное должно быть
// самодостаточным, и когда предмет теряет самодостаточность, стенд обязан сказать об
// этом — он и сказал. Правка предмета сломала способ его проверки, и это верное красное.
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
  try { delo(); ok++; console.log(`  ok   ${imya}`) }
  catch (e) { bed++; console.log(`  FAIL ${imya} — ${e?.message ?? e}`) }
}
const ravno = (bylo, zhdali, chto) => {
  if (bylo !== zhdali) throw new Error(`${chto}: «${bylo}», а ждали «${zhdali}»`)
}

// ── подставные сессии ────────────────────────────────────────────────────────
const soobshchenie = (seq) => ({ seq, type: 'assistant/message', data: { usage: { inputTokens: 1 } } })
const kompakt = (seq, tip = 'compaction/summary') => ({ seq, type: tip })
const massiv = (evs) => ({ events: evs })
const cherezEventAt = (evs) => ({
  seq: evs.length,
  eventAt: (i) => evs[i],
})

// ── СТАРЫЙ ИНТЕРФЕЙС: массив events ─────────────────────────────────────────
t('компакта не было → свежая', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), soobshchenie(1)])).kind, 'svezhaya', 'исход')
})

t('компакт был, ответ ПОСЛЕ него → свежая (якорь переставился)', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), kompakt(1), soobshchenie(2)])).kind, 'svezhaya', 'исход')
})

// 🔴 ГЛАВНАЯ. Ради неё вся заплатка: это состояние сегодня врало «числа провайдера».
t('компакт был, ответа ПОСЛЕ нет → устарела', () => {
  const r = svezhestOt(massiv([soobshchenie(0), soobshchenie(1), kompakt(2)]))
  ravno(r.kind, 'ustarela', 'исход')
  if (r.kompakt !== 2 || r.yakor !== 1) throw new Error(`числа: компакт ${r.kompakt}, якорь ${r.yakor}, ждали 2 и 1`)
})

t('prune двигает поверхность так же, как summary', () => {
  ravno(svezhestOt(massiv([soobshchenie(0), kompakt(1, 'compaction/prune')])).kind, 'ustarela', 'исход')
})

// Ответ БЕЗ usage якорем не является: измеритель ставит якорь по числам провайдера.
t('ответ без usage после компакта якорем НЕ считается', () => {
  const evs = [soobshchenie(0), kompakt(1), { seq: 2, type: 'assistant/message', data: {} }]
  ravno(svezhestOt(massiv(evs)).kind, 'ustarela', 'исход')
})

// ── НОВЫЙ ИНТЕРФЕЙС: eventAt + seq ──────────────────────────────────────────
t('новый интерфейс: компакт последним → устарела', () => {
  ravno(svezhestOt(cherezEventAt([soobshchenie(0), soobshchenie(1), kompakt(2)])).kind, 'ustarela', 'исход')
})

t('новый интерфейс: ответ после компакта → свежая', () => {
  ravno(svezhestOt(cherezEventAt([soobshchenie(0), kompakt(1), soobshchenie(2)])).kind, 'svezhaya', 'исход')
})

// ── ОТКАЗЫ. Каждый обязан дать «не знаю», а НЕ «свежо» ──────────────────────
// 🔴 Это и есть ветка, которая сработает при обновлении платформы. Без этих проб
// она не проверена ничем, а молчаливое «свежо» при пропавшем интерфейсе — зелёное,
// которое не может покраснеть.
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

// ── ПАРА К ГЛАВНОЙ: три исхода обязаны РАЗЛИЧАТЬСЯ ──────────────────────────
// Иначе признак есть, а различать нечем — та же вывеска, только внутри механизма.
t('три исхода дают три РАЗНЫХ ответа', () => {
  const a = svezhestOt(massiv([soobshchenie(0)])).kind
  const b = svezhestOt(massiv([soobshchenie(0), kompakt(1)])).kind
  const c = svezhestOt({}).kind
  if (new Set([a, b, c]).size !== 3) throw new Error(`исходы слиплись: ${a} / ${b} / ${c}`)
})

console.log(`итог: ${ok} из ${ok + bed}`)
process.exit(bed === 0 ? 0 : 1)
