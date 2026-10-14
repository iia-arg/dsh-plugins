// Production router -> NDJSON adapter -> durable scoped reader -> native terminal. SDK is a local fixture.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {generateKeyPairSync} from 'node:crypto';
import {podnyatPlatformu02} from './platforma-02.mjs';import {MessageReceipts,sobytiyaSessii} from '../src/message-receipts.js';
import {ConversationPause} from '../src/conversation-pause.js';import {CodexTaskControl} from '../src/codex-task-control.js';import {MailStopReceiver} from '../src/mail-stop-receiver.js';import {signCoordinator} from '../src/coordinator-signature.js';
import {gatewayDir,adapterDir,iz} from './sosedi.mjs';
const {apply}=await iz(adapterDir(),'src/index.js');const {TaskControlRouter}=await iz(gatewayDir(),'task-control.mjs');
for(const outcome of ['terminal','transport-close']){
const root=fs.mkdtempSync(path.join(os.tmpdir(),'stop-sdk-http-'));let p,l,server,agent;
try{
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const pause=new ConversationPause(l,root,()=>{}),remote=new CodexTaskControl(l,'fixture');
 p.ctx.provide('taskControlCodex',remote);const router=new TaskControlRouter();let registrations=0,stops=0,terminalFrames=0;
 const engine={thread_id:'fixture-sdk-thread',turn_id:'fixture-sdk-turn'};
 server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.end(JSON.stringify({ok:true,conversationIdentity:2,postavshchik:'openai',mailStopTerminal:1}));return;}
  let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);
  if(req.url==='/v1/task-control'){const reply=await router.dispatch(req.headers.authorization.slice(7),body);res.end(JSON.stringify(reply));return;}
  assert(body.taskControl.terminal===1);res.writeHead(200,{'content-type':'application/x-ndjson'});
  const register=router.forResponse(body.taskControl,res,(binding,codex,request_id)=>res.write(JSON.stringify({type:'task-status',state:'ready',binding,codex:{...codex,generation:router.generation},request_id})+'\n'),(binding,codex,request_id)=>{terminalFrames++;res.write(JSON.stringify({type:'task-status',state:'terminal',binding,codex,request_id})+'\n')});
  register(async packet=>{assert.equal(packet.op,'stop-exact');stops++;assert.equal(packet.binding.sdk_turn_id,'fixture-sdk-turn');if(outcome==='terminal'){register.terminal({...engine,status:'interrupted',proof:'fixture-sdk-result'});res.end('{"type":"done"}\n')}else res.destroy();return{accepted:true,operation:packet.op,codex:engine}},engine);registrations++;
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ingress=path.join(root,'key');fs.writeFileSync(ingress,'a'.repeat(64),{mode:0o600});apply(p.ctx,{baseURL:'http://127.0.0.1:'+server.address().port,ingressKeyFile:ingress,models:[{id:'gpt-fixture',contextWindow:100000}]});
 const keys=generateKeyPairSync('ed25519'),trust={version:1,status:'approved',maxLifetimeMs:900000,clockSkewMs:30000,keys:{coord:keys.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['pause']}},returnRoutes:{coord:{recipient:'zabavy',ledger_uuid:'reply-ledger',directory:root}}};
 // Отметка прибытия — при первом взгляде на письмо и неподвижна (как readStopArrival в бою). Прежде Date.now() при каждом чтении: повторная
 // проверка приёмника читает now раньше getArrival — смена миллисекунды давала denied/delivery_observation_invalid (падение ворот 3.1.2, 11.10).
 // Arrival is stamped at the first look and never moves (as readStopArrival in production); a per-read Date.now() made the recheck flaky.
 const prihod=new Map();
 const receiver=new MailStopReceiver({ledger:l,pause,recipient:'fixture',remote,getTrust:()=>trust,getArrival:(_file,raw)=>{const k=Buffer.from(raw??'').toString('base64');if(!prihod.has(k))prihod.set(k,{delivered_at:Date.now(),event_id:'fixture-arrival'});return prihod.get(k);},resolveTarget:()=>agent,signStatus:s=>Buffer.from(JSON.stringify(s)),publishStatus:()=>{}});remote.mailControls=receiver;
 const handle=await p.agents.create({sessionId:'sdk-http',agentOptions:{provider:'claude-oauth',model:'gpt-fixture'},meta:{cwd:root}});agent=handle.agent;pause.attach(agent);p.ctx.on('agent/request',()=>({provider:'claude-oauth',model:'gpt-fixture'}));
 agent.followup(p.llm.createUserMessage({content:[{type:'text',text:'FIRST'}]}));
 let capture;for(let i=0;i<300&&!capture;i++){await new Promise(r=>setTimeout(r,10));capture=remote.capture(agent)}
 assert(capture,'real adapter must publish scoped task-ready before stop');assert.equal(registrations,1);
 const now=Date.now(),id='http-stop';const wire=signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient:'fixture',ledger_uuid:l.protocolIdentity(),mode:'pause',selector:{kind:'primary-a2a'}})+'\n'),{action:'stop',key_id:'coord',delivery_id:id,recipient:'fixture',ledger_uuid:l.protocolIdentity(),issued_at:now,expires_at:now+120000},keys.privateKey);
 const result=await receiver.handle(wire,{sourceKey:'http-stop'});assert.equal(result.state,outcome==='terminal'?'paused':'unknown',JSON.stringify(result));assert.equal(stops,1);assert.equal(terminalFrames,outcome==='terminal'?1:0);assert.equal(receiver.store.row(id).sdk_terminal,outcome==='terminal'?1:0);assert.equal(receiver.store.row(id).native_terminal,outcome==='terminal'?1:0);if(outcome!=='terminal')assert.equal(receiver.store.active(agent.session.header).state,'unknown');assert.equal(pause.state(agent.session.header).state,'paused');assert(sobytiyaSessii(agent.session).some(e=>e.type==='turn/end'));
 console.log(outcome,'PASS router HTTP exact stop -> adapter terminal NDJSON -> durable SDK reader -> native terminal; ACK alone unused');
}finally{agent?.cancel({kind:'disposed'},{keepInbox:true});server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}

}
