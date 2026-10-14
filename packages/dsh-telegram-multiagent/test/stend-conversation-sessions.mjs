// RU: Изолированный стенд stend-conversation-sessions.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-conversation-sessions.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';
import {podnyatPlatformu02} from './platforma-02.mjs';
let ConversationSessions;try{({ConversationSessions}=await import('../src/conversation-sessions.js'))}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
assert.equal(typeof ConversationSessions,'function','durable conversation store is required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workertwo-new-sessions-'));let ledger,p;let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('OK',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
try{
 let now=1000;ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>now});
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});
 let store=new ConversationSessions(ledger);const old=await p.agents.create({sessionId:'telegram-a2a',meta:{cwd:root}});
 old.agent.send(p.llm.createUserMessage({content:[{type:'text',text:'OLD_CONTEXT_CANARY_1462'}],source:{kind:'user'}}),'next-turn',false);
 await p.sessions.flush(old.agent.session);store.pin('a2a',old.agent.session.header);await old.dispose();
 const command=()=>ledger.receive('tg-'+Math.random(),Buffer.from('/new'),{route:'tg',routeKey:7,hold:false});
 let first,handle,receipt;
 await test('intent persists a new ID without switching chat',async()=>{receipt=command();first=store.begin('a2a',receipt.id);assert.notEqual(first.new_id,'telegram-a2a');assert.equal(store.current('a2a').session_id,'telegram-a2a');assert.equal(store.begin('a2a',receipt.id).new_id,first.new_id)});
 await test('second concurrent rotation refuses',async()=>{assert.throws(()=>store.begin('a2a',command().id),/переход/)});
 await test('native empty history commit preserves old history and saves reply atomically',async()=>{
  handle=await p.agents.create({sessionId:first.new_id,meta:{cwd:root}});assert(await p.sessions.flush(handle.agent.session));
  assert(!JSON.stringify(handle.agent.session.snapshotEvents()).includes('OLD_CONTEXT_CANARY_1462'));
  store.commit(receipt.id,handle.agent.session.header);
  assert.equal(store.current('a2a').session_id,first.new_id);
  assert.equal(ledger.get(receipt.id).outcome,'session_rotated');
  assert.equal(ledger.db.prepare('SELECT count(*) n FROM outbox WHERE receipt_id=?').get(receipt.id).n,1);
  const reader=await p.backend.open('telegram-a2a','read');try{assert(JSON.stringify((await reader.read(0)).events).includes('OLD_CONTEXT_CANARY_1462'))}finally{await reader.close()}
 });
 await test('restart retains binding; old receipt pin cannot select old generation',async()=>{await handle.dispose();ledger.close();ledger=new MessageReceipts(path.join(root,'ledger'),{now:()=>now});store=new ConversationSessions(ledger);assert.equal(store.current('a2a').session_id,first.new_id);assert.throws(()=>store.pin('a2a',old.agent.session.header),/поколение/);const h=await p.agents.resume({resumeSessionId:store.current('a2a').session_id});try{assert.equal(h.agent.session.header.createdAt,store.current('a2a').session_created)}finally{await h.dispose()}});
 await test('crash before commit aborts intent; late completion cannot switch',async()=>{const r=command(),intent=store.begin('a2a',r.id);store=new ConversationSessions(ledger);store.abortPrepared('перезапуск до фиксации');assert.equal(store.current('a2a').session_id,first.new_id);assert.equal(ledger.get(r.id).outcome,'session_rotation_aborted');assert.throws(()=>store.commit(r.id,{id:intent.new_id,createdAt:42}),/не ожидает/)});
 await test('deadline refuses commit without changing current',async()=>{const r=command(),intent=store.begin('a2a',r.id);now+=60001;assert.throws(()=>store.commit(r.id,{id:intent.new_id,createdAt:42}),/срок/);assert.equal(store.current('a2a').session_id,first.new_id);assert.equal(ledger.get(r.id).outcome,'session_rotation_aborted');store.begin('a2a',command().id);store.abortPrepared('fixture')});
 await test('outbox failure rolls back binding and receipt together',async()=>{const r=command(),intent=store.begin('a2a',r.id);ledger.db.exec("CREATE TEMP TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'fixture outbox'); END");try{assert.throws(()=>store.commit(r.id,{id:intent.new_id,createdAt:42}),/fixture outbox/);assert.equal(store.current('a2a').session_id,first.new_id);assert.equal(ledger.get(r.id).finished_at,null)}finally{ledger.db.exec('DROP TRIGGER fail_outbox');store.abortPrepared('fixture')}});
 await test('abandoned expired intent stops blocking its route without restart',async()=>{const r=command();store.begin('a2a',r.id);now+=60001;const second=command();store.begin('a2a',second.id);assert.equal(ledger.get(r.id).outcome,'session_rotation_aborted');store.abort(second.id,'fixture')});
 await test('foreign new header cannot commit; idle route has legacy ID',async()=>{const r=command();store.begin('a2a',r.id);assert.throws(()=>store.commit(r.id,{id:'telegram-foreign',createdAt:42}),/поколение/);assert.equal(store.current('42').session_id,'telegram-42');store.abortPrepared('fixture')});
}finally{ledger?.close();await p?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}
console.log(`conversation-sessions ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
