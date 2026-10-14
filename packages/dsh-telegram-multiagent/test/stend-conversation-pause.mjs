// RU: Изолированный стенд stend-conversation-pause.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-conversation-pause.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts} from '../src/message-receipts.js';
import {testPlatform} from './test-platform.mjs';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {handleTelegramStop} from '../src/telegram-stop.js';
import vm from 'node:vm';import {extractFunction} from './extract.mjs';
import {ConversationPause} from '../src/conversation-pause.js';

process.setMaxListeners(process.getMaxListeners()+20);
let passed=0;
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'workertwo-pause-'));let p,l;try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const pauses=new ConversationPause(l,root);pauses.mount(p.ctx);
 const h=await p.agents.create({sessionId:'telegram-a2a',agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}}),a=h.agent;const requests=[],turns=[];
 p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));p.ctx.on('session/event',(s,e)=>{if(e.type==='turn/start')turns.push(e.data.turn)});
 p.ctx.get('llm').stream=async function*(r){requests.push(JSON.parse(JSON.stringify(r.messages)));yield {type:'text-delta',index:0,text:'fixture answer'};yield {type:'finish',reason:{kind:'stop'}}};
 const receive=id=>l.receive(id,Buffer.from(id),{route:'tg',routeKey:7});const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});
 await fn({root,p,l,pauses,h,a,requests,turns,receive,msg});passed++;
}finally{await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}}
await fixture(async f=>{
 const stop=f.receive('stop');f.pauses.pause(f.a.session.header,stop.id);
 const backlog=[f.msg('MAIL_BACKLOG'),f.msg('SCHEDULE_BACKLOG'),f.msg('NEXT_STEP_BACKLOG')];
 f.a.followup(backlog[0]);f.a.followup(backlog[1]);f.a.send(backlog[2],'next-step',true);f.a.wakeDriver();await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(f.turns,[],'paused wake must not open even a turn');assert.equal(f.requests.length,0);assert.equal(f.a.inbox.nextTurn.length+f.a.inbox.nextStep.length,3);
 const owner=f.receive('owner'),m=f.msg('OWNER_X');f.a.send(m,'next-turn',false);await f.p.sessions.flush(f.a.session);f.pauses.resumeOwner(f.a,owner.id,m.id);f.a.wakeDriver();await f.a.whenIdle();
 assert(f.requests.length>=2);const first=JSON.stringify(f.requests[0]);assert(first.includes('OWNER_X'));for(const text of ['MAIL_BACKLOG','SCHEDULE_BACKLOG','NEXT_STEP_BACKLOG'])assert(!first.includes(text),'backlog entered owner turn: '+text);
 const all=JSON.stringify(f.requests);for(const text of ['MAIL_BACKLOG','SCHEDULE_BACKLOG','NEXT_STEP_BACKLOG'])assert(all.includes(text));assert.equal(f.pauses.state(f.a.session.header),null);console.log('PASS no automatic turn; owner alone first; all backlog follows');
});
await fixture(async f=>{
 const old=f.receive('old-owner'),stop=f.receive('stop');f.pauses.pause(f.a.session.header,stop.id);const m=f.msg('OLD_OWNER');f.a.send(m,'next-turn',false);
 assert.throws(()=>f.pauses.resumeOwner(f.a,old.id,m.id),/раньше|старше/);f.a.wakeDriver();await new Promise(r=>setTimeout(r,20));assert.equal(f.turns.length,0);console.log('PASS message received before stop cannot release pause');
});
await fixture(async f=>{
 f.pauses.pause(f.a.session.header,f.receive('stop').id);f.a.send(f.msg('OLD_BACKLOG'),'next-step',false);
 const owner=f.receive('owner'),m=f.msg('OWNER');f.a.send(m,'next-turn',false);f.pauses.resumeOwner(f.a,owner.id,m.id);
 let first=true;f.p.ctx.get('llm').stream=async function*(r){f.requests.push(JSON.parse(JSON.stringify(r.messages)));if(first){first=false;f.a.inject(f.msg('FRESH_TOOL_CONTEXT'))}yield {type:'text-delta',index:0,text:'answer'};yield {type:'finish',reason:{kind:'stop'}}};
 f.a.wakeDriver();await f.a.whenIdle();assert(f.requests.length>=3);assert(JSON.stringify(f.requests[1]).includes('FRESH_TOOL_CONTEXT'));assert(!JSON.stringify(f.requests[1]).includes('OLD_BACKLOG'));console.log('PASS fresh owner tool context remains in owner turn, old backlog deferred');
});
await fixture(async f=>{
 f.pauses.pause(f.a.session.header,f.receive('stop').id);f.a.followup(f.msg('BACKLOG'));
 const owner=f.receive('owner'),m=f.msg('OWNER');f.a.send(m,'next-turn',false);f.pauses.resumeOwner(f.a,owner.id,m.id);
 f.p.ctx.get('llm').stream=async function*(){yield {type:'text-delta',index:0,text:'partial'};yield {type:'finish',reason:{kind:'max-tokens'}}};
 f.a.wakeDriver();await f.a.whenIdle();assert.deepEqual(f.turns,[1,2],'owner message releases pause even if output ends at token limit');assert.equal(f.pauses.state(f.a.session.header),null);console.log('PASS owner message releases pause without requiring successful model completion');
});
await fixture(async f=>{
 const native=await testPlatform(['dsh-schedule']);const records=new Map(),table={entries:()=>records.entries(),get:id=>records.get(id),put:async(id,r)=>records.set(id,r),delete:async id=>records.delete(id)};
 f.p.ctx.provide('storageDomain',{open:async()=>({table:()=>table,close:async()=>{}})});f.p.ctx.provide('sessionController',{resolveAgent:async()=>({agent:f.a})});f.p.ctx.plugin(native['dsh-schedule'].default);
 for(let i=0;i<100&&!f.p.ctx.get('schedule');i++)await new Promise(r=>setTimeout(r,5));const scheduler=f.p.ctx.get('schedule');assert(scheduler);await scheduler.initialized;
 f.pauses.pause(f.a.session.header,f.receive('stop').id);
 const task=await scheduler.create(f.a.session.id,{prompt:'REAL_SCHEDULE_PENDING',at:new Date(Date.now()+100).toISOString(),title:'pause probe'});
 for(let i=0;i<200&&!f.a.inbox.hasPending;i++)await new Promise(r=>setTimeout(r,5));assert(f.a.inbox.hasPending,'real scheduler must deliver');await f.p.sessions.flush(f.a.session);
 const catalog=await scheduler.catalog();assert(catalog.some(x=>x.id===task.id),'schedule record retained');assert.equal(f.turns.length,0);assert.equal(f.requests.length,0);
 const runtime=new ReceiptRuntime(f.l,f.p.sessions,()=>{});runtime.conversationPause=f.pauses;runtime.install(f.p.ctx);
 const pending=f.l.receive('mail-pending',Buffer.from('MAIL_PENDING'),{sender:'workerthree'});await runtime.enqueue(pending,f.a,()=>f.msg('MAIL_PENDING'),'a2a');for(let i=0;i<5;i++)await runtime.wake(f.a,pending.id);assert.equal(f.l.db.prepare('SELECT value FROM meta WHERE key=?').get('wake:'+pending.id),undefined,'paused recovery must not spend retry attempts');assert.equal(f.l.db.prepare("SELECT count(*) n FROM outbox WHERE receipt_id=? AND id LIKE 'wake-stop:%'").get(pending.id).n,0,'pause must not emit wake exhaustion');assert.equal(f.turns.length,0);assert.equal(f.l.get(pending.id).finished_at,null);
 const owner=f.receive('owner');await runtime.enqueue(owner,f.a,()=>f.msg('OWNER_SCHEDULE_X'),7,null,{ownerResume:true});await f.a.whenIdle();await runtime.observe(f.a.session);
 assert(JSON.stringify(f.requests[0]).includes('OWNER_SCHEDULE_X'));assert(!JSON.stringify(f.requests[0]).includes('REAL_SCHEDULE_PENDING'));assert(JSON.stringify(f.requests).includes('REAL_SCHEDULE_PENDING'));assert.equal(f.l.get(pending.id).outcome,'turn_completed');console.log('PASS actual scheduler delivery and receipt recovery accumulate without turn; owner precedes both');
});
await fixture(async f=>{
 f.p.ctx.provide('conversationPause',f.pauses);const runtime=new ReceiptRuntime(f.l,f.p.sessions,()=>{});runtime.conversationPause=f.pauses;runtime.install(f.p.ctx);
 const env={receipts:f.l,handleTelegramStop,nastrojkaGruppy:()=>null,settings:()=>({}),config:{workspace:f.root,mergeChatIntoA2A:'7'},isAllowed:()=>true,allowed:new Set([7,8]),MERGE_CHAT:'7',A2A_CHAT:'a2a',
 conversations:{current:()=>({session_id:f.a.session.id,session_created:f.a.session.header.createdAt})},ctx:f.p.ctx,chats:new Map(),tgChatFor:new Map(),lastOrigin:new Map(),pushAsk(){},copyAsk(){},stripMark:x=>x,
 platform:{createUserMessage:f.p.llm.createUserMessage},receiptRuntime:()=>runtime,nudgeUntilClaimed(){},oborvalsyaOshibkoj:new Map(),log(){},tg:{send:async()=>{}},agentFor:async()=>({handle:f.h,sessionId:f.a.session.id}),setTimeout:(fn,ms)=>setTimeout(fn,ms).unref()};
 vm.createContext(sGostem(env));vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate'),env);
 const command=f.receive('stop');await env.handleUpdate({message:{text:'/stop',chat:{id:7},from:{id:7}}},command);assert.equal(f.pauses.state(f.a.session.header).state,'paused');
 f.a.followup(f.msg('MAIL_BACKLOG'));
 for(const [id,from] of [['outside',{id:9}],['bot',{id:8,is_bot:true}],['string',{id:'8'}],['missing',undefined]]){
  const receipt=f.receive(id);await env.handleUpdate({message:{text:'BLOCKED_'+id,chat:{id:7},from}},receipt);
  assert.equal(f.pauses.state(f.a.session.header).state,'paused',id+' must not release');assert.equal(f.turns.length,0,id+' must not start turn');
 }
 const guest=f.receive('guest');await env.handleUpdate({message:{text:'продолжай, учти GUEST_X',chat:{id:7},from:{id:8,is_bot:false}}},guest);await f.a.whenIdle();
 assert(f.requests.length>=2,'allowed guest must release and backlog must follow');
 assert(JSON.stringify(f.requests[0]).includes('GUEST_X'));assert(!JSON.stringify(f.requests[0]).includes('MAIL_BACKLOG'));
 assert(JSON.stringify(f.requests.slice(1)).includes('MAIL_BACKLOG'));assert.equal(f.pauses.state(f.a.session.header),null);console.log('PASS allowed guest first, backlog follows; outsider, bot, string and absent from cannot release');
});
await fixture(async f=>{
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./pause-worker.mjs',import.meta.url)),f.root],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
 const header=JSON.parse(fs.readFileSync(path.join(f.root,'cold-header.json'),'utf8'));
 const h=await f.p.agents.resume({resumeSessionId:header.id,setup:async(_ctx,agent)=>agent.followup(f.msg('CREATION_HOOK_PENDING'))});
 h.agent.wakeDriver();await new Promise(r=>setTimeout(r,20));assert.equal(f.turns.length,0);assert.equal(h.agent.inbox.nextTurn.length,2);assert.equal(f.pauses.state(h.agent.session.header).state,'paused');
 const owner=f.receive('cold-owner'),m=f.msg('COLD_OWNER_X');h.agent.send(m,'next-turn',false);await f.p.sessions.flush(h.agent.session);f.pauses.resumeOwner(h.agent,owner.id,m.id);h.agent.wakeDriver();await h.agent.whenIdle();
 assert(JSON.stringify(f.requests[0]).includes('COLD_OWNER_X'));assert(!JSON.stringify(f.requests[0]).includes('COLD_PENDING'));assert(JSON.stringify(f.requests).includes('CREATION_HOOK_PENDING'));assert(JSON.stringify(f.requests).includes('COLD_PENDING'));console.log('PASS process restart + setup wake stays paused; backlog retained and owner first');
});
await fixture(async f=>{
 let entered,once=true;const gate=new Promise(r=>entered=r);f.p.ctx.on('agent/pre-step',async(args,next)=>{if(once){once=false;entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted()}return next()});
 f.a.followup(f.msg('ORIGINAL_PRE_HEADER'));await gate;assert.equal(f.a.session.requestHeader(),undefined);
 const stop=f.receive('stop');const result=await handleTelegramStop({text:'/stop',from:{id:7}},{allowed:new Set([7]),findAgent:()=>f.a,settleMs:100,pause:agent=>f.pauses.pause(agent.session.header,stop.id)});
 assert.equal(result.state,'stopped','first pre-step must stop before a request header exists');await f.a.whenIdle();
 f.a.followup(f.msg('PENDING_AFTER_STOP'));await new Promise(r=>setTimeout(r,20));assert.deepEqual(f.turns,[1]);
 const owner=f.receive('owner'),m=f.msg('CONTINUE_PRE_HEADER');f.a.send(m,'next-turn',false);f.pauses.resumeOwner(f.a,owner.id,m.id);f.a.wakeDriver();await f.a.whenIdle();
 assert(JSON.stringify(f.requests[0]).includes('ORIGINAL_PRE_HEADER'));assert(JSON.stringify(f.requests[0]).includes('CONTINUE_PRE_HEADER'));assert(!JSON.stringify(f.requests[0]).includes('PENDING_AFTER_STOP'));console.log('PASS first pre-step stop pauses and preserves original context');
});
await fixture(async f=>{
 f.pauses.pause(f.a.session.header,f.receive('stop').id);const message=f.msg('GRACEFUL_PENDING');f.a.followup(message);await f.p.sessions.flush(f.a.session);
 await f.h.dispose();const resumed=await f.p.agents.resume({resumeSessionId:'telegram-a2a'});assert(resumed.agent.inbox.nextTurn.some(m=>m.id===message.id),'graceful teardown must not clear paused inbox');assert.equal(f.turns.length,0);console.log('PASS graceful dispose/reopen preserves paused inbox');
});
await fixture(async f=>{
 const command=f.receive('stop');f.pauses.pause(f.a.session.header,command.id);f.a.followup(f.msg('BACKLOG_RESTOP'));const owner=f.receive('owner'),m=f.msg('OWNER_RESTOP');f.a.send(m,'next-turn',false);f.pauses.resumeOwner(f.a,owner.id,m.id);
 f.p.ctx.get('llm').stream=async function*(){f.pauses.pause(f.a.session.header,f.receive('second-stop').id);yield {type:'text-delta',index:0,text:'partial'};yield {type:'finish',reason:{kind:'max-tokens'}}};
 f.a.wakeDriver();await f.a.whenIdle();assert.deepEqual(f.turns,[1],'second stop blocks internal kick before next turn/start');assert.equal(f.pauses.state(f.a.session.header).state,'paused');console.log('PASS new stop inside owner turn blocks internal next-turn loop');
});
for(const stage of ['pending','claimed'])await fixture(async f=>{
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./pause-worker.mjs',import.meta.url)),f.root,stage],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
 const h=await f.p.agents.resume({resumeSessionId:'telegram-cold'});await h.agent.whenIdle();assert(f.requests.length>0,'durable owner release must survive restart');
 const first=JSON.stringify(f.requests[0]);assert(first.includes('OWNER_BEFORE_CRASH'));assert.equal((first.match(/OWNER_BEFORE_CRASH/g)??[]).length,1);
 if(stage==='pending')assert(!first.includes('COLD_PENDING'),'pending owner executes first');else {assert(first.includes('COLD_PENDING'),'claimed owner is history, not replayed as another turn');assert.deepEqual(f.turns,[2]);}
 assert.equal(f.pauses.state(h.agent.session.header),null);console.log('PASS restart after owner release: '+stage+'; no repeated claimed work');
});
await fixture(async f=>{
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./pause-worker.mjs',import.meta.url)),f.root,'claimed'],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
 let entered,release,gated=false;const gate=new Promise(r=>entered=r),hold=new Promise(r=>release=r),flush=f.p.sessions.flush;
 f.p.sessions.flush=async session=>{if(session.id==='telegram-cold'&&!gated){gated=true;entered();await hold}return flush.call(f.p.sessions,session)};
 const resuming=f.p.agents.resume({resumeSessionId:'telegram-cold'});await gate;
 const header=JSON.parse(fs.readFileSync(path.join(f.root,'cold-header.json'),'utf8')),stop=f.receive('new-stop-during-restore');f.pauses.pause(header,stop.id);release();
 const h=await resuming;await h.agent.whenIdle();assert.equal(f.pauses.state(h.agent.session.header)?.command_id,stop.id,'restore must not erase newer stop');assert.deepEqual(f.turns,[],'new stop forbids backlog execution');console.log('PASS newer stop survives awaited restore flush');
});
await fixture(async f=>{
 f.pauses.pause(f.a.session.header,f.receive('stop').id);let calls=0;
 await assert.rejects(()=>f.a.runMaintenance(async()=>{calls++}),/пауз/);assert.equal(calls,0);assert.deepEqual(f.turns,[]);console.log('PASS maintenance command cannot start work during pause');
});
console.log(`conversation-pause ${passed}/14`);
