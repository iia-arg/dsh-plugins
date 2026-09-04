// Стенд write-through в долговременную память (Э3.1).
//
// 🔴 ГЛАВНОЕ ЗДЕСЬ — РАЗНЫЕ ПРИРОДЫ У РАЗНЫХ ОТКАЗОВ. «Канала нет», «служба не смонтирована»
// и «позвал, но не подтвердилось» лечатся по-разному: первое — установкой, второе — правкой
// профиля, третье — разбором на стороне провайдера. Схлопни их в один «не удалось» — и
// пришедший по журналу пойдёт чинить не то.
import { Context } from '@deepseek-ai/cordis';
import { apply, name, Config } from '../src/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let ok = 0, bed = 0, slepot = 0;
// 🔴 ПРИРОДА ТЕЛА ПРОВЕРЯЕТСЯ, А НЕ ПОДРАЗУМЕВАЕТСЯ (05.09.2026). Прогонщик синхронный:
// он ждать не умеет. Тело, написанное ожидающим, вернёт промис — try его НЕ поймает,
// проба зачтётся мгновенно, а брошенное внутри уйдёт в никуда. Такая проба не может
// покраснеть НИКОГДА, ни на каких данных: это не ложно-зелёное, это отсутствие проверки
// под видом проверки. Замер 05.09: семь стендов ядра из десяти зеленели на подложенном
// падении в ожидающем теле — действующих async-тел не было ни одного, беда была впереди.
// Здесь она закрыта устройством: вернуло промис — это ОТКАЗ пробы, а не её успех.
const t = (imya, f) => { try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный — ждать не умеет. ' +
                      'Вынеси ожидание наружу либо сделай прогонщик ожидающим');
    }
    ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

const kat = mkdtempSync(join(tmpdir(), 'stend-dolgo-'));
let putBazy = '';

/** Поднять ядро с подставным долговременным слоем. */
async function podnyat({ dolgo = null, nastrojka = {} } = {}) {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  if (dolgo) { koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo; }
  putBazy = join(kat, 'p-' + Math.random().toString(36).slice(2) + '.db');
  const cfg = new Config({ putBazy,
                           otvechayushchegoNet: true, agent: 'proba-uzel', ...nastrojka });
  koren.plugin({ name, apply }, cfg);
  await new Promise((r) => setTimeout(r, 40));
  return koren;
}

// Журнал читаем ПРЯМО ИЗ БАЗЫ: служба отдаёт только сводку по природам, а нам нужны
// отдельные записи с причиной. Читаем другим средством, чем писали, — тем же путём туда и
// обратно мы перенесли бы слепое пятно из работы в проверку.
const zhurnalZapisi = (k) => {
  const put = k.pamyat.gdeBaza?.() ?? putBazy;
  const db = new DatabaseSync(put, { readOnly: true });
  const r = db.prepare('SELECT ishod, priroda, pochemu FROM zhurnal ORDER BY id').all();
  db.close();
  return r;
};

// [0] КОНТРОЛЬ НА ИСПРАВНОМ: класс НЕ из перечня в долговременную не идёт вовсе.
{
  const zvali = [];
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-1' }; } } });
  k.pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'сводка', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[0] сводка компакции в долговременную НЕ идёт (контроль на исправном)', () => {
    if (zvali.length !== 0) throw new Error('позвали ' + zvali.length + ' раз, ждали 0');
  });
}

// [A] класс из перечня, слой доступен → доставлено, в журнале исход и id
{
  const zvali = [];
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-77' }; } } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 'telegram-a2a#10-20' });
  await new Promise((r) => setTimeout(r, 60));
  t('[A] знание уходит в долговременную, source_uri = istochnik', () => {
    if (zvali.length !== 1) throw new Error('позвали ' + zvali.length + ' раз');
    if (zvali[0].metadannye.source_uri !== 'telegram-a2a#10-20') {
      throw new Error('source_uri = ' + zvali[0].metadannye.source_uri);
    }
    if (zvali[0].tip !== 'urok') throw new Error('tip = ' + zvali[0].tip);
  });
  t('[A] исход доставки попал в журнал с id', () => {
    const z = zhurnalZapisi(k).filter((x) => x.priroda === 'dolgovremennyj-sloj');
    if (!z.length) throw new Error('в журнале нет отметки долговременного слоя');
    if (z[0].ishod !== 'dostavleno') throw new Error('исход ' + z[0].ishod);
  });
}

// [B] слой недоступен → ПРИРОДА «недоступен», оперативный слой цел.
// 🔴 04.09.2026: исход здесь стал `ne-otpravleno` (прежде `ne-udalos-proverit`).
// Проба этого не заметила, потому что смотрит на ПРИРОДУ, а не на исход, — и это
// верно по замыслу: природа отвечает «что чинить». Заголовок же называл исход и
// пережил свою причину; текст, объясняющий проверку, врёт дольше, чем сама
// проверка, потому что его никто не прогоняет.
{
  const k = await podnyat({ dolgo: { dostupna: () => false,
    pochemuNedostupna: () => 'служба OMEGA не отвечает',
    sohranit: async () => { throw new Error('не должны были звать'); } } });
  const id = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[B] недоступный слой НЕ откатывает оперативную запись', () => {
    if (!id) throw new Error('оперативная запись не сделана: id = ' + id);
  });
  t('[B] природа отказа — «недоступен», с причиной от провайдера', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('отказ не отмечен в журнале — «выстрелил и забыл» стало молчанием');
    if (z[0].priroda !== 'dolgovremennyj-sloj-nedostupen') throw new Error('природа ' + z[0].priroda);
    if (!/не отвечает/.test(z[0].pochemu ?? '')) throw new Error('причина провайдера потеряна: ' + z[0].pochemu);
  });
}

