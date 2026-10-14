/**
 * RU: Стенд документации сравнивает оба README, ссылки с настоящим архивом npm и способ перепроверки. Состав берётся через npm pack --dry-run --json, не устаревающий files глазами. Коды 0 — совпало, 1 — расхождение, 2 — проверить не удалось; он не доказывает качество всей документации.
 * EN: The documentation test compares both READMEs, their references against the actual npm archive, and verification instructions. Obtain contents through npm pack --dry-run --json rather than manually reading a stale files list. Exit codes: 0 matches, 1 mismatch, 2 unable to check; it does not prove overall documentation quality.
 */
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
const require_fs = () => ({ mkdtempSync, rmSync, readdirSync })
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// RU: Убрать зарегистрированные временные объекты на обычном exit и SIGTERM/SIGINT. SIGKILL и временное дочерних процессов не покрыты.
// EN: Remove registered temporary objects on normal exit and SIGTERM/SIGINT. This covers neither SIGKILL nor child-process temporary objects.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const koren = join(dirname(fileURLToPath(import.meta.url)), '..')
// RU: Стенд запускает другие стенды, поэтому собственная сумма особенно нужна для воспроизводимости прибора над приборами.
// EN: This test runs other tests, so its own checksum is especially necessary to identify a reproducible instrument over instruments.
{
  const { createHash } = await import('node:crypto')
  const put = fileURLToPath(import.meta.url)
  console.log(`стенд: ${put.split('/').pop()} сумма ${
    createHash('sha256').update(readFileSync(put)).digest('hex').slice(0, 16)}`)
}
const ru = readFileSync(join(koren, 'README.md'), 'utf8')
const en = readFileSync(join(koren, 'README.en.md'), 'utf8')

let vsego = 0, proshlo = 0, slep = 0
// RU: Обёртка принимает только undefined без исключения; возвращённое значение считается отказом.
// EN: The wrapper accepts only undefined without an exception; a returned value counts as failure.
const proba = (i, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '» — тело обязано бросить или промолчать'); proshlo++; console.log('  ✅ ' + i) } catch (e) { console.log('  ❌ ' + i + ' — ' + String(e.message).slice(0, 140)) } }
const slepota = (i, pochemu) => { vsego++; slep++; console.log('  ⬜ ' + i + ' — ' + pochemu) }

// RU: Проверить состав по ответу npm, не повторной интерпретации files.
// EN: Check package contents from the npm response rather than another interpretation of files.
let sostav = null
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  sostav = JSON.parse(out)[0].files.map((f) => f.path).sort()
} catch (e) { /**
 * RU: Непроверенный предмет ниже даёт слепоту, не зелёный исход.
 * EN: An unchecked subject below yields an inability-to-check result, not a pass.
 */ }

proba('стенд годен: оба README непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error(`ru ${ru.length}, en ${en.length} знаков`)
})

proba('ключи настройки описаны в обоих', () => {
  for (const k of ['restoreEnabled', 'welcomeEnabled', 'welcomeBudget', 'ignoreAfterMs', 'useVeraThreshold']) {
    if (!ru.includes(k)) throw new Error('в русском нет ключа ' + k)
    if (!en.includes(k)) throw new Error('в английском нет ключа ' + k)
  }
})

// RU: Ссылка README обязана вести к файлу в архиве, не только к существующему пути рабочего дерева.
// EN: A README link must target an archived file, not merely a path present in the working tree.
if (sostav === null) slepota('ссылки README ведут в состав публикации', 'npm pack --dry-run --json не отработал — состав неизвестен')
else proba('ссылки README ведут в состав публикации', () => {
  const ssylki = new Set()
  for (const t of [ru, en]) for (const m of t.matchAll(/\b((?:src|test)\/[A-Za-z0-9._-]+\.(?:mjs|js))/g)) ssylki.add(m[1])
  if (ssylki.size === 0) throw new Error('README не ссылается НИ НА ОДИН файл пакета — проверять нечего, и это само по себе беда')
  const net = [...ssylki].filter((f) => !sostav.includes(f))
  if (net.length) throw new Error(`обещано, но не уедет: ${net.join(', ')}`)
})

