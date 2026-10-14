// B-N-2009 gates: actual ledger -> actual deliverReceiptOutbox/TelegramClient; local BotAPI fixture only.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {MessageReceipts as OriginalReceipts} from '../src/message-receipts.js';import {TelegramClient} from '../src/client.js';import {extractFunction} from './extract.mjs';
const MessageReceipts=process.env.STEND_RECEIPTS_MODULE?(await import(process.env.STEND_RECEIPTS_MODULE)).MessageReceipts:OriginalReceipts;
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const root=fs.mkdtempSync(path.join(os.tmpdir(),'spool-reply-policy-'));let n=0,bad=0;
async function probe(name,{chat='-1004442041878',outcome='turn_completed',body='Обычный ответ 🙂',want=1,reopen=null,machine=false}={}){
 n++;const dir=path.join(root,String(n));let clock=1000000,l=new MessageReceipts(path.join(dir,'ledger'),{now:()=>clock,ownerCopyMode:()=> 'owner-all'});const sent=[],logs=[];const fetchBefore=globalThis.fetch;
 const scope=vm.createContext({receipts:l,fs,path,Buffer,crypto,process,who:'fixture',ownerChatId:()=>100,allowed:new Set([100]),stripGoalMarker:x=>x,stripFileAck:x=>x,deliveryMode:()=> 'owner-all',copyTo:()=> 'tg',copySkipped(){},log:x=>logs.push(x),A2A_OUT:path.join(dir,'out'),tg:new TelegramClient('policy-'+n,x=>logs.push(x))});
 const deliver=vm.runInContext('('+extractFunction(source,'deliverReceiptOutbox')+')',scope);
 globalThis.fetch=async(url,options)=>{assert(String(url).startsWith('https://api.telegram.org/botpolicy-'));assert(String(url).endsWith('/sendMessage'));const payload=JSON.parse(options.body);sent.push(payload);return{json:async()=>({ok:true,result:{message_id:sent.length}})};};
 try{
  const r=l.receive('fixture-'+n,Buffer.from('[delivery-v1 id=outcome-'+n+' reply=no]\nordinary mail'),{route:'a2a',expectsReply:chat===null});
  if(chat!==null)l.setSpoolTelegramReply(r.id,chat);
  l.tx(()=>l.completeRow(l.get(r.id),outcome,{end:{reason:{kind:outcome==='interrupted_unknown'?'error':'completed'}}},body,machine));
  assert.equal(l.get(r.id).outcome,outcome);assert.notEqual(l.get(r.id).finished_at,null);
  if(reopen==='delivered'){
   await l.deliverResults(deliver);assert.equal(sent.length,1);assert.notEqual(l.db.prepare('SELECT sent_at FROM outbox WHERE id=?').get(r.id+':result').sent_at,null);
  }else if(reopen==='pending'){
   assert.equal(sent.length,0);assert.equal(l.db.prepare('SELECT sent_at FROM outbox WHERE id=?').get(r.id+':result').sent_at,null);
  }
  if(reopen){
   const original=l,dirBefore=l.root;l.close();if(reopen==='delivered')clock+=10000000;assert.throws(()=>original.get(r.id),'old ledger must really be closed');
   l=new MessageReceipts(dirBefore,{now:()=>clock,ownerCopyMode:()=> 'owner-all'});scope.receipts=l;assert.notEqual(l,original);assert.equal(l.root,dirBefore);assert.equal(l.spoolTelegramReply(r.id),chat);
   console.log('REOPEN',name,'same directory',dirBefore,'receipt',r.id);
  }
  await l.deliverResults(deliver);clock+=10000000;await l.deliverResults(deliver);
  assert.equal(sent.length,want,'primary Telegram send count by outcome/reopen policy');
  if(chat!==null&&!want)assert.equal(l.db.prepare("SELECT count(*) n FROM outbox WHERE route='spool-tg'").get().n,0,'hidden/empty/machine outcome must not create public outbox');
  assert.equal(sent.filter(s=>s.text.includes('[ответ по receipt')).length,0,'internal receipt header must never be sent by spool-tg');
  if(want){assert.equal(String(sent[0].chat_id),chat);assert.equal(sent[0].text,body,'both successful response kinds send ordinary text');assert.equal(l.db.prepare("SELECT count(*) n FROM outbox WHERE route='spool-tg' AND sent_at IS NOT NULL").get().n,1);}
  if(chat===null){const files=fs.readdirSync(scope.A2A_OUT);assert.equal(files.length,1);assert(fs.readFileSync(path.join(scope.A2A_OUT,files[0]),'utf8').includes('[ответ по receipt'),'legacy service result remains unchanged');}
  if(!machine){assert.equal(typeof JSON.parse(l.get(r.id).result_json).ownerReplyBody,'string','internal owner result must remain available');}
  if(outcome==='interrupted_unknown'&&!machine){
   assert.equal(l.db.prepare("SELECT count(*) n FROM outbox WHERE route='copy-tg' AND id LIKE 'interrupt-owner:%'").get().n,1,'existing pometkaVladelcu remains');clock+=10000000;await l.deliverResults(deliver,{copyOnly:true});assert.equal(sent.length,want+1);assert.equal(String(sent.at(-1).chat_id),'100','interruption note goes to owner');assert(!sent.at(-1).text.includes('[ответ по receipt'));
  }
  console.log('PASS',name);
 }catch(e){bad++;console.log('FAIL',name,e.message);}finally{globalThis.fetch=fetchBefore;l.close();}
}
try{
 for(const chat of ['-1004442041878','123']){
  for(const [outcome,want] of [['turn_completed',1],['sdk_input_response',1],['no_result',0],['interrupted_unknown',0],['canceled_before_run',0],['future_outcome',0]])await probe(chat+' / '+outcome,{chat,outcome,want});
 }
 await probe('empty successful text is not a public reply',{body:'',want:0});await probe('whitespace SDK text is not a public reply',{outcome:'sdk_input_response',body:' \n ',want:0});
 await probe('machine-only remains private',{machine:true,want:0});await probe('legacy service outcome unchanged',{chat:null,outcome:'no_result',want:0});
 for(const chat of ['-1004442041878','123']){
  await probe('delivered -> close/reopen -> additional sends0 / '+chat,{chat,reopen:'delivered'});
  await probe('finished pending -> close/reopen -> same-chat sends1 / '+chat,{chat,reopen:'pending',outcome:'sdk_input_response'});
 }
 console.log('RESULT',n-bad+'/'+n);process.exitCode=bad?1:0;
}finally{fs.rmSync(root,{recursive:true,force:true});}
