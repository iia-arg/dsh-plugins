/**
 * RU: ВЕРСИЯ СХЕМЫ ВЫВОЗА — САМООПИСАНИЕ ФАЙЛА.
 * EN: EXPORT SCHEMA VERSION — THE FILE DESCRIBES ITSELF.
 *
 * RU: 🔴 ЗАЧЕМ. Файл вывоза переживёт обе стороны: его сделают сегодня, а ввезут через месяц
 * RU: другой редакцией пакета. Без объявленной версии ввоз читал бы чужой формат «как получится»
 * RU: и молча терял поля — а потеря при переносе неотличима от «этого поля и не было».
 * RU: Поэтому первая строка файла — ЗАГОЛОВОК, и ввоз отказывается работать, если версия чужая.
 * EN: 🔴 WHY. An export file outlives both sides: it is made today and imported a month later
 * EN: by a different release of the package. Without a declared version, import would read a
 * EN: foreign format "however it turns out" and silently lose fields — and a loss in transfer
 * EN: is indistinguishable from "this field never existed".
 * EN: That is why the first line of the file is a HEADER, and import refuses to work if the
 * EN: version is foreign.
 *
 * RU: ПОЧЕМУ ОТКАЗ, А НЕ ПОПЫТКА ПОНЯТЬ. Мы не знаем, что означает версия из будущего: поле
 * RU: могло не появиться, а поменять смысл. Догадка здесь молчалива, отказ — нет.
 * EN: WHY REFUSE INSTEAD OF TRYING TO UNDERSTAND. We do not know what a future version means:
 * EN: a field may not have been added but may have changed its meaning. A guess here is
 * EN: silent; a refusal is not.
 *
 * RU: Что в модуле: версия схемы, перечень переносимых полей, карта непереносимого с
 * RU: причинами, сборка и разбор заголовка, сумма содержимого, проверка ключей вызова.
 * RU: Модуль общий для обеих сторон (вывоза и ввоза) — чтобы правила не разошлись.
 * RU: Чего модуль НЕ делает: не читает и не пишет базу и файлы; не ищет секреты (это
 * RU: фильтр ядра, см. yadro.js); не проверяет сами записи — только заголовок и ключи.
 * EN: What the module holds: schema version, list of transferred fields, map of
 * EN: non-transferred fields with reasons, header building and parsing, content checksum,
 * EN: call-key validation. The module is shared by both sides (export and import) so that
 * EN: the rules cannot drift apart.
 * EN: What the module does NOT do: it neither reads nor writes the database or files; it
 * EN: does not look for secrets (that is the core's filter, see yadro.js); it does not
 * EN: validate the records themselves — only the header and the call keys.
 */

import { createHash } from 'node:crypto';

// RU: 🔴 ВЕРСИЯ 2 — ПОТОМУ ЧТО У ПОЛЯ `otkuda` ПОМЕНЯЛСЯ СМЫСЛ, А НЕ ФОРМА (06.09.2026).
// RU: В версии 1 `otkuda` имело умолчание «неизвестно»: значение в файле могло быть тем,
// RU: что никто не называл. Значит по файлу версии 1 нельзя понять, названо ли происхождение
// RU: на самом деле, — а `proishozhdenie` записи читается ТОЛЬКО относительно источника
// RU: (условие автора предмета, 06.09.2026). В версии 2 `otkuda` обязателен явно.
// RU: Отличать старые файлы по строке «неизвестно» было бы признаком ПО СЛОВУ: строку можно
// RU: написать руками, и тогда файл версии 1 выглядел бы как названный. Версия — признак
// RU: по устройству, и ровно для этого поле версии и заведено.
// RU: ⚠️ ЦЕНА: файлы версии 1 отказываются целиком, включая те, где источник был назван
// RU: честно. Замер перед правкой: файлов версии 1 на машине 0, вывоз в бою не звался ни
// RU: разу за трое суток — цена измерена и равна нулю.
// EN: 🔴 VERSION 2 — BECAUSE THE FIELD `otkuda` CHANGED ITS MEANING, NOT ITS SHAPE (06.09.2026).
// EN: In version 1 `otkuda` defaulted to "unknown": the value in the file could be something
// EN: nobody had actually stated. So a version 1 file cannot tell whether the origin was really
// EN: named — and a record's `proishozhdenie` is meaningful ONLY relative to its source
// EN: (condition set by the subject's author, 06.09.2026). In version 2 `otkuda` is required
// EN: explicitly.
// EN: Telling old files apart by the string "unknown" would be a sign BY WORDING: the string can
// EN: be typed by hand, and a version 1 file would then look as if the source were named. The
// EN: version is a sign BY STRUCTURE, and that is exactly what the version field exists for.
// EN: ⚠️ PRICE: version 1 files are refused entirely, including those where the source was named
// EN: honestly. Measured before the change: 0 version 1 files on the machine, export not called
// EN: in production even once in three days — the price was measured and is zero.
//
// RU: Выход: число; пишется в заголовок (zagolovok) и сравнивается строгим равенством при
// RU: ввозе (proverit_zagolovok). Совместимости «старше/младше» нет — только равенство.
// EN: Output: a number; written into the header (zagolovok) and compared by strict equality on
// EN: import (proverit_zagolovok). There is no "older/newer" compatibility — equality only.
export const VERSIYA_SHEMY = 2;

