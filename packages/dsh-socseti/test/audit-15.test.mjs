import './approval-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {TelegramApi,TelegramFailure,sameTelegramText} from '../src/telegram-api.mjs';
import {TelegramQueue} from '../src/telegram-queue.mjs';
import {Store,hash,canonical} from '../src/store.mjs';
import {createTelegramWorker} from '../src/telegram-worker.mjs';
import {loadConfig} from '../src/config.mjs';
import {toolsForRole,approvers} from '../src/contract.mjs';

const token='123456:synthetic_abcdefghijklmnopqrstuvwxyz';
const failure=(code,syscall)=>Object.assign(new TypeError('synthetic fetch failure'),{cause:Object.assign(Error('synthetic connection'),{code,syscall})});
function fixture(t,profile='legacy'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-audit15-'));
 let now=Date.parse('2026-10-14T06:00:00Z');
 const s=new Store(dir,{telegram:'-202',vk:'127999849',instagram:'456',threads:'789'},{profile,now:()=>now});
 const config={approvalChatId:profile==='anna'?-1001659691422:-101,botId:77,writerEnabled:true};
 const q=new TelegramQueue(s,config);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});
 const role=profile==='anna'?'anna':'varvara';let n=0;
 const make=(text='Текст 🌊',platform='telegram')=>s.execute(role,'draft_post',{request_id:'audit-draft-'+(++n),platform,text});
 const message=(a,id=1,text=a.request.args.text)=>({message_id:id,date:1,chat:{id:Number(a.request.args.chat_id)},from:{id:77,is_bot:true},text,reply_markup:a.request.args.reply_markup});
 const sent=(text)=>{const d=make(text);q.enqueueCards();const a=q.claim();assert.equal(a.kind,'card');const m=message(a);q.finish(a.id,{result:m});return {d,a,m}};
 const approve=c=>q.processUpdate({update_id:1,callback_query:{id:'cb-audit',from:{id:approvers()[0],is_bot:false},message:c.m,data:c.m.reply_markup.inline_keyboard[0][0].callback_data}});
 return {s,q,config,role,make,message,sent,approve,advance(ms=3000){now+=ms}};
}

test('audit1 real TCP refusal is proven unsent, never ambiguous response loss',async()=>{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const api=new TelegramApi(token,{fetchImpl:(_url,options)=>fetch(`http://127.0.0.1:${port}/`,options)});
 try{await assert.rejects(api.call('sendMessage',{chat_id:-101,text:'x'}),e=>e.kind==='not_sent'&&!String(e).includes(token))}finally{api.stop()}
});

test('audit1 connect/DNS failures are distinct from reset, general timeout and response-read failures',async()=>{
 for(const [code,syscall] of [['ECONNREFUSED','connect'],['ENOTFOUND','getaddrinfo'],['EAI_AGAIN','getaddrinfo'],['UND_ERR_CONNECT_TIMEOUT',undefined]]){
  const api=new TelegramApi(token,{fetchImpl:async()=>{throw failure(code,syscall)}});
  await assert.rejects(api.call('sendMessage',{chat_id:-101,text:'x'}),e=>e.kind==='not_sent');api.stop();
 }
 for(const error of [failure('ECONNRESET','read'),failure('ETIMEDOUT','read'),Error('unknown transport'),failure('ECONNREFUSED','write'),Object.assign(Error('fetch failed'),{cause:new AggregateError([Object.assign(Error(),{code:'ECONNREFUSED',syscall:'connect'}),Object.assign(Error(),{code:'ECONNRESET',syscall:'read'})])})]){
  const api=new TelegramApi(token,{fetchImpl:async()=>{throw error}});await assert.rejects(api.call('sendMessage',{chat_id:-101,text:'x'}),e=>e.kind==='unknown');api.stop();
 }
 const api=new TelegramApi(token,{fetchImpl:async()=>({status:200,body:(async function*(){throw failure('ECONNREFUSED','connect')})()})});
 await assert.rejects(api.call('sendMessage',{chat_id:-101,text:'x'}),e=>e.kind==='unknown');api.stop();
});

