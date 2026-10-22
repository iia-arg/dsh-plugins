// RU: Стенд стража одиночного монтажа: один агент — один набор обработчиков на процесс, сколько бы раз ни звали
//     apply.
//     Чем этот стенд отличается от прежнего и почему тот был зелёным при живом дефекте. Прежний звал apply
//     дважды С ОДНИМ И ТЕМ ЖЕ ctx, а платформа даёт каждому монтажу СВОЙ ctx внутри одного процесса (замер в
//     работе: три подъёма, один агент). Проба воспроизводила не настоящий способ вызова, а представление о нём,
//     и покраснеть не могла ни при каком дефекте этого рода. Хуже: последняя проба прежнего стенда ТРЕБОВАЛА,
//     чтобы разные ctx не глушили друг друга, — то есть стерегла ровно тот дефект, который потом чинили. Она
//     снята намеренно.
//     Устройство стенда: страж живёт в памяти модуля и не сбрасывается между пробами. Поэтому КАЖДАЯ проба
//     берёт своё имя агента — иначе пробы глушат друг друга, и стенд мерит собственный след, а не предмет.
//     Запуск: node test/stend-odinochnogo-montazha.mjs; код 0 — всё зелёное, 1 — есть красные, 2 — канарейка
//     (число проб разошлось с ZHDYOM).
// EN: Stand for the single-mount guard: one agent — one set of handlers per process, no matter how many times
//     apply is called.
//     How this stand differs from the earlier one and why that one was green with a live defect. The earlier
//     stand called apply twice WITH THE SAME ctx, while the platform gives EACH mount its own ctx inside one
//     process (measured in production: three start-ups, one agent). The probe reproduced not the real way of
//     calling but an idea of it, and could not turn red for any defect of this kind. Worse: the last probe of
//     the earlier stand REQUIRED that different ctx objects not silence each other — i.e. it guarded exactly
//     the defect that was later fixed. It was removed on purpose.
//     Stand design: the guard lives in module memory and is not reset between probes. So EVERY probe uses its
//     own agent name — otherwise probes silence each other and the stand measures its own trace, not the
//     subject.
//     Run: node test/stend-odinochnogo-montazha.mjs; exit 0 — all green, 1 — some red, 2 — canary (number of
//     probes differs from ZHDYOM).
import { apply } from '../src/index.js'

let bed = 0, vsego = 0
const proba = (imya, f) => {
  vsego++
  try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ'); console.log(`  ✅ ${imya}`) }
  catch (e) { bed++; console.log(`  🔴 ${imya}\n     ${e.message}`) }
}
// RU: Каждый вызов — НОВЫЙ ctx, как у платформы. Одинаковым остаётся только набор настроек.
// EN: Each call gets a NEW ctx, as with the platform. Only the settings stay the same.
const podelnyjCtx = () => {
  const stroki = []
  const obrabotchiki = []
  return {
    on(imya, fn) { obrabotchiki.push(imya); },
    provide() {},
    logger: { info(m) { stroki.push(String(m)); }, error(m) { stroki.push(String(m)); } },
    stroki, obrabotchiki,
  }
}
// RU: Образец, которым чужие приборы разбирают журнал: «[имя версия] …». Версия не вписывается сюда числом:
//     иначе стенд пришлось бы править каждый выпуск, и он краснел бы на исправном коде.
//     Поле oknoKonteksta в наборе ниже схемой не объявлено и предметом не читается (окно — от платформы или
//     predel); на исход проб не влияет.
// EN: The pattern other tools use to parse the log: "[name version] …". The version is not written here as a
//     number: otherwise the stand would need editing every release and would turn red on correct code.
//     The oknoKonteksta field in the settings below is not declared in the schema and is not read by the
//     subject (the window comes from the platform or predel); it does not affect the probes.
const OBRAZEC = /^\[dsh-pamyat-storozha \S+\] /
const nabor = (agent) => ({ stupeni: [0.85, 0.9], oknoKonteksta: 1000000, agent })

proba('стенд годен: ОДИН apply регистрирует обработчики', () => {
  const ctx = podelnyjCtx()
  apply(ctx, nabor('probe-godnost'))
  if (ctx.obrabotchiki.length === 0) throw new Error('стенд негоден: обработчиков ноль, мерить нечего')
})

proba('ПРИЗНАК ЗАКРЫТИЯ a20: два apply с РАЗНЫМИ ctx и ОДНИМ агентом → регистрация не удваивается', () => {
  const odin = podelnyjCtx(); apply(odin, nabor('probe-odin'))
  const a = podelnyjCtx(); const b = podelnyjCtx()
  apply(a, nabor('probe-dva')); apply(b, nabor('probe-dva'))
  const vyshlo = a.obrabotchiki.length + b.obrabotchiki.length
  if (vyshlo !== odin.obrabotchiki.length) {
    throw new Error(`от одного монтажа ${odin.obrabotchiki.length}, от двух с разными ctx ${vyshlo} — регистрация удвоилась, ключ стража не держит боевой способ вызова`)
  }
})

proba('второй монтаж НЕ молчит: говорит строкой, а не тишиной', () => {
  const a = podelnyjCtx(); const b = podelnyjCtx()
  apply(a, nabor('probe-golos')); apply(b, nabor('probe-golos'))
  if (!b.stroki.some((s) => s.includes('второй монтаж пропущен'))) {
    throw new Error('пропуск молчаливый — неотличим от «пакет не смонтирован»')
  }
})