/**
 * RU: ПОЛЯ ЗАПИСИ, КОТОРЫЕ ПЕРЕНОСЯТСЯ.
 * EN: RECORD FIELDS THAT ARE TRANSFERRED.
 *
 * RU: 🔴 `id` ЗДЕСЬ НЕТ НАМЕРЕННО, и это не упущение. Ввоз присваивает СВОИ номера. Причина
 * RU: измерена: у ядра статус записи определяется рубежом по id (записи ниже рубежа —
 * RU: «до протокола», они старше механизма отметки происхождения). Чужая запись с малым
 * RU: номером легла бы ниже НАШЕГО рубежа и получила бы привилегию нашей старой памяти —
 * RU: отмывание доверия через ввоз. Ограничение стоит и в шапке миграции ядра; здесь оно
 * RU: исполняется ОТКАЗОМ, а не предупреждением: тот, кто заведёт перенос номеров, будет
 * RU: править этот файл, а не соседний.
 * EN: 🔴 `id` IS ABSENT HERE ON PURPOSE, and it is not an oversight. Import assigns ITS OWN
 * EN: numbers. The reason was measured: in the core, a record's status is decided by an id
 * EN: cutoff (records below the cutoff are "pre-protocol", older than the provenance-marking
 * EN: mechanism). A foreign record with a small number would land below OUR cutoff and gain the
 * EN: privilege of our old memory — trust laundering through import. The restriction is also
 * EN: stated in the header of the core migration; here it is enforced by REFUSAL, not by a
 * EN: warning: whoever introduces number transfer will have to edit this file, not a
 * EN: neighbouring one.
 *
 * RU: Выход: массив имён столбцов в порядке переноса; тот же массив кладётся в заголовок
 * RU: файла (поле polya). Массив не заморожен — менять его на месте нельзя.
 * EN: Output: an array of column names in transfer order; the same array goes into the file
 * EN: header (field polya). The array is not frozen — it must not be mutated in place.
 */
export const POLYA = [
  'agent', 'klass', 'soderzhim', 'istochnik', 'sozdano',
  'bez_podtverzhdeniya', 'vera', 'ochistka', 'podozrenie',
  // RU: 🔴 `ocenki` и `podtverzhdenie` ВЫВОЗЯТСЯ (решение 07.09.2026, довод по устройству).
  // RU: Оба поля хранят СУЖДЕНИЕ ЧЕЛОВЕКА о самом знании: кто оценил веру и почему; кто и
  // RU: когда подтвердил запись, которую механизм записал без спроса. Суждение остаётся
  // RU: верным на любой машине — как и `proishozhdenie`, и по той же причине.
  // RU: ⚠️ И обратный довод, который был проверен прежде, чем решить: «подтверждал человек
  // RU: ЭТОЙ машины, значит на той стороне отметка не значит ничего». Он неверен: отметка
  // RU: несёт ИМЯ подтвердившего и время, то есть проверяема на той стороне спрашиванием
  // RU: самого человека. Это отличает её от `proverka`, где проверять нечего — журнал не
  // RU: переносится. Разница не в переносимости поля, а в том, есть ли на той стороне
  // RU: способ спросить.
  // EN: 🔴 `ocenki` and `podtverzhdenie` ARE EXPORTED (decision of 07.09.2026, structural reason).
  // EN: Both fields hold a HUMAN JUDGEMENT about the knowledge itself: who rated the confidence
  // EN: and why; who confirmed, and when, a record the mechanism wrote without asking. A
  // EN: judgement stays valid on any machine — like `proishozhdenie`, and for the same reason.
  // EN: ⚠️ The opposite argument was checked before deciding: "the confirmer was a person of
  // EN: THIS machine, so on the other side the mark means nothing". It is wrong: the mark carries
  // EN: the confirmer's NAME and the time, so the other side can verify it by asking that person.
  // EN: This is what sets it apart from `proverka`, where there is nothing to verify — the
  // EN: journal is not transferred. The difference is not whether the field is transferable but
  // EN: whether the other side has a way to ask.
  'ocenki', 'podtverzhdenie',
  // RU: 🔴 `proishozhdenie` ВЫВОЗИТСЯ (решение приёмки, 06.09.2026).
  // RU: Довод: уровень описывает САМУ ЗАПИСЬ — откуда она взялась и чего стоит её вера.
  // RU: Это свойство знания, а не машины, и на той стороне оно значит ровно то же.
  // RU: ⚠️ Пустое здесь означает «до протокола» ТОЛЬКО вместе с рубежом принимающей базы,
  // RU: а рубеж не переносится (см. NE_VYVOZITSYA.nastrojki). То есть у ввезённой записи
  // RU: пустое происхождение читается как «не установлено», а НЕ как «старше механизма».
  // RU: Разница названа, потому что молча она превратилась бы в привилегию чужой памяти —
  // RU: то же отмывание доверия, от которого мы закрыли перенос id.
  // EN: 🔴 `proishozhdenie` IS EXPORTED (acceptance decision, 06.09.2026).
  // EN: Reason: the level describes THE RECORD ITSELF — where it came from and what its
  // EN: confidence is worth. It is a property of the knowledge, not of the machine, and on the
  // EN: other side it means exactly the same.
  // EN: ⚠️ An empty value here means "pre-protocol" ONLY together with the receiving database's
  // EN: cutoff, and the cutoff is not transferred (see NE_VYVOZITSYA.nastrojki). So for an
  // EN: imported record an empty provenance reads as "not established", NOT as "older than the
  // EN: mechanism". The difference is stated because, left silent, it would turn into a privilege
  // EN: for foreign memory — the same trust laundering we closed off by not transferring id.
  //
  // RU: 🔴 СЕГОДНЯ ЭТО ПОЛЕ ПУСТО У ВСЕХ ЗАПИСЕЙ, И ВЫВОЗ ЗДЕСЬ НИ ПРИ ЧЁМ (замер 06.09.2026
  // RU: на живой базе: записей 164, `proishozhdenie` заполнено у 0). Строка стоит здесь,
  // RU: чтобы первый, кто увидит пустой столбец на ТОЙ стороне, не пошёл чинить работающее.
  // RU: ⚠️ И причина НЕ та, которую подсказывает рубеж: рубеж = 68, а пусты и записи выше
  // RU: него — все 96. То есть дело не в «до протокола», а в том, что ПИСАТЕЛЯ НИКТО НЕ
  // RU: ЗОВЁТ: метод отметки в ядре есть (hranilishche.js, UPDATE proishozhdenie), вызовов
  // RU: снаружи ядра — ноль. Миграция схемы прошла, ПРОТОКОЛ НЕ НАЧАЛ ДЕЙСТВОВАТЬ; это два
  // RU: разных события, и второе легко не наступить.
  // RU: Проверить одной командой:
  // RU:   SELECT COUNT(*) FROM zapisi WHERE proishozhdenie IS NOT NULL;
  // EN: 🔴 TODAY THIS FIELD IS EMPTY IN EVERY RECORD, AND EXPORT IS NOT THE CAUSE (measured
  // EN: 06.09.2026 on the live database: 164 records, `proishozhdenie` filled in 0). This line
  // EN: is here so that the first person who sees an empty column on THE OTHER side does not go
  // EN: and fix something that works.
  // EN: ⚠️ And the cause is NOT the one the cutoff suggests: the cutoff is 68, yet records above
  // EN: it are empty too — all 96. So it is not about "pre-protocol"; it is that NOBODY CALLS THE
  // EN: WRITER: the marking method exists in the core (hranilishche.js, UPDATE proishozhdenie),
  // EN: and calls from outside the core number zero. The schema migration happened, THE PROTOCOL
  // EN: DID NOT START WORKING; these are two different events, and the second can easily never
  // EN: occur.
  // EN: Check with one command:
  // EN:   SELECT COUNT(*) FROM zapisi WHERE proishozhdenie IS NOT NULL;
  'proishozhdenie',
];

