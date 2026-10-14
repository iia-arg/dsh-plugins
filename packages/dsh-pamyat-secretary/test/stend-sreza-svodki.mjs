// RU: Срез только из прошлых сводок source plugin compact не дистиллируется; смешанный разбирается без превращения сводки в знание. Проверяем настоящие srezTolkoIzSvodok/distillirovat и решение до метки разбора. Изменение формы source платформой автоматически не обнаруживается.
// EN: A slice containing only earlier source plugin compact summaries is not distilled; a mixed slice is processed without treating summaries as knowledge. Test real srezTolkoIzSvodok/distillirovat and decision placement before the processing marker. Platform source-shape changes are not detected automatically.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat, srezTolkoIzSvodok } from '../src/distill-shov.js';
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
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-sreza-svodki-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const SVODKA = 'SVODKA-proshlogo-szhatiya-tekst';
const svodka = (seq) => ({ seq, type: 'user/message', data: { content: SVODKA, source: { kind: 'plugin', plugin: 'compact', compactionId: 'c0' } } });
const rech = (seq, t) => ({ seq, type: seq % 2 ? 'assistant/message' : 'user/message', data: { content: t } });

await proba('1 СРЕЗ ИЗ ОДНОЙ СВОДКИ (как у исполнитель 5610–5610) → пропуск', () => {
  const sob = [{ seq: 9, type: 'compaction/summary', data: { compactionId: 'c0', shadowedSeqs: [1] } }, svodka(10), { seq: 11, type: 'compaction/end', data: {} }];
  if (srezTolkoIzSvodok(sob, [10]) !== true) throw new Error('не распознан');
});
await proba('2 ОБЫЧНЫЙ СРЕЗ → не пропуск; СМЕШАННЫЙ → не пропуск; служебное без речи → не пропуск', () => {
  if (srezTolkoIzSvodok([rech(10, 'a'), rech(11, 'b')], [10, 11]) !== false) throw new Error('обычный принят за сводку');
  if (srezTolkoIzSvodok([svodka(10), rech(11, 'b')], [10, 11]) !== false) throw new Error('смешанный принят за сводку');
  if (srezTolkoIzSvodok([{ seq: 10, type: 'compaction/end', data: {} }], [10]) !== false) throw new Error('срез без речи принят за сводку');
  if (srezTolkoIzSvodok([{ seq: 10, type: 'user/message', data: { content: 'x', source: { kind: 'plugin', plugin: 'time-context' } } }], [10]) !== false) throw new Error('чужая вставка плагина принята за сводку');
});
await proba('2б ВСТАВКА ВОССТАНОВЛЕНИЯ dsh-pamyat-restore (дельта 00:38): срез из неё → пропуск; в смешанном — выкидывается', async () => {
  const rest = (seq) => ({ seq, type: 'user/message', data: { content: 'RESTORE-vosstanovlenie-svodki', source: { kind: 'plugin', plugin: 'dsh-pamyat-restore' } } });
  if (srezTolkoIzSvodok([rest(10)], [10]) !== true) throw new Error('срез из восстановления не распознан');
  if (srezTolkoIzSvodok([svodka(10), rest(11)], [10, 11]) !== true) throw new Error('сводка + восстановление не распознаны');
});
await proba('3 СМЕШАННЫЙ СРЕЗ: сводка в модель НЕ уходит, обычная речь — уходит; строка «исключено сводок 1»', async () => {
  const zaprosy = []; let vyzov = 0; const krik = [];
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"тема-А","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'СТАТЬЯ' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    sobytiyaSessii: [svodka(10), rech(11, 'OBYCHNAYA-rech-agenta'), { seq: 12, type: 'compaction/start', data: { compactionId: 'c1' } }],
    dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'srez-svodki',
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 0, predelTem: 5, minTokenov: 1, hvost: 'net' },
    krik: (m) => krik.push(String(m)), zapisat: () => ({ id: 1, ishod: 'zapisano' }), blizhajshaya: () => ({ ishod: 'sravneno', id: 7, blizost: 0.1 }),
  });
  server.close();
  const vse = JSON.stringify(zaprosy.map((z) => z?.messages));
  if (!zaprosy.length) throw new Error('модель не звалась');
  if (vse.includes(SVODKA)) throw new Error('сводка прошлого сжатия ушла в модель');
  if (!vse.includes('OBYCHNAYA-rech-agenta')) throw new Error('обычная речь пропала');
  if (!krik.some((k) => k.includes('исключено сводок прошлых сжатий: 1'))) throw new Error('строки об исключении нет');
});
let propustitSrezSvodki;
try { ({ propustitSrezSvodki } = await import(new URL('../src/index.js', import.meta.url).href)); }
catch (e) { console.log('СЛЕПОТА: index.js не импортировался — ' + String(e?.message ?? e).slice(0, 120)); process.exit(2); }
await proba('4 РЕШЕНИЕ ОБРАБОТЧИКА (propustitSrezSvodki): сводка → true и обе строки; обычный срез → false и ни строки', () => {
  const k1 = []; if (propustitSrezSvodki({ events: [svodka(10)] }, { shadowedSeqs: [10] }, (m) => k1.push(m)) !== true) throw new Error('срез из сводки не пропущен');
  if (!k1.includes('срез — сводка прошлого сжатия, знаний нет') || !k1.some((k) => k.startsWith('дистилляция: ЗАКОНЧЕНА — пропуск, причина'))) throw new Error('строки: ' + k1.join(' | '));
  const k2 = []; if (propustitSrezSvodki({ events: [rech(10, 'a')] }, { shadowedSeqs: [10] }, (m) => k2.push(m)) !== false || k2.length) throw new Error('обычный срез пропущен или печать');
});
await proba('5 ОБРАБОТЧИК зовёт решение ДО метки разбора — точной строкой с выходом', () => {
  const t = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  // RU: Обработчик сжатия вызывает общее zapustitZahod, используемое обоими зовущими.
  // EN: The compaction handler calls shared zapustitZahod used by both callers.
  const z = t.indexOf('function zapustitZahod('), i = t.indexOf('\n          if (propustitSrezSvodki(session, dannye, krik)) return', z), m = t.indexOf('metki.postavit(', z);
  if (z < 0 || i < z || m < i) throw new Error(`порядок: тело ${z}, решение ${i}, метка ${m}`);
  const h = t.indexOf('zapustitDistillyaciyu: () => {'), v = t.indexOf('zapustitZahod(session, event.data', h);
  if (h < 0 || v < h || v - h > 600) throw new Error(`обработчик сжатия не зовёт zapustitZahod: обработчик ${h}, вызов ${v}`);
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд среза сводки: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
