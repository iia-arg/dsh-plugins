/**
 * RU: ДОГОВОР С ЯДРОМ — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ВЫВОЗ КАСАЕТСЯ ФИЛЬТРА.
 * EN: THE CORE CONTRACT — THE ONLY PLACE WHERE EXPORT TOUCHES THE FILTER.
 *
 * RU: Что делает модуль: находит и загружает фильтр секретов пакета ядра памяти
 * RU: (dsh-pamyat-core, файл src/filtr-vhoda.js), проверяет его договор пробными вызовами и
 * RU: по ответу фильтра решает судьбу одной записи при вывозе.
 * RU: Экспорты: IMYA_YADRA (имя пакета ядра), OtkazDogovora (класс отказа, code
 * RU: 'VYVOZ_DOGOVOR_YADRA'), vzyat_filtr() (загрузка + проверка), reshenie() (решение о записи).
 * EN: What the module does: locates and loads the secret filter of the memory core package
 * EN: (dsh-pamyat-core, file src/filtr-vhoda.js), checks its contract with probe calls, and
 * EN: uses the filter's answer to decide the fate of a single record during export.
 * EN: Exports: IMYA_YADRA (core package name), OtkazDogovora (failure class, code
 * EN: 'VYVOZ_DOGOVOR_YADRA'), vzyat_filtr() (load + check), reshenie() (per-record decision).
 *
 * RU: 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. 04.09.2026 у потребителя, писавшего вывоз, СВОЙ список
 * RU: запирающих классов совпал со списком ядра в ОДНОМ классе из четырёх: наружу ушли бы
 * RU: uuid-объявленный, hex без объявления и все структурные. Причина не в невнимательности —
 * RU: решения «какой класс запирает» среди экспортов ядра не было вовсе, и потребителю
 * RU: оставалось копировать глазами. Здесь мы НЕ ДЕРЖИМ СВОЕГО СПИСКА: спрашиваем ядро.
 * EN: 🔴 WHY A SEPARATE FILE. On 04.09.2026 the consumer writing the export had ITS OWN list of
 * EN: blocking classes, which matched the core's list in ONE class out of four: declared-uuid,
 * EN: undeclared hex and all structural classes would have leaked. The cause was not
 * EN: carelessness — the core exported no "which class blocks" decision at all, so the
 * EN: consumer could only copy by eye. Here we keep NO LIST OF OUR OWN: we ask the core.
 *
 * RU: 🔴 FAIL-CLOSED С НАШЕЙ СТОРОНЫ (условие приёмки В12). Односторонняя проверка бесполезна:
 * RU: ядро может объявить договор, но ломается всегда чужая половина. Поэтому:
 * RU:   ядро не загрузилось             → ОТКАЗ с причиной, файла вывоза НЕТ
 * RU:   функции нет среди экспортов     → ОТКАЗ
 * RU:   форма ответа не та, что в договоре → ОТКАЗ
 * RU: И ни при каких условиях — не «вывозим пока без фильтра». Вывоз без фильтра выглядел бы
 * RU: как успешная выгрузка, а был бы выносом корпуса, не прошедшего проверку.
 * EN: 🔴 FAIL-CLOSED ON OUR SIDE (acceptance condition V12). A one-sided check is useless: the
 * EN: core may declare a contract, but it is always the other half that breaks. Therefore:
 * EN:   core did not load                       → REFUSAL with a reason, NO export file
 * EN:   function missing from the exports       → REFUSAL
 * EN:   answer shape differs from the contract  → REFUSAL
 * EN: And under no circumstances "export without a filter for now". An unfiltered export would
 * EN: look like a successful dump while actually shipping out an unchecked corpus.
 *
 * RU: ГДЕ НЕ ПРИМЕНЯЕТСЯ: договор проверяет ФОРМУ ответа, а не правоту фильтра. «Функция есть
 * RU: и отвечает как обещано» и «функция находит секреты» — разные утверждения, второе меряет
 * RU: приёмка ядра на своём корпусе.
 * EN: WHERE IT DOES NOT APPLY: the contract checks the SHAPE of answers, not whether the filter
 * EN: is right. "The function exists and answers as promised" and "the function finds secrets"
 * EN: are different claims; the second is measured by the core's own acceptance on its corpus.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// RU: Имя пакета ядра — от него строятся все звенья поиска фильтра.
// EN: Core package name — every filter lookup path is built from it.
export const IMYA_YADRA = 'dsh-pamyat-core';

/**
 * RU: Классы, на которых проверяется форма ответа rezhim(). Взяты из договора ядра.
 * RU: Третий заведомо не существует: на нём проверяется, что и на незнакомый класс ядро
 * RU: отвечает одним из трёх слов договора (какое именно — не проверяется).
 * EN: Classes used to check the shape of rezhim() answers. Taken from the core contract.
 * EN: The third one deliberately does not exist: it checks that even for an unknown class the
 * EN: core answers with one of the three contract words (which one is not checked).
 */