/**
 * RU: ЧЕГО ВЫВОЗ НЕ ВЫВОЗИТ — И ПОЧЕМУ (условие приёмки В11).
 * RU: 🔴 Написано ПОЧЕМУ, а не только ЧТО: следующий увидит, что журнал не переносится,
 * RU: и решит, что это забыли. Это не забыли, это решено.
 * EN: WHAT EXPORT DOES NOT EXPORT — AND WHY (acceptance condition V11).
 * EN: 🔴 It says WHY, not only WHAT: the next reader will see that the journal is not
 * EN: transferred and decide it was forgotten. It was not forgotten; it was decided.
 *
 * RU: Выход: объект «имя → причина словами». Ключи служат двум целям: кладутся в заголовок
 * RU: файла целиком (поле ne_vyvozitsya) и считаются «известными» в neznakomye_polya.
 * RU: ⚠️ Среди ключей есть не только столбцы записи (id, kasanij, poslednee_kasanie,
 * RU: proverka), но и таблицы/состояния базы (zhurnal, ochered_dolgovremennogo, nastrojki).
 * RU: Объект не заморожен — менять его на месте нельзя.
 * EN: Output: an object "name → reason in words". The keys serve two purposes: the whole
 * EN: object goes into the file header (field ne_vyvozitsya), and the keys count as "known" in
 * EN: neznakomye_polya.
 * EN: ⚠️ The keys include not only record columns (id, kasanij, poslednee_kasanie, proverka)
 * EN: but also database tables/state (zhurnal, ochered_dolgovremennogo, nastrojki).
 * EN: The object is not frozen — it must not be mutated in place.
 */
