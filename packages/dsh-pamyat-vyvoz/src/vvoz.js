/**
 * ВВОЗ ПАМЯТИ.
 *
 * 🔴 ВВОЗ ТОЖЕ ФИЛЬТРУЕТ, И ЭТО НЕ ДУБЛИРОВАНИЕ ВЫВОЗА. Файл мог прийти с машины, где
 * фильтра не было вовсе, либо где он был другой редакции. Проверять надо на той стороне,
 * которая отвечает за свою базу, — то есть здесь.
 *
 * 🔴 СВОИ НОМЕРА, ЧУЖИЕ НЕ ПЕРЕНОСЯТСЯ. У ядра статус записи определяется рубежом по id.
 * Чужая запись с малым номером легла бы ниже нашего рубежа и получила бы привилегию нашей
 * старой памяти — отмывание доверия через ввоз. Здесь это ОТКАЗ, а не предупреждение.
 *
 * 🔴 АТОМАРНОСТЬ (условие приёмки В6). Битая пятидесятая строка обязана дать НОЛЬ новых
 * записей, а не сорок девять. Половина ввоза хуже отказа: она выглядит как успех, и никто
 * не идёт доввозить остаток.
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: ввоз не сливает знания и не разрешает противоречий. Две записи об
 * одном предмете с разных машин останутся двумя записями — разбор смысла не его работа.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { vzyat_filtr, reshenie } from './yadro.js';
import { POLYA, proverit_zagolovok, OtkazShemy, summa_soderzhimogo } from './shema.js';
import { zapisat_v_zhurnal } from './zhurnal.js';
import { VERSIYA_PAKETA } from './vyvoz.js';

/** Класс, чьи записи с чужой машины ВСЕГДА ложатся неподтверждёнными (условие В5). */
const TREBUET_PODTVERZHDENIYA = 'ogranichenie';

/**
 * @param {object} o
 * @param {string} o.baza    путь к базе-получателю (открывается на запись)
 * @param {string} o.fajl    файл вывоза
 * @param {string} [o.yadro] путь к модулю фильтра (для стендов)
 */
