/**
 * RU: Стенд ПОТРЕБИТЕЛЯ меры: доходит ли напоминание до модели, а не только до stderr.
 *     🔴 ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Не «крикнул ли пакет» — это проверяет соседний стенд. Здесь: появилось ли
 *     сообщение в decision.messages, РОВНО ЛИ ОДНО за цикл, и начинается ли новый цикл после возврата занятости
 *     под порог. Восемь проб: 0 (контроль на исправном), A, A-бис, A-трет, B, C, D, E — их смысл назван у
 *     каждой.
 *     ⚠️ ЧЕГО СТЕНД НЕ ДОКАЗЫВАЕТ: что платформа примет собранное сообщение. Он зовёт хук напрямую, как это
 *     делает цепочка обработчиков платформы, но приёмку сообщения делает платформа, и доказать её может только
 *     живой заход. Стенд отвечает за форму и за счёт вставок.
 *     Запуск: node test/stend-vstavki.mjs из каталога пакета; код 0 — все пробы зелёные, 1 — есть красные, 2 —
 *     СЛЕПОТА (предмет не загрузился, обычно не установлены зависимости: npm install). Хук agent/pre-step не
 *     зарегистрирован — тоже код 2.
 * EN: Stand for the measure's CONSUMER: does the reminder reach the model, not just stderr.
 *     🔴 WHAT EXACTLY IS CHECKED. Not "did the package shout" — the neighbouring stand checks that. Here: did a
 *     message appear in decision.messages, is there EXACTLY ONE per cycle, and does a new cycle start after
 *     occupancy returns below the threshold. Eight probes: 0 (control on the healthy subject), A, A-bis, A-ter,
 *     B, C, D, E — each names its meaning.
 *     ⚠️ WHAT THE STAND DOES NOT PROVE: that the platform accepts the assembled message. It calls the hook
 *     directly, as the platform's handler chain does, but accepting the message is the platform's job, and only
 *     a live run can prove it. The stand is responsible for the shape and the count of insertions.
 *     Run: node test/stend-vstavki.mjs from the package directory; exit 0 — all probes green, 1 — some are red,
 *     2 — BLINDNESS (the subject did not load, usually dependencies are missing: npm install). If the
 *     agent/pre-step hook is not registered — also exit 2.
 */