export const NE_VYVOZITSYA = {
  // RU (id): номер записи — свойство ЭТОЙ базы; перенос номеров открыл бы отмывание через рубеж.
  // EN (id): the record number is a property of THIS database; transferring numbers would open
  // EN: laundering through the cutoff.
  id: 'номер записи — свойство ЭТОЙ базы; перенос номеров открыл бы отмывание через рубеж',
  // RU (zhurnal): журнал операций — история ЭТОЙ машины; на другой машине он не описывает ничего.
  // EN (zhurnal): the operations journal is the history of THIS machine; on another machine it
  // EN: describes nothing.
  zhurnal: 'журнал операций — история ЭТОЙ машины: кто когда что записал и почему отказал. На другой машине он не описывает ничего',
  // RU (ochered_dolgovremennogo): очередь доставки — состояние ЭТОЙ машины; перенос дал бы двойную
  // RU: доставку в общую память с двух машин.
  // EN (ochered_dolgovremennogo): the delivery queue is the state of THIS machine; transferring it
  // EN: would cause double delivery into shared memory from two machines.
  ochered_dolgovremennogo: 'очередь доставки — состояние доставки ЭТОЙ машины. Перенос сделал бы её источником ДВОЙНОЙ доставки: записи ушли бы в общую память дважды, с двух машин',
  // RU (nastrojki): рубеж происхождения принадлежит принимающей базе и снимается по её ряду номеров.
  // EN (nastrojki): the provenance cutoff belongs to the receiving database and is derived from
  // EN: its own number sequence.
  nastrojki: 'рубеж происхождения принадлежит принимающей базе и снимается по ЕЁ ряду номеров',
  // RU: 🔴 `proverka` НЕ ВЫВОЗИТСЯ (то же решение приёмки).
  // RU: Довод строже, чем «не пригодится»: отметка сверки говорит, что опора записи была
  // RU: найдена В ЖУРНАЛЕ ЭТОЙ МАШИНЫ — а журнал не переносится по построению (строка выше).
  // RU: Перенесённая отметка утверждала бы на той стороне проверку, которую там нечем
  // RU: повторить: «сверено» без доступа к тому, с чем сверяли, есть слово без предмета.
  // EN: 🔴 `proverka` IS NOT EXPORTED (same acceptance decision).
  // EN: The reason is stricter than "it would not be useful": the cross-check mark says the
  // EN: record's support was found IN THE JOURNAL OF THIS MACHINE — and the journal is not
  // EN: transferred by design (line above). A transferred mark would assert, on the other side,
  // EN: a check that cannot be repeated there: "cross-checked" without access to what it was
  // EN: checked against is a word without a subject.
  // RU: 🔴 И ДОВОД СИЛЬНЕЕ, ЧЕМ «СЛОВО БЕЗ ПРЕДМЕТА» (уточнение координатора 06.09.2026):
  // RU: перенесённая отметка значит не «ничего», а НЕВЕРНОЕ. На той стороне «сверено»
  // RU: прочтётся как свойство записи, сверять её больше никто не станет — то есть это
  // RU: ЛОЖНО-ЗЕЛЁНОЕ, а не бесполезное поле. Бесполезное игнорируют, ложно-зелёное
  // RU: останавливает проверку. Разница в том, что делает читающий.
  // EN: 🔴 AND THE REASON IS STRONGER THAN "A WORD WITHOUT A SUBJECT" (clarification by the
  // EN: coordinator, 06.09.2026): a transferred mark means not "nothing" but something WRONG. On
  // EN: the other side "cross-checked" will read as a property of the record and nobody will
  // EN: check it again — so it is a FALSE GREEN, not a useless field. A useless field gets
  // EN: ignored; a false green stops verification. The difference lies in what the reader does.
  // RU: ⚠️ Следствие, названное вслух: у ввезённой записи сверка будет «не проверялось» —
  // RU: это ЧЕСТНО и не значит «сверка не проходила». Принимающая сторона может свериться
  // RU: заново по СВОИМ опорам, и тогда отметка будет означать то, что говорит.
  // EN: ⚠️ A consequence, stated out loud: an imported record will have cross-check "not
  // EN: checked" — this is HONEST and does not mean "the cross-check failed". The receiving side
  // EN: can cross-check again against ITS OWN supports, and then the mark will mean what it says.
  // RU: 🔴 КАСАНИЯ НЕ ВЫВОЗЯТСЯ (решение 07.09.2026). Счётчик отвечает на вопрос «сколько раз
  // RU: эту запись ВЫДАВАЛИ ЗДЕСЬ» — он про употребление на машине-источнике, а не про знание.
  // RU: Перенесённое число на той стороне читалось бы как история принимающей базы и молча
  // RU: смешалось бы с её собственными выдачами: запись выглядела бы затёртой, ни разу там не
  // RU: показавшись. Ложная подпись, а не потеря: пустой счётчик заставит считать заново,
  // RU: заполненный — нет.
  // EN: 🔴 TOUCHES ARE NOT EXPORTED (decision of 07.09.2026). The counter answers "how many times
  // EN: was this record SERVED HERE" — it is about usage on the source machine, not about the
  // EN: knowledge. A transferred number would read on the other side as the receiving database's
  // EN: own history and silently mix with its own retrievals: the record would look worn out
  // EN: without ever having been shown there. A false signature, not a loss: an empty counter
  // EN: forces counting anew, a filled one does not.
  // RU: ⚠️ Отличие от `ocenki`: оценка — суждение О ЗНАНИИ, касание — след ОБ ИСПОЛЬЗОВАНИИ.
  // EN: ⚠️ Difference from `ocenki`: a rating is a judgement ABOUT THE KNOWLEDGE; a touch is a
  // EN: trace ABOUT USAGE.
  kasanij: 'счётчик выдач — про употребление на машине-источнике. На той стороне число смешалось бы с её собственными выдачами и читалось бы как чужая история; пустой счётчик честнее',
  // RU (poslednee_kasanie): время последней выдачи ЗДЕСЬ — та же причина, что у kasanij.
  // EN (poslednee_kasanie): time of the last retrieval HERE — same reason as kasanij.
  poslednee_kasanie: 'время последней выдачи ЗДЕСЬ — та же причина, что у kasanij: на той стороне оно описывало бы событие, которого там не было',
  // RU (proverka): обоснование — в длинном комментарии выше, начиная с «`proverka` НЕ ВЫВОЗИТСЯ».
  // EN (proverka): the rationale is in the long comment above, starting with "`proverka` IS NOT EXPORTED".
  proverka: 'отметка сверки — про журнал ЭТОЙ машины, а журнал не переносится. На той стороне она читалась бы как ПРОВЕРЕННОЕ, хотя проверки не было и повторить её нечем: не бесполезное поле, а ложно-зелёное — оно остановило бы проверку, а не было бы пропущено',
};

