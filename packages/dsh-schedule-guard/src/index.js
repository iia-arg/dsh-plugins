// schedule-guard — предел автономных пробуждений поверх dsh-schedule.
// Путь 1 (решение координатора 22.08.2026): при пределе гасим ПОВТОРЯЮЩИЕСЯ будильники
// (удаляем записи every из журнала сессии; на DSH 0.2 — задачи службы ctx.schedule.delete, B-N-1194)
// и пишем владельцу. Одноразовые не
// удаляем — они сами гаснут; их вклад учтён счётчиком пробуждений (не типом правила).
//
// Счётчик сворачивается ИЗ ЖУРНАЛА СЕССИИ (schedule/change dispatch = пробуждение,
// user/message с source.kind из resetKinds = внешнее слово (человек или координатор) и обнуление). Отдельного файла
// нет, поэтому перезапуск структурно не может обнулить счётчик: он переживает его
// ровно с той же надёжностью, что и сами напоминания (если сессия поднялась с диска).
//
// 🔴 РЕЕНТРАНТНОСТЬ (находка соседки, 22.08.2026): платформа публикует событие
// СИНХРОННО и на время публикации держит замок — «session append cannot reenter
// while another append is being published». Гашение отложено через
// ctx.agents.withoutInitiator (тот же приём, что у самого dsh-schedule в requestDrive).
// ⚠️ РАЗНИЦА ОСНОВАНИЙ — НЕ сливать со случаем соседки: у НЕЁ замок ПРОЯВЛЯЛСЯ и
// доказан стендом (гашение висело на событии СЕССИИ, где замок держится). У МЕНЯ
// гашение на agent/status idle — это НЕ событие сессии, замок его не держит: прежняя
// синхронная версия сняла schedule-3 боевым замером без отказа. Поэтому у меня
// отложенный вызов — ПРЕДУПРЕЖДЕНИЕ (страховка), а не ЛЕЧЕНИЕ проявившегося отказа.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @deepseek-ai/dsh-schedule — ПРЕДМЕТ сторожа: без него сторожить нечего. Импорт
// ЛЕНИВЫЙ, чтобы отсутствие пакета роняло сторожа до НЕДЕЙСТВУЮЩЕГО (одна громкая
// строка), а не валило всё дерево — плагин, чей модуль не грузится, убивает весь состав.
let foldScheduleEvents = null
try {
  const scheduleModule = await import('@deepseek-ai/dsh-schedule')
  foldScheduleEvents = scheduleModule.foldScheduleEvents
} catch {
  foldScheduleEvents = null
}
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-schedule-guard'
// 'schedule' (B-N-1194, DSH 0.2): задачи живут в таблице службы расписания, а не в журнале сессии —
// повторяющиеся читаем ctx.schedule.list, гасим ctx.schedule.delete.
export const inject = ['agents', 'sessions', 'tools', 'schedule']

// Без .default(): отсутствие поля в конфиге = undefined, и строка подъёма честно
// различает «(настройка)» от «(умолчание)». Одинаковое поведение при потерянном
// поле и при верной настройке — слепота.
export const Config = z.object({
  enabled: z.boolean(),
  limitOneShotWakeups: z.boolean(),
  maxConsecutiveWakeups: z.number(),
  maxPerDay: z.number(),
  minRepeatingIntervalSeconds: z.number(),
  maxPerHour: z.number(),
  resetKinds: z.array(z.string()),
  dayBoundaryOffsetMinutes: z.number(),
  notifyCmd: z.string(),
  notifyTimeoutSeconds: z.number(),
})

const DEFAULTS = {
  enabled: true,
  limitOneShotWakeups: false,
  maxConsecutiveWakeups: 6,
  maxPerDay: 48,
  minRepeatingIntervalSeconds: 1800,
  maxPerHour: 4,   // 48/12: суточный предел, поделённый на 12 часовых окон
  resetKinds: ['user', 'a2a'],   // виды источника, обнуляющие полосу (человек и координатор)
  dayBoundaryOffsetMinutes: 0,   // нейтрально (UTC); московский сдвиг 180 — в профиле
  // Предел канала уведомления: выше худшего случая отправителя с повтором сети
  // при его умолчаниях (3 попытки × 20 с + паузы 5 и 15 с + до 5 с записи хвоста = 85 с).
  notifyTimeoutSeconds: 90,
}

function log(tag, text) {
  process.stderr.write(`schedule-guard [${tag}]: ${text}\n`)
}

