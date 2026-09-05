/**
 * Стенд ДОГОВОРА фильтра: что ядро обещает наружу и в какой форме.
 *
 * 🔴 ЗАЧЕМ. Вывоз памяти (Э8.5) — отдельный пакет, и он обязан пропускать записи через
 * ТОТ ЖЕ код, что и вход, а не через свою копию правил: две копии правил расходятся, и
 * расхождение видно только при сверке самих файлов. Значит `najti_sekret` перестаёт быть
 * внутренним делом ядра и становится ДОГОВОРОМ.
 *
 * 🔴 ЧТО ИМЕННО СТЕРЕЖЁТ ЭТОТ СТЕНД. Не работу фильтра — её проверяет соседний стенд на
 * 50+ пробах. Здесь: остались ли на месте ИМЯ, ЧИСЛО АРГУМЕНТОВ и ФОРМА ОТВЕТА. Сегодня
 * они держатся на том, что я так написала, а не на объявлении — то есть следующая правка
 * ядра сломала бы чужой пакет молча, и узнали бы мы об этом от получателя.
 *
 * ⚠️ ЧЕГО СТЕНД НЕ ДОКАЗЫВАЕТ: что фильтр СУДИТ верно. Договор — про форму, а не про
 * годность. Зелёный договор при негодном правиле возможен и это не противоречие.
 */
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
    // 🔴 ПРИРОДА ТЕЛА ПРОВЕРЯЕТСЯ, А НЕ ПОДРАЗУМЕВАЕТСЯ (05.09.2026). Прогонщик синхронный —
    // ждать не умеет. Ожидающее тело вернёт промис, try его НЕ поймает, проба зачтётся
    // мгновенно, а брошенное внутри уйдёт в никуда. Такая проба не краснеет НИКОГДА, ни на
    // каких данных: это не ложно-зелёное, а отсутствие проверки под видом проверки.
    // Замер 05.09: семь стендов ядра из десяти зеленели на подложенном падении в ожидающем
    // теле. Действующих async-тел не было ни одного — беда была впереди, и закрыта устройством.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // 🔴 ВОЗВРАТ ТЕЛА УЧИТЫВАЕТСЯ (05.09.2026). Обёртка краснела только на ИСКЛЮЧЕНИИ,
    // а возврат выбрасывала — проба вида «вернуть true либо строку с причиной» была
    // зелёной при ЛЮБОМ содержимом. Замер фактом: вписала в каждый стенд ядра пробу,
    // заведомо возвращающую строку, — ПЯТЬ стендов её не заметили.
    if (typeof vernulos === 'string') throw new Error(vernulos);
    if (vernulos === false) throw new Error('тело пробы вернуло false без причины');
    proshlo++; console.log('  ✅ ' + imya) }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 200)) }
}

// Договор: имя -> сколько аргументов принимает. Меняешь — меняешь чужие пакеты.
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

// 🔴 ФОРМА ОТВЕТА — САМОЕ ХРУПКОЕ. Потребитель читает `klass` и `pozicia`; переименуй их —
// и чужой пакет получит undefined вместо класса, то есть примет секрет за чистый текст.
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

// 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ САМОГО ДОГОВОРА. Без него стенд зеленел бы и на пустом модуле:
// «все имена на месте» верно для пустого списка, «форма ответа» — для функции-заглушки.
proba('контроль зрячести: подставной модуль без имени роняет проверку', () => {
  const podstavnoj = { ochistit: () => {} }
  const net = Object.keys(DOGOVOR).filter((i) => typeof podstavnoj[i] !== 'function')
  if (net.length === 0) throw new Error('проверка имён слепа: пропустила пустой модуль')
})

proba('контроль зрячести: заглушка с другой формой ответа роняет проверку', () => {
  const zaglushka = () => ({ tip: 'secret' })   // поле названо иначе
  const r = zaglushka('пароль: Hunter22xy')
  if (typeof r.klass === 'string') throw new Error('проверка формы слепа: приняла чужое поле')
})

console.log(`итог: ${proshlo} из ${vsego}`)
process.exit(proshlo === vsego ? 0 : 1)
