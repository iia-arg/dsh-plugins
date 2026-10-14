// RU: Изолированный стенд stend-receipt-session.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-session.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import {resolveReceiptSession} from '../src/receipt-session.js';
const r={session_id:'telegram-a2a',session_created:1,route_key:'123'};
const handle=(id='telegram-a2a',createdAt=1)=>({agent:{session:{id,header:{createdAt},events:[]}}});
let reads=0,resumes=0;
const deps={entries:[{handle:handle()}],persistence:{inspect:async()=>{reads++;return {meta:{id:r.session_id,createdAt:1},events:[]};}},resume:async(id,validate)=>{resumes++;const h=handle(id);validate(h.agent);return h;}};
assert.equal((await resolveReceiptSession(r,deps)).handle.agent.session.id,'telegram-a2a');assert.equal(reads,0);console.log('PASS merged');
const normal={...r,session_id:'telegram-123'};assert.equal((await resolveReceiptSession(normal,{...deps,entries:[{handle:handle('telegram-123')}]})).sessionId,'telegram-123');console.log('PASS normal identity');
await assert.rejects(resolveReceiptSession(r,{...deps,entries:[],persistence:{inspect:async()=>null}}),e=>e.code==='session_mapping_error'&&e.detail.actual===null);assert.equal(resumes,0);console.log('PASS hidden handle + absent history: named refusal, no resume/create');
assert.equal((await resolveReceiptSession(r,deps)).handle.agent.session.id,r.session_id);console.log('PASS hidden handle restored');
assert.equal((await resolveReceiptSession(r,{...deps,entries:[]})).recovered,true);assert.equal(resumes,1);console.log('PASS hidden handle with saved history: resume exact');
await assert.rejects(resolveReceiptSession(r,{...deps,entries:[{handle:handle('telegram-a2a',2)}]}),e=>e.code==='session_mapping_error'&&e.detail.expected.createdAt===1&&e.detail.actual.createdAt===2);await resolveReceiptSession(r,deps);console.log('PASS generation corruption and restore');
await assert.rejects(resolveReceiptSession(r,{...deps,entries:[],persistence:{inspect:async()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}}}),e=>e.code==='session_read_error');await resolveReceiptSession(r,{...deps,entries:[]});console.log('PASS read refusal and restore');
