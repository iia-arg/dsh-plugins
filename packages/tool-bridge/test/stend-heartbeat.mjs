/**
 * Приёмка счётной части предела самопробуждения ЖИВОГО моста.
 *
 * 🔴 ПОЧЕМУ ЭТОТ ФАЙЛ ЛЕЖИТ ЗДЕСЬ, А НЕ В ДЕРЕВЕ ПУБЛИКАЦИИ. До 24.08 стенды
 * моста существовали только в обезличенной английской версии пакета и во
 * временном каталоге отчётов. Шаг приёмки 5.7 процедуры обновления звал их по
 * пути, которого на машине нет, и получал код 1 — то есть СЛЕПОТУ, неотличимую
 * от отказа. Приёмка обязана лежать рядом с предметом, который проверяет.
 *
 * 🔴 ЭТОТ СТЕНД НЕЛЬЗЯ ЗАМЕНИТЬ СТЕНДОМ ИЗ ПАКЕТА. Сигнатуры счётных функций
 * с 28.08.2026 совпали (список видов «слова живого человека» перенесён из
 * опубликованного dsh-tool-bridge и стал настройкой здесь тоже), но эталонные
 * строки по-прежнему разные: там английские, здесь русские — решение владельца
 * 28.08.2026 «всё по-русски везде». Обезличенная версия эталоном для живого
 * быть не может по построению.
 *
 * Текст функций берётся ИЗ ФАЙЛА МОСТА, а не переписывается: проверяется код,
 * который исполняется, а не его пересказ.
 *
 * Коды возврата: 0 — сошлось, 1 — расхождение, 2 — слепота (проверить не вышло).
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

// Пути можно подменить окружением — это нужно, чтобы гонять стенд на КОПИИ
// (проверка зрячести портит копию, а не предмет) и на распакованном тарболе.
// Путь выводится от расположения стенда: он едет вместе с предметом.
const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')
// 🔴 ПРОГОН ОБЪЯВЛЯЕТ СВОЙ ПРЕДМЕТ. Несуществующая переменная или флаг молча
// игнорируются, и прогон идёт на умолчаниях — я трижды за неделю считала подставным
// прогон, шедший на боевом файле (MOST_KORNI вместо MOST_SRC; --karta, которого нет).
// Ни ошибки, ни признака: проверять надо не «команда отработала», а «на ТЕХ ли данных».
console.log(`предмет: ${SRC}`
  + (existsSync(SRC) ? ` (sha256-16 ${createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 16)})` : ' — ФАЙЛА НЕТ'))

const ZHURNAL = process.env.MOST_ZHURNAL
  // Журнал сессии лежит в доме агента, но имя сессии у каждого своё и заранее
  // неизвестно. Поэтому умолчание — САМЫЙ СВЕЖИЙ найденный журнал, а не выдуманный
  // путь: выдуманный отказал бы у всякого, кроме автора.
  || svezhijZhurnal(path.join(os.homedir(), '.dsh', 'sessions'))

/** Самый свежий журнал сессии в дереве, либо пустая строка, если их нет. */
function svezhijZhurnal(koren) {
  const najdeno = []
  const obojti = (d) => {
    let spisok
    // 🔴 Глушим ТОЛЬКО отказ доступа к каталогу — то, ради чего глушитель и ставится.
    // Первая редакция ловила всё подряд и проглотила «переменной нет», выдав наружу
    // «журнала не найдено»: причина была в пробе, а выглядела как отсутствие данных.
    try { spisok = readdirSync(d, { withFileTypes: true }) }
    catch (e) { if (e?.code === 'EACCES' || e?.code === 'ENOENT') return; throw e }
    for (const e of spisok) {
      const put = path.join(d, e.name)
      if (e.isDirectory()) obojti(put)
      else if (e.name === 'session.jsonl.zstd') najdeno.push(put)
    }
  }
  obojti(koren)
  if (najdeno.length === 0) return ''
  return najdeno.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

let ok = 0, bad = 0, slepota = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { ok++; console.log(`  ok   ${name}`) }
  else { bad++; console.log(`  FAIL ${name}\n       ждали ${w}\n       вышло ${g}`) }
}
const slepo = (name, why) => { slepota++; console.log(`  СЛЕПОТА ${name}: ${why}`) }

if (!existsSync(SRC)) { console.log(`  СЛЕПОТА нет файла моста ${SRC}`); process.exit(2) }
const text = readFileSync(SRC, 'utf8')
const lines = text.split('\n')

