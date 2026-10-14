// RU: Проверяем итог секретаря через настоящий distillirovat с подставным сервером. zapisat возвращает числовой id, а исход хранится только в журнале ядра: «записано N» считает вставки и не выдумывает версию ядра. Сам исход с журналом ядра не сверяется: секретарю журнал не доступен.
// EN: Test the secretary’s summary through real distillirovat with a fake server. zapisat returns a numeric id while outcomes live only in the core journal: “written N” counts inserts and does not invent a core version. Outcomes are not compared with the core journal, which the secretary cannot access.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat } from '../src/distill-shov.js';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
// RU: Без метода маски входа тело дистилляции отказывает. Здесь маска-пустышка намеренно пропускает текст, чтобы изолировать другой предмет; маску проверяет stend-maski-vhoda-sekretarya.
// EN: The distillation body rejects without the input-mask method. Here an identity fake deliberately passes text through to isolate another subject; stend-maski-vhoda-sekretarya tests masking.
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, vsego = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-ishoda-yadra-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
let nomer = 0;
async function zahod(otvetYadra) {
  let vyzov = 0; const krik = [];
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"тема-А","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'СТАТЬЯ' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const server = createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    sobytiyaSessii: [{ seq: 10, type: 'user/message', data: { content: 'вопрос' } }, { seq: 11, type: 'assistant/message', data: { content: 'ответ' } }, { seq: 12, type: 'compaction/start', data: { compactionId: 'c1' } }],
    dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'ishod' + (++nomer),
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 0, predelTem: 5, minTokenov: 1, hvost: 'net' },
    krik: (m) => krik.push(String(m)), zapisat: () => otvetYadra, blizhajshaya: () => ({ ishod: 'sravneno', id: 7, blizost: 0.1 }),
  });
  server.close();
  return { itog, krik };
}
const x1 = await zahod(3301);
const x2 = await zahod({ id: 3302, ishod: 'zapisano', priroda: 'proba' });

proba('1 ЯДРО ОТДАЛО ЧИСЛО (как a83): строка «записано 1 — это число вставок… смотреть в журнале ядра», ложного «старше a67» нет', () => {
  if (x1.itog?.zapisano !== 1) throw new Error('записано ' + x1.itog?.zapisano);
  if (!x1.krik.some((k) => k.includes('«записано 1» — это число вставок в память') && k.includes('пишет в свой журнал'))) throw new Error('строки нет: ' + x1.krik.filter((k) => k.includes('записано')).join(' | ').slice(0, 200));
  if (x1.krik.some((k) => /старше a67|по-старому/.test(k))) throw new Error('ложная строка о старом ядре осталась');
});
proba('2 ЯДРО ОТДАЛО ОБЪЕКТ С ИСХОДОМ: считается по исходу, строки о невидимом исходе нет', () => {
  if (x2.itog?.zapisano !== 1) throw new Error('записано ' + x2.itog?.zapisano);
  if (x2.krik.some((k) => k.includes('это число вставок'))) throw new Error('строка о невидимом исходе при видимом исходе');
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд исхода ядра: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
