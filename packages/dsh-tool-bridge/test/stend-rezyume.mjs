// RU: Проверка stend-rezyume: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-rezyume verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'

const SRC = path.resolve(process.argv[2]
  || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'index.js'))
const t = fs.readFileSync(SRC, 'utf-8')
console.log(`предмет: ${SRC} (sha256-16 ${createHash('sha256').update(t).digest('hex').slice(0, 16)})`)

if (!t.includes('function polosaKotoraiaOborvalas(')) {
  console.log(`СЛЕПОТА: в ${SRC} нет polosaKotoraiaOborvalas — правка резюме не установлена`)
  process.exit(2)
}
const vyrez = (imya) => {
  const i = t.indexOf(`function ${imya}(`)
  if (i < 0) { console.log(`СЛЕПОТА: нет функции ${imya}`); process.exit(2) }
  const j = t.indexOf('\n}\n', i)
  return t.slice(i, j + 3)
}
let F
try {
  F = new Function('mkdirSync', 'writeFileSync', 'existsSync', 'unlinkSync', 'log', `
const otmetkiObyavleniya = new Map()
${vyrez('sobytiyaSessii')}
${vyrez('dostavkaNovoj')}
${vyrez('turnLedger')}
${vyrez('sobratPolosu')}
${vyrez('polosaKotoraiaOborvalas')}
${vyrez('tekushchayaPolosa')}
${vyrez('chasyMinuty')}
${vyrez('dayKeyFactory')}
${vyrez('tekstRezyume')}
${vyrez('putOtmetki')}
${vyrez('postavitOtmetku')}
${vyrez('snyatOtmetku')}
${vyrez('napechatatRezyume')}
${vyrez('rezyumeNaKonceHoda')}
${vyrez('zakrytPolosu')}
return { turnLedger, polosaKotoraiaOborvalas, tekushchayaPolosa, tekstRezyume,
         postavitOtmetku, snyatOtmetku, rezyumeNaKonceHoda, otmetkiObyavleniya,
         napechatatRezyume, zakrytPolosu }`)(
    mkdirSync, writeFileSync, existsSync, unlinkSync, (m) => LOG.push(m))
} catch (e) {
  console.log(`СЛЕПОТА: вырезанное из предмета не собралось — ${e?.message ?? e}`)
  process.exit(2)
}

const LOG = []
let ok = 0, bad = 0, slep = 0
const sud = (uslovie, imya, fakt) => {
  if (uslovie === 'slep') { slep += 1; console.log(`СЛЕПОТА ${imya}: ${fakt ?? ''}`); return }
  if (uslovie) { ok += 1; return }
  bad += 1
  console.log(`FAIL ${imya}: ${fakt ?? ''}`)
}

const KINDS = new Set(['user', 'a2a'])
const LIM = { heartbeatHumanKinds: KINDS, heartbeatDayZone: 'Europe/Moscow', heartbeatNoticeDir: '' }
const T0 = Date.UTC(2026, 8, 1, 3, 0, 0)
const MIN = 60000

function zhurnal(vidy, t0 = T0) {
  const ev = []
  let vremia = t0
  let n = 0
  for (const v of vidy) {
    n += 1
    if (v === 'a') ev.push({ type: 'schedule/change', time: vremia, data: { operation: 'dispatch', id: `s-${n}` } })
    ev.push({ type: 'turn/start', time: vremia + MIN, data: { turn: n } })
    if (v === 'h') ev.push({ type: 'user/message', time: vremia + 2 * MIN, data: { source: { kind: 'a2a' } } })
    ev.push({ type: 'turn/end', time: vremia + 3 * MIN, data: { turn: n } })
    vremia += 30 * MIN
  }
  return ev
}
const agent = (vidy) => ({ id: 'proba', session: { events: zhurnal(vidy) } })

const p3 = F.polosaKotoraiaOborvalas(zhurnal(['h', 'a', 'a', 'a', 'h']), KINDS)
sud(p3 !== null && p3.n === 3, 'полоса из 3 распознана', `дано ${JSON.stringify(p3)}`)
sud(p3 && p3.ot === T0 + 30 * MIN && p3.do === T0 + 90 * MIN,
  'границы полосы взяты от dispatch, а не от начала хода',
  p3 ? `ot=${p3.ot - T0} do=${p3.do - T0} (ждали ${30 * MIN} и ${90 * MIN})` : 'полосы нет')
sud(F.polosaKotoraiaOborvalas(zhurnal(['h', 'a', 'a', 'a', 'h', 'h']), KINDS) === null,
  'второе внешнее слово подряд полосы не даёт (дубль невозможен)')
sud(F.polosaKotoraiaOborvalas(zhurnal(['h', 'h']), KINDS) === null,
  'слово без автономных ходов полосы не даёт')
