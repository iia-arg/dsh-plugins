/**
 * RU: dsh-pamyat-nudzh — РАСХОДНЫЙ учёт контекста агента DSH: сколько окна уже занято и не пора ли подтолкнуть
 *     модель к компакту (сжатию разговора).
 *     Что поднимать обратно в разговор — НЕ его дело: это соседний пакет dsh-pamyat-byudzhet (входящий бюджет
 *     памяти). Здесь эта работа намеренно не задваивается.
 *     Пакет — плагин cordis. При монтаже публикует службу nudzhPamyati (uchest, itog, hvatitLi, raskhodVyzova),
 *     слушает события сессии (session/event) и перед шагом агента (agent/pre-step) один раз за цикл вставляет
 *     модели напоминание записать важное в память до компакта.
 *     🔴 ГЛАВНОЕ ПРО ЧЕСТНОСТЬ, ЧИТАТЬ ДО ИСПОЛЬЗОВАНИЯ. Число расхода приходит от провайдера НЕ ВСЕГДА: в
 *     контракте компакции поле помечено «Provider-reported token usage … WHEN EMITTED» и необязательно. Значит
 *     итог по построению НЕПОЛОН, и пакет никогда не говорит «израсходовано X» — он говорит «НЕ МЕНЬШЕ X,
 *     учтено N вызовов, M без числа».
 *     Отсюда несимметричное правило, которое и делает пакет годным: «уже не меньше порога» — утверждение
 *     честное, его можно делать; «ещё далеко, места хватает» — на неполных данных нечестное, и пакет его НЕ
 *     ДЕЛАЕТ.
 *     🔴 Следствие, которое легко упустить: МОЛЧАНИЕ НУДЖА НЕ ОЗНАЧАЕТ ЗАПАСА. Оно значит лишь «по учтённой
 *     части порог не перейдён»; неучтённая часть неизвестна, и строить на молчании решение нельзя.
 *     🔴 ЗНАЕМОЕ ПРО ВЫВОД. Пакет кричит только через console.error, развилки нет: ctx.logger в cordis 4.0.1
 *     есть, вызов проходит, но встроенный приёмник кладёт строку в кольцевой буфер внутри процесса и наружу не
 *     отдаёт. Перепроверить — стенд stend-krik-zvuchit (отдельный процесс, настоящий Context, ожидание строки в
 *     его stderr).
 * EN: dsh-pamyat-nudzh — the SPENDING side of a DSH agent's context: how much of the window is already occupied
 *     and whether it is time to nudge the model towards compaction (summarising the conversation).
 *     What to bring back into the conversation is NOT its business: that is the sibling package
 *     dsh-pamyat-byudzhet (the incoming memory budget). This work is deliberately not duplicated here.
 *     The package is a cordis plugin. On mount it publishes the nudzhPamyati service (uchest, itog, hvatitLi,
 *     raskhodVyzova), listens to session events (session/event) and, before an agent step (agent/pre-step),
 *     inserts once per cycle a reminder telling the model to write what matters into memory before compaction.
 *     🔴 THE MAIN POINT ABOUT THIS PACKAGE'S HONESTY, READ BEFORE USE. The provider does NOT ALWAYS send a usage
 *     number: in the compaction contract the field is marked "Provider-reported token usage … WHEN EMITTED" and
 *     is optional. So the total is INCOMPLETE by construction, and the package never says "X spent" — it says
 *     "AT LEAST X, N calls counted, M without a number".
 *     Hence the asymmetric rule that makes the package usable: "already at least the threshold" is an HONEST
 *     statement and may be made; "still far away, there is room" is DISHONEST on incomplete data, and the
 *     package does NOT make it.
 *     🔴 A consequence that is easy to miss: THE NUDGE'S SILENCE DOES NOT MEAN HEADROOM. It only means "the
 *     threshold is not crossed by the counted part"; the uncounted part is unknown, and no decision may rest on
 *     the silence.
 *     🔴 KNOWN ABOUT OUTPUT. The package shouts only through console.error, there is no fork: ctx.logger exists
 *     in cordis 4.0.1 and the call succeeds, but the built-in sink puts the line into an in-process ring buffer
 *     and never hands it out. To re-check — the stand stend-krik-zvuchit (a separate process, a real Context,
 *     waiting for the line on its stderr).
 */
import z from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { zavestiSchet, raskhodVyzova } from './schet.js';
import { createRequire } from 'node:module';

export const name = 'dsh-pamyat-nudzh';

export const Config = z.object({
  /**
   * RU: Предел контекста (окно модели) в токенах провайдера. 0 (умолчание) — предел неизвестен: расход
   *     считается, но подталкивать не с чем сравнивать. Допуск [0, ∞); отрицательное значение отклоняется в
   *     apply.
   * EN: Context limit (the model window) in provider tokens. 0 (the default) means the limit is unknown: spend
   *     is counted, but there is nothing to compare with for a nudge. Range [0, ∞); a negative value is
   *     rejected in apply.
   */
  predel: z.number().default(0),
  /**
   * RU: Отметки пути к порогу, долями предела. На КАЖДУЮ пересечённую отметку печатается одна строка, один раз
   *     за цикл; при возврате под порог тревоги всё сбрасывается.
   *     Годны только значения строго между 0 и 1; остальные отбрасываются в apply строкой «ОТКЛОНЕНО» с
   *     перечнем отброшенных и действующих отметок — как у predel и dolyaTrevogi.
   *     ЗАЧЕМ (замер 05.09.2026). Пакет печатал занятость ТОЛЬКО при пересечении порога тревоги, и между двумя
   *     тревогами о величине не было известно НИЧЕГО. На этом сломался разбор единственного за сутки отказа по
   *     длине: тревоги перед ним не было вовсе (ближайшая — за 9 часов до), и объяснить перескок было нечем.
   *     Отметки не предупреждают и не защищают — они дают РЯД, по которому потом можно назначить порог числом,
   *     а не догадкой.
   *     ЦЕНА ЗАМЕРЕНА: журнал службы 17 665 строк в сутки при 274 ходах; шесть отметок на цикл при семи циклах
   *     в сутки — около 42 строк, то есть 0,24 % журнала.
   *     Пустой список (умолчание) — отметок нет вовсе.
   * EN: Path marks towards the threshold, as fractions of the limit. ONE line is printed for EACH crossed mark,
   *     once per cycle; when occupancy returns below the alarm threshold, everything is reset.
   *     Only values strictly between 0 and 1 are valid; the rest are dropped in apply with an "ОТКЛОНЕНО"
   *     (rejected) line listing the dropped and the effective marks — as for predel and dolyaTrevogi.
   *     WHY (measured 05.09.2026). The package printed occupancy ONLY when the alarm threshold was crossed, so
   *     between two alarms NOTHING was known about the value. That broke the analysis of the only length
   *     rejection of the day: there was no alarm before it at all (the nearest was 9 hours earlier), and
   *     nothing could explain the jump. Marks neither warn nor protect — they give a SERIES from which a
   *     threshold can later be set by a number, not by a guess.
   *     COST MEASURED: the service log has 17,665 lines a day at 274 turns; six marks per cycle at seven cycles
   *     a day is about 42 lines, i.e. 0.24 % of the log.
   *     An empty list (the default) means no marks at all.
   */
  otmetkiPuti: z.array(z.number()).default([]),
  /**
   * RU: Доля предела, начиная с которой пора подталкивать к компакту. Умолчание 0.8; допуск (0, 1], вне допуска
   *     — отклоняется в apply.
   * EN: The fraction of the limit from which it is time to nudge towards compaction. Default 0.8; range (0, 1],
   *     anything outside is rejected in apply.
   */
  dolyaTrevogi: z.number().default(0.8),
});

