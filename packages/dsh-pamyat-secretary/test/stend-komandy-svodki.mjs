// RU: Проверяем /svodka-prinyat через настоящий parseCommand из dsh-commands, заданного DSH_TEST_APP. Аргументы берутся из rawInput, как в платформе, а не из args/text. Без платформы проверка слепа с кодом 2.
// EN: Test /svodka-prinyat through the real parseCommand from dsh-commands selected by DSH_TEST_APP. Read arguments from rawInput as the platform does, not args/text. Without the platform, the test is unobservable with code 2.
import { apply } from '../src/index.js'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const APP = process.env.DSH_TEST_APP
const KOM = APP && join(APP, 'node_modules/@deepseek-ai/dsh-commands/lib')
if (!KOM || !existsSync(join(KOM, 'index.js'))) {
  console.log('СЛЕПОТА: нет платформы (DSH_TEST_APP) — разбор команды взять неоткуда, проверять нечем'); process.exit(2)
}
const { parseCommand } = await import(join(KOM, 'index.js'))
// RU: Ответ обработчика проверяет настоящий normalizeResult, извлечённый из файла платформы, поскольку он не экспортируется. Неверный kind может дать отказ после записи сводки. Если функцию нельзя извлечь, проверка слепа.
// EN: Check handler results with the real normalizeResult extracted from platform source because it is not exported. An invalid kind can fail after the summary is stored. If extraction is impossible, the test is unobservable.
const srcKom = readFileSync(join(KOM, 'index.js'), 'utf8')
const mNorm = /function normalizeResult\(command, value\) \{[\s\S]*?\n\}\n/.exec(srcKom)
if (!mNorm) { console.log('СЛЕПОТА: в dsh-commands нет normalizeResult — договор результата сменился, сверить обработчик'); process.exit(2) }
const normalizeResult = new Function(mNorm[0] + '; return normalizeResult')()
const priznat = (r) => normalizeResult('svodka-prinyat', r)

let ok = 0, vsego = 0
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya) } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message) } }
const kat = vremennyj(join(tmpdir(), 'stend-komandy-svodki-'))

function podnyat({ otklonit = false } = {}) {
  const stroki = []; const zapisi = []; let komanda = null
  const bylo = console.error; console.error = (...a) => stroki.push(a.join(' '))
  const ctx = {
    pamyat: { zapisat: (z) => { if (otklonit) throw new Error('PAMYAT_SEKRET: проба отказа фильтра'); zapisi.push(z); return 100 + zapisi.length },
              poIstochniku: (ist) => zapisi.filter((z) => z.istochnik === ist).map((z, i) => ({ id: 101 + i, klass: z.klass, istochnik: z.istochnik })) },
    logger: { info: (s) => stroki.push(s), warn: (s) => stroki.push(s) },
    on: () => () => {},
    plugin: (fn) => fn({ get: (imya) => imya === 'commands' ? { register: (d) => { komanda = d } } : undefined }),
  }
  apply(ctx, { klass: 'svodka-kompakcii', distillyaciya: false, putOtklonennyh: otkl })
  // RU: Вызов имеет форму платформы: { commandId, agent, rawInput, attachments, signal }.
  // EN: Use the platform invocation shape: { commandId, agent, rawInput, attachments, signal }.
  const pozvat = (stroka) => komanda.handler(Object.freeze({ commandId: 'cmd-proba-1', agent: { session: { id: 'sess-proba' } },
    rawInput: parseCommand(stroka).rawInput, attachments: [], signal: new AbortController().signal }))
  return { stroki, zapisi, pozvat, get komanda() { return komanda }, konec: () => { console.error = bylo } }
}

// RU: Команда читает только файлы внутри putOtklonennyh (аудит A-N-1948 №6): рабочие файлы стенда лежат там, чужой — снаружи.
// EN: The command reads only files inside putOtklonennyh (audit A-N-1948 #6): the stand's working files live there, a foreign one outside.
const otkl = join(kat, 'otkl'); mkdirSync(otkl)
const fajl = join(otkl, 'svodka.txt'); writeFileSync(fajl, '[MODE=ACTIVE]\nсводка для проверки второго входа\n')
const pustoj = join(otkl, 'pusto.txt'); writeFileSync(pustoj, '   \n')
const chuzhoj = join(kat, 'chuzhoj-sekret.txt'); writeFileSync(chuzhoj, 'ЧУЖОЙ ФАЙЛ: не для памяти\n')