sud(F.polosaKotoraiaOborvalas(zhurnal(['h', 'a', 'a']), KINDS) === null,
  'пока полоса идёт, резюме не пора')
sud(F.polosaKotoraiaOborvalas([], KINDS) === null, 'пустой журнал полосы не даёт')

const p1 = F.polosaKotoraiaOborvalas(zhurnal(['h', 'a', 'h']), KINDS)
sud(p1 !== null && p1.n === 1, 'полоса из одного распознана', `дано ${JSON.stringify(p1)}`)

const tp = F.tekushchayaPolosa(zhurnal(['h', 'a', 'a', 'a']), KINDS)
sud(tp !== null && tp.n === 3, 'текущая полоса из 3', `дано ${JSON.stringify(tp)}`)
sud(F.tekushchayaPolosa(zhurnal(['h', 'a', 'a', 'h']), KINDS) === null,
  'после внешнего слова текущей полосы нет')

const bez = F.tekstRezyume(p3, '', 'Europe/Moscow')
const NE_OB = 'итог агентом не объявлен — см. ответ хода'
sud(bez.includes(NE_OB) && /\b3\b/.test(bez), 'текст без объявления: число и фиксированная строка «итог агентом не объявлен — см. ответ хода»', bez)
sud(!/без объявления|оборвалась/.test(bez), 'прежних слов «без объявления»/«оборвалась» нет (B-N-2097)', bez)
sud(/\d\d:\d\d/.test(bez), 'текст без объявления называет время', bez)
sud(!/\d\d\.\d\d\.\d{4}/.test(bez), 'одни локальные сутки — без даты, как прежде', bez)
// B-N-2097: полоса Анны 14.10→16.10 с одинаковым 09:30 МСК печаталась «с 09:30 до 09:30»
const MSK = (d, h, m) => Date.UTC(2026, 9, d, h - 3, m)
const anna = F.tekstRezyume({ n: 5, ot: MSK(14, 9, 30), do: MSK(16, 9, 30) }, '', 'Europe/Moscow')
sud(anna.includes('14.10.2026 09:30 (Europe/Moscow)') && anna.includes('16.10.2026 09:30 (Europe/Moscow)'),
  'разные сутки (14.10→16.10, 09:30 оба): обе полные даты + время + зона', anna)
const polnoch = F.tekstRezyume({ n: 2, ot: MSK(14, 23, 50), do: MSK(15, 0, 10) }, '', 'Europe/Moscow')
sud(polnoch.includes('14.10.2026 23:50') && polnoch.includes('15.10.2026 00:10'),
  'граница полуночи по ЛОКАЛЬНОЙ зоне (в UTC это одни сутки 14.10) — даты печатаются', polnoch)
const utcRaznye = F.tekstRezyume({ n: 2, ot: Date.UTC(2026, 9, 14, 23, 30), do: Date.UTC(2026, 9, 15, 0, 30) }, '', 'Europe/Moscow')
sud(!/\d\d\.\d\d\.\d{4}/.test(utcRaznye) && utcRaznye.includes('с 02:30 до 03:30'),
  'разные сутки UTC, но одни московские (15.10) — без даты: судит локальная зона', utcRaznye)
const annaS = F.tekstRezyume({ n: 5, ot: MSK(14, 9, 30), do: MSK(16, 9, 30) }, 'свели учёт', 'Europe/Moscow')
sud(annaS.includes('закрыта агентом') && annaS.includes('16.10.2026 09:30'), 'с объявлением даты тоже полные', annaS)
const s3 = F.tekstRezyume(p3, 'свели два учёта', 'Europe/Moscow')
sud(/закрыта агентом/.test(s3) && /свели два учёта/.test(s3) && /\b3\b/.test(s3),
  'текст с объявлением: признак, итог и число', s3)
const b1 = F.tekstRezyume(p1, '', 'Europe/Moscow')
sud(!/полоса из 1 оборвалась/.test(b1) && /\b1\b/.test(b1) && b1.includes(NE_OB),
  'вырожденный случай назван своими словами, число честное', b1)
sud(/закрыт/.test(F.tekstRezyume(p1, 'итог', 'Europe/Moscow')),
  'вырожденный случай с объявлением тоже читается', F.tekstRezyume(p1, 'итог', 'Europe/Moscow'))

const zvali = []
const pechat = (a, p, itog, lim, povod) => zvali.push({ n: p.n, itog, povod })
const snyatNet = () => false
const snyatDa = () => true

zvali.length = 0
let r = F.rezyumeNaKonceHoda(agent(['h', 'a', 'a', 'a', 'h']), LIM, snyatNet, pechat)
sud(r.pechatali === true && zvali.length === 1 && zvali[0].n === 3 && zvali[0].itog === '',
  'обрыв без объявления: резюме напечатано ОДИН раз, числом', JSON.stringify(zvali))
