// RU: Стенд проверяет невидимые символы и секреты на входе памяти. Он не обнаруживает отравление добросовестным пересказом чужого сообщения моделью; границы описаны в src/filtr-vhoda.js.
// EN: This suite tests invisible characters and secrets at memory ingress. It does not detect poisoning through a model’s faithful paraphrase of an external message; see the limits in src/filtr-vhoda.js.
import { ochistit, najti_sekret, filtr_ispraven, trevozhno, proverit_sluzhebnoe, normalizovat, rezhim, zamaskirovat } from '../src/filtr-vhoda.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0;
// RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
// EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
const proba = (imya, f) => {
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех. Проверка obyortka-krasneet подставляет заведомо ложную пробу в копию и сравнивает коды выхода.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success. The obyortka-krasneet check injects a deliberately failing probe into a copy and compares exit codes.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. ' +
                      'Бросай ошибку либо ничего не возвращай');
    }
    ok++; console.log('  ok   ' + imya);
  } catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message); }
};

// RU: Проверяем TAG-символы.
// EN: Test TAG characters.
proba('П1 текст с TAG-символами → вычищен, klassy=["tag"]', () => {
  const r = ochistit('обычная статья \u{E0041}\u{E0042}\u{E0043} про замер');
  if (!r.ochistka) throw new Error('отметки нет — чистка не состоялась');
  if (!r.ochistka.klassy.includes('tag')) throw new Error('класс не назван: ' + r.ochistka.klassy);
  if (/[\u{E0000}-\u{E007F}]/u.test(r.tekst)) throw new Error('TAG остались в тексте');
});

// RU: Проверяем bidi-override.
// EN: Test bidi overrides.
proba('П2 bidi-override → вычищен, класс ОТЛИЧАЕТСЯ от П1', () => {
  const r = ochistit('текст ‮ перевёрнут');
  if (!r.ochistka) throw new Error('отметки нет');
  if (!r.ochistka.klassy.includes('bidi')) throw new Error('класс не «bidi»: ' + r.ochistka.klassy);
  if (r.ochistka.klassy.includes('tag')) throw new Error('П1 и П2 дали ОДИН ответ — порча не та');
});

// RU: Проверяем объявленный секрет.
// EN: Test a declared secret.
proba('П3 «password: hunter2» (8 знаков) → найден как объявленный', () => {
  const s = najti_sekret('в настройке password: hunter2 стоит');
  if (!s) throw new Error('секрет пропущен');
  if (s.klass !== 'obyavlennyj') throw new Error('класс ' + s.klass);
});

proba('П3-бис значение секрета НЕ возвращается наружу', () => {
  const s = najti_sekret('password: hunter2');
  if (JSON.stringify(s).includes('hunter2')) throw new Error('значение утекло в исход');
});

// RU: Проверяем энтропийный признак.
// EN: Test the entropy rule.
proba('П4 строка высокой энтропии от 20 знаков → найдена', () => {
  const s = najti_sekret('где-то тут aB3xK9mQ2pL7vN4wR8tZc5Yd лежит');
  if (!s) throw new Error('пропущена');
  if (s.klass !== 'entropiya') throw new Error('класс ' + s.klass);
});

// RU: Контроль ложных отказов: пути, составные идентификаторы и проза о ключах должны проходить. Иначе fail-closed блокирует обычные записи памяти.
// EN: False-rejection control: paths, compound identifiers, and prose about keys must pass. Otherwise fail-closed blocks ordinary memory records.
proba('П5 наши обычные тексты проходят: путь, идентификатор, сумма, проза о ключе', () => {
  const chistye = [
    'запись mem-59dad1ad402a найдена поиском',
    'предмет /opt/<агент>/workspace/dorabotki/proverit-publikacii.py правлен',
    'сумма предмета d5bbd884af9f478b, файлов 17',
    'токен лежит в /etc/publish-tokens/npm.token и не печатается',
    'ключ берётся из окружения GATEWAY_API_KEY по ссылке apiKeyEnv',
    'вызов byudzhetPamyati.otobrat из слоя C, версия dsh-pamyat-restore-0.1.0-alpha.15',
  ];
  for (const s of chistye) {
    const r = najti_sekret(s);
    if (r) throw new Error('ЛОЖНОЕ срабатывание (' + r.klass + ') на: ' + s.slice(0, 50));
  }
});

// RU: Проверяем отказ сломанного фильтра.
// EN: Test failure of a broken filter.
proba('П6 канарейка фильтра исправна на целом фильтре', () => {
  const k = filtr_ispraven();
  if (!k.ispraven) throw new Error('канарейка провалена на исправном: ' + k.pochemu);
});

// RU: Проверяем порог тревоги.
// EN: Test the alert threshold.
proba('порог тревоги: одиночный BOM — не тревога, двадцать знаков — тревога', () => {
  const malo = ochistit('текст ﻿ один');
  if (trevozhno(malo.ochistka)) throw new Error('одиночный BOM поднял тревогу — порог не работает');
  const mnogo = ochistit('текст ' + '​'.repeat(25) + ' много');
  if (!trevozhno(mnogo.ochistka)) throw new Error('25 невидимых знаков не подняли тревогу');
});

proba('чистый текст → отметки НЕТ вовсе (пустой объект не пишется)', () => {
  const r = ochistit('обычная статья про замер и числа');
  if (r.ochistka !== null) throw new Error('на чистом тексте появилась отметка: ' + JSON.stringify(r.ochistka));
});


// RU: Поведением настоящего ядра проверяем фильтр до развилки подтверждения: грязный текст должен остановиться и на ранней ветке без отвечающего. Нет cordis — слепота, не код дефекта 1; ранее выполненные пробы учитываются перед выходом.
// EN: Use real core behavior to test filtering before the confirmation branch: dirty text must stop even on the early branch without a confirmer. Missing cordis means the subject is unobservable, not failure code 1; retain results from earlier probes before exiting.
let Context, apply, name, Config, mkdtempSync, rmSync, tmpdir, join;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
  ;({ mkdtempSync, rmSync } = await import('node:fs'));
  ;({ tmpdir } = await import('node:os'));
  ;({ join } = await import('node:path'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`\nСЛЕПОТА на поведенческой части: ${net ? 'платформа (@deepseek-ai/cordis) не установлена' : String(e?.message ?? e).slice(0, 160)}`);
  console.log(`  До этой точки пройдено проб: ${ok} из ${ok + bed} — они настоящие, слепота только на том, что дальше.`);
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.');
  process.exit(bed === 0 ? 2 : 1);
}

const kat = vremennyj(join(tmpdir(), 'stend-filtra-'));
async function podnyat() {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  const cfg = new Config({ putBazy: join(kat, 'p.db'), otvechayushchegoNet: true, agent: 'proba' });
  koren.plugin({ name, apply }, cfg);
  await new Promise((r) => setTimeout(r, 40));
  return koren;
}

const k = await podnyat();
await new Promise((r) => setTimeout(r, 30));

