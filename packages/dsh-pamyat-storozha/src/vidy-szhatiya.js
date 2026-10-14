/**
 * RU: Опознание вида сжатия и арифметика расхода по событиям журнала сессии.
 *     Почему отдельным файлом: виды различаются полями, а поля объявлены платформой (dsh-compaction,
 *     lib/types/types.d.ts). Держать это знание внутри сторожа значило бы повторять чужой перечень по памяти, а
 *     перечень, записанный рукой, отвечает про себя, а не про предмет.
 *     Что снято с платформы (чтением объявлений, не по памяти):
 *     compaction/end     { compactionId, sourceCommandId?, turn, error? }
 *     compaction/summary { shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage?
 *     }
 *     compaction/prune   { shadowedRange, shadowedSeqs, shadowedTokenCount }
 *     ТРИ ВИДА, А НЕ ДВА. Кроме естественного и принудительного есть третий — prune, замена без модели. У него
 *     НЕТ ни provider, ни model, ни usage: цена там не в токенах вызова, а в вытесненном объёме. Сторож,
 *     считающий «сжатия» одним числом, сложил бы несравнимое.
 * EN: Identifying the kind of compaction and the spend arithmetic from session journal events.
 *     Why a separate file: the kinds differ by fields, and the fields are declared by the platform
 *     (dsh-compaction, lib/types/types.d.ts). Keeping that knowledge inside the guard would mean repeating
 *     someone else's list from memory, and a hand-written list answers about itself, not about the subject.
 *     What is taken from the platform (by reading the declarations, not from memory):
 *     compaction/end     { compactionId, sourceCommandId?, turn, error? }
 *     compaction/summary { shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage?
 *     }
 *     compaction/prune   { shadowedRange, shadowedSeqs, shadowedTokenCount }
 *     THREE KINDS, NOT TWO. Besides natural and forced there is a third — prune, a replacement without a model.
 *     It has NO provider, model or usage: its cost is not in call tokens but in the shadowed volume. A guard
 *     counting "compactions" as one number would add incomparable things.
 */

/**
 * RU: PRINUZHDENIE — признак принудительного сжатия: команду человека платформа называет явным полем
 *     sourceCommandId.
 * EN: PRINUZHDENIE — the sign of a forced compaction: the platform names a human command with the explicit
 *     field sourceCommandId.
 */
export const PRINUZHDENIE = 'sourceCommandId'

/**
 * RU: vidKonca(data) → 'proval' | 'prinuditelnoe' | 'estestvennoe' — вид сжатия по данным события
 *     compaction/end.
 *     ПРОВАЛ ПРОВЕРЯЕТСЯ ПЕРВЫМ. Поле error помечает НЕУДАВШУЮСЯ попытку: история не урезана, сводки нет. Кто
 *     считает все compaction/end как «сжатий было столько-то», посчитает и провалы — и отчёт станет тем
 *     благополучнее, чем чаще ломается. Провал с командой человека — всё равно провал.
 * EN: vidKonca(data) → 'proval' (failure) | 'prinuditelnoe' (forced) | 'estestvennoe' (natural) — the kind of
 *     compaction from compaction/end event data.
 *     FAILURE IS CHECKED FIRST. The error field marks a FAILED attempt: history was not cut, there is no
 *     summary. Whoever counts every compaction/end as "N compactions" will count failures too — and the report
 *     gets rosier the more often things break. A failure with a human command is still a failure.
 */
export function vidKonca(data) {
  if (data?.error !== undefined) return 'proval'
  if (data?.[PRINUZHDENIE] !== undefined) return 'prinuditelnoe'
  return 'estestvennoe'
}

