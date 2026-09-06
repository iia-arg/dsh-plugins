// Прогон фильтра по живому корпусу: снятие ДВУХ долей для признака lowerCamelCase (Б4/п.66).
//
// 🔴 КОРПУС ПАМЯТИ ДЛЯ ЭТОГО ЗАМЕРА НЕГОДЕН — ПРОВЕРКА ВЫХОДИТ КРУГОВОЙ (06.09.2026).
// Прогон по базе памяти агента дал 0 из 116 записей, и это ответ не про правило,
// а про корпус: фильтр стоит НА ВХОДЕ, и всё, что он запирает, в память не попадает по
// построению. Мерить цену входного правила на том, что через него прошло, — то же самое,
// что судить о сите по тому, что просыпалось.
// Зрячесть прибора при этом проверена отдельно: подставные формы («password = …»,
// «key: lastTouchedAt», «token = …») фильтр опознаёт как obyavlennyj, «просто текст» — null.
//
// ✅ ГОДНЫЙ КОРПУС — ТО, ЧТО ПОПАДАЕТ НА ВХОД: каталог отклонённых текстов
// (ключ putOtklonennyh в настройках секретаря) — там лежит ровно то, что
// правило запирает. Ключ --otklonennye <каталог>.
// Замер 06.09.2026 на нём: строк 257, заперто правилом объявления 4, из них чистый
// lowerCamelCase 0. То есть предполагаемый ложный отказ на живом корпусе не встречается
// ни разу → сужение признака выгоды не даёт, а риск (пропустить секрет такой формы) несёт.
// ⚠️ ГРАНИЦА ЗАМЕРА: корпус мал — 3 файла, 257 строк, все за одни сутки. «Ноль» здесь
// значит «в этом корпусе не встретилось», а не «не бывает».
// Вход: --db <путь к pamyat.db>  (таблица zapisi, колонка soderzhim)
//       либо список текстов через stdin (по одному на строку).
// Выход: (1) сколько записей с предметом (окно объявления + значение ≥6 знаков);
//        (2) сколько из них запирается СЕЙЧАС правилом объявления (obyavlennyj);
//        (3) сколько из запертых — чистый lowerCamelCase (признак /^[a-z]+([A-Z][a-z]+)+$/
//            пропустил бы = ложный отказ) против настоящих секретов.
// Это и есть две цены: бездействия (ложные сейчас) и правки (сколько настоящих пропустит).

const CAMEL = /^[a-z]+([A-Z][a-z]+)+$/;

function znachenie_do_probela(tekst, poz) {
  // значение после разделителя (":" или "=") перед позицией кандидата
  const do_poz = tekst.slice(0, poz);
  const r = Math.max(do_poz.lastIndexOf(':'), do_poz.lastIndexOf('='));
  if (r < 0) return null;
  const m = do_poz.slice(r + 1).match(/^\s*["']?([^\s"']+)/);
  return m ? m[1] : null;
}

async function main() {
  const a = process.argv.slice(2);
  let teksty = [];
  if (a[0] === '--otklonennye' && a[1]) {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    let fajlov = 0;
    for (const f of readdirSync(a[1])) {
      if (!f.endsWith('.txt')) continue;
      fajlov++;
      for (const l of readFileSync(join(a[1], f), 'utf8').split('\n')) if (l.trim()) teksty.push(l);
    }
    console.log(`корпус: отклонённые тексты ${a[1]}, файлов ${fajlov}, строк ${teksty.length}`);
  } else if (a[0] === '--db' && a[1]) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(a[1], { readOnly: true });
    teksty = db.prepare("SELECT soderzhim AS s FROM zapisi").all().map(r => r.s ?? '');
    console.log(`корпус: ${a[1]}, записей: ${teksty.length}`);
    console.log('⚠️ КОРПУС ПАМЯТИ ДЛЯ ЭТОГО ВОПРОСА НЕГОДЕН: он уже отфильтрован тем самым');
    console.log('   правилом, цену которого мы меряем. Ноль здесь ожидаем и ничего не значит.');
    console.log('   Годный корпус: --otklonennye <каталог отклонённых текстов>.');
  } else {
    const buf = await (await import('node:fs/promises')).readFile(0, 'utf8');
    teksty = buf.split('\n').filter(s => s.length > 0);
    console.log(`корпус: stdin, записей: ${teksty.length}`);
  }
  const filtr = await import(new URL('../src/filtr-vhoda.js', import.meta.url));
  const pokazyvat = process.argv.includes('--znacheniya');
  let s_predmetom = 0, zapertyh = 0, camel = 0, nastoyashchih = 0;
  const dlina_camel = [], dlina_sekret = [];
  for (const t of teksty) {
    const res = filtr.najti_sekret(t);
    if (!res || res.klass !== 'obyavlennyj') continue;
    const z = znachenie_do_probela(t, res.pozicia);
    if (!z || z.length < 6) continue;
    s_predmetom++;
    zapertyh++;
    if (CAMEL.test(z)) {
      camel++;
      dlina_camel.push(z.length);
      if (pokazyvat) console.log(`  lowerCamelCase (ложный), длина ${z.length}: ${z}`);
    } else {
      nastoyashchih++;
      dlina_sekret.push(z.length);
      if (pokazyvat) console.log(`  секрет, длина ${z.length}: ${z}`);
    }
  }
  // Значения НЕ печатаются по умолчанию — среди запертых возможны настоящие секреты.
  // Для отладки — флаг --znacheniya. Здесь только классы и длины.
  console.log(`с предметом (объявление + значение ≥6): ${s_predmetom}`);
  console.log(`заперлось правилом объявления: ${zapertyh}`);
  console.log(`из них lowerCamelCase (признак пропустит = ложный): ${camel} (длины: ${dlina_camel.join(',') || '—'})`);
  console.log(`из них настоящие секреты (признак НЕ тронет): ${nastoyashchih} (длины: ${dlina_sekret.join(',') || '—'})`);
  console.log(`ИТОГ: цена бездействия = ${camel}/${zapertyh} ложных; цена правки = ${nastoyashchih} настоящих среди запертых`);
}
main();
