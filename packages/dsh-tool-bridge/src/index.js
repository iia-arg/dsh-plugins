// RU: Мост живёт в процессе DSH: корневой агент получает набор инструментов и случайные пропуски своего хода. Адаптер и шлюз только доставляют вызовы обратно; состояние целей и полномочия остаются у платформы.
// EN: The bridge runs inside DSH: a root agent receives a tool catalog and random tickets for its turn. The adapter and gateway route calls back; goal state and authority stay in the platform.
// RU: Пропуск — bearer-полномочие на (агент, ход), не одноразовый вызов. Повторные descriptor создают несколько пропусков; конец того же хода отзывает весь набор. TTL страхует пропущенный конец, но не защищает от чтения памяти процесса.
// EN: A ticket is bearer authority for an (agent, turn), not a single-use call. Repeated descriptors create multiple tickets; the matching turn end revokes the whole set. TTL covers a missing end event, not process-memory access.
// RU: Политики автономных напоминаний считаются на сессию и проверяются после завершения хода. Исчезновение событий запрещает угадывать нулевой счёт; ограничение не охватывает раунды целей, фоновые задания или другой маршрут без моста.
// EN: Autonomous reminder policy is counted per session and checked after a turn ends. Missing events must not be treated as zero activity; it does not cover goal rounds, background jobs or routes without the bridge.
import {claudeImageCall, imageContent, IMAGE_BASE64_LIMIT} from './image-content.js'
import {installOstrovApi} from './ostrov-api.js'

import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-tool-bridge'
export const inject = ['agents', 'goals', 'typertGateway', 'jobs', 'tools']

// RU: Схема описывает адреса монтажа, не содержимое YAML политики. Непереданные ключи могут быть удалены проверяющим платформы; журнал показывает их источник.
// EN: The schema describes mounting addresses, not policy YAML contents. The platform validator may omit missing keys; startup logs show their source.
export const Config = z.object({

  // RU: Ключ выбирает YAML политики; это не имя OS-пользователя.
  // EN: The key selects policy YAML, not an OS username.
  limitsAgent: z.string(),

  // RU: Каталог YAML; без ключа применяется AGENT_LIMITS_DIR или нейтральный адрес. Чтение только при apply.
  // EN: YAML directory; without this key use AGENT_LIMITS_DIR or a neutral location. Read only at apply.
  limitsDir: z.string(),

  // RU: Исполняемый отправщик; пустое значение оставляет тревогу только в журнале. Явный ключ выше DSH_ALERT_CMD.
  // EN: Alert executable; an empty value logs only. An explicit key overrides DSH_ALERT_CMD.
  alertCommand: z.string(),

  // RU: Ноль выбирает свободный loopback порт; потребитель получает фактический адрес из descriptor.
  // EN: Zero selects a free loopback port; consumers obtain its actual address from the descriptor.
  port: z.number().default(0),

  // RU: Объявленное поле не фильтрует TOOLS/EXEC; пустой список не выключает выдачу.
  // EN: The declared field does not filter TOOLS/EXEC; an empty list does not disable exposure.
  domains: z.array(z.string()).default(['goals']),

  // RU: TTL в минутах страхует отсутствующий turn/end; использовать положительное конечное число.
  // EN: TTL in minutes covers missing turn/end; use a positive finite number.
  ticketTtlMinutes: z.number(),

  // RU: Имя определяет MCP-приставку; закрепить до обновления и проверить коллизии.
  // EN: The name determines the MCP prefix; pin it before upgrades and check collisions.
  serverName: z.string(),

  // RU: Пустое значение выбирает журнал; каталогу нужен отдельный читатель уведомлений.
  // EN: An empty value selects logging; a directory needs a separate notice reader.
  heartbeatNoticeDir: z.string(),

  // Direct read/quote API, opt-in for Varvara; credentials and context stay in the process.
  ostrovApi: z.union([
    z.object({enabled: z.const(false).default(false), baseUrl: z.string(), keyFile: z.string(), botId: z.string(), requestKeyDir: z.string()}),
    // RU: При enabled адрес, файл ключа и botId обязательны — прежние умолчания вели в частную сеть авторов (аудит №9).
    // EN: With enabled the address, key file and botId are required — former defaults pointed into the authors' private network (audit #9).
    z.object({enabled: z.const(true).required(), baseUrl: z.string().required(), keyFile: z.string().required(), botId: z.string().required(), requestKeyDir: z.string().required()}),
  ]),

})

const SERVER_NAME_DEFAULT = 'bridge'

const CREATE_LIMIT_DEFAULT = 3
const CREATE_WINDOW_MINUTES_DEFAULT = 60

const BLOCKED_AFTER_ROUNDS_DEFAULT = 3

const TICKET_TTL_MINUTES_DEFAULT = 360

const HEARTBEAT_MIN_INTERVAL_SECONDS_DEFAULT = 1800
const HEARTBEAT_MAX_CONSECUTIVE_DEFAULT = 6
const HEARTBEAT_MAX_PER_DAY_DEFAULT = 48
const HEARTBEAT_DAY_ZONE_DEFAULT = 'Europe/Moscow'

const HEARTBEAT_NOTICE_DIR_DEFAULT = ''

const LIMITS_AGENT_DEFAULT = 'agent'

const HEARTBEAT_REZHIM_DEFAULT = 'lesenka'
const HEARTBEAT_REZHIMY = ['lesenka', 'ravnomerno']

const HEARTBEAT_RAVNOMERNO_SECONDS_DEFAULT = HEARTBEAT_MIN_INTERVAL_SECONDS_DEFAULT

const HEARTBEAT_MAX_V_CHAS_DEFAULT = 0
const HEARTBEAT_OKNO_CHASA_MS = 3600000

const HEARTBEAT_OTKAZ_SEKUND = 86400

const TREVOGA_POVTOR_MS = 86400000
// RU: B-N-1857: сколько ждать схождения, если свидетель (история доставок) опережает журнал сессии. Доставка пишется в историю сразу,
// RU: а в журнал — когда сессия возьмёт её в ход; занятая сессия держит её в очереди (Заря 08.10: 96 с, три хода писем). 15 мин —
// RU: ≈9× замеренного, оценка снизу (видели один случай). Цена: при настоящей слепоте журнала остановка позже на ≤15 мин; суточный
// RU: предел в это время считается по БОЛЬШЕМУ числу, так что не теряется; предел «подряд» в эти минуты не видит доставок свидетеля.
// EN: B-N-1857: how long to wait for convergence when the witness (delivery history) is ahead of the session journal. A delivery is in
// EN: the history at once and in the journal when the session takes it into a turn; a busy session queues it (Zarya 08.10: 96 s,
// EN: three mail turns). 15 min ≈ 9× the measured lag, a lower-bound estimate (one case seen). Cost: under real journal blindness the
// EN: stop comes ≤15 min later; the daily limit meanwhile counts by the LARGER number, so it is not lost; the streak limit is blind then.
const RASHOZHDENIE_TERPENIE_MS = 15 * 60000

const HEARTBEAT_SZHATIE_DEFAULT = false

// RU: Форматировать срок для журнала, не менять единицы внутренних вычислений.
// EN: Format a duration for logs without changing internal calculation units.
function pochelovecheski(sek) {
  if (sek >= 86400) return `${(sek / 86400).toFixed(sek % 86400 === 0 ? 0 : 1)} сут`
  if (sek >= 3600) return `${(sek / 3600).toFixed(sek % 3600 === 0 ? 0 : 1)} ч`
  if (sek >= 60) return `${Math.round(sek / 60)} мин`
  return `${sek} с`
}

const PODPIS = (() => {
  try {
    const m = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return `[${m.name} ${m.version}]`
  } catch (e) {
    console.error(`[mcp-bridge] ⚠️ манифест не прочитан (${String(e?.message ?? e).slice(0, 60)}) — подписываюсь именем каталога, версии в строках НЕ БУДЕТ`)
    return '[mcp-bridge]'
  }
})()
const log = (m) => console.error(`${PODPIS} ${m}`)

// RU: Снимок при import, не при apply: поздний монтаж на диске не меняет код процесса.
// EN: Capture at import, not apply: later deployment must not rename the loaded code.
const SUMMA_ZAGRUZHENNOGO_KODA = (() => {
  try { return createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') }
  catch { return null }
})()

const PARITY = JSON.parse(
  readFileSync(new URL('./paritet.json', import.meta.url), 'utf8'),
)

const SCHEDULE = JSON.parse(
  readFileSync(new URL('./raspisanie.json', import.meta.url), 'utf8'),
)

const PAMYAT = JSON.parse(
  readFileSync(new URL('./pamyat.json', import.meta.url), 'utf8'),
)

const VYDACHA = JSON.parse(
  readFileSync(new URL('./vydacha.json', import.meta.url), 'utf8'),
)
const TOLKO_ZAREGISTRIROVANNYM = new Set(VYDACHA.map((t) => t.name))

const OWN = [{
  pkg: 'mcp-bridge',
  name: 'heartbeat_close',
  description: 'Close the current streak of autonomous wake-ups and state a short summary of what it '
    + 'achieved. Call it in the last autonomous turn, when you decide not to schedule another '
    + 'wake-up. The summary is printed immediately and delivered to the machine owner. Calling it '
    + 'is a convention, not a requirement: if you forget, the streak is still summarised — by '
    + 'numbers alone — as soon as an outside message arrives.',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One or two sentences: what the streak achieved and why it ends here.',
      },
    },
    required: ['summary'],
    additionalProperties: false,
  },
}]

const BEZ_CRON = new Set(['schedule_create', 'schedule_update'])
const SCHEDULE_VYDACHA = SCHEDULE.map((t) => {
  if (!BEZ_CRON.has(t.name) || !t.parameters?.properties?.cron) return t
  const { cron, ...ostalnye } = t.parameters.properties
  return {
    ...t,
    description: `${t.description} Через этот мост cron не принимается: для повторяющегося — every_seconds, daily или weekly.`,
    parameters: { ...t.parameters, properties: ostalnye },
  }
})
const TOOLS = [...PARITY, ...SCHEDULE_VYDACHA, ...PAMYAT, ...VYDACHA, ...OWN]

const SCOPED_SESSIONS = JSON.parse(readFileSync(new URL('./scoped-sessions.json', import.meta.url), 'utf8'))
const SCOPED_SESSION_PREFIXES = SCOPED_SESSIONS.sessionIdPrefixes
if (!Array.isArray(SCOPED_SESSION_PREFIXES) || !SCOPED_SESSION_PREFIXES.length
    || SCOPED_SESSION_PREFIXES.some((p) => typeof p !== 'string' || !p.length || p.trim() !== p)) {
  throw new Error('mcp-bridge: scoped-sessions.json requires non-empty sessionIdPrefixes')
}
const SCOPED_TOOL_NAMES = SCOPED_SESSIONS.allowedToolNames
if (!Array.isArray(SCOPED_TOOL_NAMES) || !SCOPED_TOOL_NAMES.length
    || SCOPED_TOOL_NAMES.some((n) => typeof n !== 'string' || !n.length || n.trim() !== n)) {
  throw new Error('mcp-bridge: scoped-sessions.json requires non-empty allowedToolNames')
}
const SCOPED_ALLOWED_TOOLS = new Set(SCOPED_TOOL_NAMES)
const TELEGRAM_GUEST_TOOL_NAMES = SCOPED_SESSIONS.telegramGuestToolNames ?? []
if (!Array.isArray(TELEGRAM_GUEST_TOOL_NAMES) || TELEGRAM_GUEST_TOOL_NAMES.some(n => typeof n !== 'string' || !n.length)) throw new Error('mcp-bridge: invalid telegramGuestToolNames')
// RU: Выбирать ограниченные сессии по доверенному ID платформы; аргумент HTTP не назначает область.
// EN: Select restricted sessions by platform-owned session ID; HTTP arguments cannot choose scope.
function scopedSession(session) {
  const id = session?.id
  return typeof id === 'string' && SCOPED_SESSION_PREFIXES.some((p) => id.startsWith(p))
}

