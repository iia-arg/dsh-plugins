/**
 * RU: СТЕНД ВЫВОЗА И ВВОЗА — по воротам приёмки для этапа Э8.5.
 * EN: EXPORT AND IMPORT TEST STAND — built against the acceptance gate for stage E8.5.
 *
 * RU: Вход: аргументов нет. Ядро dsh-pamyat-core ищется в соседнем каталоге пакетов
 *     (../../dsh-pamyat-core/src/filtr-vhoda.js); базы и файлы — во временном каталоге.
 *     Выход: код 0 — все пробы зелёные; 1 — хоть одна красная; 2 — слепота (ядра рядом нет,
 *     проб не было). Условия приёмки В1…В13 по-английски записаны V1…V13.
 * EN: Input: no arguments. The dsh-pamyat-core package is looked up in the sibling packages
 *     directory (../../dsh-pamyat-core/src/filtr-vhoda.js); databases and files live in a temp
 *     directory. Output: exit 0 — all probes green; 1 — at least one red; 2 — blindness (no core
 *     nearby, no probes run). Acceptance conditions В1…В13 are written V1…V13 in English.
 *
 * RU: 🔴 ПРОГОНЩИК ЗДЕСЬ АСИНХРОННЫЙ, И ЭТО НЕ ВКУС. Предмет (вывоз) сам асинхронный:
 *     он await'ит загрузку ядра. Синхронный прогонщик засчитал бы такую пробу МГНОВЕННО,
 *     а брошенное внутри ушло бы в никуда — проба стала бы зелёной при любом содержимом.
 *     Наш класс 04.09.2026: у прогонщика и тела пробы должна совпадать природа.
 *     Обратная защита тоже стоит: проба, вернувшая не-промис, названа вслух.
 * EN: 🔴 THE RUNNER HERE IS ASYNCHRONOUS, AND THAT IS NOT TASTE. The subject (export) is itself
 *     asynchronous: it awaits loading of the core. A synchronous runner would credit such a probe
 *     INSTANTLY, and anything thrown inside would vanish — the probe would be green whatever it
 *     contained. Our defect class of 2026-09-04: the runner and the probe body must be of the same
 *     nature. The reverse guard is in place too: a probe returning a non-promise is named aloud.
 *
 * RU: Чего НЕ ловит: пробы В6 судят ТЕКСТ src/vyvoz.js регулярками, а не поведение — им
 *     безразлично, стоит ли образец в коде или в комментарии; пробы обёртки bin/ зовут node
 *     по имени из PATH, а не тот node, что гонит стенд.
 * EN: What it does NOT catch: the V6 probes judge the TEXT of src/vyvoz.js with regular
 *     expressions, not its behaviour — they cannot tell whether a pattern sits in code or in a
 *     comment; the bin/ wrapper probes invoke node by name from PATH, not the node running the stand.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit,
//     SIGTERM/SIGINT (обходчик гонит стенды через timeout 120). Образец семейства: каждый
//     mkdtemp стенда — через vremennyj().
//     ⚠️ От SIGKILL не спасает ничто; временное, созданное ДОЧЕРНИМ процессом, — забота
//     того процесса.
// EN: The stand's temporary data is removed on ANY exit — normal, a failing probe, process.exit,
//     SIGTERM/SIGINT (the stand crawler runs stands under timeout 120). Family pattern: every
//     mkdtemp of a stand goes through vremennyj().
//     ⚠️ Nothing helps against SIGKILL; temporary data created by a CHILD process is that
//     process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

const zdes = dirname(fileURLToPath(import.meta.url));
const paket = join(zdes, '..', 'src');
const { vyvezti, otchyot } = await import(join(paket, 'vyvoz.js'));
const { vvezti } = await import(join(paket, 'vvoz.js'));
const { NE_VYVOZITSYA, POLYA, VERSIYA_SHEMY, zagolovok } = await import(join(paket, 'shema.js'));
const { vzyat_filtr } = await import(join(paket, 'yadro.js'));

// RU: Фильтр ядра берём ПО ПУТИ: пакет вывоза ставится рядом с ядром, а стенд гоняется
//     и в рабочем каталоге, где разрешения по имени может не быть.
// EN: The core filter is taken BY PATH: the export package is installed next to the core, and
//     the stand also runs in a working tree where resolution by package name may be unavailable.
const YADRO = join(zdes, '..', '..', 'dsh-pamyat-core', 'src', 'filtr-vhoda.js');

// RU: 🔴 НЕТ ЯДРА РЯДОМ — ЭТО СЛЕПОТА (код 2), А НЕ РАСХОЖДЕНИЕ (ворота В10).
//     Ядро — peer-зависимость: у получателя, распаковавшего тарбол в чистом месте, соседнего
//     каталога нет, и раньше стенд давал там 8 КРАСНЫХ проб с текстом «ядро не загрузилось».
//     Красное про исправный пакет неотличимо от красного про дефект — а это разные новости:
//     первая про раскладку у читающего, вторая про предмет. Разводим их КОДОМ ВОЗВРАТА.
//     Проверка идёт ДО первой пробы: узнать об этом на восьмой — значит уже наврать семь раз.
// EN: 🔴 NO CORE NEARBY IS BLINDNESS (exit 2), NOT DIVERGENCE (gate V10).
//     The core is a peer dependency: a receiver who unpacked the tarball in a clean place has no
//     sibling directory, and the stand used to report 8 RED probes there saying "core failed to
//     load". Red about a sound package is indistinguishable from red about a defect — yet these
//     are different news: the first is about the reader's layout, the second about the subject.
//     We separate them by EXIT CODE. The check runs BEFORE the first probe: learning it on the
//     eighth means having lied seven times already.
if (!existsSync(YADRO)) {
  console.log('\n⚠️  СЛЕПОТА: ядро dsh-pamyat-core рядом не найдено.');
  console.log(`    искали: ${YADRO}`);
  console.log('    Это НЕ дефект пакета: ядро — peer-зависимость, её ставит получатель.');
  console.log('    Проверить нечем — поставьте ядро рядом либо в node_modules и повторите.');
  console.log('\n  итог: СЛЕПОТА (проверок не проводилось)');
  process.exit(2);
}

// RU: Обёртка пробы: тело зовётся и ОЖИДАЕТСЯ. Зелёная — только если тело не бросило и
//     вернуло undefined или true; строка в возврате — причина красного, иное значение — тоже красное.
// EN: Probe wrapper: the body is called and AWAITED. Green only if the body did not throw and
//     returned undefined or true; a returned string is the reason for red, any other value is red too.
let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (!(v && typeof v.then === 'function')) {
      console.log('  ⚠️  ' + imya + ' — тело пробы НЕ ожидающее; прогонщик асинхронный, это допустимо, но проверьте намерение');
    }
    const r = await v;
    // RU: 🔴 ВОЗВРАТ ТЕЛА УЧИТЫВАЕТСЯ, А НЕ ВЫБРАСЫВАЕТСЯ (05.09.2026, поймано порчей).
    //     Прежняя обёртка считала пробу пройденной, если тело не БРОСИЛО исключение, —
    //     и всякая проба вида «вернуть true либо строку с причиной» была зелёной ВСЕГДА.
    //     Так были написаны девять новых проб: идиому перенесли из соседнего пакета, а
    //     копирование идиомы переносит и её контекст. Порча (снять renameSync) дала
    //     33 из 33 — вот чем это ловится, а не чтением.
    //     Строка в возврате = причина беды; false = беда без причины; всё прочее
    //     (undefined, true) — как раньше, чтобы старые пробы не сломались.
    // EN: 🔴 THE BODY'S RETURN VALUE IS USED, NOT DISCARDED (2026-09-05, caught by sabotage).
    //     The previous wrapper counted a probe as passed if the body did not THROW —
    //     so every probe of the form "return true or a reason string" was ALWAYS green.
    //     Nine new probes were written that way: the idiom was carried over from a sibling package,
    //     and copying an idiom carries its context along. Sabotage (removing renameSync) gave
    //     33 of 33 — that is how this is caught, not by reading.
    //     A returned string = the reason for the defect; false = a defect without a reason;
    //     everything else (undefined, true) — as before, so old probes keep working.
    // RU: 🔴 ПО УСТРОЙСТВУ, А НЕ ПО ПЕРЕЧНЮ ЗНАЧЕНИЙ (07.09.2026). Перечень (строка, false)
    //     пропускал 0, null, объект и число: прибор obyortka-krasneet показал, что из пяти
    //     подставных форм эта обёртка ловила две, три проходили ЗЕЛЁНЫМИ. Годен один вопрос —
    //     вернуло ли тело что-то, кроме молчания. Строка по-прежнему несёт причину.
    // EN: 🔴 BY DESIGN, NOT BY A LIST OF VALUES (2026-09-07). The list (string, false) let 0, null,
    //     an object and a number through: the obyortka-krasneet tool showed that out of five planted
    //     forms this wrapper caught two, three passed GREEN. Only one question is sound — did the
    //     body return anything other than silence. A string still carries the reason.
    if (typeof r === 'string') throw new Error(r);
    if (r !== undefined && r !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(r).slice(0, 60) +
                      '» — не строка-причина и не молчание; обёртка не должна это глотать');
    }
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};
// RU: Ждёт отказа с ЗАДАННЫМ кодом и отдаёт пойманное исключение; другой код или отсутствие
//     отказа — бросает. Её возврат телу пробы не возвращать: обёртка сочтёт объект красным.
// EN: Expects a refusal with the GIVEN code and returns the caught exception; a different code or
//     no refusal throws. Do not return its result from a probe body: the wrapper treats an object as red.
const dolzhnoUpast = async (kod, f) => {
  try { await f(); } catch (e) {
    if (e.code === kod) return e;
    throw new Error('ожидался код ' + kod + ', получен ' + e.code + ' (' + String(e.message).slice(0, 90) + ')');
  }
  throw new Error('не упало, а должно было (' + kod + ')');
};

const katalog = vremennyj(join(tmpdir(), 'pamyat-vyvoz-'));
const put = (imya) => join(katalog, imya);

const SHEMA_ZAPISEJ = `CREATE TABLE zapisi (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT, klass TEXT, soderzhim TEXT,
  istochnik TEXT, sozdano INTEGER, bez_podtverzhdeniya INTEGER NOT NULL DEFAULT 0,
  vera REAL, ochistka TEXT, podozrenie TEXT)`;

// RU: Временная база со схемой zapisi и заданными записями; недостающее заполняется умолчаниями
//     стенда (agent 'stend', klass 'zametka', istochnik 'sess#i', sozdano 1000+i).
// EN: A temporary database with the zapisi schema and the given records; missing values get the
//     stand's defaults (agent 'stend', klass 'zametka', istochnik 'sess#i', sozdano 1000+i).
function baza(imya, zapisi = []) {
  const p = put(imya + '.db');
  const db = new DatabaseSync(p);
  db.exec(SHEMA_ZAPISEJ);
  const v = db.prepare('INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano) VALUES (?,?,?,?,?)');
  zapisi.forEach((z, i) => v.run(z.agent ?? 'stend', z.klass ?? 'zametka', z.soderzhim, z.istochnik ?? 'sess#' + i, z.sozdano ?? 1000 + i));
  db.close();
  return p;
}
const schyot = (p) => { const db = new DatabaseSync(p, { readOnly: true }); const c = db.prepare('SELECT COUNT(*) c FROM zapisi').get().c; db.close(); return c; };

console.log('\n═══ ВЫВОЗ: ФИЛЬТР ЗОВЁТСЯ, А НЕ ПОВТОРЯЕТСЯ ═══');

// RU: Проверяет: запись с объявленным секретом задержана, вывезена только чистая, текста секрета
//     в файле нет. Ловит: вывоз, который не зовёт фильтр ядра либо пишет задержанное в файл.
// EN: Checks: a record with a declared secret is held back, only the clean one is exported, and the
//     secret text is absent from the file. Catches: an export that skips the core filter or writes held records.
await proba('ГЛАВНОЕ: запись с объявленным секретом НЕ уезжает наружу', async () => {
  const b = baza('sekret', [
    { soderzhim: 'обычное знание про порядок работы' },
    { soderzhim: 'password = Xk9#mQ2$vL8p' },
  ]);
  const f = put('sekret.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: YADRO });
  if (it.zaderzhano !== 1) throw new Error('задержано ' + it.zaderzhano + ', ожидалась 1');
  if (it.vyvezeno !== 1) throw new Error('вывезено ' + it.vyvezeno + ', ожидалась 1');
  const telo = readFileSync(f, 'utf8');
  if (telo.includes('Xk9#mQ2')) throw new Error('🔴 СЕКРЕТ УЕХАЛ В ФАЙЛ');
});

// RU: Три пробы фильтра вывоза по полям: секрет в любом поле договора, кроме soderzhim, задерживается
//     запись, поле названо, в файле секрета нет; незнакомый класс в другом поле останавливает весь вывоз.
// EN: Three per-field export filter probes: a secret in any contract field other than soderzhim holds
//     the record back, the field is named, the file has no secret; an unknown class in another field
//     stops the whole export.
const s_polem = (imya, pole, znachenie) => {
  const b = baza(imya, [{ soderzhim: 'обычное знание' }, { soderzhim: 'второе знание' }]);
  const db = new DatabaseSync(b);
  db.prepare(`UPDATE zapisi SET ${pole} = ? WHERE id = 2`).run(znachenie);
  db.close();
  return b;
};

// RU: Проверяет: секрет в istochnik задерживает запись. Ловит: фильтр, судящий только soderzhim.
// EN: Checks: a secret in istochnik holds the record back. Catches: a filter that judges soderzhim only.
await proba('ВЫВОЗ: секрет в istochnik задержан, поле названо, в файле его нет', async () => {
  const b = s_polem('vyvoz-istochnik', 'istochnik', 'password = Xk9#mQ2$vL8p');
  const f = put('vyvoz-istochnik.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: YADRO });
  if (it.zaderzhano !== 1 || it.vyvezeno !== 1) throw new Error(`задержано ${it.zaderzhano}, вывезено ${it.vyvezeno}; ждали 1 и 1`);
  if (it.zaderzhannye[0]?.pole !== 'istochnik') throw new Error('поле не названо: ' + JSON.stringify(it.zaderzhannye[0]?.pole));
  if (readFileSync(f, 'utf8').includes('Xk9#mQ2')) throw new Error('🔴 СЕКРЕТ ИЗ istochnik УЕХАЛ В ФАЙЛ');
});

// RU: Проверяет: секрет в podozrenie (поле, которое редко смотрят) задерживает запись.
// EN: Checks: a secret in podozrenie (a rarely inspected field) holds the record back.
await proba('ВЫВОЗ: секрет в podozrenie задержан, поле названо, в файле его нет', async () => {
  const b = s_polem('vyvoz-podozrenie', 'podozrenie', 'password = Xk9#mQ2$vL8p');
  const f = put('vyvoz-podozrenie.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: YADRO });
  if (it.zaderzhano !== 1 || it.vyvezeno !== 1) throw new Error(`задержано ${it.zaderzhano}, вывезено ${it.vyvezeno}; ждали 1 и 1`);
  if (it.zaderzhannye[0]?.pole !== 'podozrenie') throw new Error('поле не названо: ' + JSON.stringify(it.zaderzhannye[0]?.pole));
  if (readFileSync(f, 'utf8').includes('Xk9#mQ2')) throw new Error('🔴 СЕКРЕТ ИЗ podozrenie УЕХАЛ В ФАЙЛ');
});

// RU: Проверяет: секрет в поле-BLOB (байты UTF-8 в istochnik) задерживает запись. Ловит: фильтр, видящий
//     BLOB только как массив байтов в JSON (так он уходит в файл) и потому слепой к тексту внутри.
// EN: Checks: a secret in a BLOB field (UTF-8 bytes in istochnik) holds the record back. Catches: a filter that
//     sees a BLOB only as a JSON byte array (the way it goes to the file) and is therefore blind to the text inside.
await proba('ВЫВОЗ: секрет внутри поля-BLOB задержан, поле названо, в файле записи нет', async () => {
  const b = s_polem('vyvoz-blob', 'istochnik', new TextEncoder().encode('password = Xk9#mQ2$vL8p'));
  const f = put('vyvoz-blob.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: YADRO });
  if (it.zaderzhano !== 1 || it.vyvezeno !== 1) throw new Error(`задержано ${it.zaderzhano}, вывезено ${it.vyvezeno}; ждали 1 и 1`);
  if (it.zaderzhannye[0]?.pole !== 'istochnik') throw new Error('поле не названо: ' + JSON.stringify(it.zaderzhannye[0]?.pole));
  const telo = readFileSync(f, 'utf8');
  if (!telo.includes('обычное знание')) throw new Error('СЛЕПОТА пробы: чистой записи в файле нет — проверять отсутствие нечем');
  if (telo.includes('второе знание')) throw new Error('🔴 ЗАПИСЬ С СЕКРЕТОМ В BLOB УЕХАЛА В ФАЙЛ');
});

// RU: Проверяет: запирающий секрет в soderzhim не обрывает просмотр записи — незнакомый класс в istochnik
//     той же записи всё равно останавливает весь вывоз, файла нет.
//     Ловит: просмотр полей, обрывающийся на первом запирающем поле.
// EN: Checks: a locking secret in soderzhim does not end the record's scan — an unknown class in the same
//     record's istochnik still stops the whole export, no file.
//     Catches: a field scan that stops at the first locking field.
await proba('ВЫВОЗ: незнакомый класс в ДРУГОМ поле останавливает вывоз, даже после запирающего', async () => {
  const podstavnoe = put('podstavnoe-yadro-polya.mjs');
  writeFileSync(podstavnoe, `
    export function najti_sekret(t) { if (t.includes('ЧУЖОЕ')) return { klass: 'klass-iz-budushchego', pozicia: 0 };
      return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { if (k === 'obyavlennyj') return 'zapiraet'; return 'neizvesten'; }
  `);
  const b = baza('vyvoz-neizv-pole', [{ soderzhim: 'password = Xk9#mQ2$vL8p', istochnik: 'тут ЧУЖОЕ' }]);
  const fajl = put('vyvoz-neizv-pole.jsonl');
  let upalo = null;
  try { await vyvezti({ otkuda: 'стенд', baza: b, fajl, yadro: podstavnoe }); } catch (e) { upalo = e; }
  if (!upalo) throw new Error('вывоз НЕ остановился: незнакомый класс в istochnik не увиден');
  if (upalo.code !== 'VYVOZ_NEZNAKOMYJ_KLASS') throw new Error('код отказа ' + upalo.code);
  if (existsSync(fajl)) throw new Error('файл вывоза создан, хотя вывоз остановлен');
});

// RU: Проверяет: задержаны три секретные строки разных запирающих классов (объявленный,
//     uuid-объявленный, структурный JWT), чистая заметка уезжает. Ловит: фильтр, узнающий только
//     объявленный секрет. Метки справа от строк — класс, которым ядро должно их опознать.
// EN: Checks: three secret lines of different locking classes (declared, uuid-declared, structural
//     JWT) are held back, the plain note is exported. Catches: a filter that recognises only the
//     declared secret. The labels to the right are the class the core should assign.
await proba('все ЧЕТЫРЕ запирающих класса задерживаются, а не только объявленный', async () => {
  const b = baza('chetyre', [
    { soderzhim: 'password = Xk9#mQ2$vL8p' },                                   // obyavlennyj
    { soderzhim: 'ключ: 550e8400-e29b-41d4-a716-446655440000' },                 // uuid-obyavlennyj
    { soderzhim: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk' }, // strukturnyj:JWT
    { soderzhim: 'просто заметка' },
  ]);
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: put('chetyre.jsonl'), yadro: YADRO });
  if (it.zaderzhano !== 3) throw new Error('задержано ' + it.zaderzhano + ' из трёх секретных; классы: ' + it.zaderzhannye.map((z) => z.klass).join(', '));
});

// RU: Проверяет: класс, неизвестный вывозу, останавливает ВЕСЬ вывоз с кодом VYVOZ_NEZNAKOMYJ_KLASS
//     и именем класса, файла нет. Ловит: вывоз, считающий незнакомое разрешённым.
// EN: Checks: a class unknown to export stops the WHOLE export with VYVOZ_NEZNAKOMYJ_KLASS and the
//     class name, no file is written. Catches: an export that treats the unfamiliar as allowed.
await proba('НЕЗНАКОМЫЙ класс ОСТАНАВЛИВАЕТ ВЕСЬ вывоз, файла нет', async () => {
  const podstavnoe = put('podstavnoe-yadro.mjs');
  writeFileSync(podstavnoe, `
    export function najti_sekret(t) { if (t.includes('ЧУЖОЕ')) return { klass: 'klass-iz-budushchego', pozicia: 0 };
      return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { if (k === 'obyavlennyj') return 'zapiraet'; if (k === 'entropiya') return 'pomechaet'; return 'neizvesten'; }
  `);
  const b = baza('neizv', [{ soderzhim: 'тут ЧУЖОЕ слово' }, { soderzhim: 'чистая запись' }]);
  const fajl = put('neizv.jsonl');
  let upalo = null;
  try { await vyvezti({ otkuda: 'стенд', baza: b, fajl, yadro: podstavnoe }); }
  catch (e) { upalo = e; }
  if (!upalo) throw new Error('вывоз НЕ остановился на незнакомом классе — прошёл целиком');
  if (upalo.code !== 'VYVOZ_NEZNAKOMYJ_KLASS') throw new Error('код отказа ' + upalo.code);
  if (upalo.klass !== 'klass-iz-budushchego') throw new Error('класс не назван: ' + upalo.klass);
  // RU: Файла быть НЕ должно: остановка означает, что наружу не ушло ничего, включая чистые записи.
  // EN: There must be NO file: a stop means nothing left, clean records included.
  if (existsSync(fajl)) throw new Error('файл вывоза создан, хотя вывоз остановлен');
});

// RU: Проверяет: помечающий класс вывозится, а пометка pometka_filtra есть в файле. Ловит: вывоз,
//     путающий пометку с запретом, либо теряющий пометку.
// EN: Checks: a marking class is exported and the pometka_filtra mark is present in the file.
//     Catches: an export that confuses marking with locking, or drops the mark.
await proba('ПОМЕЧАЮЩИЙ класс ВЫВОЗИТСЯ (пометка ≠ запрет) и пометка названа', async () => {
  const podstavnoe = put('yadro-pometka.mjs');
  writeFileSync(podstavnoe, `
    export function najti_sekret(t) { if (t.includes('ЭНТРОПИЯ')) return { klass: 'entropiya', pozicia: 0 };
      return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { if (k === 'obyavlennyj') return 'zapiraet'; if (k === 'entropiya') return 'pomechaet'; return 'neizvesten'; }
  `);
  const b = baza('pom', [{ soderzhim: 'запись, где есть ЭНТРОПИЯ' }]);
  const f = put('pom.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: podstavnoe });
  if (it.vyvezeno !== 1) throw new Error('вывезено ' + it.vyvezeno);
  if (!readFileSync(f, 'utf8').includes('pometka_filtra')) throw new Error('пометка не названа в файле');
});

// RU: Проверяет: отчёт о вывозе не содержит текста задержанной записи, но говорит о пропуске.
//     Ловит: утечку секрета через отчёт.
// EN: Checks: the export report does not contain the held-back record text but mentions the skip.
//     Catches: a secret leaking through the report.
await proba('ОТЧЁТ НЕ ВЫНОСИТ СОДЕРЖИМОЕ задержанной записи', async () => {
  const b = baza('otch', [{ soderzhim: 'password = SuperTajnoe#42xyz' }]);
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl: put('otch.jsonl'), yadro: YADRO });
  const t = otchyot(it);
  if (t.includes('SuperTajnoe')) throw new Error('🔴 отчёт вынес содержимое');
  if (!t.includes('пропущена')) throw new Error('отчёт молчит о задержке');
});

// RU: Проверяет: отчёт называет абсолютные числа «всего, вывезено, задержано».
//     Ловит: отчёт долями, по которому не восстановить объём.
// EN: Checks: the report states absolute counts "total, exported, held back".
//     Catches: a report in fractions from which the volume cannot be recovered.
await proba('числа в отчёте АБСОЛЮТНЫЕ, а не доля (условие В13)', async () => {
  const b = baza('chisla', [{ soderzhim: 'чисто' }, { soderzhim: 'password = Xk9#mQ2$vL8p' }]);
  const t = otchyot(await vyvezti({ otkuda: 'стенд', baza: b, yadro: YADRO }));
  if (!/всего 2, вывезено 1, задержано 1/.test(t)) throw new Error('нет абсолютных чисел: ' + t.split('\n')[0]);
});

// RU: Проверяет: «задержано 0» сопровождается оговоркой, что это не «секретов нет».
//     Ловит: ноль фильтра, читаемый как гарантия.
// EN: Checks: "held back 0" comes with the caveat that it does not mean "no secrets".
//     Catches: a filter zero read as a guarantee.
await proba('«задержано 0» НЕ выдаётся за «секретов нет»', async () => {
  const b = baza('nol', [{ soderzhim: 'чистая запись' }]);
  const t = otchyot(await vyvezti({ otkuda: 'стенд', baza: b, yadro: YADRO }));
  if (!t.includes('а НЕ «секретов нет»')) throw new Error('ноль подан без границы');
});

console.log('\n═══ ДОГОВОР С ЯДРОМ — FAIL-CLOSED С НАШЕЙ СТОРОНЫ (условие В12) ═══');

// RU: Проверяет: ядро без najti_sekret — отказ VYVOZ_DOGOVOR_YADRA, файла нет.
//     Ловит: вывоз без функции поиска секретов.
// EN: Checks: a core without najti_sekret gives VYVOZ_DOGOVOR_YADRA, and no file.
//     Catches: an export running without the secret-search function.
await proba('ядро БЕЗ najti_sekret → ОТКАЗ, файла вывоза НЕТ', async () => {
  const p = put('yadro-bez-funkcii.mjs');
  writeFileSync(p, 'export function rezhim(k){ return "neizvesten"; }');
  const b = baza('bezf', [{ soderzhim: 'что угодно' }]);
  const f = put('ne-dolzhen-poyavitsya.jsonl');
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: b, fajl: f, yadro: p }));
  if (existsSync(f)) throw new Error('🔴 файл вывоза создан при несостоявшемся договоре');
});

// RU: Проверяет: ответ ядра чужой формы (tip вместо klass) — отказ.
//     Ловит: вывоз, читающий непонятный ответ как «секрета нет».
// EN: Checks: a core answer of a foreign shape (tip instead of klass) is a refusal.
//     Catches: an export reading an unintelligible answer as "no secret".
await proba('ядро с ЧУЖОЙ ФОРМОЙ ответа (tip вместо klass) → ОТКАЗ', async () => {
  const p = put('yadro-chuzhaya-forma.mjs');
  writeFileSync(p, `
    export function najti_sekret(t) { return t.includes('password') ? { tip: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { return 'zapiraet'; }
  `);
  const b = baza('forma', [{ soderzhim: 'password = Xk9#mQ2$vL8p' }]);
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: b, yadro: p }));
});

// RU: Проверяет: незнакомое слово режима от rezhim() — отказ.
//     Ловит: вывоз, считающий неизвестный режим разрешающим.
// EN: Checks: an unfamiliar mode word from rezhim() is a refusal.
//     Catches: an export treating an unknown mode as permissive.
await proba('rezhim() с чужим словом в ответе → ОТКАЗ', async () => {
  const p = put('yadro-chuzhoj-rezhim.mjs');
  writeFileSync(p, `
    export function najti_sekret(t) { return t.includes('password') ? { klass: 'obyavlennyj', pozicia: 0 } : null; }
    export function rezhim(k) { return 'mozhno'; }
  `);
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: baza('rezh', []), yadro: p }));
});

// RU: Проверяет: отсутствующий файл ядра — отказ.
//     Ловит: запасной путь «вывоз пока без фильтра».
// EN: Checks: a missing core file is a refusal.
//     Catches: a fallback of "export without a filter for now".
await proba('ядра НЕТ вовсе → ОТКАЗ, а не «вывоз пока без фильтра»', async () => {
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: baza('netyadra', []), yadro: put('takogo-fajla-net.mjs') }));
});

console.log('\n═══ ВВОЗ ═══');

// RU: Проверяет: строка с id — отказ VYVOZ_CHUZHIE_ID, число записей в базе прежнее.
//     Ловит: перенос чужих номеров (отмывание доверия) и вставку до отказа.
// EN: Checks: a line carrying id is refused with VYVOZ_CHUZHIE_ID, the record count is unchanged.
//     Catches: carrying foreign ids (trust laundering) and inserting before refusing.
await proba('ГЛАВНОЕ: чужой id → ОТКАЗ, база НЕ тронута', async () => {
  const b = baza('chuzhieid', [{ soderzhim: 'своя запись' }]);
  const do_ = schyot(b);
  const f = put('s-id.jsonl');
  writeFileSync(f, JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'чужая', kogda: 1, zapisej: 1 })
    + '\n' + JSON.stringify({ id: 3, agent: 'chuzhoj', klass: 'zametka', soderzhim: 'чужое знание', istochnik: 'ch#1', sozdano: 5 }) + '\n');
  await dolzhnoUpast('VYVOZ_CHUZHIE_ID', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== do_) throw new Error('🔴 база изменилась при отказе');
});

// RU: Проверяет: чужая версия схемы в заголовке — отказ VYVOZ_CHUZHAYA_SHEMA, база прежняя.
//     Ловит: ввоз файла, схему которого ввоз не понимает.
// EN: Checks: a foreign schema version in the header is refused with VYVOZ_CHUZHAYA_SHEMA, the
//     database is unchanged. Catches: importing a file whose schema import does not understand.
await proba('ЧУЖАЯ ВЕРСИЯ СХЕМЫ → ОТКАЗ, база НЕ тронута', async () => {
  const b = baza('chuzhaya-shema', [{ soderzhim: 'своя' }]);
  const do_ = schyot(b);
  const f = put('chuzhaya.jsonl');
  writeFileSync(f, JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: 999, polya: POLYA, otkuda: 'из будущего', kogda: 1, zapisej: 0 }) + '\n');
  await dolzhnoUpast('VYVOZ_CHUZHAYA_SHEMA', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== do_) throw new Error('🔴 база изменилась при отказе');
});

// RU: Проверяет: битая третья строка — отказ VYVOZ_BITAYA_STROKA и ноль записей в базе.
//     Ловит: частичный ввоз «сколько успели».
// EN: Checks: a broken third line is refused with VYVOZ_BITAYA_STROKA and zero records land.
//     Catches: a partial import of "whatever made it".
await proba('АТОМАРНОСТЬ (В6): битая строка → НОЛЬ новых, а не «сколько успели»', async () => {
  const b = baza('atom', []);
  const f = put('bitaya.jsonl');
  const shapka = JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 3 });
  const horoshie = [1, 2].map((i) => JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'знание ' + i, istochnik: 's#' + i, sozdano: i }));
  writeFileSync(f, [shapka, ...horoshie, '{это не json', JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'знание 4', istochnik: 's#4', sozdano: 4 })].join('\n') + '\n');
  await dolzhnoUpast('VYVOZ_BITAYA_STROKA', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  if (schyot(b) !== 0) throw new Error('🔴 вставлено ' + schyot(b) + ' при битом файле — половина ввоза хуже отказа');
});

// RU: Проверяет: ввоз сам отклоняет запись с секретом и вставляет чистую.
//     Ловит: ввоз, доверяющий фильтру отправителя.
// EN: Checks: import itself rejects the record with a secret and inserts the clean one.
//     Catches: an import that trusts the sender's filter.
await proba('ВВОЗ ТОЖЕ ФИЛЬТРУЕТ: файл с секретом (пришёл с машины без фильтра) отклонён', async () => {
  const b = baza('vvoz-filtr', []);
  const f = put('s-sekretom.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'без фильтра', kogda: 1, zapisej: 2 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'password = Xk9#mQ2$vL8p', istochnik: 's#1', sozdano: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чистое знание', istochnik: 's#2', sozdano: 2 })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.otkloneno_filtrom !== 1) throw new Error('отклонено ' + it.otkloneno_filtrom + ', ожидалось 1');
  if (it.vstavleno !== 1) throw new Error('вставлено ' + it.vstavleno);
});

// RU: Три пробы фильтра ввоза по полям (поля-объекты и прочие поля). Общая шапка файла и чтение всей базы
//     текстом: секрет не должен оказаться ни в одном столбце ни одной строки.
// EN: Three import-filter probes per field (object fields and other fields). A shared file header and reading
//     the whole database as text: the secret must not end up in any column of any row.
const SHAPKA_VVOZA = (n) => JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'без фильтра', kogda: 1, zapisej: n });
const vsya_baza = (p) => { const db = new DatabaseSync(p, { readOnly: true }); const r = JSON.stringify(db.prepare('SELECT * FROM zapisi').all()); db.close(); return r; };

// RU: Проверяет: секрет внутри поля-объекта soderzhim отклонён, поле названо, в базе его нет.
//     Ловит: фильтр, видящий String(объект) = «[object Object]», пока в базу ложится JSON объекта.
// EN: Checks: a secret inside an object-valued soderzhim is rejected, the field is named, the
//     database does not hold it. Catches: a filter that sees String(object) = "[object Object]"
//     while the object's JSON goes into the database.
await proba('ВВОЗ: секрет ВНУТРИ поля-объекта отклонён, в базу не лёг', async () => {
  const b = baza('vvoz-obyekt', []);
  const f = put('obyekt-sekret.jsonl');
  writeFileSync(f, [SHAPKA_VVOZA(2),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: { zametka: 'настройка', klyuch: 'password = Xk9#mQ2$vL8p' }, istochnik: 'o#1', sozdano: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чистое знание', istochnik: 'o#2', sozdano: 2 })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.otkloneno_filtrom !== 1) throw new Error('отклонено ' + it.otkloneno_filtrom + ', ожидалось 1');
  if (it.vstavleno !== 1) throw new Error('вставлено ' + it.vstavleno + ', ожидалось 1');
  if (it.otkloneno[0]?.pole !== 'soderzhim') throw new Error('поле не названо: ' + JSON.stringify(it.otkloneno[0]?.pole));
  if (vsya_baza(b).includes('Xk9#mQ2')) throw new Error('🔴 секрет из поля-объекта лёг в базу');
});

// RU: Проверяет: секрет в другом поле договора (istochnik) отклонён и назван по полю.
//     Ловит: фильтр, судящий только soderzhim.
// EN: Checks: a secret in another contract field (istochnik) is rejected and named by field.
//     Catches: a filter that judges soderzhim only.
await proba('ВВОЗ: секрет в ДРУГОМ поле договора отклонён, поле названо', async () => {
  const b = baza('vvoz-drugoe-pole', []);
  const f = put('drugoe-pole.jsonl');
  writeFileSync(f, [SHAPKA_VVOZA(1),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чистое знание', istochnik: 'password = Xk9#mQ2$vL8p', sozdano: 1 })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.otkloneno_filtrom !== 1 || it.vstavleno !== 0) throw new Error(`отклонено ${it.otkloneno_filtrom}, вставлено ${it.vstavleno}; ждали 1 и 0`);
  if (it.otkloneno[0]?.pole !== 'istochnik') throw new Error('поле не названо: ' + JSON.stringify(it.otkloneno[0]?.pole));
  if (vsya_baza(b).includes('Xk9#mQ2')) throw new Error('🔴 секрет из istochnik лёг в базу');
});

// RU: Проверяет: ЧИСТОЕ поле-объект проходит и ложится ровно JSON-ом объекта.
//     Ловит: перестраховку (фильтр режет всё объектное) и расхождение «видит фильтр / пишет вставка».
// EN: Checks: a CLEAN object field passes and is stored exactly as the object's JSON.
//     Catches: over-blocking (the filter cuts every object) and a "filter sees / insert writes" mismatch.
await proba('ВВОЗ: ЧИСТОЕ поле-объект проходит и ложится JSON-ом', async () => {
  const b = baza('vvoz-chistyj-obyekt', []);
  const f = put('chistyj-obyekt.jsonl');
  const obyekt = { zametka: 'настройка', znachenie: 42 };
  writeFileSync(f, [SHAPKA_VVOZA(1),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: obyekt, istochnik: 'c#1', sozdano: 1 })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.otkloneno_filtrom !== 0 || it.vstavleno !== 1) throw new Error(`отклонено ${it.otkloneno_filtrom}, вставлено ${it.vstavleno}; ждали 0 и 1`);
  const db = new DatabaseSync(b, { readOnly: true });
  const lezhit = db.prepare('SELECT soderzhim FROM zapisi').get().soderzhim;
  db.close();
  if (lezhit !== JSON.stringify(obyekt)) throw new Error('в базе ' + JSON.stringify(lezhit));
});

// RU: Проверяет: повторный ввоз того же файла вставляет 0 и считает «уже было» 1. Тождество в коде —
//     тройка «агент + источник + время» (ворота В2); название пробы говорит о паре.
//     Ловит: удвоение памяти при повторном ввозе.
// EN: Checks: importing the same file again inserts 0 and counts "already present" 1. Identity in the
//     code is the triple "agent + source + time" (gate V2); the probe title mentions a pair.
//     Catches: memory doubling on repeated import.
await proba('ТОЖДЕСТВО по паре «источник + время»: двойной ввоз НЕ удваивает', async () => {
  const b = baza('dvazhdy', []);
  const f = put('dvazhdy.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'одно знание', istochnik: 'sess#7', sozdano: 777 })].join('\n') + '\n');
  const p1 = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  const p2 = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (p1.vstavleno !== 1) throw new Error('первый ввоз вставил ' + p1.vstavleno);
  if (p2.vstavleno !== 0 || p2.uzhe_bylo !== 1) throw new Error('второй ввоз вставил ' + p2.vstavleno + ', «уже было» ' + p2.uzhe_bylo);
  if (schyot(b) !== 1) throw new Error('в базе ' + schyot(b) + ' записей вместо одной');
});

await proba('НЕЗНАКОМОЕ ВВОЗУ поле записи названо поимённо — не отброшено молча', async () => {
  // RU: Поле вне договора ввоза (POLYA): ввоз его не размещает. До alpha.17 глотал МОЛЧА —
  //     отчёт «вставлено 2», а значение пропало. Теперь: имя и число записей в итоге, крике и отчёте.
  // EN: A field outside the import contract (POLYA) is not placed by import. Before alpha.17 it was
  //     swallowed SILENTLY — the report said "inserted 2" while the value was gone. Now the name and
  //     the record count appear in the summary, the warning and the report.
  const { otchyot_vvoza } = await import(join(paket, 'vvoz.js'));
  const b = baza('neznakomoe-pole', []);
  const f = put('neznakomoe-pole.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 2 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'знание с лишним полем', istochnik: 'nz#1', sozdano: 1, pole_iz_budushchego: 'x' }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'обычное знание', istochnik: 'nz#2', sozdano: 2 })].join('\n') + '\n');
  const kriki = [];
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO, krik: (s) => kriki.push(String(s)) });
  if (it.vstavleno !== 2) return 'вставлено ' + it.vstavleno + ' вместо 2 — незнакомое поле не повод терять запись';
  if (!(it.polya_neizvestnye_vvozu ?? []).includes('pole_iz_budushchego')) return 'в итоге поле не названо: ' + JSON.stringify(it.polya_neizvestnye_vvozu);
  if (it.polya_neizvestnye_vvozu_nesli?.pole_iz_budushchego !== 1) return 'число несших записей не 1: ' + JSON.stringify(it.polya_neizvestnye_vvozu_nesli);
  if (it.prinyato_s_poterey !== true) return 'prinyato_s_poterey не поднят';
  if (!kriki.some((s) => s.includes('pole_iz_budushchego'))) return 'крик молчит о поле: ' + JSON.stringify(kriki);
  if (!otchyot_vvoza(it).includes('pole_iz_budushchego')) return 'отчёт не называет поле:\n' + otchyot_vvoza(it);
});

// RU: Проверяет: ограничение с чужой машины ложится с bez_podtverzhdeniya=1, заметка — с 0.
//     Ловит: чужое ограничение, вступившее в силу молча, и правило шире объявленного.
// EN: Checks: a restriction from a foreign machine lands with bez_podtverzhdeniya=1, a note with 0.
//     Catches: a foreign restriction taking effect silently, and a rule broader than declared.
await proba('СТЕЙДЖИНГ ЧУЖОГО (В5): ограничение с чужой машины ложится НЕПОДТВЕРЖДЁННЫМ', async () => {
  const b = baza('staging', []);
  const f = put('ogr.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 2 }),
    JSON.stringify({ agent: 'a', klass: 'ogranichenie', soderzhim: 'не трогать чужие каталоги', istochnik: 'o#1', sozdano: 1, bez_podtverzhdeniya: 0 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'обычная заметка', istochnik: 'z#1', sozdano: 2, bez_podtverzhdeniya: 0 })].join('\n') + '\n');
  await vvezti({ baza: b, fajl: f, yadro: YADRO });
  const db = new DatabaseSync(b, { readOnly: true });
  const ogr = db.prepare("SELECT bez_podtverzhdeniya b FROM zapisi WHERE klass='ogranichenie'").get();
  const zam = db.prepare("SELECT bez_podtverzhdeniya b FROM zapisi WHERE klass='zametka'").get();
  db.close();
  if (ogr.b !== 1) throw new Error('🔴 чужое ограничение вступило в силу молча (bez_podtverzhdeniya=' + ogr.b + ')');
  if (zam.b !== 0) throw new Error('заметке зря поставлена пометка — правило шире объявленного');
});

console.log('\n═══ КРУГ: ВЫВОЗ → ВВОЗ В ПУСТУЮ БАЗУ ═══');

// RU: Проверяет: вывоз и ввоз в пустую базу сохраняют число записей, содержимое, источник и время.
//     Ловит: потерю или искажение записей на круге.
// EN: Checks: export then import into an empty database preserve the record count, content, source
//     and time. Catches: records lost or distorted on the round trip.
await proba('ГЛАВНОЕ: круг сохраняет число записей и их содержимое', async () => {
  const ishod = baza('krug-ot', [
    { soderzhim: 'первое знание', istochnik: 'k#1', sozdano: 111 },
    { soderzhim: 'второе знание', istochnik: 'k#2', sozdano: 222 },
    { soderzhim: 'третье знание', istochnik: 'k#3', sozdano: 333 },
  ]);
  const f = put('krug.jsonl');
  const v = await vyvezti({ baza: ishod, fajl: f, otkuda: 'stend', yadro: YADRO });
  const pustaya = baza('krug-v', []);
  const p = await vvezti({ baza: pustaya, fajl: f, yadro: YADRO });
  if (v.vyvezeno !== 3 || p.vstavleno !== 3) throw new Error('вывезено ' + v.vyvezeno + ', вставлено ' + p.vstavleno);
  const s = (put_) => { const db = new DatabaseSync(put_, { readOnly: true }); const r = db.prepare('SELECT soderzhim, istochnik, sozdano FROM zapisi ORDER BY sozdano').all(); db.close(); return JSON.stringify(r); };
  if (s(ishod) !== s(pustaya)) throw new Error('содержимое разошлось:\n  было ' + s(ishod) + '\n  стало ' + s(pustaya));
});

// RU: Проверяет: принимающая база выдаёт записи свой номер, а не исходный 500.
//     Ловит: перенос номера через круг вывоз → ввоз.
// EN: Checks: the receiving database assigns its own id, not the original 500.
//     Catches: an id carried through the export → import round trip.
await proba('номера у принимающей базы СВОИ, а не исходные', async () => {
  const ishod = baza('nom-ot', []);
  const db0 = new DatabaseSync(ishod);
  db0.exec("INSERT INTO zapisi (id, agent, klass, soderzhim, istochnik, sozdano) VALUES (500,'a','zametka','знание','n#1',9)");
  db0.close();
  const f = put('nom.jsonl');
  await vyvezti({ otkuda: 'стенд', baza: ishod, fajl: f, yadro: YADRO });
  const pustaya = baza('nom-v', []);
  await vvezti({ baza: pustaya, fajl: f, yadro: YADRO });
  const db = new DatabaseSync(pustaya, { readOnly: true });
  const id = db.prepare('SELECT id FROM zapisi').get().id;
  db.close();
  if (id === 500) throw new Error('🔴 чужой номер перенесён — рубеж происхождения обойдён');
});

console.log('\n═══ ГРАНИЦЫ ОБЪЯВЛЕНЫ (условие В11) ═══');

// RU: Проверяет: каждая причина невывоза объяснена (не короче 40 знаков), а zhurnal,
//     ochered_dolgovremennogo и id названы. Ловит: перечень исключений без объяснения.
// EN: Checks: every non-export reason is explained (at least 40 characters), and zhurnal,
//     ochered_dolgovremennogo and id are listed. Catches: a list of exclusions without explanation.
await proba('«чего НЕ вывозит» объясняет ПОЧЕМУ, а не только ЧТО', async () => {
  const bez = Object.entries(NE_VYVOZITSYA).filter(([, v]) => String(v).length < 40);
  if (bez.length) throw new Error('без объяснения: ' + bez.map(([k]) => k).join(', '));
  for (const k of ['zhurnal', 'ochered_dolgovremennogo', 'id']) {
    if (!(k in NE_VYVOZITSYA)) throw new Error('не назван: ' + k);
  }
});

// RU: Проверяет: id нет в перечне переносимых полей.
//     Ловит: перенос номера через договор полей.
// EN: Checks: id is not in the list of transferable fields.
//     Catches: the id leaking in through the field contract.
await proba('в перечне переносимых полей НЕТ id', async () => {
  if (POLYA.includes('id')) throw new Error('🔴 id в перечне переносимых полей');
});

// RU: Проверяет: VERSIYA_PAKETA равна версии в package.json, отчёт называет её, файл несёт chem_vyvezeno.
//     Ловит: версию, вписанную в код руками и разошедшуюся с манифестом.
// EN: Checks: VERSIYA_PAKETA equals the package.json version, the report names it, the file carries
//     chem_vyvezeno. Catches: a hand-written version that drifted from the manifest.
await proba('отчёт и файл называют РЕДАКЦИЮ пакета, и она из манифеста', async () => {
  const { VERSIYA_PAKETA } = await import(join(paket, 'vyvoz.js'));
  const manifest = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf8'));
  if (VERSIYA_PAKETA !== manifest.version) throw new Error('в коде ' + VERSIYA_PAKETA + ', в манифесте ' + manifest.version);
  const b = baza('versiya', [{ soderzhim: 'знание' }]);
  const f = put('versiya.jsonl');
  const t = otchyot(await vyvezti({ otkuda: 'стенд', baza: b, fajl: f, yadro: YADRO }));
  if (!t.includes(manifest.version)) throw new Error('отчёт не называет редакцию');
  if (!readFileSync(f, 'utf8').includes('chem_vyvezeno')) throw new Error('файл вывоза не называет, чем вывезен');
});

// RU: Проверяет: столбец базы, неизвестный вывозу, назван в итоге, в отчёте и в шапке файла.
//     Ловит: молчаливый пропуск поля, когда схема ушла вперёд вывоза.
// EN: Checks: a database column unknown to export is named in the summary, the report and the file
//     header. Catches: a field silently skipped when the schema has moved ahead of export.
await proba('СХЕМА УШЛА ВПЕРЁД: поле есть в базе, вывоз о нём не знает — сказано ГРОМКО', async () => {
  const b = baza('novoe-pole', [{ soderzhim: 'обычная запись' }]);
  // RU: Поле, которого вывоз не знает НИ как вывозимое, НИ как непереносимое.
  // EN: A field export knows NEITHER as exportable NOR as non-transferable.
  const db = new DatabaseSync(b);
  db.exec('ALTER TABLE zapisi ADD COLUMN pole_iz_budushchego TEXT DEFAULT NULL');
  db.close();
  const fajl = put('novoe-pole.jsonl');
  const it = await vyvezti({ otkuda: 'стенд', baza: b, fajl, yadro: YADRO });
  if (!(it.polya_neizvestnye_vyvozu ?? []).includes('pole_iz_budushchego')) {
    throw new Error('поле не названо: ' + JSON.stringify(it.polya_neizvestnye_vyvozu));
  }
  const t = otchyot(it);
  if (!t.includes('НЕ ЗНАЕТ')) throw new Error('в отчёте нет громкой строки:\n' + t);
  // RU: Принимающая сторона обязана увидеть это ИЗ ФАЙЛА, а не из нашего отчёта.
  // EN: The receiving side must see this FROM THE FILE, not from our report.
  const shapka = JSON.parse(readFileSync(fajl, 'utf8').split('\n')[0]);
  if (!(shapka.polya_neizvestnye_vyvozu ?? []).includes('pole_iz_budushchego')) {
    throw new Error('шапка файла молчит о неизвестном поле: ' + JSON.stringify(shapka));
  }
});

await proba('🔴 путь к фильтру не строкой → отказ НАЗЫВАЕТ, что пришло', async () => {
  // RU: Поймано своей же пробой 05.09.2026: передано готовое ядро вместо пути, и отказ
  //     напечатал «ядро не загрузилось ([object Object])» — правдиво и бесполезно.
  // EN: Caught by this stand's own probe on 2026-09-05: a ready core object was passed instead of a
  //     path, and the refusal printed "core failed to load ([object Object])" — true and useless.
  try {
    await vzyat_filtr({ najti_sekret() {}, rezhim() {} });
    throw new Error('отказа не было — объект принят за путь');
  } catch (e) {
    if (e.code !== 'VYVOZ_DOGOVOR_YADRA') throw new Error('не тот отказ: ' + e.message);
    if (!/должен быть строкой/.test(e.message) || !/object/.test(e.message)) {
      throw new Error('отказ не называет, ЧТО пришло: ' + e.message);
    }
  }
})

console.log('\n═══ ВОРОТА В1/В2/В6/В8: ЗАГОЛОВОК, ТОЖДЕСТВО, АТОМАРНОСТЬ, ЖУРНАЛ ═══');

// RU: Проверяет: шапка файла несёт uzel (отличный от otkuda), число задержанных и сумму sha256.
//     Ловит: файл, по которому получатель не отличит машину, неполноту и целостность.
// EN: Checks: the file header carries uzel (distinct from otkuda), the held-back count and a sha256
//     checksum. Catches: a file where the receiver cannot tell origin machine, incompleteness or integrity.
await proba('В1: заголовок несёт узел, число задержанных и сумму содержимого', async () => {
  const b = baza('zag', [
    { soderzhim: 'обычное знание' },
    { soderzhim: 'password = Xk9#mQ2$vL8p' },
  ]);
  const f = put('zag.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const z = JSON.parse(readFileSync(f, 'utf8').split('\n')[0]);
  if (!z.uzel) return 'нет поля uzel — «файл сделан на машине X» не отличить от «кто-то написал X»';
  if (z.uzel === z.otkuda) return 'uzel совпал с otkuda — величины не разведены';
  if (z.zaderzhano !== 1) return `zaderzhano=${JSON.stringify(z.zaderzhano)}, ждали 1: без него принимающий читает «1 запись» как всю память`;
  if (!/^sha256:/.test(String(z.summa))) return `суммы содержимого нет: ${JSON.stringify(z.summa)}`;
  return true;
});

// RU: Проверяет: запись, изменённая после вывоза, даёт отказ VYVOZ_SUMMA_NE_SOSHLAS, база прежняя.
//     Ловит: ввоз без сверки суммы либо вставку до сверки.
// EN: Checks: a record altered after export yields VYVOZ_SUMMA_NE_SOSHLAS, the database is unchanged.
//     Catches: import without checksum verification, or inserting before verifying.
await proba('В1: ввоз ЛОВИТ правку файла после вывоза (сумма не сошлась)', async () => {
  const b = baza('sum-src', [{ soderzhim: 'знание раз' }, { soderzhim: 'знание два' }]);
  const f = put('sum.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const stroki = readFileSync(f, 'utf8').trimEnd().split('\n');
  const z = JSON.parse(stroki[1]); z.soderzhim = 'подменённое знание';
  stroki[1] = JSON.stringify(z);
  writeFileSync(f, stroki.join('\n') + '\n');
  const cel = baza('sum-dst');
  const bylo = schyot(cel);
  // RU: 🔴 БЫЛО МЁРТВОЕ МЕСТО (найдено 07.09.2026 лечением обёртки). Здесь стояло
  //     `if (e !== true) return e;` — а dolzhnoUpast отдаёт ПОЙМАННОЕ ИСКЛЮЧЕНИЕ, значит
  //     условие истинно ВСЕГДА, проба возвращала объект Error, обёртка возврат глотала,
  //     и вторая половина пробы («база тронута при несошедшейся сумме») НЕ ПРОВЕРЯЛАСЬ НИ РАЗУ.
  //     Несовпадение кода dolzhnoUpast бросает сам — своя проверка тут лишняя.
  // EN: 🔴 THERE WAS A DEAD SPOT HERE (found 2026-09-07 while fixing the wrapper). The line was
  //     `if (e !== true) return e;` — but dolzhnoUpast returns the CAUGHT EXCEPTION, so the condition
  //     was ALWAYS true, the probe returned an Error object, the wrapper swallowed the return value,
  //     and the second half of the probe ("database touched on checksum mismatch") was NEVER CHECKED.
  //     dolzhnoUpast throws on a code mismatch itself — a separate check here is redundant.
  await dolzhnoUpast('VYVOZ_SUMMA_NE_SOSHLAS', () => vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} }));
  return schyot(cel) === bylo || 'база тронута при несошедшейся сумме';
});

// RU: Проверяет: без суммы в шапке итог говорит summa_sverena=false, а отчёт — «НЕ проверена».
//     Ловит: молчание об отсутствии суммы, читаемое как «сошлась».
// EN: Checks: with no checksum in the header the summary says summa_sverena=false and the report
//     says "NOT verified". Catches: silence about a missing checksum read as "it matched".
await proba('В1: суммы НЕТ → сказано «не проверена», а не молчание', async () => {
  const b = baza('old-src', [{ soderzhim: 'знание' }]);
  const f = put('old.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const stroki = readFileSync(f, 'utf8').trimEnd().split('\n');
  // RU: Шапка без суммы — так выглядит файл старого вывоза.
  // EN: A header without a checksum — this is what an old-export file looks like.
  const z = JSON.parse(stroki[0]); delete z.summa;
  stroki[0] = JSON.stringify(z);
  writeFileSync(f, stroki.join('\n') + '\n');
  const cel = baza('old-dst');
  const it = await vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} });
  if (it.summa_sverena !== false) return 'ввоз считает, что сумма сверена, хотя её не было';
  const { otchyot_vvoza } = await import(join(paket, 'vvoz.js'));
  return otchyot_vvoza(it).includes('НЕ проверена')
    || 'отчёт молчит о непроверенной целостности — молчание читается как «сошлась»';
});

// RU: Проверяет: две записи разных агентов с одним источником и временем ввозятся обе, тождество
//     начинается с agent+. Ловит: тождество по паре, схлопывающее чужие записи.
// EN: Checks: two records of different agents with the same source and time are both imported, and
//     identity starts with agent+. Catches: pair identity collapsing distinct records.
await proba('В2: две записи РАЗНЫХ агентов с одним источником и временем не схлопываются', async () => {
  const b = baza('dva-agenta');
  const db = new DatabaseSync(b);
  db.prepare('INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano) VALUES (?,?,?,?,?)')
    .run('agent-a', 'zametka', 'знание первого агента', 'sess#1', 5000);
  db.prepare('INSERT INTO zapisi (agent, klass, soderzhim, istochnik, sozdano) VALUES (?,?,?,?,?)')
    .run('agent-b', 'zametka', 'знание второго агента', 'sess#1', 5000);
  db.close();
  const f = put('dva.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const cel = baza('dva-dst');
  const it = await vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} });
  if (it.vstavleno !== 2) return `вставлено ${it.vstavleno}, ждали 2: записи разных агентов схлопнулись в дубликат`;
  return it.tozhdestvo.startsWith('agent+') || `тождество названо как ${it.tozhdestvo}`;
});

// RU: Проверяет: повторный ввоз оставляет в базе 2 записи и считает «уже было» 2.
//     Ловит: удвоение памяти.
// EN: Checks: a repeated import leaves 2 records and counts "already present" 2.
//     Catches: memory doubling.
await proba('В2: тождество работает — ПОВТОРНЫЙ ввоз не удваивает память', async () => {
  const b = baza('povtor-src', [{ soderzhim: 'знание раз' }, { soderzhim: 'знание два' }]);
  const f = put('povtor.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const cel = baza('povtor-dst');
  await vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} });
  const it2 = await vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} });
  if (schyot(cel) !== 2) return `в базе ${schyot(cel)} записей после двойного ввоза, ждали 2`;
  return it2.uzhe_bylo === 2 || `«уже было» ${it2.uzhe_bylo}, ждали 2`;
});

// RU: Проверяет: после вывоза рядом с целевым файлом нет временных файлов.
//     Ловит: брошенный полуфайл.
// EN: Checks: after export there are no temporary files next to the target file.
//     Catches: an abandoned partial file.
await proba('В6: после вывоза НЕ остаётся временного полуфайла', async () => {
  const b = baza('atom-vrem', [{ soderzhim: 'знание' }]);
  const f = put('atom-vrem.jsonl');
  await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const lishnie = readdirSync(katalog).filter((n) => n.startsWith('atom-vrem.jsonl') && n !== 'atom-vrem.jsonl');
  return lishnie.length === 0 || `остались временные файлы: ${lishnie.join(', ')}`;
});

// RU: Проверяет ТЕКСТ src/vyvoz.js регулярками: есть renameSync(, а первый writeFileSync( пишет
//     в переменную vrem. Ловит: запись прямо в целевой файл. Образец в комментарии vyvoz.js выше
//     настоящего вызова сбивает эту пробу.
// EN: Checks the TEXT of src/vyvoz.js with regular expressions: renameSync( is present, and the first
//     writeFileSync( writes to the vrem variable. Catches: writing straight into the target file.
//     A matching pattern in a vyvoz.js comment above the real call misleads this probe.
await proba('В6: запись идёт НЕ по месту — файл появляется целиком', async () => {
  // RU: Признак атомарности по предмету: временное имя отличается от целевого, значит
  //     до переименования по целевому пути нет НИЧЕГО, а не полуфайл с верным заголовком.
  // EN: The atomicity sign in the subject: the temporary name differs from the target, so before
  //     the rename there is NOTHING at the target path, not a partial file with a valid header.
  const src = readFileSync(join(paket, 'vyvoz.js'), 'utf8');
  if (!/renameSync\(/.test(src)) return 'renameSync нет — запись идёт по месту, обрыв оставит полуфайл';
  const m = src.match(/writeFileSync\(([^,]+),/);
  if (!m) return 'writeFileSync не найден';
  return m[1].trim() === 'vrem' || `пишем сразу в ${m[1].trim()}, а не во временный файл`;
});

// RU: Проверяет: вывоз и ввоз пишут в журнал строку своего класса с числами.
//     Ловит: операцию, не оставившую следа.
// EN: Checks: export and import each write a journal line of their class with counts.
//     Catches: an operation that leaves no trace.
await proba('В8: вывоз и ввоз оставляют след в журнале операций', async () => {
  const b = baza('zhur-src', [{ soderzhim: 'знание' }]);
  const cel = baza('zhur-dst');
  for (const p of [b, cel]) {
    const db = new DatabaseSync(p);
    db.exec(`CREATE TABLE zhurnal (id INTEGER PRIMARY KEY AUTOINCREMENT, kogda INTEGER NOT NULL,
      agent TEXT NOT NULL, klass TEXT NOT NULL, ishod TEXT NOT NULL, priroda TEXT,
      pochemu TEXT NOT NULL, istochnik TEXT)`);
    db.close();
  }
  const f = put('zhur.jsonl');
  const iv = await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  const ii = await vvezti({ baza: cel, fajl: f, yadro: YADRO, krik: () => {} });
  if (!iv.sled_v_zhurnale) return 'вывоз не записал след';
  if (!ii.sled_v_zhurnale) return 'ввоз не записал след';
  const sled = (p, klass) => {
    const db = new DatabaseSync(p, { readOnly: true });
    const r = db.prepare('SELECT klass, ishod, pochemu FROM zhurnal WHERE klass = ?').get(klass);
    db.close(); return r;
  };
  const a = sled(b, 'vyvoz-pamyati'), c = sled(cel, 'vvoz-pamyati');
  if (!a || !c) return 'строки нужного класса в журнале нет';
  return /вывезено 1/.test(a.pochemu) && /вставлено 1/.test(c.pochemu)
    || `следы без чисел: ${a.pochemu} | ${c.pochemu}`;
});

// RU: Проверяет: без таблицы журнала вывоз проходит, sled_v_zhurnale=false, отказ журнала назван.
//     Ловит: отказ журнала, отменивший операцию, либо проглоченный молча.
// EN: Checks: without a journal table export still runs, sled_v_zhurnale=false, and the journal
//     failure is named. Catches: a journal failure that aborts the operation or is swallowed silently.
await proba('В8: таблицы журнала нет → операция идёт, отказ НАЗВАН вслух', async () => {
  // RU: Таблицы zhurnal в этой базе нет.
  // EN: This database has no zhurnal table.
  const b = baza('bez-zhur', [{ soderzhim: 'знание' }]);
  const f = put('bez-zhur.jsonl');
  const stroki = [];
  const it = await vyvezti({ baza: b, fajl: f, otkuda: 'proba', yadro: YADRO, krik: (x) => stroki.push(x) });
  if (it.vyvezeno !== 1) return 'вывоз не состоялся — отказ журнала не должен отменять операцию';
  if (it.sled_v_zhurnale !== false) return 'вывоз считает, что след записан, хотя таблицы нет';
  return stroki.join(' | ').includes('след в журнале НЕ записан')
    || `отказ журнала проглочен молча: ${stroki.join(' | ').slice(0, 200)}`;
});

console.log('\n═══ В9: ОТБОР И ОБЁРТКА ПОД РУКУ ═══');

// RU: Проверяет: отбор по агенту берёт 2 из 3, условия названы в отчёте, пустой отбор объявлен
//     «НЕ ЗАДАН». Ловит: неприменённый отбор и молчание о нём.
// EN: Checks: selection by agent takes 2 of 3, the conditions are named in the report, an empty
//     selection is declared "NOT SET". Catches: a selection not applied, and silence about it.
await proba('В9: отбор берёт ТОЛЬКО подходящее, и условия видны в отчёте', async () => {
  const b = baza('otbor', [
    { agent: 'agent-a', klass: 'zametka', soderzhim: 'знание первого агента', sozdano: 100 },
    { agent: 'agent-b', klass: 'zametka', soderzhim: 'знание второго агента', sozdano: 200 },
    { agent: 'agent-a', klass: 'svodka', soderzhim: 'сводка первого агента', sozdano: 300 },
  ]);
  const it = await vyvezti({ baza: b, otkuda: 'proba', yadro: YADRO, otbor: { agent: 'agent-a' }, krik: () => {} });
  if (it.vsego !== 2) return `взято ${it.vsego}, ждали 2 — отбор по агенту не применился`;
  const o = otchyot(it);
  if (!o.includes('отбор: agent=agent-a')) return 'условия отбора не названы в отчёте';
  const bez = await vyvezti({ baza: b, otkuda: 'proba', yadro: YADRO, krik: () => {} });
  if (bez.vsego !== 3) return `без отбора взято ${bez.vsego}, ждали 3`;
  // RU: Пустой отбор ОБЪЯВЛЯЕТСЯ: «взято всё» и «отбор не сработал» дают одинаковый файл
  //     и разные новости — молчание читалось бы как первое.
  // EN: An empty selection IS DECLARED: "took everything" and "selection did not work" produce the
  //     same file and different news — silence would read as the former.
  return otchyot(bez).includes('отбор: НЕ ЗАДАН')
    || 'пустой отбор не назван — «взято всё» неотличимо от «отбор не применился»';
});

// RU: Проверяет: отбор по времени включает обе границы.
//     Ловит: потерю записей на границе окна.
// EN: Checks: a time selection includes both bounds.
//     Catches: records lost at the window boundary.
await proba('В9: отбор по времени берёт границы включительно', async () => {
  const b = baza('otbor-vremya', [
    { soderzhim: 'раньше', sozdano: 100 },
    { soderzhim: 'внутри', sozdano: 200 },
    { soderzhim: 'позже', sozdano: 300 },
  ]);
  const it = await vyvezti({ baza: b, otkuda: 'proba', yadro: YADRO, otbor: { s: 200, po: 300 }, krik: () => {} });
  return it.vsego === 2 || `взято ${it.vsego}, ждали 2 (границы включительно)`;
});

await proba('🔴 В9: отбор по полю, которого в базе НЕТ → отказ, а не тихий пропуск условия', async () => {
  const b = put('bez-polya.db');
  const db = new DatabaseSync(b);
  db.exec('CREATE TABLE zapisi (id INTEGER PRIMARY KEY AUTOINCREMENT, klass TEXT, soderzhim TEXT, istochnik TEXT, sozdano INTEGER)');
  db.prepare('INSERT INTO zapisi (klass,soderzhim,istochnik,sozdano) VALUES (?,?,?,?)').run('z', 'знание', 's#1', 1);
  db.close();
  // RU: Тихий пропуск условия вывез бы БОЛЬШЕ, чем просили, и отчёт сказал бы «отбор: agent=…»
  //     возврат НЕ отдаём: dolzhnoUpast отдаёт пойманное исключение, а обёртка судит возврат.
  // EN: Silently skipping the condition would export MORE than requested while the report said
  //     "selection: agent=…". The result is NOT returned: dolzhnoUpast returns the caught
  //     exception, and the wrapper judges return values.
  await dolzhnoUpast('VYVOZ_OTBOR_NET_POLYA',
    () => vyvezti({ baza: b, fajl: put('ne-dolzhen.jsonl'), otkuda: 'proba', yadro: YADRO, otbor: { agent: 'agent-a' }, krik: () => {} }));
});

// RU: Проверяет коды обёртки bin/vyvoz-pamyati.mjs: исправный вызов 0; неразобранное время,
//     нет --baza, ключ дважды — 2. Ловит: обёртку, путающую отказ по предмету со слепотой.
// EN: Checks the exit codes of the bin/vyvoz-pamyati.mjs wrapper: a valid call 0; unparsed time,
//     missing --baza, a key given twice — 2. Catches: a wrapper confusing a subject refusal with blindness.
await proba('🔴 В9: обёртка разводит КОДАМИ отказ по предмету (1) и слепоту (2)', async () => {
  const { execFileSync } = await import('node:child_process');
  const skript = join(zdes, '..', 'bin', 'vyvoz-pamyati.mjs');
  if (!existsSync(skript)) return 'обёртки bin/vyvoz-pamyati.mjs нет — В9 не закрыт';
  const kod = (args) => {
    try { execFileSync('node', [skript, ...args], { encoding: 'utf8', stdio: 'pipe' }); return 0; }
    catch (e) { return e.status; }
  };
  const b = baza('obertka', [{ soderzhim: 'знание' }]);
  const norma = kod(['--baza', b, '--yadro', YADRO, '--otkuda', 'стенд']);
  if (norma !== 0) return `исправный вызов дал код ${norma}, ждали 0`;
  // RU: неразобранное время: пустой отбор был бы неотличим от «подходящего нет»
  // EN: unparsed time: an empty selection would be indistinguishable from "nothing matches"
  const slepota = kod(['--baza', b, '--yadro', YADRO, '--otkuda', 'стенд', '--s', 'вчера']);
  if (slepota !== 2) return `неразобранное время дало код ${slepota}, ждали 2 (слепота)`;
  const bez_bazy = kod(['--yadro', YADRO, '--otkuda', 'стенд']);
  if (bez_bazy !== 2) return `вызов без --baza дал код ${bez_bazy}, ждали 2`;
  const dvazhdy = kod(['--baza', b, '--baza', b, '--yadro', YADRO, '--otkuda', 'стенд']);
  if (dvazhdy !== 2) return `ключ дважды дал код ${dvazhdy}, ждали 2 — молчаливый выбор одного из двух`;
  return true;
});

// RU: Проверяет: без --fajl обёртка ничего не создаёт и печатает «это была ПРОБА».
//     Ловит: пробный прогон, оставивший файл, и пробу, не названную пробой.
// EN: Checks: without --fajl the wrapper creates nothing and prints "this was a DRY RUN".
//     Catches: a dry run that leaves a file, and a dry run not labelled as such.
await proba('В9: без --fajl обёртка НИЧЕГО не создаёт и говорит, что это была проба', async () => {
  const { execFileSync } = await import('node:child_process');
  const skript = join(zdes, '..', 'bin', 'vyvoz-pamyati.mjs');
  const b = baza('proba-suhaya', [{ soderzhim: 'знание' }]);
  const bylo = readdirSync(katalog).length;
  const out = execFileSync('node', [skript, '--baza', b, '--yadro', YADRO, '--otkuda', 'стенд'], { encoding: 'utf8' });
  if (readdirSync(katalog).length !== bylo) return 'без --fajl что-то создано в каталоге';
  return out.includes('это была ПРОБА') || `нет строки о пробе: ${out.slice(0, 200)}`;
});


// ── RU: СОСТАВ ПОЛЕЙ ПО РЕШЕНИЮ Э8.5 (план v4, 06.09.2026) ─────────────────────────
// ── EN: FIELD SET PER THE E8.5 DECISION (plan v4, 2026-09-06) ──────────────────────
// RU: 🔴 ЗАЧЕМ ПАРА, А НЕ ОДНА ПРОБА. Решение развело два поля В РАЗНЫЕ СТОРОНЫ, и каждая
//     сторона ломается молча по-своему: забудь `proishozhdenie` в POLYA — уровень записи
//     потеряется при переносе и никто не отличит «не переносили» от «не было»; впиши туда
//     же `proverka` — на той стороне появится отметка сверки, которую там нечем повторить,
//     то есть слово без предмета. Одна проба поймала бы только первое.
// EN: 🔴 WHY A PAIR AND NOT ONE PROBE. The decision sent two fields IN OPPOSITE DIRECTIONS, and
//     each side breaks silently in its own way: forget `proishozhdenie` in POLYA — the record
//     level is lost in transfer and nobody can tell "not transferred" from "never existed"; add
//     `proverka` there too — the other side gets a verification mark it has no means to repeat,
//     a word without substance. A single probe would catch only the first.
await proba('Э8.5: proishozhdenie ВЫВОЗИТСЯ (уровень описывает саму запись)', async () => {
  if (!POLYA.includes('proishozhdenie')) return 'proishozhdenie нет в POLYA — уровень потеряется молча';
  if (NE_VYVOZITSYA.proishozhdenie) return 'proishozhdenie числится и в НЕ_ВЫВОЗИТСЯ — два решения об одном поле';
  return true;
});

await proba('Э8.5: proverka НЕ вывозится, и причина записана', async () => {
  if (POLYA.includes('proverka')) return 'proverka попала в POLYA — «сверено» уедет туда, где сверять нечем';
  const p = NE_VYVOZITSYA.proverka;
  if (!p) return 'proverka не значится в НЕ_ВЫВОЗИТСЯ — следующий сочтёт, что её забыли';
  if (!/журнал/.test(p)) return 'причина не называет журнал — а решение держится именно на том, что журнал не переносится';
  // RU: 🔴 ВТОРАЯ ПОЛОВИНА ПРИЧИНЫ, ДОБАВЛЕНА 06.09.2026 ПО УТОЧНЕНИЮ КООРДИНАТОРА.
  //     Прежняя редакция говорила «слово без предмета» — то есть «бесполезно». Это слабее
  //     истины: перенесённая отметка значит НЕВЕРНОЕ, читающий примет запись за проверенную
  //     и проверять не станет. Бесполезное игнорируют, ложно-зелёное ОСТАНАВЛИВАЕТ проверку.
  //     Проба стережёт именно это: вернуть слабую формулировку — и она покраснеет.
  // EN: 🔴 THE SECOND HALF OF THE REASON, ADDED 2026-09-06 AT THE COORDINATOR'S REQUEST.
  //     The earlier wording said "a word without substance" — i.e. "useless". That is weaker than
  //     the truth: a transferred mark means something FALSE, the reader will take the record as
  //     verified and will not check it. The useless is ignored; false green STOPS checking.
  //     This probe guards exactly that: restore the weak wording and it turns red.
  if (!/ложно-зелён|проверенн/i.test(p)) {
    return 'причина не говорит, что на той стороне отметка читалась бы как ПРОВЕРЕННОЕ — '
         + 'без этого она описывает бесполезное поле, а не ложно-зелёное';
  }
  return true;
});

// ── RU: «ОТКУДА» ОБЯЗАТЕЛЕН (решение координатора + условие автора предмета, 06.09.2026) ──
// ── EN: "OTKUDA" IS MANDATORY (coordinator decision + subject author's condition, 2026-09-06) ──
// RU: 🔴 ЗАЧЕМ ПАРЫ, А НЕ ОДИНОЧНЫЕ ПРОБЫ. Одна проба «без «откуда» отказывает» узаконила бы
//     и вырожденный предмет, который отказывает ВСЕГДА. Вторая половина пары стережёт именно
//     это: с названным источником вывоз обязан пройти и файл обязан появиться.
// EN: 🔴 WHY PAIRS AND NOT SINGLE PROBES. A lone probe "refuses without otkuda" would also bless a
//     degenerate subject that ALWAYS refuses. The second half of the pair guards exactly that:
//     with a named source, export must pass and the file must appear.

console.log('\n═══ «ОТКУДА»: ОБЯЗАТЕЛЕН ЯВНО, УМОЛЧАНИЯ НЕТ ═══');

await proba('🔴 вывоз БЕЗ «откуда» → отказ VYVOZ_NET_OTKUDA, и файла НЕ появляется', async () => {
  const b = baza('bez-otkuda', [{ soderzhim: 'знание' }]);
  const f = put('bez-otkuda.jsonl');
  await dolzhnoUpast('VYVOZ_NET_OTKUDA', () => vyvezti({ baza: b, fajl: f, yadro: YADRO }));
  // RU: 🔴 ОТКАЗ ПРОВЕРЯЕТСЯ СЛЕДОМ НА ДИСКЕ, А НЕ ТОЛЬКО КОДОМ: «бросило» и «ничего не
  //     создало» — разные утверждения, и второе здесь и есть предмет.
  // EN: 🔴 THE REFUSAL IS CHECKED BY THE TRACE ON DISK, NOT ONLY BY THE CODE: "it threw" and
  //     "it created nothing" are different claims, and the second is the subject here.
  if (existsSync(f)) return 'файл создан, хотя источник не назван';
  return true;
});

// RU: Проверяет: пустая строка и строка из пробелов в otkuda — тоже отказ VYVOZ_NET_OTKUDA.
//     Ловит: проверку «откуда» только на undefined.
// EN: Checks: an empty or whitespace-only otkuda is also refused with VYVOZ_NET_OTKUDA.
//     Catches: an otkuda check that only looks for undefined.
await proba('пустая строка и пробелы — тоже НЕ имя источника', async () => {
  const b = baza('pustoe-otkuda', [{ soderzhim: 'знание' }]);
  await dolzhnoUpast('VYVOZ_NET_OTKUDA', () => vyvezti({ otkuda: '', baza: b, yadro: YADRO }));
  await dolzhnoUpast('VYVOZ_NET_OTKUDA', () => vyvezti({ otkuda: '   ', baza: b, yadro: YADRO }));
  return true;
});

await proba('ПАРА к отказу: с названным источником вывоз проходит и имя попадает в шапку', async () => {
  const b = baza('s-otkuda', [{ soderzhim: 'знание' }]);
  const f = put('s-otkuda.jsonl');
  await vyvezti({ otkuda: 'uzel-a', baza: b, fajl: f, yadro: YADRO });
  if (!existsSync(f)) return 'файла нет при названном источнике';
  const shapka = JSON.parse(readFileSync(f, 'utf8').split('\n')[0]);
  if (shapka.otkuda !== 'uzel-a') return `в шапке otkuda=${JSON.stringify(shapka.otkuda)}, а называли «uzel-a»`;
  return true;
});

await proba('🔴 ПОРЯДОК: договор ядра проверяется РАНЬШЕ отсутствия «откуда»', async () => {
  // RU: Порядок намеренный: договор ядра — про безопасность (нечем отличить секрет),
  //     «откуда» — про пригодность файла на той стороне. Если порядок перевернуть, все
  //     пробы на отказ ядра начнут мерить отсутствие «откуда» и станут зелёными не про то.
  // EN: The order is deliberate: the core contract is about safety (no way to tell a secret),
  //     otkuda is about the file's usability on the other side. If the order were reversed, every
  //     core-refusal probe would measure the missing otkuda instead and turn green for the wrong reason.
  const b = baza('poryadok', [{ soderzhim: 'знание' }]);
  await dolzhnoUpast('VYVOZ_DOGOVOR_YADRA', () => vyvezti({ baza: b, yadro: put('takogo-yadra-net.mjs') }));
  return true;
});

await proba('🔴 ВВОЗ файла БЕЗ «откуда» в шапке → отказ, база НЕ тронута', async () => {
  const b = baza('vvoz-bez-otkuda', []);
  const f = put('vvoz-bez-otkuda.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, kogda: 1, zapisej: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чужое знание', istochnik: 's#1', sozdano: 1, proishozhdenie: 'do-protokola' })].join('\n') + '\n');
  await dolzhnoUpast('VYVOZ_ZAGOLOVOK_BEZ_OTKUDA', () => vvezti({ baza: b, fajl: f, yadro: YADRO }));
  // RU: Отказ ДО первой записи: иначе «отказал» означало бы «половину вставил и передумал».
  // EN: Refusal BEFORE the first write: otherwise "refused" would mean "inserted half and changed its mind".
  if (schyot(b) !== 0) return `в базе ${schyot(b)} записей — отказ случился ПОСЛЕ вставки`;
  return true;
});

await proba('ПАРА к отказу ввоза: тот же файл с названным источником ввозится', async () => {
  const b = baza('vvoz-s-otkuda', []);
  const f = put('vvoz-s-otkuda.jsonl');
  writeFileSync(f, [JSON.stringify({ vyvoz: 'dsh-pamyat', versiya_shemy: VERSIYA_SHEMY, polya: POLYA, otkuda: 'сосед', kogda: 1, zapisej: 1 }),
    JSON.stringify({ agent: 'a', klass: 'zametka', soderzhim: 'чужое знание', istochnik: 's#1', sozdano: 1, proishozhdenie: 'do-protokola' })].join('\n') + '\n');
  const it = await vvezti({ baza: b, fajl: f, yadro: YADRO });
  if (it.vstavleno !== 1) return `вставлено ${it.vstavleno}, ждали 1`;
  return true;
});

// ── RU: ПРИЧИНЫ НЕВЫВОЗА ЕДУТ В ФАЙЛЕ, А НЕ ОСТАЮТСЯ У НАС ─────────────────────
// ── EN: NON-EXPORT REASONS TRAVEL IN THE FILE, THEY DO NOT STAY WITH US ────────
// RU: 🔴 ПАРА, А НЕ ОДНА ПРОБА. Причины жили в коде и в отчёте: отчёт остаётся у вывозящего,
//     файл уезжает к тому, кто нас не читал. Он увидит поля, которых нет, и решит либо что
//     вывоз их теряет, либо что их не было в базе — оба вывода неверны и оба ведут чинить
//     работающее. Вторая половина стережёт обратное: карта берётся ИЗ ОДНОГО МЕСТА с решением,
//     а не вторым списком рядом — два списка «одного и того же» разошлись бы молча.
// EN: 🔴 A PAIR, NOT ONE PROBE. The reasons lived in the code and the report: the report stays with
//     the exporter, the file travels to someone who never read us. They will see missing fields
//     and conclude either that export loses them or that the database never had them — both wrong,
//     and both lead to fixing what works. The second half guards the reverse: the map comes FROM
//     THE SAME PLACE as the decision, not from a second list alongside — two lists of "the same
//     thing" would drift apart silently.
await proba('заголовок несёт ПРИЧИНЫ невывоза, а не только список вывозимого', () => {
  const z = zagolovok({ otkuda: 'proba', uzel: 'p', zapisej: 1, summa: 'sha256:x' });
  if (!z.ne_vyvozitsya) throw new Error('в заголовке нет ne_vyvozitsya — причина осталась у нас');
  for (const pole of ['proverka', 'id', 'zhurnal', 'nastrojki']) {
    if (!z.ne_vyvozitsya[pole]) throw new Error('нет причины для поля ' + pole);
    if (String(z.ne_vyvozitsya[pole]).length < 20) {
      throw new Error('причина для ' + pole + ' короче осмысленной: ' + z.ne_vyvozitsya[pole]);
    }
  }
});

await proba('карта причин — ТА ЖЕ, что решение в коде, а не второй список', () => {
  const z = zagolovok({ otkuda: 'proba', uzel: 'p', zapisej: 1, summa: 'sha256:x' });
  const kluchi = Object.keys(z.ne_vyvozitsya).sort().join(',');
  const resh = Object.keys(NE_VYVOZITSYA).sort().join(',');
  if (kluchi !== resh) throw new Error('карта разошлась с решением: ' + kluchi + ' против ' + resh);
  const peresechenie = POLYA.filter((x) => x in z.ne_vyvozitsya);
  if (peresechenie.length) throw new Error('поле и вывозится, и числится невывозимым: ' + peresechenie.join(','));
});

// RU: 🔴 НЕИЗВЕСТНЫЙ КЛЮЧ ВЫЗОВА — ОТКАЗ, А НЕ УМОЛЧАНИЕ (07.09.2026).
//     Замер до правки: vyvezti({..., putFajla:'/tmp/opechatka.jsonl'}) — ключ проглочен МОЛЧА,
//     отчёт сказал «вывезено 1», файл лёг по умолчанию. Зовущий уверен, что назвал путь.
//     Пара, а не одна проба: без второй половины «отказывать на всё» тоже прошло бы.
// EN: 🔴 AN UNKNOWN CALL KEY IS A REFUSAL, NOT A DEFAULT (2026-09-07).
//     Measured before the fix: vyvezti({..., putFajla:'/tmp/opechatka.jsonl'}) — the key was
//     swallowed SILENTLY, the report said "exported 1", the file went to the default place. The
//     caller is sure the path was given. A pair, not one probe: without the second half,
//     "refuse everything" would pass too.
await proba('🔴 лишний ключ вызова → ОТКАЗ с кодом, и файла нет', async () => {
  const b = baza('lishnij-klyuch', [{ soderzhim: 'знание' }]);
  const f = put('ne-dolzhen-poyavitsya.jsonl');
  const e = await dolzhnoUpast('VYVOZ_NEIZVESTNYJ_KLYUCH',
    () => vyvezti({ baza: b, fajl: f, otkuda: 'стенд', yadro: YADRO, putFajla: f, krik: () => {} }));
  if (!/putFajla/.test(String(e.message))) return 'отказ не назвал лишний ключ: ' + e.message;
  if (!/Известны:/.test(String(e.message))) return 'отказ не перечислил известные ключи';
  if (existsSync(f)) return 'файл создан, хотя вызов отвергнут';
});

await proba('обратная сторона: ВЕРНЫЙ набор ключей проходит', async () => {
  const b = baza('vernyj-nabor', [{ soderzhim: 'знание' }]);
  const it = await vyvezti({ baza: b, fajl: put('vernyj.jsonl'), otkuda: 'стенд', yadro: YADRO, krik: () => {} });
  if (it.vyvezeno !== 1) return 'вывезено ' + it.vyvezeno + ', ожидалась 1';
});

// ═══ RU: РЕШЕНИЕ ПО ЧЕТЫРЁМ НОВЫМ ПОЛЯМ СХЕМЫ (07.09.2026) ═══════════════════════
// ═══ EN: DECISION ON FOUR NEW SCHEMA FIELDS (2026-09-07) ══════════════════════════
// RU: Найдено ЖИВЫМ ПЕРЕНОСОМ, а не чтением: вывоз всей базы (215 записей) закричал
//     «полей, о которых вывоз НЕ ЗНАЕТ: kasanij, poslednee_kasanie, ocenki, podtverzhdenie» —
//     схема ушла вперёд вывоза на четыре поля, добавленные за сутки. Механизм сработал верно:
//     он ГОВОРИТ, а не молчит и не роняет. Решение: суждения человека едут, следы употребления
//     на машине-источнике — нет.
// EN: Found by a LIVE TRANSFER, not by reading: exporting the whole database (215 records) warned
//     "fields export does NOT KNOW: kasanij, poslednee_kasanie, ocenki, podtverzhdenie" — the
//     schema had moved four fields ahead of export within a day. The mechanism worked correctly:
//     it SPEAKS rather than staying silent or crashing. Decision: human judgements travel, usage
//     traces from the source machine do not.
await proba('🔴 ocenki и podtverzhdenie ВЫВОЗЯТСЯ: суждение о знании верно на любой машине', async () => {
  if (!POLYA.includes('ocenki')) return 'ocenki нет в POLYA';
  if (!POLYA.includes('podtverzhdenie')) return 'podtverzhdenie нет в POLYA';
  if ('ocenki' in NE_VYVOZITSYA || 'podtverzhdenie' in NE_VYVOZITSYA) {
    return 'поле объявлено и вывозимым, и невывозимым — два списка разошлись';
  }
});

await proba('🔴 kasanij и poslednee_kasanie НЕ вывозятся, и причина названа В ФАЙЛЕ', async () => {
  for (const k of ['kasanij', 'poslednee_kasanie']) {
    if (POLYA.includes(k)) return k + ' попал в вывозимые';
    if (!NE_VYVOZITSYA[k]) return 'причина для ' + k + ' не названа';
    if (!/машине-источник|ЗДЕСЬ/.test(String(NE_VYVOZITSYA[k]))) {
      return 'причина для ' + k + ' не объясняет, почему именно не едет: ' + NE_VYVOZITSYA[k];
    }
  }
  const z = zagolovok({ otkuda: 'proba', uzel: 'p', zapisej: 1, summa: 'sha256:x' });
  if (!z.ne_vyvozitsya.kasanij) return 'причина не доехала до шапки файла — она осталась только в коде';
});

console.log(`\n  итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
