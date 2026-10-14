/**
 * RU: Счёт расхода. Единственное место, где складываются числа провайдера.
 *     🔴 ТРИ ПРАВИЛА АРИФМЕТИКИ, КАЖДОЕ СНЯТО С КОДА, А НЕ С ДОГАДКИ (замер 03.09; способ — чтение
 *     @deepseek-ai/dsh-llm lib/types/types.d.ts и адаптера dsh-llm-deepseek, функция mapUsage; оба взяты из
 *     исходников самой платформы, dsh-llm 0.1.0-rc.8 — в наших контрактах dsh-llm нет вовсе).
 *     1. Счётчики НЕПЕРЕСЕКАЮЩИЕСЯ. В типе дословно: «Counts are DISJOINT: inputTokens is uncached input only;
 *     billed input = sum of the three». В адаптере то же видно прямо: inputTokens = prompt_tokens − cacheRead.
 *     Значит ВХОД = inputTokens + cacheReadTokens + cacheWriteTokens. Счёт по одному inputTokens занижает
 *     расход тем сильнее, чем лучше работает кеш, — тихо и в приятную сторону.
 *     2. reasoningTokens В СУММУ НЕ ИДЁТ. В адаптере оно берётся из completion_tokens_details.reasoning_tokens,
 *     а outputTokens — из completion_tokens. Это ДЕТАЛИЗАЦИЯ выхода, а не отдельная статья; сложить — двойной
 *     счёт. Поле показываем справочно.
 *     3. ЧИСЛО ПРИХОДИТ НЕ ВСЕГДА. В контракте компакции поле помечено «Provider-reported token usage, WHEN
 *     EMITTED» и необязательно. Поэтому итог по построению НЕПОЛОН, и пакет называет его НИЖНЕЙ ОЦЕНКОЙ.
 * EN: Spend counting. The only place where provider numbers are added up.
 *     🔴 THREE ARITHMETIC RULES, EACH TAKEN FROM CODE, NOT FROM A GUESS (measured 03.09; method — reading
 *     @deepseek-ai/dsh-llm lib/types/types.d.ts and the dsh-llm-deepseek adapter, function mapUsage; both taken
 *     from the platform's own sources, dsh-llm 0.1.0-rc.8 — our contracts have no dsh-llm at all).
 *     1. The counters are DISJOINT. The type says verbatim: "Counts are DISJOINT: inputTokens is uncached input
 *     only; billed input = sum of the three". The adapter shows the same directly: inputTokens = prompt_tokens
 *     − cacheRead. So INPUT = inputTokens + cacheReadTokens + cacheWriteTokens. Counting inputTokens alone
 *     understates spend the more, the better the cache works — quietly and in the pleasant direction.
 *     2. reasoningTokens DO NOT GO INTO THE SUM. The adapter takes them from
 *     completion_tokens_details.reasoning_tokens, and outputTokens from completion_tokens. It is a BREAKDOWN of
 *     output, not a separate item; adding it is double counting. The field is shown for reference.
 *     3. THE NUMBER DOES NOT ALWAYS COME. In the compaction contract the field is marked "Provider-reported
 *     token usage, WHEN EMITTED" and is optional. So the total is INCOMPLETE by construction, and the package
 *     calls it a LOWER BOUND.
 */

/**
 * RU: Расход одного вызова: вход, выход и сколько из выхода ушло на рассуждение. Отсутствующее поле — 0; поле
 *     не число, бесконечность или отрицательное — исключение с именем поля. usage не объект — исключение.
 * EN: Spend of one call: input, output and how much of the output went to reasoning. A missing field is 0; a
 *     field that is not a number, is infinite or negative — an exception naming the field. usage that is not an
 *     object — an exception.
 */
export function raskhodVyzova(usage) {
  if (!usage || typeof usage !== 'object') {
    throw new Error('dsh-pamyat-nudzh: расход считается по объекту usage, получено ' + JSON.stringify(usage));
  }
  const chislo = (v, imya) => {
    if (v === undefined) return 0;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error('dsh-pamyat-nudzh: поле ' + imya + ' должно быть неотрицательным числом, получено ' + JSON.stringify(v));
    }
    return v;
  };
  const vhod = chislo(usage.inputTokens, 'inputTokens')
             + chislo(usage.cacheReadTokens, 'cacheReadTokens')
             + chislo(usage.cacheWriteTokens, 'cacheWriteTokens');
  const vyhod = chislo(usage.outputTokens, 'outputTokens');
  return {
    vhod,
    vyhod,
    vsego: vhod + vyhod,
    // RU: Справочно, НЕ слагаемое: часть выхода, ушедшая на рассуждение.
    // EN: For reference, NOT an addend: the part of output spent on reasoning.
    izNihRassuzhdenie: chislo(usage.reasoningTokens, 'reasoningTokens'),
  };
}

