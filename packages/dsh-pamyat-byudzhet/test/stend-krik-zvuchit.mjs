/**
 * RU: Стенд звука: отказ бюджета должен быть СЛЫШЕН в настоящем потоке вывода.
 *     Проверяется КОНЕЧНЫЙ результат — строка в stderr отдельного процесса под настоящим Context, а не факт
 *     вызова функции вывода. Причина — в src/index.js, «знаемое про вывод»: ctx.logger cordis 4.0.1 есть, вызов
 *     проходит, а сообщение ложится в кольцевой буфер внутри процесса и наружу не выходит.
 *     Запуск: node test/stend-krik-zvuchit.mjs; код 0 — всё зелёное, 1 — красные, 2 — слепота (зависимости не
 *     установлены).
 * EN: Sound stand: a budget refusal must be AUDIBLE in the real output stream.
 *     The END result is checked — a line in the stderr of a separate process under a real Context — not the
 *     fact that an output function was called. The reason is in src/index.js, "known about output": cordis
 *     4.0.1 has ctx.logger, the call succeeds, but the message lands in an in-process ring buffer and never
 *     leaves.
 *     Run: node test/stend-krik-zvuchit.mjs; exit 0 — all green, 1 — red, 2 — blindness (dependencies not
 *     installed).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
const NAZVANIE = 'dsh-pamyat-byudzhet';
let vsego = 0, proshlo = 0;
// RU: ОБЁРТКА УЧИТЫВАЕТ ВОЗВРАТ ТЕЛА. Прежняя редакция краснела только на ИСКЛЮЧЕНИИ и выбрасывала возврат:
//     проба в идиоме «вернуть причину строкой» была бы зелёной при любом содержимом. Правится при касании
//     стенда, не отдельным походом (решение координатора).
// EN: THE WRAPPER COUNTS THE BODY'S RETURN. The earlier version turned red only on an EXCEPTION and discarded
//     the return value: a probe in the "return the reason as a string" idiom would be green whatever it
//     contained. Fixed when the stand is touched, not in a separate pass (coordinator's decision).
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  try {
    // RU: Проверки вида возвращённого значения ниже были бы мёртвыми: sud() строже их всех — он бросает на
    //     ЛЮБОМ возврате, кроме undefined и true. Недостижимый код читается как действующая проверка, поэтому
    //     его здесь нет.
    // EN: Checks of the returned value's kind would be dead below: sud() is stricter than all of them — it
    //     throws on ANY return except undefined and true. Unreachable code reads as an active check, so there
    //     is none here.
    sud(f());
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

// RU: СЛЕПОТА, А НЕ РАСХОЖДЕНИЕ. Без установленных зависимостей дочерний процесс не поднимется вовсе, и первая
//     же проба сообщила бы «не поднялся» — код 1, то есть «предмет сломан». Это неправда: проверить не удалось.
//     Спрашиваем ОДИН раз и отвечаем словами с кодом 2.
// EN: BLINDNESS, NOT A MISMATCH. Without installed dependencies the child process does not start at all, and
//     the very first probe would report "did not start" — exit 1, i.e. "the subject is broken". That is untrue:
//     the check could not be made. We ask ONCE and answer in words with exit 2.
{
  const rProba = podnyat("import '@deepseek-ai/cordis';")
  if (/ERR_MODULE_NOT_FOUND/.test(rProba.stderr)) {
    console.log('СЛЕПОТА: предмет не загрузился — не установлены зависимости пакета')
    console.log('  Выполните `npm install` в каталоге пакета и повторите.')
    process.exit(2)
  }
}

// RU: Служба появляется НЕ СРАЗУ: cordis применяет плагин асинхронно, и сразу после k.plugin(...) контекст её
//     ещё не знает. Первая редакция стенда спрашивала синхронно и красила ИСПРАВНЫЙ пакет — стенд был негоден,
//     а выглядело это как «пакет не публикует службу». Поймала проба на заведомо исправном.
// EN: The service does NOT appear immediately: cordis applies the plugin asynchronously, and right after
//     k.plugin(...) the context does not know it yet. The first version of the stand asked synchronously and
//     painted a CORRECT package red — the stand was broken, but it looked like "the package does not publish
//     the service". Caught by the known-good probe.
const OSNOVA = (telo) => `
  import { Context } from '@deepseek-ai/cordis';
  import { name, Config, apply } from './src/index.js';
  const k = new Context();
  const kogdaGotovo = (f) => setTimeout(f, 50);
  ${telo}
`;

proba('стенд годен: бюджет поднимается на настоящем Context', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 100 });
    kogdaGotovo(() => console.log('PODNYALSYA', typeof k.byudzhetPamyati?.otobrat));
  `));
  if (!/PODNYALSYA function/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 200));
});

proba('ПРЕДПОСЫЛКА: настоящий ctx.logger ЕСТЬ и НЕМ', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    if (typeof k.logger?.error !== 'function') { console.log('NET-LOGGERA'); process.exit(0); }
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
    console.log('EST-I-NEM');
  `);
  if (/NET-LOGGERA/.test(r.stdout)) throw new Error('логгера нет — платформа сменилась');
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) throw new Error('логгер СТАЛ звучать — перечитать вместе с krik');
});

proba('ГЛАВНОЕ: «поднято НЕ ВСЁ» слышно в stderr настоящего процесса', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 20 });
    kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [
      { soderzhim: 'а'.repeat(300), sozdano: 2, vera: null },
      { soderzhim: 'б'.repeat(300), sozdano: 1, vera: 0.1 },
    ] }));
  `));
  if (!/dsh-pamyat-byudzhet/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/поднято НЕ ВСЁ/.test(r.stderr)) throw new Error('отброс прошёл молча: ' + r.stderr.slice(0, 200));
});

proba('в громком отказе НАЗВАНЫ причины и сказано, что единицы НЕ токены', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 20 });
    kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [{ soderzhim: 'а'.repeat(300), sozdano: 1, vera: null }] }));
  `));
  if (!/НЕИЗМЕРЕННОЙ верой/.test(r.stderr)) throw new Error('причина не названа: ' + r.stderr.slice(0, 200));
  if (!/НЕ токены/.test(r.stderr)) throw new Error('не сказано, что единицы свои: ' + r.stderr.slice(0, 200));
});

proba('НУЛЕВОЙ ПРЕДЕЛ: молчаливого «памяти нет» не бывает', () => {
  const r = podnyat(OSNOVA(`k.plugin({ name, Config, apply }, { predel: 0 });`));
  if (!/НЕ БУДЕТ подниматься/.test(r.stderr)) throw new Error('нулевой предел поднялся молча');
});

// RU: ВЕРСИЯ В СТРОКЕ ПОДЪЁМА СВЕРЯЕТСЯ С МАНИФЕСТОМ, А НЕ С ШАБЛОНОМ. По журналу должно быть видно, какую
//     редакцию держит процесс. Проба сравнивает напечатанное с package.json — иначе версия-константа прошла бы
//     её, а при следующем выпуске строка утверждала бы номер, которому предмет не соответствует.
//     Где не работает: не проверяет, что строка подъёма безусловна (это соседняя проба), и не заметит, если
//     манифест сам врёт про свою версию.
// EN: THE VERSION IN THE START-UP LINE IS CHECKED AGAINST THE MANIFEST, NOT A PATTERN. The log must show which
//     revision the process holds. The probe compares the printed text with package.json — otherwise a constant
//     version would pass, and at the next release the line would claim a number the subject does not match.
//     Where it does not work: it does not check that the start-up line is unconditional (a neighbouring probe
//     does), and will not notice if the manifest itself lies about its version.
proba('версия в строке подъёма взята из СВОЕГО манифеста', () => {
  const { version } = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf8'));
  // RU: Плагин надо ПОДНЯТЬ: пустое тело даёт процесс, который ничего не монтирует, и «своих строк нет»
  //     означало бы «мы его не звали», а не «он молчит».
  // EN: The plugin must be MOUNTED: an empty body gives a process that mounts nothing, and "no lines of its
  //     own" would mean "we never called it", not "it is silent".
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 2000 });
    kogdaGotovo(() => {});
  `));
  if (!r.stderr.includes('[' + NAZVANIE + ' ' + version + ']'))
    throw new Error(`в stderr нет «[${NAZVANIE} ${version}]»; напечатано: ` +
      (r.stderr.split('\n').find((l) => l.includes(NAZVANIE)) ?? '(ни одной своей строки)'));
});


// RU: ═══ ОБЛАСТЬ И МОМЕНТ В СТРОКЕ КАСАНИЙ ═══
//     Пара проб: первая требует, чтобы область и момент были НАЗВАНЫ; вторая — чтобы строка не утверждала о
//     памяти. Ось, ради которой пара существует: прежняя строка «поле есть у 10, касались хоть раз 0» была
//     ВЕРНА про выборку и читалась как «счётчик мёртв», хотя живая база в тот же день дала «касались 9 записей
//     из 189». Шире измеренного её прочли двое, включая автора.
// EN: ═══ SCOPE AND MOMENT IN THE TOUCH LINE ═══
//     A pair of probes: the first requires the scope and moment to be NAMED; the second — that the line makes
//     no claim about memory. The axis the pair exists for: the earlier line "field present in 10, touched at
//     least once 0" was TRUE about the sample and read as "the counter is dead", while the live database that
//     day gave "9 of 189 records touched". Two readers, including the author, read it wider than measured.

/**
 * RU: Один отбор с записями, у которых поле касаний ЕСТЬ и равно нулю.
 * EN: One selection with records whose touch field EXISTS and equals zero.
 */
