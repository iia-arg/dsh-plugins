// RU: Проверка stend-otmetki-posle: вызывает код пакета на контролируемом входе; отдельные сценарии требуют установленную платформу. Исход 2 означает отсутствие условий проверки, а не успех.
// EN: stend-otmetki-posle verification: exercises package code on controlled inputs; some cases require an installed platform. Exit 2 means missing test prerequisites, not success.


import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs, { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')
if (!existsSync(SRC)) { console.log(`СЛЕПОТА: предмета нет — ${SRC}`); process.exit(2) }
const text = fs.readFileSync(SRC, 'utf8')
console.log(`предмет: ${SRC} (sha256-16 ${createHash('sha256').update(text).digest('hex').slice(0, 16)})`)

const STOL = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-otmetki-posle-'))
process.on('exit', () => fs.rmSync(STOL, { recursive: true, force: true }))

const vyrez = (imya) => {
  let i = text.indexOf(`async function ${imya}(`)
  if (i < 0) i = text.indexOf(`function ${imya}(`)
  if (i < 0) return null
  const konec = [text.indexOf('\nfunction ', i + 1), text.indexOf('\nasync function ', i + 1)].filter((x) => x > 0)
  return text.slice(i, konec.length ? Math.min(...konec) : undefined)
}
const stroka = (nachalo) => {
  const i = text.indexOf(nachalo)
  return i < 0 ? null : text.slice(i, text.indexOf('\n', i))
}

let ok = 0, fail = 0, slep = 0
const proba = async (imya, f) => {
  try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok += 1; console.log('  ok    ' + imya) }
  catch (e) { fail += 1; console.log('  FAIL  ' + imya + ' — ' + String(e.message).slice(0, 170)) }
}
const zhurnal = []
const log = (m) => zhurnal.push(String(m))

const OTPR = path.join(STOL, 'otpravshchik')
const PISMA = path.join(STOL, 'pisma.txt')
const OTKAZ = path.join(STOL, 'otkaz')

fs.writeFileSync(OTPR, `#!${process.execPath}\nconst fs = require('fs')\nif (fs.existsSync(${JSON.stringify(OTKAZ)})) process.exit(1)\n`
  + `fs.appendFileSync(${JSON.stringify(PISMA)}, 'pismo\\n')\n`, { mode: 0o755 })
const pisem = () => (existsSync(PISMA) ? fs.readFileSync(PISMA, 'utf8').split('\n').filter(Boolean).length : 0)
const sbros = () => { fs.rmSync(PISMA, { force: true }); fs.rmSync(OTKAZ, { force: true }); zhurnal.length = 0 }

const kuskiT = [stroka('const TREVOGA_POVTOR_MS ='), stroka('const otkazIstochnika ='),
  vyrez('otmetitVozvratIstochnika'), vyrez('trevogaOtkazIstochnika')]
if (kuskiT.some((k) => k === null)) {
  slep += 1; console.log('  СЛЕПОТА Т: в предмете нет TREVOGA_POVTOR_MS / otkazIstochnika / trevogaOtkazIstochnika')
} else {
  // Аудит №7 (1.3.44): мост зовёт execFile с callback; здесь — синхронная подмена: стенд судит выдержку и письма, неблокировку — stend-trevoga-ne-blokiruet.
  const execFile = (put, argv, opt, cb) => { try { execFileSync(put, argv, opt); cb?.(null) } catch (e) { cb?.(e) } }
  const T = new Function('log', 'existsSync', 'execFile', 'process', `${kuskiT.join('\n')}
    return { trevogaOtkazIstochnika, otmetitVozvratIstochnika }`)(log, existsSync, execFile, process)
  const trevoga = (agent) => { T.trevogaOtkazIstochnika(agent, 60, 86400); return zhurnal.join('\n') }
  process.env.DSH_ALERT_CMD = OTPR
  await proba('Т1 первая тревога уходит; повтор сразу — подавлен выдержкой', async () => {
    sbros(); trevoga('t1')
    if (pisem() !== 1) throw new Error(`после первой тревоги писем ${pisem()}, ждали 1`)
    const z = trevoga('t1')
    if (pisem() !== 1) throw new Error(`повтор сразу дал писем ${pisem()}, ждали 1`)
    if (!z.includes('подавлена выдержкой')) throw new Error('повтор не назван подавленным')
  })
  await proba('Т2 отправщик отказал — письма нет; следующий вызов, отправщик починен — письмо', async () => {
    sbros(); fs.writeFileSync(OTKAZ, '')
    const z = trevoga('t2')
    if (!z.includes('НЕ ушла')) throw new Error('отказ отправщика не назван (отправщика не звали?)')
    if (pisem() !== 0) throw new Error(`при отказе писем ${pisem()}`)
    fs.rmSync(OTKAZ); trevoga('t2')
    if (pisem() !== 1) throw new Error(`после починки писем ${pisem()}, ждали 1 — тревога заглушена выдержкой`)
  })
  await proba('Т3 отправщика нет — затем появился — письмо', async () => {
    sbros(); process.env.DSH_ALERT_CMD = path.join(STOL, 'net-takogo')
    const z = trevoga('t3')
    if (!z.includes('отправщика нет')) throw new Error('отсутствие отправщика не названо')
    process.env.DSH_ALERT_CMD = OTPR; trevoga('t3')
    if (pisem() !== 1) throw new Error(`после появления отправщика писем ${pisem()}, ждали 1`)
  })
}

