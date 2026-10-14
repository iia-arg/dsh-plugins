#!/usr/bin/env node
/**
 * СОСТАВ НАБОРА ПО УСЛОВИЮ, А НЕ ПО НОМЕРУ.
 *
 * 🔴 ЗАЧЕМ. 05.09.2026 координатор трижды за сорок семь минут называла номер, на котором
 * собирать набор (a31 → a32 → a33), и каждый раз была права В МОМЕНТ НАПИСАНИЯ: ворота
 * работают, каждый круг рождает улучшение, улучшение двигает предмет. Её вывод — перестать
 * называть число и назвать УСЛОВИЕ: «последняя ПРИНЯТАЯ версия на момент сборки».
 * Условие не устаревает, число устаревает. Этот прибор и есть исполнение условия.
 *
 * 🔴 ДВА ИСТОЧНИКА, А НЕ ОДИН, И ОНИ РАСХОДЯТСЯ.
 *   принятость — коммит вердикта в дереве (git), не письмо и не метка в реестре;
 *   достижимость — версия в npm: набор объявляет ТОЧНЫЕ номера, и версия, которой в
 *   реестре нет, делает набор НЕУСТАНОВИМЫМ у постороннего (проверено фактом 05.09:
 *   `npm i dsh-pamyat-secretary@0.1.0-alpha.18` → notarget).
 * Поэтому берётся последняя версия, которая ПРИНЯТА И ОПУБЛИКОВАНА, а расхождение
 * («принято новее, чем опубликовано») печатается ГРОМКО: это цена правила вех, и она
 * должна быть видна числом, а не обнаруживаться при следующей сборке.
 *
 * ЧЕГО ПРИБОР НЕ ДЕЛАЕТ:
 *   · не собирает набор и не правит манифест — только говорит, что брать;
 *   · не судит, хорош ли вердикт: читает факт коммита, а не его содержание;
 *   · не знает про условные вердикты («принята условно») — для него это принята,
 *     и это НАЗВАНО здесь, а не оставлено на догадку.
 *
 * КОДЫ: 0 — состав определён · 2 — слепота (дерево или реестр не читаются).
 *
 * ⚠️ ГРАНИЦА ПО РУКЕ, ИЗМЕРЕНА, А НЕ ПРЕДПОЛОЖЕНА: прибор работает рукой владельца клона.
 * Замер 05.09.2026 (obeimi-rukami): моей рукой код 0, рукой claude — код 2, «unable to
 * open loose object … Permission denied». Это НЕ дефект прибора и НЕ повод раздавать
 * права на клон: слепота честная, с названной причиной, и ведёт себя как «нельзя».
 * Кому нужен ответ — либо свой клон, либо спросить владельца.
 * EN: THE SET'S COMPOSITION BY CONDITION, NOT BY NUMBER.
 *     🔴 WHY. On 05.09.2026 the coordinator named the number to build the set on three times in forty-seven
 *     minutes (a31 → a32 → a33), and was right each time AT THE MOMENT OF WRITING: the gates work, each round
 *     produces an improvement, the improvement moves the subject. The coordinator's conclusion — stop naming a
 *     number and name a CONDITION: "the last ACCEPTED version at build time". A condition does not go stale, a
 *     number does. This tool is the execution of the condition.
 *     🔴 TWO SOURCES, NOT ONE, AND THEY DIVERGE.
 *     acceptance — the verdict commit in the tree (git), not a letter and not a registry tag;
 *     reachability — the version in npm: the set declares EXACT numbers, and a version missing from the
 *     registry makes the set UNINSTALLABLE for an outsider (verified by fact on 05.09: `npm i
 *     dsh-pamyat-secretary@0.1.0-alpha.18` → notarget).
 *     So the last version that is ACCEPTED AND PUBLISHED is taken, and a divergence ("accepted newer than
 *     published") is printed LOUDLY: this is the price of the milestone rule, and it must be visible as a
 *     number, not discovered at the next build.
 *     WHAT THE TOOL DOES NOT DO:
 *     · it does not build the set or edit the manifest — it only says what to take;
 *     · it does not judge whether a verdict is good: it reads the fact of the commit, not its content;
 *     · it does not know about conditional verdicts ("accepted conditionally") — for it that is accepted, and
 *     this is STATED here, not left to guesswork.
 *     CODES: 0 — composition determined · 2 — blindness (the tree or the registry cannot be read).
 *     ⚠️ A HAND BOUNDARY, MEASURED, NOT ASSUMED: the tool works with the hand of the clone's owner. Measured
 *     05.09.2026 (obeimi-rukami): with my hand code 0, with another account's hand code 2, "unable to open
 *     loose object … Permission denied". This is NOT a tool defect and NOT a reason to hand out rights to the
 *     clone: the blindness is honest, with a named cause, and behaves as "not allowed". Whoever needs the
 *     answer — either their own clone, or ask the owner.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение ключа.
// Путь меняет переменная DSH_PAMYAT_STOROZHA_CONF. Порядок: довод/переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
// EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
//     comment; the last occurrence of a key wins.
//     The DSH_PAMYAT_STOROZHA_CONF variable changes the path. Order: argument/variable → file → neutral
//     default; nothing at all — BLINDNESS, code 2.
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };

const KLON = konf('DSH_PLUGINS_KLON');
if (!KLON) { console.log('СЛЕПОТА: клон дерева пакетов не задан — ключ DSH_PLUGINS_KLON в ' + KONF); process.exit(2); }
// 🔴 СОСТАВ БЕРЁТСЯ У САМОГО НАБОРА, А НЕ ВШИВАЕТСЯ (05.09.2026).
// Признак дефекта он назвал точнее меня: беда не в том, что нет строки охвата, а в том, что
// прибор идёт ПО СПИСКУ и не говорит, по какому. Вшитый перечень совпадает с действительным
// ровно до первого изменения набора — и тогда прибор скажет «шесть из шести», не заметив
// седьмого. Источник правды о составе набора — его манифест.
// ⚠️ ЗАПАСНОЙ СПИСОК ЕСТЬ, НО ПЕРЕХОД НА НЕГО КРИЧИТ. Молчаливый переход на вшитое — тот
// самый случай, на котором ферма 30.06 потеряла инстанс: список брался из памяти, а не из
// файла, и об этом никто не узнал.
// EN: 🔴 THE COMPOSITION IS TAKEN FROM THE SET ITSELF, NOT HARD-CODED (05.09.2026).
//     The reviewer named the defect's sign more precisely than I did: the trouble is not a missing coverage
//     line but that the tool goes BY A LIST and does not say which. A hard-coded list matches the real one
//     exactly until the first change to the set — and then the tool says "six of six" without noticing the
//     seventh. The source of truth about the set's composition is its manifest.
//     ⚠️ A FALLBACK LIST EXISTS, BUT SWITCHING TO IT SHOUTS. A silent switch to the hard-coded list is the very
//     case in which the farm lost an instance on 30.06: the list came from memory, not from the file, and
//     nobody found out.
const ZAPASNOJ = ['core', 'omega', 'secretary', 'byudzhet', 'nudzh', 'restore'];
const MANIFEST_NABORA = KLON + '/packages/dsh-pamyat/package.json';
let CHLENY, otkuda_sostav;
try {
  const m = JSON.parse(readFileSync(MANIFEST_NABORA, 'utf8'));
  CHLENY = Object.keys(m.dependencies || {})
    .filter((n) => n.startsWith('dsh-pamyat-'))
    .map((n) => n.replace(/^dsh-pamyat-/, ''));
  if (CHLENY.length === 0) throw new Error('в манифесте набора нет членов dsh-pamyat-*');
  otkuda_sostav = `манифест набора (${CHLENY.length} членов)`;
} catch (e) {
  CHLENY = ZAPASNOJ;
  otkuda_sostav = `🔴 ЗАПАСНОЙ ВШИТЫЙ СПИСОК (${CHLENY.length}) — манифест набора не прочитан: ${e.message}. `
    + 'Состав набора мог измениться, и этого не видно';
}

const nomer = (v) => Number(String(v).split('.').pop());

function verdikty() {
  // 🔴 ФОРМА ЗАПИСИ ВЕРДИКТОВ НЕ ЕДИНАЯ, И ИМЕННО В ЭТОМ БЫЛА БЕДА (05.09.2026).
  // Рядом живут «core alpha.33» и «byudzhet a8 · omega a10 · restore a17 · secretary a15»
  // одной строкой на четверых. Первая редакция искала только «alpha.N» и объявила
  // «вердикта нет» про omega и byudzhet, принятые сутки назад. Ответ был про мой запрос,
  // а не про предмет, — а «вердикта нет» читается как «не принято».
  //
  // ⚠️ ЧЕСТНО О СВОЁМ ДИАГНОЗЕ: сперва я решила, что причина в ИСТОЧНИКЕ (читала
  // заголовки коммитов, а не таблицу в файле), и починила оба места разом. Порча
  // показала, что источник ни при чём: убрать чтение файлов — «вердикта нет» НЕ
  // появляется, обе краткие формы есть и в заголовках. Причина была одна — форма.
  // Чтение файлов оставлено намеренно: таблица подробнее и переживает переписывание
  // заголовков, — но это ЗАПАС, а не лечение, и путать их нельзя.
  // EN: 🔴 THE FORM OF VERDICT RECORDS IS NOT UNIFORM, AND THAT WAS EXACTLY THE TROUBLE (05.09.2026).
  //     Side by side live "core alpha.33" and "byudzhet a8 · omega a10 · restore a17 · secretary a15" in one
  //     line for four. The first edition looked only for "alpha.N" and declared "no verdict" for omega and
  //     byudzhet, accepted a day earlier. The answer was about my query, not about the subject — and "no
  //     verdict" reads as "not accepted".
  //     ⚠️ HONESTLY ABOUT MY OWN DIAGNOSIS: at first I decided the cause was the SOURCE (I read commit titles,
  //     not the table in the file) and fixed both places at once. Corruption showed the source was irrelevant:
  //     remove the file reading — "no verdict" does NOT appear, both short forms are in the titles too. There
  //     was one cause — the form. File reading is kept on purpose: the table is more detailed and survives
  //     rewritten titles — but it is a RESERVE, not the cure, and the two must not be confused.
  let tekst = '', svezhest = 'обновлена';
  try {
    // 🔴 ОБНОВЛЕНИЕ НЕОБЯЗАТЕЛЬНО, НО ЕГО ОТСУТСТВИЕ НАЗЫВАЕТСЯ. Прибор зовут чужие руки,
    // а fetch требует моего доступа: падать на этом значило бы отдать соседям инструмент,
    // который у них не работает вовсе. Читаем то, что есть локально, и ГОВОРИМ, что
    // свежесть не обновлена, — иначе старый срез неотличим от сегодняшнего.
    // EN: 🔴 UPDATING IS OPTIONAL, BUT ITS ABSENCE IS NAMED. Other hands call the tool, and fetch requires my
    //     access: failing on that would give neighbours a tool that does not work for them at all. We read what
    //     is available locally and SAY that freshness was not updated — otherwise an old snapshot is
    //     indistinguishable from today's.
    try { execFileSync('git', ['-C', KLON, 'fetch', 'origin', '-q'], { stdio: 'ignore' }); }
    catch { svezhest = 'НЕ ОБНОВЛЕНА (fetch не прошёл — читаю то, что было получено раньше)'; }
    for (const f of ['docs/MEMORY-AND-A2A.ru.md', 'docs/MEMORY-AND-A2A.md']) {
      try { tekst += execFileSync('git', ['-C', KLON, 'show', `origin/master:${f}`], { encoding: 'utf8' }); }
      catch { /* редакции может не быть — вторая половина ответит · EN: the edition may be missing — the second half will answer */ }
    }
    tekst += execFileSync('git', ['-C', KLON, 'log', 'origin/master', '--format=%s', '-200'], { encoding: 'utf8' });
  } catch (e) {
    console.error(`СЛЕПОТА: дерево вердиктов не читается — ${e.message}`);
    console.error('  Это НЕ значит «вердиктов нет»: значит их не видно отсюда.');
    process.exit(2);
  }
  if (!/принят|accepted/i.test(tekst)) {
    console.error('СЛЕПОТА: в прочитанном НЕТ НИ ОДНОГО слова о приёмке — читаем не то место.');
    process.exit(2);
  }
  const m = new Map();
  const chleny = CHLENY.map(n => [...n].map(c => ".*+?^${}()|[]\\".includes(c) ? "\\" + c : c).join('')).join('|');
  const maska = new RegExp("\\b(" + chleny + ")\\s+(?:0\\.1\\.0-alpha\\.|alpha\\.|a|1\\.1\\.)(\\d+)\\b", 'g');
  for (const stroka of tekst.split('\n')) {
    if (!/принят|accepted/i.test(stroka)) continue;
    if (/НЕ ПРИНЯТ|not accepted|rejected/i.test(stroka)) continue;
    // A-N-1562 (04.10.2026, Заря): перенумерация 0.1.0-alpha.N → 1.1.N. Номер N — последнее число в обеих формах,
    // поэтому вердикт читается в любой: «alpha.N», «aN», «0.1.0-alpha.N», «1.1.N». Новая форма — узко «1.1.N»: шире
    // («X.Y.N») подхватило бы чужие номера вроде вендорской «omega 1.5.19». ⚠️ При смене минора (1.2.0) — пересмотреть
    // вместе с nomer(): он сравнивает только последнее число.
    for (const [, chlen, ver] of stroka.matchAll(maska)) {
      const n = Number(ver);
      if (!m.has(chlen) || m.get(chlen) < n) m.set(chlen, n);
    }
  }
  return { prin: m, svezhest };
}

