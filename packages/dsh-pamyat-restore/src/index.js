// RU: dsh-pamyat-restore добавляет восстановление после компакта (B) и welcome-брифинг (C) только через agent/pre-step штатным сообщением платформы. Он дополняет контекст, не принимает решения хода. Реальный источник — необязательная служба pamyat.prochitat; её строки переводятся в {soderzhim,vid,kogda,vera,avtor} и поля доверия. Нет службы или годного массива — явный отказ чтения без выдуманной заглушки. Сессии с префиксом telegram-v2- не получают глобальный welcome и перенос чужой сводки после /new; собственная поверхность сжатия сохраняется.
// EN: dsh-pamyat-restore supplies post-compaction restoration (B) and welcome briefings (C) only through agent/pre-step using a standard platform message. It adds context rather than deciding the turn. The actual source is the optional pamyat.prochitat service; its rows become {soderzhim,vid,kogda,vera,avtor} and trust fields. A missing service or invalid array explicitly fails reading without fabricated fallback records. Sessions prefixed telegram-v2- receive neither global welcome nor an imported unrelated summary after /new; their own compacted surface remains.

import z from '@deepseek-ai/schemastery'
// RU: createUserMessage собирает полный договор сообщения, включая id, вместо самодельного литерала. Это нужно для записи и последующей загрузки сессии. Подэкспорт dsh-llm/message избегает загрузки корня пакета с дополнительным экземпляром cordis.
// EN: createUserMessage builds the full message contract, including id, instead of a hand-built literal. This is required for persistence and later session loading. The dsh-llm/message subexport avoids loading the package root with an extra cordis instance.
import { createRequire } from 'node:module'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-pamyat-restore'
export const inject = ['agents']

export const Config = z.object({
  restoreEnabled: z.boolean().default(true),
  welcomeEnabled: z.boolean().default(true),
  welcomeBudget: z.number().default(800),
  // RU: welcomeInterval ограничивает брифинг на сессию, для всех, включая telegram-v2-* (B-N-1762); умолчание 86400000 мс (сутки).
  // EN: welcomeInterval limits briefings per session, for all sessions including telegram-v2-* (B-N-1762); default 86400000 ms (one day).
  welcomeInterval: z.number().default(86400000),
  // RU: Дисковая отметка переживает перезапуск; путь по умолчанию строится от homedir(), без частного имени агента. Общий дом нескольких процессов не даёт этому пути самостоятельного разделения агентов.
  // EN: A disk marker survives restart; derive its default path from homedir() without a private agent name. A home shared by several processes does not give this path independent agent isolation.
  welcomeOtmetki: z.string().default(join(homedir(), '.dsh-pamyat-welcome-otmetki.json')),
  ignoreAfterMs: z.number().default(7 * 24 * 3600 * 1000),
  useVeraThreshold: z.number().default(0.7),
  // RU: ignoreVeraThreshold=0.3 ниже useVeraThreshold=0.7, различая проверку и полный пропуск. Число считает ядро; согласование порогов с формулой проверяет стенд, импортируя настоящую формулу. Подмена её копией не обнаружила бы расхождение пакетов.
  // EN: ignoreVeraThreshold=0.3 is below useVeraThreshold=0.7, distinguishing verification from complete omission. The core computes the score; tests import its actual formula to check threshold agreement. A copied formula could not expose package drift.
  ignoreVeraThreshold: z.number().default(0.3),
  // RU: klassSvodki должен совпадать с klass секретаря. Умолчания согласованы, но настройка одной стороны без другой даст видимое отсутствие искомого класса.
  // EN: klassSvodki must match the secretary klass. Defaults agree, but configuring one side without the other causes a visible absence of the requested class.
  klassSvodki: z.string().default('svodka-kompakcii'),
})
// RU: Не объявлять настройки обновления без потребителя. Сообщения называют имя и версию из собственного package.json, чтобы различать исполняемую редакцию и файл на диске; ошибка чтения не заменяется старой константой.
// EN: Do not declare refresh settings without a consumer. Messages identify the name and version from this package.json to distinguish the executing revision from disk contents; read failure does not fall back to a stale constant.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна' }
  catch { return 'версия неизвестна' }
})()

const say = (s) => process.stderr.write(`[${name} ${versiya}] ${s}\n`)

// RU: Сводка kompakt-dsh и дословный хвост уже находятся в поверхности сжатия; B добавляет только побуждение. STROKA_HVOSTA повторяет договор kompakt-dsh без зависимости на него; совпадение литералов проверяет стенд.
// EN: The kompakt-dsh summary and verbatim continuation already exist in the compacted surface; B adds only a continuation prompt. STROKA_HVOSTA mirrors the kompakt-dsh contract without depending on it; a test checks literal agreement.
export const NASH_PROVIDER = 'dsh-pamyat-kompakt'
export const STROKA_HVOSTA = 'Дальше — дословный хвост журнала до сжатия'
export const POBUZHDENIE_S_HVOSTOM = 'Сжатие завершено: выше — сводка и дословный хвост журнала до сжатия. '
  + 'Заверши работу, на которой оборвался ход, и продолжай работать.'
export const POBUZHDENIE_BEZ_HVOSTA = 'Сжатие завершено: выше — сводка. '
  + 'Заверши работу, на которой оборвался ход, и продолжай работать.'
/**
 * RU: Проверить текст сводки в поверхности сжатия: true — совпала, false — поверхность прочитана без совпадения, null — прочитать не удалось.
 * EN: Check summary text in the compacted surface: true means a match, false means a readable surface with no match, and null means unreadable.
 */
// RU: История и признак сводки берутся у ядра через ctx.get, без inject; поддерживаются DSH 0.1.1 и 0.1.7+/0.2.0. Нет помощника — один раз объявить fallback к старой истории. Подключение объявляется при первом обращении, поскольку на загрузке ядро ещё может отсутствовать.
// EN: Get history and summary detection from the core through ctx.get without inject; support DSH 0.1.1 and 0.1.7+/0.2.0. With no helper, announce the older-history fallback once. Announce connection on first access because the core may be absent at load time.
let pomoshchnikaNetSkazano = false, pomoshchnikEstSkazano = false
export function pomoshchnikYadra(ctx, skazat = say) {
  let pm
  try { pm = ctx?.get?.('pamyat') } catch { pm = undefined }
  if (typeof pm?.sobytiyaSessii === 'function' && typeof pm?.eSvodkaSzhatiya === 'function') {
    if (!pomoshchnikEstSkazano) { pomoshchnikEstSkazano = true; skazat('помощник событий ядра подключён (sobytiyaSessii)') }
    return pm
  }
  if (!pomoshchnikaNetSkazano) {
    pomoshchnikaNetSkazano = true
    skazat('помощник событий ядра не найден (ctx.pamyat без sobytiyaSessii: ядро без совместимого помощника или не поднято) — журнал читаю как session.events, прежнее поведение')
  }
  return null
}

export function svodkaNaPoverhnosti(session, tekst, pm = null) {
  const uzly = session?.surface?.nodes, sob = pm ? pm.sobytiyaSessii(session) : session?.events
  if (!Array.isArray(uzly) || !sob || typeof session?.deriveEventMessage !== 'function') return null
  const iskomoe = bezStrokiHvosta(String(tekst ?? '')).trim()
  if (!iskomoe) return false
  for (const seq of uzly) {
    const e = sob[seq]
    if (!(pm ? pm.eSvodkaSzhatiya(e) : e?.data?.source?.plugin === 'compact')) continue
    const m = session.deriveEventMessage(e)
    const t = Array.isArray(m?.content) ? m.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : ''
    if (t.includes(iskomoe)) return true
  }
  return false
}
/**
 * RU: Вне поверхности сжатия убрать последний абзац с маркером хвоста: обещание дословного продолжения здесь уже неверно.
 * EN: Outside the compacted surface, remove the final continuation-marker paragraph: its promise of a verbatim suffix is no longer true here.
 */