const OBRAZCY_KLASSOV = ['obyavlennyj', 'entropiya', 'takogo-klassa-net-i-ne-budet'];
// RU: Три слова договора: запирает (не вывозить), помечает (вывозить с пометкой), неизвестен.
// EN: The three contract words: zapiraet (blocks — do not export), pomechaet (marks — export
// EN: with a mark), neizvesten (unknown).
const REZHIMY = new Set(['zapiraet', 'pomechaet', 'neizvesten']);

/**
 * RU: Отказ договора с ядром. code по умолчанию 'VYVOZ_DOGOVOR_YADRA', prichina — текст
 * RU: причины без префикса. Скрипт относит такой отказ к «слепоте» (код возврата 2).
 * EN: Core contract failure. code defaults to 'VYVOZ_DOGOVOR_YADRA', prichina holds the
 * EN: reason text without the prefix. The script treats such a failure as "blindness" (exit code 2).
 */
export class OtkazDogovora extends Error {
  constructor(prichina, kod = 'VYVOZ_DOGOVOR_YADRA') {
    super(`вывоз: договор с ядром не выполнен — ${prichina}`);
    this.code = kod;
    this.prichina = prichina;
  }
}

/**
 * RU: Загружает фильтр ядра и ПРОВЕРЯЕТ договор до первой записи.
 * RU: Порядок: тип аргумента → загрузка по цепочке звеньев → наличие najti_sekret() и
 * RU: rezhim() → форма ответа rezhim() на трёх образцах → форма ответа najti_sekret() на
 * RU: чистом тексте (null) и на объявленном секрете ({klass, pozicia}).
 * RU: Отказы: OtkazDogovora на каждом шаге выше. ⚠️ Исключение, брошенное самими функциями
 * RU: ядра во время пробы, не оборачивается и уходит наружу как есть.
 * RU: Чего НЕ ловит: правоту фильтра (только форму ответов); то, что найденное ядро — той
 * RU: редакции, которую ждали (печатается только звено, откуда взято); модуль импортируется,
 * RU: то есть его код верхнего уровня исполняется до всех проверок.
 * EN: Loads the core filter and CHECKS the contract before the first record.
 * EN: Order: argument type → load along the chain of locations → presence of najti_sekret() and
 * EN: rezhim() → shape of rezhim() answers on three samples → shape of najti_sekret() answers on
 * EN: clean text (null) and on a declared secret ({klass, pozicia}).
 * EN: Failures: OtkazDogovora at every step above. ⚠️ An exception thrown by the core functions
 * EN: themselves during the probe is not wrapped and escapes as is.
 * EN: Does NOT catch: whether the filter is right (only answer shapes); whether the core found is
 * EN: the expected release (only the location it came from is printed); the module is imported,
 * EN: so its top-level code runs before any check.
 * @param {string} [put] RU: путь к модулю фильтра; по умолчанию — по имени пакета
 *                       EN: path to the filter module; by default — by package name
 * @returns {{najti_sekret: Function, rezhim: Function, otkuda: string}}
 */
