/** Стенд опознания видов сжатия. Первая проба — на заведомо исправном. */
import { vidKonca, rashod, dlitelnost } from '../src/vidy-szhatiya.js'

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

proba('расход: числа складываются', () =>
  rashod({ input: 10, output: 5 }).vsego === 15 || 'сумма не сошлась')

proba('длительность: без метки начала → null, а не ноль', () =>
  dlitelnost(undefined, 5000) === null || 'отсутствие метки прочтено как нулевая длительность')

proba('длительность: отрицательная (метки переставлены) → null', () =>
  dlitelnost(9000, 1000) === null || 'отрицательная длительность выдана за число')

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
