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

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

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
  // 🔴 ТИП АРГУМЕНТА ПРОВЕРЯЕТСЯ ДО ЗАГРУЗКИ, И ОТКАЗ НАЗЫВАЕТ, ЧТО ПРИШЛО (05.09.2026).
  // Поймано своей же пробой: я передала сюда ГОТОВОЕ ЯДРО вместо пути, и отказ напечатал
  // «ядро не загрузилось ([object Object])». Строка правдива и бесполезна: читающий пойдёт
  // искать несуществующий путь вместо того, чтобы посмотреть на свой вызов.
  // Мелочь по коду и не мелочь по цене: отказ, не называющий СВОЕЙ причины, отправляет
  // чинить не то.
  if (put !== undefined && typeof put !== 'string') {
    throw new OtkazDogovora(
      `путь к фильтру должен быть строкой, а пришло ${put === null ? 'null' : typeof put}`
      + ` — похоже, передали готовое ядро вместо пути к нему`);
  }
  // 🔴 ЯДРО ИЩЕТСЯ ЦЕПОЧКОЙ, А НЕ ОДНИМ АДРЕСОМ (находка приёмки 05.09.2026).
  // По имени пакета оно находится только там, где рядом есть node_modules. В боевом
  // каталоге /opt/…/plugins/dsh-pamyat-vyvoz их нет, и пакет был неработоспособен
  // «из коробки»: единственным рабочим путём оставался явный `put`, который в бою
  // никто не передавал. Отказ при этом честный (fail-closed, вывоза без фильтра нет) —
  // но честный отказ не заменяет работы.
  // Порядок звеньев назван от общего к частному, и ВЫБРАННОЕ ЗВЕНО ПЕЧАТАЕТСЯ в отчёте
  // (`filtr_otkuda`): без этого «фильтр взят» не отвечает на вопрос «какой именно».
  const zdes = dirname(fileURLToPath(import.meta.url));
  const cepochka = put
    ? [{ kak: 'путь из вызова', adres: put }]
    : [
        { kak: 'по имени пакета', adres: `${IMYA_YADRA}/src/filtr-vhoda.js` },
        { kak: 'соседний каталог', adres: pathToFileURL(join(zdes, '..', '..', IMYA_YADRA, 'src', 'filtr-vhoda.js')).href },
        { kak: 'свой node_modules', adres: pathToFileURL(join(zdes, '..', 'node_modules', IMYA_YADRA, 'src', 'filtr-vhoda.js')).href },
      ];
  let m, otkuda_vzyato, otkazy = [];
  for (const zveno of cepochka) {
    try {
      m = await import(zveno.adres);
      otkuda_vzyato = `${zveno.kak}: ${zveno.adres}`;
      break;
    } catch (e) {
      otkazy.push(`${zveno.kak} (${zveno.adres}): ${e.code || e.message}`);
    }
  }
  if (!m) {
    // 🔴 ПЕРЕЧИСЛЯЮТСЯ ВСЕ ЗВЕНЬЯ, А НЕ ПОСЛЕДНЕЕ. Одна причина из трёх отправила бы
    // читающего чинить то звено, которое ему и не нужно.
    throw new OtkazDogovora('ядро не загрузилось ни по одному пути:\n    ' + otkazy.join('\n    '));
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
  return { najti_sekret: m.najti_sekret, rezhim: m.rezhim, otkuda: otkuda_vzyato };
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
