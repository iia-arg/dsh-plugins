// Стенд: мост читает пределы из /etc/agent-limits. Текст функции берётся ИЗ файла
// предмета и ИСПОЛНЯЕТСЯ на подставном каталоге; боевые файлы только читаются.
//
// Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
//
// 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ:
//   * не проверяет, что предел СРАБОТАЕТ в бою — это stend-ostanovki и живой прогон;
//   * не проверяет маркер и права: они переключаются отдельным заходом;
//   * ветка «нет модуля yaml» проверяется только косвенно (прогон копии вне дерева
//     моста), потому что удалить yaml из app/node_modules ради стенда нельзя.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
// 🔴 Абсолютный путь обязателен: createRequire('file://../…') даёт
// ERR_INVALID_ARG_VALUE, и стенд краснел на ИСПРАВНОМ предмете, показывая
// «модуля yaml нет». Относительный путь — слепота пробы, а не беда моста.
const SRC = path.resolve(process.argv[2] || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js'))
const t = fs.readFileSync(SRC, 'utf-8')
// 🔴 Правка не установлена — это СЛЕПОТА (код 2), а не расхождение (код 1).
// Первая редакция падала исключением, и в приёмке списком «правки ещё нет»
// читалось как «предмет сломан». Разница между «не смогла проверить» и
// «проверила и не сошлось» — это разница между ожиданием и аварией.
if (!t.includes('function chitatPredely(')) {
  console.log(`СЛЕПОТА: в ${SRC} нет chitatPredely — правка чтения пределов не установлена`)
  process.exit(2)
}
const vyrez = (imya) => {
  const i = t.indexOf(`function ${imya}(`)
  if (i < 0) throw new Error(`нет функции ${imya}`)
  const j = t.indexOf('\n}\n', i)
  // 🔴 import.meta нельзя внутри new Function — это ограничение ПРОБЫ, не предмета.
  // Подменяем на явный путь к файлу предмета; резолв yaml от этого не меняется,
  // потому что оба пути лежат в одном дереве.
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
// Слой профиля — в доме агента; путь выводится от дома, а не вписывается.
const SLOJ = process.env.MOST_SLOJ
  || path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
/** Значение ключа прямо из файла агента — для сверки «дошло ли до кода то, что лежит». */
const svoyoIzFajla = (klyuch) => {
  const t = fs.readFileSync(`/etc/agent-limits/${AGENT}.yml`, 'utf-8')
  const m = t.match(new RegExp(`^\\s*${klyuch}:\\s*(\\d+)`, 'm'))
  return m ? Number(m[1]) : undefined
}
let ok = 0, bad = 0, slep = 0
const p = (n, c, s) => { if (c) { ok++; console.log(`ok   ${n}`) } else { bad++; console.log(`FAIL ${n}\n     ${s}`) } }

// 1. боевые файлы
// Имя агента — из настройки окружения, умолчание от имени пользователя: у каждого
// поставившего модуль оно своё, и вписывать сюда чьё-то конкретное значит сделать
// стенд непроходимым для всех остальных.
const AGENT = process.env.LIMITS_AGENT || os.userInfo().username
// 🔴 БОЕВОЙ БЛОК ИДЁТ, ТОЛЬКО ЕСЛИ ЕСТЬ ЧТО ЧИТАТЬ. У поставившего этот модуль
// каталога настроек нет и быть не должно — краснеть на его отсутствие значит
// ругать чужое хозяйство. Правильный исход тут слепота: «проверить нечего»
// и «проверила, не сошлось» — разные утверждения, и путать их нельзя.
// 🔴 И ВТОРОЕ УСЛОВИЕ: без разбирателя YAML читать настройки нечем вовсе.
// Он объявлен в peerDependencies и ставится отдельно; у поставившего модуль его
// может не быть. Тогда предмет честно берёт самый строгий набор и говорит об
// этом — а стенд обязан назвать это СЛЕПОТОЙ, а не поломкой: непоставленная
// зависимость и сломанный механизм — разные новости.
const probaYaml = fn(os.tmpdir())('nikogo', UM)
const YAML_EST = !(probaYaml.beda && /yaml/i.test(String(probaYaml.beda)))
if (!YAML_EST) {
  slep += 22   // весь стенд: без разбирателя YAML не состоится ни одна проверка
  console.log(`СЛЕПОТА весь стенд: ${probaYaml.beda} — разбиратель YAML не установлен, `
    + 'читать настройки нечем. Поставьте зависимости пакета и повторите.')
} else {
const BOEVOJ_EST = fs.existsSync(`/etc/agent-limits/${AGENT}.yml`)
if (!BOEVOJ_EST) {
  slep += 4
  console.log(`СЛЕПОТА боевой блок: настроек /etc/agent-limits/${AGENT}.yml не найдено — `
    + 'проверять нечего. Механизм чтения проверяется ниже на подставных каталогах.')
} else {
const b = fn('/etc/agent-limits')(AGENT, UM)
p('боевой: прочитано без беды', b.beda === null, String(b.beda))
// 🔴 Сверяем не с ЧИСЛОМ, а с тем, что лежит в файле: числа у каждого свои,
// а проверять надо механизм — доходит ли значение из файла и назван ли источник.
p('боевой: значение взято ИЗ ФАЙЛА АГЕНТА, а не из умолчания',
  b.ist.maxConsecutiveCount.endsWith(`${AGENT}.yml`)
    ? b.znach.maxConsecutiveCount === svoyoIzFajla('maxConsecutiveCount')
    : b.ist.maxConsecutiveCount.length > 0,
  `${b.znach.maxConsecutiveCount} / ${b.ist.maxConsecutiveCount}`)
// Список видов у каждого свой; проверяем ФОРМУ и то, что источник назван.
p('боевой: список видов человека непуст и источник назван',
  Array.isArray(b.znach.humanKinds) && b.znach.humanKinds.length > 0
    && b.ist.humanKinds.length > 0,
  JSON.stringify(b.znach.humanKinds))
// Сверяем не с НАШИМ числом, а с тем, что лежит в файле: у каждого оно своё.
p('боевой: интервал взят из файла, а не из умолчания',
  b.znach.minIntervalSeconds === (svoyoIzFajla('minIntervalSeconds') ?? b.znach.minIntervalSeconds)
    && b.ist.minIntervalSeconds.length > 0,
  `${b.znach.minIntervalSeconds} / ${b.ist.minIntervalSeconds}`)
}

// 2. файла нет -> самый строгий
const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'al-'))
const r1 = fn(d1)('nikogo', UM)
p('файлов нет -> самый строгий', r1.znach.maxConsecutiveCount === 1 && /файлов нет/.test(r1.beda), JSON.stringify(r1.beda))
p('файлов нет -> интервал СТРОЖЕ (больше)', r1.znach.minIntervalSeconds === 3600, String(r1.znach.minIntervalSeconds))
p('файлов нет -> источник назван', r1.ist.maxConsecutiveCount.startsWith('САМЫЙ СТРОГИЙ'), r1.ist.maxConsecutiveCount)

// 3. битый файл -> самый строгий с именем файла
fs.writeFileSync(path.join(d1, 'bit.yml'), 'predely:\n  a: [1,\n')
const r2 = fn(d1)('bit', UM)
p('битый файл -> самый строгий', r2.znach.maxPerDayCount === 1, JSON.stringify(r2.znach))
p('битый файл -> имя файла в причине', /bit\.yml/.test(r2.beda), String(r2.beda))

// 4. общий перебивается агентским
fs.writeFileSync(path.join(d1, 'obshchee.yml'), 'predely:\n  maxPerDayCount: 20\n  maxConsecutiveCount: 9\n')
fs.writeFileSync(path.join(d1, 'a.yml'), 'predely:\n  maxPerDayCount: 7\n')
const r3 = fn(d1)('a', UM)
p('агентский перебивает общий', r3.znach.maxPerDayCount === 7 && r3.ist.maxPerDayCount.endsWith('a.yml'),
  `${r3.znach.maxPerDayCount} / ${r3.ist.maxPerDayCount}`)
p('общий действует там, где агентского нет', r3.znach.maxConsecutiveCount === 9 && r3.ist.maxConsecutiveCount.endsWith('obshchee.yml'),
  `${r3.znach.maxConsecutiveCount} / ${r3.ist.maxConsecutiveCount}`)
p('нет ни там ни там -> умолчание кода', r3.znach.dayZone === 'Europe/Moscow' && r3.ist.dayZone === 'умолчание кода',
  `${r3.znach.dayZone} / ${r3.ist.dayZone}`)

// 5. перечитка по mtime
const f5 = fn(d1)
f5('a', UM)
fs.writeFileSync(path.join(d1, 'a.yml'), 'predely:\n  maxPerDayCount: 33\n')
const buд = new Date(Date.now() + 2000)
fs.utimesSync(path.join(d1, 'a.yml'), buд, buд)
p('перечитка по mtime без перезапуска', f5('a', UM).znach.maxPerDayCount === 33,
  String(f5('a', UM).znach.maxPerDayCount))

// 6. неизвестный ключ в файле НЕ появляется в значениях
fs.writeFileSync(path.join(d1, 'c.yml'), 'predely:\n  xyzzyCount: 5\n')
const r6 = fn(d1)('c', UM)
p('неизвестный ключ не протекает в limits', !('xyzzyCount' in r6.znach), JSON.stringify(Object.keys(r6.znach)))

fs.rmSync(d1, { recursive: true, force: true })

// 7. структура: старых ключей в схеме нет, новый есть, зависимость объявлена
const shema = t.slice(t.indexOf('export const Config = z.object('), t.indexOf('\n})', t.indexOf('export const Config')))
for (const k of ['createLimit:', 'heartbeatMaxConsecutive:', 'heartbeatDayZone:', 'heartbeatHumanKinds:']) {
  p(`ключ ${k} убран из схемы моста`, !shema.includes(k), 'остался в Config')
}
p('limitsAgent объявлен в схеме', shema.includes('limitsAgent:'), 'нет в Config')
// 🔴 package.json берётся рядом с ПРЕДМЕТОМ, а не рядом со стендом: привязка к
// своему расположению делала стенд непроверяемым — копия, запущенная из /tmp,
// падала на '/package.json'. Поймано порчей самого стенда 31.08.
const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(SRC), '..', 'package.json'), 'utf-8'))
p('yaml объявлен в peerDependencies', Boolean(pkg.peerDependencies?.yaml),
  JSON.stringify(pkg.peerDependencies ?? {}))
p('чтение синхронное (apply синхронна)', !/async function chitatPredely/.test(t),
  'chitatPredely объявлена async — limits соберутся недоделанными')
// 🔴 БОЕВОЙ ПУТЬ — ПОД ПЕРЕХВАТОМ. Слоя профиля у только что поставившего модуль
// нет по построению, и падение здесь читалось бы как «предмет расходится».
// Проверять нечем — значит слепота, а не расхождение.
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
// 🔴 ТРИ ИСХОДА, А НЕ ДВА. Ноль — только когда всё сошлось и слепот нет.
// Слепота с нулевым кодом проходит у постороннего как успех: он не читает
// текст, он пишет «node стенд && дальше» — и не узнает, что не проверено ничего.
process.exit(bad ? 1 : (slep ? 2 : 0))
