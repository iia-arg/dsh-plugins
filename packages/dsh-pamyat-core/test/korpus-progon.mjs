// RU: Корпусный прогон считает долю отказов и долю lowerCamelCase среди объявленных секретов. База памяти непригодна для оценки входного фильтра: отвергнутые записи в неё не попадают. В режиме --otklonennye читаются только svodka-*.txt и znanie-*.txt без служебной шапки; прочие файлы считаются отдельно. --db читает записи zapisi.soderzhim, stdin — отдельные строки. Отчёт называет классы, режимы rezhim(), позиции и форму значения a/A/9; неизвлечённые значения учитывает отдельно. lowerCamelCase определяется /^[a-z]+([A-Z][a-z]+)+$/. Извлечение учитывает позицию на слове или на значении; построчный разбор и отбрасывание значений короче 6 и иных классов давали ложный ноль. Учитывается только первое срабатывание в тексте. Для знаний и сводок срабатывание объявления означает маску значения, а не отказ записи; прогон измеряет правило, а не итог записи.
// EN: The corpus runner measures rejection share and lowerCamelCase share among declared secrets. A memory database cannot evaluate an ingress filter: rejected records never enter it. --otklonennye reads only svodka-*.txt and znanie-*.txt, strips metadata headers, and counts other files separately. --db reads zapisi.soderzhim records; stdin reads individual lines. Reports include classes, rezhim() modes, positions, and value shapes a/A/9, with a separate count for extraction failures. /^[a-z]+([A-Z][a-z]+)+$/ identifies lowerCamelCase. Extraction handles positions on either the declaration word or the value; line-based parsing and discarding values shorter than 6 or other classes produced false zeroes. Only the first match per text counts. For knowledge and summaries, a declaration match masks the value rather than rejecting the record; this runner measures the rule, not the write result.

const CAMEL = /^[a-z]+([A-Z][a-z]+)+$/;
const KONEC_SHAPKI = '# ── конец сведений, ниже исходный текст ──\n\n';

