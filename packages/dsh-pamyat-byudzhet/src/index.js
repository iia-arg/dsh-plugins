/**
 * RU: dsh-pamyat-byudzhet — ВХОДЯЩИЙ бюджет памяти агента DSH.
 *     Отвечает на один вопрос: сколько знания поднять обратно в разговор, чтобы память не вытеснила сам
 *     разговор. Расход контекста — НЕ его дело (это соседний пакет dsh-pamyat-nudzh); задваивать не надо.
 *     Пакет — плагин cordis: при монтаже публикует службу byudzhetPamyati (edinicy, ocenit, sverit, otobrat).
 *     Вызывающий (слой восстановления памяти) передаёт кандидатов, служба отбирает их под предел в единицах
 *     НАШЕЙ меры и печатает в stderr, что поднято, что отброшено и почему.
 *     ОТКАЗЫВАЕТ, А НЕ СОВЕТУЕТ. Если поднялось не всё — говорит об этом громко и называет, чего вызывающий
 *     лишился. Молчаливое «подняли не всё» снаружи неотличимо от «памяти нет», а это разные беды с разным
 *     лечением.
 *     ЗНАЕМОЕ ПРО ВЫВОД. Кричит ТОЛЬКО через console.error, развилки нет. Причина (замер 03.09 на cordis
 *     4.0.1): ctx.logger создаётся каждому Context, вызов .error() проходит без ошибки, но единственный
 *     встроенный приёмник кладёт сообщение в кольцевой буфер на 1000 записей внутри процесса и наружу не
 *     отдаёт. Проверка наличия канала тут бесполезна: функция есть, звука нет. Способ перепроверить — стенд
 *     stend-krik-zvuchit: поднять пакет отдельным процессом под настоящим Context и ждать строку в его stderr.
 * EN: dsh-pamyat-byudzhet — the INCOMING memory budget of a DSH agent.
 *     It answers one question: how much knowledge to bring back into the conversation so that memory does not
 *     crowd out the conversation itself. Context spend is NOT its business (that is the sibling package
 *     dsh-pamyat-nudzh); no duplication.
 *     The package is a cordis plugin: on mount it publishes the byudzhetPamyati service (edinicy, ocenit,
 *     sverit, otobrat). The caller (the memory restore layer) passes candidates, the service selects them under
 *     a limit in units of OUR measure and prints to stderr what was raised, what was dropped and why.
 *     IT REFUSES, IT DOES NOT ADVISE. If not everything was raised it says so loudly and names what the caller
 *     lost. A silent "not everything was raised" is indistinguishable from "there is no memory", and those are
 *     different problems with different cures.
 *     KNOWN ABOUT OUTPUT. It speaks ONLY via console.error, there is no fork. Reason (measured on 03.09 with
 *     cordis 4.0.1): ctx.logger is created for every Context and .error() succeeds, but the only built-in sink
 *     puts the message into an in-process ring buffer of 1000 entries and never emits it. Checking for a
 *     channel is useless here: the function exists, the sound does not. How to re-check — the
 *     stend-krik-zvuchit stand: start the package in a separate process under a real Context and wait for the
 *     line in its stderr.
 */
import z from '@deepseek-ai/schemastery';
import { otobrat, PORYADKI } from './otbor.js';
import { ocenit, sverit, SIMVOLOV_NA_EDINICU } from './mera.js';
import { createRequire } from 'node:module';

export const name = 'dsh-pamyat-byudzhet';