/**
 * RU: Копилка расхода по сессии. Помнит и то, чего НЕ СМОГЛА посчитать: вызовы без числа (bezChisla).
 * EN: A per-session spend accumulator. It also remembers what it COULD NOT count: calls without a number
 *     (bezChisla).
 */
export function zavestiSchet() {
  let vhod = 0, vyhod = 0, rassuzhdenie = 0;
  let poslednijVhod = null;   // RU: занятость окна: вход ПОСЛЕДНЕГО вызова · EN: window occupancy: input of the LAST call
  let uchteno = 0, bezChisla = 0;

  return {
    /**
     * RU: Учесть вызов. usage отсутствует — это НЕ ноль, а незнание: растёт bezChisla. zanyatost = false —
     *     расход учесть, занятость окна не трогать (так учитывается вызов сумматора компакции).
     * EN: Count a call. A missing usage is NOT zero but ignorance: bezChisla grows. zanyatost = false — count
     *     the spend, leave window occupancy alone (this is how the compaction summariser's call is counted).
     */
    uchest(usage, zanyatost = true) {
      if (usage === undefined || usage === null) { bezChisla++; return; }
      const r = raskhodVyzova(usage);
      vhod += r.vhod; vyhod += r.vyhod; rassuzhdenie += r.izNihRassuzhdenie;
      // RU: 🔴 ЗАНЯТОСТЬ ОКНА — ЭТО ПОСЛЕДНИЙ ВЫЗОВ, А НЕ СУММА (03.09.2026). Каждый вызов пересылает всю
      //     переписку заново, поэтому сумма входов считает одно и то же по многу раз: она растёт без предела, и
      //     компакция её не уменьшает. Замер того дня: «израсходовано НЕ МЕНЬШЕ 1255120 из 1000000» при ДВУХ
      //     учтённых вызовах и без всякого переполнения окна. Занятость же — это вход ПОСЛЕДНЕГО вызова, и она
      //     падает после компакта, как ей и положено.
      //     Расход сумматора учитывается, но окно основной модели он не измеряет.
      // EN: 🔴 WINDOW OCCUPANCY IS THE LAST CALL, NOT THE SUM (03.09.2026). Every call resends the whole
      //     conversation, so the sum of inputs counts the same thing many times: it grows without bound and
      //     compaction does not reduce it. Measurement of that day: "spent AT LEAST 1255120 of 1000000" with
      //     TWO counted calls and no window overflow at all. Occupancy is the input of the LAST call, and it
      //     drops after compaction, as it should.
      //     The summariser's spend is counted, but it does not measure the main model's window.
      if (zanyatost) poslednijVhod = r.vhod;
      uchteno++;
    },
    /**
     * RU: zabytZanyatost() — забыть занятость окна (после компакта): itog().zanyato снова null, то есть
     *     «неизвестно». Расход (сумма) при этом сохраняется.
     * EN: zabytZanyatost() — forget window occupancy (after compaction): itog().zanyato is null again, i.e.
     *     "unknown". Spend (the sum) is kept.
     */
    zabytZanyatost() { poslednijVhod = null; },
    // RU: Итог. Называется НИЖНЕЙ ОЦЕНКОЙ намеренно: вызовы без числа посчитаны быть не могут, и делать вид,
    //     что их не было, нельзя. polnyj — true, только если вызовов без числа не было.
    // EN: Total. It is called a LOWER BOUND on purpose: calls without a number cannot be counted, and
    //     pretending they did not happen is not allowed. polnyj is true only if there were no calls without a
    //     number.
    itog() {
      return {
        neMenshe: vhod + vyhod,
        // RU: Занятость окна — вход последнего вызова. Отдаётся ОТДЕЛЬНЫМ полем, а не вместо суммы: это разные
        //     величины, и обе бывают нужны. Пока вызовов не было, занятость НЕИЗВЕСТНА — это null, а не ноль:
        //     ноль означал бы «окно пусто».
        // EN: Window occupancy is the input of the last call. It is returned as a SEPARATE field, not instead
        //     of the sum: they are different quantities, and both are needed. Before any call, occupancy is
        //     UNKNOWN — null, not zero: zero would mean "the window is empty".
        zanyato: poslednijVhod,
        vhod,
        vyhod,
        izNihRassuzhdenie: rassuzhdenie,
        uchtenoVyzovov: uchteno,
        bezChisla,
        polnyj: bezChisla === 0,
      };
    },
  };
}
