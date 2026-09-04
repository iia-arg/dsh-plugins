/**
 * Стенд состава: манифест метапакета обязан совпадать с ФАКТОМ.
 *
 * 🔴 Смысл метапакета — быть ИМЕНЕМ для набора. Имя, за которым у разных людей
 * оказываются разные наборы, хуже отсутствия имени: расходятся молча. Поэтому
 * здесь проверяется не «красиво ли записано», а три совпадения с фактом:
 *   1) версии в dependencies = версии в sostav.json
 *   2) суммы предмета в sostav.json = то, что ПРЯМО СЕЙЧАС даёт инструмент
 *   3) сумма самого инструмента = заявленная в sostav.json
 *
 * Третья важнее двух первых. 03.09 инструмент правился на месте, и одно имя
 * носили ШЕСТЬ разных файлов подряд; числа предметов при этом выглядели
 * безупречно. Прибор, разойдясь, врёт обо ВСЁМ, что им померено, — пакет врёт
 * только о себе. Поэтому сумма инструмента проверяется наравне с числами.
 */
import { readFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 🔴 ДЕРЕВО СЕМЕЙСТВА ИЩЕТСЯ ПО КАНДИДАТАМ, А НЕ ПО ЖЁСТКОМУ ПУТИ.
 * Первая редакция знала ровно одну раскладку — мастерскую автора (koren/../..).
 * В ящике поставки раскладка плоская, у получателя из реестра дерева нет вовсе:
 * стенд давал 4 из 8 и сыпал сырым «sha256sum: No such file». Выглядело бы как
 * «пакет сломан», хотя сломана была ПРОВЕРКА.
 * Это наш класс «вылечено ≠ вылечено ТАМ, ГДЕ РАБОТАЕТ», применённый к самому
 * прибору: проверка, зелёная только у автора, ничего не проверяет у остальных.
 * Найденное печатается — иначе непонятно, о какой раскладке говорят числа.
 */
const KANDIDATY = [
  ['ящик поставки / установленные соседи', join(koren, '..')],
  ['мастерская', join(koren, '..', '..')],
];
/**
 * И САМИ ПАКЕТЫ ЛЕЖАТ ПО-РАЗНОМУ: в мастерской под `packages/`, в ящике
 * поставки и у получателя — прямо рядом. Жёсткое `packages/<имя>` дало бы
 * «каталога нет» на пяти пакетах — то есть отчёт о пропаже там, где всё на
 * месте. Ложная тревога такого рода хуже молчания: она посылает чинить целое.
 */
function najtiPaket(imya) {
  for (const put of [join(derevo, 'packages', imya), join(derevo, imya)]) {
    if (existsSync(join(put, 'package.json'))) return put;
  }
  return null;
}

// 🔴 ИНСТРУМЕНТ И СОСЕДИ ЛЕЖАТ В РАЗНЫХ МЕСТАХ — ищем ОТДЕЛЬНО.
// Прежняя редакция искала дерево ПО НАЛИЧИЮ инструмента и брала инструмент
// оттуда же. У получателя из реестра так не работает НИКОГДА: npm кладёт
// соседей в общий node_modules (рядом с нами), своего node_modules у пакета
// без зависимостей не создаётся вовсе, а инструмент до alpha.4 не публиковался.
// Кандидат «установлено у получателя» был НАМЕРЕНИЕМ, ПОХОЖИМ НА ПОДДЕРЖКУ:
// в коде есть, сработать не мог. Проверено установкой из тарболов двумя руками.
// Теперь инструмент едет ВНУТРИ метапакета: он и есть способ, метапакет и есть
// проверка. Цена честная и правильная: правка инструмента меняет сумму предмета.
const KANDIDATY_INSTRUMENTA = [
  ['внутри пакета (у получателя)', join(koren, 'summa-predmeta')],
  ['рядом (ящик поставки)', join(koren, '..', 'summa-predmeta')],
  ['в дереве (мастерская)', join(koren, '..', '..', 'summa-predmeta')],
];
let instrument = null, gdeInstrument = null;
for (const [imya, put] of KANDIDATY_INSTRUMENTA) {
  if (existsSync(put)) { instrument = put; gdeInstrument = imya; break; }
}
// Соседи ищутся ПО СОСЕДУ, а не по инструменту — это разные вопросы.
let derevo = null, gdeNashli = null;
for (const [imya, put] of KANDIDATY) {
  if (existsSync(join(put, 'dsh-pamyat-core', 'package.json'))) { derevo = put; gdeNashli = imya; break; }
}
console.log('  инструмент: ' + (gdeInstrument ?? 'НЕ НАЙДЕН') + (instrument ? ' → ' + instrument : ''));
console.log('  соседи:     ' + (gdeNashli ?? 'НЕ НАЙДЕНЫ') + (derevo ? ' → ' + derevo : ''));
const sostav = JSON.parse(readFileSync(join(koren, 'sostav.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(koren, 'package.json'), 'utf8'));

// 🔴 Отказ ДОЛЖЕН ЗВУЧАТЬ СЛОВАМИ. Без дерева семейства прежняя редакция
// сыпала сырьём оболочки («Command failed: sha256sum», «path must be string») —
// получатель прочёл бы это как «пакет сломан», а сломана ПРОВЕРКА, точнее её
// предпосылка. Причина называется один раз и одинаково во всех зависимых пробах.
const NET_DEREVA = 'дерево семейства не найдено — проверить суммы НЕЧЕМ. ' +
  'Это отказ ПРОВЕРКИ, а не пакета: метапакет по построению проверяет соседей, ' +
  'и без них ему нечего сверять.';
const trebuetDereva = () => {
  if (!instrument) throw new Error('инструмент summa-predmeta не найден — считать НЕЧЕМ. ' + NET_DEREVA);
  if (!derevo) throw new Error(NET_DEREVA);
};

let vsego = 0, proshlo = 0;
// 🔴 ПРОВАЛЫ СЧИТАЮТСЯ ПО ПРИЧИНЕ, А НЕ ПО ЧИСЛУ (03.09.2026). Прежде код возврата
// решался выражением `!derevo && proshlo < vsego` — то есть при отсутствии дерева ЛЮБОЙ
// провал объявлялся слепотой, включая тот, что дерева не требует вовсе. Замер: порча
// «убрать члена из README» дала код 2 «проверять нечем» вместо 1 «расхождение» — провал
// ПО СУЩЕСТВУ маскировался слепотой соседних проб. Это ровно тот класс, который мы
// разводили в самих кодах: отказ, объявленный законным, перестаёт читаться как отказ.
// 🔴 ПРИЗНАК ПО НАЗНАЧЕНИЮ ПРОБЫ, А НЕ ПО ТЕКСТУ ОШИБКИ. Первая редакция этой правки
// отличала слепоту от расхождения поиском подстроки NET_DEREVA в сообщении — и пропустила
// ДВА провала про то же дерево, написанных другими словами. Признак по тексту ловит ровно
// то, что совпало дословно; проба же либо требует соседей, либо нет, и это её свойство,
// а не свойство её сообщения.
let poSushchestvu = 0;
const proba = (imya, f, nuzhnySosedi = false) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) {
    if (!(nuzhnySosedi && !derevo)) poSushchestvu++;
    console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 220));
  }
};

