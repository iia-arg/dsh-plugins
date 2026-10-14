// RU: Основной стенд проверяет отдельно B после компакта и C welcome, включая доступность памяти, формат сообщения, доверие, бюджет, сводку и касания. Предмет импортируется динамически: нет зависимостей — читаемая слепота с кодом 2, не доказанный дефект 1. Фикстуры и порча не вызывают живые службы.
// EN: The main test checks B after compaction and C welcome separately, including memory availability, message shape, trust, budget, summaries, and touches. Import dynamically: missing dependencies yield a readable inability-to-check result 2, not a proven defect 1. Fixtures and mutations call no live services.
let apply, Config, decide, perevesti, renderWelcome
try {
  ({ apply, Config, decide, perevesti, renderWelcome } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: Подставная память находится только в стенде и возвращает форму таблицы ядра klass/sozdano/istochnik/vera, не готовую форму restore: переходник должен работать сам.
// EN: Fake memory exists only in the test and returns the core table shape klass/sozdano/istochnik/vera, not the ready restore shape; the adapter must work itself.
const ZAPISI = [
  { id: 1, agent: 'a', klass: 'reshenie', soderzhim: 'Прежде чем править чужой код — спросить владельца предмета.', sozdano: Date.now() - 3600e3, istochnik: 'koordinator', vera: 0.9, bez_podtverzhdeniya: 0 },
  { id: 2, agent: 'a', klass: 'navyk', soderzhim: 'Публикуемый пакет не должен нести путей чужой машины.', sozdano: Date.now() - 108000e3, istochnik: null, vera: 0.6, bez_podtverzhdeniya: 1 },
  { id: 3, agent: 'a', klass: 'reshenie', soderzhim: 'Старая запись для проверки ignore-ветки.', sozdano: Date.now() - 864000e3, istochnik: 'koordinator', vera: 0.9, bez_podtverzhdeniya: 0 },
  { id: 4, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'Сводка компакта: TL;DR — закрыли слияние ядра и сторож.', sozdano: Date.now() - 60e3, istochnik: 'sekretar', vera: null, bez_podtverzhdeniya: 0 },
]
let sluzhbaZhiva = true
let posledniyVopros = null
// RU: Шпион касаний сохраняет ids и povod: проверить точные аргументы, не один факт вызова.
// EN: The touch spy records ids and povod: check exact arguments, not merely that a call occurred.
let kasaniyaZvali = []
let kasanieOtvet = () => ({ otmecheno: 0, otkaz: null })
const pamyat = {
    sessiyaIsklyuchena: () => false,
  otmetitKasanie(vopros = {}) { kasaniyaZvali.push(vopros); return kasanieOtvet(vopros) },
  dostupna: () => sluzhbaZhiva,
  pochemuNedostupna: () => (sluzhbaZhiva ? null : 'проба: база закрыта'),
  prochitat(vopros = {}) {
    posledniyVopros = vopros
    const podhodit = vopros.klass ? ZAPISI.filter((z) => z.klass === vopros.klass) : ZAPISI
    // RU: Фикстура сортирует sozdano DESC, как ядро: первая запись — новейшая. Несколько сводок позволяют отличить первый элемент от последнего.
    // EN: The fixture sorts sozdano DESC like the core: the first record is newest. Multiple summaries distinguish taking the first entry from the last.
    const poryadok = podhodit.slice().sort((a, b) => Number(b.sozdano ?? 0) - Number(a.sozdano ?? 0))
    return poryadok.slice(0, vopros.skolko ?? 20)
  },
}

const handlers = {}
const ctx = {
  on(ev, h) { handlers[ev] = h; return () => {} },
  get: (imya) => (imya === 'pamyat' ? pamyat : undefined),
}
// RU: Путь welcome-отметок изолирован от живого файла, чтобы стенд не менял частоту брифинга агента и не подавлял собственный повторный запуск.
// EN: Isolate the welcome-marker path from the live file so the test changes neither agent briefing frequency nor its own repeated runs.
const otmetkiProby = join(tmpdir(), `restore-welcome-${process.pid}-${Date.now()}.json`)
apply(ctx, Config({ welcomeOtmetki: otmetkiProby }))

const prestep = handlers['agent/pre-step']
// RU: Компакт поступает через session/event с типом события, как платформа; вызов выдуманного handlers[compaction/end] не проверил бы реальную подписку.
// EN: Deliver compaction through session/event with an event type, matching the platform; calling a fabricated handlers[compaction/end] would not test the actual subscription.
const sessionEvent = handlers['session/event']
const compactEnd = (data = { compactionId: 'c1', turn: 7 }) =>
  sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/end', data })
if (!prestep) { console.log('СЛЕПОТА: хук agent/pre-step не зарегистрирован'); process.exit(2) }

import { createHash as __hash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync as __chitat, existsSync as __est } from 'node:fs'
import { fileURLToPath as __put } from 'node:url'
// RU: Временные объекты регистрируются для уборки на exit и SIGTERM/SIGINT; SIGKILL и временное дочернего процесса не покрыты.
// EN: Register temporary objects for cleanup on exit and SIGTERM/SIGINT; this does not cover SIGKILL or child-process temporary objects.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
VREMENNYE.push(otmetkiProby, otmetkiProby + '.compaction-ok.json')   // RU: Файлы отметок входят в ту же уборку. Собственная сумма стенда идентифицирует редакцию прибора при каждом прогоне.
// EN: Include marker files in the same cleanup. The test own checksum identifies the instrument revision on each run.
console.log(`стенд: ${__put(import.meta.url).split('/').pop()} сумма ${
  __hash('sha256').update(__chitat(__put(import.meta.url))).digest('hex').slice(0, 16)}`)
// RU: Печатать версии реально разрешённых модулей из их манифестов, не только объявленные зависимости: наличие ключа в package.json не доказывает загруженную версию.
// EN: Print versions from manifests of actually resolved modules, not merely declared dependencies; a package.json entry does not prove the loaded version.
{
  const { createRequire } = await import('node:module')
  const trebuet = createRequire(import.meta.url)
  const versii = []
  for (const m of ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-llm',
                   '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-persistence',
                   '@deepseek-ai/cordis']) {
    let v = 'не разрешился'
    try { v = trebuet(`${m}/package.json`).version } catch { /**
     * RU: Если версия не прочитана, так и назвать отсутствие измерения.
     * EN: If the version cannot be read, report that missing measurement.
     */ }
    versii.push(`${m.replace('@deepseek-ai/', '')} ${v}`)
  }
  console.log(`загружено: ${versii.join(' · ')}`)
}

let ok = 0, fail = 0, slep = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`ok   ${n}`); } else { fail++; console.log(`FAIL ${n}\n     ${s ?? ''}`); } }
const next = async () => ({ kind: 'enter', messages: [] })
// RU: Сессия — параметр фикстуры: для нового welcome нужен новый sid, иначе проверяется запрет повторного брифинга в этом процессе.
// EN: The fixture takes a session parameter: a new welcome needs a new sid, or the test measures the ban on repeat briefings in this process.
let nSess = 0
const svezhaya = () => `sess-svezh-${++nSess}`
const call = (turn, step, sid = 'sess-1') =>
  prestep({ agent: { id: 'agent-1', session: { id: sid } }, turn, step, signal: {} }, next)

