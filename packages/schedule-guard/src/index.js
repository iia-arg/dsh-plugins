// schedule-guard — предел автономных пробуждений поверх dsh-schedule.
// Путь 1 (решение координатора 22.08.2026): при пределе гасим ПОВТОРЯЮЩИЕСЯ будильники
// (удаляем записи every из журнала сессии) и пишем владельцу. Одноразовые не
// удаляем — они сами гаснут; их вклад учтён счётчиком пробуждений (не типом правила).
//
// Счётчик сворачивается ИЗ ЖУРНАЛА СЕССИИ (schedule/change dispatch = пробуждение,
// user/message source.kind="user" = человеческое слово и обнуление). Отдельного файла
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
export const inject = ['agents', 'sessions', 'tools']

// Без .default(): отсутствие поля в конфиге = undefined, и строка подъёма честно
// различает «(настройка)» от «(умолчание)». Одинаковое поведение при потерянном
// поле и при верной настройке — слепота.
export const Config = z.object({
  maxConsecutiveWakeups: z.number(),
  maxPerDay: z.number(),
  minRepeatingIntervalSeconds: z.number(),
  dayBoundaryOffsetMinutes: z.number(),
  notifyCmd: z.string(),
})

const DEFAULTS = {
  maxConsecutiveWakeups: 6,
  maxPerDay: 48,
  minRepeatingIntervalSeconds: 1800,
  dayBoundaryOffsetMinutes: 0,   // нейтрально (UTC); московский сдвиг 180 — в профиле
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

/** Счётчики пробуждений по журналу сессии. */
function countWakeups(events) {
  let consecutive = 0
  let maxConsecutive = 0
  const dispatchTimes = []
  for (const e of events) {
    if (e.type === 'user/message' && e.data?.source?.kind === 'user') {
      consecutive = 0
    } else if (e.type === 'schedule/change' && e.data?.operation === 'dispatch') {
      consecutive += 1
      if (consecutive > maxConsecutive) maxConsecutive = consecutive
      dispatchTimes.push(e.time)
    }
  }
  return { consecutive, maxConsecutive, dispatchTimes }
}

function buildStopMessage(config, reason, deleted, done, now) {
  const lines = ['🔴 schedule-guard: остановился по пределу автономных пробуждений.']
  lines.push(`Причина (числом): ${reason}`)
  if (deleted.length > 0) {
    lines.push('Удалены повторяющиеся напоминания:')
    for (const r of deleted) {
      lines.push(`  - id ${r.id}, интервал ${r.everySeconds} с, текст: ${JSON.stringify(r.prompt)}`)
    }
  } else {
    lines.push('Повторяющихся напоминаний для удаления не было (цикл шёл одноразовыми).')
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
export function apply(ctx, rawConfig) {
  if (!foldScheduleEvents) {
    log('startup', '🔴 @deepseek-ai/dsh-schedule не резолвится — сторож НЕДЕЙСТВУЮЩИЙ (сворачивать нечего)')
    return
  }
  // Собрать конфиг с пометкой источника — для строки подъёма.
  const config = {}
  const srcParts = []
  for (const [k, dflt] of Object.entries(DEFAULTS)) {
    const has = rawConfig?.[k] !== undefined
    config[k] = has ? rawConfig[k] : dflt
    srcParts.push(`${k}=${config[k]} (${has ? 'настройка' : 'умолчание'})`)
  }
  // notifyCmd вынесен из DEFAULTS (деанонимизация 01.09.2026): без него — только
  // журнал (log only), не падение; путь чужой машины в код не зашиваем.
  const notifySet = rawConfig?.notifyCmd !== undefined
  config.notifyCmd = notifySet ? rawConfig.notifyCmd : undefined
  srcParts.push(`notifyCmd=${notifySet ? 'set' : 'unset (log only)'} (${notifySet ? 'настройка' : 'умолчание'})`)
  if (!loggedStartup) {
    log('подъём', `пределы: ${srcParts.join(', ')}`)
    log('подъём', 'не действует: пробуждение по человеческому сообщению (это не dispatch); уже начатый ход (гасим цикл, не ход); раунды целей и фоновые задания — не schedule-диспетчеры, сторож их не трогает; агент под danger-full-access — запись журнала разрешена')
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
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== 'schedule_create') return next()
    const every = exec.arguments?.every_seconds
    if (typeof every !== 'number' || every >= config.minRepeatingIntervalSeconds) return next()
    const message =
      `повтор не чаще раза в ${config.minRepeatingIntervalSeconds} с ` +
      `(запрошено ${every} с) — это предел платформы, не ошибка: переставь на порог или выше`
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
      // `error` обязателен: без него реестр отвечает «tool result must be
      // losslessly JSON-serializable», и модель узнает про поломку трубы, а не
      // про причину отказа.
      error: { message, info: { name: 'ScheduleGuardError', code: 'SCHEDULE_TOO_FREQUENT' } },
    }
  })

  const watched = new Set()
  const notified = new WeakSet()

  ctx.on('agent/created', ({ agent }) => {
    if (!ctx.agents.roots().includes(agent)) return
    watched.add(agent)
    log('подъём', `сессия под надзором: ${agent.session.id} (всего ${watched.size})`)

    agent.ctx.on('agent/status', ({ status }) => {
      if (status !== 'idle') return
      const events = agent.session.events
      if (!events.some((e) => e.type === 'schedule/change')) return

      const { consecutive, dispatchTimes } = countWakeups(events)
      const dayStart = dayBoundaryStart(Date.now(), config.dayBoundaryOffsetMinutes)
      const perDay = dispatchTimes.filter((t) => t >= dayStart).length

      const folded = foldScheduleEvents(events)
      const repeating = folded.active.filter((r) => r.kind === 'every')
      const tooFrequent = repeating.filter((r) => r.everySeconds < config.minRepeatingIntervalSeconds)

      const overConsecutive = consecutive > config.maxConsecutiveWakeups
      const overPerDay = perDay > config.maxPerDay
      const overInterval = tooFrequent.length > 0
      if (!overConsecutive && !overPerDay && !overInterval) return

      const reason = overConsecutive
        ? `подряд ${consecutive} пробуждений без слова человека (предел ${config.maxConsecutiveWakeups})`
        : overPerDay
          ? `в сутки ${perDay} пробуждений (предел ${config.maxPerDay})`
          : `повтор чаще ${config.minRepeatingIntervalSeconds} с (интервалы: ${[...new Set(tooFrequent.map((r) => r.everySeconds))].join(', ')} с)`

      // Интервал-предел гасит только нарушившие; прочие два — все повторяющиеся.
      const toDelete = overInterval ? tooFrequent : repeating

      // 🔴 Гашение ОТЛОЖЕНО: из обработчика события писать в журнал нельзя
      // (замок публикации). withoutInitiator = тот же приём, что у dsh-schedule.
      ctx.agents.withoutInitiator(async () => {
        try {
          const deleted = []
          for (const r of toDelete) {
            agent.session.append('schedule/change', { version: 1, operation: 'delete', id: r.id })
            deleted.push(r)
          }
          if (deleted.length > 0) {
            ctx.sessions.flush(agent.session).catch(() => {})
          }
          const msg = buildStopMessage(config, reason, deleted, `${dispatchTimes.length} автономных пробуждений всего`, Date.now())
          log(agent.session.id, msg.replace(/\n/g, ' | '))
          if (config.notifyCmd && !notified.has(agent)) {
            notified.add(agent)
            try {
              // 🔴 ПЕРЕДАЧА ЧЕРЕЗ ВВОД, А НЕ АРГУМЕНТОМ (29.08.2026). Стоп-сообщение
              // несёт текст напоминаний — что угодно, — а аргумент процесса виден
              // любому в /proc/<pid>/cmdline (та же дыра, что нашлась у соседнего модуля).
              // команда уведомления читает stdin, когда аргументов нет (msg="$(cat)").
              execFileSync(config.notifyCmd, { input: msg, stdio: ['pipe', 'ignore', 'ignore'] })
            } catch (e) {
              log(agent.session.id, `уведомление владельцу не ушло: ${e?.message ?? e}`)
            }
          }
        } catch (e) {
          log(agent.session.id, `сбой гашения: ${e?.message ?? e}`)
        }
      })
    })
  })
}
