/**
 * RU: Чистый разбор compaction/summary связывает сводку с затенённым исходником. Контракт dsh-compaction 0.1.1-rc.2: summary — ContentBlock[]; shadowedRange — start/end; shadowedSeqs — события для точной ссылки; shadowedTokenCount — объём; provider/model — автор сводки. Здесь нет сети, записи и вызова модели; разбор можно проверить порчей без живого сжатия.
 * EN: Pure compaction/summary parsing links a summary to its shadowed source. The dsh-compaction 0.1.1-rc.2 contract supplies summary as ContentBlock[], shadowedRange as start/end, shadowedSeqs for an exact event reference, shadowedTokenCount for size, and provider/model for summary authorship. There is no networking, persistence, or model call here; mutation tests require no live compaction.
 */

/**
 * RU: Взять только текстовые блоки содержимого, не остальные виды.
 * EN: Take only text content blocks, not other block types.
 */
export function tekstIzBlokov(bloki) {
  if (!Array.isArray(bloki)) return '';
  return bloki
    .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * RU: Разбор возвращает {godno,znanie,pochemu}, не бросает: негодное событие не должно прерывать чужой поток событий.
 * EN: Parsing returns {godno,znanie,pochemu} without throwing: an invalid event must not interrupt the surrounding event stream.
 */
export function razobratSvodku(dannye, { seansId = null, istochnikYavno = null } = {}) {
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
  // RU: istochnikYavno служит ручному файловому входу без seq: ссылка на проверяемый файл вместо выдуманного диапазона журнала. Непустая строка обязательна; пустая не подменяется молча, чтобы не скрыть забытый источник.
  // EN: istochnikYavno serves manual file input with no seq: reference the verifiable file rather than invent a journal range. A nonempty string is required; never silently replace an empty value and hide a forgotten source.
  if (typeof istochnikYavno === 'string' && istochnikYavno.trim()) {
    const tolkoTekst = tekstIzBlokov(dannye.summary);
    return {
      godno: true,
      pochemu: 'сводка подана явным входом; источник назван вызовом, не выведен из журнала',
      znanie: {
        soderzhim: tolkoTekst,
        istochnik: istochnikYavno.trim(),
        zatenennyhZapisej: seqs.length,
        zatenennyhTokenov: Number.isFinite(dannye.shadowedTokenCount) ? dannye.shadowedTokenCount : null,
        seansId: seansId ?? null,
        postavshchik: typeof dannye.provider === 'string' ? dannye.provider : null,
        model: typeof dannye.model === 'string' ? dannye.model : null,
        compactionId: dannye.compactionId ?? null,
      },
    };
  }
  if (seqs.length === 0) {
    return {
      godno: false, znanie: null,
      pochemu: 'в событии нет номеров затенённых записей. Знание без ссылки на источник ' +
               'проверить нельзя, а непроверяемому знанию цена ниже, чем его отсутствию.',
    };
  }
  // RU: Verbatim-ссылка называет точный диапазон событий сессии, позволяя сверить знание с исходником.
  // EN: The verbatim reference names an exact session-event range so knowledge can be checked against its source.
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
      // RU: Не подставлять пустое имя автора: отсутствие данных об авторе отличается от утверждения о неизвестной модели.
      // EN: Do not substitute an empty author name: missing authorship data differs from a claim about an unknown model.
      postavshchik: typeof dannye.provider === 'string' ? dannye.provider : null,
      model: typeof dannye.model === 'string' ? dannye.model : null,
      compactionId: dannye.compactionId ?? null,
    },
  };
}