// RU: Схема — schemastery, как у соседних пакетов. Не zod: платформа проверяет настройку своей схемой, и чужая
//     здесь была бы несовместима молча.
// EN: The schema is schemastery, as in sibling packages. Not zod: the platform validates settings with its own
//     schema, and a foreign one would be silently incompatible here.
export const Config = z.object({
  /**
   * RU: predel — предел подъёма в единицах НАШЕЙ меры (см. src/mera.js); 0 — не поднимать ничего.
   * EN: predel — the raise limit in units of OUR measure (see src/mera.js); 0 — raise nothing.
   */
  predel: z.number().default(2000),
  /**
   * RU: poryadok — порядок важности: 'svezhest' (умолчание) или 'vera'. Схема принимает любую строку;
   *     неизвестный порядок отклоняется в apply строкой «ОТКЛОНЕНО» (действует прежний годный или умолчание).
   * EN: poryadok — importance order: 'svezhest' (default) or 'vera'. The schema accepts any string; an unknown
   *     order is rejected in apply with an "ОТКЛОНЕНО" line (the previous valid one or the default stays).
   */
  poryadok: z.string().default('svezhest'),
  /**
   * RU: porogVery — ниже этого вера считается низкой; только для ОБЪЯСНЕНИЯ отброса, отбор не меняет.
   * EN: porogVery — below this, confidence counts as low; only to EXPLAIN drops, it does not change the
   *     selection.
   */
  porogVery: z.number().default(0.5),
});

// RU: ВЕРСИЯ ИЗ СВОЕГО МАНИФЕСТА, НЕ КОНСТАНТОЙ. По журналу должно быть видно не только КТО сказал, но и КАКАЯ
//     редакция. Константа при следующем выпуске утверждала бы номер, которому предмет уже не соответствует. Не
//     прочиталось — говорим «версия неизвестна», а не подставляем последнюю известную.
//     Этот пакет получил версию в строке позже соседей по семейству: правило применили сначала к части пакетов,
//     и этот остался без него на сутки — лечили экземпляры, а не класс.
// EN: THE VERSION COMES FROM OUR OWN MANIFEST, NOT A CONSTANT. The log must show not only WHO spoke but also
//     WHICH revision. A constant would, at the next release, claim a number the code no longer matches. If
//     unreadable we print "версия неизвестна" (version unknown) rather than the last known one.
//     This package got the version in its lines later than its siblings: the rule was first applied to some
//     packages only, and this one went without it for a day — instances were treated, not the class.
const versiya = (() => {
  try { return createRequire(import.meta.url)('../package.json').version ?? 'версия неизвестна'; }
  catch { return 'версия неизвестна'; }
})();

function krik(soobshchenie) {
  console.error('[dsh-pamyat-byudzhet ' + versiya + '] ' + soobshchenie);
}

// RU: ГРАНИЦЫ ЧИСЕЛ ПРОВЕРЯЮТСЯ ЗДЕСЬ, В apply, А НЕ В СХЕМЕ. Схема знает только «число», и предел −5 или порог
//     веры 3 принимались молча — и при старте, и при горячей загрузке (правка настройки: платформа зовёт apply
//     заново в том же процессе). Проверка в apply работает на обоих путях одинаково.
//     Негодное значение ОТКЛОНЯЕТСЯ: действует прежнее годное, а если его нет — умолчание; об отказе печатается
//     строка «ОТКЛОНЕНО: …». Прежнее годное живёт на уровне МОДУЛЯ: при смене настройки загрузчик модуль не
//     перечитывает (cordis-plugin-loader без смены имени берёт прежний callback).
//     Граница: одно значение на процесс. Если в одном процессе разные узлы зададут разные числа, «прежним
//     годным» станет последнее принятое у любого из них (замер: у всех трёх вызовов apply в процессе значения
//     одинаковы).
//     predel ≥ 0, а не > 0: ноль — законная настройка «не поднимать ничего», о ней кричит ветка ниже. Отклонять
//     его значило бы сломать договор.
//     poryadok проверяется так же (vzyatPoryadok): прежде неизвестная строка принималась при монтаже, и КАЖДЫЙ
//     отбор потом бросал исключение — знания не поднимались, а подъём выглядел исправным.
// EN: NUMBER BOUNDS ARE CHECKED HERE, IN apply, NOT IN THE SCHEMA. The schema only knows "number", and a limit
//     of −5 or a confidence threshold of 3 used to be accepted silently — both at start-up and on hot reload (a
//     settings edit: the platform calls apply again in the same process). A check in apply works the same on
//     both paths.
//     An invalid value is REJECTED: the previous valid value stays in force, or the default if there is none; a
//     line "ОТКЛОНЕНО: …" (REJECTED) is printed. The previous valid value lives at MODULE level: on a settings
//     change the loader does not re-read the module (cordis-plugin-loader without a name change reuses the
//     previous callback).
//     Boundary: one value per process. If different nodes in one process set different numbers, the "previous
//     valid" one is the last accepted from any of them (measured: all three apply calls in a process carry the
//     same values).
//     predel ≥ 0, not > 0: zero is a legitimate setting "raise nothing", the branch below shouts about it.
//     Rejecting it would break the contract.
//     poryadok is checked the same way (vzyatPoryadok): previously an unknown string was accepted at mount time,
//     and EVERY selection then threw — knowledge was not raised while the start-up looked healthy.
const prezhneeGodnoe = {};
function vzyatChislo(pole, znachenie, umolchanie, godno, dopusk) {
  if (znachenie === undefined || znachenie === null) znachenie = umolchanie;
  if (typeof znachenie === 'number' && Number.isFinite(znachenie) && godno(znachenie)) {
    prezhneeGodnoe[pole] = znachenie;
    return znachenie;
  }
  const est = prezhneeGodnoe[pole] !== undefined;
  const dejstvuet = est ? prezhneeGodnoe[pole] : umolchanie;
  krik('ОТКЛОНЕНО: ' + pole + ' = ' + String(znachenie) + ' — вне допуска ' + dopusk +
       '; действует ' + dejstvuet + (est ? ' (прежнее годное)' : ' (умолчание)') + '.');
  return dejstvuet;
}

