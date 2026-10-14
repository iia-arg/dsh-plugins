/**
 * RU: Чистые функции совместимости журнала сессии для DSH 0.1.1 и 0.1.7+/0.2.0. Потребители семейства
 *    получают их через ctx.pamyat.sobytiyaSessii, ctx.pamyat.nasledovano и ctx.pamyat.eSvodkaSzhatiya;
 *    импорт ядра по имени пакета обходил бы службу и создавал зависимость от отдельной загруженной копии.
 * EN: Pure session-journal compatibility functions for DSH 0.1.1 and 0.1.7+/0.2.0. Consumers in the package
 *    family receive them through ctx.pamyat.sobytiyaSessii, ctx.pamyat.nasledovano and
 *    ctx.pamyat.eSvodkaSzhatiya; importing core by package name would bypass the service and depend on a
 *    separately loaded copy.
 *
 * RU: В DSH 0.1.1 события доступны как session.events; в новых версиях используется snapshotEvents(). Поле
 *    inheritedEventCount заменяет seedLength. Сводка сжатия имеет источник compact-checkpoint; мигрированная
 *    история v4 представляет источник плагина как kind="plugin:X" вместо {kind:"plugin", plugin:X}. При
 *    миграции compact и dsh-compaction-basic также получают отдельные имена compact-checkpoint и
 *    compact-basic.
 * EN: DSH 0.1.1 exposes events as session.events; newer versions use snapshotEvents(). inheritedEventCount
 *    replaces seedLength. A compaction summary uses compact-checkpoint as its source; migrated v4 history
 *    represents a plugin source as kind="plugin:X" instead of {kind:"plugin", plugin:X}. Migration also
 *    renames compact and dsh-compaction-basic to compact-checkpoint and compact-basic.
 *
 * RU: Получить события: сначала массив session.events, затем массив из snapshotEvents(). undefined означает
 *    неподдерживаемый способ чтения, а [] — известный пустой журнал; вызывающий должен отличать их и
 *    сообщать о недоступном чтении. Исключение snapshotEvents() не перехватывается. Новые форматы источников
 *    не распознаются автоматически.
 * EN: Get events: use a session.events array first, then an array returned by snapshotEvents(). undefined
 *    means no supported reading method, while [] is a known empty journal; the caller must distinguish them
 *    and report unavailable reading. Exceptions from snapshotEvents() are not caught. New source formats are
 *    not recognized automatically.
 */
export function sobytiyaSessii(session) {
  if (Array.isArray(session?.events)) return session.events
  if (typeof session?.snapshotEvents === 'function') {
    const ev = session.snapshotEvents()
    if (Array.isArray(ev)) return ev
  }
  return undefined
}

/**
 * RU: Получить число событий, унаследованных в начале журнала от родительской сессии при форке или запуске
 *    субагента. Приоритет: inheritedEventCount, затем seedLength, затем 0. Здесь нет проверки типа и
 *    диапазона значения; неизвестный заголовок выглядит как отсутствие унаследованных событий.
 * EN: Get the number of leading events inherited from a parent session on a fork or subagent launch.
 *    Priority: inheritedEventCount, then seedLength, then 0. The value’s type and range are not validated
 *    here; an unknown header appears to have no inherited events.
 */
export function nasledovano(header) {
  return header?.inheritedEventCount ?? header?.seedLength ?? 0
}

/**
 * RU: Распознать сводку только среди user/message. Поддерживаются source.kind="compact-checkpoint", старое
 *    {kind:"plugin", plugin:"compact"} и kind="plugin:compact". Для svoiPlaginy принимаются обе плагинные
 *    формы с точным именем. Прочие типы событий и источники, включая compact-basic без отдельной обработки,
 *    возвращают false; содержимое сообщения не проверяется.
 * EN: Recognize a summary only in user/message events. Supported sources are
 *    source.kind="compact-checkpoint", the older {kind:"plugin", plugin:"compact"}, and
 *    kind="plugin:compact". Both plugin forms with an exact name are accepted for svoiPlaginy. Other event
 *    types and sources, including compact-basic without separate handling, return false; message content is
 *    not inspected.
 */
export function eSvodkaSzhatiya(event, svoiPlaginy = []) {
  if (event?.type !== 'user/message') return false
  const source = event.data?.source
  const kind = source?.kind
  if (typeof kind !== 'string') return false
  if (kind === 'compact-checkpoint') return true
  for (const imya of ['compact', ...svoiPlaginy]) {
    if ((kind === 'plugin' && source.plugin === imya) || kind === `plugin:${imya}`) return true
  }
  return false
}