await proba('1 путь после имени команды → записана; ответ ПРИЗНАН платформой как success «записана (id …)»; источник komanda:<путь>#sha256:<16>', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + fajl); t.konec()
  if (!t.komanda) throw new Error('команда не зарегистрирована')
  const n = priznat(r)
  if (n.kind !== 'success' || !/записана в память \(id 101/.test(n.text ?? '')) throw new Error('ответ ' + JSON.stringify(n))
  if (t.zapisi.length !== 1 || t.zapisi[0].soderzhim !== readFileSync(fajl, 'utf8').trim()) throw new Error('записей ' + t.zapisi.length + ', текст ' + JSON.stringify(t.zapisi[0]?.soderzhim).slice(0, 60))
  if (!/^komanda:.+#sha256:[0-9a-f]{16}$/.test(t.zapisi[0].istochnik) || !t.zapisi[0].istochnik.includes(fajl)) throw new Error('источник ' + t.zapisi[0].istochnik)
  if (!t.stroki.some((s) => s.includes('ЗАПИСАНА'))) throw new Error('строки «ЗАПИСАНА» нет')
})
await proba('6 integration-note ПОВТОР той же сводки → второй записи нет, ответ success «уже записана (id 101)», строка журнала', async () => {
  const t = podnyat(); await t.pozvat('/svodka-prinyat ' + fajl); const r2 = await t.pozvat('/svodka-prinyat ' + fajl); t.konec()
  const n = priznat(r2)
  if (t.zapisi.length !== 1) throw new Error('записей ' + t.zapisi.length + ' — повтор записан')
  if (n.kind !== 'success' || !/уже записана \(id 101\)/.test(n.text ?? '')) throw new Error('ответ ' + JSON.stringify(n))
  if (!t.stroki.some((s) => s.includes('УЖЕ ЗАПИСАНА (id 101'))) throw new Error('строки «УЖЕ ЗАПИСАНА» нет')
})
await proba('7 integration-note ПРАВЛЕНЫЙ файл по тому же пути → новая сводка записывается (сумма текста в источнике)', async () => {
  const f2 = join(otkl, 'svodka-pravka.txt'); writeFileSync(f2, 'текст один\n')
  const t = podnyat(); await t.pozvat('/svodka-prinyat ' + f2); writeFileSync(f2, 'текст два\n'); await t.pozvat('/svodka-prinyat ' + f2); t.konec()
  if (t.zapisi.length !== 2) throw new Error('записей ' + t.zapisi.length)
})
await proba('8 integration-note ПОДПИСЬ — отправитель по платформе («от пользователя … commandId cmd-proba-1»), не «рука исполнитель»', async () => {
  const t = podnyat(); await t.pozvat('/svodka-prinyat ' + fajl); t.konec()
  const s = t.stroki.find((x) => x.includes('ЗАПИСАНА')) ?? ''
  if (!s.includes('от пользователя') || !s.includes('commandId cmd-proba-1')) throw new Error('подпись: ' + s.slice(0, 200))
  if (t.stroki.some((x) => x.includes('рука исполнитель'))) throw new Error('в журнале «рука исполнитель»')
})
await proba('9 integration-note ОТКЛОНЕНА фильтром → ответ error, признан платформой, называет отказ и файл вне памяти', async () => {
  const t = podnyat({ otklonit: true }); const r = await t.pozvat('/svodka-prinyat ' + fajl); t.konec()
  const n = priznat(r)
  if (n.kind !== 'error' || !/ОТКЛОНЕНА фильтром/.test(n.text) || !/сохранён вне памяти/.test(n.text)) throw new Error('ответ ' + JSON.stringify(n))
})
await proba('2 путь не задан → error, и строка журнала «ОТКАЗ — Путь не задан»', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat'); t.konec()
  if (priznat(r).kind !== 'error' || t.zapisi.length) throw new Error(JSON.stringify(r))
  if (!t.stroki.some((s) => s.includes('/svodka-prinyat: ОТКАЗ — Путь не задан'))) throw new Error('немой отказ')
})
await proba('3 файла нет → error, строка «ОТКАЗ — Файл не прочитан (ENOENT…)»', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + join(otkl, 'netu.txt')); t.konec()
  if (r?.kind !== 'error' || t.zapisi.length) throw new Error(JSON.stringify(r))
  if (!t.stroki.some((s) => s.includes('ОТКАЗ — Файл не прочитан') && s.includes('ENOENT'))) throw new Error('немой отказ')
})
await proba('4 файл пуст → error, строка «ОТКАЗ — Файл пуст»', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + pustoj); t.konec()
  if (r?.kind !== 'error' || t.zapisi.length) throw new Error(JSON.stringify(r))
  if (!t.stroki.some((s) => s.includes('ОТКАЗ — Файл пуст'))) throw new Error('немой отказ')
})
await proba('5 договор с платформой: тип CommandInvocation объявляет rawInput (не args/text)', async () => {
  const d = readFileSync(join(KOM, 'types/index.d.ts'), 'utf8')
  if (!/readonly rawInput: string;/.test(d)) throw new Error('в типе платформы нет rawInput — договор сменился, сверить обработчик')
})