export function bezStrokiHvosta(tekst) {
  const i = tekst.lastIndexOf('\n\n' + STROKA_HVOSTA)
  return i >= 0 && !tekst.slice(i + 2).includes('\n') ? tekst.slice(0, i) : tekst
}

// RU: Единственный переходник переводит настоящую строку ядра в форму restore. Правдоподобная заглушка не допускается как запасной источник живого контекста.
// EN: One adapter converts an actual core row to the restore shape. A plausible stub is not allowed as a fallback source of live context.
export function perevesti(zapis) {
  if (!zapis || typeof zapis !== 'object') return null
  return {
    id: zapis.id,
    soderzhim: zapis.soderzhim,
    vid: zapis.klass,
    kogda: zapis.sozdano,
    // RU: Передать vera как есть, включая null/undefined: отсутствие измерения не заменяется нулём или порогом.
    // EN: Pass vera unchanged, including null/undefined: do not replace no measurement with zero or a threshold.
    vera: zapis.vera,
    // RU: Автор берётся из istochnik, иначе владельца записи. Отсутствующие сведения не выдумываются.
    // EN: Take authorship from istochnik, otherwise the record owner. Do not invent missing data.
    avtor: zapis.istochnik ?? zapis.agent ?? null,
    // RU: Флаг записи без подтверждения сохраняется на переходе как сведения о доверии.
    // EN: Preserve the unapproved-write flag through the adapter as trust information.
    bezPodtverzhdeniya: zapis.bez_podtverzhdeniya === 1,
    // RU: Позднее подтверждение передаётся отдельно: прежний флаг остаётся фактом истории даже после одобрения. Без этого поля restore ложно называл бы уже подтверждённое знание неподтверждённым.
    // EN: Pass later approval separately: the original flag remains historical fact after approval. Without this field, restore would falsely label already approved knowledge unapproved.
    podtverzhdenie: zapis.podtverzhdenie ?? null,
    // RU: Отношения идут как есть; null означает «ядро не сообщило», не доказанное отсутствие отношений.
    // EN: Pass relationships unchanged; null means “not reported by the core,” not proven absence of relationships.
    otnosheniya: zapis.otnosheniya ?? null,
    // RU: Передать kasanij/poslednee_kasanie без подстановки: 0 означает отсутствие касаний после появления счётчика, null/undefined — отсутствие поля. Эти данные нужны бюджету для тепла, не одной свежести.
    // EN: Pass kasanij/poslednee_kasanie without substitution: 0 means no touches since counting began, null/undefined means no field. Budgets need these data for activity rather than recency alone.
    kasanij: zapis.kasanij,
    poslednee_kasanie: zapis.poslednee_kasanie,
    // RU: Состояние доверия вычисляет ядро по событиям, не restore. null сохраняет прежнюю ветку числовой веры.
    // EN: The core computes trust state from events, not restore. null retains the earlier numeric-trust branch.
    doverie: zapis.doverie ?? null,
    // RU: Оценки передаются без пересчёта: ветка use узнаёт источник веры по kem. null сохраняет прежний договор.
    // EN: Pass ratings without recomputation: the use branch identifies the trust source through kem. null retains the earlier contract.
    ocenki: zapis.ocenki ?? null,
  }
}

/**
 * RU: Если все оценки от модели, use требует helped от двух разных kem, несущих разные выдачи. Ядро ограничивает оценку одной на выдачу; restore считает уникальные kem, не меняет формулу веры. Возвращает null без оценок, {negodno:true} для негодного списка, иначе {tolkoModel,sessiiPomoglo}. Равенство kem трактуется целиком.
 * EN: If every rating is model-authored, use requires helped from two distinct kem values denoting separate deliveries. The core limits one rating per delivery; restore counts unique kem without changing the trust formula. Return null for no ratings, {negodno:true} for an invalid list, otherwise {tolkoModel,sessiiPomoglo}. Compare complete kem values.
 */
// RU: Здесь различаются полные строки kem, а не независимо проверенные номера #v; корректность независимости выдач обеспечивает протокол записи ядра.
// EN: This helper distinguishes full kem strings, not independently verified #v issuance numbers; the core write protocol must establish issuance independence.
export function istochnikVery(ocenki) {
  if (ocenki === null || ocenki === undefined || ocenki === '') return null
  let spisok
  try { spisok = typeof ocenki === 'string' ? JSON.parse(ocenki) : ocenki } catch { return { negodno: true } }
  if (!Array.isArray(spisok)) return { negodno: true }
  if (spisok.length === 0) return null
  const tolkoModel = spisok.every((o) => typeof o?.kem === 'string' && o.kem.startsWith('model:'))
  const sessiiPomoglo = new Set(spisok.filter((o) => o?.ishod === 'helped' && typeof o?.kem === 'string').map((o) => o.kem)).size
  return { tolkoModel, sessiiPomoglo }
}

/**
 * RU: Необязательный byudzhetPamyati отбирает записи C; собственного конкурирующего отбора здесь нет. Нет службы или годного результата — исходный список с объявленной границей применения бюджета.
 * EN: Optional byudzhetPamyati selects C records; no competing selector exists here. A missing service or invalid result retains the original list with an explicit budget-application caveat.
 */
function otobratPodPredel(ctx, zapisi) {
  const b = ctx?.get?.('byudzhetPamyati')
  if (!b || typeof b.otobrat !== 'function') {
    say(`бюджет не смонтирован — брифинг строится БЕЗ предела, записей ${zapisi.length}`)
    return zapisi
  }
  try {
    const itog = b.otobrat({ zapisi })
    const p = Array.isArray(itog?.podnyato) ? itog.podnyato : null
    if (!p) {
      say('🔴 бюджет вернул не список — брифинг строится БЕЗ предела')
      return zapisi
    }
    say(`бюджет применён: поднято ${p.length} из ${zapisi.length}`)
    return p
  } catch (e) {
    // RU: Отказ бюджета не отменяет брифинг: это ограничение цены, не право памяти отвечать.
    // EN: Budget failure does not cancel the briefing: it limits cost, not memory access rights.
    say(`🔴 бюджет отказал (${String(e?.message ?? e).slice(0, 120)}) — брифинг строится БЕЗ предела`)
    return zapisi
  }
}

/**
 * RU: pamyat берётся через ctx.get, чтобы отсутствие необязательного брифинга не блокировало загрузку агента через inject. Отсутствие службы объявляется, не скрывается пустой работой.
 * EN: Get pamyat through ctx.get so an optional missing briefing does not block agent loading through inject. Announce a missing service rather than hide it as empty work.
 */
function pamyatIz(ctx) {
  const p = ctx?.get?.('pamyat')
  return (p && typeof p.prochitat === 'function') ? p : null
}

