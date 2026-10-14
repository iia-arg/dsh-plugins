// Стенд уборки письма: файл обязан убираться на КАЖДОМ выходе побудки — иначе лавина.
// 🔴 Функция берётся ИЗ БОЕВОГО ФАЙЛА, а не переписывается сюда: проба про предмет.
import { readFileSync } from 'node:fs'
const B = '/opt/agent-plugins/dsh-telegram-multiagent/src/index.js'
const src = readFileSync(B, 'utf8').split('\n')
const n1 = src.findIndex((l) => l.startsWith('  function nudgeUntilClaimed'))
const n2 = src.findIndex((l, i) => i > n1 && l === '    })();')
if (n1 < 0 || n2 < 0) { console.log('🔴 СЛЕПОТА: функция не вырезалась — стенд недействителен'); process.exit(2) }
const telo = src.slice(n1, n2 + 2).join('\n')

let zhurnal = []
const log = (s) => zhurnal.push(s)
const sdelat = new Function('log', `${telo}; return nudgeUntilClaimed;`)(log)

const zhdat = (ms) => new Promise((r) => setTimeout(r, ms))
let bed = 0, vsego = 0
async function proba(imya, agent, otmetka, zhdu) {
  vsego++
  zhurnal = []
  let ubrano = 0
  sdelat(agent, '[проба]', 2000, otmetka, () => { ubrano++ })
  await zhdat(3000)
  const zh = zhurnal.join(' | ')
  if (ubrano === zhdu) console.log(`  ✅ ${imya} (уборок ${ubrano})`)
  else { bed++; console.log(`  🔴 ${imya}: уборок ${ubrano}, ждала ${zhdu}\n     журнал: ${zh.slice(0, 150)}`) }
}

console.log('── КАЖДЫЙ ВЫХОД ОБЯЗАН УБРАТЬ ФАЙЛ РОВНО ОДИН РАЗ ──')
// 1. письмо снято быстро — лучший случай
let n = 0
await proba('снятие агентом', { inbox: { get hasPending() { return ++n < 3 } }, status: 'idle', wakeDriver() {} }, null, 1)

// 2. 🔴 ГЛАВНАЯ: агент занят ВСЁ время — ровно бой, 240 проверок из 240, строк «забрано» ноль.
//    Прежняя редакция здесь НЕ убирала файл, и ящик опрашивается каждые ~25 с → лавина.
await proba('занят всё время → выход по бюджету', { inbox: { hasPending: true }, status: 'running', wakeDriver() {} }, null, 1)

// 3. очередь недоступна — ранний возврат
await proba('очередь недоступна', { inbox: { hasPending: 'не булево' }, status: 'idle', wakeDriver() {} }, null, 1)

// 4. wakeDriver пропал
await proba('wakeDriver недоступен', { inbox: { hasPending: true }, status: 'idle', wakeDriver: null }, null, 1)

// 5. стоп побудок по метке обрыва
await proba('стоп побудок', { inbox: { hasPending: true }, status: 'idle', wakeDriver() {} },
  () => ({ kogda: Date.now() + 1000, why: 'подставной обрыв' }), 1)

// 6. письма без уборки (старые вызовы) не должны падать
vsego++
try { sdelat({ inbox: { hasPending: true }, status: 'running', wakeDriver() {} }, '[без уборки]', 1200, null, null)
      await zhdat(2000); console.log('  ✅ вызов без уборки не падает') }
catch (e) { bed++; console.log(`  🔴 вызов без уборки упал: ${e.message}`) }

const ZHDYOM = 6
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
