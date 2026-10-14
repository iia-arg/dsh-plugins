#!/usr/bin/env node
// ЧИТАТЕЛЬ ОТКЛОНЁННЫХ СВОДОК . Кто: этот скрипт; подпись руки в решении — ключ CHITATEL_RUKA файла настройки.
// Когда: по вызову; в такт его никто не зовёт — это названо, а не умолчано.
// Что делает с файлом: НИЧЕГО. Тексты неприкосновенны (правило описи 06.09.2026);
// решение кладётся РЯДОМ файлом <имя>.reshenie.txt, чтобы спасённое осталось как было.
//
// 🔴 ОБЛАСТЬ, КОТОРОЙ ЧИТАТЕЛЬ НЕ ВЛАДЕЕТ — называю, чтобы он не обещал больше, чем может:
//   - класс знания для znanie-* механизму взять НЕОТКУДА (в строке отказа его нет ни у одного
//     файла — замер описи). Такие файлы он НЕ закрывает, а помечает «ждёт решения человека».
//     Это не отказ и не чтение: третий исход, и он обязан быть виден числом.
//   - содержимое файлов он не разбирает и знания из них не добывает. Это дело дистилляции.
//   - остановки у него нет: он не служба, ходит по вызову и ничего не удаляет.
// EN: REJECTED-SUMMARY READER. Who: this script; the hand's signature in the decision is the CHITATEL_RUKA key
//     of the settings file.
//     When: on call; nobody calls it on a cycle — this is stated, not left unsaid.
//     What it does to the file: NOTHING. The texts are untouchable (inventory rule of 06.09.2026); the decision
//     is put NEXT to it as <name>.reshenie.txt, so that what was rescued stays as it was.
//     🔴 THE AREA THE READER DOES NOT OWN — named so that it does not promise more than it can:
//     - a knowledge class for znanie-* has NOWHERE to come from (no file has it in its refusal line — inventory
//     measurement). Such files it does NOT close but marks "awaiting a human decision". This is neither a
//     refusal nor a read: a third outcome, and it must be visible as a number.
//     - it does not parse file contents or extract knowledge from them. That is distillation's job.
//     - it has no stop: it is not a service, it runs on call and deletes nothing.
import fs from 'fs'
import path from 'path'
// Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение ключа.
// Путь меняет переменная DSH_PAMYAT_STOROZHA_CONF. Порядок: довод/переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
// EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
//     comment; the last occurrence of a key wins.
//     The DSH_PAMYAT_STOROZHA_CONF variable changes the path. Order: argument/variable → file → neutral
//     default; nothing at all — BLINDNESS, code 2.
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of fs.readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };

const args = process.argv.slice(2)
if (args.some(a => a.startsWith('-') && a !== '--suho') || args.filter(a => !a.startsWith('-')).length > 1) {
  console.error('ОТКАЗ: chitatel-otklonennyh.mjs [каталог] [--suho]; неизвестные ключи отвергаются'); process.exit(2)
}

const KATALOG = process.argv.slice(2).find(a => !a.startsWith('--')) ?? konf('OTKLONENNYE_KATALOG')
const SUHO = process.argv.includes('--suho')
const RUKA = konf('CHITATEL_RUKA')   // подпись руки в файле решения; пусто — без подписи · EN: hand signature in the decision file; empty — no signature
if (!KATALOG) { console.error('СЛЕПОТА: каталог отклонённых не задан — довод или ключ OTKLONENNYE_KATALOG в ' + KONF); process.exit(2) }

