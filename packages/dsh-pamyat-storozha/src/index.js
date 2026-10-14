// RU: dsh-pamyat-storozha — сторожа обслуживания памяти агента на платформе DSH. Плагин cordis: слушает события
//     сессии (session/event) внутри процесса агента и печатает в журнал (и, если задано, во внешний сток) три
//     вида сообщений:
//     1) оповещение о КАЖДОМ сжатии контекста — естественном, принудительном (команда человека), обрезке без
//     модели (prune) и проваленной попытке, с объёмом, расходом, длительностью и маршрутом;
//     2) тревогу «ступень заполнения» — когда давление на контекст (вход + кэш) перешагивает 85% / 90% порога
//     сжатия; каждая ступень отдаётся один раз до следующего сжатия, отданные ступени хранятся на диске и
//     переживают перезапуск;
//     3) сводку сторожа — область, числитель и знаменатель (сжатия против ходов), охват по сессиям и то, чего
//     сторож НЕ видел; печатается после каждого завершённого сжатия и по такту ходов.
//     Пакет ничего не меняет в работе агента: он только наблюдает и говорит. Его задача — чтобы молчание памяти
//     было отличимо от её исправности.
// EN: dsh-pamyat-storozha — memory maintenance guards for an agent on the DSH platform. A cordis plugin: it
//     listens to session events (session/event) inside the agent process and prints three kinds of messages to
//     the log (and, if configured, to an external sink):
//     1) a notification about EVERY context compaction — natural, forced (a human command), prune without a
//     model, and a failed attempt — with volume, spend, duration and route;
//     2) a "fill stage" alarm — when pressure on the context (input + cache) crosses 85% / 90% of the
//     compaction threshold; each stage is reported once until the next compaction, reported stages are stored
//     on disk and survive a restart;
//     3) the guard summary — scope, numerator and denominator (compactions versus turns), per-session coverage
//     and what the guard did NOT see; printed after every finished compaction and on a turn cadence.
//     The package changes nothing in how the agent works: it only observes and speaks. Its job is to make
//     silence of the memory distinguishable from its health.
import { chitatPorogD } from "dsh-pamyat-kompakt/porogi.mjs"
import Schema from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'
import { vidKonca, rashod, davlenie, dlitelnost } from './vidy-szhatiya.js'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, renameSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

// RU: Версия в каждой строке журнала — не украшение, а условие видимости для чужих приборов. Соседние пакеты
//     печатают «[имя версия]», и разборщики журнала ищут именно этот образец: строка без номера выпадает из их
//     столбцов, а пустая клетка читается как «пакета нет». Так однажды случилось дважды за сутки, и оба раза
//     молча: срез журналов не показал сторожа среди работающих, а подсчёт «у кого в журнале только отказы»
//     насчитал ему ноль строк при четырёх настоящих.
//     Версия читается ОДИН раз при загрузке модуля из его package.json. Не прочиталась — пишем «версия
//     неизвестна», а НЕ подставляем последнюю известную: подставленный номер утверждал бы то, чему код уже
//     может не соответствовать.
// EN: The version in every log line is not decoration but a condition of visibility to other tools. Sibling
//     packages print "[name version]", and log parsers look for exactly this pattern: a line without a number
//     drops out of their columns, and an empty cell reads as "the package is absent". This once happened twice
//     in one day, both times silently: a log slice did not show the guard among running packages, and a count
//     of "whose log has only failures" gave it zero lines while four real ones existed.
//     The version is read ONCE when the module loads, from its package.json. If it cannot be read we print
//     "версия неизвестна" (version unknown) and do NOT substitute the last known one: a substituted number
//     would assert something the code may no longer match.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна' }
  catch { return 'версия неизвестна' }
})()

export const name = 'dsh-pamyat-storozha'
export const inject = []

/**
 * RU: ПЕРЕЧЕНЬ СТОРОЖЕЙ — В ОДНОМ МЕСТЕ, И ОН СВЕРЯЕТСЯ С ОПИСАНИЕМ ПРОБОЙ (стенд stend-opisaniya.mjs).
 *     Правило приёмки: у КАЖДОГО сторожа в README обязательны две колонки — «🔴 ЧЕГО НЕ ЛОВИТ» и «🔴 ЧТО ЗНАЧИТ
 *     ЕГО МОЛЧАНИЕ». Сегодня они есть у всех трёх, но это состояние, а не устройство: заведи четвёртого и
 *     забудь описать — описание останется полным НА ВИД, потому что о недостающем оно молчит. Проверка перечня
 *     ловит лишнее и слепа к недостающему.
 *     Поэтому список живёт ЗДЕСЬ, а стенд сверяет его с README в обе стороны: объявлен в коде, но не описан —
 *     красное (сторож без обязательных колонок); описан колонками, но нет в коде — красное (описан сторож,
 *     которого нет).
 *     Поле zagolovok должно ДОСЛОВНО совпадать с текстом заголовка раздела README после «## ».
 *     Чего эта связка не ловит: что описание ВЕРНО по существу. Она держит наличие и охват, а не правдивость
 *     текста — расхождение слов с поведением ловят пробы самих сторожей. И перечень всё-таки ведётся рукой:
 *     «сторож» — понятие замысла, из кода его не извлечь; выигрыш в том, что рука теперь в одном месте и её
 *     забывчивость краснеет.
 * EN: THE LIST OF GUARDS — IN ONE PLACE, AND IT IS CHECKED AGAINST THE DESCRIPTION BY A PROBE (stand
 *     stend-opisaniya.mjs).
 *     Acceptance rule: for EVERY guard the README must have two columns — "🔴 ЧЕГО НЕ ЛОВИТ" (what it does NOT
 *     catch) and "🔴 ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ" (what its silence means). Today all three have them, but that is a
 *     state, not a structure: add a fourth and forget to describe it — the description will still LOOK
 *     complete, because it is silent about what is missing. Checking a list catches extras and is blind to
 *     omissions.
 *     So the list lives HERE, and the stand checks it against the README both ways: declared in code but not
 *     described — red (a guard without the mandatory columns); described with the columns but absent from code
 *     — red (a described guard that does not exist).
 *     The zagolovok field must match the README section heading text after "## " VERBATIM.
 *     What this pairing does not catch: that the description is TRUE in substance. It holds presence and
 *     coverage, not truthfulness — a mismatch between words and behaviour is caught by the guards' own probes.
 *     And the list is still maintained by hand: a "guard" is a design notion that cannot be extracted from
 *     code; the gain is that the hand is now in one place and its forgetfulness turns red.
 */
export const STOROZHA = Object.freeze([
  Object.freeze({ klyuch: 'opoveshchenie-o-szhatii', zagolovok: 'Сторож 1 — оповещение о сжатии' }),
  Object.freeze({ klyuch: 'stupeni-zapolneniya',     zagolovok: 'Сторож 2 — вторая ступень заполнения' }),
  Object.freeze({ klyuch: 'ohvat-sessij',            zagolovok: 'Охват: какие сессии сторож видел' }),
])

/**
 * RU: Обязательные колонки описания — тоже в одном месте: стенд и README ссылаются на них, а не хранят по
 *     копии. Копия разошлась бы молча при первой же правке формулировки.
 * EN: The mandatory description columns are also in one place: the stand and the README refer to them rather
 *     than keep their own copies. A copy would silently diverge at the first rewording.
 */
export const KOLONKI_OPISANIYA = Object.freeze(['🔴 ЧЕГО НЕ ЛОВИТ', '🔴 ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ'])

export const Config = Schema.object({
  // RU: Явный договор профиля о том, кто исполняет инструменты агента: 'sdk' — внешний SDK (например, агент за
  //     шлюзом подписки), 'dsh' — сама платформа, 'unknown' — не задано. Решается настройкой, а не догадкой по
  //     имени агента.
  //     От этого зависит, применима ли обрезка результатов инструментов (событие compaction/prune): у 'sdk' её
  //     не бывает по устройству, у 'dsh' она возможна. Без подтверждённой настройки сводка пишет «обрезка: не
  //     установлено», а не печатает ноль.
  // EN: An explicit profile contract about who executes the agent's tools: 'sdk' — an external SDK (e.g. an
  //     agent behind a subscription gateway), 'dsh' — the platform itself, 'unknown' — not set. Decided by
  //     configuration, not guessed from the agent name.
  //     It determines whether pruning of tool results (the compaction/prune event) is applicable: with 'sdk' it
  //     never happens by design, with 'dsh' it can. Without a confirmed setting the summary says "обрезка: не
  //     установлено" (prune: not established) instead of printing zero.
  ispolnenieInstrumentov: Schema.union(['sdk', 'dsh', 'unknown']).default('unknown'),
  /**
   * RU: komandaStoka — куда, кроме журнала, отдавать каждое оповещение: команда оболочки (/bin/sh -c), текст
   *     тревоги подаётся ей на stdin, предел 5 с. Пусто ('') — только журнал.
   *     УМОЛЧАНИЯ НЕТ НАМЕРЕННО. С `.default('')` «ключа в наборе нет» и «komandaStoka: '' написано намеренно»
   *     приходили бы одинаковой пустой строкой, и пакет не мог бы их различить по построению, а означают они
   *     противоположное: первое — упущение, второе — решение. Без умолчания «ключа нет» приходит как undefined,
   *     «ключ пустой» — как '' (проверено на живой схеме).
   *     Граница: различение держится, пока пустую строку пишут намеренно. Опечатка вида komandaStoka: '' будет
   *     названа решением — мы читаем набор, а не мысли того, кто его писал.
   *     Безопасность: команда исполняется с правами процесса агента; это доверенная настройка профиля,
   *     подставлять в неё внешний ввод нельзя.
   * EN: komandaStoka — where, besides the log, to send every notification: a shell command (/bin/sh -c), the
   *     alarm text is fed to it on stdin, 5 s timeout. Empty ('') — log only.
   *     THERE IS NO DEFAULT ON PURPOSE. With `.default('')`, "the key is absent from the settings" and
   *     "komandaStoka: '' written deliberately" would arrive as the same empty string and the package could not
   *     tell them apart by construction, while they mean opposite things: the first is an omission, the second
   *     a decision. Without a default, "key absent" arrives as undefined and "key empty" as '' (verified on the
   *     live schema).
   *     Boundary: the distinction holds as long as the empty string is written deliberately. A typo like
   *     komandaStoka: '' will be called a decision — we read the settings, not the mind of whoever wrote them.
   *     Security: the command runs with the agent process's privileges; it is a trusted profile setting, and
   *     external input must never be substituted into it.
   */
  komandaStoka: Schema.string(),
  /**
   * RU: stupeni — ступени тревоги по заполнению, доли ПОРОГА СЖАТИЯ (по умолчанию 0,85 и 0,9). Нудж
   *     (dsh-pamyat-nudzh) держит свою долю (0,8) отдельно и независимо.
   * EN: stupeni — fill alarm stages as shares of the COMPACTION THRESHOLD (default 0.85 and 0.9). The nudge
   *     package (dsh-pamyat-nudzh) keeps its own share (0.8) separately and independently.
   */
  stupeni: Schema.array(Schema.number()).default([0.85, 0.9]),
  /**
   * RU: trevogaSzhatiya — говорить ли владельцу о ЗАВЕРШЁННОМ сжатии (строка «🗜 …»). По умолчанию да; провал сжатия
   *     говорится всегда. Решение — за владельцем (вопрос 08.10.2026 00:03 МСК): одна строка в шаблоне реестра.
   * EN: trevogaSzhatiya — whether to tell the owner about a COMPLETED compaction (the "🗜 …" line). Default yes; a failed
   *     compaction is always reported. The owner decides (question 08.10.2026 00:03 MSK): one line in the registry template.
   */
  trevogaSzhatiya: Schema.boolean().default(true),
  /**
   * RU: predel — ЗАПАСНОЙ предел контекста в токенах. Основной источник — платформа (см. oknoModeli): она
   *     объявляет окно вместе с маршрутом модели. Это число берётся, только если платформа окна не назвала, и в
   *     строке тревоги честно помечается «платформой не подтверждено». 0 — доли нет вовсе, и это говорится
   *     вслух.
   * EN: predel — a FALLBACK context limit in tokens. The primary source is the platform (see oknoModeli): it
   *     announces the window together with the model route. This number is used only if the platform has not
   *     named a window, and the alarm line honestly marks it "not confirmed by the platform". 0 — no share at
   *     all, and that is said aloud.
   */
  predel: Schema.number().default(0),
  /**
   * RU: agent — имя агента для строки тревоги и ключ стража одиночного монтажа. Умолчания-имени нет намеренно:
   *     угадать агента изнутри нечем, а подставить чужое имя — значит уверенно ответить не про тот узел. Пусто
   *     — в строке стоит «агент НЕ НАЗВАН», а не тишина.
   * EN: agent — the agent name for the alarm line and the key of the single-mount guard. There is deliberately
   *     no default name: there is nothing inside to guess the agent from, and substituting someone else's name
   *     means confidently answering about the wrong node. Empty — the line says "агент НЕ НАЗВАН" (agent NOT
   *     NAMED), not silence.
   */
  agent: Schema.string().default(''),
})