// 🔴 Режем ПО ИМЕНИ, а не по номерам строк: номер сдвигается от любой правки
// выше по файлу, и стенд начинает молча проверять не то. Имя переживает
// перенос функции.
const cut = (name, kind = 'function') => {
  const head = kind === 'const' ? `const ${name} = ` : `function ${name}(`
  const i = lines.findIndex((l) => l.startsWith(head))
  if (i < 0) throw new Error(`в файле моста нет ${kind} ${name} — стенд смотрит не в тот файл`)
  if (kind === 'const') return lines[i]
  const j = lines.findIndex((l, k) => k > i && l === '}')
  if (j < 0) throw new Error(`не нашла конец ${name}`)
  return lines.slice(i, j + 1).join('\n')
}

let mod
try {
  const blob = [
    cut('HEARTBEAT_HUMAN_KINDS_DEFAULT', 'const'),
    cut('HEARTBEAT_OKNO_CHASA_MS', 'const'),
    cut('turnLedger'), cut('dayKeyFactory'), cut('heartbeatCounters'),
    // Страж теперь зовёт вычислитель интервала и счёт окна — их приходится брать
    // вместе с ним. Не перечень «на всякий случай»: канарейка ниже назвала эти
    // имена сама, когда правка режимов их добавила.
    cut('udarovVOkne'), cut('vychislitInterval'), cut('heartbeatGuard'),
    // log — печать моста. В стенде она не нужна, но вырезанный код её зовёт,
    // поэтому подставляем заглушку: иначе сборка упала бы на живом предмете.
    'const log = () => {}',
    'export { HEARTBEAT_HUMAN_KINDS_DEFAULT, turnLedger, heartbeatCounters, heartbeatGuard }',
  ].join('\n')
  // 🔴 КАНАРЕЙКА ВНЕШНИХ ЗАВИСИМОСТЕЙ. Перечень вырезаемого — список внутри
  // потребителя: добавят вырезанной функции вызов НОВОЙ соседки — сборка пройдёт
  // (имя разрешается только при вызове), а стенд даст ШЕСТЬ FAIL про стража.
  // Замерено 28.08 порчей: отказ указывает не на вырезание, а на предмет, то есть
  // не туда. Здесь мы не перечисляем зависимости, а сверяем: всякое имя, которое
  // вырезанный код ЗОВЁТ, обязано быть в вырезанном либо встроенным.
  // Граница: проба смотрит вызовы вида «имя(», не через точку. Обращение к внешней
  // переменной без вызова она не увидит — это нижняя оценка, а не доказательство.
  {
    const VSTROENNOE = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
      'function', 'new', 'await', 'Set', 'Map', 'Date', 'JSON', 'Object', 'Array', 'Number',
      'String', 'Math', 'isNaN', 'parseInt', 'parseFloat', 'Boolean', 'Error', 'RegExp',
      'Intl', 'Promise', 'BigInt', 'Symbol', 'do', 'else', 'in', 'of', 'void', 'delete'])
    // Определения ЛЮБОГО уровня, не только верхнего: dayKey заводится внутри
    // heartbeatCounters как «const dayKey = dayKeyFactory(zone)», и якорь ^ его
    // не видел — проба давала ложную слепоту на исправном мосте.
    const svoi = new Set([...blob.matchAll(/(?:function|const|let|var)\s+(\w+)/g)].map((m) => m[1]))
    const zovyot = [...new Set([...blob.matchAll(/(^|[^\w.$])(\w+)\s*\(/g)].map((m) => m[2]))]
    const chuzhie = zovyot.filter((n) => !svoi.has(n) && !VSTROENNOE.has(n) && !/^\d/.test(n))
    if (chuzhie.length) {
      console.log(`  СЛЕПОТА вырезанное зовёт имена, которых в вырезанном нет: ${chuzhie.join(', ')}`
        + ' — перечень cut() отстал от моста, стенд проверял бы не то')
      process.exit(2)
    }
  }
  mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(blob))
} catch (e) {
  console.log(`  СЛЕПОТА не удалось взять функции из моста: ${e?.message ?? e}`)
  process.exit(2)
}
const { HEARTBEAT_HUMAN_KINDS_DEFAULT, turnLedger, heartbeatCounters, heartbeatGuard } = mod
// Список приходит счётным функциям АРГУМЕНТОМ, как и в бою: мост кладёт в
// limits.heartbeatHumanKinds множество из настройки либо из умолчания.
const KINDS = new Set(HEARTBEAT_HUMAN_KINDS_DEFAULT)

