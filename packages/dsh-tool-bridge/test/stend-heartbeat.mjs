// RU: Проверка stend-heartbeat: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-heartbeat verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')

console.log(`предмет: ${SRC}`
  + (existsSync(SRC) ? ` (sha256-16 ${createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 16)})` : ' — ФАЙЛА НЕТ'))

const PREDEL_SVEZHESTI_CH = 24
const ZHURNAL = process.env.MOST_ZHURNAL

  || svezhijZhurnal(path.join(os.homedir(), '.dsh', 'sessions'))

function svezhijZhurnal(koren) {
  const najdeno = []
  const obojti = (d) => {
    let spisok

    try { spisok = readdirSync(d, { withFileTypes: true }) }
    catch (e) { if (e?.code === 'EACCES' || e?.code === 'ENOENT') return; throw e }
    for (const e of spisok) {
      const put = path.join(d, e.name)
      if (e.isDirectory()) obojti(put)
      // RU: B-N-1919: платформа 0.2.0-rc.2 пишет session.v4.jsonl.zstd; прежнее имя осталось только у старых сессий — по нему
      //   стенд брал журнал, который больше не пишется (замер 09.10: девятидневной давности). Берём оба имени, свежайший по mtime.
      else if (e.name === 'session.jsonl.zstd' || e.name === 'session.v4.jsonl.zstd') najdeno.push(put)
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
// RU: B-N-1984 (Заря, находка Искры): «не применимо» — проверка не судит, потому что предмета нет по устройству, а не по поломке.
//   Не красит ворота и не прячется: печатается с причиной и входит в счёт проверок.
let neprim = 0
// B-N-2062 шаг 2 (Заря; решение Забавы 03:16Z, вариант А): рядом — машинная метка «STEND-NEPRIMENIMO: <проба>: <причина>» с начала
//   строки; обход (dsh-obhod-stendov ≥ 3.1.65) несёт её в ворота, ворота (dsh-montazh ≥ 3.1.27) ставят СЛЕПОТУ, если проба не измерена
//   ни на одной копии. В имени пробы «: » заменено на « — »: двоеточие с пробелом в договоре метки отделяет пробу от причины.
const neprimenimo = (name, why) => {
  neprim++; console.log(`  НЕ ПРИМЕНИМО ${name}: ${why}`)
  console.log(`STEND-NEPRIMENIMO: ${name.replaceAll(': ', ' — ')}: ${why}`)
}

if (!existsSync(SRC)) { console.log(`  СЛЕПОТА нет файла моста ${SRC}`); process.exit(2) }
const text = readFileSync(SRC, 'utf8')
const lines = text.split('\n')

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

    cut('dostavkaNovoj'), cut('sobytiyaSessii'),

    cut('udarovVOkne'), cut('vychislitInterval'), cut('heartbeatGuard'),
    // Аудит №6 (1.3.44): пересчёт at; на основе функции нет — тогда не вырезается, пробы at краснеют по существу.
    ...(lines.some((l) => l.startsWith('function momentAt(')) ? [cut('momentAt'), 'export { momentAt }'] : []),

    'const log = () => {}',

    'const HEARTBEAT_OTKAZ_SEKUND = 86400',

    cut('TREVOGA_POVTOR_MS', 'const'),
    cut('otkazIstochnika', 'const'),
    cut('otmetitVozvratIstochnika'), cut('trevogaOtkazIstochnika'),

    'globalThis.__trevogi = []',
    'const existsSync = () => true',
    // Аудит №7 (1.3.44): тревога асинхронная (execFile с callback); подмена отвечает сразу — стенд судит логику выдержки, неблокировку — stend-trevoga-ne-blokiruet.
    'const execFile = (put, argv, opt, cb) => { globalThis.__trevogi.push(argv[0]); cb?.(null) }',
    'export { HEARTBEAT_HUMAN_KINDS_DEFAULT, turnLedger, heartbeatCounters, heartbeatGuard, otkazIstochnika }',
  ].join('\n')

  {
    const VSTROENNOE = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
      'function', 'new', 'await', 'Set', 'Map', 'Date', 'JSON', 'Object', 'Array', 'Number',
      'String', 'Math', 'isNaN', 'parseInt', 'parseFloat', 'Boolean', 'Error', 'RegExp',
      'Intl', 'Promise', 'BigInt', 'Symbol', 'do', 'else', 'in', 'of', 'void', 'delete'])

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
const { HEARTBEAT_HUMAN_KINDS_DEFAULT, turnLedger, heartbeatCounters, heartbeatGuard, otkazIstochnika } = mod

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

  const e = [
    start(1, D(9, 0)), msg('user', D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 30)), start(2, D(9, 30)), end(2, D(9, 31)),
    start(3, D(10, 0)), msg('a2a', D(10, 0)), end(3, D(10, 1)),
    start(4, D(10, 30)), msg('goal', D(10, 30)), end(4, D(10, 31)),
  ]
  const l = turnLedger(e, KINDS)
  t('умолчание видов слова живого — user, a2a и agent-message', [...KINDS].sort(), ['a2a', 'agent-message', 'user'])
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

  const e2 = [...e.slice(0, 9), start(4, D(9, 40)), msg('user', D(9, 40)), end(4, D(9, 41)),
    dispatch(D(9, 50)), start(5, D(9, 50)), end(5, D(9, 51))]

  t('неавтономный ход рвёт полосу: 1, а не 4', heartbeatCounters(e2, ZONE, D(10, 0), KINDS).streak, 1)
  t('пробуждения за сутки считаются все', heartbeatCounters(e2, ZONE, D(10, 0), KINDS).perDay, 4)

  const e3 = [dispatch(D(9, 0)), start(1, D(9, 0)), msg('user', D(9, 0)), end(1, D(9, 1))]
  t('человек в том же ходе рвёт полосу', heartbeatCounters(e3, ZONE, D(10, 0), KINDS).streak, 0)

  const e4 = [dispatch(Date.UTC(2026, 7, 22, 20, 0)), start(1, Date.UTC(2026, 7, 22, 20, 0)), end(1, Date.UTC(2026, 7, 22, 20, 1)),
    dispatch(Date.UTC(2026, 7, 22, 22, 0)), start(2, Date.UTC(2026, 7, 22, 22, 0)), end(2, Date.UTC(2026, 7, 22, 22, 1))]
  t('23:00 MSK и 01:00 MSK — разные сутки', heartbeatCounters(e4, ZONE, Date.UTC(2026, 7, 22, 22, 30), KINDS).perDay, 1)
  t('пустой журнал — нули, а не отказ', heartbeatCounters([], ZONE, D(10, 0), KINDS), { streak: 0, perDay: 0, turns: 0 })
}