// Вид определяется ПРЕФИКСОМ ИМЕНИ — так их кладёт secretary (putOtklonennyh).
// Признак по имени слаб, и это названо: если писатель сменит имена, читатель ослепнет молча.
// EN: The kind is determined by the NAME PREFIX — that is how the secretary (putOtklonennyh) lays the files
//     out.
//     A name-based sign is weak, and this is stated: if the writer changes names, the reader goes blind
//     silently.
const VIDY = [
  { pristavka: 'zadanie-', ishod: 'otkaz',
    prichina: 'не запись памяти по построению: это задание на повтор, у него нет класса и содержимого знания' },
  { pristavka: 'nachalo-sreza-', ishod: 'otkaz',
    prichina: 'не запись памяти по построению: отброшенное начало среза, сохранено ради полноты журнала' },
  { pristavka: 'svodka-', ishod: 'otkaz',
    prichina: 'сводка компакта целиком не возвращается: её назначение — восстановить контекст ТОЙ сессии, '
            + 'сессия закрыта. Знание из неё добывается дистилляцией, а не возвратом файла' },
  { pristavka: 'znanie-', ishod: 'zhdet',
    prichina: 'КЛАСС ЗНАНИЯ НЕ УСТАНОВЛЕН и механизму взять его неоткуда (в строке отказа класса нет). '
            + 'Возврат в память требует человечьего решения о классе — это не восстановление' },
]

let fajly
try { fajly = fs.readdirSync(KATALOG) }
catch (e) { console.error(`СЛЕПОТА: каталог ${KATALOG} не прочитан (${e.code ?? 'ошибка'})`); process.exit(2) }
fajly = fajly
  .filter(f => f !== 'OPIS.txt' && !f.endsWith('.reshenie.txt'))

const reshenieDlya = f => path.join(KATALOG, f + '.reshenie.txt')
const bylo = fajly.filter(f => !fs.existsSync(reshenieDlya(f)))

console.log(`каталог: ${KATALOG}`)
console.log(`файлов (без описи и решений): ${fajly.length}`)
console.log(`НЕПРОЧИТАННЫХ ДО: ${bylo.length}`)
if (SUHO) console.log('режим СУХОЙ: решения не пишутся')
console.log('')

let zakryto = 0, zhdet = 0, neopoznano = 0
for (const f of bylo) {
  const vid = VIDY.find(v => f.startsWith(v.pristavka))
  if (!vid) {
    neopoznano++
    console.log(`  ⚠️ ${f}\n     вид НЕ ОПОЗНАН по имени — читатель молчит, а не решает наугад`)
    continue
  }
  const stroka = [
    `файл:      ${f}`,
    `прочитан:  ${new Date().toISOString()}`,
    `кем:       chitatel-otklonennyh.mjs${RUKA ? ' (' + RUKA + ')' : ''}`,
    `исход:     ${vid.ishod === 'otkaz' ? 'ОКОНЧАТЕЛЬНЫЙ ОТКАЗ' : 'ЖДЁТ РЕШЕНИЯ ЧЕЛОВЕКА (не прочитан)'}`,
    `причина:   ${vid.prichina}`,
    `файл не изменён и не удалён; это решение лежит рядом с ним`,
  ].join('\n') + '\n'
  if (vid.ishod === 'otkaz') { zakryto++; if (!SUHO) fs.writeFileSync(reshenieDlya(f), stroka) }
  else { zhdet++ }   // 🔴 ждущим решение НЕ пишем: иначе они станут «прочитанными» и исчезнут из счёта · EN: 🔴 we do NOT write to those awaiting a decision: otherwise they would become "read" and vanish from the count
  console.log(`  ${vid.ishod === 'otkaz' ? '✅ закрыт отказом' : '⏳ ждёт человека'}: ${f}`)
}

const stalo = fajly.filter(f => !fs.existsSync(reshenieDlya(f))).length
console.log('')
console.log(`закрыто окончательным отказом: ${zakryto}`)
console.log(`ждут решения человека:         ${zhdet}   ← НЕ прочитаны, и это не «в порядке»`)
console.log(`вид не опознан:                ${neopoznano}`)
console.log(`НЕПРОЧИТАННЫХ ПОСЛЕ: ${stalo}${SUHO ? ' (сухой прогон — не изменилось по построению)' : ''}`)
process.exit(0)
