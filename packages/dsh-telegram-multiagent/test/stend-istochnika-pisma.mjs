import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-istochnika-pisma.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-istochnika-pisma.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'otpravitel-a2a-'));const input=path.join(root,'in');fs.mkdirSync(input);
const receipts=new MessageReceipts(path.join(root,'ledger'));const session={id:'s',header:{createdAt:1},events:[]};
const agent={session,send(m,target){session.events.push({type:'agent/inbox/spliced',data:{target,start:0,inserted:[m]}});},wakeDriver(){}};
const runtime=new ReceiptRuntime(receipts,{flush:async()=>true});
const bodies=[],asks=[],logs=[],istochniki=[];
const context={mailStops:ordinaryMailControl,fs,path,mailEnvelope,receipts,log:m=>logs.push(m),A2A_EXT:['.md','.txt'],a2aReported:new Set(),A2A_TREVOG_PREDEL:5,trevogOtkaza:0,who_:'проба',allowed:new Set(),tg:{send:async()=>{}},
 goalA2ASenders:new Set(),A2A_CHAT:'a2a',agentFor:async()=>({handle:{agent},sessionId:'s'}),
 spoolAgeHours:()=>0,SPOOL_STALE_HOURS:24,stripMark:x=>x,lastOrigin:new Map(),receiptRuntime:()=>runtime,
 copyAsk:(origin,who)=>asks.push(who),platform:{createUserMessage:x=>{bodies.push(x.content[0].text);istochniki.push(x.source);return {id:'m'+bodies.length,...x};}},
 quote:s=>String(s??'').replace(/\s+/g,' ').trim()};
const scope=vm.createContext(context);
context.spoolSender=vm.runInContext('('+extractFunction(source,'spoolSender')+')',scope);
context.splitSender=vm.runInContext('('+extractFunction(source,'splitSender')+')',scope);
// B-N-1637 r2: pollReceiptDirectory зовёт spoolPokazanPochtalonom (в модуле — своя функция).
context.os=os;context.process=process;context.spoolPokazanPochtalonom=vm.runInContext('('+extractFunction(source,'spoolPokazanPochtalonom')+')',scope);
const poll=vm.runInContext('('+extractFunction(source,'pollReceiptDirectory')+')',scope);
const replyHeader=vm.runInContext('('+extractFunction(source,'receiptReplyHeader')+')',scope);

const m=/pollReceiptDirectory\.koordinator = ([^;\n]+);/.exec(source);
let n=1,ok=m?1:0;
console.log(`${m?'✅':'🔴'} П0 строка установки pollReceiptDirectory.koordinator в src/index.js ${m?'есть':'НЕТ — координатор не отличается от прочих'}`);
const ustanovka=m?vm.runInNewContext('(config)=>('+m[1]+')',{Set}):()=>undefined;
let okI=0,badI=0;const pI=(i,u,w)=>{u?okI++:badI++;console.log(`${u?'ЗЕЛЁНОЕ':'КРАСНОЕ'}  ${i}${u?'':' — '+w}`);};
const kanaly=[['coordinator-1790401414357274535.txt','Наряд','a2a','координатор с именем файла'],['20260929T120000Z-dispatcher-abc.txt','письмо','spool','агент из spool']];
for (const [file,text,channel,opis] of kanaly){
  fs.writeFileSync(path.join(input,file),text); const before=istochniki.length; await poll(input,channel);
  const s=istochniki[before];
  pI(`И-${channel}: письмо подано (${opis})`, s!==undefined, 'createUserMessage не звался');
  if (s===undefined) continue;
  const kl=Object.keys(s).sort().join(',');
  pI(`И-${channel}: kind agent-message, form relay`, s.kind==='agent-message'&&s.form==='relay', JSON.stringify(s));
  pI(`И-${channel}: ключи ровно kind,form,senderSessionId`, kl==='form,kind,senderSessionId', kl);
  pI(`И-${channel}: senderSessionId — непустая строка a2a:*`, typeof s.senderSessionId==='string'&&/^a2a:.+/.test(s.senderSessionId), JSON.stringify(s.senderSessionId));
}
fs.rmSync(root,{recursive:true,force:true});
console.log(`ИТОГ: ${okI} из ${okI+badI}`); process.exit(badI?1:0);
