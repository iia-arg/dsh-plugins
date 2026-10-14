// RU: Проверяем отказ записи сводки: текст сохраняется, дистилляция продолжается, журнал различает успех и отказ.
// EN: Test rejection of a summary write: preserve the text, continue distillation, and distinguish success from rejection in the journal.
import { apply, sozdatZapisatel } from '../src/index.js'
import { existsSync, readFileSync, rmSync, readdirSync, mkdirSync, chmodSync, statSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const v = telo()
  if (v === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${v}`) }
}

let restore_console = () => {}
// RU: Создаём отдельный mkdtemp и убираем при выходе. Фиксированный путь с pid может пережить прогон, достаться чужой учётке и дать EACCES вместо проверки предмета.
// EN: Create a separate mkdtemp and clean it on exit. A fixed pid-based path can survive a run, belong to another account, and produce EACCES instead of testing the subject.
const KAT = mkdtempSync(join(tmpdir(), '.proba-otklonennyh-'))
process.on('exit', () => rmSync(KAT, { recursive: true, force: true }))
// RU: SIGTERM и SIGINT ведём в штатный выход, чтобы exit-хук убрал временное при timeout 120. SIGKILL не перехватывается.
// EN: Route SIGTERM and SIGINT through normal exit so the exit hook cleans temporary files under timeout 120. SIGKILL cannot be intercepted.
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
function stend({ zapisatBrosaet, put = KAT, reshit = null, zapishet = null }) {
  // RU: Перехватываем console.error, куда пишет krik; подставной ctx.logger не видит этот поток.
  // EN: Capture console.error, the stream used by krik; a fake ctx.logger does not observe it.
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
    // RU: Подставляем экспортированный ядром reshit, чтобы проверять внешний договор, а не копию списка классов секретаря.
    // EN: Supply the core’s exported reshit to test the external contract rather than a copied secretary class list.
    ...(reshit ? { reshit } : {}),
    ...(zapishet ? { zapishet } : {}),   /* RU: Рабочий путь спрашивает, запишется ли класс.
 * EN: The working path asks whether the class can be written.
 */
  }
  const ctx = {
    pamyat,
    logger: { info: (s) => stroki.push(s), warn: (s) => stroki.push(s) },
    on: (imya, fn) => { if (imya === 'session/event') slush.push(fn); return () => {} },
    // RU: Регистрация /svodka-prinyat использует ctx.plugin; здесь он no-op, поскольку команда не является предметом пробы.
    // EN: Registering /svodka-prinyat uses ctx.plugin; it is a no-op here because the command is outside this probe’s subject.
    plugin: () => {},
  }
  // RU: Вызов дистилляции определяем по строке: модуль в этом стенде не подменяется.
  // EN: Detect the distillation call by its line; this suite does not replace the module.
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

// RU: Спасённая сводка должна иметь шапку с классом и источником, чтобы её можно было вернуть без угадывания. Одного непустого файла недостаточно.
// EN: A saved summary must include class and source metadata so it can be restored without guessing. A nonempty file alone is insufficient.
proba('🔴 отклонённая СВОДКА сохранена С ШАПКОЙ: класс, источник, причина', () => {
  rmSync(KAT, { recursive: true, force: true })
  const t = stend({ zapisatBrosaet: true })
  t.podat()
  t.konec()
  const fajly = existsSync(KAT) ? readdirSync(KAT).filter((f) => f.startsWith('svodka-')) : []
  if (fajly.length !== 1) return `файлов сводки ${fajly.length}, ждали 1`
  const soderzhimoe = readFileSync(`${KAT}/${fajly[0]}`, 'utf8')
  if (!soderzhimoe.startsWith('# ── СПАСЁННЫЙ ТЕКСТ, СВЕДЕНИЯ ДЛЯ ВОЗВРАТА В ПАМЯТЬ ──\n'))
    return 'файл сводки не начинается шапкой — текст не вернуть в память'
  if (!soderzhimoe.includes('# ── конец сведений, ниже исходный текст ──')) return 'шапка без закрывающей строки'
  if (!soderzhimoe.includes('сводка: обсуждали форму пароля')) return 'текста сводки нет в файле'
  if (!soderzhimoe.includes('# класс: svodka-kompakcii')) return 'класс сводки в шапке не тот или не назван'
  if (/# источник: НЕ НАЗВАНО/.test(soderzhimoe) || !/# источник: \S+/.test(soderzhimoe))
    return 'источник в шапке НЕ НАЗВАН, хотя известен из события (seqs)'
  if (!/# причина отказа: .+/.test(soderzhimoe)) return 'шапка не называет причину отказа'
  if (!soderzhimoe.includes('# агент: в записи НЕ ХРАНИТСЯ')) return 'шапка не говорит, где искать агента'
  return true
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
  // RU: Диагностика должна назвать ключ настройки: сообщение о потере текста без ключа не указывает лечение.
  // EN: Diagnostics must name the setting key: a text-loss message without it does not identify the remedy.
  return (s.includes('НЕ СОХРАНЕНА') && s.includes('putOtklonennyh')
          && s.includes('Дистилляция продолжается'))
    || `строки: ${s.slice(0, 300)}`
})

// RU: Проверяем права каталога фактическим состоянием.
// EN: Test directory permissions through actual state.
proba('🔴 существующий широкий каталог СУЖАЕТСЯ до владельца', () => {
  rmSync(KAT, { recursive: true, force: true })
  mkdirSync(KAT, { recursive: true })
  chmodSync(KAT, 0o755)                       /* RU: Имитируем ранее созданный каталог.
 * EN: Simulate a preexisting directory.
 */
  if ((statSync(KAT).mode & 0o777) !== 0o755) return 'порча не внесена: права не 755'
  const t = stend({ zapisatBrosaet: true })
  t.podat()
  t.konec()
  const prava = statSync(KAT).mode & 0o777
  if (prava & 0o077) return `каталог остался открыт шире владельца: ${prava.toString(8)}`
  return readdirSync(KAT).some((f) => f.startsWith('svodka-')) || 'текст не сохранён'
})

// RU: Знание дистилляции сохраняется при отказе так же, как сводка.
// EN: Rejected distilled knowledge is saved like a summary.
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
  // RU: Спасённое знание содержит текст и шапку: класс, агент, источник, время и причина. Сверяем вхождение текста и сведения отдельно; точное равенство запретило бы шапку.
  // EN: Saved knowledge contains text and metadata: class, agent, source, time, and reason. Check text inclusion and metadata separately; exact equality would forbid the header.
  const soderzhimoe = readFileSync(`${KAT}/${fajly[0]}`, 'utf8')
  if (!soderzhimoe.includes('статья о пароле')) return 'текста нет в файле'
  if (!soderzhimoe.includes('# класс:')) return 'нет шапки со сведениями — текст не вернуть в память'
  if (!soderzhimoe.includes('# источник:')) return 'шапка без источника'
  if (!/# причина отказа: .+/.test(soderzhimoe)) return 'шапка не называет причину отказа'
  // RU: Проверяем значения сведений, а не только строки шапки: null для класса и источника оставит НЕ НАЗВАНО и не позволит восстановить запись.
  // EN: Check metadata values, not only header lines: null class and source leave НЕ НАЗВАНО and prevent record restoration.
  if (/# класс: НЕ НАЗВАНО/.test(soderzhimoe)) return 'класс в шапке НЕ НАЗВАН, хотя известен при записи'
  // RU: Имени агента в записываемом объекте нет: ядро берёт его из своей настройки. Шапка указывает, где искать имя, вместо требования недоступного значения.
  // EN: The write object has no agent name: the core obtains it from its configuration. The header explains where to find it rather than requiring an unavailable value.
  if (!soderzhimoe.includes('# агент: в записи НЕ ХРАНИТСЯ')) return 'шапка не говорит, где искать агента'
  return stroki.join(' | ').includes('знание дистилляции ОТКЛОНЕНО')
    || `отказ не назван вслух: ${stroki.join(' | ').slice(0, 200)}`
})

proba('контроль: знание записалось — файла нет, отказа нет', () => {
  rmSync(KAT, { recursive: true, force: true })
  const zapisatel = sozdatZapisatel({ zapisat: () => ({ id: 1 }) }, { putOtklonennyh: KAT }, () => {})
  zapisatel({ klass: 'znanie', soderzhim: 'обычная статья' })
  return !existsSync(KAT) || 'каталог отклонённых создан там, где отказа не было'
})

// RU: Передача спасателя в дистилляцию проверяется чтением исходника; это признак полноты, а не проверка живого вызова. ESM-модуль здесь не подменяется.
// EN: Saving-handler forwarding into distillation is checked through source inspection; this is a completeness indicator, not a live-call test. The ESM module is not replaced here.
proba('спасатель ПЕРЕДАН в дистилляцию (признак по исходнику)', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  return /zapisat:\s*sozdatZapisatel\(/.test(src)
    || 'в вызове distillirovat стоит не sozdatZapisatel — знание снова теряется молча'
})

rmSync(KAT, { recursive: true, force: true })
// RU: Различаем три причины молчания сверки классов: нет отвергаемых классов, ядро не отдаёт reshit, сверка упала. Иначе недоступность прибора будет выглядеть разрешённым списком.
// EN: Distinguish three reasons for class-check silence: no rejected classes, the core lacks reshit, or checking failed. Otherwise detector absence looks like an allowed list.
proba('сверка классов: ядро отклоняет один из наших → НАЗВАН поимённо', () => {
  const t = stend({ zapisatBrosaet: false, reshit: (k) =>
    ({ reshenie: k === 'ogranichenie' ? 'ask' : 'auto' }) })
  t.konec()
  const stroka = t.stroki.find((x) => x.includes('заведомо ОТКЛОНИТ'))
  if (!stroka) return 'расхождение не названо: ' + t.stroki.join(' | ').slice(0, 160)
  if (!stroka.includes('ogranichenie')) return 'класс не назван поимённо: ' + stroka
  // RU: Строка подъёма называет полный список; сужение происходит позже в дистилляции. Диагностика должна объяснить этот порядок, чтобы не утверждать отсутствие лечения.
  // EN: The startup line reports the full list; distillation narrows it later. Diagnostics must explain this order rather than imply that no remedy exists.
  if (!stroka.includes('СУЖАЕТСЯ')) return 'крик не говорит, что при дистилляции список сужается: ' + stroka
  return true
})

proba('ПАРА: ядро не отклоняет ничего → сказано, что сверено, а не тишина', () => {
  const t = stend({ zapisatBrosaet: false, reshit: () => ({ reshenie: 'auto' }) })
  t.konec()
  if (t.stroki.some((x) => x.includes('заведомо ОТКЛОНИТ'))) {
    return 'ложная тревога: ядро ничего не отклоняет, а строка есть'
  }
  if (!t.stroki.some((x) => x.includes('сверены с ядром'))) {
    return 'молчание вместо «сверено»: не отличить от «не проверяли»'
  }
  return true
})

// RU: Сверка должна задавать рабочий вопрос «запишет ли»: reshit=ask без отвечающего не означает отказ записи.
// EN: Checking must ask the working-path question “can it be written”: reshit=ask without a confirmer does not imply write rejection.
proba('integration-note: reshit «ask», но zapishet «запишет» → крика НЕТ, «сверены» по «запишет ли»', () => {
  const vyzovy = []
  const t = stend({ zapisatBrosaet: false, reshit: (k) => ({ reshenie: k === 'ogranichenie' ? 'ask' : 'auto' }),
                    zapishet: (k, o) => { vyzovy.push([k, o]); return true } })
  t.konec()
  if (t.stroki.some((x) => x.includes('заведомо ОТКЛОНИТ'))) return 'ложный крик вернулся: ' + t.stroki.find((x) => x.includes('ОТКЛОНИТ')).slice(0, 120)
  const s = t.stroki.find((x) => x.includes('сверены с ядром'))
  if (!s || !s.includes('запишет ли')) return 'нет «сверены … запишет ли»: ' + (s ?? t.stroki.join(' | ').slice(0, 160))
  if (!vyzovy.length || !vyzovy.every(([, o]) => o?.otvechayushchegoNetVVyzove === true)) return 'zapishet спрошен не с признаком рабочего пути: ' + JSON.stringify(vyzovy.slice(0, 2))
  return true
})
proba('integration-note: zapishet отказывает ogranichenie → НАЗВАН поимённо, «по „запишет ли“»', () => {
  const t = stend({ zapisatBrosaet: false, reshit: () => ({ reshenie: 'auto' }), zapishet: (k) => k !== 'ogranichenie' })
  t.konec()
  const s = t.stroki.find((x) => x.includes('заведомо ОТКЛОНИТ'))
  if (!s || !s.includes('ogranichenie') || !s.includes('запишет ли')) return 'не назван или не по «запишет ли»: ' + (s ?? '—')
  return true
})

proba('ядро НЕ отдаёт reshit → СЛЕПОТА словами, а не молчание', () => {
  const t = stend({ zapisatBrosaet: false })          /* RU: Не предоставляем reshit.
 * EN: Do not provide reshit.
 */
  t.konec()
  if (!t.stroki.some((x) => x.includes('НЕ ПРОВЕРЕНА'))) {
    return 'слепота не названа — «нет расхождений» неотличимо от «не смотрели»'
  }
  return true
})

// RU: Парно проверяем явный успех записи и отсутствие строки успеха при отказе. Иначе журнал не различит молчание подписчика и состоявшуюся запись или заявит несуществующую запись.
// EN: Test explicit write success and absence of a success line on rejection in pairs. Otherwise the journal cannot distinguish a silent subscriber from a completed write or claims a nonexistent write.
proba('a25 успешная запись сводки НАЗЫВАЕТ себя в журнале', () => {
  const t = stend({ zapisatBrosaet: false })
  t.podat(); t.konec()
  const stroka = t.stroki.find((x) => x.includes('ЗАПИСАНА в память'))
  if (!stroka) return 'молчание при успехе: ' + t.stroki.join(' | ').slice(0, 160)
  if (!/знаков \d+/.test(stroka)) return 'в строке нет числа знаков: ' + stroka
  return true
})

proba('ПАРА: при ОТКАЗЕ строки успеха НЕТ — журнал не утверждает несделанного', () => {
  const t = stend({ zapisatBrosaet: true })
  t.podat(); t.konec()
  if (t.stroki.some((x) => x.includes('ЗАПИСАНА в память'))) {
    return 'журнал говорит «записана» при отказе записи'
  }
  if (!t.stroki.some((x) => x.includes('ОТКЛОНЕНА'))) return 'отказ вообще не назван'
  return true
})

console.log(`\nитог: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
