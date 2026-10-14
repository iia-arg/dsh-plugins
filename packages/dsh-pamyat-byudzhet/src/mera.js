/**
 * RU: Мера стоимости записи — НАША, не платформенная. Это важно назвать прямо.
 *     ЗНАЕМОЕ ПРО ЕДИНИЦЫ (замер 03.09, способ ниже). Платформа считает цену компакта своим оценщиком и отдаёт
 *     готовое число в событии (compaction/prune.shadowedTokenCount, в её контракте — «heuristic price under the
 *     token-meter's FIXED ESTIMATOR»). САМ ОЦЕНЩИК НАРУЖУ НЕ ОТДАЁТСЯ: в dsh-compaction 0.1.1-rc.2 слово
 *     estimator встречается ровно один раз — в комментарии к полю; в lib/ счётчика нет; среди exports (.,
 *     invariant, types, checkpoint, src/*) его тоже нет. Способ перепроверить: распаковать пакет и поискать
 *     счётчик в lib/ — если появится, эту меру нужно заменить на их, а не «подогнать» под неё.
 *     Правило пакета: МЫ СЧИТАЕМ СВОЕЙ МЕРОЙ И ЗОВЁМ ЕЁ СВОЕЙ. Ни в одном отказе нет слова «токены» — только
 *     «оценка наша». Сверка с платформой возможна лишь там, где оба числа видны в одном событии; для этого есть
 *     отдельная функция sverit, а не молчаливое приравнивание.
 *     Сменят оценщик у себя — наши пределы поедут МОЛЧА: мы не узнаем об этом ниоткуда, потому что их число
 *     приходит уже готовым. Единственный признак — расхождение в sverit, и смотреть его надо самому.
 * EN: The cost measure of a record is OURS, not the platform's. This must be said plainly.
 *     KNOWN ABOUT UNITS (measured 03.09, method below). The platform prices a compaction with its own estimator
 *     and hands out a ready number in the event (compaction/prune.shadowedTokenCount, described in its contract
 *     as "heuristic price under the token-meter's FIXED ESTIMATOR"). THE ESTIMATOR ITSELF IS NOT EXPORTED: in
 *     dsh-compaction 0.1.1-rc.2 the word estimator occurs exactly once — in a field comment; there is no
 *     counter in lib/; it is not among the exports (., invariant, types, checkpoint, src/*) either. How to
 *     re-check: unpack the package and search lib/ for a counter — if it appears, this measure must be replaced
 *     by theirs, not "fitted" to it.
 *     The package rule: WE COUNT WITH OUR OWN MEASURE AND CALL IT OURS. No refusal ever says "tokens" — only
 *     "оценка наша" (our estimate). Reconciliation with the platform is possible only where both numbers are
 *     visible in one event; the separate sverit function exists for that, not a silent equation.
 *     If they change their estimator, our limits will drift SILENTLY: we would learn it from nowhere, because
 *     their number arrives ready-made. The only sign is a discrepancy in sverit, and one has to look at it
 *     oneself.
 */

/**
 * RU: SIMVOLOV_NA_EDINICU — во сколько символов оценивается одна единица нашей меры. Число, а не слово;
 *     константа кода, а не настройка.
 * EN: SIMVOLOV_NA_EDINICU — how many characters one unit of our measure is worth. A number, not a word; a code
 *     constant, not a setting.
 */
export const SIMVOLOV_NA_EDINICU = 4;

/**
 * RU: ocenit(zapis) — цена одной записи в единицах НАШЕЙ меры: длина содержимого (soderzhim) плюс служебных
 *     полей, которые поедут вместе с ним (klass, istochnik), делённая на SIMVOLOV_NA_EDINICU с округлением
 *     вверх; не меньше 1. Не объект — исключение словами.
 * EN: ocenit(zapis) — the cost of one record in units of OUR measure: the length of the content (soderzhim)
 *     plus the service fields travelling with it (klass, istochnik), divided by SIMVOLOV_NA_EDINICU and rounded
 *     up; at least 1. Not an object — an exception in words.
 */
export function ocenit(zapis) {
  if (!zapis || typeof zapis !== 'object') {
    throw new Error('dsh-pamyat-byudzhet: оценивать нечего — запись не объект');
  }
  const tekst = String(zapis.soderzhim ?? '');
  const sluzhebnoe = String(zapis.klass ?? '') + String(zapis.istochnik ?? '');
  const dlina = tekst.length + sluzhebnoe.length;
  return Math.max(1, Math.ceil(dlina / SIMVOLOV_NA_EDINICU));
}

/**
 * RU: sverit({ nashe, platformennoe }) — сверка нашей меры с числом платформы там, где ОБА видны в одном
 *     событии. Возвращает отношение и расхождение в процентах; у платформы ноль — объясняет словами, а не
 *     делит. НЕ правит нашу меру: подгонять её под чужое число нельзя — их оценщик может смениться, и подгонка
 *     станет невидимой ошибкой вместо видимого расхождения.
 * EN: sverit({ nashe, platformennoe }) — reconcile our measure with the platform's number where BOTH are
 *     visible in one event. Returns the ratio and the discrepancy in percent; if the platform has zero it
 *     explains in words instead of dividing. It does NOT adjust our measure: fitting it to a foreign number is
 *     forbidden — their estimator may change, and the fitting would turn a visible discrepancy into an
 *     invisible error.
 */
export function sverit({ nashe, platformennoe }) {
  if (typeof nashe !== 'number' || typeof platformennoe !== 'number') {
    throw new Error('dsh-pamyat-byudzhet: сверять можно только два числа');
  }
  if (platformennoe === 0) {
    return { otnoshenie: null, rashozhdenieProcentov: null, pochemu: 'у платформы ноль — сверять не с чем' };
  }
  const otnoshenie = nashe / platformennoe;
  return {
    otnoshenie,
    rashozhdenieProcentov: Math.round(Math.abs(otnoshenie - 1) * 100),
    pochemu: null,
  };
}
