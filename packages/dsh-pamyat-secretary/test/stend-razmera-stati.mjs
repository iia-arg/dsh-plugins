// RU: Проверяем указание размера статьи в настоящем distillirovat: для исходного вызова и повтора последняя строка user равна KONEC_STATI, system равен STATYA с тем же ориентиром 3000. Первой статье задаём пустой ответ, чтобы вызвать повтор; просьбы «напиши больше» нет. Послушание живой модели пределу 3000 не проверяется.
// EN: Test the article-size instruction in real distillirovat: for both the first call and retry, the final user line equals KONEC_STATI and system equals STATYA with the same 3000 guideline. Make the first article response empty to trigger retry; no “write more” request remains. Live-model compliance with 3000 is untested.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat } from '../src/distill-shov.js';
import { STATYA, KONEC_STATI } from '../src/promty.js';
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
const kat = vremennyj(join(tmpdir(), 'stend-razmera-stati-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const SOB = [
  { seq: 10, type: 'user/message', data: { content: 'вопрос про предмет' } },
  { seq: 11, type: 'assistant/message', data: { content: 'ответ про предмет' } },
  { seq: 12, type: 'compaction/start', data: { compactionId: 'c1' } },
  { seq: 13, type: 'compaction/summary', data: { compactionId: 'c1', shadowedSeqs: [10, 11] } },
];
const zaprosy = []; let vyzov = 0;
const otvety = [
  { content: [{ type: 'text', text: '[{"theme":"тема-А","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
  { content: [{ type: 'text', text: '' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
  { content: [{ type: 'text', text: 'СТАТЬЯ про предмет' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
];
const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const krik = [];
const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  sobytiyaSessii: SOB, dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'razmer',
  nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`,
               maxTokenovTem: 1000, maxTokenovStati: 0, predelTem: 5, minTokenov: 1, hvost: 'vse' },
  krik: (m) => krik.push(String(m)), zapisat: () => ({ id: 1, ishod: 'zapisano' }), blizhajshaya: () => ({ ishod: 'sravneno', id: 7, blizost: 0.1 }),
});
server.close();
const system = (z) => (typeof z?.system === 'string' ? z.system : JSON.stringify(z?.system ?? ''));
const posledneeUser = (z) => { const m = (z?.messages ?? []).filter((x) => x.role === 'user').at(-1); const c = m?.content;
  const t = Array.isArray(c) ? c.map((b) => b?.text ?? '').join('') : String(c ?? ''); return t.trimEnd().split('\n').at(-1); };
const stati = zaprosy.slice(1);

proba('1 ПРОМТ: указание «не более 3000» в STATYA, «напиши больше» и «просьба, а не обязательный предел» — нет', () => {
  if (!STATYA.includes(KONEC_STATI)) throw new Error('указания нет в STATYA');
  if (/напиши больше|просьба, а не обязательный предел/.test(STATYA)) throw new Error('разрешение превышать осталось');
  if (!/не более 3000 знаков/.test(KONEC_STATI)) throw new Error('число не 3000: ' + KONEC_STATI);
});
proba('2 ОБА ВЫЗОВА СТАТЬИ (первый и повтор): system = STATYA с указанием, ПОСЛЕДНЯЯ строка user = KONEC_STATI', () => {
  if (stati.length !== 2) throw new Error(`вызовов статьи ${stati.length}, ждали 2 (первый пустой → повтор); строки: ` + krik.filter((k) => /повтор|ПОВТОР/.test(k)).join(' | ').slice(0, 160));
  stati.forEach((z, i) => {
    if (!system(z).includes(KONEC_STATI)) throw new Error(`вызов ${i + 1}: в system нет указания`);
    const p = posledneeUser(z); if (p !== KONEC_STATI) throw new Error(`вызов ${i + 1}: последняя строка user «${p.slice(0, 80)}»`);
  });
});
proba('3 ВЫБОР ТЕМ не тронут: последняя строка user — прежний KONEC_VYBORA, указания размера статьи нет', () => {
  const p = posledneeUser(zaprosy[0]); if (!p.startsWith('Верни СТРОГО массив JSON')) throw new Error('последняя строка выбора тем: ' + p.slice(0, 80));
  if (JSON.stringify(zaprosy[0]?.messages ?? '').includes(KONEC_STATI)) throw new Error('указание статьи попало в выбор тем');
});
proba('4 ЧИСЛО ВЫНУТО ИЗ ПРОМТА (регэксп distill-shov в согласии с формулировкой): orientirStati 3000, слепоты нет', () => {
  if (itog?.orientirStati !== 3000) throw new Error('orientirStati ' + itog?.orientirStati);
  if (krik.some((k) => /ориентир.*НЕ ВЫНУТ/.test(k))) throw new Error('прибор ослеп');
});
proba('5 ОДНА СТАТЬЯ — ОДНА ТЕМА (integration-note дельта): «изложи отдельно» 0 раз, новое указание — ровно 1 раз', () => {
  const skolko = (s) => STATYA.split(s).length - 1;
  for (const star of ['Другие темы изложи отдельно', 'Сохраняй одну тему статьи']) if (skolko(star) !== 0) throw new Error('осталось: ' + star);
  for (const nov of ['Одна статья — одна тема', 'Другие темы в эту статью НЕ включай: ни разделами, ни списком, ни приложением.'])
    if (skolko(nov) !== 1) throw new Error(`«${nov}» — ${skolko(nov)} раз, ждали 1`);
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд размера статьи: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
