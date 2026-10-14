// RU: Изолированный стенд stend-receipts-bez-yadra.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipts-bez-yadra.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import {sobytiyaSessii,nasledovanoSessii,receiptFacts,ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
const events=[
 {seq:0,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[{id:'old'}]}},
 {seq:1,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}},
 {seq:2,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[{id:'new'}]}},
 {seq:3,type:'turn/start',data:{turn:1}},
 {seq:4,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}},
 {seq:5,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
];
const old={header:{seedLength:2},events};
const modern={header:{inheritedEventCount:2},snapshotEvents(){assert.equal(this,modern);return Object.freeze([...events]);}};
const log=[];ustanovitIstochnikPomoshchnika(()=>null,s=>log.push(s));
assert.deepEqual(sobytiyaSessii(modern),events);
assert.equal(nasledovanoSessii(modern),2);
assert.deepEqual(receiptFacts(modern,['old','new']),receiptFacts(old,['old','new']));
assert.equal(receiptFacts(modern,['old']).get('old').claims.length,0);
assert.equal(receiptFacts(modern,['new']).get('new').claims[0].turn,1);
assert.equal(log.length,1);assert.ok(log[0].includes('snapshotEvents'));
assert.deepEqual(sobytiyaSessii({snapshotEvents:()=>[]}),[]);
assert.throws(()=>sobytiyaSessii({snapshotEvents:()=>null}),/квитанции не сверить/);
assert.throws(()=>sobytiyaSessii({}),/квитанции не сверить/);
assert.throws(()=>sobytiyaSessii({snapshotEvents(){throw Error('fixture read failure');}}),/fixture read failure/);
ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:()=>events,nasledovano:()=>7}));
assert.equal(sobytiyaSessii({}),events);assert.equal(nasledovanoSessii({}),7);
console.log('PASS fallback events/snapshotEvents, inheritance, empty/invalid/throw, helper priority');
