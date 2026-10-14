// RU: Изолированный стенд stend-new-rotation.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-new-rotation.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import {ConversationPause} from '../src/conversation-pause.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {borrowLiveSession} from '../src/live-session.js';

process.setMaxListeners(process.getMaxListeners()+16);
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import vm from 'node:vm';import {extractFunction} from './extract.mjs';import {handleTelegramStop} from '../src/telegram-stop.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {podnyatPlatformu02} from './platforma-02.mjs';import {testPlatform} from './test-platform.mjs';
import {MessageReceipts} from '../src/message-receipts.js';import {TelegramClient} from '../src/client.js';import {ConversationSessions} from '../src/conversation-sessions.js';import {AttachmentStore} from '../src/attachments.js';import {rotateConversation} from '../src/rotate-conversation.js';
const native=await testPlatform(['dsh-schedule']);let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('OK',name)}catch(e){failed++;console.error('FAIL',name,e.stack)}}
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta1462-rotate-'));let p,l;try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const pauses=new ConversationPause(l,root);pauses.mount(p.ctx);p.ctx.provide('conversationPause',pauses);const journal=[];const c=new ConversationSessions(l,line=>journal.push(line)),attachments=new AttachmentStore({workspace:root});
 const createAgent=id=>p.agents.create({sessionId:id,meta:{cwd:root}});const h=await createAgent('telegram-a2a');await p.sessions.flush(h.agent.session);c.pin('a2a',h.agent.session.header);
 const table=new Map();let serialized=0;const service={chain:Promise.resolve(),stopping:false,getDomain:async()=>({table:()=>({entries:()=>table.entries(),get:id=>table.get(id),delete:async id=>table.delete(id)})}),serialize:fn=>{serialized++;return native['dsh-schedule'].ScheduleService.prototype.serialize.call(service,fn)},emitChanged(){},runtime:null};
 const schedule={list:r=>native['dsh-schedule'].ScheduleService.prototype.list.call(service,r),catalog:()=>native['dsh-schedule'].ScheduleService.prototype.catalog.call(service),delete:(r,s)=>native['dsh-schedule'].ScheduleService.prototype.delete.call(service,r,s)};
 const ctx={agents:p.agents,get:n=>n==='schedule'?schedule:p.ctx.get(n)};
 const o={conversations:c,ledger:l,attachments,ctx,key:'a2a',cwd:root,createAgent,checkCapability:async()=>{},mergeChat:'7',a2aChat:'a2a',enabled:true,entry:{handle:h,sessionId:h.agent.session.id},observe:s=>p.sessions.flush(s)};
 const receive=(id,options={})=>l.receive(id,Buffer.from(id),{hold:false,...options});const command=()=>{const r=receive('command',{route:'tg',routeKey:7});o.receiptId=r.id;return r};
 await fn({root,p,l,c,h,o,table,schedule,attachments,receive,command,journal,pauses,serialized:()=>serialized});
}finally{l?.close();await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}}
await test('native /new cancels planned work, preserves old journal, new history empty and binding durable',()=>fixture(async f=>{
 const {l,c,h,o,table,receive,command,attachments,p}=f;
 h.agent.send(p.llm.createUserMessage({content:[{type:'text',text:'OLD_CANARY_1462'}],source:{kind:'user'}}),'next-turn',false);await p.sessions.flush(h.agent.session);
 const mail=receive('old-mail',{sender:'workerthree'}),future=()=>receive('after-command',{route:'tg',routeKey:7});
 table.set('schedule-1',{sessionId:'telegram-a2a',status:'active',record:{id:'schedule-1',kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:'test schedule'}});
 attachments.ensure();attachments.save({version:1,files:{},requests:{x:{id:'x',chat:'7',status:'saved'}}});
 const cmd=command(),after=future();const next=await rotateConversation(o);
 assert.notEqual(next.sessionId,'telegram-a2a');assert.equal(c.current('a2a').session_id,next.sessionId);assert.equal(l.get(mail.id).outcome,'cancelled_by_new');assert(Number.isFinite(l.get(mail.id).finished_at));assert.equal(Buffer.from(l.get(mail.id).raw).toString(),'old-mail');assert.equal(l.get(after.id).finished_at,null);
 assert.equal(attachments.load().requests.x.status,'cancelled_by_new');assert.equal(table.size,0);
 assert.equal(next.handle.agent.inbox.nextTurn.length,0);assert(!JSON.stringify(next.handle.agent.session.snapshotEvents()).includes('OLD_CANARY_1462'));
 const r=await p.backend.open('telegram-a2a','read');try{assert(JSON.stringify((await r.read(0)).events).includes('OLD_CANARY_1462'))}finally{await r.close()}
 const answer=l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;for(const text of ['schedule-1','2030','test schedule',mail.id,'workerthree',new Date(mail.received_at).toISOString(),'old-mail','Вложение x','не отзывает'])assert(answer.includes(text),text);
 await next.handle.dispose();assert.equal(new ConversationSessions(l).current('a2a').session_id,next.sessionId);
}));
await test('disabled and capability failures have no cancellations',()=>fixture(async f=>{f.command();f.table.set('x',{sessionId:'telegram-a2a',status:'active',record:{id:'x'}});f.o.enabled=false;await assert.rejects(rotateConversation(f.o),/выключены/);f.o.enabled=true;f.o.checkCapability=async()=>{throw Error('capability')};await assert.rejects(rotateConversation(f.o),/capability/);assert.equal(f.table.size,1);assert.equal(f.c.current('a2a').session_id,'telegram-a2a')}));
await test('borrowed owner refuses before effects',()=>fixture(async f=>{f.command();f.o.entry.handle={agent:f.h.agent,borrowed:true};await assert.rejects(rotateConversation(f.o),/чужой writer/);assert.equal(f.p.agents.get('telegram-a2a'),f.h.agent)}));
await test('partial schedule failure reports applied and unknown without switching',()=>fixture(async f=>{for(const id of ['one','two'])f.table.set(id,{sessionId:'telegram-a2a',status:'active',record:{id,kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:id}});const cmd=f.command(),del=f.schedule.delete;f.schedule.delete=(r,s)=>r.id==='two'?Promise.reject(Error('fixture delete failure')):del(r,s);await assert.rejects(rotateConversation(f.o),/fixture/);assert.equal(f.c.current('a2a').session_id,'telegram-a2a');const text=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;assert.match(text,/one.*отменено/);assert.match(text,/two.*исход неизвестен/)}));
await test('late deletion cannot commit or create a new agent',()=>fixture(async f=>{f.table.set('slow',{sessionId:'telegram-a2a',status:'active',record:{id:'slow',kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:'slow'}});f.command();const del=f.schedule.delete;f.schedule.delete=async(r,s)=>{await new Promise(r=>setTimeout(r,70));return del(r)};f.o.timeoutMs=30;await assert.rejects(rotateConversation(f.o),/срок/);await new Promise(r=>setTimeout(r,100));assert.equal(f.c.current('a2a').session_id,'telegram-a2a');assert.equal(f.p.agents.roots().length,1)}));
await test('cold pending inbox canceled through native writer without agent resume',()=>fixture(async f=>{
 const dir=path.join(f.root,'sessions');const child=spawnSync(process.execPath,[fileURLToPath(new URL('./stend-cold-conversation.mjs',import.meta.url)),'worker',dir],{encoding:'utf8',timeout:15000});assert.equal(child.status,0,child.stderr);
 const binding=JSON.parse(fs.readFileSync(path.join(dir,'binding.json'),'utf8'));
 f.c.pin('crashed',(await f.p.backend.stat(binding.session_id)).header);
 f.o.key='crashed';f.o.entry=undefined;f.o.cwd=dir;f.o.createAgent=id=>f.p.agents.create({sessionId:id,meta:{cwd:dir}});f.command();
 const next=await rotateConversation(f.o);assert.equal(f.p.agents.get(binding.session_id),undefined);assert.equal(next.handle.agent.inbox.nextTurn.length,0);await next.handle.dispose();
}));
await test('actual Telegram /new handler commits rotated binding and durable reply',()=>fixture(async f=>{
 f.command();const messages=[];const ctx={agents:f.p.agents,get:n=>n==='conversationIdentity'?{version:2,check:async()=>{}}:f.o.ctx.get(n)};
 const env={deployment:{},rotateConversation,conversations:f.c,receipts:f.l,attachmentStore:f.attachments,ctx,config:{workspace:f.root,newSessionsEnabled:true},process,
  chats:new Map([['a2a',f.o.entry]]),sessionToChat:new Map(),tgChatFor:new Map(),MERGE_CHAT:'7',A2A_CHAT:'a2a',settings:()=>({}),
  nastrojkaGruppy:()=>null,isAllowed:()=>true,allowed:new Set([7]),handleTelegramStop,tg:{send:async(_,text)=>messages.push(text)},log(){},
  receiptRuntime:()=>({observe:s=>f.p.sessions.flush(s),install(){}}),platform:{installModelSelection(){}},
  waitService:async n=>n==='agentPresets'?{resolve:async()=>({id:'test'}),mount:async()=>{}}:null,kontekstChata:{zabrat(){}},};
 vm.createContext(sGostem(env));vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'rotateCurrentConversation')+'\n'+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate'),env);
 env.settings=()=>({newSessionsEnabled:null});
 await env.handleUpdate({message:{text:'/new',chat:{id:7},from:{id:7}}},{id:f.o.receiptId});
 assert.equal(f.c.current('a2a').session_id,'telegram-a2a','explicit null switch must fail closed');
 assert(messages.some(x=>x.includes('выключены')));messages.length=0;env.settings=()=>({newSessionsEnabled:true});
 await env.handleUpdate({message:{text:'/new',chat:{id:7},from:{id:7}}},{id:f.o.receiptId});
 assert.equal(f.l.get(f.o.receiptId).outcome,'session_rotated',messages.join(' '));assert.equal(messages.length,0);
 assert.equal(env.chats.get('a2a').sessionId,f.c.current('a2a').session_id);
 const newAgent=env.chats.get('a2a').handle.agent;newAgent.send(f.p.llm.createUserMessage({content:[{type:'text',text:'FIRST_NEW_INPUT'}],source:{kind:'user'}}),'next-turn',false);await f.p.sessions.flush(newAgent.session);assert.equal(newAgent.inbox.nextTurn.length,1);
}));
await test('openBot privileged nonowner /new changes actual native generation',()=>fixture(async f=>{
 f.command();const h7=await f.o.createAgent('telegram-7');f.c.pin('7',h7.agent.session.header);const messages=[];const ctx={agents:f.p.agents,get:n=>n==='conversationIdentity'?{version:2,check:async()=>{}}:f.o.ctx.get(n)};
 const env={deployment:{},rotateConversation,conversations:f.c,receipts:f.l,attachmentStore:f.attachments,ctx,config:{workspace:f.root,newSessionsEnabled:true,openBot:true},process,
  chats:new Map([['7',{handle:h7,sessionId:h7.agent.session.id}]]),sessionToChat:new Map(),tgChatFor:new Map(),MERGE_CHAT:'99',A2A_CHAT:'a2a',settings:()=>({}),
  nastrojkaGruppy:()=>null,isAllowed:()=>true,allowed:new Set([7]),handleTelegramStop,tg:{send:async(_,text)=>messages.push(text)},log(){},
  receiptRuntime:()=>({observe:s=>f.p.sessions.flush(s),install(){}}),platform:{installModelSelection(){}},
  waitService:async n=>n==='agentPresets'?{resolve:async()=>({id:'test'}),mount:async()=>{}}:null,kontekstChata:{zabrat(){}},};
 vm.createContext(sGostem(env));vm.runInContext(extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'rotateCurrentConversation')+'\n'+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate'),env);
 env.settings=()=>({newSessionsEnabled:null});
 await env.handleUpdate({message:{text:'/new',chat:{id:7},from:{id:7}}},{id:f.o.receiptId});
 assert.equal(f.c.current('7').session_id,'telegram-7','explicit null switch must fail closed');
 assert(messages.some(x=>x.includes('выключены')));messages.length=0;env.settings=()=>({newSessionsEnabled:true});
 await env.handleUpdate({message:{text:'/new',chat:{id:7},from:{id:7}}},{id:f.o.receiptId});
 assert.equal(f.l.get(f.o.receiptId).outcome,'session_rotated',messages.join(' '));assert.equal(messages.length,0);
 assert.equal(env.chats.get('7').sessionId,f.c.current('7').session_id);
 const newAgent=env.chats.get('7').handle.agent;newAgent.send(f.p.llm.createUserMessage({content:[{type:'text',text:'FIRST_NEW_INPUT'}],source:{kind:'user'}}),'next-turn',false);await f.p.sessions.flush(newAgent.session);assert.equal(newAgent.inbox.nextTurn.length,1);
}));
await test('late unplanned inbox message survives refusal during schedule cancellation',()=>fixture(async f=>{
 f.table.set('race',{sessionId:'telegram-a2a',status:'active',record:{id:'race',kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:'race'}});f.command();
 const late=f.p.llm.createUserMessage({content:[{type:'text',text:'LATE_UNPLANNED'}],source:{kind:'user'}}),del=f.schedule.delete;
 f.schedule.delete=async(r,s)=>{const result=await del(r,s);f.h.agent.send(late,'next-turn',false);await f.p.sessions.flush(f.h.agent.session);return result};
 await assert.rejects(rotateConversation(f.o),/очередь.*плана|новое сообщение/i);assert(f.h.agent.inbox.nextTurn.some(m=>m.id===late.id));assert.equal(f.c.current('a2a').session_id,'telegram-a2a');
}));
await test('late input during flush is preserved and stops dispose',()=>fixture(async f=>{
 f.command();let injected=false;const get=f.o.ctx.get,late=f.p.llm.createUserMessage({content:[{type:'text',text:'LATE_FLUSH'}],source:{kind:'user'}});
 f.o.ctx.get=n=>n==='sessions'?{flush:async session=>{if(!injected&&f.c.rotating(session.id)){injected=true;f.h.agent.send(late,'next-turn',false)}return f.p.sessions.flush(session)}}:get(n);
 await assert.rejects(rotateConversation(f.o),/новое сообщение/);assert(f.h.agent.inbox.nextTurn.some(m=>m.id===late.id));
}));
await test('native dispose microtask cannot silently lose late input',()=>fixture(async f=>{
 const cmd=f.command(),late=f.p.llm.createUserMessage({content:[{type:'text',text:'LATE_DISPOSE'}],source:{kind:'user'}}),dispose=f.h.dispose;
 f.h.dispose=()=>{const result=dispose();f.h.agent.send(late,'next-turn',false);return result};
 await assert.rejects(rotateConversation(f.o),/Позднее сообщение сохранено/);assert.equal(f.c.current('a2a').session_id,'telegram-a2a');
 const reader=await f.p.backend.open('telegram-a2a','read');try{const saved=await reader.read(0);const restored=f.p.ctx.get('sessionProjections').restore({},saved.events,0,reader.header,reader.inheritedEventCount);assert(restored.snapshot.values.inbox['next-turn'].some(m=>m.id===late.id))}finally{await reader.close()}
 assert(f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body.includes(late.id));
}));
await test('failed bootstrap flush does not leave an unowned live writer',()=>fixture(async f=>{
 f.command();f.o.entry=undefined;f.o.key='first';const get=f.o.ctx.get;f.o.ctx.get=n=>n==='sessions'?{flush:async()=>false}:get(n);
 await assert.rejects(rotateConversation(f.o),/Начальная сессия не сохранена/);assert.equal(f.p.agents.get('telegram-first'),undefined);
}));
for(const provider of ['deepseek-direct','gpt-gateway','claude-gateway'])await test(`stop then immediate new: ${provider}`,()=>fixture(async f=>{
 const mail=f.receive('pause-pending-mail',{sender:'workerthree'});
 f.table.set('pause-schedule',{sessionId:'telegram-a2a',status:'active',record:{id:'pause-schedule',kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:'paused work'}});
 f.attachments.ensure();f.attachments.save({version:1,files:{},requests:{pause:{id:'pause',chat:'7',status:'saved'}}});
 const scheduleBefore=JSON.stringify(await f.schedule.catalog()),mailBefore=JSON.stringify(f.l.get(mail.id)),attachmentBefore=JSON.stringify(f.attachments.load());
 let entered;const gate=new Promise(r=>entered=r);
 f.p.ctx.on('agent/pre-step',async(args,next)=>{entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted();return next()});
 f.h.agent.session.requestHeader=()=>({config:{provider:provider==='deepseek-direct'?provider:'claude-oauth',model:provider==='gpt-gateway'?'gpt-6-astra':'claude-opus-5'}});
 const interrupted=f.receive('owner-running',{route:'tg',routeKey:7});
 const runtime=new ReceiptRuntime(f.l,f.p.sessions,()=>{});runtime.install(f.p.ctx);f.o.observe=s=>runtime.observe(s);
 await runtime.enqueue(interrupted,f.h.agent,()=>f.p.llm.createUserMessage({content:[{type:'text',text:'BLOCKED_BEFORE_MODEL'}],source:{kind:'user'}}),7);await gate;f.command();
 await runtime.observe(f.h.agent.session,f.h.agent.session.snapshotEvents().findLast(e=>e.type==='turn/start').data.turn);
 assert.notEqual(f.l.get(interrupted.id).claimed_turn,null,'real receipt must be claimed');
 const started=Date.now();
 await assert.rejects(rotateConversation(f.o),/сначала \/stop/);
 const stopped=await handleTelegramStop({text:'/stop',from:{id:7}},{allowed:new Set([7]),findAgent:()=>f.h.agent,stopRemote:async()=>({state:'interrupting'}),settleMs:30,pause:agent=>f.pauses.pause(agent.session.header,f.receive('stop-command',{route:'tg',routeKey:7}).id)});
 assert.equal(f.h.agent.status,'idle','/stop must settle the native turn before immediate /new');
 assert.equal(JSON.stringify(await f.schedule.catalog()),scheduleBefore);assert.equal(JSON.stringify(f.l.get(mail.id)),mailBefore);assert.equal(JSON.stringify(f.attachments.load()),attachmentBefore);
 const next=await rotateConversation(f.o);assert.notEqual(next.sessionId,'telegram-a2a');
 assert.equal(f.l.get(mail.id).outcome,'cancelled_by_new');assert.equal((await f.schedule.list({sessionId:'telegram-a2a'})).length,0);assert.equal(f.attachments.load().requests.pause.status,'cancelled_by_new');
 assert(!JSON.stringify(next.handle.agent.session.deriveMessages()).includes('BLOCKED_BEFORE_MODEL'));
 assert(Date.now()-started<5000,'stop/new must finish within 5 seconds');
 assert.equal(f.pauses.state(next.handle.agent.session.header),null,'new generation must not inherit pause');
 assert.equal(f.l.get(interrupted.id).outcome,'cancelled_by_new','interrupted owner receipt must be explicitly cancelled by new');
 const previous=JSON.parse(f.l.get(interrupted.id).result_json).previous;assert.equal(previous.outcome,'interrupted_unknown');assert.equal(previous.evidence.end.reason.reason.kind,'user');assert(previous.finished_at);assert.equal(Buffer.from(f.l.get(interrupted.id).raw).toString(),'owner-running');
 const answer=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(f.o.receiptId+':result').body;assert(answer.includes(interrupted.id),'cancelled interrupted work must be listed');
}));
await test('unconfirmed claimed receipt still refuses rotation',()=>fixture(async f=>{
 const row=f.receive('unconfirmed');f.l.db.prepare('UPDATE receipts SET session_id=?,session_created=?,claimed_turn=999 WHERE id=?').run(f.h.agent.session.id,f.h.agent.session.header.createdAt,row.id);f.command();
 await assert.rejects(rotateConversation(f.o),/Исход ранее начатого/);assert.equal(f.c.current('a2a').session_id,'telegram-a2a');assert.equal(f.l.get(row.id).finished_at,null);
}));
await test('non-user or malformed terminal outcomes are not relabelled as owner cancellation',()=>fixture(async f=>{
 const evidence=[null,{end:{turn:1,reason:{kind:'error'}}},{end:{turn:1,reason:{kind:'aborted',reason:{kind:'disposed'}}}},{end:{turn:2,reason:{kind:'aborted',reason:{kind:'user'}}}}];
 const ids=evidence.map((e,i)=>{const row=f.receive('terminal-'+i);f.l.db.prepare("UPDATE receipts SET session_id=?,session_created=?,claimed_turn=1,finished_at=?,outcome='interrupted_unknown',result_json=? WHERE id=?").run(f.h.agent.session.id,f.h.agent.session.header.createdAt,Date.now(),JSON.stringify(e),row.id);return row.id});
 const before=ids.map(id=>JSON.stringify(f.l.get(id)));f.command();await rotateConversation(f.o);assert.deepEqual(ids.map(id=>JSON.stringify(f.l.get(id))),before);
}));
await test('one reverse cancellation notice and replay never enters the new generation',()=>fixture(async f=>{
 const raw=Buffer.from('[delivery-v1 id=replayed-letter reply=yes]\nFrom: dispatcher\nПервые слова отменённого письма');
 const row=f.l.receive('incoming-one',raw,{sender:'dispatcher',sourcePath:path.join(f.root,'spool','20261002T000000Z-dispatcher-one.txt'),logicalKey:'mail:replayed-letter',route:'a2a'});f.o.returnPaths={spoolDir:path.join(f.root,'spool')};f.command();
 const next=await rotateConversation(f.o);const receipt=f.l.get(row.id);assert.equal(receipt.outcome,'cancelled_by_new');assert.equal(Buffer.from(receipt.raw).toString(),raw.toString());
 const notices=f.l.db.prepare("SELECT * FROM outbox WHERE receipt_id=? AND route='new-return'").all(row.id);assert.equal(notices.length,1);
 const notice=JSON.parse(notices[0].body);assert.deepEqual(notice.destination,{kind:'local',recipient:'dispatcher'});assert.equal(notice.text,`письмо ${row.id} от ${new Date(row.received_at).toISOString()} отменено командой /new владельца, не исполнялось.`);
 const again=f.l.receive('incoming-two',raw,{sender:'dispatcher',logicalKey:'mail:replayed-letter',route:'a2a'});assert.equal(again.id,row.id);assert.equal(again.outcome,'cancelled_by_new');assert.equal(f.l.db.prepare("SELECT count(*) n FROM outbox WHERE receipt_id=? AND route='new-return'").get(row.id).n,1);
 let sent=0;try{await f.l.queue(again.id,{contains:()=>false,send:()=>sent++,flush:async()=>true})}catch{}assert.equal(sent,0);assert.equal(next.handle.agent.inbox.nextTurn.length,0);
}));
await test('already delivered schedule is cancelled in inbox and listed without running',()=>fixture(async f=>{
 const record={id:'schedule-delivered',kind:'at',scheduledAt:'2026-10-02T00:00:00.000Z',title:'Delivered before new',prompt:'НЕ ИСПОЛНЯТЬ ЭТУ ПОДСТАВУ'};
 const message=f.p.llm.createUserMessage({content:[{type:'text',text:native['dsh-schedule'].renderReminderFraming(record)}],source:{kind:'schedule'}});
 f.table.set(record.id,{sessionId:'telegram-a2a',status:'inactive',record,lastDelivery:{messageId:message.id,scheduledAt:record.scheduledAt,deliveredAt:new Date().toISOString()}});
 let steps=0;f.p.ctx.on('agent/pre-step',()=>{steps++;throw Error('must not execute')});f.h.agent.send(message,'next-turn',false);await f.p.sessions.flush(f.h.agent.session);const cmd=f.command();
 const next=await rotateConversation(f.o);assert.equal(steps,0);assert.equal(next.handle.agent.inbox.nextTurn.length,0);assert.equal((await f.schedule.list({sessionId:'telegram-a2a'})).length,0);assert.equal(f.serialized(),0,'inactive record is not deleted');
 const text=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;for(const word of [record.id,record.title,record.scheduledAt,'НЕ ИСПОЛНЯТЬ',message.id])assert(text.includes(word),word);assert(f.journal.some(line=>line.includes(message.id)&&line.includes('cancelled_by_new')));
}));
await test('unknown sender cancels without refusal and keeps an explicitly held return notice',()=>fixture(async f=>{
 const row=f.receive('unknown-sender',{sender:'coders',route:'a2a'});const cmd=f.command();
 const next=await rotateConversation(f.o);assert.notEqual(next.sessionId,'telegram-a2a');assert.equal(f.l.get(row.id).outcome,'cancelled_by_new');
 const out=f.l.db.prepare("SELECT * FROM outbox WHERE receipt_id=? AND route='new-return'").get(row.id);assert(out);assert.equal(out.sent_at,null);
 const route=JSON.parse(out.body).destination;assert.equal(route.kind,'unknown');assert.match(route.reason,/обратный адрес неизвестен/);
 const reply=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;assert(reply.includes(row.id));assert(reply.includes('отправитель не уведомлён: адрес неизвестен'));
}));
await test('attachment bytes and sender/when/first words remain after cancellation',()=>fixture(async f=>{
 f.attachments.download=async()=>new Response(Buffer.from('FILE_PAYLOAD'));
 const file=await f.attachments.receive({message_id:44,chat:{id:7},from:{id:7,first_name:'Owner'},document:{file_id:'file',file_unique_id:'unique',file_size:12,file_name:'note.txt'},caption:'Первые слова подписи'});
 const cmd=f.command();await rotateConversation(f.o);const request=Object.values(f.attachments.load().requests).find(r=>r.id===file.deliveryId);assert.equal(request.status,'cancelled_by_new');assert(Number.isFinite(request.cancelledAt));assert.equal(fs.readFileSync(file.path,'utf8'),'FILE_PAYLOAD');
 const text=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;for(const word of ['Owner','Первые слова подписи',new Date(request.createdAt).toISOString()])assert(text.includes(word),word);assert(f.journal.some(line=>line.includes(file.deliveryId)&&line.includes('cancelled_by_new')));
}));
await test('long cancellation answer is sent in complete Telegram chunks with every ID',()=>fixture(async f=>{
 const ids=Array.from({length:90},(_,i)=>'schedule-long-'+i);for(const id of ids)f.table.set(id,{sessionId:'telegram-a2a',status:'active',record:{id,kind:'at',scheduledAt:'2030-01-01T00:00:00.000Z',title:'Длинное задание 🧩 '+id}});
 const cmd=f.command();await rotateConversation(f.o);assert.equal(f.serialized(),ids.length);assert.equal((await f.schedule.list({sessionId:'telegram-a2a'})).length,0);
 const text=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;assert(text.length>8000);
 const parts=[],client=new TelegramClient('fixture');client.call=async(method,payload)=>{assert.equal(method,'sendMessage');parts.push(payload.text)};await client.send(7,text);
 assert(parts.length>2);assert(parts.every(t=>t.length<=4000&&Buffer.from(t).toString('utf8')===t));const all=parts.join('\n');for(const id of ids){assert(all.includes(id+':'));assert(f.journal.some(line=>line.includes('id='+id+';')&&line.includes('cancelled_by_new')))}assert(all.includes('Прямое Web/API'));
}));
await test('older pending recurring occurrence keeps original schedule identity and deadline',()=>fixture(async f=>{
 const record={id:'schedule-recurring',kind:'every',scheduledAt:'2030-01-01T00:00:00.000Z',title:'Recurring title',prompt:'Recurring prompt'};
 const times=['2026-10-02T00:00:00.000Z','2026-10-02T01:00:00.000Z'],messages=times.map(occurrenceAt=>f.p.llm.createUserMessage({content:[{type:'text',text:native['dsh-schedule'].renderRecurringReminderBatchFraming([{record,occurrenceAt}])}],source:{kind:'schedule'}}));
 f.table.set(record.id,{sessionId:'telegram-a2a',status:'active',record,lastDelivery:{messageId:messages[1].id,scheduledAt:times[1],deliveredAt:new Date().toISOString()}});
 for(const m of messages)f.h.agent.send(m,'next-turn',false);await f.p.sessions.flush(f.h.agent.session);const cmd=f.command();await rotateConversation(f.o);
 const text=f.l.db.prepare('SELECT body FROM outbox WHERE id=?').get(cmd.id+':result').body;for(const t of times)assert(text.includes(t));for(const m of messages)assert(text.includes(m.id));assert.equal((text.match(/Уже доставленное задание schedule-recurring/g)||[]).length,2);
}));
await test('switch off blocks rotations but current reader still serves an existing v2 generation',()=>fixture(async f=>{
 f.command();const next=await rotateConversation(f.o);const blocked=f.receive('new-disabled',{route:'tg',routeKey:7});f.o.receiptId=blocked.id;f.o.entry=next;f.o.enabled=false;
 await assert.rejects(rotateConversation(f.o),/выключены/);
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),env={conversations:f.c,chats:new Map(),sessionToChat:new Map(),ctx:{agents:f.p.agents},config:{workspace:f.root,newSessionsEnabled:false},path,process,borrowLiveSession,log(){},receiptRuntime:()=>({install(){},observe:s=>f.p.sessions.flush(s)})};
 vm.createContext(sGostem(env));vm.runInContext(extractFunction(source,'agentFor'),env);const current=await env.agentFor('a2a');assert.equal(current.sessionId,next.sessionId);assert.equal(current.handle.agent.session.header.createdAt,next.handle.agent.session.header.createdAt);
}));
await test('/new removes published pause immediately at commit',()=>fixture(async f=>{
 const dir=path.join(f.root,'pause-state');fs.mkdirSync(dir,{mode:0o755});const file=path.join(dir,'pauza.json');f.pauses.visibility.file=file;f.pauses.visibility.agent='workertwo';f.p.ctx.provide('schedule',f.schedule);
 const stop=f.receive('publication-stop',{route:'tg',routeKey:7});f.pauses.pause(f.h.agent.session.header,stop.id);await f.pauses.visibility.flush();assert(fs.existsSync(file));
 const create=f.o.createAgent;f.o.createAgent=async id=>{const h=await create(id);await f.pauses.visibility.flush();assert(fs.existsSync(file),'old pause must be published before commit');return h;};
 f.command();await rotateConversation(f.o);assert.equal(fs.existsSync(file),false,'commit must remove file without waiting for periodic refresh');
}));
console.log(`new-rotation ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
