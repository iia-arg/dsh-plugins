// RU: Проверка stend-cel-mosta: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-cel-mosta verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { readFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'

const KORNI = process.env.MOST_KORNI || path.dirname(path.dirname(new URL(import.meta.url).pathname))

const DOM = path.basename(path.dirname(KORNI)) === 'plugins' ? path.dirname(path.dirname(KORNI)) : os.homedir()

const SLOJ = process.env.MOST_SLOJ
  || path.join(DOM, '.dsh', 'profiles', 'web', 'cordis.patch.yml')

const YUNIT = process.env.MOST_YUNIT || (path.basename(path.dirname(KORNI)) === 'plugins'
  ? `${path.basename(path.dirname(path.dirname(KORNI)))}.service` : `${os.userInfo().username}.service`)
const SRC = `${KORNI}/src/index.js`

const MANIFEST_PAKETA = JSON.parse(readFileSync(path.join(KORNI, 'package.json'), 'utf-8'))
const IMYA_PAKETA = MANIFEST_PAKETA.name

let PODPIS_MOSTA = `[${MANIFEST_PAKETA.name} ${MANIFEST_PAKETA.version}]`

const AGENT_FIX = (() => {
  try {
    const t = readFileSync(SLOJ, 'utf-8')
    const m = t.match(/^\s*limitsAgent:\s*['"]?([\w.-]+)['"]?\s*$/m)
    return m ? m[1] : 'agent'
  } catch { return 'agent' }
})()

let ok = 0, bad = 0, slepota = 0

let polejSloja = null

let strokPodyoma = null

let fajlovNaDiske = null
const good = (m) => { ok++; console.log(`  ok   ${m}`) }
const fail = (m) => { bad++; console.log(`  FAIL ${m}`) }
const slepo = (m) => { slepota++; console.log(`  СЛЕПОТА ${m}`) }

if (!existsSync(SRC)) { console.log(`  СЛЕПОТА нет файла моста ${SRC}`); process.exit(2) }
const srcBytes = readFileSync(SRC)
const text = srcBytes.toString('utf8')
const summaNaDiske = createHash('sha256').update(srcBytes).digest('hex')

console.log('\n=== 0. Всё, на что мост ссылается, лежит на диске ===')
{
  const manifest = JSON.parse(readFileSync(`${KORNI}/package.json`, 'utf8'))
  const obeshchano = new Set([manifest.main].filter(Boolean))

  for (const m of text.matchAll(/new URL\('\.\/([^']+)'/g)) obeshchano.add(`src/${m[1]}`)
  fajlovNaDiske = obeshchano.size
  for (const p of obeshchano) {
    if (existsSync(`${KORNI}/${p}`)) good(`${p} на месте`)
    else fail(`код ссылается на ${p}, а его нет на диске`)
  }
}

console.log('\n=== 1. Схемы инструментов сходятся с ПАКЕТАМИ ПЛАТФОРМЫ ===')

for (const [gen, snimok] of [['izvlech-paritet.mjs', 'paritet.json'], ['izvlech-raspisanie.mjs', 'raspisanie.json']]) {
  const g = `${KORNI}/tools/${gen}`, s = `${KORNI}/src/${snimok}`
  if (!existsSync(g) || !existsSync(s)) { slepo(`${snimok}: нет ${existsSync(g) ? s : g}`); continue }

  const najtiKoren = () => {
    let d = KORNI
    for (let i = 0; i < 8; i++) {
      if (existsSync(`${d}/node_modules/@deepseek-ai`)) return d
      const up = path.dirname(d)
      if (up === d) break
      d = up
    }
    return process.env.MOST_APP || null
  }
  const korenPlatformy = najtiKoren()
  if (!korenPlatformy) {
    slepo(`${snimok}: не найден корень платформы (каталог с node_modules/@deepseek-ai) — `
      + `извлекатель запускать не с чем. Задайте MOST_APP, если он лежит вне дерева плагина`)
    continue
  }
  let svezhee
  try { svezhee = execFileSync(process.execPath, [g, korenPlatformy], { maxBuffer: 64 * 1024 * 1024 }).toString() }
  catch (e) {

    const txt = `${e?.stderr ?? ''}${e?.message ?? e}`
    const net = /ERR_MODULE_NOT_FOUND|Cannot find (module|package)/.test(txt)
    slepo(net
      ? `${snimok}: извлекатель не нашёл пакеты платформы (ERR_MODULE_NOT_FOUND) — `
        + 'зависимости не поставлены; это норма для свежей установки, а не поломка пакета. '
        + 'Поставьте зависимости и повторите'
      : `${snimok}: извлекатель отказал не из-за зависимостей — ${String(txt).slice(0, 160)}`)
    continue
  }
  const lezhit = readFileSync(s, 'utf8')
  if (svezhee === lezhit) good(`${snimok}: порождённое из пакетов платформы тождественно лежащему`)
  else {
    const a = JSON.parse(svezhee), b = JSON.parse(lezhit)
    const imena = (x) => x.map((t) => t.name).join(',')
    fail(`${snimok}: РАЗОШЛОСЬ с пакетами платформы`
      + `\n       у платформы ${a.length}: ${imena(a)}`
      + `\n       в мосте     ${b.length}: ${imena(b)}`)
  }
}

console.log('\n=== 2. Каждое поле слоя настроек объявлено в схеме моста ===')

{
  const shema = new Set([...text.matchAll(/^  ([A-Za-z]\w*): z\./gm)].map((m) => m[1]))
  let config
  try {
    const YAML = createRequire(path.join(DOM, 'app', 'package.json'))('yaml')
    const doc = YAML.parse(readFileSync(SLOJ, 'utf8'))
    const najdeno = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') {
        if (n.name === IMYA_PAKETA || n.id === IMYA_PAKETA) najdeno.push(n)
        Object.values(n).forEach(walk)
      }
    }
    walk(doc)
    if (najdeno.length !== 1) throw new Error(`записей моста в слое ${najdeno.length}, а не одна`)
    config = najdeno[0].config ?? {}
  } catch (e) { slepo(`слой настроек ${SLOJ}: ${String(e?.message ?? e).slice(0, 140)}`) }

  if (!shema.size) fail('в файле моста не разобралась схема Config — стенд смотрит не в тот файл')
  if (config) {
    const kluchi = Object.keys(config)
    polejSloja = kluchi.length
    console.log(`       сырьё: в схеме полей ${shema.size}, в слое выписано ${kluchi.length}`)
    if (!kluchi.length) fail('в слое у моста нет ни одного поля — настройки потеряны целиком')
    for (const k of kluchi) {
      if (shema.has(k)) good(`${k}: объявлено в схеме, значение ${JSON.stringify(config[k])} дойдёт до кода`)
      else fail(`${k}: выписано в слое, но в схеме моста такого поля НЕТ —`
        + ' значение до кода не дойдёт, а строка подъёма скажет «умолчание»')
    }
  }
}

console.log('\n=== 3. Строки подъёма из кода дословно совпадают с журналом ===')

{
  let start, pid, zhurnal
  try {
    start = execFileSync('systemctl', ['show', YUNIT, '-p', 'ActiveEnterTimestamp', '--value'], { timeout: 10_000 }).toString().trim()
    pid = execFileSync('systemctl', ['show', YUNIT, '-p', 'MainPID', '--value'], { timeout: 10_000 }).toString().trim()
  } catch (e) { slepo(`не спросить systemd про ${YUNIT}: ${String(e?.message ?? e).slice(0, 120)}`) }

  const startMs = start ? Date.parse(start) : NaN

  let kodSoveren = false
  let nastrojkiMtime = null
  if (!start || Number.isNaN(startMs)) slepo(`служба ${YUNIT} не даёт времени подъёма (значение «${start}»)`)
  else if (!/^[1-9][0-9]*$/.test(pid ?? '')) slepo(`служба ${YUNIT} не даёт MainPID`)
  else {
    try {
      // Preserve the fleet reader's unit/start header; bind the content receipt to MainPID too.
      const file = process.env.MOST_ZHURNAL_YUNITA
      if (file) {
        const [header, ...lines] = readFileSync(file, 'utf8').split('\n')
        if (header !== `#MOST_ZHURNAL_YUNITA ${YUNIT} ${start}`) throw new Error('журнал относится к другому юниту или подъёму')
        zhurnal = lines.join('\n')
        console.log(`       журнал ${YUNIT} — из файла ${file} (снят обходчиком, подъём ${start})`)
      } else zhurnal = execFileSync('journalctl',
        ['-u', YUNIT, '--since', start, '--no-pager', '-o', 'cat'],
        { maxBuffer: 256 * 1024 * 1024, timeout: 10_000 }).toString()
      const pidPosle = execFileSync('systemctl', ['show', YUNIT, '-p', 'MainPID', '--value'], { timeout: 10_000 }).toString().trim()
      const startPosle = execFileSync('systemctl', ['show', YUNIT, '-p', 'ActiveEnterTimestamp', '--value'], { timeout: 10_000 }).toString().trim()
      if (pidPosle !== pid || startPosle !== start) throw new Error('процесс сменился во время чтения журнала')
    } catch (e) { slepo(`журнал ${YUNIT} не читается: ${String(e?.message ?? e).slice(0, 160)}`); zhurnal = undefined }
    if (zhurnal !== undefined) {
      // Select receipts before validating them: a valid old line must not hide a broken one.
      const receipts = zhurnal.split('\n').filter(line => line.startsWith(`[${IMYA_PAKETA} `) && line.includes('] src/index.js '))
        .filter(line => {
          const owner = line.match(/ pid=([1-9][0-9]*)$/)
          return !owner || owner[1] === pid
        })
      const marks = receipts.map(line => line.match(/^(\[([^\]\r\n]+)\]) src\/index\.js sha256=([0-9a-f]{64}) pid=([1-9][0-9]*)$/))
      if (marks.some(m => !m)) slepo(`${YUNIT} PID ${pid}: битая startup-квитанция src/index.js или неразборчивый PID`)
      else if (!marks.length) slepo(`${YUNIT} PID ${pid}: нет startup SHA256 src/index.js; нужен первый подъём с новым мостом, mtime не доказательство`)
      else if (new Set(marks.map(m => m[3])).size !== 1) slepo(`${YUNIT} PID ${pid}: разные startup SHA256 src/index.js`)
      else if (marks[0][3] !== summaNaDiske) fail(`${SRC}: содержимое отличается от кода ${YUNIT} PID ${pid}; диск sha256=${summaNaDiske}, процесс sha256=${marks[0][3]}`)
      else {
        // A manifest/test-only release can change disk version without changing loaded source.
        PODPIS_MOSTA = marks.at(-1)[1]
        good(`src/index.js: содержимое совпало с startup SHA256 ${summaNaDiske} PID ${pid}`)
        kodSoveren = true
      }
    }
  }
  if (kodSoveren) {
    const lines = text.split('\n')

    const i = lines.findIndex((l) => l.includes('log(`предел самопробуждения: не чаще'))
    const j = lines.findIndex((l, k) => k > i && l.includes('НЕ ДЕЙСТВУЕТ'))

    const otstup = (l) => l.length - l.trimStart().length
    const otstupBloka = otstup(lines[i])
    let last = -1
    for (let k = i; k < lines.length; k++) {
      if (lines[k].trim() === '') continue
      if (k > i && otstup(lines[k]) < otstupBloka) break
      last = k
    }
    if (i < 0 || j < 0 || last < 0) fail('в файле моста нет блока строк подъёма — стенд смотрит не в то место')
    else {
      let config = {}
      try {
        const YAML = createRequire(path.join(DOM, 'app', 'package.json'))('yaml')
        const doc = YAML.parse(readFileSync(SLOJ, 'utf8'))
        const najdeno = []
        const walk = (n) => {
          if (Array.isArray(n)) return n.forEach(walk)
          if (n && typeof n === 'object') {
            if (n.name === IMYA_PAKETA || n.id === IMYA_PAKETA) najdeno.push(n)
            Object.values(n).forEach(walk)
          }
        }
        walk(doc)
        config = najdeno[0]?.config ?? {}
      } catch {                                                                  }

      // RU: Один каталог для чтения политики и строки подъёма; MOST_PREDELY задаёт диагностический override.
      // EN: Use one directory for policy reads and startup output; MOST_PREDELY supplies a diagnostic override.
      const limitsDir = process.env.MOST_PREDELY || (config?.limitsDir ?? (process.env.AGENT_LIMITS_DIR || './limits'))

      let limits
      let znachFix = {}
      const izFajla = new Set()
      const istochnikKlyucha = new Map()

      const vzyatBlok = (primeta) => {
        const b = lines.findIndex((l) => l.includes(primeta))
        if (b < 0) return null
        let depth = 0
        for (let k = b; k < lines.length; k++) {
          depth += (lines[k].match(/\{/g) || []).length - (lines[k].match(/\}/g) || []).length
          if (depth === 0 && k > b) return lines.slice(b, k + 1).join('\n')
        }
        return null
      }
      const blokLimits = vzyatBlok('const limits = {')
      const blokUmolch = vzyatBlok('const UMOLCHANIYA_PREDELOV = {')

      const sobratFunkcii = (istochnik) => {
        const vstroennye = new Set(['log', 'src', 'srcP', 'String', 'Number', 'Object',
          'Array', 'JSON', 'Math', 'Boolean', 'Set', 'Map', 'Date', 'if', 'for',
          'while', 'switch', 'catch', 'return', 'true', 'false', 'includes', 'join',
          'map', 'filter', 'push', 'slice', 'split', 'toFixed'])
        const out = []
        for (const m of istochnik.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)) {
          const imya = m[1]
          if (vstroennye.has(imya) || out.some((x) => x.imya === imya)) continue
          const b = lines.findIndex((l) => l.startsWith(`function ${imya}(`))
          if (b < 0) continue
          let depth = 0
          for (let k = b; k < lines.length; k++) {
            depth += (lines[k].match(/\{/g) || []).length - (lines[k].match(/\}/g) || []).length
            if (depth === 0 && k > b) { out.push({ imya, txt: lines.slice(b, k + 1).join('\n') }); break }
          }
        }
        return out
      }

      const vzyatObyavlenie = (istochnik, imya) => {
        const stroki = istochnik.split('\n')
        const re = new RegExp(`^\\s*const ${imya}\\s*=`)
        const i = stroki.findIndex((l) => re.test(l))
        if (i < 0) return null
        const kus = []
        for (let k = i; k < stroki.length && k - i <= 200; k++) {
          kus.push(stroki[k])
          const txt = kus.join('\n')

          const dlyaRazbora = txt.replace(/\bimport\.meta\b/g, "({url:''})")
          try { new Function(dlyaRazbora); return txt } catch {                                   }
        }
        return null
      }

      const sobratKonstanty = (istochniki) => {
        const nuzhny = new Set()
        const dobavit = (txt) => {
          for (const m of txt.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
            // RU: Именованное свойство вроде process.env.KEY не является ссылкой на глобальную константу.
            // EN: A named property such as process.env.KEY is not a global constant reference.
            const before = txt.slice(0, m.index).trimEnd()
            if (before.endsWith('.') && !before.endsWith('...')) continue
            nuzhny.add(m[1])
          }
        }
        istochniki.forEach(dobavit)

        const uzheEst = new Set()
        for (const ist of istochniki) {
          for (const m of ist.matchAll(/^\s*const ([A-Z][A-Z0-9_]{2,})\s*=/gm)) uzheEst.add(m[1])
        }
        const gotovo = new Map()
        for (let krug = 0; krug < 10; krug++) {
          let novoe = false
          for (const imya of [...nuzhny]) {
            if (gotovo.has(imya)) continue
            if (uzheEst.has(imya)) { gotovo.set(imya, ''); continue }

            const obyavlenie = vzyatObyavlenie(text, imya)
            if (obyavlenie === null) continue
            gotovo.set(imya, obyavlenie)
            dobavit(obyavlenie); novoe = true
          }
          if (!novoe) break
        }
        return { gotovo, nuzhny }
      }
      if (!blokLimits) {
        slepo('в файле моста не найден блок «const limits = {» — фикстуру не собрать из предмета')
      } else if (!blokUmolch) {
        slepo('в файле моста не найден блок «const UMOLCHANIYA_PREDELOV = {» — значения полей pd взять неоткуда')
      } else {
        try {
          const blok = blokLimits

          const { gotovo, nuzhny } = sobratKonstanty([blokLimits, blokUmolch])
          const nenajdeny = [...nuzhny].filter((k) => !gotovo.has(k))
          if (nenajdeny.length) {
            slepo(`в мосте не найдены определения констант, на которые ссылаются блоки: `
              + `${nenajdeny.join(', ')} — фикстуру не собрать из предмета`)
            throw new Error('фикстура не собрана')
          }
          const defs = [...gotovo.values()].filter(Boolean)
          const mUm = await import('data:text/javascript;charset=utf-8,'
            + encodeURIComponent(`export default () => {\n${defs.join('\n')}\n${blokUmolch}\nreturn UMOLCHANIYA_PREDELOV\n}`))
          znachFix = mUm.default()
          const znach = znachFix

          const istPoKlyuchu = {}
          for (const k of Object.keys(znach)) istPoKlyuchu[k] = 'умолчание кода'
          const vzyatoIz = []
          for (const fajl of [path.join(limitsDir, 'obshchee.yml'), path.join(limitsDir, `${AGENT_FIX}.yml`)]) {
            try {
              if (!existsSync(fajl)) continue
              const txt = readFileSync(fajl, 'utf8')
              let vzyato = 0
              for (const k of Object.keys(znach)) {
                const m2 = txt.match(new RegExp(`^\\s*${k}:\\s*(.+?)\\s*(?:#.*)?$`, 'm'))
                if (!m2) continue
                const raw = m2[1].trim()
                znach[k] = /^-?\d+$/.test(raw) ? Number(raw)
                  : raw === 'true' ? true : raw === 'false' ? false

                  : /^\[.*\]$/.test(raw) ? raw.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean)
                  : raw.replace(/^["']|["']$/g, '')
                vzyato += 1
                izFajla.add(k)
                istPoKlyuchu[k] = fajl
                istochnikKlyucha.set(k, fajl)
              }

              if (vzyato) {
                vzyatoIz.push(`${fajl} (полей ${vzyato})`)
                nastrojkiMtime = Math.max(nastrojkiMtime ?? 0, statSync(fajl).mtime.getTime())
              }
            } catch {                                                                          }
          }
          const istochnikZnachenij = vzyatoIz.length ? vzyatoIz.join(' + ') : 'умолчания моста'
          good(`значения фикстуры: ${istochnikZnachenij}`)
          const pdFix = { znach, ist: istPoKlyuchu, beda: null }
          const m = await import('data:text/javascript;charset=utf-8,'
            + encodeURIComponent(`export default (config, pd) => {\n${defs.join('\n')}\n${blok}\nreturn limits\n}`))
          limits = m.default(config, pdFix)
          good(`фикстура limits собрана ИЗ МОСТА: полей ${Object.keys(limits).length}, `
            + `констант ${defs.length}, значений pd ${Object.keys(znach).length}`)
        } catch (e) {
          fail(`блок построения limits не исполнился: ${String(e?.message ?? e).slice(0, 160)}`)
        }
      }

      if (limits) {
        const nuzhno = [...new Set([...text.matchAll(/limits\.(heartbeat\w+)/g)].map((m) => m[1]))]
        const netu = nuzhno.filter((k) => limits[k] === undefined)
        if (netu.length) fail(`фикстура limits неполна: код читает ${netu.join(', ')}, а собранный limits их не содержит`)
        else good(`фикстура limits полна: ${nuzhno.length} полей, читаемых кодом`)
      }
      const out = []
      const log = (m) => out.push(`${PODPIS_MOSTA} ${m}`)
      const src = (k) => (config?.[k] === undefined ? 'умолчание' : 'настройка')

      const srcP = (k) => (istochnikKlyucha.has(k) ? path.basename(istochnikKlyucha.get(k)) : 'умолчание кода')
      if (!limits) {

        slepo('фикстура limits не собрана — блок строк подъёма исполнять не на чем')
      } else {
        try {
          const body = lines.slice(i, last + 1).join('\n')
          const fn = sobratFunkcii(body)
          const kon = sobratKonstanty([body, ...fn.map((f) => f.txt)])

          const parametry = new Set(['log', 'limits', 'src', 'srcP', 'pd',
            'limitsDir', 'limitsAgent', 'STROGO'])
          const defsF = [...kon.gotovo.entries()]
            .filter(([imya, txt]) => txt && !parametry.has(imya))
            .map(([, txt]) => txt)
          const m = await import('data:text/javascript;charset=utf-8,'
            + encodeURIComponent(`export default (log, limits, src, srcP, pd, limitsDir, limitsAgent, STROGO) => {\n`
              + `${defsF.join('\n')}\n${fn.map((f) => f.txt).join('\n')}\n${body}\n}`))
          m.default(log, limits, src, srcP,
            { znach: {}, ist: {}, beda: null }, limitsDir, AGENT_FIX,
            { minIntervalSeconds: 3600, maxConsecutiveCount: 1, maxPerDayCount: 1 })
        } catch (e) { fail(`блок строк подъёма не исполнился: ${String(e?.message ?? e).slice(0, 160)}`) }
      }

      strokPodyoma = out.length
      if (zhurnal !== undefined && limits && !out.length) {

        fail('блок строк подъёма исполнился, но не дал ни одной строки — сверять с журналом нечего')
      } else if (nastrojkiMtime && !Number.isNaN(startMs) && nastrojkiMtime > startMs) {

        slepo(`настройки правлены ${new Date(nastrojkiMtime).toISOString()}, а служба поднята `
          + `${new Date(startMs).toISOString()}: фикстура строит строки по новым значениям, `
          + 'которых в журнале старого подъёма нет — сверка невозможна до перезапуска')
      } else if (zhurnal !== undefined && out.length) {
        if (!zhurnal.includes(PODPIS_MOSTA)) {
          slepo(`в журнале с подъёма нет ни одной строки моста с подписью ${PODPIS_MOSTA} — возможно, ротация журнала, мост не смонтирован или подпись сменилась`)
        } else for (const stroka of out) {
          if (zhurnal.includes(stroka)) good(`строка подъёма совпала дословно: ${stroka.slice(PODPIS_MOSTA.length + 1, PODPIS_MOSTA.length + 59)}…`)
          else fail(`строка из кода НЕ найдена в журнале подъёма:\n       ${stroka.slice(0, 200)}`)
        }
      }
    }
  }
}

