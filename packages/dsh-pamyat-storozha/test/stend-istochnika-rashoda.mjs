/**
 * RU: stend-istochnika-rashoda — называет ли строка тревоги о сжатии ИСТОЧНИК, в котором искали расход.
 *     Зачем. Однажды об ОДНОМ сжатии в журнале стояли две строки, утверждающие противоположное: пакет сводки
 *     (dsh-pamyat-kompakt) печатал «расход, токены (из ответа провайдера): всего 33801», а сторож — «расход НЕ
 *     СООБЩЁН (это не ноль)». Оба прибора честны: сторож читает usage СОБЫТИЯ ПЛАТФОРМЫ, пакет сводки — ответ
 *     провайдера, и в событие тот не попадает. Но пакет сводки источник называл, а сторож — нет; отрицание без
 *     названной области читается как утверждение о предмете и гасит поиск.
 *     Что проверяет: ПОВЕДЕНИЕ модуля, а не написание строки — события подаются настоящему apply(), текст
 *     берётся из перехваченного logger. Порча «убрать название источника» обязана ронять пробу.
 *     Граница: проба про строку, а не про величину. Верен ли расход у пакета сводки — другой вопрос, и этот
 *     стенд о нём молчит.
 *     Запуск: node test/stend-istochnika-rashoda.mjs; код 0 — все пробы прошли, 1 — есть красные.
 * EN: stend-istochnika-rashoda — does the compaction alarm line name the SOURCE in which spend was looked for.
 *     Why. Once, about ONE compaction, the log had two lines saying opposite things: the summary package
 *     (dsh-pamyat-kompakt) printed "spend, tokens (from the provider response): total 33801", and the guard
 *     "spend NOT REPORTED (this is not zero)". Both tools were honest: the guard reads the usage of the
 *     PLATFORM EVENT, the summary package reads the provider response, which never reaches the event. But the
 *     summary package named its source and the guard did not; a negation without a named scope reads as a
 *     statement about the subject and stops the search.
 *     What it checks: the module's BEHAVIOUR, not the spelling of a line — events are fed to the real apply(),
 *     the text is taken from an intercepted logger. Breaking it by "removing the source name" must fail the
 *     probe.
 *     Boundary: the probe is about the line, not the value. Whether the summary package's spend is right is
 *     another question, and this stand says nothing about it.
 *     Run: node test/stend-istochnika-rashoda.mjs; exit 0 — all probes passed, 1 — some are red.
 */
import { apply } from '../src/index.js'

let vsego = 0, bed = 0
const proba = (imya, telo) => {
  vsego += 1
  const r = telo()
  if (r === true) console.log(`✅ ${imya}`)
  else { bed += 1; console.log(`❌ ${imya}: ${r}`) }
}

/**
 * RU: progon({ usage }) — поднимает модуль подставным ctx, подаёт compaction/start, /summary и /end и отдаёт
 *     напечатанные строки.
 * EN: progon({ usage }) — mounts the module with a fake ctx, feeds compaction/start, /summary and /end and
 *     returns the printed lines.
 */
// RU: У КАЖДОГО ПРОГОНА СВОЙ agent, и это не косметика. Страж одиночного монтажа держит ключ по config.agent:
//     со вторым прогоном под тем же именем apply молча пропускается, обработчик не регистрируется, и проба
//     меряет тишину стража вместо строки тревоги. Первая редакция стенда дала на этом 1 из 5 — и «доказала» бы
//     «источник не назван» при верном коде.
//     Граница: стенд не снимает DSH_HOME; если он задан, сброс ступеней на compaction/summary запишет ключ '?'
//     в файл ступеней этого DSH_HOME.
// EN: EACH RUN HAS ITS OWN agent, and this is not cosmetic. The single-mount guard keys on config.agent: a
//     second run under the same name makes apply silently skip, the handler is not registered, and the probe
//     measures the guard's silence instead of the alarm line. The first version of the stand gave 1 of 5
//     because of this — and would have "proven" "source not named" with correct code.
//     Boundary: the stand does not unset DSH_HOME; if it is set, the stage reset on compaction/summary writes
//     the key '?' into that DSH_HOME's stage file.
let nomerProgona = 0
function progon({ usage }) {
  nomerProgona += 1
  const stroki = []
  const obrabotchiki = []
  const ctx = {
    on: (imya, f) => { if (imya === 'session/event') obrabotchiki.push(f) },
    logger: { info: (s) => stroki.push(s) },
  }
  apply(ctx, { agent: `proba-${nomerProgona}`, predel: 0, komandaStoka: '' })
  const session = {}
  const id = 'proba-' + Math.random().toString(36).slice(2)
  const t = Date.now()
  for (const f of obrabotchiki) {
    f(session, { type: 'compaction/start', time: t, data: { compactionId: id } })
    f(session, { type: 'compaction/summary', time: t, data: { compactionId: id, summary: 'x', usage } })
    f(session, { type: 'compaction/end', time: t + 1, data: { compactionId: id } })
  }
  return stroki
}

