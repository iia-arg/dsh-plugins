/**
 * RU: Стенд оповещения: подставной ctx, события платформы в той форме, что в её объявлениях. Проверяет строки
 *     тревог о сжатии, ступени заполнения, окно от платформы, состав строки, сводку, охват по сессиям и версию
 *     в строке.
 *     Запуск: node test/stend-opoveshcheniya.mjs; код 0 — всё зелёное, 1 — красные.
 * EN: Notification stand: a fake ctx, platform events in the shape of its declarations. Checks compaction alarm
 *     lines, fill stages, the window from the platform, the line composition, the summary, per-session coverage
 *     and the version in the line.
 *     Run: node test/stend-opoveshcheniya.mjs; exit 0 — all green, 1 — red.
 */
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// RU: Изоляция ДО импорта модуля: настоящий файл порогов агента (D) и настоящее состояние ступеней не являются
//     входом стенда. Каталог порогов, отказов и удач — временный, имя агента — своё, DSH_HOME и
//     STOROZHA_STUPENI_FAJL сняты.
// EN: Isolation BEFORE importing the module: the real agent threshold file (D) and the real stage state are not
//     inputs of the stand. The threshold, failure and success directories are temporary, the agent name is the
//     stand's own, DSH_HOME and STOROZHA_STUPENI_FAJL are unset.
const probaKatalog = mkdtempSync(join(tmpdir(), 'storozha-opoveshcheniya-'))
process.on('exit', () => rmSync(probaKatalog, { recursive: true, force: true }))
process.env.KOMPAKT_NASTROJKI_KATALOG = join(probaKatalog, 'D')
process.env.KOMPAKT_OTKAZY = join(probaKatalog, 'otkazy')
process.env.KOMPAKT_UDACHI = join(probaKatalog, 'udachi')
process.env.KOMPAKT_AGENT = 'stend-opoveshcheniya'
delete process.env.DSH_HOME
delete process.env.STOROZHA_STUPENI_FAJL
const { apply, Config } = await import('../src/index.js')

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const v = telo()
  if (v && typeof v.then === 'function') { bed += 1; console.log(`❌ ${imya}: тело ОЖИДАЮЩЕЕ при синхронном прогонщике`); return }
  if (v === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${v}`) }
}

/**
 * RU: Подставной ctx той же природы, что живой: on('session/event', …), logger, get('conversationSessions'),
 *     effect.
 * EN: A fake ctx of the same nature as the live one: on('session/event', …), logger,
 *     get('conversationSessions'), effect.
 */
// RU: СТЕНД ВЫГРУЖАЕТ ПРЕДЫДУЩИЙ ПОДСТАВНОЙ МОНТАЖ. Страж одиночного монтажа ключует по имени агента и в
//     пределах процесса пропускает второй монтаж того же имени. Вызовы stend() — ПОСЛЕДОВАТЕЛЬНЫЕ жизни, а не
//     одновременные, поэтому перед новым монтажом зовём очистки ctx.effect предыдущего — то, что делает
//     платформа при выгрузке.
//     Прежде здесь звались обработчики ctx.on('dispose') — события, которого в cordis 4.0.1 нет: предмет снимал
//     ключ по выдуманному событию, стенд это событие сам и слал — зелёный при мёртвом механизме. 'dispose'
//     здесь больше не шлётся; настоящий порядок выгрузки проверяет stend-vygruzki.mjs на настоящем cordis.
//     Имя агента при этом НЕ подменяем: подмена сносит пробу «агент не назван», которая проверяет как раз
//     пустое имя (это уже случалось, и стенд это поймал).
// EN: THE STAND UNLOADS THE PREVIOUS FAKE MOUNT. The single-mount guard keys on the agent name and skips a
//     second mount of the same name within a process. stend() calls are SEQUENTIAL lives, not simultaneous
//     ones, so before a new mount we call the ctx.effect cleanups of the previous one — what the platform does
//     on unload.
//     Previously ctx.on('dispose') handlers were called here — an event cordis 4.0.1 does not have: the subject
//     removed the key on an invented event, and the stand itself sent that event — green with a dead mechanism.
//     'dispose' is no longer sent here; the real unload order is checked by stend-vygruzki.mjs on real cordis.
//     The agent name is NOT substituted: substitution breaks the "agent not named" probe, which checks exactly
//     the empty name (this has happened before and the stand caught it).
let razmontirovatPredydushchij = null
function stend(nastrojki = {}, marshrut = 'net', archived = () => false) {
  if (razmontirovatPredydushchij) { razmontirovatPredydushchij(); razmontirovatPredydushchij = null }
  const stroki = []
  const slushateli = []
  const disposery = []
  const ctx = {
    get: name => name === 'conversationSessions' ? {isArchived:archived} : undefined,
    logger: { info: (s) => stroki.push(s) },
    on: (imya, fn) => {
      if (imya === 'session/event') slushateli.push(fn)
      return () => {}
    },
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposery.push(d); return () => {} },
  }
  const cfg = new Config(nastrojki)
  let api; const originalLog = console.log
  try { console.log = (...args) => stroki.push(args.join(' ')); api = apply(ctx, cfg) }
  finally { console.log = originalLog }
  razmontirovatPredydushchij = () => { for (const f of disposery) f() }
  // RU: Подставная сессия отвечает тем же методом, что живая: requestContext() — «latest resolved route
  //     metadata» платформы. Четыре состояния взяты из её объявления: метода нет вовсе ('bez-metoda') ·
  //     маршрута ещё не было ('net') · маршрут есть, окна нет — поле необязательное ('bez-okna') · окно
  //     объявлено числом.
  // EN: The fake session answers with the same method as a live one: requestContext() — the platform's "latest
  //     resolved route metadata". Four states come from its declaration: no method at all ('bez-metoda') · no
  //     route yet ('net') · a route without a window — the field is optional ('bez-okna') · a window declared
  //     as a number.
  const sessiya = marshrut === 'bez-metoda' ? { id: 's1' }
    : { id: 's1', requestContext: () => marshrut === 'net' ? undefined
        : (typeof marshrut === 'number'
            ? { provider: 'p1', model: 'm-okno', contextWindow: marshrut }
            : { provider: 'p1', model: 'm-bez-okna' }) }
  // RU: ФОРМА СОБЫТИЯ — ИЗ ОБЪЯВЛЕНИЯ ПЛАТФОРМЫ: поле времени называется `time` (SessionEvent: { type, seq,
  //     time, data }, миллисекунды Unix). Прежде и стенд, и предмет писали выдуманное `timestamp`, и проба
  //     стерегла выдумку: длительность была «не измерима» у всех сжатий и в работе тоже, а стенд был зелёным.
  //     Нашёл прогон на живом журнале, не стенд.
  //     Метки времени реалистичные, а не 1000/4000: предмет отвергает время раньше 2020 года (иначе Date.parse
  //     строки неожиданной формы даёт годную дату тысячного года и мусорную длительность). Условные малые числа
  //     проходили бы мимо этой границы. Смещения — в миллисекундах от BAZA.
  // EN: THE EVENT SHAPE COMES FROM THE PLATFORM DECLARATION: the time field is called `time` (SessionEvent: {
  //     type, seq, time, data }, Unix milliseconds). Previously both the stand and the subject used an invented
  //     `timestamp`, and the probe guarded the fiction: duration was "not measurable" for all compactions in
  //     production too, while the stand was green. A run over a live journal found it, not the stand.
  //     Timestamps are realistic, not 1000/4000: the subject rejects times before 2020 (otherwise Date.parse of
  //     an oddly shaped string yields a valid year-1000 date and a garbage duration). Small placeholder numbers
  //     would bypass that boundary. Offsets are milliseconds from BAZA.
  const BAZA = 1788000000000
  const podat = (type, data, time, sid) => slushateli.forEach((f) =>
    f(sid ? { ...sessiya, id: sid } : sessiya,
      { type, data, time: typeof time === 'number' ? BAZA + time : time }))
  return { stroki, podat, api }
}

// RU: ПРОБЫ ИЩУТ СТРОКУ СОБЫТИЯ, А НЕ ПОСЛЕДНЮЮ. Сторож печатает СВОДКУ после каждого завершённого сжатия, и
//     «последняя строка» стала указывать на её хвост: однажды 13 проб покраснели разом на исправном предмете,
//     все с одним и тем же чужим текстом. Признак по ПОЗИЦИИ ломается от любого добавления вывода; здесь он
//     заменён признаком по ПРЕДМЕТУ — последняя строка, не принадлежащая сводке.
// EN: PROBES LOOK FOR THE EVENT LINE, NOT THE LAST ONE. The guard prints a SUMMARY after every finished
//     compaction, and "the last line" started pointing at its tail: once 13 probes turned red at the same time
//     on a correct subject, all with the same foreign text. A POSITION-based sign breaks on any added output;
//     here it is replaced by a SUBJECT-based one — the last line that does not belong to the summary.
const SVODKA = /\]\s{2,}|\] сводка сторожа/
const sobytie = (t) => [...t.stroki].reverse().find((s) => !SVODKA.test(s)) ?? '(строк нет)'

proba('контроль: подъём называет себя и состояние стока', () => {
  const { stroki } = stend()
  // RU: Проба однажды стерегла ТЕКСТ, который оказался ложным: дословное «сток НЕ задан» называло упущение там,
  //     где мог стоять намеренно пустой komandaStoka, и лечение строки роняло стенд — проба защищала дефект, а
  //     не предмет. Потом состояний стало ТРИ (задан · выключен намеренно · не задан вовсе), и проба снова чуть
  //     не стала замком. Теперь стережём ФАКТ — что состояние стока НАЗВАНО, — а перечень слов держим полным
  //     списком исходов.
  // EN: This probe once guarded a TEXT that turned out to be false: the literal "sink NOT set" named an
  //     omission where a deliberately empty komandaStoka could stand, and fixing the line broke the stand — the
  //     probe protected the defect, not the subject. Then there became THREE states (set · deliberately off ·
  //     not set at all), and the probe nearly became a lock again. Now we guard the FACT that the sink state is
  //     NAMED, and keep the word list as the full list of outcomes.
  return (stroki.some((s) => s.includes('подъём') && /сток (задан|ПУСТ|НЕ ЗАДАН|ВЫКЛЮЧЕН)/.test(s))) || 'строки подъёма нет'
})

proba('естественное сжатие: вид, объём, модель — в одной строке', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k1' }, 1000)
  t.podat('compaction/summary', { compactionId: 'k1', shadowedTokenCount: 5000, model: 'm-1', usage: { inputTokens: 10, outputTokens: 4 } }, 3000)
  t.podat('compaction/end', { compactionId: 'k1', turn: 7 }, 4500)
  const s = sobytie(t)
  return (s.includes('естественное') && s.includes('5000') && s.includes('m-1') && s.includes('14 ток.')) || `вышло: ${s}`
})

proba('Х7.2: сводка вышло N зн. и дистилляция не наблюдается — в строке', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'kX' }, 1000)
  t.podat('compaction/summary', { compactionId: 'kX', shadowedTokenCount: 5000, model: 'm-1',
    usage: { inputTokens: 10, outputTokens: 4 }, summary: [{ type: 'text', text: 'сводка на 25 знаков ровно' }] }, 3000)
  t.podat('compaction/end', { compactionId: 'kX', turn: 7 }, 4500)
  const s = sobytie(t)
  return (s.includes('сводка вышло 25 зн.') && s.includes('дистилляция: сторож её НЕ наблюдает')) || `вышло: ${s}`
})

proba('принудительное отличается от естественного', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k2', sourceCommandId: 'c9' }, 2000)
  return sobytie(t).includes('ПРИНУДИТЕЛЬНОЕ') || `вышло: ${sobytie(t)}`
})

proba('🔴 расход не сообщён → сказано словами, ноль НЕ печатается', () => {
  const t = stend()
  t.podat('compaction/summary', { compactionId: 'k3', shadowedTokenCount: 100, model: 'm' }, 1000)
  t.podat('compaction/end', { compactionId: 'k3' }, 2000)
  const s = sobytie(t)
  return (s.includes('НЕ СООБЩЁН') && !s.includes('расход 0')) || `вышло: ${s}`
})

proba('🔴 провал НЕ считается сжатием и называет причину', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k4', error: 'провайдер отказал' }, 1000)
  const s = sobytie(t)
  return (s.includes('ПРОВАЛИЛАСЬ') && s.includes('провайдер отказал') && !s.includes('естественное')) || `вышло: ${s}`
})

proba('🔴 обрезка — отдельный вид, расхода нет ПО ПРИРОДЕ', () => {
  const t = stend()
  t.podat('compaction/prune', { shadowedTokenCount: 800, shadowedSeqs: [1, 2, 3] }, 1000)
  const s = sobytie(t)
  return (s.includes('ОБРЕЗКА') && s.includes('800') && s.includes('ПО ПРИРОДЕ')) || `вышло: ${s}`
})

proba('длительность названа своим именем, а не «работой модели»', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k5' }, 1000)
  t.podat('compaction/end', { compactionId: 'k5' }, 4000)
  return sobytie(t).includes('ЗАПИСЯМИ В ЖУРНАЛ') || `вышло: ${sobytie(t)}`
})

proba('🔴 без метки начала длительность НЕ измерима, а не нулевая', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k6' }, 4000)
  const s = sobytie(t)
  return (s.includes('не измерима') && !s.includes('0.0 с')) || `вышло: ${s}`
})

proba('ступень заполнения кричит один раз и называет свой счёт', () => {
  // RU: Проба переписана под правило «одно сообщение на одно событие». Прежняя искала текст «ступень 85%» и
  //     покраснела, когда поведение стало ЛУЧШЕ: один скачок перешагивает обе ступени разом, и теперь про них
  //     одно сообщение. Проба была написана под текст, а не под смысл.
  // EN: The probe was rewritten for the rule "one message per event". The earlier one searched for the text
  //     "stage 85%" and turned red when behaviour got BETTER: one jump crosses both stages at once, and now
  //     there is one message about them. The probe had been written for the text, not the meaning.
  const t = stend({ predel: 1000, stupeni: [0.85, 0.9] })
  t.podat('turn/end', { usage: { inputTokens: 870 } }, 1)   // RU: 87% — только первая ступень · EN: 87% — the first stage only
  t.podat('turn/end', { usage: { inputTokens: 880 } }, 2)   // RU: 88% — фронт уже пройден, молчим · EN: 88% — the edge is already crossed, stay silent
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (kriki.length !== 1) return `криков ${kriki.length}: ${kriki.join(' | ')}`
  if (!/перешагнул 85%/.test(kriki[0])) return 'не названа перейдённая ступень: ' + kriki[0]   // RU: текст в единицах владельца · EN: text in the owner's units
  return kriki[0].includes('счёт СВОЙ') || 'не сказано, что счёт свой: ' + kriki[0]
})

proba('В2: ОБЕ ступени одним скачком → ОДНО сообщение, а не два', () => {
  // RU: Скачок 800 000 → 950 000 в масштабе стенда: сразу 95% при ступенях 85 и 90.
  // EN: The 800 000 → 950 000 jump at stand scale: straight to 95% with stages 85 and 90.
  const t = stend({ predel: 1000, stupeni: [0.85, 0.9] })
  t.podat('turn/end', { usage: { inputTokens: 950 } }, 1)
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (kriki.length !== 1) return `сообщений ${kriki.length}, ожидалось одно: ${kriki.join(' | ')}`
  if (!/85% \([^)]*\) и 90%/.test(kriki[0])) return 'в одном сообщении названы не обе ступени: ' + kriki[0]   // RU: при каждой ступени её порог в скобках · EN: each stage with its threshold in brackets
  return /ОДНИМ скачком/.test(kriki[0]) || 'не сказано, что переход был одним скачком: ' + kriki[0]
})

proba('В0: после ОБРЕЗКИ ступень объявляется СНОВА (фронт сброшен)', () => {
  // RU: Первая редакция этой пробы была слепа — поймано порчей, а не чтением. Ожидалось, что несброс даёт
  //     ЛОЖНУЮ тревогу, и проверялось «криков 0». Но usage события несёт ПОЛНОЕ текущее заполнение (vzyato
  //     заменяется, а не накапливается), и после обрезки число само становится малым: ложной тревоги не бывает
  //     по построению, проба зеленела и с порчей, и без.
  //     Настоящая цена несброса обратная: перейдённая ступень остаётся «отданной», и при ПОВТОРНОМ наборе того
  //     же объёма тревоги НЕ будет. Теряется не ложный крик, а нужный.
  // EN: The first version of this probe was blind — caught by deliberate breakage, not by reading. It expected
  //     the missing reset to cause a FALSE alarm and checked "0 alarms". But the event usage carries the FULL
  //     current fill (vzyato is replaced, not accumulated), and after a prune the number becomes small by
  //     itself: a false alarm cannot happen by construction, so the probe was green with and without the
  //     breakage.
  //     The real cost of the missing reset is the opposite: a crossed stage stays "reported", and when the same
  //     volume is reached AGAIN there will be NO alarm. What is lost is not a false shout but a needed one.
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 1)          // RU: 90% — тревога №1 · EN: 90% — alarm #1
  t.podat('compaction/prune', { shadowedTokenCount: 800 }, 2) // RU: обрезка: контекст урезан · EN: prune: the context is cut
  t.podat('turn/end', { usage: { inputTokens: 100 } }, 3)          // RU: 10% — тихо · EN: 10% — quiet
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 4)          // RU: снова 90% — тревога №2 · EN: 90% again — alarm #2
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  return kriki.length === 2 || `тревог ${kriki.length}, ожидалось 2 (после обрезки фронт обязан сброситься): ${kriki.join(' | ')}`
})

proba('🔴 предел не задан → доля не считается и ступени молчат', () => {
  const t = stend({ predel: 0 })
  t.podat('turn/end', { usage: { inputTokens: 999999 } }, 1)
  return !t.stroki.some((s) => s.includes('ЗАПОЛНЕНИЕ')) || 'ступень сработала без объявленного предела'
})


// RU: ── СВОДКА: ОБЛАСТЬ, ЧИСЛИТЕЛЬ, ЗНАМЕНАТЕЛЬ ──
//     «Сжатий N» без «ходов M» не значит ничего: ноль тревог при четырёх ходах и при четырёхстах — разные
//     новости. И «не проверял» обязано печататься ВСЕГДА, иначе тишина читается как «всё хорошо». Пробы держат
//     оба конца: числа считаются и границы называются.
// EN: ── SUMMARY: SCOPE, NUMERATOR, DENOMINATOR ──
//     "N compactions" without "M turns" means nothing: zero alarms over four turns and over four hundred are
//     different news. And "not checked" must ALWAYS be printed, otherwise silence reads as "all is well". The
//     probes hold both ends: numbers are counted and boundaries are named.

proba('ЗНАМЕНАТЕЛЬ: ходы считаются и стоят рядом с числом сжатий', () => {
  const { podat, api } = stend()
  for (let i = 0; i < 5; i++) podat('turn/start', {})
  podat('compaction/start', { compactionId: 'c1' }, 1000)
  podat('compaction/summary', { compactionId: 'c1', shadowedTokenCount: 10, usage: { inputTokens: 1 } })
  podat('compaction/end', { compactionId: 'c1' }, 3000)
  const t = api.svodkaStorozha()
  if (!/сжатий 1 /.test(t)) return 'числа сжатий нет: ' + t.slice(0, 200)
  if (!/ЗНАМЕНАТЕЛЬ: ходов 5/.test(t)) return 'знаменателя нет или он не тот: ' + t.slice(0, 300)
  return true
})

proba('виды НЕ складываются: обрезка и провал считаются отдельно от сжатий', () => {
  const { podat, api } = stend()
  podat('compaction/prune', { shadowedTokenCount: 7 })
  podat('compaction/end', { compactionId: 'x', error: 'сеть' }, 2000)
  const c = api.schet()
  if (c.estestvennyh !== 0) return 'обрезка или провал попали в естественные: ' + JSON.stringify(c)
  if (c.obrezok !== 1 || c.provalov !== 1) return 'счёт видов не тот: ' + JSON.stringify(c)
  return true
})

proba('ОБЛАСТЬ и «НЕ проверял» печатаются ВСЕГДА, даже при нуле событий', () => {
  const { api } = stend()
  const t = api.svodkaStorozha()
  if (!/область: события ЭТОГО процесса/.test(t)) return 'области нет';
  if (!/НЕ проверял:/.test(t)) return 'строки «не проверял» нет при нуле — тишина прочтётся как «всё хорошо»'
  if (!/сжатий 0 /.test(t)) return 'ноль не назван числом'
  if (!/ЗНАМЕНАТЕЛЬ: ходов 0/.test(t)) return 'знаменатель при нуле не напечатан'
  return true
})

proba('🔴 начатое и НЕ завершённое сжатие названо числом [с живого: 05.09 14:00:44, оборвано перезапуском]', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'oborvano' }, 1000)
  const v = t.api.svodkaStorozha()
  if (!/начато и НЕ завершено: 1/.test(v)) return 'незавершённое не названо: ' + v.slice(0, 200)
  if (!/не вошли в «сжатий N»/.test(v)) return 'не сказано, что оно не попало ни в один разряд'
  if (!/сжатий 0 /.test(v)) return 'счёт сжатий должен остаться 0 — конца не было'
  return true
})

proba('при нуле незавершённых строка ВСЁ РАВНО печатается, без крика [предусмотрительность]', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k' }, 1000)
  t.podat('compaction/end', { compactionId: 'k', turn: 1 }, 2000)
  const v = t.api.svodkaStorozha()
  if (!/начато и НЕ завершено: 0/.test(v)) return 'ноль не напечатан — «не было» станет неотличимо от «не считали»'
  if (/не вошли в «сжатий N»/.test(v)) return 'при нуле крик лишний: научит не смотреть'
  return true
})

proba('сводка НЕ выдаёт себя за суточную: счёт живёт в памяти процесса', () => {
  const { api } = stend()
  const t = api.svodkaStorozha()
  if (!/с подъёма процесса/.test(t)) return 'не сказано, с какого момента счёт'
  if (!/НЕ за сутки/.test(t)) return 'не сказано, что это НЕ сутки — а спросят именно про сутки'
  return true
})

proba('у ступеней заполнения знаменателя НЕТ, и это названо', () => {
  const { api } = stend()
  const t = api.svodkaStorozha()
  if (!/у них знаменателя НЕТ/.test(t)) return 'про отсутствие знаменателя у ступеней не сказано'
  return true
})


// RU: ── ОКНО — У ПЛАТФОРМЫ, А НЕ ЧИСЛОМ В НАСТРОЙКЕ ──
//     Пара проб, а не одна: признак ломается в обе стороны. Перестанем спрашивать платформу — тихо вернёмся к
//     устаревшему числу; перестанем брать настройку — потеряем единственную опору там, где платформа окна не
//     объявила.
//     Файла порогов D в стенде нет, поэтому база ступеней здесь — окно (с пометкой «порог сжатия НЕ ПРОЧИТАН»).
// EN: ── THE WINDOW COMES FROM THE PLATFORM, NOT A CONFIGURED NUMBER ──
//     A pair of probes, not one: the sign breaks both ways. Stop asking the platform — and we silently return
//     to a stale number; stop using the setting — and we lose the only basis where the platform has not
//     announced a window.
//     There is no threshold file D in the stand, so the stage base here is the window (marked "порог сжатия НЕ
//     ПРОЧИТАН", compaction threshold NOT READ).

proba('В5: окно берётся У ПЛАТФОРМЫ, а не из настройки', () => {
  // RU: Настройка говорит 1000, платформа — 2000. При 1700 ток. доля по настройке была бы 170%, по платформе —
  //     85%: тревога в обоих случаях, различает ПЕЧАТЬ — чьё окно взято.
  // EN: The setting says 1000, the platform 2000. At 1700 tokens the share would be 170% by the setting and 85%
  //     by the platform: an alarm either way; what tells them apart is the PRINTED text — whose window was
  //     used.
  const t = stend({ predel: 1000, stupeni: [0.85] }, 2000)
  t.podat('turn/end', { usage: { inputTokens: 1700 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (k.length !== 1) return `криков ${k.length}: ${k.join(' | ')}`
  if (!/ОКНА 2 000/.test(k[0])) return 'считает не по окну платформы: ' + k[0]   // RU: без файла порогов база — окно, число по-русски · EN: without a threshold file the base is the window, number in Russian format
  return /окно — платформа, модель m-okno/.test(k[0]) || 'источник окна не назван: ' + k[0]
})

proba('В5: платформа окна НЕ объявила → берётся настройка, и это ПОМЕЧЕНО', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] }, 'bez-okna')
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (k.length !== 1) return `криков ${k.length}`
  if (!/ОКНА 1 000/.test(k[0])) return 'запасное число не взято: ' + k[0]   // RU: запасное окно из настройки · EN: fallback window from the setting
  return /окно — НАСТРОЙКА \(платформой не подтверждена/.test(k[0])
    || 'не помечено, что число ничем не подтверждено: ' + k[0]
})

proba('🔴 В5: настройка РАСХОДИТСЯ с окном платформы → сказано один раз', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] }, 2000)
  t.podat('turn/end', { usage: { inputTokens: 1700 } }, 1)
  t.podat('turn/end', { usage: { inputTokens: 1900 } }, 2)
  const r = t.stroki.filter((s) => s.includes('РАСХОДИТСЯ'))
  if (r.length !== 1) return `сообщений о расхождении ${r.length}, ожидалось одно`
  return (/1000/.test(r[0]) && /2000/.test(r[0])) || 'названы не оба числа: ' + r[0]
})

proba('🔴 нет ни окна платформы, ни настройки → СЛЕПОТА словами, не тишина', () => {
  const t = stend({ predel: 0 }, 'net')
  t.podat('turn/end', { usage: { inputTokens: 999999 } }, 1)
  const sl = t.stroki.filter((s) => s.includes('ступени НЕ считаются'))
  if (sl.length !== 1) return `строк слепоты ${sl.length}, ожидалась одна (и один раз, а не на каждый ход)`
  if (!/не мерил/.test(sl[0])) return 'не сказано, что молчание значит «не мерил»: ' + sl[0]
  return !t.stroki.some((s) => s.includes('ЗАПОЛНЕНИЕ')) || 'ступень сработала без окна'
})

proba('🔴 у сессии нет requestContext() — это про НАС, и причина другая', () => {
  const t = stend({ predel: 0 }, 'bez-metoda')
  t.podat('turn/end', { usage: { inputTokens: 10 } }, 1)
  const sl = t.stroki.find((s) => s.includes('ступени НЕ считаются'))
  if (!sl) return 'слепота не названа вовсе'
  return /спросить платформу нечем/.test(sl)
    || 'причина не различает «нас нечем спросить» и «модель не объявила»: ' + sl
})

// RU: ── СОСТАВ СТРОКИ ТРЕВОГИ: агент, id сжатия, маршрут ──
// EN: ── ALARM LINE COMPOSITION: agent, compaction id, route ──

proba('В1: агент стоит в КАЖДОЙ тревоге, а не в одной', () => {
  const t = stend({ agent: 'podstavnoj-agent' })
  t.podat('compaction/end', { compactionId: 'a1' }, 1000)
  t.podat('compaction/prune', { shadowedTokenCount: 5 }, 2000)
  t.podat('compaction/end', { compactionId: 'a2', error: 'сеть' }, 3000)
  const trevogi = t.stroki.filter((s) => !s.includes('подъём:') && !SVODKA.test(s))
  if (trevogi.length !== 3) return `тревог ${trevogi.length}, ожидалось 3`
  const bez = trevogi.filter((s) => !s.includes('агент podstavnoj-agent'))
  return bez.length === 0 || `без агента ${bez.length}: ${bez.join(' | ')}`
})

proba('🔴 В1: агент не назван → так и написано, а не тишина', () => {
  const t = stend({})
  t.podat('compaction/end', { compactionId: 'b1' }, 1000)
  return sobytie(t).includes('агент НЕ НАЗВАН')
    || 'строка без агента и без признания в этом: ' + sobytie(t)
})

proba('В1: id сжатия в строке — иначе её не сшить с журналом', () => {
  const t = stend({ agent: 'podstavnoj-agent' })
  t.podat('compaction/end', { compactionId: 'k-77' }, 1000)
  return sobytie(t).includes('id k-77') || 'id нет: ' + sobytie(t)
})

proba('🔴 В1: маршрут помечен как «на момент чтения», а не как маршрут сжатия', () => {
  const t = stend({ agent: 'podstavnoj-agent' }, 2000)
  t.podat('compaction/end', { compactionId: 'k-78' }, 1000)
  const s = sobytie(t)
  if (!s.includes('маршрут сейчас p1')) return 'провайдера нет: ' + s
  return /не обязательно тот, которым сжимали/.test(s)
    || 'маршрут выдан за маршрут сжатия — это утверждение сверх замера: ' + s
})


// RU: ── СТУПЕНИ СЧИТАЮТСЯ ПО ДАВЛЕНИЮ, А НЕ ПО РАСХОДУ ВЫЗОВА ──
//     Пара проб, потому что дефект ломается в обе стороны: возьмём расход вместо давления — доля завысится на
//     весь выход и ступень закричит раньше срока; возьмём один вход без кэша — доля занизится и ступень
//     опоздает.
// EN: ── STAGES FOLLOW PRESSURE, NOT THE SPEND OF A CALL ──
//     A pair of probes because the defect breaks both ways: use spend instead of pressure — the share is
//     inflated by the whole output and the stage fires early; use input alone without cache — the share is
//     understated and the stage is late.

proba('🔴 выход модели в заполнение НЕ входит: ступень молчит', () => {
  // RU: Вход 500 из 1000 = 50%, выход 600. По расходу вышло бы 110% — ложная тревога.
  // EN: Input 500 of 1000 = 50%, output 600. By spend it would be 110% — a false alarm.
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 500, outputTokens: 600 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  return k.length === 0 || `ступень закричала на выходе модели: ${k.join(' | ')}`
})

proba('кэш в заполнение ВХОДИТ: он занимает контекст так же, как вход', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 500, cacheReadTokens: 400 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (k.length !== 1) return `криков ${k.length}, ожидался 1 (500+400=900 из 1000)`
  return /занято 900 /.test(k[0]) || 'кэш не учтён: ' + k[0]   // RU: занято — вход плюс кэш · EN: occupied — input plus cache
})

proba('🔴 величина названа в самой строке — «вход+кэш, БЕЗ выхода»', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 1)
  const k = t.stroki.find((s) => s.includes('ЗАПОЛНЕНИЕ'))
  return /вход\+кэш, БЕЗ выхода/.test(k)
    || 'доля напечатана без имени величины — читающий примет её за расход: ' + k
})

proba('🔴 поля usage не из объявления платформы → названы вслух, один раз', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 100, vydumannoe: 7 } }, 1)
  t.podat('turn/end', { usage: { inputTokens: 200, vydumannoe: 8 } }, 2)
  const ch = t.stroki.filter((s) => s.includes('не объявленные платформой'))
  if (ch.length !== 1) return `сообщений ${ch.length}, ожидалось одно`
  return /vydumannoe/.test(ch[0]) || 'поле не названо поимённо: ' + ch[0]
})


proba('архив /new назван, молчание архива не тревожит; возврат контроля', () => {
  let archived=false;const t=stend({},'net',()=>archived);t.podat('turn/start',{},1,'old');
  const now=Date.now;Date.now=()=>now()+7200000;
  try {if(!t.api.svodkaStorozha().includes('МОЛЧИТ'))return 'контроль не покраснел';archived=true;
    const text=t.api.svodkaStorozha();if(!text.includes('прежний разговор /new')||text.includes('МОЛЧИТ'))return 'архив не различён';
    archived=false;return t.api.svodkaStorozha().includes('МОЛЧИТ')||'возврат не виден';
  }finally{Date.now=now}
})

// RU: ── ОХВАТ ПО СЕССИЯМ ──
//     Пара проб: разряд обязан и СЧИТАТЬ виденное, и НАЗЫВАТЬ, чего он не видит. Без второго «видел 1»
//     прочтётся как «на машине один агент» — а это про сессии ЭТОГО процесса, чужих агентов сторож не видит ни
//     одним событием.
// EN: ── PER-SESSION COVERAGE ──
//     A pair of probes: the category must both COUNT what it saw and NAME what it does not see. Without the
//     second, "saw 1" would read as "one agent on the machine" — while it is about sessions of THIS process;
//     the guard sees no other agents through any event.

proba('В4: сессии считаются, и каждая названа с числом событий', () => {
  const t = stend()
  t.podat('turn/start', {}, 1, 'seans-a')
  t.podat('turn/start', {}, 2, 'seans-a')
  t.podat('turn/start', {}, 3, 'seans-b')
  const spisok = t.api.sessii()
  if (spisok.length !== 2) return `сессий ${spisok.length}, ожидалось 2: ${JSON.stringify(spisok)}`
  const a = spisok.find((x) => x.id === 'seans-a')
  if (!a || a.sobytij !== 2) return 'события сессии сосчитаны не поштучно: ' + JSON.stringify(spisok)
  const sv = t.api.svodkaStorozha()
  return (/ОХВАТ ПО СЕССИЯМ: видел 2/.test(sv) && /seans-a/.test(sv) && /seans-b/.test(sv))
    || 'в сводке нет охвата или имён: ' + sv.slice(-200)
})

proba('🔴 В4: сказано, что это СЕССИИ, а не агенты машины', () => {
  const t = stend()
  t.podat('turn/start', {}, 1, 'seans-a')
  const sv = t.api.svodkaStorozha()
  if (!/НЕ агенты машины/.test(sv)) {
    return 'разряд не оговаривает область — «видел 1» прочтётся как «на машине один агент»'
  }
  return /чужих агентов сторож не видит/.test(sv) || 'не сказано, что чужих не видно вовсе'
})

proba('охват печатается и при НУЛЕ событий', () => {
  const sv = stend().api.svodkaStorozha()
  return /ОХВАТ ПО СЕССИЯМ: видел 0 \(ни одной/.test(sv)
    || 'при нуле строки нет — молчание прочтётся как «всё видно»: ' + sv.slice(-160)
})


// RU: ── ФОРМА СОБЫТИЯ ВЗЯТА У ПЛАТФОРМЫ ──
//     Проба-сторож против того, на чём пакет уже попался ДВАЖДЫ: usage писался выдуманными именами полей, время
//     — полем `timestamp` вместо объявленного `time`. Оба раза стенд был зелёным, потому что подставные данные
//     писала та же рука, что и предмет. Ловил не стенд, а прогон на живом журнале.
// EN: ── THE EVENT SHAPE IS TAKEN FROM THE PLATFORM ──
//     A guard probe against what this package has already been caught on TWICE: usage written with invented
//     field names, time with a `timestamp` field instead of the declared `time`. Both times the stand was green
//     because the fake data was written by the same hand as the subject. A run over a live journal caught it,
//     not the stand.

proba('🔴 время берётся из поля time (объявление платформы), а не из выдуманного timestamp', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'z1' }, 1000)
  t.podat('compaction/end', { compactionId: 'z1' }, 4000)
  const s = sobytie(t)
  if (!/длительность 3\.0 с/.test(s)) return 'длительность по полю time не посчиталась: ' + s
  // RU: И обратная сторона: событие без метки времени не должно тихо давать 0.
  // EN: And the other side: an event without a timestamp must not silently give 0.
  const t2 = stend()
  t2.podat('compaction/end', { compactionId: 'z2' }, undefined)
  return /не измерима/.test(sobytie(t2))
    || 'без метки времени длительность выдана числом, а не «не измерима»'
})


proba('🔴 время неожиданной формы → «не измерима», а НЕ мусорное число', () => {
  // RU: `Date.parse('1000')` даёт ГОДНУЮ дату тысячного года. Без границы разумности такая строка превращается
  //     не в отказ, а в длительность 94 670 812 800 с, и строка тревоги выглядит осмысленной. Поймано порчей:
  //     проба на само чтение поля этого не ловила.
  // EN: `Date.parse('1000')` returns a VALID date in the year 1000. Without a sanity boundary such a string
  //     becomes not a refusal but a duration of 94 670 812 800 s, and the alarm line looks meaningful. Caught
  //     by deliberate breakage: the probe on reading the field itself did not catch it.
  const t = stend()
  t.podat('compaction/start', { compactionId: 'q1' }, '1000')
  t.podat('compaction/end', { compactionId: 'q1' }, 4000)
  const s = sobytie(t)
  if (/длительность \d{5,}/.test(s)) return 'мусорное число выдано за длительность: ' + s
  return /не измерима/.test(s) || 'ожидалось «не измерима», вышло: ' + s
})

// RU: ── СВОДКА ЗОВЁТСЯ В РАБОТЕ, А НЕ ТОЛЬКО ИЗ СТЕНДА ──
//     Пара проб. Когда-то svodkaStorozha объявлялась и отдавалась наружу, а звал её ТОЛЬКО стенд: требования
//     «область печатается всегда» и «знаменатель рядом с числителем» в работе не исполнялись ни разу, и стенд
//     этого не видел. Одна проба «сводка печатается» доказала бы половину; вторая — что сводка НЕ печатается на
//     каждом turn/start.
//     Граница: последняя проба подаёт только turn/start; печать сводки по такту turn/end (первый и каждый
//     десятый) она не проверяет.
// EN: ── THE SUMMARY IS CALLED IN PRODUCTION, NOT ONLY FROM THE STAND ──
//     A pair of probes. Once svodkaStorozha was declared and exported but ONLY the stand called it: the
//     requirements "scope is always printed" and "denominator next to numerator" were never executed in
//     production, and the stand did not see it. One probe "the summary is printed" would prove half; the second
//     — that the summary is NOT printed on every turn/start.
//     Boundary: the last probe feeds only turn/start; it does not check summary printing on the turn/end
//     cadence (the first and every tenth).
proba('a9 после завершённого сжатия сводка НАПЕЧАТАНА (В10/В11 в бою)', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 's1' }, 1000)
  t.podat('compaction/end', { compactionId: 's1' }, 2000)
  const sv = t.stroki.filter((x) => SVODKA.test(x))
  if (!sv.length) return 'сводки в журнале нет — метод объявлен, но не зван'
  const tekst = sv.join('\n')
  if (!/область:/.test(tekst)) return 'в сводке нет области (В10)'
  if (!/ЗНАМЕНАТЕЛЬ: ходов/.test(tekst)) return 'в сводке нет знаменателя (В11)'
  if (!/НЕ проверял:/.test(tekst)) return 'в сводке не сказано, чего сторож НЕ видел'
  return true
})

// RU: ВЕРСИЯ В СТРОКЕ — УСЛОВИЕ ВИДИМОСТИ ДЛЯ ЧУЖИХ ПРИБОРОВ, А НЕ ОФОРМЛЕНИЕ. Без номера сторож выпадал из
//     среза журналов и из подсчётов по журналу — оба разбирают строки по образцу «[имя версия]»; пустая клетка
//     читается как «предмета нет». Пара проб: номер есть · и это номер из package.json, а не выдуманный.
// EN: THE VERSION IN THE LINE IS A CONDITION OF VISIBILITY TO OTHER TOOLS, NOT DECORATION. Without the number
//     the guard dropped out of a log slice and out of log-based counts — both parse lines by the pattern "[name
//     version]"; an empty cell reads as "the subject is absent". A pair of probes: the number is there · and it
//     is the number from package.json, not an invented one.
proba('строка журнала называет ИМЯ И ВЕРСИЮ — иначе прибор не видит предмета', () => {
  const t = stend()
  const vse = t.stroki.join('\n')
  if (!/\[dsh-pamyat-storozha \S+\]/.test(vse)) {
    return 'строки без версии: ' + JSON.stringify(t.stroki.slice(0, 2))
  }
  return true
})

proba('версия НЕ выдумана: в строке стоит номер из манифеста пакета', () => {
  const nash = createRequire(import.meta.url)('../package.json').version
  const t = stend()
  const vse = t.stroki.join('\n')
  if (!vse.includes('[dsh-pamyat-storozha ' + nash + ']')) {
    return 'в строке не номер манифеста (' + nash + '): ' + JSON.stringify(t.stroki[0])
  }
  return true
})

proba('a9 сводка НЕ печатается на каждом ходе — иначе журнал зальётся', () => {
  const t = stend()
  for (let i = 0; i < 5; i++) t.podat('turn/start', {}, 1000 + i)
  const sv = t.stroki.filter((x) => SVODKA.test(x))
  return sv.length === 0 || `сводка напечатана ${sv.length} раз без единого сжатия`
})

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
