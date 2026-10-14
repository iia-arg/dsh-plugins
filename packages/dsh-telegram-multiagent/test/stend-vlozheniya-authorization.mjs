// RU: Изолированный стенд stend-vlozheniya-authorization.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-vlozheniya-authorization.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {harness} from './attachment-harness.mjs';
let received=0;
const store={receive:async()=>{received++;return {deliveryId:'a',path:'/saved',notice:'saved',text:'file data'};},prepare:async()=>true,queued:async()=>{}};
const doc={message:{chat:{id:1},from:{id:1},message_id:1,document:{file_id:'x'}}};
let h=harness(store,{authorized:false});await h.run(doc);await h.run({message:{chat:{id:1},from:{id:1},voice:{file_id:'x'}}});assert.equal(received,0);assert.equal(h.counts().transcribed,0);
h=harness(store);await h.run({message:{chat:{id:1},from:{id:1},voice:{file_id:'x'}}});assert.equal(h.counts().transcribed,1);assert(h.delivered[0].content[0].text.includes('[Voice transcript]: голос'));
h=harness(store,{noticeFailure:true});await h.run(doc).catch(()=>{});assert.equal(h.delivered.length,1,'receipt outage must not prevent already saved attachment delivery');assert.equal(h.counts().nudged,1,'receipt outage must not prevent queue wakeup');
console.log('PASS auth before IO; voice preserved; receipts independent of delivery');
