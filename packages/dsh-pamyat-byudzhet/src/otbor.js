/**
 * RU: Отбор записей под предел. Отвечает на вопрос «что поднять и чего лишились».
 *     ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: отброшенное НАЗЫВАЕТСЯ, а не считается. «Отброшено 12» — число, из него
 *     нельзя понять, чего лишился вызывающий. «Отброшено 12: 9 не поместились, из них 3 с верой ниже 0.5» —
 *     знание. Молчаливое «подняли не всё» ничем не отличается от «памяти нет».
 *     И ВТОРОЕ, ИЗ СХЕМЫ ЯДРА ПАМЯТИ: поле vera объявлено REAL DEFAULT NULL, то есть NULL значит «НЕ
 *     ИЗМЕРЯЛАСЬ», а не «ноль». Отбор, считающий NULL нулём, выбросил бы первыми все записи, сделанные до
 *     появления поля. Поэтому «вера ниже порога» и «вера не измерялась» — РАЗНЫЕ свойства отброшенных и
 *     называются по отдельности. Пустота — не ноль.
 * EN: Selecting records under a limit. Answers "what to raise and what was lost".
 *     THE MAIN RULE OF THIS FILE: what is dropped is NAMED, not just counted. "12 dropped" is a number from
 *     which the caller cannot tell what was lost. "12 dropped: 9 did not fit, of them 3 with confidence below
 *     0.5" is knowledge. A silent "not everything was raised" is no different from "there is no memory".
 *     AND SECOND, FROM THE MEMORY CORE SCHEMA: the vera field is declared REAL DEFAULT NULL, i.e. NULL means
 *     "NEVER MEASURED", not "zero". A selection treating NULL as zero would drop first all records made before
 *     the field existed. So "confidence below threshold" and "confidence never measured" are DIFFERENT
 *     properties of the dropped records and are named separately. Emptiness is not zero.
 */
import { ocenit } from './mera.js';
import { raspredelenie, teplo, POROG_HOLODNOJ } from './teplo.js';

/**
 * RU: PORYADKI — порядки важности, которые пакет умеет: 'svezhest' (новые впереди) и 'vera' (высокая вера
 *     впереди). Их два; новые не выдумывать.
 * EN: PORYADKI — the importance orders the package supports: 'svezhest' (newest first) and 'vera' (highest
 *     confidence first). There are two; do not invent more.
 */
export const PORYADKI = ['svezhest', 'vera'];

function klyuchSvezhesti(z) { return -(Number(z.sozdano ?? z.kogda) || 0); }

function klyuchVery(z) {
  // RU: Неизмеренная вера НЕ приравнивается к нулю: она идёт после измеренных высоких, но впереди измеренных
  //     низких — «неизвестно» не хуже доказанно плохого (ключ −0,5).
  // EN: Unmeasured confidence is NOT treated as zero: it goes after measured high ones but ahead of measured
  //     low ones — "unknown" is not worse than proven bad (key −0.5).
  const v = z.vera;
  if (v === null || v === undefined) return -0.5;
  return -Number(v);
}

/**
 * RU: otobrat({ zapisi, predel, poryadok, porogVery }) — отобрать записи, укладывающиеся в предел: сортировка
 *     по порядку, затем жадный проход — запись поднимается, если её цена ещё помещается в остаток. Возвращает
 *     поднятое, отброшенное и сводку с ПРИЧИНАМИ, названными словами. Негодный список, предел или порядок —
 *     исключение с объяснением.
 *     Ключ порядка 'svezhest' — время рождения из sozdano, а если его нет — из kogda (так его называет слой
 *     восстановления; прибор тепла читает то же). Прежде ключом было только sozdano: запись со временем лишь в
 *     kogda шла в порядке входа, и проба поднимала СТАРУЮ вместо свежей. Записи без времени вовсе — ключ 0, в
 *     конце, в порядке входа.
 * EN: otobrat({ zapisi, predel, poryadok, porogVery }) — select records that fit the limit: sort by the order,
 *     then a greedy pass — a record is raised if its cost still fits the remainder. Returns the raised, the
 *     dropped and a summary with REASONS named in words. An invalid list, limit or order — an exception with an
 *     explanation.
 *     The 'svezhest' order key is the birth time from sozdano, or from kogda if that is missing (the name the
 *     restore layer uses; the warmth instrument reads the same). Previously only sozdano was the key: a record
 *     with its time only in kogda kept its input position, and a probe raised an OLD record instead of a fresh
 *     one. Records with no time at all — key 0, at the end, in input order.
 */