// RU: Извлекаем значение с теми же кавычками и алфавитом, что фильтр. Проход 2 указывает на значение, проход 1 — на слово: сначала ищем значение, покрывающее позицию, затем значение после слова.
// EN: Extract the value using the filter’s quotes and alphabet. Pass 2 points to the value and pass 1 to the declaration word: first find a value covering the position, then one following the word.
function znachenie(tekst, poz) {
  const ot = Math.max(0, poz - 40);
  const okno = tekst.slice(ot, poz);
  const r = Math.max(okno.lastIndexOf(':'), okno.lastIndexOf('='));
  if (r >= 0) {
    const m = tekst.slice(ot + r + 1).match(/^\s*["']?([^\s"']+)/);
    const nachalo = m ? ot + r + 1 + m[0].length - m[1].length : -1;
    if (m && poz >= nachalo && poz < nachalo + m[1].length) return m[1];
  }
  const m = tekst.slice(poz).match(/^[^\n:=]{0,40}?["']?\s*[:=]\s*["']?([^\s"']+)/);
  return m ? m[1] : null;
}

const forma = (s) => s.replace(/\p{Ll}/gu, 'a').replace(/\p{Lu}/gu, 'A').replace(/\p{N}/gu, '9');

async function main() {
  const a = process.argv.slice(2);
  let teksty = [];   /* RU: Элемент корпуса: { imya, tekst }.
 * EN: Corpus item: { imya, tekst }.
 */
  if (a[0] === '--otklonennye' && a[1]) {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const prochie = {};
    for (const f of readdirSync(a[1]).sort()) {
      if (!/^(svodka|znanie)-.*\.txt$/.test(f) || f.endsWith('.reshenie.txt')) {
        const vid = f.endsWith('.reshenie.txt') ? '*.reshenie.txt' : (f.match(/^[a-z]+(?:-[a-z]+)?(?=-\d)/)?.[0] ?? f);
        prochie[vid] = (prochie[vid] ?? 0) + 1;
        continue;
      }
      const t = readFileSync(join(a[1], f), 'utf8');
      const i = t.indexOf(KONEC_SHAPKI);
      teksty.push({ imya: f, tekst: i >= 0 ? t.slice(i + KONEC_SHAPKI.length) : t });
    }
    console.log(`корпус: отклонённые тексты ${a[1]}, входных текстов (файлов svodka/znanie) ${teksty.length}`);
    console.log(`  не входные, не считаются: ${Object.entries(prochie).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'}`);
  } else if (a[0] === '--db' && a[1]) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(a[1], { readOnly: true });
    teksty = db.prepare("SELECT id, soderzhim AS s FROM zapisi").all().map(r => ({ imya: `id ${r.id}`, tekst: r.s ?? '' }));
    console.log(`корпус: ${a[1]}, записей: ${teksty.length}`);
    console.log('⚠️ КОРПУС ПАМЯТИ ДЛЯ ЭТОГО ВОПРОСА НЕГОДЕН: он уже отфильтрован тем самым');
    console.log('   правилом, цену которого мы меряем. Ноль здесь ожидаем и ничего не значит.');
    console.log('   Годный корпус: --otklonennye <каталог отклонённых текстов>.');
  } else {
    const { readFileSync } = await import('node:fs');
    teksty = readFileSync(0, 'utf8').split('\n').filter(s => s.length > 0).map((t, i) => ({ imya: `строка ${i + 1}`, tekst: t }));
    console.log(`корпус: stdin, строк: ${teksty.length}`);
  }
  const filtr = await import(new URL('../src/filtr-vhoda.js', import.meta.url));
  const pokazyvat = process.argv.includes('--znacheniya');
  const po_klassam = {};
  let zapertyh = 0, obyavlennyh = 0, camel = 0, nastoyashchih = 0, ne_izvlecheno = 0;
  const dlina_camel = [], dlina_sekret = [];
  for (const { imya, tekst } of teksty) {
    const res = filtr.najti_sekret(tekst);
    if (!res) continue;
    const rezhim = filtr.rezhim(res.klass);
    po_klassam[`${res.klass} (${rezhim})`] = (po_klassam[`${res.klass} (${rezhim})`] ?? 0) + 1;
    if (rezhim !== 'zapiraet') continue;
    zapertyh++;
    if (res.klass !== 'obyavlennyj') { console.log(`  заперто: ${imya} · ${res.klass} @${res.pozicia}`); continue; }
    obyavlennyh++;
    const z = znachenie(tekst, res.pozicia);
    let vid;
    if (!z) { ne_izvlecheno++; vid = 'значение НЕ ИЗВЛЕЧЕНО'; }
    else if (CAMEL.test(z)) { camel++; dlina_camel.push(z.length); vid = 'lowerCamelCase (ложный)'; }
    else { nastoyashchih++; dlina_sekret.push(z.length); vid = 'прочее'; }
    // RU: Печатаем форму значения: отвергнутый текст может содержать настоящий секрет.
    // EN: Print the value shape: rejected text may contain an actual secret.
    console.log(`  заперто: ${imya} · obyavlennyj @${res.pozicia} · ${vid}` +
                (z ? ` · форма ${pokazyvat ? z : forma(z)}` : ''));
  }
  // RU: Значения скрыты по умолчанию; --znacheniya включает их для отладки. Обычный отчёт содержит классы, формы и длины.
  // EN: Values are hidden by default; --znacheniya enables them for debugging. The normal report contains classes, shapes, and lengths.
  console.log(`сработал фильтр (первое срабатывание на текст), по классам: ${Object.entries(po_klassam).map(([k, n]) => `${k} ${n}`).join(', ') || 'нет'}`);
  console.log(`заперто текстов: ${zapertyh} из ${teksty.length}; из них правилом объявления: ${obyavlennyh}`);
  console.log(`из них lowerCamelCase (признак пропустит = ложный): ${camel} (длины: ${dlina_camel.join(',') || '—'})`);
  console.log(`из них прочие (признак НЕ тронет): ${nastoyashchih} (длины: ${dlina_sekret.join(',') || '—'})`);
  console.log(`значение не извлечено: ${ne_izvlecheno}${ne_izvlecheno ? ' — прибор СЛЕП к этим текстам, итог ниже неполон' : ''}`);
  console.log(`ИТОГ: цена бездействия = ${camel}/${obyavlennyh} ложных; цена правки = ${nastoyashchih} прочих среди запертых`);
}
main();
