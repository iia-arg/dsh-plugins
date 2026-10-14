// RU: Изолированный стенд stend-receipt-offset.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-offset.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import {TelegramClient} from '../src/client.js';
const client=new TelegramClient('test-only',()=>{});client.offset=10;
client.call=async()=>[{update_id:10,message:{text:'a'}},{update_id:11,message:{text:'b'}}];
await assert.rejects(client.poll(0,async()=>{throw Error('disk unavailable');}),/disk unavailable/);assert.equal(client.offset,10);
let persisted;await client.poll(0,async batch=>{assert.equal(client.offset,10);persisted=batch;});assert.equal(persisted.length,2);assert.equal(client.offset,12);
console.log('PASS offset retained on failed receipt; advances only after batch receipt');
