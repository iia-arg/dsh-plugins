/**
 * RU: Стенд опознания видов сжатия и арифметики расхода (src/vidy-szhatiya.js). Первая проба — на заведомо
 *     исправном. Запуск: node test/stend-vidov.mjs; код 0 — всё зелёное, 1 — красные.
 * EN: Stand for compaction kind detection and spend arithmetic (src/vidy-szhatiya.js). The first probe is on a
 *     known-good case. Run: node test/stend-vidov.mjs; exit 0 — all green, 1 — red.
 */
import { vidKonca, rashod, davlenie, neznakomyePolya, dlitelnost } from '../src/vidy-szhatiya.js'

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const vernulos = telo()
  if (vernulos && typeof vernulos.then === 'function') {
    bed += 1
    console.log(`❌ ${imya}: тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный — вынеси ожидание наружу`)
    return
  }
  if (vernulos === true) { console.log(`✅ ${imya}`) }
  else { bed += 1; console.log(`❌ ${imya}: ${vernulos}`) }
}

proba('контроль: заведомо исправное — естественное сжатие', () =>
  vidKonca({ compactionId: 'a' }) === 'estestvennoe' || 'ожидалось estestvennoe')

proba('принудительное опознаётся по команде человека', () =>
  vidKonca({ compactionId: 'a', sourceCommandId: 'c1' }) === 'prinuditelnoe' || 'не опознано')

proba('ПРОВАЛ проверяется ПЕРВЫМ — даже когда есть команда человека', () =>
  vidKonca({ sourceCommandId: 'c1', error: 'oops' }) === 'proval'
  || 'провал с командой человека прочтён как принудительное — провалы попадут в счёт сжатий')

proba('расход: поля нет → «не сообщён», а НЕ ноль', () => {
  const r = rashod(undefined)
  return (r.est === false && r.vsego === null) || `ожидалось {est:false,vsego:null}, вышло ${JSON.stringify(r)}`
})

proba('расход: пустой объект → тоже «не сообщён»', () => {
  const r = rashod({})
  return (r.est === false && r.vsego === null) || `пустой usage прочтён как ноль: ${JSON.stringify(r)}`
})

// RU: ═══ АРИФМЕТИКА ПЛАТФОРМЫ, А НЕ ЗДРАВЫЙ СМЫСЛ ═══
//     Прежняя проба здесь гоняла `{ input: 10, output: 5 }` — ФОРМУ, КОТОРОЙ У ПЛАТФОРМЫ НЕТ. Объявленные имена
//     — inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens / reasoningTokens. Проба зеленела
//     потому, что старая функция складывала ЛЮБОЕ число, а не потому, что считала верно: она отвечала на свой
//     вопрос, а читалась как ответ на наш. Форму подставных данных надо брать у объявления, иначе стенд
//     стережёт выдумку.
// EN: ═══ PLATFORM ARITHMETIC, NOT COMMON SENSE ═══
//     The earlier probe here used `{ input: 10, output: 5 }` — A SHAPE THE PLATFORM DOES NOT HAVE. The declared
//     names are inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens / reasoningTokens. The probe
//     was green because the old function added up ANY number, not because it counted correctly: it answered its
//     own question while being read as an answer to ours. The shape of fake data must come from the
//     declaration, otherwise the stand guards a fiction.

proba('расход: непересекающиеся вёдра складываются', () =>
  rashod({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 }).vsego === 20
  || 'сумма не сошлась')

proba('🔴 расход: reasoning НЕ прибавляется — он внутри outputTokens', () => {
  const bez = rashod({ inputTokens: 10, outputTokens: 20 }).vsego
  const s = rashod({ inputTokens: 10, outputTokens: 20, reasoningTokens: 5 }).vsego
  return (bez === 30 && s === 30) || `удвоение reasoning: без ${bez}, с ним ${s} (платформа: «without double-counting reasoning output»)`
})

proba('🔴 давление на контекст: вход и кэш, БЕЗ выхода', () => {
  const d = davlenie({ inputTokens: 100, outputTokens: 400, cacheReadTokens: 50 }).vsego
  return d === 150 || `давление ${d}, ожидалось 150: выход в контекст ЭТОГО вызова не входит`
})

proba('давление и расход — РАЗНЫЕ величины на одних данных', () => {
  const u = { inputTokens: 100, outputTokens: 400, cacheReadTokens: 50 }
  return (davlenie(u).vsego !== rashod(u).vsego)
    || 'величины совпали — значит одна из них считается не тем, и подмена пройдёт молча'
})

proba('🔴 чужая форма usage → «не сообщён», а поля НАЗВАНЫ', () => {
  const r = rashod({ input: 10, output: 5 })
  if (r.est !== false) return `форма не платформы прочтена как годная: ${JSON.stringify(r)}`
  const ch = neznakomyePolya({ input: 10, output: 5 })
  return (ch.includes('input') && ch.includes('output'))
    || `незнакомые поля не названы: ${JSON.stringify(ch)}`
})

proba('totalTokens (объявлен в DSH 0.2) — не «незнакомое поле» и не слагаемое давления/расхода', () => {
  const u = { inputTokens: 11615, outputTokens: 21, cacheReadTokens: 9472, totalTokens: 21108 }   // RU: замер одного хода с моделью deepseek-v4-pro · EN: a measured single turn with the deepseek-v4-pro model
  const ch = neznakomyePolya(u)
  if (ch.length) return `объявленное поле названо незнакомым: ${JSON.stringify(ch)}`
  if (davlenie(u).vsego !== 21087) return `давление ${davlenie(u).vsego}, ожидалось 21087 (вход+кэш, итог не слагаемое)`
  return rashod(u).vsego === 21108 || `расход ${rashod(u).vsego}, ожидалось 21108 (вёдра; итог вызова не прибавлен второй раз)`
})

proba('длительность: без метки начала → null, а не ноль', () =>
  dlitelnost(undefined, 5000) === null || 'отсутствие метки прочтено как нулевая длительность')

proba('длительность: отрицательная (метки переставлены) → null', () =>
  dlitelnost(9000, 1000) === null || 'отрицательная длительность выдана за число')

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