// RU: Сочетать закреплённые схемы с wireSchemas живой области. Зарезервированные имена не заменяются; для ограниченной сессии взять только пересечение с allowlist, пустая область не даёт инструментов.
// EN: Combine fixed schemas with the live scoped wireSchemas. Reserved names cannot be replaced; restricted sessions receive only the allowlist intersection, and an empty scope grants no tools.
// Observed Claude engine 0.3.289 rule only: reject present non-object/type != object.
// Object schemas with top-level combinators pass (real omega_store); other engine/API rules are outside this check.
// Reader: bridge/gateway journal; alert consumer proposed in the handoff, not installed here.
function mcpSchemaRefusal(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'схема не объект'
  if (schema.type !== 'object') return 'верхний type должен быть object'
}

export function naborDlyaAgenta(reestr, owner) {

  const scopedOnly = scopedSession(owner?.session)
  const fixed = TOOLS.filter((t) => !TOLKO_ZAREGISTRIROVANNYM.has(t.name)
    || typeof reestr?.get?.(t.name, owner)?.execute === 'function')

  const reserved = new Set(TOOLS.map((t) => t.name))
  const live = typeof reestr?.wireSchemas === 'function'
    ? reestr.wireSchemas(owner).schemas : []
  const tools = [...fixed, ...live.filter((t) => !reserved.has(t.name))]
  const allowed = new Set(live.map((t) => t.name))
  const guestNames = String(owner?.session?.id ?? '').startsWith('telegram-gost-') ? TELEGRAM_GUEST_TOOL_NAMES : []
  const visible = scopedOnly ? tools.filter((t) => allowed.has(t.name) && (SCOPED_ALLOWED_TOOLS.has(t.name) || guestNames.includes(t.name))) : tools
  return visible.flatMap((t) => {
    const schema = t?.parameters ?? { type: 'object', properties: {} }
    const why = mcpSchemaRefusal(schema)
    if (!why) return [t.parameters === schema ? t : { ...t, parameters: schema }]
    log(`🔴 схема инструмента ${JSON.stringify(t?.name ?? '<без имени>')} отброшена мостом: ${why}`)
    return []
  })
}
{
  const seen = new Set()
  for (const t of TOOLS) {
    if (seen.has(t.name)) throw new Error(`mcp-bridge: имя "${t.name}" встречается в наборе дважды`)
    seen.add(t.name)
  }
}

const otkazIstochnika = new Map()

// RU: После возврата событий снять отказ и назвать длительность; молчание не доказывает восстановление.
// EN: Clear the event-source failure on recovery and report its duration; silence does not prove recovery.
function otmetitVozvratIstochnika(agentId) {
  const bylo = otkazIstochnika.get(agentId)
  if (!bylo) return
  otkazIstochnika.delete(agentId)
  const sek = Math.round((Date.now() - bylo.s) / 1000)
  log(`источник событий сессии ${agentId} ВЕРНУЛСЯ: отказ длился ${sek} с, `
    + `подавлено повторов тревоги ${bylo.podavleno}. Пределы снова считаются`)
}

// RU: Тревожить через настроенный отправщик, максимум раз за сутки после успешной отправки. Неудачная отправка остаётся в журнале и не расходует выдержку; состояние выдержки теряется при рестарте.
// EN: Alert through the configured sender at most once per day after successful delivery. Failed delivery stays in logs and does not consume the cooldown; cooldown state resets on restart.
function trevogaOtkazIstochnika(agentId, prosili, postavili, alertCommand = process.env.DSH_ALERT_CMD || '') {

  const teper = Date.now()
  const sost = otkazIstochnika.get(agentId)
  if (sost) {
    if (teper - sost.skazano < TREVOGA_POVTOR_MS) {
      sost.podavleno += 1
      log(`тревога о пропаже источника ${agentId} подавлена выдержкой: сказано `
        + `${Math.round((teper - sost.skazano) / 1000)} с назад, повтор не чаще `
        + `${TREVOGA_POVTOR_MS / 1000} с. Подавлено подряд: ${sost.podavleno}`)
      return
    }
  } else {

    otkazIstochnika.set(agentId, { s: teper, skazano: 0, podavleno: 0 })
  }

  const text = `🔴 DSH ${agentId}: источник событий сессии пропал — пределы самопробуждения `
    + `НЕ СЧИТАЮТСЯ (ни подряд, ни за сутки, ни за час). Просили ${prosili} с, `
    + `поставлено ${postavili} с: при неизвестных пределах решение по умолчанию — не будить.`

  const put = alertCommand
  if (!existsSync(put)) {

    log(`🔴 тревога о пропаже источника событий НЕ отправлена: отправщика нет (${put}). `
      + 'Задайте alertCommand или DSH_ALERT_CMD. Само событие: ' + text)
    return
  }
  // RU: Отправка асинхронная: зависший отправщик не держит event loop процесса DSH до 30 с (аудит №7). Место выдержки занимается сразу (дубли, пока первая в пути, не уходят) и возвращается при отказе — повтор остаётся.
  // EN: Sending is asynchronous: a hung sender no longer holds the DSH event loop for up to 30 s (audit #7). The cooldown slot is taken immediately — no duplicates while the first is in flight — and released on failure, so a retry remains.
  const zapis = otkazIstochnika.get(agentId), prezhde = zapis.skazano
  zapis.skazano = teper
  execFile(put, [text], { timeout: 30000 }, (e) => {
    if (!e) return
    if (zapis.skazano === teper) zapis.skazano = prezhde
    log(`🔴 тревога о пропаже источника событий НЕ ушла: ${String(e?.message ?? e).slice(0, 120)}`)
  })
}

// RU: Поддержать массив events и snapshotEvents новой платформы. undefined означает отсутствие прибора, а не пустую историю.
// EN: Support both an events array and the newer snapshotEvents API. undefined means an unavailable source, not an empty history.
function sobytiyaSessii(agent) {
  const s = agent?.session
  if (Array.isArray(s?.events)) return s.events
  if (typeof s?.snapshotEvents === 'function') {
    const ev = s.snapshotEvents()
    if (Array.isArray(ev)) return ev
  }
  return undefined
}

// RU: Распознать доставленное расписателем user/message по источнику, не по телу текста.
// EN: Recognize scheduler-delivered user/message by its source, not its text.
function dostavkaNovoj(e) {
  return e?.type === 'user/message' && e.data?.source?.kind === 'schedule'
}

// RU: Найти события открытого хода; отсутствие журнала или закрытый ход дают отказ, не новое полномочие.
// EN: Find the open turn events; unavailable history or a closed turn refuses access instead of granting fresh authority.
function openTurn(agent) {
  const events = sobytiyaSessii(agent)

  if (events === undefined) throw new Error('инструменты целей: журнал сессии недоступен (ни events, ни snapshotEvents) — открытый ход не найти')
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const b = events[i]
    if (b?.type === 'turn/end') throw new Error('инструменты целей требуют открытого хода модели')
    if (b?.type === 'turn/start') return events.slice(i + 1)
  }
  throw new Error('инструменты целей требуют открытого хода модели')
}

// RU: Проверить живого running агента, открытый ход и видимого инициатора. HTTP не наследует AsyncLocalStorage, поэтому отсутствующий инициатор не сравнивается с выдуманным.
// EN: Check the live running agent, open turn and any visible initiator. HTTP does not inherit the turn AsyncLocalStorage, so a missing initiator is not compared against an invented one.
function bridgeExecution(agents, agentId) {
  const agent = agents.get(String(agentId))
  if (!agent) throw new Error(`живой агент "${agentId}" не найден в реестре`)
  if (agent.status !== 'running') throw new Error(`агент "${agentId}" не в состоянии running (${agent.status})`)
  let initiator
  try { initiator = agents.currentInitiator() } catch { initiator = undefined }
  if (initiator !== undefined && initiator !== agent) {
    throw new Error('вызов пришёл вне хода вызывающего агента')
  }
  return { agent, events: openTurn(agent) }
}

// RU: Прямое человеческое полномочие существует только у корня с user-источником в этом ходе.
// EN: Direct human authority requires a root agent and a user source in this turn.
function hasDirectHumanInput(agents, execution) {
  if (!agents.roots().includes(execution.agent)) return false
  return execution.events.some((e) => e.type === 'user/message' && e.data?.source?.kind === 'user')
}

// RU: Сверить текущий раунд именно с поколением активной цели, чтобы чужой раунд не завершил её.
// EN: Match the current round to the active goal generation so a different round cannot finish it.
function isMatchingGoalRound(execution, goal) {
  return execution.events.some((e) =>
    e.type === 'user/message'
    && e.data?.source?.kind === 'goal'
    && e.data.source.goalId === goal.id
    && e.data.source.revision === goal.revision
    && e.data.source.round === goal.roundsStarted)
}

// RU: Отклонять самостоятельное создание, редактирование, паузу и продолжение цели без прямого ввода человека.
// EN: Reject autonomous goal creation, editing, pausing and resuming without direct human input.
function requireDirectHuman(agents, execution) {
  if (hasDirectHumanInput(agents, execution)) return
  throw new Error('эта операция требует прямого человеческого хода на корневом агенте')
}

// RU: Разрешить завершение или блокировку по человеку либо текущему раунду цели; прочие причины пробуждения полномочия не дают.
// EN: Permit completion or blocking through a human turn or the current goal round; other wake reasons grant no authority.
function completionAuthority(ctx, agents, execution) {
  if (hasDirectHumanInput(agents, execution)) return { kind: 'direct-human' }
  const goal = ctx.get('goals').get(execution.agent)
  if (goal !== undefined && isMatchingGoalRound(execution, goal)) return { kind: 'goal-round', goal }
  throw new Error('complete и blocked требуют прямого человеческого хода или текущего раунда цели')
}

// RU: Зажать запрошенные раунды по хостовому потолку. Неизвестный потолок не означает бесконечный бюджет.
// EN: Clamp requested rounds to the host ceiling. An unknown ceiling does not grant an unlimited budget.
function capRounds(ctx, requested) {
  if (requested === undefined) return undefined
  const cap = ctx.get('goals')?.resolved?.defaultMaxGoalRounds
  if (typeof cap !== 'number') {
    log(`🔴 предел раундов хоста не прочитан — переданное значение ${requested} отброшено`)
    return undefined
  }
  if (requested > cap) {
    log(`предел раундов зажат: запрошено ${requested}, хостовый потолок ${cap}`)
    return cap
  }
  return requested
}

