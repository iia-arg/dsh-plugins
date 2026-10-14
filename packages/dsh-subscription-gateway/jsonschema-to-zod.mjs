// RU: Legacy SDK transport конвертирует только поддерживаемое подмножество JSON Schema. Неподдерживаемый type или несобираемые ветви отказывают; часть keywords, включая pattern/additionalProperties, не переносится. Это не полная JSON Schema validation; HTTP MCP обходит конверсию.
// EN: The legacy SDK transport converts only a supported JSON Schema subset. Unsupported types or unbuildable branches fail; some keywords, including pattern/additionalProperties, are not carried over. This is not complete JSON Schema validation; HTTP MCP bypasses conversion.


import { z } from 'zod'

const node = (s, path) => {
  if (!s || typeof s !== 'object') throw new Error(`${path}: пустая схема`)
  if (Array.isArray(s.enum)) {
    if (!s.enum.every((v) => typeof v === 'string')) throw new Error(`${path}: перечень не из строк`)
    return z.enum(s.enum)
  }

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

    if (!required.has(key)) t = t.optional()
    if (typeof sub.description === 'string') t = t.describe(sub.description)
    out[key] = t
  }
  return out
}
