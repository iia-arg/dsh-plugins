/**
 * RU: Подтверждение читает запись по полному id и различает dostavleno, ne-najdeno и ne-udalos-proverit. Ошибка связи не доказывает отсутствие. Поддерживаемый ответ OMEGA 1.5.13/1.5.19 печатает усечённый id и укороченный многострочный Source, сохраняя переносы. Нельзя искать id семантически в тексте или требовать полный id внутри усечённого ответа. Сверка использует только первые 40 нормализованных знаков образца, поэтому не доказывает равенство полного текста и может принять общий префикс.
 * EN: Confirmation reads a record by its full id and distinguishes dostavleno, ne-najdeno, and ne-udalos-proverit. A connection error does not prove absence. The supported OMEGA 1.5.13/1.5.19 response prints a truncated id and shortened multiline Source while preserving line breaks. Do not search semantically for an id inside the text or require the full id in a truncated response. Comparison uses only the first 40 normalized sample characters, so it does not prove full-text equality and may accept a shared prefix.
 */

/**
 * RU: Отсутствие распознаётся точной отдельной строкой Memory `mem-…` not found, не словами внутри знания.
 * EN: Recognize absence by an exact standalone Memory `mem-…` not found line, not those words inside knowledge.
 */
const SHABLON_NET = /^Memory\s+`mem-[0-9a-f]+`\s+not found\.?\s*$/im;

/**
 * RU: Source описывает запрошенную запись и заканчивается перед следующей записью списка, не перед заголовком внутри знания. Поддерживаются «## N. [тип] `mem-…`» и «N. `mem-…`»; жадный захват всего хвоста позволил бы подтвердить текст из похожей записи. Это внешний договор разметки: новая форма вроде «- `mem-…`» не создаст границу, и старые эталоны стенда не обнаружат смену протокола.
 * EN: Source describes the requested record and ends before the next list entry, not a heading within the knowledge. Support “## N. [type] `mem-…`” and “N. `mem-…`”; greedy capture of the entire suffix could confirm text from a similar record. This is an external markup contract: a new form such as “- `mem-…`” would create no boundary, and old test fixtures cannot detect protocol changes.
 */
const SHABLON_SOURCE =
  /\*\*Source:\*\*\s*`(mem-[0-9a-f]+)`\s*[—-]?\s*([\s\S]*?)(?=\n#{0,6}\s*\d+\.\s*(?:\[[^\]\n]*\]\s*)?`mem-|$)/;

/**
 * RU: Нормализовать пробелы и переносы для сравнения укороченного многострочного Source с образцом.
 * EN: Normalize spaces and line breaks when comparing shortened multiline Source with the sample.
 */
function rovno(t) {
  return String(t).replace(/\s+/g, ' ').trim();
}

/**
 * RU: Аргументы: otvet — сырой ответ; id — полный id записи; fragment — обязательный образец начала содержимого. Отсутствие образца возвращает незнание, а не подтверждение.
 * EN: Arguments: otvet is the raw response; id is the full record id; fragment is the required sample from the content start. A missing sample returns unknown, never confirmation.
 */
export function istolkovatOtvet(otvet, id, fragment = null) {
  if (typeof otvet !== 'string' || otvet.trim() === '') {
    return {
      sostoyanie: 'ne-udalos-proverit',
      pochemu: 'хранилище вернуло пустой ответ. Доставлено знание или нет — НЕИЗВЕСТНО.',
    };
  }
  if (SHABLON_NET.test(otvet)) {
    return {
      sostoyanie: 'ne-najdeno',
      pochemu: 'хранилище отвечает, что записи ' + id + ' у него нет. Знание НЕ доставлено.',
    };
  }
  // RU: A-N-1948 №3 (№2): образец из одних пробелов после rovno() пуст, а includes('') истинно для любой записи — это не образец.
  // EN: A-N-1948 №3 (№2): a whitespace-only sample is empty after rovno(); includes('') would match any record.
  if (!fragment || !rovno(fragment)) {
    return {
      sostoyanie: 'ne-udalos-proverit',
      pochemu:
        'подтверждение вызвано без образца содержимого — сверить, наша ли это запись, нечем. ' +
        'Опознаватель в ответе усечён, поэтому одного совпадения по нему мало.',
    };
  }
  // RU: Сверять id и текст только внутри Source: похожие записи в хвосте не могут подтверждать доставку запрошенной.
  // EN: Compare id and text only inside Source: similar records in the suffix cannot confirm delivery of the requested record.
  const najden = otvet.match(SHABLON_SOURCE);
  if (!najden) {
    return {
      sostoyanie: 'ne-udalos-proverit',
      pochemu:
        'в ответе нет строки Source — описания той самой записи. Ответ не о том, ' +
        'о чём спрашивали; считать это подтверждением нельзя.',
    };
  }
  const [, opoznavatelSource, tekstSource] = najden;
  if (!id.startsWith(opoznavatelSource)) {
    return {
      sostoyanie: 'ne-udalos-proverit',
      pochemu:
        'в строке Source стоит опознаватель ' + opoznavatelSource + ', а спрашивали про ' + id +
        '. Ответ описывает не нашу запись.',
    };
  }
  const obrazec = rovno(fragment).slice(0, 40);
  if (!rovno(tekstSource).includes(obrazec)) {
    return {
      sostoyanie: 'ne-najdeno',
      pochemu:
        'запись с таким опознавателем есть, но её содержимое не совпадает с нашим. ' +
        'Вероятно, хранилище слило нашу запись с похожей и вернуло опознаватель ЧУЖОЙ. ' +
        'Считать доставленным нельзя: под этим опознавателем лежит не наше знание.',
    };
  }
  return { sostoyanie: 'dostavleno', pochemu: 'запись найдена по опознавателю, содержимое сходится' };
}
