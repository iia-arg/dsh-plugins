// Actual TG apply + native DSH session/event; model and network are fixture transports.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {apply} from '../src/index.js';import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts} from '../src/message-receipts.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-turn-native-'));let p,ledger,calls=0;const sent=[],captured=[];
async function wait(fn,label){for(let n=0;n<500;n++){if(fn())return;await new Promise(r=>setTimeout(r,20))}assert.fail('timeout '+label)}
try{
 const spool=path.join(root,'primary'),a2a=path.join(root,'a2a'),notice=path.join(root,'notice','master');
 for(const dir of [spool,path.join(a2a,'in'),path.join(a2a,'out'),notice])fs.mkdirSync(dir,{recursive:true,mode:0o700});
 globalThis.fetch=async(url,options)=>{
  const method=String(url).split('/').at(-1);let result;
  if(method==='getMe')result={id:8001,username:'master_fixture_bot',first_name:'Мастер'};
  else if(method==='getUpdates'){await new Promise(r=>setTimeout(r,20));result=[]}
  else{if(method==='sendMessage')sent.push(JSON.parse(options.body));result={message_id:900}}
  return {json:async()=>({ok:true,result})};
 };
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});
 p.ctx.provide('agentPresets',{resolve:async()=>({id:'fixture'}),mount:async()=>{}});
 p.ctx.provide('agentDefaultModel',{currentSelection:()=>({provider:'claude-oauth',model:'claude-fixture'})});
 p.ctx.on('agent/request',()=>({provider:'claude-oauth',model:'claude-fixture'}));
 p.ctx.get('llm').stream=async function*(){calls++;yield{type:'text-delta',index:0,text:'PRIVATE CLAUDE ANSWER'};yield{type:'usage',usage:{inputTokens:40,cacheReadTokens:10,cacheWriteTokens:5,outputTokens:7,reasoningTokens:3}};yield{type:'finish',reason:{kind:'stop'}}};
 const config={agentName:'master',appDir:process.env.DSH_TEST_APP,token:'fixture-master-claude',workspace:root,voiceTempBaseDirectory:path.join(root,'voice'),spoolDir:spool,a2aDir:a2a,allowedUsers:[7],ownerChatId:7,
  autopilotMail:{noticeDir:notice,trafficChatId:-5388098055,publisherBotIds:[777],names:['master','Мастер']}};
 p.ctx.on('session/event',(session,event)=>{if(['turn/start','assistant/message','turn/end'].includes(event.type))captured.push({session,event})});
 apply(p.ctx,config);
 // Supported repeat mount: scoped services, one token poller, both event hooks.
 apply(p.ctx.isolate('conversationPause').isolate('conversationSessions').isolate('spoolConversation').isolate('taskControlCodex'),config);
 ledger=new MessageReceipts(path.join(root,'.message-receipts'),{migrate:false});
 const file=path.join(root,'.message-receipts','ap-usage-hodov-v1.jsonl');
 const id='a'.repeat(64),filename='20261021T000000Z-master-'+BigInt('0x'+id)+'.txt';
 fs.writeFileSync(path.join(notice,filename),'[delivery-v1 id='+id+' reply=no]\nAUTOPILOT-PILOT NOTICE ONLY\nMessage id: '+id+'\n',{mode:0o600});
 await wait(()=>ledger.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='ap-notice' AND finished_at IS NOT NULL").get().n===1,'AP turn finished');
 assert.equal(calls,1);assert.equal(sent.length,0,'AP completion must keep early-return routing');
 assert.ok(fs.existsSync(file),'native Claude AP end lost before early AP-return');
 let rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,1);
 assert.deepEqual([rows[0].input,rows[0].cached,rows[0].cache_write,rows[0].output,rows[0].vyzovov],[55,10,5,7,1]);
 assert.equal(rows[0].participant,os.userInfo().username);assert.equal(rows[0].engine,'claude');assert.equal(rows[0].status,'completed');assert.equal(rows[0].polnota,'parent_only');
 const ap=ledger.db.prepare("SELECT * FROM receipts WHERE route='ap-notice'").get();assert.equal(rows[0].sessionId,ap.session_id);assert.equal(rows[0].sessionCreated,ap.session_created);assert.equal(rows[0].turn,ap.claimed_turn);
 fs.writeFileSync(path.join(spool,'20261021T000001Z-coders-123.txt'),'PRIMARY FIXTURE',{mode:0o600});
 await wait(()=>ledger.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='a2a' AND finished_at IS NOT NULL").get().n===1,'ordinary primary turn finished');
 assert.equal(calls,2);rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,2,'ordinary route must also emit exactly one end');
 assert.ok(rows.every(r=>r.input===55&&r.output===7));assert.ok(!fs.readFileSync(file,'utf8').includes('PRIVATE CLAUDE ANSWER'));
 const completed=captured.slice();assert.equal(completed.filter(x=>x.event.type==='turn/end').length,2);
 // Retry actual callback values, never append to a native session or rerun the model/domain job.
 for(let retry=0;retry<3;retry++)for(const {session,event} of completed)p.ctx.emit('session/event',session,event);
 assert.equal(calls,2,'callback retry must not run another model call');
 rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,2,'callback replay counted native ends twice');
 assert.equal(path.dirname(file),ledger.root);assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(fs.statSync(file).uid,process.getuid());
 console.log('PASS actual TG/native Claude AP-return and primary, two mounts: 2 turns + 3 callback replays -> 2 end rows; no model/network');
}finally{await p?.ctx.fiber.dispose();ledger?.close();fs.rmSync(root,{recursive:true,force:true})}
process.exit(0);
