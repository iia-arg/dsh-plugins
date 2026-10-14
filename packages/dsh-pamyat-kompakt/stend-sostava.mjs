#!/usr/bin/env node
// RU: Стенд состава пакета: БЕЛЫЙ список files против ЧЁРНОГО .npmignore.
//     Зачем: однажды лишний файл, положенный в рабочую копию пакета, за минуту попал в состав выпуска (10
//     файлов вместо 9). Под чёрным списком в выпуск уезжает всё, что не подпало под маску; под белым — только
//     названное. Чёрный список надо пополнять на каждый новый вид мусора, белый — никогда.
//     Проверяется устройство, а не написание: стенд не ищет слово "files" в package.json, а собирает настоящий
//     архив (npm pack) и смотрит tar tzf. Признак по написанию соврал бы при любой опечатке в списке.
//     Где не применяется: работает на КОПИИ пакета во временном каталоге. Про установленный каталог не говорит
//     ничего — состав публикации и состав установки это разные предметы.
// EN: Package contents stand: a WHITE list (files) versus a BLACK list (.npmignore).
//     Why: once an extra file dropped into a working copy of the package got into the release contents within a
//     minute (10 files instead of 9). With a black list everything not matched by a mask ships; with a white
//     list only what is named. A black list must grow with every new kind of junk, a white list never.
//     The mechanism is checked, not the wording: the stand does not look for the word "files" in package.json,
//     it builds a real tarball (npm pack) and inspects tar tzf. A wording-based check would lie on any typo
//     inside the list.
//     Where it does not apply: it runs on a COPY of the package in a temporary directory. It says nothing about
//     an installed directory — publication contents and installation contents are different subjects.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT (стенды
//     обычно гоняют через timeout 120). Каждый mkdtemp стенда — через vremennyj(). От SIGKILL не спасает ничто;
//     временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temporary files are removed on ANY exit — normal, failed probe, process.exit, SIGTERM/SIGINT
//     (stands are usually run under timeout 120). Every mkdtemp of the stand goes through vremennyj(). Nothing
//     protects against SIGKILL; temporary files created by a CHILD process are that process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const PAKET = process.argv[2] ?? fileURLToPath(new URL('.', import.meta.url));
console.log('проверяемый пакет: ' + PAKET);
let vsego = 0, krasnyh = 0;
const proba = (imya, uslovie, pochemu) => {
  vsego++;
  if (uslovie) { console.log(`  ✅ ${imya}`); }
  else { krasnyh++; console.log(`  ❌ ${imya}\n     ${pochemu}`); }
};

/** RU: Собрать настоящий тарбол из каталога и вернуть состав именами без префикса package/.
 *  EN: Build a real tarball from the directory and return its contents as names without the package/ prefix. */