/**
 * RU: Окно контекста берётся У ПЛАТФОРМЫ, а не числом в настройке.
 *     Почему не константа: число в настройке описывает модель на момент записи. Сменят модель — окно станет
 *     другим, а число останется прежним и разойдётся МОЛЧА: ступень 85% посчитается от чужой ёмкости и будет то
 *     ранней, то поздней. Платформа же объявляет окно вместе с маршрутом (событие request/context, поле
 *     contextWindow), и session.requestContext() отдаёт последнее известное.
 *     Граница: поле необязательное («when advertised» в объявлении платформы). Значит «окна нет» — законное
 *     состояние модели, а не поломка, и оно отличается от «спросить не смогли» (это уже про нас). Оба случая
 *     возвращают est: false, но с РАЗНОЙ причиной (prichina), потому что чинить их надо по-разному.
 * EN: The context window is taken FROM THE PLATFORM, not as a number in the settings.
 *     Why not a constant: a configured number describes the model at the time of writing. Change the model and
 *     the window changes while the number stays and diverges SILENTLY: the 85% stage would be computed from
 *     someone else's capacity and fire now too early, now too late. The platform, however, announces the window
 *     together with the route (event request/context, field contextWindow), and session.requestContext()
 *     returns the latest known one.
 *     Boundary: the field is optional ("when advertised" in the platform declaration). So "no window" is a
 *     legitimate state of the model, not a breakage, and it differs from "could not ask" (that one is about
 *     us). Both return est: false but with a DIFFERENT reason (prichina), because they are fixed differently.
 */
function oknoModeli(session) {
  let rc
  try {
    if (typeof session?.requestContext !== 'function') {
      return { est: false, prichina: 'у сессии нет requestContext() — спросить платформу нечем' }
    }
    rc = session.requestContext()
  } catch (e) {
    return { est: false, prichina: `спросить платформу не смог: ${e?.message ?? e}` }
  }
  if (!rc) return { est: false, prichina: 'платформа маршрута ещё не объявила (request/context не было)' }
  const w = rc.contextWindow
  if (!Number.isInteger(w) || w <= 0) {
    return { est: false, model: rc.model, provider: rc.provider,
             prichina: `модель ${rc.model ?? '?'} окна НЕ объявила (поле необязательное)` }
  }
  return { est: true, tokenov: w, model: rc.model, provider: rc.provider }
}

// RU: Что РЕШАЕТ исход у каждой тревоги. Список написан до кода, чтобы не повторить класс «данные собраны и не
//     участвуют в вердикте» (прибор печатает величину, а решает по другой):
//     тревога «сжатие»   — решает: тип события compaction/end без поля error. Справочно (на решение не влияют):
//     расход, модель, длительность, вытесненный объём.
//     тревога «обрезка»  — решает: тип compaction/prune. Справочно: вытеснено токенов, число узлов.
//     тревога «провал»   — решает: наличие error в данных compaction/end. Справочно: текст ошибки.
//     тревога «ступень»  — решают ДВЕ величины: доля занятого от базы (порог сжатия или окно) и то, что эта
//     ступень ещё не отдана в этой сессии. Справочно: числа в скобках.
//     отказ стока        — решает: исключение при запуске команды стока. Справочно: его текст.
//     Следствие, названное вслух: расход «не сообщён» тревоги НЕ поднимает и не должен — это свойство данных
//     провайдера, а не беда памяти. Если однажды понадобится кричать на него, это будет НОВАЯ тревога со своим
//     решающим признаком.
// EN: What DECIDES the outcome of each alarm. The list is written before the code so as not to repeat the class
//     "data is collected but takes no part in the verdict" (a tool prints one quantity and decides by another):
//     "compaction" alarm — decided by: event type compaction/end without an error field. For reference only (no
//     effect on the decision): spend, model, duration, shadowed volume.
//     "prune" alarm      — decided by: type compaction/prune. For reference: tokens shadowed, number of nodes.
//     "failure" alarm    — decided by: presence of error in compaction/end data. For reference: the error text.
//     "stage" alarm      — decided by TWO quantities: the occupied share of the base (compaction threshold or
//     window) and that this stage has not yet been reported in this session. For reference: the numbers in
//     brackets.
//     sink failure       — decided by: an exception while running the sink command. For reference: its text.
//     A consequence stated aloud: spend "not reported" does NOT raise an alarm and must not — it is a property
//     of provider data, not a memory problem. Should we ever want to alert on it, that will be a NEW alarm with
//     its own deciding signal.
/**
 * RU: dolyaPoroga — доля и номинальный порог сжатия для агента и маршрута: { dolya, porog, okno, model,
 *     provider, routeSource } либо { prichina } при отказе.
 * EN: dolyaPoroga — compaction ratio and nominal threshold for the agent and route: { dolya, porog, okno,
 *     model, provider, routeSource }, or { prichina } on failure.
 */
// RU: Ступени считаются ОТ ПОРОГА СЖАТИЯ, а не от окна — как показывает команда статуса сжатия (100% =
//     floor(окно × доля)) и как считает внешний сторож сжатия. Так «90%» в тревоге означает «до сжатия осталось
//     10%», а не «окно почти полно».
//     Доля и порог берутся готовыми из файла порогов агента (функция chitatPorogD соседнего пакета
//     dsh-pamyat-kompakt, имя агента — переменная окружения KOMPAKT_AGENT, маршрут — провайдер и модель
//     текущего запроса). Профили и пресеты здесь не читаются и ничего не пересчитывается: одно правило на всех
//     потребителей порога.
//     Не прочиталось — возвращается причина (поле prichina), и ступени считаются от окна с пометкой в строке
//     тревоги.
//     Первый параметр dom сейчас не используется (остался от прежнего правила, читавшего каталог агента);
//     сохранён ради совместимости вызовов.
// EN: Stages are counted FROM THE COMPACTION THRESHOLD, not from the window — the same way the compaction
//     status command shows it (100% = floor(window × ratio)) and the external compaction watcher counts it. So
//     "90%" in an alarm means "10% left before compaction", not "the window is almost full".
//     The ratio and threshold are taken ready-made from the agent's threshold file (function chitatPorogD of
//     the sibling package dsh-pamyat-kompakt; the agent name is the KOMPAKT_AGENT environment variable, the
//     route is the provider and model of the current request). No profiles or presets are read here and nothing
//     is recomputed: one rule for every consumer of the threshold.
//     If it cannot be read, a reason is returned (field prichina) and stages are counted from the window,
//     marked as such in the alarm line.
//     The first parameter dom is currently unused (left over from an earlier rule that read the agent
//     directory); kept for call compatibility.
export function dolyaPoroga(dom, route = null) {
  const p = chitatPorogD(process.env.KOMPAKT_AGENT, route);
  return p.prichina ? p : { dolya: p.ratio, porog: p.nominalThreshold, okno: p.window,
    model: p.model, provider: p.provider, routeSource: p.routeSource };
}
// RU: Числа — в единицах владельца, как у внешнего сторожа сжатия: «890 000», «93,0%». Порог ступени — целым
//     числом с округлением вверх, как у того же сторожа, чтобы оба называли одну и ту же границу.
// EN: Numbers in the owner's units, the same as the external compaction watcher: "890 000", "93,0%". A stage
//     threshold is an integer rounded up, as in that watcher, so both name the same boundary.
const ruChislo = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const ruProc = (a, b) => (100 * a / b).toFixed(1).replace('.', ',') + '%'
// RU: Строка ВЛАДЕЛЬЦУ — коротко (слово владельца 07.10.2026 23:34/23:51 и 08.10 00:08 МСК): имя по-человечески, число, без
//     служебных оговорок. Полная строка с источниками и пометками остаётся в ЖУРНАЛЕ (krik) — для разбора.
// EN: The line for the OWNER is short (owner's word 07.10.2026 23:34/23:51 and 08.10 00:08 MSK): a human name, a number, no
//     service caveats. The full line with sources and marks stays in the LOG (krik) — for analysis.
const IMENA = { iskra: 'Искра', zarya: 'Заря', avrora: 'Аврора', spartak: 'Спартак', varvara: 'Варвара', alfa: 'Альфа',
  beta: 'Бета', gamma: 'Гамма', marc: 'Марк', petrovich: 'Петрович' }
