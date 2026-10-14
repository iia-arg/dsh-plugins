// RU: Сверяем русскую и английскую половины двуязычного README.md, чтобы правка не оставляла одну из них с устаревшим
//     перечнем или описанием. Прежде сверялись README.md и README.en.md, но второй был побайтной копией первого — проба
//     проходила тривиально (аудит A-N-1948 №9). Теперь README.md делится на абзацы: доля кириллицы среди букв > 0,2 —
//     русский, иначе английский; заголовки, таблицы и блоки кода — общие для обеих половин. README.en.md — английская
//     страница-указатель на README.md.
// EN: Compare the Russian and English halves of the bilingual README.md so an edit does not leave one of them with an
//     outdated list or description. Previously README.md and README.en.md were compared, but the second was a byte copy
//     of the first — the probe passed trivially (audit A-N-1948 #9). Now README.md is split into paragraphs: a Cyrillic
//     share among letters > 0.2 is Russian, otherwise English; headings, tables and code blocks belong to both halves.
//     README.en.md is an English pointer page to README.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
// RU: Отсутствующий README означает слепоту с кодом 2 и объяснением вместо необработанного ENOENT.
// EN: A missing README means an unobservable check with code 2 and an explanation rather than an unhandled ENOENT.
let ru, en, ukazatel;
try {
  const bloki = readFileSync(join(koren, 'README.md'), 'utf8').split(/\n\s*\n/);
  ukazatel = readFileSync(join(koren, 'README.en.md'), 'utf8');
  const dolya = (t) => { const c = (t.match(/[А-Яа-яЁё]/g) ?? []).length, l = (t.match(/[A-Za-z]/g) ?? []).length; return c + l ? c / (c + l) : 0; };
  const obshchij = (t) => /^\s*(#|\||```)/.test(t);
  ru = bloki.filter((t) => obshchij(t) || dolya(t) > 0.2).join('\n\n');
  en = bloki.filter((t) => obshchij(t) || dolya(t) <= 0.2).join('\n\n');
} catch (e) {
  console.log('СЛЕПОТА: README не прочитан (' + (e?.code ?? e?.message) + '). ' +
              'Проверять нечем — это не отказ пакета. Ждём README.md и README.en.md в ' + koren);
  process.exit(2);
}
let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы (правка 06.09.2026)'); };
const proba = (i, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + i); } catch (e) { console.log('  ❌ ' + i + ' — ' + e.message.slice(0,120)); } };

proba('стенд годен: обе половины README.md непусты и различны', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error('слишком короткие');
  if (ru === en) throw new Error('половины совпали — разделение по языку не сработало');
});
proba('README.en.md — английская страница-указатель на двуязычный README.md, а не копия', () => {
  if (!ukazatel.includes('](README.md)')) throw new Error('нет ссылки на README.md');
  if (ukazatel.length > 2000) throw new Error('страница длиннее указателя (' + ukazatel.length + ' зн.) — похоже на копию README');
});
proba('ключи настройки описаны в обоих', () => {
  for (const k of ['klass', 'vklyuchen']) {
    if (!ru.includes(k) || !en.includes(k)) throw new Error('нет ключа ' + k);
  }
});
proba('оба говорят, что пакет НЕ пишет в сессию', () => {
  if (!/не пишет в сессию/i.test(ru)) throw new Error('русский не говорит');
  if (!/does not write into the session/i.test(en)) throw new Error('английский не говорит');
});
proba('оба разделяют «доказан механизм» и «содержание не доказано»', () => {
  if (!/МЕХАНИЗМ/.test(ru) || !/СОДЕРЖАНИЕ не доказано/.test(ru)) throw new Error('русский неполон');
  if (!/MECHANISM proven/.test(en) || !/CONTENT is not proven/.test(en)) throw new Error('английский неполон');
});
proba('оба называют обязательность inject', () => {
  if (!/inject/.test(ru) || !/inject/.test(en)) throw new Error('inject не назван');
});
proba('оба объясняют, почему вывод идёт не через службу логгера', () => {
  if (!/свой транспорт/.test(ru)) throw new Error('русский не объясняет');
  if (!/own transport/.test(en)) throw new Error('английский не объясняет');
});

// RU: Состав публикации проверяем ответом npm, а не ручным files: ссылка README не гарантирует включение нового стенда в пакет.
// EN: Verify publication contents using npm output rather than a manual files list: a README link does not guarantee inclusion of a new suite.
function sostavPublikacii() {
  const vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(vyvod)[0].files.map((f) => f.path);
}

proba('🔴 ВСЁ, НА ЧТО ССЫЛАЕТСЯ README, ЛЕЖИТ В СОСТАВЕ ПУБЛИКАЦИИ', () => {
  const sostav = sostavPublikacii();
  const ssylki = new Set();
  for (const t of [ru, en]) {
    for (const m of t.matchAll(/(?:src|test)\/[\w.-]+\.m?js/g)) ssylki.add(m[0]);
    for (const m of t.matchAll(/\bstend-[\w-]+/g)) ssylki.add('test/' + m[0] + '.mjs');
  }
  const poteryany = [...ssylki].filter((f) => !sostav.includes(f));
  if (poteryany.length) {
    throw new Error('README обещает, а в публикации НЕТ: ' + poteryany.join(', ') +
                    ' | состав: ' + sostav.length + ' файлов');
  }
});

proba('🔴 ОБА README НАЗЫВАЮТ ОДИН И ТОТ ЖЕ СПОСОБ ПЕРЕПРОВЕРКИ', () => {
  // RU: Сверяем описание стенда звука между README; проверка ссылок не заметит отсутствующий английский абзац.
  // EN: Compare output-suite descriptions across READMEs; link checks miss an absent English paragraph.
  const stendy = (t) => new Set([...t.matchAll(/\bstend-[\w-]+/g)].map((m) => m[0]));
  const a = stendy(ru), b = stendy(en);
  const tolkoRu = [...a].filter((x) => !b.has(x));
  const tolkoEn = [...b].filter((x) => !a.has(x));
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error('README разошлись: только в русском [' + tolkoRu.join(', ') +
                    '], только в английском [' + tolkoEn.join(', ') + ']');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