// RU: ВЕРСИЯ БЕРЁТСЯ ИЗ СВОЕГО package.json, А НЕ КОНСТАНТОЙ (правило 03.09.2026): по журналу должно быть видно
//     не только КТО сказал, но и КАКАЯ редакция. Константа при следующем выпуске утверждала бы номер, которому
//     код уже не соответствует.
//     Пакет получил это правило на сутки позже соседей (04.09.2026): его применили к четырём пакетам из шести и
//     остановились — лечили экземпляр вместо класса. Цена была не косметической: в тот день пришлось читать
//     исходник на диске, чтобы понять, какую редакцию держит работающий процесс, — по журналу это установить
//     было нельзя.
//     Не прочёлся package.json — в строках журнала будет «версия неизвестна», а не выдуманный номер.
// EN: THE VERSION IS TAKEN FROM OUR OWN package.json, NOT FROM A CONSTANT (rule of 03.09.2026): the log must
//     show not only WHO spoke but also WHICH revision. A constant would, at the next release, assert a number
//     the code no longer matches.
//     This package got the rule a day later than its siblings (04.09.2026): it had been applied to four
//     packages out of six and then stopped — an instance was treated instead of the class. The cost was not
//     cosmetic: that day the source on disk had to be read to learn which revision the running process held —
//     the log could not tell.
//     If package.json cannot be read, log lines say "версия неизвестна" (version unknown), not an invented
//     number.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна'; }
  catch { return 'версия неизвестна'; }
})();

// RU: krik — единственный канал вывода пакета: строка в stderr с префиксом «[dsh-pamyat-nudzh <версия>]».
//     Почему не ctx.logger — см. шапку файла.
// EN: krik is the package's only output channel: a stderr line prefixed "[dsh-pamyat-nudzh <version>]". Why not
//     ctx.logger — see the file header.
function krik(soobshchenie) {
  console.error('[dsh-pamyat-nudzh ' + versiya + '] ' + soobshchenie);
}

// RU: ГРАНИЦЫ ПОРОГОВ ПРОВЕРЯЮТСЯ ЗДЕСЬ, В apply, А НЕ В СХЕМЕ (25.09.2026). Схема знает только «число», и доля
//     тревоги 7 или предел −1 принимались молча — и при старте, и при горячей загрузке (правка настройки:
//     платформа зовёт apply заново в том же процессе). Проверка в apply работает на обоих путях одинаково.
//     Негодное значение ОТКЛОНЯЕТСЯ строкой «ОТКЛОНЕНО» в stderr: действует прежнее годное, а если его нет —
//     умолчание.
//     Прежнее годное живёт на уровне МОДУЛЯ: при смене настройки загрузчик модуль не перечитывает
//     (cordis-plugin-loader, ветка без смены имени берёт прежний callback).
//     ⚠️ ГРАНИЦА: одно значение на процесс. Если в одном процессе разные узлы зададут разные пороги, «прежним
//     годным» станет последнее принятое у любого из них. Замер 25.09: у всех трёх вызовов apply в процессе
//     значения одинаковы.
//     otmetkiPuti проверяются в apply отдельно: негодные отбрасываются строкой «ОТКЛОНЕНО» (прежнего годного у
//     списка нет — действуют оставшиеся годные).
// EN: THRESHOLD BOUNDS ARE CHECKED HERE, IN apply, NOT IN THE SCHEMA (25.09.2026). The schema only knows "a
//     number", and an alarm fraction of 7 or a limit of −1 used to be accepted silently — both at start-up and
//     on hot reload (a settings edit: the platform calls apply again in the same process). The check in apply
//     works the same on both paths.
//     An invalid value is REJECTED with an "ОТКЛОНЕНО" (rejected) line on stderr: the previous valid value
//     stays in force, or the default if there is none.
//     The previous valid value lives at MODULE level: on a settings change the loader does not re-read the
//     module (cordis-plugin-loader, the branch without a name change reuses the previous callback).
//     ⚠️ BOUNDARY: one value per process. If different nodes in one process set different thresholds, the
//     "previous valid" becomes the last one accepted from any of them. Measured 25.09: all three apply calls in
//     the process had the same values.
//     otmetkiPuti are checked separately in apply: invalid ones are dropped with an "ОТКЛОНЕНО" line (the list
//     has no previous valid value — the remaining valid marks stay in force).
const prezhneeGodnoe = {};
// RU: vzyatPorog(pole, znachenie, umolchanie, godno, dopusk): null или undefined → умолчание; годное конечное
//     число запоминается как прежнее годное и возвращается; негодное — крик «ОТКЛОНЕНО» и возврат прежнего
//     годного либо умолчания. dopusk — только текст для строки журнала.
// EN: vzyatPorog(pole, znachenie, umolchanie, godno, dopusk): null or undefined → default; a valid finite
//     number is remembered as the previous valid value and returned; an invalid one — an "ОТКЛОНЕНО" shout and
//     the previous valid value or the default is returned. dopusk is only text for the log line.
function vzyatPorog(pole, znachenie, umolchanie, godno, dopusk) {
  if (znachenie === undefined || znachenie === null) znachenie = umolchanie;
  if (typeof znachenie === 'number' && Number.isFinite(znachenie) && godno(znachenie)) {
    prezhneeGodnoe[pole] = znachenie;
    return znachenie;
  }
  const est = prezhneeGodnoe[pole] !== undefined;
  const dejstvuet = est ? prezhneeGodnoe[pole] : umolchanie;
  krik('ОТКЛОНЕНО: ' + pole + ' = ' + String(znachenie) + ' — вне допуска ' + dopusk +
       '; действует ' + dejstvuet + (est ? ' (прежнее годное)' : ' (умолчание)') + '.');
  return dejstvuet;
}

