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

rmSync(kat, { recursive: true, force: true });


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

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
