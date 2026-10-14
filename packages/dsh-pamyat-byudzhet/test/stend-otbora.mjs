/**
 * RU: Стенд отбора (src/otbor.js, src/teplo.js): что поднято, что отброшено и НАЗВАНЫ ли причины; тепло —
 *     прибор, а не правило. Запуск: node test/stend-otbora.mjs; код 0 — всё зелёное, 1 — красные, 2 — слепота.
 * EN: Selection stand (src/otbor.js, src/teplo.js): what is raised, what is dropped, and whether the reasons
 *     are NAMED; warmth is an instrument, not a rule. Run: node test/stend-otbora.mjs; exit 0 — all green, 1 —
 *     red, 2 — blindness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let otobrat, teplo, POROG_HOLODNOJ, ocenit
try {
  ;({ otobrat } = await import('../src/otbor.js'))
  ;({ teplo, POROG_HOLODNOJ } = await import('../src/teplo.js'))
  ;({ ocenit } = await import('../src/mera.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
// RU: ВОЗВРАТ ТЕЛА УЧИТЫВАЕТСЯ (третий пакет с этой бедой за сутки). Обёртка краснела ТОЛЬКО на исключении, а
//     возвращённое значение выбрасывала. Четыре пробы в стиле «вернуть строку с причиной», перенесённые из ядра
//     памяти, где обёртка эту идиому понимает, были ЗЕЛЁНЫМИ при заведомо испорченном предмете (предмет отвечал
//     null, а стенд говорил 18 из 18). Поймано порчей, не чтением. Ожидающее тело тоже отвергается: синхронный
//     прогонщик молча пропустил бы async-пробу.
// EN: THE BODY'S RETURN IS COUNTED (the third package with this problem in a day). The wrapper turned red ONLY
//     on an exception and discarded the return value. Four probes in the "return a reason string" idiom,
//     carried over from the memory core where its wrapper understands the idiom, were GREEN on a deliberately
//     broken subject (the subject returned null and the stand said 18 of 18). Caught by breakage, not by
//     reading. An awaiting body is rejected too: a synchronous runner would silently skip an async probe.
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: ПО УСТРОЙСТВУ, А НЕ ПО ПЕРЕЧНЮ ЗНАЧЕНИЙ. Прежде ловились ровно строка и false, а 0, null, объект и
    //     число проходили ЗЕЛЁНЫМИ (из шести подставных форм ловились две). Перечень значений неполон по
    //     построению; годен один вопрос: вернуло ли тело хоть что-то, кроме молчания. Тело пробы обязано
    //     бросать ошибку либо молчать.
    // EN: BY STRUCTURE, NOT BY A LIST OF VALUES. Previously only a string and false were caught, while 0, null,
    //     an object and a number passed GREEN (two of six fake forms were caught). A list of values is
    //     incomplete by construction; the only valid question is whether the body returned anything other than
    //     silence. A probe body must throw or stay silent.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

const z = (soderzhim, extra = {}) => ({ soderzhim, sozdano: 1000, vera: null, ...extra });

proba('стенд годен: всё влезает → поднято всё, отброшено ноль', () => {
  const r = otobrat({ zapisi: [z('коротко'), z('тоже')], predel: 1000 });
  if (r.podnyato.length !== 2 || r.otbrosheno.length !== 0) throw new Error('подняли ' + r.podnyato.length);
  if (r.svodka.prichiny.length !== 0) throw new Error('причины при пустом отбросе');
});

proba('ГЛАВНОЕ: не влезло → отброшенное НАЗВАНО, а не только сосчитано', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(200)), z('б'.repeat(200))], predel: 55 });
  if (r.otbrosheno.length === 0) throw new Error('предел не сработал');
  if (r.svodka.prichiny.length === 0) throw new Error('отброшено молча, без причин');
  if (!r.svodka.prichiny.join(' ').match(/\d/)) throw new Error('в причинах нет чисел');
});

// RU: Эта проба переехала из prichiny в svoystva — и это не послабление. Требование то же: «вера ниже порога» и
//     «вера не измерялась» обязаны различаться. Изменилось МЕСТО: вера никого не отвергала, она свойство
//     отброшенных, а не причина отброса. Проба стерегла верное требование в неверном поле.
// EN: This probe moved from prichiny to svoystva — and it is not a relaxation. The requirement is the same:
//     "confidence below threshold" and "confidence never measured" must differ. What changed is the PLACE:
//     confidence rejected nobody, it is a property of the dropped, not a reason. The probe guarded the right
//     requirement in the wrong field.
proba('РАЗЛИЧЕНИЕ: «вера не измерялась» и «вера ниже порога» — РАЗНЫЕ свойства', () => {
  const r = otobrat({
    zapisi: [z('а'.repeat(200), { vera: 0.9 }), z('б'.repeat(200), { vera: 0.1 }), z('в'.repeat(200), { vera: null })],
    predel: 55, poryadok: 'vera',
  });
  const text = r.svodka.svoystva.join('; ');
  if (!/НЕИЗМЕРЕННОЙ/.test(text)) throw new Error('неизмеренная вера не названа отдельно: ' + text);
  if (!/ниже/.test(text)) throw new Error('низкая вера не названа отдельно: ' + text);
});

// RU: ── ПРИЧИНА ПРОТИВ СВОЙСТВА ──
// EN: ── REASON VERSUS PROPERTY ──
proba('🔴 вера НЕ попадает в причины: она никого не отвергала', () => {
  // RU: ПРЕДЕЛ 40, А НЕ 55, И ЭТО НЕ МЕЛОЧЬ. При 55 одна запись поднималась, и отброшенной оказывалась ровно
  //     та, у которой вера null, — то есть ветка «вера ниже порога» не исполнялась вовсе. Порча «вернуть веру в
  //     причины» внеслась, а проба осталась зелёной: она до испорченной строки не доходила. Фикстура, не
  //     создающая проверяемого состояния, даёт зелёное, неотличимое от исправности. Поймано порчей.
  // EN: LIMIT 40, NOT 55, AND THIS MATTERS. With 55 one record was raised and the dropped one was exactly the
  //     one with null confidence — so the "confidence below threshold" branch never ran. The breakage "put
  //     confidence back into reasons" was applied and the probe stayed green: it never reached the broken line.
  //     A fixture that does not create the checked state gives green indistinguishable from health. Caught by
  //     breakage.
  const r = otobrat({
    zapisi: [z('а'.repeat(200), { vera: 0.1 }), z('б'.repeat(200), { vera: null })],
    predel: 40, poryadok: 'svezhest',
  });
  const text = r.svodka.prichiny.join('; ');
  if (/вер/i.test(text))
    throw new Error('вера названа ПРИЧИНОЙ отброса, хотя отвергал предел: ' + text);
});

// RU: ДВЕ ПРИЧИНЫ, И ОНИ ЛЕЧАТСЯ РАЗНЫМ. Запись дороже всего предела не поднимется никогда и ни при каком
//     порядке — её лечит дробление, а не порядок. Слив двух причин заставил бы разбирающего крутить порядок за
//     чужой дефект. Пара проб обязана давать РАЗНЫЕ ответы: порознь каждая зеленеет на слитой причине.
// EN: TWO REASONS, CURED DIFFERENTLY. A record costlier than the whole limit will never be raised under any
//     order — splitting cures it, not order. Merging the two reasons would make the reader reshuffle the order
//     for someone else's defect. The pair of probes must give DIFFERENT answers: each alone is green on a
//     merged reason.
proba('причина «не влезает целиком» — своя, а не «не поместилась»', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(4000))], predel: 55 });
  const text = r.svodka.prichiny.join('; ');
  if (!/ЦЕЛИКОМ/.test(text))
    throw new Error('запись дороже всего предела не названа своей причиной: ' + text);
  if (/не поместил/.test(text))
    throw new Error('названа и чужой причиной тоже — причины слиты: ' + text);
});

proba('причина «не поместилась в остаток» — своя, а не «не влезает целиком»', () => {
  const r = otobrat({ zapisi: [z('а'.repeat(100)), z('б'.repeat(100))], predel: 40 });
  const text = r.svodka.prichiny.join('; ');
  if (!/не поместил/.test(text))
    throw new Error('вытесненная запись не названа своей причиной: ' + text);
  if (/ЦЕЛИКОМ/.test(text))
    throw new Error('названа и чужой причиной тоже — причины слиты: ' + text);
});

// RU: ── ТЕПЛО: ПРИБОР, А НЕ ПРАВИЛО ──
//     Проба на то, что тепло НЕ ВЛИЯЕТ на отбор. Обычно проверяют, что механизм работает, но здесь решение
//     владельца именно такое: считать и печатать, не отсекать, пока история короче трёх полураспадов. Без этой
//     пробы кто-нибудь «доделает» тепло до порядка, и отбор молча сменит основание.
// EN: ── WARMTH: AN INSTRUMENT, NOT A RULE ──
//     A probe that warmth does NOT affect selection. Usually one checks that a mechanism works, but here the
//     owner's decision is exactly this: compute and print, do not cut, while the history is shorter than three
//     half-lives. Without this probe someone would "finish" warmth into an order, and selection would silently
//     change its basis.
proba('🔴 тепло НЕ влияет на отбор: порядок тот же, что без него', () => {
  const staraya = z('а'.repeat(100), { sozdano: 1 });
  const svezhaya = z('б'.repeat(100), { sozdano: Date.now() });
  const r = otobrat({ zapisi: [staraya, svezhaya], predel: 40, poryadok: 'vera' });
  // RU: При порядке «vera» у обеих вера null, поэтому порядок между ними задан не теплом.
  // EN: Under the "vera" order both have null confidence, so the order between them is not set by warmth.
  if (r.svodka.teplo.vliyaet_na_otbor !== false)
    throw new Error('сводка утверждает, что тепло влияет на отбор');
  if (typeof r.svodka.teplo.mediana !== 'number')
    throw new Error('тепло не печатается — прибора нет');
});

proba('тепло: отсутствие — ТРЕТЬЕ состояние, не холод', () => {
  // RU: Вторую запись датирую ЯВНО: умолчание помощника z() — sozdano 1000, то есть 1970 год, и такая запись
  //     честно холодная. Первый прогон пробы покраснел именно на умолчании фикстуры, а не на предмете: неполная
  //     фикстура даёт ложное красное, неотличимое по виду от дефекта.
  // EN: The second record is dated EXPLICITLY: the z() helper's default is sozdano 1000, i.e. 1970, and such a
  //     record is honestly cold. The first run of this probe turned red on the fixture default, not the
  //     subject: an incomplete fixture gives a false red indistinguishable from a defect.
  const r = otobrat({ zapisi: [z('а'.repeat(200), { sozdano: 0 }), z('б'.repeat(200), { sozdano: Date.now() })], predel: 55 });
  const t = r.svodka.teplo;
  if (t.neizmereno !== 1)
    throw new Error('запись без даты рождения не отнесена к «тепло не измерялось»: ' + JSON.stringify(t));
  if (t.holodnyh !== 0)
    throw new Error('отсутствие тепла сочтено холодом — пустоту приравняли к нулю');
});

proba('🔴 ПУСТОТА НЕ НОЛЬ: запись без веры НЕ выбрасывается раньше доказанно плохой', () => {
  // RU: Порядок 'vera': 0.9 поднимется, затем спор между null и 0.1 — null должен быть впереди.
  // EN: Order 'vera': 0.9 is raised, then null versus 0.1 — null must come first.
  const r = otobrat({
    zapisi: [z('а'.repeat(100), { vera: 0.9 }), z('б'.repeat(100), { vera: 0.1 }), z('в'.repeat(100), { vera: null })],
    predel: 60, poryadok: 'vera',
  });
  const podnyatyeVery = r.podnyato.map((x) => x.vera);
  if (!podnyatyeVery.includes(null)) throw new Error('неизмеренная выброшена раньше веры 0.1 — пустоту сочли нулём');
});

proba('единицы названы СВОИМИ, слова «токены» в сводке нет', () => {
  const r = otobrat({ zapisi: [z('текст')], predel: 100 });
  if (r.svodka.edinicy !== 'оценка наша') throw new Error('единицы: ' + r.svodka.edinicy);
  if (/токен/i.test(JSON.stringify(r.svodka))) throw new Error('в сводке появилось слово «токены»');
});

proba('ПОРЧА: предел не число → отказ с кодом, а не молчаливый ноль', () => {
  let upalo = false;
  try { otobrat({ zapisi: [], predel: 'много' }); } catch (e) { upalo = /предел должен быть/.test(e.message); }
  if (!upalo) throw new Error('строковый предел принят');
});

proba('ПОРЧА: неизвестный порядок → отказ и ПЕРЕЧЕНЬ существующих', () => {
  let soobshchenie = '';
  try { otobrat({ zapisi: [], predel: 10, poryadok: 'важность' }); } catch (e) { soobshchenie = e.message; }
  if (!/svezhest/.test(soobshchenie)) throw new Error('не назвал, какие порядки есть: ' + soobshchenie);
});

proba('ПОРЧА: не список записей → отказ', () => {
  let upalo = false;
  try { otobrat({ zapisi: 'запись', predel: 10 }); } catch (e) { upalo = /список записей/.test(e.message); }
  if (!upalo) throw new Error('приняло не-список');
});

proba('предел ноль: поднято ничего, и это ОБЪЯСНЕНО, а не пусто', () => {
  const r = otobrat({ zapisi: [z('текст')], predel: 0 });
  if (r.podnyato.length !== 0) throw new Error('при нулевом пределе что-то поднялось');
  if (r.svodka.prichiny.length === 0) throw new Error('нулевой предел не объяснён');
});

// RU: ═══ ТРИ ВХОДА ТЕПЛА ═══
// EN: ═══ THREE WARMTH INPUTS ═══
proba('🔴 тепло считается и по имени kogda, не только sozdano', () => {
  // RU: Замер в работе: прибор печатал «измерено 0, не измерено 10». Ядро зовёт поле sozdano, слой
  //     восстановления переименовывает его в kogda — и прибор не измерил ни одной записи с самого появления, а
  //     число выглядело свойством данных.
  // EN: Measured in production: the instrument printed "measured 0, unmeasured 10". The core calls the field
  //     sozdano, the restore layer renames it to kogda — and the instrument measured not a single record since
  //     it appeared, while the number looked like a property of the data.
  const r = otobrat({ zapisi: [{ soderzhim: 'а'.repeat(100), kogda: Date.now() - 3600000 }], predel: 4000 });
  const t = r.svodka.teplo;
  if (t.izmereno !== 1) return 'запись с полем kogda не измерена: ' + JSON.stringify(t);
  if (t.neizmereno !== 0) return 'та же запись отнесена к «не измерялось»';
});

proba('три входа считаются порознь и абсолютными числами', () => {
  const teper = Date.now();
  const r = otobrat({ zapisi: [
    { soderzhim: 'а'.repeat(50), kogda: teper - 1000, kasanij: 2, poslednee_kasanie: teper - 500 },
    { soderzhim: 'б'.repeat(50), kogda: teper - 2000, kasanij: 0, poslednee_kasanie: null },
    { soderzhim: 'в'.repeat(50), kogda: teper - 3000 },
  ], predel: 4000 });
  const t = r.svodka.teplo;
  if (t.kasanij_pole_est !== 2) return 'поле касаний насчитано у ' + t.kasanij_pole_est + ', ожидалось 2';
  if (t.kasalis_hot_raz !== 1) return 'касавшихся ' + t.kasalis_hot_raz + ', ожидалась 1';
  if (t.poslednee_kasanie !== teper - 500) return 'последнее касание ' + t.poslednee_kasanie;
});

proba('запись БЕЗ поля касаний не считается «не касавшейся»', () => {
  // RU: Разные вещи: «ядро старше alpha.43, поля нет» и «поле есть, касаний ноль».
  // EN: Different things: "core older than alpha.43, no field" and "field present, zero touches".
  const r = otobrat({ zapisi: [{ soderzhim: 'а'.repeat(50), kogda: Date.now() }], predel: 4000 });
  const t = r.svodka.teplo;
  if (t.kasanij_pole_est !== 0) return 'запись без поля попала в счёт имеющих поле';
  if (t.kasalis_hot_raz !== 0) return 'запись без поля сочтена касавшейся';
});

proba('вес прибавки за касание — НОЛЬ и печатается числом', () => {
  const r = otobrat({ zapisi: [{ soderzhim: 'а'.repeat(50), kogda: Date.now(), kasanij: 5 }], predel: 4000 });
  if (r.svodka.teplo.ves_kasaniya !== 0) return 'вес не ноль: ' + r.svodka.teplo.ves_kasaniya;
  if (r.svodka.teplo.vliyaet_na_otbor !== false) return 'сводка утверждает, что тепло влияет на отбор';
});


// RU: ═══ ВЕС КАСАНИЙ ВЫКЛЮЧЕН — ПАРА ПРОБ НА ОБЕ СТОРОНЫ ОСИ ═══
//     Ось: «касания влияют на тепло». Первая половина требует, чтобы НЕ влияли, пока вес ноль; вторая стережёт
//     ОСНОВАНИЕ этого решения в шапке src/teplo.js — иначе устаревшее условие («появится счётчик касаний →
//     включить вес») переживёт свою причину и позовёт включить.
//     Условие наступило: касания считаются, а вес всё равно не включаем — при отборе по свежести они достаются
//     только верхушке (пересечение двух соседних выдач: 0). Основание сменилось, и стеречь надо именно его.
//     Важно для правки шапки teplo.js: вторая проба ищет в ней дословно «ПЕРЕСЕЧЕНИЕ опознавателей двух
//     соседних выдач» и слово journalctl, а также отсутствие двух опровергнутых фраз.
// EN: ═══ TOUCH WEIGHT DISABLED — A PAIR OF PROBES ON BOTH SIDES OF THE AXIS ═══
//     Axis: "touches affect warmth". The first half requires that they do NOT while the weight is zero; the
//     second guards the BASIS of that decision in the header of src/teplo.js — otherwise the stale condition
//     ("a touch counter appears → enable the weight") would outlive its cause and call for enabling.
//     The condition has occurred: touches are counted, yet the weight stays off — under freshness selection
//     they go only to the top (intersection of two neighbouring deliveries: 0). The basis changed, and it is
//     the basis that must be guarded.
//     Important when editing the teplo.js header: the second probe looks there for the verbatim phrase
//     "ПЕРЕСЕЧЕНИЕ опознавателей двух соседних выдач" and the word journalctl, and for the absence of two
//     refuted phrases.

proba('пока вес ноль, касания на тепло НЕ влияют — сравнение записей, различных ТОЛЬКО касаниями', () => {
  const kogda = Date.now() - 3600 * 1000;
  const bez = teplo({ sozdano: kogda });
  const s_kasaniyami = teplo({ sozdano: kogda, kasanij: 50, poslednee_kasanie: Date.now() });
  if (bez === null || s_kasaniyami === null) return 'тепло не измерено — проба не достала предмет';
  if (bez !== s_kasaniyami) return 'касания уже влияют на тепло: ' + bez + ' против ' + s_kasaniyami;
});

proba('ВТОРАЯ ПОЛОВИНА: основание в шапке НЕ утверждает опровергнутого и даёт проверяемое условие', () => {
  const put = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'teplo.js');
  const tekst = readFileSync(put, 'utf8');
  // RU: Опровергнуто замером: поля касаний есть (ядро alpha.43+), отмечено 9 записей из 189.
  // EN: Refuted by measurement: touch fields exist (core alpha.43+), 9 of 189 records marked.
  if (/счётчика касаний в схеме `zapisi` НЕТ НИ ОДНОГО ПОЛЯ/.test(tekst))
    return 'в шапке осталось опровергнутое утверждение «поля касаний нет»';
  if (/касаний никто не считает/.test(tekst))
    return 'в шапке осталось опровергнутое «касаний никто не считает»';
  // RU: Условие пересмотра обязано быть ПРОВЕРЯЕМЫМ, а не «когда будет видно».
  // EN: The revision condition must be CHECKABLE, not "when it becomes visible".
  if (!/ПЕРЕСЕЧЕНИЕ опознавателей двух соседних выдач/.test(tekst))
    return 'нового условия пересмотра в шапке нет';
  if (!/journalctl/.test(tekst))
    return 'условие пересмотра не сопровождается командой, которой оно снимается';
});

// RU: ПОРЯДОК «svezhest» ЧИТАЕТ ВРЕМЯ И ИЗ kogda (04.10.2026). Прежде ключом было только sozdano: запись со временем
//     лишь в kogda (так его называет слой восстановления) шла в порядке входа, и проба поднимала СТАРУЮ вместо свежей.
// EN: THE "svezhest" ORDER ALSO READS THE TIME FROM kogda (04.10.2026). Previously only sozdano was the key: a record
//     with its time only in kogda (the restore layer's name) kept its input position, and a probe raised an OLD one.
const DEN = 24 * 3600 * 1000;
proba('svezhest: время лишь в kogda → свежая поднимается раньше старой', () => {
  const staraya = { soderzhim: 'а'.repeat(100), kogda: Date.now() - 10 * DEN };
  const svezhaya = { soderzhim: 'б'.repeat(100), kogda: Date.now() - 3600000 };
  const r = otobrat({ zapisi: [staraya, svezhaya], predel: ocenit(svezhaya) });
  if (r.podnyato.length !== 1 || r.podnyato[0] !== svezhaya) return 'поднята не свежая: ' + (r.podnyato[0]?.soderzhim ?? '').slice(0, 3);
});
proba('возврат: sozdano по-прежнему ключ свежести', () => {
  const staraya = z('а'.repeat(100), { sozdano: Date.now() - 10 * DEN });
  const svezhaya = z('б'.repeat(100), { sozdano: Date.now() - 3600000 });
  const r = otobrat({ zapisi: [staraya, svezhaya], predel: ocenit(svezhaya) });
  if (r.podnyato[0] !== svezhaya) return 'поднята не свежая';
});
// RU: ПОРОГ ХОЛОДА В СВОДКЕ — ТО ЖЕ ЧИСЛО, ЧТО POROG_HOLODNOJ (04.10.2026): прежде 0.25 стоял в otbor.js литералом.
// EN: THE COLD THRESHOLD IN THE SUMMARY IS THE SAME NUMBER AS POROG_HOLODNOJ (04.10.2026): previously 0.25 was a literal in otbor.js.
proba('сводка называет порог холода из POROG_HOLODNOJ', () => {
  const holodnaya = z('х'.repeat(400), { sozdano: Date.now() - 90 * DEN });
  const r = otobrat({ zapisi: [holodnaya], predel: 1 });
  const s = r.svodka.svoystva.find((x) => x.startsWith('холодных'));
  if (s !== 'холодных (тепло ниже ' + POROG_HOLODNOJ + '): 1') return 'в сводке: ' + s + '; POROG_HOLODNOJ = ' + POROG_HOLODNOJ;
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
