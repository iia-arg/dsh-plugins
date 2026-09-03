/** Стенд документации: оба README растут вместе, ссылаются только на то, что
 *  РЕАЛЬНО уедет в пакет, и называют один и тот же способ перепроверки.
 *
 *  Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
 *
 *  🔴 СОСТАВ БЕРЁТСЯ У САМОГО npm (`npm pack --dry-run --json`), а НЕ из files.
 *  Довод куплен разбором 03.09.2026: files — тот самый перечень, который и
 *  устаревает молча. Считать по нему значит мерить предмет прибором, который
 *  дал сбой. Ответ npm — это то, что уедет на самом деле.
 */
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const require_fs = () => ({ mkdtempSync, rmSync, readdirSync })
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const koren = join(dirname(fileURLToPath(import.meta.url)), '..')
// 🔴 ПРИБОР НАЗЫВАЕТ СЕБЯ. Этот стенд ещё и запускает соседние — то есть прибор
// над приборами; «неизвестно чем мерили» здесь стоило бы дороже всего.
{
  const { createHash } = await import('node:crypto')
  const put = fileURLToPath(import.meta.url)
  console.log(`стенд: ${put.split('/').pop()} сумма ${
    createHash('sha256').update(readFileSync(put)).digest('hex').slice(0, 16)}`)
}
const ru = readFileSync(join(koren, 'README.md'), 'utf8')
const en = readFileSync(join(koren, 'README.en.md'), 'utf8')

let vsego = 0, proshlo = 0, slep = 0
const proba = (i, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + i) } catch (e) { console.log('  ❌ ' + i + ' — ' + String(e.message).slice(0, 140)) } }
const slepota = (i, pochemu) => { vsego++; slep++; console.log('  ⬜ ' + i + ' — ' + pochemu) }

// --- СОСТАВ ПУБЛИКАЦИИ: ответ npm, а не наше прочтение files ------------------
let sostav = null
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  sostav = JSON.parse(out)[0].files.map((f) => f.path).sort()
} catch (e) { /* ниже честная слепота, а не зелень */ }

proba('стенд годен: оба README непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error(`ru ${ru.length}, en ${en.length} знаков`)
})

proba('ключи настройки описаны в обоих', () => {
  for (const k of ['restoreEnabled', 'welcomeEnabled', 'welcomeBudget', 'ignoreAfterMs', 'useVeraThreshold']) {
    if (!ru.includes(k)) throw new Error('в русском нет ключа ' + k)
    if (!en.includes(k)) throw new Error('в английском нет ключа ' + k)
  }
})

// 🔴 ПРОБА ПЕРВАЯ (условие ворот 03.09.2026). Обещание без содержимого: README ссылается на файл,
// которого в пакете нет. Поставивший идёт по ссылке и упирается в пустоту.
if (sostav === null) slepota('ссылки README ведут в состав публикации', 'npm pack --dry-run --json не отработал — состав неизвестен')
else proba('ссылки README ведут в состав публикации', () => {
  const ssylki = new Set()
  for (const t of [ru, en]) for (const m of t.matchAll(/\b((?:src|test)\/[A-Za-z0-9._-]+\.(?:mjs|js))/g)) ssylki.add(m[1])
  if (ssylki.size === 0) throw new Error('README не ссылается НИ НА ОДИН файл пакета — проверять нечего, и это само по себе беда')
  const net = [...ssylki].filter((f) => !sostav.includes(f))
  if (net.length) throw new Error(`обещано, но не уедет: ${net.join(', ')}`)
})

