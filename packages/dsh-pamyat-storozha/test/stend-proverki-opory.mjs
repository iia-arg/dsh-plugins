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
 * EN: STAND FOR THE ANCHOR-CHECK TOOL.
 *     🔴 WHY IT APPEARED. Acceptance on 05.09.2026 named the boundary of its verdict: the tool with `--zapisat`
 *     LIES OUTSIDE THE PACKAGE, is not in the tarball, never went through the gate — and my numbers (54 marks,
 *     1 without a source on a copy of the live base) were accepted ON MY WORD. So our only tool that EDITS LIVE
 *     MEMORY had not a single probe. It was acceptance, not me, that named the boundary — and it is worth
 *     recording exactly that way.
 *     WHAT IS CHECKED HERE AND WHAT IS NOT:
 *     · the tool's BEHAVIOUR on a stand-in base is checked: whether it writes without the flag, what it puts
 *     with the flag, whether it touches what it learned nothing about;
 *     · the correctness of reading session logs is NOT checked — that needs a real zstd log, and it is separate
 *     work. There are no logs here, so all records fall into "nothing to check with" — and that is exactly the
 *     state that shows the main thing: BLINDNESS DOES NOT GO INTO THE BASE.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const zdes = dirname(fileURLToPath(import.meta.url));
const PRIBOR = process.env.STEND_PRIBOR || join(zdes, '..', 'bin', 'proverka-opory.mjs');
// Ядро памяти: STEND_CORE или ключ PAMYAT_CORE файла настройки пакета; нет ничего — СЛЕПОТА стенда, код 2.
// EN: Memory core: STEND_CORE or the PAMYAT_CORE key of the package settings file; nothing at all — stand
//     BLINDNESS, code 2.
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };
const CORE = (process.env.STEND_CORE || konf('PAMYAT_CORE')).replace(/\/$/, '');
if (!CORE) { console.log('СЛЕПОТА стенда: ядро памяти не задано — STEND_CORE или ключ PAMYAT_CORE в ' + KONF); process.exit(2); }
const kat = mkdtempSync(join(tmpdir(), 'proverka-opory-'));
// Прибору — своя настройка стенда: пустой каталог сессий и настоящее ядро для --zapisat. STEND_KONF заменяет её целиком.
// EN: The tool gets the stand's own settings: an empty sessions directory and the real core for --zapisat.
//     STEND_KONF replaces them entirely.
writeFileSync(join(kat, 'stend.conf'), `DSH_SESSII=${join(kat, 'sessii')}\nPAMYAT_CORE=${CORE}\n`);
const KONF_PRIBORA = process.env.STEND_KONF || join(kat, 'stend.conf');

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
// EN: 🔴 THE BASE IS BUILT BY THE CORE ITSELF, NOT BY MY CREATE TABLE (05.09.2026, caught by corruption too).
//     The first edition invented the schema: the settings column was called `klyuch`, while the core expects
//     `kluch`. The tool failed on opening the store — BEFORE writing — and two probes about `--zapisat` turned
//     out GREEN FOR A FALSE REASON: the field was empty not because blindness is not written, but because
//     writing was never reached. A refusal earlier than the measured step was counted as confirmation.
//     We take the schema from the owner of the subject: we open the base with the core and put the records with
//     it too.
const { otkrytHranilishche } = await import(CORE + '/src/hranilishche.js');
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
  try { return { kod: 0, out: execFileSync('node', [PRIBOR, ...args], { encoding: 'utf8', env: { ...process.env, DSH_PAMYAT_STOROZHA_CONF: KONF_PRIBORA } }) }; }
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
  // EN: ⚠️ WE TAKE A SOURCE THAT IS KNOWN NOT TO EXIST. The first edition took "telegram-a2a#1-5", assuming
  //     there were no logs in the stand — but the tool reads the LIVE sessions directory, and such a log is
  //     there. The probe went red on a healthy tool: it checked my guess about the environment, not the
  //     subject. The same class we have been catching all day, only on my side.
  const b = baza('slepota', [{ istochnik: 'sessii-takoj-net-i-ne-budet#1-5' }]);
  zov([b, '--zapisat']);
  const v = pole(b, 1, 'proverka');
  // Слепота («журнала нет — проверить нечем») в базу ложиться не должна вовсе: отметка
  // «утрачена» здесь была бы выдачей отказа ИНСТРУМЕНТА за суждение о ПРЕДМЕТЕ.
  // EN: Blindness ("no log — nothing to check with") must not go into the base at all: a "lost" mark here would
  //     pass off a TOOL failure as a judgement about the SUBJECT.
  return v === null || `в базу легло «${v}», хотя журнала этой сессии не существует`;
});