/**
 * RU: Отказ по схеме файла вывоза: заголовок чужой, повреждён или неполный.
 * RU: Вход: prichina — причина словами; kod — машинный код (умолчание VYVOZ_CHUZHAYA_SHEMA —
 * RU:   чужая версия схемы). Выход: исключение с полями message (с приставкой «ввоз: »),
 * RU:   code и prichina. Вызывающий различает отказы по code, а не по тексту.
 * RU: ⚠️ Приставка «ввоз: » стоит у любого OtkazShemy, кто бы его ни бросил.
 * EN: Refusal due to the export file schema: the header is foreign, damaged or incomplete.
 * EN: Input: prichina — reason in words; kod — machine code (default VYVOZ_CHUZHAYA_SHEMA —
 * EN:   foreign schema version). Output: an exception with fields message (prefixed "ввоз: ",
 * EN:   i.e. "import: "), code and prichina. Callers tell refusals apart by code, not by text.
 * EN: ⚠️ The "ввоз: " prefix is present on every OtkazShemy, whoever throws it.
 */
export class OtkazShemy extends Error {
  constructor(prichina, kod = 'VYVOZ_CHUZHAYA_SHEMA') {
    super(`ввоз: ${prichina}`);
    this.code = kod;
    this.prichina = prichina;
  }
}

/**
 * RU: Поля базы, о которых вывоз не знает ВОВСЕ: их нет ни в POLYA (вывозим), ни в
 * RU: NE_VYVOZITSYA (решено не вывозить).
 * EN: Database fields that export knows NOTHING about: they are neither in POLYA (exported)
 * EN: nor in NE_VYVOZITSYA (decided not to export).
 *
 * RU: 🔴 ЗАЧЕМ ЭТО ОТДЕЛЬНО ОТ «ПОЛЕЙ, КОТОРЫХ В БАЗЕ НЕТ». Те две проверки зеркальны, но
 * RU: ловят разное. «Поля нет в базе» — база старше вывоза, потеря видна сразу. «Поле есть,
 * RU: а вывоз о нём не знает» — СХЕМА УШЛА ВПЕРЁД, и знание теряется МОЛЧА: на той стороне
 * RU: записи просто не будет этого поля, и никто не отличит «не переносили» от «не было».
 * RU: Найдено 05.09.2026 на живой базе: полей 12, вывоз знал 10; `proishozhdenie` и
 * RU: `proverka` (заведены миграцией ядра a32) не значились нигде.
 * EN: 🔴 WHY THIS IS SEPARATE FROM "FIELDS MISSING FROM THE DATABASE". The two checks mirror each
 * EN: other but catch different things. "Field missing from the database" — the database is
 * EN: older than export, and the loss is visible at once. "Field present, but export does not
 * EN: know it" — THE SCHEMA MOVED AHEAD, and knowledge is lost SILENTLY: on the other side the
 * EN: record simply lacks that field, and nobody can tell "not transferred" from "never existed".
 * EN: Found 05.09.2026 on the live database: 12 fields, export knew 10; `proishozhdenie` and
 * EN: `proverka` (introduced by core migration a32) were listed nowhere.
 *
 * RU: ⚠️ ПОЧЕМУ НАЗЫВАЕМ, А НЕ ОСТАНАВЛИВАЕМ — в отличие от незнакомого КЛАССА.
 * RU: Незнакомый класс грозит выпустить секрет наружу: утечка необратима, поэтому вывоз
 * RU: встаёт целиком. Незнакомое поле грозит НЕ перенести знание: исходная база цела,
 * RU: перенести можно позже — потеря обратима. Разная цена — разный режим; уравнять их
 * RU: значило бы останавливать перенос при каждой миграции схемы.
 * EN: ⚠️ WHY WE NAME IT INSTEAD OF STOPPING — unlike an unfamiliar CLASS.
 * EN: An unfamiliar class threatens to let a secret out: a leak is irreversible, so export
 * EN: stops entirely. An unfamiliar field threatens to NOT transfer knowledge: the source
 * EN: database is intact and the transfer can be done later — the loss is reversible.
 * EN: Different price — different mode; equalising them would mean halting transfer at every
 * EN: schema migration.
 *
 * RU: Вход: estVBaze — массив имён столбцов, снятых с базы. Выход: новый массив незнакомых
 * RU: имён в исходном порядке (пустой — все знакомы). Своих отказов нет (не-массив на
 * RU: входе даст TypeError).
 * RU: Чего НЕ ловит: сравнение по точному имени — переименованный столбец виден как
 * RU: «незнакомый», а не как «тот же»; ключ NE_VYVOZITSYA, совпавший с именем столбца по
 * RU: случайности (например, столбец zhurnal), будет сочтён знакомым.
 * EN: Input: estVBaze — array of column names read from the database. Output: a new array of
 * EN: unfamiliar names in original order (empty — all known). No refusals of its own (a
 * EN: non-array input raises TypeError).
 * EN: Does NOT catch: matching is by exact name — a renamed column shows up as "unfamiliar",
 * EN: not as "the same"; an NE_VYVOZITSYA key that happens to equal a column name (for
 * EN: example, a column named zhurnal) will be treated as known.
 */
export function neznakomye_polya(estVBaze) {
  const znaem = new Set([...POLYA, ...Object.keys(NE_VYVOZITSYA)]);
  return estVBaze.filter((p) => !znaem.has(p));
}

