import './approval-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {TelegramQueue} from '../src/telegram-queue.mjs';
const policy={approvalChatId:-1001659691422,botId:77};
function fixture(t,at='2026-10-13T02:00:00Z'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-hourly-'));let now=Date.parse(at),s,q;
 const open=()=>{s=new Store(dir,{telegram:'-202',vk:'123',instagram:'456',threads:'789'},{now:()=>now,profile:'anna'});q=new TelegramQueue(s,policy)};open();
 t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true})});
 return {get s(){return s},get q(){return q},set:at=>now=Date.parse(at),restart(){s.close();open()}};
}
let seq=0;const draft=f=>f.s.execute('varvara','draft_post',{request_id:'hourly-'+(++seq),platform:'telegram',text:'Текст '+seq});
function deliver(f,a,id=11){const m={message_id:id,date:1,chat:{id:policy.approvalChatId},from:{id:77,is_bot:true},text:a.request.args.text,reply_markup:a.request.args.reply_markup};f.q.finish(a.id,{result:m});return m}
function approve(f,a,m,id=1){return f.q.processUpdate({update_id:id,callback_query:{id:'cb-'+id,from:{id:712345678,is_bot:false},message:m,data:'publish:'+a.nonce}}).decision}
// Break caught: immediate enqueue bypasses the Moscow night fence.
test('night cards stay pending until 09 Moscow; empty hour sends nothing',t=>{
 const f=fixture(t);draft(f);assert.equal(f.q.enqueueCards(),0);assert.equal(f.q.claim(),null);
 f.set('2026-10-13T05:59:59Z');assert.equal(f.q.enqueueCards(),0);
 f.set('2026-10-13T06:00:00Z');assert.equal(f.q.enqueueCards(),1);const a=f.q.claim();assert.equal(a.request.args.chat_id,-1001659691422);deliver(f,a);
 assert.equal(f.q.enqueueCards(),0);assert.equal(f.q.claim(),null);f.set('2026-10-13T07:00:00Z');assert.equal(f.q.enqueueCards(),0);assert.equal(f.q.claim(),null);
});
// Break caught: fresh arrivals join a previously frozen batch / replays resend.
test('frozen hour excludes later drafts across restart and next hour sends only new',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);f.set('2026-10-13T06:00:00Z');assert.equal(f.q.enqueueCards(),1);deliver(f,f.q.claim());
 f.set('2026-10-13T06:00:01Z');const later=draft(f);f.restart();assert.equal(f.q.enqueueCards(),0);assert.equal(f.q.claim(),null);
 f.set('2026-10-13T07:00:00Z');assert.equal(f.q.enqueueCards(),1);assert.equal(f.q.claim().draft_id,later.draft_id);
});
// Break caught: LIMIT20 accidentally truncates the durable morning membership.
test('all 25 night drafts page through one batch, individual hashes and nonces',t=>{
 const f=fixture(t);const ids=Array.from({length:25},()=>draft(f).draft_id);f.set('2026-10-13T06:00:00Z');
 const got=[],nonces=[],hashes=[];for(let pass=0;pass<3;pass++){f.q.enqueueCards();for(let a;(a=f.q.claim());){got.push(a.draft_id);nonces.push(a.nonce);hashes.push(a.payload_hash);deliver(f,a,got.length);f.set(new Date(Date.parse('2026-10-13T06:00:00Z')+got.length*3000).toISOString())}}
 assert.deepEqual(got.sort(),ids.sort());assert.equal(new Set(nonces).size,25);assert.equal(new Set(hashes).size,25);assert.equal(f.q.enqueueCards(),0);
});
// Break caught: 00:00 slot or cutoff after 23:00 admits a 23:01 card.
test('23:01 waits until next 09; 00 Moscow never flushes',t=>{
 const f=fixture(t,'2026-10-13T20:00:00Z');assert.equal(f.q.enqueueCards(),0);f.set('2026-10-13T20:01:00Z');draft(f);assert.equal(f.q.enqueueCards(),0);
 f.set('2026-10-13T21:00:00Z');assert.equal(f.q.enqueueCards(),0);assert.equal(f.q.claim(),null);
 f.set('2026-10-14T05:59:59Z');assert.equal(f.q.enqueueCards(),0);f.set('2026-10-14T06:00:00Z');assert.equal(f.q.enqueueCards(),1);
});
// Break caught: queued/retry actions leak out after midnight or crash replay.
test('unsent queued card is fenced at midnight and resumes next morning',t=>{
 const f=fixture(t,'2026-10-13T19:59:00Z');draft(f);f.set('2026-10-13T20:00:00Z');f.q.enqueueCards();
 f.set('2026-10-13T21:00:00Z');f.restart();assert.equal(f.q.claim(),null);f.set('2026-10-14T06:00:00Z');assert.ok(f.q.claim());
});
// Break caught: TTL runs from creation or is renewed each enqueue/restart.
test('24h approval TTL starts only at confirmed delivery and does not renew',t=>{
 const f=fixture(t,'2026-10-01T22:00:00Z');const d=draft(f);f.set('2026-10-13T06:00:00Z');assert.equal(f.q.enqueueCards(),1);const a=f.q.claim(),m=deliver(f,a);
 const expires=f.s.db.prepare('SELECT expires_at FROM drafts WHERE id=?').get(d.draft_id).expires_at;
 assert.equal(expires,Date.parse('2026-10-14T06:00:00Z'));f.restart();f.q.enqueueCards();assert.equal(f.s.db.prepare('SELECT expires_at FROM drafts WHERE id=?').get(d.draft_id).expires_at,expires);
 f.set('2026-10-14T06:00:00Z');assert.equal(approve(f,a,m),'stale');assert.equal(f.q.claim(),null);
});
// Break caught: malformed receipt or unknown timeout is treated as delivered/ retried.
test('unknown delivery remains durable, unexpired and never retried',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim();f.q.finish(a.id,{unknown:true});
 f.set('2026-11-01T06:00:00Z');f.restart();f.q.enqueueCards();assert.equal(f.q.claim(),null);assert.equal(f.q.stats().unknown,1);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'pending_approval');
});
// Break caught: clock loses per-hour delivery throttle, exceeding group quota.
test('confirmed cards are paced at least 3s apart and pace survives restart',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();deliver(f,f.q.claim());assert.equal(f.q.claim(),null);
 f.restart();f.set('2026-10-13T06:00:02Z');assert.equal(f.q.claim(),null);f.set('2026-10-13T06:00:03Z');assert.ok(f.q.claim());
});
// Break caught: outbox keeps the obsolete SMM address regardless of queue destination.
test('stored Anna card and buttons belong to Marketing',t=>{
 const f=fixture(t);draft(f);const card=JSON.parse(f.s.db.prepare("SELECT payload_json FROM outbox WHERE kind='approval_card_request'").get().payload_json);assert.equal(card.approval_chat_id,-1001659691422);
});
// Break caught: old-version TTL leaks into revision or stale card accepts.
test('new version waits for its hour and receives a fresh TTL only on delivery',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z'),d=draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim(),m=deliver(f,a);
 f.set('2026-10-13T06:01:00Z');f.s.execute('varvara','revise_draft',{request_id:'revision-hour-1',draft_id:d.draft_id,draft_token:d.draft_token,expected_version:1,text:'Новый текст'});
 assert.equal(approve(f,a,m),'stale');assert.equal(f.q.enqueueCards(),0);f.set('2026-10-13T07:00:00Z');assert.equal(f.q.enqueueCards(),1);const b=f.q.claim();assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.payload_hash,b.payload_hash);deliver(f,b,12);
 assert.equal(f.s.db.prepare('SELECT expires_at FROM drafts').get().expires_at,Date.parse('2026-10-14T07:00:00Z'));
});
// Break caught: current delegate cannot approve a post or a second grant changes its authority.
test('delegate approves a post; second human grant is stale for the same card',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim(),m=deliver(f,a);
 const u={update_id:1,callback_query:{id:'delegate-cb',from:{id:823456789,is_bot:false},message:m,data:'publish:'+a.nonce}};
 assert.equal(f.q.processUpdate(u).decision,'approved');assert.equal(f.s.db.prepare('SELECT count(*) n FROM approvals').get().n,1);assert.equal(approve(f,a,m,2),'stale');
});
// Break caught: writer starts during overlap before coordinator releases it.
test('Anna writer is closed by default even after owner approval',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim(),m=deliver(f,a);assert.equal(approve(f,a,m),'approved');assert.equal(f.q.claim(),null);
 const enabled=new TelegramQueue(f.s,{...policy,writerEnabled:true});assert.equal(enabled.claim().kind,'publication');
});
// Break caught: night event notices are held forever or bypass hourly fence.
test('DM notice waits until 09, keeps source time and never grants publication',t=>{
 const f=fixture(t);const e=f.s.ingestEvent('anna',{platform:'vk',account_id:'123',provider_id:'dm-control',kind:'dm',conversation_id:'peer-1',subject_id:'person-1',text:'Ночная ЛС 🌊'});assert.equal(f.q.enqueueCards(),0);
 f.set('2026-10-13T06:00:00Z');assert.equal(f.q.enqueueCards(),1);const a=f.q.claim();assert.ok(a.request.args.text.includes(e.event_id));assert.equal(a.kind,'notice');assert.ok(a.request.args.text.includes('05:00'));assert.ok(a.request.args.text.includes('Ночная ЛС 🌊'));assert.equal(a.request.args.reply_markup,undefined);const m=deliver(f,a);
 assert.equal(approve(f,a,m),'denied');assert.equal(f.q.claim(),null);assert.equal(f.s.db.prepare("SELECT state FROM outbox WHERE kind='event_card_request'").get().state,'tg_sent');assert.equal(f.s.db.prepare("SELECT state FROM outbox WHERE kind='anna_event'").get().state,'held_no_private_route');
});
// Break caught: event sending crash replays, or real receipts are unchecked.
test('unknown event card survives crash recovery without replay',t=>{
 const f=fixture(t);f.s.ingestEvent('anna',{platform:'vk',account_id:'123',provider_id:'dm-unknown',kind:'dm',conversation_id:'peer-1',subject_id:'person-1',text:'ЛС'});f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim();assert.ok(a);f.restart();f.q.recover();assert.equal(f.q.claim(),null);assert.equal(f.q.stats().unknown,1);
});
// Break caught: forged acknowledgement or general publish elevates an event notice.
test('plain notice has no approval buttons; forged callbacks never grant authority',t=>{
 const f=fixture(t);f.s.ingestEvent('anna',{platform:'vk',account_id:'123',provider_id:'dm-observe',kind:'dm',conversation_id:'peer-1',subject_id:'person-1',text:'ЛС'});f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim(),m=deliver(f,a);
 const u={update_id:1,callback_query:{id:'observe-cb',from:{id:712345678,is_bot:false},message:m,data:'observe:'+a.nonce}};const forged=structuredClone(u);forged.callback_query.message.message_id=999;assert.equal(f.q.processUpdate(forged).decision,'denied');u.update_id=2;assert.equal(f.q.processUpdate(u).decision,'denied');assert.equal(f.s.db.prepare('SELECT count(*) n FROM approvals').get().n,0);assert.equal(f.q.claim(),null);
 f.set('2026-10-14T06:00:00Z');u.update_id=3;assert.equal(f.q.processUpdate(u).decision,'denied');
});
// Break caught: role change strands an approved draft forever / reuses old grant.
test('owner change revokes queued publication and allows new owner reapproval',t=>{
 const f=fixture(t,'2026-10-13T05:59:00Z');draft(f);f.set('2026-10-13T06:00:00Z');f.q.enqueueCards();const a=f.q.claim(),m=deliver(f,a);assert.equal(approve(f,a,m),'approved');
 const file=process.env.SOCSETI_OWNER_READER;assert.ok(file.startsWith(os.tmpdir()+'/socseti-approval-fixture-'));const original=fs.readFileSync(file);t.after(()=>fs.writeFileSync(file,original));fs.writeFileSync(file,'#!/bin/sh\necho 823456789\n');
 const enabled=new TelegramQueue(f.s,{...policy,writerEnabled:true});assert.equal(enabled.claim(),null);assert.equal(f.s.db.prepare('SELECT state FROM drafts').get().state,'pending_approval');assert.equal(f.s.db.prepare("SELECT count(*) n FROM approvals WHERE state='valid'").get().n,0);
 const u={update_id:2,callback_query:{id:'new-owner',from:{id:823456789,is_bot:false},message:m,data:'publish:'+a.nonce}};assert.equal(enabled.processUpdate(u).decision,'approved');assert.equal(enabled.claim().kind,'publication');
});
