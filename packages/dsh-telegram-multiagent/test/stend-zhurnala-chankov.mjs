// RU: Изолированный стенд stend-zhurnala-chankov.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-zhurnala-chankov.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readFileSync } from 'node:fs'


const SRC = process.argv[2] || process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname
console.log(`  предмет: ${SRC}`)

let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

let ok = 0, bad = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`  ok   ${n}`) } else { bad++; console.log(`  FAIL ${n}\n       ${s ?? ''}`) } }

console.log('=== Журнал чанков: assistant/chunk молчит, остальное печатается ===')

const kod = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')


const blok = kod.match(/ctx\.on\('session\/event', \(session, event\) => \{[\s\S]*?const sid = String\(session\?\.id \?\? ''\);/)
t('обработчик session/event найден', blok !== null, 'разбор не удался')

if (blok) {
  const b = blok[0]
  const guard = b.indexOf(`if (event.type !== 'assistant/chunk')`)
  const logLine = b.indexOf('log(`[event] type=')
  t('в обработчике есть guard против assistant/chunk', guard !== -1, 'guard не найден')
  t('строка [event] type= есть в обработчике', logLine !== -1, 'лога события нет')

  t('лог [event] type= внутри guard', guard !== -1 && logLine !== -1 && guard < logLine,
    `guard на ${guard}, лог на ${logLine}`)
  t('guard отсекает именно assistant/chunk', /!== 'assistant\/chunk'/.test(b), 'имя типа в guard иное')
}

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)

const ZHDYOM = 5
if (ok + bad !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : 0)