function sostav(katalog) {
  const gde = vremennyj(join(tmpdir(), 'sostav-'));
  execFileSync('npm', ['pack', katalog], { cwd: gde, stdio: 'pipe' });
  const tgz = readdirSync(gde).find(f => f.endsWith('.tgz'));
  const spisok = execFileSync('tar', ['tzf', join(gde, tgz)], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map(s => s.replace(/^package\//, '')).sort();
  rmSync(gde, { recursive: true, force: true });
  return spisok;
}

// RU: ── Подставная область: копия пакета + заведомый мусор ──
// EN: ── Fake area: package copy + known junk ──
const kopiya = vremennyj(join(tmpdir(), 'paket-'));
cpSync(PAKET, kopiya, { recursive: true });
const MUSOR = ['postoronnij-DOLZHEN-NE-POPAST.txt', 'zametka.md', 'package.json.bak-podstavnaya'];
for (const m of MUSOR) writeFileSync(join(kopiya, m), 'подставной файл стенда состава\n');
// RU: Новый стенд — проверяем, что образец stend-*.mjs подбирает его САМ, без правки списка.
// EN: A new stand — check that the stend-*.mjs pattern picks it up BY ITSELF, without editing the list.
writeFileSync(join(kopiya, 'stend-podstavnoj-novyj.mjs'), '// подставной новый стенд\n');
// RU: Страховочная копия ВНУТРИ включённого каталога. Обычный порядок — снять страховку перед правкой; когда
//     files включал каталог настроек целиком, такая страховка уезжала в выпуск. Чёрный список её не отсекал:
//     при заданном files .npmignore не применяется вовсе (замер).
// EN: A backup copy INSIDE an included directory. The usual practice is to take a backup before an edit; when
//     files included the settings directory wholesale, such a backup shipped with the release. The black list
//     did not exclude it: with files set, .npmignore is not applied at all (measured).
mkdirSync(join(kopiya, 'nastrojki'), { recursive: true });
writeFileSync(join(kopiya, 'nastrojki/sample-agent.json'), '{"podstavnaya": true}\n');
writeFileSync(join(kopiya, 'nastrojki/sample-agent.json.bak-podstavnaya'), '{"podstavnaya": true}\n');

const s_belym = sostav(kopiya);

// RU: Контроль зрячести внутри стенда: тот же каталог БЕЗ files. Если и там мусора нет — слеп прибор, а не чист
//     предмет: мусор не доехал до копии вовсе.
// EN: Sight check inside the stand: the same directory WITHOUT files. If there is no junk there either, the
//     instrument is blind, not the subject clean: the junk never reached the copy.
const bez = JSON.parse(readFileSync(join(kopiya, 'package.json'), 'utf8'));
delete bez.files;
writeFileSync(join(kopiya, 'package.json'), JSON.stringify(bez, null, 2) + '\n');
const s_chernym = sostav(kopiya);
rmSync(kopiya, { recursive: true, force: true });

console.log('СТЕНД СОСТАВА ПАКЕТА');
console.log(`  под белым списком: ${s_belym.length} файлов · без него: ${s_chernym.length}`);

// RU: ── П1–П3: мусор не попадает под белым списком ──
// EN: ── P1–P3: junk does not get in under the white list ──
for (const m of MUSOR) {
  proba(`«${m}» НЕ в составе под белым списком`,
    !s_belym.includes(m),
    `файл попал в состав: белый список его не удержал`);
}

// RU: ── П4: контроль зрячести. Без files мусор обязан попасть — иначе проба слепа ──
//     Без этой пробы «мусора нет» означало бы и «белый список работает», и «мусор не доехал до копии» — два
//     состояния с одинаковым видом.
// EN: ── P4: sight check. Without files the junk must get in — otherwise the probe is blind ──
//     Without this probe "no junk" would mean both "the white list works" and "the junk never reached the copy"
//     — two states that look the same.
proba('контроль зрячести: БЕЗ `files` мусор В составе (проба различает)',
  MUSOR.some(m => s_chernym.includes(m)),
  `и без белого списка мусора нет ⇒ он не доехал до подставной копии, проба меряет не то`);

// RU: ── П5: белый список ничего не потерял ──
//     Опаснее мусора: белый список выкидывает молча. Пропавший файл не даёт ошибки сборки — он просто не
//     уезжает, и находится это уже после установки.
// EN: ── P5: the white list lost nothing ──
//     More dangerous than junk: a white list drops silently. A missing file causes no build error — it just
//     does not ship, and that is discovered only after installation.
const OBYAZANY = ['index.mjs', 'porogi.mjs', 'tekstovye-nastrojki.mjs', 'promt-svodki.txt', 'package.json', 'CHANGELOG.md'];
const poteryano = OBYAZANY.filter(f => !s_belym.includes(f));
proba('объявленное на месте: белый список ничего не потерял',
  poteryano.length === 0,
  `из состава пропали: ${poteryano.join(', ')}`);

// RU: ── П6: образец подбирает НОВЫЙ стенд сам ──
//     Явное перечисление стоило бы того, что новый стенд выпадает молча, пока о нём не вспомнят. Образец
//     stend-*.mjs снимает эту цену — и это свойство надо стеречь.
// EN: ── P6: the pattern picks up a NEW stand by itself ──
//     An explicit list would cost a new stand being silently left out until someone remembers it. The
//     stend-*.mjs pattern removes that cost — and the property must be guarded.
proba('новый стенд попадает в состав САМ (образец stend-*.mjs)',
  s_belym.includes('stend-podstavnoj-novyj.mjs'),
  `подставной новый стенд не попал: образец не работает, каждый новый придётся вписывать руками`);

// RU: ── П7: под белым списком состав не шире, чем без него ──
// EN: ── P7: with the white list the contents are not wider than without it ──
proba('под белым списком состав НЕ шире, чем без него',
  s_belym.length <= s_chernym.length,
  `белый список дал БОЛЬШЕ файлов, чем чёрный — так быть не может, проверь образцы`);


// RU: ── Подставная копия пакета: мусор, новый стенд и страховка внутри включённого каталога ──
// EN: ── Fake package copy: junk, a new stand and a backup inside an included directory ──
proba('страховка прежнего E НЕ в составе',
  !s_belym.some(f => f.startsWith('nastrojki/') && f.includes('.bak')),
  `в составе: ${s_belym.filter(f => f.startsWith('nastrojki/')).join(', ')}`);

proba('контроль зрячести П6: подставная страховка ДОЕХАЛА до копии',
  s_chernym.some(f => f.startsWith('nastrojki/') && f.includes('.bak')),
  'её нет и без белого списка ⇒ П6 слепа: мерить было нечего');

proba('пакетный E НЕ входит в выпуск, даже если остался в рабочем каталоге',
  !s_belym.some(f => f.startsWith('nastrojki/')),
  `в составе: ${s_belym.filter(f => f.startsWith('nastrojki/')).join(', ')}`);

console.log(`ИТОГ: ${vsego - krasnyh} из ${vsego}`);
process.exit(krasnyh > 0 ? 1 : 0);