export function otobrat({ zapisi, predel, poryadok = 'svezhest', porogVery = 0.5 }) {
  if (!Array.isArray(zapisi)) {
    throw new Error('dsh-pamyat-byudzhet: отбирать можно только список записей');
  }
  if (typeof predel !== 'number' || !Number.isFinite(predel) || predel < 0) {
    throw new Error('dsh-pamyat-byudzhet: предел должен быть неотрицательным числом, получено ' + JSON.stringify(predel));
  }
  if (!PORYADKI.includes(poryadok)) {
    throw new Error('dsh-pamyat-byudzhet: неизвестный порядок ' + JSON.stringify(poryadok) + '; есть только ' + PORYADKI.join(', '));
  }

  const klyuch = poryadok === 'vera' ? klyuchVery : klyuchSvezhesti;
  const poryadochno = [...zapisi].sort((a, b) => klyuch(a) - klyuch(b));

  const podnyato = [], otbrosheno = [];
  let cena = 0;
  for (const z of poryadochno) {
    const c = ocenit(z);
    if (cena + c <= predel) { podnyato.push(z); cena += c; }
    else otbrosheno.push(z);
  }

  return { podnyato, otbrosheno, svodka: svodkaOtbrosa({ zapisi, podnyato, otbrosheno, cena, predel, poryadok, porogVery }) };
}

/**
 * RU: svodkaOtbrosa — сводка: числа И названные причины.
 *     ПРИЧИНА И СВОЙСТВО — РАЗНЫЕ ВЕЩИ (прежде они были слиты). Отбор отвергает по ОДНОМУ основанию: cena + c >
 *     predel. Вера на это не влияет вовсе при порядке «svezhest», и всё же прежняя сводка перечисляла
 *     отброшенных ПО ВЕРЕ так, будто вера их и отвергла; разбирающий, прочтя «3 с верой ниже 0.5», пойдёт
 *     крутить порог веры, который тут ни при чём. Теперь причины — только про предел, свойства — отдельным
 *     полем, «из них:».
 *     ПРИЧИН ДВЕ, А НЕ ОДНА, потому что лечатся они разным:
 *     «не влезает целиком» — цена ОДНОЙ записи больше ВСЕГО предела. Такая запись не поднимется никогда и ни
 *     при каком порядке. Лечение — дробление или выжимка при записи, а не порядок и не порог. Замер на живой
 *     базе: 7 из 23 отброшенных — сводки сжатия ценой 4008…4841 при пределе 2000, вдвое дороже всего бюджета.
 *     «не поместилась в остаток» — влезла бы, но бюджет уже занят. Это лечится порядком и пределом.
 *     Слив их в одну строку означал бы, что за чужой дефект («запись вдвое больше предела») будут винить
 *     порядок и без конца его перебирать.
 * EN: svodkaOtbrosa — the summary: numbers AND named reasons.
 *     A REASON AND A PROPERTY ARE DIFFERENT THINGS (they used to be merged). Selection rejects on ONE ground:
 *     cena + c > predel. Confidence plays no part at all under the "svezhest" order, yet the earlier summary
 *     listed the dropped BY CONFIDENCE as if confidence had rejected them; a reader seeing "3 with confidence
 *     below 0.5" would tune the confidence threshold, which is irrelevant here. Now reasons are only about the
 *     limit, properties are a separate field, "из них:" (of them).
 *     THERE ARE TWO REASONS, NOT ONE, because they are cured differently:
 *     "does not fit at all" — the cost of ONE record exceeds the WHOLE limit. Such a record will never be
 *     raised under any order. The cure is splitting or condensing at write time, not order or threshold.
 *     Measured on the live database: 7 of 23 dropped were compaction summaries costing 4008…4841 with a limit
 *     of 2000, twice the whole budget.
 *     "did not fit into the remainder" — it would fit, but the budget is already taken. This is cured by order
 *     and limit.
 *     Merging them into one line would blame the order for someone else's defect ("a record twice the limit")
 *     and keep it being reshuffled endlessly.
 */