export async function vvezti({ baza, fajl, yadro, krik = console.error }) {
  const filtr = await vzyat_filtr(yadro);

  const stroki = readFileSync(fajl, 'utf8').split('\n').filter((s) => s.trim() !== '');
  if (!stroki.length) throw new OtkazShemy('файл пуст — ввозить нечего', 'VYVOZ_PUSTOJ_FAJL');

  let shapka;
  try {
    shapka = proverit_zagolovok(JSON.parse(stroki[0]));
  } catch (e) {
    if (e instanceof OtkazShemy) throw e;
    throw new OtkazShemy(`первая строка не разбирается как JSON: ${e.message}`, 'VYVOZ_NET_ZAGOLOVKA');
  }

  // 🔴 ВЕСЬ ФАЙЛ РАЗБИРАЕТСЯ ДО ПЕРВОЙ ЗАПИСИ В БАЗУ. Разбор в одном проходе со вставкой
  // означал бы, что битая строка застаёт нас с половиной уже вставленного.
  const kandidaty = [];
  for (let i = 1; i < stroki.length; i++) {
    let z;
    try {
      z = JSON.parse(stroki[i]);
    } catch (e) {
      throw new OtkazShemy(`строка ${i + 1} не разбирается как JSON: ${e.message}. База НЕ тронута`, 'VYVOZ_BITAYA_STROKA');
    }
    if ('id' in z) {
      throw new OtkazShemy(
        `строка ${i + 1} несёт чужой id=${z.id}. Ввоз С СОХРАНЕНИЕМ чужих номеров ЗАПРЕЩЁН: `
        + 'чужая запись с малым номером легла бы ниже нашего рубежа происхождения и получила бы '
        + 'привилегию нашей старой памяти. База НЕ тронута',
        'VYVOZ_CHUZHIE_ID',
      );
    }
    kandidaty.push(z);
  }

  // 🔴 СУММА СОДЕРЖИМОГО СВЕРЯЕТСЯ ДО ПЕРВОЙ ЗАПИСИ В БАЗУ (ворота В1).
  // Разбор всех строк говорит «файл читается», но не говорит «файл дошёл ЦЕЛИКОМ»:
  // обрыв на границе строки даёт файл, который разбирается молча и не полностью.
  // Суммы нет — это НЕ «сошлось»: файл старого вывоза, и сказать об этом надо вслух,
  // иначе отсутствие проверки неотличимо от пройденной проверки.
  const stroki_zapisej = stroki.slice(1);
  if (shapka.summa) {
    const nasha = summa_soderzhimogo(stroki_zapisej);
    if (nasha !== shapka.summa) {
      throw new OtkazShemy(
        `сумма содержимого не сошлась: в заголовке ${shapka.summa}, посчитано ${nasha}. `
        + `Записей в файле ${stroki_zapisej.length}, заголовок обещает ${shapka.zapisej}. `
        + 'Файл дошёл не целиком либо правлен после вывоза. База НЕ тронута',
        'VYVOZ_SUMMA_NE_SOSHLAS',
      );
    }
  }

  const otkloneno = [];
  const k_vstavke = [];
  for (const [i, z] of kandidaty.entries()) {
    const r = reshenie(filtr, String(z.soderzhim ?? ''));
    if (!r.vyvozit) {
      otkloneno.push({ stroka: i + 2, klass: r.klass, rezhim: r.rezhim });
      continue;
    }
    k_vstavke.push(z);
  }

  const db = new DatabaseSync(baza);
  let vstavleno = 0;
  let uzhe_bylo = 0;
  let tozhdestvo_bylo = 'agent+istochnik+sozdano';
  try {
    const est = db.prepare('PRAGMA table_info(zapisi)').all().map((rr) => rr.name);
    const polya = POLYA.filter((p) => est.includes(p));
    const est_bp = est.includes('bez_podtverzhdeniya');
    // 🔴 ТОЖДЕСТВО ЗАПИСИ — ТРОЙКА «агент + источник + время создания», а не номер:
    // номер у нас свой, и двойной ввоз без такой тройки удвоил бы память молча.
    // Агент добавлен по воротам В2: без него две записи РАЗНЫХ агентов с одним источником
    // и одним временем схлопнулись бы в дубликат — редко, но это тождество памяти, и
    // ошибка здесь необратима (вторая запись просто не ввозится и об этом молчат).
    // Поля agent в принимающей базе может не быть — тогда тождество остаётся парой,
    // и это ГОВОРИТСЯ ВСЛУХ ниже, а не подразумевается.
    const est_agent = est.includes('agent');
    if (!est_agent) tozhdestvo_bylo = 'istochnik+sozdano (поля agent в базе нет)';
    const najti = est_agent
      ? db.prepare('SELECT COUNT(*) c FROM zapisi WHERE agent IS ? AND istochnik IS ? AND sozdano IS ?')
      : db.prepare('SELECT COUNT(*) c FROM zapisi WHERE istochnik IS ? AND sozdano IS ?');
    const est_li = (z) => (est_agent
      ? najti.get(z.agent ?? null, z.istochnik ?? null, z.sozdano ?? null)
      : najti.get(z.istochnik ?? null, z.sozdano ?? null)).c > 0;
    // 🔴 ВСТАВЛЯЮТСЯ ТОЛЬКО ТЕ ПОЛЯ, КОТОРЫЕ В ЗАПИСИ ЕСТЬ. Первая редакция подставляла
    // NULL за отсутствующее — и ввоз падал на «NOT NULL constraint failed» ровно там, где
    // он и нужен: файл с ЧУЖОЙ машины, где поле не заполнялось. Отсутствующее поле — это
    // «значения не было», а не «значение равно ничему»; за первое отвечает умолчание схемы
    // принимающей базы, и подменять его нашей догадкой нельзя.
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const z of k_vstavke) {
        if (est_li(z)) { uzhe_bylo++; continue; }
        const berem = polya.filter((p) => z[p] !== undefined || (p === 'bez_podtverzhdeniya' && z.klass === TREBUET_PODTVERZHDENIYA));
        const zn = berem.map((p) => {
          // Условие В5: чужое ограничение НЕ начинает действовать молча.
          if (p === 'bez_podtverzhdeniya' && z.klass === TREBUET_PODTVERZHDENIYA) return 1;
          const v = z[p];
          return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
        });
        db.prepare(`INSERT INTO zapisi (${berem.join(', ')}) VALUES (${berem.map(() => '?').join(', ')})`).run(...zn);
        vstavleno++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (!est_bp && k_vstavke.some((z) => z.klass === TREBUET_PODTVERZHDENIYA)) {
      // Поля нет — значит требование В5 исполнить нечем. Молчать об этом нельзя.
      otkloneno.push({ stroka: 0, klass: TREBUET_PODTVERZHDENIYA, rezhim: 'поля bez_podtverzhdeniya нет в базе — ограничения ввезены БЕЗ пометки' });
    }
  } finally {
    db.close();
  }

  // 🔴 СЛЕД В ЖУРНАЛЕ (В8). Ввоз меняет базу — без строки в журнале через неделю нечем
  // будет ответить, пришла запись извне или родилась здесь.
  const sled = zapisat_v_zhurnal({
    baza, agent: 'dsh-pamyat-vyvoz', klass: 'vvoz-pamyati', ishod: 'vypolneno',
    priroda: 'priyom-izvne',
    pochemu: `из «${shapka.otkuda}»${shapka.uzel ? ` (узел ${shapka.uzel})` : ''}: `
      + `вставлено ${vstavleno}, уже было ${uzhe_bylo}, отклонено фильтром ${otkloneno.length} `
      + `из ${kandidaty.length}; тождество ${tozhdestvo_bylo}; `
      + (shapka.summa ? 'сумма содержимого сверена' : 'суммы в заголовке НЕТ — целостность не проверена'),
    istochnik: fajl,
    krik,
  });

  return {
    sled_v_zhurnale: sled,
    iz: shapka.otkuda,
    uzel_istochnika: shapka.uzel ?? null,
    summa_sverena: Boolean(shapka.summa),
    tozhdestvo: tozhdestvo_bylo,
    vsego: kandidaty.length, vstavleno, uzhe_bylo,
    otkloneno_filtrom: otkloneno.length, otkloneno,
  };
}

