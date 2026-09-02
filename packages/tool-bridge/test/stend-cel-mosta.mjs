/**
 * Приёмка ЦЕЛОСТИ живого моста: сходится ли лежащий на диске код с машиной,
 * на которой он работает. Это тот стенд, который зовёт шаг 5.7 процедуры
 * обновления — после обновления платформы или ОС.
 *
 * 🔴 ЧЕМ ЭТОТ СТЕНД ОТЛИЧАЕТСЯ ОТ ПРОВЕРКИ ЛОГИКИ (stend-heartbeat.mjs).
 * Тот проверяет код сам по себе и пройдёт даже на мёртвой машине. Этот
 * сравнивает код с ТРЕМЯ внешними предметами: с пакетами платформы (схемы
 * инструментов), со слоем настроек и с журналом последнего подъёма. Каждый из
 * трёх переживает обновление отдельно, и молча разойтись может любой.
 *
 * Коды возврата: 0 — сошлось, 1 — расхождение, 2 — слепота (проверить не вышло).
 * 🔴 Слепота отделена от расхождения нарочно: «не смогла проверить» и
 * «проверила, не сходится» — разные ответы, и путать их нельзя.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'

const KORNI = process.env.MOST_KORNI || path.dirname(path.dirname(new URL(import.meta.url).pathname))
// Слой профиля лежит в доме агента; путь выводится от дома, а не вписывается:
// вписанный годится ровно одному установившему.
const SLOJ = process.env.MOST_SLOJ
  || path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
// Имя службы платформы у каждого своё; умолчание — по имени пользователя,
// под которым агент работает.
const YUNIT = process.env.MOST_YUNIT || `${os.userInfo().username}.service`
const SRC = `${KORNI}/src/index.js`
// Имя пакета берётся из манифеста ПРЕДМЕТА: вписанное разошлось бы с ним молча
// при первом же переименовании.
const IMYA_PAKETA = JSON.parse(readFileSync(path.join(KORNI, 'package.json'), 'utf-8')).name
// Имя агента в ФИКСТУРАХ — нейтральное: они подставные, боевого файла не читают.
// 🔴 Имя агента берётся ИЗ ЖИВОЙ НАСТРОЙКИ, а не вписано сюда. Вписанное имя
// делает стенд частным (его нельзя опубликовать) ИЛИ ложно-красным: обезличенное
// «agent» не совпадёт с боевым журналом, где имя настоящее, и стенд объявит
// расхождение на исправном мосте. Поймано 01.09.2026 при починке.
const AGENT_FIX = (() => {
  try {
    const t = readFileSync(SLOJ, 'utf-8')
    const m = t.match(/^\s*limitsAgent:\s*['"]?([\w.-]+)['"]?\s*$/m)
    return m ? m[1] : 'agent'
  } catch { return 'agent' }
})()

let ok = 0, bad = 0, slepota = 0
// Число проверок раздела 2 растёт вместе со слоем настроек: одна на поле.
// Значит ожидание канарейки НЕЛЬЗЯ держать литералом — оно зависит от предмета.
let polejSloja = null
const good = (m) => { ok++; console.log(`  ok   ${m}`) }
const fail = (m) => { bad++; console.log(`  FAIL ${m}`) }
const slepo = (m) => { slepota++; console.log(`  СЛЕПОТА ${m}`) }

if (!existsSync(SRC)) { console.log(`  СЛЕПОТА нет файла моста ${SRC}`); process.exit(2) }
const text = readFileSync(SRC, 'utf8')

console.log('\n=== 0. Всё, на что мост ссылается, лежит на диске ===')
{
  const manifest = JSON.parse(readFileSync(`${KORNI}/package.json`, 'utf8'))
  const obeshchano = new Set([manifest.main].filter(Boolean))
  // Файлы данных мост читает через new URL('./имя', import.meta.url) — берём
  // имена ИЗ КОДА, а не перечисляем: перечень стал бы четвёртой копией списка
  // и разошёлся бы молча.
  for (const m of text.matchAll(/new URL\('\.\/([^']+)'/g)) obeshchano.add(`src/${m[1]}`)
  for (const p of obeshchano) {
    if (existsSync(`${KORNI}/${p}`)) good(`${p} на месте`)
    else fail(`код ссылается на ${p}, а его нет на диске`)
  }
}

console.log('\n=== 1. Схемы инструментов сходятся с ПАКЕТАМИ ПЛАТФОРМЫ ===')
// Мост выставляет чужие инструменты «знак в знак». paritet.json и
// raspisanie.json ПОРОЖДЕНЫ исполнением пакетов платформы. После обновления
// платформы схема у неё могла измениться, а наш снимок остаться прежним —
// тогда мост отдаёт модели устаревшую форму, и никто об этом не скажет.
for (const [gen, snimok] of [['izvlech-paritet.mjs', 'paritet.json'], ['izvlech-raspisanie.mjs', 'raspisanie.json']]) {
  const g = `${KORNI}/tools/${gen}`, s = `${KORNI}/src/${snimok}`
  if (!existsSync(g) || !existsSync(s)) { slepo(`${snimok}: нет ${existsSync(g) ? s : g}`); continue }
  let svezhee
  try { svezhee = execFileSync(process.execPath, [g], { maxBuffer: 64 * 1024 * 1024 }).toString() }
  catch (e) {
    // 🔴 Причину РАЗЛИЧАЕМ, а не пересказываем. Голое «Command failed» у постороннего
    // неотличимо от «пакет сломан», а чаще всего это просто непоставленные зависимости:
    // извлекатели читают пакеты платформы, которых в свежей установке ещё нет.
    // Соседние стенды причину называют — копии обязаны говорить одинаково.
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
// 🔴 НАПРАВЛЕНИЕ ПРОВЕРКИ: от СЛОЯ к СХЕМЕ, а не наоборот. Первая редакция
// этого стенда шла обратно — «раз код печатает источник поля, поле обязано
// быть выписано в слое» — и покраснела на исправной машине: ticketTtlMinutes
// и serverName сознательно живут на умолчаниях, и пометка «(умолчание)» про
// них верна. Проверка отвечала не на тот вопрос.
//
// Настоящая беда здесь другая и молчаливая: опечатка в имени поля. Платформа
// принимает слой целиком, лишний ключ никого не смущает, поле до кода не
// доходит, строка подъёма честно печатает «(умолчание)» — и настройка
// потеряна без единого слова. Ловится только сверкой имён со схемой.
{
  const shema = new Set([...text.matchAll(/^  ([A-Za-z]\w*): z\./gm)].map((m) => m[1]))
  let config
  try {
    const YAML = createRequire(path.join(os.homedir(), 'app', 'package.json'))('yaml')
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
// Самая дорогая проверка: она отвечает на вопрос «работает ли то, что лежит».
// Правка на диске не действует до перезапуска — на этом мы горели дважды.
{
  let start, mtime
  try {
    start = execFileSync('systemctl', ['show', YUNIT, '-p', 'ActiveEnterTimestamp', '--value']).toString().trim()
    mtime = statSync(SRC).mtime
  } catch (e) { slepo(`не спросить systemd про ${YUNIT}: ${String(e?.message ?? e).slice(0, 120)}`) }

  const startMs = start ? Date.parse(start) : NaN
  if (!start || Number.isNaN(startMs)) slepo(`служба ${YUNIT} не даёт времени подъёма (значение «${start}»)`)
  else if (mtime.getTime() > startMs) {
    // Это не отказ и не исправность: сверять нечего, потому что в памяти
    // заведомо другой код. Единственный честный ответ — слепота с причиной.
    slepo(`файл моста правлен ${mtime.toISOString()}, а служба поднята ${new Date(startMs).toISOString()}:`
      + ' в работе ДРУГОЙ код, сверка с журналом невозможна до перезапуска')
  } else {
    const lines = text.split('\n')
    // 🔴 По приметам, а не по номерам строк.
    const i = lines.findIndex((l) => l.includes('log(`предел самопробуждения: не чаще'))
    const j = lines.findIndex((l, k) => k > i && l.includes('НЕ ДЕЙСТВУЕТ'))
    // 🔴 КОНЕЦ БЛОКА — ПО ОТСТУПУ, А НЕ ПО ВИДУ ПОСЛЕДНЕЙ СТРОКИ.
    // Прежний признак («первая после НЕ ДЕЙСТВУЕТ строка, что кончается ")" без
    // запятой») обрывал блок посреди if-а, как только в подъём добавили ветки:
    // фикстура собиралась, а исполнение падало на «Unexpected end of input», и
    // читалось это как дефект МОСТА. Отступ — свойство границы блока, вид строки — нет.
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
        const YAML = createRequire(path.join(os.homedir(), 'app', 'package.json'))('yaml')
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
      } catch { /* ниже выйдет расхождение по пометке источника, и это честно */ }

      // 🔴 ФИКСТУРА СТРОИТСЯ ИЗ ПРЕДМЕТА, А НЕ ПЕРЕЧНЕМ РУКАМИ.
      // Было: шесть полей выписаны здесь вручную. 28.08 в мост перенесли из
      // опубликованного пакета седьмое (heartbeatHumanKinds) — стенд его не знал
      // и падал «not iterable» на ИСПРАВНОМ мосте. Перечень внутри потребителя
      // расходится с источником и НИКОГДА не сообщает об этом сам: расхождение
      // всплывает отказом, а отказ показывает не туда, где причина.
      // Теперь берём НАСТОЯЩИЙ блок построения limits из моста и исполняем его с
      // настоящими умолчаниями. Новое поле подхватится само — вместе со своим
      // умолчанием и своей обёрткой (heartbeatHumanKinds приходит Set-ом, ровно
      // как в бою; прежняя рукописная фикстура давала массив, то есть НЕ то).
      //
      // 🔴 ЧЕМ ЗА ЭТО ПЛАЧЕНО, называю прямо: стенд перестал быть независимым
      // замером ЗНАЧЕНИЙ limits — он больше не знает, чему поля равны, и на
      // подменённые умолчания не покраснеет. Он проверяет другое: что блок строк
      // подъёма исполняется на настоящих значениях и печатает дословно то, что
      // лежит в журнале живого процесса. Значения сверяет раздел 2 — слой против
      // схемы, и там источник другой.
      let limits
      // 🔴 ФИКСТУРА СОБИРАЕТСЯ ИЗ ПРЕДМЕТА ЦЕЛИКОМ — ни имён, ни значений от руки.
      // Прежняя редакция брала константы по шаблону «const X_DEFAULT» и рухнула,
      // когда в блок пришла HEARTBEAT_REZHIMY (31.08.2026): шаблон — признак, а
      // нужен АДРЕС, то есть то, на что блок реально ссылается.
      // Значения полей pd берутся из таблицы UMOLCHANIYA_PREDELOV того же моста,
      // а не переписываются сюда: рукописный перечень отстанет молча, и стенд
      // покраснеет на исправном предмете (так и вышло с восемью полями из
      // двенадцати). Новое поле подхватывается само.
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
      // Замыкание по ссылкам: константа может ссылаться на другую константу.
      // 🔴 Блок подъёма зовёт ФУНКЦИИ моста (stupeniKratko, dlinaPolosy,
      // pochelovecheski). Перечислять их от руки нельзя: перечень отстанет от
      // предмета молча — ровно то, на чём стенд и встал 31.08. Собираем по
      // ссылкам из самого блока, как и константы.
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
      const sobratKonstanty = (istochniki) => {
        const nuzhny = new Set()
        const dobavit = (txt) => {
          for (const m of txt.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) nuzhny.add(m[1])
        }
        istochniki.forEach(dobavit)
        const gotovo = new Map()
        for (let krug = 0; krug < 10; krug++) {
          let novoe = false
          for (const imya of [...nuzhny]) {
            if (gotovo.has(imya)) continue
            const m = text.match(new RegExp(`^\\s*const ${imya} = (.+)$`, 'm'))
            if (!m) continue
            // Имя, определённое МНОГОСТРОЧНЫМ блоком (const X = {…}), не тянем
            // отдельной строкой: такой блок либо уже подан как источник, либо
            // фикстуре не нужен. Иначе стенд требует того, чего в однострочном
            // виде не существует, и слепнет на исправном мосте.
            if (m[1].trim() === '{') { gotovo.set(imya, ''); continue }
            gotovo.set(imya, `const ${imya} = ${m[1]}`)
            dobavit(m[1]); novoe = true
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
          // 🔴 С 31.08.2026 блок limits берёт восемь значений не из config, а из
          // pd — разобранного файла /etc/agent-limits. Фикстура обязана давать
          // ИМЕННО ТУ форму, что читает предмет: подставляем pd со значениями
          // слоя, иначе стенд краснеет на исправном мосте (поймано в тот же день).
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
          const znach = mUm.default()
          // 🔴 02.09.2026: фикстура брала УМОЛЧАНИЯ, а бой читает НАСТРОЙКИ, и строки
          // подъёма расходились на каждом значении, отличном от умолчания. Поймано,
          // когда часовой потолок стал 4 при умолчании 0: стенд дал FAIL на исправном
          // мосте. Значения берём из того же файла, что и предмет; нет файла — остаются
          // умолчания, и это честная граница (у постороннего файла и не бывает).
          let istochnikZnachenij = 'умолчания моста'
          try {
            const fajl = `/etc/agent-limits/${AGENT_FIX}.yml`
            if (existsSync(fajl)) {
              const txt = readFileSync(fajl, 'utf8')
              let vzyato = 0
              for (const k of Object.keys(znach)) {
                const m2 = txt.match(new RegExp(`^\\s*${k}:\\s*(.+?)\\s*(?:#.*)?$`, 'm'))
                if (!m2) continue
                const raw = m2[1].trim()
                znach[k] = /^-?\d+$/.test(raw) ? Number(raw)
                  : raw === 'true' ? true : raw === 'false' ? false
                  // Список в квадратных скобках — МАССИВ, а не строка. Взятая строкой,
                  // она раскладывается предметом посимвольно, и строка подъёма выходит
                  // мусорной; поймано 02.09 на humanKinds: [user, a2a].
                  : /^\[.*\]$/.test(raw) ? raw.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean)
                  : raw.replace(/^["']|["']$/g, '')
                vzyato += 1
              }
              if (vzyato) istochnikZnachenij = `${fajl} (полей ${vzyato})`
            }
          } catch { /* остаются умолчания: причина названа строкой ниже */ }
          good(`значения фикстуры: ${istochnikZnachenij}`)
          const pdFix = { znach, ist: {}, beda: null }
          for (const k of Object.keys(znach)) pdFix.ist[k] = `/etc/agent-limits/${AGENT_FIX}.yml`
          const m = await import('data:text/javascript;charset=utf-8,'
            + encodeURIComponent(`export default (config, pd) => {\n${defs.join('\n')}\n${blok}\nreturn limits\n}`))
          limits = m.default(config, pdFix)
          good(`фикстура limits собрана ИЗ МОСТА: полей ${Object.keys(limits).length}, `
            + `констант ${defs.length}, значений pd ${Object.keys(znach).length}`)
        } catch (e) {
          fail(`блок построения limits не исполнился: ${String(e?.message ?? e).slice(0, 160)}`)
        }
      }
      // Канарейка: каждое поле, которое блок строк подъёма читает из limits,
      // обязано в нём быть. Сборка из предмета делает расхождение маловероятным,
      // но не невозможным — извлечение могло прихватить не тот блок.
      if (limits) {
        const nuzhno = [...new Set([...text.matchAll(/limits\.(heartbeat\w+)/g)].map((m) => m[1]))]
        const netu = nuzhno.filter((k) => limits[k] === undefined)
        if (netu.length) fail(`фикстура limits неполна: код читает ${netu.join(', ')}, а собранный limits их не содержит`)
        else good(`фикстура limits полна: ${nuzhno.length} полей, читаемых кодом`)
      }
      const out = []
      const log = (m) => out.push(`[mcp-bridge] ${m}`)
      const src = (k) => (config?.[k] === undefined ? 'умолчание' : 'настройка')
      // 🔴 Второй источник с 31.08.2026: восемь пределов читаются из файла, и строки
      // подъёма называют ФАЙЛ, а не слово «настройка». Фикстура повторяет форму
      // предмета: короткое имя файла.
      const srcP = (k) => `${AGENT_FIX}.yml`
      if (!limits) {
        // Причина уже названа выше. Исполнять блок подъёма без фикстуры значило бы
        // получить второй отказ по той же причине — и читался бы он как отдельный
        // дефект моста, то есть указывал бы не туда.
        slepo('фикстура limits не собрана — блок строк подъёма исполнять не на чем')
      } else {
        try {
          const body = lines.slice(i, last + 1).join('\n')
          const fn = sobratFunkcii(body)
          const kon = sobratKonstanty([body, ...fn.map((f) => f.txt)])
          // Имена, которые уже приходят ПАРАМЕТРАМИ фикстуры, не объявляем второй
          // раз: иначе «Identifier has already been declared», и отказ читался бы
          // как дефект моста.
          const parametry = new Set(['log', 'limits', 'src', 'srcP', 'pd',
            'LIMITS_DIR', 'limitsAgent', 'STROGO'])
          const defsF = [...kon.gotovo.entries()]
            .filter(([imya, txt]) => txt && !parametry.has(imya))
            .map(([, txt]) => txt)
          const m = await import('data:text/javascript;charset=utf-8,'
            + encodeURIComponent(`export default (log, limits, src, srcP, pd, LIMITS_DIR, limitsAgent, STROGO) => {\n`
              + `${defsF.join('\n')}\n${fn.map((f) => f.txt).join('\n')}\n${body}\n}`))
          m.default(log, limits, src, srcP,
            { znach: {}, ist: {}, beda: null }, '/etc/agent-limits', AGENT_FIX,
            { minIntervalSeconds: 3600, maxConsecutiveCount: 1, maxPerDayCount: 1 })
        } catch (e) { fail(`блок строк подъёма не исполнился: ${String(e?.message ?? e).slice(0, 160)}`) }
      }

      let zhurnal
      try {
        zhurnal = execFileSync('journalctl',
          ['-u', YUNIT, '--since', start, '--no-pager', '-o', 'cat'],
          { maxBuffer: 256 * 1024 * 1024 }).toString()
      } catch (e) { slepo(`журнал ${YUNIT} не читается: ${String(e?.message ?? e).slice(0, 120)}`) }

      if (zhurnal !== undefined && limits && !out.length) {
        // Молчаливый исход: блок нашёлся, исполнился и не напечатал ничего —
        // сверять с журналом нечего, а раньше это проходило тихо.
        fail('блок строк подъёма исполнился, но не дал ни одной строки — сверять с журналом нечего')
      } else if (zhurnal !== undefined && out.length) {
        if (!zhurnal.includes('[mcp-bridge]')) {
          slepo('в журнале с подъёма нет ни одной строки моста — возможно, ротация журнала или мост не смонтирован')
        } else for (const stroka of out) {
          if (zhurnal.includes(stroka)) good(`строка подъёма совпала дословно: ${stroka.slice(12, 70)}…`)
          else fail(`строка из кода НЕ найдена в журнале подъёма:\n       ${stroka.slice(0, 200)}`)
        }
      }
    }
  }
}