const D = (h, m, s = 0) => Date.UTC(2026, 7, 22, h, m, s)
const ev = (type, data, time) => ({ type, data, time })
const dispatch = (time) => ev('schedule/change', { operation: 'dispatch' }, time)
const start = (turn, time) => ev('turn/start', { turn }, time)
const end = (turn, time) => ev('turn/end', { turn }, time)
const msg = (kind, time) => ev('user/message', { source: { kind } }, time)
const ZONE = 'Europe/Moscow'

console.log('\n=== А. Признак автономного хода ===')
{
  // 🔴 Различает ОДНО: есть ли dispatch между прошлым turn/end и этим
  // turn/start. Наивная проверка «письмо от человека» не сработала бы: и
  // пробуждение, и письмо приходят одинаково, через inbox с ролью user.
  const e = [
    start(1, D(9, 0)), msg('user', D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 30)), start(2, D(9, 30)), end(2, D(9, 31)),
    start(3, D(10, 0)), msg('a2a', D(10, 0)), end(3, D(10, 1)),
    start(4, D(10, 30)), msg('goal', D(10, 30)), end(4, D(10, 31)),
  ]
  const l = turnLedger(e, KINDS)
  t('умолчание видов слова живого — user и a2a', [...KINDS].sort(), ['a2a', 'user'])
  t('ход 1 человеческий', [l[0].autonomous, l[0].human], [false, true])
  t('ход 2 автономный', [l[1].autonomous, l[1].human], [true, false])
  t('ход 3: служебный канал — тоже слово живого', [l[2].autonomous, l[2].human], [false, true])
  t('ход 4: раунд цели — не человек и не наше пробуждение', [l[3].autonomous, l[3].human], [false, false])
}

console.log('\n=== Б. Полоса и суточный счёт ===')
{
  const e = []
  for (let i = 1; i <= 6; i++) e.push(dispatch(D(9, i)), start(i, D(9, i)), end(i, D(9, i, 30)))
  t('шесть автономных подряд', heartbeatCounters(e, ZONE, D(10, 0), KINDS).streak, 6)
  t('шесть пробуждений за сутки', heartbeatCounters(e, ZONE, D(10, 0), KINDS).perDay, 6)

  // Слово человека ПОСРЕДИ полосы обнуляет её, но пробуждения за сутки считает.
  const e2 = [...e.slice(0, 9), start(4, D(9, 40)), msg('user', D(9, 40)), end(4, D(9, 41)),
    dispatch(D(9, 50)), start(5, D(9, 50)), end(5, D(9, 51))]
  // Название честное: этот случай рвёт полосу тем, что ход НЕ автономный, а не
  // тем, что в нём говорил человек, — проверено порчей (снятие проверки human
  // его не красит). Различитель для human — следующая строка.
  t('неавтономный ход рвёт полосу: 1, а не 4', heartbeatCounters(e2, ZONE, D(10, 0), KINDS).streak, 1)
  t('пробуждения за сутки считаются все', heartbeatCounters(e2, ZONE, D(10, 0), KINDS).perDay, 4)

  // dispatch и слово человека в ОДНОМ ходе: побеждает человек — рядом живой.
  const e3 = [dispatch(D(9, 0)), start(1, D(9, 0)), msg('user', D(9, 0)), end(1, D(9, 1))]
  t('человек в том же ходе рвёт полосу', heartbeatCounters(e3, ZONE, D(10, 0), KINDS).streak, 0)

  // Границы суток по названному поясу, а не по UTC.
  const e4 = [dispatch(Date.UTC(2026, 7, 22, 20, 0)), start(1, Date.UTC(2026, 7, 22, 20, 0)), end(1, Date.UTC(2026, 7, 22, 20, 1)),
    dispatch(Date.UTC(2026, 7, 22, 22, 0)), start(2, Date.UTC(2026, 7, 22, 22, 0)), end(2, Date.UTC(2026, 7, 22, 22, 1))]
  t('23:00 MSK и 01:00 MSK — разные сутки', heartbeatCounters(e4, ZONE, Date.UTC(2026, 7, 22, 22, 30), KINDS).perDay, 1)
  t('пустой журнал — нули, а не отказ', heartbeatCounters([], ZONE, D(10, 0), KINDS), { streak: 0, perDay: 0, turns: 0 })
}