/** Отчёт словами; числа абсолютные (условие В13). */
export function otchyot_vvoza(it) {
  const s = [];
  s.push(`[dsh-pamyat-vyvoz ${VERSIYA_PAKETA}] ввоз из «${it.iz}»${it.uzel_istochnika ? ` (узел ${it.uzel_istochnika})` : ''}: в файле ${it.vsego}, вставлено ${it.vstavleno}, уже было ${it.uzhe_bylo}, отклонено фильтром ${it.otkloneno_filtrom}`);
  // 🔴 НЕПРОВЕРЕННОЕ НАЗЫВАЕТСЯ ВСЛУХ. Молчание о том, что суммы не было, читается как
  // «сумма сошлась» — а это разные вещи: первое про наш инструмент, второе про предмет.
  s.push(it.summa_sverena
    ? '  сумма содержимого СВЕРЕНА — файл дошёл целиком'
    : '  ⚠️ суммы в заголовке НЕТ (файл старого вывоза): целостность НЕ проверена, а не «сошлась»');
  s.push(`  тождество записи: ${it.tozhdestvo}`);
  for (const o of it.otkloneno) {
    s.push(`  отклонена: строка ${o.stroka} — ${o.klass} (${o.rezhim}), содержимое НЕ показано`);
  }
  return s.join('\n');
}
