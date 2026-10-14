// RU: Изолированный стенд stend-receipt-recovery.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-recovery.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {MessageReceipts,RETRY_SECONDS} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {extractFunction} from './extract.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-recover-'));const ledger=path.join(root,'ledger');let receipts=new MessageReceipts(ledger,{owner:'before'});
const session={id:'s',header:{createdAt:1},events:[]};const r=receipts.receive('tg:1','{}',{route:'tg',routeKey:'1',logicalKey:'tg:1'});receipts.beginChannel(r.id);receipts.prepare(r.id,{id:'m1',content:[]},session,'1');receipts.close();receipts=new MessageReceipts(ledger,{owner:'after'});
let sent=0,wakes=0;const agent={session,status:'idle',inbox:{hasPending:true},send:(message,target)=>{sent++;session.events.push({type:'agent/inbox/spliced',data:{target,start:0,inserted:[message]}});},wakeDriver:()=>wakes++};
const rt=new ReceiptRuntime(receipts,{flush:async()=>true});
const context={prepareReceiptCopies:()=>{},startOwnerCopies:()=>{},reportReceiptExhaustion:()=>{},process,who:'test',receipts,RETRY_SECONDS,receiptRuntime:()=>rt,receiptAgentFor:async()=>({handle:{agent},recovered:false}),fs,path,crypto,A2A_OUT:path.join(root,'out'),tg:{send:async()=>{}},stripFileAck:x=>x,stripGoalMarker:x=>x,a2aReported:new Set(),log:()=>{}};
try {
 context.deliveryMode=()=> 'personal';context.prepareOutgoingCopies=vm.runInNewContext('('+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'prepareOutgoingCopies')+')',context);
 context.deliverReceiptOutbox=vm.runInNewContext('('+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'deliverReceiptOutbox')+')',context);
 const tick=vm.runInNewContext('('+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'receiptTick')+')',context);
 await tick();assert.equal(sent,1);assert.equal(receipts.get(r.id).blocked,null);
 session.events.push({type:'turn/start',data:{turn:1}},{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}});
 await rt.observe(session,1);assert.equal(receipts.get(r.id).execution_owner,'after','queued from old channel owner may execute first time');
 const orphan=receipts.receive('file:o','orphan',{logicalKey:'o'});receipts.prepare(orphan.id,{id:'m2',content:[]},session,'1');
 session.events.push({type:'agent/inbox/spliced',data:{target:'next-turn',start:0,inserted:[{id:'m2'}]}},{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}});
 receipts.reconcile(session,null,true);assert.equal(receipts.get(orphan.id).blocked,'interrupted_unknown');receipts.holdTick();assert(receipts.db.prepare('SELECT * FROM outbox WHERE receipt_id=?').all(orphan.id).length>0);
 await tick();const notices=fs.readdirSync(context.A2A_OUT).map(f=>fs.readFileSync(path.join(context.A2A_OUT,f),'utf8'));assert(notices.some(t=>t.includes('УДЕРЖАНО')&&t.includes('агент test')&&t.includes(receipts.root)));
 console.log('PASS actual recovery tick prepares queue; old channel owner not execution owner; recovered ownerless claim held visibly');
}finally{receipts.close();fs.rmSync(root,{recursive:true,force:true});}