proba('стенд годен: инструмент и соседи найдены, контроль зрячести пройден', () => {
  if (!instrument) throw new Error('инструмент не найден ни внутри пакета, ни рядом, ни в дереве');
  if (!derevo) {
    throw new Error('дерево семейства не найдено ни в одной из раскладок: ' +
      KANDIDATY.map(([i, p]) => i + ' (' + p + ')').join('; ') +
      '. Без него суммы проверить нечем — это отказ ПРОВЕРКИ, а не пакета.');
  }
  const v = execFileSync(instrument, ['--kontrol'], { encoding: 'utf8' });
  if (!/ПРОЙДЕН/.test(v)) throw new Error('контроль зрячести не пройден: ' + v.trim());
}, true);

proba('🔴 СУММА ИНСТРУМЕНТА совпадает с заявленной в составе', () => {
  trebuetDereva();
  const fakt = execFileSync('sha256sum', [instrument], { encoding: 'utf8' }).slice(0, 16);
  if (fakt !== sostav.kak_schitano.summa_instrumenta) {
    throw new Error('инструмент ДРУГОЙ: на диске ' + fakt +
                    ', в составе ' + sostav.kak_schitano.summa_instrumenta +
                    ' — все числа ниже посчитаны неизвестно чем');
  }
}, true);

proba('версии в dependencies совпадают с составом', () => {
  for (const p of sostav.sostav) {
    const v = manifest.dependencies[p.paket];
    if (v !== p.versiya) throw new Error(p.paket + ': в зависимостях ' + v + ', в составе ' + p.versiya);
  }
  const lishnie = Object.keys(manifest.dependencies).filter((k) => !sostav.sostav.some((p) => p.paket === k));
  if (lishnie.length) throw new Error('в зависимостях есть незаявленные: ' + lishnie.join(', '));
});

proba('🔴 ВЕРСИИ ТОЧНЫЕ, без диапазонов — иначе имя означает разные наборы', () => {
  for (const [imya, v] of Object.entries(manifest.dependencies)) {
    if (/[\^~*><]|\s-\s|x/.test(v)) throw new Error(imya + ': диапазон «' + v + '» вместо точной версии');
  }
});

