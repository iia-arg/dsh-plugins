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

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