/** Точка начала календарных суток для заданного времени. */
function dayBoundaryStart(tsMs, offsetMinutes) {
  const shifted = new Date(tsMs + offsetMinutes * 60000)
  shifted.setUTCHours(0, 0, 0, 0)
  return shifted.getTime() - offsetMinutes * 60000
}

// 🔴 ЖУРНАЛ СЕССИИ НА DSH 0.2 (B-N-1194, 30.09.2026). Поля session.events в 0.2 нет — есть
// snapshotEvents(). Прежде здесь стояло `session.events ?? []`: на 0.2 часовой потолок молча считал
// по пустому списку и пропускал всё. Образец — мост 0.3.20 (sobytiyaSessii). undefined — СЛЕПОТА, не ноль.
function zhurnal(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') {
    try { const s = session.snapshotEvents(); if (Array.isArray(s)) return s } catch { /* слепота ниже */ }
  }
  return undefined
}

/** Счётчики пробуждений по журналу сессии. */
function countWakeups(events, resetKinds) {   // без умолчания: список ВСЕГДА из настройки
  if (!Array.isArray(resetKinds)) throw new Error('countWakeups: resetKinds обязателен')
  let consecutive = 0
  let maxConsecutive = 0
  const dispatchTimes = []
  for (const e of events) {
    if (e.type === 'user/message' && resetKinds.includes(e.data?.source?.kind)) {
      consecutive = 0
    } else if ((e.type === 'schedule/change' && e.data?.operation === 'dispatch')
      // DSH 0.2: пробуждение приходит сообщением с источником schedule (dsh-schedule, доставка), dispatch не пишется.
      || (e.type === 'user/message' && e.data?.source?.kind === 'schedule')) {
      consecutive += 1
      if (consecutive > maxConsecutive) maxConsecutive = consecutive
      dispatchTimes.push(e.time)
    }
  }
  return { consecutive, maxConsecutive, dispatchTimes }
}