console.log('\n=== Б2. Список видов действует, а не украшает ===')
{
  // 🔴 Ради чего перенос: у сборки с ДРУГИМ служебным каналом полоса не рвалась
  // бы молча. Один и тот же журнал при разных списках обязан давать разную
  // полосу — иначе настройка ничего не решает.
  const e = [
    dispatch(D(9, 0)), start(1, D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 10)), start(2, D(9, 10)), msg('a2a', D(9, 10)), end(2, D(9, 11)),
    dispatch(D(9, 20)), start(3, D(9, 20)), end(3, D(9, 21)),
  ]
  t('со списком [user, a2a] — слово живого рвёт полосу', heartbeatCounters(e, ZONE, D(10, 0), new Set(['user', 'a2a'])).streak, 1)
  t('со списком [user] — тот же журнал даёт полосу 3', heartbeatCounters(e, ZONE, D(10, 0), new Set(['user'])).streak, 3)
  t('пустой список — человека не видно вовсе', heartbeatCounters(e, ZONE, D(10, 0), new Set()).streak, 3)
}

console.log('\n=== Б3. Пустой каталог письма — настроенный исход ===')
{
  // 🔴 Проверка ТЕКСТА, а не поведения, и это названо честно: heartbeatStop
  // пишет на диск через импорты модуля, вырезать её в отдельный модуль нельзя.
  // Проверяется, что ветка есть и стоит ДО try — иначе пустой каталог пошёл бы
  // в mkdirSync(''), получил отказ и напечатал 🔴 «письмо НЕ ЗАПИСАНО», то есть
  // тревогу о беде там, где был выбор.
  const iVetka = text.indexOf("if (limits.heartbeatNoticeDir === '')")
  const iTry = text.indexOf('mkdirSync(limits.heartbeatNoticeDir')
  t('ветка пустого каталога есть', iVetka > 0, true)
  t('ветка стоит ДО записи на диск', iVetka > 0 && iTry > 0 && iVetka < iTry, true)
  t('строка подъёма различает журнал и каталог',
    text.includes("limits.heartbeatNoticeDir === '' ? 'только в журнал: каталог не задан'"), true)
  t('строка подъёма печатает список видов с пометкой источника',
    // 🔴 С 31.08.2026 источник печатается функцией srcP по НОВОМУ имени ключа
    // (humanKinds в /etc/agent-limits), а не src по старому имени поля слоя.
    text.includes("виды источника [${[...limits.heartbeatHumanKinds].join(', ')}] (${srcP('humanKinds')})"), true)
}

console.log('\n=== В. Страж интервала ===')
{
  const limits = { heartbeatMinIntervalSeconds: 1800 }
  // 🔴 Приставка — именованная константа, и сравнение режется по ЕЁ длине.
  // Первая редакция резала по числу 47 — длине тогдашней фразы; любая правка
  // формулировки делала бы исправного стража красным.
  const PREFIX = 'повторяющееся напоминание не чаще раза в 1800 с'
  const otkaz = (a) => { try { heartbeatGuard(a, limits); return null } catch (e) { return String(e.message).slice(0, PREFIX.length) } }
  t('одноразовое after_seconds не трогаем', otkaz({ after_seconds: 60 }), null)
  t('одноразовое at не трогаем', otkaz({ at: '2026-08-24T10:00:00Z' }), null)
  t('ровно предел проходит', otkaz({ every_seconds: 1800 }), null)
  t('больше предела проходит', otkaz({ every_seconds: 3600 }), null)
  t('меньше предела — отказ', otkaz({ every_seconds: 300 }), PREFIX)
  t('не число — отказ', otkaz({ every_seconds: '1800' }), PREFIX)
}