async function v_reestre(imya) {
  const r = await fetch(`https://registry.npmjs.org/dsh-pamyat-${imya}`);
  if (!r.ok) throw new Error(`реестр ответил ${r.status}`);
  const d = await r.json();
  return Object.keys(d.versions).sort((a, b) => nomer(a) - nomer(b));
}

const { prin, svezhest } = verdikty();
console.log(`состав набора по УСЛОВИЮ «последняя принятая И опубликованная», снято ${new Date().toISOString()}`);
console.log('источники: принятость — вердикты в origin/master; достижимость — реестр npm');
console.log(`свежесть дерева: ${svezhest}`);
console.log(`состав взят: ${otkuda_sostav}`);
// 🔴 ВОЗРАСТ РУБЕЖА — ЧИСЛОМ. Дата читается как свежая, пока не вычтешь в уме.
// EN: 🔴 THE BOUNDARY'S AGE — AS A NUMBER. A date reads as fresh until you subtract in your head.
try {
  const kogda = execFileSync('git', ['-C', KLON, 'log', 'origin/master', '-1', '--format=%ct'], { encoding: 'utf8' }).trim();
  const minut = Math.round((Date.now() / 1000 - Number(kogda)) / 60);
  console.log(`последний вердикт в дереве: ${minut} мин назад` + (minut > 60 ? '  ⚠️ старше часа — ответ может быть неполон' : '') + '\n');
} catch { console.log('возраст рубежа не снят\n'); }

