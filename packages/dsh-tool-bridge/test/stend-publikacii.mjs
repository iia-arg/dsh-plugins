// RU: Проверка stend-publikacii: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-publikacii verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const KORNI = process.env.MOST_KORNI
  || path.dirname(path.dirname(new URL(import.meta.url).pathname))

// RU: Каталог в files покрывает его файлы; не пытаемся читать сам каталог как текст.
// EN: A files directory covers its descendants, not a text file named after the directory.
const fajly = (f) => {
  const rel = path.normalize(f)
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) {
    throw new Error(`путь состава вне корня: ${f}`)
  }
  const put = path.join(KORNI, f)
  if (existsSync(put)) {
    const physical = path.relative(realpathSync(KORNI), realpathSync(put))
    if (path.isAbsolute(physical) || physical === '..' || physical.startsWith('..' + path.sep)) {
      throw new Error(`ссылка состава вне корня: ${f}`)
    }
  }
  if (existsSync(put) && lstatSync(put).isDirectory()) {
    return readdirSync(put).flatMap((name) => fajly(path.join(f, name)))
  }
  return [rel]
}
const kopiyaPravki = (f) => /\.bak|\.orig|\.tmp|\.limits$/.test(f)

const SOSTAV = (() => {
  try {
    const m = JSON.parse(readFileSync(path.join(KORNI, 'package.json'), 'utf-8'))
    const f = Array.isArray(m.files) ? m.files.filter((x) => typeof x === 'string') : []

    return [...new Set((f.includes('package.json') ? f : ['package.json', ...f]).flatMap(fajly))]
  } catch (e) {
    console.log(`СЛЕПОТА: состав не прочитан из манифеста (${e?.message ?? e}) — проверять нечего`)
    process.exit(2)
  }
})()

const PUT_SPISKA = process.env.SPISOK_IMYON
let OSNOVY = null
try {
  if (PUT_SPISKA && existsSync(PUT_SPISKA)) {

    const syroe = readFileSync(PUT_SPISKA, 'utf-8')
    let iz = null
    try {
      const d = JSON.parse(syroe)
      if (Array.isArray(d.osnovy) && d.osnovy.length) iz = d.osnovy
    } catch {
      iz = syroe.split('\n').map((x) => x.trim())
        .filter((x) => x && !x.startsWith('#'))
    }
    if (iz && iz.length) OSNOVY = iz
  }
} catch {                                                         }

const IMENA = OSNOVY ? new RegExp(OSNOVY.join('|'), 'gi') : null

const SUMMA_SPISKA = OSNOVY
  ? createHash('sha256')
      .update(`${[...new Set(OSNOVY)].sort().join('\n')}\n`)
      .digest('hex').slice(0, 16)
  : 'нет списка'
const ISTOCHNIK_OBRAZCA = OSNOVY
  ? `основы из файла-списка (${OSNOVY.length})`
  : `🔴 списка основ НЕТ (SPISOK_IMYON ${PUT_SPISKA ? 'указывает на негодный файл' : 'не задан'}): `
    + 'проверка на ИМЕНА не выполняется вовсе'

// RU: A-N-1948 №2 (слово владельца 09.10 18:33: имена машины, пакетов, агентов и пути — не находка, ищем секреты):
//   сняты классы «адреса установки» и «объяснение абсолютных путей». Осталась переносимость — жёсткая внешняя команда в КОДЕ.
// EN: Install-address and absolute-path-explanation classes removed (owner decision); hard-path commands in code remain.
const najti = (tekst) => ({
  imena: IMENA ? (tekst.match(IMENA) || []) : null,
})

const FAJL_ISK = path.join(KORNI, 'test', 'isklyucheniya-nejtralnosti.json')
const ISKLYUCHENIYA = existsSync(FAJL_ISK)
  ? JSON.parse(readFileSync(FAJL_ISK, 'utf-8'))
  : []

const FAJL_SOB = path.join(KORNI, 'test', 'sobiraemye-pri-publikacii.json')
const SOBIRAEMYE = existsSync(FAJL_SOB)
  ? JSON.parse(readFileSync(FAJL_SOB, 'utf-8'))
  : []
