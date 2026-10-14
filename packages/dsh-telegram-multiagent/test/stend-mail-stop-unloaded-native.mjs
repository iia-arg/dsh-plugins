// B-N-1596: a primary a2a conversation saved on disk but not loaded in this process (agent restarted, no a2a letter since) is idle,
// not absent: pause/replace must reach complete; a conversation never created must be refused as target_none/no_live_agent without creating one.
// B-N-1595: with deliveryMode owner-all the stop outcome is copied to the owner unless mailStopOwnerCopies is false.
// B-N-1596 r2 (live spartak 01:45Z): a remote (claude-oauth) agent whose last turn completed in an earlier process has no SDK telemetry
// row; replace must still complete. If that last turn was aborted, absence is unproved: refused before any fence or pause.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,sobytiyaSessii} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {observeStopArrivals,readStopArrival} from '../src/mail-stop-arrival.js';
import {signCoordinator} from '../src/coordinator-signature.js';import {verifyStopStatus} from '../src/mail-stop-protocol.js';
const {apply}=await import(process.env.MAIL_STOP_INDEX?pathToFileURL(process.env.MAIL_STOP_INDEX).href:new URL('../src/index.js',import.meta.url));
if(process.getuid()!==0){console.log('СЛЕПОТА: native signed ingress needs protected fixture config');process.exit(2)}
const fetchBefore=globalThis.fetch;
globalThis.fetch=async url=>{await new Promise(r=>setTimeout(r,20));return{json:async()=>({ok:true,result:String(url).endsWith('/getMe')?{id:7001,username:'fixture_bot'}:[]})}};
for(const mode of ['pause','replace','never-created','pause-copies-off','replace-remote','replace-remote-aborted']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-unloaded-'));const baseDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-unloaded-voice-'));let p,l,observer;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'platform')});
  const coord=generateKeyPairSync('ed25519'),status=generateKeyPairSync('ed25519'),pub=k=>k.publicKey.export({type:'spki',format:'pem'});
  const spool=path.join(root,'fixture'),a2a=path.join(root,'a2a'),inbox=path.join(a2a,'in'),out=path.join(root,'return'),records=path.join(root,'arrivals');for(const dir of [spool,inbox,out,records])fs.mkdirSync(dir,{recursive:true});
  l=new MessageReceipts(path.join(root,'.message-receipts'));const identity=l.protocolIdentity();
  const remote=mode.startsWith('replace-remote'),provider=remote?'claude-oauth':'fixture';let modelCalls=0,gateFirst=false,entered;
  p.ctx.on('agent/request',()=>({provider,model:'fixture'}));
  p.ctx.on('agent/pre-step',async(args,next)=>{if(gateFirst){gateFirst=false;entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted()}return next();});
  // The resume path waits for these platform services; production provides them, the fixture platform does not.
  p.ctx.provide('agentPresets',{resolve:async()=>({id:'fixture-preset'}),mount:async()=>{}});p.ctx.provide('agentDefaultModel',{currentSelection:()=>({provider,model:'fixture'})});
  p.ctx.get('llm').stream=async function*(){modelCalls++;yield{type:'text-delta',index:0,text:'replacement answer'};yield{type:'finish',reason:{kind:'stop'}}};
  if(mode!=='never-created'){
   // An earlier process created and pinned the conversation; this process has not loaded it.
   const h=await p.agents.create({sessionId:'telegram-a2a',agentOptions:{provider,model:'fixture'},meta:{cwd:root}});
   if(remote){const message=p.llm.createUserMessage({content:[{type:'text',text:'earlier turn'}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
    h.agent.followup(message);await h.agent.whenIdle();
    if(mode==='replace-remote-aborted'){const gate=new Promise(r=>entered=r);gateFirst=true;h.agent.followup(p.llm.createUserMessage({content:[{type:'text',text:'aborted turn'}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}}));await gate;h.agent.cancel({kind:'user'},{keepInbox:false});await h.agent.whenIdle();}
    const last=sobytiyaSessii(h.agent.session).findLast(e=>e.type==='turn/end');assert.equal(last?.data?.reason?.kind,mode==='replace-remote'?'completed':'aborted','fixture: last turn of the earlier process');
    assert.equal(h.agent.session.requestHeader?.()?.config?.provider,'claude-oauth','fixture: the session is remote like spartak');}
   await p.sessions.flush(h.agent.session);
   new ConversationSessions(l,()=>{}).pin('a2a',h.agent.session.header);await h.dispose();
  }
  modelCalls=0;
  l.close();l=null;
  assert.equal(p.agents.get('telegram-a2a'),undefined,'fixture: the conversation is not loaded before the stop');
  const keyfile=path.join(root,'status.pem'),trustfile=path.join(root,'trust.json'),settings=path.join(root,'stop.json'),tgSettings=path.join(root,'telegram.json');
  fs.writeFileSync(tgSettings,JSON.stringify({deliveryMode:'owner-all',ownerChatId:7,...(mode==='pause-copies-off'?{mailStopOwnerCopies:false}:{})}));
  fs.writeFileSync(keyfile,status.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  fs.writeFileSync(settings,JSON.stringify({version:1,recipient:'fixture',status_key_id:'fixture-status',status_key_file:keyfile,arrival_root:records}));
  fs.writeFileSync(trustfile,JSON.stringify({version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:pub(coord)},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'zabavy',ledger_uuid:'reply-ledger',directory:out}}}));
  apply(p.ctx,{appDir:process.env.DSH_TEST_APP,token:'fixture-only',workspace:root,voiceTempBaseDirectory:baseDirectory,spoolDir:spool,a2aDir:a2a,allowedUsers:[7],ownerChatId:7,coordinatorTrustFile:trustfile,mailStopConfigFile:settings,settingsFile:tgSettings});
  observer=observeStopArrivals({root:records,mailboxes:[{recipient:'fixture',directory:inbox}]});
  const wireMode=mode.startsWith('replace')?'replace':'pause',now=Date.now(),id='unloaded-'+mode,raw=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient:'fixture',ledger_uuid:identity,mode:wireMode,selector:{kind:'primary-a2a'}})+'\n'+(wireMode==='replace'?'NEW TASK':'')),{action:'stop',delivery_id:id,key_id:'coord',recipient:'fixture',ledger_uuid:identity,issued_at:now,expires_at:now+120000},coord.privateKey);
  const file=path.join(inbox,'stop.txt');fs.writeFileSync(file+'.part',raw);fs.renameSync(file+'.part',file);
  let arrival;for(let i=0;i<100&&!arrival;i++){await new Promise(r=>setTimeout(r,10));arrival=readStopArrival(records,file,raw,'fixture')}
  l=new MessageReceipts(path.join(root,'.message-receipts'),{migrate:false});
  const want=mode==='replace'||mode==='replace-remote'?3:2,read=()=>fs.readdirSync(out).map(n=>verifyStopStatus(fs.readFileSync(path.join(out,n)),{receivers:{'fixture-status':'fixture'},keys:{'fixture-status':pub(status)},recipient:'zabavy',ledger:'reply-ledger'}));
  let statuses=[];for(let i=0;i<500;i++){await new Promise(r=>setTimeout(r,20));statuses=read();if(statuses.length>=want&&(!['replace','replace-remote'].includes(mode)||statuses.some(s=>s.status?.state==='complete')))break;}
  assert(statuses.every(v=>v.verified),'every status passes the reader');const states=statuses.map(v=>v.status.state+'/'+v.status.reason).sort();
  const row=l.db.prepare('SELECT * FROM mail_stop_controls WHERE control_id=?').get(id);
  if(mode==='replace-remote-aborted'){
   assert.deepEqual(states,['denied/remote_absence_unproved','received/authenticated'],'unproved remote absence is a refusal');
   assert.equal(row,undefined,'no fence is left behind');const agent=p.agents.get('telegram-a2a');
   assert.equal(p.ctx.get('conversationPause').state(agent.session.header),null,'no pause is left behind');assert.equal(modelCalls,0);
  }else if(mode==='never-created'){
   assert.equal(row,undefined,'refused control never fences a session');
   const denied=statuses.find(v=>v.status.state==='denied');assert.equal(denied?.status.reason,'target_none');assert.equal(denied.status.target_cause,'no_live_agent');
   assert.equal(p.agents.get('telegram-a2a'),undefined,'a stop never creates a conversation');
  }else{
   const agent=p.agents.get('telegram-a2a');assert(agent,'the stop resumed the saved conversation');
   assert.equal(row?.state,'complete','an unloaded idle conversation reaches complete');
   if(!mode.startsWith('replace')){assert.deepEqual(states,['paused/idle_existing_session','received/authenticated']);assert.equal(p.ctx.get('conversationPause').state(agent.session.header)?.state,'paused');assert.equal(modelCalls,0);
    let copy;for(let i=0;i<150&&!copy;i++){await new Promise(r=>setTimeout(r,20));copy=l.db.prepare('SELECT id FROM outbox WHERE id=?').get(row.receipt_id+':copy:answer');}
    const off=!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='owner_copy_disabled'").get(row.receipt_id);
    if(mode==='pause')assert(copy&&!off,'owner-all copies the stop outcome by default');else assert(!copy&&off,'mailStopOwnerCopies=false: no owner copy of the stop outcome');}
   else{await agent.whenIdle();assert.equal(modelCalls,1);assert(sobytiyaSessii(agent.session).some(e=>e.type==='user/message'&&e.data.content?.some(b=>b.text==='NEW TASK')));
    assert.deepEqual(states,['complete/replacement_admitted','received/authenticated','replacement_queued/terminal_confirmed'],'signed final status complete for replace');}
  }
  console.log('PASS unloaded',mode,'statuses',states.join(' '),'model calls',modelCalls);
 }finally{observer?.close();await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(baseDirectory,{recursive:true,force:true})}
}
// The disposable test process keeps transport stubbed until every background poll has exited.
