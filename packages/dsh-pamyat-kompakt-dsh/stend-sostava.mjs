#!/usr/bin/env node
// RU: СТЕНД СОСТАВА ПАКЕТА: белый список files в package.json против его отсутствия.
//     Зачем. Когда-то у пакета не было files вовсе. Без белого списка в состав уезжает всё, что лежит рядом:
//     подставной файл и тарбол прежней версии, положенные в копию, попали в состав оба — 6 файлов вместо 4.
//     Заряжено было давно (тарбол прежней версии лежал в рабочем каталоге); не стреляло лишь потому, что выпуск
//     собирают из метки, где его нет.
//     ⚠️ Проверяется устройство, а не написание: стенд не ищет слово files в манифесте — он СОБИРАЕТ настоящий
//     тарбол (npm pack) и читает tar tzf. Признак по написанию соврал бы зелёным при опечатке внутри списка.
//     ⚠️ Где не применяется: работает на КОПИИ пакета во временном каталоге. Про установленный каталог не
//     говорит ничего — состав публикации и содержимое установки это два разных предмета.
// EN: PACKAGE COMPOSITION STAND: the files whitelist in package.json versus its absence.
//     Why. Once the package had no files at all. Without a whitelist everything lying next to it ships: a fake
//     file and an old-version tarball placed into a copy both ended up in the package — 6 files instead of 4.
//     It had been loaded for a long time (an old tarball sat in the working directory); it did not fire only
//     because releases are built from a tag where it is absent.
//     ⚠️ Design is checked, not spelling: the stand does not look for the word files in the manifest — it
//     BUILDS a real tarball (npm pack) and reads tar tzf. A spelling-based sign would lie green with a typo
//     inside the list.
//     ⚠️ Where it does not apply: it works on a COPY of the package in a temporary directory. It says nothing
//     about the installed directory — the published composition and the installation contents are two different
//     subjects.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT (стенды
//     гоняют через timeout 120). Каждый mkdtemp стенда — через vremennyj(). От SIGKILL не спасает ничто;
//     временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temporary files are removed on ANY exit — normal, failed probe, process.exit, SIGTERM/SIGINT
//     (stands are run under timeout 120). Every mkdtemp of the stand goes through vremennyj(). Nothing protects
//     against SIGKILL; temporary files created by a CHILD process are that process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const PAKET = process.argv[2] ?? dirname(fileURLToPath(import.meta.url));
let vsego = 0, krasnyh = 0;
const proba = (imya, uslovie, pochemu) => {
  vsego++;
  if (uslovie) { console.log(`  ✅ ${imya}`); }
  else { krasnyh++; console.log(`  ❌ ${imya}\n     ${pochemu}`); }
};

/** Собрать настоящий тарбол из каталога и вернуть состав именами без префикса package/. · Build a real tarball from the directory and return its contents as names without the package/ prefix. */
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
// EN: ── Fake area: a copy of the package + known garbage ──
const kopiya = vremennyj(join(tmpdir(), 'paket-'));
cpSync(PAKET, kopiya, { recursive: true });
// RU: Тарбол прежней версии — не выдумка стенда: ровно такой однажды лежал в рабочем каталоге.
// EN: An old-version tarball is not invented by the stand: exactly such a file once lay in the working
//     directory.
const TARBOL = 'dsh-pamyat-kompakt-dsh-0.1.0-alpha.1.tgz';
// RU: Страховка рядом с предметом — штатный порядок перед всякой правкой.
// EN: A backup next to the subject — the standard step before any edit.
const STRAHOVKA = 'index.mjs.bak-pre-versiya-podstavnaya';
const MUSOR = [TARBOL, STRAHOVKA, 'postoronnij-DOLZHEN-NE-POPAST.txt'];
for (const m of MUSOR) writeFileSync(join(kopiya, m), 'подставной файл стенда состава\n');
// RU: Новый стенд: проверяем, что образец stend-*.mjs подбирает его САМ, без правки списка.
// EN: A new stand: check that the pattern stend-*.mjs picks it up BY ITSELF, without editing the list.
writeFileSync(join(kopiya, 'stend-podstavnoj-novyj.mjs'), '// подставной новый стенд\n');