proba('записи БЕЗ источника прибор не трогает вовсе', () => {
  const b = baza('bez-istochnika', [{ istochnik: null }]);
  zov([b, '--zapisat']);
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
  // EN: The first edition of this probe counted an unhandled exception: it checked "code not 0" and the
  //     presence of a word. But a crash with a traceback and blindness with a reason are DIFFERENT things: the
  //     first reads as a tool breakage, the second says what it could not do and what to do.
  const r = zov([join(kat, 'net-takoj.db')]);
  if (r.kod === 0) return 'на несуществующей базе прибор доложил успех';
  if (/at .*\.mjs:\d+|at file:\/\//.test(r.out) || /^\s*throw /m.test(r.out)) {
    return `прибор УПАЛ трассировкой вместо слепоты (код ${r.kod}): ${r.out.split('\n').find((x) => /Error|code:/.test(x)) ?? ''}`;
  }
  return /СЛЕПОТА/.test(r.out) || `код ${r.kod}, но слово СЛЕПОТА не напечатано: ${r.out.slice(0, 200)}`;
});

// RU: Две пробы ниже различают ЖИВУЮ ветку --zapisat. Пробы выше проверяют только, что лишнее НЕ легло, —
//     ветка, умершая на импорте ядра, тоже ничего не пишет, и они оставались зелёными на мёртвой ветке.
// EN: The two probes below tell a LIVE --zapisat branch apart. The probes above only check that nothing extra was
//     written — a branch dead on the core import writes nothing too, so they stayed green on a dead branch.
proba('🔴 --zapisat при живом ядре КЛАДЁТ отметку «опора есть»', () => {
  const ses = join(kat, 'sessii', 'stend-sessiya');
  mkdirSync(ses, { recursive: true });
  writeFileSync(join(ses, 'session.jsonl'), [1, 2, 3, 4, 5].map((n) => JSON.stringify({ seq: n })).join('\n') + '\n');
  execFileSync('zstd', ['-q', '-f', join(ses, 'session.jsonl'), '-o', join(ses, 'session.jsonl.zstd')]);
  const b = baza('zhivaya-zapis', [{ istochnik: 'stend-sessiya#1-5' }]);
  const r = zov([b, '--zapisat']);
  const v = pole(b, 1, 'proverka');
  if (v === null) return `отметка не легла (код ${r.kod}): ${r.out.split('\n').find((x) => /СЛЕПОТА|Error|легло/.test(x)) ?? r.out.slice(-200)}`;
  return /легло 1/.test(r.out) || `отметка есть («${v}»), но прибор не назвал «легло 1»: ${r.out.slice(-200)}`;
});

proba('🔴 нет ядра для --zapisat → НАЗВАННАЯ слепота, база не тронута', () => {
  const k = join(kat, 'net-yadra.conf');
  writeFileSync(k, `DSH_SESSII=${join(kat, 'sessii')}\nPAMYAT_CORE=${join(kat, 'net-takogo-yadra')}\n`);
  const b = baza('net-yadra', [{ istochnik: 'stend-sessiya#1-5' }]);
  let kod = 0, out = '';
  try { out = execFileSync('node', [PRIBOR, b, '--zapisat'], { encoding: 'utf8', env: { ...process.env, DSH_PAMYAT_STOROZHA_CONF: k } }); }
  catch (e) { kod = e.status; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  if (pole(b, 1, 'proverka') !== null) return 'без ядра в базу что-то легло';
  if (/ERR_MODULE_NOT_FOUND|at .*\.mjs:\d+/.test(out)) return `прибор УПАЛ на импорте ядра трассировкой (код ${kod})`;
  return (kod === 2 && /СЛЕПОТА: ядра памяти для --zapisat нет/.test(out)) || `код ${kod}, слепоты с причиной нет: ${out.slice(0, 200)}`;
});

rmSync(kat, { recursive: true, force: true });
console.log(`\n  итог: ${vsego - bed} из ${vsego}`);
process.exit(bed ? 1 : 0);