/**
 * RU: ═══ АРИФМЕТИКА РАСХОДА ВЗЯТА У ПЛАТФОРМЫ, А НЕ СЛОЖЕНА ПО ЗДРАВОМУ СМЫСЛУ ═══
 *     Было в ранних версиях: «сложить все числовые поля usage». Приёмка на живых числах нашла 35 вместо 30.
 *     Основание правки взято из объявлений платформы:
 *     TokenUsage { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, reasoningTokens?,
 *     totalTokens? } — «Counts are DISJOINT: inputTokens is uncached input only; cached input is reported
 *     separately … (billed input = sum of the three).» (dsh-llm, lib/types/types.d.ts)
 *     usageTokens(usage) = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens — «Sum disjoint
 *     provider usage buckets WITHOUT DOUBLE-COUNTING REASONING OUTPUT.» (dsh-token-meter, lib/index.js)
 *     pressureFrom(usage) = inputTokens + cacheReadTokens + cacheWriteTokens — «Prompt-side pressure of one
 *     request: input plus cache traffic, NO OUTPUT.» (dsh-token-meter, lib/index.js)
 *     Итог: reasoningTokens ВХОДИТ в outputTokens и отдельным слагаемым быть не может. Мы удваивали именно его.
 *     Второй дефект, которого в замечании приёмки не было: расход вызова и давление на контекст — РАЗНЫЕ
 *     величины, и ступени заполнения считались не от той. Заполнение — то, что уходит В ЗАПРОС (вход плюс кэш,
 *     без выхода): ответ модели переедет в контекст только следующим вызовом. Считая долю от полной суммы, мы
 *     завышали её на весь выход и кричали раньше срока.
 *     Граница обеих функций: считаются ТОЛЬКО объявленные поля. Незнакомые поля НЕ складываются и НАЗЫВАЮТСЯ
 *     (neznakomyePolya) — молчаливый учёт неизвестного хуже пропуска: он даёт число, за которое никто не
 *     отвечает.
 * EN: ═══ THE SPEND ARITHMETIC IS TAKEN FROM THE PLATFORM, NOT ADDED UP BY COMMON SENSE ═══
 *     Early versions did "add up all numeric usage fields". Acceptance on live numbers found 35 instead of 30.
 *     The basis for the fix comes from the platform declarations:
 *     TokenUsage { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, reasoningTokens?,
 *     totalTokens? } — "Counts are DISJOINT: inputTokens is uncached input only; cached input is reported
 *     separately … (billed input = sum of the three)." (dsh-llm, lib/types/types.d.ts)
 *     usageTokens(usage) = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens — "Sum disjoint
 *     provider usage buckets WITHOUT DOUBLE-COUNTING REASONING OUTPUT." (dsh-token-meter, lib/index.js)
 *     pressureFrom(usage) = inputTokens + cacheReadTokens + cacheWriteTokens — "Prompt-side pressure of one
 *     request: input plus cache traffic, NO OUTPUT." (dsh-token-meter, lib/index.js)
 *     Result: reasoningTokens IS PART OF outputTokens and cannot be a separate addend. That is exactly what we
 *     used to double.
 *     A second defect the acceptance remark did not mention: the spend of a call and pressure on the context
 *     are DIFFERENT quantities, and fill stages were computed from the wrong one. Fill is what goes INTO THE
 *     REQUEST (input plus cache, without output): the model's answer moves into the context only with the next
 *     call. Computing the share from the full sum inflated it by the whole output and fired too early.
 *     Boundary of both functions: ONLY declared fields are counted. Unknown fields are NOT added and are NAMED
 *     (neznakomyePolya) — silently counting the unknown is worse than skipping it: it produces a number nobody
 *     is accountable for.
 */

