import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-trevogi-otkaza.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-trevogi-otkaza.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import {resolveOwnerId} from '../src/guest-channel.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'trevoga-otkaza-'));
const input=path.join(root,'in');fs.mkdirSync(input);
const receipts=new MessageReceipts(path.join(root,'ledger'));
const session={id:'s',header:{createdAt:1},events:[]};let sent=0;const logs=[];
const agent={session,send(m,target){sent++;session.events.push({type:'agent/inbox/spliced',data:{target,start:0,inserted:[m]}});},wakeDriver(){}};
const runtime=new ReceiptRuntime(receipts,{flush:async()=>true});
const trevogi=[];
const context={mailStops:ordinaryMailControl,config:{ownerChatId:111}                                                                      ,copyAsk:()=>{},fs,path,mailEnvelope,receipts,log:m=>logs.push(m),
  A2A_EXT:['.md','.txt'],a2aReported:new Set(),
  A2A_TREVOG_PREDEL:5,trevogOtkaza:0,who_:'проба',allowed:new Set([111,222]),
  tg:{send:async(chat,text)=>{trevogi.push({chat,text});}},
  splitSender:text=>({text}),spoolSender:()=>'sender',goalA2ASenders:new Set(),A2A_CHAT:'a2a',
  agentFor:async()=>({handle:{agent},sessionId:'s'}),spoolAgeHours:()=>0,SPOOL_STALE_HOURS:24,
  stripMark:x=>x,lastOrigin:new Map(),receiptRuntime:()=>runtime,
  platform:{createUserMessage:x=>({id:'message-'+sent,...x})}};
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
context.ownerChatId=()=>resolveOwnerId(context.config,{},context.allowed,context.log);
const poll=vm.runInNewContext('('+extractFunction(source,'pollReceiptDirectory')+')',context);
let ok=0,ne=0;
const sud=(c,imya,fakt='')=>{ if(c){ok++;console.log('  ✅ '+imya);} else {ne++;console.log('  🔴 '+imya+(fakt?' — факт: '+fakt:''));} };


const vseNePusto=(a,f)=>a.length>0 && a.every(f);

try{

  fs.writeFileSync(path.join(input,'a.txt'),'работа');await poll(input,'a2a');
  sud(sent===1 && trevogi.length===0,'П1 годное письмо: исполнено, тревог 0',`sent=${sent} trevog=${trevogi.length}`);


  fs.writeFileSync(path.join(input,'sborka.tar.gz'),'двоичное');await poll(input,'a2a');
  sud(trevogi.length===1 && trevogi[0].chat===111,'П2 отвергнутое: тревога ушла ровно владельцу (regression-case r2), гостю 222 — нет',`trevog=${JSON.stringify(trevogi.map(t=>t.chat))}`);
  sud(vseNePusto(trevogi,t=>t.text.includes('sborka.tar.gz')),'П2 тревога называет ФАЙЛ поимённо',`trevog=${trevogi.length}`);
  sud(vseNePusto(trevogi,t=>t.text.includes('ОСТАЁТСЯ в ящике')),'П2 тревога называет, что файл не убран',`trevog=${trevogi.length}`);
  sud(fs.existsSync(path.join(input,'sborka.tar.gz')),'П2 файл действительно остался в ящике');


  const bylo=trevogi.length;await poll(input,'a2a');
  sud(trevogi.length===bylo,'П3 повтор того же файла: новых тревог нет',`стало ${trevogi.length}`);


  fs.unlinkSync(path.join(input,'sborka.tar.gz'));
  fs.writeFileSync(path.join(input,'b.txt'),'ещё работа');await poll(input,'a2a');
  sud(sent===2 && trevogi.length===bylo,'П4 порчу сняли: приём работает, тревог не прибавилось',`sent=${sent} trevog=${trevogi.length}`);


  trevogi.length=0;context.trevogOtkaza=0;context.a2aReported.clear();
  for(let i=1;i<=6;i++) fs.writeFileSync(path.join(input,`m${i}.bin`),'x');
  await poll(input,'a2a');
  const otkazov=logs.filter(x=>x.includes('НЕ ВЗЯТ')).length;
  sud(trevogi.length===5 && trevogi.every(t=>t.chat===111),'П5 предел 5 тревог × 1 владелец = 5, а не 6 (regression-case r2)',`trevog=${trevogi.length}`);
  sud(otkazov>=6,'П5 журнал пишется ВСЕГДА, предел гасит только тревоги',`строк НЕ ВЗЯТ: ${otkazov}`);
  sud(trevogi.some(t=>t.text.includes('предел тревог')),'П5 исчерпание предела ОБЪЯВЛЕНО, а не молчит');


  sud(trevogi.length>0 && trevogi.some(t=>t.text.includes('тревога 1 из 5 для этого агента')),
      'П7 тревога называет СВОЙ номер и предел');
  sud(trevogi.length>0 && trevogi.some(t=>t.text.includes('тревога 5 из 5 для этого агента')),
      'П7 номер РАСТЁТ до предела, а не стоит на месте');
  sud(vseNePusto(trevogi,t=>t.text.includes('агентом проба')),'П7 тревога называет СВОЕГО агента',`trevog=${trevogi.length}`);


  context.config={};trevogi.length=0;context.a2aReported.clear();context.trevogOtkaza=0;
  fs.writeFileSync(path.join(input,'y.bin'),'x');await poll(input,'a2a');
  sud(trevogi.length===0 && logs.some(x=>x.includes('владелец не определён')),'П8 владелец не определён: тревог 0, строка журнала',`trevog=${JSON.stringify(trevogi.map(t=>t.chat))}`);
  context.config={ownerChatId:111};fs.unlinkSync(path.join(input,'y.bin'));


  context.tg={send:async()=>{throw Error('бот недоступен');}};
  context.a2aReported.clear();context.trevogOtkaza=0;
  fs.writeFileSync(path.join(input,'z.bin'),'x');
  await poll(input,'a2a');
  sud(logs.some(x=>x.includes('тревога об отказе не ушла')),'П6 отказ отправки назван, приёмник жив');

  console.log(`── итог: зелёных ${ok} · красных ${ne}`);
  if(ne) process.exit(1);
}finally{receipts.close();fs.rmSync(root,{recursive:true,force:true});}