console.log('\n=== Б2. Список видов действует, а не украшает ===')
{

  const e = [
    dispatch(D(9, 0)), start(1, D(9, 0)), end(1, D(9, 1)),
    dispatch(D(9, 10)), start(2, D(9, 10)), msg('a2a', D(9, 10)), end(2, D(9, 11)),
    dispatch(D(9, 20)), start(3, D(9, 20)), end(3, D(9, 21)),
  ]
  t('со списком [user, a2a] — слово живого рвёт полосу', heartbeatCounters(e, ZONE, D(10, 0), new Set(['user', 'a2a'])).streak, 1)
  t('со списком [user] — тот же журнал даёт полосу 3', heartbeatCounters(e, ZONE, D(10, 0), new Set(['user'])).streak, 3)
  t('пустой список — человека не видно вовсе', heartbeatCounters(e, ZONE, D(10, 0), new Set()).streak, 3)

  const eAM = e.map((x) => x.type === 'user/message' ? { ...x, data: { ...x.data, source: { kind: 'agent-message', form: 'relay', senderSessionId: 'a2a:fixture-coordinator' } } } : x)
  t('умолчание: письмо agent-message рвёт полосу (как a2a)', heartbeatCounters(eAM, ZONE, D(10, 0), KINDS).streak, 1)
}

