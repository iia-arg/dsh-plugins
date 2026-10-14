// RU: Проверка stend-pravki-intervala: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-pravki-intervala verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')
const slepota = (p) => { console.log(`  СЛЕПОТА ${p} — предмет ${SRC} не проверен`); process.exit(2) }
if (!existsSync(SRC)) slepota('файла нет')
const tekst = readFileSync(SRC, 'utf8')
console.log(`предмет: ${SRC} (sha256-16 ${createHash('sha256').update(tekst).digest('hex').slice(0, 16)})`)
const lines = tekst.split('\n')

const i = lines.findIndex((l) => l.startsWith('async function callTool('))
if (i < 0) slepota('в мосте нет async function callTool(')
const j = lines.findIndex((l, k) => k > i && l === '}')
if (j < 0) slepota('не нашла конец callTool')
const callTool = lines.slice(i, j + 1)

const a = callTool.findIndex((l) => /^\s*const prilozhit = \(znachenie\) => \{$/.test(l))
if (a < 0) slepota('в callTool нет const prilozhit = (znachenie) => {')
if (callTool.findIndex((l, k) => k > a && /const prilozhit = /.test(l)) >= 0) slepota('prilozhit объявлена в callTool дважды')
const otstup = callTool[a].match(/^\s*/)[0]
const b = callTool.findIndex((l, k) => k > a && l === otstup + '}')
if (b < 0) slepota('не нашла конец prilozhit')
const telo = callTool.slice(a, b + 1).join('\n')

let fabrika
try { fabrika = new Function('pravkaIntervala', telo + '\nreturn prilozhit') }
catch (e) { slepota(`тело prilozhit не разбирается: ${e.message}`) }

let vsego = 0, proshlo = 0
const proba = (imya, f) => {
  vsego++
  try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело вернуло ' + String(v).slice(0, 40))
    proshlo++; console.log('  ✅ ' + imya) }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 140)) }
}

proba('1 мост ПОПРАВИЛ → в значении ответа есть текст правки', () => {
  const otvet = fabrika('просили 600 с, поставлено 1800 с — лесенка, ступень 1 из 6')({ id: 'schedule-1', afterSeconds: 1800 })
  if (!otvet.pravkaIntervala) throw new Error('поля нет')
  if (!/600/.test(otvet.pravkaIntervala) || !/1800/.test(otvet.pravkaIntervala)) throw new Error('нет обоих чисел: ' + otvet.pravkaIntervala)
  if (otvet.id !== 'schedule-1' || otvet.afterSeconds !== 1800) throw new Error('исходные поля потеряны')
})
proba('2 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ: мост НЕ правил → поля нет, значение то же самое', () => {
  const ishod = { id: 'schedule-2', afterSeconds: 600 }
  const otvet = fabrika(undefined)(ishod)
  if (otvet !== ishod) throw new Error('значение подменено, хотя правки не было')
  if ('pravkaIntervala' in otvet) throw new Error('поле появилось без правки')
})
proba('3 исходное значение не мутируется', () => {
  const ishod = { id: 'schedule-3' }
  fabrika('правка')(ishod)
  if ('pravkaIntervala' in ishod) throw new Error('prilozhit дописал поле в чужой объект')
})
proba('4 не-объект, null и массив проходят как были (список расписания не ломается)', () => {
  const p = fabrika('правка')
  const spisok = [{ id: 1 }]
  for (const v of [null, undefined, 'tekst', 42, true]) if (p(v) !== v) throw new Error('изменён не-объект ' + JSON.stringify(v))
  if (p(spisok) !== spisok || 'pravkaIntervala' in p(spisok)) throw new Error('массив изменён')
})
proba('5 подключение: каждый возврат результата платформы в callTool идёт через prilozhit', () => {
  const vozvraty = callTool.map((l, k) => [i + k + 1, l.trim()]).filter(([, l]) => /\breturn\b.*\bawait\b/.test(l))
  if (vozvraty.length === 0) throw new Error('в callTool нет ни одного «return … await …» — проба смотрит не туда')
  const mimo = vozvraty.filter(([, l]) => !/\breturn prilozhit\(await\b/.test(l))
  if (mimo.length) throw new Error('мимо prilozhit: ' + mimo.map(([n, l]) => `:${n} ${l.slice(0, 60)}`).join(' | '))
  console.log(`     возвратов через prilozhit: ${vozvraty.length} (${vozvraty.map(([n]) => ':' + n).join(' ')})`)
})
console.log('  итог: ' + proshlo + ' из ' + vsego)
process.exit(proshlo === vsego ? 0 : 1)
