// Канарейка restore: порча веток B (после компакта) и C (старт сессии) РАЗДЕЛЬНО.
// 🔴 ПРЕДМЕТ ГРУЗИТСЯ ДИНАМИЧЕСКИ, ЧТОБЫ ОТКАЗ БЫЛ СЛОВАМИ (03.09.2026).
// При статическом импорте у получателя, распаковавшего пакет и не выполнившего
// `npm install`, стенд падал сырой ошибкой оболочки ERR_MODULE_NOT_FOUND и кодом
// 1 — то есть выглядел как «пакет сломан», а не как «зависимости не поставлены».
// Проверено прогоном из распакованного тарбола: тот же вид отказа, за который
// на воротах 03.09 завернули метапакет. Отсутствие зависимости — СЛЕПОТА (код 2)
// со словами, а не расхождение.
let apply, Config, decide, perevesti
try {
  ({ apply, Config, decide, perevesti } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// 🔴 ИСТОЧНИК — ПОДДЕЛЬНАЯ СЛУЖБА ЯДРА, А НЕ ЗАГЛУШКА ВНУТРИ ПРЕДМЕТА.
// Заглушку из модуля убрали 03.09.2026: она кормила живой контекст выдумкой
// целый вечер. Здесь фикстура лежит В СТЕНДЕ и отдаётся ровно в той форме, в
// какой её отдаёт ядро — строкой таблицы (klass/sozdano/istochnik/vera), а не
// в наших именах. Иначе стенд проверял бы переходник его же собственным
// представлением о данных.
const ZAPISI = [
  { id: 1, agent: 'a', klass: 'reshenie', soderzhim: 'Прежде чем править чужой код — спросить владельца предмета.', sozdano: Date.now() - 3600e3, istochnik: 'koordinator', vera: 0.9, bez_podtverzhdeniya: 0 },
  { id: 2, agent: 'a', klass: 'navyk', soderzhim: 'Публикуемый пакет не должен нести путей чужой машины.', sozdano: Date.now() - 108000e3, istochnik: null, vera: 0.6, bez_podtverzhdeniya: 1 },
  { id: 3, agent: 'a', klass: 'reshenie', soderzhim: 'Старая запись для проверки ignore-ветки.', sozdano: Date.now() - 864000e3, istochnik: 'koordinator', vera: 0.9, bez_podtverzhdeniya: 0 },
  { id: 4, agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'Сводка компакта: TL;DR — закрыли слияние ядра и сторож.', sozdano: Date.now() - 60e3, istochnik: 'sekretar', vera: null, bez_podtverzhdeniya: 0 },
]
let sluzhbaZhiva = true
let posledniyVopros = null
// 🔴 ШПИОН КАСАНИЙ. Записывает, ЧЕМ его позвали: проверять надо не «позвали ли», а
// «позвали ли с тем поводом и теми записями». Повод — половина предмета ворот В2.
let kasaniyaZvali = []
let kasanieOtvet = () => ({ otmecheno: 0, otkaz: null })
const pamyat = {
  otmetitKasanie(vopros = {}) { kasaniyaZvali.push(vopros); return kasanieOtvet(vopros) },
  dostupna: () => sluzhbaZhiva,
  pochemuNedostupna: () => (sluzhbaZhiva ? null : 'проба: база закрыта'),
  prochitat(vopros = {}) {
    posledniyVopros = vopros
    const podhodit = vopros.klass ? ZAPISI.filter((z) => z.klass === vopros.klass) : ZAPISI
    // 🔴 ПОРЯДОК КАК У ЯДРА: ORDER BY sozdano DESC (hranilishche.js:326), то есть [0] —
    // САМАЯ СВЕЖАЯ. Прежде подставная память отдавала записи в порядке массива, и проба
    // «берётся последняя сводка» проверяла бы порядок нашей фикстуры, а не выбор предмета.
    // Приёмка нашла это порчей: подмена «взять старую вместо новейшей» давала 80/81 БЕЗ
    // красного — в подставных данных сводка была одна, и [0] совпадал с [последняя].
    // Класс: величина, совпадающая с другой на всех проверенных данных, не проверена вовсе.
    const poryadok = podhodit.slice().sort((a, b) => Number(b.sozdano ?? 0) - Number(a.sozdano ?? 0))
    return poryadok.slice(0, vopros.skolko ?? 20)
  },
}

const handlers = {}
const ctx = {
  on(ev, h) { handlers[ev] = h; return () => {} },
  get: (imya) => (imya === 'pamyat' ? pamyat : undefined),
}
// 🔴 СВОЙ ПУТЬ ОТМЕТОК О БРИФИНГЕ. Боевой файл — единственная сущность: стенд, пишущий
// в него, сорвал бы предел частоты живому агенту, а прогон стенда дважды подряд провалил
// бы сам себя (второй раз брифинг был бы «уже дан»). Проверено делом 03.09.2026: первый
// же прогон после правки упал именно так.
const otmetkiProby = join(tmpdir(), `restore-welcome-${process.pid}-${Date.now()}.json`)
apply(ctx, Config({ welcomeOtmetki: otmetkiProby }))

const prestep = handlers['agent/pre-step']
// 🔴 Компакт подаётся ТАК ЖЕ, КАК ЕГО ПОДАЁТ ПЛАТФОРМА: через хук session/event
// с событием нужного типа. Прежняя редакция звала handlers['compaction/end'] напрямую —
// и потому не заметила, что хука с таким именем в платформе нет вовсе, а подписка на
// него регистрируется молча и не срабатывает никогда.
const sessionEvent = handlers['session/event']
const compactEnd = (data = { compactionId: 'c1', turn: 7 }) =>
  sessionEvent?.({ id: 'sess-1' }, { type: 'compaction/end', data })
if (!prestep) { console.log('СЛЕПОТА: хук agent/pre-step не зарегистрирован'); process.exit(2) }

import { createHash as __hash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync as __chitat } from 'node:fs'
import { fileURLToPath as __put } from 'node:url'
// 🔴 ПРИБОР НАЗЫВАЕТ СЕБЯ (03.09.2026, условие ворот). Стенд правится на месте, и
// два прогона «тем же стендом» бывают двумя разными приборами — на этом за ночь
// дважды разошлись числа у соседей. Своя сумма в каждом прогоне делает вопрос
// «чем мерили» проверяемым, а не памятным.
console.log(`стенд: ${__put(import.meta.url).split('/').pop()} сумма ${
  __hash('sha256').update(__chitat(__put(import.meta.url))).digest('hex').slice(0, 16)}`)
// 🔴 ПЕЧАТЬ ИЗМЕРЯЕТ, СПРАВКА ОПИСЫВАЕТ (03.09.2026). Строка «стенд гонялся на
// таких-то версиях» верна на день написания; печать верна всегда. Здесь названы
// версии, которые стенд РЕАЛЬНО загрузил — из package.json тех модулей, что
// разрешились, а не из наших объявлений. Объявленное и загруженное расходятся
// молча: у меня dsh-session-persistence был объявлен и НЕ УСТАНОВЛЕН, стенд
// работал через переменную окружения, и по манифесту это было незаметно.
{
  const { createRequire } = await import('node:module')
  const trebuet = createRequire(import.meta.url)
  const versii = []
  for (const m of ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-llm',
                   '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-persistence',
                   '@deepseek-ai/cordis']) {
    let v = 'не разрешился'
    try { v = trebuet(`${m}/package.json`).version } catch { /* так и печатаем */ }
    versii.push(`${m.replace('@deepseek-ai/', '')} ${v}`)
  }
  console.log(`загружено: ${versii.join(' · ')}`)
}

let ok = 0, fail = 0, slep = 0
const t = (n, c, s) => { if (c) { ok++; console.log(`ok   ${n}`); } else { fail++; console.log(`FAIL ${n}\n     ${s ?? ''}`); } }
const next = async () => ({ kind: 'enter', messages: [] })
// 🔴 СЕССИЯ — ПАРАМЕТР (03.09.2026). Welcome теперь даётся ОДИН РАЗ на сессию за подъём
// процесса, а не при каждом turn===1. Значит проверки, которым нужен свежий брифинг,
// обязаны брать СВОЮ сессию — иначе они молча меряют «брифинг уже был», и провал
// выглядит дефектом механизма, хотя дефект в пробе.
// Уникальная сессия для проверок, которым нужен СВЕЖИЙ брифинг: welcome одноразовый
// на сессию за подъём процесса, и повторный вызов на той же сессии вернёт пустоту.
let nSess = 0
const svezhaya = () => `sess-svezh-${++nSess}`
const call = (turn, step, sid = 'sess-1') =>
  prestep({ agent: { id: 'agent-1', session: { id: sid } }, turn, step, signal: {} }, next)

// C: welcome на старте (turn=1, step=1)
const d1 = await call(1, 1)
t('C welcome: инъекция есть', d1.messages.length === 1, JSON.stringify(d1.messages))
const wtext = d1.messages[0]?.content?.[0]?.text ?? ''
t('C welcome: use есть', /\[use\]/.test(wtext), wtext)
t('C welcome: verify есть (вера ниже порога)', /\[verify\].*вера 0\.6 ниже порога/.test(wtext), wtext)
t('C welcome: ignore исключён (старая запись)', !/Старая запись/.test(wtext), wtext)
t('C welcome: основание напечатано', /старше|ниже порога|свежая/.test(wtext), wtext)

// C порча: не старт (turn=2) -> нет welcome
const d2 = await call(2, 1)
t('C порча: turn=2 -> нет welcome', d2.messages.length === 0, JSON.stringify(d2.messages))

// B: восстановление после компакта
compactEnd()
const d3 = await call(3, 1)
t('B restore: инъекция есть', d3.messages.length === 1, JSON.stringify(d3.messages))
const btext = d3.messages[0]?.content?.[0]?.text ?? ''
t('B restore: сводка вставлена', /Сводка компакта|Восстановление после компакта/.test(btext), btext)

// B порча: компакта не было (флаг уже сброшен) -> нет restore
const d4 = await call(4, 1)
t('B порча: без компакта -> нет restore', d4.messages.length === 0, JSON.stringify(d4.messages))

// 🔴 порча предмета: источник недоступен -> громкий отказ, не тихая пустота (правило 3)
const origProchitat = pamyat.prochitat
let logged = ''
const origWrite = process.stderr.write
process.stderr.write = (s) => { logged += s; return true }
pamyat.prochitat = () => undefined
const d5 = await call(1, 1, 'sess-porcha-istochnika')   // welcome при недоступном источнике: СВОЯ сессия, иначе брифинг уже дан
process.stderr.write = origWrite
pamyat.prochitat = origProchitat
t('порча входа: нет инъекции при недоступном источнике', d5.messages.length === 0, JSON.stringify(d5.messages))
t('порча входа: громкий отказ напечатан', /источник памяти недоступен/.test(logged), logged)

// 🔴 ДВЕ проверки, а не одна через && — приём взят из параллельной редакции при сведении
// (02.09.2026). Совмещённое условие при падении не говорит, какая половина нарушена:
// «подписался не на тот» и «подписался ещё и на несуществующий» — разные беды.
t('канал: session/event зарегистрирован',
  typeof handlers['session/event'] === 'function',
  `тип: ${typeof handlers['session/event']}`)
t('канал: compaction/end НЕ регистрируется (мёртвый слушатель)',
  handlers['compaction/end'] === undefined,
  `тип: ${typeof handlers['compaction/end']}`)

// Чужой тип события не должен взводить восстановление.
handlers['session/event']?.({ id: 'sess-1' }, { type: 'turn/end', data: { turn: 3 } })
const dChuzhoj = await call(2, 1)
t('чужой тип события не взводит restore', dChuzhoj.messages.length === 0, JSON.stringify(dChuzhoj.messages))

// Компакт, завершившийся ОШИБКОЙ, не взводит: история не урезана, восстанавливать нечего.
compactEnd({ compactionId: 'c2', turn: 8, error: 'boom' })
const dOshibka = await call(2, 1)
t('компакт с ошибкой не взводит restore', dOshibka.messages.length === 0, JSON.stringify(dOshibka.messages))

// Компакт в ДРУГОЙ сессии не должен вставлять в нашу.
sessionEvent?.({ id: 'sess-2' }, { type: 'compaction/end', data: { compactionId: 'c3', turn: 9 } })
const dChuzhaya = await call(2, 1)
t('компакт чужой сессии не взводит нашу', dChuzhaya.messages.length === 0, JSON.stringify(dChuzhaya.messages))

// 🔴 СЛЕД СРАБАТЫВАНИЯ. Без него живая проба невозможна: событие придёт, вставка
// произойдёт, и доказать это будет нечем. Молчание успеха неотличимо от отсутствия
// механизма — тот же класс, что подписка на несуществующий хук.
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

  // 🔴 ОПОЗНАВАТЕЛЬ ПОДНЯТОЙ ЗАПИСИ В САМОЙ ВСТАВКЕ. Замер по боевому журналу
  // 04.09.2026: ни одно поле вставки его не несло, и наследование уровня
  // происхождения (Э5.3) было неисполнимо по построению. Опознаватели едут в
  // `sections` — документированном поле контракта, а не своим полем в `source`:
  // лишнее поле может быть срезано молча, и «объявлено, но не доехало» хуже,
  // чем не объявлено.
  const sek = d.messages[0]?.source?.sections ?? []
  t('вставка несёт опознаватель поднятой записи',
     sek.length === 1 && /#zapis-\d+$/.test(sek[0].name), JSON.stringify(sek.map((s) => s.name)))
}

// Событие было, а записи «svodka» нет — ветка тихо проваливалась, взведение тратилось,
// и снаружи это выглядело как «событие не приходило».
{
  let sled = ''
  const orig = process.stderr.write
  process.stderr.write = (s) => { sled += s; return true }
  const bylo = pamyat.prochitat
  // Форма ЯДРА, а не наша: спрашивают класс сводки — ядро честно отдаёт пусто.
  pamyat.prochitat = (vopros = {}) => (vopros.klass ? [] : [{ id: 9, agent: 'a', klass: 'reshenie', soderzhim: 'без сводки', sozdano: Date.now(), istochnik: 'a', vera: 0.9, bez_podtverzhdeniya: 0 }])
  compactEnd({ compactionId: 'c10', turn: 43 })
  await call(2, 1)
  pamyat.prochitat = bylo
  process.stderr.write = orig
  // Строка обязана НАЗЫВАТЬ КЛАСС: иначе при расхождении настроек секретаря и
  // нашей мы увидим «сводки нет» и не поймём, что искали не то имя.
  t('след: «компакт был, а сводки нет» сказано вслух', /записи класса «svodka-kompakcii» в памяти нет/.test(sled), sled)
  t('след: спрошен был ИМЕННО класс сводки', posledniyVopros?.klass === 'svodka-kompakcii', JSON.stringify(posledniyVopros))
}

// --- ЛИЧНОСТЬ ВСТАВЛЕННОГО СООБЩЕНИЯ (03.09.2026, куплено обрывом журнала) ---
// Мы собирали сообщение литералом без поля id. Платформа считает user/message БЕЗ id
// устаревшей записью и при загрузке требует для неё сохранённый префикс — сессия
// перестаёт грузиться. Узнаётся это НЕ при записи, а при следующем подъёме: запись
// принимается молча. «Доказана запись» и «доказано чтение» — разные величины.
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

// --- УСЛОВИЕ LEGACY ВЫРЕЗАЕТСЯ ИЗ ПЛАТФОРМЫ, А НЕ ПЕРЕПИСАНО ЗДЕСЬ -----------
// 🔴 Копия чужого условия стареет молча: платформа поменяет требование, а стенд
// продолжит проверять прежнее и останется зелёным. Поэтому условие берётся ИЗ
// ФАЙЛА платформы и исполняется на нашем сообщении.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: это НЕ загрузка сессии. Проверяется одно условие отнесения
// записи к устаревшим, а не весь путь чтения журнала. Живая загрузка проверяется
// канарейкой перед подъёмом — она поднимает копию платформы на настоящем журнале.
{
  // 🔴 УМОЛЧАНИЕ БЕЗ ЧАСТНОГО ПУТИ. Прибитый путь нашей установки работает только у
  // нас, а у поставившего пакет стенд молча ослеп бы на чужой раскладке — и это ещё
  // мягкий исход: путь с именем нашего агента просто не должен уезжать наружу.
  // Ищем разрешением имени, как его найдёт сама платформа; не вышло — DSH_PERSIST.
  const PUT = process.env.DSH_PERSIST || (() => {
    try { return import.meta.resolve('@deepseek-ai/dsh-session-persistence') } catch { return null }
  })()
  let uslovie = null
  try {
    const kod = (await import('node:fs')).readFileSync(PUT.replace(/^file:\/\//, ''), 'utf-8')
    const m = kod.match(/case "user\/message": return ([^;]+);/)
    if (m) uslovie = new Function('data', 'Object', `return ${m[1]}`)
  } catch { /* ниже честная слепота */ }
  if (!uslovie) {
    slep += 2  // ровно столько проверок в этом блоке не состоялось
    console.log(`СЛЕПОТА: условие legacy не вырезалось из ${PUT ?? '<пакет не разрешился>'} — проверить нечем.`)
    console.log('  Пакет вне дерева платформы разрешить имя не может. Задайте путь явно:')
    console.log('  DSH_PERSIST=<платформа>/node_modules/@deepseek-ai/dsh-session-persistence/lib/index.js node test/stend-restore.mjs')
  } else {
    // Своя сессия: welcome одноразовый, иначе messages[0] окажется undefined и блок
    // упадёт TypeError вместо честной проверки. Поймано прогоном 03.09.2026.
    const d = await call(1, 1, 'sess-legacy')
    const nashe = d.messages[0]
    t('наше сообщение НЕ считается устаревшей записью',
      uslovie(nashe, Object) === false,
      'платформа отнесёт его к legacy и потребует сохранённый префикс при загрузке')
    // Контроль зрячести: без id то же условие обязано сказать «устаревшее».
    const bezId = { content: nashe.content }
    t('контроль зрячести: без id условие срабатывает', uslovie(bezId, Object) === true,
      'условие вырезалось, но ничего не различает — проверка мнимая')
  }
}

// --- ПРОГОН ЧЕРЕЗ НАСТОЯЩИЙ ВАЛИДАТОР ЗАГРУЗКИ (условие ворот 03.09.2026) ------
// 🔴 ПОЧЕМУ ЭТОГО НЕ ЗАМЕНЯЕТ ПРОВЕРКА ВЫШЕ. Там исполняется ОДНО условие отнесения
// записи к устаревшим. Здесь событие проходит ту самую функцию, через которую его
// проводит платформа при чтении журнала: adoptSessionEvent -> assertMessageEventShape.
// Она требует большего, чем непустой id: роль ровно 'user', source с непустым kind,
// content массивом. Проверять надо путь, а не одно его условие.
//
// 🔴 Я СПЕРВА ОТКАЗАЛАСЬ ЭТО ДЕЛАТЬ, сославшись на то, что живая загрузка требует
// поднять половину платформы. Это было неверно: я смотрела на SessionPersistence —
// службу cordis, — а нужная функция экспортируется пакетом отдельно. «Дорого» было
// сказано про другой объект.
{
  const IST = process.env.DSH_SESSION || '@deepseek-ai/dsh-session'
  let adopt = null
  try { ({ adoptSessionEvent: adopt } = await import(IST)) } catch { /* слепота ниже */ }
  if (typeof adopt !== 'function') {
    slep += 3  // ровно столько проверок в этом блоке не состоялось
    console.log(`СЛЕПОТА: adoptSessionEvent не загрузилась из ${IST} — путь загрузки не проверен.`)
    console.log('  Задайте путь явно: DSH_SESSION=<платформа>/node_modules/@deepseek-ai/dsh-session/lib/index.js')
  } else {
    // Своя сессия: welcome одноразовый на сессию за подъём процесса.
    const d = await call(1, 1, 'sess-validator')
    const nashe = d.messages[0]
    let prinyato = null
    try { adopt({ seq: 1, type: 'user/message', data: nashe }); prinyato = true }
    catch (e) { prinyato = e.message }
    t('событие проходит валидатор загрузки платформы', prinyato === true, String(prinyato))
    // Запись должна ОПОЗНАВАТЬСЯ как наша: по source.plugin её находят в журнале,
    // когда разбирают, кто что вставил. Без этого id есть, а чей он — неизвестно.
    t('запись опознаётся по source.plugin', nashe?.source?.plugin === 'dsh-pamyat-restore',
      JSON.stringify(nashe?.source?.plugin))
    // Контроль зрячести: тот же валидатор на сообщении без id обязан отвергнуть.
    // Без него зелёное означало бы лишь «функция ничего не проверяет».
    const { id, ...bezId } = nashe
    let otvergnuto = false
    try { adopt({ seq: 2, type: 'user/message', data: bezId }) } catch { otvergnuto = true }
    t('контроль зрячести: без id валидатор отвергает', otvergnuto,
      'валидатор принял запись без id — проверка выше ничего не доказывает')
  }
}

// --- «НЕ ИЗМЕРЯЛИ» ПРОТИВ «НИЖЕ ПОРОГА» (03.09.2026) -------------------------
// 🔴 Ядро развело эти два состояния ПРИ ЗАПИСИ, а чтение схлопывало их обратно
// сравнением. Причём двумя способами сразу: null уходил в verify с ложным числом
// в причине, а undefined — в USE, то есть неизмеренная запись объявлялась
// достоверной. Проверяется РЕШЕНИЕ и ПРИЧИНА, потому что решение у null и у
// «ниже порога» одинаковое (verify) и по нему одному дефект неразличим.
{
  const c = { ignoreAfterMs: 604800000, useVeraThreshold: 0.7 }
  const svezhaya = (vera) => ({ kogda: Date.now(), vera })
  for (const [vera, imya] of [[null, 'null'], [undefined, 'undefined'], [NaN, 'NaN']]) {
    const d = decide(svezhaya(vera), c)
    t(`вера ${imya}: решение НЕ «use»`, d.decision !== 'use', JSON.stringify(d))
    t(`вера ${imya}: причина называет «не измерялась»`, /не измерял/.test(d.reason), d.reason)
    // 🔴 Число в причине здесь и есть ложь: сравнивать было нечего.
    t(`вера ${imya}: в причине НЕТ числа`, !/\d/.test(d.reason), d.reason)
  }
  // Различение сохранено: измеренная низкая вера по-прежнему называет число.
  const nizkaya = decide(svezhaya(0.5), c)
  t('вера 0.5: verify с числом в причине', nizkaya.decision === 'verify' && /0\.5/.test(nizkaya.reason), JSON.stringify(nizkaya))
  // Измеренный ноль — НЕ отсутствие: он законно идёт в verify с числом.
  const nol = decide(svezhaya(0), c)
  t('вера 0: измеренный ноль отличён от отсутствия', /0 ниже порога/.test(nol.reason), JSON.stringify(nol))
  const vysokaya = decide(svezhaya(0.9), c)
  t('вера 0.9: use', vysokaya.decision === 'use', JSON.stringify(vysokaya))

  // 🔴 ВРЕМЯ — ТОТ ЖЕ КЛАСС, ЧТО ВЕРА. Отсутствие давало ДВА противоположных
  // тихих исхода: null -> ignore («старше 20 тысяч суток», запись выброшена),
  // undefined -> проходила как свежая. Найдено сплошным обходом сравнений.
  for (const [kogda, imya] of [[null, 'null'], [undefined, 'undefined'], [NaN, 'NaN'], ['мусор', 'строка']]) {
    const d = decide({ kogda, vera: 0.9 }, c)
    t(`время ${imya}: НЕ ignore и НЕ use`, d.decision === 'verify', JSON.stringify(d))
    t(`время ${imya}: причина называет неизвестность времени`, /время записи неизвестно/.test(d.reason), d.reason)
  }
  // Различение сохранено: настоящая старая запись по-прежнему ignore с числом суток.
  const staraya = decide({ kogda: Date.now() - 900000000, vera: 0.9 }, c)
  t('настоящая старая запись: ignore с числом суток', staraya.decision === 'ignore' && /\d+ сут/.test(staraya.reason), JSON.stringify(staraya))
}

// --- ПЕРЕХОДНИК ЯДРО -> RESTORE (03.09.2026) --------------------------------
// 🔴 Единственное место, где соприкасаются две формы. Здесь легче всего молча
// потерять то, что развели: null веры, отметку о записи без подтверждения,
// происхождение. Форма входа — строка таблицы ядра, дословно.
{
  const syraya = { id: 7, agent: 'vladelec-znaniya', klass: 'navyk', soderzhim: 'текст',
    sozdano: 1788375345892, istochnik: 'sekretar', vera: null, bez_podtverzhdeniya: 1 }
  const p = perevesti(syraya)
  t('переходник: klass -> vid', p.vid === 'navyk', JSON.stringify(p))
  t('переходник: sozdano -> kogda', p.kogda === 1788375345892, JSON.stringify(p.kogda))
  t('переходник: istochnik -> avtor', p.avtor === 'sekretar', String(p.avtor))
  // 🔴 Несущее: null обязан дойти НЕТРОНУТЫМ. Подстановка нуля или порога здесь
  // уничтожила бы различение «не измеряли» / «измерили низко» на переходе.
  t('переходник: вера null НЕ подменена', p.vera === null, JSON.stringify(p.vera))
  t('переходник: отметка без подтверждения доехала', p.bezPodtverzhdeniya === true, String(p.bezPodtverzhdeniya))
  const bezIstochnika = perevesti({ ...syraya, istochnik: null })
  t('переходник: без istochnik автор — владелец знания', bezIstochnika.avtor === 'vladelec-znaniya', String(bezIstochnika.avtor))
  const izmerennyj = perevesti({ ...syraya, vera: 0 })
  t('переходник: измеренный ноль доходит нулём', izmerennyj.vera === 0, JSON.stringify(izmerennyj.vera))
  t('переходник: мусор на входе -> null, а не полупустая запись', perevesti(null) === null && perevesti('строка') === null, 'вернулось не null')
}

// --- ОТКАЗ СЛУЖБЫ ПАМЯТИ ГРОМКИЙ (а не тихая пустота) -----------------------
{
  const orig = process.stderr.write
  let sled = ''
  process.stderr.write = (x) => { sled += x; return true }
  const bylo = ctx.get
  ctx.get = () => undefined            // ядро не смонтировано
  const d = await call(1, 1, svezhaya())
  ctx.get = bylo
  process.stderr.write = orig
  t('нет службы памяти: инъекции НЕТ', d.messages.length === 0, JSON.stringify(d.messages))
  t('нет службы памяти: сказано вслух', /служба памяти недоступна/.test(sled), sled)

  let sled2 = ''
  process.stderr.write = (x) => { sled2 += x; return true }
  sluzhbaZhiva = false
  const d2 = await call(1, 1, svezhaya())
  sluzhbaZhiva = true
  process.stderr.write = orig
  t('память отвечает «недоступна»: инъекции НЕТ', d2.messages.length === 0, JSON.stringify(d2.messages))
  t('память отвечает «недоступна»: названа ПРИЧИНА', /проба: база закрыта/.test(sled2), sled2)
}

// --- ВЫЗОВ БЮДЖЕТА ИЗ СЛОЯ C (03.09.2026) ------------------------------------
// 🔴 Служба без потребителя — зелёная пустота: поднимется, промолчит, и молчание
// неотличимо от работы. Поэтому вызывающий пишется ДО монтажа службы, а не после.
// Проверяется и то, что вызов есть, и то, что его ОТСУТСТВИЕ названо вслух.
{
  const orig = process.stderr.write
  let sled = ''
  process.stderr.write = (x) => { sled += x; return true }
  const d1 = await call(1, 1, svezhaya())                     // бюджета в ctx нет
  process.stderr.write = orig
  t('без бюджета: брифинг всё равно построен', d1.messages.length === 1, JSON.stringify(d1.messages))
  t('без бюджета: сказано вслух', /бюджет не смонтирован/.test(sled), sled)

  // Теперь служба есть и отбрасывает часть.
  let sprosili = null
  const byudzhet = { otobrat(v) { sprosili = v; return { podnyato: v.zapisi.slice(0, 1), otbrosheno: v.zapisi.slice(1), svodka: {} } } }
  const byloGet = ctx.get
  ctx.get = (imya) => (imya === 'byudzhetPamyati' ? byudzhet : byloGet(imya))
  let sled2 = ''
  process.stderr.write = (x) => { sled2 += x; return true }
  const d2 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  t('бюджет спрошен на ТЕХ ЖЕ записях, что прочитаны', Array.isArray(sprosili?.zapisi) && sprosili.zapisi.length > 0, JSON.stringify(sprosili && Object.keys(sprosili)))
  // 🔴 ПРИЗНАК СЧИТАЕТ ЗАПИСИ, А НЕ ПЕРЕВОДЫ СТРОК (поправлено 05.09.2026 при Э8.6).
  // Прежде проба мерила ЧИСЛО СТРОК в тексте, а стережёт она ЧИСЛО ЗАПИСЕЙ, поднятых
  // по бюджету. Пока текст состоял только из строк «- запись», эти величины совпадали —
  // и различить их было нечем. Как только рядом лёг блок сводки (Э8.6: поднимается
  // ЦЕЛИКОМ и ВНЕ бюджета, по решению предмета), проба покраснела на исправном.
  // Признак заменён на прямой: считаем строки, начинающиеся с «- ».
  t('в брифинг попало только поднятое ПО БЮДЖЕТУ', (d2.messages[0]?.content?.[0]?.text ?? '')
    .split('\n').filter((x) => x.startsWith('- ')).length === 1,
    d2.messages[0]?.content?.[0]?.text)
  t('применение бюджета названо вслух', /бюджет применён: поднято 1 из/.test(sled2), sled2)

  // Отказ бюджета не отменяет брифинг: он про ЦЕНУ, а не про право.
  ctx.get = (imya) => (imya === 'byudzhetPamyati' ? { otobrat() { throw new Error('проба: предел не прочитан') } } : byloGet(imya))
  let sled3 = ''
  process.stderr.write = (x) => { sled3 += x; return true }
  const d3 = await call(1, 1, svezhaya())
  process.stderr.write = orig
  ctx.get = byloGet
  t('отказ бюджета НЕ отменяет брифинг', d3.messages.length === 1, JSON.stringify(d3.messages))
  t('отказ бюджета назван с причиной', /бюджет отказал \(проба: предел не прочитан/.test(sled3), sled3)
}

// ═══ Э8.6: СВОДКА ПОДНИМАЕТСЯ ЦЕЛИКОМ И ВНЕ БЮДЖЕТА ═══
//
// 🔴 Устройство стенда: подставная память здесь ОДНА на весь файл и отвечает из ZAPISI.
// Поэтому длинную сводку кладём В ZAPISI, а не подменяем память своей — иначе проба
// проверяла бы не тот предмет, которым пользуются остальные пробы.
async function stendSvodkiVneByudzheta () {
  console.log('\n— Э8.6: последняя сводка компакта вне бюджета —')
  const KLASS = 'svodka-kompakcii'
  const DLINNAYA = 'С'.repeat(9000)   // заведомо больше и бюджета, и welcomeBudget
  const bylo = ZAPISI.slice()
  // 🔴 ИСХОДНУЮ СВОДКУ УБИРАЕМ: в ZAPISI уже лежит запись этого класса (id=4, 55 знаков),
  // а подставная память отдаёт ПЕРВЫЕ `skolko` подходящих. При skolko=1 нашлась бы она,
  // и проба мерила бы не тот предмет — зелёное или красное относилось бы к чужой записи.
  for (let i = ZAPISI.length - 1; i >= 0; i--) if (ZAPISI[i].klass === KLASS) ZAPISI.splice(i, 1)
  // 🔴 СВОДКА КЛАДЁТСЯ СТАРШЕЙ И В КОНЕЦ — НАМЕРЕННО. Первая редакция клала её первой
  // и свежайшей, и проба зеленела ПО ДРУГОЙ ПРИЧИНЕ: в обычном пути первая строка
  // добавляется целиком даже сверх предела (`lines.length > 0` в условии обрыва).
  // Порча «не поднимать сводку вне бюджета» такую пробу НЕ роняла. Теперь сводка
  // заведомо не первая: обычным путём она обрежется, и в брифинг попадёт только
  // отдельным подъёмом.
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

  // Зеркальная сторона: сводки НЕТ ВОВСЕ — сказано «не нашлось», а не молчание.
  // 🔴 Первая редакция просто возвращала прежний ZAPISI — и проба краснела на исправном:
  // сводка класса svodka-kompakcii ЛЕЖАЛА ТАМ ИЗНАЧАЛЬНО (id=4). Я предположила состав
  // подставных данных вместо того, чтобы его прочитать. Теперь класс убирается явно.
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

  // 🔴 ДВЕ СВОДКИ РАЗНОГО ВРЕМЕНИ — ПОДНИМАЕТСЯ НОВЕЙШАЯ (находка приёмки 05.09.2026).
  // Без этой пробы «взять [0]» и «взять последнюю» неотличимы: в фикстуре сводка была одна.
  // Код исправен (ядро сортирует DESC), но защищал его не стенд, а совпадение данных.
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
  // ⚠️ ТРЕБОВАТЬ ОТСУТСТВИЯ СТАРОЙ В ПЕРЕЧНЕ НЕЛЬЗЯ, и первая редакция этой пробы была
  // неверна именно так. Старая сводка (101) законно попадает в ОБЫЧНЫЙ отбор как рядовая
  // запись — обрезанной по пределу; вне бюджета поднимается только новейшая. Перечень
  // опознавателей называет ВСЁ, что ушло в ход, и это верно. Поймано прогоном: проба
  // краснела на исправном предмете.
  t('в перечне опознавателей есть НОВЕЙШАЯ (102)',
    /опознаватели: [^\n]*102/.test(sled3), sled3.slice(-200))
}

// 🔴 КЛАСС СВОДКИ — ОДНА СТРОКА НА ДВА ПАКЕТА. Секретарь ПИШЕТ сводку под этим классом,
// restore ИЩЕТ её по нему же. Разойдись умолчания — restore честно скажет «записи класса
// … в памяти нет», и это будет неотличимо от «компакта не было». Каждый пакет при этом
// прав по-своему: дыра живёт МЕЖДУ ними и невидима каждому в отдельности.
//
// Тот же класс нашла проба [G] у ядра (перечни классов знаний). Здесь он же между
// секретарём и восстановлением — и предмет мой, значит и проба моя.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: соседний пакет может быть не установлен — тогда СЛЕПОТА, а не
// «сошлось»: отсутствие сверки не есть её успешный исход.
{
  let klassSekretarya = null
  for (const put of ['../../dsh-pamyat-secretary/src/index.js',
                     '../node_modules/dsh-pamyat-secretary/src/index.js']) {
    try {
      const m = await import(new URL(put, import.meta.url).href)
      klassSekretarya = m.Config?.().klass ?? null
      if (klassSekretarya) break
    } catch { /* ищем дальше */ }
  }
  if (!klassSekretarya) {
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

// 🔴 КАНАРЕЙКА ТОЧНОГО ЧИСЛА. Без неё вырезанный раздел проходит кодом 0:
// выпотрошенный стенд отчитывается успехом. Число точное, а не «не меньше»:
// порог слеп к убыли ровно того размера, который умещается в запас.
// ═══ Э8.3 П1: КАСАНИЕ ОТМЕЧАЕТСЯ НА ВЫДАЧЕ (ворота В2/В3) ═══
// Перехват вывода нужен потому, что часть предмета — СТРОКА, а не возврат: молчание о
// неотмеченных касаниях и есть та беда, ради которой ветки заведены.
// 🔴 ПЕРЕХВАТЫВАЕТСЯ stderr, А НЕ console.log — И ЭТО НЕ МЕЛОЧЬ.
// Первая редакция ловила console.log и молчала при РАБОТАЮЩЕЙ правке: пакет печатает
// через process.stderr.write. Проба отвечала про свой канал, а не про предмет; поверь я
// ей — пошла бы чинить исправное. Тот же класс поймал меня сутками раньше на секретаре.
// Годный способ один: спросить, чем печатает ПРЕДМЕТ, и слушать ровно этот путь.
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

// Меняли стенд намеренно? Поправьте число и скажите, почему.
// 02.09.2026: 11 -> 16 при передаче владения, 16 -> 20 после монтажа (следы срабатывания) (подписка через session/event,
// чужой тип события, ошибка компакта, чужая сессия).
const ZHDYOM = 93  // 05.09.2026: 74 -> 81, семь проб Э8.6; 81 -> 90, девять проб Э8.3 П1; 90 -> 93, три пробы «из двух сводок поднимается новейшая» (находка приёмки: [0] и [последняя] совпадали на фикстуре с одной сводкой) (касание на выдаче: повод, состав, число, отказ, старое ядро, исключение) (сводка целиком вне бюджета + зеркальная сторона «сводки нет»)
// 🔴 РАСХОЖДЕНИЕ ВАЖНЕЕ СЛЕПОТЫ, поэтому оно проверяется ПЕРВЫМ. Первая редакция
// сначала сверяла число проверок — и на порче отвечала кодом 2 «часть не состоялась»,
// пряча пять настоящих провалов за слепотой по недоступному пути. Читающий код увидел
// бы «проверить не удалось» там, где предмет сломан.
if (fail > 0) {
  console.log(`\nИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`)
  process.exit(1)
}
if (ok + fail + slep !== ZHDYOM) {
  console.log(`\nСЛЕПОТА: проверок ${ok + fail + slep}, а стенд состоит из ${ZHDYOM} — часть не состоялась.`)
  process.exit(2)
}

console.log(`ИТОГО: сошлось ${ok}, расхождений ${fail}, слепот ${slep}`)
// Слепота — свой код: «проверить нечем» и «проверено, сошлось» это разные новости.
process.exit(fail ? 1 : (slep ? 2 : 0))