for(const profile of ['legacy','anna']){
 test(`audit1 ${profile}: unsent card returns to the same action and succeeds after restoration`,t=>{
  const f=fixture(t,profile);f.make();f.q.enqueueCards();const a=f.q.claim();f.q.finish(a.id,{notSent:true});
  assert.equal(f.q.stats().queued,1);assert.equal(f.q.claim(),null);f.advance();const restored=f.q.claim();assert.equal(restored.id,a.id);assert.equal(restored.attempts,2);
  f.q.finish(restored.id,{result:f.message(restored)});assert.equal(f.q.stats().sent,1);assert.equal(f.q.stats().unknown,undefined);assert.equal(f.q.claim(),null);
 });
 test(`audit7 ${profile}: document caption allows only trailing ASCII and callback still binds exact receipt`,t=>{
  const f=fixture(t,profile);f.make('🌊'.repeat(4096));f.q.enqueueCards();const a=f.q.claim();assert.equal(a.request.method,'sendDocument');
  const m={message_id:1,date:1,chat:{id:f.config.approvalChatId},from:{id:77,is_bot:true},caption:a.request.args.caption+' \r\n',document:{file_id:'synthetic-file'},reply_markup:a.request.args.reply_markup};f.q.finish(a.id,{result:m});assert.equal(f.q.stats().sent,1);
  const update={update_id:1,callback_query:{id:'doc-echo',from:{id:approvers()[0],is_bot:false},message:{...m,caption:m.caption.trimEnd()},data:m.reply_markup.inline_keyboard[0][0].callback_data}};
  assert.equal(f.q.processUpdate(update).decision,'denied');assert.equal(f.q.processUpdate({...update,update_id:2,callback_query:{...update.callback_query,message:m}}).decision,'approved');
 });
 test(`audit1 ${profile}: unsent publication retries at most three times and preserves the sent card`,t=>{
  const f=fixture(t,profile),card=f.sent();assert.equal(f.approve(card).decision,'approved');const cardState=f.s.db.prepare("SELECT state FROM outbox WHERE kind='approval_card_request'").get().state;
  for(let n=1;n<=3;n++){
   const a=f.q.claim();assert.equal(a.kind,'publication');assert.equal(a.attempts,n);f.q.finish(a.id,{notSent:true});
   assert.equal(f.s.db.prepare("SELECT state FROM outbox WHERE kind='approval_card_request'").get().state,cardState);
   if(n<3){assert.equal(f.q.claim(),null);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'approved');f.advance(1000)}
  }
  assert.equal(f.q.claim(),null);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'failed');assert.equal(f.q.stats().unknown,undefined);
 });
 test(`audit7 ${profile}: trailing echo normalization is bound to the actual receipt; changed content stays unknown`,t=>{
  const f=fixture(t,profile);f.make('Текст 🌊 \n');f.q.enqueueCards();const a=f.q.claim(),m=f.message(a,1,a.request.args.text.trimEnd());f.q.finish(a.id,{result:m});
  assert.equal(f.q.stats().sent,1);assert.equal(f.q.processUpdate({update_id:1,callback_query:{id:'echo-cb',from:{id:approvers()[0],is_bot:false},message:m,data:m.reply_markup.inline_keyboard[0][0].callback_data}}).decision,'approved');
  const p=f.q.claim();f.q.finish(p.id,{result:f.message(p,2,p.request.args.text.trimEnd())});assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'published');
  f.advance(3600000);f.make('Другой текст');f.q.enqueueCards();const b=f.q.claim();f.q.finish(b.id,{result:f.message(b,3,b.request.args.text+'подмена')});assert.equal(f.q.stats().unknown,1);
 });
 test(`audit13 ${profile}: outbox payload contains no invented transport route`,t=>{
  const f=fixture(t,profile);f.make();const card=JSON.parse(f.s.db.prepare("SELECT payload_json FROM outbox WHERE kind='approval_card_request'").get().payload_json);
  assert.equal(Object.hasOwn(card,'transport_enabled'),false);
  if(profile==='anna'){assert.equal(card.approval_chat_id,f.config.approvalChatId);assert.equal(card.bot,'@anna_arg_bot')}else for(const field of ['bot','approval_chat_id'])assert.equal(Object.hasOwn(card,field),false,field);
  f.q.enqueueCards();assert.equal(f.q.claim().request.args.chat_id,f.config.approvalChatId);
 });
 test(`audit14 ${profile}: failed or unknown publication never rewrites the approval card`,t=>{
  const f=fixture(t,profile),card=f.sent();f.approve(card);const before=f.s.db.prepare("SELECT state FROM outbox WHERE kind='approval_card_request'").get().state;
  const p=f.q.claim();f.q.finish(p.id,{unknown:true});assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'unknown');
  assert.equal(f.s.db.prepare("SELECT state FROM outbox WHERE kind='approval_card_request'").get().state,before);
 });
 test(`audit18 ${profile}: conflicting update refuses without changing history or lowering offset; next update works`,t=>{
  const f=fixture(t,profile),update={update_id:5,message:{text:'ignored'}};f.q.processUpdate(update);
  const before=f.s.db.prepare('SELECT * FROM tg_updates WHERE update_id=5').get();assert.equal(f.q.offset(),6);
  assert.throws(()=>f.q.processUpdate({...update,message:{text:'conflicting'}}),/update conflict/);
  assert.deepEqual(f.s.db.prepare('SELECT * FROM tg_updates WHERE update_id=5').get(),before);assert.equal(before.update_hash,hash(canonical(update)));assert.equal(f.q.offset(),6);
  assert.equal(f.s.db.prepare('SELECT count(*) n FROM approvals').get().n,0);f.q.processUpdate({update_id:6,message:{text:'new'}});assert.equal(f.q.offset(),7);
 });
 test(`audit1 ${profile}: worker stops draining the queue after a transport failure`,async t=>{
  const f=fixture(t,profile);f.make('Первая');f.make('Вторая');let sends=0;
  const api={stop(){},async call(method,args){
   if(method==='getMe')return{id:77,is_bot:true,username:profile==='anna'?'anna_arg_bot':'ostrov_smm_bot'};
   if(method==='getWebhookInfo')return{url:''};if(method==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===f.config.approvalChatId?'supergroup':'channel'};
   if(method==='getChatMember')return{status:'administrator',can_post_messages:true};if(method==='getUpdates')return[];
   if(method==='sendMessage'){sends++;f.advance();throw new TelegramFailure('unknown')}
   throw Error('unexpected fixture API');
  }};
  const w=await createTelegramWorker(f.s,{...f.config,...profile==='anna'?{externalPoll:true}:{}},{api,log(){}});
  try{await w.tick();assert.equal(sends,1);assert.equal(w.queue.stats().unknown,1);assert.equal(w.queue.stats().queued,1)}finally{await w.stop()}
 });
}