console.log('\n=== Б3. Пустой каталог письма — настроенный исход ===')
{

  const iVetka = text.indexOf("if (limits.heartbeatNoticeDir === '')")
  const iTry = text.indexOf('mkdirSync(limits.heartbeatNoticeDir')
  t('ветка пустого каталога есть', iVetka > 0, true)
  t('ветка стоит ДО записи на диск', iVetka > 0 && iTry > 0 && iVetka < iTry, true)
  t('строка подъёма различает журнал и каталог',
    text.includes("limits.heartbeatNoticeDir === '' ? 'только в журнал: каталог не задан'"), true)
  t('строка подъёма печатает список видов с пометкой источника',

    text.includes("виды источника [${[...limits.heartbeatHumanKinds].join(', ')}] (${srcP('humanKinds')})"), true)
}

console.log('\n=== В. Страж интервала ===')
{
  const limits = { heartbeatMinIntervalSeconds: 1800 }

  const PREFIX = 'повторяющееся напоминание не чаще раза в 1800 с'
  const otkaz = (a) => { try { heartbeatGuard(a, limits); return null } catch (e) { return String(e.message).slice(0, PREFIX.length) } }
  t('одноразовое after_seconds не трогаем', otkaz({ after_seconds: 60 }), null)
  t('одноразовое at не трогаем', otkaz({ at: '2026-08-24T10:00:00Z' }), null)
  t('ровно предел проходит', otkaz({ every_seconds: 1800 }), null)
  t('больше предела проходит', otkaz({ every_seconds: 3600 }), null)
  t('меньше предела — отказ', otkaz({ every_seconds: 300 }), PREFIX)
  t('не число — отказ', otkaz({ every_seconds: '1800' }), PREFIX)

  const PREFIX_CRON = 'cron через мост не принимается'
  const otkazCron = (a) => { try { heartbeatGuard(a, limits); return null } catch (e) { return String(e.message).slice(0, PREFIX_CRON.length) } }
  t('cron — отказ', otkazCron({ cron: { expression: '* * * * *', time_zone: 'UTC' } }), PREFIX_CRON)
  t('daily проходит', otkazCron({ daily: { time: '09:00', time_zone: 'Europe/Moscow' } }), null)
  t('weekly проходит', otkazCron({ weekly: { time: '09:00', time_zone: 'Europe/Moscow', days: ['monday'] } }), null)

  t('update every_seconds 300 — отказ', otkaz({ id: 'x', every_seconds: 300 }), PREFIX)
  t('update cron — отказ', otkazCron({ id: 'x', cron: { expression: '* * * * *', time_zone: 'UTC' } }), PREFIX_CRON)
  t('update prompt проходит', otkazCron({ id: 'x', prompt: 'новое' }), null)

  for (const imya of ['schedule_create', 'schedule_update'])
    t(`${imya}: в таблице исполнения под стражем heartbeatGuard`, new RegExp(`^\\s*${imya}: \\{[^}\\n]*guard: heartbeatGuard[^}\\n]*\\},?\\s*$`, 'm').test(text), true)
}

