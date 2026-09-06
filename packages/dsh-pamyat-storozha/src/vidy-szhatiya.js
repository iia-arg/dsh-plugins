/**
 * Опознание вида сжатия по событиям журнала сессии.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. Виды различаются полями, а поля объявлены платформой
 * (dsh-compaction/lib/types/types.d.ts). Держать это знание внутри сторожа значило бы
 * повторить чужой перечень по памяти — а мы за сутки трижды ловили себя на том, что
 * перечень, записанный рукой, отвечает про себя, а не про предмет.
 *
 * ЧТО СНЯТО С ПЛАТФОРМЫ (не по памяти, чтением объявлений):
 *   compaction/end     { compactionId, sourceCommandId?, turn, error? }
 *   compaction/summary { shadowedRange, shadowedSeqs, shadowedTokenCount,
 *                        provider, model, maxTokens?, usage? }
 *   compaction/prune   { shadowedRange, shadowedSeqs, shadowedTokenCount }
 *
 * 🔴 ТРИ ВИДА, А НЕ ДВА. В задании названы «естественное и принудительное». Замер
 * показал третий: prune — замена без модели. У него НЕТ ни provider, ни model, ни
 * usage: цена там не в токенах вызова, а в вытесненном объёме. Сторож, считающий
 * «сжатия» одним числом, сложит несравнимое.
 */

/** Признак принудительного: команда человека названа платформой явным полем. */
export const PRINUZHDENIE = 'sourceCommandId'

/**
 * @returns {'proval'|'prinuditelnoe'|'estestvennoe'} вид по событию конца.
 *
 * 🔴 ПРОВАЛ ПРОВЕРЯЕТСЯ ПЕРВЫМ. Поле error помечает НЕУДАВШУЮСЯ попытку: история не
 * урезана, сводки нет. Кто считает все compaction/end как «сжатий было столько-то»,
 * посчитает и провалы — и отчёт станет тем благополучнее, чем чаще ломается.
 */
export function vidKonca(data) {
  if (data?.error !== undefined) return 'proval'
  if (data?.[PRINUZHDENIE] !== undefined) return 'prinuditelnoe'
  return 'estestvennoe'
}

/**
 * ═══ АРИФМЕТИКА РАСХОДА ВЗЯТА У ПЛАТФОРМЫ, А НЕ СЛОЖЕНА ПО ЗДРАВОМУ СМЫСЛУ ═══
 *
 * 🔴 БЫЛО (a1…a4): «сложить все числовые поля usage». Дефект нашла приёмка на живых
 * числах — 35 вместо 30. Основание правки взято не с её слов и не по памяти, а из
 * объявлений платформы:
 *
 *   TokenUsage { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?,
 *                reasoningTokens? }
 *     «Counts are DISJOINT: inputTokens is uncached input only; cached input is
 *      reported separately … (billed input = sum of the three).»
 *     — dsh-llm/lib/types/types.d.ts:115-129
 *
 *   usageTokens(usage) = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens
 *     «Sum disjoint provider usage buckets WITHOUT DOUBLE-COUNTING REASONING OUTPUT.»
 *     — dsh-token-meter/lib/index.js:455-458
 *
 *   pressureFrom(usage) = inputTokens + cacheReadTokens + cacheWriteTokens
 *     «Prompt-side pressure of one request: input plus cache traffic, NO OUTPUT.»
 *     — dsh-token-meter/lib/index.js:265-266
 *
 * Итог: reasoningTokens ВХОДИТ в outputTokens и отдельным слагаемым быть не может —
 * платформа помечает это в комментарии к своей же сумме. Мы удваивали именно его.
 *
 * 🔴 И ВТОРОЙ ДЕФЕКТ, КОТОРОГО В ЗАМЕЧАНИИ ПРИЁМКИ НЕ БЫЛО: расход вызова и давление
 * на контекст — РАЗНЫЕ ВЕЛИЧИНЫ, и ступени заполнения считались не от той. Заполнение
 * — это то, что уходит В ЗАПРОС (вход плюс кэш, без выхода): ответ модели переедет в
 * контекст только следующим вызовом. Считая долю от полной суммы, мы завышали её на
 * весь выход — то есть кричали раньше, чем следовало, и объяснить это было бы нечем.
 *
 * ⚠️ ГРАНИЦА ОБЕИХ ФУНКЦИЙ: считаются ТОЛЬКО объявленные поля. Прежняя редакция брала
 * любое число и тем молча включала бы в счёт поле, которого мы не знаем. Теперь
 * незнакомые поля НЕ складываются и НАЗЫВАЮТСЯ — молчаливый учёт неизвестного хуже
 * пропуска: он даёт число, за которое никто не отвечает.
 */

