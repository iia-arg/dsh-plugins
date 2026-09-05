// Стенд разреженной строки успеха опроса Telegram (п.118).
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// ЧТО ЛЕЧИТ ПРЕДМЕТ. Отказ опроса логируется громко, успех молча: «работает» и «ВСТАЛ»
// давали ОДИН след — пустоту, полная остановка выглядела как исправная тихая работа.
// Лечение — разреженная строка: раз в 20 циклов И при смене состояния (отказ → успех).
//
// 🔴 ВЫРЕЗАЕМ ИЗ ПРЕДМЕТА, А НЕ ПЕРЕПИСЫВАЕМ. Копия логики стареет молча. Вырезаем блок
// счётчика ровно как он стоит в src/index.js, заменяем log() на запись в массив, гоняем
// на подставных числах. Порча (снять порог 20) обязана покраснеть — иначе проба не значит.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ. Стенд проверяет ЛОГИКУ порога на числах, а не живую доставку в
// журнал и не «встал ли реальный опрос». Это ворота боем, не стенд.

import { readFileSync } from 'node:fs'

const SRC = process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

// Вырезаем тело счётчика: от `podryad += 1;` до строки `for (const u of updates) {`.
const m = text.match(/podryad \+= 1;[\s\S]*?\n        for \(const u of updates\) \{/)
if (!m) {
  console.log('СЛЕПОТА: в предмете не найден блок `podryad += 1; ... for (const u of updates)`.')
  console.log('  Это НЕ «признака нет»: блок мог быть переписан. Проверить руками.'); process.exit(2)
}
// Убираем хвост-якорь (for) и превращаем log() в push() в общий массив.
const body = m[0]
  .replace(/\n        for \(const u of updates\) \{$/, '')
  .replace(/log\(/g, 'logged.push(')

function progonat(porog) {
  // Вырезанный блок обращается к podryad/bylOtkaz/updates/logged как к своим параметрам —
  // аргументы функции и есть эти переменные. Порог 20 подменяется числом porog (для порчи).
  const b = body.replace(/% 20 === 0/g, `% ${porog} === 0`)
  return new Function('podryad', 'bylOtkaz', 'updates', 'logged',
    b + '\nreturn { podryad, bylOtkaz, logged };')
}

const ok = (msg) => console.log('  ok   ' + msg)
let failed = false

// ── 1) раз в 20 циклов успеха строка появляется ──
{
  const run = progonat(20)
  const logged = []
  let s = { podryad: 0, bylOtkaz: false, logged }
  for (let i = 0; i < 20; i++) {
    s = run(s.podryad, s.bylOtkaz, { length: 0 }, s.logged)
  }
  const zhiv = s.logged.some((x) => /опрос жив: 20 циклов/.test(x))
  if (zhiv) ok('на 20-м цикле без отказа появилась строка «опрос жив: 20»')
  else { console.log('  НЕ ТО: на 20-м цикле строки нет'); failed = true }

  const rano = s.logged.some((x) => /опрос жив: (1|2|3|4|5) циклов/.test(x))
  if (!rano) ok('раньше 20-го цикла строки НЕТ (разрежено, не каждый цикл)')
  else { console.log('  НЕ ТО: строка появилась раньше 20-го (слишком часто)'); failed = true }
}

// ── 2) при смене состояния (отказ → успех) строка восстановления появляется сразу ──
{
  const run = progonat(20)
  const logged = []
  let s = run(3, true, { length: 0 }, logged)   // bylOtkaz=true: был отказ
  const vosst = s.logged.some((x) => /восстановился после отказа/.test(x))
  if (vosst) ok('после отказа первая удача дала «восстановился»')
  else { console.log('  НЕ ТО: строка восстановления не появилась'); failed = true }
}

// ── 3) ПОРЧА: порог 999999 — строка успеха исчезает (не считая восстановления) ──
{
  const run = progonat(999999)
  const logged = []
  let s = { podryad: 0, bylOtkaz: false, logged }
  for (let i = 0; i < 20; i++) s = run(s.podryad, s.bylOtkaz, { length: 0 }, s.logged)
  const zhiv = s.logged.some((x) => /опрос жив: 20 циклов/.test(x))
  if (!zhiv) ok('ПОРЧА: при пороге 999999 строка на 20-м цикле НЕ появляется (краснеет порча)')
  else { console.log('  НЕ ТО: порча не изменила исход'); failed = true }
}

process.exit(failed ? 1 : 0)