const imyaVladelcu = (config) => IMENA[config.agent] ?? config.agent ?? 'агент не назван'
const tys = (n) => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace('.', ',') + ' млн' : ruChislo(Math.round(n / 1000)) + ' тыс.'
const sekundy = (ms) => { const c = Math.round(ms / 1000); return c < 60 ? `${c} с` : `${Math.floor(c / 60)} мин ${c % 60} с` }
const porogStupeni = (baza, st) => Math.floor((baza * Math.round(st * 100) + 99) / 100)
// RU: ОТДАННЫЕ СТУПЕНИ ХРАНЯТСЯ НА ДИСКЕ, по сессиям, с рубежом сжатия. Прежде это был Set в памяти процесса, и
//     каждый перезапуск службы при высоком заполнении кричал заново (три подъёма за утро — три одинаковые
//     тревоги).
//     Файл — $DSH_HOME/storages/storozha-stupeni.json (или путь из STOROZHA_STUPENI_FAJL — для стендов). Формат
//     { v: 1, sessii: { <id сессии>: { otdany: [доли], rubezh, kogda } } }. Запись — во временный файл и
//     rename, чтобы обрыв не оставил половину JSON. Сброс — на compaction/summary или compaction/prune ЭТОЙ
//     сессии.
//     Чего не ловит: сжатие, прошедшее, пока модуль не был загружен. На это есть запасной сброс: если доля
//     упала ниже отданной ступени больше чем на 0,10 — ступень считается снова не отданной.
//     Нет ни DSH_HOME, ни STOROZHA_STUPENI_FAJL — ступени живут только в памяти процесса, и подъём об этом
//     говорит.
// EN: REPORTED STAGES ARE STORED ON DISK, per session, together with the compaction boundary. Previously it was
//     a Set in process memory, and every service restart at high fill alerted again (three restarts in a
//     morning — three identical alarms).
//     File: $DSH_HOME/storages/storozha-stupeni.json (or the path from STOROZHA_STUPENI_FAJL — for test
//     stands). Format { v: 1, sessii: { <session id>: { otdany: [ratios], rubezh, kogda } } }. Written to a
//     temporary file and renamed, so an interruption never leaves half a JSON. Reset on compaction/summary or
//     compaction/prune of THIS session.
//     Not caught: a compaction that happened while the module was not loaded. For that there is a fallback
//     reset: if the share dropped below a reported stage by more than 0.10, the stage counts as not reported
//     again.
//     With neither DSH_HOME nor STOROZHA_STUPENI_FAJL, stages live only in process memory, and the start-up
//     line says so.
const fajlStupenej = () => process.env.STOROZHA_STUPENI_FAJL
  || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'storages', 'storozha-stupeni.json') : null)
function prochestStupeni(put) {
  if (!put) return { sessii: {}, beda: 'DSH_HOME не задан — ступени только в памяти процесса, подъём их сбросит' }
  if (!existsSync(put)) return { sessii: {} }
  try {
    const d = JSON.parse(readFileSync(put, 'utf8'))
    if (d?.v !== 1 || typeof d.sessii !== 'object' || d.sessii === null) throw new Error('не тот формат')
    return { sessii: d.sessii }
  } catch (e) { return { sessii: {}, beda: `${put} не прочитан (${e?.message ?? e}) — начинаю с пустого, возможен повторный крик` } }
}
function zapisatStupeni(put, sessii) {
  if (!put) return null
  try {
    const vr = `${put}.${process.pid}.tmp`
    writeFileSync(vr, JSON.stringify({ v: 1, sessii }, null, 1))
    renameSync(vr, put)
    return null
  } catch (e) { return `${put} не записан (${e?.message ?? e})` }
}

// RU: Сколько молчания сессии считать поводом сказать: час. Это не тревога, а пометка «МОЛЧИТ N мин» у сессии в
//     строке охвата сводки. Сессия прежнего разговора (после /new, в архиве платформы) молчит законно и такой
//     пометки не получает.
// EN: How much silence of a session counts as worth mentioning: one hour. This is not an alarm but a "МОЛЧИТ N
//     мин" (silent N min) mark next to the session in the coverage line of the summary. A session of a previous
//     conversation (after /new, archived by the platform) is legitimately silent and gets no such mark.
const MOLCHIT_MS = 60 * 60 * 1000;
const PREDEL_SESSIJ = 128;
function ogranichitStupeni(sessii) {
  const names = Object.keys(sessii);
  if (names.length <= PREDEL_SESSIJ) return;
  names.sort((a, b) => (Date.parse(sessii[a]?.kogda) || 0) - (Date.parse(sessii[b]?.kogda) || 0));
  for (const sid of names.slice(0, Math.max(0, names.length - PREDEL_SESSIJ))) delete sessii[sid];
}

// RU: СТРАЖ ОДИНОЧНОГО МОНТАЖА. Пакет лежит в общем каталоге плагинов, и на него могут ссылаться несколько
//     профилей ОДНОГО процесса. Каждая ссылка — свой apply, и обработчики session/event регистрировались бы
//     заново: в журнале было два-три голоса подъёма на один подъём, а при трёх монтажах каждая тревога
//     печаталась бы трижды (сам счёт внутри сообщения при этом верен — дублируется сообщение). Устройство взято
//     у соседнего пакета: счётчик по ключу, повторный заход пропускается.
//     Ключ — ИМЯ АГЕНТА из настроек (config.agent), а не объект ctx. Первая редакция ключевала по самому ctx
//     (WeakSet) в расчёте, что повторный монтаж даёт тот же объект, — но платформа даёт КАЖДОМУ монтажу свой
//     ctx внутри одного процесса, и проверка не срабатывала ни разу. Ошибочной была и граница в тексте («не
//     спасает от разных процессов»): беда была в одном процессе.
//     Граница: страж живёт в памяти процесса. Два РАЗНЫХ процесса со своими событиями — законные два голоса, их
//     он не трогает.
//     Цена ключа по имени: агент без имени даёт ключ '' — два безымянных агента в одном процессе схлопнутся в
//     один, и у второго сторож молча не встанет. Поэтому настройку agent надо задавать всегда.
//     ПЕЧАТЬ ЖУРНАЛЬНОЙ СТРОКИ — ОДНА ТОЧКА НА ВЕСЬ ПАКЕТ (функция pechat). Правило «каждая строка называет
//     версию» однажды починили по экземплярам — переписали существовавшие вызовы, — и строка, добавленная
//     позже, родилась без версии заново, прямо под предупреждением в шапке файла. Предупреждение в тексте руку
//     не удерживает; удерживает устройство: имя и версию приставляет эта функция, и мимо неё в журнал не пишет
//     никто.
//     Граница первая: это про строки ЭТОГО пакета; соседние пакеты печатают своими руками.
//     Граница вторая: отказ печати глушится намеренно — монтаж сторожа важнее строки о монтаже, падать из-за
//     журнала нельзя. Цена названа: сломанный логгер даст ТИШИНУ, а тишина неотличима от «не звали».
// EN: SINGLE-MOUNT GUARD. The package lives in a shared plugin directory and several profiles of ONE process
//     may reference it. Each reference is its own apply, and session/event handlers would be registered again:
//     the log had two or three start-up lines per start, and with three mounts every alarm would be printed
//     three times (the count inside the message stays correct — the message itself is duplicated). The design
//     is borrowed from a sibling package: a counter by key, a repeated entry is skipped.
//     The key is the AGENT NAME from the settings (config.agent), not the ctx object. The first version keyed
//     on ctx itself (a WeakSet), assuming a repeated mount passes the same object — but the platform gives EACH
//     mount its own ctx inside one process, and the check never fired. The boundary in the text was wrong too
//     ("does not protect against different processes"): the trouble was within one process.
//     Boundary: the guard lives in process memory. Two DIFFERENT processes with their own events are two
//     legitimate voices; it does not touch them.
//     Price of a name key: an agent without a name gives the key '' — two nameless agents in one process
//     collapse into one, and the second one's guard silently does not start. So the agent setting should always
//     be set.
//     PRINTING A LOG LINE — ONE POINT FOR THE WHOLE PACKAGE (function pechat). The rule "every line names the
//     version" was once fixed instance by instance — existing calls were rewritten — and a line added later was
//     born without the version again, right under the warning at the top of the file. A warning in text does
//     not hold the hand; the structure does: this function adds the name and version, and nobody writes to the
//     log bypassing it.
//     Boundary one: this concerns lines of THIS package; sibling packages print with their own hands.
//     Boundary two: a print failure is swallowed on purpose — mounting the guard matters more than the line
//     about it, and the log must not crash us. The price is named: a broken logger yields SILENCE, and silence
//     is indistinguishable from "never called".
const pechat = (ctx, s) => {
  const stroka = `[${name} ${versiya}] ${s}`
  try { if (typeof ctx?.logger?.info === 'function') ctx.logger.info(stroka); else console.log(stroka) }
  catch { try { console.log(stroka) } catch { /* RU: некуда сказать — работа важнее строки · EN: nowhere to report — the work matters more than the line */ } }
}

const smontirovano = new Set();