function svodkaOtbrosa({ zapisi, podnyato, otbrosheno, cena, predel, poryadok, porogVery }) {
  const prichiny = [];
  const svoystva = [];
  if (otbrosheno.length) {
    const neVlezaet = otbrosheno.filter((z) => ocenit(z) > predel);
    const neVMestilos = otbrosheno.length - neVlezaet.length;
    if (neVlezaet.length) {
      prichiny.push(neVlezaet.length + ' НЕ ВЛЕЗАЮТ ЦЕЛИКОМ: цена записи больше всего предела ('
        + predel + ') — порядок и пороги тут ни при чём');
    }
    if (neVMestilos) {
      prichiny.push(neVMestilos + ' не поместились в остаток предела по порядку «' + poryadok + '»');
    }
    // RU: ── СВОЙСТВА отброшенных. НЕ причины: они ничего не отвергали. ──
    // EN: ── PROPERTIES of the dropped. NOT reasons: they rejected nothing. ──
    const niz = otbrosheno.filter((z) => z.vera !== null && z.vera !== undefined && Number(z.vera) < porogVery).length;
    const neizmereno = otbrosheno.filter((z) => z.vera === null || z.vera === undefined).length;
    if (niz) svoystva.push('с верой ниже ' + porogVery + ': ' + niz);
    if (neizmereno) svoystva.push('с НЕИЗМЕРЕННОЙ верой (это не ноль): ' + neizmereno);
    const holodnyh = otbrosheno.filter((z) => { const t = teplo(z); return t !== null && t < POROG_HOLODNOJ; }).length;
    const bezTepla = otbrosheno.filter((z) => teplo(z) === null).length;
    // RU: ТРИ состояния, а не два: «холодная», «тепло не измерялось» и всё остальное. Приравняв отсутствие
    //     тепла к холоду, мы утопили бы все записи, сделанные до появления поля, — тот же довод, что для веры.
    //     Пустота не ноль.
    //     Порог холода — POROG_HOLODNOJ из teplo.js, одно число на пакет: прежде здесь стояло 0.25 литералом, и
    //     смена одного из двух разошлась бы с другим молча.
    // EN: THREE states, not two: "cold", "warmth never measured" and everything else. Treating missing warmth
    //     as cold would sink all records made before the field existed — the same argument as for confidence.
    //     Emptiness is not zero.
    //     The cold threshold is POROG_HOLODNOJ from teplo.js, one number per package: previously 0.25 stood here
    //     as a literal, and changing one of the two would have silently diverged from the other.
    if (holodnyh) svoystva.push('холодных (тепло ниже ' + POROG_HOLODNOJ + '): ' + holodnyh);
    if (bezTepla) svoystva.push('с НЕИЗМЕРЕННЫМ теплом (это не холод): ' + bezTepla);
  }
  return {
    prosili: zapisi.length,
    podnyato: podnyato.length,
    otbrosheno: otbrosheno.length,
    cena,
    predel,
    poryadok,
    edinicy: 'оценка наша',      // RU: не «токены»: см. src/mera.js · EN: not "tokens": see src/mera.js
    prichiny,
    svoystva,
    // RU: Прибор ставится раньше порога: тепло печатается при КАЖДОМ отборе, чтобы наклон распределения со
    //     временем появился из настоящих чисел, а не из выдумки. На отбор не влияет.
    // EN: The instrument comes before the threshold: warmth is printed on EVERY selection so that the slope of
    //     the distribution emerges over time from real numbers, not invention. It does not affect selection.
    teplo: raspredelenie(zapisi),
  };
}

