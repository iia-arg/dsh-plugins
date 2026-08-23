// Cross-check of the REFERENCE log lines in the README against what the code
// actually prints. The text of the line is taken FROM THE PACKAGE FILE, the
// reference FROM THE README. Neither is retyped by hand: otherwise two copies of
// mine would be compared with each other instead of code with documentation.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const D = dirname(fileURLToPath(import.meta.url))
const lines = readFileSync(`${D}/src/index.js`, 'utf8').split('\n')
// 🔴 By marker, not by line numbers: numbers shift on any edit higher up.
const i = lines.findIndex((l) => l.includes('log(`self-wake limit: no more often than'))
const j = lines.findIndex((l, k) => k > i && l.includes('DOES NOT APPLY'))
if (i < 0 || j < 0) throw new Error('the package file has no self-wake limit startup lines — the bench is looking in the wrong place')
const last = lines.findIndex((l, k) => k > j && l.trimEnd().endsWith(')') && !l.trimEnd().endsWith('),'))
const body = lines.slice(i, last + 1).join('\n')

const out = []
const log = (m) => out.push(`[tool-bridge] ${m}`)
const config = {}                                  // everything on defaults
const limits = {
  heartbeatMinIntervalSeconds: 1800, heartbeatMaxConsecutive: 6, heartbeatMaxPerDay: 48,
  heartbeatDayZone: 'Europe/Moscow', heartbeatHumanKinds: new Set(['user']), heartbeatNoticeDir: '',
}
const src = (k) => (config?.[k] === undefined ? 'default' : 'configured')
await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(
  `export default (log, limits, src) => {\n${body}\n}`)).then((m) => m.default(log, limits, src))

const readme = readFileSync(`${D}/README.md`, 'utf8')
let ok = 0, bad = 0
for (const line of out) {
  // The README prints the numbers as configured (in our own setup they are set),
  // the code here runs on defaults — so we compare the invariant part, up to the
  // first source mark.
  const anchor = line.split(' (')[0]
  const present = readme.includes(anchor)
  if (present) { ok++; console.log(`  ok   ${anchor.slice(0, 78)}…`) }
  else { bad++; console.log(`  FAIL not in the README: ${anchor.slice(0, 110)}`) }
}
// Separately — the fragments the README promises verbatim
for (const piece of [
  "the agent's total ceiling = number of live root sessions × 48 (two sessions already make 96 a day)",
  'a word from a human = source kinds [user]',
  'stop notice to the log only: no directory configured',
  'counted from the session log — a restart does not reset it',
]) {
  const inCode = out.join('\n').includes(piece), inReadme = readme.includes(piece)
  if (inCode && inReadme) { ok++; console.log(`  ok   verbatim match: ${piece.slice(0, 60)}…`) }
  else { bad++; console.log(`  FAIL "${piece.slice(0, 60)}" — in code ${inCode}, in README ${inReadme}`) }
}
// ── Third check: the three lists of settings must agree ──────────────────────
// The config schema (the code), the block in the README (what the reader
// copies) and cordis.patch.yml (what `dsh plugin add` composes) are three
// separate copies of one list. They drift apart silently: the plugin starts
// happily with a field missing, so nothing turns red on its own.
// Fields WITH a schema default may be absent from the two YAML copies — that is
// the rule this package follows. Fields WITHOUT a default must be present in
// both, because only a written-out value lets the startup line tell
// "configured" from "lost".
const srcText = readFileSync(`${D}/src/index.js`, 'utf8')
const schemaBlock = srcText.slice(srcText.indexOf('export const Config = z.object({'))
const schemaEnd = schemaBlock.indexOf('\n})')
const schemaKeys = new Map()
for (const m of schemaBlock.slice(0, schemaEnd).matchAll(/^  ([A-Za-z][\w]*): (z\.[^\n]*)$/gm)) {
  schemaKeys.set(m[1], m[2].includes('.default('))
}
const readmeKeys = new Set()
// The README's own copy of the list is the settings table: rows like
// | `fieldName` / `other` | … |. Taken from the table and not from the install
// example on purpose — the example is deliberately abbreviated, the table is not.
for (const m of readme.matchAll(/^\| `([^`]+)`(?: \/ `([^`]+)`)? \|/gm)) {
  readmeKeys.add(m[1]); if (m[2]) readmeKeys.add(m[2])
}
const patchKeys = new Set([...readFileSync(`${D}/cordis.patch.yml`, 'utf8').matchAll(/^ {8}([A-Za-z]\w*):/gm)].map((m) => m[1]))
if (!schemaKeys.size || !readmeKeys.size || !patchKeys.size) {
  bad++; console.log(`  FAIL empty list: schema ${schemaKeys.size}, README ${readmeKeys.size}, patch ${patchKeys.size} — the bench is parsing the wrong place`)
}
for (const [key, hasDefault] of schemaKeys) {
  if (hasDefault) { ok++; console.log(`  ok   ${key}: has a schema default, may be omitted from YAML`); continue }
  const inReadme = readmeKeys.has(key), inPatch = patchKeys.has(key)
  if (inReadme && inPatch) { ok++; console.log(`  ok   ${key}: no default, written out in the README and in the patch`) }
  else { bad++; console.log(`  FAIL ${key}: no schema default, but README ${inReadme}, patch ${inPatch}`) }
}
for (const key of [...readmeKeys, ...patchKeys]) {
  if (!schemaKeys.has(key)) { bad++; console.log(`  FAIL ${key}: documented but absent from the config schema`) }
}

console.log(`\nlines printed: ${out.length}\nTOTAL: passed ${ok}, failed ${bad}`)
process.exit(bad ? 1 : 0)