// RU: Ищем ТРЕВОГУ О СЖАТИИ, а не весь вывод. Первая редакция двух проб ниже искала слово по всему
//     напечатанному — и оставалась зелёной при порче, потому что то же слово стоит в строке сводки. Проба,
//     зелёная при обоих исходах, не стережёт ничего; поймано порчей, а не чтением.
// EN: We look for the COMPACTION ALARM, not the whole output. The first version of the two probes below
//     searched the word in everything printed — and stayed green under breakage, because the same word appears
//     in the summary line. A probe green in both outcomes guards nothing; caught by deliberate breakage, not by
//     reading.
const trevoga = (stroki) => stroki.find((x) => x.includes('сжатие ')) ?? ''

// RU: ── Контроль зрячести пробы: модуль вообще печатает тревогу о сжатии (иначе мерить нечего) ──
// EN: ── Probe sanity check: the module prints a compaction alarm at all (otherwise there is nothing to
//     measure) ──
proba('контроль зрячести: тревога о сжатии печатается (иначе мерить нечего)', () => {
  const s = progon({ usage: undefined })
  return s.some((x) => x.includes('сжатие')) || `строк ${s.length}, тревоги о сжатии нет: ${s.join(' | ')}`
})

// RU: ── Главное: при пустом usage строка НАЗЫВАЕТ ИСТОЧНИК ──
// EN: ── Main point: with empty usage the line NAMES THE SOURCE ──
proba('usage нет → строка называет ИСТОЧНИК («в событии платформы»)', () => {
  const s = trevoga(progon({ usage: undefined }))
  if (!s.includes('НЕ СООБЩЁН')) return 'нет самого «НЕ СООБЩЁН» — проба мерит не то'
  return s.includes('В СОБЫТИИ ПЛАТФОРМЫ')
    || 'отрицание БЕЗ названной области: читающий отнесёт его к предмету и не пойдёт искать строку kompakt'
})

proba('usage нет → строка называет, КТО печатает расход вызова', () => {
  const s = trevoga(progon({ usage: undefined }))
  return s.includes('kompakt')
    || 'источник назван, а адрес, по которому величина ЕСТЬ, — нет: поиск всё равно погаснет'
})

// RU: ── Различение: при живом usage оговорки об источнике быть НЕ должно, печатается число ──
// EN: ── Discrimination: with live usage there must be NO source caveat; a number is printed ──
proba('usage есть → печатается число, а оговорки об источнике НЕТ', () => {
  const s = trevoga(progon({ usage: { inputTokens: 10, outputTokens: 5 } }))
  if (s.includes('НЕ СООБЩЁН')) return 'при живом usage напечатано «НЕ СООБЩЁН» — расход потерян'
  return s.includes('расход 15 ток.')
    || `ожидалось «расход 15 ток.», вышло: ${s.split('\n').find((x) => x.includes('сжатие')) ?? s}`
})

// RU: ── Сводка: счётчик «без расхода» тоже называет источник ──
// EN: ── Summary: the "without spend" counter names the source too ──
proba('сводка: «без расхода» названо С ИСТОЧНИКОМ, а не голым числом', () => {
  const s = progon({ usage: undefined }).join('\n')
  if (!s.includes('без расхода')) return 'строки сводки со счётом нет — проба мерит не то'
  return s.includes('без расхода в событии платформы')
    || 'счётчик в сводке отрицает без области — та же беда, что в тревоге, только в итоге'
})

console.log(`ИТОГ: ${vsego - bed} из ${vsego}`)
process.exit(bed ? 1 : 0)
