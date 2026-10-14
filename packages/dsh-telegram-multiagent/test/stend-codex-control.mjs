// RU: Изолированный стенд stend-codex-control.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-codex-control.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.

import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {pathToFileURL} from 'node:url';
import {MessageReceipts,mailEnvelope} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';import {podnyatPlatformu02} from './platforma-02.mjs';
const runtimeModule=await import('../src/receipt-runtime.js');
assert.equal(typeof runtimeModule.CodexTaskControl,'function','receiver must connect typed controls to registered gateway requests');
const {CodexTaskControl}=runtimeModule;

const gateway=process.env.GATEWAY_CANDIDATE;
if(!gateway){console.error('СЛЕПОТА: задайте GATEWAY_CANDIDATE для реального исходника шлюза');process.exit(2);}
const controlFile=path.join(gateway,'task-control.mjs');
try { fs.accessSync(controlFile,fs.constants.R_OK); }
catch (error) {
 if (error.code==='ENOENT') {
  console.error(`КРАСНЫЙ: шлюз ${controlFile}: нет обязательного файла (ENOENT)`);
  process.exit(1);
 }
 if (!['EACCES','EPERM'].includes(error.code)) throw error;
 console.error(`СЛЕПОТА: шлюз ${controlFile}: нет доступа под ${os.userInfo().username} (uid ${process.geteuid()}) (${error.code})`);
 process.exit(2);
}
console.log('шлюз стенда:',gateway);
const {TaskControlRouter}=await import(pathToFileURL(path.join(gateway,'task-control.mjs')));
const {progonAppServer}=await import(pathToFileURL(path.join(gateway,'codex-app-server.mjs')));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-control-'));const {sozdatAgenta}=await podnyatPlatformu02({root:path.join(dir,'platform')});
const router=new TaskControlRouter();const server=http.createServer((req,res)=>router.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const baseURL='http://127.0.0.1:'+server.address().port;
let n=0;const passed=[];async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function fx(){
 const l=new MessageReceipts(path.join(dir,'ledger-'+(++n)));const native=await sozdatAgenta('codex-'+n);const agent={session:native.session,inbox:native.inbox,status:'running'};const rt=new ReceiptRuntime(l,{flush:async()=>true},()=>{});const uuid=l.protocolIdentity();const a=l.receive('A',Buffer.from('A'));l.db.prepare('INSERT INTO decision_index VALUES(?,?,?)').run('workertwo','A',a.id);l.prepare(a.id,()=>({id:'msg-'+n,role:'user',content:[{type:'text',text:'A'}]}),agent.session,'a2a');await l.queue(a.id,{contains:id=>rt.contains(agent.session,id),send:m=>agent.inbox.append('next-turn',m),flush:async()=>true});agent.session.append('turn/start',{turn:1});agent.inbox.claim('next-turn',1);await rt.observe(agent.session);
 const service=new CodexTaskControl(l,'workertwo');const lease=service.attach(agent,baseURL);assert.ok(lease);
 let notify,end;const dead=new Promise(r=>end=r);let resolveAck;const calls=[];let ackMode='ok';
 const client={slushat:f=>notify=f,umer:dead,uvedomit(){},async zakryt(){end({code:0});},async zapros(method,params){calls.push({method,params});if(method==='thread/start')return {thread:{id:'thread-'+n}};if(method==='turn/start')return {turn:{id:'turn-'+n}};if(method==='turn/steer'){if(ackMode==='wait')return new Promise(r=>resolveAck=r);if(ackMode==='error')throw Error('rpc refused');return {turnId:'turn-'+n};}return {};}};
 let registered=false;const run=(async()=>{for await(const e of progonAppServer({klientImpl:()=>client,log(){},zapros:'A',registerTaskControl:handler=>{registered=true;return router.register(lease.descriptor,handler);}})){} })();while(!registered)await new Promise(r=>setImmediate(r));
 function receive(id='B'){const raw=Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-control/1',op:'cancel',delivery_id:id,recipient:{id:'workertwo',ledger_uuid:uuid},target:{decision_id:'A',recipient:'workertwo',ledger_uuid:uuid}})+'\nОтмена A');const e=mailEnvelope(raw);return {r:l.receive(id,raw,{logicalKey:e.logicalKey}),e};}
 function call(b){rt.taskControlAdapter=service.adapter();return rt.acceptTaskControl(b.r.id,b.e.protocol,'workertwo',agent,{authorized:true});}
 return {l,a,agent,service,lease,calls,receive,call,mode:m=>ackMode=m,resolve:()=>resolveAck?.({turnId:'turn-'+n}),async finish(){notify('turn/completed',{threadId:'thread-'+n,turn:{id:'turn-'+n,status:'completed'}});await run;lease.close();l.close();}};
}
try{
 await test('typed B reaches current Codex turn; durable evidence, model response unknown',async()=>{const f=await fx();try{const before=f.l.get(f.a.id);const b=f.receive();assert.equal((await f.call(b)).state,'adapter_accepted');assert.deepEqual(f.l.get(f.a.id),before);const row=f.l.db.prepare('select * from task_controls where receipt_id=?').get(b.r.id);const evidence=JSON.parse(row.adapter_evidence_json);assert.match(evidence.codex.generation,/\S/);assert.match(evidence.codex.turn_id,/turn-/);assert.equal(evidence.model_response,'unknown');assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,1);await f.call(b);assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,1);}finally{await f.finish();}});
 await test('ambiguous simultaneous requests refuse rather than pick latest',async()=>{const f=await fx();const other=f.service.attach(f.agent,baseURL);try{assert.notEqual((await f.call(f.receive())).state,'adapter_accepted');assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,0);}finally{other.close();await f.finish();}});
 await test('wrong platform generation never reaches RPC',async()=>{const f=await fx();try{const p={binding:{...f.lease.descriptor.binding,generation:'wrong',control_id:'B',target_receipt:'A'},op:'cancel',body:'cancel'};assert.equal((await f.service.adapter()(p)).accepted,false);assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,0);}finally{await f.finish();}});
 await test('unknown credential and altered session refused at gateway',async()=>{const f=await fx();try{for(const wrong of ['ticket','session']){const packet={binding:{...f.lease.descriptor.binding,control_id:'B',target_receipt:'A'},op:'cancel',body:'cancel'};if(wrong==='session')packet.binding.session_id='other';const res=await fetch(baseURL+'/v1/task-control',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+(wrong==='ticket'?'wrong':f.lease.descriptor.ticket)},body:JSON.stringify(packet)});assert.equal((await res.json()).accepted,false);}assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,0);}finally{await f.finish();}});
 await test('no ACK before RPC response; session changed while waiting is unknown',async()=>{const f=await fx();try{f.mode('wait');const b=f.receive();const pending=f.call(b);while(!f.calls.some(c=>c.method==='turn/steer'))await new Promise(r=>setImmediate(r));assert.equal(f.l.db.prepare('select state from task_controls where receipt_id=?').get(b.r.id).state,'dispatching');f.agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});f.resolve();assert.equal((await pending).state,'adapter_unknown');}finally{await f.finish();}});
 await test('loopback only and closed request has no route',async()=>{const f=await fx();try{assert.throws(()=>f.service.attach(f.agent,'https://example.com'));f.lease.close();assert.equal(f.service.adapter(),undefined);}finally{await f.finish();}});
}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
console.log('TOTAL',passed.length);