export async function vzyat_filtr(put) {
  // RU: 🔴 ТИП АРГУМЕНТА ПРОВЕРЯЕТСЯ ДО ЗАГРУЗКИ, И ОТКАЗ НАЗЫВАЕТ, ЧТО ПРИШЛО (05.09.2026).
  // RU: Поймано пробой автора: в функцию передали ГОТОВОЕ ЯДРО вместо пути, и отказ напечатал
  // RU: «ядро не загрузилось ([object Object])». Строка правдива и бесполезна: читающий пойдёт
  // RU: искать несуществующий путь вместо того, чтобы посмотреть на свой вызов.
  // RU: Мелочь по коду и не мелочь по цене: отказ, не называющий СВОЕЙ причины, отправляет
  // RU: чинить не то.
  // EN: 🔴 THE ARGUMENT TYPE IS CHECKED BEFORE LOADING, AND THE REFUSAL NAMES WHAT ARRIVED
  // EN: (05.09.2026). Caught by the author's own probe: a ready core object was passed instead of
  // EN: a path, and the refusal printed "core did not load ([object Object])". True and useless:
  // EN: the reader goes looking for a non-existent path instead of looking at their own call.
  // EN: Trivial in code, not trivial in cost: a refusal that does not name ITS OWN cause sends
  // EN: people to fix the wrong thing.
  if (put !== undefined && typeof put !== 'string') {
    throw new OtkazDogovora(
      `путь к фильтру должен быть строкой, а пришло ${put === null ? 'null' : typeof put}`
      + ` — похоже, передали готовое ядро вместо пути к нему`);
  }
  // RU: 🔴 ЯДРО ИЩЕТСЯ ЦЕПОЧКОЙ, А НЕ ОДНИМ АДРЕСОМ (находка приёмки 05.09.2026).
  // RU: По имени пакета оно находится только там, где рядом есть node_modules. В боевом
  // RU: каталоге <plugins-dir>/dsh-pamyat-vyvoz их нет, и пакет был неработоспособен
  // RU: «из коробки»: единственным рабочим путём оставался явный `put`, который в бою
  // RU: никто не передавал. Отказ при этом честный (fail-closed, вывоза без фильтра нет) —
  // RU: но честный отказ не заменяет работы.
  // RU: Порядок звеньев назван от общего к частному, и ВЫБРАННОЕ ЗВЕНО ПЕЧАТАЕТСЯ в отчёте
  // RU: (`filtr_otkuda`): без этого «фильтр взят» не отвечает на вопрос «какой именно».
  // RU: Звенья: (1) имя пакета — обычное разрешение модулей Node; (2) соседний каталог ядра
  // RU: рядом с каталогом этого пакета; (3) node_modules внутри этого пакета. Берётся первое,
  // RU: которое импортировалось. Явный `put` отменяет цепочку целиком.
  // EN: 🔴 THE CORE IS LOOKED UP ALONG A CHAIN, NOT AT ONE ADDRESS (acceptance finding
  // EN: 05.09.2026). By package name it resolves only where node_modules is nearby. The production
  // EN: directory <plugins-dir>/dsh-pamyat-vyvoz has none, so the package did not work "out of the
  // EN: box": the only working route was an explicit `put`, which nobody passed in production.
  // EN: The refusal was honest (fail-closed, no unfiltered export) — but an honest refusal is
  // EN: not a substitute for working.
  // EN: The chain goes from general to specific, and the CHOSEN LOCATION IS PRINTED in the report
  // EN: (`filtr_otkuda`): without it "filter loaded" does not answer "which one".
  // EN: Locations: (1) package name — normal Node module resolution; (2) a sibling core directory
  // EN: next to this package's directory; (3) node_modules inside this package. The first one that
  // EN: imports wins. An explicit `put` replaces the whole chain.
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
    // RU: 🔴 ПЕРЕЧИСЛЯЮТСЯ ВСЕ ЗВЕНЬЯ, А НЕ ПОСЛЕДНЕЕ. Одна причина из трёх отправила бы
    // RU: читающего чинить то звено, которое ему и не нужно.
    // EN: 🔴 ALL LOCATIONS ARE LISTED, NOT JUST THE LAST. One cause out of three would send the
    // EN: reader to fix a location they do not even need.
    throw new OtkazDogovora('ядро не загрузилось ни по одному пути:\n    ' + otkazy.join('\n    '));
  }
  for (const imya of ['najti_sekret', 'rezhim']) {
    if (typeof m[imya] !== 'function') {
      throw new OtkazDogovora(`ядро не отдаёт ${imya}() — вывоз без фильтра не делается`);
    }
  }
  // RU: Форма ответа rezhim(): обязана вернуть одно из трёх объявленных слов.
  // EN: Shape of rezhim() answers: it must return one of the three declared words.
  for (const k of OBRAZCY_KLASSOV) {
    const r = m.rezhim(k);
    if (!REZHIMY.has(r)) {
      throw new OtkazDogovora(`rezhim(${JSON.stringify(k)}) вернул ${JSON.stringify(r)}, а договор обещает ${[...REZHIMY].join(' | ')}`);
    }
  }
  // RU: Форма ответа najti_sekret(): либо null, либо {klass, pozicia}. Пробный «секрет» ниже —
  // RU: выдуманный образец объявленной формы, а не настоящий пароль.
  // EN: Shape of najti_sekret() answers: either null or {klass, pozicia}. The sample "secret"
  // EN: below is a made-up example of a declared shape, not a real password.
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
 * RU: РЕШЕНИЕ ВЫВОЗА о записи. Знание берётся у ядра, решение — наше.
 * EN: THE EXPORT DECISION for one record. Knowledge comes from the core, the decision is ours.
 *
 * RU: 🔴 НЕЗНАКОМЫЙ КЛАСС ЗАДЕРЖИВАЕТСЯ. У ядра «не запирает» значит «записать с пометкой»,
 * RU: и потеря невелика. У нас то же самое значит ВЫПУСТИТЬ НАРУЖУ. Один ответ, две цены:
 * RU: утечка необратима, задержка — нет, и она не молчалива (запись попадает в отчёт строкой).
 * RU: Цена выбора названа: заведут в ядре новый ПОМЕЧАЮЩИЙ класс и не скажут нам — записи
 * RU: этого класса начнут задерживаться. Это увидят по отчёту, а не по тишине.
 * RU: ⚠️ Здесь «задерживается» — это ответ функции; вызывающий vyvezti() на режим
 * RU: «neizvesten» останавливает весь вывоз (см. vyvoz.js), а не задерживает одну запись.
 * EN: 🔴 AN UNKNOWN CLASS IS WITHHELD. For the core "does not block" means "store with a mark",
 * EN: and the loss is small. For us the same answer means LET IT OUT. One answer, two prices:
 * EN: a leak is irreversible, withholding is not, and it is not silent (the record appears in
 * EN: the report as a line). The price of this choice is stated: if the core adds a new MARKING
 * EN: class without telling us, records of that class start being withheld. That shows up in
 * EN: the report, not as silence.
 * EN: ⚠️ "Withheld" here is this function's answer; the caller vyvezti() stops the whole export
 * EN: on mode "neizvesten" (see vyvoz.js) rather than withholding a single record.
 *
 * RU: Вход: filtr — итог vzyat_filtr(); tekst — проверяемый текст.
 * RU: Выход: {vyvozit: true} — чисто; {vyvozit: true, pometka: klass} — помечающий класс;
 * RU: {vyvozit: false, klass, rezhim} — запирающий или неизвестный.
 * RU: Отказы: OtkazDogovora, если najti_sekret() или rezhim() ответили вне договора; само
 * RU: значение ответа в сообщение не попадает (в нём мог быть секрет).
 * RU: Чего НЕ ловит: второй и следующие секреты того же текста — решение по одной находке ядра.
 * EN: Input: filtr — the result of vzyat_filtr(); tekst — the text to check.
 * EN: Output: {vyvozit: true} — clean; {vyvozit: true, pometka: klass} — marking class;
 * EN: {vyvozit: false, klass, rezhim} — blocking or unknown.
 * EN: Failures: OtkazDogovora if najti_sekret() or rezhim() answer outside the contract; the
 * EN: answer value itself is kept out of the message (it might contain a secret).
 * EN: Does NOT catch: second and further secrets in the same text — the decision rests on a
 * EN: single core finding.
 */
export function reshenie(filtr, tekst) {
  const najden = filtr.najti_sekret(tekst);
  // RU: Только null означает отсутствие секрета; ложный ответ не равен чистому тексту.
  // EN: Only null means "no secret"; a falsy answer is not the same as clean text.
  if (najden === null) return { vyvozit: true };
  if (typeof najden !== 'object' || Array.isArray(najden)
      || typeof najden.klass !== 'string' || !najden.klass.trim()
      || !Number.isInteger(najden.pozicia) || najden.pozicia < 0) {
    throw new OtkazDogovora('najti_sekret(): ожидался null либо объект с непустым klass '
      + 'и целой неотрицательной pozicia; получен ответ вне договора (значение скрыто)');
  }
  const r = filtr.rezhim(najden.klass);
  if (!REZHIMY.has(r)) {
    throw new OtkazDogovora('rezhim(): ожидался zapiraet, pomechaet либо neizvesten; '
      + 'получен ответ вне договора (значение скрыто)');
  }
  if (r === 'pomechaet') return { vyvozit: true, pometka: najden.klass };
  return { vyvozit: false, klass: najden.klass, rezhim: r };
}