// RU: Недоступный или негодный источник даёт null с причиной, не пустой массив как доказательство отсутствия записей.
// EN: An unavailable or invalid source yields null with a cause, not an empty array as proof of no records.
async function readRecords(ctx, vopros = {}) {
  const pamyat = pamyatIz(ctx)
  if (!pamyat) {
    say('🔴 служба памяти недоступна (ядро не смонтировано или не поднялось) — инъекция пропущена')
    return null
  }
  if (typeof pamyat.dostupna === 'function' && !pamyat.dostupna()) {
    const pochemu = pamyat.pochemuNedostupna?.() ?? 'причина не названа'
    say(`🔴 память недоступна: ${String(pochemu).slice(0, 140)} — инъекция пропущена`)
    return null
  }
  try {
    const syrye = await pamyat.prochitat({ skolko: 10, ...vopros })
    if (!Array.isArray(syrye)) {
      say('🔴 источник памяти недоступен (prochitat вернул не массив) — инъекция пропущена')
      return null
    }
    return syrye.map(perevesti).filter(Boolean)
  } catch (e) {
    say(`🔴 источник памяти недоступен: ${String(e?.message ?? e).slice(0, 140)} — инъекция пропущена`)
    return null
  }
}
// RU: Детерминированное use/verify/ignore возвращает основание, чтобы решение было проверяемым, не только ярлыком.
// EN: Deterministic use/verify/ignore returns its basis so the decision is verifiable rather than merely labeled.
export function decide(record, config, now = Date.now()) {
  // RU: Проверить конечное числовое время до арифметики: null и undefined не должны случайно стать древней или свежей записью. Неизвестное время — verify с собственной причиной.
  // EN: Check a finite numeric timestamp before arithmetic: null and undefined must not accidentally become ancient or recent records. Unknown time yields verify with its own cause.
  if (typeof record.kogda !== 'number' || !Number.isFinite(record.kogda)) {
    return { decision: 'verify', prichina: 'vremya-neizvestno', reason: 'время записи неизвестно — применять с проверкой' }
  }
  const age = now - record.kogda
  if (age > config.ignoreAfterMs) {
    return { decision: 'ignore', prichina: 'starshe-sroka', reason: `старше ${Math.round(age / 86400000)} сут` }
  }
  // RU: Состояние событий ядра может понизить запись; подтверждение с kem допускает use. Отмена даёт ignore только с vidimo=true: в брифинге видна строка ⛔ с id/причиной, но не содержимое. Обычная, неподтверждённая или отсутствующая отметка возвращается к числовой вере.
  // EN: A core event state may downgrade a record; named approval permits use. Cancellation yields ignore only with vidimo=true: the briefing shows an ⛔ line with id/cause, but no content. Ordinary, unapproved, or missing state falls back to numeric trust.
  const dv = record.doverie
  if (dv && dv.sostoyanie === 'otmenena') return { decision: 'ignore', vidimo: true, prichina: 'otmenena', reason: dv.stroka }
  if (dv && (dv.sostoyanie === 'oprovergnuta' || dv.sostoyanie === 'otmetka-negodna' || dv.sostoyanie === 'utochnena')) {
    return { decision: 'verify', prichina: dv.sostoyanie, reason: dv.stroka }
  }
  if (dv && dv.sostoyanie === 'podtverzhdena') return { decision: 'use', prichina: 'chelovek', reason: dv.stroka }
  // RU: Отсутствующая или нечисловая вера и NaN проверяются до сравнения, с причиной без выдуманного числа. Измеренный 0 остаётся числом и получает соответствующее решение по порогам.
  // EN: Check absent or nonnumeric trust and NaN before comparison, with a cause containing no invented number. A measured 0 remains numeric and receives the appropriate threshold decision.
  if (typeof record.vera !== 'number' || Number.isNaN(record.vera)) {
    return { decision: 'verify', prichina: 'vera-ne-merilas', reason: 'вера не измерялась — применять с проверкой' }
  }
  // RU: Нижний ignore-порог проверяется до use-порога, иначе его ветка оказалась бы недостижимой за общей verify.
  // EN: Check the lower ignore threshold before the use threshold, or its branch would be unreachable behind generic verify.
  if (record.vera < config.ignoreVeraThreshold) {
    return { decision: 'ignore', prichina: 'vera-nizhe-ignore', reason: `вера ${record.vera} ниже порога отбрасывания ${config.ignoreVeraThreshold}` }
  }
  if (record.vera < config.useVeraThreshold) {
    return { decision: 'verify', prichina: 'vera-nizhe-use', reason: `вера ${record.vera} ниже порога ${config.useVeraThreshold}` }
  }
  // RU: Чисто модельные оценки дают use только после helped из двух разных выдач, определённых kem.
  // EN: Model-only ratings permit use only after helped on two different deliveries identified by kem.
  const iv = istochnikVery(record.ocenki)
  if (iv?.negodno) {
    return { decision: 'verify', prichina: 'ocenki-ne-razbirayutsya', reason: `вера ${record.vera}, но список оценок не разбирается — чья вера, не известно` }
  }
  if (iv && iv.tolkoModel) {
    if (iv.sessiiPomoglo < 2) {
      return { decision: 'verify', prichina: 'vera-model-1-sessiya', reason: `вера ${record.vera} от оценок модели: «помогло» из ${iv.sessiiPomoglo} выдач из нужных 2` }
    }
    return { decision: 'use', prichina: 'vera-model-x2', reason: `свежая, вера ${record.vera} · оценка модели ×${iv.sessiiPomoglo} (разные выдачи)` }
  }
  return { decision: 'use', prichina: 'vera', reason: `свежая, вера ${record.vera}` }
}

/**
 * RU: Флаг=true добавляет пометку в текст, false не создаёт подпись «подтверждено»: auto-класс мог вообще не требовать спроса. Флаг описывает отсутствие отвечающего на узле или в вызове, не происхождение знания. Полученное от механизма разрешение с нулевым флагом этой пометкой не различается.
 * EN: Flag=true adds an annotation to the text; false creates no “approved” signature because an auto class may never require approval. The flag describes a missing responder on the host or call, not knowledge origin. This annotation cannot distinguish machine-granted approval with a zero flag.
 */
/**
 * RU: pometkaOtnosheniya только форматирует отношения и сама не выбирает use/verify/ignore. Пусто означает нет данных или нет отношений. Решение об исключении отменённого содержимого принимает decide отдельно.
 * EN: pometkaOtnosheniya only formats relationships and does not select use/verify/ignore. Empty means no data or no relationships. decide separately chooses to exclude cancelled content.
 */
export function pometkaOtnosheniya(r) {
  const o = r?.otnosheniya
  if (!o || typeof o !== 'object') return ''
  const spisok = (a) => a.map((x) => '#' + x).join(', ')
  let t = ''
  if (Array.isArray(o.otmenena) && o.otmenena.length) t += '⛔ ОТМЕНЕНА записью ' + spisok(o.otmenena) + ' — '
  if (Array.isArray(o.utochnena) && o.utochnena.length) t += 'уточнена записью ' + spisok(o.utochnena) + ' — '
  if (o.sama && o.sama.k !== null && o.sama.k !== undefined) {
    t += '(' + (o.sama.vid === 'otmenyaet' ? 'отменяет' : o.sama.vid === 'utochnyaet' ? 'уточняет' : o.sama.vid) + ' #' + o.sama.k + ') '
  }
  return t
}

