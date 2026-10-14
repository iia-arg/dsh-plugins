/**
 * Стенд ЦЕПИ памяти: секретарь пишет → ядро хранит → restore читает и вставляет.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ СТЕНД. Каждое звено проверено по отдельности и зелено, но
 * ЦЕПЬ не проходила ни разу: у секретаря в стенде шва память — заглушка,
 * у restore в его стенде — поддельная таблица. Работающие звенья не складываются
 * в работающую цепь: стык между ними (класс записи, её форма, путь базы) не
 * проверяется ничем, и разойтись он может молча.
 *
 * 🔴 ПРЕДМЕТ — УСТАНОВЛЕННЫЕ пакеты в /opt/agent-plugins/node_modules, не мастерские. Поэтому
 * стенд машинный и лежит в dorabotki, а не внутри пакета: у получателя пакета
 * этих путей нет, и публиковать его нельзя.
 *
 * 🔴 ЧТО ДОКАЗЫВАЕТСЯ, А ЧТО НЕТ.
 *   доказывается: событие компакта доходит до секретаря; запись ложится В ФАЙЛ
 *     базы; restore находит её ПО КЛАССУ и вставляет в сессию.
 *   НЕ доказывается: что боевая платформа испустит эти события в таком виде.
 *     Событие здесь подаётся руками. Живой компакт этим заменить нельзя.
 *
 * 🔴 ЗАПИСЬ ПРОВЕРЯЕТСЯ ДРУГИМ СРЕДСТВОМ, чем делалась: секретарь пишет через
 * службу `pamyat`, стенд читает файл базы напрямую через node:sqlite. Тот же
 * путь туда и обратно перенёс бы слепое пятно из работы в проверку.
 *
 * Коды: 0 цепь прошла | 1 расхождение | 2 проверять нечем.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const KOREN_PLAGINOV = process.env.CEP_PLAGINY ?? '/opt/agent-plugins/node_modules'
const put = (p) => join(KOREN_PLAGINOV, p)

let ok = 0, bad = 0, slep = 0
const sud = (uslovie, imya, pochemu = '') => {
  if (uslovie) { ok++; console.log('  ok   ' + imya) }
  else { bad++; console.log('  FAIL ' + imya + (pochemu ? ' — ' + pochemu : '')) }
}
const slepo = (imya, pochemu) => { slep++; console.log('  СЛЕП ' + imya + ' — ' + pochemu) }
const itog = () => {
  console.log(`\nИТОГ: ok=${ok} расхождений=${bad} слепота=${slep}`)
  if (bad) process.exit(1)
  if (slep) process.exit(2)
  process.exit(0)
}

console.log('предмет: цепь из трёх УСТАНОВЛЕННЫХ пакетов под ' + KOREN_PLAGINOV)

// Отказ словами: молчаливое падение импорта неотличимо от «цепь не работает».
const nuzhno = [
  ['dsh-pamyat-core/src/index.js', 'ядро'],
  ['dsh-pamyat-secretary/src/index.js', 'секретарь'],
  ['dsh-pamyat-restore/src/index.js', 'restore'],
]
for (const [p, imya] of nuzhno) {
  if (!existsSync(put(p))) { slepo('на месте: ' + imya, 'нет файла ' + put(p)); itog() }
}
// cordis — тот экземпляр, который найдёт САМО ядро: в общей раскладке он поднят уровнем выше
// (node_modules/@deepseek-ai/cordis), а не лежит внутри ядра. Путь, зашитый под одну раскладку,
// ослеп при переезде плагинов в /opt/agent-plugins.
let CORDIS
try { CORDIS = createRequire(put('dsh-pamyat-core/package.json')).resolve('@deepseek-ai/cordis') }
catch (e) { slepo('на месте: cordis', 'от ядра не разрешается: ' + String(e.message).slice(0, 200)); itog() }

const { Context } = await import(CORDIS)
const core = await import(put('dsh-pamyat-core/src/index.js'))
const secretary = await import(put('dsh-pamyat-secretary/src/index.js'))
const restore = await import(put('dsh-pamyat-restore/src/index.js'))

const KAT = mkdtempSync(join(tmpdir(), 'stend-cepi-'))
process.on('exit', () => { try { rmSync(KAT, { recursive: true, force: true }) } catch {} })
const BAZA = join(KAT, 'pamyat-cepi.db')
const AGENT = 'proba-cepi'
const KLASS = 'svodka-kompakcii'
const SID = 'sess-cepi-1'
console.log('база цепи: ' + BAZA)

const koren = new Context()
koren.provide('agents'); koren.agents = {}
koren.provide('logger'); koren.logger = new Proxy(() => {}, { get: () => () => {} })

const volokna = []
try {
  volokna.push(koren.plugin(core, { putBazy: BAZA, agent: AGENT, sprashivat: [], otvechayushchegoNet: true }))
  volokna.push(koren.plugin(secretary, { klass: KLASS }))
  volokna.push(koren.plugin(restore, { restoreEnabled: true, welcomeEnabled: false, klassSvodki: KLASS }))
} catch (e) {
  slepo('три пакета монтируются на одном контексте', String(e.message).slice(0, 200)); itog()
}
sud(true, 'три пакета смонтированы на одном контексте')

// 🔴 МОНТАЖ НЕ МГНОВЕНЕН, И ЭТО СЪЕЛО ПЕРВУЮ РЕДАКЦИЮ СТЕНДА. Секретарь объявляет
// inject ['pamyat'] — cordis держит его волокно в состоянии 0 (pending), пока ядро
// не отдаст службу, и активным (2) оно становится лишь через несколько тиков.
// Событие, посланное сразу после plugin(), уходит в пустоту: подписки ещё нет.
// Снаружи это неотличимо от «секретарь не работает» — стенд показал 0 записей в
// базе и три красных строки на ИСПРАВНОЙ цепи.
// Ждём СОСТОЯНИЯ, а не времени: `setTimeout` на 50 мс прошёл бы здесь и разъехался
// на загруженной машине, вернув ту же ложную красноту в другой день.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: ожидание не лечит настоящий отказ монтажа — если волокно не
// оживёт за предел, стенд говорит СЛЕПОТУ и называет, чьё именно волокно висит.
const PREDEL_MS = 3000
const nachalo = Date.now()
while (volokna.some((f) => f && f.state !== 2)) {
  if (Date.now() - nachalo > PREDEL_MS) {
    const visyat = volokna.map((f, i) => [['ядро', 'секретарь', 'restore'][i], f?.state])
      .filter(([, st]) => st !== 2).map(([imya, st]) => `${imya}(состояние ${st})`)
    slepo('все три волокна ожили', `за ${PREDEL_MS} мс не поднялись: ${visyat.join(', ')}`); itog()
  }
  await new Promise((r) => setTimeout(r, 5))
}
sud(true, `все три волокна активны (ждали ${Date.now() - nachalo} мс)`)

const SVODKA = 'Решение: цепь памяти проверяется целиком, а не по звеньям.'
const seans = { id: SID }

// ЗВЕНО 1 — событие компакта доходит до секретаря
await koren.parallel('session/event', seans, {
  type: 'compaction/summary',
  data: {
    compactionId: 'c-cepi-1',
    summary: [{ type: 'text', text: SVODKA }],
    shadowedSeqs: [1, 2, 3],
    shadowedTokenCount: 1234,
    provider: 'deepseek', model: 'deepseek-v4-flash',
  },
})

// ЗВЕНО 2 — запись легла В ФАЙЛ (читаем базу напрямую, не через службу)
try {
  const db = new DatabaseSync(BAZA, { readOnly: true })
  const tabl = db.prepare("select name from sqlite_master where type='table'").all().map(r => r.name)
  const t = tabl.find(n => /zapis|memor|znani/i.test(n)) ?? tabl[0]
  if (!t) slepo('в базе есть таблица записей', 'таблиц нет вовсе: ' + JSON.stringify(tabl))
  else {
    const stroki = db.prepare(`select * from "${t}"`).all()
    sud(stroki.length === 1, `в файле базы ровно одна запись (таблица ${t})`, `их ${stroki.length}`)
    const z = stroki[0]
    if (z) {
      sud(String(z.klass ?? '') === KLASS, `класс записи в базе = ${KLASS}`, `в базе «${z.klass}»`)
      sud(String(z.soderzhim ?? '').includes('цепь памяти'),
          'текст сводки долетел до базы неизменённым', 'в базе: ' + String(z.soderzhim).slice(0, 80))
      sud(String(z.agent ?? '') === AGENT, `запись подписана агентом ${AGENT}`, `подписана «${z.agent}»`)
    }
  }
  db.close()
} catch (e) { slepo('база читается напрямую', String(e.message).slice(0, 200)) }

// ЗВЕНО 3 — compaction/end взводит restore
await koren.parallel('session/event', seans, {
  type: 'compaction/end', data: { compactionId: 'c-cepi-1', turn: 7 },
})

// ЗВЕНО 4 — pre-step: restore достаёт запись ИЗ ТОЙ ЖЕ базы и вставляет
let resh = null
try {
  resh = await koren.waterfall('agent/pre-step',
    { agent: { id: SID, session: { id: SID } }, turn: 8, step: 1, signal: { aborted: false } },
    async () => ({ kind: 'enter', messages: [] }))
} catch (e) { slepo('restore отработал на pre-step', String(e.message).slice(0, 200)) }

if (resh) {
  const soobshch = Array.isArray(resh.messages) ? resh.messages : []
  sud(soobshch.length === 1, 'restore добавил ровно одно сообщение', `их ${soobshch.length}`)
  const tekst = JSON.stringify(soobshch)
  sud(tekst.includes('Восстановление после компакта'), 'вставка помечена как восстановление')
  sud(tekst.includes('цепь памяти'),
      '🔴 ЦЕПЬ ЗАМКНУЛАСЬ: текст, записанный секретарём, вернулся через restore')
}
itog()
