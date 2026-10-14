// Стенд отметки возраста письма в служебном канале (a2a).
// 🔴 Функция берётся ИЗ БОЕВОГО ФАЙЛА — проба про предмет, не про копию.
import { readFileSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const B = process.env.STEND_FAJL || '/opt/agent-plugins/dsh-telegram-multiagent/src/index.js'
const src = readFileSync(B, 'utf8')
// Начало — по имени, без привязки к отступу (в 1.5.6x функция ушла в нулевой отступ, прежний образец
// «  function» слеп); конец — по парности скобок от первой «{», а не по строке «\n  }».
const mN = /^[ \t]*function spoolAgeHours\(/m.exec(src)
const n1 = mN ? mN.index : -1
let n2 = -1
if (n1 >= 0) { let gl = 0; for (let i = src.indexOf('{', n1); i >= 0 && i < src.length; i++) {
  if (src[i] === '{') gl++; else if (src[i] === '}' && --gl === 0) { n2 = i; break } } }
if (n1 < 0 || n2 < 0) { console.log('🔴 СЛЕПОТА: функция не вырезалась'); process.exit(2) }
const telo = src.slice(n1, n2 + 1)
const spoolAgeHours = new Function('fs', `${telo}; return spoolAgeHours;`)(await import('node:fs'))

const kat = mkdtempSync(join(tmpdir(), 'vozr-'))
// A-N-919 (образец A-N-881): уборка на всех путях выхода.
process.on('exit', () => rmSync(kat, { recursive: true, force: true }))
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let bed = 0, vsego = 0
const proba = (imya, uslovie, chto) => { vsego++
  if (uslovie) console.log(`  ✅ ${imya} (${chto})`); else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) } }
const POROG = 12

const staryj = (chasov, imya) => {
  const p = join(kat, imya); writeFileSync(p, 'письмо')
  const t = (Date.now() - chasov * 3600000) / 1000
  utimesSync(p, t, t); return p
}

console.log('── формула возраста ──')
// имя реального письма Забавы: даты в имени НЕТ, значит пойдёт mtime
let p = staryj(60, 'zabava-1788962617606677645.txt')
let v = spoolAgeHours('zabava-1788962617606677645.txt', p)
proba('на РЕАЛЬНОМ имени (без даты) возраст берётся из mtime', Math.round(v) === 60, `${Math.round(v)} ч`)
proba('и порог сработал бы', v >= POROG, `${Math.round(v)} ≥ ${POROG}`)

p = staryj(1, 'zabava-1788999999999999999.txt')
v = spoolAgeHours('zabava-1788999999999999999.txt', p)
proba('свежее письмо порог НЕ переходит', v < POROG, `${Math.round(v)} ч`)

const imyaSDatoj = '20260906T211454Z-zabava.txt'
p = staryj(0, imyaSDatoj)   // mtime сегодняшний, но имя несёт дату 06.09
v = spoolAgeHours(imyaSDatoj, p)
proba('имя с датой ПЕРЕВЕШИВАЕТ mtime (письмо 06.09)', v > 48, `${Math.round(v)} ч`)

console.log('── подключённость к служебному каналу ──')
// B-N-949: с telegram-multiagent 1.5.20 (e3b6017, 18.09, квитанции) a2a и ящик читает ОДНА pollReceiptDirectory:
// возраст считается один раз для обоих каналов и встаёт в шапку «[служебный канал, от …]${stale}».
proba('вызов стоит в общем опросе (a2a и ящик)', /const age=spoolAgeHours\(file,full\)/.test(src), 'вызов есть')
// Свойство — отметка стоит сразу за шапкой «[служебный канал, от …]». Что идёт следом (было ${stripMark(text)},
// в 1.5.6x — ${provenance}), к предмету пробы не относится и прежде делало её хрупкой.
proba('отметка подставлена в шапку письма', /\[служебный канал, от \$\{kto\}\]\$\{stale\}\\n/.test(src), 'подстановка есть')
proba('порог один, второго правила нет', (src.match(/SPOOL_STALE_HOURS/g) || []).length >= 2, `упоминаний ${(src.match(/SPOOL_STALE_HOURS/g) || []).length}`)
// 🔴 Следующая проба КРАСНАЯ по делу: комментарий-граница выпал из предмета при e3b6017 — находка, стенд не правит предмет.
proba('граница названа в коде', /молчит о задержке до попадания в ящик/.test(src), 'названа')

rmSync(kat, { recursive: true, force: true })
const ZHDYOM = 8
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
