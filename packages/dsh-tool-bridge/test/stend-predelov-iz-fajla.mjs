// RU: Проверка stend-predelov-iz-fajla: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-predelov-iz-fajla verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const AGENT = process.env.MOST_AGENT || process.env.LIMITS_AGENT || os.userInfo().username
if (!process.env.MOST_AGENT) console.log(`работаю по умолчанию ${AGENT}, явный агент НЕ передан — проверка согласия с профилем не выполнялась`)

const PAKET_RANO = path.dirname(path.dirname(path.resolve(process.argv[2]
  || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js'))))
const DOM = path.basename(path.dirname(PAKET_RANO)) === 'plugins' ? path.dirname(path.dirname(PAKET_RANO)) : os.homedir()
const SLOJ = process.env.MOST_SLOJ
  || path.join(DOM, '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const DOM_AGENTA = process.env.MOST_SLOJ
  ? path.resolve(path.dirname(SLOJ), '../../..') : DOM
if (process.env.MOST_AGENT) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(AGENT)) {
    console.log('СЛЕПОТА: негодное имя MOST_AGENT'); process.exit(2)
  }
  let imena
  try {
    imena = [...readFileSync(SLOJ, 'utf8').matchAll(/^\s*limitsAgent:\s*['"]?([\w.-]+)['"]?\s*$/gm)]
      .map((m) => m[1])
  } catch (e) {
    console.log(`СЛЕПОТА профиль ${SLOJ}: ${e.code ?? e.message}`); process.exit(2)
  }
  if (imena.length !== 1) {
    console.log(`СЛЕПОТА профиль ${SLOJ}: ожидался один limitsAgent, найдено ${imena.length}`); process.exit(2)
  }
  if (imena[0] !== AGENT) {
    console.log(`FAIL агент профиля ${SLOJ}: ожидался ${AGENT}, найден ${imena[0]}`); process.exit(1)
  }
  console.log(`АГЕНТ ПРОВЕРЕН: ${AGENT}; профиль ${SLOJ}`)
}

const SRC = path.resolve(process.argv[2] || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js'))
const t = fs.readFileSync(SRC, 'utf-8')

if (!t.includes('function chitatPredely(')) {
  console.log(`СЛЕПОТА: в ${SRC} нет chitatPredely — правка чтения пределов не установлена`)
  process.exit(2)
}
const vyrez = (imya) => {
  const i = t.indexOf(`function ${imya}(`)
  if (i < 0) throw new Error(`нет функции ${imya}`)
  const j = t.indexOf('\n}\n', i)

  return t.slice(i, j + 3).replace('import.meta.url', JSON.stringify('file://' + SRC))
}
const strogo = t.match(/const STROGO = \{[\s\S]*?\n\}/)[0]
const kesh = t.match(/const _limitsCache = \{[^}]*\}/)[0]
const fn = (dir) => new Function('statSync','readFileSync','createRequire','LIMITS_DIR',
  `${strogo}\n${kesh}\n${vyrez('chitatPredely')}\n return chitatPredely`)(
  fs.statSync, fs.readFileSync, createRequire, dir)
const UM = { createLimitCount: 3, createWindowMinutes: 60, blockAfterRoundsCount: 3,
  minIntervalSeconds: 1800, maxConsecutiveCount: 6, maxPerDayCount: 48,
  dayZone: 'Europe/Moscow', humanKinds: ['user', 'a2a'] }

// RU: Без явного каталога проверяется подставная политика; чужие настройки не читаются.
// EN: Without an explicit directory use a fixture policy; do not read machine settings.
const PREDELY_SVOI = !process.env.MOST_PREDELY
const PREDELY = process.env.MOST_PREDELY || fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-policy-'))
if (PREDELY_SVOI) fs.writeFileSync(path.join(PREDELY, 'obshchee.yml'), 'predely:\n  maxConsecutiveCount: 9\n  maxPerDayCount: 20\n  minIntervalSeconds: 1800\n  humanKinds: [user, a2a]\n')
process.on('exit', () => { if (PREDELY_SVOI) fs.rmSync(PREDELY, { recursive: true, force: true }) })
const izSloev = (klyuch) => {
  let v, ist = null
  for (const f of [`${PREDELY}/obshchee.yml`, `${PREDELY}/${AGENT}.yml`]) {
    try {
      const m = fs.readFileSync(f, 'utf-8').match(new RegExp(`^\\s*${klyuch}:\\s*(\\d+|\\[[^\\]]*\\])`, 'm'))
      if (m) {
        v = m[1].startsWith('[')
          ? m[1].slice(1, -1).split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
          : Number(m[1])
        ist = f
      }
    } catch {                            }
  }
  return { v, ist }
}
let ok = 0, bad = 0, slep = 0
const p = (n, c, s) => { if (c) { ok++; console.log(`ok   ${n}`) } else { bad++; console.log(`FAIL ${n}\n     ${s}`) } }

const probaYaml = fn(os.tmpdir())('nikogo', UM)
const YAML_EST = !(probaYaml.beda && /yaml/i.test(String(probaYaml.beda)))
if (!YAML_EST) {
  slep += 22
  console.log(`СЛЕПОТА весь стенд: ${probaYaml.beda} — разбиратель YAML не установлен, `
    + 'читать настройки нечем. Поставьте зависимости пакета и повторите.')
} else {
const BOEVOJ_EST = fs.existsSync(`${PREDELY}/${AGENT}.yml`) || fs.existsSync(`${PREDELY}/obshchee.yml`)
if (!BOEVOJ_EST) {
  slep += 4
  console.log(`СЛЕПОТА заданный блок: настроек ${PREDELY}/${AGENT}.yml и obshchee.yml не найдено — `
    + 'проверять нечего. Механизм чтения проверяется ниже на подставных каталогах.')
} else {
const b = fn(PREDELY)(AGENT, UM)
p('заданный: прочитано без беды', b.beda === null, String(b.beda))

const ozhPodr = izSloev('maxConsecutiveCount')
p('заданный: «подряд» и его источник — как в слоях (нет в слоях — умолчание кода)',
  b.znach.maxConsecutiveCount === (ozhPodr.v ?? UM.maxConsecutiveCount)
    && b.ist.maxConsecutiveCount === (ozhPodr.ist ?? 'умолчание кода'),
  `${b.znach.maxConsecutiveCount} / ${b.ist.maxConsecutiveCount}; ждали ${ozhPodr.v ?? UM.maxConsecutiveCount} / ${ozhPodr.ist ?? 'умолчание кода'}`)

const ozhVidy = izSloev('humanKinds')
const vidyOzh = ozhVidy.v ?? UM.humanKinds
const kakMnozhestvo = (a) => JSON.stringify([...new Set(a)].sort())
p('заданный: виды человека (множество) и их источник — как в слоях (нет в слоях — умолчание кода)',
  Array.isArray(b.znach.humanKinds) && b.znach.humanKinds.length > 0
    && kakMnozhestvo(b.znach.humanKinds) === kakMnozhestvo(vidyOzh)
    && b.ist.humanKinds === (ozhVidy.ist ?? 'умолчание кода'),
  `${JSON.stringify(b.znach.humanKinds)} / ${b.ist.humanKinds}; ждали ${JSON.stringify(vidyOzh)} / ${ozhVidy.ist ?? 'умолчание кода'}`)

const ozhInt = izSloev('minIntervalSeconds')
p('заданный: интервал и его источник — как в слоях (нет в слоях — умолчание кода)',
  b.znach.minIntervalSeconds === (ozhInt.v ?? UM.minIntervalSeconds)
    && b.ist.minIntervalSeconds === (ozhInt.ist ?? 'умолчание кода'),
  `${b.znach.minIntervalSeconds} / ${b.ist.minIntervalSeconds}; ждали ${ozhInt.v ?? UM.minIntervalSeconds} / ${ozhInt.ist ?? 'умолчание кода'}`)
}

const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'al-'))
const r1 = fn(d1)('nikogo', UM)
p('файлов нет -> самый строгий', r1.znach.maxConsecutiveCount === 1 && /файлов нет/.test(r1.beda), JSON.stringify(r1.beda))
p('файлов нет -> интервал СТРОЖЕ (больше)', r1.znach.minIntervalSeconds === 3600, String(r1.znach.minIntervalSeconds))
p('файлов нет -> источник назван', r1.ist.maxConsecutiveCount.startsWith('САМЫЙ СТРОГИЙ'), r1.ist.maxConsecutiveCount)

fs.writeFileSync(path.join(d1, 'bit.yml'), 'predely:\n  a: [1,\n')
const r2 = fn(d1)('bit', UM)
p('битый файл -> самый строгий', r2.znach.maxPerDayCount === 1, JSON.stringify(r2.znach))
p('битый файл -> имя файла в причине', /bit\.yml/.test(r2.beda), String(r2.beda))

fs.writeFileSync(path.join(d1, 'obshchee.yml'), 'predely:\n  maxPerDayCount: 20\n  maxConsecutiveCount: 9\n')
fs.writeFileSync(path.join(d1, 'a.yml'), 'predely:\n  maxPerDayCount: 7\n')
const r3 = fn(d1)('a', UM)
p('агентский перебивает общий', r3.znach.maxPerDayCount === 7 && r3.ist.maxPerDayCount.endsWith('a.yml'),
  `${r3.znach.maxPerDayCount} / ${r3.ist.maxPerDayCount}`)
p('общий действует там, где агентского нет', r3.znach.maxConsecutiveCount === 9 && r3.ist.maxConsecutiveCount.endsWith('obshchee.yml'),
  `${r3.znach.maxConsecutiveCount} / ${r3.ist.maxConsecutiveCount}`)
p('нет ни там ни там -> умолчание кода', r3.znach.dayZone === 'Europe/Moscow' && r3.ist.dayZone === 'умолчание кода',
  `${r3.znach.dayZone} / ${r3.ist.dayZone}`)

const f5 = fn(d1)
f5('a', UM)
fs.writeFileSync(path.join(d1, 'a.yml'), 'predely:\n  maxPerDayCount: 33\n')
const buд = new Date(Date.now() + 2000)
fs.utimesSync(path.join(d1, 'a.yml'), buд, buд)
p('перечитка по mtime без перезапуска', f5('a', UM).znach.maxPerDayCount === 33,
  String(f5('a', UM).znach.maxPerDayCount))

fs.writeFileSync(path.join(d1, 'c.yml'), 'predely:\n  xyzzyCount: 5\n')
const r6 = fn(d1)('c', UM)
p('неизвестный ключ не протекает в limits', !('xyzzyCount' in r6.znach), JSON.stringify(Object.keys(r6.znach)))

fs.rmSync(d1, { recursive: true, force: true })

const shema = t.slice(t.indexOf('export const Config = z.object('), t.indexOf('\n})', t.indexOf('export const Config')))
for (const k of ['createLimit:', 'heartbeatMaxConsecutive:', 'heartbeatDayZone:', 'heartbeatHumanKinds:']) {
  p(`ключ ${k} убран из схемы моста`, !shema.includes(k), 'остался в Config')
}
p('limitsAgent объявлен в схеме', shema.includes('limitsAgent:'), 'нет в Config')

const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(SRC), '..', 'package.json'), 'utf-8'))
p('yaml объявлен в peerDependencies', Boolean(pkg.peerDependencies?.yaml),
  JSON.stringify(pkg.peerDependencies ?? {}))
p('чтение синхронное (apply синхронна)', !/async function chitatPredely/.test(t),
  'chitatPredely объявлена async — limits соберутся недоделанными')

if (fs.existsSync(SLOJ)) {
  p('слой профиля больше не задаёт пределы',
    !/heartbeatMaxConsecutive:\s*\d/.test(fs.readFileSync(SLOJ, 'utf-8')),
    'ключ остался в слое — второй источник правды')
} else {
  slep += 1
  console.log(`СЛЕПОТА слой профиля: ${SLOJ} не найден — у свежепоставленного модуля `
    + 'это норма. Проверка «пределы не задаются из слоя» пропущена.')
}
}

const ZHDYOM = 22
console.log(`\nИТОГО: сошлось ${ok}, расхождений ${bad}`)
if (ok + bad + slep !== ZHDYOM) {
  console.log(`🔴 КАНАРЕЙКА: проведено ${ok + bad + slep}, ждали ${ZHDYOM}`); process.exit(2)
}
if (slep) { console.log(`слепот: ${slep}`); process.exit(bad ? 1 : 2) }

process.exit(bad ? 1 : (slep ? 2 : 0))