// 🔴 ПРОБА ВТОРАЯ (условие ворот 03.09.2026). Парные README расходятся молча: один говорит про стенд,
// другой молчит. Проба на ссылки этого не поймает — второй просто не ссылается.
proba('оба README называют ОДИН И ТОТ ЖЕ способ перепроверки', () => {
  const komandy = (t) => new Set([...t.matchAll(/^ {4}(node [^\n]+)$/gm)].map((m) => m[1].trim()))
  const a = komandy(ru), b = komandy(en)
  if (a.size === 0) throw new Error('русский не называет НИ ОДНОЙ команды перепроверки')
  const tolkoRu = [...a].filter((x) => !b.has(x))
  const tolkoEn = [...b].filter((x) => !a.has(x))
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error(`расходятся: только в ru [${tolkoRu.join('; ')}], только в en [${tolkoEn.join('; ')}]`)
  }
})

// 🔴 КАЖДЫЙ ЯЗЫК МЕРЯЕТСЯ СВОИМ ШАБЛОНОМ (03.09.2026). Прежняя проба искала
// в обоих файлах одну и ту же смесь «код 2|exit 2» — и на английском находила
// только латинскую половину. Того же вида замер снаружи дал вывод «английский
// не упоминает слепоту НИ РАЗУ», хотя она там описана словами: искали русские
// слова в английском тексте. Шаблон, общий для двух языков, находит только то,
// что в них совпало.
proba('оба называют, что слепота — отдельный код, а не успех', () => {
  if (!/слепот|код 2/.test(ru)) throw new Error('русский не называет третий исход')
  if (!/blind|exit 2|code 2/.test(en)) throw new Error('английский не называет третий исход')
})

// --- СОСТАВ ВЫЧИСЛИМ, А СУММУ СЧИТАЕТ НЕ ЭТОТ ФАЙЛ ---------------------------
// 🔴 ВТОРАЯ РЕАЛИЗАЦИЯ СПОСОБА УБРАНА 03.09.2026, и это правка против себя же.
// Здесь считалась сумма предмета — своим кодом, в формате канона. Она сходилась
// со скриптом `summa-predmeta` (сумма файла d4fc96426534a870) на момент правки,
// проверено. Но повторение способа В ДРУГОМ ФАЙЛЕ и есть та болезнь, от которой
// мы уходили всю ночь: две реализации расходятся при первой же правке одной из
// них, и заметить это некому — стенд свою сумму печатает, а с чужой не сверяет.
//
// За ночь этот формат разошёлся ТРИЖДЫ на ровном месте: порядок полей в строке,
// завершающий перевод строки, локаль сортировки. Все три прозой не передаются и
// меняют число молча. Способ определён ФАЙЛОМ; здесь его нет.
//
// Что осталось: проверка, что состав ВЫЧИСЛИМ, берётся у самого npm и каждый
// обещанный файл читается. Это про предмет, а не про способ.
if (sostav === null) slepota('состав публикации вычислим', 'npm pack --dry-run --json не отработал')
else proba('состав публикации вычислим', () => {
  if (sostav.length === 0) throw new Error('состав пуст — публиковать нечего')
  for (const f of sostav) readFileSync(join(koren, f))
  console.log(`       состав публикации: ${sostav.length} файлов, все читаются`)
  console.log('       сумму предмета считает summa-predmeta (сумма файла d4fc96426534a870), не этот стенд')
})

