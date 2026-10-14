// RU: Проверяем настоящий distillirovat с подставным сервером: НЕТ РЕЛЕВАНТНОГО с хвостовой пунктуацией считается пустым; каждая записанная статья даёт строку с id, классом и темой для сверки ярлыка с телом. Суд отмен выключен через dejstvuyushchie=null, чтобы не вмешиваться в эти признаки.
// EN: Test real distillirovat with a fake server: НЕТ РЕЛЕВАНТНОГО with trailing punctuation counts as empty; each written article emits an id, class, and topic line for comparing its label with its body. Disable revocation judgment through dejstvuyushchie=null to isolate these properties.
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat } from '../src/distill-shov.js';
// RU: Убираем временное на всех перехватываемых путях выхода; SIGKILL уборку не выполняет.
// EN: Clean temporary files on every interceptable exit path; SIGKILL cannot run cleanup.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
// RU: Без метода маски входа тело дистилляции отказывает. Здесь маска-пустышка намеренно пропускает текст, чтобы изолировать другой предмет; маску проверяет stend-maski-vhoda-sekretarya.
// EN: The distillation body rejects without the input-mask method. Here an identity fake deliberately passes text through to isolate another subject; stend-maski-vhoda-sekretarya tests masking.
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, vsego = 0;
// RU: Тело должно бросить или вернуть undefined; любое другое значение означает отказ пробы.
// EN: The body must throw or return undefined; any other value fails the probe.
const proba = (imya, f) => { vsego++; try { const vernulos = f(); if (vernulos !== undefined) throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) + '»'); ok++; console.log('✅ ' + imya); } catch (e) { console.log('❌ ' + imya + ': ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-pustoty-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const otvet = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
let nomer = 0;
async function zahod(temy, stati) {
  const krik = []; const zapisi = []; let vyzov = 0; let sleduyushchijId = 500;
  const otvety = [otvet(JSON.stringify(temy.map(([theme, kind]) => ({ theme, kind })))), ...stati.map(otvet)];
  const server = createServer((req, res) => { req.on('data', () => {}); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  try {
    const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
      sobytiyaSessii: [{ seq: 10, time: 2000, type: 'user/message', data: { content: 'STENOGRAMMA-vopros' } }, { seq: 11, time: 3000, type: 'assistant/message', data: { content: 'STENOGRAMMA-otvet' } },
                       { seq: 12, time: 3100, type: 'compaction/start', data: { compactionId: 'c1' } }],
      dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'pusto' + (++nomer),
      nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 0, predelTem: 0, minTokenov: 1, hvost: 'net' },
      krik: (m) => krik.push(String(m)), zapisat: (z) => { zapisi.push(z); return sleduyushchijId++; },
      blizhajshaya: () => ({ ishod: 'ne-s-chem', sravneno_s: 0 }), dejstvuyushchie: null, otnoshenie: null,
    });
    return { itog, krik, zapisi };
  } finally { server.close(); }
}
const stroki = (x) => x.krik.filter((k) => /^записано id \d+ \(\w+\) по теме «/.test(k));

// RU: Все пустые формы дают pusto=1 и не записываются.
// EN: Every empty shape gives pusto=1 and writes nothing.
for (const [imya, tekst] of [['без точки', 'НЕТ РЕЛЕВАНТНОГО'], ['с точкой', 'НЕТ РЕЛЕВАНТНОГО.'], ['с воскл. знаком', 'НЕТ РЕЛЕВАНТНОГО!'], ['пробелы + точка', '  НЕТ РЕЛЕВАНТНОГО. '], ['многоточие', 'НЕТ РЕЛЕВАНТНОГО…']]) {
  const x = await zahod([['тема-пустая', 'fakt']], [tekst]);
  proba(`П1 «${tekst}» (${imya}) → пусто, записей 0`, () => {
    if (x.zapisi.length !== 0) throw new Error(`записано ${x.zapisi.length}: «${x.zapisi[0]?.soderzhim}» — отказ лёг знанием`);
    if (x.itog.pusto !== 1) throw new Error(`itog.pusto = ${x.itog.pusto}, ждали 1`);
  });
}
// RU: Статья, начинающаяся этими словами и продолжающаяся содержанием, записывается как знание.
// EN: An article starting with those words and continuing with content is written as knowledge.
{
  const x = await zahod([['тема-с-текстом', 'fakt']], ['НЕТ РЕЛЕВАНТНОГО. Но есть факт: предел сводки снят 25.09.']);
  proba('П2 «НЕТ РЕЛЕВАНТНОГО. Но есть факт…» → записана 1', () => {
    if (x.zapisi.length !== 1) throw new Error(`записано ${x.zapisi.length}, ждали 1`);
  });
}
// RU: На каждую записанную статью ровно одна строка «записано id N (класс) по теме T» с её темой и классом.
// EN: Each written article emits exactly one “written id N (class) on topic T” line with its own topic and class.
{
  const x = await zahod([['тема-А', 'fakt'], ['тема-Б', 'urok'], ['тема-В', 'reshenie']],
                        ['# Статья А\nтело А', 'НЕТ РЕЛЕВАНТНОГО.', '# Статья В\nтело В']);
  proba('П3 строк «записано id … по теме» = записанных статей (2 из 3 тем, одна пустая)', () => {
    const s = stroki(x);
    if (x.zapisi.length !== 2) throw new Error(`записано ${x.zapisi.length}, ждали 2`);
    if (s.length !== x.zapisi.length) throw new Error(`строк ${s.length} при записанных ${x.zapisi.length}: ${s.join(' | ')}`);
  });
  proba('П4 строка называет id от ядра, класс и тему ЭТОЙ статьи', () => {
    const s = stroki(x);
    if (s[0] !== 'записано id 500 (fakt) по теме «тема-А»') throw new Error(`первая строка «${s[0]}»`);
    if (s[1] !== 'записано id 501 (reshenie) по теме «тема-В»') throw new Error(`вторая строка «${s[1]}»`);
  });
}

// RU: Закрепляем предел распознавания пустоты: кавычки вокруг ответа и другой регистр не узнаются. Изменение этого поведения требует обновить границу и пробу.
// EN: Preserve the empty-response recognition limit: surrounding quotes and different letter case are not recognized. A behavior change requires updating both the limit and probe.
for (const [imya, tekst] of [['в кавычках «»', '«НЕТ РЕЛЕВАНТНОГО»'], ['строчными', 'нет релевантного.']]) {
  const x = await zahod([['тема-граница', 'fakt']], [tekst]);
  proba(`П5 граница: «${tekst}» (${imya}) → записан (не ловится, названо в коде)`, () => {
    if (x.zapisi.length !== 1) throw new Error(`записано ${x.zapisi.length} — граница в коде описывает не то, что делает код`);
  });
}

const ZHDYOM = 10;
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2); }
console.log(`\nитог: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