proba('П7 секрет отвергается и на ветке «класс требует подтверждения»', () => {
  let broshено = null;
  try {
    // RU: ograničenie требует подтверждения и без отвечающего идёт ранним возвратом. Класс вне маски выбран намеренно: проверяем положение фильтра до развилки, а не замену значения.
    // EN: ograničenie requires confirmation and takes an early return without a confirmer. The class is deliberately outside masking: test filtering before branching rather than value replacement.
    k.pamyat.zapisat({ klass: 'ogranichenie-proba-vne-maski', soderzhim: 'настройка password: hunter2 внутри' });
  } catch (e) { broshено = e; }
  if (!broshено) throw new Error('секрет записан через ветку подтверждения — фильтр стоит не до развилки');
  if (broshено.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('иной отказ: ' + broshено.code);
});

proba('🔴 П7-трет отказ НАЗЫВАЕТ ОТСЧЁТ: seq, а не байты (05.09.2026)', () => {
  // RU: Ссылка на срез должна явно называть единицу отсчёта: номера событий не являются байтами, а позиция относится к тексту. Читаем строку внутреннего журнала из таблицы после отказа.
  // EN: A slice reference must name its unit: event numbers are not byte offsets, and the position refers to text. Read the internal journal row from the table after rejection.
  try { k.pamyat.zapisat({ klass: 'znanie', soderzhim: 'pwd=Hunter22xy в тексте' }); } catch { /* RU: Ожидаем отказ.
 * EN: Expect rejection.
 */ }
  const db = new DatabaseSync(join(kat, 'p.db'), { readOnly: true });
  const r = db.prepare("SELECT pochemu FROM zhurnal WHERE priroda = ? ORDER BY id DESC LIMIT 1").get('sekret-na-vhode');
  if (!r) throw new Error('в журнале нет отметки sekret-na-vhode — проба не управляет предметом');
  const p = String(r.pochemu ?? '');
  if (!/seq/.test(p)) throw new Error('отсчёт не назван: в строке нет «seq» — ' + p.slice(0, 140));
  if (!/ЗНАКАХ/.test(p)) throw new Error('единица позиции не названа (ожидались «ЗНАКАХ») — ' + p.slice(0, 140));
  if (/Hunter22/.test(p)) throw new Error('🔴 в строку отказа попало ЗНАЧЕНИЕ');
});

proba('П7-бис чистка работает и на той же ветке: отметка в записи', () => {
  const id = k.pamyat.zapisat({ klass: 'ogranichenie', soderzhim: 'правило \u{E0041}\u{E0042} с тегом' });
  const z = k.pamyat.poId ? k.pamyat.poId(id) : null;
  if (z && z.ochistka === null) throw new Error('отметки о чистке нет в записи');
});



// RU: Хеши и идентификаторы должны проходить.
// EN: Hashes and identifiers must pass.
proba('П8 sha256/md5/sha1/uuid проходят — они в каждом нашем отчёте', () => {
  const chistye = [
    'сумма 9fd1f679b282f4390a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071',
    'md5 0083e4a0781203aa1b2c3d4e5f607182',
    'sha1 0083e4a0781203aa1b2c3d4e5f6071829304a5b6',
    'session-2f29f437-f5ee-4302-a65d-d114be3d8e25',
  ];
  for (const s of chistye) {
    const r = najti_sekret(s);
    if (r) throw new Error('ЛОЖНОЕ (' + r.klass + ') на: ' + s.slice(0, 40));
  }
});

proba('П8-бис hex ИНОЙ длины без объявления — задержан (класс отличается от энтропии)', () => {
  const r = najti_sekret('psk 0083e4a0781203aa1b2c3d4e5f60718293a4b5c6d7e8f901');
  if (!r) throw new Error('hex-кандидат пропущен');
  if (r.klass !== 'hex-bez-obyavleniya') throw new Error('класс ' + r.klass);
});

// RU: Невидимый символ в служебном поле klass даёт отказ, а не чистку: незаметное исправление или несовпадение с перечнем может лишить запись долговременной доставки.
// EN: An invisible character in the klass metadata field must reject rather than clean the record; silent repair or list mismatch may prevent long-term delivery.
proba('П9 klass с невидимым символом → ОТКАЗ с именем поля, а не чистка', () => {
  const r = proverit_sluzhebnoe('klass', 'resh\u200Benie');
  if (!r) throw new Error('невидимый в служебном поле пропущен');
  if (r.pole !== 'klass') throw new Error('поле не названо: ' + JSON.stringify(r));
});

proba('П9-бис обычный klass проходит, ложного отказа нет', () => {
  if (proverit_sluzhebnoe('klass', 'reshenie')) throw new Error('ложный отказ на чистом классе');
  if (proverit_sluzhebnoe('istochnik', 'telegram-a2a#50681-58511')) throw new Error('ложный отказ на источнике');
});

proba('NFC применяется к служебному полю (форма, а не содержание)', () => {
  const razlozhennoe = 'e\u0301'; /* RU: Декомпозиция: e и комбинирующий акут.
 * EN: Decomposed form: e and a combining acute accent.
 */
  if (normalizovat(razlozhennoe) === razlozhennoe) throw new Error('NFC не применилась');
});

// RU: Парная проба UUID: объявленный UUID — секрет, голый — идентификатор. Дефисы делят его на 8/4/4/4/12 символов, поэтому обычная длина кандидата не должна скрывать объявление.
// EN: Paired UUID probe: a declared UUID is a secret, a bare UUID is an identifier. Hyphens split it into 8/4/4/4/12 characters, so ordinary candidate-length checks must not hide the declaration.
proba('П10 объявленный uuid → ОТВЕРГНУТ', () => {
  const r = najti_sekret('в настройке стоит token: 3f2504e0-4f89-11d3-9a0c-0305e82c3301 и дальше');
  if (!r) throw new Error('объявленный uuid пропущен — целый класс ключей проходит молча');
  if (r.klass !== 'uuid-obyavlennyj') throw new Error('назван не тот класс: ' + r.klass);
  if ('znachenie' in r) throw new Error('фильтр вернул ЗНАЧЕНИЕ — он стал публикатором секретов');
});

proba('П10-бис голый uuid → ЗАПИСАН (ложного отказа нет)', () => {
  // RU: Голые UUID используются для сессий и журнала; их блокирование создаёт ложные отказы.
  // EN: Bare UUIDs identify sessions and journal messages; blocking them creates false rejections.
  if (najti_sekret('компакт 2173d27a-b348-4bdc-9025-09e45a26cd50 завершён (ход 706)'))
    throw new Error('ложный отказ на голом идентификаторе');
});

proba('П10-трет объявление ЧЕРЕЗ ТИРЕ объявлением не считается', () => {
  // RU: Форма «ключ - uuid» — проза. Объявление требует : или =.
  // EN: “key - uuid” is prose. A declaration requires : or =.
  if (najti_sekret('ключ - 3f2504e0-4f89-11d3-9a0c-0305e82c3301 в таблице'))
    throw new Error('тире принято за объявление — вернулись к окну в 40 знаков');
});

// RU: Объявления с = и : равноправны. Если = входит в алфавит кандидата, слово и значение сливаются, окно объявления пустеет и правило пропускает формы .env, export и systemd.
// EN: Declarations using = and : are equivalent. Including = in the candidate alphabet merges the word and value, empties the declaration window, and misses .env, export, and systemd forms.
proba('П11 объявление через «=» → ОТВЕРГНУТ (как и через «:»)', () => {
  for (const s of ['pwd=Hunter22xy', 'api_key=abc123XY', 'token=s3cretValue']) {
    const r = najti_sekret('в файле ' + s + ' лежит');
    if (!r) throw new Error('форма «слово=значение» пропущена: ' + s.split('=')[0] + '=…');
    if (r.klass !== 'obyavlennyj') throw new Error('назван не тот класс: ' + r.klass);
  }
});

proba('П11-бис обе формы дают ОДИН ответ — иначе разделитель решает судьбу секрета', () => {
  const dvoetochie = najti_sekret('в файле pwd: Hunter22xy лежит');
  const ravno      = najti_sekret('в файле pwd=Hunter22xy лежит');
  if (Boolean(dvoetochie) !== Boolean(ravno))
    throw new Error('формы расходятся: «:» ' + Boolean(dvoetochie) + ', «=» ' + Boolean(ravno));
});

// RU: Синтетические ключи проверяем по собственному признаку: энтропия и структура покрывают разные формы. Общий отказ мог бы скрыть потерю одного правила; настоящие значения ключей в стенд не включаются.
// EN: Check synthetic keys against their intended rules: entropy and structure cover different shapes. A generic rejection could hide a missing rule; the suite contains no actual key values.
proba('П12 каждая форма ключа отвергается СВОИМ признаком', () => {
  const obrazcy = [
    ['длинный без приставки (форма oauth-токена)', 'aB3xK9mQ2wZ7pL4vN8tR6yH1jF5sD0gW7cX2bV9nM4kP', 'entropiya'],
    ['sk- (форма ключа провайдера)',               'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'strukturnyj:sk-'],
    ['gh*_ (форма ключа хранилища кода)',          'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'strukturnyj:github'],
    ['JWT (форма долгоживущего токена)',           'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
                                                   'strukturnyj:JWT'],
    ['PEM (закрытый ключ)',                        '-----BEGIN OPENSSH PRIVATE KEY-----', 'strukturnyj:PEM'], // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
    ['токен Telegram-бота (input-mask)',             '1234567890:' + 'AAH' + 'x9Kq2Zm4Lp7Wn3Tb8Vc5Rd1Yf6Gh0Js', 'strukturnyj:telegram'],
    ['токен бота в адресе Bot API (аудитор)',     'https://api.telegram.org/bot1234567890:' + 'AAH' + 'x9Kq2Zm4Lp7Wn3Tb8Vc5Rd1Yf6Gh0Js/getMe', 'strukturnyj:telegram'],
    ['токен бота в пути /bot… (аудитор)',         '/bot1234567890:' + 'AAH' + 'x9Kq2Zm4Lp7Wn3Tb8Vc5Rd1Yf6Gh0Js', 'strukturnyj:telegram'],
    ['объявленный короткий',                       'pwd: Hunter22xy', 'obyavlennyj'],
    ['объявленный через равно',                    'api_key=abc123XY', 'obyavlennyj'],
    ['uuid после слова-признака',                  'token: 3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'uuid-obyavlennyj'],
  ];
  const bed = [];
  for (const [imya, obrazec, zhdyom] of obrazcy) {
    const r = najti_sekret('в тексте ' + obrazec + ' и дальше проза');
    if (!r) { bed.push(`${imya}: ПРОПУЩЕН (ждали ${zhdyom})`); continue; }
    if (r.klass !== zhdyom) bed.push(`${imya}: отвергнут ЧУЖИМ признаком «${r.klass}», ждали «${zhdyom}»`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

proba('П12-бис проза того же вида НЕ отвергается (ложного нет)', () => {
  // RU: Формы, ранее вызывавшие ложные отказы до изменения алфавита.
  // EN: Shapes that caused false rejections before the alphabet change.
  for (const s of ['таймер с OnBootSec+OnUnitActiveSec уходит',
                   'путь /opt/<agent-home>/workspace/dorabotki/nashi-dorabotki.sh',
                   'имя dsh-pamyat-restore-0.1.0-alpha.14',
                   'вызов byudzhetPamyati.otobrat вернул',
                   'запись mem-59dad1ad402a найдена',
                   'сбор в 12:30 AA-группы, окно 09:15',            /* RU: Время перед AA не является токеном.
 * EN: A time value preceding AA is not a token.
 */
                   'пара id 123456:AAshort в журнале']) {
    const r = najti_sekret(s);
    if (r) throw new Error(`ложный отказ [${r.klass}] на: ${s.slice(0, 40)}`);
  }
});

// RU: Режим задаётся правилу: объявленные и структурные секреты отвергаются, энтропия лишь помечает запись. Энтропийный вид неоднозначен; корпусная оценка ложных срабатываний составляла 2–16% из 3560 текстов. Парные пробы различают исключение и запись с пометкой.
// EN: Modes belong to individual rules: declared and structural secrets reject, entropy only marks the record. Entropy-based appearance is ambiguous; corpus estimates found false positives in 2–16% of 3560 texts. Paired probes distinguish an exception from a marked write.
proba('П13 объявленный секрет ЗАПИРАЕТ запись', () => {
  let brosheno = null;
  // RU: Класс вне маски: знания маскируют объявленный секрет вместо отказа; эта проба проверяет режим отказа.
  // EN: Use a class outside masking: knowledge masks a declared secret instead of rejecting; this probe tests rejection mode.
  try { k.pamyat.zapisat({ klass: 'proba-vne-maski', soderzhim: 'в файле pwd: Hunter22xy лежит' }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('объявленный секрет записан — правило (а) не запирает');
  if (brosheno.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('чужой код: ' + brosheno.code);
});

proba('П13-бис энтропийное подозрение ПРОПУСКАЕТ запись и метит её', () => {
  // RU: Синтетическая форма ключа: 44 символа, три класса алфавита, высокая энтропия.
  // EN: Synthetic key shape: 44 characters, three alphabet classes, high entropy.
  const id = k.pamyat.zapisat({
    klass: 'fakt',
    soderzhim: 'в отчёте встретилось aB3xK9mQ2wZ7pL4vN8tR6yH1jF5sD0gW7cX2bV9nM4kP и дальше',
  });
  if (!id) throw new Error('запись не состоялась — правило (б) заперло, а не пометило');
  const zap = k.pamyat.prochitat({ skolko: 1 })?.[0];
  if (!zap?.podozrenie) throw new Error('запись прошла БЕЗ пометки: подозрение потеряно молча');
  if (zap.podozrenie.klass !== 'entropiya')
    throw new Error('пометка называет не то правило: ' + JSON.stringify(zap.podozrenie));
});

proba('П13-трет пометка и чистка — РАЗНЫЕ поля, не одно', () => {
  // RU: Различаем изменение текста и подозрение фильтра; одно поле не заменяет оба признака.
  // EN: Distinguish text modification from filter suspicion; one field cannot represent both.
  const zap = k.pamyat.prochitat({ skolko: 1 })?.[0];
  if (zap?.podozrenie && zap?.ochistka && zap.podozrenie === zap.ochistka)
    throw new Error('подозрение и чистка оказались одним полем');
});

// RU: Hex-класс помечает запись: хеш и ключ неразличимы по виду. Проба удерживает этот режим даже при отсутствии hex-значений в корпусе.
// EN: The hex class marks the record: hashes and keys are indistinguishable by shape. This probe preserves the mode even when the corpus contains no hex values.
proba('П21 hex без объявления ПРОПУСКАЕТ запись и метит её (режим, а не поведение)', () => {
  const hex = 'a1b2c3d4e5f6789012345678901234';   /* RU: 30 символов: длина вне исключений 32/40/64.
 * EN: 30 characters: a length outside the 32/40/64 exemptions.
 */
  if (hex.length !== 30) throw new Error('образец испорчен: длина ' + hex.length);
  let id, brosheno = null;
  try { id = k.pamyat.zapisat({ klass: 'fakt', soderzhim: 'в выводе было ' + hex + ' и дальше' }); }
  catch (e) { brosheno = e; }
  if (brosheno) throw new Error('hex ЗАПЕР запись — класс снова в запирающих: ' + brosheno.code);
  if (!id) throw new Error('запись не состоялась без исключения — исход неясен');
  const zap = k.pamyat.prochitat({ skolko: 1 })?.[0];
  if (!zap?.podozrenie) throw new Error('запись прошла БЕЗ пометки: hex потерян молча');
  if (zap.podozrenie.klass !== 'hex-bez-obyavleniya')
    throw new Error('пометка называет не то правило: ' + JSON.stringify(zap.podozrenie));
});

// RU: key=<значение> должен срабатывать как obyavlennyj. Энтропийная пометка не заменяет объявление: слабые ключи она не ловит, сильные пропускает с пометкой.
// EN: key=<value> must match obyavlennyj. An entropy mark cannot substitute for declaration detection: weak keys evade it, and strong keys pass with a mark.
proba('П14 голое key= отвергается классом obyavlennyj, а не энтропией', () => {
  const bed = [];
  for (const [imya, obrazec] of [
    ['key=<сильный>',   'key=Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp'],
    ['key="<сильный>"', 'key="Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp"'],
    ['key: <сильный>',  'key: Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp'],
    // RU: Слабое значение из 12 строчных букв имеет один класс и не ловится энтропией; оно изолирует проверку объявления.
    // EN: A weak value of 12 lowercase letters has one class and evades entropy; it isolates declaration detection.
    ['key=<слабый>',    'key=hunterhunter'],
    ['key: <слабый>',   'key: hunterhunter'],
  ]) {
    const r = najti_sekret(obrazec);
    if (!r) { bed.push(`${imya}: ПРОПУЩЕН`); continue; }
    if (r.klass !== 'obyavlennyj')
      bed.push(`${imya}: отвергнут признаком «${r.klass}», а ждали «obyavlennyj»`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

proba('П14-бис проза со словом key НЕ отвергается (разделитель обязателен)', () => {
  for (const s of ['поле key в этом объекте называет форму, а не значение',
                   'ключ лежит в /etc/publish-tokens, я его не печатаю',
                   'ищи по слову key в перечне SLOVA_OBYAVLENIYA']) {
    const r = najti_sekret(s);
    if (r) throw new Error(`ложный отказ [${r.klass}] на прозе: ${s.slice(0, 40)}`);
  }
});

// RU: Проверяем связанное решение: пока энтропия лишь помечает, key обязан входить в объявления. Проверяем поведением обоих правил. Другие слова перечня здесь не проверяются; при возврате энтропии в отказ связь не требуется.
// EN: Test the coupled decision: while entropy only marks, key must be recognized as a declaration. Check both rules through behavior. Other declaration words are outside this probe; the coupling is unnecessary if entropy rejects again.
proba('П15 режим-пометка и key в перечне — НЕРАЗЛУЧНЫ', () => {
  const rezhim_pometka = najti_sekret('в отчёте aB3xK9mQ2wZ7pL4vN8tR6yH1jF5sD0gW7cX2bV9nM4kP далее')?.klass === 'entropiya';
  const key_v_perechne = najti_sekret('key=hunterhunter')?.klass === 'obyavlennyj';
  if (!rezhim_pometka) return;   /* RU: Энтропия снова отвергает: дополнительная связь с key не требуется.
 * EN: Entropy rejects again: the extra coupling to key is unnecessary.
 */
  if (!key_v_perechne)
    throw new Error('энтропия помечает, но key НЕ в перечне: форма key=<секрет> уходит в память');
});

// RU: Парная проверка левой границы: хвосты monkey=, hotkey= и myapikey= не объявляют key; русские объявления продолжают ловиться. Обычная \b основана на [A-Za-z0-9_] и перед кириллицей не даёт нужной границы.
// EN: Paired left-boundary check: suffixes monkey=, hotkey=, and myapikey= do not declare key, while Russian declarations remain detected. Ordinary \b uses [A-Za-z0-9_] and does not provide the required boundary before Cyrillic.
proba('П16 слово-объявление ХВОСТОМ внутри другого слова — не объявление', () => {
  const bed = [];
  for (const obrazec of ['monkey=Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp', 'hotkey=hunterhunter',
                         'myapikey=hunterhunter', 'lowkey = hunterhunter']) {
    const r = najti_sekret(obrazec);
    if (r && r.klass === 'obyavlennyj')
      bed.push(`${obrazec.slice(0, 12)}…: ложное объявление`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

proba('П16-бис русские слова перечня ЖИВЫ (то, что \\b убил бы молча)', () => {
  const bed = [];
  for (const [imya, obrazec] of [
    ['ключ= в начале',  'ключ=hunterhunter'],
    ['ключ= после пробела', 'мой ключ=hunterhunter'],
    ['пароль: ',        'пароль: hunterhunter'],
    ['токен=',          'токен=hunterhunter'],
    ['секрет=',         'секрет=hunterhunter'],
  ]) {
    const r = najti_sekret(obrazec);
    if (!r) { bed.push(`${imya}: ПРОПУЩЕН — русское слово выпало из перечня`); continue; }
    if (r.klass !== 'obyavlennyj')
      bed.push(`${imya}: признак «${r.klass}», а ждали «obyavlennyj»`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Именуем пробу по признаку. Парная проверка коротких префиксов sk-/pk-/rk-: короткий первый кусок не должен скрывать ключ после key:, а проза, пути и адреса должны проходить. Снятие требования непосредственной близости сломает вторую половину.
// EN: Name the probe by its property. Paired sk-/pk-/rk- prefix check: a short first segment must not hide a key after key:, while prose, paths, and addresses must pass. Removing the adjacency requirement breaks the second half.
proba('П-префикс ключ с коротким префиксом ловится (sk-, pk-, rk-)', () => {
  for (const s of ['key: sk-ant-oat01-AbCdEf123456', 'API_KEY=sk-proj-AbCdEf123456', // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
                   'token: pk-live-AbCdEf123456', 'ключ: rk_test-AbCdEf123456']) {
    const r = najti_sekret(s)
    if (!r || String(r.klass).startsWith('slabyj:')) {
      throw new Error('ПРОПУЩЕН: ' + s.slice(0, 30) + ' -> ' + (r ? r.klass : 'пусто'))
    }
  }
})

proba('П-префикс-бис фраза о секрете, путь и адрес НЕ ловятся', () => {
  for (const s of ['токен лежит в /etc/publish-tokens/npm.token',
                   'путь: /opt/<агент>/plugins/dsh-pamyat-core',
                   'адрес: https://api.example.com/v1beta',
                   'ключ — это идентификатор записи в хранилище']) {
    const r = najti_sekret(s)
    if (r && !String(r.klass).startsWith('slabyj:')) {
      throw new Error('ЛОЖНОЕ ЗАПИРАНИЕ: ' + s.slice(0, 34) + ' -> ' + r.klass)
    }
  }
})

// RU: Парная проверка кириллического пароля: строчные, прописные, цифры и знаки должны считаться разными классами, а не сваливать все русские буквы в прочее.
// EN: Paired Cyrillic-password check: lowercase, uppercase, digits, and symbols must count as distinct classes rather than treating all Russian letters as other characters.
proba('П25 значение кириллицей ловится', () => {
  for (const s of ['пароль = "Секрет123#"', 'пароль: Пароль2026', 'ПАРОЛЬ: Секрет-2026!']) {
    const r = najti_sekret(s)
    if (!r || String(r.klass).startsWith('slabyj:')) {
      throw new Error('ПРОПУЩЕН: ' + s + ' -> ' + (r ? r.klass : 'пусто'))
    }
  }
})

proba('П25-бис русская проза о секрете по-прежнему НЕ ловится', () => {
  for (const s of ['ключ — это идентификатор записи в хранилище',
                   'токен лежит в /etc/publish-tokens/npm.token',
                   'пароль хранится у владельца и здесь не приводится']) {
    const r = najti_sekret(s)
    if (r && !String(r.klass).startsWith('slabyj:')) {
      throw new Error('ЛОЖНОЕ ЗАПИРАНИЕ: ' + s + ' -> ' + r.klass)
    }
  }
})

// RU: Проверяем значения разных письменностей и разрешённые формы рядом с ними. Перечень языков неполон: буквы должны классифицироваться по Unicode, иначе буквы с цифрами и знаками теряют классы. Третья проба удерживает предел.
// EN: Test values from different scripts alongside allowed forms. A language list is incomplete: classify letters through Unicode, or letters with digits and symbols lose classes. The third probe preserves the limit.
proba('П26 значение на чужой письменности ловится при знакомом слове', () => {
  for (const s of ['password = "Գաղտնի123#"', 'пароль = "Μυστικό123#"',
                   'ключ: საიდუმლო123#', 'token = "Գաղտնի123#"']) {
    const r = najti_sekret(s)
    if (!r || String(r.klass).startsWith('slabyj:')) {
      throw new Error('ПРОПУЩЕН: ' + s + ' -> ' + (r ? r.klass : 'пусто'))
    }
  }
})

proba('П26-бис слово ЕСТЬ, а класс ОДИН — не запирается (граница переехала 07.09.2026)', () => {
  // RU: Граница объявления — два класса алфавита: такие значения запираются, один класс проходит как обычное слово. Длину проверяем отдельно; объявленный секрет короче восьми символов проходит, и этот порог защищает метку маски от повторного срабатывания.
  // EN: The declaration boundary is two alphabet classes: those values reject, while one class passes as an ordinary word. Test length separately; declared secrets shorter than eight characters pass, and that threshold protects the mask marker from matching again.
  for (const s of ['пароль: աբգդական', 'ключ: гамарджоба', 'password = "καλημερα"']) {
    const r = najti_sekret(s)
    if (r && !String(r.klass).startsWith('slabyj:')) {
      throw new Error('ЛОЖНОЕ ЗАПИРАНИЕ: ' + s + ' -> ' + r.klass)
    }
  }
})

proba('П26-четв письменность БЕЗ РЕГИСТРА тоже даёт классы', () => {
  // RU: Класс \p{Lo} нужен для букв без регистра: иврит, арабский и китайский не должны терять буквенный класс. Снятие этого класса должно уронить пробу.
  // EN: The \p{Lo} class covers letters without case: Hebrew, Arabic, and Chinese must retain a letter class. Removing this class must fail the probe.
  for (const s of ['password = "סודי123#"', 'пароль: كلمة123#']) {
    const r = najti_sekret(s)
    if (!r || String(r.klass).startsWith('slabyj:')) {
      throw new Error('ПРОПУЩЕН: ' + s + ' -> ' + (r ? r.klass : 'пусто'))
    }
  }
})

proba('П26-трет ГРАНИЦА: слово-объявление на чужой письменности НЕ узнаётся', () => {
  // RU: Закрепляем предел: знакомое слово-объявление ловит значение на другой письменности, но незнакомые слова գաղտնաբառ, κωδικός и პაროლი не входят в перечень. Их добавление требует корпуса и обновления этой границы.
  // EN: Preserve the limit: a recognized declaration word detects a value in another script, but գաղտնաբառ, κωδικός, and პაროლი are not in the word list. Adding them requires a corpus and an updated boundary.
  for (const s of ['գաղտնաբառ = "Գաղտնի123#"', 'κωδικός = "Μυστικό123#"',
                   'პაროლი = "საიდუმლო123#"']) {
    const r = najti_sekret(s)
    if (r && !String(r.klass).startsWith('slabyj:')) {
      throw new Error('ГРАНИЦА СДВИНУЛАСЬ (это не дефект, обнови границу): '
        + s + ' -> ' + r.klass)
    }
  }
})

// RU: Парная проверка обращения к полю: token: process.env.MY_TOKEN должен проходить; настоящее значение с точками должно ловиться. Признак требует точки без дефисов, чтобы не освобождать ключи с дефисами.
// EN: Paired field-access check: token: process.env.MY_TOKEN must pass, while actual values containing dots must be detected. The predicate requires dots without hyphens so hyphenated keys are not exempted.
proba('П24 обращение к полю НЕ ловится', () => {
  for (const s of ['token: process.env.MY_TOKEN', 'key: config.token', 'ключ: this.secret.value']) {
    const r = najti_sekret(s)
    if (r && !String(r.klass).startsWith('slabyj:')) {
      throw new Error('ЛОЖНОЕ ЗАПИРАНИЕ: ' + s + ' -> ' + r.klass)
    }
  }
})

proba('П24-бис настоящие значения ПОСЛЕ сужения по-прежнему ловятся', () => {
  // RU: Проверяем три секретных формы с точками: набор без таких значений не обнаруживает слишком широкое исключение обращения к полю.
  // EN: Test three secret shapes containing dots: a set without them cannot detect an overly broad field-access exemption.
  for (const s of ['pwd: Hunter22xy', 'api_key=sk-ant-oat01-AbCdEf123456', // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
                   'password = Xk9#mQ2$vL8p', 'secret: a1b2-c3d4.e5f6!g7',
                   'password: Secret.Pass1', 'api_key: v1.abc123.DEF456',
                   'ключ: config.secretValue1',
                   // RU: Секрет с точкой без цифр проверяет сторону признака, которую можно ошибочно принять за обращение к полю.
                   // EN: A dotted secret without digits tests the side of the predicate that can be mistaken for field access.
                   'password: Secret.Pass',
                   // RU: Два класса и разделитель проверяются по целому значению: точка может разбить его на куски по три символа и скрыть от обычной ветки кандидатов.
                   // EN: Check two classes and a separator on the whole value: a dot can split it into three-character segments and hide it from the ordinary candidate branch.
                   'api_key: abc.def.ghi', 'token: aaa-bbb-ccc']) {
    const r = najti_sekret(s)
    if (!r || String(r.klass).startsWith('slabyj:')) {
      throw new Error('ПРОПУЩЕН: ' + s + ' -> ' + (r ? r.klass : 'пусто'))
    }
  }
})

// RU: Проверяем разнообразие набора по границам предиката: точки должны быть среди разрешённых и запрещённых значений; цифры — среди запрещённых и отсутствовать среди разрешённых. Новые оси автоматически не обнаруживаются: их перечень ведётся вручную.
// EN: Check sample diversity across predicate boundaries: dots must appear among allowed and rejected values; digits must appear among rejected values and be absent among allowed ones. New axes are not discovered automatically; the axis list is maintained manually.
proba('П26 набор представляет ОБЕ стороны каждой оси предиката «обращение к полю»', () => {
  // RU: Берём те же наборы, но проверяем разнообразие, а не решение фильтра.
  // EN: Use the same sample sets to check diversity rather than filter decisions.
  const dolzhno_prohodit = ['token: process.env.MY_TOKEN', 'ключ: config.token', 'x: this.secret.value'];
  const dolzhno_zapirat  = ['password: Secret.Pass1', 'api_key: v1.abc123.DEF456',
                            'ключ: config.secretValue1', 'pwd: Hunter22xy',
                            // RU: Объявленный секрет с точкой без цифр покрывает вторую сторону цифровой оси.
                            // EN: A declared dotted secret without digits covers the other side of the digit axis.
                            'password: Secret.Pass'];
  const znachenie = (s) => String(s).split(/[:=]/).slice(1).join(':').trim();
  // RU: Требования задаём каждой оси отдельно: точки в обеих половинах; цифры среди отвергаемых и без цифр среди разрешённых. Общий порог «три стороны из четырёх» допускает слепой набор.
  // EN: Set requirements per axis: dots in both halves; digits among rejected samples and no digits among allowed samples. An aggregate “three sides out of four” threshold permits a blind sample set.
  const osi = [
    { imya: 'точка в значении', est: (v) => v.includes('.'), nuzhno_v_prohodyashchih: true,  nuzhno_v_zapiraemyh: true },
    { imya: 'цифра в значении', est: (v) => /[0-9]/.test(v), nuzhno_v_prohodyashchih: false, nuzhno_v_zapiraemyh: true },
  ];
  const bed = [];
  for (const os of osi) {
    const v_prohodyashchih = dolzhno_prohodit.map(znachenie);
    const v_zapiraemyh = dolzhno_zapirat.map(znachenie);
    // RU: Покрытая ось требует значений по обе стороны границы, среди разрешённых и отвергаемых.
    // EN: A covered axis requires values on both sides of its boundary, among allowed and rejected samples.
    const est_v_prohodyashchih = v_prohodyashchih.some(os.est);
    const net_v_prohodyashchih = v_prohodyashchih.some((v) => !os.est(v));
    const est_v_zapiraemyh = v_zapiraemyh.some(os.est);
    const net_v_zapiraemyh = v_zapiraemyh.some((v) => !os.est(v));
    if (est_v_prohodyashchih !== os.nuzhno_v_prohodyashchih) {
      bed.push(`ось «${os.imya}»: среди ПРОПУСКАЕМЫХ ожидалось наличие=${os.nuzhno_v_prohodyashchih}, `
        + `а получилось ${est_v_prohodyashchih}`);
    }
    if (est_v_zapiraemyh !== os.nuzhno_v_zapiraemyh) {
      bed.push(`ось «${os.imya}»: среди ЗАПИРАЕМЫХ ожидалось наличие=${os.nuzhno_v_zapiraemyh}, `
        + `а получилось ${est_v_zapiraemyh}`);
    }
    // RU: Если все значения с одной стороны, ось не проверена.
    // EN: If all values lie on one side, the axis is untested.
    if (!net_v_zapiraemyh && !net_v_prohodyashchih && est_v_zapiraemyh && est_v_prohodyashchih) {
      bed.push(`ось «${os.imya}»: все значения по одну сторону — ось не разделяет`);
    }
  }
  if (bed.length) throw new Error('набор ВЫРОЖДЕН по оси, которую предикат различает: ' + bed.join(' · '));
});

// RU: Парная проверка имён переменных с подчёркиваниями: полное имя вроде FAL_API_KEY= должно объявлять секрет; обычные слова должны проходить. Голые key=/token= и слитные слова не проверяют эту форму. Образцы сохраняют написание имени, значения синтетические.
// EN: Paired underscored-variable check: a full name such as FAL_API_KEY= must declare a secret, while ordinary words pass. Bare key=/token= and concatenated words do not test this shape. Samples preserve name spelling and use synthetic values.
proba('П17 живые имена переменных с подчёркиванием ЗАПИРАЮТСЯ (истинные держатся)', () => {
  const S = 'Xk92Lm4pQz7RvB3nT8wY';   /* RU: 20 символов, три класса алфавита.
 * EN: 20 characters, three alphabet classes.
 */
  const bed = [];
  // RU: Образцы имён взяты из конфигурации; значения не читались.
  // EN: Name samples come from configuration; values were not read.
  for (const imya of ['FAL_API_KEY', 'DEEPSEEK_API_KEY', 'TELEGRAM_BOT_TOKEN',
                      'WEBHOOK_SECRET', 'VK_GROUP_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN',
                      'YANDEX_SEARCH_API_KEY', 'GATEWAY_API_KEY']) {
    for (const [vid, znach] of [['сильное', S], ['СЛАБОЕ', 'hunter2']]) {
      const r = najti_sekret(imya + '=' + znach);
      if (!r) { bed.push(`${imya}= (${vid}): ПРОПУЩЕН БЕЗ СЛЕДА`); continue; }
      if (r.klass !== 'obyavlennyj')
        bed.push(`${imya}= (${vid}): признак «${r.klass}» — значит помечен и ПРОПУЩЕН, а не заперт`);
    }
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

proba('П17-бис составные слова НЕ стали объявлением (ложные не вернулись)', () => {
  const bed = [];
  // RU: Вторая половина пары не даёт расширению формы превратить monkey= и отключ= в объявления.
  // EN: The second half prevents a broadened shape rule from treating monkey= and отключ= as declarations.
  for (const obrazec of ['monkey=hunterhunter', 'hotkey=hunterhunter',
                         'myapikey=hunterhunter', 'sortkey=hunterhunter',
                         'отключ=hunterhunter', 'подключ=hunterhunter',
                         'брелоктокен=hunterhunter']) {
    const r = najti_sekret(obrazec);
    if (r && r.klass === 'obyavlennyj')
      bed.push(`${obrazec}: составное слово принято за объявление`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Парная проверка слитных имён cftoken=/userpassword= и кавычки перед разделителем в JSON. Явные оси набора: подчёркивание, дефис, кириллица, слитное имя, закрывающая кавычка и начало строки.
// EN: Paired check for concatenated cftoken=/userpassword= names and a closing quote before a JSON separator. Explicit sample axes: underscore, hyphen, Cyrillic, concatenation, closing quote, and start of line.
proba('П18 слитное написание с token/secret/password ЗАПИРАЕТСЯ', () => {
  const S = 'Xk92Lm4pQz7RvB3nT8wY';
  const bed = [];
  for (const f of ['cftoken=' + S, 'CFTOKEN=' + S, 'apitoken=' + S, 'authtoken: hunter2',
                   'mytoken=' + S, 'userpassword=hunter2', 'dbsecret=' + S]) {
    const r = najti_sekret(f);
    if (r?.klass !== 'obyavlennyj')
      bed.push(`${f.slice(0, 24)}: признак «${r ? r.klass : '—'}» вместо obyavlennyj`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

proba('П18-бис запись в фигурных скобках ЗАПИРАЕТСЯ (кавычка перед разделителем)', () => {
  const S = 'Xk92Lm4pQz7RvB3nT8wY';
  const bed = [];
  for (const f of ['{"key": "' + S + '"}', '{ "api_key" : "' + S + '" }',
                   "{'token': '" + S + "'}", '{"password":"' + S + '"}']) {
    const r = najti_sekret(f);
    if (r?.klass !== 'obyavlennyj')
      bed.push(`${f.slice(0, 24)}: признак «${r ? r.klass : '—'}»`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Граница key избирательная: полное снятие превратит monkey= и мойключ= в объявления.
// EN: The key boundary is selective: removing it entirely makes monkey= and мойключ= declarations.
proba('П18-трет составные с key НЕ стали объявлением (ложные не вернулись)', () => {
  const bed = [];
  for (const f of ['monkey=hunter2', 'hotkey=hunter2', 'myapikey=hunter2', 'sortkey=hunter2',
                   'мойключ=hunter2', 'отключ=hunter2', 'подключ=hunter2', 'брелоктокен=hunter2']) {
    const r = najti_sekret(f);
    if (r?.klass === 'obyavlennyj') bed.push(`${f}: составное принято за объявление`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Закрепляем предел: AWSKey= и MyKey= не ловятся объявлением из-за буквы перед key. Снятие этой границы вернёт ложные отказы monkey= и мойключ=.
// EN: Preserve the limit: AWSKey= and MyKey= are not declaration matches because a letter precedes key. Removing that boundary restores false rejections for monkey= and мойключ=.
proba('П18-предел AWSKey= и MyKey= правилом объявления НЕ ловятся (известная граница)', () => {
  for (const f of ['AWSKey=Xk92Lm4pQz7RvB3nT8wY', 'MyKey=hunter2']) {
    const r = najti_sekret(f);
    if (r?.klass === 'obyavlennyj')
      throw new Error(`${f}: стало ловиться — предел сдвинулся, проверить, не вернулись ли monkey=/мойключ=`);
  }
});

// RU: Границы pin и psk защищают обычные имена spin=, dropin=, sitepin= и whitelistpsk= от ложного отказа.
// EN: Boundaries for pin and psk protect ordinary names spin=, dropin=, sitepin=, and whitelistpsk= from false rejection.
proba('П19 омонимы pin/psk НЕ принимаются за объявление, сами pin= и psk= принимаются', () => {
  const bed = [];
  for (const f of ['spin=hunter2', 'dropin=hunter2', 'sitepin=hunter2', 'whitelistpsk=hunter2'])
    if (najti_sekret(f)?.klass === 'obyavlennyj') bed.push(`${f}: омоним принят за объявление`);
  for (const f of ['pin=hunter2', 'psk=hunter2'])
    if (najti_sekret(f)?.klass !== 'obyavlennyj') bed.push(`${f}: само слово перестало ловиться`);
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: PublicKey не секрет, PresharedKey — секрет. Парная проба различает смысл слова в имени, а не одну общую форму имени.
// EN: PublicKey is not a secret; PresharedKey is. The paired probe distinguishes the word within the name rather than their shared name shape.
proba('П20 пара из живых конфигов: PublicKey= пропускается, PresharedKey= запирается', () => {
  const bed = [];
  if (najti_sekret('PublicKey=hunter2')?.klass === 'obyavlennyj')
    bed.push('PublicKey=: публичный ключ принят за секрет (639 живых вхождений)');
  if (najti_sekret('PresharedKey=hunter2')?.klass !== 'obyavlennyj')
    bed.push('PresharedKey=: общий ключ туннеля пропущен (617 живых вхождений)');
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Три косвенных признака объявления только помечают запись: корпусная оценка дала 15 ложных срабатываний и ни одного истинного. Проба удерживает режим каждого правила.
// EN: The three indirect declaration rules only mark records: corpus evaluation found 15 false positives and no true positives. The probe preserves each rule’s mode.
proba('П22 склонение и заголовок ПОМЕЧАЮТ запись, а не запирают', () => {
  const bed = [];
  for (const [imya, obrazec, ozhid] of [
    ['склонение', 'в отчёте было ключа: hunter2xyz и дальше',        'slabyj:sklonenie'],
    ['заголовок', 'строка Authorization: Bearer hunter2xyz в логе',  'slabyj:zagolovok'],
  ]) {
    let id, brosheno = null;
    try { id = k.pamyat.zapisat({ klass: 'fakt', soderzhim: obrazec }); }
    catch (e) { brosheno = e; }
    if (brosheno) { bed.push(`${imya}: ЗАПЕРЛО запись (${brosheno.code}) — класс попал в запирающие`); continue; }
    if (!id) { bed.push(`${imya}: запись не состоялась без исключения`); continue; }
    const zap = k.pamyat.prochitat({ skolko: 1 })?.[0];
    if (!zap?.podozrenie) bed.push(`${imya}: прошла БЕЗ пометки — признак не сработал`);
    else if (zap.podozrenie.klass !== ozhid)
      bed.push(`${imya}: пометка называет ${zap.podozrenie.klass}, ждали ${ozhid}`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// RU: Вторая половина пары: прямое объявление продолжает отвергать секрет.
// EN: The second half: a direct declaration still rejects the secret.
proba('П22-бис прямое объявление по-прежнему ЗАПИРАЕТ (режимы не слились)', () => {
  let brosheno = null;
  try { k.pamyat.zapisat({ klass: 'proba-vne-maski', soderzhim: 'в файле ключ: hunter2xyz лежит' }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('прямое объявление записалось — запирающий режим потерян');
  if (brosheno.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('чужой код: ' + brosheno.code);
});

// RU: Парная проверка маски на прямом пути записи: секретное значение заменяется, разрешённое сохраняется. Одно лишь успешное маскирование не ограничивает ложные замены.
// EN: Paired mask check on the direct write path: secret values are replaced and allowed values remain. Successful masking alone does not constrain false replacements.
proba('П24 урок с ОБРАЗЦОМ записывается С МАСКОЙ, значение в память не идёт', () => {
  const id = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'разбор фильтра: password: Secret.Pass1 проходил молча' });
  if (!id) throw new Error('урок с образцом не записан — маска не отработала');
  const z = k.pamyat.prochitat({ skolko: 1 })?.[0];
  const t = String(z?.soderzhim ?? '');
  if (t.includes('Secret.Pass1')) throw new Error('ЗНАЧЕНИЕ образца попало в память — маска не сработала');
  // RU: Метка заменённого значения содержит класс правила и позицию; голые звёздочки не объясняют срабатывание.
  // EN: The replacement marker contains the rule class and position; bare asterisks do not explain the match.
  if (!/\[скрыто obyavlennyj @\d+\]/.test(t)) {
    throw new Error('на месте значения нет метки «класс + позиция»: ' + t);
  }
  if (!t.includes('password:')) throw new Error('съедено слово-объявление — маска вышла за границу');
  // RU: След маски проверяем в сохранённом тексте и таблице журнала. Отдельное поле записи не хранится: хранилище сохраняет только объявленные столбцы.
  // EN: Check the mask trace in persisted text and the journal table. No separate record field is stored: storage keeps only declared columns.
  const dbm = new DatabaseSync(join(kat, 'p.db'), { readOnly: true });
  const rm = dbm.prepare("SELECT pochemu FROM zhurnal WHERE priroda = ? ORDER BY id DESC LIMIT 1").get('maska-obrazcov');
  dbm.close?.();
  if (!rm) throw new Error('в журнале нет строки о маске — подмена не объявлена');
  if (/Secret\.Pass1/.test(String(rm.pochemu ?? ''))) throw new Error('🔴 в строку журнала попало ЗНАЧЕНИЕ');
  // RU: Журнал должен называть места замен, а не только их число, чтобы можно было разобрать срабатывание.
  // EN: The journal must identify replacement positions, not merely their count, so the match can be investigated.
  if (!String(rm.pochemu ?? '').includes('Место (правленый текст')) {
    throw new Error('журнал не называет МЕСТО подмены: ' + String(rm.pochemu).slice(0, 120));
  }
  if (!/\[скрыто /.test(String(rm.pochemu ?? ''))) {
    throw new Error('в приведённом месте нет метки — значит показан не тот фрагмент');
  }
});

proba('П24-бис настоящий по ФОРМЕ секрет НЕ маскируется и запись ОТКЛОНЯЕТСЯ', () => {
  let brosheno = null;
  try { k.pamyat.zapisat({ klass: 'urok', soderzhim: 'ключ провайдера sk-abcdefghijklmnopqrstuvwx' }); } // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('структурный секрет прошёл — маска стала тихой дырой');
  if (brosheno.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('чужой код: ' + brosheno.code);
});

proba('П24-трет класс ВНЕ области маски по-прежнему ЗАПИРАЕТ объявленный', () => {
  let brosheno = null;
  try { k.pamyat.zapisat({ klass: 'ne-znanie-i-ne-svodka', soderzhim: 'password: Secret.Pass1' }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('маска расползлась за свою область');
  if (brosheno.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('чужой код: ' + brosheno.code);
});

// RU: Позиции меток относятся к исходному тексту. Несколько замен различают исходный и изменённый отсчёт: длина метки меняет последующие позиции.
// EN: Marker positions refer to the original text. Multiple replacements distinguish original from edited offsets: marker length shifts later positions.
proba('П24-четв метка несёт КЛАСС и ПОЗИЦИЮ, а не безымянные звёздочки', () => {
  const m = zamaskirovat('password: Secret.Pass1 конец');
  if (m.zameneno !== 1) throw new Error('замен ' + m.zameneno + ', ожидалась 1');
  const sovpalo = /\[скрыто (\w+) @(\d+)\]/.exec(m.tekst);
  if (!sovpalo) throw new Error('метки нет вовсе: ' + m.tekst);
  if (sovpalo[1] !== 'obyavlennyj') throw new Error('в метке чужой класс: ' + sovpalo[1]);
  if (Number(sovpalo[2]) !== 10) throw new Error('позиция ' + sovpalo[2] + ', значение начиналось с 10');
});

proba('П24-пят при ДВУХ заменах вторая позиция — по ИСХОДНОМУ тексту, не по правленому', () => {
  const vhod = 'Разбор: pwd=Hunter22xy и ещё api_key: v1.abc123.DEF456 всё';
  const m = zamaskirovat(vhod);
  if (m.zameneno !== 2) throw new Error('замен ' + m.zameneno + ', ожидалось 2');
  if (!m.poziciiNadezhny) throw new Error('маска сама объявила позиции ненадёжными');
  const pozicii = [...m.tekst.matchAll(/@(\d+)\]/g)].map((x) => Number(x[1]));
  if (pozicii.length !== 2) throw new Error('меток ' + pozicii.length + ', ожидалось 2');
  // RU: Сверяем обе позиции с исходным текстом: каждая должна указывать на соответствующее значение.
  // EN: Compare both positions with the original text: each must point to its corresponding value.
  if (!vhod.startsWith('Hunter22xy', pozicii[0])) {
    throw new Error('первая позиция ' + pozicii[0] + ' не указывает на значение в ИСХОДНОМ тексте');
  }
  if (!vhod.startsWith('v1.abc123.DEF456', pozicii[1])) {
    throw new Error('вторая позиция ' + pozicii[1] + ' считана по ПРАВЛЕНОМУ тексту: ' +
      'сдвиг от первой замены не учтён (в исходном там «' + vhod.slice(pozicii[1], pozicii[1] + 16) + '»)');
  }
});

// RU: Форма метки не должна снова ловиться объявлением. [obyavlennyj@412] ловится, [obyavlennyj @412] не ловится: пробел завершает значение правила.
// EN: The marker must not match the declaration rule again. [obyavlennyj@412] matches; [obyavlennyj @412] does not, because a space terminates the rule’s value.
proba('П24-шест метка НЕ ловится фильтром — иначе маска заменяет метку меткой', () => {
  // RU: Проверяем число замен, а не только итог или upyorsya: повторная замена метки может сама остановиться, оставив внешне чистый результат с двумя заменами одного образца.
  // EN: Check replacement count, not just the result or upyorsya: remasking a marker may stop by itself and leave an apparently clean result after replacing one sample twice.
  for (const vhod of ['password: Secret.Pass1', 'pwd=Hunter22xy', 'api_key: v1.abc123.DEF456']) {
    const m = zamaskirovat(vhod);            /* RU: На входе ровно один образец.
 * EN: The input contains exactly one sample.
 */
    if (m.zameneno !== 1) {
      throw new Error('замен ' + m.zameneno + ' на ОДИН образец («' + vhod + '») — ' +
        'метка сама подпадает под правило и маскируется повторно: ' + m.tekst);
    }
    if (m.upyorsya) throw new Error('маска упёрлась в предел на «' + vhod + '»');
    const r = najti_sekret(m.tekst);
    if (r) throw new Error('метка снова ловится как «' + r.klass + '»: ' + m.tekst);
  }
});

// RU: Удаляем базу после всех использующих её проб; ранняя уборка вызывает attempt to write a readonly database и имитирует дефект ядра.
// EN: Remove the database after every probe using it; early cleanup causes attempt to write a readonly database and mimics a core defect.
rmSync(kat, { recursive: true, force: true });

// RU: Сверяем таблицу rezhim() со всеми классами из исходника фильтра: neizvesten допустим для чужого класса, но опасен для своего. Перечень извлекается текстовой маской; классы, собранные из переменных, она не обнаружит.
// EN: Compare the rezhim() table with every class in filter source: neizvesten is valid for an external class but dangerous for an internal one. A text pattern extracts the list; it cannot detect classes assembled from variables.
proba('П23 таблица режимов знает все классы, которые возвращает фильтр', () => {
  const ishodnik = readFileSync(new URL('../src/filtr-vhoda.js', import.meta.url), 'utf8');
  const najdeny = new Set();
  for (const m of ishodnik.matchAll(/klass:\s*'([a-z][a-z0-9:_-]*)'/gi)) najdeny.add(m[1]);
  for (const m of ishodnik.matchAll(/'(strukturnyj|slabyj):'\s*\+/g)) najdeny.add(m[1] + ':obrazec');
  if (najdeny.size === 0) throw new Error('перечень классов не снялся — маска ничего не нашла');
  const neizvestnye = [...najdeny].filter((k) => rezhim(k) === 'neizvesten');
  if (neizvestnye.length) throw new Error('таблица не знает своих же классов: ' + neizvestnye.join(', '));
  console.log('       (классов проверено: ' + najdeny.size + ')');
});

// RU: Сводный набор называет оси каждого образца и печатает покрытие. Пустая заявленная ось — расхождение: такой набор не проверяет соответствующий признак. Перечень осей ручной; полностью отсутствующую ось стенд не обнаружит.
// EN: The combined sample set labels each sample’s axes and reports coverage. An empty declared axis is a mismatch: that set cannot test the corresponding predicate. The axis list is manual; the suite cannot detect an axis absent from the list.
const NABOR = [
  // RU: Точки без дефисов проверяют исключение обращения к полю.
  // EN: Dots without hyphens test the field-access exemption.
  ['password: Secret.Pass1',      'zaperto', ['tochki-bez-defisov']],
  ['api_key: v1.abc123.DEF456',   'zaperto', ['tochki-bez-defisov']],
  ['ключ: config.secretValue1',   'zaperto', ['tochki-bez-defisov', 'kirillica']],
  ['key: Xy9.abc_de',             'zaperto', ['tochki-bez-defisov']],
  ['password: a.b.c.D1',          'zaperto', ['tochki-bez-defisov']],
  ['password: Секрет.Пароль1',    'zaperto', ['tochki-bez-defisov', 'kirillica']],
  // RU: Кириллица проверяет классификацию букв.
  // EN: Cyrillic tests letter classification.
  ['пароль = "Секрет123#"',       'zaperto', ['kirillica', 'speczaki']],
  ['пароль: Пароль2026',          'zaperto', ['kirillica']],
  ['ПАРОЛЬ: Секрет-2026!',        'zaperto', ['kirillica', 'speczaki']],
  // RU: Проверяем спецзнаки и кавычки.
  // EN: Test special characters and quotes.
  ['secret: a1b2-c3d4.e5f6!g7',   'zaperto', ['speczaki']],
  ['pwd="Ab1!cdefgh"',            'zaperto', ['speczaki']],
  // RU: Разрешённые контроли обязательны: иначе правило «запретить всё» пройдёт набор.
  // EN: Allowed controls are required; otherwise “reject everything” passes the set.
  ['token: process.env.MY_TOKEN', 'proydyot', ['obrashchenie-k-polyu']],
  ['key: config.token',           'proydyot', ['obrashchenie-k-polyu']],
  ['this.secret.value',           'proydyot', ['obrashchenie-k-polyu']],
  // RU: Известный ложный отказ lowerCamelCase сохраняется намеренно: освобождение по этому виду открыло бы пропуск ключей, и ожидание отражает принятое решение.
  // EN: The known lowerCamelCase false rejection is intentional: exempting this shape would allow keys through, and the expectation preserves that decision.
  ['key: lastTouchedAt',          'zaperto', ['obrashchenie-k-polyu']],
];
const OSI = ['tochki-bez-defisov', 'kirillica', 'speczaki', 'obrashchenie-k-polyu'];

proba('сводный набор: каждая форма ведёт себя как объявлено', () => {
  const bedy = [];
  for (const [stroka, zhdyom] of NABOR) {
    const najdeno = najti_sekret(stroka);
    const bylo = najdeno ? 'zaperto' : 'proydyot';
    if (bylo !== zhdyom) bedy.push(`«${stroka}» ждали ${zhdyom}, вышло ${bylo}` +
      (najdeno ? ` (класс ${najdeno.klass})` : ''));
  }
  if (bedy.length) throw new Error(`бед ${bedy.length} из ${NABOR.length}: ` + bedy.join(' · '));
  console.log(`       (бед 0 из ${NABOR.length})`);
});

// RU: Маска обрабатывает только obyavlennyj. На помечающем классе вроде entropiya она останавливается и должна назвать ostalos. Проверяем сквозной путь: маска, затем фильтр по её результату.
// EN: The mask handles only obyavlennyj. It stops at a marking class such as entropiya and must report ostalos. Test the complete path: mask, then filter the mask’s output.
proba('маска, остановившись на помечающем классе, НАЗЫВАЕТ его в ostalos', () => {
  const m = zamaskirovat('token: ghp_0123456789abcdef ghp_fedcba9876543210');
  if (m.zameneno !== 1) throw new Error('ожидалась одна замена, вышло ' + m.zameneno);
  if (m.ostalos !== 'entropiya') {
    throw new Error('маска остановилась и МОЛЧИТ: ostalos=' + JSON.stringify(m.ostalos)
      + ' — вызывающий не отличит «нечего маскировать» от «остановилась»');
  }
});

// RU: Если после маски ничего не осталось, ostalos должен быть null; контроль исключает прибор, всегда возвращающий entropiya.
// EN: If nothing remains after masking, ostalos must be null; this control rejects a detector that always returns entropiya.
proba('ПОКАЗАТЕЛЬ: маска домаскировала до конца → ostalos null, остаток чист', () => {
  const m = zamaskirovat('password: abc12345');
  if (m.ostalos !== null) throw new Error('ostalos должен быть null, вышло ' + JSON.stringify(m.ostalos));
  if (najti_sekret(m.tekst)) throw new Error('в остатке найден секрет, хотя маска дошла до конца');
});

proba('сводный набор: ни одна ось не пуста', () => {
  const schyot = new Map(OSI.map((o) => [o, 0]));
  for (const [, , osi] of NABOR) for (const o of osi) {
    if (!schyot.has(o)) throw new Error(`ось «${o}» есть у образца, но её нет в перечне OSI`);
    schyot.set(o, schyot.get(o) + 1);
  }
  const pustye = OSI.filter((o) => schyot.get(o) === 0);
  console.log('       оси набора: ' + OSI.map((o) => `${o} ${schyot.get(o)}`).join(' · '));
  if (pustye.length) throw new Error('ОСЬ ПУСТА: ' + pustye.join(', ') +
    ' — набор не проверяет признак, который по ней различает');
});

proba('сводный набор: есть обе стороны — и запираемые, и проходящие', () => {
  const z = NABOR.filter(([, o]) => o === 'zaperto').length;
  const p = NABOR.filter(([, o]) => o === 'proydyot').length;
  console.log(`       (запираемых ${z} · проходящих ${p})`);
  if (!z || !p) throw new Error(`односторонний набор: запираемых ${z}, проходящих ${p}` +
    ' — набор без второй стороны узаконил бы «запирай всё» либо «пропускай всё»');
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
