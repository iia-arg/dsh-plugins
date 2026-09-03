/**
 * Стенд ПОТРЕБИТЕЛЯ меры: доходит ли напоминание до модели, а не только до stderr.
 *
 * 🔴 ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Не «крикнул ли пакет» — это проверяет соседний стенд.
 * Здесь: появилось ли сообщение в `decision.messages`, РОВНО ЛИ ОДНО за цикл, и
 * начинается ли новый цикл после возврата занятости под порог.
 *
 * ⚠️ ЧЕГО СТЕНД НЕ ДОКАЗЫВАЕТ: что платформа примет собранное сообщение. Он зовёт
 * хук напрямую, как это делает водопад, но приёмку сообщения делает платформа, и
 * доказать её может только боевой заход. Стенд отвечает за форму и за счёт вставок.
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
// Прибор называет себя: стенд правится на месте, и его сумма — единственный способ
// узнать, ту ли редакцию прогнали.
console.log('стенд: ' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16))

let vsego = 0, proshlo = 0
const proba = async (imya, f) => {
  vsego++
  try { await f(); proshlo++; console.log('  ✅ ' + imya) }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)) }
}

/** Подставной ctx: перехватывает регистрацию хуков, как в стенде соседа. */
function podnyat(nastrojka) {
  const handlers = {}
  const kriki = []
  const ctx = { on(ev, h) { handlers[ev] = h; return () => {} }, provide(imya, v) { ctx[imya] = v } }
  const prezhnij = console.error
  console.error = (...a) => kriki.push(a.join(' '))
  try { apply(ctx, Config(nastrojka)) } finally { console.error = prezhnij }
  return { handlers, kriki, ctx }
}

/** Один шаг водопада. `next` отдаёт то, что дал бы сосед выше по цепи. */
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

/** Подать расход одним вызовом: занятость = вход последнего вызова. */
function raskhod(ctx, zanyato) {
  ctx.nudzhPamyati.uchest({ inputTokens: zanyato, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
}

const vstavok = (d) => d.messages.length

// ── 0. КОНТРОЛЬ ЗРЯЧЕСТИ НА ИСПРАВНОМ, ДО ВСЕХ ПОРЧ ────────────────────────────
// Соврёт здесь — сломан стенд, а не правка. Порядок не формальность: красное на
// порче без зелёного на исправном не отличает зрячий прибор от вечно-красного.
await proba('0. порог НЕ перейдён → вставок нет, решение не тронуто', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 100)
  const { d } = await shag(handlers)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d) + ', ждали 0')
  if (d.kind !== 'enter') throw new Error('решение подменено: ' + d.kind)
})

// ── A. переход порога → РОВНО ОДНА вставка за цикл ────────────────────────────
await proba('A. порог перейдён → одна вставка, на следующем шаге второй НЕТ', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)
  if (vstavok(a.d) !== 1) throw new Error('первый шаг: вставок ' + vstavok(a.d) + ', ждали 1')
  const text = a.d.messages[0]?.content?.[0]?.text ?? ''
  if (!/900/.test(text) || !/1000/.test(text)) throw new Error('в тексте нет чисел: ' + text.slice(0, 80))
  if (!a.kriki.some((k) => /напоминание вставлено/.test(k))) throw new Error('следа в stderr нет')
  const b = await shag(handlers)
  if (vstavok(b.d) !== 0) throw new Error('второй шаг: вставок ' + vstavok(b.d) + ', ждали 0')
})

// ── B. новый цикл после возврата под порог ────────────────────────────────────
// 🔴 A и B ОБЯЗАНЫ РАЗЛИЧАТЬСЯ ЧИСЛОМ. Совпали — одна из порч не та: проверь, что
// занятость реально опускалась под порог, а не просто прошло время.
await proba('B. под порог и снова выше → вставка ВТОРАЯ (новый цикл)', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const a = await shag(handlers)
  raskhod(ctx, 100)           // компакт прошёл: занятость вернулась
  raskhod(ctx, 950)           // и снова выросла
  const b = await shag(handlers)
  const itogo = vstavok(a.d) + vstavok(b.d)
  if (itogo !== 2) throw new Error('всего вставок ' + itogo + ', ждали 2')
  if (!/950/.test(b.d.messages[0]?.content?.[0]?.text ?? '')) throw new Error('во второй вставке число не обновилось')
})

// ── C. отказ выше по цепи → не вмешиваемся ────────────────────────────────────
await proba('C. decision.kind = reject → вставки нет и решение НЕ подменено', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  const { d } = await shag(handlers, { kind: 'reject', messages: [] })
  if (d.kind !== 'reject') throw new Error('решение подменено: ' + d.kind)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d))
})

// ── D. предел не задан → вставок нет вовсе ────────────────────────────────────
// Согласовано с шапкой пакета: «молчание нуджа не означает запаса». Вставлять
// напоминание при неизвестном пределе значило бы утверждать то, чего пакет не знает.
await proba('D. predel = 0 → вставок 0, крик о незаданном пределе на месте', async () => {
  const { handlers, ctx, kriki } = podnyat({ predel: 0 })
  raskhod(ctx, 999999)
  const { d } = await shag(handlers)
  if (vstavok(d) !== 0) throw new Error('вставок ' + vstavok(d) + ' при predel=0')
  if (!kriki.some((k) => /предел контекста НЕ ЗАДАН/.test(k))) throw new Error('крика о пределе нет')
})

// ── E. флаг гасится ДО сборки → повтора на следующем шаге нет ─────────────────
// 🔴 Единственная проба, где проверяется СОСТОЯНИЕ, а не текст: ломаем сборку и
// смотрим, не осталось ли право на вставку взведённым. Текстом это не увидеть.
await proba('E. исключение в сборке → на следующем шаге вставки НЕТ', async () => {
  const { handlers, ctx } = podnyat({ predel: 1000, dolyaTrevogi: 0.8 })
  raskhod(ctx, 900)
  // Ломаем сборку: messages не массив — распаковка [...decision.messages] бросит.
  let upalo = false
  try { await shag(handlers, { kind: 'enter', messages: null }) } catch { upalo = true }
  if (!upalo) throw new Error('сборка не упала — порча НЕ ВНЕСЛАСЬ, проба ничего не проверила')
  const b = await shag(handlers)
  if (vstavok(b.d) !== 0) throw new Error('после падения вставка повторилась: ' + vstavok(b.d))
})

console.log(`итог: ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