let name, Config, apply
try {
  ;({ name, Config, apply } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// RU: Прибор называет себя: стенд правится на месте, и его сумма — единственный способ узнать, ту ли редакцию
//     прогнали.
// EN: The instrument names itself: the stand is edited in place, and its checksum is the only way to know which
//     revision was run.
console.log('стенд: ' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16))

let vsego = 0, proshlo = 0
const proba = async (imya, f) => {
  vsego++
  try {
    const vernulos = await f();
    // RU: 🔴 ВОЗВРАТ ТЕЛА УЧИТЫВАЕТСЯ, А НЕ ВЫБРАСЫВАЕТСЯ (07.09.2026). Обёртка судила ровно по ИСКЛЮЧЕНИЮ, и
    //     проба вида «вернуть причину строкой» была зелёной при ЛЮБОМ содержимом. Найдено не чтением: прибор
    //     проверки обёрток прежде НЕ ВИДЕЛ эту форму объявления (`const proba = async (`) и молча относил файл
    //     к обёрткам-условиям — то есть на глухоту он не мерился вовсе, а итог «глухих 0» читался как
    //     «проверено».
    //     По УСТРОЙСТВУ, а не по перечню значений: перечень (строка, false) пропускает 0, null, объект и число.
    //     Годен один вопрос — вернуло ли тело что-то, кроме молчания.
    // EN: 🔴 THE BODY'S RETURN VALUE IS CHECKED, NOT DISCARDED (07.09.2026). The wrapper judged by EXCEPTION
    //     only, and a probe of the form "return the reason as a string" was green whatever it contained. Found
    //     not by reading: the wrapper-checking instrument previously did NOT RECOGNISE this declaration form
    //     (`const proba = async (`) and silently classed the file as a condition wrapper — so it never measured
    //     it for deafness, and the result "0 deaf" read as "checked".
    //     By CONSTRUCTION, not by a list of values: a list (string, false) misses 0, null, an object and a
    //     number. Only one question is valid — did the body return anything other than silence.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судила по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya) }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)) }
}

/**
 * RU: Подставной ctx: перехватывает регистрацию хуков, как в стенде соседнего пакета.
 * EN: A fake ctx: intercepts hook registration, as in the sibling package's stand.
 */
function podnyat(nastrojka) {
  const handlers = {}
  const kriki = []
  const ctx = { on(ev, h) { handlers[ev] = h; return () => {} }, provide(imya, v) { ctx[imya] = v } }
  const prezhnij = console.error
  console.error = (...a) => kriki.push(a.join(' '))
  try { apply(ctx, Config(nastrojka)) } finally { console.error = prezhnij }
  return { handlers, kriki, ctx }
}

/**
 * RU: Один шаг цепочки обработчиков. next отдаёт то, что дал бы обработчик выше по цепи.
 * EN: One step of the handler chain. next returns what a handler higher up the chain would give.
 */
async function shag(handlers, { kind = 'enter', messages = [] } = {}) {
  const prestep = handlers['agent/pre-step']
  if (!prestep) { console.log('СЛЕПОТА: хук agent/pre-step не зарегистрирован'); process.exit(2) }
  const next = async () => ({ kind, messages })
  const prezhnij = console.error
  const kriki = []
  console.error = (...a) => kriki.push(a.join(' '))
  try {
    return { d: await prestep({ agent: { id: 'a1', session: { id: 's1' } }, turn: 1, step: 1, signal: {} }, next), kriki }
  } finally { console.error = prezhnij }
}

/**
 * RU: Позвать что-либо, перехватив крики: они идут в stderr вне цепочки обработчиков.
 * EN: Call something while intercepting shouts: they go to stderr outside the handler chain.
 */
async function slushaya(f) {
  const prezhnij = console.error
  const kriki = []
  console.error = (...a) => kriki.push(a.join(' '))
  try { await f() } finally { console.error = prezhnij }
  return kriki
}

/**
 * RU: Подать расход одним вызовом: занятость = вход последнего вызова.
 * EN: Feed spend as one call: occupancy = input of the last call.
 */
function raskhod(ctx, zanyato) {
  ctx.nudzhPamyati.uchest({ inputTokens: zanyato, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
}

const vstavok = (d) => d.messages.length

// RU: ── 0. КОНТРОЛЬ ЗРЯЧЕСТИ НА ИСПРАВНОМ, ДО ВСЕХ ПОРЧ · 0. SIGHT CONTROL ON THE HEALTHY SUBJECT ──
//     Соврёт здесь — сломан стенд, а не правка. Порядок не формальность: красное на порче без зелёного на
//     исправном не отличает зрячий прибор от вечно-красного.
// EN: If it lies here, the stand is broken, not the change. The order is not a formality: red on a corruption
//     without green on the healthy subject does not tell a seeing instrument from an always-red one.
await proba('0. порог НЕ перейдён → вставок нет, решение не тронуто', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 100)
  const { d } = await shag(handlers)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d) + ', ждали 0')
  if (d.kind !== 'enter') throw new Error('решение подменено: ' + d.kind)
})

