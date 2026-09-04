// Стенд разбора причины отказа опроса.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота.
//
// ЧТО ЛЕЧИТ ПРЕДМЕТ. `errDetail` собирал причину через `??`. Нулевое слияние реагирует
// только на null и undefined, а `message` у AggregateError (её кладёт fetch, перебрав
// адреса) бывает ПУСТОЙ СТРОКОЙ — она «найдена», и до `code` дело не доходит.
// В живом журнале это дало 125 строк за три часа вида «причина: » с пустотой.
// 🔴 Хуже отсутствия поля: «причина:» с пустотой читается как «причину узнали, она
// пустая», а её просто не достали из объекта.
//
// 🔴 ВЫРЕЗАЕМ ИЗ ПРЕДМЕТА, а не переписываем: копия стареет молча.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: стенд проверяет только РАЗБОР объекта ошибки. Он не проверяет,
// что отказ вообще случается, и не проверяет доставку строки в журнал.

import { readFileSync } from 'node:fs'

const SRC = process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}
const m = text.match(/function errDetail\(e\) \{[\s\S]*?\n  \}/)
if (!m) { console.log('СЛЕПОТА: функция errDetail в предмете не найдена — вырезать нечего'); process.exit(2) }
let errDetail
try { errDetail = new Function(m[0] + '; return errDetail;')() }
catch (e) { console.log(`СЛЕПОТА: вырезанное не собирается: ${e?.message ?? e}`); process.exit(2) }

let ok = 0, bed = 0
const t = (imya, delo) => { try { delo(); ok++; console.log(`  ok   ${imya}`) }
  catch (e) { bed++; console.log(`  FAIL ${imya} — ${e?.message ?? e}`) } }
const nePusto = (v, chto) => {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${chto}: причина пуста — «${v}»`)
}

t('cause отсутствует → «не указана», а не пустота', () => {
  const r = errDetail(new Error('fetch failed'))
  nePusto(r, 'нет cause'); if (!/не указана/.test(r)) throw new Error(`ждали «не указана», получили «${r}»`)
})

// 🔴 ГЛАВНАЯ: ровно тот случай, что дал 125 пустых строк в бою.
t('cause.message ПУСТАЯ СТРОКА → причина всё равно названа', () => {
  const c = Object.assign(new Error(''), { code: 'ECONNRESET' })
  const r = errDetail(Object.assign(new Error('fetch failed'), { cause: c }))
  nePusto(r, 'пустой message')
  if (!/ECONNRESET/.test(r)) throw new Error(`код не попал в причину: «${r}»`)
})

t('AggregateError с пустым message → названа и она сама, и её внутренние', () => {
  const vnutri = [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })]
  const c = new AggregateError(vnutri, '')
  const r = errDetail(Object.assign(new Error('fetch failed'), { cause: c }))
  nePusto(r, 'AggregateError')
  if (!/AggregateError/.test(r)) throw new Error(`класс ошибки не назван: «${r}»`)
  if (!/ECONNREFUSED/.test(r)) throw new Error(`внутренние причины потеряны: «${r}»`)
})

t('обычная причина с message → она и печатается', () => {
  const c = Object.assign(new Error('getaddrinfo ENOTFOUND api.telegram.org'), { code: 'ENOTFOUND' })
  const r = errDetail(Object.assign(new Error('fetch failed'), { cause: c }))
  if (!/ENOTFOUND/.test(r)) throw new Error(`потеряно: «${r}»`)
})

// Отличать «объект есть, описания нет» от «cause отсутствует» — разные состояния.
t('cause без единого поля → сказано, что описания нет, а не пустота', () => {
  const r = errDetail(Object.assign(new Error('fetch failed'), { cause: Object.create(null) }))
  nePusto(r, 'пустой объект')
})

// ── ДВЕ ОСИ ПРИЁМКИ ДЛЯ prichina(). ────────────────────────────────────────
// 🔴 ОСИ, А НЕ «ЕЩЁ ПРОБЫ». Ось — это другой ВОПРОС к тому же предмету, и пробы одной
// оси слепы к дефекту другой, сколько бы их ни было.
//   ось 1 — пустое исключение   -> строка НЕ пуста
//   ось 2 — брошенный ПРИМИТИВ  -> текст СОХРАНЁН
// Первая присланная редакция закрывала ось 1 и ломала ось 2 (`throw 'текст'` давала
// «string: (без пояснения)»): пустоту закрыли, потерю открыли рядом. Нашлось это не
// чтением кода, а второй осью.
const mP = text.match(/function prichina\(e\) \{[\s\S]*?\n  \}/)
if (!mP) { console.log('СЛЕПОТА: функция prichina в предмете не найдена'); process.exit(2) }
let prichina
try { prichina = new Function(mP[0] + '; return prichina;')() }
catch (e) { console.log(`СЛЕПОТА: prichina не собирается: ${e?.message ?? e}`); process.exit(2) }

t('ОСЬ 1: пустые исключения дают НЕпустую строку', () => {
  const bed = []
  for (const [imya, v] of [['Error с пустым message', new Error('')],
                           ['AggregateError пустой', new AggregateError([], '')],
                           ['throw null', null], ['throw undefined', undefined],
                           ['объект пустой', {}]]) {
    const r = prichina(v)
    if (typeof r !== 'string' || r.trim() === '' || /^(undefined|null):?\s*$/.test(r.trim()))
      bed.push(`${imya}: «${r}»`)
  }
  if (bed.length) throw new Error(bed.join(' | '))
})

t('ОСЬ 2: брошенный примитив — текст СОХРАНЁН, не заменён пояснением', () => {
  const bed = []
  for (const [v, chto] of [['сессия не открыта', 'сессия не открыта'], [42, '42'],
                           [{ message: 'своё' }, 'своё'], [new Error('сеть'), 'сеть']]) {
    const r = prichina(v)
    if (!r.includes(chto)) bed.push(`потерян текст «${chto}»: «${r}»`)
  }
  if (bed.length) throw new Error(bed.join(' | '))
})

t('код ошибки попадает в причину, когда message пуст', () => {
  const r = prichina(Object.assign(new Error(''), { code: 'ECONNRESET' }))
  if (!/ECONNRESET/.test(r)) throw new Error(`код потерян: «${r}»`)
})

console.log(`итог: ${ok} из ${ok + bed}`)
process.exit(bed === 0 ? 0 : 1)
