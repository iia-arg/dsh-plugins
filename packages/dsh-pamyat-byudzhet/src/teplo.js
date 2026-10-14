/**
 * RU: Тепло записи — мера СПРОСА: пользуются ею или нет.
 *     ГЛАВНОЕ, И ЭТО ГРАНИЦА, А НЕ ОГОВОРКА: СЕГОДНЯ ТЕПЛО НИ НА ЧТО НЕ ВЛИЯЕТ. Оно вычисляется и печатается,
 *     но НЕ участвует в порядке и НИЧЕГО НЕ ОТСЕКАЕТ. Это прибор, а не правило. Причина не в осторожности, а в
 *     двух замерах:
 *     (1) ПОРЯДОК ПО ТЕПЛУ ТОЖДЕСТВЕН ПОРЯДКУ ПО СВЕЖЕСТИ. Замер на 31 живой записи: различий позиций НОЛЬ.
 *     Тепло здесь — чистая функция возраста, монотонно убывающая; ранжирование по ней и есть ранжирование по
 *     возрасту, то есть третий порядок, неотличимый от первого.
 *     (2) ПОРОГ НЕ ОТСЕКАЕТ НИЧЕГО. На тех же 31 записи тепло 0.9184…1.0000 при предлагаемом пороге «холодной»
 *     0.25. Вся история памяти была 1,7 суток при полураспаде 14 суток: мера не различает того, что короче её
 *     шага.
 *     ПЕРВОЕ УСЛОВИЕ ПЕРЕСМОТРА НАСТУПИЛО — И РЕШЕНИЕ ВСЁ РАВНО «ВЕС НЕ ВКЛЮЧАТЬ», НО ПО ДРУГОМУ ОСНОВАНИЮ.
 *     Прежде условием было «появится счётчик касаний → тепло перестанет совпадать со свежестью». Счётчик
 *     появился (ядро памяти alpha.43+), касания считаются: замер живой базы — отмечено 9 записей из 189.
 *     Держать прежнее условие значило бы держать в коде указание включить вес при замере, который этого не
 *     позволяет.
 *     Замер, отменивший прежнее условие (по журналу службы, две выдачи за 24,5 часа): выдано 8 записей (56,
 *     62…68), затем 9 записей (165, 169…176); пересечение 0, между 68 и 165 — 97 записей, не выданных ни разу.
 *     Отбор идёт по свежести, значит касания достаются только верхушке, и у каждой выдачи она своя. Вес за
 *     касание при таком отборе усилил бы свежесть под другим именем — ту беду, которую называет пункт (1).
 *     ЧЕГО ЭТО НЕ ЗНАЧИТ: поле касаний НЕ снимается. Снятие столбца необратимо и стёрло бы собранные отметки, а
 *     они — единственный ряд, по которому решение можно будет пересмотреть.
 *     НОВОЕ УСЛОВИЕ ПЕРЕСМОТРА, ПРОВЕРЯЕМОЕ ОДНОЙ КОМАНДОЙ (любое из трёх):
 *     ПЕРЕСЕЧЕНИЕ опознавателей двух соседних выдач станет больше нуля — тогда касания начнут различать записи,
 *     и вес станет входом, а не эхом свежести. Команда: journalctl -u <служба агента> --grep 'welcome-брифинг
 *     вставлен', сравнить два последних перечня опознавателей.
 *     Либо порядок отбора перестанет быть свежестью (появится другой).
 *     Либо история дорастёт до трёх полураспадов (42 суток) — распределение станет наблюдаемым, и порог
 *     холодной можно будет назначить по нему, а не по рассуждению.
 *     До этого числа ниже — гипотезы, помеченные гипотезами. Цена ожидания названа числом: выдача памяти
 *     случается примерно раз в сутки, а для замера эффекта веса нужно окно не меньше 100 ходов — это порядка
 *     ста суток, то есть «не в этом этапе».
 * EN: The warmth of a record is a measure of DEMAND: whether it is used or not.
 *     THE MAIN POINT, AND IT IS A BOUNDARY, NOT A CAVEAT: TODAY WARMTH AFFECTS NOTHING. It is computed and
 *     printed, but it does NOT take part in ordering and CUTS NOTHING. It is an instrument, not a rule. The
 *     reason is not caution but two measurements:
 *     (1) ORDER BY WARMTH IS IDENTICAL TO ORDER BY FRESHNESS. Measured on 31 live records: ZERO position
 *     differences. Warmth here is a pure, monotonically decreasing function of age; ranking by it is ranking by
 *     age, i.e. a third order indistinguishable from the first.
 *     (2) THE THRESHOLD CUTS NOTHING. On the same 31 records warmth was 0.9184…1.0000 against a proposed "cold"
 *     threshold of 0.25. The whole memory history was 1.7 days with a 14-day half-life: the measure cannot
 *     distinguish what is shorter than its step.
 *     THE FIRST REVISION CONDITION HAS OCCURRED — AND THE DECISION IS STILL "DO NOT ENABLE THE WEIGHT", BUT ON
 *     A DIFFERENT GROUND. The earlier condition was "a touch counter appears → warmth stops matching
 *     freshness". The counter appeared (memory core alpha.43+), touches are counted: measured on the live
 *     database — 9 of 189 records marked. Keeping the old condition would mean keeping an instruction in the
 *     code to enable the weight against a measurement that does not allow it.
 *     The measurement that cancelled the old condition (from the service log, two deliveries in 24.5 hours): 8
 *     records delivered (56, 62…68), then 9 records (165, 169…176); intersection 0, between 68 and 165 — 97
 *     records never delivered. Selection goes by freshness, so touches go only to the top, and each delivery
 *     has its own top. A touch weight under such selection would amplify freshness under another name — the
 *     problem point (1) names.
 *     WHAT THIS DOES NOT MEAN: the touch field is NOT removed. Dropping the column is irreversible and would
 *     erase the collected marks, and they are the only series by which the decision can be revisited.
 *     THE NEW REVISION CONDITION, CHECKABLE WITH ONE COMMAND (any of three):
 *     The INTERSECTION of identifiers of two neighbouring deliveries becomes greater than zero — then touches
 *     start distinguishing records and the weight becomes an input, not an echo of freshness. Command:
 *     journalctl -u <agent service> --grep 'welcome-брифинг вставлен', compare the two latest identifier lists.
 *     Or the selection order stops being freshness (another one appears).
 *     Or the history grows to three half-lives (42 days) — the distribution becomes observable and the cold
 *     threshold can be set from it rather than from reasoning.
 *     Until then the numbers below are hypotheses, marked as hypotheses. The cost of waiting is named as a
 *     number: memory delivery happens about once a day, and measuring the weight's effect needs a window of at
 *     least 100 turns — on the order of a hundred days, i.e. "not in this stage".
 */