function pometkaBezPodtverzhdeniya(r) {
  // RU: Restore ждёт bool bezPodtverzhdeniya после perevesti; сырое bez_podtverzhdeniya=0/1 объявляет нарушение формы, не тихо исчезающую пометку.
  // EN: Restore expects bool bezPodtverzhdeniya after perevesti; raw bez_podtverzhdeniya=0/1 explicitly reports a shape violation rather than silently dropping the annotation.
  if (r.bezPodtverzhdeniya === undefined && r.bez_podtverzhdeniya !== undefined) {
    return '🔴 ФОРМА ЗАПИСИ НЕ ТА (пришло сырое поле bez_podtverzhdeniya вместо переведённого) — '
         + 'подтверждение НЕ ПРОВЕРЕНО, читайте как неподтверждённое '
  }
  if (r.bezPodtverzhdeniya !== true) return ''
  const kogda = (typeof r.kogda === 'number' && Number.isFinite(r.kogda))
    ? new Date(r.kogda).toISOString().slice(0, 10)
    : 'дата записи неизвестна'
  // RU: Позднее одобрение меняет пометку, но сохраняет факт прежней записи без подтверждения. Молчание потеряло бы историю, прежняя тревога солгала бы о нынешнем статусе.
  // EN: Later approval changes the annotation while preserving the prior unapproved write. Silence would lose history; the original warning would misstate the current status.
  const otm = razobratPodtverzhdenie(r.podtverzhdenie)
  if (otm) {
    const kogdaP = (typeof otm.kogda === 'number' && Number.isFinite(otm.kogda))
      ? new Date(otm.kogda).toISOString().slice(0, 10)
      : 'дата подтверждения неизвестна'
    return `✅ подтверждено позже: ${otm.kem} (${kogdaP}; записано без подтверждения ${kogda}) `
  }
  return `⚠️ не подтверждено человеком (отвечающего на узле не было, ${kogda}) `
}

/**
 * RU: Разобрать собственное поле одобрения без открытой базы: годный объект требует непустой kem. Отсутствующая, негодная или безымянная отметка возвращает null и не создаёт одобрение. Этот helper не различает причины этих null; формат — межпакетный договор.
 * EN: Parse the supplied approval field without an open database: a valid object requires nonempty kem. Missing, invalid, or unnamed annotations return null and grant no approval. This helper does not distinguish those null causes; the format is an inter-package contract.
 */
function razobratPodtverzhdenie(syroe) {
  if (syroe === null || syroe === undefined || syroe === '') return null
  let o
  try { o = typeof syroe === 'string' ? JSON.parse(syroe) : syroe } catch { return null }
  if (!o || typeof o !== 'object' || typeof o.kem !== 'string' || o.kem.trim() === '') return null
  return o
}

/**
 * RU: podatWelcome возвращает текст и только вошедшие в него записи. Касания нельзя ставить всем отобранным: ignore и бюджет могли исключить их до текста.
 * EN: podatWelcome returns text and only records that actually entered it. Do not touch every selected record: ignore and budget may exclude them before rendering.
 */
export const OTMENENNYH_POIMENNO = 3

// RU: Дата записи печатается ДД.ММ в Europe/Moscow, согласованном с датой шага, не поясом сервера. Окно знаний по умолчанию 7 суток; неизвестное время не получает выдуманную дату.
// EN: Print the record date as DD.MM in Europe/Moscow, matching the turn date rather than the server zone. Knowledge defaults to a 7-day window; unknown timestamps receive no invented date.
const DEN_MSK = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' })
export function denZapisi(kogda) {
  return typeof kogda === 'number' && Number.isFinite(kogda) ? DEN_MSK.format(new Date(kogda)) : null
}

export function podatWelcome(records, config) {
  let left = config.welcomeBudget
  const lines = []
  const podany = []
  const otmenennye = []
  // RU: Отмены собираются по всей выборке, отдельно от бюджета знаний, и идут в конце: первые 3 поимённо, остальные сводкой. Первая видимая отмена не должна вытеснить настоящий текст или скрыть остальные отмены после обрыва бюджета.
  // EN: Collect cancellations across the entire selection separately from the knowledge budget and place them last: the first 3 by name, the rest summarized. The first visible cancellation must neither displace real content nor hide later cancellations after the budget stops selection.
  let polno = false
  // RU: След считает решения для отобранных записей: use по id, остальное по причинам. Он идёт в журнал, не модели; видимая отмена не входит в podany.
  // EN: The trace counts decisions for selected records: use by id, other outcomes by cause. It goes to the journal, not the model; visible cancellation does not enter podany.
  const schet = { vsego: records.length, use: [], verify: {}, ignore: {}, neVlezlo: 0 }
  for (const r of records) {
    const d = decide(r, config)
    const kl = d.prichina ?? '?'
    if (d.decision === 'ignore') schet.ignore[kl] = (schet.ignore[kl] ?? 0) + 1
    if (d.decision === 'ignore' && d.vidimo) {
      // RU: Показать строку отмены без содержимого и без podany: касание отмечает только поданное знание.
      // EN: Show cancellation without content or podany membership: touches count only delivered knowledge.
      otmenennye.push(`⛔ #${r.id ?? '?'} не подаётся — ${d.reason}`)
      continue
    }
    if (d.decision === 'ignore') continue
    if (polno) { schet.neVlezlo++; continue }
    // RU: #id позволяет агенту ссылаться на запись в pamyat_otnoshenie.
    // EN: The #id lets the agent reference a record through pamyat_otnoshenie.
    const den = denZapisi(r.kogda)
    const line = `[${d.decision}] #${r.id ?? '?'} (${r.vid} от ${r.avtor}${den ? ', ' + den : ''}) ${pometkaOtnosheniya(r)}${pometkaBezPodtverzhdeniya(r)}${r.soderzhim} — ${d.reason}`
    if (line.length > left && lines.length > 0) { polno = true; schet.neVlezlo++; continue }
    lines.push(line)
    podany.push(r)
    // RU: use/verify относятся только к реально вставленному тексту; не вместившееся учитывается отдельно, не как состоявшаяся выдача.
    // EN: use/verify apply only to text actually inserted; records that do not fit are counted separately, not as delivered.
    if (d.decision === 'use') schet.use.push({ id: r.id ?? '?', prichina: kl })
    else schet.verify[kl] = (schet.verify[kl] ?? 0) + 1
    left -= line.length
  }
  if (lines.length === 0 && otmenennye.length === 0) return { tekst: null, podany, schet }
  const hvost = otmenennye.length > OTMENENNYH_POIMENNO
    ? ` · ещё ${otmenennye.length - OTMENENNYH_POIMENNO} отменено: `
      + otmenennye.slice(OTMENENNYH_POIMENNO).map((l) => l.slice(2, l.indexOf(' не подаётся'))).join(', ')
    : ''
  const stroki = otmenennye.length ? [...lines, otmenennye.slice(0, OTMENENNYH_POIMENNO).join(' · ') + hvost] : lines
  // RU: Наставление оценке добавляется один раз только при поданных знаниях; одна отмена права оценки не даёт.
  // EN: Add the rating instruction once only with delivered knowledge; a cancellation alone permits no rating.
  const nastavlenie = lines.length ? ' После применения записи #N из этого приветствия оцени результат через pamyat_ocenit: '
    + 'pomoglo, podvelo или ustarelo, с конкретной причиной (20–400 знаков). Простое чтение не оценивай. '
    + 'Нет проверки результата — оценки нет. Одну выдачу оценивай один раз; после отказа не повторяй вызов без новой выдачи.' : ''
  return {
    tekst: `Память (welcome-брифинг, первые ${lines.length} записи по правилу use/verify/ignore):` + nastavlenie + '\n' + stroki.map((l) => `- ${l}`).join('\n'),
    podany,
    schet,
  }
}

