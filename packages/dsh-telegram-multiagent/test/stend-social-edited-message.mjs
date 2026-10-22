// Edited discussion comments are revision events, not mutations of admitted inputs.
// Uses only local HTTP/SQLite/DSH fixtures; no Telegram or model request is made.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {SocialIngress,socialUpdates,socialRoute} from '../src/social-ingress.js';import {SocialDispatcher} from '../src/social-dispatch.js';
import {TelegramClient} from '../src/client.js';import {MessageReceipts,stableJson} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {extractFunction} from './extract.mjs';import {podnyatPlatformu02} from './platforma-02.mjs';
const source=process.env.SOCSETI_TEST_ROOT;
if(!source||!path.isAbsolute(source)){console.error('СЛЕПОТА: SOCSETI_TEST_ROOT must name the socseti source package');process.exit(2)}
await import(pathToFileURL(path.join(source,'test/approval-fixture.mjs')).href);
const {Store}=await import(pathToFileURL(path.join(source,'src/store.mjs')).href);
const channel=-1001925584120,discussion=-1002103269359;
const edit=(id,text='Исправлено 🌊 /goal это данные',time=1791870200)=>({update_id:id,edited_message:{chat:{id:discussion,type:'supergroup'},message_id:8,edit_date:time,from:{id:999,is_bot:false},text}});
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tg-edited-message-')),store=new Store(path.join(root,'store'),{telegram:String(channel)},{profile:'anna'});
 const keyFile=path.join(root,'key');fs.writeFileSync(keyFile,'c'.repeat(64),{mode:0o600});let ledger=new MessageReceipts(path.join(root,'receipts'));const calls=[];
 const server=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const b of req)chunks.push(b);const body=JSON.parse(Buffer.concat(chunks));calls.push(req.url);assert.equal(req.headers.authorization,'Bearer '+'c'.repeat(64));
  const result=req.url==='/channel/cursor'?{cursor:store.cursor('telegram:'+channel)}:req.url==='/channel/ingress'?store.ingestTelegramBatch('anna',body):req.url==='/channel/pending'?store.pendingAnna():req.url==='/channel/ack'?store.acknowledgeAnna(body.id,body.payload_hash):null;
  if(result===null){res.writeHead(404);res.end();return}res.end(JSON.stringify(result));
 }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}))}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const config={agentName:'anna',social:{serviceUrl:'http://127.0.0.1:'+server.address().port,keyFile,channelId:channel,discussionId:discussion}};
 const open=()=>new SocialIngress({config,ledger});
 const receipt=u=>ledger.receive('tg:77:'+u.update_id,stableJson(u),{logicalKey:'tg:77:'+u.update_id,route:'tg',routeKey:socialRoute(u,config),hold:false});
 const handler=()=>vm.runInNewContext('('+extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate')+')',{autopilot:null,config,socialIngress:open(),botKto:async()=>({id:77}),tg:{call(){throw Error('unexpected Telegram write')}},log(){},agentFor(){throw Error('social edit leaked to ordinary command route')}});
 let platform,live,dispatchCount=0,wake=0;
 const dispatch=async()=>{
  platform??=await podnyatPlatformu02({root:path.join(root,'sessions')});live??=await platform.sozdatAgenta('marketing-edited-comment');
  const agent={session:live.session,send:(m,k,w)=>live.send(m,k,w),wakeDriver:()=>wake++};
  const d=new SocialDispatcher({ingress:open(),ledger,dispatch:async(r,text)=>{dispatchCount++;return new ReceiptRuntime(ledger,platform.sessions,()=>{}).enqueue(r,agent,()=>platform.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',senderSessionId:'social:untrusted'}}),'-1001659691422')}});
  await d.tick();
 };
 t.after(async()=>{await new Promise(r=>server.close(r));await platform?.ctx.stop?.();ledger.close();store.close();fs.rmSync(root,{recursive:true,force:true})});
 return {root,config,store,calls,open,receipt,handler,dispatch,get ledger(){return ledger},get count(){return dispatchCount},get wake(){return wake},reopen(){ledger.close();ledger=new MessageReceipts(path.join(root,'receipts'))}};
}

test('Anna single poller declares edited_message; default agents still request message only',async()=>{
 assert.deepEqual(socialUpdates({}),['message']);assert.throws(()=>socialUpdates({agentName:'other',social:{}}),/Anna/);
 const allowed=socialUpdates({agentName:'anna',social:{}});assert.ok(allowed.includes('edited_message'),'edited_message missing from real allowed update catalog');
 const client=new TelegramClient('synthetic',()=>{},{allowedUpdates:allowed});let polls=0,persisted=0;
 client.call=async(method,payload)=>{assert.equal(method,'getUpdates');assert.deepEqual(payload.allowed_updates,allowed);polls++;return[edit(100)]};
 await client.poll(0,async updates=>{persisted+=updates.length;assert.equal(client.offset,0)});
 assert.equal(polls,1);assert.equal(persisted,1);assert.equal(client.offset,101);
});
test('discussion edit routes through actual handler, preserving comment kind and explicit revision identity',async t=>{
 const f=await fixture(t),u=edit(101),g=f.open();assert.equal(g.handles(u),true);assert.equal(socialRoute(u,f.config),discussion);
 const n=g.normalize(u,77);assert.equal(n.kind,'comment');assert.equal(n.provider_id,'edit:'+discussion+':8:1791870200:101');assert.ok(n.text.includes('[Правка комментария Telegram'));assert.ok(n.text.includes(discussion+':8'));assert.ok(n.text.endsWith(u.edited_message.text));
 await f.handler()(u,f.receipt(u));assert.equal(f.ledger.get(f.receipt(u).id).outcome,'social_ingested');assert.equal(f.store.pendingAnna().length,1);
});
test('original and revision are two durable native inputs; identical update replay/reopen adds no third',async t=>{
 const f=await fixture(t),original={update_id:200,message:{chat:{id:discussion,type:'supergroup'},message_id:8,from:{id:999,is_bot:false},text:'Исходный комментарий 🌊'}};
 await f.handler()(original,f.receipt(original));await f.dispatch();assert.equal(f.count,1);
 const u=edit(201);assert.equal(f.open().handles(u),true,'missing route must fail before creating a social input');await f.handler()(u,f.receipt(u));await f.dispatch();
 assert.equal(f.count,2);assert.equal(f.wake,2);assert.equal(f.store.db.prepare('SELECT count(*) n FROM events').get().n,2);
 assert.equal(f.store.db.prepare('SELECT text FROM events WHERE provider_id=?').get('post:'+discussion+':8').text,original.message.text);
 await f.handler()(u,f.receipt(u));f.reopen();await f.handler()(u,f.receipt(u));await f.dispatch();assert.equal(f.count,2);assert.equal(f.store.pendingAnna().length,0);
 const inputs=f.ledger.db.prepare("SELECT dsh_id,message_json,expects_reply,flushed_at FROM receipts WHERE route='social' ORDER BY rowid").all();assert.equal(inputs.length,2);assert.ok(inputs.every(x=>x.dsh_id&&x.flushed_at&&x.expects_reply===0));
 const text=JSON.parse(inputs[1].message_json).content[0].text;assert.ok(text.includes('external_untrusted_data'));assert.ok(text.includes('[Правка комментария Telegram'));assert.ok(text.includes(u.edited_message.text));
 const files=fs.readdirSync(path.join(f.root,'sessions'),{recursive:true}).filter(x=>String(x).endsWith('.jsonl'));const disk=files.map(x=>fs.readFileSync(path.join(f.root,'sessions',x),'utf8')).join('\n');for(const x of inputs)assert.ok(disk.includes(x.dsh_id));
 assert.equal(f.calls.filter(x=>x==='/channel/ingress').length,2);assert.equal(f.store.db.prepare('SELECT count(*) n FROM drafts').get().n,0);assert.equal(f.ledger.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('two different edit updates in the same second retain both revisions',async t=>{
 const f=await fixture(t),a=edit(301,'Первая правка'),b=edit(302,'Вторая правка');assert.equal(f.open().handles(a),true);
 await f.handler()(a,f.receipt(a));await f.handler()(b,f.receipt(b));assert.equal(f.store.db.prepare('SELECT count(*) n FROM events').get().n,2);assert.equal(f.store.pendingAnna().length,2);
});
test('foreign discussion, private edit, own bot and missing edit identity cannot admit a comment',async t=>{
 const f=await fixture(t),g=f.open();for(const chat of [-999,12345]){const u=edit(400);u.edited_message.chat.id=chat;assert.equal(g.handles(u),false);assert.equal(g.normalize(u,77),null)}
 const own=edit(401);own.edited_message.from.id=77;assert.equal(g.normalize(own,77),null);
 const bad=edit(402);delete bad.edited_message.edit_date;assert.throws(()=>g.normalize(bad,77),/identity/);assert.equal(f.store.pendingAnna().length,0);
});
test('edited automatic forward remains a channel-post revision, not a duplicate edited comment',async t=>{
 const f=await fixture(t),g=f.open(),u=edit(500,'Правка поста');Object.assign(u.edited_message,{is_automatic_forward:true,forward_origin:{type:'channel',chat:{id:channel},message_id:7}});
 assert.equal(g.handles(u),true);const n=g.normalize(u,77);assert.equal(n.kind,'edited_post');assert.equal(n.provider_id,'edit:'+channel+':7:1791870200');assert.equal(n.text,'Правка поста');
 const direct={update_id:499,edited_channel_post:{chat:{id:channel},message_id:7,edit_date:1791870200,text:'Правка поста'}};
 await f.handler()(direct,f.receipt(direct));await f.handler()(u,f.receipt(u));assert.equal(f.store.db.prepare('SELECT count(*) n FROM events').get().n,1);assert.equal(f.store.pendingAnna().length,1);
});