/**
 * RU: Заголовок файла вывоза — первая строка.
 * EN: Export file header — the first line.
 *
 * RU: Поле `polya_neizvestnye_vyvozu` кладётся В ФАЙЛ, а не только в наш отчёт: принимающая
 * RU: сторона обязана видеть, ЧЕГО в этом файле нет по нашему незнанию, а не гадать.
 * EN: The field `polya_neizvestnye_vyvozu` goes INTO THE FILE, not only into our report: the
 * EN: receiving side must see WHAT is missing from this file because of our ignorance, rather
 * EN: than guess.
 *
 * RU: Вход: { otkuda — источник, названный вызывающим; uzel — имя машины от ОС; kogda — время
 * RU:   вывоза, мс (умолчание — сейчас); zapisej — число записей в файле; zaderzhano — число
 * RU:   отсеянных фильтром (умолчание 0); summa — сумма содержимого (если нет — поле не
 * RU:   кладётся); neizvestnye — незнакомые поля базы (пусто — поле не кладётся) }.
 * RU: Выход: объект заголовка; сериализует его вызывающий.
 * RU: Отказов нет: функция НЕ проверяет otkuda и прочее — обязательность otkuda исполняет
 * RU: vyvezti (отказ VYVOZ_NET_OTKUDA) на вывозе и proverit_zagolovok на ввозе.
 * EN: Input: { otkuda — source named by the caller; uzel — machine name from the OS; kogda —
 * EN:   export time, ms (default — now); zapisej — number of records in the file; zaderzhano —
 * EN:   number filtered out (default 0); summa — content checksum (if absent, the field is
 * EN:   omitted); neizvestnye — unfamiliar database fields (empty — the field is omitted) }.
 * EN: Output: the header object; the caller serialises it.
 * EN: No refusals: the function does NOT validate otkuda or anything else — otkuda being
 * EN: mandatory is enforced by vyvezti (refusal VYVOZ_NET_OTKUDA) on export and by
 * EN: proverit_zagolovok on import.
 */
export function zagolovok({ otkuda, uzel, kogda = Date.now(), zapisej,
                            zaderzhano = 0, summa, neizvestnye = [] }) {
  return {
    vyvoz: 'dsh-pamyat',
    versiya_shemy: VERSIYA_SHEMY,
    polya: POLYA,
    ...(neizvestnye.length ? { polya_neizvestnye_vyvozu: neizvestnye } : {}),
    // RU: 🔴 otkuda И uzel — РАЗНЫЕ ВЕЛИЧИНЫ, И РАЗВОДИТЬ ИХ ОБЯЗАТЕЛЬНО (условие приёмки В1).
    // RU: otkuda — то, что назвал вызывающий, и назвать ОБЯЗАН: умолчания нет (см. vyvezti,
    // RU: отказ VYVOZ_NET_OTKUDA). До 06.09.2026 здесь допускалось «неизвестно» — снято.
    // RU: uzel — имя машины, снятое ОС в момент вывоза. Если их слить, читающий на той
    // RU: стороне не отличит «файл сделан на машине X» от «кто-то написал в поле X».
    // EN: 🔴 otkuda AND uzel ARE DIFFERENT QUANTITIES, AND THEY MUST BE KEPT APART (acceptance
    // EN: condition V1). otkuda is what the caller named, and the caller MUST name it: there is no
    // EN: default (see vyvezti, refusal VYVOZ_NET_OTKUDA). Before 06.09.2026 "unknown" was allowed
    // EN: here — removed. uzel is the machine name taken from the OS at export time. If they were
    // EN: merged, the reader on the other side could not tell "the file was made on machine X" from
    // EN: "someone wrote X into the field".
    otkuda,
    uzel,
    kogda,
    zapisej,
    // RU: 🔴 ЧИСЛО ЗАДЕРЖАННЫХ — В ЗАГОЛОВКЕ, А НЕ ТОЛЬКО В ОТЧЁТЕ (В1). Отчёт остаётся
    // RU: у вывозящего, а файл уезжает; без этого числа принимающая сторона не знает, что
    // RU: часть записей отсеяна фильтром, и «68 записей» читается как «вся память».
    // EN: 🔴 THE NUMBER OF WITHHELD RECORDS IS IN THE HEADER, NOT ONLY IN THE REPORT (V1). The
    // EN: report stays with the exporter while the file travels; without this number the
    // EN: receiving side does not know that part of the records was filtered out, and
    // EN: "68 records" reads as "the whole memory".
    zaderzhano,
    // RU: 🔴 ЧТО НЕ ВЫВЕЗЕНО — И ПОЧЕМУ, В САМОМ ФАЙЛЕ (требование координатора 06.09.2026).
    // RU: Причины жили только в коде и в отчёте: отчёт остаётся у вывозящего, код — у нас,
    // RU: а файл уезжает к тому, кто нас не читал. Он увидит поля, которых нет, и решит либо
    // RU: что вывоз их теряет, либо что их не было в базе. Оба вывода неверны и оба ведут
    // RU: чинить работающее. Карта берётся ИЗ ОДНОГО МЕСТА с решением (NE_VYVOZITSYA):
    // RU: второй список причин разошёлся бы с первым молча.
    // EN: 🔴 WHAT WAS NOT EXPORTED — AND WHY, IN THE FILE ITSELF (coordinator's requirement,
    // EN: 06.09.2026). The reasons lived only in the code and in the report: the report stays with
    // EN: the exporter, the code stays with us, and the file travels to someone who has not read
    // EN: us. They will see fields that are missing and conclude either that export loses them or
    // EN: that they were never in the database. Both conclusions are wrong and both lead to
    // EN: fixing something that works. The map is taken FROM THE SAME PLACE as the decision
    // EN: (NE_VYVOZITSYA): a second list of reasons would silently drift away from the first.
    ne_vyvozitsya: NE_VYVOZITSYA,
    // RU: 🔴 СУММА СОДЕРЖИМОГО — ЧТОБЫ ВВОЗ МОГ ПРОВЕРИТЬ, ЧТО ФАЙЛ ДОШЁЛ ЦЕЛИКОМ (В1).
    // RU: Считается по строкам записей БЕЗ заголовка: заголовок содержит саму сумму, и
    // RU: включить его значило бы считать сумму от суммы.
    // EN: 🔴 CONTENT CHECKSUM — SO THAT IMPORT CAN VERIFY THE FILE ARRIVED WHOLE (V1).
    // EN: Computed over the record lines WITHOUT the header: the header contains the checksum
    // EN: itself, and including it would mean computing a checksum of the checksum.
    ...(summa ? { summa } : {}),
  };
}

