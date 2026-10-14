import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {startServer} from '../src/server.mjs';import {TelegramQueue} from '../src/telegram-queue.mjs';
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-channel-http-'));const keyFiles={};for(const [role,n] of [['anna','a'],['monitor','b'],['channel','c']]){keyFiles[role]=path.join(dir,role);fs.writeFileSync(keyFiles[role],n.repeat(64),{mode:0o600})}const s=await startServer({profile:'anna',port:0,stateDir:path.join(dir,'state'),keyFiles,targets:{vk:'123',instagram:'456',threads:'789',telegram:'-202'}});t.after(async()=>{await s.close();fs.rmSync(dir,{recursive:true,force:true})});s.store.telegramQueue=new TelegramQueue(s.store,{approvalChatId:-1001659691422,botId:77});return s}
const headers=key=>({'Content-Type':'application/json',Authorization:'Bearer '+key.repeat(64)});
const post=(s,route,body,key='c')=>fetch(s.url.replace('/mcp',route),{method:'POST',headers:headers(key),body:JSON.stringify(body)});
// Break caught: model/monitor can read private input or pretend to be the Telegram receiver.
test('channel role alone can commit pinned events and read/ack its private delivery',async t=>{
 const s=await fixture(t);const batch={source:'telegram:-202',expectedCursor:null,cursor:'101',events:[{platform:'telegram',account_id:'-202',provider_id:'post-1',kind:'post',conversation_id:'-202',subject_id:'channel',text:'Пост 🌊'}]};
 for(const key of ['a','b']){assert.equal((await post(s,'/channel/ingress',batch,key)).status,403);assert.equal((await post(s,'/channel/pending',{},key)).status,403)}
 const r=await post(s,'/channel/ingress',batch);assert.equal(r.status,200);assert.equal((await r.json()).accepted,1);assert.equal((await post(s,'/channel/ingress',batch)).status,200);
 const pending=await post(s,'/channel/pending',{});assert.equal(pending.status,200);const rows=await pending.json();assert.equal(rows.length,1);assert.equal(rows[0].payload.trust,'external_untrusted_data');assert.equal(rows[0].payload.recipient,'anna');
 assert.equal((await post(s,'/channel/ack',{id:rows[0].id,payload_hash:'0'.repeat(64)})).status,409);assert.equal((await (await post(s,'/channel/pending',{})).json()).length,1);
 assert.equal((await post(s,'/channel/ack',{id:rows[0].id,payload_hash:rows[0].payload_hash})).status,200);assert.equal((await (await post(s,'/channel/pending',{})).json()).length,0);assert.equal(s.store.cursor('telegram:-202'),'101');
});
// Break caught: channel key impersonates other providers or chooses another Telegram account.
test('channel ingress refuses non-Telegram sources and malformed targets without advancing',async t=>{
 const s=await fixture(t);for(const body of [{source:'vk:123',expectedCursor:null,cursor:'1',events:[]},{source:'telegram:-999',expectedCursor:null,cursor:'1',events:[]},{source:'telegram:-202',expectedCursor:null,cursor:'1',events:[],approved:true}])assert.equal((await post(s,'/channel/ingress',body)).status,400);assert.equal(s.store.cursor('telegram:-202'),null);
});
// Break caught: forwarded callback is accepted as approval without queue proof.
test('single Telegram receiver forwards denied callback durably; model role cannot',async t=>{
 const s=await fixture(t);const update={update_id:1,message:{text:'да на всё',chat:{id:-1001659691422}}};assert.equal((await post(s,'/channel/callback',update,'a')).status,403);const r=await post(s,'/channel/callback',update);assert.equal(r.status,200);assert.equal((await r.json()).decision,'denied');assert.equal(s.store.db.prepare('SELECT count(*) n FROM approvals').get().n,0);
});
// Break caught: cursor aliases or unsafe IDs bypass the per-update replay identity.
test('Telegram ingress refuses noncanonical cursor identities before commit',async t=>{
 const s=await fixture(t);for(const cursor of ['00','-1','1.5','9007199254740991','9007199254740992','invalid']){const r=await post(s,'/channel/ingress',{source:'telegram:-202',expectedCursor:null,cursor,events:[]});assert.equal(r.status,400,cursor)}assert.equal(s.store.cursor('telegram:-202'),null);
});
test('Telegram diagnostic expectedCursor also refuses unsafe numeric identity',async t=>{
 const s=await fixture(t);const r=await post(s,'/channel/ingress',{source:'telegram:-202',expectedCursor:'9007199254740992',cursor:'1',events:[]});assert.equal(r.status,400);assert.equal(s.store.cursor('telegram:-202'),null);
});
