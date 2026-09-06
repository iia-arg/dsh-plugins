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
function stend(nastrojki = {}) {
  const stroki = []
  const slushateli = []
  const ctx = {
    logger: { info: (s) => stroki.push(s) },
    on: (imya, fn) => { if (imya === 'session/event') slushateli.push(fn); return () => {} },
  }
  const cfg = new Config(nastrojki)
  const api = apply(ctx, cfg)
  const podat = (type, data, timestamp) => slushateli.forEach((f) => f({ id: 's1' }, { type, data, timestamp }))
  return { stroki, podat, api }
}

proba('контроль: подъём называет себя и состояние стока', () => {
  const { stroki } = stend()
  return (stroki.some((s) => s.includes('подъём') && s.includes('сток НЕ задан'))) || 'строки подъёма нет'
})

proba('естественное сжатие: вид, объём, модель — в одной строке', () => {
  const t = stend()
  t.podat('compaction/start', { compactionId: 'k1' }, 1000)
  t.podat('compaction/summary', { compactionId: 'k1', shadowedTokenCount: 5000, model: 'm-1', usage: { input: 10, output: 4 } }, 3000)
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
  t.podat('turn/end', { usage: { input: 870 } }, 1)   // 87% — только первая ступень
  t.podat('turn/end', { usage: { input: 880 } }, 2)   // 88% — фронт уже пройден, молчим
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  if (kriki.length !== 1) return `криков ${kriki.length}: ${kriki.join(' | ')}`
  if (!/ступень 85%/.test(kriki[0])) return 'не названа перейдённая ступень: ' + kriki[0]
  return kriki[0].includes('счёт СВОЙ') || 'не сказано, что счёт свой: ' + kriki[0]
})

proba('В2: ОБЕ ступени одним скачком → ОДНО сообщение, а не два', () => {
  // 800 000 → 950 000 из ворот В2, в масштабе стенда: сразу 95% при ступенях 85 и 90.
  const t = stend({ predel: 1000, stupeni: [0.85, 0.9] })
  t.podat('turn/end', { usage: { input: 950 } }, 1)
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
  t.podat('turn/end', { usage: { input: 900 } }, 1)          // 90% — тревога №1
  t.podat('compaction/prune', { shadowedTokenCount: 800 }, 2) // обрезка: контекст урезан
  t.podat('turn/end', { usage: { input: 100 } }, 3)          // 10% — тихо
  t.podat('turn/end', { usage: { input: 900 } }, 4)          // снова 90% — тревога №2
  const kriki = t.stroki.filter((s) => s.includes('ЗАПОЛНЕНИЕ'))
  return kriki.length === 2 || `тревог ${kriki.length}, ожидалось 2 (после обрезки фронт обязан сброситься): ${kriki.join(' | ')}`
})

proba('🔴 предел не задан → доля не считается и ступени молчат', () => {
  const t = stend({ predel: 0 })
  t.podat('turn/end', { usage: { input: 999999 } }, 1)
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
  podat('compaction/summary', { compactionId: 'c1', shadowedTokenCount: 10, usage: { input_tokens: 1 } })
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

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