export function apply(ctx, config) {
  const klyuchMontazha = String(config?.agent ?? '');
  if (smontirovano.has(klyuchMontazha)) {
    // RU: Строка о пропуске второго монтажа. Однажды она молчала в работе, хотя комментарий над ней обещал
    //     обратное: вызов шёл через ctx.logger?.info?.(…) без запасного пути, у второго и третьего ctx логгера
    //     не было, `?.` давал undefined без исключения — строка не печаталась никуда, и молча. Теперь печать
    //     идёт через pechat() с запасным console.log: путь наружу есть всегда.
    //     Эта же строка — РАЗЛИЧИТЕЛЬ двух гипотез, иначе неразличимых по журналу: (а) apply позван трижды, два
    //     отсечены стражем → строк «пропущен» две; (б) apply позван однажды, страж ни при чём → строк ноль.
    //     Счёт подъёмов «было 3, стало 1» согласуется с обеими; пока строка молчала, «страж работает» было
    //     выводом, а не замером.
    //     Имя и версию приставляет pechat(): прежде тут стоял свой литерал с именем пакета без номера —
    //     единственный такой в пакете.
    // EN: The line about skipping the second mount. Once it was silent in production although the comment above
    //     it promised the opposite: the call went through ctx.logger?.info?.(…) with no fallback, the second
    //     and third ctx had no logger, `?.` gave undefined without an exception — the line was printed nowhere,
    //     silently. Now printing goes through pechat() with a console.log fallback: there is always a way out.
    //     The same line DISTINGUISHES two hypotheses otherwise indistinguishable in the log: (a) apply called
    //     three times, two cut off by the guard → two "пропущен" (skipped) lines; (b) apply called once, the
    //     guard irrelevant → zero lines. A start-up count "was 3, became 1" agrees with both; while the line
    //     was silent, "the guard works" was an inference, not a measurement.
    //     pechat() adds the name and version: previously there was a literal with the package name and no
    //     number — the only one in the package.
    pechat(ctx, 'сторож уже смонтирован — второй монтаж пропущен');
    return;
  }
  smontirovano.add(klyuchMontazha);
  // RU: КЛЮЧ СНИМАЕТСЯ ПРИ ВЫГРУЗКЕ — иначе защита становится вредом. Ключ по имени живёт до конца процесса,
  //     тогда как ключ-ctx умирал вместе с ctx. Без снятия переподнятие плагина в ТОМ ЖЕ процессе (платформа
  //     умеет выгрузить и смонтировать заново) было бы молча пропущено, и сторож не встал бы вовсе — тот самый
  //     вред, от которого страж бережёт.
  //     Снятие висит на ctx.effect: очистка попадает в _disposables этого волокна cordis, и её зовёт выгрузка
  //     (_unload). Прежде снятие висело на ctx.on('dispose') — события, которого в cordis 4.0.1 нет вовсе: опыт
  //     на настоящем cordis «монтаж → fiber.dispose() → монтаж» дал «второй монтаж пропущен» и ноль живых
  //     сторожей.
  //     «Вернуть функцию очистки из apply» здесь НЕ годится: apply объявлен как function и имеет prototype,
  //     cordis считает его классом и зовёт `new apply(ctx, config)`, а из результата берёт только
  //     [symbols.init] — возвращённое выбрасывается (проверено стендом stend-vygruzki.mjs, проба П5).
  //     У подставного ctx стенда может не быть effect — тогда снимать нечего, монтаж важнее.
  // EN: THE KEY IS REMOVED ON UNLOAD — otherwise the protection turns into harm. A name key lives until the
  //     process ends, whereas a ctx key died with its ctx. Without removal, re-mounting the plugin in the SAME
  //     process (the platform can unload and mount again) would be silently skipped and the guard would not
  //     start at all — the very harm the guard protects against.
  //     Removal hangs on ctx.effect: the cleanup goes into the _disposables of this cordis fiber, and unloading
  //     (_unload) calls it. Previously removal hung on ctx.on('dispose') — an event cordis 4.0.1 does not have
  //     at all: an experiment on real cordis "mount → fiber.dispose() → mount" gave "второй монтаж пропущен"
  //     (second mount skipped) and zero live guards.
  //     "Return a cleanup function from apply" does NOT work here: apply is declared as a function and has a
  //     prototype, cordis treats it as a class and calls `new apply(ctx, config)`, taking only [symbols.init]
  //     from the result — the returned value is thrown away (verified by stend-vygruzki.mjs, probe П5).
  //     A stand's fake ctx may lack effect — then there is nothing to remove, and mounting matters more.
  try { ctx.effect?.(() => () => { smontirovano.delete(klyuchMontazha); }); }
  catch { /* RU: подставной ctx может не знать effect — монтаж важнее подписки · EN: a fake ctx may lack effect — mounting matters more than the subscription */ }
  const krik = (s) => pechat(ctx, s)   // RU: вся печать пакета идёт через pechat(), см. довод там · EN: all printing of the package goes through pechat(), see the reasoning there

  const putStupenej = fajlStupenej()
  const zagruzka = prochestStupeni(putStupenej)
  const sessiiStupenej = zagruzka.sessii   // RU: id сессии → { otdany: [доли], rubezh, kogda } · EN: session id → { otdany: [ratios], rubezh, kogda }
  let skazanoOZapisi = false
  const dpPodyom = dolyaPoroga(process.env.DSH_HOME)
  krik(`подъём: ступени ${JSON.stringify(config.stupeni)} ОТ ПОРОГА СЖАТИЯ (доля — на каждом замере; сейчас `
     + (dpPodyom.dolya ? `${dpPodyom.dolya}` : `НЕ ПРОЧИТАНА: ${dpPodyom.prichina} — буду считать от окна`) + ')'
     + ` · отданные ступени: ${putStupenej ?? 'только память'}${zagruzka.beda ? ` ⚠️ ${zagruzka.beda}` : `, сессий ${Object.keys(sessiiStupenej).length}`}`
     + ` · окно контекста спрашивается У ПЛАТФОРМЫ в момент каждого замера`
     + ` (запасное число в настройке: ${config.predel || 'нет'})`
     + ` · агент ${config.agent || 'НЕ НАЗВАН (настройка agent пуста)'}`
     // RU: Состояние стока называется ТРЕМЯ словами, потому что у него три разных значения: «задан» (тревоги
     //     уйдут ещё и во внешнюю команду); «ВЫКЛЮЧЕН намеренно» — в наборе написано komandaStoka: '' (решение:
     //     только журнал); «НЕ ЗАДАН — ключа нет в наборе» (похоже на упущение).
     //     Прежде схема ставила умолчанием пустую строку, и «ключа нет» и «пусто намеренно» приходили сюда
     //     одинаково; строка подъёма говорила «НЕ задан», то есть называла упущение там, где стояло решение, и
     //     аудитор завёл тревогу на намеренно выключенный сток. С тех пор у komandaStoka в схеме НЕТ умолчания
     //     (см. Config выше): отсутствующий ключ приходит как undefined, пустой — как ''.
     // EN: The sink state is named with THREE words because it has three distinct meanings: "задан" (set —
     //     alarms also go to the external command); "ВЫКЛЮЧЕН намеренно" (switched off on purpose) — the
     //     settings contain komandaStoka: '' (a decision: log only); "НЕ ЗАДАН — ключа нет в наборе" (not set —
     //     the key is absent; looks like an omission).
     //     Previously the schema used an empty string as the default, so "key absent" and "empty on purpose"
     //     arrived here identically; the start-up line said "not set", naming an omission where a decision
     //     stood, and an auditor raised an alarm about a deliberately disabled sink. Since then komandaStoka
     //     has NO default in the schema (see Config above): a missing key arrives as undefined, an empty one as
     //     ''.
     + ` · сток ${config.komandaStoka ? 'задан'
        : config.komandaStoka === undefined ? 'НЕ ЗАДАН — ключа нет в наборе (похоже на упущение)'
        : 'ВЫКЛЮЧЕН намеренно (komandaStoka пуст) — тревога только в журнал'}`)

  // RU: ОДНО ОПОВЕЩЕНИЕ ПОВЕРХ, А НЕ ПО СЛУШАТЕЛЮ НА СОБЫТИЕ. События сжатия на узле уже слушают несколько
  //     пакетов памяти (бюджет, нудж, восстановление, секретарь). Ещё один слушатель, кричащий своё отдельно на
  //     каждое событие, дал бы на одно сжатие пачку сообщений — и первый же шумный день научит их не читать.
  //     Поэтому сторож даёт ОДНУ строку на завершённое сжатие.
  //     Объявление pechatSvodki стоит выше обоих обработчиков намеренно: `let` не поднимается, и вызов из
  //     обработчика, зарегистрированного раньше объявления, упал бы по временной мёртвой зоне (такая авария уже
  //     роняла соседний сторож при чистой грамматике). Здесь ссылка-заглушка, настоящая сводка подставляется
  //     ниже, когда svodkaStorozha объявлена; до того печать молчит.
  // EN: ONE NOTIFICATION ON TOP, NOT A LISTENER PER EVENT. Several memory packages already listen to compaction
  //     events on the node (budget, nudge, restore, secretary). One more listener shouting separately on each
  //     event would give a batch of messages per compaction — and the first noisy day teaches people not to
  //     read them. So the guard gives ONE line per finished compaction.
  //     The declaration of pechatSvodki stands above both handlers on purpose: `let` is not hoisted, and a call
  //     from a handler registered before the declaration would fail in the temporal dead zone (such a crash
  //     already brought down a sibling watcher with perfectly valid syntax). Here it is a stub; the real
  //     summary is assigned below once svodkaStorozha is declared; until then printing is silent.
  let pechatSvodki = () => {}

  const nachala = new Map()   // RU: compactionId → { ms, do } · EN: compactionId → { ms, do }
  const ozhidayut = new Map() // RU: сессия → сжатие, ждущее замера «после» · EN: session → compaction awaiting the "after" measurement
  ctx.effect?.(() => () => {
    for (const oz of ozhidayut.values()) clearTimeout(oz.tajmer)
    ozhidayut.clear()
  })
  const skazatSzhatie = (sid, posle) => {
    const oz = ozhidayut.get(sid); if (!oz) return
    clearTimeout(oz.tajmer); ozhidayut.delete(sid)
    const skolko = oz.do && posle ? `${ruChislo(Math.round(oz.do / 1000))} → ${tys(posle)}`
      : oz.do ? `с ${tys(oz.do)}` : posle ? `→ ${tys(posle)}` : ''
    const chasti = [`🗜 ${imyaVladelcu(config)}: сжатие${oz.ruka ? ' по команде' : ''}${skolko ? ' ' + skolko : ''}`]
    if (oz.zn !== null && oz.zn !== undefined) chasti.push(`сводка ${oz.zn >= 1000 ? tys(oz.zn) + ' зн.' : oz.zn + ' зн.'}`)
    if (oz.d !== null && oz.d !== undefined) chasti.push(sekundy(oz.d))
    if (oz.model) chasti.push(oz.model)
    vStok(krik, config, chasti.join(' · '))
  }
  const svodki = new Map()    // RU: compactionId → data события summary · EN: compactionId → data of the summary event

  ctx.on('session/event', (session, event) => {
    const t = event?.type
    if (t !== 'compaction/start' && t !== 'compaction/summary'
        && t !== 'compaction/end' && t !== 'compaction/prune') return

    const id = event?.data?.compactionId ?? null
    // RU: ПОЛЕ ВРЕМЕНИ НАЗЫВАЕТСЯ `time`, А НЕ `timestamp`. Объявление платформы: SessionEvent = { type, seq,
    //     time, data }, time — миллисекунды Unix (dsh-session, lib/types/types.d.ts). Первая редакция читала
    //     `timestamp` — имя, придуманное из головы, — и стенд этого не ловил, потому что подставные события
    //     писались тем же выдуманным именем: проба стерегла выдумку. Цена: длительность была «не измерима» у
    //     ВСЕХ сжатий и в работе тоже (прогон по живому журналу: 27 сжатий, длительности нет ни у одного).
    //     Нашёл это прогон на живом журнале, а не стенд.
    //     `timestamp` оставлен запасным на случай чужого источника событий, но первым спрашивается объявленное
    //     имя.
    //     Граница разбора, найденная порчей: `Date.parse('1000')` даёт ГОДНУЮ дату тысячного года — строка
    //     неожиданной формы превратилась бы не в «не измерима», а в мусорную длительность (в пробе вышло 94 670
    //     812 800 с). Поэтому разобранное время проверяется на разумность: раньше 2020 года событий быть не
    //     может.
    // EN: THE TIME FIELD IS CALLED `time`, NOT `timestamp`. The platform declaration: SessionEvent = { type,
    //     seq, time, data }, time in Unix milliseconds (dsh-session, lib/types/types.d.ts). The first version
    //     read `timestamp` — a name invented from memory — and the stand did not catch it, because the fake
    //     events were written with the same invented name: the probe guarded a fiction. The price: duration was
    //     "not measurable" for ALL compactions, in production too (a run over a live journal: 27 compactions,
    //     not one with a duration). A run over a live journal found it, not the stand.
    //     `timestamp` is kept as a fallback for a foreign event source, but the declared name is asked first.
    //     A parsing boundary found by deliberate breakage: `Date.parse('1000')` returns a VALID date in the
    //     year 1000 — a string of unexpected form would turn not into "not measurable" but into a garbage
    //     duration (the probe gave 94 670 812 800 s). So the parsed time is checked for sanity: events before
    //     2020 cannot exist.
    const razumno = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 1577836800000 ? x : null)
    const ms = razumno(event?.time)
           ?? razumno(event?.timestamp)
           ?? razumno(Date.parse(event?.time ?? event?.timestamp ?? ''))

    if (t === 'compaction/start') { if (id) nachala.set(id, { ms, do: vzyato || null }); return }   // «до» — до сброса vzyato на summary
    if (t === 'compaction/summary') { if (id) svodki.set(id, event.data); return }

    // RU: ОБРЕЗКА — ОТДЕЛЬНЫЙ ВИД, А НЕ «СЖАТИЕ ПОДЕШЕВЛЕ». У неё нет ни модели, ни расхода: замена старых
    //     результатов инструментов идёт без вызова модели. Складывать её со сводочными сжатиями в одно число
    //     «сжатий было N» значит сложить несравнимое.
    // EN: PRUNE IS A SEPARATE KIND, NOT "A CHEAPER COMPACTION". It has neither a model nor spend: old tool
    //     results are replaced without calling a model. Adding it to summary compactions in one number "N
    //     compactions" would add incomparable things.
    if (t === 'compaction/prune') {
      schet.obrezok++
      otdat(krik, config, `ОБРЕЗКА без модели: вытеснено ${event.data?.shadowedTokenCount ?? '?'} ток.`
        + ` · узлов ${event.data?.shadowedSeqs?.length ?? '?'} · расхода нет ПО ПРИРОДЕ (модель не звалась)`
        + ` · id ${id ?? 'нет (обрезка его не несёт)'}`)
      pechatSvodki()
      return
    }

    // RU: Дальше — только compaction/end: провал или успешное сжатие.
    // EN: From here on — only compaction/end: a failure or a successful compaction.
    const vid = vidKonca(event.data)
    if (vid === 'proval') {
      schet.provalov++
      otdat(krik, config, `🔴 ПОПЫТКА СЖАТИЯ ПРОВАЛИЛАСЬ: ${event.data?.error}`
        + ` · история НЕ урезана, сводки нет · id ${id ?? '?'}`)
      nachala.delete(id); svodki.delete(id)
      pechatSvodki()
      return
    }

    const svodka = svodki.get(id)
    // RU: ДЛИНА СВОДКИ (выход) — в знаках текста сводки, а не затенённого. Вход меряется токенами
    //     (shadowedTokenCount), выход — знаками; единицы названы в строке и не смешиваются. Сводка бывает
    //     строкой или массивом блоков { text }.
    // EN: SUMMARY LENGTH (output) is in characters of the summary text, not of the shadowed part. Input is
    //     measured in tokens (shadowedTokenCount), output in characters; the units are named in the line and
    //     never mixed. A summary is either a string or an array of { text } blocks.
    const dlinaSvodki = (s) => {
      if (!s) return null;
      if (typeof s === 'string') return s.length;
      if (Array.isArray(s)) return s.reduce((n, b) => n + (typeof b?.text === 'string' ? b.text.length : 0), 0);
      return null;
    };
    const svodkaVyshlo = dlinaSvodki(svodka?.summary);
    const marshrut = oknoModeli(session)
    const r = rashod(svodka?.usage)
    const d = dlitelnost(nachala.get(id)?.ms, ms)
    if (vid === 'prinuditelnoe') schet.prinuditelnyh++; else schet.estestvennyh++
    if (!r.est) schet.bezRashoda++
    if (d === null) schet.bezDliny++

    const polnyj = (
      `сжатие ${vid === 'prinuditelnoe' ? 'ПРИНУДИТЕЛЬНОЕ (команда человека)' : 'естественное'}`
      + ` · вытеснено ${svodka?.shadowedTokenCount ?? 'неизвестно'} ток. (вход)`
      + ` · сводка вышло ${svodkaVyshlo === null ? 'НЕ измерено' : svodkaVyshlo + ' зн.'}`
      + ` · дистилляция: сторож её НЕ наблюдает (асинхронный процесс секретаря, не событие платформы) — позвана/итог печатает сам секретарь`
      // RU: ИСТОЧНИК РАСХОДА НАЗВАН В САМОЙ СТРОКЕ. Сторож читает usage СОБЫТИЯ ПЛАТФОРМЫ; расход своего вызова
      //     печатает сам пакет сводки (dsh-pamyat-kompakt) из ответа провайдера, и в событие платформы тот не
      //     попадает. Без названного источника «НЕ СООБЩЁН» читается как утверждение о ПРЕДМЕТЕ и гасит поиск:
      //     однажды обе строки стояли в журнале об одном сжатии, и измеренная величина лежала тремя строками
      //     выше. Отрицание без названной области читается шире, чем измерено, и вопроса «откуда» не вызывает —
      //     в отличие от числа.
      // EN: THE SOURCE OF SPEND IS NAMED IN THE LINE ITSELF. The guard reads the usage of the PLATFORM EVENT;
      //     the spend of its own call is printed by the summary package (dsh-pamyat-kompakt) from the provider
      //     response, and that never reaches the platform event. Without a named source "НЕ СООБЩЁН" (not
      //     reported) reads as a statement about the SUBJECT and stops the search: once both lines stood in the
      //     log about the same compaction, and the measured value was three lines above. A negation without a
      //     named scope reads wider than what was measured and, unlike a number, provokes no "from where?"
      //     question.
      + ` · расход ${r.est ? r.vsego + ' ток.'
          : 'НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ (поле usage; это не ноль)'
            + ' — расход своего вызова печатает сам kompakt'}`
      + ` · модель ${svodka?.model ?? 'не названа'}`
      + ` · длительность ${d === null ? 'не измерима (нет метки начала)' : (d / 1000).toFixed(1) + ' с'
          + ' — между ЗАПИСЯМИ В ЖУРНАЛ, не работа модели'}`
      // RU: id сжатия — чтобы строку можно было сшить с журналом сессии. Провайдер берётся из МАРШРУТА СЕЙЧАС,
      //     и это помечено: сжатие могло идти другим маршрутом, если маршрут сменили между делом.
      // EN: The compaction id lets the line be matched with the session journal. The provider is taken from the
      //     route AS OF NOW, and that is marked: the compaction may have used a different route if it was
      //     changed in between.
      + ` · id ${id ?? 'нет'}`
      + ` · маршрут сейчас ${marshrut.provider ?? 'не объявлен'}`
      + ` (маршрут НА МОМЕНТ ЧТЕНИЯ, не обязательно тот, которым сжимали)`)
    // RU: ЖУРНАЛ — СРАЗУ, ВЛАДЕЛЬЦУ — ОДНА КОРОТКАЯ СТРОКА С ЗАПОЛНЕНИЕМ «ДО → ПОСЛЕ». «После» в событии конца нет: оно —
    //     первый замер usage этой сессии после сжатия (uchest ниже). Замера нет за ZHDAT_POSLE_MS — строка уходит без
    //     «после». trevogaSzhatiya=false — владельцу ничего, журнал как прежде.
    // EN: LOG — AT ONCE, OWNER — ONE SHORT LINE WITH FILL "BEFORE → AFTER". "After" is not in the end event: it is the
    //     first usage measurement of this session after the compaction (uchest below). No measurement within
    //     ZHDAT_POSLE_MS — the line goes without "after". trevogaSzhatiya=false — nothing to the owner, the log as before.
    otdat(krik, config, polnyj, null)
    if (config.trevogaSzhatiya) {
      const sid = session?.id ?? '?'
      const bylo = ozhidayut.get(sid); if (bylo) skazatSzhatie(sid, null)   // прежнее ещё ждало «после» — уходит как есть
      const oz = { do: nachala.get(id)?.do ?? null, zn: svodkaVyshlo, d, model: svodka?.model ?? null, ruka: vid === 'prinuditelnoe' }
      oz.tajmer = setTimeout(() => skazatSzhatie(sid, null), ZHDAT_POSLE_MS); oz.tajmer.unref?.()
      ozhidayut.set(sid, oz)
    }

    nachala.delete(id); svodki.delete(id)
    pechatSvodki()
  })

  // RU: ── ВТОРАЯ СТУПЕНЬ ЗАПОЛНЕНИЯ ──
  //     Почему не общий счётчик с нуджем (dsh-pamyat-nudzh). Нудж считает расход своей рукой и держит свою долю
  //     (0,8). Второй счётчик неизбежно разойдётся с первым, и разойдётся молча. Поэтому здесь не «правильное
  //     число», а ВТОРАЯ ПАРА ГЛАЗ: своё число, своё имя в строке, и прямо сказано, что оно независимо и может
  //     не совпасть.
  //     ── СЧЁТ ДЛЯ СВОДКИ: ЧИСЛИТЕЛЬ И ЗНАМЕНАТЕЛЬ РЯДОМ ──
  //     «Сжатий 3» без «ходов M» не значит ничего: ноль тревог при четырёх ходах и при четырёхстах — разные
  //     новости (0 отказов в окне однажды читалось как успех, пока не выяснилось, сколько было попыток).
  //     Чего это НЕ значит: ходы — знаменатель для СЖАТИЙ, а не для ступеней заполнения. У ступеней знаменателя
  //     нет вовсе (они про состояние, а не про поток), и это сказано в самой сводке.
  // EN: ── SECOND FILL STAGE ──
  //     Why not a counter shared with the nudge package (dsh-pamyat-nudzh). The nudge counts spend on its own
  //     and keeps its own ratio (0.8). A second counter will inevitably diverge from the first, and silently.
  //     So this is not "the correct number" but a SECOND PAIR OF EYES: its own number, its own name in the
  //     line, and an explicit statement that it is independent and may differ.
  //     ── COUNTS FOR THE SUMMARY: NUMERATOR AND DENOMINATOR SIDE BY SIDE ──
  //     "3 compactions" without "M turns" means nothing: zero alarms over four turns and over four hundred are
  //     different news (0 failures in a window once read as success until it turned out how many attempts there
  //     were).
  //     What this does NOT mean: turns are the denominator for COMPACTIONS, not for fill stages. Stages have no
  //     denominator at all (they are about state, not flow), and the summary says so explicitly.
  let vyvedenoSessij = 0;
  const sessii = new Map();   // RU: id сессии → { pervoe, poslednee, sobytij } · EN: session id → { pervoe, poslednee, sobytij }
  const schet = { estestvennyh: 0, prinuditelnyh: 0, obrezok: 0, provalov: 0, hodov: 0,
                  bezRashoda: 0, bezDliny: 0, stupenej: 0 }
  let vzyato = 0
  const otdannyeSessii = (sid) => {
    const z = (sessiiStupenej[sid] ??= { otdany: [], rubezh: null, kogda: null })
    return z
  }
  const sohranit = () => {
    ogranichitStupeni(sessiiStupenej)
    const beda = zapisatStupeni(putStupenej, sessiiStupenej)
    if (beda && !skazanoOZapisi) { skazanoOZapisi = true; krik(`⚠️ отданные ступени НЕ сохранены: ${beda} — после подъёма возможен повтор`) }
  }
  if (Object.keys(sessiiStupenej).length > PREDEL_SESSIJ) sohranit()
  let skazanoORashozhdenii = false
  let skazanoOSlepote = false
  let skazanoOChuzhih = false
  // RU: СВОДКУ НАДО НЕ ТОЛЬКО УМЕТЬ СТРОИТЬ, НО И ЗВАТЬ. Первая редакция объявляла svodkaStorozha и отдавала её
  //     наружу, а в работе её не звал НИКТО: единственные вызовы жили в стенде. Требования «область печатается
  //     всегда» и «знаменатель рядом с числителем» были «сделаны» и ни разу не исполнились в работе; стенд
  //     зеленел, потому что звал метод напрямую — то есть проверял то, чего в работе не происходит. Класс:
  //     механизм есть, вызывающего нет.
  // EN: THE SUMMARY MUST NOT ONLY BE BUILDABLE BUT ALSO CALLED. The first version declared svodkaStorozha and
  //     exported it, yet in production NOBODY called it: the only calls lived in the stand. The requirements
  //     "scope is always printed" and "denominator next to numerator" were "done" and never executed in
  //     production; the stand was green because it called the method directly — i.e. it checked something that
  //     does not happen in production. The class: a mechanism exists, a caller does not.
  const uchest = (usage, session) => {
    // RU: СТУПЕНИ — ПО ДАВЛЕНИЮ НА КОНТЕКСТ, А НЕ ПО РАСХОДУ ВЫЗОВА. Заполнение — это то, что уходит В ЗАПРОС:
    //     вход плюс кэш, без выхода (формула платформы pressureFrom, см. vidy-szhatiya.js). Ответ модели
    //     попадёт в контекст только СЛЕДУЮЩИМ вызовом. Прежде здесь стоял полный расход — доля завышалась на
    //     весь выход, и ступень кричала раньше срока.
    //     Usage события несёт ПОЛНОЕ текущее заполнение, поэтому vzyato заменяется, а не накапливается.
    // EN: STAGES FOLLOW PRESSURE ON THE CONTEXT, NOT THE SPEND OF A CALL. Fill is what goes INTO THE REQUEST:
    //     input plus cache, without output (the platform formula pressureFrom, see vidy-szhatiya.js). The
    //     model's answer enters the context only with the NEXT call. Previously the full spend was used here —
    //     the share was inflated by the whole output and the stage fired too early.
    //     The event usage carries the FULL current fill, so vzyato is replaced, not accumulated.
    const r = davlenie(usage)
    if (r.chuzhie?.length && !skazanoOChuzhih) {
      skazanoOChuzhih = true
      krik(`⚠️ в usage поля, не объявленные платформой: ${r.chuzhie.join(', ')}.`
        + ` В счёт НЕ берутся — молчаливый учёт неизвестного даёт число, за которое никто не отвечает.`)
    }
    if (!r.est) return
    vzyato = r.vsego
    if (ozhidayut.has(session?.id ?? '?')) skazatSzhatie(session?.id ?? '?', vzyato)   // первый замер после сжатия — «после»

    // RU: ОКНО — У ПЛАТФОРМЫ, НАСТРОЙКА predel ЗАПАСНАЯ (см. oknoModeli).
    // EN: THE WINDOW COMES FROM THE PLATFORM; THE predel SETTING IS A FALLBACK (see oknoModeli).
    const o = oknoModeli(session)
    const predel = o.est ? o.tokenov : config.predel
    const istochnikOkna = o.est
      ? `платформа, модель ${o.model ?? '?'}`
      : `НАСТРОЙКА (платформой не подтверждена: ${o.prichina})`

    // RU: РАСХОЖДЕНИЕ НАСТРОЙКИ С ПЛАТФОРМОЙ НАЗЫВАЕТСЯ ВСЛУХ, ОДИН РАЗ за жизнь процесса. Молчаливое «беру
    //     платформу, а число в настройке игнорирую» оставило бы в профиле цифру, которая выглядит действующей и
    //     ни на что не влияет. Кричим и продолжаем считать по платформе: она про модель СЕЙЧАС.
    // EN: A MISMATCH BETWEEN THE SETTING AND THE PLATFORM IS SAID ALOUD, ONCE per process lifetime. A silent "I
    //     take the platform value and ignore the configured number" would leave a number in the profile that
    //     looks effective and influences nothing. We say it and keep counting by the platform: it describes the
    //     model AS OF NOW.
    if (o.est && config.predel && config.predel !== o.tokenov && !skazanoORashozhdenii) {
      skazanoORashozhdenii = true
      otdat(krik, config, `⚠️ предел в настройке ${config.predel} ток. РАСХОДИТСЯ с окном,`
        + ` объявленным платформой (${o.tokenov} ток., модель ${o.model ?? '?'}).`
        + ` Считаю по платформе; число в настройке пора убрать или поправить.`)
    }

    // RU: База ступеней — ПОРОГ СЖАТИЯ (готовый номинальный порог из файла порогов агента для текущего
    //     маршрута); не прочитан — окно, с пометкой и причиной в строке тревоги. Маршрут берётся из заголовка
    //     запроса сессии (requestHeader().config), иначе из requestContext().
    // EN: The stage base is the COMPACTION THRESHOLD (the ready nominal threshold from the agent's threshold
    //     file for the current route); if it cannot be read — the window, with a mark and a reason in the alarm
    //     line. The route is taken from the session request header (requestHeader().config), otherwise from
    //     requestContext().
    const header = session?.requestHeader?.()?.config ?? session?.requestContext?.()
    const route = header?.provider || header?.model ? { provider: header.provider, model: header.model } : null
    const dp = dolyaPoroga(process.env.DSH_HOME, route)
    const baza = dp.porog ?? predel
    // RU: НЕТ НИ ОКНА ПЛАТФОРМЫ, НИ НАСТРОЙКИ — ЭТО СЛЕПОТА, И ОНА ГОВОРИТСЯ (один раз). Прежде здесь стоял
    //     тихий возврат: ступени молчали, и молчание было неотличимо от «заполнение низкое».
    // EN: NEITHER A PLATFORM WINDOW NOR A SETTING — THIS IS BLINDNESS, AND IT IS SAID (once). Previously there
    //     was a silent return here: the stages were silent, and silence was indistinguishable from "fill is
    //     low".
    if (!baza) {
      if (!skazanoOSlepote) {
        skazanoOSlepote = true
        krik(`ступени НЕ считаются: окна нет ни у платформы (${o.prichina}),`
          + ` ни в настройке (predel 0), ни в готовом пороге D. Моё молчание тут означает «не мерил», а не «мало занято».`)
      }
      return
    }
    const imyaBazy = dp.dolya ? `номинального порога ${ruChislo(baza)} (${dp.routeSource})` : `ОКНА ${ruChislo(predel)}`
    const pometka = dp.dolya ? '' : ` ⚠️ порог сжатия НЕ ПРОЧИТАН (${dp.prichina}) — считаю от окна.`
    const dolya = vzyato / baza
    const z = otdannyeSessii(session?.id ?? '?')
    const doSbrosa = z.otdany.length
    z.otdany = z.otdany.filter((st) => !(dolya < st - 0.1))   // RU: запасной сброс: сжатие прошло мимо модуля · EN: fallback reset: a compaction passed while the module was not loaded
    const vzyaty = []
    for (const st of config.stupeni) {
      if (vzyato >= porogStupeni(baza, st) && !z.otdany.includes(st)) { z.otdany.push(st); vzyaty.push(st) }
    }
    if (vzyaty.length || z.otdany.length !== doSbrosa) { z.kogda = new Date().toISOString(); sohranit() }
    else ogranichitStupeni(sessiiStupenej)
    // RU: ОДНО СООБЩЕНИЕ ПРО ВСЕ ПЕРЕЙДЁННЫЕ СТУПЕНИ, А НЕ ПО СООБЩЕНИЮ НА КАЖДУЮ. Один скачок может
    //     перешагнуть обе ступени разом (800 000 → 950 000). Прежняя редакция кричала дважды об ОДНОМ событии —
    //     ровно та беда, ради которой сторож делался «одним оповещением поверх»: шум учит не читать.
    // EN: ONE MESSAGE ABOUT ALL CROSSED STAGES, NOT ONE PER STAGE. A single jump may cross both stages at once
    //     (800 000 → 950 000). The earlier version shouted twice about ONE event — exactly the problem the
    //     guard was built "as one notification on top" to avoid: noise teaches people not to read.
    if (vzyaty.length) {
      schet.stupenej += vzyaty.length
      // RU: Текст — в единицах владельца, как у внешнего сторожа сжатия: «🟡 ЗАПОЛНЕНИЕ 93,0% порога 890 000
      //     (82,8% окна; по ответу модели)». 🟡 — ступень ниже 90%, 🟠 — 90% и выше.
      // EN: Text in the owner's units, as in the external compaction watcher: "🟡 ЗАПОЛНЕНИЕ 93,0% порога 890
      //     000 (82,8% окна; по ответу модели)" (FILL 93.0% of threshold 890 000 (82.8% of window; per model
      //     response)). 🟡 — a stage below 90%, 🟠 — 90% and above.
      const znak = Math.max(...vzyaty) >= 0.9 ? '🟠' : '🟡'
      const kratko = `${znak} ${imyaVladelcu(config)}: контекст ${Math.floor(100 * vzyato / baza)}% `
        + `${dp.dolya ? 'порога' : 'окна (порог сжатия не прочитан)'} (${tys(vzyato)} из ${tys(baza)})`
      otdat(krik, config, `${znak} ЗАПОЛНЕНИЕ ${ruProc(vzyato, baza)} ${imyaBazy} (${predel ? ruProc(vzyato, predel) + ' окна' : 'окно платформой не объявлено'}; по ответу модели) — `
        + (vzyaty.length > 1 ? 'перешагнуты ' : 'перешагнул ')
        + vzyaty.map((x) => `${Math.round(x * 100)}% (${ruChislo(porogStupeni(baza, x))})`).join(' и ')
        + (vzyaty.length > 1 ? ' ОДНИМ скачком' : '')
        + `; занято ${ruChislo(vzyato)} (вход+кэш, БЕЗ выхода).${pometka} окно — ${istochnikOkna} · счёт СВОЙ, с нуджем не сверяется`, kratko)
    }
  }
  ctx.on('session/event', (session, event) => {
    // RU: ОХВАТ ПО СЕССИЯМ. Буквальное требование «сторож печатает, сколько агентов видел, и тревожит, если
    //     стало меньше» неисполнимо: сторож живёт ВНУТРИ процесса одного агента и чужих агентов машины не видит
    //     ни одним событием. Исполнимая половина — СЕССИИ ЭТОГО ПРОЦЕССА: если сессия, от которой события шли,
    //     перестала их слать, это ровно тот «ослеп», от которого требование защищает.
    //     Замер до кода, чтобы не выдать механизм за находку: в обычной работе процесс видит одну сессию, то
    //     есть разряд чаще всего молчит по существу, а не по исправности. Заводится он по построению — на
    //     случай второй сессии, — и это сказано прямо в сводке.
    //     Запись и чтение одним движением: первая редакция делала это в два шага («нет ключа — положить», затем
    //     «взять и поправить»), и при помехе первому шагу второй падал на undefined. Поймано порчей: она
    //     уронила весь стенд вместо одной пробы.
    // EN: PER-SESSION COVERAGE. The literal requirement "the guard prints how many agents it saw and alerts if
    //     there are fewer" is not executable: the guard lives INSIDE one agent's process and does not see other
    //     agents on the machine through any event. The executable half is the SESSIONS OF THIS PROCESS: if a
    //     session that used to send events stops sending them, that is exactly the "went blind" the requirement
    //     protects against.
    //     Measured before coding, so as not to sell a mechanism as a finding: in normal operation a process
    //     sees one session, so the category is usually silent on the merits, not because of health. It exists
    //     by construction — for the case of a second session — and the summary says so directly.
    //     Write and read in one move: the first version did it in two steps ("no key — put", then "take and
    //     adjust"), and if the first step was disturbed the second failed on undefined. Caught by deliberate
    //     breakage: it crashed the whole stand instead of one probe.
    const sid = session?.id ?? null;
    if (sid) {
      const z = sessii.get(sid) ?? { pervoe: Date.now(), poslednee: 0, sobytij: 0 };
      z.poslednee = Date.now(); z.sobytij++;
      sessii.delete(sid); sessii.set(sid, z);
      if (sessii.size > PREDEL_SESSIJ) { sessii.delete(sessii.keys().next().value); vyvedenoSessij++ }
    }
    if (event?.type === 'turn/start') schet.hodov++
    // RU: СВОДКА ПЕЧАТАЕТСЯ ПО ТАКТУ ХОДОВ, А НЕ ТОЛЬКО ПРИ СЖАТИИ. Прежде pechatSvodki звалась только из
    //     разбора событий сжатия, и при НУЛЕ сжатий сводка не печаталась никогда: «за час 11 ходов · 0 сжатий ·
    //     0 строк сводки» — не «всё тихо», а «сторож молчал». Молчание неотличимо от исправности — ровно тот
    //     случай, ради которого сторож есть.
    //     Почему по событию хода, а не таймером: новых таймеров и служб не заводим, а такт хода честнее времени
    //     — сторож меряет работу, а не часы.
    //     Граница: N = 10 назначено числом. Первая сводка — на ПЕРВОМ turn/end после подъёма, чтобы
    //     свежеподнятый агент не молчал до десятого хода; дальше — каждый десятый turn/end (ходы 1, 11, 21, …).
    // EN: THE SUMMARY IS PRINTED ON A TURN CADENCE, NOT ONLY ON COMPACTION. Previously pechatSvodki was called
    //     only from compaction event handling, and with ZERO compactions the summary was never printed: "11
    //     turns in an hour · 0 compactions · 0 summary lines" is not "all quiet" but "the guard was silent".
    //     Silence is indistinguishable from health — exactly the case the guard exists for.
    //     Why on a turn event and not a timer: we add no new timers or services, and a turn cadence is more
    //     honest than time — the guard measures work, not the clock.
    //     Boundary: N = 10 is fixed as a number. The first summary comes on the FIRST turn/end after start-up,
    //     so a freshly started agent is not silent until the tenth turn; then every tenth turn/end (turns 1,
    //     11, 21, …).
    if (event?.type === 'turn/end') {
      schet.hodovPosleSvodki = (schet.hodovPosleSvodki ?? 0) + 1
      const pervaya = !schet.svodkaBylaPoslePodyoma
      if (pervaya || schet.hodovPosleSvodki >= 10) {
        schet.hodovPosleSvodki = 0
        schet.svodkaBylaPoslePodyoma = true
        pechatSvodki()
      }
    }
    // RU: СЧЁТ ОБНУЛЯЕТ ЛЮБОЕ СЖАТИЕ, А НЕ ТОЛЬКО СВОДОЧНОЕ. Прежде сброс был только на compaction/summary.
    //     Обрезка без модели (prune) урезает контекст так же, а ступени после неё оставались «отданными» — и
    //     при повторном наборе того же объёма тревоги не было бы.
    //     Корень общий с известным дефектом платформы (опора замера устаревает после сжатия,
    //     tokenMeter.measure() завышен), но measure() здесь не берётся вовсе — счёт идёт по usage событий, —
    //     поэтому тот дефект нас не касается по построению; а его близнец по prune был и лечится тем же
    //     сбросом.
    // EN: ANY COMPACTION RESETS THE COUNT, NOT ONLY A SUMMARY ONE. Previously the reset happened only on
    //     compaction/summary. A prune without a model cuts the context just the same, yet stages stayed
    //     "reported" after it — and when the same volume was reached again there would be no alarm.
    //     The root is shared with a known platform defect (the measurement base goes stale after compaction,
    //     tokenMeter.measure() overstated), but measure() is not used here at all — counting is done from event
    //     usage — so that defect does not affect us by construction; its prune twin did, and is cured by the
    //     same reset.
    if (event?.type === 'compaction/summary' || event?.type === 'compaction/prune') {
      // RU: Сброс отданных ступеней ЭТОЙ сессии с рубежом сжатия (seq или time события) — и сразу на диск,
      //     чтобы подъём не вернул старые.
      // EN: Reset the reported stages of THIS session with the compaction boundary (event seq or time) — and
      //     write to disk at once, so a restart does not bring the old ones back.
      const z = otdannyeSessii(session?.id ?? '?')
      z.otdany = []; z.rubezh = event?.seq ?? event?.time ?? null; z.kogda = new Date().toISOString(); sohranit()
      vzyato = 0; return
    }
    uchest(event?.data?.usage, session)
  })

  // RU: ── СВОДКА: ОБЛАСТЬ, ЧИСЛИТЕЛЬ, ЗНАМЕНАТЕЛЬ, «НЕ ПРОВЕРЯЛ» ──
  //     Область и «чего не видел» печатаются ВСЕГДА, даже нулём. Иначе «тревог 0» читается как «всё хорошо», а
  //     означать может «мы туда не смотрели». Прибор обязан говорить не только что проверил, но и ЧЕГО НЕ
  //     ПРОВЕРЯЛ, поимённо.
  //     Граница счёта: он живёт в памяти процесса и обнуляется подъёмом. «За сутки» сказать нельзя — только «с
  //     подъёма», так и написано. Суточный счёт потребовал бы своего хранилища, то есть второго места правды
  //     рядом с журналом.
  // EN: ── SUMMARY: SCOPE, NUMERATOR, DENOMINATOR, "NOT CHECKED" ──
  //     Scope and "what was not seen" are printed ALWAYS, even as zero. Otherwise "0 alarms" reads as "all is
  //     well" while it may mean "we did not look there". A tool must say not only what it checked but also WHAT
  //     IT DID NOT CHECK, by name.
  //     Count boundary: it lives in process memory and is reset by a restart. "Per day" cannot be claimed —
  //     only "since start-up", and that is what it says. A daily count would need its own storage, i.e. a
  //     second source of truth next to the log.
  const svodkaStorozha = () => {
    const szhatij = schet.estestvennyh + schet.prinuditelnyh
    return [
      `сводка сторожа с подъёма процесса (НЕ за сутки: счёт в памяти, подъём его обнуляет)`,
      `  область: события ЭТОГО процесса — compaction/start, /summary, /end, /prune, turn/start`,
      // RU: ОБЪЯСНЕНИЕ НУЛЯ ПО compaction/prune (только при ispolnenieInstrumentov = 'dsh'). Печатается, пока
      //     обрезок 0: придёт хоть одна — строка исчезнет сама, и сводка не станет спорить с собой («не
      //     приходил ни разу» рядом с «обрезок 3»).
      //     Прежняя редакция утверждала, будто плагин-отправитель события не подключён. Это было неверно: он
      //     подключён у части агентов (tool-result-pruner в пресете агента), а число порога из того же
      //     комментария — его собственная настройка, а не свойство кода. Ноль был честным для одного каталога
      //     плагинов и ложным для предмета: движок жил в другом дереве (<HOME>/app/node_modules). Правило
      //     отсюда: ноль объяснять тем, что сторож МОЖЕТ проверить при прогоне, а не тем, что кто-то однажды
      //     замерил. И порог числом здесь не называется нарочно: он задаётся настройкой профиля, сторож её не
      //     читает, и вмёрзшее число разошлось бы с ней молча.
      //     При НУЛЕ сжатий обе прежние ветки ложны, верна третья: pechatSvodki зовётся и из разбора ПРОВАЛА, а
      //     провалы в szhatij не входят, поэтому первое же проваленное сжатие даёт szhatij 0, и «за 0 сжатий не
      //     приходил» было бы утверждением о наблюдении, которого не было.
      // EN: EXPLAINING THE ZERO FOR compaction/prune (only with ispolnenieInstrumentov = 'dsh'). Printed while
      //     there are 0 prunes: as soon as one arrives the line disappears by itself, and the summary does not
      //     contradict itself ("never arrived" next to "3 prunes").
      //     An earlier version claimed the plugin that sends the event was not connected. That was wrong: it is
      //     connected for some agents (tool-result-pruner in the agent preset), and the threshold number from
      //     that comment is its own setting, not a property of the code. The zero was honest for one plugin
      //     directory and false for the subject: the engine lived in another tree (<HOME>/app/node_modules).
      //     The rule: explain a zero by what the guard CAN check at run time, not by what someone once
      //     measured. And the threshold is deliberately not named as a number here: it is set by a profile
      //     setting the guard does not read, and a frozen number would silently diverge from it.
      //     With ZERO compactions both earlier branches are false and a third is true: pechatSvodki is also
      //     called from FAILURE handling, and failures are not part of szhatij, so the very first failed
      //     compaction gives szhatij 0, and "did not arrive over 0 compactions" would be a statement about an
      //     observation that never happened.
      ...(config.ispolnenieInstrumentov === 'dsh' && schet.obrezok === 0 ? [
        szhatij === 0
        ? `    ⚠️ сжатий с подъёма ещё не было — тишина по compaction/prune ни о чём`
          + ` не говорит: наблюдать было нечего`
        : `    ⚠️ compaction/prune не приходил ни разу за ${szhatij} сжатий (счёт с подъёма).`
          + ` Событие шлёт tool-result-pruner, когда результат инструмента длиннее`
          + ` порога, заданного настройкой. Ноль означает ЛИБО «порог не пробивался»,`
          + ` ЛИБО «событие не дошло до нашего слушателя» — сторож этих двух случаев`
          + ` НЕ РАЗЛИЧАЕТ`] : []),
      `  НЕ проверял: сжатия других агентов машины · события до подъёма · то, что не дошло`,
      `    до нашего слушателя (молчание сторожа этих трёх случаев НЕ различает)`,
      `  сжатий ${szhatij} (естественных ${schet.estestvennyh} · принудительных ${schet.prinuditelnyh})`
        + (config.ispolnenieInstrumentov === 'sdk'
          ? ' · обрезка: неприменимо (инструменты в SDK)'
          : config.ispolnenieInstrumentov === 'dsh'
            ? ` · обрезок без модели ${schet.obrezok}`
            : ' · обрезка: не установлено (исполнитель инструментов не задан или неизвестен)')
        + ` · провалов ${schet.provalov}`,
      `  ЗНАМЕНАТЕЛЬ: ходов ${schet.hodov} — «сжатий N» без него не читается`,
      // RU: НАЧАТО И НЕ ЗАВЕРШЕНО — отдельный разряд. Сжатия считаются по событию /end; сжатие, начатое и
      //     оборванное (перезапуск службы, падение), не попадает НИ В ОДИН разряд — ни в «сжатий N», ни в
      //     «провалов»: провал решается по полю error В КОНЦЕ, а конца нет вовсе. Знаменатель занижался молча.
      //     Замер по журналу сессии на диске однажды дал «начал 38, концов 37»: одно сжатие оборвал перезапуск
      //     службы через две минуты после начала (причина установлена по журналу).
      //     Ноль печатается тоже: иначе «незавершённых не было» станет неотличимо от «их не считали».
      // EN: STARTED AND NOT FINISHED — a separate category. Compactions are counted by the /end event; a
      //     compaction that started and was cut off (service restart, crash) falls into NO category — neither
      //     "N compactions" nor "failures": a failure is decided by the error field AT THE END, and there is no
      //     end at all. The denominator was silently understated. A count over a session journal on disk once
      //     gave "38 starts, 37 ends": one compaction was cut off by a service restart two minutes after it
      //     began (cause established from the log).
      //     Zero is printed too: otherwise "there were no unfinished ones" becomes indistinguishable from "they
      //     were not counted".
      `  начато и НЕ завершено: ${nachala.size}`
        + (nachala.size ? ' 🔴 — эти сжатия не вошли в «сжатий N» ни одним разрядом' : ''),
      `  из ${szhatij} сжатий: без расхода в событии платформы ${schet.bezRashoda} (не сообщён ≠ ноль; у kompakt своя строка)`
        + ` · без длительности ${schet.bezDliny} (нет метки начала)`,
      `  ступеней заполнения отдано ${schet.stupenej}`
        + ` — у них знаменателя НЕТ: это состояние, а не поток`,
      `  ОХВАТ ПО СЕССИЯМ: видел ${sessii.size}` + (vyvedenoSessij ? ` (последние ${PREDEL_SESSIJ}; выведено из охвата ${vyvedenoSessij})` : '') + (sessii.size
        ? ' — ' + [...sessii].map(([i, z]) => `${i} (событий ${z.sobytij}`
            + (ctx.get?.('conversationSessions')?.isArchived?.(i) === true ? ', прежний разговор /new' : Date.now() - z.poslednee > MOLCHIT_MS
                ? `, МОЛЧИТ ${Math.round((Date.now() - z.poslednee) / 60000)} мин`
                : '') + ')').join(', ')
        : ' (ни одной — событий не было вовсе)'),
      `    ⚠️ это сессии ЭТОГО процесса, а НЕ агенты машины: чужих агентов сторож не видит`,
      `    ни одним событием, и «видел N» про них не говорит ничего.`,
    ].join('\n')
  }

  // RU: Теперь ссылка указывает на настоящую сводку. Она печатается после КАЖДОГО завершённого сжатия —
  //     успешного, проваленного и обрезки (событие редкое, шума не даёт, а числа нужны ровно тогда, когда есть
  //     о чём говорить) — и по такту ходов (см. обработчик turn/end выше).
  //     Граница: если событий нет вовсе — ни ходов, ни сжатий, — сводка не печатается, и сторож снаружи
  //     неотличим от мёртвого. Отдельного сторожа молчания в пакете нет.
  // EN: Now the reference points to the real summary. It is printed after EVERY finished compaction —
  //     successful, failed and prune (the event is rare, adds no noise, and the numbers are needed exactly when
  //     there is something to talk about) — and on a turn cadence (see the turn/end handler above).
  //     Boundary: if there are no events at all — no turns, no compactions — the summary is not printed, and
  //     from the outside the guard is indistinguishable from a dead one. The package has no separate silence
  //     watcher.
  pechatSvodki = () => { for (const s of svodkaStorozha().split('\n')) krik(s) }

  return { uchest, svodkaStorozha, schet: () => ({ ...schet }),
           sessii: () => [...sessii].map(([i, z]) => ({ id: i, sobytij: z.sobytij })),
           sostoyanie: () => ({ vzyato, stupeniOtdany: [...new Set(Object.values(sessiiStupenej).flatMap((z) => z.otdany))].sort() }) }
}