const sobiraetsya = (f) => SOBIRAEMYE.some((x) => x.fajl === f)

let ok = 0, bad = 0, slep = 0, neprim = 0
const sud = (uslovie, imya, fakt) => {
  if (uslovie) { ok += 1; return }
  bad += 1
  console.log(`FAIL ${imya}: ${fakt ?? ''}`)
}

console.log(`образец частных имён: ${ISTOCHNIK_OBRAZCA}; сумма списка ${SUMMA_SPISKA}`)

for (const f of SOSTAV) {
  if (sobiraetsya(f) && !existsSync(path.join(KORNI, f))) {

    console.log(`вне проверки ${f}: собирается при публикации, в рабочем каталоге его нет — это норма`)
    continue
  }
  sud(existsSync(path.join(KORNI, f)), `в составе публикации есть ${f}`, 'файла нет')
}

for (const f of SOSTAV) {
  const put = path.join(KORNI, f)
  if (!existsSync(put)) {
    if (sobiraetsya(f)) { console.log(`вне проверки ${f}: собирается при публикации`); continue }
    slep += 1
    console.log(`СЛЕПОТА ${f}: файла нет, проверять нечего`)
    continue
  }
  const n = najti(readFileSync(put, 'utf-8'))
  const isk = ISKLYUCHENIYA.find((i) => i.fajl === f)
  const dopusk = isk ? isk.skolko : 0
  if (n.imena === null) {
    slep += 1
    console.log(`СЛЕПОТА ${f}: частные ИМЕНА не проверены — списка основ нет, `
      + 'проверять нечем. Это не «чисто». Путь берётся из переменной SPISOK_IMYON: '
      + 'SPISOK_IMYON=<файл со списком основ> npm test')
  } else {
    sud(n.imena.length <= dopusk, `${f}: частных имён не больше объявленного`,
      `найдено ${n.imena.length}, допущено ${dopusk}: ${[...new Set(n.imena)].join(', ')}`)
  }
}

for (const i of ISKLYUCHENIYA) {
  sud(i.pochemu.length > 40, `исключение ${i.fajl} объяснено, а не просто разрешено`,
    `причина короче сорока знаков — это отговорка, а не довод`)

  const n = najti(readFileSync(path.join(KORNI, i.fajl), 'utf-8'))
  if (n.imena === null) {
    slep += 1
    console.log(`СЛЕПОТА исключение ${i.fajl}: списка основ нет — судить о том, `
      + 'нужно ли исключение, нечем. Задайте SPISOK_IMYON=<файл со списком основ>')
  } else {
    sud(n.imena.length === i.skolko, `исключение ${i.fajl} ровно на своё число`,
      `объявлено ${i.skolko}, а в файле ${n.imena.length} — список исключений разошёлся с предметом`)
  }
}

const kopij = SOSTAV.filter(kopiyaPravki).length
sud(kopij === 0, 'в составе нет копий и черновиков', `${kopij} штук`)
let kopii
try {
  kopii = ['src', 'test'].flatMap(fajly).filter(kopiyaPravki)
} catch (e) {
  console.log(`СЛЕПОТА: копии правок не прочитаны (${e?.message ?? e})`)
  process.exit(2)
}
if (kopii.length) {
  const pokrytye = kopii.filter((f) => SOSTAV.some((p) => f === p || f.startsWith(p.replace(/\/+$/, '') + '/')))
  sud(pokrytye.length === 0,
    'копии правок на диске не покрыты составом по имени или каталогу',
    `покрыты: ${pokrytye.join(', ')}`)
} else {
  // RU: B-N-1988/2061: без копий проба не судит; это не успех и не слепота.
  // EN: No edit copies means not applicable, not a successful coverage test.
  neprim += 1
  console.log('НЕ ПРИМЕНИМО состав против диска: копий правок (.bak, .orig, .tmp, .limits) в src/ и test/ нет — '
    + 'судит только рабочий каталог с копиями правок')
}

