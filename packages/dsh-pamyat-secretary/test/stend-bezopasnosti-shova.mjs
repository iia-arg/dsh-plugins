// RU: Настоящий distillirovat с локальным HTTP и SQLite: оба запроса суда должны маскировать кандидатов; отказ маски не должен стать обычной записью; непустой бюджетный обрыв не записывается; нулевой maxTokenovTem выбирает положительный потолок провайдера. Это не проверка качества суждения модели.
// EN: Actual distillirovat with local HTTP and SQLite: both judgment requests must mask candidates; mask refusal must not become an ordinary write; nonempty truncation is not stored; zero maxTokenovTem uses a positive provider ceiling. This does not assess model judgment quality.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
const subject = process.env.SECRETARY_SOURCE ? pathToFileURL(path.join(process.env.SECRETARY_SOURCE, 'distill-shov.js')) : new URL('../src/distill-shov.js', import.meta.url);
let distillirovat;
try { ({ distillirovat } = await import(subject.href)); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; console.log('СЛЕПОТА: зависимости секретаря не установлены'); process.exit(2); }
const SECRET = 'API_KEY=synthetic_judgment_fixture_0123456789';
let good = 0, bad = 0;
for (const mode of ['court', 'mask-refusal', 'mask-throw', 'mask-metadata', 'truncation', 'zero-budget']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretary-boundary-'));
  const db = new DatabaseSync(path.join(dir, 'fixture.db')); db.exec('CREATE TABLE writes (text TEXT)');
  const requests = [], logs = [];
  const server = createServer((req, res) => { let raw = ''; req.on('data', x => { raw += x; }); req.on('end', () => {
    const body = JSON.parse(raw); requests.push(body);
    const n = requests.length;
    const text = n === 1 ? JSON.stringify([{ theme: 'fixture', kind: 'reshenie' }]) : n === 2 ? 'Проверяй фактическую запись отдельным чтением.' : 'ОТМЕНЯЕТ: 11';
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: mode === 'truncation' && n === 2 ? 'max_tokens' : 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  }); });
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const journal = path.join(dir, 's.jsonl.zstd'), key = path.join(dir, 'key');
    fs.writeFileSync(journal, zstdCompressSync(Buffer.from(JSON.stringify({ seq: 10, type: 'user/message', time: Date.now(), data: { content: 'Проверь договор сохранения полезных знаний.' } }) + '\n')));
    fs.writeFileSync(key, 'synthetic-fixture-key', { mode: 0o600 });
    const result = await distillirovat({ putZhurnala: journal, dannye: { shadowedSeqs: [10], shadowedTokenCount: 5000 }, seansId: 'fixture-session-' + mode,
      nastrojka: { klyuch: { fajlKlyucha: key }, model: 'fixture', adres: 'http://127.0.0.1:' + server.address().port + '/v1/messages', maxTokenovTem: mode === 'zero-budget' ? 0 : 1000, maxTokenovStati: 1000, predelTem: 5, minTokenov: 1 },
      maska: text => { if (mode === 'mask-throw' && text.includes(SECRET)) throw Error('fixture-mask-refusal'); if (mode === 'mask-metadata' && text.includes(SECRET)) return { tekst: text, zameneno: 1 }; return mode === 'mask-refusal' && text.includes(SECRET) ? { tekst: text, predelDostignut: true } : { tekst: text.replaceAll(SECRET, '[СЕКРЕТ TEST]'), zameneno: text.includes(SECRET) ? 1 : 0, klassy: ['TEST'], predelDostignut: false }; },
      krik: x => logs.push(x),
      zapisat: z => ({ id: Number(db.prepare('INSERT INTO writes VALUES (?)').run(z.soderzhim).lastInsertRowid), ishod: 'zapisano', priroda: 'znanie' }),
      ...(['court', 'mask-refusal', 'mask-throw', 'mask-metadata'].includes(mode) ? { dejstvuyushchie: () => ({ ishod: 'sravneno', spisok: [{ id: 11, klass: 'reshenie', soderzhim: SECRET, istochnik: 'older-fixture', sozdano: Date.now() - 60000 }] }), otnoshenie: () => ({ ishod: 'ustanovleno' }) } : {}) });
    const written = Number(db.prepare('SELECT count(*) AS n FROM writes').get().n);
    if (mode === 'court') { assert.equal(requests.length, 4); assert.ok(requests.slice(2).every(r => !JSON.stringify(r).includes(SECRET) && JSON.stringify(r).includes('[СЕКРЕТ TEST]'))); assert.equal(written, 1); }
    if (['mask-refusal', 'mask-throw', 'mask-metadata'].includes(mode)) { assert.equal(requests.length, 2); assert.equal(written, 0); assert.equal(result.ishod, 'net-maski'); }
    if (mode === 'truncation') { assert.equal(written, 0); assert.equal(result.oborvannyh, 1); assert.equal(result.ishod, 'statya-oborvana'); assert.ok(logs.some(x => /ОБОРВАНА/.test(x) && /НЕ/.test(x))); }
    if (mode === 'zero-budget') { assert.ok(requests[0].max_tokens > 0); assert.equal(written, 1); }
    good++; console.log('PASS ' + mode);
  } catch (e) { bad++; console.log('FAIL ' + mode + ': ' + e.message); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log('shared-body cases ' + good + '/' + (good + bad)); process.exitCode = bad ? 1 : 0;
