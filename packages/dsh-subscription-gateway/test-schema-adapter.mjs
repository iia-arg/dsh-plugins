// RU: Проверить конвертер схем с контролируемыми valid/invalid входами. Проверка не доказывает регистрацию тех же инструментов живой моделью.
// EN: Test the schema converter with controlled valid/invalid inputs. This does not prove that a live model registered those tools.


let shape
try {
  ({ shape } = await import('./jsonschema-to-zod.mjs'))
} catch (e) {
  console.log(`СЛЕПОТА: адаптер не загрузился: ${String(e?.message ?? e).slice(0, 120)}`)
  console.log('  Это не расхождение предмета: скорее всего не поставлена зависимость zod'
    + ' (`npm install` в каталоге пакета) — поставьте и повторите.')
  process.exit(2)
}
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

let ok = 0, bad = 0
const t = (name, cond, got) => {
  if (cond) { ok++; console.log(`  ok   ${name}`) }
  else { bad++; console.log(`  FAIL ${name}${got === undefined ? '' : ` — got ${JSON.stringify(got)}`}`) }
}

const blok = (name, fn) => {
  try { fn() } catch (e) {
    bad++
    console.log(`  FAIL ${name}: предмет бросил исключение / the subject threw: ${String(e?.message ?? e).slice(0, 160)}`)
  }
}
const passes = (z, v) => { const r = z.safeParse(v); return r.success }

console.log('\n=== A. Real platform schedule schemas ===')

const SCHEDULE_FILE = process.argv[2] ?? `${dirname(fileURLToPath(import.meta.url))}/schedule.json`

let SCHEDULE
try {
  SCHEDULE = JSON.parse(readFileSync(SCHEDULE_FILE, 'utf8'))
  if (!Array.isArray(SCHEDULE)) throw new Error('ожидался массив схем / an array of schemas was expected')
} catch (e) {
  console.log(`СЛЕПОТА: файл схем не прочитан: ${String(e?.message ?? e).slice(0, 120)}`)
  console.log(`  Путь: ${SCHEDULE_FILE}`)
  console.log('  Это не расхождение предмета: укажите файл схем аргументом'
    + ' (`node test-schema-adapter.mjs /путь/к/schedule.json`) и повторите.')
  process.exit(2)
}
for (const tool of SCHEDULE) {
  blok(`${tool.name}: the schema assembled`, () => {
    const s = shape(tool.parameters)
    t(`${tool.name}: the schema assembled, fields ${Object.keys(s).length}`, Object.keys(s).length > 0 || tool.name === 'schedule_list')
  })
}

console.log('\n=== B. The oneOf shape — the reason the adapter was fixed ===')
blok('B: the oneOf shape', () => {

  const s = shape({
    type: 'object',
    properties: { at: { anyOf: [{ type: 'string' }, { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] }] } },
  })
  t('the string branch passes', passes(s.at, '2026-08-23T10:00:00Z'))
  t('the object branch passes', passes(s.at, { date: '2026-08-23' }))
  t('a foreign type does NOT pass (it did not degenerate into any)', !passes(s.at, 42), s.at?._def?.typeName)
})

console.log('\n=== C. Required and optional ===')
blok('C: required and optional', () => {
  const s = shape({
    type: 'object',
    properties: { prompt: { type: 'string' }, after_seconds: { type: 'number' } },
    required: ['prompt'],
  })
  t('required with no value — refused', !passes(s.prompt, undefined))
  t('optional with no value — passes', passes(s.after_seconds, undefined))
  t('optional with a value — passes', passes(s.after_seconds, 300))
})

console.log('\n=== D. Descriptions reach the model ===')
blok('D: descriptions', () => {

  const DESCRIPTION = 'the exact identifier'
  const s = shape({ type: 'object', properties: { id: { type: 'string', description: DESCRIPTION } }, required: ['id'] })
  t('the field description was carried over', s.id?.description === DESCRIPTION, s.id?.description)
})

console.log(`\nTOTAL: passed ${ok}, failed ${bad}`)

const ZHDYOM = SCHEDULE.length + 7
if (ok + bad !== ZHDYOM) {
  console.log(`СЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM}`
    + ' — раздел не исполнился / a section did not run')
  process.exit(2)
}
process.exit(bad ? 1 : 0)
