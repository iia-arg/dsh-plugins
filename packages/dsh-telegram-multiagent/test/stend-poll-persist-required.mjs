// RU: Изолированный стенд stend-poll-persist-required.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-poll-persist-required.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import { TelegramClient } from '../src/client.js';

function fixture() {
  const client = new TelegramClient('test-only', () => {});
  client.offset = 10;
  let calls = 0;
  const updates = [{update_id:10}, {update_id:11}];
  client.call = async () => { calls++; return updates; };
  return {client, updates, calls: () => calls};
}
for (const [name, args] of [
  ['omitted', [0]], ['null', [0,null]], ['undefined', [0,undefined]],
  ['string', [0,'persist']], ['number', [0,1]], ['object', [0,{}]],
  ['false', [0,false]],
]) {
  const f=fixture();
  await assert.rejects(f.client.poll(...args), /persist.*function/, name);
  assert.equal(f.calls(),0,name+' network');
  assert.equal(f.client.offset,10,name+' offset');
  console.log('PASS '+name+': offset 10 -> 10; network 0');
}
{
  const f=fixture(); let release; let saved;
  const pending=f.client.poll(0,async batch=>{
    assert.equal(f.client.offset,10);
    await new Promise(resolve=>{release=resolve;});
    saved=batch;
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls(),1);assert.equal(f.client.offset,10);
  release();assert.deepEqual(await pending,f.updates);assert.deepEqual(saved,f.updates);
  assert.equal(f.client.offset,12);
  console.log('PASS async function: offset 10 while pending -> 12 after completion; network 1');
}
for (const [name, persist] of [
  ['sync throw', ()=>{throw Error('disk unavailable');}],
  ['async reject', async()=>{throw Error('disk unavailable');}],
]) {
  const f=fixture();await assert.rejects(f.client.poll(0,persist),/disk unavailable/);
  assert.equal(f.calls(),1);assert.equal(f.client.offset,10);
  console.log('PASS '+name+': offset 10 -> 10; network 1');
}
{
  const f=fixture();let saved;
  await f.client.poll(0,batch=>{saved=batch;});assert.deepEqual(saved,f.updates);
  assert.equal(f.client.offset,12);
  console.log('PASS sync function: offset 10 -> 12; network 1');
}

{
  const f=fixture();await f.client.poll(0,()=>{});
  assert.equal(f.client.offset,12);
  console.log('LIMIT no-op function accepted: offset 10 -> 12; persistence NOT proven');
}
