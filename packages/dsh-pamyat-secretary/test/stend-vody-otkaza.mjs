// RU: Настоящий ходовой зов: исправное состояние → испорченный файл воды без повторного разбора → возврат; отказ сохранения не печатает сдвиг и не меняет первичную воду. Факт порчи печатается SHA и отдельным grep -cF.
// EN: Actual turn entry: healthy state → corrupt watermark without reprocessing → recovery; save failure neither reports advancement nor changes primary state. Mutation evidence prints SHA and separate grep -cF.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const subject = process.env.SECRETARY_SOURCE ? pathToFileURL(path.join(process.env.SECRETARY_SOURCE, 'hodovoj-zov.js')) : new URL('../src/hodovoj-zov.js', import.meta.url);
const { sozdatHodovojZov } = await import(subject.href);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secretary-water-'));
const file = path.join(dir, 'pamyat-secretary/vysokaya-voda.json');
const logs = []; let calls = 0;
const sum = b => createHash('sha256').update(b).digest('hex');
try {
  const zov = sozdatHodovojZov({ nastrojka: { vkl: true, porogZnakov: 20 }, dshHome: dir, krik: x => logs.push(x), zapustit: async () => { calls++; return { ishod: 'ok', okon: 1, okonOk: 1 }; } });
  const session = { id: 'fixture-session', events: [{ seq: 0, type: 'user/message', data: { content: 'Проверяем сохранение воды, запись и повтор среза.' } }, { seq: 1, type: 'turn/end', data: {} }] };
  await zov.naSobytie(session, session.events[1]); assert.equal(calls, 1);
  const healthy = fs.readFileSync(file); assert.equal(JSON.parse(healthy)['fixture-session'].voda, 1);
  if (process.env.WATER_PROBE !== 'save') {
  fs.writeFileSync(file, '{BROKEN_WATER');
  assert.notEqual(sum(fs.readFileSync(file)), sum(healthy));
  assert.equal(spawnSync('grep', ['-cF', '{BROKEN_WATER', file], { encoding: 'utf8' }).stdout.trim(), '1');
  console.log('ПОРЧА ВНЕСЕНА: записей 1, SHA256 ' + sum(healthy) + ' → ' + sum(fs.readFileSync(file)) + ', grep-cF=1');
  await zov.naSobytie(session, session.events[1]); assert.equal(calls, 1, 'corrupt water must not reprocess history'); assert.ok(logs.some(x => /ОТКАЗ/.test(x) && /вод/.test(x)));
  fs.writeFileSync(file, healthy); await zov.naSobytie(session, session.events[1]); assert.equal(calls, 1);
  }
  if (process.env.WATER_PROBE === 'schema') {
    fs.writeFileSync(file, JSON.stringify({ 'fixture-session': null }));
    await zov.naSobytie(session, session.events[1]);
    assert.equal(calls, 1, 'null stored session must not reset watermark');
    fs.writeFileSync(file, healthy);
  }
  session.events.push({ seq: 2, type: 'user/message', data: { content: 'Следующее окно после восстановленного состояния воды.' } }, { seq: 3, type: 'turn/end', data: {} });
  const temp = file + '.' + process.pid + '.tmp'; fs.mkdirSync(temp); logs.length = 0;
  const before = fs.readFileSync(file); await zov.naSobytie(session, session.events[3]); assert.equal(calls, 2);
  assert.equal(sum(fs.readFileSync(file)), sum(before)); assert.ok(!logs.some(x => /вода сдвинута/.test(x))); assert.ok(logs.some(x => /НЕ ЗАПИСАНА/.test(x)));
  fs.rmdirSync(temp); logs.length = 0; await zov.naSobytie(session, session.events[3]); assert.equal(calls, 3); assert.equal(JSON.parse(fs.readFileSync(file))['fixture-session'].voda, 3); assert.ok(logs.some(x => /вода сдвинута/.test(x)));
  console.log('PASS real watermark: read refusal, save refusal, recovery');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