const OTBOR_S_KASANIYAMI = OSNOVA(`
  k.plugin({ name, Config, apply }, { predel: 2000 });
  kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [
    { soderzhim: 'первая запись', sozdano: 2, vera: 0.8, kasanij: 0, poslednee_kasanie: null },
    { soderzhim: 'вторая запись', sozdano: 1, vera: 0.8, kasanij: 0, poslednee_kasanie: null },
  ] }));
`);

proba('строка касаний НАЗЫВАЕТ область (этот отбор) и момент (до выдачи)', () => {
  const r = podnyat(OTBOR_S_KASANIYAMI);
  const stroka = (r.stderr.split('\n').find((x) => /касания/.test(x)) ?? '');
  if (!stroka) return 'строки касаний нет вовсе: ' + r.stderr.slice(0, 200);
  if (!/В ЭТОМ ОТБОРЕ/.test(stroka)) return 'область не названа: ' + stroka.slice(0, 200);
  if (!/кандидатов/.test(stroka)) return 'не сказано, что это кандидаты отбора: ' + stroka.slice(0, 200);
  if (!/ДО выдачи/.test(stroka)) return 'момент не назван: ' + stroka.slice(0, 200);
});

proba('ВТОРАЯ ПОЛОВИНА: строка прямо отрицает, что она про память', () => {
  const r = podnyat(OTBOR_S_KASANIYAMI);
  const stroka = (r.stderr.split('\n').find((x) => /касания/.test(x)) ?? '');
  if (!stroka) return 'строки касаний нет вовсе';
  if (!/НЕ про память/.test(stroka)) return 'нет оговорки про память: ' + stroka.slice(0, 200);
  if (!/restore/.test(stroka)) return 'не сказано, кто ставит отметку ПОСЛЕ: ' + stroka.slice(0, 200);
});

proba('ветка «поля нет вовсе» тоже говорит про ОТБОР, а не про память', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 2000 });
    kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [
      { soderzhim: 'старое ядро', sozdano: 1, vera: 0.8 },
    ] }));
  `));
  const stroka = (r.stderr.split('\n').find((x) => /касания/.test(x)) ?? '');
  if (!stroka) return 'строки касаний нет вовсе';
  if (!/поля НЕТ ни у одной записи ЭТОГО отбора/.test(stroka)) return 'область не названа: ' + stroka.slice(0, 200);
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