/** Поля, объявленные платформой (dsh-llm TokenUsage). Список — из объявления, не из памяти. */
const OBYAVLENNYE = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']

/** @returns {string[]} поля usage, которых нет в объявлении платформы */
export function neznakomyePolya(usage) {
  if (!usage || typeof usage !== 'object') return []
  return Object.keys(usage).filter((k) => !OBYAVLENNYE.includes(k))
}

/**
 * Расход ВЫЗОВА: сумма непересекающихся вёдер, БЕЗ reasoning (он внутри output).
 * 🔴 «НЕ СООБЩЁН» — ЭТО НЕ НОЛЬ. usage объявлен платформой как необязательный.
 * Сторож, печатающий 0 при отсутствии поля, соврёт тем убедительнее, чем аккуратнее
 * выглядит строка.
 * @returns {{est: boolean, vsego: number|null, chuzhie: string[]}}
 */
export function rashod(usage) {
  const chuzhie = neznakomyePolya(usage)
  if (usage === undefined || usage === null) return { est: false, vsego: null, chuzhie }
  const ch = (k) => (typeof usage[k] === 'number' ? usage[k] : 0)
  if (typeof usage.inputTokens !== 'number' && typeof usage.outputTokens !== 'number') {
    return { est: false, vsego: null, chuzhie }
  }
  return { est: true, chuzhie,
           vsego: ch('inputTokens') + ch('cacheReadTokens') + ch('cacheWriteTokens') + ch('outputTokens') }
}

/**
 * ДАВЛЕНИЕ НА КОНТЕКСТ: вход плюс кэш, БЕЗ выхода — величина для ступеней заполнения.
 * Формула платформы pressureFrom, приведена выше дословно с местом в коде.
 * @returns {{est: boolean, vsego: number|null, chuzhie: string[]}}
 */
export function davlenie(usage) {
  const chuzhie = neznakomyePolya(usage)
  if (usage === undefined || usage === null) return { est: false, vsego: null, chuzhie }
  if (typeof usage.inputTokens !== 'number') return { est: false, vsego: null, chuzhie }
  const ch = (k) => (typeof usage[k] === 'number' ? usage[k] : 0)
  return { est: true, chuzhie,
           vsego: usage.inputTokens + ch('cacheReadTokens') + ch('cacheWriteTokens') }
}

/**
 * Длительность между началом и концом.
 * 🔴 ПОЛЯ ДЛИТЕЛЬНОСТИ У СОБЫТИЙ НЕТ ВОВСЕ — проверено чтением объявлений. Считаем
 * по меткам времени, и в отчёте это называется своим именем: время между ЗАПИСЯМИ В
 * ЖУРНАЛ, а не работа модели. Между ними — очередь, ожидание и всё прочее.
 * @returns {number|null} миллисекунды, либо null если метки нет
 */
export function dlitelnost(nachaloMs, konecMs) {
  if (typeof nachaloMs !== 'number' || typeof konecMs !== 'number') return null
  const d = konecMs - nachaloMs
  return d >= 0 ? d : null
}
