// Стенд В9 (охват по темам) и В1 (сверка по отрезку, а не по всему журналу).
// 🔴 Куски берутся ИЗ ДЕРЕВА — проба про предмет.
import { readFileSync } from 'node:fs'
const K = process.env.STEND_KOREN || '/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-secretary/src'
const shov = readFileSync(`${K}/distill-shov.js`, 'utf8')
const idx  = readFileSync(`${K}/index.js`, 'utf8')
let bed = 0, vsego = 0
const proba = (imya, u, chto) => { vsego++
  if (u) console.log(`  ✅ ${imya} (${chto})`); else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) } }

console.log('── В9: охват по ВТОРОЙ оси ──')
proba('знаменатель копится по всем окнам', /itog\.temNajdeno = \(itog\.temNajdeno \?\? 0\) \+ vsegoTem/.test(shov), 'temNajdeno')
proba('охват печатается ВСЕГДА, не только при обрезке', /ОХВАТ ПО ТЕМАМ: взято .* = 100% \(предел не резал\)/.test(shov), 'есть ветка 100%')
proba('неполный охват краснеет и называет число', /ОХВАТ ПО ТЕМАМ НЕ ПОЛНЫЙ: взято/.test(shov), 'есть ветка красного')
proba('ноль тем — «нечего брать», а не «взято всё»', /не назвала ни одной темы — это «нечего брать»/.test(shov), 'третий исход')
proba('названо, почему вторая ось невидима при зелёной первой', /полный транскрипт не означает запись всех названных тем/.test(shov), 'класс назван')

console.log('── В1: сверка по отрезку ──')
proba('источники среза возвращаются наружу', /itog\.istochniki \?\?= \[\]/.test(shov), 'istochniki')
proba('вызывающий спрашивает ПАМЯТЬ, а не верит счёту', /pm\.poIstochniku\(i\)/.test(idx), 'poIstochniku')
proba('сверка по источникам ЭТОГО среза, не по всему журналу', /по источникам этого среза, не по всей базе/i.test(idx), 'единица названа')
proba('ложно-красное названо как причина поправки', /ложно краснел на исправном/.test(idx), 'довод в коде')
proba('старое ядро → «НЕ СВЕРЕНО», а не «сошлось»', /В1 НЕ СВЕРЕНО: ядро без poIstochniku/.test(idx), 'слепота названа')
proba('расхождение разводит две причины', /часть знаний НЕ ЛЕГЛА/.test(idx) && /в памяти БОЛЬШЕ/.test(idx), 'обе стороны')

const ZHDYOM = 11
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
