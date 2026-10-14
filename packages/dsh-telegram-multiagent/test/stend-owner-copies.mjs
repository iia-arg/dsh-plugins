import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-owner-copies.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-owner-copies.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import {GuestCopies,svedenieBezKopii,trevogaNaSvertku} from '../src/guest-channel.js';

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {extractFunction} from './extract.mjs';import {MessageReceipts,mailEnvelope,RETRY_SECONDS} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-copies-'));let clock=100000,mode='owner-all',offline=false;
let ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>clock});const delivered=[],logs=[];let mid=0;
const session={id:'telegram-test',header:{createdAt:1},events:[]};
const agent={session,status:'idle',inbox:{hasPending:false},send:(m,target)=>session.events.push({type:'agent/inbox/spliced',data:{target,start:999,inserted:[m]}}),wakeDriver(){}};
const ctx={svedenieBezKopii,trevogaNaSvertku,postavitTrevoguSotrudnikam:()=>{},mailStops:ordinaryMailControl,config:{},guestCopies:null,ownerCopyDelivery:null,fs,path,crypto,Buffer,JSON,process,mailEnvelope,RETRY_SECONDS,receipts:ledger,log:m=>logs.push(m),who:'test',MERGE_CHAT:'123',tgChatFor:new Map(),A2A_OUT:path.join(root,'out'),A2A_CHAT:'a2a',A2A_EXT:['.txt','.md'],a2aReported:new Set(),goalA2ASenders:new Set(),lastOrigin:new Map(),spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,spoolSender:()=> 'workertwo',stripMark:x=>x,stripFileAck:x=>x,stripGoalMarker:x=>x,
 splitSender:text=>{const m=/^From: ([^\n]+)\n/.exec(text);return {sender:m?.[1],text:m?text.slice(m[0].length):text};},
 quote:s=>{const x=String(s??'').replace(/\s+/g,' ').trim();return x.length>60?x.slice(0,60)+'…':x;},
 replyHeader:()=> '[ответ: НЕ ТО ПИСЬМО] на «ошибочная текущая очередь»\n\n',
 deliveryMode:()=>mode,
 platform:{createUserMessage:x=>({id:'msg-'+(++mid),...x})},agentFor:async()=>({sessionId:session.id,handle:{agent}}),
 tg:{send:async(chat,text)=>{if(offline)throw Error('synthetic Telegram outage');delivered.push({chat,text});}},
 receiptRuntime:()=>new ReceiptRuntime(ledger,{flush:async()=>true})};