/**
 * RU: Поля usage, объявленные платформой (dsh-llm, TokenUsage). Список — из объявления, не из памяти.
 *     totalTokens объявлен в DSH 0.2: «Exact full-call total including aggregate prompt and output tokens.
 *     Adapters preserve a provider total or derive it …; they omit it when unavailable or inconsistent». Это
 *     итог ВСЕГО вызова, с выходом: слагаемым ни давления, ни расхода он не берётся (иначе вход и выход
 *     сложились бы дважды); сверять его с суммой вёдер не нужно — несогласованный итог адаптер опускает сам.
 *     Объявлен — значит не «незнакомое поле».
 * EN: Usage fields declared by the platform (dsh-llm, TokenUsage). The list comes from the declaration, not
 *     from memory.
 *     totalTokens is declared in DSH 0.2: "Exact full-call total including aggregate prompt and output tokens.
 *     Adapters preserve a provider total or derive it …; they omit it when unavailable or inconsistent". It is
 *     the total of the WHOLE call, output included: it is not an addend of either pressure or spend (otherwise
 *     input and output would be added twice); no need to check it against the bucket sum — an inconsistent
 *     total is dropped by the adapter itself. Declared — therefore not an "unknown field".
 */
const OBYAVLENNYE = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens']

/**
 * RU: neznakomyePolya(usage) → string[] — поля usage, которых нет в объявлении платформы (OBYAVLENNYE).
 * EN: neznakomyePolya(usage) → string[] — usage fields absent from the platform declaration (OBYAVLENNYE).
 */
export function neznakomyePolya(usage) {
  if (!usage || typeof usage !== 'object') return []
  return Object.keys(usage).filter((k) => !OBYAVLENNYE.includes(k))
}

/**
 * RU: rashod(usage) → { est, vsego, chuzhie } — расход ВЫЗОВА: сумма непересекающихся вёдер (вход + чтение кэша
 *     + запись кэша + выход), БЕЗ reasoning (он внутри output). chuzhie — незнакомые поля.
 *     «НЕ СООБЩЁН» — ЭТО НЕ НОЛЬ. usage объявлен платформой необязательным; нет usage или нет ни inputTokens,
 *     ни outputTokens — est: false, vsego: null. Сторож, печатающий 0 при отсутствии поля, соврал бы тем
 *     убедительнее, чем аккуратнее выглядит строка.
 * EN: rashod(usage) → { est, vsego, chuzhie } — the spend of a CALL: the sum of disjoint buckets (input + cache
 *     read + cache write + output), WITHOUT reasoning (it is inside output). chuzhie — unknown fields.
 *     "NOT REPORTED" IS NOT ZERO. The platform declares usage optional; no usage, or neither inputTokens nor
 *     outputTokens — est: false, vsego: null. A guard printing 0 when the field is missing would lie the more
 *     convincingly the tidier the line looks.
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
 * RU: davlenie(usage) → { est, vsego, chuzhie } — ДАВЛЕНИЕ НА КОНТЕКСТ: вход плюс кэш (чтение и запись), БЕЗ
 *     выхода — величина для ступеней заполнения. Формула платформы pressureFrom, приведена выше. Нет
 *     inputTokens — est: false.
 * EN: davlenie(usage) → { est, vsego, chuzhie } — PRESSURE ON THE CONTEXT: input plus cache (read and write),
 *     WITHOUT output — the quantity used for fill stages. The platform formula pressureFrom, quoted above. No
 *     inputTokens — est: false.
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
 * RU: dlitelnost(nachaloMs, konecMs) → миллисекунды или null — длительность между началом и концом сжатия.
 *     Поля длительности у событий НЕТ вовсе (проверено чтением объявлений). Считаем по меткам времени, и в
 *     отчёте это называется своим именем: время между ЗАПИСЯМИ В ЖУРНАЛ, а не работа модели — между ними
 *     очередь, ожидание и всё прочее. Нет метки или конец раньше начала — null, а не ноль.
 * EN: dlitelnost(nachaloMs, konecMs) → milliseconds or null — duration between the start and the end of a
 *     compaction.
 *     Events have NO duration field at all (verified by reading the declarations). We compute it from
 *     timestamps, and the report calls it by its name: time between JOURNAL RECORDS, not model work — queueing,
 *     waiting and everything else lie in between. No timestamp, or the end before the start — null, not zero.
 */
export function dlitelnost(nachaloMs, konecMs) {
  if (typeof nachaloMs !== 'number' || typeof konecMs !== 'number') return null
  const d = konecMs - nachaloMs
  return d >= 0 ? d : null
}
