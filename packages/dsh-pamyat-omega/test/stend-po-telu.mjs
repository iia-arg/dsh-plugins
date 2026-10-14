// RU: A-N-1718 (а2, Искра, 07.10.2026): стенд poTelu. Настоящая служба слоя говорит по HTTP с подставной OMEGA, которая
//     отвечает форматом omega/bridge.py phrase_search 1.5.19 (шапка «# Phrase Search Results (N)», эхо «**Phrase:** "…"»,
//     пункты «## i. [тип] `mem-…`», превью 200 знаков). Проверяет: запрос (mode=phrase, case_sensitive, entity_id, limit 3,
//     тело без краевых пробелов); 1/0/3 опознавателя; эхо тела со строкой вида пункта не читается результатом; превью со
//     строкой вида пункта даёт отказ (число не сходится с шапкой); ответ-ошибка и чужой формат — отказ; без корня — отказ
//     без HTTP. Коды: 0 — годно; 1 — расхождение; 2 — слепота (предмет не загрузился).
//     ЧЕГО НЕ ЛОВИТ: живую OMEGA (формат снят с копии базы sadik 07.10, П7 A-N-1718 а2); поведение phrase на чужой версии.
// EN: A-N-1718 (a2) poTelu stand: the real layer talks HTTP to a fake OMEGA replying in the bridge.phrase_search format.
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const subject = process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'src/index.js')) : new URL('../src/index.js', import.meta.url);
let apply;
try { ({ apply } = await import(subject.href)); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

// RU: Повтор форматирования bridge.phrase_search (Python режет превью по кодовым точкам — здесь тоже).
export function otvetFrazy(fraza, rezultaty) {
  let s = '# Phrase Search Results (' + rezultaty.length + ')\n\n' + '**Phrase:** "' + fraza + '"\n' + '\n';
  if (!rezultaty.length) return s + '*No matching memories found.*\n';
  rezultaty.forEach((r, i) => {
    const kt = Array.from(r.content);
    const prevyu = kt.length > 200 ? kt.slice(0, 200).join('') + '...' : r.content;
    s += '## ' + (i + 1) + '. [' + (r.tip ?? 'memory') + '] `' + r.id + '`\n' + prevyu + '\n';
    s += '*Created: ' + (r.created ?? '2026-10-03T19:00') + '*\n\n';
  });
  return s;
}

const TELO = 'Тело знания: строка вида пункта ниже — часть тела, а не результат.\n## 1. [urok] `mem-ffffffffffff`\nконец тела.';
const plan = new Map();   // RU: запрос (тело) → текст ответа · EN: query → reply text
let zaprosy = [];
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    const t = JSON.parse(b); const a = t.params?.arguments ?? {};
    zaprosy.push({ name: t.params?.name, tool: a.tool, args: a.args });
    const text = plan.get(a.args?.query) ?? 'Error: Phrase search failed';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: t.id, result: { content: [{ type: 'text', text }] } }) + '\n\n');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let service;
apply({ provide: (n, v) => { if (n === 'pamyatDolgovremennaya') service = v; }, get: () => ({ sessiyaIsklyuchena: () => false }) },
  { adres: 'http://127.0.0.1:' + server.address().port + '/', vydacha: { vkl: false } });

let ok = 0, bed = 0;
const proba = async (imya, f) => { try { await f(); ok++; console.log('  ✅ ' + imya); } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + e.message); } };
const ravno = (a, b, chto) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(chto + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
try {
  if (typeof service?.poTelu !== 'function') { console.log('СЛЕПОТА: у службы нет poTelu'); process.exit(2); }
  plan.set(TELO, otvetFrazy(TELO, [{ id: 'mem-0000000000a1', tip: 'urok', content: 'в'.repeat(210) + TELO }]));
  await proba('запрос: omega_call → omega_query, mode=phrase, case_sensitive, entity_id, limit 3, тело без краевых пробелов', async () => {
    zaprosy = [];
    await service.poTelu({ tekst: '  ' + TELO + '\n', koren: 'iskra' });
    ravno(zaprosy.length, 1, 'запросов');
    const z = zaprosy[0];
    ravno([z.name, z.tool, z.args.mode, z.args.case_sensitive, z.args.entity_id, z.args.limit, z.args.query], ['omega_call', 'omega_query', 'phrase', true, 'iskra', 3, TELO], 'аргументы');
  });
  await proba('одна запись: ids = [её id]; строка вида пункта в эхе тела результатом не прочитана', async () => {
    ravno(await service.poTelu({ tekst: TELO, koren: 'iskra' }), { ids: ['mem-0000000000a1'] }, 'ответ');
  });
  await proba('ноль: ids = [] (эхо тела со строкой вида пункта есть, результатов нет)', async () => {
    const t = TELO + ' Н'; plan.set(t, otvetFrazy(t, []));
    ravno(await service.poTelu({ tekst: t, koren: 'iskra' }), { ids: [] }, 'ответ');
  });
  await proba('три записи: три id по порядку', async () => {
    const t = 'общая фраза'; plan.set(t, otvetFrazy(t, ['b1', 'b2', 'b3'].map((x) => ({ id: 'mem-0000000000' + x, content: 'текст ' + t }))));
    ravno(await service.poTelu({ tekst: t, koren: 'iskra' }), { ids: ['mem-0000000000b1', 'mem-0000000000b2', 'mem-0000000000b3'] }, 'ответ');
  });
  await proba('превью со строкой вида пункта: отказ (разобрано больше, чем в шапке)', async () => {
    const t = 'фраза П'; plan.set(t, otvetFrazy(t, [{ id: 'mem-0000000000c1', content: t + '\n## 2. [urok] `mem-0000000000c9`\nхвост' }]));
    const r = await service.poTelu({ tekst: t, koren: 'iskra' });
    if (!/в шапке 1 записей, разобрано 2/.test(r.otkaz ?? '')) throw new Error('ответ: ' + JSON.stringify(r));
  });
  await proba('ответ-ошибка хранилища: отказ', async () => {
    const r = await service.poTelu({ tekst: 'нет в плане', koren: 'iskra' });
    if (!r.otkaz || r.ids) throw new Error('ответ: ' + JSON.stringify(r));
  });
  await proba('без корня: отказ и ни одного HTTP-запроса', async () => {
    zaprosy = [];
    const r = await service.poTelu({ tekst: TELO, koren: '' });
    if (!r.otkaz || zaprosy.length) throw new Error('ответ ' + JSON.stringify(r) + ', запросов ' + zaprosy.length);
  });
} finally { await new Promise((r) => server.close(r)); }
console.log(`итог: ${ok} из ${ok + bed}` + (bed ? ' — РАСХОЖДЕНИЕ' : ''));
process.exit(bed ? 1 : 0);