await proba('10 файл ВНЕ putOtklonennyh → error «вне каталога», файл не прочитан и не записан', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + chuzhoj); t.konec()
  if (priznat(r).kind !== 'error' || t.zapisi.length) throw new Error('ответ ' + JSON.stringify(r) + ', записей ' + t.zapisi.length)
  if (!t.stroki.some((s) => s.includes('ОТКАЗ') && s.includes('вне каталога'))) throw new Error('немой отказ')
  if (t.stroki.some((s) => s.includes('ЧУЖОЙ ФАЙЛ'))) throw new Error('содержимое чужого файла попало в журнал')
})
await proba('11 ССЫЛКА внутри каталога на файл снаружи → error «вне каталога» (ссылка развёрнута до сверки)', async () => {
  const ssylka = join(otkl, 'ssylka-naruzhu.txt'); symlinkSync(chuzhoj, ssylka)
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + ssylka); t.konec()
  if (priznat(r).kind !== 'error' || t.zapisi.length) throw new Error('ответ ' + JSON.stringify(r) + ', записей ' + t.zapisi.length)
  if (!t.stroki.some((s) => s.includes('вне каталога'))) throw new Error('немой отказ')
})
await proba('12 имя БЕЗ пути ищется в putOtklonennyh → записана', async () => {
  writeFileSync(join(otkl, 'po-imeni.txt'), 'сводка по имени файла\n')
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat po-imeni.txt'); t.konec()
  if (priznat(r).kind !== 'success' || t.zapisi.length !== 1) throw new Error('ответ ' + JSON.stringify(r) + ', записей ' + t.zapisi.length)
})

// RU: 13–14 — условие ворот Вениамина (10.10 13:56Z): порча «без разделителя» (startsWith(kornevoj + RAZDELITEL) →
//     startsWith(kornevoj)) оставляла стенд зелёным. 13 — сосед по ПРЕФИКСУ имени каталога (…/otkl-zlo при …/otkl):
//     при порче он принимается — краснеет ровно 13. 14 — «../» без абсолютного пути: склейка с каталогом и разворот
//     уводят наружу — отказ (порчу разделителя 14 не ловит: путь наружу не начинается с имени каталога).
// EN: 13–14 — Veniamin's gate condition (10.10 13:56Z): the "no separator" corruption (startsWith(kornevoj + RAZDELITEL) →
//     startsWith(kornevoj)) left the stand green. 13 — a sibling by the directory name PREFIX (…/otkl-zlo next to …/otkl):
//     accepted under the corruption — exactly 13 goes red. 14 — "../" without an absolute path: joining with the directory
//     and resolving lead outside — refusal (14 does not catch the separator corruption: the outside path does not start
//     with the directory name).
await proba('13 СОСЕД ПО ПРЕФИКСУ (…/otkl-zlo/x при putOtklonennyh=…/otkl) → error «вне каталога», не прочитан, не записан', async () => {
  const sosed = join(kat, 'otkl-zlo'); mkdirSync(sosed); const x = join(sosed, 'x'); writeFileSync(x, 'ЧУЖОЙ СОСЕД: не для памяти\n')
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ' + x); t.konec()
  if (priznat(r).kind !== 'error' || t.zapisi.length) throw new Error('ответ ' + JSON.stringify(r) + ', записей ' + t.zapisi.length)
  if (!t.stroki.some((s) => s.includes('вне каталога'))) throw new Error('немой отказ')
  if (t.stroki.some((s) => s.includes('ЧУЖОЙ СОСЕД'))) throw new Error('содержимое соседнего файла попало в журнал')
})
await proba('14 «../chuzhoj-sekret.txt» БЕЗ абсолютного пути → error «вне каталога», не прочитан, не записан', async () => {
  const t = podnyat(); const r = await t.pozvat('/svodka-prinyat ../chuzhoj-sekret.txt'); t.konec()
  if (priznat(r).kind !== 'error' || t.zapisi.length) throw new Error('ответ ' + JSON.stringify(r) + ', записей ' + t.zapisi.length)
  if (!t.stroki.some((s) => s.includes('вне каталога'))) throw new Error('немой отказ')
  if (t.stroki.some((s) => s.includes('ЧУЖОЙ ФАЙЛ'))) throw new Error('содержимое чужого файла попало в журнал')
})

rmSync(kat, { recursive: true, force: true })
console.log(`стенд команды /svodka-prinyat: ${ok} из ${vsego}`)
process.exit(ok === vsego ? 0 : 1)
