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

/** Сводка: числа И названные причины. Одно без другого бесполезно. */
function svodkaOtbrosa({ zapisi, podnyato, otbrosheno, cena, predel, poryadok, porogVery }) {
  const prichiny = [];
  if (otbrosheno.length) {
    const niz = otbrosheno.filter((z) => z.vera !== null && z.vera !== undefined && Number(z.vera) < porogVery).length;
    const neizmereno = otbrosheno.filter((z) => z.vera === null || z.vera === undefined).length;
    const ostalnye = otbrosheno.length - niz - neizmereno;
    if (ostalnye) prichiny.push(ostalnye + ' не поместились по порядку «' + poryadok + '»');
    if (niz) prichiny.push(niz + ' с верой ниже ' + porogVery);
    if (neizmereno) prichiny.push(neizmereno + ' с НЕИЗМЕРЕННОЙ верой (это не ноль)');
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
  };
}
