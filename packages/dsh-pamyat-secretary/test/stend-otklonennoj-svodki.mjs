/** Проба долга 114: отказ записи не теряет сводку и не обрывает дистилляцию. */
import { apply, sozdatZapisatel } from '../src/index.js'
import { existsSync, readFileSync, rmSync, readdirSync, mkdirSync, chmodSync, statSync } from 'node:fs'

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const v = telo()
  if (v === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${v}`) }
}

let restore_console = () => {}
const KAT = '/tmp/.proba-otklonennyh-' + process.pid
function stend({ zapisatBrosaet, put = KAT }) {
  // 🔴 ПЕРЕХВАТ ТУДА, КУДА ПИШЕТ ПРЕДМЕТ. Первая редакция ловила строки через
  // подставной ctx.logger — а krik пакета пишет в console.error. Проба молчала при
  // работающей правке: признак был про мою догадку об устройстве, а не про предмет.
  const stroki = []
  const bylo = console.error
  console.error = (...a) => stroki.push(a.join(' '))
  restore_console = () => { console.error = bylo }
  const slush = []
  let distillyaciyaZvalas = false
  const pamyat = {
    zapisat: (z) => {
      if (zapisatBrosaet) throw new Error('в тексте найден секрет (obyavlennyj), запись отклонена')
      return { id: 1 }
    },
  }
  const ctx = {
    pamyat,
    logger: { info: (s) => stroki.push(s), warn: (s) => stroki.push(s) },
    on: (imya, fn) => { if (imya === 'session/event') slush.push(fn); return () => {} },
  }
  // дистилляция помечается вызовом: подменяем модуль нельзя, поэтому следим за строкой
  apply(ctx, {
    klass: 'svodka-kompakcii', distillyaciya: false,
    putOtklonennyh: put,
  })
  const podat = () => slush.forEach((f) => f({ id: 's1' },
    { type: 'compaction/summary', data: { shadowedTokenCount: 1, model: 'm', shadowedSeqs: [1,2,3], shadowedRange: { start: 1, end: 3 },
      summary: [{ type: "text", text: "сводка: обсуждали форму пароля" }] } }))
  return { stroki, podat, konec: () => restore_console() }
}

proba('контроль: обычная запись проходит, файла отклонённых нет', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: false })
  t.podat()
  t.konec()
  return !existsSync(KAT) || 'каталог отклонённых создан там, где отказа не было'
})

proba('🔴 отказ записи → текст СОХРАНЁН вне памяти', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: true })
  t.podat()
  t.konec()
  if (!existsSync(KAT)) return 'каталог отклонённых не создан — текст потерян'
  const f = readdirSync(KAT)
  if (f.length !== 1) return `файлов ${f.length}, ожидался 1`
  const soderzh = readFileSync(`${KAT}/${f[0]}`, 'utf8')
  return soderzh.length > 0 || 'файл пуст — сохранено ничто'
})

proba('🔴 отказ НАЗВАН и путь напечатан', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: true })
  t.podat()
  t.konec()
  const s = t.stroki.join(' | ')
  return (s.includes('ОТКЛОНЕНА') && s.includes(KAT) && s.includes('Дистилляция ПРОДОЛЖАЕТСЯ'))
    || `строки: ${s.slice(0, 200)}`
})

proba('обработчик НЕ бросает наружу — событие компакта не рушится', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: true })
  try { t.podat(); } catch (e) { t.konec(); return `бросило наружу: ${e.message}` }
  t.konec()
  const s = t.stroki.join(' | ')
  return !s.includes('не смог обработать событие компакции')
    || 'ушло в общий catch — значит правка не перехватила'
})

proba('🔴 ключ НЕ задан → текст не сохранён, и это НАЗВАНО с именем ключа', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: true, put: '' })
  t.podat()
  t.konec()
  if (existsSync(KAT)) return 'каталог создан при пустом ключе — умолчание всё-таки есть'
  const s = t.stroki.join(' | ')
  // Требуем ИМЯ КЛЮЧА в строке: без него читающий узнает, что текст потерян,
  // но не узнает, чем это лечится, — и лечить будет фильтр.
  return (s.includes('НЕ СОХРАНЕНА') && s.includes('putOtklonennyh')
          && s.includes('Дистилляция продолжается'))
    || `строки: ${s.slice(0, 300)}`
})

// ─── п.114: права каталога проверяются ФАКТОМ ────────────────────────────────
proba('🔴 существующий широкий каталог СУЖАЕТСЯ до владельца', () => {
  rmSync(KAT, { recursive: true, force: true })
  mkdirSync(KAT, { recursive: true })
  chmodSync(KAT, 0o755)                       // как будто каталог завёл кто-то раньше
  if ((statSync(KAT).mode & 0o777) !== 0o755) return 'порча не внесена: права не 755'
  const t = stend({ zapisatBrosaet: true })
  t.podat()
  t.konec()
  const prava = statSync(KAT).mode & 0o777
  if (prava & 0o077) return `каталог остался открыт шире владельца: ${prava.toString(8)}`
  return readdirSync(KAT).some((f) => f.startsWith('svodka-')) || 'текст не сохранён'
})

// ─── п.113: знание дистилляции спасается так же, как сводка ──────────────────
proba('🔴 знание дистилляции отклонено → текст СОХРАНЁН, отказ ПРОБРОШЕН', () => {
  rmSync(KAT, { recursive: true, force: true })
  const stroki = []
  const zapisatel = sozdatZapisatel(
    { zapisat: () => { throw new Error('в тексте найден секрет (obyavlennyj)') } },
    { putOtklonennyh: KAT },
    (x) => stroki.push(x),
  )
  let brosilo = false
  try { zapisatel({ klass: 'znanie', soderzhim: 'статья о пароле' }) }
  catch { brosilo = true }
  if (!brosilo) return 'отказ проглочен: заход посчитал бы статью записанной'
  const fajly = readdirSync(KAT).filter((f) => f.startsWith('znanie-'))
  if (fajly.length !== 1) return `файлов знания ${fajly.length}, ждали 1`
  if (readFileSync(`${KAT}/${fajly[0]}`, 'utf8') !== 'статья о пароле') return 'текст не тот'
  return stroki.join(' | ').includes('знание дистилляции ОТКЛОНЕНО')
    || `отказ не назван вслух: ${stroki.join(' | ').slice(0, 200)}`
})

proba('контроль: знание записалось — файла нет, отказа нет', () => {
  rmSync(KAT, { recursive: true, force: true })
  const zapisatel = sozdatZapisatel({ zapisat: () => ({ id: 1 }) }, { putOtklonennyh: KAT }, () => {})
  zapisatel({ klass: 'znanie', soderzhim: 'обычная статья' })
  return !existsSync(KAT) || 'каталог отклонённых создан там, где отказа не было'
})

// ⚠️ ПРИЗНАК ПОЛНОТЫ, НЕ ДОКАЗАТЕЛЬСТВО. Что спасатель действительно передан в
// дистилляцию, проверяется чтением исходника: подменить модуль distill-shov в ESM
// нечем, а живой заход дистилляции ходит к провайдеру и в стенде недостижим.
proba('спасатель ПЕРЕДАН в дистилляцию (признак по исходнику)', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  return /zapisat:\s*sozdatZapisatel\(/.test(src)
    || 'в вызове distillirovat стоит не sozdatZapisatel — знание снова теряется молча'
})

rmSync(KAT, { recursive: true, force: true })
console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
