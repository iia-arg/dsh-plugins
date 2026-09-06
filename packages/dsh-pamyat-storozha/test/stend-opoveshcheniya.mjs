/** Стенд оповещения: подставной ctx, настоящие события платформы по её объявлениям. */
import { apply, Config } from '../src/index.js'

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const v = telo()
  if (v && typeof v.then === 'function') { bed += 1; console.log(`❌ ${imya}: тело ОЖИДАЮЩЕЕ при синхронном прогонщике`); return }
  if (v === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${v}`) }
}

/** Подставной ctx той же природы, что живой: on('session/event', ...). */
function stend(nastrojki = {}, marshrut = 'net') {
  const stroki = []
  const slushateli = []
  const ctx = {
    logger: { info: (s) => stroki.push(s) },
    on: (imya, fn) => { if (imya === 'session/event') slushateli.push(fn); return () => {} },
  }
  const cfg = new Config(nastrojki)
  const api = apply(ctx, cfg)
  // 🔴 ПОДСТАВНАЯ СЕССИЯ ОТВЕЧАЕТ ТЕМ ЖЕ МЕТОДОМ, ЧТО ЖИВАЯ: requestContext() —
  // «latest resolved route metadata» платформы. Четыре состояния взяты не из головы, а
  // из её объявления: метода нет вовсе · маршрута ещё не было · маршрут есть, окна нет
  // (поле необязательное) · окно объявлено числом.
  const sessiya = marshrut === 'bez-metoda' ? { id: 's1' }
    : { id: 's1', requestContext: () => marshrut === 'net' ? undefined
        : (typeof marshrut === 'number'
            ? { provider: 'p1', model: 'm-okno', contextWindow: marshrut }
            : { provider: 'p1', model: 'm-bez-okna' }) }
  // 🔴 ФОРМА СОБЫТИЯ — ИЗ ОБЪЯВЛЕНИЯ ПЛАТФОРМЫ, А НЕ ИЗ ГОЛОВЫ (06.09.2026).
  // Поле времени называется `time` (SessionEvent: { type, seq, time, data } — «Unix epoch
  // milliseconds»). Прежде и стенд, и предмет писали `timestamp` — имя, которое я выдумала,
  // и потому проба стерегла ВЫДУМКУ: длительность была «не измерима» у всех сжатий, и в бою
  // тоже, а стенд был зелёным. Нашёл прогон на живом журнале, не стенд.
  // 🔴 МЕТКИ ВРЕМЕНИ — РЕАЛИСТИЧНЫЕ, А НЕ 1000/4000. Предмет отвергает время раньше 2020
  // года (иначе `Date.parse` строки неожиданной формы даёт годную дату тысячного года и
  // мусорную длительность). Условные малые числа проходили бы мимо этой границы, то есть
  // стенд снова проверял бы не то, что бывает в бою. Смещения в миллисекундах от эпохи.
  const BAZA = 1788000000000
  const podat = (type, data, time, sid) => slushateli.forEach((f) =>
    f(sid ? { ...sessiya, id: sid } : sessiya,
      { type, data, time: typeof time === 'number' ? BAZA + time : time }))
  return { stroki, podat, api }
}

proba('контроль: подъём называет себя и состояние стока', () => {
  const { stroki } = stend()
  return (stroki.some((s) => s.includes('подъём') && s.includes('сток НЕ задан'))) || 'строки подъёма нет'
})

proba('естественное сжатие: вид, объём, модель — в одной строке', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k1' }, 1000)
  t.podat('compaction/summary', { compactionId: 'k1', shadowedTokenCount: 5000, model: 'm-1', usage: { inputTokens: 10, outputTokens: 4 } }, 3000)
  t.podat('compaction/end', { compactionId: 'k1', turn: 7 }, 4500)
  const s = t.stroki.at(-1)
  return (s.includes('естественное') && s.includes('5000') && s.includes('m-1') && s.includes('14 ток.')) || `вышло: ${s}`
})

proba('принудительное отличается от естественного', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k2', sourceCommandId: 'c9' }, 2000)
  return t.stroki.at(-1).includes('ПРИНУДИТЕЛЬНОЕ') || `вышло: ${t.stroki.at(-1)}`
})

proba('🔴 расход не сообщён → сказано словами, ноль НЕ печатается', () => {
  const t = stend()
  t.podat('compaction/summary', { compactionId: 'k3', shadowedTokenCount: 100, model: 'm' }, 1000)
  t.podat('compaction/end', { compactionId: 'k3' }, 2000)
  const s = t.stroki.at(-1)
  return (s.includes('НЕ СООБЩЁН') && !s.includes('расход 0')) || `вышло: ${s}`
})

proba('🔴 провал НЕ считается сжатием и называет причину', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k4', error: 'провайдер отказал' }, 1000)
  const s = t.stroki.at(-1)
  return (s.includes('ПРОВАЛИЛАСЬ') && s.includes('провайдер отказал') && !s.includes('естественное')) || `вышло: ${s}`
})

proba('🔴 обрезка — отдельный вид, расхода нет ПО ПРИРОДЕ', () => {
  const t = stend()
  t.podat('compaction/prune', { shadowedTokenCount: 800, shadowedSeqs: [1, 2, 3] }, 1000)
  const s = t.stroki.at(-1)
  return (s.includes('ОБРЕЗКА') && s.includes('800') && s.includes('ПО ПРИРОДЕ')) || `вышло: ${s}`
})

proba('длительность названа своим именем, а не «работой модели»', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k5' }, 1000)
  t.podat('compaction/end', { compactionId: 'k5' }, 4000)
  return t.stroki.at(-1).includes('ЗАПИСЯМИ В ЖУРНАЛ') || `вышло: ${t.stroki.at(-1)}`
})

proba('🔴 без метки начала длительность НЕ измерима, а не нулевая', () => {
  const t = stend()
  t.podat('compaction/end', { compactionId: 'k6' }, 4000)
  const s = t.stroki.at(-1)
  return (s.includes('не измерима') && !s.includes('0.0 с')) || `вышло: ${s}`
})

proba('ступень заполнения кричит один раз и называет свой счёт', () => {
  // 🔴 ПРОБА ПЕРЕПИСАНА 06.09.2026 ПОД ВОРОТА В2. Прежняя искала текст «ступень 85%» и
  // покраснела, когда поведение стало ЛУЧШЕ: один скачок 900/1000 перешагивает обе ступени
  // разом, и теперь про них одно сообщение «ступени 85% и 90%». Проба была написана под
  // текст, а не под смысл; смысл — «на одно событие одно сообщение» — сохранён.
  const t = stend({ predel: 1000, stupeni: [0.85, 0.9] })
  t.podat('turn/end', { usage: { inputTokens: 870 } }, 1)   // 87% — только первая ступень
  t.podat('turn/end', { usage: { inputTokens: 880 } }, 2)   // 88% — фронт уже пройден, молчим
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (kriki.length !== 1) return `криков ${kriki.length}: ${kriki.join(' | ')}`
  if (!/ступень 85%/.test(kriki[0])) return 'не названа перейдённая ступень: ' + kriki[0]
  return kriki[0].includes('счёт СВОЙ') || 'не сказано, что счёт свой: ' + kriki[0]
})

proba('В2: ОБЕ ступени одним скачком → ОДНО сообщение, а не два', () => {
  // 800 000 → 950 000 из ворот В2, в масштабе стенда: сразу 95% при ступенях 85 и 90.
  const t = stend({ predel: 1000, stupeni: [0.85, 0.9] })
  t.podat('turn/end', { usage: { inputTokens: 950 } }, 1)
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (kriki.length !== 1) return `сообщений ${kriki.length}, ожидалось одно: ${kriki.join(' | ')}`
  if (!/85% и 90%/.test(kriki[0])) return 'в одном сообщении названы не обе ступени: ' + kriki[0]
  return /ОДНИМ скачком/.test(kriki[0]) || 'не сказано, что переход был одним скачком: ' + kriki[0]
})

proba('В0: после ОБРЕЗКИ ступень объявляется СНОВА (фронт сброшен)', () => {
  // 🔴 ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОБЫ БЫЛА СЛЕПА — поймано порчей, а не чтением. Я ждала, что
  // несброс даёт ЛОЖНУЮ тревогу, и проверяла «криков 0». Но usage события несёт ПОЛНОЕ
  // текущее заполнение: `vzyato = r.vsego` — замена, а не накопление, и после обрезки число
  // само становится малым. Ложной тревоги не бывает по построению, поэтому проба зеленела
  // и с порчей, и без.
  // Настоящая цена несброса — обратная: перейдённая ступень остаётся в «уже отданных», и
  // при ПОВТОРНОМ наборе того же объёма тревоги НЕ БУДЕТ. Теряется не ложный крик, а нужный.
  const t = stend({ predel: 1000, stupeni: [0.85] })
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 1)          // 90% — тревога №1
  t.podat('compaction/prune', { shadowedTokenCount: 800 }, 2) // обрезка: контекст урезан
  t.podat('turn/end', { usage: { inputTokens: 100 } }, 3)          // 10% — тихо
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 4)          // снова 90% — тревога №2
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  return kriki.length === 2 || `тревог ${kriki.length}, ожидалось 2 (после обрезки фронт обязан сброситься): ${kriki.join(' | ')}`
})

proba('🔴 предел не задан → доля не считается и ступени молчат', () => {
  const t = stend({ predel: 0 })
  t.podat('turn/end', { usage: { inputTokens: 999999 } }, 1)
  return !t.stroki.some((s) => s.includes('ЗАПОЛНЕНИЕ')) || 'ступень сработала без объявленного предела'
})


// ── СВОДКА: ОБЛАСТЬ, ЧИСЛИТЕЛЬ, ЗНАМЕНАТЕЛЬ (ворота В10, В11) ─────────────────────
// 🔴 ЗАЧЕМ ПРОБЫ ИМЕННО ТАКИЕ. «Сжатий N» без «ходов M» не значит ничего: ноль тревог
// при четырёх ходах и ноль при четырёхстах — разные новости. И «не проверял» обязано
// печататься ВСЕГДА, иначе тишина читается как «всё хорошо», а означать может «туда не
// смотрели». Обе пробы держат оба конца: числа считаются и границы называются.

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


// ── ОКНО У ПЛАТФОРМЫ, А НЕ ЧИСЛОМ В НАСТРОЙКЕ (ворота В5) ────────────────────────
// 🔴 ПАРА ПРОБ, А НЕ ОДНА. Признак ломается в обе стороны: перестанем спрашивать
// платформу — тихо вернёмся к устаревшему числу; перестанем брать настройку — потеряем
// единственную опору там, где платформа окна не объявила. Каждая сторона своей пробой.

proba('В5: окно берётся У ПЛАТФОРМЫ, а не из настройки', () => {
  // настройка говорит 1000, платформа — 2000. При 1700 ток. доля по настройке была бы
  // 170% (тревога), по платформе — 85% (тревога тоже). Различает ПЕЧАТЬ: чьё окно взято.
  const t = stend({ predel: 1000, stupeni: [0.85] }, 2000)
  t.podat('turn/end', { usage: { inputTokens: 1700 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (k.length !== 1) return `криков ${k.length}: ${k.join(' | ')}`
  if (!/из 2000 ток\./.test(k[0])) return 'считает не по окну платформы: ' + k[0]
  return /окно — платформа, модель m-okno/.test(k[0]) || 'источник окна не назван: ' + k[0]
})

proba('В5: платформа окна НЕ объявила → берётся настройка, и это ПОМЕЧЕНО', () => {
  const t = stend({ predel: 1000, stupeni: [0.85] }, 'bez-okna')
  t.podat('turn/end', { usage: { inputTokens: 900 } }, 1)
  const k = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (k.length !== 1) return `криков ${k.length}`
  if (!/из 1000 ток\./.test(k[0])) return 'запасное число не взято: ' + k[0]
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

// ── СОСТАВ СТРОКИ ТРЕВОГИ (ворота В1) ────────────────────────────────────────────

proba('В1: агент стоит в КАЖДОЙ тревоге, а не в одной', () => {
  const t = stend({ agent: 'iskra' })
  t.podat('compaction/end', { compactionId: 'a1' }, 1000)
  t.podat('compaction/prune', { shadowedTokenCount: 5 }, 2000)
  t.podat('compaction/end', { compactionId: 'a2', error: 'сеть' }, 3000)
  const trevogi = t.stroki.filter((s) => !s.includes('подъём:'))
  if (trevogi.length !== 3) return `тревог ${trevogi.length}, ожидалось 3`
  const bez = trevogi.filter((s) => !s.includes('агент iskra'))
  return bez.length === 0 || `без агента ${bez.length}: ${bez.join(' | ')}`
})

proba('🔴 В1: агент не назван → так и написано, а не тишина', () => {
  const t = stend({})
  t.podat('compaction/end', { compactionId: 'b1' }, 1000)
  return t.stroki.at(-1).includes('агент НЕ НАЗВАН')
    || 'строка без агента и без признания в этом: ' + t.stroki.at(-1)
})

proba('В1: id сжатия в строке — иначе её не сшить с журналом', () => {
  const t = stend({ agent: 'iskra' })
  t.podat('compaction/end', { compactionId: 'k-77' }, 1000)
  return t.stroki.at(-1).includes('id k-77') || 'id нет: ' + t.stroki.at(-1)
})

proba('🔴 В1: маршрут помечен как «на момент чтения», а не как маршрут сжатия', () => {
  const t = stend({ agent: 'iskra' }, 2000)
  t.podat('compaction/end', { compactionId: 'k-78' }, 1000)
  const s = t.stroki.at(-1)
  if (!s.includes('маршрут сейчас p1')) return 'провайдера нет: ' + s
  return /не обязательно тот, которым сжимали/.test(s)
    || 'маршрут выдан за маршрут сжатия — это утверждение сверх замера: ' + s
})


// ── СТУПЕНИ СЧИТАЮТСЯ ПО ДАВЛЕНИЮ, А НЕ ПО РАСХОДУ ВЫЗОВА ────────────────────────
// 🔴 Пара проб, потому что дефект ломается в обе стороны: возьмём расход вместо
// давления — доля завысится на весь выход и ступень закричит раньше срока; возьмём
// один только вход без кэша — занизится и ступень опоздает. Обе стороны своей пробой.

proba('🔴 выход модели в заполнение НЕ входит: ступень молчит', () => {
  // вход 500 из 1000 = 50%, выход 600. По расходу вышло бы 110% — ложная тревога.
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
  return /900 из 1000/.test(k[0]) || 'кэш не учтён: ' + k[0]
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


// ── ОХВАТ ПО СЕССИЯМ (ворота В4 в исполнимой форме) ──────────────────────────────
// 🔴 Пара проб: разряд обязан и СЧИТАТЬ виденное, и НАЗЫВАТЬ, чего он не видит.
// Без второго «видел 1» прочтётся как «на машине один агент» — а это про сессии
// ЭТОГО процесса, и чужих агентов сторож не видит ни одним событием.

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


// ── ФОРМА СОБЫТИЯ ВЗЯТА У ПЛАТФОРМЫ (06.09.2026) ────────────────────────────────
// 🔴 Проба-сторож против того, на чём этот пакет уже попался ДВАЖДЫ: usage писался
// выдуманными именами полей, время — полем `timestamp` вместо объявленного `time`.
// Оба раза стенд был зелёным, потому что подставные данные писала та же рука, что и
// предмет: проба стерегла выдумку. Ловил не стенд, а прогон на живом журнале.

proba('🔴 время берётся из поля time (объявление платформы), а не из выдуманного timestamp', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'z1' }, 1000)
  t.podat('compaction/end', { compactionId: 'z1' }, 4000)
  const s = t.stroki.at(-1)
  if (!/длительность 3\.0 с/.test(s)) return 'длительность по полю time не посчиталась: ' + s
  // и обратная сторона: событие СТАРОЙ формы не должно тихо давать 0
  const t2 = stend()
  t2.podat('compaction/end', { compactionId: 'z2' }, undefined)
  return /не измерима/.test(t2.stroki.at(-1))
    || 'без метки времени длительность выдана числом, а не «не измерима»'
})


proba('🔴 время неожиданной формы → «не измерима», а НЕ мусорное число', () => {
  // `Date.parse('1000')` даёт ГОДНУЮ дату — год тысячный. Без границы разумности такая
  // строка превращается не в отказ, а в длительность 94 670 812 800 с, и строка тревоги
  // выглядит осмысленной. Поймано порчей: проба на само чтение поля этого НЕ ловила.
  const t = stend()
  t.podat('compaction/start', { compactionId: 'q1' }, '1000')
  t.podat('compaction/end', { compactionId: 'q1' }, 4000)
  const s = t.stroki.at(-1)
  if (/длительность \d{5,}/.test(s)) return 'мусорное число выдано за длительность: ' + s
  return /не измерима/.test(s) || 'ожидалось «не измерима», вышло: ' + s
})

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
