/**
 * RU: Стенд ОПИСАНИЯ СТОРОЖЕЙ: у каждого сторожа в README обязательны две колонки — «чего не ловит» и «что
 *     значит его молчание».
 *     Зачем пробой, а не глазом. Сверка рукой отвечает про тот час, когда её делали: заведи четвёртого сторожа
 *     и забудь описать — описание останется полным НА ВИД, потому что о недостающем оно молчит. Здесь
 *     недостающее ловится тем, что перечень взят ИЗ КОДА (STOROZHA в src/index.js), а не из README.
 *     Пара, а не одна сторона. Проверять только «объявленное описано» мало: можно описать сторожа, которого
 *     нет, и описание будет выглядеть богаче предмета. Вторая сторона ловит это по признаку авторства: раздел,
 *     где стоит обязательная колонка «🔴 ЧЕГО НЕ ЛОВИТ», — заявка на сторожа и обязан быть в перечне кода.
 *     Важно для правки README (A-N-1871): раздел сторожа — заголовок уровня 2–4 (`##`–`####`), чей текст равен
 *     заголовку из кода без учёта регистра, лишних пробелов и вида тире; английский — отдельной строкой ниже.
 *     Колонку «🔴 ЧЕГО НЕ ЛОВИТ» нельзя ставить в собственный текст другого раздела README.
 *     Чего не ловит: правдивость текста колонок — держится наличие и охват, а не соответствие слов поведению
 *     (это предмет проб самих сторожей).
 *     Что значит молчание (зелёный итог): «перечень кода и описание сходятся», а НЕ «описание верно».
 *     Запуск: node test/stend-opisaniya.mjs; код 0 — сходится, 1 — расхождение, 2 — слепота (модуль не
 *     загрузился или README не читается).
 * EN: Stand for the GUARD DESCRIPTION: for every guard the README must have two columns — "what it does not
 *     catch" and "what its silence means".
 *     Why a probe and not eyes. A manual check answers for the hour it was made: add a fourth guard and forget
 *     to describe it — the description will still LOOK complete, because it is silent about what is missing.
 *     Here the missing part is caught because the list is taken FROM CODE (STOROZHA in src/index.js), not from
 *     the README.
 *     A pair, not one side. Checking only "declared is described" is not enough: one could describe a guard
 *     that does not exist, and the description would look richer than the subject. The second side catches that
 *     by authorship: a section containing the mandatory column "🔴 ЧЕГО НЕ ЛОВИТ" is a claim of a guard and must
 *     be in the code list.
 *     Important when editing the README (A-N-1871): a guard section is a level 2–4 heading whose text equals the
 *     heading from the code ignoring case, extra spaces and the dash kind; the English one goes on a separate
 *     line below. The "🔴 ЧЕГО НЕ ЛОВИТ" column must not appear in another section's own text.
 *     What it does not catch: truthfulness of the column text — it holds presence and coverage, not agreement
 *     of words with behaviour (that is the subject of the guards' own probes).
 *     What silence (a green result) means: "the code list and the description agree", NOT "the description is
 *     correct".
 *     Run: node test/stend-opisaniya.mjs; exit 0 — they agree, 1 — mismatch, 2 — blindness (module did not load
 *     or README unreadable).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let STOROZHA, KOLONKI_OPISANIYA;
try {
  ;({ STOROZHA, KOLONKI_OPISANIYA } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  try {
    // RU: Проверки «вернулось значение» в телах проб были бы мёртвыми: sud() строже их всех — он бросает на
    //     ЛЮБОМ возврате, кроме undefined и true. Тело пробы сообщает о беде, ВОЗВРАЩАЯ строку причины; sud()
    //     превращает её в красное. Недостижимый код читается как действующая проверка.
    // EN: Checks of "a value was returned" inside probe bodies would be dead: sud() is stricter than all of
    //     them — it throws on ANY return except undefined and true. A probe body reports a problem by RETURNING
    //     a reason string; sud() turns it red. Unreachable code reads as an active check.
    sud(f());
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

const koren = dirname(dirname(fileURLToPath(import.meta.url)));
let README;
try { README = readFileSync(join(koren, 'README.md'), 'utf8'); }
catch (e) {
  // RU: Описание — предмет этой проверки. Нет его — это СЛЕПОТА, а не «сошлось»: отсутствие сверяемого не есть
  //     успешный исход сверки.
  // EN: The description is the subject of this check. If it is missing, that is BLINDNESS, not "agrees":
  //     absence of the thing to compare is not a successful comparison.
  console.log(`СЛЕПОТА: README пакета не читается (${String(e?.message ?? e).slice(0, 120)}) — сверять нечем`);
  process.exit(2);
}

// RU: A-N-1871: раздел — заголовок ЛЮБОГО уровня 2–4 и тело до следующего заголовка того же или старшего уровня;
//     заголовок сравнивается по СМЫСЛУ — без учёта регистра, лишних пробелов и вида тире. Прежде сравнивались только
//     «## » и дословно: сторожей нельзя было положить подразделом «### » в раздел «Проверка» формы README, и их
//     выносили отдельными разделами верхнего уровня за «Ограничения».
// EN: A-N-1871: a section is a heading of ANY level 2–4 and its body up to the next heading of the same or higher
//     level; the heading is compared by MEANING — ignoring case, extra spaces and the dash kind. Previously only "## "
//     and verbatim: guards could not be described as "### " subsections inside the README's verification section.
const normZagolovok = (z) => String(z).toLowerCase().replace(/[‐‑‒–—―-]/g, '-').replace(/\s+/g, ' ').trim();
const razdely = (() => {
  const linii = README.split('\n'), out = [];
  linii.forEach((l, i) => {
    const m = l.match(/^(#{2,4})\s+(.*)$/);
    if (!m) return;
    const telo = [l];
    for (let j = i + 1; j < linii.length; j++) { const n = linii[j].match(/^(#+)\s/); if (n && n[1].length <= m[1].length) break; telo.push(linii[j]); }
    out.push({ zagolovok: m[2].trim(), norm: normZagolovok(m[2]), telo: telo.join('\n') });
  });
  return out;
})();
const najti = (zag) => razdely.find((r) => r.norm === normZagolovok(zag));

console.log(`ПЕРЕЧЕНЬ ИЗ КОДА: ${STOROZHA.length} · РАЗДЕЛОВ В ОПИСАНИИ: ${razdely.length}`);

proba('перечень сторожей вывезен наружу и заморожен', () => {
  if (!Array.isArray(STOROZHA) || !STOROZHA.length) return 'перечень пуст или не вывезен';
  if (!Object.isFrozen(STOROZHA)) return 'перечень не заморожен — чужой код сможет подменить его в памяти';
  if (!Array.isArray(KOLONKI_OPISANIYA) || KOLONKI_OPISANIYA.length !== 2) return 'обязательные колонки не вывезены';
});

for (const s of STOROZHA) {
  proba(`«${s.zagolovok}» — раздел есть в описании`, () => {
    if (!najti(s.zagolovok)) {
      return 'раздела с таким заголовком в README нет; заголовки описания: ' + razdely.map((r) => r.zagolovok).join(' | ');
    }
  });
  for (const kolonka of KOLONKI_OPISANIYA) {
    proba(`«${s.zagolovok}» — есть колонка «${kolonka}»`, () => {
      const r = najti(s.zagolovok);
      if (!r) return 'раздела нет вовсе (см. пробу выше)';
      if (!r.telo.includes(kolonka)) return 'колонка отсутствует — ворота приёмки требуют её у КАЖДОГО сторожа';
    });
  }
}

// RU: Вторая сторона пары. Признак авторства: колонку «чего не ловит» ставят только там, где описывают сторожа.
//     Значит раздел с ней — заявка, и она обязана иметь предмет в коде.
// EN: The second side of the pair. Authorship sign: the "what it does not catch" column is placed only where a
//     guard is described. So a section with it is a claim, and it must have a subject in the code.
proba('описанных сторожей не больше, чем объявлено в коде', () => {
  // RU: Заявка — раздел, в чьём СОБСТВЕННОМ теле (без вложенных подразделов-сторожей) стоит колонка «чего не ловит».
  // EN: A claim is a section whose OWN body (without nested guard subsections) holds the "what it does not catch" column.
  const sobstvennoe = (r) => r.telo.split('\n').slice(1).join('\n').split(/^#{2,4}\s/m)[0];
  const zayavki = razdely.filter((r) => sobstvennoe(r).includes(KOLONKI_OPISANIYA[0])).map((r) => r.zagolovok);
  const lishnie = zayavki.filter((z) => !STOROZHA.some((s) => normZagolovok(s.zagolovok) === normZagolovok(z)));
  if (lishnie.length) return 'описаны сторожа, которых нет в перечне кода: ' + lishnie.join(' | ');
  if (zayavki.length !== STOROZHA.length) {
    return `заявок в описании ${zayavki.length}, в коде ${STOROZHA.length} — числа обязаны совпадать`;
  }
});

proba('ключи сторожей различны (перечень не задвоен)', () => {
  const klyuchi = STOROZHA.map((s) => s.klyuch);
  if (new Set(klyuchi).size !== klyuchi.length) return 'есть повторяющиеся ключи: ' + klyuchi.join(', ');
  const zagolovki = STOROZHA.map((s) => s.zagolovok);
  if (new Set(zagolovki).size !== zagolovki.length) return 'есть повторяющиеся заголовки';
});

console.log(`\nИТОГО: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
