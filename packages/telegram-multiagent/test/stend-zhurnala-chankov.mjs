// Стенд ЖУРНАЛА ЧАНКОВ: assistant/chunk не должен давать строку в журнал.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// 🔴 ЗАЧЕМ. 06.09.2026 замер 06.09: dsh.service одного агента пишет 236 334 строки
// за сутки, из них assistant/chunk — 13 665 из ~13,8 тыс. строк события за 11 минут
// (99%). Причина — лог КАЖДОГО потокового чанка отдельной строкой. Длинный ответ
// упирается в предел journald (10 000 сообщений / 30 с на службу), journald МОЛЧА
// выбрасывает хвост окна вместе с нужными строками (compaction/end), и сторож
// компакта этого не видит. Правка: чанки не журналируем, полное сообщение
// по-прежнему даёт assistant/message одной строкой на ответ.
//
// ПОРЧА (что ловит этот стенд): снять guard `event.type !== 'assistant/chunk'` —
// и журнал снова тонет в чанках. Стенд обязан покраснеть.

import { readFileSync } from 'node:fs'

const SRC = process.env.SVYAZ_SRC || new URL('../src/index.js', import.meta.url).pathname

let text
try { text = readFileSync(SRC, 'utf8') } catch (e) {
  console.log(`СЛЕПОТА: предмет ${SRC} не читается: ${e?.message ?? e}`); process.exit(2)
}

let ok = 0, bad = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`  ok   ${n}`) } else { bad++; console.log(`  FAIL ${n}\n       ${s ?? ''}`) } }

console.log('=== Журнал чанков: assistant/chunk молчит, остальное печатается ===')
// Комментарии не в счёт: имя типа в пояснении никого не ломает.
const kod = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// Обработчик session/event: от его начала до первой строки sid (дальше уже логика
// доставки, а не лог типа события).
const blok = kod.match(/ctx\.on\('session\/event', \(session, event\) => \{[\s\S]*?const sid = String\(session\?\.id \?\? ''\);/)
t('обработчик session/event найден', blok !== null, 'разбор не удался')

if (blok) {
  const b = blok[0]
  const guard = b.indexOf(`if (event.type !== 'assistant/chunk')`)
  const logLine = b.indexOf('log(`[event] type=')
  t('в обработчике есть guard против assistant/chunk', guard !== -1, 'guard не найден')
  t('строка [event] type= есть в обработчике', logLine !== -1, 'лога события нет')
  // Лог обязан стоять ПОСЛЕ guard (внутри блока if), иначе guard ни от чего не защищает.
  t('лог [event] type= внутри guard', guard !== -1 && logLine !== -1 && guard < logLine,
    `guard на ${guard}, лог на ${logLine}`)
  t('guard отсекает именно assistant/chunk', /!== 'assistant\/chunk'/.test(b), 'имя типа в guard иное')
}

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)
// 🔴 Канарейка точного числа: вырезанный раздел иначе проходит кодом 0.
const ZHDYOM = 5
if (ok + bad !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : 0)