// 🔴 СУММЫ СВЕРЯЮТСЯ С РЕЕСТРОМ, А НЕ С РАБОЧИМ ДЕРЕВОМ (правка 04.09.2026).
// Состав описывает то, что ПОЛУЧИТ СТАВЯЩИЙ, то есть опубликованные редакции. Дерево —
// другой предмет: по правилу владельца правки копятся в репозитории между выпусками,
// поэтому дерево ЗАКОННО опережает реестр, и проба по дереву в это время красная всегда.
// Так и вышло: 04.09 ядро несло в дереве непубликованную правку, проба краснела на
// исправном составе, и красное «известной причины» через день перестают читать.
// Это тот же довод, что и для тарбола против каталога: проверять надо ТО, ЧТО ПОЕДЕТ.
// ⚠️ Цена: пробе нужна сеть. Нет сети или нет версии в реестре — СЛЕПОТА с названной
// причиной, а не «сошлось» и не «расхождение»: «не смогли спросить» ≠ «не совпало».
proba('🔴 СУММЫ ПРЕДМЕТОВ совпадают с тем, что лежит В РЕЕСТРЕ под заявленной версией', () => {
  const rashozhdeniya = [];
  const slepye = [];
  const vremenno = mkdtempSync(join(tmpdir(), 'sostav-'));
  try {
    for (const p of sostav.sostav) {
      const kat = join(vremenno, p.paket);
      mkdirSync(kat, { recursive: true });
      try {
        execFileSync('npm', ['pack', p.paket + '@' + p.versiya, '--pack-destination', kat],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
        const tgz = readdirSync(kat).find((f) => f.endsWith('.tgz'));
        if (!tgz) { slepye.push(p.paket + ': npm pack не отдал тарбол'); continue; }
        execFileSync('tar', ['xzf', join(kat, tgz), '-C', kat], { encoding: 'utf8' });
        const vyvod = execFileSync(instrument, [join(kat, 'package')], { encoding: 'utf8' });
        const chislo = vyvod.trim().split(/\s+/)[1];
        if (chislo !== p.predmet)
          rashozhdeniya.push(p.paket + '@' + p.versiya + ': в реестре ' + chislo + ', в составе ' + p.predmet);
      } catch (e) {
        slepye.push(p.paket + '@' + p.versiya + ': ' + String(e.message ?? e).split('\n')[0].slice(0, 90));
      }
    }
  } finally { rmSync(vremenno, { recursive: true, force: true }); }
  // Расхождение важнее слепоты: сперва говорим о найденном, потом о непроверенном.
  if (rashozhdeniya.length) throw new Error(rashozhdeniya.join('; '));
  if (slepye.length) throw new Error('СЛЕПОТА (не расхождение), спросить не удалось: ' + slepye.join('; '));
}, true);

proba('версия каждого пакета на диске совпадает с заявленной', () => {
  trebuetDereva();
  const plohie = [];
  for (const p of sostav.sostav) {
    const putP = najtiPaket(p.paket);
    if (!putP) { plohie.push(p.paket + ': каталога нет ни в packages/, ни рядом'); continue; }
    const pj = join(putP, 'package.json');
    const v = JSON.parse(readFileSync(pj, 'utf8')).version;
    if (v !== p.versiya) plohie.push(p.paket + ': на диске ' + v + ', заявлено ' + p.versiya);
  }
  if (plohie.length) throw new Error(plohie.join('; '));
}, true);

proba('состав называет СПОСОБ, а не только числа', () => {
  const k = sostav.kak_schitano;
  if (!k.instrument || !k.summa_instrumenta || !k.kontrol) throw new Error('способ описан неполно');
  if (!k.pochemu_ne_prozoy) throw new Error('не сказано, почему способ живёт файлом, а не прозой');
});

proba('🔴 ВСЁ, ЧТО ЧИТАЕТ СТЕНД, ЕСТЬ В СОСТАВЕ ПУБЛИКАЦИИ', () => {
  // Поймано на самом метапакете: sostav.json читался стендом четыре раза и НЕ
  // публиковался. Получатель распаковал бы пакет — и стенд упал бы на чтении
  // файла, которого нет. Тот же класс, что уже стоил перевыпуска пятёрке:
  // состав задан перечнем, а перечень устаревает молча.
  const vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const sostavPub = JSON.parse(vyvod)[0].files.map((f) => f.path);
  const stend = readFileSync(join(koren, 'test', 'stend-sostava.mjs'), 'utf8');
  const nuzhno = new Set();
  for (const m of stend.matchAll(/join\(koren,\s*'([^']+)'(?:,\s*'([^']+)')?\)/g)) {
    nuzhno.add([m[1], m[2]].filter(Boolean).join('/'));
  }
  // 🔴 Пути ВНЕ пакета не отбрасываем молча: прежняя редакция их прятала, и
  // потому не видела чтения через дерево семейства — «зелёный учёт тем
  // убедительнее, чем меньше покрывает». Теперь они названы отдельно.
  const vne = [...nuzhno].filter((f) => f.startsWith('..'));
  // Кандидаты поиска дерева — не читаемые файлы, а места, где оно может лежать.
  // Исключаем их ЯВНО и по списку, а не молчаливым отбрасыванием: молчаливое
  // отбрасывание и спрятало от этой пробы чтения через дерево семейства.
  const mestaPoiska = new Set(KANDIDATY.map(([, put]) => put.split('/').pop()));
  const net = [...nuzhno].filter((f) => !sostavPub.includes(f) && !f.startsWith('..') && !mestaPoiska.has(f));
  if (net.length) throw new Error('стенд читает, а в публикации НЕТ: ' + net.join(', '));
  if (vne.length && !derevo) {
    throw new Error('стенд читает вне пакета (' + vne.join(', ') + '), а дерева семейства нет');
  }
}, true);