test('audit7 echo comparison never trims leading, internal or Unicode whitespace',()=>{
 assert(sameTelegramText('Текст 🌊 \r\n','Текст 🌊\t'));
 for(const text of [' Текст 🌊','Текст  🌊','Текст 🌊\u00a0','Текст 🌊\u2028','Текст 🌊подмена'])assert.equal(sameTelegramText(text,'Текст 🌊'),false);
 assert.equal(sameTelegramText(null,'Текст'),false);assert.equal(sameTelegramText('Текст',undefined),false);
});

test('audit1 Anna external poll ownership survives sender degradation and restoration',async t=>{
 const f=fixture(t,'anna');f.make();let offline=true,sends=0,polls=0;const logs=[];
 const api={stop(){},async call(method,args){
  if(method==='getMe')return{id:77,is_bot:true,username:'anna_arg_bot'};if(method==='getWebhookInfo')return{url:''};
  if(method==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===f.config.approvalChatId?'supergroup':'channel'};
  if(method==='getChatMember')return{status:'administrator',can_post_messages:true};if(method==='getUpdates'){polls++;throw Error('second poller forbidden')}
  if(method==='sendMessage'){sends++;if(offline)throw new TelegramFailure('not_sent');return f.message({request:{args}},sends)}throw Error('unexpected fixture API');
 }};
 const w=await createTelegramWorker(f.s,{...f.config,externalPoll:true,writerEnabled:false},{api,log:r=>logs.push(r)});try{
  await w.tick();assert.equal(sends,1);assert.equal(f.s.telegramStatus.ready,false);assert.equal(f.s.status().telegram.reason,'send_unavailable');assert.equal(w.queue.stats().queued,1);
  f.advance(1000);await w.tick();assert.equal(sends,1);assert.equal(f.s.status().telegram.reason,'send_unavailable');
  offline=false;f.advance(2000);await w.tick();assert.equal(sends,2);assert.equal(f.s.telegramStatus.ready,true);assert.equal(f.s.status().telegram.reason,null);assert.equal(w.queue.stats().sent,1);assert.equal(polls,0);
  assert.equal(logs.filter(r=>r.event==='telegram_send_degraded').length,1);assert.equal(logs.filter(r=>r.event==='telegram_send_recovered').length,1);assert.equal(f.s.status().publishing,false,'Anna writer remains disabled');
 }finally{await w.stop()}
});

test('audit1 degraded poll also holds an already approved publication',async t=>{
 const f=fixture(t);let offline=true,sends=0;
 const api={stop(){},async call(method,args){
  if(method==='getMe')return{id:77,is_bot:true,username:'ostrov_smm_bot'};if(method==='getWebhookInfo')return{url:''};
  if(method==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===f.config.approvalChatId?'supergroup':'channel'};
  if(method==='getChatMember')return{status:'administrator',can_post_messages:true};if(method==='getUpdates'){if(offline)throw Error('synthetic poll outage');return[]}
  if(method==='sendMessage'){sends++;return f.message({request:{args}},sends)}throw Error('unexpected fixture API');
 }};
 const w=await createTelegramWorker(f.s,f.config,{api,log(){}});try{
  await w.tick();const card=f.sent();f.approve(card);await w.tick();assert.equal(sends,0);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'approved');
  offline=false;await w.tick();assert.equal(sends,1);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'published');
 }finally{await w.stop()}
});