// RU: Первый вызов C проверяет welcome, решения use/verify/ignore и причины в реально вставленном тексте.
// EN: The first C call checks welcome, use/verify/ignore decisions, and reasons in actual inserted text.
const d1 = await call(1, 1)
t('C welcome: инъекция есть', d1.messages.length === 1, JSON.stringify(d1.messages))
const wtext = d1.messages[0]?.content?.[0]?.text ?? ''
t('C welcome: use есть', /\[use\]/.test(wtext), wtext)
t('C welcome: verify есть (вера ниже порога)', /\[verify\].*вера 0\.6 ниже порога/.test(wtext), wtext)
t('C welcome: ignore исключён (старая запись)', !/Старая запись/.test(wtext), wtext)
t('C welcome: основание напечатано', /старше|ниже порога|свежая/.test(wtext), wtext)

// RU: Повторный ход той же уже обслуженной сессии не получает новый welcome. Это не общий запрет turn=2 для свежей сессии.
// EN: A later turn of the same already served session receives no new welcome. This is not a general turn=2 prohibition for a fresh session.
const d2 = await call(2, 1)
t('C порча: turn=2 -> нет welcome', d2.messages.length === 0, JSON.stringify(d2.messages))

// RU: После compaction/end B должен вставить сводку независимо от уже данного welcome.
// EN: After compaction/end, B must insert the summary independently of an already delivered welcome.
compactEnd()
const d3 = await call(3, 1)
t('B restore: инъекция есть', d3.messages.length === 1, JSON.stringify(d3.messages))
const btext = d3.messages[0]?.content?.[0]?.text ?? ''
t('B restore: сводка вставлена', /Сводка компакта|Восстановление после компакта/.test(btext), btext)

// RU: Предупреждение старой сводки проверяется парой: есть для прежней, отсутствует для свежей. Постоянное предупреждение не является правильной диагностикой.
// EN: Check the old-summary warning in a pair: present for an older summary and absent for a fresh one. A permanent warning is not correct diagnostics.
{
  const bylo = pamyat.prochitat
  // RU: Подставить порядок start→summary→end: сводка пишется внутри сжатия, не после end. Иначе проба узаконила бы неверный рубеж свежести.
  // EN: Supply start→summary→end order: a summary is written during compaction, not after end. Otherwise the fixture would validate a wrong freshness boundary.
  const podat = (nachalo, konec, cid, hod) => {
    sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/start', data: { compactionId: cid }, time: nachalo })
    sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/end', data: { compactionId: cid, turn: hod }, time: konec })
  }

  // RU: Сводка на 270 минут старше start проверяет предупреждение и величину возраста.
  // EN: A summary 270 minutes older than start checks the warning and age magnitude.
  const nach1 = Date.now()
  pamyat.prochitat = (vopros = {}) => (vopros.klass
    ? [{ id: 56, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'прежняя сводка',
         sozdano: nach1 - 270 * 60000, istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }]
    : [])
  podat(nach1, nach1 + 95000, 'c-b2', 9)
  const dB2 = await call(11, 1)
  const t1 = dB2.messages[0]?.content?.[0]?.text ?? ''
  t('Б2: старая сводка ВСТАВЛЕНА (запрет лечил бы видимость)', dB2.messages.length === 1, JSON.stringify(dB2.messages))
  t('Б2: во ВСТАВЛЕННОМ тексте сказано, что сводка НЕ от этого сжатия', /НЕ ОТ ЭТОГО СЖАТИЯ/.test(t1), t1.slice(0, 160))
  t('Б2: назван возраст числом, а не словом «старая»', /за 270 мин до него/.test(t1), t1.slice(0, 200))

  // RU: Сводка после start и до end проверяет отсутствие ложного предупреждения.
  // EN: A summary after start and before end checks absence of a false warning.
  const nach2 = Date.now()
  pamyat.prochitat = (vopros = {}) => (vopros.klass
    ? [{ id: 57, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'свежая сводка',
         sozdano: nach2 + 94000, istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }]
    : [])
  podat(nach2, nach2 + 95000, 'c-b2b', 10)
  const dB2b = await call(12, 1)
  const t2 = dB2b.messages[0]?.content?.[0]?.text ?? ''
  t('Б2-бис: сводка ЭТОГО сжатия (записана между start и end) — предупреждения НЕТ',
    dB2b.messages.length === 1 && !/НЕ ОТ ЭТОГО СЖАТИЯ/.test(t2), t2.slice(0, 160))
  t('Б2-бис: и это сказано вслух — «сводка этого сжатия»',
    !/СВЕРИТЬ НЕ УДАЛОСЬ/.test(t2), t2.slice(0, 160))

  // RU: Без времени записи требуется «не сверяли», не «свежая».
  // EN: With no record timestamp, require “unchecked,” not “fresh.”
  const nach3 = Date.now()
  pamyat.prochitat = (vopros = {}) => (vopros.klass
    ? [{ id: 58, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'без времени',
         istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }]
    : [])
  podat(nach3, nach3 + 95000, 'c-b2c', 11)
  const dB2c = await call(13, 1)
  const t3 = dB2c.messages[0]?.content?.[0]?.text ?? ''
  t('Б2-трет: без времени записи — «СВЕРИТЬ НЕ УДАЛОСЬ», а не молчание',
    /СВЕРИТЬ НЕ УДАЛОСЬ/.test(t3), t3.slice(0, 160))

  // RU: Без compaction/start даже свежая сводка имеет неизвестный рубеж: ни «старая», ни «свежая» не доказаны.
  // EN: Without compaction/start, even a recent summary has no known boundary; neither “older” nor “fresh” is proven.
  const nach4 = Date.now()
  pamyat.prochitat = (vopros = {}) => (vopros.klass
    ? [{ id: 59, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'свежая, но начала не было',
         sozdano: nach4 + 94000, istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }]
    : [])
  sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/end', data: { compactionId: 'c-b2d', turn: 12 }, time: nach4 + 95000 })
  const dB2d = await call(14, 1)
  const t4 = dB2d.messages[0]?.content?.[0]?.text ?? ''
  t('Б2-четв: без compaction/start — «СВЕРИТЬ НЕ УДАЛОСЬ», а не «сводка старше»',
    /СВЕРИТЬ НЕ УДАЛОСЬ/.test(t4) && !/НЕ ОТ ЭТОГО СЖАТИЯ/.test(t4), t4.slice(0, 200))

  // RU: Start другого compactionId не задаёт рубеж этого сжатия.
  // EN: A start with another compactionId supplies no boundary for this compaction.
  const nach5 = Date.now()
  pamyat.prochitat = (vopros = {}) => (vopros.klass
    ? [{ id: 60, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'свежая, начало чужое',
         sozdano: nach5 + 94000, istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }]
    : [])
  sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/start', data: { compactionId: 'c-CHUZHOJ' }, time: nach5 })
  sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/end', data: { compactionId: 'c-b2e', turn: 13 }, time: nach5 + 95000 })
  const dB2e = await call(15, 1)
  const t5 = dB2e.messages[0]?.content?.[0]?.text ?? ''
  t('Б2-пят: начало ЧУЖОГО компакта рубежом не становится — «СВЕРИТЬ НЕ УДАЛОСЬ»',
    /СВЕРИТЬ НЕ УДАЛОСЬ/.test(t5), t5.slice(0, 200))
  pamyat.prochitat = bylo
}