/**
 * RU: Форматировать строку следа для ручного чтения журнала; автоматический сторож этим helper не создаётся.
 * EN: Format a trace row for manual journal reading; this helper creates no automatic watcher.
 */
export function strokaVydachi(schet) {
  if (!schet) return 'выдача: счёта нет'
  const razb = (o) => { const v = Object.entries(o); return v.length ? ' (' + v.map(([k, n]) => k + ' ' + n).join(', ') + ')' : '' }
  const sum = (o) => Object.values(o).reduce((a, n) => a + n, 0)
  const use = schet.use.length ? ' [' + schet.use.map((u) => '#' + u.id + ' ' + u.prichina).join(', ') + ']' : ''
  return `выдача: отобрано ${schet.vsego} · use ${schet.use.length}${use} · verify ${sum(schet.verify)}${razb(schet.verify)} · ` +
    `ignore ${sum(schet.ignore)}${razb(schet.ignore)} · не влезло в бюджет ${schet.neVlezlo}` +
    ((schet.use.length + sum(schet.verify) + sum(schet.ignore) + schet.neVlezlo) === schet.vsego ? ' — сходится'
      : ` — 🔴 НЕ СХОДИТСЯ: разнесено ${schet.use.length + sum(schet.verify) + sum(schet.ignore) + schet.neVlezlo} из ${schet.vsego}`)
}

export function renderWelcome(records, config) {
  return podatWelcome(records, config).tekst
}

// RU: Политику исключения читаем у ядра при каждом вызове. Без метода запрещены чтение и подача памяти до восстановления; отказ не останавливает обычный ход агента. Предупреждение подавлено в пределах экземпляра модуля.
// EN: Read exclusion policy from the core on every call. Without the method, block memory reads and delivery until recovery while allowing the normal agent turn. Suppress repeated warnings within the module instance.
let bezIsklyucheniyaSkazano = false
export function vneSessiiPamyati(ctx, sid, skazat = say) {
  let pm
  try { pm = ctx?.get?.('pamyat') } catch { pm = undefined }
  if (typeof pm?.sessiyaIsklyuchena !== 'function') {
    if (!bezIsklyucheniyaSkazano) { bezIsklyucheniyaSkazano = true; skazat('ОТКАЗ PAMYAT_POLITIKA_NEDOSTUPNA: ядро без sessiyaIsklyuchena — чтение и подача памяти запрещены до восстановления политики') }
    return true
  }
  return !!pm.sessiyaIsklyuchena(sid)
}

