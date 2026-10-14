// Стенд снятия ограничителей: вход не режется, выход не обрезается числом.
// 🔴 Куски берутся ИЗ ДЕРЕВА — проба про предмет, не про копию.
import { readFileSync } from 'node:fs'
const K = process.env.STEND_KOREN || '/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-secretary/src'
const shov = readFileSync(`${K}/distill-shov.js`, 'utf8')
const dist = readFileSync(`${K}/distillyaciya.js`, 'utf8')
let bed = 0, vsego = 0
const proba = (imya, uslovie, chto) => { vsego++
  if (uslovie) console.log(`  ✅ ${imya} (${chto})`); else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) } }

console.log('── ВХОД: обрезки по умолчанию нет ──')
proba('умолчание predelOkon = 0 (не ограничивать)',
  /predelOkon\) : 0;/.test(shov), (shov.match(/predelOkon\) : \d+;/) || ['нет'])[0])
proba('ветка обрезки не срабатывает при умолчании',
  /if \(PREDEL_OKON > 0 && OKNA\.length > PREDEL_OKON\)/.test(shov), 'условие с проверкой >0')
proba('окна СОХРАНЕНЫ — это разбиение, а не предел',
  /const RAZMER_OKNA/.test(shov) && /for \(let i = 0; i < VSEGO_ZNAKOV; i \+= RAZMER_OKNA\)/.test(shov), 'нарезка на месте')
proba('явный ключ по-прежнему работает (нужен стендам)',
  /Number\(nastrojka\.predelOkon\) > 0 \? Number\(nastrojka\.predelOkon\)/.test(shov), 'ключ читается')

console.log('── ВЫХОД: не число-обрезка, а потолок модели ──')
proba('maxTokens = 393216 — потолок из живого замера',
  /maxTokens = 393216/.test(dist), (dist.match(/maxTokens = \d+/) || ['нет'])[0])
// 04.10.2026 (обход, Искра): secretary a105 (A-N-1514, Гамма) переписал комментарии парами RU/EN по стандарту
// документации; прежние фразы сняты. Пробы переведены на формулировки a105 (как B-N-949). Проба «признана неверной
// прежняя правка числом (4000 → 32768)» СНЯТА: это история, в коде и docs a105 её нет — место ей в CHANGELOG.
// ⚠️ ЧЕГО НЕ ЛОВИТ: смысл «обрубок приходит как готовая сводка и теряется молча» в a105 сказан слабее («предел обрыва»).
proba('в коде названо, что потолок — предел обрыва, а не расход',
  /Это предел обрыва, не оплаченный расход/.test(dist), 'граница названа')

console.log('── границы названы, а не подразумеваются ──')
// B-N-949: фраза «Обрезка защищала от предела, которого нет» (a41, 43023f2) снята в a54 (96fabe6, 10.09 — окна
// отменены целиком, решение владельца). Граница теперь сказана иначе — distill-shov.js у PREDEL_OKON.
proba('вход: сказано, почему умолчание — не резать',
  /молча обрезать нельзя — знания из начала не попадут/.test(shov), 'сказано')
proba('выход: сказано, что потолок надо переснимать при смене модели',
  /После смены модели или условий потолок требует повторной проверки/.test(dist), 'сказано')

const ZHDYOM = 8
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
