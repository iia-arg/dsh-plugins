/**
 * Разбор события компакции: что именно затирается и чем это заменено.
 *
 * ЗАЧЕМ. Компакция заменяет кусок истории одной сводкой. То, что затёрто,
 * агенту больше недоступно — а среди затёртого бывают решения, ограничения и
 * обещания. Секретарь снимает с этого события знание ДО того, как исходное
 * станет недостижимым.
 *
 * КОНТРАКТ СОБЫТИЯ взят из типов платформы (dsh-compaction 0.1.1-rc.2,
 * lib/types/types.d.ts, SessionEventMap), а не из пересказа. Поля, на которые
 * опираемся:
 *   summary             — готовая сводка (ContentBlock[])
 *   shadowedRange       — {start, end}: границы затенённого куска
 *   shadowedSeqs        — номера затенённых событий; ИМЕННО ОНИ дают verbatim-ссылку
 *   shadowedTokenCount  — сколько токенов ушло под нож
 *   provider, model     — кто написал сводку; нужно, чтобы «чья это сводка»
 *                         имело ответ спустя месяцы
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Ни сети, ни записи, ни вызова модели: только
 * разбор. Событие приходит один раз и больше не повторится, поэтому разбор
 * обязан быть таким, чтобы его можно было проверить порчей на столе, без
 * платформы и без живой компакции.
 */

/** Достать текст из блоков содержимого. Блоки бывают разных видов; берём текстовые. */
export function tekstIzBlokov(bloki) {
  if (!Array.isArray(bloki)) return '';
  return bloki
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Разобрать полезную нагрузку `compaction/summary`.
 *
 * Возвращает { godno, znanie, pochemu } — а не бросает: событие приходит в
 * чужом потоке, и падение здесь оборвало бы обработку чужих событий тоже.
 * Негодное событие — это ОТВЕТ, а не исключение.
 */
export function razobratSvodku(dannye, { seansId = null } = {}) {
  if (!dannye || typeof dannye !== 'object') {
    return { godno: false, znanie: null, pochemu: 'событие без полезной нагрузки' };
  }
  const tekst = tekstIzBlokov(dannye.summary);
  if (!tekst) {
    return {
      godno: false, znanie: null,
      pochemu: 'в событии нет текста сводки. Записывать нечего — и это НЕ повод ' +
               'записать пустую строку: пустое знание неотличимо от отсутствующего.',
    };
  }
  const seqs = Array.isArray(dannye.shadowedSeqs) ? dannye.shadowedSeqs.filter((n) => Number.isInteger(n)) : [];
  if (seqs.length === 0) {
    return {
      godno: false, znanie: null,
      pochemu: 'в событии нет номеров затенённых записей. Знание без ссылки на источник ' +
               'проверить нельзя, а непроверяемому знанию цена ниже, чем его отсутствию.',
    };
  }
  // 🔴 Verbatim-ссылка: не «примерно там», а точный диапазон в журнале сессии.
  // Без него через месяц знание нельзя ни подтвердить, ни опровергнуть.
  const pervyj = Math.min(...seqs);
  const posledniy = Math.max(...seqs);
  const istochnik = (seansId ? seansId : 'session') + '#' + pervyj + (pervyj === posledniy ? '' : '-' + posledniy);

  return {
    godno: true,
    pochemu: 'событие разобрано',
    znanie: {
      soderzhim: tekst,
      istochnik,
      zatenennyhZapisej: seqs.length,
      zatenennyhTokenov: Number.isFinite(dannye.shadowedTokenCount) ? dannye.shadowedTokenCount : null,
      // Кто написал сводку. Пустые значения НЕ подставляем: «неизвестно» и
      // «написано неизвестной моделью» — разные утверждения.
      postavshchik: typeof dannye.provider === 'string' ? dannye.provider : null,
      model: typeof dannye.model === 'string' ? dannye.model : null,
      compactionId: dannye.compactionId ?? null,
    },
  };
}