// RU: Израсходованное взведение B без нового события не вставляет восстановление второй раз.
// EN: A consumed B trigger inserts no second restoration without a new event.
const d4 = await call(4, 1)
t('B порча: без компакта -> нет restore', d4.messages.length === 0, JSON.stringify(d4.messages))

// RU: Недоступный источник должен дать слышимый отказ, не тихую пустую выдачу.
// EN: An unavailable source must produce an observable refusal rather than silent empty delivery.
const origProchitat = pamyat.prochitat
let logged = ''
const origWrite = process.stderr.write
process.stderr.write = (s) => { logged += s; return true }
pamyat.prochitat = () => undefined
const d5 = await call(1, 1, 'sess-porcha-istochnika')   // RU: Отказ источника при welcome проверяется новой сессией, чтобы одноразовость C не скрыла проверяемый вызов.
// EN: Test source failure during welcome with a new session so C one-time behavior cannot hide the inspected call.
process.stderr.write = origWrite
pamyat.prochitat = origProchitat
t('порча входа: нет инъекции при недоступном источнике', d5.messages.length === 0, JSON.stringify(d5.messages))
t('порча входа: громкий отказ напечатан', /источник памяти недоступен/.test(logged), logged)

// RU: Отдельно проверить подписку на правильный хук и отсутствие подписки на выдуманный: объединение скрыло бы причину отказа.
// EN: Separately check subscription to the correct hook and absence of the fabricated one; combining them would hide the failure cause.
t('канал: session/event зарегистрирован',
  typeof handlers['session/event'] === 'function',
  `тип: ${typeof handlers['session/event']}`)
t('канал: compaction/end НЕ регистрируется (мёртвый слушатель)',
  handlers['compaction/end'] === undefined,
  `тип: ${typeof handlers['compaction/end']}`)

// RU: Чужой тип события не взводит B.
// EN: An unrelated event type does not arm B.
handlers['session/event']?.({ id: 'sess-1' }, { type: 'turn/end', data: { turn: 3 } })
const dChuzhoj = await call(2, 1)
t('чужой тип события не взводит restore', dChuzhoj.messages.length === 0, JSON.stringify(dChuzhoj.messages))

// RU: compaction/end с error не взводит восстановление: сжатие не подтверждено.
// EN: compaction/end with error does not arm restoration: compaction is not confirmed.
compactEnd({ compactionId: 'c2', turn: 8, error: 'boom' })
const dOshibka = await call(2, 1)
t('компакт с ошибкой не взводит restore', dOshibka.messages.length === 0, JSON.stringify(dOshibka.messages))

// RU: Сжатие другой сессии не вставляет данные в текущую.
// EN: Compaction of another session inserts no data into the current one.
sessionEvent?.({ id: 'sess-2' }, { type: 'compaction/end', data: { compactionId: 'c3', turn: 9 } })
const dChuzhaya = await call(2, 1)
t('компакт чужой сессии не взводит нашу', dChuzhaya.messages.length === 0, JSON.stringify(dChuzhaya.messages))