/**
 * RU: Сумма содержимого файла вывоза: sha256 по строкам записей, без заголовка.
 * RU: 🔴 ФУНКЦИЯ ОДНА НА ОБЕ СТОРОНЫ. Две реализации «одного и того же» разошлись бы молча —
 * RU: этот класс у нас уже стоил трёх разошедшихся списков.
 * EN: Content checksum of an export file: sha256 over the record lines, without the header.
 * EN: 🔴 ONE FUNCTION FOR BOTH SIDES. Two implementations of "the same thing" would drift apart
 * EN: silently — this class of mistake has already cost us three diverged lists.
 *
 * RU: Вход: stroki — массив строк записей (без заголовка и без перевода строки в конце);
 * RU:   склеиваются через '\n', кодировка UTF-8.
 * RU: Выход: строка 'sha256:' + первые 32 шестнадцатеричных знака (128 бит) дайджеста —
 * RU:   НЕ полный sha256, хотя приставка его и называет.
 * RU: Своих отказов нет (не-массив на входе даст TypeError). Чего НЕ ловит: это проверка целостности, а не подлинности — изменённый
 * RU:   файл с пересчитанной суммой в заголовке пройдёт; разницу в конечном переводе строки
 * RU:   решает вызывающий, разбивая файл на строки.
 * EN: Input: stroki — array of record lines (without the header and without a trailing
 * EN:   newline); joined with '\n', UTF-8 encoded.
 * EN: Output: the string 'sha256:' + the first 32 hex characters (128 bits) of the digest —
 * EN:   NOT a full sha256, although the prefix names it so.
 * EN: No refusals of its own (a non-array input raises TypeError). Does NOT catch: this is an integrity check, not authenticity — a modified
 * EN:   file with a recomputed checksum in its header will pass; trailing-newline differences
 * EN:   are decided by the caller when it splits the file into lines.
 */
export function summa_soderzhimogo(stroki) {
  return 'sha256:' + createHash('sha256').update(stroki.join('\n'), 'utf8').digest('hex').slice(0, 32);
}

/**
 * RU: Разбор заголовка при ввозе. Чужая версия — ОТКАЗ, база не тронута.
 * RU: Отсутствие заголовка — тоже отказ: файл без самоописания читать нечем.
 * EN: Header check on import. A foreign version means REFUSAL, and the database is untouched.
 * EN: A missing header is a refusal too: a file without a self-description cannot be read.
 *
 * RU: Вход: z — разобранный JSON первой строки файла. Выход: тот же объект z без изменений.
 * RU: Отказы (OtkazShemy, по порядку проверки):
 * RU:   VYVOZ_NET_ZAGOLOVKA — z не объект (null, число, строка);
 * RU:   VYVOZ_NE_NASH_FAJL — поле vyvoz не равно 'dsh-pamyat';
 * RU:   VYVOZ_CHUZHAYA_SHEMA — versiya_shemy не равна VERSIYA_SHEMY (строгое равенство);
 * RU:   VYVOZ_ZAGOLOVOK_BEZ_OTKUDA — otkuda не строка или пуста после обрезки пробелов.
 * RU: Чего НЕ ловит: не сверяет polya заголовка с POLYA, не проверяет uzel, kogda, zapisej,
 * RU:   zaderzhano и формат summa; сумму сверяет вызывающий (ввоз) — и только если она есть.
 * EN: Input: z — parsed JSON of the file's first line. Output: the same object z, unchanged.
 * EN: Refusals (OtkazShemy, in check order):
 * EN:   VYVOZ_NET_ZAGOLOVKA — z is not an object (null, number, string);
 * EN:   VYVOZ_NE_NASH_FAJL — the vyvoz field is not 'dsh-pamyat';
 * EN:   VYVOZ_CHUZHAYA_SHEMA — versiya_shemy is not VERSIYA_SHEMY (strict equality);
 * EN:   VYVOZ_ZAGOLOVOK_BEZ_OTKUDA — otkuda is not a string or is empty after trimming.
 * EN: Does NOT catch: does not compare the header's polya with POLYA, does not check uzel,
 * EN:   kogda, zapisej, zaderzhano or the summa format; the checksum is verified by the caller
 * EN:   (import) — and only if it is present.
 */
