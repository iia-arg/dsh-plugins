// RU: Изолированный стенд stend-dostupa-sluzhb.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-dostupa-sluzhb.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)


const KORDIS = process.env.KORDIS || (() => {
  try { return import.meta.resolve('@deepseek-ai/cordis') } catch { return '@deepseek-ai/cordis' }
})()

let text, Context
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}
try { ({ Context } = await import(KORDIS)) } catch (e) {
  console.log(`СЛЕПОТА: cordis не загружается (${KORDIS}): ${e?.message ?? e}`)
  console.log('  Пакет, лежащий ВНЕ дерева зависимостей платформы, разрешить имя не может.')
  console.log('  Задайте путь явно:')
  console.log('  KORDIS=<путь к платформе>/node_modules/@deepseek-ai/cordis/lib/index.js node test/stend-dostupa-sluzhb.mjs')
  process.exit(2)
}
if (typeof Context !== 'function') { console.log('СЛЕПОТА: в cordis нет Context'); process.exit(2) }

let ok = 0, bad = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`  ok   ${n}`) } else { bad++; console.log(`  FAIL ${n}\n       ${s ?? ''}`) } }

console.log('=== 1. Правило платформы, проверенное НАСТОЯЩИМ Context ===')
const root = new Context()
let brosok = null, cherezGet, brosokGet = null
await root.plugin({
  name: 'proba-dostupa',
  apply(ctx) {
    try { void ctx.commands } catch (e) { brosok = e?.message ?? String(e) }
    try { cherezGet = ctx.get('commands') } catch (e) { brosokGet = e?.message ?? String(e) }
  },
})
t('чтение ctx.<служба> свойством БРОСАЕТ без inject', brosok !== null && /without inject/.test(brosok),
  `бросок: ${brosok ?? 'не было'}`)

t('ctx.get не бросает', brosokGet === null, `бросок: ${brosokGet}`)
t('ctx.get отдаёт undefined на несмонтированной службе', cherezGet === undefined, String(cherezGet))

console.log('\n=== 2. Предмет следует правилу ===')

const kod = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const pryamye = [...kod.matchAll(/ctx\.(commands|compaction|tokenMeter|sessions|llm)\b/g)].map((m) => m[1])
t('в коде нет чтения служб свойством', pryamye.length === 0, `найдено: ${pryamye.join(', ') || '—'}`)
t('реестр команд берётся через ctx.get', /ctx\.get\('commands'\)/.test(kod), 'нет ctx.get(\'commands\')')

console.log('\n=== 3. Бросок НЕ уходит мимо ответа в чат ===')


const blok = kod.match(/if \(text\.startsWith\('\/'\)\) \{[\s\S]*?\n    \}/)
t('блок команд найден в предмете', blok !== null, 'разбор не удался')
if (blok) {
  const b = blok[0]
  const iTry = b.indexOf('try {'), iGet = b.indexOf("ctx.get('commands')")
  t('получение службы ВНУТРИ try', iTry !== -1 && iGet !== -1 && iTry < iGet,
    `try на ${iTry}, ctx.get на ${iGet}`)
  t('у блока есть catch с ответом в чат', /catch \(e\) \{[\s\S]*?tg\.send\(chatId/.test(b), 'catch не отвечает в чат')
}
t('общий catch обновления тоже отвечает в чат',
  /ошибка обработки обновления[\s\S]{0,600}?tg\.send\(komu/.test(kod), 'общий catch молчит в чат')

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)

const ZHDYOM = 9
if (ok + bad !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : 0)