console.log('\n=== 5. Сторож появления создателя фоновых задач ===')

{

  const sozdatel = [...text.matchAll(/['"]?(run_in_background|runInBackground)['"]?\s*:/g)].map((m) => m[1])
  const znaetRazmer = /byteLength/.test(text)
  if (sozdatel.length === 0) {
    good('создателя фоновых задач среди инструментов моста нет — признак размера не нужен')
  } else if (znaetRazmer) {
    good(`создатель фоновых задач появился (${sozdatel.join(', ')}), и мост меряет размер результата`)
  } else {
    fail(`создатель фоновых задач появился (${sozdatel.join(', ')}), а мост размер результата НЕ меряет: `
      + 'крупный вывод уедет в контекст целиком, spill-policy его не увидит (мост минует реестр). '
      + 'Завести признак размера или объяснить, почему он не нужен')
  }
}

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}, слепота ${slepota}`)

const BAZA = 7
if (polejSloja === null) {
  console.log('\nСЛЕПОТА: раздел 2 не отработал, число полей слоя неизвестно — считать ожидание не из чего.')
  process.exit(bad ? 1 : 2)
}
if (strokPodyoma === null) {
  console.log('\nСЛЕПОТА: блок строк подъёма не исполнился, число его строк неизвестно — считать ожидание не из чего.')
  process.exit(bad ? 1 : 2)
}
const ZHDYOM = BAZA + fajlovNaDiske + polejSloja + strokPodyoma
if (ok + bad + slepota !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad + slepota}, а стенд состоит из ${ZHDYOM} (${BAZA} база + ${fajlovNaDiske} файлов + ${polejSloja} полей слоя + ${strokPodyoma} строк подъёма) — часть не состоялась.`)
  process.exit(bad ? 1 : 2)
}
process.exit(bad ? 1 : (slepota ? 2 : 0))
