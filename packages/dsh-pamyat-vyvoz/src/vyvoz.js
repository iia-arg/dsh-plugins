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
import { writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vzyat_filtr, reshenie } from './yadro.js';
import { POLYA, zagolovok, neznakomye_polya, summa_soderzhimogo } from './shema.js';
import { zapisat_v_zhurnal } from './zhurnal.js';

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
export async function vyvezti({ baza, fajl, otkuda = 'неизвестно', yadro, krik = console.error }) {
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
    // Зеркальная проверка: поля, которые в базе ЕСТЬ, а вывоз о них не знает вовсе.
    zapisi.neznakomye_polya = neznakomye_polya(est);
  } finally {
    db.close();
  }

  const vyvezennye = [];
  const zaderzhannye = [];
  for (const z of zapisi) {
    const tekst = String(z.soderzhim ?? '');
    const r = reshenie(filtr, tekst);
    // 🔴 НЕЗНАКОМЫЙ КЛАСС ОСТАНАВЛИВАЕТ ВЕСЬ ВЫВОЗ, А НЕ ОДНУ ЗАПИСЬ (решение автора
    // предмета, 05.09.2026). Довод: незнакомый класс значит, что ядро ушло вперёд, а мы
    // о нём не знаем — под вопросом ВСЯ раскладка, а не одна строка. Пропустить остальное
    // значило бы выпустить наружу набор, про который уже известно, что наше представление
    // о нём неполно.
    // ⚠️ ЦЕНА НАЗВАНА: один новый класс в фильтре останавливает вывоз до правки вывоза.
    // Дороже, чем пропустить одну запись, и дешевле утечки. Обратимо: правится строкой.
    if (r.rezhim === 'neizvesten') {
      const e = new Error(
        `вывоз ОСТАНОВЛЕН: класс «${r.klass}» ядру известен, а нам нет — режим «neizvesten». ` +
        'Это не одна запись: раз ядро ушло вперёд, под вопросом вся раскладка. ' +
        'Файла вывоза нет. Обновите вывоз под новый класс и повторите.');
      e.code = 'VYVOZ_NEZNAKOMYJ_KLASS';
      e.klass = r.klass;
      throw e;
    }
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

  const neizvestnye = zapisi.neznakomye_polya ?? [];
  const stroki_zapisej = vyvezennye.map((s) => JSON.stringify(s));
  const shapka = {
    ...zagolovok({
      otkuda,
      uzel: hostname(),
      zapisej: vyvezennye.length,
      zaderzhano: zaderzhannye.length,
      summa: summa_soderzhimogo(stroki_zapisej),
      neizvestnye,
    }),
    chem_vyvezeno: `dsh-pamyat-vyvoz ${VERSIYA_PAKETA}`,
  };
  if (fajl) {
    const telo = [JSON.stringify(shapka), ...stroki_zapisej].join('\n') + '\n';
    // 🔴 ЗАПИСЬ АТОМАРНАЯ: ВРЕМЕННЫЙ ФАЙЛ РЯДОМ, ЗАТЕМ ПЕРЕИМЕНОВАНИЕ (ворота В6).
    // Прямая запись оставляла бы при обрыве ПОЛУФАЙЛ С ПРАВИЛЬНЫМ ЗАГОЛОВКОМ — то есть
    // предмет, который выглядит целым и читается как целый. Ввоз откажет по битой
    // строке, но это смягчение, а не защита: обрыв мог прийтись на границу строки,
    // и тогда файл разберётся молча и не полностью.
    // Временный файл — РЯДОМ, в том же каталоге: перенос через границу разделов
    // атомарным не является.
    const vrem = `${fajl}.chastichnyj-${process.pid}`;
    try {
      writeFileSync(vrem, telo, { mode: 0o600 });
      renameSync(vrem, fajl);
    } catch (e) {
      try { unlinkSync(vrem); } catch { /* нечего убирать */ }
      throw e;
    }
  }

  // 🔴 СЛЕД В ЖУРНАЛЕ — ПОСЛЕ ФАКТА, А НЕ ВМЕСТО НЕГО (В8). Пишем, когда файл уже лёг:
  // строка «вывезено» до записи означала бы «собирались вывезти».
  const sled = zapisat_v_zhurnal({
    baza, agent: 'dsh-pamyat-vyvoz', klass: 'vyvoz-pamyati',
    ishod: fajl ? 'vypolneno' : 'tolko-otchyot',
    priroda: 'vynos-naruzhu',
    pochemu: `вывезено ${vyvezennye.length}, задержано ${zaderzhannye.length} из ${zapisi.length}; `
      + `узел ${hostname()}; фильтр из «${filtr.otkuda}»; сумма ${shapka.summa}`
      + (fajl ? `; файл ${fajl}` : '; файла нет — только отчёт'),
    istochnik: fajl ?? null,
    krik,
  });

  return {
    sled_v_zhurnale: sled,
    vsego: zapisi.length,
    vyvezeno: vyvezennye.length,
    zaderzhano: zaderzhannye.length,
    zaderzhannye,
    polya_kotoryh_net: zapisi.nety_polya ?? [],
    polya_neizvestnye_vyvozu: neizvestnye,
    filtr_otkuda: filtr.otkuda,
    uzel: hostname(),
    summa: shapka.summa,
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
  if ((it.polya_neizvestnye_vyvozu ?? []).length) {
    // 🔴 ГРОМКО: это не «поля нет», это «поле ЕСТЬ, а мы о нём не знаем». Схема ушла
    // вперёд, и без этой строки знание уехало бы молча: на той стороне поля просто не
    // будет, и «не переносили» станет неотличимо от «не было».
    s.push(`  🔴 полей в базе, о которых вывоз НЕ ЗНАЕТ: ${it.polya_neizvestnye_vyvozu.join(', ')}`);
    s.push('     Они НЕ перенесены и не объявлены непереносимыми — схема базы ушла вперёд');
    s.push('     вывоза. Решите про каждое: вывозить (в POLYA) либо не вывозить с причиной');
    s.push('     (в NE_VYVOZITSYA). Список полей записан и в шапку файла вывоза.');
  }
  for (const z of it.zaderzhannye) {
    s.push(`  пропущена: запись ${z.id} — ${z.klass} (${z.rezhim}), ${z.znakov} знаков, содержимое НЕ показано`);
  }
  if (!it.zaderzhano) {
    s.push('  задержано 0 — это «фильтр не нашёл запирающего», а НЕ «секретов нет»');
  }
  return s.join('\n');
}
