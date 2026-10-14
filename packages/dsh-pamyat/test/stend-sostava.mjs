/**
 * RU: Стенд состава: манифест метапакета обязан совпадать с ФАКТОМ.
 * EN: Composition stand: the metapackage manifest must match the FACTS.
 *
 * RU: 🔴 Смысл метапакета — быть ИМЕНЕМ для набора. Имя, за которым у разных людей
 *     оказываются разные наборы, хуже отсутствия имени: расходятся молча. Поэтому
 *     здесь проверяется не «красиво ли записано», а три совпадения с фактом:
 *       1) версии в dependencies = версии в sostav.json
 *       2) суммы предмета в sostav.json = то, что ПРЯМО СЕЙЧАС даёт инструмент
 *       3) сумма самого инструмента = заявленная в sostav.json
 * EN: 🔴 The point of the metapackage is to be a NAME for the set. A name that means
 *     different sets to different people is worse than no name: they drift apart
 *     silently. So this stand checks not "is it written nicely" but three matches
 *     with the facts:
 *       1) versions in dependencies = versions in sostav.json
 *       2) subject checksums in sostav.json = what the tool produces RIGHT NOW
 *       3) the checksum of the tool itself = the one declared in sostav.json
 *
 * RU: Третья важнее двух первых. Однажды инструмент правился на месте, и одно имя
 *     носили ШЕСТЬ разных файлов подряд; числа предметов при этом выглядели
 *     безупречно. Прибор, разойдясь, врёт обо ВСЁМ, что им померено, — пакет врёт
 *     только о себе. Поэтому сумма инструмента проверяется наравне с числами.
 * EN: The third matters more than the first two. Once the tool was edited in place,
 *     and SIX different files carried the same name in a row; the subject numbers
 *     looked flawless meanwhile. A drifting instrument lies about EVERYTHING it
 *     measured — a package lies only about itself. So the tool checksum is checked
 *     on par with the numbers.
 *
 * RU: Чего стенд НЕ ловит: годность самих членов (это их собственные стенды); и сам он
 *     ни по какому расписанию не запускается — красное увидит только тот, кто его позвал.
 * EN: What the stand does NOT catch: fitness of the members themselves (their own stands
 *     do that); and it runs on no schedule by itself — only whoever runs it sees red.
 */
import { readFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT
//     (обходчик стендов гонит их с пределом времени). Образец семейства: каждый mkdtemp стенда — через vremennyj().
//     ⚠️ От SIGKILL не спасает ничто; временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temp data is removed on ANY exit — normal, probe failure, process.exit, SIGTERM/SIGINT
//     (stand sweepers run stands with a time limit). Family convention: every stand mkdtemp goes through vremennyj().
//     ⚠️ Nothing helps against SIGKILL; temp data created by a CHILD process is that process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

// RU: Пути машины — только из переменных, без умолчания: STEND_POLKA — полка архивов членов набора,
//     STEND_PLAGINY — каталог установленных плагинов (его node_modules — бой; STEND_BOJ подменяет только его).
//     Не заданы — СЛЕПОТА, код 2, до всех проб: тихое умолчание сверяло бы с чужой раскладкой.
// EN: Machine paths come only from variables, with no default: STEND_POLKA — the shelf of member archives,
//     STEND_PLAGINY — the installed-plugins directory (its node_modules is the live install; STEND_BOJ overrides only that).
//     Unset — BLINDNESS, exit 2, before any probe: a silent default would compare against someone else's layout.
const POLKA = process.env.STEND_POLKA || '';
const PLAGINY = process.env.STEND_PLAGINY || '';
if (!POLKA || !PLAGINY) {
  console.log('СЛЕПОТА: не задана ' + [!POLKA && 'STEND_POLKA', !PLAGINY && 'STEND_PLAGINY'].filter(Boolean).join(' и ') + ' — сверять не с чем');
  process.exit(2);
}

// RU: Корень пакета — каталог над test/; от него считаются все пути внутри пакета.
// EN: Package root — the directory above test/; every in-package path is resolved from it.
const koren = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * RU: 🔴 ДЕРЕВО СЕМЕЙСТВА ИЩЕТСЯ ПО КАНДИДАТАМ, А НЕ ПО ЖЁСТКОМУ ПУТИ.
 *     Первая редакция знала ровно одну раскладку — мастерскую автора (koren/../..).
 *     В ящике поставки раскладка плоская, у получателя из реестра дерева нет вовсе:
 *     стенд давал 4 из 8 и сыпал сырым «sha256sum: No such file». Выглядело бы как
 *     «пакет сломан», хотя сломана была ПРОВЕРКА.
 *     Это класс «вылечено ≠ вылечено ТАМ, ГДЕ РАБОТАЕТ», применённый к самому
 *     прибору: проверка, зелёная только у автора, ничего не проверяет у остальных.
 *     Найденное печатается — иначе непонятно, о какой раскладке говорят числа.
 * EN: 🔴 THE FAMILY TREE IS SEARCHED AMONG CANDIDATES, NOT AT ONE HARD-CODED PATH.
 *     The first version knew exactly one layout — the author's workshop (koren/../..).
 *     A delivery box has a flat layout, and a registry recipient has no tree at all:
 *     the stand gave 4 of 8 and spilled a raw "sha256sum: No such file". It would look
 *     like "the package is broken" while it was the CHECK that was broken.
 *     This is the class "fixed ≠ fixed WHERE IT RUNS", applied to the instrument
 *     itself: a check that is green only for the author checks nothing for anyone else.
 *     What was found is printed — otherwise it is unclear which layout the numbers describe.
 */
const KANDIDATY = [
  ['ящик поставки / установленные соседи', join(koren, '..')],
  ['мастерская', join(koren, '..', '..')],
];
// RU: 🔴 ИНСТРУМЕНТ И СОСЕДИ ЛЕЖАТ В РАЗНЫХ МЕСТАХ — ищем ОТДЕЛЬНО.
//     Прежняя редакция искала дерево ПО НАЛИЧИЮ инструмента и брала инструмент
//     оттуда же. У получателя из реестра так не работает НИКОГДА: npm кладёт
//     соседей в общий node_modules (рядом с нами), своего node_modules у пакета
//     без зависимостей не создаётся вовсе, а инструмент до alpha.4 не публиковался.
//     Кандидат «установлено у получателя» был НАМЕРЕНИЕМ, ПОХОЖИМ НА ПОДДЕРЖКУ:
//     в коде есть, сработать не мог. Проверено установкой из архивов двумя руками.
//     Теперь инструмент едет ВНУТРИ метапакета: он и есть способ, метапакет и есть
//     проверка. Цена честная и правильная: правка инструмента меняет сумму предмета.
// EN: 🔴 THE TOOL AND THE SIBLINGS LIVE IN DIFFERENT PLACES — SEARCH FOR THEM SEPARATELY.
//     The previous version located the tree BY THE PRESENCE of the tool and took the
//     tool from there. For a registry recipient that NEVER works: npm puts siblings
//     into the shared node_modules (next to us), a package without dependencies gets
//     no node_modules of its own, and the tool was not published before alpha.4.
//     The candidate "installed at the recipient" was an INTENTION THAT LOOKED LIKE
//     SUPPORT: present in code, unable to fire. Verified by installing from archives
//     by two independent hands.
//     Now the tool ships INSIDE the metapackage: it is the method, the metapackage is
//     the check. The price is honest and right: editing the tool changes the subject checksum.
const KANDIDATY_INSTRUMENTA = [
  ['внутри пакета (у получателя)', join(koren, 'summa-predmeta-2')],
  ['рядом (ящик поставки)', join(koren, '..', 'summa-predmeta-2')],
  ['в дереве (мастерская)', join(koren, '..', '..', 'summa-predmeta-2')],
];
let instrument = null, gdeInstrument = null;
for (const [imya, put] of KANDIDATY_INSTRUMENTA) {
  if (existsSync(put)) { instrument = put; gdeInstrument = imya; break; }
}
// RU: Соседи ищутся ПО СОСЕДУ, а не по инструменту — это разные вопросы.
// EN: Siblings are searched for BY A SIBLING, not by the tool — these are different questions.
let derevo = null, gdeNashli = null;
for (const [imya, put] of KANDIDATY) {
  if (existsSync(join(put, 'dsh-pamyat-core', 'package.json'))) { derevo = put; gdeNashli = imya; break; }
}
console.log('  инструмент: ' + (gdeInstrument ?? 'НЕ НАЙДЕН') + (instrument ? ' → ' + instrument : ''));
console.log('  соседи:     ' + (gdeNashli ?? 'НЕ НАЙДЕНЫ') + (derevo ? ' → ' + derevo : ''));
const sostav = JSON.parse(readFileSync(join(koren, 'sostav.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(koren, 'package.json'), 'utf8'));

// RU: 🔴 Отказ ДОЛЖЕН ЗВУЧАТЬ СЛОВАМИ. Без дерева семейства прежняя редакция
//     сыпала сырьём оболочки («Command failed: sha256sum», «path must be string») —
//     получатель прочёл бы это как «пакет сломан», а сломана ПРОВЕРКА, точнее её
//     предпосылка. Причина называется один раз и одинаково во всех зависимых пробах.
// EN: 🔴 A refusal MUST BE SAID IN WORDS. Without the family tree the previous version
//     spilled raw shell output ("Command failed: sha256sum", "path must be string") —
//     a recipient would read it as "the package is broken", while it is the CHECK, or
//     rather its premise, that is broken. The reason is stated once and identically
//     in every dependent probe.
const NET_DEREVA = 'дерево семейства не найдено — проверить суммы НЕЧЕМ. ' +
  'Это отказ ПРОВЕРКИ, а не пакета: метапакет по построению проверяет соседей, ' +
  'и без них ему нечего сверять.';
// RU: Предусловие проб, которым нужны соседи: без инструмента или дерева — отказ словами.
// EN: Precondition for probes that need siblings: no tool or no tree — a refusal in words.
const trebuetDereva = () => {
  if (!instrument) throw new Error('инструмент summa-predmeta-2 не найден — считать НЕЧЕМ. ' + NET_DEREVA);
  if (!derevo) throw new Error(NET_DEREVA);
};

let vsego = 0, proshlo = 0;
// RU: 🔴 ПРОВАЛЫ СЧИТАЮТСЯ ПО ПРИЧИНЕ, А НЕ ПО ЧИСЛУ. Прежде код возврата
//     решался выражением `!derevo && proshlo < vsego` — то есть при отсутствии дерева ЛЮБОЙ
//     провал объявлялся слепотой, включая тот, что дерева не требует вовсе. Замер: порча
//     «убрать члена из README» дала код 2 «проверять нечем» вместо 1 «расхождение» — провал
//     ПО СУЩЕСТВУ маскировался слепотой соседних проб. Это ровно тот класс, который мы
//     разводили в самих кодах: отказ, объявленный законным, перестаёт читаться как отказ.
// EN: 🔴 FAILURES ARE COUNTED BY CAUSE, NOT BY NUMBER. Previously the exit code was
//     decided by `!derevo && proshlo < vsego` — i.e. without the tree ANY failure was
//     declared blindness, including one that needs no tree at all. Measured: the
//     corruption "remove a member from README" gave exit 2 "nothing to check" instead of
//     1 "divergence" — a SUBSTANTIVE failure was masked by the blindness of neighbouring
//     probes. Exactly the class the exit codes exist to separate: a failure declared
//     legitimate stops being read as a failure.
// RU: 🔴 ПРИЗНАК ПО НАЗНАЧЕНИЮ ПРОБЫ, А НЕ ПО ТЕКСТУ ОШИБКИ. Первая редакция этой правки
//     отличала слепоту от расхождения поиском подстроки NET_DEREVA в сообщении — и пропустила
//     ДВА провала про то же дерево, написанных другими словами. Признак по тексту ловит ровно
//     то, что совпало дословно; проба же либо требует соседей, либо нет, и это её свойство,
//     а не свойство её сообщения.
// EN: 🔴 THE SIGN COMES FROM THE PROBE'S PURPOSE, NOT FROM THE ERROR TEXT. The first version
//     of this fix told blindness from divergence by searching the message for NET_DEREVA —
//     and missed TWO failures about the same tree worded differently. A text sign catches
//     exactly what matched verbatim; a probe either needs siblings or does not, and that
//     is a property of the probe, not of its message.
// RU: poSushchestvu — число провалов по существу: всех, кроме проб «нужны соседи» при ненайденном дереве.
// EN: poSushchestvu — count of substantive failures: all except "needs siblings" probes when no tree was found.
let poSushchestvu = 0;
// RU: proba(имя, тело, нужныСоседи) — одна проба. Говорит только исключением; печатает ✅ или ❌ с причиной.
// EN: proba(name, body, needsSiblings) — one probe. Speaks only by throwing; prints ✅ or ❌ with the reason.
const proba = (imya, f, nuzhnySosedi = false) => {
  vsego++;
  // RU: 🔴 ВОЗВРАТ ТЕЛА — ТОЖЕ ИСХОД. Прежде засчитывалось одно отсутствие
  //     исключения, и тело, сказавшее «нет» возвратом, выходило зелёным. Пробы здесь говорят
  //     только исключением, поэтому ЛЮБОЙ возврат, кроме undefined, — провал: перечень «ложных»
  //     значений (false, 0, null, {ok:false}…) неполон по построению (условие приёмки, тот же
  //     способ, что в стенде restore). НЕ ЛОВИТ: async-тело (промис — тоже возврат, краснеет,
  //     но отказ внутри него не дождётся) и тело, которое молча ничего не проверило.
  // EN: 🔴 A BODY'S RETURN VALUE IS AN OUTCOME TOO. Previously only the absence of an
  //     exception was counted, and a body that said "no" by returning came out green. Probes
  //     here speak only by throwing, so ANY return other than undefined is a failure: a list
  //     of "falsy" values (false, 0, null, {ok:false}…) is incomplete by construction (an
  //     acceptance condition; same method as the restore stand). DOES NOT CATCH: an async body
  //     (a promise is a return value too — it goes red, but a failure inside it is not awaited)
  //     and a body that silently checked nothing.
  try {
    const vernulos = f();
    if (vernulos !== undefined) throw new Error('тело пробы вернуло «' + String(vernulos).slice(0, 60) + '» — пробы говорят только исключением');
    proshlo++; console.log('  ✅ ' + imya);
  }
  catch (e) {
    // RU: Провал со словом «СЛЕПОТА» — отказ проверки (нечем сверять), а не расхождение: по существу не считается.
    // EN: A failure starting with "СЛЕПОТА" (blindness) is a failure of the check, not a divergence: not counted as substantive.
    if (!(nuzhnySosedi && !derevo) && !/^СЛЕПОТА/.test(e.message)) poSushchestvu++;
    console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 220));
  }
};

// RU: Проба 1. Стенд годен: инструмент и соседи найдены, а контроль зрячести инструмента пройден
//     (сумма меняется от правки байта и от переименования). Красная — остальные числа ничего не значат.
// EN: Probe 1. The stand is fit: tool and siblings found, and the tool's sight check passed
//     (the checksum changes on a byte edit and on a rename). If red, the other numbers mean nothing.
proba('стенд годен: инструмент и соседи найдены, контроль зрячести пройден', () => {
  if (!instrument) throw new Error('инструмент не найден ни внутри пакета, ни рядом, ни в дереве');
  if (!derevo) {
    throw new Error('дерево семейства не найдено ни в одной из раскладок: ' +
      KANDIDATY.map(([i, p]) => i + ' (' + p + ')').join('; ') +
      '. Без него суммы проверить нечем — это отказ ПРОВЕРКИ, а не пакета.');
  }
  let v;
  // RU: Инструмент не исполнился (например, npm без кэша) — слепота среды, а не негодный набор.
  // EN: The tool did not run (e.g. npm without a cache) — blindness of the environment, not an unfit set.
  try { v = execFileSync(instrument, ['--kontrol'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { throw new Error('СЛЕПОТА (среда): контроль зрячести инструмента не исполнился: ' + String(e.stderr || e.message).trim().split('\n')[0].slice(0, 120)); }
  if (!/ПРОЙДЕН/.test(v)) throw new Error('контроль зрячести не пройден: ' + v.trim());
}, true);

// RU: Проба 2. Сумма файла инструмента равна заявленной. Ловит правку инструмента на месте.
//     Не ловит: смену способа под новым именем файла без обновления состава.
// EN: Probe 2. The tool file checksum equals the declared one. Catches an in-place tool edit.
//     Misses: a method change under a new file name without updating the composition.
proba('🔴 СУММА ИНСТРУМЕНТА совпадает с заявленной в составе', () => {
  trebuetDereva();
  const fakt = execFileSync('sha256sum', [instrument], { encoding: 'utf8' }).slice(0, 16);
  if (fakt !== sostav.kak_schitano.summa_instrumenta) {
    throw new Error('инструмент ДРУГОЙ: на диске ' + fakt +
                    ', в составе ' + sostav.kak_schitano.summa_instrumenta +
                    ' — все числа ниже посчитаны неизвестно чем');
  }
}, true);

// RU: 🔴 A-N-1873: зависимости — ТОЧНЫЕ НОМЕРА членов, которые реально выйдут (= дереву семейства), а не file:-пути полки.
//     Полка остаётся местом СВЕРКИ сумм (проба 5): архив под тем же номером обязан быть тем же предметом.
//     Полка и каталог плагинов — из STEND_POLKA и STEND_PLAGINY (проверены в начале файла).
// EN: 🔴 A-N-1873: dependencies are the EXACT member versions that will actually ship (= the family tree), not shelf file: paths.
//     The shelf remains the place where checksums are VERIFIED (probe 5): the archive under the same version must be the same subject.
//     The shelf and the plugins directory come from STEND_POLKA and STEND_PLAGINY (checked at the top of the file).
const BOJ = process.env.STEND_BOJ || join(PLAGINY, 'node_modules');
// RU: Член с полем katalog стоит в установке КАТАЛОГОМ (не архивом) — сверяется по самому каталогу,
//     в зависимостях набора — точный номер, как у остальных (A-N-1873); katalog — путь относительно STEND_PLAGINY.
// EN: A member with a katalog field is installed AS A DIRECTORY (not an archive) — it is checked by the
//     directory itself; the set's dependencies carry an exact version like the other members (A-N-1873); katalog is a path relative to STEND_PLAGINY.
const arhiv = (p) => p.katalog ? join(PLAGINY, p.katalog) : join(POLKA, p.paket + '-' + p.versiya + '.tgz');
// RU: Число файлов предмета — из ТОГО ЖЕ вызова summa-predmeta-2, что и сумма («… файлов N»); читает проба 6.
// EN: The subject file count comes from the SAME summa-predmeta-2 call as the checksum ("… файлов N"); probe 6 reads it.
const faylovPoschitano = new Map();
// RU: Проба 3 (A-N-1873). СМЫСЛ, а не запись: зависимость члена — точный номер, равный составу; член ЕСТЬ в дереве
//     семейства (или рядом, у получателя) и его собственный package.json несёт ТОТ ЖЕ номер. Незаявленных зависимостей нет.
//     Прежде проба сверяла строку file:<полка>/<пакет>-<версия>.tgz — и набор, закреплённый по архивам старой схемы
//     (core 0.1.0-alpha.102 при дереве 1.1.107), был ею зелёным: строка сходилась сама с собой.
//     Не ловит: что архив полки под этим номером — тот же предмет (проба 5) и что номер равен бою (проба 7).
// EN: Probe 3 (A-N-1873). MEANING, not notation: each member dependency is an exact version equal to the composition; the member
//     EXISTS in the family tree (or next to us at a recipient) and its own package.json carries THE SAME version. No undeclared
//     dependencies. Previously the probe compared the file: string and stayed green for a set pinned to old-scheme archives.
//     Misses: whether the shelf archive under that version is the same subject (probe 5), and equality with the install (probe 7).
proba('зависимости = точные номера членов: равны составу и версии члена в дереве', () => {
  trebuetDereva();
  const plohie = [];
  for (const p of sostav.sostav) {
    const v = manifest.dependencies[p.paket];
    if (v !== p.versiya) { plohie.push(p.paket + ': в зависимостях ' + v + ', в составе ' + p.versiya); continue; }
    const pj = join(derevo, p.paket, 'package.json');
    if (!existsSync(pj)) { plohie.push(p.paket + ': члена нет в дереве (' + pj + ')'); continue; }
    const vd = JSON.parse(readFileSync(pj, 'utf8')).version;
    if (vd !== p.versiya) plohie.push(p.paket + ': в дереве ' + vd + ', в наборе ' + p.versiya);
  }
  const lishnie = Object.keys(manifest.dependencies).filter((k) => !sostav.sostav.some((p) => p.paket === k));
  if (lishnie.length) plohie.push('в зависимостях есть незаявленные: ' + lishnie.join(', '));
  if (plohie.length) throw new Error(plohie.join('; '));
}, true);

// RU: Проба 4. Версии точные, без диапазонов. Не ловит метки (latest) и ссылки git.
// EN: Probe 4. Versions are exact, no ranges. Misses tags (latest) and git links.
proba('🔴 ВЕРСИИ ТОЧНЫЕ, без диапазонов — иначе имя означает разные наборы', () => {
  for (const [imya, spec] of Object.entries(manifest.dependencies)) {
    const v = String(spec).replace(/^file:.*\/[^/]*?-(\d[^/]*)\.tgz$/, '$1');
    // RU: x — диапазон, только когда стоит ЦЕЛЫМ разрядом версии (1.x, 1.2.x, x); прежде /x/ без границ
    //     ловил любую букву x в имени или пути и краснел ложно.
    // EN: x is a range only as a WHOLE version part (1.x, 1.2.x, x); previously /x/ without boundaries
    //     caught any letter x in a name or path and went falsely red.
    if (/[\^~*><]|\s-\s|(^|[.\s])[xX](\.|\s|$)/.test(v)) throw new Error(imya + ': диапазон «' + v + '» вместо точной версии');
  }
});

// RU: 🔴 СУММЫ СВЕРЯЮТСЯ С ЛОКАЛЬНОЙ ПОЛКОЙ, А НЕ С РЕЕСТРОМ npm.
//     До alpha.33 состав описывал опубликованное и проба спрашивала реестр (npm pack name@version). Когда
//     публикацию остановили, поставка пошла ИЗ ДЕРЕВА через file:-архивы полки, и проверять надо ТО, ЧТО
//     ПОЕДЕТ: архив полки под заявленной версией. Сети не нужно.
//     Нет архива или не распаковался — СЛЕПОТА с причиной, а не «сошлось» и не «расхождение».
//     ⚠️ Слепота этой пробы при найденных соседях по существу НЕ засчитывается: «СЛЕПОТА» в начале ошибки, без других провалов — код 2.
// EN: 🔴 CHECKSUMS ARE COMPARED WITH THE LOCAL SHELF, NOT WITH THE npm REGISTRY.
//     Up to alpha.33 the composition described what was published and the probe asked the registry
//     (npm pack name@version). Once publishing stopped, delivery went FROM THE TREE through file: archives
//     on the shelf, so what must be checked is WHAT WILL SHIP: the shelf archive under the declared version.
//     No network needed. No archive, or it did not unpack — BLINDNESS with a reason, neither "matched" nor
//     "diverged". ⚠️ With siblings found, this probe's blindness is NOT counted as substantive: "СЛЕПОТА" at the start of the error, with no other failures — exit 2.
proba('🔴 СУММЫ ПРЕДМЕТОВ совпадают с архивом ПОЛКИ под заявленной версией', () => {
  trebuetDereva();
  const rashozhdeniya = [];
  const slepye = [];
  const vremenno = vremennyj(join(tmpdir(), 'sostav-'));
  try {
    for (const p of sostav.sostav) {
      const kat = join(vremenno, p.paket);
      mkdirSync(kat, { recursive: true });
      try {
        if (!existsSync(arhiv(p))) { slepye.push(p.paket + ': ' + (p.katalog ? 'каталога ' : 'архива ') + arhiv(p) + ' нет'); continue; }
        if (!p.katalog) execFileSync('tar', ['xzf', arhiv(p), '-C', kat], { encoding: 'utf8' });
        const vyvod = execFileSync(instrument, [p.katalog ? arhiv(p) : join(kat, 'package')], { encoding: 'utf8' }).trim();
        const chislo = vyvod.split(/\s+/)[1];
        // RU: Инструмент вышел с кодом 0, но суммы не дал (npm не отдал состав) — слепота, а не «на полке undefined».
        // EN: The tool exited 0 but gave no checksum (npm returned no file list) — blindness, not "on the shelf undefined".
        if (!/^[0-9a-f]{16}$/.test(chislo ?? '')) { slepye.push(p.paket + '@' + p.versiya + ': инструмент не дал суммы'); continue; }
        const mf = vyvod.match(/файлов (\d+)\s*$/); faylovPoschitano.set(p.paket, mf ? Number(mf[1]) : null);
        if (chislo !== p.predmet)
          rashozhdeniya.push(p.paket + '@' + p.versiya + ': ' + (p.katalog ? 'в каталоге ' : 'на полке ') + chislo + ', в составе ' + p.predmet);
      } catch (e) {
        slepye.push(p.paket + '@' + p.versiya + ': ' + String(e.message ?? e).split('\n')[0].slice(0, 90));
      }
    }
  } finally { rmSync(vremenno, { recursive: true, force: true }); }
  if (rashozhdeniya.length) throw new Error(rashozhdeniya.join('; '));
  if (slepye.length) throw new Error('СЛЕПОТА (не расхождение), сверить не удалось: ' + slepye.join('; '));
}, true);

// RU: 🔴 Проба 6. Поле faylov состава было БЕЗ ЧИТАТЕЛЯ (находка приёмки) — порча restore 13→12
//     в sostav.json давала 10/10 зелёное. Число берётся из того же вызова summa-predmeta-2, что и сумма:
//     второго прибора нет. Сумма не посчитана (нет архива, не распаковался) — число тоже неизвестно:
//     СЛЕПОТА, а не «сошлось».
// EN: 🔴 Probe 6. The composition's faylov field had NO READER (an acceptance finding) — corrupting restore
//     13→12 in sostav.json gave a green 10/10. The number comes from the same summa-predmeta-2 call as the
//     checksum: there is no second instrument. Checksum not computed (no archive, did not unpack) — the
//     count is unknown too: BLINDNESS, not "matched".
proba('🔴 ЧИСЛО ФАЙЛОВ предметов совпадает с составом (тот же вызов summa-predmeta-2, что и сумма)', () => {
  trebuetDereva();
  const plohie = [], nechem = [];
  for (const p of sostav.sostav) {
    const n = faylovPoschitano.get(p.paket);
    if (n === undefined || n === null) { nechem.push(p.paket + (n === null ? ' (инструмент не назвал числа)' : '')); continue; }
    if (n !== p.faylov) plohie.push(p.paket + '@' + p.versiya + ': посчитано ' + n + ', в составе ' + p.faylov);
  }
  if (plohie.length) throw new Error(plohie.join('; '));
  if (nechem.length) throw new Error('СЛЕПОТА (не расхождение), число файлов не посчитано: ' + nechem.join('; '));
}, true);

/**
 * RU: Номер предвыпускной версии: 0.1.0-alpha.36 → 36. Нужен, чтобы отличить «диск впереди»
 *     от «диск позади»: строковое сравнение здесь врёт (alpha.9 > alpha.36 по алфавиту).
 *     Не разобрался — возвращаем null, и проба говорит «сравнить нечем», а не гадает.
 * EN: Pre-release number: 0.1.0-alpha.36 → 36. Needed to tell "disk ahead" from "disk behind":
 *     string comparison lies here (alpha.9 > alpha.36 alphabetically).
 *     If it cannot parse — return null, and the probe says "nothing to compare" instead of guessing.
 */
function nomerAlfa(v) {
  const m = String(v).match(/-alpha\.(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * RU: 🔴 Проба 7. НАБОР РАВЕН УСТАНОВЛЕННОМУ. Прежняя проба проверяла «ДЕРЕВО не позади» и была ЗЕЛЁНОЙ,
 *     когда набор отставал: дерево законно впереди принятого, поэтому равенство с ним требовать нельзя.
 *     Но и отставание набора она не видела ПО ПОСТРОЕНИЮ — так набор ушёл назад на 6–66 версий
 *     (core a40 при установленном a85), и стенд молчал.
 *     Сверяем с УСТАНОВКОЙ (<каталог-плагинов>/node_modules; STEND_BOJ — подмена): установка меняется
 *     только монтажом ПОСЛЕ приёмки, то есть она и есть принятое. Набор позади — отстал; впереди —
 *     закрепляет несмонтированное. Оба — красные с именем. Каталога нет — СЛЕПОТА.
 *     ⚠️ Чего не ловит: сам по себе стенд никто не зовёт по расписанию — красное увидит тот, кто его
 *     запустит. И слепота этой пробы при найденных соседях по существу НЕ засчитывается (код 2, если других провалов нет).
 * EN: 🔴 Probe 7. THE SET EQUALS THE INSTALLATION. The previous probe checked "the TREE is not behind" and
 *     was GREEN while the set lagged: the tree is legitimately ahead of what was accepted, so equality with
 *     it cannot be required. But it could not see the set lagging BY CONSTRUCTION — so the set slid back by
 *     6–66 versions (core a40 with a85 installed), and the stand stayed silent.
 *     We compare with the INSTALLATION (<plugins-dir>/node_modules; STEND_BOJ overrides it): it changes only
 *     by mounting AFTER acceptance, so it is what was accepted. Set behind — it lags; ahead — it pins
 *     something not mounted. Both are red with the name. No directory — BLINDNESS.
 *     ⚠️ Misses: nothing runs the stand on a schedule — only whoever runs it sees red. And with siblings
 *     found, this probe's blindness is NOT counted as substantive (exit 2 if there are no other failures).
 */
proba('🔴 версии набора РАВНЫ боевым (каталог установки) — набор не отстаёт и не забегает', () => {
  if (!existsSync(BOJ)) throw new Error('СЛЕПОТА: каталога боя ' + BOJ + ' нет — сверять не с чем');
  const plohie = [];
  for (const p of sostav.sostav) {
    const pj = join(BOJ, p.paket, 'package.json');
    if (!existsSync(pj)) { plohie.push(p.paket + ': на бою нет (' + pj + ')'); continue; }
    const v = JSON.parse(readFileSync(pj, 'utf8')).version;
    const nb = nomerAlfa(v), ns = nomerAlfa(p.versiya);
    if (v === p.versiya) continue;
    plohie.push(p.paket + ': бой ' + v + ', набор ' + p.versiya + (nb !== null && ns !== null
      ? (ns < nb ? ' — набор ОТСТАЛ на ' + (nb - ns) : ' — набор ВПЕРЕДИ боя на ' + (ns - nb)) : ' — сравнить номера нечем'));
  }
  if (plohie.length) throw new Error(plohie.join('; '));
}, true);

// RU: Проба 8. Состав называет способ: инструмент, его сумму, контроль и объяснение, почему способ — файл.
//     Не ловит: правильность самого объяснения.
// EN: Probe 8. The composition names its method: tool, its checksum, control and why the method is a file.
//     Misses: whether the explanation itself is right.
proba('состав называет СПОСОБ, а не только числа', () => {
  const k = sostav.kak_schitano;
  if (!k.instrument || !k.summa_instrumenta || !k.kontrol) throw new Error('способ описан неполно');
  if (!k.pochemu_ne_prozoy) throw new Error('не сказано, почему способ живёт файлом, а не прозой');
});

// RU: Проба 9. Всё, что стенд читает внутри пакета, есть в составе публикации (npm pack --dry-run).
//     Читаемые файлы ищутся в тексте самого стенда по образцу вызова соединения пути от корня пакета;
//     поэтому чтения, записанные иначе, проба не видит.
// EN: Probe 9. Everything the stand reads inside the package is in the published file list (npm pack --dry-run).
//     Read files are found in the stand's own text by the pattern of a path join from the package root;
//     reads written any other way are invisible to this probe.
proba('🔴 ВСЁ, ЧТО ЧИТАЕТ СТЕНД, ЕСТЬ В СОСТАВЕ ПУБЛИКАЦИИ', () => {
  // RU: Поймано на самом метапакете: sostav.json читался стендом четыре раза и НЕ
  //     публиковался. Получатель распаковал бы пакет — и стенд упал бы на чтении
  //     файла, которого нет. Тот же класс, что уже стоил перевыпуска пяти пакетам:
  //     состав задан перечнем, а перечень устаревает молча.
  // EN: Caught on the metapackage itself: sostav.json was read by the stand four times and
  //     was NOT published. A recipient would unpack the package — and the stand would fail
  //     reading a file that is not there. The same class that already cost five packages a
  //     re-release: the file list is an enumeration, and an enumeration goes stale silently.
  let vyvod;
  try {
    vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error('СЛЕПОТА (среда): npm pack не исполнился — состав публикации не получен: ' + String(e.stderr || e.message).trim().split('\n').pop().slice(0, 120));
  }
  const sostavPub = JSON.parse(vyvod)[0].files.map((f) => f.path);
  const stend = readFileSync(join(koren, 'test', 'stend-sostava.mjs'), 'utf8');
  const nuzhno = new Set();
  for (const m of stend.matchAll(/join\(koren,\s*'([^']+)'(?:,\s*'([^']+)')?\)/g)) {
    nuzhno.add([m[1], m[2]].filter(Boolean).join('/'));
  }
  // RU: 🔴 Пути ВНЕ пакета не отбрасываем молча: прежняя редакция их прятала, и
  //     потому не видела чтения через дерево семейства — «зелёный учёт тем
  //     убедительнее, чем меньше покрывает». Теперь они названы отдельно.
  // EN: 🔴 Paths OUTSIDE the package are not silently dropped: the previous version hid
  //     them and so did not see reads through the family tree — "green accounting is the
  //     more convincing the less it covers". Now they are named separately.
  const vne = [...nuzhno].filter((f) => f.startsWith('..'));
  // RU: Кандидаты поиска дерева — не читаемые файлы, а места, где оно может лежать.
  //     Исключаем их ЯВНО и по списку, а не молчаливым отбрасыванием: молчаливое
  //     отбрасывание и спрятало от этой пробы чтения через дерево семейства.
  // EN: Tree search candidates are not read files but places where the tree may lie.
  //     They are excluded EXPLICITLY, by list, not by silent dropping: silent dropping
  //     is exactly what hid reads through the family tree from this probe.
  const mestaPoiska = new Set(KANDIDATY.map(([, put]) => put.split('/').pop()));
  const net = [...nuzhno].filter((f) => !sostavPub.includes(f) && !f.startsWith('..') && !mestaPoiska.has(f));
  if (net.length) throw new Error('стенд читает, а в публикации НЕТ: ' + net.join(', '));
  if (vne.length && !derevo) {
    throw new Error('стенд читает вне пакета (' + vne.join(', ') + '), а дерева семейства нет');
  }
}, true);

// RU: 🔴 Пробы 10 и 11. README СВЕРЯЕТСЯ С СОСТАВОМ ПОИМЁННО И ПОВЕРСИОННО (находка аудита).
//     Прежде README писался РЯДОМ с sostav.json, а не собирался из него, и отстал: называл
//     ПЯТЬ членов старых версий и не называл шестого вовсе. Стенд при этом был зелёным —
//     он читает состав, а человек читает README. Зелёный учёт тем убедительнее, чем меньше
//     он покрывает.
//     ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба смотрит, что описание НЕ ОТСТАЛО от состава. О том, верен ли
//     сам состав, она не говорит ничего — это работа соседних проб и приёмки.
// EN: 🔴 Probes 10 and 11. THE README IS CHECKED AGAINST THE COMPOSITION BY NAME AND VERSION (an audit
//     finding). Previously the README was written NEXT TO sostav.json rather than built from it, and fell
//     behind: it named FIVE members at old versions and did not name the sixth at all. The stand was green
//     meanwhile — it reads the composition, while a human reads the README. Green accounting is the more
//     convincing the less it covers.
//     WHERE IT DOES NOT APPLY: the probe checks that the description has NOT FALLEN BEHIND the composition.
//     It says nothing about whether the composition itself is right — neighbouring probes and acceptance do.
// RU: 🔴 ОБА ОПИСАНИЯ, А НЕ ОДНО. Первая редакция этой пробы читала только
//     README.md — и английское описание отстало НА СЕМЬ ВЕРСИЙ незамеченным: называло пять
//     членов (core alpha.9, omega alpha.6, secretary alpha.3, byudzhet alpha.4, nudzh alpha.4)
//     и не знало о restore вовсе, при зелёном стенде.
//     Это класс парных объектов: рассинхрон двух описаний не виден ничем, кроме сверки
//     САМИХ описаний, а проба, читающая одно из пары, даёт ровно ту уверенность, которой
//     пара и должна была помешать.
//     ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба не сверяет два описания МЕЖДУ СОБОЙ: оба сверяются с составом,
//     он и есть общий источник.
// EN: 🔴 BOTH DESCRIPTIONS, NOT ONE. The first version of this probe read only README.md — and
//     the English description fell SEVEN VERSIONS behind unnoticed: it named five members
//     (core alpha.9, omega alpha.6, secretary alpha.3, byudzhet alpha.4, nudzh alpha.4) and did
//     not know about restore at all, with the stand green.
//     This is the class of paired objects: drift between two descriptions is visible only by
//     comparing THE DESCRIPTIONS themselves, and a probe reading one of the pair gives exactly
//     the confidence the pair was meant to prevent.
//     WHERE IT DOES NOT APPLY: the probe does not compare the two descriptions WITH EACH OTHER:
//     both are checked against the composition, which is the common source.
for (const [imya, fajl] of [['русское', 'README.md'], ['английское', 'README.en.md']]) {
  proba('🔴 ' + imya + ' описание перечисляет РОВНО тех членов и те версии, что в составе', () => {
    const opisanie = readFileSync(join(koren, fajl), 'utf-8');
    // RU: A-N-1871: СМЫСЛ, а не форма строки — член и его версия на ОДНОЙ строке в любой записи (строка с отступом,
    //     таблица, перечень). Прежде требовалось «имя<пробелы>версия», а обратная проверка видела только строки с
    //     отступом и имена без дефиса (kompakt-dsh выпадал).
    // EN: A-N-1871: MEANING, not line shape — a member and its version on ONE line in any notation (indented line, table,
    //     list). Previously "name<spaces>version" was required, and the reverse check saw only indented lines and names
    //     without a hyphen (kompakt-dsh fell out).
    const ekr = (x) => x.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    const linii = opisanie.split('\n');
    for (const ch of sostav.sostav) {
      const est = new RegExp(ekr(ch.paket) + '(?![\\w-])[^\\n]*?(?<![\\w.])' + ekr(ch.versiya) + '(?![\\w.])');
      if (!linii.some((l) => est.test(l))) {
        throw new Error(fajl + ' не называет ' + ch.paket + ' ' + ch.versiya +
                        ' — описание отстало от состава');
      }
    }
    // RU: и обратно: имя пакета семейства, за которым на той же строке (до 40 знаков) стоит номер версии, — заявка
    //     члена; её имя обязано быть в составе.
    // EN: and the other way round: a family package name followed on the same line (within 40 chars) by a version
    //     number is a member claim; its name must be in the composition.
    const imena = new Set(sostav.sostav.map((x) => x.paket));
    for (const l of linii) {
      for (const m of l.matchAll(/(dsh-pamyat-[a-z]+(?:-[a-z]+)*)(?![\w-])[^\n]{0,40}?(?<![\w.])\d+\.\d+\.\d+/g)) {
        if (!imena.has(m[1])) throw new Error(fajl + ' называет ' + m[1] + ' с версией, а в составе его нет');
      }
    }
  });
}

console.log('  итог: ' + proshlo + ' из ' + vsego);


// RU: 🔴 РАЗВОД КОДОВ. Слова про природу отказа здесь были верны с самого начала
//     («это отказ ПРОВЕРКИ, а не пакета»), а код возврата — нет: без соседей стенд отдавал 1,
//     то есть «предмет негоден». Замер: распакованный архив без установки зависимостей давал
//     «3 из 8, код 1» — потребитель, распаковавший пакет, читал это как сломанный набор.
//     По нашей конвенции «проверять нечем» — это код 2, а не 1. Различаем: если ВСЕ провалы
//     вызваны отсутствием дерева семейства, это слепота (2); если есть хоть один провал по
//     существу — расхождение (1). ГДЕ НЕ ПРИМЕНЯЕТСЯ: код 2 не означает, что набор годен —
//     он означает, что этот стенд его не проверял.
//     Слепота — только когда ВСЕ провалы вызваны отсутствием дерева. Хоть один провал по
//     существу перебивает её: расхождение важнее слепоты.
//     Провал, который сама проба назвала «СЛЕПОТА» (нет полки или каталога установки, инструмент или
//     npm не исполнились), — тоже слепота, и при найденном дереве: только такие провалы — код 2.
// EN: 🔴 SEPARATING EXIT CODES. The words about the nature of the failure were right from the start
//     ("a failure of the CHECK, not of the package"), but the exit code was not: without siblings
//     the stand returned 1, i.e. "the subject is unfit". Measured: an unpacked archive without
//     installed dependencies gave "3 of 8, exit 1" — a consumer who unpacked the package read that
//     as a broken set. By our convention "nothing to check against" is exit 2, not 1. We separate:
//     if ALL failures come from the missing family tree, it is blindness (2); if there is at least
//     one substantive failure, it is divergence (1). WHERE IT DOES NOT APPLY: exit 2 does not mean
//     the set is fit — it means this stand did not check it.
//     Blindness only when ALL failures come from the missing tree. One substantive failure overrides
//     it: divergence matters more than blindness.
//     A failure the probe itself named "СЛЕПОТА" (no shelf or installation directory, the tool or npm
//     did not run) is blindness too, even with the tree found: only such failures — exit 2.
if (proshlo === vsego) process.exit(0);
if (poSushchestvu > 0) process.exit(1);
process.exit(2);
