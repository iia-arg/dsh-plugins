/**
 * Счёт расхода. Единственное место, где складываются числа провайдера.
 *
 * 🔴 ТРИ ПРАВИЛА АРИФМЕТИКИ, КАЖДОЕ СНЯТО С КОДА, А НЕ С ДОГАДКИ
 * (замер 03.09; способ — чтение @deepseek-ai/dsh-llm lib/types/types.d.ts и
 * адаптера dsh-llm-deepseek, функция mapUsage; оба взяты из ЖИВОГО ДЕРЕВА
 * ПЛАТФОРМЫ, dsh-llm 0.1.0-rc.8 — в наших контрактах dsh-llm нет вовсе):
 *
 * 1. Счётчики НЕПЕРЕСЕКАЮЩИЕСЯ. В типе дословно: «Counts are DISJOINT:
 *    inputTokens is uncached input only; billed input = sum of the three».
 *    В адаптере то же видно прямо: inputTokens = prompt_tokens − cacheRead.
 *    Значит ВХОД = inputTokens + cacheReadTokens + cacheWriteTokens.
 *    Счёт по одному inputTokens занижает расход тем сильнее, чем лучше
 *    работает кеш, — тихо и в приятную сторону.
 *
 * 2. reasoningTokens В СУММУ НЕ ИДЁТ. В адаптере оно берётся из
 *    `completion_tokens_details.reasoning_tokens`, а outputTokens — из
 *    `completion_tokens`. Это ДЕТАЛИЗАЦИЯ выхода, а не отдельная статья;
 *    сложить — двойной счёт. Поле показываем справочно.
 *
 * 3. ЧИСЛО ПРИХОДИТ НЕ ВСЕГДА. В контракте компакции поле помечено
 *    «Provider-reported token usage, WHEN EMITTED» и необязательно. Поэтому
 *    итог по построению НЕПОЛОН, и пакет называет его НИЖНЕЙ ОЦЕНКОЙ.
 */

/** Расход одного вызова: вход, выход и сколько из выхода ушло на рассуждение. */
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
    // Справочно, НЕ слагаемое: часть выхода, ушедшая на рассуждение.
    izNihRassuzhdenie: chislo(usage.reasoningTokens, 'reasoningTokens'),
  };
}

/** Копилка расхода по сессии. Помнит и то, чего НЕ СМОГЛА посчитать. */
export function zavestiSchet() {
  let vhod = 0, vyhod = 0, rassuzhdenie = 0;
  let poslednijVhod = null;   // занятость окна: вход ПОСЛЕДНЕГО вызова
  let uchteno = 0, bezChisla = 0;

  return {
    /** Учесть вызов. usage отсутствует — это НЕ ноль, это незнание. */
    uchest(usage) {
      if (usage === undefined || usage === null) { bezChisla++; return; }
      const r = raskhodVyzova(usage);
      vhod += r.vhod; vyhod += r.vyhod; rassuzhdenie += r.izNihRassuzhdenie;
      // 🔴 ЗАНЯТОСТЬ ОКНА — ЭТО ПОСЛЕДНИЙ ВЫЗОВ, А НЕ СУММА (03.09.2026).
      // Каждый вызов пересылает всю переписку заново, поэтому сумма входов считает одно
      // и то же по многу раз: она растёт без предела и компакция её не уменьшает. Замер
      // того дня: «израсходовано НЕ МЕНЬШЕ 1255120 из 1000000» при ДВУХ учтённых вызовах
      // и без всякого переполнения окна. Занятость же — это вход ПОСЛЕДНЕГО вызова, и
      // она падает после компакта, как ей и положено.
      // ⚠️ Сводка компакции (compaction/summary) тоже приходит с usage, и её вход снят
      // ДО сжатия. Значит сразу после компакта занятость покажет ещё старое, высокое
      // число и опустится на первом же следующем вызове. Знать это надо, лечить нечем:
      // другого замера в этот момент не существует.
      poslednijVhod = r.vhod;
      uchteno++;
    },
    /**
     * Итог. Называется НИЖНЕЙ ОЦЕНКОЙ намеренно: вызовы без числа
     * посчитаны быть не могут, и делать вид, что их не было, нельзя.
     */
    itog() {
      return {
        neMenshe: vhod + vyhod,
        // Занятость окна: вход последнего вызова. Отдаётся ОТДЕЛЬНЫМ полем, а не
        // вместо суммы: это разные величины, и обе бывают нужны. Пока вызовов не было,
        // занятость НЕИЗВЕСТНА — это null, а не ноль: ноль означал бы «окно пусто».
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