// RU: ── A. переход порога → РОВНО ОДНА вставка за цикл ──
// EN: ── A. crossing the threshold → EXACTLY ONE insertion per cycle ──
await proba('A. порог перейдён → одна вставка, на следующем шаге второй НЕТ', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)
  if (vstavok(a.d) !== 1) throw new Error('первый шаг: вставок ' + vstavok(a.d) + ', ждали 1')
  const text = a.d.messages[0]?.content?.[0]?.text ?? ''
  if (!/900/.test(text) || !/1000/.test(text)) throw new Error('в тексте нет чисел: ' + text.slice(0, 80))
  // RU: Формат журнала v4 (DSH 0.2) отвергает kind 'plugin': источник обязан называть производителя — kind
  //     `plugin:<имя>`, поля plugin нет.
  // EN: Journal format v4 (DSH 0.2) rejects kind 'plugin': the source must name its producer — kind
  //     `plugin:<name>`, no plugin field.
  const src = a.d.messages[0]?.source
  if (src?.kind !== 'plugin:dsh-pamyat-nudzh' || 'plugin' in (src ?? {})) throw new Error('источник не формы v4: ' + JSON.stringify(src))
  if (!a.kriki.some((k) => /напоминание вставлено/.test(k))) throw new Error('следа в stderr нет')
  const b = await shag(handlers)
  if (vstavok(b.d) !== 0) throw new Error('второй шаг: вставок ' + vstavok(b.d) + ', ждали 0')
})

// RU: ── A-бис. СЧЁТЧИК ШАГОВ между тревогой и снятием · A-bis. STEP COUNTER between alarm and clearing ──
//     🔴 Проба ПАРНАЯ к самой правке: она проверяет не «есть ли строка», а НАЗЫВАЕТ ЛИ прибор верное число.
//     Строка без числа прошла бы проверку «есть ли счётчик» и осталась бы украшением — у нас это уже случалось
//     с полем «чем проверять».
// EN: 🔴 The probe is PAIRED with the change itself: it checks not "is there a line" but DOES the instrument
//     NAME the correct number. A line without a number would pass a "is there a counter" check and stay a
//     decoration — this has happened to us before with a "how to check" field.
await proba('A-бис. три шага между тревогой и возвратом → в крике число 3', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)          // RU: шаг 1: вставка · EN: step 1: insertion
  await shag(handlers)                    // RU: шаг 2 · EN: step 2
  await shag(handlers)                    // RU: шаг 3 · EN: step 3
  // RU: 🔴 Крик о возврате под порог идёт в ЗАМЕРЕ, а не в цепочке обработчиков — то есть вне shag. Первая
  //     редакция пробы его не ловила и краснела на исправном предмете.
  // EN: 🔴 The shout about returning below the threshold comes during the MEASUREMENT, not in the handler chain
  //     — i.e. outside shag. The first revision of the probe missed it and went red on a healthy subject.
  const vse = a.kriki.concat(await slushaya(() => raskhod(ctx, 100)))
  const stroka = vse.find((k) => /Шагов между тревогой/.test(k))
  if (!stroka) throw new Error('строки о числе шагов нет вовсе')
  if (!/Шагов между тревогой и этим мигом: 3\b/.test(stroka)) {
    throw new Error('число не то: ' + stroka.slice(0, 140))
  }
})

// RU: ── A-трет. ПРИБОР НЕ ДОЛЖЕН ЗАМИРАТЬ НА ЕДИНИЦЕ · A-ter. THE INSTRUMENT MUST NOT FREEZE AT ONE ──
//     Счёт ведётся, пока подана ТРЕВОГА, а не пока взведена вставка: вставка гасится на первом же шаге. Считай
//     мы по ней — прибор всегда показывал бы 1, то есть собственное устройство вместо предмета. Проба ловит
//     именно эту подмену.
// EN: Counting runs while the ALARM is raised, not while the insertion is armed: the insertion is cleared on
//     the very first step. Counting by it, the instrument would always show 1 — its own construction instead of
//     the subject. The probe catches exactly this substitution.
await proba('A-трет. счёт идёт после гашения вставки, а не замирает на 1', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)
  for (let i = 0; i < 5; i++) await shag(handlers)
  const vse = a.kriki.concat(await slushaya(() => raskhod(ctx, 100)))
  const stroka = vse.find((k) => /Шагов между тревогой/.test(k)) ?? ''
  const m = stroka.match(/Шагов между тревогой и этим мигом: (\d+)/)
  if (!m) throw new Error('числа нет: ' + stroka.slice(0, 120))
  if (Number(m[1]) <= 1) throw new Error('прибор замер на ' + m[1] + ' — считает вставки, а не шаги')
})

