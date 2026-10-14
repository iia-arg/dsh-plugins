// Стенд правок (а) и (б) по потере писем при перезапуске.
// 🔴 ПОРЧА ОБЯЗАНА ПЕЧАТАТЬ ФАКТ ВНЕСЕНИЯ и делать окно ШИРОКИМ намеренно: окно между
// подачей и снятием узкое, случайно в него не попасть — проверилась бы не та ветка.
import fs from 'fs'
const F = '/opt/agent-plugins/dsh-telegram-multiagent/src/index.js'
const src = fs.readFileSync(F, 'utf8')
let bed = 0, vsego = 0
const proba = (imya, f) => { vsego++; try { const r = f(); if (r !== true) throw new Error(r); console.log('  ✅ ' + imya) }
  catch (e) { bed++; console.log('  🔴 ' + imya + '\n     ' + e.message) } }

// B-N-949 (26.09): пробы (а) СНЯТЫ — предмет законно переписан. Правку (а) («убирать письмо после снятия
// из очереди») заменил механизм квитанций telegram-multiagent 1.5.20 (dsh-plugins e3b6017, 18.09): письмо
// целиком ложится в receipts.sqlite ДО снятия исходника, исходник снимается после flush («source_released»).
// Вызовов nudgeUntilClaimed с '[a2a]'/'[ящик]' больше нет, у функции шестой довод pobudit (35cca1b, 1.5.24).
// Свойство «письмо не теряется при перезапуске» стерегут поведенческие стенды пакета в обходчике:
// test/stend-receipt-sigkill.mjs и test/stend-receipt-recovery.mjs. Текстовая проба здесь его не видела бы.

proba('(б) при подъёме считается очередь и НЕ ПУСТА кричит', () =>
  /\[очередь при подъёме\] 🔴 НЕ ПУСТА/.test(src) || 'строки про непустую очередь нет')

proba('(б) недоступный каталог — НЕ ИЗМЕРЕНО, а не «пусто»', () =>
  /НЕ ИЗМЕРЕНО \(это не «пусто»\)/.test(src) || 'слепота выдаётся за пустоту')

proba('(б) названо, чего строка НЕ говорит (сколько потеряно)', () =>
  /Потерянных не покажет ничто/.test(src) || 'граница не названа')

const ZHDYOM = 3
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