/**
 * RU: POLURASPAD_MS — полураспад тепла, 14 суток. ГИПОТЕЗА: на живом корпусе не проверен и проверен быть не
 *     может — история короче полураспада. Ничего не отсекает, поэтому безвреден.
 * EN: POLURASPAD_MS — the warmth half-life, 14 days. A HYPOTHESIS: not verified on a live corpus and cannot be
 *     — the history is shorter than the half-life. It cuts nothing, so it is harmless.
 */
export const POLURASPAD_MS = 14 * 24 * 3600 * 1000;

/**
 * RU: POROG_HOLODNOJ — порог «холодной» записи, 0.25. ГИПОТЕЗА. Число печатается, чтобы было видно, сколько
 *     записей ниже него, а не чтобы по нему судить.
 * EN: POROG_HOLODNOJ — the "cold" record threshold, 0.25. A HYPOTHESIS. The number is printed to show how many
 *     records fall below it, not to judge by it.
 */
export const POROG_HOLODNOJ = 0.25;

/**
 * RU: VES_KASANIYA — прибавка за касание. Веса НЕТ намеренно: касания считаются, но достаются только верхушке
 *     по свежести (пересечение двух соседних выдач — 0), поэтому вес усилил бы свежесть, а не выявил спрос.
 *     Условие включения — в шапке файла, оно проверяется командой, а не рассуждением.
 * EN: VES_KASANIYA — the bonus per touch. There is deliberately NO weight: touches are counted but go only to
 *     the freshness top (intersection of two neighbouring deliveries — 0), so a weight would amplify freshness
 *     rather than reveal demand. The enabling condition is in the file header and is checked by a command, not
 *     by reasoning.
 */
export const VES_KASANIYA = 0;

/**
 * RU: teplo(zapis, teper) — тепло записи: рождается ПОЛНЫМ (1) и остывает вдвое за полураспад.
 *     Рождается полным, а не с нуля: иначе всё холодное с рождения, и механизм, заведённый хранить, съедает то,
 *     что должен хранить, в первый же день.
 *     Возвращает число 0..1 либо null — «тепло не измерялось». Это ТРЕТЬЕ состояние, не «холодная» и не ошибка:
 *     у записи без даты рождения тепла нет, а не ноль. Тот же довод, что для веры: пустота — не ноль.
 * EN: teplo(zapis, teper) — the warmth of a record: born FULL (1) and halving every half-life.
 *     Born full, not at zero: otherwise everything is cold from birth, and a mechanism set up to keep would eat
 *     what it should keep on the very first day.
 *     Returns a number 0..1 or null — "warmth never measured". This is a THIRD state, neither "cold" nor an
 *     error: a record without a birth date has no warmth, not zero. The same argument as for confidence:
 *     emptiness is not zero.
 */
