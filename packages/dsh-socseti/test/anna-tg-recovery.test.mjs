import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {startServer} from '../src/server.mjs';import {createTelegramWorker} from '../src/telegram-worker.mjs';const peerFiles=['social-ingress.js','message-receipts.js'].map(name=>new URL('../../dsh-telegram-multiagent/src/'+name,import.meta.url));
const hasPeer=peerFiles.every(file=>fs.existsSync(file));
const {SocialIngress,socialRoute}=hasPeer?await import(peerFiles[0].href):{};
const {MessageReceipts,stableJson,BODY_RETENTION_MS}=hasPeer?await import(peerFiles[1].href):{};
const peerTest=(name,fn)=>test(name,{skip:!hasPeer?'external Telegram channel package is absent':false},fn);

const channel=-1001925584120,discussion=-1002103269359,marketing=-1001659691422;
const post=(update_id,message_id,text)=>({update_id,channel_post:{chat:{id:channel,type:'channel'},message_id,date:1,text}});
async function fixture(t,drop=null){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anna-tg-recovery-')),keyFiles={};for(const [role,char] of [['anna','a'],['monitor','b'],['channel','c']]){keyFiles[role]=path.join(dir,role);fs.writeFileSync(keyFiles[role],char.repeat(64),{mode:0o600})}
 const service=await startServer({profile:'anna',port:0,stateDir:path.join(dir,'state'),keyFiles,targets:{telegram:String(channel),vk:'123',instagram:'456',threads:'789'}});let now=Date.parse('2026-10-13T06:00:00Z'),dropOnce=Boolean(drop);service.store.now=()=>now;
 const proxy=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  if(dropOnce&&req.url==='/channel/ingress'&&drop==='before'){dropOnce=false;req.socket.destroy();return}
  const response=await fetch(service.url.replace('/mcp',req.url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:req.headers.authorization},body}),data=await response.text();
  if(dropOnce&&req.url==='/channel/ingress'){dropOnce=false;req.socket.destroy();return}res.writeHead(response.status,{'Content-Type':'application/json'}).end(data);
 });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const ledger=hasPeer?new MessageReceipts(path.join(dir,'ledger'),{now:()=>now}):null;let worker;
 t.after(async()=>{await worker?.stop();await new Promise(r=>proxy.close(r));ledger?.close();await service.close();fs.rmSync(dir,{recursive:true,force:true})});
 const config={agentName:'anna',social:{serviceUrl:'http://127.0.0.1:'+proxy.address().port,keyFile:keyFiles.channel,channelId:channel,discussionId:discussion}};
 const social=hasPeer?new SocialIngress({config,ledger}):null;const receipt=u=>ledger.receive('telegram:77:'+u.update_id,stableJson(u),{route:'tg',routeKey:socialRoute(u,config),hold:false});const sent=[];
 return {dir,service,ledger,social,receipt,advance:ms=>now+=ms,async worker(){
  return worker=await createTelegramWorker(service.store,{approvalChatId:marketing,externalPoll:true,writerEnabled:true},{log(){},api:{stop(){},async call(name,args){if(name==='getMe')return{id:77,is_bot:true,username:'anna_arg_bot'};if(name==='getWebhookInfo')return{url:''};if(name==='getChat')return{id:Number(args.chat_id),type:Number(args.chat_id)===marketing?'supergroup':'channel'};if(name==='getChatMember')return{status:'administrator',can_post_messages:true};if(name==='sendMessage'){const m={message_id:sent.length+11,date:1,chat:{id:Number(args.chat_id)},from:{id:77,is_bot:true},text:args.text,reply_markup:args.reply_markup};sent.push(m);return m}throw Error('unexpected '+name)}}})},sent};
}
// Break caught: durable retry becomes permanently stale after a later event advances diagnostic cursor.
for(const drop of ['before','after'])peerTest('earlier Telegram retry after later admission: dropped '+drop+' commit',async t=>{
 const f=await fixture(t,drop),one=post(100,1,'Первый'),two=post(101,2,'Второй'),r=f.receipt(one);await assert.rejects(()=>f.social.handle(one,r,77),/social transport/);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM events').get().n,drop==='after'?1:0);
 await f.social.handle(two,f.receipt(two),77);await f.social.handle(one,r,77);assert.equal(f.ledger.get(r.id).outcome,'social_ingested');assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM events').get().n,2);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM outbox').get().n,4);assert.equal(f.service.store.cursor('telegram:'+channel),'101');
 await f.social.handle(one,r,77);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM events').get().n,2);
});
// Break caught: body survives in newly added social_requests after ledger retention.
peerTest('completed delivery sheds request body and 30-day purge erases remaining ledger text',async t=>{
 const f=await fixture(t),marker='PRIVATE-RETENTION-CONTROL-🌊',u=post(102,3,marker),r=f.receipt(u);await f.social.handle(u,r,77);assert.equal(f.ledger.db.prepare('SELECT request_json FROM social_requests WHERE receipt_id=?').get(r.id).request_json,null);
 f.advance(BODY_RETENTION_MS+1);assert.equal(f.ledger.expireBodies(),1);assert.equal(f.ledger.get(r.id).raw,null);f.ledger.db.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');assert.equal(fs.readFileSync(path.join(f.dir,'ledger','receipts.sqlite')).includes(Buffer.from(marker)),false);
});
// Break caught: own publication without a from ID becomes a new external event.
peerTest('confirmed own channel post without from is ignored by saved publication receipt',async t=>{
 const f=await fixture(t),w=await f.worker();const d=f.service.store.execute('anna','draft_post',{request_id:'echo-post-1',platform:'telegram',text:'Свой пост'});await w.tick();const card=f.service.store.telegramQueue.db.prepare("SELECT * FROM tg_actions WHERE kind='card' AND draft_id=?").get(d.draft_id);
 const u={update_id:103,callback_query:{id:'approve',from:{id:712345678,is_bot:false},data:'publish:'+card.nonce,message:f.sent[0]}};await f.social.handle(u,f.receipt(u),77);await w.tick();assert.equal(f.service.store.db.prepare('SELECT state FROM drafts').get().state,'published');
 const pub=f.sent[1],echo=post(104,pub.message_id,pub.text);echo.channel_post.sender_chat={id:channel,type:'channel'};assert.equal(echo.channel_post.from,undefined);await f.social.handle(echo,f.receipt(echo),77);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM events').get().n,0);
 const edit={update_id:105,edited_channel_post:{...echo.channel_post,edit_date:2,text:'Правка человека'}};await f.social.handle(edit,f.receipt(edit),77);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM events').get().n,1);
});
// Break caught: no external getUpdates branch resets health after owner reader recovers.
test('external-poll worker becomes ready again after owner reader restoration',async t=>{
 const f=await fixture(t),w=await f.worker();await w.tick();assert.equal(f.service.store.status().telegram.reason,null);const file=process.env.SOCSETI_OWNER_READER;assert.ok(file.startsWith(os.tmpdir()+'/socseti-approval-fixture-'));const original=fs.readFileSync(file);t.after(()=>fs.writeFileSync(file,original));fs.writeFileSync(file,'#!/bin/sh\nexit 1\n');await w.tick();assert.equal(f.service.store.status().telegram.reason,'owner_id_unavailable');assert.equal(f.service.store.status().external_io,false);
 fs.writeFileSync(file,original);f.advance(3600000);f.service.store.execute('anna','draft_post',{request_id:'owner-health-1',platform:'telegram',text:'Пост'});await w.tick();assert.equal(f.sent.length,1);assert.equal(f.service.store.status().telegram.reason,null);assert.equal(f.service.store.status().external_io,true);
});