let otstalo = 0;
for (const chlen of CHLENY) {
  let versii;
  try { versii = await v_reestre(chlen); }
  catch (e) { console.log(`  ${chlen.padEnd(10)} СЛЕПОТА: ${e.message}`); process.exitCode = 2; continue; }

  const prinyata = prin.get(chlen);   // ЧИСЛО последней принятой (может не быть в npm) · EN: NUMBER of the last accepted (may be absent from npm)
  const est = new Set(versii.map((v) => v.replace(/^0\.1\.0-/, '')));
  // Берём последнюю принятую, которая ЕСТЬ в реестре. Идём вниз от принятой: между
  // ней и опубликованной может лежать несколько невыпущенных.
  // EN: We take the last accepted version that IS in the registry. We go down from the accepted one: several
  //     unreleased ones may lie between it and the published one.
  let berem = null;
  if (prinyata) {
    for (const v of [...versii].reverse()) {
      const kratko = v.replace(/^0\.1\.0-/, '');
      if (nomer(kratko) <= prinyata && est.has(kratko)) { berem = v; break; }
    }
  }
  const stroka = `  ${chlen.padEnd(10)} принято ${(prinyata ? '№' + prinyata : 'вердикта нет').padEnd(11)} · в реестре до ${versii[versii.length - 1].replace(/^0\.1\.0-/, '')} · БЕРЁМ ${berem ? berem.replace(/^0\.1\.0-/, '') : '— нечего'}`;
  if (prinyata && berem && prinyata > nomer(berem.replace(/^0.1.0-/, ''))) {
    otstalo++;
    console.log(`${stroka}   🔴 принято НОВЕЕ, чем опубликовано`);
  } else {
    console.log(stroka);
  }
}