// RU: ── B. новый цикл после возврата под порог · B. a new cycle after returning below the threshold ──
//     🔴 A и B ОБЯЗАНЫ РАЗЛИЧАТЬСЯ ЧИСЛОМ. Совпали — одна из порч не та: проверь, что занятость реально
//     опускалась под порог, а не просто прошло время.
// EN: 🔴 A AND B MUST DIFFER BY A NUMBER. If they match, one of the corruptions is wrong: check that occupancy
//     really dropped below the threshold, not just that time passed.
await proba('B. под порог и снова выше → вставка ВТОРАЯ (новый цикл)', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)
  raskhod(ctx, 100)           // RU: компакт прошёл: занятость вернулась · EN: compaction done: occupancy returned
  raskhod(ctx, 950)           // RU: и снова выросла · EN: and grew again
  const b = await shag(handlers)
  const itogo = vstavok(a.d) + vstavok(b.d)
  if (itogo !== 2) throw new Error('всего вставок ' + itogo + ', ждали 2')
  if (!/950/.test(b.d.messages[0]?.content?.[0]?.text ?? '')) throw new Error('во второй вставке число не обновилось')
})

// RU: ── C. отказ выше по цепи → не вмешиваемся ──
// EN: ── C. a rejection higher up the chain → we do not interfere ──
await proba('C. decision.kind = reject → вставки нет и решение НЕ подменено', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const { d } = await shag(handlers, { kind: 'reject', messages: [] })
  if (d.kind !== 'reject') throw new Error('решение подменено: ' + d.kind)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d))
})

// RU: ── D. предел не задан → вставок нет вовсе · D. limit not set → no insertions at all ──
//     Согласовано с шапкой пакета: «молчание нуджа не означает запаса». Вставлять напоминание при неизвестном
//     пределе значило бы утверждать то, чего пакет не знает.
// EN: Consistent with the package header: "the nudge's silence does not mean headroom". Inserting a reminder
//     with an unknown limit would assert what the package does not know.
await proba('D. predel = 0 → вставок 0, крик о незаданном пределе на месте', async () => {
  const { handlers, ctx, kriki } = podnyat({ predel: 0 })
  raskhod(ctx, 999999)
  const { d } = await shag(handlers)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d) + ' при predel=0')
  if (!kriki.some((k) => /предел контекста НЕ ЗАДАН/.test(k))) throw new Error('крика о пределе нет')
})

// RU: ── E. флаг гасится ДО сборки → повтора на следующем шаге нет · E. the flag is cleared BEFORE building →
//     no repeat on the next step ──
//     🔴 Единственная проба, где проверяется СОСТОЯНИЕ, а не текст: ломаем сборку и смотрим, не осталось ли
//     право на вставку взведённым. Текстом это не увидеть.
// EN: 🔴 The only probe that checks STATE rather than text: we break the building and see whether the right to
//     insert stayed armed. Text cannot show it.
await proba('E. исключение в сборке → на следующем шаге вставки НЕТ', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  // RU: Ломаем сборку: messages не массив — распаковка [...decision.messages] бросит.
  // EN: Break the building: messages is not an array — spreading [...decision.messages] will throw.
  let upalo = false
  try { await shag(handlers, { kind: 'enter', messages: null }) } catch { upalo = true }
  if (!upalo) throw new Error('сборка не упала — порча НЕ ВНЕСЛАСЬ, проба ничего не проверила')
  const b = await shag(handlers)
  if (vstavok(b.d) !== 0) throw new Error('после падения вставка повторилась: ' + vstavok(b.d))
})

console.log(`итог: ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
