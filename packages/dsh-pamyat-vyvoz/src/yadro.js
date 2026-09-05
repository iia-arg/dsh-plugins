/**
 * ДОГОВОР С ЯДРОМ — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ВЫВОЗ КАСАЕТСЯ ФИЛЬТРА.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. 04.09.2026 у потребителя, писавшего вывоз, СВОЙ список
 * запирающих классов совпал со списком ядра в ОДНОМ классе из четырёх: наружу ушли бы
 * uuid-объявленный, hex без объявления и все структурные. Причина не в невнимательности —
 * решения «какой класс запирает» среди экспортов ядра не было вовсе, и потребителю
 * оставалось копировать глазами. Здесь мы НЕ ДЕРЖИМ СВОЕГО СПИСКА: спрашиваем ядро.
 *
 * 🔴 FAIL-CLOSED С НАШЕЙ СТОРОНЫ (условие приёмки В12). Односторонняя проверка бесполезна:
 * ядро может объявить договор, но ломается всегда чужая половина. Поэтому:
 *   ядро не загрузилось             → ОТКАЗ с причиной, файла вывоза НЕТ
 *   функции нет среди экспортов     → ОТКАЗ
 *   форма ответа не та, что в договоре → ОТКАЗ
 * И ни при каких условиях — не «вывозим пока без фильтра». Вывоз без фильтра выглядел бы
 * как успешная выгрузка, а был бы выносом корпуса, не прошедшего проверку.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: договор проверяет ФОРМУ ответа, а не правоту фильтра. «Функция есть
 * и отвечает как обещано» и «функция находит секреты» — разные утверждения, второе меряет
 * приёмка ядра на своём корпусе.
 */

export const IMYA_YADRA = 'dsh-pamyat-core';

/** Классы, на которых проверяется форма ответа rezhim(). Взяты из договора ядра. */
const OBRAZCY_KLASSOV = ['obyavlennyj', 'entropiya', 'takogo-klassa-net-i-ne-budet'];
const REZHIMY = new Set(['zapiraet', 'pomechaet', 'neizvesten']);

export class OtkazDogovora extends Error {
  constructor(prichina, kod = 'VYVOZ_DOGOVOR_YADRA') {
    super(`вывоз: договор с ядром не выполнен — ${prichina}`);
    this.code = kod;
    this.prichina = prichina;
  }
}

/**
 * Загружает фильтр ядра и ПРОВЕРЯЕТ договор до первой записи.
 * @param {string} [put] путь к модулю фильтра; по умолчанию — по имени пакета
 * @returns {{najti_sekret: Function, rezhim: Function, otkuda: string}}
 */
export async function vzyat_filtr(put) {
  const adres = put ?? `${IMYA_YADRA}/src/filtr-vhoda.js`;
  let m;
  try {
    m = await import(adres);
  } catch (e) {
    throw new OtkazDogovora(`ядро не загрузилось (${adres}): ${e.code || e.message}`);
  }
  for (const imya of ['najti_sekret', 'rezhim']) {
    if (typeof m[imya] !== 'function') {
      throw new OtkazDogovora(`ядро не отдаёт ${imya}() — вывоз без фильтра не делается`);
    }
  }
  // Форма ответа rezhim(): обязана вернуть одно из трёх объявленных слов.
  for (const k of OBRAZCY_KLASSOV) {
    const r = m.rezhim(k);
    if (!REZHIMY.has(r)) {
      throw new OtkazDogovora(`rezhim(${JSON.stringify(k)}) вернул ${JSON.stringify(r)}, а договор обещает ${[...REZHIMY].join(' | ')}`);
    }
  }
  // Форма ответа najti_sekret(): либо null, либо {klass, pozicia}.
  const chisto = m.najti_sekret('обычный текст без тайн');
  if (chisto !== null) {
    throw new OtkazDogovora(`najti_sekret() на чистом тексте вернул ${JSON.stringify(chisto)}, а договор обещает null`);
  }
  const najden = m.najti_sekret('password = Xk9#mQ2$vL8p');
  if (!najden || typeof najden.klass !== 'string' || typeof najden.pozicia !== 'number') {
    throw new OtkazDogovora(`najti_sekret() на объявленном секрете вернул ${JSON.stringify(najden)}, а договор обещает {klass, pozicia}`);
  }
  return { najti_sekret: m.najti_sekret, rezhim: m.rezhim, otkuda: adres };
}

/**
 * РЕШЕНИЕ ВЫВОЗА о записи. Знание берётся у ядра, решение — наше.
 *
 * 🔴 НЕЗНАКОМЫЙ КЛАСС ЗАДЕРЖИВАЕТСЯ. У ядра «не запирает» значит «записать с пометкой»,
 * и потеря невелика. У нас то же самое значит ВЫПУСТИТЬ НАРУЖУ. Один ответ, две цены:
 * утечка необратима, задержка — нет, и она не молчалива (запись попадает в отчёт строкой).
 * Цена выбора названа: заведут в ядре новый ПОМЕЧАЮЩИЙ класс и не скажут нам — записи
 * этого класса начнут задерживаться. Это увидят по отчёту, а не по тишине.
 */
export function reshenie(filtr, tekst) {
  const najden = filtr.najti_sekret(tekst);
  if (!najden) return { vyvozit: true };
  const r = filtr.rezhim(najden.klass);
  if (r === 'pomechaet') return { vyvozit: true, pometka: najden.klass };
  return { vyvozit: false, klass: najden.klass, rezhim: r };
}