sud(zvali[0] && /оборвана внешним словом/.test(zvali[0].povod),
  'повод назван', JSON.stringify(zvali[0]))

zvali.length = 0
r = F.rezyumeNaKonceHoda(agent(['h', 'a', 'a', 'a', 'h']), LIM, snyatDa, pechat)
sud(r.pechatali === false && zvali.length === 0,
  'итог уже объявлен агентом: второго резюме нет', JSON.stringify(zvali))

zvali.length = 0
r = F.rezyumeNaKonceHoda(agent(['h', 'a', 'a']), LIM, snyatNet, pechat)
sud(r.pechatali === false && zvali.length === 0, 'полоса идёт: резюме не печатается')

zvali.length = 0
r = F.rezyumeNaKonceHoda(agent(['h', 'h']), LIM, snyatNet, pechat)
sud(r.pechatali === false && zvali.length === 0,
  'слово без автономных ходов: резюме не печатается вовсе')

let snyatoRaz = 0
F.rezyumeNaKonceHoda(agent(['h', 'a', 'a', 'a', 'h']), LIM, () => { snyatoRaz += 1; return false }, pechat)
sud(snyatoRaz === 1, 'отметка снимается и когда печатаем', `снято ${snyatoRaz}`)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-rezyume-'))
try {
  const L = { ...LIM, heartbeatNoticeDir: dir }
  const gde = F.postavitOtmetku(L, 'proba', 12345, 'итог')
  sud(/\/tmp|stend-rezyume/.test(gde) || gde.includes(dir), 'отметка легла файлом', gde)
  sud(F.snyatOtmetku(L, 'proba', 12345) === true, 'своя отметка снимается')
  sud(F.snyatOtmetku(L, 'proba', 12345) === false, 'снятая отметка второй раз не находится')
  F.postavitOtmetku(L, 'proba', 12345, 'итог')
  sud(F.snyatOtmetku(L, 'proba', 999) === false, 'отметка ЧУЖОЙ полосы не срабатывает')
  F.snyatOtmetku(L, 'proba', 12345)
  const gde2 = F.postavitOtmetku(LIM, 'proba', 777, 'итог')
  sud(/памяти/.test(gde2), 'без каталога отметка объявляет, что живёт в памяти', gde2)
  sud(F.snyatOtmetku(LIM, 'proba', 777) === true, 'отметка из памяти снимается')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

{
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-rezyume-skvoz-'))
  try {
    const L = { ...LIM, heartbeatNoticeDir: dir2 }

    LOG.length = 0
    const vPolose = agent(['h', 'a', 'a', 'a'])
    const otvet = F.zakrytPolosu(vPolose, 'свели два учёта', L)
    sud(otvet.closed === true && otvet.streak === 3, 'явный вызов закрыл полосу из 3', JSON.stringify(otvet))
    sud(LOG.some((m) => /закрыта агентом/.test(m) && /свели два учёта/.test(m)),
      'явный вызов напечатал резюме НЕМЕДЛЕННО', LOG.join(' | ').slice(0, 200))

    LOG.length = 0
    const posle = { id: 'proba', session: { events: zhurnal(['h', 'a', 'a', 'a', 'h']) } }
    const r1 = F.rezyumeNaKonceHoda(posle, L, F.snyatOtmetku, F.napechatatRezyume)
    sud(r1.pechatali === false, 'после объявления внешнее слово второго резюме НЕ печатает',
      JSON.stringify(r1))
    sud(!LOG.some((m) => /резюме полосы/.test(m)), 'и в журнал второго не ушло', LOG.join(' | ').slice(0, 200))

    LOG.length = 0
    const r2 = F.rezyumeNaKonceHoda({ id: 'drugoy', session: { events: zhurnal(['h', 'a', 'a', 'h']) } },
      L, F.snyatOtmetku, F.napechatatRezyume)
    sud(r2.pechatali === true, 'без вызова агента резюме ВСЁ РАВНО напечатано', JSON.stringify(r2))
    sud(LOG.some((m) => m.includes('итог агентом не объявлен — см. ответ хода')), 'и текст его — «итог агентом не объявлен — см. ответ хода»',
      LOG.join(' | ').slice(0, 200))
  } finally {
    rmSync(dir2, { recursive: true, force: true })
  }
}

const VSEGO = 38
console.log(`ИТОГО: сошлось ${ok}, расхождений ${bad}, слепот ${slep}`)
if (ok + bad + slep !== VSEGO) {
  console.log(`СЛЕПОТА канарейка: проверок ${ok + bad + slep}, а стенд состоит из ${VSEGO} — часть не исполнилась`)
  process.exit(2)
}
process.exit(bad ? 1 : (slep ? 2 : 0))