export function proverit_zagolovok(z) {
  if (!z || typeof z !== 'object') {
    throw new OtkazShemy('первая строка файла не заголовок — читать нечем', 'VYVOZ_NET_ZAGOLOVKA');
  }
  if (z.vyvoz !== 'dsh-pamyat') {
    throw new OtkazShemy(`это не файл вывоза памяти (vyvoz=${JSON.stringify(z.vyvoz)})`, 'VYVOZ_NE_NASH_FAJL');
  }
  if (z.versiya_shemy !== VERSIYA_SHEMY) {
    throw new OtkazShemy(
      `версия схемы файла ${JSON.stringify(z.versiya_shemy)}, а этот пакет знает ${VERSIYA_SHEMY}. `
      + 'Читать чужую версию догадкой нельзя: поле могло не появиться, а поменять смысл',
    );
  }
  // RU: 🔴 ЗАГОЛОВОК БЕЗ `otkuda` — ОТКАЗ, А НЕ ПОДСТАНОВКА СВОЕГО (условие автора предмета,
  // RU: 06.09.2026). Довод: `proishozhdenie` записи истинно ОТНОСИТЕЛЬНО ИСТОЧНИКА. Значение
  // RU: «до протокола» на принимающей машине, у которой свой рубеж и своя история, означает
  // RU: другое. Прочитать уровень без источника — значит поставить на записи подпись, за
  // RU: которую никто не отвечал, а ложная подпись хуже пустой: пустая заставит переспросить,
  // RU: заполненная — нет.
  // RU: ⚠️ И подставить СВОЁ имя тут нельзя тем более: это уверенный ответ про чужой узел.
  // EN: 🔴 A HEADER WITHOUT `otkuda` IS REFUSED, NOT FILLED IN WITH OUR OWN VALUE (condition set
  // EN: by the subject's author, 06.09.2026). Reason: a record's `proishozhdenie` is true
  // EN: RELATIVE TO ITS SOURCE. The value "pre-protocol" on the receiving machine, which has its
  // EN: own cutoff and its own history, means something else. Reading the level without the
  // EN: source would put a signature on the record that nobody answered for, and a false
  // EN: signature is worse than an empty one: an empty one makes you ask again, a filled one
  // EN: does not.
  // EN: ⚠️ And substituting OUR OWN name here is even less acceptable: it would be a confident
  // EN: answer about someone else's node.
  if (typeof z.otkuda !== 'string' || !z.otkuda.trim()) {
    throw new OtkazShemy(
      'в заголовке нет «откуда» — источник не назван. Ввозить нельзя: уровень происхождения '
      + 'записей читается только относительно источника, а без него он стал бы подписью без автора',
      'VYVOZ_ZAGOLOVOK_BEZ_OTKUDA',
    );
  }
  return z;
}

/**
 * RU: 🔴 НЕИЗВЕСТНЫЙ КЛЮЧ ВЫЗОВА — ОТКАЗ, А НЕ УМОЛЧАНИЕ (07.09.2026, просьба координатора,
 * RU: подтверждённая случаем координатора от 01.09 и случаем исполнителя от 05.09).
 * RU: Замер до правки: `vyvezti({..., putFajla, vyhod})` — лишние ключи проглочены МОЛЧА,
 * RU: отчёт честно сказал «вывезено 1», файл лёг по УМОЛЧАНИЮ, а не по названному пути.
 * RU: Ни ошибки, ни признака: зовущий уверен, что назвал путь, и ищет файл не там.
 * RU: ⚠️ ГРАНИЦА: проверяются ключи ВЫЗОВА, а не поля данных. Незнакомое ПОЛЕ базы —
 * RU: другой случай и лечится иначе (там источник цел, теряется знание, а не действие).
 * EN: 🔴 AN UNKNOWN CALL KEY IS A REFUSAL, NOT A DEFAULT (07.09.2026, coordinator's request,
 * EN: backed by a coordinator's case from 01.09 and an executor's case from 05.09).
 * EN: Measured before the change: `vyvezti({..., putFajla, vyhod})` — the extra keys were
 * EN: swallowed SILENTLY, the report honestly said "exported 1", and the file landed at the
 * EN: DEFAULT location instead of the named path. No error, no sign: the caller is sure they
 * EN: named the path and looks for the file in the wrong place.
 * EN: ⚠️ BOUNDARY: this checks CALL keys, not data fields. An unfamiliar database FIELD is a
 * EN: different case and is handled differently (there the source is intact; knowledge is lost,
 * EN: not an action).
 *
 * RU: Выход: ничего (undefined), если лишних ключей нет. Отказ: Error (не OtkazShemy) с
 * RU:   code = kod и перечнем лишних и известных ключей в тексте.
 * RU: Чего НЕ ловит: отсутствие обязательных ключей и их типы; o = null/undefined проходит
 * RU:   как пустой объект; собственные ключи только перечисляемые (Object.keys).
 * EN: Output: nothing (undefined) if there are no extra keys. Refusal: an Error (not
 * EN:   OtkazShemy) with code = kod and the lists of extra and known keys in its message.
 * EN: Does NOT catch: missing required keys and their types; o = null/undefined passes as an
 * EN:   empty object; only own enumerable keys are seen (Object.keys).
 *
 * RU: @param {object} o        объект доводов вызова
 * RU: @param {string[]} znakomye перечень известных ключей — ОДИН на функцию, рядом с ней
 * RU: @param {string} imya     имя функции для текста отказа
 * RU: @param {string} kod      код отказа
 * EN: o — the call's argument object; znakomye — list of known keys, ONE per function, kept
 * EN: next to it; imya — function name for the refusal text; kod — refusal code.
 * @param {object} o
 * @param {string[]} znakomye
 * @param {string} imya
 * @param {string} kod
 */
export function proverit_klyuchi(o, znakomye, imya, kod) {
  const lishnie = Object.keys(o ?? {}).filter((k) => !znakomye.includes(k));
  if (lishnie.length === 0) return;
  const e = new Error(
    `${imya}: неизвестные ключи вызова: ${lishnie.join(', ')}. ` +
    `Известны: ${znakomye.join(', ')}. ` +
    'Отказ, а не умолчание: проглоченный ключ уводит файл по другому пути, а отчёт при этом честен.');
  e.code = kod;
  throw e;
}
