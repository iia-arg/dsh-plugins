// Приёмка У0 (порог Забавы 09.09.2026): точный спрос по istochnik.
// 🔴 База ВРЕМЕННАЯ: боевая /opt/iskra/pamyat/pamyat.db не трогается ни на чтение, ни на запись.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const KOREN = process.env.STEND_KOREN || '/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-core/src'
const { otkrytHranilishche } = await import(join(KOREN, 'hranilishche.js'))

const kat = mkdtempSync(join(tmpdir(), 'u0-'))
const h = otkrytHranilishche(join(kat, 'proba.db'))
let bed = 0, vsego = 0
const proba = (imya, uslovie, chto) => {
  vsego++
  if (uslovie) console.log(`  ✅ ${imya} (${chto})`)
  else { bed++; console.log(`  🔴 ${imya} — было: ${chto}`) }
}

const ISK = 'telegram-a2a#100-200'
h.zapisat({ agent: 'iskra', klass: 'urok', soderzhim: 'искомое знание', istochnik: ISK })

console.log('── У0.1: запись с известным istochnik находится точным спросом ──')
let r = h.poIstochniku({ agent: 'iskra', istochnik: ISK })
proba('находится', r.length === 1 && r[0].soderzhim === 'искомое знание', `найдено ${r.length}`)

console.log('── У0.2: несуществующий istochnik → честный «нет», отличимый от отказа ──')
r = h.poIstochniku({ agent: 'iskra', istochnik: 'telegram-a2a#нет-такого' })
proba('пустой список, а не исключение', Array.isArray(r) && r.length === 0, `найдено ${r.length}, тип ${typeof r}`)
vsego++
try { h.poIstochniku({ agent: 'iskra', istochnik: '' }); console.log('  🔴 пустая ссылка НЕ отвергнута'); bed++ }
catch (e) { console.log(`  ✅ пустая ссылка отвергнута кодом (${e.code})`) }

console.log('── 🔴 У0.3 ГЛАВНАЯ: 25+ посторонних записей ПОСЛЕ искомой ──')
for (let i = 0; i < 30; i++) h.zapisat({ agent: 'iskra', klass: 'urok', soderzhim: 'шум ' + i, istochnik: 'shum#' + i })
r = h.poIstochniku({ agent: 'iskra', istochnik: ISK })
proba('искомое найдено за горизонтом выборки', r.length === 1, `найдено ${r.length} среди ${h.prochitat({ agent: 'iskra', skolko: 1000 }).length} записей`)
const cherezProchitat = h.prochitat({ agent: 'iskra', klass: 'urok' }).some((z) => z.istochnik === ISK)
proba('и prochitat её НЕ видит — горизонт реален, проба не фиктивна', cherezProchitat === false, `prochitat нашла: ${cherezProchitat}`)

console.log('── У0.4: прежние зовущие prochitat работают как раньше ──')
const p20 = h.prochitat({ agent: 'iskra' })
proba('умолчание по-прежнему 20', p20.length === 20, `вернулось ${p20.length}`)
proba('отбор по классу цел', h.prochitat({ agent: 'iskra', klass: 'urok' }).length === 20, 'по классу 20')
proba('чужой агент не виден', h.prochitat({ agent: 'petrovich' }).length === 0, 'у чужого 0')

console.log('── У0.5: несколько знаний из ОДНОГО источника (живой случай базы) ──')
const MNOGO = 'telegram-a2a#777'
for (let i = 0; i < 13; i++) h.zapisat({ agent: 'iskra', klass: 'urok', soderzhim: 'из одной сводки ' + i, istochnik: MNOGO })
r = h.poIstochniku({ agent: 'iskra', istochnik: MNOGO })
proba('возвращает ВСЕ 13, а не одну', r.length === 13, `найдено ${r.length}`)

console.log('── 🔴 п.4(а) ЗАПИСЬ БЕЗ ИСТОЧНИКА: «не задан» ≠ «записей нет» ──')
// В SQL `istochnik = NULL` не истинно НИКОГДА: спрос через `=` молчал бы «нет» всегда,
// и сверка досылала бы одно и то же без конца. В боевой базе такая запись есть — ровно 1.
h.zapisat({ agent: 'iskra', klass: 'urok', soderzhim: 'знание без источника', istochnik: null })
vsego++
try { h.poIstochniku({ agent: 'iskra', istochnik: null }); console.log('  🔴 незаданный источник дал МОЛЧАЛИВОЕ «нет»'); bed++ }
catch (e) { console.log(`  ✅ незаданный источник отвергнут кодом (${e.code}) — не спутан с «записей нет»`) }

console.log('── 🔴 п.4(б) ЧУЖОЙ АГЕНТ: срез соседа не считается своим ──')
// ⚠️ На боевой базе агент ОДИН (iskra, 241) — там эта проба прошла бы при любой реализации.
// Поэтому второго агента заводим ЗДЕСЬ, во временной базе: изъян виден только когда их двое.
const OBSHCHIJ = 'telegram-a2a#999'
h.zapisat({ agent: 'petrovich', klass: 'urok', soderzhim: 'чужое знание', istochnik: OBSHCHIJ })
r = h.poIstochniku({ agent: 'iskra', istochnik: OBSHCHIJ })
proba('чужой срез НЕ виден мне', r.length === 0, `найдено ${r.length}`)
r = h.poIstochniku({ agent: 'petrovich', istochnik: OBSHCHIJ })
proba('владельцу его срез виден', r.length === 1, `найдено ${r.length}`)
h.zapisat({ agent: 'iskra', klass: 'urok', soderzhim: 'моё знание', istochnik: OBSHCHIJ })
r = h.poIstochniku({ agent: 'iskra', istochnik: OBSHCHIJ })
proba('один источник у двоих — каждому своё', r.length === 1 && r[0].soderzhim === 'моё знание', `найдено ${r.length}`)
vsego++
try { h.poIstochniku({ istochnik: OBSHCHIJ }); console.log('  🔴 спрос БЕЗ агента не отвергнут'); bed++ }
catch (e) { console.log(`  ✅ спрос без агента отвергнут кодом (${e.code})`) }

console.log('── покрытие ──')
const vse = h.prochitat({ agent: 'iskra', skolko: 100000 })
const sIst = vse.filter((z) => z.istochnik).length
console.log(`  записей ${vse.length} · с непустым istochnik ${sIst} · уникальных ${new Set(vse.map((z) => z.istochnik)).size}`)

h.zakryt(); rmSync(kat, { recursive: true, force: true })
const ZHDYOM = 14
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
