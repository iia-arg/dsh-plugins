/** Стенд фильтра входа памяти (Э5.2). Замысел и приёмка получены служебным каналом.
 *
 *  🔴 ЧЕГО ЭТОТ СТЕНД НЕ ДОКАЗЫВАЕТ: что вход «проверен». Фильтр закрывает невидимые
 *  символы и секреты; отравление добросовестным ПЕРЕСКАЗОМ чужого письма чужой моделью
 *  им не закрывается вовсе (см. шапку src/filtr-vhoda.js). Зелёный стенд говорит только
 *  о двух названных вещах.
 */
import { ochistit, najti_sekret, filtr_ispraven, trevozhno, proverit_sluzhebnoe, normalizovat } from '../src/filtr-vhoda.js';

let ok = 0, bed = 0;
const t = (imya, f) => { try { f(); ok++; console.log('  ok   ' + imya); }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message); } };

// ── П1: TAG-символы ───────────────────────────────────────────────────────────
t('П1 текст с TAG-символами → вычищен, klassy=["tag"]', () => {
  const r = ochistit('обычная статья \u{E0041}\u{E0042}\u{E0043} про замер');
  if (!r.ochistka) throw new Error('отметки нет — чистка не состоялась');
  if (!r.ochistka.klassy.includes('tag')) throw new Error('класс не назван: ' + r.ochistka.klassy);
  if (/[\u{E0000}-\u{E007F}]/u.test(r.tekst)) throw new Error('TAG остались в тексте');
});

// ── П2: bidi-override ─────────────────────────────────────────────────────────
t('П2 bidi-override → вычищен, класс ОТЛИЧАЕТСЯ от П1', () => {
  const r = ochistit('текст ‮ перевёрнут');
  if (!r.ochistka) throw new Error('отметки нет');
  if (!r.ochistka.klassy.includes('bidi')) throw new Error('класс не «bidi»: ' + r.ochistka.klassy);
  if (r.ochistka.klassy.includes('tag')) throw new Error('П1 и П2 дали ОДИН ответ — порча не та');
});

// ── П3: объявленный секрет ────────────────────────────────────────────────────
t('П3 «password: hunter2» (8 знаков) → найден как объявленный', () => {
  const s = najti_sekret('в настройке password: hunter2 стоит');
  if (!s) throw new Error('секрет пропущен');
  if (s.klass !== 'obyavlennyj') throw new Error('класс ' + s.klass);
});

t('П3-бис значение секрета НЕ возвращается наружу', () => {
  const s = najti_sekret('password: hunter2');
  if (JSON.stringify(s).includes('hunter2')) throw new Error('значение утекло в исход');
});

// ── П4: энтропия ──────────────────────────────────────────────────────────────
t('П4 строка высокой энтропии от 20 знаков → найдена', () => {
  const s = najti_sekret('где-то тут aB3xK9mQ2pL7vN4wR8tZc5Yd лежит');
  if (!s) throw new Error('пропущена');
  if (s.klass !== 'entropiya') throw new Error('класс ' + s.klass);
});

