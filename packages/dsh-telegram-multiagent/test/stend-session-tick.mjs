// RU: Изолированный стенд stend-session-tick.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-session-tick.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {resolveReceiptSession} from '../src/receipt-session.js';import {extractFunction} from './extract.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
for(const scenario of ['merged','ordinary','hidden','generation','read','restored-hidden','restored-generation','restored-read']) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'session-tick-'));const l=new MessageReceipts(root);const logs=[];
 try {
  const sid=scenario==='ordinary'?'telegram-123':'telegram-a2a';
  const session={id:sid,header:{createdAt:1},events:[{type:'agent/inbox/spliced',data:{target:'next-turn',start:0,inserted:[{id:'native'}]}}]};
  const h={agent:{session,status:'running',inbox:{hasPending:true}}};
  const r=l.receive('file:test',Buffer.from('synthetic'),{logicalKey:'test',expectsReply:false});l.prepare(r.id,{id:'native'},session,'123');l.db.prepare('UPDATE receipts SET dispatch_started=1,flushed_at=1 WHERE id=?').run(r.id);
  const rt=new ReceiptRuntime(l,{flush:async()=>true});let resumes=0;
  const deps={entries:scenario==='hidden'||scenario==='read'?[]:[{handle:h,sessionId:sid}],persistence:{inspect:async()=>{if(scenario==='read')throw Object.assign(Error('denied'),{code:'EACCES'});return null;}},resume:async()=>{resumes++;throw Error('must not resume missing history');}};
  if(scenario==='generation')session.header.createdAt=2;
  const context={receipts:l,receiptAgentFor:row=>resolveReceiptSession(row,deps),receiptRuntime:()=>rt,log:x=>logs.push(x),prepareReceiptCopies(){},prepareSentCopies(){},deliverReceiptOutbox:async()=>{},startOwnerCopies(){},reportReceiptExhaustion(){}};
  context.deliveryMode=()=> 'personal';context.prepareOutgoingCopies=vm.runInNewContext('('+extractFunction(source,'prepareOutgoingCopies')+')',context);
  await vm.runInNewContext('('+extractFunction(source,'receiptTick')+')',context)();
  assert.equal(resumes,0);
  const after=l.get(r.id),audit=l.db.prepare('SELECT kind,detail FROM audit WHERE receipt_id=?').all(r.id);
  if(scenario==='hidden'||scenario==='generation') {
   assert.equal(after.blocked,'session_mapping_error');const e=audit.find(x=>x.kind==='session_mapping_error');assert(e);const pairs=JSON.parse(e.detail);assert.equal(pairs.expected.id,sid);assert.equal(pairs.expected.createdAt,1);assert.equal(pairs.actual?.createdAt??null,scenario==='generation'?2:null);assert(!audit.some(x=>x.kind==='outcome_unknown'));
  } else if(scenario==='read') {assert.equal(after.blocked,null);assert(audit.some(x=>x.kind==='session_read_error'));assert(!audit.some(x=>x.kind==='session_mapping_error'));}
  else {assert.equal(after.blocked,null);assert.equal(after.finished_at,null);assert.equal(logs.length,0);}
  console.log('PASS actual tick',scenario);
 }finally{l.close();fs.rmSync(root,{recursive:true,force:true});}
}