// RU: Таблица полномочий закрепляет поведение целей и jobs; только create_goal расходует квоту создания. Новые динамические инструменты не наследуют эти специальные пути.
// EN: The authority table fixes goal and job behavior; only create_goal consumes creation quota. New dynamic tools do not inherit these special routes.
const EXEC = {
  get_goal: {

    authority: 'turn',
    local: (ctx, agent) => ctx.get('goals').get(agent) ?? null,
  },
  create_goal: {

    authority: 'human',
    remote: {
      namespace: 'goals',
      method: 'create',
      // RU: Предел раундов считается один раз — иначе строка «предел раундов зажат» в журнале дублируется (аудит №21).
      // EN: The round cap is computed once — otherwise the "round cap clamped" journal line is duplicated (audit #21).
      build: (a, ctx) => {
        const predel = capRounds(ctx, a.max_goal_rounds)
        return { request: { objective: a.objective, ...(predel === undefined ? {} : { maxGoalRounds: predel }) } }
      },
    },

    counted: true,
  },

  update_goal: { authority: 'dispatch', dispatch: updateGoal },
  job_list: {
    authority: 'none',
    local: (ctx, agent) => ctx.get('jobs').list(agent),
  },
  job_output: {
    authority: 'none',
    local: (ctx, agent, a) => ctx.get('jobs').read(String(a.job_id), agent),
  },
  job_kill: {
    authority: 'none',
    local: (ctx, agent, a) => ctx.get('jobs').kill(String(a.job_id), agent, a.reason),
  },

  heartbeat_close: {
    authority: 'none',
    local: (ctx, agent, a, limits) => zakrytPolosu(agent, String(a.summary ?? ''), limits),
  },

  schedule_create: { authority: 'none', native: true, guard: heartbeatGuard },
  schedule_list: { authority: 'none', native: true },
  schedule_delete: { authority: 'none', native: true },

  schedule_update: { authority: 'none', native: true, guard: heartbeatGuard },

  pamyat_otnoshenie: { authority: 'none', native: true },

  pamyat_ocenit: { authority: 'none', native: true },

  pamyat_po_smyslu: { authority: 'none', native: true },
}

// RU: Вызывать зарегистрированное тело в области агента. Оно валидирует аргументы, но этот путь обходит pre-execute, timeout/concurrency и отмену реестра; его нельзя считать полным tools.execute.
// EN: Call the registered body in the agent scope. It validates arguments, but this path bypasses registry pre-execute, timeout/concurrency and cancellation; it is not the full tools.execute pipeline.
async function nativeCall(ctx, agent, toolName, args) {
  const registry = ctx.get('tools')
  if (!registry || typeof registry.get !== 'function') {
    throw new Error('реестр инструментов платформы недоступен — родной путь неисполним')
  }

  const def = registry.get(toolName, agent)
  if (!def || typeof def.execute !== 'function') {
    log(`🔴 СЛЕПОТА: "${toolName}" не зарегистрирован у агента ${agent?.id ?? '?'} — слой не смонтирован`)
    throw new Error(`"${toolName}" не зарегистрирован у живого агента: слой платформы не смонтирован`)
  }
  return await def.execute(args, { agent, signal: new AbortController().signal })
}

const hasText = (v) => v !== undefined && v !== ''

const hasRoundCap = (v) => v !== undefined && v !== 0

// RU: Развести пять действий и их полномочия. edit/pause/resume требуют человека; complete/blocked допускают текущий раунд. blocked вызывает локальный сервис и проверяет порог только для раунда, не для человека.
// EN: Separate five actions and their authority. edit/pause/resume require a human; complete/blocked allow the current goal round. blocked uses the local service and enforces its threshold only for rounds, not human turns.
async function updateGoal(ctx, agents, agentId, a, limits) {
  const execution = bridgeExecution(agents, agentId)
  const ref = { id: String(a.goal_id), revision: a.revision }
  const action = a.action

  if (action === 'edit') {
    requireDirectHuman(agents, execution)
    if (hasText(a.blocked_reason)) throw new Error('blocked_reason допустим только с action blocked')
    const capped = capRounds(ctx, hasRoundCap(a.max_goal_rounds) ? a.max_goal_rounds : undefined)
    const request = {
      ...(hasText(a.objective) ? { objective: a.objective } : {}),
      ...(capped === undefined ? {} : { maxGoalRounds: capped }),
    }
    return remoteCall(ctx, 'goals', 'edit', { ref, request }, agentId)
  }

  if (action === 'pause' || action === 'resume') {
    requireDirectHuman(agents, execution)
    if (hasText(a.objective) || hasRoundCap(a.max_goal_rounds) || hasText(a.blocked_reason)) {
      throw new Error('objective и max_goal_rounds допустимы только с action edit; blocked_reason — только с blocked')
    }
    return remoteCall(ctx, 'goals', action, { ref }, agentId)
  }

  if (action !== 'complete' && action !== 'blocked') {
    throw new Error(`неизвестное действие "${action}"`)
  }

  const authority = completionAuthority(ctx, agents, execution)
  if (hasText(a.objective) || hasRoundCap(a.max_goal_rounds)) {
    throw new Error('objective и max_goal_rounds допустимы только с action edit')
  }
  if (action === 'complete') {
    if (hasText(a.blocked_reason)) throw new Error('blocked_reason допустим только с action blocked')
    return remoteCall(ctx, 'goals', 'complete', { ref }, agentId)
  }

  const reason = typeof a.blocked_reason === 'string' ? a.blocked_reason.trim() : ''
  if (!reason) throw new Error('blocked_reason обязателен при action blocked')
  if (authority.kind === 'goal-round' && authority.goal.roundsStarted < limits.blockedAfterRounds) {
    throw new Error(
      `blocked требует не менее ${limits.blockedAfterRounds} автономных раундов подряд; `
      + `сейчас начато ${authority.goal.roundsStarted}`,
    )
  }
  return ctx.get('goals').block(execution.agent, ref, { code: 'model-reported', message: reason })
}

// RU: Служебную личность писать после аргументов, чтобы ввод модели не подменил владельца при invoke платформы.
// EN: Write the trusted identity after arguments so model input cannot replace the owner during the platform invoke.
function remoteCall(ctx, namespace, method, args, agentId) {
  return ctx.get('typertGateway').invoke({
    namespace,
    method,
    args: { ...args, agentId: String(agentId) },
  })
}

const creations = new Map()

// RU: Резервировать место до await в скользящем окне; конкурентные создания видят резерв. Счётчик в памяти сбрасывается при рестарте.
// EN: Reserve a rolling-window slot before awaiting; concurrent creations see the reservation. This in-memory counter resets on restart.
function reserveCreate(agentId, limit, windowMs, now) {
  const kept = (creations.get(agentId) ?? []).filter((t) => now - t < windowMs)
  if (kept.length >= limit) {
    creations.set(agentId, kept)
    return { allowed: false, used: kept.length }
  }
  kept.push(now)
  creations.set(agentId, kept)
  return { allowed: true, used: kept.length }
}

// RU: Освобождать резерв только неудавшегося создания; успешное учитывается до выхода из окна.
// EN: Release only a failed creation reservation; successful creation remains counted until it leaves the window.
// RU: Снимается ровно одна метка: два создания в одну миллисекунду, одно неудачное — освобождается одно место, а не оба (аудит №19).
// EN: Exactly one mark is removed: two creations in the same millisecond, one failed — one slot is freed, not both (audit #19).
function releaseCreate(agentId, now) {
  const kept = creations.get(agentId) ?? []
  const i = kept.indexOf(now)
  if (i >= 0) kept.splice(i, 1)
  creations.set(agentId, kept)
}

const HEARTBEAT_HUMAN_KINDS_DEFAULT = ['user', 'a2a', 'agent-message']

const HEARTBEAT_REZYUME_DEFAULT = true

const LIMITS_DIR = process.env.AGENT_LIMITS_DIR || './limits'

// RU: Fallback ограничивает создание одной целью/час, интервал часом, полосой1 и сутками1 на сессию. Поля, которых нет в этом объекте, не дополняются обычными defaults в отказной ветке.
// EN: Fallback limits creation to one goal/hour, delay to one hour, streak to one and daily activity to one per session. Fields absent from this object are not filled from ordinary defaults on failure.
const STROGO = {
  createLimitCount: 1,
  createWindowMinutes: 60,
  blockAfterRoundsCount: 3,
  minIntervalSeconds: 3600,
  maxConsecutiveCount: 1,
  maxPerDayCount: 1,
  dayZone: 'UTC',
  humanKinds: ['user'],
}

const _limitsCache = { mtimeA: 0, mtimeO: 0, dannye: null, key: '' }

// RU: Прочитать defaults, общий YAML и YAML агента в этом порядке, вернуть источник каждого значения. Ошибка чтения даёт строгий fallback; синтаксически допустимые значения отдельно не типизируются. Кэш замечает mtime только при вызове этой функции.
// EN: Read defaults, shared YAML and agent YAML in that order, returning each value source. Read failure uses strict fallback; syntactically valid values are not independently typed. The cache observes mtime only when this function is called.
function chitatPredely(agent, umolchaniya, limitsDir = LIMITS_DIR) {
  const putA = `${limitsDir}/${agent}.yml`
  const putO = `${limitsDir}/obshchee.yml`
  const stat = (p) => { try { return statSync(p).mtimeMs } catch { return 0 } }
  const mA = stat(putA)
  const mO = stat(putO)
  const key = `${limitsDir}/${agent}`
  if (_limitsCache.key !== key) { _limitsCache.dannye = null; _limitsCache.key = key }
  if (_limitsCache.dannye && _limitsCache.mtimeA === mA && _limitsCache.mtimeO === mO) {
    return _limitsCache.dannye
  }
  let YAML
  try {

    YAML = createRequire(import.meta.url)('yaml')
  } catch (e) {
    const itog = { znach: { ...STROGO }, ist: {}, beda: `модуля yaml нет (${e?.code ?? e})` }
    for (const k of Object.keys(STROGO)) itog.ist[k] = 'САМЫЙ СТРОГИЙ (читать нечем)'
    _limitsCache.dannye = itog; _limitsCache.mtimeA = mA; _limitsCache.mtimeO = mO
    return itog
  }
  const razobrat = (p) => {
    if (!p) return null
    try { return YAML.parse(readFileSync(p, 'utf-8')) ?? {} } catch (e) { throw new Error(`${p}: ${e?.message ?? e}`) }
  }
  let dA = null, dO = null
  try {
    dA = mA ? razobrat(putA) : null
    dO = mO ? razobrat(putO) : null
  } catch (e) {
    const itog = { znach: { ...STROGO }, ist: {}, beda: `файл не разбирается — ${e.message}` }
    for (const k of Object.keys(STROGO)) itog.ist[k] = 'САМЫЙ СТРОГИЙ (файл битый)'
    _limitsCache.dannye = itog; _limitsCache.mtimeA = mA; _limitsCache.mtimeO = mO
    return itog
  }
  if (dA === null && dO === null) {
    const itog = { znach: { ...STROGO }, ist: {}, beda: `файлов нет (${putA}, ${putO})` }
    for (const k of Object.keys(STROGO)) itog.ist[k] = 'САМЫЙ СТРОГИЙ (файла нет)'
    _limitsCache.dannye = itog; _limitsCache.mtimeA = mA; _limitsCache.mtimeO = mO
    return itog
  }
  const znach = {}, ist = {}
  for (const [k, v] of Object.entries(umolchaniya)) { znach[k] = v; ist[k] = 'умолчание кода' }
  for (const [istochnik, d] of [[putO, dO], [putA, dA]]) {
    if (!d) continue
    for (const razdel of ['predely', 'politiki']) {
      for (const [k, v] of Object.entries(d[razdel] ?? {})) {
        if (k in znach) { znach[k] = v; ist[k] = istochnik }
      }
    }
  }
  const itog = { znach, ist, beda: null }
  _limitsCache.dannye = itog; _limitsCache.mtimeA = mA; _limitsCache.mtimeO = mO
  return itog
}