// RU: ИНВАРИАНТ: платформа вызывает apply НЕСКОЛЬКО раз на подъём (замер: 3). Процессных ресурсов здесь не
//     заводить (таймеры, слушатели process, сокеты). Если понадобятся — защёлка на модуль со снятием через
//     ctx.effect: события 'dispose' в cordis 4.0.1 нет.
// EN: INVARIANT: the platform calls apply SEVERAL times per start-up (measured: 3). Do not create process-level
//     resources here (timers, process listeners, sockets). If ever needed — a module-level latch removed via
//     ctx.effect: cordis 4.0.1 has no 'dispose' event.
function vzyatPoryadok(znachenie) {
  if (znachenie === undefined || znachenie === null) znachenie = 'svezhest';
  if (PORYADKI.includes(znachenie)) { prezhneeGodnoe.poryadok = znachenie; return znachenie; }
  const est = prezhneeGodnoe.poryadok !== undefined;
  const dejstvuet = est ? prezhneeGodnoe.poryadok : 'svezhest';
  krik('ОТКЛОНЕНО: poryadok = ' + JSON.stringify(znachenie) + ' — есть только ' + PORYADKI.join(', ') +
       '; действует «' + dejstvuet + '»' + (est ? ' (прежний годный)' : ' (умолчание)') + '.');
  return dejstvuet;
}