// RU: След события и вставки обязан быть видимым: отсутствие сообщения иначе выглядело бы отсутствием механизма.
// EN: Event and insertion traces must be visible; otherwise no message would resemble a missing mechanism.
{
  let sled = ''
  const orig = process.stderr.write
  process.stderr.write = (s) => { sled += s; return true }
  compactEnd({ compactionId: 'c9', turn: 42 })
  const d = await call(2, 1)
  process.stderr.write = orig
  t('след: приход компакта напечатан', /компакт c9 завершён \(ход 42\)/.test(sled), sled)
  t('след: вставка восстановления напечатана', /восстановление после компакта вставлено/.test(sled), sled)
  t('след: при этом инъекция действительно была', d.messages.length === 1, JSON.stringify(d.messages))

  // RU: Id записи должен доехать в sections вставленного сообщения, не в лишнем поле source. Id самого сообщения — другой объект.
  // EN: The record id must reach sections in the inserted message, not an extra source field. The message own id identifies a different object.
  const sek = d.messages[0]?.source?.sections ?? []
  t('вставка несёт опознаватель поднятой записи',
     sek.length === 1 && /#zapis-\d+$/.test(sek[0].name), JSON.stringify(sek.map((s) => s.name)))
}

// RU: Сжатие без найденной сводки должно объявить отсутствие, не выглядеть непришедшим событием.
// EN: Compaction with no found summary must report absence rather than resemble an event that never arrived.
{
  let sled = ''
  const orig = process.stderr.write
  process.stderr.write = (s) => { sled += s; return true }
  const bylo = pamyat.prochitat
  // RU: Подставной источник отвечает формой ядра и пустым массивом на отсутствующий класс сводки.
  // EN: The fake source uses the core shape and returns an empty array for a missing summary class.
  pamyat.prochitat = (vopros = {}) => (vopros.klass ? [] : [{ id: 9, agent: 'a', klass: 'reshenie', soderzhim: 'без сводки', sozdano: Date.now(), istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }])
  compactEnd({ compactionId: 'c10', turn: 43 })
  await call(2, 1)
  pamyat.prochitat = bylo
  process.stderr.write = orig
  // RU: Причина отсутствия сводки называет искомый klass, чтобы расхождение настройки оставалось видимым.
  // EN: The missing-summary cause names the requested klass so configuration mismatch remains visible.
  t('след: «компакт был, а сводки нет» сказано вслух', /записи класса «svodka-kompakcii» в памяти нет/.test(sled), sled)
  t('след: спрошен был ИМЕННО класс сводки', posledniyVopros?.klass === 'svodka-kompakcii', JSON.stringify(posledniyVopros))
}

// RU: Сообщение вставки проверяется как сохранённый объект, не только непустой текст: id и платформа определяют последующую загрузку.
// EN: Check the inserted message as a persisted object, not merely nonempty text; id and the platform determine later loading.
{
  const dW = await call(1, 1, 'sess-welcome-id')
  const mW = dW.messages[0]
  t('welcome: сообщение несёт id', typeof mW?.id === 'string' && mW.id.length > 0, JSON.stringify(mW?.id))
  t('welcome: id не пустой и не повторяет текст', mW?.id !== mW?.content?.[0]?.text, String(mW?.id))
  t('welcome: роль проставлена фабрикой', mW?.role === 'user', String(mW?.role))
  t('welcome: сообщение заморожено', Object.isFrozen(mW), 'не заморожено — фабрика не звалась')

  sessionEvent({ session: { id: 'sess-1' }, event: compactEnd() })
  const dB = await call(9, 1)
  const mB = dB.messages[0]
  t('restore: сообщение несёт id', typeof mB?.id === 'string' && mB.id.length > 0, JSON.stringify(mB?.id))
  t('restore: id ОТЛИЧАЕТСЯ от id welcome', mB?.id !== mW?.id, `${mB?.id} vs ${mW?.id}`)
}

// RU: В DSH 0.2 событие проходит настоящий adoptSessionEvent→assertMessageEventShape; снятое legacy-условие не повторяется как действующее. Проверять весь путь формы, не одно наличие id.
// EN: In DSH 0.2, pass the event through actual adoptSessionEvent→assertMessageEventShape; do not treat the removed legacy condition as active. Check the whole shape path, not just id presence.
{
  // RU: Явный SDK имеет приоритет; ночной запуск уже передаёт путь приложения. Без обоих путей остаётся обычное разрешение зависимости.
  // EN: An explicit SDK takes precedence; nightly runs already supply the app path. With neither path, use normal dependency resolution.
  const SDK_APP = process.env.DSH_TEST_APP || process.env.STEND_APP
  const IST = process.env.DSH_SESSION || (SDK_APP ? join(SDK_APP, 'node_modules/@deepseek-ai/dsh-session/lib/index.js') : '@deepseek-ai/dsh-session')
  let adopt = null, Session = null
  try { ({ adoptSessionEvent: adopt, Session } = await import(IST)) } catch { /**
   * RU: Отсутствие доступного валидатора ниже означает слепоту, не совпадение.
   * EN: An unavailable validator below means inability to check, not agreement.
   */ }
  if (typeof adopt !== 'function' || typeof Session?.create !== 'function') {
    slep += 4  // RU: Недоступный блок учитывается точным числом несостоявшихся проб.
    // EN: Count the exact number of checks not run in an unavailable block.
    console.log(`СЛЕПОТА: adoptSessionEvent не загрузилась из ${IST} — путь загрузки не проверен.`)
    console.log('  Задайте DSH_SESSION=<платформа>/node_modules/@deepseek-ai/dsh-session/lib/index.js либо DSH_TEST_APP/STEND_APP=<платформа>')
  } else {
    const sdkFile = __put(import.meta.resolve(IST))
    console.log(`SDK валидатора: ${sdkFile}, SHA256 ${__hash('sha256').update(__chitat(sdkFile)).digest('hex')}`)
    // RU: Для валидатора используется сессия, ещё не получавшая одноразовый welcome.
    // EN: Use a session that has not yet received one-time welcome for the validator test.
    const d = await call(1, 1, 'sess-validator')
    const nashe = d.messages[0]
    let prinyato = null
    // RU: append возвращает уже записанный платформенный конверт: не нужен отсутствующий в части SDK snapshotEvents или иной способ чтения журнала. Проверяем событие настоящим валидатором, затем засеваем новую сессию его JSON-копией.
    // EN: append returns the event already recorded by the platform; it needs neither snapshotEvents, which some SDKs lack, nor another log-reading API. Validate the real event, then seed a new session with its JSON copy.
    const provesti = async (data, id) => { const S = Session.create(id)
      const ev = S.append('user/message', data, { surfaceOp: 'append' })
      adopt(ev); Session.create(id + '-zagruzka', [JSON.parse(JSON.stringify(ev))]) }
    try { await provesti(nashe, 'proba-restore-02'); prinyato = true }
    catch (e) { prinyato = e.message }
    t('событие проходит валидатор загрузки платформы', prinyato === true, String(prinyato))
    // RU: source.kind=plugin:dsh-pamyat-restore узнаёт производителя в v4; отдельное поле plugin не принадлежит этой форме.
    // EN: source.kind=plugin:dsh-pamyat-restore identifies the producer in v4; a separate plugin field is not part of this shape.
    t('запись опознаётся по source.kind plugin:dsh-pamyat-restore (форма v4)', nashe?.source?.kind === 'plugin:dsh-pamyat-restore' && !('plugin' in (nashe?.source ?? {})),
      JSON.stringify(nashe?.source))
    // RU: Контроль зрячести удаляет id: тот же валидатор должен отказать, иначе принятие исправного не доказывает проверки.
    // EN: The sensitivity control removes id: the same validator must refuse, or accepting the valid input proves no validation.
    const { id, ...bezId } = nashe
    const udaleno = Object.hasOwn(nashe, 'id') && !Object.hasOwn(bezId, 'id') ? 1 : 0
    const shaData = (data) => __hash('sha256').update(JSON.stringify(data)).digest('hex')
    console.log(`порча валидатора: удалено id=${udaleno}, SHA ${shaData(nashe)} → ${shaData(bezId)}`)
    let otkazBezId = ''
    try { await provesti(bezId, 'proba-restore-02-bez-id') } catch (e) { otkazBezId = String(e.message) }
    console.log(`отказ SDK без id: ${otkazBezId || 'НЕТ — запись принята'}`)
    t('контроль зрячести: без id валидатор отвергает', udaleno === 1 && /\blacks an identified message\b/i.test(otkazBezId),
      `причина отказа должна называть опознаваемое сообщение/id, а не ошибку API: ${otkazBezId || 'принято'}`)
    // RU: После порчи тот же исправный предмет снова должен пройти весь путь; отказ не должен залипнуть.
    // EN: After the fault, the same healthy message must pass the full path again; refusal must not persist.
    let vosstanovleno = null
    try { await provesti(nashe, 'proba-restore-02-vozvrat'); vosstanovleno = true } catch (e) { vosstanovleno = e.message }
    t('после возврата id событие снова проходит валидатор загрузки платформы', vosstanovleno === true, String(vosstanovleno))
  }
}

// RU: Неизмеренная вера проверяется по решению и причине: null/undefined/NaN не должны давать use или выдуманное число сравнения.
// EN: Check unmeasured trust by both decision and cause: null/undefined/NaN must yield neither use nor an invented comparison number.
{
  const c = { ignoreAfterMs: 604800000, useVeraThreshold: 0.7 }
  const svezhaya = (vera) => ({ kogda: Date.now(), vera })
  for (const [vera, imya] of [[null, 'null'], [undefined, 'undefined'], [NaN, 'NaN']]) {
    const d = decide(svezhaya(vera), c)
    t(`вера ${imya}: решение НЕ «use»`, d.decision !== 'use', JSON.stringify(d))
    t(`вера ${imya}: причина называет «не измерялась»`, /не измерял/.test(d.reason), d.reason)
    // RU: Причина без измерения не должна содержать число, которое нечем сравнить.
    // EN: An unmeasured cause must not contain a number that cannot be compared.
    t(`вера ${imya}: в причине НЕТ числа`, !/\d/.test(d.reason), d.reason)
  }
  // RU: Измеренная низкая вера сохраняет числовое основание решения.
  // EN: Measured low trust retains a numeric decision basis.
  const nizkaya = decide(svezhaya(0.5), c)
  t('вера 0.5: verify с числом в причине', nizkaya.decision === 'verify' && /0\.5/.test(nizkaya.reason), JSON.stringify(nizkaya))
  // RU: Измеренный 0 остаётся числом; здесь без заданного ignore-порога проверяется verify, не отсутствие измерения.
  // EN: A measured 0 remains numeric; with no configured ignore threshold here, test verify rather than no measurement.
  const nol = decide(svezhaya(0), c)
  t('вера 0: измеренный ноль отличён от отсутствия', /0 ниже порога/.test(nol.reason), JSON.stringify(nol))
  const vysokaya = decide(svezhaya(0.9), c)
  t('вера 0.9: use', vysokaya.decision === 'use', JSON.stringify(vysokaya))

  // RU: Неизвестное время не должно расходиться между null и undefined: проверить отдельную verify-причину до возраста.
  // EN: Unknown time must not differ between null and undefined; check a distinct verify cause before age arithmetic.
  for (const [kogda, imya] of [[null, 'null'], [undefined, 'undefined'], [NaN, 'NaN'], ['мусор', 'строка']]) {
    const d = decide({ kogda, vera: 0.9 }, c)
    t(`время ${imya}: НЕ ignore и НЕ use`, d.decision === 'verify', JSON.stringify(d))
    t(`время ${imya}: причина называет неизвестность времени`, /время записи неизвестно/.test(d.reason), d.reason)
  }
  // RU: Настоящая старая запись остаётся ignore с названным возрастом.
  // EN: An actually old record remains ignore with its age stated.
  const staraya = decide({ kogda: Date.now() - 900000000, vera: 0.9 }, c)
  t('настоящая старая запись: ignore с числом суток', staraya.decision === 'ignore' && /\d+ сут/.test(staraya.reason), JSON.stringify(staraya))
}

// RU: Импортировать настоящую формулу ядра для стыка порогов: один harmful снимает use, два приводят к ignore. Нет ядра — код слепоты, не успешное сравнение с локальной копией.
// EN: Import the actual core formula for threshold integration: one harmful removes use, two cause ignore. No core means inability to check, not successful comparison with a local copy.
{
  const PROB_ZDES = 6
  let veraPoOcenkam = null
  for (const put of ['../../dsh-pamyat-core/src/hranilishche.js',
                     '../node_modules/dsh-pamyat-core/src/hranilishche.js']) {
    try {
      const m = await import(new URL(put, import.meta.url).href)
      if (typeof m.veraPoOcenkam === 'function') { veraPoOcenkam = m.veraPoOcenkam; break }
    } catch { /**
     * RU: Этот путь не дал ядро; искать следующий допустимый путь.
     * EN: This path did not supply the core; try the next supported path.
     */ }
  }
  if (!veraPoOcenkam) {
    slep += PROB_ZDES
    console.log(`СЛЕПОТА: ядро не найдено рядом — связка «формула ↔ пороги» не сверена (${PROB_ZDES} проб не состоялись)`)
    console.log('     Это НЕ «сошлось». Поставьте dsh-pamyat-core рядом и повторите.')
  } else {
    const c = Config()
    const svezhaya = (ocenki) => ({ kogda: Date.now(), vera: veraPoOcenkam(ocenki) })
    const n = (skolko, ishod) => Array.from({ length: skolko }, () => ({ ishod }))

    t('пороги веры совместимы: порог отбрасывания НИЖЕ порога применения',
      c.ignoreVeraThreshold < c.useVeraThreshold,
      `ignoreVera=${c.ignoreVeraThreshold} useVera=${c.useVeraThreshold} — иначе одна из веток недостижима`)

    const bez = decide(svezhaya([]), c)
    t('оценок не было: verify «не измерялась» (протокол не приписывает числа молчанию)',
      bez.decision === 'verify' && /не измерял/.test(bez.reason), JSON.stringify(bez))

    const odin = decide(svezhaya(n(1, 'harmful')), c)
    t('ОДНА оценка «навредило»: запись уходит из применения в verify',
      odin.decision === 'verify', JSON.stringify(odin))

    const dva = decide(svezhaya(n(2, 'harmful')), c)
    t('ДВЕ оценки «навредило»: запись уходит в ignore',
      dva.decision === 'ignore', JSON.stringify(dva))

    // RU: Причина ignore должна назвать порог веры, не возраст: одно слово ignore не различает эти ветки.
    // EN: The ignore cause must name the trust threshold, not age; ignore alone cannot distinguish those branches.
    t('причина отбрасывания называет порог веры, а не возраст',
      /порога отбрасывания/.test(dva.reason), dva.reason)

    const helped = decide(svezhaya(n(1, 'helped')), c)
    t('оценка «помогло»: запись применяется', helped.decision === 'use', JSON.stringify(helped))
  }
}

// RU: Переходник проверяется сырой формой таблицы ядра, включая веру, флаг подтверждения и происхождение.
// EN: Test the adapter with raw core-table rows, including trust, the approval flag, and provenance.
{
  const syraya = { id: 7, agent: 'vladelec-znaniya', klass: 'navyk', soderzhim: 'текст',
    sozdano: 1788375345892, istochnik: 'sekretar', vera: null, bez_podtverzhdeniya: 1 }
  const p = perevesti(syraya)
  t('переходник: klass -> vid', p.vid === 'navyk', JSON.stringify(p))
  t('переходник: sozdano -> kogda', p.kogda === 1788375345892, JSON.stringify(p.kogda))
  t('переходник: istochnik -> avtor', p.avtor === 'sekretar', String(p.avtor))
  // RU: null веры должен пройти без подстановки 0 или порога.
  // EN: null trust must pass through without substituting 0 or a threshold.
  t('переходник: вера null НЕ подменена', p.vera === null, JSON.stringify(p.vera))
  t('переходник: отметка без подтверждения доехала', p.bezPodtverzhdeniya === true, String(p.bezPodtverzhdeniya))
  const bezIstochnika = perevesti({ ...syraya, istochnik: null })
  t('переходник: без istochnik автор — владелец знания', bezIstochnika.avtor === 'vladelec-znaniya', String(bezIstochnika.avtor))
  const izmerennyj = perevesti({ ...syraya, vera: 0 })
  t('переходник: измеренный ноль доходит нулём', izmerennyj.vera === 0, JSON.stringify(izmerennyj.vera))
  t('переходник: мусор на входе -> null, а не полупустая запись', perevesti(null) === null && perevesti('строка') === null, 'вернулось не null')
}

// RU: Отказы службы памяти проверяются по слышимому сообщению, не тихому пустому результату.
// EN: Check memory-service failures by observable messages, not silent empty results.
{
  const orig = process.stderr.write
  let sled = ''
  process.stderr.write = (x) => { sled += x; return true }
  const bylo = ctx.get
  ctx.get = () => undefined            // RU: В этой пробе служба ядра отсутствует.
  // EN: The core service is absent in this test.
  const d = await call(1, 1, svezhaya())
  ctx.get = bylo
  process.stderr.write = orig
  t('нет службы памяти: инъекции НЕТ', d.messages.length === 0, JSON.stringify(d.messages))
  t('нет службы памяти: сказано вслух', /PAMYAT_POLITIKA_NEDOSTUPNA/.test(sled), sled)

  let sled2 = ''
  process.stderr.write = (x) => { sled2 += x; return true }
  sluzhbaZhiva = false
  const d2 = await call(1, 1, svezhaya())
  sluzhbaZhiva = true
  process.stderr.write = orig
  t('память отвечает «недоступна»: инъекции НЕТ', d2.messages.length === 0, JSON.stringify(d2.messages))
  t('память отвечает «недоступна»: названа ПРИЧИНА', /проба: база закрыта/.test(sled2), sled2)
}

// RU: Проверить зовущего byudzhetPamyati в C и сообщение его отсутствия: смонтированная служба без потребителя не доказала бы бюджет.
// EN: Check the C caller of byudzhetPamyati and the missing-service message: a registered service without a consumer would not prove budget application.
{
  const orig = process.stderr.write
  let sled = ''
  process.stderr.write = (x) => { sled += x; return true }
  const d1 = await call(1, 1, svezhaya())                     // RU: В первой части budget-службы нет в ctx.
  // EN: The first part has no budget service in ctx.
  process.stderr.write = orig
  t('без бюджета: брифинг всё равно построен', d1.messages.length === 1, JSON.stringify(d1.messages))
  t('без бюджета: сказано вслух', /бюджет не смонтирован/.test(sled), sled)

  // RU: Во второй части настоящая ветка вызова бюджета получает сокращённый список.
  // EN: The second part exercises the budget call branch with a reduced list.
  let sprosili = null
  const byudzhet = { otobrat(v) { sprosili = v; return { podnyato: v.zapisi.slice(0, 1), otbrosheno: v.zapisi.slice(1), svodka: {} } } }
  const byloGet = ctx.get
  ctx.get = (imya) => (imya === 'byudzhetPamyati' ? byudzhet : byloGet(imya))
  let sled2 = ''
  process.stderr.write = (x) => { sled2 += x; return true }
  const d2 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  t('бюджет спрошен на ТЕХ ЖЕ записях, что прочитаны', Array.isArray(sprosili?.zapisi) && sprosili.zapisi.length > 0, JSON.stringify(sprosili && Object.keys(sprosili)))
  // RU: Считать строки записей с префиксом - , не все переводы строк: полная многострочная сводка вне бюджета не является набором новых записей.
  // EN: Count record lines prefixed with - , not every newline: a full multiline summary outside the budget is not a set of new records.
  t('в брифинг попало только поднятое ПО БЮДЖЕТУ', (d2.messages[0]?.content?.[0]?.text ?? '')
    .split('\n').filter((x) => x.startsWith('- ')).length === 1,
    d2.messages[0]?.content?.[0]?.text)
  t('применение бюджета названо вслух', /бюджет применён: поднято 1 из/.test(sled2), sled2)

  // RU: Отказ budget-службы не отменяет готовящийся брифинг.
  // EN: Budget-service failure does not cancel the briefing being assembled.
  ctx.get = (imya) => (imya === 'byudzhetPamyati' ? { otobrat() { throw new Error('проба: предел не прочитан') } } : byloGet(imya))
  let sled3 = ''
  process.stderr.write = (x) => { sled3 += x; return true }
  const d3 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  ctx.get = byloGet
  t('отказ бюджета НЕ отменяет брифинг', d3.messages.length === 1, JSON.stringify(d3.messages))
  t('отказ бюджета назван с причиной', /бюджет отказал \(проба: предел не прочитан/.test(sled3), sled3)
}

// RU: Полная сводка проверяется через общую ZAPISI-фикстуру, не альтернативную память, которую остальные пробы не используют.
// EN: Check the complete summary through the shared ZAPISI fixture, not alternate memory unused by the other tests.
async function stendSvodkiVneByudzheta () {
  console.log('\n— Э8.6: последняя сводка компакта вне бюджета —')
  const KLASS = 'svodka-kompakcii'
  const DLINNAYA = 'С'.repeat(9000)   // RU: Образец намеренно превышает budget и welcomeBudget.
  // EN: The sample deliberately exceeds both budget and welcomeBudget.
  const bylo = ZAPISI.slice()
  // RU: Убрать исходную короткую сводку этого класса, чтобы skolko=1 не выбрал другой образец вместо длинного.
  // EN: Remove the original short summary of this class so skolko=1 cannot select another sample instead of the long one.
  for (let i = ZAPISI.length - 1; i >= 0; i--) if (ZAPISI[i].klass === KLASS) ZAPISI.splice(i, 1)
  // RU: Длинная сводка старше остальных и не первая: обычная первая строка может превышать бюджет, поэтому такой лёгкий вход не проверил бы отдельную выдачу вне предела.
  // EN: The long summary is older than the others and not first: an ordinary first line may exceed the budget, so an easy first-position input would not test separate out-of-limit delivery.
  ZAPISI.push({ id: 99, klass: KLASS, vid: 'svodka', avtor: 'sekretar',
                soderzhim: DLINNAYA, sozdano: 1, vera: 1 })
  const orig = process.stderr.write
  let sled = ''
  process.stderr.write = (x) => { sled += x; return true }
  const d = await call(1, 1, svezhaya())
  process.stderr.write = orig
  const tekst = d.messages?.[0]?.content?.[0]?.text ?? ''

  t('ГЛАВНОЕ: сводка поднята ЦЕЛИКОМ, а не обрезана пределом',
    tekst.includes(DLINNAYA), 'длина брифинга ' + tekst.length + ', сводка 9000')
  t('подъём вне бюджета НАЗВАН вслух', /поднята ЦЕЛИКОМ вне бюджета/.test(sled), sled.slice(-200))
  t('обычные записи по-прежнему идут ПО пределу (строки «- »)',
    tekst.split('\n').filter((x) => x.startsWith('- ')).length >= 1, tekst.slice(0, 120))
  t('опознаватель сводки попал в перечень', /опознаватели: [^\n]*99/.test(sled), sled.slice(-200))

  // RU: Зеркальная проба убирает все сводки и требует сообщение отсутствия. Исходная фикстура сама содержала сводку, поэтому её нельзя принять за пустую.
  // EN: The inverse test removes every summary and requires an absence message. The original fixture already contained a summary and cannot be assumed empty.
  ZAPISI.length = 0
  for (const z of bylo) if (z.klass !== KLASS) ZAPISI.push(z)
  let sled2 = ''
  process.stderr.write = (x) => { sled2 += x; return true }
  const d2 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  const tekst2 = d2.messages?.[0]?.content?.[0]?.text ?? ''
  t('🔴 РАЗЛИЧЕНИЕ: сводки НЕТ — сказано «не нашлось», а не молчание',
    /сводки компакта в памяти НЕТ/.test(sled2), sled2.slice(-200))
  t('без сводки брифинг всё равно построен', tekst2.length > 0, String(tekst2.length))
  t('без сводки длинного тела в брифинге НЕТ', !tekst2.includes(DLINNAYA), 'длина ' + tekst2.length)

  // RU: Две сводки разных времён различают выбор новейшей и выбор последнего элемента; одна сводка обе реализации не различила бы.
  // EN: Two summaries with different timestamps distinguish selecting the newest from selecting the last element; one summary cannot distinguish them.
  ZAPISI.length = 0
  for (const z of bylo) if (z.klass !== KLASS) ZAPISI.push(z)
  const STARAYA = 'A'.repeat(4000)
  const NOVAYA = 'Б'.repeat(4000)
  ZAPISI.push({ id: 101, klass: KLASS, vid: 'svodka', avtor: 'sekretar', soderzhim: STARAYA, sozdano: 1000, vera: 1 })
  ZAPISI.push({ id: 102, klass: KLASS, vid: 'svodka', avtor: 'sekretar', soderzhim: NOVAYA, sozdano: Date.now(), vera: 1 })
  let sled3 = ''
  process.stderr.write = (x) => { sled3 += x; return true }
  const d3 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  const tekst3 = d3.messages?.[0]?.content?.[0]?.text ?? ''
  t('🔴 из ДВУХ сводок поднята НОВЕЙШАЯ', tekst3.includes(NOVAYA) && !tekst3.includes(STARAYA),
    'новая ' + tekst3.includes(NOVAYA) + ', старая ' + tekst3.includes(STARAYA))
  t('поднята РОВНО ОДНА сводка, а не обе', (tekst3.match(/Последняя сводка компакта/g) ?? []).length === 1,
    String((tekst3.match(/Последняя сводка компакта/g) ?? []).length))
  // RU: Старая сводка вправе остаться в обычном отборе; отдельная полная выдача относится только к новейшей. Перечень id должен отражать весь реально поданный текст.
  // EN: An older summary may remain in ordinary selection; separate complete delivery applies only to the newest. The id list must reflect all actually delivered text.
  t('в перечне опознавателей есть НОВЕЙШАЯ (102)',
    /опознаватели: [^\n]*102/.test(sled3), sled3.slice(-200))
}

// RU: Сверить klassSvodki с klass секретаря: разные умолчания дали бы штатное «не найдена» при существующей сводке. Нет соседнего пакета — проверка не состоялась, не совпала.
// EN: Compare klassSvodki with the secretary klass: differing defaults would report normal absence despite an existing summary. A missing neighboring package means the check did not run, not agreement.
{
  let klassSekretarya = null
  // RU: Отсутствующий файл позволяет искать дальше. Найденный файл с отказом импорта даёт слепоту с путём и ошибкой, не ложное «пакета нет».
  // EN: A missing file permits continuing the search. A found file that fails import yields inability to check with its path and error, not a false “package missing.”
  let neZagruzilsya = null
  for (const put of ['../../dsh-pamyat-secretary/src/index.js',
                     '../node_modules/dsh-pamyat-secretary/src/index.js']) {
    const url = new URL(put, import.meta.url)
    if (!__est(__put(url))) continue
    try {
      const m = await import(url.href)
      klassSekretarya = m.Config?.().klass ?? null
      if (klassSekretarya) break          // RU: Модуль без ожидаемого класса не отвечает договору этой пробы; продолжить поиск.
      // EN: A module without the expected class does not meet this test contract; continue searching.
    } catch (e) {
      neZagruzilsya = `${__put(url)} — ${e?.code ?? 'ошибка'}: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`
      break
    }
  }
  if (neZagruzilsya) {
    slep++
    console.log('СЛЕПОТА: пакет секретаря найден, не загрузился: ' + neZagruzilsya)
    console.log('     Это НЕ «сошлось»: сверка не состоялась. Поставьте секретарю его модули (npm install в его каталоге).')
  } else if (!klassSekretarya) {
    slep++
    console.log('СЛЕПОТА: пакет секретаря не найден рядом — класс сводки не сверен')
    console.log('     Это НЕ «сошлось»: сверка не состоялась. Поставьте dsh-pamyat-secretary рядом.')
  } else {
    const nash = Config().klassSvodki
    t('класс сводки совпадает с тем, под которым пишет секретарь',
      nash === klassSekretarya,
      `restore ищет «${nash}», секретарь пишет «${klassSekretarya}» — restore не найдёт сводку и скажет «в памяти нет»`)
  }
}

await stendSvodkiVneByudzheta()

// RU: Точное число проб обнаруживает вырезанный блок без запаса порога. Для касаний перехватывается process.stderr.write — реальный канал предмета; console.log не доказывал бы слышимый след.
// EN: An exact test count detects a removed block with no threshold slack. Touch checks intercept process.stderr.write, the actual subject channel; console.log would not prove an observable trace.
const perehvat = async (f) => {
  const bylo = process.stderr.write.bind(process.stderr); const stroki = []
  process.stderr.write = (ch, ...ost) => { stroki.push(String(ch)); return true }
  try { return { itog: await f(), vyvod: stroki.join('') } } finally { process.stderr.write = bylo }
}

kasaniyaZvali = []; kasanieOtvet = () => ({ otmecheno: 3, otkaz: null })
const kas1 = await perehvat(() => call(1, 1, 'sess-kasanie-1'))
t('касание: служба позвана РОВНО ОДИН раз при welcome', kasaniyaZvali.length === 1, JSON.stringify(kasaniyaZvali))
t('касание: повод «vydacha-agentu», а не какой-нибудь',
  kasaniyaZvali[0]?.povod === 'vydacha-agentu', JSON.stringify(kasaniyaZvali[0]?.povod))
t('касание: переданы ИМЕННО выданные записи (непустой список чисел)',
  Array.isArray(kasaniyaZvali[0]?.ids) && kasaniyaZvali[0].ids.length > 0
    && kasaniyaZvali[0].ids.every((n) => Number.isFinite(Number(n))),
  JSON.stringify(kasaniyaZvali[0]?.ids))
t('касание: число отмеченных названо в выводе', /касания отмечены: 3 из/.test(kas1.vyvod), kas1.vyvod.slice(-200))

kasaniyaZvali = []; kasanieOtvet = () => ({ otmecheno: 0, otkaz: { code: 'PAMYAT_KASANIE_NE_ZAPISANO', pochemu: 'проба: база только на чтение' } })
const kas2 = await perehvat(() => call(1, 1, 'sess-kasanie-2'))
t('В3 отказ касания НЕ отменяет выдачу', kas2.itog.messages.length === 1, JSON.stringify(kas2.itog.messages.length))
t('В3 отказ касания НАЗВАН вслух, а не проглочен',
  /касания НЕ записаны \(PAMYAT_KASANIE_NE_ZAPISANO\)/.test(kas2.vyvod), kas2.vyvod.slice(-200))

kasaniyaZvali = []
const byloOtmetit = pamyat.otmetitKasanie
delete pamyat.otmetitKasanie
const kas3 = await perehvat(() => call(1, 1, 'sess-kasanie-3'))
pamyat.otmetitKasanie = byloOtmetit
t('старое ядро без метода: выдача есть', kas3.itog.messages.length === 1, JSON.stringify(kas3.itog.messages.length))
t('старое ядро без метода: сказано, что нули значат «некому отмечать»',
  /касания НЕ отмечаются.*ядро старше alpha\.44/.test(kas3.vyvod), kas3.vyvod.slice(-200))

kasaniyaZvali = []; kasanieOtvet = () => { throw new Error('проба: метод бросил') }
const kas4 = await perehvat(() => call(1, 1, 'sess-kasanie-4'))
t('брошенное исключение касания не рушит выдачу', kas4.itog.messages.length === 1, JSON.stringify(kas4.itog.messages.length))
kasanieOtvet = () => ({ otmecheno: 0, otkaz: null })

// RU: Парные пробы флага подтверждения: 1 даёт пометку, 0 не даёт никакой подписи. Одно наличие пометки не исключило бы постоянно дописываемый фон.
// EN: Paired approval-flag checks: 1 creates an annotation, 0 creates no signature. Annotation presence alone would not rule out an always-added suffix.
{
  const cfgW = { welcomeBudget: 4000, ignoreAfterMs: 30 * 86400000, useVeraThreshold: 0.7 }
  const svezho = Date.now() - 3600000
  const bazovaya = { id: 1, klass: 'ogranichenie', soderzhim: 'СОДЕРЖИМОЕ-МЕТКА',
    agent: 'vladelec-znaniya', istochnik: 'sekretar', sozdano: svezho, vera: 0.9 }

  const sFlagom = renderWelcome([perevesti({ ...bazovaya, bez_podtverzhdeniya: 1 })], cfgW)
  t('пометка: при флаге 1 сказана в САМОМ тексте брифинга',
    typeof sFlagom === 'string' && sFlagom.includes('не подтверждено человеком'), String(sFlagom))
  // RU: Проба проверяет заявленную причину пометки, не приписанное происхождение «из дистилляции». Флаг ядра может описывать узел или отдельный вызов.
  // EN: Check the stated annotation cause rather than an invented “from distillation” origin. The core flag may describe the host or an individual call.
  t('пометка: названа причина, а не приписан источник',
    typeof sFlagom === 'string' && sFlagom.includes('отвечающего на узле не было')
      && !sFlagom.includes('из дистилляции'), String(sFlagom))
  // RU: Дата пометки относится к записи, не к дню прогона.
  // EN: The annotation date belongs to the record, not the test day.
  t('пометка: дата — дата записи',
    typeof sFlagom === 'string' && sFlagom.includes(new Date(svezho).toISOString().slice(0, 10)),
    String(sFlagom))

  // RU: Нулевой флаг не доказывает подпись человека; ни одно слово об одобрении не должно добавляться.
  // EN: A zero flag proves no human signature; add no approval wording.
  const bezFlaga = renderWelcome([perevesti({ ...bazovaya, bez_podtverzhdeniya: 0 })], cfgW)
  t('пометка: при флаге 0 о подтверждении НИ СЛОВА',
    typeof bezFlaga === 'string' && !/подтвержд/i.test(bezFlaga), String(bezFlaga))
  t('пометка: при флаге 0 запись всё равно в брифинге (молчание, а не пропуск)',
    typeof bezFlaga === 'string' && bezFlaga.includes('СОДЕРЖИМОЕ-МЕТКА'), String(bezFlaga))

  // RU: Неизвестное время не получает выдуманную дату.
  // EN: Unknown time receives no invented date.
  const bezVremeni = renderWelcome([perevesti({ ...bazovaya, sozdano: null, bez_podtverzhdeniya: 1 })], cfgW)
  t('пометка: без времени записи дата НЕ выдумана',
    typeof bezVremeni === 'string' && bezVremeni.includes('дата записи неизвестна'), String(bezVremeni))

  // RU: Позднее подтверждение проверяется годной и негодной отметками: наличие поля без автора не допускает одобрение.
  // EN: Test later approval with valid and invalid annotations: a field without an author permits no approval.
  const otmetka = JSON.stringify({ kem: 'владелец', kogda: Date.parse('2026-09-06T12:00:00Z') })
  const podtv = renderWelcome([perevesti({ ...bazovaya, bez_podtverzhdeniya: 1, podtverzhdenie: otmetka })], cfgW)
  t('Э5.4: подтверждённая позже НЕ называется неподтверждённой',
    typeof podtv === 'string' && !podtv.includes('не подтверждено человеком'), String(podtv))
  t('Э5.4: пометка называет ПОДТВЕРДИВШЕГО и обе даты',
    typeof podtv === 'string' && podtv.includes('подтверждено позже: владелец')
      && podtv.includes('2026-09-06') && podtv.includes('записано без подтверждения'), String(podtv))
  const negodnaya = renderWelcome([perevesti({ ...bazovaya, bez_podtverzhdeniya: 1, podtverzhdenie: 'это не json' })], cfgW)
  t('Э5.4: негодная отметка НЕ считается подтверждением',
    typeof negodnaya === 'string' && negodnaya.includes('не подтверждено человеком'), String(negodnaya))
  const bezImeni = renderWelcome([perevesti({ ...bazovaya, bez_podtverzhdeniya: 1, podtverzhdenie: JSON.stringify({ kogda: 1 }) })], cfgW)
  t('Э5.4: отметка без имени подтверждением НЕ является',
    typeof bezImeni === 'string' && bezImeni.includes('не подтверждено человеком'), String(bezImeni))
}

const ZHDYOM = 116  // RU: ZHDYOM=116 относится к проверяемому этапу до последующих проб. Сначала отказать при fail, затем сверить счёт: расхождение важнее слепоты и не должно скрываться за недоступным блоком.
// EN: ZHDYOM=116 applies to the checked stage before subsequent tests. Fail on fail first, then compare the count: mismatch takes precedence over inability to check and must not be hidden behind an unavailable block.
if (fail > 0) {
  console.log(`\nИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`)
  process.exit(1)
}
if (ok + fail + slep !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + fail + slep}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}

// RU: Пара проверяет camelCase после perevesti и предупреждение при сыром snake_case. Тихий перевод внутри formatter скрыл бы нарушение межпакетной формы.
// EN: The pair checks camelCase after perevesti and a warning for raw snake_case. Silent conversion inside the formatter would hide an inter-package shape violation.
{
  const cfg = { welcomeBudget: 2000, ignoreAfterMs: 7 * 24 * 3600 * 1000,
                useVeraThreshold: false, ignoreVeraThreshold: false }
  const stroka = (z) => String(renderWelcome([z], cfg)).split('\n')[1] ?? ''
  const obshchee = { vid: 'ogranichenie', avtor: 'a', soderzhim: 'знание', kogda: Date.now() }

  const perevedeno = stroka({ ...obshchee, bezPodtverzhdeniya: true, podtverzhdenie: null })
  t('переведённая форма: пометка «не подтверждено» В ТЕКСТЕ выдачи',
    perevedeno.includes('не подтверждено человеком'), perevedeno)

  const syroe = stroka({ ...obshchee, bez_podtverzhdeniya: 1, podtverzhdenie: null })
  t('СЫРАЯ форма поля: выдача КРИЧИТ о шве, а не молчит',
    syroe.includes('ФОРМА ЗАПИСИ НЕ ТА'), syroe)

  // RU: Обычная запись не получает пометку ни в одной форме, чтобы постоянный суффикс не прошёл контроль.
  // EN: An ordinary record receives no annotation in either shape so a constant suffix cannot pass the control.
  const obychnaya = stroka({ vid: 'urok', avtor: 'a', soderzhim: 'знание',
                             kogda: Date.now(), bezPodtverzhdeniya: false, podtverzhdenie: null })
  t('обычная запись пометки НЕ получает (иначе пометка ничего не различает)',
    !obychnaya.includes('не подтверждено') && !obychnaya.includes('ФОРМА ЗАПИСИ НЕ ТА'), obychnaya)
}

// RU: Проба порядка сводки читает исходник: ловит смену порядка построения, но не доказывает доставку в живую сессию. Отдельный поведенческий прогон нужен для получения полного текста.
// EN: The summary-order check reads source: it detects construction-order changes but does not prove delivery to a live session. A separate behavior test is needed to establish receipt of the complete text.
{
  // RU: Путь исходника строится от import.meta.url стенда, как импорт предмета, без недоступного локального имени другого scope.
  // EN: Build the source path from the test import.meta.url like the subject import, without using an unavailable local name from another scope.
  const src = __chitat(__put(new URL('../src/index.js', import.meta.url)), 'utf-8')
  const i = src.indexOf('let telo =')
  const okno = i > 0 ? src.slice(i, i + 700) : ''
  const iSvodka = okno.indexOf('Последняя сводка компакта')
  const iBrif = okno.indexOf('briefing ?')
  t('в приветствии СВОДКА собирается РАНЬШЕ брифинга',
    iSvodka > 0 && iBrif > iSvodka,
    `сводка@${iSvodka} брифинг@${iBrif} — при обратном порядке сводку срежет бюджет`)
  t('ветка «сводки нет» отдаёт брифинг, а не пустоту',
    /telo = briefing \?\? ''/.test(src),
    'без неё узел без сводки получил бы ПУСТОЕ приветствие')
}

console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`)
// RU: Финальный код различает расхождение 1 и слепоту 2; отсутствие выполненной проверки не является успехом 0.
// EN: The final exit code distinguishes mismatch 1 from inability to check 2; an unperformed check is not success 0.
process.exit(fail ? 1 : (slep ? 2 : 0))