const s_belym = sostav(kopiya);

// RU: Контроль зрячести ВНУТРИ стенда: тот же каталог БЕЗ files. Если и там мусора нет — слеп прибор, а не чист
//     предмет: мусор не доехал до копии.
// EN: Sightedness control INSIDE the stand: the same directory WITHOUT files. If there is no garbage there
//     either, the instrument is blind, not the subject clean: the garbage never reached the copy.
const bez = JSON.parse(readFileSync(join(kopiya, 'package.json'), 'utf8'));
delete bez.files;
writeFileSync(join(kopiya, 'package.json'), JSON.stringify(bez, null, 2) + '\n');
const s_bez = sostav(kopiya);
rmSync(kopiya, { recursive: true, force: true });

console.log('СТЕНД СОСТАВА ПАКЕТА');
console.log(`  под белым списком: ${s_belym.length} файлов · без него: ${s_bez.length}`);

// RU: ── П1–П3: мусор не попадает под белым списком ──
// EN: ── P1–P3: garbage stays out under the whitelist ──
for (const m of MUSOR) {
  proba(`«${m}» НЕ в составе`,
    !s_belym.includes(m),
    'файл попал в состав: белый список его не удержал');
}

// RU: ── П4: контроль зрячести. Без files мусор обязан попасть — иначе проба слепа. Без неё «мусора нет»
//     значило бы и «белый список работает», и «мусор не доехал до копии» — два разных состояния с одинаковым
//     видом. ──
// EN: ── P4: sightedness control. Without files the garbage must get in — otherwise the probe is blind. Without
//     it "no garbage" would mean both "the whitelist works" and "the garbage never reached the copy" — two
//     different states that look the same. ──
proba('контроль зрячести: БЕЗ `files` мусор В составе (проба различает)',
  MUSOR.some(m => s_bez.includes(m)),
  'и без белого списка мусора нет ⇒ он не доехал до подставной копии, проба меряет не то');

// RU: ── П5: белый список ничего не потерял. Опаснее мусора: белый список выкидывает МОЛЧА; пропавший файл не
//     даёт ошибки сборки, он просто не уезжает, и находится это уже при установке. Перечень обязательных —
//     весь рабочий код (index, marker-step, continuation-mode), README и четыре документа docs/. ──
// EN: ── P5: the whitelist lost nothing. More dangerous than garbage: a whitelist drops SILENTLY; a missing
//     file gives no build error, it simply does not ship, and that is found only at installation. The
//     mandatory list is all working code (index, marker-step, continuation-mode), the README and the four docs/
//     documents. ──
const OBYAZANY = ['index.mjs', 'marker-step.mjs', 'continuation-mode.mjs', 'package.json', 'CHANGELOG.md', 'README.md',
  'docs/ARCHITECTURE.md', 'docs/SETTINGS.md', 'docs/GUARDS.md', 'docs/TROUBLESHOOTING.md', 'stend-pristavki.mjs'];
const poteryano = OBYAZANY.filter(f => !s_belym.includes(f));
proba('объявленное на месте: белый список ничего не потерял',
  poteryano.length === 0,
  `из состава пропали: ${poteryano.join(', ')}`);

// RU: ── П6: образец подбирает НОВЫЙ стенд сам. Цена поимённого перечня — новый стенд выпадает МОЛЧА, пока о
//     нём не вспомнят; образец stend-*.mjs снимает эту цену, и это свойство надо стеречь. ──
// EN: ── P6: the pattern picks up a NEW stand by itself. The price of a by-name list is that a new stand drops
//     out SILENTLY until someone remembers it; the stend-*.mjs pattern removes that price, and this property
//     must be guarded. ──
proba('новый стенд попадает в состав САМ (образец stend-*.mjs)',
  s_belym.includes('stend-podstavnoj-novyj.mjs'),
  'подставной новый стенд не попал: образец не работает, каждый новый придётся вписывать руками');

console.log(`ИТОГ: ${vsego - krasnyh} из ${vsego}`);
process.exit(krasnyh > 0 ? 1 : 0);