// 🔴 README СВЕРЯЕТСЯ С СОСТАВОМ ПОИМЁННО И ПОВЕРСИОННО (03.09.2026, П1 аудита).
// Прежде README писался РЯДОМ с sostav.json, а не собирался из него, и отстал: называл
// ПЯТЬ членов старых версий и не называл шестого вовсе. Стенд при этом был зелёным —
// он читает состав, а человек читает README. Зелёный учёт тем убедительнее, чем меньше
// он покрывает.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба смотрит, что описание НЕ ОТСТАЛО от состава. О том, верен ли
// сам состав, она не говорит ничего — это работа соседних проб и ворот.
// 🔴 ОБА ОПИСАНИЯ, А НЕ ОДНО (03.09.2026). Первая редакция этой пробы читала только
// README.md — и английское описание отстало НА СЕМЬ ВЕРСИЙ незамеченным: называло пять
// членов (core alpha.9, omega alpha.6, secretary alpha.3, byudzhet alpha.4, nudzh alpha.4)
// и не знало о restore вовсе, при зелёном стенде.
// Это наш класс парных объектов: рассинхрон двух описаний не виден ничем, кроме сверки
// САМИХ описаний, а проба, читающая одно из пары, даёт ровно ту уверенность, которой
// пара и должна была помешать.
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба смотрит, что описание НЕ ОТСТАЛО от состава. О том, верен ли
// сам состав, она не говорит ничего — это работа соседних проб и ворот. И она не сверяет
// два описания МЕЖДУ СОБОЙ: оба сверяются с составом, он и есть общий источник.
for (const [imya, fajl] of [['русское', 'README.md'], ['английское', 'README.en.md']]) {
  proba('🔴 ' + imya + ' описание перечисляет РОВНО тех членов и те версии, что в составе', () => {
    const opisanie = readFileSync(join(koren, fajl), 'utf-8');
    for (const ch of sostav.sostav) {
      const stroka = new RegExp(ch.paket.replace(/[-]/g, '\\-') + '\\s+' +
                                ch.versiya.replace(/[.]/g, '\\.'));
      if (!stroka.test(opisanie)) {
        throw new Error(fajl + ' не называет ' + ch.paket + ' ' + ch.versiya +
                        ' — описание отстало от состава');
      }
    }
    // и обратно: в описании не должно быть членов, которых в составе НЕТ
    const imena = new Set(sostav.sostav.map((x) => x.paket));
    for (const m of opisanie.matchAll(/^\s{2,}(dsh-pamyat-[a-z]+)\s/gm)) {
      if (!imena.has(m[1])) {
        throw new Error(fajl + ' называет ' + m[1] + ', которого в составе нет');
      }
    }
  });
}

console.log('  итог: ' + proshlo + ' из ' + vsego);


// 🔴 РАЗВОД КОДОВ 03.09.2026. Слова про природу отказа здесь были верны с самого начала
// («это отказ ПРОВЕРКИ, а не пакета»), а код возврата — нет: без соседей стенд отдавал 1,
// то есть «предмет негоден». Замер: распакованный тарбол без установки зависимостей давал
// «3 из 8, код 1» — потребитель, распаковавший пакет, читал это как сломанный набор.
// По нашей конвенции «проверять нечем» — это код 2, а не 1. Различаем: если ВСЕ провалы
// вызваны отсутствием дерева семейства, это слепота (2); если есть хоть один провал по
// существу — расхождение (1). ГДЕ НЕ ПРИМЕНЯЕТСЯ: код 2 не означает, что набор годен —
// он означает, что этот стенд его не проверял.
// Слепота — только когда ВСЕ провалы вызваны отсутствием дерева. Хоть один провал по
// существу перебивает её: расхождение важнее слепоты.
if (proshlo === vsego) process.exit(0);
if (poSushchestvu > 0) process.exit(1);
process.exit(!derevo ? 2 : 1);
