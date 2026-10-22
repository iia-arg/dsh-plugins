// Real apply/native inbox. Transport is in-process fixture; no network or live agents.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts} from '../src/message-receipts.js';
const {apply}=await import(process.env.AP_CORE_INDEX?pathToFileURL(process.env.AP_CORE_INDEX).href:new URL('../src/index.js',import.meta.url));
const team={master:'Мастер',vintik:'Винтик',shpuntik:'Шпунтик',gayka:'Гайка',sova:'Сова',shurup:'Шуруп',tumbler:'Тумблер'};
const wait=async(fn,label)=>{for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setTimeout(r,20))}assert.fail('timeout '+label)};
for(const [name,alias] of Object.entries(team)){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ap-core-native-'));let p,l;const calls=[],sends=[];let pending=[],presteps=0;
 try{
  const spool=path.join(root,'primary'),a2a=path.join(root,'a2a'),notice=path.join(root,'notice',name),settings=path.join(root,'settings.json');
  for(const dir of [spool,path.join(a2a,'in'),path.join(a2a,'out'),notice])fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(settings,JSON.stringify({deliveryMode:'owner-all',ownerChatId:7,groups:{'-5388098055':{mode:'mention',names:[alias,name],context:20,replyCounts:true}}}));
  globalThis.fetch=async(url,options)=>{
   const method=String(url).split('/').at(-1);let result;
   if(method==='getMe')result={id:8001,username:name+'_fixture_bot',first_name:alias};
   else if(method==='getUpdates'){await new Promise(r=>setTimeout(r,20));result=pending;pending=[]}
   else {if(method==='sendMessage')sends.push(JSON.parse(options.body));result={message_id:900}}
   return {json:async()=>({ok:true,result})};
  };
  p=await podnyatPlatformu02({root:path.join(root,'sessions')});
  p.ctx.provide('agentPresets',{resolve:async()=>({id:'fixture'}),mount:async()=>{}});
  p.ctx.provide('agentDefaultModel',{currentSelection:()=>({provider:'fixture',model:'fixture'})});
  p.ctx.on('agent/pre-step',(args,next)=>{presteps++;return next()});
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  p.ctx.get('llm').stream=async function*(request){calls.push(JSON.stringify(request));yield{type:'text-delta',index:0,text:'fixture answer'};yield{type:'finish',reason:{kind:'stop'}}};
  const config={agentName:name,appDir:process.env.DSH_TEST_APP,token:'fixture-'+name,workspace:root,voiceTempBaseDirectory:path.join(root,'voice'),spoolDir:spool,a2aDir:a2a,allowedUsers:[7,777,778],ownerChatId:7,settingsFile:settings,
   autopilotMail:{noticeDir:notice,trafficChatId:-5388098055,publisherBotIds:[777],names:[alias,name]}};
  apply(p.ctx,config);l=new MessageReceipts(path.join(root,'.message-receipts'),{migrate:false});
  const msg=(id,text,from)=>({update_id:id,message:{message_id:id,from,chat:{id:-5388098055,type:'group'},text}});
  pending=[msg(1,Object.values(team).join(' ')+' COPY_MARKER',{id:777,is_bot:false}),msg(2,Object.values(team).join(' '),{id:778,is_bot:true}),msg(3,'UNADDRESSED_CONTEXT_MARKER',{id:7,is_bot:false}),msg(4,'/cs',{id:7,is_bot:false})];
  await wait(()=>l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='tg' AND finished_at IS NOT NULL").get().n===4,'four received Telegram controls');
  assert.equal(calls.length,0,name+': copies and unaddressed text must not start a model turn');
  assert.equal(presteps,0,name+': no pre-step from copies or unaddressed text');
  assert.equal(l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='tg' AND message_json IS NULL AND dsh_id IS NULL AND claimed_turn IS NULL").get().n,4,'none of four controls reached native admission/claim');
  assert.equal(sends.length,0,name+': copies/broadcast do not cause replies');
  pending=[msg(5,'Винтик, HUMAN_MARKER',{id:7,is_bot:false})];
  await wait(()=>l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='tg' AND finished_at IS NOT NULL").get().n===5,'human named input');
  assert.equal(calls.length,name==='vintik'?1:0,name+': only Vintik responds to Винтик');
  assert(!calls.some(x=>x.includes('COPY_MARKER')||x.includes('UNADDRESSED_CONTEXT_MARKER')),'no deferred copied/human background');
  pending=[msg(6,'@'+name+'_fixture_bot NICK_MARKER',{id:7,is_bot:false})];
  await wait(()=>l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='tg' AND finished_at IS NOT NULL").get().n===6,'own @nick');
  assert.equal(calls.length,(name==='vintik'?1:0)+1,'own @nick makes one turn');
  assert(!calls.some(x=>x.includes('COPY_MARKER')||x.includes('UNADDRESSED_CONTEXT_MARKER')),'no copied/deferred background after own @nick');
  await wait(()=>l.db.prepare("SELECT COUNT(*) n FROM outbox WHERE sent_at IS NULL").get().n===0,'previous Telegram responses delivered before AP measurement');
  const before=calls.length,sendBefore=sends.length;
  const id='a'.repeat(64),filename='20261015T000000Z-'+name+'-'+BigInt('0x'+id)+'.txt';
  const noticeText='[delivery-v1 id='+id+' reply=no]\nAUTOPILOT-PILOT NOTICE ONLY\nMessage id: '+id+'\n';
  fs.writeFileSync(path.join(notice,filename),noticeText,{mode:0o600});
  await wait(()=>l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='ap-notice' AND finished_at IS NOT NULL").get().n===1,'AP notice native turn');
  assert.equal(calls.length,before+1,name+': AP notice makes exactly one separate turn');
  const row=l.db.prepare("SELECT * FROM receipts WHERE route='ap-notice'").get();assert.equal(row.route_key,'autopilot-team');assert.equal(row.expects_reply,0);assert.ok(row.flushed_at);
  assert.equal(l.db.prepare("SELECT COUNT(*) n FROM outbox WHERE receipt_id=?").get(row.id).n,0,'no legacy copies or primary AP response');
  assert.equal(sends.length,sendBefore,'AP route must not send to Telegram');
  fs.writeFileSync(path.join(notice,filename),noticeText,{mode:0o600});
  fs.writeFileSync(path.join(spool,'20261015T000001Z-coders-123.txt'),'PRIMARY_MARKER',{mode:0o600});
  await new Promise(r=>setTimeout(r,250));
  await wait(()=>name!=='master'||l.db.prepare("SELECT COUNT(*) n FROM receipts WHERE route='a2a' AND finished_at IS NOT NULL").get().n===1,'Master primary still works');
  assert.equal(calls.length,before+1+(name==='master'?1:0),'duplicate notice never reruns; only Master accepts primary');
  assert.equal(fs.existsSync(path.join(spool,'20261015T000001Z-coders-123.txt')),name!=='master');
  assert.equal(l.db.prepare("SELECT COUNT(*) n FROM outbox WHERE receipt_id=?").get(row.id).n,0,'AP result still has no legacy copies after subsequent ticks');
  console.log('PASS',name,'bot updates=2; human name turns='+Number(name==='vintik')+'; AP turns=1; primary='+Number(name==='master'));
 }finally{await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}
}

// No live work remains; dispose the test process's platform background timers.
process.exit(0);
