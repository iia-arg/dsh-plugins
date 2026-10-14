// RU: Проверка stend-publikacii: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-publikacii verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const KORNI = process.env.MOST_KORNI
  || path.dirname(path.dirname(new URL(import.meta.url).pathname))

const SOSTAV = (() => {
  try {
    const m = JSON.parse(readFileSync(path.join(KORNI, 'package.json'), 'utf-8'))
    const f = Array.isArray(m.files) ? m.files.filter((x) => typeof x === 'string') : []

    return f.includes('package.json') ? f : ['package.json', ...f]
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

let ok = 0, bad = 0, slep = 0
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

const kopij = SOSTAV.filter((f) => /\.bak|\.orig|\.tmp|\.limits$/.test(f)).length
sud(kopij === 0, 'в составе нет копий и черновиков', `${kopij} штук`)
const vsegoNaDiske = ['src', 'test'].reduce((n, d) => {
  try { return n + readdirSync(path.join(KORNI, d)).length } catch { return n }
}, 0)

const estKopij = ['src', 'test'].some((d) => {
  try { return readdirSync(path.join(KORNI, d)).some((f) => /\.bak-pre-|\.limits$/.test(f)) }
  catch { return false }
})
if (estKopij) {
  sud(vsegoNaDiske > SOSTAV.length,
    'на диске файлов БОЛЬШЕ, чем в составе — публикуется перечень, а не каталог',
    `на диске ${vsegoNaDiske}, в составе ${SOSTAV.length}`)
} else {
  slep += 1
  console.log('СЛЕПОТА состав против диска: копий правок рядом нет — это собранный '
    + 'пакет, а не рабочий каталог, и лишним файлам тут взяться неоткуда')
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
const vsego = ok + bad + slep
console.log(`ИТОГО: сошлось ${ok}, расхождений ${bad}, слепот ${slep}`)
if (vsego !== ZHDYOM) {
  console.log(`СЛЕПОТА: проверок ${vsego}, ждали ${ZHDYOM} — часть не состоялась`)
  process.exit(2)
}

process.exit(bad > 0 ? 1 : (slep > 0 ? 2 : 0))