ctx.owner=123;ctx.ownerChatId=()=>ctx.owner;
const scope=vm.createContext(ctx);
const copyStart=source.indexOf('const copyTo = ');const copyEnd=source.indexOf('\n  };',copyStart);assert(copyStart>=0&&copyEnd>copyStart);
ctx.copyTo=vm.runInContext('('+source.slice(copyStart+'const copyTo = '.length,copyEnd+4)+')',scope);
ctx.os=os; // B-N-1637 r2: pollReceiptDirectory зовёт spoolPokazanPochtalonom (в модуле — своя функция).
for(const name of ['spoolPokazanPochtalonom','copySkipped','copyAsk','sendCopy','pollReceiptDirectory','receiptTick','receiptReplyHeader','prepareReceiptCopies','prepareOutgoingCopies','deliverReceiptOutbox','startOwnerCopies','reportReceiptExhaustion']){
 if(source.includes('function '+name+'('))ctx[name]=vm.runInContext('('+extractFunction(source,name)+')',scope);
}
const input=path.join(root,'in');fs.mkdirSync(input);
async function receive(file,text,channel='a2a') {fs.writeFileSync(path.join(input,file),text);await ctx.pollReceiptDirectory(input,channel);return ledger.db.prepare('SELECT * FROM receipts ORDER BY received_at DESC,rowid DESC LIMIT 1').get();}
try {
 const a=await receive('first.txt','From: root\nПервый вопрос');await ctx.receiptTick();await ctx.ownerCopyDelivery;
 assert(logs.some(x=>x.includes('[копия]')&&x.includes('-> tg')));assert.equal(delivered.filter(x=>x.text.includes('📨')).length,1,'real A2A receipt path must copy the question');
 assert(delivered[0].text.includes('источник не удостоверен')&&delivered[0].text.includes('Первый вопрос'));

 clock++;const b=await receive('second.txt','From: root\nВторой вопрос');
 ledger.completeLocal(a.id,'turn_completed','Ответ на первый');ledger.completeLocal(b.id,'turn_completed','Ответ на второй');
 await ctx.receiptTick();await ctx.ownerCopyDelivery;
 const first=delivered.find(x=>x.text.includes('📄')&&x.text.includes('Ответ на первый'));
 assert(first&&first.text.includes('[ответ: first')&&first.text.includes('Первый вопрос')&&!first.text.includes('НЕ ТО ПИСЬМО'),'answer copy must use receipt attribution');
 assert(delivered.some(x=>x.text.includes('📄')&&x.text.includes('Второй вопрос')));
 const before=delivered.length;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,before,'poll must not duplicate copies');

 clock++;offline=true;const c=await receive('third.txt','Третий вопрос');ledger.completeLocal(c.id,'turn_completed','Третий ответ');await ctx.receiptTick();await ctx.ownerCopyDelivery;
 const primary=ledger.db.prepare('SELECT sent_at FROM outbox WHERE id=?').get(c.id+':result');assert.notEqual(primary.sent_at,null,'A2A delivery survives owner-copy failure');
 ledger.close();ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>clock});ctx.receipts=ledger;offline=false;clock+=6000;await ctx.receiptTick();await ctx.ownerCopyDelivery;
 assert(delivered.some(x=>x.text.includes('📄')&&x.text.includes('Третий ответ')&&x.text.includes('Третий вопрос')));
 const afterRetry=delivered.length;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,afterRetry);

 mode='personal';clock++;const d=await receive('private.txt','Личный режим');ledger.completeLocal(d.id,'turn_completed','Только адресату');const beforePrivate=delivered.length;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,beforePrivate);assert(logs.some(x=>x.includes('ответ receipts')&&x.includes('режим=personal')&&x.includes('причина=')));assert(logs.some(x=>x.includes('вопрос')&&x.includes('режим=personal')&&x.includes('причина=')));
 mode='broadcast';clock++;const e=await receive('spool.txt','От соседа','spool');ledger.completeLocal(e.id,'turn_completed','Ответ соседу');await ctx.receiptTick();await ctx.ownerCopyDelivery;assert(delivered.some(x=>x.text.includes('📄')&&x.text.includes('[ответ: workertwo]')&&x.text.includes('От соседа')));
 assert(!delivered.some(x=>x.text.includes('Только адресату')),'personal answer must not be backfilled after mode change');

 clock++;const noReply='[delivery-v1 id=owner-no-reply reply=no]\nFrom: root\nВопрос без служебного ответа';
 const quiet=await receive('no-reply.txt',noReply);ledger.completeLocal(quiet.id,'turn_completed','Ответ только владельцу');await ctx.receiptTick();await ctx.ownerCopyDelivery;
 assert(!ledger.db.prepare('SELECT id FROM outbox WHERE id=?').get(quiet.id+':result'));
 assert(delivered.some(x=>x.text.includes('📄')&&x.text.includes('Ответ только владельцу')),'reply=no still requires owner answer copy');

 const beforeDup=delivered.length;fs.writeFileSync(path.join(input,'redelivered.txt'),noReply);await ctx.pollReceiptDirectory(input,'a2a');await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,beforeDup);
 assert(!fs.existsSync(path.join(input,'redelivered.txt')));assert.equal(ledger.db.prepare('SELECT count(*) n FROM receipts WHERE logical_key=?').get('mail:owner-no-reply').n,1);
 mode='owner-all';clock++;const f=await receive('mode-change.txt','Проверка переключения');mode='personal';const n=delivered.length;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,n,'queued copy must respect current personal mode');assert(logs.some(x=>x.includes('отложенная копия')&&x.includes('режим=personal')&&x.includes('причина=')));
 mode='owner-all';clock+=6000;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,n+1);
 clock++;const slow=await receive('slow-telegram.txt','Неспешный Telegram');ledger.completeLocal(slow.id,'turn_completed','Основной ответ не ждёт Telegram');
 ledger.db.prepare("UPDATE outbox SET attempts=4,next_at=0,error='prior test failure' WHERE id=?").run(slow.id+':copy:question');
 const normalSend=ctx.tg.send;let release;let firstSend=true;
 ctx.tg.send=async(chat,text)=>{if(firstSend){firstSend=false;await new Promise(resolve=>release=resolve);}delivered.push({chat,text});};
 let timer;
 try {
  await Promise.race([ctx.receiptTick(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('primary delivery waited for owner Telegram')),1000);})]);
  clearTimeout(timer);assert(release,'owner worker has begun');assert(!logs.some(x=>x.includes('ДОСТАВКА ИСЧЕРПАНА')&&x.includes(slow.id+':copy:question')),'fifth attempt is still running, not exhausted');assert.notEqual(ledger.db.prepare('SELECT sent_at FROM outbox WHERE id=?').get(slow.id+':result').sent_at,null);
 } finally {clearTimeout(timer);if(release)release();await ctx.ownerCopyDelivery;ctx.tg.send=normalSend;}
 clock++;ctx.owner=null;ctx.MERGE_CHAT=null;ctx.tgChatFor.clear();const missingChat=await receive('missing-chat.txt','Вопрос без известного чата');ledger.completeLocal(missingChat.id,'turn_completed','Ответ без известного чата');const noChatBefore=delivered.length;
 await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,noChatBefore);assert.equal(ledger.db.prepare("SELECT count(*) AS n FROM outbox WHERE receipt_id=? AND route='copy-tg'").get(missingChat.id).n,0,'disabled owner does not enqueue an implicit copy');
 // B-N-1655 / B-N-1637 r2 interlock: foreign-user input is shown by the postman;
 // own-user input needs the plugin copy. Replies and service outputs remain independent.
 ctx.owner=123;ctx.MERGE_CHAT='123';mode='owner-all';clock++;
 const foreign=await receive('20261005T110000Z-foreignuser-ownerall-00000001.txt','INTERLOCK_FOREIGN_INPUT','spool');
 clock++;const own=await receive(`20261005T110001Z-${os.userInfo().username}-ownerall-00000002.txt`,'INTERLOCK_OWN_INPUT','spool');
 ledger.completeLocal(foreign.id,'turn_completed','INTERLOCK_FOREIGN_REPLY');ledger.completeLocal(own.id,'turn_completed','INTERLOCK_OWN_REPLY');
 ledger.addOutbox('interlock-service',foreign.id,'a2a','INTERLOCK_SERVICE');await ctx.receiptTick();await ctx.ownerCopyDelivery;
 const count=id=>ledger.db.prepare('SELECT count(*) n FROM outbox WHERE id=?').get(id).n;
 assert.equal(count(foreign.id+':copy:question'),0,'postman-visible incoming letter must not get a second plugin question copy');
 assert.equal(count(own.id+':copy:question'),1,'same-user letter must not lose its plugin question copy');
 assert.equal(count(foreign.id+':copy:answer'),1);assert.equal(count(own.id+':copy:answer'),1);
 assert.equal(count('outgoing-copy:interlock-service'),1,'incoming suppression must not suppress outgoing service visibility');
 assert.equal(delivered.filter(x=>x.text.includes('INTERLOCK_SERVICE')).length,1,'actual owner delivery of service output occurs once');
 const beforeInterlockReplay=delivered.length;await ctx.receiptTick();await ctx.ownerCopyDelivery;assert.equal(delivered.length,beforeInterlockReplay,'all interlock copies stay deduplicated across repeated ticks');
 console.log('PASS postman interlock: foreign question0 / same-user question1 / replies1 each / outgoing service1 / repeated tick0');
 const localCopies=[];ctx.config.openBot=true;
 ctx.guestCopies=new GuestCopies(ledger,{targets:()=>[{kind:'telegram',id:123},{kind:'a2a',agent:'supervisor'}],sendTelegram:(chat,text)=>ctx.tg.send(chat,text),sendA2A:async(agent,text)=>localCopies.push({agent,text})});
 const guest=ledger.receive('guest-pipeline',Buffer.from('{}'),{route:'tg',routeKey:777,hold:false});
 ctx.guestCopies.capture(guest,{from:{id:777},chat:{id:777}},'guest pipeline question');
 ledger.completeLocal(guest.id,'turn_completed','guest pipeline answer');
 await ctx.receiptTick();await ctx.ownerCopyDelivery;
 assert(delivered.some(x=>x.chat===123&&x.text.includes('guest pipeline question')));
 assert(delivered.some(x=>x.chat===123&&x.text.includes('guest pipeline answer')));
 assert.equal(localCopies.filter(x=>x.agent==='supervisor').length,2);
 console.log('PASS real receiptTick -> guest copy preparation -> background outbox -> owner and Supervisor');
 console.log('PASS actual A2A/spool receipt path: question+answer visibility, saved attribution, no repeat on poll/restart, main delivery independent, personal/broadcast modes');
} finally {ledger.close();fs.rmSync(root,{recursive:true,force:true});}