/**
 * RU: otdat — отдать сообщение: всегда в журнал (через krik → pechat), дополнительно — во внешний сток (команда
 *     komandaStoka, текст на stdin, предел 5 с).
 *     Сток необязателен и по умолчанию не задан: адресат оповещения — дело раскладки агента, и угадывать его
 *     значило бы зашить в пакет чужую раскладку. Пока команда не задана, сторож пишет только в журнал и ГОВОРИТ
 *     об этом при подъёме, а не молчит.
 * EN: otdat — deliver a message: always to the log (via krik → pechat), additionally to the external sink (the
 *     komandaStoka command, text on stdin, 5 s timeout).
 *     The sink is optional and not set by default: who receives the notification depends on the agent's set-up,
 *     and guessing it would hard-code someone else's set-up into the package. While no command is set, the
 *     guard writes to the log only and SAYS so at start-up instead of staying silent.
 */
// RU: kratko — строка ВЛАДЕЛЬЦУ (в сток); не задана — в сток уходит полная, как прежде; null — только журнал.
// EN: kratko — the line for the OWNER (to the sink); not given — the full line goes to the sink as before; null — log only.
function otdat(krik, config, tekst, kratko) {
  // RU: АГЕНТ В КАЖДОЙ ТРЕВОГЕ, И ПОДСТАВЛЕН ОДНИМ МЕСТОМ. Собирать имя в каждой строке отдельно — значит
  //     однажды забыть его ровно в той строке, которую будут читать. Пусто — пишем «агент НЕ НАЗВАН», а не
  //     молчим: у сообщения без адреса отправитель выглядит известным, пока сообщений не станет два.
  // EN: THE AGENT IN EVERY ALARM, AND ADDED IN ONE PLACE. Assembling the name separately in each line means one
  //     day forgetting it in exactly the line that will be read. If empty we write "агент НЕ НАЗВАН" (agent NOT
  //     NAMED) rather than stay silent: a message without an address looks like it has a known sender until
  //     there are two of them.
  const kto = config.agent ? `агент ${config.agent}` : 'агент НЕ НАЗВАН (настройка agent пуста)'
  krik(`${kto} · ${tekst}`)
  if (kratko === null) return
  vStok(krik, config, kratko ?? `${kto} · ${tekst}`)
}