proba('РАЗНЫЕ АГЕНТЫ не глушат друг друга: область стража — агент, а не процесс', () => {
  const a = podelnyjCtx(); const b = podelnyjCtx()
  apply(a, nabor('probe-agent-A')); apply(b, nabor('probe-agent-B'))
  if (b.obrabotchiki.length === 0) throw new Error('страж заглушил ДРУГОГО агента — область шире нужной')
})

proba('ГРАНИЦА НАЗВАНА ЧЕСТНО: два БЕЗЫМЯННЫХ агента схлопываются, и это цена ключа', () => {
  const a = podelnyjCtx(); const b = podelnyjCtx()
  apply(a, {}); apply(b, {})
  if (b.obrabotchiki.length !== 0) {
    throw new Error('безымянные НЕ схлопнулись — значит граница в коде описывает не то, что делает код')
  }
})

proba('ПРИЗНАК ЗАКРЫТИЯ a21: ctx БЕЗ логгера — строка пропуска всё равно выходит', () => {
  // RU: Зачем именно так. Прежде строка пропуска шла только через ctx.logger?.info?.(): без логгера `?.` давал
  //     undefined, исключения не было, catch не срабатывал, и строка не печаталась никуда и молча. В работе так
  //     и вышло: подъёмов 1 (страж отсёк два), строк «пропущен» 0. Проба держит путь наружу, а не наличие
  //     логгера.
  // EN: Why exactly this way. Previously the skip line went only through ctx.logger?.info?.(): without a logger
  //     `?.` gave undefined, there was no exception, catch did not fire, and the line was printed nowhere,
  //     silently. That is what happened in production: 1 start-up (the guard cut off two), 0 "skipped" lines.
  //     The probe holds the way out, not the presence of a logger.
  const bezLoggera = () => ({ on() {}, provide() {} })   // RU: логгера НЕТ, как у платформы · EN: NO logger, as with the platform
  const a = bezLoggera(); const b = bezLoggera()
  const pojmano = []
  const rodnoj = console.log
  console.log = (...s) => { pojmano.push(s.join(' ')) }
  try {
    apply(a, nabor('probe-bez-loggera'))
    apply(b, nabor('probe-bez-loggera'))
  } finally { console.log = rodnoj }
  if (!pojmano.some((s) => s.includes('второй монтаж пропущен'))) {
    throw new Error(`без логгера строка пропуска не вышла никуда: поймано ${pojmano.length} строк — это молчание, неотличимое от «пакет не смонтирован»`)
  }
})

proba('ПРИЗНАК ЗАКРЫТИЯ a22 (экземпляр): строка пропуска называет ИМЯ И ВЕРСИЮ', () => {
  const a = podelnyjCtx(); const b = podelnyjCtx()
  apply(a, nabor('probe-versiya-v-propuske')); apply(b, nabor('probe-versiya-v-propuske'))
  const stroka = b.stroki.find((s) => s.includes('второй монтаж пропущен'))
  if (!stroka) throw new Error('строки пропуска нет вовсе — мерить нечего')
  if (!OBRAZEC.test(stroka)) {
    throw new Error(`строка пропуска не по образцу «[имя версия]»: ${stroka.slice(0, 60)} — она невидима чужим приборам, разбирающим журнал этим образцом`)
  }
})

proba('ПРИЗНАК ЗАКРЫТИЯ a22 (КЛАСС): ВСЕ строки монтажа идут по образцу «[имя версия]»', () => {
  // RU: Эта проба важнее предыдущей. Предыдущая стережёт ОДНУ строку — ту, что чинили; однажды уже чинили
  //     экземпляр, и позже дефект родился заново в новой строке. Эта проба стережёт ЛЮБУЮ строку, вышедшую при
  //     монтаже, в том числе ещё не написанные. Знаменатель берётся из того, что вышло, и печатается: «строк N,
  //     по образцу M».
  // EN: This probe matters more than the previous one. The previous one guards ONE line — the one being fixed;
  //     an instance had already been fixed once, and later the defect was born again in a new line. This probe
  //     guards ANY line emitted during mounting, including ones not yet written. The denominator comes from
  //     what was emitted and is printed: "N lines, M matching the pattern".
  const a = podelnyjCtx(); const b = podelnyjCtx()
  const stdout = [], originalLog = console.log
  try { console.log = (...args) => stdout.push(args.join(' ')); apply(a, nabor('probe-vse-stroki')); apply(b, nabor('probe-vse-stroki')) }
  finally { console.log = originalLog }
  const vse = [...stdout, ...a.stroki, ...b.stroki]
  if (vse.length < 2) throw new Error(`строк ${vse.length} — меньше двух видов, стенд не мерит класс`)
  const ne_po = vse.filter((s) => !OBRAZEC.test(s))
  if (ne_po.length) {
    throw new Error(`строк ${vse.length}, по образцу ${vse.length - ne_po.length}, БЕЗ версии ${ne_po.length}: ${ne_po[0].slice(0, 60)}`)
  }
})

const ZHDYOM = 8
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2) }
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
