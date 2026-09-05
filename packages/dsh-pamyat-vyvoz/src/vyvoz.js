/**
 * ВЫВОЗ ПАМЯТИ — ПЕРЕНОС СМЫСЛА, А НЕ КОПИЯ ФАЙЛА.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ КОПИЙ. Копия базы у нас уже есть — ночной архив. Она отвечает на
 * вопрос «вернуть эту машину в прежнее состояние». Вывоз отвечает на другой: «перенести
 * знание туда, где схема другая, номера свои и правил доверия нет». Копию нельзя влить
 * в живую базу, вывоз — можно.
 *
 * 🔴 ВЫВОЗ ФИЛЬТРУЕТ. Фильтр стоит на ВХОДЕ, значит всё, что легло в базу до его появления,
 * никем не проверено. Замер 04.09.2026: из 42 записей базы 31 легла ДО фильтра — вывоз без
 * проверки вынес бы их наружу целиком, обойдя защиту, которую строили. И доля здесь врёт:
 * число невыверенных не уменьшается со временем, его лишь разбавляют новые записи
 * (условие приёмки В13 — числа абсолютные, доля только рядом с числом).
 *
 * ГДЕ ЭТОТ МЕХАНИЗМ НЕ ПРИМЕНЯЕТСЯ И ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ:
 *   · он НЕ судит о правдивости записи — только о том, нет ли в ней секрета;
 *   · «задержано 0» значит «фильтр не нашёл ничего запирающего», а НЕ «секретов нет»:
 *     фильтр знает свой перечень форм и чужую форму пропустит;
 *   · он не вывозит журнал и очередь (см. NE_VYVOZITSYA в shema.js) — это решение, не забывчивость.
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vzyat_filtr, reshenie } from './yadro.js';
import { POLYA, zagolovok } from './shema.js';

// 🔴 ВЕРСИЯ ЧИТАЕТСЯ ИЗ СВОЕГО МАНИФЕСТА, А НЕ ПИШЕТСЯ КОНСТАНТОЙ. Отчёт о вывозе
// уезжает к тому, кто будет ввозить, и без редакции он не отвечает на вопрос «чем
// вывезли»: правила фильтра и состав полей у соседней редакции могут быть другими.
// Константа в коде разошлась бы с манифестом при первом же выпуске — молча.
export const VERSIYA_PAKETA = (() => {
  try {
    const put = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(readFileSync(put, 'utf8')).version;
  } catch { return 'неизвестна'; }
})();

/**
 * @param {object} o
 * @param {string} o.baza      путь к базе памяти (открывается ТОЛЬКО на чтение)
 * @param {string} [o.fajl]    куда писать; без него файл не создаётся — только отчёт
 * @param {string} [o.otkuda]  имя узла-источника, попадёт в заголовок
 * @param {string} [o.yadro]   путь к модулю фильтра (для стендов)
 */
export async function vyvezti({ baza, fajl, otkuda = 'неизвестно', yadro }) {
  // Договор проверяется ДО открытия базы: не смогли — файла не будет вовсе.
  const filtr = await vzyat_filtr(yadro);

  const db = new DatabaseSync(baza, { readOnly: true });
  let zapisi;
  try {
    const est = db.prepare("PRAGMA table_info(zapisi)").all().map((r) => r.name);
    const berem = POLYA.filter((p) => est.includes(p));
    // Поля, которых в этой базе нет, называются вслух: молчаливая потеря при переносе
    // неотличима от «этого поля и не было».
    const net = POLYA.filter((p) => !est.includes(p));
    zapisi = db.prepare(`SELECT id, ${berem.join(', ')} FROM zapisi ORDER BY id`).all();
    zapisi.nety_polya = net;
  } finally {
    db.close();
  }

  const vyvezennye = [];
  const zaderzhannye = [];
  for (const z of zapisi) {
    const tekst = String(z.soderzhim ?? '');
    const r = reshenie(filtr, tekst);
    if (!r.vyvozit) {
      // 🔴 БЕЗ СОДЕРЖИМОГО. Отчёт о задержке не должен выносить то, ради чего задержка.
      zaderzhannye.push({ id: z.id, klass: r.klass, rezhim: r.rezhim, znakov: tekst.length });
      continue;
    }
    const stroka = {};
    for (const p of POLYA) if (p in z) stroka[p] = z[p];
    if (r.pometka) stroka.pometka_filtra = r.pometka;
    vyvezennye.push(stroka);
  }

  const shapka = { ...zagolovok({ otkuda, zapisej: vyvezennye.length }), chem_vyvezeno: `dsh-pamyat-vyvoz ${VERSIYA_PAKETA}` };
  if (fajl) {
    const telo = [JSON.stringify(shapka), ...vyvezennye.map((s) => JSON.stringify(s))].join('\n') + '\n';
    writeFileSync(fajl, telo, { mode: 0o600 });
  }

  return {
    vsego: zapisi.length,
    vyvezeno: vyvezennye.length,
    zaderzhano: zaderzhannye.length,
    zaderzhannye,
    polya_kotoryh_net: zapisi.nety_polya ?? [],
    filtr_otkuda: filtr.otkuda,
    fajl: fajl ?? null,
  };
}

/**
 * Отчёт словами. Числа АБСОЛЮТНЫЕ (условие приёмки В13): доля описывала бы рост базы,
 * а не состояние опасности — те же тридцать невыверенных записей через месяц читались бы
 * как «почти всё чисто».
 */
export function otchyot(it) {
  const s = [];
  s.push(`[dsh-pamyat-vyvoz ${VERSIYA_PAKETA}] всего ${it.vsego}, вывезено ${it.vyvezeno}, задержано ${it.zaderzhano}`);
  s.push(`  фильтр взят из: ${it.filtr_otkuda}`);
  if (it.polya_kotoryh_net.length) {
    s.push(`  ⚠️ полей нет в этой базе: ${it.polya_kotoryh_net.join(', ')} — они не перенесены`);
  }
  for (const z of it.zaderzhannye) {
    s.push(`  пропущена: запись ${z.id} — ${z.klass} (${z.rezhim}), ${z.znakov} знаков, содержимое НЕ показано`);
  }
  if (!it.zaderzhano) {
    s.push('  задержано 0 — это «фильтр не нашёл запирающего», а НЕ «секретов нет»');
  }
  return s.join('\n');
}
