// RU: Настоящий pre-step не читает память и не вставляет welcome без политики исключения ядра. Исправное ядро, явное исключение и возврат проверяются счётчиком чтений и содержимым результата, а не кодом загрузки.
// EN: Actual pre-step neither reads memory nor injects welcome without core exclusion policy. A healthy core, explicit exclusion and recovery are checked by read counts and returned content, not import success.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const subject = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2], 'src/index.js')) : new URL('../src/index.js', import.meta.url);
let apply, Config;
try { ({ apply, Config } = await import(subject.href + '?exclusion-test')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; console.log('СЛЕПОТА: зависимости пакета не установлены'); process.exit(2); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-exclusion-'));
const original = process.stderr.write, logs = [];
process.stderr.write = s => { logs.push(String(s)); return true; };
let calls = 0, seq = 0;
const read = async () => { calls++; return [{ id: 1, klass: 'fakt', soderzhim: 'RESTORE_EXCLUSION_CANARY', sozdano: Date.now() }]; };
let core = { sessiyaIsklyuchena: () => false, prochitat: read };
try {
  const handlers = {};
  apply({ on: (n, f) => { handlers[n] = f; return () => {}; }, get: n => n === 'pamyat' ? core : undefined }, Config({ welcomeEnabled: true, welcomeOtmetki: path.join(dir, 'marks') }));
  const run = async () => {
    const sid = 'fixture-session-' + seq++;
    return handlers['agent/pre-step']({ agent: { id: sid, session: { id: sid, events: [] } }, turn: 1, step: 1, signal: { aborted: false } }, async () => ({ kind: 'enter', messages: [] }));
  };
  assert.ok(JSON.stringify(await run()).includes('RESTORE_EXCLUSION_CANARY')); assert.ok(calls > 0);
  for (const mode of ['missing-method', 'missing-core', 'excluded']) {
    const good = core; core = mode === 'missing-method' ? { prochitat: read } : mode === 'excluded' ? { sessiyaIsklyuchena: () => true, prochitat: read } : undefined;
    const before = calls; const result = await run();
    assert.equal(calls, before, mode + ': memory must not be read'); assert.equal(result.messages.length, 0);
    if (mode !== 'excluded') assert.ok(logs.some(s => /ОТКАЗ/.test(s) && /sessiyaIsklyuchena/.test(s)), 'missing policy must be diagnosed as refusal');
    core = good; assert.ok(JSON.stringify(await run()).includes('RESTORE_EXCLUSION_CANARY')); assert.ok(calls > before);
  }
  console.log('PASS healthy / missing policy / excluded / recovery: actual restore hook');
} finally { process.stderr.write = original; fs.rmSync(dir, { recursive: true, force: true }); }
