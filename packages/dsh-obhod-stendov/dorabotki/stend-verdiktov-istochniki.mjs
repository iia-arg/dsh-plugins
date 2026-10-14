// Стенд прибора вердиктов: два ОБЪЯВЛЕННЫХ источника, каждый со своим итогом.
// 🔴 Подставной каталог через VERDIKTY_KATALOG — рабочий /opt/iskra/workspace не засоряется.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const P = '/opt/iskra/workspace/dorabotki/verdikty-priyomki.sh'
const kat = mkdtempSync(join(tmpdir(), 'verd-'))
// A-N-919 (образец A-N-881): уборка на всех путях выхода.
process.on('exit', () => rmSync(kat, { recursive: true, force: true }))
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let bed = 0, vsego = 0
const gonka = (env = {}, args = []) => {
  try { return execFileSync(P, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 }) }
  catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? '') }
}
const proba = (imya, uslovie, chto) => {
  vsego++
  if (uslovie) console.log(`  ✅ ${imya} (${chto})`)
  else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) }
}

console.log('── исправное: два источника, итог по каждому ──')
let v = gonka({ VERDIKTY_KATALOG: kat })
// B-N-949: итог прибора — «git(HEAD): вердиктов N из M прочитанных» (так уже на 20.09, d20e2ad — учёт заведён
// с этим форматом; прежний «git(HEAD): N» в истории не сохранился).
proba('источник git назван и печатает своё число', /git\(HEAD\): вердиктов \d+/.test(v), (v.match(/git\(HEAD\): вердиктов \d+/) || ['нет'])[0])
proba('источник файлов назван и печатает своё', /файлы\(.*\): \d+/.test(v), (v.match(/файлы\([^)]*\): \d+/) || ['нет'])[0])
proba('умолчание — HEAD, а не origin', /источник: HEAD/.test(v), 'источник в шапке')
proba('пустой каталог: «не найдено», а не молчание', /вердиктов-файлов НЕ НАЙДЕНО/.test(v), 'сказано вслух')

console.log('── 🔴 порча: [внесена] подставной вердикт в ОБЪЯВЛЕННУЮ форму ──')
const f = join(kat, 'OT-VENIAMINA-podstavnoj-verdikt.txt')
writeFileSync(f, 'подставной вердикт для пробы\n')
v = gonka({ VERDIKTY_KATALOG: kat })
proba('прибор ВИДИТ подставной вердикт', /вердиктов-файлов: 1/.test(v), (v.match(/вердиктов-файлов: \d+/) || ['нет'])[0])
proba('он назван поимённо в списке', v.includes('OT-VENIAMINA-podstavnoj-verdikt.txt'), 'имя в выводе')
proba('и посчитан свежим (сутки)', /за последние сутки: 1/.test(v), (v.match(/за последние сутки: \d+/) || ['нет'])[0])

console.log('── снять порчу ──')
unlinkSync(f)
v = gonka({ VERDIKTY_KATALOG: kat })
proba('подставного больше нет', !v.includes('podstavnoj'), 'исчез из вывода')
proba('и снова сказано «не найдено»', /вердиктов-файлов НЕ НАЙДЕНО/.test(v), 'сказано вслух')

console.log('── порча 2: [внесена] каталога вердиктов нет вовсе ──')
v = gonka({ VERDIKTY_KATALOG: join(kat, 'net-takogo') })
proba('СЛЕПОТА названа, не выдана за «вердиктов нет»', /СЛЕПОТА: каталога нет/.test(v), 'сказано вслух')

console.log('── ключ --origin: прежнее поведение сохранено ──')
v = gonka({ VERDIKTY_KATALOG: kat }, ['--origin'])
proba('источник переключается на origin', /источник: origin\/master/.test(v), 'в шапке origin')

rmSync(kat, { recursive: true, force: true })
const ZHDYOM = 11
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
