/**
 * ПРИЁМКА ДЕЙСТВИЯ предела самопробуждения.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ stend-heartbeat.mjs. Тот покрывает СЧЁТ (полоса, сутки, пояс,
 * слово живого) и страж интервала. Он не проверяет ДЕЙСТВИЕ: снимаются ли
 * напоминания и появляется ли письмо. Значит возврат самого дефекта он не
 * поймает — поймает только следствие.
 *
 * ЧТО ПРОВЕРЯЕТСЯ: счёт растёт -> на превышении остановка -> напоминания сняты ->
 * письмо на диске -> слово живого сбрасывает -> сторож ПЕРЕВЗВОДИТСЯ (иначе
 * остановка превратилась бы в паралич).
 *
 * КОНТРОЛЬ ЗРЯЧЕСТИ ВСТРОЕН: те же данные при боевом пороге 6 НЕ останавливают.
 * Без него «остановилось» может означать «оно всегда останавливается».
 *
 * ГРАНИЦЫ. Текст функций берётся ИЗ ФАЙЛА моста, но решение об остановке
 * воспроизводится здесь: сам checkHeartbeat — замыкание внутри apply(), вырезать
 * его нельзя. Поэтому условие сверяется с текстом предмета, и при его изменении
 * стенд отдаёт СЛЕПОТУ, а не тихо проверяет свою выдумку.
 * Стенд НЕ доказывает работу предела в бою: полосы из шести автономных подряд
 * не было ни разу, боевые счётчики 0/6.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
// Путь выводится от расположения стенда: он едет вместе с предметом.
const SRC = process.env.MOST_SRC || path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'index.js')
// 🔴 ПРОГОН ОБЪЯВЛЯЕТ СВОЙ ПРЕДМЕТ. Несуществующая переменная или флаг молча
// игнорируются, и прогон идёт на умолчаниях — я трижды за неделю считала подставным
// прогон, шедший на боевом файле (MOST_KORNI вместо MOST_SRC; --karta, которого нет).
// Ни ошибки, ни признака: проверять надо не «команда отработала», а «на ТЕХ ли данных».
console.log(`предмет: ${SRC}`
  + (existsSync(SRC) ? ` (sha256-16 ${createHash('sha256').update(readFileSync(SRC)).digest('hex').slice(0, 16)})` : ' — ФАЙЛА НЕТ'))

// 🔴 Каталог для письма стенд заводит СЕБЕ САМ, а не берёт из боевого умолчания.
// Умолчание модуля — пустая строка («писать в журнал»), и стенд, полагавшийся на
// боевое значение, у поставившего модуль отказал бы ровно так же, как отказал здесь.
// Временный каталог убирается в конце: следов на чужой машине оставаться не должно.
const NOTICE = process.env.NOTICE_DIR
  || fs.mkdtempSync(path.join(os.tmpdir(), 'stend-ostanovki-'))
const NOTICE_SVOJ = process.env.NOTICE_DIR === undefined
process.on('exit', () => {
  if (NOTICE_SVOJ) { try { fs.rmSync(NOTICE, { recursive: true, force: true }) } catch { /* уже убран */ } }
})
const PORog = Number(process.env.POROG || 2)
const text = fs.readFileSync(SRC, 'utf8')

// вырезаем нужные функции ИЗ ПРЕДМЕТА
const vyrez = (imya) => {
  // 🔴 Искать НАДО и `async function`: 23.08 извлекатель уже обрезал слово async,
  // и вырезанное тело падало «await is only valid in async functions».
  let i = text.indexOf(`async function ${imya}(`)
  if (i < 0) i = text.indexOf(`function ${imya}(`)
  if (i < 0) throw new Error(`СЛЕПОТА: в файле нет function ${imya} — стенд смотрит не туда`)
  // до следующей функции верхнего уровня
  const j = text.indexOf('\nfunction ', i + 1)
  const k = text.indexOf('\nasync function ', i + 1)
  const end = Math.min(...[j, k].filter((x) => x > 0))
  return text.slice(i, end > 0 ? end : undefined)
}
const kusok = ['dayKeyFactory', 'turnLedger', 'heartbeatCounters', 'stopHeartbeat']
  .map((n) => vyrez(n.startsWith('stop') ? n : n)).join('\n\n')

