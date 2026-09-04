/**
 * Отбор записей под предел. Отвечает на вопрос «что поднять и чего лишились».
 *
 * 🔴 ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: отброшенное НАЗЫВАЕТСЯ, а не считается.
 * «Отброшено 12» — число, из него нельзя понять, чего лишился вызывающий.
 * «Отброшено 12: 9 самых старых, 3 с верой ниже 0.5» — знание. Молчаливое
 * «подняли не всё» ничем не отличается от «памяти нет».
 *
 * 🔴 И ВТОРОЕ, ИЗ СХЕМЫ ЯДРА: поле `vera` объявлено `REAL DEFAULT NULL`,
 * то есть NULL значит «НЕ ИЗМЕРЯЛАСЬ», а не «ноль». Отбор, считающий NULL
 * нулём, выбросил бы первыми все записи, сделанные до появления поля.
 * Поэтому «вера ниже порога» и «вера не измерялась» — РАЗНЫЕ причины отброса
 * и называются по отдельности. Пустота — не ноль.
 */
import { ocenit } from './mera.js';
import { raspredelenie, teplo } from './teplo.js';

/** Порядки важности, какие пакет умеет. Больше не выдумывать — их два. */
export const PORYADKI = ['svezhest', 'vera'];

function klyuchSvezhesti(z) { return -(Number(z.sozdano) || 0); }

function klyuchVery(z) {
  // Неизмеренная вера НЕ приравнивается к нулю: она идёт после измеренных
  // высоких, но впереди измеренных низких — то есть «неизвестно» не хуже
  // доказанно плохого.
  const v = z.vera;
  if (v === null || v === undefined) return -0.5;
  return -Number(v);
}

/**
 * Отобрать записи, укладывающиеся в предел.
 * Возвращает поднятое, отброшенное и сводку с ПРИЧИНАМИ, названными словами.
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
 * Сводка: числа И названные причины.
 *
 * 🔴 ПРИЧИНА И СВОЙСТВО — РАЗНЫЕ ВЕЩИ, И ДО 04.09.2026 ОНИ БЫЛИ СЛИТЫ.
 * Отбор отвергает по ОДНОМУ основанию: `cena + c > predel`. Вера на это не влияет
 * вовсе при порядке «svezhest», и всё же прежняя сводка перечисляла отброшенных
 * ПО ВЕРЕ так, будто вера их и отвергла. Свойство отброшенных выдавалось за причину
 * отброса — а разбирающий, прочтя «3 с верой ниже 0.5», пойдёт крутить порог веры,
 * который тут ни при чём.
 * Теперь причины — только про предел, свойства — отдельным полем, «из них:».
 *
 * 🔴 И ПРИЧИН ДВЕ, А НЕ ОДНА. Их нельзя сливать, потому что лечатся они разным:
 *   «не влезает целиком»  — цена ОДНОЙ записи больше ВСЕГО предела. Такая запись не
 *                           поднимется НИКОГДА и НИ ПРИ КАКОМ порядке. Лечение —
 *                           дробление или выжимка при записи, а не порядок и не порог.
 *                           Замер 04.09.2026: 7 из 23 отброшенных на живой базе — это
 *                           сводки компакции ценой 4008…4841 при пределе 2000, то есть
 *                           вдвое дороже всего бюджета.
 *   «не поместилась в остаток» — влезла бы, но бюджет уже занят. Вот ЭТО лечится
 *                           порядком и пределом.
 * Слив их в одну строку означал бы, что за чужой дефект («запись вдвое больше предела»)
 * будут винить порядок и без конца его перебирать.
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
    // ── СВОЙСТВА отброшенных. НЕ причины: они ничего не отвергали. ──
    const niz = otbrosheno.filter((z) => z.vera !== null && z.vera !== undefined && Number(z.vera) < porogVery).length;
    const neizmereno = otbrosheno.filter((z) => z.vera === null || z.vera === undefined).length;
    if (niz) svoystva.push('с верой ниже ' + porogVery + ': ' + niz);
    if (neizmereno) svoystva.push('с НЕИЗМЕРЕННОЙ верой (это не ноль): ' + neizmereno);
    const holodnyh = otbrosheno.filter((z) => { const t = teplo(z); return t !== null && t < 0.25; }).length;
    const bezTepla = otbrosheno.filter((z) => teplo(z) === null).length;
    // 🔴 ТРИ состояния, а не два: «холодная», «тепло не измерялось», и всё остальное.
    // Приравняв отсутствие тепла к холоду, мы утопили бы все записи, сделанные до
    // появления поля, — тот же довод, что для веры. Пустота не ноль.
    if (holodnyh) svoystva.push('холодных (тепло ниже 0.25): ' + holodnyh);
    if (bezTepla) svoystva.push('с НЕИЗМЕРЕННЫМ теплом (это не холод): ' + bezTepla);
  }
  return {
    prosili: zapisi.length,
    podnyato: podnyato.length,
    otbrosheno: otbrosheno.length,
    cena,
    predel,
    poryadok,
    edinicy: 'оценка наша',      // 🔴 не «токены»: см. src/mera.js
    prichiny,
    svoystva,
    // Прибор ставится раньше порога: тепло печатается при КАЖДОМ отборе, чтобы наклон
    // через месяц появился из боевых чисел, а не из выдумки. На отбор не влияет.
    teplo: raspredelenie(zapisi),
  };
}

