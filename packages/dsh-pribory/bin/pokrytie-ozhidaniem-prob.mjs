#!/usr/bin/env node
/**
 * Прибор: у скольких стендов есть СОБСТВЕННАЯ защита от пропажи пробы.
 *
 * ЗАЧЕМ. Обёртка стенда считает пробы ВНУТРИ себя. Проба, которая не вызвалась вовсе
 * (стоит после process.exit, попала в неисполнимую ветку, потеряна при правке), не
 * падает, а ИСЧЕЗАЕТ: итог «26 из 26» честен и зелён при 28 заведённых. Замер 06.09:
 * стенд печатал «34 из 34» при 35 пробах.
 *
 * 🔴 ПОЧЕМУ СЧИТАЕМ ЗАЩИТУ, А НЕ САМИ ПРОБЫ. Внешний счёт «заведено в тексте против
 * учтённого прогоном» негоден по построению, и это ЗАМЕРЕНО, а не предположено
 * (07.09, четыре редакции прибора, четыре разных промаха):
 *   • имя обёртки снаружи опознаётся только гаданием: по телу — нет дешёвой границы
 *     (окно 25 строк не достаёт до catch, окно 60 захватывает соседнюю функцию,
 *     граница по объявлению режется на внутреннем `const`); по числу вызовов —
 *     промахивается там, где вспомогательную зовут чаще проб (stend-vstavki: raskhod
 *     10 вызовов против 8 проб);
 *   • обе «пропажи» последней редакции оказались ЛОЖНЫМИ: в stend-ostanovki 12 вызовов
 *     в тексте против 11 учтённых — это ДВЕ ВЗАИМОИСКЛЮЧАЮЩИЕ ВЕТКИ, и расхождение там
 *     законно; в stend-vstavki выбрана не та обёртка.
 * ⇒ «M по тексту ≠ N по прогону» само по себе НЕ признак пропажи. Годный признак живёт
 *   ВНУТРИ стенда: стенд объявляет, сколько проб ждёт в СВОЕЙ ветке, и кричит при
 *   несовпадении. Образец у нас уже есть — mcp-bridge/test/stend-ostanovki.mjs:
 *       const ZHDYOM = BOEVOJ ? 3 : 11
 *       if (vsego !== ZHDYOM) { console.log('🔴 КАНАРЕЙКА: часть проверок не состоялась'); process.exit(2) }
 *
 * 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ БЫЛ ТАВТОЛОГИЧНЫМ, И ЭТО ИСПРАВЛЕНО ЗАМЕРОМ (07.09.2026).
 * Прежде я подставляла файл с образцом `ZHDYOM` и убеждалась, что признак его находит, —
 * то есть проверяла, что грep находит то, что в него заложено. Правило соседнего агента: контроль
 * годен, только если добывает предмет ИНАЧЕ; две маски по одному пути — не проверка, а
 * повторение, и оба прибора слепы одинаково, подтверждая друг друга.
 * Проверено ПОВЕДЕНИЕМ, а не текстом: у mcp-bridge/test/stend-ostanovki.mjs убрана одна
 * проба (имитация пропажи) — стенд напечатал «🔴 КАНАРЕЙКА: часть проверок не состоялась»
 * и вернул код 2; на целом стенде код 0. Значит признак в тексте связан с работающей
 * защитой, а не только с наличием слова.
 * ⚠️ Проверен ОДИН стенд из двенадцати, помеченных как защищённые. Про остальные одиннадцать
 * связь признака с поведением НЕ измерена — знаю только, что слово в них есть.
 *
 * ГРАНИЦА ПРИБОРА, названа здесь, а не в шапке отчёта: он меряет НАЛИЧИЕ защиты, а не
 * её верность. Стенд с защитой, где ожидаемое число вписано неверно, тут зачтётся
 * покрытым — это ловится прогоном самого стенда, не этим счётом.
 * EN: Tool: how many stands have their OWN protection against a lost probe.
 *     WHY. A stand's wrapper counts probes INSIDE itself. A probe that was never called (it stands after
 *     process.exit, fell into an unreachable branch, was lost in an edit) does not fail, it VANISHES: the
 *     result "26 of 26" is honest and green with 28 set up. Measured 06.09: the stand printed "34 of 34" with
 *     35 probes.
 *     🔴 WHY WE COUNT PROTECTION, NOT THE PROBES THEMSELVES. An external count "set up in the text against
 *     counted by the run" is invalid by construction, and this was MEASURED, not assumed (07.09, four editions
 *     of the tool, four different misses):
 *     • the wrapper's name can be identified from outside only by guessing: by body — there is no cheap
 *     boundary (a 25-line window does not reach catch, a 60-line window grabs the neighbouring function, a
 *     boundary by declaration is cut at an inner `const`); by call count — it misses where a helper is called
 *     more often than probes (stend-vstavki: raskhod 10 calls against 8 probes);
 *     • both "losses" of the last edition turned out FALSE: in stend-ostanovki 12 calls in the text against 11
 *     counted — these are TWO MUTUALLY EXCLUSIVE BRANCHES, and the divergence there is legitimate; in
 *     stend-vstavki the wrong wrapper was chosen.
 *     ⇒ "M by text ≠ N by run" is NOT a sign of loss by itself. A valid sign lives INSIDE the stand: the stand
 *     declares how many probes it expects in ITS branch and shouts on a mismatch. We already have a model —
 *     mcp-bridge/test/stend-ostanovki.mjs: const ZHDYOM = BOEVOJ ? 3 : 11; if (vsego !== ZHDYOM) {
 *     console.log('🔴 КАНАРЕЙКА: часть проверок не состоялась'); process.exit(2) }
 *     🔴 THE BLINDNESS CONTROL WAS TAUTOLOGICAL, AND THIS WAS FIXED BY MEASUREMENT (07.09.2026). Previously I
 *     substituted a file with the `ZHDYOM` pattern and made sure the sign found it — i.e. checked that grep
 *     finds what was put into it. A neighbouring agent's rule: a control is valid only if it obtains the
 *     subject DIFFERENTLY; two masks along one path are not a check but a repetition, and both tools are
 *     equally blind, confirming each other.
 *     Checked by BEHAVIOUR, not text: one probe was removed from mcp-bridge/test/stend-ostanovki.mjs
 *     (simulating a loss) — the stand printed "🔴 КАНАРЕЙКА: часть проверок не состоялась" and returned code 2;
 *     on the whole stand code 0. So the sign in the text is linked to working protection, not just to the
 *     presence of a word.
 *     ⚠️ ONE stand of the twelve marked as protected was checked. For the other eleven the link between the
 *     sign and behaviour is NOT measured — I only know the word is there.
 *     THE TOOL'S LIMIT, named here and not in the report header: it measures the PRESENCE of protection, not
 *     its correctness. A stand with protection where the expected number is written wrongly will count as
 *     covered here — that is caught by running the stand itself, not by this count.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// Файл настройки пакета dsh-pribory: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение ключа.
// Путь меняет переменная DSH_PRIBORY_CONF. Порядок: довод/переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
// EN: Settings file of the dsh-pribory package: "KEY=value" lines, a line starting with "#" is a comment; the
//     last occurrence of a key wins.
//     The DSH_PRIBORY_CONF variable changes the path. Order: argument/variable → file → neutral default;
//     nothing at all — BLINDNESS, code 2.
const KONF = process.env.DSH_PRIBORY_CONF || '/etc/dsh-pribory/dsh-pribory.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };

const koren = process.argv[2] ?? konf('POKRYTIE_KOREN')
if (!koren) { console.error('СЛЕПОТА: корень обхода не задан — довод или ключ POKRYTIE_KOREN в ' + KONF); process.exit(2) }
const ZASHCHITA = /ZHDYOM|ЖДЁМ|ждём\s*\$\{|vsego\s*!==?\s*\d|proshlo\s*\+\s*\w+\s*!==?\s*\d/

const stendy = []
const obojti = (kat) => {
  for (const e of readdirSync(kat, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(kat, e.name)
    if (e.isDirectory()) obojti(p)
    else if (/^stend.*\.(mjs|js)$/.test(e.name)) stendy.push(p)
  }
}
try { obojti(koren) } catch (e) { console.error('СЛЕПОТА: обход ' + koren + ' не завершён: ' + e.message); process.exit(2) }
stendy.sort()

const s_zashchitoj = [], bez = []
for (const put of stendy) {
  let text; try { text = readFileSync(put, 'utf8') } catch (e) { console.error('СЛЕПОТА: ' + put + ': ' + e.message); process.exit(2) }
  ;(ZASHCHITA.test(text) ? s_zashchitoj : bez).push(put.replace(koren + '/', ''))
}

console.log(`стендов всего: ${stendy.length}`)
console.log(`  ✅ стерегут своё число проб: ${s_zashchitoj.length}`)
console.log(`  ⚠️ НЕ стерегут:              ${bez.length}`)
console.log(`  сумма: ${s_zashchitoj.length + bez.length} из ${stendy.length}`)
console.log('\n⚠️ БЕЗ ЗАЩИТЫ ПОИМЁННО (пропажа пробы в них не закричит):')
bez.forEach((s) => console.log('  ' + s))
console.log('\n✅ С ЗАЩИТОЙ ПОИМЁННО:')
s_zashchitoj.forEach((s) => console.log('  ' + s))
console.log('\nПорядок (как с глухими обёртками): защита ставится ПРИ СЛЕДУЮЩЕЙ ПРАВКЕ каждого')
console.log('стенда, а не отдельным походом; в новых стендах — с рождения. Число держим видимым,')
console.log('чтобы молчание не читалось как «проверено».')
process.exit(bez.length ? 1 : 0)