export function apply(ctx, config = {}) {
  const predel = vzyatChislo('predel', config.predel, 2000, (x) => x >= 0, '[0, ∞)');
  const poryadok = vzyatPoryadok(config.poryadok);
  const porogVery = vzyatChislo('porogVery', config.porogVery, 0.5, (x) => x >= 0 && x <= 1, '[0, 1]');

  // RU: БЕЗУСЛОВНЫЙ СЛЕД ПОДЪЁМА. Прежде пакет говорил ТОЛЬКО при беде, то есть исправно смонтированный был
  //     неотличим от несмонтированного, и «знания не поднялись» читалось одинаково при обеих причинах. Строка
  //     называет и настройки: иначе разбирающий не отличит «предел мал» от «порядок не тот».
  // EN: AN UNCONDITIONAL START-UP TRACE. Previously the package spoke ONLY on trouble, so a correctly mounted
  //     one was indistinguishable from an unmounted one, and "knowledge was not raised" read the same for both
  //     causes. The line names the settings too: otherwise a reader cannot tell "limit too small" from "wrong
  //     order".
  krik('подъём: предел ' + predel + ' ед., порядок «' + poryadok + '», порог веры ' + porogVery +
       '. Тепло считается и печатается, но на отбор НЕ ВЛИЯЕТ (прибор, не правило).');

  if (predel === 0) {
    krik('предел равен нулю: знание НЕ БУДЕТ подниматься вообще. ' +
         'Это настройка, а не поломка — но снаружи выглядит как пустая память.');
  }

  ctx.provide('byudzhetPamyati', {
    /**
     * RU: edinicy() — единицы, в которых считает пакет. Спрашивают — отвечаем честно: «оценка наша», не токены
     *     платформы.
     * EN: edinicy() — the units the package counts in. When asked we answer honestly: "оценка наша" (our
     *     estimate), not platform tokens.
     */
    edinicy() {
      return {
        imya: 'оценка наша',
        simvolovNaEdinicu: SIMVOLOV_NA_EDINICU,
        pochemuNeTokeny: 'оценщик платформы наружу не отдаётся (проверено 03.09 поиском ' +
                         'по dsh-compaction 0.1.1-rc.2: в lib/ счётчика нет, в exports тоже); ' +
                         'её число приходит готовым только для того, что компактит она сама',
      };
    },

    ocenit,
    sverit,

    /**
     * RU: otobrat(vopros) — отобрать записи под предел. Возвращает { podnyato, otbrosheno, svodka }. Поля
     *     вопроса predel, poryadok и porogVery, если переданы, заменяют настройку на этот вызов (и проверяются
     *     уже в otbor.js — негодное значение бросает исключение). Если отброшено хоть что-то — кричит с
     *     НАЗВАННЫМИ причинами; строки касаний и тепла печатаются при каждом вызове.
     * EN: otobrat(vopros) — select records under the limit. Returns { podnyato, otbrosheno, svodka }. The
     *     request fields predel, poryadok and porogVery, if given, override the settings for this call (and are
     *     validated in otbor.js — an invalid value throws). If anything was dropped it shouts with NAMED
     *     reasons; the touch and warmth lines are printed on every call.
     */
    otobrat(vopros = {}) {
      const itog = otobrat({
        zapisi: vopros.zapisi ?? [],
        predel: vopros.predel ?? predel,
        poryadok: vopros.poryadok ?? poryadok,
        porogVery: vopros.porogVery ?? porogVery,
      });
      const s = itog.svodka;
      if (s.otbrosheno > 0) {
        // RU: ПРИЧИНЫ И СВОЙСТВА ПЕЧАТАЮТСЯ ПОРОЗНЬ И РАЗНЫМИ СЛОВАМИ. Причина отвергла запись, свойство только
        //     описывает отброшенных. Слитая строка заставляет разбирающего чинить не то: прочтя «3 с верой ниже
        //     0.5» среди причин, он пойдёт крутить порог веры, который при порядке «svezhest» не участвовал
        //     вовсе.
        // EN: REASONS AND PROPERTIES ARE PRINTED SEPARATELY AND IN DIFFERENT WORDS. A reason rejected a record,
        //     a property only describes the dropped ones. A merged line makes the reader fix the wrong thing:
        //     seeing "3 with confidence below 0.5" among reasons, they would tune the confidence threshold,
        //     which played no part at all under the "svezhest" order.
        krik('поднято НЕ ВСЁ: просили ' + s.prosili + ', подняли ' + s.podnyato +
             ', отброшено ' + s.otbrosheno + ' — ПРИЧИНЫ: ' + s.prichiny.join('; ') +
             (s.svoystva.length ? '. Из них: ' + s.svoystva.join('; ') : '') + '. ' +
             'Цена подъёма ' + s.cena + ' из ' + s.predel + ' — единицы «' + s.edinicy +
             '», НЕ токены платформы.');
      }
      // RU: Прибор тепла печатается при КАЖДОМ отборе, в том числе когда отброшено ноль — иначе распределение
      //     будет видно только в неудачных отборах, то есть смещённо. Строка говорит о СПРОСЕ и ничего не
      //     решает: на отбор тепло не влияет (см. шапку src/teplo.js — там же названо, когда это перестанет
      //     быть верным).
      // EN: The warmth instrument is printed on EVERY selection, including when nothing was dropped — otherwise
      //     the distribution would be visible only in failed selections, i.e. biased. The line speaks about
      //     DEMAND and decides nothing: warmth does not affect selection (see the header of src/teplo.js — it
      //     also names when this stops being true).
      const t = s.teplo;
      // RU: ТРИ ВХОДА — ТРЕМЯ ЧИСЛАМИ, В СВОЙСТВАХ, А НЕ В ПРИЧИНАХ. Ни один из трёх входов касаний ничего не
      //     отверг: вес касаний равен нулю, и это сказано в самой строке, чтобы её не прочли как решение.
      //     ОБЛАСТЬ И МОМЕНТ НАЗВАНЫ В САМОЙ СТРОКЕ. Прежняя редакция печатала «поле есть у 10, касались хоть
      //     раз 0», и это читалось как утверждение О ПАМЯТИ («счётчик мёртв»), хотя замер живой базы в тот же
      //     день дал «касались 9 записей из 189». Строка была верна и прочитана шире измеренного. Причин две:
      //     ОБЛАСТЬ — считаются только записи ЭТОГО отбора (кандидаты), а не вся память;
      //     МОМЕНТ — строка печатается ДО выдачи, а отметку касания ставит слой восстановления ПОСЛЕ неё (в
      //     журнале в ту же секунду: бюджет «касались 0», восстановление «касания отмечены: 9 из 9 выданных»).
      //     Числа по всей памяти отсюда взять нельзя: прибор видит переданную выборку, а не базу. Поэтому
      //     названа граница, а не выдумано число.
      // EN: THREE INPUTS — THREE NUMBERS, AS PROPERTIES, NOT REASONS. None of the three touch inputs rejected
      //     anything: the touch weight is zero, and the line says so itself so that it is not read as a
      //     decision.
      //     SCOPE AND MOMENT ARE NAMED IN THE LINE ITSELF. An earlier version printed "field present in 10,
      //     touched at least once 0", which read as a statement ABOUT MEMORY ("the counter is dead"), while a
      //     measurement of the live database that day gave "9 of 189 records touched". The line was correct and
      //     read wider than measured. Two reasons:
      //     SCOPE — only the records of THIS selection (candidates) are counted, not all memory;
      //     MOMENT — the line is printed BEFORE delivery, while the restore layer marks touches AFTER it (in
      //     the log within the same second: budget "touched 0", restore "touches marked: 9 of 9 delivered").
      //     Memory-wide numbers cannot be obtained here: the instrument sees the passed sample, not the
      //     database. So a boundary is named rather than a number invented.
      const kasStroka = t.kasanij_pole_est === 0
        ? 'касания: поля НЕТ ни у одной записи ЭТОГО отбора (ядро старше alpha.43 либо переходник их не везёт)'
        : 'касания В ЭТОМ ОТБОРЕ (' + t.kasanij_pole_est + ' записей-кандидатов, снято ДО выдачи): '
          + 'касались хоть раз ' + t.kasalis_hot_raz
          + ', последнее касание ' + (t.poslednee_kasanie ? new Date(t.poslednee_kasanie).toISOString() : 'НЕ БЫЛО')
          + ', вес прибавки ' + t.ves_kasaniya + ' (на порядок не влияет)'
          + '. ⚠️ Это НЕ про память: отметку ставит restore ПОСЛЕ этой строки, и сколько '
          + 'записей касались вообще — вопрос к базе, а не к прибору отбора';
      krik(kasStroka);
      krik('тепло (прибор, на отбор НЕ влияет): измерено ' + t.izmereno +
           ', не измерено ' + t.neizmereno +
           (t.izmereno ? ', мин ' + t.min.toFixed(4) + ', медиана ' + t.mediana.toFixed(4) +
            ', макс ' + t.max.toFixed(4) : '') +
           ', ниже порога ' + t.porog + ': ' + t.holodnyh +
           ' (полураспад ' + t.poluraspad_sutok + ' сут. — ГИПОТЕЗА, на живом корпусе не проверена)');
      return itog;
    },
  });
}