console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}, слепота ${slepota}`)

// 🔴 КАНАРЕЙКА ТОЧНОГО ЧИСЛА. Замерено 28.08.2026: вырезанный раздел проходил
// кодом 0 — выпотрошенный стенд отчитывался успехом. Канарейки в dorabotki я
// заводила 25.08, но по КАТАЛОГУ, а не по классу, и стенды моста в тот проход
// не попали. Число точное, а не «не меньше»: порог слеп к убыли ровно того
// размера, который умещается в запас.
// Меняли стенд намеренно? Поправьте число и скажите, почему.
// 🔴 Ожидание СЧИТАЕТСЯ ИЗ ПРЕДМЕТА, а не задано числом: раздел 2 даёт по одной
// проверке на каждое поле слоя, и литерал устаревал бы при каждой новой настройке
// (28.08 так и вышло: поле добавлено — канарейка объявила «часть не состоялась»
// на исправном стенде). BAZA — проверки, не зависящие от числа полей.
// 28.08: BAZA 8 -> 9. Фикстура limits теперь собирается ИЗ МОСТА, и сборка сама
// себя объявляет отдельной проверкой (было: только «фикстура полна»).
// 🔴 База выросла с 9 до 10 (31.08.2026): добавилась проверка «фикстура limits
// собрана из моста» после перехода восьми пределов на чтение из файла.
// 🔴 База 10 -> 12 (01.09.2026): починка сбора фикстуры добавила две проверки —
// строки подъёма теперь исполняются целиком (блок берётся по ОТСТУПУ, а не по виду
// последней строки) и сверяются с журналом построчно, а не обрывались на первом же
// «)» без запятой.
const BAZA = 13
if (polejSloja === null) {
  console.log('\nСЛЕПОТА: раздел 2 не отработал, число полей слоя неизвестно — считать ожидание не из чего.')
  process.exit(2)
}
const ZHDYOM = BAZA + polejSloja
if (ok + bad + slepota !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad + slepota}, а стенд состоит из ${ZHDYOM} (${BAZA} + ${polejSloja} полей слоя) — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : (slepota ? 2 : 0))