if (otstalo) {
  console.log(`\n🔴 у ${otstalo} членов принятое НЕ ОПУБЛИКОВАНО — набор понесёт не лучшее, что принято.`);
  console.log('   Это цена правила вех, а не оплошность: набор объявляет ТОЧНЫЕ номера, и версия,');
  console.log('   которой нет в реестре, делает набор неустановимым у постороннего.');
} else {
  console.log('\nвсё принятое опубликовано — набор понесёт лучшее, что принято.');
}

// ═══ ВЫДЕРЖКА: УСТАКАНИЛАСЬ ЛИ СЕРИЯ (условие координатора 05.09.2026 12:07 МСК) ═══
//
// УСЛОВИЕ ДОСЛОВНО: собирать, когда последняя принятая версия ядра держится БЕЗ НОВОГО
// ВЫПУСКА 60 минут; вышла новая — отсчёт заново, но не более трёх кругов; после третьего
// собирать на том, что принято, и сказать об этом строкой.
// ЗАЧЕМ ЗДЕСЬ, А НЕ В ПАМЯТИ ТОГО, КТО СОБИРАЕТ: условие с числом внутри исполняется
// вниманием ровно до первого занятого часа. Здесь его считает команда.
//
// 🔴 КРУГИ СЧИТАЮТСЯ ПО ДАННЫМ, А НЕ ПАМЯТЬЮ ПРИБОРА. Круг — это выпуск, сбросивший
// отсчёт, то есть просто выпуск за последний час. Прибор со своим счётчиком «сколько раз
// я уже ждал» завёл бы состояние, которое расходится с действительностью молча: сбросили
// файл — и три круга стали нулём. Здесь считать нечего: теги в дереве и есть след.
//
// ⚠️ ГРАНИЦА: время выпуска берётся по ТЕГУ в дереве, а не по реестру npm. По правилу вех
// в npm попадает не каждая версия, и «в реестре её нет» не значит «не выпускали». Нет
// тегов вовсе — это СЛЕПОТА, а не «выпусков не было».
// EN: ═══ SETTLING PERIOD: HAS THE SERIES SETTLED (coordinator's condition of 05.09.2026 12:07 MSK) ═══
//     THE CONDITION VERBATIM: build when the last accepted core version holds WITHOUT A NEW RELEASE for 60
//     minutes; a new one appears — the countdown restarts, but no more than three rounds; after the third,
//     build on what is accepted and say so in a line.
//     WHY HERE, NOT IN THE MEMORY OF WHOEVER BUILDS: a condition with a number inside is executed by attention
//     only until the first busy hour. Here a command counts it.
//     🔴 ROUNDS ARE COUNTED FROM DATA, NOT FROM THE TOOL'S MEMORY. A round is a release that reset the
//     countdown, i.e. simply a release within the last hour. A tool with its own counter "how many times have I
//     waited" would create state that silently diverges from reality: reset the file — and three rounds become
//     zero. Here there is nothing to count: the tags in the tree are the trace.
//     ⚠️ BOUNDARY: the release time is taken from the TAG in the tree, not from the npm registry. By the
//     milestone rule not every version reaches npm, and "not in the registry" does not mean "not released". No
//     tags at all is BLINDNESS, not "there were no releases".
function vyderzhka() {
  const CHAS = 60 * 60 * 1000;
  let stroki;
  // 🔴 КОРЕНЬ ТЕГОВ ОТДЕЛЬНЫМ КЛЮЧОМ — РАДИ ПРОВЕРКИ ВЕТОК, И ЭТО НАЗВАНО.
  // Три из четырёх исходов («выдержал», «третий круг», «слепота») на живом дереве не
  // достижимы: там ровно одно состояние в каждый миг. Без крючка они проверялись бы
  // только ожиданием часа — то есть никогда. Ключ меняет ТОЛЬКО источник тегов; вердикты
  // и реестр по-прежнему берутся у настоящего клона, и подмена не делает вывод зелёным.
  // EN: 🔴 THE TAG ROOT IS A SEPARATE KEY — FOR CHECKING BRANCHES, AND THIS IS STATED.
  //     Three of four outcomes ("held", "third round", "blindness") are unreachable on the live tree: it has
  //     exactly one state at any moment. Without a hook they could be checked only by waiting an hour — that
  //     is, never. The key changes ONLY the tag source; verdicts and the registry are still taken from the real
  //     clone, and the substitution does not make the conclusion green.
  const KLON_TEGOV = process.env.KLON_TEGOV || KLON;
  // 🔴 ОБЕ ФОРМЫ ИМЁН, И ЧИСЛО ПО КАЖДОЙ — В ВЫВОД (решение координатора 06.09.2026 после
  // ТРЁХ срабатываний класса за два часа: у трёх разных рук, включая приёмку). На origin живут
  // две схемы одновременно: новая dsh-pamyat-core-v0.1.0-alpha.NN (42 тега) и старая
  // core-aNN (6 тегов). Прежняя маска знала ОДНУ — и молчаливый ноль по второй читался бы
  // как «выпусков не было». Здесь это решало бы, можно ли собирать набор: пропущенный
  // выпуск = сборка на движущейся цели.
  // Старые теги НЕ переименовываем (рвутся ссылки, на них уже сослались) — значит форму
  // надо не чинить, а ЗНАТЬ обе.
  // EN: 🔴 BOTH NAME FORMS, AND THE COUNT FOR EACH — IN THE OUTPUT (coordinator's decision of 06.09.2026 after
  //     THREE triggers of the class in two hours: by three different hands, including acceptance). Two schemes
  //     live on origin at once: the new dsh-pamyat-core-v0.1.0-alpha.NN (42 tags) and the old core-aNN (6
  //     tags). The previous mask knew ONE — and a silent zero for the second would read as "there were no
  //     releases". Here that would decide whether the set may be built: a missed release = building on a moving
  //     target.
  //     We do NOT rename old tags (links break, they are already referenced) — so the form must not be fixed
  //     but KNOWN in both variants.
  const MASKI = [
    { imya: 'новая (dsh-pamyat-core-v*)', maska: 'refs/tags/dsh-pamyat-core-v*' },
    { imya: 'старая (core-a*)',           maska: 'refs/tags/core-a*' },
  ];
  const po_formam = [];
  const chasti = [];
  for (const m of MASKI) {
    let vyvod;
    try {
      vyvod = execFileSync('git', ['-C', KLON_TEGOV, 'for-each-ref', '--sort=-creatordate',
        '--format=%(refname:short) %(creatordate:iso-strict)', m.maska],
        { encoding: 'utf8' }).trim();
    } catch (e) { return { slepota: `теги ядра формы «${m.imya}» не читаются: ` + String(e.message).slice(0, 90) }; }
    const n = vyvod ? vyvod.split('\n').length : 0;
    po_formam.push(`${m.imya}: ${n}`);
    if (vyvod) chasti.push(vyvod);
  }
  stroki = chasti.join('\n');
  if (!stroki) return { slepota: 'тегов ядра в дереве нет НИ ОДНОЙ формы — когда был выпуск, сказать нечем', po_formam };
  const vypuski = stroki.split('\n').map((s) => {
    const [imya, kogda] = s.split(' ');
    return { imya, kogda: Date.parse(kogda) };
  }).filter((v) => Number.isFinite(v.kogda));
  if (!vypuski.length) return { slepota: 'время тегов не разобралось', po_formam };
  // склеены ДВЕ выборки, каждая своей сортировки — пересортировать обязательно,
  // иначе «последний выпуск» будет последним ВНУТРИ первой формы, а не вообще.
  // EN: TWO selections are glued together, each with its own sort — re-sorting is mandatory, otherwise "the
  //     last release" will be the last WITHIN the first form, not overall.
  vypuski.sort((a, b) => b.kogda - a.kogda);
  const teper = Date.now();
  const posledniy = vypuski[0];
  const proshlo = teper - posledniy.kogda;
  const za_chas = vypuski.filter((v) => teper - v.kogda < CHAS).length;
  return { posledniy, proshlo_min: Math.round(proshlo / 60000), za_chas, vyderzhal: proshlo >= CHAS, po_formam };
}

