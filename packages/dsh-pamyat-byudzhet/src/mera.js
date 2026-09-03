/**
 * Мера стоимости записи — НАША, не платформенная. Это важно назвать прямо.
 *
 * 🔴 ЗНАЕМОЕ ПРО ЕДИНИЦЫ (замер 03.09, способ ниже). Платформа считает цену
 * компакта своим оценщиком и отдаёт готовое число в событии
 * (`compaction/prune.shadowedTokenCount`, в её же контракте описано как
 * «heuristic price under the token-meter's FIXED ESTIMATOR»). САМ ОЦЕНЩИК
 * НАРУЖУ НЕ ОТДАЁТСЯ: в dsh-compaction 0.1.1-rc.2 слово estimator встречается
 * ровно один раз — в комментарии к полю; в lib/ счётчика нет; среди exports
 * (`.`, `invariant`, `types`, `checkpoint`, `src/*`) его тоже нет.
 * Способ перепроверить: распаковать пакет и поискать счётчик в lib/ — если
 * появится, эту меру нужно заменить на их, а не «подогнать» под неё.
 *
 * Отсюда правило пакета: МЫ СЧИТАЕМ СВОЕЙ МЕРОЙ И ЗОВЁМ ЕЁ СВОЕЙ. Ни в одном
 * отказе не будет слова «токены» — только «оценка наша». Сверка с платформой
 * возможна лишь там, где оба числа видны в одном событии; для этого есть
 * отдельный способ `sverit`, а не молчаливое приравнивание.
 *
 * ⚠️ Сменят оценщик у себя — наши пределы поедут МОЛЧА: мы не узнаем об этом
 * ниоткуда, потому что их число приходит уже готовым. Единственный признак —
 * расхождение в `sverit`, и смотреть его надо самому.
 */

/** Во сколько символов оценивается одна единица нашей меры. Число, не слово. */
export const SIMVOLOV_NA_EDINICU = 4;

/**
 * Цена одной записи в единицах НАШЕЙ меры. Считается по содержимому плюс
 * небольшая надбавка на поля, которые поедут вместе с ним (класс, источник).
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
 * Сверка нашей меры с числом платформы — там, где ОБА видны в одном событии.
 * Возвращает отношение и расхождение в процентах; НЕ правит нашу меру сама.
 * Подгонять меру под чужое число нельзя: их оценщик может смениться, и тогда
 * подгонка станет невидимой ошибкой вместо видимого расхождения.
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
