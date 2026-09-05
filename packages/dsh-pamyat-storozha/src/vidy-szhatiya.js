/**
 * Опознание вида сжатия по событиям журнала сессии.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. Виды различаются полями, а поля объявлены платформой
 * (dsh-compaction/lib/types/types.d.ts). Держать это знание внутри сторожа значило бы
 * повторить чужой перечень по памяти — а мы за сутки трижды ловили себя на том, что
 * перечень, записанный рукой, отвечает про себя, а не про предмет.
 *
 * ЧТО СНЯТО С ПЛАТФОРМЫ (не по памяти, чтением объявлений):
 *   compaction/end     { compactionId, sourceCommandId?, turn, error? }
 *   compaction/summary { shadowedRange, shadowedSeqs, shadowedTokenCount,
 *                        provider, model, maxTokens?, usage? }
 *   compaction/prune   { shadowedRange, shadowedSeqs, shadowedTokenCount }
 *
 * 🔴 ТРИ ВИДА, А НЕ ДВА. В задании названы «естественное и принудительное». Замер
 * показал третий: prune — замена без модели. У него НЕТ ни provider, ни model, ни
 * usage: цена там не в токенах вызова, а в вытесненном объёме. Сторож, считающий
 * «сжатия» одним числом, сложит несравнимое.
 */

/** Признак принудительного: команда человека названа платформой явным полем. */
export const PRINUZHDENIE = 'sourceCommandId'

/**
 * @returns {'proval'|'prinuditelnoe'|'estestvennoe'} вид по событию конца.
 *
 * 🔴 ПРОВАЛ ПРОВЕРЯЕТСЯ ПЕРВЫМ. Поле error помечает НЕУДАВШУЮСЯ попытку: история не
 * урезана, сводки нет. Кто считает все compaction/end как «сжатий было столько-то»,
 * посчитает и провалы — и отчёт станет тем благополучнее, чем чаще ломается.
 */
export function vidKonca(data) {
  if (data?.error !== undefined) return 'proval'
  if (data?.[PRINUZHDENIE] !== undefined) return 'prinuditelnoe'
  return 'estestvennoe'
}

/**
 * Расход вызова сводки.
 * 🔴 «НЕ СООБЩЁН» — ЭТО НЕ НОЛЬ. usage объявлен платформой как необязательный
 * («Provider-reported token usage … when emitted»). Сторож, печатающий 0 при
 * отсутствии поля, соврёт тем убедительнее, чем аккуратнее выглядит строка.
 * @returns {{est: boolean, vsego: number|null}}
 */
export function rashod(usage) {
  if (usage === undefined || usage === null) return { est: false, vsego: null }
  const chisla = Object.values(usage).filter((v) => typeof v === 'number')
  if (chisla.length === 0) return { est: false, vsego: null }
  return { est: true, vsego: chisla.reduce((a, b) => a + b, 0) }
}

/**
 * Длительность между началом и концом.
 * 🔴 ПОЛЯ ДЛИТЕЛЬНОСТИ У СОБЫТИЙ НЕТ ВОВСЕ — проверено чтением объявлений. Считаем
 * по меткам времени, и в отчёте это называется своим именем: время между ЗАПИСЯМИ В
 * ЖУРНАЛ, а не работа модели. Между ними — очередь, ожидание и всё прочее.
 * @returns {number|null} миллисекунды, либо null если метки нет
 */
export function dlitelnost(nachaloMs, konecMs) {
  if (typeof nachaloMs !== 'number' || typeof konecMs !== 'number') return null
  const d = konecMs - nachaloMs
  return d >= 0 ? d : null
}