const v = vyderzhka();
console.log('');
if (v.po_formam) console.log('  тегов ядра по формам имени — ' + v.po_formam.join(' · ') +
  '  (ищем ОБЕ: молчаливый ноль по одной форме есть слепота, а не отсутствие)');
if (v.slepota) {
  console.log('ВЫДЕРЖКА СЕРИИ: СЛЕПОТА — ' + v.slepota);
  console.log('  Это «не смотрели», а не «серия устаканилась». Собирать вслепую — значит закрепить неизвестно что.');
  process.exitCode = 2;
} else if (v.vyderzhal) {
  console.log(`ВЫДЕРЖКА СЕРИИ: ✅ последний выпуск ядра (${v.posledniy.imya}) был ${v.proshlo_min} мин назад — больше часа.`);
  console.log('  Условие выполнено: серия устаканилась, набор можно собирать.');
} else if (v.za_chas >= 3) {
  console.log(`ВЫДЕРЖКА СЕРИИ: ⚠️ ТРЕТИЙ КРУГ — за час выпусков ядра ${v.za_chas}, последний ${v.proshlo_min} мин назад.`);
  console.log('  Условие координатора: после третьего круга собирать на том, что принято, и сказать строкой.');
  console.log('  Говорю строкой: серия НЕ устаканилась, набор закрепляет принятое на этот час, а не итог серии.');
} else {
  console.log(`ВЫДЕРЖКА СЕРИИ: 🔴 НЕ СОБИРАТЬ — последний выпуск ядра (${v.posledniy.imya}) был ${v.proshlo_min} мин назад.`);
  console.log(`  Ждать ещё ${60 - v.proshlo_min} мин; выпусков за час: ${v.za_chas} из 3, после третьего ждать перестаём.`);
  console.log('  Собранный сейчас набор закрепил бы версию, которую серия ещё двигает.');
  process.exitCode = 1;
}

