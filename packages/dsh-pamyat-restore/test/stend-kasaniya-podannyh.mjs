// RU: Стенд касаний сравнивает множество id в реально вставленном тексте с изменёнными касаниями базы. Использует настоящий restore apply и хранилище ядра на временной базе; счёт снимается независимым SQL-соединением. Не покрывает отдельную сводку компакта и byudzhetPamyati: здесь действует только welcomeBudget.
// EN: The touch test compares ids in actually inserted text with changed database touches. Use real restore apply and core storage on a temporary database; measure counts with an independent SQL connection. This does not cover the separate compaction summary or byudzhetPamyati; only welcomeBudget applies here.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

let restore, core
try {
  restore = await import('../src/index.js')
  core = await import('../../dsh-pamyat-core/src/hranilishche.js')
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился (restore или соседний dsh-pamyat-core) — ' + String(e?.message ?? e).slice(0, 160))
  process.exit(2)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-kasaniya-podannyh-'))
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
// RU: SIGTERM/SIGINT переводятся в штатный выход, чтобы сработала уборка зарегистрированных временных файлов.
// EN: Convert SIGTERM/SIGINT to normal exit so registered temporary-file cleanup runs.
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

const KL = ['reshenie', 'urok', 'vyvod', 'ogranichenie', 'oshibka', 'poryadok', 'nablyudenie', 'fakt']
const CHAS = 3600000, SUTKI = 24 * CHAS
const original = { log: console.log, error: console.error }
let nomer = 0

// RU: Записать [{vozrast,soderzhim}] в новую базу и вернуть касания до/после и поданные #id.
// EN: Write [{vozrast,soderzhim}] to a fresh database and return before/after touches and delivered #id values.
async function vydacha(zapisi, welcomeBudget) {
  const n = nomer++
  const put = path.join(dir, `baza-${n}.db`)
  const h = core.otkrytHranilishche(put, { drajver: core.zagruzitDrajver() })
  const teper = Date.now()
  for (const z of zapisi) h.zapisat({ agent: 'stend', klass: 'urok', soderzhim: z.soderzhim, sozdano: teper - z.vozrast })
  // RU: Измерить касания прямым SQL через отдельное соединение, не тем объектом, который их записывает.
  // EN: Measure touches with direct SQL on a separate connection, not the object writing them.
  const kasaniya = () => {
    const b = new DatabaseSync(put, { readOnly: true })
    try { return Object.fromEntries(b.prepare('SELECT id, kasanij FROM zapisi').all().map((r) => [Number(r.id), Number(r.kasanij)])) }
    finally { b.close() }
  }
  const do_ = kasaniya()
  const pamyat = {
    sessiyaIsklyuchena: () => false,
    prochitat: async (q = {}) => h.prochitat({ agent: 'stend', skolko: 20, tolkoKlassy: KL, ...q }),   // RU: Подставная служба повторяет договор ядра, не заменяет проверяемую базу своим счётчиком.
    // EN: The fake service reproduces the core contract without replacing the inspected database with its own counter.
    otmetitKasanie: (v) => h.otmetitKasanie(v),
  }
  delete globalThis.__pamyatRestore
  const { apply, Config } = await import('../src/index.js?proba=' + n)
  const logs = [], handlers = {}
  const stderr = process.stderr.write
  process.stderr.write = (s) => { logs.push(String(s)); return true }
  console.log = console.error = (...a) => logs.push(a.join(' '))
  let itog
  try {
    apply({ on: (imya, f) => { handlers[imya] = f; return () => {} }, get: (imya) => (imya === 'pamyat' ? pamyat : undefined) },
      Config({ welcomeOtmetki: path.join(dir, `otmetka-${n}`), welcomeInterval: SUTKI, welcomeEnabled: true, welcomeBudget }))
    const session = { id: `stend-${n}`, events: [] }
    const turn = { agent: { id: 'stend', session }, turn: 1, step: 1, signal: new AbortController().signal }
    itog = await handlers['agent/pre-step'](turn, async () => ({ kind: 'enter', messages: [] }))
  } finally { process.stderr.write = stderr; Object.assign(console, original) }
  const posle = kasaniya()
  // RU: Поданные #id извлекаются из строк знания в основном тексте вставки; sections — копии, их второй раз не считать.
  // EN: Extract delivered #id values from knowledge lines in the main inserted text; sections are copies and must not be counted again.
  const tekst = (itog?.messages ?? []).flatMap((m) => m.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const podany = [...tekst.matchAll(/^- \[\w+\] #(\d+) \(/gm)].map((m) => Number(m[1])).sort((a, b) => a - b)
  const kasalis = Object.keys(posle).map(Number).filter((id) => posle[id] > (do_[id] ?? 0)).sort((a, b) => a - b)
  h.zakryt()
  return { do_, posle, podany, kasalis, vsego: Object.keys(posle).length, vyvod: logs.join('\n') }
}

let vsego = 0, proshlo = 0
async function proba(imya, f) {
  vsego++
  try {
    // RU: Тело пробы бросает либо возвращает undefined. Любое иное значение — отказ, чтобы возвращённая причина не дала ложное зелёное.
    // EN: A test body throws or returns undefined. Any other value fails so a returned cause cannot produce a false pass.
    const vernulos = await f()
    if (vernulos !== undefined) throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) + '» — тело обязано бросить или промолчать')
    proshlo++; console.log('OK   ' + imya)
  } catch (e) { console.log('FAIL ' + imya + ': ' + e.message) }
}
const trebuyu = (uslovie, chto) => { if (!uslovie) throw new Error(chto) }
const ravny = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const tekstZapisi = (i) => `Проба касания номер ${i}: стенд проверяет, что касание ставится только записям, поданным в текст брифинга`

// RU: Старше 7 суток даёт ignore: касания должны появиться только у реально поданных свежих записей.
// EN: Older than 7 days yields ignore: only actually delivered recent records should receive touches.
const smes = [
  ...[1, 2, 3].map((i) => ({ vozrast: 10 * SUTKI + i * CHAS, soderzhim: tekstZapisi(i) })),   // RU: Старые записи вставляются первыми, с id 1–3.
  // EN: Insert old records first, with ids 1–3.
  ...[4, 5, 6, 7].map((i) => ({ vozrast: i * CHAS, soderzhim: tekstZapisi(i) })),            // RU: Свежие записи получают id 4–7.
  // EN: Recent records receive ids 4–7.
]
const r1 = await vydacha(smes, 100000)
await proba('часть ignore: подано ровно 4 свежих', () => trebuyu(ravny(r1.podany, [4, 5, 6, 7]), 'подано ' + JSON.stringify(r1.podany)))
await proba('часть ignore: касание по базе ровно у поданных', () =>
  trebuyu(ravny(r1.kasalis, r1.podany), `касались ${JSON.stringify(r1.kasalis)}, подано ${JSON.stringify(r1.podany)}`))
await proba('часть ignore: у старых касаний 0 (до 0 → после 0)', () =>
  trebuyu([1, 2, 3].every((id) => r1.do_[id] === 0 && r1.posle[id] === 0), 'касания старых: ' + JSON.stringify([1, 2, 3].map((id) => r1.posle[id]))))
await proba('часть ignore: не вошедшие названы в выводе', () =>
  trebuyu(/в текст не вошли 3 из 7 отобранных/.test(r1.vyvod), r1.vyvod.split('\n').filter((s) => /welcome/.test(s)).join(' | ').slice(0, 300)))

// RU: При полной выдаче каждое знание получает касание и нет сообщения о непопавших.
// EN: When every record is delivered, each receives a touch and no omitted-record message appears.
const r2 = await vydacha([1, 2, 3, 4, 5].map((i) => ({ vozrast: i * CHAS, soderzhim: tekstZapisi(i) })), 100000)
await proba('все поданы: касание у всех 5, по одному', () =>
  trebuyu(r2.podany.length === 5 && ravny(r2.kasalis, r2.podany) && r2.kasalis.every((id) => r2.posle[id] === 1),
    `подано ${JSON.stringify(r2.podany)}, касались ${JSON.stringify(r2.kasalis)}`))
await proba('все поданы: строки «не вошли» нет', () => trebuyu(!/в текст не вошли/.test(r2.vyvod), 'строка есть'))

// RU: После первой записи сверх предела остальные не подаются: касание остаётся только у первой вошедшей в текст.
// EN: After the first record exceeds the limit, later records are omitted; touch only the first record included in text.
const r3 = await vydacha([1, 2, 3, 4].map((i) => ({ vozrast: i * CHAS, soderzhim: tekstZapisi(i) })), 150)
await proba('сверх предела: подана 1 из 4', () => trebuyu(r3.podany.length === 1, 'подано ' + JSON.stringify(r3.podany)))
await proba('сверх предела: касание ровно у поданной', () =>
  trebuyu(ravny(r3.kasalis, r3.podany), `касались ${JSON.stringify(r3.kasalis)}, подано ${JSON.stringify(r3.podany)}`))

console.log(`ИТОГ touch-policy ${proshlo}/${vsego}`)
process.exitCode = proshlo === vsego ? 0 : 1