export function teplo(zapis, teper = Date.now()) {
  // RU: ДВА ИМЕНИ ОДНОГО ПОЛЯ НА ГРАНИЦЕ ПАКЕТОВ (найдено замером). Ядро памяти называет время рождения
  //     sozdano, а слой восстановления, отдавая записи сюда, переименовывает его в kogda. Прибор тепла читал
  //     только sozdano — и в работе печатал «измерено 0, не измерено 10».
  //     Чем это хуже просто ошибки: число выглядело свойством ДАННЫХ («у записей нет даты»), а было свойством
  //     ПРИБОРА. Он не измерил ни одной записи с самого своего появления — и молчал об этом, потому что «не
  //     измерено» у него законный третий исход.
  //     Граница: синоним принимается ЗДЕСЬ, в одном месте. Плодить его дальше нельзя: третье имя того же поля
  //     уже никто не заметит. (Порядок 'svezhest' в otbor.js синонима не понимает — см. там.)
  // EN: TWO NAMES OF ONE FIELD AT THE PACKAGE BORDER (found by measurement). The memory core calls the birth
  //     time sozdano, while the restore layer renames it to kogda when passing records here. The warmth
  //     instrument read only sozdano — and in production printed "measured 0, unmeasured 10".
  //     Why this is worse than a plain bug: the number looked like a property of the DATA ("records have no
  //     date") but was a property of the INSTRUMENT. It measured not a single record since it appeared — and
  //     stayed silent, because "unmeasured" is a legitimate third outcome for it.
  //     Boundary: the synonym is accepted HERE, in one place. It must not spread further: a third name for the
  //     same field would go unnoticed. (The 'svezhest' order in otbor.js does not understand the synonym — see
  //     there.)
  const sozdano = Number(zapis?.sozdano ?? zapis?.kogda);
  if (!Number.isFinite(sozdano) || sozdano <= 0) return null;
  const vozrast = teper - sozdano;
  if (!(vozrast >= 0)) return 1;             // RU: из будущего — считаем свежайшей, а не отрицательной · EN: from the future — treated as freshest, not negative
  return 2 ** (-vozrast / POLURASPAD_MS);
}

/**
 * RU: raspredelenie(zapisi, teper) — распределение тепла по списку: измерено / не измерено, мин, медиана, макс,
 *     ниже порога, и три входа касаний. Прибор ставится РАНЬШЕ порога: пока порог не назначен, честно можно
 *     только печатать числа при каждом отборе, чтобы наклон появился из настоящих данных, а не из выдумки.
 * EN: raspredelenie(zapisi, teper) — the warmth distribution over a list: measured / unmeasured, min, median,
 *     max, below threshold, and the three touch inputs. The instrument comes BEFORE the threshold: until a
 *     threshold is set, the only honest thing is to print numbers on every selection so that the slope emerges
 *     from real data, not invention.
 */
export function raspredelenie(zapisi, teper = Date.now()) {
  const znacheniya = [];
  let neizmereno = 0;
  for (const z of zapisi ?? []) {
    const t = teplo(z, teper);
    if (t === null) neizmereno++; else znacheniya.push(t);
  }
  // RU: ТРИ ВХОДА ТЕПЛА СЧИТАЮТСЯ ПОРОЗНЬ. Пока вход один — возраст, — «тепло» есть свежесть под другим именем.
  //     Числа абсолютные: сколько записей ИМЕЮТ счётчик касаний, сколько касались хоть раз, когда касались в
  //     последний раз. Доля не печатается: знаменатель растёт, и доля тем благополучнее, чем дольше не чинишь.
  //     Граница: касания на тепло НЕ влияют, пока вес равен нулю (VES_KASANIYA). Эти три числа — наблюдение, а
  //     не вход в формулу.
  // EN: THE THREE WARMTH INPUTS ARE COUNTED SEPARATELY. While there is one input — age — "warmth" is freshness
  //     under another name. The numbers are absolute: how many records HAVE a touch counter, how many were
  //     touched at least once, when the last touch was. No share is printed: the denominator grows, and a share
  //     looks the better the longer nothing is fixed.
  //     Boundary: touches do NOT affect warmth while the weight is zero (VES_KASANIYA). These three numbers are
  //     an observation, not an input to the formula.
  let s_polem = 0, kasalis = 0, poslednee = null;
  for (const z of zapisi ?? []) {
    const k = z?.kasanij;
    if (k === null || k === undefined) continue;
    s_polem++;
    if (Number(k) > 0) kasalis++;
    const p = Number(z?.poslednee_kasanie);
    if (Number.isFinite(p) && p > 0 && (poslednee === null || p > poslednee)) poslednee = p;
  }
  znacheniya.sort((a, b) => a - b);
  const n = znacheniya.length;
  return {
    izmereno: n,
    neizmereno,
    kasanij_pole_est: s_polem,
    kasalis_hot_raz: kasalis,
    poslednee_kasanie: poslednee,
    ves_kasaniya: VES_KASANIYA,
    min: n ? znacheniya[0] : null,
    mediana: n ? znacheniya[n >> 1] : null,
    max: n ? znacheniya[n - 1] : null,
    holodnyh: znacheniya.filter((v) => v < POROG_HOLODNOJ).length,
    porog: POROG_HOLODNOJ,
    poluraspad_sutok: POLURASPAD_MS / (24 * 3600 * 1000),
    vliyaet_na_otbor: false,   // RU: читается вызывающим и печатается: см. шапку файла · EN: read by the caller and printed: see the file header
  };
}