export function apply(ctx, config) {
  if (globalThis.__pamyatRestore) return
  globalThis.__pamyatRestore = true
  ctx.provide?.('newConversationRestore', {version:1})
  say(`подъём: restore=${config.restoreEnabled} welcome=${config.welcomeEnabled} бюджет=${config.welcomeBudget} ignoreAfterMs=${config.ignoreAfterMs} useVera=${config.useVeraThreshold} ignoreVera=${config.ignoreVeraThreshold}`)
  // RU: ignore-порог >= use-порога делает ветку недостижимой. Объявить неверную настройку без блокировки загрузки: молчание не доказывает работоспособные пороги.
  // EN: An ignore threshold >= the use threshold makes a branch unreachable. Report invalid configuration without blocking load: silence does not prove workable thresholds.
  if (!(config.ignoreVeraThreshold < config.useVeraThreshold)) {
    say(`🔴 пороги веры несовместимы: ignoreVera=${config.ignoreVeraThreshold} НЕ ниже useVera=${config.useVeraThreshold}`
      + ' — одна из веток решения недостижима; исход выдачи будет верным по коду и ложным по смыслу')
  }

  // RU: compaction/end — тип session/event, не отдельный хук. Подписка отбирает type и пропускает error, где история не сократилась. Состояние хранится по session.id и времени: одна сессия не взводит другую, а время позволяет отличить новую сводку от прежней.
  // EN: compaction/end is a session/event type, not a separate hook. Select by type and skip error cases where history was not shortened. Store state by session.id and time: one session must not arm another, and time distinguishes a new summary from an older one.
  const pendingRestore = new Map()
  // RU: Рубеж — compaction/start с тем же compactionId, не end: сводка вставляется между ними. Отсутствие совпавшего начала означает неизвестную свежесть. Для новой сессии используются сведения её поверхности; наличие записи памяти само по себе не подтверждает сжатие.
  // EN: The boundary is compaction/start with the same compactionId, not end: the summary is inserted between them. No matching start means unknown freshness. For a new session, use its surface data; a memory record alone does not confirm compaction.
  const kompaktOtmetka = config.welcomeOtmetki + '.compaction-ok.json'
  const prochitannyeSessii = new Set()
  let oshibkaOtmetki = null
  function podtverzhdenie() {
    try {
      const d = JSON.parse(readFileSync(kompaktOtmetka, 'utf8'))
      if (d.version !== 1 || d.scope !== config.welcomeOtmetki ||
          typeof d.session !== 'string' || !d.session ||
          typeof d.compactionId !== 'string' || !d.compactionId ||
          !Number.isFinite(d.time) || d.time <= 0) throw Error('негодная отметка')
      return true
    } catch (e) {
      if (e.code === 'ENOENT') return false
      oshibkaOtmetki = e.code ?? 'неверный формат'
      return null
    }
  }
  function zapomnitKompakt(session, event) {
    if (event?.type !== 'compaction/end' || event.data?.error !== undefined) return
    if (typeof session?.id !== 'string' || !session.id ||
        typeof event.data?.compactionId !== 'string' || !event.data.compactionId ||
        !Number.isFinite(event.time) || event.time <= 0) {
      oshibkaOtmetki = 'compaction/end без session/compactionId/time'
      say('⚠️ подтверждение компакта НЕ сохранено: ' + oshibkaOtmetki)
      return
    }
    if (podtverzhdenie() === true) return
    const tmp = kompaktOtmetka + '.' + randomUUID() + '.tmp'
    try {
      mkdirSync(dirname(kompaktOtmetka), { recursive: true })
      const fd = openSync(tmp, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify({ version: 1, scope: config.welcomeOtmetki,
          session: session.id, compactionId: event.data.compactionId, time: event.time }) + '\n')
        fsyncSync(fd)
      } finally { closeSync(fd) }
      renameSync(tmp, kompaktOtmetka)
      const dir = openSync(dirname(kompaktOtmetka), 'r')
      try { fsyncSync(dir) } finally { closeSync(dir) }
      oshibkaOtmetki = null
      say(`подтверждение успешного платформенного компакта сохранено: ${kompaktOtmetka}`)
    } catch (e) {
      oshibkaOtmetki = e.code ?? 'ошибка записи'
      say('⚠️ подтверждение компакта НЕ сохранено: ' + oshibkaOtmetki)
    } finally { try { unlinkSync(tmp) } catch {} }
  }
  const nachalaKompakta = new Map()
  // RU: provider/compactionId и маркер хвоста различают сводку kompakt-dsh, уже видимую в текущей поверхности, от сводок иных сжатий.
  // EN: provider/compactionId and the continuation marker distinguish a kompakt-dsh summary already visible in the current surface from summaries of other compactions.
  const svodkaKompakta = new Map()
  ctx.on('session/event', (session, event) => {
    if (event?.type === 'compaction/summary') {
      const sidS = String(session?.id ?? '')
      const tekstS = Array.isArray(event.data?.summary) ? event.data.summary.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : ''
      if (sidS) svodkaKompakta.set(sidS, { compactionId: event.data?.compactionId ?? null, provider: event.data?.provider ?? null,
        sHvostom: tekstS.includes(STROKA_HVOSTA) })
      return
    }
    if (event?.type === 'compaction/start') {
      const sid0 = String(session?.id ?? '')
      if (sid0) nachalaKompakta.set(sid0, { kogda: event.time ?? Date.now(), compactionId: event.data?.compactionId ?? null })
      return
    }
    if (event?.type !== 'compaction/end') return
    zapomnitKompakt(session, event)
    if (event.data?.error !== undefined) {
      say(`компакт ${event.data.compactionId ?? '?'} завершился ошибкой — восстанавливать нечего`)
      return
    }
    const sid = String(session?.id ?? '')
    if (!sid) { say('🔴 compaction/end без опознанной сессии — восстановление пропущено'); return }
    const cid = event.data?.compactionId ?? null
    const nachalo = nachalaKompakta.get(sid)
    // RU: Не совпал compactionId или начало не наблюдалось — рубеж null, не утверждение «свежая» или «старая».
    // EN: A mismatched compactionId or unobserved start yields a null boundary, not a claim of freshness or age.
    const rubezh = (nachalo && (nachalo.compactionId === null || cid === null || nachalo.compactionId === cid))
      ? nachalo.kogda : null
    nachalaKompakta.delete(sid)
    const sv = svodkaKompakta.get(sid)
    svodkaKompakta.delete(sid)
    // RU: Сводка нашего пути требует совпавший compactionId; прежняя или родная после отказа нашего провайдера не считается своей.
    // EN: A summary from this route requires a matching compactionId; an older or native summary after our provider fails is not ours.
    const nasha = !!(sv && cid !== null && sv.compactionId === cid && sv.provider === NASH_PROVIDER)
    pendingRestore.set(sid, { kogda: event.time ?? Date.now(), compactionId: cid, rubezh, nasha, sHvostom: nasha && sv.sHvostom })
    // RU: Каждое подходящее событие печатает след прихода, чтобы отсутствие восстановления отличалось от отсутствия вызова.
    // EN: Print an arrival trace for each relevant event so missing restoration differs from no invocation.
    say(`компакт ${event.data?.compactionId ?? '?'} завершён (ход ${event.data?.turn ?? 'null'}), `
      + `сессия ${sid}: восстановление взведено`)
  })

  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    // RU: Исключённая сессия не получает welcome или восстановление.
    // EN: An excluded session receives neither welcome nor restoration.
    if (vneSessiiPamyati(ctx, String(agent?.session?.id ?? agent?.id ?? ''))) return decision

    // RU: Id записей передаются в документированном sections {name,text}, не в лишнем поле source; data.id обозначает сообщение. Пустой перечень использует общую секцию без #, различая пустоту и отсутствие списка.
    // EN: Pass record ids through documented sections {name,text}, not an extra source field; data.id denotes the message. An empty list uses a general section without #, distinguishing empty metadata from missing metadata.
    const inject = (text, ids = []) => ({
      kind: 'enter',
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          kind: `plugin:${name}`,  // RU: DSH 0.2/v4 требует kind=plugin:<name>, не отдельное kind=plugin.
          // EN: DSH 0.2/v4 requires kind=plugin:<name>, not plain kind=plugin.
          form: 'snapshot',
          sections: ids.length
            ? ids.map((id) => ({ name: `${name}#zapis-${id}`, text }))
            : [{ name, text }],
        },
      })],
    })

    // RU: B обрабатывает восстановление после успешного сжатия.
    // EN: B handles restoration after successful compaction.
    const sid = String(agent?.session?.id ?? agent?.id ?? '')
    // RU: При монтаже после сжатия прочитать историю платформы, не выводить факт сжатия из записи памяти. Недоступная история — неизвестно, не штатный ноль.
    // EN: When loaded after compaction, read platform history rather than infer compaction from a memory row. Unavailable history means unknown, not a valid zero.
    if (!prochitannyeSessii.has(sid)) {
      const pm = pomoshchnikYadra(ctx)
      const sobytiya = pm ? pm.sobytiyaSessii(agent?.session) : agent?.session?.events
      if (Array.isArray(sobytiya)) {
        // RU: Сессию считать прочитанной только после годного чтения истории. Ошибка оставляет возможность повторить на следующем шаге.
        // EN: Mark a session read only after valid history reading. Failure leaves a retry possible on the next step.
        prochitannyeSessii.add(sid)
        for (const event of sobytiya) zapomnitKompakt(agent.session, event)
      } else if (podtverzhdenie() !== true) oshibkaOtmetki = 'история сессии недоступна'
    }

    if (config.restoreEnabled && pendingRestore.has(sid)) {
      const povod = pendingRestore.get(sid)
      pendingRestore.delete(sid)
      // RU: Сводка kompakt-dsh уже в поверхности: не вставлять снова, добавить побуждение после хвоста и входящего письма. Иные/старые сводки и неизвестная свежесть остаются отдельными ветками.
      // EN: The kompakt-dsh summary is already in the surface: do not insert it again; add a continuation prompt after the suffix and incoming message. Other/older summaries and unknown freshness keep separate branches.
      if (povod.nasha) {
        const pobuzhdenie = povod.sHvostom ? POBUZHDENIE_S_HVOSTOM : POBUZHDENIE_BEZ_HVOSTA
        say(`компакт ${povod.compactionId}: сводка нашего движка уже в поверхности — повторно НЕ вставлена; побуждение `
          + (povod.sHvostom ? '(сводка + хвост)' : '(сводка без хвоста)') + ` вставлено в сессию ${sid}`)
        return inject(pobuzhdenie)
      }
      if (sid.startsWith('telegram-v2-')) {
        say(`сессия ${sid}: перенос глобальной сводки после /new запрещён; собственная сводка остаётся в поверхности`)
        return decision
      }
      // RU: Последняя сводка читается отдельным klass-запросом ядра: она могла отсутствовать среди десяти общих последних записей.
      // EN: Read the latest summary with a separate core klass query: it may be absent among the latest ten general records.
      const records = await readRecords(ctx, { klass: config.klassSvodki, skolko: 1 })
      if (!records) return decision
      const summary = records[0]
      if (summary) {
        // RU: Старая сводка всё ещё служит опорой, но возраст и предупреждение должны видеть и агент в тексте, и журнал. Не выдавать её молча за сводку этого сжатия.
        // EN: An older summary still supplies context, but both the agent text and journal must show its age and warning. Never silently present it as this compaction summary.
        const kogdaSvodka = Number(summary.sozdano ?? summary.kogda ?? NaN)
        const kogdaKompakt = Number(povod?.rubezh ?? NaN)
        const oba = Number.isFinite(kogdaSvodka) && Number.isFinite(kogdaKompakt)
        const starshe = oba && kogdaSvodka < kogdaKompakt
        const otstavanie = oba ? Math.round((kogdaKompakt - kogdaSvodka) / 60000) : null
        let shapka = 'Восстановление после компакта:'
        if (starshe) {
          shapka = '🔴 Восстановление после компакта: сводка НЕ ОТ ЭТОГО СЖАТИЯ.\n'
            + `Она записана за ${otstavanie} мин до него — свежей в памяти нет.\n`
            + 'Значит итог последнего отрезка в неё НЕ вошёл: считайте её опорой на прошлое,\n'
            + 'а не рассказом о том, что было только что.'
        } else if (!oba) {
          shapka = '⚠️ Восстановление после компакта: возраст сводки СВЕРИТЬ НЕ УДАЛОСЬ\n'
            + '(нет времени записи либо не пришло начало этого сжатия) — это «не смотрели»,\n'
            + 'а не «свежая»: сводка может быть и от этого сжатия, и от прежнего.'
        }
        say(`восстановление после компакта вставлено в сессию ${sid}: запись ${summary.id ?? '?'}, `
          + `${String(summary.soderzhim).length} знаков`
          + (starshe ? ` — 🔴 СВОДКА СТАРШЕ КОМПАКТА на ${otstavanie} мин: свежей нет, подставлена прежняя`
             : oba ? ' — сводка этого сжатия' : ' — ⚠️ возраст сводки не сверялся'))
        return inject(`${shapka}\n${summary.soderzhim}`, [summary.id].filter((v) => v !== undefined && v !== null))
      }
      // RU: Событие без сводки объявляется с искомым классом, чтобы не выглядеть отсутствием события или скрытым расхождением настроек.
      // EN: Report an event with no summary together with the queried class so it cannot resemble no event or hidden configuration drift.
      say(`компакт был, но записи класса «${config.klassSvodki}» в памяти нет — вставлять нечего`)
    }

    // RU: C запускается на первом подходящем шаге сессии после старта процесса, не только turn=1/step=1. welcomeInterval ограничивает повтор через дисковую отметку; процессное множество отдельно предотвращает два брифинга за один запуск. Обе отметки ставятся до чтения памяти, поэтому отказ чтения тоже расходует попытку welcome до следующего запуска/интервала.
    // EN: C runs on the first eligible session step after process startup, not only turn=1/step=1. welcomeInterval bounds repetition through a disk marker; a separate process set prevents two briefings in one run. Both markers are set before reading memory, so a read failure also consumes the welcome attempt until the next run/interval.
    // RU: A-N-1719 (решение Забавы 07.10): welcome получают и сессии telegram-v2-* (/new) — но только ЗНАНИЯ, без старой сводки компакта: она — прошлый разговор, а изоляцию /new держит stend-new-session.
    // RU: B-N-1762 (07.10, условие Вениамина): предел welcomeInterval — на СЕССИЮ для всех, и для v2 тоже. ID telegram-v2-<uuid> строит только переход /new (dsh-telegram-multiagent conversation-sessions.js begin(); первая сессия собеседника — telegram-<ключ>), значит новая v2-сессия = новое поколение разговора = повод для брифинга независимо от 24 ч. Прежний предел «на агента» давал второму /new за сутки сессию без знаний (Петрович 12:4xZ). 24 ч держат только перезапуски ТОЙ ЖЕ сессии.
    // EN: A-N-1719: telegram-v2-* sessions (/new) receive welcome, knowledge only, without the old compaction summary. B-N-1762: welcomeInterval is per SESSION for all sessions, v2 included: telegram-v2-<uuid> ids are created only by the /new transition, so a new v2 session is a new conversation generation and gets a briefing regardless of 24 h; the 24 h limit covers restarts of the SAME session only.
    const v2 = sid.startsWith('telegram-v2-')
    if (config.welcomeEnabled && !welcomeDano.has(sid)) {
      welcomeDano.add(sid)
      const proshlo = Date.now() - welcomeKogdaBylo(config, sid)
      if (proshlo < config.welcomeInterval) {
        say(`welcome пропущен: прошлый брифинг сессии был ${Math.round(proshlo / 3600000)} ч назад, ` +
            `предел ${Math.round(config.welcomeInterval / 3600000)} ч (сессия ${sid}). ` +
            'Это не отказ: брифинг раз в сутки, чтобы не стать шумом.')
        return decision
      }
      welcomeOtmetit(config, sid)
      const vseZapisi = await readRecords(ctx)
      if (!vseZapisi) return decision
      const records = v2 ? vseZapisi.filter((z) => z.vid !== config.klassSvodki) : vseZapisi
      // RU: Бюджет отбирает знания C, не единственную сводку B. Без службы C сохраняет прежнюю выдачу с явным сообщением; отсутствие бюджета не выдаётся за применение без отсева.
      // EN: Budget selects C knowledge, not the sole B summary. Without the service, C retains earlier delivery with an explicit message; no budget is not presented as budget applied without exclusions.
      const otobrannye = otobratPodPredel(ctx, records)
      const { tekst: briefing, podany, schet: schetVydachi } = podatWelcome(otobrannye, config)
      say(strokaVydachi(schetVydachi))   // RU: Welcome читает ровно одну последнюю сводку отдельно от десяти знаний и подаёт её целиком вне budget и welcomeBudget. Иначе отбор, стоимость и предел текста могли бы одновременно исключить основу прошлого разговора. Это не подъём сводки на каждом ходу.
      // EN: Welcome reads exactly one latest summary separately from ten knowledge records and delivers it whole outside budget and welcomeBudget. Otherwise selection, cost, and text limits could all exclude the previous conversation basis. This is not summary delivery on every turn.
      let svodkaCelikom = null
      let uzheNaPoverhnosti = false
      if (v2) say(`welcome: сессия ${sid} — /new: старая сводка компакта НЕ поднимается, только знания`)
      else try {
        const najdeno = await readRecords(ctx, { klass: config.klassSvodki, skolko: 1 })
        if (Array.isArray(najdeno) && najdeno.length) {
          svodkaCelikom = najdeno[0]
          // RU: При продолжающейся сессии сравнить текст сводки с обёрткой сжатия: совпавшая не вставляется повторно. Другая сводка, новая сессия или недоступная поверхность сохраняют обычный путь, насколько допускает политика новой сессии.
          // EN: In a continuing session, compare summary text with the compaction wrapper: do not insert a match again. A different summary, new session, or unreadable surface retains the usual path as permitted by new-session policy.
          const naPov = svodkaNaPoverhnosti(agent?.session, String(svodkaCelikom.soderzhim ?? ''), pomoshchnikYadra(ctx))
          if (naPov === true) {
            say(`welcome: последняя сводка компакта id=${svodkaCelikom.id} уже стоит в поверхности этой сессии — ` +
                'в брифинг НЕ поднята (иначе агент прочёл бы её дважды)')
            svodkaCelikom = null
            uzheNaPoverhnosti = true
          } else if (naPov === null) {
            say('⚠️ welcome: поверхность сессии не прочитана — есть ли там сводка, НЕ ЗНАЕМ; поднимаю сводку, как прежде')
          }
        } else if (Array.isArray(najdeno)) {
          const est = podtverzhdenie()
          if (est === true && !oshibkaOtmetki) {
            say(`🔴 записей класса «${config.klassSvodki}» в памяти НОЛЬ после подтверждённого ` +
              'успешного платформенного компакта — сводка при подъёме НЕ поднимется. ' +
              'Сверить запись секретаря и его klass с классом restore.')
          } else if (est === false && !oshibkaOtmetki) {
            say(`сводок пока нет: класс «${config.klassSvodki}»; успешное платформенное сжатие не подтверждено`)
          } else {
            say(`⚠️ ожидание сводки НЕ УСТАНОВЛЕНО: ${oshibkaOtmetki}; класс «${config.klassSvodki}», записей 0`)
          }
        } else {
          say(`⚠️ чтение класса «${config.klassSvodki}» вернуло не перечень (${typeof najdeno}) — сколько записей, НЕ ЗНАЕМ`)
        }
      } catch (e) {
        say(`⚠️ последняя сводка компакта не прочитана (${String(e?.message ?? e).slice(0, 90)}) — ` +
            'брифинг будет БЕЗ неё. Это слепота, а не «сводки нет».')
      }

      if (briefing || svodkaCelikom) {
        // RU: Передавать id фактически поданных записей, поскольку по ним отмечается касание.
        // EN: Pass ids of records actually delivered because these determine touches.
        const idsB = podany.map((z) => z.id).filter((v) => v !== undefined && v !== null)
        if (podany.length < otobrannye.length) {
          say(`welcome: в текст не вошли ${otobrannye.length - podany.length} из ${otobrannye.length} отобранных ` +
              '(ignore по возрасту или сверх предела) — касание им НЕ ставится')
        }
        // RU: Полная сводка идёт первой, знания — в оставшийся обычный бюджет. Такой порядок гарантирует её место независимо от числа свежих записей; увеличение общего предела этого не гарантировало бы.
        // EN: Place the complete summary first, followed by knowledge in the remaining ordinary budget. This order preserves its place regardless of recent-record count; increasing a shared limit would not guarantee that.
        let telo = ''
        if (svodkaCelikom) {
          const znakov = String(svodkaCelikom.soderzhim ?? '').length
          // RU: Удалить обещание «дальше дословный хвост»: в welcome этого хвоста следом нет.
          // EN: Remove the “verbatim continuation follows” promise: welcome has no such suffix after it.
          telo = `Последняя сводка компакта (поднята ЦЕЛИКОМ, вне бюджета — ${znakov} знаков):\n`
            + bezStrokiHvosta(String(svodkaCelikom.soderzhim ?? ''))
            + (briefing ? '\n\n' + briefing : '')
          // RU: Сводка может встретиться отдельно и в отборе. Дедуплицировать id, чтобы журнал не завышал число записей и касание не считало дубль.
          // EN: A summary may appear both separately and in selection. Deduplicate ids so the journal does not overcount records and touches do not count duplicates.
          if (svodkaCelikom.id !== undefined && svodkaCelikom.id !== null
              && !idsB.includes(svodkaCelikom.id)) idsB.push(svodkaCelikom.id)
          // RU: Явно объявить сводку вне предела, чтобы дополнительный объём не выглядел поломанным бюджетом.
          // EN: Explicitly announce the summary outside the limit so extra volume does not look like a broken budget.
          say(`welcome: последняя сводка компакта id=${svodkaCelikom.id} поднята ЦЕЛИКОМ вне бюджета ` +
              `(${znakov} знаков при пределе брифинга ${config.welcomeBudget}). Это решение, а не сбой предела.`)
        } else {
          telo = briefing ?? ''
          if (!uzheNaPoverhnosti && !v2) say('welcome: сводки компакта в памяти НЕТ — брифинг без неё. ' +
              'Это «не нашлось», а не «решили не поднимать».')
        }
        say(`welcome-брифинг вставлен: ${telo.length} знаков, ` +
            `опознаватели: ${idsB.length ? idsB.join(',') : 'НЕТ — наследование уровня по ним неисполнимо'}`)
        // RU: Касание вызывается по поданным id и сохраняет след выдачи в базе, не только ротируемом журнале. До веса касаний нужен ряд наблюдений. Оно ставится перед возвратом вставки: если вставка не состоится, касание останется; это граница счётчика, не гарантия получения моделью.
        // EN: Touch delivered ids to retain the delivery trace in the database rather than only a rotating journal. Observations are needed before assigning touch weight. Mark before returning the insert: if insertion does not happen, the touch remains; this bounds the counter rather than guarantees model receipt.
        try {
          const p = pamyatIz(ctx)
          if (p && typeof p.otmetitKasanie === 'function' && idsB.length) {
            const itog = p.otmetitKasanie({ ids: idsB, povod: 'vydacha-agentu' })
            if (itog?.otkaz) {
              say(`касания НЕ записаны (${itog.otkaz.code}): ${String(itog.otkaz.pochemu).slice(0, 120)}. ` +
                  'Выдача состоялась и не отменяется; счёт касаний за этот брифинг потерян.')
            } else {
              say(`касания отмечены: ${itog?.otmecheno ?? 0} из ${idsB.length} выданных записей`)
            }
          } else if (p && typeof p.otmetitKasanie !== 'function') {
            // RU: Старое ядро без otmetitKasanie не отменяет выдачу, но отсутствие учёта объявляется: нули не означают измеренную ненужность записей.
            // EN: An older core without otmetitKasanie does not cancel delivery, but announce missing accounting: zero does not mean measured lack of need.
            say('касания НЕ отмечаются: у службы памяти нет otmetitKasanie (ядро старше alpha.44). ' +
                'Нули в счётчике означают «некому отмечать», а не «записи не нужны».')
          }
        } catch (e) {
          say(`касания не отмечены: ${String(e?.message ?? e).slice(0, 120)}`)
        }
        return inject(telo, idsB)
      }
    }

    return decision
  }, { prepend: true })
}
  // RU: Процессное множество означает «дано за этот запуск», отдельно от дисковой даты «когда дано вообще».
  // EN: The process set means “delivered during this run,” separate from the disk date recording delivery across runs.
  const welcomeDano = new Set()

  /**
   * RU: Прочитать отметку сессии sid; при sid=null — самую свежую отметку агента по всем сессиям (v2, A-N-1719). 0 трактуется как отсутствие предыдущего брифинга.
   * EN: Read the marker of session sid; with sid=null, the agent's latest marker across all sessions (v2, A-N-1719). Treat 0 as no prior briefing.
   */
  function welcomeKogdaBylo (cfg, sid) {
    try {
      const d = JSON.parse(readFileSync(cfg.welcomeOtmetki, 'utf-8'))
      const t = Number(d?.[sid])
      return Number.isFinite(t) ? t : 0
    } catch {
      // RU: Отсутствующий или нечитаемый файл трактуется как «не давался». Это обеспечивает первый запуск, но также сбрасывает ограничение частоты при порче или недоступности уже существующей отметки.
      // EN: Treat an absent or unreadable file as “not delivered.” This allows initial startup but also resets rate limiting when an existing marker is corrupt or inaccessible.
      return 0
    }
  }

  /**
   * RU: Сохранить отметку брифинга. Отказ записи не отменяет уже собранную выдачу, но объявляет отсутствие долговременного ограничения частоты.
   * EN: Save the briefing marker. Write failure does not undo the assembled delivery but reports unavailable persistent rate limiting.
   */
  function welcomeOtmetit (cfg, sid) {
    let d = {}
    try { d = JSON.parse(readFileSync(cfg.welcomeOtmetki, 'utf-8')) } catch { d = {} }
    d[sid] = Date.now()
    try {
      mkdirSync(dirname(cfg.welcomeOtmetki), { recursive: true })
      // RU: A-N-1948 №3 (№23): новый файл отметок — без прав прочим (0660, как база памяти); существующий режим не меняется.
      // EN: A-N-1948 №3 (№23): a new marks file gets no access for others (0660, like the memory database); an existing mode is kept.
      writeFileSync(cfg.welcomeOtmetki, JSON.stringify(d, null, 2) + '\n', { mode: 0o660 })
    } catch (e) {
      say(`отметка о брифинге НЕ сохранена (${e?.message ?? e}) — следующий подъём ` +
          'даст брифинг снова, предел частоты в этот раз не сработает')
    }
  }

