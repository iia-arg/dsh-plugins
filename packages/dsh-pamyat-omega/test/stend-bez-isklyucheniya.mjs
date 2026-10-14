// RU: Настоящий apply обязан закрывать автоматический и зарегистрированный ручной поиск до HTTP, если ядро не даёт политику исключения. Исправное ядро и возврат после порчи снова позволяют поиск; сервер считает фактические обращения.
// EN: Actual apply must block automatic and registered manual lookup before HTTP when the core lacks exclusion policy. A healthy core and recovery permit lookup again; the server counts actual requests.
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const subject = process.argv[2] ? pathToFileURL(resolve(process.argv[2], 'src/index.js')) : new URL('../src/index.js', import.meta.url);
let apply;
try { ({ apply } = await import(subject.href)); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; console.log('СЛЕПОТА: зависимости пакета не установлены'); process.exit(2); }
const launcher = process.argv[1];
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА: DSH_TEST_APP не задан для настоящей регистрации tools'); process.exit(2); }
process.argv[1] = resolve(process.env.DSH_TEST_APP, 'package.json');
let calls = 0;
const server = http.createServer((req, res) => {
  req.resume(); req.on('end', () => {
    calls++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Results: 0\n' }] } }) + '\n\n');
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const errors = [], original = console.error;
console.error = (...a) => errors.push(a.join(' '));
let core = { sessiyaIsklyuchena: () => false, doverieDlyaMem: () => ({}) }, hook, tool, getThrows = false;
const services = {};
try {
  apply({ provide: (n, v) => { services[n] = v; }, on: (n, f) => { if (n === 'agent/pre-step') hook = f; }, get: n => { if (n === 'pamyat' && getThrows) throw Error('fixture core unavailable'); return n === 'pamyat' ? core : n === 'tools' ? { register: v => { tool = v; } } : services[n]; } }, { adres: 'http://127.0.0.1:' + server.address().port + '/', vydacha: { vkl: true, koren: 'fixture-root' } });
  for (let i = 0; i < 30 && !tool; i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(tool?.execute, 'actual platform must register an executable lookup tool');
  const input = { agent: { id: 'fixture-session', session: { id: 'fixture-session' } }, signal: { aborted: false } };
  const next = async () => ({ kind: 'enter', messages: [{ role: 'user', source: { kind: 'a2a' }, content: [{ type: 'text', text: 'Проверь порядок монтажа пакета и суммы файлов после установки.' }] }] });
  await hook(input, next); assert.ok(calls > 0, 'healthy automatic lookup must reach HTTP');
  for (const mode of ['missing-method', 'missing-core', 'get-throws', 'excluded']) {
    const good = core; core = mode === 'excluded' ? { sessiyaIsklyuchena: () => true } : mode === 'missing-core' ? undefined : {};
    getThrows = mode === 'get-throws';
    const before = calls;
    await hook(input, next);
    assert.equal(calls, before, mode + ': automatic lookup must not call HTTP');
    const direct = await services.pamyatPoSmyslu.najti('порядок монтажа', { rezhim: 'po-zaprosu', sid: 'fixture-session' });
    assert.match(direct.otkaz ?? '', /PAMYAT_/); assert.equal(calls, before, mode + ': direct semantic service must not call HTTP');
    await assert.rejects(() => tool.execute({ zadacha: 'порядок монтажа' }, input), mode === 'excluded' ? /PAMYAT_SESSIYA_ISKLYUCHENA/ : /PAMYAT_POLITIKA_NEDOSTUPNA/);
    assert.equal(calls, before, mode + ': manual lookup must not call HTTP');
    if (mode !== 'excluded') assert.ok(errors.some(s => /ОТКАЗ/.test(s) && /sessiyaIsklyuchena/.test(s)), 'missing policy must be diagnosed as refusal');
    core = good; getThrows = false; await hook(input, next); assert.ok(calls > before, mode + ': recovered core must resume lookup');
  }
  console.log('PASS healthy / missing policy / excluded / recovery: actual hooks and registered tool');
} finally { console.error = original; process.argv[1] = launcher; await new Promise(r => server.close(r)); }