// RU: ИНВАРИАНТ: платформа вызывает apply НЕСКОЛЬКО раз на один подъём (замер: 3). Процессных ресурсов здесь не
//     заводить — таймеров, слушателей process, сокетов. Если понадобятся — защёлка на уровне модуля и снятие
//     через диспозер, который возвращает cordis; события с именем 'dispose' в cordis 4.0.4 нет (поиск строки в
//     lib/index.js, 04.10.2026).
// EN: INVARIANT: the platform calls apply SEVERAL times per start-up (measured: 3). Do not create process-wide
//     resources here — timers, process listeners, sockets. If needed — a module-level latch and removal through
//     the disposer cordis returns; cordis 4.0.4 has no event named 'dispose' (string search in lib/index.js,
//     04.10.2026).
export function apply(ctx, config = {}) {
  const predel = vzyatPorog('predel', config.predel, 0, (x) => x >= 0, '[0, ∞)');
  const dolya = vzyatPorog('dolyaTrevogi', config.dolyaTrevogi, 0.8, (x) => x > 0 && x <= 1, '(0, 1]');
  // RU: Отметки берутся отсортированными по возрастанию: печатать их надо в порядке пути, а не в порядке записи
  //     в настройке. Годны только значения строго между 0 и 1; отброшенные называются строкой «ОТКЛОНЕНО»:
  //     прежде они пропадали молча, и опечатка [50] вместо [0.5] выглядела как пустой список.
  // EN: Marks are taken sorted ascending: they must be printed in path order, not in the order written in the
  //     settings. Only values strictly between 0 and 1 are valid; the dropped ones are named in an "ОТКЛОНЕНО"
  //     line: previously they vanished silently, and a typo [50] instead of [0.5] looked like an empty list.
  const vseOtmetki = [...(config.otmetkiPuti ?? [])];
  const otmetki = vseOtmetki.filter((x) => x > 0 && x < 1).sort((a, b) => a - b);
  const otbrosheny = vseOtmetki.filter((x) => !(x > 0 && x < 1));
  if (otbrosheny.length) krik('ОТКЛОНЕНО: otmetkiPuti — вне допуска (0, 1) отброшены ' + otbrosheny.join(', ') +
       '; действуют ' + (otmetki.length ? otmetki.join(', ') : 'никакие (отметок нет)') + '.');
  // RU: БЕЗУСЛОВНЫЙ СЛЕД ПОДЪЁМА. Прежде пакет говорил ТОЛЬКО при беде (предел не задан) — то есть исправно
  //     смонтированный был неотличим от несмонтированного, и «напоминание не пришло» читалось одинаково при
  //     обеих причинах. Строка называет и числа порога: иначе не отличить «порог не достигнут» от «порог задан
  //     не тот».
  // EN: AN UNCONDITIONAL START-UP TRACE. Previously the package spoke ONLY on trouble (limit not set) — so a
  //     correctly mounted package was indistinguishable from an unmounted one, and "the reminder did not come"
  //     read the same for both causes. The line also names the threshold numbers: otherwise "threshold not
  //     reached" cannot be told from "the wrong threshold is set".
  krik('подъём: предел ' + predel + ' ток., доля тревоги ' + dolya +
       (predel ? ' (порог ' + Math.round(predel * dolya) + ' ток.)' : '') +
       '. Числитель — занятость ПОСЛЕДНЕГО вызова, не сумма за сессию.');

  if (predel === 0) {
    krik('предел контекста НЕ ЗАДАН (predel: 0): расход считается, но подтолкнуть ' +
         'к компакту пакет не сможет — не с чем сравнивать. Это настройка, а не поломка.');
  }

  // RU: novoeSostoyanie() — состояние ОДНОЙ сессии: свой счёт (schet.js), флаги тревоги и вставки, отметки,
  //     признаки недостоверности и неизвестности. Возвращает службу с методами uchest, itog, raskhodVyzova,
  //     hvatitLi, neizvestno, events, replayed, vstavit. quiet гасит печать на время восстановления по журналу.
  // EN: novoeSostoyanie() — the state of ONE session: its own count (schet.js), alarm and insertion flags,
  //     marks, the non-credible and unknown flags. Returns a service with uchest, itog, raskhodVyzova,
  //     hvatitLi, neizvestno, events, replayed, vstavit. quiet suppresses printing while replaying from the
  //     journal.
  function novoeSostoyanie() {
    let neizvestno = false, quiet = false;
    const summaries = new Set();
    const say = (text) => { if (!quiet) krik(text); };
  const schet = zavestiSchet();
  let trevogaPodana = false;
  // RU: ВТОРОЙ ФЛАГ, А НЕ ПЕРЕИСПОЛЬЗОВАНИЕ ПЕРВОГО. Тревога живёт ВЕСЬ цикл (пока занятость выше порога), а
  //     напоминание модели нужно РОВНО ОДИН РАЗ за цикл. Повесив вставку на trevogaPodana, мы получили бы её на
  //     каждом шаге до компакта — то есть механизм, который приучает себя не читать.
  // EN: A SECOND FLAG, NOT A REUSE OF THE FIRST. The alarm lives for the WHOLE cycle (while occupancy is above
  //     the threshold), but the reminder to the model is needed EXACTLY ONCE per cycle. Hanging the insertion
  //     on trevogaPodana would give it on every step until compaction — a mechanism that trains its reader to
  //     ignore it.
  let vstavkaVzvedena = false;
  // RU: ПРИБОР РАНЬШЕ ПОРОГА (просьба координатора, 04.09.2026). Между тревогой и компактом на живом замере
  //     прошло НОЛЬ ходов: тревога приходит внутри шага, вставка ждёт следующего, а следующего не случается —
  //     механизм не помогает в том самом случае, ради которого заведён. Чинить вслепую нечем: числа «сколько
  //     ходов обычно проходит» нет ни у кого. Поэтому сначала СЧЁТЧИК, потом решение; число копится в работе
  //     само.
  //     ГРАНИЦА: считаются шаги, дошедшие до нашего обработчика. Ход, оборванный до него (предел сессии,
  //     сигнал), в счёт не попадёт — значит число это НИЖНЯЯ граница, а не точная.
  // EN: INSTRUMENT BEFORE THRESHOLD (a coordinator's request, 04.09.2026). In a live measurement ZERO turns
  //     passed between the alarm and compaction: the alarm arrives inside a step, the insertion waits for the
  //     next one, and the next one never comes — the mechanism does not help in exactly the case it exists for.
  //     There is nothing to fix blindly: nobody has a number for "how many turns usually pass". So first a
  //     COUNTER, then a decision; the number accumulates in operation by itself.
  //     BOUNDARY: only steps that reach our handler are counted. A turn cut off before it (session limit,
  //     signal) is not counted — so the number is a LOWER bound, not an exact one.
  let shagovPosleTrevogi = null;
  // RU: Занятость на момент взвода: в текст напоминания идут ЧИСЛА. Без них оно неотличимо от общей присказки,
  //     а присказку перестают читать первой.
  // EN: Occupancy at the moment of arming: NUMBERS go into the reminder text. Without them it is
  //     indistinguishable from a stock phrase, and a stock phrase is the first thing people stop reading.
  let zanyatoNaVzvode = null;
  // RU: ЗАНЯТОСТЬ НЕ МОЖЕТ ПРЕВЫШАТЬ ОКНО. Если превышает, это показание О ПРИБОРЕ, а не о памяти агента. Повод
  //     (16.09.2026, агент на поставщике Codex): поставщик отдаёт usage НАКОПИТЕЛЬНО за сессию, платформа
  //     передаёт его как usage одного вызова, и пакет печатал «занято 9594222 из 1000000», то есть 959 %. Семь
  //     тревог за неделю, все ложные; по ним толкали к компакту, которому нечего было сжимать. Замер того дня:
  //     два хода подряд дали input 29864 → 59764, output 6 → 12 — накопление подтверждено.
  //     Запас 1.5 взят потому, что predel — это ОБЪЯВЛЕННОЕ окно, и оно бывает чуть меньше настоящего (у одной
  //     из моделей объявлено 1000000, по её документации — около 1050000).
  // EN: OCCUPANCY CANNOT EXCEED THE WINDOW. If it does, the reading is ABOUT THE INSTRUMENT, not about the
  //     agent's memory. The occasion (16.09.2026, an agent on the Codex provider): the provider reports usage
  //     CUMULATIVELY per session, the platform passes it on as the usage of one call, and the package printed
  //     "occupied 9594222 of 1000000", i.e. 959 %. Seven alarms in a week, all false; they pushed towards a
  //     compaction that had nothing to compress. Measurement of that day: two consecutive turns gave input
  //     29864 → 59764, output 6 → 12 — accumulation confirmed.
  //     The 1.5 margin is there because predel is the DECLARED window and can be slightly smaller than the real
  //     one (one model declares 1000000, its documentation says about 1050000).
  const NEVOZMOZHNO = 1.5;
  let schetNedostoveren = false;
  // RU: Уже напечатанные отметки пути: одна строка на отметку за цикл.
  // EN: Path marks already printed: one line per mark per cycle.
  const otmecheno = new Set();

  // RU: Служба состояния сессии: учёт вызова, решение о тревоге, итог и ответ «можно ли ещё».
  // EN: The session-state service: counting a call, deciding on the alarm, the total and the "may I go on"
  //     answer.
  const sluzhba = {
    /**
     * RU: Учесть расход одного вызова. usage отсутствует — это незнание, а не ноль. zanyatost = false — расход
     *     учесть, занятость окна и тревогу не трогать.
     * EN: Count the spend of one call. A missing usage is ignorance, not zero. zanyatost = false — count the
     *     spend, leave window occupancy and the alarm alone.
     */
    uchest(usage, zanyatost = true) {
      schet.uchest(usage, zanyatost);
      if (!zanyatost) return schet.itog();
      if (usage !== undefined && usage !== null) neizvestno = false;
      const i = schet.itog();
      // RU: ПОРОГ СЧИТАЕТСЯ ОТ ЗАНЯТОСТИ, А НЕ ОТ СУММЫ (03.09.2026). Прежде здесь стояло `i.neMenshe >= predel
      //     * dolya` — сумма входов по всем вызовам. Она растёт без предела, поэтому порог переходился раньше
      //     времени, а после компакта не возвращался назад НИКОГДА: подтолкнуть было уже не к чему, а число всё
      //     росло.
      // EN: THE THRESHOLD IS COMPUTED FROM OCCUPANCY, NOT FROM THE SUM (03.09.2026). This used to be
      //     `i.neMenshe >= predel * dolya` — the sum of inputs over all calls. It grows without bound, so the
      //     threshold was crossed too early and NEVER came back after compaction: there was nothing left to
      //     nudge towards, yet the number kept growing.
      if (predel > 0 && typeof i.zanyato === 'number') {
        // RU: Порядок разбора: сначала ДОСТОВЕРНОСТЬ счёта, затем ОТМЕТКИ ПУТИ, затем тревога. Недостоверный
        //     счёт (занятость больше полутора окон) обрывает разбор: ни отметок, ни тревоги; строка о нём
        //     печатается один раз, до следующего компакта.
        //     Отметки идут до тревоги: они про наблюдение, а не про решение, и на поведение пакета не влияют
        //     вовсе. Каждая печатается один раз за цикл.
        // EN: Order of analysis: first the count's CREDIBILITY, then PATH MARKS, then the alarm. A non-credible
        //     count (occupancy above one and a half windows) stops the analysis: no marks, no alarm; its line
        //     is printed once, until the next compaction.
        //     Marks come before the alarm: they are about observation, not decision, and do not affect the
        //     package's behaviour at all. Each is printed once per cycle.
        const nedostoverno = i.zanyato > predel * NEVOZMOZHNO;
        if (nedostoverno && !schetNedostoveren) {
          schetNedostoveren = true;
          say('СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН: занято ' + i.zanyato + ' при окне ' +
               predel + ' ток. Заполнение окна НЕ МОЖЕТ превышать само окно, значит ' +
               'число говорит О ПРИБОРЕ, а не о памяти агента. Тревогу переполнения ' +
               'НЕ подаю и к компакту НЕ толкаю: основание ложное. Вероятная причина: ' +
               'поставщик отдаёт usage НАКОПИТЕЛЬНО за сессию, а не за вызов. Проверка: ' +
               'два вызова подряд, и если input растёт от вызова к вызову, это она. ' +
               'ЧЕГО ЭТА ЗАЩИТА НЕ ЛОВИТ: занижение, любое неверное число В ПРЕДЕЛАХ окна и ' +
               'накопительный счёт, пока он не перерос полтора окна (между 1 и 1,5 окна тревога ' +
               'подаётся с пометкой «выше объявленного окна»).');
        }
        if (nedostoverno) return;
        for (const o of otmetki) {
          if (i.zanyato >= predel * o && !otmecheno.has(o)) {
            otmecheno.add(o);
            say('отметка пути ' + Math.round(o * 100) + '%: занято ' + i.zanyato +
                 ' из ' + predel + '. Это НАБЛЮДЕНИЕ, не тревога: порога здесь нет и ' +
                 'подталкивать не к чему. Строка нужна, чтобы между тревогами о величине ' +
                 'было известно хоть что-то — иначе перескок из-под порога сразу в отказ ' +
                 'нечем объяснить задним числом.');
          }
        }
        // RU: Порог перейдён, если занятость последнего вызова не меньше predel × dolya. Тревога подаётся ОДИН
        //     раз за цикл и тут же взводит вставку напоминания на следующий шаг агента.
        // EN: The threshold is crossed when the last call's occupancy is at least predel × dolya. The alarm is
        //     raised ONCE per cycle and at once arms the reminder insertion for the agent's next step.
        const perejden = i.zanyato >= predel * dolya;
        if (perejden && !trevogaPodana) {
          trevogaPodana = true;
          vstavkaVzvedena = true;
          zanyatoNaVzvode = i.zanyato;
          shagovPosleTrevogi = 0;
          say('пора подтолкнуть к компакту: занято ' + i.zanyato + ' из ' + predel +
               ' (порог ' + Math.round(dolya * 100) + '%). ' + opisaniePolnoty(i) +
               ' Занятость — вход ПОСЛЕДНЕГО вызова, у которого было число от провайдера;' +
               (i.bezChisla > 0
                 ? ' после него ' + i.bezChisla + ' вызовов пришли БЕЗ ЧИСЛА, значит она могла устареть.'
                 : ' вызовов без числа не было.') +
               ' Сумма расхода по всем вызовам при этом ' + i.neMenshe +
               ', и она может быть только БОЛЬШЕ. ' + poyasnenieEdinicy(i.neMenshe, predel) +
               (i.zanyato > predel
                 ? ' ⚠️ ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА (' + Math.round(i.zanyato / predel * 100) + '%): либо ' +
                   'настоящее окно больше объявленного, либо поставщик отдаёт usage НАКОПИТЕЛЬНО — тогда ' +
                   'тревога ложная. Проверка: два вызова подряд, растёт ли input от вызова к вызову.'
                 : ''));
        } else if (!perejden && trevogaPodana) {
          // RU: Отметки сбрасываются ВМЕСТЕ с тревогой: цикл кончился, путь начнётся заново.
          // EN: Marks are reset TOGETHER with the alarm: the cycle is over, the path starts again.
          otmecheno.clear();
          // RU: Тревога СНИМАЕТСЯ, когда занятость вернулась под порог: обычно это значит, что компакт прошёл.
          //     Механизм, который кричит однажды и молчит навсегда, не отличает «полегчало» от «я уже сказал».
          // EN: The alarm is CLEARED when occupancy is back below the threshold: usually that means compaction
          //     has happened. A mechanism that shouts once and stays silent forever cannot tell "it got better"
          //     from "I already said so".
          trevogaPodana = false;
          vstavkaVzvedena = false;  // RU: новый цикл — новое право на вставку · EN: a new cycle — a new right to insert
          zanyatoNaVzvode = null;
          say('занятость вернулась под порог: ' + i.zanyato + ' из ' + predel +
               ' — похоже, компакт прошёл. Подталкивать больше не о чем.' +
               ' Шагов между тревогой и этим мигом: ' +
               (shagovPosleTrevogi === null ? 'счёт не вёлся' : shagovPosleTrevogi) +
               ' (нижняя граница: шаги, дошедшие до обработчика).');
          shagovPosleTrevogi = null;
        }
      }
      return i;
    },

    /**
     * RU: Итог. Всегда нижняя оценка, всегда с указанием полноты.
     * EN: Total. Always a lower bound, always with its completeness.
     */
    itog() { return schet.itog(); },

    /**
     * RU: Расход одного вызова, без накопления.
     * EN: Spend of one call, without accumulation.
     */
    raskhodVyzova,

    /**
     * RU: Ответ на вопрос «можно ли ещё?» — намеренно НЕ булев. Утверждать «места хватает» на неполных данных
     *     пакет не вправе, поэтому возвращается либо sostoyanie 'porog-pereyden' (порог перейдён), либо
     *     'neizvestno' с причиной (pochemu) и числами полноты.
     * EN: The answer to "may I go on?" — deliberately NOT a boolean. The package has no right to claim "there
     *     is room" on incomplete data, so it returns either sostoyanie 'porog-pereyden' (threshold crossed) or
     *     'neizvestno' (unknown) with a reason (pochemu) and completeness numbers.
     */
    hvatitLi() {
      const i = schet.itog();
      if (predel === 0) {
        return { sostoyanie: 'neizvestno', pochemu: 'предел не задан',
                 uchtenoVyzovov: i.uchtenoVyzovov, bezChisla: i.bezChisla };
      }
      if (typeof i.zanyato !== 'number') {
        return { sostoyanie: 'neizvestno',
                 pochemu: 'занятость окна ещё не измерена: ни одного вызова с числом от провайдера',
                 neMenshe: i.neMenshe, predel,
                 uchtenoVyzovov: i.uchtenoVyzovov, bezChisla: i.bezChisla };
      }
      if (i.zanyato >= predel * dolya) {
        return { sostoyanie: 'porog-pereyden', zanyato: i.zanyato, neMenshe: i.neMenshe,
                 predel, uchtenoVyzovov: i.uchtenoVyzovov, bezChisla: i.bezChisla };
      }
      // RU: Числа полноты отдаются ПОЛЯМИ, а не только строкой: «неизвестно» должно быть с мерой, иначе
      //     вызывающий не может решить, насколько сильно он не знает. Строка — человеку, поля — коду.
      // EN: Completeness numbers are returned as FIELDS, not only as a string: "unknown" must come with a
      //     measure, otherwise the caller cannot decide how much it does not know. The string is for a human,
      //     the fields are for code.
      return {
        sostoyanie: 'neizvestno',
        pochemu: i.polnyj
          ? 'по учтённой части порог не перейдён; все вызовы учтены, но провайдер мог не прислать число по части из них ранее'
          : 'по учтённой части порог не перейдён, НО ' + i.bezChisla + ' вызовов без числа — сколько они стоили, неизвестно',
        neMenshe: i.neMenshe,
        predel,
        uchtenoVyzovov: i.uchtenoVyzovov,
        bezChisla: i.bezChisla,
      };
    },
  };


    // RU: neizvestno(reason) — переход в неизвестность после успешного компакта или негодного события:
    //     занятость забывается; тревога, вставка, отметки и недостоверность сбрасываются; расход (сумма)
    //     сохраняется. Пока не придёт свежий usage основной модели, пакет не подталкивает. Строка печатается
    //     один раз на переход.
    // EN: neizvestno(reason) — entering the unknown state after a successful compaction or an invalid event:
    //     occupancy is forgotten; alarm, insertion, marks and non-credibility are reset; spend (the sum) is
    //     kept. Until a fresh usage of the main model arrives the package does not nudge. The line is printed
    //     once per transition.
    sluzhba.neizvestno = (reason = 'после сжатия давление неизвестно до свежего usage основной модели; расход сохранён') => {
      schet.zabytZanyatost();
      trevogaPodana = false; vstavkaVzvedena = false;
      zanyatoNaVzvode = null; shagovPosleTrevogi = null;
      otmecheno.clear(); schetNedostoveren = false;
      if (!neizvestno) say(reason);
      neizvestno = true;
    };
    // RU: events(events, replay) — разбор событий журнала сессии; replay = true — восстановление: счёт ведётся,
    //     строки не печатаются.
    //     assistant/message — учесть usage; занятость обновляется только при числовом inputTokens. user/message
    //     от самого пакета — напоминание уже в журнале, вставку гасим. compaction/summary — расход сумматора
    //     учитывается, но не как занятость окна. compaction/end без ошибки и с известным compactionId —
    //     давление неизвестно (neizvestno).
    // EN: events(events, replay) — parses session journal events; replay = true is a restore: counting goes on,
    //     lines are not printed.
    //     assistant/message — count usage; occupancy is updated only when inputTokens is a number. user/message
    //     from this package itself — the reminder is already in the journal, clear the insertion.
    //     compaction/summary — the summariser's spend is counted, but not as window occupancy. compaction/end
    //     without an error and with a known compactionId — pressure becomes unknown (neizvestno).
    sluzhba.events = (events, replay = false) => {
      quiet = replay;
      try {
        for (const event of events) {
          if (event.type === 'assistant/message') {
            const usage = event.data?.usage;
            const fresh = usage && typeof usage.inputTokens === 'number' && Number.isFinite(usage.inputTokens);
            sluzhba.uchest(usage, !!fresh);
          }
          if (event.type === 'user/message' && (event.data?.source?.kind === 'plugin:dsh-pamyat-nudzh' || (event.data?.source?.kind === 'plugin' && event.data?.source?.plugin === name))) {
            vstavkaVzvedena = false; zanyatoNaVzvode = null;
          }
          if (event.type === 'compaction/summary') {
            sluzhba.uchest(event.data?.usage, false);
            if (event.data?.compactionId) summaries.add(event.data.compactionId);
          }
          if (event.type === 'compaction/end') {
            const id = event.data?.compactionId;
            if (id && summaries.has(id) && event.data?.error === undefined) sluzhba.neizvestno();
            summaries.delete(id);
          }
        }
      } finally { quiet = false; }
    };
    // RU: replayed() — после восстановления по журналу: если сессия осталась в неизвестности (компакт без
    //     свежего usage после него), сказать об этом один раз.
    // EN: replayed() — after a restore from the journal: if the session is left in the unknown state
    //     (compaction with no fresh usage after it), say so once.
    sluzhba.replayed = () => {
      if (neizvestno) say('после сжатия давление неизвестно до свежего usage основной модели; восстановлено из журнала');
    };
    // RU: vstavit(decision, agent) — перед шагом агента: если вставка взведена, добавить модели одно
    //     напоминание с числами занятости (kind 'enter'); иначе вернуть решение платформы как есть. В
    //     неизвестности после компакта не вставлять ничего.
    // EN: vstavit(decision, agent) — before an agent step: if the insertion is armed, add one reminder with
    //     occupancy numbers for the model (kind 'enter'); otherwise return the platform's decision unchanged.
    //     In the unknown state after compaction insert nothing.
    sluzhba.vstavit = (decision, agent) => {
      if (neizvestno) return decision;
    // RU: Счёт идёт, ПОКА ТРЕВОГА ПОДАНА, а не пока взведена вставка: вставка гасится на первом же шаге, и счёт
    //     по ней замер бы на единице всегда — прибор показывал бы собственное устройство вместо предмета.
    // EN: Counting runs WHILE THE ALARM IS RAISED, not while the insertion is armed: the insertion is cleared
    //     on the very first step, and a count tied to it would always freeze at one — the instrument would show
    //     its own construction instead of the subject.
    if (trevogaPodana && shagovPosleTrevogi !== null) shagovPosleTrevogi += 1;
    if (!vstavkaVzvedena) return decision;
    // RU: ГАСИМ ДО СБОРКИ СООБЩЕНИЯ, А НЕ ПОСЛЕ. Погасив после, мы оставили бы флаг взведённым при исключении
    //     внутри сборки — и напоминание пришло бы на КАЖДОМ шаге до конца цикла. Цена ошибки несимметрична:
    //     потерять одно напоминание дешевле, чем засыпать ими весь разговор.
    // EN: CLEAR BEFORE BUILDING THE MESSAGE, NOT AFTER. Clearing afterwards would leave the flag armed if
    //     building threw — and the reminder would arrive on EVERY step until the end of the cycle. The cost of
    //     error is asymmetric: losing one reminder is cheaper than flooding the whole conversation with them.
    vstavkaVzvedena = false;
    const zanyato = zanyatoNaVzvode;
    zanyatoNaVzvode = null;
    const text =
      'Приближается компакт: занято ' + zanyato + ' из ' + predel + ' токенов. ' +
      'Запиши сейчас в память то, что должно пережить компакт: решения, выводы, ' +
      'наблюдения, факты — с числами, путями и командами. Что не записано, после ' +
      'компакта не восстановится.';
    // RU: След прихода: без него живая проба невозможна по построению — вставка произойдёт, а доказать её будет
    //     нечем.
    // EN: A trace of arrival: without it a live probe is impossible by construction — the insertion would
    //     happen, with nothing to prove it.
    say('напоминание вставлено в сессию ' +
         String(agent?.session?.id ?? agent?.id ?? '?') + ' (занято ' + zanyato + ')');
    // RU: ФАБРИКА ШТАТНАЯ, НЕ ЛИТЕРАЛ. Сообщение, собранное вручную как {role, content, source}, идёт БЕЗ поля
    //     id, и платформа считает такую user/message устаревшей записью — это стоило обрыва журнала 03.09 у
    //     соседнего пакета (dsh-pamyat-restore). Здесь тот же шов, значит те же грабли.
    // EN: THE STANDARD FACTORY, NOT A LITERAL. A message assembled by hand as {role, content, source} has NO id
    //     field, and the platform treats such a user/message as an obsolete record — that cost a broken journal
    //     on 03.09 in a sibling package (dsh-pamyat-restore). Same seam here, same rake.
    return {
      kind: 'enter',
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: `plugin:${name}`, form: 'snapshot', sections: [{ name, text }] },  // RU: формат журнала v4 (DSH 0.2) не принимает kind 'plugin', отсюда 'plugin:<имя>' · EN: journal format v4 (DSH 0.2) rejects kind 'plugin', hence 'plugin:<name>'
      })],
    };
    };
    return sluzhba;
  }
  // RU: ПОСЕССИОННОЕ СОСТОЯНИЕ: тревога, вставка и неизвестность принадлежат сессии, а не процессу. legacy —
  //     общее состояние старого прямого API без сессии (uchest(usage) без второго аргумента); states —
  //     состояния по ключу session.id; all — все состояния, из которых itog() без сессии складывает расход.
  // EN: PER-SESSION STATE: the alarm, the insertion and the unknown state belong to a session, not to the
  //     process. legacy is the shared state of the old direct API without a session (uchest(usage) with no
  //     second argument); states are the states keyed by session.id; all holds every state, from which itog()
  //     without a session sums the spend.
  const legacy = novoeSostoyanie();
  const states = new Map();
  const sessionKey = (session) => session?.id ?? session;
  const all = new Map([[legacy, legacy]]);
  let last = legacy, lastState = null, legacyUsed = false;
  // RU: history(session) — журнал событий сессии: через службу pamyat (sobytiyaSessii), иначе
  //     session.snapshotEvents(), иначе session.events. Унаследованная часть (inheritedEventCount или
  //     seedLength — то, что сессия получила от родителя) отрезается: её расход не наш. Нет журнала или
  //     негодная граница — исключение, которое sync превращает в СЛЕПОТУ.
  // EN: history(session) — the session's event journal: via the pamyat service (sobytiyaSessii), else
  //     session.snapshotEvents(), else session.events. The inherited part (inheritedEventCount or seedLength —
  //     what the session got from its parent) is cut off: its spend is not ours. No journal or an invalid
  //     boundary — an exception that sync turns into BLINDNESS.
  function history(session) {
    let pm;
    try { pm = ctx.get?.('pamyat'); } catch { pm = undefined; }
    const events = typeof pm?.sobytiyaSessii === 'function' ? pm.sobytiyaSessii(session)
      : typeof session?.snapshotEvents === 'function' ? session.snapshotEvents() : session?.events;
    if (!Array.isArray(events)) throw new Error('журнал сессии недоступен');
    const inherited = session?.inheritedEventCount ?? session?.header?.inheritedEventCount
      ?? session?.seedLength ?? session?.header?.seedLength ?? 0;
    if (!Number.isInteger(inherited) || inherited < 0 || inherited > events.length)
      throw new Error('негодная граница наследованного журнала');
    return events.slice(inherited);
  }
  // RU: stateFor(session) — состояние сессии; без объекта сессии — legacy. Новое состояние заводится при первом
  //     обращении.
  // EN: stateFor(session) — the session's state; without a session object — legacy. A new state is created on
  //     first access.
  function stateFor(session) {
    if (!session || typeof session !== 'object') return { service: legacy, cursor: 0, initialized: true };
    let state = states.get(sessionKey(session));
    if (!state) {
      state = { service: novoeSostoyanie(), cursor: 0, initialized: false, blind: false, liveSeen: new WeakSet(), unanchored: false };
      states.set(sessionKey(session), state); all.set(session.id ?? session, state.service);
    }
    return state;
  }
  // RU: sync(session, event) — догнать состояние сессии по её журналу с курсора. Первый проход — восстановление
  //     (тихо), дальше — живые события с печатью.
  //     Негодное событие → «СЛЕПОТА nudzh: событие seq=…», давление неизвестно, расход неполон. Журнал
  //     недоступен или укорочен → СЛЕПОТА, вставка в эту сессию запрещена. Если сессия ещё ни разу не была
  //     прочитана, живое событие учитывается тихо и помечает состояние «без якоря» (unanchored), чтобы при
  //     первом удачном чтении журнала начать с нуля и не учесть событие дважды.
  // EN: sync(session, event) — catch the session's state up with its journal from the cursor. The first pass is
  //     a restore (quiet), after that live events print.
  //     An invalid event → "СЛЕПОТА nudzh: событие seq=…" (blindness), pressure unknown, spend incomplete.
  //     Journal unavailable or shortened → BLINDNESS, insertion into this session is forbidden. If the session
  //     has never been read yet, the live event is counted quietly and marks the state as unanchored, so that
  //     on the first successful journal read counting restarts from zero and the event is not counted twice.
  function sync(session, event) {
    if (!session || typeof session !== 'object') {
      if (event) legacy.events([event]); last = legacy; lastState = null; return legacy;
    }
    let state = stateFor(session);
    try {
      const events = history(session);
      if (events.length < state.cursor) throw new Error('журнал укорочен; требуется новая сессия');
      if (state.unanchored) {
        state.service = novoeSostoyanie(); all.set(session.id ?? session, state.service);
        state.cursor = 0; state.initialized = false; state.unanchored = false;
      }
      const replay = !state.initialized;
      while (state.cursor < events.length) {
        try { state.service.events([events[state.cursor]], replay); }
        catch (e) {
          state.service.uchest(undefined, false);
          state.service.neizvestno('давление неизвестно: негодное событие usage; расход неполон');
          krik('СЛЕПОТА nudzh: событие seq=' + events[state.cursor]?.seq + ': ' + e.message);
        }
        state.cursor++;
      }
      if (replay) state.service.replayed();
      state.initialized = true; state.blind = false;
    } catch (e) {
      // RU: Неизвестность журнала не означает, что можно повторить старую вставку.
      // EN: Not knowing the journal does not mean an old insertion may be repeated.
      if (!state.blind) krik('СЛЕПОТА nudzh: ' + e.message + '; session=' + String(session.id ?? '?') + '; вставка запрещена');
      state.blind = true;
      if (event && !state.initialized && !state.liveSeen.has(event)) {
        state.service.events([event], true); state.liveSeen.add(event); state.unanchored = true;
      }
    }
    last = state.service; lastState = state;
    return state.service;
  }
  // RU: Служба nudzhPamyati — то, что видят другие плагины: uchest(usage, session?), itog(session?),
  //     hvatitLi(session?), raskhodVyzova(usage). С сессией — работа по её журналу; без сессии — старый прямой
  //     API на одном общем состоянии. itog() без сессии суммирует расход по ВСЕМ состояниям, а занятость берёт
  //     у последнего тронутого.
  // EN: The nudzhPamyati service — what other plugins see: uchest(usage, session?), itog(session?),
  //     hvatitLi(session?), raskhodVyzova(usage). With a session it works from that session's journal; without
  //     one — the old direct API on one shared state. itog() without a session sums spend over ALL states and
  //     takes occupancy from the last one touched.
  const sluzhba = {
    uchest(usage, session) {
      // RU: A-N-1948 №3 (№3): с сессией учёт — только через её журнал (ARCHITECTURE.md). Прибавлять usage поверх догнанного журнала
      //     значило бы учесть то же событие дважды. usage вызова, которого в журнале нет, здесь не учитывается.
      // EN: A-N-1948 №3 (№3): with a session, count only through its journal; adding usage on top would double-count the same event.
      if (session) { sync(session); return; }
      legacyUsed = true; last = legacy; lastState = null; return legacy.uchest(usage);
    },
    itog(session) {
      if (session) {
        const result = sync(session).itog();
        return stateFor(session).blind ? { ...result, zanyato: null } : result;
      }
      const result = { ...last.itog() };
      for (const key of ['neMenshe', 'vhod', 'vyhod', 'izNihRassuzhdenie', 'uchtenoVyzovov', 'bezChisla'])
        result[key] = [...all.values()].reduce((n, s) => n + s.itog()[key], 0);
      result.polnyj = result.bezChisla === 0;
      if (lastState?.blind) result.zanyato = null;
      return result;
    },
    hvatitLi(session) {
      const service = session ? sync(session) : last;
      if ((session ? stateFor(session) : lastState)?.blind) return { sostoyanie: 'neizvestno', pochemu: 'журнал сессии недоступен' };
      return service.hvatitLi();
    },
    raskhodVyzova,
  };
  // RU: Публикация службы и два обработчика: session/event — учёт каждого события сессии; agent/pre-step —
  //     вставка напоминания.
  // EN: Publishing the service and two handlers: session/event — counting every session event; agent/pre-step —
  //     inserting the reminder.
  ctx.provide('nudzhPamyati', sluzhba);
  ctx.on('session/event', (session, event) => {
    if (!event) return;
    try { sync(session, event); }
    catch (e) { krik('не смог учесть расход: ' + e.message); }
  });
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    // RU: Сначала решение остальных обработчиков (next). Отказ или оборванный шаг не трогаем; в слепую сессию
    //     ничего не вставляем.
    // EN: First the decision of the other handlers (next). A rejection or an aborted step is left alone;
    //     nothing is inserted into a blind session.
    const decision = await next();
    if (decision.kind === 'reject' || signal?.aborted) return decision;
    const session = agent?.session;
    // RU: Прямой старый API без session используется только вызывающим, который сам учёл usage.
    // EN: The old direct API without a session is used only by a caller that counted usage itself.
    if (legacyUsed && !states.has(sessionKey(session))) return legacy.vstavit(decision, agent);
    const service = sync(session);
    if (session && stateFor(session).blind) return decision;
    return service.vstavit(decision, agent);
  });
}