test('audit1 degraded local poll holds queued cards until a successful recovery poll',async t=>{
 const f=fixture(t);let offline=true,sends=0;
 const api={stop(){},async call(method,args){
  if(method==='getMe')return{id:77,is_bot:true,username:'ostrov_smm_bot'};if(method==='getWebhookInfo')return{url:''};
  if(method==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===-101?'supergroup':'channel'};
  if(method==='getChatMember')return{status:'administrator',can_post_messages:true};if(method==='getUpdates'){if(offline)throw Error('synthetic poll outage');return[]}
  if(method==='sendMessage'){sends++;return {message_id:sends,chat:{id:Number(args.chat_id)},from:{id:77,is_bot:true},text:args.text,reply_markup:args.reply_markup}}
  throw Error('unexpected fixture API');
 }};
 const w=await createTelegramWorker(f.s,f.config,{api,log(){}});try{
  await w.tick();f.make();await w.tick();await w.tick();assert.equal(sends,0);assert.equal(w.queue.stats().unknown,undefined);
  offline=false;await w.tick();assert.equal(sends,1);assert.equal(f.s.status().telegram.reason,null);assert.equal(f.s.status().publishing,true);
 }finally{await w.stop()}
});

test('audit1 Anna notices retry proven-unsent outcomes only up to their existing budget',t=>{
 const f=fixture(t,'anna');f.s.ingestEvent('anna',{platform:'vk',account_id:'127999849',provider_id:'notice-1',kind:'comment',conversation_id:'wall:127999849:4',subject_id:'comment:1',text:'Событие',occurred_at:Date.parse('2026-10-14T02:00:00Z')});f.q.enqueueCards();
 for(let n=1;n<=3;n++){const a=f.q.claim();assert.equal(a.kind,'notice');assert.equal(a.attempts,n);f.q.finish(a.id,{notSent:true});if(n<3){assert.equal(f.q.stats().unknown,undefined);f.advance()}}
 assert.equal(f.q.claim(),null);assert.equal(f.s.db.prepare('SELECT state FROM tg_notice_actions').get().state,'failed');
});

test('audit8 tool descriptions match revision before decision and stage2 status',()=>{
 assert.match(toolsForRole('varvara').find(t=>t.name==='revise_draft').description,/до решения|pending_approval/);
 assert.doesNotMatch(toolsForRole('monitor')[0].description,/стадии1/);
});

test('audit9 both configuration profiles keep disabled-block requirements and Anna writer absence',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-config-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config');
 const legacy={port:8381,stateDir:'/private/state',keyFiles:{varvara:'/private/v',monitor:'/private/m'},targets:{vk:'127999849',telegram:'-202',instagram:'456',threads:'789'}};
 const anna={...legacy,profile:'anna',port:8382,keyFiles:{anna:'/private/a',monitor:'/private/m',channel:'/private/c'},telegram:{enabled:false,tokenFile:'/private/t',approvalChatId:-1001659691422,externalPoll:true,writerEnabled:false},vk:{enabled:true,armed:true,idleAt:'2026-10-13T11:35:20Z',apiVersion:'5.199',groupToken:{file:'/private/g'},wallToken:{file:'/private/w'}}};
 for(const config of [legacy,anna]){fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});const loaded=loadConfig(file);assert.deepEqual(loaded,config);assert.equal(loaded.vk?.writer,undefined)}
 fs.writeFileSync(file,JSON.stringify({...legacy,telegram:{enabled:false}}));assert.throws(()=>loadConfig(file),/config rejected/);
 fs.writeFileSync(file,JSON.stringify({...anna,vk:{...anna.vk,writer:{enabled:false,token:{file:'/private/t'}}}}));assert.throws(()=>loadConfig(file),/config rejected/);
});

test('audit12 startup rejection distinguishes known causes without echoing private input',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socseti-startup-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config');fs.writeFileSync(file,'{}',{mode:0o600});
 const env={...process.env};delete env.NOTIFY_SOCKET;
 const bad=spawnSync(process.execPath,['src/main.mjs',file],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',timeout:5000});
 const missing=spawnSync(process.execPath,['src/main.mjs',path.join(dir,'private-marker-not-a-secret')],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',timeout:5000});
 assert.equal(bad.status,1);assert.equal(missing.status,1);assert.notEqual(bad.stderr,missing.stderr);assert.match(bad.stderr,/config_rejected/);assert.match(missing.stderr,/ENOENT|private_file_unavailable/);assert(!missing.stderr.includes('private-marker-not-a-secret'));
 fs.writeFileSync(file,'{"private-marker-not-a-secret":');const malformed=spawnSync(process.execPath,['src/main.mjs',file],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',timeout:5000});assert.equal(malformed.status,1);assert(!malformed.stderr.includes('private-marker-not-a-secret'));
});
