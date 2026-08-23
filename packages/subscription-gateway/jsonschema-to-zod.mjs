/**
 * JSON Schema → zod raw shape. A minimal subset: exactly what zod.toJSONSchema
 * produces on the platform's schemas.
 *
 * WHY. tool() from the SDK requires zod, and zod cannot travel over a wire. The
 * platform hands the schema over as JSON Schema, and the gateway rebuilds zod
 * from it.
 *
 * 🔴 THE BOUNDARY. An unknown type does NOT silently become "anything": such a
 * substitution would give the model a tool with no parameter shape, and a failure
 * would look like working. An unknown type is an exception, the tool is not
 * exposed, and the gateway writes the reason.
 */
import { z } from 'zod'

const node = (s, path) => {
  if (!s || typeof s !== 'object') throw new Error(`${path}: empty schema`)
  if (Array.isArray(s.enum)) {
    if (!s.enum.every((v) => typeof v === 'string')) throw new Error(`${path}: the enum is not made of strings`)
    return z.enum(s.enum)
  }
  // The platform's branded strings (SessionId, GoalId) are described as an
  // intersection of "string AND unknown", and on the wire that is an allOf with
  // an empty second member. We take the single typed member: zod has no empty
  // schema, and the type must not be lost.
  // A branching shape: this is how the platform describes a parameter that takes
  // either a string or an object (schedule_create.at). Without this branch the
  // adapter would not understand a node WITHOUT a type field and would refuse —
  // and the gateway would then silently fail to expose the tool at all. The
  // refusal would be loud in the gateway log and invisible to the model: the tool
  // is simply absent.
  // THE BOUNDARY: there must be at least two branches, and each must assemble on
  // its own. One branch is not a choice but a typo; a branch that will not
  // assemble is a loss of shape, that is, exactly what this whole file guards
  // against.
  const branches = Array.isArray(s.oneOf) ? s.oneOf : Array.isArray(s.anyOf) ? s.anyOf : undefined
  if (branches) {
    const kw = Array.isArray(s.oneOf) ? 'oneOf' : 'anyOf'
    if (branches.length < 2) throw new Error(`${path}: ${kw} of ${branches.length} branch is not a choice`)
    return z.union(branches.map((v, i) => node(v, `${path}|${kw}[${i}]`)))
  }
  if (Array.isArray(s.allOf)) {
    const typed = s.allOf.filter((m) => m && typeof m === 'object' && m.type !== undefined)
    if (typed.length !== 1) throw new Error(`${path}: allOf with ${typed.length} typed members is not supported`)
    return node(typed[0], path)
  }
  switch (s.type) {
    case 'string': return bounds(z.string(), s, 'length')
    case 'number': return bounds(z.number(), s, 'value')
    case 'integer': return bounds(z.number().int(), s, 'value')
    case 'boolean': return z.boolean()
    case 'array': return bounds(z.array(node(s.items, `${path}[]`)), s, 'length')
    case 'object': return z.object(shape(s, path))
    default: throw new Error(`${path}: type ${JSON.stringify(s.type)} is not supported`)
  }
}

/**
 * Value and length bounds. Without them the schema QUIETLY weakens: a positive
 * number becomes any number, and the model sees a different contract from the one
 * the platform will enforce. It will get a refusal at execution time, and the
 * reason will be far from obvious.
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
  if (schema?.type !== 'object') throw new Error(`${path}: an object was expected`)
  const required = new Set(schema.required ?? [])
  const out = {}
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    let t = node(sub, `${path}.${key}`)
    // THE ORDER MATTERS. optional() first, describe() second: the SDK's converter
    // reads the description from the OUTER node, so with describe().optional() the
    // parameter description is SILENTLY lost — the schema stays valid and the
    // model does not see the explanation of an optional field. Verified with
    // tools/list against a stub.
    if (!required.has(key)) t = t.optional()
    if (typeof sub.description === 'string') t = t.describe(sub.description)
    out[key] = t
  }
  return out
}