/**
 * RU: 🔴 ЕДИНИЦА ЭТОГО ЧИСЛА, названная рядом с ним самим.
 *     neMenshe — это СУММА расхода по вызовам: сколько токенов прошло через API. Каждый вызов шлёт весь
 *     контекст заново, поэтому сумма растёт БЕЗ ПРЕДЕЛА и компакция её не уменьшает — это величина счёта за
 *     работу, а не заполненность окна.
 *     Заполненность окна — другое число: ctx.tokenMeter.measure(session).totalTokens, «current
 *     request-and-response pressure» по контракту dsh-token-meter. Именно его платформа сравнивает со своим
 *     порогом, и именно оно падает после компакта.
 *     Почему это записано: 03.09.2026 пакет напечатал «израсходовано НЕ МЕНЬШЕ 1255120 из 1000000» при ДВУХ
 *     учтённых вызовах — и сжатия не последовало. Читается это как «контекст переполнен на четверть», а
 *     означает «два вызова суммарно стоили столько». Два ВЕРНЫХ числа про разные вещи; и наш собственный
 *     процент, посчитанный от суммы, был бы честным расчётом по негодному числителю.
 * EN: 🔴 THE UNIT OF THIS NUMBER, named right next to it.
 *     neMenshe is the SUM of spend over calls: how many tokens went through the API. Every call sends the whole
 *     context again, so the sum grows WITHOUT BOUND and compaction does not reduce it — it is the size of the
 *     bill for the work, not the window fill.
 *     Window fill is a different number: ctx.tokenMeter.measure(session).totalTokens, "current
 *     request-and-response pressure" in the dsh-token-meter contract. That is what the platform compares with
 *     its own threshold, and that is what drops after compaction.
 *     Why this is written down: on 03.09.2026 the package printed "spent AT LEAST 1255120 of 1000000" with TWO
 *     counted calls — and no compaction followed. It reads as "the context is overfull by a quarter" but means
 *     "two calls together cost that much". Two CORRECT numbers about different things; and our own percentage
 *     computed from the sum would have been an honest calculation over an invalid numerator.
 */
function poyasnenieEdinicy(neMenshe, predel) {
  const kratno = predel > 0 ? (neMenshe / predel) : 0;
  const preduprezhdenie = kratno > 1
    ? ' Число уже БОЛЬШЕ предела, а это возможно без переполнения окна: сумма по' +
      ' вызовам не ограничена размером окна.'
    : '';
  return 'ЕДИНИЦА: это СУММА по вызовам (что прошло через API), а НЕ заполненность' +
         ' окна. Компакция сумму не уменьшает.' + preduprezhdenie +
         ' Заполненность меряет платформа: tokenMeter.measure(session).totalTokens.';
}

// RU: opisaniePolnoty(i) — строка полноты для крика: сколько вызовов учтено и сколько пришло без числа от
//     провайдера.
// EN: opisaniePolnoty(i) — the completeness string for a shout: how many calls were counted and how many came
//     without a provider number.
function opisaniePolnoty(i) {
  return i.polnyj
    ? 'Учтены все ' + i.uchtenoVyzovov + ' вызовов.'
    : 'Учтено ' + i.uchtenoVyzovov + ' вызовов, ещё ' + i.bezChisla + ' БЕЗ ЧИСЛА от провайдера.';
}