console.log('\n=== В2. Часовой потолок: подставной прогон и контроль зрячести ===')
{

  const bazovye = {
    heartbeatRezhim: 'ravnomerno', heartbeatRavnomernoSeconds: 10,
    heartbeatMinIntervalSeconds: 10, heartbeatMaxConsecutive: 100, heartbeatMaxPerDay: 100,
    heartbeatDayZone: 'Europe/Moscow', heartbeatHumanKinds: KINDS,
  }

  {
    const limits = { ...bazovye, heartbeatMaxVChas: 0 }
    globalThis.__trevogi = []
    const bezZhurnala = { get: () => ({ session: { events: undefined } }) }
    const a1 = { after_seconds: 600 }
    heartbeatGuard(a1, limits, bezZhurnala, 'proba')
    t('журнала нет: НЕ будит, интервал отодвинут на сутки', a1.after_seconds, 86400)
    t('журнала нет: тревога позвана', globalThis.__trevogi.length, 1)

    t('журнала нет: тревога назвала запрошенное и поставленное',
      [String(globalThis.__trevogi[0] ?? '').includes('600'),
        String(globalThis.__trevogi[0] ?? '').includes('86400')], [true, true])

    const a1b = { after_seconds: 600 }
    heartbeatGuard(a1b, limits, bezZhurnala, 'proba')
    t('второй отказ подряд: повтор ПОДАВЛЕН выдержкой', globalThis.__trevogi.length, 1)
    t('подавленные СЧИТАЮТСЯ', otkazIstochnika.get('proba')?.podavleno, 1)

    const sost = otkazIstochnika.get('proba')
    sost.skazano -= 86400001
    const a1c = { after_seconds: 600 }
    heartbeatGuard(a1c, limits, bezZhurnala, 'proba')
    t('отказ дольше суток: повтор УШЁЛ', globalThis.__trevogi.length, 2)

    globalThis.__trevogi = []
    const sZhurnalom = { get: () => ({ session: { events: [] } }) }
    const a2 = { after_seconds: 600 }
    heartbeatGuard(a2, limits, sZhurnalom, 'proba')
    t('журнал есть: работает как прежде, не отказ', a2.after_seconds === 86400, false)
    t('журнал есть: тревоги НЕ было', globalThis.__trevogi.length, 0)

    t('источник вернулся: состояние отказа снято', otkazIstochnika.has('proba'), false)
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

      events.push({ type: 'schedule/change', data: { operation: 'dispatch' }, time: Date.now() })
    }
    return itogi
  }
  const s4 = progon(4)
  t('потолок 4: первые четыре по 10 с', s4.slice(0, 4).join(','), '10,10,10,10')
  t('потолок 4: ПЯТОЕ отодвинуто', s4[4] > 10, true, `пятое = ${s4[4]} с`)
  t('потолок 4: отодвинуто почти на час', s4[4] > 3500 && s4[4] <= 3600, true, `${s4[4]} с`)

  const s0 = progon(0)
  t('контроль: при потолке 0 проходят все пять', s0.join(','), '10,10,10,10,10')

  // RU: Аудит №6: одноразовое at — та же лесенка и часовой потолок; не поднятый срок остаётся at, поднятый — after_seconds.
  // EN: Audit #6: a one-shot at gets the same ladder and hourly ceiling; an unraised deadline stays at, a raised one becomes after_seconds.
  const progonAt = (potolok) => {
    const events = []
    const agents = { get: () => ({ session: { events } }) }
    const limits = { ...bazovye, heartbeatMaxVChas: potolok }
    const itogi = []
    for (let i = 0; i < 5; i += 1) {
      const args = { at: new Date(Date.now() + 10_000).toISOString() }
      try { heartbeatGuard(args, limits, agents, 'proba') } catch (e) { args.otkaz = String(e.message).slice(0, 60) }
      itogi.push(args)
      events.push({ type: 'schedule/change', data: { operation: 'dispatch' }, time: Date.now() })
    }
    return itogi
  }
  const a4 = progonAt(4)
  t('at, потолок 4: первые четыре остались at (срок не поднят)', a4.slice(0, 4).every((a) => typeof a.at === 'string' && a.after_seconds === undefined), true, JSON.stringify(a4[0]))
  t('at, потолок 4: ПЯТОЕ отодвинуто — at заменён на after_seconds почти на час', a4[4].at === undefined && a4[4].after_seconds > 3500 && a4[4].after_seconds <= 3600, true, JSON.stringify(a4[4]))
  {
    let otkaz = null
    try { heartbeatGuard({ at: 'завтра утром' }, { ...bazovye, heartbeatMaxVChas: 4 }, { get: () => ({ session: { events: [] } }) }, 'proba') } catch (e) { otkaz = e.message }
    t('at неразборчивый — отказ, а не пропуск мимо сторожа', otkaz !== null && /at не разобран/.test(otkaz), true, String(otkaz))
  }
  t('пересчёт местного at: 03:00 Europe/Moscow 10.10 = 00:00Z', typeof mod.momentAt === 'function' && mod.momentAt({ date: '2026-10-10', time: '03:00', time_zone: 'Europe/Moscow' }) === Date.UTC(2026, 9, 10), true)
}