// RU: Собрать причинную последовательность ходов из событий; счёт зависит от того, как платформа маркирует доставку.
// EN: Build the causal turn sequence from events; counting depends on platform delivery markers.
function turnLedger(events, humanKinds) {
  const turns = []
  let dispatched = false

  let dispatchAt
  let current
  for (const e of events) {
    const t = e?.type
    if (t === 'schedule/change') {
      if (e.data?.operation === 'dispatch') { dispatched = true; dispatchAt = e.time }
      continue
    }
    if (t === 'turn/start') {
      current = {
        turn: e.data?.turn,
        autonomous: dispatched,
        human: false,
        at: e.time,
        dispatchAt: dispatched ? dispatchAt : undefined,
      }
      turns.push(current)
      dispatched = false
      dispatchAt = undefined
      continue
    }
    if (t === 'turn/end') { current = undefined; dispatched = false; dispatchAt = undefined; continue }

    if (dostavkaNovoj(e)) {
      if (current !== undefined) {
        if (!current.autonomous) { current.autonomous = true; current.dispatchAt = e.time }
      } else { dispatched = true; dispatchAt = e.time }
      continue
    }
    if (t === 'user/message' && current !== undefined
      && humanKinds.has(e.data?.source?.kind)) current.human = true
  }
  return turns
}

// RU: Вывести календарные сутки в заданном часовом поясе; неверный пояс вызывает ошибку Intl, это не UTC fallback.
// EN: Derive the calendar day in the configured time zone; an invalid zone throws an Intl error rather than falling back to UTC.
function dayKeyFactory(zone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return (ms) => fmt.format(ms)
}

// RU: Считать полосу, сутки и ходы из сохранённых событий одной сессии; несколько корней имеют отдельные бюджеты.
// EN: Count the streak, daily deliveries and turns from one session history; multiple roots have separate budgets.
function heartbeatCounters(events, zone, now, humanKinds) {
  const turns = turnLedger(events, humanKinds)
  let streak = 0
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const t = turns[i]
    if (t.human || !t.autonomous) break
    streak += 1
  }
  const dayKey = dayKeyFactory(zone)
  const today = dayKey(now)
  let perDay = 0
  for (const e of events) {
    if (((e?.type === 'schedule/change' && e.data?.operation === 'dispatch') || dostavkaNovoj(e))
      && dayKey(e.time) === today) perDay += 1
  }
  return { streak, perDay, turns: turns.length }
}

