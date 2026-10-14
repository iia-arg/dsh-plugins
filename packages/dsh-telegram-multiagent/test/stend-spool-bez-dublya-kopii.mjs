import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-spool-bez-dublya-kopii.mjs (B-N-1637 r2): копию владельцу «📨 вопрос от» плагин не ставит ТОЛЬКО
//     у письма, которое показал почтальон: учётка в имени файла ≠ владелец ящика (правило a2a-pochtalon.py: файл владельца ящика
//     не переносится и не показывается). Письмо своей учётки (продолжение шлюза, переписка кодеров одной учётки coders) и письмо
//     при чужом владельце ящика — с копией плагина, как до 2.5.85. Письмо с aclaude (канал a2a) — с копией.
//     Гоняется настоящая pollReceiptDirectory (и spoolPokazanPochtalonom, если есть) из src/index.js; copyAsk — заглушка.
// EN: Isolated harness (B-N-1637 r2): the plugin skips the owner copy only for a letter the postman showed (name account ≠ mailbox
//     owner); own-account letters and an unexpected mailbox owner keep the plugin copy; aclaude letters keep it too.


import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'spool-bez-dublya-'));const input=path.join(root,'in');fs.mkdirSync(input);
const receipts=new MessageReceipts(path.join(root,'ledger'));const session={id:'s',header:{createdAt:1},events:[]};
const agent={session,send(m,target){session.events.push({type:'agent/inbox/spliced',data:{target,start:0,inserted:[m]}});},wakeDriver(){}};
const runtime=new ReceiptRuntime(receipts,{flush:async()=>true});
const bodies=[],asks=[],logs=[];
let UCHETKA='zarya', CHUZHOJ_YASHCHIK=false; // учётка процесса (как видит os.userInfo) и «ящик принадлежит не процессу»
const fsStend={...fs,statSync:(p,...a)=>{const st=fs.statSync(p,...a);return CHUZHOJ_YASHCHIK&&p===input?{...st,uid:st.uid+1}:st;}};
const context={mailStops:ordinaryMailControl,fs:fsStend,os:{...os,userInfo:()=>({...os.userInfo(),username:UCHETKA})},process,path,mailEnvelope,receipts,log:m=>logs.push(m),A2A_EXT:['.md','.txt'],a2aReported:new Set(),A2A_TREVOG_PREDEL:5,trevogOtkaza:0,who_:'проба',allowed:new Set(),tg:{send:async()=>{}},
 goalA2ASenders:new Set(),A2A_CHAT:'a2a',agentFor:async()=>({handle:{agent},sessionId:'s'}),
 spoolAgeHours:()=>0,SPOOL_STALE_HOURS:24,stripMark:x=>x,lastOrigin:new Map(),receiptRuntime:()=>runtime,
 copyAsk:(origin,who,q,r)=>asks.push({origin,who,receipt:r?.id}),platform:{createUserMessage:x=>{bodies.push(x.content[0].text);return {id:'m'+bodies.length,...x};}},
 quote:s=>String(s??'').replace(/\s+/g,' ').trim()};
const scope=vm.createContext(context);
context.spoolSender=vm.runInContext('('+extractFunction(source,'spoolSender')+')',scope);
context.splitSender=vm.runInContext('('+extractFunction(source,'splitSender')+')',scope);
if (/function spoolPokazanPochtalonom\(/.test(source)) context.spoolPokazanPochtalonom=vm.runInContext('('+extractFunction(source,'spoolPokazanPochtalonom')+')',scope);
const poll=vm.runInContext('('+extractFunction(source,'pollReceiptDirectory')+')',scope);

let ok=0,bad=0,n=0;const p=(i,u,w)=>{u?ok++:bad++;console.log(`${u?'ЗЕЛЁНОЕ':'КРАСНОЕ'}  ${i}${u?'':' — '+w}`);};
async function sluchaj(kod,file,channel,kopij,opis,{uchetka='zarya',chuzhoj=false}={}){
  UCHETKA=uchetka;CHUZHOJ_YASHCHIK=chuzhoj;n++;
  fs.writeFileSync(path.join(input,file),'письмо '+n);
  const b0=bodies.length,a0=asks.length,l0=logs.length; await poll(input,channel);
  p(`${kod}: письмо подано в ход (${opis})`, bodies.length===b0+1, `createUserMessage звался ${bodies.length-b0} раз`);
  p(`${kod}: копий владельцу от плагина ${kopij}`, asks.length-a0===kopij, `было ${asks.length-a0}`);
  if (kopij===0) p(`${kod}: пропуск назван в журнале с причиной`, logs.slice(l0).some(x=>x.includes('пропуск')&&x.includes('почтальон')), 'строки о пропуске нет');
}
await sluchaj('К1-a2a','coordinator-1790401414357274535.txt','a2a',1,'письмо с aclaude: почтальона нет');
await sluchaj('К2-чужая','20261005T081219Z-varvara-ownerall-0105fb19.txt','spool',0,'письмо другой учётки: почтальон показал');
await sluchaj('К3-своя','20261005T085934Z-zarya-b9bea111.txt','spool',1,'письмо своей учётки (продолжение шлюза): почтальон молчит');
await sluchaj('К4-coders','20261005T090000Z-coders-1a2b3c4d.txt','spool',1,'письмо между alfa/beta/gamma (общая coders)',{uchetka:'coders'});
await sluchaj('К4-coders-чужая','20261005T090001Z-varvara-1a2b3c4e.txt','spool',0,'письмо другой учётки кодерам',{uchetka:'coders'});
await sluchaj('К5-ящик-не-свой','20261005T090002Z-varvara-1a2b3c4f.txt','spool',1,'ящик принадлежит не процессу: уверенности нет — копия',{chuzhoj:true});
fs.rmSync(root,{recursive:true,force:true});
console.log(`ИТОГ: ${ok} из ${ok+bad}`); process.exit(bad?1:0);
