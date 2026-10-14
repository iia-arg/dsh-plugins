// Removing control ingress must leave the real active native turn uncancelled.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,sobytiyaSessii} from '../src/message-receipts.js';
import {observeStopArrivals,readStopArrival} from '../src/mail-stop-arrival.js';
import {signCoordinator} from '../src/coordinator-signature.js';import {verifyStopStatus} from '../src/mail-stop-protocol.js';
const {apply}=await import(process.env.MAIL_STOP_INDEX?pathToFileURL(process.env.MAIL_STOP_INDEX).href:new URL('../src/index.js',import.meta.url));
if(process.getuid()!==0){console.log('СЛЕПОТА: native signed ingress needs protected fixture config');process.exit(2)}
const fetchBefore=globalThis.fetch;
globalThis.fetch=async url=>{await new Promise(r=>setTimeout(r,20));return{json:async()=>({ok:true,result:String(url).endsWith('/getMe')?{id:7001,username:'fixture_bot'}:[]})}};
for(const mode of ['pause','replace']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-native-'));const baseDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'mail-stop-native-voice-'));let p,l,observer,agent;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'platform')});
  const coord=generateKeyPairSync('ed25519'),status=generateKeyPairSync('ed25519'),pub=k=>k.publicKey.export({type:'spki',format:'pem'});
  const spool=path.join(root,'fixture'),a2a=path.join(root,'a2a'),inbox=path.join(a2a,'in'),out=path.join(root,'return'),records=path.join(root,'arrivals');for(const dir of [spool,inbox,out,records])fs.mkdirSync(dir,{recursive:true});
  l=new MessageReceipts(path.join(root,'.message-receipts'));const identity=l.protocolIdentity();l.close();l=null;
  const keyfile=path.join(root,'status.pem'),trustfile=path.join(root,'trust.json'),settings=path.join(root,'stop.json');
  fs.writeFileSync(keyfile,status.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  fs.writeFileSync(settings,JSON.stringify({version:1,recipient:'fixture',status_key_id:'fixture-status',status_key_file:keyfile,arrival_root:records}));
  fs.writeFileSync(trustfile,JSON.stringify({version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:pub(coord)},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause','replace']}},returnRoutes:{coord:{recipient:'zabavy',ledger_uuid:'reply-ledger',directory:out}}}));
  let entered,steps=0;const gate=new Promise(r=>entered=r);let modelCalls=0;
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  p.ctx.on('agent/pre-step',async(args,next)=>{steps++;if(steps===1){entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));args.signal.throwIfAborted()}return next();});
  p.ctx.get('llm').stream=async function*(){modelCalls++;yield{type:'text-delta',index:0,text:'replacement answer'};yield{type:'finish',reason:{kind:'stop'}}};
  const h=await p.agents.create({sessionId:'telegram-a2a',agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}});agent=h.agent;
  apply(p.ctx,{appDir:process.env.DSH_TEST_APP,token:'fixture-only',workspace:root,voiceTempBaseDirectory:baseDirectory,spoolDir:spool,a2aDir:a2a,allowedUsers:[7],ownerChatId:7,coordinatorTrustFile:trustfile,mailStopConfigFile:settings});
  const message=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
  agent.followup(message('OLD RUNNING'));await gate;agent.send(message('OLD BACKLOG'),'next-turn',false);
  observer=observeStopArrivals({root:records,mailboxes:[{recipient:'fixture',directory:inbox}]});
  const now=Date.now(),id='native-'+mode,raw=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient:'fixture',ledger_uuid:identity,mode,selector:{kind:'primary-a2a'}})+'\n'+(mode==='replace'?'NEW TASK':'')),{action:'stop',delivery_id:id,key_id:'coord',recipient:'fixture',ledger_uuid:identity,issued_at:now,expires_at:now+120000},coord.privateKey);
  const file=path.join(inbox,'stop.txt');fs.writeFileSync(file+'.part',raw);fs.renameSync(file+'.part',file);
  let arrival;for(let i=0;i<100&&!arrival;i++){await new Promise(r=>setTimeout(r,10));arrival=readStopArrival(records,file,raw,'fixture')}
  assert(arrival||fs.readdirSync(records).length>0,'observer must retain an arrival fact even after source archive');l=new MessageReceipts(path.join(root,'.message-receipts'),{migrate:false});
  let row;for(let i=0;i<500;i++){await new Promise(r=>setTimeout(r,20));row=l.db.prepare('SELECT * FROM mail_stop_controls WHERE control_id=?').get(id);if(row?.state==='complete')break;}
  assert.equal(row?.state,'complete','signed mailbox control must reach dispatcher and real native terminal');
  assert(sobytiyaSessii(agent.session).some(e=>e.type==='turn/end'&&e.data.reason?.kind==='aborted'));
  assert(agent.inbox.nextTurn.some(m=>m.content?.some(b=>b.text==='OLD BACKLOG')),'old queued input retained');
  if(mode==='pause'){assert.equal(p.ctx.get('conversationPause').state(agent.session.header)?.state,'paused');assert.equal(modelCalls,0)}
  else{await agent.whenIdle();assert.equal(modelCalls,1);assert(sobytiyaSessii(agent.session).some(e=>e.type==='user/message'&&e.data.content?.some(b=>b.text==='NEW TASK')))}
  let statusFiles=[];for(let i=0;i<200;i++){statusFiles=fs.readdirSync(out);if(statusFiles.length>=2)break;await new Promise(r=>setTimeout(r,20))}
  assert(statusFiles.length>=2,'signed statuses must pass the actual outbox reader');
  const checked=statusFiles.map(n=>verifyStopStatus(fs.readFileSync(path.join(out,n)),{receivers:{'fixture-status':'fixture'},keys:{'fixture-status':pub(status)},recipient:'zabavy',ledger:'reply-ledger'}));assert(checked.every(v=>v.verified));
  console.log('PASS native ingress',mode,'state',row.state,'model calls',modelCalls,'signed statuses',statusFiles.length);
 }finally{observer?.close();agent?.cancel({kind:'disposed'},{keepInbox:true});await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(baseDirectory,{recursive:true,force:true})}
}
// The disposable test process keeps transport stubbed until every background poll has exited.