// RU: Сверить дневной счёт с независимой историей schedule, по 100 записей на напоминание. Это нижняя оценка: старые/удалённые записи могут быть вне охвата; отсутствие API возвращает null.
// EN: Compare daily counts with independent scheduler history, up to 100 records per reminder. This is a lower bound: old or deleted records can be outside coverage; missing APIs return null.
async function svidetelDostavok(ctx, agent, zone, now, zhurnalZaSutki) {
  const sched = typeof ctx?.get === 'function' ? ctx.get('schedule') : undefined
  if (typeof sched?.catalog !== 'function' || typeof sched?.history !== 'function') return null
  const sessionId = agent?.session?.id
  const dayKey = dayKeyFactory(zone)
  const today = dayKey(now)
  try {
    const soobshcheniya = new Set()
    for (const t of await sched.catalog()) {
      if (t?.sessionId !== sessionId) continue
      const h = await sched.history({ sessionId, id: t.id, limit: 100 })
      for (const r of h?.records ?? []) {
        if (dayKey(Date.parse(r.deliveredAt)) === today) soobshcheniya.add(r.messageId)
      }
    }
    const zaSutki = soobshcheniya.size
    return {
      zaSutki,
      slep: zaSutki > zhurnalZaSutki,
      prichina: `по истории подсистемы доставок за сутки ${zaSutki}, журнал сессии видит ${zhurnalZaSutki}`,
    }
  } catch (e) {
    return { zaSutki: undefined, slep: true, prichina: `свидетель не прочитан: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}

const schyotNeVidenSkazano = new Map()

// RU: Называть слепоту счётчика в журнале и через отправщик; только успешная отправка начинает суточную выдержку.
// EN: Report counter blindness in logs and through the sender; only successful delivery starts the daily cooldown.
function trevogaSchyotNeViden(agentId, prichina, alertCommand = process.env.DSH_ALERT_CMD || '') {
  const text = `🔴 DSH ${agentId}: счёт пробуждений НЕ ВИДЕН — пределы самопробуждения не действуют `
    + `(${prichina}). Цикл гашу: при неизвестном счёте решение по умолчанию — не будить.`
  log(text)
  const teper = Date.now()
  const bylo = schyotNeVidenSkazano.get(agentId)
  if (bylo !== undefined && teper - bylo < TREVOGA_POVTOR_MS) {
    log(`тревога «счёт не виден» ${agentId} подавлена выдержкой: сказано ${Math.round((teper - bylo) / 1000)} с назад`)
    return
  }
  const put = alertCommand
  if (!existsSync(put)) {
    log(`🔴 тревога «счёт не виден» НЕ отправлена: отправщика нет (${put})`)
    return
  }
  // RU: Асинхронно, как у тревоги о пропаже источника (аудит №7): место выдержки сразу, при отказе возвращается.
  // EN: Asynchronous, like the source-loss alert (audit #7): the cooldown slot is taken at once and released on failure.
  schyotNeVidenSkazano.set(agentId, teper)
  execFile(put, [text], { timeout: 30000 }, (e) => {
    if (!e) return
    if (schyotNeVidenSkazano.get(agentId) === teper) { if (bylo === undefined) schyotNeVidenSkazano.delete(agentId); else schyotNeVidenSkazano.set(agentId, bylo) }
    log(`🔴 тревога «счёт не виден» НЕ ушла: ${String(e?.message ?? e).slice(0, 120)}`)
  })
}

// RU: B-N-1857: решить, что делать, когда свидетель опережает журнал. Отставание (до terpenie с первого замеченного) — не остановка:
// RU: суточный счёт по большему; держится terpenie и дольше — остановка, как прежде (слепота журнала). Свидетель не прочитан
// RU: (zaSutki нет) — остановка сразу, как прежде. Сошлось — отметка начала снимается (новое расхождение считается заново).
// EN: B-N-1857: decide what to do when the witness is ahead of the journal. A lag (under terpenie since first seen) is not a stop: the
// EN: daily count takes the larger; lasting terpenie or longer — stop as before (journal blindness). Unread witness (no zaSutki) —
// EN: stop at once as before. Converged — the start mark is cleared (a new divergence counts afresh).
function reshenieSvidetelya(nachalo, sid, svid, perDay, now, terpenie) {
  if (!svid?.slep) {
    nachalo.delete(sid)
    return { stop: false, perDayEff: perDay, stroka: '' }
  }
  if (typeof svid.zaSutki !== 'number') return { stop: true, perDayEff: perDay, stroka: 'свидетель не прочитан' }
  if (!nachalo.has(sid)) nachalo.set(sid, now)
  const dlitsya = now - nachalo.get(sid)
  const perDayEff = Math.max(perDay, svid.zaSutki)
  if (dlitsya < terpenie) {
    return { stop: false, perDayEff,
      stroka: `свидетель опережает журнал ${Math.round(dlitsya / 1000)} с из ${Math.round(terpenie / 1000)} — жду схождения, `
        + `сутки считаю по большему: ${perDayEff}` }
  }
  return { stop: true, perDayEff, stroka: `несходимость держится ${Math.round(dlitsya / 1000)} с ≥ ${Math.round(terpenie / 1000)}` }
}

// RU: Отображать время в выбранном поясе для резюме, не исправлять неверную конфигурацию молча.
// EN: Display summary times in the selected zone without silently repairing invalid configuration.
function chasyMinuty(zone) {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return (ms) => fmt.format(ms)
}

// RU: Выделить текущую автономную полосу по структуре ходов; текст сообщений не интерпретируется как сигнал.
// EN: Identify the current autonomous streak from turn structure; message text is not interpreted as a signal.
function tekushchayaPolosa(events, humanKinds) {
  const turns = turnLedger(events, humanKinds)
  return sobratPolosu(turns, turns.length - 1)
}

// RU: Распознать первый внешний ход после автономной полосы, чтобы резюме не печаталось на каждом следующем ходе.
// EN: Recognize the first external turn after an autonomous streak so the summary is not repeated on every later turn.
function polosaKotoraiaOborvalas(events, humanKinds) {
  const turns = turnLedger(events, humanKinds)
  if (turns.length === 0) return null
  const posledniy = turns[turns.length - 1]

  if (posledniy.autonomous && !posledniy.human) return null
  return sobratPolosu(turns, turns.length - 2)
}

// RU: Собрать диапазон, число ходов и краткую статистику полосы; содержательный итог сообщает сам агент.
// EN: Collect the streak range, turn count and statistics; the agent supplies its substantive outcome.
function sobratPolosu(turns, ot) {
  const polosa = []
  for (let i = ot; i >= 0; i -= 1) {
    const t = turns[i]
    if (t.human || !t.autonomous) break
    polosa.unshift(t)
  }
  if (polosa.length === 0) return null
  const vremia = (t) => t.dispatchAt ?? t.at
  return {
    n: polosa.length,
    ot: vremia(polosa[0]),
    do: vremia(polosa[polosa.length - 1]),
  }
}

// RU: Форматировать измеренный диапазон и итог одним текстом для журнала и уведомления. Нет объявления — значит только, что
// агент не позвал закрытие полосы, а не что работа потеряна (B-N-2097). Разные локальные сутки начала и конца — обе полные даты.
// EN: Format the measured range and outcome as one text shared by logs and notices. No declaration means only that the agent did
// not close the streak, not that work was lost (B-N-2097). Start and end on different local days — both full dates are printed.
function tekstRezyume(p, itog, zone) {
  const vr = chasyMinuty(zone)
  const den = dayKeyFactory(zone)
  const data = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' })
  const polnoe = (ms) => `${data.format(ms)} ${vr(ms)} (${zone})`
  const raznye = den(p.ot) !== den(p.do)
  const ot = raznye ? polnoe(p.ot) : vr(p.ot)
  const doo = raznye ? polnoe(p.do) : vr(p.do)
  const obyavleno = typeof itog === 'string' && itog !== ''
  const NE_OBYAVLEN = 'итог агентом не объявлен — см. ответ хода'
  if (p.n === 1) {
    return obyavleno
      ? `одиночное автономное пробуждение в ${ot} закрыто агентом (полоса из 1): ${itog}`
      : `одиночное автономное пробуждение в ${ot} (полоса из 1): ${NE_OBYAVLEN}`
  }
  return obyavleno
    ? `полоса из ${p.n} закрыта агентом, с ${ot} до ${doo}: ${itog}`
    : `полоса из ${p.n}, с ${ot} до ${doo}: ${NE_OBYAVLEN}`
}

const otmetkiObyavleniya = new Map()

// RU: Привязать файл отметки к сессии и границе полосы; ссылка на один session ID недостаточна.
// EN: Bind the marker filename to both session and streak boundary; one session ID is insufficient.
function putOtmetki(dir, sid, kluch) {
  return `${dir}/.polosa-zakryta-${encodeURIComponent(sid)}-${kluch}`
}

// RU: Хранить объявленное резюме в файле при настроенном каталоге, иначе в памяти процесса. Файловая отметка переживает рестарт, память — нет.
// EN: Store the announced summary in a file when a notice directory is configured, otherwise in process memory. File markers survive restart; memory markers do not.
function postavitOtmetku(limits, sid, kluch, itog) {
  if (limits.heartbeatNoticeDir === '') {
    otmetkiObyavleniya.set(sid, kluch)
    return 'в памяти процесса: каталог писем не задан'
  }
  try {
    mkdirSync(limits.heartbeatNoticeDir, { recursive: true })
    writeFileSync(putOtmetki(limits.heartbeatNoticeDir, sid, kluch), `${itog}\n`)
    return `в ${limits.heartbeatNoticeDir}`
  } catch (e) {

    otmetkiObyavleniya.set(sid, kluch)
    return `🔴 в памяти процесса: файл не записан (${e?.message ?? e})`
  }
}

// RU: Потребить отметку именно закрывшейся полосы и удалить её, чтобы она не подавила будущую.
// EN: Consume and remove the marker for the streak just closed so it cannot suppress a future summary.
function snyatOtmetku(limits, sid, kluch) {
  let bylo = false
  if (otmetkiObyavleniya.get(sid) === kluch) { otmetkiObyavleniya.delete(sid); bylo = true }
  if (limits.heartbeatNoticeDir !== '') {
    const f = putOtmetki(limits.heartbeatNoticeDir, sid, kluch)
    try {
      if (existsSync(f)) { unlinkSync(f); bylo = true }
    } catch {                                                                 }
  }
  return bylo
}

// RU: Считать доставки в скользящем часовом окне и срок освобождения первого места.
// EN: Count deliveries in the rolling hourly window and when the first slot becomes free.
function udarovVOkne(events, oknoMs, now) {
  const granica = now - oknoMs
  const vremena = []
  for (const e of events) {
    if (((e?.type === 'schedule/change' && e.data?.operation === 'dispatch') || dostavkaNovoj(e))
      && typeof e.time === 'number' && e.time >= granica) vremena.push(e.time)
  }
  vremena.sort((a, b) => a - b)

  const osvoboditsya = vremena.length === 0 ? now : vremena[0] + oknoMs
  return { chislo: vremena.length, osvoboditsya }
}

// RU: Показать ступени интервала из единого минимального основания, без второго источника политики.
// EN: Show interval steps derived from one minimum base without introducing another policy source.
function stupeniKratko(limits) {
  const n = limits.heartbeatMaxConsecutive
  const sh = (i) => pochelovecheski(limits.heartbeatMinIntervalSeconds * i)
  if (n <= 4) return Array.from({ length: n }, (_, i) => sh(i + 1)).join(', ')
  return `${sh(1)}, ${sh(2)}, ${sh(3)} … ${sh(n)} (ступеней ${n})`
}

// RU: Вычислить оценку длины полосы из интервала и потолка, не выдавать её за измеренное время работы.
// EN: Estimate streak duration from interval and ceiling without presenting it as measured runtime.
function dlinaPolosy(limits) {
  const n = limits.heartbeatMaxConsecutive
  return limits.heartbeatRezhim === 'ravnomerno'
    ? limits.heartbeatRavnomernoSeconds * n
    : limits.heartbeatMinIntervalSeconds * (n * (n + 1)) / 2
}

// RU: Лестница умножает minimum на номер ступени; равномерный режим берёт свой интервал. Выбирается не раньше запроса модели.
// EN: The ladder multiplies the minimum by the step index; uniform mode uses its interval. The chosen delay is never earlier than the model request.
function vychislitInterval(zaprosSeconds, streak, limits) {
  const rovno = limits.heartbeatRezhim === 'ravnomerno'
  const stupen = rovno ? 0 : Math.min(streak, Math.max(limits.heartbeatMaxConsecutive - 1, 0)) + 1
  const nado = rovno
    ? limits.heartbeatRavnomernoSeconds
    : limits.heartbeatMinIntervalSeconds * stupen
  const zapros = typeof zaprosSeconds === 'number' ? zaprosSeconds : 0
  if (zapros >= nado) return { sekundy: zapros, pravlen: false, nado, stupen, rovno }
  return { sekundy: nado, pravlen: true, nado, stupen, rovno }
}

// RU: Печатать несовместимые настройки как диагностику; сообщения не переписывают файлы и не валидируют все типы.
// EN: Report conflicting settings diagnostically; messages neither rewrite files nor validate every type.
function protivorechiyaKonfiga(limits) {
  const out = []
  const podryad = limits.heartbeatMaxConsecutive
  const vSutki = limits.heartbeatMaxPerDay
  if (podryad >= vSutki) {
    out.push(`предел подряд ${podryad} не меньше суточного ${vSutki}: полоса оборвётся `
      + 'суточным потолком раньше, чем дойдёт до своего предела — то есть предел подряд недостижим')
  }
  if (limits.heartbeatRezhim === 'ravnomerno'
    && limits.heartbeatRavnomernoSeconds < limits.heartbeatMinIntervalSeconds) {
    out.push(`ровный тик ${limits.heartbeatRavnomernoSeconds} с чаще минимального интервала `
      + `${limits.heartbeatMinIntervalSeconds} с: каждая постановка будет отвергнута стражем`)
  }

  return out
}

// RU: Запретить cron, частые повторы и создание/изменение повторов при полном часовом окне. Одноразовый срок отодвигается; завершение хода проверяет уже действующие расписания.
// EN: Reject cron, frequent repeats and recurring creation/updates at a full hourly window. One-shot delays are extended; turn end checks existing schedules.
// RU: Срок at → миллисекунды UTC: RFC 3339 со смещением или {date, time, time_zone} местного времени (IANA). Неразборчивое — NaN (аудит №6).
// EN: The at deadline → UTC milliseconds: RFC 3339 with an offset or local {date, time, time_zone} (IANA). Unparseable — NaN (audit #6).
function momentAt(at) {
  if (typeof at === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(at)) return NaN
    return Date.parse(at)
  }
  if (!at || typeof at !== 'object' || typeof at.date !== 'string' || typeof at.time !== 'string' || typeof at.time_zone !== 'string') return NaN
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at.date), t = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(at.time)
  if (!d || !t) return NaN
  const kakUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +(t[3] ?? 0), +(t[4] ?? '0').padEnd(3, '0'))
  let fmt
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: at.time_zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return NaN }
  const sdvig = (ms) => { const c = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+c.year, +c.month - 1, +c.day, +c.hour, +c.minute, +c.second) - Math.floor(ms / 1000) * 1000 }
  return kakUtc - sdvig(kakUtc - sdvig(kakUtc))
}

function heartbeatGuard(args, limits, agents, agentId) {

  if (args?.cron !== undefined) {
    throw new Error(
      'cron через мост не принимается: его частоту мост не проверяет против предела хоста (не чаще раза в '
      + limits.heartbeatMinIntervalSeconds + ' с). Повторяющееся — every_seconds не меньше '
      + limits.heartbeatMinIntervalSeconds + ', daily или weekly.',
    )
  }
  const every = args?.every_seconds
  if (every !== undefined) {
    if (!(typeof every === 'number' && every >= limits.heartbeatMinIntervalSeconds)) throw new Error(
    `повторяющееся напоминание не чаще раза в ${limits.heartbeatMinIntervalSeconds} с — `
    + `это предел хоста, а не ошибка (запрошено ${every}). Платформенный минимум 60 с снят с другой задачи: `
    + 'он для коротких рабочих циклов под присмотром, а фоновое самопробуждение раз в минуту — это 1440 ходов в сутки. '
      + 'Нужен более частый цикл — он должен идти под присмотром человека, а не будильником.',
    )
  }

  // RU: Одноразовое at проходит ту же лесенку и часовой потолок, что after_seconds: срок пересчитан в задержку от сейчас; поднятый сторожем — заменяет at на after_seconds, не поднятый — at остаётся точным (аудит №6).
  // EN: A one-shot at goes through the same ladder and hourly ceiling as after_seconds: the deadline becomes a delay from now; if the guard raises it, at is replaced with after_seconds, otherwise at keeps its precise deadline — audit #6.
  let zapros = args?.after_seconds
  const sAt = args?.at !== undefined && zapros === undefined
  if (sAt) {
    const cel = momentAt(args.at)
    if (!Number.isFinite(cel)) throw new Error('at не разобран: нужен RFC 3339 со смещением или {date, time, time_zone} — либо after_seconds')
    zapros = Math.max(0, Math.ceil((cel - Date.now()) / 1000))
  }
  const repeating = every !== undefined || args?.daily !== undefined || args?.weekly !== undefined
  if (typeof zapros !== 'number' && !(repeating && limits.heartbeatMaxVChas > 0)) return
  const agent = typeof agents?.get === 'function' ? agents.get(String(agentId)) : undefined
  const events = sobytiyaSessii(agent)
  if (!Array.isArray(events)) {
    if (repeating) throw new Error('часовой предел: журнал сессии недоступен — повтор отклонён')

    const bezopasno = HEARTBEAT_OTKAZ_SEKUND
    log(`🔴 режим интервала: журнал сессии ${agentId} недоступен — ни одна из мер `
      + `(подряд, за сутки, за час) не вычисляется. Просили ${zapros} с, ставлю ${bezopasno} с: `
      + `при неизвестных пределах решение по умолчанию — НЕ БУДИТЬ`)
    trevogaOtkazIstochnika(agentId, zapros, bezopasno, limits.alertCommand)
    args.after_seconds = bezopasno
    if (sAt) delete args.at

    return `журнал сессии недоступен: просили ${zapros} с, поставлено ${bezopasno} с — `
      + `при неизвестных пределах решение по умолчанию НЕ БУДИТЬ. Полоса прервана намеренно.`
  }
  otmetitVozvratIstochnika(agentId)
  const now = Date.now()
  const c = heartbeatCounters(events, limits.heartbeatDayZone, now, limits.heartbeatHumanKinds)
  if (repeating) {
    const okno = udarovVOkne(events, HEARTBEAT_OKNO_CHASA_MS, now)
    if (limits.heartbeatMaxVChas > 0 && okno.chislo >= limits.heartbeatMaxVChas) {
      throw new Error(`часовой потолок ${limits.heartbeatMaxVChas} исчерпан (в окне ${okno.chislo}) — повтор отклонён`)
    }
    return
  }
  const r = vychislitInterval(zapros, c.streak, limits)
  let itog = r.sekundy
  let prichina = r.rovno
    ? `режим ровного тика ${limits.heartbeatRavnomernoSeconds} с`
    : `лесенка, ступень ${r.stupen} из ${limits.heartbeatMaxConsecutive}`

  if (limits.heartbeatMaxVChas > 0) {
    const okno = udarovVOkne(events, HEARTBEAT_OKNO_CHASA_MS, now)
    if (okno.chislo >= limits.heartbeatMaxVChas) {
      const nuzhno = Math.ceil((okno.osvoboditsya - now) / 1000)
      if (nuzhno > itog) {
        itog = nuzhno
        prichina += `; часовой потолок ${limits.heartbeatMaxVChas} исчерпан `
          + `(в окне ${okno.chislo}), место освободится через ${nuzhno} с`
      }
    }
  }

  if (itog !== zapros) {
    args.after_seconds = itog
    if (sAt) delete args.at

    const poyasnenie = `просили ${zapros} с, поставлено ${itog} с — ${prichina}`
    log(`режим интервала: ${poyasnenie}`)
    return poyasnenie
  }

}

// RU: Журналировать итог всегда, файл писать только при явном каталоге. Ошибка файла не стирает текст из журнала.
// EN: Always log the summary and write a file only for an explicit directory. File failure does not remove the logged text.
function napechatatRezyume(agent, p, itog, limits, povod) {
  const sid = String(agent?.id ?? '?')
  const stroka = tekstRezyume(p, itog, limits.heartbeatDayZone)
  log(`резюме полосы ${sid} (${povod}): ${stroka}`)
  if (limits.heartbeatNoticeDir === '') return
  try {
    mkdirSync(limits.heartbeatNoticeDir, { recursive: true })
    const file = `${limits.heartbeatNoticeDir}/${Date.now()}-rezyume-polosy.txt`
    writeFileSync(file, `[резюме полосы] сессия ${sid}\n\n${stroka}\n`)
    log(`резюме полосы ${sid}: письмо владельцу положено в ${file}`)
  } catch (e) {

    log(`🔴 резюме полосы ${sid}: письмо в ${limits.heartbeatNoticeDir} НЕ ЗАПИСАНО (${e?.message ?? e}). Текст: ${stroka}`)
  }
}

// RU: Печатать резюме только первого внешнего хода и только если агент не объявил его ранее.
// EN: Print the summary only on the first external turn and only if the agent has not already announced it.
function rezyumeNaKonceHoda(agent, limits, snyat, pechat) {
  const sid = String(agent?.id ?? '?')
  const p = polosaKotoraiaOborvalas(sobytiyaSessii(agent) ?? [], limits.heartbeatHumanKinds)
  if (p === null) return { pechatali: false, prichina: 'полосы, которая только что оборвалась, нет' }

  if (snyat(limits, sid, p.do)) {
    return { pechatali: false, prichina: 'итог уже объявлен агентом', polosa: p }
  }
  pechat(agent, p, '', limits, 'оборвана внешним словом')
  return { pechatali: true, polosa: p }
}

// RU: Явный непустой итог записать немедленно и отметить; без полосы вернуть closed=false, не придумывая событие.
// EN: Record a nonempty explicit outcome immediately and mark it; without a streak return closed=false rather than inventing an event.
function zakrytPolosu(agent, summary, limits) {
  const sid = String(agent?.id ?? '?')
  const itog = summary.trim()
  const p = tekushchayaPolosa(sobytiyaSessii(agent) ?? [], limits.heartbeatHumanKinds)
  if (p === null) {
    log(`резюме полосы ${sid}: закрывать было нечего — автономных пробуждений подряд нет`)
    return { closed: false, streak: 0, reason: 'полосы автономных пробуждений сейчас нет' }
  }
  if (itog === '') {

    log(`🔴 резюме полосы ${sid}: итог пуст — объявление не принято, полоса ${p.n} осталась без объявления`)
    return { closed: false, streak: p.n, reason: 'итог пуст: скажите одной-двумя фразами, чем кончилась полоса' }
  }
  napechatatRezyume(agent, p, itog, limits, 'закрыта агентом')
  const gde = postavitOtmetku(limits, sid, p.do, itog)
  log(`резюме полосы ${sid}: отметка объявления ${gde}`)
  return { closed: true, streak: p.n, from: p.ot, to: p.do, summary: itog }
}

// RU: Поставить in-flight отметку до await и снять только если callback вернул false. Исключение callback оставляет marker; следующие концы хода могут пропустить повтор.
// EN: Set the in-flight marker before awaiting and remove it only when the callback returns false. A thrown callback leaves the marker; later turn ends can skip retries.
async function ostanovkaOdinRaz(stopped, sid, ostanovit) {
  if (stopped.has(sid)) return
  stopped.add(sid)
  if (!(await ostanovit())) stopped.delete(sid)
}

// RU: После конца хода снять каждое напоминание, считать только deleted:true. Отказ или исключение не мешает остальным удалениям и возвращает false для повтора на следующем конце хода. Текущий ход не прерывается.
// EN: After turn end, attempt every deletion and count only deleted:true. Refusal or exception allows other deletions and returns false for retry at the next turn end. The current turn is not interrupted.
async function stopHeartbeat(ctx, agent, why, counters, limits, rootCount) {
  const sid = String(agent?.id ?? '?')
  const removed = []
  let failure
  try {
    const list = await nativeCall(ctx, agent, 'schedule_list', {})
    if (!Array.isArray(list)) throw new Error(`schedule_list вернул не список: ${JSON.stringify(list).slice(0, 200)}`)
    const failed = []
    for (const rec of list) {
      try {
        const r = await nativeCall(ctx, agent, 'schedule_delete', { id: rec.id })
        if (r?.deleted !== true) throw new Error(`НЕ снято: ${r?.code ?? 'deleted не true'}`)
        removed.push(`${rec.id} (${rec.kind}${rec.everySeconds === undefined ? '' : `, каждые ${rec.everySeconds} с`}) — снято`)
      } catch (e) {
        failed.push(`${rec.id}: ${e?.message ?? e}`)
      }
    }
    if (failed.length) failure = failed.join('; ')
  } catch (e) {
    failure = String(e?.message ?? e)
  }
  if (failure !== undefined) log(`🔴 предел самопробуждения: гашение для ${sid} НЕ УДАЛОСЬ: ${failure}`)
  log(`🔴 предел самопробуждения для ${sid}: ${why}; снято напоминаний ${removed.length}`
    + (removed.length ? `: ${removed.join('; ')}` : ''))

  const text = [
    `[предел остановки] сессия ${sid}`,
    '',
    `Остановилась по пределу самопробуждения: ${why}.`,
    `Считано по журналу сессии: подряд автономных пробуждений ${counters.streak} `
      + `(предел ${limits.heartbeatMaxConsecutive}), за текущие сутки ${counters.perDay} `
      + `(предел ${limits.heartbeatMaxPerDay} НА СЕССИЮ, пояс ${limits.heartbeatDayZone}).`,
    `🔴 Предел 48 в сутки — на СЕССИЮ, а не на агента. Живых корневых сессий сейчас ${rootCount}, `
      + `то есть суммарный потолок агента ${rootCount * limits.heartbeatMaxPerDay} пробуждений в сутки.`,
    '',
    removed.length
      ? `Снято активных напоминаний ${removed.length}: ${removed.join('; ')}.`
      : (failure === undefined ? 'Активных напоминаний на момент остановки не было — снимать было нечего.' : 'Снято активных напоминаний 0.'),
    failure === undefined
      ? ''
      : `🔴 ГАШЕНИЕ НЕ УДАЛОСЬ: ${failure}. Напоминания могли остаться живыми — снимите их рукой.`,
    '',
    'Что сделано за полосу — в моих отчётах и в журнале сессии. Продолжу по слову.',
  ].filter((l) => l !== '').join('\n')

  if (limits.heartbeatNoticeDir === '') {

    log(`предел самопробуждения: каталог письма не задан, текст целиком в журнал: ${text.replace(/\n/g, ' | ')}`)
    return failure === undefined
  }
  try {
    mkdirSync(limits.heartbeatNoticeDir, { recursive: true })
    const file = `${limits.heartbeatNoticeDir}/${Date.now()}-predel-heartbeat.txt`
    writeFileSync(file, `${text}\n`)
    log(`предел самопробуждения: письмо владельцу положено в ${file}`)
    return failure === undefined
  } catch (e) {

    log(`🔴 предел самопробуждения: письмо в ${limits.heartbeatNoticeDir} НЕ ЗАПИСАНО (${e?.message ?? e}). Текст целиком: ${text.replace(/\n/g, ' | ')}`)
    return false
  }
}

// RU: Заново проверить каталог владельца пропуска, применить полномочие и guard, зарезервировать создание до await. Закреплённые операции идут remote/local/native; остальные проходят полный tools.execute.
// EN: Recheck the ticket owner catalog, apply authority and guard, and reserve creation before awaiting. Fixed operations use remote/local/native dispatch; other tools traverse full tools.execute.
async function callTool(ctx, agents, toolName, agentId, args, limits) {

  if (!naborDlyaAgenta(ctx.get('tools'), agents?.get?.(agentId)).some((t) => t.name === toolName)) {
    throw new Error(`инструмент "${toolName}" не выдан этому агенту (нет в перечне моста для него) — вызов отклонён`)
  }
  const exec = EXEC[toolName] ?? (!TOOLS.some((t) => t.name === toolName)
    ? { authority: 'none', platform: true } : undefined)
  if (!exec) throw new Error(`инструмент "${toolName}" не выставлен мостом`)

  let execution
  if (exec.authority === 'turn' || exec.authority === 'human') {
    execution = bridgeExecution(agents, agentId)
    if (exec.authority === 'human') requireDirectHuman(agents, execution)
  }

  const pravkaIntervala = exec.guard ? exec.guard(args, limits, agents, agentId) : undefined

  let reserved
  if (exec.counted) {
    const now = Date.now()
    const r = reserveCreate(agentId, limits.createLimit, limits.createWindowMs, now)

    if (!r.allowed) {
      log(`🔴 создание цели: сессия=${agentId} — ОТКАЗ, потолок ${limits.createLimit} за ${limits.createWindowMs / 60000} мин исчерпан (занято ${r.used})`)
      throw new Error(
        `потолок создания целей исчерпан: ${limits.createLimit} за ${limits.createWindowMs / 60000} мин. ` +
        'Это предел хоста, а не ошибка: он освобождается по мере ухода старых записей из окна. ' +
        'Обходить его нечем и не надо — работай по уже поставленной цели или дождись окна.',
      )
    }
    reserved = now
    log(`создание цели: сессия=${agentId} — разрешено (занято ${r.used} из ${limits.createLimit} за ${limits.createWindowMs / 60000} мин)`)
  }

  const prilozhit = (znachenie) => {
    if (pravkaIntervala === undefined || znachenie === null || typeof znachenie !== 'object') return znachenie
    return Array.isArray(znachenie) ? znachenie : { ...znachenie, pravkaIntervala }
  }

  try {
    if (exec.dispatch) return prilozhit(await exec.dispatch(ctx, agents, agentId, args, limits))
    if (exec.remote) return prilozhit(await remoteCall(ctx, exec.remote.namespace, exec.remote.method, exec.remote.build(args, ctx), agentId))

    const agent = execution?.agent ?? agents.get(String(agentId))
    if (!agent) throw new Error(`живой агент "${agentId}" не найден в реестре`)

    if (exec.platform) {
      const registry = ctx.get('tools')
      if (typeof registry?.execute !== 'function') throw new Error('platform tool executor unavailable')

      const result = await registry.execute({
        name: toolName, arguments: args, agent,
        callId: `bridge-${randomBytes(12).toString('hex')}`,
        signal: new AbortController().signal,
      })
      if (result.isError) throw new Error(JSON.stringify(result))
      return prilozhit(result)
    }
    if (exec.native) return prilozhit(await nativeCall(ctx, agent, toolName, args))
    return prilozhit(await exec.local(ctx, agent, args, limits))
  } catch (e) {
    if (reserved !== undefined) {
      releaseCreate(agentId, reserved)
      log(`создание цели: сессия=${agentId} — не удалось, место освобождено`)
    }
    throw e
  }
}

let mounted = false

// RU: Захватить один слушатель на процесс и немедленно зарегистрировать очистку Cordis. Предоставить descriptor до готовности порта; ранний запрос вернёт undefined. Политика читается при монтаже, поэтому для нового YAML требуется перемонтирование.
// EN: Claim one listener per process and immediately register Cordis cleanup. Provide descriptor before the port is ready; an early request returns undefined. Policy is read at mount, so changed YAML requires remounting.
export function apply(ctx, config) {
  if (mounted) {
    log('повторное монтирование при живой точке входа — пропускаю')
    return
  }
  mounted = true

  let server = null
  try {
    ctx.effect?.(() => () => {
      mounted = false
      try { server?.close() } catch {                                            }
    })
  } catch {                                                                   }

  // RU: Находка Авроры к №6 (A-N-1948, 10.10): ошибка настройки одного ostrov-инструмента не роняет мост — инструмент не ставится,
  // RU: громкая строка в журнал, прочие инструменты живут. Все проверки installOstrovApi — до регистрации: полу-установки нет.
  // EN: A misconfigured ostrov tool must not take the whole bridge down: the tool is skipped, a loud log line, other tools live.
  try {
    installOstrovApi(ctx, config?.ostrovApi)
  } catch (e) {
    console.error(`[dsh-tool-bridge] ostrovApi НЕ установлен: ${String(e?.message ?? e).replace(/^ОТКАЗ ostrov_api: /, '')}`)
  }

  try {
    const url = new URL('../package.json', import.meta.url)
    const m = JSON.parse(readFileSync(url, 'utf8'))
    console.error(`[${m.name} ${m.version}] подъём`)
  } catch (e) {

    console.error(`[dsh-tool-bridge версия НЕ ПРОЧИТАНА] подъём: ${e?.message ?? e}`)
  }

  log(`src/index.js sha256=${SUMMA_ZAGRUZHENNOGO_KODA ?? 'НЕ ПРОЧИТАНА'} pid=${process.pid}`)

  const TICKET_TTL_MS = (config?.ticketTtlMinutes ?? TICKET_TTL_MINUTES_DEFAULT) * 60000

  const tickets = new Map()

  const ticketOf = new Map()

  const openTurnOf = new Map()

  const turnKey = (agentId, turn) => `${agentId}#${turn ?? '-'}`

  const dropExpired = () => {
    const now = Date.now()
    for (const [t, rec] of tickets) {
      if (now - rec.issuedAt <= TICKET_TTL_MS) continue
      tickets.delete(t)
      const set = ticketOf.get(turnKey(rec.agentId, rec.turn))
      if (set) { set.delete(t); if (!set.size) ticketOf.delete(turnKey(rec.agentId, rec.turn)) }
    }
  }

// RU: Выдать новый случайный пропуск в наборе своего хода, прежние пропуски сохраняются до конца/TTL. Никогда не записывать значение в журнал.
// EN: Issue a fresh random ticket in its turn set; existing tickets remain until turn end or TTL. Never log its value.
  const issueTicket = (agentId, turn) => {
    dropExpired()
    const key = turnKey(agentId, turn)

    const ticket = randomBytes(24).toString('hex')
    tickets.set(ticket, { agentId, turn, issuedAt: Date.now() })
    let set = ticketOf.get(key)
    if (!set) { set = new Set(); ticketOf.set(key, set) }
    set.add(ticket)
    log(`пропуск выдан: ${agentId} ход ${turn ?? '-'}; живых пропусков хода ${set.size}`)
    return ticket
  }

  const revokeTurn = (agentId, turn) => {
    const key = turnKey(agentId, turn)
    const set = ticketOf.get(key)
    if (!set || !set.size) return false
    for (const t of set) tickets.delete(t)
    const n = set.size
    ticketOf.delete(key)
    return n
  }

// RU: Проверить bearer до чтения тела. Неизвестный/просроченный пропуск отказывает; payload не задаёт личность.
// EN: Validate the bearer before reading the body. Unknown or expired tickets fail; the payload cannot set identity.
  const resolveTicket = (ticket) => {
    if (typeof ticket !== 'string' || !ticket) return { error: 'пропуск не предъявлен' }
    const rec = tickets.get(ticket)
    if (!rec) return { error: 'пропуск неизвестен или уже погашен' }
    if (Date.now() - rec.issuedAt > TICKET_TTL_MS) {
      tickets.delete(ticket)
      const set = ticketOf.get(turnKey(rec.agentId, rec.turn))
      if (set) { set.delete(ticket); if (!set.size) ticketOf.delete(turnKey(rec.agentId, rec.turn)) }
      return { error: 'срок пропуска истёк' }
    }
    return { agentId: rec.agentId }
  }

// RU: Конец хода всегда отзывает пропуски; heartbeat откладывается за предел публикации события. Ограниченные сессии исключены из heartbeat, но не из отзыва.
// EN: Turn end always revokes tickets; heartbeat checks run after event publication. Restricted sessions skip heartbeat but still revoke tickets.
  ctx.on('session/event', (session, event) => {
    const sid = String(session?.id ?? '')
    if (!sid) return
    if (event?.type === 'turn/start') openTurnOf.set(sid, event.data?.turn)
    else if (event?.type === 'turn/end') {
      if (openTurnOf.get(sid) === event.data?.turn) openTurnOf.delete(sid)
      const n = revokeTurn(sid, event.data?.turn)
      if (n) {
        log(`пропусков хода ${event.data?.turn} для ${sid} погашено: ${n} (${event.data?.reason?.kind ?? 'конец хода'})`)
      }

      if (scopedSession(session)) return
      setTimeout(() => {
        checkHeartbeat(sid).catch((e) => log(`🔴 предел самопробуждения: проверка для ${sid} упала: ${e?.message ?? e}`))
      }, 0)
    }
  })

  const agents = ctx.get('agents')

  const UMOLCHANIYA_PREDELOV = {
    createLimitCount: CREATE_LIMIT_DEFAULT,
    createWindowMinutes: CREATE_WINDOW_MINUTES_DEFAULT,
    blockAfterRoundsCount: BLOCKED_AFTER_ROUNDS_DEFAULT,
    minIntervalSeconds: HEARTBEAT_MIN_INTERVAL_SECONDS_DEFAULT,
    maxConsecutiveCount: HEARTBEAT_MAX_CONSECUTIVE_DEFAULT,
    maxPerDayCount: HEARTBEAT_MAX_PER_DAY_DEFAULT,
    dayZone: HEARTBEAT_DAY_ZONE_DEFAULT,
    humanKinds: HEARTBEAT_HUMAN_KINDS_DEFAULT,
    rezhimIntervala: HEARTBEAT_REZHIM_DEFAULT,
    ravnomernoIntervalSeconds: HEARTBEAT_RAVNOMERNO_SECONDS_DEFAULT,
    maxVChasCount: HEARTBEAT_MAX_V_CHAS_DEFAULT,
    szhimatIstoriyuPeredUdarom: HEARTBEAT_SZHATIE_DEFAULT,
    rezyumirovatPolosu: HEARTBEAT_REZYUME_DEFAULT,
  }

  const limitsAgent = config?.limitsAgent ?? LIMITS_AGENT_DEFAULT
  const limitsDir = config?.limitsDir ?? LIMITS_DIR
  const pd = chitatPredely(limitsAgent, UMOLCHANIYA_PREDELOV, limitsDir)

  const limits = {
    alertCommand: config?.alertCommand ?? process.env.DSH_ALERT_CMD ?? '',
    createLimit: pd.znach.createLimitCount,
    createWindowMs: pd.znach.createWindowMinutes * 60000,
    blockedAfterRounds: pd.znach.blockAfterRoundsCount,
    serverName: config?.serverName ?? SERVER_NAME_DEFAULT,
    heartbeatMinIntervalSeconds: pd.znach.minIntervalSeconds,
    heartbeatMaxConsecutive: pd.znach.maxConsecutiveCount,
    heartbeatMaxPerDay: pd.znach.maxPerDayCount,
    heartbeatDayZone: pd.znach.dayZone,
    heartbeatNoticeDir: config?.heartbeatNoticeDir ?? HEARTBEAT_NOTICE_DIR_DEFAULT,
    heartbeatHumanKinds: new Set(pd.znach.humanKinds),
    heartbeatRezhim: HEARTBEAT_REZHIMY.includes(pd.znach.rezhimIntervala)
      ? pd.znach.rezhimIntervala : HEARTBEAT_REZHIM_DEFAULT,
    heartbeatRezhimZapros: pd.znach.rezhimIntervala,
    heartbeatRavnomernoSeconds: pd.znach.ravnomernoIntervalSeconds,
    heartbeatMaxVChas: pd.znach.maxVChasCount,
    heartbeatSzhatie: pd.znach.szhimatIstoriyuPeredUdarom === true,
    heartbeatRezyume: pd.znach.rezyumirovatPolosu !== false,
  }

  const stopped = new Set()
  const rashozhdenieS = new Map()   // B-N-1857: sid → момент, когда свидетель впервые опередил журнал
  const checkHeartbeat = async (sid) => {
    const agent = agents.get(sid)
    if (!agent || scopedSession(agent.session)) return

    if (typeof agents.roots !== 'function' || !agents.roots().includes(agent)) return
    const events = sobytiyaSessii(agent)
    const nulevye = { streak: 0, perDay: 0, turns: 0 }
    if (events === undefined) {

      trevogaSchyotNeViden(sid, 'журнал сессии недоступен ни как events, ни как snapshotEvents()', limits.alertCommand)
      await ostanovkaOdinRaz(stopped, sid, () => stopHeartbeat(ctx, agent,
        'счёт пробуждений не виден: журнал сессии недоступен', nulevye, limits, agents.roots().length))
      return
    }
    const now = Date.now()
    const c = heartbeatCounters(events, limits.heartbeatDayZone, now, limits.heartbeatHumanKinds)
    const svid = await svidetelDostavok(ctx, agent, limits.heartbeatDayZone, now, c.perDay)
    const resh = reshenieSvidetelya(rashozhdenieS, sid, svid, c.perDay, now, RASHOZHDENIE_TERPENIE_MS)
    const overStreak = c.streak >= limits.heartbeatMaxConsecutive
    const overDay = resh.perDayEff >= limits.heartbeatMaxPerDay
    const hour = udarovVOkne(events, HEARTBEAT_OKNO_CHASA_MS, now)
    const overHour = limits.heartbeatMaxVChas > 0 && hour.chislo >= limits.heartbeatMaxVChas

    log(`самопробуждение ${sid}: подряд ${c.streak}/${limits.heartbeatMaxConsecutive}, `
      + `за сутки ${c.perDay}/${limits.heartbeatMaxPerDay} (пояс ${limits.heartbeatDayZone})`
      + `; за скользящий час ${hour.chislo}/${limits.heartbeatMaxVChas > 0 ? limits.heartbeatMaxVChas : 'без предела'}`
      + (svid === null ? '' : `; свидетель: ${svid.prichina}`))
    // RU: B-N-1857: отставание журнала — работаем дальше, пределы ниже по большему счёту; держится — гашу, как прежде.
    // EN: B-N-1857: a journal lag — carry on, the limits below use the larger count; if it lasts — stop as before.
    if (svid?.slep && !resh.stop) log(`самопробуждение ${sid}: ${resh.stroka} (B-N-1857)`)
    if (svid?.slep && resh.stop) {
      log(`самопробуждение ${sid}: ${resh.stroka} — слепота журнала, гашу (B-N-1857)`)
      trevogaSchyotNeViden(sid, svid.prichina, limits.alertCommand)
      await ostanovkaOdinRaz(stopped, sid, () => stopHeartbeat(ctx, agent,
        `счёт пробуждений не виден (${svid.prichina})`, c, limits, agents.roots().length))
      return
    }

    if (limits.heartbeatRezyume) {
      const r = rezyumeNaKonceHoda(agent, limits, snyatOtmetku, napechatatRezyume)
      if (!r.pechatali && r.polosa) {
        log(`резюме полосы ${sid}: ${r.prichina} — повтора нет (полоса ${r.polosa.n})`)
      }
    }
    if (!overStreak && !overDay && !overHour) {

      if (stopped.delete(sid)) log(`предел самопробуждения: полоса для ${sid} прервана — сторож снова взведён`)
      return
    }

    const why = overStreak
      ? `${c.streak} автономных пробуждений подряд без внешнего слова — человека или координатора (виды ${[...limits.heartbeatHumanKinds].join(', ')}; предел ${limits.heartbeatMaxConsecutive})`
      : overDay ? `${resh.perDayEff} пробуждений за сутки в этой сессии (предел ${limits.heartbeatMaxPerDay}; журнал ${c.perDay}, по большему со свидетелем)`
      : `${hour.chislo} пробуждений за скользящий час в этой сессии (предел ${limits.heartbeatMaxVChas})`
    await ostanovkaOdinRaz(stopped, sid, () => stopHeartbeat(ctx, agent, why, c, limits, agents.roots().length))
  }

// RU: Это внутренняя HTTP-дверь, не самостоятельный MCP-сервер. Тело собирается без отдельного лимита размера/срока; доступ ограничен loopback и пропуском, а не сетевым sandbox.
// EN: This is an internal HTTP entry, not a standalone MCP server. The body has no dedicated size/deadline limit; loopback and a ticket restrict access, not a network sandbox.
  server = createServer(async (req, res) => {
    const reply = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST' || req.url !== '/invoke') return reply(404, { ok: false, error: 'есть только POST /invoke' })
    const pass = resolveTicket(req.headers['x-bridge-ticket'])
    if (pass.error) {
      log(`\u{1F534} отказ на двери: ${pass.error}`)
      return reply(403, { ok: false, error: pass.error })
    }

    let payload
    try {
      const chunks = []
      for await (const c of req) chunks.push(c)
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { return reply(400, { ok: false, error: 'тело не разобрано' }) }

    try {
      const wantsImage = claudeImageCall(agents.get(String(pass.agentId)), payload.tool)
      if (wantsImage && payload.imageProtocol !== 1) throw new Error('read_image: MCP image transport v1 required; mount gateway and bridge together')
      const value = await callTool(ctx, agents, payload.tool, pass.agentId, payload.args ?? {}, limits)
      const image = wantsImage ? await imageContent(ctx, value) : {}
      if (wantsImage && Buffer.byteLength(JSON.stringify({ok:true,value,...image})) > IMAGE_BASE64_LIMIT + 65536) throw new Error('read_image: image transport envelope exceeds 10065536 bytes')

      log(`вызов ${payload.tool} для ${pass.agentId}: успех`)
      reply(200, { ok: true, value, ...image })
    } catch (e) {

      // RU: В журнал — те же 500 знаков, что в ответ, и полная длина: вывод инструмента с ошибкой бывает большим и чувствительным (аудит №20).
      // EN: The journal gets the same 500 characters as the reply plus the full length: an erroring tool output can be large and sensitive (audit #20).
      const soobshchenie = String(e?.message ?? e)
      log(`🔴 ${payload?.tool} для ${pass.agentId}: ${soobshchenie.slice(0, 500)}${soobshchenie.length > 500 ? ` … (всего ${soobshchenie.length} зн.)` : ''}`)
      reply(200, { ok: false, error: soobshchenie.slice(0, 500) })
    }
  })

  let port
  server.listen(config.port, '127.0.0.1', () => {
    port = server.address().port

    const src = (k) => (config?.[k] === undefined ? 'умолчание' : 'настройка')
    const srcP = (k) => {
      const i = pd.ist[k]
      if (!i) return 'умолчание кода'
      if (i.startsWith('САМЫЙ СТРОГИЙ')) return i
      return i === 'умолчание кода' ? i : i.split('/').pop()
    }

    log(`точка входа 127.0.0.1:${port}; закреплённых схем ${TOOLS.length}; актуальный набор — в описании агента`
      + ` (набор соседнего агента ${PARITY.length}: ${PARITY.map((t) => t.name).join(', ')};`
      + ` расписание платформы ${SCHEDULE.length}: ${SCHEDULE.map((t) => t.name).join(', ')};`
      + ` память ядра ${PAMYAT.length}: ${PAMYAT.map((t) => t.name).join(', ')};`
      + ` выдача по смыслу ${VYDACHA.length} (только агенту, у кого зарегистрирована): ${VYDACHA.map((t) => t.name).join(', ')};`
      + ` наши ${OWN.length}: ${OWN.map((t) => t.name).join(', ')})`)
    log(`потолок создания целей: ${limits.createLimit} (${srcP('createLimitCount')}) `
      + `за ${limits.createWindowMs / 60000} мин (${srcP('createWindowMinutes')}); `
      + `под потолком: ${Object.entries(EXEC).filter(([, e]) => e.counted).map(([n]) => n).join(', ') || 'ничего'}`)
    log(`порог blocked: ${limits.blockedAfterRounds} (${srcP('blockAfterRoundsCount')}) автономных раундов`)
    log(`пропуск: на (личность, ход), гаснет по turn/end; верхний срок ${TICKET_TTL_MS / 60000} мин (${src('ticketTtlMinutes')}); выдаётся только корневому агенту`)
    log(`имя сервера: "${limits.serverName}" (${src('serverName')}); у модели инструменты видны как mcp__${limits.serverName}__<имя>`)

    log(`предел самопробуждения: не чаще ${limits.heartbeatMinIntervalSeconds} с (${srcP('minIntervalSeconds')}); `
      + `не более ${limits.heartbeatMaxConsecutive} подряд без ВНЕШНЕГО слова (${srcP('maxConsecutiveCount')}); `
      + `не более ${limits.heartbeatMaxPerDay} в сутки НА СЕССИЮ, а не на агента (${srcP('maxPerDayCount')}), `
      + `по поясу ${limits.heartbeatDayZone} (${srcP('dayZone')}); `
      + `суммарный потолок агента = число живых корневых сессий × ${limits.heartbeatMaxPerDay}, `
      + `у меня их обычно две (telegram-<chatId> и a2a) — то есть ${2 * limits.heartbeatMaxPerDay} в сутки; `
      + `счёт из журнала сессии — перезапуск его не обнуляет; `
      + `внешнее слово = виды источника [${[...limits.heartbeatHumanKinds].join(', ')}] (${srcP('humanKinds')}) — мера называется «без слова человека» лишь по имени настройки: пока в списке есть a2a, полосу рвёт и координатор; `
      + `письмо об остановке ${limits.heartbeatNoticeDir === '' ? 'только в журнал: каталог не задан' : `в ${limits.heartbeatNoticeDir}`} (${src('heartbeatNoticeDir')})`)

    log(`режим интервала: ${limits.heartbeatRezhim} (${srcP('rezhimIntervala')})`
      + (limits.heartbeatRezhim === 'ravnomerno'
        ? ` — ровный тик ${pochelovecheski(limits.heartbeatRavnomernoSeconds)} (${srcP('ravnomernoIntervalSeconds')}), `
          + `всего не более ${limits.heartbeatMaxConsecutive} подряд (${srcP('maxConsecutiveCount')}), `
          + `вся полоса займёт ${pochelovecheski(dlinaPolosy(limits))}`
        : ` — пауза растёт ${stupeniKratko(limits)}; вся полоса займёт `
          + `${pochelovecheski(dlinaPolosy(limits))}; внешнее слово возвращает на первую ступень`))
    if (!HEARTBEAT_REZHIMY.includes(limits.heartbeatRezhimZapros)) {
      log(`🔴 режим интервала «${limits.heartbeatRezhimZapros}» неизвестен (${srcP('rezhimIntervala')}): `
        + `беру ${HEARTBEAT_REZHIM_DEFAULT}. Допустимы: ${HEARTBEAT_REZHIMY.join(', ')}`)
    }
    log(limits.heartbeatMaxVChas > 0
      ? `потолок темпа: не более ${limits.heartbeatMaxVChas} пробуждений за скользящий час `
        + `НА СЕССИЮ, а не на агента (${srcP('maxVChasCount')}). Одноразовый срок отодвигается; `
        + `суммарный потолок агента = число живых корневых сессий × ${limits.heartbeatMaxVChas}. `
        + 'Создание и изменение повторов при полном окне отклоняются; конец хода снимает все виды. '
        + 'Проверка после хода не предотвращает одновременные доставки до его конца.'
      : `потолок темпа: НЕ ОГРАНИЧЕН (${srcP('maxVChasCount')} = 0). Суточный предел ограничивает `
        + 'количество, но не темп: все пробуждения суток можно израсходовать за минуты')

    if (limits.heartbeatSzhatie) {
      log(`🔴 szhimatIstoriyuPeredUdarom = true (${srcP('szhimatIstoriyuPeredUdarom')}), `
        + 'но МЕХАНИЗМА СЖАТИЯ ЗДЕСЬ НЕТ — настройка НЕ ДЕЙСТВУЕТ. Это точка подключения '
        + 'под будущий приём: история перед пробуждением НЕ сжимается, расход не снижается')
    }

    log(limits.heartbeatRezyume
      ? `резюме полосы: печатается (${srcP('rezyumirovatPolosu')}) — при обрыве полосы внешним `
        + `словом числами, а по вызову ${OWN[0].name} — сразу и с итогом от агента. `
        + `Признак «пора печатать» структурный: ход не автономен, а перед ним подряд шли `
        + `автономные — истинно ровно один раз, поэтому дубля не бывает и состояния для этого `
        + `не заведено. Отметка объявления живёт `
        + (limits.heartbeatNoticeDir === ''
          ? '🔴 ТОЛЬКО В ПАМЯТИ: каталог писем не задан, и перезапуск между объявлением и '
            + 'внешним словом даст ПОВТОР резюме'
          : `файлом в ${limits.heartbeatNoticeDir} — переживает перезапуск`)
        + '. НЕ отвечает на вопрос «что сделано»: содержательный итог знает только агент'
      : `резюме полосы: ВЫКЛЮЧЕНО (${srcP('rezyumirovatPolosu')}) — окончание полосы `
        + 'самопробуждений нигде не объявляется; осознанное окончание и молчаливое '
        + 'в журнале неотличимы')

    for (const stroka of protivorechiyaKonfiga(limits)) log(`🔴 настройки спорят: ${stroka}`)

    if (pd.beda) {
      log(`🔴 пределы НЕ прочитаны из ${limitsDir}: ${pd.beda} — взят САМЫЙ СТРОГИЙ`
        + ` (не чаще ${STROGO.minIntervalSeconds} с, не более ${STROGO.maxConsecutiveCount} подряд,`
        + ` ${STROGO.maxPerDayCount} в сутки). Человеческий ход НЕ блокируется:`
        + ` напишите — работа продолжится`)
    } else {
      log(`пределы прочитаны из ${limitsDir} (агент «${limitsAgent}»); правка файла`
        + ` применяется только при повторном монтаже моста или перезапуске службы`)
    }
    log('предел самопробуждения НЕ ДЕЙСТВУЕТ: на раунды целей (там свой defaultMaxGoalRounds), '
      + 'на пробуждения от фоновых заданий (там свой maxConsecutiveWakes), на агента без моста '
      + '(у агента без моста расписание идёт родным циклом платформы — ему нужен свой сторож) '
      + 'и против того, у кого есть sudo: изоляция здесь поведенческая, счётчик читается из журнала моего же процесса')
  })

// RU: Этот descriptor вызывается доверенным адаптером на каждый ход. Нельзя подменять его сохранённым каталогом: регистрация инструментов и область могут измениться.
// EN: The trusted adapter requests this descriptor on each turn. Do not replace it with a cached catalog: registrations and scope can change.
  ctx.provide('mcpBridge', {

    serverName: limits.serverName,

    modelToolName(base) { return `mcp__${limits.serverName}__${base}` },

    toolNames() { return naborDlyaAgenta(ctx.get('tools'), agents?.currentInitiator?.()).map((t) => t.name) },

    descriptor(agentId) {
      if (port === undefined) {
        log('🔴 описание запрошено до того, как точка входа поднялась — инструменты не подключены')
        return undefined
      }
      if (typeof agentId !== 'string' || !agentId) {

        log('🔴 описание запрошено без личности — пропуск не выдан')
        return undefined
      }

      const owner = agents?.get?.(agentId)
      if (!owner) {
        log(`🔴 описание для ${agentId}: живого агента с такой личностью нет — пропуск не выдан`)
        return undefined
      }
      if (typeof agents.roots === 'function' && !agents.roots().includes(owner)) {
        log(`🔴 описание для ${agentId}: агент не корневой — пропуск не выдан`)
        return undefined
      }

      const turn = openTurnOf.get(agentId)
      const tools = naborDlyaAgenta(ctx.get('tools'), owner)
      log(`описание для ${agentId}: инструментов ${tools.length} (живой реестр + закреплённые политики моста)`)
      return {

        name: limits.serverName,
        url: `http://127.0.0.1:${port}/invoke`,
        ticket: issueTicket(agentId, turn),

        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters,
        })),
      }
    },
  })
}