// подставные сервисы формы предмета
const zhurnalLog = []
const log = (m) => zhurnalLog.push(String(m))
let raspisanie = [
  { id: 'schedule-1', kind: 'every', everySeconds: 1800 },
  { id: 'schedule-2', kind: 'after' },
]
const nativeCall = async (ctx, agent, tool, args) => {
  if (tool === 'schedule_list') return raspisanie
  if (tool === 'schedule_delete') {
    const bylo = raspisanie.length
    raspisanie = raspisanie.filter((r) => r.id !== args.id)
    return { deleted: raspisanie.length < bylo }
  }
  throw new Error(`подставной nativeCall: неизвестный инструмент ${tool}`)
}

const sobrat = new Function('log', 'nativeCall', 'mkdirSync', 'writeFileSync', `
  ${text.slice(text.indexOf('const HEARTBEAT_HUMAN_KINDS_DEFAULT'), text.indexOf('\n', text.indexOf('const HEARTBEAT_HUMAN_KINDS_DEFAULT')))}
  ${kusok}
  return { heartbeatCounters, turnLedger, stopHeartbeat, HEARTBEAT_HUMAN_KINDS_DEFAULT }
`)
const M = sobrat(log, nativeCall, mkdirSync, writeFileSync)

let ok = 0, fail = 0, slep = 0
const OK = (m) => { ok += 1; console.log('  ok    ' + m) }
const FAIL = (m) => { fail += 1; console.log('  FAIL  ' + m) }
const SLEP = (m) => { slep += 1; console.log('  СЛЕПОТА ' + m) }
const t = (m, bylo, zhdem) => (String(bylo) === String(zhdem)
  ? OK(`${m}: ${bylo}`) : FAIL(`${m}: ${bylo}, ждали ${zhdem}`))

const D = (h, m, s = 0) => Date.UTC(2026, 7, 22, h, m, s)
const ev = (type, data, time) => ({ type, data, time })
const dispatch = (t) => ev('schedule/change', { operation: 'dispatch' }, t)
const start = (n, t) => ev('turn/start', { turn: n }, t)
const end = (n, t) => ev('turn/end', { turn: n }, t)
const msg = (kind, t) => ev('user/message', { source: { kind } }, t)
const KINDS = new Set(M.HEARTBEAT_HUMAN_KINDS_DEFAULT)
const ZONE = 'Europe/Moscow'
const limits = {
  heartbeatMaxConsecutive: PORog,
  heartbeatMaxPerDay: 48,
  heartbeatDayZone: ZONE,
  heartbeatNoticeDir: NOTICE ?? '',
  heartbeatHumanKinds: KINDS,
  heartbeatMinIntervalSeconds: 1800,
}

// воспроизводим решение checkHeartbeat: условие берём ИЗ ТЕКСТА предмета
const uslovie = text.includes('const overStreak = c.streak >= limits.heartbeatMaxConsecutive')
if (!uslovie) {
  SLEP('условие overStreak в предмете изменилось — стенд проверял бы свою выдумку')
  process.exit(2)
}

const stopped = new Set()
async function hod(events, metka) {
  const c = M.heartbeatCounters(events, ZONE, D(12, 0), KINDS)
  const over = c.streak >= limits.heartbeatMaxConsecutive || c.perDay >= limits.heartbeatMaxPerDay
  let ostanovleno = false
  if (!over) { stopped.delete('proba') }
  else if (!stopped.has('proba')) {
    stopped.add('proba')
    ostanovleno = true
    // 🔴 ФИКСТУРА, А НЕ КОПИЯ БОЕВОЙ СТРОКИ. Стенд проверяет ПОВЕДЕНИЕ stopHeartbeat
    // (снял ли расписания, написал ли письмо), а причина — её входной аргумент.
    // Текст нарочно НЕ повторяет боевую формулировку: совпадение выглядело бы
    // сверкой, которой здесь нет, и молча разошлось бы при первой же правке моста.
    const why = `подставная причина: ${c.streak} подряд при пределе ${limits.heartbeatMaxConsecutive}`
    await M.stopHeartbeat({}, { id: 'proba' }, why, c, limits, 2)
  }
  console.log(`${metka.padEnd(46)} подряд ${c.streak}/${limits.heartbeatMaxConsecutive}  `
    + `${ostanovleno ? '🔴 ОСТАНОВКА' : (over ? '(уже остановлено)' : 'работаем')}  напоминаний ${raspisanie.length}`)
  return { c, ostanovleno }
}

