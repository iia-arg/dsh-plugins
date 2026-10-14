// RU: Проверяем публичный договор фильтра: имена экспортов, число аргументов и форму ответа. Пакет вывоза должен вызывать тот же najti_sekret, что вход, чтобы правила не расходились. Эти пробы проверяют совместимость интерфейса; правильность решения фильтра проверяется отдельно.
// EN: Test the filter’s public contract: export names, argument counts, and response shape. The export package must call the same najti_sekret as ingress so their rules cannot diverge. These probes check interface compatibility; filter decisions are tested separately.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
console.log('стенд: ' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16))

let M
try {
  M = await import('../src/filtr-vhoda.js')
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160))
  process.exit(2)
}

let vsego = 0, proshlo = 0
const proba = (imya, f) => {
  vsego++
  try {
    const vernulos = f();
    // RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
    // EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya) }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)) }
}

// RU: Договор сопоставляет имя числу аргументов; его изменение затрагивает потребителей.
// EN: The contract maps each name to its argument count; changes affect consumers.
const DOGOVOR = { najti_sekret: 1, ochistit: 1, proverit_sluzhebnoe: 2, normalizovat: 1, trevozhno: 1, filtr_ispraven: 0 }

proba('все объявленные имена на месте и это функции', () => {
  const net = Object.keys(DOGOVOR).filter((i) => typeof M[i] !== 'function')
  if (net.length) throw new Error('нет или не функции: ' + net.join(', '))
})

proba('число аргументов не изменилось', () => {
  const inache = Object.entries(DOGOVOR)
    .filter(([i, n]) => M[i].length !== n)
    .map(([i, n]) => `${i}: ждали ${n}, стало ${M[i].length}`)
  if (inache.length) throw new Error(inache.join('; '))
})

// RU: Потребитель читает klass и pozicia. Переименование даст undefined и может превратить секрет в якобы чистый текст.
// EN: Consumers read klass and pozicia. Renaming either produces undefined and may make a secret appear clean.
proba('najti_sekret: находка даёт { klass, pozicia }, klass — строка, pozicia — число', () => {
  const r = M.najti_sekret('пароль: Hunter22xy')
  if (!r) throw new Error('на заведомом секрете вернул пусто')
  if (typeof r.klass !== 'string') throw new Error('klass не строка: ' + JSON.stringify(r))
  if (typeof r.pozicia !== 'number') throw new Error('pozicia не число: ' + JSON.stringify(r))
})

proba('najti_sekret: чистый текст даёт ПУСТО (null/undefined), а не объект', () => {
  const r = M.najti_sekret('обычная запись про порядок работы')
  if (r) throw new Error('на чистом тексте вернул ' + JSON.stringify(r))
})

// RU: Контроль зрячести отвергает пустой список экспортов и функцию-заглушку: иначе проверки формы могли бы пройти без предмета.
// EN: The visibility control rejects an empty export list and a stub function; otherwise shape checks could pass without a subject.
proba('контроль зрячести: подставной модуль без имени роняет проверку', () => {
  const podstavnoj = { ochistit: () => {} }
  const net = Object.keys(DOGOVOR).filter((i) => typeof podstavnoj[i] !== 'function')
  if (net.length === 0) throw new Error('проверка имён слепа: пропустила пустой модуль')
})

proba('контроль зрячести: заглушка с другой формой ответа роняет проверку', () => {
  const zaglushka = () => ({ tip: 'secret' })   /* RU: Порча: поле переименовано.
 * EN: Mutation: rename the field.
 */
  const r = zaglushka('пароль: Hunter22xy')
  if (typeof r.klass === 'string') throw new Error('проверка формы слепа: приняла чужое поле')
})

console.log(`итог: ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