// ── П5: ЛОЖНО-КРАСНОЕ. Наши собственные тексты не должны блокироваться ────────
// 🔴 Обязательна: первая редакция фильтра давала 5 ложных из 6 на НАСТОЯЩИХ записях
// памяти (пути, составные идентификаторы, слово «ключ» в прозе о том, где он лежит).
// При fail-closed это значило бы, что память перестала работать почти целиком.
t('П5 наши обычные тексты проходят: путь, идентификатор, сумма, проза о ключе', () => {
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

// ── П6: сломанный фильтр ──────────────────────────────────────────────────────
t('П6 канарейка фильтра исправна на целом фильтре', () => {
  const k = filtr_ispraven();
  if (!k.ispraven) throw new Error('канарейка провалена на исправном: ' + k.pochemu);
});

// ── порог тревоги ─────────────────────────────────────────────────────────────
t('порог тревоги: одиночный BOM — не тревога, двадцать знаков — тревога', () => {
  const malo = ochistit('текст ﻿ один');
  if (trevozhno(malo.ochistka)) throw new Error('одиночный BOM поднял тревогу — порог не работает');
  const mnogo = ochistit('текст ' + '​'.repeat(25) + ' много');
  if (!trevozhno(mnogo.ochistka)) throw new Error('25 невидимых знаков не подняли тревогу');
});

t('чистый текст → отметки НЕТ вовсе (пустой объект не пишется)', () => {
  const r = ochistit('обычная статья про замер и числа');
  if (r.ochistka !== null) throw new Error('на чистом тексте появилась отметка: ' + JSON.stringify(r.ochistka));
});


// ── П7 замысла: ВРЕЗКА ДО РАЗВИЛКИ, проверяется ПОВЕДЕНИЕМ на настоящем ядре ───
// 🔴 Не грепом по коду: греп стережёт раскладку, а нужен ответ «пройдёт ли грязный
// текст мимо фильтра по ВТОРОЙ ветке» — той, где класс требует подтверждения, а
// отвечающего на узле нет. Именно эта ветка возвращается раньше общего пути.
const { Context } = await import('@deepseek-ai/cordis');
const { apply, name, Config } = await import('../src/index.js');
const { mkdtempSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');

const kat = mkdtempSync(join(tmpdir(), 'stend-filtra-'));
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

t('П7 секрет отвергается и на ветке «класс требует подтверждения»', () => {
  let broshено = null;
  try {
    // ograničenie — класс из перечня «спрашивать»; на узле без отвечающего он идёт
    // РАННИМ возвратом, то есть по второй ветке.
    k.pamyat.zapisat({ klass: 'ogranichenie', soderzhim: 'настройка password: hunter2 внутри' });
  } catch (e) { broshено = e; }
  if (!broshено) throw new Error('секрет записан через ветку подтверждения — фильтр стоит не до развилки');
  if (broshено.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('иной отказ: ' + broshено.code);
});

t('П7-бис чистка работает и на той же ветке: отметка в записи', () => {
  const id = k.pamyat.zapisat({ klass: 'ogranichenie', soderzhim: 'правило \u{E0041}\u{E0042} с тегом' });
  const z = k.pamyat.poId ? k.pamyat.poId(id) : null;
  if (z && z.ochistka === null) throw new Error('отметки о чистке нет в записи');
});



// ── П8: суммы и опознаватели ДОЛЖНЫ проходить ────────────────────────────────
t('П8 sha256/md5/sha1/uuid проходят — они в каждом нашем отчёте', () => {
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

t('П8-бис hex ИНОЙ длины без объявления — задержан (класс отличается от энтропии)', () => {
  const r = najti_sekret('psk 0083e4a0781203aa1b2c3d4e5f60718293a4b5c6d7e8f901');
  if (!r) throw new Error('hex-кандидат пропущен');
  if (r.klass !== 'hex-bez-obyavleniya') throw new Error('класс ' + r.klass);
});

// ── П9: служебные поля — ОТКАЗ, а не чистка ──────────────────────────────────
// 🔴 Невидимый знак в `klass` не совпадёт с перечнем классов: запись уйдёт «вне перечня»,
// громко и законно, а знание в долговременную память не поедет. Тихая потеря под видом
// штатного отказа. Потому здесь отказ, а не молчаливое исправление.
t('П9 klass с невидимым символом → ОТКАЗ с именем поля, а не чистка', () => {
  const r = proverit_sluzhebnoe('klass', 'resh\u200Benie');
  if (!r) throw new Error('невидимый в служебном поле пропущен');
  if (r.pole !== 'klass') throw new Error('поле не названо: ' + JSON.stringify(r));
});

t('П9-бис обычный klass проходит, ложного отказа нет', () => {
  if (proverit_sluzhebnoe('klass', 'reshenie')) throw new Error('ложный отказ на чистом классе');
  if (proverit_sluzhebnoe('istochnik', 'telegram-a2a#50681-58511')) throw new Error('ложный отказ на источнике');
});

t('NFC применяется к служебному полю (форма, а не содержание)', () => {
  const razlozhennoe = 'e\u0301'; // e + комбинирующий акут
  if (normalizovat(razlozhennoe) === razlozhennoe) throw new Error('NFC не применилась');
});

// ── П10: uuid после слова-объявления ─────────────────────────────────────────
// 🔴 Дефисы режут uuid на куски 8/4/4/4/12 — все короче любого порога, поэтому кандидатом
// он не становится ВООБЩЕ. Правило объявления его не видит: тире объявлением не считается.
// Две пробы обязаны РАЗОЙТИСЬ: объявленный uuid — секрет, голый — идентификатор.
t('П10 объявленный uuid → ОТВЕРГНУТ', () => {
  const r = najti_sekret('в настройке стоит token: 3f2504e0-4f89-11d3-9a0c-0305e82c3301 и дальше');
  if (!r) throw new Error('объявленный uuid пропущен — целый класс ключей проходит молча');
  if (r.klass !== 'uuid-obyavlennyj') throw new Error('назван не тот класс: ' + r.klass);
  if ('znachenie' in r) throw new Error('фильтр вернул ЗНАЧЕНИЕ — он стал публикатором секретов');
});

t('П10-бис голый uuid → ЗАПИСАН (ложного отказа нет)', () => {
  // Идентификаторов такой формы у нас полно: сессии, сообщения журнала. Блокировать их
  // значило бы вернуть те самые 5 ложных из 6, на которых правка порогов и родилась.
  if (najti_sekret('компакт 2173d27a-b348-4bdc-9025-09e45a26cd50 завершён (ход 706)'))
    throw new Error('ложный отказ на голом идентификаторе');
});

t('П10-трет объявление ЧЕРЕЗ ТИРЕ объявлением не считается', () => {
  // «ключ - uuid» это проза, а не присваивание. Разделитель обязателен: : или =
  if (najti_sekret('ключ - 3f2504e0-4f89-11d3-9a0c-0305e82c3301 в таблице'))
    throw new Error('тире принято за объявление — вернулись к окну в 40 знаков');
});

// ── П11: объявление через «=» ловится наравне с «:» ──────────────────────────
// 🔴 Замер 04.09.2026: пока «=» стоял в алфавите кандидата, `pwd=Hunter22xy` становился
// ОДНИМ кандидатом вместе со словом-объявлением, окно перед ним оказывалось пустым, и
// правило не срабатывало НИ РАЗУ на этой форме. При этом комментарий рядом обещал обе
// формы — код противоречил своему описанию, и увидеть это можно было только прогоном.
// Форма «КЛЮЧ=значение» — самая частая там, где секреты живут: .env, export, systemd.
t('П11 объявление через «=» → ОТВЕРГНУТ (как и через «:»)', () => {
  for (const s of ['pwd=Hunter22xy', 'api_key=abc123XY', 'token=s3cretValue']) {
    const r = najti_sekret('в файле ' + s + ' лежит');
    if (!r) throw new Error('форма «слово=значение» пропущена: ' + s.split('=')[0] + '=…');
    if (r.klass !== 'obyavlennyj') throw new Error('назван не тот класс: ' + r.klass);
  }
});

t('П11-бис обе формы дают ОДИН ответ — иначе разделитель решает судьбу секрета', () => {
  const dvoetochie = najti_sekret('в файле pwd: Hunter22xy лежит');
  const ravno      = najti_sekret('в файле pwd=Hunter22xy лежит');
  if (Boolean(dvoetochie) !== Boolean(ravno))
    throw new Error('формы расходятся: «:» ' + Boolean(dvoetochie) + ', «=» ' + Boolean(ravno));
});

// ── П12: СИНТЕТИЧЕСКИЕ КЛЮЧИ ПО ФОРМЕ ЖИВЫХ, КАЖДЫЙ СВОИМ ПРИЗНАКОМ ──────────
// 🔴 ЗАЧЕМ ИМЕННО ТАК. Замер соседней машины 04.09.2026 по четырём живым ключам фермы:
// два ловятся ТОЛЬКО энтропией, два ТОЛЬКО структурным признаком. Правила не дублируют
// друг друга — снимешь одно, и часть ключей пройдёт молча, а стенд останется зелёным,
// потому что остальные ловятся соседним правилом.
// Поэтому проба требует не «отвергнут», а «отвергнут СВОИМ признаком» и печатает каким.
// Значения синтетические: ни один настоящий ключ в стенд не попадает.
t('П12 каждая форма ключа отвергается СВОИМ признаком', () => {
  const obrazcy = [
    ['длинный без приставки (форма oauth-токена)', 'aB3xK9mQ2wZ7pL4vN8tR6yH1jF5sD0gW7cX2bV9nM4kP', 'entropiya'],
    ['sk- (форма ключа провайдера)',               'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'strukturnyj:sk-'],
    ['gh*_ (форма ключа хранилища кода)',          'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'strukturnyj:github'],
    ['JWT (форма долгоживущего токена)',           'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
                                                   'strukturnyj:JWT'],
    ['PEM (закрытый ключ)',                        '-----BEGIN OPENSSH PRIVATE KEY-----', 'strukturnyj:PEM'],
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

t('П12-бис проза того же вида НЕ отвергается (ложного нет)', () => {
  // формы, которые в нашем корпусе давали ложные до правок алфавита
  for (const s of ['таймер с OnBootSec+OnUnitActiveSec уходит',
                   'путь /opt/agent/workspace/dorabotki/nashi-dorabotki.sh',
                   'имя dsh-pamyat-restore-0.1.0-alpha.14',
                   'вызов byudzhetPamyati.otobrat вернул',
                   'запись mem-59dad1ad402a найдена']) {
    const r = najti_sekret(s);
    if (r) throw new Error(`ложный отказ [${r.klass}] на: ${s.slice(0, 40)}`);
  }
});

// ── П13: РЕЖИМ ОТКАЗА ПО ПРАВИЛУ, А НЕ ПО ЗАЩИТЕ ЦЕЛИКОМ ─────────────────────
// 🔴 Решение автора замысла 04.09.2026, правка его же исходного «fail-closed на всё».
// (а) объявленный и структурные — запирают: ложных почти нет по построению.
// (б) энтропия — ПОМЕТКА, запись проходит: правило судит по ВИДУ строки и на больших
// корпусах знаний режет настоящие записи (замер соседнего узла: 2–16% из 3560).
// Две пробы обязаны РАЗОЙТИСЬ: одна ждёт исключения, другая — записи с пометкой.
t('П13 объявленный секрет ЗАПИРАЕТ запись', () => {
  let brosheno = null;
  try { k.pamyat.zapisat({ klass: 'fakt', soderzhim: 'в файле pwd: Hunter22xy лежит' }); }
  catch (e) { brosheno = e; }
  if (!brosheno) throw new Error('объявленный секрет записан — правило (а) не запирает');
  if (brosheno.code !== 'PAMYAT_SEKRET_NA_VHODE') throw new Error('чужой код: ' + brosheno.code);
});

t('П13-бис энтропийное подозрение ПРОПУСКАЕТ запись и метит её', () => {
  // строка того же вида, что живой ключ: 44 знака, три класса алфавита, высокая энтропия
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

t('П13-трет пометка и чистка — РАЗНЫЕ поля, не одно', () => {
  // «что изменили» и «в чём подозрение» — разные вопросы; слить их значит потерять оба
  const zap = k.pamyat.prochitat({ skolko: 1 })?.[0];
  if (zap?.podozrenie && zap?.ochistka && zap.podozrenie === zap.ochistka)
    throw new Error('подозрение и чистка оказались одним полем');
});

// ── П14: ГОЛОЕ `key` В ПЕРЕЧНЕ ОБЪЯВЛЕНИЙ ────────────────────────────────────
// Форма key=<значение> — самая частая там, где секреты живут: .env, export, systemd
// EnvironmentFile (набор форм снят с живых файлов соседней машины 04.09.2026).
// До этой правки её держала ЭНТРОПИЯ, а не объявление; когда правило (б) стало пометкой,
// форма пошла в память. Проба требует ИМЕННО класс obyavlennyj: если она позеленеет на
// классе entropiya — значит держит опять подпорка, а не опора, и снятие режима её уронит.
t('П14 голое key= отвергается классом obyavlennyj, а не энтропией', () => {
  const bed = [];
  for (const [imya, obrazec] of [
    ['key=<сильный>',   'key=Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp'],
    ['key="<сильный>"', 'key="Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp"'],
    ['key: <сильный>',  'key: Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp'],
    // 🔴 СЛАБЫЙ ОБЯЗАТЕЛЕН: он не ловится энтропией ВООБЩЕ (12 строчных букв, один класс).
    // Только на нём видно, что работает объявление. Сильный прошёл бы и без правки.
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

t('П14-бис проза со словом key НЕ отвергается (разделитель обязателен)', () => {
  for (const s of ['поле key в этом объекте называет форму, а не значение',
                   'ключ лежит в /etc/publish-tokens, я его не печатаю',
                   'ищи по слову key в перечне SLOVA_OBYAVLENIYA']) {
    const r = najti_sekret(s);
    if (r) throw new Error(`ложный отказ [${r.klass}] на прозе: ${s.slice(0, 40)}`);
  }
});

// ── П15: НЕДЕЛИМОСТЬ. СТОРОЖ НА РЕШЕНИЕ, А НЕ НА РАБОТУ ──────────────────────
// 🔴 04.09.2026 выпуск a20 отдал режим-пометку БЕЗ `key` в перечне — то есть снял
// подпорку, не поставив опору, и на полсуток открыл форму key=<секрет> в память.
// Решение «эти две правки одним выпуском» было принято тремя сторонами и жило только
// в письмах: ни стенд, ни ворота выпуска не знали, что их нельзя разлучать.
// Класс: НЕДЕЛИМОСТЬ ПРЕДМЕТА ЖИВЁТ В РЕШЕНИИ, А В КОДЕ ЕЁ НИЧТО НЕ ДЕРЖИТ.
// Эта проба и есть то место, где она теперь держится: пока энтропия — пометка,
// отсутствие `key` роняет стенд ДО реестра.
// ⚠️ Где она НЕ работает и когда снимается: она не проверяет прочие слова перечня и
// молчит, если режим (б) вернут в отказ — тогда подпорка снова на месте и связь не нужна.
// Проба судит по ПОВЕДЕНИЮ обоих правил, а не по тексту файла: искать `key` грепом
// по исходнику значило бы считать и это объяснение (наш класс за 04.09).
t('П15 режим-пометка и key в перечне — НЕРАЗЛУЧНЫ', () => {
  const rezhim_pometka = najti_sekret('в отчёте aB3xK9mQ2wZ7pL4vN8tR6yH1jF5sD0gW7cX2bV9nM4kP далее')?.klass === 'entropiya';
  const key_v_perechne = najti_sekret('key=hunterhunter')?.klass === 'obyavlennyj';
  if (!rezhim_pometka) return;   // (б) снова запирает — подпорка на месте, связь не нужна
  if (!key_v_perechne)
    throw new Error('энтропия помечает, но key НЕ в перечне: форма key=<секрет> уходит в память');
});

// ── П16: ГРАНИЦА СЛОВА СЛЕВА, ОБЕ СТОРОНЫ ───────────────────────────────────
// Слово перечня, сидящее ХВОСТОМ внутри другого слова, объявлением не является:
// «monkey=», «hotkey=», «myapikey=» — не объявления ключа. До правки 04.09.2026
// правило брало их все (замер: 8 ложных из 8).
// 🔴 ДВЕ ПРОБЫ, А НЕ ОДНА, И ПРИЧИНА В ЛЕЧЕНИИ. Очевидное лечение — \b перед словом —
// закрывает латиницу и МОЛЧА выключает четыре русских слова перечня: \b определён через
// \w = [A-Za-z0-9_], поэтому перед кириллицей границы нет никогда. Одна проба на ложные
// позеленела бы, и «ключ=<секрет>» ушёл бы в память при зелёном стенде.
// Поэтому пара обязана давать РАЗНЫЕ ответы: первая — что лишнего не берём,
// вторая — что своё не потеряли. Порознь каждая пропускает своё лечение.
t('П16 слово-объявление ХВОСТОМ внутри другого слова — не объявление', () => {
  const bed = [];
  for (const obrazec of ['monkey=Xk7Qm2Vb9Rt4Ws8Ez1Nc6Yp', 'hotkey=hunterhunter',
                         'myapikey=hunterhunter', 'lowkey = hunterhunter']) {
    const r = najti_sekret(obrazec);
    if (r && r.klass === 'obyavlennyj')
      bed.push(`${obrazec.slice(0, 12)}…: ложное объявление`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

t('П16-бис русские слова перечня ЖИВЫ (то, что \\b убил бы молча)', () => {
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

// ── П17: ЖИВЫЕ ИМЕНА ПЕРЕМЕННЫХ. ПАРНАЯ ПРОБА ───────────────────────────────
// 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ПРОБА, ЕСЛИ ЕСТЬ П14 И П16: набор П14/П16 состоит из ГОЛЫХ слов
// (key=, token=, ключ=) и составных БЕЗ разделителя (monkey=). Ни в одном нет
// подчёркивания — а именно оно решает. Стенд был ЗЕЛЁНЫМ на редакции, которая
// выбивала из правила все двадцать наших живых имён вида FAL_API_KEY=: они уходили
// в «entropiya», то есть помечались и ПРОХОДИЛИ в память, а со слабым значением —
// вообще без следа. Поймал это не стенд, а сосед, сверявший набор с живыми .env.
// Урок в форме пробы: НАБОР ОБРАЗЦОВ, СОБРАННЫЙ «ПО СУЩЕСТВУ», ПРОВЕРЯЕТ ЗАМЫСЕЛ
// СОБИРАВШЕГО, А НЕ РЕАЛЬНОСТЬ. Здесь формы стоят ДОСЛОВНО, как в файлах, без
// нормализации: имя целиком, а не «SNAKE_UPPER + разделитель».
// И проба ПАРНАЯ намеренно: сужение формы даёт ПРОПУСКИ, а они невидимы — правило
// продолжает печатать бодрый ноль. Одна половина без другой ничего не значит.
t('П17 живые имена переменных с подчёркиванием ЗАПИРАЮТСЯ (истинные держатся)', () => {
  const S = 'Xk92Lm4pQz7RvB3nT8wY';   // 20 знаков, 3 класса
  const bed = [];
  // Сняты с живых .env и юнитов 04.09.2026 — ИМЕНА, значения не читались.
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

t('П17-бис составные слова НЕ стали объявлением (ложные не вернулись)', () => {
  const bed = [];
  // Вторая половина пары. Убери её — и «лечение» пропусков расширением формы
  // пройдёт молча, вернув monkey= и отключ= в объявления.
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

// ── П18: СЛИТНОЕ НАПИСАНИЕ И ЗАПИСЬ В СКОБКАХ. ПАРНАЯ ПРОБА ─────────────────
// 🔴 ЗАЧЕМ СВЕРХ П16 И П17. П16 стережёт границу слева, П17 — имена с подчёркиванием.
// Ни одна не проверяла форму, где ключевое слово стоит ХВОСТОМ другого БЕЗ разделителя
// (cftoken=, userpassword=) и форму записи в фигурных скобках, где между словом и
// разделителем стоит закрывающая кавычка ({"key": "…"}). Обе были зелёными на редакции,
// которая пропускала 10 истинных форм из 21.
// Урок тот же, что дал П17, в новом обличье: НАБОР СОБИРАЕТСЯ ПО ТОМУ, КУДА ЗАГЛЯНУЛИ,
// А НЕ ПО ОБЛАСТЯМ. Оси, по которым набор теперь перечислен явно: подчёркивание, дефис,
// кириллица, слитное написание, кавычка перед разделителем, начало строки.
t('П18 слитное написание с token/secret/password ЗАПИРАЕТСЯ', () => {
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

t('П18-бис запись в фигурных скобках ЗАПИРАЕТСЯ (кавычка перед разделителем)', () => {
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

// Вторая половина пары. Снятие границы у key вернуло бы monkey= и мойключ= —
// именно поэтому граница ИЗБИРАТЕЛЬНАЯ, а не снята целиком.
t('П18-трет составные с key НЕ стали объявлением (ложные не вернулись)', () => {
  const bed = [];
  for (const f of ['monkey=hunter2', 'hotkey=hunter2', 'myapikey=hunter2', 'sortkey=hunter2',
                   'мойключ=hunter2', 'отключ=hunter2', 'подключ=hunter2', 'брелоктокен=hunter2']) {
    const r = najti_sekret(f);
    if (r?.klass === 'obyavlennyj') bed.push(`${f}: составное принято за объявление`);
  }
  if (bed.length) throw new Error(bed.join(' | '));
});

// ⚠️ ПРЕДЕЛ, ЗАКРЕПЛЁННЫЙ ПРОБОЙ: AWSKey= и MyKey= НЕ ловятся правилом объявления —
// перед key стоит буква без разделителя. Закрыть можно только сняв границу у key, а
// тогда вернутся monkey= и мойключ= (П18-трет покраснеет). Проба стоит, чтобы предел
// был ИЗМЕРЕН, а не забыт: изменится поведение — она скажет об этом вслух.
t('П18-предел AWSKey= и MyKey= правилом объявления НЕ ловятся (известная граница)', () => {
  for (const f of ['AWSKey=Xk92Lm4pQz7RvB3nT8wY', 'MyKey=hunter2']) {
    const r = najti_sekret(f);
    if (r?.klass === 'obyavlennyj')
      throw new Error(`${f}: стало ловиться — предел сдвинулся, проверить, не вернулись ли monkey=/мойключ=`);
  }
});

// Уборка ПОСЛЕ всех проб, работающих с этой базой. Стояла сразу за П7 — и пробы
// П13 получали «attempt to write a readonly database»: снаружи это выглядело как
// дефект предмета, а был снесён каталог под ним.
rmSync(kat, { recursive: true, force: true });

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