// --- ФОРМА ВЕРСИЙ В МАНИФЕСТЕ (03.09.2026) -----------------------------------
// 🔴 ЗАЩИТА, РАБОТАВШАЯ ПО СОВПАДЕНИЮ, ПРИВОДИТСЯ В НАМЕРЕННОЕ СОСТОЯНИЕ.
// Команда установки умеет молча переписать точную версию на диапазон — у соседей
// это случилось за ночь. У меня не случилось, но не по осмотрительности: я
// ставила с ключом, запрещающим трогать манифест, и набирала его по другой
// причине. Механизм, уберегающий по совпадению, ломается от смены привычки — и
// тот, кто её сменит, не узнает, что защита была.
//
// Проверяется ФОРМА, а не перечень версий: перечень устареет при первом же
// обновлении, форма — решение фермы и меняется осознанно.
//   «что нужно у ПОЛУЧАТЕЛЯ» (peer) — диапазон «^»: требование к чужой машине,
//     точная версия там ломает установку тому, у кого версия новее;
//   «чем гоняем МЫ» (dev) — точная: наша машина, воспроизводимость замера.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: не судит, ПРАВИЛЬНЫЕ ли версии — только их форму.
proba('форма версий: у получателя диапазон, у нас точная', () => {
  const m = JSON.parse(readFileSync(join(koren, 'package.json'), 'utf8'))
  const peer = Object.entries(m.peerDependencies || {})
  const dev = Object.entries(m.devDependencies || {})
  if (peer.length === 0 && dev.length === 0) throw new Error('зависимостей не объявлено вовсе — проверять нечего')
  const ploho = []
  for (const [imya, v] of peer) if (!/^\^/.test(v)) ploho.push(`peer ${imya}=${v} — ждали «^»`)
  for (const [imya, v] of dev) if (/^[\^~><*]|\s-\s|x/.test(v)) ploho.push(`dev ${imya}=${v} — ждали точную`)
  if (ploho.length) throw new Error(ploho.join('; '))
})

// --- СТЕНДЫ В РАСКЛАДКЕ ПОЛУЧАТЕЛЯ (03.09.2026) ------------------------------
// 🔴 ЧЕГО НЕ ПОЙМАЛА НИ ОДНА ПРОБА ВЫШЕ. Все они смотрят на пакет ИЗ ПАКЕТА, где
// рядом лежат node_modules и дерево платформы. У получателя ни того, ни другого
// нет, и стенд, падающий там сырой ошибкой оболочки, выглядит как «пакет
// сломан», а не как «зависимости не поставлены». На этом 03.09 завернули
// метапакет: 8/8 в мастерской автора, 4/8 в чужой раскладке.
// Здесь пакет собирается, распаковывается и стенды запускаются ОТТУДА.
// Годный исход — 0 (сошлось) или 2 (честная слепота словами). Код 1 означает,
// что получатель увидит расхождение там, где у нас зелено.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: себя не запускаем (рекурсия), и `npm install` не делаем —
// проверяется именно поведение БЕЗ установленных зависимостей.
if (sostav === null) slepota('стенды годны в раскладке получателя', 'состав неизвестен — паковать нечего')
else proba('стенды годны в раскладке получателя', () => {
  const { mkdtempSync, rmSync, readdirSync } = require_fs()
  const tmp = mkdtempSync(join(tmpdir(), 'stend-poluchatel-'))
  try {
    execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: koren, stdio: 'ignore' })
    const arh = readdirSync(tmp).find((f) => f.endsWith('.tgz'))
    if (!arh) throw new Error('npm pack не отдал архив')
    execFileSync('tar', ['xzf', join(tmp, arh), '-C', tmp], { stdio: 'ignore' })
    const raspak = join(tmp, 'package')
    const moyo = fileURLToPath(import.meta.url).split('/').pop()
    const stendy = readdirSync(join(raspak, 'test')).filter((f) => f.endsWith('.mjs') && f !== moyo)
    if (stendy.length === 0) throw new Error('в составе нет ни одного стенда, кроме этого')
    const plohie = []
    for (const st of stendy) {
      let kod = 0
      try { execFileSync(process.execPath, [join('test', st)], { cwd: raspak, stdio: 'pipe' }) }
      catch (e) { kod = e.status ?? 1 }
      if (kod !== 0 && kod !== 2) plohie.push(`${st} -> код ${kod}`)
    }
    if (plohie.length) throw new Error(`у получателя дают расхождение: ${plohie.join(', ')}`)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

console.log(`\nИТОГО: сошлось ${proshlo}, расхождений ${vsego - proshlo - slep}, слепот ${slep}`)
if (proshlo + slep !== vsego) process.exit(1)
process.exit(slep ? 2 : 0)
