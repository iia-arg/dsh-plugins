// RU: Настоящая служба sohranit не отправляет запись без доступной политики ядра, даже при выключенной выдаче. HTTP считает обращения; после возвращения метода запись снова достигает службы. Не проверяет привязку сессии у вызывающего ядра.
// EN: Actual sohranit must not send writes without core policy, even when retrieval is disabled. HTTP counts calls; restoring the method permits writes again. Does not check session binding in the calling core.
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const subject = process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'src/index.js')) : new URL('../src/index.js', import.meta.url);
let apply;
try { ({ apply } = await import(subject.href)); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; console.log('СЛЕПОТА: зависимости пакета не установлены'); process.exit(2); }
let calls = 0;
const server = http.createServer((req, res) => {
  req.resume(); req.on('end', () => { calls++; res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Stored mem-0123456789ab' }] } }) + '\n\n'); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const original = console.error, logs = [];
console.error = (...a) => logs.push(a.join(' '));
let core = { sessiyaIsklyuchena: () => false }, service;
try {
  apply({ provide: (n, v) => { if (n === 'pamyatDolgovremennaya') service = v; }, get: () => core }, { adres: 'http://127.0.0.1:' + server.address().port + '/', vydacha: { vkl: false } });
  const input = { soderzhim: 'synthetic fixture knowledge', kto: 'fixture-root' };
  await service.sohranit(input); assert.ok(calls > 0, 'healthy writer must reach HTTP');
  for (const mode of ['missing-method', 'missing-core']) {
    core = mode === 'missing-method' ? {} : undefined;
    const before = calls;
    const active = await service.aktivnye({ tekst: 'fixture knowledge', koren: 'fixture-root' });
    assert.match(active.otkaz ?? '', /PAMYAT_POLITIKA_NEDOSTUPNA/); assert.equal(calls, before);
    const result = await service.sohranit(input);
    assert.equal(result.sostoyanie, 'ne-otpravleno'); assert.equal(calls, before);
    assert.match(result.pochemu, /PAMYAT_POLITIKA_NEDOSTUPNA/);
    assert.ok(logs.some(s => /ОТКАЗ/.test(s) && /sessiyaIsklyuchena/.test(s)));
    core = { sessiyaIsklyuchena: () => false }; await service.sohranit(input); assert.ok(calls > before);
  }
  console.log('PASS actual writer: healthy / missing policy / recovery, no HTTP on refusal');
} finally { console.error = original; await new Promise(r => server.close(r)); }
