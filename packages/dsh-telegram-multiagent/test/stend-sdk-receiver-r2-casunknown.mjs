import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {SdkInbox} from '../src/sdk-inbox.js';
import {CodexTaskControl} from '../src/codex-task-control.js';
import {gatewayDir,adapterDir,iz} from './sosedi.mjs';
const {apply:applyAdapter}=await iz(adapterDir(),'src/index.js');
const {TaskControlRouter}=await iz(gatewayDir(),'task-control.mjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta-inbox-wire-'));let p,l,inputs,server,streamRes,leaseClose;const controls=new TaskControlRouter();let entered;const ready=new Promise(r=>entered=r);let sent=0;
try{
 server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,conversationIdentity:2,inputDelivery:1,postavshchik:'openai'}));return}
  if(req.url==='/v1/task-control'){await controls.handle(req,res);return}
  const chunks=[];for await(const b of req)chunks.push(b);const request=JSON.parse(Buffer.concat(chunks));res.setHeader('content-type','application/x-ndjson');streamRes=res;
  const send=o=>res.write(JSON.stringify(o)+'\n');const register=controls.forResponse(request.taskControl,res,(binding,codex,request_id)=>send({type:'input-status',state:'ready',binding,codex,request_id}));
  leaseClose=register(async packet=>{sent++;send({type:'input-status',state:'offered',binding:packet.binding,method:'codex-steer',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}});return{accepted:true,input_state:'offered',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'},model_response:'unknown'}},{thread_id:'fixture-thread',turn_id:'fixture-turn'});res.flushHeaders();entered();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const baseURL='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(root,'ingress'),crypto.randomBytes(32).toString('hex'),{mode:0o600});
 p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));
 const h=await p.agents.create({sessionId:'fixture-wire',agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}}),a=h.agent;
 const control=new CodexTaskControl(l,'fixture');inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);inputs.dopusk=()=>true;/* стенд механизма живого ввода: допуск выдан явно — B-N-1600 шаг 0 закрыл его для писем без метки, этап 1 выдаст его метке refines */control.sdkInputs=inputs;const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);
 const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.sdkInputs=inputs;runtime.conversationPause=pauses;
 const originalFlush=p.sessions.flush.bind(p.sessions);p.sessions.flush=async session=>{const row=[...l.pending()].map(x=>inputs.row(x.id)).find(x=>x?.state==='offered');if(row){inputs.unknown(row.receipt_id,'injected_concurrent_unknown');assert.equal(control.requests.size,1);assert.equal(inputs.row(row.receipt_id).state,'unknown');console.log('INJECT '+'casunknown'+' row unknown during flush');}return originalFlush(session);};
 let adapter;const adapterCtx={get:n=>n==='agents'?{currentInitiator:()=>a}:n==='taskControlCodex'?control:n==='newConversationRestore'?{version:1}:undefined,provide(){},effect(){},llm:{registerAdapter(_ids,value){adapter=value;const close=()=>{};close.replace=()=>{};return close}}};applyAdapter(adapterCtx,{baseURL,ingressKeyFile:path.join(root,'ingress')});adapter.conversationFor=()=>({version:2,mode:'stateless'});
 p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));p.ctx.get('llm').stream=r=>adapter.stream(r);
 const message=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
 a.followup(message('FIRST'));await ready;await new Promise(r=>setTimeout(r,20));const receipt=l.receive('letter',Buffer.from('letter'),{sender:'fixture'});
 await runtime.enqueue(receipt,a,()=>message('LIVE_WIRE_INPUT'),'a2a');await inputs.work.get(a);
 const deadline=Date.now()+2000;while(inputs.row(receipt.id)?.state!=='unknown'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(inputs.row(receipt.id)?.state,'unknown');assert.equal(sent,1);
 streamRes.write(JSON.stringify({type:'text',text:'wire response'})+'\n');streamRes.end(JSON.stringify({type:'done'})+'\n');await a.whenIdle();await runtime.observe(a.session);
 assert.equal(l.get(receipt.id).finished_at,null);assert.equal(l.get(receipt.id).outcome,null);assert.equal(inputs.row(receipt.id).state,'unknown');assert.equal(l.get(receipt.id).blocked,'sdk_input_unknown');await inputs.forward(a,receipt.id);assert.equal(sent,1,'unknown must not replay');assert.equal(control.requests.size,0);
 console.log('PASS '+'casunknown'+' unknown held, no completion or replay');
}finally{inputs?.dispose();streamRes?.destroy();leaseClose?.();server?.closeAllConnections();await p?.ctx.fiber.dispose();l?.close();await new Promise(r=>server?.close(r));fs.rmSync(root,{recursive:true,force:true})}
