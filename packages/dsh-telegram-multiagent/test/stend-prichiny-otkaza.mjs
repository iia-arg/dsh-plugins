// RU: Изолированный стенд stend-prichiny-otkaza.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-prichiny-otkaza.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
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
const t = (imya, delo) => { try { const v = delo(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log(`  ok   ${imya}`) }
  catch (e) { bed++; console.log(`  FAIL ${imya} — ${e?.message ?? e}`) } }
const nePusto = (v, chto) => {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${chto}: причина пуста — «${v}»`)
}

t('cause отсутствует → «не указана», а не пустота', () => {
  const r = errDetail(new Error('fetch failed'))
  nePusto(r, 'нет cause'); if (!/не указана/.test(r)) throw new Error(`ждали «не указана», получили «${r}»`)
})


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


t('cause без единого поля → сказано, что описания нет, а не пустота', () => {
  const r = errDetail(Object.assign(new Error('fetch failed'), { cause: Object.create(null) }))
  nePusto(r, 'пустой объект')
})


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