// RU: Оба языка обязаны упоминать тот же стенд: одна проверка ссылок не обнаружила бы отсутствие упоминания во втором README.
// EN: Both languages must mention the same test; checking links alone cannot detect an omitted mention in the other README.
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

// RU: Каждый язык проверяется своими словами/шаблонами: общий русско-английский шаблон обнаруживал бы только совпадающие части и давал ложное отсутствие.
// EN: Check each language with its own wording/patterns: a shared Russian-English pattern would detect only common parts and falsely report omissions.
proba('оба называют, что слепота — отдельный код, а не успех', () => {
  if (!/слепот|код 2/.test(ru)) throw new Error('русский не называет третий исход')
  if (!/blind|exit 2|code 2/.test(en)) throw new Error('английский не называет третий исход')
})

// RU: Проверить вычислимость состава и чтение обещанных файлов. Алгоритм канонической суммы не дублируется здесь: локаль, порядок и завершающий перевод строки должны определяться единственным инструментом.
// EN: Check computable contents and readability of promised files. Do not duplicate the canonical checksum algorithm here: one instrument must define locale, ordering, and final newline.
if (sostav === null) slepota('состав публикации вычислим', 'npm pack --dry-run --json не отработал')
else proba('состав публикации вычислим', () => {
  if (sostav.length === 0) throw new Error('состав пуст — публиковать нечего')
  for (const f of sostav) readFileSync(join(koren, f))
  console.log(`       состав публикации: ${sostav.length} файлов, все читаются`)
  console.log('       сумму предмета считает summa-predmeta (сумма файла d4fc96426534a870), не этот стенд')
})

// RU: Проверяется форма зависимостей: peer — диапазон ^ для получателя, dev — точная версия для воспроизводимости. Это не проверка правильности выбранных версий.
// EN: Check dependency shape: peer uses a ^ range for recipients; dev uses an exact version for reproducibility. This does not check whether the selected versions are appropriate.
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

// RU: Архив распаковывается и стенды запускаются без установленных зависимостей. Пригодны 0 или читаемый отказ 2, не 1. Сам стенд не запускается рекурсивно и npm install не выполняется.
// EN: Extract the archive and run tests without installed dependencies. Accept 0 or a readable inability-to-check result 2, not 1. Do not recursively run this test itself or execute npm install.
if (sostav === null) slepota('стенды годны в раскладке получателя', 'состав неизвестен — паковать нечего')
else proba('стенды годны в раскладке получателя', () => {
  const { mkdtempSync, rmSync, readdirSync } = require_fs()
  const tmp = vremennyj(join(tmpdir(), 'stend-poluchatel-'))
  try {
    execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: koren, stdio: 'ignore' })
    const arh = readdirSync(tmp).find((f) => f.endsWith('.tgz'))
    if (!arh) throw new Error('npm pack не отдал архив')
    execFileSync('tar', ['xzf', join(tmp, arh), '-C', tmp], { stdio: 'ignore' })
    const raspak = join(tmp, 'package')
    const moyo = fileURLToPath(import.meta.url).split('/').pop()
    // RU: Запускать только опубликованные test/stend-*.mjs из ответа npm. Файлы с точкой и временные .obyortka-* исключены, чтобы копия стенда не породила рекурсивные процессы.
    // EN: Run only published test/stend-*.mjs from the npm response. Exclude dotfiles and temporary .obyortka-* so a test copy cannot spawn recursive processes.
    const stendy = sostav.filter((p) => /^test\/stend-[^/]+\.mjs$/.test(p)).map((p) => p.slice('test/'.length))
      .filter((f) => f !== moyo && !f.startsWith('.'))
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