// RU: Сток — отдельно, чтобы короткая строка сжатия (уходит позже журнальной) шла тем же путём и с тем же криком об отказе.
// EN: The sink is separate so that the short compaction line (sent later than the log line) takes the same path and failure cry.
// RU: сколько ждать замера «после» сжатия; STOROZHA_ZHDAT_POSLE_MS — для стендов, как STOROZHA_STUPENI_FAJL
// EN: how long to wait for the "after" measurement; STOROZHA_ZHDAT_POSLE_MS — for test stands, like STOROZHA_STUPENI_FAJL
const ZHDAT_POSLE_MS = Number(process.env.STOROZHA_ZHDAT_POSLE_MS) || 10 * 60 * 1000
function vStok(krik, config, tekst) {
  if (!config.komandaStoka) return
  try {
    const child = execFile('/bin/sh', ['-c', config.komandaStoka], { timeout: 5000 }, (e) => {
      if (e) krik(`🔴 сток не сработал (код ${e.code ?? '?'}; сигнал ${e.signal ?? 'нет'}) — сообщение осталось только в журнале`)
    })
    child.stdin.on('error', () => {}) // EPIPE is reported by the child callback.
    child.stdin.end(tekst)
  } catch (e) {
    // RU: ОТКАЗ СТОКА НЕ ГЛУШИТ ОПОВЕЩЕНИЕ: в журнал оно уже ушло выше. Кричим о самом отказе — молча
    //     потерянный сток неотличим от «тревог не было».
    // EN: A SINK FAILURE DOES NOT SUPPRESS THE NOTIFICATION: it already went to the log above. We report the
    //     failure itself — a silently lost sink is indistinguishable from "there were no alarms".
    krik(`🔴 сток не сработал (${e?.message ?? e}) — сообщение осталось только в журнале`)
  }
}