const kuskiO = [vyrez('ostanovkaOdinRaz'), vyrez('stopHeartbeat')]
if (kuskiO.some((k) => k === null)) {
  slep += 1; console.log('  СЛЕПОТА О: в предмете нет ostanovkaOdinRaz / stopHeartbeat')
} else {
  let raspisanie = []
  let spisokOtkaz = false
  const nativeCall = async (ctx, agent, tool, args) => {
    if (tool === 'schedule_list') { if (spisokOtkaz) throw new Error('подставной отказ schedule_list'); return raspisanie }
    if (tool === 'schedule_delete') {
      const bylo = raspisanie.length; raspisanie = raspisanie.filter((r) => r.id !== args.id)
      return { deleted: raspisanie.length < bylo }
    }
    throw new Error(`подставной nativeCall: ${tool}`)
  }
  const O = new Function('log', 'nativeCall', 'mkdirSync', 'writeFileSync', `${kuskiO.join('\n')}
    return { ostanovkaOdinRaz, stopHeartbeat }`)(log, nativeCall, mkdirSync, writeFileSync)
  const KAT = path.join(STOL, 'pisma-predela')
  const limits = (dir) => ({ heartbeatMaxConsecutive: 6, heartbeatMaxPerDay: 48, heartbeatDayZone: 'Europe/Moscow', heartbeatNoticeDir: dir })
  const pisemO = () => (existsSync(KAT) ? fs.readdirSync(KAT).filter((f) => f.endsWith('-predel-heartbeat.txt')).length : 0)
  const ostanovka = (stopped, dir) => O.ostanovkaOdinRaz(stopped, 'proba',
    () => O.stopHeartbeat({}, { id: 'proba' }, 'подставная причина', { streak: 7, perDay: 7 }, limits(dir), 1))
  const nachalo = () => { fs.rmSync(KAT, { recursive: true, force: true }); zhurnal.length = 0; spisokOtkaz = false
    raspisanie = [{ id: 's1', kind: 'every', everySeconds: 1800 }] }

  await proba('О1 остановка — напоминание снято, одно письмо; повтор не останавливает второй раз', async () => {
    nachalo(); const stopped = new Set()
    await ostanovka(stopped, KAT)
    if (raspisanie.length !== 0 || pisemO() !== 1) throw new Error(`напоминаний ${raspisanie.length}, писем ${pisemO()} (ждали 0 и 1)`)
    await ostanovka(stopped, KAT)
    if (pisemO() !== 1) throw new Error(`повтор дал писем ${pisemO()}, ждали 1`)
  })
  await proba('О2 гашение упало — следующий конец хода гасит и пишет', async () => {
    nachalo(); const stopped = new Set(); spisokOtkaz = true
    await ostanovka(stopped, KAT)
    if (!zhurnal.join('\n').includes('НЕ УДАЛОСЬ')) throw new Error('отказ гашения не назван (гашение не звали?)')
    if (raspisanie.length !== 1) throw new Error(`при отказе гашения напоминаний ${raspisanie.length}, ждали 1`)
    spisokOtkaz = false
    await ostanovka(stopped, KAT)
    if (raspisanie.length !== 0) throw new Error(`после починки напоминаний ${raspisanie.length}, ждали 0 — повтора гашения не было`)
  })
  await proba('О3 письмо не записано — следующий конец хода пишет', async () => {
    nachalo(); const stopped = new Set()
    const PLOHOJ = path.join(STOL, 'fajl-a-ne-katalog'); fs.writeFileSync(PLOHOJ, '')
    await ostanovka(stopped, path.join(PLOHOJ, 'pod'))
    if (!zhurnal.join('\n').includes('НЕ ЗАПИСАНО')) throw new Error('отказ письма не назван (письмо не пробовали?)')
    raspisanie = [{ id: 's2', kind: 'after' }]
    await ostanovka(stopped, KAT)
    if (pisemO() !== 1) throw new Error(`после починки каталога писем ${pisemO()}, ждали 1 — повтора не было`)
  })
}

console.log(`итог: ok ${ok} · FAIL ${fail} · СЛЕПОТА ${slep}`)
process.exit(fail ? 1 : slep ? 2 : 0)