// [C] слой ответил, но без подтверждения → ne-najdeno, ПРИРОДА ОТЛИЧАЕТСЯ от [B]
{
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async () => ({ sostoyanie: 'ne-najdeno', pochemu: 'записал, но чтением не подтвердилось' }) } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 60));
  t('[C] «позвал, но не подтвердилось» отличается от «канала нет»', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('исход не отмечен');
    if (z[0].ishod !== 'ne-najdeno') throw new Error('исход ' + z[0].ishod);
    if (z[0].priroda === 'dolgovremennyj-sloj-nedostupen') {
      throw new Error('природа совпала с [B] — два разных отказа неразличимы в журнале');
    }
  });
}

// [D] служба не смонтирована вовсе → своя природа, не молчание
{
  const k = await podnyat({ dolgo: null });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[D] несмонтированная служба названа отдельно от недоступной', () => {
    const z = zhurnalZapisi(k).filter((x) => String(x.priroda ?? '').startsWith('dolgovremennyj'));
    if (!z.length) throw new Error('отсутствие службы не отмечено — тишина вместо причины');
    if (z[0].priroda !== 'dolgovremennyj-sloj-ne-smontirovan') throw new Error('природа ' + z[0].priroda);
  });
}

// [E] 🔴 ВТОРАЯ ВЕТКА ЗАПИСИ: класс, требующий подтверждения, на узле без отвечающего
{
  const zvali = [];
  const k = await podnyat({
    nastrojka: { sprashivat: ['urok'] },
    dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
      sohranit: async (z) => { zvali.push(z); return { sostoyanie: 'dostavleno', id: 'mem-9' }; } } });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 60));
  t('[E] знание «без подтверждения» тоже уходит, и пометка едет с ним', () => {
    if (zvali.length !== 1) throw new Error('позвали ' + zvali.length + ' раз — ветка без подтверждения не покрыта');
    if (zvali[0].metadannye.bezPodtverzhdeniya !== true) {
      throw new Error('пометка не доехала: ' + JSON.stringify(zvali[0].metadannye));
    }
  });
}

// [F] 🔴 «ВНЕ ПЕРЕЧНЯ» ОТМЕЧАЕТСЯ В ЖУРНАЛЕ. Молчание этой ветки делало «класс не из
// перечня знаний» неотличимым от «долговременный слой не позвали»: в обоих случаях в
// журнале не появлялось ничего, и разбирающий не мог узнать, решение это или сбой.
{
  const k = await podnyat({ dolgo: { dostupna: () => true, pochemuNedostupna: () => '',
    sohranit: async () => ({ sostoyanie: 'dostavleno', id: 'mem-x' }) } });
  k.pamyat.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'сводка', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[F] класс вне перечня — отдельный исход в журнале, а не тишина', () => {
    const z = zhurnalZapisi(k).filter((x) => x.priroda === 'klass-vne-klassyZnaniy');
    if (!z.length) throw new Error('ветка «вне перечня» молчит — решение неотличимо от сбоя');
    if (z[0].ishod !== 'ostalos-v-operativnom') throw new Error('исход ' + z[0].ishod + ', ждали ostalos-v-operativnom');
    if (!/не входит в klassyZnaniy/.test(z[0].pochemu ?? '')) throw new Error('причина не называет перечень: ' + z[0].pochemu);
  });
}

// [G] 🔴 ПЕРЕЧНИ ДВУХ ПАКЕТОВ СОГЛАСОВАНЫ. Секретарь выбирает классы для статей, ядро решает,
// какие из них уедут в долговременную память. Разойдись они — часть знаний останется только
// в оперативном слое, и НИКТО об этом не узнает: у обоих пакетов свой список верен, а дыра
// между ними невидима каждому по отдельности.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: соседний пакет может быть не установлен — тогда СЛЕПОТА, а не «сошлось».
{
  let klassySecretarya = null;
  for (const put of ['../../dsh-pamyat-secretary/src/promty.js',
                     '../node_modules/dsh-pamyat-secretary/src/promty.js']) {
    try { ({ KLASSY: klassySecretarya } = await import(new URL(put, import.meta.url).href)); break; }
    catch { /* ищем дальше */ }
  }
  if (!klassySecretarya) {
    slepot++;
    console.log('  СЛЕПОТА: пакет секретаря не найден рядом — согласованность перечней не проверена');
    console.log('    Это НЕ «сошлось»: проверка не состоялась. Поставьте dsh-pamyat-secretary рядом.');
  } else {
    const nashi = new Config({ putBazy: join(kat, 'x.db'), agent: 'proba' }).klassyZnaniy ?? [];
    t('[G] все классы секретаря входят в klassyZnaniy ядра', () => {
      const lishnie = klassySecretarya.filter((x) => !nashi.includes(x));
      if (lishnie.length) {
        throw new Error('секретарь пишет классы, которых ядро не отправит в долговременную память: ' +
                        lishnie.join(', ') + ' — знание останется только в оперативном слое');
      }
    });
  }
}

rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed + ', слепота ' + slepot);
process.exit(bed ? 1 : (slepot ? 2 : 0));