const kodFajl = (f) => /\.(m?js|cjs|py|sh)$/.test(f)
const KATALOGI_ISP = ['/usr/local/' + 'bin/', '/usr/local/' + 'sbin/',
  '/usr/' + 'bin/', '/usr/' + 'sbin/', '/' + 'bin/', '/' + 'sbin/']
for (const f of SOSTAV) {
  const put = path.join(KORNI, f)
  if (!kodFajl(f) || !existsSync(put)) continue
  const stroki = readFileSync(put, 'utf-8').split('\n')
  const zhyostkie = []
  stroki.forEach((l, i) => {

    const t = l.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (i === 0 && t.startsWith('#!/usr/' + 'bin/env ')) return
    // RU: B-N-1919: каталог — с якорем, а не подстрокой: «a2a-bus/bin/agent-registry» (относительный путь дерева) содержит «/bin/»
    //   и читался как внешняя команда. Перед каталогом не должно быть [A-Za-z0-9._-]. НЕ ловит после правки: /opt/<x>/bin/… —
    //   абсолютный путь вне KATALOGI_ISP (его ловят проверки адресов установки и абсолютных путей выше).
    if (!KATALOGI_ISP.some((k) => new RegExp('(^|[^A-Za-z0-9._-])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(l))) return
    if (l.includes('process.env')) return
    zhyostkie.push(`${i + 1}: ${l.trim().slice(0, 90)}`)
  })
  sud(zhyostkie.length === 0, `${f}: внешних команд жёстким путём нет`,
    zhyostkie.length ? `${zhyostkie.length} шт. — у постороннего этих путей нет, вызов молча не сработает: ${zhyostkie[0]}` : '')
}

const doc = path.join(KORNI, 'SAMOPROBUZHDENIE.md')
if (existsSync(doc)) {
  const t = readFileSync(doc, 'utf-8')
  sud(t.length > 3000, 'описание механизма не заглушка', `${t.length} знаков`)
  sud(/умолчание/i.test(t) && /границ/i.test(t),
    'описание называет умолчания и границы', 'нет одного из двух')
} else { slep += 2; console.log('СЛЕПОТА: описания механизма нет') }

{
  const rm = path.join(KORNI, 'README.md')
  const kod = readFileSync(path.join(KORNI, 'src/index.js'), 'utf-8')
  const m = kod.match(/const SERVER_NAME_DEFAULT = '([^']+)'/)
  if (!existsSync(rm)) { slep += 3; console.log('СЛЕПОТА: README.md нет — предупреждение проверять негде') }
  else if (!m) { slep += 3; console.log('СЛЕПОТА: умолчание имени сервера не вырезалось из кода') }
  else {
    const t = readFileSync(rm, 'utf-8')

    const razdel = (t.match(/##[^\n]*Переход с частной сборки[\s\S]*?(?=\n## |$)/) ?? [''])[0]
    sud(razdel.length > 0,
      'README предупреждает о переходе с частной сборки',
      'раздела нет — ставящий поверх своей сборки потеряет имена инструментов молча')
    sud(razdel.includes('`' + m[1] + '`'),
      `предупреждение называет умолчание «${m[1]}», вырезанное из кода`,
      `в разделе нет значения ${m[1]} — текст разошёлся с SERVER_NAME_DEFAULT`)
    sud(/mcp__/.test(razdel) && /serverName/.test(razdel),
      'предупреждение называет и приставку инструментов, и ключ настройки',
      'без имени ключа предупреждение не говорит, ЧТО закреплять')
  }
}

const ZHDYOM = SOSTAV.reduce((n, f) => n + (existsSync(path.join(KORNI, f)) ? (kodFajl(f) ? 3 : 2) : (sobiraetsya(f) ? 0 : 2)), 0)
  + ISKLYUCHENIYA.length * 2 + 4
  + 3
const vsego = ok + bad + slep + neprim
console.log(`ИТОГО: сошлось ${ok}, расхождений ${bad}, слепот ${slep}, не применимо ${neprim}`)
if (vsego !== ZHDYOM) {
  console.log(`СЛЕПОТА: проверок ${vsego}, ждали ${ZHDYOM} — часть не состоялась`)
  process.exit(2)
}

process.exit(bad > 0 ? 1 : (slep > 0 ? 2 : 0))