console.log('\n=== В2. Часовой потолок: подставной прогон и контроль зрячести ===')
{
  // Режим ровного тика с шагом 10 с выбран нарочно: лесенка тогда не поднимает
  // интервал, и всякое отодвигание сверх 10 с приходит ТОЛЬКО от потолка. С
  // лесенкой пришлось бы отделять один эффект от другого, а это уже толкование.
  const bazovye = {
    heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: 10,
    heartbeatMinIntervalSeconds: 10, heartbeatMaxConsecutive: 100, heartbeatMaxPerDay: 100,
    heartbeatDayZone: 'Europe/Moscow', heartbeatHumanKinds: KINDS,
  }
  const progon = (potolok) => {
    const events = []
    const agents = { get: () => ({ session: { events } }) }
    const limits = { ...bazovye, heartbeatMaxVChas: potolok }
    const itogi = []
    for (let i = 0; i < 5; i += 1) {
      const args = { after_seconds: 10 }
      heartbeatGuard(args, limits, agents, 'proba')
      itogi.push(args.after_seconds)
      // Пробуждение состоялось: кладём dispatch, как это делает платформа.
      events.push({ type: 'schedule/change', data: { operation: 'dispatch' }, time: Date.now() })
    }
    return itogi
  }
  const s4 = progon(4)
  t('потолок 4: первые четыре по 10 с', s4.slice(0, 4).join(','), '10,10,10,10')
  t('потолок 4: ПЯТОЕ отодвинуто', s4[4] > 10, true, `пятое = ${s4[4]} с`)
  t('потолок 4: отодвинуто почти на час', s4[4] > 3500 && s4[4] <= 3600, true, `${s4[4]} с`)

  // 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ. Без него «пятое отодвинуто» доказывает лишь, что
  // функция что-то делает, но не что делает это ИМЕННО потолок: тот же прогон
  // при выключенном потолке обязан пройти целиком.
  const s0 = progon(0)
  t('контроль: при потолке 0 проходят все пять', s0.join(','), '10,10,10,10,10')
}

console.log('\n=== Г. Предел на ЖИВОМ журнале сессии ===')
// Здесь проверяется не логика, а факт: не нарушен ли предел на настоящей
// истории. Отказ чтения — слепота, а не расхождение: журнала может не быть
// на чужой машине или в первые секунды после заведения сессии.
{
  let events
  try {
    if (!ZHURNAL) throw new Error('журнал сессии не найден: в доме нет ни одного session.jsonl.zstd')
    if (!existsSync(ZHURNAL)) throw new Error(`нет файла ${ZHURNAL}`)
    const raw = execFileSync('zstdcat', [ZHURNAL], { maxBuffer: 512 * 1024 * 1024 }).toString()
    events = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch (e) {
    // 🔴 СЛЕПОТ РОВНО СТОЛЬКО, СКОЛЬКО ПРОВЕРОК НЕ СОСТОЯЛОСЬ. Блок ниже даёт ДВЕ,
    // и засчитать одну значит оставить читателя с «26 из 27» без имени двадцать
    // седьмой: он видит недостачу и не знает чего — а дальше не верит и остальным.
    const pochemu = String(e?.message ?? e).slice(0, 160)
    slepo('живой журнал: полоса подряд', pochemu
      + ' — этой проверке нужен журнал сессии платформы; у только что поставленного'
      + ' модуля его ещё нет. Поработайте с агентом и повторите, либо укажите путь'
      + ' переменной MOST_ZHURNAL.')
    slepo('живой журнал: счёт за сутки', 'та же причина: журнала сессии нет')
  }

  if (events) {
    const c = heartbeatCounters(events, ZONE, Date.now(), KINDS)
    console.log(`       сырьё: событий ${events.length}, ходов ${c.turns}, полоса ${c.streak}, за сутки ${c.perDay}`)
    if (c.streak <= 6) { ok++; console.log(`  ok   полоса ${c.streak} не превышает предел 6`) }
    else { bad++; console.log(`  FAIL полоса ${c.streak} БОЛЬШЕ предела 6 — гашение не сработало`) }
    if (c.perDay <= 48) { ok++; console.log(`  ok   за сутки ${c.perDay} не превышает предел 48`) }
    else { bad++; console.log(`  FAIL за сутки ${c.perDay} БОЛЬШЕ предела 48 — гашение не сработало`) }
  }
}


console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}, слепота ${slepota}`)

// 🔴 КАНАРЕЙКА ТОЧНОГО ЧИСЛА. Замерено 28.08.2026: вырезанный раздел проходил
// кодом 0 — выпотрошенный стенд отчитывался успехом. Канарейки в dorabotki я
// заводила 25.08, но по КАТАЛОГУ, а не по классу, и стенды моста в тот проход
// не попали. Число точное, а не «не меньше»: порог слеп к убыли ровно того
// размера, который умещается в запас.
// Меняли стенд намеренно? Поправьте число и скажите, почему.
const ZHDYOM = 31
if (ok + bad + slepota !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad + slepota}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : (slepota ? 2 : 0))
