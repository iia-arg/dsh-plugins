// RU: Изолированный стенд stend-finished-dispatch.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-finished-dispatch.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {MessageReceipts} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
async function probe(finishDuringObserve) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'finished-dispatch-'));
 const ledger=new MessageReceipts(root);const logs=[];
 try {
  const r=ledger.receive('test',Buffer.from('synthetic'),{logicalKey:'test',expectsReply:false});
  const actual={id:'telegram-a2a',header:{createdAt:1},events:[]};
  const wrong={id:'telegram-123',header:{createdAt:2},events:[]};
  ledger.prepare(r.id,{id:'native-test',content:[]},actual,'123');
  ledger.db.prepare('UPDATE receipts SET dispatch_started=1,flushed_at=1 WHERE id=?').run(r.id);
  assert.equal(ledger.pending().length,1,'fixture must enter pending snapshot');
  const runtime=new ReceiptRuntime(ledger,{flush:async()=>true});let observed=0,contained=0;
  const context={receipts:ledger,log:x=>logs.push(x),receiptAgentFor:async row=>{assert.equal(row.route_key,'123');return {handle:{agent:{session:wrong,status:'running',inbox:{hasPending:false}}}};},
   receiptRuntime:()=>({observe:async session=>{assert.equal(session,wrong);observed++;if(finishDuringObserve)ledger.completeLocal(r.id,'turn_completed','synthetic result');},
    contains:(session,id)=>{contained++;assert.equal(session,wrong);return runtime.contains(session,id);},
    enqueue:async()=>{throw Error('unexpected enqueue');},wake:async()=>{throw Error('unexpected wake');}}),
   prepareReceiptCopies(){},prepareSentCopies(){},deliverReceiptOutbox:async()=>{},startOwnerCopies(){},reportReceiptExhaustion(){}};
  context.deliveryMode=()=> 'personal';context.prepareOutgoingCopies=vm.runInNewContext('('+extractFunction(source,'prepareOutgoingCopies')+')',context);
  await vm.runInNewContext('('+extractFunction(source,'receiptTick')+')',context)();
  assert.equal(observed,1);assert.equal(contained,finishDuringObserve?0:1);
  assert.deepEqual(logs,[],'a swallowed runtime error must fail the stand');
  const after=ledger.get(r.id);
  assert.equal(after.session_id,actual.id);assert.notEqual(after.session_id,wrong.id);
  if(finishDuringObserve){assert.notEqual(after.finished_at,null);assert.equal(after.blocked,null,'completed receipt in another session must not become dispatch_unknown');}
  else {assert.equal(after.finished_at,null);assert.equal(after.blocked,'dispatch_unknown','lost unfinished receipt must still be held');}
  console.log('PASS',finishDuringObserve?'finished during observe, other session, no block':'unfinished missing ID held');
 }finally{ledger.close();fs.rmSync(root,{recursive:true,force:true});}
}
await probe(true);await probe(false);
