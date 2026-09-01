/**
 * JSON Schema → zod raw shape. Минимальное подмножество: ровно то, что
 * порождает zod.toJSONSchema на схемах платформы.
 *
 * ЗАЧЕМ. tool() из SDK требует zod, а через провод zod не передать. Платформа
 * отдаёт схему как JSON Schema, шлюз собирает из неё zod обратно.
 *
 * 🔴 ГРАНИЦА. Незнакомый тип НЕ превращается молча в «что угодно»: такая
 * подмена дала бы модели инструмент без формы параметров, и отказ выглядел бы
 * как работа. Незнакомый тип — исключение, инструмент не выставляется, шлюз
 * пишет причину.
 */
import { z } from 'zod'

const node = (s, path) => {
  if (!s || typeof s !== 'object') throw new Error(`${path}: пустая схема`)
  if (Array.isArray(s.enum)) {
    if (!s.enum.every((v) => typeof v === 'string')) throw new Error(`${path}: перечень не из строк`)
    return z.enum(s.enum)
  }
  // Брендированные строки платформы (SessionId, GoalId) описаны пересечением
  // «строка И неизвестное», и на проводе это allOf с пустым вторым членом.
  // Берём единственный типизированный член: пустой схемы в zod нет, а
  // потерять тип нельзя.
  // Разветвление формы: у платформы так описан параметр, принимающий либо
  // строку, либо объект (schedule_create.at). Без этой ветки конвертер не
  // понимал бы узел БЕЗ поля type и отказывал — а шлюз молча не выставлял бы
  // инструмент целиком. Отказ был бы громким в журнале шлюза и невидимым для
  // модели: инструмент просто отсутствует.
  // ГРАНИЦА: ветвей обязано быть не меньше двух, и каждая обязана собираться
  // сама. Одна ветвь — это не выбор, а описка; несобираемая ветвь — потеря
  // формы, то есть ровно то, от чего защищает весь этот файл.
  const vetvi = Array.isArray(s.oneOf) ? s.oneOf : Array.isArray(s.anyOf) ? s.anyOf : undefined
  if (vetvi) {
    const kak = Array.isArray(s.oneOf) ? 'oneOf' : 'anyOf'
    if (vetvi.length < 2) throw new Error(`${path}: ${kak} из ${vetvi.length} ветви — это не выбор`)
    return z.union(vetvi.map((v, i) => node(v, `${path}|${kak}[${i}]`)))
  }
  if (Array.isArray(s.allOf)) {
    const typed = s.allOf.filter((m) => m && typeof m === 'object' && m.type !== undefined)
    if (typed.length !== 1) throw new Error(`${path}: allOf из ${typed.length} типизированных членов не поддержан`)
    return node(typed[0], path)
  }
  switch (s.type) {
    case 'string': return bounds(z.string(), s, 'length')
    case 'number': return bounds(z.number(), s, 'value')
    case 'integer': return bounds(z.number().int(), s, 'value')
    case 'boolean': return z.boolean()
    case 'array': return bounds(z.array(node(s.items, `${path}[]`)), s, 'length')
    case 'object': return z.object(shape(s, path))
    default: throw new Error(`${path}: тип ${JSON.stringify(s.type)} не поддержан`)
  }
}

/**
 * Пределы значения и длины. Без них схема ТИХО слабеет: положительное число
 * превращается в любое, и модель видит не тот договор, который проверит
 * платформа. Отказ она получит уже на исполнении, а причина будет неочевидна.
 */
const bounds = (t, s, kind) => {
  if (kind === 'value') {
    if (typeof s.minimum === 'number') t = t.min(s.minimum)
    if (typeof s.maximum === 'number') t = t.max(s.maximum)
    if (typeof s.exclusiveMinimum === 'number') t = t.gt(s.exclusiveMinimum)
    if (typeof s.exclusiveMaximum === 'number') t = t.lt(s.exclusiveMaximum)
    return t
  }
  const min = s.minLength ?? s.minItems
  const max = s.maxLength ?? s.maxItems
  if (typeof min === 'number') t = t.min(min)
  if (typeof max === 'number') t = t.max(max)
  return t
}

export const shape = (schema, path = '$') => {
  if (schema?.type !== 'object') throw new Error(`${path}: ожидался объект`)
  const required = new Set(schema.required ?? [])
  const out = {}
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    let t = node(sub, `${path}.${key}`)
    // ПОРЯДОК ЗНАЧИМ. Сначала optional(), потом describe(): конвертер SDK
    // читает описание с ВНЕШНЕГО узла, и при describe().optional() описание
    // параметра МОЛЧА теряется — схема остаётся годной, а модель не видит
    // пояснения к необязательному полю. Проверено tools/list на пустышке.
    if (!required.has(key)) t = t.optional()
    if (typeof sub.description === 'string') t = t.describe(sub.description)
    out[key] = t
  }
  return out
}