// 🔴 СНЯТИЕ НЕОБРАТИМО (B-N-1194, условие Вениамина): служба расписания 0.2 снаружи не умеет create (только ходом
// агента) и не умеет «приостановить» — поэтому ДО delete каждая задача ЦЕЛИКОМ (id, title, prompt, расписание) пишется
// строкой JSON в файл состояния и затем — в письмо владельцу: снятое можно пересоздать. Запись не удалась — НЕ снимаем.
// Путь — на каждый вызов (стенд подменяет DSH_HOME): <DSH_HOME>/schedule-guard-snyatye.jsonl, у Петровича /opt/dsh/.dsh.
function fajlSnyatyh() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'schedule-guard-snyatye.jsonl')
}
function zapisatPeredSnyatiem(sessionId, reason, zapisi) {
  const t = new Date().toISOString()
  const text = zapisi.map((r) => JSON.stringify({ t, sessionId, reason, record: r })).join('\n') + '\n'
  const fd = fs.openSync(fajlSnyatyh(), 'a', 0o600)
  try { fs.writeSync(fd, text); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function buildStopMessage(config, reason, deleted, done, now) {
  const lines = ['🔴 schedule-guard: предел автономных пробуждений достигнут.']
  lines.push(`Причина (числом): ${reason}`)
  if (deleted.length > 0) {
    lines.push('Удалены напоминания:')
    for (const r of deleted) {
      const shag = r.kind === 'every' || r.kind === undefined ? `интервал ${r.everySeconds} с` : `вид ${r.kind}`
      lines.push(`  - id ${r.id}, ${shag}, текст: ${JSON.stringify(r.prompt)}`)
      lines.push(`    запись целиком (для пересоздания): ${JSON.stringify(r)}`)
    }
    lines.push(`Все снятые записаны до снятия в ${fajlSnyatyh()}`)
  } else {
    lines.push('Напоминания НЕ сняты: совпавших задач не было либо служба не подтвердила удаление. Это не подтверждение остановки расписания.')
  }
  lines.push(`Успел за автономный отрезок: ${done}`)
  lines.push('Возобновление: только словом человека (любое сообщение обнуляет счётчик).')
  lines.push(`Время: ${new Date(now).toISOString()}`)
  return lines.join('\n')
}

// 🔴 ЗАЩЁЛКА ТОЛЬКО НА СТРОКУ ПОДЪЁМА. cordis вызывает apply() ПОВТОРНО, когда
// пересобираются впрыснутые сервисы (agents/sessions/tools). Сам apply и хуки
// регистрируем на КАЖДОМ вызове — живым остаётся тот, что на живом ctx, подписки
// мёртвого ctx платформа гасит сама (проверено: «сессия под надзором» и боевой
// отказ приходят по одному разу). Гасим только ПОВТОРНЫЙ вывод подъёма: двойная
// строка пугает читателя журнала и тянет на ложное расследование.
let loggedStartup = false
// 🔴 АГЕНТЫ ПОД НАДЗОРОМ — НА УРОВНЕ МОДУЛЯ (04.10.2026). Обработчик простоя и heartbeat_close вешаются на
// agent.ctx и живут, пока жив агент, а apply() cordis зовёт повторно. Защита от повтора внутри одного apply
// при обходе живых корней на каждом apply повесила бы второй обработчик и второй heartbeat_close тому же
// агенту (дублем имени инструмента мы уже роняли службу). WeakSet: запись уходит вместе с агентом.
const podNadzorom = new WeakSet()
// 🔴 СЧЁТЧИК виденных вызовов (правило 8.9): без него ноль строк в журнале
// двусмысленен — «отказов не было» неотличимо от «хук не срабатывал». На уровне
// модуля, чтобы пересборка apply не обнуляла.
let seenCalls = 0
let refusedCalls = 0
// defineTool берётся мягко: если пакета нет, описание кладётся как есть и страж живёт дальше.
let defineTool = null
try { ({ defineTool } = await import('@deepseek-ai/dsh-tools')) } catch { defineTool = null }

export function apply(ctx, rawConfig) {
  if (!foldScheduleEvents) {
    log('startup', '🔴 @deepseek-ai/dsh-schedule не резолвится — сторож НЕДЕЙСТВУЮЩИЙ (сворачивать нечего)')
    return
  }
  // Собрать конфиг с пометкой источника — для строки подъёма.
  const config = {}
  const srcParts = []
  for (const [k, dflt] of Object.entries(DEFAULTS)) {
    const raw = rawConfig?.[k]
    // 🔴 ПУСТОЙ МАССИВ = «не настроено» (02.09.2026). schemastery для z.array() без
    // .default() отдаёт [], а не undefined — в отличие от z.number()/z.string(). Поэтому
    // «отсутствие» определяем по типу: undefined ИЛИ пустой массив. 🔴 Выразить «не
    // сбрасывать никогда» пустотой НЕЛЬЗЯ — намеренно: пустота неотличима от «не
    // настроили» (тот же спор, что про sprashivat). Понадобится «не сбрасывать никогда»
    // — заведём ЯВНЫЙ способ, а не будем читать мысли по пустоте.
    const isAbsent = raw === undefined || (Array.isArray(raw) && raw.length === 0)
    config[k] = isAbsent ? dflt : raw
    srcParts.push(`${k}=${config[k]} (${isAbsent ? 'умолчание' : 'настройка'})`)
  }
  // notifyCmd вынесен из DEFAULTS (деанонимизация 01.09.2026): без него — только
  // журнал (log only), не падение; путь чужой машины в код не зашиваем.
  const notifySet = rawConfig?.notifyCmd !== undefined
  config.notifyCmd = notifySet ? rawConfig.notifyCmd : undefined
  srcParts.push(`notifyCmd=${notifySet ? 'set' : 'unset (log only)'} (${notifySet ? 'настройка' : 'умолчание'})`)
  if (config.enabled === false) {
    log('подъём', 'enabled=false: сторож отключён настройкой, расписание и инструменты не ограничиваются')
    return
  }
  if (!loggedStartup) {
    log('подъём', `пределы: ${srcParts.join(', ')}`)
    log('подъём', 'не действует: пробуждение по человеческому сообщению (это не dispatch); уже начатый ход (гасим цикл, не ход); раунды целей и фоновые задания — не schedule-диспетчеры, сторож их не трогает; агент под danger-full-access — запись журнала разрешена')
    {
      // «Сколько влезает в час» ВЫЧИСЛЯЕТСЯ из шага, а не стоит в тексте: поменяем шаг —
      // строка не соврёт.
      const vlezaetVChas = Math.floor(3600 / config.minRepeatingIntervalSeconds)
      log('подъём', `темп: повторяющиеся не чаще ${config.minRepeatingIntervalSeconds} с (≤${vlezaetVChas} в час); одноразовые шагом не ограничены — против них потолок ${config.maxPerHour} в час`)
    }
    loggedStartup = true
  }

  // Упреждающий отказ ДО факта, чтобы МОДЕЛЬ узнала предел; пропольщик на idle
  // ниже остаётся страховкой. ДВА МАРШРУТА — ДВА МЕСТА, убрать одно нельзя:
  //  - этот хук видит только вызовы, вошедшие в реестр инструментов платформы
  //    (родной цикл); мост, зовущий тело инструмента напрямую, сюда не доходит —
  //    таких ловит только пропольщик;
  //  - пропольщик видит только уже созданное и модели невидим; только этот хук
  //    говорит модели «нет, предел такой-то», и она переставит напоминание сразу.
  //  Выглядят как дубль — и не дубль.
  // B-N-1194 (DSH 0.2): и schedule_update — он переставляет время и шаг (every_seconds на верхнем уровне
  // аргументов), и без перехвата через него обходится и потолок, и шаг.
  const OTKAZ = (code, message) => ({
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    error: { message, info: { name: 'ScheduleGuardError', code } },
  })
  // Safe content edits and a proven interval increase do not consume new wakeup budget.
  const relaxingUpdate = async (exec) => {
    if (exec.name !== 'schedule_update') return false
    const a = exec.arguments || {}
    const clocks = ['after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'].filter(k => a[k] !== undefined)
    if (clocks.length === 0) return true
    if (clocks.length !== 1 || clocks[0] !== 'every_seconds' || !Number.isFinite(a.every_seconds)
        || a.every_seconds < config.minRepeatingIntervalSeconds) return false
    try {
      const rows = await ctx.schedule.list({ sessionId: exec.agent?.session?.id })
      const old = rows.find(r => r.id === a.id)
      return old?.kind === 'every' && Number.isFinite(old.everySeconds) && a.every_seconds >= old.everySeconds
        && Number.isFinite(Date.parse(old.scheduledAt)) && Date.now() + a.every_seconds * 1000 >= Date.parse(old.scheduledAt)
    } catch { return false }
  }
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== 'schedule_create' && exec.name !== 'schedule_update') return next()
    seenCalls += 1
    // cron: шаг из выражения не посчитать — предел темпа не проверить ⇒ отказ (повторяющееся — every_seconds, daily, weekly).
    if (exec.arguments?.cron !== undefined) {
      refusedCalls += 1
      log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`)
      return OTKAZ('SCHEDULE_CRON_NOT_ALLOWED', 'cron сторож не принимает (шаг не проверить): для повторяющегося — every_seconds, daily или weekly')
    }
    // 🔴 ЧАСОВОЙ ПОТОЛОК (02.09.2026, П-11). Одноразовый будильник поля every_seconds
    // не несёт, поэтому проверка шага ниже его ПРОПУСКАЕТ — и цепочка одноразовых по
    // 10 с законна. Потолок ловит ТЕМП, а не количество: считаем пробуждения в
    // скользящем часе по dispatchTimes из журнала (счётчика в памяти нет — его нельзя
    // потерять или обнулить рестартом).
    const relaxing = await relaxingUpdate(exec)
    if (!relaxing && (config.maxPerHour > 0 || config.limitOneShotWakeups === true)) {
      const events = zhurnal(exec.agent?.session)
      // Журнал не читается — потолок не посчитать ⇒ отказ, а не пропуск (было `?? []` — на 0.2 пропускал всё).
      if (!events) {
        refusedCalls += 1
        log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls} (журнал сессии не читается)`)
        return OTKAZ('SCHEDULE_SOURCE_UNAVAILABLE', 'журнал сессии не читается — предел пробуждений не посчитать, напоминание не ставлю')
      }
      const { consecutive, dispatchTimes } = countWakeups(events, config.resetKinds)
      if (config.limitOneShotWakeups === true) {
        const perDay = dispatchTimes.filter(t => t >= dayBoundaryStart(Date.now(), config.dayBoundaryOffsetMinutes)).length
        if (consecutive >= config.maxConsecutiveWakeups) { refusedCalls++; log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`); return OTKAZ('SCHEDULE_STREAK_CAP', `подряд ${consecutive}; предел ${config.maxConsecutiveWakeups} достигнут`) }
        if (perDay >= config.maxPerDay) { refusedCalls++; log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`); return OTKAZ('SCHEDULE_DAILY_CAP', `в сутки ${perDay}; предел ${config.maxPerDay} достигнут`) }
      }
      const hourAgo = Date.now() - 3600_000
      const inHour = dispatchTimes.filter((t) => t >= hourAgo)
      if (config.maxPerHour > 0 && inHour.length >= config.maxPerHour) {
        const spaceAt = inHour[0] + 3600_000   // старейшее в окне выпадет через час
        const mins = Math.max(1, Math.ceil((spaceAt - Date.now()) / 60000))
        const message =
          `предел ${config.maxPerHour} автономных пробуждений в час достигнут ` +
          `— место освободится через ~${mins} мин`
        refusedCalls += 1
        log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`)
        return OTKAZ('SCHEDULE_HOURLY_CAP', message)
      }
    }
    const every = exec.arguments?.every_seconds
    if (typeof every !== 'number' || every >= config.minRepeatingIntervalSeconds) {
      log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`)
      return next()
    }
    const message =
      `повтор не чаще раза в ${config.minRepeatingIntervalSeconds} с ` +
      `(запрошено ${every} с) — это предел платформы, не ошибка: переставь на порог или выше`
    refusedCalls += 1
    log('счётчик', `${exec.name}: видел ${seenCalls}, отказал ${refusedCalls}`)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
      // `error` обязателен: без него реестр отвечает «tool result must be
      // losslessly JSON-serializable», и модель узнает про поломку трубы, а не
      // про причину отказа.
      error: { message, info: { name: 'ScheduleGuardError', code: 'SCHEDULE_TOO_FREQUENT' } },
    }
  })

  const own = fn => typeof ctx.effect === 'function' ? ctx.effect(fn) : fn()
  let active = true
  own(() => () => { active = false })
  const watched = new Set()
  const notified = new WeakSet()
  // 🔴 04.10.2026: КАНАЛ УВЕДОМЛЕНИЯ — С ПРЕДЕЛОМ ВРЕМЕНИ. execFileSync без timeout держал обработчик
  // простоя (и инструмент heartbeat_close) ровно столько, сколько висел канал, — бесконечно. Теперь по
  // истечении предела процесс канала убивается SIGKILL, отказ называется строкой с кодом ETIMEDOUT,
  // обработчик продолжает. Зависание помечается на эпизод (kanalZavis): повторного зова до конца эпизода
  // нет — иначе каждый следующий простой снова держал бы обработчик весь предел, а тревога повторялась бы.
  // ⚠️ НЕ ЛОВИТ: дочерние процессы канала (SIGKILL достаётся только прямому потомку, внуки доживают сами);
  // канал, отказавший быстро, — он, как и прежде, повторяется на следующем простое.
  const kanalZavis = new WeakSet()
  const reported = new WeakSet()
  const lastNotice = new WeakMap()
  const busy = new WeakSet()
  const zvatKanal = (tag, msg) => {
    const predel = config.notifyTimeoutSeconds > 0 ? config.notifyTimeoutSeconds : DEFAULTS.notifyTimeoutSeconds
    try {
      execFileSync(config.notifyCmd, { input: msg, stdio: ['pipe', 'ignore', 'ignore'], timeout: predel * 1000, killSignal: 'SIGKILL' })
      return { ushlo: true }
    } catch (e) {
      if (e?.code === 'ETIMEDOUT') {
        log(tag, `🔴 канал уведомления ЗАВИС дольше ${predel} с — процесс убит SIGKILL, код ETIMEDOUT; уведомление НЕ ушло, обработчик продолжает`)
        return { zavis: true }
      }
      return { oshibka: e }
    }
  }

  const podNadzor = (agent, otkuda) => {
    if (!ctx.agents.roots().includes(agent)) return
    if (podNadzorom.has(agent)) return
    podNadzorom.add(agent)
    watched.add(agent)
    own(() => () => { podNadzorom.delete(agent); watched.delete(agent); busy.delete(agent); reported.delete(agent); lastNotice.delete(agent); notified.delete(agent); kanalZavis.delete(agent) })
    log('подъём', `сессия под надзором${otkuda}: ${agent.session.id} (всего ${watched.size})`)

    // 🔴 heartbeat_close РЕГИСТРИРУЕТСЯ ЗДЕСЬ, У ЖИВОГО АГЕНТА, А НЕ В apply (15.09.2026).
    // Первая редакция звала ctx.tools.register прямо в apply — и не сработала бы: там
    // КОРНЕВОЙ ctx, агента ещё нет. Образец, работающий в бою, — сам dsh-schedule
    // (lib/index.js:1360): registerScheduleTools(ctx, agent.ctx, ...) внутри 'agent/created',
    // регистрация через agent.ctx.tools.register(defineTool({...})), disposer сохраняется.
    // ⚠️ И вот чем эта ошибка была опасна: моя же страховочная ветка напечатала бы
    // «платформа не даёт объявлять инструменты» — то есть сказала бы правду про себя и
    // СОВРАЛА БЫ ПРО ПРИЧИНУ. Свойство нашего места вызова прочли бы как свойство платформы.
    // 🔴 ВЫЗОВ НЕ ОБЯЗАТЕЛЕН: забыл агент позвать — полоса всё равно резюмируется числами
    // при первом внешнем слове. Пределы и гашение не зависят от него ни в одной ветке.
    // 🔴 СНЯТИЕ РЕГИСТРАЦИИ ОТДАЁМ КОНТЕКСТУ АГЕНТА, А НЕ ВЕДЁМ САМИ (15.09.2026, v3).
    // v2 сохраняла disposer в WeakMap и НИКОГДА его не звала: disposers.set 1, get 0, delete 0.
    // WeakMap это маскировал — память не течёт, запись уходит с агентом, а РЕГИСТРАЦИЯ В
    // ПЛАТФОРМЕ остаётся. Дублем имени мы сегодня уже роняли службу.
    // Образец (dsh-schedule lib/index.js:1358): agent.ctx.effect(() => { ...; return () => снять }).
    // Снятие вызывает САМ контекст агента — своего учёта не нужно, и вешаться на «уход» нечем:
    // событий агента во всей платформе ДВА, agent/created и agent/status, ухода среди них нет.
    own(() => agent.ctx.effect(() => {
    try {
      const reg = agent.ctx?.tools?.register
      if (typeof reg !== 'function') {
        // Называем, ЧЕГО именно не нашли: «платформа не даёт» было бы приговором платформе,
        // а причина может быть и в нашем месте вызова, и в версии, и в самом агенте.
        log(agent.session.id, `heartbeat_close НЕ объявлен: у agent.ctx нет tools.register `
          + `(agent.ctx ${agent.ctx ? 'есть' : 'НЕТ'}, tools ${agent.ctx?.tools ? 'есть' : 'НЕТ'}) — страж работает без него`)
        return () => {}
      } else {
        const opisanie = {
          name: 'heartbeat_close',
          description: 'Close the current streak of autonomous wake-ups and state a short summary '
            + 'of what it achieved. This is a report only: it does not delete reminders or reset '
            + 'session events. Outside user/a2a messages reset the counted streak.',
          // 🔴 ФОРМАТ ЗДЕСЬ ПЛОСКИЙ: карта ИМЯ → ОПИСАНИЕ, required У САМОГО ПОЛЯ.
          // Первая редакция давала валидный JSON Schema ({type,properties,required,...}) —
          // и платформа взяла КАЖДЫЙ ключ верхнего уровня за поле, попыталась отрендерить
          // «type» и «properties» как схемы и упала: «Cannot read properties of undefined
          // (reading render)». Форма была верна ВООБЩЕ и неверна ЗДЕСЬ: диалект чужой.
          // Образец, работающий в бою: dsh-schedule lib/index.js:1170.
          // Формат проверяют настоящий defineTool в test-preemptive-refusal и
          // scoped регистрация/исполнение в stend-native-lifecycle без вызова модели.
          parameters: {
            summary: {
              type: 'string',
              required: true,
              description: 'One or two sentences: what the streak achieved and why it ends here.',
            },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ok: { type: 'boolean', required: true },
                chisla: { type: 'string', required: true },
                otpravleno: { type: 'boolean', required: true },
              },
            },
            render: (args, value) => [{ type: 'text', text: String(value?.chisla ?? '') }],
          },
          async execute({ summary }) {
            // Числа — ТЕМ ЖЕ countWakeups, что и весь страж. Свой счётчик был бы вторым
            // источником правды, и разошёлся бы молча: сверять их некому.
            const events = zhurnal(agent.session)
            let chisla = 'числа полосы недоступны: журнал сессии не читается'
            if (Array.isArray(events)) {
              const { consecutive, dispatchTimes } = countWakeups(events, config.resetKinds)
              const dayStart = dayBoundaryStart(Date.now(), config.dayBoundaryOffsetMinutes)
              chisla = `подряд ${consecutive}, за сутки ${dispatchTimes.filter((t) => t >= dayStart).length}, всего ${dispatchTimes.length}`
            }
            const tekst = String(summary ?? '').trim()
            const msg = `полоса автономных пробуждений закрыта агентом: ${chisla}\n${tekst || '(агент не назвал итог)'}`
            log(agent.session.id, `полоса закрыта: ${chisla}; summary ${Array.from(tekst).length} знаков`)
            // Канал и подача те же, что у сообщения об остановке: stdin, НЕ аргументом
            // (врезка 29.08 про /proc/<pid>/cmdline — командная строка мировочитаема).
            // otpravleno — по факту отправки, а не по наличию канала: зависший канал не «отправил».
            let otpravleno = false
            if (config.notifyCmd) {
              const r = zvatKanal(agent.session.id, msg)
              otpravleno = Boolean(r.ushlo)
              if (r.oshibka) log(agent.session.id, `🔴 резюме полосы не отправлено: ${String(r.oshibka?.message).slice(0, 120)}`)
            }
            return { ok: true, chisla, otpravleno }
          },
        }
        // defineTool оборачивает описание, если платформа его даёт; без него кладём как есть.
        const dispose = reg.call(agent.ctx.tools, defineTool ? defineTool(opisanie) : opisanie)
        // 🔴 DISPOSER СОХРАНЯЕМ: без снятия при пересборке состава получим ВТОРУЮ регистрацию
        // того же имени. Дублем id мы сегодня уже роняли службу — цена известна.
        log(agent.session.id, 'heartbeat_close объявлен живому агенту')
        // Возврат из effect — это и есть снятие: контекст агента зовёт его сам.
        return () => { try { if (typeof dispose === 'function') dispose() } catch {} }
      }
      return () => {}
    } catch (e) {
      log(agent.session.id, `heartbeat_close НЕ объявлен: ${String(e?.message).slice(0, 140)} — страж работает без него`)
      return () => {}
    }
    }, 'schedule-guard.heartbeat_close()'))

    // Уведомление владельцу — одно на эпизод остановки (B-H-105): отметка ПОСЛЕ успешной отправки,
    // снимается, когда пределы снова не превышены.
    const uvedomit = (msg) => {
      if (!config.notifyCmd || notified.has(agent) || kanalZavis.has(agent)) return
      // 🔴 ПЕРЕДАЧА ЧЕРЕЗ ВВОД, А НЕ АРГУМЕНТОМ (29.08.2026): текст напоминаний — что угодно, а аргумент
      // процесса виден любому в /proc/<pid>/cmdline. Команда уведомления читает stdin, когда аргументов нет.
      const r = zvatKanal(agent.session.id, msg)
      if (r.ushlo) notified.add(agent)
      else if (r.zavis) kanalZavis.add(agent)
      else log(agent.session.id, `уведомление владельцу не ушло: ${r.oshibka?.message ?? r.oshibka}`)
    }
    // До снятия — записать целиком; не записалось — не снимать (иначе задачу не пересоздать) и сказать владельцу.
    const sohranit = (sessionId, reason, zapisi) => {
      if (zapisi.length === 0) return true
      try { zapisatPeredSnyatiem(sessionId, reason, zapisi); return true } catch (e) {
        const msg = `🔴 schedule-guard: запись снимаемых в ${fajlSnyatyh()} не удалась (${e?.code || e?.message}) — `
          + `НЕ снимаю ${zapisi.length} напоминаний (снятое без записи не пересоздать). Причина остановки: ${reason}`
        log(sessionId, msg)
        uvedomit(msg)
        return false
      }
    }
    // Снять задачу службы расписания (DSH 0.2) — считается снятой только по ответу deleted: true.
    const snyat = async (sessionId, r) => {
      const res = await ctx.schedule.delete({ sessionId, id: r.id })
      if (res?.deleted) return true
      log(sessionId, `напоминание id ${r.id} НЕ снято: ${res?.code ?? 'ответ без deleted'}`)
      return false
    }

    own(() => agent.ctx.on('agent/status', ({ status }) => {
      if (!active || status !== 'idle' || busy.has(agent)) return
      busy.add(agent)
      const sampledSession = agent.session
      const sessionId = sampledSession.id
      const stillCurrent = () => active && agent.session === sampledSession
      const safeLog = (reason, deleted) => log(sessionId,
        `🔴 предел автономных пробуждений: ${reason}; снято ${deleted.length}; `
        + deleted.map(r => `id ${r.id}, prompt ${Array.from(String(r.prompt ?? '')).length} знаков, title ${Array.from(String(r.title ?? '')).length} знаков`).join('; '))
      const sweep = async () => {
        try {
          const events = zhurnal(agent.session)
          if (!events) {
            const vse = await ctx.schedule.list({ sessionId })
            if (!stillCurrent()) return
            if (!sohranit(sessionId, 'журнал сессии не читается', vse)) return
            const deleted = []
            for (const r of vse) { if (!stillCurrent()) return; if (await snyat(sessionId, r)) deleted.push(r) }
            if (!stillCurrent()) return
          if (deleted.length || !reported.has(agent)) {
              const reason = 'журнал сессии не читается — пределы не вычислить'
              safeLog(reason, deleted)
              lastNotice.set(agent, buildStopMessage(config, reason, deleted, 'не посчитано (журнал недоступен)', Date.now()))
              reported.add(agent)
            }
            if (lastNotice.has(agent)) uvedomit(lastNotice.get(agent))
            return
          }
          const { consecutive, dispatchTimes } = countWakeups(events, config.resetKinds)
          const perDay = dispatchTimes.filter(t => t >= dayBoundaryStart(Date.now(), config.dayBoundaryOffsetMinutes)).length
          const overConsecutive = consecutive > config.maxConsecutiveWakeups
          const overPerDay = perDay > config.maxPerDay
          const iz01 = foldScheduleEvents(events, agent.session.inheritedEventCount ?? 0).active
            .filter(r => r.kind === 'every' || (config.limitOneShotWakeups === true && r.kind === 'after'))
            .map(r => ({ ...r, iz01: true }))
          const iz02 = await ctx.schedule.list({ sessionId })
          if (!stillCurrent()) return
          const all = [...iz01, ...iz02]
          const repeating = all.filter(r => ['every', 'daily', 'weekly', 'cron'].includes(r.kind))
          const tooFrequent = repeating.filter(r => r.kind === 'cron' || (r.kind === 'every' && r.everySeconds < config.minRepeatingIntervalSeconds))
          if (!overConsecutive && !overPerDay && !tooFrequent.length) {
            notified.delete(agent); kanalZavis.delete(agent); reported.delete(agent); lastNotice.delete(agent); return
          }
          const reasons = []
          if (overConsecutive) reasons.push(`подряд ${consecutive} пробуждений без внешнего слова (предел ${config.maxConsecutiveWakeups})`)
          if (overPerDay) reasons.push(`в сутки ${perDay} пробуждений (предел ${config.maxPerDay})`)
          if (tooFrequent.length) reasons.push(`повтор чаще ${config.minRepeatingIntervalSeconds} с (интервалы: ${[...new Set(tooFrequent.map(r => r.kind === 'cron' ? 'cron' : r.everySeconds))].join(', ')} с)`)
          const reason = reasons.join('; ')
          const toDelete = overConsecutive || overPerDay
            ? (config.limitOneShotWakeups === true ? all : repeating) : tooFrequent
          if (!sohranit(sessionId, reason, toDelete)) return
          const deleted = []
          for (const r of toDelete) {
            if (!stillCurrent()) return
            if (r.iz01) { agent.session.append('schedule/change', { version: 1, operation: 'delete', id: r.id }); deleted.push(r) }
            else if (await snyat(sessionId, r)) deleted.push(r)
          }
          if (!stillCurrent()) return
          if (deleted.some(r => r.iz01)) ctx.sessions.flush(agent.session).catch(() => {})
          if (deleted.length || !reported.has(agent)) {
            safeLog(reason, deleted)
            lastNotice.set(agent, buildStopMessage(config, reason, deleted, `${dispatchTimes.length} автономных пробуждений всего`, Date.now()))
            reported.add(agent)
          }
          if (lastNotice.has(agent)) uvedomit(lastNotice.get(agent))
        } catch (e) { log(sessionId, `сбой гашения: ${e?.message ?? e}`) }
        finally { busy.delete(agent) }
      }
      try {
        Promise.resolve(ctx.agents.withoutInitiator(sweep)).catch(e => { busy.delete(agent); log(sessionId, `сбой гашения: ${e?.message ?? e}`) })
      } catch (e) { busy.delete(agent); log(sessionId, `сбой гашения: ${e?.message ?? e}`) }
    }))

  }

  ctx.on('agent/created', ({ agent }) => podNadzor(agent, ''))
  // 🔴 ЖИВЫЕ КОРНИ — ТОЖЕ ПОД НАДЗОР (04.10.2026). agent/created платформа испускает один раз, при создании
  // агента (dsh-agent announce), и подписчику, пришедшему позже, не повторяет. Плагин, включённый на живом
  // узле, иначе не видел бы уже работающие сессии вовсе. Образец — dsh-schedule: подписка + обход roots().
  // Не обошли — говорим громко: тихий ноль здесь читался бы как «живых корней не было».
  let zhivye = []
  try { zhivye = ctx.agents.roots() } catch (e) {
    log('подъём', `🔴 живые корни НЕ обойдены (${String(e?.message).slice(0, 120)}) — под надзор попадут только новые сессии`)
  }
  for (const agent of zhivye) podNadzor(agent, ' (жила до подъёма плагина)')
}
