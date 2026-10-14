#!/usr/bin/env node
/**
 * СТЕНД ПРИБОРА ПРОВЕРКИ ОПОРЫ.
 *
 * 🔴 ЗАЧЕМ ОН ПОЯВИЛСЯ. Приёмка 05.09.2026 назвала границу своего вердикта: прибор с
 * `--zapisat` ЛЕЖИТ ВНЕ ПАКЕТА, в тарбол не входит, под ворота не попадал — а мои числа
 * (54 отметки, 1 без источника на копии живой базы) приняты СО СЛОВ.
 * То есть единственный наш инструмент, который ПРАВИТ ЖИВУЮ ПАМЯТЬ, не имел ни одной пробы.
 * Границу назвала она, а не я, — и это стоит записать именно так.
 *
 * ЧТО ПРОВЕРЯЕТСЯ ЗДЕСЬ И ЧТО НЕТ:
 *   · проверяется ПОВЕДЕНИЕ прибора на подставной базе: пишет ли он без ключа, что кладёт
 *     с ключом, трогает ли то, о чём ничего не выяснил;
 *   · НЕ проверяется правильность чтения журналов сессий — для этого нужен настоящий
 *     журнал в zstd, и это отдельная работа. Здесь журналов нет, значит все записи
 *     попадут в «проверить нечем» — и это ровно то состояние, на котором видно главное:
 *     СЛЕПОТА В БАЗУ НЕ ЛОЖИТСЯ.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const zdes = dirname(fileURLToPath(import.meta.url));
const PRIBOR = join(zdes, 'proverka-opory.mjs');
const kat = mkdtempSync(join(tmpdir(), 'proverka-opory-'));

let vsego = 0, bed = 0;
const proba = (imya, telo) => {
  vsego += 1;
  let v;
  try { v = telo(); } catch (e) { v = `бросило: ${e.message}`; }
  if (v === true) console.log(`  ✅ ${imya}`);
  else { bed += 1; console.log(`  ❌ ${imya}: ${v}`); }
};

// 🔴 БАЗУ СТРОИТ САМО ЯДРО, А НЕ МОЙ CREATE TABLE (05.09.2026, поймано порчей же).
// Первая редакция выдумывала схему: колонка настроек называлась `klyuch`, а ядро ждёт
// `kluch`. Прибор падал на открытии хранилища — ДО записи, — и две пробы про `--zapisat`
// оказались ЗЕЛЁНЫМИ ПО ЛОЖНОЙ ПРИЧИНЕ: поле пустое не потому, что слепота не пишется,
// а потому, что до записи дело не дошло. Отказ раньше измеряемого зачёлся как подтверждение.
// Схему берём у того, чей это предмет: открываем базу ядром и им же кладём записи.
// Путь ядра — из STEND_JADRO: прежний /opt/iskra/plugins/dsh-pamyat-core снят при переезде
// плагинов в /opt/agent-plugins, и стенд падал на импорте раньше первой пробы.
const JADRO = process.env.STEND_JADRO || '/opt/agent-plugins/node_modules/dsh-pamyat-core';
const { otkrytHranilishche } = await import(join(JADRO, 'src/hranilishche.js'));
function baza(imya, zapisi) {
  const p = join(kat, imya + '.db');
  const h = otkrytHranilishche(p);
  try {
    zapisi.forEach((z, i) => h.zapisat({
      agent: 'stend', klass: 'zametka',
      soderzhim: z.soderzhim ?? ('знание ' + i),
      istochnik: z.istochnik ?? null,
    }));
  } finally { h.zakryt(); }
  return p;
}
const pole = (p, id, imya) => {
  const db = new DatabaseSync(p, { readOnly: true });
  const r = db.prepare(`SELECT ${imya} v FROM zapisi WHERE id = ?`).get(id);
  db.close(); return r?.v ?? null;
};
const zov = (args) => {
  try { return { kod: 0, out: execFileSync('node', [PRIBOR, ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { kod: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
};

console.log('\n═══ ПРИБОР ПРОВЕРКИ ОПОРЫ: ПИШЕТ ЛИ ОН, КОГДА НЕ ПРОСИЛИ ═══');

proba('🔴 ГЛАВНОЕ: без --zapisat база НЕ МЕНЯЕТСЯ', () => {
  const b = baza('bez-klyucha', [{ istochnik: 'telegram-a2a#1-5' }, { istochnik: null }]);
  const do_ = pole(b, 1, 'proverka');
  const r = zov([b]);
  if (pole(b, 1, 'proverka') !== do_) return 'поле проверки изменилось без ключа';
  return r.out.includes('запись отметок ВЫКЛЮЧЕНА')
    || `нет строки о выключенной записи: ${r.out.slice(-200)}`;
});

proba('🔴 СЛЕПОТА В БАЗУ НЕ ЛОЖИТСЯ даже с --zapisat', () => {
  // ⚠️ ИСТОЧНИК БЕРЁМ ЗАВЕДОМО НЕСУЩЕСТВУЮЩИЙ. Первая редакция брала «telegram-a2a#1-5»,
  // считая, что журналов в стенде нет, — а прибор читает ЖИВОЙ каталог сессий, и такой
  // журнал там есть. Проба краснела на исправном приборе: она проверяла мою догадку об
  // окружении, а не предмет. Класс тот же, что ловим весь день, только с моей стороны.
  const b = baza('slepota', [{ istochnik: 'sessii-takoj-net-i-ne-budet#1-5' }]);
  const r = zov([b, '--zapisat']);
  if (!r.out.includes('отметки в базе:')) return `прибор не дошёл до записи: ${r.out.slice(-200)}`;
  const v = pole(b, 1, 'proverka');
  // Слепота («журнала нет — проверить нечем») в базу ложиться не должна вовсе: отметка
  // «утрачена» здесь была бы выдачей отказа ИНСТРУМЕНТА за суждение о ПРЕДМЕТЕ.
  return v === null || `в базу легло «${v}», хотя журнала этой сессии не существует`;
});

proba('записи БЕЗ источника прибор не трогает вовсе', () => {
  const b = baza('bez-istochnika', [{ istochnik: null }]);
  const r = zov([b, '--zapisat']);
  // Прибор, упавший до записи, тоже «не тронул» поле — без этой строки проба зелёная впустую.
  if (!r.out.includes('отметки в базе:')) return `прибор не дошёл до записи: ${r.out.slice(-200)}`;
  const v = pole(b, 1, 'proverka');
  return v === null || `у записи без источника появилась отметка «${v}»`;
});

proba('прибор называет ЧИСЛА и не молчит', () => {
  const b = baza('chisla', [{ istochnik: 'telegram-a2a#1-5' }, { istochnik: null }]);
  const r = zov([b]);
  return /запис|провер|нечем|СЛЕПОТА/i.test(r.out) || `вывод пуст или невнятен: ${r.out.slice(0, 200)}`;
});

proba('🔴 нет базы → НАЗВАННАЯ слепота, а не падение трассировкой', () => {
  // Первая редакция этой пробы зачла необработанное исключение: проверяла «код не 0» и
  // наличие слова. Но падение с трассировкой и слепота с причиной — РАЗНЫЕ вещи: первое
  // читается как поломка прибора, второе говорит, чего он не смог и что делать.
  const r = zov([join(kat, 'net-takoj.db')]);
  if (r.kod === 0) return 'на несуществующей базе прибор доложил успех';
  if (/at .*\.mjs:\d+|at file:\/\//.test(r.out) || /^\s*throw /m.test(r.out)) {
    return `прибор УПАЛ трассировкой вместо слепоты (код ${r.kod}): ${r.out.split('\n').find((x) => /Error|code:/.test(x)) ?? ''}`;
  }
  return /СЛЕПОТА/.test(r.out) || `код ${r.kod}, но слово СЛЕПОТА не напечатано: ${r.out.slice(0, 200)}`;
});

rmSync(kat, { recursive: true, force: true });
console.log(`\n  итог: ${vsego - bed} из ${vsego}`);
process.exit(bed ? 1 : 0);