const e = []
const CH = []          // сюда собираем исходы, чтобы судить числом, а не глазом
for (let i = 1; i <= 3; i++) {
  e.push(dispatch(D(9, i)), start(i, D(9, i)), end(i, D(9, i, 30)))
  CH.push(await hod(e, `автономное пробуждение ${i}`))
}
e.push(start(4, D(10, 0)), msg('user', D(10, 0)), end(4, D(10, 1)))
CH.push(await hod(e, 'слово человека (user)'))
// 🔴 ПАУЗА НЕ ДЛЯ КРАСОТЫ. Имя письма в предмете — `${Date.now()}-predel-heartbeat.txt`.
// Две остановки внутри одного прогона случаются в ОДНУ миллисекунду, и второе письмо
// молча перезаписывает первое: стенд плавал 11/0 против 9/2 от прогона к прогону.
// Здесь разводим полосы во времени, а сам дефект имени назван заявкой в отчёте 118.
await new Promise((r) => setTimeout(r, 3))
for (let i = 5; i <= 6; i++) {
  e.push(dispatch(D(10, i)), start(i, D(10, i)), end(i, D(10, i, 30)))
  CH.push(await hod(e, `автономное пробуждение ${i}`))
}
e.push(start(7, D(11, 0)), msg('a2a', D(11, 0)), end(7, D(11, 1)))
CH.push(await hod(e, 'слово координатора (a2a)'))

// Каталог может не существовать: при отсутствии остановки его никто не создавал.
// Падать на этом нельзя — ноль писем это ЗАКОННЫЙ исход, а не отказ стенда.
const pisma = (d) => { try { return fs.readdirSync(d).filter((f) => f.endsWith('.txt')) } catch { return [] } }

console.log('\n=== ПРОВЕРКИ ===')
const BOEVOJ = PORog >= 6      // при боевом пороге ждём ПРОТИВОПОЛОЖНОГО — это контроль зрячести
if (!BOEVOJ) {
  t('счёт растёт: первое пробуждение', CH[0].c.streak, 1)
  t('счёт растёт: второе пробуждение', CH[1].c.streak, 2)
  t('на превышении ОСТАНОВКА', CH[1].ostanovleno, true)
  t('третье пробуждение: письмо НЕ повторяется', CH[2].ostanovleno, false)
  t('напоминания сняты все', raspisanie.length, 0)
  t('слово человека (user) сбрасывает полосу', CH[3].c.streak, 0)
  t('сторож ПЕРЕВЗВЁЛСЯ: вторая полоса тоже остановлена', CH[5].ostanovleno, true)
  t('слово координатора (a2a) сбрасывает полосу', CH[6].c.streak, 0)
    const pisem = NOTICE ? pisma(NOTICE).length : 0
  t('писем ровно по одному на полосу', pisem, 2)
  if (NOTICE && pisem) {
    // Первое по имени = первая остановка: во ВТОРОМ письме законно «снимать было
    // нечего», напоминания сняты первой остановкой. Проверять надо первое.
    const txt = fs.readFileSync(`${NOTICE}/${pisma(NOTICE).sort()[0]}`, 'utf8')
    txt.includes('снято') && txt.includes('предел')
      ? OK('письмо называет снятое и предел') : FAIL('в письме нет перечня снятого или предела')
    txt.includes('НА СЕССИЮ')
      ? OK('письмо предупреждает, что предел на сессию, а не на агента')
      : FAIL('письмо не различает сессию и агента')
  } else SLEP('каталог письма не задан — проверить содержимое нечем')
} else {
  t('контроль зрячести: при боевом пороге НЕ останавливает', CH.some((x) => x.ostanovleno), false)
  t('контроль зрячести: напоминания на месте', raspisanie.length, 2)
    const pisem = NOTICE ? pisma(NOTICE).length : 0
  t('контроль зрячести: писем нет', pisem, 0)
}

const ZHDYOM = BOEVOJ ? 3 : 11
const vsego = ok + fail + slep
console.log(`\nИТОГ: ok=${ok} fail=${fail} слепота=${slep} (всего ${vsego}, ждём ${ZHDYOM})`)
if (vsego !== ZHDYOM) { console.log('🔴 КАНАРЕЙКА: часть проверок не состоялась'); process.exit(2) }
// 🔴 ТРИ ИСХОДА, А НЕ ДВА. Ноль — только когда всё сошлось и слепот нет.
// Слепота с нулевым кодом проходит у постороннего как успех: он не читает
// текст, он пишет «node стенд && дальше» — и не узнает, что не проверено ничего.
process.exit(fail ? 1 : (slep ? 2 : 0))
