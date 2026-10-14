// RU: Стенд слышимого вывода читает настоящий stderr отдельного процесса с cordis Context, обнаруживая глушилку внутри предмета, поверх которой локальный spy мог бы вернуть ложный успех. Дополняет основной стенд, но не проверяет ветки поведения и причины сообщений. Коды 0 — совпало, 1 — расхождение, 2 — проверка не состоялась.
// EN: The observable-output test reads real stderr from a separate process with cordis Context, detecting suppression inside the subject that an in-process spy might mask. It complements the main test but checks neither behavior branches nor message causes. Exit codes: 0 matches, 1 mismatch, 2 the check could not run.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// RU: cwd дочернего процесса — корень пакета: там разрешаются cordis и предмет src, не каталог test.
// EN: Use the package root as the child cwd so cordis and the src subject resolve there, not from test.
import { createHash as __hash } from 'node:crypto'
import { readFileSync as __chitat } from 'node:fs'
import { fileURLToPath as __put } from 'node:url'
// RU: Печатать собственную сумму прибора: одна команда после правки может запускать иной стенд.
// EN: Print the instrument own checksum: the same command after edits may run a different test.
console.log(`стенд: ${__put(import.meta.url).split('/').pop()} сумма ${
  __hash('sha256').update(__chitat(__put(import.meta.url))).digest('hex').slice(0, 16)}`)
const KORNI = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PREDMET = process.env.PREDMET || path.join(KORNI, 'src/index.js')

let ok = 0, bad = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`ok   ${n}`) } else { bad++; console.log(`FAIL ${n}\n     ${s ?? ''}`) } }

// RU: Дочерний код передаётся через --input-type=module -e, разрешая модули от cwd без временного файла в пакете. Каталог установленного предмета может быть только для чтения.
// EN: Supply child code through --input-type=module -e so modules resolve from cwd without a temporary package file. The installed subject directory may be read-only.
const kod = (davatSluzhbu) => `
import { Context } from '@deepseek-ai/cordis'
const mod = await import(${JSON.stringify(PREDMET)})
const root = new Context()
${davatSluzhbu ? `await root.plugin({ name: 'agents-stub', inject: [], apply(ctx) { ctx.provide('agents', { create(){}, resume(){} }) } })
await new Promise((r) => setTimeout(r, 100))` : '// службу НЕ даём: модуль обязан остаться в ожидании'}
const fork = await root.plugin(mod, { restoreEnabled: true, welcomeEnabled: true })
await new Promise((r) => setTimeout(r, 250))
console.log('SOSTOYANIE=' + fork?.state)
`

const pusk = (davatSluzhbu) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['--input-type=module', '-e', kod(davatSluzhbu)], { cwd: KORNI })
  let out = '', err = ''
  p.stdout.on('data', (d) => { out += d })
  p.stderr.on('data', (d) => { err += d })
  p.on('close', (code) => resolve({ out, err, code }))
  setTimeout(() => p.kill('SIGKILL'), 15000)
})

let r
try { r = await pusk(true) } catch (e) {
  console.log(`СЛЕПОТА: дочерний процесс не запустился: ${e?.message ?? e}`); process.exit(2)
}
if (!/SOSTOYANIE=/.test(r.out)) {
  // RU: Отсутствие зависимости даёт код 2 с читаемой причиной, не сырой ERR_MODULE_NOT_FOUND как доказательство поломки.
  // EN: A missing dependency returns code 2 with a readable cause, not raw ERR_MODULE_NOT_FOUND as proof of a defect.
  const netModulya = /ERR_MODULE_NOT_FOUND|Cannot find package/.test(r.err)
  const imya = (r.err.match(/Cannot find package '([^']+)'/) ?? [])[1]
  console.log(`СЛЕПОТА: предмет не поднялся в отдельном процессе (код ${r.code}) — ${
    netModulya ? 'не установлены зависимости пакета' : 'причина ниже'}.`)
  if (netModulya) {
    console.log(`  Не найдено: ${imya ?? '(имя не разобралось)'}`)
    console.log('  Выполните `npm install` в каталоге пакета и повторите.')
    console.log('  Стенд гонялся на cordis 4.0.1 и schemastery 3.18.1.')
  } else {
    console.log(`  stderr: ${r.err.slice(0, 400)}`)
  }
  process.exit(2)
}

console.log('=== 1. Модуль поднимается в настоящем контексте ===')
const sostoyanie = (r.out.match(/SOSTOYANIE=(\d+)/) ?? [])[1]
t('плагин активен, а не ждёт службу (состояние 2)', sostoyanie === '2', `состояние ${sostoyanie}`)

console.log('\n=== 2. Крик доходит до РЕАЛЬНОГО дескриптора 2 ===')
// RU: Версия строки сравнивается с манифестом, не только именем: устаревшая константа не должна пройти как установленная редакция.
// EN: Compare the message version with the manifest, not only its name: a stale constant must not pass as the installed revision.
const versiyaVManifeste = JSON.parse(
  __chitat(new URL('../package.json', import.meta.url), 'utf-8')).version
t('строка подъёма пришла в настоящий stderr и несёт ВЕРСИЮ ИЗ МАНИФЕСТА',
  r.err.includes(`[dsh-pamyat-restore ${versiyaVManifeste}] подъём:`),
  'ждали версию ' + versiyaVManifeste + ', пришло: ' + JSON.stringify(r.err.slice(0, 200)))
t('строка несёт значения настроек, а не одно имя', /restore=true/.test(r.err) && /welcome=true/.test(r.err), r.err.slice(0, 200))
t('крик пришёл именно в stderr, а не в stdout', !/подъём:/.test(r.out), r.out.slice(0, 200))

console.log('\n=== 3. Контроль зрячести: без службы крика быть НЕ ДОЛЖНО ===')
// RU: Контроль без смонтированного модуля не должен печатать ту же строку: иначе её наличие не доказывает источник.
// EN: The control without a loaded module must not emit the same message; otherwise its presence proves no source.
const r2 = await pusk(false)
t('без службы agents модуль молчит', !/\[dsh-pamyat-restore\] подъём:/.test(r2.err), r2.err.slice(0, 200))
t('и остаётся в ожидании, а не падает', /SOSTOYANIE=0/.test(r2.out), r2.out.slice(0, 120))

const ZHDYOM = 6
console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)
if (bad > 0) process.exit(1)
if (ok + bad !== ZHDYOM) {
  console.log(`СЛЕПОТА: проверок ${ok + bad}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(0)
