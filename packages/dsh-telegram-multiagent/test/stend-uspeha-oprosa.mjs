// RU: Изолированный стенд stend-uspeha-oprosa.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-uspeha-oprosa.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}


const m = text.match(/podryad \+= 1;[\s\S]*?\n        const pendingUpdates=/)
if (!m) {
  console.log('СЛЕПОТА: в предмете не найден блок `podryad += 1; ... for (const u of updates)`.')
  console.log('  Это НЕ «признака нет»: блок мог быть переписан. Проверить руками.'); process.exit(2)
}

const body = m[0]
  .replace(/\n        const pendingUpdates=$/, '')
  .replace(/log\(/g, 'logged.push(')

function progonat(porog) {


  const b = body.replace(/% 20 === 0/g, `% ${porog} === 0`)


  return new Function('podryad', 'bylOtkaz', 'updates', 'logged', 'momentPoslednegoHoda', 'a2aReported',
    b + '\nreturn { podryad, bylOtkaz, logged };')
}

const ok = (msg) => console.log('  ok   ' + msg)
let failed = false


{
  const run = progonat(20)
  const logged = []
  let s = { podryad: 0, bylOtkaz: false, logged }
  for (let i = 0; i < 20; i++) {
    s = run(s.podryad, s.bylOtkaz, { length: 0 }, s.logged, null, new Set())
  }


  const zhiv = s.logged.some((x) => /опрос жив[^:]*: 20 циклов/.test(x))
  if (zhiv) ok('на 20-м цикле без отказа появилась строка «опрос жив: 20»')
  else { console.log('  НЕ ТО: на 20-м цикле строки нет'); failed = true }

  const rano = s.logged.some((x) => /опрос жив[^:]*: (1|2|3|4|5) циклов/.test(x))
  if (!rano) ok('раньше 20-го цикла строки НЕТ (разрежено, не каждый цикл)')
  else { console.log('  НЕ ТО: строка появилась раньше 20-го (слишком часто)'); failed = true }
}


{
  const run = progonat(20)
  const logged = []
  let s = run(3, true, { length: 0 }, logged, null, new Set())
  const vosst = s.logged.some((x) => /восстановился после отказа/.test(x))
  if (vosst) ok('после отказа первая удача дала «восстановился»')
  else { console.log('  НЕ ТО: строка восстановления не появилась'); failed = true }
}


{
  const run = progonat(999999)
  const logged = []
  let s = { podryad: 0, bylOtkaz: false, logged }
  for (let i = 0; i < 20; i++) s = run(s.podryad, s.bylOtkaz, { length: 0 }, s.logged, null, new Set())
  const zhiv = s.logged.some((x) => /опрос жив[^:]*: 20 циклов/.test(x))
  if (!zhiv) ok('ПОРЧА: при пороге 999999 строка на 20-м цикле НЕ появляется (краснеет порча)')
  else { console.log('  НЕ ТО: порча не изменила исход'); failed = true }
}

process.exit(failed ? 1 : 0)
