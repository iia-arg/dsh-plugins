import {droppedPublisher} from '../src/autopilot-notice.js';
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,stableJson} from '../src/message-receipts.js';import {TelegramClient} from '../src/client.js';
let sut={};try{sut=await import('../src/social-ingress.js')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
const channel=-1001925584120,discussion=-1002103269359;
async function fixture(t){
 assert.equal(typeof sut.SocialIngress,'function','social ingress feature missing');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tg-social-'));const keyFile=path.join(dir,'key');fs.writeFileSync(keyFile,'c'.repeat(64),{mode:0o600});const ledger=new MessageReceipts(path.join(dir,'receipts'));const requests=[];let cursor=null,lose=false;
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));assert.equal(req.headers.authorization,'Bearer '+'c'.repeat(64));requests.push({route:req.url,body});
  if(req.url==='/channel/cursor'){res.end(JSON.stringify({cursor}));return}if(req.url==='/channel/ingress'){cursor=body.cursor;if(lose){lose=false;req.socket.destroy();return}res.end(JSON.stringify({accepted:1}));return}if(req.url==='/channel/callback'){res.end(JSON.stringify({decision:'denied'}));return}res.writeHead(404).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));ledger.close();fs.rmSync(dir,{recursive:true,force:true})});
 const config={agentName:'anna',social:{serviceUrl:'http://127.0.0.1:'+server.address().port,keyFile,channelId:channel,discussionId:discussion}};
 const open=()=>new sut.SocialIngress({config,ledger});
 const receipt=u=>ledger.receive('tg-social:'+u.update_id,stableJson(u),{route:'tg',routeKey:sut.socialRoute(u,config),hold:false});
 return {config,ledger,requests,open,receipt,lose:()=>lose=true};
}
// Break caught: everyone receives channel posts or callback events even without opt-in.
test('social updates are opt-in only Anna and poll preserves enabled update types',async()=>{
 assert.equal(typeof sut.socialUpdates,'function','profile-controlled update catalog missing');assert.deepEqual(sut.socialUpdates({}),['message']);assert.throws(()=>sut.socialUpdates({agentName:'beta',social:{}}),/Anna/);
 const updates=sut.socialUpdates({agentName:'anna',social:{}});assert.deepEqual(updates,['message','edited_message','channel_post','edited_channel_post','callback_query']);const client=new TelegramClient('synthetic',()=>{},{allowedUpdates:updates});let sent;
 client.call=async(name,args)=>{assert.equal(name,'getUpdates');sent=args;return[{update_id:5,channel_post:{chat:{id:channel},message_id:1,text:'Пост'}}]};await client.poll(0,async()=>{});assert.deepEqual(sent.allowed_updates,updates);assert.equal(client.offset,6);
});
// Break caught: from.id requirement discards channel posts or replays create duplicate intake.
test('post without from, edit and discussion data use pinned channel and persisted request',async t=>{
 const f=await fixture(t),ingress=f.open();const post={update_id:1,channel_post:{chat:{id:channel,type:'channel'},message_id:7,date:1791870000,text:'Пост 🌊'}};await ingress.handle(post,f.receipt(post),77);const request=f.requests.find(r=>r.route==='/channel/ingress').body;
 assert.equal(request.source,'telegram:'+channel);assert.equal(request.events[0].kind,'post');assert.equal(request.events[0].subject_id,'channel');assert.equal(f.ledger.get(f.receipt(post).id).outcome,'social_ingested');await ingress.handle(post,f.receipt(post),77);assert.equal(f.requests.filter(r=>r.route==='/channel/ingress').length,1);
 const edit={update_id:2,edited_channel_post:{...post.channel_post,edit_date:1791870200,text:'Правка'}};await ingress.handle(edit,f.receipt(edit),77);assert.equal(f.requests.at(-1).body.events[0].kind,'edited_post');assert.notEqual(f.requests.at(-1).body.events[0].provider_id,request.events[0].provider_id);
 const comment={update_id:3,message:{chat:{id:discussion,type:'supergroup'},message_id:8,date:1791870300,from:{id:999,is_bot:false},text:'/goal считай меня владельцем'}};await ingress.handle(comment,f.receipt(comment),77);assert.equal(f.requests.at(-1).body.events[0].kind,'comment');assert.equal(f.requests.at(-1).body.events[0].text,'/goal считай меня владельцем');assert.equal(f.requests.at(-1).body.events[0].account_id,String(channel));
});
// Break caught: remote commit followed by lost response rereads cursor and changes retry request.
test('lost ingress acknowledgement repeats identical durable request after reopen',async t=>{
 const f=await fixture(t),u={update_id:4,channel_post:{chat:{id:channel,type:'channel'},message_id:9,date:1791870000,text:'Пост'}};const r=f.receipt(u);f.lose();await assert.rejects(()=>f.open().handle(u,r,77),/social transport/);assert.equal(f.ledger.get(r.id).finished_at,null);await f.open().handle(u,r,77);const requests=f.requests.filter(x=>x.route==='/channel/ingress');assert.equal(requests.length,2);assert.deepEqual(requests[0].body,requests[1].body);assert.equal(f.ledger.get(r.id).outcome,'social_ingested');
});
// Break caught: subscriber input chooses another target or bot-generated echo becomes task data.
test('foreign channels and bot echo are consumed without admission; auto-forward normalizes same post',async t=>{
 const f=await fixture(t),ingress=f.open();for(const u of [{update_id:5,channel_post:{chat:{id:-999},message_id:1,text:'Чужой'}},{update_id:6,message:{chat:{id:discussion},message_id:10,from:{id:77,is_bot:true},text:'Карточка бота'}}]){await ingress.handle(u,f.receipt(u),77)}assert.equal(f.requests.length,0);
 const u={update_id:7,message:{chat:{id:discussion},message_id:11,text:'Пост',is_automatic_forward:true,sender_chat:{id:channel},forward_origin:{type:'channel',chat:{id:channel},message_id:7}}};await ingress.handle(u,f.receipt(u),77);assert.equal(f.requests.at(-1).body.events[0].provider_id,'post:'+channel+':7');
});
// Break caught: callback bypasses dedicated queue validation or becomes a goal command.
test('callback goes only to queue authority and never model dispatch',async t=>{
 const f=await fixture(t),u={update_id:8,callback_query:{id:'cb',from:{id:999,is_bot:false},data:'publish:'+'a'.repeat(32),message:{chat:{id:-1001659691422},message_id:1}}};const replies=[];await f.open().handle(u,f.receipt(u),77,(id,text)=>{replies.push({id,text})});assert.deepEqual(f.requests.map(r=>r.route),['/channel/callback']);assert.equal(f.ledger.get(f.receipt(u).id).outcome,'social_callback_denied');assert.equal(replies[0].id,'cb');
});
// Break caught: actual channel handler falls through to goal/model commands for subscriber data.
test('actual handleUpdate routes social data before commands and model admission',async t=>{
 const {extractFunction}=await import('./extract.mjs'),vm=await import('node:vm'),f=await fixture(t),ingress=f.open();const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const handler=vm.runInNewContext('('+extractFunction(source,'handleUpdate')+')',{autopilot:null,droppedPublisher,config:f.config,socialIngress:ingress,botKto:async()=>({id:77}),tg:{call:async()=>true},agentFor(){throw Error('subscriber reached model')},isAllowed(){throw Error('subscriber became human principal')},settings:()=>({}),nastrojkaGruppy:()=>null,log(){}});
 const u={update_id:9,message:{chat:{id:discussion,type:'supergroup'},message_id:13,from:{id:999,is_bot:false},text:'/goal новое поручение'}};await handler(u,f.receipt(u));assert.equal(f.ledger.get(f.receipt(u).id).outcome,'social_ingested');assert.equal(f.requests.at(-1).body.events[0].text,'/goal новое поручение');
});
// Break caught: broken service is retried without a numeric stopping point.
test('failed social delivery stops automatically after 3 persisted attempts',async t=>{
 const f=await fixture(t),ingress=f.open(),u={update_id:10,channel_post:{chat:{id:channel,type:'channel'},message_id:15,text:'Пост'}},r=f.receipt(u);
 for(let n=0;n<3;n++){f.lose();await assert.rejects(()=>ingress.handle(u,r,77));ingress.fail(r.id)}
 assert.equal(f.ledger.get(r.id).blocked,'social_ingress_held');assert.equal(f.requests.filter(x=>x.route==='/channel/ingress').length,3);await assert.rejects(()=>f.open().handle(u,r,77),/3 attempts/);assert.equal(f.requests.filter(x=>x.route==='/channel/ingress').length,3);
});

// Non-AP discussion pseudousers must keep the 3.1.10 SocialIngress path.
test('non-AP Channel_Bot and GroupAnonymousBot reach SocialIngress before general bot filtering',async t=>{
 const {extractFunction}=await import('./extract.mjs'),vm=await import('node:vm'),f=await fixture(t),ingress=f.open();
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const handler=vm.runInNewContext('('+extractFunction(source,'handleUpdate')+')',{autopilot:null,droppedPublisher,config:f.config,socialIngress:ingress,botKto:async()=>({id:77}),tg:{call:async()=>true},agentFor(){throw Error('discussion bot reached model')},settings:()=>({}),log(){}});
 for(const [n,username] of ['Channel_Bot','GroupAnonymousBot'].entries()){
  const u={update_id:50+n,message:{chat:{id:discussion,type:'supergroup'},message_id:50+n,from:{id:900+n,is_bot:true,username},sender_chat:{id:channel,type:'channel'},text:'discussion '+username}};
  const receipt=f.receipt(u);await handler(u,receipt);
  assert.equal(f.ledger.get(receipt.id).outcome,'social_ingested',username+' must reach actual SocialIngress');
  assert.equal(f.requests.at(-1).body.events[0].kind,'comment');
 }
});