console.log('\n=== Г. Предел на ЖИВОМ журнале сессии ===')

{
  let events, prostojCh = null, prostojSobytij = 0
  try {
    if (!ZHURNAL) throw new Error('журнал сессии не найден: в доме нет ни одного session.jsonl.zstd / session.v4.jsonl.zstd')
    if (!existsSync(ZHURNAL)) throw new Error(`нет файла ${ZHURNAL}`)
    // RU: B-N-1919: журнал, не писавшийся дольше суток, не содержит событий текущего дня — «за сутки 0» и «полоса 0» по нему
    //   были бы не замером, а молчанием мёртвого файла. Порог — сутки (= окно счёта «за сутки»). Простой агента дольше суток —
    //   «не применимо» с причиной (B-N-1984, ниже), не слепота.
    const VOZRAST_CH = (Date.now() - statSync(ZHURNAL).mtimeMs) / 3600000
    // RU: B-N-1984: журнал читается и разбирается ДО суда о возрасте. Старый, но целый журнал текущего формата — ПРОСТОЙ сессии
    //   (10.10: varvara 32.4 ч, marc 24.3 ч — почта молчала): мерить нечего, это «не применимо», а не слепота. Не читается,
    //   не разбирается, нет файла или только прежнее имя журнала — ПОЛОМКА: слепота, как прежде.
    const raw = execFileSync('zstdcat', [ZHURNAL], { maxBuffer: 512 * 1024 * 1024 }).toString()
    const razobrano = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
    if (VOZRAST_CH > PREDEL_SVEZHESTI_CH) {
      if (path.basename(ZHURNAL) !== 'session.v4.jsonl.zstd') throw new Error(`журнал ${ZHURNAL} не писался ${VOZRAST_CH.toFixed(1)} ч (> ${PREDEL_SVEZHESTI_CH} ч), и имя у него прежнее — свежий журнал текущего формата не найден`)
      prostojCh = VOZRAST_CH; prostojSobytij = razobrano.length
    } else {
      console.log(`       журнал: ${ZHURNAL} (писался ${VOZRAST_CH.toFixed(1)} ч назад)`)
      events = razobrano
    }
  } catch (e) {

    const pochemu = String(e?.message ?? e).slice(0, 160)
    slepo('живой журнал: полоса подряд', pochemu
      + ' — этой проверке нужен журнал сессии платформы; у только что поставленного'
      + ' модуля его ещё нет. Поработайте с агентом и повторите, либо укажите путь'
      + ' переменной MOST_ZHURNAL.')
    slepo('живой журнал: счёт за сутки', 'та же причина: журнала сессии нет')
  }

  if (prostojCh !== null) {
    const pochemu = `простой сессии: журнал ${ZHURNAL} целый (событий ${prostojSobytij}), но не писался ${prostojCh.toFixed(1)} ч (> ${PREDEL_SVEZHESTI_CH} ч) — за сутки мерить нечего`
    neprimenimo('живой журнал: полоса подряд', pochemu)
    neprimenimo('живой журнал: счёт за сутки', 'та же причина: простой сессии')
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

console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}, слепота ${slepota}, не применимо ${neprim}`)

const ZHDYOM = 53 // аудит №6 (1.3.44): +4 пробы at
if (ok + bad + slepota + neprim !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + bad + slepota + neprim}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}
process.exit(bad ? 1 : (slepota ? 2 : 0))
