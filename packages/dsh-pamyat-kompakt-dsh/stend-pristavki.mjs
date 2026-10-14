// RU: СТЕНД ПРИСТАВОК: КАЖДАЯ журнальная строка этого пакета обязана назвать свою версию.
//     Что стережёт и почему так. Проверять «есть ли слово version в файле» бесполезно: при опечатке внутри
//     шаблона такой признак соврал бы зелёным. Поэтому пробы 1–3 судят по ЗНАЧЕНИЮ, выданному наружу функцией
//     pristavka, а проба 4 — по ВЫЗЫВАЮЩЕЙ стороне: «функция верна» и «функция вызывается» — разные
//     утверждения, и обычно стерегут только первое.
//     ⚠️ Где не применяется: движок платформы стенд НЕ поднимает — его конструктор требует настоящий ctx, и
//     подставной ломался бы при каждом обновлении платформы по ЧУЖОЙ причине. Значит связка «платформа зовёт
//     наш конструктор» здесь НЕ доказана; она видна в бою — первой строкой журнала после подъёма.
// EN: PREFIX STAND: EVERY log line of this package must name its version.
//     What it guards and why this way. Checking "is the word version in the file" is useless: with a typo
//     inside the template such a sign would lie green. So probes 1–3 judge by the VALUE returned by pristavka,
//     and probe 4 by the CALLING side: "the function is correct" and "the function is called" are different
//     statements, and usually only the first is guarded.
//     ⚠️ Where it does not apply: the stand does NOT start the platform engine — its constructor needs a real
//     ctx, and a fake one would break at every platform upgrade for SOMEONE ELSE's reason. So the link "the
//     platform calls our constructor" is NOT proven here; it is visible in production — the first log line
//     after start-up.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const trebovat = createRequire(import.meta.url);
// RU: Модуль ищет пакет сжатия ОТ ТОГО, КТО ЕГО ГРУЗИТ (process.argv[1]) — намеренно: установок платформы на
//     машине может быть несколько, и прибитый путь однажды уже поднял чужой движок. Стенд имитирует запуск
//     платформой. ⚠️ Это ПОДСТАНОВКА: что настоящая платформа даёт тот же argv[1], здесь не доказывается; путь
//     установки задан в коде стенда.
// EN: The module resolves the compaction package FROM WHOEVER LOADS IT (process.argv[1]) — on purpose: a
//     machine may have several platform installations, and a hard-coded path once started someone else's
//     engine. The stand simulates a platform start. ⚠️ This is a SUBSTITUTION: that the real platform gives the
//     same argv[1] is not proven here; the installation path is hard-coded in the stand.
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;

const VERSIYA_MANIFESTA = trebovat("./package.json").version;
const ISHODNIK = readFileSync(new URL("./index.mjs", import.meta.url), "utf-8");
const { pristavka } = await import(new URL("./index.mjs", import.meta.url).href);

let vsego = 0, krasnyh = 0;
const proba = (imya, uslovie, chto) => {
  vsego++;
  if (uslovie) { console.log(`  ✅ ${imya}`); }
  else { krasnyh++; console.log(`  🔴 ${imya} — ${chto}`); }
};

console.log(`стенд приставок · манифест ${VERSIYA_MANIFESTA}`);

const p1 = pristavka("kompakt-nash");
proba("1. приставка несёт версию МАНИФЕСТА",
  p1.includes(VERSIYA_MANIFESTA), `выдано «${p1}», ждали версию ${VERSIYA_MANIFESTA}`);

proba("2. версия прочитана, а не «неизвестна»",
  !p1.includes("версия неизвестна"), `выдано «${p1}» — манифест не прочитался`);

// RU: Ради чего это вообще: приставка kompakt-nash СОВПАДАЕТ с приставкой соседнего пакета dsh-pamyat-kompakt.
//     Без версии два прибора сливаются в один ряд.
// EN: Why this matters at all: the prefix kompakt-nash COINCIDES with the prefix of the sibling package
//     dsh-pamyat-kompakt. Without a version two instruments merge into one series.
proba("3. приставка ОТЛИЧИМА от голой (соседний пакет пишет так же)",
  p1 !== "[kompakt-nash]", `выдано «${p1}» — неотличимо от соседа`);

// RU: Вызывающая сторона: в коде не должно остаться голых литералов приставок.
// EN: Calling side: no bare prefix literals may remain in the code.
const GOLYE = /[`"']\[(kompakt-nash|dsh-pamyat-kompakt-dsh)\]/g;
const najdeno = ISHODNIK.match(GOLYE) ?? [];
proba("4. в коде нет приставок МИМО функции",
  najdeno.length === 0, `голых литералов ${najdeno.length}: ${najdeno.join(" ")}`);

// RU: Контроль зрячести пробы 4 — внутри стенда, а не рядом: без него «голых нет» значило бы И «код чист», И
//     «образец ничего не ищет».
// EN: Sightedness control for probe 4 — inside the stand, not next to it: without it "no bare ones" would mean
//     BOTH "code is clean" AND "the pattern finds nothing".
proba("5. контроль зрячести образца пробы 4",
  ('const s = `[kompakt-nash] что-то`;'.match(GOLYE) ?? []).length === 1,
  "образец слеп — проба 4 ничего не стережёт");

// RU: Проба 6. Мало, чтобы приставка несла ВЕРСИЮ — она не должна нести ЧУЖОЕ ИМЯ. Раньше рабочие строки шли
//     под [kompakt-nash …], а так же подписывается соседний пакет dsh-pamyat-kompakt. Различало их лишь то, что
//     номера версий разошлись, — то есть СОВПАДЕНИЕ ЗНАЧЕНИЙ, а не устройство: дойди этот пакет до того же
//     номера — строки слились бы МОЛЧА. Здесь имя проверяется само по себе, независимо от номера.
// EN: Probe 6. It is not enough for the prefix to carry the VERSION — it must not carry SOMEONE ELSE's NAME.
//     Production lines used to go under [kompakt-nash …], and the sibling package dsh-pamyat-kompakt signs the
//     same way. Only diverging version numbers told them apart — a COINCIDENCE OF VALUES, not design: had this
//     package reached the same number, the lines would have merged SILENTLY. Here the name is checked on its
//     own, regardless of the number.
const CHUZHOE = /pristavka\(\s*["'`]kompakt-nash["'`]\s*\)/g;
const chuzhie = ISHODNIK.match(CHUZHOE) ?? [];
proba("6. в вызовах нет ЧУЖОГО имени соседнего пакета",
  chuzhie.length === 0, `вызовов с «kompakt-nash»: ${chuzhie.length}`);

// RU: Контроль зрячести пробы 6 — внутри стенда: без него ноль значил бы И «чужого нет», И «образец ничего не
//     ищет».
// EN: Sightedness control for probe 6 — inside the stand: without it zero would mean BOTH "nothing foreign" AND
//     "the pattern finds nothing".
proba("7. контроль зрячести образца пробы 6",
  ('const l = pristavka("kompakt-nash");'.match(CHUZHOE) ?? []).length === 1,
  "образец слеп — проба 6 ничего не стережёт");

console.log(`итог: ${vsego - krasnyh} из ${vsego}`);
process.exit(krasnyh ? 1 : 0);
