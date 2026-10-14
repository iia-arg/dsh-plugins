import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-receipt-file-route.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-file-route.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {resolveOwnerId} from '../src/guest-channel.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-route-'));const input=path.join(root,'in');fs.mkdirSync(input);
const receipts=new MessageReceipts(path.join(root,'ledger'));const session={id:'s',header:{createdAt:1},events:[]};let sent=0,flush=true;const logs=[];
const agent={session,send(m,target){sent++;session.events.push({type:'agent/inbox/spliced',data:{target,start:0,inserted:[m]}});},wakeDriver(){}};
const runtime=new ReceiptRuntime(receipts,{flush:async()=>flush});
const context={mailStops:ordinaryMailControl,config:{}                                                                     ,copyAsk:()=>{},fs,path,mailEnvelope,receipts,log:m=>logs.push(m),A2A_EXT:['.md','.txt'],a2aReported:new Set(),A2A_TREVOG_PREDEL:5,trevogOtkaza:0,who_:'проба',allowed:new Set(),tg:{send:async()=>{}},splitSender:text=>({text}),spoolSender:()=> 'sender',goalA2ASenders:new Set(),A2A_CHAT:'a2a',agentFor:async()=>({handle:{agent},sessionId:'s'}),spoolAgeHours:()=>0,SPOOL_STALE_HOURS:24,stripMark:x=>x,lastOrigin:new Map(),receiptRuntime:()=>runtime,platform:{createUserMessage:x=>({id:'message-'+sent,...x})}};
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');context.ownerChatId=()=>resolveOwnerId(context.config,{},context.allowed,context.log);
// B-N-1637 r2: pollReceiptDirectory зовёт spoolPokazanPochtalonom (в модуле — своя функция).
context.os=os;context.process=process;context.spoolPokazanPochtalonom=vm.runInNewContext('('+extractFunction(source,'spoolPokazanPochtalonom')+')',context);
const poll=vm.runInNewContext('('+extractFunction(source,'pollReceiptDirectory')+')',context);
try{
 fs.writeFileSync(path.join(input,'a.txt'),'work');await poll(input,'a2a');assert.equal(sent,1);assert(!fs.existsSync(path.join(input,'a.txt')));
 fs.writeFileSync(path.join(input,'b.txt'),'work');await poll(input,'a2a');assert.equal(sent,1);assert(fs.existsSync(path.join(input,'b.txt')));assert(receipts.status().some(r=>r.blocked==='legacy_ambiguous'));
 await poll(input,'spool');assert.equal(sent,1,'same held source across channels not executed');
 const held=receipts.status().find(r=>r.blocked==='legacy_ambiguous');receipts.resolve(held.id,'approve-new','Main','test-decision');await poll(input,'a2a');assert.equal(sent,2);assert(!fs.existsSync(path.join(input,'b.txt')));
 fs.writeFileSync(path.join(input,'c.txt'),'third');flush=false;await poll(input,'spool');assert.equal(sent,3);assert(fs.existsSync(path.join(input,'c.txt')));flush=true;await poll(input,'spool');assert.equal(sent,3);assert(!fs.existsSync(path.join(input,'c.txt')));
 fs.writeFileSync(path.join(input,'x.bin'),'x');await poll(input,'a2a');await poll(input,'spool');const n=logs.filter(x=>x.includes('НЕ ВЗЯТ')).length;await poll(input,'a2a');await poll(input,'spool');assert.equal(logs.filter(x=>x.includes('НЕ ВЗЯТ')).length,n);assert.equal(n,2);
 const long='📨'.repeat(25001);fs.writeFileSync(path.join(input,'large.txt'),long);await poll(input,'spool');assert.equal(sent,4);assert.equal(Buffer.from(receipts.db.prepare('SELECT raw FROM receipts WHERE payload_sha=?').get((await import('node:crypto')).createHash('sha256').update(long).digest('hex')).raw).toString(),long);
 context.goalA2ASenders.add(undefined);let goals=0;context.goalCommand=async()=>{goals++;throw Error('result unknown');};fs.writeFileSync(path.join(input,'goal.txt'),'/goal run');await poll(input,'a2a');await poll(input,'a2a');assert.equal(goals,0,'unsigned goal is ordinary text, not a command');assert.equal(sent,5);
 console.log('PASS actual file route: hold, explicit release, flush failure/recovery without resend, separate suppression keys');
}finally{receipts.close();fs.rmSync(root,{recursive:true,force:true});}
